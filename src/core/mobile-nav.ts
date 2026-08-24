/**
 * 手机端底部导航路由辅助
 *
 * 设计文档: docs/mobile-ui-design.md §13
 * - MAIN_TABS:底部导航 5 个主入口
 * - isMainTab:是否为主 Tab
 * - isDetailRoute:二级详细页,移动端应隐藏底部导航(全屏沉浸)
 */
/** 底部导航 5 主入口 */
export const MAIN_TABS = [
  'chat',
  'character-list',
  'community-market',
  'worldbook',
  'settings',
] as const;

export type MainTab = (typeof MAIN_TABS)[number];

const MAIN_SET = new Set<string>(MAIN_TABS);

/** 二级详细页集合(移动端隐藏底部导航) */
const DETAIL_ROUTES = new Set<string>([
  'character-edit',
  'character-new',
  'group',
  'databank',
  'archives',
  'story',
  'random-events',
  'local-model',
  'image-gen',
  'character-version',
  'profile',
]);

/** 是否为底部导航主入口 */
export function isMainTab(routeName: string | undefined): boolean {
  return routeName !== undefined && MAIN_SET.has(routeName);
}

/** 是否为二级详细页(移动端应隐藏底部导航) */
export function isDetailRoute(routeName: string | undefined): boolean {
  return routeName !== undefined && DETAIL_ROUTES.has(routeName);
}