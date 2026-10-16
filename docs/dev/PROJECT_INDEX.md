# PROJECT_INDEX

- **生成时间**：2026-10-16 18:56（本地时区）
- **项目根目录**：`.`（本文件所在目录；全文均为相对路径）
- **项目标识**：`ai-roleplay` v1.1.1 — AI 角色扮演与多模型对话平台（Tauri 2.0 原生封装 + Web 降级）
- **生成方式**：`node scripts/gen-project-index.mjs`（扫描文件系统 + 只读调用 git，不执行任何 git 写操作）
- **收录文件**：1249 个 ｜ **忽略目录**：13 类 ｜ **待确认用途**：647 个

> 用途说明来源：人工核对清单优先；未核对者按文件命名规则推断并标注「待确认」，不做臆测。
> 敏感文件（密钥 / 证书 / 环境变量）只记录排除原因，不读取内容、不列入表格。

## 一、目录树（仅目录，不展开依赖与产物目录）

```
ai-roleplay/
- `.github/`  — 1 个文件
  - `workflows/`  — 1 个文件
- `.workbuddy/`  — 12 个文件
  - `memory/`  — 12 个文件
- `.workbuddy-ai/`  — 6 个文件
  - `memory/`  — 6 个文件
- `android/`  — 334 个文件
  - `.gradle/`  — 4 个文件
    - `8.14.3/`  — 1 个文件
    - `buildOutputCleanup/`  — 1 个文件
    - `vcs-1/`  — 1 个文件
  - `app/`  — 314 个文件
    - `src/`  — 310 个文件
      - `androidTest/`  — 1 个文件
        - `java/`  — 1 个文件
          - `com/`  — 1 个文件
            - `getcapacitor/`  — 1 个文件
              - `myapp/`  — 1 个文件
      - `main/`  — 308 个文件
        - `assets/`  — 270 个文件
          - `public/`  — 268 个文件
            - `assets/`  — 153 个文件
              - `icons/`  — 12 个文件
                - `dl_builtin_tik_tok/`  — 12 个文件
            - `fonts/`  — 106 个文件
        - `java/`  — 1 个文件
          - `com/`  — 1 个文件
            - `zhuweib/`  — 1 个文件
              - `airoleplay/`  — 1 个文件
        - `res/`  — 36 个文件
          - `drawable/`  — 2 个文件
          - `drawable-land-hdpi/`  — 1 个文件
          - `drawable-land-mdpi/`  — 1 个文件
          - `drawable-land-xhdpi/`  — 1 个文件
          - `drawable-land-xxhdpi/`  — 1 个文件
          - `drawable-land-xxxhdpi/`  — 1 个文件
          - `drawable-port-hdpi/`  — 1 个文件
          - `drawable-port-mdpi/`  — 1 个文件
          - `drawable-port-xhdpi/`  — 1 个文件
          - `drawable-port-xxhdpi/`  — 1 个文件
          - `drawable-port-xxxhdpi/`  — 1 个文件
          - `drawable-v24/`  — 1 个文件
          - `layout/`  — 1 个文件
          - `mipmap-anydpi-v26/`  — 2 个文件
          - `mipmap-hdpi/`  — 3 个文件
          - `mipmap-mdpi/`  — 3 个文件
          - `mipmap-xhdpi/`  — 3 个文件
          - `mipmap-xxhdpi/`  — 3 个文件
          - `mipmap-xxxhdpi/`  — 3 个文件
          - `values/`  — 3 个文件
          - `xml/`  — 2 个文件
      - `test/`  — 1 个文件
        - `java/`  — 1 个文件
          - `com/`  — 1 个文件
            - `getcapacitor/`  — 1 个文件
              - `myapp/`  — 1 个文件
  - `capacitor-cordova-android-plugins/`  — 5 个文件
    - `src/`  — 3 个文件
      - `main/`  — 3 个文件
        - `java/`  — 1 个文件
        - `res/`  — 1 个文件
  - `gradle/`  — 2 个文件
    - `wrapper/`  — 2 个文件
- `docs/`  — 506 个文件
  - `assets/`  — 132 个文件
    - `screenshots/`  — 132 个文件
      - `themes/`  — 106 个文件
        - `light/`  — 21 个文件
        - `midnight/`  — 21 个文件
        - `oled/`  — 21 个文件
        - `terminal/`  — 22 个文件
        - `theatre/`  — 21 个文件
  - `design/`  — 187 个文件
    - `PSY_NARRATION_STYLE_2026-10-15/`  — 1 个文件
    - `THEME_5_GENERIC_PREVIEW/`  — 26 个文件
    - `THEME_ACG_PREVIEW/`  — 33 个文件
    - `THEME_BASE_PREVIEW/`  — 5 个文件
    - `THEME_BRUTAL_SHOTS/`  — 4 个文件
    - `ai-chat-ui-redesign/`  — 99 个文件
      - `components/`  — 3 个文件
      - `css/`  — 20 个文件
      - `docs/`  — 19 个文件
      - `js/`  — 4 个文件
      - `partials/`  — 4 个文件
      - `preview/`  — 25 个文件
      - `tools/`  — 9 个文件
  - `dev/`  — 160 个文件
    - `evidence/`  — 105 个文件
      - `round-3/`  — 17 个文件
        - `opt-7-chat-split/`  — 5 个文件
        - `opt-8-settings-split/`  — 12 个文件
          - `before-after-screenshots/`  — 7 个文件
      - `ux-ia-guided-flow/`  — 88 个文件
        - `m10-c-events-field-wiring/`  — 1 个文件
        - `m11-a-completion-keyword-label/`  — 1 个文件
        - `m12-a-version-deeplink/`  — 2 个文件
        - `m2-b7-nav-rail/`  — 5 个文件
        - `m2-b8-rail-prefs/`  — 4 个文件
        - `m2-b9-interaction-feedback/`  — 8 个文件
        - `m3-b0-gap-visibility/`  — 5 个文件
        - `m3-b2-empty-state/`  — 3 个文件
        - `m3-b3-quick-forms/`  — 5 个文件
        - `m4-b1-tips/`  — 2 个文件
        - `m4-b2-collapse/`  — 7 个文件
        - `m4-b4-edges/`  — 4 个文件
        - `m5-b1-guide/`  — 4 个文件
        - `m5-b2-in-feature/`  — 4 个文件
        - `m5-b3-onboarding/`  — 1 个文件
        - `m6-a-mode-switch/`  — 3 个文件
        - `m6-b-editor-collapse/`  — 2 个文件
        - `m6-b2-editor-formfield/`  — 4 个文件
        - `m6-e-group-header/`  — 3 个文件
        - `m6-f-primitives/`  — 2 个文件
        - `m7-a-two-views/`  — 5 个文件
        - `m7-b-reject-feedback/`  — 1 个文件
        - `m7-c-status-color/`  — 2 个文件
        - `m7-d-section-memory/`  — 1 个文件
        - `m8-a-preview-overlap/`  — 2 个文件
        - `m8-b-section-memory-per-entity/`  — 3 个文件
        - `m8-c-describedby/`  — 4 个文件
  - `fixes/`  — 17 个文件
  - `other/`  — 6 个文件
- `e2e/`  — 47 个文件
  - `mobile/`  — 5 个文件
- `eval/`  — 1 个文件
- `installer/`  — 1 个文件
- `market/`  — 8 个文件
  - `cards/`  — 1 个文件
  - `items/`  — 6 个文件
- `migrations/`  — 1 个文件
- `public/`  — 126 个文件
  - `assets/`  — 14 个文件
    - `icons/`  — 12 个文件
      - `dl_builtin_tik_tok/`  — 12 个文件
  - `fonts/`  — 106 个文件
- `scripts/`  — 43 个文件
  - `archive/`  — 8 个文件
    - `round3-settings-split/`  — 8 个文件
- `src/`  — 253 个文件
  - `api/`  — 13 个文件
  - `components/`  — 47 个文件
    - `character/`  — 1 个文件
    - `chat/`  — 11 个文件
    - `common/`  — 17 个文件
    - `layout/`  — 5 个文件
    - `mobile/`  — 1 个文件
    - `random-events/`  — 2 个文件
    - `settings/`  — 7 个文件
    - `story/`  — 1 个文件
    - `worldbook/`  — 2 个文件
  - `composables/`  — 4 个文件
  - `core/`  — 91 个文件
  - `data/`  — 1 个文件
  - `i18n/`  — 3 个文件
    - `locales/`  — 2 个文件
  - `router/`  — 1 个文件
  - `runtime/`  — 22 个文件
  - `services/`  — 8 个文件
  - `storage/`  — 9 个文件
  - `stores/`  — 20 个文件
  - `styles/`  — 8 个文件
  - `types/`  — 1 个文件
  - `utils/`  — 5 个文件
  - `views/`  — 16 个文件
- `src-tauri/`  — 66 个文件
  - `capabilities/`  — 1 个文件
  - `icons/`  — 49 个文件
    - `android/`  — 15 个文件
      - `mipmap-hdpi/`  — 3 个文件
      - `mipmap-mdpi/`  — 3 个文件
      - `mipmap-xhdpi/`  — 3 个文件
      - `mipmap-xxhdpi/`  — 3 个文件
      - `mipmap-xxxhdpi/`  — 3 个文件
    - `ios/`  — 18 个文件
  - `src/`  — 12 个文件
    - `commands/`  — 6 个文件
    - `storage/`  — 1 个文件
- `tests/`  — 218 个文件
  - `accessibility/`  — 7 个文件
  - `api/`  — 10 个文件
  - `components/`  — 22 个文件
    - `settings/`  — 1 个文件
  - `composables/`  — 2 个文件
  - `core/`  — 88 个文件
  - `runtime/`  — 9 个文件
  - `services/`  — 11 个文件
  - `storage/`  — 6 个文件
  - `stores/`  — 36 个文件
  - `tooling/`  — 2 个文件
  - `utils/`  — 2 个文件
  - `views/`  — 20 个文件
```

## 二、文件索引

### 2.1 程序（267）

