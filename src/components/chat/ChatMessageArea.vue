<script setup lang="ts">
/**
 * ChatMessageArea — 消息滚动区 + 空对话引导卡（R1-5 从 ChatMain 拆出）
 *
 * 为什么窗口化、滚动补偿、搜索跳转都收在这个文件里：
 * 它们是"这个盒子怎么滚"的同一份状态（D-6 的 250ms 时间窗屏蔽就是窗口边界与
 * 补偿滚动的耦合产物）。父级另持一份 ref 去操作它，等于两处各记一份 scrollTop
 * 基准——A7 那轮分叉踩过。父级只给数据（消息、状态条、背景样式）和三个意图
 * （用示例开场 / 删消息二次确认由宿主弹窗），不碰滚动。
 */
import { computed, ref } from 'vue';
import type { StyleValue } from 'vue';
import { t } from '@/i18n';
import Icon from '@/components/common/Icon.vue';
import MessageBubble from '@/components/chat/MessageBubble.vue';
import StatusHud from '@/components/chat/StatusHud.vue';
import { useChatStore } from '@/stores/chat';
import { useChatWindowing } from '@/composables/useChatWindowing';
import type { CharacterStatus } from '@core/status-schema';
import type { MessageSearchResult } from '@core/message-search';
import type { UICharacter } from '@/types';

const props = defineProps<{
  /** 当前会话角色（消息数组、空态文案都取它） */
  character: UICharacter;
  /** 会话级最新状态（宿主用 resolveLatestStatus 派生） */
  latestStatus: CharacterStatus | null;
  /** P1 状态条开关（settings.statusHudConfig.showSticky !== false） */
  showStatusHud: boolean;
  /** F08.2 聊天背景图片样式（`none` 档返回空对象，故用 StyleValue） */
  bgStyle: StyleValue;
  /** F08.2 背景遮罩层样式 */
  bgOverlayStyle: StyleValue;
}>();

const emit = defineEmits<{
  /** 消息操作（copy / delete / regenerate / edit / speak / translate），逻辑归宿主 */
  action: [msgId: string, action: string];
  /** 长按唤起动作条 */
  longpress: [msgId: string];
  /** 点空态示例：把文案填进输入框（输入框在输入区组件里） */
  'use-example': [text: string];
}>();

const chatStore = useChatStore();
const msgArea = ref<HTMLElement | null>(null);
/** 搜索命中的消息（改变时只影响加粗描边，不改变消息尺寸，避免虚拟化滚动跳动） */
const highlightedMessageId = ref<string | null>(null);

const {
  windowStart,
  topSpacerHeight,
  bottomSpacerHeight,
  visibleMessages,
  hasOlderMessages,
  atBottom,
  handleScroll,
  loadOlderMessages,
  jumpToBottom,
  jumpToMessage,
  cacheMsgHeight,
} = useChatWindowing(
  () => props.character?.messages ?? [],
  msgArea,
  () => props.character?.id,
);

/** 跳到搜索命中：先动窗口边界，再记录高亮 */
async function handleSearchJump(result: MessageSearchResult): Promise<void> {
  highlightedMessageId.value = result.id;
  await jumpToMessage(result);
}

/** 换会话时清高亮（窗口重置在 composable 里，这里只清视觉标记） */
function clearHighlight(): void {
  highlightedMessageId.value = null;
}

// ── P2-#6 空对话引导卡 ──
const isChatEmpty = computed(
  () => !!props.character && props.character.messages.length === 0
);
const examplePrompts = computed(() => [
  { key: 'chat.example1', text: t('chat.example1') },
  { key: 'chat.example2', text: t('chat.example2') },
  { key: 'chat.example3', text: t('chat.example3') },
  { key: 'chat.example4', text: t('chat.example4') },
]);

defineExpose({ handleSearchJump, clearHighlight });
</script>

