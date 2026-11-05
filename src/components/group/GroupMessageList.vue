<script setup lang="ts">
/**
 * GroupMessageList — 群聊消息区（R1-1 从 GroupChatView 拆出）
 *
 * 只做两件事：把消息渲染出来，把这个盒子怎么滚管好。
 *
 * 为什么滚动策略跟着这个组件走：D-5（启动自动选中群组不落底）与 UX-03（触顶扩页后
 * scrollTop 补偿）都是"容器自身的行为"，父级再持有一份 ref 去操作它，等于让两处
 * 各记一份 scrollTop 基准，A7 那轮就是在这种分叉上踩的坑。父级只给数据、只接
 * 「要更早的回合」这一个意图。
 *
 * 数据全部 props in：消息窗口、成员表、是否还有更早回合。本组件不读 store。
 */
import { nextTick, ref, watch } from 'vue';
import { t } from '@/i18n';
import { parseNarrationSegments } from '@/core/narration';
import Avatar from '@/components/common/Avatar.vue';
import ThinkingBlock from '@/components/chat/ThinkingBlock.vue';
import type { GroupChatMessage, GroupMember } from '@/core/group-chat';
import type { UICharacter } from '@/types';

const props = defineProps<{
  /** 当前可见窗口内的消息（父级给 groupStore.visibleMessages） */
  messages: GroupChatMessage[];
  /** 当前群成员，用于按 characterId 取头像 */
  members: GroupMember[];
  /** 当前群 id：变化即"换会话"，需要显式落底 */
  groupId: string | null;
  /** 窗口外是否还有更早回合 */
  hasOlder: boolean;
  /** 窗口外更早的条数（按钮文案用） */
  hiddenOlderCount: number;
}>();

const emit = defineEmits<{
  /** 用户请求加载更早的回合（写操作由父级执行，本组件只负责滚动补偿） */
  'load-earlier': [];
}>();

// ── D-5（REAL_DEVICE_TEST_2026-10-03）：显式落底 ──
// 原实现 watch(messages.length) + messagesEndRef.scrollIntoView：
// 应用启动自动选中群组时（length 无 0→X 变化或 ref 未绑定）根本不触发，且 smooth
// 动画起步的低 scrollTop 会被触顶扩页误判（D-5 实测 scrollTop=0 停在列表顶部）。
// 改为：监听 groupId（手动选择/自动选中/首载统一入口），双 nextTick + rAF
// 等布局与字体就绪后，直接把滚动容器置底；并用时间窗屏蔽随后的程序滚动事件。
const messagesAreaRef = ref<HTMLElement | null>(null);
const loadingOlderTurns = ref(false);
let lastScrollTop = 0;
let suppressScrollUntil = 0;

function scrollToBottom(): void {
  const el = messagesAreaRef.value;
  if (!el) return;
  el.scrollTop = el.scrollHeight;
  lastScrollTop = el.scrollTop;
  suppressScrollUntil = Date.now() + 250;
}

async function scrollToBottomSoon(): Promise<void> {
  await nextTick();
  await nextTick();
  await new Promise((r) => requestAnimationFrame(r));
  scrollToBottom();
}

watch(
  () => props.groupId,
  () => {
    void scrollToBottomSoon();
  },
  { immediate: true }
);

// 监听消息列表变化，新消息到达时若已近底部则跟随滚底（保持既有行为）
watch(
  () => props.messages.length,
  () => {
    const el = messagesAreaRef.value;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom) void scrollToBottomSoon();
  }
);

// ── UX-03：游标分页 —— 顶部触顶 / 手动按钮加载更早消息，scrollTop 补偿保持阅读位置 ──
// D-5：程序补偿滚动会派发真实 scroll 事件（异步、晚于 loadingOlderTurns 复位），
// 且平滑滚底起步阶段 scrollTop 极低——两类都不应被误判为"用户上滚到顶"。
// 用"上一次 scrollTop 方向判定 + 补偿后时间窗"双重过滤。
async function loadEarlier(): Promise<void> {
  if (loadingOlderTurns.value || !props.hasOlder) return;
  loadingOlderTurns.value = true;
  try {
    const beforeHeight = messagesAreaRef.value?.scrollHeight ?? 0;
    // 父级同步扩窗；nextTick 后消息已在 DOM 里，按新增高度补偿 scrollTop
    emit('load-earlier');
    await nextTick();
    const el = messagesAreaRef.value;
    if (el) {
      el.scrollTop += el.scrollHeight - beforeHeight;
      lastScrollTop = el.scrollTop;
    }
    // 补偿赋值派发的 scroll 事件异步到达——时间窗内一律视为程序滚动
    suppressScrollUntil = Date.now() + 250;
  } finally {
    loadingOlderTurns.value = false;
  }
}

function onMessagesScroll(): void {
  const el = messagesAreaRef.value;
  if (!el) return;
  // D-5：程序滚动时间窗内的 scroll 事件直接忽略（只更新方向基准）
  if (suppressScrollUntil > 0) {
    if (Date.now() < suppressScrollUntil) {
      lastScrollTop = el.scrollTop;
      return;
    }
    suppressScrollUntil = 0;
  }
  const goingUp = el.scrollTop < lastScrollTop;
  lastScrollTop = el.scrollTop;
  // 只有"用户上滚"才扩页——打开会话时的程序落底/平滑动画不再被误判
  if (goingUp && el.scrollTop <= 80) void loadEarlier();
}

// ── 渲染辅助 ──
function memberInitial(name: string): string {
  return name.charAt(0) || '?';
}

