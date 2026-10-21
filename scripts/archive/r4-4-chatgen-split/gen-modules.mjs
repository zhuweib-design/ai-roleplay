// R4-4 步骤2-5：把 chat-generation.ts 的四个职责段下放为独立模块
// 铁律：基准只读归档副本；切片越界/切空直接抛错；宿主用归档基准文本整段 replace（不按当前行号切）
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');
const ORIG = join(HERE, 'chat-generation.orig.ts.txt');
const HOST = join(ROOT, 'src', 'stores', 'chat-generation.ts');

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

function assertLine(ln, needle) {
  const line = orig[ln - 1];
  if (line === undefined || !line.includes(needle)) {
    throw new Error(`边界断言失败 @${ln}: 期待含 "${needle}"，实际 "${line}"`);
  }
}

function sub(text, find, repl, times, label) {
  const parts = text.split(find);
  if (parts.length - 1 !== times) {
    throw new Error(`[${label}] 替换命中 ${parts.length - 1} 次，期待 ${times} 次: ${find}`);
  }
  return parts.join(repl);
}

const dedent = (input) =>
  (Array.isArray(input) ? input.join('\n') : input)
    .split('\n')
    .map((l) => (l.startsWith('  ') ? l.slice(2) : l))
    .join('\n');

let host = readFileSync(HOST, 'utf8').replace(/\r\n/g, '\n');

function cutHost(a, b, repl, label) {
  const old = orig.slice(a - 1, b).join('\n');
  const parts = host.split(old);
  if (parts.length - 1 !== 1) {
    throw new Error(`[${label}] 宿主命中 ${parts.length - 1} 次（应为 1）: ${a}-${b}`);
  }
  host = parts.join(repl);
}

function writeModule(name, head, body) {
  const path = join(ROOT, 'src', 'stores', name);
  writeCRLF(path, head + body + '\n');
  console.log(`[gen] ${name} = ${linesOf(readFileSync(path, 'utf8')).length} 行`);
}

// ── 边界断言（归档基准行号，逐行核对过） ──
assertLine(278, 'let storageAdapter: StorageAdapter | null = null;');
assertLine(310, '/**');
assertLine(314, 'function setStorageAdapter(adapter: StorageAdapter | null): void {');
assertLine(316, '  }');
assertLine(318, '/**');
assertLine(319, '设置当前激活的 API Profile');
assertLine(574, 'let explicitReservedTokens: number | undefined;');
assertLine(841, '/**');
assertLine(847, 'async function executeSlashCommand');
assertLine(957, '  }');
assertLine(1197, '/**');
assertLine(1198, '摘要接线（2026-09-21）');
assertLine(1318, '  }');
assertLine(1320, '/**');
assertLine(1321, 'F17.3: 随机事件生成决策点');
assertLine(1435, '  }');
assertLine(1437, '/**');
assertLine(1442, 'async function loadChatHistory');
assertLine(1465, '  }');

// ── 模块 A：随机事件（无实例状态，自由函数） ──
{
  const body = dedent(slice(1320, 1435, 'A'));
  const head = `/**
 * chat-generation-random-event — F17.3 随机事件生成决策点（R4-4 拆分）
 *
 * 每轮 AI 回复完成后异步调用：读生成器配置 → 决策 → 调 LLM 生成事件 → 落事件表。
 * 整段 fail-open：任何失败只记日志，绝不打断主对话链路。
 *
 * 无宿主实例状态依赖（所需 store 全在函数内惰性获取），故保持自由函数。
 */
import { useEventsStore } from './events';
import { useRandomEventsStore } from './random-events';
import { collectLorebooksForCharacter } from './chat-context';
import { createApiClient } from '../api';
import { prepareGenerationPrompt, resolveContextWindow } from '@core/token-budget';
import {
  buildRandomEventMessages,
  parseGeneratedRandomEvent,
  generatedRandomEventToStoryEvent,
  createRandomEventResult,
  type RandomEventParams,
} from '@/core/random-event-generator';
import type { UICharacter } from '@/types';
import { logger } from '@/utils/logger';

`;
  const out = sub(body, 'async function maybeGenerateRandomEvent(', 'export async function maybeGenerateRandomEvent(', 1, 'A-sig');
  writeModule('chat-generation-random-event.ts', head, out);
  cutHost(1320, 1435, '', 'A');
}

