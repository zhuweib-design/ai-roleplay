<script setup lang="ts">
/**
 * 上下文面板 · 角色信息卡 + 世界用户资料 + 会话摘要（R2-3 从 ContextPanel 拆出）
 *
 * 三段都是纯展示：数据来自 store 的只读投影，组件自己不持有状态。
 */
import Avatar from '@/components/common/Avatar.vue';
import { useContextPanel } from '@/composables/useContextPanel';
import { t } from '@/i18n';

const { char, effectiveProfile, modelLabel, worldUserProfileName, chatStore } = useContextPanel();
</script>

<template>
  <!-- 角色信息卡：没有当前角色时（空安装）给一句提示，不再读 char.name 崩掉 -->
  <section v-if="char" class="ctx-section" aria-labelledby="ctx-char-title">
    <header class="ctx-section-header">
      <Avatar :character="char" :size="40" />
      <div class="ctx-char-info">
        <div id="ctx-char-title" class="ctx-char-name">{{ char.name }}</div>
        <div class="ctx-char-model" :class="{ 'not-configured': !effectiveProfile }">
          {{ modelLabel }}
        </div>
      </div>
    </header>
    <p class="ctx-char-desc">{{ char.description }}</p>
    <div v-if="char.tags.length" class="ctx-tags">
      <span v-for="tag in char.tags" :key="tag" class="ctx-tag">{{ tag }}</span>
    </div>
  </section>
  <section v-else class="ctx-section">
    <p class="ctx-no-character">{{ t('characters.emptyNoChar') }}</p>
  </section>

  <!-- 当前世界用户资料：在世界书中编辑 -->
  <section class="ctx-section" aria-labelledby="ctx-persona-title">
    <header class="ctx-section-header">
      <span id="ctx-persona-title" class="ctx-section-title">{{ t('ctx.worldUserProfileTitle') }}</span>
      <span class="ctx-section-value">{{ worldUserProfileName }}</span>
    </header>
    <p class="ctx-persona-hint">
      {{ t('ctx.personaHint') }}
    </p>
  </section>

  <!-- 当前会话摘要状态：让摘要是否生效、覆盖范围和更新状态可见。 -->
  <section class="ctx-section" aria-labelledby="ctx-summary-title">
    <header class="ctx-section-header">
      <span id="ctx-summary-title" class="ctx-section-title">{{ t('ctx.summaryTitle') }}</span>
      <span class="ctx-section-value">
        {{
          chatStore.summaryStatus.phase === 'updating'
            ? t('ctx.summaryUpdatingShort')
            : chatStore.summaryStatus.phase === 'ready'
              ? t('ctx.summaryReadyShort')
              : t('ctx.summaryNoneShort')
        }}
      </span>
    </header>
    <p class="ctx-param-hint">
      {{
        chatStore.summaryStatus.phase === 'updating'
          ? t('ctx.summaryUpdating', { count: chatStore.summaryStatus.coveredMessageCount })
          : chatStore.summaryStatus.phase === 'ready'
            ? t('ctx.summaryCovered', { count: chatStore.summaryStatus.coveredMessageCount })
            : t('ctx.summaryNotReady')
      }}
    </p>
  </section>
</template>

<style scoped>
.ctx-char-info {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.ctx-char-name {
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 600;
  color: var(--foreground);
  line-height: 1.2;
}

.ctx-no-character {
  margin: 0;
  font-size: var(--font-size-xs);
  color: var(--muted-foreground);
}

.ctx-char-model {
  font-size: 11px;
  color: var(--muted-foreground);
  margin-top: 2px;
}

.ctx-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.ctx-tag {
  padding: 2px 8px;
  font-size: 11px;
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--secondary) 10%, transparent);
  color: var(--secondary-text);
}
</style>
