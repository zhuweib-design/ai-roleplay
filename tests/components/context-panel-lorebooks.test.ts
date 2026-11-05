/**
 * 上下文面板的世界书清单 = 真正会注入的那批（E03）
 *
 * 缺陷成因：面板自己按 `boundWorldBookIds` 过滤，而发送链路
 * （`stores/chat-context.ts` 的 `collectLorebooksForCharacter`）把
 * `scope === 'global'` 的书**无条件**纳入。于是"面板说没绑书"与"正文里一直在注入"
 * 同时为真——用户完全无法从界面推断模型看到了什么。
 * 这里守三件事：全局书必须出现在清单里、它被标成"全局生效"、计数按生效口径。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import ContextPanel from '@/components/layout/ContextPanel.vue';
import { useCharacterStore } from '@/stores/character';
import { useLorebookStore } from '@/stores/lorebook';
import { t } from '@/i18n';
import type { UICharacter } from '@/types';
import type { Lorebook, LorebookEntry } from '@core/lorebook';

function entry(overrides: Partial<LorebookEntry> = {}): LorebookEntry {
  return {
    id: 'e1',
    title: '永恒酒馆',
    keys: ['酒馆'],
    content: '酒馆永远亮着灯。',
    enabled: true,
    ...overrides,
  } as LorebookEntry;
}

function book(overrides: Partial<Lorebook> = {}): Lorebook {
  return {
    id: 'lb-1',
    name: '一本世界书',
    description: '',
    entries: [entry()],
    scope: 'character',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as Lorebook;
}

function character(overrides: Partial<UICharacter> = {}): UICharacter {
  return {
    id: 'c1',
    name: 'TestChar',
    avatarType: 'gradient',
    gradientFrom: 'var(--tk-cyan-500)',
    gradientTo: 'var(--tk-cyan-700)',
    initial: 'T',
    lastActive: '刚刚',
    favorite: false,
    tags: [],
    description: 'd',
    model: 'gpt-4o',
    conversations: [],
    messages: [],
    authorNote: '',
    authorDepth: 4,
    temperature: 0.7,
    tokenBudget: { character: 0, worldInfo: 0, chatHistory: 0, remaining: 8192 },
    ...overrides,
  } as UICharacter;
}

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'chat', component: { template: '<div />' } },
      { path: '/chat', name: 'chat2', component: { template: '<div />' } },
      { path: '/worldbook', name: 'worldbook', component: { template: '<div />' } },
    ],
  });
}

async function mountPanel(char: UICharacter, books: Lorebook[]) {
  const characterStore = useCharacterStore();
  const lorebookStore = useLorebookStore();
  characterStore.characters.push(char);
  characterStore.currentCharacterId = char.id;
  books.forEach((b) => lorebookStore.lorebooks.push(b));
  const router = makeRouter();
  await router.push('/chat');
  await router.isReady();
  const wrapper = mount(ContextPanel, {
    global: {
      plugins: [router],
      stubs: {
        Icon: { template: '<span class="icon-stub" />' },
        Avatar: { template: '<span class="avatar-stub" />' },
      },
    },
  });
  return { wrapper, router };
}

beforeEach(() => {
  setActivePinia(createPinia());
});

describe('E03 生效世界书清单', () => {
  it('未绑定任何书、但有全局书时，不再谎报"未绑定世界书"', async () => {
    const { wrapper } = await mountPanel(
      character({ boundWorldBookIds: [] }),
      [book({ id: 'lb-global', name: '全局设定集', scope: 'global' })]
    );
    const rows = wrapper.findAll('.world-lorebook');

    expect(rows).toHaveLength(1);
    expect(rows[0]!.text()).toContain('全局设定集');
    expect(wrapper.find('.ctx-empty').exists()).toBe(false);
  });

  it('全局书带"全局生效"标记，绑定书不带（两种来源要能分辨）', async () => {
    const { wrapper } = await mountPanel(
      character({ boundWorldBookIds: ['lb-bound'] }),
      [
        book({ id: 'lb-bound', name: '绑定书', scope: 'character' }),
        book({ id: 'lb-global', name: '全局书', scope: 'global' }),
      ]
    );
    const globalRow = wrapper
      .findAll('.world-lorebook')
      .find((r) => r.text().includes('全局书'))!;
    const boundRow = wrapper
      .findAll('.world-lorebook')
      .find((r) => r.text().includes('绑定书'))!;

    expect(globalRow.find('.world-global-tag').text()).toBe(t('ctx.worldGlobalTag'));
    expect(boundRow.find('.world-global-tag').exists()).toBe(false);
  });

  it('计数按生效口径（绑定 1 + 全局 1 = 2 本）', async () => {
    const { wrapper } = await mountPanel(
      character({ boundWorldBookIds: ['lb-bound'] }),
      [
        book({ id: 'lb-bound', name: '绑定书' }),
        book({ id: 'lb-global', name: '全局书', scope: 'global' }),
      ]
    );
    const worldSection = wrapper.find('section[aria-labelledby="ctx-world-title"]');
    expect(worldSection.find('.ctx-section-value').text()).toBe(t('ctx.worldCount', { count: 2 }));
  });

  it('每本书都可点进世界书页并先选中它（可见且可一跳）', async () => {
    const { wrapper, router } = await mountPanel(
      character({ boundWorldBookIds: [] }),
      [book({ id: 'lb-global', name: '全局书', scope: 'global' })]
    );
    const lorebookStore = useLorebookStore();
    const btn = wrapper.find('[data-rel-jump="ctx-world-global"]');

    expect(btn.attributes('aria-label')).toBe(t('ctx.worldRowAria', { name: '全局书' }));
    await btn.trigger('click');
    await flushPromises();

    expect(lorebookStore.currentLorebookId).toBe('lb-global');
    // 跳转带 ?from= 才回得来（M2-b5 的回程契约）；
    // M17-b 起还带 ?book=，落地页打开的就是面板里点的那本，而不是"store 里恰好是哪本算哪本"。
    expect(router.currentRoute.value.fullPath).toBe('/worldbook?book=lb-global&from=/chat');
  });

  it('聊天级世界书不列（它本来就不参与本角色注入）', async () => {
    const { wrapper } = await mountPanel(
      character({ boundWorldBookIds: [] }),
      [book({ id: 'lb-chat', name: '仅本对话', scope: 'chat', chatId: 'chat-x' })]
    );
    expect(wrapper.findAll('.world-lorebook')).toHaveLength(0);
    expect(wrapper.find('.ctx-empty').text()).toBe(t('ctx.worldEmpty'));
  });
});
