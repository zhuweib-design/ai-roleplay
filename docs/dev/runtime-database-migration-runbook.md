# Virtual Character OS 数据库迁移演练 Runbook

> 适用对象：负责部署或升级服务端 Runtime（PostgreSQL）的开发与运维人员。
> 目标：在不破坏既有数据的前提下执行 `migrations/001_virtual_character_os.sql`，并具备可验证的回滚路径。
> 边界：本项目提供迁移文件与校验脚本，**不提供自动迁移编排**；正式发布窗口、备份保留与审批流程由部署方负责。

---

## 1. 迁移范围

权威 Schema 与迁移文件的唯一事实源：

- `docs/Virtual-Character-OS-v1.0-database-schema.sql.md`（权威文档）
- `migrations/001_virtual_character_os.sql`（可执行副本）

两者必须逐字一致，由 `npm run runtime:db:schema:check` 强制校验。当前迁移包含 37 张表，按用途分八组：

| 分组 | 表 |
| --- | --- |
| 角色定义 | `characters`、`character_profiles`、`character_traits`、`character_values`、`character_beliefs`、`character_goals`、`archetypes`、`targets` |
| 关系与偏好 | `character_preferences`、`character_attitudes`、`character_relationships`、`relationship_dimensions` |
| 情绪状态 | `character_emotions`、`character_mood` |
| 会话 | `conversations`、`conversation_sessions`、`conversation_turns`、`conversation_segments`、`context_summaries` |
| 群聊 | `group_chats`、`group_chat_members`、`group_chat_turns`、`group_event_links`、`group_turn_outbox` |
| 事件与状态 | `events`、`event_turn_links`、`state_changes` |
| 记忆与情节 | `emotion_episodes`、`emotion_episode_events`、`memories`、`memory_sources` |
| 快照、审计与行为 | `behavior_plans`、`state_snapshots`、`character_versions`、`state_audit_logs`、`context_builds`、`context_build_items` |

---

## 2. 迁移的幂等性保证

迁移脚本整体为幂等设计，可重复执行：

- 建表使用 `CREATE TABLE IF NOT EXISTS`，索引使用 `CREATE INDEX IF NOT EXISTS`。
- 扩展使用 `CREATE EXTENSION IF NOT EXISTS pgcrypto`。
- **旧部署升级**：`group_chats` 若已存在但缺少 `version` 列，脚本会执行
  `ALTER TABLE group_chats ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 0`，
  并通过 `DO $$` 块在约束缺失时补 `group_chats_version_nonnegative`，**不要求删除或重建既有群组数据**。
- `character_mood` 的 `dominance` / `baseline_dominance` 同样使用 `ADD COLUMN IF NOT EXISTS` 补齐。

因此「重复执行同一份迁移」是安全操作，可作为失败后的重试手段。

---

## 3. 执行前检查（必须全部通过）

### 3.1 迁移文件与权威文档无漂移

```bash
npm run runtime:db:schema:check
# 期望输出：[runtime-schema] 迁移文件与权威 Schema 文档一致
```

漂移即中止：先修正文件，不要带着不一致的迁移进入生产。

### 3.2 记录迁移前状态

```sql
-- 连接目标库执行
SELECT current_database(), version();

-- 已存在的目标表（用于判断是首次部署还是升级）
SELECT table_name FROM information_schema.tables
 WHERE table_schema = current_schema()
   AND table_name IN ('characters','group_chats','group_turn_outbox')
 ORDER BY table_name;

-- 若是旧部署，确认 group_chats 是否已有 version 列
SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_name = 'group_chats' AND column_name = 'version';
```

### 3.3 备份

```bash
pg_dump "$DATABASE_URL" -Fc -f "backup-before-vco-$(date +%Y%m%d-%H%M%S).dump"
```

生产环境同时确认：

- 备份文件可读且大小合理（不为 0）。
- 备份存放在与数据库不同的故障域。
- 记录本次迁移的 Git 提交 SHA，便于回溯。

### 3.4 锁等待评估

迁移包含 `ALTER TABLE`（旧部署升级路径）与 `CREATE INDEX`，会短暂持锁。执行前确认：

```sql
-- 是否存在长事务（会阻塞 ALTER TABLE 取锁）
SELECT pid, now() - xact_start AS duration, state, query
  FROM pg_stat_activity
 WHERE xact_start IS NOT NULL AND now() - xact_start > interval '1 minute'
 ORDER BY duration DESC;
```

若有长时间运行的事务，先与相关方确认，避免迁移在等锁时阻塞业务写入。

---

