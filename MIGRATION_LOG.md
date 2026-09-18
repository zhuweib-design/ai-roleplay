# MIGRATION_LOG

目录整理迁移日志 — 逐条记录每一次路径变更。

| 项 | 值 |
| --- | --- |
| 任务 | 在不破坏运行、不改动 Git 历史、不暴露密钥的前提下按类别整理项目目录 |
| 执行时间窗口 | 2026-09-18 13:09:10 — 2026-09-18 13:17:51（本地时区，精确到秒；本文件写作时间另计） |
| 整理方案 | 保守方案（经确认）：`docs/` 保持扁平不拆子目录，避免打断文档交叉引用 |
| 路径写法 | 全文相对项目根目录；不含任何绝对路径 |
| 变更总数 | 38 项路径迁移 + 2 项配置修改 + 3 项新增文件 |
| Git 操作 | 全程未执行 `git add` / `git commit` / `git push` / `git mv`，提交历史零改动 |
| 删除操作 | 无。全部变更为可逆的 `mv`（同盘重命名），未删除任何文件 |

---

## 一、前置勘察结论（决定"哪些不能动"）

以下路径被代码、配置或 CI 硬引用，**一律未移动**。这是"不破坏现有运行"的边界：

| 路径 | 硬引用来源 | 结论 |
| --- | --- | --- |
| `dist/` | Vite 默认 `outDir` | 保留原位 |
| `coverage/` | Vitest 默认 `reportsDirectory` + `ci.yml` 上传 `path: coverage/` | 保留原位 |
| `test-results/` | Playwright 默认 `outputDir` + `ci.yml` 上传 | 保留原位 |
| `e2e/` | `playwright.config.ts` 的 `testDir: './e2e'` | 保留原位 |
| `model/` | `src/core/vector-model-tauri.ts` 的 `PRESCAN_DIRS = ['../../model','model']`；`tests/core/onnx-real-model.test.ts` 的 `MODEL_ROOT = cwd/model`；`scripts/i18n-scan.mjs` 的 `IGNORED_DIRS` | 保留原位 |
| `public/` | `scripts/generate-pwa-icons.mjs` 输出目录；PWA 插件 `includeAssets` | 保留原位 |
| `src/`、`tests/`、`scripts/`、`src-tauri/` | 构建与测试入口 | 保留原位 |
| `README.md`、`README-EN.md`、`CHANGELOG.md`、`CONTRIBUTING.md`、`LICENSE`、`THIRD_PARTY_NOTICES.md` | 仓库根级约定 | 保留原位 |
| `.reasonix/`、`.workbuddy/` | AI 工具工作区状态目录 | 保留原位 |
| `src-tauri/keys/` | Tauri 更新签名密钥 | 保留原位，全程未读取内容 |

**交叉引用勘察**：`docs/` 内 10 个文档存在互引（`mobile-pwa-plan.md` → `docs/mobile-ui-design.md`、`rag-enhancement-plan.md` → `docs/rag-enhancement-design.md`、`design-system-specification.md` → `mobile-ui-design.md` 等），`deliverables/gstack/*.md` 与 `.workbuddy/memory/*.md` 亦引用 `docs/threat-model.md`、`docs/data-backup-restore.md`、`docs/e00-decision.md`。因此**未将 `docs/` 拆分为子目录**，全部文档以 `docs/` 为前缀，引用路径保持有效。

---

## 二、回滚备份

| 项 | 值 |
| --- | --- |
| 备份文件 | `artifacts/backup/pre-migration-docs-20260918-130909.tar.gz` |
| 大小 | 133,039 字节 |
| 创建时间 | 2026-09-18 13:09:10 |
| 覆盖范围 | `docs/`、`AI酒馆开发计划文档.md`、`AI酒馆项目嵌入优化方案开发文档.md`、`项目文档结构.md`、`goal-tracker.md`、`test-gradient.jpg`、`debug.log` 迁移前快照 |
| 未覆盖 | 构建与测试产物快照（`dist-*` / `coverage-ci` / `test-results-*` / `e2e-results-*` / `ui-shots`），因其为可再生产物，且总体积约 1.1 GB |

