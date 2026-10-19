<script setup lang="ts">
/**
 * ModelProfileList — API Profile 列表（激活 / 停用 / 编辑 / 删除 + 删除确认 Modal）
 *
 * R1-4 从 SettingsModelPanel（原 2544 行）拆出。删除确认 Modal 一并放在这里：
 * 它只由本列表触发，`deleteTarget` 无第二个消费者。
 *
 * 「新增 / 编辑」表单不在这里——那是 ModelProfileForm.vue 的职责，本组件只 emit
 * `edit`，由宿主把两处入口接到同一扇门。
 */
import { ref } from 'vue';
import { useSettingsStore } from '@/stores/settings';
import { useChatStore } from '@/stores/chat';
import type { ApiProfile } from '@/types';
import Icon from '@/components/common/Icon.vue';
import Modal from '@/components/common/Modal.vue';
import { showToast } from '@/utils/toast-service';
import { t } from '@/i18n';

const emit = defineEmits<{
  edit: [profile: ApiProfile];
}>();

const settings = useSettingsStore();
const chatStore = useChatStore();

// 删除确认
const deleteTarget = ref<ApiProfile | null>(null);
const deleteModalOpen = ref(false);

function confirmDelete(profile: ApiProfile) {
  deleteTarget.value = profile;
  deleteModalOpen.value = true;
}

function executeDelete() {
  if (!deleteTarget.value) return;
  const name = deleteTarget.value.name;
  const id = deleteTarget.value.id;
  settings.deleteApiProfile(id);
  // 若删除的是当前激活，清空 chat store 的 API Profile
  if (chatStore && settings.activeApiProfileId === null) {
    chatStore.setApiProfile(null);
  }
  deleteModalOpen.value = false;
  deleteTarget.value = null;
  showToast('success', t('modelPanel.profileDeleted', { name }));
}

function activateProfile(profile: ApiProfile) {
  settings.setActiveApiProfile(profile.id);
  chatStore.setApiProfile(profile);
  showToast('success', t('modelPanel.profileActivated', { name: profile.name }));
}

function deactivateProfile() {
  settings.setActiveApiProfile(null);
  chatStore.setApiProfile(null);
  showToast('success', t('modelPanel.profileDeactivated'));
}
</script>

<template>
  <p v-if="settings.apiProfiles.length === 0" class="empty-hint">
    {{ t('modelPanel.apiEmpty') }}
  </p>

  <ul class="profile-list" role="list">
    <li
      v-for="profile in settings.apiProfiles"
      :key="profile.id"
      class="profile-item"
      :class="{ active: settings.activeApiProfileId === profile.id }"
    >
      <div class="profile-info">
        <div class="profile-row">
          <span class="profile-name">{{ profile.name }}</span>
          <span
            v-if="settings.activeApiProfileId === profile.id"
            class="active-badge"
          >{{ t('modelPanel.activeBadge') }}</span>
          <span class="provider-badge" :data-provider="profile.provider">
            {{ profile.provider }}
          </span>
        </div>
        <div class="profile-meta">
          <span class="meta-item"><Icon name="gear" :size="11" /> {{ profile.model }}</span>
          <span class="meta-item meta-url"><Icon name="git-branch" :size="11" /> {{ profile.baseUrl }}</span>
        </div>
      </div>
      <div class="profile-actions">
        <button
          v-if="settings.activeApiProfileId !== profile.id"
          type="button"
          class="action-btn activate"
          :aria-label="t('modelPanel.activateAria')"
          @click="activateProfile(profile)"
        >
          <Icon name="check" :size="12" />
          <span>{{ t('modelPanel.activate') }}</span>
        </button>
        <button
          v-else
          type="button"
          class="action-btn deactivate"
          :aria-label="t('modelPanel.deactivateAria')"
          @click="deactivateProfile"
        >
          <Icon name="stop" :size="12" />
          <span>{{ t('modelPanel.deactivate') }}</span>
        </button>
        <button
          type="button"
          class="action-btn edit"
          :aria-label="t('modelPanel.editAria')"
          @click="emit('edit', profile)"
        >
          <Icon name="pencil" :size="12" />
          <span>{{ t('modelPanel.edit') }}</span>
        </button>
        <button
          type="button"
          class="action-btn delete"
          :aria-label="t('modelPanel.deleteAria')"
          @click="confirmDelete(profile)"
        >
          <Icon name="trash-2" :size="12" />
          <span>{{ t('modelPanel.delete') }}</span>
        </button>
      </div>
    </li>
  </ul>

  <Modal
    v-model="deleteModalOpen"
    :title="t('modelPanel.deleteTitle')"
    :aria-label="t('modelPanel.deleteAria2')"
    described-by="profile-delete-desc profile-delete-warning"
  >
    <p id="profile-delete-desc" v-if="deleteTarget">
      {{ t('modelPanel.deleteConfirm', { name: deleteTarget.name }) }}
    </p>
    <p id="profile-delete-warning" class="delete-warning">{{ t('modelPanel.deleteWarning') }}</p>
    <template #footer>
      <button
        type="button"
        class="modal-btn modal-cancel"
        @click="deleteModalOpen = false"
      >
        {{ t('modelPanel.cancel') }}
      </button>
      <button
        type="button"
        class="modal-btn modal-confirm"
        @click="executeDelete"
      >
        {{ t('modelPanel.delete') }}
      </button>
    </template>
  </Modal>
