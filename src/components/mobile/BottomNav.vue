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
import Icon from '@/components/common/Icon.vue';
import { mobileTabEntries } from '@/core/nav-model';
import { t } from '@/i18n';

const route = useRoute();

const tabs = mobileTabEntries().map((entry) => ({
  name: entry.routeName,
  icon: entry.icon,
  label: t(entry.mobileLabelKey ?? entry.labelKey),
  desc: t(entry.descKey),
}));
</script>

<template>
  <nav class="bottom-nav" :aria-label="t('mobile.navAria')">
    <router-link
      v-for="tab in tabs"
      :key="tab.name"
      :to="{ name: tab.name }"
      class="bottom-nav-item"
      :class="{ active: route.name === tab.name }"
      :aria-current="route.name === tab.name ? 'page' : undefined"
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
