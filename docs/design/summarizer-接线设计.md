# 摘要（Summarizer）接线设计

> 日期：2026-09-21 ｜ 依据：`docs/dev/优化能力激活-后续路线图.md` 的 1-B
> 背景：`src/core/summarizer.ts` 完整实现（含配置、服务、注入器），
> UI 也有配置项（`SettingsView.vue:1570-1604`），**但全项目无消费方**。

---

## 1. 现状

| 组件 | 状态 |
|---|---|
| `SummarizationConfig` | ✅ 完整，**默认 `enabled: true`**（threshold 4000 / keepRecent 10 / maxSummaryTokens 500 / temperature 0.3） |
| `shouldSummarize(messages, config, existingSummary)` | ✅ 实现（按 token 阈值 + keepRecent 判断） |
| `DefaultSummarizationService.summarize(...)` | ✅ 实现（基于 ApiClient，调用 LLM） |
| `injectSummary(messages, summary)` | ✅ 实现（在首条非 system 消息前插入 system 摘要） |
| `ConversationSummary` | ✅ 结构完整（含 `lastCoveredMessageIndex` 支持增量） |
| **消费方** | ❌ **无** |

---

## 2. 三个未决问题的决策

### 决策一：触发时机 —— **异步，不阻塞用户感知**

| 方案 | 评价 |
|---|---|
| 组装上下文时**同步**生成 | ❌ 摘要需一次完整 LLM 调用（秒级），会直接推高**首 token 延迟** |
| **回复完成后异步生成**（推荐） | ✅ 用户无感知；摘要滞后一轮生效，但对话是持续的，可接受 |

**决定**：在 `sendMessage` 的**流式结束之后**触发（fire-and-forget），失败静默。
摘要未就绪时，本轮仍走原有裁剪逻辑 —— **天然 fail-open**。

### 决策二：摘要存储 —— **挂在会话（Chat）上**

`ConversationSummary` 的注释已指明"存储到 chat 元数据"，故：

- `Chat` 类型增加可选字段 `summary?: ConversationSummary`
- 随会话一起持久化（复用既有 chat 持久化链路，无需新存储层）
- 未生成过摘要的会话该字段为 `undefined` → 向后兼容，**零迁移**

### 决策三：与 L1 的分工 —— **摘要管"最早"，L1 管"窗口内"**

两者都在处理长历史，必须划清边界，否则重复压缩：

| 层 | 处理对象 | 手段 | 成本 |
|---|---|---|---|
| **摘要** | **被裁掉的最早历史**（即将移出窗口的部分） | LLM 生成一段概要 | 有（一次调用） |
| **L1 压缩** | **仍在窗口内的历史消息** | 提取式规则压缩（删填充词、保原句） | 零 |

**执行顺序**（在 `buildPrompt` 之后）：

```
1. 若 shouldSummarize(...) 为真（异步触发时判断）→ 生成/更新 summary
2. 组装上下文时：若 summary 存在 → injectSummary(messages, summary)
3. 再走既有裁剪（硬裁最早历史）—— 此时被裁的已是被摘要覆盖过的部分
4. 最后走 L1 压缩（compressMessages）
```

**关键**：`injectSummary` 注入的摘要**必须豁免于 L1 压缩**（它是 system 消息，而
`compressMessages` 已跳过 system 与当前轮 user → **天然满足**）。

---

## 3. 改动清单

| # | 文件 | 改动 |
|---|---|---|
| 1 | `src/types/index.ts` | `Chat` 增加 `summary?: ConversationSummary` |
| 2 | `src/core/character-card.ts` | 若 Chat 的持久化结构在此定义，同步加字段（含 legacy 回退） |
| 3 | `src/services/chat-manager.ts` | ① 流式结束后异步触发 `shouldSummarize` → `summarize`；② 组装上下文后 `injectSummary` |
| 4 | `src/stores/chat.ts` | 保存生成的 summary 到当前会话并持久化 |
| 5 | 测试 | `shouldSummarize` 触发条件、`injectSummary` 注入位置、fail-open、向后兼容 |

---

## 4. 风险与回退

| 风险 | 缓解 |
|---|---|
| 摘要调用失败 | **fail-open**：静默保留旧摘要（或 null），主链路不受影响 |
| 摘要引入额外 token 成本 | 受 `maxSummaryTokens`（默认 500）限制；且**只在超阈值时触发** |
| 摘要质量差 → 反而污染上下文 | `temperature: 0.3`（配置）；失败/为空时不注入；用户可关（`SummarizationConfig.enabled`） |
| 与 L1 重复压缩 | 已按「摘要管最早、L1 管窗口内」划清；摘要注入为 system 消息，被 L1 天然豁免 |
| 多轮重复摘要同一段历史 | `lastCoveredMessageIndex` 支持增量，`shouldSummarize` 只统计**未被覆盖**的部分 |

**回退**：把 `SummarizationConfig.enabled` 置 false 即完全停用（配置已存在且有 UI）。

---

## 5. 不做什么（边界）

- **不改** `summarizer.ts` 自身（实现已完备）
- **不改** L1 的压缩逻辑（职责不同）
- **不动** 三层优化的默认开关（L0 已按产品决策默认开；L2/L1 维持默认关）
- **不做** 摘要的 UI 展示（当前只需存储与注入；展示属后续可选项）
