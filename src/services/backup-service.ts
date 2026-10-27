/**
 * 数据备份/恢复与导入导出服务 (F13)
 *
 * 职责：
 * 1. 全量备份：收集应用所有数据序列化为 BackupData JSON
 * 2. 全量恢复：按 ImportOptions 处理冲突策略
 * 3. 对话 Markdown 导出：将 Chat 转换为 Markdown 文本
 *
 * 不负责：
 * - UI 反馈（由调用方处理 toast）
 * - 路径选择（由调用方决定保存位置）
 * - PNG 嵌入式角色卡（B6 第四件起在 `services/character-png.ts`，这一段只吃
 *   CharacterCard，不碰 StorageAdapter 与备份编排）
 */

import type { StorageAdapter } from '@/storage/storage-adapter';
import { saveBlob } from '@/utils/save-blob';
import type { SaveOutcome } from '@/utils/save-blob';
import { stripNarrationMarkers } from '@/core/narration';
import type { Chat } from '@/storage/types';
import type { AppSettings } from '@/types';
import type { StoryEvent } from '@/core/event-types';
import type { RuntimeSnapshot } from '@/runtime/types';
import {
  type BackupData,
  type ImportOptions,
  type ImportResult,
  BACKUP_VERSION,
  validateBackup,
} from '@/core/backup';

import { isEncrypted } from '@/core/api-key-crypto';
import { encryptBackup, decryptBackup, isBackupEncrypted } from '@/core/backup-crypto';
import { auditLogger } from '@/core/audit-log';
import { t } from '@/i18n';

export type { ImportResult } from '@/core/backup';

// ── 全量备份/恢复 ──

/**
 * 从存储层导出全部数据为 BackupData
 *
 * 安全（P2-6）：持久化态中存在明文 API Key 时拒绝导出，
 * 防止备份文件分享/上传导致密钥泄漏。
 */
export async function exportAll(
  adapter: StorageAdapter,
  extra?: { events?: StoryEvent[]; randomEvents?: BackupData['randomEvents'] }
): Promise<BackupData> {
  const [characters, chats, lorebooks, groupChats, settings, stories] =
    await Promise.all([
      adapter.loadCharacters(),
      loadAllChats(adapter),
      adapter.loadLorebooks(),
      adapter.loadGroupChats(),
      adapter.loadSettings(),
      adapter.loadStories(),
    ]);

  // 明文 API Key 检查（未设置主密码或解密后未重新持久化时可能出现）
  const plaintextKeys: string[] = [];
  for (const p of settings?.apiProfiles ?? []) {
    if (p.apiKey && !isEncrypted(p.apiKey)) plaintextKeys.push(p.name);
  }
  const trKey = settings?.translationConfig?.apiKey;
  if (trKey && !isEncrypted(trKey)) plaintextKeys.push(t('backup.translationKey'));
  const imageGenKey = settings?.imageGenConfig?.apiKey;
  if (imageGenKey && !isEncrypted(imageGenKey)) plaintextKeys.push(t('backup.imageGenKey'));
  // P1-4：远程向量网关密钥存于 localStorage['aijiuguan.remoteEmbedding']（不在
  // settings 内），此前游离于明文检查之外 —— 导出备份时会带着明文一起走。
  try {
    const rawRemote = localStorage.getItem('aijiuguan.remoteEmbedding');
    if (rawRemote) {
      const remoteCfg = JSON.parse(rawRemote) as { apiKey?: string };
      if (remoteCfg.apiKey && !isEncrypted(remoteCfg.apiKey)) {
        plaintextKeys.push(t('backup.remoteEmbeddingKey'));
      }
    }
  } catch {
    /* 配置损坏：不阻断导出，交由其它路径处理 */
  }
  if (plaintextKeys.length > 0) {
    // T-06 审计:明文密钥拒绝导出
    auditLogger.record('backup_export', t('backup.plainKeysBlocked', { keys: plaintextKeys.join('、') }), 'blocked');
    throw new Error(
      t('backup.abortedPlainKeys', { keys: plaintextKeys.join('、') })
    );
  }

  // T-06 审计:成功导出
  auditLogger.record(
    'backup_export',
    t('backup.summary', { chars: characters.length, chats: chats.length, lbs: lorebooks.length }),
    'ok'
  );

  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    sourceEnv: typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
      ? 'tauri'
      : 'web',
    characters,
    chats,
    lorebooks,
    groupChats,
    stories,
    events: extra?.events ?? [],
    randomEvents: extra?.randomEvents,
    runtimeSnapshots: await loadRuntimeSnapshots(adapter),
    settings,
  };
}

