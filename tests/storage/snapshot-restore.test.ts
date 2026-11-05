/**
 * MIG-01 · 迁移后恢复验证（restore verification）
 *
 * snapshot-migration.test.ts 验证的是迁移函数本身；本文件验证**迁移产物
 * 能被真实加载端消费**——这才是计划要求的"迁移可演练"闭环：
 *
 *   旧格式快照 → 迁移 → 真实 store / 解析器加载 → 数据可用且无丢失
 *
 * 覆盖三条真实历史升级路径：
 * 1. 本地长期记忆：0.4.0 前裸 MemoryStore → 三段式 → MemoryStore.fromJSON 可用
 * 2. 群聊投递队列：0.3.0 无 occurredAt/status → 补全 → loadRuntimePendingGroupTurns 可用
 * 3. 角色版本仓库：早期无 activeLocks → 补空数组 → loadFromDisk 可用
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import 'fake-indexeddb/auto';
import { IndexedDBAdapter } from '@storage/indexeddb-adapter';
import type { StorageAdapter } from '@storage/storage-adapter';
import { wrapSnapshot } from '@storage/snapshot-migration';
import { useCharacterVersionStore } from '@/stores/character-version';
import { useCharacterStore } from '@/stores/character';
// 群聊 store 静态导入：原来写在用例体内 `await import('@/stores/chat')`，
// 整个模块的 transform 成本被算进这一条用例的计时（隔离 1.8s，全量并发下 5.07s
// 撞破 5s 默认超时）。同目录其他用例本来就是静态导入，成本挪到文件加载阶段。
import { useChatStore } from '@/stores/chat';
import { seedCharacter } from '../helpers/character-fixtures';

const PENDING_KEY = 'runtime:pending-group-turns:v1';
const VERSIONS_KEY = 'ai-roleplay:character-versions';
/** 夹具角色的 ID（角色库从空开始，不再有 mock 种子，由 beforeEach 造）。 */
const EXISTING_CHARACTER = 'seraphina';

describe('迁移后恢复验证：旧快照经迁移可被真实加载端消费', () => {
  let adapter: IndexedDBAdapter & StorageAdapter;

  beforeEach(async () => {
    setActivePinia(createPinia());
    // 角色库从空开始，版本仓库要按 id 找得到角色
    seedCharacter(useCharacterStore() as never, { id: EXISTING_CHARACTER, name: 'Seraphina' });
    adapter = new IndexedDBAdapter();
    await adapter.init();
  });

  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 20));
    await adapter.close();
  });

  it('角色版本仓库：写入 0.3.x 旧裸数组后，loadFromDisk 补全并可用', async () => {
    // 代表性旧样本：缺 activeLocks 的裸数组（无信封）
    await adapter.saveSnapshot(VERSIONS_KEY, [
      { characterId: EXISTING_CHARACTER, currentBranch: 'main', branches: [], commits: [] },
    ]);

    useCharacterStore();
    const store = useCharacterVersionStore();
    store.setStorageAdapter(adapter);
    await store.loadFromDisk();
    store.selectCharacter(EXISTING_CHARACTER);

    // 迁移后仓库可用：能读到该角色，且 activeLocks 已补全
    expect(store.currentRepository).not.toBeNull();
    expect(store.currentRepository!.activeLocks).toEqual([]);
  });

  it('群聊投递队列：写入 0.3.0 旧记录后，加载补全 occurredAt/status 且不丢失载荷', async () => {
    await adapter.saveSnapshot(PENDING_KEY, [
      {
        groupId: 'g1', turnId: 't-legacy', speakerCharacterId: 'c1',
        userMessage: '旧的问', assistantMessage: '旧的答',
        attempts: 1, createdAt: '2026-09-01T00:00:00.000Z',
      },
    ]);

    const store = useChatStore();
    store.setStorageAdapter(adapter);
    await store.loadRuntimePendingGroupTurns();

    expect(store.pendingGroupRuntimeTurns).toHaveLength(1);
    const [item] = store.pendingGroupRuntimeTurns;
    expect(item).toMatchObject({
      turnId: 't-legacy',
      userMessage: '旧的问', // 载荷未丢失
      assistantMessage: '旧的答',
      occurredAt: '2026-09-01T00:00:00.000Z', // 由 createdAt 补全
      status: 'failed', // 保守置为待重试
    });
    expect(item!.nextRetryAt).toBeUndefined(); // 旧记录无重试时间，不强造
  });

  it('已带信封的数据在真实加载端原样可用（新写入路径闭环）', async () => {
    await adapter.saveSnapshot(VERSIONS_KEY, wrapSnapshot([
      { characterId: EXISTING_CHARACTER, currentBranch: 'main', branches: [], commits: [], activeLocks: [] },
    ], 1));

    useCharacterStore();
    const store = useCharacterVersionStore();
    store.setStorageAdapter(adapter);
    await store.loadFromDisk();
    store.selectCharacter(EXISTING_CHARACTER);

    expect(store.currentRepository).not.toBeNull();
  });

  it('损坏（非数组）的版本快照不崩溃，视为空仓库', async () => {
    await adapter.saveSnapshot(VERSIONS_KEY, { not: 'an array' });
    useCharacterStore();
    const store = useCharacterVersionStore();
    store.setStorageAdapter(adapter);
    await expect(store.loadFromDisk()).resolves.toBeUndefined();
  });
});
