/**
 * R4-12 行号切片生成器 —— postgres-store.ts 923 → 三个模块
 *
 * 铁律（O-4 / O-11 / O-14 / O-15 / O-16 / O-17 / O-18 沿用）：
 *  ① 基准只读归档副本，绝不读源文件（读源文件会被覆写，二次跑越界静默回空串）
 *  ② seg(start,end) 越界/切空立即抛错
 *  ③ 断言一律 A[n-1]，行号用 sed -n 打印核对后再写，不心算
 *  ④ 尾部空串先 pop()，让内存行数与 wc -l 对齐
 *  ⑤ CRLF 仓库：内存归一 LF，写回 writeCRLF（末尾换行必须补，O-18 第 ⑥ 条）
 *  ⑥ 手改完必须回填进本生成器，否则二次运行会被覆盖（O-18 第 ⑦ 条）
 *  ⑦ 参数插入按「函数实际用不用 tenantId」逐个判定，绝不按出现顺序批量插
 *     （盲插会让 insertEpisode / updateEpisode 出现未使用参数 ⇒ TS6133）
 *
 * 形态判据（O-14：类拆分优先「提自由函数 + 一行转发」）：
 *  目标方法的签名本来就写成 (tx: SqlExecutor, ...) 全显式参数形态，
 *  只用到 this.tenantId 一个实例状态（5 处）+ 三处同类自调用 ⇒
 *  整体提成顶层自由函数，宿主调用点改直调，不造转发桩。
 *  本文件的 10 个方法全是 private，宿主外部零调用点（公开面只有
 *  PostgresRuntimeStore / SqlExecutor / SqlResult），
 *  因此「留一行转发」在这里是多余的一层间接。
 *
 * 分层（依赖单向，无环）：
 *  postgres-sql-port.ts       SqlExecutor 端口 + 纯工具（中性层，零内部依赖）
 *        ↑
 *  postgres-store-writer.ts   SQL 写入层（10 个自由函数）
 *        ↑
 *  postgres-store.ts          PostgresRuntimeStore（事务编排与校验）
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'scripts/archive/r4-12-pgstore/postgres-store.orig.ts.txt');
const raw = readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');
const A = raw.split('\n');
while (A[A.length - 1] === '') A.pop();
if (A.length !== 923) throw new Error(`归档行数应为 923，实际 ${A.length}`);

// ── 结构断言（行号已 sed 逐行核对） ───────────────────────────
function assertLine(n, x, tag) {
  const got = A[n - 1];
  if (got !== x) {
    throw new Error(`[${tag}] 第 ${n} 行不符\n  期望: ${JSON.stringify(x)}\n  实际: ${JSON.stringify(got)}`);
  }
}
assertLine(1, "import { OptimisticLockError, RuntimeConflictError } from './store';", 'store import');
assertLine(2, "import { stableChatConversationTurnIds, stableRuntimeUuid } from './runtime-id';", 'runtime-id import');
assertLine(5, 'export interface SqlResult<Row = Record<string, unknown>> {', 'SqlResult 开');
assertLine(17, '}', 'SqlExecutor 闭');
assertLine(19, 'interface CharacterVersionRow {', 'CharacterVersionRow 开');
assertLine(23, 'interface SnapshotRow {', 'SnapshotRow 开');
assertLine(26, '}', 'SnapshotRow 闭');
assertLine(28, 'function parseJson<T>(value: T | string): T {', 'parseJson');
assertLine(41, '}', 'slugify 闭');
assertLine(45, '}', 'isUuid 闭');
assertLine(49, '}', 'json 闭');
assertLine(51, '/**', '类 JSDoc 开');
assertLine(59, ' */', '类 JSDoc 闭');
assertLine(60, 'export class PostgresRuntimeStore implements RuntimeSnapshotStore {', '类开');
assertLine(473, '  }', 'assertUuidBoundary 闭');
assertLine(475, '  private async persistNormalizedState(', 'persistNormalizedState 签名');
assertLine(476, '    tx: SqlExecutor,', 'persistNormalizedState 首参');
assertLine(509, '  private async persistCharacterProjection(tx: SqlExecutor, snapshot: RuntimeSnapshot): Promise<void> {', 'persistCharacterProjection 签名');
assertLine(675, '  private async insertMemory(tx: SqlExecutor, memory: MemoryRecord): Promise<void> {', 'insertMemory 签名');
assertLine(718, '  private async insertEpisode(', 'insertEpisode 签名');
assertLine(719, '    tx: SqlExecutor,', 'insertEpisode 首参');
assertLine(722, '  ): Promise<void> {', 'insertEpisode 签名闭');
assertLine(753, '  private async updateEpisode(', 'updateEpisode 签名');
assertLine(754, '    tx: SqlExecutor,', 'updateEpisode 首参');
assertLine(757, '  ): Promise<void> {', 'updateEpisode 签名闭');
assertLine(785, '  private async insertEpisodeEvents(tx: SqlExecutor, characterId: string, episode: Episode): Promise<void> {', 'insertEpisodeEvents 签名');
assertLine(802, '  private async insertEvent(tx: SqlExecutor, event: DomainEvent): Promise<void> {', 'insertEvent 签名');
assertLine(833, '  private async insertEventTurnLinks(', 'insertEventTurnLinks 签名');
assertLine(834, '    tx: SqlExecutor,', 'insertEventTurnLinks 首参');
assertLine(865, '  private async insertStateChange(tx: SqlExecutor, change: StateChange): Promise<void> {', 'insertStateChange 签名');
assertLine(894, '  private async ensureTarget(', 'ensureTarget 签名');
assertLine(895, '    tx: SqlExecutor,', 'ensureTarget 首参');
assertLine(922, '  }', 'ensureTarget 闭');
assertLine(923, '}', '类闭');

