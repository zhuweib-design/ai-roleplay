/**
 * 导航单一事实源（N 层，docs/design/UX_IA_GUIDED_FLOW_DESIGN_2026-10-07.md §3.2）
 *
 * 三个渲染面（桌面 NavRail、移动 BottomNav、更多聚合页 MoreView）全部由此派生，
 * 不再各自维护清单——历史上正是三份硬编码漂移导致 /group 与 /more 在某端无入口。
 *
 * 匹配一律用路由 name 而非 path：/character 是 /character-version 的前缀，
 * path 前缀匹配会误高亮（router/index.ts:18,91）。
 */
import type { IconName } from '@/components/common/icons';
import type { MessageKey } from '@/i18n';

export type NavGroupId = 'conversation' | 'creation' | 'capability' | 'archive';

export type NavEntryId =
  | 'chat'
  | 'group'
  | 'character'
  | 'worldbook'
  | 'databank'
  | 'story'
  | 'random-events'
  | 'settings'
  | 'local-model'
  | 'image-gen'
  | 'archives'
  | 'version'
  | 'market'
  | 'more'
  | 'guide';

export interface NavEntry {
  id: NavEntryId;
  /** 系统项（如"更多"）不属于任何内容组 */
  group: NavGroupId | null;
  routeName: string;
  /** 命中即高亮本入口的路由 name 集合（二级页归属其父入口） */
  activeWhen: readonly string[];
  icon: IconName;
  labelKey: MessageKey;
  /** 一句话职责，用于 rail 的 title 与聚合页的卡片描述 */
  descKey: MessageKey;
  /** 是否占移动端底部 Tab */
  mobileTab: boolean;
  /** 底部 Tab 的排列（仅 mobileTab 项需要；缺省排最后） */
  mobileTabOrder?: number;
  /** 底部 Tab 用更短的称谓（mobile.tab*），与 rail/聚合页的 labelKey 分开 */
  mobileLabelKey?: MessageKey;
  /** 是否出现在"更多"聚合页 */
  inMore: boolean;
}

export interface NavGroup {
  id: NavGroupId;
  labelKey: MessageKey;
}

export const NAV_GROUPS: readonly NavGroup[] = [
  { id: 'conversation', labelKey: 'nav.groupConversation' },
  { id: 'creation', labelKey: 'nav.groupCreation' },
  { id: 'capability', labelKey: 'nav.groupCapability' },
  { id: 'archive', labelKey: 'nav.groupArchive' },
];

