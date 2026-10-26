/**
 * E2E · token 迁移的像素中性回归网（M19-a 建网，M20-a 扩到对话区表面）
 *
 * 要防的事故只有一件：**CSS 变量名写错不会报错，只会让那条声明静默失效**。
 * 静态守卫（scripts/token-guard.mjs）能抓"全仓没人定义"的那一类，抓不到
 * "定义了但不是这个名"（比如把 `--space-2-5` 写成 `--space-2`）——那种引用合法、
 * 值却换成另一个尺度。唯一可靠的裁判是浏览器算出来的样式，所以这张网量的是
 * `getComputedStyle`，不是截图：截图要人看，计算样式可以直接进断言。
 *
 * 覆盖形状：
 * - **每款内置皮肤各采一遍**（清单取自 THEME_PRESETS，新增一款就多一列）。结构层（尺寸/间距/字号）与主题无关，但语义层的色是每套主题
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
import { THEME_PRESETS } from '../src/types';
import { applyThemeAndWait, waitForPersistedTheme } from './theme-persistence';
import { seedCharacter } from './helpers/seed-character';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const BASELINE_FILE = path.join(ROOT, 'e2e', 'neutrality-baseline.json');
const UPDATE = process.env.NEUTRALITY_UPDATE === '1';
const VIEWPORT = { width: 1280, height: 720 };

/** 皮肤清单取自 src/types 的 THEME_PRESETS：新增一款就多测一列，不靠人记得改这里 */
const THEMES: readonly string[] = THEME_PRESETS;

/**
 * 每个面板一族一条目标。路由用 `?cat=`（M15-a 的守卫已经把它登记成合法的分类深链键，
 * 站内 `/settings?cat=model` 这类跳转早就在用），不用点击导航 ⇒ 少一层时序依赖。
 * 选择器取自各面板模板里的结构类名，只列"承载样式的那层"，不列纯文本节点。
 */
