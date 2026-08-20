/**
 * story-importer 单元测试 (迭代32 · F16.2)
 *
 * 覆盖：
 * - 类型映射：mapWorldType, toWorldDescription, toLorebookEntryInput, toCharacterPatch, toEventPatch
 * - 导入世界：importWorld（add/overwrite/merge 策略）
 * - 导入场景：importScenes（层级结构建立）
 * - 导入人物：importCharacters（冲突处理）
 * - 导入事件：importEvents
 * - 一键导入：importAll
 * - 脚本导出：exportScriptsAsJson
 */
import { describe, test, expect, beforeEach } from 'vitest';
import {
  mapWorldType,
  toWorldDescription,
  toLorebookEntryInput,
  toCharacterPatch,
  toEventPatch,
  importWorld,
  importScenes,
  importCharacters,
  importEvents,
  importAll,
  exportScriptsAsJson,
  type CharacterImportPort,
  type LorebookImportPort,
  type EventsImportPort,
  type ImportTargets,
} from '@core/story-importer';
import type {
  StoryAnalysisResult,
  StoryCharacter,
  StoryScene,
  StoryEvent,
  StoryWorldInfo,
  StoryScript,
} from '@core/story-types';
import type { WorldDescription, LorebookEntry } from '@core/lorebook';
import type { StoryEvent as EventSystemEvent } from '@core/event-types';

// ── 测试夹具 ──

function makeStory(overrides: Partial<StoryAnalysisResult> = {}): StoryAnalysisResult {
  return {
    id: 'story-test',
    sourceFileName: 'test.txt',
    depth: 'standard',
    status: 'completed',
    createdAt: Date.now(),
    textLength: 1000,
    chunkCount: 1,
    worldInfo: {
      name: '艾尔多拉',
      type: '奇幻',
      description: '一个充满魔法的世界',
      coreSettings: ['魔法体系', '精灵文明'],
      factions: ['王国', '精灵议会'],
    },
    characters: [
      {
        name: '艾莉娅',
        aliases: ['小艾'],
        description: '精灵法师',
        relationships: [{ target: '勇者', relation: '同伴' }],
      },
    ],
    scenes: [
      { name: '王都', type: '城市', description: '繁华的王都' },
      { name: '王都市场', type: '市场', description: '热闹的市场', parent: '王都' },
    ],
    events: [
      {
        name: '决战',
        description: '最终决战',
        characters: ['勇者', '魔王'],
        scene: '王都',
        order: 1,
        type: '战斗',
      },
    ],
    scripts: [
      {
        name: '主线',
        content: '主线故事大纲',
        type: 'main',
        characters: ['勇者'],
        scenes: ['王都'],
      },
    ],
    ...overrides,
  };
}

// ── Mock Port 实现 ──

class MockCharacterPort implements CharacterImportPort {
  public created: Array<{ id: string; name: string }> = [];
  public updated: Array<{ id: string; patch: Record<string, unknown> }> = [];
  public existing: Array<{ id: string; name: string }> = [];

  createCharacter(): string {
    const id = `char-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    this.created.push({ id, name: '新角色' });
    return id;
  }

  updateCharacter(id: string, patch: Record<string, unknown>): boolean {
    this.updated.push({ id, patch });
    return true;
  }

  findCharacterByName(name: string): { id: string; name: string } | null {
    return this.existing.find((c) => c.name === name) ?? null;
  }
}

class MockLorebookPort implements LorebookImportPort {
  public entries: LorebookEntry[] = [];
  public worldDescription: WorldDescription | null = null;
  public addedEntries: Partial<LorebookEntry>[] = [];
  public updatedEntries: Array<{ id: string; patch: Partial<LorebookEntry> }> = [];
  public worldUpdated = false;

  getWorldDescription(): WorldDescription | null {
    return this.worldDescription;
  }

  updateWorldDescription(_lbId: string, wd: WorldDescription | null): boolean {
    this.worldDescription = wd;
    this.worldUpdated = true;
    return true;
  }

  getEntries(): LorebookEntry[] {
    return this.entries;
  }

  findEntryByTitle(_lbId: string, title: string): LorebookEntry | null {
    return this.entries.find((e) => e.title === title) ?? null;
  }

  addEntry(_lbId: string, input?: Partial<LorebookEntry>): string | null {
    const id = `entry-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    this.addedEntries.push(input ?? {});
    this.entries.push({
      id,
      title: input?.title ?? '新条目',
      keys: input?.keys ?? [],
      content: input?.content ?? '',
      strategy: input?.strategy ?? 'keyword',
      probability: input?.probability ?? 100,
      insertionOrder: input?.insertionOrder ?? 100,
      insertionPosition: input?.insertionPosition ?? 'afterCharDefs',
      depth: input?.depth ?? 4,
      group: input?.group ?? '',
      enabled: input?.enabled ?? true,
      logic: input?.logic ?? 'AND_ANY',
      hierarchyLevel: input?.hierarchyLevel ?? 0,
      parentId: input?.parentId ?? null,
    });
    return id;
  }

