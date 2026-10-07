/**
 * promptTrace（E02）的单元与组件测试
 *
 * 关注点：裁剪视图不得泄漏条目正文；旧数据回读不炸；空数组不写盘也不渲染。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import { toPromptTraceItems, type ActivatedEntry } from '@core/lorebook-scanner';
import { uiMsgToChatMsg, chatMsgToUiMsg } from '@/services/type-adapters';
import PromptTraceSummary from '@/components/chat/PromptTraceSummary.vue';
import type { UIMessage } from '@/types';

function activated(over: Partial<ActivatedEntry> = {}): ActivatedEntry {
  return {
    lorebookId: 'lb1',
    lorebookName: '艾泽利亚',
    matchedKeys: ['酒馆'],
    entry: {
      id: 'e1',
      title: '老酒馆',
      keys: ['酒馆', ' inn'],
      content: '一段很长很长的设定正文，不应该出现在界面上。'.repeat(50),
      enabled: true,
      insertionOrder: 0,
      insertionPosition: 'beforeCharDefs',
      depth: 4,
      group: '',
      logic: 'AND_ANY',
    },
    ...over,
  };
}

describe('toPromptTraceItems', () => {
  it('只保留标识与关键词，不带正文', () => {
    const [item] = toPromptTraceItems([activated()]);
    expect(item).toEqual({
      entryId: 'e1',
      bookId: 'lb1',
      bookName: '艾泽利亚',
      title: '老酒馆',
      keys: ['酒馆'],
    });
    expect(JSON.stringify(item)).not.toContain('不应该出现');
  });

  it('未命中关键词时退回条目自身关键词，并截断到 4 个', () => {
    const item = toPromptTraceItems([activated({ matchedKeys: [] })])[0]!;
    expect(item.keys).toEqual(['酒馆', ' inn']);
    const many = toPromptTraceItems([
      activated({ matchedKeys: ['a', 'b', 'c', 'd', 'e', 'f'] }),
    ])[0]!;
    expect(many.keys).toHaveLength(4);
  });

  it('空标题退回条目 ID 前缀；undefined 输入返回空数组', () => {
    const item = toPromptTraceItems([activated({ entry: { ...activated().entry, title: '  ' } })])[0]!;
    expect(item.title).toMatch(/^#e1/);
    expect(toPromptTraceItems(undefined)).toEqual([]);
  });
});

describe('promptTrace 持久化往返', () => {
  const base: UIMessage = {
    id: 'm1',
    role: 'assistant',
    content: '你好，旅人',
    timestamp: 1700000000000,
  };

  it('有痕迹时写入并可回读', () => {
    const ui: UIMessage = { ...base, promptTrace: toPromptTraceItems([activated()]) };
    const chat = uiMsgToChatMsg(ui);
    expect(chat.promptTrace).toHaveLength(1);
    expect(chatMsgToUiMsg(chat)).toMatchObject({ promptTrace: [{ entryId: 'e1', bookName: '艾泽利亚' }] });
  });

  it('空痕迹不写字段，旧数据回读为 undefined（零迁移）', () => {
    expect(uiMsgToChatMsg({ ...base, promptTrace: [] })).not.toHaveProperty('promptTrace');
    expect(uiMsgToChatMsg(base)).not.toHaveProperty('promptTrace');
    expect(chatMsgToUiMsg({ id: 'm1', role: 'assistant', content: 'x', timestamp: '2026-01-01T00:00:00.000Z', swipes: [], swipeIndex: 0 })).not.toHaveProperty(
      'promptTrace'
    );
  });
});

describe('PromptTraceSummary', () => {
  beforeEach(() => {});

  function makeRouter() {
    return createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/chat', name: 'chat', component: { template: '<div />' } },
        { path: '/worldbook', name: 'worldbook', component: { template: '<div />' } },
      ],
    });
  }

  it('无痕迹时不渲染任何东西（不给气泡添噪）', async () => {
    const router = makeRouter();
    await router.push('/chat');
    const wrapper = mount(PromptTraceSummary, { props: { items: [] }, global: { plugins: [router] } });
    expect(wrapper.find('.prompt-trace').exists()).toBe(false);
  });

  it('默认折叠，展开后逐条列出书与条目，点书名为跳世界书并带来源', async () => {
    const router = makeRouter();
    await router.push('/chat');
    const wrapper = mount(PromptTraceSummary, {
      props: { items: toPromptTraceItems([activated()]) },
      global: { plugins: [router] },
    });

    expect(wrapper.find('.trace-toggle').text()).toContain('1 条设定');
    expect(wrapper.find('.trace-item').exists()).toBe(false);

    await wrapper.find('.trace-toggle').trigger('click');
    expect(wrapper.find('.trace-entry').text()).toBe('老酒馆');
    expect(wrapper.find('.trace-keys').text()).toBe('酒馆');

    await wrapper.find('.trace-link').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('worldbook');
    expect(router.currentRoute.value.query.from).toBe('/chat');
  });
});
