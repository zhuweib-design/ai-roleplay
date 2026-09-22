# Virtual Character OS v1.0 实现基线

> 版本：v1.0 baseline
> 状态：已落地到 AI 酒馆工程，可通过单元测试验证
> 范围：数据库 Schema、Runtime Core、Emotion Engine、Character Compiler、运行时 API

## 1. 目标与边界

Virtual Character OS 位于 AI 酒馆现有 LLM 客户端之上，负责保存和演化角色的长期状态。它不替换现有 `src/api/*` 中的 OpenAI、Anthropic 或本地模型客户端，而是为这些客户端提供稳定的角色状态、上下文和行为输入。

本基线坚持以下边界：

- 原始对话、事件、状态变化和长期记忆分层保存。
- LLM 不直接写入人格、情绪、关系或记忆；LLM 只能通过上游协作者提出事件或状态变化建议。
- State Reducer 是确定性、可测试、可 Replay 的核心。
- Emotion 与 Mood 使用惰性半衰期衰减，不需要后台每秒更新。
- Salience 与 Liking、Trust、Affection 分离。
- Web/Tauri 单进程先复用现有 StorageAdapter；未来 PostgreSQL 只替换存储适配器。

## 2. 工程落点

```text
src/runtime/
├── types.ts                 领域类型与 API 契约
├── emotion-engine.ts        情绪衰减、情绪变更、Episode、Salience
├── character-compiler.ts    Archetype + Delta + Seed Memories 编译器
├── store.ts                 InMemory / StorageAdapter 快照存储
├── runtime-core.ts          Event → StateReducer → Projection 主链
├── runtime-api.ts           运行时 API 与请求路由适配器
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

当前前端适配使用现有 `StorageAdapter.saveSnapshot/loadSnapshot`，这是可工作的浏览器/Tauri 基线，不冒充 PostgreSQL 事务。服务端部署时应实现相同的 `RuntimeSnapshotStore` 接口，并使用数据库事务与乐观锁。

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
- PostgreSQL 实现必须将 `expectedVersion` 变成事务内的 `WHERE version = $expectedVersion` 条件，并保证事件、状态变化、投影、快照同事务提交。

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

## 8. 在 AI 酒馆中启用

```ts
import { createProjectRuntime } from '@/runtime';

const runtimeApi = createProjectRuntime();
```

该工厂会自动复用现有存储：

- Web：IndexedDB。
- Tauri：现有 Tauri 文件存储。
- 未来 PostgreSQL：替换 `RuntimeSnapshotStore`，不修改核心模块和 API 契约。

当前阶段不自动改动既有聊天发送链路，避免把尚未完成的 EventExtractor 和 BehaviorPlanner 强行接入生产对话。接入点已经稳定，后续可在聊天流完成后调用 `ingestEvent`，再调用 `buildContext`。

## 9. 验证门禁

本基线至少需要通过：

```text
npm run typecheck
npm test -- --run tests/runtime/runtime-core.test.ts
npm run build
```

专用测试覆盖：

- Archetype + Delta + Seed Memories 编译。
- 非法角色包拒绝。
- Emotion Lazy Half-Life Decay。
- Event → Emotion / Attitude / Relationship。
- Episode active → cooling → dormant → reopened。
- Salience 与喜欢、信任、亲密度解耦。
- API 健康检查、创建角色、事件接入、上下文构建。

## 10. 后续 PostgreSQL 实现要求

`RuntimeSnapshotStore` 是唯一替换边界。PostgreSQL 适配器必须：

1. 保留原始 Turn，不允许用摘要替代。
2. Event、StateChange、MemorySource 使用追加写入。
3. 使用角色级版本号或数据库行锁解决并发更新。
4. 在同一事务中提交 Event、StateChange、状态投影和 Snapshot。
5. 对 tenantId、characterId 做强制隔离。
6. 保持 API 409 版本冲突语义。

这部分属于服务端持久化工作，不应在浏览器前端伪装成“PostgreSQL 已接入”。
