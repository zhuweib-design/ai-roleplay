# 优化两轮实施记录（2026-10-01 起）

> 本文档是第一轮 / 第二轮优化的**唯一记录文档**：计划、步骤、测试结果、决策与阻塞处理全部记录于此，随开发同步更新。
> 约束：只本地提交，不产出 exe / apk；遇阻塞自行决断并在本文档记录。

## 〇、轮次与范围总览

| 轮次 | 范围 | 执行顺序（风险从低到高） | 状态 |
|---|---|---|---|
| 第一轮 | MODEL-03 Preset UI 补全 → EXP-01 预设/正则绑定 → UX-03 群聊游标分页 → EVAL 评测闭环 → 真实环境回归（DB-01/API-01） | 5 项，每项：实现 + 测试 + 本文档记录 | 进行中 |
| 第二轮 | O-1 ort 首屏彻底移除（onnxruntime 隔离，架构级） | 新分支 → 设计文档 → 评审修订 → 按计划分步开发（每步记录） | 未开始 |

各轮完成后的门禁与提交信息见对应章节末尾。

---

## 一、第一轮记录

（随开发逐项填充）

### 1.1 第一轮#1 — MODEL-03 Preset UI 补全

状态：**已完成**（2026-10-01）

**背景**：MODEL-03 核心模块（`src/core/creation-preset.ts`，含 `resolvePresetParams` 逐字段来源标注）与 store 接线（`settings.creationPreset` 持久化、`chat.ts` 请求链最低优先级兜底）已在上一提交落地；PLAN_AUDIT P2-#9 指出缺切换 UI。

**改动**：
- `src/components/settings/SettingsModelPanel.vue`：新增「创作模式」全局区块（紧随思维链偏好区块）——
  - 4 档单选（自由/均衡/严谨/自定义，i18n 文案 + 说明），切换即 `setCreationPreset` + `persistSettings` + 成功 Toast；
  - 「实际生效参数」检查表：topP / 存在惩罚 / 频率惩罚 / 上下文预算（百分比）/ 状态块输出，逐字段标注来源（`preset.sourcePreset` / `preset.sourceInherit`），并显示 `预设版本 v{version}`；custom 档隐藏参数表、显示"不套用建议值"提示；
  - 配套 scoped 样式（沿用 panel 既有 tokens：`--spacing-*` / `--radius-md` / `--secondary`，无新断点、无 `!important`）。
- `src/i18n/locales/zh.ts` / `en.ts`：新增 5 组词条（`preset.contextBudget` / `preset.contextBudgetPercent` / `preset.statusInstruction` / `preset.statusOn` / `preset.statusOff`）。
- 新增测试 `tests/views/settings-creation-preset.test.ts`（4 项）。

**测试与验证**：
- 新测试 4/4 通过（选项渲染 / balanced 默认与参数表 / 切换 strict 逐字段更新+Toast / custom 隐藏参数表）；
- 修正过两处测试断言：Toast 经 Teleport 渲染在 body（`document.body.textContent` 断言）；balanced 档仅 3 字段来自预设（两个 penalty 为 inherit）；
- 回归：`tests/stores/settings.test.ts` + `tests/i18n.test.ts` + `tests/views/settings-local-model.test.ts` 共 78 项全部通过；
- `vue-tsc --noEmit` 0 错误；eslint 改动文件 0 问题。

### 1.2 第一轮#2 — EXP-01 角色 ↔ 资源绑定（角色级创作模式绑定）

状态：**已完成**（2026-10-01）

**范围决策（自行决断，记录在案）**：PLAN_AUDIT 指出 EXP-01"仅世界书绑定；预设/正则未实现"。核查代码库后确认**不存在正则脚本资源系统**（无 regexScript/正则脚本实体），为"正则绑定"造空壳字段属于无依托功能，**本轮不实现正则绑定**，仅落地**预设绑定**——代码库现存的"预设"资源即 MODEL-03 创作模式（上一项刚完成 UI）。若未来引入正则脚本系统，可按同款 ext 模式扩展。

**语义**：`boundPresetId`（角色级创作模式绑定），`null / undefined` = 未绑定 = 跟随全局 `settings.creationPreset`；**优先级：角色级 > 全局**（在既有"角色级 > Profile 级 > 全局采样默认值"级联中，Preset 兜底仍是最低优先级层，角色绑定决定用哪个 Preset）。

