# Web 端 SOP 评审 · 第三批修复报告（补 Web 端安全与数据保障）

| 项 | 值 |
| --- | --- |
| 依据 | `docs/fixes/web-sop-review-2026-09-18.md` 第五节「第三批」 |
| 授权范围 | 第三批 4 项（第 11–14 项） |
| 执行日期 | 2026-09-18 15:35–16:10 |
| 结论 | ✅ 4 项全部完成；另附 1 项报告未列的加固（`check:csp` 契约守卫） |
| 门禁变化 | `quality-gates` 由 7 道扩为 **8 道**（新增 CSP guard） |

---

## 一、4 项修复明细

### 11. Web 端补 CSP（P0-2）✅

**问题**：仓库唯一的 CSP 定义在 `src-tauri/tauri.conf.json`（**桌面端**），Web 端完全没有。Web 端 XSS 仅靠 DOMPurify 单层防线。

**实现**：`vite.config.ts` 新增 `webCspPlugin()`，**仅「生产构建 + 非 Tauri」**时注入 `<meta>` CSP。

- Tauri 构建不注入 —— 避免与 `tauri.conf.json` 的 CSP 叠加/冲突
- dev 不注入（`apply: 'build'`）—— 避免打断 HMR（内联脚本 + ws）

**允许清单（12 条指令，每条对应实际能力需求）**：

| 指令 | 值 | 为何需要 |
| --- | --- | --- |
| `default-src` | `'self'` | 兜底 |
| `script-src` | `'self' 'wasm-unsafe-eval'` | onnxruntime-web / WebLLM 需编译 WebAssembly |
| `worker-src` | `'self' blob:` | ort 的多线程 / proxy worker 由 blob URL 创建 |
| `style-src` | `'self' 'unsafe-inline' https://fonts.googleapis.com` | Vue 运行时样式注入 + 现有外链字体 |
| `font-src` | `'self' data: https://fonts.gstatic.com` | 外链字体资源 |
| `img-src` | `'self' data: blob: https:` | 角色头像（data/blob）、市场图（https） |
| `media-src` | `'self' data: blob:` | 音频类资源 |
| `connect-src` | `'self' https:` | 用户自定义模型端点 + 本地模型下载 |
| `object-src` | `'none'` | 禁插件 |
| `base-uri` | `'self'` | 防 `<base>` 劫持 |
| `form-action` | `'self'` | 防表单外发 |
| `frame-src` | `'none'` | 无 iframe 需求 |

**已知局限**：`frame-ancestors` / `report-uri` / `sandbox` 在 `<meta>` 形式下被浏览器**忽略**，防点击劫持须由托管侧响应头补充 —— 已写入 README「Web 端已知限制」。

### 11b.（报告未列）CSP 契约守卫 `check:csp` ✅

针对本报告的核心系统性发现「评审建议 → 门禁转化率 1/6」，本次为 CSP 一并补上门禁，避免重演「脚本写了但没接」。

| 项 | 内容 |
| --- | --- |
| 新增 | `scripts/csp-guard.mjs` → `npm run check:csp` |
| 校验 | ① 构建产物含 CSP meta；② 关键指令齐备（`default-src`/`script-src` 的 `'self'`、`object-src 'none'`、`base-uri 'self'`）；③ `script-src` 未被 `'unsafe-eval'`/`'unsafe-inline'` 削弱；④ 构建产物无内联 `<script>`（会被自身 CSP 拦截致白屏） |
| 接入 | `ci.yml` 的 `quality-gates`，紧跟 `Build` 之后（需 `dist/`） |
| 自测 | **正负向均验证**：正向通过；移除 meta → 拦下；`wasm-unsafe-eval` 改为 `unsafe-eval` → 拦下 |
| 新增 | `scripts/csp-audit.mjs` → `npm run csp:audit`（运行时审计，**手动诊断用、未接 CI**，理由见文件头注释） |

### 12. `navigator.storage.persist()` + 设置页状态展示（P1-10）✅

