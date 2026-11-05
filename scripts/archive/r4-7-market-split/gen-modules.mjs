// R4-7：community-market.ts 拆分生成器（1273 → 4 文件）
// 铁律（§7.12）：基准只读归档副本；越界/切空立即抛错；边界字符串逐字符从归档拷。
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, 'community-market.orig.ts.txt');

// 内存归一 LF：仓库是 CRLF，直接 split('\n') 会让每行留 \r，锚点全不命中
const RAW = readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');
const A = RAW.split('\n');
// split 末项是文件尾空行，按 wc -l 口径弹掉
if (A[A.length - 1] === '') A.pop();
const linesOf = () => A.length;

function assert(cond, msg) {
  if (!cond) throw new Error('断言失败：' + msg);
}

/** 取 [start, end] 闭区间（1-based） */
function seg(start, end) {
  assert(start >= 1 && end <= A.length && start <= end, `行号越界 seg(${start}, ${end})，文件仅 ${A.length} 行`);
  const out = A.slice(start - 1, end);
  assert(out.length > 0, `seg(${start}, ${end}) 切出空串`);
  assert(out.some((l) => l.trim() !== ''), `seg(${start}, ${end}) 全是空白行`);
  return out;
}

function assertFirst(n, expect) {
  const head = expect.slice(0, 14);
  assert(A[n - 1].startsWith(head), `行 ${n} 应以 ${JSON.stringify(head)} 开头，实际 ${JSON.stringify(A[n - 1])}`);
}

function writeCRLF(p, lines) {
  writeFileSync(p, lines.join('\n').replace(/\n/g, '\r\n'), 'utf8');
}

function countTopExportFn(lines) {
  return lines.filter((l) => /^export (async )?function /.test(l)).length;
}

// ── 边界断言（逐字符，从归档拷） ──
assert(linesOf() === 1273, `归档应为 1273 行，实际 ${linesOf()}`);
assertFirst(1, '/**');
assertFirst(20, "import type { CharacterCard } from './character-card';");
assertFirst(21, "import { deepClone } from './json-utils';");
assertFirst(22, "import { t } from '@/i18n';");
assertFirst(24, '// ── 类型定义 ──');
assertFirst(27, 'export interface MarketUser {');
assertFirst(204, 'export interface SerializedMarketData {');
assert(A[208] === '  reports: MarketReport[];', `行 209 应为 reports，实际 ${JSON.stringify(A[208])}`);
assert(A[209] === '}', `行 210 应为 }，实际 ${JSON.stringify(A[209])}`);
assertFirst(212, '// ── 工具函数 ──');
assertFirst(217, 'export function generateId(prefix: string = ');
assertFirst(226, 'function intersectionSize(a: string[], b: string[]): number {');
assertFirst(234, 'function recencyScore(publishedAt: string): number {');
assert(A[240] === '}', `行 241 应为 recencyScore 收尾 }，实际 ${JSON.stringify(A[240])}`);
assertFirst(243, '// ── 核心引擎 ──');
assertFirst(251, 'export class CommunityMarketEngine {');
assertFirst(404, '  private applyFilter(cards: MarketCharacterCard[], filter: MarketFilter): MarketCharacterCard[] {');
assert(A[450] === '  }', `行 451 应为 applyFilter 收尾，实际 ${JSON.stringify(A[450])}`);
assertFirst(453, '  /**');
assertFirst(456, '  private applySort(cards: MarketCharacterCard[], sort: SortOption): MarketCharacterCard[] {');
assert(A[476] === '  }', `行 477 应为 applySort 收尾，实际 ${JSON.stringify(A[476])}`);
assertFirst(811, '  /**');
assertFirst(822, '  getRecommendations(params: RecommendationParams): RecommendationItem[] {');
assert(A[870] === '  }', `行 871 应为 getRecommendations 收尾，实际 ${JSON.stringify(A[870])}`);
assert(A[932] === '}', `行 933 应为 class 收尾 }，实际 ${JSON.stringify(A[932])}`);
assertFirst(935, '// ── Mock 数据 ──');
assertFirst(941, 'function createMockUsers(): MarketUser[] {');
assertFirst(985, 'function createMockCards(): Array<{');
assertFirst(1158, 'function createMockReviews(): Array<{');
assert(A[1219] === '}', `行 1220 应为 createMockReviews 收尾，实际 ${JSON.stringify(A[1219])}`);
assertFirst(1225, 'export function createMockEngine(): CommunityMarketEngine {');
assert(A[1267] === '}', `行 1268 应为 createMockEngine 收尾，实际 ${JSON.stringify(A[1267])}`);
assertFirst(1272, 'export default CommunityMarketEngine;');

