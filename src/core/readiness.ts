/**
 * 就绪状态唯一判定源（L 层，UX_IA_GUIDED_FLOW_DESIGN_2026-10-07.md §3.3）
 *
 * 存在的理由：模型 / 世界书 / 文档检索 / 语音这些依赖此前只写在代码里，
 * 界面各自零散判断，容易出现"面板说没配、toast 说配了、按钮却禁用"。
 * 所有展示面（就绪条、前置条件横幅、关联面板）只能读本模块，不得自行判断。
 *
 * 关键约束（§四 负向对照）：
 * - 主密码锁定态必须判为 'locked'，不得复用"未配置模型"的说法（D-10 的误报路径）；
 *   复用 checkSendBlock()（stores/chat-generation.ts:593-600）而不是重新推导。
 * - 状态一律读真实数据（store / 文档分块 / 开关值），不读"用户是否看过页面"。
 */
import { computed, type ComputedRef } from 'vue';
import { useCharacterStore } from '@/stores/character';
import { useSettingsStore } from '@/stores/settings';
import { useDataBankStore } from '@/stores/data-bank';
import { useChatStore } from '@/stores/chat';
import { collectLorebooksForCharacter } from '@/stores/chat-context';
import { vectorRagEnabled } from '@/core/dual-channel-runtime';
import type { MessageKey } from '@/i18n';

export type ReadinessState = 'ready' | 'attention' | 'locked' | 'n-a';

export type ReadinessChipId = 'model' | 'worldbook' | 'documents' | 'voice' | 'status';

export interface ReadinessJump {
  name: string;
  query?: Record<string, string>;
  params?: Record<string, string>;
}

export interface ReadinessChip {
  id: ReadinessChipId;
  state: ReadinessState;
  /** 一句话原因（仅非 ready 时有值），键在双语 locales 里 */
  reasonKey: MessageKey | null;
  labelKey: MessageKey;
  /** 需要用户去处理时给出的跳转目标；ready / n-a 时为 null */
  jump: ReadinessJump | null;
  dataRelJump: string;
}

/**
 * 模型芯片的状态判定（纯函数，便于脱离 WebCrypto 单测锁定态）
 *
 * locked 优先于"未配置"：锁定时 activeProfile 会返回 null（App.vue:170-178），
 * 若直接按存在性判定就会把"锁住了"误报成"没配过"（D-10 的实际成因）。
 */
export function modelReadiness(opts: {
  locked: boolean;
  hasProfile: boolean;
  block: 'locked' | 'no-profile' | null;
}): ReadinessState {
  if (opts.locked) return 'locked';
  if (!opts.hasProfile) return 'attention';
  return opts.block === null ? 'ready' : 'attention';
}

