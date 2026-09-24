import type { CharacterCard, ChatMessage } from '@core/character-card';
import type { ConversationSummary } from '@core/summarizer';

/**
 * 对话（聊天记录）数据模型
 * 对应 Tauri 版 chats/{id}.json，Web 版 IndexedDB chats store
 */
export interface Chat {
  id: string;
  characterId: string;
  title: string;
  messages: ChatMessage[];
  personaId?: string;
  apiProfileId?: string;
  createdAt: string;
  updatedAt: string;
  /** 会话置顶（优先展示于会话列表顶部） */
  pinned?: boolean;
  /** 会话归档（从主会话列表隐藏，归档视图可见） */
  archived?: boolean;
  /**
   * 早期对话摘要（2026-09-21 摘要接线）
   *
   * 由 SummarizationService 在**流式结束后异步**生成，用于在上下文裁剪时保留
   * 早期剧情 —— 缓解「硬裁最早历史」导致的长程失忆。
   * 与 L1 压缩的分工：**摘要管"被裁掉的最早历史"，L1 管"窗口内的历史"**。
   *
   * 未生成过摘要的会话该字段为 undefined → **向后兼容，零迁移**。
   */
  summary?: ConversationSummary;
}

/**
 * StorageAdapter 复用的类型导出
 *
 * 注意：AppSettings 类型已迁移至 @/types，请从那里导入
 */
export type { CharacterCard, ChatMessage };
