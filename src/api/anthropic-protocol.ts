import type { ApiMessage, ToolDefinition } from './types';

/**
 * Anthropic Messages API 协议辅助 (T-01 / T-02)
 *
 * 官方协议:POST https://api.anthropic.com/v1/messages
 * 与 OpenAI 兼容协议的差异:
 * - 认证头为 x-api-key + anthropic-version,而非 Authorization: Bearer
 * - system 是顶层参数,不是消息角色
 * - max_tokens 为必填字段
 * - 消息角色仅 user / assistant 两种,且必须交替(相邻同角色需合并)
 * - 工具调用:assistant 侧为 content 数组中的 tool_use block,
 *   工具结果为 user 侧 content 数组中的 tool_result block
 */

/** 计算 Messages 端点 URL(支持三种形态:裸域名 / 已含 /v1 / 已含完整 /v1/messages) */
export function buildMessagesUrl(baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  if (/\/messages$/.test(base)) return base;
  if (/\/v1$/.test(base)) return `${base}/messages`;
  return `${base}/v1/messages`;
}

/** 计算模型列表 URL(GET /v1/models,Anthropic 2024-05 起支持) */
export function buildAnthropicModelsUrl(baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  if (/\/models$/.test(base)) return base;
  if (/\/messages$/.test(base)) return base.replace(/\/messages$/, '/models');
  if (/\/v1$/.test(base)) return `${base}/models`;
  return `${base}/v1/models`;
}

/** Anthropic content block(文本 / 工具调用 / 工具结果) */
export type AnthropicBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: string };

/** Anthropic Messages 请求的消息结构 */
export interface AnthropicRequestParts {
  /** 顶层 system 参数(多条 system 拼接) */
  system?: string;
  messages: Array<{ role: 'user' | 'assistant'; content: AnthropicBlock[] }>;
}

/**
 * 核心消息 → Anthropic Messages 格式:
 * - system 角色提取为顶层 system 参数(多条用空行拼接)
 * - assistant.toolCalls → content 数组中的 tool_use block(input 容错 JSON.parse)
 * - role='tool' 消息 → user 角色的 tool_result block
 * - 相邻同角色消息合并(content 数组 concat,协议要求 roles 交替)
 */
export function toAnthropicMessages(msgs: ApiMessage[]): AnthropicRequestParts {
  const systemParts: string[] = [];
  const rest: Array<{ role: 'user' | 'assistant'; content: AnthropicBlock[] }> = [];

  for (const m of msgs) {
    if (m.role === 'system') {
      systemParts.push(m.content);
      continue;
    }

    let role: 'user' | 'assistant';
    let blocks: AnthropicBlock[];

    if (m.role === 'tool') {
      // tool 消息 → user 角色的 tool_result block
      role = 'user';
      blocks = [{ type: 'tool_result', tool_use_id: m.toolCallId ?? '', content: m.content }];
    } else {
      role = m.role === 'assistant' ? 'assistant' : 'user';
      blocks = m.content ? [{ type: 'text', text: m.content }] : [];
      if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
        for (const tc of m.toolCalls) {
          let input: unknown = {};
          try {
            input = JSON.parse(tc.function.arguments || '{}');
          } catch {
            input = {};
          }
          blocks.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.function.name,
            input,
          });
        }
      }
    }

    const prev = rest[rest.length - 1];
    if (prev && prev.role === role) {
      prev.content.push(...blocks);
    } else {
      rest.push({ role, content: blocks });
    }
  }

  return {
    ...(systemParts.length > 0 ? { system: systemParts.join('\n\n') } : {}),
    messages: rest,
  };
}

/**
 * OpenAI 风格工具定义 → Anthropic 工具定义
 * OpenAI: { type:'function', function:{ name, description, parameters } }
 * Anthropic: { name, description, input_schema }
 */
export function toAnthropicTools(
  tools: ToolDefinition[]
): Array<{ name: string; description?: string; input_schema: Record<string, unknown> }> {
  return tools.map((t) => ({
    name: t.function.name,
    ...(t.function.description ? { description: t.function.description } : {}),
    input_schema: t.function.parameters ?? { type: 'object', properties: {} },
  }));
}
