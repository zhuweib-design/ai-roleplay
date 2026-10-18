<script setup lang="ts">
import { ref, watch, nextTick, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useCharacterStore } from '@/stores/character';
import { useChatStore } from '@/stores/chat';
import { useSettingsStore } from '@/stores/settings';
import { useStoryStore } from '@/stores/story';
import { useReadinessJump } from '@/composables/useReadinessJump';
import ChatModeSwitch from '@/components/chat/ChatModeSwitch.vue';
import { uiMsgsToChatMsgs } from '@/services/type-adapters';
import { getWorldUserDisplayName } from '@/stores/chat-context';
import { resolveLatestStatus } from '@core/status-parser';
import { stripNarrationMarkers, parseNarrationSegments } from '@core/narration';
import { downloadChatMarkdown } from '@/services/backup-service';
import type { Chat } from '@/storage/types';
import Icon from '@/components/common/Icon.vue';
import Avatar from '@/components/common/Avatar.vue';
import MessageBubble from './MessageBubble.vue';
import MessageActionSheet from './MessageActionSheet.vue';
import { assistantMsgActions } from './message-actions';
import StatusHud from './StatusHud.vue';
import Toast from '@/components/common/Toast.vue';
import Modal from '@/components/common/Modal.vue';
import ApiErrorModal from '@/components/common/ApiErrorModal.vue';
import type { QuickReplyButton } from '@/types';
// F12.2 TTS / F12.3 翻译
import { ttsService, isTTSSupported } from '@services/tts-service';
import { translateText, TranslationError } from '@services/translator';
import { t } from '@/i18n';
import { showToast } from '@/utils/toast-service';
import { useViewport } from '@/core/viewport';
import ContextReadinessBar from '@/components/layout/ContextReadinessBar.vue';
import {
  getMessageWindow,
  searchMessages,
  type MessageSearchResult,
} from '@core/message-search';

const router = useRouter();
const characterStore = useCharacterStore();
const chatStore = useChatStore();
const settings = useSettingsStore();
// F16.4 故事时间（用于顶栏显示）
const storyStore = useStoryStore();
// I-1：aria-expanded 随视口反映正确的面板状态（桌面 panelExpanded / 移动平板 contextDrawerOpen）
// isCoarsePointer：手指端（软键盘没有 Shift 键），Enter 让位给换行、发送靠按钮
// isMobile：批次 2-4 起用于"手机档不挂页头分段控件"（群聊已是底栏 Tab）
const { isCompact, isCoarsePointer, isMobile } = useViewport();

// I-14：承接 ChatView 传入的 inert，仅作用于聊天内容区与输入区，
// 顶栏的 panel-toggle-btn 保持可交互（打开上下文面板后仍能二次点击关闭）
const props = defineProps<{ inert?: boolean }>();

// F12.3 消息翻译结果（按消息 id 缓存译文）
const messageTranslations = ref<Record<string, string>>({});

// Toast 反馈状态（F12.2/F12.3）
const toastOpen = ref(false);
const toastMessage = ref('');
const toastType = ref<'info' | 'success' | 'error'>('info');

// 需求9：API 错误诊断 Modal 状态
const apiErrorModalOpen = ref(false);
/** 上次已展示过的错误引用，避免同一错误重复弹窗 */
let lastShownErrorRef: unknown = null;

watch(
  () => chatStore.lastError,
  (err) => {
    if (!err) return;
    // aborted 错误已通过消息气泡显示，不弹 Modal
    if (err.type === 'aborted') return;
    // 避免对同一错误对象重复弹窗
    if (err.original === lastShownErrorRef && lastShownErrorRef !== null) return;
    lastShownErrorRef = err.original ?? null;
    apiErrorModalOpen.value = true;
  }
);

function handleApiErrorGoToSettings() {
  void router.push({ name: 'settings' });
}

function handleApiErrorRetry() {
  // 重试最近一条用户消息
  const msgs = char.value.messages;
  const lastUser = [...msgs].reverse().find((m) => m.role === 'user');
  if (!lastUser) return;
  // 复用现有发送逻辑：将原文本重新发送
  void chatStore.sendMessage(char.value, lastUser.content);
}

function handleApiErrorClose() {
  // 清空 chatStore.lastError 避免下次开启 Modal 时仍残留旧错误
  chatStore.clearLastError();
}

const textarea = ref<HTMLTextAreaElement | null>(null);
const msgArea = ref<HTMLElement | null>(null);

const char = computed(() => characterStore.currentCharacter!);

// ── P1 会话级状态 HUD ──
// 纯 computed 派生（resolveLatestStatus 从后往前回溯，key 首次出现即锁定），
// 零额外持久化、不随消息数增长 DOM。消息级渲染本轮不做（决策 2），但 msg.status 照常存储。
const latestStatus = computed(() =>
  resolveLatestStatus(char.value?.messages ?? [], char.value?.statusSchema ?? null)
);
/** 顶部状态条开关（默认开；关闭时不渲染，解析与存储不受影响） */
const showStatusHud = computed(() => settings.statusHudConfig?.showSticky !== false);

// ── P2-11 性能：双向窗口化渲染(替代 P1-9 尾部窗口) ──
// 只渲染可见区间 [windowStart, windowEnd) 附近消息(恒 ≤ 2×RENDER_WINDOW),
// 顶/底 spacer 占位回收区; 上滚加载更早 + 下滚恢复更晚, 消除长对话 DOM 线性膨胀
const RENDER_WINDOW = 100;
const windowStart = ref(0);
const windowEnd = ref(0);
const topSpacerHeight = ref(0);
const bottomSpacerHeight = ref(0);
// 已渲染消息真实高度缓存(回收后恢复时用缓存, 比估算更准)
const msgHeights = new Map<string, number>();
// 首次消息就绪后初始化窗口
let windowInitialized = false;

// 高度估算(MessageBubble: font-size 14px / line-height 1.7 / max-width min(70%, 40em) / padding 12+16)
const EST_FONT_SIZE = 14;
const EST_LINE_HEIGHT = 14 * 1.7;
const EST_MSG_PADDING_V = 24; // 上下 padding
const EST_MSG_PADDING_H = 32; // 左右 padding

// 容器宽度缓存(避免滚动加载循环中反复读 clientWidth 强制 reflow)
let cachedWidth = 600;

/** 按缓存的消息区宽度估算每行可容纳字符数(P2-11 Phase4) */
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
  const m = char.value.messages[index];
  if (!m) return 0;
  return msgHeights.get(m.id) ?? estimateMsgHeight(m.content);
}

