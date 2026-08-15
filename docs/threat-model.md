# AI 酒馆威胁模型(Threat Model)

> 版本:v1.0(T-06 交付)
> 范围:AI 酒馆(ai-roleplay)Web + Tauri 双环境的数据安全威胁面
> 用途:开发与评审时对照;新功能接入前核对对应条目

## 1. 资产清单

| 资产 | 位置(Web) | 位置(Tauri) | 敏感性 |
|---|---|---|---|
| API Key(加密态 `enc:v1:`) | IndexedDB / localStorage | 数据目录 settings 文件 | 高 |
| 主密码(仅运行时内存) | 无持久化 | 无持久化 | 极高 |
| 聊天记录/角色卡/世界书 | IndexedDB | 数据目录 JSON 文件 | 高(隐私) |
| 备份文件(可选加密) | 用户下载 | 用户下载 | 高 |
| 扩展代码 | 内存/localStorage | 数据目录 | 中(可执行) |
| 审计日志(仅摘要) | localStorage | localStorage | 低 |

## 2. 信任边界

```
┌─ 不受信 ──────────────┐   ┌─ 受信(应用内) ────────────┐
│ 远程 LLM API 响应      │──▶│ 净化层(sanitize/校验)      │
│ 扩展代码(用户安装)      │──▶│ 权限门禁(extension-loader) │
│ 导入文件(角色卡/备份)    │──▶│ 格式校验(validate*)        │
│ 市场清单/下载内容        │──▶│ 哈希校验(market-index)     │
└───────────────────────┘   └────────────────────────────┘
```

## 3. 已落实的防护(截至 T-11)

| 威胁 | 防护 | 位置 |
|---|---|---|
| API Key 明文泄漏 | AES-GCM + PBKDF2 600k 迭代,密文前缀 `enc:v1:` | `core/api-key-crypto.ts` |
| 备份文件含明文密钥 | 导出前检测,存在即拒绝并审计(blocked) | `services/backup-service.ts` |
| 备份文件泄露/篡改 | 可选 AES-GCM 加密 + GCM 认证标签 | `core/backup-crypto.ts` |
| XSS(渲染不可信 HTML) | DOMPurify 白名单(模块保留,新 v-html 前必须接线 P3-3) | `core/sanitize.ts` |
| 扩展逃逸(联网/DOM) | permissions 门禁:未授予即拒绝守卫(CAPABILITY_VIOLATION) | `core/extension-loader.ts` |
| 敏感操作不可追溯 | 审计日志(仅摘要,200 条环形) | `core/audit-log.ts` |
| 市场文件篡改 | 清单 sha256 校验,拒绝非 https | `core/market-index.ts` |
| SSRF(代理出站) | dev 代理仅放行本地/私网;Tauri 侧 Rust `validate_endpoint` 禁 link-local/私网 | `vite.config.ts` / `src-tauri/src/commands/chat_stream.rs` |
| 数据完整性(写入) | Tauri fs 原子写入(.tmp+rename);IndexedDB 事务 | `fs_commands.rs` / `indexeddb-adapter.ts` |
| CSP | Tauri CSP:script-src 'self'(禁远程代码执行);connect-src https://*(支持任意自定义模型端点,禁 http 明文);capabilities remote 同(仅 https+本地回环);权限最小化 core:default(无 fs/shell/http 插件) | `tauri.conf.json` / `capabilities/default.json` |
| 提示词注入(可执行层面) | 模型输出/导入文本**永不被当作代码执行**(无 eval/Function 路径);对话内容文本插值渲染 | 渲染层 / 第 6 节 |

## 4. 已知残余风险(接受或缓解中)

