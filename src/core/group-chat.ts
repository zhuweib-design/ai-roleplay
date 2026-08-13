/**
 * 群聊系统核心类型定义 (F10)
 *
 * 参考：SillyTavern group-chats 设计，符合 PRD F10.1-F10.2 规格
 *
 * 群聊支持 2-8 个角色卡，独立的首消息和对话历史。
 * 发言顺序：自然轮换（按健谈度概率）或指定发言（@角色名）。
 *
 * 数据存储：Tauri 版 groups/{id}.json，Web 版 IndexedDB groups store
 */

import type { ChatMessage } from './character-card';
import { t } from '@/i18n';

/** 群聊发言顺序模式 (F10.2) */
export type GroupChatMode = 'natural' | 'designated';

/** 群聊成员（角色卡引用 + 群聊专属配置） */
export interface GroupMember {
  /** 角色 ID */
  characterId: string;
  /** 角色名（冗余存储，避免每次查询） */
  name: string;
  /** 头像（冗余） */
  avatar?: string;
  /** 该成员在此群聊中的健谈度覆盖值（不填则使用角色卡默认值） */
  talkativeness?: number;
  /** 加入时间 */
  joinedAt: string;
  /** 是否允许被自然轮换选中 */
  allowAutoSelect: boolean;
  /** F10.4 是否为临时 NPC（v1.1 新增，标记后离开时触发归档判断） */
  isTemporary?: boolean;
}

/**
 * 群聊消息（扩展 ChatMessage，附加发言者标识）
 *
 * 与单聊消息差异：
 * - 必须有 characterId 标识发言者
 * - system 消息用于群聊事件（如角色加入/离开）
 */
export interface GroupChatMessage extends ChatMessage {
  /** 发言角色 ID（system 消息可为空） */
  characterId?: string;
  /** 发言者名称冗余存储 */
  characterName?: string;
  /** 消息类型扩展（群聊事件） */
  eventType?: 'join' | 'leave' | 'none';
}

/**
 * 群聊 (F10.1)
 *
 * 规则约束：
 * - 成员数 2-8 人
 * - 群聊有独立的首消息和对话历史
 * - 群聊显示在角色列表中，带群聊图标
 *
 * F10.4 v1.1 新增：临时群聊生命周期状态
 * - active：活跃（可正常对话）
 * - archived：归档（只读，保留历史但不可发新消息）
 */
export type GroupChatLifecycle = 'active' | 'archived';

export interface GroupChat {
  /** 群聊唯一 ID */
  id: string;
  /** 群聊名称 */
  name: string;
  /** 群聊描述（可选） */
  description: string;
  /** 成员列表 */
  members: GroupMember[];
  /** 群聊首消息（从成员的 alternateGreetings 中随机选取） */
  firstMessage: string;
  /** 消息历史 */
  messages: GroupChatMessage[];
  /** 发言顺序模式 */
  mode: GroupChatMode;
  /** 最后发言的角色 ID（避免自然轮换中连续发言） */
  lastSpeakerId: string | null;
  /** 创建时间 ISO */
  createdAt: string;
  /** 更新时间 ISO */
  updatedAt: string;
  /** F10.4 生命周期状态（v1.1 新增，默认 active） */
  lifecycleStatus?: GroupChatLifecycle;
  /** F10.4 归档时间 ISO（v1.1 新增，归档时填充） */
  archivedAt?: string | null;
}

/** 群聊创建参数 */
export interface GroupChatCreateInput {
  name: string;
  description?: string;
  /** 成员角色 ID 列表（2-8 个） */
  memberIds: string[];
  /** 首消息（可选，默认随机选取） */
  firstMessage?: string;
  /** 发言顺序模式（默认自然轮换） */
  mode?: GroupChatMode;
}

/** 群聊成员数限制 (F10.1 规则约束) */
export const MIN_GROUP_MEMBERS = 2;
export const MAX_GROUP_MEMBERS = 8;

/** 验证群聊创建参数 */
export function validateGroupChatInput(input: Partial<GroupChatCreateInput>): string[] {
  const errors: string[] = [];

  if (!input.name || input.name.trim() === '') {
    errors.push(t('groupChat.nameRequired'));
  } else if (input.name.length > 50) {
    errors.push(t('groupChat.nameTooLong'));
  }

  if (
    input.memberIds !== undefined &&
    (input.memberIds.length < MIN_GROUP_MEMBERS ||
      input.memberIds.length > MAX_GROUP_MEMBERS)
  ) {
    errors.push(t('groupChat.memberCount', { min: MIN_GROUP_MEMBERS, max: MAX_GROUP_MEMBERS }));
  }

  // 检查成员 ID 是否有重复
  if (input.memberIds) {
    const unique = new Set(input.memberIds);
    if (unique.size !== input.memberIds.length) {
      errors.push(t('groupChat.memberDuplicate'));
    }
  }

  return errors;
}
