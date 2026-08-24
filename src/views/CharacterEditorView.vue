<script setup lang="ts">
/**
 * CharacterEditorView — 角色卡编辑表单页 (Phase E2)
 *
 * 功能：
 * - 路由参数 :id 存在时为编辑模式（加载现有角色），否则为新建模式
 * - 表单字段：名称、头像（gradient/image URL）、描述、标签、模型、温度、maxTokens、作者笔记、作者深度
 * - 实时预览：右侧显示 Avatar + 名称 + 描述
 * - 表单验证：名称必填
 * - 操作：保存 / 取消 / 删除（编辑模式，带确认 Modal） / 导出 V2（编辑模式）
 *
 * 无障碍：
 * - 语义化 <form> <fieldset> <legend> 结构
 * - 所有输入框均关联 <label>
 * - 错误提示使用 aria-invalid + aria-describedby
 * - 保存按钮在表单未通过验证时禁用并提示原因
 */
import { ref, computed, watch, onMounted, useTemplateRef } from 'vue';
import { useRouter } from 'vue-router';
import { useCharacterStore } from '@/stores/character';
import { useLorebookStore } from '@/stores/lorebook';
import Icon from '@/components/common/Icon.vue';
import Avatar from '@/components/common/Avatar.vue';
import Modal from '@/components/common/Modal.vue';
import Toast from '@/components/common/Toast.vue';
import type { UICharacter } from '@/types';
import type { CharacterAttributes, CharacterAttribute } from '@/core/character-card';
import { t } from '@/i18n';

const props = defineProps<{
  /** 编辑模式时传入的角色 id；新建模式不传 */
  id?: string;
}>();

const router = useRouter();
const characterStore = useCharacterStore();
const lorebookStore = useLorebookStore();

// ── 需求7：角色与世界书双向绑定 ──

/** 当前角色已绑定的世界书列表（编辑模式才有效） */
const boundWorldBooks = computed(() => {
  if (!props.id) return [];
  const ids = characterStore.getBoundWorldBookIds(props.id);
  return lorebookStore.lorebooks.filter((lb) => ids.includes(lb.id));
});

/** 尚未绑定的世界书列表（用于"添加绑定"下拉） */
const unboundWorldBooks = computed(() => {
  if (!props.id) return [];
  const ids = characterStore.getBoundWorldBookIds(props.id);
  return lorebookStore.lorebooks.filter((lb) => !ids.includes(lb.id));
});

/** 绑定选择框的当前值 */
const selectedBindId = ref('');

/** 绑定选中的世界书到当前角色 */
function bindSelectedWorldBook(): void {
  if (!props.id || !selectedBindId.value) return;
  const lb = lorebookStore.lorebooks.find((l) => l.id === selectedBindId.value);
  if (!lb) return;
  const changed = characterStore.bindWorldBook(props.id, selectedBindId.value);
  if (changed) {
    showToast('success', t('charEdit.boundWorldBook', { name: lb.name }));
  }
  selectedBindId.value = '';
}

/** 解绑指定世界书 */
function unbindWorldBook(worldBookId: string): void {
  if (!props.id) return;
  const lb = lorebookStore.lorebooks.find((l) => l.id === worldBookId);
  const changed = characterStore.unbindWorldBook(props.id, worldBookId);
  if (changed) {
    showToast('info', t('charEdit.unboundWorldBook', { name: lb?.name ?? worldBookId }));
  }
}

// ── 表单状态 ──
interface FormState {
  name: string;
  description: string;
  personality: string;
  scenario: string;
  tagsText: string; // 逗号分隔
  avatarType: 'image' | 'gradient';
  avatar: string; // image URL
  gradientFrom: string;
  gradientTo: string;
  initial: string;
  model: string;
  temperature: number;
  maxTokens: number;
  authorNote: string;
  authorDepth: number;
  favorite: boolean;
  // F01.6 角色属性
  attrEnabled: boolean;
  attributesOpen: boolean; // 折叠面板展开状态（默认收起）
  profession: string;
  level: number;
  experience: number;
  stats: CharacterAttribute[];
}

const emptyForm = (): FormState => ({
  name: '',
  description: '',
  personality: '',
  scenario: '',
  tagsText: '',
  avatarType: 'gradient',
  avatar: '',
  gradientFrom: 'var(--tk-cyan-500)',
  gradientTo: 'var(--tk-cyan-700)',
  initial: '',
  model: 'GPT-4o',
  temperature: 1.0,
  maxTokens: 4096,
  authorNote: '',
  authorDepth: 4,
  favorite: false,
  // F01.6 角色属性默认值
  attrEnabled: false,
  attributesOpen: false,
  profession: '',
  level: 1,
  experience: 0,
  stats: [],
});

const form = ref<FormState>(emptyForm());
const isEditMode = computed(() => !!props.id);
const loadedCharacter = ref<UICharacter | null>(null);
const isDirty = ref(false);

// ── 表单验证 ──
const errors = computed<Record<string, string>>(() => {
  const e: Record<string, string> = {};
  if (!form.value.name.trim()) {
    e.name = t('charEdit.nameRequired');
  } else if (form.value.name.trim().length > 64) {
    e.name = t('charEdit.nameTooLong');
  }
  if (form.value.avatarType === 'image' && !form.value.avatar.trim()) {
    e.avatar = t('charEdit.avatarRequired');
  }
  if (
    form.value.avatarType === 'gradient' &&
    (!form.value.gradientFrom.trim() || !form.value.gradientTo.trim())
  ) {
    e.gradient = t('charEdit.gradientRequired');
  }
  if (form.value.temperature < 0 || form.value.temperature > 2) {
    e.temperature = t('charEdit.tempRange');
  }
  if (form.value.maxTokens < 1 || form.value.maxTokens > 32768) {
    e.maxTokens = t('charEdit.maxTokensRange');
  }
  if (form.value.authorDepth < 0 || form.value.authorDepth > 50) {
    e.authorDepth = t('charEdit.depthRange');
  }
  // F01.6 角色属性校验
  if (form.value.attrEnabled) {
    if (
      !Number.isInteger(form.value.level) ||
      form.value.level < 0 ||
      form.value.level > 9999
    ) {
      e.level = t('charEdit.levelInvalid');
    }
    if (
      !Number.isInteger(form.value.experience) ||
      form.value.experience < 0
    ) {
      e.experience = t('charEdit.expInvalid');
    }
    // 校验属性名重复
    const names = form.value.stats
      .map((s) => s.name.trim())
      .filter((n) => n !== '');
    const dup = names.find((n, i) => names.indexOf(n) !== i);
    if (dup) {
      e.stats = t('charEdit.statsDuplicate', { name: dup });
    }
  }
  return e;
});

