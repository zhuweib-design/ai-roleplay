# 1.0.0 发布证据记录

本记录对应 1.0.0 稳定版收口，代码证据以当前提交为准。

## 已执行

- `npm audit --audit-level=high`：无高危漏洞。
- `npm test`（含真实 PostgreSQL 环境）：134 个测试文件、3490 项通过。
- `npm run test:e2e`：41 项通过，覆盖桌面 Edge、移动功能与布局、WebKit。
- `npm run typecheck`、`npm run lint`、`npm run build`：通过。
- `npm run i18n:check:strict`、`npm run runtime:db:schema:check`、`npm run check:csp`：通过。
- `npm run csp:audit`：8 条生产路由无 CSP 违规，负向对照和能力探针通过。
- `npm run opt:eval:strict`：离线门禁通过。
- PostgreSQL 迁移恢复演练：37 张表，备份删除重建恢复成功，角色、群聊、成员计数一致。

## 尚需真实环境执行

没有配置 `OPENAI_API_KEY` 或 `OPENAI_BASE_URL`，因此真实 Provider 网络回归没有执行。缓存命中率、首 token 延迟、真实对话 token 节省、设定一致率、情绪连贯率和人工盲评继续标记为 `requires-real-env`，不作为本地稳定版的伪通过项。

真实 Provider 入口：

```bash
node scripts/opt-eval.mjs --with-api
```
