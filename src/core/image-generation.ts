/**
 * 图像生成集成框架 (模块3)
 *
 * 职责：
 * - Provider 抽象层（支持多种图像生成 API）
 * - 统一的生成参数与输出格式
 * - 风格预设管理
 * - 批量生成
 * - 风格迁移参数构建
 *
 * 架构：
 * - ImageProvider 接口：各服务提供商实现统一接口
 * - ImageGenerationEngine：编排生成流程
 * - 预置风格预设库
 */

// ── 类型定义 ──

/** 图像尺寸 */
// i18n-ignore-start  // 模型面提示词 / mock / 种子目录，非 UI 文案（待翻译）
export type ImageSize =
  | 'square_hd'
  | 'square'
  | 'portrait_4_3'
  | 'portrait_16_9'
  | 'landscape_4_3'
  | 'landscape_16_9';

/** 图像质量级别 */
export type ImageQuality = 'draft' | 'standard' | 'high' | 'ultra';

/** 风格预设 ID */
export type StylePresetId =
  | 'none'
  | 'anime'
  | 'realistic'
  | 'oil-painting'
  | 'watercolor'
  | 'pixel-art'
  | 'cyberpunk'
  | 'fantasy'
  | 'minimalist'
  | 'sketch';

/** 生成状态 */
export type GenerationStatus = 'pending' | 'generating' | 'completed' | 'failed' | 'cancelled';

/** Provider 类型 */
export type ProviderType = 'openai' | 'stability' | 'custom';

/** 图像生成参数 */
export interface ImageGenerationParams {
  /** 正向提示词 */
  prompt: string;
  /** 反向提示词（排除内容） */
  negativePrompt?: string;
  /** 图像尺寸 */
  size: ImageSize;
  /** 质量级别 */
  quality: ImageQuality;
  /** 风格预设 */
  style: StylePresetId;
  /** 采样步数（部分 Provider 支持） */
  steps?: number;
  /** CFG 引导系数（部分 Provider 支持） */
  cfgScale?: number;
  /** 随机种子（-1=随机） */
  seed: number;
  /** 批量数量 */
  batchCount: number;
  /** 风格迁移参考图（base64，可选） */
  styleReference?: string;
}

/** 图像生成结果 */
export interface GeneratedImage {
  /** 唯一 ID */
  id: string;
  /** 图像数据（base64 data URL 或 URL） */
  data: string;
  /** MIME 类型 */
  mimeType: string;
  /** 宽度 */
  width: number;
  /** 高度 */
  height: number;
  /** 生成参数 */
  params: ImageGenerationParams;
  /** Provider 类型 */
  provider: ProviderType;
  /** 生成耗时（ms） */
  durationMs: number;
  /** 生成时间 ISO */
  createdAt: string;
}

/** Provider 配置 */
export interface ImageProviderConfig {
  /** Provider 类型 */
  type: ProviderType;
  /** API 端点 */
  endpoint: string;
  /** API Key */
  apiKey: string;
  /** 默认模型 */
  model: string;
  /** 是否启用 */
  enabled: boolean;
}

/** 生成进度 */
export interface GenerationProgress {
  /** 批次索引（0-based） */
  batchIndex: number;
  /** 总批次数 */
  batchTotal: number;
  /** 状态 */
  status: GenerationStatus;
  /** 错误信息 */
  error?: string;
}

// ── 风格预设库 ──

export interface StylePreset {
  id: StylePresetId;
  name: string;
  description: string;
  /** 追加到 prompt 的风格描述 */
  promptSuffix: string;
  /** 追加到 negativePrompt 的内容 */
  negativeSuffix?: string;
}

/**
 * 预置风格预设
 */