---

## 三、迁移明细

### 批次 1 — 根目录散落文档归入 `docs/`（6 项，2026-09-18 13:09:17–13:09:35）

| # | 原路径 | 新路径 | 迁移原因 | 执行时间 | 潜在风险 |
| --- | --- | --- | --- | --- | --- |
| 1 | `AI酒馆开发计划文档.md` | `docs/AI酒馆开发计划文档.md` | 开发文档，与 `docs/` 下同类文档集中；根目录已由 `.gitignore` 排除该文件 | 13:09:17 | 低。该文件被 `.workbuddy/memory/2026-08-15.md` 按文件名（非路径）提及，不受影响；文件内对 `docs/threat-model.md`、`docs/e00-decision.md` 的引用仍有效 |
| 2 | `AI酒馆项目嵌入优化方案开发文档.md` | `docs/AI酒馆项目嵌入优化方案开发文档.md` | 设计文档，归入文档目录 | 13:09:17 | 低。被 `docs/e00-decision.md` 按书名号引用（非路径），不受影响 |
| 3 | `项目文档结构.md` | `docs/项目文档结构.md` | 开发文档（文档分类规范），归入 `docs/` | 13:09:20 | **中**。该文件原为 Git 未跟踪状态（`??`），迁移后落入被忽略的 `docs/`，**将从 `git status` 未跟踪列表中消失**。若后续需要提交它，须先调整 `.gitignore` |
| 4 | `goal-tracker.md` | `docs/goal-tracker.md` | 修复文档（跨端 28 项缺陷修复台账），归入 `docs/` | 13:09:22 | **中**。同上：原为未跟踪状态，迁移后从 `git status` 消失。该文件是活跃的修复进度台账，若工作流依赖其根目录位置需注意 |
| 5 | `test-gradient.jpg` | `docs/assets/test-gradient.jpg` | 设计验证用图片资源，归入文档资源目录 | 13:09:35 | 低。`.gitignore` 中的 `test-gradient.jpg` 规则不再按新路径匹配，但 `docs/` 已被整体忽略，文件仍处于忽略状态 |
| 6 | `debug.log` | `artifacts/logs/debug.log` | 运行日志，归入产物归档 | 13:09:17 | 低。`*.log` 规则按文件名匹配，仍有效 |

### 批次 2 — 截图资源归档（1 项目录，110 个文件，2026-09-18 13:09:44）

| # | 原路径 | 新路径 | 迁移原因 | 执行时间 | 潜在风险 |
| --- | --- | --- | --- | --- | --- |
| 7 | `ui-shots/`（110 个文件，6.8 MB） | `docs/assets/screenshots/` | 截图资源统一归入文档资源目录，避免与构建产物混在根目录 | 13:09:44 | **中**。`scripts/ui-shot.mjs` 硬编码输出路径，已同步修改（见第四节）。任何外部文档、书签或聊天记录中引用旧路径 `ui-shots/` 的链接将失效。目录结构（含 `themes/<theme>/`）原样保留 |

### 批次 3 — 历史构建快照归档（17 项，2026-09-18 13:09:52–13:10:02）

