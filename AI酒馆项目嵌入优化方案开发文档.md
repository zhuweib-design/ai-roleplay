# AI酒馆项目嵌入优化方案 · 开发文档

> 版本：v1.0（基于《三优化方法嵌入搭配方案》修订版，已落实审查 P0-1～P0-4、P1-1～P1-8）
> 适用范围：AI酒馆（角色扮演对话系统）—— 核心要求：语气情绪连贯、情绪精准表达、世界观/角色设定长期稳定且不可被优化器覆盖改写。
> 技术栈假设：Python 3.11 + FastAPI + SQLite（WAL 模式）；模型走 OpenAI 兼容接口（默认 DeepSeek，因其前缀缓存定价可量化收益）。若现有系统为 Node/Go，本文档的接口与数据结构保持语言无关，可平移。

---

## 一、要实现的目标

### 1.1 功能范围

| 模块 | 层 | 功能说明 |
|---|---|---|
| 上下文结构层 | L0 | 角色卡/世界观常驻指令化（字节稳定前缀）；角色档案版本化存储（稳定 ID + 修订号 + 快照回溯）；会话级情绪状态独立存储与更新；设定文件防覆盖保护 |
| 内容压缩层 | L1 | 长会话历史提取式压缩（保留原句）；CCR 存储实现"有损在线、无损端到端"；压缩前后语义校验与 fail-open 回退；豁免黑名单（角色卡/世界观/情绪状态永不压缩） |
| 输出纪律层 | L2 | 元叙述（状态性旁白）精简；角色对白与情绪/氛围内容硬豁免；Auto-Clarity 软回退 + 保护正则硬回退双保险 |

### 1.2 效果指标（可验证、可验收）

| 指标 | 目标值 | 测量方式 |
|---|---|---|
| 核心设定一致率（≤10 个关键事实） | **100%** | 设定抽取测试（实体匹配判定） |
| 全量设定一致率（20–50 事实） | ≥95% | 设定抽取测试，连续 3 次滚动通过率 |
| 设定文件静默改写数 | **0** | 版本号 + 文件哈希审计 |
| 情绪词保留率 | ≥95%（优化后 vs 基线） | 情绪词表覆盖率对比 |
| 情绪标签连贯率（相邻轮次） | ≥90% | 情绪标注器输出对比 |
| L0 前缀段字节稳定率 | **100%** | 每请求对比前缀哈希 |
| 缓存命中率（观测项，非门禁） | ≥60%（DeepSeek 前缀段） | provider usage 统计 |
| 输出 token 节省（对话型） | 20–40% | 真实用量对比（禁止估算） |
| 首 token 延迟 | p95 ≤ 2.5s | 压测（locust） |
| 压缩管线单次耗时 | ≤100ms（不含 LLM 摘要） | 埋点统计 |
| BM25 召回耗时 | 软 100ms / 硬 500ms | 埋点统计，超时降级 |

---

## 二、需要的资源

### 2.1 技术栈与依赖库

| 类别 | 选型 | 用途 | 说明 |
|---|---|---|---|
| 语言/框架 | Python 3.11 + FastAPI + uvicorn | 服务骨架 | 与 LLM 生态集成成本最低 |
| 存储 | SQLite（WAL）+ aiosqlite | 角色档案/记忆/CCR | 单机部署足够；CCR 可用 Redis 后端扩展 |
| 召回 | rank_bm25（或自研，参照 Reasonix `internal/retrieval/bm25.go`） | 设定/记忆召回 | 自带 CJK 单 rune 切分，需移植 |
| 情绪标注 | 规则 + 可选 LLM | 情绪状态机 | 词表：NRC 中文情绪词表 / 大连理工情感本体（DUTIR） |
| 压缩 | 自研提取式压缩器（移植 TextCrusher 思路） | 历史对话压缩 | 一期不引入 ONNX（Kompress 过重） |
| 提示词 | 自研 caveman-lite 规则包 | L2 输出纪律 | 参考 caveman SKILL.md 边界规则 |
| 测试/压测 | pytest、locust | 回归与压测 | 缓存守卫测试用 mock provider |
| CI | GitHub Actions | 门禁 | 跑"前缀稳定率 + 设定一致率"回归 |

### 2.2 数据资源

