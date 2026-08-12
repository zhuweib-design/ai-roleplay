/**
 * memory-store — L0 上下文结构层 (E-01) 测试
 *
 * 覆盖：
 * - MemoryStore:原子写修订递增、按修订读、快照列表、restore 保留审计链、diff
 * - 写保护:standing 事实仅人工可写,optimizer 写入被拒
 * - CharacterRegistry:前缀字节稳定(同输入同哈希)、standing 排序稳定、scoped 不进入前缀
 * - EmotionTracker:更新/读取、修订递增、fail-open(更新不抛错)
 */
import { describe, it, expect } from 'vitest';
import {
  MemoryStore,
  CharacterRegistry,
  EmotionTracker,
} from '@core/memory-store';

describe('MemoryStore (E-01)', () => {
  it('put 原子写:修订号从 1 单调递增', async () => {
    const store = new MemoryStore();
    const f1 = await store.put({ id: 'char-1', scope: 'standing', kind: 'character', body: '设定A' });
    expect(f1.revision).toBe(1);
    const f2 = await store.put({ id: 'char-1', scope: 'standing', kind: 'character', body: '设定A v2' });
    expect(f2.revision).toBe(2);
    expect(f2.body).toBe('设定A v2');
  });

  it('get 支持按修订号读取历史', async () => {
    const store = new MemoryStore();
    await store.put({ id: 'w-1', scope: 'standing', kind: 'world', body: 'v1' });
    await store.put({ id: 'w-1', scope: 'standing', kind: 'world', body: 'v2' });
    expect((await store.get('w-1', 1))?.body).toBe('v1');
    expect((await store.get('w-1'))?.body).toBe('v2');
    expect(await store.get('w-1', 99)).toBeNull();
    expect(await store.get('nope')).toBeNull();
  });

  it('写保护:standing 仅人工可写,optimizer 被拒', async () => {
    const store = new MemoryStore();
    await store.put({ id: 'char-1', scope: 'standing', kind: 'character', body: 'X' }, 'human');
    await expect(
      store.put({ id: 'char-1', scope: 'standing', kind: 'character', body: 'Y' }, 'optimizer')
    ).rejects.toThrow(/写保护/);
    // scoped 允许 optimizer 写(独立 id,修订从 1 起)
    const ok = await store.put({ id: 'm-1', scope: 'scoped', kind: 'emotion', body: 'Z' }, 'optimizer');
    expect(ok.revision).toBe(1);
  });

  it('restore 恢复历史并保留审计链(新修订)', async () => {
    const store = new MemoryStore();
    await store.put({ id: 'f-1', scope: 'scoped', kind: 'session', body: 'v1' });
    await store.put({ id: 'f-1', scope: 'scoped', kind: 'session', body: 'v2' });
    const restored = await store.restore('f-1', 1);
    expect(restored?.body).toBe('v1');
    expect(restored?.revision).toBe(3);
    const revs = await store.revisions('f-1');
    expect(revs).toHaveLength(3);
    expect(revs[0]).toMatchObject({ revision: 3, author: 'human' });
  });

  it('diff 输出行级差异', async () => {
    const store = new MemoryStore();
    await store.put({ id: 'd-1', scope: 'scoped', kind: 'session', body: '第一行\n第二行\n第三行' });
    await store.put({ id: 'd-1', scope: 'scoped', kind: 'session', body: '第一行\n第二行(改)\n第三行' });
    const diffs = await store.diff('d-1', 1, 2);
    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toContain('第二行');
  });
});

describe('CharacterRegistry (E-01)', () => {
  it('前缀字节稳定:同输入同哈希;写入顺序不影响结果', async () => {
    const store = new MemoryStore();
    const reg = new CharacterRegistry(store);
    await store.put({ id: 'char-b', scope: 'standing', kind: 'character', body: '角色B' });
    await store.put({ id: 'char-a', scope: 'standing', kind: 'character', body: '角色A' });

    const p1 = await reg.assemblePrefix('BASE');
    const p2 = await reg.assemblePrefix('BASE');
    expect(p1.hash).toBe(p2.hash);
    expect(p1.text).toContain('角色A');
    expect(p1.text).toContain('角色B');
    // 按 id 排序:char-a 在 char-b 前
    expect(p1.text.indexOf('角色A')).toBeLessThan(p1.text.indexOf('角色B'));
    expect(reg.isStable(p1.hash, p2.hash)).toBe(true);
  });

  it('scoped 事实不进入前缀(动态段)', async () => {
    const store = new MemoryStore();
    const reg = new CharacterRegistry(store);
    await store.put({ id: 'char-1', scope: 'standing', kind: 'character', body: '常驻' });
    await store.put({ id: 'm-1', scope: 'scoped', kind: 'emotion', body: '动态情绪' });

    const p = await reg.assemblePrefix('BASE');
    expect(p.text).toContain('常驻');
    expect(p.text).not.toContain('动态情绪');
  });
});

describe('EmotionTracker (E-01)', () => {
  it('更新与读取,修订递增', async () => {
    const t = new EmotionTracker();
    expect(await t.current('s1')).toBeNull();
    await t.update('s1', '平静', '场景无冲突');
    const s = await t.current('s1');
    expect(s).toMatchObject({ label: '平静', reason: '场景无冲突', revision: 1 });
    await t.update('s1', '愤怒', '设定被质疑');
    expect((await t.current('s1'))?.revision).toBe(2);
  });

  it('不同会话状态隔离', async () => {
    const t = new EmotionTracker();
    await t.update('s1', '平静', '');
    await t.update('s2', '紧张', '');
    expect((await t.current('s1'))?.label).toBe('平静');
    expect((await t.current('s2'))?.label).toBe('紧张');
  });
});