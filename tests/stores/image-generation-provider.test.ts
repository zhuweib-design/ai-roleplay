/**
 * 图像 store 与设置 store 的单一事实源（E22）
 *
 * providerConfig 现在是 `settings.imageGenConfig` 的只读镜像：
 * - 写必须走 updateProviderConfig → settings.setImageGenConfig（直接赋值会被 Vue 拒绝，
 *   因为 computed 只读，这类错误只会静默丢失，所以这里钉住）；
 * - 锁定态（内存里是 enc:v1: 密文）不能算"已配置"，否则会拿密文去发请求。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useImageGenerationStore } from '@/stores/image-generation';
import { useSettingsStore } from '@/stores/settings';
import type { AppSettings } from '@/types';

class MockAdapter {
  saved: AppSettings | null = null;
  async loadSettings(): Promise<Partial<AppSettings>> {
    return {};
  }
  async saveSettings(settings: AppSettings): Promise<void> {
    this.saved = JSON.parse(JSON.stringify(settings));
  }
}

let settings: ReturnType<typeof useSettingsStore>;
let image: ReturnType<typeof useImageGenerationStore>;

beforeEach(() => {
  setActivePinia(createPinia());
  settings = useSettingsStore();
  settings.setStorageAdapter(new MockAdapter());
  image = useImageGenerationStore();
});

describe('providerConfig 是设置的只读镜像', () => {
  it('updateProviderConfig 写进的是 settings 那一份', () => {
    image.updateProviderConfig({ model: 'flux-through-store' });
    expect(settings.imageGenConfig.model).toBe('flux-through-store');
    expect(image.providerConfig.model).toBe('flux-through-store');
  });

  it('两处指向同一个对象（不存在"图像页改了设置看不见"）', () => {
    expect(image.providerConfig).toBe(settings.imageGenConfig);
  });

  it('设置侧改了配置，图像页立刻看到（反向互读）', () => {
    settings.setImageGenConfig({ endpoint: 'https://from-settings.test/v1' });
    expect(image.providerConfig.endpoint).toBe('https://from-settings.test/v1');
  });
});

describe('canGenerate 的锁定态判断', () => {
  function tryGenerateWithKey(key: string): boolean {
    settings.setImageGenConfig({ apiKey: key, enabled: true });
    image.updateParams({ prompt: '一杯酒' });
    return image.canGenerate;
  }

  it('明文密钥 + 有提示词 = 可以生成', () => {
    expect(tryGenerateWithKey('sk-plain')).toBe(true);
  });

  it('密文密钥（设了主密码但没解锁）不算可生成', () => {
    expect(tryGenerateWithKey('enc:v1:ZmFrZQ==')).toBe(false);
  });

  it('空密钥与空提示词都不算可生成', () => {
    settings.setImageGenConfig({ apiKey: '', enabled: true });
    image.updateParams({ prompt: 'x' });
    expect(image.canGenerate).toBe(false);

    settings.setImageGenConfig({ apiKey: 'sk-plain' });
    image.updateParams({ prompt: '' });
    expect(image.canGenerate).toBe(false);
  });
});
