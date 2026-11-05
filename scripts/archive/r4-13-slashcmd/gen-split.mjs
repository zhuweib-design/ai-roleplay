/**
 * R4-13 行号切片生成器 —— slash-command.ts 859 → 四个模块
 *
 * 铁律（O-4 / O-11 / O-14 / O-15 / O-16 / O-17 / O-18 / O-19 沿用）：
 *  ① 基准只读归档副本，绝不读源文件
 *  ② seg(start,end) 越界/切空立即抛错
 *  ③ 断言一律 A[n-1]，行号用 sed -n 打印核对，不心算
 *  ④ 尾部空串先 pop()，让内存行数与 wc -l 对齐
 *  ⑤ CRLF 仓库：内存归一 LF，写回 writeCRLF（末尾换行必须补）
 *  ⑥ 手改完必须回填进本生成器，否则二次运行被覆盖
 *  ⑦ 参数/导出按「本层实际需要 + 所有消费者并集」判定（O-19 第 ① 条）
 *
 * 分层（依赖单向，无环）：
 *   slash-command-types.ts      纯类型（8 个 interface），零函数
 *        ↑
 *   slash-command-parser.ts     parsePipeline / parseCommand + 骰子与比较辅助
 *        ↑
 *   slash-command-builtin.ts    内置命令表（10 条，363 行）
 *        ↑
 *   slash-command.ts            执行引擎（本文件）+ 汇总出口
 *
 * 公开面：拆分前 8 个运行时导出（parsePipeline / parseCommand /
 * parseDiceExpression / rollDice / compareValues / isSlashCommand /
 * getBuiltinCommands / executePipeline）+ 8 个类型，宿主逐个显式 re-export，
 * 不用 `export *`（O-14 / O-18 第 ③ 条）。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'scripts/archive/r4-13-slashcmd/slash-command.orig.ts.txt');
const raw = readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');
const A = raw.split('\n');
while (A[A.length - 1] === '') A.pop();
if (A.length !== 859) throw new Error(`归档行数应为 859，实际 ${A.length}`);

// ── 结构断言（行号已 sed 逐行核对） ───────────────────────────
function assertLine(n, x, tag) {
  const got = A[n - 1];
  if (got !== x) {
    throw new Error(`[${tag}] 第 ${n} 行不符\n  期望: ${JSON.stringify(x)}\n  实际: ${JSON.stringify(got)}`);
  }
}
assertLine(1, '// F11.1 斜杠命令系统核心引擎', '文件头');
assertLine(5, "import type { SlashCommand, SlashCommandResult } from './extension-types';", 'extension-types import');
assertLine(6, "import type { VariableMap, MacroContext } from './macro';", 'macro type import');
assertLine(7, "import { replaceMacros } from './macro';", 'macro value import');
assertLine(8, '// i18n-ignore-start  // 模型面提示词 / mock / 种子目录，非 UI 文案（待翻译）', 'i18n 块起');
assertLine(14, '/** 斜杠命令执行上下文 */', 'types 首');
assertLine(15, 'export interface SlashCommandContext {', 'SlashCommandContext');
assertLine(39, 'export interface StoryTimeCommandContext {', 'StoryTimeCommandContext');
assertLine(60, 'export interface EventsCommandContextEvent {', 'EventsCommandContextEvent');
assertLine(68, 'export interface EventsCommandContext {', 'EventsCommandContext');
assertLine(80, 'export interface CommandResult {', 'CommandResult');
assertLine(96, 'export interface ParsedCommand {', 'ParsedCommand');
assertLine(106, 'export interface ParsedPipeline {', 'ParsedPipeline');
assertLine(114, 'export interface BuiltInCommand {', 'BuiltInCommand');
assertLine(123, '}', 'BuiltInCommand 闭');
assertLine(129, '/**', 'parsePipeline JSDoc 开');
assertLine(140, 'export function parsePipeline(input: string): ParsedPipeline {', 'parsePipeline');
assertLine(230, 'export function parseCommand(segment: string): ParsedCommand {', 'parseCommand');
assertLine(269, '}', 'parseCommand 闭');
assertLine(275, '/**', 'parseDiceExpression JSDoc 开');
assertLine(279, 'export function parseDiceExpression(expr: string): { count: number; faces: number } | null {', 'parseDiceExpression');
assertLine(293, 'export function rollDice(count: number, faces: number): number[] {', 'rollDice');
assertLine(305, 'export function compareValues(', 'compareValues');
assertLine(334, 'export function isSlashCommand(input: string): boolean {', 'isSlashCommand');
assertLine(337, '}', 'isSlashCommand 闭');
assertLine(343, '/**', 'getBuiltinCommands JSDoc 开');
assertLine(347, 'export function getBuiltinCommands(): BuiltInCommand[] {', 'getBuiltinCommands');
assertLine(705, '}', 'getBuiltinCommands 闭');
assertLine(711, '/**', 'applyMacrosToArgs JSDoc 开');
assertLine(715, 'function applyMacrosToArgs(', 'applyMacrosToArgs');
assertLine(752, 'export async function executePipeline(', 'executePipeline');
assertLine(858, '}', 'executePipeline 闭');
assertLine(859, '// i18n-ignore-end', 'i18n 块闭');

