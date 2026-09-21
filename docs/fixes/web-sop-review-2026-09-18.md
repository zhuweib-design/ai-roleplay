# Web 端 SOP 评审报告

| 项 | 值 |
| --- | --- |
| 评审对象 | AI 酒馆（ai-roleplay）**Web 端**标准作业流程（SOP） |
| 评审日期 | 2026-09-18 |
| 评审范围 | 严格限定 Web / 浏览器 / PWA 相关模块与流程 |
| **明确排除** | Tauri 桌面端（Rust 侧、`src-tauri/`、桌面安装包发布）、Android/iOS 原生壳 |
| 评审维度 | 完整性 · 准确性 · 一致性 · 可执行性 |
| 评审方法 | 文档交叉比对 + 源码/配置取证 + 门禁实跑验证 |
| 代码基线 | commit `60e12b9`（S-10 断点治理） |
| 报告位置 | `docs/fixes/web-sop-review-2026-09-18.md` |

> **端边界说明**：本报告中凡涉及 Tauri 的内容，仅在「Web 端 SOP 错误地引用了桌面端事实」时才出现，并已明确标注。纯粹的桌面端缺陷不在评审范围内。

---

## 一、SOP 载体清单

Web 端没有单一 SOP 文档，SOP 实际分散在 14 个载体中。这是本次评审的第一个结构性发现。

| # | 载体 | 类型 | Web 相关度 | 状态 |
| --- | --- | --- | --- | --- |
| 1 | `CONTRIBUTING.md` | 贡献流程 / 本地门禁 | 高 | 过时 |
| 2 | `README.md`（快速开始 / 本地门禁 / 目录结构 / 隐私与安全） | 上手与门禁 | 高 | 部分失准 |
| 3 | `.github/workflows/ci.yml` | CI 门禁链 | 高 | 有缺陷 |
| 4 | `package.json` → `scripts` | 命令契约 | 高 | 有孤儿项 |
| 5 | `docs/dev/mobile-pwa-plan.md` | PWA 实施 SOP | 极高 | 状态过时 |
| 6 | `docs/design/mobile-ui-design.md` | 移动端 UI 规范 | 极高 | 边界表述不一致 |
| 7 | `docs/design/design-system-specification.md` | 设计系统规范 | 高 | 基本准确 |
| 8 | `docs/design/software-design-document.md` §5 运行时/部署视图 | PWA 链路设计 | 高 | 未逐条核对实现 |
| 9 | `docs/dev/data-backup-restore.md` | 灾备 Runbook | 高 | 缺 Web 特有风险 |
| 10 | `docs/design/threat-model.md` | 安全约束 | 中 | Web 面覆盖不足 |
| 11 | `docs/fixes/cross-client-review-2026-09-07.md` | 跨端缺陷评审（28 项） | 极高 | 建议未转门禁 |
| 12 | `docs/fixes/goal-tracker.md` | 修复进度台账 | 高 | **自相矛盾** |
| 13 | `playwright.config.ts` + `e2e/` | 验证 SOP | 高 | 零移动覆盖 |
| 14 | `scripts/*.mjs`（门禁脚本） | 门禁实现 | 高 | 1 项未接入 |

---

## 二、评审结论摘要

| 维度 | 结论 | 主要依据 |
| --- | --- | --- |
| **完整性** | ⚠️ 不完整 | Web 端无 CSP、无部署 SOP、无移动视口 E2E、灾备未覆盖 IndexedDB 驱逐风险 |
| **准确性** | ❌ 存在硬伤 | 进度台账自相矛盾；README 宣称的"CSP 收紧"在 Web 端不存在；CI 注释阈值与实际不符；README 宣称的手动触发不存在 |
| **一致性** | ⚠️ 多处冲突 | 640 断点边界三套表述；触控目标 44px（文档）vs 40px（实现）；门禁清单三处不一致 |
| **可执行性** | ⚠️ 部分失效 | `check:viewport` 未接入 CI；`workflow_dispatch` 分支不可达；CONTRIBUTING 清单跑完仍可能被 CI 拦 |

**门禁实跑结果**（本次评审实测）：

| 门禁 | 结果 |
| --- | --- |
| `npm run i18n:check:strict` | ✅ 通过（src 148 文件无硬编码中文） |
| `npm run check:breakpoints` | ✅ 通过 |
| `npm run check:viewport` | ✅ 通过（无裸 `100vh`） |
| `npm run a11y:contrast` | 未复跑（本轮无样式改动） |

---

## 三、问题清单

### P0 — 阻断级：结论错误或安全声明失实

#### P0-1　`docs/fixes/goal-tracker.md` 头部结论与清单状态双向失真

**证据**

| 位置 | 内容 |
| --- | --- |
| `docs/fixes/goal-tracker.md:4` | 「完成：**全部 28 项源码落地** + 文档逐条留痕」 |
| `docs/fixes/goal-tracker.md:9` | `- [ ] P1-B（13）：S-5 / S-6 / I-1 / I-2 / I-13 / I-5 / I-8 / I-10 / F-1 / F-2 / F-3` |
| `docs/fixes/goal-tracker.md:10` | `- [ ] P2（6）：S-7 / S-8 / I-9 / I-12 / F-4 / F-5` |

**三重矛盾**

1. 头部称「全部 28 项落地」，但清单显示 **19 项未勾选**（P1-B 13 + P2 6）。
2. 标注「P1-B（13）」但只列出 **11 个编号**，缺 2 项。
3. **反向失真**：`S-8` 列在 P2 未完成项，但本次实测已修复 —— `src/views/CharacterEditorView.vue:1638-1639`、`src/views/SettingsView.vue:2386-2387`、`src/styles/layout.css:10-11` 均为合法的 `100vh` + `100dvh` 双写兜底，`check:viewport` 实测通过。

**影响**：任何依据该台账判断「Web 端跨端修复是否收口」的决策都会出错 —— 既可能误判为已完成而跳过验证，也可能重复修复已完成项。

**建议**：以 checklist 状态为唯一事实源修正头部结论；补勾 `S-8` 并注明验证方式；补齐 P1-B 缺失的 2 个编号；在台账顶部加一句「头部结论与清单冲突时，以清单为准」。