const TARGETS: Array<{
  id: string;
  route: string;
  open?: string;
  /** 采样前的准备步骤（例如造一条会话）。在 `page.goto(route)` 之后调用 */
  prepare?: (page: Page) => Promise<void>;
  selectors: readonly string[];
}> = [
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
    id: 'chat-surface',
    route: '/chat',
    /**
     * 对话区一族（M20-a）。清单只列"走中性网这条路径时必定可见"的元素 ——
     * 先访问设置页切主题再回 /chat 时，消息列表是空的（首探直接进 /chat 看到的 6 条气泡
     * 属于另一条恢复出来的会话），所以 `.msg-bubble` / `.gen-text` / `.cache-rate` 这类
     * 条件元素留到 M20-b 造好会话数据后再补，不拿"偶尔在"的选择器凑数（那会让网空转）。
     */
    selectors: [
      '.chat-header',
      '.chat-title',
      '.chat-name',
      '.chat-actions',
      '.panel-toggle-btn',
      '.model-badge',
      '.chat-token',
      '.chat-main',
      '.chat-footer',
      '.chat-input',
    ],
  },
  {
    id: 'nav-rail',
    route: '/chat',
    /**
     * 侧栏激活项一族（M23-f）。`.nav-item.active` 是"整块填充辅色 + 反色文字"这一配对的
     * 代表元素，M23-f 把它的文字色从 `--primary-foreground`（= 页面底色）并进 `--on-accent`
     * ——同一个视觉配对原先开两个槽，换皮肤要记两处、漏一处就出现"亮辅色配亮字"。
     * 这条改动不在前三个目标里，不补这一项，网对本次改动就是绿的但没测到。
     */
    selectors: ['.nav-rail', '.nav-item', '.nav-item.active', '.nav-item.active .nav-label'],
  },
  {
    id: 'chat-bubbles',
    route: '/chat',
    /**
     * 气泡族（M20-b）。清单只收"生成结束后仍然稳定可见、且 reload 后一模一样"的选择器。
     *
     * `.thinking-block` 进得来：思考内容随消息一起落 IndexedDB，打桩回片用
     * `delta.reasoning_content` 喂它（`openai-client.ts:572` 读 reasoning_content || reasoning）。
     *
     * `.cache-rate` 进不来，而且与 SSE 回片形状无关：它的显示条件是
     * `chatStore.prefixCacheHitRate !== null`，而 `cacheUsage` 是 store 里的内存 ref，
     * 下面每个目标采样前那句 `goto(t.route)` 是整页重载，一重载就归零。
     * 2026-10-13 用"非零 hit/miss 且放在 [DONE] 之前"的正确回片实测过，可见数仍是 0。
     * 它和 `.gen-text` 同属"生成中的那一刻"那一族，要护就得在不重载的页面生命周期里采。
     *
     * `.msg-narration` 在这次夹具下可见数恒为 0。把这些列进来，网就是在空转（M19-a 立的纪律）。
     *
     * 会话数据走真实链路造：打桩 chat completions 接口（`/mock` 前缀那条）返回 SSE，
     * 设置页建一个指向 /mock 的 API 配置，然后在 /chat 发一条消息。
     * 不用演示种子是因为它只在首帧物化、不落盘，任何一次离开 /chat 都会丢（实测过四条路径）。
     */
    prepare: seedConversation,
    /**
     * `.thinking-body` 是折叠态不渲染的（ThinkingBlock.vue:116 的 v-if），所以采样前先点一次
     * `.thinking-header` 把它召唤出来 —— 与 settings-about 那条 `open: '.account-login-btn'` 同一手法。
     * 展开只影响思考正文那一段的高度，气泡本体与头部样式不变，其余选择器的读数不受这次点击影响。
     */
    open: '.thinking-header',
    selectors: [
      '.chat-messages',
      '.msg-bubble',
      '.msg-bubble.msg-assistant',
      '.msg-bubble.msg-user',
      '.chat-composer',
      '.thinking-block',
      '.thinking-header',
      '.thinking-body',
      '.thinking-tokens',
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

/** OpenAI 兼容的 SSE 响应体，与 `chat-flow.spec.ts` 同一形状 */
const SSE_BODY =
  [
    // 首片带 reasoning_content：`.thinking-block` 只在消息有思考时才渲染（ThinkingBlock.vue:99），
    // 而思考随消息一起落 IndexedDB，所以它活得过下面 `goto(t.route)` 那次整页重载
    `data: ${JSON.stringify({
      choices: [{ delta: { role: 'assistant', content: '中性网', reasoning_content: '先想一步' }, finish_reason: null }],
    })}`,
    ...['气泡', '夹具', '回复'].map(
      (c) => `data: ${JSON.stringify({ choices: [{ delta: { role: 'assistant', content: c }, finish_reason: null }] })}`
    ),
    // usage 出现在 [DONE] 之前、且 hit+miss 必须大于 0，否则 `prefixCacheHitRate` 恒为 null
    // （chat-generation.ts:246 —— 全 0 与"没上报"在界面上是同一种表现）
    // reasoning_tokens 走官方字段 `completion_tokens_details`，它决定 `.thinking-tokens` 渲不渲染
    // （ThinkingBlock.vue:84 只认"正数"，0 和 undefined 一样不展示）
    `data: ${JSON.stringify({
      choices: [],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 20,
        total_tokens: 120,
        prompt_cache_hit_tokens: 60,
        prompt_cache_miss_tokens: 40,
        completion_tokens_details: { reasoning_tokens: 30 },
      },
    })}`,
  ].join('\n\n') + '\n\ndata: [DONE]\n';

/**
 * 造一条能活过导航的会话：打桩流式接口 → 建 API 配置 → 发一条消息 → **等它写进 IndexedDB**。
 *
 * 最后那一步不是保险，是必须：实测在写入落地前 reload，读回来的就是没有消息的旧快照
 * （同一个竞态在 E22 那条用例上红过一次）。等值，不等时间。
 */
/** 建一个指向 /mock 的 API 配置并激活：走真实 UI，已有就只激活（幂等） */
async function ensureMockProfile(page: Page): Promise<void> {
  // 角色库从空开始（2026-10-26）：对话区要有一个"收藏"角色，会话行与输入框才在
  await seedCharacter(page, { favorite: true });
  const port = process.env.E2E_PORT ?? '5173';
  await page.goto('/settings?cat=model');
  const profile = page.getByText('E2E 中性网夹具').first();
  if ((await profile.count()) === 0) {
    await page.getByRole('button', { name: '新增 API 配置' }).click();
    await page.locator('#p-name').fill('E2E 中性网夹具');
    await page.locator('#p-baseurl').fill(`http://localhost:${port}/mock`);
    await page.locator('#p-model').fill('gpt-4o');
    await page.locator('#p-apikey').fill('test-key');
    await page.getByRole('button', { name: '创建', exact: true }).click();
  }
  await profile.waitFor({ state: 'visible', timeout: 15_000 });
  const activate = page.getByRole('button', { name: '激活此 API 配置' });
  if (await activate.count()) await activate.first().click();
}

async function seedConversation(page: Page): Promise<void> {
  await page.route('**/mock/v1/chat/completions', (route) =>
    void route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      headers: { 'cache-control': 'no-cache', connection: 'keep-alive' },
      body: SSE_BODY,
    })
  );

  await ensureMockProfile(page);

  await page.goto('/chat');
  /**
   * 幂等：重生成基线那条用例是在**同一个页面里连着过 9 款皮肤**，本函数会被调用 9 次；
   * 每次都再发一条消息的话，助手气泡数就变成 2、3、…，断言与基线都不稳定
   * （实测 `toHaveCount(1)` 收到 2）。已经有助手气泡就直接复用，不再发。
   */
  if (await page.locator('.msg-bubble.msg-assistant').count() === 0) {
    const input = page.getByLabel('输入消息');
    await expect(input).toBeEnabled({ timeout: 15_000 });
    await input.fill('中性网气泡夹具：今晚酒馆开门吗');
    await page.getByRole('button', { name: '发送消息' }).click();
  }
  await expect(page.locator('.msg-bubble.msg-assistant').first()).toBeVisible({ timeout: 20_000 });

  // 等盘：chats 里那条会话的 messages 至少 2 条（用户 1 + 助手 1）才算夹具就绪
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            new Promise<number>((resolve) => {
              const req = indexedDB.open('ai-roleplay');
              req.onsuccess = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains('chats')) {
                  db.close();
                  resolve(-1);
                  return;
                }
                const all = db.transaction('chats', 'readonly').objectStore('chats').getAll();
                all.onsuccess = () => {
                  db.close();
                  const rows = (all.result ?? []) as Array<{ messages?: unknown[] }>;
                  resolve(Math.max(0, ...rows.map((r) => r.messages?.length ?? 0)));
                };
                all.onerror = () => {
                  db.close();
                  resolve(-2);
                };
              };
              req.onerror = () => resolve(-3);
            })
        ),
      { message: '夹具消息没写进 IndexedDB 的 chats store', timeout: 20_000, intervals: [300, 600, 1200] }
    )
    .toBeGreaterThanOrEqual(2);
}

