# AI 酒馆 · 虚拟对话完整流程技术分析

> 目的：系统性梳理「一次 AI 生成」从用户点击发送到消息落盘的完整链路，标注每个环节的**实现方式**（模型能力 / 工程规则）、**关键代码位置（文件:行）**，并给出换模型收益的评估依据。
>
> 代码基线：`src/`（Vue3 + Pinia + TS，Tauri/Web 双端）。所有行号以当前工作区为准。
>
> 阅读提示：本文档只描述**现状**，不提出改造建议；「换模型收益」判断见 §5。

---

## 0. 结论速览

- **链路一句话**：`chat store.sendMessage` → `buildChatSessionContext`（世界书/资料库/事件/主角/故事时间）→ `ChatManager.sendMessage` → `buildPrompt`（系统提示词组装 + Token 裁剪）→（可选 L0/L1/L2 优化）→ `ApiClient.chatStream`（SSE 流式）→ `ThinkingSplitter`/`statusSplitter` 双状态机剥离 → `onDelta` 逐字上屏 → `persistChat` 落盘。
- **L0-L2 分层运行时**：是叠加在主链路上的**可选优化层**（默认全关），三层各管一件事——**L0 = 上下文结构**（字节稳定前缀 + 会话情绪状态机，目标命中前缀缓存）、**L1 = 内容压缩**（纯规则的提取式压缩 + 语义校验 + 三级回退）、**L2 = 输出纪律**（纯规则的旁白精简 + 哨兵保护 + Auto-Clarity 软声明）。
- **核心判断**：本项目**大量使用工程规则兜底**（触发、压缩、解析、情绪、裁剪、命令），真正依赖「模型自身能力」的是**演绎质量、结构化输出合规率、长程一致性、工具调用决策**四类。**换模型的主要收益点集中在后者**，而非这些规则层。

---

## 1. 端到端链路图

```mermaid
flowchart TD
    U[用户输入文本] --> SC{是斜杠命令?}
    SC -- 是 --> CMD[斜杠命令引擎<br/>slash-command.executePipeline<br/>确定性执行, 不走 LLM]
    SC -- 否 --> CTX

    subgraph 上下文准备["① 上下文准备 (chat store)"]
        CTX[buildChatSessionContext<br/>chat-context.ts:142]
        CTX --> LB[世界书收集<br/>collectLorebooksForCharacter:54]
        CTX --> RAG[资料库 RAG 关键词检索<br/>data-bank → rag-retriever]
        CTX --> EVT[事件触发扫描<br/>trigger-engine.scanTriggers:78]
        CTX --> PRO[主角身份<br/>protagonist.buildProtagonistPrompt:194]
        CTX --> ST[故事时间<br/>story-time.buildStoryTimePrompt:282]
        CTX --> VRAG[双通道向量检索<br/>dual-channel-runtime:282 默认关]
    end

    CTX --> CM

    subgraph 编排层["ChatManager.sendMessage (chat-manager.ts:194)"]
        CM[构建 PromptSettings / 状态指令] --> BP[buildPrompt<br/>prompt-builder.ts:80]
        BP --> L0{{L0 上下文结构<br/>默认关}}
        L0 --> L2{{L2 输出纪律<br/>默认关}}
        L2 --> L1{{L1 内容压缩<br/>默认关}}
        L1 --> REQ[构造 ChatRequest<br/>采样/思考强度/工具]
    end

    REQ --> API[ApiClient.chatStream<br/>openai / anthropic / tauri / local]
    API --> SSE[SSE 流式解析<br/>逐 delta yield]

    subgraph 输出后处理["流式后处理 (chat-manager.ts:390-462)"]
        SSE --> TS[ThinkingSplitter<br/>剥离 think 标签<br/>thinking-parser.ts:86]
        TS --> SS[statusSplitter<br/>剥离 status 标签<br/>status-parser.ts:81]
        SS --> DL[onDelta → UI 逐字上屏]
        SS --> DN[done 收敛<br/>parseThinkingComplete + convergeStatus]
        DN --> ST2[parseStatusBlock<br/>status-parser.ts:298]
        DN --> EM[updateEmotion<br/>情绪状态更新 l0-l2-runtime.ts:180]
    end

    DN --> DONE[onDone → 消息定稿]
    DONE --> PERSIST[persistChat<br/>chat.ts:935 → StorageAdapter]
    PERSIST --> DB[(IndexedDB / Tauri FS)]

    DONE --> RAND[随机事件决策(异步)<br/>chat.ts:990 → LLM 生成]
    DONE --> TT[故事时间推进<br/>story-time.recordTurnEnd:204]
```

---

## 2. 分阶段总表