const hasErrors = computed(() => Object.keys(errors.value).length > 0);
const canSave = computed(() => !hasErrors.value && form.value.name.trim().length > 0);

// ── 标签解析 ──
function parseTags(text: string): string[] {
  return text
    .split(/[,，;；\n]/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .slice(0, 16);
}

function tagsToText(tags: string[]): string {
  return tags.join(', ');
}

// ── 加载已有角色（编辑模式） ──
function loadCharacter(c: UICharacter) {
  loadedCharacter.value = c;
  form.value = {
    name: c.name,
    description: c.description,
    personality: c.personality ?? '',
    scenario: c.scenario ?? '',
    tagsText: tagsToText(c.tags),
    avatarType: c.avatarType,
    avatar: c.avatar ?? '',
    gradientFrom: c.gradientFrom ?? 'var(--tk-cyan-500)',
    gradientTo: c.gradientTo ?? 'var(--tk-cyan-700)',
    initial: c.initial ?? '',
    model: c.model,
    temperature: c.temperature,
    maxTokens: c.maxTokens,
    authorNote: c.authorNote,
    authorDepth: c.authorDepth,
    favorite: c.favorite,
    // F01.6 加载角色属性
    attrEnabled: !!c.attributes,
    attributesOpen: false,
    profession: c.attributes?.profession ?? '',
    level: c.attributes?.level ?? 1,
    experience: c.attributes?.experience ?? 0,
    stats: c.attributes?.stats
      ? c.attributes.stats.map((s) => ({ ...s }))
      : [],
  };
  isDirty.value = false;
}

onMounted(() => {
  if (props.id) {
    const found = characterStore.characters.find((c) => c.id === props.id);
    if (!found) {
      // 角色不存在，返回列表
      showToast('error', t('charEdit.notFound'));
      setTimeout(() => void router.replace({ name: 'character-list' }), 800);
      return;
    }
    loadCharacter(found);
  } else {
    // 新建模式：空表单
    form.value = emptyForm();
    isDirty.value = false;
  }
});

// 标记表单被修改
watch(
  form,
  () => {
    isDirty.value = true;
  },
  { deep: true }
);

// ── 预览角色（基于当前表单状态构造一个 UICharacter 给 Avatar 组件） ──
const previewCharacter = computed<UICharacter>(() => ({
  id: props.id ?? 'preview',
  name: form.value.name || t('charEdit.unnamed'),
  avatarType: form.value.avatarType,
  avatar: form.value.avatar || undefined,
  gradientFrom: form.value.gradientFrom,
  gradientTo: form.value.gradientTo,
  initial: form.value.initial || form.value.name[0] || '?',
  lastActive: t('charEdit.justNow'),
  favorite: form.value.favorite,
  tags: parseTags(form.value.tagsText),
  description: form.value.description || t('charEdit.noDesc'),
  model: form.value.model,
  conversations: [],
  messages: [],
  authorNote: form.value.authorNote,
  authorDepth: form.value.authorDepth,
  temperature: form.value.temperature,
  maxTokens: form.value.maxTokens,
  worldEntries: [],
  tokenBudget: { character: 0, worldInfo: 0, chatHistory: 0, remaining: 8192 },
  // F01.6 角色属性预览
  attributes: buildAttributes(),
}));

// ── Toast 反馈 ──
const toastOpen = ref(false);
const toastType = ref<'info' | 'success' | 'error'>('info');
const toastMessage = ref('');

function showToast(type: 'info' | 'success' | 'error', message: string) {
  toastType.value = type;
  toastMessage.value = message;
  toastOpen.value = true;
}

// 监听 store 错误
watch(
  () => characterStore.lastError,
  (err) => {
    if (err) showToast('error', err);
  }
);
watch(
  () => characterStore.lastInfo,
  (info) => {
    if (info) showToast('success', info);
  }
);

// ── 删除确认 ──
const deleteModalOpen = ref(false);

function openDeleteConfirm() {
  if (!props.id) return;
  deleteModalOpen.value = true;
}

function executeDelete() {
  if (!props.id) return;
  const name = loadedCharacter.value?.name ?? '';
  characterStore.deleteCharacter(props.id);
  deleteModalOpen.value = false;
  showToast('success', t('charEdit.deleted', { name }));
  setTimeout(() => void router.replace({ name: 'character-list' }), 600);
}

// ── 头像上传（base64 dataURL） ──
const avatarInput = useTemplateRef<HTMLInputElement>('avatarInput');

function triggerAvatarUpload() {
  avatarInput.value?.click();
}

function handleAvatarSelected(e: Event) {
  const input = e.target as HTMLInputElement;
  if (!input.files || input.files.length === 0) return;
  const file = input.files[0]!;
  // 限制 1MB
  if (file.size > 1024 * 1024) {
    showToast('error', t('charEdit.avatarTooLarge'));
    input.value = '';
    return;
  }
  if (!file.type.startsWith('image/')) {
    showToast('error', t('charEdit.avatarNotImage'));
    input.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    form.value.avatar = String(reader.result);
    form.value.avatarType = 'image';
    showToast('success', t('charEdit.avatarLoaded'));
  };
  reader.onerror = () => {
    showToast('error', t('charEdit.avatarReadFailed'));
  };
  reader.readAsDataURL(file);
  input.value = '';
}

// ── 颜色快选 ──
const colorPresets: Array<{ from: string; to: string; label: string }> = [
  { from: 'var(--tk-cyan-500)', to: 'var(--tk-cyan-700)', label: t('charEdit.colorCyan') },
  { from: 'var(--tk-red-500)', to: 'var(--tk-red-700)', label: t('charEdit.colorRed') },
  { from: '#a78bfa', to: '#7c3aed', label: t('charEdit.colorPurple') },
  { from: '#f472b6', to: '#db2777', label: t('charEdit.colorPink') },
  { from: '#34d399', to: '#047857', label: t('charEdit.colorGreen') },
  { from: '#fbbf24', to: '#d97706', label: t('charEdit.colorGold') },
];

function applyPreset(p: { from: string; to: string }) {
  form.value.gradientFrom = p.from;
  form.value.gradientTo = p.to;
  form.value.avatarType = 'gradient';
}

// ── 保存 ──

/**
 * F01.6 从表单构建 CharacterAttributes 对象
 * 仅在 attrEnabled 为 true 且有有效内容时返回，否则返回 undefined
 */
function buildAttributes(): CharacterAttributes | undefined {
  if (!form.value.attrEnabled) return undefined;

  const attrs: CharacterAttributes = {};
  if (form.value.profession.trim()) {
    attrs.profession = form.value.profession.trim();
  }
  attrs.level = form.value.level;
  attrs.experience = form.value.experience;

  const validStats = form.value.stats
    .filter((s) => s.name.trim() !== '')
    .map((s) => ({
      name: s.name.trim(),
      value: s.value,
      type: s.type,
    }));
  if (validStats.length > 0) {
    attrs.stats = validStats;
  }

  return attrs;
}

/**
 * F01.6 添加属性行
 */
function addStat(): void {
  form.value.stats.push({ name: '', value: '', type: 'number' });
  form.value.attributesOpen = true;
}

/**
 * F01.6 删除指定属性行
 */
function removeStat(index: number): void {
  form.value.stats.splice(index, 1);
}

function buildPatch(): Partial<UICharacter> {
  const attributes = buildAttributes();
  return {
    name: form.value.name.trim(),
    description: form.value.description,
    personality: form.value.personality.trim() || undefined,
    scenario: form.value.scenario.trim() || undefined,
    tags: parseTags(form.value.tagsText),
    avatarType: form.value.avatarType,
    avatar: form.value.avatarType === 'image' ? form.value.avatar : undefined,
    gradientFrom: form.value.gradientFrom,
    gradientTo: form.value.gradientTo,
    initial: form.value.initial || form.value.name[0] || '?',
    model: form.value.model,
    temperature: form.value.temperature,
    maxTokens: form.value.maxTokens,
    authorNote: form.value.authorNote,
    authorDepth: form.value.authorDepth,
    favorite: form.value.favorite,
    // F01.6 角色属性（undefined 时清除已有属性）
    attributes,
  };
}

function handleSave() {
  if (hasErrors.value) {
    showToast('error', t('charEdit.fixErrors'));
    return;
  }
  if (isEditMode.value && props.id) {
    const ok = characterStore.updateCharacter(props.id, buildPatch());
    if (ok) {
      showToast('success', t('charEdit.saved'));
      setTimeout(() => void router.replace({ name: 'character-list' }), 600);
    } else {
      showToast('error', t('charEdit.saveFailed'));
    }
  } else {
    // 新建：先 createCharacter 再 updateCharacter
    const newId = characterStore.createCharacter();
    characterStore.updateCharacter(newId, buildPatch());
    showToast('success', t('charEdit.created'));
    setTimeout(() => void router.replace({ name: 'character-list' }), 600);
  }
}

// ── 取消（带未保存确认，P1-3 改用应用内 Modal 替代原生 confirm） ──
const unsavedConfirmOpen = ref(false);

function handleCancel() {
  if (isDirty.value && canSave.value) {
    unsavedConfirmOpen.value = true;
    return;
  }
  router.back();
}

function confirmLeaveEditor() {
  unsavedConfirmOpen.value = false;
  router.back();
}

// ── 导出 V2 ──
function handleExport() {
  if (!props.id) return;
  characterStore.downloadV2(props.id);
}
</script>

<template>
  <main id="main-content" class="editor-view" :aria-label="t('charEdit.aria')" tabindex="-1">
    <!-- 顶部工具栏 -->
    <header class="editor-header">
      <button
        type="button"
        class="header-btn back"
        :aria-label="t('charEdit.backAria')"
        @click="handleCancel"
      >
        <Icon name="arrow-left" :size="16" />
        <span class="btn-label">{{ t('charEdit.back') }}</span>
      </button>

      <h1 class="editor-title">
        {{ isEditMode ? t('charEdit.editTitle') : t('charEdit.newTitle') }}
      </h1>

      <div class="header-actions">
        <button
          v-if="isEditMode"
          type="button"
          class="header-btn export"
          :aria-label="t('charEdit.exportAria')"
          @click="handleExport"
        >
          <Icon name="download" :size="16" />
          <span class="btn-label">{{ t('charEdit.export') }}</span>
        </button>
        <button
          v-if="isEditMode"
          type="button"
          class="header-btn delete"
          :aria-label="t('charEdit.deleteAria')"
          @click="openDeleteConfirm"
        >
          <Icon name="trash-2" :size="16" />
          <span class="btn-label">{{ t('charEdit.delete') }}</span>
        </button>
        <button
          type="button"
          class="header-btn cancel"
          :aria-label="t('charEdit.cancel')"
          @click="handleCancel"
        >
          {{ t('charEdit.cancel') }}
        </button>
        <button
          type="button"
          class="header-btn save"
          :disabled="!canSave"
          :aria-disabled="!canSave"
          :aria-label="canSave ? t('charEdit.saveAria') : t('charEdit.saveDisabled')"
          @click="handleSave"
        >
          <Icon name="save" :size="16" />
          <span class="btn-label">{{ t('charEdit.save') }}</span>
        </button>
      </div>
    </header>

    <!-- 主体：表单 + 预览 -->
    <div class="editor-body tk-scroll">
      <form
        class="editor-form"
        novalidate
        @submit.prevent="handleSave"
      >
        <!-- 基本信息 -->
        <fieldset class="form-section">
          <legend class="section-title">{{ t('charEdit.basicTitle') }}</legend>

          <div class="field">
            <label for="f-name" class="field-label">
              {{ t('charEdit.nameLabel') }} <span class="required" aria-hidden="true">*</span>
            </label>
            <input
              id="f-name"
              v-model="form.name"
              type="text"
              class="field-input"
              :class="{ 'has-error': errors.name }"
              :aria-invalid="!!errors.name"
              :aria-describedby="errors.name ? 'err-name' : undefined"
              maxlength="64"
              required
              autocomplete="off"
            />
            <p v-if="errors.name" id="err-name" class="field-error" role="alert">
              <Icon name="alert-triangle" :size="12" />
              <span>{{ errors.name }}</span>
            </p>
          </div>

          <div class="field">
            <label for="f-tags" class="field-label">{{ t('charEdit.tagsLabel') }}</label>
            <input
              id="f-tags"
              v-model="form.tagsText"
              type="text"
              class="field-input"
              :placeholder="t('charEdit.tagsPlaceholder')"
              autocomplete="off"
            />
            <p class="field-hint">{{ t('charEdit.tagsHint') }}</p>
          </div>

          <div class="field">
            <label for="f-desc" class="field-label">{{ t('charEdit.descLabel') }}</label>
            <textarea
              id="f-desc"
              v-model="form.description"
              class="field-input field-textarea"
              rows="5"
              :placeholder="t('charEdit.descPlaceholder')"
            ></textarea>
          </div>

          <div class="field">
            <label for="f-personality" class="field-label">{{ t('charEdit.personalityLabel') }}</label>
            <textarea
              id="f-personality"
              v-model="form.personality"
              class="field-input field-textarea"
              rows="4"
              :placeholder="t('charEdit.personalityPlaceholder')"
            ></textarea>
            <p class="field-hint">{{ t('charEdit.personalityHint') }}</p>
          </div>

          <div class="field">
            <label for="f-scenario" class="field-label">{{ t('charEdit.scenarioLabel') }}</label>
            <textarea
              id="f-scenario"
              v-model="form.scenario"
              class="field-input field-textarea"
              rows="4"
              :placeholder="t('charEdit.scenarioPlaceholder')"
            ></textarea>
            <p class="field-hint">{{ t('charEdit.scenarioHint') }}</p>
          </div>

          <div class="field field-inline">
            <label class="field-checkbox">
              <input
                v-model="form.favorite"
                type="checkbox"
              />
              <span>{{ t('charEdit.favorite') }}</span>
            </label>
          </div>
        </fieldset>

        <!-- 头像 -->
        <fieldset class="form-section">
          <legend class="section-title">{{ t('charEdit.avatarTitle') }}</legend>

          <div class="avatar-type-switch" role="radiogroup" :aria-label="t('charEdit.avatarTypeAria')">
            <button
              type="button"
              class="type-btn"
              :class="{ active: form.avatarType === 'gradient' }"
              :aria-pressed="form.avatarType === 'gradient'"
              @click="form.avatarType = 'gradient'"
            >
              <Icon name="palette" :size="14" />
              <span>{{ t('charEdit.avatarGradient') }}</span>
            </button>
            <button
              type="button"
              class="type-btn"
              :class="{ active: form.avatarType === 'image' }"
              :aria-pressed="form.avatarType === 'image'"
              @click="form.avatarType = 'image'"
            >
              <Icon name="image" :size="14" />
              <span>{{ t('charEdit.avatarImage') }}</span>
            </button>
          </div>

          <!-- 渐变色配置 -->
          <div v-if="form.avatarType === 'gradient'" class="field">
            <label class="field-label">{{ t('charEdit.gradientPresets') }}</label>
            <div class="preset-row">
              <button
                v-for="p in colorPresets"
                :key="p.label"
                type="button"
                class="preset-swatch"
                :style="{
                  background: `linear-gradient(135deg, ${p.from}, ${p.to})`,
                }"
                :aria-label="t('charEdit.applyPresetAria', { label: p.label })"
                @click="applyPreset(p)"
              >
                <Icon
                  v-if="form.gradientFrom === p.from && form.gradientTo === p.to"
                  name="check"
                  :size="14"
                />
              </button>
            </div>

            <div class="color-row">
              <div class="color-field">
                <label for="f-grad-from" class="field-label">{{ t('charEdit.gradientFrom') }}</label>
                <input
                  id="f-grad-from"
                  v-model="form.gradientFrom"
                  type="text"
                  class="field-input"
                  :class="{ 'has-error': errors.gradient }"
                  :aria-invalid="!!errors.gradient"
                  :aria-describedby="errors.gradient ? 'err-grad' : undefined"
                  :placeholder="t('charEdit.gradientFromPlaceholder')"
                />
              </div>
              <div class="color-field">
                <label for="f-grad-to" class="field-label">{{ t('charEdit.gradientTo') }}</label>
                <input
                  id="f-grad-to"
                  v-model="form.gradientTo"
                  type="text"
                  class="field-input"
                  :class="{ 'has-error': errors.gradient }"
                  :placeholder="t('charEdit.gradientToPlaceholder')"
                />
              </div>
            </div>
            <p v-if="errors.gradient" id="err-grad" class="field-error" role="alert">
              <Icon name="alert-triangle" :size="12" />
              <span>{{ errors.gradient }}</span>
            </p>
          </div>

          <!-- 图片头像配置 -->
          <div v-else class="field">
            <label for="f-avatar-url" class="field-label">{{ t('charEdit.avatarUrl') }}</label>
            <input
              id="f-avatar-url"
              v-model="form.avatar"
              type="text"
              class="field-input"
              :class="{ 'has-error': errors.avatar }"
              :aria-invalid="!!errors.avatar"
              :aria-describedby="errors.avatar ? 'err-avatar' : undefined"
              :placeholder="t('charEdit.avatarUrlPlaceholder')"
              autocomplete="off"
            />
            <p v-if="errors.avatar" id="err-avatar" class="field-error" role="alert">
              <Icon name="alert-triangle" :size="12" />
              <span>{{ errors.avatar }}</span>
            </p>

            <div class="upload-row">
              <button
                type="button"
                class="upload-btn"
                @click="triggerAvatarUpload"
              >
                <Icon name="upload" :size="14" />
                <span>{{ t('charEdit.uploadLocal') }}</span>
              </button>
              <input
                ref="avatarInput"
                type="file"
                accept="image/*"
                class="hidden-file-input"
                aria-hidden="true"
                tabindex="-1"
                @change="handleAvatarSelected"
              />
              <span class="upload-hint">{{ t('charEdit.uploadHint') }}</span>
            </div>
          </div>

          <div class="field">
            <label for="f-initial" class="field-label">{{ t('charEdit.initialLabel') }}</label>
            <input
              id="f-initial"
              v-model="form.initial"
              type="text"
              class="field-input field-initial"
              maxlength="2"
              :placeholder="t('charEdit.initialPlaceholder')"
              autocomplete="off"
            />
          </div>
        </fieldset>

        <!-- 模型设置 -->
        <fieldset class="form-section">
          <legend class="section-title">{{ t('charEdit.modelTitle') }}</legend>

          <div class="field">
            <label for="f-temp" class="field-label">
              {{ t('charEdit.temperatureLabel') }} <span class="value-badge">{{ form.temperature.toFixed(2) }}</span>
            </label>
            <input
              id="f-temp"
              v-model.number="form.temperature"
              type="range"
              min="0"
              max="2"
              step="0.05"
              class="field-range"
              :aria-invalid="!!errors.temperature"
              :aria-describedby="errors.temperature ? 'err-temp' : undefined"
            />
            <p v-if="errors.temperature" id="err-temp" class="field-error" role="alert">
              <Icon name="alert-triangle" :size="12" />
              <span>{{ errors.temperature }}</span>
            </p>
            <p v-else class="field-hint">{{ t('charEdit.temperatureHint') }}</p>
          </div>

          <div class="field">
            <label for="f-maxtok" class="field-label">{{ t('charEdit.maxTokensLabel') }}</label>
            <input
              id="f-maxtok"
              v-model.number="form.maxTokens"
              type="number"
              min="1"
              max="32768"
              step="1"
              class="field-input"
              :class="{ 'has-error': errors.maxTokens }"
              :aria-invalid="!!errors.maxTokens"
              :aria-describedby="errors.maxTokens ? 'err-maxtok' : undefined"
            />
            <p v-if="errors.maxTokens" id="err-maxtok" class="field-error" role="alert">
              <Icon name="alert-triangle" :size="12" />
              <span>{{ errors.maxTokens }}</span>
            </p>
          </div>
        </fieldset>

        <!-- F01.6 角色属性 -->
        <fieldset class="form-section">
          <legend class="section-title attr-legend">
            <span>{{ t('charEdit.attrTitle') }}</span>
            <label class="attr-switch">
              <input
                v-model="form.attrEnabled"
                type="checkbox"
                :aria-label="form.attrEnabled ? t('charEdit.attrOnAria') : t('charEdit.attrOffAria')"
                @change="form.attrEnabled && (form.attributesOpen = true)"
              />
              <span class="switch-track" :class="{ on: form.attrEnabled }" aria-hidden="true">
                <span class="switch-thumb"></span>
              </span>
            </label>
            <span v-if="form.attrEnabled" class="attr-badge">{{ t('charEdit.attrEnabled') }}</span>
          </legend>

          <div v-if="form.attrEnabled">
            <button
              type="button"
              class="collapse-toggle"
              :aria-expanded="form.attributesOpen"
              @click="form.attributesOpen = !form.attributesOpen"
            >
              <Icon
                :name="form.attributesOpen ? 'chevron-down' : 'chevron-right'"
                :size="14"
              />
              <span>{{ form.attributesOpen ? t('charEdit.collapseAttrs') : t('charEdit.expandAttrs') }}</span>
            </button>

            <div v-show="form.attributesOpen" class="attr-content">
              <div class="field">
                <label for="f-profession" class="field-label">{{ t('charEdit.professionLabel') }}</label>
                <input
                  id="f-profession"
                  v-model="form.profession"
                  type="text"
                  class="field-input"
                  :placeholder="t('charEdit.professionPlaceholder')"
                  maxlength="30"
                  autocomplete="off"
                />
              </div>

              <div class="attr-row">
                <div class="field">
                  <label for="f-level" class="field-label">
                    {{ t('charEdit.levelLabel') }}
                    <span v-if="errors.level" class="value-badge err" role="alert">{{ errors.level }}</span>
                  </label>
                  <input
                    id="f-level"
                    v-model.number="form.level"
                    type="number"
                    min="0"
                    max="9999"
                    step="1"
                    class="field-input"
                    :class="{ 'has-error': errors.level }"
                    :aria-invalid="!!errors.level"
                  />
                </div>
                <div class="field">
                  <label for="f-exp" class="field-label">
                    {{ t('charEdit.expLabel') }}
                    <span v-if="errors.experience" class="value-badge err" role="alert">{{ errors.experience }}</span>
                  </label>
                  <input
                    id="f-exp"
                    v-model.number="form.experience"
                    type="number"
                    min="0"
                    step="1"
                    class="field-input"
                    :class="{ 'has-error': errors.experience }"
                    :aria-invalid="!!errors.experience"
                  />
                </div>
              </div>

              <div class="field">
                <div class="stats-header">
                  <label class="field-label">{{ t('charEdit.statsLabel') }}</label>
                  <button
                    type="button"
                    class="add-stat-btn"
                    @click="addStat"
                  >
                    <Icon name="plus" :size="12" />
                    <span>{{ t('charEdit.addStat') }}</span>
                  </button>
                </div>
                <p v-if="errors.stats" class="field-error" role="alert">
                  <Icon name="alert-triangle" :size="12" />
                  <span>{{ errors.stats }}</span>
                </p>
                <div v-if="form.stats.length > 0" class="stats-list">
                  <div
                    v-for="(stat, idx) in form.stats"
                    :key="idx"
                    class="stat-row"
                  >
                    <input
                      v-model="stat.name"
                      type="text"
                      class="stat-input stat-name"
                      :placeholder="t('charEdit.statNamePlaceholder')"
                      maxlength="20"
                      autocomplete="off"
                      :aria-label="t('charEdit.statNameAria', { index: idx + 1 })"
                    />
                    <input
                      v-model="stat.value"
                      type="text"
                      class="stat-input stat-value"
                      :placeholder="t('charEdit.statValuePlaceholder')"
                      autocomplete="off"
                      :aria-label="t('charEdit.statValueAria', { index: idx + 1 })"
                    />
                    <select
                      v-model="stat.type"
                      class="stat-select"
                      :aria-label="t('charEdit.statTypeAria', { index: idx + 1 })"
                    >
                      <option value="number">{{ t('charEdit.statTypeNumber') }}</option>
                      <option value="text">{{ t('charEdit.statTypeText') }}</option>
                    </select>
                    <button
                      type="button"
                      class="stat-remove"
                      :aria-label="t('charEdit.statRemoveAria', { index: idx + 1 })"
                      @click="removeStat(idx)"
                    >
                      <Icon name="trash-2" :size="14" />
                    </button>
                  </div>
                </div>
                <p v-else class="field-hint">{{ t('charEdit.statEmptyHint') }}</p>
              </div>
            </div>
          </div>
          <p v-else class="field-hint">{{ t('charEdit.attrOffHint') }}</p>
        </fieldset>

        <!-- 高级 -->
        <fieldset class="form-section">
          <legend class="section-title">{{ t('charEdit.advancedTitle') }}</legend>

          <div class="field">
            <label for="f-author-note" class="field-label">{{ t('charEdit.authorNoteLabel') }}</label>
            <textarea
              id="f-author-note"
              v-model="form.authorNote"
              class="field-input field-textarea"
              rows="4"
              :placeholder="t('charEdit.authorNotePlaceholder')"
            ></textarea>
            <p class="field-hint">{{ t('charEdit.authorNoteHint') }}</p>
          </div>

          <div class="field">
            <label for="f-depth" class="field-label">
              {{ t('charEdit.authorDepthLabel') }} <span class="value-badge">{{ form.authorDepth }}</span>
            </label>
            <input
              id="f-depth"
              v-model.number="form.authorDepth"
              type="range"
              min="0"
              max="50"
              step="1"
              class="field-range"
              :aria-invalid="!!errors.authorDepth"
              :aria-describedby="errors.authorDepth ? 'err-depth' : undefined"
            />
            <p v-if="errors.authorDepth" id="err-depth" class="field-error" role="alert">
              <Icon name="alert-triangle" :size="12" />
              <span>{{ errors.authorDepth }}</span>
            </p>
            <p v-else class="field-hint">{{ t('charEdit.authorDepthHint') }}</p>
          </div>
        </fieldset>

        <!-- 需求7：世界书绑定（仅编辑模式） -->
        <fieldset v-if="isEditMode" class="form-section">
          <legend class="section-title">{{ t('charEdit.wbTitle') }}</legend>
          <p class="field-hint">
            {{ t('charEdit.wbHint') }}
          </p>

          <!-- 已绑定的世界书列表 -->
          <div v-if="boundWorldBooks.length" class="wb-bind-list" role="list" :aria-label="t('charEdit.wbBoundAria')">
            <div
              v-for="lb in boundWorldBooks"
              :key="lb.id"
              class="wb-bind-item"
              role="listitem"
            >
              <div class="wb-bind-info">
                <Icon name="book-open" :size="14" aria-hidden="true" />
                <span class="wb-bind-name">{{ lb.name }}</span>
                <span class="wb-bind-meta">{{ t('charEdit.wbEntryCount', { count: lb.entries.length }) }}</span>
              </div>
              <button
                type="button"
                class="wb-unbind-btn"
                :aria-label="t('charEdit.wbUnbindAria', { name: lb.name })"
                @click="unbindWorldBook(lb.id)"
              >
                <Icon name="close" :size="12" />
                <span>{{ t('charEdit.wbUnbind') }}</span>
              </button>
            </div>
          </div>
          <p v-else class="wb-bind-empty">{{ t('charEdit.wbEmpty') }}</p>

          <!-- 添加绑定 -->
          <div v-if="unboundWorldBooks.length" class="wb-add-bind">
            <label for="f-wb-select" class="field-label">{{ t('charEdit.wbAddLabel') }}</label>
            <div class="wb-add-row">
              <select
                id="f-wb-select"
                v-model="selectedBindId"
                class="field-input wb-select"
                :aria-label="t('charEdit.wbSelectAria')"
              >
                <option value="" disabled>{{ t('charEdit.wbSelectPlaceholder') }}</option>
                <option v-for="lb in unboundWorldBooks" :key="lb.id" :value="lb.id">
                  {{ t('charEdit.wbEntryCount2', { name: lb.name, count: lb.entries.length }) }}
                </option>
              </select>
              <button
                type="button"
                class="wb-bind-btn"
                :disabled="!selectedBindId"
                :aria-disabled="!selectedBindId"
                :aria-label="t('charEdit.wbBindAria')"
                @click="bindSelectedWorldBook"
              >
                <Icon name="plus" :size="14" />
                <span>{{ t('charEdit.wbBind') }}</span>
              </button>
            </div>
          </div>
          <p v-else-if="boundWorldBooks.length" class="field-hint">
            {{ t('charEdit.wbAllBound') }}
          </p>
        </fieldset>

        <!-- 表单底部按钮（移动端使用） -->
        <div class="form-footer">
          <button type="button" class="footer-btn cancel" @click="handleCancel">{{ t('charEdit.cancel') }}</button>
          <button
            type="submit"
            class="footer-btn save"
            :disabled="!canSave"
            :aria-disabled="!canSave"
          >
            <Icon name="save" :size="14" />
            <span>{{ t('charEdit.save') }}</span>
          </button>
        </div>
      </form>

      <!-- 实时预览 -->
      <aside class="editor-preview" :aria-label="t('charEdit.previewTitle')">
        <h2 class="preview-title">{{ t('charEdit.previewTitle') }}</h2>
        <div class="preview-card">
          <div class="preview-avatar-wrap">
            <Avatar :character="previewCharacter" :size="80" />
          </div>
          <h3 class="preview-name">{{ previewCharacter.name }}</h3>
          <p v-if="previewCharacter.tags.length" class="preview-tags">
            {{ previewCharacter.tags.join(' · ') }}
          </p>
          <p class="preview-desc">{{ previewCharacter.description }}</p>
          <dl class="preview-meta">
            <div class="meta-row">
              <dt>{{ t('charEdit.previewModel') }}</dt>
              <dd>{{ previewCharacter.model }}</dd>
            </div>
            <div class="meta-row">
              <dt>{{ t('charEdit.previewTemp') }}</dt>
              <dd>{{ previewCharacter.temperature.toFixed(2) }}</dd>
            </div>
            <div class="meta-row">
              <dt>{{ t('charEdit.previewMaxTokens') }}</dt>
              <dd>{{ previewCharacter.maxTokens }}</dd>
            </div>
            <div class="meta-row">
              <dt>{{ t('charEdit.previewDepth') }}</dt>
              <dd>{{ previewCharacter.authorDepth }}</dd>
            </div>
            <div class="meta-row">
              <dt>{{ t('charEdit.previewFavorite') }}</dt>
              <dd>{{ previewCharacter.favorite ? t('charEdit.previewYes') : t('charEdit.previewNo') }}</dd>
            </div>
          </dl>
        </div>
      </aside>
    </div>

    <!-- 删除确认 -->
    <Modal
      v-model="deleteModalOpen"
      :title="t('charEdit.deleteTitle')"
      :aria-label="t('charEdit.deleteAria2')"
    >
      <p v-if="loadedCharacter">
        {{ t('charEdit.deleteConfirm', { name: loadedCharacter.name }) }}
      </p>
      <p class="delete-warning">
        {{ t('charEdit.deleteWarning') }}
      </p>
      <template #footer>
        <button
          type="button"
          class="modal-btn modal-cancel"
          @click="deleteModalOpen = false"
        >
          {{ t('charEdit.cancel') }}
        </button>
        <button
          type="button"
          class="modal-btn modal-confirm"
          @click="executeDelete"
        >
          {{ t('charEdit.delete') }}
        </button>
      </template>
    </Modal>

    <!-- P1-3：取消编辑时未保存确认（替代原生 confirm） -->
    <Modal v-model="unsavedConfirmOpen" :title="t('charEdit.unsavedTitle')">
      <p>{{ t('charEdit.unsaved') }}</p>
      <template #footer>
        <button
          type="button"
          class="modal-btn modal-cancel"
          @click="unsavedConfirmOpen = false"
        >
          {{ t('common.cancel') }}
        </button>
        <button
          type="button"
          class="modal-btn modal-confirm"
          @click="confirmLeaveEditor"
        >
          {{ t('common.confirm') }}
        </button>
      </template>
    </Modal>

    <Toast
      v-model="toastOpen"
      :type="toastType"
      :message="toastMessage"
    />
  </main>
