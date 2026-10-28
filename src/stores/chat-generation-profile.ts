/**
 * chat-generation-profile — API Profile → ChatManager 装配（R4-4 拆分）
 *
 * - setApiProfile / applyApiProfile：重建 ChatManager（生成中则暂存到 pendingProfile）
 * - buildCharacterOverrides：角色级采样 / 思考强度覆盖（逐档回落，不写 undefined）
 * - applyRuntimeLlmControls：每轮发送前把全局偏好（思维链 / 采样 / 上下文 / Preset）下传
 * - flushPendingProfile：生成收尾时应用暂存 Profile
 *
 * 工厂函数：pendingProfile / 全局上下文缓存是实例状态；ChatManager 实体仍归宿主，
 * 通过 get/set 注入，这样宿主 sendMessage 里的用法一行都不用改。
 */
import { t } from '@/i18n';
import type { Ref } from 'vue';
import type { UICharacter, ApiProfile } from '@/types';
import { DEFAULT_MAX_CONTEXT_TOKENS, DEFAULT_RESERVED_TOKENS } from '@/types';
import { createApiClient } from '../api';
import { resolveReasoningCapability } from '../api/reasoning-capability';
import type { ReasoningEffort } from '../api/types';
import { ChatManager, type ChatManagerConfig } from '../services/chat-manager';
import { executeBuiltinTool, getBuiltinToolDefinitions } from '@/core/tool-registry';
import { loadGlobalVariables, setGlobalVariable } from '@/core/variable-store';
import { OptimizationPipeline, loadOptimizationConfig } from '@/core/optimization-pipeline';
import { resolveContextWindow } from '@core/token-budget';
import {
  PRESET_SCHEMA_VERSION,
  presetSamplingOverrides,
  resolveEffectivePreset,
  type PresetId,
} from '@/core/creation-preset';
import { buildSamplingConfigPatch } from './chat-generation-helpers';
import { useDataBankStore } from './data-bank';
import type { useChatMemoryStore } from './chat-memory';
import type { Chat } from '../storage/types';

export type ProfileOptions = Partial<
  Pick<ChatManagerConfig, 'userName' | 'systemPrompt' | 'maxContextTokens' | 'reservedTokens'>
>;

export interface ProfileDeps {
  activeChatId: Ref<string | null>;
  sessions: Ref<Chat[]>;
  activePresetInfo: Ref<{ presetId: PresetId; presetVersion: number; at: number } | null>;
  memoryStore: ReturnType<typeof useChatMemoryStore>;
  getChatManager: () => ChatManager | null;
  setChatManager: (manager: ChatManager | null) => void;
}

export interface ProfileOps {
  setApiProfile: (profile: ApiProfile | null, options?: ProfileOptions) => void;
  applyApiProfile: (profile: ApiProfile | null, options?: ProfileOptions) => void;
  buildCharacterOverrides: (character: UICharacter) => NonNullable<
    import('../services/chat-manager').SendMessageParams['overrides']
  >;
  applyRuntimeLlmControls: (character?: UICharacter) => Promise<void>;
  flushPendingProfile: () => void;
}