| # | 环节 | 做什么 | 实现方式（模型 / 工程） | 关键代码位置 |
|---|------|--------|------------------------|--------------|
| 1 | 上下文准备 | 收集世界书、RAG、事件、主角、故事时间、向量检索 | **工程**（关键词/规则/概率）；世界书内容靠模型理解 | `chat-context.ts:142`、`rag-retriever.ts:75/193`、`trigger-engine.ts:78`、`dual-channel-runtime.ts:282` |
| 2 | 意图识别 | 命令路由 + 工具调用决策 + 事件触发 | **混合**：命令/事件=工程规则；工具调用=**模型能力** | `chat.ts:444`、`slash-command.ts:752`、`tool-registry.ts:95`、`chat-manager.ts:339` |
| 3 | 情绪建模 | 会话级情绪状态机（规则词表）+ 状态块 mood（模型） | **混合**：规则词表为主，mood 字段靠模型 | `output-discipline.ts:34`、`memory-store.ts:241`、`l0-l2-runtime.ts:180` |
| 4 | 记忆机制 | 短期历史 / 长期向量库 / 资料库 / 结构化 MemoryStore | **工程**（检索/版本化）；摘要质量靠模型 | `memory-store.ts:87`、`dual-channel-runtime.ts`、`summarizer.ts:216`（未接线） |
| 5 | L0-L2 运行时 | 前缀稳定 / 内容压缩 / 输出纪律 | **纯工程规则**，无 LLM 依赖 | `l0-l2-runtime.ts`、`compression.ts`、`output-discipline.ts`、`optimization-pipeline.ts` |
| 6 | 提示词组装 | 角色定义 + 注入段拼接 + 宏替换 + Token 裁剪 | **工程**（拼接/裁剪）；内容遵守靠模型 | `prompt-builder.ts:80`、`macro.ts:16`、`status-prompt.ts:62` |
| 7 | 模型调用与流式 | 多 provider 客户端 + SSE 解析 + 工具循环 | **工程**（协议适配）；生成质量靠模型 | `api/index.ts:39`、`openai-client.ts:82`、`anthropic-client.ts:160`、`chat-manager.ts:345` |
| 8 | 输出后处理 | 剥离 think/status、状态解析、旁白精简、渲染 | **工程**（状态机/降级链） | `thinking-parser.ts:86`、`status-parser.ts:298`、`l0-l2-runtime.ts:80` |
| 9 | 持久化 | 消息（含 thinking/status/token）落盘 | **工程** | `chat.ts:935`、`storage-adapter.ts:20`、`storage/types.ts:7` |
| 10 | 其他模块 | 随机事件、故事引擎、群聊、扩展、本地模型 | **混合** | `random-event-generator.ts:89`、`story-time.ts`、`local-api-client.ts:81` |

---

## 3. 逐环节详解

### ① 上下文准备

**做什么**：在一次生成前，把角色卡之外的"动态上下文"全部组装好，作为 `PromptContexts` 传入 prompt-builder。

**入口**：`buildChatSessionContext(character, { ragMessages, allowEventTrigger })` — `src/stores/chat-context.ts:142`。这是 `sendMessage` 与 `regenerateMessage` **共用的唯一流水线**（历史上 regenerate 曾漏注入 RAG/主角/故事时间，此模块统一修复）。

包含 6 类注入：

| 注入项 | 生成方式 | 代码位置 |
|--------|---------|---------|
| 世界书 Lorebook | 关键词/正则匹配 + 层级继承 + 概率 + 包含组 | `lorebook-scanner.ts:321`（`scanLorebooks`）、`chat-context.ts:54`（收集范围） |
| 资料库 RAG | 中文 2/3-gram + 英文分词 → 停用词过滤 → 词频 Top20 → chunk 包含匹配 Top3 | `rag-retriever.ts:75`（`extractKeywords`）、`:193`（`retrieveRelevantChunks`） |
| 激活事件 | 关键词/依赖/时间/概率触发，每轮最多 1 个 | `trigger-engine.ts:78`（`scanTriggers`）、`:259`（`buildActiveEventsInjection`） |
| 主角身份 | 从故事配置纯文本拼接 | `protagonist.ts:194`（`buildProtagonistPrompt`） |
| 故事时间 | 按策略推进 + 格式化 | `story-time.ts:282`（`buildStoryTimePrompt`）、`:204`（`recordTurnEnd`） |
| 双通道向量检索 | 本地 ONNX 嵌入（动态层记忆 + 静态层设定），时间衰减 | `dual-channel-runtime.ts:282`、`:111`（`VectorRagRuntime`）、`:81`（`decay`） |

**要点**：
- 向量检索**默认关闭**（`localStorage['aijiuguan.vectorRagEnabled'] !== '1'` 即关），`dual-channel-runtime.ts:31`。
- 所有注入**只进动态段**（`ragContext` 走 user turn 前），**绝不触碰 standing 前缀**——这是保前缀缓存的契约，见 `dual-channel-runtime.ts:5`。
- 事件触发在 `sendMessage` 允许改状态（`allowEventTrigger: true`），`regenerateMessage` 仅注入不改状态。

---

### ② 意图识别

**做什么**：判断"这句话要干什么"。项目**没有独立的 LLM 意图分类器**，意图识别分散在三个机制：

