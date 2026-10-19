/**
 * useChatWindowing — 消息窗口化渲染 + 双向滚动加载 + 搜索跳转（R1-5 从 ChatMain 拆出）
 *
 * 为什么跟着消息区组件走：D-6 修复后的补偿滚动（按 scrollHeight 差值补偿 + 250ms
 * 时间窗屏蔽）与窗口边界是**同一份状态**。父级另持一份 scrollTop 基准就会像 A7
 * 那轮一样分叉——"我补的"和"它看的"不是同一个数。本 composable 的宿主是
 * `ChatMessageArea.vue`，`msgArea` 由它绑定到 `.chat-messages` 根元素。
 * 父级只提供消息数组与"换会话"的键，不接触滚动。
 *
 * 只渲染可见区间 [windowStart, windowEnd) 附近消息（恒 ≤ 2×RENDER_WINDOW），
 * 顶/底 spacer 占位回收区；上滚加载更早 + 下滚恢复更晚，消除长对话 DOM 线性膨胀。
 * 搜索状态刻意**不在**这里：它独立于虚拟化窗口、始终在完整消息数组上计算
 * （长对话不会漏查），见 `ChatSearchBar.vue`。
 */
import { computed, nextTick, ref, watch, type Ref } from 'vue';
import { getMessageWindow, type MessageSearchResult } from '@core/message-search';
import type { UIMessage } from '@/types';

/** 单次加载/回收的条数（窗口恒 ≤ 2×RENDER_WINDOW） */
const RENDER_WINDOW = 100;

// 高度估算（对齐 MessageBubble：font-size 14px / line-height 1.7 / padding 12+16）
const EST_FONT_SIZE = 14;
const EST_LINE_HEIGHT = 14 * 1.7;
const EST_MSG_PADDING_V = 24; // 上下 padding
const EST_MSG_PADDING_H = 32; // 左右 padding

/**
 * @param messages 消息数组取值器（宿主传 `() => char.value?.messages ?? []`）
 * @param msgArea  滚动容器 DOM ref（宿主绑定到 `.chat-messages`）
 * @param resetKey 换会话的键（宿主传 `() => char.value?.id`）；变化即重置窗口
 */
