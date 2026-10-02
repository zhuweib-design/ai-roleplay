# ort 首屏隔离设计文档（第二轮优化 · O-1）

> 状态：**已实施完成**（2026-10-01，评审记录见 §9；实施记录见 §10；闸门判定：Phase 2 不启动）
> 分支：`perf/ort-first-screen-isolation`
> 关联：`docs/dev/PERF_OPTIMIZATION_2026-09-28.md` §3.5（根因定位）、`docs/dev/OPTIMIZATION_ROUNDS_2026-10-01.md` §二

---

## 1. 背景与问题

`ort.bundle.min`（onnxruntime-web，约 **104KB gzip**）持续出现在**首屏**传输中，与 2026-08-18"已退出首屏"的记录矛盾，属性能回退。首屏本不应包含任何本地向量推理能力——它仅在用户启用本地嵌入时才被使用。

## 2. 根因（已核实的静态依赖链）

```
chat.ts（首屏 store，entry chunk）
  └─ dual-channel-runtime          【静态 value import】VectorModelManager / selectVectorModel
       ├─ vector-model-manager     【静态 value import】getBestEmbeddingModel ← rag-benchmark
       │    └─ rag-benchmark       【静态 value import】OnnxEmbeddingProvider ← onnx-embedding-provider
       ├─ vector-model-install     （fflate，无 ort ✓）
       └─ remote-api-key-state     （零依赖 ✓）
onnx-embedding-provider → await import('onnxruntime-web')   【动态，但被 rolldown 提升】
```

关键事实：
- 全仓**只有** `onnx-embedding-provider` 引用 onnxruntime-web（`await import`，另有 3 处 type-only 引用）；
- rolldown(vite 8) 会把**被多处引用的动态导入**提升为静态 import——上轮已把 `settings → vector-model-manager` 链切断（remote-api-key-state 抽离），但 `chat.ts → dual-channel-runtime → vector-model-manager → rag-benchmark → onnx-embedding-provider` 这条静态链仍在，ort 依旧被拖进首屏（vite.config.ts 注释已记录）；
- 外围对 vector-model-manager 的其余引用全部是 `import type`（编译期擦除，无运行时边）。

## 3. 目标与验收标准

| # | 验收标准 | 验证方式 |
|---|---|---|
| G-1 | 构建产物中 **entry / 首屏 chunk 零静态引用** `ort.bundle.min`（dist JS 文本 grep 无 `ort.bundle.min` 的 import 语句指向 entry 链） | `npm run build` + dist 静态分析脚本 |
| G-2 | 首屏传输量下降约 104KB(gzip)（551KB → 约 447KB） | `scripts/measure-startup.mjs --list` 前后对比 |
| G-3 | 本地向量嵌入功能不回归：动态路径（首次使用本地嵌入时）仍能加载 ort 并完成嵌入 | 既有单测 + 新增回归测试 |
| G-4 | 全部质量门禁通过（typecheck/lint/i18n/test/build/CSP；对比度不受影响） | 证据包 |
| G-5 | modulepreload 清单与实际 chunk 图一致（不新增首屏 preload） | 检查 dist/index.html |

非目标：不改动向量嵌入的运行时行为与精度；不引入新 npm 依赖；不改 CSP 指令集（除非走方案 A 才需要 worker-src）。

## 4. 候选方案

### 方案 B：静态依赖链切割（主线，低风险）

把静态链上唯一的 ort 引用点（rag-benchmark 的 provider 工厂）与同步上下文的纯数据函数（best-model 目录）拆开，使 onnx-embedding-provider 仅剩**动态**到达路径：