---

#### P0-2　Web 端无任何 CSP，但 README 与威胁模型均宣称"CSP 收紧"

**证据**

| 位置 | 内容 |
| --- | --- |
| `src-tauri/tauri.conf.json:34` | CSP 仅在此处定义（`script-src 'self'`），**属桌面端** |
| `index.html` | **无 CSP meta 标签**（全文无 `Content-Security-Policy`） |
| `vite.config.ts` | **无 CSP 注入** |
| 仓库全局 | **无部署侧 header 配置**（无 `_headers` / `netlify.toml` / `vercel.json`） |
| `README.md:138` | 「CSP 收紧：`script-src 'self'` 禁内联脚本，`freezePrototype` 开启」—— **未标注仅桌面端** |
| `docs/design/threat-model.md:52` | 风险「浏览器扩展/恶意网页读取 localStorage」的缓解措施列「CSP 收紧」 |

**影响**：威胁模型把「CSP 收紧」列为 Web 模式的缓解措施，但该控制**在 Web 端并不存在**。Web 端 XSS 的唯一防线是 `src/core/sanitize.ts` 的 DOMPurify 封装，无纵深防御。一旦某处误用 `v-html` 绕过净化，无第二道拦截。

**建议**
1. `README.md:138` 与 `docs/design/threat-model.md:52` 明确标注端归属（桌面端 CSP / Web 端暂无）。
2. 为 Web 端补 CSP：`index.html` meta 或托管侧响应头，至少 `script-src 'self'`、`object-src 'none'`、`base-uri 'self'`。
3. 补 CSP 时须放行现有外链字体（见 P2-2），或改为自托管字体。

---

#### P0-3　Web 生产环境无法使用本地/内网 LLM 端点，且全仓无任何说明

**证据**

| 位置 | 内容 |
| --- | --- |
| `src/api/openai-protocol.ts:53` | `if (!import.meta.env.DEV \|\| import.meta.env.MODE !== 'development') return url;` —— 生产构建**始终直连** |
| `vite.config.ts:52-56` | `localProxyPlugin` 仅实现 `configureServer` —— **dev-only**，生产构建无该中间件 |
| `vite.config.ts:14-16` | 注释自述：「第10条：本地/内网 API 被 CORS 拦截」 |
| `README.md` / `docs/` | 全仓**未检索到**关于"Web 生产模式下本地端点不可用"的说明 |

**影响**：Web 用户按 README 指引把 baseUrl 配为 `http://192.168.1.5:11434`（Ollama）时，dev 下正常、生产构建下被浏览器 CORS 拦截。失败无排查指引，属静默失效。

**建议**：在 README「快速开始」或新增「Web 端已知限制」小节显式声明：本地/内网 LLM 端点仅 dev 可用，Web 生产部署需自建反向代理（附最小配置示例），或改用桌面端。

---

### P1 — 结构性缺口：流程未闭环

#### P1-1　`check:viewport` 是死门禁：已实现但未接入任何流程

**证据**

| 位置 | 内容 |
| --- | --- |
| `package.json:19` | `"check:viewport": "node scripts/css-viewport-guard.mjs"` |
| `scripts/css-viewport-guard.mjs` | 脚本有效（实测通过，可检出裸 `100vh`） |
| `.github/workflows/ci.yml` | **无该步骤**（全文件无 `check:viewport`） |
| `README.md` / `CONTRIBUTING.md` | 门禁清单中**均无该命令** |

**影响**：`S-8`（裸 `100vh` 导致 iOS 动态视口遮挡）这一缺陷类**无自动拦截**。当前代码恰好合规，但任何回归都不会被 CI 拦住。评审对 S-8 的原始建议正是"加入 lint 规则禁止新增裸 `100vh`"——脚本写了，门禁没接。

**建议**：加入 `ci.yml` 的 `quality-gates` job（紧跟 `check:breakpoints`），并同步进 README 与 CONTRIBUTING 清单。

---

#### P1-2　`CONTRIBUTING.md` 本地门禁清单过时，且未区分端

**证据**

| 位置 | 内容 |
| --- | --- |
| `CONTRIBUTING.md:22-28` | 列 5 项：`lint` / `typecheck` / `test` / `i18n:check:strict` / `a11y:contrast` |
| 实际 CI 门禁 | 6 项：`lint` / `i18n:check:strict` / **`check:breakpoints`** / `a11y:contrast` / `test:coverage` / `build` |

**缺失**：`check:breakpoints`（已是 CI 门禁，贡献者按 CONTRIBUTING 跑完仍会被 CI 拦）、`check:viewport`、`test:coverage`。

**且未区分端**：`CONTRIBUTING.md` 的清单里没有 `tauri:build`，而 `README.md:89` 却把 `npm run tauri:build`（桌面端、耗时长）混入"本地开发门禁"。同一概念在两份文档里给出了不同的集合。

**建议**：以 `ci.yml` 的 `quality-gates` 为单一事实源重写；拆为「Web 端门禁（必跑）」与「桌面端门禁（改动 `src-tauri/` 时跑）」两节。

---

#### P1-3　`README.md` 门禁清单与 CI 实际链路不符

**证据**

| 位置 | 内容 | 问题 |
| --- | --- | --- |
| `README.md:92` | 「CI 串联 lint → i18n → coverage/build → 对比度 → Playwright e2e → Tauri 构建」 | **漏了 Breakpoint guard**；顺序与 ci.yml 实际（lint → i18n → breakpoints → contrast → coverage → build）不符 |
| `README.md:86` | 「覆盖率（statements ≥78 / branches ≥73）」 | 漏 `functions ≥78` / `lines ≥78`（`vitest.config.ts:34-39`） |
| `README.md:89` | 门禁清单含 `npm run tauri:build` | 属桌面端，且非 Web 端提交前必跑项 |
| `README.md:104-114` | 「目录结构（要点）」 | 未列 `e2e/`、`scripts/`、`artifacts/`；且把 E2E 归入 `tests/`（实际在 `e2e/`） |

**建议**：README 改为「完整门禁链见 `.github/workflows/ci.yml`」+ 按端分组的精简清单，避免与 CI 双维护。

---

