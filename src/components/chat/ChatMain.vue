<script setup lang="ts">
/**
 * ChatMain — 单聊主区（宿主编排层）
 *
 * R1-5 拆分后只剩接线：页头 / 消息区 / 输入区三个子组件 + 四扇浮层 + 一处
 * 「动作 → store 方法」的分发。三件真正的状态机各自归位：
 *   - 窗口化与滚动补偿 → `useChatWindowing`（宿主是 `ChatMessageArea`）
 *   - 搜索（query / 结果 / 游标）→ `ChatHeader`
 *   - 输入框高度与 Quick Reply → `ChatComposer`
 *
 * 留在这里的是**跨组件的编排**：消息动作分发（要同时碰 store 与两扇 Modal）、
 * 导出落盘、API 错误诊断、TTS/翻译的 Toast 反馈。这些都不是某个子组件的私事。
 */
import { ref, watch, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useCharacterStore } from '@/stores/character';
import { useChatStore } from '@/stores/chat';
import { useSettingsStore } from '@/stores/settings';
import { uiMsgsToChatMsgs } from '@/services/type-adapters';
import { getWorldUserDisplayName } from '@/stores/chat-context';
import { resolveLatestStatus } from '@core/status-parser';
import { stripNarrationMarkers, parseNarrationSegments } from '@core/narration';
import { describeSaveResult } from '@/utils/save-blob';
import { downloadChatMarkdown } from '@/services/backup-service';
import type { Chat } from '@/storage/types';
import ChatHeader from './ChatHeader.vue';
import ChatMessageArea from './ChatMessageArea.vue';
import ChatComposer from './ChatComposer.vue';
import MessageActionSheet from './MessageActionSheet.vue';
import { assistantMsgActions } from './message-actions';
import Toast from '@/components/common/Toast.vue';
import Modal from '@/components/common/Modal.vue';
import ApiErrorModal from '@/components/common/ApiErrorModal.vue';
import ContextReadinessBar from '@/components/layout/ContextReadinessBar.vue';
// F12.2 TTS / F12.3 翻译
import { ttsService, isTTSSupported } from '@services/tts-service';
import { translateText, TranslationError } from '@services/translator';
import { t } from '@/i18n';
import type { MessageSearchResult } from '@core/message-search';

// I-14：承接 ChatView 传入的 inert，仅作用于聊天内容区与输入区，
// 顶栏的 panel-toggle-btn 保持可交互（打开上下文面板后仍能二次点击关闭）
const props = defineProps<{ inert?: boolean }>();

const router = useRouter();
const characterStore = useCharacterStore();
const chatStore = useChatStore();
const settings = useSettingsStore();

const char = computed(() => characterStore.currentCharacter!);

// F12.3 消息翻译结果（按消息 id 缓存译文）
const messageTranslations = ref<Record<string, string>>({});

// Toast 反馈状态（F12.2/F12.3）
const toastOpen = ref(false);
const toastMessage = ref('');
const toastType = ref<'info' | 'success' | 'error'>('info');

function notify(type: 'info' | 'success' | 'error', message: string): void {
  toastType.value = type;
  toastMessage.value = message;
  toastOpen.value = true;
}

/** 子组件经 `inert` 的开关 */
const inertAttr = computed(() => (props.inert ? true : undefined));

// ── F08.2 气泡样式 CSS 变量（应用到 .chat-main 根元素，供 MessageBubble 使用） ──
const bubbleCssVars = computed(() => ({
  '--bubble-radius': `${settings.bubbleStyle.radius}px`,
  '--bubble-opacity': String(settings.bubbleStyle.opacity),
}));

// ── F08.2 聊天背景图片样式（应用到 .chat-messages 容器） ──
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

// ── P1 会话级状态 HUD ──
// 纯 computed 派生（resolveLatestStatus 从后往前回溯，key 首次出现即锁定），
// 零额外持久化、不随消息数增长 DOM。消息级渲染本轮不做（决策 2），但 msg.status 照常存储。
const latestStatus = computed(() =>
  resolveLatestStatus(char.value?.messages ?? [], char.value?.statusSchema ?? null)
);
/** 顶部状态条开关（默认开；关闭时不渲染，解析与存储不受影响） */
const showStatusHud = computed(() => settings.statusHudConfig?.showSticky !== false);

// ── 需求9：API 错误诊断 Modal ──
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

function handleApiErrorGoToSettings(): void {
  void router.push({ name: 'settings' });
}