1. **斜杠命令路由**（工程，确定性）：`chat.ts:444` 判断 `isSlashCommand(text)`（`slash-command.ts:334`），命中则走 `executePipeline`（`slash-command.ts:752`），**完全不调用 LLM**。命令含 `/setvar`、`/dice`、`/time`、事件操作等，支持管道与扩展命令（`extensionRegistry.getSlashCommands()`）。
2. **工具调用决策**（模型能力）：`getBuiltinToolDefinitions()`（`tool-registry.ts:95`）提供 `get_var` / `set_var` / `search_lorebook` / `retrieve_document` 四个工具，**由模型自主决定是否调用**。执行器 `executeBuiltinTool`（`tool-registry.ts:116`）。
3. **事件触发**（工程，规则/概率）：`trigger-engine.ts:78` 用关键词/正则/依赖/时间比对 + `Math.random()` 概率判定，每轮最多触发 1 个。

**要点**：意图识别的"重活"（工具调用）交给模型，其余全部是规则引擎。换模型对**工具调用准确率**有直接收益。

---

### ③ 情绪建模

**做什么**：维护"当前情绪状态"，分两条独立路径：

**路径 A：L0 会话级情绪状态机（工程，规则）**
- 情绪词表 `EMOTION_WORDS`（24 个中文情绪词）— `output-discipline.ts:24`
- 标注函数 `detectEmotion(text)`：扫描首个命中词返回标签，无命中返回 `null` — `output-discipline.ts:34`
- 状态机 `EmotionTracker`：按 `sessionId` 存储 `{label, reason, revision}`，fail-open — `memory-store.ts:241`
- 每轮回复完成后 `updateEmotionState` 写入 — `l0-l2-runtime.ts:180`，由 `ChatManager.updateEmotion` 触发（`chat-manager.ts:571`，仅在 L0 启用时）
- 下一轮通过 `applyL0Context` 注入到 system 的 `[当前情绪状态]` 段 — `l0-l2-runtime.ts:129/155`

**路径 B：状态块 `mood` 字段（模型能力）**
- 通过提示词要求模型输出 `<status>{...}</status>`，其中 `mood` 是内置字段之一 — `status-prompt.ts:62`、`status-schema.ts:144`
- 解析后进入 `CharacterStatus.entries`，UI 以 sticky 状态条渲染 — `status-parser.ts:298`、`resolveLatestStatus`（`:400`）

**要点**：情绪建模**主要靠工程词表**，模型只贡献 `mood` 字段（且需全局/角色开关显式打开才注入指令，默认关）。这是典型的"工程兜底过重、模型能力利用不足"环节。

---

### ④ 记忆机制

**做什么**：分层记忆，共 4 条路径（成熟度差异很大）：

| 层级 | 机制 | 状态 | 代码位置 |
|------|------|------|---------|
| 短期 | 完整对话历史（受 Token 裁剪） | **启用** | `prompt-builder.ts:198-205` |
| 中期 | LLM 摘要（阈值 4000 token，保留最近 10 条） | **已实现但未接线** | `summarizer.ts:108/216/307` |
| 长期-检索 | 资料库 RAG（关键词）+ 双通道向量库 | 关键词启用；向量默认关 | `rag-retriever.ts`、`dual-channel-runtime.ts` |
| 结构化 | `MemoryStore` 版本化事实（standing/scoped，修订号/快照/diff/恢复） | **仅种入 standing 角色事实，未持久化** | `memory-store.ts:87`、`chat.ts:402` |

**关键事实**：
- `MemoryStore` 是**内存实现**，`chat.ts:192` 注释明确"持久化接线待续"。当前仅 `seedStandingFacts`（`chat.ts:402`）把角色卡核心字段以 `char-<id>` 写入一次，作为 L0 字节稳定前缀的数据源；`scoped` 事实（优化器可写）**尚无写入方**。
- 摘要能力（`summarizer.ts`）已在 `settings.ts:95` 暴露配置、`SettingsView.vue:1571` 提供开关，但**在对话主链路中没有任何调用点**（grep `injectSummary` / `shouldSummarize` 仅命中定义与设置）。
- 向量库写入接口 `addDynamic` / `addStatic`（`dual-channel-runtime.ts:237/244`）存在，但对话链路只调用检索（`retrieve`），**未见自动写入对话记忆的调用**。

**要点**：记忆机制目前**以"完整历史 + 关键词 RAG"为主**，结构化记忆与摘要两条更强的路径处于"半成品"状态。

---

### ⑤ L0-L2 分层运行时

**做什么**：一套**可选**（默认全关）的上下文/输出优化层，三层各司其职。总开关与分开关见 `OptimizationConfig`（`optimization-pipeline.ts:28`），默认全关（`createDefaultConfig` `:42`），配置持久化到 `localStorage['ai-roleplay:optimization-config']`（`:48`），UI 开关在 `SettingsView.vue:951`。

