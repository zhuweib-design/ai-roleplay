// R4-5 story.ts 拆分生成器 —— 铁律：只读归档副本、越界抛错、计数断言
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');
const ORIG = join(HERE, 'story.orig.ts.txt');
const HOST = join(ROOT, 'src', 'stores', 'story.ts');

const CRLF = '\r\n';
const writeCRLF = (p, s) => writeFileSync(p, s.replace(/\r?\n/g, CRLF));

function linesOf(text) {
  const arr = text.split('\n');
  if (arr.length > 0 && arr[arr.length - 1] === '') arr.pop();
  return arr;
}

const orig = linesOf(readFileSync(ORIG, 'utf8').replace(/\r\n/g, '\n'));
if (orig.length !== 1228) throw new Error(`归档行数 ${orig.length} ≠ 1228`);

/** 1-based inclusive 切片，越界/空串直接抛错 */
function slice(a, b, tag) {
  if (!(a >= 1 && b >= a && b <= orig.length)) throw new Error(`[${tag}] 切片越界 ${a}-${b}`);
  const part = orig.slice(a - 1, b);
  if (part.length !== b - a + 1) throw new Error(`[${tag}] 切片长度 ${part.length} ≠ ${b - a + 1}`);
  if (part.join('').trim().length === 0) throw new Error(`[${tag}] 切片为空`);
  return part;
}

function assertFirst(a, expect, tag) {
  const line = orig[a - 1];
  if (line !== expect) throw new Error(`[${tag}] 首行不符\n  期望: ${JSON.stringify(expect)}\n  实际: ${JSON.stringify(line)}`);
}

function assertLast(b, expect, tag) {
  const line = orig[b - 1];
  if (line !== expect) throw new Error(`[${tag}] 末行不符\n  期望: ${JSON.stringify(expect)}\n  实际: ${JSON.stringify(line)}`);
}

// ── 边界断言（归档基准行号） ──
assertFirst(108, '  // 取消控制器（运行时，不持久化）', 'H1');
assertLast(120, '  let loadInFlight: Promise<void> | null = null;', 'H1');
assertFirst(152, '  // ── 依赖注入 ──', 'P');
assertLast(224, '  }', 'P');
assertFirst(228, '  function selectStory(id: string): void {', 'keep-select');
assertFirst(241, '  /**', 'A');
assertFirst(243, '   *', 'A-2');
assertLast(575, '  }', 'A');
assertFirst(596, '  // ── F16.2 导入功能 ──', 'I');
assertLast(776, '  }', 'I');
assertFirst(778, '  // ── F16.3 主角身份配置 ──', 'PR');
assertLast(980, '  }', 'PR');
assertFirst(982, '  // ── F16.4 故事时间推进 ──', 'T');
assertLast(1156, '  }', 'T');
assertFirst(1158, '  return {', 'RET');
assertFirst(1225, 'function getExtension(filename: string): string {', 'HELPER');
assertLast(1228, '}', 'HELPER');

// ── 切片 ──
const pBody = slice(152, 224, 'P').join('\n');
const aBody = slice(241, 575, 'A').join('\n');
const iBody = slice(596, 776, 'I').join('\n');
const rBody = slice(778, 980, 'PR').join('\n');
const tBody = slice(982, 1156, 'T').join('\n');
const helperBody = slice(1225, 1228, 'HELPER').join('\n');

// 切片内函数存在性断言
const mustHave = (body, needles, tag) => {
  for (const n of needles) if (!body.includes(n)) throw new Error(`[${tag}] 缺少 ${n}`);
};
mustHave(pBody, ['function setStorageAdapter', 'async function loadFromStorage', 'async function ensureStorageAdapter', 'async function ensureLoaded', 'async function persistStory', 'async function deleteFromStorage'], 'P');
mustHave(aBody, ['async function createStoryFromFile', 'async function analyzeStoryWithText', 'function cancelAnalysis'], 'A');
mustHave(iBody, ['function createImportTargets', 'function importWorld', 'function importAll', 'async function exportScripts', 'function summarizeImportResults'], 'I');
mustHave(rBody, ['function setProtagonistFromCharacter', 'function updateProtagonist', 'function setProtagonistPersonaId'], 'PR');
mustHave(tBody, ['function setStoryWorldBookBinding', 'function setStoryTimeConfig', 'function getStoryTimePrompt'], 'T');

