<script setup lang="ts">
/**
 * CharacterDetailDrawer — 手机端角色详情抽屉（MOBILE_PLAN 批次 1-5，方案乙）
 *
 * 方案乙的三级排版（§6 决策记录）：
 *   ① 简介 / 标签 / 统计 —— 让用户确认"这是我要的那个角色"
 *   ② 「开始对话」—— 唯一的填充大按钮。它补偿了"点卡不再直进对话"多出的一步，
 *      也是抽屉里视觉上唯一的主动作
 *   ③ 编辑 / 导出 / 删除 —— 次级文字按钮一行。靠尺寸与填充区分主次，不靠并列
 *
 * 为什么四个动作都进抽屉：§6 决策乙的 ② —— 卡面只留卡体本身可点。原卡面四个
 * 24px 按钮是"一屏一个主动作"的反例，也是一屏只有 1.5 张卡的直接原因。
 *
 * 桌面不渲染这个抽屉：桌面卡面保留四个内联按钮（原布局），抽屉只在 isMobile 下挂载。
 */
import { computed } from 'vue';
import Icon from '@/components/common/Icon.vue';
import Avatar from '@/components/common/Avatar.vue';
import BottomSheet from '@/components/common/BottomSheet.vue';
import { t } from '@/i18n';
import type { UICharacter } from '@/types';

const props = defineProps<{
  open: boolean;
  /** 抽屉展示的角色；关闭时可为 null（外壳用 v-if 控制挂载，传 null 只影响内容） */
  character: UICharacter | null;
  /** 导出进行中：导出按钮禁用 */
  busy: boolean;
}>();

const emit = defineEmits<{
  close: [];
  chat: [];
  edit: [];
  export: [];
  delete: [];
}>();

const tagsPreview = computed(() => {
  const tags = props.character?.tags ?? [];
  return tags.slice(0, 3).join(' · ') + (tags.length > 3 ? ` +${tags.length - 3}` : '');
});
</script>

<template>
  <BottomSheet :open="open" :heading="character?.name ?? ''" @close="emit('close')">
    <div v-if="character" class="char-detail">
      <!-- ① 确认区：这是我要的那个角色吗 -->
      <div class="detail-head">
        <Avatar :character="character" :size="48" />
        <div class="detail-meta">
          <p class="detail-tags">{{ tagsPreview || t('characters.noTags') }}</p>
          <p class="detail-stats">
            <Icon name="chat-circle" :size="12" aria-hidden="true" />
            <span>{{ t('characters.convCount', { count: character.conversations.length }) }}</span>
            <Icon name="gear" :size="12" aria-hidden="true" />
            <span class="detail-model">{{ character.model }}</span>
          </p>
        </div>
      </div>
      <p class="detail-desc">{{ character.description || t('characters.emptyNoCharHint') }}</p>

      <!-- ② 唯一主动作：填充大按钮 -->
      <button type="button" class="chat-primary" @click="emit('chat')">
        <Icon name="chat-circle" :size="16" aria-hidden="true" />
        <span>{{ t('characters.startChat') }}</span>
      </button>

      <!-- ③ 次级动作：一行文字按钮，删除标红 -->
      <div class="detail-secondary">
        <button type="button" class="secondary-btn" @click="emit('edit')">
          <Icon name="pencil" :size="14" aria-hidden="true" />
          <span>{{ t('characters.edit') }}</span>
        </button>
        <button
          type="button"
          class="secondary-btn"
          :disabled="busy"
          @click="emit('export')"
        >
          <Icon name="download" :size="14" aria-hidden="true" />
          <span>{{ t('characters.export') }}</span>
        </button>
        <button type="button" class="secondary-btn danger" @click="emit('delete')">
          <Icon name="trash-2" :size="14" aria-hidden="true" />
          <span>{{ t('characters.delete') }}</span>
        </button>
      </div>
    </div>
  </BottomSheet>
</template>

<style scoped>
.char-detail {
  display: flex;
  flex-direction: column;
  gap: var(--space-3, 12px);
  padding-bottom: var(--space-2, 8px);
}

.detail-head {
  display: flex;
  align-items: center;
  gap: var(--space-3, 12px);
}

.detail-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.detail-tags {
  margin: 0;
  font-size: 12px;
  color: var(--muted-foreground);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-stats {
  margin: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--muted-foreground);
  min-width: 0;
}

.detail-model {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--foreground);
  display: -webkit-box;
  -webkit-line-clamp: 4;
  line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* ② 唯一主动作：整宽填充按钮，与次级按钮只靠尺寸与填充区分（§6 决策的落地口径） */
.chat-primary {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2, 8px);
  width: 100%;
  min-height: var(--touch-min, 44px);
  padding: 0 var(--space-3, 12px);
  border: none;
  border-radius: var(--radius-md);
  background: var(--primary);
  color: var(--on-primary);
  font-family: inherit;
  font-size: var(--font-size-md, 14px);
  font-weight: 600;
  cursor: pointer;
}

.chat-primary:active {
  opacity: 0.88;
}

.chat-primary:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 2px;
}

.detail-secondary {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-2, 8px);
}

/* 次级动作：文字按钮，无填充、无边框——主次靠"填充 vs 文字"表达 */
.secondary-btn {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: var(--touch-min, 44px);
  padding: 0 var(--space-1, 4px);
  border: none;
  border-radius: var(--radius-md);
  background: none;
  color: var(--muted-foreground);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
}

@media (hover: hover) and (pointer: fine) {
  .secondary-btn:hover {
    background: color-mix(in srgb, var(--foreground) 8%, transparent);
    color: var(--foreground);
  }
}

.secondary-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.secondary-btn:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: -2px;
}

.secondary-btn.danger {
  color: var(--error-fg);
}
</style>
