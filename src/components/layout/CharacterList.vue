<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useCharacterStore } from '@/stores/character';
import { useChatStore } from '@/stores/chat';
import type { Chat } from '@/storage/types';
import Icon from '@/components/common/Icon.vue';
import Avatar from '@/components/common/Avatar.vue';
import NewConversationModal from '@/components/chat/NewConversationModal.vue';
import { t } from '@/i18n';
import { showToast } from '@/utils/toast-service';

const characterStore = useCharacterStore();
const chatStore = useChatStore();

// 新建对话弹窗
const newConvModalOpen = ref(false);

function openNewConversation() {
  newConvModalOpen.value = true;
}

// ── 多会话（§14.2）：当前角色的会话列表 ──

/** 当前选中角色 */
const current = computed(() => characterStore.currentCharacter);

/** 当前角色的全部会话（含归档，UI 分组展示） */
const chats = computed<Chat[]>(() => {
  const cid = current.value?.id;
  if (!cid) return [];
  return chatStore.sessions
    .filter((s) => s.characterId === cid)
    .sort((a, b) => Number(b.pinned ?? false) - Number(a.pinned ?? false)
      || b.updatedAt.localeCompare(a.updatedAt));
});

/**
 * 载入会话索引，并把最近一段对话接回聊天区（D-Q）。
 *
 * 此前刷新后缓冲为空：历史只存在 chats store，而装回历史的唯一入口是会话行点击，
 * 用户 F5 之后要再点一次会话才能接着聊。
 */
async function loadSessions(): Promise<void> {
  const ids = characterStore.characters.map((c) => c.id);
  if (ids.length === 0) return;
  await chatStore.loadAllSessions(ids);
  await chatStore.restoreLatestSession(current.value ?? null);
}

/** 建档角色切换时加载其会话索引（session 列表数据源） */
watch(
  () => characterStore.characters.length,
  () => {
    void loadSessions();
  },
  { immediate: true }
);

onMounted(() => {
  void loadSessions();
});

/** 切换会话 */
// O-18（REAL_DEVICE_TEST_2026-10-03）：会话行时间原样输出 ISO 且贴压操作按钮——
// 格式化为本地短格式，模板同步加省略号样式
function formatConvTime(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  const d = new Date(t);
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const sameDay = d.toDateString() === now.toDateString();
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (sameDay) return hm;
  const sameYear = d.getFullYear() === now.getFullYear();
  return sameYear ? `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${hm}` : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function switchChat(chat: Chat) {
  if (!current.value) return;
  void chatStore.openSession(current.value, chat.id);
  characterStore.closeAllDrawers();
}

/** 新建会话：清空当前角色消息缓冲并进入聊天 */
function newChat() {
  if (!current.value) return;
  chatStore.newSession(current.value);
  characterStore.closeAllDrawers();
  // O-14（REAL_DEVICE_TEST_2026-10-03）：懒创建草稿不进列表，原高亮消失——
  // 补 toast 说明，避免看起来"什么都没发生"
  showToast('info', t('charList.newSessionDraft'));
}

function onTogglePin(chat: Chat) {
  void chatStore.togglePin(chat.id);
}

// D-7（REAL_DEVICE_TEST_2026-10-03）：归档原为空操作感知（写入无消费者、无反馈）。
// 修复：按钮文案随状态翻转 + 行内"已归档"标记 + toast 反馈。
function onToggleArchive(chat: Chat) {
  const willArchive = !chat.archived;
  void chatStore.toggleArchive(chat.id).then(() => {
    showToast('info', t(willArchive ? 'charList.archivedToast' : 'charList.unarchivedToast'));
  });
}

// 删除二次确认（避免误删）
const confirmDeleteId = ref<string | null>(null);
function askDelete(chat: Chat) {
  confirmDeleteId.value = chat.id;
}
function cancelDelete() {
  confirmDeleteId.value = null;
}
function confirmDelete(chat: Chat) {
  confirmDeleteId.value = null;
  const name = chat.title;
  void chatStore.deleteSession(current.value ?? null, chat.id).then(() => {
    // O-15（REAL_DEVICE_TEST_2026-10-03）：破坏性操作完成后给出反馈
    showToast('success', t('charList.sessionDeleted', { name }));
  });
}

/**
 * 选中角色。
 * 移动端角色列表是覆盖式抽屉，选中后必须关闭，否则会遮挡对话输入区；
 * 桌面端抽屉常驻（不依赖该开关），关闭为无操作。
 */
function onSelectCharacter(id: string) {
  characterStore.selectCharacter(id);
  characterStore.closeAllDrawers();
  // D-Q：启动时若当前角色没有历史（因此没接回任何会话），切到有历史的角色时同样要接回
  void chatStore.restoreLatestSession(characterStore.currentCharacter ?? null);
}

// I-8：触屏横向滑动关闭抽屉（左抽屉：向右滑 >60px 关闭）
let touchStartX = 0;
let touchStartY = 0;
let swipeHoriz = false;
function onDrawerTouchStart(e: TouchEvent) {
  if (!characterStore.characterDrawerOpen) return;
  touchStartX = e.touches[0]!.clientX;
  touchStartY = e.touches[0]!.clientY;
  swipeHoriz = false;
}
function onDrawerTouchMove(e: TouchEvent) {
  if (!characterStore.characterDrawerOpen) return;
  const dx = e.touches[0]!.clientX - touchStartX;
  const dy = e.touches[0]!.clientY - touchStartY;
  if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 12) swipeHoriz = true;
}
function onDrawerTouchEnd(e: TouchEvent) {
  if (!characterStore.characterDrawerOpen) return;
  const dx = e.changedTouches[0]!.clientX - touchStartX;
  if (swipeHoriz && dx > 60) characterStore.closeAllDrawers();
  swipeHoriz = false;
}
</script>

