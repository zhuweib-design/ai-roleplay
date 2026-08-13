<script setup lang="ts">
/**
 * StoryTimeConfigPanel — 故事引擎「故事时间配置」面板（P2-7 拆分）
 *
 * 自 StoryEngineView.vue 迁出：F16.4 时间策略/单位/比值/绑定角色/手动推进。
 * 通过 prop 接收 story（父组件 v-for 循环变量）。
 */
import { computed, ref } from 'vue';
import { useStoryStore } from '@/stores/story';
import { useCharacterStore } from '@/stores/character';
import {
  type StoryTimeUnit,
  MIN_RATIO_EVERY,
  MAX_RATIO_EVERY,
  MAX_CUSTOM_UNIT_NAME_LENGTH,
} from '@core/story-time';
import type { StoryAnalysisResult } from '@/core/story-types';
import Icon from '@/components/common/Icon.vue';
import Toast from '@/components/common/Toast.vue';
import { t } from '@/i18n';

const props = defineProps<{ story: StoryAnalysisResult }>();

const store = useStoryStore();
const characterStore = useCharacterStore();

/** 可选的角色列表（用于"绑定到角色"下拉） */
const characterOptions = computed(() => characterStore.characters);

/** 当前故事绑定的角色 ID */
const boundCharacterId = computed(() => {
  // 查找 storyId 等于当前选中故事的角色
  const story = props.story;
  if (!story) return null;
  return characterStore.characters.find((c) => c.storyId === story.id)?.id ?? null;
});

/** 策略标签（i18n，覆盖 core 的中文标签） */
const strategyLabelMap: Record<string, string> = {
  realtime: t('storyTime.strategyRealtime'),
  ratio: t('storyTime.strategyRatio'),
  manual: t('storyTime.strategyManual'),
};
function timeStrategyLabel(s: string): string {
  return strategyLabelMap[s] ?? s;
}

function handleAdvanceTime(storyId: string) {
  const formatted = store.advanceStoryTime(storyId);
  if (formatted) {
    showToast('success', t('storyTime.advanced', { time: formatted }));
  } else if (store.lastError) {
    showToast('error', store.lastError);
  }
}

/** 重置时间 */
function handleResetTime(storyId: string) {
  const ok = store.resetStoryTime(storyId);
  if (ok) {
    if (store.lastInfo) showToast('success', store.lastInfo);
  } else if (store.lastError) {
    showToast('error', store.lastError);
  }
}

/** 绑定故事到角色（设置 character.storyId） */
function handleBindCharacter(characterId: string) {
  const story = props.story;
  if (!story) return;
  // 先清除之前绑定的角色
  for (const c of characterStore.characters) {
    if (c.storyId === story.id) {
      characterStore.updateCharacter(c.id, { storyId: null });
    }
  }
  // 绑定新角色
  if (characterId) {
    characterStore.updateCharacter(characterId, { storyId: story.id });
    showToast('success', t('storyTime.bound', { name: characterStore.characters.find((c) => c.id === characterId)?.name ?? '' }));
  } else {
    showToast('info', t('storyTime.unbound'));
  }
}

const formattedStoryTime = computed(() => {
  const story = props.story;
  if (!story) return '';
  return store.getFormattedStoryTime(story.id);
});


// ── Toast（自包含） ──
const toastOpen = ref(false);
const toastType = ref<'info' | 'success' | 'error'>('info');
const toastMessage = ref('');

function showToast(type: 'info' | 'success' | 'error', message: string) {
  toastType.value = type;
  toastMessage.value = message;
  toastOpen.value = true;
}
</script>