</template>

<style scoped>
.editor-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 24px;
  gap: 16px;
}

.editor-header {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.editor-title {
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 600;
  color: var(--foreground);
  margin: 0;
  flex: 1;
  min-width: 120px;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.header-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 14px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: var(--card-elevated);
  color: var(--foreground);
  font-size: 13px;
  cursor: pointer;
  transition: background-color .15s ease, border-color .15s ease, color .15s ease;
}

.header-btn:hover {
  border-color: var(--secondary);
  color: var(--secondary);
}

.header-btn:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 2px;
}

.header-btn.save {
  background: var(--primary);
  border-color: var(--primary);
  color: var(--on-media);
}

.header-btn.save:hover:not(:disabled) {
  background: var(--destructive);
  border-color: var(--destructive);
  color: var(--on-accent);
}

.header-btn.save:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.header-btn.delete:hover {
  border-color: var(--destructive);
  color: var(--destructive);
}

.header-btn.back {
  background: none;
}

/* 主体布局：表单 + 预览（桌面双列） */
.editor-body {
  flex: 1;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 24px;
  overflow-y: auto;
  padding-right: 4px;
}

.editor-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.form-section {
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 16px;
  background: var(--card);
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.section-title {
  font-family: var(--font-display);
  font-size: 14px;
  font-weight: 600;
  color: var(--foreground);
  padding: 0 4px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 12px;
  color: var(--muted-foreground);
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 8px;
}

.required {
  color: var(--destructive);
}

.value-badge {
  background: var(--video-bg);
  border: 1px solid var(--border);
  padding: 1px 8px;
  border-radius: var(--radius-pill);
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--secondary);
}

