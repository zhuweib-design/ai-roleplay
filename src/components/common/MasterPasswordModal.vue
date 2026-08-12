<script setup lang="ts">
/**
 * MasterPasswordModal — 主密码管理对话框 (AC20 安全)
 *
 * 三种模式：
 * - setup: 首次设置主密码（新密码 + 确认）
 * - unlock: 解锁应用（输入主密码）
 * - change: 修改主密码（旧密码 + 新密码 + 确认）
 *
 * 无障碍特性：
 * - 复用 Modal 组件的焦点陷阱与 ESC 行为
 * - 密码输入框带 aria-label 与显示/隐藏切换
 * - 错误通过 role="alert" 反馈
 * - 修改模式不可关闭（dismissible=false），必须完成或取消
 */
import { ref, computed, watch, nextTick } from 'vue';
import Modal from './Modal.vue';
import Icon from './Icon.vue';
import { useSettingsStore } from '@/stores/settings';

export type MasterPasswordMode = 'setup' | 'unlock' | 'change';

const props = withDefaults(
  defineProps<{
    /** 是否显示 */
    modelValue: boolean;
    /** 模式 */
    mode: MasterPasswordMode;
    /** 是否可关闭（点击遮罩 / ESC） */
    dismissible?: boolean;
  }>(),
  {
    dismissible: true,
  }
);

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  /** 设置/解锁/修改成功 */
  success: [];
  /** 用户主动取消（点取消按钮） */
  cancel: [];
}>();

const settings = useSettingsStore();

// ── 表单状态 ──
const oldPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const showPassword = ref(false);
const errorMessage = ref<string | null>(null);
const isProcessing = ref(false);

// ── 计算属性 ──
const title = computed(() => {
  switch (props.mode) {
    case 'setup':
      return '设置主密码';
    case 'unlock':
      return '解锁应用';
    case 'change':
      return '修改主密码';
  }
});

const submitLabel = computed(() => {
  switch (props.mode) {
    case 'setup':
      return '设置';
    case 'unlock':
      return '解锁';
    case 'change':
      return '修改';
  }
});

const canSubmit = computed(() => {
  if (isProcessing.value) return false;
  if (props.mode === 'unlock') {
    return newPassword.value.length > 0;
  }
  if (props.mode === 'setup') {
    return (
      newPassword.value.length > 0 && newPassword.value === confirmPassword.value
    );
  }
  if (props.mode === 'change') {
    return (
      oldPassword.value.length > 0 &&
      newPassword.value.length > 0 &&
      newPassword.value === confirmPassword.value
    );
  }
  return false;
});

// ── 表单校验 ──
function validate(): string | null {
  if (props.mode === 'unlock') {
    if (!newPassword.value) return '请输入主密码';
    return null;
  }
  if (props.mode === 'setup') {
    if (!newPassword.value) return '请输入主密码';
    if (newPassword.value.length < 8)
      return '主密码至少 8 个字符';
    if (newPassword.value !== confirmPassword.value)
      return '两次输入的密码不一致';
    return null;
  }
  if (props.mode === 'change') {
    if (!oldPassword.value) return '请输入旧主密码';
    if (!newPassword.value) return '请输入新主密码';
    if (newPassword.value.length < 8)
      return '新主密码至少 8 个字符';
    if (newPassword.value !== confirmPassword.value)
      return '两次输入的新密码不一致';
    if (newPassword.value === oldPassword.value)
      return '新密码不能与旧密码相同';
    return null;
  }
  return null;
}

