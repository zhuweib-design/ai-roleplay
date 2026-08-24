<script setup lang="ts">
import { ref } from 'vue';
import { useCharacterStore } from '@/stores/character';
import Icon from '@/components/common/Icon.vue';
import Avatar from '@/components/common/Avatar.vue';
import NewConversationModal from '@/components/chat/NewConversationModal.vue';
import { t } from '@/i18n';

const characterStore = useCharacterStore();

// 新建对话弹窗
const newConvModalOpen = ref(false);

function openNewConversation() {
  newConvModalOpen.value = true;
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
          <span v-if="c.id === characterStore.currentCharacterId && c.conversations.length" class="char-chevron" aria-hidden="true">
            <Icon name="chevron-down" :size="16" />
          </span>
        </button>

        <!-- 历史对话列表（仅展示；多会话切换 PRD 无要求，未实现） -->
        <div
          v-if="characterStore.currentCharacter?.conversations.length"
          class="conv-list"
          role="list"
          :aria-label="t('charList.convHistory')"
        >
          <div
            v-for="conv in characterStore.currentCharacter?.conversations"
            :key="conv.id"
            class="conv-row"
            role="listitem"
          >
            <span class="conv-title">{{ conv.title }}</span>
            <span class="conv-time">{{ conv.updatedAt }}</span>
          </div>
        </div>
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
  padding-left: 27px;
  padding-top: 2px;
  gap: 4px;
}

.conv-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  width: 100%;
  padding: 6px 8px;
  border-radius: var(--radius-sm);
  cursor: default;
  /* 非交互展示（多会话切换未实现） */
}

.conv-title {
  color: var(--muted-foreground);
  font-size: 12px;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.conv-time {
  color: var(--muted-foreground);
  font-size: 11px;
  font-family: var(--font-mono);
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