| 相对路径 | 文件类型 | 分类 | 用途说明 | Git状态 | 备注 |
| --- | --- | --- | --- | --- | --- |
| `index.html` | html | 程序 | Vite 入口 HTML，挂载 #app | 已跟踪 |  |
| `src-tauri/build.rs` | rs | 程序 | Tauri 构建脚本（tauri-build） | 已跟踪 |  |
| `src-tauri/src/commands/app_info.rs` | rs | 程序 | 命令：应用信息 | 已跟踪 |  |
| `src-tauri/src/commands/chat_stream.rs` | rs | 程序 | 命令：流式对话（SSE 转发） | 已跟踪 |  |
| `src-tauri/src/commands/fetch_models.rs` | rs | 程序 | 命令：模型列表拉取 | 已跟踪 |  |
| `src-tauri/src/commands/fs_commands.rs` | rs | 程序 | 命令：文件系统读写 | 已跟踪 |  |
| `src-tauri/src/commands/mod.rs` | rs | 程序 | Tauri 命令模块出口 | 已跟踪 |  |
| `src-tauri/src/commands/model_files.rs` | rs | 程序 | 待确认 | 已跟踪 | 用途待确认 |
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
| `src/api/cors-probe.ts` | ts | 程序 | 模块：cors-probe（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/api/diagnostics.ts` | ts | 程序 | API 连通性诊断与错误归类 | 已跟踪 |  |
| `src/api/index.ts` | ts | 程序 | API 层出口，按运行环境选择客户端实现 | 已跟踪 |  |
| `src/api/llm-retry.ts` | ts | 程序 | 模块：llm-retry（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/api/local-api-client.ts` | ts | 程序 | 本地模型 API 客户端（web-llm 引擎） | 已跟踪 |  |
| `src/api/openai-client.ts` | ts | 程序 | OpenAI 协议客户端 | 已跟踪 |  |
| `src/api/openai-protocol.ts` | ts | 程序 | OpenAI 协议报文构造与解析 | 已跟踪 |  |
| `src/api/reasoning-capability.ts` | ts | 程序 | 模块：reasoning-capability（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/api/tauri-openai-client.ts` | ts | 程序 | Tauri 侧 OpenAI 兼容客户端 | 已跟踪 |  |
| `src/api/types.ts` | ts | 程序 | API 请求/响应类型定义 | 已跟踪 |  |
| `src/components/character/QuickCharacterForm.vue` | vue | 程序 | 组件：QuickCharacterForm（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/components/chat/ChatMain.vue` | vue | 程序 | 组件：对话主区域 | 已跟踪 |  |
| `src/components/chat/ChatModeSwitch.vue` | vue | 程序 | 组件：ChatModeSwitch（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/components/chat/EventTraceSummary.vue` | vue | 程序 | 组件：EventTraceSummary（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/components/chat/MessageActionSheet.vue` | vue | 程序 | 组件：MessageActionSheet（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/components/chat/MessageBubble.vue` | vue | 程序 | 组件：消息气泡（Markdown 渲染） | 已跟踪 |  |
| `src/components/chat/NewConversationModal.vue` | vue | 程序 | 组件：新建对话弹窗 | 已跟踪 |  |
| `src/components/chat/PromptTraceSummary.vue` | vue | 程序 | 组件：PromptTraceSummary（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/components/chat/RuntimeStatePanel.vue` | vue | 程序 | 组件：Runtime 最小状态查看与回放自检（单聊与群聊共用） | 已跟踪 |  |
| `src/components/chat/StatusHud.vue` | vue | 程序 | 组件：StatusHud（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/components/chat/ThinkingBlock.vue` | vue | 程序 | 组件：ThinkingBlock（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/components/chat/message-actions.ts` | ts | 程序 | 模块：message-actions（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/components/common/ApiErrorModal.vue` | vue | 程序 | 通用组件：API 错误提示弹窗 | 已跟踪 |  |
| `src/components/common/Avatar.vue` | vue | 程序 | 通用组件：头像 | 已跟踪 |  |
| `src/components/common/Collapse.vue` | vue | 程序 | 组件：Collapse（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/components/common/EmptyState.vue` | vue | 程序 | 组件：EmptyState（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/components/common/FilterTabs.vue` | vue | 程序 | 通用组件：筛选标签页 | 已跟踪 |  |
| `src/components/common/FormField.vue` | vue | 程序 | 组件：FormField（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/components/common/GuidedTasksCard.vue` | vue | 程序 | 组件：GuidedTasksCard（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/components/common/HelpTip.vue` | vue | 程序 | 组件：HelpTip（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/components/common/Icon.vue` | vue | 程序 | 通用组件：图标 | 已跟踪 |  |
| `src/components/common/MasterPasswordModal.vue` | vue | 程序 | 通用组件：主密码输入弹窗 | 已跟踪 |  |
| `src/components/common/Modal.vue` | vue | 程序 | 通用组件：模态框 | 已跟踪 |  |
| `src/components/common/OnboardingModal.vue` | vue | 程序 | 通用组件：新手引导弹窗 | 已跟踪 |  |
| `src/components/common/PrereqNotice.vue` | vue | 程序 | 组件：PrereqNotice（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/components/common/SegmentedControl.vue` | vue | 程序 | 组件：SegmentedControl（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/components/common/StepFlow.vue` | vue | 程序 | 组件：StepFlow（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/components/common/Toast.vue` | vue | 程序 | 通用组件：轻提示 | 已跟踪 |  |
| `src/components/common/icons.ts` | ts | 程序 | 图标路径常量表 | 已跟踪 |  |
| `src/components/layout/CharacterList.vue` | vue | 程序 | 布局：角色列表侧栏 | 已跟踪 |  |
| `src/components/layout/ContextPanel.vue` | vue | 程序 | 布局：上下文信息面板 | 已跟踪 |  |
| `src/components/layout/ContextReadinessBar.vue` | vue | 程序 | 组件：ContextReadinessBar（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/components/layout/ModuleRelationsPanel.vue` | vue | 程序 | 组件：ModuleRelationsPanel（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/components/layout/NavRail.vue` | vue | 程序 | 布局：桌面端侧边导航 | 已跟踪 |  |
| `src/components/mobile/BottomNav.vue` | vue | 程序 | 布局：移动端底部导航 | 已跟踪 |  |
| `src/components/random-events/SceneConfigModal.vue` | vue | 程序 | 组件：随机事件场景配置 | 已跟踪 |  |
| `src/components/random-events/TemplateEditorModal.vue` | vue | 程序 | 组件：随机事件模板编辑器 | 已跟踪 |  |
| `src/components/settings/SettingsAboutPanel.vue` | vue | 程序 | 组件：SettingsAboutPanel（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/components/settings/SettingsAppearancePanel.vue` | vue | 程序 | 组件：SettingsAppearancePanel（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/components/settings/SettingsDataPanel.vue` | vue | 程序 | 组件：SettingsDataPanel（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/components/settings/SettingsExtensionPanel.vue` | vue | 程序 | 组件：SettingsExtensionPanel（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/components/settings/SettingsModelPanel.vue` | vue | 程序 | 组件：设置-模型面板 | 已跟踪 |  |
| `src/components/settings/SettingsSecurityPanel.vue` | vue | 程序 | 组件：SettingsSecurityPanel（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/components/settings/VectorModelPanel.vue` | vue | 程序 | 组件：设置-向量模型面板 | 已跟踪 |  |
| `src/components/story/StoryTimeConfigPanel.vue` | vue | 程序 | 组件：剧情时间轴配置面板 | 已跟踪 |  |
| `src/components/worldbook/QuickLorebookFlow.vue` | vue | 程序 | 组件：QuickLorebookFlow（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/components/worldbook/WorldBookEventsPanel.vue` | vue | 程序 | 组件：世界书事件面板 | 已跟踪 |  |
| `src/composables/useDeepLinkId.ts` | ts | 程序 | 模块：useDeepLinkId（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/composables/useReadinessJump.ts` | ts | 程序 | 模块：useReadinessJump（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/composables/useScrollLock.ts` | ts | 程序 | 组合式函数：滚动锁定 | 已跟踪 |  |
| `src/composables/useSectionMemory.ts` | ts | 程序 | 模块：useSectionMemory（待确认具体功能） | 已跟踪 | 用途待确认 |
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
| `src/core/creation-preset.ts` | ts | 程序 | 模块：creation-preset（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/core/data-bank.ts` | ts | 程序 | 数据银行（素材库） | 已跟踪 |  |
| `src/core/deep-link-keys.ts` | ts | 程序 | 模块：deep-link-keys（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/core/document-chunker.ts` | ts | 程序 | 文档分块器 | 已跟踪 |  |
| `src/core/dual-channel-runtime.ts` | ts | 程序 | 双通道运行时 | 已跟踪 |  |
| `src/core/embedding.ts` | ts | 程序 | 嵌入向量计算封装 | 已跟踪 |  |
| `src/core/eval-judgment.ts` | ts | 程序 | 模块：eval-judgment（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/core/event-trace.ts` | ts | 程序 | 模块：event-trace（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/core/event-types.ts` | ts | 程序 | 事件类型定义 | 已跟踪 |  |
| `src/core/extension-loader.ts` | ts | 程序 | 扩展加载器 | 已跟踪 |  |
| `src/core/extension-types.ts` | ts | 程序 | 扩展类型定义 | 已跟踪 |  |
| `src/core/group-chat.ts` | ts | 程序 | 群聊逻辑 | 已跟踪 |  |
| `src/core/guided-tasks.ts` | ts | 程序 | 模块：guided-tasks（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/core/image-generation.ts` | ts | 程序 | 图像生成调用封装 | 已跟踪 |  |
| `src/core/image-storage.ts` | ts | 程序 | 生成图片的本地存储 | 已跟踪 |  |
| `src/core/inference-cache.ts` | ts | 程序 | 推理结果缓存 | 已跟踪 |  |
| `src/core/json-utils.ts` | ts | 程序 | JSON 安全读写工具 | 已跟踪 |  |
| `src/core/keyboard-inset.ts` | ts | 程序 | 键盘避让兜底：监听 visualViewport，把"键盘吃掉的高度"写成 --keyboard-inset，覆盖只缩视觉视口的引擎 | 已跟踪 |  |
| `src/core/l0-l2-runtime.ts` | ts | 程序 | L0–L2 三层优化运行时（上下文结构 / 压缩 / 输出纪律） | 已跟踪 |  |
| `src/core/local-model-engine.ts` | ts | 程序 | 本地模型推理引擎（web-llm） | 已跟踪 |  |
| `src/core/lorebook-scanner.ts` | ts | 程序 | 世界书关键词触发扫描 | 已跟踪 |  |
| `src/core/lorebook.ts` | ts | 程序 | 世界书（Lorebook）数据模型 | 已跟踪 |  |
| `src/core/macro.ts` | ts | 程序 | 宏变量替换（{{char}} / {{user}} 等） | 已跟踪 |  |
| `src/core/market-index.ts` | ts | 程序 | 社区市场索引解析 | 已跟踪 |  |
| `src/core/memory-store.ts` | ts | 程序 | 长期记忆存储 | 已跟踪 |  |
| `src/core/message-search.ts` | ts | 程序 | 核心模块：完整消息搜索、结果片段与虚拟化窗口定位 | 已跟踪 |  |
| `src/core/mobile-nav.ts` | ts | 程序 | 移动端导航状态管理 | 已跟踪 |  |
| `src/core/model-file-adapter.ts` | ts | 程序 | 模型文件读写适配（AppData/model 目录） | 已跟踪 |  |
| `src/core/model-fs-ipc.ts` | ts | 程序 | 模块：model-fs-ipc（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/core/narration.ts` | ts | 程序 | 心理活动分段解析：parseNarrationSegments / stripNarrationMarkers / buildNarrationRules（⟦…⟧ 存在消息原文里，渲染层拆成气泡外段落） | 已跟踪 |  |
| `src/core/native-sw-cleanup.ts` | ts | 程序 | 模块：native-sw-cleanup（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/core/nav-model.ts` | ts | 程序 | 模块：nav-model（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/core/npc-generator.ts` | ts | 程序 | NPC 生成 | 已跟踪 |  |
| `src/core/onnx-embedding-provider.ts` | ts | 程序 | ONNX Runtime Web 嵌入提供方 | 已跟踪 |  |
| `src/core/optimization-pipeline.ts` | ts | 程序 | 上下文优化流水线 | 已跟踪 |  |
| `src/core/output-discipline.ts` | ts | 程序 | 输出纪律约束（L2） | 已跟踪 |  |
| `src/core/preset-input.ts` | ts | 程序 | 模块：preset-input（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/core/prompt-builder.ts` | ts | 程序 | 提示词组装（角色 / 世界书 / 记忆拼接） | 已跟踪 |  |
| `src/core/protagonist.ts` | ts | 程序 | 主角设定管理 | 已跟踪 |  |
| `src/core/rag-benchmark.ts` | ts | 程序 | RAG 检索质量基准测试 | 已跟踪 |  |
| `src/core/rag-model-catalog.ts` | ts | 程序 | 模块：rag-model-catalog（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/core/rag-retriever.ts` | ts | 程序 | RAG 检索器：向量召回与上下文注入 | 已跟踪 |  |
| `src/core/rail-prefs.ts` | ts | 程序 | 模块：rail-prefs（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/core/random-event-generator.ts` | ts | 程序 | 随机事件生成 | 已跟踪 |  |
| `src/core/range-fill.ts` | ts | 程序 | 模块：range-fill（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/core/readiness.ts` | ts | 程序 | 模块：readiness（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/core/relations.ts` | ts | 程序 | 模块：relations（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/core/remote-api-key-state.ts` | ts | 程序 | 模块：remote-api-key-state（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/core/sanitize.ts` | ts | 程序 | HTML 净化（DOMPurify 封装，防 XSS） | 已跟踪 |  |
| `src/core/schema-contract.ts` | ts | 程序 | 模块：schema-contract（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/core/slash-command.ts` | ts | 程序 | 斜杠命令解析与执行 | 已跟踪 |  |
| `src/core/st-compat.ts` | ts | 程序 | SillyTavern 数据格式兼容层 | 已跟踪 |  |
| `src/core/status-parser.ts` | ts | 程序 | 模块：status-parser（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/core/status-prompt.ts` | ts | 程序 | 模块：status-prompt（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/core/status-schema.ts` | ts | 程序 | 模块：status-schema（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/core/stopword-filter.ts` | ts | 程序 | 停用词过滤（RAG 增强） | 已跟踪 |  |
| `src/core/storage-persistence.ts` | ts | 程序 | Web/PWA 持久化授权（navigator.storage.persist，降低 IndexedDB 被驱逐风险） | 已跟踪 |  |
| `src/core/store-merge.ts` | ts | 程序 | 模块：store-merge（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/core/story-analyzer.ts` | ts | 程序 | 剧情分析器 | 已跟踪 |  |
| `src/core/story-importer.ts` | ts | 程序 | 剧情导入器 | 已跟踪 |  |
| `src/core/story-templates.ts` | ts | 程序 | 剧情模板库 | 已跟踪 |  |
| `src/core/story-time.ts` | ts | 程序 | 剧情时间轴管理 | 已跟踪 |  |
| `src/core/story-types.ts` | ts | 程序 | 剧情引擎类型定义 | 已跟踪 |  |
| `src/core/summarizer.ts` | ts | 程序 | 对话摘要生成 | 已跟踪 |  |
| `src/core/theme-extractor.ts` | ts | 程序 | 主题色提取 | 已跟踪 |  |
| `src/core/thinking-parser.ts` | ts | 程序 | 模块：thinking-parser（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/core/tip.ts` | ts | 程序 | 模块：tip（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/core/token-budget.ts` | ts | 程序 | 模块：token-budget（待确认具体功能） | 已跟踪 | 用途待确认 |
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
| `src/runtime/appraisal-engine.ts` | ts | 程序 | 模块：appraisal-engine（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/runtime/behavior-planner.ts` | ts | 程序 | 模块：behavior-planner（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/runtime/character-compiler.ts` | ts | 程序 | Virtual Character OS Archetype + Delta + Seed Memories 编译器 | 已跟踪 |  |
| `src/runtime/chat-bridge.ts` | ts | 程序 | Virtual Character OS 聊天链路 Runtime Context 与 Event 桥接 | 已跟踪 |  |
| `src/runtime/context-builder.ts` | ts | 程序 | Virtual Character OS 上下文构建器 | 已跟踪 |  |
| `src/runtime/emotion-engine.ts` | ts | 程序 | Virtual Character OS 情绪衰减、Episode 与 Salience 引擎 | 已跟踪 |  |
| `src/runtime/group-runtime-contract.ts` | ts | 程序 | Virtual Character OS 浏览器与服务端共享群聊类型及领域错误，不含 SQL 依赖 | 已跟踪 |  |
| `src/runtime/index.ts` | ts | 程序 | Virtual Character OS Runtime 统一出口 | 已跟踪 |  |
| `src/runtime/postgres-executor.ts` | ts | 程序 | node-postgres Pool 到 SqlExecutor 的事务适配器（服务端专用） | 已跟踪 |  |
| `src/runtime/postgres-group-runtime.ts` | ts | 程序 | Virtual Character OS PostgreSQL 群组事务、成员授权与多角色 Event 证据关联 | 已跟踪 |  |
| `src/runtime/postgres-store.ts` | ts | 程序 | Virtual Character OS PostgreSQL RuntimeStore 与事务边界 | 已跟踪 |  |
| `src/runtime/project-runtime.ts` | ts | 程序 | AI 酒馆项目级 Runtime 工厂 | 已跟踪 |  |
| `src/runtime/runtime-api.ts` | ts | 程序 | Virtual Character OS 运行时 API 适配器 | 已跟踪 |  |
| `src/runtime/runtime-auth.ts` | ts | 程序 | 模块：runtime-auth（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/runtime/runtime-core.ts` | ts | 程序 | Virtual Character OS Runtime Core 状态归约主链 | 已跟踪 |  |
| `src/runtime/runtime-group-http.ts` | ts | 程序 | Virtual Character OS 群聊 HTTP 客户端与 Fetch Handler | 已跟踪 |  |
| `src/runtime/runtime-http.ts` | ts | 程序 | Virtual Character OS 单角色 HTTP 客户端与 Fetch Handler | 已跟踪 |  |
| `src/runtime/runtime-id.ts` | ts | 程序 | Virtual Character OS 跨适配器稳定 UUID 与会话 Turn ID 规则 | 已跟踪 |  |
| `src/runtime/runtime-trace.ts` | ts | 程序 | 模块：runtime-trace（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/runtime/server-runtime.ts` | ts | 程序 | Virtual Character OS 服务端 Runtime 与群聊事务组合入口 | 已跟踪 |  |
| `src/runtime/store.ts` | ts | 程序 | Virtual Character OS Runtime Snapshot 存储接口与适配器 | 已跟踪 |  |
| `src/runtime/types.ts` | ts | 程序 | Virtual Character OS Runtime 领域类型与 API 契约 | 已跟踪 |  |
| `src/services/backup-service.ts` | ts | 程序 | 备份导出/导入服务 | 已跟踪 |  |
| `src/services/chat-error.ts` | ts | 程序 | 对话错误类型与用户提示映射 | 已跟踪 |  |
| `src/services/chat-manager.ts` | ts | 程序 | 对话流程编排（发送 / 流式接收 / 重试） | 已跟踪 |  |
| `src/services/group-chat-prompt.ts` | ts | 程序 | 群聊提示词组装（公共历史窗口与成员名单，隔离其他成员私有记忆） | 已跟踪 |  |
| `src/services/group-chat-runtime.ts` | ts | 程序 | 群聊发言选择与旁听 Event 投递规则 | 已跟踪 |  |
| `src/services/translator.ts` | ts | 程序 | 翻译服务 | 已跟踪 |  |
| `src/services/tts-service.ts` | ts | 程序 | 语音合成服务 | 已跟踪 |  |
| `src/services/type-adapters.ts` | ts | 程序 | 第三方数据格式适配 | 已跟踪 |  |
| `src/shims-vue.d.ts` | ts | 程序 | *.vue 模块类型声明 | 已跟踪 |  |
| `src/storage/index.ts` | ts | 程序 | 存储层出口，按环境选择适配器 | 已跟踪 |  |
| `src/storage/indexeddb-adapter.ts` | ts | 程序 | IndexedDB 存储适配器（Web 端） | 已跟踪 |  |
| `src/storage/legacy-migration.ts` | ts | 程序 | 历史数据格式迁移 | 已跟踪 |  |
| `src/storage/snapshot-migration.ts` | ts | 程序 | 模块：snapshot-migration（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/storage/snapshot-plans.ts` | ts | 程序 | 模块：snapshot-plans（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/storage/storage-adapter.ts` | ts | 程序 | 存储适配器接口定义 | 已跟踪 |  |
| `src/storage/storage-factory.ts` | ts | 程序 | 存储适配器工厂（Web / Tauri 分流） | 已跟踪 |  |
| `src/storage/tauri-fs-adapter.ts` | ts | 程序 | Tauri 文件系统存储适配器（桌面端） | 已跟踪 |  |
| `src/storage/types.ts` | ts | 程序 | 存储层接口与数据类型 | 已跟踪 |  |
| `src/stores/character-version.ts` | ts | 程序 | 状态存储：角色卡版本历史 | 已跟踪 |  |
| `src/stores/character.ts` | ts | 程序 | 状态存储：角色卡列表与当前角色 | 已跟踪 |  |
| `src/stores/chat-context.ts` | ts | 程序 | 状态存储：对话上下文绑定（角色 / 世界书） | 已跟踪 |  |
| `src/stores/chat-generation.ts` | ts | 程序 | 模块：chat-generation（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/stores/chat-group-runtime.ts` | ts | 程序 | 模块：chat-group-runtime（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/stores/chat-memory.ts` | ts | 程序 | 模块：chat-memory（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/stores/chat-runtime.ts` | ts | 程序 | 模块：chat-runtime（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/stores/chat-session.ts` | ts | 程序 | 模块：chat-session（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/stores/chat.ts` | ts | 程序 | 状态存储：会话与消息管理 | 已跟踪 |  |
| `src/stores/community-market.ts` | ts | 程序 | 状态存储：社区市场 | 已跟踪 |  |
| `src/stores/data-bank.ts` | ts | 程序 | 状态存储：数据银行素材 | 已跟踪 |  |
| `src/stores/events.ts` | ts | 程序 | 状态存储：全局事件总线 | 已跟踪 |  |
| `src/stores/group-chat.ts` | ts | 程序 | 状态存储：群聊 | 已跟踪 |  |
| `src/stores/image-generation.ts` | ts | 程序 | 状态存储：图像生成任务 | 已跟踪 |  |
| `src/stores/local-model.ts` | ts | 程序 | 状态存储：本地模型加载状态 | 已跟踪 |  |
| `src/stores/lorebook.ts` | ts | 程序 | 状态存储：世界书 | 已跟踪 |  |
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
| `src/styles/tokens-structure.css` | css | 程序 | 待确认 | 已跟踪 | 用途待确认 |
| `src/styles/tokens.css` | css | 程序 | 设计令牌（颜色/间距/字号） | 已跟踪 |  |
| `src/types/index.ts` | ts | 程序 | 全局共享类型定义 | 已跟踪 |  |
| `src/utils/logger.ts` | ts | 程序 | 模块：logger（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/utils/master-password-modal-state.ts` | ts | 程序 | 模块：master-password-modal-state（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/utils/onboarding.ts` | ts | 程序 | 新手引导状态读写（完成标志值为 "1"） | 已跟踪 |  |
| `src/utils/save-blob.ts` | ts | 程序 | 存盘唯一入口（原生 WebView 里 blob + a[download] 静默失效，由 check:save-blob 守卫盯住，基线 0） | 已跟踪 |  |
| `src/utils/toast-service.ts` | ts | 程序 | 模块：toast-service（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/views/ArchivesView.vue` | vue | 程序 | 页面：归档 | 已跟踪 |  |
| `src/views/CharacterEditorView.vue` | vue | 程序 | 页面：角色编辑 | 已跟踪 |  |
| `src/views/CharacterVersionView.vue` | vue | 程序 | 页面：角色版本管理 | 已跟踪 |  |
| `src/views/CharactersView.vue` | vue | 程序 | 页面：角色列表 | 已跟踪 |  |
| `src/views/ChatView.vue` | vue | 程序 | 页面：对话主界面 | 已跟踪 |  |
| `src/views/CommunityMarketView.vue` | vue | 程序 | 页面：社区市场 | 已跟踪 |  |
| `src/views/DataBankView.vue` | vue | 程序 | 页面：数据银行 | 已跟踪 |  |
| `src/views/GroupChatView.vue` | vue | 程序 | 页面：群聊 | 已跟踪 |  |
| `src/views/GuideView.vue` | vue | 程序 | 页面：Guide（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/views/ImageGeneratorView.vue` | vue | 程序 | 页面：图像生成 | 已跟踪 |  |
| `src/views/LocalModelView.vue` | vue | 程序 | 页面：本地模型管理 | 已跟踪 |  |
| `src/views/MoreView.vue` | vue | 程序 | 页面：More（待确认具体功能） | 已跟踪 | 用途待确认 |
| `src/views/RandomEventsView.vue` | vue | 程序 | 页面：随机事件 | 已跟踪 |  |
| `src/views/SettingsView.vue` | vue | 程序 | 页面：设置中心（含数据管理与安全） | 已跟踪 |  |
| `src/views/StoryEngineView.vue` | vue | 程序 | 页面：剧情引擎 | 已跟踪 |  |
| `src/views/WorldBookView.vue` | vue | 程序 | 页面：世界书管理 | 已跟踪 |  |
| `src/vite-env.d.ts` | ts | 程序 | Vite 环境变量与静态资源类型声明 | 已跟踪 |  |

