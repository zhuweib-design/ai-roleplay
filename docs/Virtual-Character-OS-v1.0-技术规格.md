# Virtual Character OS v1.0 技术规格

> **文档类型**：技术规格 / Architecture & Engineering Spec  
> **版本**：v1.0（Context & Database Schema Revision）  
> **状态**：可进入原型开发  
> **目标**：构建具有长期人格一致性、动态情绪、对象化态度、关系变化、长期记忆与时间衰减能力的虚拟角色运行时。  
> **模型策略**：默认不依赖“每个角色一个 LoRA”；优先使用统一 Base LLM + Character Runtime。

---

## 0. 本次讨论结论汇总

本次讨论从“LLM 是否支持情绪注入”逐步收敛到一个更大的问题：**如何让虚拟角色长期做出符合自己性格的行为，并随着事件、人物、关系和时间发生合理变化。**

核心结论如下：

1. **情绪可以注入 LLM，并影响输出**。最容易落地的是 Prompt/Structured State；本地模型还可以进一步使用 activation steering、LoRA 等方式，但不是第一阶段的必要条件。
2. **情绪不应该由 LLM 自己长期保存**。时间、衰减、峰值、历史和状态迁移应由外部 Character Runtime 管理。
3. **“人格”“情绪”“心境”“态度”“关系”“记忆”必须分层**。否则会出现“喜欢某物”和“暗恋某人”被当成同一个分数的问题。
4. **角色的独特性不应主要来自模型参数**。同一个 Base LLM 可以承载大量不同角色；角色差异主要来自 Character DNA、Attitude、Relationship、Memory、Goals、Appraisal 与 Behavior Policy。
5. **人格真正影响的是决策，而不仅是说话风格**。同一个事件，因为人格、价值观、敏感度和关系不同，应该产生不同的心理评价与行为策略。
6. **时间主要作用于动态状态**。Emotion 应快速衰减，Mood 较慢，Relationship 更慢，Preference/Belief 更慢，Personality/Values 最慢。
7. **长期态度不能简单“过时间归零”**。情绪可以恢复，而信任损失、背叛记忆、偏好转变等可以保留。
8. **态度应该对象化**。角色不是“喜欢=0.8”，而是“对某个目标对象的 liking/interest/trust/attraction/fear 等多维态度”。
9. **态度变化应由事件证据驱动**。喜欢可以因为反复负面经历转为讨厌；暗恋可以随着互动提升 affection、attraction、anticipation，同时伴随 nervousness 与 fear_of_rejection。
10. **最终系统应形成闭环**：Event → Perception → Appraisal → State Update → Behavior Plan → Response/Action → Outcome → Memory → Future Appraisal。
11. **LoRA 应成为优化项，而不是角色系统的基础设施**。只有在需要非常稳定、难以 Prompt 化的语言风格/特定能力时再考虑角色 LoRA。
12. **角色快速创建应采用 Archetype + Delta + Seed Memories + Character Compiler**，而不是手工填写大量参数。

---

# 1. 产品定义

## 1.1 一句话定义

**Virtual Character OS 是一个位于 LLM 之上的角色运行时，用于维护角色的稳定人格与动态心理状态，并将其转化为长期一致的行为与语言输出。**

## 1.2 解决的问题

传统“Persona Prompt”方案常见问题：

- 长对话后人格漂移；
- 角色今天喜欢某人，下一轮却像陌生人；
- 情绪每轮重新计算，缺少连续性；
- 角色不会因为经历改变对某人的信任；
- 角色无法区分“喜欢咖啡”“喜欢 Alice”“尊敬 Alice”“害怕 Alice”；
- 情绪会随时间自然恢复，但长期态度又需要保留；
- 角色数量增加后，逐角色训练 LoRA 成本迅速上升；
- LLM 把“角色是什么人”和“本轮该说什么”混为一谈。

## 1.3 v1.0 目标

v1.0 必须实现：

- 稳定人格档案；
- 多维价值观、信念、偏好和边界；
- 对象化 Attitude；
- 对象化 Relationship；
- Emotion + Mood；
- 时间衰减；
- Emotion Peak 与 Episode；
- Episodic/Semantic/Procedural/Relational Memory；
- Event → Appraisal → State Update；
- Behavior Planner；
- Character Compiler；
- Cloud LLM Adapter；
- Local LLM Adapter；
- 人格状态变更的权限与审计；
- 可观测性与一致性评估。

## 1.4 非目标

v1.0 不要求：

- 让模型拥有真实的人类意识或主观体验；
- 每个角色一个 LoRA；
- 完整模拟人类心理学；
- 完全自动学习人格，不需要任何人工配置；
- 直接控制所有闭源云模型的 hidden state；
- 用一次模型调用解决整个心理状态管理。

---

# 2. 核心设计原则

## 2.1 State ≠ Prompt

Prompt 是一次推理输入；Character State 是跨时间持久存在的运行时状态。

```text
Persistent Character State
        ↓
   State Engine
        ↓
Context Builder
        ↓
      LLM
```

不要让 LLM 成为事实上的数据库。

## 2.2 Personality ≠ Emotion

人格决定“我通常如何反应”；情绪决定“我现在处于什么状态”。

## 2.3 Attitude ≠ Emotion

“喜欢 Alice”是持续态度；“见到 Alice 时很开心”是当前情绪响应。

## 2.4 Relationship ≠ Attitude

Relationship 是关系维度；Attitude 是针对对象的主观评价集合。两者有重叠，但不应完全合并。

## 2.5 Memory ≠ State

“她昨天背叛过我”是记忆；“我现在信任她 0.18”是状态。

## 2.6 Time 应作用于可变化状态，而不是所有东西

不同变量拥有不同时间常数。

## 2.7 LLM 是认知/表达引擎，不是唯一的世界状态权威

关键状态更新必须经过 State Authority。

---

# 3. 总体架构

```text
                         ┌──────────────────────┐
                         │       Base LLM       │
                         └──────────┬───────────┘
                                    │
                      Cloud Adapter │ Local Adapter
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────┐
│                  Virtual Character Runtime               │
│                                                          │
│  ┌──────────────┐   ┌──────────────┐   ┌─────────────┐ │
│  │ Identity     │   │ World &      │   │ Relationship│ │
│  │ Engine       │   │ Attitude     │   │ Engine      │ │
│  └──────┬───────┘   └──────┬───────┘   └──────┬──────┘ │
│         │                  │                  │         │
│         └──────────────────┼──────────────────┘         │
│                            ▼                            │
│                    ┌───────────────┐                    │
│                    │ Appraisal     │                    │
│                    │ Engine        │                    │
│                    └──────┬────────┘                    │
│                           ▼                             │
│                    ┌───────────────┐                    │
│                    │ Emotion/Mood  │                    │
│                    │ Engine        │                    │
│                    └──────┬────────┘                    │
│                           ▼                             │
│                    ┌───────────────┐                    │
│                    │ Time Decay    │                    │
│                    │ Engine        │                    │
│                    └──────┬────────┘                    │
│                           ▼                             │
│                    ┌───────────────┐                    │
│                    │ Memory &      │                    │
│                    │ Episode Engine│                    │
│                    └──────┬────────┘                    │
│                           ▼                             │
│                    ┌───────────────┐                    │
│                    │ Behavior      │                    │
│                    │ Planner       │                    │
│                    └──────┬────────┘                    │
│                           ▼                             │
│                    Context Builder                      │
└───────────────────────────┬──────────────────────────────┘
                            ▼
                           LLM
                            ▼
                  Text / Voice / Action
                            │
                            ▼
                         Outcome
                            │
                            └────→ Event / Memory
```

---

# 4. 角色组成模型

角色由“稳定层 + 动态层”组成。

## 4.1 稳定层：Character DNA

```text
Identity
Traits
Values
Beliefs
Preferences
Boundaries
Goals
Speech Profile
Default Behavior Rules
```

稳定层不能因为单轮模型输出自动修改。

## 4.2 动态层：Character State

```text
Emotion
Mood
Arousal
Relationship State
Target Attitudes
Current Goals
Attention
Active Episodes
Recent Memory
```

动态层允许随事件变化。

## 4.3 三类时间尺度

### Instant

- Attention
- Emotion
- Arousal

### Medium

- Mood
- Relationship
- Active goals

### Long

- Preference
- Belief
- Personality
- Values

---

# 5. 核心数据模型

建议技术栈：

- API：TypeScript / Python；
- Runtime：TypeScript 或 Python；
- DB：PostgreSQL；
- Local-first MVP：SQLite；
- Vector Search：pgvector / Qdrant / 本地向量库；
- Cache：Redis（可选）；
- Model：任意支持 JSON/结构化输出的 LLM；
- Local inference：vLLM / llama.cpp / Transformers 等。