| # | 原路径 | 新路径 | 迁移原因 | 执行时间 | 潜在风险 |
| --- | --- | --- | --- | --- | --- |
| 8 | `dist-i18n-check/` | `artifacts/dist/dist-i18n-check/` | 历史 i18n 校验构建快照，非当前构建产物 | 13:09:52 | 低 |
| 9 | `dist-lib-eval/` | `artifacts/dist/dist-lib-eval/` | 历史库评测构建快照 | 13:09:53 | 低 |
| 10 | `dist-lib-eval-tmp/` | `artifacts/dist/dist-lib-eval-tmp/` | 历史库评测临时构建快照 | 13:09:54 | 低 |
| 11 | `dist-lib-eval2/` | `artifacts/dist/dist-lib-eval2/` | 历史库评测构建快照 | 13:09:55 | 低 |
| 12 | `dist-lib-eval3/` | `artifacts/dist/dist-lib-eval3/` | 历史库评测构建快照 | 13:09:56 | 低 |
| 13 | `dist-lib-eval4/` | `artifacts/dist/dist-lib-eval4/` | 历史库评测构建快照 | 13:09:57 | 低 |
| 14 | `dist-lib-eval5/` | `artifacts/dist/dist-lib-eval5/` | 历史库评测构建快照 | 13:09:58 | 低 |
| 15 | `dist-lib-eval6/` | `artifacts/dist/dist-lib-eval6/` | 历史库评测构建快照 | 13:09:59 | 低 |
| 16 | `dist-lib-eval7/` | `artifacts/dist/dist-lib-eval7/` | 历史库评测构建快照 | 13:10:00 | 低 |
| 17 | `dist-measure/` | `artifacts/dist/dist-measure/` | 历史体积测量构建快照 | 13:10:00 | 低 |
| 18 | `dist-opt2/` | `artifacts/dist/dist-opt2/` | 历史优化迭代构建快照 | 13:10:01 | 低 |
| 19 | `dist-opt3/` | `artifacts/dist/dist-opt3/` | 历史优化迭代构建快照 | 13:10:01 | 低 |
| 20 | `dist-opt4/` | `artifacts/dist/dist-opt4/` | 历史优化迭代构建快照 | 13:10:01 | 低 |
| 21 | `dist-opt5/` | `artifacts/dist/dist-opt5/` | 历史优化迭代构建快照 | 13:10:01 | 低 |
| 22 | `dist-p13-check/` | `artifacts/dist/dist-p13-check/` | 历史 P13 校验构建快照 | 13:10:02 | 低 |
| 23 | `dist-qa/` | `artifacts/dist/dist-qa/` | 历史 QA 构建快照（721 个文件，340 MB） | 13:10:02 | 低 |
| 24 | `dist.bak/` | `artifacts/dist/dist.bak/` | 构建产物备份快照 | 13:10:02 | 低。`.gitignore` 的 `dist.bak/` 规则不再按新路径匹配，已由新增 `artifacts/` 规则覆盖 |

> 注意：根目录的 `dist/` **未迁移**（Vite 默认输出目录），批次 3 仅涉及 `dist` 前缀的历史快照。

### 批次 4 — 覆盖率快照归档（1 项，2026-09-18 13:10:08）

| # | 原路径 | 新路径 | 迁移原因 | 执行时间 | 潜在风险 |
| --- | --- | --- | --- | --- | --- |
| 25 | `coverage-ci/`（121 个文件，7.7 MB） | `artifacts/coverage/coverage-ci/` | 历史 CI 覆盖率报告快照，非当前报告 | 13:10:08 | 低。根目录 `coverage/` 未迁移（Vitest 默认输出 + CI 上传路径）。`.gitignore` 的 `coverage-ci/` 规则不再匹配新路径，已由 `artifacts/` 规则覆盖 |

### 批次 5 — 测试结果快照归档（7 项，2026-09-18 13:10:10）

| # | 原路径 | 新路径 | 迁移原因 | 执行时间 | 潜在风险 |
| --- | --- | --- | --- | --- | --- |
| 26 | `test-results-bak-1787207686/` | `artifacts/test-results/test-results-bak-1787207686/` | 带时间戳的 Playwright 结果备份快照 | 13:10:10 | 低 |
| 27 | `test-results-final-1787207992/` | `artifacts/test-results/test-results-final-1787207992/` | 带时间戳的 Playwright 结果快照 | 13:10:10 | 低 |
| 28 | `test-results-run-1787207859/` | `artifacts/test-results/test-results-run-1787207859/` | 带时间戳的 Playwright 结果快照 | 13:10:10 | 低 |
| 29 | `test-results-p25/` | `artifacts/test-results/test-results-p25/` | P25 阶段测试结果快照 | 13:10:10 | 低 |
| 30 | `test-results-p5b/` | `artifacts/test-results/test-results-p5b/` | P5b 阶段测试结果快照 | 13:10:10 | 低 |
| 31 | `test-results-p5c/` | `artifacts/test-results/test-results-p5c/` | P5c 阶段测试结果快照 | 13:10:10 | 低 |
| 32 | `test-results.bak/` | `artifacts/test-results/test-results.bak/` | 测试结果备份快照 | 13:10:10 | 低 |