// ── 模块 1：持久化 ──
const persistence = `/**
 * 故事 store · 持久化（R4-5 自 stores/story.ts 切出）
 *
 * 工厂形态：storageAdapter / libraryLoaded / loadInFlight 是实例状态，封在闭包里，
 * 避免模块级单例被多个 store 实例共享（见 R4-4 O-11）。
 */
import { ref, type Ref } from 'vue';
import { t } from '@/i18n';
import type { StorageAdapter } from '@/storage/storage-adapter';
import { getStorageAdapter } from '@/storage/storage-factory';
import { mergeKeptLocal } from '@/core/store-merge';
import type { StoryAnalysisResult } from '@core/story-types';

export interface StoryPersistenceDeps {
  stories: Ref<StoryAnalysisResult[]>;
  currentStoryId: Ref<string | null>;
  lastError: Ref<string | null>;
}

export function createStoryPersistenceOps(deps: StoryPersistenceDeps) {
  const { stories, currentStoryId, lastError } = deps;

  // 注入的存储适配器
  let storageAdapter: StorageAdapter | null = null;

  /**
   * 故事列表是否已从存档读完。深链（\`?story=<id>\`）据此决定何时解析 id——
   * 读库没完成时 \`stories\` 还是空的/旧的，直接判会"静默不选中"（M12-a 的角色版本
   * 更糟，会悄悄写到另一条记录上，见 stores/character.ts 的同名闸门）。
   */
  const libraryLoaded = ref(false);
  let loadInFlight: Promise<void> | null = null;

${pBody}

  return {
    setStorageAdapter,
    loadFromStorage,
    ensureStorageAdapter,
    ensureLoaded,
    persistStory,
    deleteFromStorage,
    libraryLoaded,
  };
}
`;

// ── 模块 2：分析流水线 ──
const analysis = `/**
 * 故事 store · 分析流水线（R4-5 自 stores/story.ts 切出）
 *
 * 从文件建任务 / 逐块调 LLM / 合并结果 / 深度模式生成脚本 / 取消。
 * abortController 是实例状态，封在工厂闭包内。
 */
import { t } from '@/i18n';
import type { Ref } from 'vue';
import {
  type AnalysisDepth,
  type AnalysisProgress,
  type StoryAnalysisResult,
  type ChunkAnalysisResult,
  type StoryScript,
  getDepthMeta,
  createEmptyResult,
} from '@core/story-types';
import type { StoryTemplateId } from '@core/story-templates';
import {
  chunkNovel,
  buildAnalysisMessages,
  buildPreviousContext,
  buildScriptGenerationMessages,
  parseChunkResult,
  parseScriptResult,
  mergeResults,
  createAnalysisResult,
} from '@core/story-analyzer';
import { prepareGenerationPrompt, resolveContextWindow } from '@core/token-budget';
import { createApiClient } from '../api';
import { useSettingsStore } from './settings';

export interface StoryAnalysisDeps {
  stories: Ref<StoryAnalysisResult[]>;
  currentStoryId: Ref<string | null>;
  lastError: Ref<string | null>;
  lastInfo: Ref<string | null>;
  isAnalyzing: Ref<boolean>;
  progress: Ref<AnalysisProgress>;
  persistStory: (id: string) => Promise<void>;
}

export function createStoryAnalysisOps(deps: StoryAnalysisDeps) {
  const { stories, currentStoryId, lastError, lastInfo, isAnalyzing, progress, persistStory } = deps;

  // 取消控制器（运行时，不持久化）
  let abortController: AbortController | null = null;

${aBody}

${helperBody}

  return { createStoryFromFile, analyzeStoryWithText, cancelAnalysis };
}
`;

