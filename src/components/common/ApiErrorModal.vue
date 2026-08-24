<script setup lang="ts">
/**
 * API 错误诊断 Modal
 *
 * 当 ChatStore.lastError 包含错误信息时弹出，显示：
 * - 错误分类图标与标题
 * - 错误详细信息
 * - 修复建议清单（按错误类型差异化展示）
 *
 * 无障碍特性：
 * - role="dialog" aria-modal="true"
 * - 焦点陷阱（由 Modal.vue 提供）
 * - ESC 关闭、点击遮罩关闭
 */
import { computed, watch } from 'vue';
import Modal from './Modal.vue';
import Icon from './Icon.vue';
import type { IconName } from './icons';
import { diagnoseError, type ApiErrorDiagnostics } from '@/api/diagnostics';
import type { ApiErrorKind } from '@/api/types';
import { t } from '@/i18n';

interface LastErrorRecord {
  type: 'aborted' | 'api' | 'network' | 'unknown';
  message: string;
  kind?: ApiErrorKind;
  statusCode?: number;
  original?: Error;
}

const props = defineProps<{
  /** 是否显示 */
  modelValue: boolean;
  /** 错误记录（来自 chatStore.lastError） */
  error: LastErrorRecord | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  /** 用户点击"前往设置"按钮 */
  goToSettings: [];
  /** 用户点击"重试"按钮 */
  retry: [];
}>();

/** 诊断信息（基于错误对象计算） */
const diagnostics = computed<ApiErrorDiagnostics | null>(() => {
  if (!props.error) return null;
  // 优先使用原始错误对象（保留完整 ApiError 上下文）
  if (props.error.original) {
    return diagnoseError(props.error.original);
  }
  // 兜底：根据 kind 字段构造
  if (props.error.kind) {
    return diagnoseError({ ...props.error, name: 'ApiError' } as unknown as Error);
  }
  // 普通错误：用 message 构造
  return diagnoseError(new Error(props.error.message));
});

/** 根据 kind 选择图标 */
const iconForKind = computed<IconName>(() => {
  switch (props.error?.kind) {
    case 'auth':
      return 'lock-keyhole';
    case 'network':
    case 'cors':
    case 'invalid-url':
      return 'wifi-slash';
    case 'rate-limit':
      return 'clock';
    case 'server':
      return 'server';
    case 'aborted':
      return 'stop';
    default:
      return 'warning';
  }
});

/** 根据 kind 选择头部颜色（语义色） */
const headerClass = computed(() => {
  switch (props.error?.kind) {
    case 'auth':
      return 'kind-auth';
    case 'network':
    case 'cors':
    case 'invalid-url':
      return 'kind-network';
    case 'rate-limit':
      return 'kind-warning';
    case 'server':
      return 'kind-server';
    default:
      return 'kind-unknown';
  }
});

/** 是否提供"前往设置"按钮（auth/network/invalid-url 类错误建议检查配置） */
const showSettingsButton = computed(() => {
  const k = props.error?.kind;
  return k === 'auth' || k === 'invalid-url' || k === 'network' || k === 'cors';
});

/** 是否提供"重试"按钮（非 aborted 错误） */
const showRetryButton = computed(() => {
  return props.error?.type !== 'aborted';
});

// 监听 error 变化，若为空则自动关闭 Modal（避免残留显示）
watch(
  () => props.error,
  (err) => {
    if (!err) {
      emit('update:modelValue', false);
    }
  }
);

function handleClose() {
  emit('update:modelValue', false);
}

function handleSettings() {
  emit('update:modelValue', false);
  emit('goToSettings');
}

function handleRetry() {
  emit('update:modelValue', false);
  emit('retry');
}
</script>

