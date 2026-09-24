# 《AI酒馆项目嵌入优化方案开发文档》实现对照审计

> 审计日期：2026-09-21
> 对照文档：`docs/design/AI酒馆项目嵌入优化方案开发文档.md`（v1.0，241 行，描述 L0/L1/L2 三层优化方案）
> 方法：逐项 grep + 读码核实，**不采信文档自称的完成度**

---

## 1. 结论摘要

| 维度 | 结论 |
|---|---|
| **代码实现度** | **很高** —— L0 / L1 / L2 三层的核心类与函数**全部存在**，接口与文档设计高度吻合（连阈值常量都一致） |
| **接线状态** | ✅ **三层全部已接线**（L0/L2 见 `chat-manager.ts:247/258`；L1 经 `compressMessages` 于 `:270` 接入） |
| **默认生效** | ❌ **三层默认全关**（`enabled: false`），即当前默认行为 = 未启用优化 |
| **技术栈** | 文档假设 Python/FastAPI/SQLite，实际是 **TS/Vue/IndexedDB** —— 属**有意平移**（文档 §4.3 明确"接口与数据结构保持语言无关，可平移"），非偏差 |

**一句话**：**功能基本都写了，也接上了，但默认没开。**

> ⚠️ **更正声明**：本文档初版曾判定「L1 未接线、`l1Enabled` 是死开关」，**该结论错误**，
> 已在 §3.2 更正并记录误判原因。经复核，三层均已完整接线。

---

## 2. 逐项对照表

### 2.1 L0 上下文结构层 —— ✅ 已实现且已接线

| 文档要求 | 实现状态 | 位置 |
|---|---|---|
| `MemoryStore`：稳定 ID + 修订号 + 快照 + diff + restore | ✅ 完整 | `src/core/memory-store.ts:87` |
| `CharacterRegistry`：前缀组装 + `prefix_hash` | ✅ 完整 | `:201`（`l0-l2-runtime.ts:146` 产出 `prefixHash`） |
| `EmotionTracker`：会话级情绪状态机 | ✅ 完整 | `:241` |
| **防覆盖硬约束**（standing 事实拒绝非人工写） | ✅ **已实现** | `:100` `if (fact.scope === 'standing' && author !== 'human')` |
| `author` 字段区分 human / optimizer | ✅ | `:43`、快照亦记录 author（`:80`） |
| 前缀稳定率可观测 | ✅ 超出文档 —— 有 **UI 展示** | i18n `chat.prefixStable`（"前缀稳定 {percent}%"） |
| 情绪标注器 | ⚠️ **部分** | `l0-l2-runtime.ts:188` 仅用规则词表 `detectEmotion`，**无文档要求的"置信度低时调 LLM(temperature=0)"回退** |
| 情绪写失败 fail-open | ✅ | `:195` `catch { return false }` |

### 2.2 L2 输出纪律层 —— ✅ 已实现且已接线

| 文档要求 | 实现状态 | 位置 |
|---|---|---|
| `classify_scope` 旁白分类（4 类） | ✅ | `output-discipline.ts:58`（`NarrationScope`） |
| `compress` 仅 meta_narration 生效 | ✅ | `:155` `compressMetaNarration` |
| `protect` / `restore` 哨兵保护 | ✅ | `:98` / `:133` |
| 情绪词表 | ✅ | `:24` `EMOTION_WORDS` |
| Auto-Clarity 软约束 | ✅ | `:181` `buildAutoClarityPrompt` |
| 接线 | ✅ | `chat-manager.ts:258` `applyOutputDiscipline` |

### 2.3 L1 内容压缩层 —— ⚠️ **代码完整，但未接线**

| 文档要求 | 实现状态 | 位置 |
|---|---|---|
| `ExtractiveCompressor`（句切分 → 打分 → 去重 → 重组） | ✅ 代码完整 | `compression.ts:71` `extractiveCompress` + `:20` `splitSentences` |
| `SemanticValidator`（实体/情绪词保留率校验） | ✅ 代码完整 | `:162` `validateCompression` |
| `CcrStore`（哈希键暂存原文 + TTL） | ✅ 代码完整 | `:193` |
| 触发条件 70% / 80% + 冷却 | ✅ 常量与文档**完全一致** | `:260-262` `SOFT_THRESHOLD=0.7` / `HARD_THRESHOLD=0.8` / `COOLDOWN_ROUNDS=3` |
| 三级回退（3 次失败暂停） | ✅ | `:263` `MAX_CONSECUTIVE_FAILURES=3` |
| 豁免黑名单 | ✅ | `:287` `isExempt` |
| **接入主流程** | ✅ **已接线** | `chat-manager.ts:270` → `optimization-pipeline.ts:277` `compressMessages` → `:170` `runL1`（内部串联 `isExempt` → `extractiveCompress` → `validateCompression`） |
| 豁免规则（接入侧） | ✅ | `compressMessages` 跳过 system 消息与当前轮 user 消息（`optimization-pipeline.ts:289`） |

