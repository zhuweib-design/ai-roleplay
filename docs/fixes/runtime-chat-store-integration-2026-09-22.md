# Runtime 聊天链路接线记录

日期：2026-09-22
续验日期：2026-09-23
分支：`codex/runtime-core-baseline`

## 本次变更

### 1. Chat Store 实际接入 Runtime

`src/stores/chat.ts` 现在在普通发送和重新生成前执行 Runtime 角色幂等初始化：

- 使用浏览器/Tauri 本地快照 Runtime；
- 配置 `VITE_RUNTIME_BASE_URL` 时改用服务端 Runtime HTTP API；
- 由本地持久化租户 ID 保持租户稳定；
- 将 UI 角色 ID 映射为稳定 UUID，满足 PostgreSQL 边界约束；
- 首次使用时从角色卡建立 Runtime Character Definition 和种子记忆；
- 同一角色复用同一个 Runtime Integration；
- 初始化失败不缓存失败结果，下一轮允许自动恢复；
- Runtime 上下文读取和 Event 写入失败继续保持 fail-open，并通过 `runtimeStatus` 暴露最近错误阶段；
- Context Builder 会按 targetId、query 和发生时间筛选 Recent Events，聊天提示词会注入受限长度的最近事件摘要。

### 2. ChatManager 支持按请求切换 Runtime

`SendMessageParams.runtime` 可以覆盖配置级 Runtime，保证角色切换、普通发送和重新生成不会复用错误的角色上下文。

重新生成使用独立的 Runtime Turn ID，避免新候选回复与原始回复共用幂等键后产生“事件内容不一致”的冲突。

### 3. 稳定 ID

`src/runtime/runtime-id.ts` 集中维护稳定 UUID、Character、Target、Conversation、Session 和双 Turn ID 规则；Chat Bridge、Runtime Core 与 PostgreSQL Store 共同依赖该纯函数模块，移除了持久化实现对聊天编排模块的反向依赖。原有 Chat Event ID 算法保持兼容，避免已有重试幂等键改变。

PostgreSQL 初始化和提交边界现在会提前校验租户、角色 UUID，并为同名角色生成带稳定 ID 后缀的 slug，避免同租户同名角色触发唯一约束冲突。提交过程移除重复的规范化投影写入。

### 4. PostgreSQL 外键边界

- Chat Bridge 会把 UI 角色 ID 稳定映射为 Runtime Target UUID，Event、Memory、StateChange 写入前会为首次出现的合法 UUID `targetId` 幂等创建租户内的 Runtime 占位 Target；
- 已存在但属于其他租户的 Target 会被拒绝，避免跨租户关联；
- `sourceTurnId`、Memory source event 和 Episode event link 只有在对应记录真实存在时才建立，避免聊天链路因可选证据记录缺失而触发外键错误；
- Event 的 `topic` 现在一并保存在 payload 中，避免规范化事件表没有 topic 列导致主题丢失。

### 5. 原始 Conversation Turn 持久化

- `RuntimeApi` 新增 `/v1/runtime/characters/:id/turns` 接口；
- PostgreSQL RuntimeStore 会幂等创建 `conversations`、`conversation_sessions` 以及 user/character 两条 `conversation_turns`；
- Turn 内容冲突会返回 409 语义，不会静默覆盖历史原话；
- 服务端提供 `recordChatTurn` 原子接口后，ChatManager 一次提交原始双 Turn 与 `conversation_turn` Event；旧 Runtime 实现仍可回退为双调用；
- Runtime Core 会统一计算规范化 Turn UUID，并把它们写入 Event 的 `sourceTurnIds`；PostgreSQL Store 据此写入 `event_turn_links`；
- 多会话通过 Chat Store 当前 `activeChatId` 作为 conversation/session key，避免不同 UI 会话混写。

### 6. 原子聊天事务与并发幂等

- PostgreSQL 中 Conversation、Session、user/character 双 Turn、Event、StateChange、状态投影、Snapshot、Version 与 Audit 由同一个事务提交；
- 角色行通过 `SELECT ... FOR UPDATE` 锁定，乐观锁冲突由 Runtime Core 重读快照、重新归约并重试；
- 相同 Turn 与 Event 重试不会增加状态版本、Snapshot 或 Audit，且会在同一事务内校验 Turn 内容并补齐缺失的 Event-Turn 证据关联；
- Turn 内容或 Event 事实复用同一幂等键但发生变化时返回 409 冲突语义；
- Turn 与 Snapshot 的角色不一致会在进入事务前拒绝，避免跨角色原子写入；
- 真实 PostgreSQL 16 条件测试已覆盖双 Runtime 实例并发、原子回滚和证据关联，2026-09-23 已取得隔离 Schema 的运行证据。

### 7. 证据关联的租户与角色边界（2026-09-23）

