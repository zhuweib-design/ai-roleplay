/**
 * 原生壳不再带 Service Worker（OPT_PLAN 真机发现一）
 *
 * 现场：覆盖安装新 APK 后，页面仍加载旧哈希的 JS（旧包 index-BqRCuyp6.js
 * vs 新包 index-OB1SZaI5.js），因为 workbox precache 把 index.html 兜回旧缓存。
 * 根因修法 = 构建期关掉 SW（原生资源本来就随包分发）；本模块只负责把
 * 已装旧版的设备一次性救回来。
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { purgeStaleServiceWorker } from '@/core/native-sw-cleanup';

const SRC = path.resolve(__dirname, '../..');

function stubServiceWorker(registrations: Array<{ unregister: () => Promise<boolean> }>) {
  Object.defineProperty(navigator, 'serviceWorker', {
    value: { getRegistrations: async () => registrations },
    configurable: true,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  // @ts-expect-error 清理测试替身
  delete navigator.serviceWorker;
});

describe('purgeStaleServiceWorker', () => {
  it('没有旧注册 ⇒ 什么都不做，也不重载', async () => {
    stubServiceWorker([]);
    const reload = vi.fn();
    vi.stubGlobal('location', { reload });
    expect(await purgeStaleServiceWorker()).toBe(false);
    expect(reload).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('有旧注册 ⇒ 逐个注销、清 CacheStorage、整页重载一次', async () => {
    const a = { unregister: vi.fn().mockResolvedValue(true) };
    const b = { unregister: vi.fn().mockResolvedValue(true) };
    stubServiceWorker([a, b]);
    const cacheDelete = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('caches', { keys: async () => ['workbox-precache-v2-https://localhost/'], delete: cacheDelete });
    const reload = vi.fn();
    vi.stubGlobal('location', { reload });

    expect(await purgeStaleServiceWorker()).toBe(true);
    expect(a.unregister).toHaveBeenCalledTimes(1);
    expect(b.unregister).toHaveBeenCalledTimes(1);
    expect(cacheDelete).toHaveBeenCalledWith('workbox-precache-v2-https://localhost/');
    expect(reload).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('负向对照：getRegistrations 抛错时不能把应用卡在启动路径上', async () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { getRegistrations: async () => { throw new Error('boom'); } },
      configurable: true,
    });
    const reload = vi.fn();
    vi.stubGlobal('location', { reload });
    expect(await purgeStaleServiceWorker()).toBe(false);
    expect(reload).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe('构建期开关（防止回到"运行时注销"的死循环）', () => {
  it('vite.config 必须把 VitePWA 的 disable 绑到原生壳标记上', () => {
    const src = fs.readFileSync(path.join(SRC, 'vite.config.ts'), 'utf8');
    expect(src).toMatch(/disable:\s*isNativeShellEnv/);
    expect(src).toMatch(/NATIVE_SHELL/);
  });

  it('出包脚本必须在跑 vite 构建时带上 NATIVE_SHELL', () => {
    const src = fs.readFileSync(path.join(SRC, 'scripts/android-apk.mjs'), 'utf8');
    expect(src).toMatch(/NATIVE_SHELL:\s*'1'/);
  });

  it('main.ts 必须只在原生壳里调清理（Web 端不能把 PWA 的 SW 拆了）', () => {
    const src = fs.readFileSync(path.join(SRC, 'src/main.ts'), 'utf8');
    expect(src).toMatch(/if\s*\(__NATIVE_SHELL__\)\s*void\s+purgeStaleServiceWorker\(\)/);
  });
});
