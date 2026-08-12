/**
 * XSS 防护：HTML 净化 (AC20 安全)
 *
 * 职责：
 * 1. 使用 DOMPurify 净化 HTML，移除危险标签与属性
 * 2. 提供通用净化接口（sanitizeHtml）与 Markdown 专用接口（sanitizeMarkdown）
 * 3. 所有 v-html 渲染场景必须经过本模块净化
 *
 * 安全策略：
 * - 白名单制：仅允许已知安全的标签与属性
 * - 禁止事件处理属性（onclick, onerror, onload 等）
 * - 禁止危险标签（script, iframe, object, embed, form 等）
 *
 * 注意（T-14 债登记 P3-3）：当前无引用（扫描确认），作为安全保险保留；
 * 引入新的 v-html 渲染前必须先接线本模块。
 * - 链接强制添加 rel="noopener noreferrer" 防止反向钓鱼
 * - 禁止 data-* 自定义属性（防止 data-uri 注入）
 *
 * 使用场景：
 * - 未来 Markdown 渲染（marked.parse → sanitizeMarkdown → v-html）
 * - 任何需要渲染富文本 HTML 的场景
 *
 * 审计结论（当前 v-html 使用点）：
 * - Icon.vue: v-html="getIconPath(name)" — name 为 IconName 类型（联合类型），值来自静态图标注册表，非用户输入，安全
 * - MessageBubble.vue: 使用 {{ msg.content }} 文本插值，Vue 自动转义，无 XSS 风险
 */
import DOMPurify from 'dompurify';
import type { Config as DOMPurifyConfig } from 'dompurify';

// ── 净化配置 ──

/**
 * 默认净化配置（白名单制）
 *
 * 允许的标签覆盖常见富文本格式化需求：
 * - 段落与文本格式：p, br, hr, span, div, b, i, em, strong, u, s, small, sub, sup, mark, del, ins
 * - 标题：h1-h6
 * - 列表：ul, ol, li
 * - 引用与代码：blockquote, code, pre, kbd, samp
 * - 链接与图片：a, img
 * - 表格：table, thead, tbody, tr, th, td
 * - 折叠面板：details, summary
 */
const DEFAULT_CONFIG: DOMPurifyConfig = {
  ALLOWED_TAGS: [
    // 段落与文本
    'p', 'br', 'hr', 'span', 'div',
    // 文本格式
    'b', 'i', 'em', 'strong', 'u', 's', 'small', 'sub', 'sup',
    'mark', 'del', 'ins',
    // 标题
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    // 列表
    'ul', 'ol', 'li',
    // 引用与代码
    'blockquote', 'code', 'pre', 'kbd', 'samp',
    // 链接与图片
    'a', 'img',
    // 表格
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    // 折叠面板
    'details', 'summary',
  ],
  ALLOWED_ATTR: [
    // 通用
    'class', 'id', 'title', 'alt',
    // 链接
    'href', 'target', 'rel',
    // 图片
    'src', 'width', 'height',
    // 表格
    'colspan', 'rowspan',
    // 折叠面板
    'open',
    // 代码块语言标记
    'data-language',
  ],
  ALLOW_DATA_ATTR: false,
  FORBID_TAGS: [
    'script', 'style', 'iframe', 'object', 'embed',
    'form', 'input', 'textarea', 'select', 'button',
    'meta', 'link', 'base', 'noscript',
  ],
  FORBID_ATTR: [
    // 事件处理属性
    'onerror', 'onclick', 'onload', 'onmouseover', 'onmouseout',
    'onmouseenter', 'onmouseleave', 'onfocus', 'onblur',
    'onchange', 'oninput', 'onsubmit', 'onreset',
    'onkeydown', 'onkeyup', 'onkeypress',
    'ontouchstart', 'ontouchend', 'ontouchmove',
    // 危险属性
    'formaction', 'action', 'method',
  ],
};

/**
 * 强制为所有 <a> 标签添加 rel="noopener noreferrer"
 * 防止反向钓鱼攻击（新窗口可通过 window.opener 访问原窗口）
 */
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && node.getAttribute('target') === '_blank') {
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

// ── 公共接口 ──

/**
 * 净化 HTML 字符串，防止 XSS
 *
 * 使用白名单制，仅保留已知安全的标签和属性。
 * 所有通过 v-html 渲染的内容必须先经此函数净化。
 *
 * @param dirty 待净化的 HTML 字符串
 * @returns 净化后的安全 HTML。输入为空时返回空字符串
 *
 * @example
 * ```ts
 * const safe = sanitizeHtml(userInput);
 * // <p>safe</p><script>alert(1)</script> → <p>safe</p>
 * ```
 */
export function sanitizeHtml(dirty: string): string {
  if (!dirty) return '';
  return DOMPurify.sanitize(dirty, DEFAULT_CONFIG) as unknown as string;
}

/**
 * 净化 Markdown 渲染后的 HTML
 *
 * 专为 marked.parse() 输出设计，允许代码高亮相关的 data 属性。
 * 其余安全策略与 sanitizeHtml 一致。
 *
 * @param html marked.parse() 输出的 HTML 字符串
 * @returns 净化后的安全 HTML
 *
 * @example
 * ```ts
 * import { marked } from 'marked';
 * const raw = marked.parse(userMarkdown);
 * const safe = sanitizeMarkdown(raw);
 * // 可安全用于 v-html
 * ```
 */
export function sanitizeMarkdown(html: string): string {
  if (!html) return '';
  return DOMPurify.sanitize(html, DEFAULT_CONFIG) as unknown as string;
}

/**
 * 检测 HTML 中是否包含潜在 XSS 风险（不净化，仅检测）
 *
 * 用于测试与审计：对比净化前后差异，验证净化效果。
 *
 * @param html 待检测的 HTML
 * @returns true=检测到危险内容；false=安全
 */
export function hasXssRisk(html: string): boolean {
  if (!html) return false;
  const sanitized = sanitizeHtml(html);
  return sanitized !== html;
}

/**
 * 获取当前 DOMPurify 版本（用于审计与诊断）
 */
export function getDomPurifyVersion(): string {
  return DOMPurify.version;
}
