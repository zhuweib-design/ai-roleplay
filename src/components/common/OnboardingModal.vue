<script setup lang="ts">
/**
 * 首启欢迎（G 层改造后）：不再"说四句就消失"。
 *
 * 原实现只有 4 条功能描述 + 1 个按钮，点 X 也记为完成，全站再无重开入口
 * ——引导本该回答"第一步做什么"，却只介绍了产品有哪些页面。
 * 现在：说清最短路径 + 两个真实动作（配模型 / 打开任务清单），
 * 关闭只表示"欢迎看过了"，任务清单常驻可回。
 */
import Modal from '@/components/common/Modal.vue';
import { t } from '@/i18n';
import { markOnboardingDone } from '@/utils/onboarding';
import { useReadinessJump } from '@/composables/useReadinessJump';

defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>();

const { pushWithReturn } = useReadinessJump();

const steps = [
  { n: 1, textKey: 'onboarding.stepModel' },
  { n: 2, textKey: 'onboarding.stepCharacter' },
  { n: 3, textKey: 'onboarding.stepReply' },
] as const;

function close(): void {
  // 关闭 = "欢迎已看过"，不代表引导结束（任务清单仍在 rail 底部与 /more 顶部）
  markOnboardingDone();
  emit('update:modelValue', false);
}

function goModel(): void {
  markOnboardingDone();
  emit('update:modelValue', false);
  pushWithReturn({ name: 'settings', query: { cat: 'model' } });
}

function goGuide(): void {
  markOnboardingDone();
  emit('update:modelValue', false);
  pushWithReturn({ name: 'guide' });
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

    <ol class="onboarding-steps" role="list">
      <li v-for="step in steps" :key="step.n" class="onboarding-step">
        <span class="onboarding-step-no" aria-hidden="true">{{ step.n }}</span>
        <span class="onboarding-step-text">{{ t(step.textKey) }}</span>
      </li>
    </ol>

    <p class="onboarding-note">{{ t('onboarding.note') }}</p>

    <template #footer>
      <button type="button" class="modal-btn modal-confirm" data-rel-jump="onboarding-guide" @click="goGuide">
        {{ t('onboarding.openGuide') }}
      </button>
      <button type="button" class="modal-btn" data-rel-jump="onboarding-model" @click="goModel">
        {{ t('onboarding.configureModel') }}
      </button>
      <button type="button" class="modal-btn" @click="close">
        {{ t('common.close') }}
      </button>
    </template>
  </Modal>
</template>

<style scoped>
.onboarding-desc {
  margin: 0 0 12px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--muted-foreground);
}

.onboarding-steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.onboarding-step {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--foreground);
}

.onboarding-step-no {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--secondary);
  color: var(--primary-foreground, var(--background));
  font-size: 13px;
}

.onboarding-note {
  margin: 12px 0 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--muted-foreground);
}
</style>