## 5.1 Character

```json
{
  "id": "char_alice",
  "version": 1,
  "name": "Alice",
  "archetype": "warm_companion",
  "identity": {
    "age": 24,
    "occupation": "photographer",
    "background": "..."
  },
  "personality": {},
  "values": {},
  "beliefs": [],
  "preferences": {},
  "boundaries": {},
  "goals": [],
  "speech_profile": {},
  "behavior_rules": {}
}
```

## 5.2 Personality

推荐第一版采用连续维度，而不是硬编码标签。

```json
{
  "warmth": 0.82,
  "assertiveness": 0.31,
  "curiosity": 0.88,
  "sensitivity": 0.73,
  "risk_tolerance": 0.22,
  "openness": 0.84,
  "patience": 0.68,
  "humor": 0.61,
  "independence": 0.76
}
```

所有数值默认归一化到 `[0,1]`。

## 5.3 Values

```json
{
  "honesty": 0.92,
  "loyalty": 0.81,
  "freedom": 0.86,
  "stability": 0.32,
  "achievement": 0.57,
  "kindness": 0.88
}
```

Values 的作用不是直接生成句子，而是参与 Appraisal 和 Decision。

## 5.4 Beliefs

```json
[
  {
    "id": "belief_001",
    "statement": "承诺应该被认真对待",
    "strength": 0.91,
    "source": "seed",
    "mutable": true
  }
]
```

## 5.5 Preferences

Preferences 面向抽象对象或类别。

```json
{
  "coffee": {
    "liking": 0.82,
    "interest": 0.74,
    "familiarity": 0.91
  },
  "jazz": {
    "liking": 0.91,
    "interest": 0.78
  }
}
```

## 5.6 Attitude

Attitude 必须绑定 Target。

```json
{
  "target_id": "alice",
  "target_type": "person",
  "liking": 0.84,
  "interest": 0.91,
  "respect": 0.76,
  "trust": 0.42,
  "fear": 0.12,
  "disgust": 0.01,
  "attraction": 0.94,
  "jealousy": 0.68,
  "aversion": 0.02,
  "salience": 0.87,
  "confidence": 0.79,
  "updated_at": "2026-09-22T00:00:00Z"
}
```

原则：

- 不同态度维度独立；
- 不能用一个 `sentiment` 代替全部关系；
- `confidence` 表示系统对该态度判断的证据强度；
- `salience` 表示该对象在角色心理中的显著程度。

## 5.7 Relationship

```json
{
  "target_id": "alice",
  "relationship_type": "crush",
  "familiarity": 0.72,
  "trust": 0.61,
  "affection": 0.83,
  "intimacy": 0.36,
  "dependence": 0.24,
  "attraction": 0.94,
  "jealousy": 0.67,
  "hope": 0.82,
  "anticipation": 0.88,
  "fear_of_rejection": 0.79,
  "status": "ongoing"
}
```

推荐状态类型：

```text
stranger
acquaintance
friend
close_friend
rival
enemy
mentor
family
crush
romantic_partner
ex_partner
professional
```

## 5.8 Emotion

瞬时状态：

```json
{
  "joy": 0.18,
  "sadness": 0.11,
  "anger": 0.32,
  "fear": 0.07,
  "surprise": 0.02,
  "disgust": 0.01,
  "anticipation": 0.44,
  "arousal": 0.36,
  "updated_at": "2026-09-22T00:00:00Z"
}
```

## 5.9 Mood

建议使用二维核心空间：

```json
{
  "valence": -0.12,
  "arousal": 0.35,
  "baseline_valence": 0.08,
  "baseline_arousal": 0.31
}
```

其中：

- `valence`: 正负情绪方向，推荐 `[-1,1]`；
- `arousal`: 唤醒程度，推荐 `[0,1]`。

## 5.10 Goals

```json
[
  {
    "id": "goal_career",
    "description": "成为职业摄影师",
    "priority": 0.91,
    "progress": 0.63,
    "deadline": null,
    "active": true
  }
]
```

目标参与行为决策，不能仅作为背景文本。

---

# 6. Target 模型与对象图

所有角色态度都指向 Target。

```text
Target
├── Person
├── Animal
├── Object
├── Food
├── Place
├── Activity
├── Concept
├── Organization
├── Event
└── Character
```

建议使用统一 ID：

```text
entity_id
entity_type
canonical_name
aliases
metadata
```

这样可以实现：

- 对人和物统一做态度检索；
- 关系图；
- 联想图；
- 记忆索引；
- 事件关联；
- 情绪触发。

---

# 7. Association Graph

角色对世界的理解不仅是表格，还需要关系边。

```text
Character
  │
  ├── loves → Alice
  ├── fears → failure
  ├── likes → coffee
  ├── hates → betrayal
  ├── remembers → Episode_123
  └── wants → Goal_01
```

跨对象联想：

```text
Cafe
  └── associated_with → Alice
                         └── associated_with → HappyMemory_12
```

当角色再次看到 Cafe，可触发：

```text
Cafe
 → Alice
 → past date
 → nostalgia
 → joy + longing
```

---

# 8. Event 系统

任何可能影响角色的事情统一转成 Event。

## 8.1 Event Schema

```json
{
  "id": "evt_123",
  "timestamp": "2026-09-22T13:05:10Z",
  "actor_id": "user_001",
  "target_id": "char_alice",
  "type": "promise_broken",
  "importance": 0.82,
  "intent": "negative",
  "context": {
    "conversation_id": "conv_01"
  },
  "evidence": [
    "用户明确表示昨天约定被取消"
  ]
}
```

## 8.2 事件生命周期

```text
Input
 ↓
Perception
 ↓
Event Extraction
 ↓
Appraisal
 ↓
State Update
 ↓
Behavior Planning
 ↓
Response / Action
 ↓
Outcome
 ↓
Memory Write
```

---

# 9. Appraisal Engine

这是系统中最重要的中间层之一。

同一个事件必须根据角色人格、价值观、关系和历史产生不同解释。

## 9.1 Appraisal 输入

```text
Event
Personality
Values
Beliefs
Attitude(Target)
Relationship(Target)
Goals
Memory
Current Mood
Current Context
```

## 9.2 Appraisal 输出

```json
{
  "importance": 0.82,
  "goal_relevance": 0.74,
  "value_violation": 0.91,
  "betrayal": 0.88,
  "threat": 0.42,
  "loss": 0.63,
  "social_significance": 0.91,
  "surprise": 0.38,
  "target_salience": 0.93
}
```

## 9.3 状态更新概念公式

```text
Impact =
  EventIntensity
  × PersonalitySensitivity
  × RelationshipRelevance
  × GoalRelevance
  × ValueViolation
```

然后：

```text
new_emotion = clamp(old_emotion + impact, 0, 1)
```

对于带方向的状态：

```text
new_trust = clamp(old_trust + delta, 0, 1)
```

---

# 10. 时间衰减系统

## 10.1 通用模型

推荐指数衰减：

\[
X(t)=X_0 \cdot 2^{-t/H}
\]

其中：

- `X0`：事件发生时状态；
- `t`：经过时间；
- `H`：半衰期。

## 10.2 默认半衰期

| 状态 | 默认半衰期 | 说明 |
|---|---:|---|
| Anger | 5 分钟 | 可按角色调整 |
| Surprise | 1 分钟 | 很快归零 |
| Fear | 10 分钟 | 重大事件可延长 |
| Joy | 15 分钟 | 正向高点保留短时间 |
| Sadness | 30 分钟 | 可形成 Mood |
| Arousal | 3 分钟 | 快速恢复 |
| Mood | 6 小时 | 中期状态 |
| Relationship | 1～7 天 | 不建议自动回到基线 |
| Preference | 30～180 天 | 主要由事件改变 |
| Belief | 90～365 天 | 需要较强证据 |
| Personality | 月～年 | v1.0 默认不自动变更 |

这些只是默认值，必须支持按角色/情绪/事件覆盖。

## 10.3 情绪恢复 ≠ 态度恢复

例如：

```text
背叛发生
anger      0.12 → 0.89
trust      0.76 → 0.18
affection  0.82 → 0.46
```

两小时以后：

```text
anger      0.89 → 0.14
trust      ≈ 0.18
affection  ≈ 0.46
```

结果：

> “我已经没那么生气了，但我不会再像以前一样信任她。”

这是 v1.0 必须支持的行为。

---

# 11. Emotion Peak 与 Episode

## 11.1 Peak

当任一 emotion 超过历史峰值或动态阈值时，创建 Peak：

```json
{
  "id": "peak_001",
  "emotion": "anger",
  "intensity": 0.91,
  "trigger_event_id": "evt_123",
  "started_at": "...",
  "peak_at": "...",
  "recovered_at": null
}
```

