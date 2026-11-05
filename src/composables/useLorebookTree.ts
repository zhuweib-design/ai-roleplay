/**
 * useLorebookTree — F06.6 树状层级导航（可见节点 / 展开折叠 / 拖拽改层级）
 *
 * R1-3：从 WorldBookView（原 3115 行）提出。逻辑逐字保留 —— 包括 levelLabel 的
 * 字面层级名与 levelColor 的固定色 token：那不是"顺手改好"的地方，改了就是行为变更。
 *
 * 层级纯函数（levelLabel / levelColor / getEntryLevel / getIndent）放模块级导出：
 * 条目树与条目表单的层级徽标都要用，两处各调一次 useLorebookTree() 的话会各建一份
 * expandedEntryIds 状态，展开态就分裂了。纯函数无状态，可以安全共享。
 */
import { ref, computed, watch } from 'vue';
import { useLorebookStore } from '@/stores/lorebook';
import type { LorebookEntry } from '@/core/lorebook';

/** 层级标签 */
export function levelLabel(level: number): string {
  switch (level) {
    case 0: return 'World';
    case 1: return 'Region';
    case 2: return 'Sub-area';
    default: return `L${level}`;
  }
}

/** 层级颜色（视觉区分） */
export function levelColor(level: number): string {
  switch (level) {
    case 0: return 'var(--secondary)';
    case 1: return 'var(--primary)';
    case 2: return 'var(--tag-purple)';
    default: return 'var(--muted-foreground)';
  }
}

/**
 * 获取条目的层级深度（通过 parentId 链计算）
 */
export function getEntryLevel(entryId: string): number {
  const lb = useLorebookStore().currentLorebook;
  if (!lb) return 0;
  let level = 0;
  const visited = new Set<string>([entryId]);
  let currentId = entryId;
  while (true) {
    const entry = lb.entries.find((e) => e.id === currentId);
    if (!entry) break;
    const parentId = entry.parentId ?? null;
    if (parentId === null || visited.has(parentId)) break;
    visited.add(parentId);
    level++;
    currentId = parentId;
    if (level > 10) break; // 防止异常循环
  }
  return level;
}

/**
 * 获取缩进像素值
 */
export function getIndent(entryId: string): number {
  return getEntryLevel(entryId) * 16;
}

