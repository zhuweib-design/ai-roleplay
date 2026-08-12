/**
 * 翻译服务单元测试 (迭代28 · F12.3)
 *
 * 覆盖：
 * - getLanguageCodes 语言代码映射
 * - createTranslator 工厂方法
 * - GoogleTranslator / DeepLTranslator 翻译流程
 * - 错误处理（空文本/未配置/API错误/网络错误）
 * - translateText 便捷方法
 *
 * 注：通过 mock fetch 模拟 API 调用
 */
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getLanguageCodes,
  createTranslator,
  translateText,
  DEFAULT_TRANSLATION_CONFIG,
  TranslationError,
  type TranslationConfig,
} from '../../src/services/translator';

// ── Mock fetch ──

function mockFetchResponse(
  status: number,
  body: unknown,
  contentType = 'application/json'
) {
  const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(bodyStr),
    json: () => Promise.resolve(typeof body === 'string' ? JSON.parse(body) : body),
    headers: { get: () => contentType },
  });
}

function mockFetchNetworkError(message = 'network failed') {
  return vi.fn().mockRejectedValue(new Error(message));
}

// ── 测试夹具 ──

function makeConfig(overrides: Partial<TranslationConfig> = {}): TranslationConfig {
  return {
    enabled: true,
    provider: 'google',
    apiKey: 'test-api-key',
    direction: 'zh-to-en',
    ...overrides,
  };
}

// ── 测试用例 ──

