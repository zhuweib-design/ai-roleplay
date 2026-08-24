<script setup lang="ts">
/**
 * 移动端底部导航(可安装 PWA 的触控导航)
 * - 5 个主 Tab:会话/角色/市场/世界书/设置
 * - 桌面(≥640px)隐藏,由 App.vue 响应式控制显隐
 * - 当前 Tab 高亮;底部安全区垫高(避开 iOS Home 条)
 * 设计: docs/mobile-ui-design.md §13.1
 */
import { useRoute } from 'vue-router';
import Icon from '@/components/common/Icon.vue';
import { MAIN_TABS } from '@/core/mobile-nav';
import { t } from '@/i18n';

const route = useRoute();

const tabs: Array<{ name: (typeof MAIN_TABS)[number]; icon: string; label: string }> = [
  { name: 'chat', icon: 'chat-circle', label: t('router.chat') },
  { name: 'character-list', icon: 'users', label: t('router.characterList') },
  { name: 'community-market', icon: 'store', label: t('router.market') },
  { name: 'worldbook', icon: 'book-open', label: t('router.worldbook') },
  { name: 'settings', icon: 'gear', label: t('router.settings') },
];
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
    >
      <Icon :name="tab.icon as never" :size="22" />
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
  z-index: 50;
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
  color: var(--secondary);
}
.bottom-nav-label {
  font-size: 10px;
  line-height: 1;
}
</style>