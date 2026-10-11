<script setup lang="ts">
/**
 * StepFlow —步骤序列原语（G 层，UX_IA_GUIDED_FLOW_DESIGN_2026-10-07.md §3.4 第 5 条）
 *
 * 为什么一个组件要伺候两种样子：
 * - 任务中心（`GuidedTasksCard`）里"任务的步骤"是一份**清单**：每步一句说明 + 一个跳转，
 *   没有"当前在第几步"；这段清单原先在主清单与进阶清单里**各写了一遍**（约 15 行 × 2）。
 * - 新建会话弹窗里是一个**向导**：圆点 + 连接线 + 当前步标签。
 * 两者共用 `common.step` / `prereq.done` 这些键，也共用"第几步"这个概念，
 * 分成两个组件只会让"步骤"这件事在界面上长得不一样。
 *
 * 模式判定：传了 `current` 就是向导，没传就是清单——不给调用方第二个开关去选错。
 *
 * 键盘：向导模式只接管 ← / →（并 preventDefault），Up/Down/Home/End 一律放行。
 * 设置页的 tablist 抢这四个键做分类切换（`SettingsView.handleCategoryKeydown`），
 * 处理器挂在自身根节点上，焦点不在本组件内时根本不会触发，因此不会互相抢。
 */
import { computed } from 'vue';
import { t, type MessageKey } from '@/i18n';

export interface StepFlowItem {
  id: string;
  /** 步骤说明文案键 */
  labelKey: MessageKey;
  /** 右侧动作按钮文案键（清单模式；不传则不渲染按钮） */
  actionKey?: MessageKey;
  /** 已完成时显示的标记（清单模式） */
  done?: boolean;
  /**
   * 没有动作可点、又还没完成时的静态说明键（清单模式）。
   * 用在"可选步骤"上：不给这句话的话，界面上就只剩一行字，
   * 用户分不清"这步没按钮是因为已经做完了"还是"这步本来就不用做"。
   */
  noteKey?: MessageKey;
  /** 语义跳转标记，供 e2e/单测定位（与 data-rel-jump 同一套约定） */
  dataRelJump?: string;
}

const props = defineProps<{
  items: StepFlowItem[];
  /** 整组的可读名字（不叫 aria-* ：模板类型检查会把 aria- 前缀当 ARIA 属性而不是 prop） */
  labelKey: MessageKey;
  /** 1-based；传了即向导模式 */
  current?: number;
}>();

const emit = defineEmits<{
  action: [item: StepFlowItem];
  change: [current: number];
}>();

const wizard = computed(() => typeof props.current === 'number');
const currentIndex = computed(() => (props.current ?? 1) - 1);
const currentItem = computed(() => props.items[currentIndex.value] ?? null);

function onKeydown(event: KeyboardEvent): void {
  if (!wizard.value) return;
  const total = props.items.length;
  if (total < 2) return;
  const now = props.current ?? 1;
  if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
    event.preventDefault();
    const delta = event.key === 'ArrowRight' ? 1 : -1;
    // 到边界就停住，不循环：向导步骤有先后语义，循环会让人以为可以跳步
    const next = Math.min(total, Math.max(1, now + delta));
    if (next !== now) emit('change', next);
  }
}
</script>

<template>
  <!-- 向导模式：圆点 + 连接线 + 当前步标签 -->
  <div
    v-if="wizard"
    class="step-flow step-flow--wizard"
    role="group"
    :aria-label="t(labelKey)"
    @keydown="onKeydown"
  >
    <template v-for="(item, idx) in items" :key="item.id">
      <span v-if="idx > 0" class="step-flow-line" :class="{ active: idx <= currentIndex }" aria-hidden="true" />
      <span
        class="step-flow-dot"
        :class="{ active: idx <= currentIndex, current: idx === currentIndex }"
        :aria-current="idx === currentIndex ? 'step' : undefined"
      >{{ idx + 1 }}</span>
    </template>
    <span v-if="currentItem" class="step-flow-label">{{ t(currentItem.labelKey) }}</span>
  </div>

  <!-- 清单模式：编号 + 说明 + 动作/已完成 -->
  <ol v-else class="step-flow step-flow--checklist" role="list">
    <li
      v-for="(item, idx) in items"
      :key="item.id"
      class="step-flow-row"
      :class="{ done: item.done }"
    >
      <span class="step-flow-no" aria-hidden="true">{{ idx + 1 }}</span>
      <span class="step-flow-text">{{ t(item.labelKey) }}</span>
      <button
        v-if="item.actionKey"
        type="button"
        class="step-flow-action"
        :data-rel-jump="item.dataRelJump"
        @click="emit('action', item)"
      >
        {{ t(item.actionKey) }}
      </button>
      <span v-else-if="item.done" class="step-flow-done">{{ t('prereq.done') }}</span>
      <span v-else-if="item.noteKey" class="step-flow-note">{{ t(item.noteKey) }}</span>
    </li>
  </ol>
