/**
 * 世界书"最小生效三步"（M3-b3）
 *
 * 一条设定要真的进提示词，需要三件事同时成立：有书、书里有一条**启用且常驻**的条目、
 * 这本书绑到当前角色。少任何一步，用户看到的都是"我建了世界书但没效果"。
 * 这里守的是三步的**实质**而不只是按钮可点：
 * 条目必须是 constant + enabled（否则不会无条件注入）、绑定要落在当前角色、
 * 以及不能跳步做出无效操作（没书时后两步禁用）。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import QuickLorebookFlow from '@/components/worldbook/QuickLorebookFlow.vue';
import { useCharacterStore } from '@/stores/character';
import { useLorebookStore } from '@/stores/lorebook';
import { t } from '@/i18n';

let characterStore: ReturnType<typeof useCharacterStore>;
let lorebookStore: ReturnType<typeof useLorebookStore>;

function mountFlow() {
  return mount(QuickLorebookFlow);
}

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  characterStore = useCharacterStore();
  lorebookStore = useLorebookStore();
  characterStore.characters.length = 0;
  lorebookStore.lorebooks.length = 0;
  characterStore.characters.push({
    id: 'c1',
    name: '当前角色',
    avatarType: 'gradient',
    gradientFrom: '#123',
    gradientTo: '#456',
    initial: '当',
    lastActive: '刚刚',
    favorite: false,
    tags: [],
    description: 'd',
    model: 'gpt-4o',
    conversations: [],
    messages: [],
    authorNote: '',
    authorDepth: 4,
    temperature: 1,
    tokenBudget: { character: 0, worldInfo: 0, chatHistory: 0, remaining: 8192 },
    boundWorldBookIds: [],
  });
  characterStore.currentCharacterId = 'c1';
});

describe('三步依次生效', () => {
  it('没建书时，第二、三步都不可操作', () => {
    const wrapper = mountFlow();
    expect(wrapper.find('[data-rel-jump="quick-wb-add-entry"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-rel-jump="quick-wb-bind"]').attributes('disabled')).toBeDefined();
  });

  it('书名为空时第一步不建书，并给出可见原因', async () => {
    const wrapper = mountFlow();
    await wrapper.find('[data-rel-jump="quick-wb-create-book"]').trigger('click');
    await flushPromises();

    expect(lorebookStore.lorebooks).toHaveLength(0);
    expect(wrapper.find('[role="alert"]').text()).toBe(t('quick.wbNeedName'));
  });

  it('第一步建出书并把条目建成 constant + enabled（这才是"无条件注入"的前提）', async () => {
    const wrapper = mountFlow();
    await wrapper.find('#qw-book-name').setValue('港口设定');
    await wrapper.find('[data-rel-jump="quick-wb-create-book"]').trigger('click');
    await wrapper.find('#qw-entry-title').setValue('酒馆招牌');
    await wrapper.find('#qw-entry-content').setValue('酒馆永远亮着灯。');
    await wrapper.find('[data-rel-jump="quick-wb-add-entry"]').trigger('click');
    await flushPromises();

    const book = lorebookStore.lorebooks[0]!;
    expect(book.name).toBe('港口设定');
    expect(book.entries).toHaveLength(1);
    expect(book.entries[0]!.title).toBe('酒馆招牌');
    expect(book.entries[0]!.strategy).toBe('constant');
    expect(book.entries[0]!.enabled).toBe(true);
  });

  it('第三步绑定到当前角色，绑定列表里能查到这本书', async () => {
    const wrapper = mountFlow();
    await wrapper.find('#qw-book-name').setValue('港口设定');
    await wrapper.find('[data-rel-jump="quick-wb-create-book"]').trigger('click');
    await wrapper.find('#qw-entry-title').setValue('酒馆招牌');
    await wrapper.find('#qw-entry-content').setValue('酒馆永远亮着灯。');
    await wrapper.find('[data-rel-jump="quick-wb-add-entry"]').trigger('click');
    await wrapper.find('[data-rel-jump="quick-wb-bind"]').trigger('click');
    await flushPromises();

    expect(characterStore.getBoundWorldBookIds('c1')).toContain(lorebookStore.lorebooks[0]!.id);
  });

  it('三步都完成后出现"已生效"的确认，且步骤条三步都标成已完成', async () => {
    const wrapper = mountFlow();
    await wrapper.find('#qw-book-name').setValue('港口设定');
    await wrapper.find('[data-rel-jump="quick-wb-create-book"]').trigger('click');
    await wrapper.find('#qw-entry-title').setValue('酒馆招牌');
    await wrapper.find('#qw-entry-content').setValue('酒馆永远亮着灯。');
    await wrapper.find('[data-rel-jump="quick-wb-add-entry"]').trigger('click');
    await wrapper.find('[data-rel-jump="quick-wb-bind"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('.quick-wb-done').text()).toBe(t('quick.wbAllDone'));
    expect(wrapper.findAll('.step-flow-row.done')).toHaveLength(3);
  });

  it('步骤条用 StepFlow（清单态），三步文案来自注册表而不是散落字面量', () => {
    const wrapper = mountFlow();
    const rows = wrapper.findAll('.step-flow-row');
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.find('.step-flow-text').text())).toEqual([
      t('quick.wbStepBook'),
      t('quick.wbStepEntry'),
      t('quick.wbStepBind'),
    ]);
  });
});

/**
 * 没有当前角色时，第三步原先是一颗**永久禁用**的按钮：
 * `:disabled="!currentCharacter"` 让处理函数根本跑不到，于是为这种情况写好的
 * `quick.wbBindFailed` 永远上不了屏幕，用户只能对着一层 0.55 透明度猜原因。
 * 现在给的是"为什么 + 一条真出路"（全局书不需要绑定）。
 */