**改动**：
- `src/core/creation-preset.ts`：新增纯函数 `resolveEffectivePreset(bound, global)` —— 角色绑定合法值优先；绑定非法值**回落全局**（而非静默改写 balanced），覆盖层失效不改变全局语义；
- `src/core/character-card.ts`：`CharacterExt` 新增 `boundPresetId?: PresetId | null`（ext 收纳约定，V2 导出自动携带）；
- `src/types/index.ts`：`UICharacter` 新增同名字段；
- `src/services/type-adapters.ts`：ext 整体打包新增该字段；新增 `readBoundPresetId`（ext 优先 + 顶层 legacy 回退，非法值 → null 跟随全局）；
- `src/stores/chat.ts`：`applyRuntimeLlmControls` 增加可选 `character` 参数（两个调用点均传入），MODEL-03 兜底块改用 `resolveEffectivePreset`；
- `src/components/layout/ContextPanel.vue`：生成参数区块新增「创作模式」选择器（跟随全局 / 自由 / 均衡 / 严谨 / 自定义），经 `updateCharacter` 写入并持久化；
- i18n：新增 `preset.followGlobal`（跟随全局 / Follow global）。

**测试与验证**：
- `tests/core/creation-preset.test.ts` 新增 4 项：绑定优先 / 未绑定回落全局 / 非法绑定回落全局 / 双非法回落 balanced；
- `tests/services/type-adapters.test.ts` 新增 4 项：round-trip 保留合法值 / 未绑定保持 null 语义且不落盘 / 篡改非法值归一 null / legacy 顶层回退；
- `tests/stores/chat-llm-controls.test.ts`：**发现并修复一个上一提交遗留的测试失败**——全局默认 preset 'balanced' 会以最低优先级兜底 topP 0.9，与 P0-3 用例"三档未设置不传参"契约冲突（stash 对照确认失败在 HEAD 上已存在，非本次引入）。处理：P0-3 用例切 `custom` 档隔离 Preset；另补 2 条端到端断言（balanced 兜底 0.9；角色绑定 strict 时请求体为 topP 0.8 + 双 penalty 0.3，验证角色级 > 全局）；
- 全量回归 tests/stores + views + core + services：**3111 项全部通过**；
- `vue-tsc --noEmit` 0 错误；eslint 改动文件 0 问题。

### 1.3 第一轮#3 — UX-03 群聊游标分页（尾部窗口）

状态：**已完成**（2026-10-01）

**方案决策（自行决断，记录在案）**：PLAN_AUDIT 建议把单聊的双向虚拟化窗口机制扩展到群聊。核实后确认单聊方案依赖 MessageBubble 的高度估算 + 顶/底 spacer（约 300 行），而群聊消息行含成员徽章、系统事件等复杂行内布局，高度估算不可靠，整体移植属高风险改动。本轮改用**同目标的低风险方案**：`group-chat` store 加**尾部窗口游标分页**（cursor/pageSize 语义与建议一致）——只渲染最近 N 条，向上翻阅按页扩窗，DOM 上限 = 已翻阅页数 × 页大小，长群聊不再一次性渲染全量历史。

**改动**：
- `src/stores/group-chat.ts`：
  - 新增 `TURN_PAGE_SIZE = 60`、`visibleTurnCursor`、`visibleMessages`（尾部切片）、`hasOlderTurns`、`hiddenOlderCount`、`loadOlderTurns()`（按页扩窗）、`resetTurnCursor()`；
  - `selectGroup` / `createGroup` / `deleteGroup`（当前群删除回退）时重置游标；
  - `currentMessages`（完整历史）语义不变，Runtime 同步、搜索等不受影响；
- `src/views/GroupChatView.vue`：消息列表 v-for 改用 `visibleMessages`；顶部"加载更早的消息（还有 N 条）"按钮；`@scroll` 触顶（≤80px）自动扩页，扩页后按新增高度补偿 `scrollTop` 保持阅读位置（`loadingOlderTurns` 防重入）；
- i18n：新增 `group.loadEarlier`（zh/en）。

**测试与验证**：
- 新增 `tests/stores/group-chat-pagination.test.ts`（5 项）：尾部窗口切片 / 按页扩窗至封顶返回 false / 不足页大小时全量 / 切换+创建重置 / 删除回退重置；
- 修正两处测试自身问题：createGroup 自带首消息导致总数差一（改 `seedToTotal` 精确补足）；群聊消息 timestamp 为 string 非 UIMessage 的 number；
- 回归：tests/stores 全量 **795 项通过**（含既有 group-chat 19 项 + Runtime 集成 19 项）；
- `vue-tsc --noEmit` 0 错误；eslint 0 问题；`i18n:check:strict` 通过。