export function useLorebookTree() {
  const store = useLorebookStore();
  const currentLorebook = computed(() => store.currentLorebook);

  /** 展开的节点 ID 集合（默认全部展开） */
  const expandedEntryIds = ref<Set<string>>(new Set());
  /** 拖拽放置模式：'before' | 'after' 同级排序，'inside' 设为子节点 */
  const dragDropMode = ref<'before' | 'after' | 'inside'>('before');
  const draggingEntryId = ref<string | null>(null);
  const dragOverEntryId = ref<string | null>(null);

  /**
   * 可见条目列表（过滤掉被折叠祖先的后代节点）
   * 算法：遍历扁平 entries，对每个节点检查其所有祖先是否都展开
   */
  const visibleEntries = computed<LorebookEntry[]>(() => {
    const lb = currentLorebook.value;
    if (!lb) return [];
    const expanded = expandedEntryIds.value;
    const result: LorebookEntry[] = [];

    for (const entry of lb.entries) {
      // 收集该节点的祖先链
      let ancestorId = entry.parentId ?? null;
      let allAncestorsExpanded = true;
      const visited = new Set<string>([entry.id]);
      while (ancestorId !== null && !visited.has(ancestorId)) {
        visited.add(ancestorId);
        // 如果某个祖先被折叠，则该节点不可见
        if (!expanded.has(ancestorId)) {
          allAncestorsExpanded = false;
          break;
        }
        const ancestor = lb.entries.find((e) => e.id === ancestorId);
        if (!ancestor) break;
        ancestorId = ancestor.parentId ?? null;
      }
      if (allAncestorsExpanded) {
        result.push(entry);
      }
    }
    return result;
  });

  /**
   * 判断节点是否有子节点
   */
  function hasChildren(entryId: string): boolean {
    const lb = currentLorebook.value;
    if (!lb) return false;
    return lb.entries.some((e) => (e.parentId ?? null) === entryId);
  }

  /**
   * 判断节点是否展开
   */
  function isExpanded(entryId: string): boolean {
    return expandedEntryIds.value.has(entryId);
  }

  /**
   * 切换节点展开/折叠
   */
  function toggleExpand(entryId: string): void {
    const set = new Set(expandedEntryIds.value);
    if (set.has(entryId)) {
      set.delete(entryId);
    } else {
      set.add(entryId);
    }
    expandedEntryIds.value = set;
  }

  /**
   * 全部展开
   */
  function expandAll(): void {
    const lb = currentLorebook.value;
    if (!lb) return;
    expandedEntryIds.value = new Set(lb.entries.map((e) => e.id));
  }

  /**
   * 全部折叠
   */
  function collapseAll(): void {
    expandedEntryIds.value = new Set();
  }

  // F06.6 切换 Lorebook 时默认展开所有节点
  watch(
    () => currentLorebook.value?.id,
    () => {
      const lb = currentLorebook.value;
      if (lb) {
        expandedEntryIds.value = new Set(lb.entries.map((e) => e.id));
      }
    },
    { immediate: true }
  );

  // ── 拖拽排序（F06.6 扩展支持层级调整）──
  function onDragStart(entryId: string, e: DragEvent) {
    draggingEntryId.value = entryId;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', entryId);
    }
  }

  function onDragOver(entryId: string, e: DragEvent) {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }
    dragOverEntryId.value = entryId;

    // 根据鼠标位置判断放置模式
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const height = rect.height;
    // 上 25%: before；下 25%: after；中间 50%: inside（设为子节点）
    if (offsetY < height * 0.25) {
      dragDropMode.value = 'before';
    } else if (offsetY > height * 0.75) {
      dragDropMode.value = 'after';
    } else {
      dragDropMode.value = 'inside';
    }
  }

  function onDragLeave() {
    dragOverEntryId.value = null;
  }

  function onDrop(targetEntryId: string, e: DragEvent) {
    e.preventDefault();
    const fromId = draggingEntryId.value;
    if (!fromId || fromId === targetEntryId) return;
    if (!currentLorebook.value) return;

    const mode = dragDropMode.value;

    if (mode === 'inside') {
      // F06.6 设为子节点
      const ok = store.setEntryParent(
        currentLorebook.value.id,
        fromId,
        targetEntryId
      );
      if (ok) {
        // 展开目标节点以显示新子节点
        const set = new Set(expandedEntryIds.value);
        set.add(targetEntryId);
        expandedEntryIds.value = set;
      }
    } else {
      // before/after: 同级排序
      // 如果拖拽节点和目标节点的 parentId 不同，先调整到同层级
      const lb = currentLorebook.value;
      const fromEntry = lb.entries.find((e) => e.id === fromId);
      const targetEntry = lb.entries.find((e) => e.id === targetEntryId);
      if (!fromEntry || !targetEntry) return;

      const fromParent = fromEntry.parentId ?? null;
      const targetParent = targetEntry.parentId ?? null;

      if (fromParent !== targetParent) {
        // 先调整到同层级
        const adjusted = store.setEntryParent(
          currentLorebook.value.id,
          fromId,
          targetParent
        );
        if (!adjusted) return;
      }

      // 执行同级排序
      store.moveEntry(currentLorebook.value.id, fromId, targetEntryId, mode);
    }

    draggingEntryId.value = null;
    dragOverEntryId.value = null;
  }

  function onDragEnd() {
    draggingEntryId.value = null;
    dragOverEntryId.value = null;
  }

  /**
   * F06.6 移到顶层（取消父节点关系）
   */
  function moveToTopLevel(entryId: string): void {
    if (!currentLorebook.value) return;
    store.setEntryParent(currentLorebook.value.id, entryId, null);
  }

  /**
   * F06.6 同级上移
   */
  function moveUpInLevel(entryId: string): void {
    if (!currentLorebook.value) return;
    store.reorderEntryInLevel(currentLorebook.value.id, entryId, 'up');
  }

  /**
   * F06.6 同级下移
   */
  function moveDownInLevel(entryId: string): void {
    if (!currentLorebook.value) return;
    store.reorderEntryInLevel(currentLorebook.value.id, entryId, 'down');
  }

  /** 条目开关（条目树上的眼睛按钮） */
  function toggleEntry(entryId: string) {
    if (!currentLorebook.value) return;
    store.toggleEntry(currentLorebook.value.id, entryId);
  }

  return {
    expandedEntryIds,
    draggingEntryId,
    dragOverEntryId,
    dragDropMode,
    visibleEntries,
    hasChildren,
    isExpanded,
    toggleExpand,
    expandAll,
    collapseAll,
    onDragStart,
    onDragOver,
    onDragLeave,
    onDrop,
    onDragEnd,
    moveToTopLevel,
    moveUpInLevel,
    moveDownInLevel,
    toggleEntry,
  };
}