- **B1 拆目录模块**：新增 `src/core/rag-model-catalog.ts`——承载 `BEST_KEY` + `getBestEmbeddingModel` / `setBestEmbeddingModel` / `clearBestEmbeddingModel`（纯 localStorage 同步函数，零 ort/零 provider 依赖）。rag-benchmark `export ... from './rag-model-catalog'` 保持兼容；`vector-model-manager` 改从 catalog 导入（`selectVectorModel` 是同步函数，必须保持同步语义）。
- **B2 工厂懒加载**：rag-benchmark 的 `defaultProviderFactory`（本就是 async）改为 `await import('./onnx-embedding-provider')` 后再构造，删除静态 import。
- 切割后静态链终点 = catalog / install / api-key-state（均无 ort）；onnx-embedding-provider 仅剩动态到达：dual-channel-runtime:234、rag-benchmark 工厂、VectorModelPanel:305。

### 方案 A：Web Worker 隔离（备选，架构级）

onnxruntime 移入专用 Worker：主线程 `EmbeddingWorkerClient`（postMessage RPC：init/embed/dispose），Worker 侧加载 ort 与模型文件。优点：ort 与 WASM 彻底离开主线程 chunk 图，且嵌入计算不再阻塞主线程。代价与风险：新增 worker 通信层与生命周期管理；CSP 需确认 `worker-src`（当前 webCspPlugin 12 指令未显式声明，需评估 blob/self）；jsdom 下 Worker 不可用，测试需抽象 transport（fake）；工作量 2–3 天，回归面大（嵌入精度、模型文件寻址、进度回调）。

### 方案 C：独立 HTML 入口/iframe —— 排除

跨入口通信复杂、内存翻倍、体验割裂，不做。

## 5. 决策与分阶段执行

**决策：两阶段。先 B 后 A，以实测为切换闸门。**

- **Phase 1（本轮实施）**：方案 B（B1+B2）。完成后按 §3 G-1/G-2 实测：
  - **闸门**：若 entry/首屏 chunk 已无 ort 静态引用 → Phase 2 **不启动**（用最小代价达标，方案 A 移入后续排期备忘）；
  - 若 rolldown 仍把 ort 提升进首屏（上轮经验提示有此可能）→ 启动 Phase 2。
- **Phase 2（条件启动）**：方案 A Worker 隔离。设计要点已在 §4.A 固化，届时按本文档 §8 步骤表追加细化步骤并逐条执行。

## 6. Phase 1 风险与对策

| 风险 | 对策 |
|---|---|
| rag-benchmark 兼容导出遗漏导致调用方破坏 | `export { ... } from './rag-model-catalog'` 保持符号不变；typecheck + 全量单测覆盖 |
| 懒加载工厂改变 provider 构造时序 | 工厂本就 async，调用方全部 await；新增单测断言"未调用 benchmark 时不加载 ort 模块"（模块图层面由 G-1 验证） |
| rolldown 仍提升 ort（闸门失败） | 不做半吊子补丁；按 §5 启动 Phase 2，文档记录实测数据 |
| chunk 图变化使 modulePreload 排除清单失真 | G-5 步骤中重新核对 vite.config.ts 排除规则，按实测调整并注释 |

## 7. Phase 2 风险预案（若启动）

- 通信协议先于实现冻结（init/embed/dispose + 错误回传），transport 抽象使 jsdom 可注入 fake；
- CSP：优先 `worker-src 'self'`（同源文件 worker，不引 blob），与 check:csp 守卫同步扩展断言；
- 模型文件（ArrayBuffer）传输用 transferable，避免结构化拷贝放大内存；
- 回滚：单 commit 回退，主线程旧 provider 保留一个迭代期。

## 8. 实施步骤（Phase 1，每步完成即记录 §10）

| # | 步骤 | 验证 |
|---|---|---|
| S1 | 新增 `src/core/rag-model-catalog.ts`（目录三函数 + BEST_KEY） | 新单测：读写清/持久化 |
| S2 | rag-benchmark 改引用 catalog + 兼容 re-export；工厂改动态 import | 全量 vitest + typecheck |
| S3 | vector-model-manager 改从 catalog 导入 | typecheck + 既有 store 测试 |
| S4 | 构建产物静态分析：entry/首屏 chunk 的 ort 引用检查（新增 `scripts/check-ort-firstscreen.mjs`，可复跑、非零退出码） | G-1 脚本 + 全量门禁 |
| S5 | 首屏传输实测对比 + modulepreload 核对 | G-2/G-5（measure-startup.mjs） |
| S6 | 闸门判定：达标→收尾记录；不达标→启动 Phase 2（本文档追加步骤） | 文档记录判定依据 |

