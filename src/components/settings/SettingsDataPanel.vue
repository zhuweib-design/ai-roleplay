<script setup lang="ts">
import { useCharacterStore } from '@/stores/character';
import Icon from '@/components/common/Icon.vue';
import { t } from '@/i18n';
import SettingsDataDailySection from './SettingsDataDailySection.vue';
import SettingsDataAdvancedSection from './SettingsDataAdvancedSection.vue';
import SettingsDataModals from './SettingsDataModals.vue';

/**
 * R3-2：设置-数据面板的装配层。
 *
 * 只留分区外壳、页头与「无角色时不渲染」的判据；内容按使用频率分三层：
 *   日常段  资料档案 / 全量备份 / 角色卡 PNG / 对话 Markdown（每天会点的）
 *   高级段  QR 互导 / PWA 持久性 / 嵌入优化 / 审计日志（默认收起的运维项）
 *   弹窗    导入结果 / 审计日志 / 清空确认 / 主密码（Modal 走 Teleport 到 body）
 *
 * 弹窗单独成组件而不是留在宿主：Modal 传送后不在本组件的 DOM 子树里，
 * 样式必须写在弹窗自己所在的组件才命中。
 */

const characterStore = useCharacterStore();
</script>

<template>
  <div>
    <!-- F13 数据管理 -->
    <section
      v-if="characterStore.characters.length > 0"
      class="settings-section data-mgmt-section"
      aria-labelledby="data-mgmt-title"
    >
      <header class="section-header">
        <h2 id="data-mgmt-title" class="section-title">
          <Icon name="download" :size="16" />
          <span>{{ t('settingsView.dataMgmtTitle') }}</span>
        </h2>
        <p class="section-hint">{{ t('settingsView.dataMgmtDesc') }}</p>
      </header>

      <SettingsDataDailySection />
      <SettingsDataAdvancedSection />
    </section>

    <SettingsDataModals />
  </div>
</template>

<style scoped>
.settings-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
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
  gap: 8px;
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 600;
  color: var(--foreground);
  margin: 0;
}

.section-hint {
  font-size: 12px;
  color: var(--muted-foreground);
  margin: 0;
}

/* ── F13 数据管理 ── */
.data-mgmt-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ── 响应式 ── */
@media (max-width: 640px) {
  .settings-section {
    padding: 14px;
  }
}
</style>
