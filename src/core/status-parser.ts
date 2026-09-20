/**
 * P1 状态块解析器
 *
 * 职责：把模型输出里的 `<status>…</status>` 块从正文剥离并解析为结构化 `CharacterStatus`。
 *
 * 三条硬约束（改动前必读 docs/design/character-status-hud-增量设计.md）：
 * 1. **绝不因模型输出不规范而崩**：JSON → 按行（半角 `:` + 全角 `：`）→ 放弃，三级降级。
 * 2. **绝不丢内容**：未闭合残留归正文（`unclosedPolicy:'text'`）。
 * 3. **匹配只认英文结构化 key**：`normalizeKey` 不得加任何语言特判，
 *    中文 key 只能走角色卡的 `aliases`（用户数据）。
 *
 * 复用 P0 的 `ThinkingSplitter`（只换标签与策略）——零新增状态机，
 * 因此跨 chunk 标签撕裂 / UTF-8 代理对截断 / flush 幂等全部继承。
 */

import { ThinkingSplitter, parseThinkingComplete } from '@core/thinking-parser';
import { parseAiJson } from '@core/json-utils';
import { t, type MessageKey } from '@/i18n';
import {
  STATUS_FIELD_REGISTRY,
  STATUS_MAX_FIELDS,
  STATUS_VALUE_MAX_LEN,
  normalizeKey,
  findRegistryPreset,
  isStatusIconName,
  type CharacterStatus,
  type StatusEntry,
  type StatusFieldDef,
  type StatusFieldPreset,
  type StatusIconName,
  type StatusSchema,
  type StatusValueType,
} from '@core/status-schema';

/** 状态块开标签（与 P0 的 `<think>` 同构，不与 markdown 冲突） */
export const STATUS_OPEN_TAG = '<status>';
/** 状态块闭标签 */
export const STATUS_CLOSE_TAG = '</status>';

/**
 * 状态块标签常量（纯技术常量，英文，无需 i18n）
 *
 * `unclosedPolicy:'text'` —— 未闭合时残留**归正文**（而非归状态），
 * 见设计文档 §1.5 的"绝不丢内容"原则。
 */
export const STATUS_SPLITTER_OPTIONS = {
  openTag: STATUS_OPEN_TAG,
  closeTag: STATUS_CLOSE_TAG,
  unclosedPolicy: 'text',
} as const;

/** 一次性剥离结果（与 ThinkingParseResult 同构） */
export interface StatusParseResult {
  /** 已剥离状态块的正文 */
  content: string;
  /** 状态块原文（未解析，交给 parseStatusBlock） */
  statusRaw: string;
  /** 是否检测到状态块（标签存在但内容为空串时仍为 true） */
  hasStatus: boolean;
}

/** 从状态块里切出的原始键值对（尚未匹配 schema） */
interface RawPair {
  /** 模型输出的原始 key（未归一化，用于未知字段的降级展示名） */
  originalKey: string;
  /** 归一化后的 key */
  key: string;
  /** 原始值（未截断） */
  value: string;
}

/**
 * 创建串联在 ThinkingSplitter 之后的状态切分器（复用 P0 状态机）
 *
 * 用法（编排层 chat-manager）：
 * ```ts
 * const sp = createStatusSplitter();
 * const d = sp.feed(textDelta);  // d.thinkingDelta = 状态原文；d.textDelta = 正文
 * ```
 */
export function createStatusSplitter(): ThinkingSplitter {
  return new ThinkingSplitter(STATUS_SPLITTER_OPTIONS);
}

/**
 * 一次性剥离（非流式场景 / done 收敛；与流式累积**幂等**）
 *
 * @param text 待剥离文本（通常是最终正文，可能含 `<status>…</status>`）
 */
export function parseStatusComplete(text: string): StatusParseResult {
  const parsed = parseThinkingComplete(text, STATUS_SPLITTER_OPTIONS);
  return {
    content: parsed.content,
    statusRaw: parsed.thinking,
    hasStatus: parsed.hasThinking,
  };
}

/** 围栏定位结果 */
interface FenceHit {
  /** 围栏起始下标（含 ```） */
  start: number;
  /** 围栏结束下标（含收尾 ```） */
  end: number;
  /** 围栏内的原文 */
  inner: string;
}

/**
 * 定位最后一个 ```status 围栏
 *
 * 只认 info string 为 `status` 的围栏 → 正文里的普通代码块不会被误判（§3.5 A-08）。
 * 取最后一个：状态块按惯例写在回复末尾。
 */
