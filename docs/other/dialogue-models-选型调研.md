# 面向「AI 角色扮演 / 虚拟角色对话」的开源模型选型调研

> 调研日期：2026-09-21
> 调研范围：Roleplay / Character Chat（角色扮演、虚拟角色对话）方向的开源权重模型
> **项目硬约束：本项目以 Apache-2.0 开源，许可证是选型的第一道门槛**
> 说明：本调研全部结论均来自联网核实，凡未查到的项一律标注「未查到」，不做推测填充。
> 说明：部分候选模型定位偏成人向（模型卡自带 `Not-For-All-Audiences` 等标注），本文**只讨论技术特性**（参数规模 / 基座 / 量化 / 上下文 / 中文能力 / RP 优化点 / CoT / 许可证 / 硬件门槛 / 社区活跃度），不展开任何露骨内容。

---

## 0. 结论速览（TL;DR）

| 场景 | 首推 | 备选 |
|---|---|---|
| 本地低配（CPU-only / ≤8GB 显存） | **Index-1.9B-Character**（1.9B，RAG few-shot RP，中文原生） | Qwen2.5-3B-Instruct + RP LoRA（Apache-2.0 最干净） |
| 本地中配（8–16GB 显存） | **Tifa-Deepsex-14b-CoT Q4**（14B，RP+CoT 专精）※有附加条款 | Qwen2.5-14B-Instruct（Apache-2.0，可自训 RP） |
| 线上高配（≥24GB 显存 / API） | **G4-MeroMero-31B**（31B，256K，Apache-2.0，RP 专精） | Qwen3-32B（Apache-2.0，中文强，可自训） |

**许可证一句话**：Qwen 系、Gemma-4 系、Mistral-Small-24B、DeepSeek-R1-Distill 系是 Apache-2.0 / MIT 安全区；**Llama 3.x 系、Gemma 3 系、MiniCPM 系、Index-1.9B 权重、Tifa 系** 都带自定义条款或附加条件，需要逐条评估。

---

## 1. 用户点名模型的核实结果

### 1.1 「Qwen-Character 系列（如 Qwen1.5-1.8B）」

**核实结论：未找到阿里官方开源的、名为「Qwen-Character」的模型。最接近的是以下三条线，需要区分清楚。**

| 对象 | 性质 | 说明 |
|---|---|---|
| **通义星尘（Tongyi Xingchen）** | **闭源 API** | 阿里官方的角色扮演模型，只在**阿里云百炼（Model Studio）平台以 API 形式**提供，**不开源权重**。定位：虚拟社交、游戏 NPC、IP 复刻、硬件/玩具/车机等拟人化对话。**不满足本项目「开源 + Apache-2.0」的前提。** |
| **Qwen1.5-1.8B / Qwen1.5-1.8B-Chat** | 开源通用模型 | 真实存在，但**是通用基座/对话模型，不是 RP 专用**。阿里官方并未给它挂「Character」标签。它之所以常和角色扮演绑定，是因为 **ChatHaruhi（Chat 凉宫春日）** 等早期角色扮演项目把它选作底座做了角色微调。 |
| **社区同名模型** | 开源微调 | 社区确有大量以「Character」命名的 Qwen 角色扮演微调：HF `Henry94/Qwen1.5-7B-Character`、`Henry94/Qwen2.5-3B-Character`、`Henry94/Qwen2.5-7B-Character`、`Henry94/Qwen2.5-14B-Character`；`flock-io/Qwen2-7B-Chat-CharacterMix`；ModelScope `mouseEliauk/qwen-character`（个人开发者，附完整训练数据+权重）。**这些均为个人作品，许可多为未标注或直接继承底座，需逐个确认。** |

**核实到的事实（Qwen1.5-1.8B）**
- 标识：`Qwen/Qwen1.5-1.8B`（HF / ModelScope）
- 参数：1.8B；基座：Qwen1.5 架构
- 中文能力：原生中文，强
- RP 优化点：**无**（通用模型）
- 许可：Qwen1.5 系列（除 72B）为 **Apache-2.0**
- 硬件：1.8B，CPU 可跑

> **给项目组的建议**：如果需求是「Qwen 系的角色扮演」，正确的检索路径不是找「Qwen-Character」，而是「Qwen 底座 + RP 微调」，例如 `Henry94/Qwen2.5-3B-Character` 这类社区模型，或自行用 Qwen 底座 + RP 数据集微调。

