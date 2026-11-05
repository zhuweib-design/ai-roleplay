<script setup lang="ts">
/**
 * CharacterPickerList — 角色多选清单（R1-1 从 GroupChatView 拆出）
 *
 * 建群向导与「添加成员」弹窗用的是同一份清单：同一批角色卡、同一套选中态、
 * 同一套头像/标签排版。原来在视图里写了两遍（约 45 行模板 + 60 行样式），
 * 拆 Modal 时如果各带一份，等于把重复从"一个大文件里"搬到"两个文件里"。
 *
 * 纯展示 + 一个 toggle 意图：选中集合归调用方（两个 Modal 各自的 Set）。
 */
import { t } from '@/i18n';
import Avatar from '@/components/common/Avatar.vue';
import Icon from '@/components/common/Icon.vue';
import type { UICharacter } from '@/types';

defineProps<{
  /** 可选角色卡 */
  items: UICharacter[];
  /** 已选中的角色 id 集合（调用方持有） */
  selected: Set<string>;
  /** 清单为空时是否显示"都已在群里"的提示（建群向导不需要） */
  showEmptyHint?: boolean;
}>();

const emit = defineEmits<{
  toggle: [characterId: string];
}>();
</script>

<template>
  <ul class="char-pick-list tk-scroll" role="group" :aria-label="t('group.charPickAria')">
    <li v-for="c in items" :key="c.id">
      <button
        type="button"
        class="char-pick"
        :class="{ selected: selected.has(c.id) }"
        :aria-pressed="selected.has(c.id)"
        @click="emit('toggle', c.id)"
      >
        <Avatar :character="c" :size="32" />
        <div class="char-pick-info">
          <div class="char-pick-name">{{ c.name }}</div>
          <div class="char-pick-tags">{{ c.tags.slice(0, 2).join('、') }}</div>
        </div>
        <Icon
          v-if="selected.has(c.id)"
          name="check"
          :size="16"
          class="check-icon"
        />
      </button>
    </li>
    <li v-if="showEmptyHint && items.length === 0" class="empty-add">
      <p>{{ t('group.allMembersIn') }}</p>
    </li>
  </ul>
</template>

<style scoped>
.char-pick-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 240px;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

.char-pick {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  border: none;
  background: transparent;
  color: var(--foreground);
  text-align: left;
  cursor: pointer;
  border-bottom: 1px solid var(--border);
}

.char-pick:last-child {
  border-bottom: none;
}

@media (hover: hover) and (pointer: fine) {
  .char-pick:hover {
    background: var(--card-elevated);
  }
}

.char-pick.selected {
  background: var(--card-elevated);
}

.char-pick-info {
  flex: 1;
  min-width: 0;
}

.char-pick-name {
  font-size: 13px;
  font-weight: 500;
}

.char-pick-tags {
  font-size: 11px;
  color: var(--muted-foreground);
  margin-top: 2px;
}

.check-icon {
  color: var(--secondary-text);
}

.empty-add {
  padding: 20px;
  text-align: center;
  color: var(--muted-foreground);
  font-size: 12px;
}

.empty-add p {
  margin: 0;
}
</style>
