# Web 端部署 SOP

> **适用范围**：把本项目的 Web 构建（`dist/`）部署到静态托管环境。
> **定位**：本文档是 Web 端 SOP 评审识别的**唯一完全缺失的流程**，也是 `docs/design/threat-model.md` §7.2「托管侧责任边界」的可执行版本 —— 威胁模型里那些**不在应用代码内**的控制，全部落在这里。
> **桌面端（Tauri）不适用**：桌面端由 `src-tauri/tauri.conf.json` 管控 CSP 与更新签名，见 `README.md`。

---

## 一、部署前验证清单（必跑）

```bash
npm run lint                    # 0 error
npm run check:css-conventions   # CSS 约定守卫 5 项
npm run a11y:contrast           # 对比度 ≥ AA
npm run test                    # 全量单测
npm run build                   # 生产构建（typecheck + vite build）
npm run check:csp               # CSP 契约守卫（须在 build 之后）
```

**此外必须跑一次运行时审计**（手动，不进 CI）：

```bash
npx vite preview --port 4173 --strictPort   # 另开终端
npm run csp:audit                            # 逐路由 CSP 违规 + 负向对照 + 能力探针
```

`csp:audit` 会做三件事：① 逐路由监听 `securitypolicyviolation`；② 负向对照（注入内联脚本，确认 CSP **真的被浏览器执行**而非只存在于 HTML）；③ **能力探针**（`WebAssembly.compile` + `Worker(blob:)` —— 本地向量模型 onnxruntime-web 与 WebLLM 的运行前提）。

> **任何改动 CSP 允许清单、新增第三方资源（CDN / 字体 / 模型源）、或新增运行时样式注入之后，都必须重跑 `csp:audit`。**

---

## 二、构建产物结构（实测数据）

| 路径 | 说明 | 是否内容哈希 |
| --- | --- | --- |
| `index.html` | 入口（含 CSP meta） | ❌ |
| `assets/*.{js,css}` | 应用代码，按路由分包 | ✅ |
| `assets/*.wasm` | **onnxruntime-web 的 WASM，单文件约 25.6 MB**（最大资源） | ✅ |
| `assets/web-llm-*.js` | WebLLM 运行时，约 5.8 MB | ✅ |
| `fonts/fonts.css` | 本地镜像字体的 `@font-face`（约 214 KB） | ❌ |
| `fonts/*.woff2` | 105 个 `unicode-range` 分片（约 5.8 MB） | ✅（gstatic 内容哈希名） |
| `sw.js`、`workbox-*.js`、`registerSW.js` | Service Worker | ❌ |
| `manifest.webmanifest`、图标 | PWA 清单 | ❌ |
| `*.map` | **39 个 / 约 14.3 MB** | — |

**体积概览**：`dist/` 合计约 56 MB，其中 `.map` 约 14.3 MB → **实际部署体积约 40.7 MB**。

---

## 三、硬性要求

### 3.1 强制 HTTPS

非安全上下文下 `navigator.storage.persist()` 不可用、Service Worker 不注册、`WebAssembly` 线程受限。**HTTPS 是前置条件，不是优化项。**

### 3.2 响应头：meta CSP 覆盖不到的部分（关键）

应用通过 `<meta>` 注入 CSP，但以下指令在 meta 下**被浏览器忽略**，必须在托管侧以**响应头**下发：

```
Content-Security-Policy: frame-ancestors 'none'
```

- **`frame-ancestors 'none'` 是防点击劫持的唯一手段** —— 威胁模型 §7.1 明确记为「当前无防护」，只有托管侧配置才能补上。
- 建议同时下发**完整响应头 CSP**（比 meta 更强，且支持 `report-uri` 上报）。内容须与 `vite.config.ts` 的 `WEB_CSP_DIRECTIVES` 保持一致，否则两处会漂移。

其余建议响应头：

```
Strict-Transport-Security: max-age=63072000; includeSubDomains
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Permissions-Policy: geolocation=(), microphone=(), camera=()
```

> `Referrer-Policy: no-referrer` 与本项目「本地优先、不外泄」的定位一致。

### 3.3 MIME 类型：`application/wasm` 必须正确

**这是最容易踩的坑。** `onnxruntime-web` 用 `WebAssembly.instantiateStreaming()` 加载 WASM，若托管方把 `.wasm` 当作 `application/octet-stream` 返回，加载会失败 —— 且**本地向量模型功能静默不可用**。

| 扩展名 | 必须的 `Content-Type` |
| --- | --- |
| `.wasm` | `application/wasm` |
| `.woff2` | `font/woff2` |
| `.webmanifest` | `application/manifest+json` |
| `.js` | `text/javascript` |

### 3.4 SPA 回退

所有未命中的路径须回退到 `/index.html`（应用为 history 路由）。**但下列路径必须排除在回退之外**，否则会把 404 变成 200 HTML：

```
/assets/*  /fonts/*  /sw.js  /workbox-*.js  /registerSW.js  /manifest.webmanifest  /*.png  /*.svg
```

### 3.5 缓存策略

