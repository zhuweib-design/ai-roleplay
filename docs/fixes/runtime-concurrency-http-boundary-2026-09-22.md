# Runtime 并发与 HTTP 持久化边界验证记录

**日期**：2026-09-22
**分支**：`codex/runtime-core-baseline`
**范围**：Runtime Core 并发、幂等、Replay、HTTP Handler、PostgreSQL 组合边界和真实聊天链路轮次 ID

## 1. 本阶段实现

### 1.1 Event 幂等与并发重试

- `RuntimeEventInput.eventId` 支持调用方提供稳定事件 ID。
- 同 ID、同内容的重复写入直接返回原有 Reducer 结果，不重复追加 Event、StateChange、Memory 或版本。
- 同 ID、不同内容会拒绝，避免网络重试或上游 bug 改写既有事实。
- 幂等比较采用递归键排序；调用方即使以不同 JSON 键顺序重试，也不会被误判为不同事件；未显式提供 occurredAt 时复用原事件时间。
- `RuntimeCore` 默认对乐观锁冲突自动重试 2 次；重试前重新读取最新 Snapshot，再使用同一个 Event 重算。
- 单进程内继续保留按角色排队；跨进程并发由 `PostgresRuntimeStore` 的 `FOR UPDATE` 和 `expectedVersion` 共同保护。

### 1.2 Replay 与审计稳定性

- Replay 先按 `occurredAt` 排序，再按 Event ID 稳定排序。
- Replay 强制校验事件的 `tenantId` 和 `characterId` 与初始角色一致。
- Episode、Memory、StateChange 使用由事件派生的稳定 UUID-like ID，重复 Replay 不再制造随机审计主键。
- 稳定 ID 仅用于 Replay、幂等和审计关联，不承担安全认证职责。

### 1.3 服务端 HTTP 边界

新增 `src/runtime/runtime-http.ts`：

- `HttpRuntimeApi` 面向浏览器、Tauri 和 SSR，通过 Fetch 调用服务端 Runtime。
- `createRuntimeHttpHandler` 将标准 Fetch Request 适配到已有 `handleRuntimeRequest`，统一处理 JSON、405、错误码和 409 版本冲突。
- HTTP 客户端可以注入 Fetch 和认证 Headers，便于测试、SSR 和宿主环境复用。

新增 `src/runtime/server-runtime.ts`：

- `createPostgresRuntimeApi(sql, tenantId)` 组合 `PostgresRuntimeStore`、`RuntimeCore` 和 `RuntimeApiAdapter`。
- `createPostgresRuntimeHttpHandler(sql, tenantId)` 暴露可挂载到 Node、Bun、Deno 或 Tauri 网关的 Fetch Handler。
- 服务端入口使用认证后的 `tenantId`，覆盖写请求体中的同名字段，防止客户端伪造租户。
- 浏览器端不直接接触 SQL、PostgreSQL 或投影表。

### 1.4 聊天链路轮次 ID

- `SendMessageParams.runtimeTurnId` 允许会话层传入稳定轮次 ID。
- `src/stores/chat.ts` 使用用户消息 ID 传入普通发送和重新生成流程。
- `chat-bridge.ts` 由租户、角色和轮次 ID 派生 UUID-like `eventId`，并保留 `sourceTurnId`。
- 未提供轮次 ID 时仍兼容旧调用，事件保持随机 ID；生产服务应优先传入稳定轮次 ID。
- Event 写入仍是 fail-open，不阻塞聊天生成主链路。

## 2. 自动化验证

### Runtime 与聊天专项

```text
npm test -- --run tests/runtime/runtime-core.test.ts tests/runtime/runtime-http.test.ts tests/services/chat-manager.test.ts
```

结果：3 个测试文件，81 个测试用例全部通过。

覆盖：

- Runtime Core 的 Replay 排序、稳定 ID、乐观锁重试和 Event 幂等。
- HTTP Handler 的创建角色、Event、Snapshot、Context、租户覆盖、非法 JSON、405 和 409。
- ChatManager 的 Runtime Context 注入、conversation_turn 写入、稳定 `sourceTurnId/eventId` 和 fail-open。

### 全量门禁结果

以下命令均已通过：

```text
npm run typecheck
npm run lint -- --quiet
npm run build
npm test
npm run opt:eval:strict
npm run i18n:check:strict
npm run check:css-conventions
npm run csp:audit
git diff --check
```

结果摘要：

- 全量单元测试：122 个测试文件，3371 个测试用例全部通过。
- 生产构建：通过；仅保留既有大体积 Chunk 警告，无构建错误。
- 类型检查和 ESLint：通过，无新增错误。
- 优化评估严格门禁：通过。
- 国际化、CSS 约定和 CSP 审计：全部通过，CSP 违规数为 0。
- 项目索引：已重新生成，收录 462 个文件。

### 浏览器 E2E

使用独立端口 `E2E_PORT=5174` 并复用已确认的 Vite 服务执行：

```text
E2E_PORT=5174 E2E_REUSE_SERVER=1 npm run test:e2e
```

结果：17 个 E2E 全部通过，覆盖角色生命周期、对话流、备份恢复、主题、对比度、国际化、世界书和移动端布局。测试结束后 5174 服务已关闭；未修改占用 5173 的其他本地进程。

## 3. 明确未完成项

- 已新增 `src/runtime/postgres-executor.ts`，提供真实 `node-postgres Pool` 到 `SqlExecutor` 的事务适配；仍未连接本地或 CI 的真实 PostgreSQL 实例。
- 尚未执行真实 PostgreSQL 集成测试，也没有在本阶段自动连接数据库执行迁移或部署服务。迁移 SQL 已生成并有 Schema 漂移检查门禁。
- `createPostgresRuntimeHttpHandler` 是服务端组合边界，不等于生产认证、限流、日志和连接池已经部署。
- `src/stores/chat.ts` 已为 ChatManager 提供稳定轮次 ID，但 Runtime 是否启用仍由宿主调用方通过 `ChatRuntimeIntegration` 注入；本地默认行为保持不变。

## 4. 结论

本阶段完成了 Runtime Core 的幂等与并发保护、Replay 审计稳定性、Fetch HTTP 边界和聊天轮次 ID 接入。真实 PostgreSQL 连接、迁移、认证中间件和生产部署仍需在服务端项目中继续集成验证，不能将当前实现表述为已完成数据库部署。