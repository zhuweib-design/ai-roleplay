/**
 * 世界书深链 `?book=<id>` 必须等列表读完再解析（M17-b）
 *
 * 这是 M16-b 闸门登记表之后的**第二条**新接深链，用途之一就是验证那张表真的省事：
 * 视图只说键名（`book`），"该等哪个库"由 `src/stores/deep-link-gate.ts` 决定，
 * 接线过程没有再出现"自己挑一个 ensureLoaded"的机会。
 *
 * 世界书页有一个角色页没有的陷阱：读库完成后它会**默认选中第一本**
 * （`stores/lorebook.ts` 的 loadFromStorage）。所以"深链没命中"不会停在空态，
 * 而是安静地打开另一本书 —— 用户看到的世界书不是他点进来的那本。
 * 三条断言各自盯住：等读完才选中、没命中必须说出来、不带键时视图不自己起读库。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import WorldBookView from '@/views/WorldBookView.vue';
import { useLorebookStore } from '@/stores/lorebook';

const TARGET_ID = 'lb-target';

function book(id: string, name: string): Record<string, unknown> {
  return {
    id,
    name,
    description: '',
    scope: 'global',
    active: true,
    entries: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

/** 只暴露"读库还没完成"这一个闸门：loadLorebooks 由测试放手 */
function holdBookLoad(
  store: ReturnType<typeof useLorebookStore>,
  times: { loads: number },
  rows: Array<Record<string, unknown>>
) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  store.setStorageAdapter({
    loadLorebooks: async () => {
      times.loads++;
      await gate;
      return rows as never;
    },
    saveLorebook: () => Promise.resolve(),
    deleteLorebook: () => Promise.resolve(),
  } as never);
  return release;
}

async function mountView(fullPath: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'chat', component: { template: '<div />' } },
      { path: '/worldbook', name: 'worldbook', component: WorldBookView },
    ],
  });
  await router.push(fullPath);
  await router.isReady();
  const wrapper = mount(WorldBookView, {
    global: {
      plugins: [router],
      stubs: {
        Modal: true,
        Icon: true,
        Collapse: true,
        EmptyState: true,
        FormField: true,
        StepFlow: true,
        HelpTip: true,
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

describe('世界书页的 ?book= 深链', () => {
  it('读库完成后选中 URL 那本，并把书 id 写回地址栏', async () => {
    const store = useLorebookStore();
    const times = { loads: 0 };
    const release = holdBookLoad(store, times, [
      book('lb-first', '排在最前的书'),
      book(TARGET_ID, '目标世界书'),
    ]);

    const { wrapper, router } = await mountView(`/worldbook?book=${TARGET_ID}`);
    await flushPromises();
    // 闸门还没放开：既不选中，也不许悄悄落到"列表第一本"
    expect(store.currentLorebookId, '读库没完成时不应该有选中态').toBeNull();

    release();
    await flushPromises();

    expect(times.loads, '视图自己把闸门拉起来，只读一遍').toBe(1);
    expect(store.currentLorebookId, '深链没落到目标世界上').toBe(TARGET_ID);
    expect(router.currentRoute.value.query.book, '选中后地址栏要跟着当前书走').toBe(TARGET_ID);
    wrapper.unmount();
  });

  it('读完仍然没有这本书时说"找不到那本世界书"，不是安静打开第一本', async () => {
    const store = useLorebookStore();
    const times = { loads: 0 };
    const release = holdBookLoad(store, times, [book('lb-first', '排在最前的书')]);
    release();

    const { wrapper } = await mountView('/worldbook?book=lb-gone');
    await flushPromises();

    // store 的默认选中（第一本）保留，页面不停在空态；
    // 但必须告诉用户"你要找的那本没找到"，否则他会以为看到的就是那本。
    expect(store.currentLorebookId).toBe('lb-first');
    // 世界书页里挂着两枚 Toast（视图自身 + 一个子组件），桩按名字匹配 ⇒ 两枚都在，
    // 消息落在其中一枚上。所以断言的是"某枚说了这句话"，不是"第一枚说了"。
    const toasts = wrapper.findAll('.toast-stub').map((n) => n.text()).join(' ');
    expect(toasts, '读完了还是没有这本，必须说出来而不是静默换一本').toContain('找不到那本世界书');
    wrapper.unmount();
  });

  it('不带 ?book= 时不改地址栏、不报错，也不自己起一次读库', async () => {
    const store = useLorebookStore();
    const times = { loads: 0 };
    const release = holdBookLoad(store, times, [book('lb-first', '排在最前的书')]);
    release();

    const { wrapper, router } = await mountView('/worldbook');
    await flushPromises();

    // 没有深链目标时视图不去拉闸门：读列表是 App.vue 启动链的活（那边已改走 ensureLoaded）
    expect(times.loads, '无 ?book= 时视图不该自己起一次读库').toBe(0);
    expect(router.currentRoute.value.query.book, '没有深链目标时不该被塞进地址栏').toBeUndefined();
    const quiet = wrapper.findAll('.toast-stub').map((n) => n.text()).join('');
    expect(quiet, '不该凭空报错').toBe('');
    wrapper.unmount();
  });

  /**
   * 这条是 M16-b 登记表存在的理由，直接在这里验一次：
   * `book` 这个键等的是**世界书库**，不是随便哪个 ensureLoaded。
   * 视图不传 load，所以挑库的机会根本没有；一旦有人把 book 登记到别的库，
   * 这条会红（同 tests/stores/deep-link-gate.test.ts 的注入形状）。
   */
  it('闸门取自登记表：book 等的是世界书库', async () => {
    const store = useLorebookStore();
    const times = { loads: 0 };
    const release = holdBookLoad(store, times, [book(TARGET_ID, '目标世界书')]);

    const { wrapper } = await mountView(`/worldbook?book=${TARGET_ID}`);
    await flushPromises();
    expect(times.loads, '登记表没把 book 指到世界书库（或视图自己传了别的 load）').toBe(1);

    release();
    await flushPromises();
    expect(store.loaded, '闸门落地后应置位').toBe(true);
    expect(store.currentLorebookId).toBe(TARGET_ID);
    wrapper.unmount();
  });
});