| 层 | 内容 |
| --- | --- |
| 核心模块 | 新增 `src/core/storage-persistence.ts`（模块级单例 ref，参照 `viewport.ts` 模式）。导出 `isPersistSupported` / `getPersistState` / `requestPersistentStorage` / `initStoragePersistence` / `refreshStoragePersistence` / `persistState`；**不支持或抛错时返回 `'unsupported'`/`'unknown'`，绝不向上抛**（持久化是增强能力，失败不得阻断启动） |
| 启动接线 | `App.vue` 按端分流：仅 `getStorageEnv() === 'web'` 才申请（Tauri 走文件系统，无此概念），非阻塞 |
| 设置页 UI | 「数据管理 → 数据持久性（Web / PWA）」区块：四态展示（已授权 / 未授权 / 不适用 / 未知）+ 风险说明 + 「重新申请授权」按钮 |
| i18n | 新增 10 个键，zh / en 对齐 |
| 单测 | 新增 `tests/core/storage-persistence.test.ts`，**16 例**：支持性探测（含只缺一个 API 的边界）、四态、已授权时不重复调用 `persist()`、异常兜底、模块级状态同步、`refresh` 只查询不申请 |

### 13. README「Web 端已知限制」小节（P0-3）✅

新增 5 个子节，并同步进 TOC：

1. **本地 / 内网 LLM 端点仅 dev 可用** —— 说明 `import.meta.env.DEV` 守卫与生产环境 CORS 拦截，给出三条出路：Nginx 反向代理最小示例（含 `proxy_buffering off` 的 SSE 要点）、`OLLAMA_ORIGINS`、改用桌面端
2. **CSP 以 `<meta>` 形式提供** —— 现状 + meta 忽略项 + 托管侧响应头示例 + 改动后如何跑运行时审计
3. **外链字体在部分网络环境不可用** —— 大陆不可达时优雅回退，功能不受影响
4. **数据存于 IndexedDB 存在被清除风险** —— 三类风险 + 设置页入口 + 建议导出频率
5. **PWA 缓存与更新** —— `autoUpdate` 与 `runtimeCaching: []` 的行为说明

**连带修正**（否则文档自相矛盾）：

- `docs/design/threat-model.md`：§3 新增「CSP(Web 端)」防护行；§4 中「CSP 收紧」这一**已不再成立**的表述改为「Web 端已补 meta CSP，但 `frame-ancestors` 需托管侧补充」
- `README.md` 隐私与安全段：CSP 改为「双端分别定义」，XSS 改为「CSP + DOMPurify 纵深防御」

### 14. `e2e/backup-restore.spec.ts`（P1-10）✅

把灾备路径从「仅文档化」升级为「持续验证」。覆盖完整闭环：

1. 造一条可识别角色数据
2. **导出**：捕获下载 → 校验文件名契约（`ai-roleplay-backup-YYYY-MM-DD.json`）→ 校验内容含该角色（格式契约）
3. **删除**该角色，制造「数据丢失」
4. **导入**同一备份 → 断言「导入结果」弹窗出现（证明不是静默成功）
5. 回到列表确认数据**确实还原**

**陷阱记录**：设置页各分类以 `v-show` 切换，数据管理区默认不可见，必须先点「数据」分类；备份区需用 `.data-mgmt-block` + 小节标题定位，避免与页面内其它 `input[type=file]` 冲突。

---

## 二、验证结果

| 门禁 | 命令 | 结果 |
| --- | --- | --- |
| 代码风格 | `npm run lint` | ✅ 0 error（2 个既有 warning） |
| i18n 严格 | `npm run i18n:check:strict` | ✅ src 149 文件无硬编码中文 |
| 断点守卫 | `npm run check:breakpoints` | ✅ 通过 |
| 视口守卫 | `npm run check:viewport` | ✅ 通过 |
| **CSP 契约（新增）** | `npm run check:csp` | ✅ 通过（12 条指令，关键指令齐备） |
| 对比度审计 | `npm run a11y:contrast` | ✅ 0 项未达 AA |
| 类型检查 | `npm run typecheck` | ✅ 0 error |
| 全量单测 | `npm run test` | ✅ **99 文件 / 2712 测试通过**（+1 文件 / +16 例） |
| 全量 E2E | `E2E_PORT=5174 npx playwright test` | ✅ **14 passed**（桌面 10 + 移动 3 + 灾备 1） |
| **CSP 运行时审计** | `npm run csp:audit`（对生产构建） | ✅ **8 路由 0 违规** + 负向对照确认 CSP 被强制执行 |

