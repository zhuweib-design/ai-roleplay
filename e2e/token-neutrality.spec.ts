/**
 * E2E · token 迁移的像素中性回归网（M19-a）
 *
 * 要防的事故只有一件：**CSS 变量名写错不会报错，只会让那条声明静默失效**。
 * 静态守卫（scripts/token-guard.mjs）能抓"全仓没人定义"的那一类，抓不到
 * "定义了但不是这个名"（比如把 `--space-2-5` 写成 `--space-2`）——那种引用合法、
 * 值却换成另一个尺度。唯一可靠的裁判是浏览器算出来的样式，所以这张网量的是
 * `getComputedStyle`，不是截图：截图要人看，计算样式可以直接进断言。
 *
 * 覆盖形状：
 * - **5 套主题各采一遍**。结构层（尺寸/间距/字号）与主题无关，但语义层的色是每套主题
 *   重定义 25–29 个变量得来的，只测 dark 等于没测剩下四套。
 * - **只取可见的那个匹配**。设置页 7 个面板是 v-show 互斥，全部挂在 DOM 上：
 *   `/settings?cat=extension` 下 `.settings-section` 有 13 个匹配、只有 1 个可见（探针实测）。
 *   `display:none` 的元素仍会返回它自己那份计算值，所以取错对象不会报错，只会把
 *   "别的面板长什么样"当成这个面板的基线。取不到可见匹配就当红，不许凑数。
 * - **选择器没匹配到可见元素 ⇒ 直接红**。这条是上面的反面保障：基线不能靠空值凑数。
 * - **一条主题一条用例**（不是串成一条）。量出来的：串成一条时单跑 5.7s，但本地 4 worker
 *   全量并发下要 39–50s，而配置的单测预算是 60s——playwright.config.ts 的注释早就写着
 *   "并发下随机红 1–3 条，红相是负载不是回归"。贴着上限的安全网一定会被当成噪声忽略，
 *   所以切开：单条并发下约 12s，余量 5 倍，红了还能直接说出是哪套主题出的问题。
 * - 只跑桌面 project（msedge / CI chromium）。webkit 由既有的对比度与主题 e2e 覆盖，
 *   同一份计算样式在两个内核各存一份基线，会让"改 token"变成"改两份基线"，评审成本翻倍。
 *
 * 两个已知盲区（登记在这里，别误以为网测到了）：
 * 1. 视口固定在 1280×720，`@media (max-width: 640px)` 里的规则本网看不见。所以迁移批配一条
 *    纪律：断点块内的字面量这一轮不动；要动就先按同一形状加一个窄视口目标（多一份基线）。
 * 2. 只采 TARGETS 列出的选择器，改了没列出的规则时网是绿的但没测到。所以每个迁移批开工前，
 *    先把"这批会碰到的选择器"补进清单再重生成基线。
 *
 * 用法：
 *   校验（默认，CI 用）：npx playwright test e2e/token-neutrality.spec.ts
 *   重生成基线：NEUTRALITY_UPDATE=1 npx playwright test e2e/token-neutrality.spec.ts
 *   ⇒ 更新基线等于承认"这次改动会改画面"。M19–M22 的规则是这几批必须中性，
 *     所以看到需要跑 UPDATE 就先当成 bug 查，别用它把红的用例按绿。
 */
import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const BASELINE_FILE = path.join(ROOT, 'e2e', 'neutrality-baseline.json');
const UPDATE = process.env.NEUTRALITY_UPDATE === '1';
const VIEWPORT = { width: 1280, height: 720 };

const THEMES = ['dark', 'light', 'midnight', 'oled', 'theatre'] as const;

/**
 * 每个面板一族一条目标。路由用 `?cat=`（M15-a 的守卫已经把它登记成合法的分类深链键，
 * 站内 `/settings?cat=model` 这类跳转早就在用），不用点击导航 ⇒ 少一层时序依赖。
 * 选择器取自各面板模板里的结构类名，只列"承载样式的那层"，不列纯文本节点。
 */
