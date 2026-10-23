<script setup lang="ts">
/**
 * ChatHeader — 单聊页头 + 全文搜索条（R1-5 从 ChatMain 拆出）
 *
 * 两个根平铺进 `.chat-main` 的 flex 列容器：页头在上，搜索条展开时接在它下面。
 * 合成一个组件而不是两个，因为搜索状态必须同处一份——页头的 search 按钮要读
 * `aria-expanded`，搜索条要写 query/结果/游标，拆开就得再引一层"状态上提"，
 * 而这两个 UI 是同一个功能的两半。
 *
 * 搜索只在完整消息数组上算（`searchMessages`），不参与虚拟化窗口，长对话不漏查。
 * "跳到命中消息"要动滚动容器的窗口边界，所以只 emit 意图，由宿主转给消息区。
 */
import { computed, nextTick, ref, watch } from 'vue';
import { t } from '@/i18n';
import Icon from '@/components/common/Icon.vue';
import Avatar from '@/components/common/Avatar.vue';
import ChatModeSwitch from '@/components/chat/ChatModeSwitch.vue';
import { useCharacterStore } from '@/stores/character';
import { useChatStore } from '@/stores/chat';
import { useSettingsStore } from '@/stores/settings';
import { useStoryStore } from '@/stores/story';
import { useReadinessJump } from '@/composables/useReadinessJump';
import { useViewport } from '@/core/viewport';
import { searchMessages, type MessageSearchResult } from '@core/message-search';
import type { UICharacter } from '@/types';

const props = defineProps<{
  /** 当前会话角色（标题、模式切换与故事时间都取它） */
  character: UICharacter;
}>();

const emit = defineEmits<{
  /** 导出当前对话（落盘与落点回显由宿主负责） */
  export: [];
  /** 跳到某条搜索结果：动窗口边界是消息区的职责，这里只表达意图 */
  jump: [result: MessageSearchResult];
}>();

const characterStore = useCharacterStore();const chatStore = useChatStore();
const settings = useSettingsStore();
// F16.4 故事时间（用于顶栏显示）
const storyStore = useStoryStore();
// isCompact：I-1 的 aria-expanded 随视口反映正确的面板状态
// （桌面 panelExpanded / 移动平板 contextDrawerOpen）
// isMobile：批次 2-4 起用于"手机档不挂页头分段控件"（群聊已是底栏 Tab）
const { isCompact, isMobile } = useViewport();

// ── 0.5.0 全文搜索 ──
const searchOpen = ref(false);
const searchInput = ref<HTMLInputElement | null>(null);
const searchQuery = ref('');
const activeSearchIndex = ref(-1);
const searchResults = computed(() =>
  searchMessages(props.character?.messages ?? [], searchQuery.value),
);
const activeSearchResult = computed<MessageSearchResult | null>(() => {
  const index = activeSearchIndex.value;
  return index >= 0 ? searchResults.value[index] ?? null : null;
});

function toggleSearch(): void {
  searchOpen.value = !searchOpen.value;
  if (searchOpen.value) {
    void nextTick(() => searchInput.value?.focus());
  } else {
    closeSearch();
  }
}

function closeSearch(): void {
  searchOpen.value = false;
  searchQuery.value = '';
  activeSearchIndex.value = -1;
}

function handleSearchKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeSearch();
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    navigateSearch(event.shiftKey ? -1 : 1);
  }
}

/** 按搜索结果循环前进或后退，并把"跳转"的意图交给宿主 */
function navigateSearch(direction: 1 | -1): void {
  const results = searchResults.value;
  if (results.length === 0) return;
  const current = activeSearchIndex.value;
  const next = current < 0
    ? direction > 0 ? 0 : results.length - 1
    : (current + direction + results.length) % results.length;
  activeSearchIndex.value = next;
  const result = results[next];
  if (result) emit('jump', result);
}

watch(searchQuery, () => {
  activeSearchIndex.value = -1;
});

watch(searchResults, (results) => {
  if (results.length === 0) {
    activeSearchIndex.value = -1;
  } else if (activeSearchIndex.value >= results.length) {
    activeSearchIndex.value = results.length - 1;
  }
});

/** 换会话时收起搜索（原来的宿主 watch 拆到这里，窗口重置那边不再管搜索） */
watch(
  () => props.character.id,
  () => closeSearch(),
);

// F16.4 故事时间显示（角色关联故事时显示）
const storyTimeText = computed(() => {
  const storyId = props.character.storyId;
  if (!storyId) return '';
  return storyStore.getFormattedStoryTime(storyId);
});

// E15：故事时间原来只是"显示"，从这里跳不到故事本体。带 ?story= 过去，
// 故事引擎会据此选中那一条；回程由 App 的全局"返回来源页"承接（from 自动写入）。
const { pushWithReturn } = useReadinessJump();
function goToStory(): void {
  const storyId = props.character.storyId;
  if (!storyId) return;
  pushWithReturn({ name: 'story', query: { story: storyId } });
}

defineExpose({ closeSearch });
</script>

