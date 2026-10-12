<script setup lang="ts">

import Icon from '@/components/common/Icon.vue';
import { ref } from 'vue';;;;;;
import { t } from '@/i18n';;


const appVersion = ref('');
// D-B：/profile 的"本地用户"内容并入这里，登录面板的展开状态随之搬过来
const showLoginPanel = ref(false);
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

        <!--
          D-B 后半：原 /profile 页只有这一块内容（一个本地用户 + 一句"扮演身份在世界书"），
          却占一条路由、一个页头、一个返回按钮。搬进「关于」后 /profile 直接重定向到这里。
        -->
        <div class="data-mgmt-row account-row">
          <div class="data-mgmt-block">
            <div class="account-head">
              <h3 class="data-mgmt-subtitle">{{ t('profile.accountTitle') }}</h3>
              <button type="button" class="account-login-btn" @click="showLoginPanel = !showLoginPanel">
                <Icon name="lock-keyhole" :size="14" aria-hidden="true" />
                <span>{{ t('profile.login') }}</span>
              </button>
            </div>

            <div class="account-user">
              <span class="account-avatar" aria-hidden="true">U</span>
              <div class="account-info">
                <p class="account-name-line">
                  <span class="account-name">{{ t('profile.localUser') }}</span>
                  <span class="account-active">{{ t('profile.active') }}</span>
                </p>
                <p class="data-mgmt-hint">{{ t('profile.localUserHint') }}</p>
                <p class="data-mgmt-hint">{{ t('profile.worldProfileHint') }}</p>
              </div>
            </div>

            <p v-if="showLoginPanel" class="account-login-note" role="status">
              {{ t('profile.loginUnavailable') }}
              <button type="button" class="account-login-btn" @click="showLoginPanel = false">
                {{ t('profile.closeLogin') }}
              </button>
            </p>
          </div>
        </div>
      </section>
    </div>
</template>

<style scoped>

.settings-section {
  display: flex;
  flex-direction: column;
  gap: var(--gap-stack-lg);
  padding: var(--space-5);
  background: var(--card);
  border: var(--size-border-thin) solid var(--border);
  border-radius: var(--radius-lg);
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--gap-inline-md);
  flex-wrap: wrap;
}

.section-title {
  display: flex;
  align-items: center;
  gap: var(--gap-inline-sm);
  font-family: var(--font-display);
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--foreground);
  margin: 0;
}

.section-hint {
  font-size: var(--font-size-xs);
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
  gap: var(--gap-stack-lg);
}

.data-mgmt-row {
  /* 14px 不在 4px 阶上（半步只补了 6/10），整条 shorthand 保留字面量，不写半 token 半字面量 */
  padding: 14px 16px;
  border: var(--size-border-thin) solid var(--border);
  border-radius: var(--radius-md);
  background: var(--card-elevated, var(--card));
}

.data-mgmt-block {
  display: flex;
  flex-direction: column;
  gap: var(--gap-stack-sm);
}

.data-mgmt-subtitle {
  margin: 0;
  font-size: var(--font-size-md);
  font-weight: 600;
  color: var(--foreground);
}

.data-mgmt-hint {
  margin: 0;
  font-size: var(--font-size-xs);
  color: var(--muted-foreground);
  line-height: var(--line-height-normal);
}

/* ── 本地用户（原 /profile 唯一内容块）── */
.account-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--gap-inline-md);
  flex-wrap: wrap;
}

.account-user {
  display: flex;
  align-items: flex-start;
  gap: var(--gap-inline-md);
}

.account-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  /* 34px 不在头像阶（20/28/40/56/88）上、15px 不在字号阶（14/16）上，两处留字面量 */
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  border-radius: var(--radius-circle);
  background: var(--primary);
  color: var(--on-primary);
  font-size: 15px;
  font-weight: 600;
}

.account-info {
  display: flex;
  flex-direction: column;
  gap: var(--gap-stack-xs);
  min-width: 0;
}

.account-name-line {
  display: flex;
  align-items: center;
  gap: var(--gap-inline-sm);
  margin: 0;
}

.account-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--foreground);
}

.account-active {
  padding: var(--space-px) var(--space-2);
  border-radius: var(--radius-pill);
  background: var(--primary);
  color: var(--on-primary);
  font-size: var(--font-size-2xs);
}

.account-login-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1-5);
  padding: var(--space-1-5) var(--space-2-5);
  border: var(--size-border-thin) solid var(--border);
  border-radius: var(--radius-md);
  background: var(--card-elevated, var(--card));
  color: var(--foreground);
  font-size: var(--font-size-xs);
  cursor: pointer;
}

.account-login-note {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--gap-inline-md);
  margin: 0;
  padding-top: var(--space-3);
  border-top: var(--size-border-thin) solid var(--border);
  font-size: var(--font-size-xs);
  line-height: var(--line-height-normal);
  color: var(--muted-foreground);
}
</style>
