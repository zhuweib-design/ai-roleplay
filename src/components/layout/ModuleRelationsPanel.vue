<script setup lang="ts">
/**
 * ModuleRelationsPanel —"这个角色跟哪些模块有关系"（L 层，§3.3）
 *
 * 角色编辑页此前只有"绑定/解绑"控件本身，用户配完不知道：绑了没有生效、
 * 模型/预设是角色级还是跟随全局、有没有版本可回滚、这个角色还被哪些群聊用着。
 * 面板**只渲染 `composables/useCharacterRelations.ts` 的判定结果**，不在此处做任何数据判断，
 * 这样角色卡、编辑页、以后的市场详情页可以共用同一份真相。
 */
import { toRef } from 'vue';
import Icon from '@/components/common/Icon.vue';
import { t } from '@/i18n';
import { useCharacterRelations, type RelationRow } from '@/composables/useCharacterRelations';
import { useReadinessJump } from '@/composables/useReadinessJump';
import { useGroupChatStore } from '@/stores/group-chat';

const props = defineProps<{ characterId: string }>();

const rows = useCharacterRelations(toRef(props, 'characterId'));
const { pushWithReturn } = useReadinessJump();
const groupStore = useGroupChatStore();

function go(row: RelationRow): void {
  // 群聊路由没有参数，必须先选中要打开的群
  if (row.preSelectGroupId) groupStore.selectGroup(row.preSelectGroupId);
  if (row.jump) pushWithReturn(row.jump);
}
</script>

<template>
  <section v-if="rows.length" class="relations" :aria-label="t('rel.title')">
    <header class="relations-header">
      <Icon name="globe" :size="14" aria-hidden="true" />
      <!-- 标题用 p 而非 h3：编辑页已有自己的标题层级，axe 的 heading-order 会因此判违规 -->
      <p class="relations-title">{{ t('rel.title') }}</p>
      <p class="relations-hint">{{ t('rel.hint') }}</p>
    </header>

    <ul class="relations-list" role="list">
      <li
        v-for="row in rows"
        :key="row.id"
        class="relations-row"
        :data-rel-id="row.id"
        :class="{ 'is-plain': !row.linked }"
      >
        <span class="relations-label">{{ t(row.labelKey) }}</span>
        <span class="relations-text">{{ t(row.textKey, row.params) }}</span>
        <button
          type="button"
          class="relations-go"
          :data-rel-jump="row.dataRelJump"
          :aria-label="t('rel.openAria', { name: t(row.labelKey) })"
          @click="go(row)"
        >
          <span>{{ t(row.linked ? 'rel.open' : 'rel.goto') }}</span>
          <Icon name="chevron-right" :size="12" aria-hidden="true" />
        </button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.relations {
  margin: 0 0 var(--spacing-md, 16px);
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md, 12px);
  background: var(--card);
}

.relations-header {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  color: var(--muted-foreground);
}

.relations-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--muted-foreground);
}

.relations-hint {
  margin: 0;
  font-size: 13px;
  color: var(--muted-foreground);
}

.relations-list {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.relations-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--foreground);
}

.relations-row.is-plain {
  color: var(--muted-foreground);
}

.relations-label {
  flex: 0 0 auto;
  min-width: 4.5em;
  font-weight: 600;
}

.relations-text {
  flex: 1 1 auto;
  min-width: 0;
}

.relations-go {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex: 0 0 auto;
  padding: 3px 10px;
  border: 1px solid var(--secondary);
  border-radius: 999px;
  background: transparent;
  color: var(--secondary-text);
  font-size: 13px;
  cursor: pointer;
}

@media (hover: hover) {
  .relations-go:hover {
    background: var(--secondary);
    color: var(--on-secondary);
  }
}

@media (max-width: 640px) {
  .relations-go {
    font-size: 16px;
  }
}

.relations-go:focus-visible {
  outline: 2px solid var(--ring, var(--secondary));
  outline-offset: 1px;
}
</style>