### 2.2 测试（265）

| 相对路径 | 文件类型 | 分类 | 用途说明 | Git状态 | 备注 |
| --- | --- | --- | --- | --- | --- |
| `e2e/a11y-dup-audit.ts` | ts | 测试 | E2E 测试辅助文件（存储状态预置） | 已跟踪 |  |
| `e2e/backup-restore.spec.ts` | ts | 测试 | E2E 测试：backup-restore 场景 | 已跟踪 |  |
| `e2e/character-batch-import.spec.ts` | ts | 测试 | E2E：批量角色导入、Runtime 同步失败重试与 50 个上限拒绝 | 已跟踪 |  |
| `e2e/character-crud.spec.ts` | ts | 测试 | E2E 测试：character-crud 场景 | 已跟踪 |  |
| `e2e/chat-flow.spec.ts` | ts | 测试 | E2E 测试：chat-flow 场景 | 已跟踪 |  |
| `e2e/chat-search.spec.ts` | ts | 测试 | E2E 测试：chat-search 场景 | 已跟踪 |  |
| `e2e/contrast-axe.spec.ts` | ts | 测试 | E2E 测试：contrast-axe 场景 | 已跟踪 |  |
| `e2e/custom-theme-contrast.spec.ts` | ts | 测试 | E2E 测试：custom-theme-contrast 场景 | 已跟踪 |  |
| `e2e/databank-flow.spec.ts` | ts | 测试 | E2E 测试：databank-flow 场景 | 已跟踪 |  |
| `e2e/group-chat-flow.spec.ts` | ts | 测试 | E2E：双角色群聊真实模型链路、独立 Context/Event 与指定发言 | 已跟踪 |  |
| `e2e/i18n-locale.spec.ts` | ts | 测试 | E2E 测试：i18n-locale 场景 | 已跟踪 |  |
| `e2e/long-history-scroll.spec.ts` | ts | 测试 | E2E 测试：long-history-scroll 场景 | 已跟踪 |  |
| `e2e/mobile-control-font-size.spec.ts` | ts | 测试 | E2E 测试：mobile-control-font-size 场景 | 已跟踪 |  |
| `e2e/mobile/chat-touch-composer.spec.ts` | ts | 测试 | E2E 测试：chat-touch-composer 场景 | 已跟踪 |  |
| `e2e/mobile/group-header-narrow.spec.ts` | ts | 测试 | E2E 测试：group-header-narrow 场景 | 已跟踪 |  |
| `e2e/mobile/mobile-layout.spec.ts` | ts | 测试 | E2E 测试：mobile-layout 场景 | 已跟踪 |  |
| `e2e/mobile/mobile-nav-groups.spec.ts` | ts | 测试 | E2E 测试：mobile-nav-groups 场景 | 已跟踪 |  |
| `e2e/mobile/narrow-squeeze.spec.ts` | ts | 测试 | E2E 测试：narrow-squeeze 场景 | 已跟踪 |  |
| `e2e/model-install-web.spec.ts` | ts | 测试 | E2E 测试：model-install-web 场景 | 已跟踪 |  |
| `e2e/neutrality-baseline.json` | json | 测试 | E2E 测试辅助文件（存储状态预置） | 已跟踪 |  |
| `e2e/shard-groups.d.mts` | mts | 测试 | E2E 测试辅助文件（存储状态预置） | 已跟踪 |  |
| `e2e/shard-groups.mjs` | mjs | 测试 | E2E 测试辅助文件（存储状态预置） | 已跟踪 |  |
| `e2e/storage-state.json` | json | 测试 | E2E 预置 localStorage（跳过新手引导） | 已跟踪 |  |
| `e2e/theme-flow.spec.ts` | ts | 测试 | E2E 测试：theme-flow 场景 | 已跟踪 |  |
| `e2e/theme-persistence.ts` | ts | 测试 | E2E 测试辅助文件（存储状态预置） | 已跟踪 |  |
| `e2e/theme-visual.spec.ts` | ts | 测试 | E2E 测试：theme-visual 场景 | 已跟踪 |  |
| `e2e/token-neutrality.spec.ts` | ts | 测试 | E2E 测试：token-neutrality 场景 | 已跟踪 |  |
| `e2e/ux-deep-link-book.spec.ts` | ts | 测试 | E2E 测试：ux-deep-link-book 场景 | 已跟踪 |  |
| `e2e/ux-deep-link-group.spec.ts` | ts | 测试 | E2E 测试：ux-deep-link-group 场景 | 已跟踪 |  |
| `e2e/ux-duplicate-a11y-names.spec.ts` | ts | 测试 | E2E 测试：ux-duplicate-a11y-names 场景 | 已跟踪 |  |
| `e2e/ux-event-manual-trace.spec.ts` | ts | 测试 | E2E 测试：ux-event-manual-trace 场景 | 已跟踪 |  |
| `e2e/ux-event-trace.spec.ts` | ts | 测试 | E2E 测试：ux-event-trace 场景 | 已跟踪 |  |
| `e2e/ux-gap-visibility.spec.ts` | ts | 测试 | E2E 测试：ux-gap-visibility 场景 | 已跟踪 |  |
| `e2e/ux-guided-tasks.spec.ts` | ts | 测试 | E2E 测试：ux-guided-tasks 场景 | 已跟踪 |  |
| `e2e/ux-interaction-feedback.spec.ts` | ts | 测试 | E2E 测试：ux-interaction-feedback 场景 | 已跟踪 |  |
| `e2e/ux-modal-describedby-more.spec.ts` | ts | 测试 | E2E 测试：ux-modal-describedby-more 场景 | 已跟踪 |  |
| `e2e/ux-modal-describedby-seeded.spec.ts` | ts | 测试 | E2E 测试：ux-modal-describedby-seeded 场景 | 已跟踪 |  |
| `e2e/ux-modal-describedby-version.spec.ts` | ts | 测试 | E2E 测试：ux-modal-describedby-version 场景 | 已跟踪 |  |
| `e2e/ux-modal-describedby.spec.ts` | ts | 测试 | E2E 测试：ux-modal-describedby 场景 | 已跟踪 |  |
| `e2e/ux-narrow-editor-preview.spec.ts` | ts | 测试 | E2E 测试：ux-narrow-editor-preview 场景 | 已跟踪 |  |
| `e2e/ux-nav-model.spec.ts` | ts | 测试 | E2E 测试：ux-nav-model 场景 | 已跟踪 |  |
| `e2e/ux-prompt-trace.spec.ts` | ts | 测试 | E2E 测试：ux-prompt-trace 场景 | 已跟踪 |  |
| `e2e/ux-quick-forms.spec.ts` | ts | 测试 | E2E 测试：ux-quick-forms 场景 | 已跟踪 |  |
| `e2e/ux-readiness.spec.ts` | ts | 测试 | E2E 测试：ux-readiness 场景 | 已跟踪 |  |
| `e2e/ux-relations-panel.spec.ts` | ts | 测试 | E2E 测试：ux-relations-panel 场景 | 已跟踪 |  |
| `e2e/ux-status-color.spec.ts` | ts | 测试 | E2E 测试：ux-status-color 场景 | 已跟踪 |  |
| `e2e/worldbook-flow.spec.ts` | ts | 测试 | E2E 测试：worldbook-flow 场景 | 已跟踪 |  |
| `tests/accessibility/axe-helper.ts` | ts | 测试 | 单元测试：axe-helper.ts 模块 | 已跟踪 |  |
| `tests/accessibility/components-axe.test.ts` | ts | 测试 | 单元测试：components-axe 模块 | 已跟踪 |  |
| `tests/accessibility/modal-describedby-coverage.ledger.ts` | ts | 测试 | 单元测试：modal-describedby-coverage.ledger.ts 模块 | 已跟踪 |  |
| `tests/accessibility/modal-describedby-wired.test.ts` | ts | 测试 | 单元测试：modal-describedby-wired 模块 | 已跟踪 |  |
| `tests/accessibility/new-primitives-axe.test.ts` | ts | 测试 | 单元测试：new-primitives-axe 模块 | 已跟踪 |  |
| `tests/accessibility/no-native-title.test.ts` | ts | 测试 | 单元测试：no-native-title 模块 | 已跟踪 |  |
| `tests/accessibility/worldbook-group-axe.test.ts` | ts | 测试 | 单元测试：worldbook-group-axe 模块 | 已跟踪 |  |
| `tests/api/anthropic-client.test.ts` | ts | 测试 | 单元测试：anthropic-client 模块 | 已跟踪 |  |
| `tests/api/diagnostics.test.ts` | ts | 测试 | 单元测试：diagnostics 模块 | 已跟踪 |  |
| `tests/api/fetch-error-classifier.test.ts` | ts | 测试 | 单元测试：fetch-error-classifier 模块 | 已跟踪 |  |
| `tests/api/llm-controls-p0.qa-independent.test.ts` | ts | 测试 | 单元测试：llm-controls-p0.qa-independent 模块 | 已跟踪 |  |
| `tests/api/llm-retry.test.ts` | ts | 测试 | 单元测试：llm-retry 模块 | 已跟踪 |  |
| `tests/api/local-api-client.test.ts` | ts | 测试 | 单元测试：local-api-client 模块 | 已跟踪 |  |
| `tests/api/openai-client.test.ts` | ts | 测试 | 单元测试：openai-client 模块 | 已跟踪 |  |
| `tests/api/reasoning-capability.test.ts` | ts | 测试 | 单元测试：reasoning-capability 模块 | 已跟踪 |  |
| `tests/api/tauri-openai-client.test.ts` | ts | 测试 | 单元测试：tauri-openai-client 模块 | 已跟踪 |  |
| `tests/api/usage-reasoning-tokens.qa-independent.test.ts` | ts | 测试 | 单元测试：usage-reasoning-tokens.qa-independent 模块 | 已跟踪 |  |
| `tests/components/appearance-section-memory.test.ts` | ts | 测试 | 单元测试：appearance-section-memory 模块 | 已跟踪 |  |
| `tests/components/chat-mode-switch.test.ts` | ts | 测试 | 单元测试：chat-mode-switch 模块 | 已跟踪 |  |
| `tests/components/chat-touch-and-composer.test.ts` | ts | 测试 | 单元测试：chat-touch-and-composer 模块 | 已跟踪 |  |
| `tests/components/collapse.test.ts` | ts | 测试 | 单元测试：collapse 模块 | 已跟踪 |  |
| `tests/components/context-panel-lorebooks.test.ts` | ts | 测试 | 单元测试：context-panel-lorebooks 模块 | 已跟踪 |  |
| `tests/components/event-trace-summary.test.ts` | ts | 测试 | 单元测试：event-trace-summary 模块 | 已跟踪 |  |
| `tests/components/guided-tasks-card.test.ts` | ts | 测试 | 单元测试：guided-tasks-card 模块 | 已跟踪 |  |
| `tests/components/help-tip-form-field.test.ts` | ts | 测试 | 单元测试：help-tip-form-field 模块 | 已跟踪 |  |
| `tests/components/locale-reactivity.test.ts` | ts | 测试 | 单元测试：locale-reactivity 模块 | 已跟踪 |  |
| `tests/components/message-narration.test.ts` | ts | 测试 | 单元测试：message-narration 模块 | 已跟踪 |  |
| `tests/components/modal-describes.test.ts` | ts | 测试 | 单元测试：modal-describes 模块 | 已跟踪 |  |
| `tests/components/module-relations-panel.test.ts` | ts | 测试 | 单元测试：module-relations-panel 模块 | 已跟踪 |  |
| `tests/components/nav-rail-visibility.test.ts` | ts | 测试 | 单元测试：nav-rail-visibility 模块 | 已跟踪 |  |
| `tests/components/onboarding-modal.test.ts` | ts | 测试 | 单元测试：onboarding-modal 模块 | 已跟踪 |  |
| `tests/components/quick-character-form.test.ts` | ts | 测试 | 单元测试：quick-character-form 模块 | 已跟踪 |  |
| `tests/components/quick-lorebook-flow.test.ts` | ts | 测试 | 单元测试：quick-lorebook-flow 模块 | 已跟踪 |  |
| `tests/components/readiness-surfaces.test.ts` | ts | 测试 | 单元测试：readiness-surfaces 模块 | 已跟踪 |  |
| `tests/components/settings-about-version.test.ts` | ts | 测试 | 单元测试：settings-about-version 模块 | 已跟踪 |  |
| `tests/components/settings/settings-round3-gaps.test.ts` | ts | 测试 | 单元测试：settings-round3-gaps 模块 | 已跟踪 |  |
| `tests/components/step-flow.test.ts` | ts | 测试 | 单元测试：step-flow 模块 | 已跟踪 |  |
| `tests/components/toast-auto-close.test.ts` | ts | 测试 | 单元测试：toast-auto-close 模块 | 已跟踪 |  |
| `tests/components/worldbook-events-panel-edit.test.ts` | ts | 测试 | 单元测试：worldbook-events-panel-edit 模块 | 已跟踪 |  |
| `tests/composables/use-deep-link-id.test.ts` | ts | 测试 | 单元测试：use-deep-link-id 模块 | 已跟踪 |  |
| `tests/composables/use-section-memory.test.ts` | ts | 测试 | 单元测试：use-section-memory 模块 | 已跟踪 |  |
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
| `tests/core/creation-preset.test.ts` | ts | 测试 | 单元测试：creation-preset 模块 | 已跟踪 |  |
| `tests/core/deep-link-keys.test.ts` | ts | 测试 | 单元测试：deep-link-keys 模块 | 已跟踪 |  |
| `tests/core/document-chunker.test.ts` | ts | 测试 | 单元测试：document-chunker 模块 | 已跟踪 |  |
| `tests/core/dual-channel-runtime.test.ts` | ts | 测试 | 单元测试：dual-channel-runtime 模块 | 已跟踪 |  |
| `tests/core/embedding.test.ts` | ts | 测试 | 单元测试：embedding 模块 | 已跟踪 |  |
| `tests/core/eval-judgment.test.ts` | ts | 测试 | 单元测试：eval-judgment 模块 | 已跟踪 |  |
| `tests/core/event-trace.test.ts` | ts | 测试 | 单元测试：event-trace 模块 | 已跟踪 |  |
| `tests/core/event-types.test.ts` | ts | 测试 | 单元测试：event-types 模块 | 已跟踪 |  |
| `tests/core/extension-loader.test.ts` | ts | 测试 | 单元测试：extension-loader 模块 | 已跟踪 |  |
| `tests/core/guided-tasks.test.ts` | ts | 测试 | 单元测试：guided-tasks 模块 | 已跟踪 |  |
| `tests/core/image-generation.test.ts` | ts | 测试 | 单元测试：image-generation 模块 | 已跟踪 |  |
| `tests/core/inference-cache.test.ts` | ts | 测试 | 单元测试：inference-cache 模块 | 已跟踪 |  |
| `tests/core/json-utils.test.ts` | ts | 测试 | 单元测试：json-utils 模块 | 已跟踪 |  |
| `tests/core/keyboard-inset.test.ts` | ts | 测试 | 单元测试：keyboard-inset 模块 | 已跟踪 |  |
| `tests/core/l0-l2-runtime.test.ts` | ts | 测试 | 单元测试：l0-l2-runtime 模块 | 已跟踪 |  |
| `tests/core/local-model-engine.test.ts` | ts | 测试 | 单元测试：local-model-engine 模块 | 已跟踪 |  |
| `tests/core/lorebook-hierarchy.test.ts` | ts | 测试 | 单元测试：lorebook-hierarchy 模块 | 已跟踪 |  |
| `tests/core/lorebook-scanner.test.ts` | ts | 测试 | 单元测试：lorebook-scanner 模块 | 已跟踪 |  |
| `tests/core/macro.test.ts` | ts | 测试 | 单元测试：macro 模块 | 已跟踪 |  |
| `tests/core/market-index-integration.test.ts` | ts | 测试 | 单元测试：market-index-integration 模块 | 已跟踪 |  |
| `tests/core/market-index.test.ts` | ts | 测试 | 单元测试：market-index 模块 | 已跟踪 |  |
| `tests/core/memory-store.test.ts` | ts | 测试 | 单元测试：memory-store 模块 | 已跟踪 |  |
| `tests/core/message-search.test.ts` | ts | 测试 | 单元测试：message-search 模块 | 已跟踪 |  |
| `tests/core/mobile-nav.test.ts` | ts | 测试 | 单元测试：mobile-nav 模块 | 已跟踪 |  |
| `tests/core/model-file-adapter.test.ts` | ts | 测试 | 单元测试：model-file-adapter 模块 | 已跟踪 |  |
| `tests/core/model-fs-ipc.test.ts` | ts | 测试 | 单元测试：model-fs-ipc 模块 | 已跟踪 |  |
| `tests/core/narration.test.ts` | ts | 测试 | 单元测试：narration 模块 | 已跟踪 |  |
| `tests/core/native-sw-cleanup.test.ts` | ts | 测试 | 单元测试：native-sw-cleanup 模块 | 已跟踪 |  |
| `tests/core/nav-model.test.ts` | ts | 测试 | 单元测试：nav-model 模块 | 已跟踪 |  |
| `tests/core/npc-generator.test.ts` | ts | 测试 | 单元测试：npc-generator 模块 | 已跟踪 |  |
| `tests/core/onnx-real-model.test.ts` | ts | 测试 | 单元测试：onnx-real-model 模块 | 已跟踪 |  |
| `tests/core/optimization-pipeline.test.ts` | ts | 测试 | 单元测试：optimization-pipeline 模块 | 已跟踪 |  |
| `tests/core/output-discipline.test.ts` | ts | 测试 | 单元测试：output-discipline 模块 | 已跟踪 |  |
| `tests/core/preset-input.test.ts` | ts | 测试 | 单元测试：preset-input 模块 | 已跟踪 |  |
| `tests/core/prompt-builder.lorebook.test.ts` | ts | 测试 | 单元测试：prompt-builder.lorebook 模块 | 已跟踪 |  |
| `tests/core/prompt-builder.test.ts` | ts | 测试 | 单元测试：prompt-builder 模块 | 已跟踪 |  |
| `tests/core/prompt-trace.test.ts` | ts | 测试 | 单元测试：prompt-trace 模块 | 已跟踪 |  |
| `tests/core/protagonist.test.ts` | ts | 测试 | 单元测试：protagonist 模块 | 已跟踪 |  |
| `tests/core/rag-benchmark.test.ts` | ts | 测试 | 单元测试：rag-benchmark 模块 | 已跟踪 |  |
| `tests/core/rag-retriever.test.ts` | ts | 测试 | 单元测试：rag-retriever 模块 | 已跟踪 |  |
| `tests/core/rail-prefs.test.ts` | ts | 测试 | 单元测试：rail-prefs 模块 | 已跟踪 |  |
| `tests/core/random-event-generator.test.ts` | ts | 测试 | 单元测试：random-event-generator 模块 | 已跟踪 |  |
| `tests/core/random-event-templates.test.ts` | ts | 测试 | 单元测试：random-event-templates 模块 | 已跟踪 |  |
| `tests/core/range-fill.test.ts` | ts | 测试 | 单元测试：range-fill 模块 | 已跟踪 |  |
| `tests/core/readiness.test.ts` | ts | 测试 | 单元测试：readiness 模块 | 已跟踪 |  |
| `tests/core/relations.test.ts` | ts | 测试 | 单元测试：relations 模块 | 已跟踪 |  |
| `tests/core/sanitize.test.ts` | ts | 测试 | 单元测试：sanitize 模块 | 已跟踪 |  |
| `tests/core/schema-contract.test.ts` | ts | 测试 | 单元测试：schema-contract 模块 | 已跟踪 |  |
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
| `tests/core/tip.test.ts` | ts | 测试 | 单元测试：tip 模块 | 已跟踪 |  |
| `tests/core/token-budget.test.ts` | ts | 测试 | 单元测试：token-budget 模块 | 已跟踪 |  |
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
| `tests/runtime/appraisal-behavior.test.ts` | ts | 测试 | 单元测试：appraisal-behavior 模块 | 已跟踪 |  |
| `tests/runtime/group-runtime-http.test.ts` | ts | 测试 | 群聊 HTTP 客户端与 Fetch Handler 边界测试 | 已跟踪 |  |
| `tests/runtime/postgres-executor.test.ts` | ts | 测试 | 单元测试：postgres-executor 模块 | 已跟踪 |  |
| `tests/runtime/postgres-group.integration.test.ts` | ts | 测试 | 真实 PostgreSQL 群聊原子性、授权、并发及回滚集成测试 | 已跟踪 |  |
| `tests/runtime/postgres-runtime.integration.test.ts` | ts | 测试 | 单元测试：postgres-runtime.integration 模块 | 已跟踪 |  |
| `tests/runtime/runtime-core.test.ts` | ts | 测试 | 单元测试：runtime-core 模块 | 已跟踪 |  |
| `tests/runtime/runtime-http.test.ts` | ts | 测试 | 单元测试：runtime-http 模块 | 已跟踪 |  |
| `tests/runtime/runtime-trace.test.ts` | ts | 测试 | 单元测试：runtime-trace 模块 | 已跟踪 |  |
| `tests/runtime/runtime-versioning.test.ts` | ts | 测试 | 单元测试：runtime-versioning 模块 | 已跟踪 |  |
| `tests/services/backup-random-events.test.ts` | ts | 测试 | 单元测试：backup-random-events 模块 | 已跟踪 |  |
| `tests/services/backup-service.test.ts` | ts | 测试 | 单元测试：backup-service 模块 | 已跟踪 |  |
| `tests/services/chat-error.test.ts` | ts | 测试 | 单元测试：chat-error 模块 | 已跟踪 |  |
| `tests/services/chat-manager.test.ts` | ts | 测试 | 单元测试：chat-manager 模块 | 已跟踪 |  |
| `tests/services/group-chat-prompt.test.ts` | ts | 测试 | 单元测试：group-chat-prompt 模块 | 已跟踪 |  |
| `tests/services/group-chat-runtime.test.ts` | ts | 测试 | 单元测试：group-chat-runtime 模块 | 已跟踪 |  |
| `tests/services/llm-controls-p0.qa-independent.test.ts` | ts | 测试 | 单元测试：llm-controls-p0.qa-independent 模块 | 已跟踪 |  |
| `tests/services/status-hud-p1.qa-independent.test.ts` | ts | 测试 | 单元测试：status-hud-p1.qa-independent 模块 | 已跟踪 |  |
| `tests/services/translator.test.ts` | ts | 测试 | 单元测试：translator 模块 | 已跟踪 |  |
| `tests/services/tts-service.test.ts` | ts | 测试 | 单元测试：tts-service 模块 | 已跟踪 |  |
| `tests/services/type-adapters.test.ts` | ts | 测试 | 单元测试：type-adapters 模块 | 已跟踪 |  |
| `tests/setup-locale.ts` | ts | 测试 | 单元测试：setup-locale.ts 模块 | 已跟踪 |  |
| `tests/setup.ts` | ts | 测试 | Vitest 全局测试环境初始化 | 已跟踪 |  |
| `tests/storage/indexeddb-adapter.test.ts` | ts | 测试 | 单元测试：indexeddb-adapter 模块 | 已跟踪 |  |
| `tests/storage/snapshot-migration.test.ts` | ts | 测试 | 单元测试：snapshot-migration 模块 | 已跟踪 |  |
| `tests/storage/snapshot-restore.test.ts` | ts | 测试 | 单元测试：snapshot-restore 模块 | 已跟踪 |  |
| `tests/storage/storage-contract.test.ts` | ts | 测试 | 单元测试：storage-contract 模块 | 已跟踪 |  |
| `tests/storage/storage-factory.test.ts` | ts | 测试 | 单元测试：storage-factory 模块 | 已跟踪 |  |
| `tests/storage/tauri-fs-adapter.test.ts` | ts | 测试 | 单元测试：tauri-fs-adapter 模块 | 已跟踪 |  |
| `tests/stores/boot-window.test.ts` | ts | 测试 | 单元测试：boot-window 模块 | 已跟踪 |  |
| `tests/stores/character-generate.test.ts` | ts | 测试 | 单元测试：character-generate 模块 | 已跟踪 |  |
| `tests/stores/character-version-tracked.test.ts` | ts | 测试 | 单元测试：character-version-tracked 模块 | 已跟踪 |  |
| `tests/stores/character-version.test.ts` | ts | 测试 | 单元测试：character-version 模块 | 已跟踪 |  |
| `tests/stores/character.test.ts` | ts | 测试 | 单元测试：character 模块 | 已跟踪 |  |
| `tests/stores/chat-compat.test.ts` | ts | 测试 | 单元测试：chat-compat 模块 | 已跟踪 |  |
| `tests/stores/chat-context.test.ts` | ts | 测试 | 单元测试：chat-context 模块 | 已跟踪 |  |
| `tests/stores/chat-event-trace.test.ts` | ts | 测试 | 单元测试：chat-event-trace 模块 | 已跟踪 |  |
| `tests/stores/chat-llm-controls.test.ts` | ts | 测试 | 单元测试：chat-llm-controls 模块 | 已跟踪 |  |
| `tests/stores/chat-p0-thinking.qa-independent.test.ts` | ts | 测试 | 单元测试：chat-p0-thinking.qa-independent 模块 | 已跟踪 |  |
| `tests/stores/chat-prompt-trace.test.ts` | ts | 测试 | 单元测试：chat-prompt-trace 模块 | 已跟踪 |  |
| `tests/stores/chat-runtime.integration.test.ts` | ts | 测试 | Chat Store 到 Runtime Context 的实际链路集成测试 | 已跟踪 |  |
| `tests/stores/chat-session-load-window.test.ts` | ts | 测试 | 单元测试：chat-session-load-window 模块 | 已跟踪 |  |
| `tests/stores/chat-session-restore.test.ts` | ts | 测试 | 单元测试：chat-session-restore 模块 | 已跟踪 |  |
| `tests/stores/chat.test.ts` | ts | 测试 | 单元测试：chat 模块 | 已跟踪 |  |
| `tests/stores/community-market-install.test.ts` | ts | 测试 | 单元测试：community-market-install 模块 | 已跟踪 |  |
| `tests/stores/community-market.test.ts` | ts | 测试 | 单元测试：community-market 模块 | 已跟踪 |  |
| `tests/stores/context-length.test.ts` | ts | 测试 | 单元测试：context-length 模块 | 已跟踪 |  |
| `tests/stores/data-bank.test.ts` | ts | 测试 | 单元测试：data-bank 模块 | 已跟踪 |  |
| `tests/stores/events.test.ts` | ts | 测试 | 单元测试：events 模块 | 已跟踪 |  |
| `tests/stores/group-chat-pagination.test.ts` | ts | 测试 | 单元测试：group-chat-pagination 模块 | 已跟踪 |  |
| `tests/stores/group-chat.test.ts` | ts | 测试 | 单元测试：group-chat 模块 | 已跟踪 |  |
| `tests/stores/image-gen-settings.test.ts` | ts | 测试 | 单元测试：image-gen-settings 模块 | 已跟踪 |  |
| `tests/stores/image-generation-provider.test.ts` | ts | 测试 | 单元测试：image-generation-provider 模块 | 已跟踪 |  |
| `tests/stores/local-model.test.ts` | ts | 测试 | 单元测试：local-model 模块 | 已跟踪 |  |
| `tests/stores/lorebook-generate-error.test.ts` | ts | 测试 | 单元测试：lorebook-generate-error 模块 | 已跟踪 |  |
| `tests/stores/lorebook-hierarchy.test.ts` | ts | 测试 | 单元测试：lorebook-hierarchy 模块 | 已跟踪 |  |
| `tests/stores/master-password.test.ts` | ts | 测试 | 单元测试：master-password 模块 | 已跟踪 |  |
| `tests/stores/quick-reply.test.ts` | ts | 测试 | 单元测试：quick-reply 模块 | 已跟踪 |  |
| `tests/stores/random-events-persistence.test.ts` | ts | 测试 | 单元测试：random-events-persistence 模块 | 已跟踪 |  |
| `tests/stores/random-events.test.ts` | ts | 测试 | 单元测试：random-events 模块 | 已跟踪 |  |
| `tests/stores/remote-embedding-key.test.ts` | ts | 测试 | 单元测试：remote-embedding-key 模块 | 已跟踪 |  |
| `tests/stores/settings-load-write-gate.test.ts` | ts | 测试 | 单元测试：settings-load-write-gate 模块 | 已跟踪 |  |
| `tests/stores/settings-persist-order.test.ts` | ts | 测试 | 单元测试：settings-persist-order 模块 | 已跟踪 |  |
| `tests/stores/settings.test.ts` | ts | 测试 | 单元测试：settings 模块 | 已跟踪 |  |
| `tests/stores/story.test.ts` | ts | 测试 | 单元测试：story 模块 | 已跟踪 |  |
| `tests/tooling/e2e-shard-groups.test.ts` | ts | 测试 | 单元测试：e2e-shard-groups 模块 | 已跟踪 |  |
| `tests/tooling/lint-scope.test.ts` | ts | 测试 | 单元测试：lint-scope 模块 | 已跟踪 |  |
| `tests/utils/save-blob.test.ts` | ts | 测试 | 单元测试：save-blob 模块 | 已跟踪 |  |
| `tests/utils/toast-service.test.ts` | ts | 测试 | 单元测试：toast-service 模块 | 已跟踪 |  |
| `tests/views/app-tauri-ux.test.ts` | ts | 测试 | 单元测试：app-tauri-ux 模块 | 已跟踪 |  |
| `tests/views/character-card-tracked.test.ts` | ts | 测试 | 单元测试：character-card-tracked 模块 | 已跟踪 |  |
| `tests/views/character-editor-field-wiring.test.ts` | ts | 测试 | 单元测试：character-editor-field-wiring 模块 | 已跟踪 |  |
| `tests/views/chat-ime.test.ts` | ts | 测试 | 单元测试：chat-ime 模块 | 已跟踪 |  |
| `tests/views/chat-main-window.test.ts` | ts | 测试 | 单元测试：chat-main-window 模块 | 已跟踪 |  |
| `tests/views/chat-story-jump.test.ts` | ts | 测试 | 单元测试：chat-story-jump 模块 | 已跟踪 |  |
| `tests/views/deep-link-book-query.test.ts` | ts | 测试 | 单元测试：deep-link-book-query 模块 | 已跟踪 |  |
| `tests/views/deep-link-group-query.test.ts` | ts | 测试 | 单元测试：deep-link-group-query 模块 | 已跟踪 |  |
| `tests/views/deep-link-store-gate.test.ts` | ts | 测试 | 单元测试：deep-link-store-gate 模块 | 已跟踪 |  |
| `tests/views/deep-link-story-query.test.ts` | ts | 测试 | 单元测试：deep-link-story-query 模块 | 已跟踪 |  |
| `tests/views/deep-link-waits-character-library.test.ts` | ts | 测试 | 单元测试：deep-link-waits-character-library 模块 | 已跟踪 |  |
| `tests/views/group-runtime-inspect-collapse.test.ts` | ts | 测试 | 单元测试：group-runtime-inspect-collapse 模块 | 已跟踪 |  |
| `tests/views/llm-controls-ui.test.ts` | ts | 测试 | 单元测试：llm-controls-ui 模块 | 已跟踪 |  |
| `tests/views/market-install-result-ui.test.ts` | ts | 测试 | 单元测试：market-install-result-ui 模块 | 已跟踪 |  |
| `tests/views/settings-creation-preset.test.ts` | ts | 测试 | 单元测试：settings-creation-preset 模块 | 已跟踪 |  |
| `tests/views/settings-local-model.test.ts` | ts | 测试 | 单元测试：settings-local-model 模块 | 已跟踪 |  |
| `tests/views/status-hud-ui.test.ts` | ts | 测试 | 单元测试：status-hud-ui 模块 | 已跟踪 |  |
| `tests/views/story-engine-quicksetup.test.ts` | ts | 测试 | 单元测试：story-engine-quicksetup 模块 | 已跟踪 |  |
| `tests/views/thinking-tokens-inline-status.qa-independent.test.ts` | ts | 测试 | 单元测试：thinking-tokens-inline-status.qa-independent 模块 | 已跟踪 |  |
| `tests/views/two-views-partition.test.ts` | ts | 测试 | 单元测试：two-views-partition 模块 | 已跟踪 |  |

