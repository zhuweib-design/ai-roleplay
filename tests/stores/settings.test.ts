import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import 'fake-indexeddb/auto';
import { useSettingsStore } from '../../src/stores/settings';
import { IndexedDBAdapter } from '@storage/indexeddb-adapter';
import type { AppSettings, ApiProfile, ThemeName } from '@/types';

// ── 测试夹具 ──

/** 删除数据库以确保测试间隔离 */
async function resetDatabase(name: string): Promise<void> {
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

/** 构造一个 ApiProfile */
function makeProfile(overrides: Partial<ApiProfile> = {}): ApiProfile {
  return {
    id: 'profile-1',
    name: '测试配置',
    provider: 'openai',
    baseUrl: 'https://api.openai.com',
    apiKey: 'sk-test',
    model: 'gpt-4o',
    ...overrides,
  };
}

/** Mock 存储适配器，用于精确控制 loadSettings/saveSettings 行为 */
class MockStorageAdapter {
  public saved: AppSettings | null = null;
  public loadData: Partial<AppSettings> | null = null;
  public loadShouldThrow = false;
  public saveShouldThrow = false;
  public loadCallCount = 0;
  public saveCallCount = 0;

  async loadSettings(): Promise<Partial<AppSettings>> {
    this.loadCallCount++;
    if (this.loadShouldThrow) throw new Error('mock load error');
    return this.loadData ?? {};
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    this.saveCallCount++;
    if (this.saveShouldThrow) throw new Error('mock save error');
    this.saved = { ...settings };
  }
}

// ── 测试用例 ──

describe('useSettingsStore — F5 单元测试', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    // 重置 document 属性（jsdom 中 <html data-theme> 与 font-size 可能跨用例残留）
    if (typeof document !== 'undefined') {
      document.documentElement.removeAttribute('data-theme');
      document.documentElement.style.fontSize = '';
      document.documentElement.classList.remove('dark');
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── 初始状态 ──

  describe('初始状态', () => {
    it('默认主题为 dark', () => {
      const store = useSettingsStore();
      expect(store.theme).toBe('dark');
    });

    it('默认字号为 14', () => {
      const store = useSettingsStore();
      expect(store.fontSize).toBe(14);
    });

    it('默认 apiProfiles 为空数组', () => {
      const store = useSettingsStore();
      expect(store.apiProfiles).toEqual([]);
    });

    it('默认 activeApiProfileId 为 null', () => {
      const store = useSettingsStore();
      expect(store.activeApiProfileId).toBeNull();
    });

    it('默认 lastError 为 null', () => {
      const store = useSettingsStore();
      expect(store.lastError).toBeNull();
    });
  });

  // ── 主题切换 ──

  describe('主题切换', () => {
    it('setTheme 应更新 theme 状态', () => {
      const store = useSettingsStore();
      store.setTheme('light');
      expect(store.theme).toBe('light');
    });

    it('setTheme 应将 data-theme 属性应用到 <html>', () => {
      const store = useSettingsStore();
      store.setTheme('midnight');
      expect(document.documentElement.getAttribute('data-theme')).toBe('midnight');
    });

    it('setTheme("dark") 应为 <html> 添加 dark class（兼容遗留样式）', () => {
      const store = useSettingsStore();
      store.setTheme('light');
      expect(document.documentElement.classList.contains('dark')).toBe(false);
      store.setTheme('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('支持切换到全部主题（含暗夜剧场）', () => {
      const store = useSettingsStore();
      const themes: ThemeName[] = ['dark', 'light', 'midnight', 'oled', 'theatre'];
      for (const t of themes) {
        store.setTheme(t);
        expect(store.theme).toBe(t);
        expect(document.documentElement.getAttribute('data-theme')).toBe(t);
      }
    });
  });

  // ── 字号设置 ──

  describe('字号设置', () => {
    it('setFontSize 应更新 fontSize 状态', () => {
      const store = useSettingsStore();
      store.setFontSize(16);
      expect(store.fontSize).toBe(16);
    });

    it('setFontSize 应将 font-size 样式应用到 <html>', () => {
      const store = useSettingsStore();
      store.setFontSize(18);
      expect(document.documentElement.style.fontSize).toBe('18px');
    });

    it('支持设置全部 4 个字号档位', () => {
      const store = useSettingsStore();
      const sizes = [12, 14, 16, 18];
      for (const size of sizes) {
        store.setFontSize(size);
        expect(store.fontSize).toBe(size);
        expect(document.documentElement.style.fontSize).toBe(`${size}px`);
      }
    });
  });

  // ── API Profile CRUD ──

  describe('API Profile CRUD', () => {
    it('addApiProfile 应添加 profile 到列表', () => {
      const store = useSettingsStore();
      const profile = makeProfile();
      store.addApiProfile(profile);
      expect(store.apiProfiles).toHaveLength(1);
      expect(store.apiProfiles[0]).toEqual(profile);
    });

    it('addApiProfile 在无激活 profile 时自动激活新添加的', () => {
      const store = useSettingsStore();
      const profile = makeProfile({ id: 'p1' });
      store.addApiProfile(profile);
      expect(store.activeApiProfileId).toBe('p1');
    });

    it('addApiProfile 在已有激活 profile 时不改变激活状态', () => {
      const store = useSettingsStore();
      store.addApiProfile(makeProfile({ id: 'p1' }));
      store.addApiProfile(makeProfile({ id: 'p2', name: '第二配置' }));
      expect(store.activeApiProfileId).toBe('p1');
    });

    it('updateApiProfile 应 patch 合并字段', () => {
      const store = useSettingsStore();
      const profile = makeProfile({ id: 'p1', name: '原名', model: 'gpt-4' });
      store.addApiProfile(profile);
      store.updateApiProfile('p1', { name: '新名', apiKey: 'sk-new' });
      expect(store.apiProfiles[0]!.name).toBe('新名');
      expect(store.apiProfiles[0]!.apiKey).toBe('sk-new');
      // 未更新的字段保留
      expect(store.apiProfiles[0]!.model).toBe('gpt-4');
    });

    it('updateApiProfile 不存在的 id 应静默忽略', () => {
      const store = useSettingsStore();
      store.addApiProfile(makeProfile({ id: 'p1' }));
      store.updateApiProfile('nonexistent', { name: 'X' });
      expect(store.apiProfiles).toHaveLength(1);
      expect(store.apiProfiles[0]!.name).toBe('测试配置');
    });

    it('deleteApiProfile 应从列表中移除', () => {
      const store = useSettingsStore();
      store.addApiProfile(makeProfile({ id: 'p1' }));
      store.addApiProfile(makeProfile({ id: 'p2', name: '第二配置' }));
      store.deleteApiProfile('p1');
      expect(store.apiProfiles).toHaveLength(1);
      expect(store.apiProfiles[0]!.id).toBe('p2');
    });

    it('deleteApiProfile 删除激活 profile 时自动切换到第一个', () => {
      const store = useSettingsStore();
      store.addApiProfile(makeProfile({ id: 'p1' }));
      store.addApiProfile(makeProfile({ id: 'p2', name: '第二配置' }));
      // p1 自动激活，切换到 p2
      store.setActiveApiProfile('p2');
      expect(store.activeApiProfileId).toBe('p2');
      store.deleteApiProfile('p2');
      expect(store.activeApiProfileId).toBe('p1');
    });

    it('deleteApiProfile 删除最后一个 profile 时 activeApiProfileId 置 null', () => {
      const store = useSettingsStore();
      store.addApiProfile(makeProfile({ id: 'p1' }));
      store.deleteApiProfile('p1');
      expect(store.apiProfiles).toEqual([]);
      expect(store.activeApiProfileId).toBeNull();
    });

    it('deleteApiProfile 不存在的 id 应静默忽略', () => {
      const store = useSettingsStore();
      store.addApiProfile(makeProfile({ id: 'p1' }));
      store.deleteApiProfile('nonexistent');
      expect(store.apiProfiles).toHaveLength(1);
    });

    it('setActiveApiProfile 应更新激活状态', () => {
      const store = useSettingsStore();
      store.addApiProfile(makeProfile({ id: 'p1' }));
      store.addApiProfile(makeProfile({ id: 'p2', name: '第二配置' }));
      store.setActiveApiProfile('p2');
      expect(store.activeApiProfileId).toBe('p2');
    });

    it('setActiveApiProfile(null) 应清空激活', () => {
      const store = useSettingsStore();
      store.addApiProfile(makeProfile({ id: 'p1' }));
      store.setActiveApiProfile(null);
      expect(store.activeApiProfileId).toBeNull();
    });
  });

  // ── 工厂方法 ──

  describe('createProfileTemplate', () => {
    it('应返回带 UUID 的 ApiProfile', () => {
      const store = useSettingsStore();
      const tpl = store.createProfileTemplate();
      expect(tpl.id).toBeTruthy();
      expect(typeof tpl.id).toBe('string');
      expect(tpl.id.length).toBeGreaterThan(0);
    });

    it('默认 provider 为 openai', () => {
      const store = useSettingsStore();
      const tpl = store.createProfileTemplate();
      expect(tpl.provider).toBe('openai');
    });

    it('默认 baseUrl 为 https://api.openai.com', () => {
      const store = useSettingsStore();
      const tpl = store.createProfileTemplate();
      expect(tpl.baseUrl).toBe('https://api.openai.com');
    });

    it('默认 model 为 gpt-4o', () => {
      const store = useSettingsStore();
      const tpl = store.createProfileTemplate();
      expect(tpl.model).toBe('gpt-4o');
    });

    it('默认 apiKey 为空字符串', () => {
      const store = useSettingsStore();
      const tpl = store.createProfileTemplate();
      expect(tpl.apiKey).toBe('');
    });

    it('两次调用应返回不同 id', () => {
      const store = useSettingsStore();
      const a = store.createProfileTemplate();
      const b = store.createProfileTemplate();
      expect(a.id).not.toBe(b.id);
    });

    it('createProfileTemplate 仅生成对象，不自动加入列表', () => {
      const store = useSettingsStore();
      store.createProfileTemplate();
      expect(store.apiProfiles).toHaveLength(0);
    });
  });

  // ── 持久化（StorageAdapter 集成） ──

  describe('持久化', () => {
    it('setStorageAdapter 接受 IndexedDBAdapter 实例不报错', async () => {
      await resetDatabase('test-settings-di');
      const adapter = new IndexedDBAdapter('test-settings-di');
      await adapter.init();
      const store = useSettingsStore();
      expect(() => store.setStorageAdapter(adapter)).not.toThrow();
      await adapter.close();
    });

    it('setStorageAdapter(null) 应清空适配器', () => {
      const store = useSettingsStore();
      store.setStorageAdapter(null);
      // 后续 persistSettings 不应抛错（无适配器时静默忽略）
      expect(() => store.setTheme('light')).not.toThrow();
    });

    it('无 storageAdapter 时 setTheme 不抛错', () => {
      const store = useSettingsStore();
      expect(() => store.setTheme('midnight')).not.toThrow();
      expect(store.theme).toBe('midnight');
    });

    it('setTheme 后应自动调用 saveSettings', async () => {
      const mock = new MockStorageAdapter();
      const store = useSettingsStore();
      store.setStorageAdapter(mock);
      store.setTheme('light');
      await new Promise((r) => setTimeout(r, 10));
      expect(mock.saveCallCount).toBeGreaterThanOrEqual(1);
      expect(mock.saved?.theme).toBe('light');
    });

    it('setFontSize 后应自动调用 saveSettings', async () => {
      const mock = new MockStorageAdapter();
      const store = useSettingsStore();
      store.setStorageAdapter(mock);
      store.setFontSize(18);
      await new Promise((r) => setTimeout(r, 10));
      expect(mock.saved?.fontSize).toBe(18);
    });

    it('addApiProfile 后应自动调用 saveSettings', async () => {
      const mock = new MockStorageAdapter();
      const store = useSettingsStore();
      store.setStorageAdapter(mock);
      store.addApiProfile(makeProfile({ id: 'p1' }));
      await new Promise((r) => setTimeout(r, 10));
      expect(mock.saved?.apiProfiles).toHaveLength(1);
      expect(mock.saved?.activeApiProfileId).toBe('p1');
    });

    it('updateApiProfile 后应自动调用 saveSettings', async () => {
      const mock = new MockStorageAdapter();
      const store = useSettingsStore();
      store.setStorageAdapter(mock);
      store.addApiProfile(makeProfile({ id: 'p1', name: '原名' }));
      store.updateApiProfile('p1', { name: '新名' });
      await new Promise((r) => setTimeout(r, 10));
      expect(mock.saved?.apiProfiles[0]!.name).toBe('新名');
    });

    it('deleteApiProfile 后应自动调用 saveSettings', async () => {
      const mock = new MockStorageAdapter();
      const store = useSettingsStore();
      store.setStorageAdapter(mock);
      store.addApiProfile(makeProfile({ id: 'p1' }));
      store.deleteApiProfile('p1');
      await new Promise((r) => setTimeout(r, 10));
      expect(mock.saved?.apiProfiles).toEqual([]);
      expect(mock.saved?.activeApiProfileId).toBeNull();
    });

    it('setActiveApiProfile 后应自动调用 saveSettings', async () => {
      const mock = new MockStorageAdapter();
      const store = useSettingsStore();
      store.setStorageAdapter(mock);
      store.addApiProfile(makeProfile({ id: 'p1' }));
      store.addApiProfile(makeProfile({ id: 'p2', name: '第二配置' }));
      store.setActiveApiProfile('p2');
      await new Promise((r) => setTimeout(r, 10));
      expect(mock.saved?.activeApiProfileId).toBe('p2');
    });
  });

  // ── loadFromStorage ──

  describe('loadFromStorage', () => {
    it('无 storageAdapter 时静默忽略（不抛错）', async () => {
      const store = useSettingsStore();
      await expect(store.loadFromStorage()).resolves.toBeUndefined();
    });

    it('存储为空时保留默认值并写入默认设置', async () => {
      const mock = new MockStorageAdapter();
      mock.loadData = {}; // 空对象
      const store = useSettingsStore();
      store.setStorageAdapter(mock);
      await store.loadFromStorage();
      // 默认值
      expect(store.theme).toBe('dark');
      expect(store.fontSize).toBe(14);
      expect(store.apiProfiles).toEqual([]);
      expect(store.activeApiProfileId).toBeNull();
      // 首次启动应写入默认设置
      expect(mock.saveCallCount).toBeGreaterThanOrEqual(1);
      expect(mock.saved?.theme).toBe('dark');
    });

    it('存储有 theme 时应加载 theme', async () => {
      const mock = new MockStorageAdapter();
      mock.loadData = { theme: 'midnight' };
      const store = useSettingsStore();
      store.setStorageAdapter(mock);
      await store.loadFromStorage();
      expect(store.theme).toBe('midnight');
      expect(document.documentElement.getAttribute('data-theme')).toBe('midnight');
    });

    it('存储有 fontSize 时应加载并应用', async () => {
      const mock = new MockStorageAdapter();
      mock.loadData = { fontSize: 18 };
      const store = useSettingsStore();
      store.setStorageAdapter(mock);
      await store.loadFromStorage();
      expect(store.fontSize).toBe(18);
      expect(document.documentElement.style.fontSize).toBe('18px');
    });

    it('存储有 apiProfiles 时应加载列表', async () => {
      const mock = new MockStorageAdapter();
      const profiles = [makeProfile({ id: 'p1' }), makeProfile({ id: 'p2', name: 'P2' })];
      mock.loadData = { apiProfiles: profiles };
      const store = useSettingsStore();
      store.setStorageAdapter(mock);
      await store.loadFromStorage();
      expect(store.apiProfiles).toHaveLength(2);
      expect(store.apiProfiles[0]!.id).toBe('p1');
    });

    it('存储有 activeApiProfileId 时应加载激活状态', async () => {
      const mock = new MockStorageAdapter();
      mock.loadData = { activeApiProfileId: 'stored-id' };
      const store = useSettingsStore();
      store.setStorageAdapter(mock);
      await store.loadFromStorage();
      expect(store.activeApiProfileId).toBe('stored-id');
    });

    it('存储的 activeApiProfileId 为 null 时应正确加载', async () => {
      const mock = new MockStorageAdapter();
      mock.loadData = { activeApiProfileId: null };
      const store = useSettingsStore();
      store.setStorageAdapter(mock);
      // 先激活一个，再加载 null
      store.addApiProfile(makeProfile({ id: 'p1' }));
      expect(store.activeApiProfileId).toBe('p1');
      await store.loadFromStorage();
      expect(store.activeApiProfileId).toBeNull();
    });

    it('loadSettings 抛错时应记录到 lastError', async () => {
      const mock = new MockStorageAdapter();
      mock.loadShouldThrow = true;
      const store = useSettingsStore();
      store.setStorageAdapter(mock);
      await store.loadFromStorage();
      expect(store.lastError).toContain('加载设置失败');
      expect(store.lastError).toContain('mock load error');
    });

    it('saveSettings 抛错时应记录到 lastError', async () => {
      const mock = new MockStorageAdapter();
      mock.saveShouldThrow = true;
      const store = useSettingsStore();
      store.setStorageAdapter(mock);
      store.setTheme('light');
      await new Promise((r) => setTimeout(r, 10));
      expect(store.lastError).toContain('保存设置失败');
      expect(store.lastError).toContain('mock save error');
    });

    it('clearLastError 应清空错误状态', () => {
      const store = useSettingsStore();
      // 直接通过 mock 触发错误
      const mock = new MockStorageAdapter();
      mock.loadShouldThrow = true;
      store.setStorageAdapter(mock);
      return store.loadFromStorage().then(() => {
        expect(store.lastError).not.toBeNull();
        store.clearLastError();
        expect(store.lastError).toBeNull();
      });
    });
  });

  // ── 端到端持久化（真实 IndexedDB） ──

  describe('端到端持久化（真实 IndexedDB）', () => {
    it('store 调用 setTheme 后 adapter 应能读到', async () => {
      await resetDatabase('test-settings-e2e-simple');
      const adapter = new IndexedDBAdapter('test-settings-e2e-simple');
      await adapter.init();

      const store = useSettingsStore();
      store.setStorageAdapter(adapter);
      store.setTheme('midnight');
      await store.persistSettings();
      // 等待 void persistSettings 也完成
      await new Promise((r) => setTimeout(r, 30));

      expect(store.lastError).toBeNull();
      const persisted = await adapter.loadSettings();
      expect(persisted.theme).toBe('midnight');

      await adapter.close();
    });

    it('保存后重新加载应恢复全部状态', async () => {
      await resetDatabase('test-settings-e2e');
      const adapter = new IndexedDBAdapter('test-settings-e2e');
      await adapter.init();

      const store1 = useSettingsStore();
      store1.setStorageAdapter(adapter);

      // 单步操作 + 等待
      store1.setTheme('midnight');
      await new Promise((r) => setTimeout(r, 20));
      store1.setFontSize(18);
      await new Promise((r) => setTimeout(r, 20));
      store1.addApiProfile(makeProfile({ id: 'p1', name: '配置1' }));
      await new Promise((r) => setTimeout(r, 20));
      store1.addApiProfile(makeProfile({ id: 'p2', name: '配置2' }));
      await new Promise((r) => setTimeout(r, 20));
      store1.setActiveApiProfile('p2');
      await new Promise((r) => setTimeout(r, 50));

      // 直接读 adapter 验证数据已持久化
      const persisted = await adapter.loadSettings();
      expect(persisted.theme).toBe('midnight');
      expect(persisted.fontSize).toBe(18);
      expect(persisted.apiProfiles).toHaveLength(2);
      expect(persisted.activeApiProfileId).toBe('p2');

      // 新 store 模拟应用重启
      setActivePinia(createPinia());
      const store2 = useSettingsStore();
      store2.setStorageAdapter(adapter);
      await store2.loadFromStorage();
      await new Promise((r) => setTimeout(r, 50));

      expect(store2.theme).toBe('midnight');
      expect(store2.fontSize).toBe(18);
      expect(store2.apiProfiles).toHaveLength(2);
      expect(store2.apiProfiles[0]!.id).toBe('p1');
      expect(store2.apiProfiles[1]!.id).toBe('p2');
      expect(store2.activeApiProfileId).toBe('p2');

      await adapter.close();
    });
  });
});
