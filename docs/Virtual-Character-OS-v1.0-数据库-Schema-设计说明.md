# Virtual Character OS v1.0 数据库 Schema 设计说明

> **版本**：v1.0
> **定位**：可编码数据库设计 / PostgreSQL Reference Schema
> **对应规格**：《Virtual Character OS v1.0 技术规格（Context & Database Schema Revision）》
> **核心原则**：稳定人格与动态状态分离；原始对话永久保存；事件不可变；状态可投影；记忆可追溯；LLM 无直接核心状态写权限。

---

## 1. 设计目标

数据库需要同时支持：

- 多角色；
- 长期对话；
- 对话原文长期保存；
- Event / Emotion / Mood / Relationship / Attitude 的关联；
- 长期 Memory；
- 时间有效性；
- 情绪 Peak / Episode；
- 状态变化因果追踪；
- Context Retrieval；
- State Replay；
- 并发安全；
- 租户隔离；
- 角色快速创建；
- Cloud / Local LLM 解耦。

---

# 2. 数据分层

```text
┌─────────────────────────────────────────────┐
│ Character Definition                        │
│ characters / profiles / traits / values     │
│ beliefs / goals / archetypes                │
└───────────────────┬─────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ World / Social Model                        │
│ targets / preferences / attitudes           │
│ relationships / relationship_dimensions     │
└───────────────────┬─────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ Runtime State                               │
│ emotions / mood / current relationship      │
└───────────────────┬─────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ Conversation History                       │
│ conversations / sessions / turns / segments │
└───────────────────┬─────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ Causal History                              │
│ events / state_changes / episodes           │
└───────────────────┬─────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ Long-term Memory                            │
│ memories / memory_sources                   │
└───────────────────┬─────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ Runtime / Debug                             │
│ behavior_plans / snapshots / audit / context│
└─────────────────────────────────────────────┘
```

---

# 3. 最核心的关系

不要把系统理解成“角色表 + 聊天表”。

真正的主链是：

```text
Conversation Turn
      ↓
Event
      ↓
Appraisal
      ↓
State Change
      ↓
Current State
      ↓
Episode / Memory
      ↓
Context Retrieval
      ↓
Behavior Plan
      ↓
LLM
      ↓
Response / Action
      ↓
New Event
```

数据库负责保留这条链的证据。

---

# 4. 核心表一览

| 表 | 作用 | 数据性质 |
|---|---|---|
| `characters` | 角色主实体 | 稳定 |
| `character_profiles` | 身份、说话方式、边界 | 稳定 |
| `character_traits` | 人格特质 | 稳定/受控变化 |
| `character_values` | 核心价值 | 稳定 |
| `character_beliefs` | 信念 | 慢变化 |
| `character_goals` | 长期/当前目标 | 动态 |
| `archetypes` | 快速角色模板 | 稳定 |
| `targets` | 人、物、地点、概念等对象 | 世界实体 |
| `character_preferences` | 对对象的偏好 | 中长期 |
| `character_attitudes` | 对对象的态度 | 动态/中长期 |
| `character_relationships` | 与对象的关系 | 动态 |
| `relationship_dimensions` | Trust/Affection 等关系维度 | 动态 |
| `character_emotions` | 当前瞬时情绪 | 高频状态 |
| `character_mood` | 中期心境 | 中频状态 |
| `conversations` | 长期关系容器 | 历史 |
| `conversation_sessions` | 单次聊天 Session | 历史 |
| `conversation_turns` | 原始每轮消息 | **不可丢失** |
| `conversation_segments` | Turn 分段 | 历史压缩 |
| `context_summaries` | Segment 摘要 | 检索辅助 |
| `events` | 世界事件 | **Append-only** |
| `event_turn_links` | Event ↔ 原始 Turn | 因果追踪 |
| `state_changes` | Event 对状态的影响 | **Append-only** |
| `emotion_episodes` | 情绪连续段 | 历史 |
| `emotion_episode_events` | Episode ↔ Event | 因果关联 |
| `memories` | 长期记忆 | 可检索 |
| `memory_sources` | Memory 来源证据 | 因果关联 |
| `behavior_plans` | 当前行为计划 | 运行时 |
| `state_snapshots` | 状态快照 | Replay |
| `character_versions` | 人格定义版本 | 版本控制 |
| `state_audit_logs` | 状态操作审计 | 安全 |
| `context_builds` | 实际送入 LLM 的 Context | 可观测性 |
| `context_build_items` | Context 来源与排名 | 可观测性 |

---

# 5. 为什么必须保存 Raw Conversation

