<script setup lang="ts">
/**
 * 任务中心卡（G 层，§3.5.2）
 *
 * 三个出现位置：/guide 任务页（主载体）、/more 顶部、/chat 零角色空态。
 * 规则：收起 ≠ 永久消失；跳过某步不阻塞其它步；完成态实时算自真实数据。
 */
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { t, type MessageKey } from '@/i18n';
import Icon from '@/components/common/Icon.vue';
import StepFlow, { type StepFlowItem } from '@/components/common/StepFlow.vue';
import {
  useGuidedTasks,
  guideProgress,
  nextIncompleteTask,
  setCollapsed,
  toggleSkip,
  taskIntent,
  type TaskView,
} from '@/core/guided-tasks';
import { useReadinessJump } from '@/composables/useReadinessJump';

const tasks = useGuidedTasks();
const route = useRoute();
const { pushWithReturn } = useReadinessJump();
const expanded = ref<string | null>(null);
/** 用户手动开合过之后，就不再自动跳展开项（否则读到一半列表自己动） */
const userPicked = ref(false);
const showAdvanced = ref(false);

/**
 * 任务步骤 → StepFlow 条目。三态要各自有交代：
 * - 未完成且能跳 → 动作按钮；
 * - 已完成 → 只留"已满足"，**不再留按钮**（原来做完还挂着"去设置"，等于让用户怀疑自己没做对）；
 * - 未完成又不能跳（可选步骤） → 一句"可稍后再做"，不能让这行什么都不显示，
 *   否则用户分不清"不用做"和"没渲染出来"。
 */
function stepItems(task: TaskView): StepFlowItem[] {
  return task.steps.map((step) => ({
    id: step.id,
    labelKey: step.hintKey,
    actionKey: step.done || !step.jump ? undefined : step.actionKey,
    noteKey: !step.done && !step.jump ? 'guide.actionOrSkip' : undefined,
    done: step.done,
    dataRelJump: `guide-${task.id}-${step.id}`,
  }));
}

/**
 * 步骤动作：按 dataRelJump（`guide-<task>-<step>`，全局唯一）找回那一跳。
 * 用直接函数引用而不是行内闭包，模板里每处都能省掉 task 参数。
 */
function onStepAction(item: StepFlowItem): void {
  for (const task of tasks.value) {
    const step = task.steps.find((s) => `guide-${task.id}-${s.id}` === item.dataRelJump);
    if (step?.jump) {
      pushWithReturn(step.jump);
      return;
    }
  }
}

const progress = computed(() => guideProgress(tasks.value));
const mainTasks = computed(() => tasks.value.filter((task) => !task.advanced));
const advancedTasks = computed(() => tasks.value.filter((task) => task.advanced));
// 收起状态来自持久化意图（而不是仅本组件的 props），这样"收起"在三个出现位置一致
const collapsed = computed(() => taskIntent().value.collapsed);

const STEPS_ARIA: MessageKey = 'guide.stepsAria';

/** 默认展开"当前该做的那一条"：进页面就能看到步骤与动作，而不是一排标题 */
const autoOpenId = computed(() => nextIncompleteTask(tasks.value)?.id ?? null);
const openId = computed(() => (userPicked.value ? expanded.value : autoOpenId.value));
function isOpen(id: string): boolean {
  return openId.value === id;
}

/** 做完一条，把它接下一条：进度条不会告诉用户"现在去哪"，这句会 */
const nextOf = computed<Map<string, TaskView>>(() => {
  const open = tasks.value.filter((task) => !task.advanced && !task.skipped);
  const map = new Map<string, TaskView>();
  open.forEach((task, idx) => {
    const following = open[idx + 1];
    if (task.complete && following && !following.complete) map.set(task.id, following);
  });
  return map;
});

function goToNext(taskId: string): void {
  const next = nextOf.value.get(taskId);
  if (!next) return;
  userPicked.value = true;
  expanded.value = next.id;
}

function toggleExpand(id: string): void {
  // 先取"当前实际展开的是谁"：userPicked 一翻，openId 就改读 expanded 了，
  // 之后再比就会永远判成"没开着"，点自动展开的那条收不起来。
  const wasOpen = openId.value === id;
  userPicked.value = true;
  expanded.value = wasOpen ? null : id;
}

/** 「打开任务清单」在 /guide 上是原地跳转（被 router 的重复导航吞掉），不再渲染 */
const onGuidePage = computed(() => route.name === 'guide');

function openGuidePage(): void {
  pushWithReturn({ name: 'guide' });
}
</script>

