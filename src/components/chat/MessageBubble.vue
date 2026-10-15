<script setup lang="ts">
import type { UIMessage } from '@/types';
import Icon from '@/components/common/Icon.vue';
import { assistantMsgActions } from './message-actions';
import { parseNarrationSegments } from '@/core/narration';
import ThinkingBlock from './ThinkingBlock.vue';
import StatusHud from './StatusHud.vue';
import PromptTraceSummary from './PromptTraceSummary.vue';
import EventTraceSummary from './EventTraceSummary.vue';
import { useSettingsStore } from '@/stores/settings';
import { computed, getCurrentInstance, onBeforeUnmount } from 'vue';
import { t } from '@/i18n';

const props = defineProps<{
  msg: UIMessage;
}>();

/**
 * P0-1：思考块默认折叠与否来自全局偏好
 * （settings.thinkingConfig.defaultCollapsed，缺省 true = 折叠）
 *
 * 兼容"未安装 Pinia"的挂载场景（部分单测直接 mount 组件）：
 * 直接调 useSettingsStore() 会抛 getActivePinia()，故先探测应用是否装了 Pinia
 * （app.config.globalProperties.$pinia 由 app.use(pinia) 注入），
 * 未安装则回落到"默认折叠"常量——这样既能读到偏好，又不会污染渲染路径。
 */
function tryUseSettingsStore(): ReturnType<typeof useSettingsStore> | null {
  const vm = getCurrentInstance();
  const piniaInstalled = Boolean(vm?.appContext.config.globalProperties.$pinia);
  return piniaInstalled ? useSettingsStore() : null;
}

const settingsStore = tryUseSettingsStore();

const defaultCollapsed = computed(
  () => settingsStore?.thinkingConfig?.defaultCollapsed !== false
);

/**
 * P1：消息级状态条开关（默认开）
 *
 * 与顶部 sticky 条是两个独立开关：sticky 说"当前状态"，inline 说"这一轮的状态"。
 * 未安装 Pinia 的挂载场景（单测直接 mount）下 settingsStore 为 null → 默认开，
 * 但 msg.status 缺省时不渲染，故不会凭空冒出空条。
 */
const showInlineStatus = computed(
  () => settingsStore?.statusHudConfig?.showInline !== false
);

const emit = defineEmits<{
  action: [msgId: string, action: string];
  longpress: [msgId: string];
}>();

const assistantActions = assistantMsgActions();

/**
 * 一次回复的分段：对白在气泡里，心理（`⟦…⟧`）落在气泡外。
 * 模型没写标记时这里就是一段 speech，渲染结果与改造前完全一致。
 *
 * 保底补一个空对白段：整条只有旁白（模型没写任何话）时，思维链和操作条这些
 * "挂在气泡上沿"的附属物需要有个锚点，否则它们会漂到分组上盖住第一行内容。
 */
const segments = computed(() => {
  const parsed = parseNarrationSegments(props.msg.content);
  return parsed.some((s) => s.kind === 'speech')
    ? parsed
    : [{ kind: 'speech' as const, text: '' }, ...parsed];
});

/** 思维链与操作条锚在**第一个**气泡上沿（与拆分前的几何完全一致） */
const firstSpeechIndex = computed(() =>
  segments.value.findIndex((s) => s.kind === 'speech')
);

/**
 * 长按唤起动作条（触屏无 hover，操作入口不能常驻在气泡头顶）。
 *
 * 用 Pointer Events 而不是 Touch Events：浏览器一旦把手势判成滚动，会直接发
 * pointercancel，比我们自己逐帧数位移可靠；而 touchmove 的 `touches` 列表在
 * 部分派发路径下是空的（e2e 里实测到"移动了却不取消"），pointermove 没这个坑。
 * 位移阈值仍保留，作为 pointercancel 不来时的兜底。
 *
 * 只认 touch：桌面有 hover 工具条，不该因为按住鼠标 0.5 秒弹一个底部面板。
 * 另外只有 AI 消息有动作可给（用户气泡至今没有任何操作入口，见 OPT_PLAN §5.5）。
 */
const LONG_PRESS_MS = 500;
const MOVE_TOLERANCE_PX = 10;
let pressTimer: ReturnType<typeof setTimeout> | null = null;
let pressX = 0;
let pressY = 0;

function cancelLongPress() {
  if (pressTimer !== null) {
    clearTimeout(pressTimer);
    pressTimer = null;
  }
}

function onWrapPointerDown(e: PointerEvent) {
  cancelLongPress();
  if (e.pointerType !== 'touch' || props.msg.role !== 'assistant') return;
  pressX = e.clientX;
  pressY = e.clientY;
  pressTimer = setTimeout(() => {
    pressTimer = null;
    emit('longpress', props.msg.id);
  }, LONG_PRESS_MS);
}

