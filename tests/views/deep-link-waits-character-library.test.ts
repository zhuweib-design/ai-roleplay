/**
 * 深链必须等角色库读完再解析角色 id（M12-a）
 *
 * 起因是 webkit 下一条 e2e 走不到合并冲突：诊断脚本打出落盘的版本仓库，发现
 * `characterId` 是 `seraphina`（mock 种子第一条），而 URL 里带的是刚建的角色 id，
 * 且**每一条提交的快照都是种子角色的描述**。
 *
 * 根因不在 Safari 慢，而在两个视图都赶在角色库读完之前决定了"这条 URL 是哪个角色"：
 * - 版本页匹配不到就落到"自动选中第一条" ⇒ 悄悄把版本历史写在**另一条角色**身上；
 * - 编辑页匹配不到就报"角色不存在"并把用户弹回列表 ⇒ 新建的角色永远打不开深链。
 *
 * 三条判定都做过故障注入，红点位置分别是：
 * - 撤掉版本页的等待 ⇒ 红在 `currentCharacterId` 不等于 URL 里那条（版本历史没挂上）；
 * - 撤掉编辑页的等待 ⇒ 红在表单是空的 / 被弹回列表；
 * - 撤掉 `ensureLoaded` 的去重 ⇒ 红在"同一次读库只发生一遍"（变成 2 遍）。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import CharacterVersionView from '@/views/CharacterVersionView.vue';
import CharacterEditorView from '@/views/CharacterEditorView.vue';
import { useCharacterStore } from '@/stores/character';
import { useCharacterVersionStore } from '@/stores/character-version';
import { t } from '@/i18n';

const ARCHIVED = {
  id: 'saved-1',
  name: '存档角色',
  avatar: '',
  description: '存档里的描述',
  personality: '',
  scenario: '',
  tags: [],
  favorite: false,
  characterNote: '',
};

function makeRouter(initial: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'chat', component: { template: '<div />' } },
      { path: '/character', name: 'character-list', component: { template: '<div />' } },
      { path: '/character/new', name: 'character-new', component: { template: '<div />' } },
      {
        path: '/character/:id/edit',
        name: 'character-edit',
        props: true,
        component: { template: '<div />' },
      },
      { path: '/character-version', name: 'character-version', component: CharacterVersionView },
    ],
  });
  return router.push(initial).then(() => router);
}

/** 只暴露"读库还没完成"这一个闸门：loadCharacters 返回一个由测试放手的 promise */
function holdCharacterLoad(store: ReturnType<typeof useCharacterStore>, times: { loads: number }) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  store.setStorageAdapter({
    loadCharacters: async () => {
      times.loads++;
      await gate;
      return [ARCHIVED] as never;
    },
    saveCharacter: () => Promise.resolve(),
    loadCharacter: () => Promise.resolve(null),
    deleteCharacter: () => Promise.resolve(),
  } as never);
  return release;
}

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});

describe('版本页 ?char= 的角色归属', () => {
  it('版本历史必须挂在 URL 指定的那条角色上（读库没完成时不许先选任何角色）', async () => {
    const cs = useCharacterStore();
    // 2026-10-26 起角色库从空开始（不再有 mock 种子）：读库完成前内存里一条都没有，
    // 这时若视图"自动选中第一条"就会选中 undefined / 空 id，把版本历史挂到空气上。
    expect(cs.characters, '角色库初值应为空').toEqual([]);

    const times = { loads: 0 };
    const release = holdCharacterLoad(cs, times);
    const vs = useCharacterVersionStore();
    const router = await makeRouter('/character-version?char=saved-1');
    const wrapper = mount(CharacterVersionView, { global: { plugins: [router], stubs: { Modal: true, Toast: true, Icon: true, Collapse: true } } });
    await flushPromises();

    // 反证点：撤掉等待后这里会被写成某条"先到的"角色（过去是种子第一条）
    expect(vs.currentCharacterId, '读库还没完成时不应该已经选好角色').toBeNull();
    expect(vs.trackedCharacterIds.size, '读库没完成时不该给任何角色建仓库').toBe(0);

    release();
    await flushPromises();

    expect(vs.currentCharacterId).toBe(ARCHIVED.id);
    expect(vs.headVersion?.snapshot.name, '版本历史必须挂在这条角色上').toBe(ARCHIVED.name);
    wrapper.unmount();
  });

  it('URL 里的角色读完库仍然不存在时，报错而不是换成别的角色', async () => {
    const cs = useCharacterStore();
    const times = { loads: 0 };
    const release = holdCharacterLoad(cs, times);
    release();
    await flushPromises();

    const vs = useCharacterVersionStore();
    // 版本引擎是模块级单例（不随 pinia 重置），所以只能比"挂载前后有没有多出来"
    const reposBefore = vs.trackedCharacterIds.size;
    const router = await makeRouter('/character-version?char=nope');
    const wrapper = mount(CharacterVersionView, {
      global: {
        plugins: [router],
        stubs: {
          Modal: true,
          Icon: true,
          Collapse: true,
          // 把提示文本读出来：报错必须真的说到用户面前，而不是只写在 store 里被清空
          Toast: {
            props: ['modelValue', 'message', 'type'],
            template: '<div class="toast-stub">{{ message }}</div>',
          },
        },
      },
    });
    await flushPromises();

    expect(times.loads, '启动与视图共用同一次读库').toBeGreaterThan(0);
    expect(vs.currentCharacterId, '找不到就不能换成另一条角色').not.toBe(useCharacterStore().characters[0]!.id);
    expect(vs.trackedCharacterIds.size, '找不到角色时也不该顺手建仓库').toBe(reposBefore);
    expect(wrapper.find('.toast-stub').text()).toContain(t('cv2.charNotExist', { id: 'nope' }));
    wrapper.unmount();
  });
});

describe('编辑页深链', () => {
  it('读库没完成前不弹回列表，读完后再填表单', async () => {
    const cs = useCharacterStore();
    const times = { loads: 0 };
    const release = holdCharacterLoad(cs, times);

    const router = await makeRouter('/character/saved-1/edit');
    const wrapper = mount(CharacterEditorView, {
      props: { id: 'saved-1' },
      global: { plugins: [router], stubs: { Modal: true, Toast: true } },
      attachTo: document.body,
    });
    await flushPromises();

    expect(router.currentRoute.value.name, '还没读完成就跳走，是假报"角色不存在"').toBe('character-edit');

    release();
    await flushPromises();

    const nameInput = wrapper.find('#f-name').element as HTMLInputElement;
    expect(nameInput.value, '表单必须填的是 URL 那条角色').toBe(ARCHIVED.name);
    expect(router.currentRoute.value.name).toBe('character-edit');
    wrapper.unmount();
  });
});

describe('character store 的 ensureLoaded', () => {
  it('并发调用只读一遍库，读完置位标志', async () => {
    const cs = useCharacterStore();
    const times = { loads: 0 };
    const release = holdCharacterLoad(cs, times);

    const first = cs.ensureLoaded();
    const second = cs.ensureLoaded();
    expect(cs.libraryLoaded, '读库没落地前不得置位').toBe(false);
    release();
    await Promise.all([first, second]);

    expect(times.loads).toBe(1);
    expect(cs.libraryLoaded).toBe(true);
    expect(cs.characters.map((c) => c.id)).toEqual([ARCHIVED.id]);
    // 已经读过就不再读第二次
    await cs.ensureLoaded();
    expect(times.loads).toBe(1);
  });
});