// ── 模块 3：导入导出（F16.2） ──
const importer = `/**
 * 故事 store · 导入导出（F16.2，R4-5 自 stores/story.ts 切出）
 *
 * 把 character / lorebook / events 三个 store 适配成 ImportPort，再转调 core/story-importer。
 */
import { t } from '@/i18n';
import type { Ref } from 'vue';
import type { StoryAnalysisResult, ImportConflictStrategy, ImportResult } from '@core/story-types';
import {
  importWorld as importWorldCore,
  importScenes as importScenesCore,
  importCharacters as importCharactersCore,
  importEvents as importEventsCore,
  importAll as importAllCore,
  downloadScripts,
  type ImportTargets,
  type CharacterImportPort,
  type LorebookImportPort,
  type EventsImportPort,
} from '@core/story-importer';
import { describeSaveResult } from '@/utils/save-blob';
import { useCharacterStore } from './character';
import { useLorebookStore } from './lorebook';
import { useEventsStore } from './events';

export interface StoryImportDeps {
  stories: Ref<StoryAnalysisResult[]>;
  lastError: Ref<string | null>;
  lastInfo: Ref<string | null>;
}

export function createStoryImportOps(deps: StoryImportDeps) {
  const { stories, lastError, lastInfo } = deps;

${iBody}

  return { importWorld, importScenes, importCharacters, importEvents, importAll, exportScripts };
}
`;

// ── 模块 4：主角身份配置（F16.3） ──
const protagonist = `/**
 * 故事 store · 主角身份配置（F16.3，R4-5 自 stores/story.ts 切出）
 *
 * 校验与打补丁逻辑全在 core/protagonist，这里只做「找故事 + 落状态 + 持久化」。
 */
import { t } from '@/i18n';
import type { Ref } from 'vue';
import type {
  StoryAnalysisResult,
  ProtagonistConfig,
  ProtagonistRelation,
  ProtagonistRole,
} from '@core/story-types';
import {
  createProtagonistFromCharacter,
  createNewProtagonist,
  validateProtagonist,
  patchProtagonist,
  addRelation as addRelationCore,
  removeRelation as removeRelationCore,
} from '@core/protagonist';

export interface StoryProtagonistDeps {
  stories: Ref<StoryAnalysisResult[]>;
  lastError: Ref<string | null>;
  lastInfo: Ref<string | null>;
  persistStory: (id: string) => Promise<void>;
}

export function createStoryProtagonistOps(deps: StoryProtagonistDeps) {
  const { stories, lastError, lastInfo, persistStory } = deps;

${rBody}

  return {
    setProtagonistFromCharacter,
    setProtagonistAsCustom,
    updateProtagonist,
    clearProtagonist,
    addProtagonistRelation,
    removeProtagonistRelation,
    setStartingScene,
    setProtagonistPersonaId,
  };
}
`;

// ── 模块 5：故事时间（F16.4） ──
const timeline = `/**
 * 故事 store · 故事时间推进（F16.4，R4-5 自 stores/story.ts 切出）
 *
 * 时间算法全在 core/story-time，这里只做「找故事 + 落状态 + 持久化 + 提示词片段」。
 */
import { t } from '@/i18n';
import type { Ref } from 'vue';
import type { StoryAnalysisResult } from '@core/story-types';
import {
  createDefaultTimeConfig,
  createDefaultTimeState,
  advanceTime as advanceTimeCore,
  recordTurnEnd,
  setStoryTimeValue as setStoryTimeValueCore,
  resetStoryTime as resetStoryTimeCore,
  validateTimeConfig,
  formatStoryTime,
  buildStoryTimePrompt,
  type StoryTimeConfig,
} from '@core/story-time';

export interface StoryTimeDeps {
  stories: Ref<StoryAnalysisResult[]>;
  lastError: Ref<string | null>;
  lastInfo: Ref<string | null>;
  persistStory: (id: string) => Promise<void>;
}

export function createStoryTimeOps(deps: StoryTimeDeps) {
  const { stories, lastError, lastInfo, persistStory } = deps;

${tBody}

  return {
    setStoryWorldBookBinding,
    setStoryTimeConfig,
    toggleStoryTime,
    advanceStoryTime,
    recordTurnEndForStory,
    setStoryTime,
    resetStoryTime,
    getFormattedStoryTime,
    getStoryTimePrompt,
  };
}
`;

const out = (name) => join(ROOT, 'src', 'stores', name);
writeCRLF(out('story-persistence.ts'), persistence);
writeCRLF(out('story-analysis.ts'), analysis);
writeCRLF(out('story-import.ts'), importer);
writeCRLF(out('story-protagonist.ts'), protagonist);
writeCRLF(out('story-time.ts'), timeline);