---

### 1.2 「Tifa-Deepseek-14b-CoT」

**核实结论：✅ 模型真实存在，用户口述名称基本准确。**

- **准确标识**：HF 仓库实际名为 `ValueFX9507/Tifa-Deepsex-14b-CoT`（作者 README 标题自己写的就是 **Tifa-Deepseek-14b-CoT**，用户口述来源正确）
- **链接**：
  - 主仓库 https://huggingface.co/ValueFX9507/Tifa-Deepsex-14b-CoT
  - GGUF：`ValueFX9507/Tifa-Deepsex-14b-CoT-GGUF-Q8` / `-GGUF-Q4`；第三方量化 `mradermacher/Tifa-Deepsex-14b-CoT-GGUF`
  - 配套前端：https://github.com/Value99/Tifa-Deepsex-OllamaWebUI （**本项目 docs/other 下已有的 tifa-ollama-webui 分析文档即对应此项目**）
- **参数规模**：14B
- **基座**：DeepSeek-R1-14B（即 `deepseek-ai/DeepSeek-R1-Distill-Qwen-14B`，MIT 许可）
- **上下文长度**：最大 **128K**（实际训练使用 16K 上下文）
- **中文能力**：中/英双语，专门优化了「消除中英混杂」（原始 R1 蒸馏数据以英文为主）
- **RP 优化点**：
  - 增量预训练注入 **0.4T token 小说语料**（16K 上下文训练），提升长文本连贯性
  - **Tifa-SFT**：10 万条高质量 RP 数据（由 TifaMax 生成）+ 10K DeepSeek-R1 生成 SFT + 2K 人工数据
  - **CoT 恢复训练**：用 DeepSeek-32B/671B 数据重建推理能力
  - **RL 强化**：DPO（防重复、增强上下文关联）+ PPO/PRIME 联合算法
  - 效果自述：上下文关联显著提升、基本消除中英混杂、减少拒绝、文笔更接近满血 R1
- **CoT**：✅ 核心卖点。模型输出带 `<think>` 标签，**使用前必须按官方模板剥离思考标签**，否则回复异常（前端支持率低，需手改）
- **量化版本**：GGUF（Q8 / Q4 等，官方 + 第三方）
- **许可证**：模型卡标注 **apache-2.0**；但**附加条件**：「角色扮演数据需遵循 Tifa 使用协议」（https://leftnorth.com/terms.html），且训练数据含小说版权内容。HF 页面带 `Not-For-All-Audiences` 标注。→ **见第 4 节风险清单**
- **硬件门槛（估算）**：14B → Q4 约需 9–10GB 显存/统一内存，Q8 约需 15–16GB；BF16 全量约需 28GB+
- **社区活跃度**：HF discussions 25；知乎/CSDN 有大量 Q8/Q4 部署教程（含 Ollama 配置）；作者配套发布 APK 与 Ollama WebUI；有 V2 计划（改用 DeepSeek-7B 底座 + 长思考策略）
- **已知缺陷（作者自述）**：满血 R1 的发散性被继承，思维内容与正文可能割裂；输入无指向性话语（如"继续"）易触发重复输出

---

### 1.3 「G4-MeroMero-31B」

**核实结论：✅ 模型真实存在，名称完全准确。**

- **准确标识**：`zerofata/G4-MeroMero-31B`
- **链接**：
  - https://huggingface.co/zerofata/G4-MeroMero-31B
  - GGUF（iMatrix）：`zerofata/G4-MeroMero-31B-GGUF`；第三方 `mradermacher/G4-MeroMero-31B-i1-GGUF`
  - 系列合集：https://huggingface.co/collections/zerofata/meromero （含 26B A4B MeroMero）
- **参数规模**：**31B dense**（基座 Gemma-4-31B 为 30.7B、60 层、词表 262K）
- **基座**：`google/gemma-4-31B-it`
- **上下文长度**：**256K**（Gemma 4 中型/大型统一 256K）
- **中文能力**：Gemma 4 多语言（含中文），但**作者未针对中文做专项说明**，中文 RP 手感需实测
- **RP 优化点**：
  - 面向创意写作 / 角色扮演，作者自述相比原版：**swipe 多样性更好、文风更简洁不啰嗦**
  - **同时支持 thinking 与 non-thinking 两种模式**（作者提供 `Gemma4-Think.json` / `Gemma4-NoThink.json` 两套 SillyTavern 预设）
  - 官方给出 SillyTavern 推荐采样参数（Temp 0.8–1.0，MinP 0.05）
  - 定位为 **Uncensored（无审查）** 方向