## 9. 设计评审记录（评审通过后方可开发）

**评审日期**：2026-10-01（评审人：本轮执行者；逐项结论如下）

| # | 评审项 | 结论 |
|---|---|---|
| 1 | §2 静态依赖链与代码一致 | ✅ 逐边核实：chat.ts:32 → dual-channel-runtime:21 → vector-model-manager:19 → rag-benchmark:19 → onnx-embedding-provider:227（动态 ort） |
| 2 | "全仓唯一 ort 引用点"声明 | ✅ grep 核实：onnxruntime-web 仅 onnx-embedding-provider 一处动态引用，其余为注释/type-only |
| 3 | 静态链终点模块无 ort | ✅ embedding.ts（仅 i18n/stopword）、vector-model-install（fflate）、remote-api-key-state（零依赖） |
| 4 | catalog 拆分符号清单完整性 | ✅ 消费方仅两处：vector-model-manager:19（值导入）与 tests/core/rag-benchmark.test.ts（经 rag-benchmark 兼容导出即可）；兼容 re-export 三个符号即可 |
| 5 | 工厂懒加载时序 | ✅ defaultProviderFactory 本就 async，两处构造点统一走 `await import`，无同步调用方 |
| 6 | G-2 预期收益的依据 | ✅ 104KB(gzip) 来自 PERF_OPTIMIZATION 实测；最终以 S5 实测为准（修订②） |
| 7 | S4 检查脚本规格 | ⚠️ 原描述（"dist JS 文本 grep"）不严谨 → 修订① |
| 8 | 方案 A 备选完备性 | ✅ 通信协议/CSP/transferable/回滚四要点已固化；仅在闸门失败时细化 |

**评审修订**（已合入正文，评审通过，进入开发）：