function findLastStatusFence(text: string): FenceHit | null {
  const re = /```[ \t]*status[ \t]*\r?\n([\s\S]*?)```/g;
  let last: FenceHit | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    last = { start: m.index, end: m.index + m[0].length, inner: m[1] ?? '' };
  }
  return last;
}

/**
 * 兜底：从整段文本里找 ```status 围栏（仅收尾时用一次，不参与流式）
 *
 * 模型若在正文里用了普通代码块（无 status info string）不会被误判。
 *
 * @returns 围栏内原文；无围栏时返回空串
 */
export function extractStatusFence(text: string): string {
  if (typeof text !== 'string' || text === '') return '';
  return findLastStatusFence(text)?.inner ?? '';
}

/**
 * 从正文里移除 ```status 围栏（与 extractStatusFence 配套）
 *
 * @returns 移除后的正文；无围栏时原样返回
 */
export function stripStatusFence(text: string): string {
  if (typeof text !== 'string' || text === '') return text;
  const hit = findLastStatusFence(text);
  if (!hit) return text;
  return (text.slice(0, hit.start) + text.slice(hit.end)).replace(/\s+$/, '');
}

/**
 * 把 JSON 里的任意值转成展示字符串
 *
 * 对象/数组走 JSON.stringify（不给渲染层制造歧义），其余走 String()。
 */
function valueToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }
  return String(value);
}

/**
 * 按行降级切分（兼容半角 `:` 与全角 `：`）
 *
 * 规则：
 * - 去 markdown 前缀（`- ` / `* ` / `> ` / `#` / 空白）
 * - 按**第一个**出现的分隔符切（半角与全角取先出现者）→ `time: 18:30` 的值保留 `18:30`
 * - key 或 value 为空 → 跳过该行（§3.5 B-06/B-07/B-08）
 */
