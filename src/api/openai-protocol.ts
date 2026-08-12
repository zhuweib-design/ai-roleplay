import type { ApiMessage } from './types';

/**
 * OpenAI 兼容协议辅助（迭代33：消除 openai-client / tauri-openai-client 重复）
 *
 * 两个客户端仅传输层不同（浏览器 fetch vs Rust reqwest），
 * URL 计算与消息转换逻辑完全一致，收拢在此避免改一处动两处。
 */

/** 计算 chat completions 端点 URL（支持三种 baseUrl 形态：裸域名 / 已含 /v1 / 已含完整路径） */
export function buildChatCompletionsUrl(baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  if (/\/chat\/completions$/.test(base)) return base;
  if (/\/v1$/.test(base)) return `${base}/chat/completions`;
  return `${base}/v1/chat/completions`;
}

/** 计算模型列表 URL（支持三种 baseUrl 形态：裸域名 / 已含 /v1 / 已含完整 chat/completions） */
export function buildModelsUrl(baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  if (/\/models$/.test(base)) return base;
  if (/\/chat\/completions$/.test(base)) {
    return base.replace(/\/chat\/completions$/, '/models');
  }
  if (/\/v1$/.test(base)) return `${base}/models`;
  return `${base}/v1/models`;
}

/** 核心消息 → OpenAI 兼容请求消息(T-02:支持 assistant.tool_calls 与 tool 角色消息) */
export function toOpenAIMessage(msg: ApiMessage): Record<string, unknown> {
  const out: Record<string, unknown> = { role: msg.role, content: msg.content };
  if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
    out.tool_calls = msg.toolCalls;
  }
  if (msg.role === 'tool') {
    out.tool_call_id = msg.toolCallId;
  }
  return out;
}

/**
 * Vite 开发服务器下,本地/内网 API 端点改写为同源代理路径 /llm-proxy/…,
 * 由 vite.config.ts 的 localProxyPlugin 转发到真实目标,绕过 CORS。
 *
 * - 同源请求直接返回,不走代理
 * - 云服务地址(api.openai.com 等)不受影响,直连
 * - 生产构建(import.meta.env.DEV = false)下始终直连
 * - Tauri 桌面版使用 Rust 网络栈,本方法不被调用
 *
 * (迭代 T-01:逻辑从 OpenAIClient.toProxyUrl 平移,AnthropicClient 共用)
 */
export function toDevProxyUrl(url: string): string {
  if (!import.meta.env.DEV || import.meta.env.MODE !== 'development') return url;
  if (typeof window === 'undefined') return url;
  try {
    const target = new URL(url);
    if (target.origin === window.location.origin) return url;
    const host = target.hostname;
    const isLocal =
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
    if (!isLocal) return url;
    return `/llm-proxy/${encodeURIComponent(url)}`;
  } catch {
    return url;
  }
}
