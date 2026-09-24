# 参与贡献（Contributing）

感谢你愿意为 **AI 酒馆** 贡献！无论报告 Bug、改进文档，还是提交代码，都欢迎。

## 🙏 特别致谢

本项目建立在以下优秀的开源技术之上，向它们的作者与社区致敬：

- **[Vue.js](https://github.com/vuejs/core)** — 前端 UI 框架
- **[Tauri](https://github.com/tauri-apps/tauri)** — 桌面应用壳（含自动更新/托盘/快捷键）
- **[SillyTavern](https://github.com/SillyTavern/SillyTavern)** — 本项目基于其角色扮演聊天架构
- **[Vite](https://github.com/vitejs/vite)** — 前端构建与开发服务器
- **[Rust](https://github.com/rust-lang/rust)** — 桌面端系统编程语言

## 🚀 贡献流程

1. **Fork** 本仓库到你的账号。
2. 创建特性分支：`git checkout -b feat/你的特性` 或 `fix/你的修复`。
3. 开发时遵循现有代码风格与目录约定。
4. **本地门禁全绿**后再提交。门禁清单以 `.github/workflows/ci.yml` 的 `quality-gates` job 为**单一事实源**，按端分组如下：

   **Web 端门禁（改动 `src/`、`public/`、`index.html` 等前端资源时必跑）**

   ```bash
   npm run lint               # ESLint（0 error 才通过）
   npm run i18n:check:strict  # i18n 严格扫描（无硬编码中文）
   npm run check:css-conventions  # CSS 约定守卫（5 项合一：断点单一来源 / 动态视口 / 触屏 hover / !important 棘轮 / 可编辑控件字号 I-7）
   npm run a11y:contrast      # 无障碍对比度（≥ AA 4.5:1）
   npm run test:coverage      # Vitest + 覆盖率门禁（statements 78 / branches 73 / functions 78 / lines 78）
   npm run build              # vue-tsc 类型检查 + vite 生产构建
   npm run check:csp          # Web 端 CSP 契约守卫（含第三方字体 CDN 与字体镜像完整性校验，须在 build 之后跑）
   ```

   **Runtime / 数据库门禁（改动 `src/runtime/`、`migrations/` 或数据库 Schema 时必跑）**

   ```bash
   npm run runtime:db:schema:check  # 迁移文件与权威 Schema 文档漂移检查
   npm run typecheck                # Runtime 类型与契约检查
   ```

   改动 Runtime 事务、群聊或 Schema 时，除单元测试外还需真实 PostgreSQL 验证。CI 的 `runtime-postgres` job 已用 `postgres:16-alpine` service 自动执行；本地复现命令如下：

   ```bash
   # macOS / Linux / CI
   RUNTIME_PG_TEST_URL=postgresql://... RUNTIME_PG_APPLY_SCHEMA=1 \
     npm run test -- --run tests/runtime/postgres-runtime.integration.test.ts tests/runtime/postgres-group.integration.test.ts

   # Windows PowerShell
   $env:RUNTIME_PG_TEST_URL='postgresql://...'
   $env:RUNTIME_PG_APPLY_SCHEMA='1'
   npm run test -- --run tests/runtime/postgres-runtime.integration.test.ts tests/runtime/postgres-group.integration.test.ts
   ```

   **桌面端门禁（仅改动 `src-tauri/` 时需额外跑，耗时较长）**

   ```bash
   npm run tauri:build        # 桌面端编译验证（需 Rust 工具链）
   ```

   **端到端（涉及路由 / 布局 / 主题 / 交互链路时跑）**

   ```bash
   npm run test:e2e           # Playwright（本地复用系统 Edge；CI 用自带 chromium）
   ```

   > 快速迭代时，`npm run typecheck` 可替代 `npm run build` 单独做类型检查；`npm run test` 可替代 `npm run test:coverage` 跳过覆盖率统计。
   > 完整门禁链与顺序请直接查阅 `.github/workflows/ci.yml`，本清单不再复述阈值以外的细节。

   > **⚠️ 跑 E2E 前先清空 `test-results/`（沙箱环境重要）**
   > Playwright 启动时会清理 `test-results/`。在带「安全删除」保护的沙箱（如 WorkBuddy）里，
   > 删除按 **turn 累计计数**，触顶后本 turn 内所有删除均被拒（`SAFE_DELETE_BULK_REJECTED`），
   > Playwright 会因启动清理失败而整体无法运行。
   > **规避**：每次跑 E2E 之前，若 `test-results/` 存在，先
   > `mv test-results "artifacts/_tr_$(date +%s%N)"`（项目既有约定见 `MEMORY.md`）。
   > 目录不存在时 Playwright 的清理是 `force` 空操作，不消耗删除配额（已实测确认有效）。

   > **⚠️ 沙箱环境下门禁退出码不可信（本地复现要点）**
   > 带「安全删除」保护的沙箱（如 WorkBuddy）会拦截构建 / 覆盖率**启动期**的目录清理，
   > 使退出码**恒为 1**，但这并不代表门禁失败。本地复现请按下列方式判定：
   > - **构建**：改用 `npx vite build --emptyOutDir=false`（跳过清 `dist/`），退出码恢复可信；
   > - **覆盖率**：看**输出**而非退出码 —— 同时满足「无 threshold 类报错」+「用例全绿
   >   （`Tests N passed` 且 0 failed）」即通过；
   > - **E2E**：先按上条清走 `test-results/`，否则启动期清理失败会整体跑不起来。
   >
   > CI（干净 runner）不受影响，退出码可信。

   > **lint 基线口径**：当前实测 **0 error / 0 warning**。文档中曾记作「~50 warnings」或
   > 「0 error / 2 warning」，那是早于多轮修复的旧值 —— **以 0 warning 为基线**，
   > 出现任何 error 或 warning 即为回归。

5. 提交信息遵循仓库既有风格（小步、明确，如 `feat(scope): describe`）。
6. 向 `master` 发起 **Pull Request** 并描述改动目的。

## 🧭 评审与门禁约定

### 门禁清单的单一事实源

所有门禁以 `.github/workflows/ci.yml` 的 `quality-gates` job 为准；`README.md` 与本文档只做**按端分组**的引用，不各自维护清单，避免双维护导致的漂移。

### 评审收尾必须输出「建议 → 门禁」登记表

任何评审（跨端评审、SOP 评审、安全评审等）收尾时**必须**附一张登记表，逐条标注每条建议的归宿：

| 归宿 | 要求 |
| --- | --- |
| **已转门禁** | 附可直接运行的命令（如 `npm run check:hover`） |
| **未转门禁** | 附明确理由（为何暂不转、何时再评估） |
| **不适用** | 附一句说明 |

**未填完不算评审完成。** 动因：本仓库实测该转化率一度仅 **1/6** —— 绝大多数防回归措施停留在文档层，同类缺陷会静默复发。登记表范例见 `docs/fixes/web-sop-review-2026-09-18.md` 的转化登记表。

### 新增门禁脚本的约定

1. 脚本放 `scripts/`，并在 `package.json` 暴露为 `check:*` 命令；
2. **必须接入 `ci.yml` 的 `quality-gates`** —— 脚本写了不接就是「死门禁」；
3. **必须做正负向自测**：正向通过 + 构造违规样本确认能被拦下（否则门禁形同虚设）；
4. 在 `README.md` 与本文档的门禁清单中登记；
5. 若规则涉及「存量尚未收敛」，用**棘轮（ratchet）策略**——锁定当前基线、只许降不许升，不要硬卡一个现状达不到的目标值；长期红着的门禁最终会被绕过。

## 💬 沟通

较大改动或新功能，建议先开 [Issue](https://github.com/zhuweib-design/ai-roleplay/issues) 讨论方向，再提交代码，以减少返工。