- **CoT**：✅ 支持思考模式（Gemma 4 原生 thinking）
- **训练方法**：Axolotl SFT（约 4900 万 token 数据集，LoRA r=64/alpha=64，2 epoch 后取 1 epoch checkpoint）→ mergekit **SLERP 0.5** 合并回原始 instruct，用于消除过拟合。数据来源含 `Instruct-Anime` 等动漫数据集
- **量化版本**：GGUF iMatrix（官方）+ i1-GGUF（第三方）
- **许可证**：**Apache 2.0** ✅（Gemma 4 系列已从 Gemma Terms of Use 改为 Apache 2.0 —— 见第 5 节意外发现）
- **硬件门槛（估算）**：31B → Q4 约需 18–20GB 显存，Q5/Q6 约 22–27GB，BF16 约 62GB；建议 **≥24GB 显存**（如 RTX 3090/4090 24GB 跑 Q4）
- **社区活跃度**：HF 月下载 152；已被 gitcode / atomgit / 鲸智社区等国内镜像收录；衍生 2 个 finetune + 10 个 merge + 18 个量化

---

### 1.4 「Index-1.9B」

**核实结论：✅ 模型真实存在，名称完全准确。**

- **准确标识**：`IndexTeam/Index-1.9B`（哔哩哔哩 Bilibili 出品）
- **链接**：GitHub https://github.com/bilibili/Index-1.9B ；HF `IndexTeam/Index-1.9B*` ；ModelScope `IndexTeam/Index-1.9B*`
- **参数规模**：**1.9B**（19 亿非词嵌入参数）
- **基座**：自研（基于 Transformer），预训练语料 **2.8T**，以中英文为主
- **上下文长度**：常规版本 4K 级别；**Index-1.9B-32K 变体支持 32K**（32K 大海捞针测试近乎全绿）
- **中文能力**：✅ 强。CMMLU 52.79 / CEVAL 57.01，同级别领先；因预训练引入较多互联网社区语料，**聊天趣味性明显更强**，多语种（尤其东亚语种）互译能力突出
- **模型矩阵**：
  - `Index-1.9B`（Base）
  - `Index-1.9B-Pure`（对照组，严格过滤指令数据）
  - `Index-1.9B-Chat`（SFT + DPO 对齐）
  - **`Index-1.9B-Character`（角色扮演版）** ← 本项目重点关注
  - `Index-1.9B-32K`（长文本）
- **RP 优化点**：
  - `Index-1.9B-Character` 在 SFT + DPO 基础上**引入 RAG 实现 few-shot 角色扮演定制**
  - 内置角色「三三」；用户只需提供对话语料 CSV（格式参考 `roleplay/character/三三.csv`）+ 角色描述，点击「生成角色」即可创建新角色
  - 使用 **CharacterEval**（角色扮演领域权威 benchmark，评测角色一致性、对话能力、角色扮演吸引力）进行评估
- **CoT**：未见专门 CoT 设计说明
- **量化版本**：官方支持 bitsandbytes **int4** 量化（nf4，性能损失较小）；**GGUF 见 `IndexTeam/Index-1.9B-Chat-GGUF`**；已适配 **llama.cpp 和 Ollama**
- **许可证**：
  - **代码：Apache-2.0**
  - **模型权重：Index Model License**（学术研究完全开放，**支持免费商用**）—— 注意：这是**自定义协议**，非标准 OSI 许可，需法务确认条款
- **硬件门槛（估算）**：1.9B → **CPU 可跑**；Q4 约 1.5–2GB，BF16 约 4GB
- **社区活跃度**：B 站官方出品，有 QQ 群；二创生态丰富（libllm、chatllm.cpp、Ollama `milkey/bilibili-index`、DataWhale self-llm LoRA 微调教程）

---

## 2. 横向对比大表

### 2.1 点名模型对比

