<div align="center">

<p><b><a href="README.md">简体中文</a> · <a href="README-EN.md">English</a></b></p>

# 🍺 AI 酒馆

**基于 SillyTavern 架构的 AI 角色扮演聊天应用：多模型对话 · 角色卡 · 世界书 · 群聊 · 故事引擎 · 社区市场 · 自定义主题 · 自定义向量模型 RAG**

[![Version](https://img.shields.io/badge/version-0.2.0-blue.svg)](https://github.com/zhuweib-design/ai-roleplay/releases/tag/v0.2.0)
[![Vue 3](https://img.shields.io/badge/Vue-3.5-42b883.svg)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178c6.svg)]()
[![Tauri 2](https://img.shields.io/badge/Tauri-2.0-24c8db.svg)]()

</div>

---

## 📑 目录

- [项目介绍](#-项目介绍)
- [✨ 特性](#-特性)
- [🖼️ 预览](#-预览)
- [🚀 快速开始](#-快速开始)
- [⚙️ 技术栈](#-技术栈)
- [🛣️ 路线图](#-路线图)
- [🤝 贡献](#-贡献)
- [📄 许可证](#-许可证)
- [更多](#-更多)

## 💡 项目介绍

> AI 酒馆是一款 AI 角色扮演聊天应用，让你与自建角色对话、管理世界设定、组织多人群聊，并通过故事引擎推进剧本。既可**在浏览器降级运行**，也可用 **Tauri 2 原生桌面封装**（含系统托盘、全局快捷键与自动更新）。

**AI 酒馆** 面向角色扮演与叙事创作，目标不只是「生成回复」，而是围绕 **角色、设定与世界的一致性** 提供完整的叙事工作流：从单个角色的性格与开场，到多人群聊的发言调度，再到由故事引擎推进的剧本走向。

- **故事化而非问答化**：世界书以关键词门控持续记忆设定并随语境注入，让角色长期保持一致；故事引擎负责剧本结构、主角身份、时间推进与随机事件。
- **可深度自建**：上传背景图自动提取主色调定制主题；上传 ZIP 或登记本地目录添加自定义向量模型，用 RAG 语义检索让记忆随语境自动浮现。
- **隐私与本地优先**：可接入 WebLLM 本地模型离线对话，无需 API Key 也可畅聊；API Key 落盘加密，主密码不本地存储。

**适用场景**：沉淀长期世界观的角色扮演玩家 · 隐私优先、希望离线对话的用户 · 研究与探索 RAG 语义记忆在角色扮演应用中落地的人。

> 核心能力、技术栈、安全详见下方各节。

## ✨ 特性

| 特性 | 解决的问题 |
| --- | --- |
| **多模型对话** | OpenAI / Anthropic 等多 profile，流式生成、重新生成、翻译、TTS、自动摘要 |
| **自定义向量模型 + RAG** | 上传 ZIP 或登记本地目录添加自定义向量模型，驱动「动态记忆 / 静态世界设定」语义检索 |
| **自定义主题** | 上传背景图自动提取主色调（k-means 聚类）并匹配组件配色，含深/浅主题与"暗夜剧场"字体 |
| **世界书 / Lorebook** | 关键词门控激活，设定随语境自动注入 |
| **角色卡与群聊** | 角色卡导入、Persona、群聊成员/发言顺序、随机 NPC |
| **故事引擎** | 剧本结构分析、主角配置、时间推进、随机事件 |
| **社区市场** | 基于 GitHub 索引的模板 / 角色卡 / 世界书下载，含哈希校验与离线回退 |
| **扩展系统** | 沙箱执行、按需权限（默认拒绝），社区扩展默认不自动执行 |
| **桌面强化** | 系统托盘、全局快捷键（`Ctrl+Alt+Space`）、拖拽导入、断网提示、自动更新 |

## 🖼️ 预览

<!-- 截图/演示图待补充：请在此粘贴应用截图或录制 GIF，勿放置无效图片链接。 -->

## 🚀 快速开始

```bash
# 安装依赖
npm install

# 前端开发（Web 降级运行）
npm run dev

# 原生桌面开发（Tauri）
npm run tauri:dev

# 构建前端产物
npm run build
```

### 本地开发门禁

仓库内命令与 CI 对齐，提交前在本机跑通：

```bash
npm run lint          # ESLint（0 error）
npm run typecheck     # vue-tsc --noEmit
npm run test          # Vitest 单测
npm run test:coverage # 覆盖率（statements ≥78 / branches ≥73）
npm run i18n:check:strict # i18n 严格扫描
npm run a11y:contrast # 无障碍对比度（≥ AA 4.5:1）
npm run tauri:build   # 桌面端构建验证
```

> CI（`.github/workflows/ci.yml`）串联 lint → i18n → coverage/build → 对比度 → Playwright e2e → Tauri 构建；打 `v*` tag 或手动触发时产出签名安装包。

## ⚙️ 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | Vue 3 · TypeScript · Vite · Vue Router · Pinia |
| 桌面 | Tauri 2.0（原生封装 + Web 降级） |
| 本地模型 | onnxruntime-web（向量嵌入） · WebLLM（本地大模型引擎） |
| 安全 / 渲染 | DOMPurify（XSS 净化） · gpt-tokenizer（token 计数） · marked（Markdown） · fflate（ZIP） |
| 质量 / 测试 | Vitest · Playwright · axe-core · ESLint |

### 目录结构（要点）

```
src/core/            核心逻辑（RAG、嵌入、主题提取、市场索引、扩展加载…）
src/stores/          Pinia 状态（对话、设置、用户向量模型…）
src/components/      组件（聊天、设置、通用 Modal/Icon…）
src/views/           页面视图
src/i18n/locales/    zh / en 国际化
src-tauri/           Tauri 原生壳（托盘、快捷键、updater、capabilities/ACL）
tests/               单测 / 无障碍 / E2E
```

## 🛣️ 路线图

- [x] **0.2.0** — 自定义向量模型 + RAG、自定义主题、自动更新、社区市场、系统托盘/快捷键（已发布）
- [ ] **v1.0.0** — 首个稳定版本（规划）
- [ ] **RAG 增强** — 更多预置嵌入模型、检索性能基准（规划）
- [ ] **无障碍** — 自定义主题运行时对比度预检（规划）

## 🤝 贡献

欢迎为 AI 酒馆做贡献。详见 [CONTRIBUTING.md](CONTRIBUTING.md)（含对核心开源技术的致谢）。基本流程：`Fork → 特性分支 → PR`；涉及较大改动或新功能，建议先开 Issue 讨论再动手。

## 📄 许可证

本项目基于 **Apache License 2.0** 开源。详见 [LICENSE](LICENSE)。

## 📚 更多

- [隐私与安全](#-隐私与安全)

### 隐私与安全

- 客户端最小权限：capabilities 仅授予 `core:default` + `updater:default`，未启用 `fs/shell/http/dialog/os` 插件
- CSP 收紧：`script-src 'self'` 禁内联脚本，`freezePrototype` 开启
- API Key 落盘加密（PBKDF2 + AES-GCM），主密码不本地存储
- 自动更新签名公钥内置于 `tauri.conf.json`，私钥存放于仓库 Secrets，不进入二进制