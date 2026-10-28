/**
 * 首聊验收表的启动数字——渲染早于打点的那一次
 *
 * 缺陷形状（2026-10-28 在生产构建里实测到）：冷启动直接进「设置 → 数据」时，
 * 本组件的首帧渲染发生在 `App.onMounted` 的存储注入完成**之前**，那一刻
 * `getAppReadyMs()` 还是 null；而它不是响应式来源，所以写成 computed 会把
 * null 永久定住，环境行到用户点完一遍都显示"未取到"。
 * 修法是 `markAppReady()` 写入数字后派一次性事件，组件听见就补一次。
 *
 * 为什么判据放组件层而不是 e2e：e2e 跑在 dev server 上，那里设置页的分包
 * 比存储初始化**晚**到，首帧就已经拿得到数字——同一条断言在那个模式下咬不住
 * 任何东西（实测：把组件改回缺陷形状，e2e 照样 3 passed）。这里的时序由测试
 * 自己造：先 mount、后打点。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import SettingsTrialSection from '@/components/settings/SettingsTrialSection.vue';
import { markAppReady } from '@/core/boot-timing';

const KEY = '__arcAppReadyMs';
const holder = () => window as unknown as Record<string, unknown>;

function clearMark(): void {
  delete holder()[KEY];
}

describe('验收表环境行的启动数字', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.removeItem('ai-roleplay:trial-records');
    clearMark();
  });

  afterEach(() => {
    clearMark();
  });

  it('先渲染、后打点 ⇒ 环境行自己补上数字，不是永远"未取到"', async () => {
    const wrapper = mount(SettingsTrialSection);

    // 夹具必须先落在缺陷分支上：这一刻确实还没打点
    expect(wrapper.find('.trial-env').text()).toContain('本次启动 未取到');

    markAppReady();
    await nextTick();

    expect(wrapper.find('.trial-env').text()).toMatch(/本次启动 \d+ ms/);
  });

  it('对照：打点已在 ⇒ 首帧就有数字（说明上面那条红不是"永远取不到"）', () => {
    markAppReady();
    const wrapper = mount(SettingsTrialSection);
    expect(wrapper.find('.trial-env').text()).toMatch(/本次启动 \d+ ms/);
  });

  it('打点只记第一次：重复调用不改变已写下的数字', () => {
    markAppReady();
    const first = holder()[KEY];
    markAppReady();
    expect(holder()[KEY]).toBe(first);
  });
});
