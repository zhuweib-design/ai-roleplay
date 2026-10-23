import { computed, onBeforeUnmount, ref, type ComputedRef, type Ref } from 'vue';
import { isMobile } from '@/core/viewport';
import {
  newLayerToken,
  offLayerPop,
  onLayerPop,
  popLayer,
  pushLayer,
  stripLayerMark,
  topLayerToken,
} from '@/core/history-layer';

/**
 * useDrilldown — 手机端「两级互换」原语的状态机（MOBILE_PLAN 批次 1-1）
 *
 * 要解决的事：手机上所有"列表 + 详情"页面现在都是同一列里上下列两段
 * （群聊是同屏塞了群列表 + 群头部 + 消息区，世界书是双滚动），结果是详情那一级
 * 被挤到无可用的高度。形态规格（方案文档 §3.3.1）的答案是**两级互换**：
 * 同一时刻只存在一级、两级都满屏、靠一条 history 记录切换，系统返回即回列表。
 *
 * 这个文件只做两件事：管"一级/二级"两态、管那条 history 记录。它**不管**
 * 有哪些页面、也不新增路由 —— `nav-model.ts` 与 `router/index.ts` 仍是导航的
 * 单一来源。页面负责长什么样，这里负责"现在在哪一级、返回怎么退"。
 *
 * 用法（页面侧）：
 *   const swap = useDrilldown({ masterLabel: t('group.allGroups') });
 *   <div v-bind="swap.rootProps">
 *     <div class="m-swap__master">…点条目时 swap.open(item.id)…</div>
 *     <div class="m-swap__detail">
 *       <button class="m-swap__back" @click="swap.goBack()">…</button>
 *     </div>
 *   </div>
 *
 * 为什么用 history 而不是一个布尔量：布尔量拿不到"系统返回"这条最关键的手势。
 * 安卓返回键与浏览器后退在生产里是同一条路径（都是 popstate），只做布尔量的话
 * 用户在二级页按返回会退出应用，而不是回到列表。
 */

export type DrilldownLevel = 1 | 2;

export interface UseDrilldownOptions {
  /**
   * 一级页的可读名，如「全部群聊」「所有角色」。
   * 原语不渲染任何 UI（那是页面的事），这里只是把"返回动作要说出目的地"
   * 这条规格变成一个可取的字段，免得各页面自己编文案。
   */
  masterLabel?: string;
  /**
   * 离开二级时回调（系统返回与页内返回都会触发），用于清掉选中项、收起内联编辑等。
   */
  onLeaveDetail?: () => void;
  /**
   * 是否把二级态写进浏览器历史。默认只在手机档写。
   *
   * 桌面是并置两栏，二级不是"另一个屏幕"——如果桌面点一个条目就压一层 history，
   * 用户按浏览器后退会变成"取消选中"，把导航历史吃掉。这条默认值就是为它设的。
   * 测试与特殊场景可以覆盖（`() => true` / `() => false`）。
   */
  trackHistory?: () => boolean;
}

export interface UseDrilldown {
  /** 当前层级：1 = 列表级，2 = 详情级 */
  level: Ref<DrilldownLevel>;
  isDetail: ComputedRef<boolean>;
  /** 二级页当前携带的条目 key（页面自己解释它是什么）；一级时为 null */
  activeKey: Ref<string | null>;
  /** 一级页可读名，供返回按钮拼「← 全部群聊」 */
  masterLabel: string | undefined;
  /**
   * 直接绑到根元素上：`<div v-bind="swap.rootProps">`。
   * 存在的理由是不让人手写 `:data-level`：漏写不会报错，只会让 CSS 选不中、
   * 两级同时显示，症状看起来像"原语没生效"。
   */
  rootProps: ComputedRef<{ class: string; 'data-level': string }>;
  /** 进二级。已在二级时只换 key，不重复压历史 */
  open: (key?: string) => void;
  /** 回一级（页内返回按钮用） */
  close: () => void;
  /**
   * 返回一级；返回 true 表示这一层被原语消费掉了。
   * 返回 false 表示当前在一级，调用方应把这层还给它自己的默认行为
   * （安卓返回键的第三态"默认"就靠这个布尔值分流，见批次 2-3）。
   */
  goBack: () => boolean;
}

