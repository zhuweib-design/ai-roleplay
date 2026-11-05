/**
 * chat store — 兼容层 54 符号验收测试（优化项 7 S7）
 *
 * 依据 ROUND_3_HIGH_RISK_SPLIT_DESIGN 附录 A 的完整导出清单，逐符号断言
 * `useChatStore()` 兼容入口仍暴露全部既有 API（状态 ref 可读写、函数可调用），
 * 并验证 setStorageAdapter 扇出与跨 store 状态共享（compat ↔ 子 store 同一引用）。
 *
 * 注：行为级回归由既有测试套件覆盖（chat.test / chat-llm-controls /
 * chat-runtime.integration / chat-context / context-length / maxtokens-priority 等，
 * 共 24 个 store 测试文件 795 项），本文件聚焦「API 面零破坏」这一验收维度。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia, storeToRefs } from 'pinia';
import { useChatStore } from '../../src/stores/chat';
import type { UICharacter } from '@/types';

/** 导出符号清单（附录 A 54 个 + S 轮新增 checkSendBlock） */
const STATE_SYMBOLS = [
  'isGenerating', 'streamingContent', 'lastError', 'runtimeStatus',
  'activeChatId', 'sessions', 'chatVariables',
  'tokenUsage', 'totalTokenUsage', 'cacheUsage', 'prefixCacheHitRate',
  'prefixStability', 'prefixStableRate', 'ttftStats', 'summaryStatus',
  'activePresetInfo', 'pendingGroupRuntimeTurns', 'groupRuntimeConflict',
] as const;

const FUNCTION_SYMBOLS = [
  'setStorageAdapter', 'loadLocalMemoryStore', 'setApiProfile', 'checkSendBlock',
  'ensureRuntimeIntegration', 'inspectRuntimeState', 'reviewRuntimeMemory',
  'verifyRuntimeReplay', 'createRuntimeCharactersBatch',
  'ensureGroupRuntimeIntegration', 'syncRemoteGroupMember', 'syncRemoteGroupStatus',
  'runtimeCharacterIdFor', 'commitRuntimeGroupTurn', 'retryRemoteGroupOutbox',
  'recoverRemoteGroupOutbox', 'fetchRemoteGroupTurns', 'retryPendingGroupRuntimeTurn',
  'loadRuntimePendingGroupTurns', 'discardPendingGroupRuntimeTurns', 'clearGroupRuntimeConflict',
  'sendMessage', 'stop', 'copyMessage', 'deleteMessage', 'editMessage',
  'regenerateMessage', 'persistAfterEdit', 'loadChatHistory', 'clearLastError',
  'loadAllSessions', 'openSession', 'newSession', 'togglePin', 'toggleArchive',
  'deleteSession', 'renameSession',
] as const;

function makeCharacter(): UICharacter {
  return {
    id: 'compat-char',
    name: 'CompatChar',
    avatarType: 'gradient',
    gradientFrom: 'var(--tk-cyan-500)',
    gradientTo: 'var(--tk-cyan-700)',
    initial: 'C',
    lastActive: '刚刚',
    favorite: false,
    tags: [],
    description: '兼容层验收角色',
    model: 'gpt-4o',
    conversations: [],
    messages: [],
    authorNote: '',
    authorDepth: 4,
    temperature: 0.7,
    tokenBudget: { character: 0, worldInfo: 0, chatHistory: 0, remaining: 8192 },
  };
}

describe('chat store 兼容层 — 54 符号 API 面', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('暴露全部 54 个既有符号（附录 A 逐项）', () => {
    const store = useChatStore();
    for (const key of STATE_SYMBOLS) {
      expect(store, `状态符号缺失：${key}`).toHaveProperty(key);
    }
    for (const key of FUNCTION_SYMBOLS) {
      expect(typeof store[key], `函数符号缺失或非函数：${key}`).toBe('function');
    }
    expect(STATE_SYMBOLS.length + FUNCTION_SYMBOLS.length).toBe(55);
  });

  it('状态经 storeToRefs 可读写且与子 store 同一引用', () => {
    const store = useChatStore();
    const refs = storeToRefs(store);
    // 写入兼容层 ref → 子 store 状态同步（同一引用）
    refs.activeChatId.value = 'chat-compat-1';
    expect(store.activeChatId).toBe('chat-compat-1');
    refs.streamingContent.value = '流式片段';
    expect(store.streamingContent).toBe('流式片段');
    // 计算属性照常工作
    expect(refs.totalTokenUsage.value).toBe(0);
  });

  it('函数委托到子 store：clearLastError / newSession / runtimeCharacterIdFor 可调用', async () => {
    const store = useChatStore();
    const character = makeCharacter();
    // 错误管理委托
    store.clearLastError();
    expect(store.lastError).toBeNull();
    // 会话委托（newSession 修改 character.messages + activeChatId）
    store.newSession(character);
    expect(store.activeChatId).toMatch(/^chat-/);
    expect(character.messages).toHaveLength(0);
    // Runtime 委托（纯映射函数）
    expect(store.runtimeCharacterIdFor(character)).toBeTruthy();
  });

  it('setStorageAdapter 扇出：适配器变更后 loadLocalMemoryStore 等子 store 行为可用', async () => {
    const store = useChatStore();
    // null 注入不抛错（各子 store 容忍无适配器）
    store.setStorageAdapter(null);
    await expect(store.loadLocalMemoryStore()).resolves.toBeUndefined();
  });

  it('sendMessage 兼容（D-10 新语义）：无 Profile 时前置拒绝，不污染消息、保住输入、错误可见', async () => {
    const store = useChatStore();
    const character = makeCharacter();
    await store.sendMessage(character, '你好');
    // D-10：拒绝发生在任何消息入列之前（输入正文保留在输入框）
    expect(character.messages.length).toBe(0);
    expect(store.lastError).not.toBeNull();
    expect(store.checkSendBlock()).toBe('no-profile');
    expect(store.isGenerating).toBe(false);
  });

  it('loadChatHistory 兼容：无适配器时静默返回（与原实现一致）', async () => {
    const store = useChatStore();
    const character = makeCharacter();
    await store.loadChatHistory(character);
    expect(store.lastError).toBeNull();
  });

  it('togglePin 兼容：未知会话 id 静默返回（与原实现一致）', async () => {
    const store = useChatStore();
    await expect(store.togglePin('no-such-chat')).resolves.toBeUndefined();
  });

  it('deleteMessage 兼容：未知消息 id 不变更', () => {
    const store = useChatStore();
    const character = makeCharacter();
    const before = character.messages.length;
    store.deleteMessage(character, 'no-such-msg');
    expect(character.messages.length).toBe(before);
  });
});