#### P1-4　`workflow_dispatch` 分支不可达，README 宣称的"手动触发"不存在

**证据**

| 位置 | 内容 |
| --- | --- |
| `.github/workflows/ci.yml:3-9` | `on:` 仅含 `push`（branches + tags）与 `pull_request`，**无 `workflow_dispatch`** |
| `.github/workflows/ci.yml:161` | `if: ${{ github.event_name == 'workflow_dispatch' \|\| startsWith(github.ref, 'refs/tags/v') }}` |
| `README.md:92` | 「打 `v*` tag 或**手动触发**时产出签名安装包」 |

**影响**：`tauri-release` job 的 `workflow_dispatch` 分支永远不可达。README 描述的"手动触发发布"能力实际不存在。tag 路径仍可用。

**建议**：在 `on:` 补 `workflow_dispatch:`（并考虑补 `inputs` 以支持指定版本），或删除该 `if` 条件并修正 README 表述。二选一，但必须一致。

---

#### P1-5　`ci.yml` 覆盖率门禁注释与 step 名写 80%，实际阈值 78/73

**证据**

| 位置 | 内容 |
| --- | --- |
| `.github/workflows/ci.yml:53-54` | 注释：「vitest v8 provider, **80% 阈值**未达标则非零退出」；「Linux ... 80% 门禁正常生效」 |
| `.github/workflows/ci.yml:55` | step 名：`Test + coverage gate (80%)` |
| `vitest.config.ts:34-39` | 实际阈值：`statements: 78` / `branches: 73` / `functions: 78` / `lines: 78` |
| `README.md:86` | 写 78/73（与 vitest 一致） |

**影响**：CI 日志与 step 名误导排障者，且与 README 口径不一致。

**建议**：修正注释与 step 名为「coverage gate (78/73/78/78)」，或统一改为引用 vitest 配置的表述。

---

#### P1-6　Web / 移动端零 E2E 覆盖

**证据**

| 位置 | 内容 |
| --- | --- |
| `playwright.config.ts:31-38` | 仅 1 个 project：CI 用 `chromium` / 本地用 `msedge`，均为 `Desktop Chrome` device |
| `playwright.config.ts` | 无 `viewport` 设置 → 用 device 默认 1280×720 |
| `e2e/*.spec.ts`（7 个） | 全文件检索**无 `setViewportSize`、无 `viewport`** |
| 交付物 | 项目已上线 `BottomNav.vue`、抽屉布局、`env(safe-area-inset-*)`、640 断点、PWA 安装 —— 均无自动化验证 |

**影响**：移动端专属行为（底部导航显隐、抽屉遮罩层级、安全区垫高、640 边界布局）完全依赖人工截图核验（`scripts/ui-shot.mjs`）。这正是 `S-1`~`S-9` 一类样式缺陷能长期潜伏的原因。

**建议**：新增移动视口 project（如 `devices['Pixel 5']` / `devices['iPhone 13']`），至少覆盖 3 条：
1. `≤640` 下 `BottomNav` 显示、`NavRail` 卸载、5 个 tab 可切换且高亮正确；
2. 抽屉打开时遮罩层级正确（底部导航被压暗且点击拦截）—— 对应 S-4 的验收标准；
3. `≤640` 下主流程无横向溢出。

---

#### P1-7　移动端触控目标口径冲突：文档统一 44px，实现存在 40px

**证据**

| 位置 | 内容 | 口径 |
| --- | --- | --- |
| `docs/design/mobile-ui-design.md:57` | 「可点目标 ≥44×44px；间距 ≥8px」 | **44** |
| `docs/design/mobile-ui-design.md:165-166` | 「可点目标最小尺寸 44×44px」「图标按钮外衬 ≥44px 热区」 | **44** |
| `docs/design/mobile-ui-design.md:221` | 验收表：「可点目标 ≥44px」 | **44** |
| `docs/dev/mobile-pwa-plan.md:51,125` | 「可点击 ≥44px」 | **44** |
| `docs/fixes/cross-client-review-2026-09-07.md`（I-11） | 「提到 ≥44×44（引入 `--touch-min`）」 | **44** |
| `src/styles/tokens.css:137` | `--touch-min: 44px;` | **44** ✅ 已落地 |
| `src/styles/app-global.css:99-100` | `width/height: var(--touch-min)` | **44** ✅ 已使用 |
| **`src/components/layout/CharacterList.vue:535-550`** | 注释「§10.4 移动端触控目标：会话操作按钮 **≥40px**」；实现 `width/height: 40px`、`min-height: 40px` | **40** ❌ |

**问题**：唯一偏离点，且注释**误引 §10.4**（§10.4 实际写 44px）。偏离处为硬编码，未使用已存在的 `--touch-min` token。

**建议**：`CharacterList.vue` 的 4 处 40px 改为 `var(--touch-min)`；修正注释引用。可考虑在 `check:breakpoints` 或新增守卫中禁止触控尺寸硬编码。

---

#### P1-8　640 断点边界存在三套表述

**证据**

| 表述 | 出处 | 正确性 |
| --- | --- | --- |
| `≤640` 移动 / `641–1024` 平板 / `≥1025` 桌面 | `src/core/viewport.ts:9-11,14-27`、`docs/design/design-system-specification.md`、CSS 实测（`(max-width: 640px)` × 29 处、`(min-width: 641px)` × 2 处） | ✅ 基准 |
| `<640` 移动 / `≥640` 桌面 | `src/App.vue:43,45,330`、`src/components/mobile/BottomNav.vue:5`、`docs/dev/mobile-pwa-plan.md:64,66` | ❌ 差一 |
| `640–1024`（平板） | `docs/design/mobile-ui-design.md:150-151` | ❌ 与移动档在 640 重叠 |

**影响**：640px 恰好处在表述歧义上。`mobile-pwa-plan.md:64` 要求「`<640px` 显示 BottomNav、隐藏桌面侧栏；`≥640px` 相反」，而代码在 640px 时显示 BottomNav —— 计划与实现相差一档。`check:breakpoints` 只校验代码数值（L1/L4 同步），**不校验文档与注释措辞**。

