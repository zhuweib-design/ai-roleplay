import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useSettingsStore } from '../../src/stores/settings';
import { isEncrypted, decryptApiKey } from '@core/api-key-crypto';
import { getRemoteApiKeyState, setRemoteApiKeyState } from '@core/vector-model-manager';
import { initLocale } from '@/i18n';
import type { AppSettings } from '@/types';

/**
 * P1-4：远程向量网关 apiKey 纳入主密码加密体系
 *
 * 背景：该密钥原先以明文存于 localStorage['aijiuguan.remoteEmbedding']，
 * 游离于主密码体系之外（apiProfiles / translationConfig 的 apiKey 都会加密），
 * 也不在备份导出的明文密钥检查范围内。
 *
 * 读取侧特殊：VectorModelManager.defaultFactory() 是同步静态方法，而
 * decryptApiKey() 是异步的 —— 故采用「解锁时解密一次写入内存态」而非读取时解密。
 * 本组用例覆盖三态语义（plain / unlocked / locked）与四条联动路径。
 */

const REMOTE_KEY = 'aijiuguan.remoteEmbedding';
const PW_OLD = 'master-pw-old';
const PW_NEW = 'master-pw-new';

class MockStorageAdapter {
  async loadSettings(): Promise<Partial<AppSettings>> {
    return {};
  }
  async saveSettings(_settings: AppSettings): Promise<void> {
    /* noop */
  }
  // exportAll 会并行读取以下集合；本组用例只关心密钥检查，故一律返回空
  async loadStories(): Promise<unknown[]> {
    return [];
  }
  async loadCharacters(): Promise<unknown[]> {
    return [];
  }
  async loadLorebooks(): Promise<unknown[]> {
    return [];
  }
  async loadGroupChats(): Promise<unknown[]> {
    return [];
  }
  async loadPersonas(): Promise<unknown[]> {
    return [];
  }
}

function seedRemote(apiKey: string): void {
  localStorage.setItem(
    REMOTE_KEY,
    JSON.stringify({
      baseUrl: 'https://gateway.example.com',
      apiKey,
      modelName: 'bge-m3',
      embeddingPath: '/embeddings',
      dim: 1024,
    })
  );
}

function storedApiKey(): string {
  const raw = localStorage.getItem(REMOTE_KEY);
  if (!raw) return '';
  return (JSON.parse(raw) as { apiKey?: string }).apiKey ?? '';
}