function onWrapPointerMove(e: PointerEvent) {
  if (pressTimer === null || e.pointerType !== 'touch') return;
  if (
    Math.abs(e.clientX - pressX) > MOVE_TOLERANCE_PX ||
    Math.abs(e.clientY - pressY) > MOVE_TOLERANCE_PX
  ) {
    cancelLongPress();
  }
}

onBeforeUnmount(cancelLongPress);
</script>

<template>
  <div
    class="msg-wrap msg-enter"
    :class="msg.role === 'user' ? 'msg-wrap-user' : 'msg-wrap-assistant'"
    role="article"
    :aria-label="msg.role === 'user' ? t('bubble.userMsg') : t('bubble.assistantMsg')"
    tabindex="-1"
    :aria-haspopup="msg.role === 'assistant' ? 'menu' : undefined"
    @pointerdown="onWrapPointerDown"
    @pointermove="onWrapPointerMove"
    @pointerup="cancelLongPress"
    @pointercancel="cancelLongPress"
  >
    <!-- 用户消息 -->
    <div v-if="msg.role === 'user'" class="msg-bubble msg-user">
      <em v-if="msg.narration" class="msg-narration">{{ msg.narration }}</em>
      <p class="msg-text">{{ msg.content }}</p>
    </div>

    <!-- AI 消息：一次回复可能是「对白 — 心理 — 对白」，心理段必须落在气泡外面，
         所以这里是一个纵向分组，里面按分段各开各的气泡，而不是一个气泡装下全部。 -->
    <div v-else class="msg-turn">
      <!-- 旧旁白字段（当前只有 mock 数据写它）与新解析出的分段共用一种样式 -->
      <p v-if="msg.narration" class="msg-psy">{{ msg.narration }}</p>
      <template v-for="(seg, i) in segments" :key="i">
        <div v-if="seg.kind === 'speech'" class="msg-bubble msg-assistant">
          <!-- P0-1：思维链折叠块 —— 留在**第一个**气泡里（与拆分前同一位置）。
               挪到分组层会让它顶到气泡上沿，正好被悬浮的操作条压住，点击被拦。 -->
          <ThinkingBlock
            v-if="i === firstSpeechIndex"
            :thinking="msg.thinking"
            :message-id="msg.id"
            :generating="msg.generating === true"
            :default-collapsed="defaultCollapsed"
            :reasoning-tokens="msg.reasoningTokens"
          />
          <p class="msg-text">{{ seg.text }}</p>

          <!-- 消息操作栏：同样锚在第一个气泡的上沿（hover / 键盘聚焦时显现） -->
          <div
            v-if="i === firstSpeechIndex"
            class="msg-toolbar"
            role="toolbar"
            :aria-label="t('bubble.toolbarAria', { actions: assistantActions.map((a) => a.label).join('、') })"
          >
            <button
              v-for="a in assistantActions"
              :key="a.key"
              type="button"
              class="msg-toolbar-btn"
              :class="{ danger: a.danger }"
              :aria-label="a.label"
              @click="emit('action', msg.id, a.key)"
            >
              <Icon :name="a.icon" :size="14" />
            </button>
          </div>
        </div>
        <p v-else class="msg-psy">{{ seg.text }}</p>
      </template>
      <p v-if="msg.narrationAfter" class="msg-psy">{{ msg.narrationAfter }}</p>

      <!-- P1：消息级状态（本轮结束时的状态；仅在 msg.status 存在时渲染）
           小屏折叠开启：消息列表里每轮都可能出现一条，不折叠会把列表撑爆 -->
      <StatusHud
        v-if="showInlineStatus"
        variant="inline"
        collapsible-on-mobile
        :status="msg.status"
      />

      <!-- 生成中指示器：aria-live 让屏幕阅读器感知状态变化 -->
      <div
        v-if="msg.generating"
        class="gen-dot"
        role="status"
        aria-live="polite"
        :aria-label="t('bubble.generating')"
      >
        <span class="dot" aria-hidden="true" />
        <span class="gen-text">{{ t('bubble.generatingText') }}</span>
      </div>

      <!-- L 层：本轮注入了哪几条设定（可跳回来源世界书）；无注入痕迹时不渲染 -->
      <PromptTraceSummary :items="msg.promptTrace" />
      <!-- E11：本轮带入了哪几条随机事件（可跳随机事件页）；无事件时不渲染 -->
      <EventTraceSummary :items="msg.eventTrace" />
    </div>
  </div>
</template>

<style scoped>
.msg-wrap-user {
  align-self: flex-end;
  margin-top: var(--spacing-sm);
}

.msg-wrap-assistant {
  align-self: flex-start;
}

/* 一次 AI 回复的纵向分组：思维链 → 对白/心理交替 → 状态 → 操作条 → 注入痕迹 */
.msg-turn {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-1-5);
}