## 11.2 Episode

多个事件组成一个情绪事件段：

```json
{
  "id": "episode_001",
  "type": "conflict",
  "started_at": "...",
  "peak_at": "...",
  "recovered_at": "...",
  "peak_intensity": 0.91,
  "related_events": ["evt_1", "evt_2", "evt_3"],
  "resolution": "apology_received"
}
```

Episode 对长期记忆比单条消息更有价值。

---

# 12. Attitude Engine

## 12.1 目标

支持：

- 喜欢；
- 讨厌；
- 兴趣；
- 尊敬；
- 恐惧；
- 厌恶；
- 依恋；
- 吸引；
- 嫉妒；
- 不信任；
- 对对象的复杂混合态度。

## 12.2 事件改变态度

建议：

```text
ΔAttitude =
EventImpact
× PersonalitySensitivity
× TargetSalience
× EvidenceWeight
```

同时保存证据：

```json
{
  "target_id": "alice",
  "dimension": "trust",
  "delta": -0.21,
  "event_id": "evt_123",
  "weight": 0.83
}
```

## 12.3 爱 → 讨厌

必须通过足够证据发生，而不是单事件直接翻转：

```text
Positive Association
      ↓
Negative Event
      ↓
Repeated Evidence
      ↓
Appraisal
      ↓
Attitude Reassessment
      ↓
New Attitude
```

建议使用阈值：

```text
major_event_threshold = 0.85
repeated_event_count = 3
belief_update_threshold = 0.75
```

具体参数按角色配置。

---

# 13. Relationship Engine

## 13.1 多维关系

至少包含：

```text
familiarity
trust
affection
intimacy
respect
attraction
dependence
jealousy
hope
fear_of_rejection
conflict
```

## 13.2 Relationship ≠ 单一标签

例如：

```text
Alice:
affection = 0.91
respect = 0.76
trust = 0.42
fear_of_rejection = 0.71
```

可以自然生成：

- 喜欢 Alice；
- 又不完全信任 Alice；
- 很在意 Alice；
- 面对 Alice 时紧张。

---

# 14. “暗恋对象”行为模型

一个典型状态：

```text
attraction = 0.94
affection = 0.83
hope = 0.82
anticipation = 0.88
fear_of_rejection = 0.79
```

当 Target = Alice 出现时：

```text
Target Salience ↑
      ↓
Attention ↑
      ↓
Arousal ↑
      ↓
Anticipation ↑
      ↓
Joy ↑
      ↓
Fear of Rejection ↑
```

因此：

```text
对普通人：
正常、平稳、低唤醒

对 Alice：
紧张 + 开心 + 期待 + 过度关注
```

关键：**这是 Target-conditioned response，而不是全局 emotion。**

---

# 15. Memory Engine

建议至少四类记忆。

## 15.1 Semantic Memory

事实：

```text
用户是一名 UI 设计师。
Alice 喜欢摄影。
```

## 15.2 Episodic Memory

事件：

```text
2026-09-20
Alice 帮助角色解决问题。
```

## 15.3 Relational Memory

关系判断：

```text
“我觉得 Alice 值得信任。”
```

## 15.4 Procedural Memory

行为模式：

```text
用户生气时：
先倾听 → 再回应 → 不立即反驳。
```

## 15.5 Memory 不应该全部进入 Prompt

流程：

```text
All Memories
   ↓
Relevance Retrieval
   ↓
Target/Time/Event Filtering
   ↓
Top-K Evidence
   ↓
Context Builder
```

---

# 16. Behavior Planner

这是阻止“人格漂移”的关键组件。

不要直接：

```text
Conversation → LLM → Response
```

应改为：

```text
Conversation
   ↓
Appraisal
   ↓
Character State
   ↓
Behavior Planner
   ↓
Response Strategy
   ↓
LLM
```

## 16.1 Behavior Plan Schema

```json
{
  "goal": "表达失望，同时维护关系",
  "strategy": "gentle_confrontation",
  "assertiveness": 0.52,
  "warmth": 0.71,
  "directness": 0.61,
  "emotion_expression": {
    "anger": 0.42,
    "sadness": 0.38
  },
  "constraints": [
    "不辱骂",
    "不立即终止关系"
  ]
}
```

LLM 最终负责自然语言化。

---

# 17. Personality Consistency

## 17.1 Personality Anchor

每轮推理都重新注入最小必要的人格锚点：

```text
Stable Personality
+
Values
+
Relevant Beliefs
+
Target Relationship
+
Relevant Memory
+
Current Emotion/Mood
+
Behavior Plan
```

## 17.2 State Authority

所有永久/半永久状态必须由 Runtime 决定是否接受 LLM 提议。

```text
LLM proposes change
        ↓
State Validator
        ↓
Evidence / Threshold / Mutability Check
        ↓
Accept / Reject
        ↓
Write State
```

例如，LLM 不能因为输出了一句：

> “我最讨厌猫。”

就自动把：

```text
cats.liking = 0.91
```

改成：

```text
cats.liking = -0.9
```

除非存在足够事件证据，并且该属性允许发生变化。

---

# 18. Character Creation：快速创建角色

核心方法：

```text
Archetype
+
Personality Delta
+
Values
+
Preferences
+
Important People
+
Life Seeds
+
Goals
+
Fears/Secrets
      ↓
Character Compiler
      ↓
Character DNA
      ↓
Initial State
```

## 18.1 Archetype

示例：

```text
Warm Companion
Cold Strategist
Curious Explorer
Shy Artist
Charismatic Leader
Cynical Observer
Protective Guardian
Playful Trickster
```

## 18.2 Personality Delta

例如：

```json
{
  "base": "warm_companion",
  "overrides": {
    "curiosity": 0.95,
    "assertiveness": 0.52,
    "humor": 0.72
  }
}
```

## 18.3 Seed Memories

快速创建一个角色，只需提供：

```text
3～5 个关键人生事件
3 个重要人物
5 个强烈喜好
3 个厌恶
2 个恐惧
2 个长期目标
1 个秘密
1 个未完成愿望
```

然后让 Character Compiler 生成结构化角色数据。

---

# 19. Character Compiler

## 19.1 输入

自然语言 Character Brief：

```text
创建一个 24 岁、外冷内热、喜欢摄影、怕被抛弃、非常看重承诺的女孩。
她一直暗恋高中同学，但不敢表白。
```

## 19.2 输出

```text
Identity
Personality
Values
Beliefs
Preferences
Boundaries
Goals
Attitudes
Relationships
Emotional Profile
Behavior Rules
Speech Profile
Seed Memories
```

## 19.3 Compiler 必须做一致性检查

例如检测：

```text
assertiveness = 0.95
behavior_rule.conflict = "always avoid conflict"
```

发现潜在矛盾后要求：

```text
resolve_conflict:
- 以 personality 为准
- 或以 explicit user setting 为准
```

### Priority

```text
Explicit User Constraint
    > Core Values
    > Personality
    > Beliefs
    > Relationship
    > Current Mood
    > Emotion
    > Style
```

---

# 20. Prompt / Context Builder

建议不要发送整个 Character JSON。

## 20.1 Stable Context

```text
You are Alice.

Identity:
24-year-old photographer.

Personality:
Warm, sensitive, curious, cautious.

Core values:
Honesty and loyalty.

Behavior rules:
Do not escalate conflict immediately.
```

## 20.2 Dynamic Context

```text
Current state:
Mood valence: -0.31
Arousal: 0.72
Anger: 0.63
Sadness: 0.48

Relationship with current target:
Trust: 0.42
Affection: 0.83

Current behavior strategy:
Gentle confrontation.
```

## 20.3 Relevant Memory

仅加入当前问题相关的 3～10 条高价值记忆。

---

# 21. Cloud LLM Adapter

## 21.1 架构

```text
Character Runtime
      ↓
Context Builder
      ↓
Cloud Adapter
      ↓
LLM API
      ↓
Structured Output
      ↓
Runtime State Validator
```

## 21.2 优势

- 开发快；
- 模型质量高；
- 不需要 GPU 运维；
- 适合先验证 Character Runtime。

## 21.3 限制

- 通常无法直接修改 hidden state；
- 模型内部不可控；
- 具体 Structured Output、Tool Calling、语音/情绪表达能力依厂商 API 而定；
- 成本与延迟受 API 调用量影响。

## 21.4 推荐策略

v1.0 Cloud 模式：

```text
Emotion Prompt/Structured State
+
Behavior Plan
+
Memory Retrieval
+
LLM API
```

不依赖 LoRA。

---

# 22. Local LLM Adapter

## 22.1 架构

