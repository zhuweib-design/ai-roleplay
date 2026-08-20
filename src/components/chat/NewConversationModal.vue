<script setup lang="ts">
/**
 * NewConversationModal — 新建对话弹窗 (需求4)
 *
 * 两步选择流程：
 * 1. 选择对话类型：单聊 / 群聊
 * 2. 选择角色：
 *    - 单聊：选 1 个角色 → selectCharacter + 跳转 /chat
 *    - 群聊：输入群名 + 选 2-8 个角色 + 选模式 → createGroup + 跳转 /group
 *
 * 无障碍：
 * - 使用 Modal 焦点陷阱
 * - 角色列表 role="listbox" + aria-selected
 * - 步骤指示器 aria-current
 * - 错误提示 role="alert"
 */
import { ref, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useCharacterStore } from '@/stores/character';
import { useGroupChatStore } from '@/stores/group-chat';
import Modal from '@/components/common/Modal.vue';
import Icon from '@/components/common/Icon.vue';
import Avatar from '@/components/common/Avatar.vue';
import Toast from '@/components/common/Toast.vue';
import type { UICharacter } from '@/types';
import type { CharacterCard } from '@core/character-card';
import type { GroupChatMode } from '@core/group-chat';
import { MIN_GROUP_MEMBERS, MAX_GROUP_MEMBERS } from '@core/group-chat';
import { t } from '@/i18n';

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  'created-single': [characterId: string];
  'created-group': [groupId: string];
}>();

const router = useRouter();
const characterStore = useCharacterStore();
const groupStore = useGroupChatStore();

// ── 步骤状态 ──
type Step = 1 | 2;
type ConversationType = 'single' | 'group';

const step = ref<Step>(1);
const convType = ref<ConversationType>('single');

// 群聊表单
const groupName = ref('');
const groupDesc = ref('');
const groupMode = ref<GroupChatMode>('natural');
const selectedMemberIds = ref<Set<string>>(new Set());

// 搜索（角色选择步骤）
const searchQuery = ref('');

// Toast
const toastOpen = ref(false);
const toastType = ref<'info' | 'success' | 'error'>('info');
const toastMessage = ref('');

// ── 计算属性 ──

/** 过滤后的角色列表（按搜索词） */
const filteredCharacters = computed<UICharacter[]>(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return characterStore.characters;
  return characterStore.characters.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      c.tags.some((t) => t.toLowerCase().includes(q))
  );
});

/** 单聊是否可确认（选了 1 个角色） */
const canConfirmSingle = computed(() => {
  return selectedMemberIds.value.size === 1;
});

/** 群聊是否可确认（名称非空 + 2-8 个成员） */
const canConfirmGroup = computed(() => {
  return (
    groupName.value.trim().length > 0 &&
    selectedMemberIds.value.size >= MIN_GROUP_MEMBERS &&
    selectedMemberIds.value.size <= MAX_GROUP_MEMBERS
  );
});

/** 当前步骤是否可前进 */
const canNext = computed(() => {
  return convType.value === 'single' || convType.value === 'group';
});

/** 选中角色数 */
const selectedCount = computed(() => selectedMemberIds.value.size);

// ── 动作 ──

function showToast(type: 'info' | 'success' | 'error', message: string) {
  toastType.value = type;
  toastMessage.value = message;
  toastOpen.value = true;
}

/** 重置状态（打开时调用） */
function resetState() {
  step.value = 1;
  convType.value = 'single';
  groupName.value = '';
  groupDesc.value = '';
  groupMode.value = 'natural';
  selectedMemberIds.value = new Set();
  searchQuery.value = '';
}

/** 选择对话类型 */
function selectType(type: ConversationType) {
  convType.value = type;
}

/** 进入第二步 */
function goToStep2() {
  if (!canNext.value) return;
  selectedMemberIds.value = new Set();
  searchQuery.value = '';
  step.value = 2;
}

/** 返回第一步 */
function backToStep1() {
  step.value = 1;
}

/** 切换角色选择 */
function toggleCharacter(charId: string) {
  const next = new Set(selectedMemberIds.value);
  if (next.has(charId)) {
    next.delete(charId);
  } else {
    if (convType.value === 'single') {
      // 单聊：单选，替换之前的选择
      next.clear();
      next.add(charId);
    } else {
      // 群聊：多选，检查上限
      if (next.size >= MAX_GROUP_MEMBERS) {
        showToast('error', t('newConv.groupMax', { count: MAX_GROUP_MEMBERS }));
        return;
      }
      next.add(charId);
    }
  }
  selectedMemberIds.value = next;
}

