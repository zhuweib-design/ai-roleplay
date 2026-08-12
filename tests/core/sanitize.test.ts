import { describe, it, expect } from 'vitest';
import {
  sanitizeHtml,
  sanitizeMarkdown,
  hasXssRisk,
  getDomPurifyVersion,
} from '../../src/core/sanitize';

// ── 单元测试：XSS 防护 (AC20 安全) ──

describe('sanitize — AC20 XSS 防护', () => {
  // ── 版本信息 ──

  describe('getDomPurifyVersion', () => {
    it('应返回 DOMPurify 版本字符串', () => {
      const version = getDomPurifyVersion();
      expect(typeof version).toBe('string');
      expect(version.length).toBeGreaterThan(0);
    });
  });

  // ── sanitizeHtml 基础功能 ──

  describe('sanitizeHtml — 安全标签保留', () => {
    it('应保留 <p> 标签', () => {
      expect(sanitizeHtml('<p>hello</p>')).toBe('<p>hello</p>');
    });

    it('应保留 <strong> 与 <em> 格式化标签', () => {
      const input = '<p>hello <strong>world</strong> and <em>italic</em></p>';
      expect(sanitizeHtml(input)).toBe(input);
    });

    it('应保留标题标签 h1-h6', () => {
      for (const tag of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']) {
        const input = `<${tag}>Title</${tag}>`;
        expect(sanitizeHtml(input)).toBe(input);
      }
    });

    it('应保留列表标签 ul/ol/li', () => {
      const input = '<ul><li>item1</li><li>item2</li></ul>';
      expect(sanitizeHtml(input)).toBe(input);
    });

    it('应保留引用标签 blockquote', () => {
      const input = '<blockquote>quoted text</blockquote>';
      expect(sanitizeHtml(input)).toBe(input);
    });

    it('应保留代码标签 code 与 pre', () => {
      const input = '<pre><code>const x = 1;</code></pre>';
      expect(sanitizeHtml(input)).toBe(input);
    });

    it('应保留链接 <a> 标签与 href 属性', () => {
      const input = '<a href="https://example.com">link</a>';
      const result = sanitizeHtml(input);
      expect(result).toContain('<a');
      expect(result).toContain('href="https://example.com"');
      expect(result).toContain('link');
    });

    it('应保留图片 <img> 标签与 src/alt 属性', () => {
      const input = '<img src="image.png" alt="图片">';
      const result = sanitizeHtml(input);
      expect(result).toContain('<img');
      expect(result).toContain('src="image.png"');
      expect(result).toContain('alt="图片"');
    });

    it('应保留表格标签', () => {
      const input = '<table><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>';
      expect(sanitizeHtml(input)).toBe(input);
    });

    it('应保留 details/summary 折叠面板', () => {
      const input = '<details><summary>点击展开</summary><p>内容</p></details>';
      expect(sanitizeHtml(input)).toBe(input);
    });

    it('应保留 mark/del/ins 标记标签', () => {
      const input = '<p><mark>高亮</mark> <del>删除</del> <ins>插入</ins></p>';
      expect(sanitizeHtml(input)).toBe(input);
    });

    it('应保留 class 属性', () => {
      const input = '<p class="highlight">text</p>';
      expect(sanitizeHtml(input)).toBe(input);
    });
  });

  // ── sanitizeHtml 危险标签移除 ──

  describe('sanitizeHtml — 危险标签移除', () => {
    it('应移除 <script> 标签', () => {
      const result = sanitizeHtml('<p>safe</p><script>alert("xss")</script>');
      expect(result).toBe('<p>safe</p>');
    });

    it('应移除 <script> 标签及其内容', () => {
      const result = sanitizeHtml('<script>document.cookie</script><p>safe</p>');
      expect(result).toBe('<p>safe</p>');
      expect(result).not.toContain('document.cookie');
    });

    it('应移除 <iframe> 标签', () => {
      const result = sanitizeHtml('<iframe src="evil.com"></iframe><p>safe</p>');
      expect(result).toBe('<p>safe</p>');
    });

    it('应移除 <object> 标签', () => {
      const result = sanitizeHtml('<object data="evil.swf"></object><p>safe</p>');
      expect(result).toBe('<p>safe</p>');
    });

    it('应移除 <embed> 标签', () => {
      const result = sanitizeHtml('<embed src="evil.swf"><p>safe</p>');
      expect(result).toBe('<p>safe</p>');
    });

    it('应移除 <form> 标签', () => {
      const result = sanitizeHtml('<form action="evil.com"><input name="x"></form><p>safe</p>');
      expect(result).toBe('<p>safe</p>');
    });

    it('应移除 <style> 标签', () => {
      const result = sanitizeHtml('<style>body{background:red}</style><p>safe</p>');
      expect(result).toBe('<p>safe</p>');
    });

    it('应移除 <meta> 标签', () => {
      const result = sanitizeHtml('<meta http-equiv="refresh" content="0;url=evil.com"><p>safe</p>');
      expect(result).toBe('<p>safe</p>');
    });

    it('应移除 <link> 标签', () => {
      const result = sanitizeHtml('<link rel="stylesheet" href="evil.css"><p>safe</p>');
      expect(result).toBe('<p>safe</p>');
    });

    it('应移除 <base> 标签', () => {
      const result = sanitizeHtml('<base href="evil.com"><p>safe</p>');
      expect(result).toBe('<p>safe</p>');
    });
  });

  // ── sanitizeHtml 危险属性移除 ──

  describe('sanitizeHtml — 危险属性移除', () => {
    it('应移除 onclick 属性', () => {
      const result = sanitizeHtml('<p onclick="alert(1)">text</p>');
      expect(result).toBe('<p>text</p>');
    });

    it('应移除 onerror 属性', () => {
      const result = sanitizeHtml('<img src="x" onerror="alert(1)" alt="img">');
      expect(result).not.toContain('onerror');
    });

    it('应移除 onload 属性', () => {
      const result = sanitizeHtml('<img src="x" onload="alert(1)" alt="img">');
      expect(result).not.toContain('onload');
    });

    it('应移除 onmouseover 属性', () => {
      const result = sanitizeHtml('<p onmouseover="alert(1)">text</p>');
      expect(result).toBe('<p>text</p>');
    });

    it('应移除 onfocus 属性', () => {
      const result = sanitizeHtml('<p onfocus="alert(1)" tabindex="0">text</p>');
      expect(result).not.toContain('onfocus');
    });

    it('应移除所有 on* 事件处理属性', () => {
      const handlers = [
        'onblur', 'onchange', 'oninput', 'onsubmit',
        'onkeydown', 'onkeyup', 'onkeypress',
        'ontouchstart', 'ontouchend', 'ontouchmove',
      ];
      for (const handler of handlers) {
        const input = `<p ${handler}="alert(1)">text</p>`;
        const result = sanitizeHtml(input);
        expect(result).not.toContain(handler);
      }
    });

    it('应移除 action 属性', () => {
      const result = sanitizeHtml('<form action="evil.com"><p>text</p></form>');
      expect(result).toBe('<p>text</p>');
    });

    it('应移除 formaction 属性', () => {
      const result = sanitizeHtml('<button formaction="evil.com">click</button><p>safe</p>');
      // <button> 不在白名单中，DOMPurify 移除标签但保留文本内容
      expect(result).not.toContain('<button');
      expect(result).not.toContain('formaction');
      expect(result).toContain('<p>safe</p>');
    });
  });

  // ── sanitizeHtml XSS 攻击向量防护 ──

  describe('sanitizeHtml — XSS 攻击向量防护', () => {
    it('应防护 <script> 注入', () => {
      const result = sanitizeHtml('<script>alert(document.cookie)</script>');
      expect(result).toBe('');
    });

    it('应防护 <img onerror> 注入', () => {
      const result = sanitizeHtml('<img src="x" onerror="alert(1)">');
      expect(result).not.toContain('onerror');
      expect(result).not.toContain('alert');
    });

    it('应防护 <svg onload> 注入', () => {
      const result = sanitizeHtml('<svg onload="alert(1)"></svg>');
      expect(result).not.toContain('onload');
      expect(result).not.toContain('alert');
    });

    it('应防护 <iframe srcdoc> 注入', () => {
      const result = sanitizeHtml('<iframe srcdoc="<script>alert(1)</script>"></iframe>');
      expect(result).toBe('');
    });

    it('应防护 javascript: 协议链接', () => {
      const result = sanitizeHtml('<a href="javascript:alert(1)">click</a>');
      expect(result).not.toContain('javascript:');
    });

    it('应防护 data: 协议链接', () => {
      const result = sanitizeHtml('<a href="data:text/html,<script>alert(1)</script>">click</a>');
      expect(result).not.toContain('data:');
    });

    it('应防护嵌套 <script> 标签', () => {
      const result = sanitizeHtml('<<script>script>alert(1)<<script>/script>');
      expect(result).not.toContain('alert(1)');
    });

    it('应防护 HTML 实体编码的 XSS', () => {
      const result = sanitizeHtml('&#60;script&#62;alert(1)&#60;/script&#62;');
      // DOMPurify 将实体编码内容视为纯文本，不会形成可执行的 <script> 标签
      expect(result).not.toContain('<script');
      expect(result).not.toContain('<script>');
    });

    it('应防护 <a> 标签的 javascript: 协议', () => {
      const result = sanitizeHtml('<a href="javascript:void(0)" onclick="alert(1)">link</a>');
      expect(result).not.toContain('javascript:');
      expect(result).not.toContain('onclick');
    });

    it('应防护 <img> 的 javascript: 协议', () => {
      const result = sanitizeHtml('<img src="javascript:alert(1)" alt="x">');
      expect(result).not.toContain('javascript:');
    });

    it('应保留合法 https 链接同时过滤 javascript 链接', () => {
      const result = sanitizeHtml('<a href="https://safe.com">safe</a><a href="javascript:alert(1)">evil</a>');
      expect(result).toContain('https://safe.com');
      expect(result).not.toContain('javascript:');
    });
  });

  // ── sanitizeHtml 边界条件 ──

  describe('sanitizeHtml — 边界条件', () => {
    it('空字符串输入应返回空字符串', () => {
      expect(sanitizeHtml('')).toBe('');
    });

    it('纯文本应原样返回', () => {
      expect(sanitizeHtml('hello world')).toBe('hello world');
    });

    it('仅含空白字符的输入应原样返回', () => {
      expect(sanitizeHtml('   ')).toBe('   ');
    });

    it('嵌套安全标签应保留', () => {
      const input = '<div><p>text <strong>bold</strong></p></div>';
      expect(sanitizeHtml(input)).toBe(input);
    });

    it('深度嵌套安全标签应保留', () => {
      const input = '<div><div><div><p>deep</p></div></div></div>';
      expect(sanitizeHtml(input)).toBe(input);
    });

    it('混合安全与危险内容应仅保留安全部分', () => {
      const result = sanitizeHtml('<p>safe</p><script>evil()</script><p>also safe</p>');
      expect(result).toBe('<p>safe</p><p>also safe</p>');
    });

    it('未闭合标签应安全处理', () => {
      const result = sanitizeHtml('<p>unclosed');
      // DOMPurify 会自动修复未闭合标签
      expect(result).toContain('unclosed');
    });
  });

  // ── sanitizeMarkdown ──

  describe('sanitizeMarkdown — Markdown HTML 净化', () => {
    it('应保留 Markdown 生成的 <p> 标签', () => {
      expect(sanitizeMarkdown('<p>hello</p>')).toBe('<p>hello</p>');
    });

    it('应保留 Markdown 生成的 <code> 标签', () => {
      expect(sanitizeMarkdown('<p>use <code>npm</code> to install</p>'))
        .toBe('<p>use <code>npm</code> to install</p>');
    });

    it('应保留 Markdown 生成的 <pre><code> 代码块', () => {
      const input = '<pre><code>const x = 1;</code></pre>';
      expect(sanitizeMarkdown(input)).toBe(input);
    });

    it('应保留 Markdown 生成的 <blockquote>', () => {
      expect(sanitizeMarkdown('<blockquote>quote</blockquote>'))
        .toBe('<blockquote>quote</blockquote>');
    });

    it('应保留 Markdown 生成的列表', () => {
      const input = '<ul><li>item1</li><li>item2</li></ul>';
      expect(sanitizeMarkdown(input)).toBe(input);
    });

    it('应保留 Markdown 生成的标题', () => {
      expect(sanitizeMarkdown('<h2>Title</h2>')).toBe('<h2>Title</h2>');
    });

    it('应移除 Markdown 中的 <script> 注入', () => {
      const result = sanitizeMarkdown('<p>text</p><script>alert(1)</script>');
      expect(result).toBe('<p>text</p>');
    });

    it('应移除 Markdown 中的事件处理属性', () => {
      const result = sanitizeMarkdown('<p onclick="alert(1)">text</p>');
      expect(result).toBe('<p>text</p>');
    });

    it('空字符串输入应返回空字符串', () => {
      expect(sanitizeMarkdown('')).toBe('');
    });
  });

  // ── hasXssRisk ──

  describe('hasXssRisk — XSS 风险检测', () => {
    it('安全 HTML 应返回 false', () => {
      expect(hasXssRisk('<p>hello</p>')).toBe(false);
    });

    it('纯文本应返回 false', () => {
      expect(hasXssRisk('hello world')).toBe(false);
    });

    it('含 <script> 应返回 true', () => {
      expect(hasXssRisk('<script>alert(1)</script>')).toBe(true);
    });

    it('含 onclick 应返回 true', () => {
      expect(hasXssRisk('<p onclick="alert(1)">text</p>')).toBe(true);
    });

    it('含 <iframe> 应返回 true', () => {
      expect(hasXssRisk('<iframe src="evil.com"></iframe>')).toBe(true);
    });

    it('空字符串应返回 false', () => {
      expect(hasXssRisk('')).toBe(false);
    });

    it('混合安全与危险内容应返回 true', () => {
      expect(hasXssRisk('<p>safe</p><script>alert(1)</script>')).toBe(true);
    });

    it('javascript 协议链接应返回 true', () => {
      expect(hasXssRisk('<a href="javascript:alert(1)">x</a>')).toBe(true);
    });
  });

  // ── 链接安全强化 ──

  describe('链接安全强化', () => {
    it('target="_blank" 链接应添加 rel="noopener noreferrer"', () => {
      const result = sanitizeHtml('<a href="https://example.com" target="_blank">link</a>');
      expect(result).toContain('rel="noopener noreferrer"');
    });

    it('无 target 的链接不应添加 rel', () => {
      const result = sanitizeHtml('<a href="https://example.com">link</a>');
      expect(result).not.toContain('rel=');
    });

    it('target="_self" 链接不应添加 rel', () => {
      const result = sanitizeHtml('<a href="https://example.com" target="_self">link</a>');
      expect(result).not.toContain('rel="noopener');
    });
  });

  // ── 复杂攻击场景 ──

  describe('复杂攻击场景防护', () => {
    it('应防护 SVG 内嵌 <script>', () => {
      const result = sanitizeHtml('<svg><script>alert(1)</script></svg>');
      expect(result).not.toContain('alert');
      expect(result).not.toContain('<script');
    });

    it('应防护 <math> 标签内的 XSS', () => {
      const result = sanitizeHtml('<math><mtext><script>alert(1)</script></mtext></math>');
      expect(result).not.toContain('alert(1)');
    });

    it('应防护 HTML5 新标签滥用', () => {
      // audio/video 等标签不在白名单中，应被移除
      const result = sanitizeHtml('<audio src="evil.mp3" autoplay></audio><p>safe</p>');
      expect(result).toBe('<p>safe</p>');
    });

    it('应防护 CSS expression() 注入', () => {
      const result = sanitizeHtml('<style>body{background:expression(alert(1))}</style><p>safe</p>');
      expect(result).toBe('<p>safe</p>');
    });

    it('应防护 data URI 图片注入（img 的 data: src 保留，但 script 中的 data: 移除）', () => {
      // img data: URI 在白名单中允许（用于 base64 图片），但 script 标签被移除
      const result = sanitizeHtml('<img src="data:image/png;base64,abc" alt="img"><script>alert(1)</script>');
      expect(result).toContain('data:image/png');
      expect(result).not.toContain('alert');
    });

    it('应防护多次嵌套的 <script>', () => {
      const result = sanitizeHtml('<scr<script>ipt>alert(1)</scr</script>ipt>');
      // DOMPurify 移除 <script> 标签，残留的文本不会执行
      expect(result).not.toContain('<script');
      expect(result).not.toContain('<script>');
    });
  });
});