```text
Character Runtime
      ↓
Context Builder
      ↓
Local Adapter
      ↓
Inference Runtime
      ↓
Local LLM
      ↓
Optional Activation Steering
      ↓
Output
```

## 22.2 优势

- 可控制模型与推理栈；
- 可做 activation steering；
- 可做 dynamic adapter / LoRA；
- 可自定义 sampling；
- 数据可以完全留在本地/私有环境。

## 22.3 难点

- GPU/显存；
- 部署与监控；
- 模型量化；
- 并发；
- steering 稳定性；
- adapter 管理；
- 不同模型的 hidden-state 行为不一致。

## 22.4 v1.0 本地推荐

仍然先采用：

```text
Character Runtime
+
Structured Context
+
Local LLM
```

Activation Steering 放入 v1.1/v2.0 实验模块。

---

# 23. Cloud / Local 统一接口

定义统一 `LLMAdapter`：

```ts
export interface LLMAdapter {
  generate(request: GenerationRequest): Promise<GenerationResult>;
}

export interface GenerationRequest {
  system: string;
  context: CharacterContext;
  userMessage: string;
  outputSchema?: object;
  tools?: ToolDefinition[];
}

export interface GenerationResult {
  text: string;
  structured?: unknown;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
}
```

这样同一个 Character Runtime 可以切换：

```text
GPT / Claude / Gemini / Local Qwen / Llama / other
```

角色数据无需改变。

---

# 24. 推荐 API

## 24.1 Character

```http
POST   /v1/characters
GET    /v1/characters/:id
PATCH  /v1/characters/:id
POST   /v1/characters/compile
```

## 24.2 Runtime

```http
POST /v1/characters/:id/sessions
POST /v1/sessions/:sessionId/events
POST /v1/sessions/:sessionId/respond
GET  /v1/characters/:id/state
```

## 24.3 Emotion

```http
GET /v1/characters/:id/emotion
GET /v1/characters/:id/emotion/timeline
GET /v1/characters/:id/emotion/peaks
```

## 24.4 Relationship

```http
GET /v1/characters/:id/relationships
GET /v1/characters/:id/relationships/:targetId
PATCH /v1/characters/:id/relationships/:targetId
```

## 24.5 Memory

```http
POST /v1/characters/:id/memories
GET  /v1/characters/:id/memories/search
GET  /v1/characters/:id/episodes
```

---

# 25. 数据库建议

## 25.1 PostgreSQL 表

```text
characters
character_personality
character_values
character_beliefs
character_preferences
character_boundaries
character_goals
character_speech_profiles
character_behavior_rules
character_states
emotion_states
mood_states
attitudes
relationships
entities
entity_links
events
episodes
emotion_peaks
memories
memory_embeddings
state_changes
behavior_plans
sessions
messages
runtime_audit_logs
```

## 25.2 核心索引

```text
characters(id)
attitudes(character_id, target_id)
relationships(character_id, target_id)
events(character_id, timestamp)
memories(character_id, created_at)
memories(character_id, importance)
state_changes(character_id, timestamp)
```

向量检索：

```text
memory_embeddings(character_id, embedding)
```

---

# 26. State Update Engine

核心伪代码：

```ts
function updateCharacterState(
  character: Character,
  state: CharacterState,
  event: Event,
  now: Date
): CharacterState {
  const decayed = applyTimeDecay(state, now);

  const appraisal = appraise({
    character,
    state: decayed,
    event,
  });

  const nextEmotion = updateEmotion(
    decayed.emotion,
    appraisal
  );

  const nextMood = updateMood(
    decayed.mood,
    appraisal,
    nextEmotion
  );

  const nextRelationships = updateRelationships(
    decayed.relationships,
    appraisal,
    event
  );

  const nextAttitudes = updateAttitudes(
    decayed.attitudes,
    appraisal,
    event
  );

  return {
    ...decayed,
    emotion: nextEmotion,
    mood: nextMood,
    relationships: nextRelationships,
    attitudes: nextAttitudes,
    updatedAt: now,
  };
}
```

---

# 27. Time Decay Engine 伪代码

```ts
function decay(value: number, elapsedMs: number, halfLifeMs: number): number {
  const t = elapsedMs / halfLifeMs;
  return value * Math.pow(0.5, t);
}
```

对于带 baseline 的变量：

```ts
function decayToBaseline(
  value: number,
  baseline: number,
  elapsedMs: number,
  halfLifeMs: number
): number {
  const distance = value - baseline;
  return baseline + distance * Math.pow(0.5, elapsedMs / halfLifeMs);
}
```

Emotion 推荐使用 `baseline = 0`；Mood 推荐使用角色 baseline。

---

# 28. 状态变更权限

定义字段 Mutability：

```text
CORE_IMMUTABLE
SLOW_MUTABLE
EVENT_MUTABLE
FAST_MUTABLE
DERIVED
```

示例：

```text
Personality.warmth       CORE_IMMUTABLE
Values.loyalty            SLOW_MUTABLE
Beliefs.promise_importance SLOW_MUTABLE
Preference.coffee         EVENT_MUTABLE
Trust.alice               EVENT_MUTABLE
Emotion.anger             FAST_MUTABLE
Mood.valence              FAST_MUTABLE
Attention.alice           DERIVED
```

这样可以避免模型输出破坏角色身份。

---

# 29. Character Runtime 主循环

```ts
async function handleTurn(input: TurnInput) {
  const now = new Date();

  let state = await stateStore.get(input.characterId);
  state = applyTimeDecay(state, now);

  const event = await eventAnalyzer.extract(input.userMessage);

  const appraisal = await appraisalEngine.evaluate({
    character: input.character,
    state,
    event,
  });

  state = stateEngine.apply(state, appraisal, event, now);

  const memories = await memoryEngine.retrieve({
    characterId: input.characterId,
    event,
    state,
    limit: 8,
  });

  const behavior = await behaviorPlanner.plan({
    character: input.character,
    state,
    event,
    memories,
  });

  const context = contextBuilder.build({
    character: input.character,
    state,
    behavior,
    memories,
  });

  const result = await llmAdapter.generate({
    system: context.system,
    context,
    userMessage: input.userMessage,
  });

  const outcome = await outcomeAnalyzer.analyze(result);

  await memoryEngine.write({
    event,
    appraisal,
    behavior,
    outcome,
  });

  await stateStore.save(state);
  await auditLog.write({
    event,
    appraisal,
    behavior,
    outcome,
  });

  return result;
}
```

---

# 30. 例：用户失约

## 初始状态

```text
trust = 0.76
affection = 0.82
anger = 0.05
sadness = 0.07
```

## 事件

```text
User breaks promise.
```

## Appraisal

```text
value_violation = 0.91
importance = 0.82
relationship_relevance = 0.88
```

## 更新

```text
anger    +0.55
sadness  +0.42
trust    -0.58
affection -0.27
```

## Behavior Plan

```text
strategy = gentle_confrontation
warmth = 0.61
assertiveness = 0.52
```

## 2 小时后

Emotion decay：

```text
anger ↓
sadness ↓
```

Trust 保持低位。

因此角色可能恢复平静，但仍然改变对该人的态度。

---

# 31. 例：一直暗恋 Alice

角色状态：

```text
attraction = 0.94
affection = 0.83
hope = 0.82
fear_of_rejection = 0.79
```

普通人出现：

```text
arousal +0.02
attention +0.05
```

Alice 出现：

```text
arousal +0.31
anticipation +0.22
joy +0.18
fear +0.17
attention +0.41
```

于是输出层可以得到：

```text
speech_rate ↓
self_monitoring ↑
response_length ↑
politeness ↑
hesitation ↑
```

注意：这些是 Behavior Planner 的参数，不要求 LLM 自己猜。

---

# 32. 角色差异示例

同一事件：

> “用户取消今晚的见面。”

### Character A

```text
sensitivity = 0.85
independence = 0.25
attachment = 0.82
```

可能：

```text
sadness ↑↑
anxiety ↑
trust ↓
```

### Character B

```text
sensitivity = 0.30
independence = 0.88
attachment = 0.25
```

可能：

```text
annoyance ↑
anger ↑小幅
快速恢复
```

### Character C

即使人格接近 B，但历史上该用户已经连续失约 4 次：

```text
history amplification ↑
trust ↓↓↓
```

由此说明：

**人格 × 关系 × 历史 × 当前事件共同决定行为。**

---

# 33. 不使用 LoRA 的多角色方案

```text
                    Base LLM
                       │
        ┌──────────────┼──────────────┐
        ↓              ↓              ↓
      Alice           Bob           Carol
        │              │              │
  Character DNA   Character DNA  Character DNA
        │              │              │
  Runtime State   Runtime State  Runtime State
        │              │              │
  Memory Graph    Memory Graph   Memory Graph
```