describe('没有当前角色时', () => {
  beforeEach(() => {
    characterStore.currentCharacterId = '';
    characterStore.characters.length = 0;
  });

  it('不再渲染"绑定"按钮，而是说明缺什么、并给出改为全局书的出路', async () => {
    const wrapper = mountFlow();
    expect(wrapper.find('[data-rel-jump="quick-wb-bind"]').exists()).toBe(false);
    expect(wrapper.find('.quick-wb-bind-line').text()).toBe(t('quick.wbNoCharacter'));

    await wrapper.find('#qw-book-name').setValue('酒馆设定');
    await wrapper.find('[data-rel-jump="quick-wb-create-book"]').trigger('click');
    await wrapper.find('#qw-entry-title').setValue('吧台');
    await wrapper.find('#qw-entry-content').setValue('酒馆永远亮着灯。');
    await wrapper.find('[data-rel-jump="quick-wb-add-entry"]').trigger('click');
    await flushPromises();

    const globalBtn = wrapper.find('[data-rel-jump="quick-wb-make-global"]');
    expect(globalBtn.exists()).toBe(true);
    expect(globalBtn.attributes('disabled')).toBeUndefined();
    // 第三步的标签也跟着实际出路走，不再写"绑定到当前角色"
    expect(wrapper.findAll('.step-flow-row')[2]!.find('.step-flow-text').text()).toBe(t('quick.wbDoGlobal'));
  });

  it('改成全局书后：书的作用域真的变了，第三步真的打勾', async () => {
    const wrapper = mountFlow();
    await wrapper.find('#qw-book-name').setValue('酒馆设定');
    await wrapper.find('[data-rel-jump="quick-wb-create-book"]').trigger('click');
    await wrapper.find('#qw-entry-title').setValue('吧台');
    await wrapper.find('#qw-entry-content').setValue('酒馆永远亮着灯。');
    await wrapper.find('[data-rel-jump="quick-wb-add-entry"]').trigger('click');
    await flushPromises();

    await wrapper.find('[data-rel-jump="quick-wb-make-global"]').trigger('click');
    await flushPromises();

    expect(lorebookStore.lorebooks[0]?.scope).toBe('global');
    expect(wrapper.findAll('.step-flow-row.done')).toHaveLength(3);
    expect(wrapper.find('.quick-wb-done').text()).toBe(t('quick.wbGlobalDone'));
    // 三步齐了才给"完成"，此时它收的是流程本身
    expect(wrapper.find('[data-rel-jump="quick-wb-finish"]').exists()).toBe(true);
  });

  it('角色名不再借用"未配置"（那是讲模型配置的字符串）', () => {
    const wrapper = mountFlow();
    expect(wrapper.text()).not.toContain(t('chat.modelNotConfigured'));
  });
});