const TARGETS: Array<{ id: string; route: string; open?: string; selectors: readonly string[] }> = [
  {
    id: 'settings-extension',
    route: '/settings?cat=extension',
    selectors: [
      '.settings-section',
      '.section-header',
      '.section-title',
      '.extension-security-note',
      '.extension-block',
      '.extension-title',
      '.form-row',
      // 上面那条是"页面上第一个可见的 .form-row"，可能不是本面板的那条；这里补一条
      // 带面板前缀的，保证"我改的是哪一条"和"网测的是哪一条"是同一个元素。
      '.extension-block .form-row',
      '.hint-text',
      '.tk-range',
      '.extension-block .form-row > span',
      '.extension-block .form-row input[type="range"]',
      '.extension-block .form-row input[type="number"]',
      '.extension-block .form-row select',
    ],
  },
  {
    id: 'settings-about',
    route: '/settings?cat=about',
    /**
     * `.account-login-note` 只在 `showLoginPanel` 打开时存在（模板里是 v-if），
     * 而它有自己的 padding/gap/字号要迁，所以采之前先点"登录"按钮把它召唤出来。
     * 这一步必须在采样之前做完，否则该选择器会撞上"空转"守卫。
     */
    open: '.account-login-btn',
    selectors: [
      '.settings-section',
      '.section-header',
      '.section-title',
      '.section-hint',
      '.account-head',
      '.account-user',
      '.account-avatar',
      '.account-info',
      '.account-name-line',
      '.account-name',
      '.account-active',
      '.account-row',
      '.account-login-btn',
      '.account-login-note',
      '.data-mgmt-section',
      '.data-mgmt-block',
      '.data-mgmt-row',
      '.data-mgmt-subtitle',
      '.data-mgmt-hint',
    ],
  },
];

/**
 * 采这些属性是因为它们是迁移会碰的那几类：色、字号与行高、四边内边距、间隙、圆角、边框宽、
 * display 与 flex 方向（布局形状）。刻意不采 width/height —— 它们随文案长度和内容变，
 * 会让这张网在无关提交上红，进而被当成噪声忽略。
 *
 * **属性名必须是 CSS 的连字符名**，不是 JS 的驼峰名：`getPropertyValue('rowGap')` 返回空串，
 * 而空串照样能"和基线一致"，于是整张网变成只测 color/display。第一次就踩了这个坑
 * （注入 gap 16px→12px 后用例仍绿，探针量到 DOM 里确实是 12px），所以下面有"空值即红"的断言。
 */
const PROPS = [
  'color',
  'background-color',
  'font-size',
  'font-weight',
  'line-height',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'row-gap',
  'column-gap',
  'border-top-left-radius',
  'border-bottom-right-radius',
  'border-top-width',
  'border-top-color',
  'display',
  'flex-direction',
] as const;

test.use({ viewport: VIEWPORT });

/** 切主题：走真实 UI（设置页主题卡），等 data-theme 落地，再等计算样式不再变才采样 */
async function applyTheme(page: Page, theme: string): Promise<void> {
  await page.goto('/settings?cat=appearance');
  const card = page.locator(`.theme-card[data-value="${theme}"]`);
  await expect(card).toBeVisible();
  await card.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  // 主题切换带颜色过渡，过渡中间态会让"半混合色"进基线（axe 那边为此踩过 450ms 的坑）。
  // 这里不用固定等待：轮询到连续两次读数相同才算稳，最多 2.5s。
  await expect
    .poll(
      async () => {
        const a = await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
        await page.waitForTimeout(120);
        const b = await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
        return a === b ? 'stable' : 'moving';
      },
      { message: '主题过渡未在 2.5s 内静止' }
    )
    .toBe('stable');
}

