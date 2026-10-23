/**
 * R4-8 切片生成器：src/core/random-event-generator.ts (1062 行) → 4 层 + barrel
 *
 * 铁律（DEV_PLAN §7.12 O-4 / O-11 / O-14）：
 * - 基准只读归档副本 *.orig.ts.txt，绝不读源文件（源文件边生成边被覆写）
 * - seg() 越界 / 切空立即抛错，不静默回空串
 * - 边界字符串逐字符从归档拷，行号一律 sed -n 'a,b p' 打印核对，禁止心算
 * - 内存归一 LF，写回 CRLF（仓库是 CRLF）
 *
 * 四层依赖（已实测，单向无环）：
 *   core      ← factories
 *   core      ← runtime
 *   types     ← factories
 *   types     ← runtime
 *   factories 与 runtime 互不引用
 */
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ARCHIVE = path.join(HERE, 'random-event-generator.orig.ts.txt');
const SRC = path.join(HERE, '..', '..', '..', 'src', 'core');

const raw = fs.readFileSync(ARCHIVE, 'utf8');
const A = raw.replace(/\r\n/g, '\n').split('\n');
// 文件以换行结尾时 split 会多出一个尾部空串，丢弃它，让 A.length 与 wc -l 对齐
while (A.length > 0 && A[A.length - 1] === '') A.pop();

function assert(cond, msg) {
  if (!cond) throw new Error('断言失败: ' + msg);
}
function seg(start, end) {
  if (start < 1 || end > A.length || start > end) {
    throw new Error(`切片越界: ${start}-${end} (总行数 ${A.length})`);
  }
  const out = A.slice(start - 1, end);
  if (out.join('').trim() === '') throw new Error(`切片为空: ${start}-${end}`);
  return out;
}
function assertFirst(n, expect) {
  assert(A[n - 1] === expect, `第 ${n} 行应为 ${JSON.stringify(expect)}，实际 ${JSON.stringify(A[n - 1])}`);
}
function assertLast(n, expect) {
  assertFirst(n, expect);
}
function write(file, lines) {
  const text = lines.join('\n').replace(/\n/g, '\r\n');
  fs.writeFileSync(path.join(SRC, file), text, 'utf8');
  console.log(`  ${file}  ${lines.length} 行`);
}
function countTopExportFn(lines, kind) {
  const re = kind === 'fn' ? /^export function / : /^export (const|interface|type) /;
  return lines.filter((l) => re.test(l)).length;
}

// ── 归档整体断言 ──
assert(A.length === 1062, `归档应为 1062 行，实际 ${A.length}`);
assertFirst(20, '// i18n-ignore-start  // 模型面提示词 / mock / 种子目录，非 UI 文案（待翻译）');
assertFirst(1062, '// i18n-ignore-end');

// ── 四段边界逐字符核对 ──
assertFirst(22, '// ── 类型 ──');
assertLast(206, '}');
assertFirst(208, '// ====================================================================');
assertFirst(212, '// ── 多维度参数：事件类别与严重度 ──');
assertFirst(241, 'export const SEVERITY_RANK: Record<RandomEventSeverity, number> = {');
assertFirst(402, '// ── 常量 ──');
assertFirst(415, 'export const FEEDBACK_ADJUST_MAX = 100;');
assertFirst(417, '// ── 模板工厂与校验 ──');
assertLast(574, '}');
assertFirst(576, '// ── 多维度参数计算 ──');
assertFirst(976, 'export interface RandomEventDecision {');
assertFirst(1005, 'export function decideRandomEvent(');
assertLast(1061, '}');

const coreBody = seg(22, 206);
const typesBody = seg(208, 415);
const factoriesBody = seg(417, 574);
const runtimeBody = seg(576, 1061);

// ── 分段导出计数硬断言 ──
assert(countTopExportFn(coreBody, 'fn') === 4, `core 段 export function 应为 4，实际 ${countTopExportFn(coreBody, 'fn')}`);
assert(countTopExportFn(typesBody, 'fn') === 0, `types 段不应有函数，实际 ${countTopExportFn(typesBody, 'fn')}`);
assert(countTopExportFn(factoriesBody, 'fn') === 6, `factories 段 export function 应为 6，实际 ${countTopExportFn(factoriesBody, 'fn')}`);
assert(countTopExportFn(runtimeBody, 'fn') === 12, `runtime 段 export function 应为 12，实际 ${countTopExportFn(runtimeBody, 'fn')}`);
// 每段都必须有内容，且首行是注释分隔（防切片错位产出合法但空洞的文件）
assert(coreBody[0] === '// ── 类型 ──', 'core 首行错位');
assert(typesBody[0].startsWith('// ===='), 'types 首行错位');
assert(factoriesBody[0] === '// ── 模板工厂与校验 ──', 'factories 首行错位');
assert(runtimeBody[0] === '// ── 多维度参数计算 ──', 'runtime 首行错位');