function seg(start, end, tag) {
  if (!(start >= 1 && end <= A.length && start <= end)) {
    throw new Error(`[${tag}] 区间越界: ${start}-${end}（共 ${A.length} 行）`);
  }
  const out = A.slice(start - 1, end);
  if (out.join('').trim() === '') throw new Error(`[${tag}] 切出空片段: ${start}-${end}`);
  return out;
}
/** 整体左移 n 级（每级 2 空格）。类方法缩进 2 → 顶层 0 ⇒ levels = 1（O-18 第 ① 条） */
function dedent(lines, levels) {
  const pad = ' '.repeat(levels * 2);
  return lines.map((l) => (l.startsWith(pad) ? l.slice(pad.length) : l));
}
/** 行内子串替换并断言替换次数，数量不符立即抛错（O-16：先量再写死） */
function subLine(lines, from, to, expected, tag) {
  let n = 0;
  const out = lines.map((l) => {
    if (!l.includes(from)) return l;
    n += l.split(from).length - 1;
    return l.split(from).join(to);
  });
  if (n !== expected) throw new Error(`[${tag}] 期望 ${JSON.stringify(from)} 替换 ${expected} 处，实际 ${n} 处`);
  return out;
}
/**
 * 多行签名补参：定位签名首行，断言紧随其后是 `    tx: SqlExecutor,`，
 * 再把新参数插到它后面。逐个函数调用，不做按序批量插入（见铁律 ⑦）。
 */
function insertParamAfterTx(lines, sigLine, paramLine, tag) {
  const hits = lines.reduce((acc, l, i) => (l === sigLine ? [...acc, i] : acc), []);
  if (hits.length !== 1) throw new Error(`[${tag}] 签名 ${JSON.stringify(sigLine)} 命中 ${hits.length} 次，期望 1`);
  const i = hits[0];
  if (lines[i + 1] !== '    tx: SqlExecutor,') {
    throw new Error(`[${tag}] 第 ${i + 2} 行应为 "    tx: SqlExecutor,"，实际 ${JSON.stringify(lines[i + 1])}`);
  }
  const out = [...lines];
  out.splice(i + 2, 0, paramLine);
  return out;
}

// ── ① port（中性层：端口 + 纯工具，零内部依赖） ───────────────
const portLines = [
  '/**',
  ' * PostgreSQL Runtime —— 驱动端口与纯工具',
  ' *',
  ' * 本层零业务、零状态，被写入层（postgres-store-writer）与宿主',
  ' * （postgres-store）共同依赖，因此必须放在依赖图最底层：',
  ' * 两端都从这里取 SqlExecutor / isUuid / json，彼此不互相 import，',
  ' * 避免宿主与写入层形成环形依赖（R4-8 / R4-11 的同型问题）。',
  ' */',
  '',
  ...seg(5, 17, 'port-interfaces'),
  '',
  ...seg(28, 49, 'port-helpers'),
  '',
  // parseJson / slugify 只被宿主用；isUuid / json 被宿主与写入层共用。
  // 四个都从本层导出：写入层只取它需要的两个（未用到的导出不会触发 TS6133），
  // 少导一个会让宿主那侧的 inferred 类型退化成 any（TS2459 + TS7006 连带）。
  'export { isUuid, json, parseJson, slugify };',
];

