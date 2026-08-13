/**
 * 消息翻译 (F12.3, v1.1 新增)
 *
 * 业务逻辑：
 * - 集成翻译 API（Google Translate API / DeepL API）
 * - 可翻译 AI 回复或用户输入
 * - 可配置翻译方向（中→英、英→中等）
 * - 翻译结果显示在原文下方
 *
 * 规则约束：
 * - 需用户提供翻译 API Key
 * - 翻译 API 调用产生费用由用户承担
 * - 翻译失败时显示错误提示，不影响主流程
 */

import { t } from '@/i18n';

// ── 翻译配置 ──

/** 翻译服务提供商 */
export type TranslationProvider = 'google' | 'deepl' | 'none';

/** 翻译方向 */
export type TranslationDirection = 'zh-to-en' | 'en-to-zh' | 'auto';

/** 翻译配置 */
export interface TranslationConfig {
  /** 是否启用 */
  enabled: boolean;
  /** 服务提供商 */
  provider: TranslationProvider;
  /** API Key */
  apiKey: string;
  /** 翻译方向 */
  direction: TranslationDirection;
  /** API 端点（自定义提供商时可覆盖默认值） */
  endpoint?: string;
}

export const DEFAULT_TRANSLATION_CONFIG: TranslationConfig = {
  enabled: false,
  provider: 'none',
  apiKey: '',
  direction: 'auto',
};

// ── 翻译结果 ──

export interface TranslationResult {
  /** 原文 */
  originalText: string;
  /** 译文 */
  translatedText: string;
  /** 检测到的源语言（auto 模式下由 API 返回） */
  detectedSourceLang?: string;
  /** 目标语言 */
  targetLang: string;
  /** 服务提供商 */
  provider: TranslationProvider;
  /** 时间戳 */
  timestamp: number;
}

// ── 翻译错误 ──

export class TranslationError extends Error {
  constructor(
    message: string,
    public code:
      | 'NOT_CONFIGURED'
      | 'API_KEY_MISSING'
      | 'API_ERROR'
      | 'RATE_LIMIT'
      | 'UNSUPPORTED_PROVIDER'
      | 'NETWORK_ERROR'
      | 'EMPTY_TEXT'
  ) {
    super(message);
    this.name = 'TranslationError';
  }
}

// ── 语言代码映射 ──

/**
 * 将翻译方向转换为 API 所需的语言代码
 *
 * @param direction 翻译方向
 * @param provider 提供商
 * @returns [源语言, 目标语言]，auto 模式源语言为 'auto'
 */
export function getLanguageCodes(
  direction: TranslationDirection,
  provider: TranslationProvider
): { source: string; target: string } {
  // Google 和 DeepL 的语言代码一致（zh / en）
  switch (direction) {
    case 'zh-to-en':
      return { source: 'zh', target: 'en' };
    case 'en-to-zh':
      return { source: 'en', target: 'zh' };
    case 'auto':
      // auto 模式：Google 用 'auto'，DeepL 需省略 source 参数
      return {
        source: provider === 'deepl' ? '' : 'auto',
        target: 'zh',
      };
  }
}

// ── 翻译服务（接口） ──

export interface TranslatorService {
  /** 翻译文本 */
  translate(text: string): Promise<TranslationResult>;
  /** 批量翻译 */
  translateBatch(texts: string[]): Promise<TranslationResult[]>;
  /** 检查是否已配置 */
  isConfigured(): boolean;
}

// ── Google Translate 实现 ──

/**
 * Google Translate API 端点
 *
 * 使用 v2 翻译 API：https://translation.googleapis.com/language/translate/v2
 */
const GOOGLE_ENDPOINT =
  'https://translation.googleapis.com/language/translate/v2';

/**
 * Google Translate API 实现
 */
class GoogleTranslator implements TranslatorService {
  constructor(private config: TranslationConfig) {}

  isConfigured(): boolean {
    return this.config.apiKey.trim() !== '';
  }

  async translate(text: string): Promise<TranslationResult> {
    if (!text || text.trim() === '') {
      throw new TranslationError(t('trans.emptyText'), 'EMPTY_TEXT');
    }
    if (!this.isConfigured()) {
      throw new TranslationError(t('trans.apiKeyMissing'), 'API_KEY_MISSING');
    }

    const { source, target } = getLanguageCodes(
      this.config.direction,
      'google'
    );

    const url = new URL(GOOGLE_ENDPOINT);
    // 密钥放请求头而非 query（避免落入代理/网关访问日志）

    let response: Response;
    try {
      response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.config.apiKey,
        },
        body: JSON.stringify({
          q: text,
          source: source === 'auto' ? undefined : source,
          target,
          format: 'text',
        }),
      });
    } catch (err) {
      throw new TranslationError(
        t('trans.networkError', { error: err instanceof Error ? err.message : String(err) }),
        'NETWORK_ERROR'
      );
    }

    if (!response.ok) {
      const errorBody = await response.text();
      if (response.status === 429) {
        throw new TranslationError(t('trans.rateLimit'), 'RATE_LIMIT');
      }
      if (response.status === 403) {
        throw new TranslationError(t('trans.invalidKey'), 'API_KEY_MISSING');
      }
      throw new TranslationError(
        `Google API 错误（${response.status}）：${errorBody}`,
        'API_ERROR'
      );
    }

    const data = await response.json();
    const translations = data?.data?.translations;
    if (!Array.isArray(translations) || translations.length === 0) {
      throw new TranslationError(t('trans.apiError', { provider: t('trans.providerGoogle') }), 'API_ERROR');
    }

    return {
      originalText: text,
      translatedText: translations[0].translatedText || '',
      detectedSourceLang: translations[0].detectedSourceLanguage,
      targetLang: target,
      provider: 'google',
      timestamp: Date.now(),
    };
  }

  async translateBatch(texts: string[]): Promise<TranslationResult[]> {
    if (texts.length === 0) return [];
    // Google API 支持一次请求翻译多段文本（q 数组）
    // 简化实现：串行翻译，避免一次失败导致全部丢失
    const results: TranslationResult[] = [];
    for (const text of texts) {
      try {
        results.push(await this.translate(text));
      } catch (err) {
        // 单条失败不影响其他条目，记录错误并跳过
        results.push({
          originalText: text,
          translatedText: t('trans.translateFailed', { error: err instanceof Error ? err.message : String(err) }),
          targetLang: '',
          provider: 'google',
          timestamp: Date.now(),
        });
      }
    }
    return results;
  }
}

