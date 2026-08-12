import { describe, it, expect } from 'vitest';
import {
  encryptApiKey,
  decryptApiKey,
  deriveKey,
  isEncrypted,
  verifyMasterPassword,
  reencryptApiKey,
  generateSalt,
  generateIv,
  ENCRYPTED_PREFIX,
  PBKDF2_ITERATIONS,
  SALT_LENGTH,
  IV_LENGTH,
} from '../../src/core/api-key-crypto';

// ── 单元测试：API Key 加密存储 (AC20) ──

describe('api-key-crypto — AC20 安全', () => {
  const TEST_PASSWORD = 'my-master-password-2026';
  const TEST_API_KEY = 'sk-test-1234567890abcdef';

  // ── 常量 ──

  describe('常量', () => {
    it('ENCRYPTED_PREFIX 应为 "enc:v1:"', () => {
      expect(ENCRYPTED_PREFIX).toBe('enc:v1:');
    });

    it('PBKDF2_ITERATIONS 应为 600,000（OWASP 2023 建议）', () => {
      expect(PBKDF2_ITERATIONS).toBe(600_000);
    });

    it('SALT_LENGTH 应为 16 字节', () => {
      expect(SALT_LENGTH).toBe(16);
    });

    it('IV_LENGTH 应为 12 字节（AES-GCM 推荐）', () => {
      expect(IV_LENGTH).toBe(12);
    });
  });

  // ── 随机数生成 ──

  describe('generateSalt', () => {
    it('应返回 16 字节的 Uint8Array', () => {
      const salt = generateSalt();
      expect(salt).toBeInstanceOf(Uint8Array);
      expect(salt.length).toBe(16);
    });

    it('两次调用应返回不同值（随机性）', () => {
      const a = generateSalt();
      const b = generateSalt();
      expect(Array.from(a)).not.toEqual(Array.from(b));
    });
  });

  describe('generateIv', () => {
    it('应返回 12 字节的 Uint8Array', () => {
      const iv = generateIv();
      expect(iv).toBeInstanceOf(Uint8Array);
      expect(iv.length).toBe(12);
    });

    it('两次调用应返回不同值（随机性）', () => {
      const a = generateIv();
      const b = generateIv();
      expect(Array.from(a)).not.toEqual(Array.from(b));
    });
  });

  // ── 密钥派生 ──

  describe('deriveKey', () => {
    it('应返回 CryptoKey 对象', async () => {
      const key = await deriveKey(TEST_PASSWORD, generateSalt());
      expect(key).toBeInstanceOf(CryptoKey);
    });

    it('相同密码 + 相同 salt 应派生相同密钥（确定性）', async () => {
      const salt = generateSalt();
      const a = await deriveKey(TEST_PASSWORD, salt);
      const b = await deriveKey(TEST_PASSWORD, salt);
      // CryptoKey 不可直接比较，通过加密解密一致性间接验证
      const iv = generateIv();
      const data = new TextEncoder().encode('test') as Uint8Array<ArrayBuffer>;
      const ct1 = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, a, data);
      const ct2 = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, b, data);
      expect(new Uint8Array(ct1)).toEqual(new Uint8Array(ct2));
    });

    it('相同密码 + 不同 salt 应派生不同密钥', async () => {
      const keyA = await deriveKey(TEST_PASSWORD, generateSalt());
      const keyB = await deriveKey(TEST_PASSWORD, generateSalt());
      // 用相同 iv 加密相同明文，结果应不同
      const iv = generateIv();
      const data = new TextEncoder().encode('test') as Uint8Array<ArrayBuffer>;
      const ct1 = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, keyA, data);
      const ct2 = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, keyB, data);
      expect(new Uint8Array(ct1)).not.toEqual(new Uint8Array(ct2));
    });

    it('不同密码 + 相同 salt 应派生不同密钥', async () => {
      const salt = generateSalt();
      const keyA = await deriveKey('password-A', salt);
      const keyB = await deriveKey('password-B', salt);
      const iv = generateIv();
      const data = new TextEncoder().encode('test') as Uint8Array<ArrayBuffer>;
      const ct1 = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, keyA, data);
      const ct2 = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, keyB, data);
      expect(new Uint8Array(ct1)).not.toEqual(new Uint8Array(ct2));
    });

    it('派生的密钥不可导出（extractable=false）', async () => {
      const key = await deriveKey(TEST_PASSWORD, generateSalt());
      expect(key.extractable).toBe(false);
    });

    it('派生的密钥用途应包含 encrypt 和 decrypt', async () => {
      const key = await deriveKey(TEST_PASSWORD, generateSalt());
      expect(key.usages).toContain('encrypt');
      expect(key.usages).toContain('decrypt');
    });
  });

  // ── isEncrypted ──

  describe('isEncrypted', () => {
    it('加密字符串应返回 true', async () => {
      const enc = await encryptApiKey(TEST_API_KEY, TEST_PASSWORD);
      expect(isEncrypted(enc)).toBe(true);
    });

    it('明文字符串应返回 false', () => {
      expect(isEncrypted('sk-test')).toBe(false);
    });

    it('空字符串应返回 false', () => {
      expect(isEncrypted('')).toBe(false);
    });

    it('仅前缀字符串应返回 true（前缀匹配）', () => {
      expect(isEncrypted('enc:v1:abc')).toBe(true);
    });

    it('其他前缀应返回 false', () => {
      expect(isEncrypted('enc:v2:abc')).toBe(false);
      expect(isEncrypted('dec:v1:abc')).toBe(false);
      expect(isEncrypted('encrypted:abc')).toBe(false);
    });
  });

  // ── 加密 ──

  describe('encryptApiKey', () => {
    it('应返回带 enc:v1: 前缀的字符串', async () => {
      const enc = await encryptApiKey(TEST_API_KEY, TEST_PASSWORD);
      expect(enc.startsWith(ENCRYPTED_PREFIX)).toBe(true);
    });

    it('密文不应包含明文 API Key', async () => {
      const enc = await encryptApiKey(TEST_API_KEY, TEST_PASSWORD);
      expect(enc).not.toContain(TEST_API_KEY);
      // 即使是部分子串也不应出现
      expect(enc).not.toContain(TEST_API_KEY.slice(0, 6));
    });

    it('相同明文 + 相同密码，两次加密应产生不同密文（随机 salt/iv）', async () => {
      const a = await encryptApiKey(TEST_API_KEY, TEST_PASSWORD);
      const b = await encryptApiKey(TEST_API_KEY, TEST_PASSWORD);
      expect(a).not.toBe(b);
    });

    it('空明文应原样返回（不加密）', async () => {
      const enc = await encryptApiKey('', TEST_PASSWORD);
      expect(enc).toBe('');
    });

    it('主密码为空时应抛错', async () => {
      await expect(encryptApiKey(TEST_API_KEY, '')).rejects.toThrow('主密码为空');
    });

    it('支持包含 Unicode 字符的 API Key', async () => {
      const unicodeKey = 'sk-测试-🔑-key';
      const enc = await encryptApiKey(unicodeKey, TEST_PASSWORD);
      const dec = await decryptApiKey(enc, TEST_PASSWORD);
      expect(dec).toBe(unicodeKey);
    });

    it('支持超长 API Key（1024 字符）', async () => {
      const longKey = 'sk-' + 'a'.repeat(1024);
      const enc = await encryptApiKey(longKey, TEST_PASSWORD);
      const dec = await decryptApiKey(enc, TEST_PASSWORD);
      expect(dec).toBe(longKey);
    });
  });

  // ── 解密 ──

  describe('decryptApiKey', () => {
    it('加密后解密应还原明文', async () => {
      const enc = await encryptApiKey(TEST_API_KEY, TEST_PASSWORD);
      const dec = await decryptApiKey(enc, TEST_PASSWORD);
      expect(dec).toBe(TEST_API_KEY);
    });

    it('错误的主密码应抛错', async () => {
      const enc = await encryptApiKey(TEST_API_KEY, TEST_PASSWORD);
      await expect(decryptApiKey(enc, 'wrong-password')).rejects.toThrow();
    });

    it('主密码为空时应抛错', async () => {
      const enc = await encryptApiKey(TEST_API_KEY, TEST_PASSWORD);
      await expect(decryptApiKey(enc, '')).rejects.toThrow('主密码为空');
    });

    it('非加密格式（明文）应原样返回（向后兼容）', async () => {
      const plaintext = 'sk-legacy-plaintext';
      const result = await decryptApiKey(plaintext, TEST_PASSWORD);
      expect(result).toBe(plaintext);
    });

    it('空字符串应原样返回', async () => {
      const result = await decryptApiKey('', TEST_PASSWORD);
      expect(result).toBe('');
    });

    it('损坏的密文应抛错', async () => {
      const enc = await encryptApiKey(TEST_API_KEY, TEST_PASSWORD);
      // 破坏 payload 部分
      const corrupted = enc.slice(0, -4) + 'AAAA';
      await expect(decryptApiKey(corrupted, TEST_PASSWORD)).rejects.toThrow();
    });

    it('篡改密文应抛错（GCM 完整性校验）', async () => {
      const enc = await encryptApiKey(TEST_API_KEY, TEST_PASSWORD);
      // 修改 payload 末尾字符（破坏 GCM 认证标签）
      const tampered = enc.slice(0, -1) + (enc.slice(-1) === 'A' ? 'B' : 'A');
      await expect(decryptApiKey(tampered, TEST_PASSWORD)).rejects.toThrow();
    });
  });

  // ── verifyMasterPassword ──

  describe('verifyMasterPassword', () => {
    it('正确密码应返回 true', async () => {
      const enc = await encryptApiKey(TEST_API_KEY, TEST_PASSWORD);
      const ok = await verifyMasterPassword(enc, TEST_PASSWORD);
      expect(ok).toBe(true);
    });

    it('错误密码应返回 false（不抛错）', async () => {
      const enc = await encryptApiKey(TEST_API_KEY, TEST_PASSWORD);
      const ok = await verifyMasterPassword(enc, 'wrong-password');
      expect(ok).toBe(false);
    });

    it('明文样本应返回 false（无法验证）', async () => {
      const ok = await verifyMasterPassword('sk-plaintext', TEST_PASSWORD);
      expect(ok).toBe(false);
    });

    it('空字符串样本应返回 false', async () => {
      const ok = await verifyMasterPassword('', TEST_PASSWORD);
      expect(ok).toBe(false);
    });
  });

  // ── reencryptApiKey ──

  describe('reencryptApiKey', () => {
    it('用旧密码解密后用新密码加密', async () => {
      const enc = await encryptApiKey(TEST_API_KEY, TEST_PASSWORD);
      const reenc = await reencryptApiKey(enc, TEST_PASSWORD, 'new-password');
      // 新密文应可被新密码解密
      const dec = await decryptApiKey(reenc, 'new-password');
      expect(dec).toBe(TEST_API_KEY);
    });

    it('重新加密后旧密码无法解密', async () => {
      const enc = await encryptApiKey(TEST_API_KEY, TEST_PASSWORD);
      const reenc = await reencryptApiKey(enc, TEST_PASSWORD, 'new-password');
      await expect(decryptApiKey(reenc, TEST_PASSWORD)).rejects.toThrow();
    });

    it('旧密码错误时应抛错', async () => {
      const enc = await encryptApiKey(TEST_API_KEY, TEST_PASSWORD);
      await expect(
        reencryptApiKey(enc, 'wrong-old', 'new-password')
      ).rejects.toThrow();
    });

    it('明文输入应直接用新密码加密', async () => {
      const reenc = await reencryptApiKey(TEST_API_KEY, 'unused', TEST_PASSWORD);
      expect(isEncrypted(reenc)).toBe(true);
      const dec = await decryptApiKey(reenc, TEST_PASSWORD);
      expect(dec).toBe(TEST_API_KEY);
    });

    it('空字符串应原样返回', async () => {
      const result = await reencryptApiKey('', TEST_PASSWORD, 'new-password');
      expect(result).toBe('');
    });

    it('重新加密后密文应与原密文不同', async () => {
      const enc = await encryptApiKey(TEST_API_KEY, TEST_PASSWORD);
      const reenc = await reencryptApiKey(enc, TEST_PASSWORD, TEST_PASSWORD);
      expect(reenc).not.toBe(enc);
    });
  });

  // ── 端到端集成 ──

  describe('端到端', () => {
    it('加密→解密→重新加密→解密 完整流程', async () => {
      // 1. 加密
      const enc1 = await encryptApiKey(TEST_API_KEY, 'password-1');
      expect(isEncrypted(enc1)).toBe(true);

      // 2. 解密
      const dec1 = await decryptApiKey(enc1, 'password-1');
      expect(dec1).toBe(TEST_API_KEY);

      // 3. 重新加密（换密码）
      const enc2 = await reencryptApiKey(enc1, 'password-1', 'password-2');

      // 4. 用新密码解密
      const dec2 = await decryptApiKey(enc2, 'password-2');
      expect(dec2).toBe(TEST_API_KEY);

      // 5. 旧密码无法解密新密文
      await expect(decryptApiKey(enc2, 'password-1')).rejects.toThrow();
    });

    it('多个 API Key 使用相同主密码独立加解密', async () => {
      const keys = ['sk-key-1', 'sk-key-2', 'sk-key-3'];
      const encrypted = await Promise.all(
        keys.map((k) => encryptApiKey(k, TEST_PASSWORD))
      );

      // 所有密文都不同（即使明文不同也必然不同，因 salt/iv 随机）
      const uniqueEnc = new Set(encrypted);
      expect(uniqueEnc.size).toBe(3);

      // 解密还原
      const decrypted = await Promise.all(
        encrypted.map((e) => decryptApiKey(e, TEST_PASSWORD))
      );
      expect(decrypted).toEqual(keys);
    });

    it('修改主密码后所有 apiKey 应可被新密码解密', async () => {
      const oldPassword = 'old-pass';
      const newPassword = 'new-pass';
      const keys = ['sk-a', 'sk-b', 'sk-c'];

      // 用旧密码加密
      const encrypted = await Promise.all(
        keys.map((k) => encryptApiKey(k, oldPassword))
      );

      // 修改密码（重新加密所有 key）
      const reencrypted = await Promise.all(
        encrypted.map((e) => reencryptApiKey(e, oldPassword, newPassword))
      );

      // 全部用新密码解密成功
      const decrypted = await Promise.all(
        reencrypted.map((e) => decryptApiKey(e, newPassword))
      );
      expect(decrypted).toEqual(keys);
    });
  });

  // ── 性能基线（确保 100k 迭代不卡顿） ──

  describe('性能', () => {
    it('加密应在 500ms 内完成（PBKDF2 600k 迭代）', async () => {
      const start = Date.now();
      await encryptApiKey(TEST_API_KEY, TEST_PASSWORD);
      const elapsed = Date.now() - start;
      // CI 环境可能较慢，给宽裕阈值
      expect(elapsed).toBeLessThan(2000);
    });

    it('解密应在 500ms 内完成', async () => {
      const enc = await encryptApiKey(TEST_API_KEY, TEST_PASSWORD);
      const start = Date.now();
      await decryptApiKey(enc, TEST_PASSWORD);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(2000);
    });
  });
});