假设角色三个月后出现人格异常。

如果数据库只有摘要：

```text
“角色与 Alice 发生过争执。”
```

无法知道真实原因。

如果保留：

```text
Turn
 ↓
Event
 ↓
StateChange
 ↓
Memory
```

就可以回溯：

```text
角色为什么不再信任 Alice？
        ↓
StateChange
        ↓
Event
        ↓
Original Turns
```

所以：

> **Summary 是索引，不是原始记录的替代物。**

---

# 6. Conversation / Session / Turn 三层

## Conversation

表示角色和一个参与者之间的长期关系。

```text
Character Alice
      ↕
Conversation #01
      ↕
User
```

## Session

表示一次连续聊天。

```text
Conversation #01
├── Session A
├── Session B
└── Session C
```

## Turn

表示最小原始消息单元。

```text
Session A
├── Turn 1
├── Turn 2
├── Turn 3
└── ...
```

---

# 7. 为什么 Event 要独立于 Turn

Turn 是语言事实：

> “我昨天本来想向 Alice 表白，但最后没有说。”

Event 是世界/心理系统能够处理的结构：

```json
{
  "event_type": "romantic_intention",
  "target_id": "alice",
  "importance": 0.82,
  "payload": {
    "intention": "confess_love",
    "action": "did_not_confess",
    "reason": "fear_of_rejection"
  }
}
```

一个 Event 可以来自多个 Turn；一个 Turn 也可能支持多个 Event。

因此单独使用：

```text
`event_turn_links`
```

建立多对多关系。

---

# 8. State Change 是整套系统的“因果账本”

例：

```text
Event:
Alice 临时取消约会
```

产生：

```text
trust       -0.06
sadness     +0.22
anger       +0.12
```

这些变化进入：

```text
state_changes
```

保存：

```text
old_value
delta
new_value
event_id
reason
created_at
```

这样可以回答：

> “为什么当前 trust 只有 0.54？”

---

# 9. 当前状态与历史分离

例如：

```text
character_emotions
anger = 0.82
```

是当前投影。

而：

```text
state_changes
```

保存它怎么变成 0.82。

推荐：

```text
Events → Reducer → Current State Projection
```

而不是：

```text
只有 current_state，没有历史
```

---

# 10. Emotion Lazy Decay

不要每秒 UPDATE 数据库。

保存：

```text
intensity
baseline
half_life_seconds
updated_at
```

读取时计算：

\[
E(t)=E_0\cdot2^{-t/H}
\]

例如：

```text
anger = 0.8
half-life = 5 min
last_update = 13:00
```

15:00 读取时直接计算当前值，不需要从 13:00 到 15:00 写入 24 次或数千次数据库记录。

只有发生新事件并需要持久化时才更新数据库。

---

# 11. Attitude / Preference / Relationship 区分

## Preference

```text
喜欢咖啡
喜欢爵士乐
```

## Attitude

```text
对 Alice 有吸引力
对蛇有恐惧
对某个品牌有厌恶
```

## Relationship

```text
Alice = crush
trust = 0.54
affection = 0.87
```

三者可以互相影响，但不要合并为一个 `sentiment` 字段。

---

# 12. 时间有效性

涉及“过去喜欢、后来不喜欢”的事实，使用：

```text
occurred_at
valid_from
valid_until
```

例：

```text
Memory A
Alice 喜欢咖啡
valid: Jan → Jun

Memory B
Alice 已戒咖啡
valid: Jul → now
```

旧记录不删除。

---

# 13. Memory 的四种基础类型

```text
semantic
    事实

episodic
    经历

relational
    对人物/关系的长期判断

procedural
    行为习惯
```

Memory 必须支持 source linkage：

```text
Memory
 ↓
Event / Turn
```

从而避免“无来源记忆”。

---

# 14. 混合检索

推荐检索顺序：

```text
1. Character filter
2. Target filter
3. Time filter
4. Importance filter
5. Semantic similarity
6. Emotional salience
7. Relationship salience
```

示例：

```text
Query:
“今天又遇到 Alice 了。”

首先筛：
character = 当前角色

target = Alice

然后排序：
recency
semantic similarity
importance
emotional salience
relationship salience
```

向量检索只是其中一个排序信号，不应该成为唯一事实来源。

---

# 15. Context Builder

推荐最终给 LLM 的 Context：

```text
L1 Identity
L2 Current State
L3 Recent Turns
L4 Relevant Memories
L5 Relevant Events / Episodes
L6 Active Goals
L7 Behavior Plan
```

示例：