- 发现原先只按 UUID 判断 Turn 或 Event 存在，会允许 Event-Turn、Memory-Event、Episode-Event 关联到其他租户或同租户其他角色的记录；
- PostgreSQL 证据查询现同时约束租户和角色；原子轮次的 `sourceTurnId`、`sourceTurnIds` 仅由稳定轮次键推导，忽略客户端伪造的其他 Turn ID；
- 真实 PostgreSQL 16 集成测试验证跨租户与跨角色 Turn 均不能成为当前角色 Event 的证据；单元测试验证伪造 ID 不进入原子 Event；
- 本地 Snapshot 实现也返回同服务端一致的稳定 Conversation、Session 和双 Turn ID，避免接口结果随存储适配器变化。

### 8. HTTP 服务边界与错误语义（2026-09-23）

- 在真实 PostgreSQL 16 条件测试中，经 `HttpRuntimeApi` 的请求序列化与 `createPgPoolRuntimeHttpHandler`，验证角色创建、认证租户覆盖、原子双 Turn、幂等重试、Context 读取和跨租户 404；该测试使用内存 Fetch 适配，不等同于真实网络监听或生产认证。
- 路由入口在调用 Runtime Core 前校验基础请求结构：角色、Event、传统 Turn、原子 Turn + Event、Context 的畸形输入返回 422，而非内部 500。
- 非预期的服务端异常不再将数据库等内部错误消息返回客户端；409 幂等冲突和版本冲突仍保留原有语义。

### 9. 规范化状态投影与版本审计

- RuntimeStore 初始化和提交现在同步投影 traits、values、beliefs、goals、preferences、attitudes、relationships、emotions、mood；
- `character_versions` 与 `state_audit_logs` 在同一事务内写入；
- `state_audit_logs.reason` 记录本次提交涉及的 Event ID 和 StateChange ID，支持按提交批次回溯；
- `character_mood` Schema 补齐 `dominance` 和 `baseline_dominance`，与 Runtime `MoodState` 保持一致；
- 初始化 Snapshot 中已有的 Event、StateChange 也会先写入规范化表，避免 seed/replay Snapshot 丢失历史。

## 验证结果

- Runtime 聊天链路集成测试：1 个测试文件，1 个用例通过；
- Runtime Core 与 HTTP 专项测试：32 个用例通过；真实 PostgreSQL 条件测试另行通过。
- 全量测试（含真实 PostgreSQL 条件测试）：125 个测试文件、3392 个用例通过，无跳过；
- 类型检查：通过；
- ESLint：通过；
- 真实 PostgreSQL 16 集成测试：1 个测试文件、1 个用例通过；
- Runtime Schema 漂移检查：通过；
- 生产构建：通过（307 个模块）；Playwright 浏览器端到端 17 个用例通过；
- `git diff --check`：通过。

## 真实 PostgreSQL 验证

2026-09-23 已使用官方 `postgres:16-alpine` 临时容器完成真实数据库验证：

- 在隔离 Schema 中执行完整迁移；
- 完成角色初始化、规范化状态投影、Conversation、Session 和双 Turn 持久化；
- 验证 Turn + Event + StateChange + Projection + Snapshot + Version + Audit 原子提交；
- 验证相同请求幂等重试不增加版本、Snapshot 或 Audit；
- 验证事务中 Event UUID 失败时 Turn、Event 和 Snapshot 全部回滚；
- 验证两个独立 Runtime Core 并发提交时通过行锁与乐观锁重试保留两个 Event，版本连续推进；两个独立 HTTP Handler 并发创建同一角色仅一条成功、一条返回 409 `ALREADY_EXISTS`，数据库仅一条角色行；
- 验证 Event 与 user/character 双 Turn 的 6 条证据关联、跨租户/跨角色证据隔离、跨租户读取拒绝和连接池 client 正常释放；
- 验证 HTTP 客户端到 Fetch Handler 再到 PostgreSQL 的序列化边界；尚未验证真实网络服务与生产认证中间件。
- 测试结束后已删除临时容器，未保留测试数据库。

`pg` 已加入开发依赖，干净安装环境可直接运行条件集成测试。生产部署仍需由宿主服务提供认证、连接串、备份、监控与迁移执行策略。

## 多角色扩展计划（2026-09-23）

当前单聊支持按角色隔离，但群聊回复仍为模拟内容，未接 Runtime Event；批量创建 API 尚不存在。后续契约、群聊真实模型编排、群组 Turn、成员 Event 与验收步骤见 docs/design/virtual-character-os-多角色群聊实施计划.md。
本地 Snapshot Store 的进程内同适配器写入已加锁；不同进程或不同适配器实例之间不提供原子 CAS，必须使用 PostgreSQL 服务端路径。

## 批量角色与群聊发言者校验（2026-09-23）

