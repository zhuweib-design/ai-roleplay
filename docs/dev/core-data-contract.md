# 1.0.0 核心数据契约基线

本文档冻结 1.0.0 之前各存储适配器之间共享的数据语义。它描述的是契约版本，不是数据库迁移编号。

## 当前版本

| 项目 | 版本 | 来源 |
| --- | ---: | --- |
| 核心数据契约 | 1 | `src/core/schema-contract.ts` |
| Runtime Event Schema | 1 | `src/runtime/types.ts` |
| Runtime Reducer | 1 | `src/runtime/types.ts` |
| 全量备份格式 | 1.0 | `src/core/backup.ts` |
| PostgreSQL Schema | v1.0 | `migrations/001_virtual_character_os.sql` |

## 兼容规则

1. 只增加可选字段时保持当前契约版本，并保证旧快照和旧备份仍可读取。
2. 改变字段含义、删除字段或改变事件归约语义时，必须增加迁移或提升对应版本。
3. 未知 Runtime Event Schema 或 Reducer 版本必须拒绝处理，不能静默按当前版本解释。
4. 原始消息、事件、快照、记忆、摘要和故事数据保持独立来源；派生数据不能覆盖原始事实。
5. 迁移文件是追加式的，不能改写已发布迁移；迁移与权威 Schema 文档必须通过 `npm run runtime:db:schema:check`。

## 发布证据

运行 `npm run release:evidence` 会在本地生成 `artifacts/release-evidence/v<package-version>/manifest.json`，记录当前 commit、工作区状态、Runtime/备份版本和数据库迁移哈希。清单中的质量门禁初始为 `not-run`，只有实际运行对应命令后才能更新为通过。
