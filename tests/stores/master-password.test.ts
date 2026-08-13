import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import 'fake-indexeddb/auto';
import { useSettingsStore } from '../../src/stores/settings';
import { IndexedDBAdapter } from '@storage/indexeddb-adapter';
import { isEncrypted } from '@core/api-key-crypto';
import type { AppSettings, ApiProfile } from '@/types';

// ── 测试夹具 ──

async function resetDatabase(name: string): Promise<void> {
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

function makeProfile(overrides: Partial<ApiProfile> = {}): ApiProfile {
  return {
    id: 'profile-1',
    name: '测试配置',
    provider: 'openai',
    baseUrl: 'https://api.openai.com',
    apiKey: 'sk-plaintext-key',
    model: 'gpt-4o',
    ...overrides,
  };
}

/** Mock 存储适配器，可拦截 saveSettings 验证加密效果 */
class MockStorageAdapter {
  public saved: AppSettings | null = null;
  public loadData: Partial<AppSettings> | null = null;

  async loadSettings(): Promise<Partial<AppSettings>> {
    return this.loadData ?? {};
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    this.saved = JSON.parse(JSON.stringify(settings)); // 深拷贝
  }
}

// ── 测试用例：AC20 主密码会话管理 ──

describe('useSettingsStore — AC20 主密码加密', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    // 清理 sessionStorage
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  // ── 初始状态 ──

  describe('初始状态', () => {
    it('未设置主密码时 hasMasterPassword 应为 false', () => {
      const store = useSettingsStore();
      expect(store.hasMasterPassword).toBe(false);
    });

    it('未设置主密码时 isUnlocked 应为 false', () => {
      const store = useSettingsStore();
      expect(store.isUnlocked).toBe(false);
    });
  });

  // ── 首次设置主密码 ──

  describe('setMasterPassword', () => {
    it('设置主密码后 hasMasterPassword 应为 true', async () => {
      const mock = new MockStorageAdapter();
      const store = useSettingsStore();
      store.setStorageAdapter(mock);
      await store.setMasterPassword('my-password');
      expect(store.hasMasterPassword).toBe(true);
    });

    it('设置主密码后 isUnlocked 应为 true', async () => {
      const mock = new MockStorageAdapter();
      const store = useSettingsStore();
      store.setStorageAdapter(mock);
      await store.setMasterPassword('my-password');
      expect(store.isUnlocked).toBe(true);
    });

    it('设置主密码后应生成 verifier 并持久化', async () => {
      const mock = new MockStorageAdapter();
      const store = useSettingsStore();
      store.setStorageAdapter(mock);
      await store.setMasterPassword('my-password');
      expect(mock.saved?.masterPasswordVerifier).toBeTruthy();
      expect(isEncrypted(mock.saved!.masterPasswordVerifier!)).toBe(true);
    });

    it('设置主密码后不写入 sessionStorage（仅运行时内存）', async () => {
      const mock = new MockStorageAdapter();
      const store = useSettingsStore();
      store.setStorageAdapter(mock);
      await store.setMasterPassword('my-password');
      expect(sessionStorage.getItem('ai-roleplay:master-password')).toBeNull();
      expect(store.isUnlocked).toBe(true);
    });

    it('空主密码应抛错', async () => {
      const mock = new MockStorageAdapter();
      const store = useSettingsStore();
      store.setStorageAdapter(mock);
      await expect(store.setMasterPassword('')).rejects.toThrow('请输入主密码');
    });

    it('设置主密码后已存在的明文 apiKey 应被加密保存', async () => {
      const mock = new MockStorageAdapter();
      const store = useSettingsStore();
      store.setStorageAdapter(mock);
      // 先添加一个明文 apiKey 的 profile
      store.addApiProfile(makeProfile({ apiKey: 'sk-plaintext' }));
      // 设置主密码触发 persistSettings
      await store.setMasterPassword('my-password');
      // 验证保存到存储的是密文
      expect(mock.saved?.apiProfiles[0].apiKey).not.toBe('sk-plaintext');
      expect(isEncrypted(mock.saved!.apiProfiles[0].apiKey)).toBe(true);
      // 内存中保留明文
      expect(store.apiProfiles[0].apiKey).toBe('sk-plaintext');
    });

    it('设置主密码后已存在的明文 translationConfig.apiKey 应被加密保存', async () => {
      const mock = new MockStorageAdapter();
      const store = useSettingsStore();
      store.setStorageAdapter(mock);
      store.setTranslationConfig({ apiKey: 'tr-key-plaintext' });
      await store.setMasterPassword('my-password');
      expect(mock.saved?.translationConfig.apiKey).not.toBe('tr-key-plaintext');
      expect(isEncrypted(mock.saved!.translationConfig.apiKey)).toBe(true);
      // 内存中保留明文
      expect(store.translationConfig.apiKey).toBe('tr-key-plaintext');
    });
  });

  // ── 解锁 ──

  describe('unlock', () => {
    it('未设置主密码时 unlock 应返回 false', async () => {
      const store = useSettingsStore();
      const ok = await store.unlock('any');
      expect(ok).toBe(false);
    });

    it('正确主密码应解锁成功', async () => {
      const mock = new MockStorageAdapter();
      const store = useSettingsStore();
      store.setStorageAdapter(mock);
      await store.setMasterPassword('correct-pw');
      // 锁定
      store.lock();
      expect(store.isUnlocked).toBe(false);
      // 解锁
      const ok = await store.unlock('correct-pw');
      expect(ok).toBe(true);
      expect(store.isUnlocked).toBe(true);
    });

    it('错误主密码应解锁失败', async () => {
      const mock = new MockStorageAdapter();
      const store = useSettingsStore();
      store.setStorageAdapter(mock);
      await store.setMasterPassword('correct-pw');
      store.lock();
      const ok = await store.unlock('wrong-pw');
      expect(ok).toBe(false);
      expect(store.isUnlocked).toBe(false);
    });

    it('解锁后应解密内存中的 apiKey', async () => {
      const mock = new MockStorageAdapter();
      const store = useSettingsStore();
      store.setStorageAdapter(mock);
      // 添加明文 apiKey 并设置主密码（保存为密文）
      store.addApiProfile(makeProfile({ apiKey: 'sk-secret' }));
      await store.setMasterPassword('pw');
      // 模拟应用重启：新 store 实例 + 加载加密数据
      setActivePinia(createPinia());
      const store2 = useSettingsStore();
      const mock2 = new MockStorageAdapter();
      mock2.loadData = mock.saved;
      store2.setStorageAdapter(mock2);
      await store2.loadFromStorage();
      // 加载后 apiKey 应为密文
      expect(isEncrypted(store2.apiProfiles[0].apiKey)).toBe(true);
      // 解锁
      const ok = await store2.unlock('pw');
      expect(ok).toBe(true);
      // 解锁后应为明文
      expect(store2.apiProfiles[0].apiKey).toBe('sk-secret');
    });

    it('解锁后主密码仅存内存，不写入 sessionStorage', async () => {
      const mock = new MockStorageAdapter();
      const store = useSettingsStore();
      store.setStorageAdapter(mock);
      await store.setMasterPassword('pw');
      store.lock();
      sessionStorage.clear();
      await store.unlock('pw');
      expect(sessionStorage.getItem('ai-roleplay:master-password')).toBeNull();
      expect(store.isUnlocked).toBe(true);
    });
  });

  // ── 锁定 ──

  describe('lock', () => {
    it('lock 应清除 isUnlocked 状态', async () => {
      const mock = new MockStorageAdapter();
      const store = useSettingsStore();
      store.setStorageAdapter(mock);
      await store.setMasterPassword('pw');
      expect(store.isUnlocked).toBe(true);
      store.lock();
      expect(store.isUnlocked).toBe(false);
    });

    it('lock 应清除内存中的主密码（刷新后需重新解锁）', async () => {
      const mock = new MockStorageAdapter();
      const store = useSettingsStore();
      store.setStorageAdapter(mock);
      await store.setMasterPassword('pw');
      store.lock();
      expect(store.isUnlocked).toBe(false);
      // 重新 unlock 需要再次验证密码
      const ok = await store.unlock('wrong');
      expect(ok).toBe(false);
    });

    it('lock 后 hasMasterPassword 仍为 true（仅清除会话解锁状态）', async () => {
      const mock = new MockStorageAdapter();
      const store = useSettingsStore();
      store.setStorageAdapter(mock);
      await store.setMasterPassword('pw');
      store.lock();
      expect(store.hasMasterPassword).toBe(true);
    });
  });

  // ── 修改主密码 ──

  describe('changeMasterPassword', () => {
    it('正确旧密码应修改成功', async () => {
      const mock = new MockStorageAdapter();
      const store = useSettingsStore();
      store.setStorageAdapter(mock);
      await store.setMasterPassword('old-pw');
      const ok = await store.changeMasterPassword('old-pw', 'new-pw');
      expect(ok).toBe(true);
      // 新密码可解锁
      store.lock();
      const unlockOk = await store.unlock('new-pw');
      expect(unlockOk).toBe(true);
    });

    it('错误旧密码应修改失败', async () => {
      const mock = new MockStorageAdapter();
      const store = useSettingsStore();
      store.setStorageAdapter(mock);
      await store.setMasterPassword('old-pw');
      const ok = await store.changeMasterPassword('wrong', 'new-pw');
      expect(ok).toBe(false);
    });

    it('修改后 verifier 应更新', async () => {
      const mock = new MockStorageAdapter();
      const store = useSettingsStore();
      store.setStorageAdapter(mock);
      await store.setMasterPassword('old-pw');
      const oldVerifier = mock.saved?.masterPasswordVerifier;
      await store.changeMasterPassword('old-pw', 'new-pw');
      expect(mock.saved?.masterPasswordVerifier).not.toBe(oldVerifier);
    });

    it('修改后内存持有新密码，不写入 sessionStorage', async () => {
      const mock = new MockStorageAdapter();
      const store = useSettingsStore();
      store.setStorageAdapter(mock);
      await store.setMasterPassword('old-pw');
      await store.changeMasterPassword('old-pw', 'new-pw');
      expect(sessionStorage.getItem('ai-roleplay:master-password')).toBeNull();
      expect(store.isUnlocked).toBe(true);
    });

    it('修改后内存中明文 apiKey 应保持明文（不丢失）', async () => {
      const mock = new MockStorageAdapter();
      const store = useSettingsStore();
      store.setStorageAdapter(mock);
      store.addApiProfile(makeProfile({ apiKey: 'sk-secret' }));
      await store.setMasterPassword('old-pw');
      // 修改密码
      await store.changeMasterPassword('old-pw', 'new-pw');
      // 内存中仍是明文
      expect(store.apiProfiles[0].apiKey).toBe('sk-secret');
      // 持久化的应为密文（新密码加密）
      expect(isEncrypted(mock.saved!.apiProfiles[0].apiKey)).toBe(true);
      expect(mock.saved!.apiProfiles[0].apiKey).not.toBe('sk-secret');
    });

    it('修改密码后旧密码无法解密存储数据', async () => {
      const mock = new MockStorageAdapter();
      const store = useSettingsStore();
      store.setStorageAdapter(mock);
      store.addApiProfile(makeProfile({ apiKey: 'sk-secret' }));
      await store.setMasterPassword('old-pw');
      await store.changeMasterPassword('old-pw', 'new-pw');
      // 模拟重启：用旧密码尝试解锁
      setActivePinia(createPinia());
      const store2 = useSettingsStore();
      const mock2 = new MockStorageAdapter();
      mock2.loadData = mock.saved;
      store2.setStorageAdapter(mock2);
      await store2.loadFromStorage();
      const ok = await store2.unlock('old-pw');
      expect(ok).toBe(false);
    }, 15000);
  });

  // ── restoreSession ──

  describe('restoreSession', () => {
    it('sessionStorage 无主密码时应返回 false', async () => {
      const mock = new MockStorageAdapter();
      const store = useSettingsStore();
      store.setStorageAdapter(mock);
      await store.setMasterPassword('pw');
      store.lock();
      sessionStorage.clear();
      const ok = await store.restoreSession();
      expect(ok).toBe(false);
    });

    it('sessionStorage 有密码也不能自动解锁（主密码仅内存）', async () => {
      const mock = new MockStorageAdapter();
      const store = useSettingsStore();
      store.setStorageAdapter(mock);
      store.addApiProfile(makeProfile({ apiKey: 'sk-secret' }));
      await store.setMasterPassword('pw');
      // 模拟应用重启：新 store 实例 + 残留的 sessionStorage
      setActivePinia(createPinia());
      const store2 = useSettingsStore();
      const mock2 = new MockStorageAdapter();
      mock2.loadData = mock.saved;
      store2.setStorageAdapter(mock2);
      await store2.loadFromStorage();
      sessionStorage.setItem('ai-roleplay:master-password', 'pw');
      const ok = await store2.restoreSession();
      expect(ok).toBe(false);
      expect(store2.isUnlocked).toBe(false);
      // apiKey 保持密文，手动 unlock 后解密
      expect(isEncrypted(store2.apiProfiles[0].apiKey ?? '')).toBe(true);
      const ok2 = await store2.unlock('pw');
      expect(ok2).toBe(true);
      expect(store2.apiProfiles[0].apiKey).toBe('sk-secret');
    });

    it('未设置主密码时 restoreSession 应返回 false', async () => {
      const mock = new MockStorageAdapter();
      const store = useSettingsStore();
      store.setStorageAdapter(mock);
      sessionStorage.setItem('ai-roleplay:master-password', 'pw');
      const ok = await store.restoreSession();
      expect(ok).toBe(false);
    });
  });

  // ── 透明加解密 ──

  describe('透明加解密', () => {
    it('未设置主密码时 apiKey 应明文保存（向后兼容）', async () => {
      const mock = new MockStorageAdapter();
      const store = useSettingsStore();
      store.setStorageAdapter(mock);
      store.addApiProfile(makeProfile({ apiKey: 'sk-plaintext' }));
      await new Promise((r) => setTimeout(r, 20));
      expect(mock.saved?.apiProfiles[0].apiKey).toBe('sk-plaintext');
    });

    it('设置主密码后 apiKey 应密文保存', async () => {
      const mock = new MockStorageAdapter();
      const store = useSettingsStore();
      store.setStorageAdapter(mock);
      store.addApiProfile(makeProfile({ apiKey: 'sk-plaintext' }));
      await store.setMasterPassword('pw');
      expect(isEncrypted(mock.saved!.apiProfiles[0].apiKey)).toBe(true);
    });

    it('解锁状态下修改 apiKey 应保存为新密文', async () => {
      const mock = new MockStorageAdapter();
      const store = useSettingsStore();
      store.setStorageAdapter(mock);
      store.addApiProfile(makeProfile({ apiKey: 'sk-old' }));
      await store.setMasterPassword('pw');
      // 修改 apiKey
      store.updateApiProfile('profile-1', { apiKey: 'sk-new' });
      await new Promise((r) => setTimeout(r, 20));
      // 内存中是明文
      expect(store.apiProfiles[0].apiKey).toBe('sk-new');
      // 存储中是新密文
      expect(isEncrypted(mock.saved!.apiProfiles[0].apiKey)).toBe(true);
      expect(mock.saved!.apiProfiles[0].apiKey).not.toBe('sk-old');
      expect(mock.saved!.apiProfiles[0].apiKey).not.toBe('sk-new');
    });

    it('内存中已是密文的 apiKey 在持久化时不被重复加密', async () => {
      const mock = new MockStorageAdapter();
      const store = useSettingsStore();
      store.setStorageAdapter(mock);
      // 设置主密码
      await store.setMasterPassword('pw');
      // 模拟"已加密 apiKey 加载到内存"场景（如解密失败保留密文）
      // 直接构造一个密文格式的字符串
      const fakeEncrypted = 'enc:v1:eyJ2IjoxLCJzYWx0IjoiQUFBQUFBQUFBQUFBQUFBQSIsIml2IjoiQkJCQkJCQkJCQkJCQkJCQiIsImN0IjoiQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQyJ9';
      store.apiProfiles.push(makeProfile({ id: 'p-enc', apiKey: fakeEncrypted }));
      // 直接 await persistSettings
      await store.persistSettings();
      // 验证保存的 apiKey 与输入的密文相同（未被再次加密）
      const saved = mock.saved!.apiProfiles.find((p) => p.id === 'p-enc');
      expect(saved?.apiKey).toBe(fakeEncrypted);
    });

    it('每次加密生成不同密文（随机 salt/iv）', async () => {
      const mock = new MockStorageAdapter();
      const store = useSettingsStore();
      store.setStorageAdapter(mock);
      store.addApiProfile(makeProfile({ apiKey: 'sk-plaintext' }));
      await store.setMasterPassword('pw');
      // 第一次加密结果
      const firstEnc = mock.saved!.apiProfiles[0].apiKey;
      // 直接 await persistSettings 触发第二次加密
      await store.persistSettings();
      const secondEnc = mock.saved!.apiProfiles[0].apiKey;
      expect(isEncrypted(secondEnc)).toBe(true);
      // 由于随机 salt/iv，密文应不同
      expect(secondEnc).not.toBe(firstEnc);
    });

    it('解密失败时保留密文并记录 lastError', async () => {
      const mock = new MockStorageAdapter();
      const store = useSettingsStore();
      store.setStorageAdapter(mock);
      // 设置主密码
      await store.setMasterPassword('correct-pw');
      // 构造不一致状态：apiKey 用另一个密码加密，但 verifier 用 correct-pw
      // 模拟"verifier 可解密但 apiKey 数据损坏/不一致"
      const corruptedApiKey = await (await import('@core/api-key-crypto'))
        .encryptApiKey('sk-secret', 'different-password');
      store.apiProfiles.push(
        makeProfile({ id: 'p-corrupt', apiKey: corruptedApiKey })
      );
      await store.persistSettings();

      // 模拟重启
      setActivePinia(createPinia());
      const store2 = useSettingsStore();
      const mock2 = new MockStorageAdapter();
      mock2.loadData = mock.saved;
      store2.setStorageAdapter(mock2);
      await store2.loadFromStorage();

      // 用正确密码解锁（verifier 验证通过）
      const ok = await store2.unlock('correct-pw');
      expect(ok).toBe(true);
      // 该 apiKey 应保留密文（解密失败）
      const corrupted = store2.apiProfiles.find((p) => p.id === 'p-corrupt');
      expect(isEncrypted(corrupted?.apiKey ?? '')).toBe(true);
      // 应记录错误
      expect(store2.lastError).toContain('解密失败');
    });
  });

  // ── 端到端：完整生命周期 ──

  describe(
    '端到端生命周期',
    () => {
    it('首次启动 → 设置主密码 → 重启 → 解锁 完整流程', async () => {
      await resetDatabase('test-master-pw-e2e');
      const adapter = new IndexedDBAdapter('test-master-pw-e2e');
      await adapter.init();

      // 1. 首次启动：添加 profile + 设置主密码
      const store1 = useSettingsStore();
      store1.setStorageAdapter(adapter);
      store1.addApiProfile(makeProfile({ apiKey: 'sk-secret-1' }));
      store1.addApiProfile(
        makeProfile({ id: 'profile-2', apiKey: 'sk-secret-2', name: 'P2' })
      );
      await store1.setMasterPassword('master-pw');
      await new Promise((r) => setTimeout(r, 30));

      // 验证：内存中明文，存储中密文
      expect(store1.apiProfiles[0].apiKey).toBe('sk-secret-1');
      const persisted = await adapter.loadSettings();
      expect(isEncrypted(persisted.apiProfiles![0].apiKey)).toBe(true);
      expect(isEncrypted(persisted.apiProfiles![1].apiKey)).toBe(true);

      // 2. 模拟重启（无 sessionStorage）
      setActivePinia(createPinia());
      sessionStorage.clear();
      const store2 = useSettingsStore();
      store2.setStorageAdapter(adapter);
      await store2.loadFromStorage();

      // 应处于锁定状态：apiKey 仍为密文
      expect(store2.hasMasterPassword).toBe(true);
      expect(store2.isUnlocked).toBe(false);
      expect(isEncrypted(store2.apiProfiles[0].apiKey)).toBe(true);

      // 3. 用错误密码解锁失败
      const wrongOk = await store2.unlock('wrong-pw');
      expect(wrongOk).toBe(false);

      // 4. 用正确密码解锁成功
      const ok = await store2.unlock('master-pw');
      expect(ok).toBe(true);
      expect(store2.isUnlocked).toBe(true);
      expect(store2.apiProfiles[0].apiKey).toBe('sk-secret-1');
      expect(store2.apiProfiles[1].apiKey).toBe('sk-secret-2');

      await adapter.close();
    }, 15000);

    // PBKDF2 600k 迭代下该链路（设密+改密+两次解锁）耗时较长，放宽超时至 20s
    it('修改主密码后旧数据无法用旧密码解锁', async () => {
      await resetDatabase('test-master-pw-change');
      const adapter = new IndexedDBAdapter('test-master-pw-change');
      await adapter.init();

      // 设置主密码 + apiKey
      const store = useSettingsStore();
      store.setStorageAdapter(adapter);
      store.addApiProfile(makeProfile({ apiKey: 'sk-secret' }));
      await store.setMasterPassword('old-pw');
      await new Promise((r) => setTimeout(r, 30));

      // 修改密码
      const ok = await store.changeMasterPassword('old-pw', 'new-pw');
      expect(ok).toBe(true);
      await new Promise((r) => setTimeout(r, 30));

      // 重启：旧密码无法解锁
      setActivePinia(createPinia());
      sessionStorage.clear();
      const store2 = useSettingsStore();
      store2.setStorageAdapter(adapter);
      await store2.loadFromStorage();

      const oldOk = await store2.unlock('old-pw');
      expect(oldOk).toBe(false);

      // 新密码可解锁
      const newOk = await store2.unlock('new-pw');
      expect(newOk).toBe(true);
      expect(store2.apiProfiles[0].apiKey).toBe('sk-secret');

      await adapter.close();
    }, 20000);

    it('刷新页面后需重新输入主密码（无会话记忆）', async () => {
      await resetDatabase('test-master-pw-session');
      const adapter = new IndexedDBAdapter('test-master-pw-session');
      await adapter.init();

      // 设置主密码
      const store = useSettingsStore();
      store.setStorageAdapter(adapter);
      store.addApiProfile(makeProfile({ apiKey: 'sk-secret' }));
      await store.setMasterPassword('session-pw');
      await new Promise((r) => setTimeout(r, 30));

      // 模拟刷新页面
      setActivePinia(createPinia());
      const store2 = useSettingsStore();
      store2.setStorageAdapter(adapter);
      await store2.loadFromStorage();

      // restoreSession 恒 false，需手动解锁
      const ok = await store2.restoreSession();
      expect(ok).toBe(false);
      expect(store2.isUnlocked).toBe(false);
      const ok2 = await store2.unlock('session-pw');
      expect(ok2).toBe(true);
      expect(store2.apiProfiles[0].apiKey).toBe('sk-secret');

      await adapter.close();
    });

    it('多 API Profile 独立加密', async () => {
      await resetDatabase('test-master-pw-multi');
      const adapter = new IndexedDBAdapter('test-master-pw-multi');
      await adapter.init();

      const store = useSettingsStore();
      store.setStorageAdapter(adapter);
      store.addApiProfile(makeProfile({ id: 'p1', apiKey: 'sk-key-1' }));
      store.addApiProfile(
        makeProfile({ id: 'p2', apiKey: 'sk-key-2', name: 'P2' })
      );
      store.addApiProfile(
        makeProfile({ id: 'p3', apiKey: 'sk-key-3', name: 'P3' })
      );
      await store.setMasterPassword('pw');
      await new Promise((r) => setTimeout(r, 30));

      // 三个 apiKey 在存储中应都加密且互不相同
      const persisted = await adapter.loadSettings();
      const encryptedKeys = persisted.apiProfiles!.map((p) => p.apiKey);
      expect(encryptedKeys.every((k) => isEncrypted(k))).toBe(true);
      expect(new Set(encryptedKeys).size).toBe(3);

      // 解锁后应都还原为明文
      setActivePinia(createPinia());
      sessionStorage.clear();
      const store2 = useSettingsStore();
      store2.setStorageAdapter(adapter);
      await store2.loadFromStorage();
      await store2.unlock('pw');
      expect(store2.apiProfiles[0].apiKey).toBe('sk-key-1');
      expect(store2.apiProfiles[1].apiKey).toBe('sk-key-2');
      expect(store2.apiProfiles[2].apiKey).toBe('sk-key-3');

      await adapter.close();
    }, 15000);
  });

  // ── 向后兼容 ──

  describe('向后兼容', () => {
    it('已存在的明文 apiKey 数据可正常加载（未设置主密码）', async () => {
      const mock = new MockStorageAdapter();
      mock.loadData = {
        apiProfiles: [makeProfile({ apiKey: 'sk-legacy-plaintext' })],
      };
      const store = useSettingsStore();
      store.setStorageAdapter(mock);
      await store.loadFromStorage();
      expect(store.apiProfiles[0].apiKey).toBe('sk-legacy-plaintext');
      expect(store.hasMasterPassword).toBe(false);
    });

    it('存储中无 masterPasswordVerifier 字段时 hasMasterPassword 为 false', async () => {
      const mock = new MockStorageAdapter();
      mock.loadData = {
        apiProfiles: [makeProfile()],
        // 不设置 masterPasswordVerifier
      };
      const store = useSettingsStore();
      store.setStorageAdapter(mock);
      await store.loadFromStorage();
      expect(store.hasMasterPassword).toBe(false);
    });

    it('主密码为 null 时 hasMasterPassword 为 false', async () => {
      const mock = new MockStorageAdapter();
      mock.loadData = {
        apiProfiles: [makeProfile()],
        masterPasswordVerifier: null,
      };
      const store = useSettingsStore();
      store.setStorageAdapter(mock);
      await store.loadFromStorage();
      expect(store.hasMasterPassword).toBe(false);
    });
  });
});
