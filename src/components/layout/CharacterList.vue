<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useCharacterStore } from '@/stores/character';
import { useChatStore } from '@/stores/chat';
import type { Chat } from '@/storage/types';
import Icon from '@/components/common/Icon.vue';
import Avatar from '@/components/common/Avatar.vue';
import NewConversationModal from '@/components/chat/NewConversationModal.vue';
import { t } from '@/i18n';

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

/** 建档角色切换时加载其会话索引（session 列表数据源） */
watch(
  () => characterStore.characters.length,
  () => {
    const ids = characterStore.characters.map((c) => c.id);
    if (ids.length > 0) void chatStore.loadAllSessions(ids);
  },
  { immediate: true }
);

onMounted(() => {
  const ids = characterStore.characters.map((c) => c.id);
  if (ids.length > 0) void chatStore.loadAllSessions(ids);
});

/** 切换会话 */
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
}

function onTogglePin(chat: Chat) {
  void chatStore.togglePin(chat.id);
}
function onToggleArchive(chat: Chat) {
  void chatStore.toggleArchive(chat.id);
}
function onDelete(chat: Chat) {
  void chatStore.deleteSession(current.value ?? null, chat.id);
}
</script>

<template>
  <aside id="character-drawer" tabindex="-1" class="character-list" :class="{ active: characterStore.characterListOpen }" :aria-label="t('charList.aria')">
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
        class="mobile-menu-btn char-close-btn"
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
          @click="characterStore.selectCharacter(c.id)"
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
              <span class="conv-title">{{ conv.title }}</span>
              <span class="conv-time">{{ conv.updatedAt }}</span>
            </button>
            <span class="conv-actions" :aria-hidden="undefined">
              <button
                type="button"
                class="conv-act-btn"
                :title="conv.pinned ? t('charList.unpin') : t('charList.pin')"
                :aria-label="conv.pinned ? t('charList.unpin') : t('charList.pin')"
                @click="onTogglePin(conv)"
              >
                <Icon name="pin" :size="14" />
              </button>
              <button
                type="button"
                class="conv-act-btn"
                :title="t('charList.archive')"
                :aria-label="t('charList.archive')"
                @click="onToggleArchive(conv)"
              >
                <Icon name="archive" :size="14" />
              </button>
              <button
                type="button"
                class="conv-act-btn danger"
                :title="t('charList.delConv')"
                :aria-label="t('charList.delConv')"
                @click="onDelete(conv)"
              >
                <Icon name="trash-2" :size="14" />
              </button>
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
          @click="characterStore.selectCharacter(c.id)"
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

.conv-act-btn:hover {
  color: var(--foreground);
  opacity: 1;
}

.conv-act-btn.danger:hover {
  color: var(--destructive);
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

.conv-new-btn:hover {
  color: var(--foreground);
  border-color: var(--secondary);
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
</style>
