/**
 * 设置→关于的版本号（2026-10-16 发布 1.1.0 时抓到的存量缺陷）
 *
 * 原本 `appVersion` 声明后从未赋值，模板用 `appVersion || '—'` 兜底，于是桌面、网页、
 * 安卓三个平台都显示"版本：—"，而发布说明里却写着"运行时读到的版本"。
 * 修法是编译期注入 `__APP_VERSION__`（与 `__NATIVE_SHELL__` 同一套 define）。
 *
 * 三条断言的分工：
 * 1. 渲染值必须等于 package.json 的 version —— 这条就是负向对照本身：把组件改回
 *    `ref('')` 时渲染出"版本：—"，此处按相等判定必红。
 * 2. 两个构建配置都必须还带着这条 define —— 配置被删时组件不会报错，只会静默变回破折号，
 *    所以要在源码层面钉住。
 * 3. 类型声明里要有这一条，否则 `vue-tsc` 通不过，红在编译而不是运行时。
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import fs from 'node:fs';
import path from 'node:path';
import SettingsAboutPanel from '@/components/settings/SettingsAboutPanel.vue';

// 与 tests/core/native-sw-cleanup.test.ts 同一取根方式（jsdom 下 import.meta.url 不是 file: 协议）
const SRC = path.resolve(__dirname, '../..');
const pkgVersion = (JSON.parse(fs.readFileSync(path.join(SRC, 'package.json'), 'utf8')) as { version: string }).version;

describe('设置→关于的版本号', () => {
  it('渲染出的版本号就是 package.json 里的那一个，不再是占位破折号', () => {
    const wrapper = mount(SettingsAboutPanel);
    const text = wrapper.text();

    expect(text).toContain(`版本：${pkgVersion}`);
    expect(text).not.toContain('版本：—');
    // 兜底分支仍在模板里，所以顺手钉住这个值不是空串——空串才会露出破折号
    expect(pkgVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('两个构建配置都把 __APP_VERSION__ 定义进来了（少一个就会静默显示破折号）', () => {
    const viteConfig = fs.readFileSync(path.join(SRC, 'vite.config.ts'), 'utf8');
    const vitestConfig = fs.readFileSync(path.join(SRC, 'vitest.config.ts'), 'utf8');

    expect(viteConfig).toMatch(/__APP_VERSION__:\s*JSON\.stringify\(APP_VERSION\)/);
    expect(vitestConfig).toMatch(/__APP_VERSION__:\s*JSON\.stringify\(APP_VERSION\)/);
  });

  it('全局常量有类型声明，缺了它 vue-tsc 会在编译期红', () => {
    const envTypes = fs.readFileSync(path.join(SRC, 'src/vite-env.d.ts'), 'utf8');

    expect(envTypes).toMatch(/declare const __APP_VERSION__:\s*string/);
  });
});