| 风险 | 级别 | 现状 | 缓解方向 |
|---|---|---|---|
| 扩展属性读取式逃逸(如 `window.someProp`) | 中 | 守卫仅拦函数调用 | Worker/iframe 真沙箱(异步 API 重构,ponytail) |
| eval/new Function 构造器绕过遮蔽 | 中 | 扩展与主进程同权限 | 同上;安装流需人工审查 |
| 主密码暴力破解 | 低 | PBKDF2 600k 迭代,无速率限制(本地) | 本地攻击面小,接受 |
| 浏览器扩展/恶意网页读取 localStorage | 中 | Web 模式数据在 IndexedDB/localStorage | Tauri 模式推荐;CSP 收紧 |
| 导入 JSON 深度嵌套 DoS | 低 | 未限制 JSON 深度 | 导入解析加深度限制(待办) |
| 市场清单伪造 | 低 | 哈希校验但清单本身无签名 | 远期:清单签名(GPG/Ed25519) |
| 任意 https 端点外发(用户配置驱动) | 中(定位固有) | 端点由用户主动配置;私网探测已由 Rust 阻断;https-only 加密 | P2-9 决策(2026-08-16):保留开放定位不收敛;可选强化:保存端点 UI 提示/协议校验 |
| 提示词注入(模型输出/导入内容操纵对话) | 中(固有) | 模型输出仅对话内展示不执行;角色卡/世界书经 schema 校验;注入仅影响本次回复,不影响本地数据/密钥 | 文档化用户责任边界(第 6 节);保持文本插值渲染,禁止未净化 v-html |

## 5. 评审清单(新功能接入时)

- [ ] 是否引入新的 `v-html` 渲染?→ 必须先接线 `sanitize`
- [ ] 是否新增用户可上传/导入的文件?→ 必须校验格式 + 大小上限
- [ ] 是否发起网络请求?→ 确认目标白名单/SSRF 防护;Web 模式 CORS 处理
- [ ] 是否持久化敏感字段?→ 确认走 `api-key-crypto` 或等价加密
- [ ] 是否新增可执行代码路径?→ 确认权限门禁覆盖
- [ ] 是否删除数据?→ 确认确认流 + 审计记录
- [ ] 是否新增渲染模型输出的路径?→ 必须文本插值或经 `sanitize`,禁止直接 v-html(见第 6 节)

## 6. 提示词注入(Prompt Injection)专项说明

> 来源:pre-launch 全检(2026-08-15)安全卫士建议;AI 角色扮演类应用固有风险,无法完全消除,以「缓解 + 责任边界」管理。

### 攻击路径
1. **导入角色卡**:角色卡文本(description / personality / scenario)可能含指令,诱导模型越权输出或套取系统提示词。
2. **模型输出**:被诱导的模型可能输出指令性内容;若应用将其当作代码/命令执行则危险。
3. **世界书 / 扩展 / 市场内容**:同角色卡,可携带操纵性文本。

### 当前缓解(已落实)
| 层 | 缓解 |
|---|---|
| XSS | 对话内容一律文本插值渲染(自动转义);全项目仅 `Icon.vue` 一处 `v-html`,数据源为静态图标注册表,不触达模型/用户输入 |
| 可执行性 | 模型输出/导入文本**永不被当作代码执行**(无 eval / Function / 动态 import 路径);扩展系统有独立权限门禁 |
| 数据隔离 | 注入即使成功,只影响本次模型回复,不影响本地数据与密钥(密钥经 PBKDF2 600k + AES-GCM 加密) |
| 校验 | 角色卡/备份/世界书导入有 schema 校验,拒绝畸形结构 |

### 用户责任边界(文档化)
- 用户应知晓:角色卡/世界书来自第三方时,其文本可能包含操纵模型输出的指令,属该类应用的固有风险。
- 用户应避免导入来源不明的角色卡/世界书,或导入后人工审查可疑指令。
- 应用承诺:注入内容**不会**导致本地数据丢失、密钥泄露或任意代码执行;但**会**影响模型在该对话内的表现。
- 开发约束:保持对话内容文本插值渲染;**新增任何 v-html 前必须接线 `sanitize`(P3-3)** 并走第 5 节评审清单。
