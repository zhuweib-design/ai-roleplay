/**
 * 图像生成 Provider 的持久化与加密（E22）
 *
 * 原缺陷：`stores/image-generation.ts` 的 providerConfig 是自己的内存 ref，
 * 不在 `writeSettingsSnapshot()` 的白名单里 ⇒ 刷新即丢，连 apiKey 一起丢；
 * 同时设置里的「图像/视频」分类与它互不读取，用户两头配、两头都以为没配。
 * 这里守住修好后的四条契约：写入口落盘、有主密码时密文落盘、
 * 读回时脏字段逐项回落默认、解锁时与另两处密钥同批解密。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import 'fake-indexeddb/auto';
import { useSettingsStore } from '@/stores/settings';
import { isEncrypted } from '@core/api-key-crypto';
import type { AppSettings } from '@/types';

class MockAdapter {
  saved: AppSettings | null = null;
  loadData: Partial<AppSettings> | null = null;
  saveCount = 0;

  async loadSettings(): Promise<Partial<AppSettings>> {
    return this.loadData ?? {};
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    this.saveCount += 1;
    this.saved = JSON.parse(JSON.stringify(settings));
  }
}

async function flushPersist(): Promise<void> {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
}

beforeEach(() => {
  setActivePinia(createPinia());
  sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
});

describe('setImageGenConfig 落盘', () => {
  it('改一次配置就写一次设置（原来一次都不写）', async () => {
    const mock = new MockAdapter();
    const store = useSettingsStore();
    store.setStorageAdapter(mock);
    await store.loadFromStorage();
    const before = mock.saveCount;

    store.setImageGenConfig({ model: 'flux-1', endpoint: 'https://img.example/v1', enabled: true });
    await flushPersist();

    expect(mock.saveCount).toBeGreaterThan(before);
    expect(mock.saved?.imageGenConfig?.model).toBe('flux-1');
    expect(mock.saved?.imageGenConfig?.enabled).toBe(true);
  });

  it('设了主密码时密钥密文落盘，内存仍是明文', async () => {
    const mock = new MockAdapter();
    const store = useSettingsStore();
    store.setStorageAdapter(mock);
    await store.loadFromStorage();

    store.setImageGenConfig({ apiKey: 'sk-image-plain' });
    await flushPersist();
    await store.setMasterPassword('pw-for-image');
    await flushPersist();

    const saved = mock.saved?.imageGenConfig;
    expect(saved, 'imageGenConfig 必须在持久化白名单里').toBeTruthy();
    expect(isEncrypted(saved!.apiKey)).toBe(true);
    expect(saved!.apiKey).not.toBe('sk-image-plain');
    expect(store.imageGenConfig.apiKey).toBe('sk-image-plain');
  });

  it('未设主密码时保持明文（与 apiProfiles / 翻译配置同口径，不假装更安全）', async () => {
    const mock = new MockAdapter();
    const store = useSettingsStore();
    store.setStorageAdapter(mock);
    await store.loadFromStorage();

    store.setImageGenConfig({ apiKey: 'sk-no-master' });
    await flushPersist();

    expect(mock.saved?.imageGenConfig?.apiKey).toBe('sk-no-master');
  });
});

describe('读回与脏数据', () => {
  it('刷新后能取回配置（这就是原来丢的东西）', async () => {
    const mock = new MockAdapter();
    // 带 theme：loadFromStorage 用一组"是否已有数据"的探测字段判首次启动，
    // 只带新字段的快照会被当成空快照（真实快照一定含 theme，这里不制造假场景）
    mock.loadData = {
      theme: 'dark',
      imageGenConfig: {
        type: 'custom',
        endpoint: 'https://saved.example/v1',
        apiKey: 'sk-saved',
        model: 'sd-xl',
        enabled: true,
      },
    } as Partial<AppSettings>;
    const store = useSettingsStore();
    store.setStorageAdapter(mock);

    await store.loadFromStorage();

    expect(store.imageGenConfig.model).toBe('sd-xl');
    expect(store.imageGenConfig.endpoint).toBe('https://saved.example/v1');
    expect(store.imageGenConfig.enabled).toBe(true);
  });

  it('脏字段逐项回落默认，一个好字段不该被坏字段带崩', async () => {
    const mock = new MockAdapter();
    mock.loadData = {
      theme: 'dark',
      imageGenConfig: {
        type: 'not-a-provider',
        endpoint: 1234,
        apiKey: 'sk-keep-me',
        model: null,
        enabled: 'yes',
      },
    } as unknown as Partial<AppSettings>;
    const store = useSettingsStore();
    store.setStorageAdapter(mock);

    await store.loadFromStorage();

    expect(store.imageGenConfig.apiKey).toBe('sk-keep-me');
    // 非法值回落默认（默认 type=openai / endpoint=api.openai.com / enabled=false）
    expect(store.imageGenConfig.type).toBe('openai');
    expect(store.imageGenConfig.endpoint).toContain('openai');
    expect(store.imageGenConfig.enabled).toBe(false);
  });

  it('旧快照完全没有该字段时用默认值，不抛错', async () => {
    const mock = new MockAdapter();
    mock.loadData = { theme: 'dark' } as Partial<AppSettings>;
    const store = useSettingsStore();
    store.setStorageAdapter(mock);

    await store.loadFromStorage();

    expect(store.imageGenConfig.model).toBe('dall-e-3');
    expect(store.imageGenConfig.apiKey).toBe('');
  });
});

describe('解锁时同批解密', () => {
  it('unlock 后图像密钥与 Profile 密钥一起回到明文', async () => {
    const mock = new MockAdapter();
    const store = useSettingsStore();
    store.setStorageAdapter(mock);
    await store.loadFromStorage();
    store.setImageGenConfig({ apiKey: 'sk-round-trip' });
    await flushPersist();
    await store.setMasterPassword('pw-round');
    await flushPersist();
    const savedImageKey = mock.saved?.imageGenConfig?.apiKey ?? '';
    expect(isEncrypted(savedImageKey)).toBe(true);

    // 模拟"刷新后重新解锁"：内存态换成密文，再走 unlock
    store.imageGenConfig.apiKey = savedImageKey;
    const ok = await store.unlock('pw-round');

    expect(ok).toBe(true);
    expect(store.imageGenConfig.apiKey).toBe('sk-round-trip');
  });
});
