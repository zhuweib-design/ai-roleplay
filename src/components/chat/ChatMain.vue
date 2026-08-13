<script setup lang="ts">
import { ref, watch, nextTick, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useCharacterStore } from '@/stores/character';
import { useChatStore } from '@/stores/chat';
import { useSettingsStore } from '@/stores/settings';
import { useStoryStore } from '@/stores/story';
import { usePersonaStore } from '@/stores/persona';
import { uiMsgsToChatMsgs } from '@/services/type-adapters';
import { downloadChatMarkdown } from '@/services/backup-service';
import type { Chat } from '@/storage/types';
import Icon from '@/components/common/Icon.vue';
import Avatar from '@/components/common/Avatar.vue';
import MessageBubble from './MessageBubble.vue';
import Toast from '@/components/common/Toast.vue';
import ApiErrorModal from '@/components/common/ApiErrorModal.vue';
import type { IconName } from '@/components/common/icons';
import type { QuickReplyButton } from '@/types';
// F12.2 TTS / F12.3 翻译
import { ttsService, isTTSSupported } from '@services/tts-service';
import { translateText, TranslationError } from '@services/translator';
import { t } from '@/i18n';

const router = useRouter();
const characterStore = useCharacterStore();
const chatStore = useChatStore();
const settings = useSettingsStore();
const personaStore = usePersonaStore();
// F16.4 故事时间（用于顶栏显示）
const storyStore = useStoryStore();

// F12.3 消息翻译结果（按消息 id 缓存译文）
const messageTranslations = ref<Record<string, string>>({});

// Toast 反馈状态（F12.2/F12.3）
const toastOpen = ref(false);
const toastMessage = ref('');
const toastType = ref<'info' | 'success' | 'error'>('info');

// 需求9：API 错误诊断 Modal 状态
const apiErrorModalOpen = ref(false);
/** 上次已展示过的错误引用，避免同一错误重复弹窗 */
let lastShownErrorRef: unknown = null;

watch(
  () => chatStore.lastError,
  (err) => {
    if (!err) return;
    // aborted 错误已通过消息气泡显示，不弹 Modal
    if (err.type === 'aborted') return;
    // 避免对同一错误对象重复弹窗
    if (err.original === lastShownErrorRef && lastShownErrorRef !== null) return;
    lastShownErrorRef = err.original ?? null;
    apiErrorModalOpen.value = true;
  }
);

function handleApiErrorGoToSettings() {
  router.push({ name: 'settings' });
}

function handleApiErrorRetry() {
  // 重试最近一条用户消息
  const msgs = char.value.messages;
  const lastUser = [...msgs].reverse().find((m) => m.role === 'user');
  if (!lastUser) return;
  // 复用现有发送逻辑：将原文本重新发送
  void chatStore.sendMessage(char.value, lastUser.content);
}

function handleApiErrorClose() {
  // 清空 chatStore.lastError 避免下次开启 Modal 时仍残留旧错误
  chatStore.clearLastError();
}

const textarea = ref<HTMLTextAreaElement | null>(null);
const msgArea = ref<HTMLElement | null>(null);

const char = computed(() => characterStore.currentCharacter);