const visibleMessages = computed(() =>
  char.value.messages.slice(windowStart.value, windowEnd.value)
);
const hasOlderMessages = computed(() => windowStart.value > 0);
const hasNewerMessages = computed(
  () => windowEnd.value < char.value.messages.length
);
// 加载/回收时抑制自动滚动(保持阅读位置)
// D-6（REAL_DEVICE_TEST_2026-10-03）：程序补偿滚动会派发真实 scroll 事件（异步到达，
// 晚于旧布尔旗标复位），被 handleScroll 误判为用户滚动 → 顶部占位重复累加的 ping-pong。
// 改为时间窗屏蔽：补偿后 250ms 内的 scroll 事件一律视为程序滚动。
let suppressScrollUntil = 0;
// 双向防重入(滚动事件高频触发)
const windowLoading = ref(false);

// ── 0.5.0 全文搜索 ──
// 搜索状态独立于虚拟化窗口，始终在完整消息数组上计算，长对话不会漏查。
const searchOpen = ref(false);
const searchInput = ref<HTMLInputElement | null>(null);
const searchQuery = ref('');
const activeSearchIndex = ref(-1);
const highlightedMessageId = ref<string | null>(null);
const searchResults = computed(() =>
  searchMessages(char.value?.messages ?? [], searchQuery.value),
);
const activeSearchResult = computed<MessageSearchResult | null>(() => {
  const index = activeSearchIndex.value;
  return index >= 0 ? searchResults.value[index] ?? null : null;
});

function toggleSearch(): void {
  searchOpen.value = !searchOpen.value;
  if (searchOpen.value) {
    void nextTick(() => searchInput.value?.focus());
  } else {
    closeSearch();
  }
}

function closeSearch(): void {
  searchOpen.value = false;
  searchQuery.value = '';
  activeSearchIndex.value = -1;
  highlightedMessageId.value = null;
}

function handleSearchKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeSearch();
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    navigateSearch(event.shiftKey ? -1 : 1);
  }
}

function sumMessageHeights(start: number, end: number): number {
  let total = 0;
  for (let i = start; i < end; i++) total += msgHeightAt(i);
  return total;
}

function resetWindow(): void {
  cachedWidth = msgArea.value?.clientWidth ?? cachedWidth;
  const len = char.value.messages.length;
  windowEnd.value = len;
  windowStart.value = Math.max(0, len - RENDER_WINDOW);
  topSpacerHeight.value = 0;
  bottomSpacerHeight.value = 0;
}

/** 将虚拟化窗口重定位到搜索命中的消息，并把目标滚入可视区域。 */
async function jumpToMessage(result: MessageSearchResult): Promise<void> {
  if (windowLoading.value) return;
  const el = msgArea.value;
  const messages = char.value.messages;
  if (!el || result.index < 0 || result.index >= messages.length) return;

  const nextWindow = getMessageWindow(result.index, messages.length, RENDER_WINDOW * 2);
  windowStart.value = nextWindow.start;
  windowEnd.value = nextWindow.end;
  topSpacerHeight.value = sumMessageHeights(0, nextWindow.start);
  bottomSpacerHeight.value = sumMessageHeights(nextWindow.end, messages.length);
  highlightedMessageId.value = result.id;

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
    atBottom.value = result.index >= messages.length - 1;
  } finally {
    suppressScrollUntil = Date.now() + 250;
  }
}

/** 按搜索结果循环前进或后退，并跳转到目标消息。 */
function navigateSearch(direction: 1 | -1): void {
  const results = searchResults.value;
  if (results.length === 0) return;
  const current = activeSearchIndex.value;
  const next = current < 0
    ? direction > 0 ? 0 : results.length - 1
    : (current + direction + results.length) % results.length;
  activeSearchIndex.value = next;
  const result = results[next];
  if (result) void jumpToMessage(result);
}

// 消息加载就绪后初始化窗口(初始显示尾部窗口)
function ensureWindow(): void {
  if (!windowInitialized && char.value.messages.length > 0) {
    windowInitialized = true;
    resetWindow();
  }
}

/** 上滚加载更早消息 + 同步回收底部(窗口恒 ≤ 2×RENDER_WINDOW) */
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
  // 顶部 spacer 增加 → 补偿滚动位置, 保持视觉稳定
  if (el) {
    el.scrollTop = prevScrollTop + (el.scrollHeight - prevScrollHeight);
  }
  // D-6：补偿赋值派发的 scroll 事件异步到达——用时间窗屏蔽，而非立即复位布尔旗标
  suppressScrollUntil = Date.now() + 250;
  windowLoading.value = false;
}

/** D-6：占位高度按窗口边界重算（Σ 高度），替代旧实现的增量累加（只加不减 → ping-pong） */
function recalcSpacers(): void {
  let top = 0;
  for (let i = 0; i < windowStart.value; i++) top += msgHeightAt(i);
  topSpacerHeight.value = top;
  let bottom = 0;
  for (let i = windowEnd.value; i < char.value.messages.length; i++) bottom += msgHeightAt(i);
  bottomSpacerHeight.value = bottom;
}

/** 下滚恢复更晚消息 + 同步回收顶部 */
async function loadNewerMessages(): Promise<void> {
  if (windowLoading.value || !hasNewerMessages.value) return;
  windowLoading.value = true;
  const el = msgArea.value;
  const prevScrollTop = el ? el.scrollTop : 0;
  const prevScrollHeight = el ? el.scrollHeight : 0;
  const newEnd = Math.min(char.value.messages.length, windowEnd.value + RENDER_WINDOW);
  windowEnd.value = newEnd;
  // 回收顶部
  const minStart = windowEnd.value - 2 * RENDER_WINDOW;
  if (windowStart.value < minStart) {
    windowStart.value = minStart;
  }
  recalcSpacers();
  await nextTick();
  // 底部 spacer 减少/消息增加 → 内容向下延伸, 按差值补偿保持视口内容稳定
  if (el) {
    const delta = el.scrollHeight - prevScrollHeight;
    if (delta !== 0) el.scrollTop = prevScrollTop + delta;
  }
  suppressScrollUntil = Date.now() + 250;
  windowLoading.value = false;
}

// P2-11 Phase4: 视口不在底部时显示"回到底部"浮动按钮
const atBottom = ref(true);
function jumpToBottom(): void {
  const el = msgArea.value;
  if (!el) return;
  if (windowEnd.value < char.value.messages.length) {
    windowEnd.value = char.value.messages.length;
    bottomSpacerHeight.value = 0;
  }
  el.scrollTop = el.scrollHeight;
  atBottom.value = true;
}

