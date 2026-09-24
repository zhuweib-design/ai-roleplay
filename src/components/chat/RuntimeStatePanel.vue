<script setup lang="ts">
/**
 * Runtime 最小状态查看面板。
 *
 * 只读展示单个角色的 Runtime 快照摘要（版本、事件/记忆/Episode 计数、
 * 当前显著情绪、Mood 与最近事件），并提供「回放自检」按钮验证
 * Reducer 与历史事件流的确定性一致。
 *
 * 单聊（ContextPanel）与群聊（成员详情）共用该组件。
 */
import { computed, ref, watch } from 'vue';
import { useChatStore } from '@/stores/chat';
import Icon from '@/components/common/Icon.vue';
import { t } from '@/i18n';
import type { UICharacter } from '@/types';

type RuntimeSummary = Awaited<ReturnType<ReturnType<typeof useChatStore>['inspectRuntimeState']>>;
type ReplayResult = Awaited<ReturnType<ReturnType<typeof useChatStore>['verifyRuntimeReplay']>>;

const props = defineProps<{
  character: UICharacter;
  /** 群聊场景下传入成员显示名，未传时使用角色名。 */
  label?: string;
}>();

const chatStore = useChatStore();

const expanded = ref(false);
const loading = ref(false);
const summary = ref<RuntimeSummary | null>(null);
const replay = ref<ReplayResult | null>(null);
const replaying = ref(false);

const title = computed(() => props.label ?? props.character.name);

async function refresh(): Promise<void> {
  loading.value = true;
  replay.value = null;
  try {
    summary.value = await chatStore.inspectRuntimeState(props.character);
  } finally {
    loading.value = false;
  }
}

async function runReplay(): Promise<void> {
  replaying.value = true;
  try {
    replay.value = await chatStore.verifyRuntimeReplay(props.character);
  } finally {
    replaying.value = false;
  }
}

// 角色切换时重置并重新读取
watch(
  () => [props.character.id, props.character.name] as const,
  () => {
    expanded.value = false;
    summary.value = null;
    replay.value = null;
  },
);

function toggle(): void {
  expanded.value = !expanded.value;
  if (expanded.value && !summary.value && !loading.value) void refresh();
}
</script>

