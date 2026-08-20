/**
 * image-generation 单元测试 (模块3)
 *
 * 覆盖：
 * - 风格预设管理
 * - 尺寸映射
 * - 质量到步数映射
 * - 参数构建与风格应用
 * - 风格迁移参数
 * - Provider 配置验证
 * - 默认参数
 */
import { describe, it, expect } from 'vitest';
import {
  STYLE_PRESETS,
  listStylePresets,
  findStylePreset,
  SIZE_DIMENSIONS,
  QUALITY_STEPS,
  applyStylePreset,
  buildStyleTransferParams,
  createDefaultParams,
  createDefaultProviderConfig,
  OpenAIImageProvider,
  CustomImageProvider,
  ImageGenerationEngine,
  getDimensions,
} from '../../src/core/image-generation';
import { ImageGallery, estimateBase64Size, formatBytes } from '../../src/core/image-storage';

describe('风格预设', () => {
  it('listStylePresets 返回所有预设', () => {
    const presets = listStylePresets();
    expect(presets.length).toBe(STYLE_PRESETS.length);
    expect(presets.length).toBeGreaterThanOrEqual(10);
  });

  it('findStylePreset 查找存在的预设', () => {
    const preset = findStylePreset('anime');
    expect(preset).not.toBeNull();
    expect(preset?.id).toBe('anime');
    expect(preset?.promptSuffix).toBeTruthy();
  });

  it('findStylePreset 查找不存在的返回 null', () => {
    expect(findStylePreset('nonexistent' as never)).toBeNull();
  });

  it('none 预设有空 promptSuffix', () => {
    const none = findStylePreset('none');
    expect(none?.promptSuffix).toBe('');
  });

  it('每个预设有必填字段', () => {
    for (const preset of STYLE_PRESETS) {
      expect(preset.id).toBeTruthy();
      expect(preset.name).toBeTruthy();
      expect(preset.description).toBeTruthy();
    }
  });
});

describe('尺寸映射', () => {
  it('所有尺寸有对应的像素值', () => {
    const sizes = Object.keys(SIZE_DIMENSIONS) as Array<keyof typeof SIZE_DIMENSIONS>;
    for (const size of sizes) {
      const dim = SIZE_DIMENSIONS[size];
      expect(dim.width).toBeGreaterThan(0);
      expect(dim.height).toBeGreaterThan(0);
      expect(dim.label).toBeTruthy();
    }
  });

  it('getDimensions 返回正确尺寸', () => {
    const dim = getDimensions('square_hd');
    expect(dim.width).toBe(1024);
    expect(dim.height).toBe(1024);
  });

  it('横版尺寸宽大于高', () => {
    const dim = getDimensions('landscape_16_9');
    expect(dim.width).toBeGreaterThan(dim.height);
  });

  it('竖版尺寸高大于宽', () => {
    const dim = getDimensions('portrait_4_3');
    expect(dim.height).toBeGreaterThan(dim.width);
  });
});

describe('质量到步数映射', () => {
  it('草稿步数最少', () => {
    expect(QUALITY_STEPS.draft).toBeLessThan(QUALITY_STEPS.standard);
  });

  it('极致步数最多', () => {
    expect(QUALITY_STEPS.ultra).toBeGreaterThan(QUALITY_STEPS.high);
  });

  it('所有质量级别有步数', () => {
    expect(QUALITY_STEPS.draft).toBeGreaterThan(0);
    expect(QUALITY_STEPS.standard).toBeGreaterThan(0);
    expect(QUALITY_STEPS.high).toBeGreaterThan(0);
    expect(QUALITY_STEPS.ultra).toBeGreaterThan(0);
  });
});