// 滚动方向感知: 上滚近顶加载更早, 下滚近底恢复更晚
function handleScroll() {
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

// 切换角色时重置窗口(immediate: 首次挂载即初始化窗口, P2-11)
watch(
  () => char.value.id,
  () => {
    windowInitialized = false;
    closeSearch();
    resetWindow();
  },
  { immediate: true }
);

watch(searchQuery, () => {
  activeSearchIndex.value = -1;
  highlightedMessageId.value = null;
});

watch(searchResults, (results) => {
  if (results.length === 0) {
    activeSearchIndex.value = -1;
  } else if (activeSearchIndex.value >= results.length) {
    activeSearchIndex.value = results.length - 1;
  }
});

/** 渲染后缓存消息真实高度(回收恢复时用缓存替代估算) */
function cacheMsgHeight(el: unknown, id: string): void {
  const node = el as ({ $el?: HTMLElement } & HTMLElement) | null;
  const domEl = node && node.$el ? node.$el : (node as HTMLElement | null);
  if (domEl && domEl.offsetHeight > 0 && !msgHeights.has(id)) {
    msgHeights.set(id, domEl.offsetHeight);
  }
}

// F08.2 聊天背景图片样式（应用到 .chat-messages 容器）
const chatBgStyle = computed(() => {
  const bg = settings.chatBackground;
  if (bg.type === 'none' || !bg.value) return {};
  return {
    backgroundImage: `url(${bg.value})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  };
});

// F08.2 背景遮罩层样式（半透明遮罩 + 模糊，保证文字可读性）
const chatBgOverlayStyle = computed(() => {
  const bg = settings.chatBackground;
  if (bg.type === 'none' || !bg.value) return { display: 'none' };
  // 遮罩不透明度 = 1 - 背景不透明度（背景越透明，遮罩越深）
  return {
    opacity: 1 - bg.opacity,
    backdropFilter: bg.blur > 0 ? `blur(${bg.blur}px)` : 'none',
    WebkitBackdropFilter: bg.blur > 0 ? `blur(${bg.blur}px)` : 'none',
  };
});

// F08.2 气泡样式 CSS 变量（应用到 .chat-main 根元素，供 MessageBubble 使用）
const bubbleCssVars = computed(() => ({
  '--bubble-radius': `${settings.bubbleStyle.radius}px`,
  '--bubble-opacity': String(settings.bubbleStyle.opacity),
}));

// F16.4 故事时间显示（角色关联故事时显示）
const storyTimeText = computed(() => {
  const storyId = char.value.storyId;
  if (!storyId) return '';
  return storyStore.getFormattedStoryTime(storyId);
});

// E15：故事时间原来只是"显示"，从这里跳不到故事本体。带 ?story= 过去，
// 故事引擎会据此选中那一条；回程由 App 的全局"返回来源页"承接（from 自动写入）。
const { pushWithReturn } = useReadinessJump();
function goToStory(): void {
  const storyId = char.value.storyId;
  if (!storyId) return;
  pushWithReturn({ name: 'story', query: { story: storyId } });
}

// ── 自动滚动到底部 ──
watch(
  () => char.value.messages.length,
  () => {
    ensureWindow(); // P2-11: 消息就绪后初始化窗口(首次)
    if (suppressScrollUntil > Date.now()) return;
    const el = msgArea.value;
    // 视口在底部时, 窗口跟随新消息并滚底
    const atBottom = el && el.scrollHeight - el.scrollTop - el.clientHeight < 50;
    if (atBottom && windowEnd.value < char.value.messages.length) {
      windowEnd.value = char.value.messages.length;
      bottomSpacerHeight.value = 0;
    }
    void nextTick(() => {
      if (msgArea.value) {
        msgArea.value.scrollTop = msgArea.value.scrollHeight;
      }
    });
  }
);

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

// ── 输入区 ──
/**
 * 高度自适应：JS 只负责把 height 交回内容高度，上下限全部由 CSS 的
 * min-height / max-height 夹取（layout.css 的 .chat-input）。
 * 旧实现在这里另写死 56/200，与 ≤640 档 CSS 的 48/160 是两套数、互相压制，
 * 表现是"手机上永远长不过 160，但 JS 一直以为自己给到了 200"。
 */
function adjustHeight() {
  const el = textarea.value;
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${Math.ceil(el.scrollHeight)}px`;
}

function handleSend() {
  const el = textarea.value;
  if (!el) return;
  const text = el.value.trim();
  if (!text || chatStore.isGenerating) return;
  // D-10：发送被拒（未配置 / 主密码锁定）时保留输入正文，不清空输入框
  const blocked = chatStore.checkSendBlock();
  if (blocked) {
    showToast('info', t(blocked === 'locked' ? 'char.profileLocked' : 'store.noApiProfile'));
    return;
  }
  void chatStore.sendMessage(char.value, text);
  el.value = '';
  adjustHeight();
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key !== 'Enter' || e.shiftKey) return;
  // 手指端：软键盘的 Enter 用于换行，发送靠输入区右侧那颗按钮（它已在右、且常驻可见）。
  // 桌面端维持既有约定：Enter 发送、Shift+Enter 换行。
  if (isCoarsePointer.value) return;
  // I-6：IME 组词中（中文拼音/日文假名/韩文）按回车不发送；组词完成后再按回车正常发送
  if (e.isComposing || e.keyCode === 229) return;
  e.preventDefault();
  handleSend();
}

function handleStop() {
  chatStore.stop();
}

// 导出当前对话为 Markdown 文件（第5条）
async function handleExportChat() {
  const msgs = char.value.messages;
  if (msgs.length === 0) {
    toastMessage.value = t('chat.emptyChat');
    toastType.value = 'info';
    toastOpen.value = true;
    return;
  }
  const chat: Chat = {
    id: `chat-${char.value.id}`,
    characterId: char.value.id,
    title: t('chat.conversationTitle', { name: char.value.name }),
    messages: uiMsgsToChatMsgs(msgs),
    createdAt: new Date(msgs[0]!.timestamp).toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const outcome = await downloadChatMarkdown(chat, char.value.name, getWorldUserDisplayName(char.value.id));
  // 用户在系统保存面板里取消 ⇒ 不报"已导出"
  if (outcome === 'cancelled') return;
  toastMessage.value = t('chat.exportedMarkdown');
  toastType.value = 'success';
  toastOpen.value = true;
}

function handleMessageAction(msgId: string, action: string) {
  switch (action) {
    case 'copy': {
      const msg = char.value.messages.find((m) => m.id === msgId);
      // 竞态兜底：消息可能已被并发删除，find 无果时跳过访问，避免裸 TypeError（copy 本为静默能力）
      if (!msg) break;
      chatStore.copyMessage(msg);
      break;
    }
    case 'delete':
      // O-10/O-16（REAL_DEVICE_TEST_2026-10-03）：消息删除不可逆——补二次确认，
      // 与会话级删除的两步强度对齐
      deleteConfirmMsgId.value = msgId;
      break;
    case 'regenerate':
      void chatStore.regenerateMessage(char.value, msgId);
      break;
    case 'edit': {
      // P1-3：改用应用内 Modal 编辑，替代原生 window.prompt
      const msg = char.value.messages.find((m) => m.id === msgId);
      if (msg) {
        editTarget.value = msg;
        editDraft.value = msg.content;
        editModalOpen.value = true;
      }
      break;
    }
    case 'speak': {
      // F12.2 TTS 朗读
      const msg = char.value.messages.find((m) => m.id === msgId);
      if (msg) {
        speakMessage(stripNarrationMarkers(msg.content));
      }
      break;
    }
    case 'translate': {
      // F12.3 消息翻译
      const msg = char.value.messages.find((m) => m.id === msgId);
      if (msg) {
        void translateMessage(msg);
      }
      break;
    }
  }
}

// ── 长按动作条：触屏没有 hover，操作入口改成长按唤起 ──
const actionSheetMsgId = ref<string | null>(null);
const sheetActions = computed(() => assistantMsgActions());

function handleMessageLongPress(msgId: string) {
  actionSheetMsgId.value = msgId;
}

function closeActionSheet() {
  const id = actionSheetMsgId.value;
  actionSheetMsgId.value = null;
  if (!id) return;
  // 关闭后把焦点交还这条消息，键盘用户不必从列表头再 Tab 一遍
  document.querySelector<HTMLElement>(`.msg-wrap[data-message-id="${CSS.escape(id)}"]`)?.focus();
}

function handleSheetAction(key: string) {
  const id = actionSheetMsgId.value;
  closeActionSheet();
  if (id) handleMessageAction(id, key);
}

// ── P1-3：消息编辑 Modal（替代原生 prompt） ──
const editModalOpen = ref(false);
// O-10/O-16：消息删除二次确认
const deleteConfirmMsgId = ref<string | null>(null);
const deleteConfirmModalOpen = computed({
  get: () => deleteConfirmMsgId.value !== null,
  set: (v: boolean) => {
    if (!v) deleteConfirmMsgId.value = null;
  },
});
function confirmDeleteMessage(): void {
  if (deleteConfirmMsgId.value) {
    chatStore.deleteMessage(char.value, deleteConfirmMsgId.value);
  }
  deleteConfirmMsgId.value = null;
}
const editTarget = ref<import('@/types').UIMessage | null>(null);
const editDraft = ref('');

/**
 * 编辑框下方的预览：走与气泡**同一个**分段函数，所以"编辑时看到的就是发出去后会长成的样子"。
 * 文本框里仍是带 ⟦ ⟧ 的原文（那是存储格式，删了就没法再区分哪句是心理活动），
 * 但用户不必靠猜——预览已经把两段拆开排好了，旁边一句话说明标记是什么。
 */
const editSegments = computed(() => parseNarrationSegments(editDraft.value));

function confirmEditMessage() {
  const msg = editTarget.value;
  if (!msg) return;
  const newText = editDraft.value.trim();
  if (newText && newText !== msg.content) {
    chatStore.editMessage(msg, newText);
    chatStore.persistAfterEdit(char.value);
  }
  editModalOpen.value = false;
  editTarget.value = null;
}

// ── F12.2 TTS 朗读 ──

function speakMessage(text: string) {
  if (!isTTSSupported()) {
    toastMessage.value = t('chat.ttsUnsupported');
    toastType.value = 'error';
    toastOpen.value = true;
    return;
  }
  if (ttsService.isSpeaking) {
    ttsService.stop();
    toastMessage.value = t('chat.ttsStopped');
    toastType.value = 'info';
    toastOpen.value = true;
    return;
  }
  const config = settings.ttsConfig;
  // O-9（REAL_DEVICE_TEST_2026-10-03）：未启用时此前静默无效，而同面板翻译有明确提示——
  // 补齐对称反馈，避免用户无从判断"没开还是坏了"
  if (!config.enabled) {
    toastMessage.value = t('chat.ttsDisabled');
    toastType.value = 'info';
    toastOpen.value = true;
    return;
  }
  ttsService.speak({
    text,
    voiceURI: config.voiceURI,
    rate: config.rate,
    pitch: config.pitch,
    volume: config.volume,
    onError: (err) => {
      toastMessage.value = t('chat.ttsFailed', { error: String(err) });
      toastType.value = 'error';
      toastOpen.value = true;
    },
  });
}

// ── F12.3 消息翻译 ──

async function translateMessage(msg: { id: string; content: string }) {
  const config = settings.translationConfig;
  if (!config.enabled) {
    toastMessage.value = t('chat.translateDisabled');
    toastType.value = 'error';
    toastOpen.value = true;
    return;
  }
  try {
    const result = await translateText(stripNarrationMarkers(msg.content), config);
    // 将翻译结果存到 messageTranslation 映射
    messageTranslations.value[msg.id] = result.translatedText;
    toastMessage.value = t('chat.translateDone');
    toastType.value = 'success';
    toastOpen.value = true;
  } catch (err) {
    const message =
      err instanceof TranslationError
        ? err.message
        : t('chat.translateFailed', {
            error: err instanceof Error ? err.message : String(err),
          });
    toastMessage.value = message;
    toastType.value = 'error';
    toastOpen.value = true;
  }
}

// 注：原「附件/引用/图片/语音」四个工具栏按钮为未实现占位（点击弹出"功能开发中"），
// 已移除入口，避免误导用户；后续实现对应能力后再恢复。

// ── F11.3 Quick Reply ──

/** 按 group 字段分组的 Quick Reply 按钮 */
const quickReplyGroups = computed(() => {
  const groups: Array<{ name: string; buttons: QuickReplyButton[] }> = [];
  const map = new Map<string, QuickReplyButton[]>();
  for (const btn of settings.quickReplies) {
    const g = btn.group || '';
    if (!map.has(g)) map.set(g, []);
    map.get(g)!.push(btn);
  }
  for (const [name, buttons] of map) {
    groups.push({ name, buttons });
  }
  return groups;
});

/** 点击 Quick Reply 按钮：autoSend 时直接发送，否则填入输入框 */
function handleQuickReply(btn: QuickReplyButton) {
  if (chatStore.isGenerating) return;
  if (btn.autoSend) {
    void chatStore.sendMessage(char.value, btn.script);
  } else {
    if (textarea.value) {
      textarea.value.value = btn.script;
      adjustHeight();
      textarea.value.focus();
    }
  }
}

// ── P2-#6 空对话引导卡 ──
const isChatEmpty = computed(
  () => !!char.value && char.value.messages.length === 0
);
const examplePrompts = computed(() => [
  { key: 'chat.example1', text: t('chat.example1') },
  { key: 'chat.example2', text: t('chat.example2') },
  { key: 'chat.example3', text: t('chat.example3') },
  { key: 'chat.example4', text: t('chat.example4') },
]);
/** 点击示例开场白：填入输入框并聚焦（不自动发送，由用户确认后发送） */
function startWithExample(text: string) {
  if (chatStore.isGenerating) return;
  if (textarea.value) {
    textarea.value.value = text;
    adjustHeight();
    textarea.value.focus();
  }
}
</script>

<template>
  <!-- 批次 0-6：此前 props.inert 只落在 `<footer class="chat-footer">` 上，
       抽屉打开时第 13 次 Tab 会逃到遮罩后面的聊天区。根元素接上 inert 后，
       遮罩后面的整个主区（含页头与消息区）都不再可聚焦。 -->
  <main
    id="main-content"
    class="chat-main"
    :inert="props.inert ? true : undefined"
    :style="bubbleCssVars"
    :aria-label="t('chat.mainAria')"
    tabindex="-1"
  >
    <!-- 顶栏 -->
    <header class="chat-header">
      <button
        type="button"
        class="mobile-menu-btn client-compact-only"
        :aria-label="t('chat.openCharList')"
        @click="characterStore.toggleCharacterList()"
      >
        <Icon name="menu" :size="20" />
      </button>

      <div class="chat-title">
        <Avatar :character="char" :size="24" />
        <span class="chat-name truncate">{{ char.name }}</span>
        <span class="model-badge" :class="{ 'not-configured': !settings.activeProfile }">{{ settings.activeProfile?.model ?? t('chat.modelNotConfigured') }}</span>
      </div>

      <!--
        单聊 ⇄ 群聊：两条通道是同一次对话的两种形态，切换要在这里看得见。
        **手机档不挂**（批次 2-4）：A12 把群聊升成底部 Tab 之后，这条切换在手机上
        就是"底栏那个「群聊」Tab"，而它自己占 146px——390 宽下把角色名压到 28px
        （整行只剩 62px）。桌面没有底栏，切换仍然需要，所以按端分流。
      -->
      <ChatModeSwitch v-if="!isMobile" class="chat-mode-switch-slot" />

      <!--
        原来整块 aria-hidden="true"：读屏完全拿不到 token 用量与缓存命中率。
        去掉后，两个指标 span 补 tabindex="0"，键盘 Tab 到就能听到 v-tip 的描述
        （不可聚焦的元素挂 aria-describedby 等于没挂）。
      -->
      <div class="chat-token">
        {{ t('chat.tokenUsed', { count: (chatStore.totalTokenUsage / 1000).toFixed(1) }) }}
        <span
          v-if="chatStore.prefixCacheHitRate !== null"
          class="cache-rate"
          tabindex="0"
          v-tip="t('chat.cacheHitTitle', { hit: chatStore.cacheUsage.hitTokens, miss: chatStore.cacheUsage.missTokens, reported: chatStore.cacheUsage.reported })"
        >
          · {{ t('chat.cacheHit', { percent: (chatStore.prefixCacheHitRate * 100).toFixed(0) }) }}
        </span>
        <span
          v-else-if="chatStore.prefixStableRate !== null"
          class="cache-rate local"
          tabindex="0"
          v-tip="t('chat.prefixStableTitle', { stable: chatStore.prefixStability.stable, total: chatStore.prefixStability.total, last: chatStore.ttftStats.lastMs, avg: chatStore.ttftStats.avgMs })"
        >
          · {{ t('chat.prefixStable', { percent: (chatStore.prefixStableRate * 100).toFixed(0) }) }}
        </span>
      </div>

      <!-- F16.4 故事时间显示（仅当角色关联故事时显示）；E15：整块可点，一跳回到故事本体 -->
      <button
        v-if="storyTimeText"
        type="button"
        class="chat-story-time"
        v-tip="t('chat.storyTimeTitle')"
        @click="goToStory"
      >
        <Icon name="calendar-check" :size="14" aria-hidden="true" />
        <span>{{ storyTimeText }}</span>
      </button>

      <div class="chat-actions">
        <button
          type="button"
          class="hover-surface panel-toggle-btn"
          :aria-label="t('chat.searchMessages')"
          v-tip="t('chat.searchMessagesTitle')"
          :aria-expanded="searchOpen"
          @click="toggleSearch"
        >
          <Icon name="search" :size="20" />
        </button>
        <button
          type="button"
          class="hover-surface panel-toggle-btn"
          :aria-label="t('chat.exportChat')"
          v-tip="t('chat.exportChatTitle')"
          @click="handleExportChat"
        >
          <Icon name="download" :size="20" />
        </button>
        <button
          type="button"
          class="hover-surface panel-toggle-btn"
          :aria-label="t('chat.togglePanel')"
          :aria-expanded="isCompact ? characterStore.contextDrawerOpen : characterStore.panelExpanded"
          @click="characterStore.togglePanel()"
        >
          <Icon name="panel-right" :size="20" />
        </button>
      </div>
    </header>

    <!-- L 层：依赖就绪状态一眼可见，未就绪时给出原因与一步跳转（取代失败后才提示） -->
    <ContextReadinessBar />

    <!-- 0.5.0：全文搜索栏在顶栏下方展开，结果跨越完整历史消息。 -->
    <div v-if="searchOpen" class="chat-search-bar" role="search">
      <Icon name="search" :size="16" aria-hidden="true" />
      <label class="sr-only" for="chat-history-search">{{ t('chat.searchMessages') }}</label>
      <input
        id="chat-history-search"
        ref="searchInput"
        v-model="searchQuery"
        class="chat-search-input"
        type="search"
        :placeholder="t('chat.searchPlaceholder')"
        :aria-label="t('chat.searchMessages')"
        :aria-describedby="searchResults.length > 0 ? 'chat-search-status' : undefined"
        @keydown="handleSearchKeydown"
      />
      <span id="chat-search-status" class="chat-search-status" role="status" aria-live="polite">
        <template v-if="searchQuery && searchResults.length > 0">
          {{ t('chat.searchCount', { current: activeSearchIndex >= 0 ? activeSearchIndex + 1 : 0, total: searchResults.length }) }}
        </template>
        <template v-else-if="searchQuery">
          {{ t('chat.searchNoResults') }}
        </template>
      </span>
      <span v-if="activeSearchResult" class="chat-search-snippet" v-tip="activeSearchResult.snippet">
        {{ activeSearchResult.snippet }}
      </span>
      <button
        type="button"
        class="chat-search-btn"
        :aria-label="t('chat.searchPrevious')"
        v-tip="t('chat.searchPrevious')"
        :disabled="searchResults.length === 0"
        @click="navigateSearch(-1)"
      >
        <Icon name="chevron-up" :size="16" />
      </button>
      <button
        type="button"
        class="chat-search-btn"
        :aria-label="t('chat.searchNext')"
        v-tip="t('chat.searchNext')"
        :disabled="searchResults.length === 0"
        @click="navigateSearch(1)"
      >
        <Icon name="chevron-down" :size="16" />
      </button>
      <button
        type="button"
        class="chat-search-btn"
        :aria-label="t('chat.closeSearch')"
        v-tip="t('chat.closeSearch')"
        @click="closeSearch"
      >
        <Icon name="close" :size="16" />
      </button>
    </div>

    <!-- P1 会话级状态条：截至当前的最新状态（纯 computed 派生，零持久化） -->
    <StatusHud v-if="showStatusHud" variant="sticky" :status="latestStatus" />

    <!-- 消息区：role="log" + aria-live 让屏幕阅读器感知新消息；
         生成期间 aria-busy 暂停逐 token 播报（P2-4 读屏节流） -->
    <div
      ref="msgArea"
      class="chat-messages tk-scroll"
      :style="chatBgStyle"
      role="log"
      aria-live="polite"
      :aria-busy="chatStore.isGenerating ? 'true' : 'false'"
      aria-relevant="additions text"
      :aria-label="t('chat.messagesAria')"
      @scroll="handleScroll"
    >
      <!-- F08.2 背景遮罩层（保证文字可读性） -->
      <div class="chat-bg-overlay" :style="chatBgOverlayStyle" aria-hidden="true"></div>
      <div class="chat-messages-content">
        <!-- P2-11 顶部占位(已回收的更早消息高度) -->
        <div
          v-if="topSpacerHeight > 0"
          class="msg-spacer"
          :style="{ height: topSpacerHeight + 'px' }"
          aria-hidden="true"
        ></div>
        <!-- 更早消息按需加载（双向窗口化渲染，避免长对话 DOM 膨胀） -->
        <button
          v-if="hasOlderMessages"
          type="button"
          class="load-older-btn"
          @click="loadOlderMessages"
        >
          {{ t('chat.loadOlder', { count: windowStart }) }}
        </button>
        <!--
          P0-1 渲染性能：v-memo 让历史消息在这些值未变时被 Vue **直接跳过 patch**，
          只有最后一条（流式写入中）的消息参与更新；既有 RENDER_WINDOW 窗口化不动。
        -->
        <MessageBubble
          v-for="msg in visibleMessages"
          :key="msg.id"
          :data-message-id="msg.id"
          :class="{ 'message-search-active': highlightedMessageId === msg.id }"
          v-memo="[msg.content, msg.thinking, msg.reasoningTokens, msg.status, msg.generating, msg.narration, msg.narrationAfter, msg.promptTrace, msg.eventTrace, highlightedMessageId === msg.id]"
          :msg="msg"
          @action="handleMessageAction"
          @longpress="handleMessageLongPress"
          :ref="(el) => cacheMsgHeight(el, msg.id)"
        />
        <!-- P2-11 底部占位(已回收的更晚消息高度) -->
        <div
          v-if="bottomSpacerHeight > 0"
          class="msg-spacer"
          :style="{ height: bottomSpacerHeight + 'px' }"
          aria-hidden="true"
        ></div>
      </div>
      <!-- P2-#6 空对话引导卡（当前角色无消息时显示，替代大面积留白） -->
      <div
        v-if="isChatEmpty"
        class="empty-state"
        role="status"
        aria-live="polite"
      >
        <div class="empty-state-icon" aria-hidden="true">
          <Icon name="chat-circle" :size="46" />
        </div>
        <h2 class="empty-state-title">{{ t('chat.emptyStateTitle', { name: char.name }) }}</h2>
        <p class="empty-state-desc">{{ t('chat.emptyStateDesc') }}</p>
        <div class="empty-state-examples">
          <span class="empty-state-examples-label">{{ t('chat.emptyStateExamples') }}</span>
          <div class="example-chips">
            <button
              v-for="ex in examplePrompts"
              :key="ex.key"
              type="button"
              class="example-chip"
              :disabled="chatStore.isGenerating"
              @click="startWithExample(ex.text)"
            >
              {{ ex.text }}
            </button>
          </div>
        </div>
      </div>
      <!-- P2-11 Phase4: 回到底部浮动按钮(上滚查看历史后一键回最新) -->
      <button
        v-if="!atBottom"
        type="button"
        class="jump-bottom-btn"
        :aria-label="t('chat.jumpToBottomAria')"
        @click="jumpToBottom"
      >
        <Icon name="arrow-down" :size="14" aria-hidden="true" />
      </button>
    </div>

    <!-- 输入区（I-14：上下文面板打开时 inert，避免焦点逃逸；顶栏 toggle 不受影响） -->
    <footer class="chat-footer" :inert="props.inert ? true : undefined">
      <!-- F11.3 Quick Reply 按钮组 -->
      <div
        v-if="quickReplyGroups.length > 0"
        class="quick-reply-bar"
        role="toolbar"
        :aria-label="t('chat.quickReplyAria')"
      >
        <div
          v-for="group in quickReplyGroups"
          :key="group.name || 'default'"
          class="qr-group"
        >
          <span v-if="group.name" class="qr-group-label">{{ group.name }}</span>
          <div class="qr-buttons">
            <button
              v-for="btn in group.buttons"
              :key="btn.id"
              type="button"
              class="qr-btn"
              :disabled="chatStore.isGenerating"
              v-tip="btn.script"
              @click="handleQuickReply(btn)"
            >
              {{ btn.label }}
            </button>
          </div>
        </div>
      </div>
      <div class="chat-composer">
        <label class="chat-input-label" for="chat-input">{{ t('chat.inputLabel') }}</label>
        <textarea
          id="chat-input"
          ref="textarea"
          class="chat-input"
          :placeholder="t(isCoarsePointer ? 'chat.inputPlaceholderTouch' : 'chat.inputPlaceholder')"
          rows="1"
          aria-describedby="chat-input-hint"
          @input="adjustHeight"
          @keydown="handleKeydown"
        />
        <span id="chat-input-hint" class="sr-only">{{ t(isCoarsePointer ? 'chat.inputHintTouch' : 'chat.inputHint') }}</span>
        <div class="composer-toolbar">
          <button
            type="button"
            class="send-btn-primary"
            :aria-label="chatStore.isGenerating ? t('chat.stopGenerating') : t('chat.sendMessage')"
            @click="chatStore.isGenerating ? handleStop() : handleSend()"
          >
            <Icon :name="chatStore.isGenerating ? 'stop' : 'send'" :size="chatStore.isGenerating ? 14 : 16" />
          </button>
        </div>
      </div>
    </footer>

    <!-- 长按消息唤起的动作条（触屏没有 hover，这是那排小按钮的替代入口；内部 Teleport 到 body） -->
    <MessageActionSheet
      :open="actionSheetMsgId !== null"
      :actions="sheetActions"
      @action="handleSheetAction"
      @close="closeActionSheet"
    />

    <!-- F12.2/F12.3 Toast 反馈 -->
    <Toast
      v-model="toastOpen"
      :type="toastType"
      :message="toastMessage"
    />

    <!-- 需求9：API 错误诊断 Modal -->
    <ApiErrorModal
      v-model="apiErrorModalOpen"
      :error="chatStore.lastError"
      @go-to-settings="handleApiErrorGoToSettings"
      @retry="handleApiErrorRetry"
      @update:model-value="(v) => { if (!v) handleApiErrorClose(); }"
    />

    <!-- P1-3：消息编辑 Modal（替代原生 prompt） -->
    <Modal
      v-model="deleteConfirmModalOpen"
      :title="t('bubble.deleteConfirmTitle')"
      described-by="msg-delete-desc"
    >
      <p id="msg-delete-desc" class="delete-confirm-body">{{ t('bubble.deleteConfirmBody') }}</p>
      <template #footer>
        <button type="button" class="modal-btn modal-cancel" @click="deleteConfirmModalOpen = false">
          {{ t('common.cancel') }}
        </button>
        <button type="button" class="modal-btn modal-confirm danger" @click="confirmDeleteMessage">
          {{ t('common.delete') }}
        </button>
      </template>
    </Modal>
    <Modal v-model="editModalOpen" :title="t('chat.editMessage')">
      <div class="edit-message-body">
        <textarea
          v-model="editDraft"
          class="edit-message-input"
          rows="6"
          :aria-label="t('chat.editMessage')"
          spellcheck="false"
        ></textarea>
        <p class="edit-message-hint">{{ t('chat.editNarrationHint') }}</p>
        <p class="edit-preview-label">{{ t('chat.editPreviewLabel') }}</p>
        <div class="edit-message-preview">
          <template v-for="(seg, i) in editSegments" :key="i">
            <p v-if="seg.kind === 'psy'" class="edit-preview-psy">{{ seg.text }}</p>
            <p v-else class="edit-preview-say">{{ seg.text }}</p>
          </template>
        </div>
      </div>
      <template #footer>
        <button type="button" class="modal-btn modal-cancel" @click="editModalOpen = false">
          {{ t('common.cancel') }}
        </button>
        <button type="button" class="modal-btn modal-save" @click="confirmEditMessage">
          {{ t('common.save') }}
        </button>
      </template>
    </Modal>
  </main>
</template>

<style scoped>
/* P1-3：消息编辑 Modal 样式 */
.edit-message-body {
  width: 100%;
  min-width: 0;
}

.edit-message-input {
  width: 100%;
  padding: 10px 12px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--foreground);
  background: var(--video-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  outline: none;
  resize: vertical;
  font-family: var(--font-sans);
  box-sizing: border-box;
}

.edit-message-input:focus-visible {
  border-color: var(--secondary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--secondary) 20%, transparent);
}

/* 编辑弹窗里的标记说明 + 分段预览（与气泡同一套分段函数，样式也同一套口径） */
.edit-message-hint,
.edit-preview-label {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--muted-foreground);
}

.edit-preview-label {
  margin-top: 12px;
}

.edit-message-preview {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--video-bg);
}

