/**
 * 世界书"事件管理"面板的逐字段编辑（§七 #21 的现场反证）
 *
 * 改前这条路径是死的：新建事件后名称/描述/关键词三样全空，`updateEvent` 拿合并后的
 * 整条事件跑 `validateEvent`，于是任何单字段更新都被另外两样的"不能为空"顶回——
 * 面板输入框又是 `:value` 单向绑定，字看着还在、store 里是空的，用户完全无从发现。
 *
 * 这里钉四件事：
 * 1. 在面板里一个字段一个字段敲，store 里真的存下来了；
 * 2. 编辑不弹"已更新"提示（静默），否则敲四个字弹四条；
 * 3. 没填全时点"触发"会被拒，且提示说的是缺哪一项；
 * 4. 填全之后同一个按钮就能激活它。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import WorldBookEventsPanel from '@/components/worldbook/WorldBookEventsPanel.vue';
import Toast from '@/components/common/Toast.vue';
import { useLorebookStore } from '@/stores/lorebook';
import { useEventsStore } from '@/stores/events';
import { t } from '@/i18n';

async function mountPanelWithLorebook() {
  const lbStore = useLorebookStore();
  const lbId = lbStore.createLorebook({ name: '事件面板测试世界', description: '' });
  lbStore.selectLorebook(lbId);
  const wrapper = mount(WorldBookEventsPanel, { attachTo: document.body });
  await wrapper.vm.$nextTick();
  return wrapper;
}

/** 点"新建全局事件"，返回新事件的 id（面板会自动选中它并渲染编辑器） */
async function createEventViaPanel(wrapper: Awaited<ReturnType<typeof mountPanelWithLorebook>>) {
  const eventsStore = useEventsStore();
  await wrapper.find('.add-event-btn').trigger('click');
  await wrapper.vm.$nextTick();
  const id = eventsStore.events[eventsStore.events.length - 1]!.id;
  await wrapper.vm.$nextTick();
  return id;
}

/** 把面板里的输入当真人那样敲进去 */
async function typeInto(
  wrapper: Awaited<ReturnType<typeof mountPanelWithLorebook>>,
  selector: string,
  value: string
) {
  await wrapper.find(selector).setValue(value);
  await wrapper.vm.$nextTick();
}

beforeEach(() => {
  setActivePinia(createPinia());
  document.body.innerHTML = '';
});

