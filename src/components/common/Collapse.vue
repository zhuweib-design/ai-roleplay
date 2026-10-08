<script setup lang="ts">
/**
 * Collapse —可折叠段（V 层，§3.6.4「常规/高级折叠」）
 *
 * 抽出来的理由：角色编辑器里"属性"那一段早就自己写了一套
 * （`aria-expanded` 的按钮 + `v-show` 的面板，`CharacterEditorView.vue:968-996`），
 * 设置页三个面板里的高级段却全是常驻展开——「外观」的界面自定义、
 * 「数据」的四段运维项、「模型接入」的高级采样，跟每天要用的东西平起平坐。
 * 这个组件把那套写法标准化，并强制两件事：
 * - 折叠用 `v-show` 而不是 `v-if`：面板里的草稿状态（输入到一半的自定义 CSS、
 *   选了一半的采样参数）不能因为收起就丢；
 * - 触发器是 `<h2>/<h3>` 里的真按钮，带 `aria-expanded` + `aria-controls`，
 *   标题层级不变，所以页面的 heading 顺序不会因为折叠而跳跃。
 *
 * 说明文字（hintKey）刻意放在面板外面：收起时用户仍要知道这一段是什么、
 * 为什么默认收着，否则折叠就变成了"藏东西"。
 */
import { computed, ref } from 'vue';
import { t, type MessageKey } from '@/i18n';
import Icon from '@/components/common/Icon.vue';
import type { IconName } from '@/components/common/icons';

const props = withDefaults(
  defineProps<{
    titleKey: MessageKey;
    hintKey?: MessageKey;
    /** 段标题前的图标 */
    icon?: IconName;
    /** 默认是否展开；高级段传 false */
    defaultOpen?: boolean;
    /** 标题层级：设置页各段是 2，块内小段是 3 */
    level?: 2 | 3;
    /** 标成"高级"：给一句为什么默认收起 */
    advanced?: boolean;
    /** 去掉卡片外观：用在表单/弹窗内部，作为一段分组标题而不是又一张卡 */
    plain?: boolean;
  }>(),
  { hintKey: undefined, icon: undefined, defaultOpen: true, level: 2, advanced: false, plain: false }
);

const open = ref(props.defaultOpen);
const uid = `collapse-${Math.random().toString(36).slice(2, 8)}`;
const titleId = computed(() => `${uid}-title`);
const panelId = computed(() => `${uid}-panel`);
</script>

<template>
  <section
    class="collapse-section"
    :class="{ 'is-collapsed': !open, 'is-plain': plain }"
    :aria-labelledby="titleId"
  >
    <component :is="`h${level}`" :id="titleId" class="collapse-heading">
      <button
        type="button"
        class="collapse-toggle"
        :aria-expanded="open"
        :aria-controls="panelId"
        @click="open = !open"
      >
        <Icon v-if="icon" :name="icon" :size="16" aria-hidden="true" />
        <span class="collapse-title">{{ t(titleKey) }}</span>
        <span v-if="advanced" class="collapse-advanced-tag">{{ t('common.advanced') }}</span>
        <Icon class="collapse-chevron" name="chevron-down" :size="16" aria-hidden="true" />
      </button>
    </component>
    <p v-if="hintKey" class="collapse-hint">{{ t(hintKey) }}</p>

    <!-- v-show：折叠不能丢草稿（自定义 CSS、选一半的采样参数） -->
    <div v-show="open" :id="panelId" class="collapse-panel">
      <slot />
    </div>
  </section>
</template>

<style scoped>
/* 与设置页各段（.settings-section）同一张卡片外观，折叠段才不会被看成另一种东西 */
.collapse-section {
  padding: 20px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
}

.collapse-heading {
  margin: 0;
  font-size: inherit;
  font-weight: inherit;
}

.collapse-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 0;
  border: none;
  background: none;
  color: var(--foreground);
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
  border-radius: var(--radius-sm);
}

.collapse-title {
  flex: 0 1 auto;
}

.collapse-chevron {
  margin-left: auto;
  flex: 0 0 auto;
  color: var(--muted-foreground);
  transition: transform 0.18s ease;
}

.is-collapsed .collapse-chevron {
  transform: rotate(-90deg);
}

@media (hover: hover) and (pointer: fine) {
  .collapse-toggle:hover .collapse-title {
    color: var(--primary);
  }
}

.collapse-toggle:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 3px;
}

.collapse-advanced-tag {
  flex: 0 0 auto;
  padding: 1px 7px;
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  color: var(--muted-foreground);
  font-size: 11px;
  font-weight: 400;
  letter-spacing: 0;
}

.collapse-hint {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--muted-foreground);
}

.collapse-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}

/* 弹窗/表单内的分组：不是一张新卡片，只是一行可点的标题 */
.is-plain {
  padding: 0;
  background: none;
  border: none;
  border-radius: 0;
}

.is-plain .collapse-toggle {
  font-size: 14px;
}

.is-plain .collapse-hint {
  margin-top: 4px;
}

.is-plain .collapse-panel {
  gap: 12px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed var(--border);
}
</style>
