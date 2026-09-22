# Runtime Core 基线验证记录

**日期**：2026-09-22
**分支**：`codex/runtime-core-baseline`
**提交基线**：`f74460c feat: add virtual character runtime baseline`
**范围**：数据库 Schema 对齐、Runtime Core、Emotion Engine、Character Compiler、API、PostgreSQL RuntimeStore、Replay、聊天链路 Runtime 接入

## 1. 验证对象

- `src/runtime/types.ts`
- `src/runtime/emotion-engine.ts`
- `src/runtime/character-compiler.ts`
- `src/runtime/store.ts`
- `src/runtime/postgres-store.ts`
- `src/runtime/context-builder.ts`
- `src/runtime/runtime-core.ts`
- `src/runtime/runtime-api.ts`
- `src/runtime/chat-bridge.ts`
- `src/runtime/project-runtime.ts`
- `src/core/prompt-builder.ts`
- `src/services/chat-manager.ts`
- `tests/runtime/runtime-core.test.ts`
- `tests/services/chat-manager.test.ts`
- `docs/design/virtual-character-os-实现基线.md`
- `scripts/gen-project-index.mjs`
- `PROJECT_INDEX.md`

## 2. 本阶段新增实现

### PostgreSQL RuntimeStore

`src/runtime/postgres-store.ts` 已实现：

- `SqlExecutor` 最小数据库驱动端口。
- `characters.state_version` 乐观锁校验。
- 事务内 `FOR UPDATE` 角色行锁。
- `state_snapshots` 快照读写。
- Event、StateChange 追加写入与 ID 去重。
- `state_audit_logs` before/after 审计记录。
- tenantId 隔离校验。
- PostgreSQL UUID 边界校验。
- Event、StateChange、Snapshot、角色版本和 Audit 同事务提交。

该实现是服务端 PostgreSQL 适配器，不代表浏览器端已经连接 PostgreSQL。当前 Web/Tauri 仍使用 IndexedDB / Tauri SnapshotRuntimeStore。

### Runtime Replay

`replayRuntimeEvents(initial, events)` 已加入 `src/runtime/runtime-core.ts`，用于历史事件重放、状态修复、算法升级后的重新计算和离线审计。Replay 使用确定性 Reducer，不调用 LLM，也不直接写数据库。

### 聊天链路 Runtime 接入

新增 `src/runtime/chat-bridge.ts`，并在 `ChatManager` 中接入：

- 发送前读取 Runtime Context。
- 将 `[Virtual Character Runtime State]` 区块追加到系统提示词。
- 回复完成后异步写入 `conversation_turn` Event。
- Context 读取失败、Event 写入失败均 fail-open，不改变聊天主链路。
- 未配置 Runtime 时保持原有请求装配和回调行为。

## 3. 自动化验证

### TypeScript 类型检查

命令：

```text
npm run typecheck
```

结果：通过。

### Runtime Core 专项测试

命令：

```text
npm test -- --run tests/runtime/runtime-core.test.ts
```

结果：通过，1 个测试文件，10 个测试用例全部通过。

覆盖内容：

- 角色编译和非法角色包校验。
- Emotion Lazy Half-Life Decay。
- Event 到 Emotion / Attitude / Relationship。
- Episode 生命周期。
- Salience 独立性。
- StorageAdapter Snapshot 持久化。
- Runtime Replay。
- PostgreSQL RuntimeStore 事务、版本锁、租户校验和审计记录。
- API 健康检查、角色创建、事件接收、上下文构建。

### ChatManager 专项测试

命令：

```text
npm test -- --run tests/services/chat-manager.test.ts
```

结果：通过，1 个测试文件，64 个测试用例全部通过。

新增验证：

- Runtime Context 注入系统提示词。
- 回复完成后写入 `conversation_turn` Event。
- Runtime Context 读取失败时聊天仍正常完成。
- Runtime Event 写入失败时聊天仍正常完成。
- 未配置 Runtime 时保持旧行为。

### 全量测试

命令：

```text
npm test
```

结果：通过，121 个测试文件，3362 个测试用例全部通过。

### 生产构建

命令：

```text
npm run build
```

结果：通过，Vite 与 PWA 产物生成成功。构建仅保留既有的大体积 chunk 提示，无构建错误。

### 静态检查

命令：

```text
npm run lint
git diff --check
```

结果：均通过。ESLint 无错误、无警告；差异检查无空白字符错误。

### 项目索引

命令：

```text
node scripts/gen-project-index.mjs
```

结果：通过，已重新生成 `PROJECT_INDEX.md`，收录 457 个文件。新增 RuntimeStore、Chat Bridge、设计文档和验证记录已纳入索引。

## 4. 已确认的工程边界

- Runtime Core 没有依赖 Vue 组件或具体 LLM 供应商。
- Web/Tauri 通过现有 `StorageAdapter` 保存快照。
- 同角色事件在单进程内串行处理。
- 存储提交包含 expectedVersion，版本冲突可以映射为 409。
- PostgreSQL 使用真实事务端口、角色行锁和审计写入，不在前端伪装数据库连接。
- Replay 不调用 LLM，不绕过 RuntimeStore 事务边界。
- ChatManager Runtime 接入采用 fail-open，不破坏流式响应、错误处理和 `onDone` 行为。
- LLM 不得直接写入人格核心状态，聊天 Event 仍通过 Runtime Reducer 处理。

## 5. 后续工作

- 在服务端接入真实 `pg.Pool` 或 Tauri Rust SQL 执行器。
- 根据部署方式补充数据库迁移执行和 PostgreSQL 集成测试。
- 后续再接入 EventExtractor、BehaviorPlanner 等上游协作者，并保持 Runtime Event 可审计、可 Replay。
