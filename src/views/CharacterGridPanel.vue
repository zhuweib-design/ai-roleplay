<script setup lang="ts">
/**
 * CharacterGridPanel — 角色卡片网格（R3-5 从 CharactersView 拆出）
 *
 * 持有：卡片网格 / 收藏切换 / 标签预览 / 空状态 / 拖拽提示覆盖层。
 * 事件上抛：卡片点击（宿主分流抽屉或编辑页）/ 编辑 / 对话 / 导出 / 删除 / 版本历史。
 * 判据：单根组件（无 v-show 透传需求，不包额外根 div）。
 */
import { useCharacterStore } from '@/stores/character';
import { useSettingsStore } from '@/stores/settings';
import { useCharacterVersionStore } from '@/stores/character-version';
import { useViewport } from '@/core/viewport';
import Icon from '@/components/common/Icon.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import Avatar from '@/components/common/Avatar.vue';
import type { UICharacter } from '@/types';
import { t } from '@/i18n';

defineProps<{
  list: UICharacter[];
  busyId: string | null;
  dragging: boolean;
}>();

defineEmits<{
  'card-click': [id: string];
  edit: [id: string];
  chat: [id: string];
  export: [id: string];
  delete: [char: UICharacter];
  versions: [id: string];
}>();

const characterStore = useCharacterStore();
const settingsStore = useSettingsStore();
const versionStore = useCharacterVersionStore();
const { isMobile } = useViewport();

function toggleFavorite(id: string, e: Event) {
  e.stopPropagation();
  characterStore.toggleFavorite(id);
}

function tagsPreview(tags: string[]): string {
  return tags.slice(0, 3).join(' · ') + (tags.length > 3 ? ` +${tags.length - 3}` : '');
}
</script>

<template>
  <div class="characters-grid tk-scroll">
    <article
      v-for="char in list"
      :key="char.id"
      class="char-card hover-surface"
      :class="{ 'is-busy': busyId === char.id }"
      tabindex="0"
      :aria-label="t('characters.cardAria', { name: char.name })"
      @click="$emit('card-click', char.id)"
      @keydown.enter="$emit('card-click', char.id)"
      @keydown.space.prevent="$emit('card-click', char.id)"
    >
      <div class="card-header">
        <Avatar :character="char" :size="isMobile ? 44 : 56" />
        <button
          type="button"
          class="favorite-btn"
          :class="{ active: char.favorite }"
          :aria-label="char.favorite ? t('characters.unfavorite') : t('characters.favorite')"
          :aria-pressed="char.favorite"
          @click="toggleFavorite(char.id, $event)"
        >
          <Icon name="star" :size="16" />
        </button>
      </div>

      <h2 class="card-name">{{ char.name }}</h2>
      <p class="card-tags">{{ tagsPreview(char.tags) }}</p>
      <p v-if="!isMobile" class="card-desc">{{ char.description }}</p>

      <div class="card-meta">
        <span class="meta-item">
          <Icon name="chat-circle" :size="12" />
          <span>{{ t('characters.convCount', { count: char.conversations.length }) }}</span>
        </span>
        <span class="meta-item">
          <Icon name="gear" :size="12" />
          <span>{{ settingsStore.activeProfile?.model ?? char.model }}</span>
        </span>
        <button
          v-if="versionStore.hasRepository(char.id)"
          type="button"
          class="meta-item meta-tracked"
          data-rel-jump="char-tracked"
          :aria-label="t('characters.trackedAria', { name: char.name })"
          v-tip="t('characters.trackedHint')"
          @click.stop="$emit('versions', char.id)"
        >
          <Icon name="git-branch" :size="12" aria-hidden="true" />
          <span>{{ t('characters.trackedTag') }}</span>
        </button>
      </div>

      <!-- 手机：四个动作在详情抽屉里（批次 1-5 方案乙）；桌面保留卡面内联 -->
      <div v-if="!isMobile" class="card-actions">
        <button
          type="button"
          class="action-btn edit"
          :aria-label="t('characters.editAria')"
          @click.stop="$emit('edit', char.id)"
        >
          <Icon name="pencil" :size="14" />
          <span>{{ t('characters.edit') }}</span>
        </button>
        <button
          type="button"
          class="action-btn chat"
          :aria-label="t('characters.chatAria')"
          @click.stop="$emit('chat', char.id)"
        >
          <Icon name="chat-circle" :size="14" />
          <span>{{ t('characters.chat') }}</span>
        </button>
        <button
          type="button"
          class="action-btn export"
          :aria-label="t('characters.exportAria')"
          :disabled="busyId === char.id"
          @click.stop="$emit('export', char.id)"
        >
          <Icon name="download" :size="14" />
          <span>{{ t('characters.export') }}</span>
        </button>
        <button
          type="button"
          class="action-btn delete"
          :aria-label="t('characters.deleteAria')"
          @click.stop="$emit('delete', char)"
        >
          <Icon name="trash-2" :size="14" />
          <span>{{ t('characters.delete') }}</span>
        </button>
      </div>
    </article>

    <!-- 空状态 -->
    <EmptyState
      v-if="list.length === 0"
      :title-key="characterStore.searchQuery ? 'characters.emptySearch' : 'characters.emptyNoChar'"
      :desc-key="characterStore.searchQuery ? 'characters.emptySearchHint' : 'characters.emptyNoCharHint'"
      icon="user"
    />

    <!-- 拖拽提示 -->
    <div v-if="dragging" class="drag-overlay" aria-hidden="true">
      <Icon name="upload" :size="48" />
      <p>{{ t('characters.dropHint') }}</p>
    </div>
  </div>