</template>

<style scoped>
/* ── 共用基类：从 SettingsModelPanel.vue 复制（scoped 不穿透子组件） ── */
.empty-hint {
  font-size: 13px;
  color: var(--muted-foreground);
  margin: 0;
  padding: var(--spacing-md) 0;
  text-align: center;
}

.profile-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.profile-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--video-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  transition: border-color .15s ease, background-color .15s ease;
}

.profile-item.active {
  border-color: var(--secondary);
  background: color-mix(in srgb, var(--secondary) 6%, transparent);
}

.profile-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.profile-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  flex-wrap: wrap;
}

.profile-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--foreground);
}

.active-badge {
  background: var(--secondary);
  color: var(--on-secondary);
  font-size: 10px;
  padding: 2px 6px;
  border-radius: var(--radius-pill);
  font-weight: 600;
}

.provider-badge {
  background: var(--badge-bg);
  color: var(--badge-fg);
  font-size: 10px;
  padding: 2px 6px;
  border-radius: var(--radius-pill);
  font-family: var(--font-mono);
  text-transform: lowercase;
}

.provider-badge[data-provider='openai'] {
  background: color-mix(in srgb, var(--brand-openai) 20%, transparent);
  color: var(--brand-openai);
}

.provider-badge[data-provider='anthropic'] {
  background: color-mix(in srgb, var(--brand-anthropic) 20%, transparent);
  color: var(--brand-anthropic);
}

.provider-badge[data-provider='custom'] {
  background: color-mix(in srgb, var(--primary) 20%, transparent);
  color: var(--primary-fg);
}

.provider-badge[data-provider='deepseek'] {
  background: color-mix(in srgb, var(--accent-blue) 20%, transparent);
  color: var(--accent-blue);
}

.profile-meta {
  display: flex;
  gap: 12px;
  font-size: 11px;
  color: var(--muted-foreground);
  flex-wrap: wrap;
}

.meta-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.meta-url {
  font-family: var(--font-mono);
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profile-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: var(--size-control-sm);
  padding: 0 10px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--card-elevated);
  color: var(--muted-foreground);
  font-size: 11px;
  cursor: pointer;
  transition: background-color .15s ease, color .15s ease, border-color .15s ease;
}

@media (hover: hover) and (pointer: fine) {
  .action-btn:hover {
    background: var(--card);
    color: var(--foreground);
  }
}

.action-btn:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 2px;
}

.action-btn.activate {
  background: var(--secondary);
  border-color: var(--secondary);
  color: var(--on-secondary);
}

@media (hover: hover) and (pointer: fine) {
  .action-btn.activate:hover {
    background: var(--tk-cyan-600);
    border-color: var(--tk-cyan-600);
  }
}

.action-btn.deactivate {
  background: var(--video-bg);
  color: var(--muted-foreground);
}

@media (hover: hover) and (pointer: fine) {
  .action-btn.delete:hover {
    border-color: var(--destructive);
    color: var(--destructive);
  }
}

/* ── Modal 按钮 ── */
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
  transition: background-color .15s ease, border-color .15s ease;
}

.modal-btn:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 2px;
}

@media (hover: hover) and (pointer: fine) {
  .modal-cancel:hover {
    background: var(--video-bg);
  }
}

.modal-confirm {
  background: var(--destructive);
  border-color: var(--destructive);
  color: var(--on-accent);
}

@media (hover: hover) and (pointer: fine) {
  .modal-confirm:hover {
    background: var(--destructive);
    border-color: var(--destructive);
  }
}

.delete-warning {
  margin-top: var(--spacing-sm);
  color: var(--error-fg);
  font-size: 13px;
}
</style>