/** 就绪条：单聊 / 群聊页头的五个芯片 */
export function useReadinessChips(): ComputedRef<ReadinessChip[]> {
  const characterStore = useCharacterStore();
  const settings = useSettingsStore();
  const dataBank = useDataBankStore();
  const chat = useChatStore();

  return computed(() => {
    const char = characterStore.currentCharacter;
    const characterId = char?.id ?? '';

    // ── 模型 ──
    // 两个事实分开读：Profile 是否存在（可发送的前提）与是否处于锁定态（D-10 的误报源头：
    // chat-generation.ts:1001-1003 在 chatManager 为 null 时统一写"未配置 API Profile"）。
    const locked = settings.hasMasterPassword && !settings.isUnlocked;
    const hasProfile = !!settings.activeProfile;
    const block = chat.checkSendBlock();
    const modelState = modelReadiness({ locked, hasProfile, block });
    const modelChip: ReadinessChip = {
      id: 'model',
      state: modelState,
      reasonKey: locked ? 'readiness.reasonLocked' : hasProfile && block === null ? null : 'readiness.reasonNoProfile',
      labelKey: 'readiness.model',
      jump: modelState === 'ready' ? null : { name: 'settings', query: { cat: 'model' } },
      dataRelJump: 'readiness-model',
    };

    // ── 世界书（含全局书的真实生效集合） ──
    const lorebooks = characterId ? collectLorebooksForCharacter(characterId) : [];
    const bound = char?.boundWorldBookIds?.length ?? 0;
    const worldbookChip: ReadinessChip = {
      id: 'worldbook',
      state: lorebooks.length > 0 ? 'ready' : 'attention',
      reasonKey: lorebooks.length > 0 ? null : 'readiness.reasonNoWorldbook',
      labelKey: 'readiness.worldbook',
      jump: lorebooks.length > 0 ? { name: 'worldbook' } : { name: 'worldbook' },
      dataRelJump: 'readiness-worldbook',
    };

    // ── 文档检索（关键词通道始终可用；向量通道另有两个前提） ──
    const docs = dataBank.documents.filter(
      (d) => d.scope === 'global' || (characterId !== '' && d.scope === 'character' && d.characterId === characterId)
    );
    const documentsChip: ReadinessChip = {
      id: 'documents',
      state: docs.length === 0 ? 'n-a' : vectorRagEnabled.value && (bound > 0 || lorebooks.length > 0) ? 'ready' : 'attention',
      reasonKey:
        docs.length === 0
          ? 'readiness.reasonNoDocuments'
          : !vectorRagEnabled.value
            ? 'readiness.reasonChannelOff'
            : lorebooks.length === 0
              ? 'readiness.reasonStaticNeedsBinding'
              : null,
      labelKey: 'readiness.documents',
      jump: docs.length === 0 ? { name: 'databank' } : { name: 'databank' },
      dataRelJump: 'readiness-documents',
    };

    // ── 语音 ──
    const ttsOn = settings.ttsConfig.enabled === true;
    const voiceChip: ReadinessChip = {
      id: 'voice',
      state: ttsOn ? 'ready' : 'n-a',
      reasonKey: ttsOn ? null : 'readiness.reasonTtsOff',
      labelKey: 'readiness.voice',
      jump: { name: 'settings', query: { cat: 'extension' } },
      dataRelJump: 'readiness-voice',
    };

    // ── 状态指令 ──
    const statusOn = !!(char?.statusInstruction && String(char.statusInstruction).trim());
    const statusChip: ReadinessChip = {
      id: 'status',
      state: statusOn ? 'ready' : 'n-a',
      reasonKey: null,
      labelKey: 'readiness.status',
      jump: characterId ? { name: 'character-edit', params: { id: characterId } } : { name: 'character-list' },
      dataRelJump: 'readiness-status',
    };

    return [modelChip, worldbookChip, documentsChip, voiceChip, statusChip];
  });
}

export interface PrereqRow {
  id: string;
  textKey: MessageKey;
  done: boolean;
  jump: ReadinessJump | null;
  actionKey: MessageKey;
}

/**
 * 数据银行的前置条件横幅：把"上传了却没被检索"的两条隐藏前提摆到页面上。
 * 证据链：dual-channel-runtime.ts:44（开关默认关）与 chat-generation.ts:690-692
 * （静态通道只在有世界书时才查询）。
 */
export function useDataBankPrereqs(): ComputedRef<PrereqRow[]> {
  const dataBank = useDataBankStore();
  const characterStore = useCharacterStore();

  return computed(() => {
    const char = characterStore.currentCharacter;
    const lorebooks = char ? collectLorebooksForCharacter(char.id) : [];
    return [
      {
        id: 'has-documents',
        textKey: 'prereq.databankDocuments',
        done: dataBank.documents.length > 0,
        jump: null,
        actionKey: 'prereq.actionUpload',
      },
      {
        id: 'static-channel',
        textKey: 'prereq.databankStaticChannel',
        done: lorebooks.length > 0,
        jump: { name: 'character-list' },
        actionKey: 'prereq.actionBindWorldbook',
      },
      {
        id: 'vector-switch',
        textKey: 'prereq.databankVectorSwitch',
        done: vectorRagEnabled.value,
        jump: { name: 'settings', query: { cat: 'model' } },
        actionKey: 'prereq.actionOpenVector',
      },
    ];
  });
}