- 新增批量创建契约 POST /v1/runtime/characters/batch 和 HTTP 客户端方法：1 至 50 项，要求稳定角色 ID，拒绝重复 ID，逐项返回创建、已存在、编译失败；已创建项重试不覆盖，HTTP Handler 对每项覆盖认证租户。
- 新增本地与真实 PostgreSQL 16 测试验证两个角色独立创建、逐项失败与重试、服务器租户覆盖。加入批量接口后全量测试 125 文件、3392 用例通过；类型检查、ESLint、Schema 漂移检查与构建通过。
- 发现群聊从第二成员随机选中首消息时仍把首消息标成第一成员；已修复发言者归属，群聊 Store 专项 35 用例通过。该修复发生在上述全量运行之后，尚未重新执行全量套件；群聊真实模型链路仍未实现。

## 群聊真实生成首阶段（2026-09-23）

- 群聊视图以真实 ChatManager 替代 mock 回复；当前发言角色使用独立 group 会话键，Runtime Context 和 Event 与单聊隔离。
- 群聊公共历史按角色投影：本角色历史为 assistant，其他成员及系统记录为受限 user 上下文，避免把其他角色私有记忆注入本轮。
- 流式回复按群组和消息 ID 更新，指定发言保留至成功回复；失败时显示错误，群组及用户消息 ID 改为 UUID 以避免同毫秒碰撞。
- 新增浏览器双角色测试：自然轮换、指定发言、请求上下文和 IndexedDB Event，单项通过。其他成员公开旁听 Event 已实现客户端扇出；群组服务端原子事务、公共 Turn 和正式认证均未完成。

## 多角色旁听事件验证（2026-09-23）

- 旁听 Event 以稳定幂等 ID 写入各自 Runtime 快照，保存公开问答，不注入其他角色私有记忆；失败只报告 Runtime event 状态。
- 专项单元测试 39 个用例通过；真实 PostgreSQL 16 验证重复旁听仅保留一个 Event 和版本 1；全量测试含条件数据库用例 127 文件、3397 用例通过；浏览器端到端 18 用例通过；类型检查、ESLint、Schema 漂移检查、`git diff --check` 与生产构建通过（309 模块）。
- 浏览器双角色测试验证自然轮换、指定发言、私有 Context 隔离和旁听事件进入下一角色 Context；群聊仍缺服务端公共 Turn 与跨角色原子性。

## 租户内多角色列表（2026-09-23）

- Runtime API 新增角色列表和稳定游标分页；HTTP Handler 以认证租户覆盖查询租户，PostgreSQL 只查询该租户最新快照中的角色定义。
- Web/Tauri 快照适配器按前缀枚举已有快照，本地列表按租户过滤，避免索引迁移遗漏旧角色。
- 真实 PostgreSQL 条件测试验证批量创建后的多页返回和租户隔离；全量 127 文件、3397 用例通过；Rust cargo check --offline 与 cargo test --offline --lib（44 项）通过；类型检查、构建通过。
- UI 批量导入/失败重试已在随后完成；服务端群组原子事务及桌面原生端到端运行仍未完成。

## 批量导入界面与跨刷新重试（2026-09-23）

- 角色管理页批量选择或拖放最多 50 个 V2 JSON，导入后逐批同步 Runtime；失败 ID 按资料档案写入本地存储，可刷新后重试，重复请求按稳定 ID 幂等处理。
- Store 专项覆盖两角色创建、重试不覆盖及超限拒绝；浏览器专项 3 项覆盖刷新后角色保留、模拟 Runtime 写入故障后的刷新重试、超限无部分导入。
- 修复导入时角色卡本地落盘失败却仍加入 UI 的不一致问题，并增加故障单测。最终含真实 PostgreSQL 16 的全量单元测试 127 文件、3399 用例通过；浏览器全套 21 项、批量专项 3 项通过；类型检查、ESLint、Schema 漂移检查、生产构建和 git diff --check 通过。临时数据库容器已停止删除；原生安装包尚待验证。
- 全套浏览器并发回归曾出现一次对话页颜色对比度的消息淡入中间帧误报；将该静态对比度扫描设为减弱动画模式后重跑全套 21 项通过。产品动画实现未因此改变。

## 服务端群聊原子事务（2026-09-23）

- 新增 PostgreSQL 群组、成员、公共回合和成员 Event 证据表，租户与成员关系由数据库约束；`PostgresGroupRuntime` 按固定角色顺序锁定并原子提交公共 Turn、各成员 Event、Snapshot、投影和审计。
- 真实数据库测试覆盖幂等、并发顺序、中途故障回滚、跨租户/非成员拒绝、成员加入退出、私有 Context 隔离。并行隔离 Schema 迁移加 advisory lock 解决 pgcrypto 扩展系统目录创建竞态。
- 含真实 PostgreSQL 的全量 128 文件、3400 用例通过；浏览器全套 21 项、类型检查、ESLint、Schema 检查和生产构建通过，临时数据库容器已删除。该协调器仍未接 HTTP 与客户端，原有群聊旁听链路尚非服务端原子提交。
