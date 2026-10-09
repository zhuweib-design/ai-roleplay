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
});
