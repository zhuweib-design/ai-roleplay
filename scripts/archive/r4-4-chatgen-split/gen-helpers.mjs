// R4-4 步骤1：抽出顶部四个纯函数到 chat-generation-helpers.ts
// 铁律：基准只读归档副本；切片越界/切空直接抛错
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');
const ORIG = join(HERE, 'chat-generation.orig.ts.txt');
const CRLF = '\r\n';
const writeCRLF = (p, s) => writeFileSync(p, s.replace(/\r?\n/g, CRLF));
function linesOf(text) {
  const arr = text.split('\n');
  if (arr.length > 0 && arr[arr.length - 1] === '') arr.pop();
  return arr;
}
const orig = linesOf(readFileSync(ORIG, 'utf8').replace(/\r\n/g, '\n'));

function slice(a, b, label) {
  if (!(a >= 1 && b >= a && b <= orig.length)) {
    throw new Error(`[${label}] 行号越界: ${a}-${b} / 总 ${orig.length}`);
  }
  const out = orig.slice(a - 1, b);
  if (out.join('').trim() === '') throw new Error(`[${label}] 切空: ${a}-${b}`);
  return out;
}

// 边界断言（按归档基准行号）
const expect = {
  89: '/** 合并关键词 RAG 与向量 RAG',
  208: '}',
  209: '',
  210: 'export const useChatGenerationStore',
};
for (const [ln, prefix] of Object.entries(expect)) {
  const line = orig[Number(ln) - 1];
  if (!line.includes(prefix)) {
    throw new Error(`边界断言失败 @${ln}: 期待含 "${prefix}"，实际 "${line}"`);
  }
}

const body = slice(89, 208, 'helpers');

const header = `/**
 * chat-generation-helpers — 生成引擎的纯函数工具（R4-4 拆分）
 *
 * 从 chat-generation.ts 抽出，**零 store 依赖**：只做类型转换与去重合并，
 * 便于单独推理与复用。宿主通过普通 import 使用。
 */
import { ApiError } from '../api/types';
import type { ApiErrorKind } from '../api/types';
import type { ChatManagerConfig } from '../services/chat-manager';
import type { useDataBankStore } from './data-bank';
import type { buildChatSessionContext } from './chat-context';
import type { VectorRagSource } from '@/core/dual-channel-runtime';

`;

// 纯函数需要 export 前缀
const exported = body.map((line) =>
  line.startsWith('function ') ? `export ${line}` : line
);
const exportedCount = exported.filter((l) => l.startsWith('export function ')).length;
if (exportedCount !== 4) {
  throw new Error(`export 化数量不符：期待 4，实际 ${exportedCount}`);
}

writeCRLF(join(ROOT, 'src', 'stores', 'chat-generation-helpers.ts'), header + exported.join('\n') + '\n');
console.log('[gen-helpers] 写出 chat-generation-helpers.ts，正文行数', exported.length);

// ── 宿主侧：删 89-208，插入 import ──
const host = readFileSync(join(ROOT, 'src', 'stores', 'chat-generation.ts'), 'utf8').replace(/\r\n/g, '\n');
const hostLines = linesOf(host);
if (hostLines.length !== 1501) throw new Error(`宿主行数已变化：${hostLines.length} ≠ 1501`);
const oldBlock = orig.slice(88, 208).join('\n');
if (!host.includes(oldBlock)) throw new Error('宿主中未找到待删块（89-208）');
const hostNoBlock = host.replace(oldBlock, '');
if (hostNoBlock === host) throw new Error('删除未生效');

const anchor = "import { useChatRuntimeStore } from './chat-runtime';";
if (!hostNoBlock.includes(anchor)) throw new Error('import 锚点缺失');
const withImport = hostNoBlock.replace(
  anchor,
  anchor +
    '\nimport {\n  mergeRagContext,\n  staticVectorSources,\n  toLastErrorRecord,\n  buildSamplingConfigPatch,\n} from \'./chat-generation-helpers\';'
);

// 收紧多余空行（连续三空行 → 一空行）
const tidied = withImport.replace(/\n{3,}/g, '\n\n');
writeCRLF(join(ROOT, 'src', 'stores', 'chat-generation.ts'), tidied);
console.log('[gen-helpers] 宿主已改写，行数', tidied.split('\n').length);