### 2.3 产品文档（1）

| 相对路径 | 文件类型 | 分类 | 用途说明 | Git状态 | 备注 |
| --- | --- | --- | --- | --- | --- |
| `public/sillytavern-vs-airoleplay.html` | html | 产品文档 | 静态页：SillyTavern vs ai-roleplay 系统化对比报告 | 已忽略 |  |

### 2.4 开发文档（166）

| 相对路径 | 文件类型 | 分类 | 用途说明 | Git状态 | 备注 |
| --- | --- | --- | --- | --- | --- |
| `CHANGELOG.md` | md | 开发文档 | 版本变更日志 | 已跟踪 |  |
| `CONTRIBUTING.md` | md | 开发文档 | 贡献指南 | 已跟踪 |  |
| `README-EN.md` | md | 开发文档 | 项目说明（英文版） | 已修改 |  |
| `README.md` | md | 开发文档 | 项目主说明（中文） | 已修改 |  |
| `THIRD_PARTY_NOTICES.md` | md | 开发文档 | 第三方组件许可声明 | 已跟踪 |  |
| `docs/dev/0.3.1-a-release-gates.md` | md | 开发文档 | 开发文档：0.3.1 A 阶段质量门禁与发布验收 | 已跟踪 |  |
| `docs/dev/0.3.1-baseline.md` | md | 开发文档 | 开发文档：0.3.1 C-D-A 阶段基线与提交记录 | 已跟踪 |  |
| `docs/dev/0.3.1-c-runtime-auth.md` | md | 开发文档 | 开发文档：0.3.1 C 阶段 Runtime 认证与租户边界 | 已跟踪 |  |
| `docs/dev/0.3.1-d-runtime-delivery.md` | md | 开发文档 | 开发文档：0.3.1 D 阶段 Runtime 可靠投递与群聊数据契约 | 已跟踪 |  |
| `docs/dev/2026-09-20-LLM控制能力交付总览.md` | md | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/CODE_REVIEW_2026-09-28.md` | md | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/MIGRATION_LOG.md` | md | 开发文档 | 目录整理迁移日志 | 已跟踪 |  |
| `docs/dev/OPTIMIZATION_DEMO.md` | md | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/OPTIMIZATION_ROUNDS_2026-10-01.md` | md | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/ORT_ISOLATION_DESIGN.md` | md | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/P2-11-virtualization-plan.md` | md | 开发文档 | 开发文档：P2-11 长对话虚拟化分批计划 | 已跟踪 |  |
| `docs/dev/PERF_OPTIMIZATION_2026-09-28.md` | md | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/PLAN_AUDIT_2026-09-28.md` | md | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/PROJECT_INDEX.md` | md | 开发文档 | 本索引文件（由 scripts/gen-project-index.mjs 生成） | 已修改 | 索引文件（不递归展开） |
| `docs/dev/QUICK_START.md` | md | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/REAL_DEVICE_FIX_2026-10-03.md` | md | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/REAL_DEVICE_TEST_2026-10-03.md` | md | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/REVIEW_SUMMARY.md` | md | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/ROUND_3_HIGH_RISK_SPLIT_DESIGN.md` | md | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/b-type-findings.md` | md | 开发文档 | 开发文档：`!` 非空断言治理审计记录 | 已跟踪 |  |
| `docs/dev/character-status-hud-落地记录.md` | md | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/contrast-存量分类与收敛建议.md` | md | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/core-data-contract.md` | md | 开发文档 | 开发文档：1.0.0 核心数据契约基线与版本兼容规则 | 已跟踪 |  |
| `docs/dev/data-backup-restore.md` | md | 开发文档 | 开发文档：备份恢复与灾备演练 Runbook（P2-#3 修复交付） | 已跟踪 |  |
| `docs/dev/dialogue-pipeline-分析.md` | md | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/embedding-optimization-实现对照.md` | md | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/eval-manifest.json` | json | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/round-3/opt-7-chat-split/build.txt` | txt | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/round-3/opt-7-chat-split/lint.txt` | txt | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/round-3/opt-7-chat-split/perf-baseline.json` | json | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/round-3/opt-7-chat-split/test-results.txt` | txt | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/round-3/opt-7-chat-split/typecheck.txt` | txt | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/round-3/opt-8-settings-split/accessibility-checklist.md` | md | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/round-3/opt-8-settings-split/before-after-screenshots/after-about.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/round-3/opt-8-settings-split/before-after-screenshots/after-appearance.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/round-3/opt-8-settings-split/before-after-screenshots/after-data.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/round-3/opt-8-settings-split/before-after-screenshots/after-extension.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/round-3/opt-8-settings-split/before-after-screenshots/after-first-run-master-password-modal.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/round-3/opt-8-settings-split/before-after-screenshots/after-model.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/round-3/opt-8-settings-split/before-after-screenshots/after-security.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/round-3/opt-8-settings-split/build.txt` | txt | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/round-3/opt-8-settings-split/lint.txt` | txt | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/round-3/opt-8-settings-split/test-results.txt` | txt | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/round-3/opt-8-settings-split/typecheck.txt` | txt | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m10-c-events-field-wiring/rejected-field-linked.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m11-a-completion-keyword-label/completion-keyword-labeled.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m12-a-version-deeplink/version-deeplink-msedge.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m12-a-version-deeplink/version-deeplink-webkit.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m2-b7-nav-rail/after-112px-rows.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m2-b7-nav-rail/after-64px-icon-rail-at-820w.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m2-b7-nav-rail/after-64px-no-captions.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m2-b7-nav-rail/after-active-fill.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m2-b7-nav-rail/before-72px-vertical.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m2-b8-rail-prefs/more-editor-2-hidden.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m2-b8-rail-prefs/more-editor-all.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m2-b8-rail-prefs/rail-2-hidden.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m2-b8-rail-prefs/rail-all.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m2-b9-interaction-feedback/after-rail-hover-fill.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m2-b9-interaction-feedback/after-slider-filled.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m2-b9-interaction-feedback/after-slider-hover-halo.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m2-b9-interaction-feedback/after-toast-countdown.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m2-b9-interaction-feedback/after-toast-hover-frozen.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m2-b9-interaction-feedback/before-rail-hover.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m2-b9-interaction-feedback/before-slider-flat.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m2-b9-interaction-feedback/before-toast-no-countdown.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m3-b0-gap-visibility/e03-context-panel-global-book.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m3-b0-gap-visibility/e19-character-card-tracked.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m3-b0-gap-visibility/e22-image-provider-after-reload.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m3-b0-gap-visibility/e22-image-provider-config.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m3-b0-gap-visibility/e23-image-header-note.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m3-b2-empty-state/archives-empty.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m3-b2-empty-state/databank-empty.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m3-b2-empty-state/worldbook-list-empty.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m3-b3-quick-forms/char-full-mode-switch.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m3-b3-quick-forms/char-quick-form.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m3-b3-quick-forms/wb-empty-with-flow-entry.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m3-b3-quick-forms/wb-three-steps-done.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m3-b3-quick-forms/wb-three-steps-initial.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m4-b1-tips/tip-on-keyboard-focus.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m4-b1-tips/tip-readiness-chip.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m4-b2-collapse/appearance-collapsed.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m4-b2-collapse/appearance-expanded-panel.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m4-b2-collapse/appearance-expanded.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m4-b2-collapse/data-advanced-collapsed.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m4-b2-collapse/data-advanced-expanded.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m4-b2-collapse/model-modal-sampling-collapsed.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m4-b2-collapse/model-modal-sampling-expanded.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m4-b4-edges/market-source-declaration.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m4-b4-edges/profile-login-note-open.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m4-b4-edges/profile-merged-into-about.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m4-b4-edges/random-events-prereqs.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m5-b1-guide/guide-auto-expanded.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m5-b1-guide/guide-mobile-390.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m5-b1-guide/guide-next-task.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m5-b1-guide/more-progress-wording.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m5-b2-in-feature/char-quick-no-books-hint.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m5-b2-in-feature/worldbook-empty-no-books.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m5-b2-in-feature/worldbook-flow-entry-inline.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m5-b2-in-feature/worldbook-flow-open.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m5-b3-onboarding/welcome-live-steps.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m6-a-mode-switch/chat-header-switch.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m6-a-mode-switch/group-header-switch-mobile.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m6-a-mode-switch/group-header-switch.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m6-b-editor-collapse/attr-collapsed.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m6-b-editor-collapse/attr-open.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m6-b2-editor-formfield/basic-fields.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m6-b2-editor-formfield/group-gradient-presets.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m6-b2-editor-formfield/model-attr-labels.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m6-b2-editor-formfield/name-error.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m6-e-group-header/after-group-header-open.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m6-e-group-header/after-group-header.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m6-e-group-header/before-group-header.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m6-f-primitives/editor-model-fields.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m6-f-primitives/group-add-member-dialog.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m7-a-two-views/before-story.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m7-a-two-views/before-worldbook.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m7-a-two-views/story-two-column.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m7-a-two-views/worldbook-auto-open.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m7-a-two-views/worldbook-collapsed.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m7-b-reject-feedback/rejected-keyword.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m7-c-status-color/after-story-colors.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m7-c-status-color/before-story-colors.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m7-d-section-memory/worldbook-remembered-open.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m8-a-preview-overlap/1000px.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m8-a-preview-overlap/1440px.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m8-b-section-memory-per-entity/book-b-unaffected.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m8-b-section-memory-per-entity/settings-after-reset.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m8-b-section-memory-per-entity/settings-reset-entry.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m8-c-describedby/01-欢迎窗.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m8-c-describedby/02-未保存确认.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m8-c-describedby/03-列表删除确认.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/evidence/ux-ia-guided-flow/m8-c-describedby/04-世界书删除确认.png` | png | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/llm-controls-p0-落地记录.md` | md | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/llm-controls-收尾三项记录.md` | md | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/mobile-pwa-plan.md` | md | 开发文档 | 开发文档：手机端 PWA 实现计划 | 已跟踪 |  |
| `docs/dev/perf-baseline.json` | json | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/perf-report.md` | md | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/rag-enhancement-plan.md` | md | 开发文档 | 开发文档：RAG 增强实现计划 | 已跟踪 |  |
| `docs/dev/release-evidence-0.9.0.md` | md | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/release-evidence-1.0.0.md` | md | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/release-evidence-1.1.0.md` | md | 开发文档 | 1.1.0 逐项门禁读数（证据包 + 本机与 CI 实测，标明哪些是本地跑的、哪些以 CI 为准） | 已修改 |  |
| `docs/dev/release-notes-0.3.0.md` | md | 开发文档 | 开发文档：0.3.0 发布说明（新能力 / 验证结果 / 升级步骤 / 已知限制） | 已跟踪 |  |
| `docs/dev/release-notes-0.3.1.md` | md | 开发文档 | 开发文档：0.3.1 发布说明（新能力 / 验证结果 / 升级步骤 / 已知限制） | 已跟踪 |  |
| `docs/dev/release-notes-0.4.0.md` | md | 开发文档 | 开发文档：0.4.0 发布说明（新能力 / 数据兼容 / 验证结果） | 已跟踪 |  |
| `docs/dev/release-notes-0.5.0.md` | md | 开发文档 | 开发文档：0.5.0 发布说明（搜索 / 历史跳转 / 性能验证） | 已跟踪 |  |
| `docs/dev/release-notes-0.6.0.md` | md | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/release-notes-0.7.0.md` | md | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/release-notes-0.8.0.md` | md | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/release-notes-0.9.0.md` | md | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/release-notes-1.0.0.md` | md | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/release-notes-1.1.0.md` | md | 开发文档 | 1.1.0 发布说明：版本定位、用户可见变化、数据兼容、实测读数表与未覆盖项 | 已修改 |  |
| `docs/dev/release-notes-1.1.1.md` | md | 开发文档 | 待确认 | 未跟踪 | 用途待确认 |
| `docs/dev/resource-security.md` | md | 开发文档 | 开发文档：外部资源许可证、来源、依赖与权限边界 | 已跟踪 |  |
| `docs/dev/runtime-database-migration-runbook.md` | md | 开发文档 | 开发文档：Virtual Character OS 数据库迁移演练 Runbook（备份 / 锁等待 / 回滚 / 演练清单） | 已跟踪 |  |
| `docs/dev/runtime-event-contract.md` | md | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/web-deployment-sop.md` | md | 开发文档 | 开发文档：Web 端部署 SOP（部署前验证 / 硬性要求 / 5 类托管配置 / 部署后验证 / 常见坑 / 回滚） | 已跟踪 |  |
| `docs/dev/优化效果评估脚本-使用说明.md` | md | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/优化能力激活-交付总结.md` | md | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/优化能力激活-后续路线图.md` | md | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/dev/线上模型接入-G4-MeroMero-31B.md` | md | 开发文档 | 待确认 | 已跟踪 | 用途待确认 |
| `public/ai-roleplay-dev-plan.html` | html | 开发文档 | 开发文档（静态页）：AI 酒馆开发计划 | 已忽略 |  |

### 2.5 修复文档（17）

| 相对路径 | 文件类型 | 分类 | 用途说明 | Git状态 | 备注 |
| --- | --- | --- | --- | --- | --- |
| `docs/fixes/cross-client-review-2026-09-07.md` | md | 修复文档 | 修复文档：跨客户端评审报告（28 项缺陷来源） | 已跟踪 |  |
| `docs/fixes/full-project-audit-2026-09-22.md` | md | 修复文档 | 验证记录：全项目代码质量与流程审计 | 已跟踪 |  |
| `docs/fixes/goal-tracker.md` | md | 修复文档 | 修复文档：跨端一致性 28 项缺陷修复进度台账 | 已跟踪 |  |
| `docs/fixes/i7-mobile-control-font-size-fix-2026-09-20.md` | md | 修复文档 | 修复文档：I-7 移动端控件字号修复 + CSS 约定守卫合并（含真实浏览器实测数据） | 已跟踪 |  |
| `docs/fixes/pre-launch-check-aijiuguan-2026-08-15.md` | md | 修复文档 | 修复文档：上线前全检报告（2026-08-15） | 已跟踪 |  |
| `docs/fixes/pre-launch-check-aijiuguan-2026-08-17.md` | md | 修复文档 | 修复文档：6 维度全检报告（2026-08-17） | 已跟踪 |  |
| `docs/fixes/pre-launch-check-aijiuguan-2026-08-19.md` | md | 修复文档 | 修复文档：6 维度全检报告（2026-08-19） | 已跟踪 |  |
| `docs/fixes/pre-launch-check-aijiuguan-2026-09-21.md` | md | 修复文档 | 修复文档：上线前全检报告（代码审查 + 安全审计 + QA，2026-09-21） | 已跟踪 |  |
| `docs/fixes/runtime-chat-store-integration-2026-09-22.md` | md | 修复文档 | 验证记录：Runtime 聊天、原始 Turn 与 PostgreSQL 原子持久化接线 | 已跟踪 |  |
| `docs/fixes/runtime-concurrency-http-boundary-2026-09-22.md` | md | 修复文档 | 验证记录：Runtime 并发控制与 HTTP 边界加固 | 已跟踪 |  |
| `docs/fixes/runtime-core-baseline-verification-2026-09-22.md` | md | 修复文档 | 验证记录：Runtime Core 基线自动化验证 | 已跟踪 |  |
| `docs/fixes/runtime-postgres-pool-migration-2026-09-22.md` | md | 修复文档 | 验证记录：node-postgres Pool 适配、事务生命周期与 Schema 迁移文件 | 已跟踪 |  |
| `docs/fixes/web-sop-fix-batch1-report.md` | md | 修复文档 | 修复文档：Web SOP 修复第一批交付报告（修正失实声明） | 已跟踪 |  |
| `docs/fixes/web-sop-fix-batch2-report.md` | md | 修复文档 | 修复文档：Web SOP 修复第二批交付报告（补齐门禁） | 已跟踪 |  |
| `docs/fixes/web-sop-fix-batch3-report.md` | md | 修复文档 | 修复文档：Web SOP 修复第三批交付报告（安全与数据保障） | 已跟踪 |  |
| `docs/fixes/web-sop-fix-batch4-report.md` | md | 修复文档 | 修复文档：Web SOP 修复第四批交付报告（口径统一与流程固化） | 已跟踪 |  |
| `docs/fixes/web-sop-review-2026-09-18.md` | md | 修复文档 | 修复文档：Web 端 SOP 评审报告（完整性/准确性/一致性/可执行性四维） | 已跟踪 |  |

### 2.6 设计文档（86）

| 相对路径 | 文件类型 | 分类 | 用途说明 | Git状态 | 备注 |
| --- | --- | --- | --- | --- | --- |
| `docs/design/AI酒馆项目嵌入优化方案开发文档.md` | md | 设计文档 | 设计文档：嵌入优化方案（L0/L1/L2 三层） | 已忽略 |  |
| `docs/design/HANDOFF_2026-10-13_APK与两条未完工任务.md` | md | 设计文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/design/OPT_PLAN_2026-10-15_移动端与五项体验重构.md` | md | 设计文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/design/P2-9-csp-whitelist-report.md` | md | 设计文档 | 设计文档：P2-9 CSP / remote 白名单盘点与决策记录 | 已跟踪 |  |
| `docs/design/PSY_NARRATION_STYLE_2026-10-15/index.html` | html | 设计文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/design/THEME_5_GENERIC_PREVIEW/a-characters.png` | png | 设计文档 | 待确认 | 已忽略 | 用途待确认 |
| `docs/design/THEME_5_GENERIC_PREVIEW/a-chat.png` | png | 设计文档 | 待确认 | 已忽略 | 用途待确认 |
| `docs/design/THEME_5_GENERIC_PREVIEW/a-settings-appearance.png` | png | 设计文档 | 待确认 | 已忽略 | 用途待确认 |
| `docs/design/THEME_5_GENERIC_PREVIEW/a-worldbook.png` | png | 设计文档 | 待确认 | 已忽略 | 用途待确认 |
| `docs/design/THEME_5_GENERIC_PREVIEW/b-characters.png` | png | 设计文档 | 待确认 | 已忽略 | 用途待确认 |
| `docs/design/THEME_5_GENERIC_PREVIEW/b-chat.png` | png | 设计文档 | 待确认 | 已忽略 | 用途待确认 |
| `docs/design/THEME_5_GENERIC_PREVIEW/b-settings-appearance.png` | png | 设计文档 | 待确认 | 已忽略 | 用途待确认 |
| `docs/design/THEME_5_GENERIC_PREVIEW/b-worldbook.png` | png | 设计文档 | 待确认 | 已忽略 | 用途待确认 |
| `docs/design/THEME_5_GENERIC_PREVIEW/base-characters.png` | png | 设计文档 | 待确认 | 已忽略 | 用途待确认 |
| `docs/design/THEME_5_GENERIC_PREVIEW/base-chat.png` | png | 设计文档 | 待确认 | 已忽略 | 用途待确认 |
| `docs/design/THEME_5_GENERIC_PREVIEW/base-settings-appearance.png` | png | 设计文档 | 待确认 | 已忽略 | 用途待确认 |
| `docs/design/THEME_5_GENERIC_PREVIEW/base-worldbook.png` | png | 设计文档 | 待确认 | 已忽略 | 用途待确认 |
| `docs/design/THEME_5_GENERIC_PREVIEW/c-characters.png` | png | 设计文档 | 待确认 | 已忽略 | 用途待确认 |
| `docs/design/THEME_5_GENERIC_PREVIEW/c-chat.png` | png | 设计文档 | 待确认 | 已忽略 | 用途待确认 |
| `docs/design/THEME_5_GENERIC_PREVIEW/c-settings-appearance.png` | png | 设计文档 | 待确认 | 已忽略 | 用途待确认 |
| `docs/design/THEME_5_GENERIC_PREVIEW/c-worldbook.png` | png | 设计文档 | 待确认 | 已忽略 | 用途待确认 |
| `docs/design/THEME_5_GENERIC_PREVIEW/d-characters.png` | png | 设计文档 | 待确认 | 已忽略 | 用途待确认 |
| `docs/design/THEME_5_GENERIC_PREVIEW/d-chat.png` | png | 设计文档 | 待确认 | 已忽略 | 用途待确认 |
| `docs/design/THEME_5_GENERIC_PREVIEW/d-settings-appearance.png` | png | 设计文档 | 待确认 | 已忽略 | 用途待确认 |
| `docs/design/THEME_5_GENERIC_PREVIEW/d-worldbook.png` | png | 设计文档 | 待确认 | 已忽略 | 用途待确认 |
| `docs/design/THEME_5_GENERIC_PREVIEW/e-characters.png` | png | 设计文档 | 待确认 | 已忽略 | 用途待确认 |
| `docs/design/THEME_5_GENERIC_PREVIEW/e-chat.png` | png | 设计文档 | 待确认 | 已忽略 | 用途待确认 |
| `docs/design/THEME_5_GENERIC_PREVIEW/e-settings-appearance.png` | png | 设计文档 | 待确认 | 已忽略 | 用途待确认 |
| `docs/design/THEME_5_GENERIC_PREVIEW/e-worldbook.png` | png | 设计文档 | 待确认 | 已忽略 | 用途待确认 |
| `docs/design/THEME_5_GENERIC_PREVIEW/preview-report.json` | json | 设计文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/design/THEME_5_GENERIC_PREVIEW/通用五款对照.md` | md | 设计文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/design/THEME_ACG_PREVIEW/f-characters.png` | png | 设计文档 | 待确认 | 已忽略 | 用途待确认 |
| `docs/design/THEME_ACG_PREVIEW/f-chat.png` | png | 设计文档 | 待确认 | 已忽略 | 用途待确认 |
| `docs/design/THEME_ACG_PREVIEW/f-settings-appearance.png` | png | 设计文档 | 待确认 | 已忽略 | 用途待确认 |
| `docs/design/THEME_ACG_PREVIEW/f-worldbook.png` | png | 设计文档 | 待确认 | 已忽略 | 用途待确认 |
| `docs/design/THEME_ACG_PREVIEW/g-characters.png` | png | 设计文档 | 待确认 | 已忽略 | 用途待确认 |
| `docs/design/THEME_ACG_PREVIEW/g-chat.png` | png | 设计文档 | 待确认 | 已忽略 | 用途待确认 |
| `docs/design/THEME_ACG_PREVIEW/g-settings-appearance.png` | png | 设计文档 | 待确认 | 已忽略 | 用途待确认 |
| `docs/design/THEME_ACG_PREVIEW/g-worldbook.png` | png | 设计文档 | 待确认 | 已忽略 | 用途待确认 |
| `docs/design/THEME_ACG_PREVIEW/h-characters.png` | png | 设计文档 | 待确认 | 已忽略 | 用途待确认 |
| `docs/design/THEME_ACG_PREVIEW/h-chat.png` | png | 设计文档 | 待确认 | 已忽略 | 用途待确认 |
| `docs/design/THEME_ACG_PREVIEW/h-settings-appearance.png` | png | 设计文档 | 待确认 | 已忽略 | 用途待确认 |
| `docs/design/THEME_ACG_PREVIEW/h-worldbook.png` | png | 设计文档 | 待确认 | 已忽略 | 用途待确认 |
| `docs/design/THEME_ACG_PREVIEW/i-characters.png` | png | 设计文档 | 待确认 | 已忽略 | 用途待确认 |
| `docs/design/THEME_ACG_PREVIEW/i-chat.png` | png | 设计文档 | 待确认 | 已忽略 | 用途待确认 |
| `docs/design/THEME_ACG_PREVIEW/i-settings-appearance.png` | png | 设计文档 | 待确认 | 已忽略 | 用途待确认 |
| `docs/design/THEME_ACG_PREVIEW/i-worldbook.png` | png | 设计文档 | 待确认 | 已忽略 | 用途待确认 |
| `docs/design/THEME_ACG_PREVIEW/j-characters.png` | png | 设计文档 | 待确认 | 已忽略 | 用途待确认 |
| `docs/design/THEME_ACG_PREVIEW/j-chat.png` | png | 设计文档 | 待确认 | 已忽略 | 用途待确认 |
| `docs/design/THEME_ACG_PREVIEW/j-settings-appearance.png` | png | 设计文档 | 待确认 | 已忽略 | 用途待确认 |
| `docs/design/THEME_ACG_PREVIEW/j-worldbook.png` | png | 设计文档 | 待确认 | 已忽略 | 用途待确认 |
| `docs/design/THEME_ACG_PREVIEW/k-characters.png` | png | 设计文档 | 待确认 | 已忽略 | 用途待确认 |
| `docs/design/THEME_ACG_PREVIEW/k-chat.png` | png | 设计文档 | 待确认 | 已忽略 | 用途待确认 |
| `docs/design/THEME_ACG_PREVIEW/k-settings-appearance.png` | png | 设计文档 | 待确认 | 已忽略 | 用途待确认 |
| `docs/design/THEME_ACG_PREVIEW/k-worldbook.png` | png | 设计文档 | 待确认 | 已忽略 | 用途待确认 |
| `docs/design/THEME_ACG_PREVIEW/l-characters.png` | png | 设计文档 | 待确认 | 已忽略 | 用途待确认 |
| `docs/design/THEME_ACG_PREVIEW/l-chat.png` | png | 设计文档 | 待确认 | 已忽略 | 用途待确认 |
| `docs/design/THEME_ACG_PREVIEW/l-settings-appearance.png` | png | 设计文档 | 待确认 | 已忽略 | 用途待确认 |
| `docs/design/THEME_ACG_PREVIEW/l-worldbook.png` | png | 设计文档 | 待确认 | 已忽略 | 用途待确认 |
| `docs/design/THEME_ACG_PREVIEW/m-characters.png` | png | 设计文档 | 待确认 | 已忽略 | 用途待确认 |
| `docs/design/THEME_ACG_PREVIEW/m-chat.png` | png | 设计文档 | 待确认 | 已忽略 | 用途待确认 |
| `docs/design/THEME_ACG_PREVIEW/m-settings-appearance.png` | png | 设计文档 | 待确认 | 已忽略 | 用途待确认 |
| `docs/design/THEME_ACG_PREVIEW/m-worldbook.png` | png | 设计文档 | 待确认 | 已忽略 | 用途待确认 |
| `docs/design/THEME_ACG_PREVIEW/preview-report.json` | json | 设计文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/design/THEME_BASE_PREVIEW/base-characters.png` | png | 设计文档 | 待确认 | 已忽略 | 用途待确认 |
| `docs/design/THEME_BASE_PREVIEW/base-chat.png` | png | 设计文档 | 待确认 | 已忽略 | 用途待确认 |
| `docs/design/THEME_BASE_PREVIEW/base-settings-appearance.png` | png | 设计文档 | 待确认 | 已忽略 | 用途待确认 |
| `docs/design/THEME_BASE_PREVIEW/base-worldbook.png` | png | 设计文档 | 待确认 | 已忽略 | 用途待确认 |
| `docs/design/THEME_BASE_PREVIEW/preview-report.json` | json | 设计文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/design/THEME_BRUTAL_SHOTS/` | 目录聚合 | 设计文档 | 主题"残酷测试"截图（角色列表 / 对话 / 外观设置 / 世界书，人工看配色是否破相）（共 4 个文件） | 已跟踪 |  |
| `docs/design/TOKEN_PILOT_2026-10-11.md` | md | 设计文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/design/UI_AUDIT_2026-10-16_双端UI与交互评审.md` | md | 设计文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/design/UX_IA_GUIDED_FLOW_DESIGN_2026-10-07.md` | md | 设计文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/design/ai-chat-ui-redesign/` | 目录聚合 | 设计文档 | AI 对话界面重设计静态原型（12 套主题 HTML + 演示 js + 页面生成工具）。2026-10-16 作为设计交付物入库，并在 tests/tooling/lint-scope.test.ts 里显式登记为"设计交付物、非产品代码"，因此不参与产品 lint（共 99 个文件） | 已跟踪 |  |
| `docs/design/character-status-hud-增量设计.md` | md | 设计文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/design/design-system-specification.md` | md | 设计文档 | 设计文档：设计系统规范（令牌 / 组件 / 移动端） | 已跟踪 |  |
| `docs/design/e00-decision.md` | md | 设计文档 | 设计文档：E-00 嵌入优化形态决策 | 已跟踪 |  |
| `docs/design/llm-controls-p0-增量设计.md` | md | 设计文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/design/mobile-ui-design.md` | md | 设计文档 | 设计文档：移动端 UI 设计（页面功能明细） | 已跟踪 |  |
| `docs/design/rag-enhancement-design.md` | md | 设计文档 | 设计文档：RAG 增强设计 | 已跟踪 |  |
| `docs/design/runtime-core-基线设计.md` | md | 设计文档 | 设计文档：Runtime Core 基线设计与并发、回放、审计边界 | 已跟踪 |  |
| `docs/design/software-design-document.md` | md | 设计文档 | 设计文档：软件设计说明书 | 已跟踪 |  |
| `docs/design/summarizer-接线设计.md` | md | 设计文档 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/design/threat-model.md` | md | 设计文档 | 设计文档：威胁模型（含提示词注入专项） | 已跟踪 |  |
| `docs/design/virtual-character-os-多角色群聊实施计划.md` | md | 设计文档 | 设计文档：多角色群聊与 PostgreSQL 群组事务实施计划及验证记录 | 已跟踪 |  |
| `docs/design/virtual-character-os-实现基线.md` | md | 设计文档 | 设计文档：Virtual Character OS 实现基线（Schema → Runtime → Emotion → Compiler → API） | 已跟踪 |  |

