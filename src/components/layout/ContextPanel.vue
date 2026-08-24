<script setup lang="ts">
import { computed } from 'vue';
import { useCharacterStore } from '@/stores/character';
import { usePersonaStore } from '@/stores/persona';
import { useLorebookStore } from '@/stores/lorebook';
import { useChatStore } from '@/stores/chat';
import { useSettingsStore } from '@/stores/settings';
import Icon from '@/components/common/Icon.vue';
import Avatar from '@/components/common/Avatar.vue';
import { t } from '@/i18n';

const characterStore = useCharacterStore();
const personaStore = usePersonaStore();
const lorebookStore = useLorebookStore();
const chatStore = useChatStore();
const settingsStore = useSettingsStore();

const char = computed(() => characterStore.currentCharacter!);

/** 当前实际使用的模型(与发送一致:API Profile 的 model),而非角色卡 model */
const activeModel = computed(() => settingsStore.activeProfile?.model ?? '');

/** {{user}} 宏字面量（模板内嵌套双花括号会破坏编译，故提为常量） */
const USER_MACRO = '{{user}}';

// 角色页绑定的世界书（需求7：唯一数据源 boundWorldBookIds）
const boundLorebooks = computed(() => {
  const bound = char.value.boundWorldBookIds ?? [];
  return lorebookStore.lorebooks.filter((lb) => bound.includes(lb.id));
});

// F07 Persona：当前激活的用户身份
const activePersonaName = computed(() => personaStore.activeUserName);
const personas = computed(() => personaStore.personas);
const activePersonaId = computed(() => {
  const settings = personaStore.activePersona;
  return settings?.id ?? '';
});

function onPersonaChange(e: Event) {
  const v = (e.target as HTMLSelectElement).value;
  personaStore.setActivePersona(v || null);
}

// Token 预算总量
const TOTAL_BUDGET = 8192;

const usedTokens = computed(
  () =>
    char.value.tokenBudget.character +
    char.value.tokenBudget.worldInfo +
    char.value.tokenBudget.chatHistory
);

const usedPercent = computed(() =>
  Math.min(100, Math.round((usedTokens.value / TOTAL_BUDGET) * 100))
);

// 各分项占比（用于堆叠条）
const segments = computed(() => {
  const total = Math.max(1, usedTokens.value);
  return [
    {
      key: 'character',
      label: t('ctx.character'),
      value: char.value.tokenBudget.character,
      percent: (char.value.tokenBudget.character / total) * 100,
      color: 'var(--tk-cyan-500)',
    },
    {
      key: 'world',
      label: t('ctx.world'),
      value: char.value.tokenBudget.worldInfo,
      percent: (char.value.tokenBudget.worldInfo / total) * 100,
      color: 'var(--tk-red-500)',
    },
    {
      key: 'history',
      label: t('ctx.history'),
      value: char.value.tokenBudget.chatHistory,
      percent: (char.value.tokenBudget.chatHistory / total) * 100,
      color: 'var(--tk-yellow-500)',
    },
  ];
});

// 生成参数本地编辑 → 写回 store
function onTemperature(e: Event) {
  const v = Number((e.target as HTMLInputElement).value);
  characterStore.updateCharacter(char.value.id, { temperature: v });
}

function onMaxTokens(e: Event) {
  const v = Number((e.target as HTMLInputElement).value);
  characterStore.updateCharacter(char.value.id, { maxTokens: v });
}

function onAuthorNote(e: Event) {
  const v = (e.target as HTMLTextAreaElement).value;
  characterStore.updateCharacter(char.value.id, { authorNote: v });
}

function onAuthorDepth(e: Event) {
  const v = Number((e.target as HTMLInputElement).value);
  characterStore.updateCharacter(char.value.id, { authorDepth: v });
}
</script>