**建议**
1. 以 `≤640 / 641–1024 / ≥1025` 为唯一表述，统一 `App.vue`、`BottomNav.vue` 注释与两份文档；
2. 在 `docs/design/design-system-specification.md` 标注该口径为**唯一表述来源**，其他文档引用而非复述；
3. 可选：在 `breakpoint-guard.mjs` 增加对文档/注释中 `640` 措辞的检查。

---

#### P1-9　`docs/dev/mobile-pwa-plan.md` 状态仍为"待执行"，但任务早已完成

**证据**

| 位置 | 内容 |
| --- | --- |
| `docs/dev/mobile-pwa-plan.md:4` | 「状态：**待执行**」 |
| `docs/dev/mobile-pwa-plan.md:112` | 该计划自身的任务 4.2：「核对 `docs/design/mobile-ui-design.md` 与实现一致，更新状态为"已实现"」 |
| 实现侧 | `vite-plugin-pwa` 已在 `devDependencies`；`VitePWA` 已配置于 `vite.config.ts:128-155`；`BottomNav.vue`、`src/core/mobile-nav.ts`、`tests/core/mobile-nav.test.ts` 均存在 |

**计划与实现的 2 处偏差**

| 计划要求 | 实际实现 | 判定 |
| --- | --- | --- |
| 任务 1.2 步骤 6：`includeAssets` 含 `pwa-192x192.png`、`pwa-512x512.png`、`apple-touch-icon.png` | `vite.config.ts:134`：`['pwa-icon.svg', 'apple-touch-icon.png']` | 偏差（PNG 移入 `manifest.icons`，且新增 SVG） |
| 任务 1.2 步骤 5：`workbox`「不缓存 `/v1/` 网关」 | `vite.config.ts:151`：`runtimeCaching: []` | 实现更严格（完全不启用运行时缓存） |

**建议**：状态更新为「已实现」；把 2 处偏差回写为「实现采用等效/更严格方案」并注明理由，或修正计划。该计划自身的收尾任务（4.2）从未执行，说明**计划类 SOP 缺少收口检查**。

---

#### P1-10　灾备 Runbook 未覆盖 Web 端特有失效模式

**证据**

| 位置 | 内容 |
| --- | --- |
| `docs/dev/data-backup-restore.md:11` | ✅ 已正确区分：「Tauri 桌面为文件系统，**Web 模式为 IndexedDB**」 |
| `docs/dev/data-backup-restore.md:107` | 备份格式示例仅给 `"sourceEnv": "tauri"`，**无 Web 示例** |
| `docs/dev/data-backup-restore.md:140` | 自述「⏳ 自动化灾备 E2E 演练（可选后续）」，即 `backup-restore.spec.ts` **未实现** |
| 全仓检索 | **无 `navigator.storage.persist()` 调用**（`src/` 零命中） |

**Web 端特有风险（文档完全未提及）**

1. **IndexedDB 无持久化授权**：未调用 `navigator.storage.persist()`，浏览器在存储压力下可自动驱逐该源的数据。
2. **Safari 7 天清理策略**：未持续访问的站点，IndexedDB 可能被系统清除。
3. **配额限制**：IndexedDB 受源配额约束，角色卡 + 对话历史 + 向量缓存增长后可能写入失败。
4. **PWA 场景放大风险**：用户把 Web 应用当"安装的应用"使用，预期数据长期存在，但实际保障弱于桌面端。

**影响**：Web/PWA 用户可能在无预警、无 SOP 指引的情况下丢失全部角色卡与对话记录，且该路径**无自动化验证**。

**建议**
1. `docs/dev/data-backup-restore.md` 新增「Web 端数据持久性」章节：说明驱逐风险、`persist()` 授权现状、建议的定期导出频率；
2. 在 Web 端首次进入时调用 `navigator.storage.persist()`（并在设置页展示「持久化：已授权/未授权」状态）；
3. 补 `e2e/backup-restore.spec.ts`，让灾备路径从"文档化"升级为"持续验证"。

---

### P2 — 打磨项

#### P2-1　`docs/design/threat-model.md` 缺 Web 端威胁面

**已覆盖**（✅）：`threat-model.md:11,13,41` 已将 IndexedDB 列为资产与写入完整性路径。

**未覆盖**：Service Worker 缓存污染 / 陈旧内容、PWA 离线攻击面、第三方外链（字体）请求泄漏 IP/Referer、IndexedDB 可用性风险（见 P1-10）。

**建议**：新增「Web / PWA 端威胁面」小节；同时修正 `threat-model.md:52` 中「CSP 收紧」这一 Web 端不存在的缓解措施（见 P0-2）。

---

#### P2-2　`index.html` 外链 Google Fonts 的 Web 端影响未评估

**证据**

| 位置 | 内容 |
| --- | --- |
| `index.html:14-19` | `preconnect` 至 `fonts.googleapis.com` / `fonts.gstatic.com` + `stylesheet` 引入 Playfair Display / Noto Serif SC |
| `vite.config.ts:148-149` | SW `globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}']` —— 仅本地资源，**字体不在预缓存** |

**Web 端影响**
1. 中国大陆网络环境下 Google Fonts 通常不可达 → 首屏样式阻塞/超时（已有系统衬线回退，功能不受影响）；
2. PWA 离线场景下字体必然回退；
3. 若按 P0-2 补 CSP，须为 `style-src` / `font-src` 放行这两个域，扩大 CSP 面。

**建议**：自托管字体（体积可控，且消除第三方请求与 CSP 放行需求），或在文档中显式记录为「可接受降级」并纳入 CSP 白名单设计。

---

#### P2-3　i18n 无浏览器语言自动检测

**证据**：`src/i18n/index.ts:33` —— `export const localeRef = ref<Locale>('zh');`，首访固定中文；全文件无 `navigator.language` 读取。

**影响**：Web 端面向公网，英文用户首次访问即遇到中文界面，需手动切换。

**建议**：首访时读取 `navigator.language` 作为兜底（settings 已有持久化值时优先使用用户选择，不覆盖）。

---

#### P2-4　`S-1` 的 `!important` 治理未达评审设定目标

**证据**

