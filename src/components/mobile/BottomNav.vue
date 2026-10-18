<script setup lang="ts">
/**
 * 移动端底部导航(可安装 PWA 的触控导航)
 * - 入口与顺序来自 nav-model（mobileTab），不再本地硬编码
 * - 桌面(≥641px)隐藏,由 App.vue 响应式控制显隐（断点口径：≤640 移动 / 641–1024 平板 / ≥1025 桌面，
 *   唯一来源为 src/core/viewport.ts）
 * - 当前 Tab 高亮;底部安全区垫高(避开 iOS Home 条)
 * 设计: docs/mobile-ui-design.md §13.1
 */
import { useRoute } from 'vue-router';
import { computed } from 'vue';
import Icon from '@/components/common/Icon.vue';
import { activeEntryForRoute, mobileTabEntries } from '@/core/nav-model';
import { t } from '@/i18n';

const route = useRoute();

/**
 * 必须是 computed 而不是普通 const：普通 const 在 setup 那一刻就把当前语言的
 * 字符串快照住了，之后切语言导航这一排还是旧文案（2026-10-15 真机复现：
 * 底部导航中文、设置页英文）。
 */
const tabs = computed(() =>
  mobileTabEntries().map((entry) => ({
    id: entry.id,
    name: entry.routeName,
    icon: entry.icon,
    label: t(entry.mobileLabelKey ?? entry.labelKey),
    desc: t(entry.descKey),
  }))
);

/**
 * 高亮由路由派生（与 NavRail 同一口径：`activeEntryForRoute`），而不是
 * `route.name === tab.name` 精确匹配。
 *
 * A13 之后底栏在二级页也在场，精确匹配会让「/character/new」「/databank」
 * 这类页面上一个 Tab 都不亮——用户看不出自己在哪一段。改成：
 * 1. 当前路由归属的入口就是某个 Tab ⇒ 亮那个 Tab；
 * 2. 归属入口本身不在 Tab 上（数据银行/故事引擎/生图等都在「更多」里）
 *    ⇒ 亮「更多」，表示"你在更多这一段里"。
 */
const activeEntry = computed(() => activeEntryForRoute(route.name as string | undefined));

function isTabActive(tabId: string): boolean {
  const entry = activeEntry.value;
  if (!entry) return false;
  if (entry.id === tabId) return true;
  // 入口自己不在 Tab 上、但在「更多」里 ⇒ 亮「更多」，表示"你在更多这一段里"。
  // `!entry.mobileTab` 这个条件不能少：群聊既是 Tab 又在「更多」里（A12 有意保留
  // 两处入口），漏掉它会同时亮「群聊」和「更多」两项。
  return tabId === 'more' && entry.inMore && !entry.mobileTab;
}

/** 精确命中当前路由标 page；只是所属段（二级页）标 location */
function currentOf(tab: { id: string; name: string }): 'page' | 'location' | undefined {
  if (!isTabActive(tab.id)) return undefined;
  return route.name === tab.name ? 'page' : 'location';
}
</script>

<template>
  <nav class="bottom-nav" :aria-label="t('mobile.navAria')">
    <router-link
      v-for="tab in tabs"
      :key="tab.id"
      :to="{ name: tab.name }"
      class="bottom-nav-item"
      :class="{ active: isTabActive(tab.id) }"
      :aria-current="currentOf(tab)"
      v-tip="tab.desc"
    >
      <Icon :name="tab.icon" :size="22" />
      <span class="bottom-nav-label">{{ tab.label }}</span>
    </router-link>
  </nav>
</template>

<style scoped>
.bottom-nav {
  display: flex;
  position: sticky;
  bottom: 0;
  width: 100%;
  background: var(--card);
  border-top: 1px solid var(--border);
  /* 底部安全区垫高,避开 iOS Home 条 */
  padding-bottom: env(safe-area-inset-bottom, 0);
  z-index: var(--z-bottom-nav);
}
.bottom-nav-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-height: 52px;
  color: var(--muted-foreground);
  text-decoration: none;
  transition: color 0.12s ease;
}
.bottom-nav-item.active {
  color: var(--secondary-text);
}
.bottom-nav-label {
  font-size: 10px;
  line-height: 1;
}
</style>