| 资源 | `Cache-Control` | 理由 |
| --- | --- | --- |
| `assets/*`（含 `.wasm`、`.js`、`.css`） | `public, max-age=31536000, immutable` | 文件名内容哈希，可永久缓存 |
| `fonts/*.woff2` | `public, max-age=31536000, immutable` | 文件名即内容哈希 |
| `fonts/fonts.css` | `no-cache` | **文件名不带哈希**，改字体后须即时生效（`index.html` 用 `?v=` 破缓存） |
| `index.html` | `no-cache` | 必须每次校验，否则发布不生效 |
| `sw.js`、`registerSW.js`、`workbox-*.js` | `no-cache` | SW 更新依赖它 |
| `manifest.webmanifest` | `no-cache` | 同上 |

> **`sw.js` 绝不能长缓存** —— 否则用户永远拿不到新版本。

### 3.6 不要部署 `*.map`

39 个 source map（约 14.3 MB）会**完整暴露源码**。发布产物中应剔除：

```bash
# 方案 A：构建后删除
find dist -name '*.map' -delete

# 方案 B：构建时关闭（vite.config.ts 的 build.sourcemap = false）
```

若因线上排障需要保留，须限制访问（鉴权 / 内网 / 仅 Sentry 上传后删除）。

---

## 四、配置示例

### 4.1 Nginx

```nginx
server {
  listen 443 ssl http2;
  server_name your.domain;

  root /var/www/ai-roleplay/dist;

  # 安全响应头（meta CSP 覆盖不到的部分必须在此下发）
  add_header Content-Security-Policy "frame-ancestors 'none'" always;
  add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header Referrer-Policy "no-referrer" always;

  # 关键：确保 wasm 与字体 MIME 正确（老版本 nginx 的 mime.types 可能缺 woff2）
  types {
    application/wasm        wasm;
    font/woff2              woff2;
    application/manifest+json webmanifest;
  }

  # 哈希资源：永久缓存
  location ~* ^/(assets|fonts)/.*\.(js|css|wasm|woff2|png|svg)$ {
    add_header Cache-Control "public, max-age=31536000, immutable";
    try_files $uri =404;
  }

  # 不带哈希的文件：不缓存
  location ~* ^/(index\.html|sw\.js|registerSW\.js|workbox-.*\.js|manifest\.webmanifest|fonts/fonts\.css)$ {
    add_header Cache-Control "no-cache";
    try_files $uri =404;
  }

  # SPA 回退
  location / {
    try_files $uri $uri/ /index.html;
  }

  # 禁止公开 source map
  location ~* \.map$ { deny all; }
}
```

### 4.2 Caddy

```caddy
your.domain {
  root * /var/www/ai-roleplay/dist
  encode zstd gzip

  header {
    Content-Security-Policy "frame-ancestors 'none'"
    Strict-Transport-Security "max-age=63072000; includeSubDomains"
    X-Content-Type-Options "nosniff"
    Referrer-Policy "no-referrer"
  }

  header /assets/* Cache-Control "public, max-age=31536000, immutable"
  header /fonts/*.woff2 Cache-Control "public, max-age=31536000, immutable"
  header /fonts/fonts.css Cache-Control "no-cache"
  header /index.html Cache-Control "no-cache"
  header /sw.js Cache-Control "no-cache"
  header /registerSW.js Cache-Control "no-cache"

  # Caddy 内置 MIME 表已含 application/wasm 与 font/woff2

  @maps path *.map
  respond @maps 403

  try_files {path} /index.html
  file_server
}
```