function handleApiErrorRetry(): void {
  // 重试最近一条用户消息
  const msgs = char.value.messages;
  const lastUser = [...msgs].reverse().find((m) => m.role === 'user');
  if (!lastUser) return;
  // 复用现有发送逻辑：将原文本重新发送
  void chatStore.sendMessage(char.value, lastUser.content);
}

function handleApiErrorClose(): void {
  // 清空 chatStore.lastError 避免下次开启 Modal 时仍残留旧错误
  chatStore.clearLastError();
}

// ── 输入区 / 消息区 ref（跨组件编排用） ──
const headerRef = ref<InstanceType<typeof ChatHeader> | null>(null);
const messageAreaRef = ref<InstanceType<typeof ChatMessageArea> | null>(null);
const composerRef = ref<InstanceType<typeof ChatComposer> | null>(null);

/** D-10：发送被拒（未配置 / 主密码锁定）时保留输入正文，不清空输入框 */
function handleSend(text: string): void {
  const blocked = chatStore.checkSendBlock();
  if (blocked) {
    notify('info', t(blocked === 'locked' ? 'char.profileLocked' : 'store.noApiProfile'));
    return;
  }
  void chatStore.sendMessage(char.value, text);
  composerRef.value?.clearInput();
}

function handleStop(): void {
  chatStore.stop();
}

/** 搜索命中跳转：动窗口边界的活归消息区 */
function handleSearchJump(result: MessageSearchResult): void {
  void messageAreaRef.value?.handleSearchJump(result);
}

/** 空态示例：填入输入框并聚焦（不自动发送，由用户确认后发送） */
function handleUseExample(text: string): void {
  composerRef.value?.fillAndFocus(text);
}