/** 一次 evaluate 采完一个目标；只看可见匹配，不可见的 v-show 兄弟一律跳过 */
async function collect(page: Page, selectors: readonly string[]): Promise<Record<string, Record<string, string>>> {
  return page.evaluate(
    ({ selectors: sels, props }) => {
      const out: Record<string, Record<string, string>> = {};
      for (const sel of sels) {
        const els = [...document.querySelectorAll(sel)] as HTMLElement[];
        // offsetParent 为 null ⇒ 自身或祖先是 display:none（v-show 关着的面板就是这样）
        const el = els.find((e) => e.offsetParent !== null);
        if (!el) {
          out[sel] = { __missing__: `匹配 ${els.length} 个，可见 0 个` };
          continue;
        }
        const cs = getComputedStyle(el);
        const rec: Record<string, string> = {};
        for (const p of props) rec[p] = cs.getPropertyValue(p);
        out[sel] = rec;
      }
      return out;
    },
    { selectors: [...selectors], props: [...PROPS] }
  );
}

type Baseline = {
  generatedAt: string;
  viewport: { width: number; height: number };
  themes: string[];
  props: string[];
  samples: Record<string, Record<string, Record<string, Record<string, string>>>>;
};

type ThemeSamples = Record<string, Record<string, string>>;

/** 采一个主题下所有目标；空转守卫与空值守卫都在这里就地失败 */
async function sampleTheme(page: Page, theme: string): Promise<Record<string, ThemeSamples>> {
  const out: Record<string, ThemeSamples> = {};
  for (const t of TARGETS) {
    await page.goto(t.route);
    if (t.open) {
      const trigger = page.locator(t.open).first();
      await expect(trigger).toBeVisible();
      await trigger.click();
    }
    // 等到清单里**每个**选择器都有可见匹配再采：路由切换中间态、以及上面那个
    // open 点击后的 Vue 重渲染，都还没落地就采样会把"还没渲染"记进基线。
    await expect
      .poll(
        async () =>
          page.evaluate(
            (sels) =>
              sels.filter((sel) =>
                [...document.querySelectorAll(sel)].some((e) => (e as HTMLElement).offsetParent !== null)
              ).length,
            [...t.selectors]
          ),
        { message: `${t.route} 在 ${theme} 下有选择器始终量不到可见元素`, timeout: 20_000 }
      )
      .toBe(t.selectors.length);
    out[t.id] = await collect(page, t.selectors);
  }

  const missing = Object.entries(out).flatMap(([id, sels]) =>
    Object.entries(sels)
      .filter(([, rec]) => '__missing__' in rec)
      .map(([sel, rec]) => `${id}/${theme}/${sel}：${rec.__missing__}`)
  );
  expect(missing, '有选择器在这个页面上找不到可见元素 ⇒ 这张网在空转，不许用默认值凑基线').toEqual([]);

  /**
   * 空串一律算失败：`getPropertyValue` 拿到不认识的名字就返回 ''，而 '' 与 '' 是"一致"的。
   * 这一条把上面那个坑变成结构性拦得住的写法——属性名写错的那一刻用例就红，而不是静默少测。
   */
  const blanks = Object.entries(out).flatMap(([id, sels]) =>
    Object.entries(sels).flatMap(([sel, rec]) =>
      Object.entries(rec)
        .filter(([, v]) => v === '')
        .map(([p]) => `${id}/${theme}/${sel} 的 ${p} 读到空值`)
    )
  );
  expect(blanks, `有 ${blanks.length} 个属性读不到值（属性名写错？）：\n${blanks.slice(0, 12).join('\n')}`).toEqual([]);

  return out;
}

