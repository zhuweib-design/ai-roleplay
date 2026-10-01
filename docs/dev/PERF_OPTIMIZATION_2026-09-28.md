# 性能优化实施报告（2026-09-28）

**项目**: AI 酒馆 (ai-roleplay)
**依据材料**: `CODE_REVIEW_2026-09-28.md` / `OPTIMIZATION_DEMO.md` / `REVIEW_SUMMARY.md` / `QUICK_START.md` / `perf-report.md` / `scripts/perf-analysis.mjs` / `docs/dev/perf-baseline.json`
**原则**: 先实测核实再改动；只做低风险确定性收益项；每项改动跑门禁

---

## 一、材料梳理与核实结论（重要）

审查报告中的量化指标为**估算值**（无实测来源）。本次先建立实测基线，再对照报告结论。

| 报告主张 | 实测结果 | 结论 |
|---|---|---|
| 启动时间 3.2s → 1.8s（-44%） | 应用就绪（存储初始化全部完成）**367ms**；FCP 144ms | 报告估算严重偏离，真实启动已很快 |
| Store 初始化 950ms（串行 6 段累加） | 全链路（adapter init + 10 个 store + 设置 + 解锁检查）合计 **367ms** | 同上；950ms 系按虚构单项耗时累加 |
| 首屏包体积 850KB(gzip) → 520KB | 首屏传输 **929KB**（其中两张 hero JPEG 占 455KB） | 量级接近，但**构成**与报告判断不同 |
| artifacts/dist 多副本致仓库 500MB | 已于 2026-09-28 上午清理（14 个历史快照 + 27 个日志） | 已完成 |
| 24 处 console 未规范化 | 复核：**24 处 / 4 文件**（报告称 20 处 / 4 文件） | 基本属实 |
| chat.ts 2516 行、SettingsView 4131 行 | 2516 / 4131 行（含新增后 2519） | 属实 |

**实测新增的两处真实瓶颈（报告未提及）**：
1. 首屏两张 hero JPEG（912×1216）合计 **455KB，占首屏 49%**（仅作为演示角色头像使用）
2. `ort.bundle.min` **104KB(gzip) 出现在首屏**（与 2026-08-18「已退出首屏」的记录矛盾，属性能回退）

---

## 二、优化目标与优先级

| 优先级 | 优化项 | 依据 | 风险 |
|---|---|---|---|
| P0 | 并行化 store 初始化 | CODE_REVIEW §3 / QUICK_START §1 | 低 |
| P0 | profile 计算属性缓存 | CODE_REVIEW §2 / DEMO §3 | 低 |
| P0 | 首屏图片优化 | **本次实测** | 低（可回滚） |
| P1 | 统一日志服务 | CODE_REVIEW §5 | 低 |
| P1 | ort 首屏排除 | **本次实测** | 低（部分解决） |
| P2（后续） | chat.ts / SettingsView 拆分、类型重组、IDB 索引 | CODE_REVIEW §1/§4/§6/§10 | **高** |

---

## 三、实施的改动（5 项）

### 1. 并行化 store 初始化 — `src/App.vue`
**依据**：报告指出 onMounted 串行加载 6 个 store。核实后确认，且**函数体内零跨 store 引用**（逐个体检 `loadFromStorage`，仅含 i18n 与错误处理），可安全并行。
**改动**：
- `chatStore.loadLocalMemoryStore()` + `loadRuntimePendingGroupTurns()` → `Promise.all`（原 2 段串行）
- character / lorebook / group-chat / data-bank / story 的 `loadFromStorage()` → `Promise.all`（原 5 段串行）
- `settings.loadFromStorage()` **保持前置**（主题/字号需尽早应用，避免首屏样式闪烁）
- 每个 promise 保留独立 `.catch`，单个失败不影响其他

**实测收益**：ready 367ms → 336ms（-31ms，-8.4%）；空库场景收益有限，**数据量增大时收益放大**（串行累加 → 取最慢项）。

### 2. profile 计算属性缓存 — `src/App.vue`
**依据**：`resolveCharacterProfile()` 被 3 处调用，每次切换角色重新 `find`，且不参与响应式依赖追踪。
**改动**：改为 `computed(() => ...)`，3 处调用改为读取 `activeProfile.value`；`watch(() => currentCharacterId)` 替换为 `watch(activeProfile)`。
**收益**：① 消除重复查找（自动缓存）；② 附加正确性提升——**解锁后 / 编辑 profile 后**也会自动重算并重新注入（原实现仅监听角色切换，靠 `handleMasterPasswordSuccess` 单独兜底）。

