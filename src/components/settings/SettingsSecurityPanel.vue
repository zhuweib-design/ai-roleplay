<script setup lang="ts">
import { useSettingsStore } from '@/stores/settings';
import Icon from '@/components/common/Icon.vue';
import type { MasterPasswordMode } from '@/components/common/MasterPasswordModal.vue';
import { mpModalOpen, mpModalMode } from '@/utils/master-password-modal-state';
import { showToast } from '@/utils/toast-service';
import { t } from '@/i18n';;

const settings = useSettingsStore();

function lockApp(): void {
  settings.lock();
  showToast('info', t('settingsView.locked'));
}



function openMasterPasswordModal(mode: MasterPasswordMode): void {
  mpModalMode.value = mode;
  mpModalOpen.value = true;
}
</script>

<template>
    <div>
    <!-- AC20 安全：主密码管理 -->
    <section class="settings-section" aria-labelledby="security-section-title">
      <header class="section-header">
        <h2 id="security-section-title" class="section-title">
          <Icon name="gear" :size="18" aria-hidden="true" />
          <span>{{ t('settingsView.securitySection') }}</span>
        </h2>
      </header>
      <div class="extension-block">
        <h3 class="extension-title">{{ t('settingsView.encryptTitle') }}</h3>
        <p class="hint-text">
          {{ t('settingsView.encryptDesc') }}
        </p>

        <!-- 已设置主密码 -->
        <template v-if="settings.hasMasterPassword">
          <div class="form-row security-status">
            <Icon name="check" :size="14" />
            <span>{{ t('settingsView.mpSetStatus') }}</span>
          </div>
          <div class="form-row security-status" v-if="settings.isUnlocked">
            <Icon name="check" :size="14" />
            <span>{{ t('settingsView.sessionUnlocked') }}</span>
          </div>
          <div class="form-row security-status" v-else>
            <Icon name="alert-triangle" :size="14" />
            <span>{{ t('settingsView.sessionLocked') }}</span>
          </div>
          <div class="security-actions">
            <button
              v-if="!settings.isUnlocked"
              type="button"
              class="action-btn primary"
              @click="openMasterPasswordModal('unlock')"
            >
              <Icon name="eye" :size="14" />
              <span>{{ t('settingsView.unlock') }}</span>
            </button>
            <button
              type="button"
              class="action-btn"
              :disabled="!settings.isUnlocked"
              :aria-disabled="!settings.isUnlocked"
              @click="openMasterPasswordModal('change')"
            >
              <Icon name="pencil" :size="14" />
              <span>{{ t('settingsView.changeMp') }}</span>
            </button>
            <button
              v-if="settings.isUnlocked"
              type="button"
              class="action-btn"
              @click="lockApp"
            >
              <Icon name="stop" :size="14" />
              <span>{{ t('settingsView.lock') }}</span>
            </button>
          </div>
        </template>

        <!-- 未设置主密码 -->
        <template v-else>
          <div class="form-row security-status">
            <Icon name="alert-triangle" :size="14" />
            <span>{{ t('settingsView.encryptPlainHint') }}</span>
          </div>
          <div class="security-actions">
            <button
              type="button"
              class="action-btn primary"
              @click="openMasterPasswordModal('setup')"
            >
              <Icon name="gear" :size="14" />
              <span>{{ t('settingsView.setupMp') }}</span>
            </button>
          </div>
        </template>
      </div>
    </section>
</div>
</template>

<style scoped>

.settings-nav-item:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 1px;
}

.settings-nav-item.active {
  background: color-mix(in srgb, var(--primary) 14%, transparent);
  /* 激活项文字用最高亮度层级，保证 on 红色浅底 ≥4.5:1（WCAG AA） */
  color: var(--foreground);
  border: 1px solid color-mix(in srgb, var(--primary) 55%, transparent);
}

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

/* ── API Profile 管理 ── */
.add-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
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

.provider-badge[data-provider='custom'] {
  background: color-mix(in srgb, var(--primary) 20%, transparent);
  color: var(--primary-fg);
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

.action-btn.activate {
  background: var(--secondary);
  border-color: var(--secondary);
  color: var(--on-secondary);
}

@media (hover: hover) and (pointer: fine) {
  .action-btn.activate:hover {
    background: var(--tk-cyan-600);
    border-color: var(--tk-cyan-600);
  }
}

.action-btn.deactivate {
  background: var(--video-bg);
  color: var(--muted-foreground);
}

@media (hover: hover) and (pointer: fine) {
  .action-btn.delete:hover {
    border-color: var(--destructive);
    color: var(--destructive);
  }
}

.modal-save {
  background: var(--primary);
  border-color: var(--primary);
  color: var(--on-primary);
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

@media (prefers-reduced-motion: reduce) {
  .theme-card,
  .fontsize-card,
  .profile-item,
  .action-btn,
  .modal-btn {
    transition: none;
  }
}

.form-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 18px;
  height: 18px;
  background: var(--primary);
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid var(--card);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

.form-range::-moz-range-thumb {
  width: 18px;
  height: 18px;
  background: var(--primary);
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid var(--card);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

.bubble-preview-item.user-bubble {
  align-self: flex-end;
  background: var(--primary);
  color: var(--on-primary);
}
.extension-block {
  padding: 16px;
  margin-bottom: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--card-elevated);
}

.extension-title {
  margin: 0 0 12px;
  font-size: 14px;
  font-weight: 600;
  color: var(--foreground);
}

.extension-block .form-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
  font-size: 13px;
  color: var(--foreground);
}

.extension-block .form-row > span {
  min-width: 100px;
  color: var(--muted-foreground);
}

.extension-block .form-row input[type='checkbox'] {
  margin: 0;
}

.extension-block .form-row input[type='range'] {
  flex: 1;
  max-width: 200px;
}

.extension-block .form-row input[type='number'],
.extension-block .form-row input[type='password'],
.extension-block .form-row select {
  flex: 1;
  max-width: 240px;
  padding: 6px 10px;
  font-size: 13px;
  background: var(--background);
  color: var(--foreground);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.extension-block .hint-text {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--muted-foreground);
  line-height: 1.5;
}

/* AC20 安全区块 */
.security-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--foreground);
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--secondary) 5%, transparent);
}

.security-status svg {
  color: var(--secondary-text);
  flex-shrink: 0;
}

.security-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.status-badge[data-status='loaded'] {
  background: color-mix(in srgb, var(--primary) 16%, transparent);
  color: var(--primary-fg);
}

.profile-item.is-loaded {
  border-color: var(--primary);
  background: color-mix(in srgb, var(--primary) 6%, transparent);
}

.status-dot.ok {
  background: var(--primary);
}

.progress-fill {
  height: 100%;
  border-radius: var(--radius-pill);
  background: var(--primary);
  transition: width 0.2s ease;
}

.action-btn.danger {
  color: var(--tk-red-500, #ef4444);
  border-color: color-mix(in srgb, var(--tk-red-500, #ef4444) 45%, transparent);
}

@media (hover: hover) and (pointer: fine) {
  .action-btn.danger:hover:not(:disabled) {
    background: color-mix(in srgb, var(--tk-red-500, #ef4444) 12%, transparent);
  }
}

@media (max-width: 640px) {
  /* iOS 聚焦防放大：可编辑控件字号须 ≥16px（I-7 / D1） */
  .field-input,
  .form-textarea,
  .custom-css-textarea,
  .data-mgmt-select,
  .extension-block .form-row input[type='number'],
  .extension-block .form-row input[type='password'],
  .extension-block .form-row select,
  .profile-input {
    font-size: 16px;
  }
}
</style>