| 资源 | 内容 | 提供方 |
|---|---|---|
| 角色卡样例集 | 10–20 个角色卡（含世界观/关系/禁忌） | 产品/编剧 |
| 设定事实测试集 | 20–50 个事实，其中 ≤10 个标记为"核心" | 产品/编剧 |
| 情绪词表 | NRC 中文 / DUTIR + 项目自定义 | 开源 + 编剧补充 |
| 盲评样本集 | 10 组前文（诀别/背叛/告白等关键场景） | 编剧 |
| 历史会话脱敏样本 | 100+ 轮长会话（用于压缩灰度） | 运营 |

### 2.3 人力分工

| 角色 | 人数 | 职责 |
|---|---|---|
| 后端工程师 | 1 | L0 存储层、L1 压缩管线、CCR、接口实现 |
| LLM 应用工程师 | 1 | L2 提示词工程、情绪标注器、语义校验器、评估脚本 |
| 测试工程师 | 0.5 | 压测、回归门禁、盲评组织 |
| 产品/编剧 | 0.5 | 角色卡、测试集、风格样本、盲评执行 |

### 2.4 环境准备

- 开发环境：Python 3.11 venv；`pip install fastapi uvicorn aiosqlite rank-bm25 pytest locust openai`
- mock 模型端点：本地起 OpenAI 兼容 mock（录制响应），供缓存守卫测试与 CI 使用
- CI：GitHub Actions runner（跑 pytest 全量 + 缓存守卫回归）

---

## 三、开发步骤

### 3.0 阶段 0 · 基线采集（第 1 周）

- 在未接入任何优化层时，对现有酒馆会话运行全部评估脚本（见 1.2 指标表），记录基线。
- 产出：`baseline.json`（各指标基线值），后续所有验收对比该基线。

### 3.1 阶段 1 · L0 上下文结构层（第 2–3 周）

**接口设计**

```python
class MemoryStore:                      # 版本化记忆存储（角色档案 + 设定）
    async def put(fact: MemoryFact) -> MemoryFact          # 原子写，修订号 +1
    async def get(mid: str, revision: int | None) -> MemoryFact
    async def revisions(mid: str) -> list[RevisionMeta]    # 快照列表
    async def restore(mid: str, revision: int) -> MemoryFact
    async def diff(mid: str, rev_a: int, rev_b: int) -> str  # 差异审计

class CharacterRegistry:                # 角色卡注册与前缀组装
    async def active_card(session_id: str) -> CharacterCard
    async def assemble_prefix(session_id: str) -> bytes     # 字节稳定前缀
    def prefix_hash(prefix: bytes) -> str                   # 每请求对比

class EmotionTracker:                   # 会话级情绪状态机
    async def current(session_id: str) -> EmotionState
    async def update(session_id: str, label: str, reason: str) -> None  # 独立于角色卡存储
```

**数据结构（SQLite 表）**

```sql
CREATE TABLE memory_facts (
  id TEXT PRIMARY KEY,            -- 'char-<hex>' 稳定 ID，改名不变
  scope TEXT NOT NULL,            -- 'standing'(常驻指令) | 'scoped'(作用域事实)
  kind TEXT NOT NULL,             -- 'character' | 'world' | 'emotion' | 'session'
  body TEXT NOT NULL,
  revision INTEGER NOT NULL,       -- 单调递增
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE revisions (
  id TEXT NOT NULL, revision INTEGER NOT NULL,
  snapshot TEXT NOT NULL, ts INTEGER NOT NULL,
  author TEXT NOT NULL DEFAULT 'optimizer',   -- 区分作者更新与静默改写（P2-3）
  PRIMARY KEY (id, revision)
);
CREATE TABLE session_state (
  session_id TEXT PRIMARY KEY, emotion_label TEXT,
  emotion_reason TEXT, updated_at INTEGER, revision INTEGER
);
```

**核心逻辑**

1. **前缀组装器**：`assemble_prefix` 按固定顺序拼接 base → 角色卡（standing）→ 世界观（standing）→ 当前轮召回的记忆（scoped，放动态段）；每请求记录 `prefix_hash`，若与上次不同即告警（P0-3 的字节稳定率 100% 指标）。
2. **防覆盖**：所有写入口检查 `author` 字段——优化器进程使用独立写权限，只允许写 `scope='scoped'` 且 `kind IN ('emotion','session')` 的事实；对 `standing` 事实任何非人工写操作直接拒绝（硬约束，非提示词软约束）。
3. **情绪状态机**（落实 P1-1）：每轮模型输出后，情绪标注器（规则词表优先 + 置信度低时调 LLM，temperature=0）解析 `emotion_label` 与 `emotion_reason`，写入 `session_state`；写失败静默沿用旧状态，绝不影响主回复链路（fail-open）。

