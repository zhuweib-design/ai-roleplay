# LLM 控制能力 P0 三项 —— 落地记录

> 日期：2026-09-20 ｜ 来源：竞品分析 `docs/other/tifa-ollama-webui-分析汇总.md` §5 的 P0 建议
> 设计依据：`docs/design/llm-controls-p0-增量设计.md`（决策以该文件 §8b 为准）
> 状态：**已实现 + QA 独立验证通过（路由判定 NoOne）**，本地提交，**未 push**

---

## 1. TL;DR

把竞品「Tifa-Deepsex-OllamaWebUI」做对的三件事，用符合本项目工程质量标准的方式重新实现了一遍：**思维链渲染与回传剥离、思考强度三档、采样参数补齐**。

抄的是**产品直觉**，不是工程实现——竞品用 `innerHTML` 全量重建 DOM 渲染模型输出，我们用 Vue 响应式 + `v-memo` 且全程文本插值。

---

## 2. 交付概览

| 项 | 值 |
|---|---|
| 提交 | `6c9c17f`（主体 37 文件 +4539/−58）→ `85e1d76`（Anthropic 纠偏）→ `45220d2`（role 契约修复） |
| 测试 | **2993 用例全过**（含 QA 独立新写 94 例），110 文件 |
| 覆盖率 | **86.47 / 85.31 / 86.12 / 86.47**（基线 86.45/85.26/86.12/86.45，**未下降**） |
| 门禁 | vue-tsc 0 错 · lint 0 错 · i18n strict ✓ · CSS 约定 5/5（`!important` **46 = 基线**）· 对比度 0 项低于 AA · build ✓ · CSP ✓ |
| 新增依赖 | **零** |

---

## 3. 三项能力

### P0-1 思维链渲染 + 回传前剥离
- `ChatMessage.thinking` 与 `content` **分字段存**——剥离因此变成"天然默认"：`prompt-builder` 只读 `content`，**零 replace**，对已存历史零影响
- 标签型 `<think>`：新建 `src/core/thinking-parser.ts`（`ThinkingSplitter` 增量状态机），在**编排层统一挂载**（1 处挂载、4 个 client 全受益）
- 字段型 `reasoning_content` / `reasoning`：由 client 走新增的 `thinkingDelta` 事件通道
- UI：`ThinkingBlock.vue` **默认折叠**、`v-if` 懒渲染、`aria-expanded`/`aria-controls`，生成中显示"思考中…"+ 脉冲点，展开状态会话内记忆

### P0-2 思考强度三档
对外统一 `ReasoningEffort = 'low'|'medium'|'high'`，对内按 provider 翻译：

| Provider | 下发形态 |
|---|---|
| OpenAI 兼容 | `reasoning_effort` |
| Anthropic（4.6+/5+） | `thinking:{type:'adaptive'}` + `output_config:{effort}` |
| Anthropic（4.5 及更早 / 无法解析） | `thinking:{type:'enabled', budget_tokens}`（`>=1024` 且 `< max_tokens`） |
| local / WebLLM | **不下发**（硬边界不支持，控件隐藏） |

### P0-3 采样参数补齐
新增 `topP` / `presencePenalty` / `frequencyPenalty`。沿用 T-16 语义：**`undefined`/`null` = 不传 = 供应商默认，绝不用 0 表示未设置**。
UI 分级：**角色级**（ContextPanel）只放 `topP` + `frequencyPenalty`；**Profile 级**（SettingsModelPanel）放三个。

---

## 4. 两处关键纠偏（重要，别回退）

### ① Anthropic `budget_tokens` 已被官方废弃
官方原文：`thinking:{type:'enabled', budget_tokens}` 在 Claude 4.6 deprecated，**4.7 及之后返回 400**。替代为 **adaptive thinking**：
```json
{ "max_tokens": 16000, "thinking": { "type": "adaptive" }, "output_config": { "effort": "high" } }
```
`effort` 正好对应三档，比 budget 换算更直接。
判定函数 `resolveAnthropicThinkingMode(model)`：主版本≥5 或 4.x(x≥6) → adaptive；4.x(x≤5)、<4、**无法解析** → extended。
⚠️ 日期戳版本号（如 `claude-sonnet-4-20250514`）按"未指定次版本"处理，**不可**把发布日期误判为次版本。
附带修正：下限常量由架构师原设的 **256** 改为官方 **1024**。

