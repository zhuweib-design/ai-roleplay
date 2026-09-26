# AI 酒馆 0.3.1 发布说明

发布日期：2026-09-26
版本定位：Runtime 与群聊生产化 —— 把 0.3.0 的 Runtime MVP 推进到「可授权、可恢复、可发布」。

---

## 一句话概括

0.3.1 不新增大型功能，只做 Runtime 与群聊的生产化收敛：服务端认证与租户 / 成员授权边界、可靠投递的重试与冲突语义、进入群聊时的遗留回合恢复，以及发布策略（仅源码归档）与质量门禁记录。

> **版本边界**：长对话、摘要、记忆与 RAG 继续归入 0.4.0。

---

## 主要新能力

### 1. Runtime 认证与租户边界

- Runtime HTTP 与群聊 HTTP Handler 支持宿主注入可信 `principal`；强制认证模式下，除健康检查外的请求没有有效 principal 时统一返回 `401 AUTHENTICATION_REQUIRED`。
- principal 的 `tenantId` **覆盖**客户端请求体与查询参数中的 tenant —— 客户端自报 tenant 不能扩大访问范围。
- 角色按 ID 读取与构建 Context 时增加租户校验，跨租户访问返回 `403 TENANT_FORBIDDEN`。
- 群聊使用静态租户绑定时，principal 的 tenant 不匹配会被拒绝。
- 认证宿主可注入成员授权器，授权失败返回 `403 MEMBER_FORBIDDEN`；Runtime 核心不绑定具体账户系统。

代码落点：`src/runtime/runtime-auth.ts`、`src/runtime/runtime-http.ts`、`src/runtime/runtime-group-http.ts`、`src/runtime/runtime-api.ts`。

### 2. 群聊投递可靠性加固

- 本地待提交回合**固定 `occurredAt`**：重试复用同一时间与逻辑回合键，不因重试生成新载荷。
- 本地队列记录 `pending / failed` 状态、尝试次数、错误代码、HTTP 状态与下次重试时间，并兼容 0.3.0 没有这些字段的旧快照。
- 服务端 outbox 重复入队改为**只读已存在条目**：同键同载荷幂等返回，载荷或时间不一致返回 `409 OUTBOX_CONFLICT`，不覆盖已提交或待重试内容。
- 已提交的服务端回合在**群组归档后**仍可用同一载荷确认，避免客户端未收到成功响应时重复投递失败。

### 3. 进入群聊时恢复服务端遗留回合

群聊页首次进入或切换群组时查询服务端 `pending / failed` outbox，把本地缺失的回合恢复到既有显式重试入口；发言角色已不属于当前群聊时保留错误并拒绝恢复，不静默丢弃。

### 4. 个人中心账户状态

新增本地用户状态展示、远程登录入口与本地数据说明；远程认证服务未配置时保持明确的本地模式提示，不伪装成已登录。

### 5. 发布策略：仅源码归档

- GitHub Release **只保留自动生成的源码归档**，不再构建或上传安装包，也不再发布 `latest.json` 更新器清单。
- 移除 Tauri updater 与更新检查入口，桌面端不再提供自动更新；桌面应用从源码本地构建（`npm run tauri:build`）。

---

## 验证与质量

| 项目 | 结果 |
| --- | --- |
| 全量单元测试 | 3448 项通过、3 项跳过 |
| 全量 E2E | 40 项通过 |
| E2E 覆盖 | Edge（桌面 + Pixel 5 视口）、WebKit（Desktop Safari） |
| 静态门禁 | typecheck、ESLint、i18n 严格扫描、CSS 约定守卫 5/5、对比度审计、Schema 漂移检查 |
| 生产构建 | Vite 生产构建 + PWA 资源生成通过 |
| CSP 审计 | 8 条路由 0 项违规，内联脚本负向对照被拦截，WASM / Blob Worker 探针通过 |
| 依赖漏洞 | `npm audit --audit-level=high`：0 项高危及以上 |
| Tauri | `--no-bundle` 构建通过，生成 `src-tauri/target/release/ai-roleplay.exe` |

完整门禁记录见 [`0.3.1-a-release-gates.md`](./0.3.1-a-release-gates.md)。

---

## 升级与部署

### 数据库

0.3.1 **没有新增迁移文件**，`migrations/001_virtual_character_os.sql` 与 0.3.0 保持一致（幂等全量脚本，可重复执行）。

> **发布前硬门禁**：需在 PostgreSQL 16 环境执行 `RUNTIME_PG_APPLY_SCHEMA=1 npm run test:coverage`，确认群聊 outbox、租户隔离、事务回滚与真实迁移全部通过。本机未设置 `RUNTIME_PG_TEST_URL`、无 Docker 与 `psql`，该项**未在本机执行**。

### 前端与服务端

- 未设置 `VITE_RUNTIME_BASE_URL` 时行为与 0.3.0 一致（本地快照）。
- 设置后启用服务端 Runtime。**启用强制认证前必须先接好宿主认证器与成员授权器**，否则除健康检查外的请求会统一返回 401。

---

## 已知限制

1. **认证与成员授权由部署方接线**：仓库提供「可信 principal → 授权器」的完整调用边界，但不假设具体登录 Provider、会话格式或成员表结构。
2. **outbox 仍无后台调度**：`pending` / `failed` 记录需客户端或运维显式触发重放。
3. **真实 PostgreSQL 集成测试未在本机执行**：需在具备 PostgreSQL 16 的环境补跑。
4. **移动端为视口仿真**：Pixel 5 视口（Chromium）与 Desktop Safari（WebKit），未在真机执行。
5. **未覆盖 Gecko**：Firefox 未纳入 E2E。
6. **状态面板只读**：不支持在界面编辑情绪、关系或记忆。
7. **冲突恢复范围有限**：「以服务端为准」只对齐成员与生命周期，不处理历史回合差异。
8. **不提供桌面安装包与自动更新**：GitHub Release 仅保留源码归档。

---

## 关于 CHANGELOG 的范围说明

`CHANGELOG.md` 的 `[0.3.1]` 段落由 0.3.1 开发期的 `[Unreleased]` 直接收束而来，其中**同时包含 0.3.0 已发布的能力**（Virtual Character OS Runtime、批量多角色、多角色群聊、PWA、多会话、移动端底部导航等）——0.3.0 发布时未在 CHANGELOG 单独成节。

**本发布说明只列 0.3.1 相对 0.3.0 的增量**；0.3.0 的能力清单以 [`release-notes-0.3.0.md`](./release-notes-0.3.0.md) 为准。

---

## 相关文档

- [0.3.1 开发基线记录](./0.3.1-baseline.md)
- [0.3.1 C 阶段：Runtime 认证与租户边界](./0.3.1-c-runtime-auth.md)
- [0.3.1 D 阶段：Runtime 可靠投递与群聊数据契约](./0.3.1-d-runtime-delivery.md)
- [0.3.1 A 阶段：质量门禁与发布验收](./0.3.1-a-release-gates.md)
- [数据库迁移演练 Runbook](./runtime-database-migration-runbook.md)
- [Web 端部署 SOP](./web-deployment-sop.md)
- [0.3.0 发布说明](./release-notes-0.3.0.md)
- [变更日志](../../CHANGELOG.md)
