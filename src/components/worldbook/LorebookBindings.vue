<script setup lang="ts">
/**
 * LorebookBindings — 已绑定角色展示（需求7 反向关系）
 *
 * R1-3 从 WorldBookView（原 3115 行）拆出。只画列表，不做"谁绑了谁"的计算：
 * `boundCharacters` 由宿主从角色 store 派生后传入（那是一份跨两个 store 的派生，
 * 放在这里就得让组件同时知道 lorebook 与 character 两个 store）。
 */
import Avatar from '@/components/common/Avatar.vue';
import Icon from '@/components/common/Icon.vue';
import { t } from '@/i18n';
import type { UICharacter } from '@/types';

const props = defineProps<{
  characters: UICharacter[];
}>();

const emit = defineEmits<{
  /** L 层：一次点击就到得了角色编辑页 */
  openCharacter: [id: string];
  openCharacterList: [];
}>();
</script>

<template>
  <section class="bound-chars-section" :aria-label="t('wb.boundCharsAria')">
    <header class="bound-chars-header">
      <h2>
        <Icon name="users" :size="14" aria-hidden="true" />
        <span>{{ t('wb.boundCharsTitle') }}</span>
      </h2>
      <span class="bound-chars-count">{{ props.characters.length }}</span>
    </header>
    <p class="bound-chars-hint">
      {{ t('wb.boundCharsHint') }}
    </p>
    <ul v-if="props.characters.length" class="bound-chars-list" role="list">
      <li
        v-for="char in props.characters"
        :key="char.id"
        class="bound-char-item"
        role="listitem"
      >
        <!-- L 层：反向关系此前只是"看得见"，现在一次点击就到得了编辑页 -->
        <button
          type="button"
          class="bound-char-link"
          :data-rel-jump="`wb-bound-${char.id}`"
          :aria-label="t('wb.boundCharsGo', { name: char.name })"
          @click="emit('openCharacter', char.id)"
        >
          <Avatar :character="char" :size="28" />
          <span class="bound-char-name">{{ char.name }}</span>
        </button>
        <span
          v-if="char.tags.length"
          class="bound-char-tags"
        >{{ char.tags.slice(0, 2).join(' · ') }}</span>
      </li>
    </ul>
    <div v-else class="bound-chars-empty-row">
      <p class="bound-chars-empty">
        {{ t('wb.boundCharsEmpty') }}
      </p>
      <button
        type="button"
        class="bound-chars-go"
        data-rel-jump="wb-bound-empty"
        @click="emit('openCharacterList')"
      >
        {{ t('wb.boundCharsGoList') }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.bound-chars-section {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--card);
  flex-shrink: 0;
}

.bound-chars-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.bound-chars-header h2 {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  margin: 0;
  color: var(--text);
}

.bound-chars-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 10px;
  background: var(--accent-blue-bg, rgba(96, 165, 250, 0.15));
  color: var(--accent-blue);
  font-size: 12px;
  font-weight: 600;
}

.bound-chars-hint {
  margin: 4px 0 10px;
  font-size: 12px;
  color: var(--muted-foreground);
}

.bound-chars-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.bound-char-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--bg);
  transition: border-color 0.15s;
}

@media (hover: hover) and (pointer: fine) {
  .bound-char-item:hover {
    border-color: var(--primary);
  }
}

.bound-char-name {
  font-weight: 500;
  color: var(--text);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bound-char-tags {
  color: var(--muted-foreground);
  font-size: 12px;
  flex-shrink: 0;
}

.bound-chars-empty {
  margin: 8px 0;
  padding: 12px;
  border: 1px dashed var(--border-subtle);
  border-radius: 8px;
  color: var(--muted-foreground);
  font-size: 13px;
  text-align: center;
}

.bound-char-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 2px 4px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm, 8px);
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

@media (hover: hover) {
  .bound-char-link:hover {
    border-color: var(--secondary);
  }
}

.bound-char-link:focus-visible {
  outline: 2px solid var(--ring, var(--secondary));
  outline-offset: 1px;
}

.bound-chars-empty-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.bound-chars-go {
  padding: 3px 10px;
  border: 1px solid var(--secondary);
  border-radius: 999px;
  background: transparent;
  color: var(--secondary-text);
  font-size: 13px;
  cursor: pointer;
}

.bound-chars-go:focus-visible {
  outline: 2px solid var(--ring, var(--secondary));
  outline-offset: 1px;
}
</style>