/** 导出 Runtime 角色快照；不包含上下文审计记录等非角色快照。 */
async function loadRuntimeSnapshots(adapter: StorageAdapter): Promise<RuntimeSnapshot[]> {
  if (!adapter.listSnapshotsByPrefix) return [];
  try {
    const values = await adapter.listSnapshotsByPrefix<RuntimeSnapshot>('virtual-character-runtime:');
    return values.filter((value): value is RuntimeSnapshot => Boolean(
      value && typeof value === 'object' &&
      value.character && typeof value.character.id === 'string' &&
      Array.isArray(value.events) && Array.isArray(value.stateChanges)
    ));
  } catch {
    return [];
  }
}

/**
 * 加载存储中的所有对话（不分角色）
 *
 * 注意：StorageAdapter.loadChats(characterId) 需要角色 ID，
 * 此处通过遍历所有角色来收集全部对话。
 */
async function loadAllChats(adapter: StorageAdapter): Promise<Chat[]> {
  const characters = await adapter.loadCharacters();
  const all: Chat[] = [];
  for (const c of characters) {
    const chats = await adapter.loadChats(c.id);
    all.push(...chats);
  }
  return all;
}

/**
 * 处理导入备份
 *
 * 根据 ImportOptions 选择性导入各类数据，按 ConflictStrategy 处理同 ID 冲突
 */