<template>
  <aside
    id="character-drawer"
    tabindex="-1"
    class="character-list"
    :class="{ active: characterStore.characterDrawerOpen }"
    :aria-label="t('charList.aria')"
    @touchstart="onDrawerTouchStart"
    @touchmove="onDrawerTouchMove"
    @touchend="onDrawerTouchEnd"
  >
    <!-- 搜索区 -->
    <div class="character-search" style="position: relative">
      <span class="search-icon" aria-hidden="true">
        <Icon name="search" :size="16" />
      </span>
      <input
        type="text"
        class="tk-input char-search-input"
        :placeholder="t('charList.searchPlaceholder')"
        :value="characterStore.searchQuery"
        :aria-label="t('charList.searchAria')"
        @input="characterStore.setSearchQuery(($event.target as HTMLInputElement).value)"
      />
      <button
        type="button"
        class="mobile-menu-btn char-close-btn client-compact-only"
        :aria-label="t('charList.close')"
        @click="characterStore.closeAllDrawers()"
      >
        <Icon name="close" :size="18" />
      </button>
    </div>

    <!-- 可滚动列表 -->
    <div class="character-list-scroll tk-scroll">
      <!-- 收藏分组 -->
      <template v-if="characterStore.favorites.length">
        <div class="char-group-header" aria-hidden="true">{{ t('charList.favorites') }}</div>
        <button
          v-for="c in characterStore.favorites"
          :key="c.id"
          type="button"
          class="char-row hover-surface"
          :class="{ active: c.id === characterStore.currentCharacterId }"
          :aria-current="c.id === characterStore.currentCharacterId ? 'true' : undefined"
          :aria-label="c.id === characterStore.currentCharacterId ? t('charList.selectCharCurrent', { name: c.name }) : t('charList.selectChar', { name: c.name })"
          @click="onSelectCharacter(c.id)"
        >
          <Avatar :character="c" :size="32" />
          <span class="char-info">
            <span class="char-name">{{ c.name }}</span>
            <span class="char-time">{{ c.lastActive }}</span>
          </span>
          <span v-if="c.id === characterStore.currentCharacterId && chats.length" class="char-chevron" aria-hidden="true">
            <Icon name="chevron-down" :size="16" />
          </span>
        </button>

        <!-- 多会话列表（§14.2 历史会话切换/置顶/归档） -->
        <div
          v-if="chats.length"
          class="conv-list"
          role="list"
          :aria-label="t('charList.convHistory')"
        >
          <div
            v-for="conv in chats"
            :key="conv.id"
            class="conv-row"
            :class="{ active: conv.id === chatStore.activeChatId }"
            role="listitem"
          >
            <button
              type="button"
              class="conv-main-btn"
              :aria-label="t('charList.switchConv', { name: conv.title })"
              @click="switchChat(conv)"
            >
              <Icon v-if="conv.pinned" name="pin" :size="12" class="conv-pin" aria-hidden="true" />
              <span
                v-if="conv.archived"
                class="conv-archived-tag"
                >{{ t('archives.archivedTag') }}</span>
              <span class="conv-title">{{ conv.title }}</span>
              <span class="conv-time">{{ formatConvTime(conv.updatedAt) }}</span>
            </button>
            <span class="conv-actions" :aria-hidden="undefined">
              <template v-if="confirmDeleteId === conv.id">
                <button
                  type="button"
                  class="conv-act-btn danger"
                  :aria-label="t('charList.confirmDel')"
                  @click="confirmDelete(conv)"
                >
                  <Icon name="check" :size="14" />
                </button>
                <button
                  type="button"
                  class="conv-act-btn"
                  :aria-label="t('charList.cancel')"
                  @click="cancelDelete"
                >
                  <Icon name="close" :size="14" />
                </button>
              </template>
              <template v-else>
                <button
                  type="button"
                  class="conv-act-btn"
                  v-tip="conv.pinned ? t('charList.unpin') : t('charList.pin')"
                  :aria-label="conv.pinned ? t('charList.unpin') : t('charList.pin')"
                  @click="onTogglePin(conv)"
                >
                  <Icon name="pin" :size="14" />
                </button>
                <button
                  type="button"
                  class="conv-act-btn"
                  v-tip="conv.archived ? t('charList.unarchive') : t('charList.archive')"
                  :aria-label="conv.archived ? t('charList.unarchive') : t('charList.archive')"
                  @click="onToggleArchive(conv)"
                >
                  <Icon name="archive" :size="14" />
                </button>
                <button
                  type="button"
                  class="conv-act-btn danger"
                  v-tip="t('charList.delConv')"
                  :aria-label="t('charList.delConv')"
                  @click="askDelete(conv)"
                >
                  <Icon name="trash-2" :size="14" />
                </button>
              </template>
            </span>
          </div>
          <button type="button" class="conv-new-btn" @click="newChat">
            <Icon name="plus" :size="14" aria-hidden="true" />
            <span>{{ t('charList.newForCurrent') }}</span>
          </button>
        </div>
        <!-- 无会话时的起始入口 -->
        <button
          v-else-if="current"
          type="button"
          class="conv-new-btn"
          @click="newChat"
        >
          <Icon name="plus" :size="14" aria-hidden="true" />
          <span>{{ t('charList.newForCurrent') }}</span>
        </button>
      </template>

      <!-- 全部角色分组 -->
      <template v-if="characterStore.others.length">
        <div class="char-group-header" aria-hidden="true" style="padding-top: 14px">{{ t('charList.all') }}</div>
        <button
          v-for="c in characterStore.others"
          :key="c.id"
          type="button"
          class="char-row hover-surface"
          :class="{ active: c.id === characterStore.currentCharacterId }"
          :aria-current="c.id === characterStore.currentCharacterId ? 'true' : undefined"
          :aria-label="c.id === characterStore.currentCharacterId ? t('charList.selectCharCurrent', { name: c.name }) : t('charList.selectChar', { name: c.name })"
          @click="onSelectCharacter(c.id)"
        >
          <Avatar :character="c" :size="32" />
          <span class="char-info">
            <span class="char-name">{{ c.name }}</span>
            <span class="char-time">{{ c.lastActive }}</span>
          </span>
        </button>
      </template>

      <!-- 空状态 -->
      <div v-if="!characterStore.filteredCharacters.length" class="char-empty">
        {{ t('charList.empty') }}
      </div>
    </div>

    <!-- 新建对话 -->
    <div class="character-list-footer">
      <button
        type="button"
        class="hover-cyan new-char-btn"
        :aria-label="t('charList.newConv')"
        @click="openNewConversation"
      >
        <Icon name="plus" :size="16" />
        <span>{{ t('charList.newConv') }}</span>
      </button>
    </div>

    <!-- 新建对话弹窗 -->
    <NewConversationModal v-model="newConvModalOpen" />
  </aside>
