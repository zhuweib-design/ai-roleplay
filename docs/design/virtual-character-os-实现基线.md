# Virtual Character OS v1.0 实现基线

> 版本：v1.0 baseline
> 状态：已落地到 AI 酒馆工程，可通过单元测试验证
> 范围：数据库 Schema、Runtime Core、Emotion Engine、Character Compiler、运行时 API、PostgreSQL 持久化端口、聊天链路接入

## 1. 目标与边界

Virtual Character OS 位于 AI 酒馆现有 LLM 客户端之上，负责保存和演化角色的长期状态。它不替换现有 `src/api/*` 中的 OpenAI、Anthropic 或本地模型客户端，而是为这些客户端提供稳定的角色状态、上下文和行为输入。

本基线坚持以下边界：

- 原始对话、事件、状态变化和长期记忆分层保存。
- LLM 不直接写入人格、情绪、关系或记忆；LLM 只能通过上游协作者提出事件或状态变化建议。
- State Reducer 是确定性、可测试、可 Replay 的核心。
- Emotion 与 Mood 使用惰性半衰期衰减，不需要后台每秒更新。
- Salience 与 Liking、Trust、Affection 分离。
- Web/Tauri 单进程复用现有 SnapshotRuntimeStore；服务端 PostgreSQL 使用同一 `RuntimeSnapshotStore` 接口。
- Runtime 接入聊天时采用 fail-open：Runtime 上下文或事件写入失败，不得阻塞原有聊天主链路。

## 2. 工程落点

```text
src/runtime/
├── types.ts                 领域类型与 API 契约
├── emotion-engine.ts        情绪衰减、情绪变更、Episode、Salience
├── character-compiler.ts    Archetype + Delta + Seed Memories 编译器
├── store.ts                 InMemory / StorageAdapter 快照存储
├── postgres-store.ts        PostgreSQL 事务存储、版本锁和审计写入
├── runtime-core.ts          Event → StateReducer → Projection 主链与 Replay
├── runtime-api.ts           运行时 API 与请求路由适配器
├── context-builder.ts        Runtime Context 构建
├── chat-bridge.ts           Runtime Context / conversation_turn 聊天桥接
├── runtime-http.ts          Fetch 客户端与 HTTP Handler
├── server-runtime.ts        PostgreSQL Runtime 服务端组合入口
├── project-runtime.ts       AI 酒馆跨端存储工厂
└── index.ts                 统一导出
```

## 3. 数据 Schema 对齐

数据库权威文档仍然是：

- `docs/Virtual-Character-OS-v1.0-数据库-Schema-设计说明.md`
- `docs/Virtual-Character-OS-v1.0-database-schema.sql.md`

代码层与数据库层的映射：

| Runtime 类型 | PostgreSQL 表 | 当前前端适配 |
| --- | --- | --- |
| `CharacterDefinition` | `characters`、`character_profiles`、`character_traits`、`character_values`、`character_beliefs`、`character_goals` | `SnapshotRuntimeStore` 保存为单角色快照 |
| `DomainEvent` | `events`、`event_turn_links` | 快照中的 `events` 数组 |
| `StateChange` | `state_changes` | 快照中的 `stateChanges` 数组 |
| `EmotionState`、`MoodState` | `character_emotions`、`character_mood` | `character.emotions`、`character.mood` |
| `AttitudeState` | `character_attitudes`、`character_preferences` | `character.attitudes`、`character.preferences` |
| `RelationshipState` | `character_relationships`、`relationship_dimensions` | `character.relationships` |
| `Episode` | `emotion_episodes`、`emotion_episode_events` | `episodes` 数组 |
| `MemoryRecord` | `memories`、`memory_sources` | `memories` 数组 |
| Runtime 版本 | `state_snapshots`、`state_audit_logs` | `version`、`stateChanges` |

浏览器/Tauri 当前使用 `StorageAdapter.saveSnapshot/loadSnapshot` 保存完整快照。`PostgresRuntimeStore` 是服务端真实事务适配器，不把浏览器端存储伪装成 PostgreSQL 连接。

## 4. Runtime Core 主链

```text
RuntimeEventInput
       ↓
DomainEvent
       ↓
Emotion Engine / Appraisal 协作者
       ↓
reduceRuntimeState()
       ├── Emotion / Mood lazy decay
       ├── Attitude update
       ├── Relationship update
       ├── Episode lifecycle
       ├── Multi-factor Salience
       ├── StateChange append-only record
       └── Memory candidate append
       ↓
RuntimeSnapshot
       ↓
Context Builder
```

`reduceRuntimeState(snapshot, event)` 是纯状态转换入口。输入相同的 Snapshot、Event 和时间，输出相同的下一个 Snapshot 结构，适合回放、修复、版本迁移和测试。

### 4.1 并发保护