// 导出当前对话为 Markdown 文件（第5条）
async function handleExportChat(): Promise<void> {
  const msgs = char.value.messages;
  if (msgs.length === 0) {
    notify('info', t('chat.emptyChat'));
    return;
  }
  const chat: Chat = {
    id: `chat-${char.value.id}`,
    characterId: char.value.id,
    title: t('chat.conversationTitle', { name: char.value.name }),
    messages: uiMsgsToChatMsgs(msgs),
    createdAt: new Date(msgs[0]!.timestamp).toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const outcome = await downloadChatMarkdown(chat, char.value.name, getWorldUserDisplayName(char.value.id));
  // 取消 ⇒ 不提示；成功 ⇒ 说清落到哪（浏览器下载目录 / 系统下载目录）；
  // 安卓 WebView 拿不到选择器 ⇒ 说清"去哪找"，不再静默
  const saved = describeSaveResult(outcome);
  if (!saved) return;
  notify(saved.type, saved.message);
}

// ── 长按动作条：触屏没有 hover，操作入口改成长按唤起 ──
const actionSheetMsgId = ref<string | null>(null);
const sheetActions = computed(() => assistantMsgActions());

function handleMessageLongPress(msgId: string): void {
  actionSheetMsgId.value = msgId;
}

function closeActionSheet(): void {
  const id = actionSheetMsgId.value;
  actionSheetMsgId.value = null;
  if (!id) return;
  // 关闭后把焦点交还这条消息，键盘用户不必从列表头再 Tab 一遍
  document.querySelector<HTMLElement>(`.msg-wrap[data-message-id="${CSS.escape(id)}"]`)?.focus();
}

function handleSheetAction(key: string): void {
  const id = actionSheetMsgId.value;
  closeActionSheet();
  if (id) handleMessageAction(id, key);
}

// ── P1-3：消息编辑 Modal（替代原生 prompt） ──
const editModalOpen = ref(false);
// O-10/O-16：消息删除二次确认
const deleteConfirmMsgId = ref<string | null>(null);
const deleteConfirmModalOpen = computed({
  get: () => deleteConfirmMsgId.value !== null,
  set: (v: boolean) => {
    if (!v) deleteConfirmMsgId.value = null;
  },
});
function confirmDeleteMessage(): void {
  if (deleteConfirmMsgId.value) {
    chatStore.deleteMessage(char.value, deleteConfirmMsgId.value);
  }
  deleteConfirmMsgId.value = null;
}
const editTarget = ref<import('@/types').UIMessage | null>(null);
const editDraft = ref('');

/**
 * 编辑框下方的预览：走与气泡**同一个**分段函数，所以"编辑时看到的就是发出去后会长成的样子"。
 * 文本框里仍是带 ⟦ ⟧ 的原文（那是存储格式，删了就没法再区分哪句是心理活动），
 * 但用户不必靠猜——预览已经把两段拆开排好了，旁边一句话说明标记是什么。
 */
const editSegments = computed(() => parseNarrationSegments(editDraft.value));

function confirmEditMessage(): void {
  const msg = editTarget.value;
  if (!msg) return;
  const newText = editDraft.value.trim();
  if (newText && newText !== msg.content) {
    chatStore.editMessage(msg, newText);
    chatStore.persistAfterEdit(char.value);
  }
  editModalOpen.value = false;
  editTarget.value = null;
}

function handleMessageAction(msgId: string, action: string): void {
  switch (action) {
    case 'copy': {
      const msg = char.value.messages.find((m) => m.id === msgId);
      // 竞态兜底：消息可能已被并发删除，find 无果时跳过访问，避免裸 TypeError（copy 本为静默能力）
      if (!msg) break;
      chatStore.copyMessage(msg);
      break;
    }
    case 'delete':
      // O-10/O-16（REAL_DEVICE_TEST_2026-10-03）：消息删除不可逆——补二次确认，
      // 与会话级删除的两步强度对齐
      deleteConfirmMsgId.value = msgId;
      break;
    case 'regenerate':
      void chatStore.regenerateMessage(char.value, msgId);
      break;
    case 'edit': {
      // P1-3：改用应用内 Modal 编辑，替代原生 window.prompt
      const msg = char.value.messages.find((m) => m.id === msgId);
      if (msg) {
        editTarget.value = msg;
        editDraft.value = msg.content;
        editModalOpen.value = true;
      }
      break;
    }
    case 'speak': {
      // F12.2 TTS 朗读
      const msg = char.value.messages.find((m) => m.id === msgId);
      if (msg) {
        speakMessage(stripNarrationMarkers(msg.content));
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

function speakMessage(text: string): void {
  if (!isTTSSupported()) {
    notify('error', t('chat.ttsUnsupported'));
    return;
  }
  if (ttsService.isSpeaking) {
    ttsService.stop();
    notify('info', t('chat.ttsStopped'));
    return;
  }
  const config = settings.ttsConfig;
  // O-9（REAL_DEVICE_TEST_2026-10-03）：未启用时此前静默无效，而同面板翻译有明确提示——
  // 补齐对称反馈，避免用户无从判断"没开还是坏了"
  if (!config.enabled) {
    notify('info', t('chat.ttsDisabled'));
    return;
  }
  ttsService.speak({
    text,
    voiceURI: config.voiceURI,
    rate: config.rate,
    pitch: config.pitch,
    volume: config.volume,
    onError: (err) => {
      notify('error', t('chat.ttsFailed', { error: String(err) }));
    },
  });
}

// ── F12.3 消息翻译 ──

async function translateMessage(msg: { id: string; content: string }): Promise<void> {
  const config = settings.translationConfig;
  if (!config.enabled) {
    notify('error', t('chat.translateDisabled'));
    return;
  }
  try {
    const result = await translateText(stripNarrationMarkers(msg.content), config);
    // 将翻译结果存到 messageTranslation 映射
    messageTranslations.value[msg.id] = result.translatedText;
    notify('success', t('chat.translateDone'));
  } catch (err) {
    notify(
      'error',
      err instanceof TranslationError
        ? err.message
        : t('chat.translateFailed', {
            error: err instanceof Error ? err.message : String(err),
          }),
    );
  }
}

// 注：原「附件/引用/图片/语音」四个工具栏按钮为未实现占位（点击弹出"功能开发中"），
// 已移除入口，避免误导用户；后续实现对应能力后再恢复。

// 供单测与自动化读取（不改渲染行为）：搜索/翻译的状态持有者已搬到子组件，
// 这里只把仍由宿主负责的两项显式暴露，避免 e2e 与单测按 DOM 猜位置。
defineExpose({ headerRef, messageAreaRef, composerRef });
</script>

<template>
  <!-- 批次 0-6：此前 props.inert 只落在 `<footer class="chat-footer">` 上，
       抽屉打开时第 13 次 Tab 会逃到遮罩后面的聊天区。根元素接上 inert 后，
       遮罩后面的整个主区（含页头与消息区）都不再可聚焦。 -->
  <main
    id="main-content"
    class="chat-main"
    :inert="inertAttr"
    :style="bubbleCssVars"
    :aria-label="t('chat.mainAria')"
    tabindex="-1"
  >
    <!-- 顶栏 + 全文搜索条（多根，平铺进这里的列容器） -->
    <ChatHeader
      ref="headerRef"
      v-if="char"
      :character="char"
      @export="handleExportChat"
      @jump="handleSearchJump"
    />

    <!-- L 层：依赖就绪状态一眼可见，未就绪时给出原因与一步跳转（取代失败后才提示） -->
    <ContextReadinessBar />

    <ChatMessageArea
      v-if="char"
      ref="messageAreaRef"
      :character="char"
      :latest-status="latestStatus"
      :show-status-hud="showStatusHud"
      :bg-style="chatBgStyle"
      :bg-overlay-style="chatBgOverlayStyle"
      @action="handleMessageAction"
      @longpress="handleMessageLongPress"
      @use-example="handleUseExample"
    />

    <ChatComposer
      ref="composerRef"
      :inert="props.inert"
      @send="handleSend"
      @stop="handleStop"
    />

    <!-- 长按消息唤起的动作条（触屏没有 hover，这是那排小按钮的替代入口；内部 Teleport 到 body） -->
    <MessageActionSheet
      :open="actionSheetMsgId !== null"
      :actions="sheetActions"
      @action="handleSheetAction"
      @close="closeActionSheet"
    />

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

    <!-- P1-3：消息编辑 Modal（替代原生 prompt） -->
    <Modal
      v-model="deleteConfirmModalOpen"
      :title="t('bubble.deleteConfirmTitle')"
      described-by="msg-delete-desc"
    >
      <p id="msg-delete-desc" class="delete-confirm-body">{{ t('bubble.deleteConfirmBody') }}</p>
      <template #footer>
        <button type="button" class="modal-btn modal-cancel" @click="deleteConfirmModalOpen = false">
          {{ t('common.cancel') }}
        </button>
        <button type="button" class="modal-btn modal-confirm danger" @click="confirmDeleteMessage">
          {{ t('common.delete') }}
        </button>
      </template>
    </Modal>
    <Modal v-model="editModalOpen" :title="t('chat.editMessage')">
      <div class="edit-message-body">
        <textarea
          v-model="editDraft"
          class="edit-message-input"
          rows="6"
          :aria-label="t('chat.editMessage')"
          spellcheck="false"
        ></textarea>
        <p class="edit-message-hint">{{ t('chat.editNarrationHint') }}</p>
        <p class="edit-preview-label">{{ t('chat.editPreviewLabel') }}</p>
        <div class="edit-message-preview">
          <template v-for="(seg, i) in editSegments" :key="i">
            <p v-if="seg.kind === 'psy'" class="edit-preview-psy">{{ seg.text }}</p>
            <p v-else class="edit-preview-say">{{ seg.text }}</p>
          </template>
        </div>
      </div>
      <template #footer>
        <button type="button" class="modal-btn modal-cancel" @click="editModalOpen = false">
          {{ t('common.cancel') }}
        </button>
        <button type="button" class="modal-btn modal-save" @click="confirmEditMessage">
          {{ t('common.save') }}
        </button>
      </template>
    </Modal>
  </main>
</template>

<style scoped>
/* P1-3：消息编辑 Modal 样式 */
.edit-message-body {
  width: 100%;
  min-width: 0;
}

.edit-message-input {
  width: 100%;
  padding: 10px 12px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--foreground);
  background: var(--video-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  outline: none;
  resize: vertical;
  font-family: var(--font-sans);
  box-sizing: border-box;
}

.edit-message-input:focus-visible {
  border-color: var(--secondary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--secondary) 20%, transparent);
}

/* 编辑弹窗里的标记说明 + 分段预览（与气泡同一套分段函数，样式也同一套口径） */
.edit-message-hint,
.edit-preview-label {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--muted-foreground);
}

.edit-preview-label {
  margin-top: 12px;
}

.edit-message-preview {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--video-bg);
}

.edit-preview-psy {
  margin: 0;
  padding-left: 8px;
  border-left: 2px solid color-mix(in srgb, var(--secondary) 45%, var(--border));
  font-size: 13px;
  font-style: italic;
  line-height: 1.7;
  color: var(--muted-foreground);
}

.edit-preview-say {
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
  color: var(--foreground);
}

.modal-cancel,
.modal-save {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 14px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  font-size: 13px;
  cursor: pointer;
}

.modal-cancel {
  background: var(--card-elevated);
  color: var(--foreground);
}

.modal-save {
  background: var(--primary);
  border-color: var(--primary);
  color: var(--on-primary);
}

/* F08.2 气泡样式覆盖（通过 CSS 变量控制圆角和透明度） */
:deep(.msg-bubble) {
  border-radius: var(--bubble-radius, var(--radius-md));
  opacity: var(--bubble-opacity, 1);
}

@media (max-width: 640px) {
  /* iOS 聚焦防放大：可编辑控件字号须 ≥16px（I-7 / D1） */
  .edit-message-input {
    font-size: 16px;
  }
}
</style>