function checkSample(got: Record<string, ThemeSamples>, base: Baseline, theme: string) {
  const diffs: string[] = [];
  for (const t of TARGETS) {
    const b = base.samples[t.id]?.[theme];
    if (!b) {
      diffs.push(`${t.id}/${theme}：基线里没有这一项（新增目标要先跑 NEUTRALITY_UPDATE=1）`);
      continue;
    }
    for (const sel of Object.keys(got[t.id])) {
      if (!b[sel]) {
        diffs.push(`${t.id}/${theme}/${sel}：基线里没有这个选择器`);
        continue;
      }
      for (const p of Object.keys(got[t.id][sel])) {
        if (got[t.id][sel][p] !== b[sel][p]) diffs.push(`${t.id}/${theme}/${sel} { ${p} }: ${b[sel][p]} → ${got[t.id][sel][p]}`);
      }
    }
    for (const sel of Object.keys(b)) {
      if (!got[t.id][sel]) diffs.push(`${t.id}/${theme}/${sel}：现在页面上量不到了（基线里它是有值的）`);
    }
  }
  const n = Object.values(got).reduce((a, sels) => a + Object.keys(sels).length * PROPS.length, 0);
  expect(
    diffs,
    `${n} 个属性读数里有 ${diffs.length} 处不一致：\n${diffs.slice(0, 15).join('\n')}${diffs.length > 15 ? `\n（其余 ${diffs.length - 15} 处省略）` : ''}`
  ).toEqual([]);
}

/** 基线文件自身的形状：视口、主题清单、属性清单都必须与代码一致，否则差异不可解释 */
function loadBaseline(): Baseline {
  expect(fs.existsSync(BASELINE_FILE), `基线文件不存在：${path.relative(ROOT, BASELINE_FILE)}`).toBe(true);
  const base = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8')) as Baseline;
  expect(base.viewport, `基线记录的视口与当前不符（${base.viewport.width}x${base.viewport.height}）`).toEqual(VIEWPORT);
  expect(base.themes, '基线覆盖的主题要就是这 5 套').toEqual([...THEMES]);
  expect([...base.props].sort(), '基线采的属性要就是这一组').toEqual([...PROPS].sort());
  return base;
}

function assertViewport(page: Page) {
  const size = page.viewportSize();
  expect(
    { width: size?.width ?? -1, height: size?.height ?? -1 },
    '基线是在固定视口下量的，视口变了必须先重生成基线再评审差异'
  ).toEqual(VIEWPORT);
}

if (UPDATE) {
  // 只在本机手动跑：一次启动串完 5 套主题再写文件（并行写同一份 JSON 会互相盖掉）。
  test.setTimeout(180_000);
  test('重生成基线：5 主题 × 2 面板的计算样式（NEUTRALITY_UPDATE=1 专用）', async ({ page }) => {
    assertViewport(page);
    const samples: Baseline['samples'] = {};
    for (const theme of THEMES) {
      await applyTheme(page, theme);
      const got = await sampleTheme(page, theme);
      for (const [id, rec] of Object.entries(got)) ((samples[id] ??= {})[theme] as ThemeSamples) = rec;
    }
    const n = Object.values(samples).reduce((a, byTheme) => a + Object.values(byTheme).reduce((b, s) => b + Object.keys(s).length * PROPS.length, 0), 0);
    const payload: Baseline = {
      generatedAt: new Date().toISOString().slice(0, 10),
      viewport: VIEWPORT,
      themes: [...THEMES],
      props: [...PROPS],
      samples,
    };
    fs.writeFileSync(BASELINE_FILE, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    console.log(`已写基线 ${path.relative(ROOT, BASELINE_FILE)}：${n} 个属性读数`);
    expect(n).toBeGreaterThan(0);
  });
} else {
  /**
   * 一条主题一条用例，理由是量出来的：整条串在一起时单跑 5.7s，但 4 worker 全量并发下要
   * 39–50s，而配置的单测预算是 60s（playwright.config.ts 的注释就写着"并发下随机红 1–3 条"）。
   * 贴着上限的安全网会被当噪声忽略，所以切成 5 条各测一套主题——单条并发下 ~12s，余量 5 倍，
   * 而且红了直接说出是哪套主题出的问题。
   */
  for (const theme of THEMES) {
    test(`像素中性网：「${theme}」主题下两个设置面板的计算样式与基线一致`, async ({ page }) => {
      assertViewport(page);
      const base = loadBaseline();
      await applyTheme(page, theme);
      checkSample(await sampleTheme(page, theme), base, theme);
    });
  }
}
