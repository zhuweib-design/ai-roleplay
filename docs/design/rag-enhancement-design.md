# RAG 增强开发文档 — 嵌入模型自动择优 + 停用词调优

> 状态：设计定稿（待用户审阅）
> 日期：2026-08-24
> 范围：双通道 RAG 检索链路的增强，含两个子项——①嵌入模型自动择优（后台跑分推荐最佳模型）；②停用词过滤（嵌入前剔除高频虚词，提升检索相似度）
> 说明：本文件为开发规格与实现指引，供前后端开发/QA 对照使用。

---

## 1. 目标与概述

### 1.1 背景

项目采用双通道向量检索（动态层=记忆/情绪，静态层=世界观/设定），见 `src/core/dual-channel-runtime.ts` 与 `src/core/embedding.ts`。当前存在两个待增强点：

1. **无基准**：支持 `bge-large/bge-small/gte-large` 及用户自定义模型，但用户无从判断哪个对自身内容检索效果最好。
2. **停用词污染**：`embed()` 直接对原始文本分词嵌入，"the/a/的/了"等高频功能词会稀释语义向量，降低检索相似度。

### 1.2 目标（已确认）

| 子项 | 目标 |
|---|---|
| 自动择优 | 用户触发后，用内置中文评测集在**已安装**嵌入模型上跑分，按 recall@3 + 耗时自动选中并持久化最佳模型 |
| 停用词过滤 | 嵌入前统一剔除中英文高频虚词（保留否定词、保护数字与专名），且为可开关配置项，**默认开启** |

> **语言支持边界（已确认）**：支持中英查询均能走完整链路不报错（fail-open）。停用词表为中英双语（§4.2）。因当前嵌入模型全部为 `*-zh-*` 中文模型，英文检索为"尽力覆盖、越界归 UNK"而非严谨优化；评测集**仅覆盖中文**（§5.2），不新增英文用例，不引入多语/英文模型。此项不新增工程量。

---

## 2. 前置条件

- 运行环境：Tauri 2.0 + Vue 3 + TypeScript（严格模式 `noUncheckedIndexedAccess`）。
- 依赖抽象：`EmbeddingProvider`（onnx / gateway / mock）、`VectorStore`（余弦 Top-k）、`VectorModelManager`、`VectorModelId`。
- 本地存储：`localStorage`（浏览器桌面一致）。
- 已安装模型来源：`ModelFileAdapter.listInstalled()`（预置）+ `UserModelFileAdapter.listInstalled()`（用户自定义）。

---

## 3. 总体架构与数据流

新增核心**预处理/择优模块**，两子项共享同一嵌入链路。

```
输入文本（查询 或 条目）
   │
   ▼
RagEnhancer.normalize(text)        ← 停用词过滤（开关默认开）
   │                                  · 纯虚词剔除 + 否定词保留
   │                                  · 数字串 / 专名保护
   ▼
EmbeddingProvider.embed(normalized) ← 现有 onnx / gateway / mock
   ▼
向量 → VectorStore 检索  /  BenchRunner 自动择优
```

### 3.1 组件清单

| 文件 | 类型 | 职责 |
|---|---|---|
| `src/core/stopword-filter.ts` | 新增 | 纯函数 `filterStopwords(text, opts)`；中英停用词表、否定词保护、数字/专名保护 |
| `src/core/rag-benchmark.ts` | 新增 | `buildRagBenchmarkSet()`（14 组评测集）+ `runEmbeddingBenchmark()`（recall@3 + 耗时 + 择优） |
| `src/core/embedding.ts` | 改动 | `embed()`/`embedBatch()` 在分词前调用停用词过滤（配置驱动，默认开） |
| `src/core/vector-model-manager.ts` | 改动 | `selectVectorModel()` 读取择优结果作为最高优先级 |
| `src/core/dual-channel-runtime.ts` | 改动 | 注入链路透传自动择优结果/开关（尽量少改，需确认） |
| `src/stores/*` | 改动 | 择优结果校验与失效回退；持久化最佳模型记录 |
| `src/components/settings/VectorModelPanel.vue` | 改动 | 「自动择优」按钮 + 结果对比表 + 停用词开关 + 清除择优 |

### 3.2 核心调用链

1. **每次检索/写库**：query 或 entry 先经 `normalize()` 去停用词再 `embed()`（两端一致，保特征空间）。
2. **自动择优**：设置页点击 → `runEmbeddingBenchmark()` 对已装模型跑 14 组 → 计算 recall@3 + 耗时 → `setBestEmbeddingModel(bestId)` 持久化 → `selectVectorModel()` 后续优先返回 bestId。
3. **失效回退**：择优记录模型已卸载/失效 → 自动回退平台默认，不清空记录。