// ── 宿主重写 ──
let host = readFileSync(HOST, 'utf8').replace(/\r\n/g, '\n');
const hostLines = linesOf(host);
if (hostLines.length !== 1228) throw new Error(`宿主行数 ${hostLines.length} ≠ 1228`);

const BINDER = `  // ── 子模块装配（R4-5） ──

  const persistenceOps = createStoryPersistenceOps({ stories, currentStoryId, lastError });
  const {
    setStorageAdapter,
    loadFromStorage,
    ensureLoaded,
    persistStory,
    deleteFromStorage,
    libraryLoaded,
  } = persistenceOps;

  const { createStoryFromFile, analyzeStoryWithText, cancelAnalysis } = createStoryAnalysisOps({
    stories,
    currentStoryId,
    lastError,
    lastInfo,
    isAnalyzing,
    progress,
    persistStory,
  });

  const {
    importWorld,
    importScenes,
    importCharacters,
    importEvents,
    importAll,
    exportScripts,
  } = createStoryImportOps({ stories, lastError, lastInfo });

  const {
    setProtagonistFromCharacter,
    setProtagonistAsCustom,
    updateProtagonist,
    clearProtagonist,
    addProtagonistRelation,
    removeProtagonistRelation,
    setStartingScene,
    setProtagonistPersonaId,
  } = createStoryProtagonistOps({ stories, lastError, lastInfo, persistStory });

  const {
    setStoryWorldBookBinding,
    setStoryTimeConfig,
    toggleStoryTime,
    advanceStoryTime,
    recordTurnEndForStory,
    setStoryTime,
    resetStoryTime,
    getFormattedStoryTime,
    getStoryTimePrompt,
  } = createStoryTimeOps({ stories, lastError, lastInfo, persistStory });
`;

// 从后往前删，避免行号漂移；152-224 换成 binder
function replaceRange(lines, a, b, repl, tag) {
  const expectLen = b - a + 1;
  if (lines.length < b) throw new Error(`[${tag}] 宿主行数不足以切 ${a}-${b}`);
  const seg = lines.slice(a - 1, b);
  if (seg.length !== expectLen) throw new Error(`[${tag}] 段长 ${seg.length} ≠ ${expectLen}`);
  if (seg.join('').trim().length === 0) throw new Error(`[${tag}] 段为空`);
  return [...lines.slice(0, a - 1), ...(repl === null ? [] : repl.split('\n')), ...lines.slice(b)];
}

const HOST_RANGES = [
  [1223, 1228, null, 'helper'], // ── 辅助函数 ── 段 + getExtension
  [982, 1156, null, 'T'],
  [778, 980, null, 'PR'],
  [596, 776, null, 'I'],
  [241, 575, null, 'A'],
  [152, 224, BINDER, 'P-binder'],
  [108, 120, null, 'H1'],
];

let hostLines2 = hostLines;
let prevStart = Infinity;
for (const [a, b, repl, tag] of HOST_RANGES) {
  if (b >= prevStart) throw new Error(`[${tag}] 必须倒序删除：${a}-${b} 但上一段起点 ${prevStart}`);
  prevStart = a;
  hostLines2 = replaceRange(hostLines2, a, b, repl, tag);
}

// 宿主 import 补三条工厂导入（放在 describeSaveResult 之后的原 import 区尾部）
let hostText = hostLines2.join('\n');
const importAnchor = "import type {\n  ImportConflictStrategy,\n  ImportResult,\n} from '@core/story-types';";
if (!hostText.includes(importAnchor)) throw new Error('宿主 import 锚点未命中');
hostText = hostText.replace(
  importAnchor,
  importAnchor +
    "\nimport { createStoryPersistenceOps } from './story-persistence';" +
    "\nimport { createStoryAnalysisOps } from './story-analysis';" +
    "\nimport { createStoryImportOps } from './story-import';" +
    "\nimport { createStoryProtagonistOps } from './story-protagonist';" +
    "\nimport { createStoryTimeOps } from './story-time';"
);

hostText = hostText.replace(/\n{3,}/g, '\n\n');
hostText = hostText.replace(/\n+$/, '\n');
writeCRLF(HOST, hostText);

console.log('modules written, host lines =', linesOf(hostText).length);