| 模型 | 参数 | 基座 | 上下文 | 中文 | RP 优化 | CoT | 量化 | 许可证 | 硬件门槛（估算） | 社区 |
|---|---|---|---|---|---|---|---|---|---|---|
| **Index-1.9B-Character** | 1.9B | 自研（2.8T 中英语料） | 4K（32K 变体） | 强 | RAG few-shot RP + CharacterEval | — | int4 / GGUF | 代码 Apache-2.0；**权重 Index Model License（免费商用）** | CPU 可跑，Q4≈2GB | 中高（B站官方） |
| **Tifa-Deepsex-14b-CoT** | 14B | DeepSeek-R1-14B（MIT） | 128K | 中英（优化消混杂） | 0.4T 小说增量预训练 + SFT + DPO/PPO/PRIME | ✅ `<think>` | GGUF Q8/Q4 | **apache-2.0 + Tifa 使用协议附加条款** | Q4≈9–10GB，Q8≈15GB | 中（discussions 25，教程多） |
| **G4-MeroMero-31B** | 31B dense | gemma-4-31B-it | 256K | 多语言（未专项） | SFT+SLERP，swipe 多样、文风简洁 | ✅ think/nothink | GGUF iMatrix | **Apache 2.0** ✅ | Q4≈18–20GB，建议 ≥24GB 显存 | 中（月下载 152） |
| **「Qwen-Character」** | — | — | — | — | **官方无此开源模型** | — | — | — | — | — |
| └ 通义星尘 | 未知 | Qwen | 未知 | 强 | 官方 RP 专精 | — | — | **闭源 API** ❌ | API | 商业服务 |
| └ Qwen1.5-1.8B | 1.8B | Qwen1.5 | 32K | 强 | 无（通用） | — | GGUF/int4 | Apache-2.0 | CPU 可跑 | 高 |
| └ Henry94/Qwen2.5-*-Character | 3B/7B/14B | Qwen2.5 | 32K/128K | 强 | 社区 RP 微调 | — | 部分有 GGUF | 未明确标注 ⚠️ | 3B≈2GB / 7B≈5GB / 14B≈10GB | 低（个人作品） |

### 2.2 补充候选模型对比（覆盖三档）

| 模型 | 档位 | 参数 | 基座 | 上下文 | 中文 | RP 优化 | 许可证 | 硬件门槛（估算） | 备注 |
|---|---|---|---|---|---|---|---|---|---|
| **Qwen2.5-3B-Instruct** | 低配 | 3B | Qwen2.5 | 32K | 强 | 无（通用） | **Apache-2.0** ✅ | Q4≈2GB | 最干净的本地底座 |
| **Qwen3-1.7B** | 低配 | 1.7B | Qwen3 | 32K | 强 | 无（通用） | **Apache-2.0** ✅ | CPU/Q4≈1.5GB | 新版，推理增强 |
| **Bot42/Anima** | 低配 | LoRA(3B) | Qwen2.5-3B-Instruct | 32K | ✅ 中文 RP 专用 | SFT+DPO+GRPO(RLVR) | **Apache-2.0** ✅（数据 RoleBench 亦 Apache-2.0） | 单卡 4090 可训 | 中文 RP LoRA，有可复现评测 |
| **MiniCPM3-4B** | 低配 | 4B | MiniCPM | 32K | 强（CMMLU 73.3） | 无（通用） | 代码 Apache-2.0；**权重 MiniCPM Model License，商用需注册问卷** ⚠️ | Q4≈2.5GB | 综合分 66.3，超同级 7B |
| **Llama-3.2-3B-Instruct** | 低配 | 3B | Llama 3.2 | 128K | 一般 | 无（通用） | **Llama 3.2 Community License** ⚠️ | Q4≈2GB | 非 OSI 认可 |
| **Qwen2.5-7B-Instruct** | 中配 | 7B | Qwen2.5 | 128K | 强 | 无（通用） | **Apache-2.0** ✅ | Q4≈5GB | 8GB 显存可跑 |
| **Qwen2.5-14B-Instruct** | 中配 | 14B | Qwen2.5 | 128K | 强 | 无（通用） | **Apache-2.0** ✅ | Q4≈9GB | 可自训 RP |
| **Sao10K/L3-8B-Lunaris-v1** | 中配 | 8B | Llama-3-8B-Instruct（TIES merge） | 8K | **弱（英文为主）** | ✅ 强 RP/创意写作 | **Llama 3 Community License** ⚠️ | Q4≈5GB | 英文 RP 社区口碑好 |
| **jzyking/qwen2.5-7b-instruct-Role_Play_Anime** | 中配 | 7.6B | Qwen2.5-7B-Instruct | 32K | ✅ 二次元 RP | 动漫 RP 数据集微调，动作/情感描写强 | 未明确标注 ⚠️ | Q4≈5GB | ModelScope，有 GGUF |
| **yukimama/qwen2.5_yuna** | 中配 | 7B | Qwen2.5-7B-Instruct | 32K | ✅（13 语言） | 角色型微调，年轻女性语气 | **Apache-2.0** ✅ | Q4≈5GB | 作者声明不建议生产部署 |
| **DeepSeek-R1-Distill-Qwen-14B** | 中配 | 14B | Qwen2.5-14B | 128K | 强 | 无（通用推理，RP 弱） | **MIT** ✅ | Q4≈9GB | Tifa 的基座 |
| **Qwen3-30B-A3B** | 高配 | 30B(MoE,激活 3B) | Qwen3 | 32K/131K | 强 | 无（通用） | **Apache-2.0** ✅ | Q4≈18GB，激活仅 3B 速度快 | 性价比高 |
| **Qwen3-32B** | 高配 | 32B dense | Qwen3 | 32K 原生 / 131K YaRN | 强 | 无（通用，可自训） | **Apache-2.0** ✅ | Q4≈19GB，建议 ≥24GB | 中文最强开源底座之一 |
| **Mistral-Small-24B-Instruct-2501** | 高配 | 24B | Mistral | 32K | 一般 | 无（通用） | **Apache-2.0** ✅ | Q4≈14GB | 系统提示遵循强 |
| **Gemma-3-27B-it** | 高配 | 27B | Gemma 3 | 128K | 中 | 无（通用） | **Gemma Terms of Use** ⚠️ | Q4≈17GB | 注意：Gemma 4 已改 Apache-2.0 |