describe('applyStylePreset', () => {
  it('none 风格不修改 prompt', () => {
    const params = createDefaultParams();
    params.prompt = 'a cat';
    const applied = applyStylePreset(params);
    expect(applied.prompt).toBe('a cat');
  });

  it('anime 风格追加 promptSuffix', () => {
    const params = createDefaultParams();
    params.prompt = 'a cat';
    params.style = 'anime';
    const applied = applyStylePreset(params);
    expect(applied.prompt).toContain('a cat');
    expect(applied.prompt).toContain('anime');
  });

  it('追加 negativeSuffix 到 negativePrompt', () => {
    const params = createDefaultParams();
    params.prompt = 'a cat';
    params.style = 'anime';
    const applied = applyStylePreset(params);
    expect(applied.negativePrompt).toBeTruthy();
    expect(applied.negativePrompt).toContain('realistic');
  });

  it('合并已有的 negativePrompt', () => {
    const params = createDefaultParams();
    params.prompt = 'a cat';
    params.negativePrompt = 'blurry';
    params.style = 'anime';
    const applied = applyStylePreset(params);
    expect(applied.negativePrompt).toContain('blurry');
    expect(applied.negativePrompt).toContain('realistic');
  });

  it('不修改原始参数对象', () => {
    const params = createDefaultParams();
    params.prompt = 'a cat';
    params.style = 'anime';
    const original = { ...params };
    applyStylePreset(params);
    expect(params.prompt).toBe(original.prompt);
  });
});

describe('buildStyleTransferParams', () => {
  it('构建风格迁移参数', () => {
    const params = buildStyleTransferParams('a portrait', 'base64data', 'oil-painting');
    expect(params.prompt).toContain('a portrait');
    expect(params.prompt).toContain('style transfer');
    expect(params.styleReference).toBe('base64data');
    expect(params.style).toBe('oil-painting');
  });

  it('使用高清质量', () => {
    const params = buildStyleTransferParams('test', 'ref', 'anime');
    expect(params.quality).toBe('high');
    expect(params.steps).toBe(QUALITY_STEPS.high);
  });
});

describe('默认参数', () => {
  it('createDefaultParams 有合理默认值', () => {
    const params = createDefaultParams();
    expect(params.prompt).toBe('');
    expect(params.size).toBe('square_hd');
    expect(params.quality).toBe('standard');
    expect(params.style).toBe('none');
    expect(params.seed).toBe(-1);
    expect(params.batchCount).toBe(1);
  });

  it('createDefaultProviderConfig 有合理默认值', () => {
    const config = createDefaultProviderConfig();
    expect(config.type).toBe('openai');
    expect(config.apiKey).toBe('');
    expect(config.enabled).toBe(false);
  });
});

describe('Provider 验证', () => {
  const openaiProvider = new OpenAIImageProvider();
  const customProvider = new CustomImageProvider();

  it('OpenAI Provider 验证空配置失败', () => {
    expect(openaiProvider.validateConfig(createDefaultProviderConfig())).toBe(false);
  });

  it('OpenAI Provider 验证有 Key 成功', () => {
    const config = createDefaultProviderConfig();
    config.apiKey = 'sk-test';
    config.endpoint = 'https://api.openai.com/v1';
    expect(openaiProvider.validateConfig(config)).toBe(true);
  });

  it('Custom Provider 验证空配置失败', () => {
    const config = createDefaultProviderConfig();
    config.type = 'custom';
    expect(customProvider.validateConfig(config)).toBe(false);
  });

  it('Custom Provider 验证有 Key 成功', () => {
    const config = createDefaultProviderConfig();
    config.type = 'custom';
    config.apiKey = 'test-key';
    config.endpoint = 'https://example.com/api';
    expect(customProvider.validateConfig(config)).toBe(true);
  });
});

describe('ImageGenerationEngine', () => {
  it('注册了内置 Provider', () => {
    const engine = new ImageGenerationEngine();
    const types = engine.listProviderTypes();
    expect(types).toContain('openai');
    expect(types).toContain('custom');
  });

  it('validateConfig 检查 Provider 类型', () => {
    const engine = new ImageGenerationEngine();
    const config = createDefaultProviderConfig();
    config.apiKey = 'test';
    config.endpoint = 'https://example.com';
    expect(engine.validateConfig(config)).toBe(true);
  });

  it('不支持的 Provider 类型返回 false', () => {
    const engine = new ImageGenerationEngine();
    const config = createDefaultProviderConfig();
    config.type = 'stability' as never;
    expect(engine.validateConfig(config)).toBe(false);
  });
});

