<script setup lang="ts">
/**
 * 上下文面板 · 作者笔记（R2-3 从 ContextPanel 拆出）
 *
 * 正文与注入深度都直接写回当前角色（无本地草稿态，失焦即落盘）。
 */
import { useContextPanel } from '@/composables/useContextPanel';
import { t } from '@/i18n';

const { char, onAuthorNote, onAuthorDepth } = useContextPanel();
</script>

<template>
  <!-- 没有当前角色（空安装）时整段不渲染：作者笔记是写进角色的字段 -->
  <section v-if="char" class="ctx-section" aria-labelledby="ctx-author-title">
    <header class="ctx-section-header">
      <span id="ctx-author-title" class="ctx-section-title">{{ t('ctx.authorTitle') }}</span>
      <span class="ctx-section-value">{{ t('ctx.authorDepth', { depth: char.authorDepth }) }}</span>
    </header>
    <textarea
      class="tk-input ctx-textarea"
      :value="char.authorNote"
      :placeholder="t('ctx.authorPlaceholder')"
      :aria-label="t('ctx.authorAria')"
      rows="3"
      @input="onAuthorNote"
    />
    <label class="ctx-range-label">
      <span>{{ t('ctx.insertDepth') }}</span>
      <input
        v-range
        type="range"
        class="tk-range"
        min="0"
        max="10"
        step="1"
        :value="char.authorDepth"
        :aria-label="t('ctx.authorDepthAria')"
        @input="onAuthorDepth"
      />
      <span class="ctx-range-value" aria-hidden="true">{{ char.authorDepth }}</span>
    </label>
  </section>
</template>
