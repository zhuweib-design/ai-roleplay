# AI 酒馆 0.3.1 → 1.0.0 计划符合度审查报告与修复优先级建议

**项目**: AI 酒馆 (ai-roleplay) v1.0.0
**审查日期**: 2026-09-28
**审查基准**: `docs/product/AI酒馆详细开发计划-0.3.1至1.0.0.md`（v2.0，1589 行，注明 2026-09-26）
**审查方法**: 5 个只读子代理并行核查源码，逐任务给 file:line 证据；遵循计划自身原则「代码存在 ≠ 生产交付」「信息不足统一标注 ⚠️/📄」。
**审查形态**: 仅审查与建议，未改动任何源码。

---

## 目录索引

| 节 | 标题 | 位置 |
|---|---|---|
| 一 | [审查方法与图例](#一审查方法与图例) | 第 1 页 |
| 二 | [首要发现：版本号与真实发布史不吻合](#二首要发现版本号与真实发布史不吻合) | 第 1 页 |
| 三 | [逐任务对照表](#三逐任务对照表) | 第 2 页 |
| 3.1 | [0.3.1 Runtime / 群聊生产化](#31-031-runtime--群聊生产化) | 第 2 页 |
| 3.2 | [0.4.0 长对话 / 摘要 / 记忆 / RAG](#32-040-长对话--摘要--记忆--rag) | 第 2 页 |
| 3.3 | [0.4.x 性能 / 交互（真实 0.5.0）](#33-04x-性能--交互真实-050) | 第 3 页 |
| 3.4 | [0.5.0 故事创作工作区](#34-050-故事创作工作区) | 第 3 页 |
| 3.5 | [0.6.0 模型与本地运行（散落实现）](#35-060-模型与本地运行散落实现) | 第 4 页 |
| 3.6 | [1.0.0 冻结 / 迁移 / 扩展边界](#36-100-冻结--迁移--扩展边界) | 第 4 页 |
| 四 | [总体结论与符合度](#四总体结论与符合度) | 第 5 页 |
| 五 | [修复优先级建议](#五修复优先级建议) | 第 5 页 |
| 六 | [优化模块（未完成优化项）](#六优化模块未完成优化项) | 第 6 页 |
| 附 | [状态图例与统计](#附录状态图例与统计) | 第 7 页 |

> 说明：本文为 Markdown，"页码"为按 A4 打印估算的分页参考；节内锚点可直接点击跳转。

---

## 一、审查方法与图例

状态标记贯穿全文：

- ✅ **已实现**：有可运行源码，且多数带单测/e2e。
- ⚠️ **部分实现**：核心在但缺字段/场景/证据，或按另一套规格实现（标"规格不符"）。
- 📄 **仅文档**：只有 runbook/散文说明，无结构化实现。
- ❌ **缺失**：计划有要求，代码中无对应实现。
- 🔒 **合规后置**：按计划 Gate 要求刻意未进主线。

---

## 二、首要发现：版本号与真实发布史不吻合

计划把 **0.5.0 = 故事创作工作区、0.6.0 = 模型与本地运行**；但 `release-notes-*.md` + git log 显示真实发布是：

| 版本 | 计划假设 | 实际发布内容 |
|---|---|---|
| 0.4.0 | 长对话/摘要/记忆/RAG | ✅ 一致（记忆/双通道 RAG/摘要） |
| 0.5.0 | 故事创作工作区 | **消息搜索与虚拟化/性能**（commit `99817d9`） |
| 0.6.0 | 模型与本地运行 | **Appraisal Engine / Behavior Planner** |
| 0.7–0.9 | （计划未单列） | 记忆有效期与审计 / 确认拒绝与回放 / 单机单用户 |

计划 v2.0 写于 1.0.0 发布（2026-09-27）**前一天**，是一份**追认 + 前瞻混合**的规格，并非各版本实际交付清单。因此第 5、6 章任务并非"按版本整体交付"，而是**散落实现**——这是下文多个 ⚠️/❌ 的根因：不完全是"没做"，而是"按另一套规格做了"。

---

## 三、逐任务对照表

### 3.1 0.3.1 Runtime / 群聊生产化

全项目最扎实的一簇。

| 任务 | 状态 | 证据 |
|---|---|---|
| RT-01 认证 | ✅ | `runtime-auth.ts:51-77`；过期/失效未细分，统一 401 |
| SEC-01 租户/成员授权 | ✅ | `runtime-http.ts:210-237` boundTenantId 覆盖 body；伪造租户测试通过 |
| RT-02 浏览器→Runtime 闭环 | ✅ | 实际接线在 `chat.ts:657-669`（非计划所指 42 行 helper） |
| RT-03 契约冻结 + drift | ✅ | `types.ts` 版本常量 + `sync-runtime-schema.mjs` |
| RT-04 durable queue | ✅ | `chat.ts:464-563`；server 表 `001:447` group_turn_outbox |
| RT-05 退避/重试 | ✅ | `chat.ts:531` 指数退避封顶 60s；409 不无限重试 |
| RT-06 半完成状态机 | ✅ | `chat.ts:863-921`；server FOR UPDATE + committed_turn_id |
| GRP-01 生命周期 | ✅ | `group-chat.ts:308-493` lifecycleStatus/archivedAt |
| GRP-02 并发/取消/切换 | ⚠️ | 服务端幂等/版本锁完整；**客户端仅布尔守卫，无操作锁/correlation** |
| DB-01 PG 事务/幂等 | ✅代码测试 / ⚠️未本机执行 | `integration.test.ts:74` 被 RUNTIME_PG_TEST_URL 门控 skip，已诚实声明 |
| DB-02 迁移演练/回滚 | 📄 | runbook 完整；无原生 down，靠备份恢复 |
| OBS-01 可观测性 | ⚠️ | 有脱敏 + 错误码；**全仓无 correlation/trace ID**，无统一时延/重试指标 |
| OBS-02 故障注入 | ⚠️ | 零散注入，无统一 harness/矩阵 |

### 3.2 0.4.0 长对话 / 摘要 / 记忆 / RAG

| 任务 | 状态 | 证据 |
|---|---|---|
| EVAL-01 四层固定评测集 | ⚠️ | 仅 RAG 召回集 `rag-benchmark.ts`；四层集与 20–50 条事实长对话样本**不在仓库**，`opt-eval.mjs:1039` 标 requires-real-env |
| EVAL-02 评测执行脚本 | ⚠️ | `opt-eval.mjs` 存在，但一致率/连贯率为占位 |
| EVAL-03 归档 + manifest | ⚠️ | 有基线保存/对比，无正式 manifest |
| MEM-01 摘要记录模型 | ⚠️ | 缺"生成模型/失效原因/重建状态"落库字段 |
| MEM-02 摘要触发 + 重建 | ✅ | `chat.ts:2102` maybeGenerateSummary、`:2150` invalidate |
| MEM-03 记忆契约 | ✅ | `runtime/types.ts:284-300` 含 scope/confidence/source/validFrom/reviewStatus |
| MEM-04 候选记忆 + 确认 | ✅ | `RuntimeStatePanel.vue:162-186` 确认/拒绝/遗忘 |
| MEM-05 派生失效影响图 | ⚠️ | 摘要侧完整；记忆/向量无显式"源 Turn 节点"传播 |
| RAG-01 编排 + 注入来源 | ✅ | `context-builder.ts:112-152` ContextBuildRecord |
| RAG-02 检索解释 UI | ⚠️ | 有关键词/预算展示，缺逐条命中来源核查开关 |
| EXP-01 角色↔资源绑定 | ⚠️ | 仅世界书绑定；预设/正则未实现 |
| EXP-02 首次成功路径 | ✅ | `onboarding.ts` + OnboardingModal（通用引导） |
| CTX-01 Token 预算 | ✅ | `prompt-builder.ts:281` 优先级裁剪 |
| CTX-02 失败安全降级 | ✅ | 摘要/记忆/压缩三处 fail-open |
| OPT-01 压缩保真 + L1 校验 | ✅ | `compression.ts:182-199` 实体/情绪≥0.9、critical=1.0 |
| OPT-02 缓存/前缀验证 | ✅ | `inference-cache.ts` LRU+TTL；prefix SHA-256 isStable |

### 3.3 0.4.x 性能 / 交互（真实 0.5.0）

| 任务 | 状态 | 证据 |
|---|---|---|
| UX-01 长对话虚拟化 | ✅ | `ChatMain.vue:104-153` 双向窗口，DOM≤2×100，有压测脚本 + 测试 |
| UX-02 消息搜索/定位 | ✅ | `message-search.ts:32-70` + e2e `chat-search.spec.ts` |
| UX-03 群聊游标分页 | ❌ | `GroupChatView.vue:1100` 全量 v-for，`group-chat.ts` 无 cursor/pageSize，虚拟化未扩展到群聊 |
| UX-04 移动端大量资源性能 | ⚠️ | 有单角色长对话压测，缺 8 角色群聊 + 多世界书移动基线 fixture |
| UX-05 五主题冒烟 | ⚠️ | `theme-visual.spec.ts:10` 只测 4 主题，**缺 light** |
| UX-06 移动视觉 + 对比度 | ✅ | `custom-theme-contrast.spec.ts:15-34` 22 组≥4.5:1 WCAG AA |

### 3.4 0.5.0 故事创作工作区

缺口最大的一簇。代码中对应的是既有 **F16.x 小说分析引擎**，规格与计划不同。

| 任务 | 状态 | 证据 |
|---|---|---|
| STORY-01 作品/章节/场景模型 | ⚠️规格不符 | `story-types.ts:172-216` 是**分析结果模型**，无章节 CRUD/排序/归档 |
| STORY-02 时间线/故事事件 | ⚠️规格不符 | `story-time.ts:40-65` 是叙事时间推进；无故事事件↔Runtime Event 引用/回放 |
| STORY-03 故事分支 | ❌ | 故事模块无分支；`branch` 仅见 `character-version-control.ts:375-400`（角色版本，非故事） |
| STORY-04 统一资源管理 | ⚠️ | 有世界书绑定/导入 `story.ts:544-685`，无作品级统一资源面板/跨资源返回 |
| STORY-04A 角色发现/市场 | ✅ | `CommunityMarketView.vue:490-534` 搜索/筛选/收藏/来源 |
| STORY-04B 冒险启动/剧情状态面板 | ❌ | 无冒险流程与剧情状态面板（仅 i18n 命中）；角色 status HUD 非本项 |
| STORY-05 作品级导出/恢复 | ⚠️规格不符 | `backup.ts:41-103` 是**全 App** 备份，非按作品打包 + manifest/checksum |
| STORY-06 导入预览/字段映射 | ⚠️ | 有冲突策略 + 预检，无预览/字段映射/生成副本 |
| STORY-07 市场供应链元数据 | ✅ | `market-index.ts:20-49` version/sha256/license/deps；缺 license 拒装 `:41` |

### 3.5 0.6.0 模型与本地运行（散落实现）

| 任务 | 状态 | 证据 |
|---|---|---|
| MODEL-01 能力矩阵 | ⚠️ | 有 LocalModelMeta/InferenceMetrics 原料，无统一矩阵/云端实测 |
| MODEL-02 错误/取消/超时/重试 | ✅ / 自动重试⚠️ | 4 client 分类错误 + 取消；**LLM 层无按错误类型自动重试**（仅 UI 手动按钮） |
| MODEL-03 创作模式/采样 Preset | ❌ | 无 creativeMode/samplingPreset（仅字体/主题 preset，无关） |
| MODEL-04 TTS/图像（选做） | ⚠️ | 图像较全但取消是假；TTS 仅浏览器 Web Speech，非 provider 适配 |
| LOCAL-01 安装/缓存/量化/兼容 | ✅基本 | `local-model-engine.ts:120-309` WebGPU/vram/WASM 回退；hash/版本不符拒绝⚠️未见 |
| LOCAL-02 本地性能基准 | ⚠️ | `benchmark.ts` 是 RAG 微基准，非推理基准；无固定脚本 + 设备矩阵 |
| LOCAL-03 云端成本/延迟对照 | 📄 | 仅前缀缓存采集 + 接入文档 |
| LoRA（Gate/01/02） | 🔒后置 | `src/` 零命中，仅文档——符合 Gate 后置要求 |

### 3.6 1.0.0 冻结 / 迁移 / 扩展边界

| 任务 | 状态 | 证据 |
|---|---|---|
| CORE-01 数据模型冻结 | ✅ | `schema-contract.ts:29-72` + `core-data-contract.md` |
| CORE-02 Event/Reducer/Replay | ✅ | `runtime-core.ts:330,435-451`（计划误指 event-types.ts，那实为 StoryEvent） |
| MIG-01 跨版本迁移套件 | ⚠️（实为最大缺口） | `legacy-migration.ts` 仅 30 行 localStorage→adapter；`migrations/` 只有单个 001_*.sql，无逐版本步进、无 down |
| MIG-02 备份恢复 RTO/RPO | ⚠️ | backup 版本 + 加密 + e2e 齐；RTO/RPO 数值目标未定义 |
| API-01 Provider 稳定 | ⚠️ | 接口在，真实回归未跑；最小 provider 清单待确认 |
| EXT-01 扩展权限/市场边界 | ✅ | `extension-loader.ts:234-240` 默认拒绝 |
| EXT-02 Sandbox 渲染 | ⚠️ | CSP + DOMPurify 在，生成式 UI sandbox/能力白名单未建（符合计划"谨慎做"） |
| PRIV-01 隐私边界 | ✅ | api-key-crypto PBKDF2 600k+AES；禁明文导出密钥；审计日志无 key 值 |
| DEP-01 能力矩阵 | 📄 | 仅 README 散文，无结构化矩阵 |
| REL-1.0 发布回滚 | ⚠️ | release-evidence.mjs + 一次 DB 恢复演练；生产回滚平台待确认 |
| 质量门禁 8.1（13 项） | ⚠️ | 10 项有独立脚本；#12 备份/迁移无专用脚本；#13 真实 provider 回归**未跑**（无 key） |
| 证据包 8.2 | ⚠️ | manifest.json 把门禁标 'not-run'——**诚实不造假**，但 8.2 要求的逐项 result 文件未生成 |

---

## 四、总体结论与符合度

**总体符合度：约 70% 达标，工程诚信度高，但存在结构性缺口。**

约 63 个任务点分布：✅ 约 30、⚠️ 约 24、❌ 4、📄 3、🔒 1（合规后置）。

**做得好的地方（可信，有码有测）**：
- **0.3.1 Runtime/群聊生产化几乎全绿** —— 认证、租户授权、durable outbox、退避重试、半完成状态机、契约冻结，是全项目最扎实的一层。
- **0.4.0 记忆/摘要/RAG 主链完整** —— 契约、候选确认、失效重建、压缩保真校验、缓存前缀验证均落地。
- **1.0.0 冻结类任务扎实**，且对真实环境类任务（PG 事务、provider 回归）**诚实标注"未执行/待确认"而非伪造通过**——这是本项目最值得肯定的工程诚信。

**规格性偏差（做了但按另一套规格）**：第 5 章"故事创作工作区"的 STORY-01/02/05 —— 代码里是**小说分析引擎 + 全 App 备份**，与计划的"作品→章节→场景层级 + 按作品打包"不是同一设计。应判定为"计划与实现分道"，而非简单缺失。

---

## 五、修复优先级建议

按"风险 × 与 1.0.0 目标相关度"排序。P0 直接威胁 1.0.0"冻结即可迁移/可回滚"承诺，P1 影响质量闭环与可运维性，P2 为体验/功能补全。

> 进度标记：~~删除线~~ = 已完成；**已完成项见 §五.1 修复记录**。

### P0 — 阻断级（1.0.0 承诺的完整性）

| # | 缺口 | 建议 | 工作量 |
|---|---|---|---|
| 1 | ~~**MIG-01 跨版本迁移套件**~~ **已完成** | 见 §五.1 | 3–5 天 |
| 2 | ~~**OBS-01 correlation/trace ID**~~ **已完成** | 见 §五.1 | 2–3 天 |
| 3 | ~~**证据包 8.2 逐项 result**~~ **已完成** | 见 §五.1 | 1–2 天 |

### P1 — 质量闭环与可运维

| # | 缺口 | 建议 | 工作量 |
|---|---|---|---|
| 4 | **EVAL-01/02/03 评测闭环** | 补 20–50 条事实长对话样本 + 四层固定集，把 opt-eval.mjs 的一致率/连贯率从占位改为真实判定链。当前"质量闭环"尚未真正闭合。 | 3–4 天 |
| 5 | ~~**MODEL-02 自动重试**~~ **已完成** | 见 §五.1 | 1 天 |
| 6 | **DB-01 / API-01 真实环境回归** | 配置 CI 用 PG 实例 + 至少 1 个真实 provider key，让门禁 #13 与 PG 事务测试真正执行。 | 1–2 天（含环境） |
| 7 | ~~**MIG-02 RTO/RPO 目标**~~ **已完成** | 见 §五.1 | 0.5 天 |

### P2 — 体验/功能补全

| # | 缺口 | 建议 | 工作量 |
|---|---|---|---|
| 8 | **UX-03 群聊游标分页** | 将单聊虚拟化窗口机制扩展到 GroupChatView + group-chat store 加 cursor/pageSize。 | 2 天 |
| 9 | **MODEL-03 创作模式/采样 Preset** | 新增 creativeMode/samplingPreset 数据结构 + UI，接入各 provider 采样参数。 | 2–3 天 |
| 10 | ~~**UX-05 五主题冒烟补 light**~~ **已完成** | 见 §五.1 | 0.2 天 |
| 11 | **EXP-01 预设/正则绑定** | 参照 boundWorldBookIds 扩展 boundPresetId/boundRegex。 | 1–2 天 |
| 12 | **STORY 系列规格对齐** | 与产品确认：是补齐计划规格（章节层级/作品级打包/故事分支/冒险面板），还是把计划改为追认既有小说分析引擎。**先决策，再动工**。 | 需产品决策 |

> 建议节奏：先做 P0（1–2 周锁定 1.0.0 迁移与可观测性风险），再并行 P1 质量闭环；P2 中 STORY 系列须先经产品决策，避免继续"按另一套规格做"。

### 五.1 修复记录（2026-09-28）

本次已按上述优先级完成 3 项，每项均含源码 + 测试 + 门禁，未改动无关代码。

**① MIG-01 跨版本迁移套件（P0-#1）**

计划要求四项交付物全部落地（客户端快照线；服务端 SQL 线原已由 runbook 覆盖）：

| 交付物 | 落地位置 |
| --- | --- |
| migration fixtures | `tests/storage/snapshot-migration.test.ts` 中三条真实历史形态样本 |
| forward migration | `src/storage/snapshot-migration.ts` 信封 + 前向迁移链 |
| restore verification | `tests/storage/snapshot-restore.test.ts`（旧快照 → 真实 store 加载消费） |
| 兼容性报告 | `scripts/snapshot-migration-report.mjs`，门禁 `npm run snapshot:migration:check` |

- 版本信封 `{__snapshot, schemaVersion, data}`，写入端经 `wrapSnapshot` 产出；
- 三条**真实存在**的升级路径（不编造版本）：本地记忆三段式、群聊投递补 `occurredAt`/`status`、角色版本补 `activeLocks`；
- **无静默删除**不变式：链路断裂抛 `MISSING_STEP`、版本超前抛 `VERSION_AHEAD`、损坏记录原样保留；
- runbook 新增第 9 节记录客户端迁移线与新增变更操作步骤。

**② OBS-01 关联 ID（P0-#2）**

- 新增零依赖模块 `src/runtime/runtime-trace.ts`（不引 `import.meta.env`，保持 runtime 层可在 Node 复用）；
- 客户端注入 `x-runtime-request-id` → 服务端解析/兜底生成 → 响应头回显 → `onTrace` 上报方法/路径/状态/耗时；
- 失败时 `RuntimeApiError.traceId` 带上同一 ID；群聊 outbox 记录 `lastErrorTrace`；
- 测试 `tests/runtime/runtime-trace.test.ts`（8 项）；README 补充宿主接线示例。

**③ UX-05 五主题冒烟补 light（P2-#10）**

- `e2e/theme-visual.spec.ts` 主题数组补 `light`，凑齐五主题。

**④ MIG-02 RTO/RPO 目标（P1-#7）**

- `docs/dev/data-backup-restore.md` 新增 §4A：区分**已量化的本地目标**（RTO ≤ 15s、
  RPO ≤ 24h、成功率 100%）与**待确认的生产目标**（沿用计划 C-27 的【待确认】标注，
  不替部署方拍板）；
- `e2e/backup-restore.spec.ts` 在同一用例内**实测还原耗时**并在超限时失败，
  使 RTO 成为可验证证据；实测 **62ms**（上限 15000ms）。

**验证结果**：`vue-tsc` 通过；`vitest` 3527 passed（新增 32 项）；`eslint` 0 问题；`i18n:check:strict` 通过；`snapshot:migration:check` 通过；`playwright e2e/backup-restore.spec.ts` 1 passed。

**⑤ MODEL-02 LLM 层自动重试（P1-#5）**

- 新增 `src/api/llm-retry.ts`：只对**瞬时错误**（`rate-limit` / `server` / `network`）
  指数退避重试；`auth` / `invalid-url` / `cors` / `aborted` 等确定性错误立即抛出。
- **核心安全边界**：只在**连接阶段（尚未产出任何事件）**重试。一旦流已 yield
  内容，后续失败直接抛出——否则重发的流会从头生成，导致正文重复、状态块错乱。
  已产出后的失败仍走原有路径（UI 手动重试 / 群聊 outbox）。
- 接入 `chat-manager.sendMessage` 的流创建处（`withStreamRetry`），
  策略可由 `ChatManagerConfig.retryPolicy` 覆盖。
- 测试 `tests/api/llm-retry.test.ts`（12 项），含两条安全边界断言。

**⑥ 证据包 §8.2 逐项 result（P0-#3）**

- 新增 `scripts/release-evidence-pack.mjs`：**实际运行**可运行门禁，按计划 §8.2
  的结构**逐项落盘** result 文件（unit-integration / build / csp / i18n /
  css-contrast / runtime-schema / snapshot-migration / typecheck / lint），
  外加 `quality-gate-manifest.json`、`release-commit.txt`、`known-issues.md`；
- 依赖外部环境的门禁（真实 PG 事务、迁移恢复演练、Provider 回归）显式记为
  `skipped` **并写明原因**——保持原脚本"不伪造通过"的诚实策略；
- **§8.3 守卫**：`--check` 校验证据包 commit 是否等于当前 HEAD，
  拒绝"仅复用历史结果"；`--allow-skipped` 才放行环境受限项；
- 实测：9 项 passed / 0 failed / 5 skipped；篡改 commit 后 `--check` 正确 exit 1。
- 新增脚本 `release:pack` / `release:pack:full` / `release:pack:check`。

---

## 六、优化模块（未完成优化项）

本模块独立于计划任务审查，来源为 `docs/dev/PERF_OPTIMIZATION_2026-09-28.md`（性能优化实施报告）。该报告已实测完成 **5 项**低风险优化：并行化 store 初始化、profile 计算属性缓存、首屏图片优化（453KB→76KB）、统一日志服务、ort 首屏排除（部分）；首屏传输量 929KB→551KB（-40.7%）。

以下为**尚未完成**的优化项，多数在原报告中被列为"未实施/部分解决"，此处按风险与收益重新归档并给出建议优先级。

### 6.1 未完成优化项清单

| # | 优化项 | 当前状态 | 未完成原因 | 风险 | 建议优先级 |
|---|---|---|---|---|---|
| O-1 | ort 首屏彻底移除 | ⚠️部分缓解 | `index` entry chunk 仍静态 import `ort.bundle.min`（104KB gzip）；彻底解法需将 onnxruntime 隔离到独立入口 / Web Worker | 中（架构级） | **P1** |
| O-2 | chat.ts 拆分（2519 行 → 5 专职 store） | ❌未做 | 60+ 导出被全仓引用，属高风险架构重构（报告自估 2–3 天） | 高 | **P2**（独立迭代 + 充分回归） |
| O-3 | SettingsView.vue 拆分（4131 行 → 10+ 子组件） | ❌未做 | 高工作量、高回归风险 | 高 | **P2** |
| O-4 | 类型定义重组（types/ 分文件） | ❌未做 | 性能收益低；大范围 import 调整收益/风险比不佳 | 中 | **P3** |
| O-5 | 魔法数字提取为 constants | ❌未做 | LOW 优先级，属可维护性项 | 低 | **P3** |
| O-6 | IndexedDB 复合索引 | ❌未做 | 报告自称"推测"（未验证是否存在全表扫描）；需先做查询画像 | 低 | **P2**（先画像后决策） |
| O-7 | 事件总线改 mitt | ❌不建议做 | 需引入新依赖（与"不引入无关依赖"约束冲突），收益约 200 bytes | 低 | **不建议** |
| O-8 | SVG 整合为 sprite | ❌不建议做 | 收益微小 | 低 | **不建议** |
| O-9 | rollup-plugin-visualizer 接入 | ❌不建议做 | 会引入新 devDependency | 低 | **仅按需临时用** |

### 6.2 超大文件现状（来自 perf-report.md）

拆分类优化（O-2/O-3）针对的 9 个 >2000 行文件：

| 文件 | 行数 |
|---|---|
| SettingsView.vue | 4131 |
| StoryEngineView.vue | 3356 |
| en.ts / zh.ts | 3125 / 3123 |
| WorldBookView.vue | 2823 |
| chat.ts | 2519 |
| GroupChatView.vue | 2493 |
| SettingsModelPanel.vue | 2269 |
| CharacterEditorView.vue | 2224 |

> i18n 语言包（en.ts/zh.ts）体量属正常，不在拆分建议范围。

### 6.3 与计划任务的交叉关系

- **O-1（ort 首屏）** 与 §3.5 LOCAL-01 本地模型加载同源；若做 LOCAL 侧 onnx 隔离，可一并解决首屏回退问题，建议合并推进。
- **O-2（chat.ts 拆分）** 不属计划任一任务，纯代码质量/可维护性优化；但 chat.ts 是 0.3.1 Runtime/群聊接线的核心（§3.1 RT-02/04/06 均在此文件），拆分需与 Runtime 回归测试同步，风险等同架构重构。
- **O-6（IDB 索引）** 与 §3.6 CORE-01 数据模型冻结相关：冻结后再加索引受迁移套件（MIG-01, P0-#1）约束，建议在迁移框架就绪后进行。

### 6.4 优化项执行建议

- **可立即做**：无（低风险高收益的 5 项已在 9-28 完成）。
- **短期（配合 P0/P1）**：O-1 随 onnx 隔离方案推进。
- **中期（独立迭代）**：O-2、O-3 拆分须单独开分支 + 完整回归，不与其他改动混做；O-6 先出查询画像再决定。
- **暂缓/不做**：O-4、O-5（收益低）、O-7、O-8、O-9（引入依赖或收益微小）。

---

## 附录：状态图例与统计

| 图例 | 含义 | 计数 |
|---|---|---|
| ✅ | 已实现（有码，多数带测） | ~30 |
| ⚠️ | 部分实现 / 规格不符 | ~24 |
| 📄 | 仅文档 | 3 |
| ❌ | 缺失 | 4（UX-03、STORY-03、STORY-04B、MODEL-03） |
| 🔒 | 合规后置 | 1（LoRA） |

**4 个真实缺失项**：UX-03 群聊游标分页、STORY-03 故事分支、STORY-04B 冒险/剧情面板、MODEL-03 创作模式 Preset。
**最高风险 ⚠️ 项**：MIG-01 跨版本迁移套件（名义存在、实则最薄弱）。

---

*本报告由源码只读核查生成，所有结论附 file:line 证据；真实环境类任务的"未执行"状态如实标注，未以文档或计划存在替代实测。*

