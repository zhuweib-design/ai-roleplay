import type { CustomTheme, SamplingOverrides } from '@/types';
import { generateThemeTokens } from '@/core/theme-extractor';
import {
  createDefaultProviderConfig,
  type ImageProviderConfig,
} from '@core/image-generation';

/**
 * R2-5：settings store 的纯工具层。
 *
 * 这里只放**不碰 store 状态**的归一化/生成函数：无闭包、无响应式依赖，
 * 因此可以独立被持久化层与 store 本体复用，也便于单测直接覆盖脏数据分支。
 */

/**
 * 生成 Profile ID（crypto.randomUUID 优先，回退到时间戳）
 */
export function generateProfileId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `profile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 生成 Quick Reply 按钮 ID（crypto.randomUUID 优先，回退到时间戳）
 */
export function generateQuickReplyId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `qr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 归一化自定义主题：以 palette 为唯一数据源，重新生成 tokens。
 * - 兼容旧数据缺 avgLuminance 字段
 * - 自愈历史缺陷数据（如 --primary: #000000）
 */
export function normalizeCustomTheme(ct: CustomTheme): CustomTheme {
  const palette = Array.isArray(ct.palette) ? ct.palette.filter((c) => typeof c === 'string') : [];
  const paletteRatios = Array.isArray(ct.paletteRatios) ? ct.paletteRatios : [];
  // 空色板时回退默认深色主题令牌
  if (palette.length === 0) {
    return {
      background: ct.background ?? '',
      palette,
      paletteRatios,
      avgLuminance: typeof ct.avgLuminance === 'number' ? ct.avgLuminance : 0.5,
      tokens: { ...(ct.tokens ?? {}) },
    };
  }
  const avgLuminance =
    typeof ct.avgLuminance === 'number'
      ? ct.avgLuminance
      : // 旧数据缺 avgLuminance：按主色平均亮度近似
        palette.reduce((sum, hex) => sum + luminanceOfHex(hex), 0) / palette.length;
  const tokens = generateThemeTokens({ colors: palette, ratios: paletteRatios, avgLuminance });
  return {
    background: ct.background ?? '',
    palette,
    paletteRatios,
    avgLuminance,
    tokens,
  };
}

/**
 * P0-3：归一化全局采样默认值
 * 逐字段校验，丢弃非法值；全空时返回 null（= 未设置，走供应商默认）
 */
export function normalizeSamplingDefaults(raw: unknown): SamplingOverrides | null {
  if (!raw || typeof raw !== 'object') return null;
  const src = raw as Record<string, unknown>;
  const out: SamplingOverrides = {};
  for (const key of ['topP', 'presencePenalty', 'frequencyPenalty'] as const) {
    const v = src[key];
    if (typeof v === 'number' && Number.isFinite(v)) {
      out[key] = v;
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * E22：归一化图像生成 Provider 配置。
 * 逐字段校验，脏值回落默认（不能让一个坏 endpoint 字段把整份设置读崩）；
 * apiKey 原样保留——设了主密码时它是密文，解密在 unlock 的 decryptAllApiKeys 里做。
 */
export function normalizeImageGenConfig(raw: unknown): ImageProviderConfig {
  const base = createDefaultProviderConfig();
  if (!raw || typeof raw !== 'object') return base;
  const src = raw as Record<string, unknown>;
  return {
    type: src.type === 'custom' ? 'custom' : base.type,
    endpoint: typeof src.endpoint === 'string' ? src.endpoint : base.endpoint,
    apiKey: typeof src.apiKey === 'string' ? src.apiKey : base.apiKey,
    model: typeof src.model === 'string' ? src.model : base.model,
    enabled: typeof src.enabled === 'boolean' ? src.enabled : base.enabled,
  };
}

/** 计算 hex 色的相对亮度（0-1），供旧数据缺 avgLuminance 时近似 */
function luminanceOfHex(hex: string): number {
  const h = hex.replace(/^#/, '');
  if (h.length !== 6) return 0.5;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if ([r, g, b].some((v) => Number.isNaN(v))) return 0.5;
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