### 2.7 AI记忆（18）

| 相对路径 | 文件类型 | 分类 | 用途说明 | Git状态 | 备注 |
| --- | --- | --- | --- | --- | --- |
| `.workbuddy-ai/memory/2026-09-18.md` | md | AI记忆 | AI记忆：2026-09-18 工作日志 | 已忽略 |  |
| `.workbuddy-ai/memory/2026-09-20.md` | md | AI记忆 | AI记忆：2026-09-20 工作日志 | 已忽略 |  |
| `.workbuddy-ai/memory/2026-09-21.md` | md | AI记忆 | AI记忆：2026-09-21 工作日志 | 已忽略 |  |
| `.workbuddy-ai/memory/2026-09-22.md` | md | AI记忆 | AI记忆：2026-09-22 工作日志 | 已忽略 |  |
| `.workbuddy-ai/memory/2026-09-26.md` | md | AI记忆 | AI记忆：2026-09-26 工作日志 | 已忽略 |  |
| `.workbuddy-ai/memory/MEMORY.md` | md | AI记忆 | AI记忆：项目长期约定与结论 | 已忽略 |  |
| `.workbuddy/memory/2026-08-13.md` | md | AI记忆 | AI记忆：2026-08-13 工作日志 | 已忽略 |  |
| `.workbuddy/memory/2026-08-14.md` | md | AI记忆 | AI记忆：2026-08-14 工作日志 | 已忽略 |  |
| `.workbuddy/memory/2026-08-15.md` | md | AI记忆 | AI记忆：2026-08-15 工作日志 | 已忽略 |  |
| `.workbuddy/memory/2026-08-17.md` | md | AI记忆 | AI记忆：2026-08-17 工作日志 | 已忽略 |  |
| `.workbuddy/memory/2026-08-18.md` | md | AI记忆 | AI记忆：2026-08-18 工作日志 | 已忽略 |  |
| `.workbuddy/memory/2026-08-19.md` | md | AI记忆 | AI记忆：2026-08-19 工作日志 | 已忽略 |  |
| `.workbuddy/memory/2026-08-20.md` | md | AI记忆 | AI记忆：2026-08-20 工作日志 | 已忽略 |  |
| `.workbuddy/memory/2026-09-07.md` | md | AI记忆 | AI记忆：2026-09-07 工作日志 | 已忽略 |  |
| `.workbuddy/memory/2026-09-26.md` | md | AI记忆 | AI记忆：2026-09-26 工作日志 | 已忽略 |  |
| `.workbuddy/memory/2026-09-28.md` | md | AI记忆 | AI记忆：2026-09-28 工作日志 | 已忽略 |  |
| `.workbuddy/memory/2026-10-03.md` | md | AI记忆 | AI记忆：2026-10-03 工作日志 | 已忽略 |  |
| `.workbuddy/memory/MEMORY.md` | md | AI记忆 | AI记忆：项目长期记忆（已归档的跨会话结论） | 已忽略 |  |