---

## 3. 按部署形态分组

### 3.1 本地低配档（CPU-only 或 ≤8GB 显存）

| 模型 | 参数量化后体积（估算） | 中文 RP 可用性 | 许可风险 | 推荐度 |
|---|---|---|---|---|
| **Index-1.9B-Character** | Q4 ≈ 2GB | ★★★★☆ RAG few-shot RP，中文原生，官方 RP 版本 | 中（权重自定义协议，但明确免费商用） | **首选** |
| **Qwen2.5-3B-Instruct** | Q4 ≈ 2GB | ★★★☆☆ 通用底座，需配 RP prompt/LoRA | 低（Apache-2.0） | 推荐 |
| **Qwen3-1.7B** | Q4 ≈ 1.5GB | ★★★☆☆ 通用底座 | 低（Apache-2.0） | 推荐 |
| **Bot42/Anima**（Qwen2.5-3B LoRA） | LoRA + Q4 底座 ≈ 2GB | ★★★★☆ 中文 RP 专用 LoRA，有可复现评测 | 低（Apache-2.0） | 推荐 |
| **Qwen1.5-1.8B-Chat** | Q4 ≈ 1.5GB | ★★☆☆☆ 通用，早期角色项目底座 | 低（Apache-2.0） | 一般 |
| MiniCPM3-4B | Q4 ≈ 2.5GB | ★★☆☆☆ 通用 | **中高（商用需注册问卷）** | 谨慎 |
| Llama-3.2-3B-Instruct | Q4 ≈ 2GB | ★★☆☆☆ 中文偏弱 | **中高（Llama 社区协议）** | 谨慎 |

> **低配档结论**：如果坚持 ≤8GB 显存/CPU-only 且要求中文 RP 开箱可用，**Index-1.9B-Character 是唯一「官方 RP 版本 + 中文原生 + 明确免费商用」的选项**。若要追求许可证绝对干净，选 Qwen2.5-3B + Anima LoRA 自行组装。

### 3.2 本地中配档（8–16GB 显存）