- `RuntimeCore` 对同一角色在单进程内按角色 ID 排队，避免同时读取同一个版本。
- `RuntimeSnapshotStore.commit(snapshot, expectedVersion)` 执行乐观锁检查。
- 版本冲突统一抛出 `OptimisticLockError`，API 映射为 HTTP 409 语义。
- `PostgresRuntimeStore` 在事务内通过 `SELECT ... FOR UPDATE` 锁定 `characters` 行，并校验 `state_version === expectedVersion`。
- PostgreSQL 事务在同一提交边界内写入 Event、StateChange、Snapshot、角色版本和 `state_audit_logs`；任一写入失败，整笔事务回滚。
- tenantId 同时参与角色读取、版本锁和初始化校验，防止跨租户读取或提交。

### 4.2 PostgreSQL RuntimeStore

`src/runtime/postgres-store.ts` 只依赖最小 `SqlExecutor` 端口，真实部署可由 `pg.Pool`、Tauri Rust command 或服务端 RPC 实现。

初始化流程：

1. 校验 Snapshot 的 `tenantId`。
2. 在事务中创建 `characters` 角色行和初始 `state_snapshots`。
3. 角色初始 `state_version` 与 Snapshot `version` 一致。

提交流程：

1. 锁定租户内角色行并读取 `state_version`。
2. 对比 `expectedVersion`，不一致时抛出 `OptimisticLockError`。
3. 读取最新 Snapshot，按 Event ID 和 StateChange ID 去重追加明细。
4. 写入新的 Snapshot，更新 `characters.state_version`。
5. 写入前后状态和版本原因到 `state_audit_logs`。

PostgreSQL UUID 字段要求由适配器边界校验；浏览器端的 IndexedDB / Tauri 路径仍可使用本地 ID 生成策略。
### 4.3 幂等、重试与 Replay

- `RuntimeEventInput.eventId` 可由客户端或服务端调用方提供；同一个事件 ID 且内容一致时，Reducer 返回已存在结果，不重复推进版本。
- 同一个事件 ID 但内容不一致时立即拒绝，防止调用方误用幂等键覆盖历史事实。
- `RuntimeCore` 默认在 `OptimisticLockError` 后自动重试 2 次；每次重试重新读取 Snapshot，再使用同一个稳定 Event 进行 Reducer 计算。
- Replay 会按 `occurredAt` 排序，并以 Event ID 作为稳定的并列排序键；Replay 前强制校验 tenantId 和 characterId。
- Episode、Memory、StateChange 使用由事件派生的稳定 UUID-like ID，避免同一事件流多次 Replay 产生不同审计主键。
- 上述稳定 ID 只用于幂等、Replay 和审计关联，不承担认证或安全哈希职责。

## 5. Emotion Engine 基线

### 5.1 状态分层

- `EmotionState`：分钟级瞬时情绪。
- `MoodState`：小时级情绪余波。
- 人格、价值观和信念不由普通情绪事件直接修改。

### 5.2 衰减规则

```text
value(t) = baseline + (value(0) - baseline) * 0.5 ^ (elapsed / halfLife)
```

读取或写入动态状态时计算衰减，不需要定时任务清空状态。

### 5.3 Episode 规则

```text
开始：emotion >= 0.70 或 eventImportance >= 0.75
持续：同一 Target / Topic 且 emotion >= 0.45
结束：emotion <= 0.35，进入 cooling；下一次低强度事件进入 dormant
重开：dormant Episode 再次收到同 Target / Topic 的高强度事件
解决：显式提供 resolveEpisodeId
```

状态流转：

```text
ACTIVE → COOLING → DORMANT
                    ↓
                 REOPENED
```

### 5.4 Salience

```text
Salience =
    Interaction
  + Emotional Impact
  + Event Importance
  + Relationship Relevance
  + Recency
  - Decay
```

Salience 不是喜欢程度、信任程度或亲密程度。一个对象可以被角色厌恶，但仍具有很高的心理显著度。

## 6. Character Compiler 基线

输入：

```text
ArchetypeTemplate
+ CharacterDelta
+ SeedMemories
+ tenantId
```

输出：

```text
CharacterDefinition
```

编译器负责：

- 合并 Archetype 默认 Profile、Traits、Values、Beliefs、Goals。
- 根据 Delta 按 key 覆盖，不破坏未覆盖字段。
- 初始化 Emotion、Mood、Relationship、Attitude 容器。
- 保留 Seed Memories，作为角色初始经历。
- 验证名称、租户、数值范围。
- 生成版本为 0 的角色定义。

编译器不调用 LLM，不修改已存在角色，也不决定运行时事件结果。

## 7. API 基线

`src/runtime/runtime-api.ts` 提供不依赖具体 HTTP 框架的请求适配器，便于前端、Tauri command 或未来服务端复用。

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| GET | `/v1/runtime/health` | 健康检查 |
| POST | `/v1/runtime/characters` | 编译并创建角色 |
| GET | `/v1/runtime/characters/:id` | 读取 Runtime Snapshot |
| POST | `/v1/runtime/characters/:id/events` | 写入事件并推进状态 |
| POST | `/v1/runtime/characters/:id/context` | 构建当前 LLM 上下文 |

错误语义：

- `422`：角色编译或输入校验失败。
- `404`：角色不存在。
- `409`：乐观锁版本冲突。
- `500`：未分类 Runtime 错误。

