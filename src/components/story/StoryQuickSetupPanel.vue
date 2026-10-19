<script setup lang="ts">
/**
 * StoryQuickSetupPanel — 一键生成可玩设定（T-08，R1-2 从 StoryEngineView 拆出）
 *
 * 目标：10 分钟内从空白到可玩场景 —— 先按模板生成世界书，再生成同风格的主角卡。
 * 状态（模板 / 运行中 / 结果）只服务这一块，留在视图里就是三份无关的 ref。
 *
 * 源素材优先取"当前展开的那份故事分析"，否则取最近完成的一份（原逻辑不变）。
 *
 * 补位说明：这个按钮用的是视图页头的 `.header-btn` 样式。组件拆分后父级 scoped
 * 规则到不了子组件内部，所以这里原样复制了一份 `.header-btn` / `.btn-label`
 * （含 ≤640 的收紧规则），声明值一字未改。
 */
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { t } from '@/i18n';
import Icon from '@/components/common/Icon.vue';
import { useStoryStore } from '@/stores/story';
import { useSettingsStore } from '@/stores/settings';
import { useLorebookStore } from '@/stores/lorebook';
import { useCharacterStore } from '@/stores/character';
import { CHARACTER_TEMPLATES, type CharacterTemplateId } from '@core/character-generator';
import { buildSourceContext } from '@core/story-analyzer';
import type { ToastKind } from '@/composables/useStoryGeneration';

const props = defineProps<{
  /** 当前展开的故事 id（用作源素材优先项） */
  expandedStoryId: string | null;
  /** 分析进行中：一键生成按钮同时禁用（与拆分前一致） */
  isAnalyzing: boolean;
}>();

const emit = defineEmits<{
  notify: [type: ToastKind, message: string];
}>();

const router = useRouter();
const store = useStoryStore();
const settingsStore = useSettingsStore();
const lorebookStore = useLorebookStore();
const characterStore = useCharacterStore();

const quickGenTemplate = ref<CharacterTemplateId>('fantasy');
const quickGenRunning = ref(false);
const quickGenResult = ref<{ worldId: string | null; charId: string | null } | null>(null);

const hasApiProfile = computed(() => settingsStore.activeApiProfileId !== null);

/**
 * 一键生成可玩设定：依次生成世界书与主角角色卡
 * 目标：10 分钟内从空白到可玩场景
 */
async function handleQuickSetup(): Promise<void> {
  if (quickGenRunning.value) return;
  if (!hasApiProfile.value) {
    emit('notify', 'error', t('story.quickApiRequired'));
    return;
  }
  quickGenRunning.value = true;
  quickGenResult.value = null;
  try {
    // T-08 阶段二：优先用当前展开故事的分析结果作为源素材上下文
    const stories = store.stories;
    const sourceStory =
      (props.expandedStoryId
        ? stories.find((s) => s.id === props.expandedStoryId)
        : null) ??
      [...stories]
        .filter((s) => s.status === 'completed')
        .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))[0] ??
      null;
    const sourceContext = sourceStory ? buildSourceContext(sourceStory) : undefined;

    // 1. 生成世界书（默认全局作用域）
    const worldId = await lorebookStore.generateRandomWorldbook(
      quickGenTemplate.value,
      'global',
      sourceContext
    );
    // 2. 生成主角角色卡（同模板风格）
    const charId = await characterStore.generateRandomCharacter(
      quickGenTemplate.value,
      sourceContext
    );
    quickGenResult.value = { worldId, charId };
    if (worldId && charId) {
      emit('notify', 'success', t('story.quickDone'));
    } else {
      emit('notify', 'error', t('story.quickPartial'));
    }
  } catch (err) {
    emit('notify', 'error', t('story.quickFailed', { error: err instanceof Error ? err.message : String(err) }));
  } finally {
    quickGenRunning.value = false;
  }
}
</script>

