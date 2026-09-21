# RAG 增强实现计划 — 停用词过滤 + 嵌入模型自动择优

> 关联设计文档：`docs/design/rag-enhancement-design.md`
> 状态：待执行
> 方法：TDD（先写测试后实现），每个任务含独立验证。
> 分支约定：实现前需在非 master 分支进行（除非用户明确允许在 master）。

---

## 0. 分支与运行命令

- 建议分支：`feat/rag-enhancement`
- 验证命令：
  - 单测单文件：`npx vitest run <path>`
  - 全量回归：`npm test`
  - 类型检查：`npx vue-tsc --noEmit`
  - Lint：`npm run lint`

---

## 1. 停用词过滤模块

### 任务 1.1 — 新建 `src/core/stopword-filter.ts`
**目标**：实现纯函数 `filterStopwords` + 开关读写函数。
**步骤**：
1. 定义 `StopwordFilterOptions`（`enabled` 默认 true、`keepNegations` 默认 true、`extra`）。
2. 实现内置中/英停用词表（与设计 §4.2 完全一致，含在注释挂接设计文档章节）。
3. 实现 5 步流程：清洗 → 保护扫描（数字/专名）→ 切分 → 过滤 → 重组。
4. 保留否定词集合 `不/没/别/非/无/不是/没有`。
5. 实现 `isStopwordFilterEnabled()`/`setStopwordFilterEnabled()`（读取 `aijiuguan.stopwordFilterEnabled`，默认 `'1'`）。
6. 若 `enabled===false` 或 `opts` 缺省，原样返回输入。
**验证**：`npx vue-tsc --noEmit` 通过。

### 任务 1.2 — 新建 `tests/core/stopword-filter.test.ts`（先写，TDD Red）
**目标**：锁定规则，覆盖设计 §4 全部用例。
**必含用例**：
- 英文：`the king lives in the castle` → 不含 `the/in/the`、保留 `king castle`；大小写归一（`King`→`king`）。
- 中文：`国王住在城堡里` → 剔 `在/里`，保留 `国王 城堡`。
- 否定保留：`找不到地图` 保留 `不`；`不认可` 保留 `不`。
- 数字保护：`2024年`、`1000金币` 不拆散。
- 专名保护：`灰烬之典`、`禁书阁` 整体保留。
- 开关关闭：`enabled:false` 原样返回。
- 空串 / 纯标点边界。
**验证**：运行该文件，确认有失败（Red）→ 再回任务 1.1 实现至 Green。

### 任务 1.3 — 接入 `src/core/embedding.ts`
**目标**：让 `embed()`/`embedBatch()` 在分词前统一调用 `filterStopwords`。
**步骤**：
1. `import { filterStopwords } from './stopword-filter'`。
2. 在 `embed(text)` 入口处 `text = filterStopwords(text)`（内部读取开关，默认开）。
3. 同时接入 `embedBatch`（逐条调用，保持批量语义）。
4. 保持现有接口不变（对 onnx/gateway/mock 统一生效）。
**验证**：`npx vue-tsc --noEmit` 通过；跑 `tests/core/embedding.test.ts` 确认无回归并新增 1 条"开启时输出与关闭不同"用例。

---

## 2. 自动择优模块

### 任务 2.1 — 新建 `src/core/rag-benchmark.ts`（数据部分）
**目标**：实现 `buildRagBenchmarkSet()` 与持久化读写函数。
**步骤**：
1. 定义 `RAGBenchmarkItem`/`RAGBenchmarkSet`/`BenchmarkResult`/`BenchmarkOutcome` 类型（与设计 §5.6 一致）。
2. 实现 `buildRagBenchmarkSet()`：6 条动态 KB + 10 条静态 KB + 14 组 case（D1–D6、S1–S8，与设计 §5.2 完全一致）。S4 的 `expectedCount=2`（fire+light）。
3. 实现 `getBestEmbeddingModel()`/`setBestEmbeddingModel()`/`clearBestEmbeddingModel()`（读写 `aijiuguan.bestEmbeddingModel`，JSON 含 `{id, recall, latencyMs, timestamp}`）。
**验证**：`npx vue-tsc --noEmit` 通过。

