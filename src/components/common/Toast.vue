<script setup lang="ts">
/**
 * Toast 通知组件
 *
 * 无障碍特性：
 * - role="status"（信息）/ role="alert"（错误）
 * - aria-live="polite"（信息）/ aria-live="assertive"（错误）
 * - 按类型自动消失（信息/成功 3s、错误 5s）+ 手动关闭
 * - 底部倒计时条把"它会自己关"显示出来（WCAG 2.2.1 Timing Adjustable）
 * - 指针悬停、键盘焦点进入、页面隐藏时暂停计时，移开后继续剩余时间
 */
import { computed, onBeforeUnmount, onMounted, onUnmounted, ref, watch } from 'vue';
import { t } from '@/i18n';
import { TOAST_DURATIONS, type ToastType } from '@/utils/toast-service';

const props = withDefaults(
  defineProps<{
    /** 是否显示 */
    modelValue: boolean;
    /** 类型 */
    type?: ToastType;
    /** 文本 */
    message?: string;
    /** 自动消失毫秒；不传则按类型取 TOAST_DURATIONS，0 表示常驻 */
    duration?: number;
  }>(),
  {
    type: 'info',
  }
);

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
}>();

/** 生效时长：显式传入优先，否则按类型 */
const autoCloseMs = computed(() => props.duration ?? TOAST_DURATIONS[props.type ?? 'info']);
const countdownShown = computed(() => props.modelValue && autoCloseMs.value > 0);
/** 剩余比例，驱动倒计时条宽度（scaleX，避免逐帧改 layout） */
const ratio = ref(1);

let budgetMs = 0;
let anchorMs = 0;
let rafId = 0;
/** 暂停原因集合：悬停/焦点/后台可能同时成立，全部解除才继续计时 */
const holds = new Set<string>();

function stopRaf(): void {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
}

function frame(now: number): void {
  if (!props.modelValue) {
    stopRaf();
    return;
  }
  const left = budgetMs - (now - anchorMs);
  ratio.value = autoCloseMs.value > 0 ? Math.max(0, left / autoCloseMs.value) : 1;
  if (left <= 0) {
    stopRaf();
    close();
    return;
  }
  rafId = requestAnimationFrame(frame);
}

function begin(): void {
  stopRaf();
  holds.clear();
  ratio.value = 1;
  budgetMs = autoCloseMs.value;
  if (!props.modelValue || budgetMs <= 0) return;
  anchorMs = performance.now();
  rafId = requestAnimationFrame(frame);
}

function hold(reason: string): void {
  if (budgetMs <= 0) return;
  holds.add(reason);
  if (holds.size > 1) return;
  budgetMs = Math.max(0, budgetMs - (performance.now() - anchorMs));
  stopRaf();
}

function unhold(reason: string): void {
  if (!holds.delete(reason)) return;
  if (holds.size > 0 || budgetMs <= 0 || !props.modelValue) return;
  anchorMs = performance.now();
  rafId = requestAnimationFrame(frame);
}

function onVisibilityChange(): void {
  if (document.hidden) hold('hidden');
  else unhold('hidden');
}

function close() {
  stopRaf();
  emit('update:modelValue', false);
}

// immediate：挂载时 modelValue 已经是 true 的用法也要计时（原实现只监听变化，
// 这种挂载方式下永远不启动计时器，看着就是"提示不会自己关"）
watch(
  () => props.modelValue,
  (visible) => {
    if (visible) begin();
    else stopRaf();
  },
  { immediate: true }
);

// 换文案视作一次新的提示，重新计时
watch(
  () => props.message,
  () => {
    if (props.modelValue) begin();
  }
);

onMounted(() => document.addEventListener('visibilitychange', onVisibilityChange));
onUnmounted(() => document.removeEventListener('visibilitychange', onVisibilityChange));
onBeforeUnmount(() => stopRaf());
</script>

<template>
  <Teleport to="body">
    <Transition name="toast">
      <div
        v-if="modelValue && message"
        class="toast"
        :class="`toast-${type}`"
        @mouseenter="hold('pointer')"
        @mouseleave="unhold('pointer')"
        @focusin="hold('focus')"
        @focusout="unhold('focus')"
      >
        <span class="toast-icon" aria-hidden="true">
          <svg v-if="type === 'error'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <svg v-else-if="type === 'success'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
        </span>
        <!-- P2-4：live region 移到消息 span，关闭按钮移出 live 区域（读屏行为可靠） -->
        <span
          class="toast-message"
          :role="type === 'error' ? 'alert' : 'status'"
          :aria-live="type === 'error' ? 'assertive' : 'polite'"
        >{{ message }}</span>
        <button
          type="button"
          class="toast-close"
          :aria-label="t('toast.close')"
          @click="close"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        <!-- 倒计时条：纯装饰性状态显示，读屏不播 -->
        <span
          v-if="countdownShown"
          class="toast-countdown"
          data-toast-countdown
          :style="{ transform: `scaleX(${ratio.toFixed(4)})` }"
          aria-hidden="true"
        />
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.toast {
  position: fixed;
  top: var(--spacing-lg);
  right: var(--spacing-lg);
  z-index: var(--z-toast);
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px var(--spacing-md);
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: var(--card-elevated);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  color: var(--foreground);
  font-size: 14px;
  max-width: 380px;
  min-width: 280px;
  overflow: hidden;
}

/* 倒计时条：随剩余时间收窄，让用户知道它会自己关；悬停时冻结 */
.toast-countdown {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 3px;
  background: currentColor;
  opacity: 0.55;
  transform-origin: left center;
}

.toast-error {
  border-color: var(--destructive);
  background: var(--error-bg);
  color: var(--error-fg);
}

.toast-success {
  border-color: var(--success);
  background: var(--success-bg);
  color: var(--success-fg);
}

.toast-info {
  border-color: var(--secondary);
}

.toast-icon {
  display: inline-flex;
  flex-shrink: 0;
}

.toast-message {
  flex: 1;
  line-height: 1.4;
}

.toast-close {
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  padding: var(--spacing-xs);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  opacity: 0.7;
  transition: opacity .15s ease, background-color .15s ease;
}

@media (hover: hover) and (pointer: fine) {
  .toast-close:hover {
    opacity: 1;
    background: color-mix(in srgb, currentColor 8%, transparent);
  }
}

.toast-close:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 2px;
  opacity: 1;
}

.toast-enter-active,
.toast-leave-active {
  transition: transform .25s ease, opacity .25s ease;
}

.toast-enter-from,
.toast-leave-to {
  transform: translateX(20px);
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .toast-enter-active,
  .toast-leave-active {
    transition: none;
  }
}

@media (max-width: 640px) {
  .toast {
    /* 批次 0-3：原 `top: 12px` 与 56px 的页头重叠 44px，正压住角色名与「对话/群聊」分段控件。
       改为贴底部导航上方——手机上拇指够得着的是下半屏，顶部是最贵的地方（角色名与模式）。
       `z-index` 不动：`--z-toast` 已是全站最高（rail 30 < mask 60 < drawer 70 < modal 100 < toast 200），
       问题从来是**位置**不是层级，去动 z 是白费。
       注：`--mobile-nav-h` 是 56px 而实测导航高 53px（差 3px），偏大一点点更安全。 */
    top: auto;
    bottom: calc(var(--mobile-nav-h, 56px) + env(safe-area-inset-bottom, 0px) + 12px);
    right: 12px;
    left: 12px;
    max-width: none;
    min-width: 0;
  }
}
</style>