<template>
  <Modal
    :model-value="modelValue"
    :title="t('apiErrorModal.title')"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div v-if="diagnostics" class="error-detail">
      <!-- 错误头部（图标 + 标题） -->
      <div class="error-header" :class="headerClass">
        <span class="error-icon" aria-hidden="true">
          <Icon :name="iconForKind" :size="24" />
        </span>
        <div class="error-header-text">
          <h3 class="error-title">{{ diagnostics.title }}</h3>
          <span v-if="error?.statusCode" class="error-status">
            HTTP {{ error.statusCode }}
          </span>
        </div>
      </div>

      <!-- 错误详细描述（P2-4：Modal 打开已移焦+播标题，移除内层 alert 防双重播报） -->
      <div class="error-description">
        <span class="desc-label">{{ t('apiErrorModal.detailLabel') }}</span>
        <code class="desc-message">{{ diagnostics.description }}</code>
      </div>

      <!-- 修复建议 -->
      <div class="error-suggestions">
        <h4 class="suggestions-title">{{ t('apiErrorModal.suggestionsTitle') }}</h4>
        <ol class="suggestions-list" role="list">
          <li
            v-for="(s, idx) in diagnostics.suggestions"
            :key="idx"
            class="suggestion-item"
          >
            {{ s }}
          </li>
        </ol>
      </div>

      <!-- 帮助链接 -->
      <p class="error-help">
        {{ t('apiErrorModal.help') }}
      </p>
    </div>

    <template #footer>
      <button
        type="button"
        class="btn-secondary"
        @click="handleClose"
      >
        {{ t('apiErrorModal.close') }}
      </button>
      <button
        v-if="showRetryButton"
        type="button"
        class="btn-secondary"
        @click="handleRetry"
      >
        {{ t('apiErrorModal.retry') }}
      </button>
      <button
        v-if="showSettingsButton"
        type="button"
        class="btn-primary"
        @click="handleSettings"
      >
        {{ t('apiErrorModal.goSettings') }}
      </button>
    </template>
  </Modal>
</template>

<style scoped>
.error-detail {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.error-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
}

/* 按错误类型着色（语义色） */
.kind-auth {
  background: var(--warning-bg);
  border-color: var(--warning-border);
  color: var(--warning-fg);
}

.kind-network,
.kind-server {
  background: var(--danger-bg);
  border-color: var(--danger-border);
  color: var(--danger-fg);
}

.kind-warning {
  background: color-mix(in srgb, var(--accent-orange) 12%, transparent);
  border-color: color-mix(in srgb, var(--accent-orange) 30%, transparent);
  color: var(--accent-orange);
}

.kind-unknown {
  background: var(--card-elevated);
  border-color: var(--border);
  color: var(--foreground);
}

.error-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.error-header-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.error-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 600;
}

.error-status {
  font-family: var(--font-mono);
  font-size: 12px;
  opacity: 0.85;
}

.error-description {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  background: var(--card-elevated);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
}

.desc-label {
  font-size: 12px;
  color: var(--muted-foreground);
  font-weight: 500;
}

.desc-message {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--foreground);
  word-break: break-all;
  white-space: pre-wrap;
  line-height: 1.5;
}

.error-suggestions {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.suggestions-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--foreground);
}

.suggestions-list {
  margin: 0;
  padding-left: 20px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.suggestion-item {
  font-size: 13px;
  line-height: 1.55;
  color: var(--foreground);
}

.error-help {
  margin: 0;
  padding: 10px 12px;
  background: var(--card-elevated);
  border-radius: var(--radius-sm);
  font-size: 12px;
  color: var(--muted-foreground);
  border-left: 3px solid var(--secondary);
}

/* 按钮样式（与项目其他 Modal 一致） */
.btn-secondary,
.btn-primary {
  padding: var(--spacing-xs) var(--spacing-md);
  border-radius: var(--radius-md);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color .15s ease, border-color .15s ease;
  font-family: var(--font-sans);
}

.btn-secondary {
  background: var(--card-elevated);
  border: 1px solid var(--border);
  color: var(--foreground);
}

.btn-secondary:hover {
  background: color-mix(in srgb, var(--foreground) 8%, var(--card-elevated));
}

.btn-secondary:focus-visible,
.btn-primary:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 2px;
}

.btn-primary {
  background: var(--primary);
  border: 1px solid var(--primary);
  color: var(--on-accent);
}

.btn-primary:hover {
  filter: brightness(1.1);
}
</style>