function parseLines(raw: string): RawPair[] {
  const out: RawPair[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const cleaned = line.replace(/^[-*>#\s]+/, '').trim();
    if (cleaned === '') continue;
    const iHalf = cleaned.indexOf(':');
    const iFull = cleaned.indexOf('：');
    let idx = -1;
    if (iHalf >= 0 && iFull >= 0) idx = Math.min(iHalf, iFull);
    else if (iHalf >= 0) idx = iHalf;
    else if (iFull >= 0) idx = iFull;
    if (idx < 0) continue;
    const originalKey = cleaned.slice(0, idx).trim();
    const value = cleaned.slice(idx + 1).trim();
    if (originalKey === '' || value === '') continue;
    const nk = normalizeKey(originalKey);
    if (nk === '') continue;
    out.push({ originalKey, key: nk, value });
  }
  return out;
}

/**
 * 从状态块原文里抽取键值对：JSON 优先，失败降级按行
 */
function extractPairs(raw: string): { pairs: RawPair[]; mode: 'json' | 'lines' } {
  const obj = parseAiJson<Record<string, unknown>>(raw);
  if (obj) {
    const pairs: RawPair[] = [];
    for (const [k, v] of Object.entries(obj)) {
      const nk = normalizeKey(k);
      const value = valueToString(v);
      if (nk === '' || value === '') continue;
      pairs.push({ originalKey: k, key: nk, value });
    }
    if (pairs.length > 0) return { pairs, mode: 'json' };
  }
  return { pairs: parseLines(raw), mode: 'lines' };
}

/**
 * 在 schema 字段里匹配归一化 key
 *
 * 优先级：精确 key → 精确别名 → key 子串（key 长 ≥4）→ 别名子串（长 ≥4）
 */
function matchSchemaField(nk: string, fields: readonly StatusFieldDef[]): StatusFieldDef | null {
  for (const f of fields) {
    if (normalizeKey(f.key) === nk) return f;
  }
  for (const f of fields) {
    for (const a of f.aliases ?? []) {
      if (normalizeKey(a) === nk) return f;
    }
  }
  for (const f of fields) {
    const fk = normalizeKey(f.key);
    if (fk.length >= 4 && nk.includes(fk)) return f;
  }
  for (const f of fields) {
    for (const a of f.aliases ?? []) {
      const ak = normalizeKey(a);
      if (ak.length >= 4 && nk.includes(ak)) return f;
    }
  }
  return null;
}

/**
 * 在内置注册表里匹配归一化 key（精确优先，其次子串且 key 长 ≥4）
 */
function matchPreset(nk: string): StatusFieldPreset | null {
  for (const p of STATUS_FIELD_REGISTRY) {
    if (normalizeKey(p.key) === nk) return p;
  }
  for (const p of STATUS_FIELD_REGISTRY) {
    const pk = normalizeKey(p.key);
    if (pk.length >= 4 && nk.includes(pk)) return p;
  }
  return null;
}

/** 解析展示名：labelI18nKey > label > 内置表 i18nKey > 原始 key（§4.2） */
function resolveLabel(
  def: StatusFieldDef | null,
  preset: StatusFieldPreset | null,
  originalKey: string
): string {
  if (def?.labelI18nKey) return t(def.labelI18nKey as MessageKey);
  if (def?.label) return def.label;
  if (preset) return t(preset.i18nKey as MessageKey);
  return originalKey;
}

/** 解析图标：schema 图标 > 内置表图标 > 无（未命中时不渲染图标，而非渲染空白） */
function resolveIcon(def: StatusFieldDef | null, preset: StatusFieldPreset | null): StatusIconName | undefined {
  if (def?.icon && isStatusIconName(def.icon)) return def.icon;
  if (preset?.icon && isStatusIconName(preset.icon)) return preset.icon;
  return undefined;
}

/** 解析值类型：schema > 内置表 > string */
function resolveType(def: StatusFieldDef | null, preset: StatusFieldPreset | null): StatusValueType {
  return def?.type ?? preset?.type ?? 'string';
}

/**
 * 纯函数：状态块原文 → 结构化状态
 *
 * 算法（§3.2）：
 * 1. 空块 → null
 * 2. JSON 优先（`parseAiJson`，含围栏剥离 + 尾逗号修复）
 * 3. 降级按行（半角 `:` + 全角 `：`）
 * 4. 逐 key 匹配：schema 精确 → schema 别名/子串 → 内置 8 字段 → 未知降级
 * 5. 值归一化：trim + 超长截断；number 型解析失败降级 string；enum 越界**仍显示**
 * 6. `show === false` 的字段不进 entries
 * 7. 排序：order 升序 → 声明/出现顺序
 * 8. 截断到 `schema.maxFields ?? 12`
 * 9. entries 为空 → null（**不渲染空壳**）
 *
 * @param raw 状态块原文（`<status>` 内 / fence 内）
 * @param schema 角色自带 schema；null/undefined = 纯嗅探模式
 * @param messageId 溯源用（缺省空串）
 * @returns 没有任何可用字段时返回 null
 */
export function parseStatusBlock(
  raw: string,
  schema?: StatusSchema | null,
  messageId = ''
): CharacterStatus | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed === '') return null;

  const { pairs, mode } = extractPairs(trimmed);
  if (pairs.length === 0) return null;

  const fields = Array.isArray(schema?.fields) ? schema!.fields : [];
  const unknownPolicy = schema?.unknownKeyPolicy === 'hide' ? 'hide' : 'show';
  const maxFields =
    typeof schema?.maxFields === 'number' &&
    Number.isFinite(schema.maxFields) &&
    schema.maxFields > 0
      ? Math.floor(schema.maxFields)
      : STATUS_MAX_FIELDS;

  // Map 保序且重复 set 不改变位置 → 天然实现"后者覆盖前者"（§3.5 B-09）
  const byKey = new Map<string, StatusEntry>();
  const orderOf = new Map<string, number>();
  let unknownCount = 0;
  let seq = 0;

  for (const pair of pairs) {
    const def = fields.length > 0 ? matchSchemaField(pair.key, fields) : null;
    const preset = matchPreset(pair.key);

    // 未知字段：按 unknownKeyPolicy 降级展示或丢弃
    if (!def && !preset) {
      if (unknownPolicy === 'hide') continue;
      unknownCount += 1;
      byKey.set(pair.key, {
        key: pair.key,
        label: pair.originalKey,
        value: pair.value.slice(0, STATUS_VALUE_MAX_LEN),
      });
      orderOf.set(pair.key, seq++);
      continue;
    }

    if (def?.show === false) continue;

    // 命中后用**规范 key**（schema 字段 / 内置预设的归一化 key）作为去重与排序口径：
    // 这样"直接输出规范 key"与"别名/子串命中"会落到同一条，
    // 去重（`{"location":…,"place":…}` 只留后者）与结转才成立。
    // 注意：`byKey` / `orderOf` 必须**同时**用规范 key 存取 —— 存 raw、取 normalized 的不对称
    // 会让别名命中时的排序位退化成 0（QA D1）。
    const canonicalKey = def ? normalizeKey(def.key) : normalizeKey(preset!.key);
    const entry: StatusEntry = {
      key: canonicalKey,
      label: resolveLabel(def, preset, pair.originalKey),
      value: pair.value.slice(0, STATUS_VALUE_MAX_LEN),
    };
    const icon = resolveIcon(def, preset);
    if (icon) entry.icon = icon;
    if (resolveType(def, preset) === 'number') {
      const num = Number(pair.value);
      if (Number.isFinite(num)) entry.raw = num;
    }
    byKey.set(canonicalKey, entry);
    orderOf.set(canonicalKey, seq++);
  }

  const entries = Array.from(byKey.values());
  if (entries.length === 0) return null;

  // 排序：schema 的 order 升序；无 order 时按出现顺序（稳定排序）
  const defByKey = new Map<string, StatusFieldDef>();
  for (const f of fields) defByKey.set(normalizeKey(f.key), f);
  entries.sort((a, b) => {
    const oa = defByKey.get(a.key)?.order ?? 0;
    const ob = defByKey.get(b.key)?.order ?? 0;
    if (oa !== ob) return oa - ob;
    return (orderOf.get(a.key) ?? 0) - (orderOf.get(b.key) ?? 0);
  });

  const capped = entries.slice(0, maxFields);
  return {
    messageId,
    entries: capped,
    parseMode: mode,
    unknownCount,
  };
}