describe('P1-4 远程向量密钥 — 纳入主密码加密体系', () => {
  let store: ReturnType<typeof useSettingsStore>;
  let adapter: MockStorageAdapter;

  beforeEach(() => {
    setActivePinia(createPinia());
    initLocale('zh');
    localStorage.clear();
    // 内存态是模块级的，测试间需重置，避免相互污染
    setRemoteApiKeyState({ state: 'plain' });
    store = useSettingsStore();
    adapter = new MockStorageAdapter();
    store.setStorageAdapter(adapter);
  });

  describe('未设主密码（保持既有行为）', () => {
    it('内存态为 plain，读取回落到 localStorage 明文', () => {
      seedRemote('plain-key');
      expect(getRemoteApiKeyState()).toEqual({ state: 'plain' });
    });

    it('encryptRemoteSecret 原样返回明文（与 apiProfiles 透明加密语义一致）', async () => {
      expect(await store.encryptRemoteSecret('plain-key')).toBe('plain-key');
    });

    it('decryptRemoteSecret 对明文原样返回', async () => {
      expect(await store.decryptRemoteSecret('plain-key')).toBe('plain-key');
    });
  });

  describe('设置主密码：存量明文收敛为密文', () => {
    it('localStorage 中的 apiKey 变为 enc:v1: 密文', async () => {
      seedRemote('plain-key');
      await store.setMasterPassword(PW_OLD);

      const stored = storedApiKey();
      expect(stored).not.toBe('plain-key');
      expect(isEncrypted(stored)).toBe(true);
    });

    it('密文可用主密码解回原文', async () => {
      seedRemote('plain-key');
      await store.setMasterPassword(PW_OLD);

      expect(await decryptApiKey(storedApiKey(), PW_OLD)).toBe('plain-key');
    });

    it('内存态切为 unlocked 并持有明文（供同步的 defaultFactory 取用）', async () => {
      seedRemote('plain-key');
      await store.setMasterPassword(PW_OLD);

      expect(getRemoteApiKeyState()).toEqual({ state: 'unlocked', key: 'plain-key' });
    });

    it('重复设置不会二次加密（已加密则跳过）', async () => {
      seedRemote('plain-key');
      await store.setMasterPassword(PW_OLD);
      const once = storedApiKey();

      await store.setMasterPassword(PW_OLD);
      expect(storedApiKey()).toBe(once);
      expect(await decryptApiKey(storedApiKey(), PW_OLD)).toBe('plain-key');
    });

    it('未配置远程密钥时不报错', async () => {
      await expect(store.setMasterPassword(PW_OLD)).resolves.toBeUndefined();
    });
  });

  describe('锁定 / 解锁', () => {
    it('锁定后内存态为 locked（不再向 provider 下发密钥）', async () => {
      seedRemote('plain-key');
      await store.setMasterPassword(PW_OLD);

      store.lock();
      expect(getRemoteApiKeyState()).toEqual({ state: 'locked' });
    });

    it('解锁后重新持有解密后的明文', async () => {
      seedRemote('plain-key');
      await store.setMasterPassword(PW_OLD);
      store.lock();

      const ok = await store.unlock(PW_OLD);
      expect(ok).toBe(true);
      expect(getRemoteApiKeyState()).toEqual({ state: 'unlocked', key: 'plain-key' });
    });

    it('密码错误时解锁失败且内存态保持 locked', async () => {
      seedRemote('plain-key');
      await store.setMasterPassword(PW_OLD);
      store.lock();

      const ok = await store.unlock('wrong-pw');
      expect(ok).toBe(false);
      expect(getRemoteApiKeyState()).toEqual({ state: 'locked' });
    });
  });

  describe('修改主密码：远程密钥随主密码轮换', () => {
    // PBKDF2 600k 迭代较慢，且本用例涉及 verify + reencrypt + 两次 decrypt，
    // 并发执行时会超过 vitest 默认 5s 超时，故显式放宽
    it(
      '改密码后新密码可解、旧密码不可解',
      async () => {
        seedRemote('plain-key');
        await store.setMasterPassword(PW_OLD);

        const ok = await store.changeMasterPassword(PW_OLD, PW_NEW);
        expect(ok).toBe(true);

        expect(await decryptApiKey(storedApiKey(), PW_NEW)).toBe('plain-key');
        await expect(decryptApiKey(storedApiKey(), PW_OLD)).rejects.toThrow();
      },
      30_000
    );
  });

  describe('设置页辅助（保存加密 / 回填解密）', () => {
    it('已解锁时 encryptRemoteSecret 返回密文', async () => {
      seedRemote('x');
      await store.setMasterPassword(PW_OLD);

      const enc = await store.encryptRemoteSecret('new-key');
      expect(isEncrypted(enc)).toBe(true);
      expect(await decryptApiKey(enc, PW_OLD)).toBe('new-key');
    });

    it('已解锁时 decryptRemoteSecret 解回明文（表单可正常回填）', async () => {
      seedRemote('plain-key');
      await store.setMasterPassword(PW_OLD);

      expect(await store.decryptRemoteSecret(storedApiKey())).toBe('plain-key');
    });

    it('未解锁时不回填密文，返回空串', async () => {
      seedRemote('plain-key');
      await store.setMasterPassword(PW_OLD);
      const cipher = storedApiKey();
      store.lock();

      expect(await store.decryptRemoteSecret(cipher)).toBe('');
    });
  });

  describe('备份导出：明文远程密钥同样被拦截', () => {
    it('未设主密码（明文存盘）时，导出备份被拒绝并点名该密钥', async () => {
      seedRemote('plain-key');
      const { exportAll } = await import('@/services/backup-service');
      // 注意：exportAll 的第一个参数是 StorageAdapter，不是 store
      await expect(exportAll(adapter as never)).rejects.toThrow(/远程向量网关 API Key/);
    });

    it('已加密时该密钥不再阻断导出', async () => {
      seedRemote('plain-key');
      await store.setMasterPassword(PW_OLD);
      expect(isEncrypted(storedApiKey())).toBe(true);

      const { exportAll } = await import('@/services/backup-service');
      await expect(exportAll(adapter as never)).resolves.toBeDefined();
    });
  });
});
