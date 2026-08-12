/**
 * SillyTavern 生态互通 (T-07)
 *
 * 本项目已原生支持：角色卡 V2 JSON/PNG(character-card)、世界书(world_info 格式, lorebook)。
 * 本模块补齐群聊(GroupChat)与 Quick Reply 的 ST 格式导入导出。
 *
 * ST 群聊格式(data/group-chats/*.json):
 *   {
 *     "id": "uuid",
 *     "name": "...",
 *     "members": [ { "characterId": "...", "avatar": "...", "isWorld": false } ],
 *     "messages": [ { "name": "...", "characterId": "...", "is_user": false, "is_name": true,
 *                     "send_date": "ISO", "mesId": 0, "swipeId": 0, "swipes": [], "mes": "..." } ]
 *   }
 * ST Quick Reply 格式(data/quick-replies/*.json):
 *   [ { "id": "uuid", "label": "...", "message": "/cmd args", "group": "..." } ]
 *
 * 本项目字段映射：
 * - GroupChat.mode → ST 无此概念，导入默认 natural，导出省略
 * - GroupMember.talkativeness 等 → ST 无，导出省略
 * - QuickReplyButton.autoSend → ST 无，导出固定 false
 */

import type { GroupChat, GroupChatMessage, GroupMember } from './group-chat';
import type { QuickReplyButton } from '@/types';

// ── 群聊导出 ──

/** ST 群聊消息格式 */
export interface StGroupChatMessage {
  name?: string;
  characterId?: string;
  is_user: boolean;
  is_name: boolean;
  send_date: string;
  mesId: number;
  swipeId: number;
  swipes: string[];
  mes: string;
}

/** ST 群聊文件格式 */
export interface StGroupChatFile {
  id: string;
  name: string;
  members: Array<{
    characterId: string;
    avatar?: string;
    isWorld?: boolean;
  }>;
  messages: StGroupChatMessage[];
}

/** 本项目 GroupChat → ST 群聊 JSON */
export function exportGroupChatToSt(chat: GroupChat): StGroupChatFile {
  return {
    id: chat.id,
    name: chat.name,
    members: chat.members.map((m) => ({
      characterId: m.characterId,
      ...(m.avatar ? { avatar: m.avatar } : {}),
      isWorld: false,
    })),
    messages: chat.messages.map((m, idx) => ({
      ...(m.characterId ? { characterId: m.characterId } : {}),
      ...(m.characterName ? { name: m.characterName } : {}),
      is_user: m.role === 'user',
      is_name: true,
      send_date: m.timestamp ?? new Date().toISOString(),
      mesId: idx,
      swipeId: m.swipeIndex ?? 0,
      swipes: m.swipes ?? [],
      mes: m.content,
    })),
  };
}

/** 序列化群聊为 ST 格式 JSON 文本 */
export function exportGroupChatToStJson(chat: GroupChat): string {
  return JSON.stringify(exportGroupChatToSt(chat), null, 2);
}

// ── 群聊导入 ──

/** ST 群聊 JSON → 本项目 GroupChat（需成员角色 ID 存在性由调用方校验） */
export function importGroupChatFromSt(json: unknown): GroupChat {
  if (typeof json !== 'object' || json === null) {
    throw new Error('群聊数据格式错误');
  }
  const raw = json as Partial<StGroupChatFile>;
  if (!raw.name || typeof raw.name !== 'string') {
    throw new Error('群聊缺少 name 字段');
  }

  const members: GroupMember[] = (raw.members ?? [])
    .filter((m) => m && typeof m.characterId === 'string')
    .map((m) => ({
      characterId: m.characterId,
      name: m.characterId,
      avatar: m.avatar,
      joinedAt: new Date().toISOString(),
      allowAutoSelect: true,
    }));

  const messages: GroupChatMessage[] = (raw.messages ?? [])
    .filter((m) => m && typeof m.mes === 'string')
    .map((m, idx) => ({
      id: `gcm-${Date.now()}-${idx}`,
      role: m.is_user ? 'user' : 'assistant',
      content: m.mes,
      timestamp: m.send_date ?? new Date().toISOString(),
      characterId: m.characterId,
      characterName: m.name,
      swipes: m.swipes ?? [],
      swipeIndex: m.swipeId ?? 0,
    }));

  return {
    id: raw.id ?? `group-${Date.now()}`,
    name: raw.name,
    description: '',
    members,
    firstMessage: '',
    messages,
    mode: 'natural',
    lastSpeakerId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lifecycleStatus: 'active',
  };
}

// ── Quick Reply 导出/导入 ──

/** ST Quick Reply 文件格式（数组） */
export interface StQuickReply {
  id: string;
  label: string;
  message: string;
  group?: string;
}

/** 本项目 QuickReplyButton[] → ST Quick Reply JSON 文本 */
export function exportQuickRepliesToStJson(buttons: QuickReplyButton[]): string {
  const items: StQuickReply[] = buttons.map((b) => ({
    id: b.id,
    label: b.label,
    message: b.script,
    ...(b.group ? { group: b.group } : {}),
  }));
  return JSON.stringify(items, null, 2);
}

/** ST Quick Reply JSON → 本项目 QuickReplyButton[] */
export function importQuickRepliesFromSt(json: unknown): QuickReplyButton[] {
  if (!Array.isArray(json)) {
    throw new Error('Quick Reply 数据格式错误：应为数组');
  }
  return json
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item, idx) => {
      const label = typeof item.label === 'string' ? item.label : `按钮 ${idx + 1}`;
      const message = typeof item.message === 'string' ? item.message : '';
      const id = typeof item.id === 'string' && item.id ? item.id : `qr-${Date.now()}-${idx}`;
      const group = typeof item.group === 'string' ? item.group : '';
      return {
        id,
        label,
        script: message,
        group,
        autoSend: false,
      };
    });
}
