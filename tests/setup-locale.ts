/**
 * 声明测试环境的浏览器语言（必须作为 tests/setup.ts 的第一条 import 执行）
 *
 * 为什么需要：jsdom 的 navigator.language 默认是 en-US，而 `localeRef` 的初值
 * 改成同步取浏览器语言后，界面会在测试里渲染成英文，与断言里的中文对不上。
 * 真实环境不存在"没有语言"这回事，所以这里与 playwright.config.ts 的
 * `locale: 'zh-CN'` 保持一致：测试环境显式声明自己的语言，而不是靠隐式默认。
 */
function defineNavigatorLocale(lang: string, languages: string[]): void {
  const nav = globalThis.navigator;
  if (!nav) return;
  Object.defineProperty(nav, 'language', { value: lang, configurable: true, writable: true });
  Object.defineProperty(nav, 'languages', { value: languages, configurable: true, writable: true });
}

defineNavigatorLocale('zh-CN', ['zh-CN', 'en-US']);

export {};
