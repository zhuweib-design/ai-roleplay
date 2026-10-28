<script setup lang="ts">
/**
 * ChatComposer — 输入区（Quick Reply 条 + 输入框 + 发送/停止键）（R1-5 从 ChatMain 拆出）
 *
 * 高度自适应的单源在 CSS：JS 只把 height 交回内容高度，上下限全部由
 * `styles/layout.css` 的 `.chat-input` min/max-height 夹取。旧实现在 ChatMain 里
 * 另写死 56/200，与 ≤640 档 CSS 的 48/160 两套数互相压制，表现是"手机上永远长不过
 * 160，但 JS 一直以为自己给到了 200"。这个函数跟着 textarea 走，不再分家。
 *
 * `inert` 透传：I-14 上下文面板打开时整条输入区不可聚焦，与宿主根元素同一份开关。
 * 宿主经 `defineExpose` 拿到 `fillAndFocus`，给"空态示例 → 填入不发送"用。
 */
import { ref, computed, onMounted } from 'vue';
import { t } from '@/i18n';
import Icon from '@/components/common/Icon.vue';
import { useChatStore } from '@/stores/chat';
import { useSettingsStore } from '@/stores/settings';
import { useViewport } from '@/core/viewport';
import type { QuickReplyButton } from '@/types';

const props = defineProps<{
  /** I-14：面板打开时整条输入区 inert */
  inert?: boolean;
}>();

const emit = defineEmits<{
  /** 发送一条文本（写操作由宿主执行；本组件只管何时该清空输入） */
  send: [text: string];
  /** 停止生成 */
  stop: [];
}>();

const chatStore = useChatStore();
const settings = useSettingsStore();
// isCoarsePointer：手指端（软键盘没有 Shift 键），Enter 让位给换行、发送靠按钮
const { isCoarsePointer } = useViewport();

const textarea = ref<HTMLTextAreaElement | null>(null);

/**
 * 高度自适应：JS 只负责把 height 交回内容高度，上下限全部由 CSS 的
 * min-height / max-height 夹取（layout.css 的 .chat-input）。
 */
function adjustHeight(): void {
  const el = textarea.value;
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${Math.ceil(el.scrollHeight)}px`;
}

function handleSend(): void {
  const el = textarea.value;
  if (!el) return;
  const text = el.value.trim();
  if (!text || chatStore.isGenerating) return;
  emit('send', text);
}

/** 宿主发送成功后调用：清空并复原高度 */
function clearInput(): void {
  if (textarea.value) {
    textarea.value.value = '';
    adjustHeight();
  }
}

function fillAndFocus(text: string): void {
  if (chatStore.isGenerating) return;
  if (textarea.value) {
    textarea.value.value = text;
    adjustHeight();
    textarea.value.focus();
  }
}

function handleKeydown(e: KeyboardEvent): void {
  if (e.key !== 'Enter' || e.shiftKey) return;
  // 手指端：软键盘的 Enter 用于换行，发送靠输入区右侧那颗按钮（它已在右、且常驻可见）。
  // 桌面端维持既有约定：Enter 发送、Shift+Enter 换行。
  if (isCoarsePointer.value) return;
  // I-6：IME 组词中（中文拼音/日文假名/韩文）按回车不发送；组词完成后再按回车正常发送
  if (e.isComposing || e.keyCode === 229) return;
  e.preventDefault();
  handleSend();
}

// ── F11.3 Quick Reply ──
/** 按 group 字段分组的 Quick Reply 按钮 */
const quickReplyGroups = computed(() => {
  const groups: Array<{ name: string; buttons: QuickReplyButton[] }> = [];
  const map = new Map<string, QuickReplyButton[]>();
  for (const btn of settings.quickReplies) {
    const g = btn.group || '';
    if (!map.has(g)) map.set(g, []);
    map.get(g)!.push(btn);
  }
  for (const [name, buttons] of map) {
    groups.push({ name, buttons });
  }
  return groups;
});

/** 点击 Quick Reply 按钮：autoSend 时直接发送，否则填入输入框 */
function handleQuickReply(btn: QuickReplyButton): void {
  if (chatStore.isGenerating) return;
  if (btn.autoSend) {
    emit('send', btn.script);
  } else {
    fillAndFocus(btn.script);
  }
}

onMounted(adjustHeight);

defineExpose({ clearInput, fillAndFocus, adjustHeight });
</script>

<template>
  <!-- 输入区（I-14：上下文面板打开时 inert，避免焦点逃逸；顶栏 toggle 不受影响） -->
  <footer class="chat-footer" :inert="props.inert ? true : undefined">
    <!-- F11.3 Quick Reply 按钮组 -->
    <div
      v-if="quickReplyGroups.length > 0"
      class="quick-reply-bar"
      role="toolbar"
      :aria-label="t('chat.quickReplyAria')"
    >
      <div
        v-for="group in quickReplyGroups"
        :key="group.name || 'default'"
        class="qr-group"
      >
        <span v-if="group.name" class="qr-group-label">{{ group.name }}</span>
        <div class="qr-buttons">
          <button
            v-for="btn in group.buttons"
            :key="btn.id"
            type="button"
            class="qr-btn"
            :disabled="chatStore.isGenerating"
            v-tip="btn.script"
            @click="handleQuickReply(btn)"
          >
            {{ btn.label }}
          </button>
        </div>
      </div>
    </div>
    <div class="chat-composer">
      <label class="chat-input-label" for="chat-input">{{ t('chat.inputLabel') }}</label>
      <textarea
        id="chat-input"
        ref="textarea"
        class="chat-input"
        :placeholder="t(isCoarsePointer ? 'chat.inputPlaceholderTouch' : 'chat.inputPlaceholder')"
        rows="1"
        aria-describedby="chat-input-hint"
        @input="adjustHeight"
        @keydown="handleKeydown"
      />
      <span id="chat-input-hint" class="sr-only">{{ t(isCoarsePointer ? 'chat.inputHintTouch' : 'chat.inputHint') }}</span>
      <div class="composer-toolbar">
        <button
          type="button"
          class="send-btn-primary"
          :aria-label="chatStore.isGenerating ? t('chat.stopGenerating') : t('chat.sendMessage')"
          @click="chatStore.isGenerating ? emit('stop') : handleSend()"
        >
          <Icon :name="chatStore.isGenerating ? 'stop' : 'send'" :size="chatStore.isGenerating ? 14 : 16" />
        </button>
      </div>
    </div>
  </footer>
</template>

<style scoped>
/* 视觉隐藏的 label（屏幕阅读器可见） */
.chat-input-label {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* F11.3 Quick Reply 按钮组 */
.quick-reply-bar {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-sm);
  padding: 6px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--card);
}

.qr-group {
  display: flex;
  align-items: center;
  gap: 4px;
}

.qr-group-label {
  font-size: 11px;
  color: var(--muted-foreground);
  white-space: nowrap;
  margin-right: 2px;
}

.qr-buttons {
  display: flex;
  gap: 4px;
}

.qr-btn {
  padding: 4px 10px;
  font-size: 13px;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--secondary) 10%, transparent);
  color: var(--foreground);
  border: 1px solid color-mix(in srgb, var(--secondary) 20%, transparent);
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  white-space: nowrap;
}

@media (hover: hover) and (pointer: fine) {
  .qr-btn:hover:not(:disabled) {
    background: color-mix(in srgb, var(--secondary) 18%, transparent);
    border-color: color-mix(in srgb, var(--secondary) 35%, transparent);
  }
}

.qr-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.qr-btn:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 1px;
}
</style>
