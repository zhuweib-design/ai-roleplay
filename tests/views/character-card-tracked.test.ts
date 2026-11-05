/**
 * 角色卡上的"已跟踪"标记（E19）
 *
 * 版本仓库是选中角色时懒创建的，此前界面上没有任何地方能看出"哪些角色真的在被跟踪"，
 * 只能进「版本管理」才知道。标记要守住三件事：
 * - 只有真的建了仓库的角色才显示（假标记比没有标记更糟）；
 * - 点它进的是**这个角色**的版本历史（带 ?char=），而不是版本页默认的第一个；
 * - 点它不能同时触发卡片自身的"进编辑页"。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import CharactersView from '@/views/CharactersView.vue';
import { useCharacterStore } from '@/stores/character';
import { useCharacterVersionStore } from '@/stores/character-version';
import { t } from '@/i18n';
import type { UICharacter } from '@/types';

function makeChar(id: string, overrides: Partial<UICharacter> = {}): UICharacter {
  return {
    id,
    name: `角色${id}`,
    avatarType: 'gradient',
    gradientFrom: 'var(--tk-cyan-500)',
    gradientTo: 'var(--tk-cyan-700)',
    initial: id.slice(-1).toUpperCase(),
    lastActive: '刚刚',
    favorite: false,
    tags: [],
    description: '描述',
    model: 'gpt-4o',
    conversations: [],
    messages: [],
    authorNote: '',
    authorDepth: 4,
    temperature: 0.7,
    maxTokens: 2048,
    tokenBudget: { character: 0, worldInfo: 0, chatHistory: 0, remaining: 8192 },
    ...overrides,
  } as UICharacter;
}

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'chat', component: { template: '<div />' } },
      { path: '/character', name: 'character-list', component: { template: '<div />' } },
      { path: '/character/new', name: 'character-new', component: { template: '<div />' } },
      { path: '/character/:id/edit', name: 'character-edit', component: { template: '<div />' } },
      { path: '/character-version', name: 'character-version', component: { template: '<div />' } },
      { path: '/settings', name: 'settings', component: { template: '<div />' } },
    ],
  });
}

const charStore = () => useCharacterStore();

async function mountView() {
  const router = makeRouter();
  await router.push('/character');
  await router.isReady();
  const wrapper = mount(CharactersView, {
    global: {
      plugins: [router],
      stubs: {
        Icon: { template: '<span class="icon-stub" />' },
        Avatar: { template: '<span class="avatar-stub" />' },
        Toast: true,
        Modal: true,
      },
    },
  });
  await flushPromises();
  return { wrapper, router };
}

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  const cs = charStore();
  cs.characters.length = 0;
  cs.characters.push(makeChar('c1'), makeChar('c2'));
});

describe('已跟踪标记', () => {
  it('没有任何仓库时，两张卡都不显示标记', async () => {
    const { wrapper } = await mountView();
    expect(wrapper.findAll('.meta-tracked')).toHaveLength(0);
  });

  it('只有建了仓库的那张卡显示标记', async () => {
    useCharacterVersionStore().selectCharacter('c1');
    const { wrapper } = await mountView();
    const marks = wrapper.findAll('.meta-tracked');

    expect(marks).toHaveLength(1);
    expect(marks[0]!.text()).toContain(t('characters.trackedTag'));
    const trackedCard = marks[0]!.element.closest('article.char-card');
    expect(trackedCard?.textContent).toContain('角色c1');
  });

  it('点标记进该角色的版本历史，且不会顺带进编辑页', async () => {
    useCharacterVersionStore().selectCharacter('c2');
    const { wrapper, router } = await mountView();
    const card = wrapper.findAll('article.char-card')[1]!;
    expect(card.text()).toContain('角色c2');

    await card.find('[data-rel-jump="char-tracked"]').trigger('click');
    await flushPromises();

    // 带 char= 才能定位到该角色；带 from= 才回得来（M2-b5 的回程契约）
    expect(router.currentRoute.value.fullPath).toBe('/character-version?char=c2&from=/character');
  });

  it('标记是可聚焦的按钮并带角色名（键盘与读屏都能用）', async () => {
    useCharacterVersionStore().selectCharacter('c1');
    const { wrapper } = await mountView();
    const mark = wrapper.find('.meta-tracked');

    expect(mark.element.tagName).toBe('BUTTON');
    expect(mark.attributes('type')).toBe('button');
    expect(mark.attributes('aria-label')).toBe(t('characters.trackedAria', { name: '角色c1' }));
  });
});
