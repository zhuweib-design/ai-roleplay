import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import 'fake-indexeddb/auto';
import { useCharacterStore } from '../../src/stores/character';
import { IndexedDBAdapter } from '@storage/indexeddb-adapter';

// Polyfill: jsdom 环境下 File.text() 可能不可用
if (typeof File !== 'undefined' && !File.prototype.text) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (File.prototype as any).text = function (this: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(this);
    });
  };
}

// ── 测试夹具 ──

/** 构造合法的 SillyTavern V2 卡 JSON
 * @param dataOverrides 覆盖 data 字段下的属性
 */
function makeV2CardJson(dataOverrides: Record<string, unknown> = {}): unknown {
  return {
    spec: 'chara_card_v2',
    spec_version: '2.0',
    data: {
      name: 'ImportedChar',
      description: '从 V2 导入的角色',
      personality: '温柔',
      scenario: '咖啡馆',
      first_mes: '你好呀',
      mes_example: '',
      creator_notes: '作者备注',
      system_prompt: '',
      post_history_instructions: '作者深度注入',
      tags: ['奇幻', '战士'],
      creator: 'tester',
      character_version: '1.0',
      alternate_greetings: [],
      extensions: {},
      ...dataOverrides,
    },
  };
}

/**
 * 构造 File 对象（用于 V2 导入测试）
 */
function makeJsonFile(content: string, name = 'card.json'): File {
  return new File([content], name, { type: 'application/json' });
}

/**
 * 删除数据库以确保测试间隔离
 */
