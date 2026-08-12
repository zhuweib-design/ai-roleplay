<script setup lang="ts">
/**
 * Modal 模态对话框组件
 *
 * 无障碍特性：
 * - role="dialog" aria-modal="true"
 * - 打开时焦点陷阱（Tab/Shift+Tab 在对话框内循环）
 * - ESC 关闭
 * - 打开时焦点移到首个可交互元素
 * - 关闭时焦点恢复到打开前焦点
 * - 点击遮罩关闭（可配置）
 */
import { ref, watch, nextTick, onBeforeUnmount, useTemplateRef, useId } from 'vue';

const props = withDefaults(
  defineProps<{
    /** 是否显示 */
    modelValue: boolean;
    /** 标题 */
    title?: string;
    /** 是否可关闭（点击遮罩 / ESC） */
    dismissible?: boolean;
    /** aria-label（无 title 时使用） */
    ariaLabel?: string;
  }>(),
  {
    dismissible: true,
  }
);

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  close: [];
}>();

const dialogRef = useTemplateRef<HTMLElement>('dialogRef');
const previouslyFocused = ref<HTMLElement | null>(null);

// 唯一 id（用于 aria-labelledby 关联标题，避免多 Modal 冲突）
const instanceId = useId();

function close() {
  if (!props.dismissible) return;
  emit('update:modelValue', false);
  emit('close');
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.dismissible) {
    e.preventDefault();
    close();
    return;
  }
  if (e.key === 'Tab' && dialogRef.value) {
    // 焦点陷阱：在对话框可聚焦元素间循环
    const focusable = dialogRef.value.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first || !dialogRef.value.contains(document.activeElement)) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }
}

watch(
  () => props.modelValue,
  async (visible) => {
    if (visible) {
      previouslyFocused.value = document.activeElement as HTMLElement;
      // 锁定 body 滚动
      document.body.style.overflow = 'hidden';
      await nextTick();
      // 焦点移到对话框首个可聚焦元素
      if (dialogRef.value) {
        const focusable = dialogRef.value.querySelector<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        focusable?.focus();
      }
      window.addEventListener('keydown', handleKeydown);
    } else {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeydown);
      // 恢复焦点
      previouslyFocused.value?.focus();
    }
  }
);

onBeforeUnmount(() => {
  document.body.style.overflow = '';
  window.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="modelValue"
        class="modal-overlay"
        @click.self="close"
      >
        <div
          ref="dialogRef"
          class="modal-dialog"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="title ? 'modal-title-' + instanceId : undefined"
          :aria-label="!title ? ariaLabel : undefined"
        >
          <header v-if="title" class="modal-header">
            <h2 :id="'modal-title-' + instanceId" class="modal-title">{{ title }}</h2>
            <button
              v-if="dismissible"
              type="button"
              class="modal-close"
              aria-label="关闭对话框"
              @click="close"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </header>
          <div class="modal-body">
            <slot />
          </div>
          <footer v-if="$slots.footer" class="modal-footer">
            <slot name="footer" />
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 16px;
}

.modal-dialog {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  width: 100%;
  max-width: 480px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}

.modal-title {
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 600;
  color: var(--foreground);
  margin: 0;
}

.modal-close {
  background: none;
  border: none;
  color: var(--muted-foreground);
  cursor: pointer;
  padding: 4px;
  border-radius: var(--radius-sm);
  display: inline-flex;
  transition: color .15s ease, background-color .15s ease;
}

.modal-close:hover {
  color: var(--foreground);
  background: color-mix(in srgb, var(--foreground) 8%, transparent);
}

.modal-close:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 2px;
}

.modal-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
  color: var(--foreground);
  font-size: 14px;
  line-height: 1.6;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid var(--border);
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity .2s ease;
}

.modal-enter-active .modal-dialog,
.modal-leave-active .modal-dialog {
  transition: transform .2s ease, opacity .2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal-dialog,
.modal-leave-to .modal-dialog {
  transform: translateY(-20px) scale(0.96);
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .modal-enter-active,
  .modal-leave-active,
  .modal-enter-active .modal-dialog,
  .modal-leave-active .modal-dialog {
    transition: none;
  }
}

@media (max-width: 767px) {
  .modal-dialog {
    max-width: calc(100% - 32px);
  }
}
</style>
