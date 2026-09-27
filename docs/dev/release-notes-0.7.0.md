# AI 酒馆 0.7.0 发布说明

发布日期：2026-09-27
版本定位：让角色记忆遵守时间有效性，并能追溯每次上下文组装使用了哪些来源。

## 主要变化

### 记忆有效期

- MemoryRecord 新增可选 `validFrom`、`validUntil` 和 `confidence`。
- Context Builder 在请求时间点过滤尚未生效或已经过期的记忆；未设置有效期的存量记忆保持原有永久有效行为。
- PostgreSQL 投影写入现有 `memories.valid_from`、`memories.valid_until` 和 `memories.confidence` 列。

### 上下文来源审计

- 每次 Context 构建都会生成 `contextBuild`，记录身份、状态、轮次、事件、记忆、Episode、目标和 Behavior Plan 的来源与排序。
- 每项记录估算 token 数与相关性分数，并记录本次上下文总量。
- 本地快照、内存存储和 PostgreSQL 都提供独立审计保存能力，不改变 Runtime Snapshot 版本，也不产生 StateChange。
- 审计存储异常会静默降级，保证聊天主链路继续运行。

## 兼容与升级

- 不新增数据库迁移，复用现有 Runtime Schema。
- 旧快照和旧 MemoryRecord 可以继续加载；没有有效期的记忆不会被过滤。
- Context 审计是增强能力，未提供审计存储端口的自定义 Store 仍可正常工作。

## 验证

| 项目 | 结果 |
| --- | --- |
| 新增有效期与审计测试 | 2 项通过 |
| Runtime / HTTP 回归测试 | 43 项通过 |
| PostgreSQL 适配器回归 | 3 项通过，真实数据库用例按环境跳过 |
| 类型检查 | `npm run typecheck` 通过 |
| ESLint | `npm run lint` 通过 |
