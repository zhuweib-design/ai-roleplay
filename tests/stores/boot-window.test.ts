/**
 * 首帧加载窗口：用户在"存档还在读"的时候动手，不能丢东西（M9-c）
 *
 * `App.vue` 是在 `onMounted` 里才 `await` 各 store 的 `loadFromStorage()`——界面已经挂好、
 * 按钮已经能点，列表还在读。这个窗口里用户做的动作有两类后果，这里各钉一条：
 *
 * 1. **整数组替换**（世界书 / 故事 / 群聊 / 数据银行 / 角色）：加载完成时
 *    `xxx.value = list` 会把窗口内刚新建的那条从界面上抹掉。它在存档里，但 store 里
 *    `find` 不到 ⇒ 后续对它的编辑静默失效。现在按 id 合并保留（`core/store-merge`）。
 * 2. **整份快照写入**（随机事件，与设置 store 同形状）：窗口内的写入落的是
 *    "还没读到存档的内存"，会把已有的模板与历史整批换掉。现在排队到加载落地之后。
 *
 * 角色 store 额外一条：它以 mock 种子初始化，合并时**不能**把种子当成用户新建的记录，
 * 否则存储里的角色永远盖不掉 mock。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { mergeKeptLocal } from '@/core/store-merge';
import { useLorebookStore } from '@/stores/lorebook';
import { useRandomEventsStore } from '@/stores/random-events';
import { useCharacterStore } from '@/stores/character';
import { wrapSnapshot } from '@/storage/snapshot-migration';

function book(id: string, name: string) {
  return {
    id,
    name,
    description: '',
    scope: 'global',
    active: true,
    entries: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('mergeKeptLocal', () => {
  it('保留"存档没有、内存已有"的记录，其余以存档为准', () => {
    const archived = [book('a', '存档甲'), book('b', '存档乙')];
    const local = [book('b', '存档乙改过'), book('c', '窗口内新建')];
    const merged = mergeKeptLocal(archived, local);
    expect(merged.map((x) => x.id)).toEqual(['a', 'b', 'c']);
    // 重叠的那条取存档版本（用户后来还会从存档版本继续编辑，不做静默合并）
    expect(merged.find((x) => x.id === 'b')?.name).toBe('存档乙');
  });

  it('种子 id 不参与保留，且没有新增时不产生新数组', () => {
    const archived = [book('a', '存档甲')];
    const local = [book('seed-1', 'mock 角色')];
    expect(mergeKeptLocal(archived, local, new Set(['seed-1']))).toBe(archived);
  });
});

describe('世界书 store 的加载窗口', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('窗口内新建的书在加载落地后仍在列表里，并且还能被编辑', async () => {
    const store = useLorebookStore();
    const saved: Array<{ id: string; name: string }> = [];
    let release!: () => void;
    store.setStorageAdapter({
      loadLorebooks: () =>
        new Promise((resolve) => {
          release = () => resolve([book('lb-archived', '存档里的书')] as never);
        }),
      saveLorebook: (lb: { id: string; name: string }) => {
        saved.push({ id: lb.id, name: lb.name });
        return Promise.resolve();
      },
    } as never);

    const loading = store.loadFromStorage();
    const newId = store.createLorebook({ name: '窗口内新建', description: '' });
    release();
    await loading;
    await new Promise((r) => setTimeout(r, 20));

    expect(store.lorebooks.map((l) => l.name)).toContain('窗口内新建');
    expect(store.lorebooks.map((l) => l.name)).toContain('存档里的书');

    // 关键：还能改。整数组替换把它从内存抹掉时，updateLorebook 会 find 不到而静默失效
    store.updateLorebook(newId, { name: '窗口内新建·已改名' });
    await new Promise((r) => setTimeout(r, 20));
    expect(saved.some((s) => s.id === newId && s.name === '窗口内新建·已改名')).toBe(true);
  });
});

describe('随机事件 store 的加载窗口', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('窗口内的写入不得把已有模板整批换掉', async () => {
    const store = useRandomEventsStore();
    const written: unknown[] = [];
    let release!: () => void;
    const template = {
      id: 'tpl-1',
      name: '存档模板',
      category: '环境',
      severity: 'minor',
      description: '桥上塌了',
      keywords: ['桥'],
      enabled: true,
    };
    store.setStorageAdapter({
      loadSnapshot: () =>
        new Promise((resolve) => {
          release = () =>
            resolve(
              wrapSnapshot(
                { templates: [template], sceneConfigs: [], generatorConfig: { enabled: false, defaultProbability: 30 }, results: [] },
                1
              ) as never
            );
        }),
      saveSnapshot: (_key: string, envelope: unknown) => {
        written.push(envelope);
        return Promise.resolve();
      },
    } as never);

    const loading = store.loadFromStorage();
    // 用户在加载落地前就动了生成器开关
    store.updateGeneratorConfig({ enabled: true });
    release();
    await loading;
    await new Promise((r) => setTimeout(r, 30));

    // 存档里那条模板必须还在（摘掉排队闸门时，这里会因为落了一份"空模板 + 这次改动"而红）
    expect(store.templates.map((t) => t.id)).toContain('tpl-1');
    // 用户那次开关也要保住（M9-a 的排队 + 落盘读的是最新内存）
    expect(store.generatorConfig.enabled).toBe(true);
    const last = written[written.length - 1] as { data?: { templates?: unknown[] } };
    expect((last?.data?.templates ?? []).length).toBe(1);
  });
});

describe('角色 store 的加载窗口', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('mock 种子不算"用户在窗口内新建的记录"，存档仍覆盖它', async () => {
    const store = useCharacterStore();
    const seedIds = store.characters.map((c) => c.id);
    expect(seedIds.length, '角色 store 以 mock 种子初始化').toBeGreaterThan(0);

    store.setStorageAdapter({
      loadCharacters: () =>
        Promise.resolve([
          {
            id: 'saved-1',
            name: '存档角色',
            avatar: '',
            description: '',
            personality: '',
            scenario: '',
            tags: [],
            favorite: false,
            characterNote: '',
          },
        ] as never),
      saveCharacter: () => Promise.resolve(),
      loadCharacter: () => Promise.resolve(null),
      deleteCharacter: () => Promise.resolve(),
    } as never);

    await store.loadFromStorage();

    expect(store.characters.map((c) => c.id)).toEqual(['saved-1']);
  });
});
