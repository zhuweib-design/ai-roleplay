# P2-9 CSP / remote 白名单盘点与决策记录

**日期**：2026-08-16
**来源**：pre-launch 全检报告 P2-9（CSP/remote 白名单收紧）
**状态**：✅ 盘点完成 · 决策已记录（保留开放定位，边界已覆盖）

---

## 1. 现状盘点（已审查代码）

| 层 | 配置 | 现状 |
|---|---|---|
| CSP（tauri.conf.json）| `connect-src 'self' ipc: http://ipc.localhost https://*` | 允许任意 **https** 端点（支持自定义模型端点）；**禁 http 明文**（除 Tauri ipc 本地通道） |
| capabilities（default.json）| `remote.urls: ["https://*", "http://localhost:*", "http://127.0.0.1:*"]` | 同上：https 任意 + 本地回环 |
| 权限 | `permissions: ["core:default"]` | **最小化**：未使用 fs/shell/http/dialog/os 插件，不授予任意权限 |
| script-src | `script-src 'self'` | 严格：仅本地脚本，无远程代码执行面 |

## 2. 白名单诉求盘点（为什么需要"宽"）

| 访问点 | 端点形态 | 是否可预设白名单 |
|---|---|---|
| LLM 模型端点（核心）| OpenAI 兼容任意 `baseURL`（OpenAI/Anthropic/中转/自建网关）| ❌ 不可预设——产品定位为"任意自定义端点" |
| 本地模型 | web-llm（浏览器内推理，无网络出站）| —（不涉及） |
| 社区市场 | 清单/直链（`/^https:\/\//` 严格校验，`market-index.ts:87`）| ✅ 已限 https |
| 图片生成 | 走 LLM 兼容 API 或用户配置端点 | 同 LLM 端点 |

**结论**：收敛为"预设端点白名单"会直接破坏"任意 OpenAI 兼容端点"这一核心产品定位，**决策为不收敛**。

## 3. 已落实的边界（威胁模型交叉引用）

| 威胁 | 防护 | 位置 |
|---|---|---|
| SSRF（本地/私网探测）| Rust `validate_endpoint` 禁 link-local（169.254.0.0/16 含云元数据）、IPv6 link-local、保留/组播/广播；私网仅 `allow_private=true`（前端识别为本地/局域网模型）时放行 | `src-tauri/src/commands/chat_stream.rs:409-414` |
| 明文传输 | CSP 禁 http（仅 ipc 本地通道）| tauri.conf.json |
| 市场内容篡改 | 清单 sha256 校验 + 拒绝非 https | `core/market-index.ts` |
| 远程代码执行 | `script-src 'self'` 仅本地脚本 | tauri.conf.json |
| 越权系统能力 | 无 fs/shell/http 插件权限（core:default 最小集）| capabilities/default.json |

## 4. 决策记录

- **决策**：保留"任意自定义端点"开放定位，**不收敛为预设白名单**（产品核心卖点，收敛即破坏功能）。
- **残余风险（接受）**：`connect-src https://*` 意味着用户配置的端点可被应用访问（数据外发）——**风险由用户主动配置驱动**，且端点私网探测已被 Rust 侧阻断；https-only 保证传输加密。属该产品定位的固有风险，记录于威胁模型第 4 节。
- **评审清单**：`threat-model.md` 第 5 节已含"是否发起网络请求→确认目标白名单/SSRF 防护"检查项（新功能接入时逐条核对）。

## 5. 可选强化项（发布后，按需评估）

1. **UI 提示**：保存自定义端点时提示"仅连接可信服务，端点可访问你的对话数据"
2. **协议校验**：API Profile 保存时校验 baseURL 协议为 http/https（防 `file:`/`ipc:` 注入）
3. **CSP 文档化**：本报告 + threat-model 作为 CSP 变更依据（后续收紧需走评审）
4. **可配置 CSP**：若未来产品收敛端点列表，CSP/capabilities 同步收紧（本报告 2.1 表为变更依据）

---

**验收**：白名单配置已文档化（本报告）；决策已记录（保留开放 + 边界覆盖）；threat-model 同步更新。