/**
 * 会话级派生：取"截至当前的最新状态快照"（零持久化，纯 computed 友好）
 *
 * 算法：从后往前遍历消息；key 首次出现即锁定（= 最新值）。
 * - `field.carryForward !== false`（默认）→ 一直回溯到找到该 key 为止（好感度结转语义）
 * - `field.carryForward === false`       → 只认最后一条有 status 的消息，不再回溯
 *
 * 群聊用法：先按 characterId 过滤再调用（GroupChatMessage 已带 characterId，零额外类型改动）。
 *
 * @param messages 消息列表（只需 id 与 status 两个字段）
 * @param schema 角色 schema（决定 carryForward 与字段上限）
 * @returns 无任何可用字段时 null
 */
export function resolveLatestStatus(
  messages: readonly { id: string; status?: CharacterStatus | null }[],
  schema?: StatusSchema | null
): CharacterStatus | null {
  if (!messages || messages.length === 0) return null;

  const fields = Array.isArray(schema?.fields) ? schema!.fields : [];
  const noCarry = new Set(
    fields.filter((f) => f.carryForward === false).map((f) => normalizeKey(f.key))
  );
  const maxFields =
    typeof schema?.maxFields === 'number' &&
    Number.isFinite(schema.maxFields) &&
    schema.maxFields > 0
      ? Math.floor(schema.maxFields)
      : STATUS_MAX_FIELDS;

  const picked: StatusEntry[] = [];
  const seen = new Set<string>();

  /** 最后一条带状态的消息（carryForward=false 的唯一取值来源） */
  let lastWithStatus: { id: string; status: CharacterStatus } | null = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const st = messages[i]?.status;
    if (st && Array.isArray(st.entries) && st.entries.length > 0) {
      lastWithStatus = { id: messages[i]!.id, status: st };
      break;
    }
  }

  // ① carryForward=false：只认最后一条有状态的消息
  if (lastWithStatus) {
    for (const e of lastWithStatus.status.entries) {
      if (!noCarry.has(e.key) || seen.has(e.key)) continue;
      seen.add(e.key);
      picked.push(e);
    }
  }

  // ② 其余字段：从后往前回溯，首次出现即锁定
  let unknownCount = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const st = messages[i]?.status;
    if (!st || !Array.isArray(st.entries)) continue;
    for (const e of st.entries) {
      if (seen.has(e.key) || noCarry.has(e.key)) continue;
      seen.add(e.key);
      picked.push(e);
      if (!fields.some((f) => normalizeKey(f.key) === e.key) && !findRegistryPreset(e.key)) {
        unknownCount += 1;
      }
    }
  }

  if (picked.length === 0) return null;

  // 与 parseStatusBlock 同款排序，保证 sticky 条顺序稳定
  const defByKey = new Map<string, StatusFieldDef>();
  for (const f of fields) defByKey.set(normalizeKey(f.key), f);
  const slotOf = new Map<string, number>();
  fields.forEach((f, i) => slotOf.set(normalizeKey(f.key), i));
  picked.sort((a, b) => {
    const ia = slotOf.has(a.key) ? slotOf.get(a.key)! : Number.MAX_SAFE_INTEGER;
    const ib = slotOf.has(b.key) ? slotOf.get(b.key)! : Number.MAX_SAFE_INTEGER;
    if (ia !== ib) return ia - ib;
    return (defByKey.get(a.key)?.order ?? 0) - (defByKey.get(b.key)?.order ?? 0);
  });

  return {
    messageId: lastWithStatus?.status.messageId ?? lastWithStatus?.id ?? '',
    entries: picked.slice(0, maxFields),
    parseMode: lastWithStatus?.status.parseMode ?? 'json',
    unknownCount,
  };
}

export { normalizeKey };