---

## 4. 模块一：停用词过滤（`filterStopwords`）

### 4.1 处理流程（5 步）

| 步骤 | 操作 | 说明 |
|---|---|---|
| 1·清洗 | 折叠连续空白为单空格；去首尾空白与标点；英文统一小写 | 消除噪音 token |
| 2·保护扫描 | 识别数字串与专名，标记"不可拆"段 | 见 4.3 保护规则 |
| 3·切分 | 英文按空白切词；中文按单字切（复用现有 tokenizer 边界规则） | 与嵌入分词保持一致 |
| 4·过滤 | 逐 token：属停用词表 ∪ 非保护段 ∪ 非否定词 → 剔除 | 核心动作 |
| 5·重组 | 用空格连接剩余 token 返回 | 输出干净文本 |

### 4.2 停用词表（内置）

| 语种 | 词汇 |
|---|---|
| 英文 | `the, a, an, of, is, are, was, were, in, on, at, to, and, for, with, as, it, this, that, i, you, he, she, we, they, me, my, your` |
| 中文 | `的、了、是、在、和、与、也、都、就、还、又、被、把、这、那、它、其、及、或、之` |

> 说明：表项可扩展，但需遵循"纯虚词、不含否定词"原则；新增词应追加测试用例。

### 4.3 保护 / 保留规则

| 类别 | 规则 | 示例 |
|---|---|---|
| 否定词（保命） | 一律不剔，防语义反转 | `不、没、别、非、无、不是、没有` → 保留 |
| 数字串 | 阿拉伯数字(可小数/千分位)+白名单单位，整体保留 | `2024年`、`1000金币` 不拆 |
| 专名 | 内置+可配置专名白名单，整体保留 | `灰烬之典`、`禁书阁` 不散 |
| 标点 | 单标点剥离，两侧语义词保留 | `火元素，` → `火元素` |

> **实现说明**：中文无空格分词，"中文专名保护"与"单字停用词剔除"天然冲突。最终采用**专名白名单 + 数字保护段**的占位哨兵机制（tokenize 前整段替换、过滤后还原），白名单外的中文按单字保留（空格分隔），避免剔除中间虚词后并词漂移。输出契约：中文单字空格分隔、英文按词分隔、专名/数字整体保留。

### 4.4 开关与作用范围

| 项 | 值 |
|---|---|
| 配置键 | `aijiuguan.stopwordFilterEnabled` |
| 默认值 | `'1'`（**开**） |
| 作用对象 | 查询 + 条目两端（统一预处理） |
| 关闭行为 | `filterStopwords` 原样返回，零开销 |
| 生效位置 | `embed()`/`embedBatch()` 内、分词之前（对 onnx/gateway/mock 统一生效） |

### 4.5 接口设计

```ts
// src/core/stopword-filter.ts
export interface StopwordFilterOptions {
  /** 是否启用（默认 true） */
  enabled?: boolean;
  /** 是否保留否定词（默认 true，防语义反转） */
  keepNegations?: boolean;
  /** 额外停用词（合并进内置表） */
  extra?: string[];
}

export function filterStopwords(text: string, opts?: StopwordFilterOptions): string;
export function isStopwordFilterEnabled(): boolean;   // 读 localStorage 开关
export function setStopwordFilterEnabled(on: boolean): void;
```

---

## 5. 模块二：自动择优（`runEmbeddingBenchmark`）

### 5.1 前置条件

- 仅用户**显式点击**设置页「自动择优」时运行，不后台抢占算力、不常驻。
- 只测**已安装**模型（预置 ONNX + 用户自定义）；移除 `mock`（无参考意义）；未装模型不下载、不加载。

### 5.2 内置评测集 / 知识库

**动态层知识库（6 条记忆/情绪条目）**

| 期望命中条目 | 内容 |
|---|---|
| memory-king | 国王住在南境都城的高塔上 |
| memory-queen-promise | 王后答应资助冒险队一千金币 |
| memory-wound | 主角左臂被狼咬伤，仍在渗血 |
| memory-progress | 队伍已抵达幽暗森林边缘 |
| memory-follower | 灰袍的盗贼一直尾随队伍 |
| memory-blacksmith-intent | 老铁匠打算锻造一把魔剑 |

**静态层知识库（10 条设定条目，六元素各独立成条）**

