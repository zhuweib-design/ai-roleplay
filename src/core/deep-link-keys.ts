/**
 * 深链记录 id 键 → 归属 store 的闸门（唯一事实源，M16-b）
 *
 * M14-a 把"等读完再解析"收进 `useDeepLinkId`，M15-a 让守卫核对到**键名**，但还剩一个
 * 它看不见的错法：`useDeepLinkId({ key: 'group', load: () => characterStore.ensureLoaded() })`
 * —— 键写对了，等的是别的库。读库时序照样对，`?group=` 却永远命不中，而且不报错。
 *
 * 所以把"这个键该等哪个库"从调用方参数变成登记表面：视图只说键名，闸门由这里给。
 * 加新键要三道同时放行才走得通——登记表（运行时）、`DeepLinkKey` 类型（编译时）、
 * 守卫（静态扫描），任何一道漏登记都会立刻显形。
 */
import { useCharacterStore } from '@/stores/character';
import { useGroupChatStore } from '@/stores/group-chat';
import { useLorebookStore } from '@/stores/lorebook';
import { useStoryStore } from '@/stores/story';

/**
 * 键 → 该键归属 store 的加载闸门。
 *
 * `char` 与 `id` 都指向角色库（前者是 query `?char=`，后者是 params `/character/:id/edit`）。
 * 需要等**多个**库的视图（版本页要等版本仓库 + 角色库）仍可自行传 `load` 覆盖，
 * 那是这条契约里唯一合法的例外，守卫对此只要求"键登记过"。
 */
export const DEEP_LINK_GATES = {
  char: () => useCharacterStore().ensureLoaded(),
  id: () => useCharacterStore().ensureLoaded(),
  group: () => useGroupChatStore().ensureLoaded(),
  book: () => useLorebookStore().ensureLoaded(),
  story: () => useStoryStore().ensureLoaded(),
} as const;

/** 已登记的深链键（视图的 `key` 参数受此约束，写错键名编译就不过） */
export type DeepLinkKey = keyof typeof DEEP_LINK_GATES;

/** 登记表里的键名，给静态守卫核对用 */
export const REGISTERED_DEEP_LINK_KEYS: DeepLinkKey[] = Object.keys(DEEP_LINK_GATES) as DeepLinkKey[];

/**
 * 等这个键归属的库读完。
 *
 * 未登记的键在这里抛错而不是静默不读：调用点若绕过类型约束（比如键名来自动态拼接），
 * 抛出来的信息直接指出该去哪儿登记。
 */
export function ensureDeepLinkLoaded(key: string): Promise<void> {
  const gate = (DEEP_LINK_GATES as Record<string, (() => Promise<void>) | undefined>)[key];
  if (!gate) {
    return Promise.reject(
      // 开发者面向的编程错误，不是 UI 文案：i18n 门禁（strict）豁免 logger/console 行，
      // 但不豁免 new Error，所以这里用英文，避免为了过门把一个不该进文案表的串塞进 i18n。
      new Error(`Deep link key "${key}" has no registered gate; add it to DEEP_LINK_GATES in src/core/deep-link-keys.ts`)
    );
  }
  return gate();
}