// ── ② writer（SQL 写入层：10 个自由函数） ─────────────────────
let W = seg(475, 922, 'writer');

// 2.1 签名改写：private 实例方法 → 顶层导出函数
W = subLine(W, '  private async insertEventTurnLinks(', 'export async function insertEventTurnLinks(', 1, 'sig-turnLinks');
W = subLine(W, '  private async insertEpisodeEvents(', 'export async function insertEpisodeEvents(', 1, 'sig-episodeEvents');
W = subLine(W, '  private async insertEpisode(', 'export async function insertEpisode(', 1, 'sig-insertEpisode');
W = subLine(W, '  private async updateEpisode(', 'export async function updateEpisode(', 1, 'sig-updateEpisode');
W = subLine(W, '  private async insertEvent(', 'export async function insertEvent(', 1, 'sig-event');
W = subLine(W, '  private async insertStateChange(', 'export async function insertStateChange(', 1, 'sig-stateChange');
W = subLine(W, '  private async insertMemory(', 'export async function insertMemory(', 1, 'sig-memory');
W = subLine(W, '  private async persistCharacterProjection(', 'export async function persistCharacterProjection(', 1, 'sig-projection');
W = subLine(W, '  private async persistNormalizedState(', 'export async function persistNormalizedState(', 1, 'sig-normalized');
W = subLine(W, '  private async ensureTarget(', 'export async function ensureTarget(', 1, 'sig-target');

// 2.2 tenantId 显式入参 —— 只有真正用到 tenantId 的 8 个函数补参；
//     insertEpisode / updateEpisode 完全不碰 tenantId（纯表写入），补了会 TS6133。
W = subLine(
  W,
  'export async function persistCharacterProjection(tx: SqlExecutor, snapshot: RuntimeSnapshot)',
  'export async function persistCharacterProjection(tx: SqlExecutor, tenantId: string, snapshot: RuntimeSnapshot)',
  1,
  'param-projection'
);
W = subLine(
  W,
  'export async function insertMemory(tx: SqlExecutor, memory: MemoryRecord)',
  'export async function insertMemory(tx: SqlExecutor, tenantId: string, memory: MemoryRecord)',
  1,
  'param-memory'
);
W = subLine(
  W,
  'export async function insertEpisodeEvents(tx: SqlExecutor, characterId: string, episode: Episode)',
  'export async function insertEpisodeEvents(tx: SqlExecutor, tenantId: string, characterId: string, episode: Episode)',
  1,
  'param-episodeEvents'
);
W = subLine(
  W,
  'export async function insertEvent(tx: SqlExecutor, event: DomainEvent)',
  'export async function insertEvent(tx: SqlExecutor, tenantId: string, event: DomainEvent)',
  1,
  'param-event'
);
W = subLine(
  W,
  'export async function insertStateChange(tx: SqlExecutor, change: StateChange)',
  'export async function insertStateChange(tx: SqlExecutor, tenantId: string, change: StateChange)',
  1,
  'param-stateChange'
);
W = insertParamAfterTx(W, 'export async function persistNormalizedState(', '    tenantId: string,', 'param-normalized');
W = insertParamAfterTx(W, 'export async function insertEventTurnLinks(', '    tenantId: string,', 'param-turnLinks');
W = insertParamAfterTx(W, 'export async function ensureTarget(', '    tenantId: string,', 'param-target');

