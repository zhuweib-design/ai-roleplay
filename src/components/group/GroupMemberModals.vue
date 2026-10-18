<script setup lang="ts">
/**
 * GroupMemberModals — 成员相关弹窗（R1-1 从 GroupChatView 拆出）
 *
 * 两个弹窗共用一批东西：角色选择清单、取消/确认按钮组、"最多 8 人"的语境。
 * 拆开成两个文件会各自带一份 `.form-hint` 与按钮样式，所以合成一个文件、
 * 两个 Modal 并列（这也是计划里 GroupMemberModals 这个名字的由来）。
 *
 * 选中集合归本组件；真正的加人/删群写操作在 useGroupMembers / 视图里。
 */
import { ref, watch } from 'vue';
import { t } from '@/i18n';
import Modal from '@/components/common/Modal.vue';
import CharacterPickerList from '@/components/group/CharacterPickerList.vue';
import type { UICharacter } from '@/types';

const props = defineProps<{
  addOpen: boolean;
  deleteOpen: boolean;
  /** 还能加进群的角色卡（父级已排除群内成员） */
  candidates: UICharacter[];
}>();

const emit = defineEmits<{
  'update:addOpen': [open: boolean];
  'update:deleteOpen': [open: boolean];
  'add-submit': [characterIds: string[]];
  'delete-confirm': [];
}>();

const addMemberCandidates = ref<Set<string>>(new Set());

watch(
  () => props.addOpen,
  (open) => {
    // 每次打开清空勾选——原实现是在 openAddMemberModal() 里做的
    if (open) addMemberCandidates.value = new Set();
  }
);

function toggleAddMemberCandidate(charId: string): void {
  if (addMemberCandidates.value.has(charId)) {
    addMemberCandidates.value.delete(charId);
  } else {
    addMemberCandidates.value.add(charId);
  }
}

function confirmAddMembers(): void {
  emit('add-submit', Array.from(addMemberCandidates.value));
}
</script>

<template>
  <!-- 添加成员弹窗 -->
  <Modal
    :model-value="addOpen"
    :title="t('group.addMemberTitle')"
    described-by="add-member-hint"
    @update:model-value="emit('update:addOpen', $event)"
  >
    <div class="add-member-form">
      <p id="add-member-hint" class="form-hint">{{ t('group.addMemberHint') }}</p>
      <CharacterPickerList
        :items="candidates"
        :selected="addMemberCandidates"
        show-empty-hint
        @toggle="toggleAddMemberCandidate"
      />
    </div>
    <template #footer>
      <button
        type="button"
        class="modal-btn modal-cancel"
        @click="emit('update:addOpen', false)"
      >
        {{ t('group.cancel') }}
      </button>
      <button
        type="button"
        class="modal-btn modal-confirm"
        @click="confirmAddMembers"
      >
        {{ t('group.add') }}
      </button>
    </template>
  </Modal>

  <!-- 删除确认 -->
  <Modal
    :model-value="deleteOpen"
    :title="t('group.deleteTitle')"
    described-by="group-delete-desc"
    @update:model-value="emit('update:deleteOpen', $event)"
  >
    <p id="group-delete-desc">{{ t('group.deleteConfirm') }}</p>
    <template #footer>
      <button
        type="button"
        class="modal-btn modal-cancel"
        @click="emit('update:deleteOpen', false)"
      >
        {{ t('group.cancel') }}
      </button>
      <button
        type="button"
        class="modal-btn modal-confirm modal-danger"
        @click="emit('delete-confirm')"
      >
        {{ t('group.delete') }}
      </button>
    </template>
  </Modal>
</template>

<style scoped>
.add-member-form .form-hint {
  margin: 0 0 10px 0;
  font-size: 12px;
  color: var(--muted-foreground);
}
</style>
