// 对比度检查脚本（Phase G3）
// 计算 WCAG 颜色对比度，验证 3 个主题的关键颜色对是否 ≥ 4.5:1

/** 将 hex 颜色转 RGB */
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/** 计算相对亮度（WCAG 2.1） */
function luminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const transform = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * transform(r) + 0.7152 * transform(g) + 0.0722 * transform(b);
}

/** 计算对比度 */
function contrast(fg, bg) {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// 四个主题的变量
const themes = {
  dark: {
    background: '#0B0B10',
    card: '#1A1C2B',
    'card-elevated': '#262A3C',
    'video-bg': '#181821',
    foreground: '#F5F5F7',
    'muted-foreground': '#AEB2C0',
    'on-media': '#FFFFFF',
    'on-accent': '#161823',
    'on-primary': '#FFFFFF',
    border: '#666C9E',
    primary: '#DC1434',
    'primary-fg': '#F0466A',
    secondary: '#25F4EE',
    destructive: '#EA4F53',
    'error-fg': '#FF6485',
    'error-bg': '#2E1416',
    'success-fg': '#34D399',
    'success-bg': '#0E2A22',
    'accent-blue': '#5B9BD5',
    'accent-orange': '#E0A060',
    'warning-fg': '#F59E0B',
  },
  light: {
    background: '#F7F8FA',
    card: '#FFFFFF',
    'card-elevated': '#FFFFFF',
    'video-bg': '#F2F3F6',
    foreground: '#161823',
    'muted-foreground': '#5D5F6B',
    'on-media': '#FFFFFF',
    'on-accent': '#FFFFFF',
    'on-primary': '#FFFFFF',
    border: '#DCDCE2',
    primary: '#C81E45',
    'primary-fg': '#C81E45',
    secondary: '#0A7A77',
    destructive: '#DC2626',
    'error-fg': '#991B1B',
    'error-bg': '#FEE2E2',
    'success-fg': '#065F46',
    'success-bg': '#D1FAE5',
    'accent-blue': '#2563EB',
    'accent-orange': '#B45309',
    'warning-fg': '#B45309',
  },
  midnight: {
    background: '#0A0E27',
    card: '#161C42',
    'card-elevated': '#222B5E',
    'video-bg': '#111740',
    foreground: '#F0F4FF',
    'muted-foreground': '#A5B0D6',
    'on-media': '#FFFFFF',
    'on-accent': '#0A0E27',
    'on-primary': '#FFFFFF',
    border: '#5F69B0',
    primary: '#9333EA',
    'primary-fg': '#B366FF',
    secondary: '#7DF9FF',
    destructive: '#F87171',
    'error-fg': '#FCA5A5',
    'error-bg': '#2E1416',
    'success-fg': '#6EE7B7',
    'success-bg': '#0E2A22',
    'accent-blue': '#60A5FA',
    'accent-orange': '#FBBF24',
    'warning-fg': '#FBBF24',
  },
  oled: {
    background: '#000000',
    card: '#161616',
    'card-elevated': '#242424',
    'video-bg': '#0D0D0D',
    foreground: '#FFFFFF',
    'muted-foreground': '#A1A1A1',
    'on-media': '#FFFFFF',
    'on-accent': '#0A0A0A',
    'on-primary': '#FFFFFF',
    border: '#66666E',
    primary: '#E11D48',
    'primary-fg': '#F43F5E',
    secondary: '#06B6D4',
    destructive: '#EF4444',
    'error-fg': '#FCA5A5',
    'error-bg': '#2A0A0A',
    'success-fg': '#6EE7B7',
    'success-bg': '#052E1F',
    'accent-blue': '#60A5FA',
    'accent-orange': '#FBBF24',
    'warning-fg': '#FBBF24',
  },
  theatre: {
    background: '#0C0A09',
    card: '#211B14',
    'card-elevated': '#2F281C',
    'video-bg': '#151008',
    foreground: '#F5EFE6',
    'muted-foreground': '#A69C8E',
    'on-media': '#FFFFFF',
    'on-accent': '#181104',
    'on-primary': '#181104',
    border: '#7A6741',
    primary: '#C9A24B',
    'primary-fg': '#E2C285',
    secondary: '#E85D7F',
    destructive: '#EA4F53',
    'error-fg': '#F6A5A9',
    'error-bg': '#321316',
    'success-fg': '#86E3B4',
    'success-bg': '#0E2E20',
    'accent-blue': '#82A6F2',
    'accent-orange': '#EFB264',
    'warning-fg': '#E8B45C',
  },
};

// 需要检查的「前景/背景」对（模拟实际 UI 场景）
const checks = [
  // 文本
  { name: '前景/背景（正文）', fg: 'foreground', bg: 'background' },
  { name: '前景/卡片（正文）', fg: 'foreground', bg: 'card' },
  { name: 'muted/背景（次要文本）', fg: 'muted-foreground', bg: 'background' },
  { name: 'muted/卡片（次要文本）', fg: 'muted-foreground', bg: 'card' },
  { name: 'muted/card-elevated（输入提示）', fg: 'muted-foreground', bg: 'card-elevated' },
  { name: 'secondary/背景（强调文本）', fg: 'secondary', bg: 'background' },
  { name: 'secondary/卡片（强调文本）', fg: 'secondary', bg: 'card' },
  { name: 'primary-fg/背景（品牌色文本）', fg: 'primary-fg', bg: 'background' },
  { name: 'primary-fg/卡片（品牌色文本）', fg: 'primary-fg', bg: 'card' },
  { name: 'destructive/卡片（错误文本）', fg: 'destructive', bg: 'card' },
  // 按钮文字
  { name: 'on-primary/primary（主按钮）', fg: 'on-primary', bg: 'primary' },
  { name: 'on-accent/secondary（次按钮）', fg: 'on-accent', bg: 'secondary' },
  // 错误/成功提示
  { name: 'error-fg/error-bg', fg: 'error-fg', bg: 'error-bg' },
  { name: 'success-fg/success-bg', fg: 'success-fg', bg: 'success-bg' },
  // 扩展强调色（v1.1）·文本 on 背景/卡片
  { name: 'accent-blue/背景（信息文本）', fg: 'accent-blue', bg: 'background' },
  { name: 'accent-blue/卡片（信息文本）', fg: 'accent-blue', bg: 'card' },
  { name: 'accent-orange/背景（警示文本）', fg: 'accent-orange', bg: 'background' },
  { name: 'accent-orange/卡片（警示文本）', fg: 'accent-orange', bg: 'card' },
  { name: 'warning-fg/背景（警告文本）', fg: 'warning-fg', bg: 'background' },
  { name: 'warning-fg/卡片（警告文本）', fg: 'warning-fg', bg: 'card' },
  // 扩展强调色 · 按钮文字（on-accent on accent-*）
  { name: 'on-accent/accent-blue（信息按钮）', fg: 'on-accent', bg: 'accent-blue' },
  { name: 'on-accent/accent-orange（警示按钮）', fg: 'on-accent', bg: 'accent-orange' },
];

console.log('═══════════════════════════════════════════════════════════');
console.log('  WCAG 颜色对比度检查（AA 要求 ≥ 4.5:1，AAA ≥ 7:1）');
console.log('═══════════════════════════════════════════════════════════\n');

let failedCount = 0;
for (const [themeName, colors] of Object.entries(themes)) {
  console.log(`─── ${themeName} 主题 ───`);
  for (const check of checks) {
    const fg = colors[check.fg];
    const bg = colors[check.bg];
    const ratio = contrast(fg, bg);
    const status = ratio >= 7 ? 'AAA ✓' : ratio >= 4.5 ? 'AA  ✓' : ratio >= 3 ? 'AA-large ⚠' : 'FAIL ✗';
    // 项目硬约束要求 ≥4.5:1，AA-large（3≤ratio<4.5）和 FAIL（<3）均计为未达标
    if (!status.includes('✓')) failedCount++;
    console.log(`  ${status}  ${check.name}: ${ratio.toFixed(2)}:1  (${fg} on ${bg})`);
  }
  console.log('');
}

console.log('═══════════════════════════════════════════════════════════');
console.log(`  总计未达 AA（4.5:1）：${failedCount} 项`);
console.log('═══════════════════════════════════════════════════════════');
process.exit(failedCount > 0 ? 1 : 0);
