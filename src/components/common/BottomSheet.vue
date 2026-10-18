<script setup lang="ts">
/**
 * BottomSheet — 手机端底部抽屉外壳（通用件；首个使用者是批次 1-2 的「群设置」）
 *
 * 几何照 `MessageActionSheet` 已经验证过的形状（贴底、上部圆角、max-width 480、
 * 底部带 safe-area）。**不直接复用那个组件**——它是"消息动作清单"专用件（只接受
 * MsgAction[] 并渲染成列表），硬套会把两件事绑死；这里只借几何。
 *
 * 内容全部走 slot：外壳只管"弹出/遮罩/焦点/滚动锁"，不管里面是什么。
 * 第二个使用者是批次 1-5 的角色详情抽屉（CharacterDetailDrawer）。
 *
 * 焦点：打开后焦点落到关闭按钮，Esc 关闭，关闭后父级把焦点还给触发按钮。
 * 幽灵点击：抬手时浏览器补发的 click 会落在刚弹出的遮罩上，自己把自己关掉——
 * 与 MessageActionSheet 同一个坑，同一段 400ms 防护。
 * 系统返回：抽屉开着时按安卓返回键只关抽屉，不会连底下的二级页一起退掉
 * （`useBackLayer`，批次 2-3）。
 */
import { computed, nextTick, ref, watch } from 'vue';
import Icon from '@/components/common/Icon.vue';
import { useScrollLock } from '@/composables/useScrollLock';
import { useBackLayer } from '@/composables/useBackLayer';
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

/**
 * 抽屉自己吃掉一次系统返回（批次 2-3）。没有这一行的话，抽屉开着按返回会：
 * 有二级页 ⇒ 退掉二级（抽屉还盖在列表上）；没有二级页 ⇒ 直接离开页面。
 */
useBackLayer({ isOpen: () => props.open, onBack: () => emit('close') });

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
    <div v-if="open" class="bs-root" @keydown.esc.prevent="emit('close')">
      <div class="bs-mask" @click="onMaskClick" />
      <section
        class="bs-panel"
        role="dialog"
        aria-modal="true"
        :aria-label="heading"
      >
        <header class="bs-head">
          <h2 class="bs-title">{{ heading }}</h2>
          <button
            ref="closeBtn"
            type="button"
            class="bs-close"
            :aria-label="t('common.close')"
            @click="emit('close')"
          >
            <Icon name="close" :size="18" />
          </button>
        </header>
        <div class="bs-body">
          <slot />
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.bs-mask {
  position: fixed;
  inset: 0;
  background: var(--scrim-mask);
  z-index: var(--z-modal);
}

.bs-panel {
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

.bs-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2, 8px);
  padding: var(--space-3, 12px) var(--space-3, 12px) var(--space-1, 4px);
  flex-shrink: 0;
}

.bs-title {
  margin: 0;
  min-width: 0;
  font-size: var(--font-size-lg, 16px);
  font-weight: 600;
  color: var(--foreground);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bs-close {
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
  .bs-close:hover {
    background: color-mix(in srgb, var(--foreground) 8%, transparent);
    color: var(--foreground);
  }
}

.bs-close:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: -2px;
}

.bs-body {
  padding: 0 var(--space-3, 12px) var(--space-3, 12px);
  overflow-y: auto;
  min-height: 0;
}
</style>
