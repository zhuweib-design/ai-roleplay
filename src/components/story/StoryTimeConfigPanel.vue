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
  getStrategyLabel as getTimeStrategyLabel,
  type StoryTimeUnit,
  MIN_RATIO_EVERY,
  MAX_RATIO_EVERY,
  MAX_CUSTOM_UNIT_NAME_LENGTH,
} from '@core/story-time';
import type { StoryAnalysisResult } from '@/core/story-types';
import Icon from '@/components/common/Icon.vue';
import Toast from '@/components/common/Toast.vue';

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

function handleAdvanceTime(storyId: string) {
  const formatted = store.advanceStoryTime(storyId);
  if (formatted) {
    showToast('success', `故事时间已推进至：${formatted}`);
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
    showToast('success', `已绑定到角色：${characterStore.characters.find((c) => c.id === characterId)?.name}`);
  } else {
    showToast('info', '已解除角色绑定');
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
                故事时间配置
              </h4>

              <!-- 绑定到角色 -->
              <div class="form-row">
                <label for="bindCharacter" class="form-label">绑定到角色</label>
                <select
                  id="bindCharacter"
                  class="form-select"
                  :value="boundCharacterId ?? ''"
                  @change="handleBindCharacter(($event.target as HTMLSelectElement).value)"
                >
                  <option value="">不绑定（时间系统不生效）</option>
                  <option
                    v-for="c in characterOptions"
                    :key="c.id"
                    :value="c.id"
                  >
                    {{ c.name }}
                  </option>
                </select>
                <p class="form-hint">
                  绑定后，该角色的对话将自动注入故事主角身份与时间上下文，并按策略推进时间
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
                  <span>启用时间系统</span>
                </label>
                <span v-if="formattedStoryTime" class="time-current-value">
                  当前：{{ formattedStoryTime }}
                </span>
              </div>

              <!-- 时间配置表单（仅启用时显示） -->
              <div v-if="story.timeConfig?.enabled" class="time-config-form">
                <!-- 时间策略 -->
                <fieldset class="import-fieldset">
                  <legend>时间推进策略</legend>
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
                      <span>{{ getTimeStrategyLabel(s) }}</span>
                    </label>
                  </div>
                </fieldset>

                <!-- 时间单位 -->
                <div class="form-row">
                  <label class="form-label">时间单位</label>
                  <select
                    class="form-select"
                    :value="story.timeConfig?.unit ?? 'day'"
                    @change="store.setStoryTimeConfig(story.id, { unit: ($event.target as HTMLSelectElement).value as StoryTimeUnit })"
                  >
                    <option value="hour">小时</option>
                    <option value="day">天</option>
                    <option value="week">周</option>
                    <option value="custom">自定义</option>
                  </select>
                </div>

                <!-- 自定义单位名 -->
                <div v-if="story.timeConfig?.unit === 'custom'" class="form-row">
                  <label class="form-label">
                    自定义单位名（最多 {{ MAX_CUSTOM_UNIT_NAME_LENGTH }} 字符）
                  </label>
                  <input
                    type="text"
                    class="form-input"
                    :value="story.timeConfig?.customUnitName ?? ''"
                    :maxlength="MAX_CUSTOM_UNIT_NAME_LENGTH"
                    placeholder="如：月、年、章"
                    @input="store.setStoryTimeConfig(story.id, { customUnitName: ($event.target as HTMLInputElement).value })"
                  />
                </div>

                <!-- 比值 N（ratio 策略时显示） -->
                <div v-if="story.timeConfig?.strategy === 'ratio'" class="form-row">
                  <label class="form-label">
                    每 N 轮推进一次（{{ MIN_RATIO_EVERY }}-{{ MAX_RATIO_EVERY }}）
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
                  <label class="form-label">起始时间值</label>
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
                    手动推进
                  </button>
                  <button
                    type="button"
                    class="btn btn-secondary btn-sm"
                    @click="handleResetTime(story.id)"
                  >
                    <Icon name="refresh-cw" :size="12" />
                    重置
                  </button>
                </div>

                <!-- 使用提示 -->
                <p class="form-hint">
                  在对话中输入 <code>/time advance</code> 可手动推进时间，
                  <code>/time status</code> 查看当前时间，
                  <code>/time set N</code> 直接设置时间值
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
