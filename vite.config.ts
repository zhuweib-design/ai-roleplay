/// <reference types="vitest" />
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * 构建期版本号。设置→关于要显示它，而浏览器运行时拿不到 package.json，
 * 所以和 `__NATIVE_SHELL__` 一样在编译期注入。
 *
 * 2026-10-16 的教训：那一行原本写的是 `appVersion || '—'` 而 `appVersion` 从未被赋值，
 * 于是所有平台恒显示"版本：—"，文档还写着"读的是运行时值"。现在由
 * `tests/components/settings-about-version.test.ts` 同时盯住渲染值与两个配置的 define。
 */
const APP_VERSION = (
  JSON.parse(readFileSync(resolve(import.meta.dirname, 'package.json'), 'utf8')) as { version: string }
).version;

// Tauri 集成：检测 TAURI_ENV 环境变量决定开发服务器配置
// npm run tauri:dev 会自动设置 TAURI_ENV=1
const isTauriEnv = process.env.TAURI_ENV !== undefined;
const isTauriDev = process.env.TAURI_ENV === 'dev';

/**
 * 原生壳（Capacitor 安卓包）构建标记：由 scripts/android-apk.mjs 在跑 vite 时设置。
 *
 * 为什么原生壳必须关掉 Service Worker：APK 覆盖安装后，WebView 里那个
 * workbox precache 还在拿旧包，用户看到的仍是旧界面（2026-10-15 真机实测：
 * 页面加载 index-BqRCuyp6.js 而新 APK 里是 index-OB1SZaI5.js）。
 * 资源本来就随 APK 一起分发、由安装版本管控，SW 在这一端只有这个副作用。
 * 与 Tauri 同源，所以走同一个 disable 开关。
 */
const isNativeShellEnv = isTauriEnv || process.env.NATIVE_SHELL !== undefined;

// ── 本地模型代理（第10条：本地/内网 API 被 CORS 拦截）──
// 开发模式下，OpenAIClient 会将跨域本地/内网地址改写为 /llm-proxy/{encodeURIComponent(url)}，
// 本中间件解码目标地址并代理转发（SSE 流式透传），从而绕过浏览器 CORS 限制。
const LLM_PROXY_PREFIX = '/llm-proxy/';
const FORWARD_HEADERS = ['content-type', 'authorization', 'accept'] as const;

/**
 * P3-2：判断目标是否为本地/回环/私网地址
 * 代理仅服务本地模型（Ollama/LM Studio 等），禁止代理公网任意 URL
 */
function isLocalTarget(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol !== 'http:' && protocol !== 'https:') return false;
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname === '[::1]'
    ) {
      return true;
    }
    const m = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (m) {
      const a = Number(m[1]);
      const b = Number(m[2]);
      return (
        a === 10 ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168)
      );
    }
  } catch {
    // 非法 URL 直接拒绝
  }
  return false;
}

function localProxyPlugin(): Plugin {
  return {
    name: 'llm-local-proxy',
    configureServer(server) {
      server.middlewares.use(LLM_PROXY_PREFIX, (req, res) => {
        void handleLocalProxy(req, res);
      });
    },
  };
}

// ── Web 端 CSP（Web SOP 评审 P0-2）──
// 此前仓库唯一的 CSP 定义在 src-tauri/tauri.conf.json（**桌面端**），Web 端完全没有，
// 导致 Web 端 XSS 只有 DOMPurify 一层防线，无纵深防御。
//
// 注入策略：仅「生产构建 + 非 Tauri」时向 index.html 注入 CSP meta。
// - Tauri 构建不注入：桌面端 CSP 由 tauri.conf.json 统一管控，此处注入会与之叠加
// - dev 不注入（apply: 'build'）：HMR 需要内联脚本与 ws 连接，注入会直接打断开发
//
// 允许清单的每一条都对应实际能力需求（勿随意收紧）：
// - 'wasm-unsafe-eval'：onnxruntime-web / WebLLM 需编译 WebAssembly
// - worker-src blob:：onnxruntime-web 的多线程/proxy worker 由 blob URL 创建
// - style-src 'unsafe-inline'：Vue 运行时样式注入与内联 style 属性
// - fonts.googleapis.com / fonts.gstatic.com：现有外链字体（P2-2 建议后续自托管以去掉该放行）
// - connect-src https:：用户自定义模型端点（https）与本地模型下载
//
// 已知限制：frame-ancestors / report-uri / sandbox 在 meta 形式下会被浏览器**忽略**，
// 如需这三项必须在托管侧配置响应头（见 README「Web 端已知限制」）。
export const WEB_CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self' blob:",
  // 字体已本地镜像到 public/fonts/（scripts/vendor-fonts.mjs），故不再放行
  // fonts.googleapis.com / fonts.gstatic.com —— 消除第三方字体请求带来的 IP/Referer 泄漏
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob:",
  "connect-src 'self' https:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-src 'none'",
] as const;