/**
 * 切主题：走真实 UI（设置页主题卡），并等它**真的落盘**再返回（见 `theme-persistence.ts`）。
 * 不等这一步，下面 `goto(t.route)` 会让文档重新加载、回落到默认皮肤，
 * 整份基线就采成了另一套皮肤（实测 brutal 一条红 143 处，实得值全是 dark 的）。
 */
async function applyTheme(page: Page, theme: string): Promise<void> {
  // 采样目标是对话页的一族元素：没有角色时整片是空态，采样自然全空（2026-10-26）
  await seedCharacter(page, { favorite: true });
  await applyThemeAndWait(page, theme);
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

/**
 * 采两次直到一致才返回。
 *
 * 为什么必须有这一步：`.nav-item` 这类元素带 `transition: color .15s`，路由切换后
 * 主题过渡还在跑，单次采样会把**过渡中间帧**记进基线（实测第一版把侧栏激活项的
 * `color` 记成了 rgb(83, 86, 98) —— 那是 #AEB2C0 与 #161823 之间的一帧，
 * 既不是改前的值也不是改后的值，于是这条目标永远在测一个没人见过的状态）。
 * applyTheme 里那次轮询只盯 `html` 的 background-color，管不到子元素自己的过渡。
 */
async function collectStable(page: Page, selectors: readonly string[]): Promise<Record<string, ThemeSamples>> {
  let prev = await collect(page, selectors);
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(120);
    const next = await collect(page, selectors);
    if (JSON.stringify(prev) === JSON.stringify(next)) return next;
    prev = next;
  }
  throw new Error('连续 1.4s 内计算样式仍未静止：采到的会是过渡中间帧');
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
  /**
   * 准备步骤在**整轮采样之前**跑一次，不挂在单个目标上。
   * 挂在目标上实测会自相矛盾：seed 要建 API 配置，那是全局状态——重生成路径是
   * 同一个页面连着过 9 款皮肤，第 1 款主题的 chat-surface 采在"还没建 Profile"时
   * （`.model-badge` 是待处理的那档颜色），第 2 款起采在"已建"时（另一档颜色），
   * 基线里同一目标就有了两种真值。验证时每条用例是全新上下文，全部采在"未准备"态 ⇒ 红。
   */
  for (const t of TARGETS) if (t.prepare) await t.prepare(page);
  for (const t of TARGETS) {
    await page.goto(t.route);
    if (t.open) {
      const trigger = page.locator(t.open).first();
      await expect(trigger).toBeVisible();
      await trigger.click();
    }
    // 等到清单里**每个**选择器都有可见匹配再采：路由切换中间态、以及上面那个
    // open 点击后的 Vue 重渲染，都还没落地就采样会把"还没渲染"记进基线。
    // 轮询返回"缺哪些"而不是"缺几个"：只报个数的话，红了还得再跑一次去猜是谁
    // （2026-10-13 加 .cache-rate 时踩的就是这个——报"期望 7 实得 6"，三次试错才知道缺的是它）。
    await expect
      .poll(
        async () =>
          page.evaluate(
            (sels) => {
              const gone = sels.filter(
                (sel) => ![...document.querySelectorAll(sel)].some((e) => (e as HTMLElement).offsetParent !== null)
              );
              return gone.length === 0 ? '全部可见' : `缺 ${gone.length}/${sels.length}：${gone.join(' | ')}`;
            },
            [...t.selectors]
          ),
        { message: `${t.route} 在 ${theme} 下有选择器始终量不到可见元素`, timeout: 20_000 }
      )
      .toBe('全部可见');
    out[t.id] = await collectStable(page, t.selectors);
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
  expect(base.themes, '基线覆盖的皮肤要就是 THEME_PRESETS 这一组').toEqual([...THEMES]);
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
  test('重生成基线：每款皮肤 × 全部目标的计算样式（NEUTRALITY_UPDATE=1 专用）', async ({ page }) => {
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
    test(`像素中性网：「${theme}」主题下 ${TARGETS.length} 个目标的计算样式与基线一致`, async ({ page }) => {
      assertViewport(page);
      const base = loadBaseline();
      await applyTheme(page, theme);
      checkSample(await sampleTheme(page, theme), base, theme);
    });
  }
}

/**
 * 「生成中的那一刻」一族：`.cache-rate`（M20-b 续）
 *
 * 上面那张基线网采不到它，原因写在该目标的注释里：网每个目标采样前那句 `goto(t.route)` 是整页
 * 重载，而 `cacheUsage` 是 store 里的内存 ref（`chat-generation.ts:242`），一重载就归零。
 * 这条用例待在**同一次页面生命周期**里 —— 发完消息后靠侧栏做客户端路由跳转来切皮肤（不重载），
 * 徽标就一直亮着。切皮肤仍走真实 UI（设置页主题卡）并等落盘，只是不走 `page.goto`。
 *
 * 断言的不是快照，而是"这个元素的样式确实由皮肤槽位解析出来"：
 * - `color` 必须等于同一页里现搭的探针（`color: var(--green, #9ece6a)`）—— token 改名或写错当场红；
 * - `color` 必须不等于父级 `.chat-token`（`--muted-foreground`）—— 写错 token 的典型表现是
 *   "静默继承父色"，看着不像坏了，只比探针那条拦得住一半；
 * - 9 款皮肤的 `color` 至少出现 2 种不同值 —— 全一样说明它一直吃兜底色，压根没跟着皮肤走；
 * - `font-size` 必须等于根元素 `--font-size-2xs` 的解析值（这一条把"字面量 11px"换成 token 时不会松口，
 *   换成错档位当场红）。
 */
test('生成中的那一刻：不重载页面切完 9 款皮肤，命中率徽标一直在且样式由皮肤驱动', async ({ page }) => {
  assertViewport(page);
  await seedConversation(page);

  const rows: Array<{ theme: string; color: string; probeColor: string; parentColor: string; fontSize: string; rootToken: string }> = [];
  for (const theme of THEMES) {
    await page.locator('[data-rel-jump="nav-settings"]').click();
    await page.getByRole('tab', { name: '外观' }).click();
    const card = page.locator(`.theme-card[data-value="${theme}"]`);
    await expect(card).toBeVisible();
    await card.click();
    await waitForPersistedTheme(page, theme);

    await page.locator('[data-rel-jump="nav-chat"]').click();
    // 徽标还在 = 这条用例的前提（内存态没被重载打掉）成立；丢了就是链路退化，不是皮肤问题
    await expect(page.locator('.cache-rate'), `${theme}：切皮肤后 .cache-rate 不见了`).toBeVisible();

    const s = await page.evaluate(() => {
      const el = [...document.querySelectorAll('.cache-rate')].find(
        (e) => (e as HTMLElement).offsetParent !== null
      ) as HTMLElement;
      const probe = document.createElement('span');
      probe.style.color = 'var(--green, #9ece6a)';
      document.body.appendChild(probe);
      const probeColor = getComputedStyle(probe).color;
      probe.remove();
      return {
        color: getComputedStyle(el).color,
        probeColor,
        parentColor: getComputedStyle(el.closest('.chat-token') as HTMLElement).color,
        fontSize: getComputedStyle(el).fontSize,
        rootToken: getComputedStyle(document.documentElement).getPropertyValue('--font-size-2xs').trim(),
      };
    });
    rows.push({ theme, ...s });

    expect(s.color, `${theme}：.cache-rate 的 color 与 var(--green) 解析值不一致（token 名写错或被改名？）`).toBe(s.probeColor);
    expect(s.color, `${theme}：.cache-rate 的颜色等于父级 .chat-token ⇒ 它在静默继承父色`).not.toBe(s.parentColor);
    expect(s.fontSize, `${theme}：.cache-rate 的 font-size ${s.fontSize} 与 --font-size-2xs ${s.rootToken} 不一致`).toBe(s.rootToken);
  }

  const distinct = new Set(rows.map((r) => r.color));
  expect(
    distinct.size,
    `9 款皮肤只量出 ${distinct.size} 种颜色 ⇒ 这个徽标没跟着皮肤走（一直在吃兜底色）。逐条：\n${rows
      .map((r) => `${r.theme}: ${r.color}`)
      .join('\n')}`
  ).toBeGreaterThanOrEqual(2);
});

/**
 * 这一族只跑 3 款皮肤，而不是上面的 9 款：断言的是"这条声明引用的是哪个槽位"，
 * 槽位名写错在每一款皮肤下都会塌成继承色，3 款足够把它区分出来；
 * 而"同一配对在不同皮肤下会不会撞色"那种问题由 `npm run a11y:contrast` 静态扫，两处不重复铺。
 */
const STREAM_THEMES = ['dark', 'light', 'brutal'];

/**
 * 「正在生成的那一刻」一族：`.gen-text` / `.gen-dot`（M20-b 续）
 *
 * 难点是这些元素只在流式期间存在。抓住它的手法是量出来的，不是猜的：把打桩回话**延迟**住
 * （`route.fulfill` 之前 await 600ms），这段时间 `.gen-text` 连续可见——实测探针延迟 0ms 时
 * 还能看见 2 个 100ms 采样、延迟 300ms 时 4 个、900ms 时 10 个，所以 600ms 有充足余量。
 *
 * 同一个探针也量出一条边界：`.thinking-pulse` 抓不住。它要"思考内容已到"且"仍在生成"，
 * 而 fulfill 是全有或全无——回话没到整块 thinking 都不渲染，回话一到流立即关闭、
 * `generating` 落回 false。它的 6px 圆点因此仍不受换肤回归保护，作为边界登记在这里。
 */
test('正在生成的那一刻：抓住 .gen-text 与 .gen-dot，断言它们的样式由皮肤槽位解析', async ({ page }) => {
  assertViewport(page);
  await ensureMockProfile(page);

  // 只注册一次：多条 route 会按注册顺序反向匹配，循环里再注册会让上一轮的延迟句柄还在场上
  await page.route('**/mock/v1/chat/completions', (route) => {
    void (async () => {
      await new Promise((r) => setTimeout(r, 600));
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        headers: { 'cache-control': 'no-cache', connection: 'keep-alive' },
        body: SSE_BODY,
      });
    })();
  });

  const rows: Array<{ theme: string; color: string; probeColor: string }> = [];
  for (const theme of STREAM_THEMES) {
    await page.goto('/settings?cat=appearance');
    const card = page.locator(`.theme-card[data-value="${theme}"]`);
    await expect(card).toBeVisible();
    await card.click();
    await waitForPersistedTheme(page, theme);

    // 侧栏客户端跳转回 /chat：不重载文档，生成状态才不被打掉
    await page.locator('[data-rel-jump="nav-chat"]').click();
    const input = page.getByLabel('输入消息');
    await expect(input).toBeEnabled({ timeout: 15_000 });
    await input.fill(`这一刻：${theme}`);
    await page.getByRole('button', { name: '发送消息' }).click();

    await expect(page.locator('.gen-text'), `${theme}：没抓住"正在生成"的窗口`).toBeVisible({ timeout: 8_000 });

    const s = await page.evaluate(() => {
      const visible = (sel: string) =>
        [...document.querySelectorAll(sel)].find((e) => (e as HTMLElement).offsetParent !== null) as HTMLElement;
      const textEl = visible('.gen-text');
      const dotEl = visible('.gen-dot');
      const probe = document.createElement('span');
      probe.style.color = 'var(--secondary-text)';
      document.body.appendChild(probe);
      const probeColor = getComputedStyle(probe).color;
      probe.remove();
      const root = getComputedStyle(document.documentElement);
      const px = (v: string) => v.trim();
      return {
        color: getComputedStyle(textEl).color,
        probeColor,
        parentColor: getComputedStyle(textEl.parentElement as HTMLElement).color,
        fontSize: getComputedStyle(textEl).fontSize,
        tokenFontSize: px(root.getPropertyValue('--font-size-xs')),
        rowGap: getComputedStyle(dotEl).rowGap,
        tokenGap: px(root.getPropertyValue('--space-1-5')),
        marginTop: getComputedStyle(dotEl).marginTop,
        tokenMargin: px(root.getPropertyValue('--space-2-5')),
      };
    });
    rows.push({ theme, color: s.color, probeColor: s.probeColor });

    expect(s.color, `${theme}：.gen-text 的 color 与 var(--secondary-text) 解析值不一致`).toBe(s.probeColor);
    expect(s.color, `${theme}：.gen-text 继承了父级颜色 ⇒ 它的槽位引用没生效`).not.toBe(s.parentColor);
    expect(s.fontSize, `${theme}：.gen-text 的 font-size ${s.fontSize} 与 --font-size-xs ${s.tokenFontSize} 不一致`).toBe(s.tokenFontSize);
    expect(s.rowGap, `${theme}：.gen-dot 的 gap ${s.rowGap} 与 --space-1-5 ${s.tokenGap} 不一致`).toBe(s.tokenGap);
    expect(s.marginTop, `${theme}：.gen-dot 的 margin-top ${s.marginTop} 与 --space-2-5 ${s.tokenMargin} 不一致`).toBe(s.tokenMargin);

    // 等这一轮流结束再切下一款皮肤，避免上一轮的"生成中"元素混进下一次采样
    await expect(page.locator('.gen-text'), `${theme}：这一轮生成没收尾`).toHaveCount(0, { timeout: 20_000 });
  }

  expect(
    new Set(rows.map((r) => r.color)).size,
    `3 款皮肤下 .gen-text 只有 1 种颜色 ⇒ 它没跟着皮肤走：\n${rows.map((r) => `${r.theme}: ${r.color}`).join('\n')}`
  ).toBeGreaterThanOrEqual(2);
  // 判据是"至少 2 种"，不是"3 款各不同"：两款皮肤的 --secondary-text 撞值是合法设计，
  // 要求互不相同会假红。这条断言要拦的是"恒等于同一个值"（那就是没跟着皮肤走）。
});

