<script setup lang="ts">
/**
 * 上下文面板（右抽屉）：宿主只做外壳 + 编排（R2-3 拆分，1269 → 目标 ≤690）
 *
 * 八个 section 全部是「只读 store 投影 + 写 store」的组件，各自调用
 * `useContextPanel()` 即可，没有需要跨段共享的可变状态（唯一例外是 schema 编辑器的
 * 折叠开关，它只在 ContextStatusSection 内部用，就留在那里）。
 * 触摸手势作用于 `<aside>` 根元素，故留在宿主。
 *
 * 样式分层：`.ctx-*` 基类（section 外壳、标题、滑杆行、提示文案）八个 section 都在用，
 * 且只在本面板出现 ⇒ 留宿主用 `.context-panel :deep(...)` 一次作用到内部
 * （与 R2-2 同一判据：会不会被别处引用；ChatMain 的 `:deep(.msg-bubble)` 同手法）。
 */
import { useCharacterStore } from '@/stores/character';
import Icon from '@/components/common/Icon.vue';
import { t } from '@/i18n';
import ContextCharacterCard from './context/ContextCharacterCard.vue';
import ContextTokenBudget from './context/ContextTokenBudget.vue';
import ContextWorldBooks from './context/ContextWorldBooks.vue';
import ContextAuthorNote from './context/ContextAuthorNote.vue';
import ContextRuntimeSection from './context/ContextRuntimeSection.vue';
import ContextGenParams from './context/ContextGenParams.vue';
import ContextSamplingSection from './context/ContextSamplingSection.vue';
import ContextStatusSection from './context/ContextStatusSection.vue';

const characterStore = useCharacterStore();

// I-8：触屏横向滑动关闭抽屉（右抽屉：向左滑 >60px 关闭）
let ctxTouchStartX = 0;
let ctxTouchStartY = 0;
let ctxSwipeHoriz = false;
function onCtxTouchStart(e: TouchEvent) {
  if (!characterStore.contextDrawerOpen) return;
  ctxTouchStartX = e.touches[0]!.clientX;
  ctxTouchStartY = e.touches[0]!.clientY;
  ctxSwipeHoriz = false;
}
function onCtxTouchMove(e: TouchEvent) {
  if (!characterStore.contextDrawerOpen) return;
  const dx = e.touches[0]!.clientX - ctxTouchStartX;
  const dy = e.touches[0]!.clientY - ctxTouchStartY;
  if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 12) ctxSwipeHoriz = true;
}
function onCtxTouchEnd(e: TouchEvent) {
  if (!characterStore.contextDrawerOpen) return;
  const dx = e.changedTouches[0]!.clientX - ctxTouchStartX;
  if (ctxSwipeHoriz && dx < -60) characterStore.closeAllDrawers();
  ctxSwipeHoriz = false;
}
</script>

<template>
  <aside
    id="context-drawer"
    tabindex="-1"
    class="context-panel"
    :class="{ active: characterStore.contextDrawerOpen, collapsed: !characterStore.panelExpanded }"
    :aria-label="t('ctx.aria')"
    @touchstart="onCtxTouchStart"
    @touchmove="onCtxTouchMove"
    @touchend="onCtxTouchEnd"
  >
    <!-- 顶栏 -->
    <header class="ctx-header">
      <span class="ctx-title">{{ t('ctx.title') }}</span>
      <button
        type="button"
        class="mobile-menu-btn ctx-close client-compact-only"
        :aria-label="t('ctx.closePanel')"
        @click="characterStore.togglePanel()"
      >
        <Icon name="close" :size="18" />
      </button>
    </header>

    <!-- 可滚动内容 -->
    <div class="context-panel-scroll tk-scroll">
      <ContextCharacterCard />
      <ContextTokenBudget />
      <ContextWorldBooks />
      <ContextAuthorNote />
      <ContextRuntimeSection />
      <ContextGenParams />
      <ContextSamplingSection />
      <ContextStatusSection />
    </div>
  </aside>
</template>

