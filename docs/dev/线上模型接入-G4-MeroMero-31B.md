# 线上模型接入：G4-MeroMero-31B

> 日期：2026-09-22 ｜ 阶段 2-A（线上路径）
> 依据：`docs/other/dialogue-models-选型调研.md`（模型调研）+ `docs/dev/优化能力激活-后续路线图.md`

---

## 1. 为什么选它

| 维度 | 情况 |
|---|---|
| **基座** | `google/gemma-4-31B-it`（31B dense） |
| **上下文** | **256K** |
| **能力** | RP（角色扮演）专精；**think / nothink 双模** |
| **许可证** | **Apache-2.0** ✅ —— Gemma 4 已从 Google 自定义协议改为 Apache 2.0，这是它能被采用的关键 |
| **量化** | GGUF（iMatrix）齐备，可按自有硬件选档 |

**许可证说明**：项目本身是 Apache-2.0 且已开源，因此许可兼容是硬约束。
Gemma 4 全系在许可安全区内；**但 Gemma 3 及更早、Llama 3.x 全系（限制会传递）不可用**。

---

## 2. 怎么接（零代码）

项目**没有硬编码模型白名单** —— 线上走 OpenAI 兼容协议，任何模型名都能填。
`src/stores/settings.ts` 里的 `model: 'gpt-4o'` 只是**新建 Profile 的默认值**，不是白名单。

**接入步骤**（用户在设置页操作）：

1. 新建 / 编辑一个 API Profile
2. Provider 选 **OpenAI 兼容**（`openai` / `custom` / `deepseek` 均可）
3. `baseUrl` 填自建推理服务的 OpenAI 兼容端点（如 vLLM / Ollama / LM Studio 的 `/v1`）
4. `model` 填服务端暴露的模型名（例如 `G4-MeroMero-31B`，以实际部署名为准）
5. 按需调整上下文与采样参数（见下）

---

## 3. 上下文：256K 要用起来，得改配置

项目里上下文预算是**可配置**的（`prompt-builder.ts` 的 `budget = maxContextTokens - reservedTokens`），
默认 `maxContextTokens: 8192`。

**如果保持默认，256K 的优势完全吃不到** —— 会照旧在 8K 处裁剪历史。

建议：
- 把 `maxContextTokens` 调到硬件能承受的值（如 32768 / 65536）
- `reservedTokens` 相应上调（给回复留足空间）
- **注意成本**：上下文越长，每轮 token 消耗越大。256K 是能力上限，不是推荐常态

> 配合 L0（已默认开启）：长前缀 + 字节稳定 = 更容易命中 provider 的前缀缓存，
> 长上下文的成本劣势可以被部分抵消。

---

## 4. think / nothink 双模怎么用

G4-MeroMero-31B 支持两种模式：

| 模式 | 适用 | 项目侧配合 |
|---|---|---|
| **think** | 需要剧情推理、复杂设定遵守、长程一致性 | 项目的 `ThinkingSplitter` 会把 `<think>` 内容从正文剥离（可选是否回传历史） |
| **nothink** | 日常对话、快速响应 | 延迟更低，输出更直接 |

**项目已有能力**：思维链的流式解析与剥离、`includeThinkingInHistory` 开关（默认剥离以省 token）、
思考强度控件（`reasoningEffort`）。

---

## 5. 关于 `REASONING_MODEL_RE`（无需改动）

`src/api/reasoning-capability.ts:26` 的正则是：

```
/(^o\d|gpt-5|deepseek-r1|qwq|qwen3|glm-4\.5|-reasoner|thinking)/i
```

`G4-MeroMero-31B` **不在其中**。按该文件注释里的既有决策：

> 命中与否**只决定「是否显示『当前模型可能不支持推理强度』提示」**，控件本身对非硬边界 provider 一律显示。

所以**不纳入不影响功能**，只是少了那条提示；用户仍可在 Profile 表单手动开关推理强度。
若要纳入，把模型名特征加进正则即可（纯文案优化）。

---

## 6. 未验证事项（如实标注）

- **中文 RP 实测质量**：调研阶段未查到公开实测数据。**上线前建议自测**（同一角色卡、同一组对话，与现有模型对比）
- **实际推理速度 / 显存占用**：取决于量化档位与硬件，未实测
- **256K 下的稳定性**：长上下文常伴随「中间遗忘」，建议配合摘要（已接线）验证

---

## 7. 相关文档

- 模型选型与许可约束：`docs/other/dialogue-models-选型调研.md`
- 对话体验评估与行动顺序：`docs/other/dialogue-experience-评估与选型建议.md`
- 本地模型替代方案（Index-1.9B → Qwen3-1.7B）：见 `src/core/local-model-engine.ts` 的 `MODEL_REGISTRY` 注释