| 位置 | 内容 |
| --- | --- |
| `docs/fixes/cross-client-review-2026-09-07.md`（S-1 建议） | 「改完后 `responsive.css` 的 `!important` 数量应**降至个位数**，并在 CI 加一条"禁止 `!important` 增量"的检查」 |
| 实测 | `src/styles/responsive.css` 仍有 **18 处** `!important`；全 `src/` **47 处** |
| `ci.yml` | 无 `!important` 相关检查 |

**建议**：`goal-tracker.md` 中把 `S-1` 标注为「部分完成（旧 `.nav-rail` 底部化规则已清理，`!important` 治理未达标）」；补门禁或正式调整目标值。

---

#### P2-5　`I-5` 触屏 hover 粘滞未修复

**证据**

| 项 | 数值 |
| --- | --- |
| 裸 `:hover` 规则总数 | **193 处** |
| 含 `@media (hover: hover)` 守卫的文件数 | **1 个**（`MessageBubble.vue`） |

**说明**：`I-5` 在 `goal-tracker.md` 中列于 P1-B 未完成项，**台账状态与实际一致**（此为台账准确的例证）。

**建议**：按评审原方案批量包裹 `@media (hover: hover) and (pointer: fine)`，并对"hover 才显形"的交互在 `@media (hover: none)` 下给常显 fallback。

---

#### P2-6　「评审建议 → 门禁」的转化链缺失（系统性）

**证据**：`cross-client-review-2026-09-07.md` 至少提出 5 项"加检查项/门禁"建议：

| 评审建议 | 是否转为门禁 |
| --- | --- |
| S-10：断点单一来源守卫 | ✅ 已落地（`check:breakpoints`，接入 ci.yml） |
| S-1：禁止 `!important` 增量 | ❌ 无 |
| S-8：禁止裸 `100vh` | ⚠️ 脚本已写（`css-viewport-guard.mjs`）但**未接入 CI**（见 P1-1） |
| I-5：hover 守卫统一 | ❌ 无 |
| I-7：移动端可编辑控件字号 ≥16px | ❌ 无 |
| I-6：三种 IME 回归 | ❌ E2E 无 IME 用例 |

**转化率：1/6**。

**影响**：评审产出的"防回归"措施绝大多数停留在文档层，同类缺陷可静默复发。这是本次评审识别出的**最根本的 SOP 缺口** —— 不是某个文档写错了，而是缺少一个把「评审结论」变成「强制门禁」的流程环节。

**建议**：在 `docs/other/项目文档结构.md` 或 `CONTRIBUTING.md` 中确立规则 —— **每次评审收尾必须输出「建议 → 门禁」登记表**，逐条标注「已转门禁（附命令）/ 未转门禁（附理由）/ 不适用」，未填完不算评审完成。

---

## 四、Web 端 SOP 缺口地图

以下流程在 Web 端**完全缺失**（不是写错，是没写）：

| 缺口 | 说明 | 对应问题 |
| --- | --- | --- |
| **Web 端发布/部署 SOP** | 全仓无部署文档。唯一的发布路径是 `tauri-release`（桌面安装包）。Web 端无静态托管目标、无 base path 约定、无 SW 更新与回滚流程 | P1-4 相关 |
| └ **✅ 已于 2026-09-20 补齐** | 新增 `docs/dev/web-deployment-sop.md`：部署前验证清单（含 `csp:audit` 运行时审计）、构建产物结构实测数据、6 项硬性要求（HTTPS / `frame-ancestors` 响应头 / **`.wasm` MIME** / SPA 回退排除 / 缓存策略 / 剔除 source map）、5 类托管目标的具体配置（Nginx / Caddy / Vercel / Netlify / 对象存储+CDN）、12 项部署后验证清单、8 个常见坑、回滚流程。**采用「目标无关」写法**：硬性要求与验证清单不依赖具体托管方，配置示例覆盖主流目标，故无需先确定托管目标即可落地 | — |
| **Web 端 CSP 策略** | 仅有桌面端 CSP | P0-2 |
| **Web 端数据持久性保障** | 无 `persist()` 申请，灾备文档无预警 | P1-10 |
| **移动视口 E2E** | 零覆盖 | P1-6 |
| **Web 端已知限制清单** | 本地/内网端点、外链字体、IndexedDB 配额等均无集中说明 | P0-3 / P2-2 |
| **「评审建议 → 门禁」登记流程** | 转化率 1/6 | P2-6 |

> **缺口收敛进度（2026-09-20 更新）**：上表 6 项**已全部落地** —— Web 端 CSP（第三批）、Web 端数据持久性保障（第三批）、移动视口 E2E（第二批）、Web 端已知限制清单（第三批，见 README）、**Web 端发布/部署 SOP（2026-09-20，新增 `docs/dev/web-deployment-sop.md`，采用目标无关写法故无需先定托管目标）**；「评审建议 → 门禁」登记流程属第四批（P2-6）。
>
> **同批关闭的遗留验证项**：第三批登记的「本地模型路径未经运行时验证」已于 2026-09-20 用真实浏览器在生产构建（含真实 CSP）下实测关闭 —— `WebAssembly.compile` 与 `Worker(blob: URL)` 均通过、`securitypolicyviolation` 0 条，证明 CSP 放行清单对 onnxruntime-web / WebLLM 够用。该探针已并入 `npm run csp:audit`，成为可复现的例行审计项。

---

## 五、优化建议（按执行顺序）

### 第一批：修正失实声明（当天可完成，零风险）

> **执行状态：✅ 已完成（2026-09-18 14:45–14:55）**。5 项全部落地，详见各条后的「已完成」标注。附带修复 1 项本报告未预见的回归（`npm run lint` 被目录迁移打断，见第六节末行 + `MIGRATION_LOG.md` 第十节）。
> 验证：`lint` 0 error · `i18n:check:strict` · `check:breakpoints` · `check:viewport` · `a11y:contrast`（0 项未达 AA）· `typecheck` 0 error · 相关测试 72 passed。

