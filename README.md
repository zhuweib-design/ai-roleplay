# AI 酒馆

基于 SillyTavern 架构的 AI 角色扮演聊天应用，提供多模型对话、角色卡管理、世界书、群聊、故事引擎与社区市场。支持 **Web 降级运行** 与 **Tauri 2.0 原生桌面封装**（含自动更新）。

## 功能亮点

- **多模型对话**：OpenAI / Anthropic 等多 profile 配置，支持流式生成、重新生成、翻译、TTS 朗读与自动摘要
- **自定义向量模型 + RAG**：用户可上传 ZIP 或登记本地磁盘目录添加自定义向量模型，用于双通道（动态记忆 / 静态世界设定）语义检索；模型按需动态加载 ONNX 推理
- **自定义主题**：上传背景图片，自动提取主色调并聚类为 5–6 个主题色，自动匹配组件配色（含深/浅主题与"暗夜剧场"字体）
- **世界书 / Lorebook**：关键词门控激活，与设定注入联动
- **角色卡与群聊**：角色卡导入、Persona、群聊成员/发言顺序、随机 NPC 生成
- **故事引擎**：剧本结构分析、主角身份配置、时间推进、随机事件
- **社区市场**：基于 GitHub 仓库索引的模板 / 角色卡 / 世界书下载，含哈希校验与离线回退
- **扩展系统**：沙箱执行、按需权限授予（默认拒绝），社区扩展默认不自动执行
- **桌面强化（Tauri）**：系统托盘、全局快捷键（Ctrl+Alt+Space 唤出）、拖拽导入、断网提示、自动更新

## 快速开始

```bash
# 安装依赖
npm install

# 前端开发（Web 降级运行）
npm run dev

# 原生桌面开发
npm run tauri:dev

# 构建前端产物
npm run build
```

## 本地开发门禁

仓库内所有命令与 CI 对齐，提交前在本机跑通：

```bash
npm run lint        # ESLint（0 error）
npm run typecheck   # vue-tsc --noEmit
npm run test        # Vitest 单测
npm run test:coverage  # 覆盖率（statements ≥78 / branches ≥73）
npm run i18n:check:strict # i18n 严格扫描（硬编码文案拦截）
npm run tauri:build # Tauri 桌面端构建验证
```

> CI（`.github/workflows/ci.yml`）串联 lint → i18n → coverage/build → Playwright e2e → Tauri 构建；打 `v*` tag 或手动触发时产出签名安装包。

## 目录结构（要点）

```
src/core/            核心逻辑（RAG、嵌入、主题提取、市场索引、扩展加载…）
src/stores/          Pinia 状态（对话、设置、用户向量模型…）
src/components/      组件（聊天、设置、通用 Modal/Icon…）
src/views/           页面视图
src/i18n/locales/    zh / en 国际化
src-tauri/           Tauri 原生壳（托盘、快捷键、updater、capabilities/ACL）
tests/               Vitest 单测（与 src 同构）
```

## 隐私与安全

- 客户端采用最小权限：capabilities 仅授予 `core:default` + `updater:default`，未启用 `fs/shell/http/dialog/os` 插件
- CSP 收紧：`script-src 'self'` 禁内联脚本，`freezePrototype` 开启
- API Key 落盘加密（PBKDF2 + AES-GCM），主密码不本地存储
- 自动更新签名公钥内置于 `tauri.conf.json`，私钥存放于仓库 Secrets，不进入二进制

## 发布流程

发布签名安装包由 GitHub Actions 的 `tauri-release` job 承担，打 `v*` tag（或手动 `workflow_dispatch`）时触发，产出会推送 GitHub Releases 并生成 `latest.json` 供自动更新消费。

**发布前置（为首个发布一次性配置）**
在仓库 Settings → Secrets 配置以下密钥后，`v0.2.0` 等 tag 才能产出可更新的签名安装包：

| Secret | 用途 | 是否必需 |
| --- | --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | Tauri 更新签名私钥 | 必需 |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | 私钥密码 | 必需 |
| `WINDOWS_CERT_BASE64` / `WINDOWS_CERT_PASSWORD` | Windows 代码签名证书 | 可选（未配则出未签名 msi/nsis） |

**发版步骤**
1. 确认 `package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock` 版本号一致；在 `CHANGELOG.md` 记录本版变更。
2. 打 tag 并推送：`git tag v0.2.0 && git push origin v0.2.0`
3. CI 依次通过 `quality-gates` → `e2e` → `tauri-build` 后执行 `tauri-release`；在 Actions 页确认安装包与 `latest.json` 生成成功。