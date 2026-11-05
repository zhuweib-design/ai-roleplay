<script setup lang="ts">
/**
 * 上下文面板 · 世界书（R2-3 从 ContextPanel 拆出）
 *
 * 列的是"真正会注入的那批"（E03）：判定源与发送链路共用
 * `collectLorebooksForCharacter`，全局书单独打标并同样可点进世界书页。
 */
import { useContextPanel } from '@/composables/useContextPanel';
import { t } from '@/i18n';

const { effectiveLorebooks, openLorebook } = useContextPanel();
</script>

<template>
  <section class="ctx-section" aria-labelledby="ctx-world-title">
    <header class="ctx-section-header">
      <span id="ctx-world-title" class="ctx-section-title">{{ t('ctx.worldTitle') }}</span>
      <span class="ctx-section-value">{{ t('ctx.worldCount', { count: effectiveLorebooks.length }) }}</span>
    </header>
    <ul v-if="effectiveLorebooks.length" class="world-list">
      <li v-for="lb in effectiveLorebooks" :key="lb.id" class="world-lorebook">
        <button
          type="button"
          class="world-row-btn"
          :data-rel-jump="lb.scope === 'global' ? 'ctx-world-global' : 'ctx-world-bound'"
          :aria-label="t('ctx.worldRowAria', { name: lb.name })"
          @click="openLorebook(lb.id)"
        >
          <span class="world-entry-name">{{ lb.name }}</span>
          <span v-if="lb.scope === 'global'" class="world-global-tag">{{ t('ctx.worldGlobalTag') }}</span>
        </button>
        <span class="world-entry-count">
          {{ t('ctx.worldEnabled', { count: lb.entries.filter((e) => e.enabled).length }) }}
        </span>
      </li>
    </ul>
    <p v-else class="ctx-empty">{{ t('ctx.worldEmpty') }}</p>
  </section>
</template>

<style scoped>
.world-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.world-entry-name {
  flex: 1;
  font-size: 13px;
  color: var(--foreground);
}

.world-lorebook {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
  padding: 6px 4px;
  border-radius: var(--radius-sm);
}

.world-lorebook .world-entry-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 行本身可点（E03 的"可一跳"）：按钮铺满左侧弹性区，计数仍在行右端 */
.world-row-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
  padding: 0;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.world-global-tag {
  flex-shrink: 0;
  padding: 1px 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  font-size: 11px;
  color: var(--muted-foreground);
}

.world-entry-count {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--muted-foreground);
}
</style>