<template>
  <aside
    id="context-drawer"
    tabindex="-1"
    class="context-panel"
    :class="{ active: characterStore.panelOpen }"
    :aria-label="t('ctx.aria')"
  >
    <!-- 顶栏 -->
    <header class="ctx-header">
      <span class="ctx-title">{{ t('ctx.title') }}</span>
      <button
        type="button"
        class="mobile-menu-btn ctx-close"
        :aria-label="t('ctx.closePanel')"
        @click="characterStore.togglePanel()"
      >
        <Icon name="close" :size="18" />
      </button>
    </header>

    <!-- 可滚动内容 -->
    <div class="context-panel-scroll tk-scroll">
      <!-- 角色信息卡 -->
      <section class="ctx-section" aria-labelledby="ctx-char-title">
        <header class="ctx-section-header">
          <Avatar :character="char" :size="40" />
          <div class="ctx-char-info">
            <div id="ctx-char-title" class="ctx-char-name">{{ char.name }}</div>
            <div class="ctx-char-model">{{ activeModel || char.model }}</div>
          </div>
        </header>
        <p class="ctx-char-desc">{{ char.description }}</p>
        <div v-if="char.tags.length" class="ctx-tags">
          <span v-for="tag in char.tags" :key="tag" class="ctx-tag">{{ tag }}</span>
        </div>
      </section>

      <!-- F07 Persona 切换 -->
      <section class="ctx-section" aria-labelledby="ctx-persona-title">
        <header class="ctx-section-header">
          <span id="ctx-persona-title" class="ctx-section-title">{{ t('ctx.personaTitle') }}</span>
          <span class="ctx-section-value">{{ activePersonaName }}</span>
        </header>
        <label class="ctx-persona-select-label">
          <span class="visually-hidden">{{ t('ctx.switchPersona') }}</span>
          <select
            class="tk-input ctx-persona-select"
            :value="activePersonaId"
            :aria-label="t('ctx.selectPersona')"
            @change="onPersonaChange"
          >
            <option
              v-for="p in personas"
              :key="p.id"
              :value="p.id"
            >
              {{ p.name }}
            </option>
          </select>
        </label>
        <p class="ctx-persona-hint">
          {{ t('ctx.personaHint', { macro: USER_MACRO }) }}
        </p>
      </section>

      <!-- Token 预算 -->
      <section class="ctx-section" aria-labelledby="ctx-token-title">
        <header class="ctx-section-header">
          <span id="ctx-token-title" class="ctx-section-title">{{ t('ctx.tokenTitle') }}</span>
          <span class="ctx-section-value">{{ usedTokens }} / {{ TOTAL_BUDGET }}</span>
        </header>
        <div
class="token-bar" role="progressbar"
          :aria-valuenow="usedTokens" :aria-valuemin="0" :aria-valuemax="TOTAL_BUDGET"
          :aria-label="t('ctx.tokenUsed', { percent: usedPercent })"
>
          <div class="token-bar-fill" :style="{ width: `${usedPercent}%` }">
            <div
              v-for="seg in segments"
              :key="seg.key"
              class="token-segment"
              :style="{
                width: `${seg.percent}%`,
                backgroundColor: seg.color,
              }"
              :title="`${seg.label}: ${seg.value}`"
            />
          </div>
        </div>
        <ul class="token-legend" :aria-label="t('ctx.tokenLegend')">
          <li v-for="seg in segments" :key="seg.key">
            <span class="legend-dot" :style="{ backgroundColor: seg.color }" aria-hidden="true" />
            <span class="legend-label">{{ seg.label }}</span>
            <span class="legend-value">{{ seg.value }}</span>
          </li>
          <li>
            <span class="legend-dot legend-remaining" aria-hidden="true" />
            <span class="legend-label">{{ t('ctx.remaining') }}</span>
            <span class="legend-value">{{ char.tokenBudget.remaining }}</span>
          </li>
          <li class="legend-usage">
            <span class="legend-dot legend-usage-dot" aria-hidden="true" />
            <span class="legend-label">{{ t('ctx.totalUsage') }}</span>
            <span class="legend-value">{{ chatStore.totalTokenUsage }} Tokens</span>
          </li>
        </ul>
      </section>

      <!-- 世界书 -->
      <section class="ctx-section" aria-labelledby="ctx-world-title">
        <header class="ctx-section-header">
          <span id="ctx-world-title" class="ctx-section-title">{{ t('ctx.worldTitle') }}</span>
          <span class="ctx-section-value">{{ t('ctx.worldCount', { count: boundLorebooks.length }) }}</span>
        </header>
        <ul v-if="boundLorebooks.length" class="world-list">
          <li v-for="lb in boundLorebooks" :key="lb.id" class="world-lorebook">
            <span class="world-entry-name">{{ lb.name }}</span>
            <span class="world-entry-count">
              {{ t('ctx.worldEnabled', { count: lb.entries.filter((e) => e.enabled).length }) }}
            </span>
          </li>
        </ul>
        <p v-else class="ctx-empty">{{ t('ctx.worldEmpty') }}</p>
      </section>

      <!-- 作者笔记 -->
      <section class="ctx-section" aria-labelledby="ctx-author-title">
        <header class="ctx-section-header">
          <span id="ctx-author-title" class="ctx-section-title">{{ t('ctx.authorTitle') }}</span>
          <span class="ctx-section-value">{{ t('ctx.authorDepth', { depth: char.authorDepth }) }}</span>
        </header>
        <textarea
          class="tk-input ctx-textarea"
          :value="char.authorNote"
          :placeholder="t('ctx.authorPlaceholder')"
          :aria-label="t('ctx.authorAria')"
          rows="3"
          @input="onAuthorNote"
        />
        <label class="ctx-range-label">
          <span>{{ t('ctx.insertDepth') }}</span>
          <input
            type="range"
            class="tk-range"
            min="0"
            max="10"
            step="1"
            :value="char.authorDepth"
            :aria-label="t('ctx.authorDepthAria')"
            @input="onAuthorDepth"
          />
          <span class="ctx-range-value" aria-hidden="true">{{ char.authorDepth }}</span>
        </label>
      </section>

      <!-- 生成参数 -->
      <section class="ctx-section" aria-labelledby="ctx-gen-title">
        <header class="ctx-section-header">
          <span id="ctx-gen-title" class="ctx-section-title">{{ t('ctx.genTitle') }}</span>
        </header>
        <label class="ctx-range-label">
          <span>{{ t('ctx.temperature') }}</span>
          <input
            type="range"
            class="tk-range"
            min="0"
            max="2"
            step="0.05"
            :value="char.temperature"
            :aria-label="t('ctx.temperatureAria')"
            @input="onTemperature"
          />
          <span class="ctx-range-value" aria-hidden="true">{{ char.temperature.toFixed(2) }}</span>
        </label>
        <label class="ctx-range-label">
          <span>{{ t('ctx.maxTokens') }}</span>
          <input
            type="range"
            class="tk-range"
            min="256"
            max="8192"
            step="256"
            :value="char.maxTokens"
            :aria-label="t('ctx.maxTokensAria')"
            @input="onMaxTokens"
          />
          <span class="ctx-range-value" aria-hidden="true">{{ char.maxTokens }}</span>
        </label>
      </section>
    </div>
  </aside>