// ────────────────────────────────────────────────────────────
// 1. community-market-types.ts —— 类型定义 + 工具函数
// ────────────────────────────────────────────────────────────
const typesLines = [
  '/**',
  ' * 社区市场 —— 类型定义与纯工具函数',
  ' *',
  ' * 从 community-market.ts 拆出（R4-7）。本模块**不依赖引擎**，只放数据形状与',
  ' * 无状态的字符串/数值工具，可被引擎、查询层、Mock 数据任意方向引用而无环。',
  ' */',
  '',
  "import type { CharacterCard } from './character-card';",
  '',
  ...seg(24, 210),
  '',
  // intersectionSize / recencyScore 原本是模块内私有，拆出后要给 queries 用 ⇒ 提为 export
  ...seg(212, 241)
    .map((l) => l
      .replace(/^function intersectionSize\(/, 'export function intersectionSize(')
      .replace(/^function recencyScore\(/, 'export function recencyScore(')),
  '',
];
assert(countTopExportFn(typesLines) === 3, `types 模块应有 generateId/intersectionSize/recencyScore 三个 export function，实际 ${countTopExportFn(typesLines)}`);
writeCRLF(resolve(HERE, '../../..', 'src/core/community-market-types.ts'), typesLines);

// ────────────────────────────────────────────────────────────
// 2. community-market-queries.ts —— 纯查询（筛选 / 排序 / 推荐）
// ────────────────────────────────────────────────────────────
// 原方法是类成员（缩进 2，方法体 4）；提为顶层函数后签名变 0、方法体落 2 ⇒ 整体去 2 空格的缩进
const dedent2 = (l) => (l.startsWith('  ') ? l.slice(2) : l);
const filterBody = seg(404, 451)
  .map((l) => l.replace(/^ {2}private applyFilter\(/, 'export function applyMarketFilter('))
  .map(dedent2);
const sortBody = seg(456, 477)
  .map((l) => l.replace(/^ {2}private applySort\(/, 'export function applyMarketSort('))
  .map(dedent2);

const recBlock = seg(822, 871).map((l) => l
  .replace(/^ {2}getRecommendations\(params: RecommendationParams\)/, 'export function computeRecommendations(\n  cardsMap: Map<string, MarketCharacterCard>,\n  params: RecommendationParams\n)')
  .replace(/this\.cards/g, 'cardsMap'));
// 方法体原缩进 4 空格，提升为函数体 2 空格
const recBody = recBlock.map(dedent2);
// 末行原为 '  }'（方法收尾），减 2 后变 '}' —— 与签名替换后的函数体一致
assert(recBody[recBody.length - 1] === '}', `推荐段末行应已归位为 }，实际 ${JSON.stringify(recBody[recBody.length - 1])}`);

const queriesLines = [
  '/**',
  ' * 社区市场 —— 纯查询与推荐算法',
  ' *',
  ' * 从 community-market.ts 拆出（R4-7）。三个函数全部无副作用：只读传入的',
  ' * 角色卡集合，不写 Map、不留状态，因此引擎可以安全地把方法转发到这里。',
  ' *',
  ' * 加权评分（getRecommendations 原算法，权重未改动）：',
  ' * - 标签匹配 40%（Jaccard 相似度）',
  ' * - 评分 30%（averageRating / 5）',
  ' * - 流行度 20%（log10 归一化下载量）',
  ' * - 新鲜度 10%（发布时间衰减）',
  ' */',
  '',
  "import type {",
  '  MarketCharacterCard,',
  '  MarketFilter,',
  '  SortOption,',
  '  RecommendationParams,',
  '  RecommendationItem,',
  "} from './community-market-types';",
  "import { intersectionSize, recencyScore } from './community-market-types';",
  '',
  '// ── 筛选 ──',
  '',
  ...filterBody,
  '',
  '// ── 排序 ──',
  '',
  ...sortBody,
  '',
  '// ── 推荐 ──',
  '',
  ...recBody,
  '',
];
assert(countTopExportFn(queriesLines) === 3, `queries 模块应有 3 个 export function，实际 ${countTopExportFn(queriesLines)}`);
assert(!/this\./.test(queriesLines.join('\n')), 'queries 模块不应残留 this 引用');
writeCRLF(resolve(HERE, '../../..', 'src/core/community-market-queries.ts'), queriesLines);

// ────────────────────────────────────────────────────────────
// 3. community-market-mock.ts —— Mock 数据生成
// ────────────────────────────────────────────────────────────
const mockLines = [
  '/**',
  ' * 社区市场 —— Mock 数据',
  ' *',
  ' * 从 community-market.ts 拆出（R4-7）。项目无后端，社区市场用本地预置数据',
  ' * 模拟真实市场；这里只放「造数据」的函数，引擎装配（createMockEngine）留在',
  ' * 宿主，避免 Mock 模块反向依赖引擎类形成环。',
  ' *',
  ' * 注意：本段整体处于 i18n-ignore 块内（模型面/mock 数据，非 UI 文案）。',
  ' */',
  '',
  "import type { CharacterCard } from './character-card';",
  "import type { MarketUser } from './community-market-types';",
  '',
  '// i18n-ignore-start  // 模型面提示词 / mock 数据，非 UI 文案（待翻译）',
  // 三个造数函数原本是模块内私有，拆出后要给宿主 createMockEngine 用 ⇒ 提为 export
  ...seg(941, 1220).map((l) => l
    .replace(/^function createMockUsers\(/, 'export function createMockUsers(')
    .replace(/^function createMockCards\(/, 'export function createMockCards(')
    .replace(/^function createMockReviews\(/, 'export function createMockReviews(')),
  '// i18n-ignore-end',
  '',
];
assert(countTopExportFn(mockLines) === 3, `mock 模块应有三个 export function，实际 ${countTopExportFn(mockLines)}`);
for (const fn of ['createMockUsers', 'createMockCards', 'createMockReviews']) {
  assert(mockLines.some((l) => new RegExp(`^(export )?function ${fn}\\(`).test(l)), `mock 模块缺 ${fn}`);
}
writeCRLF(resolve(HERE, '../../..', 'src/core/community-market-mock.ts'), mockLines);

// ────────────────────────────────────────────────────────────
// 4. 宿主 community-market.ts —— 引擎类 + 装配 + 公共面 re-export
// ────────────────────────────────────────────────────────────
const engineBody = seg(243, 933);

// listCards 内两处私有方法转发改为直接调自由函数
let engineText = engineBody.join('\n');
const beforeFilterCall = engineText;
engineText = engineText.replace(
  '    result = this.applyFilter(result, effectiveFilter);',
  '    result = applyMarketFilter(result, effectiveFilter);'
);
assert(engineText !== beforeFilterCall, 'listCards 内 this.applyFilter 替换未命中');
const beforeSortCall = engineText;
engineText = engineText.replace(
  '    result = this.applySort(result, sort);',
  '    result = applyMarketSort(result, sort);'
);
assert(engineText !== beforeSortCall, 'listCards 内 this.applySort 替换未命中');

// 私有的 applyFilter / applySort 整体删除（已上提为自由函数）
const filterStart = engineText.indexOf('\n  /**\n   * 应用筛选条件\n   */\n');
const sortStart = engineText.indexOf('\n  /**\n   * 应用排序\n   */\n');
assert(filterStart > 0 && sortStart > filterStart, '找不到 applyFilter/applySort 注释块');
const afterSort = engineText.indexOf('\n  /**\n   * 获取全部分类标签\n   */');
assert(afterSort > sortStart, '找不到 listCategories 注释块（用于截断）');
engineText = engineText.slice(0, filterStart) + engineText.slice(afterSort);

// getRecommendations 方法体（含 JSDoc）替换为一行转发
const recDocStart = engineText.indexOf('\n  /**\n   * 生成个性化推荐');
const recDocEnd = engineText.indexOf('\n  /**\n   * 获取统计信息\n   */');
assert(recDocStart > 0 && recDocEnd > recDocStart, '找不到 getRecommendations 注释块边界');
const forward = [
  '',
  '  /**',
  '   * 生成个性化推荐（算法见 community-market-queries.ts）',
  '   *',
  '   * @returns 按评分降序排列的推荐列表',
  '   */',
  '  getRecommendations(params: RecommendationParams): RecommendationItem[] {',
  '    return computeRecommendations(this.cards, params);',
  '  }',
].join('\n');
engineText = engineText.slice(0, recDocStart) + forward + engineText.slice(recDocEnd);

const engineLines = engineText.split('\n');
assert(!/this\.applyFilter|this\.applySort/.test(engineText), '宿主仍残留 this.applyFilter/applySort 调用');
assert(/getRecommendations\(params: RecommendationParams\)/.test(engineText), '宿主缺 getRecommendations 公有方法');
assert(/return computeRecommendations\(this\.cards, params\);/.test(engineText), 'getRecommendations 未转发到 queries 模块');

const hostLines = [
  '/**',
  ' * 角色卡社区市场引擎 (模块5)',
  ' *',
  ' * 由于项目无后端，社区市场以本地 Mock 数据 + 模拟流程实现：',
  ' * - 用户认证：本地模拟登录（用户名 + 头像，存入 localStorage）',
  ' * - 角色卡展示：预置 Mock 数据，支持搜索/筛选/排序',
  ' * - 评分评价：本地评分与评论（1-5 星 + 文本）',
  ' * - 交易流程：模拟下载/发布（无真实支付，仅记录交易状态）',
  ' * - 内容审核：举报机制 + 状态流转（pending → approved/rejected）',
  ' * - 推荐算法：基于标签匹配 + 评分 + 下载量 + 新鲜度的加权评分',
  ' *',
  ' * 本文件自 R4-7 起只保留引擎类本体与 Mock 装配层：',
  ' * - 类型与纯工具 → community-market-types.ts',
  ' * - 筛选/排序/推荐   → community-market-queries.ts',
  ' * - Mock 造数        → community-market-mock.ts',
  ' *',
  ' * 数据模型：',
  ' * - MarketUser：社区用户',
  ' * - MarketCharacterCard：发布到市场的角色卡',
  ' * - MarketReview：评分与评论',
  ' * - MarketTransaction：下载/发布交易记录',
  ' * - MarketReport：内容举报',
  ' */',
  '',
  "import type { CharacterCard } from './character-card';",
  "import { deepClone } from './json-utils';",
  "import { t } from '@/i18n';",
  "import type {",
  '  MarketUser,',
  '  MarketCharacterCard,',
  '  MarketReview,',
  '  MarketTransaction,',
  '  MarketFilter,',
  '  SortOption,',
  '  RecommendationItem,',
  '  RecommendationParams,',
  '  ReportReason,',
  '  ReportStatus,',
  '  ModerationStatus,',
  '  MarketReport,',
  '  SerializedMarketData,',
  "} from './community-market-types';",
  "import { generateId } from './community-market-types';",
  "import { applyMarketFilter, applyMarketSort, computeRecommendations } from './community-market-queries';",
  "import { createMockUsers, createMockCards, createMockReviews } from './community-market-mock';",
  '',
  '// 公共面保持不变：外部一律从本模块拿，拆分对调用方零影响',
  'export type {',
  '  MarketUser,',
  '  MarketCharacterCard,',
  '  MarketReview,',
  '  MarketTransaction,',
  '  MarketFilter,',
  '  SortOption,',
  '  RecommendationItem,',
  '  RecommendationParams,',
  '  ReportReason,',
  '  ModerationStatus,',
  '  MarketReport,',
  '  SerializedMarketData,',
  '  TransactionType,',
  '  TransactionStatus,',
  '  ReportStatus,',
  "} from './community-market-types';",
  "export { generateId } from './community-market-types';",
  '',
  ...engineLines,
  '',
  '// ── Mock 装配 ──',
  '',
  ...seg(1222, 1268),
  '',
  '// ── 默认导出 ──',
  '',
  'export default CommunityMarketEngine;',
  '',
];

assert(hostLines.filter((l) => l === 'export default CommunityMarketEngine;').length === 1, '宿主应只有一处 default export');
writeCRLF(resolve(HERE, '../../..', 'src/core/community-market.ts'), hostLines);

console.log('OK');
console.log('  community-market-types.ts   ', typesLines.length);
console.log('  community-market-queries.ts ', queriesLines.length);
console.log('  community-market-mock.ts    ', mockLines.length);
console.log('  community-market.ts (host)  ', hostLines.length);
console.log('  total                       ', typesLines.length + queriesLines.length + mockLines.length + hostLines.length);