export const WEB_CSP_CONTENT = WEB_CSP_DIRECTIVES.join('; ');

function webCspPlugin(): Plugin {
  return {
    name: 'web-csp',
    apply: 'build',
    transformIndexHtml(html) {
      // 桌面端不注入（CSP 由 tauri.conf.json 定义）
      if (isTauriEnv) return html;
      return {
        html,
        tags: [
          {
            tag: 'meta',
            attrs: { 'http-equiv': 'Content-Security-Policy', content: WEB_CSP_CONTENT },
            injectTo: 'head-prepend',
          },
        ],
      };
    },
  };
}

async function handleLocalProxy(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    // connect 的 use(prefix, fn) 会剥掉挂载前缀并保留前导斜杠，此处兼容两种形态
    const raw = req.url ?? '';
    const encoded = raw.startsWith(LLM_PROXY_PREFIX) ? raw.slice(LLM_PROXY_PREFIX.length) : raw;
    const target = decodeURIComponent(encoded).replace(/^\//, '');

    // P3-2 安全：代理仅放行本地/回环/私网地址（该代理专为本地模型设计），
    // 防止 dev server 被局域网设备当作任意出站代理（SSRF）
    if (!isLocalTarget(target)) {
      res.writeHead(403, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { message: '代理仅允许访问本地/回环/私网地址' } }));
      return;
    }

    // 收集请求体（chat completions 为小体积 JSON）
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const headers: Record<string, string> = {};
    for (const key of FORWARD_HEADERS) {
      const v = req.headers[key];
      if (typeof v === 'string') headers[key] = v;
    }
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body: chunks.length ? Buffer.concat(chunks) : undefined,
    });
    const upstreamHeaders: Record<string, string> = {};
    upstream.headers.forEach((value, key) => {
      // 剔除 hop-by-hop 头，交由本服务器管理
      if (/^(connection|transfer-encoding|keep-alive|upgrade|content-length)$/i.test(key)) return;
      upstreamHeaders[key] = value;
    });
    res.writeHead(upstream.status, {
      ...upstreamHeaders,
      'access-control-allow-origin': '*',
    });
    // 流式透传（SSE 增量直接转发，不缓冲）
    if (upstream.body) {
      const reader = upstream.body.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(Buffer.from(value));
        }
      } finally {
        reader.releaseLock();
      }
    }
    res.end();
  } catch (err) {
    console.error('[llm-proxy]', err);
    res.writeHead(502, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        error: { message: `本地代理转发失败：${err instanceof Error ? err.message : String(err)}` },
      })
    );
  }
}