.edit-preview-psy {
  margin: 0;
  padding-left: 8px;
  border-left: 2px solid color-mix(in srgb, var(--secondary) 45%, var(--border));
  font-size: 13px;
  font-style: italic;
  line-height: 1.7;
  color: var(--muted-foreground);
}

.edit-preview-say {
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
  color: var(--foreground);
}

.modal-cancel,
.modal-save {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 14px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  font-size: 13px;
  cursor: pointer;
}

.modal-cancel {
  background: var(--card-elevated);
  color: var(--foreground);
}

.modal-save {
  background: var(--primary);
  border-color: var(--primary);
  color: var(--on-primary);
}

/* F08.2 背景遮罩层（覆盖在背景图上，保证文字可读性） */
.chat-bg-overlay {
  position: absolute;
  inset: 0;
  background: var(--background);
  pointer-events: none;
  z-index: 0;
}

/* F08.2 消息内容层（在遮罩之上，保证可滚动） */
.chat-messages-content {
  position: relative;
  z-index: 1;
}

/* P2-11 双向窗口占位(纯占位, 不参与交互与背景绘制) */
.msg-spacer {
  width: 100%;
  pointer-events: none;
}

/* P2-11 Phase4: 回到底部浮动按钮(视口不在底部时显示, 绝对定位于滚动容器底部) */
.jump-bottom-btn {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  bottom: 12px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--border);
  background: var(--card-elevated);
  color: var(--foreground);
  cursor: pointer;
  box-shadow: var(--shadow-popup);
  transition: opacity 0.15s ease;
}

