/**
 * R4-14：community-market store 拆分生成器
 *
 * 基准：scripts/archive/r4-14-cmarket/community-market.orig.ts.txt（只读归档，868 行）
 * 产物：src/stores/community-market/remote.ts + 改写后的 src/stores/community-market.ts
 *
 * 形态选择（R2-5 先例，`src/stores/settings/` 已验证）：
 * 远程市场域整体提成 `createRemoteMarketActions(ctx)` 工厂，宿主保留 ref 与 helper。
 * 该域内 engine / commitTick / currentUser 引用数均为 0 —— 唯一完全自闭环的业务域。
 *
 * 铁律（DEV_PLAN §7.12）：
 * - 只读归档基准，不读源文件（二次跑会切空）
 * - 越界/切空立即抛错
 * - 内存归一 LF，写回 CRLF
 * - 行号断言一律 A[n-1]
 */
import { readFileSync, writeFileSync } from 'node:fs';

const ORIG = 'scripts/archive/r4-14-cmarket/community-market.orig.ts.txt';
const HOST = 'src/stores/community-market.ts';
const REMOTE = 'src/stores/community-market/remote.ts';

const A = readFileSync(ORIG, 'utf8').replace(/\r\n/g, '\n').split('\n');
// O-15：文件以换行结尾时 split 会多出尾部空串
while (A.length > 0 && A[A.length - 1] === '') A.pop();

if (A.length !== 868) throw new Error(`归档行数应为 868，实测 ${A.length}`);

/** 行号一律按 A[n-1] 取，n 为归档中的 1-based 行号 */
function assertLine(n, expect, label) {
  const actual = A[n - 1];
  if (actual === undefined) throw new Error(`[${label}] 行 ${n} 越界（归档共 ${A.length} 行）`);
  if (actual !== expect) {
    throw new Error(`[${label}] 行 ${n} 不匹配\n  期望: ${JSON.stringify(expect)}\n  实测: ${JSON.stringify(actual)}`);
  }
}

// ── 边界断言 ──
assertLine(381, '', '远程域前置空行');
assertLine(382, '  // ── 动作：远程市场（T-11 真实下载流） ──', '远程域分节注释');
assertLine(383, '', '远程域后置空行');
assertLine(384, '  /** 拉取远程市场索引清单（GitHub） */', '切片首行');
assertLine(411, '  async function installRemoteItem(itemId: string): Promise<string | null> {', 'installRemoteItem 签名');
assertLine(441, '  async function importRemoteAsCharacter(downloaded: DownloadedMarketItem): Promise<string> {', 'importRemoteAsCharacter 签名');
assertLine(474, '  function getUpdatableInstalls(): {', 'getUpdatableInstalls 签名');
assertLine(503, '  }', '切片末行');
assertLine(504, '', '切片后空行');
assertLine(505, '  // ── 动作：收藏 ──', '收藏域分节注释');

// ── 切片：384..503（120 行，不含分节注释与前后空行） ──
const SLICE_FROM = 384;
const SLICE_TO = 503;
const body = A.slice(SLICE_FROM - 1, SLICE_TO);

if (body.length !== 120) throw new Error(`切片应为 120 行，实测 ${body.length}`);
if (body.some((l) => l === undefined)) throw new Error('切片含 undefined —— 越界');
if (body.length === 0 || body.every((l) => l.trim() === '')) throw new Error('切片为空');

