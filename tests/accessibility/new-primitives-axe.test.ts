/**
 * 新原语的 axe 审计（M3-b1，§四 验收项"新组件必须过 axe"）
 *
 * 这三个组件会被大量复用，任何一条无障碍违规都会被复制几十遍，
 * 所以它们在进入页面之前就必须先过一遍机器审计。
 * 每种模式都单独审：向导与清单的 DOM 结构不同，只审一种等于没审另一个。
 */
import { describe, it, expect } from 'vitest';
import StepFlow from '@/components/common/StepFlow.vue';
import HelpTip from '@/components/common/HelpTip.vue';
import FormField from '@/components/common/FormField.vue';
import { mountAndAudit, formatViolations } from './axe-helper';
import type { StepFlowItem } from '@/components/common/StepFlow.vue';
import QuickCharacterForm from '@/components/character/QuickCharacterForm.vue';
import QuickLorebookFlow from '@/components/worldbook/QuickLorebookFlow.vue';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

const WIZARD: StepFlowItem[] = [
  { id: 'a', labelKey: 'newConv.stepType' },
  { id: 'b', labelKey: 'newConv.stepSelectChar' },
];
const CHECKLIST: StepFlowItem[] = [
  { id: 's1', labelKey: 'guide.t1.stepProfile', actionKey: 'guide.openPage', done: false },
  { id: 's2', labelKey: 'guide.t1.stepActive', done: true },
];

async function audit(name: string, component: unknown, options: Record<string, unknown>) {
  const results = await mountAndAudit(component as never, options as never);
  if (results.violations.length > 0) {
    console.error(formatViolations(results));
  }
  expect(results.violations, name).toHaveLength(0);
}

describe('StepFlow / HelpTip / FormField 无障碍', () => {
  it('StepFlow 向导模式无违规', async () => {
    await audit('wizard', StepFlow, {
      props: { items: WIZARD, labelKey: 'newConv.stepAria', current: 2 },
    });
  });

  it('StepFlow 清单模式无违规', async () => {
    await audit('checklist', StepFlow, {
      props: { items: CHECKLIST, labelKey: 'guide.stepsAria' },
    });
  });

  it('HelpTip 无违规（含展开态）', async () => {
    await audit('helptip', HelpTip, { props: { textKey: 'ctx.authorTitle', fallback: '作者笔记' } });
  });

  it('FormField 带说明与报错时无违规', async () => {
    await audit('formfield', FormField, {
      props: { labelKey: 'charEdit.nameLabel', hintKey: 'ctx.tokenHint', errorText: '名称为必填项', required: true },
      slots: {
        default: '<input :id="id" :aria-describedby="describedBy" :aria-invalid="String(invalid)" value="" />',
      },
    });
  });

  it('FormField 礼貌播报（polite）形态无违规', async () => {
    // 世界书事件面板的逐字段拒绝反馈用的就是这个形态：role="status" 而非 "alert"。
    // 播报方式一改，关联与命名都要重新过一遍 axe，不能只靠上面那条同构用例。
    await audit('formfield-polite', FormField, {
      props: {
        labelKey: 'wbEvents.keywordLabel',
        hintText: '命中即注入',
        errorText: '未保存：无效的正则表达式：(',
        polite: true,
      },
      slots: {
        default: '<input :id="id" :aria-describedby="describedBy" :aria-invalid="String(invalid)" value="(" />',
      },
    });
  });

  it('角色快速档无违规', async () => {
    setActivePinia(createPinia());
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', name: 'chat', component: { template: '<div />' } },
        { path: '/character', name: 'character-list', component: { template: '<div />' } },
      ],
    });
    await router.push('/');
    await router.isReady();
    const results = await mountAndAudit(QuickCharacterForm as never, {
      global: { plugins: [router] },
    } as never);
    if (results.violations.length > 0) console.error(formatViolations(results));
    expect(results.violations).toHaveLength(0);
  });

  it('世界书三步流程无违规', async () => {
    setActivePinia(createPinia());
    const results = await mountAndAudit(QuickLorebookFlow as never, {} as never);
    if (results.violations.length > 0) console.error(formatViolations(results));
    expect(results.violations).toHaveLength(0);
  });
});
