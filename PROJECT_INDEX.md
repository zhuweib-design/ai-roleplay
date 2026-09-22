# PROJECT_INDEX

- **生成时间**：2026-09-23 02:48（本地时区）
- **项目根目录**：`.`（本文件所在目录；全文均为相对路径）
- **项目标识**：`ai-roleplay` v0.2.0 — AI 角色扮演与多模型对话平台（Tauri 2.0 原生封装 + Web 降级）
- **生成方式**：`node scripts/gen-project-index.mjs`（扫描文件系统 + 只读调用 git，不执行任何 git 写操作）
- **收录文件**：457 个 ｜ **忽略目录**：13 类 ｜ **待确认用途**：33 个

> 用途说明来源：人工核对清单优先；未核对者按文件命名规则推断并标注「待确认」，不做臆测。
> 敏感文件（密钥 / 证书 / 环境变量）只记录排除原因，不读取内容、不列入表格。

## 一、目录树（仅目录，不展开依赖与产物目录）

```
ai-roleplay/
- `.github/`  — 1 个文件
  - `workflows/`  — 1 个文件
- `.workbuddy/`  — 9 个文件
  - `memory/`  — 9 个文件
- `.workbuddy-ai/`  — 5 个文件
  - `memory/`  — 5 个文件
- `docs/`  — 164 个文件
  - `assets/`  — 110 个文件
    - `screenshots/`  — 110 个文件
      - `themes/`  — 84 个文件
        - `light/`  — 21 个文件
        - `midnight/`  — 21 个文件
        - `oled/`  — 21 个文件
        - `theatre/`  — 21 个文件
  - `design/`  — 13 个文件
  - `dev/`  — 17 个文件
  - `fixes/`  — 13 个文件
  - `other/`  — 6 个文件
  - `product/`  — 1 个文件
- `e2e/`  — 11 个文件
  - `mobile/`  — 1 个文件
- `market/`  — 8 个文件
  - `cards/`  — 1 个文件
  - `items/`  — 6 个文件
- `public/`  — 126 个文件
  - `assets/`  — 14 个文件
    - `icons/`  — 12 个文件
      - `dl_builtin_tik_tok/`  — 12 个文件
  - `fonts/`  — 106 个文件
- `scripts/`  — 18 个文件
- `src/`  — 179 个文件
  - `api/`  — 11 个文件
  - `components/`  — 25 个文件
    - `chat/`  — 5 个文件
    - `common/`  — 10 个文件
    - `layout/`  — 3 个文件
    - `mobile/`  — 1 个文件
    - `random-events/`  — 2 个文件
    - `settings/`  — 2 个文件
    - `story/`  — 1 个文件
    - `worldbook/`  — 1 个文件
  - `composables/`  — 1 个文件
  - `core/`  — 69 个文件
  - `data/`  — 1 个文件
  - `i18n/`  — 3 个文件
    - `locales/`  — 2 个文件
  - `router/`  — 1 个文件
  - `runtime/`  — 11 个文件
  - `services/`  — 6 个文件
  - `storage/`  — 7 个文件
  - `stores/`  — 16 个文件
  - `styles/`  — 7 个文件
  - `types/`  — 1 个文件
  - `utils/`  — 1 个文件
  - `views/`  — 15 个文件
- `src-tauri/`  — 65 个文件
  - `capabilities/`  — 1 个文件
  - `icons/`  — 49 个文件
    - `android/`  — 15 个文件
      - `mipmap-hdpi/`  — 3 个文件
      - `mipmap-mdpi/`  — 3 个文件
      - `mipmap-xhdpi/`  — 3 个文件
      - `mipmap-xxhdpi/`  — 3 个文件
      - `mipmap-xxxhdpi/`  — 3 个文件
    - `ios/`  — 18 个文件
  - `src/`  — 11 个文件
    - `commands/`  — 5 个文件
    - `storage/`  — 1 个文件
- `tests/`  — 123 个文件
  - `accessibility/`  — 3 个文件
  - `api/`  — 8 个文件
  - `core/`  — 67 个文件
  - `runtime/`  — 1 个文件
  - `services/`  — 8 个文件
  - `storage/`  — 4 个文件
  - `stores/`  — 22 个文件
  - `views/`  — 8 个文件
```

## 二、文件索引

### 2.1 程序（192）