.field-input {
  height: 36px;
  padding: 0 12px;
  background: var(--video-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--foreground);
  font-size: 13px;
  font-family: var(--font-sans);
  outline: none;
  transition: border-color .15s ease, box-shadow .15s ease;
  width: 100%;
}

.field-input:focus-visible {
  border-color: var(--secondary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--secondary) 20%, transparent);
}

.field-input.has-error {
  border-color: var(--destructive);
}

.field-textarea {
  height: auto;
  padding: 10px 12px;
  line-height: 1.5;
  resize: vertical;
  min-height: 80px;
  font-family: var(--font-sans);
}

.field-initial {
  max-width: 80px;
}

.field-range {
  width: 100%;
  accent-color: var(--secondary);
}

.field-error {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--destructive);
  margin: 0;
}

.field-hint {
  font-size: 11px;
  color: var(--muted-foreground);
  margin: 0;
}

.field-inline {
  flex-direction: row;
  align-items: center;
}

.field-checkbox {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--foreground);
  cursor: pointer;
}

.field-checkbox input {
  width: 16px;
  height: 16px;
  accent-color: var(--secondary);
}

.avatar-type-switch {
  display: inline-flex;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  overflow: hidden;
  width: fit-content;
}

.type-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: var(--video-bg);
  border: none;
  color: var(--muted-foreground);
  font-size: 12px;
  cursor: pointer;
  transition: background-color .15s ease, color .15s ease;
}