// ── P1-9 性能：消息窗口化渲染 ──
// 只渲染最近 N 条消息，更早消息按需加载，避免长对话 DOM 线性膨胀
const RENDER_WINDOW = 100;
const renderLimit = ref(RENDER_WINDOW);
const visibleMessages = computed(() => {
  const all = char.value.messages;
  if (all.length <= renderLimit.value) return all;
  return all.slice(all.length - renderLimit.value);
});
const hasOlderMessages = computed(
  () => char.value.messages.length > renderLimit.value
);
// 加载更早时抑制自动滚动（保持阅读位置）
let suppressScroll = false;
// T-03：自动加载防重入（滚动事件高频触发）
const loadingOlder = ref(false);
function loadOlderMessages() {
  if (loadingOlder.value) return;
  loadingOlder.value = true;
  const el = msgArea.value;
  const prevScrollTop = el ? el.scrollTop : 0;
  const prevScrollHeight = el ? el.scrollHeight : 0;
  suppressScroll = true;
  renderLimit.value += RENDER_WINDOW;
  nextTick(() => {
    // T-03：顶部插入后补偿滚动位置，保持视觉稳定（用户不会跳走）
    if (el) {
      const added = el.scrollHeight - prevScrollHeight;
      el.scrollTop = prevScrollTop + added;
    }
    suppressScroll = false;
    loadingOlder.value = false;
  });
}
// T-03：滚动接近顶部时自动加载更早消息（按钮保留供键盘用户）
function handleScroll() {
  const el = msgArea.value;
  if (!el || loadingOlder.value || suppressScroll) return;
  if (el.scrollTop < 300 && hasOlderMessages.value) {
    loadOlderMessages();
  }
}
// 切换角色时重置窗口
watch(
  () => char.value.id,
  () => {
    renderLimit.value = RENDER_WINDOW;
  }
);