</template>

<style scoped>
.characters-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px;
  align-content: start;
  overflow-y: auto;
  padding-right: 4px;
}

.char-card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 16px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: border-color .15s ease, transform .15s ease, background-color .15s ease;
  outline: none;
}

@media (hover: hover) and (pointer: fine) {
  .char-card:hover {
    border-color: var(--secondary);
    background: var(--card-elevated);
  }
}

/* focus-visible 分支不加 hover 守卫：键盘可达性不受设备 hover 能力影响 */
.char-card:focus-visible {
  border-color: var(--secondary);
  background: var(--card-elevated);
}

.char-card:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 2px;
}

.char-card.is-busy {
  opacity: 0.6;
  pointer-events: none;
}

.card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

.favorite-btn {
  background: none;
  border: none;
  color: var(--muted-foreground);
  cursor: pointer;
  padding: 4px;
  display: inline-flex;
  border-radius: var(--radius-sm);
  transition: color .15s ease, background-color .15s ease;
}

@media (hover: hover) and (pointer: fine) {
  .favorite-btn:hover {
    color: var(--primary-fg);
    background: color-mix(in srgb, var(--primary) 8%, transparent);
  }
}

.favorite-btn.active {
  color: var(--primary-fg);
}

.favorite-btn:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 2px;
}

.card-name {
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 600;
  color: var(--foreground);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-tags {
  font-size: 12px;
  /* --secondary 作文字在 theatre 的 --card-elevated 上仅 4.37:1；
     改用派生 token --secondary-text（= secondary 与 foreground 混合，主题自适应）。 */
  color: var(--secondary-text);
  margin: 0;
}

.card-desc {
  font-size: 13px;
  color: var(--muted-foreground);
  margin: 0;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 39px;
}

.card-meta {
  display: flex;
  gap: 12px;
  font-size: 11px;
  color: var(--muted-foreground);
  padding-top: 4px;
  border-top: 1px solid var(--border);
}

/* "已跟踪"是可点的（跳该角色版本历史），但视觉仍是元信息行的一员，不做成按钮块 */
.meta-tracked {
  margin-left: auto;
  padding: 0;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.meta-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.card-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  margin-top: 4px;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: var(--size-control-sm);
  padding: 0 8px;
  border-radius: var(--radius-sm);
  background: var(--video-bg);
  border: 1px solid var(--border);
  color: var(--muted-foreground);
  font-size: 12px;
  cursor: pointer;
  transition: background-color .15s ease, color .15s ease, border-color .15s ease;
}

@media (hover: hover) and (pointer: fine) {
  .action-btn:hover {
    background: var(--card-elevated);
    color: var(--foreground);
  }
}

.action-btn:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 2px;
}

@media (hover: hover) and (pointer: fine) {
  .action-btn.delete:hover {
    border-color: var(--destructive);
    color: var(--destructive);
  }
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.drag-overlay {
  position: absolute;
  inset: 0;
  background: color-mix(in srgb, var(--secondary) 8%, var(--background));
  border: 2px dashed var(--secondary);
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--secondary-text);
  font-size: 16px;
  pointer-events: none;
  z-index: 5;
}

@media (max-width: 640px) {

  .characters-grid {
    grid-template-columns: 1fr;
  }
  /*
   * 一屏 ≥3 张卡（批次 1-5 判据）。卡面四个动作搬走只省了一半，剩下的靠
   * "卡 = 索引、抽屉 = 详情"的分工把卡压瘦：
   * - 页头返回按钮隐藏：底部导航全程在场，Tab 就是回去的路，页头返回是第二个
   * - 简介 clamp 1 行、标签隐藏：全量信息在抽屉里，卡只留"这是谁"的一眼
   * - 头像 44：见模板 :size 的 isMobile 分流
   */

  .card-tags {
    display: none;
  }
  .characters-grid {
    gap: 10px;
  }
  .card-name {
    font-size: 14px;
  }

  .card-actions {
    grid-template-columns: 1fr 1fr;
  }

}

/* 批次 3-3：卡片星标命中区撑到 44，视觉仍是 24（卡面密度不变） */
@media (max-width: 640px) {
  .favorite-btn {
    position: relative;
  }
  .favorite-btn::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    /* 46 而不是 44：探针按 1px 步进，正好 44 时边界像素不属于元素，量出来是 43 */
    width: calc(var(--touch-min) + 2px);
    height: calc(var(--touch-min) + 2px);
    transform: translate(-50%, -50%);
  }
}
</style>