> 打开 `l1Enabled` 后压缩**会真实发生**。唯一问题是它**默认关闭**。

### 2.4 与文档不同的地方（多为合理差异）

| 文档要求 | 实际 | 评价 |
|---|---|---|
| BM25 召回（`rank_bm25`，移植 `bm25.go`） | **未采用**，改用**向量检索**（ONNX 嵌入） | 🟢 **合理的架构替换** —— 语义召回通常优于 BM25 关键词召回，且项目已有 ONNX 基建 |
| LLM 摘要（temperature=0 + 内容哈希持久化） | `summarizer.ts` 已实现，**但全项目零调用** | 🟡 与 L1 一样属"写了没接" |
| `baseline.json` 基线 + locust 压测 + 1.2 指标自动化评估 | **无**（仅 `scripts/p11-baseline.mjs` 性能基线） | 🟡 验收体系缺失，1.2 指标表无法自动复跑 |
| Python / FastAPI / SQLite | TS / Vue / IndexedDB | 🟢 文档已声明可平移，非偏差 |

### 2.5 测试覆盖 —— ✅ 齐备

`tests/core/compression.test.ts`、`optimization-pipeline.test.ts`、`inference-cache.test.ts` 均存在。

---

## 3. 关键差异分析

### 3.1 最要紧的一条：默认全关

```ts
// optimization-pipeline.ts:43
return { enabled: false, l0Enabled: false, l2Enabled: false, l1Enabled: false, stage: 'off' };
```

三层默认**全关**，需用户在设置页手动开启。这意味着：

- 文档 §1.2 的效果指标（缓存命中 ≥60%、输出 token 节省 20-40% 等）**在当前默认配置下完全不生效**；
- 之前分析发现的"上下文靠硬裁最早历史、早期剧情丢失"，正是**因为 L0/L1 没开**。

### 3.2 关于 L1 —— **本文档曾误判，此处更正**

初版审计判定「L1 未接线、`l1Enabled` 是死开关」，**该结论错误**。
实际链路完整：`chat-manager.ts:270` → `compressMessages`（`optimization-pipeline.ts:277`）
→ `OptimizationPipeline.runL1`（`:170`）→ 内部串联 `isExempt` → `extractiveCompress` → `validateCompression`。

**误判原因（方法论教训）**：只 grep 了**底层函数名**（`decideCompression` / `extractiveCompress` /
`validateCompression` / `CcrStore`），而这些函数是被 `OptimizationPipeline` 类**封装**后，
由更高层的 `compressMessages` 调用的 —— **封装层的调用被漏掉了**。

> **教训**：核实"某能力是否接线"时，必须**同时搜索「底层函数名」与「其所在模块的高层导出」**。
> 只查底层会把"已封装接线"误判为"未接线"。本次另一条结论（`summarizer` 未接线）
> 已用宽模式（含大小写与封装名）**重新验证过**，仍然成立。

### 3.3 真正的问题只有一个：默认全关

三层**都已接线、都已实现**，但默认全关。这才是当前体验痛点的根因。

### 3.3 与文档的定位差异

文档是"从零建设方案"（7 周排期、4 人分工、灰度路径），而实际项目**已经把这套东西实现完了**。所以文档当前的正确读法不是"待办清单"，而是**"已实现能力的规格说明"**。

---

## 4. 建议

| # | 建议 | 理由 |
|---|---|---|
| ~~1~~ | ~~接线 L1~~ | ✅ **无需做** —— 已完整接线（见 §3.2 更正），只需打开开关 |
| 2 | **明确三层的默认策略**（**当前唯一真正待决的事**）：至少把 L0 设为默认开启 | 三层都已接线，但默认全关 —— 这**就是**体验痛点的根因。L0 只做前缀稳定 + 情绪状态，无压缩风险，收益（前缀缓存命中）明确 |
| 3 | 接线 `summarizer`，与 L1 的"检索式移出"配合 | 解决"硬裁最早历史"导致的早期剧情丢失 |
| 4 | 补 1.2 指标表的**可复跑评估脚本** | 否则"是否达标"无法验证，文档承诺的验收形同虚设 |
| 5 | 文档层面：把本文档从"建设方案"改注为"规格说明 + 接线状态" | 避免后来者以为功能没做 |

---

## 5. 审计局限

- 仅核实**代码层面的存在与调用关系**，未做**运行时实测**（未实际开启三层跑对话验证效果）；
- 情绪标注"LLM 回退"的缺失是依据 `updateEmotionState` 实现判断，未排除在别处另有实现；
- 1.2 指标表（如缓存命中率、token 节省）**均未实测**，本文档不对其是否达标下结论。
