/**
 * Chat Store — 兼容入口（第三轮拆分 · ROUND_3_HIGH_RISK_SPLIT_DESIGN §2.2）
 *
 * 原 2587 行实现已按职责拆分为 5 个子 store：
 * - chat-session.ts        会话管理（activeChatId / sessions / chatVariables + CRUD）
 * - chat-generation.ts     消息生成引擎（sendMessage / 流式 / 统计 / 摘要 / 持久化）
 * - chat-runtime.ts        Virtual Character OS Runtime 集成（单聊）
 * - chat-group-runtime.ts  Runtime 集成（群聊：投递队列 / CAS 冲突 / 远端同步）
 * - chat-memory.ts         本地长期记忆存储（L0）
 *
 * 本文件仅做聚合：
 * - 状态经 storeToRefs 保持响应式（子 store 与本入口共享同一引用）
 * - 操作函数直接委托子 store
 * - setStorageAdapter 扇出注入所有子 store
 * - 54 个既有导出符号全部保留（见 ROUND_3_HIGH_RISK_SPLIT_DESIGN 附录 A），调用方零改动
 */
import { defineStore, storeToRefs } from 'pinia';
import type { StorageAdapter } from '../storage/storage-adapter';
import { useChatSessionStore } from './chat-session';
import { useChatGenerationStore } from './chat-generation';
import { useChatRuntimeStore } from './chat-runtime';
import { useChatGroupRuntimeStore } from './chat-group-runtime';
import { useChatMemoryStore } from './chat-memory';

// 类型兼容再导出（原 chat.ts 的公开类型面）
export type { PendingGroupRuntimeTurn } from './chat-group-runtime';
export type { ChatSummaryStatus, ChatSummaryStatusPhase } from './chat-generation';

export const useChatStore = defineStore('chat', () => {
  const sessionStore = useChatSessionStore();
  const generationStore = useChatGenerationStore();
  const runtimeStore = useChatRuntimeStore();
  const groupRuntimeStore = useChatGroupRuntimeStore();
  const memoryStore = useChatMemoryStore();

  // 状态（storeToRefs 保持响应式，跨 store 共享同一引用）
  const {
    isGenerating,
    streamingContent,
    lastError,
    tokenUsage,
    totalTokenUsage,
    cacheUsage,
    prefixCacheHitRate,
    prefixStability,
    prefixStableRate,
    ttftStats,
    summaryStatus,
  } = storeToRefs(generationStore);
  const { runtimeStatus, activePresetInfo } = storeToRefs(runtimeStore);
  const { activeChatId, sessions, chatVariables } = storeToRefs(sessionStore);
  const { pendingGroupRuntimeTurns, groupRuntimeConflict } = storeToRefs(groupRuntimeStore);

  /**
   * 注入存储适配器（应用启动时由 App.vue 调用）
   * 扇出到所有需要持久化的子 store
   */
  function setStorageAdapter(adapter: StorageAdapter | null): void {
    sessionStore.setStorageAdapter(adapter);
    generationStore.setStorageAdapter(adapter);
    runtimeStore.setStorageAdapter(adapter);
    groupRuntimeStore.setStorageAdapter(adapter);
    memoryStore.setStorageAdapter(adapter);
  }

  return {
    // 状态
    isGenerating,
    streamingContent,
    lastError,
    runtimeStatus,
    // 多会话（§14.2）
    activeChatId,
    sessions,
    // F11.2 当前对话局部变量
    chatVariables,
    // 第2条：Token 消耗统计
    tokenUsage,
    totalTokenUsage,
    cacheUsage,
    prefixCacheHitRate,
    prefixStability,
    prefixStableRate,
    ttftStats,
    summaryStatus,
    activePresetInfo,
    pendingGroupRuntimeTurns,
    groupRuntimeConflict,

    // 依赖注入
    setStorageAdapter,
    loadLocalMemoryStore: memoryStore.loadLocalMemoryStore,
    setApiProfile: generationStore.setApiProfile,
    checkSendBlock: generationStore.checkSendBlock,

    // Runtime 集成（单聊）
    ensureRuntimeIntegration: runtimeStore.ensureRuntimeIntegration,
    inspectRuntimeState: runtimeStore.inspectRuntimeState,
    reviewRuntimeMemory: runtimeStore.reviewRuntimeMemory,
    verifyRuntimeReplay: runtimeStore.verifyRuntimeReplay,
    createRuntimeCharactersBatch: runtimeStore.createRuntimeCharactersBatch,

    // Runtime 集成（群聊）
    ensureGroupRuntimeIntegration: groupRuntimeStore.ensureGroupRuntimeIntegration,
    syncRemoteGroupMember: groupRuntimeStore.syncRemoteGroupMember,
    syncRemoteGroupStatus: groupRuntimeStore.syncRemoteGroupStatus,
    runtimeCharacterIdFor: groupRuntimeStore.runtimeCharacterIdFor,
    commitRuntimeGroupTurn: groupRuntimeStore.commitRuntimeGroupTurn,
    retryRemoteGroupOutbox: groupRuntimeStore.retryRemoteGroupOutbox,
    recoverRemoteGroupOutbox: groupRuntimeStore.recoverRemoteGroupOutbox,
    fetchRemoteGroupTurns: groupRuntimeStore.fetchRemoteGroupTurns,
    retryPendingGroupRuntimeTurn: groupRuntimeStore.retryPendingGroupRuntimeTurn,
    loadRuntimePendingGroupTurns: groupRuntimeStore.loadRuntimePendingGroupTurns,
    discardPendingGroupRuntimeTurns: groupRuntimeStore.discardPendingGroupRuntimeTurns,
    clearGroupRuntimeConflict: groupRuntimeStore.clearGroupRuntimeConflict,

    // 消息操作（生成域）
    sendMessage: generationStore.sendMessage,
    stop: generationStore.stop,
    copyMessage: generationStore.copyMessage,
    deleteMessage: generationStore.deleteMessage,
    editMessage: generationStore.editMessage,
    regenerateMessage: generationStore.regenerateMessage,
    persistAfterEdit: generationStore.persistAfterEdit,
    loadChatHistory: generationStore.loadChatHistory,
    clearLastError: generationStore.clearLastError,

    // 多会话（§14.2）
    loadAllSessions: sessionStore.loadAllSessions,
    openSession: sessionStore.openSession,
    newSession: sessionStore.newSession,
    togglePin: sessionStore.togglePin,
    toggleArchive: sessionStore.toggleArchive,
    deleteSession: sessionStore.deleteSession,
    renameSession: sessionStore.renameSession,
  };
});