#### L0 上下文结构层 — `l0-l2-runtime.ts:129`（`applyL0Context`）
- **字节稳定前缀**：`CharacterRegistry.assemblePrefix(base, sessionId)` 按固定顺序拼接 `base → standing 角色事实 → standing 世界观事实`，稳定排序（按 id），输出 SHA-256 哈希 — `memory-store.ts:211`
- **前缀哈希对比**：`prefixHash` 每请求计算，用于验证"同输入必同输出"（前缀缓存命中的必要条件）
- **会话情绪状态注入**：`tracker.current(sessionId)` → 追加 `[当前情绪状态]` 段（≤200 字，防御异常大文本）— `:150-158`
- **写保护**：`standing` 事实仅允许 `author='human'` 写入，优化器写会抛错（存储层硬约束，非提示词软约束）— `memory-store.ts:100`

#### L1 内容压缩层 — `compression.ts` + `optimization-pipeline.ts:170`
- **提取式压缩** `extractiveCompress`：句切分（中英标点）→ 打分（相关性×2 + 显著性×3 + 长度）→ 贪婪选取 + 3-gram 去重（重叠 >0.6 判冗余）→ 按原序重组 — `compression.ts:71`
- **语义校验** `validateCompression`：实体/情绪词保留率 ≥0.9 且关键实体 100% 保留才通过 — `compression.ts:162`
- **CCR 无损端到端** `CcrStore`：哈希键暂存原文 + 滑动 TTL，有损在线、无损可取回 — `compression.ts:193`
- **触发条件**：软阈值 70% / 硬阈值 80% / 冷却 ≥3 轮 / 连续失败 ≥3 暂停 — `compression.ts:260-263`、`decideCompression` `:272`
- **三级回退**：校验不过→回退原文；连续失败≥3→暂停；配置关→全关（`optimization-pipeline.ts:170` `runL1`）
- **挂载点**：`compressMessages`（`optimization-pipeline.ts:277`）在 buildPrompt 之后、发送之前，仅压缩 ≥200 字的历史 assistant 消息，system 与当前 user 豁免

#### L2 输出纪律层 — `l0-l2-runtime.ts:80`（`applyOutputDiscipline`）
- **旁白分类** `classifyScope`：引号占比≥50% → 对白（硬豁免）；命中情绪词 → 情绪旁白（硬豁免）；命中状态动词 → 状态性旁白（可精简）— `output-discipline.ts:58`
- **保护哨兵** `protect`/`restore`：对白/情绪词/设定实体替换为 `\u0000PROTECTn\u0000` 占位符，压缩后还原，保证零损失 — `output-discipline.ts:98/133`
- **状态性旁白压缩** `compressMetaNarration`：仅删填充词（"似乎/然后/其实"等 14 个）+ 折叠 3+ 连续同字 — `output-discipline.ts:155`
- **Auto-Clarity 软声明** `buildAutoClarityPrompt`：安全/不可逆/情绪冲突/重复提问时恢复完整表达，追加到 system — `output-discipline.ts:181`、注入见 `l0-l2-runtime.ts:161`

**要点**：**L0-L2 全部是纯工程规则，零 LLM 依赖**（`output-discipline.ts:12`、`compression.ts:12` 明确"无 LLM 依赖"）。这是"工程兜底"最集中的区域。

---

### ⑥ 提示词组装

**做什么**：把角色卡 + 全部注入上下文拼成最终 messages，并做 Token 预算裁剪。

**入口**：`buildPrompt(card, history, userMessage, settings, contexts)` — `prompt-builder.ts:80`

**system 内容拼接顺序**（`prompt-builder.ts:179`）：
```
systemPrompt(全局)
  → worldDescText(世界书顶层世界观)
  → beforeText(beforeCharDefs 条目)
  → charDef(Name/Description/Personality/Scenario)
  → attributesText([角色属性])
  → afterText(afterCharDefs 条目)
  → eventsContext(激活事件)
  → protagonistContext(主角)
  → storyTimeContext(故事时间)
  → statusContext(状态块指令, 可选)
```
整段再经 `replaceMacros`（`macro.ts:16`）替换 `{{user}}`/`{{char}}`/`{{getvar::}}`/`{{setvar::}}`。

**消息列表组装**（`prompt-builder.ts:185-242`）：
1. system
2. 历史消息（`assistant` 的 `thinking` 默认**不回传**，仅 `includeThinkingInHistory=true` 时内存包成 `<think>` 前缀，**不落盘**）— `:197-205`
3. `atDepth` 深度注入条目（按 depth 从末尾往前插入）— `:208-222`
4. 作者笔记 `characterNote` — `:225-231`
5. RAG 检索结果（`ragDepth`，默认 0）— `:234-239`
6. 当前 user 消息

**Token 预算裁剪**（`prompt-builder.ts:244-255`）：
```
budget = maxContextTokens - reservedTokens   // 默认 8192 - 1024 = 7168
while (tokenCount > budget && messages.length > 2) {
  messages.splice(1, 1);   // 移除 system 之后的第一条历史消息（即最早的历史）
}
```
保留 system 与最新 user，**从最早历史开始丢**。Token 计数用 `gpt-tokenizer`（`token-counter.ts:36`，动态 import 懒加载），`countMessageTokens` 含每条 4 token + 整体 3 token 开销（`:56`）。

