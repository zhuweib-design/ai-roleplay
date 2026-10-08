/**
 * 角色快速档（M3-b3）
 *
 * 守四条：
 * - 名字为空不许建（错误可见，且不产生角色）；
 * - 建出来的角色带着填的名字与设定，并进入对话页；
 * - 选中的世界书确实绑到了**这个新角色**上（设计文档 §3.5.6：绑定必须在拿到 ID 之后，
 *   否则 bindWorldBook 找不到角色只返回 false，用户看到"建好了但书没生效"）；
 * - 草稿态不给"跳去编辑"的链接（/character/new 还没有 ID，跳过去是空跳）。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import QuickCharacterForm from '@/components/character/QuickCharacterForm.vue';
import { useCharacterStore } from '@/stores/character';
import { useLorebookStore } from '@/stores/lorebook';
import { t } from '@/i18n';

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'chat', component: { template: '<div />' } },
      { path: '/chat', name: 'chat2', component: { template: '<div />' } },
      { path: '/character', name: 'character-list', component: { template: '<div />' } },
      { path: '/character/:id/edit', name: 'character-edit', component: { template: '<div />' } },
    ],
  });
}

function submit(wrapper: VueWrapper<any>) {
  // jsdom 不在 click 上代跑表单提交，这里直接派发 submit（那颗按钮是 type=submit）
  return wrapper.find('form').trigger('submit');
}

async function mountForm() {
  const router = makeRouter();
  await router.push('/chat');
  await router.isReady();
  const wrapper = mount(QuickCharacterForm, { global: { plugins: [router] } });
  return { wrapper, router };
}

let characterStore: ReturnType<typeof useCharacterStore>;

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  characterStore = useCharacterStore();
  characterStore.characters.length = 0;
});

describe('校验', () => {
  it('名字为空时点保存：给出可见错误，且不创建角色', async () => {
    const { wrapper, router } = await mountForm();
    await submit(wrapper);
    await flushPromises();

    expect(wrapper.find('[role="alert"]').text()).toBe(t('charEdit.nameRequired'));
    expect(characterStore.characters).toHaveLength(0);
    expect(router.currentRoute.value.name).toBe('chat2'); // 本用例路由表里 /chat 的名字
  });

  it('草稿态不给任何"跳去编辑"的链接', async () => {
    const { wrapper } = await mountForm();
    const hrefs = wrapper.findAll('a').map((a) => a.attributes('href'));
    expect(hrefs.filter((h) => typeof h === 'string' && h.includes('/edit'))).toHaveLength(0);
  });
});

describe('保存', () => {
  it('填名字与设定后建角色，写入这两项并进对话页', async () => {
    const { wrapper, router } = await mountForm();
    await wrapper.find('#qc-name').setValue('夜巡侦探');
    await wrapper.find('#qc-desc').setValue('雨夜港口，说话简短。');
    await submit(wrapper);
    await flushPromises();

    expect(characterStore.characters).toHaveLength(1);
    const created = characterStore.characters[0]!;
    expect(created.name).toBe('夜巡侦探');
    expect(created.description).toBe('雨夜港口，说话简短。');
    expect(router.currentRoute.value.name).toBe('chat');
  });

  it('选了一本世界书：绑定落在新建出来的那个角色上', async () => {
    const lorebookStore = useLorebookStore();
    const bookId = lorebookStore.createLorebook({ name: '港口设定', scope: 'character' });
    const { wrapper } = await mountForm();
    await wrapper.find('#qc-name').setValue('夜巡侦探');
    await wrapper.find('#qc-book').setValue(bookId);
    await submit(wrapper);
    await flushPromises();

    const created = characterStore.characters[0]!;
    expect(characterStore.getBoundWorldBookIds(created.id)).toContain(bookId);
  });

  it('不选书时绑定列表为空（而不是绑了个 undefined）', async () => {
    const { wrapper } = await mountForm();
    await wrapper.find('#qc-name').setValue('无书角色');
    await submit(wrapper);
    await flushPromises();

    expect(characterStore.getBoundWorldBookIds(characterStore.characters[0]!.id)).toEqual([]);
  });

  it('emit created 带上新角色 ID（供上层接着做别的事）', async () => {
    const { wrapper } = await mountForm();
    await wrapper.find('#qc-name').setValue('带事件的角色');
    await submit(wrapper);
    await flushPromises();

    const emitted = wrapper.emitted('created')?.at(-1);
    expect(emitted?.[0]).toBe(characterStore.characters[0]!.id);
  });
});

/**
 * 一本书都没有时，下拉里只剩"暂不绑定"——那不叫选择。
 * 实测场景：沙箱里 0 本世界书，用户对着一个只有一项的下拉以为是自己哪里没做对。
 */
describe('世界书下拉的说明随真实数据变', () => {
  it('没有可绑的书时，说明写清"为什么只有一项"和之后怎么办', async () => {
    useLorebookStore().lorebooks.length = 0;
    const { wrapper } = await mountForm();
    const hint = wrapper.find('#qc-book').attributes('aria-describedby');
    const described = hint ? wrapper.find(`#${hint.split(' ')[0]}`).text() : '';

    expect(described).toBe(t('quick.charBookEmpty'));
    // 不新增"跳去建书"的按钮：离开 /character/new 会丢掉已填的草稿，
    // 而这本书建完后在编辑页照样能绑——留说明比留一个会毁草稿的按钮诚实。
    expect(wrapper.text()).not.toContain(t('quick.charBookHint'));
  });

  it('有书时回到常规说明，并把书名列进选项', async () => {
    const lorebook = useLorebookStore();
    lorebook.lorebooks.push({ id: 'lb1', name: '酒馆设定', scope: 'global', entries: [] } as never);
    const { wrapper } = await mountForm();
    const hint = wrapper.find('#qc-book').attributes('aria-describedby');
    const described = hint ? wrapper.find(`#${hint.split(' ')[0]}`).text() : '';

    expect(described).toBe(t('quick.charBookHint'));
    expect(wrapper.find('#qc-book').findAll('option').map((o) => o.text())).toEqual([
      t('quick.charBookNone'),
      '酒馆设定',
    ]);
  });
});
