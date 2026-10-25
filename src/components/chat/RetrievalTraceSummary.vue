<script setup lang="ts">
/**
 * 本轮检索命中回显（C-03 记忆可见化第一步）
 *
 * 世界书与随机事件那两条回显已经把"配了但看不见"收掉了，检索这条更彻底：
 * `buildVectorRagInjection` 本来就返回了 `hits`（id + 分数 + 通道），调用方只取了
 * `text`，所以"这轮到底检索到了什么"连调试界面都答不上来。
 *
 * 与前两条同纪律：只报"注入了"，不报"模型采纳了"（后者无法从界面证明）。
 * 三路来源的分数口径不同，所以明面上只给"是哪条 + 哪一路"，原始分数放在悬停提示里。
 * label 是注入文本的开头 40 字（记忆事实没有标题字段，这是唯一能认出"是哪一条"的东西），
 * 条数与长度都在 `retrieval-trace.ts` 里封顶。
 */
import { ref, computed } from 'vue';
import { t } from '@/i18n';
import Icon from '@/components/common/Icon.vue';
import type { RetrievalTraceItem } from '@core/retrieval-trace';

const props = defineProps<{ items?: RetrievalTraceItem[] }>();

/** 三路检索在界面上的叫法，与注入文本里的标记一致（[记忆] / 资料 / 设定） */
const sourceLabel = (source: RetrievalTraceItem['source']): string =>
  source === 'memory'
    ? t('trace.retrievalMemory')
    : source === 'document'
      ? t('trace.retrievalDocument')
      : t('trace.retrievalLore');

const open = ref(false);
const list = computed(() => props.items ?? []);
</script>

<template>
  <div v-if="list.length" class="retrieval-trace">
    <button
      type="button"
      class="retrieval-trace-toggle"
      :aria-expanded="open"
      data-rel-jump="retrieval-trace-toggle"
      @click="open = !open"
    >
      <Icon name="search" :size="13" aria-hidden="true" />
      <span>{{ t('trace.retrievalSummary', { count: list.length }) }}</span>
      <Icon :name="open ? 'chevron-up' : 'chevron-down'" :size="13" aria-hidden="true" />
    </button>

    <ul v-if="open" class="retrieval-trace-list" role="list">
      <!-- 界面上不给分数：三路打分口径不同（相似度 / 关键词命中数 / 精确度加权），并排显示
           "0.912" 与 "2" 会让读者误以为 2 更相关；顺序已经表达了"谁更靠前"。分数仍随消息落盘，
           供诊断用。也刻意不用原生 title（本项目有无障碍守卫：非交互元素不许挂 title）。 -->
      <li v-for="item in list" :key="item.id" class="retrieval-trace-item">
        <span class="retrieval-trace-channel">{{ sourceLabel(item.source) }}</span>
        <span class="retrieval-trace-label">{{ item.label }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
/* 排版与 prompt-trace / event-trace 同款：三条回显并排出现时必须看起来是一类东西 */
.retrieval-trace {
  margin-top: 6px;
}

.retrieval-trace-toggle {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 8px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: transparent;
  color: var(--muted-foreground);
  font-size: 13px;
  cursor: pointer;
}

@media (hover: hover) and (pointer: fine) {
  .retrieval-trace-toggle:hover {
    color: var(--foreground);
    border-color: var(--secondary);
  }
}

.retrieval-trace-toggle:focus-visible {
  outline: 2px solid var(--ring, var(--secondary));
  outline-offset: 1px;
}

.retrieval-trace-list {
  list-style: none;
  margin: 6px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.retrieval-trace-item {
  display: flex;
  align-items: baseline;
  gap: 6px;
  flex-wrap: wrap;
  font-size: 13px;
  color: var(--muted-foreground);
}

.retrieval-trace-channel {
  padding: 1px 7px;
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--secondary-text);
  font-size: 13px;
}

.retrieval-trace-label {
  color: var(--foreground);
}
</style>
