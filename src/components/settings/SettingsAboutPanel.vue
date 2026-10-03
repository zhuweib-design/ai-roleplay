<script setup lang="ts">

import Icon from '@/components/common/Icon.vue';
import { ref } from 'vue';;;;;;
import { t } from '@/i18n';;


const appVersion = ref('');
</script>

<template>
    <div>
      <section
        class="settings-section data-mgmt-section"
        aria-labelledby="about-title"
      >
        <header class="section-header">
          <h2 id="about-title" class="section-title">
            <Icon name="info" :size="16" />
            <span>{{ t('settingsView.categoryAbout') }}</span>
          </h2>
          <p class="section-hint">{{ t('settingsView.categoryAboutDesc') }}</p>
        </header>

        <div class="data-mgmt-row">
          <div class="data-mgmt-block">
            <h3 class="data-mgmt-subtitle">{{ t('app.name') }}</h3>
            <p class="data-mgmt-hint">
              {{ t('settings.versionLabel') }}：{{ appVersion || '—' }}
            </p>
            <p class="data-mgmt-hint">{{ t('settings.releaseSourceOnly') }}</p>
          </div>
        </div>
      </section>
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

/* ── 响应式 ── */
@media (max-width: 640px) {
  .settings-view {
    padding: 16px;
  }
  .settings-section {
    padding: 14px;
  }
  .theme-grid {
    grid-template-columns: 1fr;
  }
  .fontsize-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .profile-item {
    flex-direction: column;
    align-items: stretch;
  }
  .profile-actions {
    flex-wrap: wrap;
  }
  .action-btn {
    flex: 1;
    min-width: 0;
  }
  .meta-url {
    max-width: 100%;
  }
}

/* ── F13 数据管理 ── */
.data-mgmt-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.data-mgmt-row {
  padding: 14px 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--card-elevated, var(--card));
}

.data-mgmt-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.data-mgmt-subtitle {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--foreground);
}

.data-mgmt-hint {
  margin: 0;
  font-size: 12px;
  color: var(--muted-foreground);
  line-height: 1.5;
}
</style>
