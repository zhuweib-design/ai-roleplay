import { describe, it, expect } from 'vitest';
import { ApiError } from '@api/types';
import { diagnoseError, diagnoseApiError, diagnoseUnknownError } from '@api/diagnostics';

describe('ApiErrorDiagnostics', () => {
  describe('diagnoseApiError', () => {
    it('应正确诊断 network 错误并给出修复建议', () => {
      const err = new ApiError(
        '网络请求失败：Failed to fetch',
        undefined,
        'openai',
        'network'
      );
      const d = diagnoseApiError(err);
      expect(d.kind).toBe('network');
      expect(d.title).toBe('网络请求失败');
      expect(d.description).toBe('网络请求失败：Failed to fetch');
      expect(d.suggestions.length).toBeGreaterThan(0);
      expect(d.suggestions.some((s) => s.includes('CORS'))).toBe(true);
    });

    it('应正确诊断 auth 错误', () => {
      const err = new ApiError('API 错误 401: Invalid API Key', 401, 'openai', 'auth');
      const d = diagnoseApiError(err);
      expect(d.kind).toBe('auth');
      expect(d.title).toBe('API Key 未授权');
      expect(d.suggestions.some((s) => s.includes('API Key'))).toBe(true);
    });

    it('应正确诊断 rate-limit 错误', () => {
      const err = new ApiError('API 错误 429: Too Many Requests', 429, 'openai', 'rate-limit');
      const d = diagnoseApiError(err);
      expect(d.kind).toBe('rate-limit');
      expect(d.title).toBe('调用频率超限');
    });

    it('应正确诊断 server 错误', () => {
      const err = new ApiError('API 错误 500: Internal Server Error', 500, 'openai', 'server');
      const d = diagnoseApiError(err);
      expect(d.kind).toBe('server');
      expect(d.title).toBe('API 服务器错误');
    });

    it('应正确诊断 invalid-url 错误', () => {
      const err = new ApiError('URL 格式错误：invalid', undefined, 'openai', 'invalid-url');
      const d = diagnoseApiError(err);
      expect(d.kind).toBe('invalid-url');
      expect(d.title).toBe('API 地址格式错误');
      expect(d.suggestions.some((s) => s.includes('https'))).toBe(true);
    });

    it('应正确诊断 aborted 错误', () => {
      const err = new ApiError('已停止生成', undefined, 'openai', 'aborted');
      const d = diagnoseApiError(err);
      expect(d.kind).toBe('aborted');
      expect(d.title).toBe('已停止生成');
    });

    it('应正确诊断 cors 错误', () => {
      const err = new ApiError('跨域被拦截', undefined, 'openai', 'cors');
      const d = diagnoseApiError(err);
      expect(d.kind).toBe('cors');
      expect(d.title).toBe('跨域请求被拦截');
      expect(d.suggestions.some((s) => s.includes('Tauri'))).toBe(true);
    });

    it('应正确诊断 unknown 错误', () => {
      const err = new ApiError('未知错误', undefined, 'openai', 'unknown');
      const d = diagnoseApiError(err);
      expect(d.kind).toBe('unknown');
      expect(d.title).toBe('未知错误');
      expect(d.suggestions.length).toBeGreaterThan(0);
    });
  });

  describe('diagnoseUnknownError', () => {
    it('应将普通 Error 诊断为 unknown 类型', () => {
      const err = new Error('一些奇怪的错误');
      const d = diagnoseUnknownError(err);
      expect(d.kind).toBe('unknown');
      expect(d.description).toBe('一些奇怪的错误');
    });
  });

  describe('diagnoseError（统一入口）', () => {
    it('应识别 ApiError 并返回精确诊断', () => {
      const err = new ApiError('403 Forbidden', 403, 'openai', 'auth');
      const d = diagnoseError(err);
      expect(d.kind).toBe('auth');
      expect(d.title).toBe('API Key 未授权');
    });

    it('应将普通 Error 兜底为 unknown', () => {
      const err = new Error('RuntimeError');
      const d = diagnoseError(err);
      expect(d.kind).toBe('unknown');
    });

    it('应将非 Error 对象兜底为 unknown', () => {
      const d = diagnoseError('字符串错误');
      expect(d.kind).toBe('unknown');
      expect(d.description).toBe('字符串错误');
    });

    it('应将 null/undefined 兜底为 unknown', () => {
      const d = diagnoseError(null);
      expect(d.kind).toBe('unknown');
    });
  });
});