describe('世界书事件面板逐字段编辑', () => {
  it('新建事件后逐字段输入，store 里真的存下来了', async () => {
    const wrapper = await mountPanelWithLorebook();
    const eventsStore = useEventsStore();
    const id = await createEventViaPanel(wrapper);

    await typeInto(wrapper, `#evt-name-${id}`, '断桥拦路');
    await typeInto(wrapper, `#evt-desc-${id}`, '商队必经的木桥昨夜断了。');
    await typeInto(wrapper, `#evt-kw-${id}`, '商队, 桥');

    const evt = eventsStore.getEvent(id)!;
    expect(evt.name).toBe('断桥拦路');
    expect(evt.description).toBe('商队必经的木桥昨夜断了。');
    expect(evt.trigger.type === 'keyword' && evt.trigger.keywords).toEqual(['商队', '桥']);
    // 编辑器标题跟着走，用户看得见自己填的东西进了哪
    expect(wrapper.find('.event-editor-header h3').text()).toBe('断桥拦路');
  });

  it('编辑不弹"已更新"提示（每敲一个字弹一条是噪声）', async () => {
    const wrapper = await mountPanelWithLorebook();
    const eventsStore = useEventsStore();
    const id = await createEventViaPanel(wrapper);
    const toast = wrapper.findComponent(Toast);

    // 新建那一下是离散动作，允许提示
    expect(toast.props('modelValue')).toBe(true);

    await typeInto(wrapper, `#evt-name-${id}`, '断');
    await typeInto(wrapper, `#evt-name-${id}`, '断桥');
    await typeInto(wrapper, `#evt-name-${id}`, '断桥拦');
    expect(eventsStore.getEvent(id)!.name).toBe('断桥拦');
    expect(eventsStore.lastInfo).toBe(t('ev.created2'));
    // 提示里还是"新建"那一条：三次敲字一条都没多弹
    expect(toast.props('message')).toBe(t('ev.created2'));
  });

  it('没填全时点"触发"被拒，提示说的是缺哪一项', async () => {
    const wrapper = await mountPanelWithLorebook();
    const eventsStore = useEventsStore();
    const id = await createEventViaPanel(wrapper);

    await wrapper.find('.action-btn.trigger').trigger('click');
    await wrapper.vm.$nextTick();

    expect(eventsStore.getEvent(id)!.state).toBe('pending');
    const toast = wrapper.findComponent(Toast);
    expect(toast.props('modelValue')).toBe(true);
    expect(toast.props('message')).toContain(t('eventTypes.nameRequired'));
  });

  it('填全之后同一个按钮就能激活它', async () => {
    const wrapper = await mountPanelWithLorebook();
    const eventsStore = useEventsStore();
    const id = await createEventViaPanel(wrapper);

    await typeInto(wrapper, `#evt-name-${id}`, '断桥拦路');
    await typeInto(wrapper, `#evt-desc-${id}`, '商队必经的木桥昨夜断了。');
    // 关键词也是必填：少了它这一步会被拒（这正是"缺什么说什么"的意义）
    await typeInto(wrapper, `#evt-kw-${id}`, '商队');
    await wrapper.find('.action-btn.trigger').trigger('click');
    await wrapper.vm.$nextTick();

    expect(eventsStore.getEvent(id)!.state).toBe('active');
    expect(eventsStore.getEvent(id)!.triggerCount).toBe(1);
    expect(wrapper.find('.event-state-badge').text()).toBe(t('wbEvents.stateActive'));
  });

  it('写入被拒时：值不存、字留在框里、并明确说"这个值没有保存"', async () => {
    const wrapper = await mountPanelWithLorebook();
    const eventsStore = useEventsStore();
    const id = await createEventViaPanel(wrapper);
    await typeInto(wrapper, `#evt-name-${id}`, '断桥拦路');
    await typeInto(wrapper, `#evt-desc-${id}`, '商队必经的木桥昨夜断了。');

    // 勾上"使用正则"后，一个非法表达式就会被 store 拒掉
    const regexBox = wrapper.findAll('.checkbox-row input[type="checkbox"]')[0]!;
    await regexBox.setValue(true);
    await typeInto(wrapper, `#evt-kw-${id}`, '(');
    await wrapper.vm.$nextTick();

    const evt = eventsStore.getEvent(id)!;
    // ① store 里没收下这个值（仍是空关键词）
    expect(evt.trigger.type === 'keyword' && evt.trigger.keywords).toEqual([]);
    // ② 用户打的字留在框里（改前 `:value` 单向绑定会把它直接吞掉——真实浏览器实测
    //    打 `(` 之后输入框是空的，用户只会以为"我按了键盘没反应"）
    expect((wrapper.find(`#evt-kw-${id}`).element as HTMLInputElement).value).toBe('(');
    // ③ 这个差被明确说出来，而不是只靠闪一次的 toast
    const note = wrapper.find('.form-field-error');
    expect(note.exists()).toBe(true);
    expect(note.text()).toBe(
      t('wbEvents.saveRejected', { reason: '无效的正则表达式：(' })
    );
    // 边打字边拒绝的字段必须走礼貌播报，不能每敲一个非法字符就打断读屏
    expect(note.attributes('role')).toBe('status');
    expect(wrapper.find(`#evt-kw-${id}`).attributes('aria-invalid')).toBe('true');
    expect(wrapper.find(`#evt-kw-${id}`).classes()).toContain('is-rejected');
    // ④ 关键增益：这句话现在被控件的 aria-describedby 指到了。
    //    改前它是控件之后的一个裸 <p>，读屏聚焦到输入框时完全带不出来。
    const describedBy = wrapper.find(`#evt-kw-${id}`).attributes('aria-describedby') ?? '';
    const errorId = note.attributes('id');
    expect(errorId, '报错段落没有 id，接不进 aria-describedby').toBeTruthy();
    expect(describedBy.split(/\s+/), '控件没指向那句拒绝说明').toContain(errorId);
  });

  it('勾掉"使用正则"时按框里现在那串写回，草稿不被 store 里的旧值顶掉', async () => {
    const wrapper = await mountPanelWithLorebook();
    const eventsStore = useEventsStore();
    const id = await createEventViaPanel(wrapper);
    await typeInto(wrapper, `#evt-name-${id}`, '断桥拦路');
    await typeInto(wrapper, `#evt-desc-${id}`, '商队必经的木桥昨夜断了。');

    // 先进入"被拒"态：勾上正则 + 打一个非法表达式
    const regexBox = wrapper.findAll('.checkbox-row input[type="checkbox"]')[0]!;
    await regexBox.setValue(true);
    await typeInto(wrapper, `#evt-kw-${id}`, '(');
    expect(wrapper.find('.form-field-error').exists()).toBe(true);

    // 再取消勾选：这一下应当按"框里现在显示的 '(' "写回，而不是按 store 里的空数组
    await regexBox.setValue(false);
    const trig = eventsStore.getEvent(id)!.trigger;
    expect(trig.type === 'keyword' && trig.keywords).toEqual(['(']);
    expect(trig.type === 'keyword' && trig.useRegex).toBe(false);
    expect(wrapper.find('.form-field-error').exists()).toBe(false);
  });

  it('把值改对之后，"未保存"标注自己消失', async () => {
    const wrapper = await mountPanelWithLorebook();
    const eventsStore = useEventsStore();
    const id = await createEventViaPanel(wrapper);
    await typeInto(wrapper, `#evt-name-${id}`, '断桥拦路');
    await typeInto(wrapper, `#evt-desc-${id}`, '商队必经的木桥昨夜断了。');
    const regexBox = wrapper.findAll('.checkbox-row input[type="checkbox"]')[0]!;
    await regexBox.setValue(true);
    await typeInto(wrapper, `#evt-kw-${id}`, '(');
    expect(wrapper.find('.form-field-error').exists()).toBe(true);

    await typeInto(wrapper, `#evt-kw-${id}`, '桥|河滩');
    const evt = eventsStore.getEvent(id)!;
    expect(evt.trigger.type === 'keyword' && evt.trigger.keywords).toEqual(['桥|河滩']);
    expect(wrapper.find('.form-field-error').exists()).toBe(false);
    expect(wrapper.find(`#evt-kw-${id}`).classes()).not.toContain('is-rejected');
  });
});
