/**
 * world-setting-chunker — 世界设定分块 (需求 1) 测试
 *
 * 覆盖:
 * - 短设定(<512 token):单块,标题不变
 * - 超长设定:多块,首块原标题、续块标题带「(续 N)」
 * - 每块 token 预算约束
 * - 块文本首行带标题(检索偏向标题)
 * - 空输入返回空
 *
 * P1-3: chunkWorldSetting / countTokens 已 async(懒加载 gpt-tokenizer), 测试全部 await
 */
import { describe, it, expect } from 'vitest';
import { chunkWorldSetting } from '@core/world-setting-chunker';
import { countTokens } from '@core/token-counter';

describe('chunkWorldSetting (需求 1:超 512 token 分块)', () => {
  it('短设定:单块,标题不变,首行标题', async () => {
    const chunks = await chunkWorldSetting('w1', '精灵王国', '精灵王国位于大陆东部的翡翠森林之中。', 512);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.title).toBe('精灵王国');
    expect(chunks[0]!.text.startsWith('精灵王国\n')).toBe(true);
    expect(chunks[0]!.id).toBe('w1#0');
  });

  it('超长设定:多块 + 续块标题', async () => {
    // 构造 >512 token 的设定(重复句)
    const body = '精灵王国的王位继承遵循古老的月桂仪式。'.repeat(60);
    const chunks = await chunkWorldSetting('w2', '精灵王国', body, 512);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]!.title).toBe('精灵王国');
    expect(chunks[1]!.title).toBe('精灵王国(续 2)');
    // 每块 token 不超预算(标题前缀少量溢出容忍:标题 + 正文 ≤ 512 + 标题 token)
    for (const c of chunks) {
      expect(await countTokens(c.text)).toBeLessThanOrEqual(512 + (await countTokens(c.title)));
    }
  });

  it('空输入返回空数组', async () => {
    expect(await chunkWorldSetting('w3', 'T', '')).toEqual([]);
    expect(await chunkWorldSetting('w3', 'T', '   ')).toEqual([]);
  });
});
