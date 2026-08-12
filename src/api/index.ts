export type {
  ApiRole,
  ApiMessage,
  ChatRequest,
  ChatStream,
  ChatStreamEvent,
  ChatStreamEventType,
} from './types';
export { ApiError } from './types';
export type { ApiClient } from './api-client';
export { mergeDefaultParams, summarizeMessages } from './api-client';
export { OpenAIClient } from './openai-client';
export { AnthropicClient } from './anthropic-client';
export { TauriOpenAIClient } from './tauri-openai-client';
export { LocalApiClient } from './local-api-client';
import type { ApiProfile } from '@/types';
import { OpenAIClient } from './openai-client';
import { AnthropicClient } from './anthropic-client';
import { TauriOpenAIClient } from './tauri-openai-client';
import { LocalApiClient } from './local-api-client';
import type { ApiClient } from './api-client';

/**
 * 根据 API Profile 创建对应的 ApiClient 实例 (F02.2 工厂，Phase H4 更新)
 *
 * 运行时根据环境自动选择实现：
 * - provider === 'local' → LocalApiClient（浏览器内 WebLLM 本地推理）
 * - Tauri 环境（window.__TAURI_INTERNALS__ 存在）→ TauriOpenAIClient
 *   使用 Rust reqwest 建立 SSE 连接，绕过浏览器 CORS 限制
 * - 浏览器环境 → OpenAIClient
 *   使用 fetch + ReadableStream，受 CORS 限制但无需 Tauri 运行时
 *
 * 当前所有云端 provider（openai / anthropic / custom / deepseek）均使用
 * OpenAI 兼容协议（OpenAI Chat Completions API 协议为事实标准）。
 *
 * @param profile API Profile 配置（来自 settings store）
 * @returns ApiClient 实例
 */
export function createApiClient(profile: ApiProfile): ApiClient {
  // 第9条：本地模型（WebLLM 浏览器推理）走独立客户端
  if (profile.provider === 'local') {
    return new LocalApiClient(profile.model);
  }

  // T-01：Anthropic 原生 Messages API（浏览器 fetch 直连，官方支持 CORS，
  // Web 与 Tauri 环境通用；无需走 Rust reqwest 传输层）
  if (profile.provider === 'anthropic') {
    return new AnthropicClient({
      baseUrl: profile.baseUrl,
      apiKey: profile.apiKey,
    });
  }

  // 其余 provider（openai / custom / deepseek）均使用 OpenAI 兼容协议。

  if (TauriOpenAIClient.isTauriEnv()) {
    // Tauri 桌面应用环境：使用 Rust reqwest 原生 SSE
    return new TauriOpenAIClient({
      baseUrl: profile.baseUrl,
      apiKey: profile.apiKey,
    });
  }

  // Web 降级：浏览器环境使用 fetch + ReadableStream
  return new OpenAIClient({
    baseUrl: profile.baseUrl,
    apiKey: profile.apiKey,
  });
}
