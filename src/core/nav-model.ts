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
    // A12（2-1）：群聊升为底部 Tab。它此前"既不在 Tab、又属二级沉浸页（隐藏底栏）"，
    // 进去就是单向门——这是 N 层导航改造留下的最后一个形态问题。
    mobileTab: true,
    mobileTabOrder: 3,
    mobileLabelKey: 'mobile.tabGroup',
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
    // A12（2-1）：退出底部 Tab、改从「更多」进。若不置 inMore，它会变成第二个
    // 没有移动端入口的孤儿（判据里那条"无 mobileTab:false + inMore:false"就是防这个）
    mobileTab: false,
    inMore: true,
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
    group: 'creation',
    routeName: 'community-market',
    activeWhen: ['community-market'],
    icon: 'store',
    labelKey: 'nav.market',
    descKey: 'navDesc.market',
    // 同 worldbook：退出 Tab 必须同时进"更多"，否则成为孤儿
    mobileTab: false,
    inMore: true,
  },
  // ── 系统项（group=null）──
  // `systemEntries()` 按声明顺序返回，桌面 rail 把这一段整体钉到底部，
  // 因此这里的顺序就是自上而下：引导（任务中心）→ 更多（聚合页）→ 设置。
  // 设置此前挂在"能力"组里、出现在 rail 中部，是"侧栏看起来很乱"的直接来源之一：
  // 它不是内容资源，而是应用级系统入口。
  {
    id: 'guide',
    group: null,
    routeName: 'guide',
    activeWhen: ['guide'],
    icon: 'info',
    labelKey: 'nav.guide',
    descKey: 'navDesc.guide',
    // guide 不进 inMore：它在「更多」聚合页顶部有**专门的进度卡**（MoreView 的
    // .more-guide，带"已完成 2/6 个任务"），比列表里一张卡信息更全。A12 的判据
    // "无 mobileTab:false + inMore:false"因此对它是白名单例外——判据的意图是
    // "任何入口都得有一条手机上的路"，而它已经有了一条更好的路。
    mobileTab: false,
    inMore: false,
  },
  {
    id: 'more',
    group: null,
    routeName: 'more',
    activeWhen: ['more'],
    icon: 'menu',
    labelKey: 'nav.more',
    descKey: 'navDesc.more',
    mobileTab: true,
    mobileTabOrder: 4,
    mobileLabelKey: 'mobile.tabMore',
    inMore: false,
  },
  {
    id: 'settings',
    group: null,
    routeName: 'settings',
    activeWhen: ['settings'],
    icon: 'gear',
    labelKey: 'nav.settings',
    descKey: 'navDesc.settings',
    mobileTab: true,
    mobileTabOrder: 5,
    mobileLabelKey: 'mobile.tabSettings',
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

/** 系统项（引导 / 更多 / 设置）：按声明顺序返回，rail 底部与聚合页都以此序渲染 */
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