.type-btn.active {
  background: var(--secondary);
  color: var(--on-media);
}

.type-btn:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: -2px;
}

.preset-row {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.preset-swatch {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  border: 2px solid var(--border);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--on-media);
  transition: border-color .15s ease, transform .15s ease;
}

.preset-swatch:hover {
  border-color: var(--secondary);
  transform: scale(1.05);
}

.preset-swatch:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 2px;
}

.color-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.color-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.upload-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 4px;
  flex-wrap: wrap;
}

.upload-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  background: var(--video-bg);
  border: 1px dashed var(--border);
  border-radius: var(--radius-md);
  color: var(--muted-foreground);
  font-size: 12px;
  cursor: pointer;
  transition: border-color .15s ease, color .15s ease;
}

.upload-btn:hover {
  border-color: var(--secondary);
  color: var(--secondary);
}

.upload-btn:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 2px;
}

.upload-hint {
  font-size: 11px;
  color: var(--muted-foreground);
}

.hidden-file-input {
  display: none;
}

.form-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 8px;
}

.footer-btn {
  height: 36px;
  padding: 0 16px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  font-size: 13px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: background-color .15s ease, border-color .15s ease;
}

.footer-btn.cancel {
  background: var(--card-elevated);
  color: var(--foreground);
}

.footer-btn.cancel:hover {
  background: var(--video-bg);
}

