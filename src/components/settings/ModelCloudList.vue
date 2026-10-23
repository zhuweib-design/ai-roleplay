<script setup lang="ts">
/**
 * ModelCloudList — 云端模型按分类分组展示 + 主模型设置
 *
 * R1-4 从 SettingsModelPanel（原 2544 行）拆出。分组/主模型逻辑只被这一块用，
 * 所以留在组件内，不另建 composable（单一消费者）。
 *
 * 「新增」按钮不在这里：它在宿主的 `.section-header` 里，本组件只管列表。
 *
 * 多根（fragment）：宿主 `.settings-section` 是 flex 列容器，本组件的第一层
 * 是 hint + 若干 `.model-category-group`，平铺进容器各占一格，与拆分前一致。
 */
import { computed } from 'vue';
import { useSettingsStore } from '@/stores/settings';
import { MODEL_CATEGORIES, type ModelCategory, type ApiProfile } from '@/types';
import Icon from '@/components/common/Icon.vue';
import { showToast } from '@/utils/toast-service';
import { t } from '@/i18n';

const settings = useSettingsStore();

/** 模型分类元数据（供模板遍历） */
const modelCategories = MODEL_CATEGORIES;

/** 按分类分组展示模型 */
const modelsByCategory = computed(() => {
  const groups: Record<ModelCategory, ApiProfile[]> = {
    'chat': [],
    'image-video': [],
    'embedding': [],
  };
  for (const p of settings.apiProfiles) {
    const cat = p.category ?? 'chat';
    groups[cat].push(p);
  }
  return groups;
});

/** 获取分类的主模型 ID */
function getPrimaryId(category: ModelCategory): string | null {
  return settings.getPrimaryModel(category)?.id ?? null;
}

/** 设置某分类的主模型 */
function handleSetPrimary(profile: ApiProfile, category: ModelCategory): void {
  settings.setPrimaryModel(profile.id, category);
  showToast('success', t('modelPanel.setPrimaryDone', { name: profile.name, category: MODEL_CATEGORIES.find((c) => c.value === category)?.label ?? '' }));
}
</script>

<template>
  <p class="section-hint">
    {{ t('modelPanel.cloudHint') }}
  </p>

  <div
    v-for="cat in modelCategories"
    :key="cat.value"
    class="model-category-group"
  >
    <h3 class="category-group-title">
      <Icon name="git-branch" :size="14" aria-hidden="true" />
      <span>{{ cat.label }}</span>
      <span class="category-count">{{ modelsByCategory[cat.value].length }}</span>
    </h3>
    <p class="category-desc">{{ cat.description }}</p>

    <ul v-if="modelsByCategory[cat.value].length" class="profile-list model-mgmt-list" role="list">
      <li
        v-for="profile in modelsByCategory[cat.value]"
        :key="profile.id"
        class="profile-item"
        :class="{ 'is-primary': getPrimaryId(cat.value) === profile.id }"
      >
        <div class="profile-info">
          <div class="profile-row">
            <span class="profile-name">{{ profile.name }}</span>
            <span
              v-if="getPrimaryId(cat.value) === profile.id"
              class="primary-badge"
              :aria-label="t('modelPanel.primaryBadge')"
            >{{ t('modelPanel.primaryBadge') }}</span>
            <span class="provider-badge" :data-provider="profile.provider">
              {{ profile.provider }}
            </span>
          </div>
          <div class="profile-meta">
            <span class="meta-item"><Icon name="gear" :size="11" /> {{ profile.model }}</span>
          </div>
        </div>
        <div class="profile-actions">
          <button
            v-if="getPrimaryId(cat.value) !== profile.id"
            type="button"
            class="action-btn set-primary"
            :aria-label="t('modelPanel.setPrimaryAria', { name: profile.name, category: cat.label })"
            @click="handleSetPrimary(profile, cat.value)"
          >
            <Icon name="star" :size="12" />
            <span>{{ t('modelPanel.setPrimary') }}</span>
          </button>
          <span v-else class="primary-mark" :aria-label="t('modelPanel.currentPrimary')">
            <Icon name="check" :size="12" />
            <span>{{ t('modelPanel.currentPrimary') }}</span>
          </span>
        </div>
      </li>
    </ul>
    <p v-else class="empty-hint">{{ t('modelPanel.emptyCategory') }}</p>
  </div>
