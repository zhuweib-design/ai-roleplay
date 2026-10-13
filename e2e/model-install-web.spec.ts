/**
 * E2E · 非 Tauri 环境（浏览器 / PWA / 以后 APK 的 WebView）下的本地向量模型安装
 *
 * 要防的事故：`src/core/model-fs-ipc.ts` 里全是 `invoke('pick_model_dir' …)` 这类
 * Rust 命令，在浏览器里调用必然抛错。所以环境判定必须挡住它，Web 侧走
 * `<input webkitdirectory>` → IndexedDB 这条降级路径。
 *
 * 三条断言分开写，因为它们会各自单独坏：
 * 1. 「不抛错」——页面加载与点击全程 0 条未捕获异常（pageerror 计数）。
 * 2. 「真的装上」——文件确实落到 IndexedDB 的 `ai-roleplay-models`/`files`，
 *    且已安装列表里看得见它。只测第 1 条会放过"降级分支没跑到"（没报错和没跑到是两回事）。
 * 3. 「没去碰 Rust」——整页没有加载过 `@tauri-apps/api/*`。第 1 条拦不住走错分支：
 *    组件外层有 try/catch，`invoke` 抛出来的错会被吞成一条"安装失败"toast。
 *
 * 只跑桌面 project（与 token-neutrality 同一口径，Chromium 系才有 webkitdirectory）。
 */
import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const MODEL_ID = 'bge-small-zh-v1.5';
const DB_NAME = 'ai-roleplay-models';
const STORE = 'files';

/** 在页面里读 IndexedDB 的键清单（读存储本体，不靠 toast 猜） */
async function readModelKeys(page: Page): Promise<string[]> {
  return page.evaluate(
    async ({ db, store }) => {
      const conn = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(db, 2);
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains(store)) req.result.createObjectStore(store);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const keys = await new Promise<string[]>((resolve, reject) => {
        const tx = conn.transaction(store, 'readonly');
        const req = tx.objectStore(store).getAllKeys();
        req.onsuccess = () => resolve((req.result as IDBValidKey[]).map(String));
        req.onerror = () => reject(req.error);
      });
      conn.close();
      return keys;
    },
    { db: DB_NAME, store: STORE },
  );
}

/** 收集整页生命周期的未捕获异常与 console.error */
function watchErrors(page: Page): { pageErrors: string[]; consoleErrors: string[] } {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  return { pageErrors, consoleErrors };
}

/**
 * 收集加载过的 Tauri API 模块。
 *
 * `model-fs-ipc.ts` 里的 `await import('@tauri-apps/api/core')` 一旦被非 Tauri 环境执行到，
 * 浏览器就会为它发一次真实请求 —— 这比"有没有报错"可靠：组件外层有 try/catch，
 * 走错分支也只会被吞成一条 toast，页面异常计数仍是 0。
 */
function watchTauriLoads(page: Page): string[] {
  const loaded: string[] = [];
  page.on('request', (req) => {
    if (req.url().includes('@tauri-apps')) loaded.push(req.url());
  });
  return loaded;
}

test.describe('浏览器环境的本地向量模型安装', () => {
  test('检索面板在无 __TAURI_INTERNALS__ 的环境下可达，且 Tauri 专属入口不出现', async ({ page }) => {
    const errs = watchErrors(page);
    const tauriLoads = watchTauriLoads(page);
    await page.goto('/settings?cat=retrieval');
    // App.vue:331 在 onMounted 全部 await 结束后才置位；冷启动走 vite 现编译，5s 的 expect 默认预算不够
    await page.waitForSelector('html[data-app-ready="1"]', { state: 'attached', timeout: 30_000 });

    const tauriInternals = await page.evaluate(() => '__TAURI_INTERNALS__' in window);
    expect(tauriInternals).toBe(false);

    // Web 降级入口在
    await expect(page.getByRole('button', { name: '选择模型文件夹' })).toBeVisible();
    // Tauri 专属入口不在：少了这条，"浏览器里点了 native 对话框按钮"就没人拦
    await expect(page.getByRole('button', { name: '选择目录' })).toHaveCount(0);
    // 面板挂载路径（refreshInstalled / userStore.load / refreshScanned）不得触达 Rust 命令
    expect(tauriLoads).toEqual([]);

    expect(errs.pageErrors).toEqual([]);
  });

  test('点「选择模型文件夹」选中的文件真的进 IndexedDB 并出现在已安装列表', async ({ page }) => {
    const errs = watchErrors(page);
    const tauriLoads = watchTauriLoads(page);
    await page.goto('/settings?cat=retrieval');
    await page.waitForSelector('html[data-app-ready="1"]', { state: 'attached', timeout: 30_000 });

    // [webkitdirectory] 输入只接受真实目录路径（Playwright 会拒绝内存里的文件对象），
    // 所以夹具写在用例输出目录里，不进仓库
    const fixtureDir = test.info().outputPath('model-fixture');
    fs.mkdirSync(fixtureDir, { recursive: true });
    fs.writeFileSync(path.join(fixtureDir, 'model.onnx'), Buffer.from('onnx-bytes'));
    fs.writeFileSync(path.join(fixtureDir, 'config.json'), '{"dim":512}');

    const chooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: '选择模型文件夹' }).click();
    const chooser = await chooserPromise;
    await chooser.setFiles(fixtureDir);

    await expect(
      page.locator('.install-box').getByText(`已复制 2 个文件(IndexedDB)`),
    ).toBeVisible();
    await expect
      .poll(async () => (await readModelKeys(page)).includes(`model/${MODEL_ID}/model.onnx`))
      .toBe(true);
    // 已安装列表要看得见这个模型 —— 看不见说明列表刷新和数据写入 Race 了
    await expect(page.locator('.installed-item').filter({ hasText: MODEL_ID })).toBeVisible();

    // 点击路径本身：走的是 Web 降级，不是 native 对话框
    expect(tauriLoads).toEqual([]);
    expect(errs.pageErrors).toEqual([]);
  });
});
