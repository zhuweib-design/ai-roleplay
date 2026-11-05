/**
 * 共享基础件契约：`.tk-input` 与 `.modal-btn` 必须有全局基础样式。
 *
 * 起因（2026-10-24 评审 2D-P0-01/P0-02）：两个类在模板里被当成共享类使用，
 * 但 `.tk-input` 全仓只有 `:focus` 规则，`.modal-btn` 只存在于 10 个组件的
 * scoped 复制里；缺定义的地方直接落到浏览器原生控件。
 * 这里钉住"基础件至少定义了哪些可读属性"，视觉是否被 scoped 规则覆盖由截图验收。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const stylesDir = path.resolve(import.meta.dirname, '../../src/styles');
const baseCss = readFileSync(path.join(stylesDir, 'base.css'), 'utf8');
const primitivesCss = readFileSync(path.join(stylesDir, 'primitives.css'), 'utf8');

function readRule(css: string, selector: string): string | null {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`^${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`, 'm').exec(css);
  return match?.[1] ?? null;
}

describe('shared style primitives', () => {
  it('.tk-input 定义了深色输入框的基础盒模型', () => {
    const rule = readRule(baseCss, '.tk-input');
    expect(rule).not.toBeNull();
    expect(rule).toContain('min-height: var(--size-control-md)');
    expect(rule).toContain('background: var(--video-bg)');
    expect(rule).toContain('border: 1px solid var(--border)');
    expect(rule).toContain('border-radius: var(--radius-md)');
    expect(rule).toContain('font-size: var(--font-size-sm)');
  });

  it('.modal-btn 定义了弹窗动作按钮的基础样式', () => {
    const rule = readRule(primitivesCss, '.modal-btn');
    expect(rule).not.toBeNull();
    expect(rule).toContain('display: inline-flex');
    expect(rule).toContain('height: 32px');
    expect(rule).toContain('border: 1px solid var(--border)');
    expect(rule).toContain('background: var(--card-elevated)');
    expect(rule).toContain('border-radius: var(--radius-sm)');
  });
});