/** 群聊与单聊共用同一套分段解析，避免两处各写一份、行为慢慢分叉 */
function segmentsOf(content: string) {
  const parsed = parseNarrationSegments(content);
  return parsed.some((s) => s.kind === 'speech')
    ? parsed
    : [{ kind: 'speech' as const, text: content }];
}

function messageTime(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function isUser(msg: { role: string }): boolean {
  return msg.role === 'user';
}

function isSystem(msg: { role: string }): boolean {
  return msg.role === 'system';
}
</script>

<template>
  <section
    ref="messagesAreaRef"
    class="messages-area tk-scroll"
    role="log"
    aria-live="polite"
    :aria-label="t('group.messagesAria')"
    @scroll="onMessagesScroll"
  >
    <!-- UX-03：游标分页 —— 窗口外更早的消息按页加载 -->
    <div v-if="hasOlder" class="load-earlier-row">
      <button
        type="button"
        class="load-earlier-btn"
        :disabled="loadingOlderTurns"
        @click="loadEarlier"
      >
        {{ t('group.loadEarlier', { count: hiddenOlderCount }) }}
      </button>
    </div>
    <div
      v-for="msg in messages"
      :key="msg.id"
      class="msg-row"
      :class="{
        'msg-user': isUser(msg),
        'msg-assistant': msg.role === 'assistant',
        'msg-system': isSystem(msg),
      }"
    >
      <template v-if="isSystem(msg)">
        <div class="msg-system-content">
          {{ msg.content }}
        </div>
      </template>
      <template v-else>
        <Avatar
          v-if="msg.role === 'assistant'"
          :character="{
            id: msg.characterId ?? '',
            name: msg.characterName ?? '',
            avatar: members.find((m) => m.characterId === msg.characterId)?.avatar,
            avatarType: 'gradient',
            initial: memberInitial(msg.characterName ?? ''),
          } as UICharacter"
          :size="32"
        />
        <!-- 一条回复可能拆成「对白 — 心理 — 对白」：心理段要落在气泡外面，
             所以气泡从"整条消息的外壳"降级为"每段对白一个气泡"，
             外壳换成 .msg-body（纵向），发言人名/思考/时间挂在外壳上。 -->
        <div class="msg-body">
          <div v-if="msg.role === 'assistant'" class="msg-sender">
            {{ msg.characterName }}
          </div>
          <ThinkingBlock
            v-if="msg.role === 'assistant'"
            :thinking="msg.thinking"
            :message-id="msg.id"
          />
          <template v-for="(seg, si) in segmentsOf(msg.content)" :key="si">
            <div v-if="seg.kind === 'speech'" class="msg-bubble">
              <div class="msg-content">{{ seg.text }}</div>
            </div>
            <p v-else class="msg-psy">{{ seg.text }}</p>
          </template>
          <div class="msg-time">{{ messageTime(msg.timestamp) }}</div>
        </div>
      </template>
    </div>
    <div aria-hidden="true" />
  </section>
</template>

<style scoped>
.messages-area {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
  background: var(--background);
}

/* UX-03：加载更早消息 */
.load-earlier-row {
  display: flex;
  justify-content: center;
  margin-bottom: 14px;
}

.load-earlier-btn {
  padding: 6px 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-full, 999px);
  background: transparent;
  color: var(--muted-foreground);
  font-size: 12px;
  cursor: pointer;
}

@media (hover: hover) and (pointer: fine) {
  .load-earlier-btn:hover {
    color: var(--foreground);
    border-color: var(--secondary);
  }
}

.load-earlier-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.msg-row {
  display: flex;
  gap: 10px;
  margin-bottom: 14px;
}

.msg-user {
  flex-direction: row-reverse;
}

/* 一条消息的外壳：发言人名、思维链、若干气泡与心理段、时间，纵向排 */
.msg-body {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  min-width: 0;
  max-width: 70%;
}

.msg-user .msg-body {
  align-items: flex-end;
}

.msg-user .msg-bubble {
  background: var(--primary);
  color: var(--on-primary);
  margin-left: auto;
}

.msg-assistant .msg-bubble {
  background: var(--card);
}

.msg-system {
  justify-content: center;
}

.msg-system-content {
  font-size: 11px;
  color: var(--muted-foreground);
  padding: 4px 10px;
  background: var(--card);
  border-radius: var(--radius-md);
  font-style: italic;
}

.msg-bubble {
  /* 宽度上限移到 .msg-body 上，气泡自己只吃满外壳（否则多个气泡各按 70% 算会叠出两层留白） */
  max-width: 100%;
  padding: 8px 12px;
  border-radius: var(--radius-md);
  font-size: 14px;
  word-wrap: break-word;
}

/* 心理段：与单聊同一套规格（无底色、左竖线、字号与颜色各降一档） */
.msg-psy {
  margin: 0;
  padding-left: 10px;
  border-left: 2px solid color-mix(in srgb, var(--secondary) 45%, var(--border));
  font-size: var(--font-size-sm);
  line-height: 1.7;
  color: var(--muted-foreground);
  white-space: pre-wrap;
  word-wrap: break-word;
}

.msg-sender {
  font-size: 11px;
  color: var(--secondary-text);
  margin-bottom: 2px;
  font-weight: 500;
}

.msg-content {
  white-space: pre-wrap;
}

.msg-time {
  font-size: 10px;
  color: var(--muted-foreground);
  margin-top: 4px;
  text-align: right;
}

.msg-user .msg-time {
  color: rgba(255, 255, 255, 0.7);
}
</style>