export function useChatWindowing(
  messages: () => UIMessage[],
  msgArea: Ref<HTMLElement | null>,
  resetKey: () => unknown,
) {
  const windowStart = ref(0);
  const windowEnd = ref(0);
  const topSpacerHeight = ref(0);
  const bottomSpacerHeight = ref(0);
  /** 已渲染消息真实高度缓存（回收后恢复时用缓存，比估算更准） */
  const msgHeights = new Map<string, number>();
  let windowInitialized = false;
  /** 容器宽度缓存（避免滚动加载循环中反复读 clientWidth 强制 reflow） */
  let cachedWidth = 600;
  // 加载/回收时抑制自动滚动（保持阅读位置）
  // D-6（REAL_DEVICE_TEST_2026-10-03）：程序补偿滚动会派发真实 scroll 事件（异步到达，
  // 晚于旧布尔旗标复位），被 handleScroll 误判为用户滚动 → 顶部占位重复累加的 ping-pong。
  // 改为时间窗屏蔽：补偿后 250ms 内的 scroll 事件一律视为程序滚动。
  let suppressScrollUntil = 0;
  // 双向防重入（滚动事件高频触发）
  const windowLoading = ref(false);
  /** 视口是否贴底（P2-11 Phase4：不在底部时显示"回到底部"浮动按钮） */
  const atBottom = ref(true);

  /** 按缓存的消息区宽度估算每行可容纳字符数（P2-11 Phase4） */
  function charsPerLine(): number {
    const textWidth = Math.min(cachedWidth * 0.7, 560) - EST_MSG_PADDING_H;
    return Math.max(8, Math.floor(textWidth / EST_FONT_SIZE));
  }

  function estimateMsgHeight(content: string): number {
    if (!content) return EST_MSG_PADDING_V;
    const lines = Math.max(1, Math.ceil(content.length / charsPerLine()));
    return EST_MSG_PADDING_V + lines * EST_LINE_HEIGHT;
  }

  function msgHeightAt(index: number): number {
    const m = messages()[index];
    if (!m) return 0;
    return msgHeights.get(m.id) ?? estimateMsgHeight(m.content);
  }

  const visibleMessages = computed(() =>
    messages().slice(windowStart.value, windowEnd.value)
  );
  const hasOlderMessages = computed(() => windowStart.value > 0);
  const hasNewerMessages = computed(() => windowEnd.value < messages().length);

  function sumMessageHeights(start: number, end: number): number {
    let total = 0;
    for (let i = start; i < end; i++) total += msgHeightAt(i);
    return total;
  }

  function resetWindow(): void {
    cachedWidth = msgArea.value?.clientWidth ?? cachedWidth;
    const len = messages().length;
    windowEnd.value = len;
    windowStart.value = Math.max(0, len - RENDER_WINDOW);
    topSpacerHeight.value = 0;
    bottomSpacerHeight.value = 0;
  }

  /** 消息加载就绪后初始化窗口（初始显示尾部窗口） */
  function ensureWindow(): void {
    if (!windowInitialized && messages().length > 0) {
      windowInitialized = true;
      resetWindow();
    }
  }

  /** D-6：占位高度按窗口边界重算（Σ 高度），替代旧实现的增量累加（只加不减 → ping-pong） */
  function recalcSpacers(): void {
    let top = 0;
    for (let i = 0; i < windowStart.value; i++) top += msgHeightAt(i);
    topSpacerHeight.value = top;
    let bottom = 0;
    for (let i = windowEnd.value; i < messages().length; i++) bottom += msgHeightAt(i);
    bottomSpacerHeight.value = bottom;
  }

  /** 上滚加载更早消息 + 同步回收底部（窗口恒 ≤ 2×RENDER_WINDOW） */
  async function loadOlderMessages(): Promise<void> {
    if (windowLoading.value || windowStart.value <= 0) return;
    windowLoading.value = true;
    const el = msgArea.value;
    const prevScrollTop = el ? el.scrollTop : 0;
    const prevScrollHeight = el ? el.scrollHeight : 0;
    const newStart = Math.max(0, windowStart.value - RENDER_WINDOW);
    windowStart.value = newStart;
    // 回收底部
    const maxEnd = windowStart.value + 2 * RENDER_WINDOW;
    if (windowEnd.value > maxEnd) {
      windowEnd.value = maxEnd;
    }
    recalcSpacers();
    await nextTick();
    // 顶部 spacer 增加 → 补偿滚动位置，保持视觉稳定
    if (el) {
      el.scrollTop = prevScrollTop + (el.scrollHeight - prevScrollHeight);
    }
    // D-6：补偿赋值派发的 scroll 事件异步到达——用时间窗屏蔽，而非立即复位布尔旗标
    suppressScrollUntil = Date.now() + 250;
    windowLoading.value = false;
  }

  /** 下滚恢复更晚消息 + 同步回收顶部 */
  async function loadNewerMessages(): Promise<void> {
    if (windowLoading.value || !hasNewerMessages.value) return;
    windowLoading.value = true;
    const el = msgArea.value;
    const prevScrollTop = el ? el.scrollTop : 0;
    const prevScrollHeight = el ? el.scrollHeight : 0;
    const newEnd = Math.min(messages().length, windowEnd.value + RENDER_WINDOW);
    windowEnd.value = newEnd;
    // 回收顶部
    const minStart = windowEnd.value - 2 * RENDER_WINDOW;
    if (windowStart.value < minStart) {
      windowStart.value = minStart;
    }
    recalcSpacers();
    await nextTick();
    // 底部 spacer 减少/消息增加 → 内容向下延伸，按差值补偿保持视口内容稳定
    if (el) {
      const delta = el.scrollHeight - prevScrollHeight;
      if (delta !== 0) el.scrollTop = prevScrollTop + delta;
    }
    suppressScrollUntil = Date.now() + 250;
    windowLoading.value = false;
  }

  function jumpToBottom(): void {
    const el = msgArea.value;
    if (!el) return;
    if (windowEnd.value < messages().length) {
      windowEnd.value = messages().length;
      bottomSpacerHeight.value = 0;
    }
    el.scrollTop = el.scrollHeight;
    atBottom.value = true;
  }

  /** 滚动方向感知：上滚近顶加载更早，下滚近底恢复更晚 */
  function handleScroll(): void {
    const el = msgArea.value;
    if (!el || windowLoading.value) return;
    // D-6：程序补偿滚动的时间窗屏蔽（补偿赋值派发的 scroll 事件在此被忽略）
    if (suppressScrollUntil > 0) {
      if (Date.now() < suppressScrollUntil) return;
      suppressScrollUntil = 0;
    }
    atBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
    if (el.scrollTop < 300 && hasOlderMessages.value) {
      void loadOlderMessages();
      return;
    }
    if (
      el.scrollHeight - el.scrollTop - el.clientHeight < 300 &&
      hasNewerMessages.value
    ) {
      void loadNewerMessages();
    }
  }

  /** 渲染后缓存消息真实高度（回收恢复时用缓存替代估算） */
  function cacheMsgHeight(el: unknown, id: string): void {
    const node = el as ({ $el?: HTMLElement } & HTMLElement) | null;
    const domEl = node && node.$el ? node.$el : (node as HTMLElement | null);
    if (domEl && domEl.offsetHeight > 0 && !msgHeights.has(id)) {
      msgHeights.set(id, domEl.offsetHeight);
    }
  }

  /** 将虚拟化窗口重定位到搜索命中的消息，并把目标滚入可视区域（高亮由宿主设） */
  async function jumpToMessage(result: MessageSearchResult): Promise<void> {
    if (windowLoading.value) return;
    const el = msgArea.value;
    const msgs = messages();
    if (!el || result.index < 0 || result.index >= msgs.length) return;

    const nextWindow = getMessageWindow(result.index, msgs.length, RENDER_WINDOW * 2);
    windowStart.value = nextWindow.start;
    windowEnd.value = nextWindow.end;
    topSpacerHeight.value = sumMessageHeights(0, nextWindow.start);
    bottomSpacerHeight.value = sumMessageHeights(nextWindow.end, msgs.length);

    try {
      await nextTick();
      const target = [...el.querySelectorAll<HTMLElement>('[data-message-id]')].find(
        (node) => node.dataset.messageId === result.id,
      );
      if (target) {
        if (typeof target.scrollIntoView === 'function') {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
          el.scrollTop = Math.max(0, target.offsetTop - el.clientHeight / 2);
        }
      }
      atBottom.value = result.index >= msgs.length - 1;
    } finally {
      suppressScrollUntil = Date.now() + 250;
    }
  }

  // 切换角色时重置窗口（immediate: 首次挂载即初始化窗口，P2-11）
  watch(
    resetKey,
    () => {
      windowInitialized = false;
      resetWindow();
    },
    { immediate: true }
  );

  // ── 自动滚动到底部 ──
  watch(
    () => messages().length,
    () => {
      ensureWindow(); // P2-11：消息就绪后初始化窗口（首次）
      if (suppressScrollUntil > Date.now()) return;
      const el = msgArea.value;
      // 视口在底部时，窗口跟随新消息并滚底
      const nearBottom = el && el.scrollHeight - el.scrollTop - el.clientHeight < 50;
      if (nearBottom && windowEnd.value < messages().length) {
        windowEnd.value = messages().length;
        bottomSpacerHeight.value = 0;
      }
      void nextTick(() => {
        if (msgArea.value) {
          msgArea.value.scrollTop = msgArea.value.scrollHeight;
        }
      });
    }
  );

  // 已渲染内容变化（流式写入）也要跟随滚底
  watch(
    () => visibleMessages.value.map((m) => m.content).join(''),
    () => {
      if (suppressScrollUntil > Date.now()) return;
      void nextTick(() => {
        if (msgArea.value) {
          msgArea.value.scrollTop = msgArea.value.scrollHeight;
        }
      });
    }
  );

  return {
    windowStart,
    windowEnd,
    topSpacerHeight,
    bottomSpacerHeight,
    visibleMessages,
    hasOlderMessages,
    atBottom,
    handleScroll,
    loadOlderMessages,
    jumpToBottom,
    jumpToMessage,
    cacheMsgHeight,
  };
}
