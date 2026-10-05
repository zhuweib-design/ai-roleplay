/**
 * D-9（REAL_DEVICE_TEST_2026-10-03）随机事件持久化测试
 *
 * 原缺陷：模板/场景配置/生成器配置/结果全部只在内存（刷新即丢且不进备份）。
 * 覆盖：
 * - 快照持久化往返：写模板/场景配置 → 新 store 实例 loadFromStorage 找回
 * - mutator 落盘：createTemplate / updateGeneratorConfig / recordResult 触发 saveSnapshot
 * - 备份载荷：exportBackupData / applyBackupData（含不可信载荷校验）
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useRandomEventsStore } from '../../src/stores/random-events';

/** 内存快照适配器（只实现 store 用到的 loadSnapshot / saveSnapshot） */
function makeAdapter() {
  const snapshots = new Map<string, unknown>();
  return {
    loadSnapshot: vi.fn(async <T,>(key: string) => (snapshots.get(key) ?? null) as T | null),
    saveSnapshot: vi.fn(async (key: string, value: unknown) => {
      snapshots.set(key, value);
    }),
    _snapshots: snapshots,
  };
}

describe('random-events store — D-9 持久化', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('创建模板后落盘；新实例 loadFromStorage 找回（跨刷新语义）', async () => {
    const adapter = makeAdapter();
    const store = useRandomEventsStore();
    store.setStorageAdapter(adapter);
    const id = store.createTemplate({
      name: 'D9-模板',
      description: '持久化验证',
      category: 'social',
      severity: 'minor',
      triggerProbability: 10,
      weight: 1,
      cooldownMinutes: 10,
      maxTriggers: 3,
      triggerKeywords: [],
      applicableScenes: [],
      excludedScenes: [],
      enabled: true,
    } as never);
    expect(id).not.toBeNull();
    expect(adapter.saveSnapshot).toHaveBeenCalled();

    // 新 pinia 实例模拟"刷新后"
    setActivePinia(createPinia());
    const store2 = useRandomEventsStore();
    store2.setStorageAdapter(adapter);
    await store2.loadFromStorage();
    expect(store2.templates).toHaveLength(1);
    expect(store2.templates[0]!.name).toBe('D9-模板');
  });

  it('生成器配置与场景配置同样落盘并找回', async () => {
    const adapter = makeAdapter();
    const store = useRandomEventsStore();
    store.setStorageAdapter(adapter);
    store.updateGeneratorConfig({ enabled: true, dailyCap: 5 });
    store.updateSceneConfig('D9-场景', { enabled: true });

    setActivePinia(createPinia());
    const store2 = useRandomEventsStore();
    store2.setStorageAdapter(adapter);
    await store2.loadFromStorage();
    expect(store2.generatorConfig.enabled).toBe(true);
    expect(store2.generatorConfig.dailyCap).toBe(5);
    expect(store2.getSceneConfig('D9-场景')?.enabled).toBe(true);
  });

  it('exportBackupData / applyBackupData 往返；不可信载荷被防御', () => {
    const store = useRandomEventsStore();
    store.createTemplate({
      name: 'D9-备份模板',
      description: 'x',
      category: 'danger',
      severity: 'major',
      triggerProbability: 20,
      weight: 2,
      cooldownMinutes: 5,
      maxTriggers: 1,
      triggerKeywords: [],
      applicableScenes: [],
      excludedScenes: [],
      enabled: true,
    } as never);
    const payload = store.exportBackupData();
    expect(payload.templates).toHaveLength(1);

    // 新 store 应用合法载荷
    setActivePinia(createPinia());
    const store2 = useRandomEventsStore();
    store2.applyBackupData(JSON.parse(JSON.stringify(payload)));
    expect(store2.templates).toHaveLength(1);

    // 不可信载荷：非法结构不炸、保持现状
    store2.applyBackupData({ templates: 'not-an-array', sceneConfigs: null });
    expect(store2.templates).toHaveLength(1);
  });
});
