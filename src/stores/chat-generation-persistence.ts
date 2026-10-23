/**
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

  /**
   * 摘要接线（2026-09-21）：按需生成 / 更新当前会话摘要。
   *
   * 设计为 **fire-and-forget + fail-open** —— 在回复完成并持久化之后异步触发，
   * 不阻塞 UI；任何失败静默（摘要是锦上添花，不该影响主链路）。
   *
   * 与 L1 压缩的分工：**摘要管「被裁掉的最早历史」，L1 管「仍在窗口内的历史」**。
   *
   * 存储：摘要只落在 `Chat`（存储层 + sessions 运行时缓存），**不进 UICharacter**
   * —— persistChat 已透传 `existing?.summary`，因此不会被落盘抹掉。
   */
  async function maybeGenerateSummary(character: UICharacter): Promise<void> {
    const chatId = activeChatId.value ?? `chat-${character.id}`;
    const previous = summaryJobs.get(chatId) ?? Promise.resolve();
    summaryPendingIds.value = { ...summaryPendingIds.value, [chatId]: true };
    const current = previous
      .catch(() => undefined)
      .then(async () => {
        try {
          const mgr = deps.getChatManager();
          if (!mgr || !storageAdapter) return;
          const { useSettingsStore } = await import('./settings');
          const settings = useSettingsStore();
          const config = settings.summarizationConfig;
          if (!config?.enabled) return;

          const existing = sessions.value.find((s) => s.id === chatId);
          const messages = uiMsgsToChatMsgs(character.messages);
          const baselineSummary = existing?.summary ?? null;
          const summary = await mgr.summarizeIfNeeded(messages, config, baselineSummary);
          if (!summary) return;

          // 编辑/重新生成可能在摘要请求期间使消息历史失效；只有基线仍是当前摘要时才写回。
          const latest = sessions.value.find((s) => s.id === chatId);
          if (!latest || latest.summary !== baselineSummary) return;
          latest.summary = summary;
          try {
            await storageAdapter.saveChat(latest);
          } catch {
            /* 落盘失败不阻断：内存态已更新，下一轮注入仍可用 */
          }
        } catch {
          /* fail-open：摘要整条链路静默失败 */
        }
      });
    summaryJobs.set(chatId, current);
    try {
      await current;
    } finally {
      if (summaryJobs.get(chatId) === current) {
        summaryJobs.delete(chatId);
        const next = { ...summaryPendingIds.value };
        delete next[chatId];
        summaryPendingIds.value = next;
      }
    }
  }

  /** 历史内容被编辑或重新生成后，旧摘要不再可信，必须从会话元数据中失效。 */
  function invalidateActiveSummary(): void {
    const chatId = activeChatId.value;
    if (!chatId) return;
    const existing = sessions.value.find((s) => s.id === chatId);
    if (!existing?.summary) return;
    existing.summary = undefined;
    if (storageAdapter) void storageAdapter.saveChat(existing).catch(() => undefined);
  }

  /**
   * 将当前角色对话持久化到存储层
   * 使用 character.id 作为 characterId，messages[0].id 拼接作为 chatId（简化）
   */
  async function persistChat(character: UICharacter): Promise<void> {
    if (!storageAdapter) return; // 未注入存储适配器，静默跳过
    if (character.messages.length === 0) return;

    const now = new Date().toISOString();
    // 多会话：写入当前激活会话；无则回落默认会话 id（向后兼容，签名不改单会话）或创建新会话 id
    // D-R：`activeChatId` 是全局单值而 `selectCharacter()` 不重置它。若它指向的是**别的角色**的会话，
    // 沿用它会把当前角色的整段缓冲覆盖到那个会话上（实测：甲的历史被乙的消息替换掉）。
    // 已进索引的会话以其 `characterId` 归属为准；不在索引里的就是 `newSession()` 草稿，原样保留。
    const bound = sessions.value.find((s) => s.id === activeChatId.value);
    const chatId =
      activeChatId.value && (!bound || bound.characterId === character.id)
        ? activeChatId.value
        : `chat-${character.id}`;
    activeChatId.value = chatId;
    const existing = sessions.value.find((s) => s.id === chatId);
    const chat: Chat = {
      id: chatId,
      characterId: character.id,
      title: existing?.title ?? t('chat.conversationTitle', { name: character.name }),
      messages: uiMsgsToChatMsgs(character.messages),
      createdAt: existing?.createdAt
        ?? (character.messages[0]!.timestamp
          ? new Date(character.messages[0]!.timestamp as number).toISOString()
          : now),
      updatedAt: now,
      pinned: existing?.pinned,
      archived: existing?.archived,
      // 摘要接线（2026-09-21）：透传已生成的摘要
      // 摘要由 persistChat 之外的异步流程写入 sessions，此处**必须透传**，
      // 否则每次落盘都会把刚生成的摘要抹掉
      summary: existing?.summary,
    };

    try {
      await storageAdapter.saveChat(chat);
      // 同步会话索引缓存
      const idx = sessions.value.findIndex((s) => s.id === chatId);
      if (idx >= 0) sessions.value[idx] = chat;
      else sessions.value.push(chat);
    } catch (err) {
      // F-2 审查结论：持久化失败「非阻塞 + 记录 lastError」策略保留。
      // lastError 由全局错误横幅呈现给用户（非静默吞掉），且不影响已生成内容的显示；
      // 不在此抛错或阻断 UI，避免一次存储异常导致整轮对话不可见。
      lastError.value = {
        type: 'unknown',
        message: t('chat.persistFailed', { error: err instanceof Error ? err.message : String(err) }),
      };
    }
  }

  /**
   * 加载指定会话的历史到当前角色（多会话切换）
   * @param character 目标角色（活动消息缓冲将被覆盖）
   * @param chatId 要加载的会话 id；缺省用 activeChatId
   */
  async function loadChatHistory(character: UICharacter, chatId?: string): Promise<void> {
    if (!storageAdapter) return;
    const targetId = chatId ?? activeChatId.value ?? `chat-${character.id}`;
    if (!targetId) return;
    try {
      const chat = await storageAdapter.loadChat(targetId);
      if (chat) {
        activeChatId.value = chat.id;
        // 用核心消息覆盖 UI 消息（chatMsgsToUiMsgs 自动过滤 system）
        // 延迟 import 避免循环依赖
        const { chatMsgsToUiMsgs } = await import('../services/type-adapters');
        character.messages = chatMsgsToUiMsgs(chat.messages);
        // 同步会话索引缓存
        const idx = sessions.value.findIndex((s) => s.id === chat.id);
        if (idx >= 0) sessions.value[idx] = chat;
        else sessions.value.push(chat);
      }
    } catch (err) {
      lastError.value = {
        type: 'unknown',
        message: t('chat.loadHistoryFailed', { error: err instanceof Error ? err.message : String(err) }),
      };
    }
  }
  return {
    setStorageAdapter,
    persistChat,
    maybeGenerateSummary,
    invalidateActiveSummary,
    loadChatHistory,
  };
}

