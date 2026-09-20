import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import StatusHud from '../../src/components/chat/StatusHud.vue';
import { parseStatusBlock } from '@core/status-parser';
import type { CharacterStatus, StatusSchema } from '@core/status-schema';
import { initLocale, setLocale } from '@/i18n';

/**
 * P1 StatusHud UI 测试 (T04)
 *
 * 覆盖：
 * - 空状态 / 无 entries / null → 完全不渲染（不渲染空壳）
 * - XSS 值不产生 DOM 元素（全程文本插值，无 v-html）
 * - 长值切竖排
 * - aria 属性（role=group + aria-label）
 * - sticky / inline 两个 variant 的标题文案
 * - 未命中图标时不渲染 svg
 * - 切换 en 后内置字段展示名随 i18n 变化
 */

const SCHEMA: StatusSchema = {
  version: 1,
  fields: [
    { key: 'location', type: 'string' },
    { key: 'affection', type: 'number' },
  ],
};

function statusFrom(raw: string): CharacterStatus | null {
  return parseStatusBlock(raw, SCHEMA, 'm1');
}

describe('StatusHud — P1 角色状态栏', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    initLocale('zh');
  });

  it('空状态（null / undefined / entries 为空）完全不渲染', () => {
    expect(mount(StatusHud, { props: { status: null } }).find('.status-hud').exists()).toBe(false);
    expect(
      mount(StatusHud, { props: { status: undefined } }).find('.status-hud').exists()
    ).toBe(false);
    expect(
      mount(StatusHud, {
        props: {
          status: { messageId: 'm', parseMode: 'json', unknownCount: 0, entries: [] },
        },
      })
        .find('.status-hud')
        .exists()
    ).toBe(false);
  });

  it('有状态时渲染条目，label 与 value 走文本插值', () => {
    const wrapper = mount(StatusHud, { props: { status: statusFrom('location: tavern') } });
    expect(wrapper.find('.status-hud').exists()).toBe(true);
    expect(wrapper.findAll('.status-entry')).toHaveLength(1);
    expect(wrapper.find('.status-label').text()).toBe('地点');
    expect(wrapper.find('.status-value').text()).toBe('tavern');
  });

  it('XSS 值不产生任何 DOM 元素（禁 innerHTML / v-html）', () => {
    const evil = '<img src=x onerror=alert(1)>';
    const wrapper = mount(StatusHud, {
      props: { status: statusFrom(`location: ${evil}`) },
    });
    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.find('script').exists()).toBe(false);
    expect(wrapper.html()).not.toContain('<img');
    // 原样作为文本展示
    expect(wrapper.find('.status-value').text()).toBe(evil);
  });

  it('长值切竖排（超过 24 字符）', () => {
    const long = 'x'.repeat(40);
    const wrapper = mount(StatusHud, { props: { status: statusFrom(`location: ${long}`) } });
    expect(wrapper.find('.status-entry-stacked').exists()).toBe(true);
    const short = mount(StatusHud, { props: { status: statusFrom('location: tavern') } });
    expect(short.find('.status-entry-stacked').exists()).toBe(false);
  });

  it('aria：role=group + aria-label（sticky 与 inline 各一套文案）', () => {
    const sticky = mount(StatusHud, {
      props: { status: statusFrom('location: tavern'), variant: 'sticky' },
    });
    expect(sticky.find('.status-hud').attributes('role')).toBe('group');
    expect(sticky.find('.status-hud').attributes('aria-label')).toBeTruthy();
    expect(sticky.find('.status-hud-title').text()).toBe('当前状态');
    expect(sticky.classes()).toContain('status-hud-sticky');

    const inline = mount(StatusHud, {
      props: { status: statusFrom('location: tavern'), variant: 'inline' },
    });
    expect(inline.find('.status-hud-title').text()).toBe('角色状态');
    expect(inline.classes()).toContain('status-hud-inline');
  });

  it('命中内置字段时渲染图标（走 Icon 白名单 svg）', () => {
    const wrapper = mount(StatusHud, { props: { status: statusFrom('location: tavern') } });
    expect(wrapper.find('.status-entry svg').exists()).toBe(true);
  });

  it('未命中图标的未知字段不渲染 svg（不是渲染空白）', () => {
    const wrapper = mount(StatusHud, { props: { status: statusFrom('foobar: 1') } });
    expect(wrapper.find('.status-entry').exists()).toBe(true);
    expect(wrapper.find('.status-entry svg').exists()).toBe(false);
    expect(wrapper.find('.status-label').text()).toBe('foobar');
  });

  it('切英文后内置字段展示名随之变化', () => {
    const wrapper = mount(StatusHud, { props: { status: statusFrom('location: tavern') } });
    expect(wrapper.find('.status-label').text()).toBe('地点');
    setLocale('en');
    const wrapper2 = mount(StatusHud, { props: { status: statusFrom('location: tavern') } });
    expect(wrapper2.find('.status-label').text()).toBe('Location');
    initLocale('zh');
  });
  it('渲染产物内不残留状态标签（标签在解析层已剥离）', () => {
    const wrapper = mount(StatusHud, {
      props: { status: statusFrom('location: tavern\nfoobar: <status>x</status>') },
    });
    expect(wrapper.html()).not.toContain('<status>');
  });
});
