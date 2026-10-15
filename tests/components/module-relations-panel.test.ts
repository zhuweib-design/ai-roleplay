/**
 * ModuleRelationsPanel 的挂载测试（L 层）
 *
 * 关心的是"面板真的能把人带到对的地方"：跳转带来源、未关联行弱化成次要文字、
 * 以及群聊这种"路由无参数"的目标必须先 selectGroup 再跳。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import ModuleRelationsPanel from '@/components/layout/ModuleRelationsPanel.vue';
import { useCharacterStore } from '@/stores/character';
import { useGroupChatStore } from '@/stores/group-chat';
import { t } from '@/i18n';

const ID = 'rel-char';

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'chat', component: { template: '<div />' } },
      { path: '/character/:id/edit', name: 'character-edit', component: { template: '<div />' } },
      { path: '/worldbook', name: 'worldbook', component: { template: '<div />' } },
      { path: '/databank', name: 'databank', component: { template: '<div />' } },
      { path: '/settings', name: 'settings', component: { template: '<div />' } },
      { path: '/character-version', name: 'character-version', component: { template: '<div />' } },
      { path: '/group', name: 'group', component: { template: '<div />' } },
    ],
  });
}

function seedCharacter(): void {
  useCharacterStore().characters.push({
    id: ID,
    name: '关联测试角色',
    avatarType: 'gradient',
    initial: 'R',
    lastActive: '刚刚',
    favorite: false,
    tags: [],
    description: '',
    model: 'gpt-4o',
    conversations: [],
    messages: [],
    authorNote: '',
    authorDepth: 4,
    temperature: 0.7,
    worldEntries: [],
  } as never);
}

describe('ModuleRelationsPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    seedCharacter();
  });

  it('渲染六行；未关联的行用次要文字，不与"出错了"混同', async () => {
    const router = makeRouter();
    await router.push(`/character/${ID}/edit`);
    const wrapper = mount(ModuleRelationsPanel, {
      props: { characterId: ID },
      global: { plugins: [router] },
    });

    const rows = wrapper.findAll('.relations-row');
    expect(rows).toHaveLength(6);
    expect(wrapper.find('[data-rel-jump="rel-worldbook"]').exists()).toBe(true);
    expect(rows[0]!.classes()).toContain('is-plain');
    expect(wrapper.text()).toContain(t('rel.worldbookOff'));
  });

  it('点世界书行跳到世界书页，并带回来路', async () => {
    const router = makeRouter();
    await router.push(`/character/${ID}/edit`);
    const wrapper = mount(ModuleRelationsPanel, {
      props: { characterId: ID },
      global: { plugins: [router] },
    });

    await wrapper.find('[data-rel-jump="rel-worldbook"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('worldbook');
    expect(router.currentRoute.value.query.from).toBe(`/character/${ID}/edit`);
  });

  it('角色在群里时，点群聊行先选中该群再跳（/group 没有路由参数）', async () => {
    const groups = useGroupChatStore();
    groups.groups.push({
      id: 'g1',
      name: '测试群',
      members: [{ characterId: ID, name: '关联测试角色', joinedAt: '2026-10-07T00:00:00.000Z' }],
      messages: [],
    } as never);

    const router = makeRouter();
    await router.push(`/character/${ID}/edit`);
    const wrapper = mount(ModuleRelationsPanel, {
      props: { characterId: ID },
      global: { plugins: [router] },
    });

    const row = wrapper.find('[data-rel-jump="rel-groups"]');
    expect(row.exists()).toBe(true);
    await row.trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('group');
    expect(groups.currentGroupId).toBe('g1');
  });

  it('查不到的角色不渲染（避免一屏假"未配置"）', async () => {
    const router = makeRouter();
    await router.push(`/character/${ID}/edit`);
    const wrapper = mount(ModuleRelationsPanel, {
      props: { characterId: 'no-such' },
      global: { plugins: [router] },
    });
    expect(wrapper.find('.relations').exists()).toBe(false);
  });
});
