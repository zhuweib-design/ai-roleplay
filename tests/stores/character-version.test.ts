/**
 * character-version store 单元测试 (模块4)
 *
 * 覆盖：
 * - loadFromDisk / persistNow 持久化往返
 * - selectCharacter / deleteRepository
 * - commit / commitCurrentCharacter
 * - createBranch / switchBranch / deleteBranch / toggleBranchLock
 * - diff / diffWithHead
 * - mergeBranch（自动成功与冲突）
 * - resolveConflicts / cancelMerge
 * - rollbackTo
 * - acquireLock / releaseLock / releaseAllLocks
 * - setAuthor
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import 'fake-indexeddb/auto';
import { useCharacterVersionStore } from '../../src/stores/character-version';
import { useCharacterStore } from '../../src/stores/character';
import { IndexedDBAdapter } from '../../src/storage/indexeddb-adapter';
import type { CharacterCard } from '@core/character-card';

// ── 测试夹具 ──

function makeCard(overrides: Partial<CharacterCard> = {}): CharacterCard {
  return {
    id: 'test',
    name: '测试角色',
    avatar: '',
    description: '描述',
    personality: '',
    scenario: '',
    firstMessage: '',
    alternateGreetings: [],
    exampleMessages: '',
    characterNote: null,
    talkativeness: 50,
    tags: [],
    favorite: false,
    version: '1.0',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('character-version store', () => {
  let store: ReturnType<typeof useCharacterVersionStore>;
  let charStore: ReturnType<typeof useCharacterStore>;
  let adapter: IndexedDBAdapter | null = null;

  afterEach(async () => {
    // 等待 fire-and-forget 写入完成，再关闭连接（避免 close 后写失败噪音）
    await new Promise((r) => setTimeout(r, 20));
    // 关闭连接，避免 deleteDatabase 被阻塞（fake-indexeddb blocked 死锁）
    await adapter?.close();
    adapter = null;
  });

  beforeEach(async () => {
    localStorage.clear();
    setActivePinia(createPinia());
    // 每个测试使用独立数据库，注入快照持久化 adapter
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('character-version-test-db');
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
    adapter = new IndexedDBAdapter('character-version-test-db');
    await adapter.init();
    charStore = useCharacterStore();
    store = useCharacterVersionStore();
    store.setStorageAdapter(adapter);
    // 重置测试状态（不清空存储，由数据库重建负责）
    store._resetForTesting();
  });

  // ── 持久化 ──

  describe('持久化', () => {
    it('loadFromDisk 空数据不报错', async () => {
      await expect(store.loadFromDisk()).resolves.not.toThrow();
      expect(store.loaded).toBe(true);
    });

    it('persistNow 后 loadFromDisk 可恢复', async () => {
      // 先选择一个角色（seraphina 来自 mock data）
      store.selectCharacter('seraphina');
      store.commit(makeCard({ name: '修改后' }), '首次提交');
      await store.persistNow();

      // 重置引擎模拟应用重启
      store._resetForTesting();
      await store.loadFromDisk();

      expect(store.repositories.length).toBeGreaterThan(0);
      const repo = store.repositories.find(
        (r) => r.characterId === 'seraphina'
      );
      expect(repo).toBeDefined();
      expect(repo!.totalCommits).toBeGreaterThan(0);
    });
  });

  // ── 仓库管理 ──

  describe('仓库管理', () => {
    it('selectCharacter 自动创建仓库', () => {
      const ok = store.selectCharacter('seraphina');
      expect(ok).toBe(true);
      expect(store.currentCharacterId).toBe('seraphina');
      expect(store.currentRepoInfo).not.toBeNull();
      expect(store.currentRepoInfo!.characterName).toBe('Seraphina');
    });

    it('selectCharacter 不存在角色失败', () => {
      const ok = store.selectCharacter('nonexistent');
      expect(ok).toBe(false);
      expect(store.lastError).toContain('不存在');
    });

    it('重复 selectCharacter 返回相同仓库', () => {
      store.selectCharacter('seraphina');
      const head1 = store.headVersion?.id;
      store.selectCharacter('seraphina');
      const head2 = store.headVersion?.id;
      expect(head1).toBe(head2);
    });

    it('deleteRepository 删除仓库', () => {
      store.selectCharacter('seraphina');
      const ok = store.deleteRepository('seraphina');
      expect(ok).toBe(true);
      expect(store.currentCharacterId).toBeNull();
    });
  });

  // ── 提交 ──

  describe('提交', () => {
    beforeEach(() => {
      store.selectCharacter('seraphina');
    });

    it('commit 在 main 上链式提交', () => {
      const v1 = store.headVersion!;
      const ok = store.commit(makeCard({ name: 'v2' }), '修改');
      expect(ok).toBe(true);
      const v2 = store.headVersion!;
      expect(v2.parentId).toBe(v1.id);
      expect(v2.message).toBe('修改');
    });

    it('commit 无角色失败', () => {
      store.currentCharacterId = null;
      const ok = store.commit(makeCard(), 'msg');
      expect(ok).toBe(false);
      expect(store.lastError).toContain('未选择');
    });

    it('commitCurrentCharacter 自动从 character store 拉取', () => {
      // 修改 character store 中 seraphina 的描述
      const char = charStore.characters.find((c) => c.id === 'seraphina');
      char!.description = '新描述';
      const ok = store.commitCurrentCharacter('保存当前状态');
      expect(ok).toBe(true);
      expect(store.headVersion!.snapshot.description).toBe('新描述');
    });
  });

  // ── 分支 ──

  describe('分支', () => {
    beforeEach(() => {
      store.selectCharacter('seraphina');
    });

    it('createBranch 创建并切换', () => {
      const ok = store.createBranch('dev');
      expect(ok).toBe(true);
      expect(store.branches.find((b) => b.name === 'dev')).toBeDefined();
    });

    it('createBranch 非法分支名失败', () => {
      const ok = store.createBranch('123abc');
      expect(ok).toBe(false);
      expect(store.lastError).toContain('非法');
    });

    it('createBranch 重复名失败', () => {
      store.createBranch('dev');
      store.switchBranch('main');
      const ok = store.createBranch('dev');
      expect(ok).toBe(false);
      expect(store.lastError).toContain('已存在');
    });

    it('switchBranch 切换分支', () => {
      store.createBranch('dev');
      store.switchBranch('main');
      store.switchBranch('dev');
      expect(store.currentRepoInfo!.currentBranch).toBe('dev');
    });

    it('switchBranch 不存在分支失败', () => {
      const ok = store.switchBranch('nonexistent');
      expect(ok).toBe(false);
    });

    it('deleteBranch 删除非默认分支', () => {
      store.createBranch('dev');
      store.switchBranch('main');
      const ok = store.deleteBranch('dev');
      expect(ok).toBe(true);
      expect(store.branches.find((b) => b.name === 'dev')).toBeUndefined();
    });

    it('deleteBranch 默认分支 main 失败', () => {
      const ok = store.deleteBranch('main');
      expect(ok).toBe(false);
      expect(store.lastError).toContain('默认分支');
    });

    it('toggleBranchLock 锁定/解锁', () => {
      store.createBranch('dev');
      store.switchBranch('main');
      store.toggleBranchLock('dev');
      expect(
        store.branches.find((b) => b.name === 'dev')!.locked
      ).toBe(true);
      store.toggleBranchLock('dev');
      expect(
        store.branches.find((b) => b.name === 'dev')!.locked
      ).toBe(false);
    });
  });

  // ── 差异对比 ──

  describe('差异对比', () => {
    beforeEach(() => {
      store.selectCharacter('seraphina');
    });

    it('diff 检测修改', () => {
      const v1 = store.headVersion!.id;
      store.commit(makeCard({ name: '新名' }), '改名');
      const v2 = store.headVersion!.id;
      const diff = store.diff(v1, v2);
      expect(diff).not.toBeNull();
      expect(diff!.changes).toBeGreaterThan(0);
      const nameDiff = diff!.fields.find((f) => f.path === 'name');
      expect(nameDiff).toBeDefined();
      expect(nameDiff!.type).toBe('modified');
    });

    it('diffWithHead 与当前对比', () => {
      const v1 = store.headVersion!.id;
      store.commit(makeCard({ name: '新名' }), '改名');
      const diff = store.diffWithHead(v1);
      expect(diff).not.toBeNull();
      expect(diff!.toId).toBe(store.headVersion!.id);
    });

    it('diff 相同版本完全相同', () => {
      const v1 = store.headVersion!.id;
      // 提交与当前 HEAD 完全相同的快照（确保无字段变更）
      const sameCard = { ...store.headVersion!.snapshot };
      store.commit(sameCard, '无变更');
      const v2 = store.headVersion!.id;
      const diff = store.diff(v1, v2);
      expect(diff!.identical).toBe(true);
    });

    it('diff 不存在版本失败', () => {
      const diff = store.diff('nonexistent', store.headVersion!.id);
      expect(diff).toBeNull();
      expect(store.lastError).toContain('不存在');
    });
  });

  // ── 合并 ──

  describe('合并', () => {
    beforeEach(() => {
      store.selectCharacter('seraphina');
    });

    it('自动合并成功（源修改当前未改）', () => {
      store.createBranch('dev');
      store.switchBranch('dev');
      store.commit(makeCard({ name: 'dev 名' }), 'dev 改名');
      store.switchBranch('main');

      const ok = store.mergeBranch('dev');
      expect(ok).toBe(true);
      expect(store.hasPendingConflicts).toBe(false);
      expect(store.headVersion!.snapshot.name).toBe('dev 名');
    });

    it('冲突时标记 pendingConflicts', () => {
      store.createBranch('dev');
      store.switchBranch('dev');
      store.commit(makeCard({ name: 'dev 名' }), 'dev 改名');
      store.switchBranch('main');
      store.commit(makeCard({ name: 'main 名' }), 'main 改名');

      const ok = store.mergeBranch('dev');
      expect(ok).toBe(false);
      expect(store.hasPendingConflicts).toBe(true);
      expect(store.pendingConflicts).not.toBeNull();
      expect(store.pendingConflicts!.conflicts.length).toBeGreaterThan(0);
    });

    it('resolveConflicts 解决冲突后提交', () => {
      store.createBranch('dev');
      store.switchBranch('dev');
      store.commit(makeCard({ name: 'dev 名' }), 'dev 改名');
      store.switchBranch('main');
      store.commit(makeCard({ name: 'main 名' }), 'main 改名');
      store.mergeBranch('dev');

      const ok = store.resolveConflicts({ name: 'source' });
      expect(ok).toBe(true);
      expect(store.hasPendingConflicts).toBe(false);
      expect(store.headVersion!.snapshot.name).toBe('dev 名');
    });

    it('resolveConflicts 选择 current 时保留当前值', () => {
      store.createBranch('dev');
      store.switchBranch('dev');
      store.commit(makeCard({ name: 'dev 名' }), 'dev 改名');
      store.switchBranch('main');
      store.commit(makeCard({ name: 'main 名' }), 'main 改名');
      store.mergeBranch('dev');

      const ok = store.resolveConflicts({ name: 'current' });
      expect(ok).toBe(true);
      expect(store.headVersion!.snapshot.name).toBe('main 名');
    });

    it('resolveConflicts 无待解决冲突失败', () => {
      const ok = store.resolveConflicts({ name: 'source' });
      expect(ok).toBe(false);
      expect(store.lastError).toContain('无待解决');
    });

    it('cancelMerge 清除 pendingConflicts', () => {
      store.createBranch('dev');
      store.switchBranch('dev');
      store.commit(makeCard({ name: 'dev 名' }), 'dev 改名');
      store.switchBranch('main');
      store.commit(makeCard({ name: 'main 名' }), 'main 改名');
      store.mergeBranch('dev');

      store.cancelMerge();
      expect(store.hasPendingConflicts).toBe(false);
    });

    it('mergeBranch 不存在源分支失败', () => {
      const ok = store.mergeBranch('nonexistent');
      expect(ok).toBe(false);
    });

    it('mergeBranch 合并自己失败', () => {
      store.createBranch('dev');
      store.switchBranch('dev');
      const ok = store.mergeBranch('dev');
      expect(ok).toBe(false);
      expect(store.lastError).toContain('不能合并自己');
    });
  });

  // ── 回滚 ──

  describe('回滚', () => {
    beforeEach(() => {
      store.selectCharacter('seraphina');
    });

    it('rollbackTo 创建新提交回到指定版本', () => {
      const v1 = store.headVersion!.id;
      const v1Name = store.headVersion!.snapshot.name;
      store.commit(makeCard({ name: 'v2' }), 'v2');
      const ok = store.rollbackTo(v1, '回到 v1');
      expect(ok).toBe(true);
      expect(store.headVersion!.snapshot.name).toBe(v1Name);
      expect(store.headVersion!.message).toContain('回到 v1');
      // 历史保留
      expect(store.history.length).toBe(3);
    });

    it('rollbackTo 不存在版本失败', () => {
      const ok = store.rollbackTo('nonexistent');
      expect(ok).toBe(false);
    });
  });

  // ── 操作锁 ──

  describe('操作锁', () => {
    beforeEach(() => {
      store.selectCharacter('seraphina');
    });

    it('acquireLock 获取全字段锁', () => {
      const ok = store.acquireLock('*');
      expect(ok).toBe(true);
      expect(store.currentRepoInfo!.activeLocks.length).toBe(1);
    });

    it('releaseAllLocks 释放当前作者全部锁', () => {
      store.acquireLock('name');
      store.acquireLock('description');
      store.releaseAllLocks();
      expect(store.currentRepoInfo!.activeLocks.length).toBe(0);
    });

    it('purgeExpiredLocks 清理过期锁', async () => {
      store.acquireLock('*', 1);
      await new Promise((r) => setTimeout(r, 10));
      const n = store.purgeExpiredLocks();
      expect(n).toBe(1);
    });

    it('切换作者后冲突锁失败', () => {
      store.acquireLock('*');
      store.setAuthor({ name: '其他用户' });
      const ok = store.acquireLock('*');
      expect(ok).toBe(false);
    });
  });

  // ── 作者切换 ──

  describe('作者切换', () => {
    it('setAuthor 切换当前操作者', () => {
      store.setAuthor({ name: 'Alice', avatar: 'http://example.com/a.png' });
      expect(store.author.name).toBe('Alice');
      expect(store.author.avatar).toBe('http://example.com/a.png');
    });

    it('setAuthor 后提交记录新作者', () => {
      store.selectCharacter('seraphina');
      store.setAuthor({ name: 'Bob' });
      store.commit(makeCard({ name: 'v2' }), 'Bob 提交');
      expect(store.headVersion!.author.name).toBe('Bob');
    });
  });

  // ── 综合集成 ──

  describe('综合集成', () => {
    it('完整流程：分支 → 修改 → 合并 → 回滚', () => {
      store.selectCharacter('seraphina');

      // main 上提交 v2（修改 name）
      store.commit(makeCard({ name: 'main-v2', description: 'main desc' }), 'main 提交');

      // 创建 dev 分支（分叉点 = main-v2）
      store.createBranch('dev');

      // main 在 fork 后再修改 name（产生分叉后的独立修改）
      store.commit(makeCard({ name: 'main-v3', description: 'main desc' }), 'main fork 后修改');

      // dev 也修改 name（基于 main-v2 的独立修改）
      store.switchBranch('dev');
      store.commit(makeCard({ name: 'dev-v1', description: 'main desc' }), 'dev 提交');

      // 切回 main 并合并 dev
      // 共同祖先 = main-v2 (name='main-v2')
      // main 改 name 为 'main-v3'，dev 改 name 为 'dev-v1' → 冲突
      store.switchBranch('main');
      const ok = store.mergeBranch('dev');
      expect(ok).toBe(false);
      expect(store.hasPendingConflicts).toBe(true);

      // 选择 dev 的 name
      const resolved = store.resolveConflicts({ name: 'source' });
      expect(resolved).toBe(true);
      expect(store.headVersion!.snapshot.name).toBe('dev-v1');

      // 回滚到 main-v3（合并前的 main HEAD）
      const mainV3 = store.history[1]; // history[0]=合并提交, history[1]=main-v3
      expect(mainV3).toBeDefined();
      store.rollbackTo(mainV3.id, '回滚到合并前');
      expect(store.headVersion!.snapshot.name).toBe('main-v3');
    });
  });
});