export default defineConfig({
  plugins: [
    vue(),
    localProxyPlugin(),
    // Web 端 CSP（仅生产构建 + 非 Tauri，见上方 webCspPlugin 注释）
    webCspPlugin(),
    // PWA(手机端可安装):仅纯 Web 构建启用;Tauri(file://)与 Capacitor 原生壳都禁用 SW
    VitePWA({
      disable: isNativeShellEnv,
      registerType: 'autoUpdate',
      includeAssets: ['pwa-icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'AI 酒馆',
        short_name: 'AI酒馆',
        description: 'AI 角色扮演与多模型对话平台',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        theme_color: '#0B0B10',
        background_color: '#0B0B10',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          // 兼容备选:矢量(SVG, sizes any)
          { src: 'pwa-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        // 注意：**不含 woff2** —— public/fonts/ 下 105 个字体分片约 5.8MB，
        // 若纳入预缓存，安装时会把大量用不到的 unicode-range 分片一并下载。
        // 字体改由 HTTP 缓存 + 浏览器按 unicode-range 按需加载；离线时回退系统衬线。
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        navigateFallback: '/',
        // web-llm(6MB)/onnx 等大 chunk 需超默认 2MB 预缓存上限,否则触发 missing-assets
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
        // 网关/远端 AI API 不入 SW 缓存(实时对话避免陈旧)
        runtimeCaching: [],
      },
    }),
  ],
  // 编译期常量：让运行时能知道"这份包是不是原生壳构建"，不用去猜 UA
  define: {
    __NATIVE_SHELL__: JSON.stringify(isNativeShellEnv),
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  resolve: {
    alias: [
      // 数组形式（@rollup/plugin-alias 标准）：精确字符串匹配
      // 必须放在 '@' 之前，避免被前缀截胡
      { find: '@core/', replacement: resolve(import.meta.dirname, 'src/core') + '/' },
      { find: '@storage/', replacement: resolve(import.meta.dirname, 'src/storage') + '/' },
      { find: '@api/', replacement: resolve(import.meta.dirname, 'src/api') + '/' },
      { find: '@services/', replacement: resolve(import.meta.dirname, 'src/services') + '/' },
      { find: '@/', replacement: resolve(import.meta.dirname, 'src') + '/' },
    ],
  },
  // Tauri 期望 dev server 在固定端口，并允许任意 host 访问
  server: {
    port: 5173,
    strictPort: isTauriDev, // Tauri dev 模式下端口被占用直接报错
    open: !isTauriEnv, // Tauri dev 模式下不自动打开浏览器
    host: isTauriDev ? '127.0.0.1' : 'localhost',
    // 排除 Rust 构建产物,避免 Windows 文件锁 EBUSY 中断 dev(真机验证修复)
    watch: {
      ignored: ['**/src-tauri/target/**', '**/target/**'],
    },
  },
  // Tauri 使用相对路径加载资源（file:// 协议）
  build: {
    target: 'es2022',
    sourcemap: !isTauriEnv, // Tauri 生产构建不要 sourcemap
    // Tauri 期望资源使用相对路径
    ...(isTauriEnv ? { assetsDir: 'assets' } : {}),
    // 首屏体积优化：onnxruntime-web 仅本地向量嵌入使用（默认关闭），
    // 不预加载其 chunk（ort.bundle.min），改为首次使用本地嵌入时按需加载，
    // 避免 ~107KB(gzip) 占首屏。web-llm/gpt-tokenizer 已拆为独立懒加载 chunk（见 rollupOptions）。
    modulePreload: {
      // 首屏强预加载裁剪：本地向量/模型相关 chunk 均为按需功能（仅用户启用本地嵌入时才用），
      // 不应进入首屏预加载。
      //
      // 已知未解决问题（2026-09-28 实测，需架构级方案）：
      // rolldown(vite 8) 会把被多处引用的「动态导入」提升为静态 import，导致
      // ort.bundle.min / onnx-embedding-provider 仍被 entry 等首屏 chunk 静态引用，
      // ort(~104KB gzip) 依然进首屏。本排除规则只能去掉 <link rel=modulepreload>
      // 标签（实测 index.html 已无这些 preload），无法阻断静态依赖链。
      // 彻底解法需将 onnxruntime 访问隔离到独立入口 / Web Worker，另行排期。
      resolveDependencies: (_srcFileName, deps) =>
        deps.filter(
          (dep) =>
            !/ort\.bundle\.min.*\.js$/.test(dep) &&
            !/onnx-embedding-provider.*\.js$/.test(dep) &&
            !/vector-model-(storage|install).*\.js$/.test(dep) &&
            !/rag-benchmark.*\.js$/.test(dep)
        ),
    },
    rollupOptions: {
      output: {
        // 懒加载 chunk 拆分：web-llm 与 gpt-tokenizer 独立 chunk
        // Token 计数场景只需 gpt-tokenizer(~100KB)，不需 web-llm 运行时(2MB)
        manualChunks(id) {
          if (id.includes('@mlc-ai/web-llm')) return 'web-llm';
          if (id.includes('gpt-tokenizer')) return 'gpt-tokenizer';
        },
      },
    },
  },
  // 测试环境配置保持不变
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