- **修订①（S4 算法精确化）**：检查脚本采用**静态导入图 BFS**——解析 dist/assets/*.js 的静态 `import … from "./chunk"` 边（正则提取），从 index.html 的入口 JS 出发 BFS，断言**被访问集合**中无任何文件含 `ort.bundle.min` 引用；动态 `import()` 边不遍历。这比全局 grep 更精确：懒加载 chunk（VectorModelPanel 等）里出现 ort 是**预期内**的，不应误报。
- **修订②（G-2 表述）**：预期值改述为"首屏传输量下降，预期量级 ≈104KB(gzip)，以 5 轮取中位数实测为准"。
- **修订③（S2 补充）**：工厂两处构造点均通过同一动态 import，不做模块级缓存（构造成本相对模型加载可忽略，避免引入生命周期状态）。

**评审结论**：**通过**（按修订①②③执行 Phase 1）。

**开发期设计修订**（实施中发现新事实，按"每步记录"原则回写；均已验证）：

- **修订④（根因修正 + S2b 单一动态入口）**：S3 完成后构建实测（`check-ort-firstscreen` 首版）显示 ort 仍以**静态 from 边**出现在 settings / vector-model-storage / type-adapters 三个首屏可达 chunk——但这三个 chunk **不含** `InferenceSession`（未包含 provider 模块），其从 ort chunk 导入的唯一符号是 rolldown 的 **`__export` interop helper**（被放置进 ort chunk 的共享运行时辅助函数）。即：源码级依赖链切割后，**chunk 图层面仍存在"helper 共享"导致的 ort 首屏拉取**，单纯收敛动态入口（S2b：新增 `dual-channel-runtime.createOnnxEmbeddingProvider` 作为全仓唯一动态入口，rag-benchmark/VectorModelPanel 改经其构造）无法解决。
- **修订⑤（新增 S2c vendor 外置，替代方案 A 成为定案）**：既然 ort chunk 因 helper 共享被首屏拉取，则把 ort 从构建 chunk 图整体移除——`scripts/vendor-ort.mjs` 将 `onnxruntime-web` 的自包含 ESM（`ort.bundle.min.mjs` 396KB）与 `ort-wasm-simd-threaded.jsep.wasm` 复制到 `public/vendor/ort/`（wasm 与 mjs 同目录，ort 内部 `new URL(..., import.meta.url)` 相对解析自动命中）；provider 的 `resolveOrtModuleUrl()` 按环境解析：浏览器加载 `/vendor/ort/ort.bundle.min.mjs`（`@vite-ignore` 动态 import，rolldown 不生成 chunk），node/测试回退 npm 包（真实推理单测依赖 node 直跑）。vendor 文件不入库（`.gitignore: public/vendor/`），由 `postinstall` 钩子生成，`--check` 模式校验版本一致。**方案 A（Worker）不再需要**——B' 以约 1/10 的改动量达成同等目标（ort 离开主线程 chunk 图），Worker 的"不阻塞主线程"收益另立备忘。
- **修订⑥（check:ort 口径更新）**：G-1 判定改为三重断言——构建产物无 `ort.bundle.min*.js` chunk / 无 `ort-wasm*.wasm`；入口静态可达集合无 ort 字样；index.html 无 ort 引用。另校验 vendor 文件齐备。

## 10. 实施记录

| 步骤 | 内容 | 结果 |
|---|---|---|
| S1 | 新增 `src/core/rag-model-catalog.ts`（BEST_KEY + 择优三函数，纯 localStorage 零依赖） | ✅ |
| S2 | rag-benchmark：目录函数改经 catalog + `export {...} from './rag-model-catalog'` 兼容；工厂不再直接引用 provider | ✅ |
| S3 | vector-model-manager：`getBestEmbeddingModel` 改从 catalog 导入，静态链 `manager → rag-benchmark` 切断 | ✅ vue-tsc 0 错误 |
| S2b | 新增 `dual-channel-runtime.createOnnxEmbeddingProvider`（全仓唯一动态入口）；dual-channel / rag-benchmark / VectorModelPanel 三处统一走它 | ✅（实测证明单靠此步不足，见修订④） |
| S2c | vendor 外置：`scripts/vendor-ort.mjs`（--check 幂等）+ `resolveOrtModuleUrl()` 环境化加载 + `.gitignore public/vendor/` + `postinstall` 钩子 | ✅ 396KB mjs + 26.2MB jsep wasm |
| S4 | `scripts/check-ort-firstscreen.mjs`（修订⑥口径）+ `check:ort` 脚本 + 证据包新增 `ort-firstscreen` 门禁 | ✅ exit 0 |
| S5 | 首屏实测（vite preview + 5 轮取中位）：**首屏传输 551KB → 447KB（-104KB，与 ort gzip 体积吻合）**；ort 从首屏资源 Top10 消失；ready 266ms（持平）；modulepreload 无 ort | ✅ G-2/G-5 |
| S6 | 全量 vitest 142 文件通过（140 passed / 2 skipped 为 PG 环境门控）；`onnx-real-model` 7 项真实推理通过（node 回退路径验证）；eslint 0 | ✅ G-3/G-4 |

**闸门判定（S6）**：G-1 / G-2 / G-3 / G-5 全部达成——**Phase 2（方案 A Worker）不启动**，其"嵌入计算不阻塞主线程"收益另立后续排期备忘。

**最终门禁（真实 PG 下证据包全量复跑）**：**15 项中 11 passed / 0 failed / 4 skipped（均有理由）**——新增 `ort-firstscreen` 门禁 ✅；postgres-transaction（真实 PG 集成）✅；e2e 两项按 --full 约定 skipped（CI push 时执行）、migration-restore（无 pg_dump）、provider-regression（无 Key，已条件化）保持诚实 skipped。实施中的小回退与修复：vendor 压缩产物一度污染 lint（数千条表达式错误）→ `eslint.config.js` 增补 `public/vendor/**` 忽略后复跑通过。