```text
[Identity]
慢热、重视承诺、不喜欢冲突。

[Relationship: Alice]
affection = 0.87
attraction = 0.93
trust = 0.54

[Current Emotion]
joy = 0.48
anticipation = 0.76
arousal = 0.61

[Recent Event]
Alice 昨晚临时取消见面。

[Relevant Memory]
过去还有两次类似经历。

[Recent Conversation]
...
```

这比把过去几个月的全部聊天直接塞进 Prompt 更稳定。

---

# 16. Context Debugger

建议记录每次真正送进 LLM 的 Context 构成：

```text
context_builds
        ↓
context_build_items
```

可显示：

```text
Source                 Score
--------------------------------
Identity               fixed
Alice Relationship     0.94
Memory #512            0.91
Event #814             0.89
Turn #5008             0.83
```

这对于调试：

> “为什么模型这一轮这么回答？”

非常重要。

---

# 17. State Authority

LLM 不应该直接改数据库。

错误架构：

```text
LLM → UPDATE database
```

正确架构：

```text
LLM
 ↓
Proposed Change
 ↓
Validator
 ↓
Policy Check
 ↓
Transaction
 ├── Event
 ├── StateChange
 └── Current State
```

---

# 18. 字段自动修改权限

推荐：

| Level | 属性 | 默认规则 |
|---|---|---|
| L0 | Attention / Emotion | 可自动变化 |
| L1 | Mood / Relationship | 可自动变化，但记录原因 |
| L2 | Preference / Belief | 需要证据累积 |
| L3 | Personality / Core Values | 默认禁止自动修改 |

---

# 19. 并发安全

所有高频状态记录都应有：

```text
version BIGINT
```

采用 optimistic locking：

```sql
UPDATE character_emotions
SET intensity = $new,
    version = version + 1
WHERE character_id = $character_id
  AND emotion_key = $emotion_key
  AND version = $old_version;
```

如果更新影响行数为 0：

```text
检测到并发修改
→ reload
→ recalculate
→ retry
```

---

# 20. 事务边界

一次用户消息产生的核心写操作建议处于一个事务：

```text
BEGIN

1. Write Turn
2. Create Event
3. Write State Changes
4. Update Current State
5. Update Relationship / Attitude
6. Create / update Episode
7. Write Memory candidates
8. Update conversation.last_activity_at

COMMIT
```

对于异步向量化、Embedding、摘要，可以在事务成功后异步处理；不要让向量服务故障阻塞核心状态提交。

---

# 21. Hot / Warm / Cold 数据

长期产品建议做冷热分层：

```text
HOT
当前 Emotion / Mood / Relationship
Redis / PostgreSQL

WARM
最近 Session / Recent Turns / Recent Events
PostgreSQL

COLD
历史 Turn / Archive
Object Storage + PostgreSQL metadata
```

但逻辑 ID 必须始终保留，不能因为冷热迁移而丢失关联。

---

# 22. PostgreSQL + pgvector

推荐：

```text
PostgreSQL
    +
pgvector
```

这样可以把结构化过滤与向量搜索放在同一个数据系统中。

向量建议只用于：

```text
Memory semantic similarity
Segment similarity
Context retrieval
```

不能把 vector 当作角色状态数据库。

---

# 23. 租户安全

生产环境建议：

```text
tenant_id
   ↓
PostgreSQL Row-Level Security
```

应用层同时要求：

```text
request tenant
        ↓
repository
        ↓
WHERE tenant_id = current_tenant
```

对于 Character 所属的数据，禁止只按 UUID 查询而不验证 tenant。

---

# 24. 数据保护原则

以下内容应区别权限：

```text
Public Profile
Private Profile
Secret Memory
System State
Model Context
Audit Log
```

特别是：

- 原始用户对话；
- 私密关系数据；
- 未经确认的 LLM 推断；
- 系统内部评估信息。

不应默认全部暴露给角色或最终用户。

---

# 25. 快速创建角色

使用：

```text
Archetype
+
Personality Delta
+
Seed Memories
+
Relationship Seeds
+
Goals
```

生成：

```text
Character
 ↓
Profile
 ↓
Traits
 ↓
Values
 ↓
Beliefs
 ↓
Goals
 ↓
Initial Preferences
 ↓
Initial Attitudes
 ↓
Initial Relationships
 ↓
Initial Memories
```

不要把“角色创建”设计成手工逐表填写。

---

# 26. 角色版本管理

角色的核心人格定义应该可版本化：

```text
Character v1
Character v2
Character v3
```

例如设计师修改：

```text
warmth 0.72 → 0.82
```