@media (hover: hover) and (pointer: fine) {
  .jump-bottom-btn:hover {
    background: color-mix(in srgb, var(--primary) 14%, var(--card-elevated));
    color: var(--primary-fg);
  }
}

.jump-bottom-btn:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
}

/* F08.2 气泡样式覆盖（通过 CSS 变量控制圆角和透明度） */
:deep(.msg-bubble) {
  border-radius: var(--bubble-radius, var(--radius-md));
  opacity: var(--bubble-opacity, 1);
}

.mobile-menu-btn {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  background: none;
  border: none;
  color: var(--muted-foreground);
  cursor: pointer;
  align-items: center;
  justify-content: center;
}

/* 视觉隐藏的 label（屏幕阅读器可见） */
.chat-input-label {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.chat-name {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: var(--font-size-lg);
  color: var(--foreground);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.model-badge {
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--secondary) 12%, transparent);
  /* 文字向 foreground 提亮，保证 on 彩色浅底 ≥4.5:1（theatre 粉色系 12% 底 4.38:1 → 提亮后达标） */
  color: var(--secondary-text);
  font-size: var(--font-size-2xs);
  font-weight: 500;
  white-space: nowrap;
  flex-shrink: 0;
}

.model-badge.not-configured {
  background: color-mix(in srgb, var(--destructive) 12%, transparent);
  color: color-mix(in srgb, var(--destructive) 78%, var(--foreground));
}