| 相对路径 | 文件类型 | 分类 | 用途说明 | Git状态 | 备注 |
| --- | --- | --- | --- | --- | --- |
| `index.html` | html | 程序 | Vite 入口 HTML，挂载 #app | 已跟踪 |  |
| `src-tauri/build.rs` | rs | 程序 | Tauri 构建脚本（tauri-build） | 已跟踪 |  |
| `src-tauri/src/commands/app_info.rs` | rs | 程序 | 命令：应用信息 | 已跟踪 |  |
| `src-tauri/src/commands/chat_stream.rs` | rs | 程序 | 命令：流式对话（SSE 转发） | 已跟踪 |  |
| `src-tauri/src/commands/fetch_models.rs` | rs | 程序 | 命令：模型列表拉取 | 已跟踪 |  |
| `src-tauri/src/commands/fs_commands.rs` | rs | 程序 | 命令：文件系统读写 | 已跟踪 |  |
| `src-tauri/src/commands/mod.rs` | rs | 程序 | Tauri 命令模块出口 | 已跟踪 |  |
| `src-tauri/src/error.rs` | rs | 程序 | Rust 统一错误类型 | 已跟踪 |  |
| `src-tauri/src/lib.rs` | rs | 程序 | Rust 库入口与命令注册 | 已跟踪 |  |
| `src-tauri/src/main.rs` | rs | 程序 | Rust 主入口 | 已跟踪 |  |
| `src-tauri/src/shortcut.rs` | rs | 程序 | 全局快捷键 | 已跟踪 |  |
| `src-tauri/src/storage/mod.rs` | rs | 程序 | Rust 侧文件存储模块 | 已跟踪 |  |
| `src-tauri/src/tray.rs` | rs | 程序 | 系统托盘 | 已跟踪 |  |
| `src/App.vue` | vue | 程序 | 根组件：全局布局、主题注入、移动端适配 | 已跟踪 |  |
| `src/api/anthropic-client.ts` | ts | 程序 | Anthropic 协议客户端 | 已跟踪 |  |
| `src/api/anthropic-protocol.ts` | ts | 程序 | Anthropic 协议报文构造与解析 | 已跟踪 |  |
| `src/api/api-client.ts` | ts | 程序 | 统一 API 客户端抽象 | 已跟踪 |  |
| `src/api/diagnostics.ts` | ts | 程序 | API 连通性诊断与错误归类 | 已跟踪 |  |
| `src/api/index.ts` | ts | 程序 | API 层出口，按运行环境选择客户端实现 | 已跟踪 |  |
| `src/api/local-api-client.ts` | ts | 程序 | 本地模型 API 客户端（web-llm 引擎） | 已跟踪 |  |
| `src/api/openai-client.ts` | ts | 程序 | OpenAI 协议客户端 | 已跟踪 |  |
| `src/api/openai-protocol.ts` | ts | 程序 | OpenAI 协议报文构造与解析 | 已跟踪 |  |
| `src/api/reasoning-capability.ts` | ts | 程序 | 模块：reasoning-capability（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/api/tauri-openai-client.ts` | ts | 程序 | Tauri 侧 OpenAI 兼容客户端 | 已跟踪 |  |
| `src/api/types.ts` | ts | 程序 | API 请求/响应类型定义 | 已跟踪 |  |
| `src/components/chat/ChatMain.vue` | vue | 程序 | 组件：对话主区域 | 已跟踪 |  |
| `src/components/chat/MessageBubble.vue` | vue | 程序 | 组件：消息气泡（Markdown 渲染） | 已跟踪 |  |
| `src/components/chat/NewConversationModal.vue` | vue | 程序 | 组件：新建对话弹窗 | 已跟踪 |  |
| `src/components/chat/StatusHud.vue` | vue | 程序 | 组件：StatusHud（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/components/chat/ThinkingBlock.vue` | vue | 程序 | 组件：ThinkingBlock（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/components/common/ApiErrorModal.vue` | vue | 程序 | 通用组件：API 错误提示弹窗 | 已跟踪 |  |
| `src/components/common/Avatar.vue` | vue | 程序 | 通用组件：头像 | 已跟踪 |  |
| `src/components/common/FilterTabs.vue` | vue | 程序 | 通用组件：筛选标签页 | 已跟踪 |  |
| `src/components/common/Icon.vue` | vue | 程序 | 通用组件：图标 | 已跟踪 |  |
| `src/components/common/MasterPasswordModal.vue` | vue | 程序 | 通用组件：主密码输入弹窗 | 已跟踪 |  |
| `src/components/common/Modal.vue` | vue | 程序 | 通用组件：模态框 | 已跟踪 |  |
| `src/components/common/OnboardingModal.vue` | vue | 程序 | 通用组件：新手引导弹窗 | 已跟踪 |  |
| `src/components/common/SegmentedControl.vue` | vue | 程序 | 组件：SegmentedControl（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/components/common/Toast.vue` | vue | 程序 | 通用组件：轻提示 | 已跟踪 |  |
| `src/components/common/icons.ts` | ts | 程序 | 图标路径常量表 | 已跟踪 |  |
| `src/components/layout/CharacterList.vue` | vue | 程序 | 布局：角色列表侧栏 | 已跟踪 |  |
| `src/components/layout/ContextPanel.vue` | vue | 程序 | 布局：上下文信息面板 | 已跟踪 |  |
| `src/components/layout/NavRail.vue` | vue | 程序 | 布局：桌面端侧边导航 | 已跟踪 |  |
| `src/components/mobile/BottomNav.vue` | vue | 程序 | 布局：移动端底部导航 | 已跟踪 |  |
| `src/components/random-events/SceneConfigModal.vue` | vue | 程序 | 组件：随机事件场景配置 | 已跟踪 |  |
| `src/components/random-events/TemplateEditorModal.vue` | vue | 程序 | 组件：随机事件模板编辑器 | 已跟踪 |  |
| `src/components/settings/SettingsModelPanel.vue` | vue | 程序 | 组件：设置-模型面板 | 已跟踪 |  |
| `src/components/settings/VectorModelPanel.vue` | vue | 程序 | 组件：设置-向量模型面板 | 已跟踪 |  |
| `src/components/story/StoryTimeConfigPanel.vue` | vue | 程序 | 组件：剧情时间轴配置面板 | 已跟踪 |  |
| `src/components/worldbook/WorldBookEventsPanel.vue` | vue | 程序 | 组件：世界书事件面板 | 已跟踪 |  |
| `src/composables/useScrollLock.ts` | ts | 程序 | 组合式函数：滚动锁定 | 已跟踪 |  |
| `src/core/api-key-crypto.ts` | ts | 程序 | API Key 加密存储 | 已跟踪 |  |
| `src/core/audit-log.ts` | ts | 程序 | 操作审计日志 | 已跟踪 |  |
| `src/core/backup-crypto.ts` | ts | 程序 | 备份加密（拒绝明文密钥导出） | 已跟踪 |  |
| `src/core/backup.ts` | ts | 程序 | 全量备份与恢复核心逻辑 | 已跟踪 |  |
| `src/core/benchmark.ts` | ts | 程序 | 性能基准测量 | 已跟踪 |  |
| `src/core/character-card.ts` | ts | 程序 | 角色卡模型与解析（含 SillyTavern 兼容） | 已跟踪 |  |
| `src/core/character-generator.ts` | ts | 程序 | AI 角色生成 | 已跟踪 |  |
| `src/core/character-version-control.ts` | ts | 程序 | 角色卡版本控制 | 已跟踪 |  |
| `src/core/community-market.ts` | ts | 程序 | 社区市场客户端 | 已跟踪 |  |
| `src/core/compression.ts` | ts | 程序 | 内容压缩算法 | 已跟踪 |  |
| `src/core/data-bank.ts` | ts | 程序 | 数据银行（素材库） | 已跟踪 |  |
| `src/core/document-chunker.ts` | ts | 程序 | 文档分块器 | 已跟踪 |  |
| `src/core/dual-channel-runtime.ts` | ts | 程序 | 双通道运行时 | 已跟踪 |  |
| `src/core/embedding.ts` | ts | 程序 | 嵌入向量计算封装 | 已跟踪 |  |
| `src/core/event-types.ts` | ts | 程序 | 事件类型定义 | 已跟踪 |  |
| `src/core/extension-loader.ts` | ts | 程序 | 扩展加载器 | 已跟踪 |  |
| `src/core/extension-types.ts` | ts | 程序 | 扩展类型定义 | 已跟踪 |  |
| `src/core/group-chat.ts` | ts | 程序 | 群聊逻辑 | 已跟踪 |  |
| `src/core/image-generation.ts` | ts | 程序 | 图像生成调用封装 | 已跟踪 |  |
| `src/core/image-storage.ts` | ts | 程序 | 生成图片的本地存储 | 已跟踪 |  |
| `src/core/inference-cache.ts` | ts | 程序 | 推理结果缓存 | 已跟踪 |  |
| `src/core/json-utils.ts` | ts | 程序 | JSON 安全读写工具 | 已跟踪 |  |
| `src/core/l0-l2-runtime.ts` | ts | 程序 | L0–L2 三层优化运行时（上下文结构 / 压缩 / 输出纪律） | 已跟踪 |  |
| `src/core/local-model-engine.ts` | ts | 程序 | 本地模型推理引擎（web-llm） | 已跟踪 |  |
| `src/core/lorebook-scanner.ts` | ts | 程序 | 世界书关键词触发扫描 | 已跟踪 |  |
| `src/core/lorebook.ts` | ts | 程序 | 世界书（Lorebook）数据模型 | 已跟踪 |  |
| `src/core/macro.ts` | ts | 程序 | 宏变量替换（{{char}} / {{user}} 等） | 已跟踪 |  |
| `src/core/market-index.ts` | ts | 程序 | 社区市场索引解析 | 已跟踪 |  |
| `src/core/memory-store.ts` | ts | 程序 | 长期记忆存储 | 已跟踪 |  |
| `src/core/mobile-nav.ts` | ts | 程序 | 移动端导航状态管理 | 已跟踪 |  |
| `src/core/model-file-adapter.ts` | ts | 程序 | 模型文件读写适配（AppData/model 目录） | 已跟踪 |  |
| `src/core/npc-generator.ts` | ts | 程序 | NPC 生成 | 已跟踪 |  |
| `src/core/onnx-embedding-provider.ts` | ts | 程序 | ONNX Runtime Web 嵌入提供方 | 已跟踪 |  |
| `src/core/optimization-pipeline.ts` | ts | 程序 | 上下文优化流水线 | 已跟踪 |  |
| `src/core/output-discipline.ts` | ts | 程序 | 输出纪律约束（L2） | 已跟踪 |  |
| `src/core/prompt-builder.ts` | ts | 程序 | 提示词组装（角色 / 世界书 / 记忆拼接） | 已修改 |  |
| `src/core/protagonist.ts` | ts | 程序 | 主角设定管理 | 已跟踪 |  |
| `src/core/rag-benchmark.ts` | ts | 程序 | RAG 检索质量基准测试 | 已跟踪 |  |
| `src/core/rag-retriever.ts` | ts | 程序 | RAG 检索器：向量召回与上下文注入 | 已跟踪 |  |
| `src/core/random-event-generator.ts` | ts | 程序 | 随机事件生成 | 已跟踪 |  |
| `src/core/sanitize.ts` | ts | 程序 | HTML 净化（DOMPurify 封装，防 XSS） | 已跟踪 |  |
| `src/core/slash-command.ts` | ts | 程序 | 斜杠命令解析与执行 | 已跟踪 |  |
| `src/core/st-compat.ts` | ts | 程序 | SillyTavern 数据格式兼容层 | 已跟踪 |  |
| `src/core/status-parser.ts` | ts | 程序 | 模块：status-parser（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/core/status-prompt.ts` | ts | 程序 | 模块：status-prompt（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/core/status-schema.ts` | ts | 程序 | 模块：status-schema（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/core/stopword-filter.ts` | ts | 程序 | 停用词过滤（RAG 增强） | 已跟踪 |  |
| `src/core/storage-persistence.ts` | ts | 程序 | Web/PWA 持久化授权（navigator.storage.persist，降低 IndexedDB 被驱逐风险） | 已跟踪 |  |
| `src/core/story-analyzer.ts` | ts | 程序 | 剧情分析器 | 已跟踪 |  |
| `src/core/story-importer.ts` | ts | 程序 | 剧情导入器 | 已跟踪 |  |
| `src/core/story-templates.ts` | ts | 程序 | 剧情模板库 | 已跟踪 |  |
| `src/core/story-time.ts` | ts | 程序 | 剧情时间轴管理 | 已跟踪 |  |
| `src/core/story-types.ts` | ts | 程序 | 剧情引擎类型定义 | 已跟踪 |  |
| `src/core/summarizer.ts` | ts | 程序 | 对话摘要生成 | 已跟踪 |  |
| `src/core/theme-extractor.ts` | ts | 程序 | 主题色提取 | 已跟踪 |  |
| `src/core/thinking-parser.ts` | ts | 程序 | 模块：thinking-parser（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/core/token-counter.ts` | ts | 程序 | Token 计数（gpt-tokenizer） | 已跟踪 |  |
| `src/core/tool-registry.ts` | ts | 程序 | 工具/函数调用注册表 | 已跟踪 |  |
| `src/core/trigger-engine.ts` | ts | 程序 | 触发器引擎 | 已跟踪 |  |
| `src/core/user-model-bridge.ts` | ts | 程序 | 用户自备模型桥接 | 已跟踪 |  |
| `src/core/variable-store.ts` | ts | 程序 | 运行时变量存储 | 已跟踪 |  |
| `src/core/vector-model-install.ts` | ts | 程序 | 向量模型安装流程 | 已跟踪 |  |
| `src/core/vector-model-manager.ts` | ts | 程序 | 向量模型管理器 | 已跟踪 |  |
| `src/core/vector-model-source.ts` | ts | 程序 | 向量模型来源映射 | 已跟踪 |  |
| `src/core/vector-model-storage.ts` | ts | 程序 | 向量模型本地存储 | 已跟踪 |  |
| `src/core/vector-model-tauri.ts` | ts | 程序 | 向量模型 Tauri 侧扫描（PRESCAN_DIRS 含 model/） | 已跟踪 |  |
| `src/core/viewport.ts` | ts | 程序 | 视口/断点唯一来源（matchMedia 仅允许出现在此文件） | 已跟踪 |  |
| `src/core/world-generator.ts` | ts | 程序 | 世界观生成 | 已跟踪 |  |
| `src/core/world-setting-chunker.ts` | ts | 程序 | 世界设定分块器 | 已跟踪 |  |
| `src/data/mock-data.ts` | ts | 程序 | 开发/测试用示例数据 | 已跟踪 |  |
| `src/i18n/index.ts` | ts | 程序 | i18n 初始化（vue-i18n） | 已跟踪 |  |
| `src/i18n/locales/en.ts` | ts | 程序 | 英文文案表 | 已跟踪 |  |
| `src/i18n/locales/zh.ts` | ts | 程序 | 中文文案表 | 已跟踪 |  |
| `src/main.ts` | ts | 程序 | 应用引导入口：创建 Vue 实例、注册 Pinia 与路由 | 已跟踪 |  |
| `src/router/index.ts` | ts | 程序 | Vue Router 路由表 | 已跟踪 |  |
| `src/runtime/character-compiler.ts` | ts | 程序 | Virtual Character OS Archetype + Delta + Seed Memories 编译器 | 已修改 |  |
| `src/runtime/chat-bridge.ts` | ts | 程序 | Virtual Character OS 聊天链路 Runtime Context 与 Event 桥接 | 未跟踪 |  |
| `src/runtime/context-builder.ts` | ts | 程序 | Virtual Character OS 上下文构建器 | 已跟踪 |  |
| `src/runtime/emotion-engine.ts` | ts | 程序 | Virtual Character OS 情绪衰减、Episode 与 Salience 引擎 | 已跟踪 |  |
| `src/runtime/index.ts` | ts | 程序 | Virtual Character OS Runtime 统一出口 | 已修改 |  |
| `src/runtime/postgres-store.ts` | ts | 程序 | Virtual Character OS PostgreSQL RuntimeStore 与事务边界 | 未跟踪 |  |
| `src/runtime/project-runtime.ts` | ts | 程序 | AI 酒馆项目级 Runtime 工厂 | 已跟踪 |  |
| `src/runtime/runtime-api.ts` | ts | 程序 | Virtual Character OS 运行时 API 适配器 | 已跟踪 |  |
| `src/runtime/runtime-core.ts` | ts | 程序 | Virtual Character OS Runtime Core 状态归约主链 | 已修改 |  |
| `src/runtime/store.ts` | ts | 程序 | Virtual Character OS Runtime Snapshot 存储接口与适配器 | 已跟踪 |  |
| `src/runtime/types.ts` | ts | 程序 | Virtual Character OS Runtime 领域类型与 API 契约 | 已修改 |  |
| `src/services/backup-service.ts` | ts | 程序 | 备份导出/导入服务 | 已跟踪 |  |
| `src/services/chat-error.ts` | ts | 程序 | 对话错误类型与用户提示映射 | 已跟踪 |  |
| `src/services/chat-manager.ts` | ts | 程序 | 对话流程编排（发送 / 流式接收 / 重试） | 已修改 |  |
| `src/services/translator.ts` | ts | 程序 | 翻译服务 | 已跟踪 |  |
| `src/services/tts-service.ts` | ts | 程序 | 语音合成服务 | 已跟踪 |  |
| `src/services/type-adapters.ts` | ts | 程序 | 第三方数据格式适配 | 已跟踪 |  |
| `src/shims-vue.d.ts` | ts | 程序 | *.vue 模块类型声明 | 已跟踪 |  |
| `src/storage/index.ts` | ts | 程序 | 存储层出口，按环境选择适配器 | 已跟踪 |  |
| `src/storage/indexeddb-adapter.ts` | ts | 程序 | IndexedDB 存储适配器（Web 端） | 已跟踪 |  |
| `src/storage/legacy-migration.ts` | ts | 程序 | 历史数据格式迁移 | 已跟踪 |  |
| `src/storage/storage-adapter.ts` | ts | 程序 | 存储适配器接口定义 | 已跟踪 |  |
| `src/storage/storage-factory.ts` | ts | 程序 | 存储适配器工厂（Web / Tauri 分流） | 已跟踪 |  |
| `src/storage/tauri-fs-adapter.ts` | ts | 程序 | Tauri 文件系统存储适配器（桌面端） | 已跟踪 |  |
| `src/storage/types.ts` | ts | 程序 | 存储层接口与数据类型 | 已跟踪 |  |
| `src/stores/character-version.ts` | ts | 程序 | 状态存储：角色卡版本历史 | 已跟踪 |  |
| `src/stores/character.ts` | ts | 程序 | 状态存储：角色卡列表与当前角色 | 已跟踪 |  |
| `src/stores/chat-context.ts` | ts | 程序 | 状态存储：对话上下文绑定（角色 / 世界书） | 已跟踪 |  |
| `src/stores/chat.ts` | ts | 程序 | 状态存储：会话与消息管理 | 已跟踪 |  |
| `src/stores/community-market.ts` | ts | 程序 | 状态存储：社区市场 | 已跟踪 |  |
| `src/stores/data-bank.ts` | ts | 程序 | 状态存储：数据银行素材 | 已跟踪 |  |
| `src/stores/events.ts` | ts | 程序 | 状态存储：全局事件总线 | 已跟踪 |  |
| `src/stores/group-chat.ts` | ts | 程序 | 状态存储：群聊 | 已跟踪 |  |
| `src/stores/image-generation.ts` | ts | 程序 | 状态存储：图像生成任务 | 已跟踪 |  |
| `src/stores/local-model.ts` | ts | 程序 | 状态存储：本地模型加载状态 | 已跟踪 |  |
| `src/stores/lorebook.ts` | ts | 程序 | 状态存储：世界书 | 已跟踪 |  |
| `src/stores/persona.ts` | ts | 程序 | 状态存储：用户 Persona | 已跟踪 |  |
| `src/stores/random-events.ts` | ts | 程序 | 状态存储：随机事件 | 已跟踪 |  |
| `src/stores/settings.ts` | ts | 程序 | 状态存储：应用设置（含主密码加密与 API Profile） | 已跟踪 |  |
| `src/stores/story.ts` | ts | 程序 | 状态存储：剧情引擎 | 已跟踪 |  |
| `src/stores/user-vector-model.ts` | ts | 程序 | 状态存储：用户自备向量模型 | 已跟踪 |  |
| `src/styles/app-global.css` | css | 程序 | 应用全局样式 | 已跟踪 |  |
| `src/styles/base.css` | css | 程序 | 基础样式重置 | 已跟踪 |  |
| `src/styles/layout.css` | css | 程序 | 布局样式 | 已跟踪 |  |
| `src/styles/responsive.css` | css | 程序 | 响应式断点样式（口径统一 640px） | 已跟踪 |  |
| `src/styles/themes.css` | css | 程序 | 内置 5 套主题变量 | 已跟踪 |  |
| `src/styles/tokens-responsive.css` | css | 程序 | 响应式设计令牌 | 已跟踪 |  |
| `src/styles/tokens.css` | css | 程序 | 设计令牌（颜色/间距/字号） | 已跟踪 |  |
| `src/types/index.ts` | ts | 程序 | 全局共享类型定义 | 已跟踪 |  |
| `src/utils/onboarding.ts` | ts | 程序 | 新手引导状态读写（完成标志值为 "1"） | 已跟踪 |  |
| `src/views/ArchivesView.vue` | vue | 程序 | 页面：归档 | 已跟踪 |  |
| `src/views/CharacterEditorView.vue` | vue | 程序 | 页面：角色编辑 | 已跟踪 |  |
| `src/views/CharacterVersionView.vue` | vue | 程序 | 页面：角色版本管理 | 已跟踪 |  |
| `src/views/CharactersView.vue` | vue | 程序 | 页面：角色列表 | 已跟踪 |  |
| `src/views/ChatView.vue` | vue | 程序 | 页面：对话主界面 | 已跟踪 |  |
| `src/views/CommunityMarketView.vue` | vue | 程序 | 页面：社区市场 | 已跟踪 |  |
| `src/views/DataBankView.vue` | vue | 程序 | 页面：数据银行 | 已跟踪 |  |
| `src/views/GroupChatView.vue` | vue | 程序 | 页面：群聊 | 已跟踪 |  |
| `src/views/ImageGeneratorView.vue` | vue | 程序 | 页面：图像生成 | 已跟踪 |  |
| `src/views/LocalModelView.vue` | vue | 程序 | 页面：本地模型管理 | 已跟踪 |  |
| `src/views/ProfileView.vue` | vue | 程序 | 页面：用户档案 | 已跟踪 |  |
| `src/views/RandomEventsView.vue` | vue | 程序 | 页面：随机事件 | 已跟踪 |  |
| `src/views/SettingsView.vue` | vue | 程序 | 页面：设置中心（含数据管理与安全） | 已跟踪 |  |
| `src/views/StoryEngineView.vue` | vue | 程序 | 页面：剧情引擎 | 已跟踪 |  |
| `src/views/WorldBookView.vue` | vue | 程序 | 页面：世界书管理 | 已跟踪 |  |
| `src/vite-env.d.ts` | ts | 程序 | Vite 环境变量与静态资源类型声明 | 已跟踪 |  |