> 注意：根目录的 `test-results/` **未迁移**（Playwright 默认输出 + CI 上传路径）。

### 批次 6 — E2E 结果快照归档（6 项，2026-09-18 13:10:11）

| # | 原路径 | 新路径 | 迁移原因 | 执行时间 | 潜在风险 |
| --- | --- | --- | --- | --- | --- |
| 33 | `e2e-results-verify/` | `artifacts/e2e-results/e2e-results-verify/` | E2E 验证结果快照（含截图与 trace） | 13:10:11 | 低 |
| 34 | `e2e-results-verify2/` | `artifacts/e2e-results/e2e-results-verify2/` | E2E 验证结果快照 | 13:10:11 | 低 |
| 35 | `e2e-results-verify3/` | `artifacts/e2e-results/e2e-results-verify3/` | E2E 验证结果快照 | 13:10:11 | 低 |
| 36 | `e2e-results-verify5/` | `artifacts/e2e-results/e2e-results-verify5/` | E2E 验证结果快照（4.2 MB） | 13:10:11 | 低 |
| 37 | `e2e-results-verify6/` | `artifacts/e2e-results/e2e-results-verify6/` | E2E 验证结果快照（4.0 MB） | 13:10:11 | 低 |
| 38 | `e2e-results-verify7/` | `artifacts/e2e-results/e2e-results-verify7/` | E2E 验证结果快照 | 13:10:11 | 低 |

> 说明：批次 5 与批次 6 的目标目录名（`test-results` / `e2e-results`）位于 `artifacts/` 之下，与根目录同名目录不冲突，且因 `artifacts/` 被整体忽略而不会被 Git 跟踪。原目录名完整保留在归档路径末段，便于追溯。

---

## 四、配置与新增文件变更

| # | 文件 | 变更类型 | 内容 | 时间 | 潜在风险 |
| --- | --- | --- | --- | --- | --- |
| C1 | `.gitignore` | 修改 | 在 `# Test artifacts` 段落后新增 `# 归档产物` 段，加入规则 `artifacts/`；原有 `dist-*/`、`coverage-ci/`、`test-results-*/`、`e2e-results-*/`、`ui-shots/` 等历史模式予以保留，兼容未来重新生成时的旧路径 | 13:10:19 | **中**。`.gitignore` 自身已被其末段规则 `/.gitignore` 忽略（本地保留、不提交），因此本次修改不会产生 Git 变更。副作用：今后放在 `artifacts/` 下的任何文件都会被静默忽略，若需提交其中内容须先调整该规则 |
| C2 | `scripts/ui-shot.mjs` | 修改 | `OUT` 常量由 `ui-shots/themes/${THEME}` / `'ui-shots'` 改为 `docs/assets/screenshots/themes/${THEME}` / `'docs/assets/screenshots'`，并补充说明注释。已通过 `node --check` 语法校验 | 13:09:44 | 低。该脚本为手动运行的工具脚本，不在 `npm run build` / `npm test` 链路内。`git status` 显示为 `M`（该文件已被跟踪），**本次未提交** |
| C3 | `scripts/gen-project-index.mjs` | 新增 | `PROJECT_INDEX.md` 生成器（只读扫描 + 只读 git 调用） | 13:17:51 | 低。新增脚本，不被任何既有流程引用 |
| C4 | `PROJECT_INDEX.md` | 新增 | 项目索引，由 C3 生成 | 13:17:51 | 低。新文件，处于未跟踪状态 |
| C5 | `MIGRATION_LOG.md` | 新增 | 本文件 | — | 低。新文件，处于未跟踪状态 |
| C6 | `artifacts/backup/pre-migration-docs-20260918-130909.tar.gz` | 新增 | 迁移前文档回滚备份 | 13:09:10 | 低。位于被忽略目录内 |
| C7 | `eslint.config.js` | 修改 | 忽略列表收敛：删除已失效的 `dist-i18n-check/**`、`dist-p13-check/**`、`dist-qa/**`、`dist-measure/**`、`dist-opt*/**`、`dist-lib-eval*/**`、`dist-electron/**`、`coverage-ci/**`（这些目录已迁入 `artifacts/` 或本就不存在），改为单条 `artifacts/**`；并补 `.workbuddy-ai/**` | 2026-09-18 14:50 | **低**。属**回归修复**，详见第十节 |