/* 心理段：无底色、无气泡内边距，左竖线与气泡那条 2px 辅色边同一 x。
   区分度来自"没有底色 + 字号降一档 + 颜色降一档"，不靠斜体（中文斜体读起来像译制片）。
   对比度实测：muted-foreground 压在页面底上 light 5.96:1 / dark 9.28:1，均过 AA。 */
.msg-psy {
  margin: 0;
  max-width: min(70%, 40em);
  padding-left: var(--space-2-5);
  border-left: 2px solid color-mix(in srgb, var(--secondary) 45%, var(--border));
  font-size: var(--font-size-sm);
  line-height: 1.7;
  color: var(--muted-foreground);
  white-space: pre-wrap;
  word-wrap: break-word;
}

/* 窄屏下与气泡同宽（responsive.css 给 .msg-bubble 的是同一组数）；
   640 / 380 都在规范断点集内（breakpoint-guard 允许集） */
@media (max-width: 640px) {
  .msg-psy {
    max-width: min(88%, 40em);
  }
}

@media (max-width: 380px) {
  .msg-psy {
    max-width: min(92%, 40em);
  }
}

.msg-bubble {
  max-width: min(70%, 40em);
  width: fit-content;
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4);
  font-size: var(--font-size-md);
  line-height: 1.7;
  word-wrap: break-word;
  white-space: pre-wrap;
  position: relative;
}

.msg-assistant {
  background: color-mix(in srgb, var(--secondary) 5%, transparent);
  border-left: 2px solid var(--secondary);
  color: var(--foreground);
}

.msg-user {
  background: color-mix(in srgb, var(--primary) 8%, transparent);
  color: var(--foreground);
}

.msg-text {
  margin: 0;
}

.msg-narration,
.msg-narration-after {
  font-style: italic;
  color: var(--muted-foreground);
  display: block;
}

.msg-narration {
  margin-bottom: 6px;
}

.msg-narration-after {
  margin-top: 6px;
}

.gen-dot {
  display: flex;
  align-items: center;
  gap: var(--space-1-5);
  margin-top: var(--space-2-5);
}

.gen-dot .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--secondary);
  animation: pulse-dot 1.2s ease-in-out infinite;
}

.gen-text {
  color: var(--secondary-text);
  font-size: var(--font-size-xs);
}

.msg-toolbar {
  position: absolute;
  top: -13px;
  right: 6px;
  display: flex;
  align-items: center;
  gap: 1px;
  padding: 3px;
  border-radius: var(--radius-sm);
  background: var(--card-elevated);
  border: 1px solid var(--border);
  opacity: 0;
  /* 只靠 opacity:0 隐藏时这排按钮依然可被点中——气泡上方 top:-13px 那条看不见的带子
     会吃掉本该落在消息上的点击。改成"隐藏即不可点，显现才恢复命中"。 */
  pointer-events: none;
  transition: opacity 0.15s ease;
}

/* I-5（P2-5）：hover 分支按设备能力分流，避免触屏 tap 后操作栏粘滞 */
@media (hover: hover) and (pointer: fine) {
  .msg-wrap:hover .msg-toolbar {
    opacity: 1;
    pointer-events: auto;
  }
}

/* 键盘聚焦分支不加 hover 守卫：触屏外接键盘时同样需要可见 */
.msg-wrap:focus-within .msg-toolbar {
  opacity: 1;
  pointer-events: auto;
}

/* 触屏：操作入口改成长按唤起的动作条（MessageActionSheet），不再常显在气泡头顶。
   同时禁掉气泡文本的长按选词——Android 的系统选词菜单会和我们抢这一次长按；
   取全文仍走动作条里的「复制」。代价：手机上不能只选其中几个字。 */
@media (hover: none) {
  .msg-bubble {
    -webkit-user-select: none;
    user-select: none;
  }
}

/* D-2（REAL_DEVICE_TEST_2026-10-03）：助手气泡左对齐，操作条原右锚定会让
   窄气泡的操作条左溢出对话列边界、被角色列表列盖住无法点击（1280×720 实测）。
   助手消息的操作条锚左侧、向右展开——右侧是对话列开阔区，不会被遮挡。 */
.msg-wrap-assistant .msg-toolbar {
  left: 6px;
  right: auto;
}

.msg-toolbar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: var(--radius-xs);
  color: var(--muted-foreground);
  cursor: pointer;
  background: none;
  border: none;
  transition: color 0.15s ease;
}

@media (hover: hover) and (pointer: fine) {
  .msg-toolbar-btn:hover {
    color: var(--foreground);
  }
}

.msg-toolbar-btn:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 1px;
}

@media (hover: hover) and (pointer: fine) {
  .msg-toolbar-btn.danger:hover {
    color: var(--primary-fg);
  }
}
</style>