### 1.4 第一轮#4 — EVAL-01/02/03 评测闭环

状态：**已完成**（2026-10-01）

**背景**：PLAN_AUDIT P1-#4 指出"质量闭环尚未真正闭合"——四层固定评测集与 20–50 条事实样本不在仓库，`opt-eval.mjs` 的一致率/连贯率指标为 requires-real-env 占位。

**诚实边界（核心设计决策，记录在案）**：真实 LLM 的一致率/连贯率在离线环境**无法**测出（延续项目"禁止估算或编造"原则，opt-eval 的 requires-real-env 清单保持不变）。本轮补齐的是评测基础设施中**可以离线确定性交付**的部分：固定评测集 + 确定性判定链 + 执行脚本 + manifest 归档。产出数字明确标注为「判定链自检 / 标注器回归基准」，与真实 LLM 指标不可互相替代；判定链对真实采集（`real-llm-capture`）同样适用，届时同一套命令即可产出真实数字。

**改动**：
- **EVAL-01 数据集**：新增 `eval/setting-facts-dataset.v1.json`——唯一版本号（`aijiuguan-setting-facts` `v1.0.0`）、四层齐全（single-turn 4 / multi-turn 2 / long-conversation 1 / group-safety 1）、**事实 38 条**（区间 20–50）其中核心 8 条（≤10）、每条事实含 matchKeywords + expectedTurns 标准答案标注、每条样本携带 reproduction 复现条件 schema（authored-fixture 允许 null；real-llm-capture 必须填写）、30 轮长对话主样本（塞拉菲娜寻亲线）；
- **判定链**：新增 `src/core/eval-judgment.ts` 纯函数模块——`normalizeForMatch` / `factHitInTurn`（关键词全命中，归一化跨全半角标点）/ `judgeFacts`（逐事实判定 + full/core 双口径汇总；期望轮越界按未命中计，显式暴露标准答案错误）/ `emotionCoherence`（复用 `detectEmotion`，null 不成对）/ `judgeSafety`（拒绝关键词合规）/ `validateDataset`（版本、层、source 声明、事实数区间、核心上限——fail-fast）；
- **EVAL-02 执行脚本**：新增 `scripts/eval-run.mjs`——esbuild 打包复用 src（与 opt-eval 同机制）；`--json` 机器可读、人读摘要双输出；`--strict` 不达标退出码 1；数据集校验失败 fail-fast 不产出数字；package.json 新增 `eval:run` / `eval:manifest`；
- **EVAL-03 归档**：`--manifest` 落盘 `docs/dev/eval-manifest.json`——commit（git rev-parse，无 git 时如实记 unknown）、数据集版本 + **sha256**、node 版本、执行时间、阈值、逐项结果、owner（沿计划【待确认】不代拍板）、诚实边界声明。

**测试与验证**：
- 新增 `tests/core/eval-judgment.test.ts`（14 项）：归一化 / 单事实与多轮期望 / 越界期望显式失败 / full 与 core 分母独立 / coreRate 无分母返回 null / 情绪 null 不成对 / 安全合规 / 数据集校验（版本、source、20–50 区间、核心 ≤10、safetyCases）；
- 运行自检（`npm run eval:run -- --strict`）：**4 项全 PASS**——核心一致率 100%（8/8）、全量 100%（38/38）、情绪相邻连贯率 90.9%（11 对 10 一致，语料含 1 处真实语义转折，验证非平凡）、安全合规 100%（4/4）；
- **可复现性验证**（EVAL-02 验收）：同 commit 连续两次 `--json` 输出除 ranAt 外逐字节一致 ✓；
- manifest 已生成（`docs/dev/eval-manifest.json`）；
- `vue-tsc --noEmit` 0 错误；eslint 0 问题。

### 1.5 第一轮#5 — 真实环境回归（DB-01 / API-01）

状态：**已完成（按环境边界尽力落地）**（2026-10-01）

**核实修正**：PLAN_AUDIT P1-#6 建议"配置 CI 用 PG 实例"——核实 `.github/workflows/ci.yml` 后确认 **CI 侧已配置**（`services.postgres` postgres:16-alpine + `RUNTIME_PG_TEST_URL` + `RUNTIME_PG_APPLY_SCHEMA=1`），真实缺口是**本机执行证据**（audit 记"⚠️未本机执行"）。