export async function importBackup(
  adapter: StorageAdapter,
  data: BackupData,
  options: ImportOptions = {}
): Promise<ImportResult> {
  const errors: string[] = [];
  const result: ImportResult = {
    characters: { added: 0, skipped: 0, overwritten: 0 },
    chats: { added: 0, skipped: 0, overwritten: 0 },
    lorebooks: { added: 0, skipped: 0, overwritten: 0 },
    groupChats: { added: 0, skipped: 0, overwritten: 0 },
      stories: { added: 0, skipped: 0, overwritten: 0 },
    runtimeSnapshots: { added: 0, skipped: 0, overwritten: 0 },
    settingsUpdated: false,
    errors,
  };

  const strategy = options.conflictStrategy ?? 'overwrite';

  // 角色卡
  if (options.importCharacters !== false && data.characters) {
    const existing = await adapter.loadCharacters();
    const existingIds = new Set(existing.map((c) => c.id));
    for (const card of data.characters) {
      try {
        if (existingIds.has(card.id)) {
          if (strategy === 'skip') {
            result.characters.skipped++;
          } else if (strategy === 'overwrite') {
            await adapter.saveCharacter(card);
            result.characters.overwritten++;
          }
          // merge: 跳过已存在的
          else {
            result.characters.skipped++;
          }
        } else {
          await adapter.saveCharacter(card);
          result.characters.added++;
        }
      } catch (err) {
        errors.push(t('backup.charImportFailed', { name: card.name, error: err instanceof Error ? err.message : String(err) }));
      }
    }
  }

  // 对话
  if (options.importChats !== false && data.chats) {
    for (const chat of data.chats) {
      try {
        const existing = await adapter.loadChat(chat.id);
        if (existing) {
          if (strategy === 'skip') {
            result.chats.skipped++;
          } else if (strategy === 'overwrite') {
            await adapter.saveChat(chat);
            result.chats.overwritten++;
          } else {
            result.chats.skipped++;
          }
        } else {
          await adapter.saveChat(chat);
          result.chats.added++;
        }
      } catch (err) {
        errors.push(t('backup.chatImportFailed', { id: chat.id, error: err instanceof Error ? err.message : String(err) }));
      }
    }
  }

  // 世界书
  if (options.importLorebooks !== false && data.lorebooks) {
    const existing = await adapter.loadLorebooks();
    const existingIds = new Set(existing.map((l) => l.id));
    for (const lb of data.lorebooks) {
      try {
        if (existingIds.has(lb.id)) {
          if (strategy === 'skip') {
            result.lorebooks.skipped++;
          } else if (strategy === 'overwrite') {
            await adapter.saveLorebook(lb);
            result.lorebooks.overwritten++;
          } else {
            result.lorebooks.skipped++;
          }
        } else {
          await adapter.saveLorebook(lb);
          result.lorebooks.added++;
        }
      } catch (err) {
        errors.push(t('backup.lbImportFailed', { name: lb.name, error: err instanceof Error ? err.message : String(err) }));
      }
    }
  }

  // 群聊
  if (options.importGroupChats !== false && data.groupChats) {
    const existing = await adapter.loadGroupChats();
    const existingIds = new Set(existing.map((g) => g.id));
    for (const gc of data.groupChats) {
      try {
        if (existingIds.has(gc.id)) {
          if (strategy === 'skip') {
            result.groupChats.skipped++;
          } else if (strategy === 'overwrite') {
            await adapter.saveGroupChat(gc);
            result.groupChats.overwritten++;
          } else {
            result.groupChats.skipped++;
          }
        } else {
          await adapter.saveGroupChat(gc);
          result.groupChats.added++;
        }
      } catch (err) {
        errors.push(t('backup.groupImportFailed', { name: gc.name, error: err instanceof Error ? err.message : String(err) }));
      }
    }
  }

  // Persona
  // 故事线（F16 故事分析结果）
  if (options.importStories !== false && data.stories) {
    for (const story of data.stories) {
      try {
        const existing = await adapter.loadStory(story.id);
        if (existing) {
          if (strategy === 'skip') {
            result.stories.skipped++;
          } else if (strategy === 'overwrite') {
            await adapter.saveStory(story);
            result.stories.overwritten++;
          } else {
            result.stories.skipped++;
          }
        } else {
          await adapter.saveStory(story);
          result.stories.added++;
        }
      } catch (err) {
        errors.push(t('backup.storyImportFailed', { id: story.id, error: err instanceof Error ? err.message : String(err) }));
      }
    }
  }

  // 事件（世界书事件/触发器，内存态；随备份带出，交由调用方写回 store）
  if (data.events) {
    result.events = data.events;
  }

  // 随机事件状态（D-9：内存态；随备份带出，交由调用方写回 store）
  if (data.randomEvents) {
    result.randomEvents = data.randomEvents;
  }

  // Runtime 角色快照
  if (options.importRuntimeSnapshots !== false && data.runtimeSnapshots?.length) {
    if (!adapter.saveSnapshot) {
      errors.push(t('backup.runtimeSnapshotUnsupported'));
    } else {
      for (const snapshot of data.runtimeSnapshots) {
        try {
          const key = `virtual-character-runtime:${snapshot.character.id}`;
          const existing = await adapter.loadSnapshot<RuntimeSnapshot>(key);
          if (existing) {
            if (strategy === 'skip' || strategy === 'merge') {
              result.runtimeSnapshots.skipped++;
            } else {
              await adapter.saveSnapshot(key, snapshot);
              result.runtimeSnapshots.overwritten++;
            }
          } else {
            await adapter.saveSnapshot(key, snapshot);
            result.runtimeSnapshots.added++;
          }
        } catch (err) {
          errors.push(t('backup.runtimeSnapshotImportFailed', {
            id: snapshot.character.id,
            error: err instanceof Error ? err.message : String(err),
          }));
        }
      }
    }
  }

  // 设置
  if (options.importSettings !== false && data.settings) {
    try {
      const current = await adapter.loadSettings();
      const merged: Partial<AppSettings> = { ...current, ...data.settings };
      // loadSettings 返回 Partial，但 saveSettings 期望完整 AppSettings
      // 此处用 cast，调用方应负责补充必需字段
      await adapter.saveSettings(merged as AppSettings);
      result.settingsUpdated = true;
    } catch (err) {
      errors.push(t('backup.settingsImportFailed', { error: err instanceof Error ? err.message : String(err) }));
    }
  }

  // T-06 审计:导入结果摘要
  const totalAdded =
    result.characters.added + result.chats.added + result.lorebooks.added +
    result.groupChats.added + result.stories.added +
    result.runtimeSnapshots.added;
  const totalOverwritten =
    result.characters.overwritten + result.chats.overwritten + result.lorebooks.overwritten +
    result.groupChats.overwritten + result.stories.overwritten +
    result.runtimeSnapshots.overwritten;
  const totalSkipped =
    result.characters.skipped + result.chats.skipped + result.lorebooks.skipped +
    result.groupChats.skipped + result.stories.skipped +
    result.runtimeSnapshots.skipped;
  auditLogger.record(
    'backup_import',
    t('backup.importResult', {
      added: totalAdded,
      overwritten: totalOverwritten,
      skipped: totalSkipped,
      failures: errors.length > 0 ? t('backup.failuresSuffix', { count: errors.length }) : '',
    }),
    errors.length > 0 ? 'error' : 'ok'
  );

  return result;
}

// ── 文件下载/解析 ──