export const NAV_ENTRIES: readonly NavEntry[] = [
  {
    id: 'chat',
    group: 'conversation',
    routeName: 'chat',
    activeWhen: ['chat'],
    icon: 'house',
    labelKey: 'nav.chat',
    descKey: 'navDesc.chat',
    mobileTab: true,
    mobileTabOrder: 1,
    mobileLabelKey: 'mobile.tabChat',
    inMore: false,
  },
  {
    id: 'group',
    group: 'conversation',
    routeName: 'group',
    activeWhen: ['group'],
    icon: 'chat-circle',
    labelKey: 'nav.group',
    descKey: 'navDesc.group',
    mobileTab: false,
    inMore: true,
  },
  {
    id: 'character',
    group: 'creation',
    routeName: 'character-list',
    activeWhen: ['character-list', 'character-new', 'character-edit'],
    icon: 'user',
    labelKey: 'nav.character',
    descKey: 'navDesc.character',
    mobileTab: true,
    mobileTabOrder: 2,
    mobileLabelKey: 'mobile.tabChar',
    inMore: false,
  },
  {
    id: 'worldbook',
    group: 'creation',
    routeName: 'worldbook',
    activeWhen: ['worldbook'],
    icon: 'compass',
    labelKey: 'nav.worldbook',
    descKey: 'navDesc.worldbook',
    mobileTab: true,
    mobileTabOrder: 4,
    mobileLabelKey: 'mobile.tabWorldbook',
    inMore: false,
  },
  {
    id: 'databank',
    group: 'creation',
    routeName: 'databank',
    activeWhen: ['databank'],
    icon: 'file',
    labelKey: 'nav.databank',
    descKey: 'navDesc.databank',
    mobileTab: false,
    inMore: true,
  },
  {
    id: 'story',
    group: 'creation',
    routeName: 'story',
    activeWhen: ['story'],
    icon: 'book-open',
    labelKey: 'nav.story',
    descKey: 'navDesc.story',
    mobileTab: false,
    inMore: true,
  },
  {
    id: 'random-events',
    group: 'creation',
    routeName: 'random-events',
    activeWhen: ['random-events'],
    icon: 'star',
    labelKey: 'nav.randomEvents',
    descKey: 'navDesc.randomEvents',
    mobileTab: false,
    inMore: true,
  },
  {
    id: 'settings',
    group: 'capability',
    routeName: 'settings',
    activeWhen: ['settings'],
    icon: 'gear',
    labelKey: 'nav.settings',
    descKey: 'navDesc.settings',
    mobileTab: true,
    mobileTabOrder: 6,
    mobileLabelKey: 'mobile.tabSettings',
    inMore: false,
  },
  {
    id: 'local-model',
    group: 'capability',
    routeName: 'local-model',
    activeWhen: ['local-model'],
    icon: 'cpu',
    labelKey: 'nav.localModel',
    descKey: 'navDesc.localModel',
    mobileTab: false,
    inMore: true,
  },
  {
    id: 'image-gen',
    group: 'capability',
    routeName: 'image-gen',
    activeWhen: ['image-gen'],
    icon: 'image-stack',
    labelKey: 'nav.imageGen',
    descKey: 'navDesc.imageGen',
    mobileTab: false,
    inMore: true,
  },
  {
    id: 'archives',
    group: 'archive',
    routeName: 'archives',
    activeWhen: ['archives'],
    icon: 'bookmark-simple',
    labelKey: 'nav.archives',
    descKey: 'navDesc.archives',
    mobileTab: false,
    inMore: true,
  },
  {
    id: 'version',
    group: 'archive',
    routeName: 'character-version',
    activeWhen: ['character-version'],
    icon: 'git-commit',
    labelKey: 'nav.version',
    descKey: 'navDesc.version',
    mobileTab: false,
    inMore: true,
  },
  {
    id: 'market',
    group: 'archive',
    routeName: 'community-market',
    activeWhen: ['community-market'],
    icon: 'store',
    labelKey: 'nav.market',
    descKey: 'navDesc.market',
    mobileTab: true,
    mobileTabOrder: 3,
    mobileLabelKey: 'mobile.tabMarket',
    inMore: false,
  },
  // 系统项：聚合页本身（group=null），移动端为底部 Tab，桌面端为 rail 底部入口
  {
    id: 'more',
    group: null,
    routeName: 'more',
    activeWhen: ['more'],
    icon: 'menu',
    labelKey: 'nav.more',
    descKey: 'navDesc.more',
    mobileTab: true,
    mobileTabOrder: 5,
    mobileLabelKey: 'mobile.tabMore',
    inMore: false,
  },
  // 系统项：任务中心（G 层引导，非内容资源，故不入任何内容组）
  {
    id: 'guide',
    group: null,
    routeName: 'guide',
    activeWhen: ['guide'],
    icon: 'info',
    labelKey: 'nav.guide',
    descKey: 'navDesc.guide',
    mobileTab: false,
    inMore: false,
  },
];

export const CONTENT_ENTRY_COUNT = NAV_ENTRIES.filter((e) => e.group !== null).length;

export function navGroupLabel(groupId: NavGroupId): MessageKey {
  const group = NAV_GROUPS.find((g) => g.id === groupId);
  if (!group) throw new Error(`unknown nav group: ${groupId}`);
  return group.labelKey;
}

export function entriesOfGroup(groupId: NavGroupId): NavEntry[] {
  return NAV_ENTRIES.filter((e) => e.group === groupId);
}

export function systemEntries(): NavEntry[] {
  return NAV_ENTRIES.filter((e) => e.group === null);
}

export function mobileTabEntries(): NavEntry[] {
  return NAV_ENTRIES.filter((e) => e.mobileTab).sort(
    (a, b) => (a.mobileTabOrder ?? 99) - (b.mobileTabOrder ?? 99)
  );
}

export function moreEntries(): NavEntry[] {
  return NAV_ENTRIES.filter((e) => e.inMore);
}

/** 路由 name → 应高亮的入口（二级页归属父入口，未知路由不高亮任何项） */
export function activeEntryForRoute(routeName: string | undefined): NavEntry | undefined {
  if (!routeName) return undefined;
  return NAV_ENTRIES.find((e) => e.activeWhen.includes(routeName));
}