<template>
  <!-- P1 会话级状态条：截至当前的最新状态（纯 computed 派生，零持久化） -->
  <StatusHud v-if="showStatusHud" variant="sticky" :status="latestStatus" />

  <!-- 消息区：role="log" + aria-live 让屏幕阅读器感知新消息；
       生成期间 aria-busy 暂停逐 token 播报（P2-4 读屏节流） -->
  <div
    ref="msgArea"
    class="chat-messages tk-scroll"
    :style="bgStyle"
    role="log"
    aria-live="polite"
    :aria-busy="chatStore.isGenerating ? 'true' : 'false'"
    aria-relevant="additions text"
    :aria-label="t('chat.messagesAria')"
    @scroll="handleScroll"
  >
    <!-- F08.2 背景遮罩层（保证文字可读性） -->
    <div class="chat-bg-overlay" :style="bgOverlayStyle" aria-hidden="true"></div>
    <div class="chat-messages-content">
      <!-- P2-11 顶部占位(已回收的更早消息高度) -->
      <div
        v-if="topSpacerHeight > 0"
        class="msg-spacer"
        :style="{ height: topSpacerHeight + 'px' }"
        aria-hidden="true"
      ></div>
      <!-- 更早消息按需加载（双向窗口化渲染，避免长对话 DOM 膨胀） -->
      <button
        v-if="hasOlderMessages"
        type="button"
        class="load-older-btn"
        @click="loadOlderMessages"
      >
        {{ t('chat.loadOlder', { count: windowStart }) }}
      </button>
      <!--
        P0-1 渲染性能：v-memo 让历史消息在这些值未变时被 Vue **直接跳过 patch**，
        只有最后一条（流式写入中）的消息参与更新；既有 RENDER_WINDOW 窗口化不动。
      -->
      <MessageBubble
        v-for="msg in visibleMessages"
        :key="msg.id"
        :data-message-id="msg.id"
        :class="{ 'message-search-active': highlightedMessageId === msg.id }"
        v-memo="[msg.content, msg.thinking, msg.reasoningTokens, msg.status, msg.generating, msg.narration, msg.narrationAfter, msg.promptTrace, msg.eventTrace, highlightedMessageId === msg.id]"
        :msg="msg"
        @action="(msgId: string, action: string) => emit('action', msgId, action)"
        @longpress="(msgId: string) => emit('longpress', msgId)"
        :ref="(el) => cacheMsgHeight(el, msg.id)"
      />
      <!-- P2-11 底部占位(已回收的更晚消息高度) -->
      <div
        v-if="bottomSpacerHeight > 0"
        class="msg-spacer"
        :style="{ height: bottomSpacerHeight + 'px' }"
        aria-hidden="true"
      ></div>
    </div>
    <!-- P2-#6 空对话引导卡（当前角色无消息时显示，替代大面积留白） -->
    <div
      v-if="isChatEmpty"
      class="empty-state"
      role="status"
      aria-live="polite"
    >
      <div class="empty-state-icon" aria-hidden="true">
        <Icon name="chat-circle" :size="46" />
      </div>
      <h2 class="empty-state-title">{{ t('chat.emptyStateTitle', { name: character.name }) }}</h2>
      <p class="empty-state-desc">{{ t('chat.emptyStateDesc') }}</p>
      <div class="empty-state-examples">
        <span class="empty-state-examples-label">{{ t('chat.emptyStateExamples') }}</span>
        <div class="example-chips">
          <button
            v-for="ex in examplePrompts"
            :key="ex.key"
            type="button"
            class="example-chip"
            :disabled="chatStore.isGenerating"
            @click="emit('use-example', ex.text)"
          >
            {{ ex.text }}
          </button>
        </div>
      </div>
    </div>
    <!-- P2-11 Phase4: 回到底部浮动按钮(上滚查看历史后一键回最新) -->
    <button
      v-if="!atBottom"
      type="button"
      class="jump-bottom-btn"
      :aria-label="t('chat.jumpToBottomAria')"
      @click="jumpToBottom"
    >
      <Icon name="arrow-down" :size="14" aria-hidden="true" />
    </button>
  </div>
</template>

<style scoped>
/* F08.2 背景遮罩层（覆盖在背景图上，保证文字可读性） */
.chat-bg-overlay {
  position: absolute;
  inset: 0;
  background: var(--background);
  pointer-events: none;
  z-index: 0;
}

/* F08.2 消息内容层（在遮罩之上，保证可滚动） */
.chat-messages-content {
  position: relative;
  z-index: 1;
}

/* P2-11 双向窗口占位(纯占位, 不参与交互与背景绘制) */
.msg-spacer {
  width: 100%;
  pointer-events: none;
}

/* P2-11 Phase4: 回到底部浮动按钮(视口不在底部时显示, 绝对定位于滚动容器底部) */
.jump-bottom-btn {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  bottom: 12px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--border);
  background: var(--card-elevated);
  color: var(--foreground);
  cursor: pointer;
  box-shadow: var(--shadow-popup);
  transition: opacity 0.15s ease;
}

@media (hover: hover) and (pointer: fine) {
  .jump-bottom-btn:hover {
    background: color-mix(in srgb, var(--primary) 14%, var(--card-elevated));
    color: var(--primary-fg);
  }
}

.jump-bottom-btn:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
}

/* 搜索跳转后的轻量定位提示，不改变消息尺寸，避免虚拟化滚动跳动。 */
:deep(.message-search-active .msg-bubble) {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary) 65%, transparent);
}

/* P1-9 窗口化：加载更早消息按钮 */
.load-older-btn {
  display: block;
  margin: 8px auto;
  padding: 6px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-secondary);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
}
@media (hover: hover) and (pointer: fine) {
  .load-older-btn:hover {
    border-color: var(--ring);
    color: var(--text-primary);
  }
}
.load-older-btn:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
}

/* P2-#6 空对话引导卡（覆盖整个消息区，居中展示） */
.empty-state {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: var(--spacing-lg);
  text-align: center;
}

.empty-state-icon {
  display: flex;
  color: var(--muted-foreground);
  opacity: 0.7;
}

.empty-state-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 600;
  color: var(--foreground);
}

.empty-state-desc {
  margin: 0;
  max-width: 420px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--muted-foreground);
}

.empty-state-examples {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  margin-top: 6px;
}

.empty-state-examples-label {
  font-size: 12px;
  color: var(--muted-foreground);
}

.example-chips {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--spacing-sm);
  max-width: 540px;
}

.example-chip {
  padding: 8px 14px;
  font-size: 13px;
  line-height: 1.4;
  border-radius: var(--radius-pill);
  background: var(--card);
  color: var(--foreground);
  border: 1px solid var(--border);
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, transform 0.1s;
}

@media (hover: hover) and (pointer: fine) {
  .example-chip:hover:not(:disabled) {
    background: color-mix(in srgb, var(--primary) 12%, var(--card));
    border-color: color-mix(in srgb, var(--primary) 30%, transparent);
    color: var(--primary-fg);
  }
}

.example-chip:active:not(:disabled) {
  transform: scale(0.97);
}

.example-chip:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.example-chip:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
}
</style>
