import { t } from '@/i18n';
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { StorageAdapter } from '@/storage/storage-adapter';
import {
  type Lorebook,
  type LorebookEntry,
  type LorebookCreateInput,
  type LorebookEntryCreateInput,
  type WorldDescription,
  type WorldUserProfile,
  validateLorebook,
} from '@/core/lorebook';
import { mergeKeptLocal } from '@/core/store-merge';
import { saveBlob, describeSaveResult } from '@/utils/save-blob';
import type { WorldTemplateId } from '@core/world-generator';
import {
  type HierarchyTreeNode,
  buildEntryTree as buildEntryTreeIn,
  canSetEntryParent as canSetEntryParentIn,
  applyEntryParent,
  getEntryChildren as getEntryChildrenIn,
  getEntryDescendants as getEntryDescendantsIn,
  getEntryAncestors as getEntryAncestorsIn,
  moveEntryToLevelIn,
  reorderEntryInLevel as reorderEntryInLevelIn,
} from './lorebook-hierarchy';
import { serializeLorebook, parseLorebookImport } from './lorebook-io';
import { runGenerateRandomWorldbook, runExtendWorldbook } from './lorebook-world-gen-run';
import type { EntryOpsContext } from './lorebook-entries';
import {
  runAddEntry,
  runUpdateEntry,
  runDeleteEntry,
  runDuplicateEntry,
  runMoveEntry,
  runToggleEntry,
} from './lorebook-entries';
// 类型与纯函数的公开面：拆分后调用方仍从本模块取，零改动
export type { HierarchyTreeNode };
export {
  getEntryChildren,
  getEntryDescendants,
  getEntryAncestors,
  buildEntryTree,
} from './lorebook-hierarchy';

/**
 * Lorebook Store (W3 · F06)
 *
 * 职责：
 * 1. Lorebook 列表 CRUD（内存 + 持久化）
 * 2. 当前选中 Lorebook 与条目编辑状态
 * 3. 条目增删改 + 拖拽排序
 * 4. 导入导出（兼容 SillyTavern 格式）
 *
 * 不负责：
 * - 关键词扫描与激活（由 prompt-builder 集成）
 * - 角色/群聊管理（各自 store 负责）
 */
