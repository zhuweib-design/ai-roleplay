# Runtime 事件与回放契约

> 当前契约版本：Event Schema `1`，Reducer `1`

## 版本边界

- `src/runtime/types.ts` 中的 `RUNTIME_EVENT_SCHEMA_VERSION` 和 `RUNTIME_REDUCER_VERSION` 是唯一版本常量。
- 新写入事件会显式保存 `schemaVersion` 与 `reducerVersion`。
- 旧快照缺少这两个字段时按版本 `1` 解释，不需要数据迁移。
- HTTP 入口和 `reduceRuntimeState()` 都拒绝未知版本；错误不会静默降级到当前 reducer。

## Replay 规则

- `replayRuntimeEvents()` 不访问存储、不调用模型或 LLM。
- 事件按 `occurredAt`、事件 ID 排序后回放，输入顺序不影响结果。
- 事件必须属于同一租户和角色；跨边界事件直接拒绝。
- reducer 产生的 Episode、Memory、StateChange 使用稳定 ID，便于审计和结果比对。

## 数据来源

- 本地 Runtime 以 `RuntimeSnapshot` 为状态快照，事件和派生状态一并保存。
- PostgreSQL Runtime 以事件表和状态快照为持久化边界，提交仍由版本 CAS 保护。
- 未来升级 reducer 时必须新增兼容迁移或明确拒绝旧版本，不能直接改变版本 1 的历史语义。

## 验收证据

- `tests/runtime/runtime-versioning.test.ts`：版本常量、旧事件兼容、未知版本拒绝、HTTP 入口校验。
- `tests/runtime/runtime-core.test.ts`：确定性回放、排序、稳定派生 ID、幂等与乐观锁重试。
- `tests/runtime/runtime-http.test.ts`：HTTP 到 Runtime 的事件和回放边界。