### 2.2 测试（134）

| 相对路径 | 文件类型 | 分类 | 用途说明 | Git状态 | 备注 |
| --- | --- | --- | --- | --- | --- |
| `e2e/backup-restore.spec.ts` | ts | 测试 | E2E 测试：backup-restore 场景 | 已跟踪 |  |
| `e2e/character-crud.spec.ts` | ts | 测试 | E2E 测试：character-crud 场景 | 已跟踪 |  |
| `e2e/chat-flow.spec.ts` | ts | 测试 | E2E 测试：chat-flow 场景 | 已跟踪 |  |
| `e2e/contrast-axe.spec.ts` | ts | 测试 | E2E 测试：contrast-axe 场景 | 已跟踪 |  |
| `e2e/custom-theme-contrast.spec.ts` | ts | 测试 | E2E 测试：custom-theme-contrast 场景 | 已跟踪 |  |
| `e2e/i18n-locale.spec.ts` | ts | 测试 | E2E 测试：i18n-locale 场景 | 已跟踪 |  |
| `e2e/mobile/mobile-layout.spec.ts` | ts | 测试 | E2E 测试：mobile-layout 场景 | 已跟踪 |  |
| `e2e/storage-state.json` | json | 测试 | E2E 预置 localStorage（跳过新手引导） | 已跟踪 |  |
| `e2e/theme-flow.spec.ts` | ts | 测试 | E2E 测试：theme-flow 场景 | 已跟踪 |  |
| `e2e/theme-visual.spec.ts` | ts | 测试 | E2E 测试：theme-visual 场景 | 已跟踪 |  |
| `e2e/worldbook-flow.spec.ts` | ts | 测试 | E2E 测试：worldbook-flow 场景 | 已跟踪 |  |
| `tests/accessibility/axe-helper.ts` | ts | 测试 | 单元测试：axe-helper.ts 模块 | 已跟踪 |  |
| `tests/accessibility/components-axe.test.ts` | ts | 测试 | 单元测试：components-axe 模块 | 已跟踪 |  |
| `tests/accessibility/worldbook-group-axe.test.ts` | ts | 测试 | 单元测试：worldbook-group-axe 模块 | 已跟踪 |  |
| `tests/api/anthropic-client.test.ts` | ts | 测试 | 单元测试：anthropic-client 模块 | 已跟踪 |  |
| `tests/api/diagnostics.test.ts` | ts | 测试 | 单元测试：diagnostics 模块 | 已跟踪 |  |
| `tests/api/llm-controls-p0.qa-independent.test.ts` | ts | 测试 | 单元测试：llm-controls-p0.qa-independent 模块 | 已跟踪 |  |
| `tests/api/local-api-client.test.ts` | ts | 测试 | 单元测试：local-api-client 模块 | 已跟踪 |  |
| `tests/api/openai-client.test.ts` | ts | 测试 | 单元测试：openai-client 模块 | 已跟踪 |  |
| `tests/api/reasoning-capability.test.ts` | ts | 测试 | 单元测试：reasoning-capability 模块 | 已跟踪 |  |
| `tests/api/tauri-openai-client.test.ts` | ts | 测试 | 单元测试：tauri-openai-client 模块 | 已跟踪 |  |
| `tests/api/usage-reasoning-tokens.qa-independent.test.ts` | ts | 测试 | 单元测试：usage-reasoning-tokens.qa-independent 模块 | 已跟踪 |  |
| `tests/core/api-key-crypto.test.ts` | ts | 测试 | 单元测试：api-key-crypto 模块 | 已跟踪 |  |
| `tests/core/audit-log.test.ts` | ts | 测试 | 单元测试：audit-log 模块 | 已跟踪 |  |
| `tests/core/backup-crypto.test.ts` | ts | 测试 | 单元测试：backup-crypto 模块 | 已跟踪 |  |
| `tests/core/benchmark.test.ts` | ts | 测试 | 单元测试：benchmark 模块 | 已跟踪 |  |
| `tests/core/character-attributes.test.ts` | ts | 测试 | 单元测试：character-attributes 模块 | 已跟踪 |  |
| `tests/core/character-card.test.ts` | ts | 测试 | 单元测试：character-card 模块 | 已跟踪 |  |
| `tests/core/character-generator.test.ts` | ts | 测试 | 单元测试：character-generator 模块 | 已跟踪 |  |
| `tests/core/character-version-control.test.ts` | ts | 测试 | 单元测试：character-version-control 模块 | 已跟踪 |  |
| `tests/core/community-market.test.ts` | ts | 测试 | 单元测试：community-market 模块 | 已跟踪 |  |
| `tests/core/compression.test.ts` | ts | 测试 | 单元测试：compression 模块 | 已跟踪 |  |
| `tests/core/document-chunker.test.ts` | ts | 测试 | 单元测试：document-chunker 模块 | 已跟踪 |  |
| `tests/core/dual-channel-runtime.test.ts` | ts | 测试 | 单元测试：dual-channel-runtime 模块 | 已跟踪 |  |
| `tests/core/embedding.test.ts` | ts | 测试 | 单元测试：embedding 模块 | 已跟踪 |  |
| `tests/core/event-types.test.ts` | ts | 测试 | 单元测试：event-types 模块 | 已跟踪 |  |
| `tests/core/extension-loader.test.ts` | ts | 测试 | 单元测试：extension-loader 模块 | 已跟踪 |  |
| `tests/core/image-generation.test.ts` | ts | 测试 | 单元测试：image-generation 模块 | 已跟踪 |  |
| `tests/core/inference-cache.test.ts` | ts | 测试 | 单元测试：inference-cache 模块 | 已跟踪 |  |
| `tests/core/json-utils.test.ts` | ts | 测试 | 单元测试：json-utils 模块 | 已跟踪 |  |
| `tests/core/l0-l2-runtime.test.ts` | ts | 测试 | 单元测试：l0-l2-runtime 模块 | 已跟踪 |  |
| `tests/core/local-model-engine.test.ts` | ts | 测试 | 单元测试：local-model-engine 模块 | 已跟踪 |  |
| `tests/core/lorebook-hierarchy.test.ts` | ts | 测试 | 单元测试：lorebook-hierarchy 模块 | 已跟踪 |  |
| `tests/core/lorebook-scanner.test.ts` | ts | 测试 | 单元测试：lorebook-scanner 模块 | 已跟踪 |  |
| `tests/core/macro.test.ts` | ts | 测试 | 单元测试：macro 模块 | 已跟踪 |  |
| `tests/core/market-index-integration.test.ts` | ts | 测试 | 单元测试：market-index-integration 模块 | 已跟踪 |  |
| `tests/core/market-index.test.ts` | ts | 测试 | 单元测试：market-index 模块 | 已跟踪 |  |
| `tests/core/memory-store.test.ts` | ts | 测试 | 单元测试：memory-store 模块 | 已跟踪 |  |
| `tests/core/mobile-nav.test.ts` | ts | 测试 | 单元测试：mobile-nav 模块 | 已跟踪 |  |
| `tests/core/npc-generator.test.ts` | ts | 测试 | 单元测试：npc-generator 模块 | 已跟踪 |  |
| `tests/core/onnx-real-model.test.ts` | ts | 测试 | 单元测试：onnx-real-model 模块 | 已跟踪 |  |
| `tests/core/optimization-pipeline.test.ts` | ts | 测试 | 单元测试：optimization-pipeline 模块 | 已跟踪 |  |
| `tests/core/output-discipline.test.ts` | ts | 测试 | 单元测试：output-discipline 模块 | 已跟踪 |  |
| `tests/core/prompt-builder.lorebook.test.ts` | ts | 测试 | 单元测试：prompt-builder.lorebook 模块 | 已跟踪 |  |
| `tests/core/prompt-builder.test.ts` | ts | 测试 | 单元测试：prompt-builder 模块 | 已跟踪 |  |
| `tests/core/protagonist.test.ts` | ts | 测试 | 单元测试：protagonist 模块 | 已跟踪 |  |
| `tests/core/rag-benchmark.test.ts` | ts | 测试 | 单元测试：rag-benchmark 模块 | 已跟踪 |  |
| `tests/core/rag-retriever.test.ts` | ts | 测试 | 单元测试：rag-retriever 模块 | 已跟踪 |  |
| `tests/core/random-event-generator.test.ts` | ts | 测试 | 单元测试：random-event-generator 模块 | 已跟踪 |  |
| `tests/core/random-event-templates.test.ts` | ts | 测试 | 单元测试：random-event-templates 模块 | 已跟踪 |  |
| `tests/core/sanitize.test.ts` | ts | 测试 | 单元测试：sanitize 模块 | 已跟踪 |  |
| `tests/core/slash-command.test.ts` | ts | 测试 | 单元测试：slash-command 模块 | 已跟踪 |  |
| `tests/core/st-compat.test.ts` | ts | 测试 | 单元测试：st-compat 模块 | 已跟踪 |  |
| `tests/core/status-parser.qa-independent.test.ts` | ts | 测试 | 单元测试：status-parser.qa-independent 模块 | 已跟踪 |  |
| `tests/core/status-parser.test.ts` | ts | 测试 | 单元测试：status-parser 模块 | 已跟踪 |  |
| `tests/core/status-prompt.test.ts` | ts | 测试 | 单元测试：status-prompt 模块 | 已跟踪 |  |
| `tests/core/status-schema.test.ts` | ts | 测试 | 单元测试：status-schema 模块 | 已跟踪 |  |
| `tests/core/stopword-filter.test.ts` | ts | 测试 | 单元测试：stopword-filter 模块 | 已跟踪 |  |
| `tests/core/storage-persistence.test.ts` | ts | 测试 | 单元测试：storage-persistence 模块 | 已跟踪 |  |
| `tests/core/story-analyzer.test.ts` | ts | 测试 | 单元测试：story-analyzer 模块 | 已跟踪 |  |
| `tests/core/story-importer.test.ts` | ts | 测试 | 单元测试：story-importer 模块 | 已跟踪 |  |
| `tests/core/story-templates.test.ts` | ts | 测试 | 单元测试：story-templates 模块 | 已跟踪 |  |
| `tests/core/story-time.test.ts` | ts | 测试 | 单元测试：story-time 模块 | 已跟踪 |  |
| `tests/core/story.test.ts` | ts | 测试 | 单元测试：story 模块 | 已跟踪 |  |
| `tests/core/summarizer.test.ts` | ts | 测试 | 单元测试：summarizer 模块 | 已跟踪 |  |
| `tests/core/theme-contrast.test.ts` | ts | 测试 | 单元测试：theme-contrast 模块 | 已跟踪 |  |
| `tests/core/theme-extractor.test.ts` | ts | 测试 | 单元测试：theme-extractor 模块 | 已跟踪 |  |
| `tests/core/thinking-parser.qa-independent.test.ts` | ts | 测试 | 单元测试：thinking-parser.qa-independent 模块 | 已跟踪 |  |
| `tests/core/thinking-parser.test.ts` | ts | 测试 | 单元测试：thinking-parser 模块 | 已跟踪 |  |
| `tests/core/token-counter.test.ts` | ts | 测试 | 单元测试：token-counter 模块 | 已跟踪 |  |
| `tests/core/tool-registry.test.ts` | ts | 测试 | 单元测试：tool-registry 模块 | 已跟踪 |  |
| `tests/core/trigger-engine.test.ts` | ts | 测试 | 单元测试：trigger-engine 模块 | 已跟踪 |  |
| `tests/core/variable-store.test.ts` | ts | 测试 | 单元测试：variable-store 模块 | 已跟踪 |  |
| `tests/core/vector-model-install.test.ts` | ts | 测试 | 单元测试：vector-model-install 模块 | 已跟踪 |  |
| `tests/core/vector-model-manager.test.ts` | ts | 测试 | 单元测试：vector-model-manager 模块 | 已跟踪 |  |
| `tests/core/vector-model-source.test.ts` | ts | 测试 | 单元测试：vector-model-source 模块 | 已跟踪 |  |
| `tests/core/vector-model-storage.test.ts` | ts | 测试 | 单元测试：vector-model-storage 模块 | 已跟踪 |  |
| `tests/core/world-generator.test.ts` | ts | 测试 | 单元测试：world-generator 模块 | 已跟踪 |  |
| `tests/core/world-setting-chunker.test.ts` | ts | 测试 | 单元测试：world-setting-chunker 模块 | 已跟踪 |  |
| `tests/i18n.test.ts` | ts | 测试 | 单元测试：i18n 模块 | 已跟踪 |  |
| `tests/runtime/runtime-core.test.ts` | ts | 测试 | 单元测试：runtime-core 模块 | 已修改 |  |
| `tests/services/backup-service.test.ts` | ts | 测试 | 单元测试：backup-service 模块 | 已跟踪 |  |
| `tests/services/chat-error.test.ts` | ts | 测试 | 单元测试：chat-error 模块 | 已跟踪 |  |
| `tests/services/chat-manager.test.ts` | ts | 测试 | 单元测试：chat-manager 模块 | 已修改 |  |
| `tests/services/llm-controls-p0.qa-independent.test.ts` | ts | 测试 | 单元测试：llm-controls-p0.qa-independent 模块 | 已跟踪 |  |
| `tests/services/status-hud-p1.qa-independent.test.ts` | ts | 测试 | 单元测试：status-hud-p1.qa-independent 模块 | 已跟踪 |  |
| `tests/services/translator.test.ts` | ts | 测试 | 单元测试：translator 模块 | 已跟踪 |  |
| `tests/services/tts-service.test.ts` | ts | 测试 | 单元测试：tts-service 模块 | 已跟踪 |  |
| `tests/services/type-adapters.test.ts` | ts | 测试 | 单元测试：type-adapters 模块 | 已跟踪 |  |
| `tests/setup.ts` | ts | 测试 | Vitest 全局测试环境初始化 | 已跟踪 |  |
| `tests/storage/indexeddb-adapter.test.ts` | ts | 测试 | 单元测试：indexeddb-adapter 模块 | 已跟踪 |  |
| `tests/storage/storage-contract.test.ts` | ts | 测试 | 单元测试：storage-contract 模块 | 已跟踪 |  |
| `tests/storage/storage-factory.test.ts` | ts | 测试 | 单元测试：storage-factory 模块 | 已跟踪 |  |
| `tests/storage/tauri-fs-adapter.test.ts` | ts | 测试 | 单元测试：tauri-fs-adapter 模块 | 已跟踪 |  |
| `tests/stores/character-generate.test.ts` | ts | 测试 | 单元测试：character-generate 模块 | 已跟踪 |  |
| `tests/stores/character-version.test.ts` | ts | 测试 | 单元测试：character-version 模块 | 已跟踪 |  |
| `tests/stores/character.test.ts` | ts | 测试 | 单元测试：character 模块 | 已跟踪 |  |
| `tests/stores/chat-context.test.ts` | ts | 测试 | 单元测试：chat-context 模块 | 已跟踪 |  |
| `tests/stores/chat-llm-controls.test.ts` | ts | 测试 | 单元测试：chat-llm-controls 模块 | 已跟踪 |  |
| `tests/stores/chat-p0-thinking.qa-independent.test.ts` | ts | 测试 | 单元测试：chat-p0-thinking.qa-independent 模块 | 已跟踪 |  |
| `tests/stores/chat.test.ts` | ts | 测试 | 单元测试：chat 模块 | 已跟踪 |  |
| `tests/stores/community-market.test.ts` | ts | 测试 | 单元测试：community-market 模块 | 已跟踪 |  |
| `tests/stores/context-length.test.ts` | ts | 测试 | 单元测试：context-length 模块 | 已跟踪 |  |
| `tests/stores/data-bank.test.ts` | ts | 测试 | 单元测试：data-bank 模块 | 已跟踪 |  |
| `tests/stores/events.test.ts` | ts | 测试 | 单元测试：events 模块 | 已跟踪 |  |
| `tests/stores/group-chat.test.ts` | ts | 测试 | 单元测试：group-chat 模块 | 已跟踪 |  |
| `tests/stores/local-model.test.ts` | ts | 测试 | 单元测试：local-model 模块 | 已跟踪 |  |
| `tests/stores/lorebook-hierarchy.test.ts` | ts | 测试 | 单元测试：lorebook-hierarchy 模块 | 已跟踪 |  |
| `tests/stores/master-password.test.ts` | ts | 测试 | 单元测试：master-password 模块 | 已跟踪 |  |
| `tests/stores/maxtokens-priority.qa-independent.test.ts` | ts | 测试 | 单元测试：maxtokens-priority.qa-independent 模块 | 已跟踪 |  |
| `tests/stores/persona.test.ts` | ts | 测试 | 单元测试：persona 模块 | 已跟踪 |  |
| `tests/stores/quick-reply.test.ts` | ts | 测试 | 单元测试：quick-reply 模块 | 已跟踪 |  |
| `tests/stores/random-events.test.ts` | ts | 测试 | 单元测试：random-events 模块 | 已跟踪 |  |
| `tests/stores/remote-embedding-key.test.ts` | ts | 测试 | 单元测试：remote-embedding-key 模块 | 已跟踪 |  |
| `tests/stores/settings.test.ts` | ts | 测试 | 单元测试：settings 模块 | 已跟踪 |  |
| `tests/stores/story.test.ts` | ts | 测试 | 单元测试：story 模块 | 已跟踪 |  |
| `tests/views/app-tauri-ux.test.ts` | ts | 测试 | 单元测试：app-tauri-ux 模块 | 已跟踪 |  |
| `tests/views/chat-ime.test.ts` | ts | 测试 | 单元测试：chat-ime 模块 | 已跟踪 |  |
| `tests/views/chat-main-window.test.ts` | ts | 测试 | 单元测试：chat-main-window 模块 | 已跟踪 |  |
| `tests/views/llm-controls-ui.test.ts` | ts | 测试 | 单元测试：llm-controls-ui 模块 | 已跟踪 |  |
| `tests/views/settings-local-model.test.ts` | ts | 测试 | 单元测试：settings-local-model 模块 | 已跟踪 |  |
| `tests/views/status-hud-ui.test.ts` | ts | 测试 | 单元测试：status-hud-ui 模块 | 已跟踪 |  |
| `tests/views/story-engine-quicksetup.test.ts` | ts | 测试 | 单元测试：story-engine-quicksetup 模块 | 已跟踪 |  |
| `tests/views/thinking-tokens-inline-status.qa-independent.test.ts` | ts | 测试 | 单元测试：thinking-tokens-inline-status.qa-independent 模块 | 已跟踪 |  |