</template>

<style scoped>
.step-flow--wizard {
  display: flex;
  align-items: center;
  gap: var(--gap-inline-sm);
  margin-bottom: var(--space-1);
}

.step-flow-dot {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--size-control-xs);
  height: var(--size-control-xs);
  border: var(--size-border-thin) solid var(--border);
  border-radius: var(--radius-circle);
  background: var(--card-elevated);
  color: var(--muted-foreground);
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
}

.step-flow-dot.active {
  background: var(--primary);
  border-color: var(--primary);
  color: var(--on-primary);
}

.step-flow-line {
  width: var(--space-7);
  height: var(--size-border-thick);
  background: var(--border);
  transition: background-color var(--duration-normal) var(--ease-standard);
}

.step-flow-line.active {
  background: var(--primary);
}

.step-flow-label {
  margin-left: var(--space-1);
  font-size: var(--font-size-sm);
  color: var(--foreground);
}

.step-flow--checklist {
  display: flex;
  flex-direction: column;
  /* 6px 在 4px 基准尺上没有对应档位（尺度里有 4/8/12，没有 6）——试点登记进"尺度缺口"表 */
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.step-flow-row {
  display: flex;
  align-items: center;
  gap: var(--gap-inline-sm);
  font-size: var(--font-size-sm);
  color: var(--foreground);
}

.step-flow-no {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  /* 18px 同样不在控件尺寸阶（24/28/36/44）上，见尺度缺口表 */
  width: 18px;
  height: 18px;
  border-radius: var(--radius-circle);
  /* 原来是 var(--muted)：该变量全仓无定义 ⇒ 这圈底其实一直没画出来。
     换成 --card-elevated 是**有意的视觉变化**，试点用它说明"迁移会顺带显形死引用"。 */
  background: var(--card-elevated);
  color: var(--muted-foreground);
  font-family: var(--font-mono);
  font-size: var(--font-size-2xs);
}

.step-flow-row.done .step-flow-no {
  background: var(--secondary);
  color: var(--on-accent);
}

.step-flow-text {
  flex: 1;
  min-width: 0;
}

.step-flow-row.done .step-flow-text {
  color: var(--muted-foreground);
  text-decoration: line-through;
}

.step-flow-action {
  flex-shrink: 0;
  /* 实测 22px 高时移动端几乎点不中（WCAG 2.2 最小目标 24×24 CSS px 都不达标）；
     30px 不在控件尺寸阶上，见尺度缺口表 */
  min-height: 30px;
  /* 10px 也不在阶上（4/8/12），保留字面量并登记 */
  padding: var(--space-1) 10px;
  border: var(--size-border-thin) solid var(--secondary);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--secondary);
  font-size: var(--font-size-xs);
  cursor: pointer;
}

.step-flow-done {
  flex-shrink: 0;
  font-size: var(--font-size-xs);
  color: var(--muted-foreground);
}

.step-flow-note {
  flex-shrink: 0;
  font-size: var(--font-size-xs);
  color: var(--muted-foreground);
}

@media (max-width: 640px) {
  /* 触控目标上的字号提到 16px，避免 iOS 聚焦放大（门禁 i7 同口径） */
  .step-flow-action {
    font-size: var(--font-size-lg);
    min-height: var(--size-control-touch);
  }
}

@media (prefers-reduced-motion: reduce) {
  .step-flow-line {
    transition: none;
  }
}
</style>
