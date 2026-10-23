<!--
  ArchiveDetailModal — 归档页「查看对话」弹窗

  自 ArchivesView.vue 迁出（R4-17）：这一段是完整闭环 —— 标题、成员/消息/时间三项
  摘要、归档徽章、消息气泡列表、底部「关闭 / 前往群聊」都在这里；宿主对它的依赖
  只剩「开关」与「当前查看的群聊」两个值。
  前往群聊需要路由契约（pushWithReturn 的 from 白名单在 composables/useReadinessJump.ts），
  属于页面级关注点，故改为发 go-group 事件由宿主执行导航，本组件不含 router 依赖。

  无障碍沿用原实现：Modal 自带 role=dialog / 焦点陷阱 / ESC 关闭。
-->
<script setup lang="ts">
import Modal from '@/components/common/Modal.vue';
import type { GroupChat } from '@/core/group-chat';
import { formatDateTime } from '@/utils/format';
import { t } from '@/i18n';

const props = defineProps<{
  /** 弹窗开关（v-model） */
  modelValue: boolean;
  /** 当前查看的群聊；null 时不渲染正文 */
  group: GroupChat | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  /** 请求宿主把用户带到该群聊（导航契约属页面关注点，留在宿主） */
  'go-group': [id: string];
}>();

function close() {
  emit('update:modelValue', false);
}

function goGroup() {
  if (!props.group) return;
  const id = props.group.id;
  emit('update:modelValue', false);
  emit('go-group', id);
}
</script>

<template>
  <Modal
    :model-value="modelValue"
    @update:model-value="close"
    :title="group ? group.name : t('archives.viewTitle')"
  >
    <div v-if="group" class="view-modal-body tk-scroll">
      <div class="view-modal-info">
        <span>{{ t('archives.viewMembers', { names: group.members.map((m) => m.name).join('、') }) }}</span>
        <span>{{ t('archives.viewMessages', { count: group.messages.length }) }}</span>
        <span>{{ t('archives.viewUpdated', { time: formatDateTime(group.updatedAt) }) }}</span>
        <span v-if="group.lifecycleStatus === 'archived'" class="archived-tag">
          {{ t('archives.archivedTag') }}
        </span>
      </div>
      <ul class="view-msg-list" role="list">
        <li
          v-for="msg in group.messages"
          :key="msg.id"
          class="view-msg"
          :class="`view-msg-${msg.role}`"
          role="listitem"
        >
          <div v-if="msg.role === 'system'" class="view-msg-system">
            {{ msg.content }}
          </div>
          <template v-else>
            <div class="view-msg-sender">
              {{ msg.role === 'user' ? t('archives.senderMe') : msg.characterName ?? t('archives.senderAi') }}
            </div>
            <div class="view-msg-content">{{ msg.content }}</div>
          </template>
        </li>
      </ul>
    </div>
    <template #footer>
      <button
        type="button"
        class="modal-btn modal-cancel"
        @click="close"
      >
        {{ t('archives.close') }}
      </button>
      <button
        v-if="group && group.lifecycleStatus !== 'archived'"
        type="button"
        class="modal-btn modal-confirm"
        @click="goGroup"
      >
        {{ t('archives.goGroup') }}
      </button>
    </template>
  </Modal>
</template>

<style scoped>
.view-modal-body {
  max-height: 60vh;
  overflow-y: auto;
}

.view-modal-info {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 12px;
  padding: 10px 12px;
  background: var(--background);
  border-radius: var(--radius-sm);
  font-size: 12px;
  color: var(--muted-foreground);
}

.view-msg-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.view-msg {
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  line-height: 1.5;
}

.view-msg-user {
  background: color-mix(in srgb, var(--primary, #dc1434) 8%, transparent);
  align-self: flex-end;
}

.view-msg-assistant {
  background: color-mix(in srgb, var(--secondary, #25f4ee) 5%, transparent);
  border-left: 2px solid var(--secondary, #25f4ee);
}

.view-msg-system {
  text-align: center;
  font-style: italic;
  color: var(--muted-foreground);
  font-size: 12px;
  padding: 4px 8px;
}

.view-msg-sender {
  font-size: 11px;
  font-weight: 600;
  color: var(--muted-foreground);
  margin-bottom: 4px;
}

.view-msg-content {
  color: var(--foreground);
  white-space: pre-wrap;
  word-break: break-word;
}

/* Modal 按钮 */
.modal-btn {
  padding: 8px 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  font-size: 13px;
  cursor: pointer;
}

.modal-cancel {
  background: var(--card-elevated);
  color: var(--foreground);
}

.modal-confirm {
  background: var(--accent-blue);
  color: var(--on-accent);
  border-color: var(--accent-blue);
}
</style>