<template>
  <section class="runtime-panel" :aria-label="t('runtime.aria')">
    <button
      type="button"
      class="runtime-toggle"
      :aria-expanded="expanded"
      @click="toggle"
    >
      <Icon name="git-commit" :size="14" />
      <span class="runtime-toggle-label">{{ t('runtime.title') }}</span>
      <span class="runtime-toggle-name">{{ title }}</span>
      <Icon :name="expanded ? 'chevron-up' : 'chevron-down'" :size="14" />
    </button>

    <div v-if="expanded" class="runtime-body">
      <p v-if="loading" class="runtime-hint">{{ t('runtime.loading') }}</p>

      <template v-else-if="summary?.enabled">
        <dl class="runtime-grid">
          <div class="runtime-cell">
            <dt>{{ t('runtime.version') }}</dt>
            <dd>{{ summary.version }}</dd>
          </div>
          <div class="runtime-cell">
            <dt>{{ t('runtime.events') }}</dt>
            <dd>{{ summary.eventCount }}</dd>
          </div>
          <div class="runtime-cell">
            <dt>{{ t('runtime.memories') }}</dt>
            <dd>{{ summary.memoryCount }}</dd>
          </div>
          <div class="runtime-cell">
            <dt>{{ t('runtime.episodes') }}</dt>
            <dd>{{ summary.episodeCount }}</dd>
          </div>
        </dl>

        <div v-if="summary.emotions.length" class="runtime-block">
          <div class="runtime-block-title">{{ t('runtime.emotions') }}</div>
          <ul class="runtime-list">
            <li v-for="item in summary.emotions" :key="item.emotion">
              <span class="runtime-key">{{ item.emotion }}</span>
              <span class="runtime-value">{{ item.intensity.toFixed(2) }}</span>
            </li>
          </ul>
        </div>
        <p v-else class="runtime-hint">{{ t('runtime.noEmotions') }}</p>

        <div v-if="summary.mood" class="runtime-block">
          <div class="runtime-block-title">{{ t('runtime.mood') }}</div>
          <ul class="runtime-list">
            <li>
              <span class="runtime-key">{{ t('runtime.moodValence') }}</span>
              <span class="runtime-value">{{ summary.mood.valence.toFixed(2) }}</span>
            </li>
            <li>
              <span class="runtime-key">{{ t('runtime.moodArousal') }}</span>
              <span class="runtime-value">{{ summary.mood.arousal.toFixed(2) }}</span>
            </li>
            <li>
              <span class="runtime-key">{{ t('runtime.moodDominance') }}</span>
              <span class="runtime-value">{{ summary.mood.dominance.toFixed(2) }}</span>
            </li>
          </ul>
        </div>

        <div v-if="summary.recentEvents.length" class="runtime-block">
          <div class="runtime-block-title">{{ t('runtime.recentEvents') }}</div>
          <ul class="runtime-list">
            <li v-for="event in summary.recentEvents" :key="event.id">
              <span class="runtime-key">{{ event.eventType }}</span>
              <span class="runtime-value">{{ event.importance.toFixed(2) }}</span>
            </li>
          </ul>
        </div>

        <div class="runtime-actions">
          <button type="button" class="runtime-btn" :disabled="loading" @click="refresh">
            {{ t('runtime.refresh') }}
          </button>
          <button type="button" class="runtime-btn" :disabled="replaying" @click="runReplay">
            {{ replaying ? t('runtime.replaying') : t('runtime.replay') }}
          </button>
        </div>

        <p
          v-if="replay?.enabled"
          class="runtime-replay-result"
          :class="{ ok: replay.consistent, warn: !replay.consistent }"
          role="status"
        >
          {{ replay.consistent
            ? t('runtime.replayOk', { version: replay.replayedVersion, count: replay.eventCount })
            : t('runtime.replayMismatch', { stored: replay.storedVersion, replayed: replay.replayedVersion }) }}
        </p>
      </template>

      <p v-else class="runtime-hint">{{ t('runtime.unavailable') }}</p>
    </div>
  </section>
</template>

<style scoped>
.runtime-panel {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.runtime-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-height: 32px;
  padding: 0 var(--spacing-sm);
  background: none;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--muted-foreground);
  font-size: 12px;
  cursor: pointer;
  text-align: left;
}

@media (hover: hover) and (pointer: fine) {
  .runtime-toggle:hover {
    color: var(--foreground);
  }
}

.runtime-toggle:focus-visible,
.runtime-btn:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 1px;
}

.runtime-toggle-label {
  flex-shrink: 0;
}

.runtime-toggle-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--foreground);
}

.runtime-body {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--muted-foreground) 6%, transparent);
}

.runtime-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  margin: 0;
}

.runtime-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.runtime-cell dt {
  font-size: 11px;
  color: var(--muted-foreground);
}

.runtime-cell dd {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--foreground);
}

.runtime-block-title {
  font-size: 11px;
  color: var(--muted-foreground);
  margin-bottom: 4px;
}

.runtime-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.runtime-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
}

.runtime-key {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--foreground);
}

.runtime-value {
  flex-shrink: 0;
  font-family: var(--font-mono);
  color: var(--muted-foreground);
}

.runtime-hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--muted-foreground);
}

.runtime-actions {
  display: flex;
  gap: 6px;
}

.runtime-btn {
  flex: 1;
  min-height: 28px;
  padding: 0 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: none;
  color: var(--foreground);
  font-size: 12px;
  cursor: pointer;
}

.runtime-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.runtime-replay-result {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
}

.runtime-replay-result.ok {
  color: var(--tk-green-500, #22c55e);
}

.runtime-replay-result.warn {
  color: var(--tk-yellow-500, #eab308);
}

@media (max-width: 640px) {
  /* iOS 聚焦防放大：按钮文字非输入控件，无需 16px；保持紧凑可读 */
  .runtime-toggle,
  .runtime-btn {
    min-height: 36px;
  }
}
</style>
