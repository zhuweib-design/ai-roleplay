<script setup lang="ts">
/**
 * ProfileView — 个人中心 (需求6)
 *
 * 功能：
 * - 展示当前激活 Persona 的昵称与描述
 * - 支持昵称内联编辑（含校验）+ 保存 / 取消
 * - 切换激活 Persona（多身份管理）
 * - 数据通过 persona store 自动持久化到 IndexedDB / Tauri FS
 *
 * 无障碍：
 * - 编辑表单使用 label + aria-describedby 关联错误
 * - 输入校验失败时 role="alert" 反馈
 * - 键盘可达（Tab 顺序：编辑 → 保存 → 取消）
 */
import { ref, computed, watch, nextTick } from 'vue';
import { usePersonaStore, MAX_PERSONA_NAME_LENGTH, MAX_PERSONA_DESCRIPTION_LENGTH, validatePersona } from '@/stores/persona';
import Icon from '@/components/common/Icon.vue';

const personaStore = usePersonaStore();

// ── 编辑状态 ──
const isEditing = ref(false);
const editName = ref('');
const editDescription = ref('');
const errors = ref<{ name?: string; description?: string }>({});
const nameInputRef = ref<HTMLInputElement | null>(null);

// ── 计算属性 ──
const activePersona = computed(() => personaStore.activePersona);
const hasPersona = computed(() => !!activePersona.value);

/** 头像首字母（取昵称首字，回退 "U"） */
const avatarInitial = computed(() => {
  const name = activePersona.value?.name?.trim();
  if (!name) return 'U';
  return name.charAt(0).toUpperCase();
});

/** 创建时间格式化 */
const formattedCreatedAt = computed(() => {
  if (!activePersona.value?.createdAt) return '—';
  try {
    return new Date(activePersona.value.createdAt).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return '—';
  }
});