// ── DeepL API 实现 ──

/**
 * DeepL API 端点
 * - Free: https://api-free.deepl.com/v2/translate
 * - Pro:   https://api.deepl.com/v2/translate
 */
const DEEPL_FREE_ENDPOINT = 'https://api-free.deepl.com/v2/translate';
const DEEPL_PRO_ENDPOINT = 'https://api.deepl.com/v2/translate';

/**
 * DeepL API 实现
 */
class DeepLTranslator implements TranslatorService {
  constructor(private config: TranslationConfig) {}

  isConfigured(): boolean {
    return this.config.apiKey.trim() !== '';
  }

  private getEndpoint(): string {
    if (this.config.endpoint) return this.config.endpoint;
    // DeepL Key 后缀为 ':fx' 表示 Free 账户
    return this.config.apiKey.endsWith(':fx')
      ? DEEPL_FREE_ENDPOINT
      : DEEPL_PRO_ENDPOINT;
  }

  async translate(text: string): Promise<TranslationResult> {
    if (!text || text.trim() === '') {
      throw new TranslationError(t('trans.emptyText'), 'EMPTY_TEXT');
    }
    if (!this.isConfigured()) {
      throw new TranslationError(t('trans.deeplKeyMissing'), 'API_KEY_MISSING');
    }

    const { source, target } = getLanguageCodes(this.config.direction, 'deepl');

    const params = new URLSearchParams();
    params.append('text', text);
    params.append('target_lang', target.toUpperCase());
    if (source) {
      params.append('source_lang', source.toUpperCase());
    }

    let response: Response;
    try {
      response = await fetch(this.getEndpoint(), {
        method: 'POST',
        headers: {
          Authorization: `DeepL-Auth-Key ${this.config.apiKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });
    } catch (err) {
      throw new TranslationError(
        `网络错误：${err instanceof Error ? err.message : String(err)}`,
        'NETWORK_ERROR'
      );
    }

    if (!response.ok) {
      const errorBody = await response.text();
      if (response.status === 429) {
        throw new TranslationError(t('trans.deeplRateLimit'), 'RATE_LIMIT');
      }
      if (response.status === 403) {
        throw new TranslationError(t('trans.deeplInvalidKey'), 'API_KEY_MISSING');
      }
      throw new TranslationError(
        t('trans.deeplApiError', { status: response.status, body: errorBody }),
        'API_ERROR'
      );
    }

    const data = await response.json();
    const translations = data?.translations;
    if (!Array.isArray(translations) || translations.length === 0) {
      throw new TranslationError(t('trans.apiError', { provider: t('trans.providerDeepL') }), 'API_ERROR');
    }

    return {
      originalText: text,
      translatedText: translations[0].text || '',
      detectedSourceLang: translations[0].detected_source_language?.toLowerCase(),
      targetLang: target,
      provider: 'deepl',
      timestamp: Date.now(),
    };
  }

  async translateBatch(texts: string[]): Promise<TranslationResult[]> {
    if (texts.length === 0) return [];
    const results: TranslationResult[] = [];
    for (const text of texts) {
      try {
        results.push(await this.translate(text));
      } catch (err) {
        results.push({
          originalText: text,
          translatedText: t('trans.translateFailed', { error: err instanceof Error ? err.message : String(err) }),
          targetLang: '',
          provider: 'deepl',
          timestamp: Date.now(),
        });
      }
    }
    return results;
  }
}

// ── 工厂方法 ──

/**
 * 创建翻译服务实例
 *
 * @param config 翻译配置
 * @returns TranslatorService 实例，provider='none' 时返回 null
 */
export function createTranslator(
  config: TranslationConfig
): TranslatorService | null {
  switch (config.provider) {
    case 'google':
      return new GoogleTranslator(config);
    case 'deepl':
      return new DeepLTranslator(config);
    case 'none':
      return null;
    default:
      return null;
  }
}

/**
 * 翻译单条文本（便捷方法）
 *
 * @param text 待翻译文本
 * @param config 翻译配置
 * @returns 翻译结果（失败时抛 TranslationError）
 */
export async function translateText(
  text: string,
  config: TranslationConfig
): Promise<TranslationResult> {
  if (!config.enabled) {
    throw new TranslationError(t('trans.notConfigured'), 'NOT_CONFIGURED');
  }
  const translator = createTranslator(config);
  if (!translator) {
    throw new TranslationError(
      `不支持的翻译提供商：${config.provider}`,
      'UNSUPPORTED_PROVIDER'
    );
  }
  return translator.translate(text);
}