### 2.8 截图（1）

| 相对路径 | 文件类型 | 分类 | 用途说明 | Git状态 | 备注 |
| --- | --- | --- | --- | --- | --- |
| `docs/assets/screenshots/` | 目录聚合 | 截图 | UI 冒烟截图（按路由与主题命名，由 scripts/ui-shot.mjs 生成）（共 132 个文件） | 已忽略 |  |

### 2.9 配置（17）

| 相对路径 | 文件类型 | 分类 | 用途说明 | Git状态 | 备注 |
| --- | --- | --- | --- | --- | --- |
| `.gitattributes` | gitattributes | 配置 | Git 属性（换行符与 LFS 规则，本地保留） | 已忽略 |  |
| `.github/workflows/ci.yml` | yml | 配置 | CI 流水线：i18n / 断点 / 对比度 / 覆盖率 / 构建 / E2E / Tauri 七道门禁 | 已跟踪 |  |
| `.gitignore` | gitignore | 配置 | Git 忽略规则（2026-10-16 起入库；此前自我忽略，导致 installer/ 等规则只存在于本机） | 已跟踪 |  |
| `.i18nignore` | i18nignore | 配置 | i18n 扫描忽略清单 | 已忽略 |  |
| `eslint.config.js` | js | 配置 | ESLint 扁平配置（Vue + TS） | 已跟踪 |  |
| `package-lock.json` | json | 配置 | npm 依赖锁定文件（自动生成） | 已跟踪 |  |
| `package.json` | json | 配置 | npm 清单：依赖、脚本、项目元信息（ai-roleplay v1.1.1） | 已跟踪 |  |
| `playwright.config.ts` | ts | 配置 | Playwright E2E 配置：testDir=e2e、本地 msedge / CI chromium | 已跟踪 |  |
| `reasonix.toml` | toml | 配置 | Reasonix 工具工作区配置 | 已跟踪 |  |
| `src-tauri/.gitignore` | gitignore | 配置 | 桌面端专属忽略规则 | 已跟踪 |  |
| `src-tauri/Cargo.toml` | toml | 配置 | Rust 依赖与 crate 元信息 | 已跟踪 |  |
| `src-tauri/capabilities/default.json` | json | 配置 | Tauri 2 权限能力声明 | 已跟踪 |  |
| `src-tauri/icons/` | 目录聚合 | 配置 | Tauri 应用图标资源（桌面 / Android / iOS 多尺寸 PNG / ICO / ICNS）（共 49 个文件） | 已跟踪 |  |
| `src-tauri/tauri.conf.json` | json | 配置 | Tauri 应用配置（窗口 / 本地打包） | 已跟踪 |  |
| `tsconfig.json` | json | 配置 | TypeScript 编译选项与路径映射 | 已跟踪 |  |
| `vite.config.ts` | ts | 配置 | Vite 构建配置：别名、代码分包、PWA 插件 | 已跟踪 |  |
| `vitest.config.ts` | ts | 配置 | Vitest 单测配置：jsdom 环境、覆盖率阈值门禁 | 已跟踪 |  |

