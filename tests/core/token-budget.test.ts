/**
 * token-budget：把"模型最大上下文"变成唯一旋钮之后，预算与压缩必须真的成立
 *
 * 这组测试盯的是用户定的口径：不限制输出上限；输入装不下就压缩；绝不溢出
 * （输入 + 输出 ≤ 上下文 − 预留）。任何一条不成立，生成就会回到
 * "被掐断在 JSON 中间 ⇒ 无法解析" 或 "上下文超限报错" 的老路上。
 */
import { describe, it, expect } from 'vitest';
import {
  MIN_OUTPUT_TOKENS,
  resolveContextWindow,
  computeOutputBudget,
  truncateToTokenBudget,
  prepareGenerationPrompt,
  measureInputTokens,
} from '@core/token-budget';
import type { ChatMessage } from '@core/token-counter';

const FILLER =
  '这片区域终年被薄雾笼罩，山脊像沉睡巨兽的脊背横贯南北。商队沿着河床走出一条蜿蜒的旧道，沿途驿站大多废弃，只剩石砌的墙基与半截界碑。';
function zh(n: number): string {
  let s = '';
  while (s.length < n) s += FILLER;
  return s.slice(0, n);
}

const SCHEMA_TAIL = '\n返回纯 JSON，结构如下：{"world":{"name":"…"},"regions":[]}';

describe('token-budget', () => {
  describe('resolveContextWindow', () => {
    it('模型设置里填了就用它', () => {
      expect(resolveContextWindow({ contextWindow: 32768 }, 8192)).toBe(32768);
    });
    it('没填 / 填了非法值 ⇒ 回退全局默认', () => {
      expect(resolveContextWindow(undefined, 8192)).toBe(8192);
      expect(resolveContextWindow({}, 8192)).toBe(8192);
      expect(resolveContextWindow({ contextWindow: 0 }, 8192)).toBe(8192);
      expect(resolveContextWindow({ contextWindow: -5 }, 8192)).toBe(8192);
      expect(resolveContextWindow({ contextWindow: Number.NaN }, 8192)).toBe(8192);
    });
  });

  describe('computeOutputBudget', () => {
    it('预算 = 上下文 − 预留 − 输入实测', async () => {
      const messages: ChatMessage[] = [{ role: 'user', content: zh(200) }];
      const input = await measureInputTokens(messages);
      expect(await computeOutputBudget(messages, 8192, 1024)).toBe(8192 - 1024 - input);
    });
    it('装不下时按下限给（调用方应先压缩输入），不会是 0 或负数', async () => {
      const messages: ChatMessage[] = [{ role: 'user', content: zh(6000) }];
      expect(await computeOutputBudget(messages, 1024, 512)).toBe(MIN_OUTPUT_TOKENS);
    });
  });

  describe('truncateToTokenBudget', () => {
    it('短文本原样返回', async () => {
      expect(await truncateToTokenBudget('你好', 100)).toBe('你好');
    });
    it('长文本截到预算内并留下标记', async () => {
      const out = await truncateToTokenBudget(zh(3000), 100);
      expect(out).toContain('已按上下文预算截断');
      expect((await measureInputTokens([{ role: 'user', content: out }]))).toBeLessThanOrEqual(140);
    });
  });

  describe('prepareGenerationPrompt', () => {
    const build = (source: string | undefined): ChatMessage[] => [
      { role: 'system', content: '你是世界观创作助手。' },
      { role: 'user', content: `【源素材】\n${source ?? '（无）'}\n${SCHEMA_TAIL}` },
    ];

    it('装得下 ⇒ 不压缩，预算 = 上下文 − 预留 − 输入', async () => {
      const p = await prepareGenerationPrompt(build, zh(200), 8192, 1024);
      expect(p.compressed).toBe(false);
      const input = await measureInputTokens(p.messages);
      expect(p.maxTokens).toBe(8192 - 1024 - input);
    });

    it('源文本超大 ⇒ 截断源文本，且 输入+输出 不超预算（不溢出）', async () => {
      const p = await prepareGenerationPrompt(build, zh(9000), 4096, 512);
      expect(p.compressed).toBe(true);
      const input = await measureInputTokens(p.messages);
      expect(input + p.maxTokens).toBeLessThanOrEqual(4096 - 512 + 20);
      // 结构说明在尾部，截断不能把它砍掉
      expect(p.messages[1]!.content.endsWith(SCHEMA_TAIL)).toBe(true);
    });

    it('没有源文本但历史太多 ⇒ 从最早开始丢，且不溢出', async () => {
      const many = (): ChatMessage[] => [
        { role: 'system', content: '系统' },
        ...Array.from({ length: 8 }, (_, i) => ({ role: 'user' as const, content: zh(600) + i })),
        { role: 'user', content: `最新问题${SCHEMA_TAIL}` },
      ];
      const p = await prepareGenerationPrompt(many, undefined, 4096, 512);
      expect(p.compressed).toBe(true);
      expect(p.messages.length).toBeLessThan(many().length);
      const input = await measureInputTokens(p.messages);
      expect(input + p.maxTokens).toBeLessThanOrEqual(4096 - 512 + 20);
      // 最后一条（本轮问题）必须还在
      expect(p.messages[p.messages.length - 1]!.content).toContain('最新问题');
    });

    it('单条消息本身就超 ⇒ 截断它并保住尾部结构说明', async () => {
      const one = (): ChatMessage[] => [
        { role: 'system', content: '系统' },
        { role: 'user', content: zh(5000) + SCHEMA_TAIL },
      ];
      const p = await prepareGenerationPrompt(one, undefined, 2048, 256);
      expect(p.compressed).toBe(true);
      expect(p.messages[1]!.content.endsWith(SCHEMA_TAIL)).toBe(true);
      const input = await measureInputTokens(p.messages);
      expect(input + p.maxTokens).toBeLessThanOrEqual(2048 - 256 + 20);
    });
  });
});