### 2.3 产品文档（2）

| 相对路径 | 文件类型 | 分类 | 用途说明 | Git状态 | 备注 |
| --- | --- | --- | --- | --- | --- |
| `docs/product/AI酒馆开发计划文档.md` | md | 产品文档 | 产品文档：开发计划与任务台账 | 已忽略 |  |
| `public/sillytavern-vs-airoleplay.html` | html | 产品文档 | 静态页：SillyTavern vs ai-roleplay 系统化对比报告 | 已忽略 |  |

### 2.4 开发文档（23）

| 相对路径 | 文件类型 | 分类 | 用途说明 | Git状态 | 备注 |
| --- | --- | --- | --- | --- | --- |
| `CHANGELOG.md` | md | 开发文档 | 版本变更日志 | 已跟踪 |  |
| `CONTRIBUTING.md` | md | 开发文档 | 贡献指南 | 已跟踪 |  |
| `README-EN.md` | md | 开发文档 | 项目说明（英文版） | 已跟踪 |  |
| `README.md` | md | 开发文档 | 项目主说明（中文） | 已跟踪 |  |
| `THIRD_PARTY_NOTICES.md` | md | 开发文档 | 第三方组件许可声明 | 已跟踪 |  |
| `docs/dev/2026-09-20-LLM控制能力交付总览.md` | md | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/P2-11-virtualization-plan.md` | md | 开发文档 | 开发文档：P2-11 长对话虚拟化分批计划 | 已跟踪 |  |
| `docs/dev/b-type-findings.md` | md | 开发文档 | 开发文档：`!` 非空断言治理审计记录 | 已跟踪 |  |
| `docs/dev/character-status-hud-落地记录.md` | md | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/contrast-存量分类与收敛建议.md` | md | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/data-backup-restore.md` | md | 开发文档 | 开发文档：备份恢复与灾备演练 Runbook（P2-#3 修复交付） | 已跟踪 |  |
| `docs/dev/dialogue-pipeline-分析.md` | md | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/embedding-optimization-实现对照.md` | md | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/llm-controls-p0-落地记录.md` | md | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/llm-controls-收尾三项记录.md` | md | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/mobile-pwa-plan.md` | md | 开发文档 | 开发文档：手机端 PWA 实现计划 | 已跟踪 |  |
| `docs/dev/rag-enhancement-plan.md` | md | 开发文档 | 开发文档：RAG 增强实现计划 | 已跟踪 |  |
| `docs/dev/web-deployment-sop.md` | md | 开发文档 | 开发文档：Web 端部署 SOP（部署前验证 / 硬性要求 / 5 类托管配置 / 部署后验证 / 常见坑 / 回滚） | 已跟踪 |  |
| `docs/dev/优化效果评估脚本-使用说明.md` | md | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/优化能力激活-交付总结.md` | md | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/优化能力激活-后续路线图.md` | md | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/线上模型接入-G4-MeroMero-31B.md` | md | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `public/ai-roleplay-dev-plan.html` | html | 开发文档 | 开发文档（静态页）：AI 酒馆开发计划 | 已忽略 |  |

