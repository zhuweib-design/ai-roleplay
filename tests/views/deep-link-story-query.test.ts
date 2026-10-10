/**
 * 故事深链 `?story=<id>` 必须等列表读完再解析（M13-a）
 *
 * M12-a 在角色版本页挖出同一形状的问题后，这条链路是剩下唯一一个"按 URL 里的记录 id
 * 找数据"的深链：聊天页的故事时间可点进故事引擎并选中那一条。原来的写法在读库完成前
 * 就判断 `stories.some(...)`，匹配不到就**静默什么都不做**——界面停在没选中的空态上，
 * 用户以为链接坏了。
 *
 * 两条判定各带反证：闸门没等 ⇒ 红在"没选中"；store 的 ensureLoaded 不去重 ⇒ 红在读了两遍。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import StoryEngineView from '@/views/StoryEngineView.vue';
import { useStoryStore } from '@/stores/story';

const ARCHIVED_ID = 'story-archived';

function archivedStory(): Record<string, unknown> {
  return {
    id: ARCHIVED_ID,
    sourceFileName: '存档故事.txt',
    status: 'completed',
    createdAt: 1,
    worldInfo: null,
    scenes: [],
    characters: [],
    events: [],
    scripts: [],
  };
}

/** 只暴露"读库还没完成"这一个闸门：loadStories 由测试放手 */
function holdStoryLoad(store: ReturnType<typeof useStoryStore>, times: { loads: number }) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  store.setStorageAdapter({
    loadStories: async () => {
      times.loads++;
      await gate;
      return [archivedStory()] as never;
    },
    saveStory: () => Promise.resolve(),
    deleteStory: () => Promise.resolve(),
  } as never);
  return release;
}

async function mountView(fullPath: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'chat', component: { template: '<div />' } },
      { path: '/story', name: 'story', component: StoryEngineView },
      { path: '/character', name: 'character-list', component: { template: '<div />' } },
    ],
  });
  await router.push(fullPath);
  await router.isReady();
  const wrapper = mount(StoryEngineView, {
    global: {
      plugins: [router],
      stubs: {
        Modal: true,
        Icon: true,
        Collapse: true,
        FormField: true,
        EmptyState: true,
        // 提示文本要读得出来，否则"说到用户面前"没法断言
        Toast: {
          props: ['modelValue', 'message', 'type'],
          template: '<div class="toast-stub">{{ message }}</div>',
        },
      },
    },
  });
  return { wrapper, router };
}

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});

describe('story store 的 ensureLoaded', () => {
  it('并发调用只读一遍库，读完才置位标志', async () => {
    const store = useStoryStore();
    const times = { loads: 0 };
    const release = holdStoryLoad(store, times);

    const first = store.ensureLoaded();
    const second = store.ensureLoaded();
    expect(store.libraryLoaded, '读库没落地前不得置位').toBe(false);
    release();
    await Promise.all([first, second]);

    expect(times.loads).toBe(1);
    expect(store.libraryLoaded).toBe(true);
    await store.ensureLoaded();
    expect(times.loads, '读过就不再读第二遍').toBe(1);
  });
});

describe('故事引擎页的 ?story= 深链', () => {
  it('读库完成后选中 URL 那条（不等闸门就会静默不选）', async () => {
    const store = useStoryStore();
    const times = { loads: 0 };
    const release = holdStoryLoad(store, times);

    const { wrapper } = await mountView('/story?story=story-archived');
    await flushPromises();
    expect(store.currentStoryId, '读库还没完成时不应该有选中态').toBeNull();

    release();
    await flushPromises();

    expect(times.loads, '视图自己把闸门拉起来，只读一遍').toBe(1);
    expect(store.currentStoryId, '深链没落到目标故事上').toBe(ARCHIVED_ID);
    wrapper.unmount();
  });

  it('读完仍然没有这条故事时给提示，而不是停在空态', async () => {
    const store = useStoryStore();
    const times = { loads: 0 };
    const release = holdStoryLoad(store, times);
    release();

    const { wrapper } = await mountView('/story?story=story-gone');
    await flushPromises();

    // 链接指向已删除的故事：store 自己的默认选中（列表第一条）保留，界面不停在空态；
    // 但必须告诉用户"你要找的那条没找到"，否则他会以为打开的是那条故事。
    expect(store.currentStoryId).toBe(ARCHIVED_ID);
    expect(wrapper.find('.toast-stub').text(), '读完了还是没有这条，必须告诉用户而不是静默')
      .toContain('找不到目标故事');
    wrapper.unmount();
  });
});