/** 判断角色是否被选中 */
function isSelected(charId: string): boolean {
  return selectedMemberIds.value.has(charId);
}

/** UICharacter → CharacterCard 适配（最小化结构，用于群聊创建） */
function uiCharToCard(c: UICharacter): CharacterCard {
  return {
    id: c.id,
    name: c.name,
    avatar: c.avatar,
    description: c.description,
    personality: '',
    scenario: '',
    firstMessage: c.messages[0]?.content ?? '',
    alternateGreetings: c.messages.slice(1).map((m) => m.content),
    exampleMessages: '',
    characterNote: null,
    talkativeness: 50,
    tags: c.tags,
    favorite: c.favorite,
    version: '1.0',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/** 确认创建 */
function confirmCreate() {
  if (convType.value === 'single') {
    if (!canConfirmSingle.value) {
      showToast('error', t('newConv.needOne'));
      return;
    }
    const charId = Array.from(selectedMemberIds.value)[0]!;
    characterStore.selectCharacter(charId);
    emit('created-single', charId);
    closeModal();
    void router.push({ name: 'chat' });
  } else {
    if (!canConfirmGroup.value) {
      if (!groupName.value.trim()) {
        showToast('error', t('newConv.groupNameRequired'));
      } else if (selectedMemberIds.value.size < MIN_GROUP_MEMBERS) {
        showToast('error', t('newConv.groupMin', { count: MIN_GROUP_MEMBERS }));
      }
      return;
    }

    const characters = characterStore.characters
      .filter((c) => selectedMemberIds.value.has(c.id))
      .map(uiCharToCard);

    const id = groupStore.createGroup(
      {
        name: groupName.value.trim(),
        description: groupDesc.value.trim(),
        memberIds: Array.from(selectedMemberIds.value),
        mode: groupMode.value,
      },
      characters
    );

    if (id) {
      groupStore.selectGroup(id);
      emit('created-group', id);
      closeModal();
      void router.push({ name: 'group' });
    } else if (groupStore.lastError) {
      showToast('error', groupStore.lastError);
    }
  }
}

/** 关闭弹窗 */
function closeModal() {
  emit('update:modelValue', false);
}

// 监听打开状态，重置数据
watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      resetState();
    }
  }
);
</script>

