/**
 * L 层组件的挂载测试：就绪条与前置条件横幅
 *
 * 关注三件事：芯片数与状态类、点击是否走带 from 的深链、锁定态文案不复用"未配置"。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import ContextReadinessBar from '@/components/layout/ContextReadinessBar.vue';
import PrereqNotice from '@/components/common/PrereqNotice.vue';
import { useSettingsStore } from '@/stores/settings';
import { useDataBankPrereqs, useReadinessChips } from '@/core/readiness';
import { setVectorRagEnabled } from '@/core/dual-channel-runtime';

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'chat', component: { template: '<div />' } },
      { path: '/chat', name: 'chat2', component: { template: '<div />' } },
      { path: '/settings', name: 'settings', component: { template: '<div />' } },
      { path: '/worldbook', name: 'worldbook', component: { template: '<div />' } },
      { path: '/databank', name: 'databank', component: { template: '<div />' } },
      { path: '/character', name: 'character-list', component: { template: '<div />' } },
    ],
  });
}

describe('ContextReadinessBar', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    setVectorRagEnabled(false);
  });

  it('渲染五个芯片，未就绪项带可点跳转与原因提示', async () => {
    const router = makeRouter();
    await router.push('/chat');
    const wrapper = mount(ContextReadinessBar, { global: { plugins: [router] } });

    const chips = wrapper.findAll('.readiness-chip');
    expect(chips).toHaveLength(5);
    const model = wrapper.find('[data-rel-jump="readiness-model"]');
    expect(model.classes()).toContain('is-attention');
    // v-tip：说明文字挂在 body 上的 tooltip 节点，宿主只留 aria-describedby
    const describedBy = model.attributes('aria-describedby');
    expect(describedBy, '芯片应挂 aria-describedby').toBeTruthy();
    const bubble = document.getElementById(describedBy as string);
    expect(bubble?.textContent).toContain('模型配置');

    await model.trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('settings');
    expect(router.currentRoute.value.query.cat).toBe('model');
    // 深链必须带来源，否则用户回不到原来的页面
    expect(router.currentRoute.value.query.from).toBe('/chat');
  });

  it('已配置且解锁后，模型芯片转 ready 且不再跳转', async () => {
    const router = makeRouter();
    await router.push('/chat');
    const settings = useSettingsStore();
    settings.apiProfiles.push({ id: 'p1', name: 'p', provider: 'openai', baseUrl: 'http://x', apiKey: '', models: ['m'], enabled: true } as never);
    settings.activeApiProfileId = 'p1';

    const wrapper = mount(ContextReadinessBar, { global: { plugins: [router] } });
    const model = wrapper.find('[data-rel-jump="readiness-model"]');
    expect(model.classes()).toContain('is-ready');
    await model.trigger('click');
    expect(router.currentRoute.value.name).toBe('chat2');
  });

  it('锁定态显示"已锁定"，不显示"未配置"', async () => {
    const router = makeRouter();
    await router.push('/chat');
    const settings = useSettingsStore();
    settings.apiProfiles.push({ id: 'p1', name: 'p', provider: 'openai', baseUrl: 'http://x', apiKey: '', models: ['m'], enabled: true } as never);
    settings.activeApiProfileId = 'p1';
    await settings.setMasterPassword('sup3r-secret');
    settings.lock();

    const model = mount(ContextReadinessBar, { global: { plugins: [router] } }).find('[data-rel-jump="readiness-model"]');
    expect(model.classes()).toContain('is-locked');
    expect(model.text()).toContain('已锁定');
    const tipNode = document.getElementById(model.attributes('aria-describedby') as string);
    expect(tipNode?.textContent ?? '').toContain('主密码');
    expect(tipNode?.textContent).not.toContain('未配置');
  });
});

describe('PrereqNotice', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    setVectorRagEnabled(false);
  });

  it('渲染三行前提；未满足的行给出跳转，满足的行显示"已满足"', async () => {
    const router = makeRouter();
    await router.push('/databank');
    const rows = useDataBankPrereqs();
    const wrapper = mount(PrereqNotice, { props: { rows: rows.value }, global: { plugins: [router] } });

    expect(wrapper.findAll('.prereq-row')).toHaveLength(3);
    expect(wrapper.findAll('.prereq-action')).toHaveLength(2);

    await wrapper.find('[data-rel-jump="prereq-vector-switch"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.query).toMatchObject({ cat: 'retrieval', from: '/databank' });

    const allDone = useDataBankPrereqs();
    setVectorRagEnabled(true);
    const mountedAgain = mount(PrereqNotice, {
      props: {
        rows: allDone.value.map((r) => ({ ...r, done: true })),
      },
      global: { plugins: [router] },
    });
    expect(mountedAgain.findAll('.prereq-action')).toHaveLength(0);
    expect(mountedAgain.findAll('.prereq-done')).toHaveLength(3);
  });

  it('就绪芯片与前置横幅共用同一判定源，不会出现互相矛盾的说法', () => {
    setVectorRagEnabled(false);
    const chips = useReadinessChips().value;
    const rows = useDataBankPrereqs().value;
    const docChip = chips.find((c) => c.id === 'documents');
    const vectorRow = rows.find((r) => r.id === 'vector-switch');
    expect(docChip?.state).toBe('n-a');
    expect(vectorRow?.done).toBe(false);

    setVectorRagEnabled(true);
    expect(useDataBankPrereqs().value.find((r) => r.id === 'vector-switch')?.done).toBe(true);
  });
});