</template>

<style scoped>
.character-search {
  padding: 12px;
  border-bottom: 1px solid var(--border);
}

.search-icon {
  position: absolute;
  left: 22px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--muted-foreground);
  display: inline-flex;
  pointer-events: none;
}

.char-search-input {
  height: 36px;
  width: 100%;
  background: var(--video-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 0 12px 0 32px;
  color: var(--foreground);
  font-size: 13px;
  outline: none;
  font-family: var(--font-sans);
}

.char-close-btn {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: var(--muted-foreground);
  cursor: pointer;
  padding: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.char-group-header {
  padding: 12px 8px 4px;
  color: var(--muted-foreground);
  font-size: 12px;
  letter-spacing: 0.04em;
  font-weight: 500;
}

.char-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  width: 100%;
  padding: 8px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  background: none;
  border: none;
  border-left: 3px solid transparent;
  text-align: left;
  margin-top: 2px;
}

.char-row.active {
  border-left-color: var(--secondary);
  background: color-mix(in srgb, var(--secondary) 6%, transparent);
}

.char-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}

.char-name {
  color: var(--foreground);
  font-size: 13px;
  font-weight: 500;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.char-row.active .char-name {
  font-weight: 600;
}

.char-time {
  color: var(--muted-foreground);
  font-size: 11px;
}

.char-chevron {
  color: var(--muted-foreground);
  display: inline-flex;
  flex-shrink: 0;
}

.conv-list {
  display: flex;
  flex-direction: column;
  padding: 2px 6px 8px var(--spacing-md);
  gap: 4px;
}

.conv-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  width: 100%;
  padding: 4px 6px;
  border-radius: var(--radius-sm);
  border-left: 3px solid transparent;
}