describe('translator (F12.3)', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('getLanguageCodes 语言代码映射', () => {
    test('zh-to-en 返回 zh/en', () => {
      const result = getLanguageCodes('zh-to-en', 'google');
      expect(result.source).toBe('zh');
      expect(result.target).toBe('en');
    });

    test('en-to-zh 返回 en/zh', () => {
      const result = getLanguageCodes('en-to-zh', 'google');
      expect(result.source).toBe('en');
      expect(result.target).toBe('zh');
    });

    test('auto 模式 google 返回 auto/zh', () => {
      const result = getLanguageCodes('auto', 'google');
      expect(result.source).toBe('auto');
      expect(result.target).toBe('zh');
    });

    test('auto 模式 deepl 返回空字符串', () => {
      const result = getLanguageCodes('auto', 'deepl');
      expect(result.source).toBe('');
      expect(result.target).toBe('zh');
    });

    test('所有方向目标语言都是 zh/en', () => {
      const directions: Array<'zh-to-en' | 'en-to-zh' | 'auto'> = ['zh-to-en', 'en-to-zh', 'auto'];
      for (const dir of directions) {
        const result = getLanguageCodes(dir, 'google');
        expect(['zh', 'en']).toContain(result.target);
      }
    });
  });

  describe('createTranslator 工厂方法', () => {
    test('provider=google 返回 GoogleTranslator', () => {
      const translator = createTranslator(makeConfig({ provider: 'google' }));
      expect(translator).not.toBeNull();
      expect(translator!.isConfigured()).toBe(true);
    });

    test('provider=deepl 返回 DeepLTranslator', () => {
      const translator = createTranslator(makeConfig({ provider: 'deepl' }));
      expect(translator).not.toBeNull();
      expect(translator!.isConfigured()).toBe(true);
    });

    test('provider=none 返回 null', () => {
      const translator = createTranslator(makeConfig({ provider: 'none' }));
      expect(translator).toBeNull();
    });

    test('API Key 为空时 isConfigured 返回 false', () => {
      const translator = createTranslator(
        makeConfig({ provider: 'google', apiKey: '' })
      );
      expect(translator!.isConfigured()).toBe(false);
    });
  });

  describe('DEFAULT_TRANSLATION_CONFIG', () => {
    test('默认禁用', () => {
      expect(DEFAULT_TRANSLATION_CONFIG.enabled).toBe(false);
    });

    test('默认 provider 为 none', () => {
      expect(DEFAULT_TRANSLATION_CONFIG.provider).toBe('none');
    });

    test('默认方向为 auto', () => {
      expect(DEFAULT_TRANSLATION_CONFIG.direction).toBe('auto');
    });
  });

  describe('GoogleTranslator 翻译', () => {
    test('成功翻译返回 TranslationResult', async () => {
      const fetchMock = mockFetchResponse(200, {
        data: {
          translations: [
            { translatedText: 'Hello world', detectedSourceLanguage: 'zh' },
          ],
        },
      });
      globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

      const translator = createTranslator(makeConfig());
      const result = await translator!.translate('你好世界');

      expect(result.originalText).toBe('你好世界');
      expect(result.translatedText).toBe('Hello world');
      expect(result.detectedSourceLang).toBe('zh');
      expect(result.targetLang).toBe('en');
      expect(result.provider).toBe('google');
      expect(result.timestamp).toBeGreaterThan(0);

      // 验证 fetch 调用参数
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const callUrl = fetchMock.mock.calls[0][0];
      expect(callUrl).toContain('translation.googleapis.com');
      // 密钥走请求头而非 URL query（防泄漏到访问日志）
      expect(callUrl).not.toContain('key=');
      const callHeaders = fetchMock.mock.calls[0][1]?.headers ?? {};
      expect(callHeaders['x-goog-api-key']).toBe('test-api-key');
    });

    test('空文本抛 EMPTY_TEXT', async () => {
      const translator = createTranslator(makeConfig());
      await expect(translator!.translate('')).rejects.toThrow(TranslationError);
      await expect(translator!.translate('')).rejects.toMatchObject({
        code: 'EMPTY_TEXT',
      });
    });

    test('API Key 缺失抛 API_KEY_MISSING', async () => {
      const translator = createTranslator(
        makeConfig({ apiKey: '' })
      );
      await expect(translator!.translate('test')).rejects.toMatchObject({
        code: 'API_KEY_MISSING',
      });
    });

    test('网络错误抛 NETWORK_ERROR', async () => {
      globalThis.fetch = mockFetchNetworkError('Connection failed') as unknown as typeof globalThis.fetch;
      const translator = createTranslator(makeConfig());
      await expect(translator!.translate('test')).rejects.toMatchObject({
        code: 'NETWORK_ERROR',
      });
    });

    test('429 状态码抛 RATE_LIMIT', async () => {
      globalThis.fetch = mockFetchResponse(429, { error: 'rate limited' }) as unknown as typeof globalThis.fetch;
      const translator = createTranslator(makeConfig());
      await expect(translator!.translate('test')).rejects.toMatchObject({
        code: 'RATE_LIMIT',
      });
    });

    test('403 状态码抛 API_KEY_MISSING', async () => {
      globalThis.fetch = mockFetchResponse(403, { error: 'forbidden' }) as unknown as typeof globalThis.fetch;
      const translator = createTranslator(makeConfig());
      await expect(translator!.translate('test')).rejects.toMatchObject({
        code: 'API_KEY_MISSING',
      });
    });

    test('其他错误状态码抛 API_ERROR', async () => {
      globalThis.fetch = mockFetchResponse(500, { error: 'server error' }) as unknown as typeof globalThis.fetch;
      const translator = createTranslator(makeConfig());
      await expect(translator!.translate('test')).rejects.toMatchObject({
        code: 'API_ERROR',
      });
    });

    test('响应格式异常抛 API_ERROR', async () => {
      globalThis.fetch = mockFetchResponse(200, { unexpected: 'format' }) as unknown as typeof globalThis.fetch;
      const translator = createTranslator(makeConfig());
      await expect(translator!.translate('test')).rejects.toMatchObject({
        code: 'API_ERROR',
      });
    });

    test('translateBatch 串行翻译', async () => {
      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(''),
          json: () =>
            Promise.resolve({
              data: {
                translations: [
                  { translatedText: `translation-${callCount}` },
                ],
              },
            }),
        });
      }) as unknown as typeof globalThis.fetch;

      const translator = createTranslator(makeConfig());
      const results = await translator!.translateBatch(['a', 'b', 'c']);

      expect(results).toHaveLength(3);
      expect(callCount).toBe(3);
      expect(results[0].translatedText).toBe('translation-1');
      expect(results[1].translatedText).toBe('translation-2');
    });

    test('translateBatch 空数组返回空数组', async () => {
      const translator = createTranslator(makeConfig());
      const results = await translator!.translateBatch([]);
      expect(results).toEqual([]);
    });

    test('translateBatch 单条失败不影响其他', async () => {
      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 2) {
          return Promise.resolve({
            ok: false,
            status: 500,
            text: () => Promise.resolve('error'),
            json: () => Promise.resolve({}),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(''),
          json: () =>
            Promise.resolve({
              data: { translations: [{ translatedText: 'ok' }] },
            }),
        });
      }) as unknown as typeof globalThis.fetch;

      const translator = createTranslator(makeConfig());
      const results = await translator!.translateBatch(['a', 'b', 'c']);
      expect(results).toHaveLength(3);
      expect(results[0].translatedText).toBe('ok');
      expect(results[1].translatedText).toContain('翻译失败');
      expect(results[2].translatedText).toBe('ok');
    });
  });

  describe('DeepLTranslator 翻译', () => {
    test('成功翻译返回 TranslationResult', async () => {
      const fetchMock = mockFetchResponse(200, {
        translations: [
          { text: 'Hello world', detected_source_language: 'ZH' },
        ],
      });
      globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

      // Free 账户 Key 以 :fx 结尾
      const translator = createTranslator(
        makeConfig({ provider: 'deepl', apiKey: 'test-api-key:fx' })
      );
      const result = await translator!.translate('你好世界');

      expect(result.translatedText).toBe('Hello world');
      expect(result.detectedSourceLang).toBe('zh');
      expect(result.provider).toBe('deepl');

      // 验证 fetch 调用
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      // Free 账户端点
      expect(url).toContain('api-free.deepl.com');
      // Authorization header
      expect((init as RequestInit).headers).toMatchObject({
        Authorization: 'DeepL-Auth-Key test-api-key:fx',
      });
    });

    test('Pro 账户端点（key 不以 :fx 结尾）', async () => {
      globalThis.fetch = mockFetchResponse(200, {
        translations: [{ text: 'ok' }],
      }) as unknown as typeof globalThis.fetch;

      const translator = createTranslator(
        makeConfig({ provider: 'deepl', apiKey: 'pro-key-123' })
      );
      await translator!.translate('test');

      const callUrl = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(callUrl).toContain('api.deepl.com');
      expect(callUrl).not.toContain('api-free');
    });

    test('自定义端点优先使用', async () => {
      globalThis.fetch = mockFetchResponse(200, {
        translations: [{ text: 'ok' }],
      }) as unknown as typeof globalThis.fetch;

      const translator = createTranslator(
        makeConfig({
          provider: 'deepl',
          endpoint: 'https://custom.deepl.com/translate',
        })
      );
      await translator!.translate('test');

      const callUrl = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(callUrl).toBe('https://custom.deepl.com/translate');
    });

    test('auto 模式不传 source_lang', async () => {
      const fetchMock = mockFetchResponse(200, {
        translations: [{ text: 'ok' }],
      });
      globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

      const translator = createTranslator(
        makeConfig({ provider: 'deepl', direction: 'auto' })
      );
      await translator!.translate('test');

      const init = fetchMock.mock.calls[0][1] as RequestInit;
      const body = init.body as string;
      // auto 模式下不包含 source_lang 参数
      expect(body).not.toContain('source_lang');
      expect(body).toContain('target_lang=ZH');
    });

    test('429 状态码抛 RATE_LIMIT', async () => {
      globalThis.fetch = mockFetchResponse(429, { error: 'rate' }) as unknown as typeof globalThis.fetch;
      const translator = createTranslator(makeConfig({ provider: 'deepl' }));
      await expect(translator!.translate('test')).rejects.toMatchObject({
        code: 'RATE_LIMIT',
      });
    });
  });

  describe('translateText 便捷方法', () => {
    test('未启用时抛 NOT_CONFIGURED', async () => {
      await expect(
        translateText('test', makeConfig({ enabled: false }))
      ).rejects.toMatchObject({ code: 'NOT_CONFIGURED' });
    });

    test('provider=none 抛 UNSUPPORTED_PROVIDER', async () => {
      await expect(
        translateText('test', makeConfig({ provider: 'none' }))
      ).rejects.toMatchObject({ code: 'UNSUPPORTED_PROVIDER' });
    });

    test('成功翻译返回结果', async () => {
      globalThis.fetch = mockFetchResponse(200, {
        data: { translations: [{ translatedText: 'ok' }] },
      }) as unknown as typeof globalThis.fetch;

      const result = await translateText('test', makeConfig());
      expect(result.translatedText).toBe('ok');
    });
  });

  describe('TranslationError 错误类型', () => {
    test('包含 code 属性', () => {
      const err = new TranslationError('test', 'API_ERROR');
      expect(err.code).toBe('API_ERROR');
      expect(err.message).toBe('test');
      expect(err.name).toBe('TranslationError');
    });
  });
});
