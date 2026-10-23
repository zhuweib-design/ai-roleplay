<script setup lang="ts">
/**
 * VersionPageHeader — 版本页页头（R2-2 从 CharacterVersionView 拆出）
 *
 * 三件事：返回、显示当前仓库属于哪个角色、切角色 / 提交新版本。
 *
 * 角色列表由宿主传进来（宿主已经因为深链等待持有 `characterStore`），
 * 本组件不碰 store —— 它只是"把当前状态画成一条页头"，切换与提交都以事件抛回去。
 */
import Icon from '@/components/common/Icon.vue';
import { t } from '@/i18n';

defineProps<{
  /** 当前仓库的角色名；未选中仓库时为空 */
  repoCharacterName: string | null;
  /** 当前选中的角色 id（空串＝未选） */
  selectedId: string;
  /** 可选角色（id + 名字即可，页头不关心角色卡其它字段） */
  characters: Array<{ id: string; name: string }>;
  /** 已选中角色且角色仍在库里 —— 提交键是否可点 */
  canCommit: boolean;
  /** 是否显示提交键（选中了角色才显示） */
  showCommit: boolean;
}>();

defineEmits<{
  back: [];
  select: [id: string];
  commit: [];
}>();
</script>

<template>
  <header class="page-header">
    <div class="header-title">
      <button type="button" class="header-btn" :aria-label="t('cv.backAria')" @click="$emit('back')">
        <Icon name="arrow-left" :size="18" aria-hidden="true" />
      </button>
      <h1>{{ t('cv.title') }}</h1>
      <span class="header-tag">
        {{ repoCharacterName ?? t('cv.notSelected') }}
      </span>
    </div>
    <div class="header-actions">
      <label class="header-field">
        <span class="sr-only">{{ t('cv.selectCharAria') }}</span>
        <select
          :value="selectedId"
          class="header-select"
          :aria-label="t('cv.selectCharAria')"
          @change="$emit('select', ($event.target as HTMLSelectElement).value)"
        >
          <option value="" disabled>{{ t('cv.selectCharPlaceholder') }}</option>
          <option
            v-for="c in characters"
            :key="c.id"
            :value="c.id"
          >
            {{ c.name }}
          </option>
        </select>
      </label>
      <button
        v-if="showCommit"
        type="button"
        class="header-btn primary"
        :disabled="!canCommit"
        :aria-disabled="!canCommit"
        @click="$emit('commit')"
      >
        <Icon name="save" :size="14" aria-hidden="true" />
        {{ t('cv.commit') }}
      </button>
    </div>
  </header>
</template>

<style scoped>
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  border-bottom: 1px solid var(--border);
  background: var(--card);
  flex-shrink: 0;
  gap: 12px;
  flex-wrap: wrap;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-title h1 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--foreground);
}

.header-tag {
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  font-size: 11px;
  background: var(--card-elevated);
  color: var(--muted-foreground);
}

.header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.header-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--card-elevated);
  color: var(--foreground);
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s;
}

@media (hover: hover) and (pointer: fine) {
  .header-btn:hover {
    background: var(--card-elevated);
  }
}

.header-btn.primary {
  background: var(--primary);
  color: var(--on-primary);
  border-color: var(--primary);
}

@media (hover: hover) and (pointer: fine) {
  .header-btn.primary:hover {
    filter: brightness(1.1);
  }
}

.header-field {
  display: inline-flex;
}

.header-select {
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--card-elevated);
  color: var(--foreground);
  font-size: 13px;
}

.header-select:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}

@media (max-width: 640px) {
  .page-header {
    flex-direction: column;
    align-items: stretch;
  }
  .header-actions {
    justify-content: stretch;
  }
}

@media (max-width: 640px) {
  /* iOS 聚焦防放大：可编辑控件字号须 ≥16px（I-7 / D1） */
  .header-select {
    font-size: 16px;
  }
}
</style>