## 4. 执行迁移

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/001_virtual_character_os.sql
```

要点：

- 必须带 `-v ON_ERROR_STOP=1`，避免单条语句失败后脚本继续执行造成半迁移。
- 建议在单一会话内执行（不要拆分成多个并行 psql 进程）。
- 脚本包含 `CREATE EXTENSION`，需要相应权限；无权限时需由 DBA 预创建 `pgcrypto`。

---

## 5. 执行后验证

### 5.1 结构验证

```sql
-- 表数量（当前基线为 37）
SELECT count(*) FROM information_schema.tables
 WHERE table_schema = current_schema() AND table_type = 'BASE TABLE';

-- 关键约束存在
SELECT conname FROM pg_constraint
 WHERE conrelid = 'group_chats'::regclass
   AND conname = 'group_chats_version_nonnegative';

-- 群组版本列非空且有默认值
SELECT is_nullable, column_default FROM information_schema.columns
 WHERE table_name = 'group_chats' AND column_name = 'version';
```

### 5.2 行为验证（隔离 Schema，不触碰生产数据）

```bash
RUNTIME_PG_TEST_URL="$DATABASE_URL" RUNTIME_PG_APPLY_SCHEMA=1 \
  npx vitest run tests/runtime/postgres-runtime.integration.test.ts \
                 tests/runtime/postgres-group.integration.test.ts
```

这两组用例会在随机 Schema 中重建迁移并验证：事务原子性、版本锁、幂等、并发冲突重试、故障回滚、租户隔离、群聊归档 CAS、outbox 入队/重放。

### 5.3 历史数据完整性（升级场景）

```sql
-- 旧群组数据仍在，且版本默认归零
SELECT count(*) FROM group_chats WHERE version IS NULL;   -- 期望 0
SELECT min(version), max(version) FROM group_chats;       -- 期望 min >= 0

-- 成员与回合未丢失
SELECT (SELECT count(*) FROM group_chat_members) AS members,
       (SELECT count(*) FROM group_chat_turns)   AS turns;
```

与迁移前的记录值对比，确认无意外减少。

---

## 6. 回滚路径

迁移是**向前兼容的增量变更**（建表 / 加列 / 加约束），正常情况无需回滚。若必须回退：

### 6.1 首选：从备份恢复

```bash
# 1. 停止写入（停应用或进入维护模式）
# 2. 重建目标库（确认已无业务流量）
dropdb "$DB_NAME" && createdb "$DB_NAME"
# 3. 恢复备份
pg_restore -d "$DATABASE_URL" "backup-before-vco-<timestamp>.dump"
```

这是唯一能保证「回到迁移前精确状态」的路径。**不要依赖逐条 DROP TABLE 手工回退**。

### 6.2 局部回退（仅限开发 / 预发）

仅在确认无业务写入时可手工回退新增对象：

```sql
-- 0.3.0 新增的可靠投递队列表
DROP TABLE IF EXISTS group_turn_outbox;

-- 旧部署升级路径补出的列与约束（会丢失版本信息，仅在确认无依赖时执行）
ALTER TABLE group_chats DROP CONSTRAINT IF EXISTS group_chats_version_nonnegative;
ALTER TABLE group_chats DROP COLUMN IF EXISTS version;
```

生产环境不建议执行 6.2：一旦应用已写入 `version` 或 outbox 记录，局部回退会造成数据不一致。

### 6.3 回滚后验证

- 应用可正常启动并完成一次单角色对话与一次群聊回合。
- `npm run runtime:db:schema:check` 仍通过（校验的是文件，不是数据库）。
- 抽样核对角色、群聊、成员数量与备份一致。

---

## 7. 演练清单（发布前逐项打勾）

- [ ] `npm run runtime:db:schema:check` 通过
- [ ] 已记录迁移前表清单与关键计数
- [ ] `pg_dump` 备份完成且文件可用
- [ ] 已检查长事务，确认可安全取锁
- [ ] 在预发库完整执行一次迁移（含旧部署升级路径）
- [ ] 迁移后结构验证三条 SQL 通过
- [ ] 隔离 Schema 集成测试两组通过
- [ ] 历史数据计数与迁移前一致
- [ ] 已在预发库演练一次备份恢复
- [ ] 记录本次迁移的 Git SHA、执行人与时间窗口
- [ ] 明确回滚决策人

---

## 8. 已知边界

1. 本项目**不提供自动迁移编排**（无版本表、无迁移框架）；`migrations/001_virtual_character_os.sql` 是单文件全量脚本。
2. 迁移为幂等全量脚本，适合「首次部署」与「从旧版本补齐」；未来的结构性变更需要新增独立迁移文件，不能改写历史迁移。
3. `group_turn_outbox` 尚无后台自动重试调度，`status = 'pending' / 'failed'` 的记录需由客户端或运维显式触发重放。
4. 本 Runbook 未覆盖分库分表、逻辑复制或跨区域多主场景。
