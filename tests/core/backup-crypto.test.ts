/**
 * backup-crypto — 备份文件加密 (T-06) 测试
 *
 * 覆盖：
 * - 加密→解密往返一致
 * - 密文含前缀、不含明文（机密性）
 * - 密码错误解密失败（GCM 认证）
 * - 明文输入直接返回（向后兼容）
 * - 损坏密文抛错
 */
import { describe, it, expect } from 'vitest';
import {
  encryptBackup,
  decryptBackup,
  isBackupEncrypted,
  BACKUP_ENC_PREFIX,
} from '@core/backup-crypto';

describe('backup-crypto (T-06)', () => {
  it('加密→解密往返一致', async () => {
    const plain = JSON.stringify({ version: '1.0', characters: [{ id: 'c1', name: '测试' }] });
    const enc = await encryptBackup(plain, 'master-pass');
    await expect(decryptBackup(enc, 'master-pass')).resolves.toBe(plain);
  });

  it('密文含前缀且不含明文内容', async () => {
    const plain = 'SECRET_BACKUP_CONTENT';
    const enc = await encryptBackup(plain, 'pwd');
    expect(enc.startsWith(BACKUP_ENC_PREFIX)).toBe(true);
    expect(enc).not.toContain('SECRET_BACKUP_CONTENT');
    expect(isBackupEncrypted(enc)).toBe(true);
  });

  it('相同明文两次加密产生不同密文（随机 salt/iv）', async () => {
    const a = await encryptBackup('same', 'pwd');
    const b = await encryptBackup('same', 'pwd');
    expect(a).not.toBe(b);
  });

  it('密码错误解密失败', async () => {
    const enc = await encryptBackup('data', 'right-pass');
    await expect(decryptBackup(enc, 'wrong-pass')).rejects.toThrow(/主密码错误|解密失败/);
  });

  it('明文输入直接返回（向后兼容）', async () => {
    expect(await decryptBackup('plain-json', 'any-pwd')).toBe('plain-json');
    expect(isBackupEncrypted('plain-json')).toBe(false);
  });

  it('空密码加密抛错', async () => {
    await expect(encryptBackup('data', '')).rejects.toThrow(/主密码为空/);
  });

  it('损坏密文抛错', async () => {
    await expect(decryptBackup(`${BACKUP_ENC_PREFIX}not-base64!!`, 'pwd')).rejects.toThrow(/损坏/);
  });
});