<template>
            <!-- F16.4 故事时间配置 -->
            <section v-if="story.status === 'completed'" class="detail-section time-section">
              <h4 class="detail-title">
                <Icon name="calendar-check" :size="14" />
                {{ t('storyTime.title') }}
              </h4>

              <!-- 绑定到角色 -->
              <div class="form-row">
                <label for="bindCharacter" class="form-label">{{ t('storyTime.bindCharacter') }}</label>
                <select
                  id="bindCharacter"
                  class="form-select"
                  :value="boundCharacterId ?? ''"
                  @change="handleBindCharacter(($event.target as HTMLSelectElement).value)"
                >
                  <option value="">{{ t('storyTime.noBind') }}</option>
                  <option
                    v-for="c in characterOptions"
                    :key="c.id"
                    :value="c.id"
                  >
                    {{ c.name }}
                  </option>
                </select>
                <p class="form-hint">
                  {{ t('storyTime.bindHint') }}
                </p>
              </div>

              <!-- 启用开关 -->
              <div class="form-row form-row-inline">
                <label class="form-label-inline">
                  <input
                    type="checkbox"
                    :checked="story.timeConfig?.enabled ?? false"
                    @change="store.toggleStoryTime(story.id, ($event.target as HTMLInputElement).checked)"
                  />
                  <span>{{ t('storyTime.enable') }}</span>
                </label>
                <span v-if="formattedStoryTime" class="time-current-value">
                  {{ t('storyTime.current', { time: formattedStoryTime }) }}
                </span>
              </div>

              <!-- 时间配置表单（仅启用时显示） -->
              <div v-if="story.timeConfig?.enabled" class="time-config-form">
                <!-- 时间策略 -->
                <fieldset class="import-fieldset">
                  <legend>{{ t('storyTime.strategy') }}</legend>
                  <div class="strategy-options">
                    <label
                      v-for="s in (['realtime', 'ratio', 'manual'] as const)"
                      :key="s"
                      class="strategy-option"
                    >
                      <input
                        type="radio"
                        name="timeStrategy"
                        :value="s"
                        :checked="story.timeConfig?.strategy === s"
                        @change="store.setStoryTimeConfig(story.id, { strategy: s })"
                      />
                      <span>{{ timeStrategyLabel(s) }}</span>
                    </label>
                  </div>
                </fieldset>

                <!-- 时间单位 -->
                <div class="form-row">
                  <label class="form-label">{{ t('storyTime.unit') }}</label>
                  <select
                    class="form-select"
                    :value="story.timeConfig?.unit ?? 'day'"
                    @change="store.setStoryTimeConfig(story.id, { unit: ($event.target as HTMLSelectElement).value as StoryTimeUnit })"
                  >
                    <option value="hour">{{ t('storyTime.unitHour') }}</option>
                    <option value="day">{{ t('storyTime.unitDay') }}</option>
                    <option value="week">{{ t('storyTime.unitWeek') }}</option>
                    <option value="custom">{{ t('storyTime.unitCustom') }}</option>
                  </select>
                </div>

                <!-- 自定义单位名 -->
                <div v-if="story.timeConfig?.unit === 'custom'" class="form-row">
                  <label class="form-label">
                    {{ t('storyTime.customUnitName', { max: MAX_CUSTOM_UNIT_NAME_LENGTH }) }}
                  </label>
                  <input
                    type="text"
                    class="form-input"
                    :value="story.timeConfig?.customUnitName ?? ''"
                    :maxlength="MAX_CUSTOM_UNIT_NAME_LENGTH"
                    :placeholder="t('storyTime.customUnitPlaceholder')"
                    @input="store.setStoryTimeConfig(story.id, { customUnitName: ($event.target as HTMLInputElement).value })"
                  />
                </div>

                <!-- 比值 N（ratio 策略时显示） -->
                <div v-if="story.timeConfig?.strategy === 'ratio'" class="form-row">
                  <label class="form-label">
                    {{ t('storyTime.ratioEvery', { min: MIN_RATIO_EVERY, max: MAX_RATIO_EVERY }) }}
                  </label>
                  <input
                    type="number"
                    class="form-input"
                    :value="story.timeConfig?.ratioEvery ?? 3"
                    :min="MIN_RATIO_EVERY"
                    :max="MAX_RATIO_EVERY"
                    @change="store.setStoryTimeConfig(story.id, { ratioEvery: parseInt(($event.target as HTMLInputElement).value, 10) || 3 })"
                  />
                </div>

                <!-- 起始值 -->
                <div class="form-row">
                  <label class="form-label">{{ t('storyTime.startValue') }}</label>
                  <input
                    type="number"
                    class="form-input"
                    :value="story.timeConfig?.startValue ?? 1"
                    :min="0"
                    @change="store.setStoryTimeConfig(story.id, { startValue: parseInt(($event.target as HTMLInputElement).value, 10) || 0 })"
                  />
                </div>

                <!-- 操作按钮 -->
                <div class="time-actions">
                  <button
                    type="button"
                    class="btn btn-secondary btn-sm"
                    @click="handleAdvanceTime(story.id)"
                  >
                    <Icon name="plus" :size="12" />
                    {{ t('storyTime.advance') }}
                  </button>
                  <button
                    type="button"
                    class="btn btn-secondary btn-sm"
                    @click="handleResetTime(story.id)"
                  >
                    <Icon name="refresh-cw" :size="12" />
                    {{ t('storyTime.reset') }}
                  </button>
                </div>

                <!-- 使用提示 -->
                <p class="form-hint">
                  {{ t('storyTime.usageHint') }}
                </p>
              </div>
            </section>
    <!-- 自包含 Toast -->
    <Toast
      v-model="toastOpen"
      :message="toastMessage"
      :type="toastType"
    />
</template>

<style scoped>
.time-section {
  border: 1px solid color-mix(in srgb, var(--accent-blue) 25%, var(--border));
  border-radius: var(--radius-md);
  padding: 10px 12px;
  background: color-mix(in srgb, var(--accent-blue) 4%, var(--card));
}

</style>
