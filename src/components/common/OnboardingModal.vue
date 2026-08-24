<script setup lang="ts">
import Modal from '@/components/common/Modal.vue';
import Icon from '@/components/common/Icon.vue';
import type { IconName } from '@/components/common/icons';
import { t, type MessageKey } from '@/i18n';
import { markOnboardingDone } from '@/utils/onboarding';

// P2-7 新手引导(pre-launch 全检 P2 建议): 首次启动展示核心功能指引
defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>();

const features = [
  { titleKey: 'onboarding.featureCharTitle', descKey: 'onboarding.featureCharDesc', icon: 'user' },
  { titleKey: 'onboarding.featureChatTitle', descKey: 'onboarding.featureChatDesc', icon: 'chat-circle' },
  { titleKey: 'onboarding.featureLoreTitle', descKey: 'onboarding.featureLoreDesc', icon: 'book-open' },
  { titleKey: 'onboarding.featureApiTitle', descKey: 'onboarding.featureApiDesc', icon: 'gear' },
] as const satisfies ReadonlyArray<{ titleKey: MessageKey; descKey: MessageKey; icon: IconName }>;

function close(): void {
  emit('update:modelValue', false);
}

function finish(): void {
  markOnboardingDone();
  close();
}
</script>

<template>
  <Modal
    :model-value="modelValue"
    :title="t('onboarding.title')"
    :aria-label="t('onboarding.title')"
    @update:model-value="close"
  >
    <p class="onboarding-desc">{{ t('onboarding.desc') }}</p>
    <ul class="onboarding-features">
      <li v-for="f in features" :key="f.titleKey" class="onboarding-feature">
        <span class="onboarding-icon">
          <Icon :name="f.icon" :size="18" aria-hidden="true" />
        </span>
        <div class="onboarding-feature-text">
          <strong>{{ t(f.titleKey) }}</strong>
          <p>{{ t(f.descKey) }}</p>
        </div>
      </li>
    </ul>
    <template #footer>
      <button type="button" class="modal-btn modal-confirm" @click="finish">
        {{ t('onboarding.start') }}
      </button>
    </template>
  </Modal>
</template>

<style scoped>
.onboarding-desc {
  margin: 0 0 var(--spacing-md);
  color: var(--text-body);
  font-size: 13px;
  line-height: 1.6;
}

.onboarding-features {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.onboarding-feature {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  background: var(--card-elevated);
  border: 1px solid var(--border);
}

.onboarding-icon {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--primary) 14%, transparent);
  color: var(--primary-fg);
}

.onboarding-feature-text strong {
  display: block;
  font-size: 13px;
  color: var(--text-heading);
  margin-bottom: 2px;
}

.onboarding-feature-text p {
  margin: 0;
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.5;
}
</style>