**要点**：组装是**纯字符串拼接 + 硬裁剪**，模型能力体现在"能否理解并遵守这些注入"。裁剪策略是"丢最早"，**没有滑动窗口 + 摘要**的配合。

---

### ⑦ 模型调用与流式

**做什么**：把请求发给对应 provider，解析 SSE，逐 delta 回吐。

**客户端工厂**：`createApiClient(profile)` — `src/api/index.ts:39`，按 provider / 环境选择：
- `local` → `LocalApiClient`（浏览器内 WebLLM，`local-api-client.ts:81`，队列+唤醒适配同步回调）
- `anthropic` → `AnthropicClient`（原生 Messages API，`anthropic-client.ts:160`）
- Tauri 环境 → `TauriOpenAIClient`（Rust reqwest 绕过 CORS）
- 其余（openai/custom/deepseek）→ `OpenAIClient`（`openai-client.ts:82`）

**请求体构造**：`ChatManager.sendMessage` 组装 `ChatRequest`（`chat-manager.ts:278-293`），仅写**已设置**的键（`undefined` 不传 = 供应商默认，`chat.ts:72` 注释解释了 `maxTokens` 死代码教训）。

**思考强度翻译层**：`reasoning-capability.ts` 是对外统一概念 → 各 provider 实际形态的**唯一翻译层**：
- `resolveReasoningCapability`（`:78`）：`local` → `none`；`anthropic` → `anthropic-budget`；其余 → `openai-effort`
- `openai-effort` 下发 `reasoning_effort`（`openai-client.ts:381`）
- `anthropic-budget` 分流：新版 `thinking:{type:'adaptive'}+output_config.effort`，旧版 `thinking:{type:'enabled',budget_tokens}`（`anthropic-client.ts:79-91`，版本判定 `resolveAnthropicThinkingMode:130`，budget clamp 到 <max_tokens 且 ≥1024 否则放弃 `toAnthropicBudget:102`）
- `capability === 'none'` 时角色级思考强度被**静默丢弃**（不报错、不打断）— `chat.ts:328-334`

**采样参数三档回落**：`resolveSampling(角色级 ?? Profile 级 ?? 全局默认 ?? undefined)` — `reasoning-capability.ts:198`；`presence/frequencyPenalty` 在 anthropic/local 静默丢弃（`supportsSamplingParam:167`）。

**流式解析**：
- OpenAI 兼容：SSE 按 `\n\n` 切事件，`data:` 行解析，读 `delta.content` / `delta.reasoning_content|reasoning` / `tool_calls` / `usage`，`[DONE]` 结束 — `openai-client.ts:82/477`
- Anthropic：事件型 SSE（`content_block_delta` / `message_delta` / `message_stop`），`thinking_delta` → `thinkingDelta`，`input_json_delta` → 工具参数 — `anthropic-client.ts:160/480`
- **工具调用循环**：模型发起 `tool_calls` → 执行工具 → 回填 `assistant(tool_calls)+tool` 消息 → 重发续答，最多 `MAX_TOOL_ROUNDS=8` 轮防死循环 — `chat-manager.ts:339-345/500-524`
- **中止**：`AbortController`，`stop()` → `abort()`，已收内容保留 — `chat-manager.ts:296/550`

---

### ⑧ 输出后处理

**做什么**：把模型原始流拆成"思考 / 状态 / 正文"三路，并做精简与结构化。

**双层状态机（串联）**— `chat-manager.ts:353-355`：
1. `ThinkingSplitter`（`thinking-parser.ts:86`）剥离 `<think>…</think>`，**跨 chunk 撕裂安全**（缓冲恒 ≤ 一个 chunk + 标签长度，`longestSuffixPrefixLen:63` 保留疑似标签前缀）
2. `statusSplitter`（`status-parser.ts:81`）复用同一状态机，只换标签与策略，剥离 `<status>…</status>`，`unclosedPolicy:'text'`（未闭合残留归正文，**绝不丢内容**）

**流式处理链**（`chat-manager.ts:390-411`）：
```
delta → 字段型思考? → pushThinking
      → ThinkingSplitter.feed → thinkingDelta/textDelta
      → statusSplitter.feed → 状态原文/正文
      → onDelta(正文增量, 累计正文) → UI 逐字上屏
```