### 4.3 Vercel（`vercel.json`）

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Content-Security-Policy", "value": "frame-ancestors 'none'" },
        { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "Referrer-Policy", "value": "no-referrer" }
      ]
    },
    {
      "source": "/assets/(.*)",
      "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }]
    },
    {
      "source": "/fonts/(.*)",
      "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }]
    },
    {
      "source": "/fonts/fonts.css",
      "headers": [{ "key": "Cache-Control", "value": "no-cache" }]
    },
    {
      "source": "/(index.html|sw.js|registerSW.js)",
      "headers": [{ "key": "Cache-Control", "value": "no-cache" }]
    }
  ],
  "rewrites": [{ "source": "/((?!assets/|fonts/|sw\\.js|workbox-).*)", "destination": "/index.html" }]
}
```

> Vercel 自动处理 `.wasm` / `.woff2` 的 MIME；`frame-ancestors` 只能通过响应头下发，故此处必须有。

### 4.4 Netlify（`public/_headers`）

```
/*
  Content-Security-Policy: frame-ancestors 'none'
  Strict-Transport-Security: max-age=63072000; includeSubDomains
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer

/assets/*
  Cache-Control: public, max-age=31536000, immutable

/fonts/*.woff2
  Cache-Control: public, max-age=31536000, immutable

/fonts/fonts.css
  Cache-Control: no-cache

/index.html
  Cache-Control: no-cache

/sw.js
  Cache-Control: no-cache
```

SPA 回退在 `netlify.toml` 中配置：

```toml
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

### 4.5 对象存储 + CDN（S3 / COS / OSS + CloudFront 等）

1. **上传前剔除 `*.map`**：`find dist -name '*.map' -delete`
2. **按前缀设缓存**：
   - `assets/`、`fonts/*.woff2` → `max-age=31536000, immutable`
   - `index.html`、`sw.js`、`registerSW.js`、`fonts/fonts.css` → `no-cache`
3. **配置 MIME**：确认对象元数据中 `.wasm` 为 `application/wasm`（多数厂商默认按扩展名推断，但**需实测确认**，见第五节）
4. **SPA 回退**：CDN 的「自定义错误页」把 `403/404` 映射到 `/index.html` 并返回 `200`；同时为 `/assets/*`、`/fonts/*` 配置**例外**，避免把缺失资源变成 HTML
5. **响应头**：CDN 的响应头策略中补 `frame-ancestors 'none'` 等（对象存储本身通常不支持自定义响应头）

---

## 五、部署后验证清单

| # | 检查项 | 方法 | 期望 |
| --- | --- | --- | --- |
| 1 | CSP 响应头生效 | `curl -sI https://your.domain/ \| grep -i content-security` | 含 `frame-ancestors 'none'` |
| 2 | 点击劫持防护 | 用一个 iframe 嵌入站点 | 被拒绝渲染 |
| 3 | **`.wasm` MIME** | `curl -sI https://your.domain/assets/<hash>.wasm \| grep -i content-type` | `application/wasm` |
| 4 | `.woff2` MIME | 同上，换字体文件 | `font/woff2` |
| 5 | 字体本地化 | 浏览器 Network 面板 | **无 `fonts.googleapis.com` / `fonts.gstatic.com` 请求**；仅有同源 `/fonts/*` |
| 6 | 缓存头 | `curl -sI` 逐个检查 | 与 §3.5 表一致 |
| 7 | `sw.js` 不缓存 | `curl -sI .../sw.js \| grep -i cache-control` | `no-cache` |
| 8 | source map 不可达 | `curl -sI https://your.domain/assets/<hash>.js.map` | 403 / 404 |
| 9 | SPA 深链 | 直接访问 `/settings` 并刷新 | 正常渲染，非 404 |
| 10 | 资源 404 不回退成 HTML | `curl -sI .../assets/不存在.js` | 404（非 200 text/html） |
| 11 | **本地向量模型可用** | 设置页安装本地模型 → 跑冒烟测试 | 成功，且无 CSP 违规 |
| 12 | PWA 可安装 / 离线 | Lighthouse PWA 审计 | 通过；离线时回退系统衬线字体（字体分片不进预缓存） |

> 第 11 项是本次新增的能力探针在**真实托管环境**下的对应检查 —— 本地路径若因 MIME 或 CSP 失效，只会在这一步暴露。

---

## 六、常见坑

| 坑 | 现象 | 处置 |
| --- | --- | --- |
| `.wasm` 被当作 `application/octet-stream` | 本地模型静默不可用，控制台报 `instantiateStreaming` 失败 | 修正托管侧 MIME（§3.3） |
| 只配了 meta CSP，没配响应头 | **点击劫持无防护** | 补 `frame-ancestors 'none'` 响应头（§3.2） |
| `sw.js` 被长缓存 | 发布后用户仍加载旧版本，无法自愈 | `sw.js` 设 `no-cache`（§3.5） |
| SPA 回退过宽 | 缺失的 `.js` 返回 `200 text/html`，报「Unexpected token '<'」 | 回退规则排除 `assets/`、`fonts/` 等前缀（§3.4） |
| 部署了 `*.map` | 源码完整暴露，且多传 14.3 MB | 剔除（§3.6） |
| `index.html` 被缓存 | 发布不生效 | 设 `no-cache` |
| `fonts/fonts.css` 被长缓存 | 更新字体后旧 CSS 引用已删除的分片 → 字形回退 | 设 `no-cache`，或用 `?v=` 破缓存 |
| 改了 `WEB_CSP_DIRECTIVES` 但没同步响应头 | 两处 CSP 漂移，行为不一致 | 以 `vite.config.ts` 为单一来源，改后同步托管侧 |

---

## 七、回滚

静态托管的回滚即**切回上一版产物**：

1. 保留上一版 `dist/`（或依赖托管平台的历史部署回滚功能）；
2. 回滚后**必须重跑第五节第 3、5、7、11 项** —— SW 与缓存可能导致新旧产物混杂；
3. 若新版改过 `sw.js`，建议在回滚后**提升 `?v=` / 触发一次 SW 更新**，避免客户端卡在中间态。

---

## 八、相关文档

| 文档 | 关系 |
| --- | --- |
| `docs/design/threat-model.md` §7 | Web/PWA 威胁面与**托管侧责任边界**（本 SOP 是其可执行版本） |
| `docs/dev/data-backup-restore.md` | 数据导出/导入 Runbook（IndexedDB 驱逐风险的应对） |
| `docs/design/design-system-specification.md` | 设计系统与断点口径 |
| `README.md`「Web 端已知限制」 | 面向用户的已知限制说明 |