// ── 模块 B：斜杠命令（依赖 stop / sendMessage / persistChat） ──
{
  const raw = dedent(slice(841, 957, 'B'));
  const sig = 'async function executeSlashCommand(character: UICharacter, text: string): Promise<void> {';
  if (!raw.includes(sig)) throw new Error('[B] 签名未命中');
  let out = raw.replace(sig, '@@SIG@@');
  out = sub(out, '  await sendMessage(character, result.sendMessage);', '  await deps.sendMessage(character, result.sendMessage);', 1, 'B-send');
  out = sub(out, 'onAbort: () => stop(),', 'onAbort: () => deps.stop(),', 1, 'B-abort');
  out = sub(out, '    stop();', '    deps.stop();', 1, 'B-stop');
  out = sub(out, '  await persistChat(character);', '  await deps.persistChat(character);', 1, 'B-persist');
  out = sub(out, 'createSlashCommandContext(chatVariables.value,', 'createSlashCommandContext(deps.chatVariables.value,', 1, 'B-vars');
  if (/\bawait sendMessage\(|\bawait persistChat\(|(?<!deps\.)\bchatVariables\.|(?<!deps\.)\bstop\(\)/.test(out)) {
    throw new Error('[B] 仍有裸调用残留');
  }

  const head = `/**
 * chat-generation-commands — F11.1 斜杠命令执行（R4-4 拆分）
 *
 * 把以 / 开头的输入路由到命令引擎：装配故事时间 / 事件上下文与扩展命令，
 * 执行管道，把命令文本与结果各 push 成一条消息，最后持久化。
 *
 * 需要宿主的 stop / sendMessage / persistChat，以依赖对象注入，
 * 不让模块反向 import store（避环形依赖）。
 */
import type { Ref } from 'vue';
import { t } from '@/i18n';
import type { UIMessage, UICharacter } from '@/types';
import { executePipeline } from '@/core/slash-command';
import { createSlashCommandContext } from '@/core/variable-store';
import { extensionRegistry } from '@/core/extension-loader';
import { useEventsStore } from './events';
import { useStoryStore } from './story';
import { collectLorebooksForCharacter } from './chat-context';

export interface SlashCommandDeps {
  chatVariables: Ref<Record<string, string>>;
  stop: () => void;
  sendMessage: (character: UICharacter, text: string) => Promise<boolean>;
  persistChat: (character: UICharacter) => Promise<void>;
}

export async function executeSlashCommand(
  character: UICharacter,
  text: string,
  deps: SlashCommandDeps
): Promise<void> {
`;
  out = out.replace('@@SIG@@', '').replace(/^\n+/, '');
  writeModule('chat-generation-commands.ts', head, out);
  cutHost(841, 957, '', 'B');
}

// ── 模块 C：持久化 / 摘要 / 历史加载（工厂，实例状态） ──
{
  // 保留原始 2 空格缩进（切片来自 store setup 内部），这样直接落进工厂函数体内即可
  const d1 = slice(1197, 1318, 'C1').join('\n');
  const d2 = slice(1437, 1465, 'C2').join('\n');
  let body = d1 + '\n\n' + d2;
  body = sub(body, 'const mgr = chatManager;', 'const mgr = deps.getChatManager();', 1, 'C-mgr');
  for (const needle of ['storageAdapter', 'summaryJobs', 'summaryPendingIds.value', 'activeChatId.value', 'sessions.value', 'lastError.value']) {
    if (!body.includes(needle)) throw new Error(`[C] 缺少依赖锚点: ${needle}`);
  }
  if (/^export /m.test(body)) throw new Error('[C] 不应有顶层 export');
  const fnCount = (body.match(/^ {2}(async )?function /gm) ?? []).length;
  if (fnCount !== 4) throw new Error(`[C] 工厂内函数数量 ${fnCount} ≠ 4`);

  const head = `/**
 * chat-generation-persistence — 对话持久化 / 摘要 / 历史加载（R4-4 拆分）
 *
 * 四件事：
 * - persistChat：把角色消息缓冲写入当前会话（不透传 summary 会被下一轮落盘抹掉）
 * - maybeGenerateSummary：fire-and-forget 摘要，按 chatId 串行化，fail-open
 * - invalidateActiveSummary：历史被编辑 / 重生成后让旧摘要失效
 * - loadChatHistory：切换会话时把存储层消息覆盖到角色缓冲
 *
 * 用工厂而非模块级自由函数：storageAdapter 与 summaryJobs 都是**实例状态**。
 * 放模块作用域会被所有 store 实例（单测常见多实例）共享，串台症状见 R4-2 教训。
 */
import { t } from '@/i18n';
import type { Ref } from 'vue';
import type { UICharacter } from '@/types';
import type { ApiErrorKind } from '../api/types';
import type { ChatManager } from '../services/chat-manager';
import { uiMsgsToChatMsgs } from '../services/type-adapters';
import type { StorageAdapter } from '../storage/storage-adapter';
import type { Chat } from '../storage/types';

export type GenerationLastError = {
  type: 'aborted' | 'api' | 'network' | 'unknown';
  message: string;
  kind?: ApiErrorKind;
  statusCode?: number;
  original?: Error;
};

export interface PersistenceDeps {
  activeChatId: Ref<string | null>;
  sessions: Ref<Chat[]>;
  lastError: Ref<GenerationLastError | null>;
  summaryPendingIds: Ref<Record<string, true>>;
  getChatManager: () => ChatManager | null;
}

export interface PersistenceOps {
  setStorageAdapter: (adapter: StorageAdapter | null) => void;
  persistChat: (character: UICharacter) => Promise<void>;
  maybeGenerateSummary: (character: UICharacter) => Promise<void>;
  invalidateActiveSummary: () => void;
  loadChatHistory: (character: UICharacter, chatId?: string) => Promise<void>;
}

export function createPersistenceOps(deps: PersistenceDeps): PersistenceOps {
  const { summaryPendingIds, activeChatId, sessions, lastError } = deps;
  let storageAdapter: StorageAdapter | null = null;
  /** 同一会话的摘要任务串行化，避免快速连续发送时旧摘要覆盖新摘要。 */
  const summaryJobs = new Map<string, Promise<void>>();

  function setStorageAdapter(adapter: StorageAdapter | null): void {
    storageAdapter = adapter;
  }

`;
  const tail = `
  return {
    setStorageAdapter,
    persistChat,
    maybeGenerateSummary,
    invalidateActiveSummary,
    loadChatHistory,
  };
}
`;
  writeModule('chat-generation-persistence.ts', head, body + tail);
  cutHost(1437, 1465, '', 'C2');
  cutHost(1197, 1318, '', 'C1');
}

// ── 模块 D：Profile → ChatManager 装配（工厂） ──
{
  // 保留原始 2 空格缩进：这些函数要落进工厂函数体内
  const body0 = slice(318, 574, 'D').join('\n');
  let body = body0;
  const before = (body.match(/\bchatManager\b/g) ?? []).length;
  body = body
    .replace(/chatManager = null;/g, 'deps.setChatManager(null);')
    .replace(/chatManager = new ChatManager\(config\);/g, 'deps.setChatManager(new ChatManager(config));')
    .replace(/chatManager\?\.currentConfig/g, 'deps.getChatManager()?.currentConfig')
    .replace(/chatManager\?\.updateConfig/g, 'deps.getChatManager()?.updateConfig')
    .replace(/chatManager\?\.isGenerating/g, 'deps.getChatManager()?.isGenerating');
  if (before === 0) throw new Error('[D] 未命中任何 chatManager');
  if (/\bchatManager\b/.test(body)) throw new Error('[D] 仍有裸 chatManager 残留');
  for (const needle of ['pendingProfile', 'activeProfileForCapability', 'memoryStore.getL0L2Deps()', 'activePresetInfo.value']) {
    if (!body.includes(needle)) throw new Error(`[D] 缺少依赖锚点: ${needle}`);
  }
  if (/^export /m.test(body)) throw new Error('[D] 不应有顶层 export');
  const fnCount = (body.match(/^ {2}(async )?function /gm) ?? []).length;
  if (fnCount !== 5) throw new Error(`[D] 工厂内函数数量 ${fnCount} ≠ 5`);

  const head = `/**
 * chat-generation-profile — API Profile → ChatManager 装配（R4-4 拆分）
 *
 * - setApiProfile / applyApiProfile：重建 ChatManager（生成中则暂存到 pendingProfile）
 * - buildCharacterOverrides：角色级采样 / 思考强度覆盖（逐档回落，不写 undefined）
 * - applyRuntimeLlmControls：每轮发送前把全局偏好（思维链 / 采样 / 上下文 / Preset）下传
 * - flushPendingProfile：生成收尾时应用暂存 Profile
 *
 * 工厂函数：pendingProfile / 全局上下文缓存是实例状态；ChatManager 实体仍归宿主，
 * 通过 get/set 注入，这样宿主 sendMessage 里的用法一行都不用改。
 */
import { t } from '@/i18n';
import type { Ref } from 'vue';
import type { UICharacter, ApiProfile } from '@/types';
import { DEFAULT_MAX_CONTEXT_TOKENS, DEFAULT_RESERVED_TOKENS } from '@/types';
import { createApiClient } from '../api';
import { resolveReasoningCapability } from '../api/reasoning-capability';
import type { ReasoningEffort } from '../api/types';
import { ChatManager, type ChatManagerConfig } from '../services/chat-manager';
import { executeBuiltinTool, getBuiltinToolDefinitions } from '@/core/tool-registry';
import { loadGlobalVariables, setGlobalVariable } from '@/core/variable-store';
import { OptimizationPipeline, loadOptimizationConfig } from '@/core/optimization-pipeline';
import { resolveContextWindow } from '@core/token-budget';
import {
  PRESET_SCHEMA_VERSION,
  presetSamplingOverrides,
  resolveEffectivePreset,
  type PresetId,
} from '@/core/creation-preset';
import { buildSamplingConfigPatch } from './chat-generation-helpers';
import { useDataBankStore } from './data-bank';
import type { useChatMemoryStore } from './chat-memory';
import type { Chat } from '../storage/types';

export type ProfileOptions = Partial<
  Pick<ChatManagerConfig, 'userName' | 'systemPrompt' | 'maxContextTokens' | 'reservedTokens'>
>;

export interface ProfileDeps {
  activeChatId: Ref<string | null>;
  sessions: Ref<Chat[]>;
  activePresetInfo: Ref<{ presetId: PresetId; presetVersion: number; at: number } | null>;
  memoryStore: ReturnType<typeof useChatMemoryStore>;
  getChatManager: () => ChatManager | null;
  setChatManager: (manager: ChatManager | null) => void;
}

export interface ProfileOps {
  setApiProfile: (profile: ApiProfile | null, options?: ProfileOptions) => void;
  applyApiProfile: (profile: ApiProfile | null, options?: ProfileOptions) => void;
  buildCharacterOverrides: (character: UICharacter) => NonNullable<
    import('../services/chat-manager').SendMessageParams['overrides']
  >;
  applyRuntimeLlmControls: (character?: UICharacter) => Promise<void>;
  flushPendingProfile: () => void;
}

export function createProfileOps(deps: ProfileDeps): ProfileOps {
  const { activeChatId, sessions, activePresetInfo, memoryStore } = deps;

`;
  const tail = `
  return {
    setApiProfile,
    applyApiProfile,
    buildCharacterOverrides,
    applyRuntimeLlmControls,
    flushPendingProfile,
  };
}
`;
  writeModule('chat-generation-profile.ts', head, body + tail);
  cutHost(318, 574, '', 'D');
}

// ── 宿主：删 setStorageAdapter 与 storageAdapter 字段，插入工厂 + 转发 ──
cutHost(310, 316, '', 'host-setStorageAdapter');

const wireAnchor = `  let chatManager: ChatManager | null = null;
`;
if (!host.includes(wireAnchor)) throw new Error('chatManager 声明锚点缺失');
const wire = `  let chatManager: ChatManager | null = null;
  const getChatManager = (): ChatManager | null => chatManager;
  const setChatManager = (manager: ChatManager | null): void => {
    chatManager = manager;
  };

  const profileOps = createProfileOps({
    activeChatId,
    sessions,
    activePresetInfo,
    memoryStore,
    getChatManager,
    setChatManager,
  });
  const persistenceOps = createPersistenceOps({
    activeChatId,
    sessions,
    lastError,
    summaryPendingIds,
    getChatManager,
  });

  // 转发包装：保持宿主原有调用点与 return 面不变
  const { setApiProfile, applyRuntimeLlmControls, buildCharacterOverrides, flushPendingProfile } =
    profileOps;
  const {
    setStorageAdapter,
    persistChat,
    maybeGenerateSummary,
    invalidateActiveSummary,
    loadChatHistory,
  } = persistenceOps;
`;
host = sub(host, wireAnchor, wire, 1, 'host-wire');

const importAnchor = "} from './chat-generation-helpers';";
if (!host.includes(importAnchor)) throw new Error('helpers import 锚点缺失');
host = sub(
  host,
  importAnchor,
  importAnchor +
    `
import { executeSlashCommand as runSlashCommand } from './chat-generation-commands';
import { maybeGenerateRandomEvent } from './chat-generation-random-event';
import { createPersistenceOps } from './chat-generation-persistence';
import { createProfileOps } from './chat-generation-profile';`,
  1,
  'host-import'
);

host = sub(
  host,
  `      await executeSlashCommand(character, text);`,
  `      await runSlashCommand(character, text, {
        chatVariables,
        stop,
        sendMessage,
        persistChat,
      });`,
  1,
  'host-slash-call'
);

host = host.replace(/\n{3,}/g, '\n\n');
writeCRLF(HOST, host);
console.log('[gen] 宿主行数', linesOf(host).length);
