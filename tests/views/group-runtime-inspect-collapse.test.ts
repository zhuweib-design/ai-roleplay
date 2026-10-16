/**
 * 群聊页头的"成员 Runtime 检视"段（M6-e 分区）
 *
 * 这段是排障面：成员下拉 + `RuntimeStatePanel`，实测占页头 94px（页头共 234px，四成），
 * 而它不改变群聊怎么说话。M4-b2 给设置页定的规矩是"高级段默认收起，但要说清为什么"，
 * 这里把同一条规矩落到群聊页头。
 *
 * 断言钉三件事，都是"下一次有人改回常驻展开"时唯一会响的东西：
 * 1. 默认 `aria-expanded=false`，且**下拉仍在 DOM 里**（`v-show` 不是 `v-if`——
 *    收起不该把用户选了一半的检视成员丢掉）；
 * 2. 说明文字在面板**外面**，收起时也读得到（否则折叠就变成藏东西）；
 * 3. 段上带"高级"标记，收起的理由写在界面上而不是注释里。
 *
 * jsdom 的 `getComputedStyle` 对 `v-show` 的 display 有缓存（M4-b2 踩过），
 * 因此展开态一律读内联 `style.display`，不用 `isVisible()`。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import GroupChatView from '@/views/GroupChatView.vue';
import { useGroupChatStore } from '@/stores/group-chat';
import { useCharacterStore } from '@/stores/character';
import { t } from '@/i18n';
import type { UICharacter } from '@/types';

const MEMBERS: Array<{ id: string; name: string; initial: string }> = [
  { id: 'gri-1', name: '艾莉娅', initial: '艾' },
  { id: 'gri-2', name: '鲍勃', initial: '鲍' },
];

async function mountGroupWithMembers() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/group', name: 'group', component: { template: '<div />' } },
      { path: '/character', name: 'character-list', component: { template: '<div />' } },
      { path: '/character/:id/edit', name: 'character-edit', component: { template: '<div />' } },
    ],
  });
  await router.push('/group');
  await router.isReady();

  const characterStore = useCharacterStore();
  characterStore.characters = MEMBERS.map(
    (m) =>
      ({
        id: m.id,
        name: m.name,
        avatarType: 'gradient',
        initial: m.initial,
        lastActive: '刚刚',
        favorite: false,
        tags: [],
        description: `${m.name}的设定`,
        model: 'GPT-4o',
        conversations: [],
        messages: [],
        authorNote: '',
        authorDepth: 4,
        temperature: 1,
        maxTokens: 4096,
        worldEntries: [],
        tokenBudget: { character: 0, worldInfo: 0, chatHistory: 0, remaining: 8192 },
      }) as unknown as UICharacter
  );

  const groupStore = useGroupChatStore();
  const groupId = groupStore.createGroup(
    {
      name: '取证群',
      description: '',
      memberIds: MEMBERS.map((m) => m.id),
      mode: 'natural',
      firstMessage: '欢迎。',
    },
    MEMBERS.map((m) => ({
      id: m.id,
      name: m.name,
      description: '',
      personality: '',
      scenario: '',
      firstMessage: '你好',
      alternateGreetings: [],
      exampleMessages: '',
      characterNote: null,
      talkativeness: 50,
      tags: [],
      favorite: false,
      version: '1.0',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }))
  );
  groupStore.selectGroup(groupId!);

  return mount(GroupChatView, {
    global: { plugins: [router], stubs: { Modal: true, Toast: true } },
    attachTo: document.body,
  });
}

/** 找到包住"成员 Runtime 检视"那一行的折叠段（不是 RuntimeStatePanel 自己那层折叠） */
function inspectSection(wrapper: Awaited<ReturnType<typeof mountGroupWithMembers>>) {
  const toggle = wrapper
    .findAll('.collapse-toggle')
    .find((b) => b.text().includes(t('group.runtimeInspectTitle')));
  const section = wrapper.findAll('.collapse-section').find((s) => s.find('.collapse-toggle').text().includes(t('group.runtimeInspectTitle')));
  return { toggle, section, panel: section?.find('.collapse-panel') };
}

beforeEach(() => {
  setActivePinia(createPinia());
  document.body.innerHTML = '';
});

describe('群聊页头的成员 Runtime 检视段', () => {
  it('默认收起，但下拉仍在 DOM 里（v-show 不丢掉选了一半的检视成员）', async () => {
    const wrapper = await mountGroupWithMembers();
    const { toggle, panel } = inspectSection(wrapper);

    expect(toggle).toBeDefined();
    expect(toggle!.attributes('aria-expanded')).toBe('false');
    // 收起 ≠ 卸载：选择器还在，只是不可见
    expect(wrapper.find('#group-runtime-member').exists()).toBe(true);
    expect((panel!.element as HTMLElement).style.display).toBe('none');
  });

  it('点段标题展开，下拉随之可见', async () => {
    const wrapper = await mountGroupWithMembers();
    const { toggle, panel } = inspectSection(wrapper);

    await toggle!.trigger('click');
    expect(toggle!.attributes('aria-expanded')).toBe('true');
    expect((panel!.element as HTMLElement).style.display).not.toBe('none');
  });

  it('说明文字与"高级"标记都在面板外，收起时照样读得到', async () => {
    const wrapper = await mountGroupWithMembers();
    const { section, panel } = inspectSection(wrapper);

    const hint = section!.find('.collapse-hint');
    expect(hint.text()).toBe(t('group.runtimeInspectHint'));
    // 折叠时面板 display:none，说明若在面板里就会跟着消失——那才是"藏东西"
    expect((panel!.element as HTMLElement).style.display).toBe('none');
    expect(panel!.element.contains(hint.element)).toBe(false);
    expect(section!.find('.collapse-advanced-tag').text()).toBe(t('common.advanced'));
  });

  it('段标题是 h3，页头标题层级不因折叠而跳跃', async () => {
    const wrapper = await mountGroupWithMembers();
    const { section } = inspectSection(wrapper);
    expect(section!.find('h3').exists()).toBe(true);
  });
});