**DB-01 本机真实执行（已达成）**：
- 本机无 docker / psql；按"可联网获取任何必要资源"授权，通过 npm 安装 **embedded-postgres**（`@embedded-postgres/windows-x64` 17.4.0-beta.15，装在 gitignore 的 `artifacts/pg-embedded/`，不入项目依赖）；
- 新增 `artifacts/pg-embedded/run-pg-tests.mjs`：initdb → 启动（端口 5433）→ 建库 runtime_test → 注入 `RUNTIME_PG_TEST_URL` / `RUNTIME_PG_APPLY_SCHEMA=1` → 执行被门控测试 → 停止并清理；支持 `-- <任意命令>` 泛化模式；
- **真实执行结果**：`postgres-runtime.integration.test.ts` + `postgres-group.integration.test.ts` 两个文件 **3 用例全部通过（exit 0，3.73s）**——真实迁移建 schema、真实事务/约束（负向用例的约束违反报错为预期输出）、租户隔离、409 冲突、outbox 链路在真实 PostgreSQL 上验证；
- 版本差异如实记录：嵌入式 PG 为 17.4（CI 为 16-alpine），集成语义不受影响。

**证据包门禁条件化（诚实策略增强）**：`scripts/release-evidence-pack.mjs` 的两个环境门禁从**无条件 skip** 改为**有条件真实执行**——
- `postgres-transaction`：设置 `RUNTIME_PG_TEST_URL` 即自动运行两个集成测试文件；未设置保持诚实 skipped（附如何就绪的说明）；
- `provider-regression`（API-01）：设置 `OPENAI_API_KEY`（可选 `OPENAI_BASE_URL`）即自动运行 `opt-eval --with-api` 真实环境探针；仓库仍不内置密钥；
- `migration-restore` 保持 skip：核实嵌入式 PG 仅带服务端二进制（无 pg_dump/pg_restore），不具备演练条件，如实记录；
- KNOWN_ISSUES 模板同步更新。

**API-01 现状（诚实记录）**：当前环境无任何 Provider API Key（已核查 env），真实 provider 回归无法执行、也不可编造；门禁已改为"提供 Key 即真实执行"，具备环境的时刻即产生真实证据。

**测试与验证**：eslint 0 问题；PG 集成证据日志见 `artifacts/pg-test-evidence.log`（gitignore，不入库）；证据包在真实 PG 下的完整运行见 §1.6 门禁验证。

### 1.6 第一轮门禁验证与提交

**运行方式**：`node artifacts/pg-embedded/run-pg-tests.mjs -- npm run release:pack`（嵌入式 PG 之上整体运行证据包，`RUNTIME_PG_TEST_URL` 环境注入使 PG 集成门禁真实执行）。

**14 项门禁结果**（artifacts/release-evidence/v1.0.0/quality-gate-manifest.json）：

| 门禁 | 结果 | 耗时 |
|---|---|---|
| unit-integration（vitest 全量） | ✅ passed | 81s |
| build（vue-tsc + vite build） | ✅ passed | 58s |
| csp（CSP 契约守卫） | ✅ passed | 1.3s |
| i18n（严格扫描） | ❌→✅ 首轮失败后修复 | — |
| css-contrast（对比度审计） | ✅ passed | 1.3s |
| runtime-schema（漂移检查） | ✅ passed | 1.1s |
| snapshot-migration（迁移报告门禁） | ✅ passed | 1.1s |
| typecheck | ✅ passed | 21s |
| lint | ✅ passed | 171s |
| **postgres-transaction（真实 PG 集成）** | ✅ **passed** | 6.6s |
| e2e-desktop / e2e-mobile | skipped（默认不含 --full，CI push 时执行） | — |
| migration-restore | skipped（嵌入式 PG 无 pg_dump/pg_restore，如实记录） | — |
| provider-regression | skipped（环境无 API Key；门禁已条件化，有 Key 即真实执行） | — |

**i18n 失败原因与修复**：`eval-judgment.ts` 的 validateDataset 诊断信息（CLI stderr 文案）被严格扫描误判为 UI 文案。按项目既有惯例对该函数整段加 `// i18n-ignore-start/-end` 块级豁免（明确注释其非 UI 属性），修复后 `i18n:check:strict` 通过（169 文件 0 残留），并复跑该模块 14 项单测全过、eslint 0。

**最终状态**：除三项有理由 skipped（E2E 归 CI、pg_dump 缺失、无 Provider Key）外全部通过；**PG 事务集成首次在本机真实 PostgreSQL 上取得通过证据**（DB-01 "未本机执行"缺口关闭）。

**提交**：第一轮全部改动 + 本文档，本地提交于 master（commit 见 git log，"feat: 第一轮优化五项"）。不推送远端，不产出 exe/apk。

---

## 二、第二轮记录

（分支建立后填充）

---
