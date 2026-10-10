/**
 * StoryEngineView — 一键生成设定面板 (T-08) 组件测试
 *
 * 覆盖：
 * - 未配置 API 时点按提示错误、不发起生成
 * - 配置 API 后一键生成：依次调用世界书与角色生成器
 * - 源素材上下文：优先使用当前展开故事的分析结果
 * - 成功后展示结果与跳转入口
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { nextTick } from 'vue';

// ── mock stores ──

const mocks = {
  constructSourceContext: vi.fn(),
  generateRandomWorldbook: vi.fn(),
  generateRandomCharacter: vi.fn(),
  selectStory: vi.fn(),
  activeApiProfileId: null as string | null,
  stories: [] as unknown[],
};

vi.mock('@/stores/story', () => ({
  useStoryStore: () => ({
    stories: mocks.stories,
    statusCounts: { all: 0, completed: 0, analyzing: 0, failed: 0 } as Record<string, number>,
    filteredStories: mocks.stories,
    progress: { stage: '', completed: 0, total: 0 },
    isAnalyzing: false,
    lastError: null,
    lastInfo: null,
    filterStatus: 'all',
    searchQuery: '',
    analyzeStoryWithText: vi.fn(),
    selectStory: mocks.selectStory,
    // 深链要先等 store 读完（M13-a 的闸门），mock 里"已经读完"即可
    ensureLoaded: () => Promise.resolve(),
    libraryLoaded: { value: true },
    cancelAnalysis: vi.fn(),
    clearProtagonist: vi.fn(),
    createStoryFromFile: vi.fn(),
    deleteStory: vi.fn(),
    exportScripts: vi.fn(),
    importAll: vi.fn(),
    importCharacters: vi.fn(),
    importEvents: vi.fn(),
    importScenes: vi.fn(),
    importWorld: vi.fn(),
    setFilterStatus: vi.fn(),
    setProtagonistAsCustom: vi.fn(),
    setProtagonistFromCharacter: vi.fn(),
    setProtagonistPersonaId: vi.fn(),
    setSearchQuery: vi.fn(),
    setStoryWorldBookBinding: vi.fn(),
    updateProtagonist: vi.fn(),
  }),
}));

vi.mock('@/stores/settings', () => ({
  useSettingsStore: () => ({ activeApiProfileId: mocks.activeApiProfileId }),
}));

vi.mock('@/stores/lorebook', () => ({
  useLorebookStore: () => ({ generateRandomWorldbook: mocks.generateRandomWorldbook }),
}));

vi.mock('@/stores/character', () => ({
  useCharacterStore: () => ({ generateRandomCharacter: mocks.generateRandomCharacter }),
}));

// story-analyzer 的 buildSourceContext 采用真实实现（逻辑已有独立单测）
import '@core/story-analyzer';

import StoryEngineView from '@/views/StoryEngineView.vue';

function makeCompletedStory(id: string) {
  return {
    id,
    sourceFileName: `${id}.txt`,
    depth: 'quick',
    status: 'completed',
    createdAt: 0,
    completedAt: 100,
    textLength: 10,
    chunkCount: 1,
    worldInfo: { name: '星陨大陆', type: 'fantasy', description: '测试世界', coreSettings: ['规则一'] },
    characters: [{ name: '阿尔文', description: '剑士' }],
    scenes: [],
    events: [],
    scripts: [],
  };
}

async function mountView(pinia: Pinia, query = '') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/story', name: 'story', component: { template: '<div />' } },
      { path: '/worldbook', name: 'worldbook', component: { template: '<div />' } },
      { path: '/character-list', name: 'character-list', component: { template: '<div />' } },
    ],
  });
  // 组件在 setup 里读 route.query.story，所以要先落到带 query 的路由再挂载
  await router.push(`/story${query}`);
  const wrapper = mount(StoryEngineView, {
    global: {
      plugins: [pinia, router],
      stubs: {
        Modal: true,
        Toast: true,
        FilterTabs: true,
        Icon: true,
        StoryTimeConfigPanel: true,
      },
    },
  });
  await nextTick();
  return wrapper;
}

describe('StoryEngineView 一键生成 (T-08)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.activeApiProfileId = null;
    mocks.stories = [];
    mocks.generateRandomWorldbook.mockResolvedValue('world-1');
    mocks.generateRandomCharacter.mockResolvedValue('char-1');
    setActivePinia(createPinia());
  });

  it('未配置 API 时提示错误且不发起生成', async () => {
    const wrapper = await mountView(createPinia());
    const btn = wrapper.findAll('button').find((b) => b.text().includes('一键生成'));
    expect(btn).toBeTruthy();
    await btn!.trigger('click');

    expect(mocks.generateRandomWorldbook).not.toHaveBeenCalled();
    expect(mocks.generateRandomCharacter).not.toHaveBeenCalled();
  });

  it('已配置 API：依次调用世界书与角色生成器并展示结果', async () => {
    mocks.activeApiProfileId = 'p1';
    mocks.stories = [makeCompletedStory('s1')];
    const wrapper = await mountView(createPinia());

    const btn = wrapper.findAll('button').find((b) => b.text().includes('一键生成'));
    await btn!.trigger('click');
    await flushPromises();

    expect(mocks.generateRandomWorldbook).toHaveBeenCalledWith('fantasy', 'global', expect.stringContaining('星陨大陆'));
    expect(mocks.generateRandomCharacter).toHaveBeenCalledWith('fantasy', expect.stringContaining('阿尔文'));

    // 结果状态展示
    const result = wrapper.find('.quick-setup-result');
    expect(result.exists()).toBe(true);
    expect(result.text()).toContain('世界书已生成');
    expect(result.text()).toContain('主角已生成');
    // 跳转入口存在
    expect(result.findAll('button').length).toBe(2);
  });

  it('生成失败时展示失败标记', async () => {
    mocks.activeApiProfileId = 'p1';
    mocks.stories = [];
    mocks.generateRandomWorldbook.mockResolvedValue(null);
    const wrapper = await mountView(createPinia());

    const btn = wrapper.findAll('button').find((b) => b.text().includes('一键生成'));
    await btn!.trigger('click');
    await flushPromises();

    const result = wrapper.find('.quick-setup-result');
    expect(result.text()).toContain('世界书生成失败');
    // 主角仍成功
    expect(result.text()).toContain('主角已生成');
  });
});

/**
 * E15：聊天页的故事时间可一跳回到故事本体，落地靠 `?story=<id>`。
 * 这里守的是"只认存在的 id"——手打的或故事已删除留下的过期链接，
 * 不能把界面停在一个空选中态上。
 */
describe('StoryEngineView 深链选中 (?story=)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.stories = [makeCompletedStory('s1')];
    setActivePinia(createPinia());
  });

  it('带存在的 id 进来：等 store 读完之后选中那一条', async () => {
    await mountView(createPinia(), '?story=s1');
    await flushPromises();
    expect(mocks.selectStory).toHaveBeenCalledWith('s1');
  });

  it('带不存在的 id 进来：不改选中态', async () => {
    await mountView(createPinia(), '?story=nope');
    await flushPromises();
    expect(mocks.selectStory).not.toHaveBeenCalled();
  });

  it('不带 query 进来：什么都不做', async () => {
    await mountView(createPinia());
    expect(mocks.selectStory).not.toHaveBeenCalled();
  });
});