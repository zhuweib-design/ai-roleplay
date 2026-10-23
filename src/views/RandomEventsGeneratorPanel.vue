<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRandomEventsStore } from '@/stores/random-events';
import Icon from '@/components/common/Icon.vue';
import { t } from '@/i18n';
import { flushStoreMessages } from './random-events-shared';

const store = useRandomEventsStore();
const emit = defineEmits<{ notify: [type: 'info' | 'success' | 'error', message: string] }>();
const notify = (type: 'info' | 'success' | 'error', message: string): void =>
  emit('notify', type, message);

// ── 生成器配置 ──
const generatorForm = ref({
  enabled: store.generatorConfig.enabled,
  defaultProbability: store.generatorConfig.defaultProbability,
  maxPerTurn: store.generatorConfig.maxPerTurn,
  globalCooldownMs: store.generatorConfig.globalCooldownMs,
  feedbackAdjustStep: store.generatorConfig.feedbackAdjustStep,
});

function saveGeneratorConfig(): void {
  store.updateGeneratorConfig({
    enabled: generatorForm.value.enabled,
    defaultProbability: generatorForm.value.defaultProbability,
    maxPerTurn: generatorForm.value.maxPerTurn,
    globalCooldownMs: generatorForm.value.globalCooldownMs,
    feedbackAdjustStep: generatorForm.value.feedbackAdjustStep,
  });
  notify('success', t('re.configSaved'));
  flushStoreMessages(store, notify);
}

// 原宿主持有 generatorForm 时由 toggleGenerator 直接同步；下放后改经 store 响应
watch(
  () => store.generatorConfig.enabled,
  (v) => {
    generatorForm.value.enabled = v;
  }
);
</script>

<template>
  <div>
    <!-- ── 生成器配置 ── -->
    <section
      id="panel-generator"
      role="tabpanel"
      aria-labelledby="tab-generator"
      class="panel"
    >
      <div class="form-section">
        <h2 class="section-title">{{ t('re.generatorTitle') }}</h2>
        <p class="section-hint">{{ t('re.generatorHint') }}</p>

        <div class="form-grid">
          <div class="form-row">
            <label for="gen-enabled">
              <input
                id="gen-enabled"
                v-model="generatorForm.enabled"
                type="checkbox"
              />
              <span>{{ t('re.enableGenerator') }}</span>
            </label>
          </div>

          <div class="form-row">
            <label for="gen-prob">{{ t('re.defaultProb') }}</label>
            <input
              id="gen-prob"
              v-model.number="generatorForm.defaultProbability"
              type="number"
              min="0"
              max="100"
              step="1"
            />
            <small class="form-hint">{{ t('re.defaultProbHint') }}</small>
          </div>

          <div class="form-row">
            <label for="gen-maxperturn">{{ t('re.maxPerTurn') }}</label>
            <input
              id="gen-maxperturn"
              v-model.number="generatorForm.maxPerTurn"
              type="number"
              min="1"
              max="5"
              step="1"
            />
            <small class="form-hint">{{ t('re.maxPerTurnHint') }}</small>
          </div>

          <div class="form-row">
            <label for="gen-cooldown">{{ t('re.globalCooldown') }}</label>
            <input
              id="gen-cooldown"
              v-model.number="generatorForm.globalCooldownMs"
              type="number"
              min="0"
              step="1000"
            />
            <small class="form-hint">{{ t('re.globalCooldownHint') }}</small>
          </div>

          <div class="form-row">
            <label for="gen-step">{{ t('re.feedbackStep') }}</label>
            <input
              id="gen-step"
              v-model.number="generatorForm.feedbackAdjustStep"
              type="number"
              min="1"
              max="20"
              step="1"
            />
            <small class="form-hint">{{ t('re.feedbackStepHint') }}</small>
          </div>
</div>

        <div class="form-actions">
          <button type="button" class="btn primary" @click="saveGeneratorConfig">
            <Icon name="save" :size="16" aria-hidden="true" />
            {{ t('re.saveConfig') }}
          </button>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* 生成器配置表单 */
.form-section {
  max-width: 720px;
}

.section-title {
  margin: 0 0 4px 0;
  font-size: 16px;
  color: var(--foreground);
}

.section-hint {
  margin: 0 0 16px 0;
  color: var(--muted-foreground);
  font-size: 13px;
}

.form-grid {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.form-row label {
  font-size: 13px;
  color: var(--foreground);
  display: flex;
  align-items: center;
  gap: 6px;
}

.form-row input[type='number'] {
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--card);
  color: var(--foreground);
  font-size: 13px;
  width: 200px;
}

.form-row input[type='checkbox'] {
  margin: 0;
}

.form-hint {
  font-size: 11px;
  color: var(--muted-foreground);
}


.form-actions {
  margin-top: 20px;
  display: flex;
  gap: 8px;
}
@media (max-width: 640px) {
  /* iOS 聚焦防放大：可编辑控件字号须 ≥16px（I-7 / D1） */
  .form-row input[type='number'] {
    font-size: 16px;
  }
}
</style>
