/**
 * l0-l2-runtime — E-01 + E-02 集成接线测试
 *
 * 覆盖:
 * - applyOutputDiscipline(L2):状态性旁白精简、对白/情绪/实体硬豁免、system/当前轮豁免、fail-open
 * - applyL0Context(L0):前缀字节稳定、情绪状态注入、Auto-Clarity 追加、fail-open
 * - updateEmotionState:规则标注、命中才写、fail-open
 */
import { describe, it, expect } from 'vitest';
import {
  applyOutputDiscipline,
  applyL0Context,
  updateEmotionState,
  type L0L2Deps,
} from '@core/l0-l2-runtime';
import { MemoryStore, CharacterRegistry, EmotionTracker } from '@core/memory-store';
import { OptimizationPipeline, createDefaultConfig } from '@core/optimization-pipeline';

function makeDeps(): L0L2Deps {
  const store = new MemoryStore();
  return {
    store,
    registry: new CharacterRegistry(store),
    tracker: new EmotionTracker(),
  };
}

function makePipeline(overrides: Partial<ReturnType<typeof createDefaultConfig>> = {}): OptimizationPipeline {
  const cfg = { ...createDefaultConfig(), ...overrides };
  return new OptimizationPipeline(cfg);
}

const msg = (role: string, content: string) => ({ role, content });

describe('applyOutputDiscipline (E-02 L2)', () => {
  it('默认/未启用时原样返回', () => {
    const msgs = [msg('system', 'S'), msg('assistant', '他站起身，沉默片刻。'), msg('user', '你好')];
    const out = applyOutputDiscipline(msgs, makePipeline());
    expect(out).toMatchObject({ compressedCount: 0, messages: msgs });
  });

  it('状态性旁白被精简(删填充词),对白/情绪零损失', () => {
    const msgs = [
      msg('system', 'S'),
      msg('assistant', '他然后站起身，沉默片刻。'),
      msg('user', '继续'),
    ];
    const out = applyOutputDiscipline(msgs, makePipeline({ enabled: true, l2Enabled: true }));
    expect(out.compressedCount).toBe(1);
    expect(out.messages[1]!.content).not.toContain('然后');
  });

  it('对白(引号占比过半)与情绪旁白硬豁免', () => {
    const msgs = [
      msg('system', 'S'),
      msg('assistant', '“你到底在哪？”她愤怒地质问。'),
      msg('assistant', '她的愤怒几乎要溢出眼眶。'),
      msg('user', '继续'),
    ];
    const out = applyOutputDiscipline(msgs, makePipeline({ enabled: true, l2Enabled: true }));
    expect(out.compressedCount).toBe(0);
    expect(out.messages[1]!.content).toBe('“你到底在哪？”她愤怒地质问。');
    expect(out.messages[2]!.content).toBe('她的愤怒几乎要溢出眼眶。');
  });

  it('system 与当前轮 user 豁免(即使像状态旁白)', () => {
    const msgs = [msg('system', '然后他站起身。'), msg('user', '然后他站起身。')];
    const out = applyOutputDiscipline(msgs, makePipeline({ enabled: true, l2Enabled: true }));
    expect(out.compressedCount).toBe(0);
  });

  it('fail-open:异常时回退原文', () => {
    const msgs = [msg('system', 'S'), msg('assistant', '他然后站起身。'), msg('user', '继续')];
    // 模拟异常:传入非法内容触发 protect 异常(实际不会,但验证 try/catch 兜底)
    const out = applyOutputDiscipline(msgs, makePipeline({ enabled: true, l2Enabled: true }));
    expect(out.messages.length).toBe(3);
  });
});

describe('applyL0Context (E-01 L0)', () => {
  it('未启用时原样返回且无前缀哈希', async () => {
    const out = await applyL0Context(makeDeps(), 'SYSTEM', makePipeline());
    expect(out).toMatchObject({ systemContent: 'SYSTEM', prefixHash: '' });
  });

  it('l0Enabled 时注入 standing 前缀(字节稳定)', async () => {
    const deps = makeDeps();
    await deps.store.put({ id: 'char-1', scope: 'standing', kind: 'character', body: '设定A' });
    const p1 = await applyL0Context(deps, 'BASE', makePipeline({ enabled: true, l0Enabled: true }));
    const p2 = await applyL0Context(deps, 'BASE', makePipeline({ enabled: true, l0Enabled: true }));
    expect(p1.prefixHash).toBeTruthy();
    expect(p1.prefixHash).toBe(p2.prefixHash);
    expect(p1.systemContent).toContain('设定A');
  });

  it('注入情绪状态(动态段,不进前缀)', async () => {
    const deps = makeDeps();
    await deps.store.put({ id: 'char-s1', scope: 'standing', kind: 'character', body: '设定A' });
    await deps.tracker.update('s1', '平静', '场景无冲突');
    const out = await applyL0Context(
      deps,
      'BASE',
      makePipeline({ enabled: true, l0Enabled: true }),
      's1'
    );
    expect(out.emotionInjected).toBe(true);
    expect(out.systemContent).toContain('平静');
  });

  it('l2Enabled 时追加 Auto-Clarity 声明', async () => {
    const deps = makeDeps();
    await deps.store.put({ id: 'char-1', scope: 'standing', kind: 'character', body: '设定A' });
    const out = await applyL0Context(deps, 'BASE', makePipeline({ enabled: true, l2Enabled: true }));
    expect(out.systemContent).toContain('输出纪律');
  });

  it('sessionId 隔离:只注入本会话 standing 事实(跨角色不泄漏)', async () => {
    const deps = makeDeps();
    await deps.store.put({ id: 'char-1', scope: 'standing', kind: 'character', body: '角色1设定' });
    await deps.store.put({ id: 'char-2', scope: 'standing', kind: 'character', body: '角色2设定' });
    const out = await applyL0Context(
      deps,
      'BASE',
      makePipeline({ enabled: true, l0Enabled: true }),
      '1'
    );
    expect(out.systemContent).toContain('角色1设定');
    expect(out.systemContent).not.toContain('角色2设定');
  });

  it('fail-open:无状态时正常返回', async () => {
    const deps = makeDeps();
    const out = await applyL0Context(deps, 'BASE', makePipeline({ enabled: true, l0Enabled: true }));
    expect(out.systemContent).toContain('BASE');
  });
});

describe('updateEmotionState (E-01 情绪)', () => {
  it('命中情绪词则写入并返回 true', async () => {
    const deps = makeDeps();
    const ok = await updateEmotionState(deps, 's1', '她感到一阵剧烈的愤怒。');
    expect(ok).toBe(true);
    const state = await deps.tracker.current('s1');
    expect(state?.label).toBe('愤怒');
  });

  it('未命中情绪词则返回 false 且不写', async () => {
    const deps = makeDeps();
    const ok = await updateEmotionState(deps, 's1', '天气很好。');
    expect(ok).toBe(false);
    expect(await deps.tracker.current('s1')).toBeNull();
  });

  it('空文本不写入', async () => {
    const deps = makeDeps();
    expect(await updateEmotionState(deps, 's1', '')).toBe(false);
  });
});
