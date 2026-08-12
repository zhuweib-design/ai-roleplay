/**
 * 数据备份与恢复类型定义 (F13)
 *
 * 全量备份格式：将应用所有数据（角色卡、对话、世界书、群聊、Persona、设置）
 * 序列化为单一 JSON 文件，支持跨设备/跨实例恢复。
 *
 * 兼容性：
 * - version 字段用于未来版本兼容性判断
 * - 各数据列表允许为空（部分恢复时只恢复存在的数据）
 * - settings 为 Partial<AppSettings>，仅恢复存在的字段
 */

import type { CharacterCard } from './character-card';
import type { Lorebook } from './lorebook';
import type { GroupChat } from './group-chat';
import type { Chat } from '../storage/types';
import type { Persona, AppSettings } from '@/types';

/** 备份格式版本号（不向后兼容时递增） */
export const BACKUP_VERSION = '1.0';

/** 备份元信息 */
export interface BackupMeta {
  /** 备份格式版本 */
  version: string;
  /** 备份导出时间 ISO 字符串 */
  exportedAt: string;
  /** 应用版本（可选） */
  appVersion?: string;
  /** 来源环境标识（'tauri' | 'web'） */
  sourceEnv?: string;
}

/** 全量备份数据 */
export interface BackupData extends BackupMeta {
  /** 全部角色卡 */
  characters: CharacterCard[];
  /** 全部对话记录 */
  chats: Chat[];
  /** 全部世界书 */
  lorebooks: Lorebook[];
  /** 全部群聊 */
  groupChats: GroupChat[];
  /** 全部 Persona (F07) */
  personas: Persona[];
  /** 全局设置（部分字段） */
  settings: Partial<AppSettings>;
}

/** 导入冲突处理策略 */
export type ConflictStrategy =
  | 'overwrite' // 覆盖现有同 ID 数据
  | 'skip' // 跳过同 ID 数据
  | 'merge'; // 合并（保留现有，仅追加新数据）

/** 导入选项 */
export interface ImportOptions {
  /** 冲突处理策略，默认 'overwrite' */
  conflictStrategy?: ConflictStrategy;
  /** 是否导入角色卡 */
  importCharacters?: boolean;
  /** 是否导入对话 */
  importChats?: boolean;
  /** 是否导入世界书 */
  importLorebooks?: boolean;
  /** 是否导入群聊 */
  importGroupChats?: boolean;
  /** 是否导入 Persona */
  importPersonas?: boolean;
  /** 是否导入设置 */
  importSettings?: boolean;
}

/** 导入结果统计 */
export interface ImportResult {
  characters: { added: number; skipped: number; overwritten: number };
  chats: { added: number; skipped: number; overwritten: number };
  lorebooks: { added: number; skipped: number; overwritten: number };
  groupChats: { added: number; skipped: number; overwritten: number };
  personas: { added: number; skipped: number; overwritten: number };
  settingsUpdated: boolean;
  errors: string[];
}

/**
 * 校验备份 JSON 结构是否合法
 * @returns 错误消息数组，空表示通过
 */
export function validateBackup(data: unknown): string[] {
  const errors: string[] = [];

  if (!data || typeof data !== 'object') {
    errors.push('备份文件不是有效对象');
    return errors;
  }

  const obj = data as Record<string, unknown>;

  if (typeof obj.version !== 'string') {
    errors.push('备份文件缺少 version 字段');
  }

  if (typeof obj.exportedAt !== 'string') {
    errors.push('备份文件缺少 exportedAt 字段');
  }

  // 各数据字段必须是数组
  const arrayFields = [
    'characters',
    'chats',
    'lorebooks',
    'groupChats',
    'personas',
  ];
  for (const field of arrayFields) {
    if (obj[field] !== undefined && !Array.isArray(obj[field])) {
      errors.push(`字段 ${field} 必须是数组`);
    }
  }

  // settings 必须是对象
  if (obj.settings !== undefined && (typeof obj.settings !== 'object' || obj.settings === null)) {
    errors.push('字段 settings 必须是对象');
  }

  return errors;
}
