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

## 发布指引

本应用为 Tauri 2 桌面应用，发布 = 打语义化版本 tag，由 GitHub Actions 的 `tauri-release` job 产出**签名安装包**并推送到 GitHub Releases，同时生成 `latest.json` 供应用内自动更新消费。前端 Web 版随 tag 一并发布到 Releases assets。

### 一、前置条件（首个发布一次性配置）

在仓库 **Settings → Secrets and variables → Actions** 配置以下密钥：

| Secret | 用途 | 是否必需 |
| --- | --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | Tauri 更新签名私钥（PEM） | **必需** |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | 私钥密码 | **必需** |
| `WINDOWS_CERT_BASE64` / `WINDOWS_CERT_PASSWORD` | Windows 代码签名证书（base64 + 密码） | 可选（未配则出未签名 msi/nsis） |

> 签名私钥**不得进入仓库或二进制**；`src-tauri/tauri.conf.json` 仅内置对应公钥。

### 二、每次发版步骤

1. **版本一致性**：`package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock` 四处版本号必须一致（建议 `git grep 旧版本号` 核对无遗漏）。
2. **CHANGELOG**：在 `CHANGELOG.md` 顶部 `[Unreleased]` 下方新增本版条目，归类该版的 `新增 / 强化 / 变更 / 修复 / 安全`。
3. **本地门禁全绿**（与 CI 同构）：
   ```bash
   npm run lint && npm run typecheck \
   && npm run test && npm run i18n:check:strict && npm run a11y:contrast
   ```
4. **打 tag 并推送**（以 `0.2.0` 为例）：
   ```bash
   git commit ...  # 确保版本/CHANGELOG 先提交
   git tag v0.2.0
   git push origin v0.2.0
   ```
5. **CI 流水线**：推送后 CI 依次执行 `quality-gates`（lint/i18n/coverage/build + 新增对比度门禁）→ `e2e`（Playwright）→ `tauri-build`；全绿后在 tag 上触发 `tauri-release`，产出签名安装包并生成 `latest.json`。
6. **发布后验证**：
   - Actions 页确认 `tauri-release` 成功、Releases assets 含安装包与 `latest.json`；
   - 在已安装的应用内点「检查更新」，应能发现新版本并走签名更新；
   - Windows 未配代码签名证书时会提示“未知发布者”，属预期（仅影响安装体验，不影响更新机制）。

### 三、自动更新机制

- `src-tauri/tauri.conf.json` → `plugins.updater` 指向 `releases/latest/download/latest.json`，内嵌签名公钥。
- 客户端内置「检查更新」（设置页），新版本存在时 `downloadAndInstall()`，重启后生效（Windows 安装完成后自动处理重启）。
- **单点依赖**：当前主更新源为 GitHub Releases，无镜像降级源；若 GitHub 不可达，更新检查与安装会失败并有可见提示（不影响既有版本运行）。

### 四、回滚与风险

- **回滚**：重新发一个修复版本并打新 tag 覆盖 `latest`，应用内更新即可回归；不建议删除已发布 tag。设 `prerelease: false`，正式版才触发更新。
- **版本策略**：遵循语义化版本；功能/破坏变更提升 `MINOR`，缺陷修复提升 `PATCH`，首个稳定发布从 `1.0.0` 起（当前 `0.2.0` 为 dev 里程碑）。
- **发布即唯一改动源**：tag 触发必然重跑整条 CI，无跳过路径——保证产物由 `tauri-release` 从干净环境生成。