产生一个新版本，而不是悄悄覆盖历史。

运行时状态仍然单独管理。

---

# 27. 推荐开发顺序

## Phase A：基础数据

```text
characters
character_profiles
character_traits
character_values
character_beliefs
character_goals
```

## Phase B：对象和关系

```text
targets
character_preferences
character_attitudes
character_relationships
relationship_dimensions
```

## Phase C：对话与事件

```text
conversations
sessions
turns
events
event_turn_links
state_changes
```

## Phase D：状态

```text
character_emotions
character_mood
emotion_episodes
```

## Phase E：长期记忆

```text
memories
memory_sources
conversation_segments
context_summaries
```

## Phase F：Runtime / Debug

```text
behavior_plans
state_snapshots
character_versions
state_audit_logs
context_builds
context_build_items
```

---

# 28. 开发人员看到这份 Schema 后应该怎么理解

不要把它理解成：

> “我要开发一个很复杂的数据库。”

应该理解成：

> “我要维护一个角色的长期状态，并且每个重要状态都能回到发生它的事件和原始对话。”

最重要的四个实体是：

```text
Turn      = 说了什么
Event     = 发生了什么
State     = 角色现在怎样
Memory    = 长期记住什么
```

然后：

```text
Event → StateChange
Event → Memory
Turn → Event
Memory → Context
State → Behavior
```

这就是整个数据库的最小认知模型。

---

# 29. 最终推荐架构

```text
                         CHARACTER
                            │
         ┌──────────────────┼───────────────────┐
         ↓                  ↓                   ↓
      Identity          World Model        Relationship
         │                  │                   │
 Personality / Values   Target / Attitude   Trust / Affection
 Belief / Goal          Preference           Attraction
         │                  │                   │
         └──────────────────┼───────────────────┘
                            ↓
                       CURRENT STATE
                            │
                    Emotion / Mood
                            │
                            ↓
                       CONVERSATION
                            │
                         Raw Turns
                            │
                            ↓
                          EVENTS
                            │
                  ┌─────────┴─────────┐
                  ↓                   ↓
             State Changes        Episodes
                  │                   │
                  └─────────┬─────────┘
                            ↓
                          MEMORY
                            │
                            ↓
                       RETRIEVAL
                            │
                            ↓
                       CONTEXT BUILDER
                            │
                            ↓
                       BEHAVIOR PLAN
                            │
                            ↓
                           LLM
                            │
                            ↓
                         RESPONSE
                            │
                            └──────→ NEW EVENT
```

---

# 30. v1.0 验收标准

### 数据完整性

- [ ] Raw Turn 永久保存；
- [ ] Event 可追溯到一个或多个 Turn；
- [ ] StateChange 可追溯到 Event；
- [ ] Memory 可追溯到 Event / Turn；
- [ ] 当前状态可以从历史重建。

### 性格一致性

- [ ] Core Personality 不会被单轮模型输出覆盖；
- [ ] Personality 能参与 Appraisal；
- [ ] 不同角色对同一 Event 能产生不同 StateChange。

### 时间能力

- [ ] Emotion 支持 lazy decay；
- [ ] Mood 支持独立半衰期；
- [ ] Memory 支持 valid_from / valid_until；
- [ ] Episode 能记录 started / peak / recovered。

### Context

- [ ] Recent Turns 可直接读取；
- [ ] Relevant Memory 可检索；
- [ ] Relevant Event / Episode 可检索；
- [ ] Context Build 可审计；
- [ ] Context 不依赖完整历史 Prompt。

### 安全

- [ ] LLM 没有直接 SQL 权限；
- [ ] 核心状态更新经过 Validator；
- [ ] L3 Personality / Values 默认锁定；
- [ ] 状态支持 optimistic locking；
- [ ] 租户数据隔离。

---

# 31. 配套 SQL

同目录提供：

`Virtual-Character-OS-v1.0-database-schema.sql`

该脚本面向 PostgreSQL 15+，包含核心表、索引、更新时间触发器、历史不可变保护、状态快照以及可选 pgvector 说明。

生产部署前仍应由开发人员根据实际 PostgreSQL 版本、迁移框架、租户模型和备份策略进行 Review。

---

# 32. 后续建议

下一阶段不建议继续无限增加字段，而建议直接进入：

```text
1. Schema migration
2. Repository layer
3. State reducer
4. Event processor
5. Context Builder
6. Memory retrieval
7. Character Runtime API
8. Character Debugger
```

数据库一旦稳定，后续 Cloud / Local LLM 只是 Adapter 差异，角色数据模型不需要跟着模型供应商改变。

