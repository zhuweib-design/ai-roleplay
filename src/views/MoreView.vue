<script setup lang="ts">
/**
 * MoreView —"更多"聚合页
 *
 * 来源：D-11（≤640px 下 NavRail 卸载，二级入口在移动端没有任何 UI 入口）。
 * N 层改造（UX_IA_GUIDED_FLOW_DESIGN_2026-10-07.md §3.2.6）：
 * - 入口清单来自 nav-model，与桌面 rail、移动底栏同源
 * - 按内容组分节，并真正渲染 descKey（原实现声明了 descKey 却没有渲染）
 * - 桌面端也可达（rail 底部系统项），因此补页头与返回
 */
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import Icon from '@/components/common/Icon.vue';
import { t } from '@/i18n';
import { NAV_GROUPS, moreEntries, type NavEntry } from '@/core/nav-model';

const router = useRouter();
const groups = NAV_GROUPS.map((group) => ({
  ...group,
  entries: moreEntries().filter((e) => e.group === group.id),
})).filter((group) => group.entries.length > 0);

const sections = computed(() => groups);

function goBack(): void {
  if (window.history.state?.back) void router.back();
  else void router.push({ name: 'chat' });
}

function cardAria(entry: NavEntry): string {
  return t(entry.labelKey);
}
</script>

<template>
  <div class="more-view">
    <header class="more-header">
      <button type="button" class="more-back-btn" :aria-label="t('common.back')" @click="goBack">
        <Icon name="arrow-left" :size="18" aria-hidden="true" />
        <span>{{ t('common.back') }}</span>
      </button>
      <h1>{{ t('more.title') }}</h1>
      <p class="more-desc">{{ t('more.desc') }}</p>
    </header>

    <section
      v-for="group in sections"
      :key="group.id"
      class="more-section"
      role="group"
      :aria-labelledby="`more-group-${group.id}`"
    >
      <h2 :id="`more-group-${group.id}`" class="more-section-title">{{ t(group.labelKey) }}</h2>
      <nav class="more-grid" :aria-label="t('more.gridAria')">
        <router-link
          v-for="entry in group.entries"
          :key="entry.id"
          :to="{ name: entry.routeName }"
          class="more-card"
          :aria-label="cardAria(entry)"
          :data-rel-jump="`more-${entry.id}`"
        >
          <Icon :name="entry.icon" :size="22" aria-hidden="true" />
          <span class="more-card-label">{{ t(entry.labelKey) }}</span>
          <span class="more-card-desc">{{ t(entry.descKey) }}</span>
        </router-link>
      </nav>
    </section>
  </div>
</template>

<style scoped>
.more-view {
  padding: var(--spacing-md, 16px);
  padding-bottom: calc(72px + env(safe-area-inset-bottom, 0));
}
.more-header {
  margin-bottom: var(--spacing-md, 16px);
}
.more-back-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm, 8px);
  background: transparent;
  color: var(--muted-foreground);
  font-size: 13px;
  cursor: pointer;
}
.more-header h1 {
  margin: 8px 0 0;
  font-size: 20px;
  color: var(--foreground);
}
.more-desc {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--muted-foreground);
}
.more-section {
  margin-bottom: var(--spacing-lg, 24px);
}
.more-section-title {
  margin: 0 0 var(--spacing-sm, 8px);
  font-size: 13px;
  font-weight: 600;
  color: var(--muted-foreground);
}
.more-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--spacing-sm, 8px);
}
.more-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--spacing-xs, 4px);
  padding: var(--spacing-md, 16px) var(--spacing-sm, 8px);
  border: 1px solid var(--border);
  border-radius: var(--radius-md, 12px);
  background: var(--card);
  color: var(--foreground);
  text-decoration: none;
  min-height: 76px;
}
.more-card-label {
  font-size: 14px;
  font-weight: 600;
}
.more-card-desc {
  font-size: 13px;
  line-height: 1.3;
  color: var(--muted-foreground);
}
</style>