async function resetDatabase(name: string): Promise<void> {
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

// ── 测试用例 ──

describe('useCharacterStore — E5 单元测试', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('初始状态', () => {
    it('应预填 mock 角色数据', () => {
      const store = useCharacterStore();
      expect(store.characters.length).toBeGreaterThan(0);
    });

    it('应有默认的 currentCharacterId', () => {
      const store = useCharacterStore();
      expect(store.currentCharacterId).toBeTruthy();
    });

    it('currentCharacter 应返回当前激活角色', () => {
      const store = useCharacterStore();
      expect(store.currentCharacter).toBeDefined();
      expect(store.currentCharacter.id).toBe(store.currentCharacterId);
    });
  });

  describe('搜索过滤', () => {
    it('searchQuery 为空时应返回全部角色', () => {
      const store = useCharacterStore();
      store.setSearchQuery('');
      expect(store.filteredCharacters.length).toBe(store.characters.length);
    });

    it('按名称过滤应正常工作', () => {
      const store = useCharacterStore();
      // 取一个已知角色名作为关键词
      const firstName = store.characters[0].name;
      store.setSearchQuery(firstName);
      expect(store.filteredCharacters.some((c) => c.name === firstName)).toBe(true);
    });

    it('按标签过滤应正常工作', () => {
      const store = useCharacterStore();
      const firstTags = store.characters[0].tags;
      if (firstTags.length > 0) {
        store.setSearchQuery(firstTags[0]);
        expect(store.filteredCharacters.length).toBeGreaterThan(0);
      }
    });

    it('搜索关键词不匹配时应返回空', () => {
      const store = useCharacterStore();
      store.setSearchQuery('___no_match_zzz___');
      expect(store.filteredCharacters.length).toBe(0);
    });

    it('favorites 应只包含 favorite=true 的角色', () => {
      const store = useCharacterStore();
      // 手动构造一个 favorite
      const char = store.characters[0];
      const oldFav = char.favorite;
      char.favorite = true;
      expect(store.favorites.every((c) => c.favorite)).toBe(true);
      char.favorite = oldFav;
    });

    it('others 应只包含 favorite=false 的角色', () => {
      const store = useCharacterStore();
      expect(store.others.every((c) => !c.favorite)).toBe(true);
    });
  });

  describe('抽屉与导航状态', () => {
    it('togglePanel 应切换 panelOpen', () => {
      const store = useCharacterStore();
      const before = store.panelOpen;
      store.togglePanel();
      expect(store.panelOpen).toBe(!before);
    });

    it('toggleCharacterList 应切换 characterListOpen', () => {
      const store = useCharacterStore();
      const before = store.characterListOpen;
      store.toggleCharacterList();
      expect(store.characterListOpen).toBe(!before);
    });

    it('closeAllDrawers 应同时关闭 panelOpen 与 characterListOpen', () => {
      const store = useCharacterStore();
      store.panelOpen = true;
      store.characterListOpen = true;
      store.closeAllDrawers();
      expect(store.panelOpen).toBe(false);
      expect(store.characterListOpen).toBe(false);
    });

    it('setNav 应更新 currentNav', () => {
      const store = useCharacterStore();
      store.setNav('character');
      expect(store.currentNav).toBe('character');
    });

    it('selectCharacter 应更新 currentCharacterId', () => {
      const store = useCharacterStore();
      const target = store.characters[0];
      store.selectCharacter(target.id);
      expect(store.currentCharacterId).toBe(target.id);
    });
  });

  describe('CRUD 操作', () => {
    it('createCharacter 应生成新角色并加入列表', () => {
      const store = useCharacterStore();
      const before = store.characters.length;
      const newId = store.createCharacter();
      expect(store.characters.length).toBe(before + 1);
      const found = store.characters.find((c) => c.id === newId);
      expect(found).toBeDefined();
      expect(found!.name).toBe('新角色');
      expect(store.currentCharacterId).toBe(newId);
    });

    it('updateCharacter 应合并 patch 字段', () => {
      const store = useCharacterStore();
      const newId = store.createCharacter();
      const ok = store.updateCharacter(newId, { name: '改后的名', model: 'claude-3' });
      expect(ok).toBe(true);
      const found = store.characters.find((c) => c.id === newId);
      expect(found!.name).toBe('改后的名');
      expect(found!.model).toBe('claude-3');
    });

    it('updateCharacter 不存在的 id 应返回 false', () => {
      const store = useCharacterStore();
      const ok = store.updateCharacter('___nonexistent___', { name: 'x' });
      expect(ok).toBe(false);
    });

    it('updateCharacter 应更新 lastActive 为 "刚刚"', () => {
      const store = useCharacterStore();
      const newId = store.createCharacter();
      // 修改后再读
      store.characters.find((c) => c.id === newId)!.lastActive = '1 小时前';
      store.updateCharacter(newId, { description: 'updated' });
      const found = store.characters.find((c) => c.id === newId);
      expect(found!.lastActive).toBe('刚刚');
    });

    it('deleteCharacter 应从列表中移除', () => {
      const store = useCharacterStore();
      const newId = store.createCharacter();
      const before = store.characters.length;
      store.deleteCharacter(newId);
      expect(store.characters.length).toBe(before - 1);
      expect(store.characters.find((c) => c.id === newId)).toBeUndefined();
    });

    it('deleteCharacter 删除当前角色时应切换 currentCharacterId', () => {
      const store = useCharacterStore();
      const newId = store.createCharacter();
      expect(store.currentCharacterId).toBe(newId);
      store.deleteCharacter(newId);
      expect(store.currentCharacterId).not.toBe(newId);
    });

    it('deleteCharacter 不存在的 id 应安全无副作用', () => {
      const store = useCharacterStore();
      const before = store.characters.length;
      store.deleteCharacter('___nonexistent___');
      expect(store.characters.length).toBe(before);
    });

    it('toggleFavorite 应切换收藏状态', () => {
      const store = useCharacterStore();
      const newId = store.createCharacter();
      const before = store.characters.find((c) => c.id === newId)!.favorite;
      store.toggleFavorite(newId);
      expect(store.characters.find((c) => c.id === newId)!.favorite).toBe(!before);
    });

    it('toggleWorldEntry 应切换 worldEntry.enabled', () => {
      const store = useCharacterStore();
      const newId = store.createCharacter();
      // 注入一个 world entry
      const char = store.characters.find((c) => c.id === newId)!;
      char.worldEntries = [{ id: 'w1', name: '世界观 1', enabled: true }];
      store.toggleWorldEntry(newId, 'w1');
      expect(char.worldEntries[0].enabled).toBe(false);
    });
  });

  describe('需求7：角色与世界书双向绑定', () => {
    it('getBoundWorldBookIds 未设置时应返回空数组', () => {
      const store = useCharacterStore();
      const newId = store.createCharacter();
      expect(store.getBoundWorldBookIds(newId)).toEqual([]);
    });

    it('bindWorldBook 应添加世界书 ID 到 boundWorldBookIds', () => {
      const store = useCharacterStore();
      const newId = store.createCharacter();
      store.bindWorldBook(newId, 'lb-1');
      store.bindWorldBook(newId, 'lb-2');
      expect(store.getBoundWorldBookIds(newId)).toEqual(['lb-1', 'lb-2']);
    });

    it('bindWorldBook 重复绑定应幂等（返回 false 不重复添加）', () => {
      const store = useCharacterStore();
      const newId = store.createCharacter();
      const r1 = store.bindWorldBook(newId, 'lb-1');
      const r2 = store.bindWorldBook(newId, 'lb-1');
      expect(r1).toBe(true);
      expect(r2).toBe(false);
      expect(store.getBoundWorldBookIds(newId)).toEqual(['lb-1']);
    });

    it('unbindWorldBook 应移除指定世界书 ID', () => {
      const store = useCharacterStore();
      const newId = store.createCharacter();
      store.bindWorldBook(newId, 'lb-1');
      store.bindWorldBook(newId, 'lb-2');
      const removed = store.unbindWorldBook(newId, 'lb-1');
      expect(removed).toBe(true);
      expect(store.getBoundWorldBookIds(newId)).toEqual(['lb-2']);
    });

    it('unbindWorldBook 移除不存在的绑定应返回 false', () => {
      const store = useCharacterStore();
      const newId = store.createCharacter();
      const removed = store.unbindWorldBook(newId, 'lb-not-exist');
      expect(removed).toBe(false);
    });

    it('isWorldBookBound 应正确判断绑定状态', () => {
      const store = useCharacterStore();
      const newId = store.createCharacter();
      store.bindWorldBook(newId, 'lb-1');
      expect(store.isWorldBookBound(newId, 'lb-1')).toBe(true);
      expect(store.isWorldBookBound(newId, 'lb-2')).toBe(false);
    });

    it('toggleWorldBookBinding 应切换绑定状态', () => {
      const store = useCharacterStore();
      const newId = store.createCharacter();
      // 初始未绑定 → 绑定
      const r1 = store.toggleWorldBookBinding(newId, 'lb-1');
      expect(r1).toBe(true);
      expect(store.isWorldBookBound(newId, 'lb-1')).toBe(true);
      // 已绑定 → 解绑
      const r2 = store.toggleWorldBookBinding(newId, 'lb-1');
      expect(r2).toBe(false);
      expect(store.isWorldBookBound(newId, 'lb-1')).toBe(false);
    });

    it('getCharacterIdsByWorldBook 应返回所有绑定该世界书的角色 ID（反向关系）', () => {
      const store = useCharacterStore();
      // 直接 push 使用唯一 ID 的角色，避免 createCharacter 时间戳冲突
      const id1 = 'test-char-bind-1';
      const id2 = 'test-char-bind-2';
      const id3 = 'test-char-bind-3';
      store.characters.push(
        { id: id1, name: 'C1', avatarType: 'gradient', lastActive: '', favorite: false, tags: [], description: '', model: '', conversations: [], messages: [], authorNote: '', authorDepth: 4, temperature: 1, maxTokens: 1, worldEntries: [], tokenBudget: { character: 0, worldInfo: 0, chatHistory: 0, remaining: 0 } },
        { id: id2, name: 'C2', avatarType: 'gradient', lastActive: '', favorite: false, tags: [], description: '', model: '', conversations: [], messages: [], authorNote: '', authorDepth: 4, temperature: 1, maxTokens: 1, worldEntries: [], tokenBudget: { character: 0, worldInfo: 0, chatHistory: 0, remaining: 0 } },
        { id: id3, name: 'C3', avatarType: 'gradient', lastActive: '', favorite: false, tags: [], description: '', model: '', conversations: [], messages: [], authorNote: '', authorDepth: 4, temperature: 1, maxTokens: 1, worldEntries: [], tokenBudget: { character: 0, worldInfo: 0, chatHistory: 0, remaining: 0 } }
      );
      // id1 和 id2 绑定 lb-shared，id3 绑定 lb-other
      store.bindWorldBook(id1, 'lb-shared');
      store.bindWorldBook(id2, 'lb-shared');
      store.bindWorldBook(id3, 'lb-other');
      const bound = store.getCharacterIdsByWorldBook('lb-shared');
      expect(bound).toContain(id1);
      expect(bound).toContain(id2);
      expect(bound).not.toContain(id3);
      expect(bound.length).toBe(2);
    });

    it('bindWorldBook 对不存在的角色 ID 应返回 false', () => {
      const store = useCharacterStore();
      const r = store.bindWorldBook('not-exist', 'lb-1');
      expect(r).toBe(false);
    });

    it('删除角色后反向查询不应返回该角色', () => {
      const store = useCharacterStore();
      const newId = store.createCharacter();
      store.bindWorldBook(newId, 'lb-1');
      expect(store.getCharacterIdsByWorldBook('lb-1')).toContain(newId);
      store.deleteCharacter(newId);
      expect(store.getCharacterIdsByWorldBook('lb-1')).not.toContain(newId);
    });
  });

  describe('依赖注入与持久化', () => {
    it('setStorageAdapter 应接受 IndexedDBAdapter 实例', async () => {
      await resetDatabase('test-char-store-di');
      const adapter = new IndexedDBAdapter('test-char-store-di');
      await adapter.init();

      const store = useCharacterStore();
      expect(() => store.setStorageAdapter(adapter)).not.toThrow();

      await adapter.close();
    });

    it('未注入 storageAdapter 时 persistCharacter 应静默跳过', async () => {
      const store = useCharacterStore();
      const newId = store.createCharacter();
      await expect(store.persistCharacter(newId)).resolves.toBeUndefined();
    });

    it('未注入 storageAdapter 时 loadFromStorage 应静默跳过', async () => {
      const store = useCharacterStore();
      await expect(store.loadFromStorage()).resolves.toBeUndefined();
    });

    it('未注入 storageAdapter 时 deleteFromStorage 应静默跳过', async () => {
      const store = useCharacterStore();
      await expect(store.deleteFromStorage('any')).resolves.toBeUndefined();
    });

    it('persistCharacter 应将角色卡写入 IndexedDB', async () => {
      await resetDatabase('test-char-store-persist');
      const adapter = new IndexedDBAdapter('test-char-store-persist');
      await adapter.init();

      const store = useCharacterStore();
      store.setStorageAdapter(adapter);

      const newId = store.createCharacter();
      // 等待 persist 异步完成
      await new Promise((r) => setTimeout(r, 50));

      const saved = await adapter.loadCharacter(newId);
      expect(saved).not.toBeNull();
      expect(saved!.id).toBe(newId);

      await adapter.close();
    });

    it('deleteCharacter 应同时从 IndexedDB 删除', async () => {
      await resetDatabase('test-char-store-delete');
      const adapter = new IndexedDBAdapter('test-char-store-delete');
      await adapter.init();

      const store = useCharacterStore();
      store.setStorageAdapter(adapter);

      const newId = store.createCharacter();
      await new Promise((r) => setTimeout(r, 50));

      store.deleteCharacter(newId);
      await new Promise((r) => setTimeout(r, 50));

      const saved = await adapter.loadCharacter(newId);
      expect(saved).toBeNull();

      await adapter.close();
    });

    it('loadFromStorage 空数据库时应保留 mock 数据并写入存储', async () => {
      await resetDatabase('test-char-store-load-empty');
      const adapter = new IndexedDBAdapter('test-char-store-load-empty');
      await adapter.init();

      const store = useCharacterStore();
      const mockCount = store.characters.length;
      store.setStorageAdapter(adapter);
      await store.loadFromStorage();
      await new Promise((r) => setTimeout(r, 50));

      // mock 数据应保留
      expect(store.characters.length).toBe(mockCount);
      // 存储应已写入
      const saved = await adapter.loadCharacters();
      expect(saved.length).toBe(mockCount);

      await adapter.close();
    });

    it('loadFromStorage 非空数据库时应覆盖 mock 数据', async () => {
      await resetDatabase('test-char-store-load-filled');
      const adapter = new IndexedDBAdapter('test-char-store-load-filled');
      await adapter.init();

      // 第一次启动 store1：触发首次 loadFromStorage，mock 被写入存储
      const store1 = useCharacterStore();
      store1.setStorageAdapter(adapter);
      await store1.loadFromStorage();
      await new Promise((r) => setTimeout(r, 50));
      // 再创建一个新角色
      const newId = store1.createCharacter();
      store1.updateCharacter(newId, { name: '唯一角色' });
      await new Promise((r) => setTimeout(r, 50));
      const filledCount = store1.characters.length;

      // 重新创建 pinia + store2 模拟应用重启
      setActivePinia(createPinia());
      const store2 = useCharacterStore();
      const mockCount = store2.characters.length;
      store2.setStorageAdapter(adapter);
      await store2.loadFromStorage();
      await new Promise((r) => setTimeout(r, 50));

      // store2 应从存储加载，列表 = mock（已被写入存储） + 新角色
      expect(store2.characters.length).toBeGreaterThanOrEqual(mockCount);
      expect(store2.characters.length).toBe(filledCount);
      expect(store2.characters.find((c) => c.id === newId)).toBeDefined();

      await adapter.close();
    });

    it('loadFromStorage 失败时应通过 lastError 反馈', async () => {
      await resetDatabase('test-char-store-load-error');
      const adapter = new IndexedDBAdapter('test-char-store-load-error');
      await adapter.init();

      const store = useCharacterStore();
      store.setStorageAdapter(adapter);
      // 关闭 db 模拟 loadCharacters 失败
      await adapter.close();

      await store.loadFromStorage();
      expect(store.lastError).not.toBeNull();
      expect(store.lastError).toContain('加载角色失败');
    });
  });

  describe('V2 卡导入', () => {
    it('合法 V2 JSON 应成功导入并加入列表', async () => {
      const store = useCharacterStore();
      const before = store.characters.length;

      const file = makeJsonFile(JSON.stringify(makeV2CardJson()));
      const id = await store.importV2File(file);

      expect(id).not.toBeNull();
      expect(store.characters.length).toBe(before + 1);
      const imported = store.characters.find((c) => c.id === id);
      expect(imported).toBeDefined();
      expect(imported!.name).toBe('ImportedChar');
      expect(imported!.description).toContain('从 V2 导入');
      expect(store.lastInfo).toContain('已导入角色卡');
      expect(store.currentCharacterId).toBe(id);
    });

    it('JSON 格式错误应通过 lastError 反馈并返回 null', async () => {
      const store = useCharacterStore();
      const file = makeJsonFile('not-a-json{{{');
      const id = await store.importV2File(file);

      expect(id).toBeNull();
      expect(store.lastError).toContain('JSON 格式错误');
    });

    it('V2 spec 不匹配应通过 lastError 反馈并返回 null', async () => {
      const store = useCharacterStore();
      const file = makeJsonFile(
        JSON.stringify({ spec: 'unknown_v3', data: {} })
      );
      const id = await store.importV2File(file);

      expect(id).toBeNull();
      expect(store.lastError).toContain('V2 卡格式错误');
    });

    it('验证失败（name 为空）应通过 lastError 反馈', async () => {
      const store = useCharacterStore();
      const json = makeV2CardJson({ name: '' });
      const file = makeJsonFile(JSON.stringify(json));
      const id = await store.importV2File(file);

      expect(id).toBeNull();
      expect(store.lastError).toContain('角色卡验证失败');
    });

    it('与现有同名角色应自动追加 "(导入)" 后缀', async () => {
      const store = useCharacterStore();
      // 先确保列表中有一个 ImportedChar
      const file1 = makeJsonFile(JSON.stringify(makeV2CardJson()));
      const id1 = await store.importV2File(file1);
      expect(id1).not.toBeNull();

      // 再次导入同名
      const file2 = makeJsonFile(JSON.stringify(makeV2CardJson()));
      const id2 = await store.importV2File(file2);
      expect(id2).not.toBeNull();

      const char2 = store.characters.find((c) => c.id === id2);
      expect(char2!.name).toContain('(导入)');
    });
  });

  describe('V2 卡导出', () => {
    it('exportV2 应返回合法的 V2 JSON 字符串', () => {
      const store = useCharacterStore();
      const newId = store.createCharacter();

      const json = store.exportV2(newId);
      expect(json).not.toBeNull();

      const parsed = JSON.parse(json!);
      expect(parsed.spec).toBe('chara_card_v2');
      expect(parsed.data).toBeDefined();
      expect(parsed.data.name).toBe('新角色');
    });

    it('exportV2 不存在的 id 应返回 null 并通过 lastError 反馈', () => {
      const store = useCharacterStore();
      const json = store.exportV2('___nonexistent___');
      expect(json).toBeNull();
      expect(store.lastError).toContain('找不到要导出的角色');
    });

    it('downloadV2 应触发浏览器下载并返回 true', () => {
      const store = useCharacterStore();
      const newId = store.createCharacter();

      // mock URL.createObjectURL / URL.revokeObjectURL
      const originalCreate = URL.createObjectURL;
      const originalRevoke = URL.revokeObjectURL;
      URL.createObjectURL = vi.fn(() => 'blob:fake-url');
      URL.revokeObjectURL = vi.fn();

      // mock document.createElement
      const clickSpy = vi.fn();
      const appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation(() => null as never);
      const removeChildSpy = vi.spyOn(document.body, 'removeChild').mockImplementation(() => null as never);
      const originalCreateElement = document.createElement;
      document.createElement = vi.fn(() => {
        return {
          href: '',
          download: '',
          click: clickSpy,
        } as unknown as HTMLAnchorElement;
      }) as typeof document.createElement;

      const ok = store.downloadV2(newId);
      expect(ok).toBe(true);
      expect(clickSpy).toHaveBeenCalled();
      expect(store.lastInfo).toContain('已导出');

      // 恢复
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
      document.createElement = originalCreateElement;
      appendChildSpy.mockRestore();
      removeChildSpy.mockRestore();
    });

    it('downloadV2 不存在的 id 应返回 false', () => {
      const store = useCharacterStore();
      const ok = store.downloadV2('___nonexistent___');
      expect(ok).toBe(false);
      expect(store.lastError).toContain('找不到要导出的角色');
    });
  });

  describe('错误反馈清理', () => {
    it('clearLastError 应同时清除 lastError 与 lastInfo', () => {
      const store = useCharacterStore();
      store.lastError = 'some error';
      store.lastInfo = 'some info';
      store.clearLastError();
      expect(store.lastError).toBeNull();
      expect(store.lastInfo).toBeNull();
    });
  });
});