// 2.3 函数体：this.x → 显式入参；同类自调用补 tenantId（先长名后短名）
W = subLine(W, '      tx,', '      tx,\n      tenantId,', 1, 'call-target-multiline');
W = subLine(W, 'this.ensureTarget(tx, ', 'ensureTarget(tx, tenantId, ', 5, 'call-target-single');
W = subLine(W, 'this.ensureTarget(', 'ensureTarget(', 1, 'call-target-remain');
W = subLine(W, 'this.persistCharacterProjection(tx, next)', 'persistCharacterProjection(tx, tenantId, next)', 1, 'call-projection');
W = subLine(W, 'this.insertMemory(tx, memory)', 'insertMemory(tx, tenantId, memory)', 1, 'call-memory');
W = subLine(W, 'this.insertEpisodeEvents(tx, next.character.id, episode)', 'insertEpisodeEvents(tx, tenantId, next.character.id, episode)', 1, 'call-episodeEvents');
W = subLine(W, 'this.insertEpisode(tx, next.character.id, episode)', 'insertEpisode(tx, next.character.id, episode)', 1, 'call-insertEpisode');
W = subLine(W, 'this.updateEpisode(tx, next.character.id, episode)', 'updateEpisode(tx, next.character.id, episode)', 1, 'call-updateEpisode');
W = subLine(W, 'this.insertEventTurnLinks(tx, event)', 'insertEventTurnLinks(tx, tenantId, event)', 1, 'call-turnLinks');
W = subLine(W, 'this.tenantId', 'tenantId', 5, 'call-tenant');

// 2.4 缩进：类方法 2 → 顶层 0，只减 1 级
W = dedent(W, 1);

// 2.5 断言
{
  const left = W.filter((l) => /\bthis\./.test(l));
  if (left.length > 0) throw new Error(`[writer] 残留 this. 引用 ${left.length} 处：\n${left.join('\n')}`);
  const cls = W.filter((l) => /\bclass\s/.test(l));
  if (cls.length > 0) throw new Error(`[writer] 不应含 class 声明：\n${cls.join('\n')}`);
  const n = W.filter((l) => l.startsWith('export async function ')).length;
  if (n !== 10) throw new Error(`[writer] 顶层导出函数应为 10 个，实际 ${n}`);
  const priv = W.filter((l) => l.includes('private ')).length;
  if (priv !== 0) throw new Error(`[writer] 残留 private 修饰符 ${priv} 处`);
  const ten = W.filter((l) => /\btenantId\b/.test(l)).length;
  if (ten < 8) throw new Error(`[writer] tenantId 引用过少（${ten}），疑似漏插参数`);
  const noTen = ['insertEpisode(', 'updateEpisode('];
  for (const sig of noTen) {
    const i = W.findIndex((l) => l.startsWith(`export async function ${sig}`));
    if (i < 0) throw new Error(`[writer] 未找到 ${sig}`);
    const head = W.slice(i, i + 6).join('\n');
    if (head.includes('tenantId')) throw new Error(`[writer] ${sig} 不应带 tenantId 参数（会触发 TS6133）`);
  }
}

const writerLines = [
  '/**',
  ' * PostgreSQL Runtime Store —— SQL 写入层',
  ' *',
  ' * 全部是自由函数，签名一律 (tx, tenantId, ...) 全显式：不持有任何实例状态，',
  ' * 事务句柄由调用方传入，租户隔离所需的 tenantId 也显式传递而非从 this 取。',
  ' * 这一层可以脱离 PostgresRuntimeStore 单独测试（只造一个 SqlExecutor 假体）。',
  ' *',
  ' * 职责：单表 UPSERT、投影刷新、外键占位 Target 兜底建立。',
  ' * 事务边界、乐观锁、审计与幂等判定全部留在宿主 postgres-store.ts。',
  ' */',
  '',
  "import { stableRuntimeUuid } from './runtime-id';",
  "import { isUuid, json, type SqlExecutor } from './postgres-sql-port';",
  "import type { DomainEvent, Episode, MemoryRecord, RuntimeSnapshot, StateChange } from './types';",
  '',
  ...W,
];

