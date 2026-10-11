/**
 * 深链键 → 闸门的登记表（M16-b）
 *
 * 要钉住的是"键对、库错"这一类：视图不再自己传 `load` 之后，等哪个库完全由
 * `DEEP_LINK_GATES` 决定。所以这里验三件事：
 * 1. 不传 load 时，composable 等的就是登记表里那个库（用挂起的适配器造出真实等待）；
 * 2. 没登记的键拿不到闸门，且报出来的话直接指出该去哪儿登记；
 * 3. 登记表覆盖的键与四个视图实际用到的键一致（漂移了就会在这里红）。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { defineComponent, h } from 'vue';
import { createRouter, createMemoryHistory } from 'vue-router';
import { DEEP_LINK_GATES, REGISTERED_DEEP_LINK_KEYS, ensureDeepLinkLoaded } from '@/core/deep-link-keys';
import { useDeepLinkId } from '@/composables/useDeepLinkId';
import { useGroupChatStore } from '@/stores/group-chat';

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});

describe('深链闸门登记表', () => {
  it('未登记的键拿不到闸门，报错里写清去哪儿登记', async () => {
    await expect(ensureDeepLinkLoaded('lorebook')).rejects.toThrow(/DEEP_LINK_GATES/);
  });

  it('登记表覆盖四个视图实际用到的键', () => {
    expect(REGISTERED_DEEP_LINK_KEYS.sort()).toEqual(['char', 'group', 'id', 'story']);
    // 每个登记项都得是一个能返回 Promise 的闸门
    for (const key of REGISTERED_DEEP_LINK_KEYS) {
      expect(typeof DEEP_LINK_GATES[key]).toBe('function');
    }
  });

  it('视图不传 load 时，等的是登记表里那个库（不是随便某个库）', async () => {
    const store = useGroupChatStore();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    store.setStorageAdapter({
      loadGroupChats: async () => {
        await gate;
        return [];
      },
      saveGroupChat: () => Promise.resolve(),
      deleteGroupChat: () => Promise.resolve(),
    } as never);

    const log: string[] = [];
    const Probe = defineComponent({
      setup() {
        useDeepLinkId({
          key: 'group',
          // 故意不传 load：闸门应由 DEEP_LINK_GATES 给
          onResolved: (id) => log.push(`resolved:${id}`),
        });
        return () => h('div');
      },
    });

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/group', component: Probe }],
    });
    await router.push('/group?group=grp-a');
    await router.isReady();
    const wrapper = mount(Probe, { global: { plugins: [router] } });

    await flushPromises();
    expect(log, '群库还没读完就该回调 ⇒ 说明没等闸门').toEqual([]);
    expect(store.loaded, '闸门应已把读库拉起来').toBe(false);

    release();
    await flushPromises();
    expect(store.loaded, '等的是 groupChat 库的 ensureLoaded').toBe(true);
    expect(log).toEqual(['resolved:grp-a']);
    wrapper.unmount();
  });
});