<template>
  <section class="quick-setup-panel" :aria-label="t('story.quickAria')">
    <div class="quick-setup-head">
      <Icon name="book-open" :size="16" />
      <span class="quick-setup-title">{{ t('story.quickTitle') }}</span>
      <span class="quick-setup-hint">{{ t('story.quickHint') }}</span>
    </div>
    <div class="quick-setup-body">
      <div class="template-pills" role="radiogroup" :aria-label="t('story.quickTemplateAria')">
        <button
          v-for="tpl in CHARACTER_TEMPLATES"
          :key="tpl.id"
          type="button"
          role="radio"
          :aria-checked="quickGenTemplate === tpl.id"
          class="template-pill"
          :class="{ active: quickGenTemplate === tpl.id }"
          v-tip="tpl.description"
          @click="quickGenTemplate = tpl.id"
        >
          {{ tpl.label }}
        </button>
      </div>
      <button
        type="button"
        class="header-btn upload-btn quick-setup-btn"
        :disabled="quickGenRunning || props.isAnalyzing"
        @click="handleQuickSetup"
      >
        <Icon name="refresh-cw" :size="16" :class="{ spinning: quickGenRunning }" />
        <span class="btn-label">{{ quickGenRunning ? t('story.generating') : t('story.quickGenerate') }}</span>
      </button>
    </div>
    <!-- 生成结果：提供跳转入口 -->
    <div
      v-if="quickGenResult"
      class="quick-setup-result"
      role="status"
      aria-live="polite"
    >
      <span v-if="quickGenResult.worldId" class="result-item">
        {{ t('story.worldGenerated') }}
        <button type="button" class="result-link" @click="router.push({ name: 'worldbook' })">{{ t('story.view') }}</button>
      </span>
      <span v-else class="result-item fail">{{ t('story.worldFailed') }}</span>
      <span v-if="quickGenResult.charId" class="result-item">
        {{ t('story.charGenerated') }}
        <button type="button" class="result-link" @click="router.push({ name: 'character-list' })">{{ t('story.view') }}</button>
      </span>
      <span v-else class="result-item fail">{{ t('story.charFailed') }}</span>
    </div>
  </section>
</template>

<style scoped>
/* 补位：`.header-btn` / `.btn-label` 原在视图页头，拆分后到不了这里，原样复制 */
.header-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid var(--border);
  background: var(--card);
  color: var(--on-surface);
  border-radius: var(--radius-md);
  font-size: 13px;
  cursor: pointer;
  transition: background .15s ease, border-color .15s ease;
}

@media (hover: hover) and (pointer: fine) {
  .header-btn:hover:not(:disabled) {
    background: var(--card-elevated);
    border-color: var(--primary);
  }
}

.header-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* T-08: 一键生成设定面板 */
.quick-setup-panel {
  margin: 12px 20px;
  padding: 14px 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--card) 85%, transparent);
}

.quick-setup-head {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--accent-blue);
}

.quick-setup-title {
  font-weight: 600;
  font-size: 14px;
  color: var(--foreground);
}

.quick-setup-hint {
  font-size: 12px;
  color: var(--muted-foreground);
}

.quick-setup-body {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 10px;
  flex-wrap: wrap;
}

.template-pills {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.template-pill {
  padding: 4px 12px;
  font-size: 13px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--border);
  background: var(--surface-secondary);
  color: var(--text-secondary);
  cursor: pointer;
}

.template-pill.active {
  border-color: var(--accent-blue);
  /* accent-blue 作文字叠在同色 10% 染层上，light 下仅 4.44:1；
     改用派生 token --accent-blue-text（accent-blue 与 foreground 混合，主题自适应）。 */
  color: var(--accent-blue-text);
  background: color-mix(in srgb, var(--accent-blue) 10%, transparent);
}

.quick-setup-btn {
  margin-left: auto;
}

.quick-setup-result {
  margin-top: 10px;
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  font-size: 13px;
}

.result-item {
  color: var(--green, #9ece6a);
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.result-item.fail {
  color: var(--danger, #f7768e);
}

.result-link {
  background: none;
  border: none;
  color: var(--accent-blue);
  cursor: pointer;
  font-size: 12px;
  padding: 0;
  text-decoration: underline;
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 640px) {
  .btn-label {
    display: none;
  }

  .header-btn {
    padding: 6px 8px;
  }
}
</style>