| 模型 | 量化后体积（估算） | 中文 RP 可用性 | 许可风险 | 推荐度 |
|---|---|---|---|---|
| **Tifa-Deepsex-14b-CoT（Q4）** | ≈ 9–10GB | ★★★★★ 14B RP+CoT 专精，128K，中文优化 | **中高（apache-2.0 + Tifa 附加协议 + 版权语料）** | **能力首选，许可待确认** |
| **Qwen2.5-14B-Instruct（Q4）** | ≈ 9GB | ★★★☆☆ 通用底座，需自训/prompt | 低（Apache-2.0） | 推荐（稳妥） |
| **Qwen2.5-7B-Instruct（Q4）** | ≈ 5GB | ★★★☆☆ 通用底座 | 低（Apache-2.0） | 推荐（显存友好） |
| jzyking/qwen2.5-7b-Role_Play_Anime（Q4） | ≈ 5GB | ★★★★☆ 二次元 RP 微调 | 未明确 ⚠️ | 可用但许可待确认 |
| yukimama/qwen2.5_yuna（Q4） | ≈ 5GB | ★★★★☆ 角色型微调 | 低（Apache-2.0） | 可用 |
| Sao10K/L3-8B-Lunaris-v1（Q4） | ≈ 5GB | ★★☆☆☆ 英文为主 | **中高（Llama 社区协议）** | 仅英文场景 |
| DeepSeek-R1-Distill-Qwen-14B（Q4） | ≈ 9GB | ★★☆☆☆ 推理强但 RP 弱 | 低（MIT） | 作底座 |

> **中配档结论**：**RP 效果与许可证之间存在明显张力**。Tifa-14B 是这一档 RP 能力最强、中文最友好的开源选项，但附加条款需要法务拍板；若不能接受，退而用 **Qwen2.5-14B-Instruct + 自建 RP 数据集 LoRA 微调**，全链路 Apache-2.0 可控。

### 3.3 线上高配档（≥24GB 显存 或 API）

| 模型 | 显存需求（估算） | 中文 RP 可用性 | 许可风险 | 推荐度 |
|---|---|---|---|---|
| **G4-MeroMero-31B（Q4）** | ≈ 18–20GB，建议 ≥24GB | ★★★★☆ 31B RP 专精，256K，think/nothink 双模 | 低（**Apache-2.0**） | **首选** |
| **Qwen3-32B（Q4）** | ≈ 19GB，建议 ≥24GB | ★★★☆☆ 通用最强底座，可自训 RP | 低（Apache-2.0） | 推荐 |
| **Qwen3-30B-A3B（Q4）** | ≈ 18GB（激活 3B，速度快） | ★★★☆☆ 通用 MoE | 低（Apache-2.0） | 推荐（吞吐优先） |
| Mistral-Small-24B-Instruct-2501（Q4） | ≈ 14GB | ★★☆☆☆ 中文一般 | 低（Apache-2.0） | 一般 |
| Gemma-3-27B-it（Q4） | ≈ 17GB | ★★☆☆☆ 通用 | **中（Gemma Terms of Use）** | 谨慎（可改用 Gemma-4） |
| 通义星尘（API） | — | ★★★★★ 官方 RP 专精 | **不适用（闭源，无法满足 Apache-2.0 项目）** | 仅作能力对标 |

> **高配档结论**：**G4-MeroMero-31B 是唯一同时满足「31B 级 RP 专精 + 256K 上下文 + Apache-2.0」的选项**，与项目许可证完全兼容，是本档最优解。Qwen3-32B / Qwen3-30B-A3B 作为通用底座备选，适合需要自行微调的场景。

---

## 4. 许可证风险清单

> 本项目以 **Apache-2.0** 开源，因此**只接受可传递、无附加限制的许可**。以下按风险等级排列。

### 🔴 高风险（不建议直接使用）

| 模型 / 系列 | 实际许可 | 风险点 |
|---|---|---|
| **Llama 3.x 系（含 Sao10K Lunaris / Stheno / Euryale 等全部 Llama 微调）** | Llama 3.x Community License | 非 OSI 认可；含 7 亿 MAU 门槛、命名要求（衍生模型须带 "Llama" 前缀）、可撤销的 AUP 附加政策。**微调模型继承底座限制** |
| **Gemma 3 及更早（含 Gemma 2）** | Gemma Terms of Use | 自定义协议，含禁用条款与使用限制；**Gemma 4 已改为 Apache-2.0，勿混淆** |
| **MiniCPM 系列（含 MiniCPM3-4B）** | 代码 Apache-2.0 / **权重 MiniCPM Model License** | 商用需**填写问卷注册**，属于附加程序性条件 |
| **通义星尘** | 闭源商业 API | 不开源权重，直接排除 |

