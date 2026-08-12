import { describe, it, expect } from 'vitest';
import {
  getBuiltinToolDefinitions,
  parseToolArguments,
  executeBuiltinTool,
} from '@core/tool-registry';
import type { ToolCall } from '@api/types';

function call(name: string, argsJson: string, id = 'call_test'): ToolCall {
  return { id, type: 'function', function: { name, arguments: argsJson } };
}

describe('tool-registry (T-02)', () => {
  describe('getBuiltinToolDefinitions', () => {
    it('应返回 4 个内置工具', () => {
      const defs = getBuiltinToolDefinitions();
      expect(defs.map((d) => d.function.name)).toEqual([
        'get_var',
        'set_var',
        'search_lorebook',
        'retrieve_document',
      ]);
      expect(defs.every((d) => d.type === 'function')).toBe(true);
    });
  });

  describe('parseToolArguments', () => {
    it('应解析合法 JSON', () => {
      expect(parseToolArguments('{"name":"hp"}')).toEqual({ name: 'hp' });
    });
    it('空字符串返回空对象', () => {
      expect(parseToolArguments('')).toEqual({});
    });
    it('非法 JSON 返回空对象', () => {
      expect(parseToolArguments('{bad json')).toEqual({});
    });
    it('非对象 JSON(数组/标量)返回空对象', () => {
      expect(parseToolArguments('[1,2]')).toEqual({});
      expect(parseToolArguments('42')).toEqual({});
    });
  });

  describe('executeBuiltinTool', () => {
    it('get_var:变量存在时返回值', async () => {
      const r = await executeBuiltinTool(call('get_var', '{"name":"hp"}'), {
        getVariable: (n) => (n === 'hp' ? '100' : undefined),
      });
      expect(r).toBe('100');
    });

    it('get_var:变量不存在时提示', async () => {
      const r = await executeBuiltinTool(call('get_var', '{"name":"nope"}'), {
        getVariable: () => undefined,
      });
      expect(r).toBe('变量 nope 不存在');
    });

    it('get_var:缺少参数报错', async () => {
      const r = await executeBuiltinTool(call('get_var', '{}'), {});
      expect(r).toBe('错误:缺少 name 参数');
    });

    it('set_var:调用注入的回调并返回确认', async () => {
      let saved: { key: string; value: string } | null = null;
      const r = await executeBuiltinTool(call('set_var', '{"name":"gold","value":"50"}'), {
        setVariable: (k, v) => {
          saved = { key: k, value: v };
        },
      });
      expect(saved).toEqual({ key: 'gold', value: '50' });
      expect(r).toBe('已设置变量 gold = 50');
    });

    it('search_lorebook:注入回调时返回搜索结果', async () => {
      const r = await executeBuiltinTool(call('search_lorebook', '{"query":"龙族"}'), {
        searchLorebook: (q) => `找到条目:${q}`,
      });
      expect(r).toBe('找到条目:龙族');
    });

    it('search_lorebook:未注入回调时提示不可用', async () => {
      const r = await executeBuiltinTool(call('search_lorebook', '{"query":"龙族"}'), {});
      expect(r).toContain('不可用');
    });

    it('retrieve_document:传递 limit 参数', async () => {
      let received: { q: string; limit?: number } | null = null;
      const r = await executeBuiltinTool(
        call('retrieve_document', '{"query":"世界树","limit":5}'),
        {
          retrieveDocuments: (q, limit) => {
            received = { q, limit };
            return '段落内容';
          },
        }
      );
      expect(received).toEqual({ q: '世界树', limit: 5 });
      expect(r).toBe('段落内容');
    });

    it('未知工具返回错误提示', async () => {
      const r = await executeBuiltinTool(call('nope_tool', '{}'), {});
      expect(r).toBe('错误:未知工具 nope_tool');
    });
  });
});