export const useLorebookStore = defineStore('lorebook', () => {
  // ── 状态 ──
  const lorebooks = ref<Lorebook[]>([]);
  const currentLorebookId = ref<string | null>(null);
  const currentEntryId = ref<string | null>(null);
  const searchQuery = ref('');
  /** 需求1：按 scope 过滤（'' 表示全部；可选值: 'global'|'character'|'persona'|'chat'） */
  const filterScope = ref<'global' | 'character' | 'persona' | 'chat' | ''>('');

  // 注入的存储适配器
  let storageAdapter: StorageAdapter | null = null;

  // 世界书列表的加载闸门（深链 `?book=` 要用，见 src/composables/useDeepLinkId.ts）：
  // loaded = "读库已经跑完一次"，loadInFlight 保证并发调用只起一次读。
  const loaded = ref(false);
  let loadInFlight: Promise<void> | null = null;

  // 最近一次错误/提示
  const lastError = ref<string | null>(null);
  const lastInfo = ref<string | null>(null);

  // 迭代27 · F06.8: 世界生成状态
  const isGeneratingWorld = ref(false);

  // ── 计算属性 ──
  const currentLorebook = computed(
    () =>
      lorebooks.value.find((lb) => lb.id === currentLorebookId.value) ?? null
  );

  const currentEntry = computed(
    () =>
      currentLorebook.value?.entries.find((e) => e.id === currentEntryId.value) ??
      null
  );

  const filteredLorebooks = computed(() => {
    const q = searchQuery.value.trim().toLowerCase();
    const scope = filterScope.value;
    return lorebooks.value.filter((lb) => {
      const matchesSearch = !q
        || lb.name.toLowerCase().includes(q)
        || (lb.description ?? '').toLowerCase().includes(q);
      const matchesScope = !scope || lb.scope === scope;
      return matchesSearch && matchesScope;
    });
  });

  /** 需求1：按 scope 统计每个分类的世界书数量（用于 Tab 徽标） */
  const scopeCounts = computed(() => {
    const counts = { global: 0, character: 0, persona: 0, chat: 0 } as Record<
      'global' | 'character' | 'persona' | 'chat',
      number
    >;
    for (const lb of lorebooks.value) {
      if (lb.scope in counts) counts[lb.scope as keyof typeof counts]++;
    }
    return counts;
  });

  // ── 依赖注入 ──

  function setStorageAdapter(adapter: StorageAdapter | null): void {
    storageAdapter = adapter;
  }

  async function loadFromStorage(): Promise<void> {
    if (!storageAdapter) return;
    try {
      const list = await storageAdapter.loadLorebooks();
      // 首帧窗口内用户新建的书要留住（存档里已有、内存里刚建，整数组替换会把它变没）
      lorebooks.value = mergeKeptLocal(list, lorebooks.value);
      if (list.length > 0 && !currentLorebookId.value) {
        currentLorebookId.value = list[0]!.id;
      }
    } catch (err) {
      lastError.value = t('store.loadFailed', { name: t('store.entityWorldbook'), error: err instanceof Error ? err.message : String(err) });
    } finally {
      loaded.value = true;
    }
  }

  /**
   * 等世界书列表读完（还没开始就自己开始），并保证只读一遍。
   *
   * `/worldbook?book=<id>` 要在读库完成之后才认得出那本；没闸门时表现是
   * "链接打开的是默认那本书"而不是报错——M12-a 在角色版本页上踩过同一形状。
   * App.vue 的启动加载也走这里，两处不再各起一次全表读。
   */
  async function ensureLoaded(): Promise<void> {
    if (loaded.value) return;
    if (loadInFlight) return loadInFlight;
    loadInFlight = (async () => {
      try {
        await loadFromStorage();
      } finally {
        loadInFlight = null;
      }
    })();
    return loadInFlight;
  }

  async function persistLorebook(id: string): Promise<void> {
    if (!storageAdapter) return;
    const lb = lorebooks.value.find((l) => l.id === id);
    if (!lb) return;
    try {
      lb.updatedAt = new Date().toISOString();
      await storageAdapter.saveLorebook(lb);
    } catch (err) {
      lastError.value = t('store.saveFailed', { name: t('store.entityWorldbook'), error: err instanceof Error ? err.message : String(err) });
    }
  }

  async function deleteFromStorage(id: string): Promise<void> {
    if (!storageAdapter) return;
    try {
      await storageAdapter.deleteLorebook(id);
    } catch (err) {
      lastError.value = t('store.deleteFailed', { name: t('store.entityWorldbook'), error: err instanceof Error ? err.message : String(err) });
    }
  }

  /** 条目动作执行体的状态引用（引用不复制数据） */
  function entryOpsCtx(): EntryOpsContext {
    return { lorebooks, currentEntryId, lastError, persistLorebook };
  }

  // ── Lorebook 动作 ──

  function selectLorebook(id: string): void {
    currentLorebookId.value = id;
    // 选中第一个条目
    const lb = lorebooks.value.find((l) => l.id === id);
    currentEntryId.value = lb?.entries[0]?.id ?? null;
  }

  function setSearchQuery(q: string): void {
    searchQuery.value = q;
  }

  /** 需求1：设置 scope 过滤（传 '' 清空筛选） */
  function setFilterScope(scope: 'global' | 'character' | 'persona' | 'chat' | ''): void {
    filterScope.value = scope;
  }

  /**
   * 新建 Lorebook
   * @returns 新 Lorebook id
   */
  function createLorebook(input?: Partial<LorebookCreateInput>): string {
    const id = input?.id ?? `lorebook-${Date.now()}`;
    const now = new Date().toISOString();
    const lb: Lorebook = {
      id,
      name: input?.name ?? t('store.newWorldbook'),
      description: input?.description ?? '',
      entries: input?.entries ?? [],
      scope: input?.scope ?? 'global',
      characterId: input?.characterId,
      personaId: input?.personaId,
      chatId: input?.chatId,
      // 迭代22 · F06.7: 整体世界描述
      worldDescription: input?.worldDescription ?? null,
      userProfile: input?.userProfile ?? null,
      createdAt: now,
      updatedAt: now,
    };

    const errors = validateLorebook(lb);
    if (errors.length > 0) {
      lastError.value = t('lb.createFailed', { errors: errors.join('；') });
      return '';
    }

    lorebooks.value.unshift(lb);
    currentLorebookId.value = id;
    currentEntryId.value = null;
    void persistLorebook(id);
    lastInfo.value = t('lb.created2', { name: lb.name });
    return id;
  }

  /**
   * 更新 Lorebook 元信息（不修改 entries，entries 由 entry 操作管理）
   */
  function updateLorebook(
    id: string,
    patch: Partial<Pick<Lorebook, 'name' | 'description' | 'scope' | 'characterId'>>
  ): boolean {
    const lb = lorebooks.value.find((l) => l.id === id);
    if (!lb) return false;
    Object.assign(lb, patch);

    const errors = validateLorebook(lb);
    if (errors.length > 0) {
      lastError.value = t('lb.updateFailed', { errors: errors.join('；') });
      return false;
    }

    void persistLorebook(id);
    return true;
  }

  /**
   * 更新整体世界描述（迭代22 · F06.7）
   *
   * 设置 Lorebook 顶层的 WorldDescription 字段。
   * 该字段作为常量条目始终注入 beforeCharDefs 之前，
   * 为对话提供整体世界观上下文。
   *
   * @param lorebookId 目标 Lorebook ID
   * @param wd 世界描述对象，传 null 清空
   * @returns 验证是否通过
   */
  function updateWorldDescription(
    lorebookId: string,
    wd: WorldDescription | null
  ): boolean {
    const lb = lorebooks.value.find((l) => l.id === lorebookId);
    if (!lb) return false;

    lb.worldDescription = wd;

    // 复用 validateLorebook 校验（含 worldDescription 规则）
    const errors = validateLorebook(lb);
    if (errors.length > 0) {
      lastError.value = t('lb.worldDescValidateFailed', { errors: errors.join('；') });
      // 不回滚数据，但提示错误，调用方可视化展示
      return false;
    }

    void persistLorebook(lorebookId);
    lastInfo.value = wd
      ? t('lb.worldDescSaved', { name: wd.name || t('lb.unnamed') })
      : t('lb.worldDescCleared');
    return true;
  }

  /** 更新当前世界中的用户资料；传 null 清除资料。 */
  function updateWorldUserProfile(
    lorebookId: string,
    profile: WorldUserProfile | null
  ): boolean {
    const lb = lorebooks.value.find((l) => l.id === lorebookId);
    if (!lb) return false;
    lb.userProfile = profile;
    const errors = validateLorebook(lb);
    if (errors.length > 0) {
      lastError.value = t('lb.worldUserProfileValidateFailed', { errors: errors.join('；') });
      return false;
    }
    void persistLorebook(lorebookId);
    lastInfo.value = profile
      ? t('lb.worldUserProfileSaved')
      : t('lb.worldUserProfileCleared');
    return true;
  }

  /**
   * 删除 Lorebook
   */
  function deleteLorebook(id: string): void {
    const idx = lorebooks.value.findIndex((l) => l.id === id);
    if (idx < 0) return;
    const removed = lorebooks.value.splice(idx, 1)[0]!;
    void deleteFromStorage(id);
    lastInfo.value = t('lb.deleted', { name: removed.name });
    if (currentLorebookId.value === id) {
      currentLorebookId.value = lorebooks.value[0]?.id ?? null;
      currentEntryId.value = null;
    }
  }

  // ── 条目动作 ──

  function selectEntry(id: string): void {
    currentEntryId.value = id;
  }

  /**
   * 在当前 Lorebook 末尾新增条目
   * @returns 新条目 id（失败返回 null）
   */
  /**
   * 在当前 Lorebook 末尾新增条目
   * @returns 新条目 id（失败返回 null）
   */
  function addEntry(
    lorebookId: string,
    input?: Partial<LorebookEntryCreateInput>
  ): string | null {
    return runAddEntry(entryOpsCtx(), lorebookId, input);
  }

  /** 更新条目（patch 部分字段） */
  function updateEntry(
    lorebookId: string,
    entryId: string,
    patch: Partial<LorebookEntry>
  ): boolean {
    return runUpdateEntry(entryOpsCtx(), lorebookId, entryId, patch);
  }

  /** 删除条目 */
  function deleteEntry(lorebookId: string, entryId: string): void {
    runDeleteEntry(entryOpsCtx(), lorebookId, entryId);
  }

  /** 复制条目（追加到末尾） */
  function duplicateEntry(lorebookId: string, entryId: string): string | null {
    return runDuplicateEntry(entryOpsCtx(), lorebookId, entryId);
  }

  /**
   * 拖拽排序：将 fromId 移到 toId 之前/之后
   * @param position 'before' | 'after'
   */
  function moveEntry(
    lorebookId: string,
    fromId: string,
    toId: string,
    position: 'before' | 'after'
  ): void {
    runMoveEntry(entryOpsCtx(), lorebookId, fromId, toId, position);
  }

  /** 切换条目启用状态 */
  function toggleEntry(lorebookId: string, entryId: string): void {
    runToggleEntry(entryOpsCtx(), lorebookId, entryId);
  }

  // ── F06.6 层级管理（v1.1）──
  // 纯逻辑在 lorebook-hierarchy.ts；这里只负责取书、写提示、落盘。

  function getEntryChildren(
    lorebookId: string,
    parentId: string | null
  ): LorebookEntry[] {
    const lb = lorebooks.value.find((l) => l.id === lorebookId);
    if (!lb) return [];
    return getEntryChildrenIn(lb.entries, parentId);
  }

  function getEntryDescendants(
    lorebookId: string,
    entryId: string
  ): LorebookEntry[] {
    const lb = lorebooks.value.find((l) => l.id === lorebookId);
    if (!lb) return [];
    return getEntryDescendantsIn(lb.entries, entryId);
  }

  function getEntryAncestors(
    lorebookId: string,
    entryId: string
  ): LorebookEntry[] {
    const lb = lorebooks.value.find((l) => l.id === lorebookId);
    if (!lb) return [];
    return getEntryAncestorsIn(lb.entries, entryId);
  }

  /**
   * 检查是否可以将 entryId 的父节点设置为 newParentId
   * （规则见 lorebook-hierarchy.canSetEntryParent）
   */
  function canSetEntryParent(
    lorebookId: string,
    entryId: string,
    newParentId: string | null
  ): boolean {
    const lb = lorebooks.value.find((l) => l.id === lorebookId);
    if (!lb) return false;
    return canSetEntryParentIn(lb.entries, entryId, newParentId);
  }

  /**
   * 设置条目的父节点
   * 自动调整该条目及其所有后代的 hierarchyLevel
   * @returns 是否成功
   */
  function setEntryParent(
    lorebookId: string,
    entryId: string,
    newParentId: string | null
  ): boolean {
    const lb = lorebooks.value.find((l) => l.id === lorebookId);
    if (!lb) return false;
    const entry = lb.entries.find((e) => e.id === entryId);
    if (!entry) return false;

    if (!canSetEntryParentIn(lb.entries, entryId, newParentId)) {
      lastError.value = t('lb.cannotSetParent');
      return false;
    }

    applyEntryParent(lb.entries, entryId, newParentId);

    // 整体校验
    const errors = validateLorebook(lb);
    if (errors.length > 0) {
      lastError.value = t('lb.hierarchyValidateFailed', { errors: errors.join('；') });
      return false;
    }

    void persistLorebook(lorebookId);
    lastInfo.value = newParentId === null
      ? t('lb.movedToTop')
      : t('lb.parentSet');
    return true;
  }

  /**
   * 移动条目到指定层级深度
   * - level=0：设为顶层节点（parentId=null）
   * - level>0：仅调整 level，不改变 parentId（实际场景走 setEntryParent）
   * @returns 是否成功
   */
  function moveEntryToLevel(
    lorebookId: string,
    entryId: string,
    level: 0 | 1 | 2
  ): boolean {
    const lb = lorebooks.value.find((l) => l.id === lorebookId);
    if (!lb) return false;
    const entry = lb.entries.find((e) => e.id === entryId);
    if (!entry) return false;

    // level=0 时设为顶层
    if (level === 0) {
      return setEntryParent(lorebookId, entryId, null);
    }

    const failure = moveEntryToLevelIn(lb.entries, entryId, level);
    if (failure === 'invalid-level') {
      lastError.value = t('lb.levelRange2');
      return false;
    }
    if (failure === 'need-parent') {
      lastError.value = t('lb.moveNeedParent', { level });
      return false;
    }
    if (failure === 'child-level-invalid') {
      const currentParentId = entry.parentId ?? null;
      const parentLevel = currentParentId === null
        ? 0
        : (lb.entries.find((e) => e.id === currentParentId)?.hierarchyLevel ?? 0);
      lastError.value = t('lb.childLevelInvalid', { level, parent: parentLevel });
      return false;
    }

    void persistLorebook(lorebookId);
    lastInfo.value = t('lb.movedToLevel', { level });
    return true;
  }

  /**
   * 在同级中重新排序条目（'up' 或 'down'）
   * 同级指具有相同 parentId 的兄弟节点
   */
  function reorderEntryInLevel(
    lorebookId: string,
    entryId: string,
    direction: 'up' | 'down'
  ): boolean {
    const lb = lorebooks.value.find((l) => l.id === lorebookId);
    if (!lb) return false;
    if (!reorderEntryInLevelIn(lb.entries, entryId, direction)) return false;
    void persistLorebook(lorebookId);
    return true;
  }

  /**
   * 构建树状结构，用于 UI 渲染
   * 返回顶层节点列表，每个节点带 children 数组（递归）
   */
  function buildEntryTree(lorebookId: string): HierarchyTreeNode[] {
    const lb = lorebooks.value.find((l) => l.id === lorebookId);
    if (!lb) return [];
    return buildEntryTreeIn(lb.entries);
  }

  /**
   * 导出 Lorebook 为 JSON（兼容 SillyTavern）
   * 序列化细节见 lorebook-io.serializeLorebook
   */
  function exportLorebook(id: string): string | null {
    const lb = lorebooks.value.find((l) => l.id === id);
    if (!lb) {
      lastError.value = t('lb.exportNotFound');
      return null;
    }
    return serializeLorebook(lb);
  }

  /**
   * 从 JSON 文件导入 Lorebook
   * 层级恢复规则见 lorebook-io.parseLorebookImport
   */
  async function importLorebookFile(file: File): Promise<string | null> {
    lastError.value = null;
    try {
      const text = await file.text();
      const json = JSON.parse(text) as Parameters<typeof parseLorebookImport>[0];
      const parsed = parseLorebookImport(json, file.name);

      const id = `lorebook-${Date.now()}`;
      const now = new Date().toISOString();
      const lb: Lorebook = {
        id,
        name: parsed.name,
        description: '',
        entries: parsed.entries,
        scope: 'global',
        worldDescription: parsed.worldDescription,
        userProfile: parsed.userProfile,
        createdAt: now,
        updatedAt: now,
      };

      const errors = validateLorebook(lb);
      if (errors.length > 0) {
        lastError.value = t('lb.importValidateFailed', { errors: errors.join('；') });
        return null;
      }

      lorebooks.value.unshift(lb);
      currentLorebookId.value = id;
      await persistLorebook(id);
      lastInfo.value = t('lb.imported', { name: lb.name });
      return id;
    } catch (err) {
      lastError.value = t('lb.importFailed2', { error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  }

  /**
   * 导出世界书 JSON 给用户存盘
   *
   * @returns true 表示真的存下了；false = 找不到 / 用户在系统保存面板取消（都不得报"已导出"）
   */
  async function downloadLorebook(id: string): Promise<boolean> {
    const json = exportLorebook(id);
    if (json === null) return false;
    const lb = lorebooks.value.find((l) => l.id === id);
    const safeName = (lb?.name ?? 'lorebook').replace(/[^\w\u4e00-\u9fa5-]/g, '_');
    const outcome = await saveBlob(`${safeName}.json`, () => new Blob([json], { type: 'application/json' }));
    const saved = describeSaveResult(outcome);
    if (!saved) return false;
    lastInfo.value = saved.message;
    return true;
  }

  // ── F06.8 世界观 AI 生成（迭代27）──
  // 执行体在 lorebook-world-gen-run.ts（状态经 WorldGenContext 传入）。

  /** AI 生成新世界（创建模式），失败返回 null */
  function generateRandomWorldbook(
    templateId: WorldTemplateId,
    scope: Lorebook['scope'] = 'global',
    sourceContext?: string,
    characterId?: string
  ): Promise<string | null> {
    return runGenerateRandomWorldbook(
      {
        lorebooks,
        currentLorebookId,
        currentEntryId,
        isGeneratingWorld,
        lastError,
        lastInfo,
        persistLorebook,
      },
      templateId,
      scope,
      sourceContext,
      characterId
    );
  }

  /** AI 扩展现有世界书，返回新增条目数（失败 0） */
  function extendWorldbook(lorebookId: string): Promise<number> {
    return runExtendWorldbook(
      {
        lorebooks,
        currentLorebookId,
        currentEntryId,
        isGeneratingWorld,
        lastError,
        lastInfo,
        persistLorebook,
      },
      lorebookId
    );
  }

  function clearLastError(): void {
    lastError.value = null;
    lastInfo.value = null;
  }

  return {
    // 状态
    lorebooks,
    currentLorebookId,
    currentEntryId,
    searchQuery,
    /** 需求1：当前 scope 过滤 */
    filterScope,
    lastError,
    lastInfo,
    // 迭代27 · F06.8: 世界生成状态
    isGeneratingWorld,
    // 计算属性
    currentLorebook,
    currentEntry,
    filteredLorebooks,
    /** 需求1：scope 分类计数 */
    scopeCounts,
    // 依赖注入
    setStorageAdapter,
    loadFromStorage,
    ensureLoaded,
    loaded,
    persistLorebook,
    deleteFromStorage,
    // Lorebook 动作
    selectLorebook,
    setSearchQuery,
    /** 需求1：设置 scope 过滤 */
    setFilterScope,
    createLorebook,
    updateLorebook,
    updateWorldDescription,
    updateWorldUserProfile,
    deleteLorebook,
    // 条目动作
    selectEntry,
    addEntry,
    updateEntry,
    deleteEntry,
    duplicateEntry,
    moveEntry,
    toggleEntry,
    // F06.6 层级管理（v1.1）
    getEntryChildren,
    getEntryDescendants,
    getEntryAncestors,
    canSetEntryParent,
    setEntryParent,
    moveEntryToLevel,
    reorderEntryInLevel,
    buildEntryTree,
    // 导入导出
    exportLorebook,
    importLorebookFile,
    downloadLorebook,
    // 迭代27 · F06.8: 世界观 AI 生成
    generateRandomWorldbook,
    extendWorldbook,
    clearLastError,
  };
});