export const STYLE_PRESETS: StylePreset[] = [
  {
    id: 'none',
    name: '无风格',
    description: '不添加额外风格',
    promptSuffix: '',
  },
  {
    id: 'anime',
    name: '动漫',
    description: '日式动漫插画风格',
    promptSuffix: 'anime style, cel shading, vibrant colors, detailed eyes, clean lines',
    negativeSuffix: 'realistic, photo, 3d render',
  },
  {
    id: 'realistic',
    name: '写实',
    description: '照片级写实风格',
    promptSuffix: 'photorealistic, high detail, natural lighting, 8k, sharp focus',
    negativeSuffix: 'anime, cartoon, illustration, painting',
  },
  {
    id: 'oil-painting',
    name: '油画',
    description: '传统油画质感',
    promptSuffix: 'oil painting, thick brush strokes, rich textures, classical art style',
    negativeSuffix: 'photo, digital, anime',
  },
  {
    id: 'watercolor',
    name: '水彩',
    description: '水彩画风格',
    promptSuffix: 'watercolor painting, soft colors, paper texture, artistic, flowing',
    negativeSuffix: 'photo, 3d, digital art',
  },
  {
    id: 'pixel-art',
    name: '像素画',
    description: '复古像素艺术',
    promptSuffix: 'pixel art, 16-bit, retro game style, limited palette',
    negativeSuffix: 'high resolution, photo, realistic',
  },
  {
    id: 'cyberpunk',
    name: '赛博朋克',
    description: '未来赛博朋克美学',
    promptSuffix: 'cyberpunk, neon lights, futuristic, dark atmosphere, high-tech, blade runner style',
    negativeSuffix: 'medieval, fantasy, pastoral',
  },
  {
    id: 'fantasy',
    name: '奇幻',
    description: '奇幻艺术风格',
    promptSuffix: 'fantasy art, magical, ethereal, epic, detailed, concept art',
    negativeSuffix: 'modern, urban, sci-fi',
  },
  {
    id: 'minimalist',
    name: '极简',
    description: '简约几何风格',
    promptSuffix: 'minimalist, clean lines, simple shapes, limited colors, flat design',
    negativeSuffix: 'cluttered, detailed, complex',
  },
  {
    id: 'sketch',
    name: '素描',
    description: '铅笔素描风格',
    promptSuffix: 'pencil sketch, graphite, shading, hand-drawn, monochrome',
    negativeSuffix: 'color, photo, digital',
  },
];

/**
 * 获取所有风格预设
 */
export function listStylePresets(): StylePreset[] {
  return [...STYLE_PRESETS];
}

/**
 * 按 ID 查找风格预设
 */
export function findStylePreset(id: StylePresetId): StylePreset | null {
  return STYLE_PRESETS.find((s) => s.id === id) ?? null;
}

// ── 尺寸映射 ──

/**
 * 尺寸到像素的映射
 */
export const SIZE_DIMENSIONS: Record<ImageSize, { width: number; height: number; label: string }> = {
  square_hd: { width: 1024, height: 1024, label: '方形 HD (1024×1024)' },
  square: { width: 768, height: 768, label: '方形 (768×768)' },
  portrait_4_3: { width: 768, height: 1024, label: '竖版 4:3 (768×1024)' },
  portrait_16_9: { width: 576, height: 1024, label: '竖版 16:9 (576×1024)' },
  landscape_4_3: { width: 1024, height: 768, label: '横版 4:3 (1024×768)' },
  landscape_16_9: { width: 1024, height: 576, label: '横版 16:9 (1024×576)' },
};

/**
 * 获取尺寸的像素值
 */
export function getDimensions(size: ImageSize): { width: number; height: number } {
  const dim = SIZE_DIMENSIONS[size];
  return { width: dim.width, height: dim.height };
}

// ── 质量到步数映射 ──

/**
 * 质量级别到采样步数的映射
 */
export const QUALITY_STEPS: Record<ImageQuality, number> = {
  draft: 15,
  standard: 25,
  high: 35,
  ultra: 50,
};

// ── 参数构建 ──

/**
 * 应用风格预设到参数
 *
 * 将风格预设的 promptSuffix / negativeSuffix 合并到参数中。
 */
export function applyStylePreset(
  params: ImageGenerationParams
): ImageGenerationParams {
  const preset = findStylePreset(params.style);
  if (!preset || preset.id === 'none') {
    return { ...params };
  }

  const mergedPrompt = preset.promptSuffix
    ? `${params.prompt}, ${preset.promptSuffix}`
    : params.prompt;

  const mergedNegative = [params.negativePrompt, preset.negativeSuffix]
    .filter(Boolean)
    .join(', ');

  return {
    ...params,
    prompt: mergedPrompt,
    negativePrompt: mergedNegative || undefined,
  };
}