<style scoped>
.ctx-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 56px;
  padding: 0 16px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.ctx-title {
  font-family: var(--font-display);
  font-size: 14px;
  font-weight: 600;
  color: var(--foreground);
  letter-spacing: 0.02em;
}

.ctx-close {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  background: none;
  border: none;
  color: var(--muted-foreground);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ── 以下为八个 section 共用的基类：留宿主一次作用到子组件内部 ── */

.context-panel :deep(.ctx-section) {
  padding: var(--spacing-md);
  border-bottom: 1px solid var(--border);
}

.context-panel :deep(.ctx-section-header) {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.context-panel :deep(.ctx-section-title) {
  font-size: 13px;
  font-weight: 600;
  color: var(--foreground);
  flex: 1;
}

.context-panel :deep(.ctx-section-value) {
  font-size: 11px;
  color: var(--muted-foreground);
  font-family: var(--font-mono);
}

.context-panel :deep(.ctx-char-desc) {
  margin: 0 0 10px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--muted-foreground);
}

.context-panel :deep(.ctx-empty) {
  margin: 0;
  padding: 8px 4px;
  font-size: 12px;
  color: var(--muted-foreground);
  text-align: center;
}

.context-panel :deep(.ctx-textarea) {
  width: 100%;
  background: var(--video-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 8px 10px;
  color: var(--foreground);
  font-size: 13px;
  font-family: var(--font-sans);
  line-height: 1.55;
  resize: vertical;
  outline: none;
}

/* P0-3：第 4 列留给「恢复默认」按钮（无按钮时该列宽度为 0，不改变既有布局） */
.context-panel :deep(.ctx-range-label) {
  display: grid;
  grid-template-columns: auto 1fr auto auto;
  align-items: center;
  gap: var(--spacing-sm);
  margin-top: 10px;
  font-size: 12px;
  color: var(--muted-foreground);
}

.context-panel :deep(.ctx-range-value) {
  font-family: var(--font-mono);
  color: var(--foreground);
  min-width: 36px;
  text-align: right;
}

.context-panel :deep(.ctx-persona-hint) {
  margin: 6px 0 0;
  font-size: 11px;
  color: var(--muted-foreground);
  line-height: 1.5;
}

.context-panel :deep(.ctx-persona-hint code) {
  font-family: var(--font-mono);
  padding: 1px 4px;
  background: color-mix(in srgb, var(--secondary) 10%, transparent);
  border-radius: var(--radius-sm);
  color: var(--secondary-text);
}

/* 待清理：全站已有 base.css 的 `.sr-only`（每条带 !important），本页副本从未被引用。
   按 R1-4 立下的纪律"先分离再删"，下一提交单独删。 */
.context-panel :deep(.visually-hidden) {
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

/* P0-2/P0-3：思考强度与采样参数行 */
.context-panel :deep(.ctx-param-row) {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: var(--spacing-sm);
}

.context-panel :deep(.ctx-param-label) {
  font-size: 12px;
  color: var(--muted-foreground);
}

.context-panel :deep(.ctx-param-hint) {
  margin: 0;
  font-size: 11px;
  line-height: 1.5;
  color: var(--muted-foreground);
}

.context-panel :deep(.ctx-reset-btn) {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: var(--size-control-xs);
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: none;
  color: var(--muted-foreground);
  cursor: pointer;
}

@media (hover: hover) and (pointer: fine) {
  .context-panel :deep(.ctx-reset-btn:hover) {
    color: var(--foreground);
  }
}

.context-panel :deep(.ctx-reset-btn:focus-visible) {
  outline: 2px solid var(--secondary);
  outline-offset: 1px;
}

@media (max-width: 640px) {
  /* iOS 聚焦防放大：可编辑控件字号须 ≥16px（I-7 / D1） */
  .context-panel :deep(.ctx-textarea) {
    font-size: 16px;
  }
}

/* 批次 3-2：抽屉关闭按钮是独立可点元素 */
@media (max-width: 640px) {
  .mobile-menu-btn {
    min-width: var(--touch-min);
    min-height: var(--touch-min);
  }
}
</style>
