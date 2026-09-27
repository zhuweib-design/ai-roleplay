# 0.9.0 发布证据记录

验证日期：2026-09-27（Asia/Shanghai）

代码验证提交：`855ea9d`

## 自动化门禁

| 项目 | 结果 |
| --- | --- |
| 全量 Vitest（含真实 PostgreSQL） | 134 个测试文件、3490 项通过 |
| TypeScript 类型检查 | 通过 |
| ESLint | 通过 |
| 生产构建 | 通过；仅有既有的大分包提示 |
| 国际化严格检查 | 通过，162 个源文件 |
| Runtime Schema 漂移检查 | 通过 |
| CSP 检查 | 通过 |
| 离线优化评估 `opt:eval:strict` | 通过 |

全量 PostgreSQL 测试使用本机 PostgreSQL 16 容器和连接串：
`postgresql://postgres:runtime_test@127.0.0.1:5432/runtime_test`。

群聊集成测试额外覆盖记忆审核语义：候选记忆在确认前不进入上下文，经过真实 HTTP 审核接口确认后，仅所属角色可以召回，其他成员不可见。

## 迁移与恢复演练

演练库：`runtime_drill`（本机 PostgreSQL 16 容器 `ai-roleplay-pg-test`）。

1. 执行 `migrations/001_virtual_character_os.sql`，创建 37 张表。
2. 写入 1 个角色、1 个群聊和 1 个群聊成员，生成 105,249 字节的 `pg_dump -Fc` 备份。
3. 删除并重建演练库，使用 `pg_restore --exit-on-error` 恢复成功。
4. 恢复后核对：角色 1 行、群聊 1 行、成员 1 行；`group_chats.version` 为非空、默认值 `0`，`group_chats_version_nonnegative` 约束存在。

备份文件仅保留在本地 `artifacts/release-evidence/v0.9.0/runtime-drill-before.dump`，该目录被 `.gitignore` 忽略，不进入版本库。

## 真实 Provider 状态

本次环境未设置 `OPENAI_API_KEY` 和 `OPENAI_BASE_URL`，因此没有执行真实 Provider 网络回归。离线评估已通过，并将缓存命中率、首 token 延迟、真实对话 token 节省、设定一致率、情绪连贯率和人工盲评标记为 `requires-real-env`，没有将离线样本结果当作真实模型结果。

真实 Provider 验证命令：

```bash
node scripts/opt-eval.mjs --with-api
```

## 复现入口

```bash
RUNTIME_PG_TEST_URL=postgresql://postgres:runtime_test@127.0.0.1:5432/runtime_test \
RUNTIME_PG_APPLY_SCHEMA=1 \
npm test
npm run opt:eval:strict
npm run runtime:db:schema:check
```