### 🟡 中风险（可用但需法务确认）

| 模型 / 系列 | 实际许可 | 风险点 |
|---|---|---|
| **Tifa-Deepsex-14b-CoT** | 模型卡 apache-2.0 **+ Tifa 使用协议（leftnorth.com/terms.html）** | 模型卡明确写「角色扮演数据需遵循 Tifa 使用协议」，构成 Apache-2.0 之外的**附加条款**；训练数据含小说版权内容，下游商用存在版权传导风险；HF 标记 Not-For-All-Audiences |
| **Index-1.9B 模型权重** | Index Model License | 自定义协议（非 OSI）；虽明确「学术完全开放、支持免费商用」，但条款文本需法务确认是否与 Apache-2.0 项目兼容 |
| **社区未标注许可的微调**（Henry94/Qwen2.5-*-Character、jzyking/qwen2.5-7b-Role_Play_Anime、mouseEliauk/qwen-character 等） | 多数未标注或仅继承底座 | 个人作品，权属与数据来源不明；**若使用需逐个索要许可说明** |

### 🟢 低风险（安全区，推荐）

| 模型 / 系列 | 许可 |
|---|---|
| Qwen / Qwen1.5（除 72B）/ Qwen2.5 / Qwen3 全系 | **Apache-2.0** |
| **Gemma 4 全系（含 G4-MeroMero-31B 的底座）** | **Apache-2.0** |
| Mistral-Small-24B-Instruct-2501 | **Apache-2.0** |
| DeepSeek-R1-Distill 全系（Qwen-1.5B/7B/14B/32B） | **MIT** |
| Bot42/Anima（LoRA + RoleBench 数据） | **Apache-2.0** |

### 许可证合规建议

1. **首选链路**：G4-MeroMero-31B（线上）+ Index-1.9B-Character（本地）→ 均为「可免费商用」且无附加条款争议。
2. **次选链路**：Qwen 系底座 + 自建 RP 数据集 LoRA 微调 → 全链路 Apache-2.0，数据版权完全自控。
3. **若确需使用 Tifa-14B**：单独隔离为「可选插件」而非核心依赖，并在文档中明确标注其附加条款，避免污染项目主许可。
4. **禁用清单**：通义星尘（闭源）、以及一切 Llama 3.x 底座衍生模型（除非项目愿意接受 Llama 社区协议）。

---

## 5. 选型方案建议（3–4 个具体方案）

### 方案 A：全 Apache-2.0 最干净方案（推荐给法务敏感型项目）

- **本地低配**：`Qwen2.5-3B-Instruct` + `Bot42/Anima` LoRA（Apache-2.0）
- **线上高配**：`G4-MeroMero-31B`（Gemma-4-31B-it，Apache-2.0）
- **优点**：全链路 Apache-2.0，无附加条款，可放心商用与再分发
- **缺点**：低配档 RP 效果不如 Index-1.9B-Character 开箱即用，需要自行组装 LoRA

### 方案 B：能力优先 + 中文最优方案（推荐给中文 RP 体验优先）

- **本地低配**：`Index-1.9B-Character`（1.9B，RAG few-shot RP，CPU 可跑，免费商用）
- **本地中配**：`Tifa-Deepsex-14b-CoT` Q4（14B，RP+CoT，128K）
- **线上高配**：`G4-MeroMero-31B` Q4（31B，256K，think/nothink）
- **优点**：三档各有专精，中文 RP 手感最佳
- **缺点**：Tifa 的附加条款需隔离处理；Index 权重协议需法务确认

### 方案 C：三级降级容灾方案（推荐给生产部署）

- **主力**：`G4-MeroMero-31B`（≥24GB 显存，256K 长剧情）
- **降级 1**：`Qwen2.5-14B-Instruct` Q4（8–16GB 显存，Apache-2.0）
- **降级 2**：`Index-1.9B-Character`（CPU-only，RAG few-shot）
- **优点**：三档硬件全兼容，许可证全绿，任意硬件环境都有可用模型
- **缺点**：中低档需自建 RP prompt 模板/角色库

### 方案 D：自训可控方案（推荐给有算力的团队）