<template>
  <Modal
    :model-value="modelValue"
    :title="step === 1 ? t('newConv.title') : t('newConv.selectCharTitle')"
    :aria-label="t('newConv.wizardAria')"
    @update:model-value="(v) => emit('update:modelValue', v)"
  >
    <div class="new-conv-modal">
      <!-- 步骤指示器 -->
      <div class="step-indicator" role="navigation" :aria-label="t('newConv.stepAria')">
        <span class="step-dot" :class="{ active: step >= 1 }" :aria-current="step === 1 ? 'step' : undefined">1</span>
        <span class="step-line" :class="{ active: step >= 2 }"></span>
        <span class="step-dot" :class="{ active: step >= 2 }" :aria-current="step === 2 ? 'step' : undefined">2</span>
        <span class="step-label">{{ step === 1 ? t('newConv.stepType') : t('newConv.stepSelectChar') }}</span>
      </div>

      <!-- 第一步：选择对话类型 -->
      <div v-if="step === 1" class="step-content">
        <p class="step-hint">{{ t('newConv.typeHint') }}</p>
        <div class="type-cards" role="radiogroup" :aria-label="t('newConv.typeAria')">
          <button
            type="button"
            class="type-card"
            :class="{ active: convType === 'single' }"
            role="radio"
            :aria-checked="convType === 'single'"
            @click="selectType('single')"
            @keydown.enter.prevent="selectType('single')"
          >
            <span class="type-icon" aria-hidden="true"><Icon name="chat-circle" :size="32" /></span>
            <span class="type-name">{{ t('newConv.single') }}</span>
            <span class="type-desc">{{ t('newConv.singleDesc') }}</span>
          </button>
          <button
            type="button"
            class="type-card"
            :class="{ active: convType === 'group' }"
            role="radio"
            :aria-checked="convType === 'group'"
            @click="selectType('group')"
            @keydown.enter.prevent="selectType('group')"
          >
            <span class="type-icon" aria-hidden="true"><Icon name="users" :size="32" /></span>
            <span class="type-name">{{ t('newConv.group') }}</span>
            <span class="type-desc">{{ t('newConv.groupDesc') }}</span>
          </button>
        </div>
      </div>

      <!-- 第二步：选择角色 -->
      <div v-else class="step-content">
        <!-- 群聊表单 -->
        <div v-if="convType === 'group'" class="group-form">
          <div class="form-field">
            <label for="group-name" class="field-label">
              {{ t('newConv.groupName') }} <span class="required" :aria-label="t('common.required')">*</span>
            </label>
            <input
              id="group-name"
              v-model="groupName"
              type="text"
              class="field-input"
              :placeholder="t('newConv.groupNamePlaceholder')"
              maxlength="50"
              autocomplete="off"
            />
          </div>
          <div class="form-field">
            <label for="group-desc" class="field-label">{{ t('newConv.groupDescLabel') }}</label>
            <input
              id="group-desc"
              v-model="groupDesc"
              type="text"
              class="field-input"
              :placeholder="t('newConv.groupDescPlaceholder')"
              maxlength="200"
              autocomplete="off"
            />
          </div>
        </div>

        <!-- 搜索框 -->
        <div class="search-wrapper">
          <span class="search-icon" aria-hidden="true"><Icon name="search" :size="16" /></span>
          <input
            v-model="searchQuery"
            type="text"
            class="search-input"
            :placeholder="t('newConv.searchPlaceholder')"
            :aria-label="t('newConv.searchAria')"
          />
        </div>

        <!-- 选中计数 -->
        <div class="selection-info" aria-live="polite">
          <span v-if="convType === 'single'">
            {{ selectedCount === 1 ? t('newConv.singleSelected') : t('newConv.singleSelectHint') }}
          </span>
          <span v-else>
            {{ t('newConv.groupCount', { count: selectedCount, min: MIN_GROUP_MEMBERS, max: MAX_GROUP_MEMBERS }) }}
          </span>
        </div>

        <!-- 角色列表 -->
        <div class="char-select-list" role="listbox" :aria-label="convType === 'single' ? t('newConv.listboxSingle') : t('newConv.listboxGroup')" :aria-multiselectable="convType === 'group'">
          <button
            v-for="c in filteredCharacters"
            :key="c.id"
            type="button"
            class="char-select-row"
            :class="{ selected: isSelected(c.id) }"
            role="option"
            :aria-selected="isSelected(c.id)"
            :aria-label="`${isSelected(c.id) ? t('newConv.selectedPrefix') : ''}${c.name}`"
            @click="toggleCharacter(c.id)"
          >
            <Avatar :character="c" :size="36" />
            <span class="char-info">
              <span class="char-name">{{ c.name }}</span>
              <span class="char-tags">{{ c.tags.slice(0, 2).join(' · ') }}</span>
            </span>
            <span class="check-icon" :class="{ checked: isSelected(c.id) }" aria-hidden="true">
              <Icon v-if="isSelected(c.id)" name="check" :size="16" />
            </span>
          </button>

          <!-- 空状态 -->
          <p v-if="filteredCharacters.length === 0" class="empty-hint">
            {{ searchQuery ? t('newConv.emptySearch') : t('newConv.emptyNoChar') }}
          </p>
        </div>
      </div>
    </div>

    <template #footer>
      <button
        v-if="step === 2"
        type="button"
        class="modal-btn modal-back"
        @click="backToStep1"
      >
        <Icon name="arrow-left" :size="14" />
        <span>{{ t('newConv.back') }}</span>
      </button>
      <button type="button" class="modal-btn modal-cancel" @click="closeModal">{{ t('common.cancel') }}</button>
      <button
        v-if="step === 1"
        type="button"
        class="modal-btn modal-next"
        :disabled="!canNext"
        @click="goToStep2"
      >
        <span>{{ t('newConv.next') }}</span>
        <Icon name="chevron-right" :size="14" />
      </button>
      <button
        v-else
        type="button"
        class="modal-btn modal-confirm"
        :disabled="convType === 'single' ? !canConfirmSingle : !canConfirmGroup"
        @click="confirmCreate"
      >
        <Icon name="check" :size="14" />
        <span>{{ t('newConv.create') }}</span>
      </button>
    </template>

    <!-- Toast -->
    <Toast
      v-model="toastOpen"
      :type="toastType"
      :message="toastMessage"
    />
  </Modal>
</template>

<style scoped>
.new-conv-modal {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 320px;
}

