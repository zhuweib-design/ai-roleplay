/**
 * StepFlow 原语（M3-b1）
 *
 * 要守的是它同时服务两种场景时各自不能塌：
 * - 向导模式：`aria-current="step"` 只落在当前一步；←/→ 换步；**到边界不循环**
 *   （循环会让人以为可以跳步）；Up/Down/Home/End 一个都不接管，
 *   因为设置页的 tablist 用这四个键切分类，同屏时会抢。
 * - 清单模式：只有真的能跳的步才出现按钮（`jump` 为 null 的步不显示），
 *   否则就是本项目撤掉过的那类"点了没反应"的死控件。
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import StepFlow, { type StepFlowItem } from '@/components/common/StepFlow.vue';
import { t } from '@/i18n';

const ITEMS: StepFlowItem[] = [
  { id: 'a', labelKey: 'newConv.stepType' },
  { id: 'b', labelKey: 'newConv.stepSelectChar' },
];

function mountWizard(current = 1) {
  return mount(StepFlow, {
    props: { items: ITEMS, labelKey: 'newConv.stepAria', current },
  });
}

describe('向导模式', () => {
  it('渲染圆点与连接线，当前步带 aria-current="step"', () => {
    const wrapper = mountWizard(2);
    const dots = wrapper.findAll('.step-flow-dot');

    expect(dots).toHaveLength(2);
    expect(dots[0]!.attributes('aria-current')).toBeUndefined();
    expect(dots[1]!.attributes('aria-current')).toBe('step');
    expect(wrapper.findAll('.step-flow-line')).toHaveLength(1);
    expect(wrapper.find('.step-flow-label').text()).toBe(t('newConv.stepSelectChar'));
  });

  it('整组有可读名字（role=group + aria-label）', () => {
    const group = mountWizard(1).find('.step-flow--wizard');
    expect(group.attributes('role')).toBe('group');
    expect(group.attributes('aria-label')).toBe(t('newConv.stepAria'));
  });

  /**
   * current 是**受控 prop**（组件不自己记步数），所以每条按键都从固定起点挂载，
   * 换步由调用方改 current 再渲染——这也是 NewConversationModal 里 onStepChange
   * 仍然要过 canNext 的原因。
   */
  function press(wrapper: ReturnType<typeof mountWizard>, key: string): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    wrapper.find('.step-flow--wizard').element.dispatchEvent(event);
    return event;
  }

  it('第 1 步按 → 请求前进到 2；第 2 步按 ← 请求退回 1', () => {
    const forward = mountWizard(1);
    press(forward, 'ArrowRight');
    expect(forward.emitted('change')?.at(-1)).toEqual([2]);

    const backward = mountWizard(2);
    press(backward, 'ArrowLeft');
    expect(backward.emitted('change')?.at(-1)).toEqual([1]);
  });

  it('到边界不越界（第一步按 ← 、最后一步按 → 都不 emit）', () => {
    const first = mountWizard(1);
    press(first, 'ArrowLeft');
    expect(first.emitted('change')).toBeUndefined();

    const last = mountWizard(2);
    press(last, 'ArrowRight');
    expect(last.emitted('change')).toBeUndefined();
  });

  it('不接管 Up/Down/Home/End，也不 preventDefault（让给同页的 tablist）', () => {
    for (const key of ['ArrowUp', 'ArrowDown', 'Home', 'End']) {
      const wrapper = mountWizard(1);
      const event = press(wrapper, key);
      expect(wrapper.emitted('change'), `${key} 不该被当成换步`).toBeUndefined();
      expect(event.defaultPrevented, `${key} 不该被 StepFlow 吞掉`).toBe(false);
    }
  });

  it('←/→ 会 preventDefault，避免页面横向滚动', () => {
    const wrapper = mountWizard(1);
    const event = press(wrapper, 'ArrowRight');
    expect(event.defaultPrevented).toBe(true);
  });
});

describe('清单模式', () => {
  const CHECKLIST: StepFlowItem[] = [
    { id: 's1', labelKey: 'guide.t1.stepProfile', actionKey: 'guide.openPage', done: false, dataRelJump: 'x-s1' },
    { id: 's2', labelKey: 'guide.t1.stepActive', done: true },
  ];

  function mountChecklist() {
    return mount(StepFlow, { props: { items: CHECKLIST, labelKey: 'guide.stepsAria' } });
  }

  it('不渲染 aria-current（清单没有"当前步"语义）', () => {
    const wrapper = mountChecklist();
    expect(wrapper.find('[aria-current]').exists()).toBe(false);
    expect(wrapper.findAll('.step-flow-row')).toHaveLength(2);
  });

  it('有动作的步行尾是按钮并带定位标记，没动作的已完成步只显示"已满足"', () => {
    const wrapper = mountChecklist();
    const rows = wrapper.findAll('.step-flow-row');

    expect(rows[0]!.find('button.step-flow-action').exists()).toBe(true);
    expect(rows[0]!.find('[data-rel-jump="x-s1"]').text()).toBe(t('guide.openPage'));
    expect(rows[1]!.find('button').exists()).toBe(false);
    expect(rows[1]!.find('.step-flow-done').text()).toBe(t('prereq.done'));
  });

  it('点动作按钮 emit 出对应条目（跳转由调用方决定）', async () => {
    const wrapper = mountChecklist();
    await wrapper.find('.step-flow-action').trigger('click');
    expect(wrapper.emitted('action')?.at(-1)).toEqual([CHECKLIST[0]]);
  });
});
