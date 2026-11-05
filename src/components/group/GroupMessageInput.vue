<script setup lang="ts">
/**
 * GroupMessageInput — 群聊输入区（R1-1 从 GroupChatView 拆出）
 *
 * 自持两件纯 UI 状态：@提及下拉的开关与查询词。输入文本本身归 store
 * （父级用 `v-model` 接 groupStore.setInput），这样"谁持有输入"只有一处答案。
 *
 * 发送 / 中止都不在这里发生：本组件只发意图（send / stop / mention），
 * 真正碰 store 的写操作在 useGroupComposer 里。
 */
import { computed, ref } from 'vue';
import { t } from '@/i18n';
import Icon from '@/components/common/Icon.vue';
import Avatar from '@/components/common/Avatar.vue';
import type { GroupMember } from '@/core/group-chat';
import type { UICharacter } from '@/types';

const props = defineProps<{
  /** 输入文本（父级接 groupStore.inputText） */
  value: string;
  /** 生成中：输入框禁用、发送键换成中止键 */
  streaming: boolean;
  /** 归档只读态：输入与发送都禁用（O-12 显式化，不等提交后才报错） */
  archivedReadonly: boolean;
  /** 当前群成员（@提及候选从这里筛） */
  members: GroupMember[];
}>();

const emit = defineEmits<{
  'update:value': [value: string];
  send: [];
  stop: [];
  /** 用户点选了某个 @候选（指定发言的写操作由父级做） */
  mention: [member: GroupMember];
}>();

const showMentionDropdown = ref(false);
const mentionQuery = ref('');

const mentionCandidates = computed(() => {
  const q = mentionQuery.value.toLowerCase();
  return props.members.filter(
    (m) => m.allowAutoSelect && (q === '' || m.name.toLowerCase().includes(q))
  );
});

function onInput(e: Event): void {
  const value = (e.target as HTMLTextAreaElement).value;
  emit('update:value', value);

  // @提及检测
  const lastAtIndex = value.lastIndexOf('@');
  if (lastAtIndex >= 0) {
    const textAfterAt = value.slice(lastAtIndex + 1);
    if (!textAfterAt.includes(' ') && !textAfterAt.includes('\n')) {
      mentionQuery.value = textAfterAt;
      showMentionDropdown.value = true;
      return;
    }
  }
  showMentionDropdown.value = false;
}

function onInputKeydown(e: KeyboardEvent): void {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    emit('send');
  }
}

function insertMention(member: GroupMember): void {
  const text = props.value;
  const lastAtIndex = text.lastIndexOf('@');
  if (lastAtIndex >= 0) {
    const newText =
      text.slice(0, lastAtIndex + 1) + member.name + ' ' + text.slice(lastAtIndex + 1 + mentionQuery.value.length);
    emit('update:value', newText);
    emit('mention', member);
  }
  showMentionDropdown.value = false;
}

function memberInitial(name: string): string {
  return name.charAt(0) || '?';
}
</script>

<template>
  <footer class="input-area">
    <div class="input-wrapper">
      <textarea
        :value="value"
        @input="onInput"
        @keydown="onInputKeydown"
        :placeholder="archivedReadonly ? t('group.archivedReadonlyPlaceholder') : t('group.inputPlaceholder')"
        :aria-label="t('group.inputAria')"
        rows="2"
        class="msg-input"
        :disabled="streaming || archivedReadonly"
      />
      <!-- @提及下拉 -->
      <div
        v-if="showMentionDropdown && mentionCandidates.length > 0"
        class="mention-dropdown"
        role="listbox"
        :aria-label="t('group.mentionAria')"
      >
        <button
          v-for="member in mentionCandidates"
          :key="member.characterId"
          type="button"
          class="mention-item"
          role="option"
          @click="insertMention(member)"
        >
          <Avatar
            :character="{
              id: member.characterId,
              name: member.name,
              avatar: member.avatar,
              avatarType: member.avatar ? 'image' : 'gradient',
              initial: memberInitial(member.name),
            } as UICharacter"
            :size="20"
          />
          <span>{{ member.name }}</span>
        </button>
      </div>
    </div>
    <button
      v-if="!streaming"
      type="button"
      class="send-btn"
      :disabled="!value.trim() || archivedReadonly"
      :aria-label="t('group.sendAria')"
      @click="emit('send')"
    >
      <Icon name="send" :size="16" />
    </button>
    <button
      v-else
      type="button"
      class="send-btn stop-btn"
      :aria-label="t('chat.stopGenerating')"
      @click="emit('stop')"
    >
      <Icon name="stop" :size="14" />
    </button>
    <span v-if="streaming" role="status" aria-live="polite">{{ t('bubble.generatingText') }}</span>
  </footer>
</template>

<style scoped>
.input-area {
  display: flex;
  gap: 8px;
  padding: 10px 16px;
  border-top: 1px solid var(--border);
  background: var(--card);
  flex-shrink: 0;
}

.input-wrapper {
  flex: 1;
  position: relative;
}

.msg-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border);
  background: var(--background);
  color: var(--foreground);
  border-radius: var(--radius-md);
  font-size: 13px;
  font-family: inherit;
  resize: none;
}

.msg-input:focus {
  outline: 2px solid var(--secondary);
  outline-offset: 1px;
}

.msg-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.send-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: var(--size-control-md);
  border: none;
  background: var(--primary);
  color: var(--on-primary);
  border-radius: var(--radius-md);
  cursor: pointer;
  flex-shrink: 0;
  align-self: flex-end;
}

@media (hover: hover) and (pointer: fine) {
  .send-btn:hover:not(:disabled) {
    opacity: 0.9;
  }
}

.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 生成中：同一按钮切换为中止动作，用危险语义色与发送区分。
   注：不用实心 --danger（在深色主题下为浅红，白字对比度不足），
   改用 danger 三件套（bg/fg/border），与既有警示文本一致。 */
.send-btn.stop-btn {
  background: var(--danger-bg);
  color: var(--danger-fg);
  border: 1px solid var(--danger-border);
}

/* @提及下拉 */
.mention-dropdown {
  position: absolute;
  bottom: 100%;
  left: 0;
  right: 0;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.15);
  max-height: 200px;
  overflow-y: auto;
  z-index: 10;
  margin-bottom: 4px;
}

.mention-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 10px;
  border: none;
  background: transparent;
  color: var(--foreground);
  text-align: left;
  cursor: pointer;
  font-size: 12px;
}

@media (hover: hover) and (pointer: fine) {
  .mention-item:hover {
    background: var(--card-elevated);
  }
}

/* iOS 聚焦防放大：可编辑控件字号须 ≥16px（I-7 / D1） */
@media (max-width: 640px) {
  .msg-input {
    font-size: 16px;
  }
}
</style>
