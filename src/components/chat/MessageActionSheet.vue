<script setup lang="ts">
/**
 * MessageActionSheet — 长按 AI 消息后从底部弹出的动作条（触屏替代 hover 工具条）
 *
 * 为什么不是把那一排小按钮改成常显：手机上每条气泡头顶挂 6 个 24px 图标，
 * 既是视觉噪音，也够不着（命中区远小于 44px）。动作清单与桌面共用
 * `message-actions.ts` 那一份，这里只换承载方式。
 *
 * 焦点：打开后落到第一项，Esc / 点遮罩关闭；关闭后由父级把焦点交还那条消息。
 * 系统返回：动作条开着时按安卓返回键只关它，不会退出对话页（`useBackLayer`，批次 2-3）。
 */
import { nextTick, ref, watch } from 'vue';
import Icon from '@/components/common/Icon.vue';
import { useBackLayer } from '@/composables/useBackLayer';
import type { MsgAction } from './message-actions';
import { t } from '@/i18n';

const props = defineProps<{
  open: boolean;
  actions: MsgAction[];
}>();

const emit = defineEmits<{
  action: [key: string];
  close: [];
}>();

const panel = ref<HTMLUListElement | null>(null);

// 动作条也是一层：返回键先关它（批次 2-3）
useBackLayer({ isOpen: () => props.open, onBack: () => emit('close') });

/**
 * 抬手时浏览器会在触点补发一次 click（幽灵点击）。长按刚弹出的动作条正好盖在
 * 那个点上 ⇒ 同一次手势自己把它关掉，表现是"长按没反应"。
 * 只挡遮罩这一处、只挡开屏后的一小段，不劫持全局 click。
 */
const GHOST_CLICK_MS = 400;
let openedAt = 0;

function onMaskClick() {
  if (Date.now() - openedAt < GHOST_CLICK_MS) return;
  emit('close');
}

watch(
  () => props.open,
  async (isOpen) => {
    if (!isOpen) return;
    openedAt = Date.now();
    await nextTick();
    panel.value?.querySelector<HTMLElement>('.sheet-item')?.focus();
  }
);
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="msg-action-root" @keydown.esc.prevent="emit('close')">
      <div class="sheet-mask" @click="onMaskClick" />
      <ul ref="panel" class="sheet-panel" role="dialog" aria-modal="true" :aria-label="t('bubble.sheetAria')">
        <li v-for="a in actions" :key="a.key">
          <button
            type="button"
            class="sheet-item"
            :class="{ danger: a.danger }"
            @click="emit('action', a.key)"
          >
            <Icon :name="a.icon" :size="18" />
            <span>{{ a.label }}</span>
          </button>
        </li>
        <li>
          <button type="button" class="sheet-item sheet-cancel" @click="emit('close')">
            {{ t('common.cancel') }}
          </button>
        </li>
      </ul>
    </div>
  </Teleport>
</template>

<style scoped>
.sheet-mask {
  position: fixed;
  inset: 0;
  background: var(--scrim-mask);
  z-index: var(--z-modal);
}

.sheet-panel {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  /* 不用 100vw：那会把纵向滚动条的宽度也算进去，桌面窄窗下会横向溢出 */
  max-width: 480px;
  margin: 0 auto;
  padding: var(--space-2) var(--space-2) calc(var(--space-2) + env(safe-area-inset-bottom, 0px));
  list-style: none;
  background: var(--card-elevated);
  border-top: 1px solid var(--border);
  border-radius: var(--radius-xl) var(--radius-xl) 0 0;
  z-index: var(--z-modal);
}

.sheet-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  min-height: 48px;
  padding: 0 var(--space-3);
  background: none;
  border: none;
  border-radius: var(--radius-md);
  color: var(--foreground);
  font-family: inherit;
  font-size: var(--font-size-lg);
  text-align: left;
  cursor: pointer;
}

@media (hover: hover) and (pointer: fine) {
  .sheet-item:hover {
    background: color-mix(in srgb, var(--foreground) 8%, transparent);
  }
}

.sheet-item:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: -2px;
}

.sheet-item.danger {
  color: var(--error-fg);
}

.sheet-cancel {
  justify-content: center;
  color: var(--muted-foreground);
  margin-top: var(--space-1);
}
</style>
