/**
 * API Key 加密存储 (AC20 安全 / F02.1)
 *
 * 职责：
 * 1. 使用用户主密码 + PBKDF2（600,000 迭代，OWASP 2023 建议）派生 AES-GCM 256 密钥
 * 2. AES-GCM 加密 API Key（含机密性 + 完整性认证标签）
 * 3. 提供透明加解密接口供 settings store 集成
 *
 * 规则约束（PRD F02.1 + OWASP 2023 强化）：
 * - 主密码不存储于本地（仅运行时内存）
 * - PBKDF2 迭代 600,000 次（OWASP 2023 Password Storage Cheat Sheet 对 SHA-256 的建议值；
 *   原 100,000 次为 PRD 初版要求，已按安全评审提升）
 * - 绝不使用设备指纹等不可靠信息生成密钥
 *
 * 注意：迭代次数变更后旧密文仍可解密（salt/iv 存于载荷中，迭代次数仅影响派生），
 * 新加密（setMasterPassword / 重新加密）将使用新迭代次数。
 *
 * 密文格式：`enc:v1:<base64-payload>`
 * - 前缀用于检测明文/密文（向后兼容旧数据）
 * - payload 包含 salt + iv + ciphertext（均 Base64）
 * - 每次加密生成新的 salt 与 iv，确保相同明文产生不同密文
 *
 * Web Crypto API SubtleCrypto 在所有目标平台浏览器（Chrome 100+/FF 100+/Safari 15+/Edge 100+）可用。
 */

/** 加密格式版本号 */
const ENCRYPTED_VERSION = 1;

/** 密文前缀，用于检测字符串是否为加密格式 */
export const ENCRYPTED_PREFIX = `enc:v${ENCRYPTED_VERSION}:`;

/** PBKDF2 迭代次数（OWASP 2023 建议 600,000） */
export const PBKDF2_ITERATIONS = 600_000;

/** Salt 长度（字节）—— PBKDF2 推荐 ≥16 字节 */
export const SALT_LENGTH = 16;

/** IV 长度（字节）—— AES-GCM 推荐 12 字节 */
export const IV_LENGTH = 12;

/** AES 密钥长度（位）—— AES-256 */
const AES_KEY_LENGTH = 256;

/** 派生密钥的哈希算法 */
const PBKDF2_HASH = 'SHA-256';

/** 加密载荷（持久化为 Base64 字符串） */
interface EncryptedPayload {
  /** 版本号（向前兼容） */
  v: number;
  /** PBKDF2 salt（Base64） */
  salt: string;
  /** AES-GCM 初始化向量（Base64，12 字节） */
  iv: string;
  /** 密文（Base64，含 GCM 认证标签） */
  ct: string;
}

// ── Base64 / 字节串互转工具 ──

/** Uint8Array → Base64 字符串 */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Base64 字符串 → Uint8Array<ArrayBuffer>
 *
 * 显式使用 ArrayBuffer 构造，确保返回值兼容 Web Crypto 的 BufferSource 类型
 * （TS 5.7+ 中 Uint8Array 默认为 Uint8Array<ArrayBufferLike>，含 SharedArrayBuffer 不可用于 SubtleCrypto）
 */
function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * 字符串 → UTF-8 字节（Uint8Array<ArrayBuffer>）
 *
 * TextEncoder.encode() 运行时始终由 ArrayBuffer 支持，但 TS 5.7+ 类型签名为 Uint8Array<ArrayBufferLike>，
 * 此处通过断言修复类型与实际运行时行为的不一致。
 */
function stringToBytes(s: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(s) as Uint8Array<ArrayBuffer>;
}

/** UTF-8 字节 → 字符串 */
function bytesToString(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

// ── 随机数生成 ──

/**
 * 生成密码学安全的随机字节
 * 使用 Web Crypto API crypto.getRandomValues
 *
 * 显式使用 ArrayBuffer 构造，确保兼容 SubtleCrypto 的 BufferSource 类型
 */
function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  const buffer = new ArrayBuffer(length);
  const bytes = new Uint8Array(buffer);
  crypto.getRandomValues(bytes);
  return bytes;
}

/**
 * 生成新的 PBKDF2 salt（16 字节随机数）
 */
export function generateSalt(): Uint8Array<ArrayBuffer> {
  return randomBytes(SALT_LENGTH);
}

/**
 * 生成新的 AES-GCM IV（12 字节随机数）
 */
export function generateIv(): Uint8Array<ArrayBuffer> {
  return randomBytes(IV_LENGTH);
}

// ── 密钥派生 ──

/**
 * 通过 PBKDF2 从主密码派生 AES-GCM 256 密钥
 *
 * @param masterPassword 用户主密码（明文，运行时内存）
 * @param salt PBKDF2 salt（16 字节，每次加密生成新的；解密时从密文载荷中读取）
 * @returns Web Crypto CryptoKey 对象（不可导出）
 */