// ── ③ 宿主（事务编排 + 乐观锁 + 校验） ─────────────────────────
let H = seg(51, 473, 'host-body');
H = subLine(H, 'this.insertEvent(tx, event);', 'insertEvent(tx, this.tenantId, event);', 2, 'host-event');
H = subLine(H, 'this.insertStateChange(tx, change);', 'insertStateChange(tx, this.tenantId, change);', 2, 'host-stateChange');
H = subLine(H, 'this.persistNormalizedState(tx, null, snapshot);', 'persistNormalizedState(tx, this.tenantId, null, snapshot);', 1, 'host-normalized-init');
H = subLine(H, 'this.persistNormalizedState(tx, current, snapshot);', 'persistNormalizedState(tx, this.tenantId, current, snapshot);', 1, 'host-normalized-commit');
H = subLine(
  H,
  'this.insertEventTurnLinks(tx, event, [...committedTurnIds]);',
  'insertEventTurnLinks(tx, this.tenantId, event, [...committedTurnIds]);',
  1,
  'host-turnLinks'
);
{
  // 只匹配真正搬走的 10 个函数名（persistConversationTurn 仍留在宿主，
  // 用 /this\.persist/ 这种宽正则会把它的两处调用误判成残留）
  const moved = [
    'persistNormalizedState',
    'persistCharacterProjection',
    'insertMemory',
    'insertEpisode',
    'insertEpisodeEvents',
    'updateEpisode',
    'insertEvent',
    'insertEventTurnLinks',
    'insertStateChange',
    'ensureTarget',
  ];
  const left = H.filter((l) => moved.some((m) => l.includes(`this.${m}(`)));
  if (left.length > 0) throw new Error(`[host] 残留对已搬走方法的 this 调用：\n${left.join('\n')}`);
}

const hostLines = [
  '/**',
  ' * PostgreSQL Runtime Store —— 事务编排层',
  ' *',
  ' * 保留职责：事务边界、角色行 FOR UPDATE 乐观锁、幂等校验、审计落库、',
  ' * 租户边界校验。具体每张表的 SQL 写入已下放到 postgres-store-writer.ts，',
  ' * 本轮改写对调用方零影响：公开面仍只有 PostgresRuntimeStore / SqlExecutor / SqlResult。',
  ' *',
  ' * 文件分层（依赖单向，无环）：',
  ' *',
  ' *   postgres-sql-port.ts       SqlExecutor 端口 + isUuid / json / parseJson / slugify',
  ' *        ↑',
  ' *   postgres-store-writer.ts   10 个 SQL 写入自由函数（tx, tenantId, ...）',
  ' *        ↑',
  ' *   postgres-store.ts          PostgresRuntimeStore（本文件）',
  ' */',
  '',
  "import { OptimisticLockError, RuntimeConflictError } from './store';",
  "import { stableChatConversationTurnIds } from './runtime-id';",
  "import { isUuid, json, parseJson, slugify, type SqlExecutor } from './postgres-sql-port';",
  'import {',
  '  insertEvent,',
  '  insertEventTurnLinks,',
  '  insertStateChange,',
  '  persistNormalizedState,',
  "} from './postgres-store-writer';",
  'import type {',
  '  ContextBuildRecord,',
  '  RuntimeCharacterListRequest,',
  '  RuntimeCharacterListResult,',
  '  RuntimeConversationTurnInput,',
  '  RuntimeConversationTurnResult,',
  '  RuntimeSnapshot,',
  '  RuntimeSnapshotStore,',
  "} from './types';",
  '',
  '// 端口类型从这里再导出，维持拆分前的公开面（postgres-executor 直接 import 本文件）',
  "export type { SqlExecutor, SqlResult } from './postgres-sql-port';",
  '',
  ...seg(19, 26, 'host-row-types'),
  '',
  ...H,
  '}',
];

// ── 写出（CRLF 仓库，写回时还原；末尾换行必须补） ─────────────
const writeCRLF = (path, text) => {
  const norm = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n');
  const withEol = norm.endsWith('\n') ? norm : `${norm}\n`;
  writeFileSync(path, withEol.replace(/\n/g, '\r\n'), 'utf8');
  return withEol.split('\n').length;
};

const counts = {};
counts['postgres-sql-port.ts'] = writeCRLF(join(ROOT, 'src/runtime/postgres-sql-port.ts'), portLines.join('\n'));
counts['postgres-store-writer.ts'] = writeCRLF(join(ROOT, 'src/runtime/postgres-store-writer.ts'), writerLines.join('\n'));
counts['postgres-store.ts'] = writeCRLF(join(ROOT, 'src/runtime/postgres-store.ts'), hostLines.join('\n'));

for (const [name, n] of Object.entries(counts)) console.log(`${name}\t${n - 1} 行`);
