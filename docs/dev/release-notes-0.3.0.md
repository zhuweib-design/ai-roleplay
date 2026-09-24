# AI 酒馆 0.3.0 发布说明

发布日期：2026-09-25
版本定位：Runtime 与群聊 MVP —— 把 Virtual Character OS 从「可运行」推进到「多设备可用」。

---

## 一句话概括

0.3.0 完成了 Virtual Character OS 的运行时闭环：服务端持久化边界、群聊跨设备历史、可靠投递队列、冲突恢复、状态可观测，以及双内核 + 移动端全功能验证。

---

## 主要新能力

### 1. 服务端群聊历史（跨设备）

群聊公共回合不再只存在本机。进入群聊或切换群组时，客户端会从服务端拉取该群组的公共回合并合并到本地历史。

- 按逻辑回合键幂等合并，重复拉取不会产生重复消息。
- 成员以 Runtime UUID 存储，回显时映射回本地角色卡，显示名与头像正确。
- 远端未配置时行为不变，保持纯本地历史。

### 2. 服务端可靠投递队列（outbox）

公共回合改为「先入队持久化，再原子提交」：

- 新增 `group_turn_outbox` 表，`(group_id, logical_turn_id)` 唯一，状态机 `pending / committed / failed`。
- 提交成功时在同一事务内标记 `committed`；失败保留 `pending`，不丢回合。
- 提供 `GET/POST /outbox` 与 `POST /outbox/retry` 显式重放。

### 3. 群聊归档状态远端同步与 CAS

- 新增 `PUT /v1/runtime/groups/:id/status`，归档 / 恢复校验 `expectedVersion`。
- 归档后拒绝公共回合与成员变更；恢复不改变成员定义。
- 状态变化推进群组定义版本，旧版本写入返回 `409`。

### 4. 群组定义冲突恢复

- 并发成员变更冲突时记录远端最新定义，群聊页显示提示条。
- 提供「以服务端为准」：按成员 ID 映射回本地角色卡对齐成员与生命周期，只追加一条汇总系统消息，不改写历史消息。

### 5. Runtime 状态查看与回放自检

- 单聊上下文面板与群聊成员区新增折叠面板：版本、事件 / 记忆 / Episode 计数、显著情绪、Mood、最近事件。
- 「回放自检」以空事件基准重放历史事件流，校验 Reducer 确定性一致性。

### 6. 群聊生成可中止

生成中发送按钮切换为停止按钮；中止后保留已收到的部分内容，但不提交公共回合、不投递旁听事件。

---

## 验证与质量

| 项目 | 结果 |
| --- | --- |
| 全量单元测试 | 3437 项通过、3 项跳过 |
| 全量 E2E | 40 项通过 |
| E2E 覆盖内核 | Chromium（桌面 + Pixel 5 视口）、WebKit（Desktop Safari） |
| 真实 PostgreSQL 集成 | 单角色 Event/Snapshot/审计链路、群聊多角色原子提交、归档 CAS、outbox 入队与重放 |
| 门禁 | 类型检查、ESLint（0 error / 0 warning）、i18n 严格扫描、CSS 约定守卫 5/5、对比度、Schema 漂移检查、生产构建 |

---

## 升级与部署

### 数据库

需执行 `migrations/001_virtual_character_os.sql`。

- 迁移为幂等全量脚本，可重复执行。
- 旧部署若 `group_chats` 缺少 `version` 列，会幂等补齐非空列、默认值与非负约束，**不要求删除或重建既有群组数据**。
- 新增 `group_turn_outbox` 表。

完整流程见 [`docs/dev/runtime-database-migration-runbook.md`](../dev/runtime-database-migration-runbook.md)（备份、锁等待评估、执行后验证、回滚路径、演练清单）。

### 前端

设置 `VITE_RUNTIME_BASE_URL` 后切换到服务端 Runtime；未设置时保持原有本地快照行为。

---

## 已知限制

1. **生产认证未实现**：Runtime Handler 只接收外部传入的已解析 `tenantId`，认证与网关路由由部署方提供。
2. **outbox 无后台调度**：`pending` / `failed` 记录需客户端或运维显式触发重放。
3. **移动端为视口仿真**：Pixel 5 视口（Chromium）与 Desktop Safari（WebKit），未在真机执行。
4. **未覆盖 Gecko**：Firefox 未纳入 E2E。
5. **状态面板只读**：不支持在界面编辑情绪、关系或记忆。
6. **冲突恢复范围有限**：「以服务端为准」只对齐成员与生命周期，不处理历史回合差异。
7. **历史合并不做内容冲突判定**：同一回合本地与服务端内容不一致时以本地为准。
8. **Tauri 安装包未做端到端验收**：仅有编译验证与签名安装包产出。

---

## 相关文档

- [Virtual Character OS 实现基线](../design/virtual-character-os-实现基线.md)
- [多角色与群聊实施计划](../design/virtual-character-os-多角色群聊实施计划.md)
- [数据库迁移演练 Runbook](../dev/runtime-database-migration-runbook.md)
- [Web 端部署 SOP](../dev/web-deployment-sop.md)
- [变更日志](../../CHANGELOG.md)