### 3. 首屏图片优化 — `public/assets/hero-*.jpg`
**依据**：本次实测首屏资源 Top2（259KB + 196KB），均为 912×1216 的演示角色头像，实际显示尺寸远小于原图。
**改动**：384×512 + JPEG q85 + progressive（Pillow）；**原图已备份到 `G:\AI-data\.trash-aijiuguan-20260928-img\`**，可随时回滚。文件名与扩展名不变 → 零代码改动。
**实测收益**：453KB → 76KB（**-83%**），首屏传输 929KB → 551KB。

### 4. 统一日志服务 — 新增 `src/utils/logger.ts` + 24 处替换
**依据**：24 处 console 散落 4 个文件（App.vue / character-version / chat / community-market）。
**改动**：
- 新增零依赖 logger：分级（debug/info/warn/error）+ **生产环境仅 warn/error**（开发/测试全量）+ 统一 `[时间] [标签] 消息` 格式
- 24 处 `console.*` 全部迁移为 `logger.*`（0 残留）
- `scripts/i18n-scan.mjs` 同步扩展豁免：`logger.*` 行与 `console.*` 同等视为日志（非 UI 文案），避免门禁误报
- **不做**远程日志上报（涉及用户数据外发与隐私合规，需单独评估）

**收益**：生产环境消除调试噪音与非必要主线程开销；格式统一便于过滤定位。

### 5. ort 首屏排除（部分解决）— `vite.config.ts`
**依据**：实测 `ort.bundle.min` 104KB 进首屏；根因是 rolldown(vite 8) 将「被多处引用的动态导入」**提升为静态 import**——`settings` / `type-adapters` / `index` 等首屏 chunk 均出现 `import ... from "./ort.bundle.min-*.js"`。
**改动**：① 扩展 `build.modulePreload.resolveDependencies` 排除清单（ort / onnx-embedding-provider / vector-model-storage|install / rag-benchmark）→ index.html 的 modulepreload 从 13 个降至 10 个；② 抽离 `setRemoteApiKeyState` 到零依赖模块 `src/core/remote-api-key-state.ts`，切断 `settings → vector-model-manager → ort` 静态链（`vector-model-manager` 保留 re-export 兼容）。
**结果**：**未被完全解决**——`index` entry chunk 自身仍静态 import ort，ort 仍在首屏。彻底解法需将 onnxruntime 访问隔离到独立入口 / Web Worker，属架构级改动，已在 `vite.config.ts` 注释中记录。

---

## 四、实测效果对比

测量环境：生产构建（`vite preview`）+ Chromium 无头，每次 5 轮取中位数。

| 指标 | 优化前 | 优化后 | 变化 |
|---|---|---|---|
| 首屏传输量 | 929 KB | **551 KB** | **-378 KB (-40.7%)** |
| 应用就绪（存储初始化完成） | 367 ms | **336 ms** | -31 ms (-8.4%) |
| DOMContentLoaded | 113 ms | **95 ms** | -18 ms (-15.9%) |
| FCP | 144 ms | **124 ms** | -20 ms (-13.9%) |
| 首屏最大资源 | hero-cyber-nexus.jpg (259KB) | index.js (124KB) | 大图已移出关键路径 |
| 构建产物体积 | 55.90 MB | 55.54 MB | -374 KB (-0.7%) |
| 超大文件数（>2000 行） | 9 | 9 | 未变（架构拆分未做） |
| 源码总行数 | 91,723 | 91,820 | +97（新增 logger + 状态模块） |

> 注：首屏传输量的大幅下降（-40.7%）主要来自图片优化（-377KB）；本地 preview 无带宽限制，故时间指标改善小于字节指标——**真实网络下 378KB 的减少对弱网用户意义更大**。

---

## 五、验证方法（可复现）

```bash
# 1. 构建 + 启动生产预览
npm run build
npx vite preview --port 4173 --strictPort

# 2. 启动时延与首屏传输实测（含资源明细）
node scripts/measure-startup.mjs http://localhost:4173/ 5 --list

# 3. 构建产物体积对比基线
npm run perf:analyze
cat docs/dev/perf-report.md

# 4. 质量门禁
npm run typecheck && npm run lint && npm run i18n:check:strict && npm run test
```

新增工具：`scripts/measure-startup.mjs`（启动时延 + 首屏传输 + 资源 Top10）；
可观测性支撑：`App.vue` 初始化完成后置 `html[data-app-ready="1"]`（无 UI 副作用）。
顺带修复 `scripts/perf-analysis.mjs` 的 `formatBytes`/`formatDiff` 负值显示 `NaN undefined` 缺陷。

---

## 六、未实施项与原因（明确记录）

| 项 | 原因 |
|---|---|
| chat.ts 拆分（2516 行 → 5 个专职 store） | 60+ 导出被全仓引用，属**高风险架构重构**（报告自估 2-3 天）；需独立迭代 + 充分回归，不宜与 Quick Win 混做 |
| SettingsView 拆分（4131 行 → 10+ 子组件） | 同上（高工作量、高回归风险） |
| 类型定义重组（types/ 分文件） | 属代码质量项，性能收益低；大范围 import 调整收益/风险比不佳 |
| 魔法数字提取为 constants | 同上（LOW 优先级） |
| IndexedDB 复合索引 | 报告自称「推测」（未验证是否存在全表扫描）；应先做查询画像再决定 |
| 事件总线改 mitt | 需引入新依赖（与「不引入无关依赖」约束冲突），收益约 200 bytes |
| SVG 整合为 sprite / rollup-plugin-visualizer | 收益微小 / 会引入新 devDependency |
| ort 首屏彻底移除 | 需架构级方案（onnx 隔离到独立入口或 Worker），本轮已完成根因定位与部分缓解 |