/* 前缀缓存命中率徽标 */
.cache-rate {
  font-size: var(--font-size-2xs);
  color: var(--green, #9ece6a);
  cursor: help;
}

/* 本地前缀稳定率徽标(供应商未返回缓存字段时的代理指标) */
.cache-rate.local {
  color: var(--cyan, #7dcfff);
}

.panel-toggle-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  color: var(--muted-foreground);
  cursor: pointer;
  background: none;
  border: none;
}

/* 0.5.0：历史消息全文搜索工具条 */
.chat-search-bar {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  min-height: 44px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--card);
  color: var(--muted-foreground);
}

.chat-search-input {
  flex: 1 1 180px;
  min-width: 0;
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--video-bg);
  color: var(--foreground);
  font: inherit;
  font-size: 13px;
}

.chat-search-input:focus-visible {
  border-color: var(--ring);
  outline: 2px solid color-mix(in srgb, var(--ring) 30%, transparent);
  outline-offset: 1px;
}

.chat-search-status {
  flex: 0 0 auto;
  min-width: 56px;
  color: var(--muted-foreground);
  font-size: 12px;
  white-space: nowrap;
}

.chat-search-snippet {
  flex: 0 1 min(32vw, 280px);
  overflow: hidden;
  color: var(--muted-foreground);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-search-btn {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--muted-foreground);
  cursor: pointer;
}

