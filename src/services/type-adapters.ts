import type { CharacterCard, ChatMessage, CharacterExt } from '@core/character-card';
import type { ReasoningEffort } from '@api/types';
import type { StatusSchema } from '@core/status-schema';
import { normalizeStatusSchema } from '@core/status-schema';
import { PRESET_IDS, type PresetId } from '@core/creation-preset';
import type { UICharacter, UIMessage, WorldEntry, SamplingOverrides } from '@/types';
import { t } from '@/i18n';

/**
 * 类型适配层 (D3)
 *
 * 桥接 UI 层类型（UICharacter / UIMessage）与核心层类型（CharacterCard / ChatMessage）。
 * UI 层类型贴近设计稿（含生成参数、Token 预算、旁白等展示字段），
 * 核心层类型遵循 SillyTavern V2 角色卡规范（含 personality/scenario/exampleMessages 等）。
 *
 * 转换原则：
 * - 不可逆字段（如 UI 的 avatarType/gradient）存入 CharacterCard.ext 命名空间（迭代33 起）
 * - 核心层缺失的字段（如 personality/scenario）使用合理默认值
 * - 旁白（narration）不进入 ChatMessage.content，由 prompt-builder 单独处理（Phase E 实现）
 */

// ── UICharacter ↔ CharacterCard ──

/**
 * UICharacter → CharacterCard
 * 用于将 UI 层角色卡转换为核心层格式，以便调用 prompt-builder / 持久化
 */
export function uiCharToCard(ui: UICharacter): CharacterCard {
  const now = new Date().toISOString();
  // P1：落盘前先归一化（脏 schema 不落盘，读取侧再校验一次做双保险）
  const statusSchema = normalizeStatusSchema(ui.statusSchema);
  const statusInstruction =
    ui.statusInstruction === 'on' || ui.statusInstruction === 'off' ? ui.statusInstruction : null;
  // T-16：未设置的 maxTokens 不落盘（undefined = 回落 Profile 级，绝不用 0 表示未设置）
  const maxTokens = numOrUndefined(ui.maxTokens);

  return {
    id: ui.id,
    name: ui.name,
    avatar: ui.avatar,
    description: ui.description,
    // 核心层独立字段：UI 层编辑时透传原始值，避免合并进 description 后再次保存丢失（候选3）
    personality: ui.personality ?? '',
    scenario: ui.scenario ?? '',
    firstMessage: '', // UI 层首条消息存在 messages[0]
    alternateGreetings: [],
    exampleMessages: '',
    // 作者笔记映射为 characterNote
    characterNote: ui.authorNote
      ? {
          text: ui.authorNote,
          depth: ui.authorDepth,
          role: 'system',
        }
      : null,
    talkativeness: 50,
    tags: [...ui.tags],
    favorite: ui.favorite,
    version: '1.0',
    createdAt: now,
    updatedAt: now,
    // F01.6 角色属性透传（深拷贝避免引用共享）
    ...(ui.attributes ? { attributes: structuredClone(ui.attributes) } : {}),
    // 迭代33：UI 扩展字段收进 ext 命名空间（替代顶层索引签名透传）
    ext: {
      model: ui.model,
      ...(ui.profileId !== undefined && ui.profileId !== null ? { profileId: ui.profileId } : {}),
      temperature: ui.temperature,
      ...(maxTokens !== undefined ? { maxTokens } : {}),
      avatarType: ui.avatarType,
      ...(ui.gradientFrom ? { gradientFrom: ui.gradientFrom } : {}),
      ...(ui.gradientTo ? { gradientTo: ui.gradientTo } : {}),
      ...(ui.storyId !== undefined ? { storyId: ui.storyId } : {}),
      ...(ui.boundWorldBookIds ? { boundWorldBookIds: [...ui.boundWorldBookIds] } : {}),
      // P0-2：角色级思考强度（undefined/null = 跟随 Profile，不落盘避免误判）
      ...(ui.reasoningEffort ? { reasoningEffort: ui.reasoningEffort } : {}),
      // P0-3：角色级采样参数（深拷贝，且剔除 null 字段保持"未设置"语义）
      ...(ui.sampling ? { sampling: normalizeSampling(ui.sampling) } : {}),
      // P1：角色状态 schema（校验后深拷贝；全非法时不落盘，避免空对象污染 schema）
      ...(statusSchema ? { statusSchema } : {}),
      // P1：角色级状态指令（'on'/'off' 才落盘；null = 继承全局，保持"未设置"语义）
      ...(statusInstruction ? { statusInstruction } : {}),
      // EXP-01：角色级创作模式绑定（合法值才落盘；null = 跟随全局，保持"未绑定"语义）
      ...(ui.boundPresetId ? { boundPresetId: ui.boundPresetId } : {}),
    },
  };
}