1. 修正 `docs/fixes/goal-tracker.md` 头部结论与 `S-8` 状态、补齐 P1-B 编号 —— **P0-1** ✅ 已完成（另修正：`P1-B（13）` 为计数笔误，实为 11 项；清单按 fixlog 全量补勾）
2. `README.md:138` 与 `docs/design/threat-model.md:52` 标注 CSP 的端归属 —— **P0-2** ✅ 已完成
3. 修正 `ci.yml:53-55` 的 80% → 78/73/78/78 —— **P1-5** ✅ 已完成
4. 修正 `CharacterList.vue` 的 40px → `var(--touch-min)` 与错误注释 —— **P1-7** ✅ 已完成
5. `docs/dev/mobile-pwa-plan.md` 状态改为「已实现」并回写 2 处偏差 —— **P1-9** ✅ 已完成

### 第二批：补齐门禁（本迭代）

> **执行状态：✅ 已完成（2026-09-18 14:55–15:05）**。
> 验证：`lint` 0 error · `i18n:check:strict` · `check:breakpoints` · `check:viewport` · `typecheck` 0 error · 移动视口 E2E **3 passed** · 桌面 project 抽验通过。
> `quality-gates` 由 6 道扩为 7 道（新增 Viewport guard）。

6. `check:viewport` 接入 `ci.yml` —— **P1-1** ✅ 已完成（紧随 `check:breakpoints`，命名 `Viewport guard`）
7. 重写 `CONTRIBUTING.md` 门禁清单，按端分组 —— **P1-2** ✅ 已完成（拆为「Web 端必跑」「桌面端（改 `src-tauri/` 时）」「端到端」三节，并注明以 `ci.yml` 为单一事实源）
8. `README.md` 门禁清单与 CI 对齐（或改为引用 ci.yml） —— **P1-3** ✅ 已完成（补 `functions/lines` 阈值；`tauri:build` 归入桌面端；CI 链路补 Breakpoint/Viewport guard 并按实际顺序；目录结构补 `e2e/`、`scripts/`、`docs/`、`artifacts/` 并修正 E2E 归属）
9. 补 `workflow_dispatch` 或删除该条件 —— **P1-4** ✅ 已完成（在 `on:` 补 `workflow_dispatch`，并注明手动触发时 `ref_name` 为分支名的注意事项）
10. 新增移动视口 Playwright project（≥3 条用例） —— **P1-6** ✅ 已完成（新增 `mobile-chromium`/`mobile-msedge` project，`devices['Pixel 5']`；新增 `e2e/mobile/mobile-layout.spec.ts` 覆盖全部 3 条建议用例；桌面 project 以 `testIgnore: '**/mobile/**'` 排除该目录，避免移动视口下重复执行桌面用例）

> **执行期发现（非缺陷，属测试设计陷阱）**：移动用例「抽屉打开时遮罩层级正确」初版探测点取底部导航**几何中心**（x≈196），而左抽屉宽 280px，动画收敛后该点实际落在抽屉（z70）之上，点击命中的是抽屉而非遮罩，导致用例误报失败。经 `elementFromPoint` 取证确认遮罩确实覆盖底部导航未被抽屉占据的区域（**S-4 已真闭环**），遂将探测点改为最右侧 tab（x≈354）并补 `transform` 收敛等待。结论：该失败是**用例缺陷**，不是产品缺陷。

### 第三批：补 Web 端安全与数据保障（下一迭代）

> **执行状态：✅ 已完成（2026-09-18 15:35–16:10）**，另附 1 项报告未列的加固（`check:csp` 契约守卫）。
> 验证：`lint` · `i18n:check:strict`（149 文件）· `check:breakpoints` · `check:viewport` · `check:csp` · `a11y:contrast` · `typecheck` · 全量单测 · `csp:audit` 运行时审计（8 路由 0 违规 + 负向对照确认 CSP 被强制执行）· `e2e/backup-restore.spec.ts` 通过。

11. 为 Web 端补 CSP，并同步规划字体自托管 —— **P0-2 / P2-2** ✅ 已完成（CSP 部分）
    - 实现方式：`vite.config.ts` 新增 `webCspPlugin()`，**仅生产构建 + 非 Tauri** 时注入 `<meta>` CSP（12 条指令）。Tauri 不注入（避免与 `tauri.conf.json` 叠加），dev 不注入（避免打断 HMR）
    - 放行清单（每条对应实际能力需求）：`'wasm-unsafe-eval'`（onnxruntime-web / WebLLM 编译 wasm）、`worker-src blob:`（ort 的 blob worker）、`style-src 'unsafe-inline'`（Vue 运行时样式注入）、Google Fonts 两域、`connect-src https:`（用户自定义端点）
    - 运行时验证：真实浏览器加载生产构建的 8 条路由，**CSP 违规 0**；负向对照（注入内联脚本）确认脚本**未执行**且产生 `script-src-elem` 违规 —— 证明 CSP 被浏览器**真正执行**，而非仅存在于 HTML
    - 新增 `npm run check:csp`（`scripts/csp-guard.mjs`）并接入 CI（紧跟 Build）：静态校验构建产物含 CSP、关键指令齐备、`script-src` 未被 `'unsafe-eval'`/`'unsafe-inline'` 削弱、无内联 `<script>`。已做正负向自测（移除 meta / 削弱 script-src 均能被拦下）
    - 新增 `npm run csp:audit`（`scripts/csp-audit.mjs`）：运行时审计工具，**手动诊断用、未接入 CI**（需构建产物 + 静态服务器 + 浏览器三件套，接入会显著拉长门禁；「CSP 被静默移除/削弱」这一主要回归风险已由静态守卫覆盖）
    - ⏳ **字体自托管仍未实施**（本项只完成「规划」）：见下方第 3 条说明
12. 补 `navigator.storage.persist()` 与设置页持久化状态展示 —— **P1-10** ✅ 已完成
    - 新增 `src/core/storage-persistence.ts`（模块级单例 ref，参照 `viewport.ts` 模式）：`isPersistSupported` / `getPersistState` / `requestPersistentStorage` / `initStoragePersistence` / `refreshStoragePersistence`；不支持或抛错时返回 `'unsupported'` / `'unknown'`，**不向上抛**（持久化是增强能力，失败不得阻断启动）
    - `App.vue` 启动时按端分流：仅 `getStorageEnv() === 'web'` 才申请（Tauri 走文件系统，无此概念）
    - 设置页新增「数据持久性（Web / PWA）」区块：展示 已授权 / 未授权 / 不适用 / 未知 四态 + 风险说明 + 「重新申请授权」按钮
    - i18n 新增 10 个键（zh/en 对齐）；新增 `tests/core/storage-persistence.test.ts`（**16 例**，覆盖支持性探测、四态、不重复申请、异常兜底、模块级状态同步）
