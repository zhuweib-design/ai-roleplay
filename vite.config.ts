/// <reference types="vitest" />
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';

// Tauri 集成：检测 TAURI_ENV 环境变量决定开发服务器配置
// npm run tauri:dev 会自动设置 TAURI_ENV=1
const isTauriEnv = process.env.TAURI_ENV !== undefined;
const isTauriDev = process.env.TAURI_ENV === 'dev';

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
  plugins: [vue(), localProxyPlugin()],
  resolve: {
    alias: [
      // 数组形式（@rollup/plugin-alias 标准）：精确字符串匹配
      // 必须放在 '@' 之前，避免被前缀截胡
      { find: '@core/', replacement: resolve(__dirname, 'src/core') + '/' },
      { find: '@storage/', replacement: resolve(__dirname, 'src/storage') + '/' },
      { find: '@api/', replacement: resolve(__dirname, 'src/api') + '/' },
      { find: '@services/', replacement: resolve(__dirname, 'src/services') + '/' },
      { find: '@/', replacement: resolve(__dirname, 'src') + '/' },
    ],
  },
  // Tauri 期望 dev server 在固定端口，并允许任意 host 访问
  server: {
    port: 5173,
    strictPort: isTauriDev, // Tauri dev 模式下端口被占用直接报错
    open: !isTauriEnv, // Tauri dev 模式下不自动打开浏览器
    host: isTauriDev ? '127.0.0.1' : 'localhost',
  },
  // Tauri 使用相对路径加载资源（file:// 协议）
  build: {
    target: 'es2022',
    sourcemap: !isTauriEnv, // Tauri 生产构建不要 sourcemap
    // Tauri 期望资源使用相对路径
    ...(isTauriEnv ? { assetsDir: 'assets' } : {}),
  },
  // 测试环境配置保持不变
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