### 任务 2.2 — 新建 `tests/core/rag-benchmark.test.ts`（数据，TDD Red）
**必含用例**：
- `buildRagBenchmarkSet()` 返回 14 组、16 条 KB。
- 每个 case 的 `expected` 都能在对应 channel 的 KB 中找到（一致性校验）。
- S4 的 `expectedCount === 2`。
- 持久化读写往返一致；`clear` 后 `getBest` 返回 null。
**验证**：运行该文件确认 Red → 补任务 2.1 至 Green。

### 任务 2.3 — 实现 `runEmbeddingBenchmark()`（跑分逻辑）
**目标**：对已装模型按 recall@3+耗时算分并择优。
**步骤**：
1. 枚举已装模型（`ModelFileAdapter.listInstalled()` + `UserModelFileAdapter.listInstalled()`，跳过 mock）。
2. 对每个模型：嵌入 KB 条目 → 各自 `VectorStore` → 逐 case 查询取 recall@3，按 `expectedCount` 判定命中。
3. 汇总：`passed/14` 得 recall；记录 `latencyMs`；异常模型标注 `error` 并跳过。
4. `selectBest`：recall 最高；并列取耗时短；`setBestEmbeddingModel(best)`。
5. 无已装模型 → 返回空且不写记录。
**验证**：`npx vue-tsc --noEmit` 通过。

### 任务 2.4 — 补 `rag-benchmark.test.ts`（跑分逻辑，TDD）
**必含用例**（用 `MockEmbeddingProvider` 注入）：
- recall 计算正确（含 S4 双命中口径）。
- 择优：recall 高者胜。
- 并列：耗短者胜。
- 单模型失败 → 跳过、不破坏整体、不写入 best。
- 空模型集 → 返回空。
**验证**：该文件全绿。

### 任务 2.5 — `selectVectorModel()` 接入择优
**目标**：优先级 `用户显式选择 > 择优结果 > 平台默认`。
**步骤**：在 `src/core/vector-model-manager.ts` 的 `selectVectorModel()` 中，当无 `userChoice` 时，先查 `getBestEmbeddingModel()`；非空则按该 id + 角色校验（失效回退默认）。沿用现有 `isBrowserRuntime()` 分支。
**验证**：`npx vue-tsc --noEmit`；跑 `tests/core/vector-model-manager.test.ts` 新增用例。

---

## 3. UI 接线（`VectorModelPanel.vue`）

### 任务 3.1 — 自动择优按钮 + 对比表
**步骤**：
1. 加「自动择优」按钮，点击调 `runEmbeddingBenchmark()`；运行中禁用 + 进度。
2. 结果对比表：模型 | recall@3 | 耗时 | 是否选中。
3. 「清除择优」按钮 → `clearBestEmbeddingModel()`。
4. 结果区增加错误态（无模型 / 单模型失败标注）。
**验证**：`npm run lint` + `npx vue-tsc --noEmit`。

### 任务 3.2 — 停用词开关
**步骤**：加「停用词过滤」开关，绑定 `isStopwordFilterEnabled()`/`setStopwordFilterEnabled()`，默认开。
**验证**：`npm run lint` + `npx vue-tsc --noEmit`。

### 任务 3.3 — i18n 文案
**步骤**：`src/i18n/locales/zh.ts`、`en.ts` 新增：自动择优、运行中/完成、对比表表头、清除择优、停用词开关等（无硬编码中文）。
**验证**：`npm run i18n:check:strict`。

---

## 4. 收尾与回归

### 任务 4.1 — 全量回归
**步骤**：跑 `npm test`、`npm run lint`、`npx vue-tsc --noEmit`、`npm run i18n:check:strict`。
**验证**：全部通过、零新增 warning。

### 任务 4.2 — 文档同步
**步骤**：核对 `docs/design/rag-enhancement-design.md` 与实现一致，更新状态为"已实现"（如无偏差则跳过）。
**验证**：无悬空规格段。

---

## 5. 验收标准汇总

| # | 验收项 | 判定 |
|---|---|---|
| 1 | 停用词过滤中英可控、否定/数字/专名保护 | 单测全绿 |
| 2 | 停用词默认开启、可关 | 开关单测 + UI |
| 3 | 择优用 14 组中文评测集、recall@3+耗时 | 跑分单测全绿 |
| 4 | 择优结果驱动 `selectVectorModel`，失效回退 | manager 单测 |
| 5 | 全量门禁通过（lint/i18n/typecheck/test） | CI 7 重门禁 |