<script setup lang="ts">
/**
 * Toast 通知组件
 *
 * 无障碍特性：
 * - role="status"（信息）/ role="alert"（错误）
 * - aria-live="polite"（信息）/ aria-live="assertive"（错误）
 * - 自动消失（5s）+ 手动关闭
 */
import { watch, onBeforeUnmount } from 'vue';
import { t } from '@/i18n';

const props = withDefaults(
  defineProps<{
    /** 是否显示 */
    modelValue: boolean;
    /** 类型 */
    type?: 'info' | 'success' | 'error';
    /** 文本 */
    message?: string;
    /** 自动消失毫秒（0 不消失） */
    duration?: number;
  }>(),
  {
    type: 'info',
    duration: 5000,
  }
);

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
}>();

let timer: number | null = null;

function startTimer() {
  if (timer) clearTimeout(timer);
  if (props.duration > 0 && props.modelValue) {
    timer = window.setTimeout(() => {
      emit('update:modelValue', false);
    }, props.duration);
  }
}

function clearTimer() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

function close() {
  emit('update:modelValue', false);
}

watch(
  () => props.modelValue,
  (visible) => {
    if (visible) {
      startTimer();
    } else {
      clearTimer();
    }
  }
);

watch(
  () => props.message,
  () => {
    if (props.modelValue) {
      startTimer();
    }
  }
);

onBeforeUnmount(() => clearTimer());
</script>

<template>
  <Teleport to="body">
    <Transition name="toast">
      <div
        v-if="modelValue && message"
        class="toast"
        :class="`toast-${type}`"
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
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.toast {
  position: fixed;
  top: 24px;
  right: 24px;
  z-index: 200;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: var(--card-elevated);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  color: var(--foreground);
  font-size: 14px;
  max-width: 380px;
  min-width: 280px;
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
  padding: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  opacity: 0.7;
  transition: opacity .15s ease, background-color .15s ease;
}

.toast-close:hover {
  opacity: 1;
  background: color-mix(in srgb, currentColor 8%, transparent);
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

@media (max-width: 767px) {
  .toast {
    top: 12px;
    right: 12px;
    left: 12px;
    max-width: none;
    min-width: 0;
  }
}
</style>