  updateEntry(_lbId: string, entryId: string, patch: Partial<LorebookEntry>): boolean {
    this.updatedEntries.push({ id: entryId, patch });
    const idx = this.entries.findIndex((e) => e.id === entryId);
    if (idx >= 0) {
      this.entries[idx]! = { ...this.entries[idx]!, ...patch };
    }
    return true;
  }
}

class MockEventsPort implements EventsImportPort {
  public created: Array<{ id: string; lbId: string; sceneName: string | null }> = [];
  public updated: Array<{ id: string; patch: Partial<EventSystemEvent> }> = [];
  public existing: EventSystemEvent[] = [];

  createEvent(lbId: string, _sceneEntryId: string | null, sceneName: string | null): string | null {
    const id = `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    this.created.push({ id, lbId, sceneName });
    return id;
  }

  updateEvent(id: string, patch: Partial<EventSystemEvent>): boolean {
    this.updated.push({ id, patch });
    return true;
  }

  findEventByName(name: string): EventSystemEvent | null {
    return this.existing.find((e) => e.name === name) ?? null;
  }
}

// ── 测试用例 ──

describe('story-importer (F16.2)', () => {
  let charPort: MockCharacterPort;
  let lbPort: MockLorebookPort;
  let evtPort: MockEventsPort;
  let targets: ImportTargets;

  beforeEach(() => {
    charPort = new MockCharacterPort();
    lbPort = new MockLorebookPort();
    evtPort = new MockEventsPort();
    targets = { character: charPort, lorebook: lbPort, events: evtPort };
  });

  // ── 类型映射 ──

  describe('mapWorldType', () => {
    test('奇幻映射为 fantasy', () => {
      expect(mapWorldType('奇幻')).toBe('fantasy');
    });

    test('fantasy 透传', () => {
      expect(mapWorldType('fantasy')).toBe('fantasy');
    });

    test('科幻映射为 scifi', () => {
      expect(mapWorldType('科幻')).toBe('scifi');
    });

    test('scifi 透传', () => {
      expect(mapWorldType('sci-fi')).toBe('scifi');
    });

    test('太空映射为 scifi', () => {
      expect(mapWorldType('太空歌剧')).toBe('scifi');
    });

    test('现代映射为 modern', () => {
      expect(mapWorldType('现代')).toBe('modern');
    });

    test('都市映射为 modern', () => {
      expect(mapWorldType('都市')).toBe('modern');
    });

    test('历史映射为 historical', () => {
      expect(mapWorldType('历史')).toBe('historical');
    });

    test('古代映射为 historical', () => {
      expect(mapWorldType('古代')).toBe('historical');
    });

    test('未知类型回退为 other', () => {
      expect(mapWorldType('未知类型')).toBe('other');
    });

    test('空字符串回退为 other', () => {
      expect(mapWorldType('')).toBe('other');
    });
  });

  describe('toWorldDescription', () => {
    test('映射所有字段', () => {
      const world: StoryWorldInfo = {
        name: '艾尔多拉',
        type: '奇幻',
        description: '魔法世界',
        coreSettings: ['魔法体系'],
        factions: ['王国', '议会'],
      };
      const wd = toWorldDescription(world);
      expect(wd.name).toBe('艾尔多拉');
      expect(wd.type).toBe('fantasy');
      expect(wd.content).toContain('魔法世界');
      expect(wd.content).toContain('魔法体系');
      expect(wd.content).toContain('王国');
      expect(wd.keys).toContain('艾尔多拉');
    });

    test('无 factions 时 keys 仅含 name', () => {
      const wd = toWorldDescription({
        name: '世界',
        type: 'other',
        description: '描述',
      });
      expect(wd.keys).toContain('世界');
      expect(wd.keys.length).toBe(1);
    });
  });

  describe('toLorebookEntryInput', () => {
    test('顶层场景 hierarchyLevel=1', () => {
      const scene: StoryScene = {
        name: '王都',
        type: '城市',
        description: '繁华王都',
      };
      const input = toLorebookEntryInput(scene, null);
      expect(input.title).toBe('王都');
      expect(input.hierarchyLevel).toBe(1);
      expect(input.parentId).toBeNull();
      expect(input.keys).toContain('王都');
    });

    test('子场景 hierarchyLevel=2', () => {
      const scene: StoryScene = {
        name: '市场',
        type: '市场',
        description: '热闹市场',
        parent: '王都',
      };
      const input = toLorebookEntryInput(scene, 'entry-123');
      expect(input.hierarchyLevel).toBe(2);
      expect(input.parentId).toBe('entry-123');
    });
  });

  describe('toCharacterPatch', () => {
    test('映射基础字段', () => {
      const char: StoryCharacter = {
        name: '艾莉娅',
        aliases: ['小艾'],
        description: '精灵法师',
      };
      const patch = toCharacterPatch(char);
      expect(patch.name).toBe('艾莉娅');
      expect(patch.description).toContain('精灵法师');
      expect(patch.description).toContain('小艾');
      expect(patch.tags).toEqual(['小艾']);
    });

    test('无别名时 tags 为默认', () => {
      const patch = toCharacterPatch({
        name: '角色',
        description: '描述',
      });
      expect(patch.tags).toEqual(['故事导入']);
    });

    test('包含关系描述', () => {
      const patch = toCharacterPatch({
        name: '艾莉娅',
        description: '法师',
        relationships: [{ target: '勇者', relation: '同伴' }],
      });
      expect(patch.description).toContain('勇者');
      expect(patch.description).toContain('同伴');
    });
  });

  describe('toEventPatch', () => {
    test('映射事件字段', () => {
      const event: StoryEvent = {
        name: '决战',
        description: '最终决战',
        characters: ['勇者'],
        scene: '王都',
        order: 1,
        type: '战斗',
      };
      const patch = toEventPatch(event);
      expect(patch.name).toBe('决战');
      expect(patch.description).toBe('最终决战');
      expect(patch.sceneName).toBe('王都');
      expect(patch.probability).toBe(100);
      expect(patch.repeatable).toBe(false);
    });

    test('无场景时 sceneName 为 null', () => {
      const patch = toEventPatch({
        name: '事件',
        description: '描述',
        characters: [],
        order: 1,
        type: '对话',
      });
      expect(patch.sceneName).toBeNull();
    });
  });

  // ── 导入世界 ──

  describe('importWorld', () => {
    test('add 策略：无冲突时成功导入', () => {
      const story = makeStory();
      const results = importWorld(story, 'lb-1', lbPort, 'add');
      expect(results).toHaveLength(1);
      expect(results[0]!.success).toBe(true);
      expect(results[0]!.type).toBe('lorebook');
      expect(lbPort.worldUpdated).toBe(true);
      expect(lbPort.worldDescription?.name).toBe('艾尔多拉');
    });

    test('add 策略：已有世界描述时跳过', () => {
      lbPort.worldDescription = {
        name: '已有世界',
        type: 'fantasy',
        keys: ['已有'],
        content: '已有描述',
      };
      const story = makeStory();
      const results = importWorld(story, 'lb-1', lbPort, 'add');
      expect(results).toHaveLength(1);
      expect(results[0]!.success).toBe(false);
      expect(results[0]!.error).toContain('add 策略');
    });

    test('overwrite 策略：覆盖已有世界描述', () => {
      lbPort.worldDescription = {
        name: '旧世界',
        type: 'other',
        keys: ['旧'],
        content: '旧描述',
      };
      const story = makeStory();
      const results = importWorld(story, 'lb-1', lbPort, 'overwrite');
      expect(results[0]!.success).toBe(true);
      expect(lbPort.worldDescription?.name).toBe('艾尔多拉');
    });

    test('merge 策略：合并描述内容', () => {
      lbPort.worldDescription = {
        name: '旧世界',
        type: 'fantasy',
        keys: ['旧关键字'],
        content: '旧描述',
      };
      const story = makeStory();
      const results = importWorld(story, 'lb-1', lbPort, 'merge');
      expect(results[0]!.success).toBe(true);
      expect(lbPort.worldDescription?.content).toContain('旧描述');
      expect(lbPort.worldDescription?.content).toContain('充满魔法');
      expect(lbPort.worldDescription?.keys).toContain('旧关键字');
    });

    test('无世界信息时返回空数组', () => {
      const story = makeStory({ worldInfo: undefined });
      const results = importWorld(story, 'lb-1', lbPort, 'add');
      expect(results).toHaveLength(0);
    });
  });

  // ── 导入场景 ──

  describe('importScenes', () => {
    test('导入顶层和子场景，建立层级关系', () => {
      const story = makeStory();
      const results = importScenes(story, 'lb-1', lbPort, 'add');
      expect(results).toHaveLength(2);
      expect(results.every((r) => r.success)).toBe(true);

      // 验证层级
      const topEntry = lbPort.entries.find((e) => e.title === '王都');
      const childEntry = lbPort.entries.find((e) => e.title === '王都市场');
      expect(topEntry).toBeDefined();
      expect(topEntry?.hierarchyLevel).toBe(1);
      expect(childEntry).toBeDefined();
      expect(childEntry?.hierarchyLevel).toBe(2);
      expect(childEntry?.parentId).toBe(topEntry?.id);
    });

    test('add 策略：已有同名条目时跳过', () => {
      lbPort.entries.push({
        id: 'existing-1',
        title: '王都',
        keys: ['王都'],
        content: '已有',
        strategy: 'keyword',
        probability: 100,
        insertionOrder: 100,
        insertionPosition: 'afterCharDefs',
        depth: 4,
        group: '',
        enabled: true,
        logic: 'AND_ANY',
        hierarchyLevel: 0,
        parentId: null,
      });
      const story = makeStory();
      const results = importScenes(story, 'lb-1', lbPort, 'add');
      const wanguoResult = results.find((r) => r.name === '王都');
      expect(wanguoResult?.success).toBe(false);
      expect(wanguoResult?.error).toContain('add 策略');
    });

    test('overwrite 策略：更新已有条目', () => {
      lbPort.entries.push({
        id: 'existing-1',
        title: '王都',
        keys: ['王都'],
        content: '旧内容',
        strategy: 'keyword',
        probability: 100,
        insertionOrder: 100,
        insertionPosition: 'afterCharDefs',
        depth: 4,
        group: '',
        enabled: true,
        logic: 'AND_ANY',
        hierarchyLevel: 0,
        parentId: null,
      });
      const story = makeStory();
      const results = importScenes(story, 'lb-1', lbPort, 'overwrite');
      const wanguoResult = results.find((r) => r.name === '王都');
      expect(wanguoResult?.success).toBe(true);
      const entry = lbPort.entries.find((e) => e.title === '王都');
      expect(entry?.content).toContain('繁华的王都');
    });

    test('merge 策略：追加内容', () => {
      lbPort.entries.push({
        id: 'existing-1',
        title: '王都',
        keys: ['王都'],
        content: '旧内容',
        strategy: 'keyword',
        probability: 100,
        insertionOrder: 100,
        insertionPosition: 'afterCharDefs',
        depth: 4,
        group: '',
        enabled: true,
        logic: 'AND_ANY',
        hierarchyLevel: 0,
        parentId: null,
      });
      const story = makeStory();
      importScenes(story, 'lb-1', lbPort, 'merge');
      const entry = lbPort.entries.find((e) => e.title === '王都');
      expect(entry?.content).toContain('旧内容');
      expect(entry?.content).toContain('繁华的王都');
    });

    test('无场景时返回空数组', () => {
      const story = makeStory({ scenes: [] });
      const results = importScenes(story, 'lb-1', lbPort, 'add');
      expect(results).toHaveLength(0);
    });
  });

  // ── 导入人物 ──

  describe('importCharacters', () => {
    test('add 策略：新建角色', () => {
      const story = makeStory();
      const results = importCharacters(story, charPort, 'add');
      expect(results).toHaveLength(1);
      expect(results[0]!.success).toBe(true);
      expect(charPort.created).toHaveLength(1);
      expect(charPort.updated).toHaveLength(1);
    });

    test('add 策略：已有同名角色时跳过', () => {
      charPort.existing.push({ id: 'existing-char', name: '艾莉娅' });
      const story = makeStory();
      const results = importCharacters(story, charPort, 'add');
      expect(results[0]!.success).toBe(false);
      expect(results[0]!.error).toContain('add 策略');
    });

    test('overwrite 策略：覆盖已有角色', () => {
      charPort.existing.push({ id: 'existing-char', name: '艾莉娅' });
      const story = makeStory();
      const results = importCharacters(story, charPort, 'overwrite');
      expect(results[0]!.success).toBe(true);
      expect(charPort.updated).toHaveLength(1);
      expect(charPort.updated[0]!.id).toBe('existing-char');
    });

    test('merge 策略：追加描述', () => {
      charPort.existing.push({ id: 'existing-char', name: '艾莉娅' });
      const story = makeStory();
      const results = importCharacters(story, charPort, 'merge');
      expect(results[0]!.success).toBe(true);
      expect(charPort.updated).toHaveLength(1);
    });

    test('多人物导入', () => {
      const story = makeStory({
        characters: [
          { name: '角色A', description: '描述A' },
          { name: '角色B', description: '描述B' },
          { name: '角色C', description: '描述C' },
        ],
      });
      const results = importCharacters(story, charPort, 'add');
      expect(results).toHaveLength(3);
      expect(results.every((r) => r.success)).toBe(true);
      expect(charPort.created).toHaveLength(3);
    });
  });

  // ── 导入事件 ──

  describe('importEvents', () => {
    test('add 策略：新建事件', () => {
      const story = makeStory();
      const results = importEvents(story, 'lb-1', evtPort, 'add');
      expect(results).toHaveLength(1);
      expect(results[0]!.success).toBe(true);
      expect(evtPort.created).toHaveLength(1);
      expect(evtPort.created[0]!.lbId).toBe('lb-1');
    });

    test('add 策略：已有同名事件时跳过', () => {
      evtPort.existing.push({
        id: 'existing-evt',
        name: '决战',
        description: '旧描述',
        lorebookId: 'lb-1',
        sceneEntryId: null,
        sceneName: null,
        trigger: {} as never,
        completion: {} as never,
        probability: 100,
        state: 'pending',
        repeatable: false,
        triggerCount: 0,
        createdAt: '',
        updatedAt: '',
      });
      const story = makeStory();
      const results = importEvents(story, 'lb-1', evtPort, 'add');
      expect(results[0]!.success).toBe(false);
    });

    test('overwrite 策略：更新已有事件', () => {
      evtPort.existing.push({
        id: 'existing-evt',
        name: '决战',
        description: '旧描述',
        lorebookId: 'lb-1',
        sceneEntryId: null,
        sceneName: null,
        trigger: {} as never,
        completion: {} as never,
        probability: 100,
        state: 'pending',
        repeatable: false,
        triggerCount: 0,
        createdAt: '',
        updatedAt: '',
      });
      const story = makeStory();
      const results = importEvents(story, 'lb-1', evtPort, 'overwrite');
      expect(results[0]!.success).toBe(true);
      expect(evtPort.updated).toHaveLength(1);
    });
  });

  // ── 一键导入 ──

  describe('importAll', () => {
    test('导入所有类别', () => {
      const story = makeStory();
      const results = importAll(story, 'lb-1', targets, 'add');
      // 1 世界 + 2 场景 + 1 人物 + 1 事件 = 5
      expect(results).toHaveLength(5);
      expect(results.every((r) => r.success)).toBe(true);
    });

    test('无世界信息时不导入世界', () => {
      const story = makeStory({ worldInfo: undefined });
      const results = importAll(story, 'lb-1', targets, 'add');
      expect(results.find((r) => r.type === 'lorebook')).toBeUndefined();
    });

    test('无人物时不导入人物', () => {
      const story = makeStory({ characters: [] });
      const results = importAll(story, 'lb-1', targets, 'add');
      expect(results.find((r) => r.type === 'character')).toBeUndefined();
    });
  });

  // ── 脚本导出 ──

  describe('exportScriptsAsJson', () => {
    test('生成有效 JSON', () => {
      const scripts: StoryScript[] = [
        {
          name: '主线',
          content: '大纲',
          type: 'main',
          characters: ['勇者'],
          scenes: ['王都'],
        },
      ];
      const json = exportScriptsAsJson(scripts);
      const parsed = JSON.parse(json);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].name).toBe('主线');
      expect(parsed[0].type).toBe('main');
    });

    test('空数组生成空 JSON 数组', () => {
      expect(exportScriptsAsJson([])).toBe('[]');
    });
  });
});