/** 更新时间格式化 */
const formattedUpdatedAt = computed(() => {
  if (!activePersona.value?.updatedAt) return '—';
  try {
    return new Date(activePersona.value.updatedAt).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
});

/** 保存按钮可用性（昵称非空 + 无错误） */
const canSave = computed(() => {
  return editName.value.trim().length > 0 && Object.keys(errors.value).length === 0;
});

// ── 动作 ──

/** 进入编辑模式：拷贝当前值到编辑缓冲区 */
function startEdit(): void {
  if (!activePersona.value) return;
  editName.value = activePersona.value.name;
  editDescription.value = activePersona.value.description;
  errors.value = {};
  isEditing.value = true;
  void nextTick(() => {
    nameInputRef.value?.focus();
    nameInputRef.value?.select();
  });
}

/** 取消编辑：丢弃缓冲区并退出 */
function cancelEdit(): void {
  isEditing.value = false;
  editName.value = '';
  editDescription.value = '';
  errors.value = {};
}

/** 实时校验输入 */
function validateField(field: 'name' | 'description'): void {
  const result = validatePersona({
    name: editName.value,
    description: editDescription.value,
  });
  errors.value = {};
  for (const msg of result) {
    if (msg.includes('名称')) errors.value.name = msg;
    else if (msg.includes('描述')) errors.value.description = msg;
  }
  if (field === 'name' && !errors.value.name && editName.value.trim() === '') {
    errors.value.name = '昵称不能为空';
  }
}

/** 保存：校验通过后调用 store.updatePersona（自动持久化） */
function saveEdit(): void {
  if (!activePersona.value) return;
  validateField('name');
  if (!canSave.value) return;

  const trimmedName = editName.value.trim();
  const trimmedDesc = editDescription.value.trim();

  const ok = personaStore.updatePersona(activePersona.value.id, {
    name: trimmedName,
    description: trimmedDesc,
  });

  if (ok) {
    isEditing.value = false;
    editName.value = '';
    editDescription.value = '';
    errors.value = {};
  } else {
    // store 校验失败，提取 lastError
    if (personaStore.lastError) {
      errors.value.name = personaStore.lastError;
    }
  }
}

// 监听 store 错误，反馈到表单
watch(
  () => personaStore.lastError,
  (msg) => {
    if (isEditing.value && msg) {
      errors.value.name = msg;
    }
  }
);

// ── 切换激活 Persona ──
function switchPersona(id: string): void {
  if (id === activePersona.value?.id) return;
  personaStore.setActivePersona(id);
}
</script>

<template>
  <main id="main-content" class="profile-view tk-scroll" aria-label="个人中心" tabindex="-1">
    <!-- 头部 -->
    <header class="profile-header">
      <h1 class="profile-title">
        <Icon name="user" :size="22" aria-hidden="true" />
        <span>个人中心</span>
      </h1>
      <p class="profile-subtitle">管理你的昵称与身份信息</p>
    </header>

    <!-- 无 Persona 兜底（理论上 store 会自动创建默认 User） -->
    <p v-if="!hasPersona" class="empty-hint">尚未创建身份，请前往设置页初始化 Persona。</p>

    <!-- 当前身份卡片 -->
    <section v-else class="settings-section profile-card-section" aria-labelledby="current-profile-title">
      <header class="section-header">
        <h2 id="current-profile-title" class="section-title">
          <Icon name="user" :size="18" aria-hidden="true" />
          <span>当前身份</span>
        </h2>
        <button
          v-if="!isEditing"
          type="button"
          class="action-btn primary"
          @click="startEdit"
        >
          <Icon name="pencil" :size="14" aria-hidden="true" />
          <span>编辑</span>
        </button>
      </header>

      <!-- 展示模式 -->
      <div v-if="!isEditing" class="profile-card">
        <div class="profile-avatar" aria-hidden="true">{{ avatarInitial }}</div>
        <div class="profile-info">
          <div class="profile-name-row">
            <span class="profile-name">{{ activePersona?.name }}</span>
            <span class="badge-active" aria-label="当前激活">激活</span>
          </div>
          <p class="profile-description">
            {{ activePersona?.description || '暂无描述' }}
          </p>
          <dl class="profile-meta">
            <div class="meta-item">
              <dt>创建时间</dt>
              <dd>{{ formattedCreatedAt }}</dd>
            </div>
            <div class="meta-item">
              <dt>最后更新</dt>
              <dd>{{ formattedUpdatedAt }}</dd>
            </div>
            <div class="meta-item">
              <dt>宏替换</dt>
              <dd><code v-pre>{{user}}</code> → <strong>{{ activePersona?.name }}</strong></dd>
            </div>
          </dl>
        </div>
      </div>

      <!-- 编辑模式 -->
      <form v-else class="profile-edit-form" novalidate @submit.prevent="saveEdit">
        <div class="form-field">
          <label for="profile-name" class="field-label">
            昵称 <span class="required" aria-label="必填">*</span>
          </label>
          <input
            id="profile-name"
            ref="nameInputRef"
            v-model="editName"
            type="text"
            class="field-input"
            :class="{ 'has-error': errors.name }"
            :aria-invalid="!!errors.name"
            :aria-describedby="errors.name ? 'err-name' : 'name-help'"
            :maxlength="MAX_PERSONA_NAME_LENGTH"
            placeholder="请输入昵称"
            autocomplete="off"
            @input="validateField('name')"
          />
          <p v-if="errors.name" id="err-name" class="field-error" role="alert">
            <Icon name="alert-triangle" :size="12" aria-hidden="true" />
            <span>{{ errors.name }}</span>
          </p>
          <p v-else id="name-help" class="field-hint">
            {{ editName.length }} / {{ MAX_PERSONA_NAME_LENGTH }} 字符 · 对话中 <code v-pre>{{user}}</code> 宏将替换为此值
          </p>
        </div>

        <div class="form-field">
          <label for="profile-description" class="field-label">描述（可选）</label>
          <textarea
            id="profile-description"
            v-model="editDescription"
            class="field-input field-textarea"
            :class="{ 'has-error': errors.description }"
            :aria-invalid="!!errors.description"
            :aria-describedby="errors.description ? 'err-desc' : 'desc-help'"
            :maxlength="MAX_PERSONA_DESCRIPTION_LENGTH * 2"
            rows="4"
            placeholder="描述你的外貌、性格、背景等（注入到提示词）"
            @input="validateField('description')"
          ></textarea>
          <p v-if="errors.description" id="err-desc" class="field-error" role="alert">
            <Icon name="alert-triangle" :size="12" aria-hidden="true" />
            <span>{{ errors.description }}</span>
          </p>
          <p v-else id="desc-help" class="field-hint">
            建议 ≤ {{ MAX_PERSONA_DESCRIPTION_LENGTH }} 字符（占用永久 Token）
          </p>
        </div>

        <div class="form-actions">
          <button type="button" class="action-btn" @click="cancelEdit">取消</button>
          <button type="submit" class="action-btn primary" :disabled="!canSave">
            <Icon name="save" :size="14" aria-hidden="true" />
            <span>保存</span>
          </button>
        </div>
      </form>
    </section>

    <!-- 身份切换列表 -->
    <section v-if="hasPersona && personaStore.personas.length > 1" class="settings-section" aria-labelledby="persona-switch-title">
      <header class="section-header">
        <h2 id="persona-switch-title" class="section-title">
          <Icon name="users" :size="18" aria-hidden="true" />
          <span>身份切换</span>
        </h2>
        <p class="section-hint">点击切换当前激活身份</p>
      </header>
      <ul class="profile-list" role="list">
        <li
          v-for="p in personaStore.personas"
          :key="p.id"
          class="profile-item"
          :class="{ active: p.id === activePersona?.id }"
        >
          <button
            type="button"
            class="profile-info"
            :aria-pressed="p.id === activePersona?.id"
            :aria-label="`切换到身份 ${p.name}`"
            @click="switchPersona(p.id)"
          >
            <div class="profile-name">
              {{ p.name }}
              <span v-if="p.id === activePersona?.id" class="badge-active" aria-label="当前激活">激活</span>
            </div>
            <div class="profile-baseurl">{{ p.description || '无描述' }}</div>
          </button>
        </li>
      </ul>
    </section>
  </main>
</template>

<style scoped>
.profile-view {
  padding: 24px;
  max-width: 880px;
  margin: 0 auto;
  width: 100%;
}

.profile-header {
  margin-bottom: 24px;
}

.profile-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-display);
  font-size: 24px;
  font-weight: 600;
  color: var(--foreground);
  margin: 0 0 4px 0;
}

