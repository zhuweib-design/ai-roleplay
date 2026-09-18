import { describe, it, expect } from 'vitest';
import { ApiError } from '@/api/types';
import { analyzeChatError, chatErrorI18n } from '@/services/chat-error';

// 注：本测试环境为 jsdom（非 Tauri），isTauriEnv() 恒为 false，故 transport 仅 browser/local。
// local 由错误标记（web-llm / onnx / 本地模型）推断。

describe('chatErrorI18n (F-1 文案矩阵)', () => {
  it('aborted → 保留已停止生成语义', () => {
    const err = new Error('AbortError');
    err.name = 'AbortError';
    expect(chatErrorI18n(err)).toEqual({ key: 'char.stoppedGen2' });
    expect(analyzeChatError(err).type).toBe('aborted');
  });

  it('browser + cors → 跨域专用文案', () => {
    const err = new ApiError('blocked by CORS policy', undefined, 'openai', 'cors');
    expect(chatErrorI18n(err).key).toBe('chat.errCors');
    expect(analyzeChatError(err).transport).toBe('browser');
  });

  it('kind=cors 经消息匹配也被识别为 cors', () => {
    const err = new Error('Access blocked by CORS policy');
    expect(chatErrorI18n(err).key).toBe('chat.errCors');
  });

  it('local 模型错误 → 本地模型文案', () => {
    const err = new Error('web-llm failed to load model weights');
    expect(chatErrorI18n(err).key).toBe('chat.errLocal');
    expect(analyzeChatError(err).transport).toBe('local');
  });

  it('browser + api → 带 HTTP 状态', () => {
    const err = new ApiError('Unauthorized', 401, 'openai', 'auth');
    const res = chatErrorI18n(err);
    expect(res.key).toBe('chat.errApi');
    expect(res.params).toEqual({ status: '401' });
  });

  it('browser + network → 网络文案', () => {
    const err = new ApiError('network request failed', undefined, 'openai', 'network');
    expect(chatErrorI18n(err).key).toBe('chat.errNet');
  });

  it('未知错误 → 兜底裸消息', () => {
    const err = new Error('something weird happened');
    const res = chatErrorI18n(err);
    expect(res.key).toBe('chat.errUnknown');
    expect(res.params).toEqual({ error: 'something weird happened' });
  });
});