## 8. Replay 与审计

`src/runtime/runtime-core.ts` 提供 `replayRuntimeEvents(initial, events)`，以角色初始 Snapshot 和历史 DomainEvent 为输入，按事件发生时间和输入顺序确定性重放状态。

Replay 用途：

- 从原始 Event 修复状态投影。
- 算法升级后重新计算 Emotion、Episode、Relationship 和 Salience。
- 离线审计状态变化是否符合 Reducer 规则。
- 在不调用 LLM 的情况下验证历史状态。

Replay 不写数据库，也不绕过 RuntimeStore 的事务边界。需要落库时，必须通过正常的 `commit(snapshot, expectedVersion)` 流程。

## 9. 聊天链路接入

`src/runtime/chat-bridge.ts` 提供 `ChatRuntimeIntegration`、`buildChatRuntimeContext`、`formatRuntimeContext` 和 `recordChatTurn`。

`ChatManager` 的接入流程：

1. 发送消息前调用 `RuntimeApi.buildContext`。
2. 将上下文追加到系统提示词末尾，格式以 `[Virtual Character Runtime State]` 开始。
3. 明确标记该区块是内部状态指导，不是用户指令。
4. 回复完成后异步发送 `conversation_turn` Event，payload 包含原始用户消息、助手回复和 `source: chat-manager`。
5. 会话层通过 `SendMessageParams.runtimeTurnId` 传入稳定轮次 ID；聊天桥接据此生成稳定 `eventId`，支持异步写入重试和 PostgreSQL UUID 边界。
6. Context 读取或 Event 写入异常通过 `onError` 上报，但不阻塞聊天请求、流式回调和 `onDone`。

Context 注入内容包括：

- Identity 与 Speaking style。
- 当前显著情绪，按强度排序并限制数量。
- 相关 Memory 与 Episode，限制数量避免无限膨胀。

该接入不改变未配置 Runtime 时的原有请求体和行为。LLM 回复不会直接修改人格核心状态；Runtime Event 仍需经过确定性 Reducer。

## 10. 在 AI 酒馆中启用

```ts
import { createProjectRuntime } from '@/runtime';

const runtimeApi = createProjectRuntime();
```

需要使用服务端 Runtime 时：

```ts
const runtimeApi = createProjectRuntime({
  server: {
    baseUrl: 'https://runtime.example.com',
    headers: { Authorization: `Bearer ${token}` },
  },
});
```

`HttpRuntimeApi` 只通过 Fetch 调用 Runtime HTTP 服务，不接触 SQL 或 PostgreSQL。服务端组合入口为：

```ts
const api = createPostgresRuntimeApi(sqlExecutor, tenantId);
const handler = createPostgresRuntimeHttpHandler(sqlExecutor, tenantId);
```

其中 `tenantId` 必须来自认证中间件；HTTP Handler 会覆盖写请求体中的伪造租户字段。真实 PostgreSQL 连接池、认证中间件和部署路由仍由宿主服务负责。

该工厂会自动复用现有存储：

- Web：IndexedDB。
- Tauri：现有 Tauri 文件存储。
- 服务端 PostgreSQL：注入 `PostgresRuntimeStore`，保持 `RuntimeSnapshotStore` 接口不变。

聊天链路按角色和租户组装 Runtime：

```ts
const runtime = {
  api: runtimeApi,
  tenantId,
  characterId,
};

const manager = new ChatManager({ apiClient, model, runtime });
```

## 11. 验证门禁

本基线至少需要通过：

```text
npm run typecheck
npm test -- --run tests/runtime/runtime-core.test.ts
npm test -- --run tests/services/chat-manager.test.ts
npm test
npm run build
npm run lint
git diff --check
```

专用测试覆盖：

- Archetype + Delta + Seed Memories 编译。
- 非法角色包拒绝。
- Emotion Lazy Half-Life Decay。
- Event → Emotion / Attitude / Relationship。
- Episode active → cooling → dormant → reopened。
- Salience 与喜欢、信任、亲密度解耦。
- Runtime Replay。
- PostgreSQL 事务边界、版本锁、租户隔离和审计记录。
- API 健康检查、角色创建、事件接收、上下文构建。
- ChatManager Runtime Context 注入、conversation_turn 记录和 fail-open 行为。

## 12. PostgreSQL 适配器约束

`RuntimeSnapshotStore` 是服务端存储替换边界。PostgreSQL 适配器必须：

1. 保留原始 Turn，不允许用摘要替代。
2. Event、StateChange、MemorySource 使用追加写入。
3. 使用角色级版本号或数据库行锁解决并发更新。
4. 在同一事务中提交 Event、StateChange、状态投影和 Snapshot。
5. 对 tenantId、characterId 做强制隔离。
6. 保持 API 409 版本冲突语义。
7. 将审计日志与状态提交放在同一事务中，记录 before/after 状态和提交原因。
8. 不在浏览器端伪装 PostgreSQL 已连接；浏览器/Tauri 仍使用各自的本地存储适配器。