### 2.5 修复文档（13）

| 相对路径 | 文件类型 | 分类 | 用途说明 | Git状态 | 备注 |
| --- | --- | --- | --- | --- | --- |
| `docs/fixes/cross-client-review-2026-09-07.md` | md | 修复文档 | 修复文档：跨客户端评审报告（28 项缺陷来源） | 已跟踪 |  |
| `docs/fixes/goal-tracker.md` | md | 修复文档 | 修复文档：跨端一致性 28 项缺陷修复进度台账 | 已跟踪 |  |
| `docs/fixes/i7-mobile-control-font-size-fix-2026-09-20.md` | md | 修复文档 | 修复文档：I-7 移动端控件字号修复 + CSS 约定守卫合并（含真实浏览器实测数据） | 已跟踪 |  |
| `docs/fixes/pre-launch-check-aijiuguan-2026-08-15.md` | md | 修复文档 | 修复文档：上线前全检报告（2026-08-15） | 已跟踪 |  |
| `docs/fixes/pre-launch-check-aijiuguan-2026-08-17.md` | md | 修复文档 | 修复文档：6 维度全检报告（2026-08-17） | 已跟踪 |  |
| `docs/fixes/pre-launch-check-aijiuguan-2026-08-19.md` | md | 修复文档 | 修复文档：6 维度全检报告（2026-08-19） | 已跟踪 |  |
| `docs/fixes/pre-launch-check-aijiuguan-2026-09-21.md` | md | 修复文档 | 修复文档：上线前全检报告（代码审查 + 安全审计 + QA，2026-09-21） | 已跟踪 |  |
| `docs/fixes/runtime-core-baseline-verification-2026-09-22.md` | md | 修复文档 | 验证记录：Runtime Core 基线自动化验证 | 已修改 |  |
| `docs/fixes/web-sop-fix-batch1-report.md` | md | 修复文档 | 修复文档：Web SOP 修复第一批交付报告（修正失实声明） | 已跟踪 |  |
| `docs/fixes/web-sop-fix-batch2-report.md` | md | 修复文档 | 修复文档：Web SOP 修复第二批交付报告（补齐门禁） | 已跟踪 |  |
| `docs/fixes/web-sop-fix-batch3-report.md` | md | 修复文档 | 修复文档：Web SOP 修复第三批交付报告（安全与数据保障） | 已跟踪 |  |
| `docs/fixes/web-sop-fix-batch4-report.md` | md | 修复文档 | 修复文档：Web SOP 修复第四批交付报告（口径统一与流程固化） | 已跟踪 |  |
| `docs/fixes/web-sop-review-2026-09-18.md` | md | 修复文档 | 修复文档：Web 端 SOP 评审报告（完整性/准确性/一致性/可执行性四维） | 已跟踪 |  |