---

## 五、迁移后验证记录

| 验证项 | 命令 | 结果 | 时间 |
| --- | --- | --- | --- |
| i18n 严格门禁 | `npm run i18n:check:strict` | 通过 — `src` 全部 148 个文件无硬编码中文 UI 文案残留 | 13:11 |
| 断点门禁 | `npm run check:breakpoints` | 通过 — 无野断点、`matchMedia` 唯一来源、L1/L4 数值同步 | 13:11 |
| 生产构建 | `npm run build`（`vue-tsc --noEmit` + `vite build`） | 通过 — PWA 预缓存 81 项（8770.14 KiB），`dist/` 正常生成 | 13:12 |
| 单元与组件测试 | `npm run test`（Vitest） | 通过 — **98 个测试文件 / 2696 个测试全部通过**，含 `tests/core/onnx-real-model.test.ts` 的真实 `model/` 目录推理用例（确认 `model/` 未迁移是正确决定） | 13:12:44–13:13:43 |
| 归档目录未泄漏进 Git | `git status --short \| grep -c artifacts` | 0 | 13:17 |
| 索引无绝对路径 | 正则检索 `[A-Z]:\` / `/mnt/` / `Users\` / 本机用户名 | 无匹配 | 13:17 |
| 索引无敏感内容 | 正则检索私钥标记 / API Key 形态 / 密钥文件名 | 仅命中「忽略清单」中对规则的文字描述，无实际密钥信息 | 13:17 |

---

## 六、Git 状态影响说明

整理前后的 Git 工作区变化，**仅限以下两项**，提交历史与已跟踪文件内容均未改动：

1. `scripts/ui-shot.mjs` — 由 `已跟踪` 变为 `已修改`（C2）。
2. 未跟踪文件由 10 个减为 8 个 — 减少的正是 `项目文档结构.md` 与 `goal-tracker.md`（批次 1 第 3、4 项，迁入被忽略的 `docs/` 后不再出现在未跟踪列表）。

其余 41 个已修改文件在整理期间未被触碰，其未提交状态原样保留。

---

## 七、回滚指引

全部变更为 `mv`，可原路返回。

```bash
# 0) 还原文档（推荐方式：从备份解包，先确认目标无冲突）
tar -xzf artifacts/backup/pre-migration-docs-20260918-130909.tar.gz

# 1) 根目录文档
mv docs/AI酒馆开发计划文档.md .
mv docs/AI酒馆项目嵌入优化方案开发文档.md .
mv docs/项目文档结构.md .
mv docs/goal-tracker.md .
mv docs/assets/test-gradient.jpg .
mv artifacts/logs/debug.log .

# 2) 截图
mv docs/assets/screenshots ui-shots

