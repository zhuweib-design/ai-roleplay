/**
 * 提示弹窗自动关闭契约（M2-b9）
 *
 * 用户反馈"提示弹窗需要自动关闭"。实测原实现本来 5s 后会关，
 * 真正的问题是观感：确认型提示也要占屏 5 秒、连点会排成一串刷半分钟、
 * 而且界面上没有任何"它会自己关"的信号。
 * 这里守住服务层的三条：分类型时长、重复消息不重复排队、队列上限与淘汰规则。
 * （倒计时条与悬停暂停在 tests/components/toast-auto-close.test.ts 与 e2e 里守）
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  showToast,
  dismissToast,
  clearToasts,
  useActiveToast,
  TOAST_DURATIONS,
  TOAST_QUEUE_LIMIT,
} from '@/utils/toast-service';

function drain(): string[] {
  const seen: string[] = [];
  let guard = 0;
  for (let active = useActiveToast().value; active && guard < 50; active = useActiveToast().value) {
    seen.push(`${active.type}:${active.message}`);
    dismissToast();
    guard += 1;
  }
  return seen;
}

describe('分类型时长', () => {
  it('信息/成功 3s 出头，错误保留 5s', () => {
    expect(TOAST_DURATIONS.info).toBe(3000);
    expect(TOAST_DURATIONS.success).toBe(3200);
    expect(TOAST_DURATIONS.error).toBe(5000);
  });

  it('错误比确认型长，确认型比 5s 明显短', () => {
    expect(TOAST_DURATIONS.error).toBeGreaterThan(TOAST_DURATIONS.success);
    expect(TOAST_DURATIONS.info).toBeLessThan(4000);
  });
});

describe('重复消息合并', () => {
  beforeEach(clearToasts);

  it('同类型同文案连续触发只排一条', () => {
    showToast('error', '保存失败');
    showToast('error', '保存失败');
    showToast('error', '保存失败');
    expect(drain()).toEqual(['error:保存失败']);
  });

  it('文案或类型不同仍各自排队', () => {
    showToast('info', '已保存');
    showToast('success', '已保存');
    showToast('info', '已同步');
    expect(drain()).toEqual(['info:已保存', 'success:已保存', 'info:已同步']);
  });
});

describe('队列上限', () => {
  beforeEach(clearToasts);

  it('连点 9 次也只留上限条数，不会刷上半分钟', () => {
    for (let i = 0; i < 9; i += 1) showToast('info', `第 ${i} 条`);
    const queued = drain();
    expect(queued.length).toBe(TOAST_QUEUE_LIMIT);
  });

  it('正在显示的首条不参与淘汰（不会把用户正在读的那条挤掉）', () => {
    showToast('info', '正在读的这条');
    for (let i = 0; i < 8; i += 1) showToast('info', `后到的 ${i}`);
    const queued = drain();
    expect(queued[0]).toBe('info:正在读的这条');
    expect(queued.length).toBe(TOAST_QUEUE_LIMIT);
  });

  it('待显示项全是错误时，丢弃的是新来的那条而不是已排队的错误', () => {
    for (let i = 0; i < TOAST_QUEUE_LIMIT; i += 1) showToast('error', `错误 ${i}`);
    showToast('error', '最后挤进来的错误');
    const queued = drain();
    expect(queued).not.toContain('error:最后挤进来的错误');
    expect(queued.length).toBe(TOAST_QUEUE_LIMIT);
  });

  it('超限时优先淘汰非错误的待显示项，错误不被静默丢掉', () => {
    showToast('info', '先排队的信息');
    showToast('error', '必须看到的错误');
    for (let i = 0; i < TOAST_QUEUE_LIMIT; i += 1) showToast('info', `灌入 ${i}`);
    const queued = drain();
    // 首条正在显示不参与淘汰；被淘汰的是最早"排在后面等"的信息
    expect(queued).toContain('error:必须看到的错误');
    expect(queued).toContain('info:先排队的信息');
    expect(queued).not.toContain('info:灌入 0');
    expect(queued.length).toBe(TOAST_QUEUE_LIMIT);
  });

  it('空消息直接忽略', () => {
    showToast('info', '');
    expect(useActiveToast().value).toBeNull();
  });
});
