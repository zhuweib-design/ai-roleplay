/**
 * R4-16 行号切片生成器 —— services/chat-manager.ts 830 → 宿主 660 + 类型层 177
 *
 * 铁律（O-4 / O-11 / O-14 / O-15 / O-19 沿用）：
 *  ① 基准只读归档副本 chat-manager.orig.ts.txt，绝不读源文件
 *  ② seg(start,end) 越界/切空立即抛错
 *  ③ 断言一律 A[n-1]，行号用 sed -n 打印核对，不心算
 *  ④ 尾部空串先 pop()，让内存行数与 wc -l 对齐
 *  ⑤ CRLF 仓库：内存归一 LF，写回 writeCRLF（末尾换行必须补）
 *  ⑥ 手改完必须回填进本生成器，否则二次运行被覆盖
 *  ⑦ import 使用面判定先剥注释；死符号删除只认剥注释后的计数
 *
 * 切面（引用计数法）：45–201 三个 interface 为纯声明，对 class 实例状态
 * 引用计数 0，是本文件唯一自闭环切片。sendMessage 404 行单体切段必改
 * 控制流（R4-4 已证），不动。classifyChatError 留宿主（宿主仍 ≥ 660 行
 * 内舒适区，且 chat-error.ts 经宿主引用它，搬走纯属多余动作）。
 *
 * 宿主公开面零变化：3 个 interface 经 export type 再导出，5 个 src 消费方
 * + chat-error.ts + 3 个测试文件零改动。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');
const ORIG = join(HERE, 'chat-manager.orig.ts.txt');
const HOST = join(ROOT, 'src/services/chat-manager.ts');
const TYPES = join(ROOT, 'src/services/chat-manager-types.ts');

function fail(msg) {
  console.error(`ASSERT FAIL: ${msg}`);
  process.exit(1);
}
function assert(cond, msg) {
  if (!cond) fail(msg);
}
function assertLine(A, n, expected) {
  assert(A[n - 1] === expected, `第 ${n} 行应为 ${JSON.stringify(expected)}，实际 ${JSON.stringify(A[n - 1])}`);
}
function seg(A, start, end) {
  assert(start >= 1 && end >= start && end <= A.length, `seg(${start},${end}) 越界（总行数 ${A.length}）`);
  const out = A.slice(start - 1, end);
  assert(out.length === end - start + 1, `seg(${start},${end}) 切空`);
  return out;
}
function writeCRLF(path, text) {
  const t = text.endsWith('\n') ? text : `${text}\n`;
  writeFileSync(path, t.split('\n').join('\r\n'));
}

const A = readFileSync(ORIG, 'utf8').replace(/\r\n/g, '\n').split('\n');
while (A[A.length - 1] === '') A.pop();
assert(A.length === 830, `归档应 830 行，实际 ${A.length}`);

// ── 边界断言（行号全部 sed 实测） ──
assertLine(A, 44, '');
assertLine(A, 45, '/**');
assertLine(A, 46, ' * ChatManager 配置');
assertLine(A, 51, 'export interface ChatManagerConfig {');
assertLine(A, 125, 'export interface SendMessageParams {');
assertLine(A, 164, 'export interface ChatManagerCallbacks {');
assertLine(A, 201, '}');
assertLine(A, 202, '');
assertLine(A, 203, '/**');
assertLine(A, 218, 'export class ChatManager {');
assertLine(A, 802, "export function classifyChatError(err: Error): 'aborted' | 'api' | 'network' | 'unknown' {");
assertLine(A, 830, '}');
// 被引用的原 import 行逐行锚定（防行号漂移后静默拼错）
assertLine(A, 10, "import { ApiError } from '@api/types';");
assertLine(A, 12, "import { buildPrompt, type PromptContexts, type PromptSettings } from '@core/prompt-builder';");
assertLine(A, 13, "import { computeOutputBudget } from '@core/token-budget';");
assertLine(A, 15, "import type { CharacterCard, ChatMessage } from '@core/character-card';");
assertLine(A, 16, "import { ThinkingSplitter, parseThinkingComplete } from '@core/thinking-parser';");
assertLine(A, 18, 'import {');
assertLine(A, 24, "} from '@core/status-parser';");
assertLine(A, 25, "import { buildStatusInstruction } from '@core/status-prompt';");
assertLine(A, 26, "import type { CharacterStatus } from '@core/status-schema';");
assertLine(A, 28, 'import {');
assertLine(A, 34, "} from '@core/summarizer';");
assertLine(A, 41, "import { EMOTION_WORDS } from '@core/output-discipline';");
assertLine(A, 42, "import { t } from '@/i18n';");
assertLine(A, 43, "import { buildChatRuntimeContext, recordChatTurn, type ChatRuntimeIntegration } from '@/runtime';");

// ── 切片 ──
const TYPES_BLOCK = seg(A, 45, 201); // 157 行：3 接口 + 全部 JSDoc
const REST = seg(A, 203, 830); // 628 行：类 JSDoc + class + classifyChatError

// ── 宿主新 import 块 ──
// 剥注释实测 ONLY-TYPES 9 个死符号（ApiClient / ToolDefinition / ChatUsage /
// ReasoningEffort / RetryPolicy / PromptTraceItem / NarrationPerspective /
// OptimizationPipeline / L0L2Deps），随类型块一起搬走，宿主 import 同步收敛。
const HOST_IMPORTS = [
  `import type { ApiMessage, ChatRequest, ToolCall } from '@api/types';`,
  A[9],
  `import { withStreamRetry, DEFAULT_RETRY_POLICY } from '@api/llm-retry';`,
  A[11],
  A[12],
  `import { toPromptTraceItems } from '@core/lorebook-scanner';`,
  A[14],
  A[15],
  ...seg(A, 18, 24),
  A[24],
  A[25],
  `import { compressMessages } from '@core/optimization-pipeline';`,
  ...seg(A, 28, 34),
  `import { applyL0Context, applyOutputDiscipline, updateEmotionState } from '@core/l0-l2-runtime';`,
  A[40],
  A[41],
  A[42],
  `import type { ChatManagerConfig, SendMessageParams, ChatManagerCallbacks } from './chat-manager-types';`,
  `export type { ChatManagerConfig, SendMessageParams, ChatManagerCallbacks } from './chat-manager-types';`,
];

// ── 类型层 ──
const TYPES_HEADER = [
  '/**',
  ' * ChatManager —— 类型定义层',
  ' *',
  ' * 本层零函数、零副作用，只描述注入配置 / 发送参数 / 流式回调三套数据结构。',
  ' * ChatManager 类与外部消费方共同依赖它，放在依赖图最底层',
  ' *（R4-16 自 chat-manager.ts 整段切出，公开面经宿主 export type 再导出保持不变）。',
  ' */',
];
const TYPES_IMPORTS = [
  `import type { ApiClient } from '@api/api-client';`,
  `import type { ToolCall, ToolDefinition, ChatUsage, ReasoningEffort } from '@api/types';`,
  `import type { RetryPolicy } from '@api/llm-retry';`,
  `import type { PromptContexts } from '@core/prompt-builder';`,
  `import type { PromptTraceItem } from '@core/lorebook-scanner';`,
  `import type { CharacterCard, ChatMessage } from '@core/character-card';`,
  `import type { NarrationPerspective } from '@core/narration';`,
  `import type { CharacterStatus } from '@core/status-schema';`,
  `import type { OptimizationPipeline } from '@core/optimization-pipeline';`,
  `import type { SummarizationConfig, ConversationSummary } from '@core/summarizer';`,
  `import type { L0L2Deps } from '@core/l0-l2-runtime';`,
  `import type { ChatRuntimeIntegration } from '@/runtime';`,
];

