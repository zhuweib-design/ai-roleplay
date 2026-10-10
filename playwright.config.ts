import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E 配置 (E2E)
 *
 * - 本地（Windows）：复用系统 Edge（channel: 'msedge'），免下载浏览器
 * - CI（ubuntu-latest）：使用 Playwright 自带 chromium（无 channel，需先
 *   `npx playwright install --with-deps chromium`）；Linux 无系统 Edge，
 *   原写死的 channel: 'msedge' 会导致找不到浏览器而整体失败
 * - 端口可通过 E2E_PORT 覆盖，避免与本地其他 dev server（如占用 5173 的进程）冲突
 * - 默认不复用已有 dev server，避免测试误连到其他项目；需要复用时显式设置
 *   E2E_REUSE_SERVER=1
 * - projects：桌面（Desktop Chrome）+ 移动视口（Pixel 5）。移动 project 用 testMatch
 *   限定到 e2e/mobile/，桌面 project 用 testIgnore 排除该目录，两者互不重叠。
 */
const isCI = !!process.env.CI;
const port = process.env.E2E_PORT ?? '5173';
const baseURL = `http://localhost:${port}`;
const reuseExistingServer = process.env.E2E_REUSE_SERVER === '1';
const storageState = {
  cookies: [],
  origins: [{
    origin: baseURL,
    localStorage: [{ name: 'ai-roleplay:onboarding-done', value: '1' }],
  }],
};

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  /**
   * 本地并发上限：4，不用 Playwright 默认的"核数 / 2"（这台 16 核机器上就是 8）。
   *
   * 默认并发下全量跑**随机红 1–3 条**，失败点每次不同（实测 `ux-event-trace`、
   * `contrast-axe`、`group-chat-flow` 轮流中），而这三条单跑全绿——红相是负载不是回归。
   * 机制：三条都是"多轮打桩 SSE + IndexedDB 造数"的长用例，30s 预算里光是 vite dev
   * 的冷模块图 + 8 个浏览器就能吃掉一半以上，最后一轮回复的 15s 断言于是踩在总超时上。
   * 同一台机器实测：8 workers → msedge 72/73、webkit 25–26/28；4 workers → 两条 project
   * 全绿（msedge 73/73 用时 1.3m、webkit 28/28 用时 45–59s），比 8 workers 还快。
   */
  workers: isCI ? 1 : 4,
  reporter: isCI ? [['github', {}], ['html', { open: 'never' }]] : 'list',
  /**
   * 单条用例预算 60s（原 30s → 45s → 60s，两次都是因为套件变长而重标的）。
   *
   * 30s 对"多轮打桩 SSE + IndexedDB 造数"那几条是紧的：4 workers 全绿的一轮里最慢的
   * `group-chat-flow` 用掉 18.8s，8 workers 的另一轮里 `ux-event-manual-trace` 跑到
   * 25.0s 后撞在总超时上（红相是"最后一轮回复没出现"，不是断言不符）。
   *
   * M10 把用例从 139 条加到 191 条之后，45s 的余量只剩 1.1 倍：同一台机器上
   * E11 那条**单跑只要 14.2s**，全量并发下却要 40.6s —— 慢是并发争抢，不是用例变胖。
   * 60s = 实测并发最差值的 1.5 倍、单跑最差值的 4.2 倍。`contrast-axe` 自己
   * `setTimeout(90_000)`，不受影响。
   */
  timeout: 60_000,
  use: {
    baseURL,
    trace: 'on-first-retry',
    // 固定浏览器语言为 zh-CN：P2-3 起应用会按 navigator.language 兜底首访语言，
    // 而 Playwright 默认 locale 为 en-US，不固定会让界面渲染成英文、
    // 与既有用例的中文断言（按钮名/标签）全部不匹配。
    // 语言检测本身由 tests/i18n.test.ts 与 tests/stores/settings.test.ts 覆盖。
    locale: 'zh-CN',
    // 按当前 baseURL 动态预置新手引导完成标志，避免 E2E_PORT 改变后回退到 OnboardingModal。
    // 值须为 '1'，见 src/utils/onboarding.ts；不修改任何 spec。
    storageState,
  },
  projects: [
    {
      name: isCI ? 'chromium' : 'msedge',
      // 桌面用例：排除 mobile/ 子目录（由下方移动 project 承接）
      testIgnore: '**/mobile/**',
      use: isCI
        ? { ...devices['Desktop Chrome'] }
        : { ...devices['Desktop Chrome'], channel: 'msedge' },
    },
    {
      // WebKit（Safari 近似内核）：桌面核心功能回归。
      // 覆盖 Chromium 之外的第二个内核，重点暴露 iOS/Safari 的样式与交互差异。
      // 本地需先 `npx playwright install webkit`；CI 由 workflow 安装。
      name: 'webkit',
      testMatch: [
        '**/chat-flow.spec.ts',
        '**/group-chat-flow.spec.ts',
        '**/character-batch-import.spec.ts',
        '**/character-crud.spec.ts',
        '**/backup-restore.spec.ts',
        '**/worldbook-flow.spec.ts',
        // M2-b3：注入痕迹链路同时含 IndexedDB 造数与 SSE 流式，Safari 内核需另有一次实测
        '**/ux-prompt-trace.spec.ts',
        // M6-d：E11 与上面同一条链路形状（IndexedDB 造数 + 按请求分流的打桩 + 流式回复），
        // 且多一处依赖 Safari 的写法：客户端跳转保内存态事件表 + IndexedDB 快照轮询
        '**/ux-event-trace.spec.ts',
        // M6-f：世界书事件面板逐字段编辑 + 同轮关键词触发注入，Safari 内核同样要实测一次
        '**/ux-event-manual-trace.spec.ts',
        // M7-c：断言的是"计算后的颜色归属"，而 scoped CSS 的选择器特异性正是
        // 各内核差异最容易显形的地方，Safari 必须实测一次
        '**/ux-status-color.spec.ts',
        // M8-a：量的是"滚动容器在网格块方向塌成 34px 行轨"造成的重叠，
        // 块方向 intrinsic sizing 各内核差异最大，Safari 必须实测一次
        '**/ux-narrow-editor-preview.spec.ts',
        // M2-b9：滑块渐变/按压着色都靠 color-mix 与新式渐变分段，Safari 内核必须实测一次
        '**/ux-interaction-feedback.spec.ts',
        // M8-c：用例按可访问名定位对话框（getByRole('dialog', { name })），而对话框的
        // 可访问名由各内核自己算；同一个按钮在页面上还有另外两处同名「取消」，
        // 名字算错就会点偏。Safari 必须实测一次
        '**/ux-modal-describedby.spec.ts',
        // M9-d：同一套断言铺到 10 个弹窗，其中群聊向导、设置页折叠段展开在 Safari 下最容易点偏
        '**/ux-modal-describedby-more.spec.ts',
        // M10-a：这三条靠写 IndexedDB 造数才看得到，Safari 的 IDB 时序与 Chromium 不同，
        // 造数是否赶得上应用开库必须在内核上实测一次
        '**/ux-modal-describedby-seeded.spec.ts',
        // M10-b：审计的判定基础是"可见性 + 可访问名"，两者都靠几何与 accname 计算，
        // 正是各内核差异最容易显形的地方；且负向对照要在两个内核上都证明它不是空转
        '**/ux-duplicate-a11y-names.spec.ts',
      ],
      testIgnore: '**/mobile/**',
      use: { ...devices['Desktop Safari'] },
      // WebKit 冷启动与 IndexedDB 明显慢于 Chromium；与其它 project 并行时会因负载
      // 出现「每次失败点不同」的假失败，故该 project 串行执行（用例数少，成本可接受）。
      fullyParallel: false,
    },
    {
      // 移动视口功能回归：把核心用户旅程的桌面用例放到 Pixel 5 视口下重跑，
      // 补齐「手机端全功能」验证。仅纳入无视觉基线快照的功能用例；
      // 对比度与视觉快照用例仍在桌面 project 执行，避免视口差异造成误判。
      name: isCI ? 'mobile-functional-chromium' : 'mobile-functional-msedge',
      testMatch: [
        '**/chat-flow.spec.ts',
        '**/group-chat-flow.spec.ts',
        '**/character-batch-import.spec.ts',
        '**/character-crud.spec.ts',
        '**/backup-restore.spec.ts',
        '**/worldbook-flow.spec.ts',
      ],
      testIgnore: '**/mobile/**',
      use: isCI
        ? { ...devices['Pixel 5'] }
        : { ...devices['Pixel 5'], channel: 'msedge' },
    },
    {
      // 移动视口（P1-6）：Pixel 5 = 393×851 / DPR 2.75 / isMobile / hasTouch
      // 仅跑 e2e/mobile/ 下的用例 —— 桌面用例在该视口下无视觉基线快照，不重复执行
      // 补齐此前零覆盖的移动端专属行为：底部导航显隐、抽屉遮罩层级、640 边界布局
      name: isCI ? 'mobile-chromium' : 'mobile-msedge',
      testMatch: '**/mobile/**/*.spec.ts',
      use: isCI
        ? { ...devices['Pixel 5'] }
        : { ...devices['Pixel 5'], channel: 'msedge' },
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer,
    timeout: 60_000,
  },
});