</template>

<style scoped>
/* ── 共用基类：从 SettingsModelPanel.vue 复制（scoped 不穿透子组件） ── */
.section-hint {
  font-size: 12px;
  color: var(--muted-foreground);
  margin: 0;
}

.profile-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.profile-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--video-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  transition: border-color .15s ease, background-color .15s ease;
}

.profile-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.profile-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  flex-wrap: wrap;
}

.profile-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--foreground);
}

.provider-badge {
  background: var(--badge-bg);
  color: var(--badge-fg);
  font-size: 10px;
  padding: 2px 6px;
  border-radius: var(--radius-pill);
  font-family: var(--font-mono);
  text-transform: lowercase;
}

.provider-badge[data-provider='openai'] {
  background: color-mix(in srgb, var(--brand-openai) 20%, transparent);
  color: var(--brand-openai-text);
}

.provider-badge[data-provider='anthropic'] {
  background: color-mix(in srgb, var(--brand-anthropic) 20%, transparent);
  color: var(--brand-anthropic-text);
}

.provider-badge[data-provider='custom'] {
  background: color-mix(in srgb, var(--primary) 20%, transparent);
  color: var(--brand-primary-text);
}

.provider-badge[data-provider='deepseek'] {
  background: color-mix(in srgb, var(--accent-blue) 20%, transparent);
  color: var(--brand-accent-blue-text);
}

.profile-meta {
  display: flex;
  gap: 12px;
  font-size: 11px;
  color: var(--muted-foreground);
  flex-wrap: wrap;
}

.meta-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.profile-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: var(--size-control-sm);
  padding: 0 10px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--card-elevated);
  color: var(--muted-foreground);
  font-size: 11px;
  cursor: pointer;
  transition: background-color .15s ease, color .15s ease, border-color .15s ease;
}

@media (hover: hover) and (pointer: fine) {
  .action-btn:hover {
    background: var(--card);
    color: var(--foreground);
  }
}

.action-btn:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 2px;
}

.empty-hint {
  font-size: 13px;
  color: var(--muted-foreground);
  margin: 0;
  padding: var(--spacing-md) 0;
  text-align: center;
}

/* ── 需求3：模型分类分组（卡片式容器，对齐外观页「界面自定义」.ui-custom-block 风格） ── */
.model-category-group {
  margin-top: 12px;
  padding: var(--spacing-md);
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.model-category-group:first-of-type {
  margin-top: 0;
}

.category-group-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  color: var(--foreground);
  margin: 0;
}

.category-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  background: var(--card-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  font-size: 11px;
  font-weight: 600;
  color: var(--muted-foreground);
  font-family: var(--font-mono);
}

.category-desc {
  font-size: 12px;
  color: var(--muted-foreground);
  margin: 0;
  line-height: 1.5;
}

.model-mgmt-list {
  margin-top: 0;
}

.profile-item.is-primary {
  border-color: var(--primary);
  background: color-mix(in srgb, var(--primary) 6%, transparent);
}

.primary-badge {
  display: inline-flex;
  align-items: center;
  padding: 1px 8px;
  background: var(--primary);
  color: var(--on-primary);
  font-size: 10px;
  font-weight: 600;
  border-radius: var(--radius-pill);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.primary-mark {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--primary-fg);
  font-weight: 500;
}

.action-btn.set-primary {
  color: var(--warning-fg);
  border-color: var(--warning-border);
}

@media (hover: hover) and (pointer: fine) {
  .action-btn.set-primary:hover {
    background: var(--warning-bg);
    border-color: var(--warning-fg);
    color: var(--warning-fg);
  }
}
</style>