.profile-subtitle {
  font-size: 14px;
  color: var(--muted-foreground);
  margin: 0;
}

/* 复用 settings 页一致的 section 样式 */
.settings-section {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 20px;
  margin-bottom: 16px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  color: var(--foreground);
  margin: 0;
}

.section-hint {
  font-size: 12px;
  color: var(--muted-foreground);
  margin: 0;
}

/* 当前身份卡片 */
.profile-card {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}

.profile-avatar {
  flex-shrink: 0;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%);
  color: var(--on-accent);
  font-family: var(--font-display);
  font-size: 28px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  user-select: none;
}

.profile-info {
  flex: 1 1 0;
  min-width: 0;
}

.profile-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  flex-wrap: wrap;
}

.profile-name {
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 600;
  color: var(--foreground);
  word-break: break-word;
}

.profile-description {
  font-size: 14px;
  color: var(--muted-foreground);
  line-height: 1.6;
  margin: 0 0 12px 0;
  word-break: break-word;
  white-space: pre-wrap;
}

.profile-meta {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 8px 16px;
  margin: 0;
}

.meta-item {
  display: flex;
  gap: 8px;
  font-size: 12px;
}

.meta-item dt {
  color: var(--muted-foreground);
  flex-shrink: 0;
}

.meta-item dd {
  margin: 0;
  color: var(--foreground);
  word-break: break-word;
}

.meta-item code {
  font-family: var(--font-mono);
  font-size: 11px;
  background: var(--card-elevated);
  padding: 1px 4px;
  border-radius: var(--radius-xs);
  color: var(--secondary);
}

/* 激活徽章 */
.badge-active {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  background: var(--primary);
  color: var(--on-primary);
  font-size: 11px;
  font-weight: 600;
  border-radius: var(--radius-pill);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

/* 编辑表单 */
.profile-edit-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--foreground);
}

.required {
  color: var(--primary-fg);
}

.field-input {
  width: 100%;
  padding: 10px 12px;
  background: var(--background);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--foreground);
  font-size: 14px;
  font-family: var(--font-sans);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.field-input:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(220, 20, 52, 0.18);
}

.field-input.has-error {
  border-color: var(--error-fg);
}

.field-input.has-error:focus {
  box-shadow: 0 0 0 3px rgba(255, 100, 133, 0.18);
}

.field-textarea {
  resize: vertical;
  min-height: 96px;
  font-family: var(--font-sans);
}

.field-hint {
  font-size: 12px;
  color: var(--muted-foreground);
  margin: 0;
}

.field-hint code {
  font-family: var(--font-mono);
  font-size: 11px;
  background: var(--card-elevated);
  padding: 1px 4px;
  border-radius: var(--radius-xs);
  color: var(--secondary);
}

.field-error {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--error-fg);
  margin: 0;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

/* 按钮样式（复用 settings action-btn 风格） */
.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: var(--card-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--foreground);
  font-size: 13px;
  font-family: var(--font-sans);
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, transform 0.05s ease;
}

.action-btn:hover:not(:disabled) {
  background: var(--background);
  border-color: var(--muted-foreground);
}

.action-btn:active:not(:disabled) {
  transform: translateY(1px);
}

.action-btn:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.action-btn.primary {
  background: var(--primary);
  border-color: var(--primary);
  color: var(--on-accent);
}

.action-btn.primary:hover:not(:disabled) {
  background: var(--destructive);
  border-color: var(--destructive);
}

/* 身份列表 */
.profile-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.profile-item {
  display: flex;
  align-items: stretch;
  background: var(--card-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  overflow: hidden;
  transition: border-color 0.15s ease;
}

.profile-item.active {
  border-color: var(--primary);
}

.profile-info {
  flex: 1 1 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 14px;
  background: transparent;
  border: none;
  color: inherit;
  text-align: left;
  cursor: pointer;
  font-family: var(--font-sans);
}

.profile-info:hover {
  background: var(--background);
}

.profile-info:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: -2px;
}

.profile-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--foreground);
  display: flex;
  align-items: center;
  gap: 6px;
}

.profile-baseurl {
  font-size: 12px;
  color: var(--muted-foreground);
  word-break: break-word;
}

.empty-hint {
  text-align: center;
  padding: 32px 16px;
  color: var(--muted-foreground);
  font-size: 14px;
}

/* 响应式：小屏紧凑布局 */
@media (max-width: 639px) {
  .profile-view {
    padding: 16px;
  }

  .profile-card {
    flex-direction: column;
    align-items: center;
    text-align: center;
  }

  .profile-name-row {
    justify-content: center;
  }

  .profile-meta {
    grid-template-columns: 1fr;
  }

  .meta-item {
    flex-direction: column;
    gap: 2px;
  }
}
</style>
