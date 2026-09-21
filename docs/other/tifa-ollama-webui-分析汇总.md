# Tifa-Deepsex-OllamaWebUI 分析汇总（团队主理人汇编）

> 分析对象：https://github.com/Value99/Tifa-Deepsex-OllamaWebUI
> 分析日期：2026-09-20 ｜ 目的：为「AI 酒馆」提供竞品参考与技术借鉴
> 分项报告：`tifa-ollama-webui-产品分析.md`（许清楚）、`tifa-ollama-webui-架构评审.md`（高见远）

---

## 1. TL;DR

一个 **194 stars、无 License、94KB 单 HTML 文件** 的 Ollama 聊天前端，本质是**模型作者给自己 RP 模型配的演示壳**——UI 的每次进化都精确对应其自训模型的一次升级（0215 支持思维链 → 0301 深度思考 → 0325 风格面板）。

**它做对了三件事**：思维链折叠显示（含回传前剥离）、把「文风/字数/节奏」编译成提示词的风格滑块、从模型输出里嗅探出角色状态 HUD。

**它有三大硬伤**：XSS（marked v15 已移除 sanitize + 27 处 innerHTML）、`OLLAMA_ORIGINS=*` 开放端点、每 chunk 全量重建 DOM 的 O(N×T) 性能。

**最反直觉的发现**：它的「高级参数面板」大概率是**装饰品**——采样参数放在请求顶层而非 `options` 内，`max_output_tokens` 也不是合法键名。此项已由主理人对照 Ollama 官方 API 文档交叉确认（详见 §4）。

---

## 2. 仓库画像（核实数据）

| 项 | 值 |
|---|---|
| Star / Fork / Open Issues | 194 / 15 / 7 |
| 代码规模 | `2聊天页面.html` 94,751 B / 3,244 行；`1配置后端.bat` 914 B；`utils/marked.min.js` 39 KB |
| 语言构成 | HTML 100%（无独立 TS/JS 源码，逻辑全内联） |
| 文件构成 | 内联 CSS 1,296 行（切成两段）+ DOM 246 行 + 两个内联 script 1,682 行 |
| 唯一本地依赖 | vendored marked v15.0.6；MathJax / FontAwesome 走 **CDN 且无 SRI** |
| 创建 / 最后推送 | 2025-02-12 / 2026-08-14 |
| License | **无** ⚠️ |
| 上游 | Fork 自 Joburgess/ollama-simple-webui |

---

## 3. 双视角结论

### 3.1 产品视角（许清楚）

- **定位**：不是 Open WebUI（152k★，做团队门户）的竞品，而是**补位者**——"我一个人、一个模型、现在就聊"。真正对标的是「轻量版 SillyTavern」（33.6k★ 全功能但部署重）。
- **降维威胁**：Cherry Studio（52k★）功能全面碾压，它活下来只因 Cherry Studio 不做 RP 叙事控制。
- **演进逻辑**：能聊（0215）→ 聊得舒服（0223/0302）→ 可控可调（0301/0325），路径清晰。
- **短板**：无角色卡、多会话管理弱、无权限、无国际化、连接失败零提示（7 个 issue 中 4 个是"选不到模型"）。

### 3.2 技术视角（高见远）

- **架构一句话**：原生 DOM 操作 + localStorage 当数据库 + 直连 `/api/chat` 流式，无框架无构建。
- **最值得抄的 3 个技术点**：
  1. **状态栏「格式嗅探 + 关键词渐进增强」**——不要求模型输出严格 JSON，容忍任意 key，只对认识的 key（地点🧭/时间⏱️/好感💗/角色👤）加图标，其余降级展示。鲁棒性远好于 schema 校验。
  2. **「可量化指令」控制模型行为**——深度思考按钮不传 API 参数，而是往用户消息追加"使用 `<think>` 思考 900 字/1800 字"，把抽象深度翻译成字数预算。
  3. **回传上下文时剥离思考内容**——历史 assistant 消息存了思考，但发 API 前 replace 掉，省 token。
- **最严重的 3 个风险**：
  1. **XSS**：marked v15 移除 sanitize，输出直接 innerHTML（27 处），模型输出可注入脚本，无 CSP 兜底。
  2. **`OLLAMA_HOST=:11434` + `ORIGINS=*`**：全网卡监听 + 任意来源跨域 + Ollama 本身无鉴权 = **开放推理端点**。注：这是 `file://` 直开（origin 为 null）的必然代价，不是疏忽，但是硬伤。
  3. **性能 O(N×T)**：每个 chunk 都 `innerHTML=''` 全量重建所有消息 + marked 全量重解析 + MathJax 全文档重排；localStorage 单键存全部会话且无 try/catch，超 5MB 配额直接抛异常丢失正在生成的回复。

---

## 4. 主理人交叉验证：高级参数面板失效

两位成员**独立**提出同一疑点，主理人对照 Ollama 官方文档 `docs/api.md` 确认：

**官方 `/api/chat` 顶层合法字段**：`model` / `messages` / `tools` / `think` + 高级参数 `format` / `options` / `stream` / `keep_alive`。
原文：`options: additional model parameters listed in the documentation for the Modelfile such as temperature`。
官方示例把 `temperature` / `top_p` / `repeat_penalty` / `num_predict` **全部放在 `options` 对象内**。

