/**
 * 首启欢迎窗（M5-b3）
 *
 * 这扇窗原先的三步是写死的文字，与任务卡前三条同源却不同数据：
 * 恢复过备份、或只清掉 localStorage 的人会被它要求"现在配模型"，
 * 而这三步其实都做完了。这里守的就是"完成态只认注册表一处"。
 *
 * Modal 走 Teleport 到 body，所以断言一律从 document.body 查，
 * 不用 wrapper.find（组件根节点在 teleport 下只是个占位注释）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import OnboardingModal from '@/components/common/OnboardingModal.vue';
import { useSettingsStore } from '@/stores/settings';
import { useCharacterStore } from '@/stores/character';
import type { UICharacter } from '@/types';
import { t } from '@/i18n';

function makeCharacter(id: string, withReply: boolean): UICharacter {
  return {
    id,
    name: `角色 ${id}`,
    messages: withReply ? [{ id: 'm1', role: 'assistant', content: '在的。', timestamp: 1 }] : [],
    tags: [],
    favorite: false,
  } as unknown as UICharacter;
}

async function mountModal() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/chat', name: 'chat', component: { template: '<div />' } },
      { path: '/guide', name: 'guide', component: { template: '<div />' } },
      { path: '/settings', name: 'settings', component: { template: '<div />' } },
    ],
  });
  await router.push('/chat');
  await router.isReady();
  const wrapper = mount(OnboardingModal, {
    props: { modelValue: true },
    global: { plugins: [router] },
    attachTo: document.body,
  });
  return wrapper;
}

const q = (sel: string) => document.body.querySelector(sel);
const qa = (sel: string) => Array.from(document.body.querySelectorAll(sel));
const byText = (sel: string, text: string) =>
  qa(sel).find((el) => (el.textContent ?? '').trim() === text) ?? null;

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  // 全新用户：没有任何 Profile，也没有角色
  const characters = useCharacterStore();
  characters.characters.splice(0, characters.characters.length);
  const settings = useSettingsStore();
  settings.apiProfiles.splice(0, settings.apiProfiles.length);
  settings.activeApiProfileId = null;
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('OnboardingModal', () => {
  it('全新用户：三步都不带"已满足"，页脚是"打开任务清单 + 现在配模型"', async () => {
    await mountModal();

    expect(qa('.onboarding-step')).toHaveLength(3);
    expect(qa('.onboarding-step.done')).toHaveLength(0);
    expect(byText('button', t('onboarding.openGuide'))).not.toBeNull();
    expect(byText('button', t('onboarding.configureModel'))).not.toBeNull();
    expect(q('.onboarding-desc')?.textContent).toBe(t('onboarding.desc'));
  });

  it('三步都做完了：每步标"已满足"，不再递"现在配模型"，改给"去对话"', async () => {
    const settings = useSettingsStore();
    settings.apiProfiles.push({
      id: 'p1',
      name: 'p',
      provider: 'openai',
      baseUrl: 'http://x',
      apiKey: '',
      models: ['m'],
      enabled: true,
    } as never);
    settings.activeApiProfileId = 'p1';

    const characters = useCharacterStore();
    characters.characters.push(makeCharacter('c1', true), makeCharacter('c2', false));
    characters.currentCharacterId = 'c1';

    await mountModal();

    expect(qa('.onboarding-step.done')).toHaveLength(3);
    expect(qa('.onboarding-step-state').every((el) => el.textContent?.includes(t('prereq.done')))).toBe(true);
    expect(byText('button', t('onboarding.configureModel'))).toBeNull();
    expect(byText('button', t('onboarding.startChat'))).not.toBeNull();
    expect(q('.onboarding-desc')?.textContent).toBe(t('onboarding.descDone'));
  });

  it('只做完成两步时仍按未完成处理（不给"去对话"这种半截承诺）', async () => {
    const settings = useSettingsStore();
    settings.apiProfiles.push({
      id: 'p1',
      name: 'p',
      provider: 'openai',
      baseUrl: 'http://x',
      apiKey: '',
      models: ['m'],
      enabled: true,
    } as never);
    settings.activeApiProfileId = 'p1';
    const characters = useCharacterStore();
    characters.characters.push(makeCharacter('c1', false), makeCharacter('c2', false));
    characters.currentCharacterId = 'c1';

    await mountModal();

    expect(qa('.onboarding-step.done')).toHaveLength(2);
    expect(byText('button', t('onboarding.startChat'))).toBeNull();
    expect(byText('button', t('onboarding.configureModel'))).not.toBeNull();
  });

  it('关闭只记"欢迎看过"，不写任何引导意图（引导常驻可回）', async () => {
    const wrapper = await mountModal();
    const closeBtn = qa('button').find((el) => (el.textContent ?? '').trim() === t('common.close'));
    // dispatchEvent 返回 boolean 而不是 Promise，await 它会撞 await-thenable
    closeBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await wrapper.vm.$nextTick();

    expect(localStorage.getItem('ai-roleplay:onboarding-done')).toBe('1');
    // 任务清单的意图（跳过 / 收起）一个字都不该被这次关闭写进去
    expect(localStorage.getItem('ai-roleplay:guided-tasks.v1')).toBeNull();
  });
});
