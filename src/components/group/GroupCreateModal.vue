<script setup lang="ts">
/**
 * GroupCreateModal — 建群向导（R1-1 从 GroupChatView 拆出）
 *
 * 表单状态（名字 / 描述 / 模式 / 已选成员）归这个组件，父级只接 submit。
 * 每次打开重置一次——原实现是在 `openCreateModal()` 里重置的，等价。
 *
 * 校验失败不走父级：`error` 事件把已经 `t()` 过的文案交给父级去弹 Toast，
 * 这样这个组件不需要知道 Toast 长什么样。
 */
import { ref, watch } from 'vue';
import { t } from '@/i18n';
import Modal from '@/components/common/Modal.vue';
import Icon from '@/components/common/Icon.vue';
import CharacterPickerList from '@/components/group/CharacterPickerList.vue';
import type { GroupChatMode } from '@/core/group-chat';
import type { UICharacter } from '@/types';

const props = defineProps<{
  open: boolean;
  /** 可选角色卡（父级给 characterStore.characters） */
  characters: UICharacter[];
}>();

const emit = defineEmits<{
  'update:open': [open: boolean];
  submit: [payload: {
    name: string;
    description: string;
    mode: GroupChatMode;
    memberIds: string[];
  }];
  /** 校验失败：文案已本地化，父级直接弹 */
  error: [message: string];
}>();

const newGroupName = ref('');
const newGroupDesc = ref('');
const newGroupMode = ref<GroupChatMode>('natural');
const selectedMemberIds = ref<Set<string>>(new Set());

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    newGroupName.value = '';
    newGroupDesc.value = '';
    newGroupMode.value = 'natural';
    selectedMemberIds.value = new Set();
  }
);

function toggleMemberSelection(charId: string): void {
  if (selectedMemberIds.value.has(charId)) {
    selectedMemberIds.value.delete(charId);
  } else {
    if (selectedMemberIds.value.size >= 8) {
      emit('error', t('group.maxMembers'));
      return;
    }
    selectedMemberIds.value.add(charId);
  }
}

function confirmCreate(): void {
  if (selectedMemberIds.value.size < 2) {
    emit('error', t('group.minMembers'));
    return;
  }
  if (!newGroupName.value.trim()) {
    emit('error', t('group.nameRequired'));
    return;
  }
  emit('submit', {
    name: newGroupName.value.trim(),
    description: newGroupDesc.value.trim(),
    mode: newGroupMode.value,
    memberIds: Array.from(selectedMemberIds.value),
  });
}
</script>

<template>
  <Modal
    :model-value="open"
    :title="t('group.createTitle')"
    @update:model-value="emit('update:open', $event)"
  >
    <div class="create-form">
      <div class="form-row">
        <label class="form-label" for="new-group-name">{{ t('group.createName') }}</label>
        <input
          id="new-group-name"
          v-model="newGroupName"
          type="text"
          class="form-input"
          :placeholder="t('group.createNamePlaceholder')"
          maxlength="50"
        />
      </div>

      <div class="form-row">
        <label class="form-label" for="new-group-desc">{{ t('group.createDesc') }}</label>
        <textarea
          id="new-group-desc"
          v-model="newGroupDesc"
          class="form-textarea"
          :placeholder="t('group.createDescPlaceholder')"
          rows="2"
        />
      </div>

      <div class="form-row">
        <span class="form-label">{{ t('group.createMode') }}</span>
        <div class="mode-options" role="radiogroup" :aria-label="t('group.createModeAria')">
          <button
            type="button"
            role="radio"
            :aria-checked="newGroupMode === 'natural'"
            class="mode-option"
            :class="{ active: newGroupMode === 'natural' }"
            @click="newGroupMode = 'natural'"
          >
            <Icon name="refresh-cw" :size="14" />
            <div>
              <div class="mode-name">{{ t('group.modeNatural') }}</div>
              <div class="mode-desc">{{ t('group.modeNaturalDesc') }}</div>
            </div>
          </button>
          <button
            type="button"
            role="radio"
            :aria-checked="newGroupMode === 'designated'"
            class="mode-option"
            :class="{ active: newGroupMode === 'designated' }"
            @click="newGroupMode = 'designated'"
          >
            <Icon name="user" :size="14" />
            <div>
              <div class="mode-name">{{ t('group.modeDesignated') }}</div>
              <div class="mode-desc">{{ t('group.modeDesignatedDesc') }}</div>
            </div>
          </button>
        </div>
      </div>

      <div class="form-row">
        <div class="form-label-row">
          <span class="form-label">{{ t('group.selectMembers', { count: selectedMemberIds.size }) }}</span>
        </div>
        <CharacterPickerList
          :items="characters"
          :selected="selectedMemberIds"
          @toggle="toggleMemberSelection"
        />
      </div>
    </div>
    <template #footer>
      <button
        type="button"
        class="modal-btn modal-cancel"
        @click="emit('update:open', false)"
      >
        {{ t('group.cancel') }}
      </button>
      <button
        type="button"
        class="modal-btn modal-confirm"
        @click="confirmCreate"
      >
        {{ t('group.create') }}
      </button>
    </template>
  </Modal>
</template>

<style scoped>
/* 创建群聊表单 */
.create-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.form-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.form-label-row {
  display: flex;
  justify-content: space-between;
}

.form-label {
  font-size: 12px;
  color: var(--muted-foreground);
  font-weight: 500;
}

.form-input,
.form-textarea {
  padding: 6px 10px;
  border: 1px solid var(--border);
  background: var(--background);
  color: var(--foreground);
  border-radius: var(--radius-md);
  font-size: 13px;
  font-family: inherit;
  resize: vertical;
}

.form-input:focus,
.form-textarea:focus {
  outline: 2px solid var(--secondary);
  outline-offset: 1px;
}

.mode-options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.mode-option {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  background: var(--background);
  color: var(--foreground);
  border-radius: var(--radius-md);
  text-align: left;
  cursor: pointer;
}

.mode-option.active {
  border-color: var(--primary);
  background: var(--card-elevated);
}

.mode-option > div {
  flex: 1;
}

.mode-name {
  font-size: 12px;
  font-weight: 500;
}

.mode-desc {
  font-size: 11px;
  color: var(--muted-foreground);
  margin-top: 2px;
}

@media (max-width: 1024px) {
  .mode-options {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  /* iOS 聚焦防放大：可编辑控件字号须 ≥16px（I-7 / D1） */
  .form-input,
  .form-textarea {
    font-size: 16px;
  }
}
</style>