理论上可以：

```text
1 个模型
+
N 个角色数据包
+
N 套状态
+
N 套记忆
```

角色数量增长不会线性增加模型训练成本。

---

# 34. LoRA 应该放在哪里

建议：

```text
v1.0
Base LLM
+
Character Runtime
```

```text
v1.1
Base LLM
+
Character Runtime
+
Few-shot Style
```

```text
v2.0
Base LLM
+
Character Runtime
+
Optional Character LoRA
+
Optional Emotion Steering
```

LoRA 主要解决：

- 特殊写作风格；
- 固定角色口头禅；
- 高一致性的视觉/语言输出；
- 特定任务能力。

LoRA 不应负责：

- 时间衰减；
- 关系变化；
- 情绪历史；
- 事件记忆；
- 信任值；
- 长期偏好数据库。

---

# 35. 可观测性

每次角色行为都应该产生 Audit Record：

```json
{
  "turn_id": "turn_001",
  "event": {},
  "appraisal": {},
  "state_before": {},
  "state_after": {},
  "memory_retrieved": [],
  "behavior_plan": {},
  "model": "...",
  "response": "..."
}
```

这样出现“为什么角色突然讨厌 Alice”时，可以回溯整个因果链。

---

# 36. 一致性评估体系

v1.0 建议建立自动评测：

## 36.1 Personality Consistency

同一人格在 100～1000 轮对话后是否仍保持核心特质。

## 36.2 Relationship Consistency

角色是否根据不同 Target 表现出不同反应。

## 36.3 Temporal Consistency

情绪是否符合半衰期衰减。

## 36.4 Causal Consistency

状态变化是否有事件证据。

## 36.5 Memory Consistency

角色是否记住关键事件，并能正确引用。

## 36.6 Emotional Consistency

情绪强度是否符合事件严重程度、人格敏感度与关系重要程度。

---

# 37. MVP 开发范围

推荐分 4 个阶段。

## Phase 1：Core Runtime

实现：

```text
Character DNA
State Store
Emotion
Mood
Time Decay
LLM Adapter
```

目标：角色能“有连续情绪”。

## Phase 2：World & Relationship

实现：

```text
Target
Attitude
Relationship
Appraisal
```

目标：角色能“对不同人/事物产生不同态度”。

## Phase 3：Memory & Behavior

实现：

```text
Event
Episode
Memory
Behavior Planner
```

目标：角色能“因为过去经历而改变现在行为”。

## Phase 4：Character Compiler

实现：

```text
Archetype
Seed Brief
Personality Delta
Compiler
Consistency Check
```

目标：可以快速批量创建角色。

---

# 38. v1.0 验收标准

## A. 情绪

- [ ] 可保存当前 Emotion；
- [ ] 可按时间自动衰减；
- [ ] 可记录 Peak；
- [ ] 可识别 Episode；
- [ ] 不同情绪拥有独立半衰期。

## B. 人格

- [ ] Core Personality 可以长期固定；
- [ ] Personality 不会被单轮模型输出覆盖；
- [ ] Personality 可以参与 Appraisal；
- [ ] 不同角色面对同一事件可以产生不同反应。

## C. 态度

- [ ] Attitude 必须绑定 Target；
- [ ] 支持喜欢/讨厌/尊敬/害怕/兴趣/吸引等维度；
- [ ] 态度变化必须能够追溯到 Event；
- [ ] 支持长期正负态度转变。

## D. 关系

- [ ] 不同人物拥有独立 Relationship State；
- [ ] 支持 Trust/Affection/Attraction 等多维值；
- [ ] 支持对象条件化 Emotion。

## E. 记忆

- [ ] 支持 Semantic/Episodic/Relational/Procedural Memory；
- [ ] 可检索与当前事件相关记忆；
- [ ] 关键事件能影响后续行为。

## F. 多模型

- [ ] Cloud Adapter 与 Local Adapter 使用统一接口；
- [ ] 角色数据与模型供应商解耦；
- [ ] 无需每个角色单独训练模型。

## G. 角色创建

- [ ] Archetype 可复用；
- [ ] Delta 可覆盖基础人格；
- [ ] Seed Brief 可编译成完整角色；
- [ ] Compiler 能输出结构化 Character Package。

---

# 39. v1.1 / v2.0 规划

## v1.1

- 自动关系图；
- 联想激活；
- 更细粒度 Mood；
- 角色自我反思；
- Memory Consolidation；
- Persona Drift Detector；
- Character Debugger。

## v2.0

- 本地模型 Activation Steering；
- Emotion Vector；
- Dynamic LoRA；
- 多模态情绪：语音/表情/动画；
- 长期人格成长；
- 多角色社会关系模拟；
- 世界状态与角色心理状态联动。

---

# 40. 推荐目录结构

```text
virtual-character-os/
├── apps/
│   ├── api/
│   └── studio/
│
├── packages/
│   ├── character-core/
│   ├── emotion-engine/
│   ├── attitude-engine/
│   ├── relationship-engine/
│   ├── appraisal-engine/
│   ├── memory-engine/
│   ├── behavior-planner/
│   ├── character-compiler/
│   ├── context-builder/
│   ├── llm-adapter/
│   └── evaluation/
│
├── schemas/
│   ├── character.schema.json
│   ├── state.schema.json
│   ├── event.schema.json
│   ├── relationship.schema.json
│   ├── attitude.schema.json
│   └── memory.schema.json
│
├── migrations/
├── prompts/
├── archetypes/
├── tests/
│   ├── personality/
│   ├── emotion/
│   ├── attitude/
│   ├── relationship/
│   ├── memory/
│   └── integration/
└── docs/
    └── Virtual-Character-OS-v1.0.md
```

---

# 41. 最终架构原则

Virtual Character OS v1.0 的核心不是：

> “让 LLM 学会扮演一个人。”

而是：

> **让 LLM 成为一个已经拥有身份、价值观、态度、关系、记忆、情绪与历史的角色的认知和表达引擎。**

完整闭环：

```text
             ┌───────────────────────────┐
             │     Stable Identity       │
             │ Personality / Values      │
             │ Beliefs / Boundaries      │
             └─────────────┬─────────────┘
                           │
                           ▼
             ┌───────────────────────────┐
             │  World / Attitude /       │
             │  Relationship             │
             └─────────────┬─────────────┘
                           │
                           ▼
             ┌───────────────────────────┐
             │ Event + Appraisal          │
             └─────────────┬─────────────┘
                           │
                           ▼
             ┌───────────────────────────┐
             │ Emotion / Mood / Goals     │
             │ Time Decay                 │
             └─────────────┬─────────────┘
                           │
                           ▼
             ┌───────────────────────────┐
             │ Memory / Episodes          │
             └─────────────┬─────────────┘
                           │
                           ▼
             ┌───────────────────────────┐
             │ Behavior Planner           │
             └─────────────┬─────────────┘
                           │
                           ▼
                        LLM
                           │
                           ▼
                    Response / Action
                           │
                           ▼
                         Outcome
                           │
                           └──────→ Memory / State
```

**最终目标：角色不是“每轮重新扮演自己”，而是在持续经历中不断沿着自己的性格、关系、记忆与状态轨迹行动。**

---

# 42. v1.0 开发优先级

P0：

```text
Character Schema
State Store
Event
Appraisal
Emotion
Time Decay
Relationship
LLM Adapter
```

P1：

```text
Attitude
Memory
Episode
Behavior Planner
Character Compiler
```

P2：

```text
Association Graph
Reflection
Persona Drift Detector
Activation Steering
Dynamic LoRA
Multimodal Emotion
```

---

# 43. 一句话工程策略

**先用统一 Base LLM + 外部 Character Runtime 做出稳定的“人格与行为闭环”，再逐步增加 Memory、关系、联想和本地 Activation Steering；LoRA 永远是可选增强，而不是角色系统的基础。**

---

# 44. 研究依据与资料索引（Research Basis & References）

> **目的**：记录 v1.0 技术规格所参考的公开研究、官方文档与工程资料，并区分“研究依据”“工程推导”“待验证假设”。
>
> **重要说明**：本章节不是说下列论文提出了完整的 Virtual Character OS。v1.0 是在相关研究结果、工程约束和本次产品讨论基础上形成的系统化架构；其中部分模块属于工程综合与设计推导，仍需要通过原型和评测验证。

## 44.1 研究依据分类

| 类型 | 含义 | v1.0 处理方式 |
|---|---|---|
| 研究依据 | 文献明确研究或验证过的能力/现象 | 可作为设计依据，但仍关注模型与任务差异 |
| 工程推导 | 根据多份资料与实际产品约束形成的架构决策 | 进入 v1.0，但必须有单元测试/集成测试 |
| 待验证假设 | 当前合理但尚无充分证据支持的具体工程参数 | 必须通过实验校准，不应视为科学常数 |

