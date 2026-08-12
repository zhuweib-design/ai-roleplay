# E-00 嵌入优化形态决策文档

> 版本:v1.0(E-00 交付,评审通过即冻结 E-01~E-03 落点)
> 依据:《AI酒馆项目嵌入优化方案开发文档.md》v1.0 三层优化(L0 上下文结构 / L1 内容压缩 / L2 输出纪律)
> 决策问题:三层优化在本项目(Tauri 2 + Vue 3,纯前端架构,无服务端)中的实现形态

---

## 1. 候选形态

| 形态 | 说明 | 优势 | 劣势 |
|---|---|---|---|
| **A. 内置 TS(浏览器内实现)** | 三层逻辑全部用 TS 实现在 Web 运行时(IndexedDB/localStorage 存储),复用现有 core 层 | 保持"纯前端 + 离线"卖点;复用 `StorageAdapter`/`character-version-control`(修订/快照范式)/`prompt-builder` 挂载点;无部署;Web 与 Tauri 双环境一致 | 浏览器内大文本压缩受 JS 性能约束;情绪状态机/摘要若需 LLM 需调用现有 API 客户端(成本可接受) |
| **B. Node 服务端(独立进程)** | 新增 Node/FastAPI 服务承载压缩/CCR/前缀缓存 | 内存充裕;可服务端缓存 LLM 响应;前缀缓存命中天然 | 破坏"装完即用/离线"核心卖点;部署与运维成本;与 Tauri 架构割裂;需要网络通信与鉴权 |
| **C. Rust 侧(Tauri)** | 压缩/存储逻辑下沉 Rust 命令 | 性能最好;fs/网络已有 Rust 实现 | 跨语言成本高(TS↔Rust 序列化);Web 降级环境无法复用;迭代速度慢 |

## 2. 决策维度评估

| 维度 | A(内置 TS) | B(Node 服务端) | C(Rust) |
|---|---|---|---|
| 离线卖点(第一优先级) | ✅ 完全保持 | ❌ 依赖本地服务进程 | ✅ 保持 |
| 双环境一致(Web/Tauri) | ✅ 一致 | ⚠️ Web 需额外部署 | ❌ Web 无 |
| 与现有代码复用 | ✅ 高(StorageAdapter/version-control/prompt-builder) | ⚠️ 中(需新协议层) | ⚠️ 低 |
| 压缩性能预算(≤100ms/单次) | ✅ 提取式压缩(TextCrusher 思路:句切分+打分+重组)在 33 万词级 76ms 量级,本项目 10k 消息远低于此 | ✅ | ✅ |
| 实现与维护成本 | ✅ 最低 | ❌ 最高 | ⚠️ 中高 |
| 安全边界 | ⚠️ 与主进程同权限(但优化层只处理自有数据,无新攻击面) | ✅ 独立进程隔离 | ✅ |

## 3. 决策

**采用形态 A:内置 TS(浏览器内实现)。**

理由:
1. **离线与零部署是本项目第一卖点**(定位:现代工程 + 低门槛离线 + 创作深度),形态 B 直接削弱它;
2. **性能预算可达**:L1 压缩为纯规则提取式(无 LLM 参与时),浏览器 JS 在 10k 消息规模下满足 ≤100ms/单次;LLM 摘要(可选路径)复用现有 `ApiClient`,走流式/非流式均可;
3. **复用度最高**:L0 版本化记忆直接沿用 `character-version-control.ts` 的修订/快照范式;L0 前缀组装挂在 `prompt-builder.ts` 输出后;L1 压缩管线挂 `chat-manager.ts` 的 `buildPrompt` 调用之后、`apiClient.chatStream` 之前(对现有链路只增不减);
4. **架构一致**:Web 与 Tauri 双环境同一实现,无同步成本;
5. **风险可控**:所有优化路径默认关闭 + fail-open(校验失败回退原文),形态 A 的算力约束不构成正确性风险。

## 4. 落点映射(E-01~E-03)

| 任务 | 落点 | 复用/依赖 |
|---|---|---|
| E-01 L0 上下文结构层 | 新增 `src/core/memory-store.ts`(MemoryStore/CharacterRegistry/EmotionTracker) | 修订/快照范式:`character-version-control.ts`;存储:`storage` 层新增 `memory_facts` 类目(IndexedDB store + Tauri fs 命令) |
| E-02 L2 输出纪律层 | 新增 `src/core/output-discipline.ts`(classify_scope / 保护哨兵 / Auto-Clarity) | 纯函数,无依赖;测试集 `tests/core/output-discipline.test.ts` |
| E-03 L1 内容压缩层 | 新增 `src/core/compression.ts`(ExtractiveCompressor / SemanticValidator / CcrStore) | 挂载点:`chat-manager.ts` sendMessage 中 `buildPrompt` 之后;召回:`rag-retriever.ts` 的 BM25 打分逻辑可复用 |
| E-04 集成灰度验收 | `src/core/optimization-pipeline.ts`(开关/配置)+ `tests/core/optimization-pipeline.test.ts` | 指标框架复用《嵌入优化方案开发文档》1.2 表 |

## 5. 风险与缓解(决策相关)

| 风险 | 缓解 |
|---|---|
| 浏览器内大文本压缩卡顿 | 压缩限长(单次 ≤2 万字符,超长分批);移出请求热路径(异步执行,结果缓存) |
| LLM 摘要成本 | 摘要仅一次生成(temperature=0 + 内容哈希去重,复用 `inference-cache` 模式) |
| 前缀稳定与动态注入冲突 | standing(常驻)与 scoped(动态)分离,L0 前缀仅由 standing 组成,scoped 放动态段 |
| 存储结构变更迁移 | 新类目独立存储,旧数据零迁移;`legacy-migration.ts` 模式可扩展 |

## 6. 结论

三层优化全部以**纯 TS 模块**落地于 `src/core/`,挂在 `prompt-builder`/`chat-manager` 现有链路上,默认关闭、逐层灰度、fail-open。不引入服务端,不破坏离线卖点。**E-01~E-03 可按此落点开工。**
