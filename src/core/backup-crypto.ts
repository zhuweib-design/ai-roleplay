/**
 * 备份文件加密 (T-06)
 *
 * 复用 api-key-crypto 的 PBKDF2(600k 迭代) + AES-GCM 256 原语,
 * 为全量备份 JSON 提供机密性 + 完整性认证。
 *
 * 格式:enc:v1:<base64-payload>
 * payload = { v, salt, iv, ct }(与 api-key 密文同构,salt/iv 随机每次不同)
 *
 * 设计:
 * - 导出时用主密码加密 → 备份文件离开本机后即使泄露也无法读取
 * - 导入时用同一主密码解密,密码错误/GCM 认证失败即抛错(防篡改)
 * - 不存储主密码;每次加密新 salt/iv
 */

import { deriveKey, generateSalt, generateIv } from './api-key-crypto';

/** 备份加密格式版本 */
import { t } from '@/i18n';


const BACKUP_ENC_VERSION = 1;
/** 密文前缀(与 api-key 密文区分,便于识别与向后兼容) */
export const BACKUP_ENC_PREFIX = `enc:v${BACKUP_ENC_VERSION}:`;

// ── 字节串互转(本地副本,避免修改 api-key-crypto 的私有接口) ──

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function stringToBytes(s: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(s) as Uint8Array<ArrayBuffer>;
}

function bytesToString(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

/** 加密载荷(与 api-key-crypto 的 EncryptedPayload 同构) */
interface BackupEncryptedPayload {
  v: number;
  salt: string;
  iv: string;
  ct: string;
}

/**
 * 加密备份 JSON 文本
 *
 * @param plainJson 备份 JSON 字符串
 * @param masterPassword 主密码
 * @returns 加密后的字符串(含前缀)
 */
export async function encryptBackup(plainJson: string, masterPassword: string): Promise<string> {
  if (!masterPassword) {
    throw new Error(t('crypto.bakMasterPwEmptyEnc'));
  }

  const salt = generateSalt();
  const iv = generateIv();
  const key = await deriveKey(masterPassword, salt);

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    stringToBytes(plainJson)
  );

  const payload: BackupEncryptedPayload = {
    v: BACKUP_ENC_VERSION,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ct: bytesToBase64(new Uint8Array(ciphertext)),
  };

  return BACKUP_ENC_PREFIX + bytesToBase64(stringToBytes(JSON.stringify(payload)));
}

/**
 * 解密备份文件内容
 *
 * @param encrypted 加密字符串(enc:v1:... 格式)
 * @param masterPassword 主密码
 * @returns 解密后的备份 JSON 文本
 * @throws 密码错误 / 数据损坏 / 版本不兼容
 */
export async function decryptBackup(encrypted: string, masterPassword: string): Promise<string> {
  if (!isBackupEncrypted(encrypted)) {
    // 非加密格式(明文备份)直接返回,向后兼容
    return encrypted;
  }
  if (!masterPassword) {
    throw new Error(t('crypto.bakMasterPwEmptyDec'));
  }

  const payloadBase64 = encrypted.slice(BACKUP_ENC_PREFIX.length);
  let payload: BackupEncryptedPayload;
  try {
    payload = JSON.parse(bytesToString(base64ToBytes(payloadBase64))) as BackupEncryptedPayload;
  } catch {
    throw new Error(t('crypto.bakCipherCorrupted'));
  }

  if (payload.v !== BACKUP_ENC_VERSION) {
    throw new Error(t('crypto.bakUnsupportedVer', { v: payload.v }));
  }

  const key = await deriveKey(masterPassword, base64ToBytes(payload.salt));

  let plaintextBuffer: ArrayBuffer;
  try {
    plaintextBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(payload.iv) },
      key,
      base64ToBytes(payload.ct)
    );
  } catch {
    throw new Error(t('crypto.bakDecryptFailed'));
  }

  return bytesToString(new Uint8Array(plaintextBuffer));
}

/** 检测字符串是否为加密备份格式 */
export function isBackupEncrypted(value: string): boolean {
  return typeof value === 'string' && value.startsWith(BACKUP_ENC_PREFIX);
}
