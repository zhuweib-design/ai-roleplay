# THIRD PARTY NOTICES

AI 酒馆（ai-roleplay）使用的第三方依赖及其许可证清单。

> 本清单依据各依赖在其包元数据（`package.json` / crate 元数据）中声明的许可证整理，**以各依赖自身随附的 LICENSE 为准**。许可证缩写说明：MIT / Apache-2.0 / MPL-2.0 / BSD / Unlicense 等为 [SPDX 标识符](https://spdx.org/licenses/)。

## 前端 / 工具链（npm devDependencies）

| 包 | 许可证 | 用途 |
| --- | --- | --- |
| vue | MIT | UI 框架 |
| vue-router | MIT | 路由 |
| pinia | MIT | 状态管理 |
| vite | MIT | 构建 |
| @vitejs/plugin-vue | MIT | Vite 插件 |
| typescript | Apache-2.0 | 类型系统 |
| vue-tsc | MIT | 类型检查 |
| eslint | MIT | Lint |
| eslint-plugin-vue | MIT | Lint |
| typescript-eslint | MIT | Lint |
| vitest | MIT | 测试 |
| @vitest/coverage-v8 | MIT | 测试覆盖率 |
| @vue/test-utils | MIT | 组件测试 |
| @playwright/test | Apache-2.0 | E2E 测试 |
| axe-core | MPL-2.0 | 无障碍扫描 |
| jsdom | MIT | 测试环境 |
| fake-indexeddb | Apache-2.0 | 测试环境 |

## 运行时 / 功能依赖（npm dependencies）

| 包 | 许可证 | 用途 |
| --- | --- | --- |
| @tauri-apps/api | Apache-2.0 OR MIT | 桌面 API |
| @tauri-apps/cli | Apache-2.0 OR MIT | Tauri CLI |
| @tauri-apps/plugin-dialog | MIT OR Apache-2.0 | 系统对话框 |
| @tauri-apps/plugin-fs | MIT OR Apache-2.0 | 文件系统 |
| @tauri-apps/plugin-updater | MIT OR Apache-2.0 | 自动更新 |
| onnxruntime-web | MIT | 本地向量嵌入推理 |
| @mlc-ai/web-llm | Apache-2.0 | 本地大模型引擎 |
| dompurify | MPL-2.0 OR Apache-2.0 | XSS 净化 |
| marked | MIT | Markdown 渲染 |
| gpt-tokenizer | MIT | Token 计数 |
| fflate | MIT | ZIP 解压 |

## 桌面端（Rust / Tauri crates）

| crate | 许可证 |
| --- | --- |
| tauri | MIT OR Apache-2.0 |
| tauri-build | MIT OR Apache-2.0 |
| tauri-plugin-fs | MIT OR Apache-2.0 |
| tauri-plugin-dialog | MIT OR Apache-2.0 |
| tauri-plugin-shell | MIT OR Apache-2.0 |
| tauri-plugin-http | MIT OR Apache-2.0 |
| tauri-plugin-os | MIT OR Apache-2.0 |
| tauri-plugin-global-shortcut | MIT OR Apache-2.0 |
| tauri-plugin-updater | MIT OR Apache-2.0 |
| serde | MIT OR Apache-2.0 |
| serde_json | MIT OR Apache-2.0 |
| tokio | MIT |
| tokio-stream | MIT |
| reqwest | MIT OR Apache-2.0 |
| anyhow | MIT OR Apache-2.0 |
| thiserror | MIT |
| log | MIT OR Apache-2.0 |
| env_logger | MIT OR Apache-2.0 |
| dirs | MIT OR Apache-2.0 |
| tempfile | MIT OR Apache-2.0 |
| futures-util | MIT OR Apache-2.0 |

## 说明

- 本仓库自身（AI 酒馆）**当前未附带 LICENSE 文件，保留所有权利**；本文件仅声明第三方依赖的许可证，不代表项目自身的授权条款。
- 若需按开源合规分发，请保留各依赖随附的许可证原文（`node_modules/<包名>/LICENSE*`、Cargo 缓存的 crate license），并在发行物中一并附上。
- 依赖版本更新后，请同步复核本清单。