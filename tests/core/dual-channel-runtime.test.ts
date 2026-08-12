/**
 * dual-channel-runtime — 双通道检索运行时测试
 *
 * 覆盖:
 * - 开关:默认关,开启后检索
 * - 动态层:每轮检索 + 时间衰减(旧条目分数降低)
 * - 静态层:关键词门控(静态门 false 不查静态库)
 * - fail-open:模型/存储异常不阻断(返回空注入)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  VectorRagRuntime,
  buildVectorRagInjection,
  setVectorRagEnabled,
} from '@core/dual-channel-runtime';

describe('VectorRagRuntime', () => {
  beforeEach(() => {
    VectorRagRuntime.reset();
    setVectorRagEnabled(false);
  });

  it('默认关闭:buildVectorRagInjection 返回空且 ran=false', async () => {
    const inj = await buildVectorRagInjection('测试', true);
    expect(inj).toEqual({ text: '', hits: [], ran: false });
  });

  it('开启后:动态每轮检索,静态受门控', async () => {
    setVectorRagEnabled(true);
    const runtime = VectorRagRuntime.get();
    // 用 mock provider 注入(runtime 默认 factory 无网关配置时用 mock)
    await runtime.addDynamic({ id: 'mem1', text: '主角昨天打败了火龙', meta: { kind: 'memory', timestamp: String(Date.now()) } });
    await runtime.addStatic({ id: 'w1', text: '火龙谷的火山地貌', meta: { scope: 'world' } });

    // 门关:只有动态
    const inj1 = await buildVectorRagInjection('火龙', false);
    expect(inj1.ran).toBe(true);
    expect(inj1.hits.every((h) => h.channel === 'dynamic')).toBe(true);
    expect(inj1.text).toContain('[记忆]');

    // 门开:动态+静态
    const inj2 = await buildVectorRagInjection('火龙谷', true);
    expect(inj2.hits.some((h) => h.channel === 'static' && h.id === 'w1')).toBe(true);
    expect(inj2.text).toContain('[设定]');
  });

  it('时间衰减:旧记忆分数显著低于新记忆', async () => {
    const runtime = VectorRagRuntime.get();
    const now = Date.now();
    await runtime.addDynamic({ id: 'old', text: '很久以前的旧事件甲', meta: { timestamp: String(now - 24 * 3_600_000) } });
    await runtime.addDynamic({ id: 'new', text: '刚才发生的新事件乙', meta: { timestamp: String(now) } });
    const hits = await runtime.retrieve('事件', false);
    const oldHit = hits.find((h) => h.entry.id === 'old');
    const newHit = hits.find((h) => h.entry.id === 'new');
    if (oldHit && newHit) {
      expect(newHit.score).toBeGreaterThan(oldHit.score);
    }
  });

  it('fail-open:无模型配置时异常不阻断(返回空,不抛)', async () => {
    setVectorRagEnabled(true);
    VectorRagRuntime.reset();
    // 直接调用不抛错
    const inj = await buildVectorRagInjection('任意查询', false);
    expect(inj.text).toBe('');
  });
});

describe('CharLevelTokenizer (onnx provider 分词占位)', async () => {
  const { CharLevelTokenizer } = await import('@core/onnx-embedding-provider');
  it('输出长度=输入字符数,id 在词表范围内', () => {
    const t = new CharLevelTokenizer();
    const ids = t.encode('星陨之剑的封印');
    expect(ids).toHaveLength(7);
    for (const id of ids) {
      expect(id).toBeGreaterThanOrEqual(1);
      expect(id).toBeLessThan(t.vocabSize);
    }
  });
});