### CSP 运行时审计明细（关键验证）

对**生产构建产物**（`vite preview`）用真实浏览器加载 8 条路由：

| 路由 | CSP 违规 | console 错误 | 404 |
| --- | --- | --- | --- |
| `/chat` | 0 | 1（`/favicon.ico` 404，既有现象） | — |
| `/character`、`/community-market`、`/worldbook`、`/settings`、`/character/new`、`/profile`、`/databank` | 0 | 0 | 0 |

**负向对照**（证明 CSP 不是「只写在 HTML 里」）：注入内联 `<script>` → **未执行**（`window.__inlineRan !== true`）且产生 `script-src-elem <- inline` 违规。**CSP 确实被浏览器强制执行。**

> `/chat` 的 404 已定位为浏览器对 `/favicon.ico` 的默认请求（`index.html` 未声明 favicon），与 CSP 无关，属既有现象。

---

## 三、附带清理

- `test-results/`（257 个文件的旧运行结果）在执行 E2E 时触发沙箱批量删除保护，已按项目约定**归档**至 `artifacts/test-results/run-20260918-1607`（非删除）。后续 Playwright 会自动重建 `test-results/`。
- `PROJECT_INDEX.md` 重新生成：**371 个文件 / 待确认 0**；同时把本批新增的 3 个文件补入 `scripts/gen-project-index.mjs` 的 `CURATED` 映射。

---

## 四、遗留事项

| 项 | 状态 | 说明 |
| --- | --- | --- |
| **字体自托管（P2-2）** | ⏳ 仅完成「规划」 | Noto Serif SC 为 CJK 字体，自托管需处理 Google 的分片 `unicode-range` 子集（约上百个 woff2）或引入数 MB 整包，属独立工作量；当前失效模式是**优雅降级**（回退系统衬线，功能不受影响）。本批先以 CSP 放行两个 Google 域收口，自托管后可一并收窄 `style-src` / `font-src` |
| **Web 端发布/部署 SOP** | ~~❌ 仍缺~~ **✅ 已于 2026-09-20 补齐** | 新增 `docs/dev/web-deployment-sop.md`（目标无关写法，含 5 类托管目标配置与 12 项部署后验证清单） |
| **第四批（口径统一与流程固化）** | ⏳ 未授权 | P1-8 断点表述统一 / P2-1 威胁面补全 / P2-3 i18n 首访语言 / P2-4 `S-1` 部分完成标注 / P2-5 hover 守卫 / P2-6「评审建议 → 门禁」登记表规则 |

### 未验证项（诚实标注）

- **本地模型路径未经运行时验证**：`'wasm-unsafe-eval'` 与 `worker-src blob:` 是依据 onnxruntime-web / WebLLM 的已知需求推导并写入的，但本次**未实际跑通**本地向量模型安装与 WebLLM 推理（需下载数 MB～数百 MB 模型）。若后续发现该路径被 CSP 拦截，应在 `WEB_CSP_DIRECTIVES` 中按需放宽并同步更新 `scripts/csp-guard.mjs` 的关键指令清单。

> **✅ 已于 2026-09-20 关闭**：在生产构建（含真实 CSP）下用真实浏览器实测，`WebAssembly.compile` 与 `Worker(blob: URL)` **均通过**、`securitypolicyviolation` **0 条**，证明该放行清单对 onnxruntime-web（本地向量模型）与 WebLLM 的运行时前提是**够用的**。同时确认二者确为在用能力（`onnxruntime-web ^1.27.0`、`@mlc-ai/web-llm ^0.2.84` 均为依赖，`src/core/onnx-embedding-provider.ts` 为浏览器端实现）。验证方式见 `docs/dev/web-deployment-sop.md`（「部署前验证清单」）。
