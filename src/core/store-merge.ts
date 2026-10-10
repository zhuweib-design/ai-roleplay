/**
 * 加载与"首帧窗口内新建"的合并（M9-c）
 *
 * `App.vue` 是在 `onMounted` 里才 `await xxxStore.loadFromStorage()`：界面已经挂好、
 * 按钮已经能点，而列表还在读。这期间用户点"新建"会先把这条记录单独落盘，随后加载完成、
 * `list` 整数组替换内存 ⇒ 那条记录从界面上消失（存档里有，但 store 里 `find` 不到，
 * 后续对它的编辑会静默失效）。
 *
 * 合并规则：存档里没有、而内存里已有、且不属于初始种子的记录，一律保留。
 * `seedIds` 是给"以 mock 种子初始化"的 store 用的（如角色库），否则种子会被当成用户新建。
 */
export function mergeKeptLocal<T extends { id: string }>(
  archived: T[],
  local: T[],
  seedIds: ReadonlySet<string> = new Set()
): T[] {
  if (local.length === 0) return archived;
  const archivedIds = new Set(archived.map((item) => item.id));
  const extra = local.filter((item) => !archivedIds.has(item.id) && !seedIds.has(item.id));
  return extra.length > 0 ? [...archived, ...extra] : archived;
}
