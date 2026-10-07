/**
 * 手机端底部导航路由辅助
 *
 * 底部 Tab 的清单与顺序来自 `src/core/nav-model.ts`（单一事实源，见 `mobileTabEntries`），
 * 本模块只保留"哪些路由属于二级沉浸页"这一件事——它此前零消费者（App.vue 实际用
 * isMainTab 门禁底栏），现在由 App.vue 的 showBottomNav 真正读取。
 *
 * 设计文档: docs/design/mobile-ui-design.md §13（该文档的"5 tab"待回写为 6，
 * 见 UX_IA_GUIDED_FLOW_DESIGN_2026-10-07.md §3.7 D-F/D-G）
 */

/**
 * 二级沉浸页集合（移动端隐藏底部导航，让位给全屏编辑）
 *
 * `group` 不在其中：群聊与单聊是同一任务的两条通道，进 /group 就吞掉底栏会形成
 * 单向门（只能靠返回键离开）。见设计文档 §3.2.4。
 */
const DETAIL_ROUTES = new Set<string>([
  'character-edit',
  'character-new',
  'databank',
  'archives',
  'story',
  'random-events',
  'local-model',
  'image-gen',
  'character-version',
  'profile',
]);

/** 是否为二级详细页（移动端应隐藏底部导航） */
export function isDetailRoute(routeName: string | undefined): boolean {
  return routeName !== undefined && DETAIL_ROUTES.has(routeName);
}