## 44.2 核心学术研究

### [R1] Dynamic Persona Coherence

**Yirui Qi, Xiaoming Zhang, Ruilin Zeng, Mengyao Liu, Ziyi Zhou, Dezhuang Miao, Bingyu Yan, Zhenyu Guan. 2026. “Beyond Static Persona Consistency: Dynamic Persona Coherence in LLM Role-Playing.” Proceedings of ACL 2026 (Volume 1: Long Papers), pp. 28942–28956. DOI: 10.18653/v1/2026.acl-long.1336.**

链接：<https://aclanthology.org/2026.acl-long.1336/>

**与 v1.0 的关系**：

- 支持将稳定身份与动态心理变化解耦；
- 支持长期人格（Identity）、中期状态与短期 affect 分层；
- 支持把 Persona Drift 作为需要检测和修复的工程问题；
- 为 `Identity / Mood / Emotion / Persona Drift Detector` 提供直接研究依据。

**归类**：研究依据。

### [R2] PersonaForge

**Jizhou Tong, Sirui Zou. 2026. “PersonaForge: Psychology-Grounded Dual-Process Architecture for Personality-Consistent Role-Playing Agents.” Findings of ACL 2026.**

链接：<https://aclanthology.org/2026.findings-acl.386/>

**与 v1.0 的关系**：

- 支持使用心理学维度而不是只依赖自然语言人物描述；
- 为 `Personality Traits / Values / Beliefs / Behavior` 结构化提供依据；
- 支持高维人格约束需要独立认知/决策过程进行整合的思路。

**归类**：研究依据。

### [R3] PersonaAgent

**Weizhi Zhang, Xinyang Zhang, Chenwei Zhang, Liangwei Yang, Jingbo Shang, Zhepei Wei, Henry Peng Zou, Zijie Huang, Zhengyang Wang, Yifan Gao, Xiaoman Pan, Lian Xiong, Jingguo Liu, Philip S. Yu, Xian Li. 2026. “PersonaAgent: Bridging Memory and Action for Personalized LLM Agents.” Findings of ACL 2026.**

链接：<https://aclanthology.org/2026.findings-acl.1315/>

**与 v1.0 的关系**：

- 支持 Persona 与长期 Memory 结合；
- 支持 Episodic / Semantic Memory 的角色个性化；
- 支持“记忆影响行为，行为结果继续沉淀记忆”的闭环。

**归类**：研究依据。

### [R4] Sentipolis

**Chiyuan Fu, Lyuhao Chen, Yunze Xiao, Weihao Xuan, Carlos Busso, Mona T. Diab. 2026. “Sentipolis: Emotion-Aware Agents for Social Simulations.” Findings of ACL 2026, pp. 7465–7494. DOI: 10.18653/v1/2026.findings-acl.368.**

链接：<https://aclanthology.org/2026.findings-acl.368/>

**与 v1.0 的关系**：

- 支持连续情绪表示；
- 支持 PAD（Pleasure–Arousal–Dominance）空间；
- 支持双速度情绪动力学；
- 支持情绪与记忆耦合；
- 支持长期社会交互中的关系变化与情绪连续性。

**归类**：研究依据。

### [R5] Temporal Semantic Memory

**Miao Su, Yucan Guo, Zhongni Hou, Long Bai, Zixuan Li, Yufei Zhang, Guojun Yin, Wei Lin, Xiaolong Jin, Jiafeng Guo, Xueqi Cheng. 2026. “Beyond Dialogue Time: Temporal Semantic Memory for Personalized LLM Agents.” Findings of ACL 2026.**

链接：<https://aclanthology.org/2026.findings-acl.1496/>

**与 v1.0 的关系**：

- 支持按真实发生时间组织记忆，而不是只按聊天时间；
- 支持 durative memory（持续状态）而不只是 point-wise memory；
- 为 `Event.start / end / duration`、时间有效性与时间检索提供依据。

**归类**：研究依据。

### [R6] Chronos

**Sahil Sen, Elias Lumer, Anmol Gulati, Vamse Kumar Subbiah. 2026. “Chronos: Temporal-Aware Conversational Agents with Structured Event Retrieval for Long-Term Memory.” arXiv:2603.16862.**

链接：<https://arxiv.org/abs/2603.16862>

**与 v1.0 的关系**：

- 支持将对话拆分为带时间范围的结构化事件；
- 支持 event calendar / turn calendar；
- 为 `Event Store / Temporal Retrieval / Episode Timeline` 提供工程方向。

**归类**：研究依据 + 工程参考。

### [R7] Persona Vectors

**Runjin Chen, Andy Arditi, Henry Sleight, Owain Evans, Jack Lindsey. 2025. “Persona Vectors: Monitoring and Controlling Character Traits in Language Models.” arXiv:2507.21509.**

链接：<https://arxiv.org/abs/2507.21509>

**与 v1.0 的关系**：

- 研究模型激活空间中的人格方向；
- 支持人格状态监测与 steering 的可行性；
- 为 v2.0 `Activation Steering / Persona Drift Detection` 提供依据。

**归类**：研究依据；v1.0 仅把它作为可选研究方向，不依赖其实现。

### [R8] Emotion Concepts in a Large Language Model

**Nicholas Sofroniew et al. 2026. “Emotion Concepts and their Function in a Large Language Model.”**

链接：<https://arxiv.org/abs/2604.07729>

**与 v1.0 的关系**：

- 报告 Claude Sonnet 4.5 内部存在可泛化的 emotion concept representations；
- 报告这些内部表示可因果影响模型输出、偏好及部分行为；
- 同时强调 functional emotion 不等同于人的主观情绪体验。

**归类**：研究依据；对 v1.0 的直接工程结论是“不要把模型内部情绪表示等同于角色长期情绪状态”。

### [R9] Psychological Steering / PsySET

**Amin Banayeeanzade et al. 2026. “Psychological Steering in LLMs: An Evaluation of Effectiveness and Trustworthiness.” Proceedings of ACL 2026 (Volume 1: Long Papers), pp. 1719–1771. DOI: 10.18653/v1/2026.acl-long.79.**

链接：<https://aclanthology.org/2026.acl-long.79/>

**与 v1.0 的关系**：

- 对 prompting、fine-tuning、representation engineering 三类 steering 进行比较；
- 指出 prompting 通常有效但强度控制有限；
- 指出 vector injection 可提高控制精细度，但可能带来输出质量与安全/行为方面的副作用。

**归类**：研究依据；为 v1.0 不把 activation steering 当作必选核心提供依据。

### [R10] Emotion Vectors in Open-Source LLMs

**Sinie van der Ben, Raphaël Baur, Yannick Metz, Mennatallah El-Assady. 2026. “Where Do Models Find Happiness? Emotion Vectors in Open-Source LLMs.” arXiv:2606.26987.**

链接：<https://arxiv.org/abs/2606.26987>

**与 v1.0 的关系**：

- 在开放权重模型 Apertus-8B-Instruct-2509 与 Gemma-4-E4B-it 上研究情绪向量；
- 为本地模型 emotion vector / activation steering 的可迁移性研究提供参考。

**归类**：研究依据；属于 v2.0 方向。

## 44.3 官方平台与工程文档

### [P1] OpenAI Realtime API

**OpenAI API Reference — Realtime API.**

链接：<https://platform.openai.com/docs/api-reference/realtime>

**与 v1.0 的关系**：

- 官方 API 支持通过 `instructions` 引导响应内容、格式和音频表现；
- 官方示例包含“inject emotion into your voice”等情绪化声音指导；
- 但官方文档也明确说明 instructions 只是行为指导，并不保证模型一定遵循。

**归类**：官方工程依据。

### [P2] OpenAI Structured Outputs

**OpenAI API Reference — Structured Outputs / `json_schema`.**

链接：<https://platform.openai.com/docs/>

**与 v1.0 的关系**：

- 用于将 Event / Appraisal / Behavior Plan 等中间结果限制为结构化 Schema；
- 支持 `json_schema` 作为结构化输出格式。

**归类**：官方工程依据。

### [P3] Hugging Face PEFT / Transformers

**Hugging Face Transformers Documentation — Parameter-efficient fine-tuning.**

链接：<https://huggingface.co/docs/transformers/peft>

**与 v1.0 的关系**：

- 支持 LoRA 等 PEFT 方法；
- 支持向同一基础模型添加、切换、删除多个 adapter；
- 支持 hotswap LoRA adapter 的工作流。

**归类**：官方工程依据；用于评估“Base Model + 多 Adapter”与角色级 LoRA 的工程边界。

### [P4] vLLM OpenAI-Compatible Server