**结论**：
- 该仓库把 `temperature` / `top_p` / `repeat_penalty` 放顶层 → **不在合法字段内，被静默忽略**。
- `max_output_tokens` **不是合法键名**，正确名称是 `num_predict`（放 `options` 内）。
- 判定：**高概率完全失效**。唯一未做的是本机起 Ollama 实测（建议用固定 seed 对比"顶层传参"与"`options` 传参"两次输出差异）。

> 这一条对我们是**直接的避坑价值**：若 AI 酒馆将来接 Ollama 兼容端点，采样参数必须放进 `options`，长度字段用 `num_predict`。
>
> ⚠️ **2026-09-20 补充（落地时核实）**：本条**对 AI 酒馆当前架构不适用**。我们是 **OpenAI Chat Completions 兼容 + Anthropic Messages 原生 + WebLLM**，**没有 Ollama 原生 client**，因此不存在"参数放顶层被忽略"的陷阱，命名也不同（`top_p` / `presence_penalty` / `frequency_penalty`，长度字段是 `max_tokens` 而非 `num_predict`）。本条仅在将来真接 Ollama 原生 `/api/chat` 时才生效。详见 `docs/design/llm-controls-p0-增量设计.md` §8b.2。

---

## 5. 对「AI 酒馆」的落地建议（合并去重，按优先级）

### P0 — 明确缺、价值高、值得做

| # | 建议 | 依据 | 实现要点（Vue3+TS 适配） |
|---|---|---|---|
| 1 | **CoT 思维链渲染 + 回传前剥离** | 我们缺；对方唯一真做对的核心能力 | 抄**交互范式**，实现自己写增量状态机（`msg.thinking` / `msg.content` 分字段），**绝不抄它的全量 replace**；发送历史前剥离思考省 token |
| 2 | **思考强度三档开关** | 我们缺 | 优先走 Ollama 官方 `think: low/medium/high` 字段，**不要学它拼"思考900字"进 prompt**（污染上下文、违反 i18n 门禁） |
| 3 | **补齐采样参数** | 我们只有 temperature + maxTokens | 补 `top_p` / `presence_penalty` / `frequency_penalty`（**OpenAI 标准字段**；`repeat_penalty`、`num_predict` 是 Ollama 键名，本项目不适用 —— 见 §4 的 ⚠️ 补充）；**必须结构化传参，绝不拼进 prompt**。已于 2026-09-20 落地，见 `docs/design/llm-controls-p0-增量设计.md` |

### P1 — 差异化机会

| # | 建议 | 依据 | 注意 |
|---|---|---|---|
| 4 | **角色状态栏（格式嗅探）** | 与我们多角色形态契合度最高 | 做成**角色卡自带 statusSchema** 会比它更强；不认识的 key 降级展示，别 schema 硬校验 |
| 5 | **叙事风格控制面板** | 最大差异化机会 | 抄滑块交互；但必须**可预览 / 可关 / 按角色作用域**，不学它黑盒无条件追加 prompt |
| 6 | **本地端点连接自检 + 失败原因可视化** | 它 7 个 issue 里 4 个是"选不到模型"且零 UI 提示 | 这是它明确的用户痛点，我们做就是差异化 |

### P2 — 低成本小优化

| # | 建议 | 成本 |
|---|---|---|
| 7 | 输出期 `pointer-events:none` 一句话锁定交互（防误触） | 极低 |
| 8 | 对话导出 / 撤回 / 重新生成（若我们尚未齐备） | 低 |

### ❌ 明确不抄（会破坏我们的门禁或架构）

1. **单 HTML 分发** —— 与我们 7 道 CI 门禁（lint/i18n/CSS约定/对比度/覆盖率/构建/CSP）直接冲突。
2. **用 `innerHTML` 渲染模型输出** —— 高危 XSS + 违反 CSP 门禁。
3. **CDN 引 MathJax / 字体且无 SRI** —— 违反 CSP 门禁。
4. **硬编码中文关键词表** —— 违反 i18n 门禁。
5. **每 chunk 全量重建 DOM** —— Vue 响应式 + `v-memo` 天然更优，不要为了"简单"退回手动 `innerHTML=''`。
6. **把采样参数拼进 prompt** —— 污染上下文、不可控。
7. **直接复制其代码** —— 仓库 **无 License**，法律上不可直接使用。

---

## 6. 遗留待确认

| 项 | 状态 |
|---|---|
| `max_output_tokens` 等参数是否真的完全失效 | 官方规范判定"高概率失效"，**未本机实测**（需起 Ollama + 固定 seed 对比） |
| 风格面板的实际提示词模板 | 报告中已摘录，但其效果依赖作者特定模型，换模型未必成立 |
| 在线版 https://leftnorth.com/ 的实现是否与仓库同步 | 未核实 |

---

## 7. 一句话结论

**抄它的产品直觉（思维链、角色状态、风格滑块），别抄它的工程实现。** 它是个优秀的"产品原型"，同时是个合格的反面教材——恰好证明了我们在 CSP、i18n、覆盖率、渲染架构上的门禁不是过度设计。
