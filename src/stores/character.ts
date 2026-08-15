import { t } from '@/i18n';
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { UICharacter, NavKey } from '@/types';
import { mockCharacters } from '../data/mock-data';
import type { StorageAdapter } from '../storage/storage-adapter';
import {
  uiCharToCard,
  cardToUiChar,
} from '../services/type-adapters';
import {
  importV2Card,
  exportV2Card,
  validateCharacterCard,
} from '../core/character-card';
import { useSettingsStore } from './settings';
import { createApiClient } from '../api';
import {
  buildGenerationMessages,
  generateSeed,
  parseGeneratedCharacter,
  type CharacterTemplateId,
} from '../core/character-generator';

/**
 * Character Store (Phase E)
 *
 * 职责：
 * 1. 角色卡列表 CRUD（内存 + IndexedDB 持久化）
 * 2. 当前激活角色 / 搜索 / 抽屉状态管理
 * 3. V2 卡导入（解析 SillyTavern V2 JSON → UICharacter）
 * 4. V2 卡导出（UICharacter → SillyTavern V2 JSON）
 *
 * 不负责：
 * - 对话持久化（由 chat store 负责）
 * - API Profile 管理（由 settings store 负责）
 */
export const useCharacterStore = defineStore('character', () => {
  // ── 状态 ──
  const characters = ref<UICharacter[]>(structuredClone(mockCharacters));
  const currentCharacterId = ref('seraphina');
  const searchQuery = ref('');
  /** 需求1：当前过滤标签（空字符串表示不按标签过滤） */
  const filterTag = ref('');
  const panelOpen = ref(true);
  const characterListOpen = ref(false);
  const currentNav = ref<NavKey>('chat');

  // 注入的存储适配器（运行时由 App.vue 设置）
  let storageAdapter: StorageAdapter | null = null;

  // 最近一次错误（用于 UI 提示）
  const lastError = ref<string | null>(null);
  const lastInfo = ref<string | null>(null);

  // F01.7 角色随机生成状态
  const isGeneratingCharacter = ref(false);

  // ── 计算属性 ──
  const currentCharacter = computed(
    () =>
      characters.value.find((c) => c.id === currentCharacterId.value) ??
      characters.value[0]
  );

  const filteredCharacters = computed(() => {
    const q = searchQuery.value.trim().toLowerCase();
    const tag = filterTag.value.trim().toLowerCase();
    return characters.value.filter((c) => {
      // 搜索：名称或标签包含 q
      const matchesSearch = !q
        || c.name.toLowerCase().includes(q)
        || c.tags.some((t) => t.toLowerCase().includes(q));
      // 标签过滤：角色的 tags 数组中包含 filterTag（精确匹配）
      const matchesTag = !tag
        || c.tags.some((t) => t.toLowerCase() === tag);
      return matchesSearch && matchesTag;
    });
  });

  /** 需求1：从所有角色中提取去重后的标签列表（按出现频率降序，最多 50 个） */
  const allTags = computed(() => {
    const counts = new Map<string, number>();
    for (const c of characters.value) {
      for (const t of c.tags) {
        const trimmed = t.trim();
        if (!trimmed) continue;
        counts.set(trimmed, (counts.get(trimmed) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 50)
      .map(([tag, count]) => ({ tag, count }));
  });

  const favorites = computed(() =>
    filteredCharacters.value.filter((c) => c.favorite)
  );

  const others = computed(() =>
    filteredCharacters.value.filter((c) => !c.favorite)
  );

  // ── 依赖注入 ──

  /**
   * 注入存储适配器（应用启动时由 App.vue 调用）
   */
  function setStorageAdapter(adapter: StorageAdapter | null): void {
    storageAdapter = adapter;
  }

  /**
   * 从存储层加载全部角色卡到内存
   * 若存储为空（首次启动），保留 mock 数据并写入存储
   */
  async function loadFromStorage(): Promise<void> {
    if (!storageAdapter) return;
    try {
      const cards = await storageAdapter.loadCharacters();
      if (cards.length > 0) {
        // 用存储中的角色覆盖 mock
        // P2-11 Phase1: 保留角色卡 messages(loadChatHistory 未接线, 已持久化会话历史
        // 刷新后无法进 UI; 恢复行为符合产品预期, 也是超长对话压测的前置)
        characters.value = cards.map((c) => {
          const ui = cardToUiChar(c);
          const raw = (c as unknown as { messages?: unknown[] }).messages;
          if (Array.isArray(raw)) ui.messages = raw as UICharacter['messages'];
          return ui;
        });
        if (characters.value.length > 0 && !characters.value.find((c) => c.id === currentCharacterId.value)) {
          currentCharacterId.value = characters.value[0].id;
        }
      } else {
        // 首次启动：将 mock 数据写入存储
        await Promise.all(characters.value.map((c) => persistCharacter(c.id)));
      }
    } catch (err) {
      lastError.value = t('store.loadFailed', { name: t('store.entityChar'), error: err instanceof Error ? err.message : String(err) });
    }
  }

  /**
   * 持久化单个角色卡到存储层
   */
  async function persistCharacter(id: string): Promise<void> {
    if (!storageAdapter) return;
    const char = characters.value.find((c) => c.id === id);
    if (!char) return;
    try {
      const card = uiCharToCard(char);
      await storageAdapter.saveCharacter(card);
    } catch (err) {
      lastError.value = t('store.saveFailed', { name: t('store.entityChar'), error: err instanceof Error ? err.message : String(err) });
    }
  }

  /**
   * 从存储层删除单个角色卡
   */
  async function deleteFromStorage(id: string): Promise<void> {
    if (!storageAdapter) return;
    try {
      await storageAdapter.deleteCharacter(id);
    } catch (err) {
      lastError.value = t('store.deleteFailed', { name: t('store.entityChar'), error: err instanceof Error ? err.message : String(err) });
    }
  }

  // ── 动作 ──

  function selectCharacter(id: string) {
    currentCharacterId.value = id;
  }

  function setSearchQuery(q: string) {
    searchQuery.value = q;
  }

  /** 需求1：设置当前过滤标签（空字符串表示清空筛选） */
  function setFilterTag(tag: string) {
    filterTag.value = tag;
  }

  function togglePanel() {
    panelOpen.value = !panelOpen.value;
  }

  function toggleCharacterList() {
    characterListOpen.value = !characterListOpen.value;
  }

  function closeAllDrawers() {
    characterListOpen.value = false;
    panelOpen.value = false;
  }

  function setNav(key: NavKey) {
    currentNav.value = key;
  }

  /**
   * 新建角色（内存 + 持久化）
   * @returns 新角色 id
   */
  function createCharacter(): string {
    const id = `char-${Date.now()}`;
    const newChar: UICharacter = {
      id,
      name: t('store.newChar'),
      avatarType: 'gradient',
      gradientFrom: 'var(--tk-cyan-500)',
      gradientTo: 'var(--tk-cyan-700)',
      initial: t('char.initial'),
      lastActive: t('char.justNow'),
      favorite: false,
      tags: [t('char.uncategorized')],
      description: t('char.clickToEdit'),
      model: 'GPT-4o',
      conversations: [],
      messages: [],
      authorNote: '',
      authorDepth: 4,
      temperature: 1.0,
      maxTokens: 4096,
      worldEntries: [],
      tokenBudget: { character: 0, worldInfo: 0, chatHistory: 0, remaining: 8192 },
    };
    characters.value.push(newChar);
    currentCharacterId.value = id;
    void persistCharacter(id);
    return id;
  }

  /**
   * 更新角色卡（patch 部分字段）
   * @returns 是否找到并更新
   */
  function updateCharacter(id: string, patch: Partial<UICharacter>): boolean {
    const char = characters.value.find((c) => c.id === id);
    if (!char) return false;
    Object.assign(char, patch);
    char.lastActive = t('char.justNow');
    void persistCharacter(id);
    return true;
  }

  /**
   * 删除角色卡（内存 + 存储）
   */
  function deleteCharacter(id: string): void {
    const idx = characters.value.findIndex((c) => c.id === id);
    if (idx < 0) return;
    characters.value.splice(idx, 1);
    void deleteFromStorage(id);
    if (currentCharacterId.value === id) {
      currentCharacterId.value = characters.value[0]?.id ?? '';
    }
  }

  function toggleWorldEntry(characterId: string, entryId: string) {
    const char = characters.value.find((c) => c.id === characterId);
    const entry = char?.worldEntries.find((w) => w.id === entryId);
    if (entry) {
      entry.enabled = !entry.enabled;
      void persistCharacter(characterId);
    }
  }

  /**
   * 切换收藏
   */
  function toggleFavorite(characterId: string): void {
    const char = characters.value.find((c) => c.id === characterId);
    if (char) {
      char.favorite = !char.favorite;
      void persistCharacter(characterId);
    }
  }

  // ── 需求7：角色与世界书双向绑定 ──

  /**
   * 获取角色已绑定的世界书 ID 列表（未设置视为空数组）
   */
  function getBoundWorldBookIds(characterId: string): string[] {
    const char = characters.value.find((c) => c.id === characterId);
    return char?.boundWorldBookIds ?? [];
  }

  /**
   * 判断角色是否已绑定某世界书
   */
  function isWorldBookBound(characterId: string, worldBookId: string): boolean {
    const char = characters.value.find((c) => c.id === characterId);
    return (char?.boundWorldBookIds ?? []).includes(worldBookId);
  }

  /**
   * 绑定世界书到角色（幂等：重复绑定不会产生重复 ID）
   * @returns 是否实际发生变更
   */
  function bindWorldBook(characterId: string, worldBookId: string): boolean {
    const char = characters.value.find((c) => c.id === characterId);
    if (!char) return false;
    if (!char.boundWorldBookIds) char.boundWorldBookIds = [];
    if (char.boundWorldBookIds.includes(worldBookId)) return false;
    char.boundWorldBookIds.push(worldBookId);
    void persistCharacter(characterId);
    return true;
  }

  /**
   * 解绑角色与世界书
   * @returns 是否实际发生变更
   */
  function unbindWorldBook(characterId: string, worldBookId: string): boolean {
    const char = characters.value.find((c) => c.id === characterId);
    if (!char || !char.boundWorldBookIds) return false;
    const idx = char.boundWorldBookIds.indexOf(worldBookId);
    if (idx < 0) return false;
    char.boundWorldBookIds.splice(idx, 1);
    void persistCharacter(characterId);
    return true;
  }

  /**
   * 切换角色与世界书的绑定状态
   */
  function toggleWorldBookBinding(
    characterId: string,
    worldBookId: string
  ): boolean {
    if (isWorldBookBound(characterId, worldBookId)) {
      return !unbindWorldBook(characterId, worldBookId);
    }
    return bindWorldBook(characterId, worldBookId);
  }

  /**
   * 获取绑定到指定世界书的所有角色 ID 列表（反向关系派生）
   * 用于在世界书页展示已绑定的角色
   */
  function getCharacterIdsByWorldBook(worldBookId: string): string[] {
    return characters.value
      .filter((c) => (c.boundWorldBookIds ?? []).includes(worldBookId))
      .map((c) => c.id);
  }

  // ── V2 卡导入/导出 ──

  /**
   * 从 SillyTavern V2 JSON 导入角色卡
   * @param file 用户选择的 .json 文件
   * @returns 新角色 id（失败时返回 null）
   */
  async function importV2File(file: File): Promise<string | null> {
    lastError.value = null;
    lastInfo.value = null;
    try {
      const text = await file.text();
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        lastError.value = t('char.jsonParseFailed2');
        return null;
      }

      // 解析 V2 卡
      let card;
      try {
        card = importV2Card(json);
      } catch (err) {
        lastError.value = t('char.v2FormatError', { error: err instanceof Error ? err.message : String(err) });
        return null;
      }

      // 验证
      const errors = validateCharacterCard(card);
      if (errors.length > 0) {
        lastError.value = t('char.validateFailed2', { errors: errors.join('；') });
        return null;
      }

      // 转换为 UICharacter 并加入列表
      const ui = cardToUiChar(card);
      // 避免与现有 id 冲突（V2 卡可能没有 id，importV2Card 会生成）
      // 但若与现有角色同名，提示用户
      if (characters.value.some((c) => c.name === ui.name)) {
        // 自动重命名
        ui.name = `${ui.name}${t('char.importSuffix')}`;
      }

      characters.value.push(ui);
      currentCharacterId.value = ui.id;
      await persistCharacter(ui.id);
      lastInfo.value = t('char.imported2', { name: ui.name });
      return ui.id;
    } catch (err) {
      lastError.value = t('char.importFailed2', { error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  }

  /**
   * 导出角色卡为 SillyTavern V2 JSON
   * @param id 角色 id
   * @returns JSON 字符串（失败时返回 null）
   */
  function exportV2(id: string): string | null {
    lastError.value = null;
    const char = characters.value.find((c) => c.id === id);
    if (!char) {
      lastError.value = t('char.exportNotFound');
      return null;
    }
    try {
      const card = uiCharToCard(char);
      const v2 = exportV2Card(card);
      return JSON.stringify(v2, null, 2);
    } catch (err) {
      lastError.value = t('char.exportFailed2', { error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  }

  /**
   * 触发浏览器下载 V2 卡 JSON
   */
  function downloadV2(id: string): boolean {
    const json = exportV2(id);
    if (json === null) return false;

    const char = characters.value.find((c) => c.id === id);
    const safeName = (char?.name ?? 'character').replace(/[^\w\u4e00-\u9fa5-]/g, '_');
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeName}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    lastInfo.value = t('char.exported2', { name: safeName });
    return true;
  }

  function clearLastError(): void {
    lastError.value = null;
    lastInfo.value = null;
  }

  // ── F01.7 角色随机生成 ──

  /**
   * 随机生成角色卡 (F01.7)
   *
   * 流程：
   * 1. 从 settings store 获取当前激活的 API profile
   * 2. 构建 Prompt（模板 + 随机种子）
   * 3. 调用 API 非流式生成
   * 4. 解析 AI 返回的 JSON 结构化角色
   * 5. 转换为 UICharacter 并保存
   *
   * @param templateId 生成模板 id（奇幻/科幻/现代/末日）
   * @returns 新角色 id（失败时返回 null）
   */
  async function generateRandomCharacter(
    templateId: CharacterTemplateId,
    sourceContext?: string
  ): Promise<string | null> {
    lastError.value = null;
    lastInfo.value = null;

    if (isGeneratingCharacter.value) return null;

    // 1. 获取当前激活的 API profile
    const settingsStore = useSettingsStore();
    const profile = settingsStore.activeProfile;
    if (!profile) {
      lastError.value = t('char.noApiForGen');
      return null;
    }

    // 2. 创建 API client + 构建 Prompt
    const apiClient = createApiClient(profile);
    const seed = generateSeed();
    const messages = buildGenerationMessages(templateId, seed, sourceContext);

    isGeneratingCharacter.value = true;

    try {
      // 3. 调用 API（非流式，温度 1.0 增加创意）
      const raw = await apiClient.chat({
        messages,
        model: profile.model,
        temperature: 1.0,
        maxTokens: 1500,
      });

      // 4. 解析返回
      const generated = parseGeneratedCharacter(raw);
      if (!generated) {
        lastError.value = t('char.genParseFailed');
        return null;
      }

      // 5. 转换为 UICharacter 并保存
      const id = `char-${Date.now()}`;
      const now = t('char.justNow');
      const newChar: UICharacter = {
        id,
        name: generated.name,
        avatarType: 'gradient',
        gradientFrom: 'var(--tk-cyan-500)',
        gradientTo: 'var(--tk-cyan-700)',
        initial: generated.name[0] || '?',
        lastActive: now,
        favorite: false,
        tags: generated.tags.length > 0 ? generated.tags : [t('char.uncategorized')],
        description: generated.description || t('char.noDesc2'),
        model: profile.model,
        conversations: [],
        messages: generated.firstMessage
          ? [
              {
                id: `m-${Date.now()}`,
                role: 'assistant',
                content: generated.firstMessage,
                timestamp: Date.now(),
              },
            ]
          : [],
        authorNote: '',
        authorDepth: 4,
        temperature: 1.0,
        maxTokens: 4096,
        worldEntries: [],
        tokenBudget: { character: 0, worldInfo: 0, chatHistory: 0, remaining: 8192 },
        attributes: generated.attributes,
      };

      characters.value.push(newChar);
      currentCharacterId.value = id;
      await persistCharacter(id);
      lastInfo.value = t('char.genSuccess2', { name: generated.name });
      return id;
    } catch (err) {
      lastError.value = t('char.genFailed2', { error: err instanceof Error ? err.message : String(err) });
      return null;
    } finally {
      isGeneratingCharacter.value = false;
    }
  }

  return {
    // 状态
    characters,
    currentCharacterId,
    searchQuery,
    /** 需求1：当前过滤标签 */
    filterTag,
    panelOpen,
    characterListOpen,
    currentNav,
    lastError,
    lastInfo,
    isGeneratingCharacter,
    // 计算属性
    currentCharacter,
    filteredCharacters,
    /** 需求1：所有可用标签（按频率降序） */
    allTags,
    favorites,
    others,
    // 依赖注入
    setStorageAdapter,
    loadFromStorage,
    persistCharacter,
    deleteFromStorage,
    // 动作
    selectCharacter,
    setSearchQuery,
    /** 需求1：设置过滤标签 */
    setFilterTag,
    togglePanel,
    toggleCharacterList,
    closeAllDrawers,
    setNav,
    createCharacter,
    updateCharacter,
    deleteCharacter,
    toggleWorldEntry,
    toggleFavorite,
    // 需求7：角色与世界书双向绑定
    getBoundWorldBookIds,
    isWorldBookBound,
    bindWorldBook,
    unbindWorldBook,
    toggleWorldBookBinding,
    getCharacterIdsByWorldBook,
    // V2 导入/导出
    importV2File,
    exportV2,
    downloadV2,
    clearLastError,
    // F01.7 角色随机生成
    generateRandomCharacter,
  };
});
