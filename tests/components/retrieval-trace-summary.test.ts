/**
 * 检索命中回显条（C-03）组件契约
 *
 * 与 prompt-trace / event-trace 同三条纪律：没痕迹就整块不渲染（不能留一颗
 * 点了没反应的折叠按钮）；展开后才出明细；明细里给得出"是哪一条"（label）
 * 与"多相关"（分数），但不把整段正文搬进会话。
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import RetrievalTraceSummary from '@/components/chat/RetrievalTraceSummary.vue';
import { t } from '@/i18n';
import type { RetrievalTraceItem } from '@core/retrieval-trace';

const items: RetrievalTraceItem[] = [
  { id: 'memory:a', label: '用户喜欢在下雨天读书', score: 0.912, channel: 'dynamic' },
  { id: 'doc:b', label: '设定集：城市的地下铁网', score: 0.42, channel: 'static' },
];

function mountSummary(props: Record<string, unknown>) {
  setActivePinia(createPinia());
  return mount(RetrievalTraceSummary, { props });
}

/** 明细默认折叠（这是设计，不是缺陷），要看明细的用例先点开 */
async function mountExpanded(props: Record<string, unknown> = { items }) {
  const wrapper = mountSummary(props);
  await wrapper.get('.retrieval-trace-toggle').trigger('click');
  return wrapper;
}

describe('RetrievalTraceSummary', () => {
  it('undefined 与空数组都整块不渲染', () => {
    for (const value of [undefined, []]) {
      const wrapper = mountSummary({ items: value });
      expect(wrapper.find('.retrieval-trace').exists(), `items=${JSON.stringify(value)} 时不该出现回显条`).toBe(false);
    }
  });

  it('折叠态只有一句汇总，展开后才出明细', async () => {
    const wrapper = mountSummary({ items });
    const toggle = wrapper.get('.retrieval-trace-toggle');
    expect(toggle.text()).toContain(t('trace.retrievalSummary', { count: 2 }));
    expect(toggle.attributes('aria-expanded')).toBe('false');
    expect(wrapper.find('.retrieval-trace-list').exists()).toBe(false);

    await toggle.trigger('click');
    expect(toggle.attributes('aria-expanded')).toBe('true');
    const rows = wrapper.findAll('.retrieval-trace-item');
    expect(rows).toHaveLength(2);
    expect(rows[0]!.text()).toContain('用户喜欢在下雨天读书');
    expect(rows[0]!.text()).toContain('0.912');
    expect(rows[1]!.text()).toContain('设定集：城市的地下铁网');
  });

  it('两条通道分别标出"记忆"与"设定"，与注入文本里的标记同一套说法', async () => {
    const wrapper = await mountExpanded();
    const chips = wrapper.findAll('.retrieval-trace-channel').map((c) => c.text());
    expect(chips).toEqual([t('trace.retrievalMemory'), t('trace.retrievalStatic')]);
  });

  it('分数带可读的 aria 标签（光秃秃一个小数，读屏里等于没说）', async () => {
    const wrapper = await mountExpanded();
    const first = wrapper.findAll('.retrieval-trace-score')[0]!;
    expect(first.attributes('aria-label')).toBe(t('trace.retrievalScore', { score: 0.912 }));
  });
});