### 2.10 脚本（43）

| 相对路径 | 文件类型 | 分类 | 用途说明 | Git状态 | 备注 |
| --- | --- | --- | --- | --- | --- |
| `scripts/android-apk.mjs` | mjs | 脚本 | 安卓出包：vite build → cap sync → gradlew assembleDebug → 复制进 installer/（需本机 JDK 21 与 Android SDK） | 已跟踪 |  |
| `scripts/archive/round3-settings-split/README.md` | md | 脚本 | 待确认 | 已跟踪 | 用途待确认 |
| `scripts/archive/round3-settings-split/apply-s1-toast.py` | py | 脚本 | 待确认 | 已跟踪 | 用途待确认 |
| `scripts/archive/round3-settings-split/debug-splitter.py` | py | 脚本 | 待确认 | 已跟踪 | 用途待确认 |
| `scripts/archive/round3-settings-split/post-split-fixups.py` | py | 脚本 | 待确认 | 已跟踪 | 用途待确认 |
| `scripts/archive/round3-settings-split/prune-settings-styles.py` | py | 脚本 | 待确认 | 已跟踪 | 用途待确认 |
| `scripts/archive/round3-settings-split/rewrite-settings-main.py` | py | 脚本 | 待确认 | 已跟踪 | 用途待确认 |
| `scripts/archive/round3-settings-split/run-opt8-pipeline.py` | py | 脚本 | 待确认 | 已跟踪 | 用途待确认 |
| `scripts/archive/round3-settings-split/split-settings-view.py` | py | 脚本 | 待确认 | 已跟踪 | 用途待确认 |
| `scripts/breakpoint-guard.mjs` | mjs | 脚本 | 门禁：禁止野断点、断点数值 L1/L4 同步校验 | 已跟踪 |  |
| `scripts/check-contrast.mjs` | mjs | 脚本 | 门禁：5 套主题关键色对对比度 ≥ AA | 已跟踪 |  |
| `scripts/check-ort-firstscreen.mjs` | mjs | 脚本 | 待确认 | 已跟踪 | 用途待确认 |
| `scripts/clean.mjs` | mjs | 脚本 | 待确认 | 已跟踪 | 用途待确认 |
| `scripts/contrast-audit.mjs` | mjs | 脚本 | 审计：对比度全量扫描报告 | 已跟踪 |  |
| `scripts/csp-audit.mjs` | mjs | 脚本 | 工具：CSP 运行时审计（真实浏览器监听 securitypolicyviolation，手动诊断用） | 已跟踪 |  |
| `scripts/csp-guard.mjs` | mjs | 脚本 | 门禁：Web 端 CSP 契约校验（构建产物含 CSP、关键指令齐备、script-src 未被削弱） | 已跟踪 |  |
| `scripts/css-conventions-guard.mjs` | mjs | 脚本 | 门禁：CSS 约定守卫单一入口（编排断点 / 视口 / hover / !important / 控件字号五项子检查） | 已跟踪 |  |
| `scripts/css-viewport-guard.mjs` | mjs | 脚本 | 门禁：CSS 视口单位使用校验 | 已跟踪 |  |
| `scripts/e2e-shard-groups.mjs` | mjs | 脚本 | 待确认 | 已跟踪 | 用途待确认 |
| `scripts/eval-run.mjs` | mjs | 脚本 | 待确认 | 已跟踪 | 用途待确认 |
| `scripts/gen-project-index.mjs` | mjs | 脚本 | 工具：生成本索引文件 | 已修改 |  |
| `scripts/generate-pwa-icons.mjs` | mjs | 脚本 | 工具：由 icon-source.png 生成 PWA 图标到 public/ | 已跟踪 |  |
| `scripts/hover-guard.mjs` | mjs | 脚本 | 门禁：禁止未按 (hover: hover) 分流的 :hover，防触屏 tap 后 hover 粘滞 | 已跟踪 |  |
| `scripts/i18n-scan.mjs` | mjs | 脚本 | 门禁：硬编码中文 UI 文案扫描（strict 模式） | 已跟踪 |  |
| `scripts/i7-control-font-size-guard.mjs` | mjs | 脚本 | 门禁：移动断点内可编辑控件字号 ≥16px 兜底（I-7，防 iOS 聚焦放大页面） | 已跟踪 |  |
| `scripts/important-guard.mjs` | mjs | 脚本 | 门禁：!important 棘轮守卫（基线锁定，只许降不许升） | 已跟踪 |  |
| `scripts/measure-startup.mjs` | mjs | 脚本 | 待确认 | 已跟踪 | 用途待确认 |
| `scripts/no-artifact-in-git-guard.mjs` | mjs | 脚本 | 门禁：安装包与大二进制不许进 git（按扩展名与 1 MiB 阈值扫 git 索引，附 --self-test） | 已跟踪 |  |
| `scripts/opt-eval.mjs` | mjs | 脚本 | 待确认 | 已跟踪 | 用途待确认 |
| `scripts/p11-baseline.mjs` | mjs | 脚本 | 测量：P11 性能基线采集 | 已跟踪 |  |
| `scripts/p11-scroll-fps.mjs` | mjs | 脚本 | 测量：滚动帧率采集 | 已跟踪 |  |
| `scripts/perf-analysis.mjs` | mjs | 脚本 | 待确认 | 已跟踪 | 用途待确认 |
| `scripts/release-evidence-pack.mjs` | mjs | 脚本 | 待确认 | 已跟踪 | 用途待确认 |
| `scripts/release-evidence.mjs` | mjs | 脚本 | 门禁：生成绑定当前 commit 的 1.0.0 发布证据清单 | 已跟踪 |  |
| `scripts/save-blob-guard.mjs` | mjs | 脚本 | 待确认 | 已跟踪 | 用途待确认 |
| `scripts/settings-screenshots.mjs` | mjs | 脚本 | 待确认 | 已跟踪 | 用途待确认 |
| `scripts/skin-preview.mjs` | mjs | 脚本 | 工具：把原型配色注入真实产品页面，出截图并逐元素实测 WCAG 对比度（换肤评审用） | 已跟踪 |  |
| `scripts/snapshot-migration-report.mjs` | mjs | 脚本 | 待确认 | 已跟踪 | 用途待确认 |
| `scripts/sync-runtime-schema.mjs` | mjs | 脚本 | 门禁：校验迁移文件与权威 Schema 文档无漂移（--check 只读比对） | 已跟踪 |  |
| `scripts/token-guard.mjs` | mjs | 脚本 | 门禁：token 死引用按文件棘轮（--strict 卡新增裸引用未定义变量）+ 合成夹具自测（--self-test），无参数时输出 A/B/C/D 四类体检 | 已跟踪 |  |
| `scripts/ui-shot.mjs` | mjs | 脚本 | 工具：遍历路由批量截图到 docs/assets/screenshots/ | 已跟踪 |  |
| `scripts/vendor-fonts.mjs` | mjs | 脚本 | 工具：把 Google Fonts 镜像到 public/fonts/，消除第三方字体请求（支持 --check 供校验） | 已跟踪 |  |
| `scripts/vendor-ort.mjs` | mjs | 脚本 | 待确认 | 已跟踪 | 用途待确认 |

### 2.11 其他（368）