/**
 * T-16：把「已设置」的数值收敛为 number，其余（null / undefined / NaN / 非数字）收敛为 undefined
 *
 * 未设置必须保持 undefined —— 落盘时省略该键、下发时不传该参数，
 * 从而让上一档（Profile 级 → 供应商默认）真正有机会生效。
 */
function numOrUndefined(v: unknown): number | undefined {
  // 0 / 负数不是合法的最大 token 数（合法区间 1~32768）→ 按未设置处理
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined;
}

/**
 * P0-3：归一化采样参数覆盖对象
 *
 * 规则：
 * - 丢弃 `null` / `undefined` / 非有限数值字段（保持"未设置 = 不传"语义）
 * - 全空时返回 undefined，避免落盘一个空对象污染 schema
 */
function normalizeSampling(
  raw: Partial<Record<'topP' | 'presencePenalty' | 'frequencyPenalty', number | null>>
): Record<string, number> | undefined {
  const out: Record<string, number> = {};
  for (const key of ['topP', 'presencePenalty', 'frequencyPenalty'] as const) {
    const v = raw[key];
    if (typeof v === 'number' && Number.isFinite(v)) {
      out[key] = v;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * P0-2：从 ext 读取角色级思考强度（非法值按"未设置"处理，fail-open）
 */
function readReasoningEffort(ext?: CharacterExt): ReasoningEffort | undefined {
  const v = ext?.reasoningEffort;
  return v === 'low' || v === 'medium' || v === 'high' ? v : undefined;
}

/**
 * P0-3：从 ext 读取角色级采样参数（逐字段校验，全空返回 undefined）
 */
function readSampling(ext?: CharacterExt): SamplingOverrides | undefined {
  const raw = ext?.sampling;
  if (!raw || typeof raw !== 'object') return undefined;
  const out: SamplingOverrides = {};
  for (const key of ['topP', 'presencePenalty', 'frequencyPenalty'] as const) {
    const v = (raw as Record<string, unknown>)[key];
    if (typeof v === 'number' && Number.isFinite(v)) {
      out[key] = v;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * P0-3：兼容旧格式（采样字段曾可能直接存顶层索引签名）
 */
function readLegacySampling(card: CharacterCard): SamplingOverrides | undefined {
  const raw = (card as Record<string, unknown>)['sampling'];
  if (!raw || typeof raw !== 'object') return undefined;
  return readSampling({ sampling: raw } as CharacterExt);
}

/**
 * P1：从角色卡读状态 schema（ext 优先 + 顶层 legacy 回退，与 storyId 同款）
 *
 * 迭代 33 前的旧数据把 UI 字段直接存顶层索引签名，因此必须双路读取，
 * 否则旧卡读出来会丢 schema（§0.3 G-2）。脏数据一律 fail-open 返回 null。
 */
function readStatusSchema(ext: CharacterExt | undefined, card: CharacterCard): StatusSchema | null {
  const raw = ext?.statusSchema ?? (card as Record<string, unknown>)['statusSchema'];
  return normalizeStatusSchema(raw) ?? null;
}

/**
 * P1：从角色卡读状态指令（ext 优先 + 顶层 legacy 回退；非法值按 null = 继承全局）
 */
function readStatusInstruction(
  ext: CharacterExt | undefined,
  card: CharacterCard
): 'on' | 'off' | null {
  const raw = ext?.statusInstruction ?? (card as Record<string, unknown>)['statusInstruction'];
  return raw === 'on' || raw === 'off' ? raw : null;
}

/**
 * EXP-01：从角色卡读创作模式绑定（ext 优先 + 顶层 legacy 回退）。
 * 非法值一律 → null（跟随全局设置），不静默改写为 balanced —— 覆盖层失效
 * 不应改变用户在全局显式选择的意图（与 resolveEffectivePreset 同一语义）。
 */
function readBoundPresetId(ext: CharacterExt | undefined, card: CharacterCard): PresetId | null {
  const raw = ext?.boundPresetId ?? (card as Record<string, unknown>)['boundPresetId'];
  return typeof raw === 'string' && (PRESET_IDS as readonly string[]).includes(raw)
    ? (raw as PresetId)
    : null;
}

/**
 * CharacterCard → UICharacter
 * 用于从核心层加载角色卡时转换回 UI 格式
 */
export function cardToUiChar(
  card: CharacterCard,
  overrides?: Partial<UICharacter>
): UICharacter {
  const ext = card.ext;

  // 兼容旧格式（迭代33 前）：这些字段曾直接存顶层索引签名，
  // 已持久化数据没有 ext，读取时回退到顶层（有则 ext 优先）
  const legacy = (k: string) => (card as Record<string, unknown>)[k];
  const storyId =
    ext?.storyId !== undefined
      ? ext.storyId
      : legacy('storyId') !== undefined
        ? (legacy('storyId') as string | null)
        : undefined;
  const boundWorldBookIds =
    ext?.boundWorldBookIds ?? (legacy('boundWorldBookIds') as string[] | undefined);

  const base: UICharacter = {
    id: card.id,
    name: card.name,
    avatar: card.avatar,
    avatarType: ext?.avatarType ?? (legacy('avatarType') as 'image' | 'gradient' | undefined) ?? (card.avatar ? 'image' : 'gradient'),
    gradientFrom: ext?.gradientFrom ?? (legacy('gradientFrom') as string | undefined) ?? 'var(--tk-cyan-500)',
    gradientTo: ext?.gradientTo ?? (legacy('gradientTo') as string | undefined) ?? 'var(--tk-cyan-700)',
    initial: card.name[0] || '?',
    lastActive: t('type.justNow'),
    favorite: card.favorite,
    tags: [...card.tags],
    // UI description 合并核心 description + personality + scenario
    description: [card.description, card.personality, card.scenario]
      .filter(Boolean)
      .join('\n\n'),
    // 核心层独立字段透传（候选3：使 card→ui→card round-trip 无损）
    personality: card.personality,
    scenario: card.scenario,
    model: ext?.model ?? (legacy('model') as string | undefined) ?? overrides?.model ?? 'gpt-4o',
    profileId: ext?.profileId ?? (legacy('profileId') as string | null | undefined) ?? (overrides?.profileId ?? null),
    conversations: overrides?.conversations ?? [],
    messages: overrides?.messages ?? [],
    authorNote: card.characterNote?.text ?? '',
    authorDepth: card.characterNote?.depth ?? 4,
    temperature: ext?.temperature ?? (legacy('temperature') as number | undefined) ?? overrides?.temperature ?? 1.0,
    /**
     * T-16：未设置时**不再兜底 4096**
     * 旧的硬兜底会让每个角色都携带一个"显式 4096"，从而无条件覆盖 Profile 级
     * maxTokens（死代码）。未设置即 undefined → 回落 Profile 级 → 不传。
     */
    maxTokens:
      numOrUndefined(ext?.maxTokens) ??
      numOrUndefined(legacy('maxTokens')) ??
      numOrUndefined(overrides?.maxTokens),
    worldEntries: overrides?.worldEntries ?? [],
    tokenBudget: overrides?.tokenBudget ?? {
      character: 0,
      worldInfo: 0,
      chatHistory: 0,
      remaining: 8192,
    },
    // F01.6 角色属性透传（深拷贝避免引用共享）
    ...(card.attributes ? { attributes: structuredClone(card.attributes) } : {}),
    // 迭代33：关联字段从 ext 恢复（未持久化时保持未设置语义）
    ...(storyId !== undefined ? { storyId } : {}),
    ...(boundWorldBookIds ? { boundWorldBookIds: [...boundWorldBookIds] } : {}),
    // P0-2：角色级思考强度（ext 优先；旧数据无此字段 → undefined = 跟随 Profile）
    reasoningEffort: readReasoningEffort(ext) ?? (legacy('reasoningEffort') as ReasoningEffort | null | undefined) ?? overrides?.reasoningEffort ?? null,
    // P0-3：角色级采样参数（ext 优先；无则 null = 全部跟随上层）
    sampling: readSampling(ext) ?? readLegacySampling(card) ?? overrides?.sampling ?? null,
    // P1：角色状态 schema / 状态指令（ext 优先 + 顶层 legacy 回退；脏数据 → null）
    statusSchema: readStatusSchema(ext, card),
    statusInstruction: readStatusInstruction(ext, card),
    // EXP-01：角色级创作模式绑定（ext 优先 + legacy 回退；非法/未绑 → null = 跟随全局）
    boundPresetId: readBoundPresetId(ext, card),
  };

  return { ...base, ...overrides };
}

// ── UIMessage ↔ ChatMessage ──

/**
 * UIMessage → ChatMessage
 * UI 时间戳（number）转 ISO 字符串，旁白不进入 content
 */
export function uiMsgToChatMsg(ui: UIMessage): ChatMessage {
  return {
    id: ui.id,
    role: ui.role,
    content: ui.content,
    timestamp:
      typeof ui.timestamp === 'number'
        ? new Date(ui.timestamp).toISOString()
        : ui.timestamp,
    swipes: [],
    swipeIndex: 0,
    // P0-1：思维链随消息一并持久化（仅非空字符串才写，避免污染旧数据 schema）
    ...(ui.thinking ? { thinking: ui.thinking } : {}),
    // P1：思考 token 落盘（仅已上报的正数才写；未上报不写 → 回读为 undefined → 不显示 0）
    ...(typeof ui.reasoningTokens === 'number' && ui.reasoningTokens > 0
      ? { reasoningTokens: ui.reasoningTokens }
      : {}),
    // P1：状态快照随消息持久化（与 thinking 同款；无状态时不写 → 旧数据零迁移）
    ...(ui.status ? { status: ui.status } : {}),
  };
}

/**
 * ChatMessage → UIMessage
 * system 角色消息过滤掉（不直接展示），ISO 时间戳转回 number
 *
 * 注意：ChatMessage.swipes / swipeIndex 在 UI 层不直接展示
 * （UI 层用 MessageBubble 内部的版本控制展示），
 * 转换时丢弃这两个字段。如需保留 swipes 用于重新生成场景，
 * 应使用 chat-manager 内部的 ChatMessage 流转，不经过 UI 转换。
 */
export function chatMsgToUiMsg(msg: ChatMessage): UIMessage | null {
  if (msg.role === 'system') return null;
  return {
    id: msg.id,
    role: msg.role as 'user' | 'assistant',
    content: msg.content,
    timestamp:
      typeof msg.timestamp === 'string'
        ? new Date(msg.timestamp).getTime()
        : msg.timestamp,
    // P0-1：思维链回读（旧数据无此字段 → undefined → 不渲染折叠块）
    ...(msg.thinking ? { thinking: msg.thinking } : {}),
    // P1：思考 token 回读（旧数据无此字段 → undefined → 不展示，绝不显示 0）
    ...(typeof msg.reasoningTokens === 'number' && msg.reasoningTokens > 0
      ? { reasoningTokens: msg.reasoningTokens }
      : {}),
    // P1：状态快照回读（旧数据无此字段 → undefined → 不渲染状态栏）
    ...(msg.status ? { status: msg.status } : {}),
  };
}

/**
 * 批量转换 UIMessage[] → ChatMessage[]
 */
export function uiMsgsToChatMsgs(messages: UIMessage[]): ChatMessage[] {
  return messages.map(uiMsgToChatMsg);
}

/**
 * 批量转换 ChatMessage[] → UIMessage[]，过滤 system 消息
 */
export function chatMsgsToUiMsgs(messages: ChatMessage[]): UIMessage[] {
  return messages
    .map(chatMsgToUiMsg)
    .filter((m): m is UIMessage => m !== null);
}

// ── WorldEntry 适配（核心层无对应类型，直接复用） ──

export function worldEntriesToStorage(
  entries: WorldEntry[]
): WorldEntry[] {
  return entries.map((e) => ({ ...e }));
}