### 3.2 阶段 2 · L2 输出纪律层（第 4 周）

**接口设计**

```python
class OutputDiscipline:
    def classify_scope(text: str) -> Scope    # 'meta_narration' | 'dialogue' | 'emotion_narration' | 'other'
    def compress(text: str, scope: Scope) -> str   # 仅 meta_narration 生效
    def protect(text: str) -> str             # 保护正则哨兵替换（对白/情绪词/设定实体）
```

**核心逻辑**

1. **保护正则（硬约束，落实 P2-4）**：对白引号内容、情绪词表命中词、设定核心实体，先经哨兵机制（参照 caveman-shrink `withProtectedSegments`）替换为占位符，压缩后再恢复——保证硬豁免。
2. **Auto-Clarity（软约束）**：提示词声明"涉及安全、不可逆操作、情绪冲突澄清、用户重复提问时，恢复完整表达"（对齐 caveman Auto-Clarity）；硬约束优先于软约束。
3. **旁白分类**（落实 P1-5）：`classify_scope` 用规则（情绪词表命中 + 微表情动词表"发抖/沉默/攥紧"等）区分"状态性旁白"（可精简）与"情绪/氛围性旁白"（豁免）。
4. 档位仅用 lite：保留完整句法，只删填充词/客套/重复。

### 3.3 阶段 3 · L1 内容压缩层（第 5–6 周）

**接口设计**

```python
class CompressionPipeline:
    async def maybe_compress(ctx: ConversationCtx) -> CompressResult | None
    # 触发条件：上下文占用 ≥70%（soft）/ ≥80%（hard）且距上次压缩 ≥N 轮（冷却，P0-1）

class ExtractiveCompressor:                  # 移植 TextCrusher 思路，纯规则确定性
    def compress(text: str, context: str, target_ratio: float) -> Result
    # 句切分 → 新颖度/BM25 相关性/显著性打分 → 3-gram 去重 → 按序重组（保留原句）

class SemanticValidator:
    def check(original: str, compressed: str) -> Validation   # P1-6 规则校验器
    # 实体保留率 = 命中设定实体的数量 / 原文本实体数；情绪词保留率同理
    # 通过条件：min(实体保留率, 情绪词保留率) ≥ 0.9 且关键实体保留率 = 1.0

class CcrStore:                              # 无损端到端（SQLite 后端）
    def put(hash: str, payload: str, ttl: int) -> None
    def get(hash: str) -> str | None         # 滑动 TTL：命中刷新
    # 会话级 TTL 默认 24h（P1-4 酒馆双写：原文同时写长期存储）
```

**核心逻辑**

1. **压缩形态**（落实 P0-1）：历史压缩仅三种形态——①一次性固化（结果持久化，同一历史段禁止二次压缩，压缩后缓存以新前缀命中）；②窗口溢出压缩（接受一次 miss）；③检索式移出（旧历史移入 CCR，按需注入动态段）。
2. **豁免黑名单**（落实 P1-0 思想，对齐 caveman-compress 敏感文件规则）：`standing` 事实、情绪状态、世界观文件永不进入压缩管线；管线入口先检查对象 scope。
3. **LLM 摘要约束**（落实 P0-2）：若用 LLM 摘要，temperature=0 且摘要结果按内容哈希持久化，仅生成一次。
4. **语义校验 + 三级回退**（落实 P1-6）：校验不过 → 一级静默回退原文；连续 3 次失败 → 二级暂停该会话压缩并在日志/面板提示；`/no-opt` 三级强控全关。

### 3.4 阶段 4 · 集成、灰度与验收（第 7 周）

- 灰度路径：基线（无优化）→ L0 全量 → L2 5% 流量 → L1 1% 长会话流量 → 逐步放开。
- 每层灰度后复测 1.2 指标表，对比 `baseline.json`，任一指标不达标即回滚该层。

---

## 四、依据

### 4.1 技术原理