| 期望命中 id | 内容 |
|---|---|
| `elems` | 大陆的魔法元素分为火、水、风、土、光、暗六系 |
| `fire` | 火元素象征毁灭与激情，源自火山地脉，可驱动锻造与烈焰魔法 |
| `water` | 水元素象征流动与治愈，自深洋涌泉凝聚，可驱动治疗与冰霜魔法 |
| `wind` | 风元素象征自由与迅捷，随群山气流奔涌，可驱动飞行与疾风魔法 |
| `earth` | 土元素象征厚重与坚韧，自岩层矿脉沉淀，可驱动防御与驭石魔法 |
| `light` | 光元素象征净化与希望，自天穹晨曦凝聚，可驱动治愈与圣光魔法 |
| `dark` | 暗元素象征隐秘与侵蚀，自永夜影渊滋生，可驱动隐匿与暗影魔法 |
| `blacksmith` | 铁匠铺可锻造武器、护甲、法器 |
| `ancientgod` | 古神教信奉创世的灰烬之主 |
| `forbidden` | 禁书阁封存《灰烬之典》残卷 |

**评测查询（14 组）**

动态层（6 组）：

| # | 查询 | 期望命中 |
|---|---|---|
| D1 | 国王住在哪里 | `memory-king` |
| D2 | 刚才王后答应了什么 | `memory-queen-promise` |
| D3 | 主角受了什么伤 | `memory-wound` |
| D4 | 现在队伍赶到哪里了 | `memory-progress` |
| D5 | 谁一路跟随我们 | `memory-follower` |
| D6 | 老铁匠的打算是什么 | `memory-blacksmith-intent` |

静态层（8 组）：

| # | 查询 | 期望命中 |
|---|---|---|
| S1 | 这片大陆存在哪些魔法元素 | `elems`（总览·直述） |
| S2 | 这个世界的元素力量有哪些 | `elems`（总览·改写） |
| S3 | 魔法的基本构成是什么 | `elems`（总览·抽象） |
| S4 | 火系和光系分别对应哪些元素 | `fire` + `light`（层级反查，须两条同时命中） |
| S5 | 铁匠铺能打造什么装备 | `blacksmith` |
| S6 | 古神信仰的教义 | `ancientgod` |
| S7 | 禁书阁藏着哪本书 | `forbidden` |
| S8 | 要找到那本神秘残卷得去哪 | `forbidden`（改写） |

### 5.3 跑分步骤

```
runEmbeddingBenchmark():
  1. 枚举已装模型（预置 ONNX + 用户自定义；跳过 mock）
  2. 对每个模型：
       a. 嵌入全部 6 条动态条目 + 10 条静态条目（分别入对应 VectorStore）
       b. 对每条查询嵌入 → VectorStore 读回 recall@3
       c. 记录：命中条目、是否过阈、该模型总耗时（毫秒）
  3. 计算 recall@k = 命中条目数 / 14
       例外：S4 需同时命中 fire+light 才计入（按 2 条算）
  4. selectBest = recall 最高；并列 → 取耗时更短
  5. setBestEmbeddingModel(bestId) 持久化 → 返回对比结果列表
```

### 5.4 结果持久化与应用

- 存储：`localStorage('aijiuguan.bestEmbeddingModel') = { id, recall, latencyMs, timestamp }`
- `selectVectorModel()` 优先级改为：**用户显式选择 > 择优结果 > 平台默认**（浏览器 bge-small / 桌面按角色：动态 gte-large / 静态 bge-large）
- 择优记录模型卸载/失效 → 回退平台默认，**保留记录不删**

### 5.5 校验与边界

| 场景 | 处理 |
|---|---|
| 某模型加载失败 / 嵌入异常 | 跳过该模型并标注原因，不影响整体 |
| 单模型串行执行 | 避免内存峰值 |
| 模型数 / 条目数过大 | 显示进度（运行中禁用按钮） |
| 无已装模型 | 提示用户先安装向量模型，不执行 |
| mock 参与 | 移除，不参与择优 |

### 5.6 接口设计

```ts
// src/core/rag-benchmark.ts
export interface EmbeddingBenchmarkItem {
  query: string;
  expected: string[];          // 期望命中的条目 id 列表（全部命中才算过）
  expectedCount: number;       // 需命中条数（S4=2，其余=1）
}
export interface RAGBenchmarkSet {
  dynamicKb: Array<{ id: string; text: string; channel: 'dynamic' }>;
  staticKb: Array<{ id: string; text: string; channel: 'static' }>;
  cases: Array<{ id: string; channel: 'dynamic' | 'static'; query: string; expected: string[]; expectedCount: number }>;
}
export interface BenchmarkResult {
  modelId: string;
  recall: number;               // 命中 / 14
  passed: number;               // 通过 case 数
  latencyMs: number;            // 总耗时
  error?: string;               // 失败原因（可选，失败时因含 error 不计入择优）
}
export interface BenchmarkOutcome {
  results: BenchmarkResult[];
  best?: BenchmarkResult;       // 择优结果（recall 最高、并列取耗时短）
}
export function buildRagBenchmarkSet(): RAGBenchmarkSet;
export async function runEmbeddingBenchmark(): Promise<BenchmarkOutcome>;
export function getBestEmbeddingModel(): string | null;   // 读 localStorage
export function setBestEmbeddingModel(id: string, recall: number, latencyMs: number): void;
export function clearBestEmbeddingModel(): void;
```