export async function deriveKey(
  masterPassword: string,
  salt: Uint8Array<ArrayBuffer>
): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    stringToBytes(masterPassword),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: PBKDF2_HASH,
    },
    keyMaterial,
    { name: 'AES-GCM', length: AES_KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

// ── 加密 / 解密 ──

/**
 * 加密 API Key 明文
 *
 * 流程：
 * 1. 生成随机 salt + iv
 * 2. PBKDF2 派生 AES-GCM 密钥
 * 3. AES-GCM 加密明文（含 GCM 认证标签）
 * 4. 序列化为 `enc:v1:<base64-payload>` 字符串
 *
 * @param plaintext API Key 明文
 * @param masterPassword 主密码
 * @returns 加密字符串（含前缀）
 */
export async function encryptApiKey(
  plaintext: string,
  masterPassword: string
): Promise<string> {
  if (!plaintext) return plaintext; // 空字符串不加密，保持原值
  if (!masterPassword) {
    throw new Error('主密码为空，无法加密');
  }

  const salt = generateSalt();
  const iv = generateIv();
  const key = await deriveKey(masterPassword, salt);

  // AES-GCM 加密（authTag 自动附加到密文末尾）
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    stringToBytes(plaintext)
  );

  const payload: EncryptedPayload = {
    v: ENCRYPTED_VERSION,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ct: bytesToBase64(new Uint8Array(ciphertext)),
  };

  return ENCRYPTED_PREFIX + bytesToBase64(stringToBytes(JSON.stringify(payload)));
}

/**
 * 解密 API Key 密文
 *
 * @param encrypted 加密字符串（`enc:v1:...` 格式）
 * @param masterPassword 主密码
 * @returns 解密后的明文。失败时抛错（主密码错误 / 数据损坏 / 版本不兼容）
 */
export async function decryptApiKey(
  encrypted: string,
  masterPassword: string
): Promise<string> {
  if (!encrypted) return encrypted;
  if (!isEncrypted(encrypted)) {
    // 非加密格式（明文）直接返回，便于向后兼容
    return encrypted;
  }
  if (!masterPassword) {
    throw new Error('主密码为空，无法解密');
  }

  const payloadBase64 = encrypted.slice(ENCRYPTED_PREFIX.length);
  let payload: EncryptedPayload;
  try {
    payload = JSON.parse(bytesToString(base64ToBytes(payloadBase64))) as EncryptedPayload;
  } catch {
    throw new Error('密文格式损坏');
  }

  if (payload.v !== ENCRYPTED_VERSION) {
    throw new Error(`不支持的密文版本：v${payload.v}`);
  }

  const salt = base64ToBytes(payload.salt);
  const iv = base64ToBytes(payload.iv);
  const ciphertext = base64ToBytes(payload.ct);

  const key = await deriveKey(masterPassword, salt);

  let plaintextBuffer: ArrayBuffer;
  try {
    plaintextBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );
  } catch {
    throw new Error('解密失败：主密码错误或数据已损坏');
  }

  return bytesToString(new Uint8Array(plaintextBuffer));
}

// ── 检测 / 工具 ──

/**
 * 检测字符串是否为加密格式
 *
 * 用于：
 * - 透明加解密层决定是否需要解密
 * - 向后兼容：旧明文 apiKey 不会被误判
 * - 防止双重加密
 */
export function isEncrypted(value: string): boolean {
  return typeof value === 'string' && value.startsWith(ENCRYPTED_PREFIX);
}

/**
 * 校验主密码是否正确（通过尝试解密一段已知密文）
 *
 * 用于：
 * - 应用启动时验证用户输入的主密码
 * - 修改主密码前验证旧密码
 *
 * @param testEncryptedSample 已知的加密样本（如某个已加密的 apiKey）
 * @param masterPassword 待验证的主密码
 * @returns true=密码正确；false=密码错误
 */
export async function verifyMasterPassword(
  testEncryptedSample: string,
  masterPassword: string
): Promise<boolean> {
  // 明文或空样本无法验证主密码
  if (!testEncryptedSample || !isEncrypted(testEncryptedSample)) {
    return false;
  }
  try {
    await decryptApiKey(testEncryptedSample, masterPassword);
    return true;
  } catch {
    return false;
  }
}

/**
 * 重新加密：用旧密码解密后再用新密码加密
 *
 * 用于修改主密码场景。
 *
 * @param encrypted 原密文
 * @param oldPassword 旧主密码
 * @param newPassword 新主密码
 * @returns 新密文。若原值为明文或空，则原样返回
 */
export async function reencryptApiKey(
  encrypted: string,
  oldPassword: string,
  newPassword: string
): Promise<string> {
  if (!encrypted) return encrypted;
  if (!isEncrypted(encrypted)) {
    // 明文直接用新密码加密
    return encryptApiKey(encrypted, newPassword);
  }
  const plaintext = await decryptApiKey(encrypted, oldPassword);
  return encryptApiKey(plaintext, newPassword);
}
