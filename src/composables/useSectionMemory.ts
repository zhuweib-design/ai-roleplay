/**
 * useSectionMemory — 可折叠段的开合记忆（M7-d，M8-b 支持按实体分开）
 *
 * 要解决的问题：排障段（成员 Runtime 检视、世界描述、世界内用户资料、设置页高级段）
 * 默认收起，但"我这次是特意展开的"跨刷新就丢，于是每次都要重新点一遍。
 *
 * 两种意图必须分清，别混成一个值：
 * - 用户**明确点过**这一段 → 他的选择优先，跨刷新、跨页面都跟着；
 * - **没点过** → 用调用方给的推导默认（例如 M7-a 的"还没填的段自动展开"、
 *   高级段的"默认收起"）。
 * 所以这里返回的是"读时合并"，而不是在挂载时把默认值写进存储 ——
 * 一写进去，推导默认就永久失效了（"没填自动展开"会变成只在新装时生效一次）。
 *
 * key 可以是会变的值（`MaybeRefOrGetter<string>`）：描述某个实体的段（世界书的两段、
 * 群聊的 Runtime 检视）要把实体 id 拼进 key，否则"这本书开着、那本书也得开着"；
 * 设置页那种与实体无关的段继续用固定字符串。
 */
import { computed, toValue, type ComputedRef, type MaybeRefOrGetter, type WritableComputedRef } from 'vue';
import { useSettingsStore } from '@/stores/settings';

export function useSectionMemory(
  key: MaybeRefOrGetter<string>,
  fallbackDefault: () => boolean = () => false
): WritableComputedRef<boolean> {
  const settings = useSettingsStore();
  return computed<boolean>({
    get: () => settings.uiSectionOpen[toValue(key)] ?? fallbackDefault(),
    set: (open) => settings.setUiSectionOpen(toValue(key), open),
  });
}

/**
 * 已记住的开合条数（设置页"恢复默认"入口用它说明现状，不让按钮变成盲操作）。
 * 返回的是 computed，调用方直接读 `.value`。
 */
export function useSectionMemoryCount(): ComputedRef<number> {
  const settings = useSettingsStore();
  return computed(() => Object.keys(settings.uiSectionOpen).length);
}