.chat-search-btn:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

@media (hover: hover) and (pointer: fine) {
  .chat-search-btn:hover:not(:disabled) {
    border-color: var(--ring);
    color: var(--foreground);
  }
}

.chat-search-btn:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 1px;
}

/* 搜索跳转后的轻量定位提示，不改变消息尺寸，避免虚拟化滚动跳动。 */
:deep(.message-search-active .msg-bubble) {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary) 65%, transparent);
}

@media (max-width: 640px) {
  .chat-search-bar {
    flex-wrap: wrap;
  }

  .chat-search-input {
    flex-basis: 130px;
    font-size: 16px;
  }

  .chat-search-snippet {
    display: none;
  }
}

/* F11.3 Quick Reply 按钮组 */
.quick-reply-bar {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-sm);
  padding: 6px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--card);
}

.qr-group {
  display: flex;
  align-items: center;
  gap: 4px;
}

.qr-group-label {
  font-size: 11px;
  color: var(--muted-foreground);
  white-space: nowrap;
  margin-right: 2px;
}

.qr-buttons {
  display: flex;
  gap: 4px;
}

.qr-btn {
  padding: 4px 10px;
  font-size: 13px;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--secondary) 10%, transparent);
  color: var(--foreground);
  border: 1px solid color-mix(in srgb, var(--secondary) 20%, transparent);
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  white-space: nowrap;
}