// ── 提交 ──
async function handleSubmit() {
  errorMessage.value = null;
  const err = validate();
  if (err) {
    errorMessage.value = err;
    return;
  }

  isProcessing.value = true;
  try {
    let ok = false;
    if (props.mode === 'setup') {
      await settings.setMasterPassword(newPassword.value);
      ok = true;
    } else if (props.mode === 'unlock') {
      ok = await settings.unlock(newPassword.value);
      if (!ok) {
        errorMessage.value = '主密码错误，请重试';
        return;
      }
    } else if (props.mode === 'change') {
      ok = await settings.changeMasterPassword(
        oldPassword.value,
        newPassword.value
      );
      if (!ok) {
        errorMessage.value = '旧主密码错误';
        return;
      }
    }
    if (ok) {
      emit('success');
      emit('update:modelValue', false);
    }
  } catch (e) {
    errorMessage.value = e instanceof Error ? e.message : String(e);
  } finally {
    isProcessing.value = false;
  }
}

// ── 取消 ──
function handleCancel() {
  emit('cancel');
  emit('update:modelValue', false);
}

// ── 重置表单（modal 关闭后） ──
watch(
  () => props.modelValue,
  (visible) => {
    if (!visible) {
      // 延迟重置，避免在关闭动画中清空导致闪烁
      setTimeout(() => {
        oldPassword.value = '';
        newPassword.value = '';
        confirmPassword.value = '';
        showPassword.value = false;
        errorMessage.value = null;
        isProcessing.value = false;
      }, 200);
    } else {
      // 打开时自动聚焦到第一个输入框
      nextTick(() => {
        const firstInput = document.querySelector<HTMLElement>(
          '.mpm-form input[type="password"], .mpm-form input[type="text"]'
        );
        firstInput?.focus();
      });
    }
  }
);

// ── Enter 键提交 ──
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && canSubmit.value) {
    e.preventDefault();
    void handleSubmit();
  }
}
</script>

<template>
  <Modal
    :model-value="modelValue"
    :title="title"
    :dismissible="dismissible"
    :aria-label="title"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="mpm-content" @keydown="handleKeydown">
      <!-- 描述说明 -->
      <p class="mpm-desc">
        <template v-if="mode === 'setup'">
          为保护 API Key 安全，请设置主密码。主密码不存储于本地，仅在
          当前浏览器会话内保留。忘记主密码将无法解密已存储的 API Key。
        </template>
        <template v-else-if="mode === 'unlock'">
          请输入主密码以解锁应用并解密已存储的 API Key。
        </template>
        <template v-else-if="mode === 'change'">
          修改主密码后，所有 API Key 将用新密码重新加密。
        </template>
      </p>

      <!-- 表单 -->
      <form class="mpm-form" @submit.prevent="handleSubmit">
        <!-- 旧密码（仅 change 模式） -->
        <div v-if="mode === 'change'" class="mpm-field">
          <label for="mpm-old" class="mpm-label">旧主密码</label>
          <div class="mpm-input-wrap">
            <input
              id="mpm-old"
              v-model="oldPassword"
              :type="showPassword ? 'text' : 'password'"
              class="mpm-input"
              autocomplete="off"
              :aria-invalid="!!errorMessage"
            />
            <button
              type="button"
              class="mpm-toggle"
              :aria-label="showPassword ? '隐藏密码' : '显示密码'"
              :aria-pressed="showPassword"
              @click="showPassword = !showPassword"
            >
              <Icon :name="showPassword ? 'eye-off' : 'eye'" :size="14" />
            </button>
          </div>
        </div>

        <!-- 新密码 / 解锁密码 -->
        <div class="mpm-field">
          <label for="mpm-new" class="mpm-label">
            {{ mode === 'change' ? '新主密码' : '主密码' }}
          </label>
          <div class="mpm-input-wrap">
            <input
              id="mpm-new"
              v-model="newPassword"
              :type="showPassword ? 'text' : 'password'"
              class="mpm-input"
              autocomplete="new-password"
              :aria-invalid="!!errorMessage"
            />
            <button
              type="button"
              class="mpm-toggle"
              :aria-label="showPassword ? '隐藏密码' : '显示密码'"
              :aria-pressed="showPassword"
              @click="showPassword = !showPassword"
            >
              <Icon :name="showPassword ? 'eye-off' : 'eye'" :size="14" />
            </button>
          </div>
        </div>

        <!-- 确认密码（setup 与 change 模式） -->
        <div v-if="mode !== 'unlock'" class="mpm-field">
          <label for="mpm-confirm" class="mpm-label">确认密码</label>
          <input
            id="mpm-confirm"
            v-model="confirmPassword"
            :type="showPassword ? 'text' : 'password'"
            class="mpm-input mpm-input-confirm"
            autocomplete="new-password"
            :aria-invalid="!!errorMessage"
          />
        </div>

        <!-- 错误提示 -->
        <p v-if="errorMessage" class="mpm-error" role="alert">
          <Icon name="alert-triangle" :size="12" />
          <span>{{ errorMessage }}</span>
        </p>

        <!-- 提示信息 -->
        <p v-if="mode === 'setup'" class="mpm-hint">
          <Icon name="alert-triangle" :size="12" />
          <span>主密码无法找回，请妥善保管。建议使用密码管理器。</span>
        </p>
      </form>
    </div>

    <template #footer>
      <button
        type="button"
        class="mpm-btn mpm-cancel"
        @click="handleCancel"
      >
        取消
      </button>
      <button
        type="button"
        class="mpm-btn mpm-submit"
        :disabled="!canSubmit"
        :aria-disabled="!canSubmit"
        @click="handleSubmit"
      >
        <Icon v-if="isProcessing" name="refresh-cw" :size="14" />
        <span>{{ isProcessing ? '处理中…' : submitLabel }}</span>
      </button>
    </template>
  </Modal>
