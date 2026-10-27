/**
 * 首聊验收记录（C-01 的五人试用采集表）
 *
 * 为什么放在应用里而不是另开一张表：验收要量的是"普通人能不能走完第一次对话"，
 * 其中首字延迟、启动耗时这些数只有应用自己拿得到；让记录人一边掐表一边记
 * 五个人的五行，只会得到一堆估算值。
 *
 * 分工：
 * - 本模块只做纯数据：一行记录的形状、容错解析、增行（有上限）、导出字符串。
 * - 采集侧（启动耗时、首字延迟、模型名）由调用方填进 `TrialRecord`。
 * - 存哪儿由调用方决定（当前是 localStorage，只在本机，导出前不离机）。
 *
 * 导出格式里表头由调用方传进来（走 i18n），所以本模块不含任何面向用户的文案。
 */

/** 一次试用的结论 */
export type TrialVerdict = 'ok' | 'blocked' | 'gaveUp';

/** 首聊路径上的六步（C-01 门槛的分解），`blockedStep` 取其中之一 */
export const TRIAL_STEP_IDS = ['open', 'pick', 'send', 'firstToken', 'complete', 'back'] as const;
export type TrialStep = (typeof TRIAL_STEP_IDS)[number];

/** 一行试用记录 */
export interface TrialRecord {
  id: string;
  /** 记录时间（ISO） */
  recordedAt: string;
  /** 参与者代号（不给真名，便于匿名） */
  participant: string;
  verdict: TrialVerdict;
  /** 卡住的步骤；结论为 ok 时是空串 */
  blockedStep: string;
  notes: string;
  /** 启动到可用的耗时（ms）；本次会话没测到就是 null */
  appReadyMs: number | null;
  /** 最近一次首字延迟（ms） */
  ttftLastMs: number | null;
  /** 本次会话首字延迟均值（ms） */
  ttftAvgMs: number | null;
  /** 本次会话采到的首字样本数 */
  ttftCount: number;
  model: string;
  provider: string;
  platform: string;
  viewport: string;
}

/** CSV 表头（由调用方用 t() 组装，避免本模块混入 UI 文案） */
export interface TrialCsvHeader {
  time: string;
  participant: string;
  verdict: string;
  step: string;
  ttft: string;
  notes: string;
}

export const TRIAL_STORAGE_KEY = 'ai-roleplay:trial-records';
/** 环形上限：试用是人工动作，100 行足够覆盖几十人 × 多轮 */
export const TRIAL_MAX_RECORDS = 100;

const VERDICTS: readonly TrialVerdict[] = ['ok', 'blocked', 'gaveUp'];

function isFiniteNumberOrNull(v: unknown): v is number | null {
  return v === null || (typeof v === 'number' && Number.isFinite(v));
}

function toNullableNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function toText(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/**
 * 容错解析存量记录：坏行丢掉，不认识的结构返回空数组。
 *
 * 验收数据是人工采的，不能因为一条脏行让整张表打不开（与审计日志同一条立场）。
 */
export function parseTrialRecords(raw: string | null): TrialRecord[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: TrialRecord[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const verdict = r.verdict;
    if (typeof verdict !== 'string' || !VERDICTS.includes(verdict as TrialVerdict)) continue;
    const id = toText(r.id);
    const recordedAt = toText(r.recordedAt);
    if (!id || !recordedAt) continue;
    out.push({
      id,
      recordedAt,
      participant: toText(r.participant),
      verdict: verdict as TrialVerdict,
      blockedStep: toText(r.blockedStep),
      notes: toText(r.notes),
      appReadyMs: toNullableNumber(r.appReadyMs),
      ttftLastMs: toNullableNumber(r.ttftLastMs),
      ttftAvgMs: toNullableNumber(r.ttftAvgMs),
      ttftCount: typeof r.ttftCount === 'number' && Number.isFinite(r.ttftCount) ? r.ttftCount : 0,
      model: toText(r.model),
      provider: toText(r.provider),
      platform: toText(r.platform),
      viewport: toText(r.viewport),
    });
  }
  return out;
}

/** 追加一行并裁到上限（超出时丢最早的，与审计日志的环形淘汰同一条规矩） */
export function appendTrialRecord(
  list: readonly TrialRecord[],
  rec: TrialRecord,
  max = TRIAL_MAX_RECORDS,
): TrialRecord[] {
  const next = [...list, rec];
  return next.length > max ? next.slice(next.length - max) : next;
}

export interface TrialRecordInput {
  participant: string;
  verdict: TrialVerdict;
  blockedStep?: string;
  notes?: string;
  appReadyMs?: number | null;
  ttftLastMs?: number | null;
  ttftAvgMs?: number | null;
  ttftCount?: number;
  model?: string;
  provider?: string;
  platform?: string;
  viewport?: string;
}

/** 组装一行（id 与时间戳可注入，便于测试拿确定的读数） */
export function makeTrialRecord(
  input: TrialRecordInput,
  opts: { id?: string; now?: Date } = {},
): TrialRecord {
  const now = opts.now ?? new Date();
  const id = opts.id ?? (typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `trial_${now.getTime()}_${Math.random().toString(36).slice(2, 8)}`);
  const appReadyMs = input.appReadyMs ?? null;
  const ttftLastMs = input.ttftLastMs ?? null;
  const ttftAvgMs = input.ttftAvgMs ?? null;
  if (!isFiniteNumberOrNull(appReadyMs) || !isFiniteNumberOrNull(ttftLastMs) || !isFiniteNumberOrNull(ttftAvgMs)) {
    throw new Error('trial record timings must be finite numbers or null');
  }
  return {
    id,
    recordedAt: now.toISOString(),
    participant: input.participant.trim(),
    verdict: input.verdict,
    blockedStep: input.verdict === 'ok' ? '' : (input.blockedStep ?? '').trim(),
    notes: (input.notes ?? '').trim(),
    appReadyMs,
    ttftLastMs,
    ttftAvgMs,
    ttftCount: Number.isFinite(input.ttftCount) ? (input.ttftCount as number) : 0,
    model: input.model ?? '',
    provider: input.provider ?? '',
    platform: input.platform ?? '',
    viewport: input.viewport ?? '',
  };
}

/** CSV 单元格转义：含逗号/引号/换行都要包起来 */
function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * 导出 CSV（带 BOM，Excel 打开中文不乱码）
 *
 * 只导出人看得懂的六列：时间、参与者、结论、卡住步骤、首字延迟、备注。
 * 平台/模型那些环境字段留在 JSON 里——CSV 是给人扫一眼的，不是全量档案。
 */
export function toTrialCsv(records: readonly TrialRecord[], header: TrialCsvHeader): string {
  const rows = records.map((r) => [
    r.recordedAt,
    r.participant,
    r.verdict,
    r.blockedStep,
    r.ttftAvgMs === null ? '' : String(r.ttftAvgMs),
    r.notes,
  ]);
  const lines = [
    [header.time, header.participant, header.verdict, header.step, header.ttft, header.notes],
    ...rows,
  ].map((cells) => cells.map(csvCell).join(','));
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

/** 导出 JSON（全量字段 + 生成时间，便于日后比对哪台机器/哪个模型） */
export function toTrialJson(records: readonly TrialRecord[]): string {
  return `${JSON.stringify({ exportedAt: new Date().toISOString(), count: records.length, records }, null, 2)}\n`;
}
