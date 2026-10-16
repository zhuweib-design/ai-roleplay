<script setup lang="ts">
/**
 * 任务中心页（G 层主载体，§3.5）
 *
 * 之所以给引导一个正经入口而不是只在首启弹窗里说一遍：引导内容依赖真实数据状态，
 * 用户随时可能"配到一半被打断"，需要一个能回来接着做的地方。
 */
import { useRouter } from 'vue-router';
import { t } from '@/i18n';
import Icon from '@/components/common/Icon.vue';
import GuidedTasksCard from '@/components/common/GuidedTasksCard.vue';

const router = useRouter();

function goBack(): void {
  if (window.history.state?.back) void router.back();
  else void router.push({ name: 'chat' });
}
</script>

<template>
  <main id="main-content" class="guide-view" :aria-label="t('guide.aria')" tabindex="-1">
    <header class="guide-page-header">
      <button type="button" class="guide-back" :aria-label="t('common.back')" @click="goBack">
        <Icon name="arrow-left" :size="16" aria-hidden="true" />
        <span>{{ t('common.back') }}</span>
      </button>
      <h1 class="guide-title">{{ t('guide.pageTitle') }}</h1>
      <p class="guide-subtitle">{{ t('guide.pageDesc') }}</p>
    </header>

    <GuidedTasksCard />

    <p class="guide-footnote">{{ t('guide.footnote') }}</p>
  </main>
</template>

<style scoped>
.guide-view {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1 1 0;
  min-width: 0;
  padding: var(--spacing-md, 16px);
  overflow-y: auto;
}

.guide-page-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.guide-back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  align-self: flex-start;
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: transparent;
  color: var(--muted-foreground);
  font-size: 13px;
  cursor: pointer;
}

@media (hover: hover) {
  .guide-back:hover {
    color: var(--foreground);
    border-color: var(--secondary);
  }
}

.guide-title {
  margin: 4px 0 0;
  font-size: 20px;
  color: var(--foreground);
}

.guide-subtitle,
.guide-footnote {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--muted-foreground);
}

.guide-back:focus-visible {
  outline: 2px solid var(--ring, var(--secondary));
  outline-offset: 1px;
}
</style>
