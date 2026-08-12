/**
 * 自动摘要单元测试 (迭代28 · F12.4)
 *
 * 覆盖：
 * - estimateMessagesTokens Token 估算
 * - shouldSummarize 触发判断
 * - buildSummarizationMessages Prompt 构建
 * - DefaultSummarizationService.summarize 流程
 * - injectSummary 摘要注入
 * - 错误处理（未启用/消息不足/API错误）
 *
 * 注：通过 mock ApiClient 模拟 API 调用
 */
import { describe, test, expect, vi } from 'vitest';
import {
  estimateMessagesTokens,
  shouldSummarize,
  buildSummarizationMessages,
  injectSummary,
  DEFAULT_SUMMARIZATION_CONFIG,
  DefaultSummarizationService,
  SummarizationError,
  type ConversationSummary,
  type SummarizationConfig,
} from '@core/summarizer';
import type { ChatMessage } from '@core/token-counter';
import type { ApiClient } from '../../src/api/api-client';
import type { ChatStream } from '../../src/api/types';

// ── Mock ApiClient ──

function makeMockApiClient(responseContent: string): ApiClient {
  return {
    chat: vi.fn().mockResolvedValue(responseContent),
    chatStream: vi.fn((): ChatStream => {
      throw new Error('not used');
    }),
  } as unknown as ApiClient;
}

function makeFailingApiClient(error: Error): ApiClient {
  return {
    chat: vi.fn().mockRejectedValue(error),
    chatStream: vi.fn((): ChatStream => {
      throw new Error('not used');
    }),
  } as unknown as ApiClient;
}

// ── 测试夹具 ──

function makeMessage(
  role: 'user' | 'assistant' | 'system',
  content: string
): ChatMessage {
  return { role, content };
}

function makeDialogMessages(count: number): ChatMessage[] {
  const messages: ChatMessage[] = [];
  for (let i = 0; i < count; i++) {
    messages.push({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `这是第 ${i + 1} 条消息的内容`,
    });
  }
  return messages;
}

function makeSummary(overrides: Partial<ConversationSummary> = {}): ConversationSummary {
  return {
    content: '前文摘要内容',
    lastCoveredMessageIndex: 9,
    coveredMessageCount: 10,
    createdAt: Date.now(),
    tokenCount: 100,
    ...overrides,
  };
}

// ── 测试用例 ──

