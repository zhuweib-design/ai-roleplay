/**
 * D-9（REAL_DEVICE_TEST_2026-10-03）备份往返集成测试
 *
 * 原缺陷的备份侧：随机事件状态（模板/场景配置/生成器配置/结果）不进备份，
 * 刷新即丢且备份还原也无法救回。修复后随 BackupData.randomEvents 带出/带回
 * （跟随 events 先例：服务层透传，调用方写回内存 store）。
 *
 * 本测试打通服务层管线：exportAll 携带 → validateBackup 通过 → importBackup
 * 透传 → store.applyBackupData 回写。各 store 写入选项全部关闭，聚焦随机事件通道。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { exportAll, importBackup } from '../../src/services/backup-service';
import { validateBackup } from '../../src/core/backup';
import { useRandomEventsStore } from '../../src/stores/random-events';
import type { StorageAdapter } from '../../src/storage/storage-adapter';

/** 最小 StorageAdapter 桩：各 store 数据为空，随机事件走内存 store */
function makeStubAdapter(): StorageAdapter {
  return {
    loadCharacters: vi.fn(async () => []),
    loadChats: vi.fn(async () => []),
    loadChat: vi.fn(async () => null),
    saveChat: vi.fn(async () => undefined),
    loadLorebooks: vi.fn(async () => []),
    saveLorebook: vi.fn(async () => undefined),
    loadGroupChats: vi.fn(async () => []),
    saveGroupChat: vi.fn(async () => undefined),
    loadPersonas: vi.fn(async () => []),
    loadSettings: vi.fn(async () => ({})),
    saveSettings: vi.fn(async () => undefined),
    loadStories: vi.fn(async () => []),
    saveStory: vi.fn(async () => undefined),
    loadSnapshot: vi.fn(async () => null),
    saveSnapshot: vi.fn(async () => undefined),
  } as unknown as StorageAdapter;
}

const IMPORT_NONE = {
  importCharacters: false,
  importChats: false,
  importLorebooks: false,
  importGroupChats: false,
  importPersonas: false,
  importStories: false,
  importRuntimeSnapshots: false,
  importSettings: false,
};

describe('D-9 备份往返 — 随机事件随 BackupData 带出/带回', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('exportAll 携带 randomEvents 且 validateBackup 通过', async () => {
    const store = useRandomEventsStore();
    store.createTemplate({
      name: 'D9-备份模板',
      description: '备份往返验证',
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
    store.updateSceneConfig('D9-场景', { enabled: true });

    const data = await exportAll(makeStubAdapter(), { randomEvents: store.exportBackupData() });
    expect(data.randomEvents).toBeDefined();
    expect(data.randomEvents!.templates).toHaveLength(1);
    expect(data.randomEvents!.sceneConfigs).toHaveLength(1);
    expect(validateBackup(data)).toEqual([]);
  });

  it('importBackup 透传 randomEvents；applyBackupData 回写恢复模板', async () => {
    const store = useRandomEventsStore();
    store.createTemplate({
      name: 'D9-备份模板',
      description: '备份往返验证',
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
    const data = await exportAll(makeStubAdapter(), { randomEvents: store.exportBackupData() });

    const result = await importBackup(makeStubAdapter(), data, IMPORT_NONE);
    expect(result.randomEvents).toBeDefined();
    expect(result.randomEvents!.templates).toHaveLength(1);

    // 新 store 实例回写（模拟"备份还原后"）
    setActivePinia(createPinia());
    const store2 = useRandomEventsStore();
    store2.applyBackupData(result.randomEvents!);
    expect(store2.templates).toHaveLength(1);
    expect(store2.templates[0]!.name).toBe('D9-备份模板');
  });

  it('不含 randomEvents 的旧备份照常导入（可选字段向后兼容）', async () => {
    const data = await exportAll(makeStubAdapter());
    expect(data.randomEvents).toBeUndefined();
    const result = await importBackup(makeStubAdapter(), data, IMPORT_NONE);
    expect(result.randomEvents).toBeUndefined();
    expect(result.errors).toEqual([]);
  });
});
