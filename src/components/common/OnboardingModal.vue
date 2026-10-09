<script setup lang="ts">
/**
 * 首启欢迎（G 层改造后）：不再"说四句就消失"。
 *
 * 原实现只有 4 条功能描述 + 1 个按钮，点 X 也记为完成，全站再无重开入口
 * ——引导本该回答"第一步做什么"，却只介绍了产品有哪些页面。
 * 现在：说清最短路径 + 两个真实动作（配模型 / 打开任务清单），
 * 关闭只表示"欢迎看过了"，任务清单常驻可回。
 */
import { computed } from 'vue';
import Modal from '@/components/common/Modal.vue';
import Icon from '@/components/common/Icon.vue';
import { t, type MessageKey } from '@/i18n';
import { markOnboardingDone } from '@/utils/onboarding';
import { useReadinessJump } from '@/composables/useReadinessJump';
import { useGuidedTasks } from '@/core/guided-tasks';

defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>();

const { pushWithReturn } = useReadinessJump();
const tasks = useGuidedTasks();

/**
 * 欢迎窗的三步与任务卡的前三条是同一件事，所以**完成态只认注册表一处**。
 * 文案仍留在这里：第一句要顺带说"密钥只留在本机"，那是首启特有的安抚，
 * 任务卡里没有义务讲。但判据不再重写一遍——否则恢复过备份、或只清掉
 * localStorage 的人会被这扇窗要求从头再配一次模型。
 */
const steps: Array<{ taskId: string; textKey: MessageKey }> = [
  { taskId: 't1-model', textKey: 'onboarding.stepModel' },
  { taskId: 't2-character', textKey: 'onboarding.stepCharacter' },
  { taskId: 't3-first-reply', textKey: 'onboarding.stepReply' },
];

function doneOf(taskId: string): boolean {
  return tasks.value.find((task) => task.id === taskId)?.complete === true;
}

const allDone = computed(() => steps.every((step) => doneOf(step.taskId)));

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

function goChat(): void {
  markOnboardingDone();
  emit('update:modelValue', false);
  pushWithReturn({ name: 'chat' });
}
</script>

<template>
  <Modal
    :model-value="modelValue"
    :title="t('onboarding.title')"
    :aria-label="t('onboarding.title')"
    @update:model-value="close"
  >
    <p class="onboarding-desc">{{ allDone ? t('onboarding.descDone') : t('onboarding.desc') }}</p>

    <ol class="onboarding-steps" role="list">
      <li
        v-for="(step, idx) in steps"
        :key="step.taskId"
        class="onboarding-step"
        :class="{ done: doneOf(step.taskId) }"
      >
        <span class="onboarding-step-no" aria-hidden="true">{{ idx + 1 }}</span>
        <span class="onboarding-step-text">{{ t(step.textKey) }}</span>
        <span v-if="doneOf(step.taskId)" class="onboarding-step-state">
          <Icon name="check" :size="12" aria-hidden="true" />
          <span>{{ t('prereq.done') }}</span>
        </span>
      </li>
    </ol>

    <p class="onboarding-note">{{ t('onboarding.note') }}</p>

    <template #footer>
      <!-- 三步都做完了还递一颗"现在配模型"，等于当着做完的人说他没做完 -->
      <button
        v-if="allDone"
        type="button"
        class="modal-btn modal-confirm"
        data-rel-jump="onboarding-chat"
        @click="goChat"
      >
        {{ t('onboarding.startChat') }}
      </button>
      <button v-else type="button" class="modal-btn modal-confirm" data-rel-jump="onboarding-guide" @click="goGuide">
        {{ t('onboarding.openGuide') }}
      </button>
      <button v-if="!allDone" type="button" class="modal-btn" data-rel-jump="onboarding-model" @click="goModel">
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

/* 完成态的排版与任务卡的 StepFlow 清单一致（灰字 + 删除线 + 右侧标记） */
.onboarding-step.done .onboarding-step-text {
  color: var(--muted-foreground);
  text-decoration: line-through;
}

.onboarding-step-state {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  color: var(--secondary);
  font-size: 12px;
}

.onboarding-note {
  margin: 12px 0 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--muted-foreground);
}
</style>