export function useDrilldown(options: UseDrilldownOptions = {}): UseDrilldown {
  const level = ref<DrilldownLevel>(1);
  const activeKey = ref<string | null>(null);
  const isDetail = computed(() => level.value === 2);

  /**
   * 本实例在历史栈里的唯一 token（批次 2-3 从布尔量改过来）。
   *
   * 布尔量只能回答"我压过一层吗"，回答不了"被弹掉的是不是我"——抽屉/模态也压层
   * 之后，它们在栈顶被弹掉时本实例会误以为"二级被返回了"，于是抽屉开着按一次返回
   * 会连二级页一起退掉（A7 登记的边界）。改成 token 后：栈顶还是我 ⇒ 弹掉的是别人。
   */
  const token = newLayerToken('drilldown');

  /**
   * 本实例是否在历史栈里压过一层。
   * 用它而不是"有没有监听器"来判断 popstate 该不该处理：用户跨路由后退同样会
   * 触发 popstate，那时本实例可能还没卸载但压根没压过记录——不加这个判断，
   * 一次普通的后退就会被误判成"退回一级"。
   */
  let pushed = false;

  /**
   * 上一次 leaveDetail 发出的 history.back() 还没落地。
   *
   * 为什么需要这个标记：back() 是异步的，而状态是同步改的。用户在极短时间内
   * "点返回 → 立刻点另一条目"时，back 还没到、新的 pushState 已经压上去了，
   * 等那条迟到的 popstate 到达，会把**刚打开的二级**当成"系统返回到一级"关掉。
   * 概率低但症状恶心（点开又自己关），所以宁可让这一层不压历史：
   * 代价是这一次的返回键会直接离开页面，比"点开又关"轻。
   */
  let backPending = false;

  const track = options.trackHistory ?? (() => isMobile.value);

  function enterDetail(key?: string): void {
    if (typeof key === 'string') activeKey.value = key;
    if (level.value === 2) return; // 已在二级：只换内容，别把历史栈压成阶梯
    level.value = 2;
    if (!track()) return;
    if (backPending) return; // 上一次后退还没落地，这一层不再压栈（见 backPending 注释）
    if (pushLayer(token)) pushed = true;
  }

  function leaveDetail(): void {
    if (level.value === 1) return;
    level.value = 1;
    activeKey.value = null;
    options.onLeaveDetail?.();

    if (!pushed) return;
    pushed = false;
    // 顺序要紧：先改状态、再退历史。popstate 要等一帧才到，先退历史会让界面
    // 空一拍；而改完 pushed 已是 false，popstate 到达时本实例会忽略它，不会二次归位。
    if (popLayer(token)) backPending = true;
  }

  function handlePop(): void {
    backPending = false;
    if (!pushed) return; // 不是我们压的那层，或本实例已经自己收拾过
    // 栈顶还是我 ⇒ 被弹掉的是我上面那层（抽屉 / 模态），我不该跟着退
    if (topLayerToken() === token) return;
    pushed = false;
    level.value = 1;
    activeKey.value = null;
    options.onLeaveDetail?.();
  }

  onLayerPop(handlePop);

  onBeforeUnmount(() => {
    offLayerPop(handlePop);
    if (!pushed) return;
    pushed = false;
    // 卸载时**不能** history.back()：卸载多半是路由切换引起的，back 会把用户
    // 退回上一个页面。只能把当前记录上的标记抹掉，让这一层退化成一条普通的
    // 同 URL 记录。代价是用户多点一次返回才离开本页——这是登记过的已知边界，
    // 见 DEV_PLAN §6.2 A8。
    stripLayerMark(token);
  });

  return {
    level,
    isDetail,
    activeKey,
    masterLabel: options.masterLabel,
    rootProps: computed(() => ({ class: 'm-swap', 'data-level': String(level.value) })),
    open: enterDetail,
    close: leaveDetail,
    goBack: () => {
      if (level.value !== 2) return false;
      leaveDetail();
      return true;
    },
  };
}