**done 收敛**（`chat-manager.ts:412-462`）：
- 冲刷两级解析器残留
- 思考收敛：字段型直接用；标签型跑 `parseThinkingComplete`（幂等）；累计值被修正时以 `delta=''` 回调
- 状态收敛 `convergeStatus`：`parseStatusComplete` 优先，未命中补一次 ` ```status ` 围栏兜底
- `parseStatusBlock`（`status-parser.ts:298`）三级降级：JSON → 按行（半角`:`+全角`：`）→ 放弃；未知 key 按 `unknownKeyPolicy` 展示或丢弃；空结果返回 `null`（**不渲染空壳**）
- 用量回调 `onUsage`（含前缀缓存拆解、思考 token）
- 情绪更新 `updateEmotion`（L0 启用时）

**L2 输出纪律**（若启用）：在发送前对历史 assistant 消息做旁白精简 — `chat-manager.ts:257-265`

**渲染侧**：`MessageBubble.vue` 用 `{{ msg.content }}` 文本插值（Vue 自动转义）；`sanitize.ts`（`sanitizeHtml:123`）是 XSS 保险，**当前无 v-html 引用点**（`sanitize.ts:14` 自述）。

---

### ⑨ 持久化

**做什么**：消息定稿后落盘，支持多会话。

- **写入**：`persistChat(character)` — `chat.ts:935`，构造 `Chat` 对象（含 `messages`）→ `storageAdapter.saveChat`。失败时**非阻塞 + 记 lastError**（`:964`）。
- **数据模型**：`Chat`（`storage/types.ts:7`）；消息为 `ChatMessage`（`character-card.ts:42`），含 `content` / `thinking` / `reasoningTokens` / `status` / `swipes`。
- **关键契约**：`thinking` / `reasoningTokens` / `status` **独立于 content 存储，不参与回传**（prompt-builder 只读 content）— `character-card.ts:49-66`。这使"剥离历史思考"成为**天然默认，零正则**。
- **存储后端**：`StorageAdapter`（`storage-adapter.ts:20`）统一接口 → `IndexedDBAdapter`（Web）/ `TauriFSAdapter`（桌面），工厂选择 `storage-factory.ts`。
- **多会话**：`activeChatId` + `sessions` 索引；`loadChatHistory` / `newSession` / `togglePin` / `toggleArchive` / `deleteSession` — `chat.ts:1100-1201`。

---

### ⑩ 其他模块

| 模块 | 说明 | 关键位置 |
|------|------|---------|
| 随机事件 | 每轮回复后**异步**决策（概率/冷却/权重）→ 命中则调 LLM 生成事件（`temperature=1.0, maxTokens=600`）→ 转 `StoryEvent` 注入下轮 | `chat.ts:990`、`random-event-generator.ts:89/150/1005` |
| 故事引擎 | 故事时间推进 + 主角身份 + 场景 | `story-time.ts:204`、`protagonist.ts:194` |
| 群聊 | 多角色对话（独立 store） | `src/stores/group-chat.ts`、`core/group-chat.ts` |
| 斜杠命令 | 29KB 确定性命令引擎（管道/骰子/变量/事件/时间） | `slash-command.ts:752` |
| 工具调用 | 4 个内置工具（变量/世界书/资料库检索） | `tool-registry.ts:95/116` |
| 本地模型 | WebLLM 浏览器推理 + LRU/TTL 推理缓存 | `local-api-client.ts:81`、`inference-cache.ts:80` |
| 扩展系统 | 第三方斜杠命令/钩子注册 | `extension-loader.ts` |
| 世界书 | 条目/层级/包含组/概率激活 | `lorebook.ts`、`lorebook-scanner.ts` |
| 状态 HUD | 状态块解析 + sticky 渲染 | `status-parser.ts`、`status-schema.ts` |
| 多模态/其他 | 图像生成、翻译、TTS（不参与对话主链路） | `image-generation.ts`、`translator.ts`、`tts-service.ts` |

---

## 4. 三个特别关注点

### ① 「模型能力」vs「工程兜底」对照表

> 这是评估换模型收益的**核心表**。判断标准：该环节的**输出质量**由谁决定。

| 环节 | 依赖模型能力 | 工程兜底 | 说明 |
|------|:-----------:|:--------:|------|
| 角色演绎 / 文风 / 人设一致性 | ✅ **强** | — | 完全靠模型理解 card description/personality/scenario |
| 剧情推进 / 事件演绎 | ✅ **强** | 事件注入是工程 | 模型据 `eventsContext` 演绎，质量靠模型 |
| 世界书/设定遵守 | ✅ **强** | 扫描/注入是工程 | 模型需在长 system 中"记住并遵守"设定 |
| 长程一致性（伏笔/关系/好感） | ✅ **强** | 状态结转是工程 | `resolveLatestStatus` 只做字段结转，语义一致靠模型 |
| 工具调用决策 | ✅ **强** | 定义/执行是工程 | 模型自主决定调 `get_var` 等，准确率靠模型 |
| 状态块结构化输出 | ✅ **中** | 解析降级链兜底 | 模型需按英文 key 输出 JSON；不合规时工程降级 |
| 摘要质量 | ✅ **中** | 触发/注入是工程 | `summarizer` 已实现但**未接线** |
| 情绪标签（mood 字段） | ✅ **中** | 词表状态机兜底 | 规则词表为主路径，mood 为可选 |
| CoT 推理（复杂剧情） | ✅ **强** | 剥离/解析是工程 | 无提示词要求，模型自带 reasoning 才用得上 |
| 上下文裁剪 | ❌ | ✅ **强** | `splice(1,1)` 硬裁最早历史，与模型无关 |
| L1 提取式压缩 | ❌ | ✅ **强** | 纯规则打分/去重，无 LLM |
| L2 输出纪律 | ❌ | ✅ **强** | 纯规则分类/哨兵/删填充词 |
| L0 前缀稳定 | ❌ | ✅ **强** | 字节稳定排序 + SHA-256 |
| 情绪状态机 | ❌ | ✅ **强** | 24 词表扫描 |
| 事件/世界书触发 | ❌ | ✅ **强** | 关键词/正则/概率 |
| 意图路由（命令） | ❌ | ✅ **强** | 确定性命令引擎 |
| 流式解析/剥离 | ❌ | ✅ **强** | 双状态机 + 幂等收敛 |
| Token 计数 | ❌ | ✅ **强** | 本地 gpt-tokenizer |
| 采样参数回落 | ❌ | ✅ **强** | 三档 `??` 合并 |

**结论**：**约 2/3 的环节是工程兜底**，且这些兜底**换模型不会失效、也不会因此变好**。换模型的收益**只落在"模型能力"那 9 行**，其中收益最大的是前 5 行（演绎质量、剧情、设定遵守、长程一致性、工具调用）。

---

### ② 当前上下文长度管理策略

**主策略：硬裁剪（唯一无条件生效的机制）**
- 预算 `budget = maxContextTokens - reservedTokens`（默认 7168）
- 超预算时从**最早的历史消息**开始丢，保留 system 与最新 user — `prompt-builder.ts:244-255`
- Token 计数用本地 gpt-tokenizer（`token-counter.ts:56`），精确到消息开销

**辅助策略（均默认关或未接线）**：

| 机制 | 触发/预算 | 默认 | 位置 |
|------|----------|------|------|
| L1 提取式压缩 | 占用 ≥70%（软）/≥80%（硬），冷却 3 轮 | **关** | `compression.ts:272` |
| L2 旁白精简 | 仅状态性旁白 | **关** | `l0-l2-runtime.ts:80` |
| LLM 摘要 | 未覆盖消息 ≥4000 token，保留最近 10 条 | **未接线** | `summarizer.ts:108` |
| 历史思考剥离 | 默认不回传历史 `thinking` | **开** | `prompt-builder.ts:197` |
| 资料库 RAG | 关键词 Top3 | 开 | `rag-retriever.ts` |
| 双通道向量 | 动态≤3 段 + 静态≤3 块 | **关** | `dual-channel-runtime.ts:127` |
| 世界书注入 | 关键词激活 + insertionOrder | 开 | `lorebook-scanner.ts` |
| L0 前缀稳定 | 提升前缀缓存命中（省延迟/token） | **关** | `memory-store.ts:211` |

**关键缺口**：
- **没有"滑动窗口 + 摘要"的组合**——裁剪是"整条丢弃最早历史"，丢弃的内容**不会**被摘要替代（摘要未接线）。
- **没有分层/滚动摘要**，长会话一旦超预算，早期剧情会**硬丢失**。
- 压缩（L1）与裁剪（prompt-builder）是**两套独立机制**，L1 只处理单条 ≥200 字的消息，不解决"消息条数过多"的问题。
- 模型上下文窗口（`maxContextTokens`）由 Profile/角色配置，**未按模型能力自动适配**。

---

### ③ CoT 在当前流程里的位置与实际作用

**CoT 的三种来源**（全部在编排层收敛）：
1. **字段型**：provider 原生返回 `delta.reasoning_content` / `delta.reasoning`（OpenAI 兼容）或 `thinking_delta`（Anthropic）— `openai-client.ts:572`、`anthropic-client.ts:528`
2. **标签型**：模型自产 `<think>…</think>`，由 `ThinkingSplitter` 切分 — `thinking-parser.ts:86`
3. **显式请求型**：`reasoningEffort`（low/medium/high）经 capability 判定后下发 — `reasoning-capability.ts:78`

**位置**：位于**流式解析层**（`chat-manager.ts:390-448`），是"输出后处理"的第一道状态机，**串联在 status 解析之前**。

**实际作用（重要）**：
- ✅ **剥离展示**：思考与正文分字段存储（`msg.thinking`），UI 可折叠，正文不含思考 — `thinking-parser.ts:4`
- ✅ **省 token**：回传时**默认剥离**历史思考（prompt-builder 只读 content，零正则）— `prompt-builder.ts:19-24`
- ✅ **token 统计**：`reasoningTokens` 记录"这轮想了多久"（供应商上报才写，不写 0）— `chat-manager.ts:566`
- ✅ **与状态块互斥**：状态块必须在 `<think>` 之外（`status-prompt.ts:85` 明确要求）
- ❌ **不参与任何流程决策**：CoT 内容**不**用于意图识别、**不**用于记忆写入、**不**用于事件触发。它**纯粹是展示 + 省 token 的中间产物**。

**关键事实**：
- 项目**不主动要求**模型产出 CoT（system 提示词无"请先思考"指令）；**只有模型自带 reasoning 能力时才接得住**。
- 唯一"显式请求思考"的路径是 `reasoningEffort` 参数，且受 capability 判定（`local` 硬边界 → `none`；Anthropic 走 adaptive/extended 分流）。
- 因此：**换一个自带强 CoT 的模型，能立刻被流程承接**（无需改代码），但对**下游规则层无任何影响**——CoT 不被消费。

---

## 5. 换模型收益评估

### 最可能因换模型而受益的 3 个环节

1. **角色演绎与长程一致性**（收益最大）
   - 现状：完全靠模型在 `system`（card + 世界书 + 事件 + 主角 + 故事时间）中"记住并遵守"人设与伏笔。
   - 瓶颈：Token 预算 7168 且"丢最早"裁剪，早期剧情硬丢失，长会话一致性全靠模型自身长上下文能力。
   - 换模型收益：**直接**。上下文窗口更大 + 指令跟随更强的模型，可在不改任何工程代码的前提下提升一致性与沉浸感。

2. **工具调用与状态块结构化输出**
   - 现状：工具调用（`tool-registry`）与状态块（`<status>` JSON）都要求模型**自主、准确地**产出结构化输出。
   - 瓶颈：工程侧只有"解析降级链"兜底（JSON→按行→放弃），**无法修复模型压根不调用/不输出**的情况。
   - 换模型收益：**直接**。function-calling 与 JSON 合规率更高的模型可显著提升工具命中与状态 HUD 可用率。

3. **剧情推理与事件演绎（含 CoT 利用）**
   - 现状：随机事件、事件触发后的演绎、复杂对话推理都依赖模型；CoT 已被流程完整承接但**不被消费**。
   - 瓶颈：无提示词引导思考，模型推理深度决定剧情质量。
   - 换模型收益：**直接**。自带 reasoning 的模型（其思考增量已被 `ThinkingSplitter`/字段型解析接住）能提升复杂剧情质量。

### 换模型**不会**受益（甚至可能被工程层掩盖）的环节

- 上下文裁剪、L1 提取式压缩、L2 输出纪律、L0 前缀稳定、情绪词表状态机、事件/世界书关键词触发、斜杠命令、流式解析剥离、Token 计数、采样参数回落——**全部与模型无关**。
- 若换成超大上下文窗口模型，**L1/L2/L0 三层优化可直接保持关闭**（它们本就是"小窗口下的省 token 手段"），从而**降低工程复杂度**。

### 一句话总结

> 本项目的对话质量上限由**模型能力**决定（演绎/一致性/结构化/推理），而**工程兜底层（约占 2/3 环节）只是在小上下文与弱模型假设下做的补偿**。换强模型时，收益集中在"模型能力"那 9 个环节；同时可以考虑**关停 L0/L1/L2**，用模型的上下文窗口替代规则压缩。

---

## 附录：核心文件索引

| 文件 | 职责 |
|------|------|
| `src/stores/chat.ts` | 对话编排入口（sendMessage / regenerate / persist / 多会话） |
| `src/services/chat-manager.ts` | 生成生命周期、prompt 构建、流式编排、双状态机、工具循环 |
| `src/core/prompt-builder.ts` | 系统提示词组装 + Token 裁剪 |
| `src/stores/chat-context.ts` | 上下文收集统一流水线 |
| `src/core/l0-l2-runtime.ts` | L0/L2 运行时接线 |
| `src/core/optimization-pipeline.ts` | L0-L2 开关与 L1 压缩编排 |
| `src/core/compression.ts` | L1 提取式压缩 / 校验 / CCR |
| `src/core/output-discipline.ts` | L2 分类 / 哨兵 / 精简 / Auto-Clarity |
| `src/core/memory-store.ts` | MemoryStore / CharacterRegistry / EmotionTracker |
| `src/core/thinking-parser.ts` | 思维链增量状态机 |
| `src/core/status-parser.ts` | 状态块剥离与解析 |
| `src/core/status-prompt.ts` | 状态块指令生成（英文 key 硬约束） |
| `src/core/status-schema.ts` | 状态字段注册表与 schema 归一化 |
| `src/api/*` | 多 provider 客户端与协议适配 |
| `src/api/reasoning-capability.ts` | 思考强度/采样参数能力判定与翻译 |
| `src/core/lorebook-scanner.ts` | 世界书扫描与激活 |
| `src/core/rag-retriever.ts` | 关键词 RAG 检索 |
| `src/core/dual-channel-runtime.ts` | 双通道向量检索运行时 |
| `src/core/summarizer.ts` | LLM 摘要（已实现，未接线） |
| `src/core/trigger-engine.ts` | 事件触发引擎 |
| `src/core/token-counter.ts` | Token 计数 |
| `src/storage/*` | 存储适配器（IndexedDB / Tauri FS） |
