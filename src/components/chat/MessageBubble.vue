<script setup lang="ts">
import type { UIMessage } from '@/types';
import Icon from '@/components/common/Icon.vue';
import type { IconName } from '@/components/common/icons';

defineProps<{
  msg: UIMessage;
}>();

const emit = defineEmits<{
  action: [msgId: string, action: string];
}>();

interface MsgAction {
  key: string;
  icon: IconName;
  label: string;
  danger?: boolean;
}

const assistantActions: MsgAction[] = [
  { key: 'edit', icon: 'pencil', label: '编辑' },
  { key: 'copy', icon: 'copy', label: '复制' },
  { key: 'speak', icon: 'volume-2', label: '朗读' },
  { key: 'translate', icon: 'globe', label: '翻译' },
  { key: 'regenerate', icon: 'refresh-cw', label: '重新生成' },
  { key: 'branch', icon: 'git-branch', label: '分支' },
  { key: 'delete', icon: 'trash-2', label: '删除', danger: true },
];
</script>

<template>
  <div
    class="msg-wrap msg-enter"
    :class="msg.role === 'user' ? 'msg-wrap-user' : 'msg-wrap-assistant'"
    role="article"
    :aria-label="`${msg.role === 'user' ? '用户' : '角色'}消息`"
  >
    <!-- 用户消息 -->
    <div v-if="msg.role === 'user'" class="msg-bubble msg-user">
      <em v-if="msg.narration" class="msg-narration">{{ msg.narration }}</em>
      <p class="msg-text">{{ msg.content }}</p>
    </div>

    <!-- AI 消息 -->
    <div v-else class="msg-bubble msg-assistant">
      <em v-if="msg.narration" class="msg-narration">{{ msg.narration }}</em>
      <p class="msg-text" :style="msg.narration ? 'margin-top: 6px' : ''">{{ msg.content }}</p>
      <em v-if="msg.narrationAfter" class="msg-narration-after">{{ msg.narrationAfter }}</em>

      <!-- 生成中指示器：aria-live 让屏幕阅读器感知状态变化 -->
      <div
        v-if="msg.generating"
        class="gen-dot"
        role="status"
        aria-live="polite"
        aria-label="正在生成回复"
      >
        <span class="dot" aria-hidden="true" />
        <span class="gen-text">正在生成…</span>
      </div>

      <!-- 消息操作栏（hover 或聚焦时显示，保证键盘可达） -->
      <div class="msg-toolbar" role="toolbar" :aria-label="`消息操作：${assistantActions.map((a) => a.label).join('、')}`">
        <button
          v-for="a in assistantActions"
          :key="a.key"
          type="button"
          class="msg-toolbar-btn"
          :class="{ danger: a.danger }"
          :aria-label="a.label"
          @click="emit('action', msg.id, a.key)"
        >
          <Icon :name="a.icon" :size="14" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.msg-wrap-user {
  align-self: flex-end;
  margin-top: 8px;
}

.msg-wrap-assistant {
  align-self: flex-start;
}

.msg-bubble {
  max-width: min(70%, 40em);
  width: fit-content;
  border-radius: var(--radius-md);
  padding: 12px 16px;
  font-size: 14px;
  line-height: 1.7;
  word-wrap: break-word;
  white-space: pre-wrap;
  position: relative;
}

.msg-assistant {
  background: color-mix(in srgb, var(--secondary) 5%, transparent);
  border-left: 2px solid var(--secondary);
  color: var(--foreground);
}

.msg-user {
  background: color-mix(in srgb, var(--primary) 8%, transparent);
  color: var(--foreground);
}

.msg-text {
  margin: 0;
}

.msg-narration,
.msg-narration-after {
  font-style: italic;
  color: var(--muted-foreground);
  display: block;
}

.msg-narration {
  margin-bottom: 6px;
}

.msg-narration-after {
  margin-top: 6px;
}

.gen-dot {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
}

.gen-dot .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--secondary);
  animation: pulse-dot 1.2s ease-in-out infinite;
}

.gen-text {
  color: var(--secondary);
  font-size: 12px;
}

.msg-toolbar {
  position: absolute;
  top: -13px;
  right: 6px;
  display: flex;
  align-items: center;
  gap: 1px;
  padding: 3px;
  border-radius: var(--radius-sm);
  background: var(--card-elevated);
  border: 1px solid var(--border);
  opacity: 0;
  transition: opacity 0.15s ease;
}

.msg-wrap:hover .msg-toolbar,
.msg-wrap:focus-within .msg-toolbar {
  opacity: 1;
}

.msg-toolbar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: var(--radius-xs);
  color: var(--muted-foreground);
  cursor: pointer;
  background: none;
  border: none;
  transition: color 0.15s ease;
}

.msg-toolbar-btn:hover {
  color: var(--foreground);
}

.msg-toolbar-btn:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 1px;
}

.msg-toolbar-btn.danger:hover {
  color: var(--primary-fg);
}
</style>
