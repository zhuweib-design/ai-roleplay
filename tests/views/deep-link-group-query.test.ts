/**
 * 群聊深链 `?group=<id>` 必须等群列表读完再解析（M15-d）
 *
 * 这条是 M15-a 把守卫升级成"按键核对"之后**新接**的第一条深链，两个目的：
 * 1. 归档页原来"跳到 /group 再命令式 selectGroup"，目标只活在内存里 —— 刷新、分享、
 *    或读库比导航慢时都会落回别的群；改成 URL 携带目标后，这些路径才成立。
 * 2. 验证"下一个加深链的人"这条路真的走得通：闸门、作废、找不到时的提示都来自
 *    `useDeepLinkId`，视图只写"读完后拿这个 id 做什么"。
 *
 * 反证：视图不等闸门就会红在"没选中"；store 的 ensureLoaded 不去重就会红在读了两遍。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import GroupChatView from '@/views/GroupChatView.vue';
import { useGroupChatStore } from '@/stores/group-chat';

const TARGET_ID = 'grp-target';

function groupOf(id: string, name: string): Record<string, unknown> {
  return {
    id,
    name,
    description: '',
    members: [],
    firstMessage: '',
    messages: [],
    mode: 'rotate',
    lastSpeakerId: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    lifecycleStatus: 'active',
  };
}

/** 只暴露"读库还没完成"这一个闸门：loadGroupChats 由测试放手 */
function holdGroupLoad(
  store: ReturnType<typeof useGroupChatStore>,
  times: { loads: number },
  rows: Array<Record<string, unknown>>
) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  store.setStorageAdapter({
    loadGroupChats: async () => {
      times.loads++;
      await gate;
      return rows as never;
    },
    saveGroupChat: () => Promise.resolve(),
    deleteGroupChat: () => Promise.resolve(),
  } as never);
  return release;
}

async function mountView(fullPath: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'chat', component: { template: '<div />' } },
      { path: '/group', name: 'group', component: GroupChatView },
    ],
  });
  await router.push(fullPath);
  await router.isReady();
  const wrapper = mount(GroupChatView, {
    global: {
      plugins: [router],
      stubs: {
        Icon: true,
        Modal: true,
        Collapse: true,
        Avatar: true,
        EmptyState: true,
        ChatModeSwitch: true,
        ThinkingBlock: true,
        StatusHud: true,
        RuntimeStatePanel: true,
        ContextReadinessBar: true,
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

describe('group store 的 ensureLoaded', () => {
  it('并发调用只读一遍库，读完才置位标志', async () => {
    const store = useGroupChatStore();
    const times = { loads: 0 };
    const release = holdGroupLoad(store, times, [groupOf(TARGET_ID, '目标群')]);

    const first = store.ensureLoaded();
    const second = store.ensureLoaded();
    expect(store.loaded, '读库没落地前不得置位').toBe(false);
    release();
    await Promise.all([first, second]);

    expect(times.loads).toBe(1);
    expect(store.loaded).toBe(true);
    await store.ensureLoaded();
    expect(times.loads, '读过就不再读第二遍').toBe(1);
  });
});

describe('群聊页的 ?group= 深链', () => {
  it('读库完成后选中 URL 那个群，并把群 id 写回地址栏', async () => {
    const store = useGroupChatStore();
    const times = { loads: 0 };
    const release = holdGroupLoad(store, times, [
      groupOf('grp-first', '排在前面的群'),
      groupOf(TARGET_ID, '目标群'),
    ]);

    const { wrapper, router } = await mountView('/group?group=' + TARGET_ID);
    await flushPromises();
    // 闸门还没放开：既不选中，也不许悄悄落到"列表第一个"
    expect(store.currentGroupId, '读库没完成时不应该有选中态').toBeNull();

    release();
    await flushPromises();

    expect(times.loads, '视图自己把闸门拉起来，只读一遍').toBe(1);
    expect(store.currentGroupId, '深链没落到目标群上').toBe(TARGET_ID);
    expect(router.currentRoute.value.query.group, '选中后地址栏要跟着当前群走').toBe(TARGET_ID);
    wrapper.unmount();
  });

  it('读完仍然没有这个群时给提示，而不是停在别的群', async () => {
    const store = useGroupChatStore();
    const times = { loads: 0 };
    const release = holdGroupLoad(store, times, [groupOf('grp-first', '排在前面的群')]);
    release();

    const { wrapper } = await mountView('/group?group=grp-gone');
    await flushPromises();

    // store 自己的默认选中（列表第一个）保留，界面不停在空态；
    // 但必须告诉用户"你要找的那个群没找到"，否则他会以为打开的就是那个群。
    expect(store.currentGroupId).toBe('grp-first');
    expect(wrapper.find('.toast-stub').text(), '读完了还是没有这个群，必须告诉用户而不是静默')
      .toContain('群聊不存在');
    wrapper.unmount();
  });

  it('不带 ?group= 时不改地址栏，也不报错', async () => {
    const store = useGroupChatStore();
    const times = { loads: 0 };
    const release = holdGroupLoad(store, times, [groupOf('grp-first', '排在前面的群')]);
    release();

    const { wrapper, router } = await mountView('/group');
    await flushPromises();

    // 没有深链目标时视图不去拉闸门：把群列表读回来是 App.vue 启动链的活
    // （那边已改成 ensureLoaded，见 src/App.vue 的 Promise.all），视图再读一遍就是重复读库。
    expect(times.loads, '无 ?group= 时视图不该自己起一次读库').toBe(0);
    expect(router.currentRoute.value.query.group, '没有深链目标时不该被塞进地址栏').toBeUndefined();
    // Toast 组件在页面里常驻（桩看不见 modelValue），所以断言的是"没有话说"而不是"没有元素"
    expect(wrapper.find('.toast-stub').text(), '不该凭空报错').toBe('');
    wrapper.unmount();
  });
});