<template>
  <!-- 顶栏 -->
  <header class="chat-header">
    <button
      type="button"
      class="mobile-menu-btn client-compact-only"
      :aria-label="t('chat.openCharList')"
      @click="characterStore.toggleCharacterList()"
    >
      <Icon name="menu" :size="20" />
    </button>

    <div class="chat-title">
      <Avatar :character="character" :size="24" />
      <span class="chat-name truncate">{{ character.name }}</span>
      <span class="model-badge" :class="{ 'not-configured': !settings.activeProfile }">{{ settings.activeProfile?.model ?? t('chat.modelNotConfigured') }}</span>
    </div>

    <!--
      单聊 ⇄ 群聊：两条通道是同一次对话的两种形态，切换要在这里看得见。
      **手机档不挂**（批次 2-4）：A12 把群聊升成底部 Tab 之后，这条切换在手机上
      就是"底栏那个「群聊」Tab"，而它自己占 146px——390 宽下把角色名压到 28px
      （整行只剩 62px）。桌面没有底栏，切换仍然需要，所以按端分流。
    -->
    <ChatModeSwitch v-if="!isMobile" class="chat-mode-switch-slot" />

    <!--
      原来整块 aria-hidden="true"：读屏完全拿不到 token 用量与缓存命中率。
      去掉后，两个指标 span 补 tabindex="0"，键盘 Tab 到就能听到 v-tip 的描述
      （不可聚焦的元素挂 aria-describedby 等于没挂）。
    -->
    <div class="chat-token">
      {{ t('chat.tokenUsed', { count: (chatStore.totalTokenUsage / 1000).toFixed(1) }) }}
      <span
        v-if="chatStore.prefixCacheHitRate !== null"
        class="cache-rate"
        tabindex="0"
        v-tip="t('chat.cacheHitTitle', { hit: chatStore.cacheUsage.hitTokens, miss: chatStore.cacheUsage.missTokens, reported: chatStore.cacheUsage.reported })"
      >
        · {{ t('chat.cacheHit', { percent: (chatStore.prefixCacheHitRate * 100).toFixed(0) }) }}
      </span>
      <span
        v-else-if="chatStore.prefixStableRate !== null"
        class="cache-rate local"
        tabindex="0"
        v-tip="t('chat.prefixStableTitle', { stable: chatStore.prefixStability.stable, total: chatStore.prefixStability.total, last: chatStore.ttftStats.lastMs, avg: chatStore.ttftStats.avgMs })"
      >
        · {{ t('chat.prefixStable', { percent: (chatStore.prefixStableRate * 100).toFixed(0) }) }}
      </span>
    </div>

    <!-- F16.4 故事时间显示（仅当角色关联故事时显示）；E15：整块可点，一跳回到故事本体 -->
    <button
      v-if="storyTimeText"
      type="button"
      class="chat-story-time"
      v-tip="t('chat.storyTimeTitle')"
      @click="goToStory"
    >
      <Icon name="calendar-check" :size="14" aria-hidden="true" />
      <span>{{ storyTimeText }}</span>
    </button>

    <div class="chat-actions">
      <button
        type="button"
        class="hover-surface panel-toggle-btn"
        :aria-label="t('chat.searchMessages')"
        v-tip="t('chat.searchMessagesTitle')"
        :aria-expanded="searchOpen"
        @click="toggleSearch"
      >
        <Icon name="search" :size="20" />
      </button>
      <button
        type="button"
        class="hover-surface panel-toggle-btn"
        :aria-label="t('chat.exportChat')"
        v-tip="t('chat.exportChatTitle')"
        @click="emit('export')"
      >
        <Icon name="download" :size="20" />
      </button>
      <button
        type="button"
        class="hover-surface panel-toggle-btn"
        :aria-label="t('chat.togglePanel')"
        :aria-expanded="isCompact ? characterStore.contextDrawerOpen : characterStore.panelExpanded"
        @click="characterStore.togglePanel()"
      >
        <Icon name="panel-right" :size="20" />
      </button>
    </div>
  </header>

  <!-- 0.5.0：全文搜索栏在顶栏下方展开，结果跨越完整历史消息。 -->
  <div v-if="searchOpen" class="chat-search-bar" role="search">
    <Icon name="search" :size="16" aria-hidden="true" />
    <label class="sr-only" for="chat-history-search">{{ t('chat.searchMessages') }}</label>
    <input
      id="chat-history-search"
      ref="searchInput"
      v-model="searchQuery"
      class="chat-search-input"
      type="search"
      :placeholder="t('chat.searchPlaceholder')"
      :aria-label="t('chat.searchMessages')"
      :aria-describedby="searchResults.length > 0 ? 'chat-search-status' : undefined"
      @keydown="handleSearchKeydown"
    />
    <span id="chat-search-status" class="chat-search-status" role="status" aria-live="polite">
      <template v-if="searchQuery && searchResults.length > 0">
        {{ t('chat.searchCount', { current: activeSearchIndex >= 0 ? activeSearchIndex + 1 : 0, total: searchResults.length }) }}
      </template>
      <template v-else-if="searchQuery">
        {{ t('chat.searchNoResults') }}
      </template>
    </span>
    <span v-if="activeSearchResult" class="chat-search-snippet" v-tip="activeSearchResult.snippet">
      {{ activeSearchResult.snippet }}
    </span>
    <button
      type="button"
      class="chat-search-btn"
      :aria-label="t('chat.searchPrevious')"
      v-tip="t('chat.searchPrevious')"
      :disabled="searchResults.length === 0"
      @click="navigateSearch(-1)"
    >
      <Icon name="chevron-up" :size="16" />
    </button>
    <button
      type="button"
      class="chat-search-btn"
      :aria-label="t('chat.searchNext')"
      v-tip="t('chat.searchNext')"
      :disabled="searchResults.length === 0"
      @click="navigateSearch(1)"
    >
      <Icon name="chevron-down" :size="16" />
    </button>
    <button
      type="button"
      class="chat-search-btn"
      :aria-label="t('chat.closeSearch')"
      v-tip="t('chat.closeSearch')"
      @click="closeSearch"
    >
      <Icon name="close" :size="16" />
    </button>
  </div>
