<script setup lang="ts">
/**
 * DocCard — 数据银行文档卡片（R4-10 从 DataBankView 抽出）
 *
 * 抽出的直接动因是**逐行重复**：原视图全局段（232–284）与角色段（287–339）
 * 各 52 行，其中 44 行 article 里只有 3 行不同 —— v-for 源、meta 第三列、
 * 以及展开按钮的 `.stop` 修饰符。合并后这三处统一为：
 *   · v-for 由 props.docs 驱动
 *   · meta 第三列按 `doc.scope` 分支（character → 绑定角色名，其余 → 创建时间）
 *   · 展开按钮统一 `@click.stop`
 *
 * **顺手修掉一处真缺陷**：原角色段展开按钮写的是 `@click`（漏了 `.stop`），
 * 事件冒泡到父级 `.card-header` 的 `@click="toggleExpand"` 后二次触发，
 * 开关相互抵消 —— 即 D-8 修过的同一 bug 在角色段仍然存在。原 e2e
 * （e2e/databank-flow.spec.ts）只覆盖新上传的全局段，抓不到角色段。
 *
 * 类名（.doc-card / .card-header / .card-expand / .card-chunks …）刻意原样保留，
 * 因为 e2e 靠它们定位。`.doc-grid` 留在宿主（它是节容器，不是卡片自身）。
 */
import Icon from '@/components/common/Icon.vue';
import { t } from '@/i18n';
import type { DataBankDocument } from '@/core/data-bank';

defineProps<{
  /** 本组要渲染的文档（全局组或某角色组） */
  docs: DataBankDocument[];
  /** 当前展开的文档 id（受控，与宿主共享同一展开态） */
  expandedDocId: string | null;
  formatFileSize: (bytes: number) => string;
  formatDate: (iso: string) => string;
  getCharacterName: (id?: string) => string;
}>();

const emit = defineEmits<{
  toggleExpand: [id: string];
  confirmDelete: [id: string];
}>();
</script>

<template>
  <article v-for="doc in docs" :key="doc.id" class="doc-card">
    <div class="card-header" @click="emit('toggleExpand', doc.id)">
      <Icon name="file" :size="20" class="doc-icon" />
      <div class="card-info">
        <h3 class="doc-name">{{ doc.name }}</h3>
        <span class="doc-meta">
          {{ formatFileSize(doc.fileSize) }} ·
          {{ t('databank.chunksCount', { count: doc.chunks.length }) }} ·
          {{ doc.scope === 'character' ? getCharacterName(doc.characterId) : formatDate(doc.createdAt) }}
        </span>
      </div>
      <button
        type="button"
        class="card-expand"
        :aria-label="expandedDocId === doc.id ? t('databank.collapseChunks') : t('databank.expandChunks')"
        :aria-expanded="expandedDocId === doc.id"
        @click.stop="emit('toggleExpand', doc.id)"
      >
        <Icon :name="expandedDocId === doc.id ? 'chevron-up' : 'chevron-down'" :size="16" />
      </button>
    </div>
    <div v-if="expandedDocId === doc.id" class="card-chunks">
      <div v-for="chunk in doc.chunks" :key="chunk.id" class="chunk-item">
        <span class="chunk-index">#{{ chunk.index + 1 }}</span>
        <span class="chunk-content">{{ chunk.content }}</span>
        <span class="chunk-tokens">{{ chunk.tokenCount }} tok</span>
      </div>
    </div>
    <div class="card-actions">
      <button
        type="button"
        class="card-btn delete-btn"
        :aria-label="t('databank.deleteAria')"
        @click="emit('confirmDelete', doc.id)"
      >
        <Icon name="trash-2" :size="14" />
        <span>{{ t('databank.delete') }}</span>
      </button>
    </div>
  </article>
</template>

<style scoped>
/* 文档卡片 */
.doc-card {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--card);
  overflow: hidden;
  transition: border-color 0.15s;
}

@media (hover: hover) and (pointer: fine) {
  .doc-card:hover {
    border-color: var(--border);
  }
}

.card-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  cursor: pointer;
}

.doc-icon {
  color: var(--muted-foreground);
  flex-shrink: 0;
}

.card-info {
  flex: 1;
  min-width: 0;
}

.doc-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--foreground);
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.doc-meta {
  font-size: 12px;
  color: var(--muted-foreground);
  display: block;
  margin-top: 2px;
}

.card-expand {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: var(--size-control-sm);
  border: none;
  background: none;
  color: var(--muted-foreground);
  cursor: pointer;
  border-radius: var(--radius-sm);
  flex-shrink: 0;
}

@media (hover: hover) and (pointer: fine) {
  .card-expand:hover {
    background: var(--card-elevated);
  }
}

/* 分块预览 */
.card-chunks {
  border-top: 1px solid var(--border);
  max-height: 300px;
  overflow-y: auto;
  padding: 8px;
  background: var(--background);
}

.chunk-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px;
  border-bottom: 1px solid var(--border);
  font-size: 12px;
  line-height: 1.5;
}

.chunk-item:last-child {
  border-bottom: none;
}

.chunk-index {
  color: var(--muted-foreground);
  font-weight: 600;
  flex-shrink: 0;
  min-width: 28px;
}

.chunk-content {
  flex: 1;
  color: var(--foreground);
  word-break: break-word;
  max-height: 60px;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
}

.chunk-tokens {
  color: var(--muted-foreground);
  font-size: 11px;
  flex-shrink: 0;
}

/* 卡片操作 */
.card-actions {
  display: flex;
  justify-content: flex-end;
  padding: 8px 12px;
  border-top: 1px solid var(--border);
}

.card-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: none;
  background: none;
  font-size: 12px;
  cursor: pointer;
  border-radius: var(--radius-sm);
  color: var(--muted-foreground);
  transition: background-color 0.15s, color 0.15s;
}

@media (hover: hover) and (pointer: fine) {
  .delete-btn:hover {
    background: color-mix(in srgb, var(--error) 10%, transparent);
    color: var(--error-fg);
  }
}
</style>