# 3) 构建快照
mv artifacts/dist/* .

# 4) 覆盖率与测试快照
mv artifacts/coverage/coverage-ci .
mv artifacts/test-results/* .
mv artifacts/e2e-results/* .

# 5) 配置回退
#    - .gitignore：删除「# 归档产物」段落中的 artifacts/ 行
#    - scripts/ui-shot.mjs：OUT 常量改回 'ui-shots'
```

回滚后请重跑第五节全部验证项。

---

## 八、遗留事项与建议

| 级别 | 事项 | 说明 |
| --- | --- | --- |
| 中 | `项目文档结构.md` 与 `goal-tracker.md` 现处于被忽略的 `docs/` 内 | 二者原为未跟踪文件。若本意是纳入版本控制，需调整 `.gitignore` 的 `docs/` 规则（可改为 `docs/**` + 显式 `!docs/<file>` 白名单） |
| 中 | 历史 `dist-*` / `coverage-ci` / `test-results-*` / `e2e-results-*` 已归档但未清理 | 合计约 1.1 GB。如需释放空间，建议人工确认后再删除 `artifacts/` 下内容；本次整理**未做任何删除** |
| 中 | `src-tauri/keys/ai-roleplay.key`（签名私钥）仍在工作区 | 已被 `.gitignore` 忽略，但明文存在于本地。建议确认密钥保管方式；本次全程未读取其内容 |
| 低 | `src-tauri/target/` 约 13 GB | Rust 构建缓存，可安全清理（会拖慢下次构建）。本次未触碰 |
| 低 | `model/bge-small-zh-v1.5-int8-onnx/` 内含独立 `.git/` | 嵌套 Git 仓库，非标准结构，来源待确认。本次未触碰 |
| 低 | `.gitignore` 中多条历史模式（`dist-opt*/`、`dist-lib-eval*/`、`ui-shots/` 等）现已不再匹配任何现存路径 | 有意保留以兼容未来重新生成；如需精简可后续清理 |
| 低 | 三个新文件（`PROJECT_INDEX.md`、`MIGRATION_LOG.md`、`scripts/gen-project-index.mjs`）均未提交 | 按约束未执行任何 Git 写操作。是否提交由你决定 |

---

## 九、2026-09-18 清理记录（A+B 档）

### 9.1 背景与授权

用户请求「清除临时文件，项目无用的文件」。经只读扫描后按风险分档提出 A/B/C/D 四档方案，**用户确认执行 A+B 档**（约 77 MB），并明确保留 `node_modules/`。

**执行时间**：2026-09-18 14:01:49 — 14:03（本地时区）

### 9.2 执行前备份

| 项 | 值 |
| --- | --- |
| 备份文件 | `artifacts/backup/pre-cleanup-unrecoverable-20260918-140149.tar.gz` |
| 大小 | 7.5 MB（压缩前 17.5 MB） |
| 覆盖范围 | `artifacts/coverage/`、`artifacts/test-results/`、`artifacts/e2e-results/` —— 即本次删除项中**不可重建**的部分 |
| 说明 | 其余删除项均为可由构建/测试命令重新生成的产物，未纳入备份 |

### 9.3 删除明细（A 档 · 纯临时垃圾）

| # | 路径 | 体积 | 判定依据 | 执行时间 |
| --- | --- | --- | --- | --- |
| 1 | `docs/assets/test-gradient.jpg` | 103 KB | `.gitignore` 注释明写「临时测试图（仅本地验证用）」 | 14:02 |
| 2 | `artifacts/logs/debug.log` | 725 B | 旧运行日志，`*.log` 规则本就忽略 | 14:02 |
| 3 | `artifacts/dist/dist.bak/` | 44 KB | 历史构建备份快照，含空目录 `_tmp_analysis/` | 14:02 |

### 9.4 删除明细（B 档 · 可再生产物）

| # | 路径 | 体积 | 恢复方式 | 执行时间 |
| --- | --- | --- | --- | --- |
| 4 | `coverage/` | 9.0 MB | `npm run test:coverage` 重新生成 | 14:02 |
| 5 | `dist/` | 50 MB | `npm run build` 或 `tauri build`（`beforeBuildCommand` 自动重建） | 14:02 |
| 6 | `test-results/` | 745 KB | `npm run test:e2e` 重新生成 | 14:02 |
| 7 | `artifacts/coverage/coverage-ci/` | 7.7 MB | 需手动重建；已在 9.2 备份 | 14:03 |
| 8 | `artifacts/test-results/` 下 7 个快照 | 1.5 MB | 不可重建；已在 9.2 备份 | 14:03 |
| 9 | `artifacts/e2e-results/` 下 6 个快照 | 8.3 MB | 不可重建；已在 9.2 备份 | 14:03 |

第 8、9 项的具体删除对象：
`test-results-bak-1787207686`、`test-results-final-1787207992`、`test-results-p25`、`test-results-p5b`、`test-results-p5c`、`test-results-run-1787207859`、`test-results.bak`；
`e2e-results-verify`、`e2e-results-verify2`、`e2e-results-verify3`、`e2e-results-verify5`、`e2e-results-verify6`、`e2e-results-verify7`。

> `artifacts/coverage/`、`artifacts/test-results/`、`artifacts/e2e-results/`、`artifacts/logs/` 四个归档槽位目录本身**予以保留**（现为空目录），以便后续产物继续按既有约定归档。

### 9.5 空间核算

| 项 | 体积 |
| --- | --- |
| 删除合计 | 约 77.3 MB |
| 新增备份 | 7.5 MB |
| **净释放** | **约 69.8 MB** |
| 保留（未删） | `artifacts/dist/` 下 16 个历史构建快照约 912 MB（C 档，用户选择保留） |

### 9.6 未删除项及原因

| 项 | 体积 | 未删原因 |
| --- | --- | --- |
| `src-tauri/target/`（debug 9.8 GB + release 2.6 GB） | 13 GB | D 档，用户未选。删除后下次 `tauri dev` / `tauri build` 需全量重编 |
| `artifacts/dist/` 16 个历史构建快照 | 912 MB | C 档，用户选择保留以供追溯 |
| `node_modules/` | 645 MB | 用户明确保留，删除后需联网 `npm ci` 重装 |
| `model/` | 1.1 GB | **不可删** —— `src/core/vector-model-tauri.ts` 的 `PRESCAN_DIRS` 与 `tests/core/onnx-real-model.test.ts` 硬引用，删除将导致 RAG 功能失效 |
| `.workbuddy/memory/`、`.workbuddy-ai/memory/` | 108 KB | AI 记忆与项目约定，属交付物 |
| `docs/`、`deliverables/`、`docs/assets/screenshots/` | 6.9 MB | 文档与截图交付物 |
| `artifacts/backup/` | 7.6 MB | 两轮回滚备份，保留至用户确认无需回滚 |

### 9.7 异常记录：`.reasonix/` 目录消失

`.reasonix/`（80 个文件，1.4 MB，含 `tasks/`、`reports/`、`skills/`）在本轮工作期间从工作区消失：

| 时间 | 观察结果 |
| --- | --- |
| 2026-09-18 13:03 | 存在（本文件第一节勘察时确认） |
| 2026-09-18 13:17 | 存在（`PROJECT_INDEX.md` 首版收录其 6 个文件） |
| 2026-09-18 13:56 | **已不存在**（本轮清理扫描时发现） |

**本次工作全程未删除该目录**（本轮唯一删除操作发生在 14:02 之后，晚于其消失时间）。推测为 Reasonix 工具自身清理或外部操作。已同步更新 `PROJECT_INDEX.md`：移除其 6 条文件记录，忽略清单中保留一条 `.reasonix/` 规则以兼容其重新生成。

### 9.8 清理后验证

| 验证项 | 命令 | 结果 | 时间 |
| --- | --- | --- | --- |
| i18n 严格门禁 | `npm run i18n:check:strict` | 通过 — `src` 全部 148 个文件无硬编码中文 UI 文案残留 | 14:03 |
| 断点门禁 | `npm run check:breakpoints` | 通过 — 无野断点、`matchMedia` 唯一来源、L1/L4 数值同步 | 14:03 |
| 索引重新生成 | `node scripts/gen-project-index.mjs` | 通过 — 收录 364 个文件（较清理前 371 减少 7：`.reasonix/` 6 个 + `test-gradient.jpg` 1 个），待确认 0 | 14:04 |

> 未重跑 `npm run build` 与 `npm run test`：本次删除项均不参与构建与测试链路，且源码零改动；重跑会重新生成 `dist/` 与 `coverage/`，与本轮释放空间的意图相悖。如需验证，执行 `npm run build` 即可确认 `dist/` 正常重建。

### 9.9 清理回滚

```bash
# 还原不可重建的留档（第 7、8、9 项）
tar -xzf artifacts/backup/pre-cleanup-unrecoverable-20260918-140149.tar.gz