function seg(start, end, tag) {
  if (!(start >= 1 && end <= A.length && start <= end)) {
    throw new Error(`[${tag}] 区间越界: ${start}-${end}（共 ${A.length} 行）`);
  }
  const out = A.slice(start - 1, end);
  if (out.join('').trim() === '') throw new Error(`[${tag}] 切出空片段: ${start}-${end}`);
  return out;
}
// ── ① types（纯类型层，零函数） ───────────────────────────────
const typeBody = seg(14, 123, 'types');
{
  const n = typeBody.filter((l) => l.startsWith('export interface ')).length;
  if (n !== 8) throw new Error(`[types] interface 应为 8 个，实际 ${n}`);
  const fn = typeBody.filter((l) => /\b(function|=>\s*\{)/.test(l) && !l.trim().startsWith('*'));
  // interface 里的回调签名（onAdvance/getStatus 等）是类型成员，不是实现
  const impl = typeBody.filter((l) => /^\s*(export )?function /.test(l));
  if (impl.length > 0) throw new Error(`[types] 不应含函数实现：\n${impl.join('\n')}`);
  if (fn.length > 0 && impl.length > 0) throw new Error('[types] 判定异常');
}
const typesLines = [
  '/**',
  ' * 斜杠命令 —— 类型定义层',
  ' *',
  ' * 本层零函数、零副作用，只描述数据结构。parser / builtin / 执行引擎三层',
  ' * 共同依赖它，因此放在依赖图最底层。',
  ' */',
  '',
  "import type { SlashCommand } from './extension-types';",
  "import type { VariableMap } from './macro';",
  '',
  ...typeBody,
];

// ── ② parser（解析函数 + 骰子/比较辅助） ──────────────────────
const parserBody = seg(129, 337, 'parser');
{
  const n = parserBody.filter((l) => l.startsWith('export function ')).length;
  if (n !== 6) throw new Error(`[parser] 导出函数应为 6 个，实际 ${n}`);
  const bad = parserBody.filter((l) => /\b(ctx|replaceMacros|BuiltInCommand|CommandResult|SlashCommandContext)\b/.test(l));
  if (bad.length > 0) throw new Error(`[parser] 不应依赖上下文/内置命令类型：\n${bad.join('\n')}`);
}
const parserLines = [
  '/**',
  ' * 斜杠命令 —— 解析层',
  ' *',
  ' * 纯函数：把用户输入切成命令管道、切出单条命令、解析骰子表达式与比较规则。',
  ' * 不读全局状态、不依赖执行上下文，可单独测试。',
  ' */',
  '',
  "import type { ParsedCommand, ParsedPipeline } from './slash-command-types';",
  '',
  ...parserBody,
];

// ── ③ builtin（内置命令表） ───────────────────────────────────
const builtinBody = seg(343, 705, 'builtin');
{
  const n = builtinBody.filter((l) => l.startsWith('export function ')).length;
  if (n !== 1) throw new Error(`[builtin] 导出函数应为 1 个（getBuiltinCommands），实际 ${n}`);
  const names = builtinBody.filter((l) => /^ {6}name: '/.test(l)).length;
  // 实测 12 条：roll/echo/pass/if/setvar/getvar/delay/abort/imagine/time/event/help
  // 源文件头注释仍写 10 条（/time、/event 是 F16.4/F17.2 后加的），本轮一并订正
  if (names !== 12) throw new Error(`[builtin] 内置命令应为 12 条，实际 ${names}`);
  // 只允许依赖 parser 的三个纯函数
  const bad = builtinBody.filter((l) => /\b(parsePipeline|parseCommand|isSlashCommand|replaceMacros|executePipeline)\b/.test(l));
  if (bad.length > 0) throw new Error(`[builtin] 依赖了不该依赖的符号：\n${bad.join('\n')}`);
}
const builtinLines = [
  '/**',
  ' * 斜杠命令 —— 内置命令表',
  ' *',
  ' * 12 条内置命令（roll / echo / pass / if / setvar / getvar / delay / abort /',
  ' * imagine / time / event / help），全部是纯数据 + 闭包，不读 store、不碰 i18n 字典。',
  ' * 依赖只有解析层的三个纯函数，因此可以独立加载与测试。',
  ' */',
  '',
  "import { compareValues, parseDiceExpression, rollDice } from './slash-command-parser';",
  "import type { BuiltInCommand, SlashCommandContext } from './slash-command-types';",
  '',
  // 内置命令的 message 是模型面回执（显示在对话区），不是 UI 文案，
  // 与宿主文件同一豁免口径：i18n-scan 的块级标记按文件生效，拆分后
  // 每个含中文字面量的模块都必须自带一对（否则 strict 门禁直接红）。
  '// i18n-ignore-start  // 命令回执是模型面文本（显示在对话区），非 UI 文案（待翻译）',
  '',
  ...builtinBody,
  '// i18n-ignore-end',
];

// ── ④ 宿主（执行引擎 + 汇总出口） ─────────────────────────────
const engineBody = seg(711, 858, 'engine');
{
  const n = engineBody.filter((l) => l.startsWith('export async function executePipeline(')).length;
  if (n !== 1) throw new Error(`[engine] executePipeline 应为 1 个，实际 ${n}`);
  const fn = engineBody.filter((l) => l.startsWith('function applyMacrosToArgs(')).length;
  if (fn !== 1) throw new Error(`[engine] applyMacrosToArgs 应为 1 个，实际 ${fn}`);
}

const hostLines = [
  '// F11.1 斜杠命令系统核心引擎',
  '// 解析以 / 开头的命令、支持 | 管道传递、|| 阻断管道',
  '// 内置命令：/roll /echo /pass /if /setvar /getvar /delay /abort /imagine /time /event /help',
  '//',
  '// 文件分层（依赖单向，无环）：',
  '//',
  '//   slash-command-types.ts      纯类型（8 个 interface），零函数',
  '//        ↑',
  '//   slash-command-parser.ts     parsePipeline / parseCommand + 骰子与比较辅助',
  '//        ↑',
  '//   slash-command-builtin.ts    内置命令表（12 条）',
  '//        ↑',
  '//   slash-command.ts            执行引擎（本文件）+ 汇总出口',
  '//',
  '// 本文件只保留执行引擎（管道编排、宏替换、扩展命令优先级）与 re-export，',
  '// 公开面与拆分前逐字一致：8 个运行时导出 + 8 个类型，逐个显式列举。',
  '',
  "import type { SlashCommand, SlashCommandResult } from './extension-types';",
  "import type { MacroContext, VariableMap } from './macro';",
  "import { replaceMacros } from './macro';",
  "import { isSlashCommand, parsePipeline } from './slash-command-parser';",
  "import { getBuiltinCommands } from './slash-command-builtin';",
  'import type {',
  '  BuiltInCommand,',
  '  CommandResult,',
  '  SlashCommandContext,',
  "} from './slash-command-types';",
  '',
  '// i18n-ignore-start  // 模型面提示词 / mock / 种子目录，非 UI 文案（待翻译）',
  '',
  'export type {',
  '  BuiltInCommand,',
  '  CommandResult,',
  '  EventsCommandContext,',
  '  EventsCommandContextEvent,',
  '  ParsedCommand,',
  '  ParsedPipeline,',
  '  SlashCommandContext,',
  '  StoryTimeCommandContext,',
  "} from './slash-command-types';",
  'export {',
  '  compareValues,',
  '  isSlashCommand,',
  '  parseCommand,',
  '  parseDiceExpression,',
  '  parsePipeline,',
  '  rollDice,',
  "} from './slash-command-parser';",
  "export { getBuiltinCommands } from './slash-command-builtin';",
  '',
  '// ─────────────────────────────────────────────────────────────',
  '// 执行引擎',
  '// ─────────────────────────────────────────────────────────────',
  '',
  ...engineBody,
  '// i18n-ignore-end',
];

// 断言：宿主不得残留已搬走的实现
{
  const moved = ['parsePipeline', 'parseCommand', 'parseDiceExpression', 'rollDice', 'compareValues', 'getBuiltinCommands'];
  const impl = hostLines.filter((l) => moved.some((m) => l.startsWith(`export function ${m}(`)));
  if (impl.length > 0) throw new Error(`[host] 残留已搬走的实现：\n${impl.join('\n')}`);
  const n = hostLines.filter((l) => l.startsWith('export async function ')).length;
  if (n !== 1) throw new Error(`[host] 应只有 executePipeline 一个异步导出，实际 ${n}`);
}

// ── 写出（CRLF 仓库，写回时还原；末尾换行必须补） ─────────────
const writeCRLF = (path, text) => {
  const norm = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n');
  const withEol = norm.endsWith('\n') ? norm : `${norm}\n`;
  writeFileSync(path, withEol.replace(/\n/g, '\r\n'), 'utf8');
  return withEol.split('\n').length;
};

const counts = {};
counts['slash-command-types.ts'] = writeCRLF(join(ROOT, 'src/core/slash-command-types.ts'), typesLines.join('\n'));
counts['slash-command-parser.ts'] = writeCRLF(join(ROOT, 'src/core/slash-command-parser.ts'), parserLines.join('\n'));
counts['slash-command-builtin.ts'] = writeCRLF(join(ROOT, 'src/core/slash-command-builtin.ts'), builtinLines.join('\n'));
counts['slash-command.ts'] = writeCRLF(join(ROOT, 'src/core/slash-command.ts'), hostLines.join('\n'));

for (const [name, n] of Object.entries(counts)) console.log(`${name}\t${n - 1} 行`);