13. 在 README 新增「Web 端已知限制」小节 —— **P0-3** ✅ 已完成
    - 5 个子节：① 本地/内网 LLM 端点仅 dev 可用（含 Nginx 反向代理最小示例、`OLLAMA_ORIGINS`、改用桌面端三条出路）；② CSP 现状与 meta 形式的限制（`frame-ancestors` 等须托管侧响应头）；③ 外链字体在部分网络环境不可用；④ IndexedDB 数据持久性风险与设置页入口；⑤ PWA 缓存与更新行为
    - 同步修正 `docs/design/threat-model.md`：新增「CSP(Web 端)」防护行，并把第 4 节「CSP 收紧」这一**已不再成立**的表述改为 Web 端已补 meta CSP 但 `frame-ancestors` 需托管侧补充
    - 同步修正 `README.md` 隐私与安全段：CSP 改为「双端分别定义」，XSS 改为「CSP + DOMPurify 纵深防御」
14. 实现 `e2e/backup-restore.spec.ts` —— **P1-10** ✅ 已完成
    - 覆盖完整闭环：造数据 → 导出（校验文件名契约 `ai-roleplay-backup-YYYY-MM-DD.json` 与内容含该数据）→ 删除数据 → 导入同一备份 → 断言「导入结果」弹窗出现（非静默成功）→ 列表确认数据已还原
    - 陷阱记录：设置页各分类以 `v-show` 切换，数据管理区默认不可见，须先点「数据」分类；备份区用 `.data-mgmt-block` + 小节标题定位，避免与页面内其它 `input[type=file]` 冲突

> **字体自托管（P2-2）为何只完成「规划」**：Noto Serif SC 为 CJK 字体，自托管需处理 Google 的分片 `unicode-range` 子集（约上百个 woff2），或引入体积达数 MB 的整包，属独立工作量；且当前外链字体的失效模式是**优雅降级**（回退系统衬线，功能不受影响）。故本批先以 CSP 放行两个 Google 域收口，自托管列为后续事项，届时可一并收窄 `style-src` / `font-src`。

### 第四批：口径统一与流程固化

15. 统一 640 断点表述为 `≤640 / 641–1024 / ≥1025`，并在 `design-system-specification.md` 标注为唯一来源 —— **P1-8**
16. `threat-model.md` 补 Web/PWA 威胁面 —— **P2-1**
17. i18n 首访读取 `navigator.language` —— **P2-3**
18. 确立「评审建议 → 门禁」登记表规则 —— **P2-6**
19. 明确 `S-1` 为部分完成，补 `!important` 门禁或调整目标 —— **P2-4**
20. 批量修复 `I-5` hover 守卫 —— **P2-5**

---

## 六、评审方法与被证伪的假设

为保证结论可复核，记录本次评审中**经实测被推翻**的初步假设（避免后续误传）：

| 初步假设 | 实测结论 |
| --- | --- |
| `CharacterEditorView.vue:1638`、`SettingsView.vue:2386` 的 `100vh` 是 S-8 未修复的残留 | ❌ **假设错误**。两处均为合法的 `100vh` + `100dvh` 双写兜底，`check:viewport` 实测通过。`S-8` 实际**已修复** |
| `storage-factory.ts` 静态引入 `TauriFSAdapter` 会把 Tauri 插件代码打进 Web 包体 | ❌ **假设错误**。`@tauri-apps/plugin-fs` / `plugin-dialog` / `api/core` 全部使用动态 `import()`，已正确代码分割，不在 Web 首屏包体内 |
| Web 生产构建会因 `toDevProxyUrl` 未加环境守卫而请求 `/llm-proxy/` 导致 404 | ❌ **假设错误**。`openai-protocol.ts:53` 有 `import.meta.env.DEV` 守卫，生产构建始终直连。真实问题转为 P0-3（限制无文档说明） |
| P0-1 中「清单显示 **19 项未勾选**」与「`P1-B（13）`**缺 2 个编号**」 | ⚠️ **部分错误**（2026-09-18 修复期复核）。① 实际未勾选框为 **11 个**（P1B-7~11 + P2-1~6）；"19" 是按汇总行 `P1-B（13）+ P2（6）` 相加所得，而汇总行本身失真，属**以失真数据推算失真数据**。② `P1-B（13）` 是**计数笔误**：第 9 节批次表（§9.3）实列 11 项（S-5/S-6/I-1/I-2/I-13/I-5/I-8/I-10/F-1/F-2/F-3），并非漏列 2 个编号，总数 28（5+6+11+6）不变。③ 经核对 §10.1 fixlog（26 条 ✅ 记录 + I-13/I-12 随项闭合）并逐项代码验证，**28 项实际全部已落地**，故头部「全部 28 项源码落地」为**真**。P0-1 的结论方向（台账失真）成立，但失真点是**逐条清单未同步 fixlog**，而非头部虚报。已按此修正 `docs/fixes/goal-tracker.md` |
| 「`npm run lint` 属可用门禁」 | ❌ **假设错误**（2026-09-18 修复期实测）。目录整理把 `dist-*`/`coverage-ci` 快照移入 `artifacts/` 后，`eslint.config.js` 中按旧根路径逐条枚举的 `ignores` 失效，`npm run lint` 报 **78233 errors**（扫描到构建产物），`quality-gates` 第 1 步实际已被打断。本报告第一节曾把 `CONTRIBUTING.md` 的 lint 列为有效门禁，未实测其可跑性。已修复（`ignores` 收敛为 `artifacts/**`）并记录于 `MIGRATION_LOG.md` 第十节 |

**取证方式**：所有结论均基于文件行号引用与命令实跑（`npm run check:viewport`、`check:breakpoints`、`i18n:check:strict`、`grep` 全仓检索）。未读取任何密钥文件内容。

---

## 七、评审建议 → 门禁 转化登记表（P2-6 规则的实际落地）

