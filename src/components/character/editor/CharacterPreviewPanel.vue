<script setup lang="ts">
/**
 * CharacterPreviewPanel — 实时预览侧栏（R2-1 从 CharacterEditorView 拆出）
 *
 * 只吃一个"已经拼好的" UICharacter：名称、标签、描述、模型、温度、深度、收藏。
 * 拼装逻辑在宿主的 composable 里（`previewCharacter`），因为那需要表单 + 校验状态；
 * 本组件只管画，切主题/换字号都不需要它知道表单长什么样。
 */
import Avatar from '@/components/common/Avatar.vue';
import type { UICharacter } from '@/types';
import { t } from '@/i18n';

defineProps<{
  character: UICharacter;
}>();
</script>

<template>
  <aside class="editor-preview" :aria-label="t('charEdit.previewTitle')">
    <h2 class="preview-title">{{ t('charEdit.previewTitle') }}</h2>
    <div class="preview-card">
      <div class="preview-avatar-wrap">
        <Avatar :character="character" :size="80" />
      </div>
      <h3 class="preview-name">{{ character.name }}</h3>
      <p v-if="character.tags.length" class="preview-tags">
        {{ character.tags.join(' · ') }}
      </p>
      <p class="preview-desc">{{ character.description }}</p>
      <dl class="preview-meta">
        <div class="meta-row">
          <dt>{{ t('charEdit.previewModel') }}</dt>
          <dd>{{ character.model }}</dd>
        </div>
        <div class="meta-row">
          <dt>{{ t('charEdit.previewTemp') }}</dt>
          <dd>{{ character.temperature.toFixed(2) }}</dd>
        </div>
        <div class="meta-row">
          <dt>{{ t('charEdit.previewDepth') }}</dt>
          <dd>{{ character.authorDepth }}</dd>
        </div>
        <div class="meta-row">
          <dt>{{ t('charEdit.previewFavorite') }}</dt>
          <dd>{{ character.favorite ? t('charEdit.previewYes') : t('charEdit.previewNo') }}</dd>
        </div>
      </dl>
    </div>
  </aside>
</template>

<style scoped>
.editor-preview {
  position: sticky;
  top: 0;
  align-self: start;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: calc(100vh - 120px);
  max-height: calc(100dvh - 120px);
  overflow-y: auto;
}

.preview-title {
  font-family: var(--font-display);
  font-size: 13px;
  font-weight: 600;
  color: var(--muted-foreground);
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.preview-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 10px;
}

.preview-avatar-wrap {
  display: flex;
  justify-content: center;
  padding: 8px 0;
}

.preview-name {
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 600;
  color: var(--foreground);
  margin: 0;
}

.preview-tags {
  font-size: 12px;
  color: var(--secondary-text);
  margin: 0;
}

.preview-desc {
  font-size: 13px;
  color: var(--muted-foreground);
  margin: 0;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  max-width: 100%;
}

.preview-meta {
  width: 100%;
  margin: 8px 0 0;
  border-top: 1px solid var(--border);
  padding-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.meta-row {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
}

.meta-row dt {
  color: var(--muted-foreground);
}

.meta-row dd {
  color: var(--foreground);
  margin: 0;
  font-family: var(--font-mono);
}

@media (max-width: 1024px) {
  .editor-preview {
    position: static;
    order: -1;
    max-height: none;
    /* 必须同时取消滚动容器：`.editor-preview` 带着 overflow-y:auto 时，
       它在网格里的**块方向贡献会塌成标题那一行（实测 34px）**——滚动容器没有
       块方向的 max-content 高度。行轨 34px、盒子却照旧画 407px，于是下面的表单
       压在预览卡上（1000px 实测 fieldset.y=134 而 preview 占到 483）。
       改成 visible 后行轨 = 407.219px，重叠消失；只写 height:auto 无效。 */
    overflow: visible;
  }
}
</style>