**vLLM Documentation — OpenAI-Compatible Server.**

链接：<https://docs.vllm.ai/en/latest/getting_started/quickstart.html>

**与 v1.0 的关系**：

- 支持将本地模型作为 OpenAI-compatible HTTP service；
- 有利于让 `Cloud LLM Adapter` 与 `Local LLM Adapter` 共享上层接口设计。

**归类**：官方工程依据。

## 44.4 开源工程参考

### [E1] emotion-steering

**eigenweltlabs/emotion-steering — activation-based emotion steering vectors for Hugging Face causal LMs.**

链接：<https://github.com/eigenweltlabs/emotion-steering>

**与 v1.0 的关系**：

- 展示从对比样本提取 emotion steering vector 并服务化的工程路径；
- 提供 Hugging Face / vLLM 路线的参考；
- 可作为未来 `LocalEmotionAdapter` / `ActivationSteeringAdapter` 的原型参考。

**归类**：开源工程参考，不作为理论结论。

---

# 45. 研究结论 → v1.0 架构映射

| v1.0 模块 | 主要资料 | 结论级别 |
|---|---|---|
| Identity / Personality | R1, R2, R7 | 研究依据 |
| Mood / Emotion | R1, R4, R8 | 研究依据 |
| Time Decay / Dynamic State | R1, R4, R5 | 研究依据 + 工程推导 |
| Event / Episode | R5, R6 | 研究依据 |
| Memory | R3, R5, R6 | 研究依据 |
| Relationship | R3, R4 | 研究依据 |
| Attitude / Target | 多研究综合 + 产品建模 | 工程推导 |
| Appraisal Engine | 心理学启发 + 多研究综合 | 工程推导 |
| Behavior Planner | R2, R3 + 系统工程推导 | 工程推导 |
| State Authority | 长期人格漂移控制需求 + 系统工程推导 | 工程推导 |
| Character Compiler | R2 + 产品工程推导 | 工程推导 |
| Cloud LLM Adapter | P1, P2 | 官方工程依据 |
| Local LLM Adapter | P3, P4 | 官方工程依据 |
| Activation Steering | R7, R8, R9, R10, E1 | 研究依据 / v2.0 |
| Dynamic LoRA | P3 + 系统工程推导 | 可选增强 |

---

# 46. 当前仍属于“待验证”的关键假设

以下参数和机制**不应当被视为经过科学验证的固定值**，而应通过产品数据进行校准：

1. 每种 Emotion 的默认 half-life；
2. 不同人格维度之间的具体权重；
3. `EventImpact × Sensitivity × RelationshipRelevance × GoalRelevance × ValueViolation` 的线性组合形式；
4. `爱 → 讨厌` 所需的事件数量阈值；
5. 多少次重复经历才足以改变 Preference / Belief；
6. Peak 与 Episode 的自动切分阈值；
7. Memory 的召回 Top-K；
8. Personality Drift 的报警阈值；
9. Appraisal 对 Emotion / Relationship 各维度的映射；
10. Cloud LLM 与 Local LLM 在相同 Character State 下的一致性。

v1.0 应把这些都做成**可配置参数**，并在 `evaluation/` 中建立实验记录，而不是硬编码为不可更改常量。

---

# 47. 资料使用原则

1. **研究结果 ≠ 产品事实**：论文中的收益和指标不能直接推断到所有模型、所有角色和所有产品场景。
2. **官方 API 能力 ≠ 模型内部可控性**：Cloud API 的 instructions / structured outputs 与 Local LLM 的 hidden-state steering 必须分开描述。
3. **功能性情绪 ≠ 主观体验**：角色可以表现出连续、可因果影响行为的情绪状态，但这不等同于证明角色拥有人的主观情绪体验。
4. **参数必须实验校准**：半衰期、关系变化阈值、记忆权重等属于工程参数。
5. **角色系统与模型解耦**：Character State、Memory、Relationship 和 Personality 应尽可能独立于具体 LLM 供应商。
6. **所有长期状态变化可审计**：任何核心人格、关系、态度和长期信念变化，都应保存来源 Event、时间、证据和变更原因。

---

# 48. 参考资料快速入口

### 学术研究

- Dynamic Persona Coherence：<https://aclanthology.org/2026.acl-long.1336/>
- PersonaForge：<https://aclanthology.org/2026.findings-acl.386/>
- PersonaAgent：<https://aclanthology.org/2026.findings-acl.1315/>
- Sentipolis：<https://aclanthology.org/2026.findings-acl.368/>
- Temporal Semantic Memory：<https://aclanthology.org/2026.findings-acl.1496/>
- Chronos：<https://arxiv.org/abs/2603.16862>
- Persona Vectors：<https://arxiv.org/abs/2507.21509>
- Emotion Concepts：<https://arxiv.org/abs/2604.07729>
- PsySET：<https://aclanthology.org/2026.acl-long.79/>
- Emotion Vectors in Open-Source LLMs：<https://arxiv.org/abs/2606.26987>

### 官方工程资料

- OpenAI Realtime API：<https://platform.openai.com/docs/api-reference/realtime>
- OpenAI API：<https://platform.openai.com/docs/>
- Hugging Face PEFT：<https://huggingface.co/docs/transformers/peft>
- vLLM OpenAI-Compatible Server：<https://docs.vllm.ai/en/latest/getting_started/quickstart.html>

### 开源工程

- emotion-steering：<https://github.com/eigenweltlabs/emotion-steering>

---

# 49. v1.0 文档版本说明

**本次补充内容**：

- 增加研究依据与资料索引；
- 增加逐模块的“资料 → 架构”映射；
- 增加研究依据 / 工程推导 / 待验证假设的分类；
- 增加 Cloud API、Local LLM、PEFT、vLLM 与 activation steering 的工程参考；
- 将默认情绪半衰期、事件权重、态度转变阈值等明确标记为可校准参数；
- 明确区分“模型的功能性情绪表示”与“角色运行时的长期心理状态”。

**下一版本建议**：在 v1.1 中为所有引用增加 DOI / BibTeX 导出，并在 `docs/research/` 下建立独立的 Research Notes，以避免技术规格主体过度膨胀。

---

**文档结束**


# 50. Context & Memory Storage Architecture Revision

> 本章节是 v1.0 的增量修订，重点补足“对话上下文如何长期保存、如何与事件/情绪/关系关联、如何在不无限扩大 Prompt 的情况下最大程度恢复上下文”的工程定义。

## 50.1 核心原则

Virtual Character OS 不应把“上下文”理解成一段不断增长的聊天 Prompt，而应定义为一个可追溯的上下文系统：

```text
Raw Conversation
      ↓
Conversation Turn
      ↓
Event Extraction
      ↓
Appraisal
      ↓
State Change
      ↓
Episode / Memory
      ↓
Temporal + Semantic Retrieval
      ↓
Context Builder
      ↓
LLM
```

核心原则：

1. **原始对话永久保存，摘要不能覆盖原文。**
2. **Event 表示“发生了什么”。**
3. **State Change 表示“对角色造成了什么心理/关系影响”。**
4. **Memory 表示“长期值得保留什么”。**
5. **Episode 表示“多个事件形成的连续经历”。**
6. **Current State 表示“角色现在是什么状态”。**
7. **Context Builder 负责在每次请求时选择需要送入 LLM 的信息。**
8. **历史数据与当前投影分离，以支持审计、Replay、纠错与回滚。**

## 50.2 四层信息模型

同一段用户对话可以同时产生四种信息：

```text
用户原话
  │
  ├── Raw Turn：永久原文
  │
  ├── Event：结构化事件
  │
  ├── State Change：Emotion / Mood / Trust 等变化
  │
  └── Memory：长期可复用信息
```

例如：

> “我昨天本来想和 Alice 表白，但是最后没说。我怕她拒绝我。”

应至少提取：

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

随后生成状态变化，例如：

```text
fear_of_rejection  +0.18
anticipation       +0.12
sadness            +0.05
hope               +0.08
```

并可形成长期关系记忆：

```text
“角色一直对 Alice 有明显的恋爱倾向，并害怕被拒绝。”
```

## 50.3 Context 不等于 History

数据库中的历史可以无限增长；LLM Context 必须有限。

```text
                      All History
                           │
             ┌─────────────┴─────────────┐
             ↓                           ↓
       Permanent Store              Runtime Context
       完整保存                     当前使用
             │                           │
             │                     Identity
             │                     Current State
             │                     Recent Turns
             │                     Relevant Memory
             │                     Relevant Events
             │                     Active Episodes
             │                     Goals
             │                           ↓
             └──────────────────────→  LLM
```

系统的目标不是“让 LLM 读完全部历史”，而是“让数据库不丢历史，让 Context Builder 找到正确历史”。

