import type { CharacterCard, ChatMessage } from '@core/character-card';

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
}

/**
 * StorageAdapter 复用的类型导出
 *
 * 注意：AppSettings 类型已迁移至 @/types，请从那里导入
 */
export type { CharacterCard, ChatMessage };