/** 与 SSE_BODY 同形但不带 usage 分片：供应商不报缓存字段时走的是本地代理指标那条岔路 */
const SSE_BODY_NO_USAGE = ['稳定率', '夹具', '回复']
  .map((c) => `data: ${JSON.stringify({ choices: [{ delta: { role: 'assistant', content: c }, finish_reason: null }] })}`)
  .join('\n\n') + '\n\ndata: [DONE]\n';

/**
 * 「供应商不报缓存字段」那一支：`.cache-rate.local`（M20-b 续）
 *
 * 这是 `ChatMain.vue:779` 那条 `v-else-if`，条件比另一个徽标更刁：
 * `prefixCacheHitRate === null`（没人报缓存）**且** `prefixStableRate !== null`。
 * 而 `prefixStability.total` 只在**第二次及以后**的请求上才加（`chat-generation.ts:297` 那句
 * `if (prev.lastPrefix !== '')`），所以第一轮发送后界面上什么都不会出现。
 * 两个条件都锁住：先验"第一轮没有徽标"，再验"第二轮有"。只验后者会放过
 * "把 total 提前到第一轮就加"这种改动 —— 那会让稳定率显示成 0/1 的假数字。
 *
 * 取色链也顺手记在这里：`.cache-rate.local` 用的是 `var(--cyan, #7dcfff)`，而 `--cyan`
 * 是 `tokens.css:250` 对 `--secondary` 的别名 —— 它跟着皮肤走是因为那条别名链，
 * 一旦有人把别名拆掉，界面上就变成恒定的兜底青蓝。探针与"至少 2 种"两条断言就是拦这个的。
 */
