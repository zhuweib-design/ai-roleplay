<script setup lang="ts">
/** 个人中心只管理真实账户；世界内昵称和角色资料位于世界书。 */
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { usePersonaStore } from '@/stores/persona';
import Icon from '@/components/common/Icon.vue';
import { t } from '@/i18n';

const router = useRouter();
const personaStore = usePersonaStore();
const showLoginPanel = ref(false);
const hasLocalAccount = computed(() => personaStore.personas.length > 0);

function goBack(): void {
  if (window.history.state?.back) void router.back();
  else void router.push({ name: 'chat' });
}

function toggleLoginPanel(): void {
  showLoginPanel.value = !showLoginPanel.value;
}
</script>

<template>
  <main id="main-content" class="profile-view tk-scroll" :aria-label="t('profile.aria')" tabindex="-1">
    <header class="profile-header">
      <button type="button" class="profile-back-btn" :aria-label="t('profile.backAria')" @click="goBack">
        <Icon name="arrow-left" :size="18" aria-hidden="true" />
        <span>{{ t('profile.back') }}</span>
      </button>
      <h1 class="profile-title">
        <Icon name="user" :size="22" aria-hidden="true" />
        <span>{{ t('profile.title') }}</span>
      </h1>
      <p class="profile-subtitle">{{ t('profile.subtitle') }}</p>
    </header>

    <section class="settings-section profile-card-section" aria-labelledby="account-title">
      <header class="section-header">
        <h2 id="account-title" class="section-title">
          <Icon name="user" :size="18" aria-hidden="true" />
          <span>{{ t('profile.accountTitle') }}</span>
        </h2>
        <div class="identity-header-actions">
          <span class="account-status">{{ t('profile.localUser') }}</span>
          <button type="button" class="action-btn primary" @click="toggleLoginPanel">
            <Icon name="lock-keyhole" :size="14" aria-hidden="true" />
            <span>{{ t('profile.login') }}</span>
          </button>
        </div>
      </header>

      <div class="profile-card">
        <div class="profile-avatar" aria-hidden="true">U</div>
        <div class="profile-info">
          <div class="profile-name-row">
            <span class="profile-name">{{ t('profile.localUser') }}</span>
            <span v-if="hasLocalAccount" class="badge-active">{{ t('profile.active') }}</span>
          </div>
          <p class="profile-description">{{ t('profile.localUserHint') }}</p>
          <p class="account-hint">{{ t('profile.worldProfileHint') }}</p>
        </div>
      </div>

      <div v-if="showLoginPanel" class="login-panel" role="status">
        <p>{{ t('profile.loginUnavailable') }}</p>
        <button type="button" class="action-btn" @click="toggleLoginPanel">{{ t('profile.closeLogin') }}</button>
      </div>
    </section>
  </main>
</template>

<style scoped>
.profile-view { padding: 24px; max-width: 880px; margin: 0 auto; width: 100%; }
.profile-header { margin-bottom: 24px; }
.profile-back-btn, .action-btn { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
.profile-back-btn { margin-bottom: 12px; padding: 8px 12px; background: var(--card-elevated); border: 1px solid var(--border); border-radius: var(--radius-md); color: var(--foreground); }
.profile-title { display: flex; align-items: center; gap: 8px; margin: 0 0 4px; font-size: 24px; color: var(--foreground); }
.profile-subtitle, .account-hint, .login-panel p { margin: 0; color: var(--muted-foreground); font-size: 13px; line-height: 1.5; }
.settings-section { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 20px; }
.section-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
.section-title { display: flex; align-items: center; gap: 8px; margin: 0; font-size: 16px; color: var(--foreground); }
.identity-header-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.account-status { color: var(--muted-foreground); font-size: 12px; }
.action-btn { padding: 7px 10px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--card-elevated); color: var(--foreground); }
.action-btn.primary { background: var(--primary); color: var(--on-primary); border-color: var(--primary); }
.profile-card { display: flex; gap: 16px; align-items: flex-start; }
.profile-avatar { width: 64px; height: 64px; flex: 0 0 auto; border-radius: 50%; background: var(--primary); color: var(--on-primary); display: flex; align-items: center; justify-content: center; font-size: 28px; font-weight: 600; }
.profile-info { min-width: 0; flex: 1; }
.profile-name-row { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.profile-name { font-size: 20px; font-weight: 600; color: var(--foreground); }
.profile-description { margin: 0 0 8px; color: var(--muted-foreground); line-height: 1.6; }
.badge-active { padding: 2px 8px; border-radius: var(--radius-pill); background: var(--primary); color: var(--on-primary); font-size: 11px; }
.login-panel { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border); }
</style>
