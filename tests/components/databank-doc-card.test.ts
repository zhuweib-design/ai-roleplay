/**
 * DocCard — 数据银行文档卡片（R4-10 拆分回归）
 *
 * 抽组件前，全局段与角色段的卡片是两份手写模板，其中**展开按钮的点击修饰符
 * 不一致**：全局段 `@click.stop`，角色段 `@click`。后者点击时事件冒泡到父级
 * `.card-header` 的 `@click`，同一 toggle 被调用两次（开 → 关），用户感觉
 * 「按钮没用，只有点卡片头部才行」—— 即 D-8 修过的同一 bug 在角色段复活。
 *
 * 原 e2e（e2e/databank-flow.spec.ts）只上传到一个全局文档，因此永远走全局段
 * 分支，抓不到这个缺陷。本测试直接对组件断言两件事：
 *   1. 点 `.card-expand` 只发出**一次** toggleExpand（冒泡被 .stop 拦住）
 *   2. 点 `.card-header` 发出一次（原有效路径不回归）
 * 另覆盖 meta 第三列的分支口径：character → 角色名，global → 创建时间。
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';

import DocCard from '@/components/databank/DocCard.vue';
import type { DataBankDocument } from '@/core/data-bank';

function makeDoc(over: Partial<DataBankDocument> = {}): DataBankDocument {
  return {
    id: 'doc-1',
    name: '设定集.md',
    scope: 'global',
    chunks: [
      { id: 'c1', index: 0, content: '第一段内容', tokenCount: 12 },
    ],
    fileSize: 2048,
    mimeType: 'text/markdown',
    createdAt: '2026-10-22T00:00:00.000Z',
    updatedAt: '2026-10-22T00:00:00.000Z',
    ...over,
  };
}

const stubs = {
  Icon: { template: '<i />' },
  formatFileSize: (b: number) => `${b} B`,
  formatDate: (iso: string) => iso,
  getCharacterName: (id?: string) => `NAME(${id})`,
};

function mountCard(docs: DataBankDocument[], expandedDocId: string | null = null) {
  return mount(DocCard, {
    props: {
      docs,
      expandedDocId,
      formatFileSize: stubs.formatFileSize,
      formatDate: stubs.formatDate,
      getCharacterName: stubs.getCharacterName,
    },
    global: { stubs: { Icon: stubs.Icon } },
  });
}

describe('DocCard（数据银行卡片）', () => {
  it('点展开按钮只发一次 toggleExpand（.stop 拦住冒泡，覆盖原角色段缺陷）', async () => {
    const wrapper = mountCard([makeDoc({ scope: 'character', characterId: 'ch-9' })]);
    await wrapper.get('.card-expand').trigger('click');

    const events = wrapper.emitted('toggleExpand');
    expect(events).toBeTruthy();
    // 关键断言：恰好 1 次。若修饰符漏写，会冒泡到 .card-header ⇒ 2 次
    expect(events!.length).toBe(1);
    expect(events![0]).toEqual(['doc-1']);
  });

  it('点卡片头部发一次 toggleExpand（原有效路径不回归）', async () => {
    const wrapper = mountCard([makeDoc()]);
    await wrapper.get('.card-header').trigger('click');

    const events = wrapper.emitted('toggleExpand');
    expect(events!.length).toBe(1);
    expect(events![0]).toEqual(['doc-1']);
  });

  it('点删除按钮发 confirmDelete，且不触发 toggleExpand', async () => {
    const wrapper = mountCard([makeDoc()]);
    await wrapper.get('.delete-btn').trigger('click');

    expect(wrapper.emitted('confirmDelete')![0]).toEqual(['doc-1']);
    expect(wrapper.emitted('toggleExpand')).toBeUndefined();
  });

  it('meta 第三列：character 段显示角色名，global 段显示创建时间', () => {
    const charCard = mountCard([makeDoc({ scope: 'character', characterId: 'ch-9' })]);
    expect(charCard.get('.doc-meta').text()).toContain('NAME(ch-9)');

    const globalCard = mountCard([makeDoc({ scope: 'global' })]);
    expect(globalCard.get('.doc-meta').text()).toContain('2026-10-22T00:00:00.000Z');
  });

  it('expandedDocId 命中时才渲染分块列表', () => {
    const collapsed = mountCard([makeDoc()], null);
    expect(collapsed.find('.card-chunks').exists()).toBe(false);

    const expanded = mountCard([makeDoc()], 'doc-1');
    expect(expanded.get('.card-chunks').text()).toContain('第一段内容');
  });

  it('按 docs 渲染多张卡片（v-for 由 props 驱动）', () => {
    const wrapper = mountCard([
      makeDoc({ id: 'a', name: 'A.md' }),
      makeDoc({ id: 'b', name: 'B.md' }),
    ]);
    expect(wrapper.findAll('.doc-card')).toHaveLength(2);
  });
});
