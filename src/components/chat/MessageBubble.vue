<script setup lang="ts">
import type { UIMessage } from '@/types';
import Icon from '@/components/common/Icon.vue';
import type { IconName } from '@/components/common/icons';
import ThinkingBlock from './ThinkingBlock.vue';
import StatusHud from './StatusHud.vue';
import PromptTraceSummary from './PromptTraceSummary.vue';
import EventTraceSummary from './EventTraceSummary.vue';
import { useSettingsStore } from '@/stores/settings';
import { computed, getCurrentInstance } from 'vue';
import { t } from '@/i18n';

defineProps<{
  msg: UIMessage;
}>();

/**
 * P0-1：思考块默认折叠与否来自全局偏好
 * （settings.thinkingConfig.defaultCollapsed，缺省 true = 折叠）
 *
 * 兼容"未安装 Pinia"的挂载场景（部分单测直接 mount 组件）：
 * 直接调 useSettingsStore() 会抛 getActivePinia()，故先探测应用是否装了 Pinia
 * （app.config.globalProperties.$pinia 由 app.use(pinia) 注入），
 * 未安装则回落到"默认折叠"常量——这样既能读到偏好，又不会污染渲染路径。
 */
function tryUseSettingsStore(): ReturnType<typeof useSettingsStore> | null {
  const vm = getCurrentInstance();
  const piniaInstalled = Boolean(vm?.appContext.config.globalProperties.$pinia);
  return piniaInstalled ? useSettingsStore() : null;
}

const settingsStore = tryUseSettingsStore();

const defaultCollapsed = computed(
  () => settingsStore?.thinkingConfig?.defaultCollapsed !== false
);

/**
 * P1：消息级状态条开关（默认开）
 *
 * 与顶部 sticky 条是两个独立开关：sticky 说"当前状态"，inline 说"这一轮的状态"。
 * 未安装 Pinia 的挂载场景（单测直接 mount）下 settingsStore 为 null → 默认开，
 * 但 msg.status 缺省时不渲染，故不会凭空冒出空条。
 */
const showInlineStatus = computed(
  () => settingsStore?.statusHudConfig?.showInline !== false
);

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
  { key: 'edit', icon: 'pencil', label: t('bubble.edit') },
  { key: 'copy', icon: 'copy', label: t('bubble.copy') },
  { key: 'speak', icon: 'volume-2', label: t('bubble.speak') },
  { key: 'translate', icon: 'globe', label: t('bubble.translate') },
  { key: 'regenerate', icon: 'refresh-cw', label: t('bubble.regenerate') },
  // 注：原「分支」操作为未实现占位（点击弹出"演示"），已移除入口
  { key: 'delete', icon: 'trash-2', label: t('bubble.delete'), danger: true },
];
</script>

<template>
  <div
    class="msg-wrap msg-enter"
    :class="msg.role === 'user' ? 'msg-wrap-user' : 'msg-wrap-assistant'"
    role="article"
    :aria-label="msg.role === 'user' ? t('bubble.userMsg') : t('bubble.assistantMsg')"
  >
    <!-- 用户消息 -->
    <div v-if="msg.role === 'user'" class="msg-bubble msg-user">
      <em v-if="msg.narration" class="msg-narration">{{ msg.narration }}</em>
      <p class="msg-text">{{ msg.content }}</p>
    </div>

    <!-- AI 消息 -->
    <div v-else class="msg-bubble msg-assistant">
      <!-- P0-1：思维链折叠块（正文之上；空白思考不渲染） -->
      <ThinkingBlock
        :thinking="msg.thinking"
        :message-id="msg.id"
        :generating="msg.generating === true"
        :default-collapsed="defaultCollapsed"
        :reasoning-tokens="msg.reasoningTokens"
      />
      <em v-if="msg.narration" class="msg-narration">{{ msg.narration }}</em>
      <p class="msg-text" :style="msg.narration ? 'margin-top: 6px' : ''">{{ msg.content }}</p>
      <em v-if="msg.narrationAfter" class="msg-narration-after">{{ msg.narrationAfter }}</em>

      <!-- P1：消息级状态（本轮结束时的状态；仅在 msg.status 存在时渲染）
           小屏折叠开启：消息列表里每轮都可能出现一条，不折叠会把列表撑爆 -->
      <StatusHud
        v-if="showInlineStatus"
        variant="inline"
        collapsible-on-mobile
        :status="msg.status"
      />

      <!-- 生成中指示器：aria-live 让屏幕阅读器感知状态变化 -->
      <div
        v-if="msg.generating"
        class="gen-dot"
        role="status"
        aria-live="polite"
        :aria-label="t('bubble.generating')"
      >
        <span class="dot" aria-hidden="true" />
        <span class="gen-text">{{ t('bubble.generatingText') }}</span>
      </div>

      <!-- 消息操作栏（hover 或聚焦时显示，保证键盘可达） -->
      <div class="msg-toolbar" role="toolbar" :aria-label="t('bubble.toolbarAria', { actions: assistantActions.map((a) => a.label).join('、') })">
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

      <!-- L 层：本轮注入了哪几条设定（可跳回来源世界书）；无注入痕迹时不渲染 -->
      <PromptTraceSummary :items="msg.promptTrace" />
      <!-- E11：本轮带入了哪几条随机事件（可跳随机事件页）；无事件时不渲染 -->
      <EventTraceSummary :items="msg.eventTrace" />
    </div>
  </div>
</template>

<style scoped>
.msg-wrap-user {
  align-self: flex-end;
  margin-top: var(--spacing-sm);
}

.msg-wrap-assistant {
  align-self: flex-start;
}

.msg-bubble {
  max-width: min(70%, 40em);
  width: fit-content;
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4);
  font-size: var(--font-size-md);
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
  gap: var(--space-1-5);
  margin-top: var(--space-2-5);
}

.gen-dot .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--secondary);
  animation: pulse-dot 1.2s ease-in-out infinite;
}

.gen-text {
  color: var(--secondary-text);
  font-size: var(--font-size-xs);
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

/* I-5（P2-5）：hover 分支按设备能力分流，避免触屏 tap 后操作栏粘滞 */
@media (hover: hover) and (pointer: fine) {
  .msg-wrap:hover .msg-toolbar {
    opacity: 1;
  }
}

/* 键盘聚焦分支不加 hover 守卫：触屏外接键盘时同样需要可见 */
.msg-wrap:focus-within .msg-toolbar {
  opacity: 1;
}

/* 触屏设备无 hover：操作栏常显，保证编辑/复制等操作可达（WCAG + 移动端体验） */
@media (hover: none) {
  .msg-toolbar {
    opacity: 1;
  }
}

/* D-2（REAL_DEVICE_TEST_2026-10-03）：助手气泡左对齐，操作条原右锚定会让
   窄气泡的操作条左溢出对话列边界、被角色列表列盖住无法点击（1280×720 实测）。
   助手消息的操作条锚左侧、向右展开——右侧是对话列开阔区，不会被遮挡。 */
.msg-wrap-assistant .msg-toolbar {
  left: 6px;
  right: auto;
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

@media (hover: hover) and (pointer: fine) {
  .msg-toolbar-btn:hover {
    color: var(--foreground);
  }
}

.msg-toolbar-btn:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 1px;
}

@media (hover: hover) and (pointer: fine) {
  .msg-toolbar-btn.danger:hover {
    color: var(--primary-fg);
  }
}
</style>
