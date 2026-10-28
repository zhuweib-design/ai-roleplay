<div align="center">

<p><b><a href="README.md">简体中文</a> · <a href="README-EN.md">English</a></b></p>

# 🍺 AI 酒馆

**基于 SillyTavern 架构的 AI 角色扮演聊天应用：多模型对话 · 角色卡 · 世界书 · 群聊 · 故事引擎 · 社区市场 · 自定义主题 · 自定义向量模型 RAG · Virtual Character OS Runtime**

[![Version](https://img.shields.io/badge/version-1.1.1-blue.svg)](https://github.com/zhuweib-design/ai-roleplay/releases/tag/v1.1.1)
[![Vue 3](https://img.shields.io/badge/Vue-3.5-42b883.svg)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178c6.svg)]()
[![Tauri 2](https://img.shields.io/badge/Tauri-2.0-24c8db.svg)]()

</div>

---

## 📑 目录

- [项目介绍](#-项目介绍)
- [✨ 特性](#-特性)
- [🖼️ 预览](#-预览)
- [🚀 快速开始](#-快速开始)
- [🧠 Virtual Character OS Runtime](#-virtual-character-os-runtime)
- [⚠️ Web 端已知限制](#️-web-端已知限制)
- [⚙️ 技术栈](#-技术栈)
- [🛣️ 路线图](#-路线图)
- [🤝 贡献](#-贡献)
- [📄 许可证](#-许可证)
- [更多](#-更多)

## 💡 项目介绍

> AI 酒馆是一款 AI 角色扮演聊天应用，让你与自建角色对话、管理世界设定、组织多人群聊，并通过故事引擎推进剧本。既可**在浏览器降级运行**，也可用 **Tauri 2 原生桌面封装**（含系统托盘与全局快捷键）。

**AI 酒馆** 面向角色扮演与叙事创作，目标不只是「生成回复」，而是围绕 **角色、设定与世界的一致性** 提供完整的叙事工作流：从单个角色的性格与开场，到多人群聊的发言调度，再到由故事引擎推进的剧本走向。

- **故事化而非问答化**：世界书以关键词门控持续记忆设定并随语境注入，让角色长期保持一致；故事引擎负责剧本结构、主角身份、时间推进与随机事件。
- **可深度自建**：上传背景图自动提取主色调定制主题；上传 ZIP 或登记本地目录添加自定义向量模型，用 RAG 语义检索让记忆随语境自动浮现。
- **隐私与本地优先**：可接入 WebLLM 本地模型离线对话，无需 API Key 也可畅聊；API Key 落盘加密，主密码不本地存储。

**适用场景**：沉淀长期世界观的角色扮演玩家 · 隐私优先、希望离线对话的用户 · 研究与探索 RAG 语义记忆在角色扮演应用中落地的人。

> 核心能力、技术栈、安全详见下方各节。

## ✨ 特性

| 特性 | 解决的问题 |
| --- | --- |
| **多模型对话** | OpenAI / Anthropic 等多 profile，流式生成、重新生成、翻译、TTS、自动摘要 |
| **心理活动（旁白）** | 模型写在 `⟦ … ⟧` 里的内心戏渲染在气泡**外面**，与台词分排；可设用户自称"我"或"你"；复制 / 朗读 / 翻译 / 导出自动去标记 |
| **自定义向量模型 + RAG** | 上传 ZIP 或登记本地目录添加自定义向量模型，驱动「动态记忆 / 静态世界设定」语义检索 |
| **自定义主题** | 上传背景图自动提取主色调（k-means 聚类）并匹配组件配色，含深/浅主题与"暗夜剧场"字体 |
| **世界书 / Lorebook** | 关键词门控激活，设定随语境自动注入 |
| **角色卡与群聊** | 角色卡批量导入（单批最多 50 个）、Persona、群聊成员/发言顺序、随机 NPC |
| **Virtual Character OS Runtime** | 批量多角色、2–8 人真实模型群聊、独立 Context/Event、PostgreSQL 事务持久化、版本 CAS、Replay 审计 |
| **故事引擎** | 剧本结构分析、主角配置、时间推进、随机事件 |
| **社区市场** | 基于 GitHub 索引的模板 / 角色卡 / 世界书下载，含哈希校验与离线回退 |
| **扩展系统** | 沙箱执行、按需权限（默认拒绝），社区扩展默认不自动执行 |
| **桌面强化** | 系统托盘、全局快捷键（`Ctrl+Alt+Space`）、拖拽导入、断网提示 |
| **手机端与安卓壳** | 底部导航、输入条自动增高与键盘避让、长按唤起消息动作条、窄屏标题不再竖排挤压；`node scripts/android-apk.mjs` 一条脚本出 debug APK（安装包不进 git，也不挂 GitHub Releases，需要时本地构建） |

## 🖼️ 预览

<!-- 截图/演示图待补充：请在此粘贴应用截图或录制 GIF，勿放置无效图片链接。 -->

## 🚀 快速开始

```bash
# 安装依赖
npm install

# 前端开发（Web 降级运行）
npm run dev

# 原生桌面开发（Tauri）
npm run tauri:dev

# 构建前端产物
npm run build
```

### 本地开发门禁

门禁清单以 `.github/workflows/ci.yml` 的 `quality-gates` 为**单一事实源**；提交前按端在本机跑通：

**Web 端（改动前端资源时必跑）**

```bash
npm run lint                  # ESLint（0 error；既有 warning 不新增）
npm run runtime:db:schema:check  # Runtime Schema 漂移检查（migrations/ 与代码是否一致）
npm run snapshot:migration:check  # 快照迁移计划检查
npm run i18n:check:strict     # i18n 严格扫描（无硬编码中文，中英键数对齐）
npm run eval:manifest         # eval manifest 自检（strict）
npm run check:css-conventions # CSS 约定守卫（5 项合一：断点单一来源 / 动态视口 / 触屏 hover / !important 棘轮 / 可编辑控件字号 I-7）
npm run check:file-size       # 单文件行数棘轮（>1000 行即红；白名单只许降不许升）
npm run check:control-size    # 控件高度字面量棘轮（尺寸接 --size-control-* token，按文件锁存量）
npm run check:primitives      # 共享原语复用守卫（与 primitives.css 逐字同值的复制即红）
npm run check:save-blob       # 存盘方式守卫（导出统一走 saveBlob 单入口，基线 0）
npm run check:no-artifact     # 产物入库守卫（安装包 / 大二进制不许进 git）
npm run check:no-release-assets  # Release 零资产守卫（安装包不挂 Releases；需联网打 GitHub API，打不通时报"无法判定"并红）
npm run check:token-baseline  # Token 死引用棘轮
npm run a11y:contrast         # 无障碍对比度（语义配对 ≥ AA 4.5:1；存量基线零余量棘轮）
npm run test:coverage         # Vitest + 覆盖率（statements 78 / branches 73 / functions 78 / lines 78）
npm run build                 # vue-tsc 类型检查 + vite 生产构建
npm run check:csp             # Web 端 CSP 契约守卫（须在 build 之后跑）
npm run check:ort             # ORT 首屏隔离守卫（须在 build 之后跑）
npm run check:readme-gates    # 本清单与 CI 的对账守卫（CI 实跑的守卫与上面这块双向比对，缺一条即红）
```

> 2026-10-16 的教训：一台 `.load-earlier-btn:hover` 的违规之所以能进了 master，是因为本机只跑了熟悉的那几条。**本机核对必须照 `ci.yml` 的整条 step 清单走**，不要凭记忆挑子集；E2E 的结论以 CI 的 4 组并行为准（本机全量串行约 15 分钟，且吃内存）。

**桌面端（仅改动 `src-tauri/` 时跑）**

```bash
npm run tauri:build        # 桌面端编译验证（需 Rust 工具链，耗时较长）
```

> CI（`.github/workflows/ci.yml`）共三个 job。`quality-gates`（ubuntu-latest，带 postgres:16 service）按序执行：依赖审计（high 及以上）→ lint → Runtime Schema 漂移检查 → 快照迁移计划检查 → i18n strict → eval manifest 自检 → CSS 约定守卫（断点 / 视口 / hover / `!important` 棘轮 / 可编辑控件字号 I-7）→ 单文件行数棘轮 → 控件高度字面量棘轮 → 共享原语复用守卫 → 存盘方式守卫（含自检）→ 产物入库守卫（安装包与大二进制不许进 git，含自检）→ Release 零资产守卫（安装包不挂 GitHub Releases，含自检）→ Token 死引用棘轮（含自检）→ 对比度审计（含自检）→ 测试与覆盖率门禁（78/73/78/78，同一步承载真实 PostgreSQL 集成用例，不再单设重复 job）→ 构建 → CSP 守卫 → ORT 首屏守卫 → README 门禁清单对账（含自检：CI 实跑的守卫与本页上面那块清单双向比对，缺一条即红）。`e2e` 按 `e2e/shard-groups.mjs`（由单 worker 实测时长生成，并有"每个 spec 恰好属于一组"的对账守卫）分成 4 组并行，chromium 覆盖桌面与 Pixel 5 视口、webkit 覆盖 Safari 近似内核。`tauri-build` 验证桌面 release 二进制可编译（`--no-bundle`，不生成也不上传安装包）。GitHub Release 只保留自动生成的源码归档。

**Runtime 改动（`src/runtime/`、`migrations/` 时追加；Schema 漂移检查已并入 CI `quality-gates`）**

```bash
npm run runtime:db:schema:check  # 迁移文件与权威 Schema 文档漂移检查
npm run typecheck                # Runtime 类型与契约检查
```

> 完整门禁链与阈值以 `.github/workflows/ci.yml` 和 `vitest.config.ts` 为准，本清单不复述细节。

## 🧠 Virtual Character OS Runtime

AI 酒馆内置 Virtual Character OS，用确定性状态机承载角色的长期演化，而不是把状态交给 LLM 自由改写。默认走本地快照（IndexedDB / Tauri 文件存储），配置服务端地址后切换为 PostgreSQL 事务边界。

| 能力 | 说明 |
| --- | --- |
| **批量多角色** | 一次导入最多 50 个角色卡，逐项返回创建 / 已存在 / 校验失败；稳定角色 ID 保证重试不覆盖既有快照 |
| **多角色群聊** | 2–8 个成员，自然轮换与指定发言；每个成员使用独立 Runtime Context 与 Event 流 |
| **PostgreSQL 持久化边界** | 租户隔离的群组、成员与公共回合表；群组回合与各成员 Event、投影、Snapshot、Audit 在同一事务内提交 |
| **并发与一致性** | 角色级与群组级版本 CAS；群组定义冲突显式返回 409，不静默覆盖成员 |
| **回放与审计** | 确定性 Reducer 与 `replayRuntimeEvents`，按事件时间与输入顺序重放，用于状态修复与离线审计 |
| **可靠重试** | 远程群聊提交失败后写入本地待提交队列，复用稳定回合 ID 幂等重试，不重复生成或重复写入 Event |

### 启用服务端 Runtime

```bash
# 1. 应用 Schema 迁移
psql "$DATABASE_URL" -f migrations/001_virtual_character_os.sql

# 2. 校验迁移文件与权威 Schema 文档无漂移
npm run runtime:db:schema:check
```

前端设置环境变量 `VITE_RUNTIME_BASE_URL` 后，聊天与群聊切换到服务端 Runtime HTTP API；未设置时保持原有本地快照行为。

```bash
# 前端构建时注入（.env.local 或 CI 变量）
VITE_RUNTIME_BASE_URL=https://runtime.example.com npm run build
```

```ts
// 服务端组合入口（租户 ID 必须来自认证中间件）
const handler = createPgPoolRuntimeHttpHandler(pool, tenantId, {
  // 默认 fail-closed：除 /health 外，没有可信 principal 的请求一律 401。
  // 只有在明确清楚风险时，才用 allowAnonymous: true 开放（例如仅本机回环的调试）。
  httpAuth: {
    requireAuthentication: true,
    authenticate: async (request) => {
      const session = await verifySession(request); // 宿主自己的会话/网关校验
      return session ? { subject: session.userId, tenantId: session.tenantId } : null;
    },
  },
  // OBS-01：关联 ID 与耗时观测。每个请求都会带上 x-runtime-request-id，
  // 该 ID 由客户端注入（缺失时服务端兜底生成）并在响应头回显。
  // 失败时客户端 RuntimeApiError.traceId 即同一 ID，可用于对齐两端日志。
  onTrace: ({ traceId, method, path, status, durationMs }) => {
    logger.info('runtime-http', `${method} ${path} ${status} ${durationMs}ms trace=${traceId}`);
  },
});
```

服务端对外路由：

```text
GET    /v1/runtime/health
POST   /v1/runtime/characters
POST   /v1/runtime/characters/batch
GET    /v1/runtime/characters/:id
POST   /v1/runtime/characters/:id/events
POST   /v1/runtime/characters/:id/turns
POST   /v1/runtime/characters/:id/context
POST   /v1/runtime/groups
GET    /v1/runtime/groups/:id
GET    /v1/runtime/groups/:id/turns
POST   /v1/runtime/groups/:id/turns
POST   /v1/runtime/groups/:id/context
POST   /v1/runtime/groups/:id/members
DELETE /v1/runtime/groups/:id/members/:characterId
```

设计与验证记录见 [`docs/design/virtual-character-os-实现基线.md`](docs/design/virtual-character-os-实现基线.md) 与 [`docs/design/virtual-character-os-多角色群聊实施计划.md`](docs/design/virtual-character-os-多角色群聊实施计划.md)。

> 生产部署仍需自行提供认证、网关路由、迁移备份与回滚演练；当前仓库提供的是 Runtime 边界、Schema 与可验证实现，不包含生产认证宿主。未传 `httpAuth` 时 Handler 默认拒绝未认证请求；`allowAnonymous: true` 只适合受信任的本地回环调试。

## ⚠️ Web 端已知限制

Web（浏览器 / PWA）模式与桌面端（Tauri）能力不完全对等。部署或使用前请先了解以下限制。

### 1. 本地 / 内网 LLM 端点仅在开发模式可用

开发模式（`npm run dev`）下，Vite 会注入 `/llm-proxy/` 中间件，把对本地/内网地址的请求代理转发以绕过浏览器 CORS（仅放行 `localhost` / `127.0.0.1` / `::1` / `10.x` / `172.16–31.x` / `192.168.x`）。

**生产构建不含该中间件**：`src/api/openai-protocol.ts` 有 `import.meta.env.DEV` 守卫，生产环境一律直连。因此把 baseUrl 配为 `http://192.168.1.5:11434`（Ollama）时，dev 下正常、生产构建下会被浏览器 CORS 拦截。三种处理方式任选其一：

- **自建反向代理**（推荐），让浏览器视为同源。Nginx 示例：

  ```nginx
  location /v1/ {
      proxy_pass http://192.168.1.5:11434/v1/;
      proxy_set_header Host $host;
      proxy_buffering off;        # SSE 流式响应必须关闭缓冲
      proxy_read_timeout 600s;
  }
  ```

  然后把模型 baseUrl 配为 `https://你的域名/v1`。
- 让目标服务自行开启 CORS（Ollama 可设置 `OLLAMA_ORIGINS`）。
- 改用**桌面端**：Tauri 走 Rust `reqwest`，不经过浏览器，无 CORS 限制。

### 2. CSP 以 `<meta>` 形式提供，且不覆盖桌面端

Web 生产构建会注入 CSP（见 `vite.config.ts` 的 `webCspPlugin()`），含 `script-src 'self' 'wasm-unsafe-eval'`、`object-src 'none'`、`base-uri 'self'` 等 12 条指令。Tauri 构建**不注入**（桌面端 CSP 由 `src-tauri/tauri.conf.json` 管控）。

**注意**：`frame-ancestors`、`report-uri`、`sandbox` 在 `<meta>` 形式下会被浏览器**忽略**。若需要防点击劫持或 CSP 上报，必须在**托管侧配置响应头**：

```
Content-Security-Policy: frame-ancestors 'none'; report-uri /csp-report
```

改动 CSP 允许清单后，建议做一次运行时审计：先 `npm run build`，再另开终端 `npx vite preview --port 4173 --strictPort`，然后 `npm run csp:audit`。

### 3. ~~外链字体在部分网络环境下不可用~~ 已解决（2026-09-20）

字体（Playfair Display 拉丁 / Noto Serif SC 中文，仅「暗夜剧场」主题的衬线标题使用）原先从 Google Fonts 引入，中国大陆网络环境下通常不可达。现已**本地镜像到 `public/fonts/`**（105 个 `unicode-range` 分片 / 约 5.8 MB，由 `scripts/vendor-fonts.mjs` 生成，可重复运行以更新字体）：

- **不再有任何第三方字体请求**，消除了向 Google 暴露访问者 IP / Referer 的问题；
- CSP 的 `style-src` / `font-src` 已同步收窄，移除两处 CDN 放行；
- 浏览器仍按 `unicode-range` **按需加载**用到的分片（实测单次会话约 9 个），运行时下载量与原先一致；
- 字体分片**不参与 PWA 预缓存**（否则会白白下载约 5.8 MB 用不到的分片）；离线且 HTTP 缓存未命中时回退系统衬线，功能不受影响。

> 相关门禁：`npm run check:csp` 会校验构建产物中无第三方字体 CDN 引用、且本地字体镜像完整。

### 4. 数据存于浏览器 IndexedDB，存在被清除的风险

Web 模式数据落在 IndexedDB，与桌面端文件系统不同，可能被浏览器单方面清除：存储压力下驱逐未获持久化授权的源数据；Safari 对长期未访问站点的 7 天清理策略；源配额上限（角色卡 + 对话历史 + 向量缓存增长后可能写入失败）。

应用启动时会自动申请持久化授权，**设置 → 数据 → 数据持久性** 可查看当前状态并重新申请。授权能显著降低风险但无法完全排除（用户手动「清除站点数据」不受限制）。**请定期在 设置 → 数据 导出备份**；灾备流程见 [`docs/dev/data-backup-restore.md`](docs/dev/data-backup-restore.md)。

### 5. PWA 缓存与更新

Service Worker 采用 `autoUpdate`，仅预缓存本地静态资源（`runtimeCaching: []`，网关与远端模型接口不入缓存）。更新于下次进入时生效；如遇界面与代码不一致，强制刷新或清除站点数据即可。

## ⚙️ 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | Vue 3 · TypeScript · Vite · Vue Router · Pinia |
| 桌面 | Tauri 2.0（原生封装 + Web 降级） |
| 本地模型 | onnxruntime-web（向量嵌入） · WebLLM（本地大模型引擎） |
| 安全 / 渲染 | DOMPurify（XSS 净化） · gpt-tokenizer（token 计数） · marked（Markdown） · fflate（ZIP） |
| 质量 / 测试 | Vitest · Playwright · axe-core · ESLint |

### 目录结构（要点）

```
src/core/            核心逻辑（RAG、嵌入、主题提取、市场索引、扩展加载…）
src/runtime/         Virtual Character OS Runtime（Event/State/Context、Replay、PostgreSQL 与群聊事务边界）
src/stores/          Pinia 状态（对话、设置、用户向量模型…）
src/components/      组件（聊天、设置、通用 Modal/Icon…）
src/views/           页面视图
src/i18n/locales/    zh / en 国际化
src-tauri/           Tauri 原生壳（托盘、快捷键、capabilities/ACL）
tests/               单元 / 组件 / 无障碍测试（Vitest）
e2e/                 Playwright 端到端用例
scripts/             自研门禁与工具脚本（i18n 扫描、断点守卫、视口守卫、对比度审计、截图…）
docs/                产品与开发文档
artifacts/           历史构建 / 覆盖率 / 测试结果快照（已被 .gitignore 忽略）
```

## 🛣️ 路线图

顺序规则：**版本号从新到旧**，与 `CHANGELOG.md` 同一口径；发新版本时把条目加在本段最上面，
跨版本推进的能力不要插在版本号之间，加到底下"能力线"那段里。

- [x] **v1.1.1** — 补丁：设置 → 关于显示真实版本号（构建期注入），一次性探针脚本请出产品门禁（已完成，无数据迁移）
- [x] **v1.1.0** — 手机端可用化、心理活动叙事、注入可见化、Token 预算推导、安卓出包与工程护栏（已完成，无数据迁移）
- [x] **v1.0.0** — 首个稳定版本（已完成）
- [x] **0.9.0** — 单一本地用户与世界内扮演资料收敛（已完成）
- [x] **0.8.0** — Runtime 记忆确认、拒绝、停用与审核事件回放（已完成）
- [x] **0.7.0** — 记忆有效期过滤与 Runtime 上下文来源审计（已完成）
- [x] **0.6.0** — Appraisal 评价、Behavior Planner 行为规划与可配置长期状态衰减（已完成）
- [x] **0.5.0** — 长对话全文搜索、历史消息跳转与虚拟化窗口联动（已完成）
- [x] **0.4.0** — 本地长期记忆持久化、双通道向量 RAG 增量同步、长对话摘要与上下文状态展示（已完成）
- [x] **0.3.1** — Runtime 与群聊生产化：租户与成员授权、服务端可靠投递队列（outbox）、群组定义 CAS 冲突恢复、状态查看与回放自检（已发布）
- [x] **0.3.0** — Runtime 与群聊 MVP：服务端群聊历史跨设备同步、可靠投递队列、冲突恢复、Runtime 状态查看（已发布）
- [x] **0.2.0** — 自定义向量模型 + RAG、自定义主题、社区市场、系统托盘/快捷键（已发布）

能力线（跨版本推进，不占版本号）：

- [x] **Virtual Character OS Runtime** — 批量多角色、多角色群聊、PostgreSQL 事务持久化、版本 CAS 与 Replay 审计（已落地）
- [x] **RAG 增强** — 停用词过滤、已安装模型自动择优与 recall@3 基准（已完成）
- [x] **无障碍** — 自定义主题运行时对比度预检（已完成）

## 🤝 贡献

欢迎为 AI 酒馆做贡献。详见 [CONTRIBUTING.md](CONTRIBUTING.md)（含对核心开源技术的致谢）。基本流程：`Fork → 特性分支 → PR`；涉及较大改动或新功能，建议先开 Issue 讨论再动手。

## 📄 许可证

本项目基于 **Apache License 2.0** 开源。详见 [LICENSE](LICENSE)。

## 📚 更多

- [隐私与安全](#-隐私与安全)
- [部署](#部署)

### 部署

- **Web 端（静态托管）**：完整流程见 [`docs/dev/web-deployment-sop.md`](docs/dev/web-deployment-sop.md) —— 含部署前验证清单、6 项硬性要求（HTTPS / `frame-ancestors` 响应头 / **`.wasm` MIME** / SPA 回退排除 / 缓存策略 / 剔除 source map）、Nginx / Caddy / Vercel / Netlify / 对象存储+CDN 的具体配置、12 项部署后验证清单与常见坑。
  - 部署前必须跑：`npm run build && npm run check:csp`，并在 `vite preview` 下跑 `npm run csp:audit`（逐路由 CSP 违规 + 负向对照 + **WASM/blob Worker 能力探针**）。
- **桌面端（Tauri）**：GitHub 发布不上传安装包；本地桌面构建使用 `npm run tauri:build`，GitHub Release 只保留源码归档。
- **安卓端（Capacitor 壳）**：`node scripts/android-apk.mjs` 一条脚本出 debug APK（需本机 JDK 21 与 Android SDK，`android/local.properties` 写 `sdk.dir`）。安装包由 `.gitignore` 与"产物入库"守卫双重挡在仓库外，并且**不对外挂在 GitHub Releases 上**——这条口径另有 `check:no-release-assets` 机器检查守着（Release 挂任何资产即红），Release 只保留自动生成的源码归档，需要真机包请从源码本地构建。为什么撤干净、撤了哪 7 个包、怎么复核，见 [`docs/dev/installer-distribution-2026-10-19.md`](docs/dev/installer-distribution-2026-10-19.md)。原生壳构建期会关闭 Service Worker（否则覆盖安装不生效），真机调试用 Chrome 133 的 WebView + CDP。
  - **版本发布说明**：最新见 [`docs/dev/release-notes-1.1.1.md`](docs/dev/release-notes-1.1.1.md)（补丁版：为什么单开一版、验证读数与仍未闭环的项）；1.1.0 的能力清单见 [`docs/dev/release-notes-1.1.0.md`](docs/dev/release-notes-1.1.0.md)，逐项门禁读数见 [`docs/dev/release-evidence-1.1.0.md`](docs/dev/release-evidence-1.1.0.md)；再上一版见 [`docs/dev/release-notes-1.0.0.md`](docs/dev/release-notes-1.0.0.md)（稳定版边界与验证结果）；数据库迁移演练见 [`docs/dev/runtime-database-migration-runbook.md`](docs/dev/runtime-database-migration-runbook.md)。

### 隐私与安全

- 客户端最小权限：capabilities 仅授予 `core:default`，未启用 updater、`fs/shell/http/dialog/os` 插件
- CSP（双端分别定义）：
  - **桌面端**：由 `src-tauri/tauri.conf.json` 管控，`script-src 'self'` 禁内联脚本，`freezePrototype` 开启
  - **Web 端**：生产构建由 `vite.config.ts` 的 `webCspPlugin()` 注入 `<meta>` CSP（`script-src 'self' 'wasm-unsafe-eval'`、`object-src 'none'`、`base-uri 'self'` 等 12 条指令），并由 `npm run check:csp` 作为 CI 契约守卫；`frame-ancestors` 等 meta 不支持的指令需在托管侧配置响应头，见 [Web 端已知限制](#️-web-端已知限制)
- XSS 纵深防御：CSP（浏览器侧拦截）+ `src/core/sanitize.ts` 的 DOMPurify 封装（渲染侧净化，新增 `v-html` 前必须接线）
- API Key 落盘加密（PBKDF2 + AES-GCM），主密码不本地存储
- GitHub Release 仅保留自动生成的源码归档，不上传任何安装包或更新器清单（桌面与安卓都不挂，由 `check:no-release-assets` 守着）；应用需从源码本地构建
