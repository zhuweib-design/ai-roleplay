import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E 配置 (E2E)
 *
 * - 本地（Windows）：复用系统 Edge（channel: 'msedge'），免下载浏览器
 * - CI（ubuntu-latest）：使用 Playwright 自带 chromium（无 channel，需先
 *   `npx playwright install --with-deps chromium`）；Linux 无系统 Edge，
 *   原写死的 channel: 'msedge' 会导致找不到浏览器而整体失败
 * - 端口可通过 E2E_PORT 覆盖，避免与本地其他 dev server（如占用 5173 的进程）冲突
 */
const isCI = !!process.env.CI;
const port = process.env.E2E_PORT ?? '5173';
const baseURL = `http://localhost:${port}`;

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
    // 预置新手引导完成标志，跳过 OnboardingModal 遮挡（值须为 '1'，见 src/utils/onboarding.ts）
    // 多 origin 覆盖 CI(5173) 与本地验证(E2E_PORT=5174) 两种端口；不修改任何 spec
    storageState: './e2e/storage-state.json',
  },
  projects: [
    {
      name: isCI ? 'chromium' : 'msedge',
      use: isCI
        ? { ...devices['Desktop Chrome'] }
        : { ...devices['Desktop Chrome'], channel: 'msedge' },
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
