/**
 * 内置工具注册表 (T-02)
 *
 * 提供开箱即用的 LLM 工具调用集,由 ChatManager 装配:
 * - get_var / set_var:读写全局变量(对接 variable-store)
 * - search_lorebook:世界书关键词搜索(注入回调,由 chat store 装配)
 * - retrieve_document:资料库文档检索(注入回调,由 chat store 装配)
 *
 * 执行器不直接依赖 core 模块(避免循环依赖),上下文通过回调注入;
 * 回调未注入时返回明确的"不可用"提示,模型可据此向用户说明。
 */

import type { ToolCall, ToolDefinition } from '@api/types';

/** 工具执行上下文(由装配方注入) */
export interface ToolExecutionContext {
  /** 读取全局变量 */
  getVariable?: (name: string) => string | undefined;
  /** 设置全局变量 */
  setVariable?: (name: string, value: string) => void;
  /** 世界书关键词搜索,返回激活条目文本 */
  searchLorebook?: (query: string) => string | Promise<string>;
  /** 资料库文档检索,返回检索结果文本 */
  retrieveDocuments?: (query: string, limit?: number) => string | Promise<string>;
}

const VAR_PARAMS = {
  type: 'object',
  properties: { name: { type: 'string', description: '变量名' } },
  required: ['name'],
} as const;

const SET_VAR_PARAMS = {
  type: 'object',
  properties: {
    name: { type: 'string', description: '变量名' },
    value: { type: 'string', description: '变量值' },
  },
  required: ['name', 'value'],
} as const;

const QUERY_PARAMS = {
  type: 'object',
  properties: { query: { type: 'string', description: '搜索关键词' } },
  required: ['query'],
} as const;

/** 内置工具定义(不可变) */
const BUILTIN_TOOL_DEFINITIONS: readonly ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'get_var',
      description: '读取全局变量的当前值。用于在对话中获取之前保存的状态信息。',
      parameters: VAR_PARAMS as unknown as Record<string, unknown>,
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_var',
      description: '设置全局变量的值,可跨轮次持久保存状态。',
      parameters: SET_VAR_PARAMS as unknown as Record<string, unknown>,
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_lorebook',
      description: '在世界书设定中搜索与关键词相关的条目,获取世界观、角色背景等权威信息。',
      parameters: QUERY_PARAMS as unknown as Record<string, unknown>,
    },
  },
  {
    type: 'function',
    function: {
      name: 'retrieve_document',
      description: '从资料库中检索与问题相关的文档段落(支持限定返回条数)。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '检索关键词或问题' },
          limit: { type: 'number', description: '最大返回段落数(默认 3)' },
        },
        required: ['query'],
      },
    },
  },
];

/** 获取内置工具定义列表 */
export function getBuiltinToolDefinitions(): ToolDefinition[] {
  return [...BUILTIN_TOOL_DEFINITIONS];
}

/** 安全解析工具参数 JSON,失败返回空对象 */
export function parseToolArguments(argumentsJson: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(argumentsJson || '{}');
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

/**
 * 执行内置工具
 * @returns 工具结果文本(成功或错误说明,供模型续答)
 */
export async function executeBuiltinTool(
  call: ToolCall,
  ctx: ToolExecutionContext
): Promise<string> {
  const args = parseToolArguments(call.function.arguments);
  const name = call.function.name;

  switch (name) {
    case 'get_var': {
      const key = String(args.name ?? '');
      if (!key) return '错误:缺少 name 参数';
      if (!ctx.getVariable) return 'get_var 不可用(未注入变量上下文)';
      const value = ctx.getVariable(key);
      return value === undefined ? `变量 ${key} 不存在` : String(value);
    }
    case 'set_var': {
      const key = String(args.name ?? '');
      const value = String(args.value ?? '');
      if (!key) return '错误:缺少 name 参数';
      if (!ctx.setVariable) return 'set_var 不可用(未注入变量上下文)';
      ctx.setVariable(key, value);
      return `已设置变量 ${key} = ${value}`;
    }
    case 'search_lorebook': {
      const query = String(args.query ?? '');
      if (!query) return '错误:缺少 query 参数';
      if (!ctx.searchLorebook) return 'search_lorebook 不可用(未注入世界书上下文)';
      return String(await ctx.searchLorebook(query));
    }
    case 'retrieve_document': {
      const query = String(args.query ?? '');
      if (!query) return '错误:缺少 query 参数';
      if (!ctx.retrieveDocuments) return 'retrieve_document 不可用(未注入资料库上下文)';
      const limit = typeof args.limit === 'number' ? args.limit : undefined;
      return String(await ctx.retrieveDocuments(query, limit));
    }
    default:
      return `错误:未知工具 ${name}`;
  }
}