</template>

<style scoped>
.ctx-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 56px;
  padding: 0 16px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.ctx-title {
  font-family: var(--font-display);
  font-size: 14px;
  font-weight: 600;
  color: var(--foreground);
  letter-spacing: 0.02em;
}

.ctx-close {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  background: none;
  border: none;
  color: var(--muted-foreground);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ctx-section {
  padding: var(--spacing-md);
  border-bottom: 1px solid var(--border);
}

.ctx-section-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.ctx-section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--foreground);
  flex: 1;
}

.ctx-section-value {
  font-size: 11px;
  color: var(--muted-foreground);
  font-family: var(--font-mono);
}

.ctx-char-info {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.ctx-char-name {
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 600;
  color: var(--foreground);
  line-height: 1.2;
}

.ctx-char-model {
  font-size: 11px;
  color: var(--muted-foreground);
  margin-top: 2px;
}

.ctx-char-desc {
  margin: 0 0 10px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--muted-foreground);
}

.ctx-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.ctx-tag {
  padding: 2px 8px;
  font-size: 11px;
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--secondary) 10%, transparent);
  color: var(--secondary);
}

.token-bar {
  width: 100%;
  height: 6px;
  background: var(--border);
  border-radius: var(--radius-pill);
  overflow: hidden;
  margin-bottom: 10px;
}

.token-bar-fill {
  height: 100%;
  display: flex;
  width: 100%;
}

.token-segment {
  height: 100%;
  transition: width 0.2s ease;
}

.token-legend {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px 12px;
}

.token-legend li {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--muted-foreground);
}

.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.legend-remaining {
  background: var(--border);
}

.legend-usage {
  grid-column: 1 / -1;
  border-top: 1px dashed var(--border);
  padding-top: 4px;
  margin-top: 2px;
}

.legend-usage-dot {
  background: var(--primary);
}

.legend-label {
  flex: 1;
}

.legend-value {
  font-family: var(--font-mono);
  color: var(--foreground);
}

.world-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.world-entry {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 4px;
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.world-entry-name {
  flex: 1;
  font-size: 13px;
  color: var(--foreground);
}

.world-lorebook {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
  padding: 6px 4px;
  border-radius: var(--radius-sm);
}

.world-lorebook .world-entry-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.world-entry-count {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--muted-foreground);
}

.ctx-empty {
  margin: 0;
  padding: 8px 4px;
  font-size: 12px;
  color: var(--muted-foreground);
  text-align: center;
}

.ctx-textarea {
  width: 100%;
  background: var(--video-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 8px 10px;
  color: var(--foreground);
  font-size: 13px;
  font-family: var(--font-sans);
  line-height: 1.55;
  resize: vertical;
  outline: none;
}

.ctx-range-label {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: var(--spacing-sm);
  margin-top: 10px;
  font-size: 12px;
  color: var(--muted-foreground);
}

.ctx-range-value {
  font-family: var(--font-mono);
  color: var(--foreground);
  min-width: 36px;
  text-align: right;
}

.mobile-menu-btn {
  display: none;
}

/* F07 Persona 切换区域 */
.ctx-persona-select-label {
  display: block;
  margin: 0;
}

.ctx-persona-select {
  width: 100%;
  height: 32px;
  padding: 0 8px;
  font-size: 13px;
  color: var(--foreground);
  background: var(--video-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  outline: none;
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
  padding-right: 28px;
}

.ctx-persona-select:focus-visible {
  border-color: var(--tk-cyan-500);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--tk-cyan-500) 35%, transparent);
}

.ctx-persona-hint {
  margin: 6px 0 0;
  font-size: 11px;
  color: var(--muted-foreground);
  line-height: 1.5;
}

.ctx-persona-hint code {
  font-family: var(--font-mono);
  padding: 1px 4px;
  background: color-mix(in srgb, var(--secondary) 10%, transparent);
  border-radius: var(--radius-sm);
  color: var(--secondary);
}

/* 视觉隐藏但屏幕阅读器可读 */
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 1024px) {
  .mobile-menu-btn {
    display: inline-flex;
  }
}
</style>