1. **L0（上下文结构层）**：源自 DeepSeek-Reasonix——系统提示词分层固定使前缀字节稳定，命中 DeepSeek 前缀缓存（命中价约为 miss 的 1/10）；指令/事实分离（standing vs scoped）防止陈旧事实获得指令权威；版本化记忆（稳定 ID + 单调修订号 + 原子写 + 快照）保证"设定不可覆盖"由存储层而非提示词保证。其 `cache-guard.sh` 门禁与 `compactStuck` 冷却机制为本项目压缩策略提供了已验证的工程范式。
2. **L1（内容压缩层）**：源自 headroom——TextCrusher 提取式压缩（打分选取、保留原句、76ms/33 万词的性能）保证确定性；CCR（Compress-Cache-Retrieve）以哈希键暂存原文、检索工具无损取回，实现"有损在线、无损端到端"；fail-open 保证压缩失败不阻断请求。
3. **L2（输出纪律层）**：源自 caveman——提示词规则 + 边界保护（代码/数字/术语逐字节保留）+ Auto-Clarity 自动回退 + 哨兵保护正则，实测可削减 65% 输出 token 且不触碰技术内容。

### 4.2 可行性论证

- **增量改造**：三层均为"中间件"形态，不替换模型、不改用户交互，可在现有会话服务外挂载，灰度风险低。
- **收益可量化**：DeepSeek 前缀缓存定价公开，L0 前缀稳定后缓存收益可每日对账；L2 输出节省用真实用量统计。
- **风险可控**：所有压缩路径默认关闭、fail-open；设定/情绪有硬豁免与版本快照兜底。

### 4.3 与现有系统契合点

- 若现有酒馆已具备消息持久化（JSONL/DB）与角色卡管理，L0 的 `MemoryStore` 可直接在现有表上追加 `revision/scope/author` 字段，无需重建。
- 情绪状态机可复用现有"系统状态"字段，仅需独立成表隔离写权限。
- 压缩管线挂在"上下文组装"环节之后、LLM 调用之前，对现有链路只增不减。

---

## 五、实施计划

### 5.1 时间排期与里程碑（共 7 周）

| 里程碑 | 时间 | 交付物 | 验收标准 |
|---|---|---|---|
| M0 基线 | 第 1 周末 | `baseline.json` + 评估脚本 | 全部指标可复跑，基线数据完整 |
| M1 L0 上线 | 第 3 周末 | MemoryStore/CharacterRegistry/EmotionTracker | 前缀稳定率 100%；核心设定一致率 100%；`standing` 事实写保护生效（注入测试通过） |
| M2 L2 上线 | 第 4 周末 | OutputDiscipline | 情绪词保留率 ≥95%；对白/情绪旁白豁免测试通过；输出 token 节省 ≥15% |
| M3 L1 灰度 | 第 6 周末 | 压缩管线 + CCR + 校验器 | 长会话输入 token 节省 ≥20%；关键实体保留率 100%；校验失败静默回退生效 |
| M4 全量验收 | 第 7 周末 | 全量灰度 + 验收报告 | 1.2 全部指标达标；无 P0/P1 遗留问题 |

### 5.2 风险预案

| 风险 | 触发条件 | 预案 |
|---|---|---|
| 压缩击穿缓存 | 缓存命中率持续下降 / 前缀哈希告警 | 立即暂停 L1 压缩（二级回退），审计压缩对象是否越界进入前缀段 |
| 情绪漂移 | 情绪词保留率 <95% 或盲评均分差 >0.5 | 扩大豁免词表；收紧 L2 作用范围至纯状态旁白 |
| 设定被改写 | 哈希审计发现无版本号修改 | 从 `revisions` 快照一键恢复 + 告警定位写入来源 |
| 延迟超标 | 首 token p95 >2.5s | BM25 超时降级（返回空召回）；压缩管线移出请求热路径（异步） |
| CCR 过期致"无损"变"有损" | 检索 404 计数上升 | 双写长期存储（P1-4）；调大会话级 TTL |
| 模型忽略检索工具 | 取回率 <50% | 在提示词中强化"需要精确信息时先调用 headroom_retrieve"指令；或对关键实体压缩时强制保留（不压缩） |

---

*文档完。下一份：《AI小说创作系统嵌入优化方案开发文档》。*