.footer-btn.save {
  background: var(--primary);
  border-color: var(--primary);
  color: var(--on-media);
}

.footer-btn.save:hover:not(:disabled) {
  background: var(--destructive);
  border-color: var(--destructive);
}

.footer-btn.save:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.footer-btn:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 2px;
}

/* 预览侧栏 */
.editor-preview {
  position: sticky;
  top: 0;
  align-self: start;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: calc(100vh - 120px);
  overflow-y: auto;
}

.preview-title {
  font-family: var(--font-display);
  font-size: 13px;
  font-weight: 600;
  color: var(--muted-foreground);
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.preview-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 10px;
}

.preview-avatar-wrap {
  display: flex;
  justify-content: center;
  padding: 8px 0;
}

.preview-name {
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 600;
  color: var(--foreground);
  margin: 0;
}

.preview-tags {
  font-size: 12px;
  color: var(--secondary);
  margin: 0;
}

.preview-desc {
  font-size: 13px;
  color: var(--muted-foreground);
  margin: 0;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  max-width: 100%;
}

.preview-meta {
  width: 100%;
  margin: 8px 0 0;
  border-top: 1px solid var(--border);
  padding-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.meta-row {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
}

.meta-row dt {
  color: var(--muted-foreground);
}

.meta-row dd {
  color: var(--foreground);
  margin: 0;
  font-family: var(--font-mono);
}

/* Modal 按钮 */
.modal-btn {
  height: 32px;
  padding: 0 16px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--card-elevated);
  color: var(--foreground);
  font-size: 13px;
  cursor: pointer;
  transition: background-color .15s ease, border-color .15s ease;
}

