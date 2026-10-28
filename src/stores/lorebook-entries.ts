/**
 * lorebook-entries — 世界书条目 CRUD 的执行体（R4-3 拆分）
 *
 * 从 `stores/lorebook.ts` 切出。需要读写的 store 状态经 `EntryOpsContext` 传入
 * （不 import store，避免环形依赖），因此可脱离 pinia 单测。
 */
import type { Ref } from 'vue';
import { t } from '@/i18n';
import type {
  Lorebook,
  LorebookEntry,
  LorebookEntryCreateInput,
} from '@/core/lorebook';
import { MAX_LOREBOOK_ENTRIES, validateLorebookEntry } from '@/core/lorebook';

/** 条目动作要驱动的 store 状态（由 store 传引用进来） */
export interface EntryOpsContext {
  lorebooks: Ref<Lorebook[]>;
  currentEntryId: Ref<string | null>;
  lastError: Ref<string | null>;
  persistLorebook: (id: string) => Promise<void>;
}

/**
 * 在当前 Lorebook 末尾新增条目
 * @returns 新条目 id（失败返回 null）
 */
export function runAddEntry(
  ctx: EntryOpsContext,
  lorebookId: string,
  input?: Partial<LorebookEntryCreateInput>
): string | null {
  const lb = ctx.lorebooks.value.find((l) => l.id === lorebookId);
  if (!lb) return null;

  if (lb.entries.length >= MAX_LOREBOOK_ENTRIES) {
    ctx.lastError.value = t('lb.entriesLimit2', { max: MAX_LOREBOOK_ENTRIES });
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
    ctx.lastError.value = t('lb.entryValidateFailed', { errors: errors.join('；') });
    return null;
  }

  lb.entries.push(entry);
  ctx.currentEntryId.value = entry.id;
  void ctx.persistLorebook(lorebookId);
  return entry.id;
}

/** 更新条目（patch 部分字段） */
export function runUpdateEntry(
  ctx: EntryOpsContext,
  lorebookId: string,
  entryId: string,
  patch: Partial<LorebookEntry>
): boolean {
  const lb = ctx.lorebooks.value.find((l) => l.id === lorebookId);
  if (!lb) return false;
  const entry = lb.entries.find((e) => e.id === entryId);
  if (!entry) return false;

  Object.assign(entry, patch);

  const errors = validateLorebookEntry(entry);
  if (errors.length > 0) {
    ctx.lastError.value = t('lb.entryValidateFailed', { errors: errors.join('；') });
    return false;
  }

  void ctx.persistLorebook(lorebookId);
  return true;
}

/** 删除条目 */
export function runDeleteEntry(
  ctx: EntryOpsContext,
  lorebookId: string,
  entryId: string
): void {
  const lb = ctx.lorebooks.value.find((l) => l.id === lorebookId);
  if (!lb) return;
  const idx = lb.entries.findIndex((e) => e.id === entryId);
  if (idx < 0) return;
  lb.entries.splice(idx, 1);
  if (ctx.currentEntryId.value === entryId) {
    ctx.currentEntryId.value = lb.entries[0]?.id ?? null;
  }
  void ctx.persistLorebook(lorebookId);
}

/** 复制条目（追加到末尾） */
export function runDuplicateEntry(
  ctx: EntryOpsContext,
  lorebookId: string,
  entryId: string
): string | null {
  const lb = ctx.lorebooks.value.find((l) => l.id === lorebookId);
  if (!lb) return null;
  const entry = lb.entries.find((e) => e.id === entryId);
  if (!entry) return null;

  if (lb.entries.length >= MAX_LOREBOOK_ENTRIES) {
    ctx.lastError.value = t('lb.entriesLimit2', { max: MAX_LOREBOOK_ENTRIES });
    return null;
  }

  const copy: LorebookEntry = {
    ...entry,
    id: `entry-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    title: t('lb.entryCopy', { title: entry.title }),
  };
  lb.entries.push(copy);
  ctx.currentEntryId.value = copy.id;
  void ctx.persistLorebook(lorebookId);
  return copy.id;
}

/**
 * 拖拽排序：将 fromId 移到 toId 之前/之后
 * @param position 'before' | 'after'
 */
export function runMoveEntry(
  ctx: EntryOpsContext,
  lorebookId: string,
  fromId: string,
  toId: string,
  position: 'before' | 'after'
): void {
  const lb = ctx.lorebooks.value.find((l) => l.id === lorebookId);
  if (!lb) return;

  const fromIdx = lb.entries.findIndex((e) => e.id === fromId);
  const toIdx = lb.entries.findIndex((e) => e.id === toId);
  if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;

  const [moved] = lb.entries.splice(fromIdx, 1);
  const insertIdx = position === 'before' ? toIdx : toIdx + 1;
  // 移除后若 fromIdx < toIdx，toIdx 已下移 1
  const finalIdx = fromIdx < toIdx ? insertIdx - 1 : insertIdx;
  lb.entries.splice(finalIdx, 0, moved!);

  // 重排 insertionOrder
  lb.entries.forEach((e, i) => {
    e.insertionOrder = i + 1;
  });

  void ctx.persistLorebook(lorebookId);
}

/** 切换条目启用状态 */
export function runToggleEntry(
  ctx: EntryOpsContext,
  lorebookId: string,
  entryId: string
): void {
  const lb = ctx.lorebooks.value.find((l) => l.id === lorebookId);
  const entry = lb?.entries.find((e) => e.id === entryId);
  if (entry) {
    entry.enabled = !entry.enabled;
    void ctx.persistLorebook(lorebookId);
  }
}