### 2.6 设计文档（13）

| 相对路径 | 文件类型 | 分类 | 用途说明 | Git状态 | 备注 |
| --- | --- | --- | --- | --- | --- |
| `docs/design/AI酒馆项目嵌入优化方案开发文档.md` | md | 设计文档 | 设计文档：嵌入优化方案（L0/L1/L2 三层） | 已忽略 |  |
| `docs/design/P2-9-csp-whitelist-report.md` | md | 设计文档 | 设计文档：P2-9 CSP / remote 白名单盘点与决策记录 | 已跟踪 |  |
| `docs/design/character-status-hud-增量设计.md` | md | 设计文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/design/design-system-specification.md` | md | 设计文档 | 设计文档：设计系统规范（令牌 / 组件 / 移动端） | 已跟踪 |  |
| `docs/design/e00-decision.md` | md | 设计文档 | 设计文档：E-00 嵌入优化形态决策 | 已跟踪 |  |
| `docs/design/llm-controls-p0-增量设计.md` | md | 设计文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/design/mobile-ui-design.md` | md | 设计文档 | 设计文档：移动端 UI 设计（页面功能明细） | 已跟踪 |  |
| `docs/design/rag-enhancement-design.md` | md | 设计文档 | 设计文档：RAG 增强设计 | 已跟踪 |  |
| `docs/design/runtime-core-基线设计.md` | md | 设计文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/design/software-design-document.md` | md | 设计文档 | 设计文档：软件设计说明书 | 已跟踪 |  |
| `docs/design/summarizer-接线设计.md` | md | 设计文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/design/threat-model.md` | md | 设计文档 | 设计文档：威胁模型（含提示词注入专项） | 已跟踪 |  |
| `docs/design/virtual-character-os-实现基线.md` | md | 设计文档 | 设计文档：Virtual Character OS 实现基线（Schema → Runtime → Emotion → Compiler → API） | 已修改 |  |