// F08.2 聊天背景图片样式（应用到 .chat-messages 容器）
const chatBgStyle = computed(() => {
  const bg = settings.chatBackground;
  if (bg.type === 'none' || !bg.value) return {};
  return {
    backgroundImage: `url(${bg.value})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  };
});

// F08.2 背景遮罩层样式（半透明遮罩 + 模糊，保证文字可读性）
const chatBgOverlayStyle = computed(() => {
  const bg = settings.chatBackground;
  if (bg.type === 'none' || !bg.value) return { display: 'none' };
  // 遮罩不透明度 = 1 - 背景不透明度（背景越透明，遮罩越深）
  return {
    opacity: 1 - bg.opacity,
    backdropFilter: bg.blur > 0 ? `blur(${bg.blur}px)` : 'none',
    WebkitBackdropFilter: bg.blur > 0 ? `blur(${bg.blur}px)` : 'none',
  };
});

// F08.2 气泡样式 CSS 变量（应用到 .chat-main 根元素，供 MessageBubble 使用）
const bubbleCssVars = computed(() => ({
  '--bubble-radius': `${settings.bubbleStyle.radius}px`,
  '--bubble-opacity': String(settings.bubbleStyle.opacity),
}));

// F16.4 故事时间显示（角色关联故事时显示）
const storyTimeText = computed(() => {
  const storyId = char.value.storyId;
  if (!storyId) return '';
  return storyStore.getFormattedStoryTime(storyId);
});

// ── 自动滚动到底部 ──
watch(
  () => char.value.messages.length,
  () => {
    if (suppressScroll) return;
    nextTick(() => {
      if (msgArea.value) {
        msgArea.value.scrollTop = msgArea.value.scrollHeight;
      }
    });
  }
);

watch(
  () => visibleMessages.value.map((m) => m.content).join(''),
  () => {
    if (suppressScroll) return;
    nextTick(() => {
      if (msgArea.value) {
        msgArea.value.scrollTop = msgArea.value.scrollHeight;
      }
    });
  }
);

// ── 输入区 ──
function adjustHeight() {
  const el = textarea.value;
  if (!el) return;
  el.style.height = 'auto';
  const minH = 56;
  const maxH = 200;
  el.style.height = `${Math.max(minH, Math.min(el.scrollHeight, maxH))}px`;
}

function handleSend() {
  const el = textarea.value;
  if (!el) return;
  const text = el.value.trim();
  if (!text || chatStore.isGenerating) return;
  void chatStore.sendMessage(char.value, text);
  el.value = '';
  adjustHeight();
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
}

function handleStop() {
  chatStore.stop();
}

// 导出当前对话为 Markdown 文件（第5条）
function handleExportChat() {
  const msgs = char.value.messages;
  if (msgs.length === 0) {
    toastMessage.value = t('chat.emptyChat');
    toastType.value = 'info';
    toastOpen.value = true;
    return;
  }
  const chat: Chat = {
    id: `chat-${char.value.id}`,
    characterId: char.value.id,
    title: t('chat.conversationTitle', { name: char.value.name }),
    messages: uiMsgsToChatMsgs(msgs),
    createdAt: new Date(msgs[0].timestamp).toISOString(),
    updatedAt: new Date().toISOString(),
  };
  downloadChatMarkdown(chat, char.value.name, personaStore.activeUserName);
  toastMessage.value = t('chat.exportedMarkdown');
  toastType.value = 'success';
  toastOpen.value = true;
}

function handleMessageAction(msgId: string, action: string) {
  switch (action) {
    case 'copy':
      chatStore.copyMessage(char.value.messages.find((m) => m.id === msgId)!);
      break;
    case 'delete':
      chatStore.deleteMessage(char.value, msgId);
      break;
    case 'regenerate':
      void chatStore.regenerateMessage(char.value, msgId);
      break;
    case 'edit': {
      const msg = char.value.messages.find((m) => m.id === msgId);
      if (msg) {
        const newText = window.prompt(t('chat.editMessage'), msg.content);
        if (newText !== null) {
          chatStore.editMessage(msg, newText);
          chatStore.persistAfterEdit(char.value);
        }
      }
      break;
    }
    case 'branch':
      window.alert(t('chat.branchDemo'));
      break;
    case 'speak': {
      // F12.2 TTS 朗读
      const msg = char.value.messages.find((m) => m.id === msgId);
      if (msg) {
        speakMessage(msg.content);
      }
      break;
    }
    case 'translate': {
      // F12.3 消息翻译
      const msg = char.value.messages.find((m) => m.id === msgId);
      if (msg) {
        void translateMessage(msg);
      }
      break;
    }
  }
}

// ── F12.2 TTS 朗读 ──

function speakMessage(text: string) {
  if (!isTTSSupported()) {
    toastMessage.value = t('chat.ttsUnsupported');
    toastType.value = 'error';
    toastOpen.value = true;
    return;
  }
  if (ttsService.isSpeaking) {
    ttsService.stop();
    toastMessage.value = t('chat.ttsStopped');
    toastType.value = 'info';
    toastOpen.value = true;
    return;
  }
  const config = settings.ttsConfig;
  ttsService.speak({
    text,
    voiceURI: config.voiceURI,
    rate: config.rate,
    pitch: config.pitch,
    volume: config.volume,
    onError: (err) => {
      toastMessage.value = t('chat.ttsFailed', { error: String(err) });
      toastType.value = 'error';
      toastOpen.value = true;
    },
  });
}

// ── F12.3 消息翻译 ──

async function translateMessage(msg: { id: string; content: string }) {
  const config = settings.translationConfig;
  if (!config.enabled) {
    toastMessage.value = t('chat.translateDisabled');
    toastType.value = 'error';
    toastOpen.value = true;
    return;
  }
  try {
    const result = await translateText(msg.content, config);
    // 将翻译结果存到 messageTranslation 映射
    messageTranslations.value[msg.id] = result.translatedText;
    toastMessage.value = t('chat.translateDone');
    toastType.value = 'success';
    toastOpen.value = true;
  } catch (err) {
    const message =
      err instanceof TranslationError
        ? err.message
        : t('chat.translateFailed', {
            error: err instanceof Error ? err.message : String(err),
          });
    toastMessage.value = message;
    toastType.value = 'error';
    toastOpen.value = true;
  }
}

const toolButtons: Array<{ icon: IconName; label: string }> = [
  { icon: 'plus', label: t('chat.attachFile') },
  { icon: 'bookmark-simple', label: t('chat.reference') },
  { icon: 'share-fat', label: t('chat.image') },
  { icon: 'music-notes', label: t('chat.voice') },
];

function handleToolClick(label: string) {
  // Vue 模板无法直接访问 window，需通过方法调用
  window.alert(t('chat.featurePending', { feature: label }));
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
function handleQuickReply(btn: QuickReplyButton) {
  if (chatStore.isGenerating) return;
  if (btn.autoSend) {
    void chatStore.sendMessage(char.value, btn.script);
  } else {
    if (textarea.value) {
      textarea.value.value = btn.script;
      adjustHeight();
      textarea.value.focus();
    }
  }
}
</script>

<template>
  <main id="main-content" class="chat-main" :style="bubbleCssVars" :aria-label="t('chat.mainAria')" tabindex="-1">
    <!-- 顶栏 -->
    <header class="chat-header">
      <button
        type="button"
        class="mobile-menu-btn"
        :aria-label="t('chat.openCharList')"
        @click="characterStore.toggleCharacterList()"
      >
        <Icon name="menu" :size="20" />
      </button>

      <div class="chat-title">
        <Avatar :character="char" :size="24" />
        <span class="chat-name truncate">{{ char.name }}</span>
        <span class="model-badge">{{ settings.activeProfile?.model ?? char.model }}</span>
      </div>

      <div class="chat-token" aria-hidden="true">
        {{ t('chat.tokenUsed', { count: (chatStore.totalTokenUsage / 1000).toFixed(1) }) }}
        <span
          v-if="chatStore.prefixCacheHitRate !== null"
          class="cache-rate"
          :title="t('chat.cacheHitTitle', { hit: chatStore.cacheUsage.hitTokens, miss: chatStore.cacheUsage.missTokens, reported: chatStore.cacheUsage.reported })"
        >
          · {{ t('chat.cacheHit', { percent: (chatStore.prefixCacheHitRate * 100).toFixed(0) }) }}
        </span>
        <span
          v-else-if="chatStore.prefixStableRate !== null"
          class="cache-rate local"
          :title="t('chat.prefixStableTitle', { stable: chatStore.prefixStability.stable, total: chatStore.prefixStability.total, last: chatStore.ttftStats.lastMs, avg: chatStore.ttftStats.avgMs })"
        >
          · {{ t('chat.prefixStable', { percent: (chatStore.prefixStableRate * 100).toFixed(0) }) }}
        </span>
      </div>

      <!-- F16.4 故事时间显示（仅当角色关联故事时显示） -->
      <div
        v-if="storyTimeText"
        class="chat-story-time"
        :title="t('chat.storyTimeTitle')"
        role="status"
        aria-live="polite"
      >
        <Icon name="calendar-check" :size="14" />
        <span>{{ storyTimeText }}</span>
      </div>

      <div class="chat-actions">
        <button
          type="button"
          class="hover-surface panel-toggle-btn"
          :aria-label="t('chat.exportChat')"
          :title="t('chat.exportChatTitle')"
          @click="handleExportChat"
        >
          <Icon name="download" :size="20" />
        </button>
        <button
          type="button"
          class="hover-surface panel-toggle-btn"
          :aria-label="t('chat.togglePanel')"
          :aria-expanded="characterStore.panelOpen"
          @click="characterStore.togglePanel()"
        >
          <Icon name="panel-right" :size="20" />
        </button>
      </div>
    </header>

    <!-- 消息区：role="log" + aria-live 让屏幕阅读器感知新消息；
         生成期间 aria-busy 暂停逐 token 播报（P2-4 读屏节流） -->
    <div
      ref="msgArea"
      class="chat-messages tk-scroll"
      :style="chatBgStyle"
      role="log"
      aria-live="polite"
      :aria-busy="chatStore.isGenerating ? 'true' : 'false'"
      aria-relevant="additions text"
      :aria-label="t('chat.messagesAria')"
      @scroll="handleScroll"
    >
      <!-- F08.2 背景遮罩层（保证文字可读性） -->
      <div class="chat-bg-overlay" :style="chatBgOverlayStyle" aria-hidden="true"></div>
      <div class="chat-messages-content">
        <!-- 更早消息按需加载（窗口化渲染，避免长对话性能退化） -->
        <button
          v-if="hasOlderMessages"
          type="button"
          class="load-older-btn"
          @click="loadOlderMessages"
        >
          {{ t('chat.loadOlder', { count: char.messages.length - visibleMessages.length }) }}
        </button>
        <MessageBubble
          v-for="msg in visibleMessages"
          :key="msg.id"
          :msg="msg"
          @action="handleMessageAction"
        />
      </div>
    </div>

    <!-- 输入区 -->
    <footer class="chat-footer">
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
              :title="btn.script"
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
          :placeholder="t('chat.inputPlaceholder')"
          rows="1"
          aria-describedby="chat-input-hint"
          @input="adjustHeight"
          @keydown="handleKeydown"
        />
        <span id="chat-input-hint" class="sr-only">{{ t('chat.inputHint') }}</span>
        <div class="composer-toolbar">
          <div class="composer-actions">
            <button
              v-for="tb in toolButtons"
              :key="tb.label"
              type="button"
              class="composer-btn"
              :aria-label="tb.label"
              @click="handleToolClick(tb.label)"
            >
              <Icon :name="tb.icon" :size="18" />
            </button>
          </div>
          <button
            type="button"
            class="send-btn-primary"
            :aria-label="chatStore.isGenerating ? t('chat.stopGenerating') : t('chat.sendMessage')"
            @click="chatStore.isGenerating ? handleStop() : handleSend()"
          >
            <Icon :name="chatStore.isGenerating ? 'stop' : 'send'" :size="chatStore.isGenerating ? 14 : 16" />
          </button>
        </div>
      </div>
    </footer>

    <!-- F12.2/F12.3 Toast 反馈 -->
    <Toast
      v-model="toastOpen"
      :type="toastType"
      :message="toastMessage"
    />

    <!-- 需求9：API 错误诊断 Modal -->
    <ApiErrorModal
      v-model="apiErrorModalOpen"
      :error="chatStore.lastError"
      @go-to-settings="handleApiErrorGoToSettings"
      @retry="handleApiErrorRetry"
      @update:model-value="(v) => { if (!v) handleApiErrorClose(); }"
    />
  </main>
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

/* F08.2 气泡样式覆盖（通过 CSS 变量控制圆角和透明度） */
:deep(.msg-bubble) {
  border-radius: var(--bubble-radius, var(--radius-md));
  opacity: var(--bubble-opacity, 1);
}

.mobile-menu-btn {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  background: none;
  border: none;
  color: var(--muted-foreground);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

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

.chat-name {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 16px;
  color: var(--foreground);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.model-badge {
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--secondary) 12%, transparent);
  /* 文字向 foreground 提亮，保证 on 彩色浅底 ≥4.5:1（theatre 粉色系 12% 底 4.38:1 → 提亮后达标） */
  color: color-mix(in srgb, var(--secondary) 78%, var(--foreground));
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
  flex-shrink: 0;
}

/* 前缀缓存命中率徽标 */
.cache-rate {
  font-size: 11px;
  color: var(--green, #9ece6a);
  cursor: help;
}

/* 本地前缀稳定率徽标(供应商未返回缓存字段时的代理指标) */
.cache-rate.local {
  color: var(--cyan, #7dcfff);
}

.panel-toggle-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  color: var(--muted-foreground);
  cursor: pointer;
  background: none;
  border: none;
}

/* F11.3 Quick Reply 按钮组 */
.quick-reply-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
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

.qr-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--secondary) 18%, transparent);
  border-color: color-mix(in srgb, var(--secondary) 35%, transparent);
}

.qr-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.qr-btn:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 1px;
}

/* F16.4 故事时间显示 */
.chat-story-time {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--accent-blue) 12%, transparent);
  color: var(--accent-blue);
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
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
.load-older-btn:hover {
  border-color: var(--ring);
  color: var(--text-primary);
}
.load-older-btn:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
}
</style>