> 本表即为 P2-6 建议确立的流程规则的**首个实例**。规则见 `CONTRIBUTING.md`「评审与门禁约定」：任何评审收尾必须输出本表，逐条标注归宿，**未填完不算评审完成**。
>
> 完成时间：2026-09-18（四批修复全部收口后）。

### 7.1 转化结果

| # | 评审建议 | 归宿 | 命令 / 理由 |
| --- | --- | --- | --- |
| 1 | S-10 断点单一来源守卫 | **已转门禁** | `npm run check:breakpoints`（已在 `ci.yml`） |
| 2 | S-8 禁止裸 `100vh` | **已转门禁** | `npm run check:viewport` —— 此前脚本已写但**未接入 CI**，第二批补齐 |
| 3 | S-1 禁止 `!important` 增量 | **已转门禁（棘轮）** | `npm run check:important`（第四批新增）—— 基线锁定 46 处，只许降不许升 |
| 4 | I-5 hover 守卫统一 | **已转门禁** | `npm run check:hover`（第四批新增）—— 184 条规则已包裹 + 6 条组合规则拆分 |
| 5 | P0-2 Web 端无 CSP | **已转门禁** | `npm run check:csp`（第三批新增，静态契约，在 `ci.yml`）+ `npm run csp:audit`（运行时审计，手动） |
| 6 | P1-6 移动视口零 E2E 覆盖 | **已转门禁（E2E 用例）** | `npm run test:e2e` —— 新增 `mobile-chromium`/`mobile-msedge` project + 3 条用例 |
| 7 | P1-10 灾备路径无自动化验证 | **已转门禁（E2E 用例）** | `npm run test:e2e` —— 新增 `e2e/backup-restore.spec.ts` |
| 8 | P2-3 i18n 无浏览器语言检测 | **未转独立门禁** | 已实现 `detectLocale()` + 6 例单测；**单测本身即回归防线**，无需额外门禁命令。另有 `e2e/i18n-locale.spec.ts`（`test.use({ locale: 'en-US' })`）在 E2E 层覆盖英文分支 |
| 9 | P1-8 640 断点表述三套 | **未转门禁** | 文档与注释表述已统一（`≤640 / 641–1024 / ≥1025`，唯一来源标注于 `design-system-specification.md §8`）；但 `check:breakpoints` 只校验**代码数值**（L1/L4 同步），**不校验文档措辞**。若门禁化需引入文档文本检查，收益低、误报高，暂不转 |
| 10 | I-7 移动端可编辑控件字号 ≥16px | **未转门禁** | 实现侧已有全局规则（`app-global.css` ≤640 块内 `input/textarea/select { font-size: 16px }`）。转门禁需静态扫描 CSS 声明；**建议与 I-5 守卫合并为「移动端 CSS 约定守卫」时一并纳入** |
| 11 | I-6 三种 IME 回归 | **已转门禁（单测用例）** | `npm run test` —— 新增 `tests/views/chat-ime.test.ts`（5 例）：`isComposing` / `keyCode=229` 组词中不发送、组词完成正常发送并清空输入框、Shift+Enter 换行不发送、非 Enter 不发送。**已做负向自测**：临时移除 `ChatMain` 的 I-6 守卫后，恰好那 2 例 IME 用例失败、其余 3 例仍通过，证明测试真正钉住了守卫。未做 E2E（模拟 `compositionstart/update/end` 成本高且与单测覆盖重叠） |
| 12 | P1-2 / P1-3 门禁清单过时 | **不适用** | 属文档一致性问题，已通过「单一事实源 + 按端分组引用」从根上消除重复源，无常驻回归面 |
| 13 | P1-4 `workflow_dispatch` 不可达 | **不适用** | 属一次性配置错误，已修；YAML 语法由 GitHub 自身校验，无常驻回归面 |
| 14 | P2-6 本登记表规则 | **已转流程** | 写入 `CONTRIBUTING.md`「评审与门禁约定」+ `docs/other/项目文档结构.md` 第四节；本表为首个实例 |

### 7.2 转化率

**口径一：P2-6 原始清单的 6 项「加检查项/门禁」建议**（即本节 7.1 表中被点名的那 6 条）

| 建议 | 修复前 | 修复后 |
| --- | --- | --- |
| S-10 断点守卫 / S-1 `!important` / S-8 裸 `100vh` / I-5 hover / I-6 IME / I-7 控件字号 | 1 / 6（仅 S-10） | **5 / 6**（余 I-7 未转，理由见上表第 10 行） |

**口径二：本报告全部 14 条建议的归宿**（7.1 表全量）

| 归宿 | 数量 | 条目 |
| --- | --- | --- |
| 已转门禁（命令） | **8** | 1 S-10、2 S-8、3 S-1、4 I-5、5 P0-2、6 P1-6、7 P1-10、11 I-6 |
| 已转流程 | 1 | 14 P2-6 本登记表规则 |
| 未转独立门禁（已有单测防线） | 1 | 8 P2-3 |
| 未转门禁（附理由） | 2 | 9 P1-8 文档措辞、10 I-7 控件字号 |
| 不适用 | 2 | 12 P1-2/P1-3、13 P1-4 |
| **合计** | **14** | 归宿明确率 14 / 14 |

### 7.3 门禁链现状

`quality-gates` 由修复前的 **6 道**扩为 **10 道**：

```
lint → i18n strict → 断点守卫 → 视口守卫 → hover 守卫 → !important 守卫
     → 对比度审计 → 覆盖率(78/73/78/78) → 构建 → CSP 守卫
```

另有独立 job：E2E（桌面 + 移动双 project）、Tauri 编译、Tauri 发布。

> **门禁治理提示**：其中 4 道（断点 / 视口 / hover / !important）都是「CSS 约定守卫」，各自独立脚本。当前每道为毫秒级静态扫描，成本可接受；若后续继续增加，建议合并为单一 `check:css-conventions` 入口以减少 `quality-gates` 的步骤数量，同时保留各自的失败信息。

---

*本报告最初为只读评审产物（第一~三节为评审时的原始结论，未作删改）；第四~七节为四批修复执行后追加的状态与登记表。报告位置：`docs/fixes/web-sop-review-2026-09-18.md`（`docs/` 依项目既有约定由 `.gitignore` 排除，不入仓库）。*

