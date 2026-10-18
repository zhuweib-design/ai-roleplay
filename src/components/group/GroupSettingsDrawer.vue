<script setup lang="ts">
/**
 * GroupSettingsDrawer — 手机端「群设置」底部抽屉（MOBILE_PLAN 批次 1-2）
 *
 * 群聊页头现在挂着 8 个动作按钮 + 成员条 + Runtime 排障 + 发言模式，实测把页头
 * 撑到 234px、把消息区压到 32px。手机上的修法不是把它们变小，而是搬走：页头只留
 * 群名与一个「群设置」入口，其余整块进这里。
 *
 * 几何不自己发明：照 `MessageActionSheet` 的已经验证过的形状（贴底、上部圆角、
 * max-width 480、底部带 safe-area）。**不直接复用那个组件**——它是"消息动作清单"
 * 专用件（只接受 MsgAction[] 并渲染成列表），硬套会把两件事绑死；这里只借几何。
 *
 * 焦点：打开后焦点落到关闭按钮，Esc 关闭，关闭后父级把焦点还给触发按钮。
 * 幽灵点击：抬手时浏览器补发的 click 会落在刚弹出的遮罩上，自己把自己关掉——
 * 与 MessageActionSheet 同一个坑，同一段 400ms 防护。
 */
import { computed, nextTick, ref, watch } from 'vue';
import Icon from '@/components/common/Icon.vue';
import { useScrollLock } from '@/composables/useScrollLock';
import { t } from '@/i18n';

const props = defineProps<{
  open: boolean;
  /**
   * 抽屉标题（带上群名，避免用户在一堆群里分不清改的是哪个）。
   * 刻意不叫 `title`：全仓有个「原生 title 守卫」按 `:title=` 扫属性，
   * 只豁免 `<Modal>`，组件用这个 prop 名会被当成 HTML tooltip 判违规。
   */
  heading: string;
}>();

const emit = defineEmits<{ close: [] }>();

const closeBtn = ref<HTMLButtonElement | null>(null);

// 抽屉是覆盖层：打开时锁住背景滚动，否则手指在面板外滑会滚到底下的列表
const openRef = computed(() => props.open);
useScrollLock(openRef);

/**
 * 关闭后把焦点还给打开它的那个按钮。
 * 不还的话焦点会掉到 body 上，屏幕阅读器与键盘用户会从页面开头重新 Tab。
 */
let lastFocus: HTMLElement | null = null;

const GHOST_CLICK_MS = 400;
let openedAt = 0;

function onMaskClick(): void {
  if (Date.now() - openedAt < GHOST_CLICK_MS) return;
  emit('close');
}

watch(
  () => props.open,
  async (isOpen) => {
    if (!isOpen) {
      lastFocus?.focus();
      lastFocus = null;
      return;
    }
    openedAt = Date.now();
    lastFocus = (typeof document !== 'undefined' ? document.activeElement : null) as HTMLElement | null;
    await nextTick();
    closeBtn.value?.focus();
  }
);
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="group-settings-root" @keydown.esc.prevent="emit('close')">
      <div class="settings-mask" @click="onMaskClick" />
      <section
        class="settings-panel"
        role="dialog"
        aria-modal="true"
        :aria-label="heading"
      >
        <header class="settings-head">
          <h2 class="settings-title">{{ heading }}</h2>
          <button
            ref="closeBtn"
            type="button"
            class="settings-close"
            :aria-label="t('common.close')"
            @click="emit('close')"
          >
            <Icon name="close" :size="18" />
          </button>
        </header>
        <div class="settings-body">
          <slot />
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.settings-mask {
  position: fixed;
  inset: 0;
  background: var(--scrim-mask);
  z-index: var(--z-modal);
}

.settings-panel {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  /* 不用 100vw：那会把纵向滚动条宽度也算进去，桌面窄窗下横向溢出 */
  max-width: 480px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  /* 内容可能很长（成员多 + Runtime 展开）：上限留给视口，超出在 body 里滚 */
  max-height: 82vh;
  max-height: 82dvh;
  padding-bottom: env(safe-area-inset-bottom, 0px);
  background: var(--card-elevated);
  border-top: 1px solid var(--border);
  border-radius: var(--radius-xl) var(--radius-xl) 0 0;
  z-index: var(--z-modal);
}

.settings-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2, 8px);
  padding: var(--space-3, 12px) var(--space-3, 12px) var(--space-1, 4px);
  flex-shrink: 0;
}

.settings-title {
  margin: 0;
  min-width: 0;
  font-size: var(--font-size-lg, 16px);
  font-weight: 600;
  color: var(--foreground);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.settings-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: var(--touch-min, 44px);
  height: var(--touch-min, 44px);
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--muted-foreground);
  cursor: pointer;
}

@media (hover: hover) and (pointer: fine) {
  .settings-close:hover {
    background: color-mix(in srgb, var(--foreground) 8%, transparent);
    color: var(--foreground);
  }
}

.settings-close:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: -2px;
}

.settings-body {
  padding: 0 var(--space-3, 12px) var(--space-3, 12px);
  overflow-y: auto;
  min-height: 0;
}
</style>
