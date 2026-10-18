/**
 * 切换语言后，所有可见标签必须一起换（OPT_PLAN 真机发现二）
 *
 * 现场：安卓模拟器上底部导航是中文「会话」，而设置页小节标题与长按动作条是英文，
 * navigator.language = en-US。
 *
 * 根因不是语言探测时序，而是"把 t() 的结果赋给普通 const"——t() 虽然响应式，
 * 但只有被 computed / 模板追踪时才成立；普通 const 在组件 setup 那一刻就把
 * 当前语言的字符串快照住了，之后再切语言它不动。
 *
 * 所以这里的每条断言都是同一个形状：挂载 → 断言初始语言 → setLocale(另一种)
 * → 断言 DOM 文本跟着换。修复前它们必须是红的。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

import BottomNav from '@/components/mobile/BottomNav.vue';
import { setLocale, localeRef } from '@/i18n';

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/chat', name: 'chat', component: { template: '<div />' } },
      { path: '/character', name: 'character-list', component: { template: '<div />' } },
      // A12：group 升为底部 Tab，mock 路由必须跟着有它（否则 router.resolve 直接抛 No match）
      { path: '/group', name: 'group', component: { template: '<div />' } },
      { path: '/worldbook', name: 'worldbook', component: { template: '<div />' } },
      { path: '/community-market', name: 'community-market', component: { template: '<div />' } },
      { path: '/more', name: 'more', component: { template: '<div />' } },
      { path: '/settings', name: 'settings', component: { template: '<div />' } },
      { path: '/', component: { template: '<div />' } },
    ],
  });
}

afterEach(() => {
  setLocale('zh');
});

describe('底部导航跟随语言切换', () => {
  it('挂载后切到英文，导航标签必须一起变（不能留着挂载那一刻的中文）', async () => {
    setActivePinia(createPinia());
    setLocale('zh');
    const router = makeRouter();
    await router.push('/chat');
    await router.isReady();
    const wrapper = mount(BottomNav, { global: { plugins: [router, createPinia()] } });

    const before = wrapper.findAll('.bottom-nav-label').map((n) => n.text());
    expect(before.join('')).toContain('会话');

    setLocale('en');
    await wrapper.vm.$nextTick();

    const after = wrapper.findAll('.bottom-nav-label').map((n) => n.text());
    expect(after.join('')).toContain('Chat');
    expect(after.join('')).not.toContain('会话');
    // 项数不能因为改成响应式而变（同一份 nav-model 事实源）
    expect(after).toHaveLength(before.length);
  });

  it('反向也要成立：先英文挂载再切中文', async () => {
    setActivePinia(createPinia());
    setLocale('en');
    const router = makeRouter();
    await router.push('/chat');
    await router.isReady();
    const wrapper = mount(BottomNav, { global: { plugins: [router, createPinia()] } });

    expect(wrapper.findAll('.bottom-nav-label').map((n) => n.text()).join('')).toContain('Chat');

    setLocale('zh');
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll('.bottom-nav-label').map((n) => n.text()).join('')).toContain('会话');
  });
});

describe('源码层面不允许再出现"一次性 t() 快照"', () => {
  // 读源码而不是读行为：行为断言只能覆盖我想到挂载的那几个组件，
  // 而这一类 bug 的形状是固定的，用静态检查兜住后来者。
  const cases: Array<{ file: string; decl: RegExp; why: string }> = [
    {
      file: 'src/components/mobile/BottomNav.vue',
      decl: /const tabs\s*=\s*mobileTabEntries/,
      why: '导航标签在 setup 里算一次就固化，切语言不动（真机已复现）',
    },
    {
      file: 'src/components/settings/SettingsAppearancePanel.vue',
      decl: /const localeOptions[^=]*=\s*\[/,
      why: '语言选项自己的标签就是快照的',
    },
    {
      file: 'src/components/settings/SettingsModelPanel.vue',
      decl: /const providerOptions[^=]*=\s*\[/,
      why: '供应商下拉的标签同理',
    },
  ];

  for (const c of cases) {
    it(`${c.file} 的声明必须改成 computed（${c.why}）`, async () => {
      const fs = await import('node:fs');
      const src = fs.readFileSync(c.file, 'utf8');
      const m = c.decl.exec(src);
      // 找不到该声明也算通过（可能已被重构掉），但找到了就必须是 computed
      if (!m) return;
      expect(src.slice(m.index, m.index + 80)).toMatch(/computed|=>\s*\[/);
    });
  }

  it('withDefaults 的默认值里不许出现 t()（那串文案会在模块加载时被永久冻结）', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('src/components/common/FilterTabs.vue', 'utf8');
    const m = /\}\s*\(\s*defineProps[\s\S]*?\n\s*\{\s*([\s\S]*?)\n\s*\}\s*\n\s*\);/.exec(src);
    if (!m) return;
    expect(m[1]).not.toMatch(/\bt\(/);
  });
});

afterEach(() => {
  expect(['zh', 'en']).toContain(localeRef.value);
});
