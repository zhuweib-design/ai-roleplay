<script setup lang="ts">
/**
 * SettingsModelPanel — 设置页「模型管理」面板
 *
 * 自 SettingsView.vue 迁出（P2-7），2026-10-19 由 R1-4 拆分：
 * 2544 → 本文件 + 6 个新文件（ModelCloudList / ModelLocalSection /
 * ModelProfileList / ModelProfileForm / ModelThinkingSection / ModelPresetSection
 * + composable useModelProfileForm.ts）。
 *
 * 留下的只有"这一页有哪几节、按什么顺序排、各自开什么弹窗"：
 * 5 个 section 的顺序、云端/本地 Tab 的切换（它决定第 1 节里挂谁），
 * 以及"新增/编辑"两处入口到同一个表单弹窗的接线。
 */
import { ref } from 'vue';
import type { ApiProfile } from '@/types';
import Icon from '@/components/common/Icon.vue';
import ModelCloudList from './ModelCloudList.vue';
import ModelLocalSection from './ModelLocalSection.vue';
import ModelProfileList from './ModelProfileList.vue';
import ModelProfileForm from './ModelProfileForm.vue';
import ModelThinkingSection from './ModelThinkingSection.vue';
import ModelPresetSection from './ModelPresetSection.vue';
import { t } from '@/i18n';

/** 云端 / 本地切换（第9条：统一管理）：决定第 1 节里挂谁 */
const modelMgmtTab = ref<'cloud' | 'local'>('cloud');

const profileForm = ref<InstanceType<typeof ModelProfileForm> | null>(null);

function openCreateModal() {
  profileForm.value?.openCreate();
}

function openEditModal(profile: ApiProfile) {
  profileForm.value?.openEdit(profile);
}
</script>

<template>
  <!-- 需求3+9：统一模型管理（云端按分类分组 + 本地模型统一管理） -->
  <section class="settings-section" aria-labelledby="model-mgmt-title">
    <header class="section-header">
      <h2 id="model-mgmt-title" class="section-title">
        <Icon name="cpu" :size="16" />
        <span>{{ t('modelPanel.title') }}</span>
      </h2>
      <button
        v-if="modelMgmtTab === 'cloud'"
        type="button"
        class="add-btn"
        :aria-label="t('modelPanel.newAria')"
        @click="openCreateModal"
      >
        <Icon name="plus" :size="14" />
        <span>{{ t('modelPanel.new') }}</span>
      </button>
    </header>

    <!-- 云端 / 本地 切换（第9条：统一管理） -->
    <div class="bg-source-tabs model-mgmt-tabs" role="tablist" :aria-label="t('modelPanel.tabsAria')">
      <button
        type="button"
        class="bg-source-tab"
        role="tab"
        :aria-selected="modelMgmtTab === 'cloud'"
        :class="{ active: modelMgmtTab === 'cloud' }"
        @click="modelMgmtTab = 'cloud'"
      >
{{ t('modelPanel.tabCloud') }}
</button>
      <button
        type="button"
        class="bg-source-tab"
        role="tab"
        :aria-selected="modelMgmtTab === 'local'"
        :class="{ active: modelMgmtTab === 'local' }"
        @click="modelMgmtTab = 'local'"
      >
{{ t('modelPanel.tabLocal') }}
</button>
    </div>

    <ModelCloudList v-if="modelMgmtTab === 'cloud'" />
    <ModelLocalSection v-else />
  </section>

  <!-- API Profile 管理 -->
  <section class="settings-section" aria-labelledby="api-section-title">
    <header class="section-header">
      <h2 id="api-section-title" class="section-title">
        <Icon name="git-branch" :size="16" />
        <span>{{ t('modelPanel.apiTitle') }}</span>
      </h2>
      <button
        type="button"
        class="add-btn"
        :aria-label="t('modelPanel.apiNewAria')"
        @click="openCreateModal"
      >
        <Icon name="plus" :size="14" />
        <span>{{ t('modelPanel.new') }}</span>
      </button>
    </header>

    <ModelProfileList @edit="openEditModal" />
  </section>

  <ModelThinkingSection />
  <ModelPresetSection />

  <!-- 编辑/新建共用同一扇门：列表与页头两处入口都接到它 -->
  <ModelProfileForm ref="profileForm" />
</template>

<style scoped>
/* ── 标准 section 容器 ── */
.settings-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 20px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.section-title {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 600;
  color: var(--foreground);
  margin: 0;
}

/* ── API Profile 管理 ── */
.add-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-xs);
  height: 30px;
  padding: 0 12px;
  border-radius: var(--radius-md);
  background: var(--primary);
  border: 1px solid var(--primary);
  color: var(--on-primary);
  font-size: 12px;
  cursor: pointer;
  transition: background-color .15s ease, border-color .15s ease;
}

@media (hover: hover) and (pointer: fine) {
  .add-btn:hover {
    background: var(--destructive);
    border-color: var(--destructive);
  }
}

.add-btn:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 2px;
}

/* ── 云端/本地切换 tabs ── */
.model-mgmt-tabs {
  display: flex;
  gap: var(--spacing-sm);
  padding: var(--spacing-xs);
  background: var(--video-bg);
  border-radius: var(--radius-md);
}

.model-mgmt-tabs .bg-source-tab {
  flex: 1;
  height: 32px;
  border: none;
  background: transparent;
  color: var(--muted-foreground);
  font-size: 13px;
  cursor: pointer;
  border-radius: calc(var(--radius-md) - 2px);
  transition: background-color 0.15s, color 0.15s, border-color 0.15s;
}

.model-mgmt-tabs .bg-source-tab.active {
  background: var(--card);
  color: var(--foreground);
  font-weight: 500;
}

.model-mgmt-tabs .bg-source-tab:focus-visible {
  outline: 2px solid var(--tk-cyan-500);
  outline-offset: 2px;
}

</style>