---

## 6. 界面改动（`VectorModelPanel.vue`）

| 控件 | 行为 |
|---|---|
| 按钮「自动择优」 | 点击触发 `runEmbeddingBenchmark()`；运行中禁用 + 显示进度 |
| 结果对比表 | 展示 模型 \| recall@3 \| 耗时 \| 是否选中；可滚动 |
| 停用词过滤开关 | `isStopwordFilterEnabled()` / `setStopwordFilterEnabled()`，默认开 |
| 清除择优按钮 | `clearBestEmbeddingModel()`，恢复平台默认 |

---

## 7. 测试计划

### 7.1 停用词过滤（单元测试，`tests/core/stopword-filter.test.ts`）
- 中英文虚词剔除：`'the king lives in the castle'` → `'king lives castle'`
- 否定词保留：`'找不到地图'`、`'不认可这条规则'` 保留 `不`
- 数字/专名保护：`'2024年'`、`'灰烬之典'` 不拆散
- 开关关闭：`enabled:false` 原样返回
- 空串/纯标点边界

### 7.2 评测集与择优（单元测试，`tests/core/rag-benchmark.test.ts`）
- `buildRagBenchmarkSet()` 完整性与一致性（14 组、expected 全部在 KB 内）
- 使用 `MockEmbeddingProvider` 验证跑分正确计数（含 S4 双命中口径）
- 择优判定：recall 最高优先、并列取耗时短
- 失败模型跳过、不破坏整体

### 7.3 集成接线（回归，复用现有 `tests/core/market-index-integration.test.ts` 模式）
- 开关开启时 `embed()` 输出与关时不同（去停用词文本）
- `selectVectorModel()` 在设置 bestId 后优先返回 bestId；失效回退默认
- 全量测试套件无回归

---

## 8. 开发落地清单

### 8.1 新增文件
- `src/core/stopword-filter.ts`
- `src/core/rag-benchmark.ts`
- `tests/core/stopword-filter.test.ts`
- `tests/core/rag-benchmark.test.ts`

### 8.2 改动文件
- `src/core/embedding.ts`：`embed()` / `embedBatch()` 接入 `filterStopwords`
- `src/core/vector-model-manager.ts`：`selectVectorModel()` 读取最优模型
- `src/core/dual-channel-runtime.ts`：择优结果/开关透传（尽量少改）
- `src/i18n/locales/zh.ts`、`en.ts`：新增 UI 文案（自动择优、对比表、开关等）
- `src/components/settings/VectorModelPanel.vue`：UI 接线
- 必要 store：择优结果校验与回退

### 8.3 质量标准
- lint / typecheck / 全量测试通过（CI 7 重门禁）
- 遵循现有模块命名、`noUncheckedIndexedAccess`、i18n 无硬编码中文
- 不做无关重构

---

## 9. 风险与设计取舍

| 项 | 取舍说明 |
|---|---|
| 停用词过滤两端一致 | 保证查询与条目在同一特征空间比较，余弦相似度才公平 |
| 保守剔除（保留否定词） | 避免"找不到地图"被误变语义；数字/专名保护避免拆散关键词 |
| 择优默认关（手动触发） | 不后台抢占算力、不常驻；符合项目"优化默认关"风格（仅停用词默认开，因纯收益低风险） |
| 择优结果优先于平台默认 | 真正让"自动择优"生效，而非评选完不落地 |
| 不做第三方分词库 | 复用现有 tokenizer 边界 + 一次明文预处理，避免引入重依赖与体积膨胀 |
| docs/ 不入 git | 遵循项目既有约定（与现有 `threat-model.md` 等同级，不提交） |

---

## 10. 待确认项（已拍板）

- [x] 择优结果覆盖范围：**采用全局一个 `bestEmbeddingModel`**，动态层与静态层两个通道都经 `selectVectorModel()` 读它（已实现，见 §5.4）
- [x] 停用词表：**按 §4.2 定稿**，扩展需追加测试（已实现，白名单专名见 §4.3 说明）