console.log('切片校验通过，开始生成：');

// ── 1. core ──
const coreHead = `/**
 * 随机事件生成 —— 基础层 (F17.3)
 *
 * 从 random-event-generator.ts 拆出（R4-8）。本层是 v1.1 最初的那一套：
 * 参数 / 结果类型、两个概率常量、概率判定、Prompt 构建、容错解析、转临时 StoryEvent。
 *
 * 依赖方向：本层**不引用任何其它拆出模块**；factories 层与 runtime 层都单向依赖本层。
 *
 * i18n：Prompt 文案是模型面提示词而非 UI 文案，故整块在 i18n-ignore 内，本文件自持一对标记。
 */

import type { StoryEvent } from './event-types';
import { parseAiJson } from './json-utils';

// i18n-ignore-start  // 模型面提示词 / mock / 种子目录，非 UI 文案（待翻译）

`;
write('random-event-generator-core.ts', [...coreHead.split('\n'), ...coreBody, '', '// i18n-ignore-end']);

// ── 2. types ──
const typesHead = `/**
 * 随机事件生成 —— 共享类型与常量层 (F17.3 扩展)
 *
 * 从 random-event-generator.ts 拆出（R4-8）。本层只有类型声明与默认值常量，**零函数**。
 *
 * 为什么单独成层：factories 层（模板/场景/配置工厂）与 runtime 层（概率计算/选择/决策）
 * 都需要 \`RandomEventTemplate\` / \`SEVERITY_RANK\` / \`DEFAULT_*_WEIGHT\` 这一批符号，
 * 若把类型塞进任一侧，两条依赖边就会对向生长成环。抽成中立层后依赖图是
 * \`types ← factories\`、\`types ← runtime\`，两侧互不引用。
 *
 * i18n：本层无任何用户可见文案，不需要 i18n-ignore 标记。
 */

`;
write('random-event-generator-types.ts', [...typesHead.split('\n'), ...typesBody]);

// ── 3. factories ──
const factoriesHead = `/**
 * 随机事件生成 —— 模板 / 场景配置 / 生成器配置工厂层 (F17.3 扩展)
 *
 * 从 random-event-generator.ts 拆出（R4-8）。纯构造与纯校验，无随机、无副作用。
 *
 * 依赖方向：types 层（类型与默认值）+ core 层（默认概率）。
 * **不引用 runtime 层**——这是四层方案能成立的关键，已用交叉引用实测验证。
 *
 * i18n：校验错误信息是开发者面文案，但沿用整块 i18n-ignore（与原文件一致）。
 */

import { DEFAULT_RANDOM_EVENT_PROBABILITY } from './random-event-generator-core';
import type {
  RandomEventGeneratorConfig,
  RandomEventSceneConfig,
  RandomEventTemplate,
} from './random-event-generator-types';
import {
  DEFAULT_FEEDBACK_ADJUST_STEP,
  DEFAULT_TEMPLATE_COOLDOWN_MS,
  DEFAULT_TEMPLATE_WEIGHT,
} from './random-event-generator-types';

// i18n-ignore-start  // 模型面提示词 / mock / 种子目录，非 UI 文案（待翻译）

`;
write('random-event-generator-factories.ts', [...factoriesHead.split('\n'), ...factoriesBody, '', '// i18n-ignore-end']);

// ── 4. runtime ──
const runtimeHead = `/**
 * 随机事件生成 —— 判定与计算运行时层 (F17.3 扩展)
 *
 * 从 random-event-generator.ts 拆出（R4-8）。模板适用性、有效概率、冷却、加权选择、
 * 模板化 Prompt、结果构造、反馈调整、统计、最终决策。
 *
 * 依赖方向：core 层（Prompt 与概率判定）+ types 层（类型与默认值）。
 * **不引用 factories 层**——工厂只被外部装配时调用，运行时不回头依赖构造逻辑。
 *
 * i18n：模板化 Prompt 是模型面提示词而非 UI 文案，整块在 i18n-ignore 内。
 */

import type { GeneratedRandomEvent, RandomEventParams } from './random-event-generator-core';
import {
  DEFAULT_RANDOM_EVENT_PROBABILITY,
  buildRandomEventMessages,
  shouldTriggerRandomEvent,
} from './random-event-generator-core';
import type {
  RandomEventCategory,
  RandomEventFeedback,
  RandomEventGeneratorConfig,
  RandomEventResult,
  RandomEventSceneConfig,
  RandomEventSeverity,
  RandomEventStats,
  RandomEventTemplate,
} from './random-event-generator-types';
import {
  DEFAULT_FEEDBACK_ADJUST_STEP,
  FEEDBACK_ADJUST_MAX,
  FEEDBACK_ADJUST_MIN,
  SEVERITY_RANK,
} from './random-event-generator-types';

// i18n-ignore-start  // 模型面提示词 / mock / 种子目录，非 UI 文案（待翻译）

`;
write('random-event-generator-runtime.ts', [...runtimeHead.split('\n'), ...runtimeBody, '', '// i18n-ignore-end']);