### 2.7 AI记忆（14）

| 相对路径 | 文件类型 | 分类 | 用途说明 | Git状态 | 备注 |
| --- | --- | --- | --- | --- | --- |
| `.workbuddy-ai/memory/2026-09-18.md` | md | AI记忆 | AI记忆：2026-09-18 工作日志 | 已忽略 |  |
| `.workbuddy-ai/memory/2026-09-20.md` | md | AI记忆 | AI记忆：2026-09-20 工作日志 | 已忽略 |  |
| `.workbuddy-ai/memory/2026-09-21.md` | md | AI记忆 | AI记忆：2026-09-21 工作日志 | 已忽略 |  |
| `.workbuddy-ai/memory/2026-09-22.md` | md | AI记忆 | AI记忆：2026-09-22 工作日志 | 已忽略 |  |
| `.workbuddy-ai/memory/MEMORY.md` | md | AI记忆 | AI记忆：项目长期约定与结论 | 已忽略 |  |
| `.workbuddy/memory/2026-08-13.md` | md | AI记忆 | AI记忆：2026-08-13 工作日志 | 已忽略 |  |
| `.workbuddy/memory/2026-08-14.md` | md | AI记忆 | AI记忆：2026-08-14 工作日志 | 已忽略 |  |
| `.workbuddy/memory/2026-08-15.md` | md | AI记忆 | AI记忆：2026-08-15 工作日志 | 已忽略 |  |
| `.workbuddy/memory/2026-08-17.md` | md | AI记忆 | AI记忆：2026-08-17 工作日志 | 已忽略 |  |
| `.workbuddy/memory/2026-08-18.md` | md | AI记忆 | AI记忆：2026-08-18 工作日志 | 已忽略 |  |
| `.workbuddy/memory/2026-08-19.md` | md | AI记忆 | AI记忆：2026-08-19 工作日志 | 已忽略 |  |
| `.workbuddy/memory/2026-08-20.md` | md | AI记忆 | AI记忆：2026-08-20 工作日志 | 已忽略 |  |
| `.workbuddy/memory/2026-09-07.md` | md | AI记忆 | AI记忆：2026-09-07 工作日志 | 已忽略 |  |
| `.workbuddy/memory/MEMORY.md` | md | AI记忆 | AI记忆：项目长期记忆（已归档的跨会话结论） | 已忽略 |  |

### 2.8 截图（1）

| 相对路径 | 文件类型 | 分类 | 用途说明 | Git状态 | 备注 |
| --- | --- | --- | --- | --- | --- |
| `docs/assets/screenshots/` | 目录聚合 | 截图 | UI 冒烟截图（按路由与主题命名，由 scripts/ui-shot.mjs 生成）（共 110 个文件） | 已忽略 |  |

### 2.9 配置（17）

| 相对路径 | 文件类型 | 分类 | 用途说明 | Git状态 | 备注 |
| --- | --- | --- | --- | --- | --- |
| `.gitattributes` | gitattributes | 配置 | Git 属性（换行符与 LFS 规则，本地保留） | 已忽略 |  |
| `.github/workflows/ci.yml` | yml | 配置 | CI 流水线：i18n / 断点 / 对比度 / 覆盖率 / 构建 / E2E / Tauri 七道门禁 | 已跟踪 |  |
| `.gitignore` | gitignore | 配置 | Git 忽略规则（本地保留，不提交） | 已忽略 |  |
| `.i18nignore` | i18nignore | 配置 | i18n 扫描忽略清单 | 已忽略 |  |
| `eslint.config.js` | js | 配置 | ESLint 扁平配置（Vue + TS） | 已跟踪 |  |
| `package-lock.json` | json | 配置 | npm 依赖锁定文件（自动生成） | 已跟踪 |  |
| `package.json` | json | 配置 | npm 清单：依赖、脚本、项目元信息（ai-roleplay v0.2.0） | 已跟踪 |  |
| `playwright.config.ts` | ts | 配置 | Playwright E2E 配置：testDir=e2e、本地 msedge / CI chromium | 已跟踪 |  |
| `reasonix.toml` | toml | 配置 | Reasonix 工具工作区配置 | 已跟踪 |  |
| `src-tauri/.gitignore` | gitignore | 配置 | 桌面端专属忽略规则 | 已跟踪 |  |
| `src-tauri/Cargo.toml` | toml | 配置 | Rust 依赖与 crate 元信息 | 已跟踪 |  |
| `src-tauri/capabilities/default.json` | json | 配置 | Tauri 2 权限能力声明 | 已跟踪 |  |
| `src-tauri/icons/` | 目录聚合 | 配置 | Tauri 应用图标资源（桌面 / Android / iOS 多尺寸 PNG / ICO / ICNS）（共 49 个文件） | 未跟踪 |  |
| `src-tauri/tauri.conf.json` | json | 配置 | Tauri 应用配置（窗口 / 打包 / 更新签名公钥） | 已跟踪 |  |
| `tsconfig.json` | json | 配置 | TypeScript 编译选项与路径映射 | 已跟踪 |  |
| `vite.config.ts` | ts | 配置 | Vite 构建配置：别名、代码分包、PWA 插件 | 已跟踪 |  |
| `vitest.config.ts` | ts | 配置 | Vitest 单测配置：jsdom 环境、覆盖率阈值门禁 | 已跟踪 |  |

### 2.10 脚本（18）

| 相对路径 | 文件类型 | 分类 | 用途说明 | Git状态 | 备注 |
| --- | --- | --- | --- | --- | --- |
| `scripts/breakpoint-guard.mjs` | mjs | 脚本 | 门禁：禁止野断点、断点数值 L1/L4 同步校验 | 已跟踪 |  |
| `scripts/check-contrast.mjs` | mjs | 脚本 | 门禁：5 套主题关键色对对比度 ≥ AA | 已跟踪 |  |
| `scripts/contrast-audit.mjs` | mjs | 脚本 | 审计：对比度全量扫描报告 | 已跟踪 |  |
| `scripts/csp-audit.mjs` | mjs | 脚本 | 工具：CSP 运行时审计（真实浏览器监听 securitypolicyviolation，手动诊断用） | 已跟踪 |  |
| `scripts/csp-guard.mjs` | mjs | 脚本 | 门禁：Web 端 CSP 契约校验（构建产物含 CSP、关键指令齐备、script-src 未被削弱） | 已跟踪 |  |
| `scripts/css-conventions-guard.mjs` | mjs | 脚本 | 门禁：CSS 约定守卫单一入口（编排断点 / 视口 / hover / !important / 控件字号五项子检查） | 已跟踪 |  |
| `scripts/css-viewport-guard.mjs` | mjs | 脚本 | 门禁：CSS 视口单位使用校验 | 已跟踪 |  |
| `scripts/gen-project-index.mjs` | mjs | 脚本 | 工具：生成本索引文件 | 已修改 |  |
| `scripts/generate-pwa-icons.mjs` | mjs | 脚本 | 工具：由 icon-source.png 生成 PWA 图标到 public/ | 已跟踪 |  |
| `scripts/hover-guard.mjs` | mjs | 脚本 | 门禁：禁止未按 (hover: hover) 分流的 :hover，防触屏 tap 后 hover 粘滞 | 已跟踪 |  |
| `scripts/i18n-scan.mjs` | mjs | 脚本 | 门禁：硬编码中文 UI 文案扫描（strict 模式） | 已跟踪 |  |
| `scripts/i7-control-font-size-guard.mjs` | mjs | 脚本 | 门禁：移动断点内可编辑控件字号 ≥16px 兜底（I-7，防 iOS 聚焦放大页面） | 已跟踪 |  |
| `scripts/important-guard.mjs` | mjs | 脚本 | 门禁：!important 棘轮守卫（基线锁定，只许降不许升） | 已跟踪 |  |
| `scripts/opt-eval.mjs` | mjs | 脚本 | 待确认 | 已跟踪 | 用途待确认 |
| `scripts/p11-baseline.mjs` | mjs | 脚本 | 测量：P11 性能基线采集 | 已跟踪 |  |
| `scripts/p11-scroll-fps.mjs` | mjs | 脚本 | 测量：滚动帧率采集 | 已跟踪 |  |
| `scripts/ui-shot.mjs` | mjs | 脚本 | 工具：遍历路由批量截图到 docs/assets/screenshots/ | 已跟踪 |  |
| `scripts/vendor-fonts.mjs` | mjs | 脚本 | 工具：把 Google Fonts 镜像到 public/fonts/，消除第三方字体请求（支持 --check 供校验） | 已跟踪 |  |