.modal-btn:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 2px;
}

.modal-cancel:hover {
  background: var(--video-bg);
}

.modal-confirm {
  background: var(--destructive);
  border-color: var(--destructive);
  color: var(--on-accent);
}

.modal-confirm:hover {
  background: var(--destructive);
  border-color: var(--destructive);
}

.delete-warning {
  margin-top: 8px;
  color: var(--error-fg);
  font-size: 13px;
}

/* F01.6 角色属性面板 */
.attr-legend {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
}

.attr-badge {
  font-size: 10px;
  color: var(--secondary);
  background: color-mix(in srgb, var(--secondary) 12%, transparent);
  padding: 1px 6px;
  border-radius: var(--radius-pill);
  font-weight: 600;
}

.attr-switch {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  margin-left: auto;
}

.attr-switch input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.switch-track {
  display: inline-flex;
  align-items: center;
  width: 32px;
  height: 18px;
  background: var(--video-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  padding: 1px;
  transition: background-color .15s ease, border-color .15s ease;
}

.switch-track.on {
  background: var(--secondary);
  border-color: var(--secondary);
}

.switch-thumb {
  display: inline-block;
  width: 12px;
  height: 12px;
  background: var(--foreground);
  border-radius: 50%;
  transform: translateX(0);
  transition: transform .15s ease;
}

.switch-track.on .switch-thumb {
  transform: translateX(14px);
  background: var(--on-media);
}

.attr-switch input:focus-visible + .switch-track {
  outline: 2px solid var(--secondary);
  outline-offset: 2px;
}

.collapse-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  color: var(--muted-foreground);
  font-size: 12px;
  cursor: pointer;
  padding: 4px 0;
  transition: color .15s ease;
}