/**
 * 触发浏览器下载备份 JSON（T-06：可选加密）
 *
 * @param data 备份数据
 * @param masterPassword 主密码（提供时加密备份文件；不提供时导出明文）
 */
export async function downloadBackupFile(
  data: BackupData,
  masterPassword?: string
): Promise<SaveOutcome> {
  const safeDate = new Date(data.exportedAt).toISOString().slice(0, 10);
  const filename = masterPassword
    ? `ai-roleplay-backup-${safeDate}.enc.json`
    : `ai-roleplay-backup-${safeDate}.json`;
  // 数据生产者传进去：WebView 路径下它要在保存面板弹出来之后才跑（见 utils/save-blob.ts）
  return saveBlob(filename, async () => {
    const json = JSON.stringify(data, null, 2);
    const content = masterPassword ? await encryptBackup(json, masterPassword) : json;
    return new Blob([content], { type: 'application/json' });
  });
}

/**
 * 解析备份文件
 * T-06：自动识别加密备份（enc:v1: 前缀）并尝试用主密码解密
 * @throws 若文件格式不合法 / 加密备份且密码错误
 */
export async function parseBackupFile(
  file: File,
  masterPassword?: string
): Promise<BackupData> {
  const text = await file.text();

  // 加密备份：需主密码解密；明文备份直接解析
  const jsonText = isBackupEncrypted(text)
    ? await decryptBackup(text, masterPassword ?? '')
    : text;

  let json: unknown;
  try {
    json = JSON.parse(jsonText);
  } catch (err) {
    throw new Error(
      isBackupEncrypted(text)
        ? t('backup.decryptFailed', { error: err instanceof Error ? err.message : String(err) })
        : t('backup.jsonParseFailed', { error: err instanceof Error ? err.message : String(err) })
    );
  }

  const errors = validateBackup(json);
  if (errors.length > 0) {
    throw new Error(t('backup.validationFailed', { errors: errors.join('；') }));
  }

  return json as BackupData;
}

// ── 对话 Markdown 导出 (F13) ──

/**
 * 将对话导出为 Markdown 文本
 *
 * 格式：
 * # {角色名} 的对话
 *
 * > 元信息（导出时间、消息数）
 *
 * ---
 *
 * ## 用户：{name}
 * {content}
 *
 * ## {角色名}
 * {content}
 *
 * @param chat 对话数据
 * @param characterName 角色名（用于标题和 AI 消息标签）
 * @param userName 用户名（用于用户消息标签）
 */
export function exportChatMarkdown(
  chat: Chat,
  characterName: string,
  userName: string = 'User'
): string {
  const lines: string[] = [];
  const exportTime = new Date().toISOString();
  const messageCount = chat.messages.length;

  lines.push(t('backup.mdTitle', { name: characterName }));
  lines.push('');
  lines.push(t('backup.mdChatId', { id: chat.id }));
  lines.push(t('backup.mdCreated', { time: chat.createdAt }));
  lines.push(t('backup.mdUpdated', { time: chat.updatedAt }));
  lines.push(t('backup.mdMsgCount', { count: messageCount }));
  lines.push(t('backup.mdExported', { time: exportTime }));
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const msg of chat.messages) {
    const speaker = msg.role === 'user' ? userName : characterName;
    const roleLabel = msg.role === 'user' ? '👤' : msg.role === 'assistant' ? '🤖' : '⚙️';
    lines.push(`## ${roleLabel} ${speaker}`);
    lines.push('');
    if (msg.content) {
      // 导出的 Markdown 是给人读/给人续写的，去掉 ⟦⟧ 但保留心理段文字本身
      lines.push(stripNarrationMarkers(msg.content));
    } else {
      lines.push(t('backup.mdEmptyMsg'));
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * 触发下载对话 Markdown 文件
 */
export async function downloadChatMarkdown(
  chat: Chat,
  characterName: string,
  userName?: string
): Promise<SaveOutcome> {
  const md = exportChatMarkdown(chat, characterName, userName);
  const safeName = characterName.replace(/[^\w\u4e00-\u9fa5-]/g, '_');
  const safeDate = new Date(chat.updatedAt).toISOString().slice(0, 10);
  return saveBlob(
    `${safeName}-${t('backup.mdFilenameChat')}-${safeDate}.md`,
    () => new Blob([md], { type: 'text/markdown;charset=utf-8' })
  );
  // T-06 审计
  auditLogger.record('chat_export_md', `${characterName} / ${chat.messages.length} msgs`, 'ok');
}