### 2.11 其他（30）

| 相对路径 | 文件类型 | 分类 | 用途说明 | Git状态 | 备注 |
| --- | --- | --- | --- | --- | --- |
| `LICENSE` | (无扩展名) | 其他 | Apache-2.0 许可证全文 | 已跟踪 |  |
| `MIGRATION_LOG.md` | md | 其他 | 目录整理迁移日志 | 已跟踪 |  |
| `PROJECT_INDEX.md` | md | 其他 | 本索引文件（由 scripts/gen-project-index.mjs 生成） | 已修改 | 索引文件（不递归展开） |
| `docs/Virtual-Character-OS-v1.0-database-schema.sql.md` | md | 其他 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/Virtual-Character-OS-v1.0-技术规格.md` | md | 其他 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/Virtual-Character-OS-v1.0-数据库-Schema-设计说明.md` | md | 其他 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/other/dialogue-experience-评估与选型建议.md` | md | 其他 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/other/dialogue-models-选型调研.md` | md | 其他 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/other/tifa-ollama-webui-产品分析.md` | md | 其他 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/other/tifa-ollama-webui-分析汇总.md` | md | 其他 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/other/tifa-ollama-webui-架构评审.md` | md | 其他 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/other/项目文档结构.md` | md | 其他 | 其他：项目文档分类规范 | 已跟踪 |  |
| `docs/对话记录.md` | md | 其他 | 待确认 | 已跟踪 | 用途待确认 |
| `icon-source.png` | png | 其他 | 应用图标设计源图（生成 PWA / Tauri 图标用） | 已跟踪 |  |
| `market/cards/seraphina.json` | json | 其他 | 社区市场示例：角色卡数据 | 已跟踪 |  |
| `market/index.json` | json | 其他 | 社区市场索引（角色卡 / 模板清单） | 已跟踪 |  |
| `market/items/character-echo.json` | json | 其他 | 社区市场条目：角色 Echo | 已跟踪 |  |
| `market/items/character-seraphina.json` | json | 其他 | 社区市场条目：角色 Seraphina | 已跟踪 |  |
| `market/items/template-apocalypse.json` | json | 其他 | 社区市场条目：末世题材模板 | 已跟踪 |  |
| `market/items/template-fantasy.json` | json | 其他 | 社区市场条目：奇幻题材模板 | 已跟踪 |  |
| `market/items/template-sci-fi.json` | json | 其他 | 社区市场条目：科幻题材模板 | 已跟踪 |  |
| `market/items/worldbook-midgard.json` | json | 其他 | 社区市场条目：世界书 Midgard | 已跟踪 |  |
| `public/apple-touch-icon.png` | png | 其他 | iOS 主屏图标 | 已跟踪 |  |
| `public/assets/hero-cyber-nexus.jpg` | jpg | 其他 | 首页主视觉图（赛博主题） | 已跟踪 |  |
| `public/assets/hero-seraphina.jpg` | jpg | 其他 | 首页主视觉图（角色主题） | 已跟踪 |  |
| `public/assets/icons/dl_builtin_tik_tok/` | 目录聚合 | 其他 | 内置线性图标集（SVG，11 个）（共 12 个文件） | 未跟踪 |  |
| `public/fonts/` | 目录聚合 | 其他 | 本地镜像字体分片（Playfair Display 拉丁 + Noto Serif SC 中文，105 个 unicode-range 分片；由 scripts/vendor-fonts.mjs 生成，不参与 PWA 预缓存）（共 106 个文件） | 未跟踪 |  |
| `public/pwa-192x192.png` | png | 其他 | PWA 图标 192×192 | 已跟踪 |  |
| `public/pwa-512x512.png` | png | 其他 | PWA 图标 512×512 | 已跟踪 |  |
| `public/pwa-icon.svg` | svg | 其他 | PWA 图标（矢量） | 已跟踪 |  |

## 三、分类汇总

| 分类 | 文件数 | 说明 |
| --- | --- | --- |
| 程序 | 192 | src/ 前端源码与 src-tauri/src/ Rust 源码、index.html |
| 测试 | 134 | tests/ 单元与组件测试、e2e/ Playwright 场景 |
| 产品文档 | 2 | docs/product/ 产品与项目规划材料 |
| 开发文档 | 23 | docs/dev/ 实现计划、Runbook、审计记录 |
| 修复文档 | 13 | docs/fixes/ 缺陷评审、修复交付与进度台账 |
| 设计文档 | 13 | docs/design/ 设计系统、软件设计、移动端设计、威胁模型、决策文档 |
| AI记忆 | 14 | .workbuddy/memory/ 与 .workbuddy-ai/memory/ 项目记忆与跨会话结论 |
| 截图 | 1 | docs/assets/screenshots/ 下 UI 冒烟截图 |
| 配置 | 17 | 构建、CI、Tauri 应用与根级工程配置 |
| 脚本 | 18 | scripts/ 门禁、审计与工具脚本 |
| 其他 | 30 | docs/other/ 文档体系规范，以及静态资源、市场数据、许可证、图标等 |
| **合计** | **457** | 与「收录文件」数一致 |

## 四、忽略清单

### 4.1 忽略的目录

| 目录 | 排除原因 |
| --- | --- |
| `.git/` | 版本控制元数据，非项目内容 |
| `node_modules/` | npm 依赖（24,086 个文件，645 MB） |
| `src-tauri/target/` | Rust 构建缓存（约 13 GB） |
| `src-tauri/gen/` | Tauri 自动生成的 schema（生成物） |
| `dist/` | Vite 生产构建输出（构建产物） |
| `artifacts/` | 历史构建 / 覆盖率 / 测试快照归档（构建与测试产物） |
| `coverage/` | Vitest 覆盖率报告（测试产物） |
| `test-results/` | Playwright 默认输出目录（测试产物） |
| `playwright-report/` | Playwright HTML 报告（测试产物，存在时） |
| `model/` | ONNX 向量模型权重（约 1.1 GB 大二进制） |
| `.reasonix/` | AI 工具（Reasonix）工作区状态；该目录已于 2026-09-18 从工作区消失，规则保留以兼容其重新生成 |
| `artifacts/backup/` | 目录整理与清理的回滚备份（.tar.gz，保留） |
| `.cache/ .nuxt/ .next/ .parcel-cache/ build/ out/ vendor/ .venv/ venv/ env/ __pycache__/` | 通用依赖与缓存目录（本项目未使用，按规范排除） |

### 4.2 忽略的文件

| 模式 | 排除原因 |
| --- | --- |
| `*.log` | 运行日志（debug.log 已归档至 artifacts/logs/） |
| `*.tmp` | 临时文件 |
| `*.lock / Cargo.lock` | 依赖锁定文件 |
| `.env / .env.*` | 环境变量文件（可能含密钥） |
| `*.pem / *.key / *.key.pub / *.p12 / *.pfx / *.crt / *.cer / *.der / *.jks / *.keystore` | 密钥与证书材料 —— 不读取内容、不列入表格 |
| `*.db / *.sqlite / *.sqlite3 / *.db-journal` | 数据库文件 |
| `*.onnx / *.bin / *.exe / *.dll / *.so / *.dylib / *.a / *.o / *.obj / *.rlib / *.rmeta / *.pdb` | 大二进制与编译产物 |
| `src-tauri/icons/ 下的 PNG / ICO / ICNS` | 同质化图片资源，已聚合为单行 |
| `public/assets/icons/dl_builtin_tik_tok/*.svg` | 同质化图标资源，已聚合为单行 |

> `src-tauri/keys/` 目录下的签名私钥与公钥文件按密钥类规则整体排除，本索引不记录其文件名与内容。

## 五、维护说明

重新生成索引：

```bash
node scripts/gen-project-index.mjs
```

要点：

1. 生成器位于 `scripts/gen-project-index.mjs`，本文件由它整体重写，请勿手工编辑表格区（改动会在下次生成时丢失）。
2. 新增文件后无需改脚本即可被收录；若其用途无法由命名推断，会在「用途说明」列标注「待确认」。
3. 要让新文件获得准确用途说明，在脚本的 `CURATED` 映射中按相对路径补一条即可。
4. 调整排除范围，修改脚本顶部的 `EXCLUDE_DIR_NAMES`、`EXCLUDE_REL_DIRS`、`EXCLUDE_FILE_RES`；同质化资源目录用 `AGGREGATE_DIRS` 聚合。
5. 生成器只读 git（`ls-files` / `status` / `check-ignore`），不会执行 `add` / `commit` / `push`。
6. 本文件全文使用相对路径；请勿在补充内容中写入绝对路径，以免泄露本机目录信息。
7. 目录结构变更请同步记录到 `MIGRATION_LOG.md`。
