<script setup lang="ts">
/**
 * 单聊 ⇄ 群聊 的分段切换
 *
 * 为什么不是"再加一个入口"：rail 的 15 项与"不滚动就够得着"、底栏的 6 个 tab 都被
 * 既有契约钉住，而群聊刻意不占底栏 tab（它和单聊是同一任务的两条通道，做成 tab
 * 会形成单向门，见 `core/mobile-nav.ts` 对 group 的注释）。真正缺的是"我在这两条
 * 通道之间，可以一步换过去"——所以它长在两处页头里，而不是第三处导航上。
 *
 * 键盘用 tablist + **手动激活**，不用 radiogroup：radiogroup 的惯例是"焦点走到哪
 * 就选到哪"，而这里的"选"是一次跨路由跳转——按一次方向键就把人送进另一个页面，
 * 焦点还会随旧组件卸载一起丢掉。
 *
 * 不写 aria-controls：/chat 有角色时主内容区没有稳定的 id（冷启动分支才有
 * `#main-content`），指向不存在的 id 反而是无障碍违规。
 */
import { computed, nextTick, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { t } from '@/i18n';
import Icon from '@/components/common/Icon.vue';
import { NAV_ENTRIES, type NavEntry } from '@/core/nav-model';

const entries: NavEntry[] = NAV_ENTRIES.filter((entry) => entry.id === 'chat' || entry.id === 'group');

const route = useRoute();
const router = useRouter();

/** 群聊页 = group，其余（含 /chat）都算单聊侧 */
const currentId = computed(() => (route.name === 'group' ? 'group' : 'chat'));
const focusId = ref<string | null>(null);

function tabId(id: string): string {
  return `chat-mode-tab-${id}`;
}

function tabindexFor(id: string): number {
  return (focusId.value ?? currentId.value) === id ? 0 : -1;
}

function go(entry: NavEntry): void {
  if (currentId.value === entry.id) return;
  void router.push({ name: entry.routeName });
}

function onKeydown(event: KeyboardEvent, index: number): void {
  const total = entries.length;
  let next: number | null = null;
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % total;
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + total) % total;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = total - 1;
  if (next === null) return;
  event.preventDefault();
  const target = entries[next];
  if (!target) return;
  focusId.value = target.id;
  void nextTick(() => document.getElementById(tabId(target.id))?.focus());
}

function onBlur(): void {
  // 焦点离开这组后，Tab 再次进入时应回到"当前所在的那条通道"
  focusId.value = null;
}
</script>

<template>
  <div class="chat-mode-switch" role="tablist" :aria-label="t('chat.modeSwitchAria')">
    <button
      v-for="(entry, index) in entries"
      :id="tabId(entry.id)"
      :key="entry.id"
      type="button"
      role="tab"
      class="chat-mode-tab"
      :class="{ active: currentId === entry.id }"
      :aria-selected="currentId === entry.id"
      :tabindex="tabindexFor(entry.id)"
      :data-rel-jump="`mode-${entry.id}`"
      @click="go(entry)"
      @keydown="onKeydown($event, index)"
      @blur="onBlur"
    >
      <Icon :name="entry.icon" :size="14" aria-hidden="true" />
      <span class="chat-mode-label">{{ t(entry.labelKey) }}</span>
    </button>
  </div>
</template>

<style scoped>
.chat-mode-switch {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--border);
  border-radius: var(--radius-pill, 999px);
  background: var(--card-elevated, var(--card));
}

.chat-mode-tab {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 28px;
  padding: 2px 10px;
  border: none;
  border-radius: var(--radius-pill, 999px);
  background: transparent;
  color: var(--muted-foreground);
  font-size: 12px;
  cursor: pointer;
}

.chat-mode-label {
  /* 页头挤的时候宁可整组换行，也不能把"对话"竖排成两行 */
  white-space: nowrap;
}

.chat-mode-tab.active {
  background: color-mix(in srgb, var(--primary) 16%, transparent);
  color: var(--foreground);
  font-weight: 600;
}

@media (hover: hover) and (pointer: fine) {
  .chat-mode-tab:not(.active):hover {
    color: var(--foreground);
  }
}

.chat-mode-tab:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 2px;
}

@media (max-width: 640px) {
  .chat-mode-tab {
    min-height: 36px;
    padding: 4px 12px;
    font-size: 13px;
  }
}
</style>
