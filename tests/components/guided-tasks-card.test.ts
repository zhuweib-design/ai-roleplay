/**
 * 任务中心卡的挂载测试（G 层）
 *
 * 重点不是"有没有渲染"，而是三条引导语义：
 * 步骤给出可点的动作；跳过不销毁任何东西；收起后仍能回来。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import GuidedTasksCard from '@/components/common/GuidedTasksCard.vue';
import { setCollapsed, toggleSkip, taskIntent } from '@/core/guided-tasks';

const STATE_KEY = 'ai-roleplay:guided-tasks.v1';

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/guide', name: 'guide', component: { template: '<div />' } },
      { path: '/settings', name: 'settings', component: { template: '<div />' } },
      { path: '/character', name: 'character-list', component: { template: '<div />' } },
      { path: '/character/new', name: 'character-new', component: { template: '<div />' } },
      { path: '/chat', name: 'chat', component: { template: '<div />' } },
      { path: '/worldbook', name: 'worldbook', component: { template: '<div />' } },
      { path: '/databank', name: 'databank', component: { template: '<div />' } },
      { path: '/group', name: 'group', component: { template: '<div />' } },
      { path: '/story', name: 'story', component: { template: '<div />' } },
      { path: '/local-model', name: 'local-model', component: { template: '<div />' } },
    ],
  });
}

describe('GuidedTasksCard', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.removeItem(STATE_KEY);
    // 模块级意图状态跨用例存活：显式复位，避免上一条用例的收起/跳过污染断言
    setCollapsed(false);
    for (const id of [...taskIntent().value.skipped]) toggleSkip(id);
  });

  it('列出 6 个主任务，进度用"步骤 x/6"表述', async () => {
    const router = makeRouter();
    await router.push('/guide');
    const wrapper = mount(GuidedTasksCard, { global: { plugins: [router] } });

    const heads = wrapper.findAll('.guided-list')[0]!.findAll('.guided-task-head');
    expect(heads).toHaveLength(6);
    expect(wrapper.find('.guided-progress').text()).toContain('6');
  });

  it('展开任务后每个步骤都有说明与动作按钮，动作带来源跳转', async () => {
    const router = makeRouter();
    await router.push('/guide');
    const wrapper = mount(GuidedTasksCard, { global: { plugins: [router] } });

    await wrapper.find('[data-rel-jump="guide-t1-model"]').trigger('click');
    // 步骤清单已并入 StepFlow 原语（类名随之变），断言本身不变
    const steps = wrapper.findAll('.step-flow-row');
    expect(steps.length).toBeGreaterThanOrEqual(2);

    await wrapper.find('[data-rel-jump="guide-t1-model-profile"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('settings');
    expect(router.currentRoute.value.query).toMatchObject({ cat: 'model', from: '/guide' });
  });

  it('收起后只剩一句提示，再点展开可回到完整清单（收起不等于结束）', async () => {
    const router = makeRouter();
    await router.push('/guide');
    const wrapper = mount(GuidedTasksCard, { global: { plugins: [router] } });

    await wrapper.find('.guided-toggle').trigger('click');
    await flushPromises();
    expect(wrapper.find('.guided-collapsed-hint').exists()).toBe(true);
    expect(wrapper.find('.guided-list').exists()).toBe(false);
    expect(JSON.parse(String(localStorage.getItem(STATE_KEY))).collapsed).toBe(true);

    await wrapper.find('.guided-toggle').trigger('click');
    await flushPromises();
    expect(wrapper.findAll('.guided-task-head')).toHaveLength(6);
  });

  it('跳过某一步不阻塞其它任务，且进度分母随之减少', async () => {
    const router = makeRouter();
    await router.push('/guide');
    const wrapper = mount(GuidedTasksCard, { global: { plugins: [router] } });

    await wrapper.find('[data-rel-jump="guide-t1-model"]').trigger('click');
    await wrapper.find('.guided-skip').trigger('click');
    await flushPromises();

    expect(JSON.parse(String(localStorage.getItem(STATE_KEY))).skipped).toContain('t1-model');
    expect(wrapper.find('.guided-task.skipped').exists()).toBe(true);
    expect(wrapper.find('.guided-progress').text()).toContain('5');

    await wrapper.find('.guided-skip').trigger('click');
    await flushPromises();
    expect(JSON.parse(String(localStorage.getItem(STATE_KEY))).skipped).toEqual([]);
  });

  it('进阶任务默认折叠在"看进阶玩法"之后', async () => {
    const router = makeRouter();
    await router.push('/guide');
    const wrapper = mount(GuidedTasksCard, { global: { plugins: [router] } });

    expect(wrapper.findAll('.guided-task')).toHaveLength(6);
    await wrapper.find('.guided-advanced-toggle').trigger('click');
    expect(wrapper.findAll('.guided-task')).toHaveLength(9);
  });
});