describe('ImageGallery', () => {
  function createMockImage(id: string, prompt: string = 'test'): import('../../src/core/image-generation').GeneratedImage {
    return {
      id,
      data: 'data:image/png;base64,iVBORw0KGgo=',
      mimeType: 'image/png',
      width: 512,
      height: 512,
      params: { ...createDefaultParams(), prompt },
      provider: 'openai',
      durationMs: 1000,
      createdAt: new Date().toISOString(),
    };
  }

  it('添加图像后可获取', () => {
    const gallery = new ImageGallery();
    const img = createMockImage('img-1');
    gallery.add(img);
    expect(gallery.get('img-1')).not.toBeNull();
    expect(gallery.count).toBe(1);
  });

  it('list 返回按时间倒序', () => {
    const gallery = new ImageGallery();
    gallery.add(createMockImage('img-1'));
    gallery.add(createMockImage('img-2'));
    const list = gallery.list();
    expect(list[0]!.id).toBe('img-2');
  });

  it('delete 删除指定图像', () => {
    const gallery = new ImageGallery();
    gallery.add(createMockImage('img-1'));
    expect(gallery.delete('img-1')).toBe(true);
    expect(gallery.count).toBe(0);
  });

  it('delete 不存在的返回 false', () => {
    const gallery = new ImageGallery();
    expect(gallery.delete('nonexistent')).toBe(false);
  });

  it('clear 清空画廊', () => {
    const gallery = new ImageGallery();
    gallery.add(createMockImage('img-1'));
    gallery.add(createMockImage('img-2'));
    gallery.clear();
    expect(gallery.count).toBe(0);
  });

  it('search 按提示词搜索', () => {
    const gallery = new ImageGallery();
    gallery.add(createMockImage('img-1', 'a cat'));
    gallery.add(createMockImage('img-2', 'a dog'));
    const results = gallery.search('cat');
    expect(results.length).toBe(1);
    expect(results[0]!.id).toBe('img-1');
  });

  it('filterByStyle 按风格筛选', () => {
    const gallery = new ImageGallery();
    const img1 = createMockImage('img-1');
    img1.params.style = 'anime';
    const img2 = createMockImage('img-2');
    img2.params.style = 'realistic';
    gallery.add(img1);
    gallery.add(img2);
    expect(gallery.filterByStyle('anime').length).toBe(1);
    expect(gallery.filterByStyle('all').length).toBe(2);
  });

  it('超出容量时淘汰最旧的', () => {
    const gallery = new ImageGallery(2);
    gallery.add(createMockImage('img-1'));
    gallery.add(createMockImage('img-2'));
    gallery.add(createMockImage('img-3'));
    expect(gallery.count).toBe(2);
    expect(gallery.get('img-1')).toBeNull();
    expect(gallery.get('img-3')).not.toBeNull();
  });

  it('getStats 返回正确统计', () => {
    const gallery = new ImageGallery();
    gallery.add(createMockImage('img-1', 'test'));
    gallery.add(createMockImage('img-2', 'test'));
    const stats = gallery.getStats();
    expect(stats.count).toBe(2);
    expect(stats.totalSizeMb).toBeGreaterThan(0);
    expect(stats.avgDurationMs).toBe(1000);
    expect(stats.byProvider.openai).toBe(2);
  });
});

describe('estimateBase64Size / formatBytes', () => {
  it('estimateBase64Size 估算大小', () => {
    const size = estimateBase64Size('data:image/png;base64,iVBORw0KGgo=');
    expect(size).toBeGreaterThan(0);
  });

  it('formatBytes 格式化字节', () => {
    expect(formatBytes(500)).toBe('500 B');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
  });
});
