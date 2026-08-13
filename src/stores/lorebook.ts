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
  type LorebookHierarchyEntry,
  validateLorebook,
  validateLorebookEntry,
  MAX_LOREBOOK_ENTRIES,
} from '@/core/lorebook';
import { createApiClient } from '../api';
import { useSettingsStore } from './settings';
import {
  type WorldTemplateId,
  type GeneratedRegion,
  type GeneratedWorld,
  getWorldTemplateMeta,
  generateWorldSeed,
  buildWorldGenerationMessages,
  buildWorldExtendMessages,
  parseGeneratedWorld,
  parseExtendedRegions,
} from '@core/world-generator';

/**
 * F06.6 树状层级节点（v1.1）
 * 用于 buildEntryTree 返回的树状结构，便于 UI 递归渲染。
 */
export interface HierarchyTreeNode {
  /** 当前节点对应的条目 */
  entry: LorebookEntry;
  /** 子节点列表（递归） */
  children: HierarchyTreeNode[];
}

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
      lorebooks.value = list;
      if (list.length > 0 && !currentLorebookId.value) {
        currentLorebookId.value = list[0].id;
      }
    } catch (err) {
      lastError.value = t('store.loadFailed', { name: t('store.entityWorldbook'), error: err instanceof Error ? err.message : String(err) });
    }
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
    patch: Partial<Pick<Lorebook, 'name' | 'description' | 'scope'>>
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

  /**
   * 删除 Lorebook
   */
  function deleteLorebook(id: string): void {
    const idx = lorebooks.value.findIndex((l) => l.id === id);
    if (idx < 0) return;
    const removed = lorebooks.value.splice(idx, 1)[0];
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
  function addEntry(
    lorebookId: string,
    input?: Partial<LorebookEntryCreateInput>
  ): string | null {
    const lb = lorebooks.value.find((l) => l.id === lorebookId);
    if (!lb) return null;

    if (lb.entries.length >= MAX_LOREBOOK_ENTRIES) {
      lastError.value = t('lb.entriesLimit2', { max: MAX_LOREBOOK_ENTRIES });
      return null;
    }

    const entry: LorebookEntry = {
      id: input?.id ?? `entry-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      title: input?.title ?? t('lb.newEntry'),
      keys: input?.keys ?? [],
      content: input?.content ?? '',
      strategy: input?.strategy ?? 'keyword',
      probability: input?.probability ?? 100,
      insertionOrder: input?.insertionOrder ?? lb.entries.length + 1,
      insertionPosition: input?.insertionPosition ?? 'afterCharDefs',
      depth: input?.depth ?? 4,
      group: input?.group ?? '',
      enabled: input?.enabled ?? true,
      logic: input?.logic ?? 'AND_ANY',
      filter: input?.filter,
      // F06.6 层级字段（默认顶层节点，向后兼容扁平条目）
      hierarchyLevel: input?.hierarchyLevel ?? 0,
      parentId: input?.parentId ?? null,
    };

    const errors = validateLorebookEntry(entry);
    if (errors.length > 0) {
      lastError.value = t('lb.entryValidateFailed', { errors: errors.join('；') });
      return null;
    }

    lb.entries.push(entry);
    currentEntryId.value = entry.id;
    void persistLorebook(lorebookId);
    return entry.id;
  }

  /**
   * 更新条目（patch 部分字段）
   */
  function updateEntry(
    lorebookId: string,
    entryId: string,
    patch: Partial<LorebookEntry>
  ): boolean {
    const lb = lorebooks.value.find((l) => l.id === lorebookId);
    if (!lb) return false;
    const entry = lb.entries.find((e) => e.id === entryId);
    if (!entry) return false;

    Object.assign(entry, patch);

    const errors = validateLorebookEntry(entry);
    if (errors.length > 0) {
      lastError.value = t('lb.entryValidateFailed', { errors: errors.join('；') });
      return false;
    }

    void persistLorebook(lorebookId);
    return true;
  }

  /**
   * 删除条目
   */
  function deleteEntry(lorebookId: string, entryId: string): void {
    const lb = lorebooks.value.find((l) => l.id === lorebookId);
    if (!lb) return;
    const idx = lb.entries.findIndex((e) => e.id === entryId);
    if (idx < 0) return;
    lb.entries.splice(idx, 1);
    if (currentEntryId.value === entryId) {
      currentEntryId.value = lb.entries[0]?.id ?? null;
    }
    void persistLorebook(lorebookId);
  }

  /**
   * 复制条目（追加到末尾）
   */
  function duplicateEntry(lorebookId: string, entryId: string): string | null {
    const lb = lorebooks.value.find((l) => l.id === lorebookId);
    if (!lb) return null;
    const entry = lb.entries.find((e) => e.id === entryId);
    if (!entry) return null;

    if (lb.entries.length >= MAX_LOREBOOK_ENTRIES) {
      lastError.value = t('lb.entriesLimit2', { max: MAX_LOREBOOK_ENTRIES });
      return null;
    }

    const copy: LorebookEntry = {
      ...entry,
      id: `entry-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      title: t('lb.entryCopy', { title: entry.title }),
    };
    lb.entries.push(copy);
    currentEntryId.value = copy.id;
    void persistLorebook(lorebookId);
    return copy.id;
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
    const lb = lorebooks.value.find((l) => l.id === lorebookId);
    if (!lb) return;

    const fromIdx = lb.entries.findIndex((e) => e.id === fromId);
    const toIdx = lb.entries.findIndex((e) => e.id === toId);
    if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;

    const [moved] = lb.entries.splice(fromIdx, 1);
    const insertIdx = position === 'before' ? toIdx : toIdx + 1;
    // 移除后若 fromIdx < toIdx，toIdx 已下移 1
    const finalIdx = fromIdx < toIdx ? insertIdx - 1 : insertIdx;
    lb.entries.splice(finalIdx, 0, moved);

    // 重排 insertionOrder
    lb.entries.forEach((e, i) => {
      e.insertionOrder = i + 1;
    });

    void persistLorebook(lorebookId);
  }

  /**
   * 切换条目启用状态
   */
  function toggleEntry(lorebookId: string, entryId: string): void {
    const lb = lorebooks.value.find((l) => l.id === lorebookId);
    const entry = lb?.entries.find((e) => e.id === entryId);
    if (entry) {
      entry.enabled = !entry.enabled;
      void persistLorebook(lorebookId);
    }
  }

  // ── F06.6 层级管理（v1.1）──

  /**
   * 获取指定父节点的直接子节点列表
   * @param parentId 传 null 获取顶层节点
   */
  function getEntryChildren(
    lorebookId: string,
    parentId: string | null
  ): LorebookEntry[] {
    const lb = lorebooks.value.find((l) => l.id === lorebookId);
    if (!lb) return [];
    return lb.entries.filter((e) => (e.parentId ?? null) === parentId);
  }

  /**
   * 获取指定节点的所有后代（递归，不含自身）
   * 用于循环检测和层级调整
   */
  function getEntryDescendants(
    lorebookId: string,
    entryId: string
  ): LorebookEntry[] {
    const lb = lorebooks.value.find((l) => l.id === lorebookId);
    if (!lb) return [];
    const result: LorebookEntry[] = [];
    const stack = [entryId];
    const visited = new Set<string>([entryId]);
    while (stack.length > 0) {
      const currentId = stack.pop()!;
      const children = lb.entries.filter(
        (e) => (e.parentId ?? null) === currentId
      );
      for (const child of children) {
        if (visited.has(child.id)) continue;
        visited.add(child.id);
        result.push(child);
        stack.push(child.id);
      }
    }
    return result;
  }

  /**
   * 获取指定节点的所有祖先（从父节点到根）
   */
  function getEntryAncestors(
    lorebookId: string,
    entryId: string
  ): LorebookEntry[] {
    const lb = lorebooks.value.find((l) => l.id === lorebookId);
    if (!lb) return [];
    const result: LorebookEntry[] = [];
    const visited = new Set<string>([entryId]);
    let currentParentId = lb.entries.find((e) => e.id === entryId)?.parentId ?? null;
    while (currentParentId !== null && !visited.has(currentParentId)) {
      visited.add(currentParentId);
      const ancestor = lb.entries.find((e) => e.id === currentParentId);
      if (!ancestor) break;
      result.push(ancestor);
      currentParentId = ancestor.parentId ?? null;
    }
    return result;
  }

  /**
   * 检查是否可以将 entryId 的父节点设置为 newParentId
   * 规则：
   * - 不能自引用（entryId === newParentId）
   * - newParentId 不能是 entryId 的后代（否则形成循环）
   * - newParentId 必须存在（或为 null）
   */
  function canSetEntryParent(
    lorebookId: string,
    entryId: string,
    newParentId: string | null
  ): boolean {
    const lb = lorebooks.value.find((l) => l.id === lorebookId);
    if (!lb) return false;
    const entry = lb.entries.find((e) => e.id === entryId);
    if (!entry) return false;

    // null 表示设为顶层，总是允许
    if (newParentId === null) return true;

    // 不能自引用
    if (entryId === newParentId) return false;

    // newParentId 必须存在
    const newParent = lb.entries.find((e) => e.id === newParentId);
    if (!newParent) return false;

    // newParentId 不能是 entryId 的后代（防止循环）
    const descendants = getEntryDescendants(lorebookId, entryId);
    if (descendants.some((d) => d.id === newParentId)) return false;

    // 检查层级深度约束：新父节点的层级 + 1 不能超过 2
    const newParentLevel = newParent.hierarchyLevel ?? 0;
    const newChildLevel = newParentLevel + 1;
    if (newChildLevel > 2) return false;

    return true;
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

    if (!canSetEntryParent(lorebookId, entryId, newParentId)) {
      lastError.value = t('lb.cannotSetParent');
      return false;
    }

    entry.parentId = newParentId;

    // 计算新的层级并递归调整所有后代
    const newLevel = newParentId === null
      ? 0
      : (lb.entries.find((e) => e.id === newParentId)?.hierarchyLevel ?? 0) + 1;
    entry.hierarchyLevel = newLevel as 0 | 1 | 2;

    // 递归调整所有后代的层级（保持相对深度）
    const descendants = getEntryDescendants(lorebookId, entryId);
    for (const desc of descendants) {
      const ancestorChain = getEntryAncestors(lorebookId, desc.id);
      const descLevel = ancestorChain.length;
      desc.hierarchyLevel = Math.min(2, descLevel) as 0 | 1 | 2;
    }

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
   * - level>0：需先有父节点，否则需要调用者提供（这里仅调整 level，不改变 parentId）
   *   实际场景中通常通过 setEntryParent 调整层级关系
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

    if (level !== 0 && level !== 1 && level !== 2) {
      lastError.value = t('lb.levelRange2');
      return false;
    }

    // level=0 时设为顶层
    if (level === 0) {
      return setEntryParent(lorebookId, entryId, null);
    }

    // level>0：仅调整 hierarchyLevel 字段，parentId 由调用者通过 setEntryParent 设置
    // 此分支主要用于校验当前层级关系是否合法
    const currentParentId = entry.parentId ?? null;
    if (currentParentId === null && level > 0) {
      lastError.value = t('lb.moveNeedParent', { level });
      return false;
    }

    if (currentParentId !== null) {
      const parent = lb.entries.find((e) => e.id === currentParentId);
      const parentLevel = parent?.hierarchyLevel ?? 0;
      if (level <= parentLevel) {
        lastError.value = t('lb.childLevelInvalid', { level, parent: parentLevel });
        return false;
      }
    }

    entry.hierarchyLevel = level;
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
    const entry = lb.entries.find((e) => e.id === entryId);
    if (!entry) return false;

    const parentId = entry.parentId ?? null;
    // 获取同级的兄弟节点（保持 entries 数组中的顺序）
    const siblings = lb.entries.filter(
      (e) => (e.parentId ?? null) === parentId
    );
    const currentIdx = siblings.findIndex((e) => e.id === entryId);
    if (currentIdx < 0) return false;

    const targetIdx =
      direction === 'up' ? currentIdx - 1 : currentIdx + 1;
    if (targetIdx < 0 || targetIdx >= siblings.length) return false;

    const target = siblings[targetIdx];
    // 交换两个条目在 entries 数组中的位置
    const entryArrayIdx = lb.entries.findIndex((e) => e.id === entryId);
    const targetArrayIdx = lb.entries.findIndex((e) => e.id === target.id);
    if (entryArrayIdx < 0 || targetArrayIdx < 0) return false;

    // 交换位置
    [lb.entries[entryArrayIdx], lb.entries[targetArrayIdx]] = [
      lb.entries[targetArrayIdx],
      lb.entries[entryArrayIdx],
    ];

    // 重新计算 insertionOrder（按数组顺序）
    lb.entries.forEach((e, i) => {
      e.insertionOrder = i + 1;
    });

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

    const nodeMap = new Map<string, HierarchyTreeNode>();
    for (const entry of lb.entries) {
      nodeMap.set(entry.id, { entry, children: [] });
    }

    const roots: HierarchyTreeNode[] = [];
    for (const entry of lb.entries) {
      const node = nodeMap.get(entry.id)!;
      const parentId = entry.parentId ?? null;
      if (parentId === null || !nodeMap.has(parentId)) {
        roots.push(node);
      } else {
        nodeMap.get(parentId)!.children.push(node);
      }
    }

    return roots;
  }

  // ── 导入导出 ──

  /**
   * 导出 Lorebook 为 JSON（兼容 SillyTavern）
   *
   * F06.6 扩展（v1.1）：当任一条目存在层级关系时，附加 `hierarchy` 字段。
   * - 键为条目 ID，值为 { level, parentId }
   * - 旧版导入器无 hierarchy 字段时按扁平处理，保持向后兼容
   */
  function exportLorebook(id: string): string | null {
    const lb = lorebooks.value.find((l) => l.id === id);
    if (!lb) {
      lastError.value = t('lb.exportNotFound');
      return null;
    }

    // 转换为 SillyTavern 兼容格式
    const entries: Record<string, unknown> = {};
    lb.entries.forEach((entry, idx) => {
      const uidStr = String(idx);
      entries[uidStr] = {
        uid: idx,
        key: entry.keys,
        keysecondary: [],
        comment: entry.title,
        content: entry.content,
        constant: entry.strategy === 'constant',
        selective: entry.strategy === 'keyword' && entry.keys.length > 0,
        selectiveLogic: logicToNumber(entry.logic),
        order: entry.insertionOrder,
        position: positionToNumber(entry.insertionPosition),
        disable: !entry.enabled,
        probability: entry.probability,
        useProbability: entry.strategy === 'probability',
        depth: entry.depth,
        group: entry.group,
        role: '0',
        // F06.6 附带条目 ID 便于 hierarchy 引用（旧版导入器忽略此字段）
        entryId: entry.id,
      };
    });

    // F06.6 构建 hierarchy 映射（仅当存在非默认层级时才附加）
    const hierarchy: Record<string, LorebookHierarchyEntry> = {};
    let hasHierarchy = false;
    for (const entry of lb.entries) {
      const level = entry.hierarchyLevel ?? 0;
      const parentId = entry.parentId ?? null;
      // 非顶层 或 有父节点 → 视为有层级关系
      if (level !== 0 || parentId !== null) {
        hasHierarchy = true;
      }
      // 键使用条目 ID（优先），便于导入时直接对照
      hierarchy[entry.id] = {
        level,
        parentId,
      };
    }

    const payload: Record<string, unknown> = {
      type: 'lorebook',
      name: lb.name,
      entries,
    };
    if (hasHierarchy) {
      payload.hierarchy = hierarchy;
    }

    return JSON.stringify(payload, null, 2);
  }

  /**
   * 从 JSON 文件导入 Lorebook
   *
   * F06.6 扩展（v1.1）：若 JSON 包含 `hierarchy` 字段，恢复条目的层级关系。
   * - hierarchy 键为条目 ID（与条目内 entryId 字段对应）
   * - 值为 { level, parentId }
   * - 若无 hierarchy 字段或解析失败，按扁平顶层处理（向后兼容）
   */
  async function importLorebookFile(file: File): Promise<string | null> {
    lastError.value = null;
    try {
      const text = await file.text();
      const json = JSON.parse(text) as {
        name?: string;
        entries?: unknown;
        hierarchy?: Record<string, unknown>;
      };

      const id = `lorebook-${Date.now()}`;
      const now = new Date().toISOString();
      const entries: LorebookEntry[] = [];

      // 兼容 SillyTavern 格式（entries 为对象）或本项目数组格式
      const rawEntries = json.entries;
      if (Array.isArray(rawEntries)) {
        rawEntries.forEach((e, idx) => {
          entries.push(parseEntryFromJson(e as Record<string, unknown>, idx));
        });
      } else if (rawEntries && typeof rawEntries === 'object') {
        const obj = rawEntries as Record<string, unknown>;
        Object.keys(obj).forEach((k, idx) => {
          entries.push(parseEntryFromJson(obj[k] as Record<string, unknown>, idx));
        });
      }

      // F06.6 恢复层级关系（仅当存在 hierarchy 字段时）
      if (json.hierarchy && typeof json.hierarchy === 'object') {
        const hierarchyMap = json.hierarchy as Record<string, unknown>;
        const entryById = new Map(entries.map((e) => [e.id, e]));
        for (const [entryId, raw] of Object.entries(hierarchyMap)) {
          if (!raw || typeof raw !== 'object') continue;
          const entry = entryById.get(entryId);
          if (!entry) continue;
          const h = raw as { level?: number; parentId?: string | null };

          // 校验 parentId 合法性：null 或指向存在的条目
          const validParentId =
            h.parentId === null ||
            (typeof h.parentId === 'string' && entryById.has(h.parentId));

          // 仅当 level 合法且 parentId 合法时才应用层级关系
          // 否则忽略该条记录（保持默认顶层节点），避免数据不一致
          if (
            validParentId &&
            (h.level === 0 || h.level === 1 || h.level === 2)
          ) {
            entry.hierarchyLevel = h.level;
            entry.parentId = h.parentId as string | null;
          }
        }
      }

      const lb: Lorebook = {
        id,
        name: json.name ?? file.name.replace(/\.json$/i, ''),
        description: '',
        entries,
        scope: 'global',
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

  function downloadLorebook(id: string): boolean {
    const json = exportLorebook(id);
    if (json === null) return false;
    const lb = lorebooks.value.find((l) => l.id === id);
    const safeName = (lb?.name ?? 'lorebook').replace(/[^\w\u4e00-\u9fa5-]/g, '_');
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeName}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    lastInfo.value = t('lb.exported2', { name: safeName });
    return true;
  }

  // ── F06.8 世界观 AI 生成（迭代27）──

  /**
   * 将 GeneratedWorld 转换为 LorebookEntry[]（含层级关系）
   *
   * 层级映射：
   * - world → Lorebook.worldDescription
   * - region (GeneratedRegion) → LorebookEntry(hierarchyLevel=1, parentId=null)
   * - subArea (GeneratedSubArea) → LorebookEntry(hierarchyLevel=2, parentId=region.id)
   *
   * @returns [regionEntries, subAreaEntries]（按顺序合并即为完整 entries）
   */
  function generatedWorldToEntries(
    generated: GeneratedWorld
  ): LorebookEntry[] {
    const entries: LorebookEntry[] = [];
    let order = 100;

    for (const region of generated.regions) {
      const regionId = `entry-${Date.now()}-${Math.floor(Math.random() * 1e6)}-${entries.length}`;
      entries.push({
        id: regionId,
        title: region.title,
        keys: region.keys,
        content: region.content,
        strategy: 'keyword',
        probability: 100,
        insertionOrder: order,
        insertionPosition: 'afterCharDefs',
        depth: 4,
        group: '',
        enabled: true,
        logic: 'AND_ANY',
        hierarchyLevel: 1,
        parentId: null,
      });
      order += 10;

      for (const sub of region.subAreas) {
        const subId = `entry-${Date.now()}-${Math.floor(Math.random() * 1e6)}-${entries.length}`;
        entries.push({
          id: subId,
          title: sub.title,
          keys: sub.keys,
          content: sub.content,
          strategy: 'keyword',
          probability: 100,
          insertionOrder: order,
          insertionPosition: 'afterCharDefs',
          depth: 4,
          group: '',
          enabled: true,
          logic: 'AND_ANY',
          hierarchyLevel: 2,
          parentId: regionId,
        });
        order += 10;
      }
    }

    return entries;
  }

  /**
   * 将扩展生成的 GeneratedRegion[] 转换为 LorebookEntry[]
   *
   * 若 region 含 subAreas，则 region 作为大区（level=1）+ subAreas 作为子区域（level=2，parentId=region）
   * 若 region 无 subAreas，则作为顶层条目（level=0）插入
   */
  function generatedRegionsToEntries(
    regions: GeneratedRegion[],
    baseOrder = 100
  ): LorebookEntry[] {
    const entries: LorebookEntry[] = [];
    let order = baseOrder;

    for (const region of regions) {
      const hasSubAreas = region.subAreas.length > 0;
      const regionId = `entry-${Date.now()}-${Math.floor(Math.random() * 1e6)}-${entries.length}`;
      const regionLevel = hasSubAreas ? 1 : 0;

      entries.push({
        id: regionId,
        title: region.title,
        keys: region.keys,
        content: region.content,
        strategy: 'keyword',
        probability: 100,
        insertionOrder: order,
        insertionPosition: 'afterCharDefs',
        depth: 4,
        group: '',
        enabled: true,
        logic: 'AND_ANY',
        hierarchyLevel: regionLevel,
        parentId: null,
      });
      order += 10;

      for (const sub of region.subAreas) {
        const subId = `entry-${Date.now()}-${Math.floor(Math.random() * 1e6)}-${entries.length}`;
        entries.push({
          id: subId,
          title: sub.title,
          keys: sub.keys,
          content: sub.content,
          strategy: 'keyword',
          probability: 100,
          insertionOrder: order,
          insertionPosition: 'afterCharDefs',
          depth: 4,
          group: '',
          enabled: true,
          logic: 'AND_ANY',
          hierarchyLevel: 2,
          parentId: regionId,
        });
        order += 10;
      }
    }

    return entries;
  }

  /**
   * AI 生成新世界 (F06.8 创建模式)
   *
   * 流程：
   * 1. 校验 API profile
   * 2. 防重入
   * 3. 调用 buildWorldGenerationMessages
   * 4. 调用 apiClient.chat（非流式，温度 1.0）
   * 5. parseGeneratedWorld 解析
   * 6. 创建新 Lorebook（含 worldDescription + entries）
   * 7. 持久化
   *
   * @param templateId 世界模板 id（奇幻/科幻/现代/末日/历史/通用）
   * @param scope Lorebook 作用域，默认 'global'
   * @returns 新 Lorebook id（失败返回 null）
   */
  async function generateRandomWorldbook(
    templateId: WorldTemplateId,
    scope: Lorebook['scope'] = 'global',
    sourceContext?: string
  ): Promise<string | null> {
    lastError.value = null;
    lastInfo.value = null;

    if (isGeneratingWorld.value) {
      lastError.value = t('lb.generatingBusy');
      return null;
    }

    // 1. 获取当前激活的 API profile
    const settingsStore = useSettingsStore();
    const profile = settingsStore.activeProfile;
    if (!profile) {
      lastError.value = t('lb.noApiGen');
      return null;
    }

    // 2. 构建 Prompt
    const seed = generateWorldSeed();
    const messages = buildWorldGenerationMessages(templateId, seed, sourceContext);
    const meta = getWorldTemplateMeta(templateId);

    isGeneratingWorld.value = true;

    try {
      // 3. 调用 API（非流式，温度 1.0 增加创意，预留 2000 Token 输出）
      const apiClient = createApiClient(profile);
      const raw = await apiClient.chat({
        messages,
        model: profile.model,
        temperature: 1.0,
        maxTokens: 2000,
      });

      // 4. 解析
      const generated = parseGeneratedWorld(raw);
      if (!generated) {
        lastError.value = t('lb.genParseFailed');
        return null;
      }

      // 5. 转换为 Lorebook
      const entries = generatedWorldToEntries(generated);
      const lbId = `lorebook-${Date.now()}`;
      const now = new Date().toISOString();
      const lb: Lorebook = {
        id: lbId,
        name: generated.world.name || t('lb.aiGeneratedName', { label: meta?.label ?? 'AI' }),
        description: t('lb.aiGeneratedDesc', { label: meta?.label ?? 'AI', time: new Date().toLocaleString('zh-CN') }),
        entries,
        scope,
        // 默认全局，调用方可指定其他 scope 后再 updateLorebook 调整绑定
        ...(scope === 'character' ? { characterId: undefined } : {}),
        worldDescription: {
          name: generated.world.name,
          type: generated.world.type,
          keys: generated.world.keys,
          content: generated.world.content,
        },
        createdAt: now,
        updatedAt: now,
      };

      const errors = validateLorebook(lb);
      if (errors.length > 0) {
        lastError.value = t('lb.genValidateFailed', { errors: errors.join('；') });
        return null;
      }

      lorebooks.value.unshift(lb);
      currentLorebookId.value = lbId;
      currentEntryId.value = null;
      await persistLorebook(lbId);

      lastInfo.value = t('lb.genDone', { name: lb.name, count: entries.length });
      return lbId;
    } catch (err) {
      lastError.value = t('lb.genFailed2', { error: err instanceof Error ? err.message : String(err) });
      return null;
    } finally {
      isGeneratingWorld.value = false;
    }
  }

  /**
   * AI 扩展现有 Lorebook (F06.8 扩展模式)
   *
   * 基于现有 Lorebook 的条目，生成 2-3 个相关新大区/子区域补充，
   * 自动追加到现有 Lorebook 末尾。
   *
   * @param lorebookId 目标 Lorebook id
   * @returns 新增条目数（失败返回 0）
   */
  async function extendWorldbook(lorebookId: string): Promise<number> {
    lastError.value = null;
    lastInfo.value = null;

    if (isGeneratingWorld.value) {
      lastError.value = t('lb.generatingBusy');
      return 0;
    }

    const lb = lorebooks.value.find((l) => l.id === lorebookId);
    if (!lb) {
      lastError.value = t('lb.extendNotFound');
      return 0;
    }

    if (lb.entries.length >= MAX_LOREBOOK_ENTRIES) {
      lastError.value = t('lb.entriesLimit2', { max: MAX_LOREBOOK_ENTRIES });
      return 0;
    }

    // 1. 获取 API profile
    const settingsStore = useSettingsStore();
    const profile = settingsStore.activeProfile;
    if (!profile) {
      lastError.value = t('lb.noApiExtend');
      return 0;
    }

    // 2. 构建 Prompt
    const seed = generateWorldSeed();
    const messages = buildWorldExtendMessages(
      lb.entries,
      lb.worldDescription ?? null,
      seed
    );

    isGeneratingWorld.value = true;

    try {
      // 3. 调用 API
      const apiClient = createApiClient(profile);
      const raw = await apiClient.chat({
        messages,
        model: profile.model,
        temperature: 1.0,
        maxTokens: 1500,
      });

      // 4. 解析
      const regions = parseExtendedRegions(raw);
      if (regions.length === 0) {
        lastError.value = t('lb.extendParseFailed');
        return 0;
      }

      // 5. 转换为 LorebookEntry[] 并追加
      const baseOrder = lb.entries.length > 0
        ? Math.max(...lb.entries.map((e) => e.insertionOrder)) + 10
        : 100;
      const newEntries = generatedRegionsToEntries(regions, baseOrder);

      // 防止超出条目上限
      const remainingSlots = MAX_LOREBOOK_ENTRIES - lb.entries.length;
      const entriesToAdd = newEntries.slice(0, remainingSlots);

      lb.entries.push(...entriesToAdd);
      await persistLorebook(lorebookId);

      lastInfo.value = t('lb.extended2', { count: entriesToAdd.length, name: lb.name });
      return entriesToAdd.length;
    } catch (err) {
      lastError.value = t('lb.extendFailed2', { error: err instanceof Error ? err.message : String(err) });
      return 0;
    } finally {
      isGeneratingWorld.value = false;
    }
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

// ── SillyTavern 格式转换辅助 ──

function logicToNumber(logic: LorebookEntry['logic']): number {
  // 与 SillyTavern world_info_logic 一致
  switch (logic) {
    case 'AND_ANY':
      return 0;
    case 'NOT_ALL':
      return 1;
    case 'NOT_ANY':
      return 2;
    case 'AND_ALL':
      return 3;
    default:
      return 0;
  }
}

function numberToLogic(n: number): LorebookEntry['logic'] {
  switch (n) {
    case 0:
      return 'AND_ANY';
    case 1:
      return 'NOT_ALL';
    case 2:
      return 'NOT_ANY';
    case 3:
      return 'AND_ALL';
    default:
      return 'AND_ANY';
  }
}

function positionToNumber(pos: LorebookEntry['insertionPosition']): number {
  // SillyTavern position: 0=before char, 1=after char, 2=ANTop, 3=atDepth
  switch (pos) {
    case 'beforeCharDefs':
      return 0;
    case 'afterCharDefs':
      return 1;
    case 'atDepth':
      return 3;
    default:
      return 1;
  }
}

function numberToPosition(n: number): LorebookEntry['insertionPosition'] {
  switch (n) {
    case 0:
      return 'beforeCharDefs';
    case 3:
      return 'atDepth';
    case 1:
    default:
      return 'afterCharDefs';
  }
}

function parseEntryFromJson(
  raw: Record<string, unknown>,
  idx: number
): LorebookEntry {
  const keys = Array.isArray(raw.key)
    ? (raw.key as unknown[]).filter((k): k is string => typeof k === 'string')
    : [];

  // F06.6 若 raw 附带 entryId 字段，则保留原 ID 以便层级关系映射
  // 旧版 SillyTavern 导入无此字段，使用新生成的 ID
  const rawEntryId = typeof raw.entryId === 'string' ? raw.entryId : null;

  return {
    id: rawEntryId ?? `entry-${Date.now()}-${idx}-${Math.floor(Math.random() * 1e6)}`,
    title: typeof raw.comment === 'string' ? raw.comment : t('lb.entryComment', { index: idx + 1 }),
    keys,
    content: typeof raw.content === 'string' ? raw.content : '',
    strategy: raw.constant === true ? 'constant' : 'keyword',
    probability: typeof raw.probability === 'number' ? raw.probability : 100,
    insertionOrder: typeof raw.order === 'number' ? raw.order : idx,
    insertionPosition: numberToPosition(
      typeof raw.position === 'number' ? raw.position : 1
    ),
    depth: typeof raw.depth === 'number' ? raw.depth : 4,
    group: typeof raw.group === 'string' ? raw.group : '',
    enabled: raw.disable !== true,
    logic: numberToLogic(
      typeof raw.selectiveLogic === 'number' ? raw.selectiveLogic : 0
    ),
    // F06.6 默认顶层节点（导入后由 importLorebookFile 根据 hierarchy 字段覆盖）
    hierarchyLevel: 0,
    parentId: null,
  };
}