| 相对路径 | 文件类型 | 分类 | 用途说明 | Git状态 | 备注 |
| --- | --- | --- | --- | --- | --- |
| `.zcodeignore` | zcodeignore | 其他 | 待确认 | 已跟踪 | 用途待确认 |
| `LICENSE` | (无扩展名) | 其他 | Apache-2.0 许可证全文 | 已跟踪 |  |
| `android/.gitignore` | gitignore | 其他 | 待确认 | 已跟踪 | 用途待确认 |
| `android/.gradle/8.14.3/gc.properties` | properties | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/.gradle/buildOutputCleanup/cache.properties` | properties | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/.gradle/file-system.probe` | probe | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/.gradle/vcs-1/gc.properties` | properties | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/.gitignore` | gitignore | 其他 | 待确认 | 已跟踪 | 用途待确认 |
| `android/app/build.gradle` | gradle | 其他 | 待确认 | 已跟踪 | 用途待确认 |
| `android/app/capacitor.build.gradle` | gradle | 其他 | 待确认 | 已跟踪 | 用途待确认 |
| `android/app/proguard-rules.pro` | pro | 其他 | 待确认 | 已跟踪 | 用途待确认 |
| `android/app/src/androidTest/java/com/getcapacitor/myapp/ExampleInstrumentedTest.java` | java | 其他 | 待确认 | 已跟踪 | 用途待确认 |
| `android/app/src/main/AndroidManifest.xml` | xml | 其他 | 待确认 | 已跟踪 | 用途待确认 |
| `android/app/src/main/assets/capacitor.config.json` | json | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/capacitor.plugins.json` | json | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/ai-roleplay-dev-plan.html` | html | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/apple-touch-icon.png` | png | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/ArchivesView-DQEDWdBF.css` | css | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/ArchivesView-bLWSv1ZF.js` | js | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/ArchivesView-bLWSv1ZF.js.map` | map | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/Avatar-CDmn-nJB.js` | js | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/Avatar-CDmn-nJB.js.map` | map | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/CharacterEditorView-CjL17cPy.js` | js | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/CharacterEditorView-CjL17cPy.js.map` | map | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/CharacterEditorView-DYRGy1wx.css` | css | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/CharacterVersionView-6yEkf8yy.js` | js | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/CharacterVersionView-6yEkf8yy.js.map` | map | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/CharacterVersionView-Di9tT_wg.css` | css | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/CharactersView-CJA-i3QP.css` | css | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/CharactersView-Ch4tLfSR.js` | js | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/CharactersView-Ch4tLfSR.js.map` | map | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/ChatView-BtyNxkDb.js` | js | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/ChatView-BtyNxkDb.js.map` | map | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/ChatView-V4rxqupa.css` | css | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/Collapse-Dhev9g7M.css` | css | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/Collapse-xxEhs0Wf.js` | js | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/Collapse-xxEhs0Wf.js.map` | map | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/CommunityMarketView-81HU5dZp.css` | css | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/CommunityMarketView-xlXPCgRz.js` | js | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/CommunityMarketView-xlXPCgRz.js.map` | map | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/DataBankView-DYBlKRby.css` | css | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/DataBankView-DitJXvsK.js` | js | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/DataBankView-DitJXvsK.js.map` | map | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/EmptyState-BdPYenTQ.js` | js | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/EmptyState-BdPYenTQ.js.map` | map | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/EmptyState-iObS_XYy.css` | css | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/FilterTabs-BbPgDOzW.js` | js | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/FilterTabs-BbPgDOzW.js.map` | map | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/FilterTabs-CoQ_3RxU.css` | css | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/FormField-36RJJLI6.js` | js | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/FormField-36RJJLI6.js.map` | map | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/FormField-BmE8YnQy.css` | css | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/GroupChatView-CBH4jEhY.js` | js | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/GroupChatView-CBH4jEhY.js.map` | map | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/GroupChatView-DEgKg9we.css` | css | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/GuideView-C4wjDq3Z.js` | js | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/GuideView-C4wjDq3Z.js.map` | map | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/GuideView-DzuQXeRn.css` | css | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/GuidedTasksCard-CsREoG54.css` | css | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/GuidedTasksCard-Cz6PO_Vs.js` | js | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/GuidedTasksCard-Cz6PO_Vs.js.map` | map | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/ImageGeneratorView-BLZ7olzR.css` | css | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/ImageGeneratorView-C1sXDgt1.js` | js | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/ImageGeneratorView-C1sXDgt1.js.map` | map | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/LocalModelView-C2zeqR8g.css` | css | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/LocalModelView-COxfCcuN.js` | js | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/LocalModelView-COxfCcuN.js.map` | map | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/MoreView-Bq895ixm.css` | css | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/MoreView-CKs9maHx.js` | js | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/MoreView-CKs9maHx.js.map` | map | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/PrereqNotice-8t6SwV9x.js` | js | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/PrereqNotice-8t6SwV9x.js.map` | map | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/PrereqNotice-DTyHmKc1.css` | css | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/RandomEventsView-7QjXkZbT.css` | css | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/RandomEventsView-CXF34OsJ.js` | js | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/RandomEventsView-CXF34OsJ.js.map` | map | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/RuntimeStatePanel-Bc2qPajA.css` | css | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/RuntimeStatePanel-CgkSgKEV.js` | js | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/RuntimeStatePanel-CgkSgKEV.js.map` | map | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/SettingsView-BHvigxoB.js` | js | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/SettingsView-BHvigxoB.js.map` | map | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/SettingsView-Dg5JeFud.css` | css | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/StepFlow-0AN-BAXG.css` | css | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/StepFlow-CC9j5fAu.js` | js | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/StepFlow-CC9j5fAu.js.map` | map | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/StoryEngineView-CnYhWY1f.js` | js | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/StoryEngineView-CnYhWY1f.js.map` | map | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/StoryEngineView-DfCfAydj.css` | css | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/WorldBookView-DJl3j2Lh.js` | js | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/WorldBookView-DJl3j2Lh.js.map` | map | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/WorldBookView-qWgTeAlT.css` | css | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/character-generator-AyJ95TzA.js` | js | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/character-generator-AyJ95TzA.js.map` | map | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/chat-Cg_zDZ_A.js` | js | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/chat-Cg_zDZ_A.js.map` | map | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/chat-context-D7MO1_gB.js` | js | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/chat-context-D7MO1_gB.js.map` | map | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/chat-generation-B0cQHRlK.js` | js | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/chat-generation-B0cQHRlK.js.map` | map | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/core-0_kFspMt.js` | js | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/core-0_kFspMt.js.map` | map | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/creation-preset-BgBSKt66.js` | js | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/creation-preset-BgBSKt66.js.map` | map | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/dual-channel-runtime-C-Reco1H.js` | js | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/dual-channel-runtime-C-Reco1H.js.map` | map | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/event-CfcUJN_e.js` | js | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/event-CfcUJN_e.js.map` | map | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/gpt-tokenizer-cVqiqDzj.js` | js | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/gpt-tokenizer-cVqiqDzj.js.map` | map | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/hero-cyber-nexus.jpg` | jpg | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/hero-seraphina.jpg` | jpg | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/i18n-004braeY.js` | js | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/i18n-004braeY.js.map` | map | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/icons/dl_builtin_tik_tok/arrow-left.svg` | svg | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/icons/dl_builtin_tik_tok/bookmark-simple.svg` | svg | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/icons/dl_builtin_tik_tok/chat-circle.svg` | svg | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/icons/dl_builtin_tik_tok/compass.svg` | svg | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/icons/dl_builtin_tik_tok/gear.svg` | svg | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/icons/dl_builtin_tik_tok/heart.svg` | svg | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/icons/dl_builtin_tik_tok/house.svg` | svg | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/icons/dl_builtin_tik_tok/music-notes.svg` | svg | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/icons/dl_builtin_tik_tok/play.svg` | svg | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/icons/dl_builtin_tik_tok/plus.svg` | svg | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/icons/dl_builtin_tik_tok/share-fat.svg` | svg | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/icons/dl_builtin_tik_tok/user.svg` | svg | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/index-BSsvpeZi.css` | css | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/index-zTnH9pi5.js` | js | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/index-zTnH9pi5.js.map` | map | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/local-model-BUyudfhN.js` | js | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/local-model-BUyudfhN.js.map` | map | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/logger-ClF1aBez.js` | js | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/logger-ClF1aBez.js.map` | map | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/model-fs-ipc-Dn5a3uqg.js` | js | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/model-fs-ipc-Dn5a3uqg.js.map` | map | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/onnx-embedding-provider-DeZOWLeY.js` | js | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/onnx-embedding-provider-DeZOWLeY.js.map` | map | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/pinia-BRGKkXGX.js` | js | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/pinia-BRGKkXGX.js.map` | map | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/preload-helper-Czpn1I53.js` | js | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/rag-benchmark-CD__oCay.js` | js | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/rag-benchmark-CD__oCay.js.map` | map | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/rag-retriever-CvzzWSlS.js` | js | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/rag-retriever-CvzzWSlS.js.map` | map | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/remote-api-key-state-DDFZ2BBS.js` | js | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/remote-api-key-state-DDFZ2BBS.js.map` | map | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/rolldown-runtime-DK3Fl9T5.js` | js | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/settings-5AEdXH-u.js` | js | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/settings-5AEdXH-u.js.map` | map | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/snapshot-plans-aa8sPhoh.js` | js | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/snapshot-plans-aa8sPhoh.js.map` | map | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/stopword-filter-BukuGxAo.js` | js | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/stopword-filter-BukuGxAo.js.map` | map | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/story-CsS_Yhyb.js` | js | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/story-CsS_Yhyb.js.map` | map | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/token-counter-Cz2hHr-h.js` | js | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/token-counter-Cz2hHr-h.js.map` | map | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/type-adapters-BnBjzHO6.js` | js | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/type-adapters-BnBjzHO6.js.map` | map | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/useDeepLinkId-BYHDZal_.js` | js | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/useDeepLinkId-BYHDZal_.js.map` | map | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/useSectionMemory-hKv0RiPP.js` | js | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/useSectionMemory-hKv0RiPP.js.map` | map | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/vector-model-install-Dd0GShzT.js` | js | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/vector-model-install-Dd0GShzT.js.map` | map | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/vector-model-storage-K7X9HArW.js` | js | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/vector-model-storage-K7X9HArW.js.map` | map | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/vector-model-tauri-CdVoj_AB.js` | js | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/vector-model-tauri-CdVoj_AB.js.map` | map | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/web-llm-tDiHn3lA.js` | js | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/assets/web-llm-tDiHn3lA.js.map` | map | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/cordova.js` | js | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/cordova_plugins.js` | js | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7kq-Wbghq.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7kq6Wbghq.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7kqGWbg.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7kqWWbghq.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.100.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.101.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.102.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.103.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.104.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.105.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.106.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.107.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.108.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.109.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.110.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.111.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.112.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.113.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.114.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.115.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.116.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.117.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.118.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.119.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.21.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.22.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.23.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.24.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.25.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.26.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.27.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.28.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.29.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.30.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.31.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.32.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.33.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.34.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.35.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.36.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.37.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.38.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.39.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.4.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.40.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.41.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.42.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.43.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.44.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.45.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.46.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.47.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.48.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.49.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.5.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.50.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.51.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.52.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.53.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.54.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.55.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.56.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.57.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.58.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.59.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.6.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.60.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.61.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.62.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.63.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.64.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.65.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.66.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.67.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.68.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.69.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.70.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.71.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.72.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.73.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.74.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.75.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.76.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.77.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.78.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.79.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.80.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.81.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.82.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.83.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.84.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.85.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.86.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.87.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.88.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.89.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.90.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.91.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.97.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.98.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/H4chBXePl9DZ0Xe7gG9cyOj7oqP0dTpxZbB9E9gjjmzKvaeKHUTtJDWv3z-us4bxD8F5og.99.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/fonts.css` | css | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/nuFiD-vYSZviVYUb_rj3ij__anPXDTLYgFE_.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/nuFiD-vYSZviVYUb_rj3ij__anPXDTPYgFE_.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/nuFiD-vYSZviVYUb_rj3ij__anPXDTjYgFE_.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/fonts/nuFiD-vYSZviVYUb_rj3ij__anPXDTzYgA.woff2` | woff2 | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/index.html` | html | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/pwa-192x192.png` | png | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/pwa-512x512.png` | png | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/pwa-icon.svg` | svg | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/assets/public/sillytavern-vs-airoleplay.html` | html | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/java/com/zhuweib/airoleplay/MainActivity.java` | java | 其他 | 待确认 | 已跟踪 | 用途待确认 |
| `android/app/src/main/res/drawable-land-hdpi/splash.png` | png | 其他 | 待确认 | 已跟踪 | 用途待确认 |
| `android/app/src/main/res/drawable-land-mdpi/splash.png` | png | 其他 | 待确认 | 已跟踪 | 用途待确认 |
| `android/app/src/main/res/drawable-land-xhdpi/splash.png` | png | 其他 | 待确认 | 已跟踪 | 用途待确认 |
| `android/app/src/main/res/drawable-land-xxhdpi/splash.png` | png | 其他 | 待确认 | 已跟踪 | 用途待确认 |
| `android/app/src/main/res/drawable-land-xxxhdpi/splash.png` | png | 其他 | 待确认 | 已跟踪 | 用途待确认 |
| `android/app/src/main/res/drawable-port-hdpi/splash.png` | png | 其他 | 待确认 | 已跟踪 | 用途待确认 |
| `android/app/src/main/res/drawable-port-mdpi/splash.png` | png | 其他 | 待确认 | 已跟踪 | 用途待确认 |
| `android/app/src/main/res/drawable-port-xhdpi/splash.png` | png | 其他 | 待确认 | 已跟踪 | 用途待确认 |
| `android/app/src/main/res/drawable-port-xxhdpi/splash.png` | png | 其他 | 待确认 | 已跟踪 | 用途待确认 |
| `android/app/src/main/res/drawable-port-xxxhdpi/splash.png` | png | 其他 | 待确认 | 已跟踪 | 用途待确认 |
| `android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml` | xml | 其他 | 待确认 | 已跟踪 | 用途待确认 |
| `android/app/src/main/res/drawable/ic_launcher_background.xml` | xml | 其他 | 待确认 | 已跟踪 | 用途待确认 |
| `android/app/src/main/res/drawable/splash.png` | png | 其他 | 待确认 | 已跟踪 | 用途待确认 |
| `android/app/src/main/res/layout/activity_main.xml` | xml | 其他 | 待确认 | 已跟踪 | 用途待确认 |
| `android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml` | xml | 其他 | 待确认 | 已跟踪 | 用途待确认 |
| `android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml` | xml | 其他 | 待确认 | 已跟踪 | 用途待确认 |
| `android/app/src/main/res/mipmap-hdpi/ic_launcher.png` | png | 其他 | 待确认 | 已跟踪 | 用途待确认 |
| `android/app/src/main/res/mipmap-hdpi/ic_launcher_foreground.png` | png | 其他 | 待确认 | 已跟踪 | 用途待确认 |
| `android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png` | png | 其他 | 待确认 | 已跟踪 | 用途待确认 |
| `android/app/src/main/res/mipmap-mdpi/ic_launcher.png` | png | 其他 | 待确认 | 已跟踪 | 用途待确认 |
| `android/app/src/main/res/mipmap-mdpi/ic_launcher_foreground.png` | png | 其他 | 待确认 | 已跟踪 | 用途待确认 |
| `android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png` | png | 其他 | 待确认 | 已跟踪 | 用途待确认 |
| `android/app/src/main/res/mipmap-xhdpi/ic_launcher.png` | png | 其他 | 待确认 | 已跟踪 | 用途待确认 |
| `android/app/src/main/res/mipmap-xhdpi/ic_launcher_foreground.png` | png | 其他 | 待确认 | 已跟踪 | 用途待确认 |
| `android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png` | png | 其他 | 待确认 | 已跟踪 | 用途待确认 |
| `android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png` | png | 其他 | 待确认 | 已跟踪 | 用途待确认 |
| `android/app/src/main/res/mipmap-xxhdpi/ic_launcher_foreground.png` | png | 其他 | 待确认 | 已跟踪 | 用途待确认 |
| `android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png` | png | 其他 | 待确认 | 已跟踪 | 用途待确认 |
| `android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png` | png | 其他 | 待确认 | 已跟踪 | 用途待确认 |
| `android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png` | png | 其他 | 待确认 | 已跟踪 | 用途待确认 |
| `android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png` | png | 其他 | 待确认 | 已跟踪 | 用途待确认 |
| `android/app/src/main/res/values/ic_launcher_background.xml` | xml | 其他 | 待确认 | 已跟踪 | 用途待确认 |
| `android/app/src/main/res/values/strings.xml` | xml | 其他 | 待确认 | 已跟踪 | 用途待确认 |
| `android/app/src/main/res/values/styles.xml` | xml | 其他 | 待确认 | 已跟踪 | 用途待确认 |
| `android/app/src/main/res/xml/config.xml` | xml | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/app/src/main/res/xml/file_paths.xml` | xml | 其他 | 待确认 | 已跟踪 | 用途待确认 |
| `android/app/src/test/java/com/getcapacitor/myapp/ExampleUnitTest.java` | java | 其他 | 待确认 | 已跟踪 | 用途待确认 |
| `android/build.gradle` | gradle | 其他 | 待确认 | 已跟踪 | 用途待确认 |
| `android/capacitor-cordova-android-plugins/build.gradle` | gradle | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/capacitor-cordova-android-plugins/cordova.variables.gradle` | gradle | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/capacitor-cordova-android-plugins/src/main/AndroidManifest.xml` | xml | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/capacitor-cordova-android-plugins/src/main/java/.gitkeep` | gitkeep | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/capacitor-cordova-android-plugins/src/main/res/.gitkeep` | gitkeep | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/capacitor.settings.gradle` | gradle | 其他 | 待确认 | 已跟踪 | 用途待确认 |
| `android/gradle.properties` | properties | 其他 | 待确认 | 已跟踪 | 用途待确认 |
| `android/gradle/wrapper/gradle-wrapper.jar` | jar | 其他 | 待确认 | 已跟踪 | 用途待确认 |
| `android/gradle/wrapper/gradle-wrapper.properties` | properties | 其他 | 待确认 | 已跟踪 | 用途待确认 |
| `android/gradlew` | (无扩展名) | 其他 | 待确认 | 已跟踪 | 用途待确认 |
| `android/gradlew.bat` | bat | 其他 | 待确认 | 已跟踪 | 用途待确认 |
| `android/local.properties` | properties | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `android/settings.gradle` | gradle | 其他 | 待确认 | 已跟踪 | 用途待确认 |
| `android/variables.gradle` | gradle | 其他 | 待确认 | 已跟踪 | 用途待确认 |
| `capacitor.config.ts` | ts | 其他 | 模块：capacitor.config（待确认具体功能） | 已跟踪 | 用途待确认 |
| `docs/Virtual-Character-OS-v1.0-database-schema.sql.md` | md | 其他 | 设计文档：Virtual Character OS 权威 Schema（迁移文件的事实源） | 已跟踪 |  |
| `docs/Virtual-Character-OS-v1.0-技术规格.md` | md | 其他 | 设计文档：Virtual Character OS v1.0 技术规格 | 已跟踪 |  |
| `docs/Virtual-Character-OS-v1.0-数据库-Schema-设计说明.md` | md | 其他 | 设计文档：Virtual Character OS 数据库 Schema 设计说明 | 已跟踪 |  |
| `docs/other/dialogue-experience-评估与选型建议.md` | md | 其他 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/other/dialogue-models-选型调研.md` | md | 其他 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/other/tifa-ollama-webui-产品分析.md` | md | 其他 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/other/tifa-ollama-webui-分析汇总.md` | md | 其他 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/other/tifa-ollama-webui-架构评审.md` | md | 其他 | 待确认 | 已跟踪 | 用途待确认 |
| `docs/other/项目文档结构.md` | md | 其他 | 其他：项目文档分类规范 | 已跟踪 |  |
| `docs/对话记录.md` | md | 其他 | 其他：需求讨论与实施对话原始记录 | 已跟踪 |  |
| `eval/setting-facts-dataset.v1.json` | json | 其他 | 待确认 | 已跟踪 | 用途待确认 |
| `icon-source.png` | png | 其他 | 应用图标设计源图（生成 PWA / Tauri 图标用） | 已跟踪 |  |
| `installer/AI酒馆-1.0.0-debug.apk` | apk | 其他 | 待确认 | 已忽略 | 用途待确认 |
| `market/cards/seraphina.json` | json | 其他 | 社区市场示例：角色卡数据 | 已跟踪 |  |
| `market/index.json` | json | 其他 | 社区市场索引（角色卡 / 模板清单） | 已跟踪 |  |
| `market/items/character-echo.json` | json | 其他 | 社区市场条目：角色 Echo | 已跟踪 |  |
| `market/items/character-seraphina.json` | json | 其他 | 社区市场条目：角色 Seraphina | 已跟踪 |  |
| `market/items/template-apocalypse.json` | json | 其他 | 社区市场条目：末世题材模板 | 已跟踪 |  |
| `market/items/template-fantasy.json` | json | 其他 | 社区市场条目：奇幻题材模板 | 已跟踪 |  |
| `market/items/template-sci-fi.json` | json | 其他 | 社区市场条目：科幻题材模板 | 已跟踪 |  |
| `market/items/worldbook-midgard.json` | json | 其他 | 社区市场条目：世界书 Midgard | 已跟踪 |  |
| `migrations/001_virtual_character_os.sql` | sql | 其他 | 数据库迁移：Virtual Character OS 权威 Schema 的可执行副本（含旧部署幂等升级） | 已跟踪 |  |
| `public/apple-touch-icon.png` | png | 其他 | iOS 主屏图标 | 已跟踪 |  |
| `public/assets/hero-cyber-nexus.jpg` | jpg | 其他 | 首页主视觉图（赛博主题） | 已跟踪 |  |
| `public/assets/hero-seraphina.jpg` | jpg | 其他 | 首页主视觉图（角色主题） | 已跟踪 |  |
| `public/assets/icons/dl_builtin_tik_tok/` | 目录聚合 | 其他 | 内置线性图标集（SVG，11 个）（共 12 个文件） | 已跟踪 |  |
| `public/fonts/` | 目录聚合 | 其他 | 本地镜像字体分片（Playfair Display 拉丁 + Noto Serif SC 中文，105 个 unicode-range 分片；由 scripts/vendor-fonts.mjs 生成，不参与 PWA 预缓存）（共 106 个文件） | 已跟踪 |  |
| `public/pwa-192x192.png` | png | 其他 | PWA 图标 192×192 | 已跟踪 |  |
| `public/pwa-512x512.png` | png | 其他 | PWA 图标 512×512 | 已跟踪 |  |
| `public/pwa-icon.svg` | svg | 其他 | PWA 图标（矢量） | 已跟踪 |  |
| `未命名.base` | base | 其他 | 待确认 | 已忽略 | 用途待确认 |

## 三、分类汇总

| 分类 | 文件数 | 说明 |
| --- | --- | --- |
| 程序 | 267 | src/ 前端源码与 src-tauri/src/ Rust 源码、index.html |
| 测试 | 265 | tests/ 单元与组件测试、e2e/ Playwright 场景 |
| 产品文档 | 1 | public/ 产品对比静态页（docs/product/ 为本地专用目录，已排除） |
| 开发文档 | 166 | docs/dev/ 实现计划、Runbook、审计记录 |
| 修复文档 | 17 | docs/fixes/ 缺陷评审、修复交付与进度台账 |
| 设计文档 | 86 | docs/design/ 设计系统、软件设计、移动端设计、威胁模型、决策文档 |
| AI记忆 | 18 | .workbuddy/memory/ 与 .workbuddy-ai/memory/ 项目记忆与跨会话结论 |
| 截图 | 1 | docs/assets/screenshots/ 下 UI 冒烟截图 |
| 配置 | 17 | 构建、CI、Tauri 应用与根级工程配置 |
| 脚本 | 43 | scripts/ 门禁、审计与工具脚本 |
| 其他 | 368 | docs/other/ 文档体系规范，以及静态资源、市场数据、许可证、图标等 |
| **合计** | **1249** | 与「收录文件」数一致 |

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
7. 目录结构变更请同步记录到 `docs/dev/MIGRATION_LOG.md`。