# 51. Conversation Data Model

## 51.1 Conversation

表示一个长期关系/对话容器：

```text
conversation_id
character_id
participant_id
started_at
last_activity_at
metadata
```

## 51.2 Session

表示一次相对连续的聊天窗口：

```text
session_id
conversation_id
started_at
ended_at
```

同一个长期 Conversation 可以拥有大量 Session。

## 51.3 Turn

保存每一条原始消息：

```text
turn_id
session_id
sequence_no
speaker_type
speaker_id
content
created_at
```

Turn 永久保存，不通过 summary 覆盖。

## 51.4 Segment

一组相邻 Turn 的逻辑片段，例如 10～30 轮：

```text
segment_id
session_id
start_sequence
end_sequence
topic
summary
```

Segment 是 Context Compression 的第一层。

## 51.5 Context Summary

摘要不作为原文替代物，而作为检索索引：

```text
Raw Turns → Segment Summary
```

当摘要命中但细节不足时，再回溯原始 Turn。

# 52. Event / State / Memory Linking

## 52.1 链接关系

```text
Turn
 │
 ├──────→ Event
 │          │
 │          ├────→ StateChange
 │          │
 │          ├────→ Episode
 │          │
 │          └────→ Memory
 │
 └──────→ Target
```

必须使用稳定 ID 建立关系，而不是复制文本名称。

## 52.2 Source of Truth

不同对象的权威来源：

| 信息 | 权威来源 |
|---|---|
| 用户原话 | conversation_turns |
| 世界事件 | events |
| 状态变化原因 | state_changes |
| 当前情绪/关系 | current state projection |
| 长期知识 | memories |
| 情绪故事段 | emotion_episodes |

# 53. Context Builder v1.0

每次生成前建立五层 Context：

```text
L1 Identity
L2 Current State
L3 Recent Turns
L4 Relevant Memory
L5 Relevant Events / Episodes
```

推荐顺序：

```text
Identity
↓
Relationship / Target
↓
Current Emotion / Mood
↓
Recent Conversation
↓
Relevant Memories
↓
Relevant Events / Episodes
↓
Behavior Plan
```

## 53.1 Retrieval Strategy

推荐混合检索：

```text
Target filter
   +
Time filter
   +
Importance filter
   +
Semantic similarity
   +
Emotional salience
   +
Relationship salience
```

而不是只做向量相似度。

可使用如下工程评分框架：

```text
score =
    w_recency * recency
  + w_semantic * semantic_similarity
  + w_target * target_match
  + w_importance * importance
  + w_emotion * emotional_salience
```

以上权重属于待实验校准参数，不是固定科学常数。

# 54. Temporal Memory Rules

## 54.1 不删除旧事实

对于会随时间变化的信息，使用有效时间区间：

```text
valid_from
valid_until
occurred_at
```

例如：

```text
Jan～Jun：Alice 喜欢咖啡
Jul～now：Alice 已戒咖啡
```

旧事实仍存在，但不再作为“当前事实”返回。

## 54.2 Emotion 与 Attitude 不同时间尺度衰减

```text
Emotion   → 分钟级
Mood      → 小时级
Relation  → 天/周级
Preference→ 月级
Belief    → 月级
Personality→ 默认不自动衰减
```

Emotion 推荐 lazy decay：写入时记录 `updated_at + half_life`，读取时计算当前值，不需要每秒 UPDATE。

# 55. Event Sourcing + Projection

推荐：

```text
Immutable Events
      ↓
Reducer
      ↓
Current State Projection
```

当前状态可缓存/物化，但历史事件不可覆盖。

如果发现状态错误：

```text
Snapshot
  ↓
Replay later events
  ↓
Rebuild current state
```

## 55.1 Snapshot

当事件很多时，定期保存 State Snapshot：

```text
Snapshot @ event 1000
Snapshot @ event 2000
Snapshot @ event 3000
```

恢复时从最近 Snapshot + 少量后续事件 replay。

# 56. Safety / Consistency Rules

## 56.1 State Authority

LLM 不能直接修改数据库核心字段，只能提出状态变化：

```text
LLM
 ↓
Proposed Change
 ↓
State Validator
 ↓
Policy Check
 ↓
Transactional Update
 ↓
Event + StateChange
```

## 56.2 Mutation Level

```text
L0：Attention / temporary emotion
L1：Mood / relationship
L2：Preference / belief
L3：Personality / core values
```

L3 默认禁止自动修改。

## 56.3 Optimistic Lock

状态更新应带 `version`：

```text
read version=12
      ↓
calculate
      ↓
UPDATE ... WHERE version=12
      ↓
version=13
```

如果影响行数为 0，则检测到并发修改，需要重新读取并重算。

## 56.4 Tenant Isolation

生产环境应支持 `tenant_id` 并使用 PostgreSQL Row-Level Security 或等价的数据访问隔离层。

# 57. Character Context Debugger

v1.0 建议预留调试接口，可显示：

```text
Current Target
Relevant Memories
Relevant Events
Current Emotion
Current Relationship
Behavior Plan
Context Sent to LLM
Token Count
```

目标：能够回答：

> “为什么角色这一轮会这样回答？”

并能够追溯：

```text
Response
↓
Behavior Plan
↓
State
↓
State Change
↓
Event
↓
Turn
```

# 58. Database Boundary

v1.0 数据库存储边界：

```text
PostgreSQL
├── Identity / Character DNA
├── Target / Attitude
├── Relationship
├── Runtime State
├── Conversation / Turn
├── Event / StateChange
├── Episode
├── Memory metadata
├── Version / Snapshot
└── Audit

Optional vector index
└── Memory embeddings
```

原则：

- PostgreSQL 保存权威结构化数据；
- Vector DB/pgvector 只负责相似度检索；
- Redis 只作为缓存，不作为长期事实来源；
- 原始聊天可以另行对象存储做冷热分层，但其逻辑 ID 必须保留在数据库中。

# 59. v1.0 Schema Revision Summary

本次增量修订新增以下核心概念：

```text
Conversation
Session
Turn
Segment
Context Summary
Event linkage
StateChange linkage
Temporal validity
Event sourcing
State projection
Snapshot
Context retrieval
Context debugger
```

因此 v1.0 的核心链条正式定义为：

```text
Conversation
    ↓
Turn
    ↓
Event
    ↓
Appraisal
    ↓
StateChange
    ↓
Current State
    ↓
Episode / Memory
    ↓
Retrieval
    ↓
Context Builder
    ↓
Behavior Planner
    ↓
LLM
    ↓
Response / Action
    ↓
Outcome
    ↓
New Event
```

**这条链是 Virtual Character OS v1.0 后续数据库 Schema、Runtime Core 和 API 设计的统一主轴。**


---

# 50. Runtime Core v0.1 实施基线

Runtime Core v0.1 已将 G4 / G6 / G9 三项产品决策落实为可测试的确定性核心。

## 50.1 已实现组件

- `types.ts`：领域类型
- `math.ts`：clamp 与 half-life decay
- `time-decay.ts`：lazy decay
- `episode-engine.ts`：Peak / Episode 创建、推进、Dormant / Reopen / Resolve
- `salience-engine.ts`：多因素 salience
- `state-reducer.ts`：Event → StateChange → Current State
- `context.ts`：Context Builder 骨架
- `ports/llm.ts`：LLM / EventExtractor / Memory / Outcome Ports
- `application/runtime.ts`：Runtime 协调层

## 50.2 G4 / G9 / G6 基线

### G4

Peak 自动识别；Episode 使用 Emotion 阈值、Event Importance、Target/Topic 连续性综合判断。

默认：

```text
start emotion >= 0.70
continue emotion >= 0.45
end emotion <= 0.35
```

这些是 v1.0 初始工程参数，后续必须用评测校准。

### G9

Episode 状态：`active / cooling / dormant / resolved / reopened`。

未解决 Episode 的 influence 随时间衰减；历史 Event / Memory 不因衰减删除；相似新事件可以重新激活。

### G6

Salience 由 interaction frequency、emotional impact、event importance、relationship relevance、recency 五类信号共同更新，并与 liking / trust / affection 保持独立。

## 50.3 实施边界

Core 先于数据库和模型供应商实现，以保证：

```text
same state + same event → same state transition
```

后续 PostgreSQL Repository、LLM EventExtractor、Memory Decision、Behavior Planner 都必须围绕这个确定性核心接入。

## 50.4 当前测试

Runtime Core v0.1 已包含 6 项自动化测试，覆盖：

- Emotion lazy decay；
- Episode 创建；
- Dormant → Reopened；
- Salience 更新；
- Event → Emotion / Attitude / Relationship StateChange；
- Episode Active → Cooling → Dormant。