export function createProfileOps(deps: ProfileDeps): ProfileOps {
  const { activeChatId, sessions, activePresetInfo, memoryStore } = deps;

  /**
   * 设置当前激活的 API Profile
   * 会在内部重建 ChatManager（保留正在进行的生成直到完成）
   *
   * @param profile API Profile（来自 settings store），传 null 表示断开
   * @param options 可选配置（如覆盖 userName / maxContextTokens）
   */
  function setApiProfile(
    profile: ApiProfile | null,
    options?: Partial<Pick<ChatManagerConfig, 'userName' | 'systemPrompt' | 'maxContextTokens' | 'reservedTokens'>>
  ): void {
    // 若有进行中的生成，暂存新 profile，任务结束后自动应用
    if (deps.getChatManager()?.isGenerating) {
      pendingProfile = { profile, options };
      return;
    }
    pendingProfile = null;
    applyApiProfile(profile, options);
  }

  /**
   * 实际重建 ChatManager（不检查生成状态，由调用方保证时机）
   */
  function applyApiProfile(
    profile: ApiProfile | null,
    options?: Partial<Pick<ChatManagerConfig, 'userName' | 'systemPrompt' | 'maxContextTokens' | 'reservedTokens'>>
  ): void {
    if (!profile) {
      deps.setChatManager(null);
      activeProfileForCapability = null;
      return;
    }
    activeProfileForCapability = profile;

    // 记录本轮 options 是否显式指定上下文长度（供 applyRuntimeLlmControls 判断是否用全局设置覆盖）
    explicitMaxContextTokens = options?.maxContextTokens;
    explicitReservedTokens = options?.reservedTokens;

    const apiClient = createApiClient(profile);
    // P0-2：Profile 的思考强度能力（决定是否下发；'none' 时静默丢弃）
    const capability = resolveReasoningCapability(profile);
    const config: ChatManagerConfig = {
      apiClient,
      model: profile.model,
      userName: options?.userName ?? 'User',
      systemPrompt: options?.systemPrompt ?? '',
      // 上下文长度：模型设置里填的最大上下文优先，其次显式 options，最后全局设置缓存。
      // 这是用户唯一需要设置的模型参数；输出预算与压缩都由它推导。
      maxContextTokens: resolveContextWindow(
        profile,
        options?.maxContextTokens ?? globalMaxContextTokens
      ),
      reservedTokens: options?.reservedTokens ?? globalReservedTokens,
      // P0-3：Profile 级采样参数（角色级显式设置时在 overrides 里覆盖）
      ...buildSamplingConfigPatch(profile.sampling),
      // P0-2：Profile 级默认思考强度（仅 capability 可用时才注入）
      ...(capability !== 'none' && profile.reasoningEffort
        ? { reasoningEffort: profile.reasoningEffort }
        : {}),
      // T-02: 内置工具装配 —— get_var/set_var 直连全局变量,
      // retrieve_document 惰性调用 data-bank store(global 作用域);
      // ponytail: search_lorebook 需角色级 lorebook 上下文(chat-context 持有),
      // 暂不注入(工具返回"不可用"提示,模型会向用户说明),后续随 chat 会话上下文接线
      tools: getBuiltinToolDefinitions(),
      // E-04 二期: 嵌入优化管线(默认关闭,由设置页开关;fail-open 不影响主链路)
      optimization: new OptimizationPipeline(loadOptimizationConfig()),
      // E-01/E-02: L0/L2 运行时依赖（S2 起由 chat-memory store 持有，与记忆域共享同一实例）
      l0l2: memoryStore.getL0L2Deps(),
      executeTool: async (call) =>
        executeBuiltinTool(call, {
          getVariable: (name) => loadGlobalVariables()[name],
          setVariable: setGlobalVariable,
          retrieveDocuments: async (query, limit) => {
            try {
              const docs = useDataBankStore().retrieveForChat([query], 'global');
              const limited = limit && limit > 0 ? docs.slice(0, limit) : docs;
              return limited.length === 0
                ? t('chat.dbNoContent')
                : limited
                    .map((d) => `【${d.documentName}】${d.chunk.content}`)
                    .join('\n\n');
            } catch {
              return t('chat.dbUnavailable');
            }
          },
        }),
    };
    deps.setChatManager(new ChatManager(config));
  }

  /**
   * P0-2/P0-3：构造本轮请求的 overrides（角色级覆盖）
   *
   * 与既有 temperature 不同，maxTokens 与新参数在**每一档都是可选**的：
   * 角色级未设置时不写该键，从而让 Profile 级 / 全局默认值生效（逐档回落）。
   */
  function buildCharacterOverrides(
    character: UICharacter
  ): NonNullable<import('../services/chat-manager').SendMessageParams['overrides']> {
    const overrides: NonNullable<import('../services/chat-manager').SendMessageParams['overrides']> = {
      temperature: character.temperature,
      ...buildSamplingConfigPatch(character.sampling),
    };
    // 输出上限不再作为旋钮（角色级/Profile 级都不再写 maxTokens）：
    // 由 chat-manager 按"模型最大上下文 − 预留 − 输入实测"自动推导。
    // P0-2：capability 为 none 时静默丢弃角色级思考强度（不报错、不打断对话）
    const capability = activeProfileForCapability
      ? resolveReasoningCapability(activeProfileForCapability)
      : 'none';
    const effort: ReasoningEffort | null | undefined = character.reasoningEffort;
    if (capability !== 'none' && (effort === 'low' || effort === 'medium' || effort === 'high')) {
      overrides.reasoningEffort = effort;
    }
    return overrides;
  }

  /**
   * P0-1/P0-3：每轮发送前同步「全局偏好」到 ChatManager
   *
   * - 思维链：settings.thinkingConfig.stripFromHistory → includeThinkingInHistory
   * - 采样：全局 samplingDefaults 仅在 Profile 级也未设置时兜底（最低优先级）
   *
   * settings store 在此处惰性导入（与既有 maybeGenerateRandomEvent 一致，避免循环依赖）。
   *
   * EXP-01：可选传入当前角色 —— 角色级创作模式绑定（boundPresetId）优先于全局设置。
   */
  async function applyRuntimeLlmControls(character?: UICharacter): Promise<void> {
    try {
      const { useSettingsStore } = await import('./settings');
      const settingsStore = useSettingsStore();
      const patch: Partial<ChatManagerConfig> = {};

      // P0-1：剥离开关（默认 true = 剥离 → includeThinkingInHistory = false）
      const strip = settingsStore.thinkingConfig?.stripFromHistory !== false;
      patch.includeThinkingInHistory = !strip;

      // P1：提示词注入开关（默认 false = 不要求模型产出状态块；解析/渲染与开关无关）
      // 角色级 ext.statusInstruction 由 chat-manager 在本轮请求里再覆盖（'on'/'off' 优先）
      patch.statusInstructionEnabled = settingsStore.statusHudConfig?.enabled === true;

      // 旁白人称（我 / 你）：每轮从设置带下去。切换只影响**下一条**回复的提示词，
      // 已生成的历史里写的是当时的视角，不做任何回写。
      patch.narrationPerspective = settingsStore.narrationPerspective;

      // 上下文长度：模型设置里填的"最大上下文"优先，否则用全局设置。
      // （此前这里无条件写全局值，会把模型级的上下文覆盖掉）
      globalMaxContextTokens = settingsStore.maxContextTokens;
      globalReservedTokens = settingsStore.reservedTokens;
      if (explicitMaxContextTokens === undefined) {
        patch.maxContextTokens = resolveContextWindow(
          activeProfileForCapability,
          settingsStore.maxContextTokens
        );
      }
      if (explicitReservedTokens === undefined) patch.reservedTokens = settingsStore.reservedTokens;

      // 摘要接线（2026-09-21）：把当前会话的摘要传给 chat-manager，用于下一轮注入
      //
      // 摘要由 maybeGenerateSummary 在上一轮回复完成后异步写入 sessions，
      // 此处**每轮读取最新值** —— 不传的话摘要即使生成了也不会被注入。
      const chatId = activeChatId.value;
      if (chatId) {
        const current = sessions.value.find((s) => s.id === chatId);
        patch.existingSummary = current?.summary ?? null;
      }

      // P0-3：全局采样默认值（最低优先级，仅在 config 该字段为空时补齐）
      const defaults = settingsStore.samplingDefaults;
      if (defaults) {
        const cfg = deps.getChatManager()?.currentConfig;
        if (cfg) {
          if (cfg.topP === undefined && typeof defaults.topP === 'number') patch.topP = defaults.topP;
          if (
            cfg.presencePenalty === undefined &&
            typeof defaults.presencePenalty === 'number'
          ) {
            patch.presencePenalty = defaults.presencePenalty;
          }
          if (
            cfg.frequencyPenalty === undefined &&
            typeof defaults.frequencyPenalty === 'number'
          ) {
            patch.frequencyPenalty = defaults.frequencyPenalty;
          }
        }
      }

      // MODEL-03：创作模式（Preset）作为**最低优先级**兜底。
      // 仅在 config 对应字段仍为空时补齐 —— 角色级 / Profile 级 / 全局采样默认值优先。
      // 同时把生效的 preset 与版本记入 activePresetInfo，满足"Preset 变更可追溯"。
      // EXP-01：角色级绑定（boundPresetId）优先于全局；未绑定 / 非法值回落全局。
      const presetId = resolveEffectivePreset(
        character?.boundPresetId,
        settingsStore.creationPreset
      );
      activePresetInfo.value = { presetId, presetVersion: PRESET_SCHEMA_VERSION, at: Date.now() };
      const presetSampling = presetSamplingOverrides(presetId);
      if (presetSampling) {
        const cfg = deps.getChatManager()?.currentConfig;
        if (cfg) {
          if (cfg.topP === undefined && typeof presetSampling.topP === 'number') patch.topP = presetSampling.topP;
          if (cfg.presencePenalty === undefined && typeof presetSampling.presencePenalty === 'number') {
            patch.presencePenalty = presetSampling.presencePenalty;
          }
          if (cfg.frequencyPenalty === undefined && typeof presetSampling.frequencyPenalty === 'number') {
            patch.frequencyPenalty = presetSampling.frequencyPenalty;
          }
        }
        // 输出约束：Preset 的 statusInstruction 仅供参考展示，**不**在运行时覆盖
        // 用户显式的 statusHudConfig（该开关是显式布尔值而非"空档"，按"高级用户覆盖"
        // 原则，用户设置优先）。UI 可通过 resolvePresetParams 展示该建议值。
      }

      deps.getChatManager()?.updateConfig(patch);
    } catch {
      /* fail-open：全局偏好读取失败不影响主链路 */
    }
  }

  /**
   * 生成任务收尾时应用暂存的 Profile（sendMessage / regenerateMessage 的 finally 调用）
   */
  function flushPendingProfile(): void {
    if (!pendingProfile) return;
    const pending = pendingProfile;
    pendingProfile = null;
    applyApiProfile(pending.profile, pending.options);
  }

  // 生成中切换的 API Profile 暂存，任务结束后应用（修复：原实现直接丢弃）
  let pendingProfile: {
    profile: ApiProfile | null;
    options?: Partial<Pick<ChatManagerConfig, 'userName' | 'systemPrompt' | 'maxContextTokens' | 'reservedTokens'>>;
  } | null = null;
  /**
   * P0-2：当前生效 Profile（用于思考强度能力判定）
   * capability === 'none' 时角色级的 reasoningEffort 会被静默丢弃（不报错、不打断对话）
   */
  let activeProfileForCapability: ApiProfile | null = null;

  /**
   * 全局上下文长度缓存（maxContextTokens / reservedTokens）
   *
   * applyApiProfile 是**同步**函数，无法 await 惰性导入 settings store（避免循环依赖），
   * 故由每轮发送前的 applyRuntimeLlmControls（异步）从 settings 同步到这两个缓存，
   * 供 applyApiProfile 在同步构建 ChatManager 时读取。
   */
  let globalMaxContextTokens = DEFAULT_MAX_CONTEXT_TOKENS;
  let globalReservedTokens = DEFAULT_RESERVED_TOKENS;

  /**
   * 本轮 ChatManager 的上下文长度是否由调用方**显式** options 指定。
   * undefined = 未显式指定 → 允许全局设置（settings）生效；
   * 否则显式传入优先于全局设置（优先级：options > settings > 默认）。
   */
  let explicitMaxContextTokens: number | undefined;
  let explicitReservedTokens: number | undefined;
  return {
    setApiProfile,
    applyApiProfile,
    buildCharacterOverrides,
    applyRuntimeLlmControls,
    flushPendingProfile,
  };
}

