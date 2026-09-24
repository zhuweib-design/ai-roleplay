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
  workers: isCI ? 1 : undefined,
  reporter: isCI ? [['github', {}], ['html', { open: 'never' }]] : 'list',
  timeout: 30_000,
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