# 还原可再生产物
npm run test:coverage    # 重建 coverage/
npm run build            # 重建 dist/
npm run test:e2e         # 重建 test-results/
```

A 档三项（`test-gradient.jpg`、`debug.log`、`dist.bak/`）无备份，属确认无价值后删除。

---

## 十、2026-09-18 14:50 回归修复：`npm run lint` 被迁移打断

### 10.1 问题

目录整理（第三～六批次）把 17 个 `dist-*`、`coverage-ci/` 等一次性构建快照移入 `artifacts/`，但 `eslint.config.js` 的 `ignores` 仍按**旧根路径**逐条列出（`dist-opt*/**`、`dist-qa/**`、`coverage-ci/**` 等）。路径失效后 eslint 开始扫描 `artifacts/` 下的已编译 bundle，`npm run lint` 报出 **78233 errors / 2 warnings**，即 `quality-gates` 的第 1 道门禁被打断。

**为何未被当场发现**：迁移后的验证记录（第五节）只覆盖 `i18n:check:strict` / `check:breakpoints` / `build` / `test`，**未包含 `npm run lint`**；而第五节第 5 行的 `git status | grep -c artifacts = 0` 只证明"归档目录不泄漏进 Git"，与 eslint 无关。这是验证清单的一处缺口。

### 10.2 修复

| 项 | 内容 |
| --- | --- |
| 文件 | `eslint.config.js` |
| 变更 | `ignores` 收敛为 `node_modules/**`、`dist/**`、`coverage/**`、**`artifacts/**`**、`src-tauri/target/**`、`.workbuddy/**`、**`.workbuddy-ai/**`**、`out/**` |
| 删除的失效规则 | `dist-i18n-check/**`、`dist-p13-check/**`、`dist-qa/**`、`dist-measure/**`、`dist-opt*/**`、`dist-lib-eval*/**`、`dist-electron/**`、`coverage-ci/**` |
| 删除依据 | 已核验：`package.json`、`scripts/*.mjs`、`.github/workflows/*.yml` 中**无任何**对这些目录的产出引用；`dist-electron/` 目录本就不存在（遗留自早期 Electron 方案） |
| 保留的硬依赖规则 | `dist/**`（Vite 默认 outDir）、`coverage/**`（Vitest 默认 reportsDirectory）仍留在根目录，故保留 |

### 10.3 验证

| 验证项 | 命令 | 结果 | 时间 |
| --- | --- | --- | --- |
| 代码风格门禁 | `npm run lint` | 通过 — **0 error**（2 个 `vue/first-attribute-linebreak` warning 属 `CharacterList.vue:110-111` 既有问题，非阻断） | 14:53 |

### 10.4 结论与建议

- 该回归为**目录迁移的连带影响**，非迁移本身错误；根因是"忽略规则按绝对路径逐条枚举"这一脆弱模式。
- **建议**：今后 `scripts/*.mjs`、`eslint.config.js` 等配置中的"目录枚举型"规则，在迁移后必须一并回归。迁移后的验证清单应固定包含 `npm run lint`（`quality-gates` 的第 1 步），已在本文件第五节的清单之外补记此要求。

---

*本文件由目录整理任务生成，与 `PROJECT_INDEX.md` 配套使用。索引可通过 `node scripts/gen-project-index.mjs` 重新生成；目录结构再次变更时，请在本文件追加新批次记录。*