.conv-row.active {
  border-left-color: var(--secondary);
  background: color-mix(in srgb, var(--secondary) 8%, transparent);
}

.conv-main-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
  padding: 4px 0;
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  color: inherit;
}

.conv-archived-tag {
  flex-shrink: 0;
  padding: 1px 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm, 4px);
  font-size: 10px;
  color: var(--muted-foreground);
}

.conv-pin {
  color: var(--secondary);
  flex-shrink: 0;
}

.conv-title {
  color: var(--muted-foreground);
  font-size: 12px;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.conv-row.active .conv-title {
  color: var(--foreground);
  font-weight: 500;
}

.conv-time {
  flex-shrink: 1;
  min-width: 0;
  max-width: 88px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--muted-foreground);
  font-size: 11px;
  font-family: var(--font-mono);
  flex-shrink: 0;
}

.conv-actions {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.conv-act-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: none;
  border: none;
  color: var(--muted-foreground);
  border-radius: var(--radius-xs);
  cursor: pointer;
  padding: 0;
  opacity: 0.55;
}

@media (hover: hover) and (pointer: fine) {
  .conv-act-btn:hover {
    color: var(--foreground);
    opacity: 1;
  }
}

@media (hover: hover) and (pointer: fine) {
  .conv-act-btn.danger:hover {
    color: var(--destructive);
  }
}

.conv-new-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  margin-top: 4px;
  padding: 4px 8px;
  background: none;
  border: 1px dashed var(--border);
  border-radius: var(--radius-sm);
  color: var(--muted-foreground);
  font-size: 12px;
  cursor: pointer;
}

@media (hover: hover) and (pointer: fine) {
  .conv-new-btn:hover {
    color: var(--foreground);
    border-color: var(--secondary);
  }
}

.char-empty {
  padding: 32px 8px;
  text-align: center;
  color: var(--muted-foreground);
  font-size: 13px;
}

.new-char-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  height: 36px;
  border: 1px dashed var(--border);
  border-radius: var(--radius-md);
  color: var(--muted-foreground);
  font-size: 13px;
  cursor: pointer;
  background: none;
}

/* §10.4 移动端触控目标：会话操作按钮 ≥44px（--touch-min）、加大间距避免误触 */
@media (max-width: 640px) {
  .conv-act-btn {
    width: var(--touch-min);
    height: var(--touch-min);
    opacity: 1;
  }
  .conv-actions {
    gap: 6px;
  }
  .conv-main-btn {
    min-height: var(--touch-min);
    padding: 6px 0;
  }
  .conv-new-btn {
    min-height: var(--touch-min);
    font-size: 13px;
  }
}

@media (max-width: 640px) {
  /* iOS 聚焦防放大：可编辑控件字号须 ≥16px（I-7 / D1） */
  .char-search-input {
    font-size: 16px;
  }
}
</style>
