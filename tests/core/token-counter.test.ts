import { describe, test, expect } from 'vitest';
import { countTokens, countMessageTokens } from '@core/token-counter';
import type { ChatMessage } from '@core/token-counter';

// P1-3: countTokens/countMessageTokens 已 async(懒加载 gpt-tokenizer), 测试全部 await
describe('Token 计数 (F03.2)', () => {
  test('空文本返回 0', async () => {
    expect(await countTokens('')).toBe(0);
  });

  test('英文文本返回合理 Token 数', async () => {
    const text = 'Hello, world!';
    const tokens = await countTokens(text);
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBeLessThan(10);
  });

  test('长文本 Token 数多于短文本', async () => {
    const shortText = 'Hello';
    const longText = 'Hello, this is a much longer sentence with many more words.';
    expect(await countTokens(longText)).toBeGreaterThan(await countTokens(shortText));
  });

  test('中文文本返回合理 Token 数', async () => {
    const text = '你好，世界！';
    const tokens = await countTokens(text);
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBeLessThan(20);
  });

  test('Chat Completion 消息列表 Token 计数包含开销', async () => {
    const messages: ChatMessage[] = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hello!' },
    ];
    const tokens = await countMessageTokens(messages);
    // 消息格式有额外 Token 开销（每条消息约 4 Token）
    expect(tokens).toBeGreaterThan(
      (await countTokens('You are a helpful assistant.')) + (await countTokens('Hello!'))
    );
  });

  test('Token 计数与 API 偏差不超过 10%（常见文本）', async () => {
    // 这是 AC5 验收标准的基线测试
    // GPT-4o tokenizer 对 "The quick brown fox jumps over the lazy dog." 应返回约 9-10 Token
    const text = 'The quick brown fox jumps over the lazy dog.';
    const tokens = await countTokens(text);
    // OpenAI 官方 tokenizer 对此句返回 9 或 10 token
    expect(tokens).toBeGreaterThanOrEqual(8);
    expect(tokens).toBeLessThanOrEqual(11);
  });
});

describe('可配置 Token 开销参数 (C-02)', () => {
  test('默认开销参数与 OpenAI 规则一致', async () => {
    const messages: ChatMessage[] = [
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Hello!' },
    ];
    // OpenAI 默认：对话开销 3 + 每条消息开销 4 * 2 = 11
    const overhead =
      (await countMessageTokens(messages)) -
      (await countTokens('You are helpful.')) -
      (await countTokens('system')) -
      (await countTokens('Hello!')) -
      (await countTokens('user'));
    expect(overhead).toBe(3 + 4 * 2);
  });

  test('自定义对话开销和消息开销', async () => {
    const messages: ChatMessage[] = [
      { role: 'system', content: 'Hi' },
      { role: 'user', content: 'Hello' },
    ];
    const defaultTokens = await countMessageTokens(messages);
    const customTokens = await countMessageTokens(messages, {
      conversationOverhead: 10,
      perMessageOverhead: 8,
    });
    // 差值 = (10-3) + (8-4)*2 = 7 + 8 = 15
    expect(customTokens - defaultTokens).toBe(15);
  });

  test('开销参数为零时只计算内容 Token', async () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Hello' },
    ];
    const tokens = await countMessageTokens(messages, {
      conversationOverhead: 0,
      perMessageOverhead: 0,
    });
    expect(tokens).toBe((await countTokens('Hello')) + (await countTokens('user')));
  });
});
