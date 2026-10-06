<script setup lang="ts">
/**
 * MoreView — 移动端"更多"聚合页（D-11 修复，REAL_DEVICE_TEST_2026-10-03）
 *
 * 原缺陷：≤640px 下 NavRail 卸载、底栏仅 5 个主入口，导致数据银行/记录/故事引擎/
 * 随机事件/图像生成/版本管理/个人中心等页面在移动端没有任何 UI 入口。
 * 产品决策：将这些二级入口**合并到本聚合页**，底栏新增"更多"Tab 作为统一跳转入口。
 */
import { useRoute } from 'vue-router';
import Icon from '@/components/common/Icon.vue';
import { t, type MessageKey } from '@/i18n';

const route = useRoute();

const entries: Array<{ name: string; path: string; icon: string; labelKey: MessageKey; descKey: MessageKey }> = [
  { name: 'databank', path: '/databank', icon: 'database', labelKey: 'router.databank', descKey: 'router.databank' },
  { name: 'archives', path: '/archives', icon: 'archive', labelKey: 'router.archives', descKey: 'router.archives' },
  { name: 'story', path: '/story', icon: 'book-open', labelKey: 'router.story', descKey: 'router.story' },
  { name: 'random-events', path: '/random-events', icon: 'calendar-check', labelKey: 'router.randomEvents', descKey: 'router.randomEvents' },
  { name: 'image-gen', path: '/image-gen', icon: 'image-stack', labelKey: 'router.imageGen', descKey: 'router.imageGen' },
  { name: 'character-version', path: '/character-version', icon: 'git-branch', labelKey: 'router.characterVersion', descKey: 'router.characterVersion' },
  { name: 'profile', path: '/profile', icon: 'user', labelKey: 'router.profile', descKey: 'router.profile' },
  { name: 'local-model', path: '/local-model', icon: 'cpu', labelKey: 'router.localModel', descKey: 'router.localModel' },
];
</script>

<template>
  <div class="more-view">
    <header class="more-header">
      <h1>{{ t('more.title') }}</h1>
      <p class="more-desc">{{ t('more.desc') }}</p>
    </header>

    <nav class="more-grid" :aria-label="t('more.gridAria')">
      <router-link
        v-for="entry in entries"
        :key="entry.name"
        :to="{ name: entry.name }"
        class="more-card"
        :class="{ active: route.name === entry.name }"
      >
        <Icon :name="entry.icon as never" :size="22" />
        <span class="more-card-label">{{ t(entry.labelKey) }}</span>
      </router-link>
    </nav>
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
.more-header h1 {
  margin: 0;
  font-size: 20px;
  color: var(--foreground);
}
.more-desc {
  margin: 4px 0 0;
  font-size: 12px;
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
  align-items: center;
  gap: var(--spacing-xs, 4px);
  padding: var(--spacing-md, 16px) var(--spacing-sm, 8px);
  border: 1px solid var(--border);
  border-radius: var(--radius-md, 12px);
  background: var(--card);
  color: var(--foreground);
  text-decoration: none;
  font-size: 13px;
  min-height: 76px;
  justify-content: center;
}
.more-card:active {
  border-color: var(--secondary);
}
.more-card-label {
  text-align: center;
}
</style>
