<script setup lang="ts">
import Icon from '@/components/common/Icon.vue';
import { ref, computed } from 'vue';
import { t } from '@/i18n';
import { useSettingsStore } from '@/stores/settings';
import { showToast } from '@/utils/toast-service';

/**
 * SettingsContextLengthSection — 设置·模型分类下的「上下文长度配置」段
 *
 * 自 SettingsView.vue 迁出（R4-15）：这一段是完整闭环 —— 预设档位、预算展示、
 * 两个输入框的校验与回写、保存回执全在这里，SettingsView 其余部分对它零引用。
 * 迁出前父组件 scoped 样式里它的 17 条规则、以及 useSettingsStore 的全部 8 处用法
 * 都只服务这一段。
 *
 * 保留原始语义：默认 8192/1024 维持既有行为，调大用于接入大上下文模型（如 256K）。
 */

/** 与模型面板「最大上下文」同一组常用档位（K=1024；1M = 1048576） */
const CONTEXT_PRESETS: readonly number[] = [
  32768, 65536, 131072, 278528, 409600, 614400, 1048576,
] as const;

const settings = useSettingsStore();

const contextLengthError = ref<string | null>(null);

const contextBudget = computed(() => settings.availableContextTokens);

function applyContextPreset(max: number): void {
  if (settings.setMaxContextTokens(max)) {
    contextLengthError.value = null;
    showToast(
      'success',
      t('settingsView.contextLengthSaved', { max, reserved: settings.reservedTokens })
    );
  } else {
    contextLengthError.value = t('settingsView.contextLengthError');
    showToast('error', t('settingsView.contextLengthError'));
  }
}

/** 按 1024 进制显示（32768 → 32K、1048576 → 1M），与档位值本身的进制一致 */
function formatTokenCount(n: number): string {
  if (n >= 1024 * 1024) {
    const m = n / (1024 * 1024);
    return `${Number.isInteger(m) ? m : m.toFixed(1)}M`;
  }
  const k = n / 1024;
  return `${Number.isInteger(k) ? k : k.toFixed(1)}K`;
}

function onMaxContextInput(e: Event): void {
  const raw = Number((e.target as HTMLInputElement).value);
  if (!Number.isFinite(raw) || raw <= 0 || !settings.setMaxContextTokens(raw)) {
    contextLengthError.value = t('settingsView.contextLengthError');
    return;
  }
  contextLengthError.value = null;
}

function onReservedInput(e: Event): void {
  const raw = Number((e.target as HTMLInputElement).value);
  if (!Number.isFinite(raw) || raw < 0 || !settings.setReservedTokens(raw)) {
    contextLengthError.value = t('settingsView.contextLengthError');
    return;
  }
  contextLengthError.value = null;
}
</script>

<template>
  <section class="settings-section" aria-labelledby="context-length-title">
    <header class="section-header">
      <h2 id="context-length-title" class="section-title">
        <Icon name="cpu" :size="16" />
        <span>{{ t('settingsView.contextLengthTitle') }}</span>
      </h2>
    </header>

    <div class="extension-block">
      <label class="form-row">
        <span>{{ t('settingsView.contextLengthMax') }}</span>
        <input
          type="number"
          min="1024"
          max="2000000"
          step="1024"
          :value="settings.maxContextTokens"
          @change="onMaxContextInput"
        />
      </label>
      <label class="form-row">
        <span>{{ t('settingsView.contextLengthReserved') }}</span>
        <input
          type="number"
          min="0"
          max="1000000"
          step="128"
          :value="settings.reservedTokens"
          @change="onReservedInput"
        />
      </label>

      <div class="context-preset">
        <span class="context-preset-label">{{ t('settingsView.contextLengthPreset') }}</span>
        <div class="context-preset-btns">
          <button
            v-for="preset in CONTEXT_PRESETS"
            :key="preset"
            type="button"
            class="data-mgmt-btn"
            :class="{ active: settings.maxContextTokens === preset }"
            @click="applyContextPreset(preset)"
          >
            {{ formatTokenCount(preset) }}
          </button>
        </div>
      </div>

      <p class="hint-text context-budget">
        {{ t('settingsView.contextLengthBudget', { budget: contextBudget }) }}
      </p>
      <p class="hint-text">
        {{ t('settingsView.contextLengthHint') }}
      </p>
      <p v-if="contextLengthError" class="context-error" role="alert">
        {{ contextLengthError }}
      </p>
    </div>
  </section>
</template>

<style scoped>
.settings-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 600;
  color: var(--foreground);
  margin: 0;
}

.data-mgmt-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid var(--border);
  background: var(--card);
  color: var(--foreground);
  border-radius: var(--radius-md);
  font-size: 13px;
  cursor: pointer;
  transition: background-color 0.15s, border-color 0.15s;
}

@media (hover: hover) and (pointer: fine) {
  .data-mgmt-btn:hover:not(:disabled) {
    background: var(--card-elevated);
    border-color: var(--tk-cyan-500);
  }
}

.data-mgmt-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.extension-block {
  padding: 16px;
  margin-bottom: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--card-elevated);
}

.extension-block .form-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
  font-size: 13px;
  color: var(--foreground);
}

.extension-block .form-row > span {
  min-width: 100px;
  color: var(--muted-foreground);
}

.extension-block .form-row input[type='number'] {
  flex: 1;
  max-width: 240px;
  padding: 6px 10px;
  font-size: 13px;
  background: var(--background);
  color: var(--foreground);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.extension-block .hint-text {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--muted-foreground);
  line-height: 1.5;
}

/* 上下文长度配置：预设快捷按钮 + 预算实时展示 */
.context-preset {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 10px 0;
  font-size: 13px;
  color: var(--foreground);
}

.context-preset-label {
  min-width: 100px;
  color: var(--muted-foreground);
}

.context-preset-btns {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.context-preset-btns .data-mgmt-btn.active {
  border-color: var(--tk-cyan-500);
  background: var(--card-elevated);
  /* 亮色主题中 cyan-500 叠在浅色卡片上对比度不足，使用专用文本派生色。 */
  color: var(--accent-blue-text);
}

.context-budget {
  font-weight: 600;
  color: var(--foreground);
}

.context-error {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--tk-red-500, #ef4444);
  line-height: 1.5;
}

/* ── 窄屏 ── */
@media (max-width: 640px) {
  /* iOS 聚焦防放大：可编辑控件字号须 ≥16px（I-7 / D1）。
     沿用顶层规则的原选择器 —— i7 guard 的「已覆盖」判定要求逐字相同（§7.12 O-2）。 */
  .extension-block .form-row input[type='number'] {
    font-size: 16px;
  }
}
</style>