</template>

<style scoped>
.mpm-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.mpm-desc {
  font-size: 13px;
  line-height: 1.6;
  color: var(--muted-foreground);
  margin: 0;
  padding: 10px 12px;
  background: color-mix(in srgb, var(--secondary) 6%, transparent);
  border-radius: var(--radius-sm);
  border-left: 2px solid var(--secondary);
}

.mpm-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.mpm-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.mpm-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--foreground);
}

.mpm-input-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.mpm-input {
  width: 100%;
  padding: 10px 36px 10px 12px;
  background: var(--bg-tertiary, color-mix(in srgb, var(--card) 80%, var(--border)));
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--foreground);
  font-size: 14px;
  font-family: monospace;
}

.mpm-input:focus {
  outline: 2px solid var(--secondary);
  outline-offset: 1px;
}

.mpm-input[aria-invalid="true"] {
  border-color: var(--primary);
}

.mpm-input-confirm {
  padding-right: 12px;
}

.mpm-toggle {
  position: absolute;
  right: 4px;
  background: none;
  border: none;
  color: var(--muted-foreground);
  cursor: pointer;
  padding: 6px;
  border-radius: var(--radius-xs);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.mpm-toggle:hover {
  color: var(--foreground);
}

.mpm-toggle:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 1px;
}

.mpm-error {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--primary-fg);
  margin: 0;
  padding: 8px 12px;
  background: color-mix(in srgb, var(--primary) 8%, transparent);
  border-radius: var(--radius-sm);
}

.mpm-hint {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 12px;
  color: var(--muted-foreground);
  margin: 0;
  line-height: 1.5;
}

.mpm-hint svg {
  flex-shrink: 0;
  margin-top: 2px;
}

.mpm-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  transition: background-color .15s ease, border-color .15s ease;
}

.mpm-cancel {
  background: none;
  border-color: var(--border);
  color: var(--muted-foreground);
}

.mpm-cancel:hover {
  background: color-mix(in srgb, var(--foreground) 5%, transparent);
  color: var(--foreground);
}

.mpm-cancel:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 2px;
}

.mpm-submit {
  background: var(--secondary);
  color: var(--on-accent);
}

.mpm-submit:hover:not(:disabled) {
  background: color-mix(in srgb, var(--secondary) 90%, white);
}

.mpm-submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.mpm-submit:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .mpm-btn {
    transition: none;
  }
}
</style>