const typesText = [...TYPES_HEADER, '', ...TYPES_IMPORTS, '', ...TYPES_BLOCK].join('\n');
const hostText = [...HOST_IMPORTS, '', ...REST].join('\n');

// ── 语义断言 ──
assert((typesText.match(/^export interface /gm) || []).length === 3, 'types 层应有且只有 3 个 interface');
assert(!/^export function /m.test(typesText), 'types 层不得含函数');
assert(!/^import (?!type)/m.test(typesText), 'types 层只许 import type');
assert(!/^export interface /m.test(hostText), '宿主不得残留 interface');
assert(hostText.includes('export class ChatManager {'), '宿主缺 ChatManager 类');
assert(hostText.includes("export function classifyChatError("), '宿主缺 classifyChatError');
const hostImportBlock = HOST_IMPORTS.join('\n');
for (const name of ['ApiClient', 'ToolDefinition', 'ChatUsage', 'ReasoningEffort', 'RetryPolicy',
  'PromptTraceItem', 'NarrationPerspective', 'OptimizationPipeline', 'L0L2Deps']) {
  assert(!new RegExp(`\\b${name}\\b`).test(hostImportBlock), `宿主 import 块残留死符号 ${name}`);
}
const typesImportBlock = TYPES_IMPORTS.join('\n');
for (const name of ['ApiClient', 'ToolCall', 'ToolDefinition', 'ChatUsage', 'ReasoningEffort', 'RetryPolicy',
  'PromptContexts', 'PromptTraceItem', 'CharacterCard', 'ChatMessage', 'NarrationPerspective', 'CharacterStatus',
  'OptimizationPipeline', 'SummarizationConfig', 'ConversationSummary', 'L0L2Deps', 'ChatRuntimeIntegration']) {
  assert(new RegExp(`\\b${name}\\b`).test(typesImportBlock), `types 层 import 缺 ${name}`);
}
const hostLines = hostText.split('\n').length;
const typesLines = typesText.split('\n').length;
assert(hostLines <= 800, `宿主 ${hostLines} 行仍超 800`);
assert(typesLines <= 800, `types 层 ${typesLines} 行超 800`);

writeCRLF(TYPES, typesText);
writeCRLF(HOST, hostText);
console.log(`OK: host ${hostLines} 行 / types ${typesLines} 行 / 合计 ${hostLines + typesLines}（原 830，${hostLines + typesLines - 830 >= 0 ? '+' : ''}${hostLines + typesLines - 830}）`);