// ── 5. barrel（纯公共面，不写实现） ──
const barrel = `/**
 * 随机事件生成 (F17.3, v1.1 新增)
 *
 * 业务逻辑：
 * - 在每轮 AI 回复后，根据当前场景的随机事件开关与概率判定
 * - 通过 LLM 动态生成一个一次性事件（不持久化为正式 StoryEvent）
 * - 生成的事件描述直接注入到下一轮提示词中
 *
 * 规则约束：
 * - 默认 10% 概率（每个开启随机事件的场景）
 * - 单次生成消耗约 300-600 Token
 * - AI 未连接时禁用
 * - 已有 active 事件时不重复触发（避免事件堆积）
 *
 * 依赖：F17.1 事件类型、F06.6 世界层级结构
 *
 * 本文件自 R4-8 起是**纯公共面 barrel**，不含任何实现，四层实现在：
 * - core：类型 / 常量 / 概率判定 / Prompt / 解析 / 转 StoryEvent
 * - types：扩展层的共享类型与默认值常量（零函数）
 * - factories：模板 / 场景配置 / 生成器配置的构造与校验
 * - runtime：适用性 / 有效概率 / 冷却 / 加权选择 / 结果 / 反馈 / 统计 / 决策
 *
 * 之所以保留 barrel 而不让调用方直连子模块：本模块有 9 个外部引用点
 * （3 个 Vue 面板 / 2 个 store / random-events-shared / 3 个测试文件），
 * barrel 让这次拆分对调用方零改动，也把「公共面」变成一份可审计的显式清单。
 * 注意这里**不做 export ***——子层私有化的符号（如 clampProbability）不会被外泄。
 */

// ── 基础层 ──
export {
  DEFAULT_RANDOM_EVENT_PROBABILITY,
  MAX_ACTIVE_RANDOM_EVENTS,
  shouldTriggerRandomEvent,
  buildRandomEventMessages,
  parseGeneratedRandomEvent,
  generatedRandomEventToStoryEvent,
} from './random-event-generator-core';
export type { RandomEventParams, GeneratedRandomEvent } from './random-event-generator-core';

// ── 共享类型与常量层 ──
export {
  SEVERITY_RANK,
  DEFAULT_TEMPLATE_WEIGHT,
  DEFAULT_TEMPLATE_COOLDOWN_MS,
  DEFAULT_FEEDBACK_ADJUST_STEP,
  FEEDBACK_ADJUST_MIN,
  FEEDBACK_ADJUST_MAX,
} from './random-event-generator-types';
export type {
  RandomEventCategory,
  RandomEventSeverity,
  RandomEventTemplate,
  RandomEventSceneConfig,
  RandomEventFeedback,
  RandomEventResult,
  RandomEventGeneratorConfig,
  RandomEventStats,
} from './random-event-generator-types';

// ── 工厂层 ──
export {
  createRandomEventTemplate,
  updateRandomEventTemplate,
  validateRandomEventTemplate,
  createDefaultSceneConfig,
  validateSceneConfig,
  createDefaultGeneratorConfig,
} from './random-event-generator-factories';

// ── 运行时层 ──
export {
  isTemplateApplicableToScene,
  calculateEffectiveProbability,
  isTemplateOnCooldown,
  isGeneratorOnCooldown,
  selectCandidateTemplates,
  selectTemplateByWeight,
  buildTemplateAwareMessages,
  createRandomEventResult,
  applyFeedbackToResult,
  adjustProbabilityByFeedback,
  computeRandomEventStats,
  decideRandomEvent,
} from './random-event-generator-runtime';
// RandomEventDecision 声明在原文件 976 行，落在 runtime 片段内，故从 runtime 侧导出
export type { RandomEventDecision } from './random-event-generator-runtime';
`;
write('random-event-generator.ts', barrel.split('\n'));

console.log('完成。');
