# 参与贡献（Contributing）

感谢你愿意为 **AI 酒馆** 贡献！无论报告 Bug、改进文档，还是提交代码，都欢迎。

## 🙏 特别致谢

本项目建立在以下优秀的开源技术之上，向它们的作者与社区致敬：

- **[Vue.js](https://github.com/vuejs/core)** — 前端 UI 框架
- **[Tauri](https://github.com/tauri-apps/tauri)** — 桌面应用壳（含自动更新/托盘/快捷键）
- **[SillyTavern](https://github.com/SillyTavern/SillyTavern)** — 本项目基于其角色扮演聊天架构
- **[Vite](https://github.com/vitejs/vite)** — 前端构建与开发服务器
- **[Rust](https://github.com/rust-lang/rust)** — 桌面端系统编程语言

## 🚀 贡献流程

1. **Fork** 本仓库到你的账号。
2. 创建特性分支：`git checkout -b feat/你的特性` 或 `fix/你的修复`。
3. 开发时遵循现有代码风格与目录约定。
4. **本地门禁全绿**后再提交：

   ```bash
   npm run lint
   npm run typecheck
   npm run test
   npm run i18n:check:strict
   npm run a11y:contrast
   ```

5. 提交信息遵循仓库既有风格（小步、明确，如 `feat(scope): describe`）。
6. 向 `master` 发起 **Pull Request** 并描述改动目的。

## 💬 沟通

较大改动或新功能，建议先开 [Issue](https://github.com/zhuweib-design/ai-roleplay/issues) 讨论方向，再提交代码，以减少返工。