/**
 * 构建风格迁移参数
 *
 * 风格迁移通过提供参考图 + 风格提示词实现。
 */
export function buildStyleTransferParams(
  prompt: string,
  styleReference: string,
  targetStyle: StylePresetId
): ImageGenerationParams {
  const preset = findStylePreset(targetStyle);
  return {
    prompt: `${prompt}, style transfer from reference image${preset ? `, ${preset.promptSuffix}` : ''}`,
    negativePrompt: preset?.negativeSuffix,
    size: 'square_hd',
    quality: 'high',
    style: targetStyle,
    steps: QUALITY_STEPS.high,
    cfgScale: 7.5,
    seed: -1,
    batchCount: 1,
    styleReference,
  };
}

// ── Provider 接口 ──

/**
 * 图像生成 Provider 接口
 *
 * 各服务商实现此接口以接入统一框架。
 */
export interface ImageProvider {
  /** Provider 类型 */
  readonly type: ProviderType;
  /** 生成单张图像 */
  generate(
    params: ImageGenerationParams,
    config: ImageProviderConfig
  ): Promise<GeneratedImage>;
  /** 检查配置是否有效 */
  validateConfig(config: ImageProviderConfig): boolean;
}

/**
 * OpenAI 兼容的图像生成 Provider
 *
 * 支持 OpenAI DALL-E 及兼容 API（如 Stability AI 的 OpenAI 兼容端点）。
 */
export class OpenAIImageProvider implements ImageProvider {
  readonly type: ProviderType = 'openai';

  async generate(
    params: ImageGenerationParams,
    config: ImageProviderConfig
  ): Promise<GeneratedImage> {
    if (!this.validateConfig(config)) {
      throw new Error('Provider 配置无效：缺少 API Key 或端点');
    }

    const appliedParams = applyStylePreset(params);
    const dimensions = getDimensions(appliedParams.size);
    const startTime = performance.now();

    // 构建请求体（OpenAI DALL-E 3 格式）
    const body: Record<string, unknown> = {
      model: config.model || 'dall-e-3',
      prompt: appliedParams.prompt,
      n: 1,
      size: `${dimensions.width}x${dimensions.height}`,
      response_format: 'b64_json',
    };

    // 质量映射
    if (appliedParams.quality === 'high' || appliedParams.quality === 'ultra') {
      body.quality = 'hd';
    }

    const response = await fetch(`${config.endpoint}/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`图像生成 API 错误 ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const imageData = data?.data?.[0]?.b64_json;
    if (!imageData) {
      throw new Error('API 返回数据中无图像内容');
    }

    const durationMs = performance.now() - startTime;

    return {
      id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      data: `data:image/png;base64,${imageData}`,
      mimeType: 'image/png',
      width: dimensions.width,
      height: dimensions.height,
      params: appliedParams,
      provider: this.type,
      durationMs,
      createdAt: new Date().toISOString(),
    };
  }

  validateConfig(config: ImageProviderConfig): boolean {
    return (
      config.apiKey.trim().length > 0 &&
      config.endpoint.trim().length > 0
    );
  }
}

/**
 * 通用自定义 Provider（支持 Stability AI 风格的 API）
 */
export class CustomImageProvider implements ImageProvider {
  readonly type: ProviderType = 'custom';