### ② 不抑制 temperature / top_p
架构师假设"thinking 与采样参数冲突"，但** Anthropic 官方文档未给出该约束**。抑制的真实后果是**静默丢弃用户显式设置**——用户调了 temperature 却毫无效果且无任何提示，比服务端报错更糟。
→ 已删除 `ANTHROPIC_THINKING_CONFLICT_PARAMS`，与 OpenAI 侧统一为"只加思考参数、不动采样参数"。
**通用原则：宁可让服务端报错让用户看见，也不要静默丢弃他的设置。**

### ③ 协议口径修正
我们是 **OpenAI Chat Completions 兼容 + Anthropic Messages 原生 + WebLLM**，**无 Ollama 原生 client**。故"`num_predict`" / "参数必须进 `options`"是 Ollama 专属结论，**对我们不适用**。

---

## 5. 验证结果（QA 独立验证，未复用工程师用例）

- **解析器**：开/闭标签任意碎片撕裂、逐字符到达、未闭合两策略、UTF-8（CJK/emoji 代理对）截断重建、多块拼接、思考内含代码块/字面标签/HTML、大小写变体
- **幂等不变量**：16 语料 × 7 切分数 × 5 种子 = **560 组随机切分** + 全位置穷举两段切分 + 逐码元最坏撕裂 → 流式累积**恒等于**一次性解析
- **性能**：10 万字符单次解析 **1ms**（阈值 100ms）
- **四个 client**：未设置参数**完全缺失**（非 0）；Anthropic adaptive/extended 两分支**采样参数照常下发**；QA 还补了工程师漏测的 Tauri 非流式 `chat()` 与 local `chatStream` 路径
- **渲染红线**：`src/` 除 `Icon.vue`/`icons.ts` 白名单外**零 `v-html`/`innerHTML`**（已写成静态守卫用例）

发现并修复的唯一缺陷：`prompt-builder.ts` 历史回包 `<think>` 时**未判 role**，与自身 JSDoc「历史 assistant 消息」契约不符 → 已加 `msg.role === 'assistant'`。

---

## 6. 遗留风险与待办

| # | 项 | 处置 |
|---|---|---|
| 1 | 群聊 AI 回复仍是 mock（`GroupChatView.vue` setTimeout），无真实流式链路 | 本轮只做数据结构 + 渲染覆盖，代码留 `TODO`；**思维链群聊侧未真验证** |
| 2 | Rust 侧只跑 `cargo check`，未跑 `cargo test` | CI 的 Tauri job 兜底 |
| 3 | 思考内容里的**字面 `</think>`** 会提前闭合该块 | 非嵌套语义，固有取舍，接受 |
| 4 | `test:coverage` 默认并发下**偶发** `[vitest-worker] Timeout calling "onTaskUpdate"`（ONNX 重用例压住主线程，**非用例失败**，加 `--maxWorkers=2` 可 EXIT=0） | **本轮未改门禁脚本**（本地沙箱现象、CI 未必复现，锁并发会拖慢所有人反馈）→ 待决定是否单开任务 |
| 5 | 调试残留文件未清理（删除被沙箱批量保护拦截） | **需手动清理**，见下 |

### ⚠️ 需手动清理的文件
```
G:\AI-data\AIjiuguan\tests\dbg-tmp.test.ts      （无断言、只 console.log，会随套件执行）
G:\AI-data\AIjiuguan\qa-tmp-*.txt               （18 个，QA 重定向输出残留）
G:\AI-data\AIjiuguan\qa-verify.txt
```
注：当前 2993 用例中含该调试用例 1 条，清理后应为 **2992**。

---

## 7. 未做（P1 及以后）

- 角色状态栏「格式嗅探」（竞品最契合我们多角色形态的能力）
- 叙事风格控制面板（抄滑块交互，但须可预览/可关/按角色作用域）
- 本地端点连接自检 + 失败原因可视化
- ~~思考 token 数 / 耗时展示（`ChatUsage.reasoningTokens` 数据位已预留）~~ —— **收尾轮已补思考 token 展示**（Anthropic/OpenAI/Tauri 三个 client 均已解析并落盘；耗时无数据源，按"不编造"原则未做）
- ~~`profile.maxTokens` 死代码（被角色级必填值无条件覆盖）——本轮未修~~ —— **收尾轮已修**（`UICharacter.maxTokens` 改可选，角色级未设置时回落 Profile 级）
