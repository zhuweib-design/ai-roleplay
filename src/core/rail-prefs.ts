/**
 * 桌面侧栏入口显隐偏好（M2-b8）
 *
 * 用户的原话是"侧边栏更多里面加一个编辑，用户可以控制显示什么，隐藏什么"。
 * 三条设计约束：
 * 1. **只影响桌面 rail**：移动底部 Tab 是"6 个入口不增不减"的既有契约
 *    （`e2e/mobile/mobile-nav-groups.spec.ts` 在守着），不跟着变；
 * 2. **「更多」与「设置」永远保留**：编辑器本身就住在「更多」页里，
 *    能把它们藏掉就等于把人锁在门外，因此这两项在读写两侧都做白名单剔除；
 * 3. 只存用户意图（隐藏了哪些 id），不存渲染结果——与 `guided-tasks.ts` 同一口径。
 */
import { computed, ref, type ComputedRef } from 'vue';
import { NAV_ENTRIES, systemEntries, type NavEntry, type NavEntryId } from '@core/nav-model';

const STATE_KEY = 'ai-roleplay:rail-visibility.v1';

/** 不可隐藏的入口：更多（编辑器所在页）与设置（应用级系统入口） */
export const PINNED_ENTRY_IDS: readonly NavEntryId[] = ['more', 'settings'];

interface RailVisibility {
  hidden: NavEntryId[];
  updatedAt: string | null;
}

const KNOWN_IDS = new Set<string>(NAV_ENTRIES.map((e) => e.id));

function emptyPrefs(): RailVisibility {
  return { hidden: [], updatedAt: null };
}

function sanitize(list: unknown): NavEntryId[] {
  if (!Array.isArray(list)) return [];
  return list.filter(
    (id): id is NavEntryId => typeof id === 'string' && KNOWN_IDS.has(id) && !PINNED_ENTRY_IDS.includes(id as NavEntryId)
  );
}

export function loadRailVisibility(): RailVisibility {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return emptyPrefs();
    const parsed = JSON.parse(raw) as Partial<RailVisibility>;
    return { hidden: sanitize(parsed.hidden), updatedAt: null };
  } catch {
    // 存储不可用 / 脏数据 ⇒ 全部显示，导航本身不能因此坏掉
    return emptyPrefs();
  }
}

const prefsRef = ref<RailVisibility>(loadRailVisibility());

function persist(next: RailVisibility): void {
  const withTime = { ...next, updatedAt: new Date().toISOString() };
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(withTime));
  } catch {
    /* 存不下也当场生效，只是记不住 */
  }
  prefsRef.value = { hidden: withTime.hidden, updatedAt: withTime.updatedAt };
}

/** 可编辑的入口 = rail 上会出现、且不属于钉底白名单的那些（内容项 + 引导） */
export function editableRailEntries(): NavEntry[] {
  return NAV_ENTRIES.filter((e) => !PINNED_ENTRY_IDS.includes(e.id));
}

export function railPrefs(): ComputedRef<RailVisibility> {
  return computed(() => prefsRef.value);
}

export function isEntryVisible(id: NavEntryId): boolean {
  if (PINNED_ENTRY_IDS.includes(id)) return true;
  return !prefsRef.value.hidden.includes(id);
}

export function hiddenRailCount(): number {
  return prefsRef.value.hidden.length;
}

export function toggleRailEntry(id: NavEntryId): void {
  if (PINNED_ENTRY_IDS.includes(id)) return;
  const hidden = prefsRef.value.hidden.includes(id)
    ? prefsRef.value.hidden.filter((x) => x !== id)
    : [...prefsRef.value.hidden, id];
  persist({ hidden, updatedAt: null });
}

export function showAllRailEntries(): void {
  persist({ hidden: [], updatedAt: null });
}

/** 系统项里可显示的（更多 / 设置始终在，引导可隐藏） */
export function visibleSystemEntries(): NavEntry[] {
  return systemEntries().filter((e) => isEntryVisible(e.id));
}