/* 步骤指示器 */
.step-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.step-dot {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--card-elevated);
  border: 1px solid var(--border);
  color: var(--muted-foreground);
  font-size: 12px;
  font-weight: 600;
  font-family: var(--font-mono);
}

.step-dot.active {
  background: var(--primary);
  border-color: var(--primary);
  color: var(--on-accent);
}

.step-line {
  width: 32px;
  height: 2px;
  background: var(--border);
  transition: background 0.2s ease;
}

.step-line.active {
  background: var(--primary);
}

.step-label {
  font-size: 13px;
  color: var(--muted-foreground);
  margin-left: 4px;
}

/* 步骤内容 */
.step-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.step-hint {
  font-size: 13px;
  color: var(--muted-foreground);
  margin: 0;
}

/* 类型卡片 */
.type-cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.type-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 20px 12px;
  background: var(--card-elevated);
  border: 2px solid var(--border);
  border-radius: var(--radius-lg);
  cursor: pointer;
  text-align: center;
  transition: border-color 0.15s ease, background-color 0.15s ease;
}

.type-card:hover {
  border-color: var(--secondary);
  background: var(--background);
}

.type-card:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 2px;
}

.type-card.active {
  border-color: var(--primary);
  background: color-mix(in srgb, var(--primary) 8%, var(--card-elevated));
}

.type-icon {
  color: var(--muted-foreground);
  display: inline-flex;
}

.type-card.active .type-icon {
  color: var(--primary-fg);
}

.type-name {
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 600;
  color: var(--foreground);
}

.type-desc {
  font-size: 12px;
  color: var(--muted-foreground);
  line-height: 1.4;
}

/* 群聊表单 */
.group-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.field-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--foreground);
}

.required {
  color: var(--primary-fg);
}

.field-input {
  width: 100%;
  padding: 8px 12px;
  background: var(--background);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--foreground);
  font-size: 13px;
  font-family: var(--font-sans);
  outline: none;
  transition: border-color 0.15s ease;
}

.field-input:focus {
  border-color: var(--primary);
}

/* 搜索框 */
.search-wrapper {
  position: relative;
}

.search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--muted-foreground);
  display: inline-flex;
  pointer-events: none;
}

.search-input {
  width: 100%;
  height: 32px;
  padding: 0 12px 0 36px;
  background: var(--video-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--foreground);
  font-size: 13px;
  font-family: var(--font-sans);
  outline: none;
}

.search-input:focus {
  border-color: var(--secondary);
}

/* 选中信息 */
.selection-info {
  font-size: 12px;
  color: var(--secondary);
  padding: 4px 0;
}

/* 角色选择列表 */
.char-select-list {
  max-height: 280px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 4px 0;
}

.char-select-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  background: var(--card-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s ease, background-color 0.15s ease;
}

.char-select-row:hover {
  border-color: var(--secondary);
  background: var(--background);
}

.char-select-row:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 2px;
}

.char-select-row.selected {
  border-color: var(--primary);
  background: color-mix(in srgb, var(--primary) 6%, var(--card-elevated));
}

.char-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.char-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--foreground);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.char-tags {
  font-size: 11px;
  color: var(--muted-foreground);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.check-icon {
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: 2px solid var(--border);
  color: transparent;
  flex-shrink: 0;
  transition: all 0.15s ease;
}

.check-icon.checked {
  border-color: var(--primary);
  background: var(--primary);
  color: var(--on-primary);
}

/* 空状态 */
.empty-hint {
  padding: 24px 8px;
  text-align: center;
  color: var(--muted-foreground);
  font-size: 13px;
}

/* 底部按钮 */
.modal-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 14px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--card-elevated);
  color: var(--foreground);
  font-size: 13px;
  cursor: pointer;
  transition: background-color 0.15s ease, border-color 0.15s ease;
}

.modal-btn:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 2px;
}

.modal-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.modal-cancel:hover:not(:disabled) {
  background: var(--video-bg);
}

.modal-next,
.modal-confirm {
  background: var(--primary);
  border-color: var(--primary);
  color: var(--on-accent);
}

.modal-next:hover:not(:disabled),
.modal-confirm:hover:not(:disabled) {
  background: var(--tk-red-600);
  border-color: var(--tk-red-600);
}

.modal-back {
  margin-right: auto;
}

/* 响应式 */
@media (max-width: 539px) {
  .type-cards {
    grid-template-columns: 1fr;
  }
}
</style>