  async generate(
    params: ImageGenerationParams,
    config: ImageProviderConfig
  ): Promise<GeneratedImage> {
    if (!this.validateConfig(config)) {
      throw new Error('Provider 配置无效');
    }

    const appliedParams = applyStylePreset(params);
    const dimensions = getDimensions(appliedParams.size);
    const startTime = performance.now();

    // 使用 FormData 发送（兼容 Stability AI 风格）
    const formData = new FormData();
    formData.append('prompt', appliedParams.prompt);
    if (appliedParams.negativePrompt) {
      formData.append('negative_prompt', appliedParams.negativePrompt);
    }
    formData.append('width', String(dimensions.width));
    formData.append('height', String(dimensions.height));
    formData.append('steps', String(appliedParams.steps ?? QUALITY_STEPS[appliedParams.quality]));
    formData.append('cfg_scale', String(appliedParams.cfgScale ?? 7));
    if (appliedParams.seed >= 0) {
      formData.append('seed', String(appliedParams.seed));
    }
    if (appliedParams.styleReference) {
      formData.append('style_image', appliedParams.styleReference);
    }

    const response = await fetch(`${config.endpoint}/generate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`图像生成 API 错误 ${response.status}: ${errorText}`);
    }

    const blob = await response.blob();
    const base64 = await blobToBase64(blob);
    const durationMs = performance.now() - startTime;

    return {
      id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      data: base64,
      mimeType: blob.type || 'image/png',
      width: dimensions.width,
      height: dimensions.height,
      params: appliedParams,
      provider: this.type,
      durationMs,
      createdAt: new Date().toISOString(),
    };
  }

  validateConfig(config: ImageProviderConfig): boolean {
    return (
      config.apiKey.trim().length > 0 &&
      config.endpoint.trim().length > 0
    );
  }
}

// ── 工具函数 ──

/**
 * Blob 转 base64 data URL
 */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Blob 转 base64 失败'));
    reader.readAsDataURL(blob);
  });
}

// ── 生成引擎 ──

/**
 * 图像生成引擎
 *
 * 编排 Provider 调用与批量生成流程。
 */
export class ImageGenerationEngine {
  private providers: Map<ProviderType, ImageProvider> = new Map();

  constructor() {
    // 注册内置 Provider
    this.registerProvider(new OpenAIImageProvider());
    this.registerProvider(new CustomImageProvider());
  }

  /**
   * 注册 Provider
   */
  registerProvider(provider: ImageProvider): void {
    this.providers.set(provider.type, provider);
  }

  /**
   * 获取已注册的 Provider 类型
   */
  listProviderTypes(): ProviderType[] {
    return Array.from(this.providers.keys());
  }

  /**
   * 生成单张图像
   */
  async generate(
    params: ImageGenerationParams,
    config: ImageProviderConfig
  ): Promise<GeneratedImage> {
    const provider = this.providers.get(config.type);
    if (!provider) {
      throw new Error(`不支持的 Provider 类型：${config.type}`);
    }
    return provider.generate(params, config);
  }

  /**
   * 批量生成
   *
   * 按 batchCount 依次调用生成，通过回调报告进度。
   * 失败的单张不影响其他张。
   */
  async generateBatch(
    params: ImageGenerationParams,
    config: ImageProviderConfig,
    onProgress?: (progress: GenerationProgress, image?: GeneratedImage) => void
  ): Promise<GeneratedImage[]> {
    const results: GeneratedImage[] = [];
    const total = Math.max(1, params.batchCount);

    for (let i = 0; i < total; i++) {
      onProgress?.({
        batchIndex: i,
        batchTotal: total,
        status: 'generating',
      });

      try {
        // 每次生成使用不同的种子（若 seed >= 0 则递增）
        const batchParams: ImageGenerationParams = {
          ...params,
          seed: params.seed >= 0 ? params.seed + i : -1,
        };

        const image = await this.generate(batchParams, config);
        results.push(image);
        onProgress?.({ batchIndex: i, batchTotal: total, status: 'completed' }, image);
      } catch (err) {
        onProgress?.({
          batchIndex: i,
          batchTotal: total,
          status: 'failed',
          error: err instanceof Error ? err.message : String(err),
        });
        // 继续下一张
      }
    }

    return results;
  }

  /**
   * 检查 Provider 配置是否有效
   */
  validateConfig(config: ImageProviderConfig): boolean {
    const provider = this.providers.get(config.type);
    if (!provider) return false;
    return provider.validateConfig(config);
  }
}

// ── 默认参数 ──

/**
 * 创建默认生成参数
 */
export function createDefaultParams(): ImageGenerationParams {
  return {
    prompt: '',
    negativePrompt: '',
    size: 'square_hd',
    quality: 'standard',
    style: 'none',
    steps: QUALITY_STEPS.standard,
    cfgScale: 7,
    seed: -1,
    batchCount: 1,
  };
}

/**
 * 创建默认 Provider 配置
 */
export function createDefaultProviderConfig(): ImageProviderConfig {
  return {
    type: 'openai',
    endpoint: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'dall-e-3',
    enabled: false,
  };
}
// i18n-ignore-end
