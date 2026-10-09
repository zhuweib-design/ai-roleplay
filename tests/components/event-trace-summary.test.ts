/**
 * 随机事件回显条（E11）组件契约
 *
 * 三条：没痕迹就整块不渲染（不能留一颗点了没反应的折叠按钮）；
 * 展开后只出现名字与去处，**不出现事件正文**；跳转带来源，能回这一页。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import EventTraceSummary from '@/components/chat/EventTraceSummary.vue';
import { t } from '@/i18n';
import type { EventTraceItem } from '@core/event-trace';

const items: EventTraceItem[] = [
  { eventId: 'rand-evt-1', name: '集市上的骚动' },
  { eventId: 'rand-evt-2', name: '城门盘查', sceneName: '黄昏集市' },
];

async function mountSummary(props: Record<string, unknown>) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/chat', name: 'chat', component: { template: '<div />' } },
      { path: '/random-events', name: 'random-events', component: { template: '<div />' } },
    ],
  });
  await router.push('/chat');
  const wrapper = mount(EventTraceSummary, { props, global: { plugins: [router] } });
  return { wrapper, router };
}

beforeEach(() => {
  setActivePinia(createPinia());
});

describe('EventTraceSummary', () => {
  it('没有痕迹时整块不渲染', async () => {
    const { wrapper } = await mountSummary({ items: undefined });
    expect(wrapper.find('.event-trace').exists()).toBe(false);

    const empty = await mountSummary({ items: [] });
    expect(empty.wrapper.find('.event-trace').exists()).toBe(false);
  });

  it('默认收起，只给一句计数；展开后出现事件名与场景标签', async () => {
    const { wrapper } = await mountSummary({ items });
    const toggle = wrapper.find('.event-trace-toggle');

    expect(toggle.text()).toContain(t('trace.eventsSummary', { count: 2 }));
    expect(toggle.attributes('aria-expanded')).toBe('false');
    expect(wrapper.find('.event-trace-list').exists()).toBe(false);

    await toggle.trigger('click');
    expect(wrapper.find('.event-trace-list').exists()).toBe(true);
    expect(wrapper.findAll('.event-trace-name').map((n) => n.text())).toEqual([
      '集市上的骚动',
      '城门盘查',
    ]);
    expect(wrapper.find('.event-trace-scene').text()).toBe('黄昏集市');
  });

  it('点去处跳到随机事件页并留下来源，可回这一页', async () => {
    const { wrapper, router } = await mountSummary({ items });
    await wrapper.find('.event-trace-toggle').trigger('click');
    await wrapper.find('.event-trace-link').trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.name).toBe('random-events');
    expect(router.currentRoute.value.query.from).toBe('/chat');
  });

  it('只读渲染不抛错（items 少字段时也只是不显示对应片段）', async () => {
    const { wrapper } = await mountSummary({ items: [{ eventId: 'x', name: '只有名字' }] });
    await wrapper.find('.event-trace-toggle').trigger('click');
    expect(wrapper.find('.event-trace-scene').exists()).toBe(false);
    expect(wrapper.text()).toContain('只有名字');
  });
});