.collapse-toggle:hover {
  color: var(--secondary);
}

.collapse-toggle:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}

.attr-content {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding-top: 4px;
}

.attr-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.stats-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.add-stat-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  padding: 0 10px;
  background: var(--video-bg);
  border: 1px dashed var(--border);
  border-radius: var(--radius-sm);
  color: var(--muted-foreground);
  font-size: 11px;
  cursor: pointer;
  transition: border-color .15s ease, color .15s ease;
}

.add-stat-btn:hover {
  border-color: var(--secondary);
  color: var(--secondary);
}

.add-stat-btn:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 2px;
}

.stats-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.stat-row {
  display: grid;
  grid-template-columns: 1fr 1fr 80px 32px;
  gap: 6px;
  align-items: center;
}

.stat-input {
  height: 32px;
  padding: 0 8px;
  background: var(--video-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--foreground);
  font-size: 12px;
  outline: none;
  transition: border-color .15s ease;
  width: 100%;
}

.stat-input:focus-visible {
  border-color: var(--secondary);
}

.stat-select {
  height: 32px;
  padding: 0 6px;
  background: var(--video-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--foreground);
  font-size: 12px;
  outline: none;
  cursor: pointer;
}

.stat-select:focus-visible {
  border-color: var(--secondary);
}

.stat-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: var(--video-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--muted-foreground);
  cursor: pointer;
  transition: border-color .15s ease, color .15s ease;
}

.stat-remove:hover {
  border-color: var(--destructive);
  color: var(--destructive);
}

.stat-remove:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 2px;
}

.value-badge.err {
  background: color-mix(in srgb, var(--destructive) 12%, transparent);
  color: var(--destructive);
  font-weight: 500;
}

/* 响应式 */
@media (max-width: 1023px) {
  .editor-body {
    grid-template-columns: 1fr;
  }
  .editor-preview {
    position: static;
    order: -1;
    max-height: none;
  }
}

@media (max-width: 640px) {
  .editor-view {
    padding: 16px;
  }
  .header-btn .btn-label {
    display: none;
  }
  .header-btn {
    width: 36px;
    padding: 0;
    justify-content: center;
  }
  .header-btn.cancel,
  .header-btn.save {
    width: auto;
    padding: 0 14px;
  }
  .header-btn.save .btn-label,
  .header-btn.cancel {
    display: inline;
  }
  .color-row {
    grid-template-columns: 1fr;
  }
  .attr-row {
    grid-template-columns: 1fr;
  }
  .stat-row {
    grid-template-columns: 1fr 1fr;
  }
  .stat-row .stat-select,
  .stat-row .stat-remove {
    grid-column: span 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .preset-swatch:hover {
    transform: none;
  }
}

/* 需求7：世界书绑定面板 */
.wb-bind-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 12px 0;
}

.wb-bind-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--card);
  transition: border-color 0.15s;
}

.wb-bind-item:hover {
  border-color: var(--primary);
}

.wb-bind-info {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text);
  min-width: 0;
}

.wb-bind-name {
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wb-bind-meta {
  color: var(--muted-foreground);
  font-size: 0.85em;
  flex-shrink: 0;
}

.wb-unbind-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  background: transparent;
  color: var(--muted-foreground);
  font-size: 0.85em;
  cursor: pointer;
  transition: background-color 0.15s, color 0.15s, border-color 0.15s;
  flex-shrink: 0;
}

.wb-unbind-btn:hover {
  border-color: var(--destructive);
  color: var(--destructive);
}

.wb-unbind-btn:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}

.wb-bind-empty {
  color: var(--muted-foreground);
  font-size: 0.9em;
  padding: 12px;
  text-align: center;
  border: 1px dashed var(--border-subtle);
  border-radius: 8px;
  margin: 12px 0;
}

.wb-add-bind {
  margin-top: 12px;
}

.wb-add-row {
  display: flex;
  gap: 8px;
  align-items: stretch;
}

.wb-select {
  flex: 1;
  min-width: 0;
}

.wb-bind-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0 14px;
  border: 1px solid var(--primary);
  border-radius: 8px;
  background: var(--primary);
  color: var(--on-primary);
  font-size: 0.9em;
  cursor: pointer;
  transition: opacity 0.15s;
  flex-shrink: 0;
}

.wb-bind-btn:hover:not(:disabled) {
  opacity: 0.9;
}

.wb-bind-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.wb-bind-btn:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}

@media (max-width: 640px) {
  .wb-add-row {
    flex-direction: column;
  }
  .wb-bind-btn {
    justify-content: center;
    padding: 8px;
  }
}
</style>
