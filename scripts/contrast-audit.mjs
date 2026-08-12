// 最终令牌全面复核：WCAG 2.1 AA（文本4.5 / 非文本3 / 表面区分）
function lum(hex) {
  const c = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16) / 255).map((v) =>
    v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a, b) {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}
const fmt = (v) => v.toFixed(2);

const themes = {
  dark: {
    bg: '#0B0B10', card: '#1A1C2B', elev: '#262A3C',
    fg: '#F5F5F7', muted: '#AEB2C0', primaryFg: '#F0466A',
    primary: '#DC1434', onPrimary: '#FFFFFF', onAccent: '#161823',
    secondary: '#25F4EE', border: '#666C9E',
    successFg: '#34D399', successBg: '#0E2A22', errorFg: '#FF6485', errorBg: '#2E1416',
    tag: ['#34D399', '#60A5FA', '#C084FC', '#9CA3AF'],
  },
  midnight: {
    bg: '#0A0E27', card: '#161C42', elev: '#222B5E',
    fg: '#F0F4FF', muted: '#A5B0D6', primaryFg: '#B366FF',
    primary: '#9333EA', onPrimary: '#FFFFFF', onAccent: '#0A0E27',
    secondary: '#7DF9FF', border: '#5F69B0',
    successFg: '#6EE7B7', successBg: '#0E2A22', errorFg: '#FCA5A5', errorBg: '#2E1416',
    tag: ['#34D399', '#60A5FA', '#C084FC', '#A5B0D6'],
  },
  oled: {
    bg: '#000000', card: '#161616', elev: '#242424',
    fg: '#FFFFFF', muted: '#A1A1A1', primaryFg: '#F43F5E',
    primary: '#E11D48', onPrimary: '#FFFFFF', onAccent: '#0A0A0A',
    secondary: '#06B6D4', border: '#66666E',
    successFg: '#6EE7B7', successBg: '#052E1F', errorFg: '#FCA5A5', errorBg: '#2A0A0A',
    tag: ['#34D399', '#7BA3F5', '#C084FC', '#9CA3AF'],
  },
  theatre: {
    bg: '#0C0A09', card: '#211B14', elev: '#2F281C',
    fg: '#F5EFE6', muted: '#A69C8E', primaryFg: '#E2C285',
    primary: '#C9A24B', onPrimary: '#181104', onAccent: '#181104',
    secondary: '#E85D7F', border: '#7A6741',
    successFg: '#86E3B4', successBg: '#0E2E20', errorFg: '#F6A5A9', errorBg: '#321316',
    tag: ['#34D399', '#7BA3F5', '#C084FC', '#9CA3AF'],
  },
};

let fail = 0;
for (const [name, t] of Object.entries(themes)) {
  console.log(`\n=== ${name} ===`);
  const pairs = [
    ['正文 fg/card (4.5)', t.fg, t.card, 4.5],
    ['正文 fg/bg (4.5)', t.fg, t.bg, 4.5],
    ['辅助 muted/card (4.5)', t.muted, t.card, 4.5],
    ['强调 primaryFg/bg (4.5)', t.primaryFg, t.bg, 4.5],
    ['主按钮 onPrimary/primary (4.5)', t.onPrimary, t.primary, 4.5],
    ['次按钮 onAccent/secondary (4.5)', t.onAccent, t.secondary, 4.5],
    ['输入边框 border/card (3)', t.border, t.card, 3.0],
    ['边框 border/bg (3)', t.border, t.bg, 3.0],
    ['success-fg/bg (4.5)', t.successFg, t.successBg, 4.5],
    ['error-fg/bg (4.5)', t.errorFg, t.errorBg, 4.5],
    ['card/bg 表面 (1.15)', t.card, t.bg, 1.15],
    ['elev/bg 表面 (1.3)', t.elev, t.bg, 1.3],
    ['elev/card 表面 (1.15)', t.elev, t.card, 1.15],
  ];
  for (const [label, a, b, min] of pairs) {
    const r = ratio(a, b);
    const ok = r >= min;
    if (!ok) fail++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${label}: ${fmt(r)} (需≥${min})`);
  }
  for (const tag of t.tag) {
    const r = ratio(tag, t.card);
    const ok = r >= 4.5;
    if (!ok) fail++;
    console.log(`${ok ? 'PASS' : 'FAIL'} 标签色 ${tag}/card (4.5): ${fmt(r)}`);
  }
}
console.log(`\n${fail} 项不达标`);
process.exit(fail > 0 ? 1 : 0);