@media (hover: hover) and (pointer: fine) {
  .qr-btn:hover:not(:disabled) {
    background: color-mix(in srgb, var(--secondary) 18%, transparent);
    border-color: color-mix(in srgb, var(--secondary) 35%, transparent);
  }
}

.qr-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.qr-btn:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 1px;
}

/* F16.4 故事时间显示 */
.chat-story-time {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border: none;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--accent-blue) 12%, transparent);
  color: var(--accent-blue);
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
}

/* P1-9 窗口化：加载更早消息按钮 */
.load-older-btn {
  display: block;
  margin: 8px auto;
  padding: 6px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-secondary);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
}
@media (hover: hover) and (pointer: fine) {
  .load-older-btn:hover {
    border-color: var(--ring);
    color: var(--text-primary);
  }
}
.load-older-btn:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
}

/* P2-#6 空对话引导卡（覆盖整个消息区，居中展示） */
.empty-state {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: var(--spacing-lg);
  text-align: center;
}

.empty-state-icon {
  display: flex;
  color: var(--muted-foreground);
  opacity: 0.7;
}

.empty-state-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 600;
  color: var(--foreground);
}

.empty-state-desc {
  margin: 0;
  max-width: 420px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--muted-foreground);
}

.empty-state-examples {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  margin-top: 6px;
}

.empty-state-examples-label {
  font-size: 12px;
  color: var(--muted-foreground);
}

.example-chips {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--spacing-sm);
  max-width: 540px;
}

.example-chip {
  padding: 8px 14px;
  font-size: 13px;
  line-height: 1.4;
  border-radius: var(--radius-pill);
  background: var(--card);
  color: var(--foreground);
  border: 1px solid var(--border);
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, transform 0.1s;
}

@media (hover: hover) and (pointer: fine) {
  .example-chip:hover:not(:disabled) {
    background: color-mix(in srgb, var(--primary) 12%, var(--card));
    border-color: color-mix(in srgb, var(--primary) 30%, transparent);
    color: var(--primary-fg);
  }
}

.example-chip:active:not(:disabled) {
  transform: scale(0.97);
}

.example-chip:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.example-chip:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
}

@media (max-width: 640px) {
  /* iOS 聚焦防放大：可编辑控件字号须 ≥16px（I-7 / D1） */
  .edit-message-input {
    font-size: 16px;
  }
}

/*
 * 批次 3-2/3-3：页头命中区。
 *
 * 页头横向空间是零和的：390 宽下「菜单 + 右簇三个动作 + 角色名」必须一起放下，
 * 而 A15 的判据是 `.chat-title` ≥200px（名字不许被挤成两三个字）。
 *
 * 分配：
 * - 右簇三个动作给**真 44×44 盒子**——它们是手指的主战场，且三个都是 44 时才
 *   132px，配合收紧后的留白刚好给标题留出 200+。
 * - 菜单键保持视觉 26、命中区用伪元素撑到 46：它贴着左边缘，命中区可以往
 *   padding 里长，不占标题的宽度。这是 B3 的手法，页头是典型密集行。
 * - 页头留白 8→6、簇内间距归零：让出的 14px 全给标题（实测 198 → 202，
 *   判据是 200，只差 2px 也要挤出来）。
 *
 * 46 而不是 44：探针按 1px 步进，正好 44 时边界像素不属于元素，量出来是 43。
 */
@media (max-width: 640px) {
  .chat-header {
    padding: 0 6px;
    gap: 6px;
  }
  .chat-actions {
    /* 归零而不是 2px：2px 时标题只剩 198，差 2px 过不了 A15 的 ≥200。
       按钮本身 44 宽、图标 20，视觉上仍有 12px 空隙，不挤。 */
    gap: 0;
  }
  .panel-toggle-btn {
    min-width: var(--touch-min);
    min-height: var(--touch-min);
  }
  .mobile-menu-btn {
    position: relative;
  }
  .mobile-menu-btn::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    width: calc(var(--touch-min) + 2px);
    height: calc(var(--touch-min) + 2px);
    transform: translate(-50%, -50%);
  }
}
</style>
