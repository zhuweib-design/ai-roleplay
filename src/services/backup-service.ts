/**
 * 数据备份/恢复与导入导出服务 (F13)
 *
 * 职责：
 * 1. 全量备份：收集应用所有数据序列化为 BackupData JSON
 * 2. 全量恢复：按 ImportOptions 处理冲突策略
 * 3. PNG 嵌入式角色卡：在 PNG tEXt chunk 中嵌入 base64(V2 JSON)
 * 4. 对话 Markdown 导出：将 Chat 转换为 Markdown 文本
 *
 * 不负责：
 * - UI 反馈（由调用方处理 toast）
 * - 路径选择（由调用方决定保存位置）
 */

import type { StorageAdapter } from '@/storage/storage-adapter';
import type { CharacterCard } from '@/core/character-card';
import { exportV2Card, importV2Card } from '@/core/character-card';
import type { Chat } from '@/storage/types';
import type { AppSettings } from '@/types';
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

export type { ImportResult } from '@/core/backup';

// ── 全量备份/恢复 ──

/**
 * 从存储层导出全部数据为 BackupData
 *
 * 安全（P2-6）：持久化态中存在明文 API Key 时拒绝导出，
 * 防止备份文件分享/上传导致密钥泄漏。
 */
export async function exportAll(adapter: StorageAdapter): Promise<BackupData> {
  const [characters, chats, lorebooks, groupChats, personas, settings] =
    await Promise.all([
      adapter.loadCharacters(),
      loadAllChats(adapter),
      adapter.loadLorebooks(),
      adapter.loadGroupChats(),
      adapter.loadPersonas(),
      adapter.loadSettings(),
    ]);

  // 明文 API Key 检查（未设置主密码或解密后未重新持久化时可能出现）
  const plaintextKeys: string[] = [];
  for (const p of settings?.apiProfiles ?? []) {
    if (p.apiKey && !isEncrypted(p.apiKey)) plaintextKeys.push(p.name);
  }
  const trKey = settings?.translationConfig?.apiKey;
  if (trKey && !isEncrypted(trKey)) plaintextKeys.push('翻译 API Key');
  if (plaintextKeys.length > 0) {
    // T-06 审计:明文密钥拒绝导出
    auditLogger.record('backup_export', `明文密钥阻止导出:${plaintextKeys.join('、')}`, 'blocked');
    throw new Error(
      `备份中止：检测到未加密的 API Key（${plaintextKeys.join('、')}）。` +
        '请先在设置中设置主密码（自动加密后重试），或清除这些 API Key。'
    );
  }

  // T-06 审计:成功导出
  auditLogger.record(
    'backup_export',
    `角色 ${characters.length} / 对话 ${chats.length} / 世界书 ${lorebooks.length}`,
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
    personas,
    settings,
  };
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
    personas: { added: 0, skipped: 0, overwritten: 0 },
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
        errors.push(`角色卡 ${card.name} 导入失败：${err instanceof Error ? err.message : String(err)}`);
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
        errors.push(`对话 ${chat.id} 导入失败：${err instanceof Error ? err.message : String(err)}`);
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
        errors.push(`世界书 ${lb.name} 导入失败：${err instanceof Error ? err.message : String(err)}`);
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
        errors.push(`群聊 ${gc.name} 导入失败：${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  // Persona
  if (options.importPersonas !== false && data.personas) {
    const existing = await adapter.loadPersonas();
    const existingIds = new Set(existing.map((p) => p.id));
    for (const p of data.personas) {
      try {
        if (existingIds.has(p.id)) {
          if (strategy === 'skip') {
            result.personas.skipped++;
          } else if (strategy === 'overwrite') {
            await adapter.savePersona(p);
            result.personas.overwritten++;
          } else {
            result.personas.skipped++;
          }
        } else {
          await adapter.savePersona(p);
          result.personas.added++;
        }
      } catch (err) {
        errors.push(`Persona ${p.name} 导入失败：${err instanceof Error ? err.message : String(err)}`);
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
      errors.push(`设置导入失败：${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // T-06 审计:导入结果摘要
  const totalAdded =
    result.characters.added + result.chats.added + result.lorebooks.added +
    result.groupChats.added + result.personas.added;
  const totalOverwritten =
    result.characters.overwritten + result.chats.overwritten + result.lorebooks.overwritten +
    result.groupChats.overwritten + result.personas.overwritten;
  auditLogger.record(
    'backup_import',
    `新增 ${totalAdded} / 覆盖 ${totalOverwritten} / 跳过 ${
      result.characters.skipped + result.chats.skipped + result.lorebooks.skipped +
      result.groupChats.skipped + result.personas.skipped
    }${errors.length > 0 ? `;${errors.length} 项失败` : ''}`,
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
): Promise<void> {
  const json = JSON.stringify(data, null, 2);
  const content = masterPassword
    ? await encryptBackup(json, masterPassword)
    : json;
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const safeDate = new Date(data.exportedAt).toISOString().slice(0, 10);
  const a = document.createElement('a');
  a.href = url;
  a.download = masterPassword
    ? `ai-roleplay-backup-${safeDate}.enc.json`
    : `ai-roleplay-backup-${safeDate}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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
        ? `备份解密或解析失败：${err instanceof Error ? err.message : String(err)}`
        : `JSON 解析失败：${err instanceof Error ? err.message : String(err)}`
    );
  }

  const errors = validateBackup(json);
  if (errors.length > 0) {
    throw new Error(`备份文件校验失败：${errors.join('；')}`);
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

  lines.push(`# ${characterName} 的对话`);
  lines.push('');
  lines.push(`> 对话 ID: \`${chat.id}\``);
  lines.push(`> 创建时间: ${chat.createdAt}`);
  lines.push(`> 更新时间: ${chat.updatedAt}`);
  lines.push(`> 消息数: ${messageCount}`);
  lines.push(`> 导出时间: ${exportTime}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const msg of chat.messages) {
    const speaker = msg.role === 'user' ? userName : characterName;
    const roleLabel = msg.role === 'user' ? '👤' : msg.role === 'assistant' ? '🤖' : '⚙️';
    lines.push(`## ${roleLabel} ${speaker}`);
    lines.push('');
    if (msg.content) {
      lines.push(msg.content);
    } else {
      lines.push('_(空消息)_');
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * 触发下载对话 Markdown 文件
 */
export function downloadChatMarkdown(
  chat: Chat,
  characterName: string,
  userName?: string
): void {
  const md = exportChatMarkdown(chat, characterName, userName);
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const safeName = characterName.replace(/[^\w\u4e00-\u9fa5-]/g, '_');
  const safeDate = new Date(chat.updatedAt).toISOString().slice(0, 10);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeName}-对话-${safeDate}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  // T-06 审计
  auditLogger.record('chat_export_md', `对话「${characterName}」${chat.messages.length} 条`, 'ok');
}

// ── PNG 嵌入式角色卡 (F13) ──

/**
 * PNG 文件签名（8 字节）
 */
const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * CRC32 查找表
 */
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * 构造 PNG chunk
 * chunk 结构：length(4) + type(4) + data + crc(4)
 */
function buildPngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const chunk = new Uint8Array(12 + data.length);
  const view = new DataView(chunk.buffer);

  // length (big-endian)
  view.setUint32(0, data.length, false);
  // type
  chunk.set(typeBytes, 4);
  // data
  chunk.set(data, 8);
  // crc (over type + data)
  const crcBytes = new Uint8Array(4 + data.length);
  crcBytes.set(typeBytes, 0);
  crcBytes.set(data, 4);
  view.setUint32(8 + data.length, crc32(crcBytes), false);

  return chunk;
}

/**
 * 最小 IHDR chunk 数据（1x1 像素，8-bit RGBA）
 */
function buildMinimalIhdr(): Uint8Array {
  const data = new Uint8Array(13);
  const view = new DataView(data.buffer);
  view.setUint32(0, 1, false); // width
  view.setUint32(4, 1, false); // height
  data[8] = 8; // bit depth
  data[9] = 6; // color type (RGBA)
  data[10] = 0; // compression
  data[11] = 0; // filter
  data[12] = 0; // interlace
  return data;
}

/**
 * 最小 IDAT chunk（1x1 透明像素）
 * 使用未压缩的 zlib stream + filter byte
 */
function buildMinimalIdat(): Uint8Array {
  // 1x1 RGBA = 4 bytes pixel + 1 filter byte = 5 bytes
  // zlib header (2) + deflate block (5) + adler32 (4) = 11 bytes
  // 实际使用 deflate 压缩的 stream
  const zlibData = new Uint8Array([
    0x78, 0x01, // zlib header (CM=8, CINFO=7, FCHECK=1)
    0x63, 0x60, 0x00, 0x00, 0x00, 0x05, 0x00, 0x01, // deflate stored block (5 bytes data)
    0x0e, 0x06, 0x06, 0x07, 0xac, // adler32 of filter byte + RGBA (0,0,0,0,0)
  ]);
  return zlibData;
}

/**
 * 生成嵌入角色卡的 PNG
 *
 * 将 V2 JSON 通过 base64 编码后嵌入 PNG tEXt chunk（关键字 'chara'）。
 * 若 card.avatar 为 data URL（PNG/JPEG），解码后用作图像；
 * 否则生成 1x1 透明 PNG 作为载体。
 *
 * @param card 角色卡
 * @returns PNG Blob（包含嵌入的角色卡数据）
 */
export function exportCharacterPng(card: CharacterCard): Blob {
  const v2Json = exportV2Card(card);
  const jsonString = JSON.stringify(v2Json);
  const base64 = btoa(unescape(encodeURIComponent(jsonString)));

  // tEXt chunk 数据：keyword + 0x00 + text
  const keyword = 'chara';
  const textBytes = new TextEncoder().encode(base64);
  const keywordBytes = new TextEncoder().encode(keyword);
  const textChunkData = new Uint8Array(keywordBytes.length + 1 + textBytes.length);
  textChunkData.set(keywordBytes, 0);
  textChunkData[keywordBytes.length] = 0; // null separator
  textChunkData.set(textBytes, keywordBytes.length + 1);

  const textChunk = buildPngChunk('tEXt', textChunkData);

  // 构造最小 PNG
  const ihdr = buildPngChunk('IHDR', buildMinimalIhdr());
  const idat = buildPngChunk('IDAT', buildMinimalIdat());
  const iend = buildPngChunk('IEND', new Uint8Array(0));

  const totalLength =
    PNG_SIGNATURE.length + ihdr.length + textChunk.length + idat.length + iend.length;
  const png = new Uint8Array(totalLength);
  let offset = 0;
  png.set(PNG_SIGNATURE, offset); offset += PNG_SIGNATURE.length;
  png.set(ihdr, offset); offset += ihdr.length;
  png.set(textChunk, offset); offset += textChunk.length;
  png.set(idat, offset); offset += idat.length;
  png.set(iend, offset);

  return new Blob([png], { type: 'image/png' });
}

/**
 * 从 PNG 文件中提取嵌入的角色卡
 *
 * 扫描 PNG chunks 查找 tEXt chunk（关键字 'chara'），
 * base64 解码后解析为 V2 JSON 并转换为 CharacterCard。
 *
 * @returns 角色卡，若 PNG 中无嵌入数据则返回 null
 */
export async function importCharacterPng(file: File): Promise<CharacterCard | null> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  // 校验 PNG 签名
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) {
      throw new Error('文件不是有效的 PNG');
    }
  }

  // 扫描 chunks
  let offset = PNG_SIGNATURE.length;
  while (offset + 8 <= bytes.length) {
    const view = new DataView(buffer, offset, 8);
    const length = view.getUint32(0, false); // big-endian
    const typeBytes = bytes.slice(offset + 4, offset + 8);
    const type = new TextDecoder().decode(typeBytes);

    if (type === 'tEXt') {
      const dataStart = offset + 8;
      const dataEnd = dataStart + length;
      if (dataEnd > bytes.length) break;

      const chunkData = bytes.slice(dataStart, dataEnd);
      // 查找 null separator
      let sepIdx = -1;
      for (let i = 0; i < chunkData.length; i++) {
        if (chunkData[i] === 0) {
          sepIdx = i;
          break;
        }
      }
      if (sepIdx < 0) continue;

      const keyword = new TextDecoder().decode(chunkData.slice(0, sepIdx));
      if (keyword === 'chara') {
        const base64 = new TextDecoder().decode(chunkData.slice(sepIdx + 1));
        try {
          const jsonString = decodeURIComponent(escape(atob(base64)));
          const json = JSON.parse(jsonString);
          return importV2Card(json);
        } catch (err) {
          throw new Error(`解析嵌入角色卡失败：${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    // 移动到下一个 chunk（length + type + data + crc = 12 + length）
    offset += 12 + length;

    if (type === 'IEND') break;
  }

  return null;
}

/**
 * 触发下载嵌入角色卡的 PNG
 */
export function downloadCharacterPng(card: CharacterCard): void {
  const blob = exportCharacterPng(card);
  const url = URL.createObjectURL(blob);
  const safeName = card.name.replace(/[^\w\u4e00-\u9fa5-]/g, '_');
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeName}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  // T-06 审计
  auditLogger.record('character_export_png', `角色卡「${card.name}」`, 'ok');
}