// ── 语义断言：切片确实只含目标四个函数 ──
const asyncFns = body.filter((l) => /^ {2}async function \w+\(/.test(l));
const syncFns = body.filter((l) => /^ {2}function \w+\(/.test(l));
if (asyncFns.length !== 3) throw new Error(`切片内 async 顶层函数应为 3 个，实测 ${asyncFns.length}:\n${asyncFns.join('\n')}`);
if (syncFns.length !== 1) throw new Error(`切片内同步顶层函数应为 1 个，实测 ${syncFns.length}:\n${syncFns.join('\n')}`);

const names = [...asyncFns, ...syncFns].map((l) => /function (\w+)/.exec(l)[1]).sort();
const expected = ['getUpdatableInstalls', 'importRemoteAsCharacter', 'installRemoteItem', 'loadRemoteIndex'];
if (JSON.stringify(names) !== JSON.stringify(expected)) {
  throw new Error(`切片函数名不符\n  期望: ${expected.join(', ')}\n  实测: ${names.join(', ')}`);
}

// ── 语义断言：远程域不碰实例封闭符号（这是它成为切面的依据） ──
for (const forbidden of ['engine', 'commitTick', 'currentUser']) {
  const hit = body.findIndex((l) => new RegExp(`\\b${forbidden}\\b`).test(l));
  if (hit >= 0) throw new Error(`切片内出现封闭符号 ${forbidden}（第 ${SLICE_FROM + hit} 行）—— 切面假设失效:\n${body[hit]}`);
}

// ── 语义断言：切片无顶层 export（保持工厂内私有） ──
const topExport = body.findIndex((l) => /^export /.test(l));
if (topExport >= 0) throw new Error(`切片含顶层 export（偏移 ${topExport}）:\n${body[topExport]}`);

// ── 语义断言：ctx 字段确实被用到 ──
const used = ['remoteItems', 'remoteLoading', 'remoteError', 'downloadProgress', 'installedOrigins', 'lastError', 'lastInfo', 'persistMeta'];
const joined = body.join('\n');
const unused = used.filter((s) => !new RegExp(`\\b${s}\\b`).test(joined));
if (unused.length > 0) throw new Error(`ctx 字段声明了但切片未使用：${unused.join(', ')}`);

// ── 语义断言：函数仍全为 export 到返回值（不依赖函数声明提升） ──
if (!joined.includes('async function loadRemoteIndex')) throw new Error('缺少 loadRemoteIndex');

// ── 生成 remote.ts ──
const header = `import { t } from '@/i18n';
import {
  MARKET_INDEX_URL,
  fetchMarketIndex,
  downloadMarketItem,
  parseCharacterItem,
  type MarketIndexItem,
  type DownloadedMarketItem,
} from '@/core/market-index';
import { importV2Card } from '@/core/character-card';
import { cardToUiChar } from '@/services/type-adapters';
import { useCharacterStore } from '@/stores/character';
import type { Ref } from 'vue';

/**
 * R4-14：community-market store 的远程市场域。
 *
 * 这一域是 store 内唯一完全自闭环的业务域 —— 全程不碰 market engine 实例、
 * 不碰 \`commitTick\`（引擎快照持久化）、不碰 \`currentUser\`（登录态）。
 * 它只读写自己那五个 ref，并通过 \`persistMeta\` 落盘安装来源。
 *
 * 引用是宿主传进来的同一份 ref，拆文件不改变 Pinia 的响应式边界。
 */
export interface RemoteMarketCtx {
  remoteItems: Ref<MarketIndexItem[]>;
  remoteLoading: Ref<boolean>;
  remoteError: Ref<string | null>;
  downloadProgress: Ref<Record<string, { received: number; total: number; status: string }>>;
  installedOrigins: Ref<Record<string, { itemId: string; version: string }>>;
  lastError: Ref<string | null>;
  lastInfo: Ref<string | null>;
  /** 由宿主提供：落盘当前用户 / 收藏 / 安装来源 */
  persistMeta: () => Promise<void>;
}

export function createRemoteMarketActions(ctx: RemoteMarketCtx) {
  const {
    remoteItems,
    remoteLoading,
    remoteError,
    downloadProgress,
    installedOrigins,
    lastError,
    lastInfo,
    persistMeta,
  } = ctx;
`;

// body 保留原始 2 空格缩进（工厂体内与 store 体内一致）
const remoteFile = [header, ...body, '', '  return {', '    loadRemoteIndex,', '    installRemoteItem,', '    getUpdatableInstalls,', '  };', '}', ''].join('\n');

// ── 改写宿主 ──
const hostLines = [...A];
// 382..504 → 调用点（保留分节注释与末尾空行）
const callSite = [
  '  // ── 动作：远程市场（T-11 真实下载流） ──',
  '',
  '  const remote = createRemoteMarketActions({',
  '    remoteItems,',
  '    remoteLoading,',
  '    remoteError,',
  '    downloadProgress,',
  '    installedOrigins,',
  '    lastError,',
  '    lastInfo,',
  '    persistMeta,',
  '  });',
  '',
];
hostLines.splice(381, 504 - 382 + 1, ...callSite);

let hostOut = hostLines.join('\n');

// ── 宿主改造：return 面三项转发到 remote ──
const returnOld = `    loadRemoteIndex,
    installRemoteItem,
`;
const returnNew = `    loadRemoteIndex: remote.loadRemoteIndex,
    installRemoteItem: remote.installRemoteItem,
`;
if (!hostOut.includes(returnOld)) throw new Error('宿主 return 面未找到 loadRemoteIndex / installRemoteItem 相邻两行');
hostOut = hostOut.replace(returnOld, returnNew);

const updOld = `    getUpdatableInstalls,\n`;
const updNew = `    getUpdatableInstalls: remote.getUpdatableInstalls,\n`;
if (!hostOut.includes(updOld)) throw new Error('宿主 return 面未找到 getUpdatableInstalls');
hostOut = hostOut.replace(updOld, updNew);

// ── 宿主改造：删掉搬走的 import，补上新工厂 import ──
const importOld = `import {
  MARKET_INDEX_URL,
  fetchMarketIndex,
  downloadMarketItem,
  parseCharacterItem,
  type MarketIndexItem,
  type DownloadedMarketItem,
} from '@/core/market-index';
import { importV2Card } from '@/core/character-card';
import { cardToUiChar } from '@/services/type-adapters';
import { useCharacterStore } from './character';
`;
const importNew = `import { type MarketIndexItem } from '@/core/market-index';
import { useCharacterStore } from './character';
import { createRemoteMarketActions } from './community-market/remote';
`;
if (!hostOut.includes(importOld)) throw new Error('宿主 import 块未按预期匹配');
hostOut = hostOut.replace(importOld, importNew);

// ── 产物校验 ──
if (!hostOut.includes("from './community-market/remote'")) throw new Error('宿主未引入工厂');
if (hostOut.includes('createMockEngine()')) {
  // _resetForTesting 仍用 createMockEngine，属正常
}
const remainEngineCalls = (hostOut.match(/engine\.(loadRemoteIndex|installRemoteItem|getUpdatableInstalls)/g) || []).length;
if (remainEngineCalls > 0) throw new Error('宿主仍残留远程域 engine 调用');

const writeCRLF = (p, s) => writeFileSync(p, s.replace(/\n/g, '\r\n'), 'utf8');
writeCRLF(REMOTE, remoteFile);
writeCRLF(HOST, hostOut);

const hostCount = hostOut.split('\n').length;
console.log(`remote.ts  ${remoteFile.split('\n').length - 1} 行`);
console.log(`host       ${hostCount - 1} 行`);
console.log(`切片函数   ${names.join(', ')}`);