</template>

<style scoped>
.mobile-menu-btn {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  background: none;
  border: none;
  color: var(--muted-foreground);
  cursor: pointer;
  align-items: center;
  justify-content: center;
}

.chat-name {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: var(--font-size-lg);
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
  color: var(--secondary-text);
  font-size: var(--font-size-2xs);
  font-weight: 500;
  white-space: nowrap;
  flex-shrink: 0;
}

.model-badge.not-configured {
  background: color-mix(in srgb, var(--destructive) 12%, transparent);
  color: color-mix(in srgb, var(--destructive) 78%, var(--foreground));
}

/* 前缀缓存命中率徽标 */
.cache-rate {
  font-size: var(--font-size-2xs);
  color: var(--green, #9ece6a);
  cursor: help;
}

/* 本地前缀稳定率徽标（供应商未返回缓存字段时的代理指标） */
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

/* F16.4 故事时间显示 */
.chat-story-time {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border: none;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--accent-blue) 12%, transparent);
  color: var(--accent-blue-text);
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
}

/* 0.5.0：历史消息全文搜索工具条 */
.chat-search-bar {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  min-height: 44px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--card);
  color: var(--muted-foreground);
}

.chat-search-input {
  flex: 1 1 180px;
  min-width: 0;
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--video-bg);
  color: var(--foreground);
  font: inherit;
  font-size: 13px;
}

.chat-search-input:focus-visible {
  border-color: var(--ring);
  outline: 2px solid color-mix(in srgb, var(--ring) 30%, transparent);
  outline-offset: 1px;
}

.chat-search-status {
  flex: 0 0 auto;
  min-width: 56px;
  color: var(--muted-foreground);
  font-size: 12px;
  white-space: nowrap;
}

.chat-search-snippet {
  flex: 0 1 min(32vw, 280px);
  overflow: hidden;
  color: var(--muted-foreground);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-search-btn {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--muted-foreground);
  cursor: pointer;
}

.chat-search-btn:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

@media (hover: hover) and (pointer: fine) {
  .chat-search-btn:hover:not(:disabled) {
    border-color: var(--ring);
    color: var(--foreground);
  }
}

.chat-search-btn:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 1px;
}

@media (max-width: 640px) {
  .chat-search-bar {
    flex-wrap: wrap;
  }

  .chat-search-input {
    flex-basis: 130px;
    font-size: 16px;
  }

  .chat-search-snippet {
    display: none;
  }
}

/*
 * 批次 3-2/3-3：页头命中区。
 *
 * 页头横向空间是零和的：390 宽下「菜单 + 右簇三个动作 + 角色名」必须一起放下，
 * 而 A15 的判据是 `.chat-title` ≥200px（名字不许被挤成两三个字）。
 *
 * 分配：
 * - 右簇三个动作给**真 44×44 盒子**——它们是手指的主战场，且三个都是 44 时才
 *   132px，配合收紧后的留白刚好给标题留出 200+。
 * - 菜单键保持视觉 26、命中区用伪元素撑到 46：它贴着左边缘，命中区可以往
 *   padding 里长，不占标题的宽度。这是 B3 的手法，页头是典型密集行。
 * - 页头留白 8→6、簇内间距归零：让出的 14px 全给标题（实测 198 → 202，
 *   判据是 200，只差 2px 也要挤出来）。
 *
 * 46 而不是 44：探针按 1px 步进，正好 44 时边界像素不属于元素，量出来是 43。
 */
@media (max-width: 640px) {
  .chat-header {
    padding: 0 6px;
    gap: 6px;
  }
  .chat-actions {
    /* 归零而不是 2px：2px 时标题只剩 198，差 2px 过不了 A15 的 ≥200。
       按钮本身 44 宽、图标 20，视觉上仍有 12px 空隙，不挤。 */
    gap: 0;
  }
  .panel-toggle-btn {
    min-width: var(--touch-min);
    min-height: var(--touch-min);
  }
  .mobile-menu-btn {
    position: relative;
  }
  .mobile-menu-btn::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    width: calc(var(--touch-min) + 2px);
    height: calc(var(--touch-min) + 2px);
    transform: translate(-50%, -50%);
  }
}
</style>
