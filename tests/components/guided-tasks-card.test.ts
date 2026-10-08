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
import { useSettingsStore } from '@/stores/settings';
import { useCharacterStore } from '@/stores/character';
import { useLorebookStore } from '@/stores/lorebook';
import { useDataBankStore } from '@/stores/data-bank';
import { setCollapsed, toggleSkip, taskIntent } from '@/core/guided-tasks';

const STATE_KEY = 'ai-roleplay:guided-tasks.v1';

function makeRouter() {  return createRouter({
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

/**
 * 让 t1「配好一个模型」真的完成：Profile 要带全 provider/models/enabled，
 * 且设为当前——`modelReadiness` 认的是"当前生效的那个"，不是"列表里有一个"。
 * 与 tests/core/guided-tasks.test.ts 用的是同一套夹具。
 */
function completeModelTask(settings: ReturnType<typeof useSettingsStore>): void {
  settings.apiProfiles.push({
    id: 'p1',
    name: 'p',
    provider: 'openai',
    baseUrl: 'http://x',
    apiKey: '',
    models: ['m'],
    enabled: true,
  } as never);
  settings.activeApiProfileId = 'p1';
}

/**
 * 清成"全新用户"的样子：mock 角色/世界书会让 t2·t3 天然完成，
 * 那样"下一条是谁"就随夹具漂移，测不到展开与推进的真实顺序。
 */
function resetToEmptyData(): void {
  useCharacterStore().characters.splice(0, useCharacterStore().characters.length);
  useLorebookStore().lorebooks.splice(0, useLorebookStore().lorebooks.length);
  useDataBankStore().documents.splice(0, useDataBankStore().documents.length);
  const settings = useSettingsStore();
  settings.apiProfiles.splice(0, settings.apiProfiles.length);
}

describe('GuidedTasksCard', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.removeItem(STATE_KEY);
    // 模块级意图状态跨用例存活：显式复位，避免上一条用例的收起/跳过污染断言
    setCollapsed(false);
    for (const id of [...taskIntent().value.skipped]) toggleSkip(id);
    resetToEmptyData();
  });

  it('列出 6 个主任务，进度按"任务"计而不是按"步骤"计', async () => {
    const router = makeRouter();
    await router.push('/guide');
    const wrapper = mount(GuidedTasksCard, { global: { plugins: [router] } });

    const heads = wrapper.findAll('.guided-list')[0]!.findAll('.guided-task-head');
    expect(heads).toHaveLength(6);
    // 顶部数任务、每行数步骤，两处都写"步骤"时用户分不清（实测歧义点）。
    // 进度值不钉死：mock 角色会让 t2/t3 天然完成，这里断的是"口径"。
    expect(wrapper.find('.guided-progress').text()).toBe('已完成 0/6 个任务');
    expect(heads[0]!.find('.guided-task-count').text()).toBe('步骤 0/2');
  });

  it('当前该做的那一条默认展开，不必先点一次才看得到步骤', async () => {
    const router = makeRouter();
    await router.push('/guide');
    const wrapper = mount(GuidedTasksCard, { global: { plugins: [router] } });

    const first = wrapper.find('.guided-task-head');
    expect(first.attributes('aria-expanded')).toBe('true');
    expect(wrapper.findAll('.step-flow-row').length).toBeGreaterThanOrEqual(2);

    // 自动展开的那条也要能收起（比较基准是"当前实际展开项"）
    await first.trigger('click');
    expect(first.attributes('aria-expanded')).toBe('false');
    expect(wrapper.findAll('.step-flow-row')).toHaveLength(0);
  });

  it('展开任务后每个步骤都有说明与动作按钮，动作带来源跳转', async () => {
    const router = makeRouter();
    await router.push('/guide');
    const wrapper = mount(GuidedTasksCard, { global: { plugins: [router] } });

    // t1 是空数据下的当前任务，已自动展开
    const steps = wrapper.findAll('.step-flow-row');
    expect(steps.length).toBeGreaterThanOrEqual(2);

    // 同一条任务里的两个动作不能长一样：实测两步都写"去设置"且跳同一处，
    // 用户无法从按钮上分辨自己该做哪一步。
    const labels = wrapper.findAll('.step-flow-action').map((b) => b.text());
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels).toEqual(['去新增配置', '去设为当前']);

    await wrapper.find('[data-rel-jump="guide-t1-model-profile"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('settings');
    expect(router.currentRoute.value.query).toMatchObject({ cat: 'model', from: '/guide' });
  });

  it('已满足的步骤不再留动作按钮；不能跳的可选步骤给一句"可稍后再做"', async () => {
    completeModelTask(useSettingsStore());

    const router = makeRouter();
    await router.push('/guide');
    const wrapper = mount(GuidedTasksCard, { global: { plugins: [router] } });

    // t1 两步都满足 → 整条完成，默认展开的应是下一条（t2）
    expect(wrapper.find('[data-rel-jump="guide-t1-model"]').attributes('aria-expanded')).toBe('false');
    const t2 = wrapper.find('[data-rel-jump="guide-t2-character"]');
    expect(t2.attributes('aria-expanded')).toBe('true');
    // t2 第 2 步"再导入一张角色卡"没有跳转目标，未完成时不能只剩一行字
    expect(wrapper.find('[data-rel-jump="guide-t2-character-import"]').exists()).toBe(false);
    expect(wrapper.find('.step-flow-note').text()).toBe('可稍后再做');
  });

  it('做完一条任务，收尾给的是"下一步去做什么"，而不是继续提供跳过', async () => {
    completeModelTask(useSettingsStore());

    const router = makeRouter();
    await router.push('/guide');
    const wrapper = mount(GuidedTasksCard, { global: { plugins: [router] } });

    await wrapper.find('[data-rel-jump="guide-t1-model"]').trigger('click');
    const next = wrapper.find('.guided-next');
    expect(next.exists()).toBe(true);
    expect(next.text()).toContain('有第一个角色');
    expect(wrapper.find('.guided-skip').exists()).toBe(false);

    await next.trigger('click');
    expect(wrapper.find('[data-rel-jump="guide-t2-character"]').attributes('aria-expanded')).toBe('true');
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

  it('跳过某个任务不阻塞其它任务，且进度分母随之减少', async () => {
    const router = makeRouter();
    await router.push('/guide');
    const wrapper = mount(GuidedTasksCard, { global: { plugins: [router] } });

    // t1 已自动展开，直接点它的跳过
    await wrapper.find('.guided-skip').trigger('click');
    await flushPromises();

    expect(JSON.parse(String(localStorage.getItem(STATE_KEY))).skipped).toContain('t1-model');
    expect(wrapper.find('.guided-task.skipped').exists()).toBe(true);
    expect(wrapper.find('.guided-progress').text()).toContain('5');

    // 跳过的任务不再算"当前该做"，展开项自动落到下一条
    expect(wrapper.find('[data-rel-jump="guide-t2-character"]').attributes('aria-expanded')).toBe('true');

    await wrapper.find('[data-rel-jump="guide-t1-model"]').trigger('click');
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