test('供应商不报缓存字段：本地稳定率徽标在第二轮出现，且取色仍走皮肤槽位', async ({ page }) => {
  assertViewport(page);
  await ensureMockProfile(page);
  await page.route('**/mock/v1/chat/completions', (route) =>
    void route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      headers: { 'cache-control': 'no-cache', connection: 'keep-alive' },
      body: SSE_BODY_NO_USAGE,
    })
  );

  await page.goto('/chat');
  const input = page.getByLabel('输入消息');
  await expect(input).toBeEnabled({ timeout: 15_000 });

  /** 发一条并等到助手气泡数变成 `after`（新开的库里没有历史消息，条数是确定的） */
  const send = async (text: string, after: number) => {
    await input.fill(text);
    await page.getByRole('button', { name: '发送消息' }).click();
    await expect(page.locator('.msg-bubble.msg-assistant')).toHaveCount(after, { timeout: 20_000 });
  };

  await send('稳定率夹具：第一轮', 1);
  await expect(page.locator('.cache-rate')).toHaveCount(0);
  // 这一条是"状态机"的一半：第一轮 total 还是 0，两个徽标都不该出现
  await expect(page.locator('.cache-rate.local')).toHaveCount(0);

  await send('稳定率夹具：第二轮', 2);
  await expect(page.locator('.cache-rate.local'), '第二轮仍没出现本地稳定率徽标').toBeVisible();

  const rows: Array<{ theme: string; color: string }> = [];
  for (const theme of STREAM_THEMES) {
    // 这里不能 page.goto：稳定率的累计是内存态，整页重载会清零（上面 .cache-rate 那条同一手法）
    await page.locator('[data-rel-jump="nav-settings"]').click();
    await page.getByRole('tab', { name: '外观' }).click();
    const card = page.locator(`.theme-card[data-value="${theme}"]`);
    await expect(card).toBeVisible();
    await card.click();
    await waitForPersistedTheme(page, theme);
    await page.locator('[data-rel-jump="nav-chat"]').click();
    await expect(page.locator('.cache-rate.local'), `${theme}：切皮肤后稳定率徽标不见了`).toBeVisible();

    const s = await page.evaluate(() => {
      const el = [...document.querySelectorAll('.cache-rate.local')].find(
        (e) => (e as HTMLElement).offsetParent !== null
      ) as HTMLElement;
      const probe = document.createElement('span');
      probe.style.color = 'var(--cyan, #7dcfff)';
      document.body.appendChild(probe);
      const probeColor = getComputedStyle(probe).color;
      probe.remove();
      return {
        color: getComputedStyle(el).color,
        probeColor,
        parentColor: getComputedStyle(el.closest('.chat-token') as HTMLElement).color,
      };
    });
    rows.push({ theme, color: s.color });
    expect(s.color, `${theme}：.cache-rate.local 的 color 与 var(--cyan) 解析值不一致`).toBe(s.probeColor);
    expect(s.color, `${theme}：.cache-rate.local 继承了父级颜色 ⇒ 别名链断了`).not.toBe(s.parentColor);
  }

  expect(
    new Set(rows.map((r) => r.color)).size,
    `3 款皮肤下稳定率徽标只有 1 种颜色 ⇒ 它没跟着皮肤走：\n${rows.map((r) => `${r.theme}: ${r.color}`).join('\n')}`
  ).toBeGreaterThanOrEqual(2);
});
