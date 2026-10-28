/**
 * 主题清单漂移守卫（F3 / 2D-P2-11 的替代方案）
 *
 * 原计划是"主题预览不再手抄色值，改读 themes.css 的真实变量"。实测做不到：
 * - 9 张色块共 18 个端点色里，`#1a2048` / `#141414` / `#201a12` 在 tokens.css 与
 *   themes.css 里根本不存在，它们是只给色块用的装饰色，没有对应的语义 token；
 * - 主题块的选择器不统一：4 个是 `[data-theme='x']`，5 个是 `html[data-theme='x']`
 *   （后者是故意的，见 themes.css 里 terminal 块的注释：不加 html 前缀压不过 tokens.css
 *   的 `:root`）。所以色块元素即使挂上 data-theme，也拿不到那 5 个主题自己的变量。
 *
 * 于是保留手抄的装饰色，但把"新增主题别漏登记"变成判据：主题 id 一共有四处落点
 * （THEME_PRESETS 白名单、设置页的 themeOptions、色块 class、themes.css 的主题块），
 * 漏一处不会报错、只会静默少一张卡或一张没颜色的卡。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { THEME_PRESETS } from '@/types';

const ROOT = path.resolve(import.meta.dirname, '../..');
const SECTION = readFileSync(path.join(ROOT, 'src/components/settings/AppearanceThemeSection.vue'), 'utf8');
const THEMES_CSS = readFileSync(path.join(ROOT, 'src/styles/themes.css'), 'utf8');

/** 设置页里登记的卡片 id（`value: 'xxx'`），额外允许自定义主题 */
export function cardIds(text: string): string[] {
  return [...text.matchAll(/value:\s*'([a-z]+)'/g)].map((m) => m[1]!);
}

/** 色块 class 名（`swatchClass: 'swatch-xxx'`） */
export function swatchClasses(text: string): string[] {
  return [...text.matchAll(/swatchClass:\s*'swatch-([a-z]+)'/g)].map((m) => m[1]!);
}

/** 实际写出来的 `.swatch-xxx {` 规则 */
export function swatchRules(text: string): string[] {
  return [...text.matchAll(/\.swatch-([a-z]+)\s*\{/g)].map((m) => m[1]!);
}

/** themes.css 里定义过的主题 id（两种选择器写法都认） */
export function themeCssIds(text: string): string[] {
  return [...text.matchAll(/\[data-theme=['"]([a-z]+)['"]\]/g)].map((m) => m[1]!);
}

const EXPECTED = [...THEME_PRESETS, 'custom'];

describe('主题清单四处落点一致', () => {
  it('THEME_PRESETS 里的每个主题都在设置页有卡片、有色块 class、有色块规则、有主题块', () => {
    const cards = cardIds(SECTION);
    const classes = swatchClasses(SECTION);
    const rules = swatchRules(SECTION);
    const cssIds = themeCssIds(THEMES_CSS);
    const missing: string[] = [];
    for (const id of THEME_PRESETS) {
      if (!cards.includes(id)) missing.push(`${id}: 设置页没有卡片`);
      if (!classes.includes(id)) missing.push(`${id}: 没有 swatchClass`);
      if (!rules.includes(id)) missing.push(`${id}: 没有 .swatch-${id} 规则`);
      if (!cssIds.includes(id)) missing.push(`${id}: themes.css 没有 [data-theme='${id}'] 块`);
    }
    expect(missing, '新增主题时漏了这些落点').toEqual([]);
  });

  it('没有多出来的色块（防止删主题后留下孤儿样式）', () => {
    const extra = swatchRules(SECTION).filter((id) => !EXPECTED.includes(id));
    expect(extra, '这些 .swatch-* 规则对应的主题不在清单里').toEqual([]);
    const extraClasses = swatchClasses(SECTION).filter((id) => !EXPECTED.includes(id));
    expect(extraClasses).toEqual([]);
  });

  it('判据本身能红（合成输入）', () => {
    const fakeSection = "value: 'dark',\nswatchClass: 'swatch-dark',\n.swatch-dark {";
    const fakeCss = "[data-theme='dark'] {";
    expect(cardIds(fakeSection)).toEqual(['dark']);
    expect(swatchClasses(fakeSection)).toEqual(['dark']);
    expect(swatchRules(fakeSection)).toEqual(['dark']);
    expect(themeCssIds(fakeCss)).toEqual(['dark']);
    // 少一个落点时，四个提取函数里必然有一个给不出这个 id——这就是上面那条断言的红因
    const broken = "value: 'dark',\n.swatch-dark {";
    expect(swatchClasses(broken)).toEqual([]);
  });
});
