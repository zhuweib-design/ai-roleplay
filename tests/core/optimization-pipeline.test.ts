/**
 * optimization-pipeline — 嵌入优化管线编排 (E-04) 测试
 *
 * 覆盖：
 * - 默认全关:runL1 原样返回
 * - 豁免黑名单跳过
 * - 压缩成功 + 统计(savedChars/compressCount)
 * - 校验失败回退原文 + 连续失败暂停(二级) + resume 恢复
 * - decide 触发决策与暂停联动
 */
import { describe, it, expect } from 'vitest';
import {
  OptimizationPipeline,
  createDefaultConfig,
  loadOptimizationConfig,
  saveOptimizationConfig,
  compressMessages,
  MIN_COMPRESS_LENGTH,
  type OptimizationConfig,
} from '@core/optimization-pipeline';

function withL1(overrides: Partial<OptimizationConfig> = {}): OptimizationConfig {
  return { ...createDefaultConfig(), enabled: true, l1Enabled: true, ...overrides };
}

describe('OptimizationPipeline (E-04)', () => {
  it('默认配置全关:L1 原样返回且不统计', () => {
    const p = new OptimizationPipeline(createDefaultConfig());
    const r = p.runL1({ text: '任何内容。' });
    expect(r.compressed).toBe(false);
    expect(r.text).toBe('任何内容。');
    expect(p.stats.compressCount).toBe(0);
    expect(p.l1Enabled).toBe(false);
  });

  it('豁免黑名单跳过压缩', () => {
    const p = new OptimizationPipeline(withL1());
    const standing = '主角设定:永不言败。这是必须完整保留的设定。';
    const r = p.runL1({ text: standing, exemptTexts: [standing] });
    expect(r.compressed).toBe(false);
    expect(r.fallbackReason).toBe('exempt');
    expect(p.stats.exemptCount).toBe(1);
    expect(p.stats.compressCount).toBe(0);
  });

  it('压缩成功:采用压缩文本并统计节省', () => {
    const p = new OptimizationPipeline(withL1());
    // 场景:大量填充性历史 + 关键实体句
    const text =
      '星陨之剑的封印被解开。'.repeat(3) +
      '他缓缓地行走在走廊上,似乎在想些什么。'.repeat(10) +
      '守卫看到了这一切。';
    const r = p.runL1({
      text,
      entities: ['星陨之剑'],
      criticalEntities: ['星陨之剑'],
    });
    expect(r.compressed).toBe(true);
    expect(r.text).toContain('星陨之剑');
    expect(r.text.length).toBeLessThan(text.length);
    expect(p.stats.compressCount).toBe(1);
    expect(p.stats.savedChars).toBe(text.length - r.text.length);
  });

  it('校验失败回退原文,连续 3 次进入暂停', () => {
    const p = new OptimizationPipeline(withL1());
    // 构造会让实体保留率不足的压缩:targetRatio 0.4 只留 2 句中的 1 句,必丢一个实体
    const input = {
      text: '实体A句。实体B句。',
      entities: ['实体A句', '实体B句'],
      criticalEntities: [],
      targetRatio: 0.4,
    };
    // 连续失败 3 次
    for (let i = 0; i < 3; i++) {
      const r = p.runL1(input);
      expect(r.compressed).toBe(false);
      expect(r.fallbackReason).toBe('validation');
    }
    expect(p.stats.paused).toBe(true);
    expect(p.stats.pauseCount).toBe(1);
    expect(p.stats.fallbackCount).toBe(3);

    // 暂停后不再尝试压缩
    const after = p.runL1({ text: '新内容。'.repeat(10) });
    expect(after.fallbackReason).toBe('paused');

    // resume 恢复,可重新压缩
    p.resume();
    const resumed = p.runL1({
      text: '星陨之剑。'.repeat(5) + '其他填充内容。'.repeat(10),
      entities: ['星陨之剑'],
    });
    expect(resumed.compressed).toBe(true);
  });

  it('decide 与暂停状态联动', () => {
    const p = new OptimizationPipeline(withL1());
    const ctx = {
      contextUsed: 85,
      contextLimit: 100,
      roundsSinceLastCompress: 5,
    };
    // 未暂停:hard 阈值触发
    expect(p.decide(ctx).shouldCompress).toBe(true);
    // 进入暂停后:拒绝压缩
    p.stats.paused = true;
    expect(p.decide(ctx).shouldCompress).toBe(false);
    expect(p.decide(ctx).reason).toBe('paused');
  });

  it('resetStats 清零统计', () => {
    const p = new OptimizationPipeline(withL1());
    p.runL1({ text: '甲。'.repeat(8), entities: ['甲'] });
    expect(p.stats.compressCount).toBeGreaterThan(0);
    p.resetStats();
    expect(p.stats.compressCount).toBe(0);
    expect(p.stats.savedChars).toBe(0);
    expect(p.stats.paused).toBe(false);
  });
});
// ── E-04 二期: 配置持久化与消息挂载 ──

describe('配置持久化与 compressMessages (E-04 二期)', () => {
  it('load/save 配置往返,损坏数据回退默认', () => {
        try {
      localStorage.removeItem('ai-roleplay:optimization-config');
      expect(loadOptimizationConfig().enabled).toBe(false);

      saveOptimizationConfig({ enabled: true, l0Enabled: true, l1Enabled: true, l2Enabled: false, stage: 'l0-l2' });
      const loaded = loadOptimizationConfig();
      expect(loaded.enabled).toBe(true);
      expect(loaded.l1Enabled).toBe(true);
      expect(loaded.stage).toBe('l0-l2');

      localStorage.setItem('ai-roleplay:optimization-config', '{broken');
      expect(loadOptimizationConfig().enabled).toBe(false);
    } finally {
      localStorage.removeItem('ai-roleplay:optimization-config');
    }
  });

  it('compressMessages:长历史消息被压缩,system/当前轮豁免', () => {
    const long = '星陨之剑的封印被解开。'.repeat(30); // > MIN_COMPRESS_LENGTH
    const p = new OptimizationPipeline({ enabled: true, l0Enabled: false, l2Enabled: false, l1Enabled: true, stage: 'all' });
    const outcome = compressMessages(
      [
        { role: 'system', content: long }, // 豁免:system
        { role: 'assistant', content: long }, // 可压缩
        { role: 'user', content: long }, // 豁免:最后一条(当前轮)
      ],
      p,
      { entities: ['星陨之剑'] }
    );
    expect(outcome.messages[0].content).toBe(long); // system 未动
    expect(outcome.messages[1].content.length).toBeLessThan(long.length); // 已压缩
    expect(outcome.messages[2].content).toBe(long); // 当前轮未动
    expect(outcome.compressedCount).toBe(1);
    expect(MIN_COMPRESS_LENGTH).toBeGreaterThan(0);
  });

  it('compressMessages:未启用时原样返回', () => {
    const p = new OptimizationPipeline({ enabled: false, l0Enabled: false, l2Enabled: false, l1Enabled: false, stage: 'off' });
    const msg = [{ role: 'user', content: 'x'.repeat(500) }];
    const outcome = compressMessages(msg, p);
    expect(outcome.compressedCount).toBe(0);
    expect(outcome.messages[0].content).toBe('x'.repeat(500));
  });
});
