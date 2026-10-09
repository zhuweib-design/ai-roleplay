/**
 * 世界书与故事引擎的分区（M7-a）
 *
 * 两处各自的问题与要钉的契约：
 * 1. 世界书页：`整体世界描述` 与 `世界内用户资料` 是"配一次就长期不动"的一次性配置，
 *    实测在 1440 视口下占 422 + 921 = 1343px，把每天要用的条目区推到 y≈1998（三屏之下）。
 *    现在收进 `Collapse`，但**没填的那一段必须自动展开**——把还没要做的事藏起来是反向优化。
 * 2. 故事引擎：展开的卡片要走满整行 + 两列排布，这套 CSS 挂在一个类上，
 *    所以这里钉"点卡头 → 卡片带上 is-expanded、详情容器出现"。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import WorldBookView from '@/views/WorldBookView.vue';
import StoryEngineView from '@/views/StoryEngineView.vue';
import { useLorebookStore } from '@/stores/lorebook';
import { useStoryStore } from '@/stores/story';
import type { Lorebook } from '@core/lorebook';
import type { StoryAnalysisResult } from '@core/story-types';

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/worldbook', name: 'worldbook', component: { template: '<div />' } },
      { path: '/story', name: 'story', component: { template: '<div />' } },
      { path: '/character', name: 'character-list', component: { template: '<div />' } },
      { path: '/chat', name: 'chat', component: { template: '<div />' } },
    ],
  });
}

async function mountWorldbook(withSetup: boolean) {
  const store = useLorebookStore();
  const id = store.createLorebook({ name: '分区测试世界', description: '' });
  if (withSetup) {
    const lb = store.lorebooks.find((l) => l.id === id) as Lorebook;
    lb.worldDescription = { name: '分区测试世界', type: 'fantasy', keys: ['运河'], content: '运河与石墙。' };
    lb.userProfile = { name: '旅人', gender: '不明', description: '路过的人' };
  }
  store.selectLorebook(id);

  const router = makeRouter();
  await router.push('/worldbook');
  await router.isReady();
  return mount(WorldBookView, { global: { plugins: [router], stubs: { Modal: true, Toast: true } } });
}

/** 找到某个段标题对应的折叠触发器 */
function toggleFor(wrapper: Awaited<ReturnType<typeof mountWorldbook>>, text: string) {
  return wrapper.findAll('.collapse-toggle').find((b) => b.text().includes(text));
}

beforeEach(() => {
  setActivePinia(createPinia());
});

describe('世界书页的一次性配置段', () => {
  it('已经配过 → 两段默认收起，条目区回到首屏', async () => {
    const wrapper = await mountWorldbook(true);

    const desc = toggleFor(wrapper, '整体世界描述');
    const profile = toggleFor(wrapper, '世界内用户资料');
    expect(desc).toBeDefined();
    expect(profile).toBeDefined();
    expect(desc!.attributes('aria-expanded')).toBe('false');
    expect(profile!.attributes('aria-expanded')).toBe('false');
    // 范围标签在收起态仍然看得见（它决定要不要点开）
    expect(desc!.find('.world-desc-tag').text()).toBe('常量注入');
    expect(profile!.find('.world-desc-tag').text()).toBe('仅当前世界');
  });

  it('还没配 → 对应那段自动展开，不把待办藏起来', async () => {
    const wrapper = await mountWorldbook(false);

    expect(toggleFor(wrapper, '整体世界描述')!.attributes('aria-expanded')).toBe('true');
    expect(toggleFor(wrapper, '世界内用户资料')!.attributes('aria-expanded')).toBe('true');
    // 展开态里能直接看到"添加"入口，不用先点一下段标题
    expect(wrapper.findAll('.add-world-btn').length).toBeGreaterThanOrEqual(2);
  });

  it('点段标题可以反过来收起已展开的那段（不是只读的一次性决定）', async () => {
    const wrapper = await mountWorldbook(false);
    const desc = toggleFor(wrapper, '整体世界描述')!;

    await desc.trigger('click');
    expect(toggleFor(wrapper, '整体世界描述')!.attributes('aria-expanded')).toBe('false');
  });

  it('用户明确点过之后，记忆优先于"没填自动展开"（跨重挂载仍保持）', async () => {
    const first = await mountWorldbook(false);
    // 没填 → 自动展开
    expect(toggleFor(first, '整体世界描述')!.attributes('aria-expanded')).toBe('true');
    // 用户特意收起
    await toggleFor(first, '整体世界描述')!.trigger('click');
    expect(toggleFor(first, '整体世界描述')!.attributes('aria-expanded')).toBe('false');
    first.unmount();

    // 同一份设置（同一个 pinia）里重挂载：该听用户的，而不是又自动展开
    const again = await mountWorldbook(false);
    expect(toggleFor(again, '整体世界描述')!.attributes('aria-expanded')).toBe('false');
  });
});

describe('故事引擎展开卡片的布局钩子', () => {
  async function mountStoryView() {
    const store = useStoryStore();
    store.stories = [
      {
        id: 'story-partition',
        sourceFileName: '分区测试稿.txt',
        depth: 'deep',
        status: 'completed',
        createdAt: Date.now(),
        completedAt: Date.now(),
        textLength: 1200,
        chunkCount: 1,
        worldInfo: { name: '灰石诸国', type: '奇幻', description: '运河与石墙。' },
        characters: [{ name: '艾莉娅', description: '精灵法师。' }],
        scenes: [{ name: '王都', type: '城市', description: '石墙之城。' }],
        events: [],
        scripts: [],
        protagonist: null,
      } as unknown as StoryAnalysisResult,
    ];

    const router = makeRouter();
    await router.push('/story');
    await router.isReady();
    return mount(StoryEngineView, { global: { plugins: [router], stubs: { Modal: true, Toast: true } } });
  }

  it('点卡头 → 卡片带 is-expanded，详情容器出现（两列布局的 CSS 挂在这个类上）', async () => {
    const wrapper = await mountStoryView();
    const card = wrapper.find('.story-card');

    expect(card.exists()).toBe(true);
    expect(card.classes()).not.toContain('is-expanded');
    expect(wrapper.find('.card-detail').exists()).toBe(false);

    await card.find('.card-header').trigger('click');
    expect(wrapper.find('.story-card').classes()).toContain('is-expanded');
    expect(wrapper.find('.card-detail').exists()).toBe(true);
    // 展开后至少渲染出"世界信息"与"人物"两段（两列排布的就是它们）
    expect(wrapper.findAll('.detail-section').length).toBeGreaterThanOrEqual(2);
  });
});