- **底座**：`Qwen3-32B`（线上）/ `Qwen2.5-3B-Instruct`（本地），均 Apache-2.0
- **方法**：参考 `Bot42/Anima` 的 RLVR/GRPO 四臂评测流程（Base / SFT / DPO / GRPO），在自建中文 RP 数据集上微调
- **优点**：数据、许可、能力完全自主可控；可针对项目角色卡深度定制
- **缺点**：需要训练算力与数据标注投入

---

## 6. 意外发现与关键提醒

1. **Gemma 4 改用 Apache 2.0**（Gemma 3 及更早是自定义 Gemma Terms of Use）。这使得 **G4-MeroMero-31B 从「许可风险模型」一跃成为「许可安全区模型」**，是本次调研对项目最有利的发现。
2. **不存在官方开源「Qwen-Character」**。阿里的角色扮演能力走 **通义星尘 API**，闭源。项目若需要「Qwen + 角色扮演」，正确路径是「Qwen 底座 + 社区/自训 RP 微调」，而非找官方 Character 模型。
3. **Tifa 的命名细节**：HF 仓库名是 `Tifa-Deepsex-14b-CoT`，但作者 README 标题写的是 `Tifa-Deepseek-14b-CoT`，用户口述名称**来源正确**，无需纠正。
4. **2026 年中文 RP 社区实测榜（kkaiapi）明确「不推荐 Qwen」做角色扮演**，理由是「对话腔调偏助手、长剧情里爱总结爱出戏」，推荐 DeepSeek V4 / GLM-5 / Kimi。**但该榜单是 API 商业中转榜，全部为闭源云模型，对本项目（开源 + 本地部署）参考价值有限**——开源本地场景下 Qwen 系仍是不可替代的主力底座。该结论仅用于说明「Qwen 通用底座直接做 RP 需要额外微调」这一点。
5. **Tifa 系已有配套 Ollama WebUI 项目**（`Value99/Tifa-Deepsex-OllamaWebUI`），而本项目 `docs/other/` 下已存在 `tifa-ollama-webui-*` 三份分析文档，说明项目此前已对该技术栈做过评估，**选型时建议与此前分析结论对齐**。
6. **Tifa 使用前必须剥离 `<think>` 标签**，官方称「目前前端支持率非常低，建议手动修改前端代码」。这是工程接入的实际成本，需在选型时计入。
7. **Index-1.9B-Character 的 RAG few-shot 机制**是低配档最优雅的 RP 方案：不需要微调，只需提供角色对话语料 CSV + 角色描述即可动态创建角色，非常适合「多角色卡」产品形态。

---

## 7. 参考来源

- Index-1.9B：https://github.com/bilibili/Index-1.9B/blob/main/README_zh.md
- Tifa-Deepsex-14b-CoT：https://huggingface.co/ValueFX9507/Tifa-Deepsex-14b-CoT ；https://huggingface.co/yuhangpinkelf/Tifa-Deepsex-14b-CoT/blob/main/README.md
- G4-MeroMero-31B：https://huggingface.co/zerofata/G4-MeroMero-31B
- Gemma 4：https://huggingface.co/google/gemma-4-31B ；https://ai.google.dev/gemma/terms
- Qwen3-32B：https://huggingface.co/Qwen/Qwen3-32B
- Qwen2.5-7B-Instruct：https://huggingface.co/Qwen/Qwen2.5-7B-Instruct
- MiniCPM3-4B：https://huggingface.co/openbmb/MiniCPM3-4B
- DeepSeek-R1-Distill-Qwen-14B：https://huggingface.co/deepseek-ai/DeepSeek-R1-Distill-Qwen-14B
- Mistral-Small-24B-Instruct-2501：https://huggingface.co/mistralai/Mistral-Small-24B-Instruct-2501
- Sao10K/L3-8B-Lunaris-v1：https://huggingface.co/Sao10K/L3-8B-Lunaris-v1
- Bot42/Anima：https://huggingface.co/Bot42/Anima
- 通义星尘（阿里云百炼）：https://help.aliyun.com/zh/model-studio/role-play
- 2026 角色扮演 AI 模型中文梯队榜：https://kkaiapi.com/jiaose-banyan-moxing-paihang

> **免责与局限**：本文参数、上下文、许可信息均来自上述公开页面，硬件门槛为按参数量与量化位宽的**估算值**，非实测。模型能力（尤其中文 RP 手感）强烈建议在最终选型前做小规模实测对比。
