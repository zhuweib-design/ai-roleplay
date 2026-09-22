# Runtime PostgreSQL Pool 与迁移边界验证记录

**日期**：2026-09-22
**分支**：`codex/runtime-core-baseline`
**范围**：真实 node-postgres Pool 适配、事务连接生命周期、Schema 迁移文件和漂移检查

## 1. 新增实现

### 1.1 Pool 到 SqlExecutor 的适配

新增 `src/runtime/postgres-executor.ts`：

- `PgPoolLike` 和 `PgClientLike` 使用结构类型描述 node-postgres 最小接口。
- `createPgPoolExecutor(pool)` 将 Pool 查询映射到 Runtime 的 `SqlExecutor`。
- 普通查询使用 Pool；事务通过 `pool.connect()` 获取专用 client。
- 事务顺序固定为 `BEGIN`、业务查询、`COMMIT`；业务异常执行 `ROLLBACK`，最后无论成功失败都释放 client。
- 不直接导入 `pg`，避免浏览器构建携带服务端数据库依赖；服务端安装 `pg` 后可直接传入 `Pool` 实例。

`src/runtime/server-runtime.ts` 新增：

- `createPgPoolRuntimeApi(pool, tenantId, options)`。
- `createPgPoolRuntimeHttpHandler(pool, tenantId, options)`。

### 1.2 可执行迁移文件

新增 `migrations/001_virtual_character_os.sql`，内容从权威文档
`docs/Virtual-Character-OS-v1.0-database-schema.sql.md` 的 SQL 代码块生成。

新增脚本：

```text
npm run runtime:db:schema:sync
npm run runtime:db:schema:check
```

`runtime:db:schema:check` 会在提交前检测迁移 SQL 和权威 Schema 文档是否发生漂移。
真实部署可使用 PostgreSQL 官方客户端执行：

```text
psql "$DATABASE_URL" -f migrations/001_virtual_character_os.sql
```

## 2. 自动化验证

```text
npm run runtime:db:schema:check
npm test -- --run tests/runtime/postgres-executor.test.ts tests/runtime/runtime-core.test.ts tests/runtime/runtime-http.test.ts
npm run typecheck
npm run lint -- --quiet
```

结果：

- Schema 漂移检查通过。
- 3 个 Runtime 测试文件，20 个测试用例全部通过。
- 类型检查通过。
- ESLint 通过。- 全量单元测试：123 个测试文件通过，1 个真实 PostgreSQL 集成测试文件在未配置 `RUNTIME_PG_TEST_URL` 时按预期跳过；3374 个测试用例通过，1 个集成用例跳过。
- 生产构建在本阶段新增 Pool 适配器后通过。

新增测试覆盖：

- Pool 普通查询结果映射。
- 事务使用同一个 client。
- 成功提交后释放连接。
- 业务异常回滚并释放连接。
- 原始业务异常不会被回滚错误覆盖。

### 2.1 真实连接集成测试入口

新增 `tests/runtime/postgres-runtime.integration.test.ts`。默认在没有 `RUNTIME_PG_TEST_URL` 时跳过，避免普通前端测试环境误连数据库；在服务端测试环境可执行：

```text
RUNTIME_PG_TEST_URL=postgres://... RUNTIME_PG_APPLY_SCHEMA=1 npm test -- --run tests/runtime/postgres-runtime.integration.test.ts
```

该测试会在隔离租户和角色上验证真实角色创建、Event 写入、Snapshot 读取和清理流程。当前本机 Docker/PostgreSQL 服务不可用，因此本轮只验证了 Pool 适配器和跳过条件，未伪造真实数据库通过结果。
## 3. 当前边界

- 当前仓库未新增 `pg` 运行时依赖，因为这是前端与跨端工程；服务端宿主应自行安装 `pg` 并将 `Pool` 注入 `createPgPoolRuntimeHttpHandler`。
- 当前未连接真实 PostgreSQL 实例，未声称已完成数据库部署。
- 迁移 SQL 已具备可执行文件，但迁移执行、数据库凭据、连接池参数、认证、限流和生产路由仍由服务端宿主负责。
- 下一步应在具备 PostgreSQL 的服务端环境中运行迁移，并增加真实连接集成测试，覆盖事务回滚、租户隔离、版本冲突和审计写入。
