/**
 * chat-session — 会话管理子 store（第三轮拆分 · ROUND_3_HIGH_RISK_SPLIT_DESIGN §2）
 *
 * 职责（优化项 7 · S3）：
 * - activeChatId / sessions / chatVariables 状态（生成域经 storeToRefs 共享同一引用）
 * - loadAllSessions / openSession / restoreLatestSession / newSession / togglePin /
 *   toggleArchive / deleteSession / renameSession
 * - 自持 storageAdapter（由兼容层 setStorageAdapter 扇出注入）
 *
 * 依赖：openSession 需要生成域的 loadChatHistory（函数体内惰性解析，运行时才有
 * 调用边，无 setup 期循环；生成域 setup 反向引用本 store 亦安全）。
 */
import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { UICharacter } from '@/types';
import type { Chat } from '../storage/types';
import type { StorageAdapter } from '../storage/storage-adapter';

export const useChatSessionStore = defineStore('chat-session', () => {
  const storageAdapterHolder: { current: StorageAdapter | null } = { current: null };

  // ── 多会话（§14.2 历史会话切换/搜索/置顶/归档） ──
  /** 当前激活会话 id（决定聊天区渲染哪条会话、persistChat 写入哪条） */
  const activeChatId = ref<string | null>(null);
  /** 会话索引缓存（移动端会话 Tab / 桌面侧边栏展示；含全部角色，归档由 UI 过滤） */
  const sessions = ref<Chat[]>([]);
  // F11.2 当前对话的局部变量（随对话元数据持久化，内存中管理）
  const chatVariables = ref<Record<string, string>>({});

  /** 注入存储适配器（由兼容层扇出调用） */
  function setStorageAdapter(adapter: StorageAdapter | null): void {
    storageAdapterHolder.current = adapter;
  }

  /**
   * 载入全部会话索引（跨角色）到 sessions 缓存
   * 用于移动端会话 Tab 的全局会话列表。
   */
  async function loadAllSessions(characterIds: string[]): Promise<void> {
    const adapter = storageAdapterHolder.current;
    if (!adapter) return;
    const all: Chat[] = [];
    for (const cid of characterIds) {
      try {
        const list = await adapter.loadChats(cid);
        all.push(...list);
      } catch {
        /* 单角色加载失败不影响其余 */
      }
    }
    all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    sessions.value = all;
  }

  /**
   * 打开指定角色的会话并装配到聊天区
   * （实际加载由生成域 loadChatHistory 执行——惰性解析避免 setup 期循环）
   */
  async function openSession(character: UICharacter, chatId: string): Promise<void> {
    const { useChatGenerationStore } = await import('./chat-generation');
    await useChatGenerationStore().loadChatHistory(character, chatId);
  }

  /**
   * D-Q（UX_IA_GUIDED_FLOW_DESIGN_2026-10-07.md §3.7.2）：刷新后自动接回最近一段对话
   *
   * 会话历史只存在 chats store —— `uiCharToCard()` 从不写 `messages`，所以角色卡里
   * 根本没有历史；而把历史装回界面的唯一入口是会话行点击 → `openSession`。
   * 实测 F5 后聊天区没有任何气泡，用户必须再点一次会话才能接着聊。
   *
   * 触发条件收窄为"还没有选定会话（`activeChatId === null`）且缓冲为空"，
   * 否则会覆盖 `newSession()` 的草稿语义或把用户正在写的消息换成历史。
   */
  async function restoreLatestSession(character: UICharacter | null): Promise<boolean> {
    if (!character) return false;
    if (activeChatId.value !== null || character.messages.length > 0) return false;
    // sessions 已按 updatedAt 倒序（loadAllSessions 内排序），首个即该角色最近一条
    const latest = sessions.value.find((s) => s.characterId === character.id && !s.archived);
    if (!latest) return false;
    await openSession(character, latest.id);
    return true;
  }

  /**
   * 新建会话：分配唯一会话 id 并清空当前角色消息缓冲（首条消息时 persistChat 才落盘）
   */
  function newSession(character: UICharacter): void {
    activeChatId.value = `chat-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    character.messages = [];
  }

  /** 置顶/取消置顶会话 */
  async function togglePin(chatId: string): Promise<void> {
    const s = sessions.value.find((x) => x.id === chatId);
    if (!s) return;
    s.pinned = !s.pinned;
    const adapter = storageAdapterHolder.current;
    if (adapter) {
      try { await adapter.saveChat(s); } catch { /* 离线静默 */ }
    }
  }

  /** 归档/取消归档会话 */
  async function toggleArchive(chatId: string): Promise<void> {
    const s = sessions.value.find((x) => x.id === chatId);
    if (!s) return;
    s.archived = !s.archived;
    const adapter = storageAdapterHolder.current;
    if (adapter) {
      try { await adapter.saveChat(s); } catch { /* 离线静默 */ }
    }
  }

  /** 删除会话（存储 + 索引；若为当前激活会话则复位缓冲） */
  async function deleteSession(character: UICharacter | null, chatId: string): Promise<void> {
    const adapter = storageAdapterHolder.current;
    if (adapter) {
      try { await adapter.deleteChat(chatId); } catch { /* 离线静默 */ }
    }
    sessions.value = sessions.value.filter((s) => s.id !== chatId);
    if (activeChatId.value === chatId) {
      activeChatId.value = null;
      if (character) character.messages = [];
    }
  }

  /** 重命名会话标题 */
  async function renameSession(chatId: string, title: string): Promise<void> {
    const s = sessions.value.find((x) => x.id === chatId);
    if (!s) return;
    s.title = title;
    const adapter = storageAdapterHolder.current;
    if (adapter) {
      try { await adapter.saveChat(s); } catch { /* 离线静默 */ }
    }
  }

  return {
    setStorageAdapter,
    activeChatId,
    sessions,
    chatVariables,
    loadAllSessions,
    openSession,
    restoreLatestSession,
    newSession,
    togglePin,
    toggleArchive,
    deleteSession,
    renameSession,
  };
});