<template>
  <section class="guided-card" :aria-label="t('guide.aria')">
    <header class="guided-header">
      <div class="guided-heading">
        <Icon name="compass" :size="16" aria-hidden="true" />
        <h2 class="guided-title">{{ t('guide.title') }}</h2>
        <span class="guided-progress">{{ t('guide.tasksProgress', { current: progress.done, total: progress.total }) }}</span>
      </div>
      <button
        type="button"
        class="guided-toggle"
        :aria-expanded="!collapsed"
        @click="setCollapsed(!collapsed)"
      >
        {{ collapsed ? t('guide.expand') : t('guide.collapse') }}
      </button>
    </header>

    <p v-if="collapsed" class="guided-collapsed-hint">{{ t('guide.collapsedHint') }}</p>

    <ul v-else class="guided-list" role="list">
      <li
        v-for="task in mainTasks"
        :key="task.id"
        class="guided-task"
        :class="{ complete: task.complete, skipped: task.skipped }"
      >
        <button
          type="button"
          class="guided-task-head"
          :aria-expanded="isOpen(task.id)"
          :data-rel-jump="`guide-${task.id}`"
          @click="toggleExpand(task.id)"
        >
          <Icon :name="task.complete ? 'check' : 'info'" :size="15" aria-hidden="true" />
          <span class="guided-task-title">{{ t(task.titleKey) }}</span>
          <span class="guided-task-count">{{ t('common.step', { current: task.doneCount, total: task.totalCount }) }}</span>
        </button>

        <div v-if="isOpen(task.id)" class="guided-task-body">
          <p class="guided-why">{{ t(task.whyKey) }}</p>
          <StepFlow
            :items="stepItems(task)"
            :label-key="STEPS_ARIA"
            @action="onStepAction"
          />
          <!-- 完成的义务不该再留"跳过"，该留的是下一步去哪 -->
          <div v-if="task.complete && nextOf.get(task.id)" class="guided-foot-row">
            <button type="button" class="guided-next" @click="goToNext(task.id)">
              <span>{{ t('guide.nextTaskLabel') }}</span>
              <span class="guided-next-title">{{ t(nextOf.get(task.id)!.titleKey) }}</span>
              <Icon name="chevron-right" :size="13" aria-hidden="true" />
            </button>
          </div>
          <button v-else-if="!task.complete" type="button" class="guided-skip" @click="toggleSkip(task.id)">
            {{ task.skipped ? t('guide.unskip') : t('guide.skip') }}
          </button>
        </div>
      </li>
    </ul>

    <div v-if="!collapsed" class="guided-advanced">
      <button type="button" class="guided-advanced-toggle" :aria-expanded="showAdvanced" @click="showAdvanced = !showAdvanced">
        {{ showAdvanced ? t('guide.hideAdvanced') : t('guide.showAdvanced') }}
      </button>
      <ul v-if="showAdvanced" class="guided-list" role="list">
        <li v-for="task in advancedTasks" :key="task.id" class="guided-task" :class="{ complete: task.complete }">
          <button
            type="button"
            class="guided-task-head"
            :aria-expanded="isOpen(task.id)"
            :data-rel-jump="`guide-${task.id}`"
            @click="toggleExpand(task.id)"
          >
            <Icon :name="task.complete ? 'check' : 'info'" :size="15" aria-hidden="true" />
            <span class="guided-task-title">{{ t(task.titleKey) }}</span>
            <span class="guided-task-count">{{ t('common.step', { current: task.doneCount, total: task.totalCount }) }}</span>
          </button>
          <div v-if="isOpen(task.id)" class="guided-task-body">
            <p class="guided-why">{{ t(task.whyKey) }}</p>
            <StepFlow
              :items="stepItems(task)"
              :label-key="STEPS_ARIA"
              @action="onStepAction"
            />
          </div>
        </li>
      </ul>
    </div>

    <p v-if="!collapsed && progress.done === progress.total" class="guided-finished" role="status">
      {{ t('guide.finished') }}
      <button v-if="!onGuidePage" type="button" class="guided-step-action" @click="openGuidePage">
        {{ t('guide.openPage') }}
      </button>
    </p>
  </section>
</template>

<style scoped>
.guided-card {
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md, 12px);
  background: var(--card);
}

.guided-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.guided-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.guided-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--foreground);
}

.guided-progress {
  font-size: 13px;
  color: var(--muted-foreground);
}

.guided-toggle,
.guided-advanced-toggle,
.guided-skip,
.guided-next,
.guided-step-action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 30px;
  padding: 4px 12px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: transparent;
  color: var(--muted-foreground);
  font-size: 13px;
  cursor: pointer;
}

.guided-list {
  list-style: none;
  margin: 10px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.guided-task-head {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  /* 实测行高 31px 时，移动端一排任务几乎要靠猜才点得中 */
  min-height: 40px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm, 8px);
  background: transparent;
  color: var(--foreground);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

@media (hover: hover) {
  .guided-task-head:hover,
  .guided-toggle:hover,
  .guided-advanced-toggle:hover,
  .guided-skip:hover {
    border-color: var(--secondary);
  }
}

.guided-task.complete .guided-task-head {
  color: var(--muted-foreground);
}

.guided-task.skipped .guided-task-title {
  text-decoration: line-through;
}

.guided-task-title {
  flex: 1 1 auto;
  min-width: 0;
  /* 标题 14/600、计数 12 常规：原来两者同为 13px，眼睛先看到数字再看到任务名 */
  font-size: 14px;
  font-weight: 600;
}

.guided-task-count {
  font-size: 12px;
  font-weight: 400;
  color: var(--muted-foreground);
}

.guided-task-body {
  padding: 8px 8px 10px 30px;
}

.guided-why {
  margin: 0 0 6px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--muted-foreground);
}

/* 「打开任务清单」那颗按钮的配色（尺寸已在分组选择器里给过） */
.guided-step-action {
  border-color: var(--secondary);
  color: var(--secondary);
}

.guided-foot-row {
  margin-top: 10px;
}

.guided-next {
  border-color: var(--secondary);
  color: var(--secondary);
}

.guided-next-title {
  font-weight: 600;
}

.guided-skip {
  margin-top: 10px;
}

.guided-advanced {
  margin-top: 10px;
}

.guided-collapsed-hint,
.guided-finished {
  margin: 8px 0 0;
  font-size: 13px;
  color: var(--muted-foreground);
}

.guided-finished {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--foreground);
}

@media (max-width: 640px) {
  .guided-task-head,
  .guided-toggle,
  .guided-advanced-toggle,
  .guided-skip,
  .guided-next,
  .guided-step-action {
    min-height: 44px;
  }
}

:focus-visible {
  outline: 2px solid var(--ring, var(--secondary));
  outline-offset: 1px;
}
</style>