describe('summarizer (F12.4)', () => {
  describe('estimateMessagesTokens Token 估算', () => {
    test('空消息列表 Token 数为 3（仅对话开销）', () => {
      expect(estimateMessagesTokens([])).toBe(3);
    });

    test('单条消息包含内容 Token + 角色开销', () => {
      const tokens = estimateMessagesTokens([
        makeMessage('user', '你好'),
      ]);
      // 内容 Token + 1（role 开销）+ 3（对话开销）
      expect(tokens).toBeGreaterThan(3);
    });

    test('多条消息 Token 累加', () => {
      const one = estimateMessagesTokens([makeMessage('user', '你好')]);
      const two = estimateMessagesTokens([
        makeMessage('user', '你好'),
        makeMessage('assistant', '你好'),
      ]);
      expect(two).toBeGreaterThan(one);
    });

    test('system 消息也参与计算', () => {
      const tokens = estimateMessagesTokens([
        makeMessage('system', '系统消息'),
      ]);
      expect(tokens).toBeGreaterThan(3);
    });
  });

  describe('shouldSummarize 触发判断', () => {
    test('未启用时返回 false', () => {
      const messages = makeDialogMessages(30);
      const config: SummarizationConfig = {
        ...DEFAULT_SUMMARIZATION_CONFIG,
        enabled: false,
      };
      expect(shouldSummarize(messages, config, null)).toBe(false);
    });

    test('消息不足 keepRecent*2 时返回 false', () => {
      const messages = makeDialogMessages(5);
      const config: SummarizationConfig = {
        ...DEFAULT_SUMMARIZATION_CONFIG,
        keepRecent: 10,
      };
      // 5 < 10*2 = 20
      expect(shouldSummarize(messages, config, null)).toBe(false);
    });

    test('消息超过阈值时返回 true', () => {
      // 构造大量长消息触发阈值
      const messages: ChatMessage[] = [];
      for (let i = 0; i < 30; i++) {
        messages.push({
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: '长内容'.repeat(100), // 约 400 Token/条
        });
      }
      const config: SummarizationConfig = {
        ...DEFAULT_SUMMARIZATION_CONFIG,
        threshold: 4000,
        keepRecent: 10,
      };
      expect(shouldSummarize(messages, config, null)).toBe(true);
    });

    test('已有摘要时计算未被覆盖的消息', () => {
      const messages: ChatMessage[] = [];
      for (let i = 0; i < 30; i++) {
        messages.push({
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: '长内容'.repeat(100),
        });
      }
      const config: SummarizationConfig = {
        ...DEFAULT_SUMMARIZATION_CONFIG,
        threshold: 4000,
        keepRecent: 10,
      };
      const existingSummary = makeSummary({
        lastCoveredMessageIndex: 25, // 已覆盖前 26 条
      });
      // 未覆盖的消息只有 4 条，可能不足以触发
      // 实际：30 条对话 - 26 已覆盖 = 4 条未覆盖，远低于阈值
      const result = shouldSummarize(messages, config, existingSummary);
      // 4 条消息约 1600 Token，低于 4000 阈值
      expect(result).toBe(false);
    });

    test('阈值较高时不触发', () => {
      const messages = makeDialogMessages(25);
      const config: SummarizationConfig = {
        ...DEFAULT_SUMMARIZATION_CONFIG,
        threshold: 100000, // 极高阈值
      };
      expect(shouldSummarize(messages, config, null)).toBe(false);
    });
  });

  describe('buildSummarizationMessages Prompt 构建', () => {
    test('返回 system + user 两条消息', () => {
      const messages = makeDialogMessages(5);
      const result = buildSummarizationMessages(messages, null, DEFAULT_SUMMARIZATION_CONFIG);
      expect(result).toHaveLength(2);
      expect(result[0].role).toBe('system');
      expect(result[1].role).toBe('user');
    });

    test('无现有摘要时使用"首次生成"Prompt', () => {
      const messages = makeDialogMessages(5);
      const result = buildSummarizationMessages(messages, null, DEFAULT_SUMMARIZATION_CONFIG);
      expect(result[1].content).toContain('压缩为摘要');
      expect(result[1].content).not.toContain('已有摘要');
    });

    test('有现有摘要时使用"增量更新"Prompt', () => {
      const messages = makeDialogMessages(5);
      const existing = makeSummary({ content: '之前的摘要内容' });
      const result = buildSummarizationMessages(messages, existing, DEFAULT_SUMMARIZATION_CONFIG);
      expect(result[1].content).toContain('已有摘要');
      expect(result[1].content).toContain('之前的摘要内容');
    });

    test('包含对话内容', () => {
      const messages = [
        makeMessage('user', '用户消息内容'),
        makeMessage('assistant', 'AI 回复内容'),
      ];
      const result = buildSummarizationMessages(messages, null, DEFAULT_SUMMARIZATION_CONFIG);
      expect(result[1].content).toContain('用户消息内容');
      expect(result[1].content).toContain('AI 回复内容');
    });

    test('包含 maxSummaryTokens 约束', () => {
      const messages = makeDialogMessages(3);
      const config: SummarizationConfig = {
        ...DEFAULT_SUMMARIZATION_CONFIG,
        maxSummaryTokens: 300,
      };
      const result = buildSummarizationMessages(messages, null, config);
      expect(result[1].content).toContain('300');
    });

    test('消息角色转换为中文标签', () => {
      const messages = [
        makeMessage('user', '你好'),
        makeMessage('assistant', '你好'),
      ];
      const result = buildSummarizationMessages(messages, null, DEFAULT_SUMMARIZATION_CONFIG);
      expect(result[1].content).toContain('用户');
      expect(result[1].content).toContain('AI');
    });
  });

  describe('injectSummary 摘要注入', () => {
    test('在第一条非 system 消息前插入摘要', () => {
      const messages: ChatMessage[] = [
        makeMessage('system', '系统提示'),
        makeMessage('user', '你好'),
        makeMessage('assistant', '你好啊'),
      ];
      const summary = makeSummary({ content: '前文摘要' });
      const result = injectSummary(messages, summary);
      expect(result).toHaveLength(4);
      // 第一条仍是原 system
      expect(result[0].content).toBe('系统提示');
      // 第二条是注入的摘要
      expect(result[1].role).toBe('system');
      expect(result[1].content).toContain('前文摘要');
      expect(result[1].content).toContain('前文摘要');
      // 第三条是原 user
      expect(result[2].content).toBe('你好');
    });

    test('无 system 消息时摘要插入到开头', () => {
      const messages: ChatMessage[] = [
        makeMessage('user', '你好'),
        makeMessage('assistant', '你好啊'),
      ];
      const summary = makeSummary({ content: '摘要' });
      const result = injectSummary(messages, summary);
      expect(result).toHaveLength(3);
      expect(result[0].role).toBe('system');
      expect(result[0].content).toContain('摘要');
      expect(result[1].content).toBe('你好');
    });

    test('全 system 消息时摘要追加到末尾', () => {
      const messages: ChatMessage[] = [
        makeMessage('system', '系统1'),
      ];
      const summary = makeSummary({ content: '摘要' });
      const result = injectSummary(messages, summary);
      expect(result).toHaveLength(2);
      expect(result[0].content).toBe('系统1');
      expect(result[1].content).toContain('摘要');
    });

    test('空消息列表仍可注入', () => {
      const summary = makeSummary({ content: '摘要' });
      const result = injectSummary([], summary);
      expect(result).toHaveLength(1);
      expect(result[0].content).toContain('摘要');
    });

    test('注入消息包含【前文摘要】标记', () => {
      const result = injectSummary(
        [makeMessage('user', '你好')],
        makeSummary({ content: '摘要内容' })
      );
      expect(result[0].content).toContain('【前文摘要】');
    });
  });

  describe('DefaultSummarizationService', () => {
    test('成功生成摘要', async () => {
      const apiClient = makeMockApiClient('这是生成的摘要内容');
      const service = new DefaultSummarizationService(apiClient, 'gpt-4o');

      const messages = makeDialogMessages(15);
      const config: SummarizationConfig = {
        ...DEFAULT_SUMMARIZATION_CONFIG,
        keepRecent: 5,
      };
      const result = await service.summarize(messages, config, null);

      expect(result.content).toBe('这是生成的摘要内容');
      expect(result.lastCoveredMessageIndex).toBeGreaterThanOrEqual(0);
      expect(result.coveredMessageCount).toBeGreaterThan(0);
      expect(result.createdAt).toBeGreaterThan(0);
      expect(result.tokenCount).toBeGreaterThan(0);
    });

    test('未启用抛 NOT_ENABLED', async () => {
      const apiClient = makeMockApiClient('ok');
      const service = new DefaultSummarizationService(apiClient, 'gpt-4o');

      const config: SummarizationConfig = {
        ...DEFAULT_SUMMARIZATION_CONFIG,
        enabled: false,
      };
      await expect(service.summarize([], config, null)).rejects.toMatchObject({
        code: 'NOT_ENABLED',
      });
    });

    test('消息不足抛 INSUFFICIENT_MESSAGES', async () => {
      const apiClient = makeMockApiClient('ok');
      const service = new DefaultSummarizationService(apiClient, 'gpt-4o');

      const messages = makeDialogMessages(3);
      const config: SummarizationConfig = {
        ...DEFAULT_SUMMARIZATION_CONFIG,
        keepRecent: 10, // 3 - 10 < 0, 无可摘要消息
      };
      await expect(service.summarize(messages, config, null)).rejects.toMatchObject({
        code: 'INSUFFICIENT_MESSAGES',
      });
    });

    test('API 错误抛 API_ERROR', async () => {
      const apiClient = makeFailingApiClient(new Error('API 调用失败'));
      const service = new DefaultSummarizationService(apiClient, 'gpt-4o');

      const messages = makeDialogMessages(15);
      const config: SummarizationConfig = {
        ...DEFAULT_SUMMARIZATION_CONFIG,
        keepRecent: 5,
      };
      await expect(service.summarize(messages, config, null)).rejects.toMatchObject({
        code: 'API_ERROR',
      });
    });

    test('返回空内容抛 PARSE_ERROR', async () => {
      const apiClient = makeMockApiClient('   ');
      const service = new DefaultSummarizationService(apiClient, 'gpt-4o');

      const messages = makeDialogMessages(15);
      const config: SummarizationConfig = {
        ...DEFAULT_SUMMARIZATION_CONFIG,
        keepRecent: 5,
      };
      await expect(service.summarize(messages, config, null)).rejects.toMatchObject({
        code: 'PARSE_ERROR',
      });
    });

    test('增量更新时累加 coveredMessageCount', async () => {
      const apiClient = makeMockApiClient('更新后的摘要');
      const service = new DefaultSummarizationService(apiClient, 'gpt-4o');

      const messages = makeDialogMessages(20);
      const config: SummarizationConfig = {
        ...DEFAULT_SUMMARIZATION_CONFIG,
        keepRecent: 5,
      };
      const existing = makeSummary({
        lastCoveredMessageIndex: 9,
        coveredMessageCount: 10,
      });
      const result = await service.summarize(messages, config, existing);
      // 新摘要覆盖 5 条（10-14），累计 15 条
      expect(result.coveredMessageCount).toBe(15);
    });

    test('调用 API 时传入正确的 model/temperature/maxTokens', async () => {
      const apiClient = makeMockApiClient('ok');
      const service = new DefaultSummarizationService(apiClient, 'gpt-4');

      const messages = makeDialogMessages(15);
      const config: SummarizationConfig = {
        ...DEFAULT_SUMMARIZATION_CONFIG,
        keepRecent: 5,
        temperature: 0.5,
        maxSummaryTokens: 400,
      };
      await service.summarize(messages, config, null);

      const callArgs = (apiClient.chat as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(callArgs.model).toBe('gpt-4');
      expect(callArgs.temperature).toBe(0.5);
      expect(callArgs.maxTokens).toBe(400);
    });
  });

  describe('DEFAULT_SUMMARIZATION_CONFIG', () => {
    test('默认启用', () => {
      expect(DEFAULT_SUMMARIZATION_CONFIG.enabled).toBe(true);
    });

    test('默认阈值 4000', () => {
      expect(DEFAULT_SUMMARIZATION_CONFIG.threshold).toBe(4000);
    });

    test('默认保留最近 10 条', () => {
      expect(DEFAULT_SUMMARIZATION_CONFIG.keepRecent).toBe(10);
    });

    test('默认摘要 Token 500', () => {
      expect(DEFAULT_SUMMARIZATION_CONFIG.maxSummaryTokens).toBe(500);
    });

    test('默认温度 0.3', () => {
      expect(DEFAULT_SUMMARIZATION_CONFIG.temperature).toBe(0.3);
    });
  });

  describe('SummarizationError', () => {
    test('包含 code 属性', () => {
      const err = new SummarizationError('msg', 'API_ERROR');
      expect(err.code).toBe('API_ERROR');
      expect(err.message).toBe('msg');
      expect(err.name).toBe('SummarizationError');
    });
  });
});
