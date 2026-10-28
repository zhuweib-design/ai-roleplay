import { normalizeThemeName, type BubbleStyle, type ChatBackground, type CustomTheme, type ThemeName } from '@/types';
import { buildCustomThemeCss, type ThemeTokens } from '@/core/theme-tokens';
import { setLocale as setI18nLocale, writeLocaleMirror, type Locale } from '@/i18n';
import { normalizeCustomTheme } from './normalize';
import type { SettingsCtx } from './ctx';

/**
 * R2-5：外观域（主题 / 字号 / 语言 / 背景 / 气泡 / 自定义 CSS / 自定义主题）。
 *
 * 共同点：全是「改内存 + 立刻反映到 DOM + 落盘」，与业务数据无关，
 * 因此可以整体搬出宿主 store 而不改变任何调用方语义。
 */
export function createAppearanceActions(ctx: SettingsCtx) {
  /**
   * 切换主题，并立即应用到 <html data-theme>
   */
  function setTheme(t: ThemeName) {
    // 归一在唯一的 DOM 写入点做：未知值（旧存档、手改数据、被删掉的主题 id）落回默认皮肤，
    // 而不是写进 data-theme 后靠 CSS 找不到选择器"看起来像回落"（那样还会被回写盘固化）
    t = normalizeThemeName(t);
    ctx.theme.value = t;
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', t);
      // 兼容遗留 dark class（部分样式依赖 .dark）
      document.documentElement.classList.toggle('dark', t === 'dark');
    }
    void ctx.persistSettings();
  }

  /**
   * 设置字号档位（12 / 14 / 16 / 18）
   */
  function setFontSize(size: number) {
    ctx.fontSize.value = size;
    if (typeof document !== 'undefined') {
      document.documentElement.style.fontSize = `${size}px`;
    }
    void ctx.persistSettings();
  }

  /**
   * 切换界面语言（同步 i18n 模块 + 持久化）
   */
  function setLocale(l: Locale) {
    ctx.locale.value = l;
    setI18nLocale(l);
    // 用户显式选择才写镜像：i18n 用它决定下一帧首屏语言（探测值不写，见 i18n/index.ts）
    writeLocaleMirror(l);
    void ctx.persistSettings();
  }

  /** 设置聊天背景（F08.2） */
  function setChatBackground(bg: ChatBackground): void {
    ctx.chatBackground.value = { ...bg };
    void ctx.persistSettings();
  }

  /** 设置消息气泡样式（F08.2） */
  function setBubbleStyle(style: BubbleStyle): void {
    ctx.bubbleStyle.value = { ...style };
    void ctx.persistSettings();
  }

  /**
   * 将自定义 CSS 注入到页面 <style id="custom-css"> 标签
   * 已存在则更新内容，不存在则创建
   */
  function applyCustomCss(css: string): void {
    if (typeof document === 'undefined') return;
    let styleEl = document.getElementById('custom-css') as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'custom-css';
      document.head.appendChild(styleEl);
    }
    // XSS 边界：customCss 只走 textContent，永不解析为 HTML
    styleEl.textContent = css;
    if (!css && styleEl.parentNode) {
      // 空 CSS 时移除标签
      styleEl.parentNode.removeChild(styleEl);
    }
  }

  /** 设置自定义 CSS 代码并立即注入到页面（F08.3） */
  function setCustomCss(css: string): void {
    ctx.customCss.value = css;
    applyCustomCss(css);
    void ctx.persistSettings();
  }

  /** 重置自定义 CSS（F08.3） */
  function resetCustomCss(): void {
    ctx.customCss.value = '';
    applyCustomCss('');
    void ctx.persistSettings();
  }

  /**
   * 将自定义主题变量注入到 <style id="custom-theme">（覆盖 tokens.css 默认值）
   * 以 palette 为唯一数据源：始终根据主色板重新生成 tokens，
   * 自愈历史版本（如曾生成 --primary: #000000 的旧数据）。
   */
  function applyCustomTheme(ct: CustomTheme | null): void {
    if (typeof document === 'undefined') return;
    let styleEl = document.getElementById('custom-theme') as HTMLStyleElement | null;
    if (!ct) {
      if (styleEl?.parentNode) styleEl.parentNode.removeChild(styleEl);
      return;
    }
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'custom-theme';
      document.head.appendChild(styleEl);
    }
    const fresh = normalizeCustomTheme(ct);
    styleEl.textContent = buildCustomThemeCss(fresh.tokens as ThemeTokens, fresh.background || undefined);
  }

  /**
   * 设置自定义主题（背景图 + 提取主色 + 组件变量）并立即应用
   * 应用后自动切换到 custom 主题
   */
  function setCustomTheme(ct: CustomTheme): void {
    ctx.customTheme.value = normalizeCustomTheme(ct);
    applyCustomTheme(ctx.customTheme.value);
    setTheme('custom');
  }

  /** 清除自定义主题（不自动切换回默认主题） */
  function clearCustomTheme(): void {
    ctx.customTheme.value = null;
    applyCustomTheme(null);
    void ctx.persistSettings();
  }

  return {
    setTheme,
    setFontSize,
    setLocale,
    setChatBackground,
    setBubbleStyle,
    applyCustomCss,
    setCustomCss,
    resetCustomCss,
    applyCustomTheme,
    setCustomTheme,
    clearCustomTheme,
  };
}
