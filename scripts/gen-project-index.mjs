#!/usr/bin/env node
/**
 * PROJECT_INDEX.md 生成器
 *
 * 用法：node scripts/gen-project-index.mjs
 * 输出：<项目根>/PROJECT_INDEX.md
 *
 * 设计约束（见 PROJECT_INDEX.md「维护说明」）：
 * - 全部使用相对路径，不写入任何绝对路径，避免泄露本机目录信息
 * - 排除依赖目录、构建产物、证书密钥、数据库、大二进制与日志
 * - 对敏感文件只记录路径与分类，绝不读取内容
 * - 不执行任何 git 写操作（只读 git ls-files / status / check-ignore）
 *
 * 2026-09-18 目录整理时新增，变更记录见 MIGRATION_LOG.md
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_FILE = path.join(ROOT, 'PROJECT_INDEX.md');

/** 按目录名排除（含依赖、构建产物、缓存、测试输出） */
const EXCLUDE_DIR_NAMES = new Set([
  '.git', '.svn', '.hg', 'node_modules', 'vendor', '.venv', 'venv', 'env',
  // IDE 工程元数据（非项目内容；通常已被 .gitignore 忽略，不应进入索引）
  '.idea', '.vscode',
  '__pycache__', 'dist', 'build', 'out', 'coverage', '.next', '.nuxt',
  '.cache', '.parcel-cache', 'artifacts', 'model', 'target',
  'test-results', 'playwright-report',
]);

/** 按相对路径排除（生成物 / 体量过大的运行时记录） */
const EXCLUDE_REL_DIRS = new Set([
  '.reasonix/tasks',
  '.reasonix/attachments',
  '.reasonix/reports',
  'src-tauri/gen',
]);

/** 按文件名排除（密钥、证书、数据库、日志、大二进制、锁文件） */
const EXCLUDE_FILE_RES = [
  /\.log$/i,
  /\.tmp$/i,
  /\.lock$/i,
  /^\.env/i,
  /\.(pem|key|p12|pfx|crt|cer|der|jks|keystore|pub)$/i,
  /\.(db|sqlite|sqlite3|mdb|accdb|db-journal)$/i,
  /\.(onnx|bin|pdb|rmeta|rlib|exe|dll|lib|so|dylib|a|o|obj)$/i,
  /\.(sample|rev|pack|idx)$/i,
];

/** 同质化资源目录：整体聚合为一行，避免索引被图片刷屏 */
const AGGREGATE_DIRS = {
  'src-tauri/icons': 'Tauri 应用图标资源（桌面 / Android / iOS 多尺寸 PNG / ICO / ICNS）',
  'public/assets/icons/dl_builtin_tik_tok': '内置线性图标集（SVG，11 个）',
  'docs/assets/screenshots': 'UI 冒烟截图（按路由与主题命名，由 scripts/ui-shot.mjs 生成）',
  'public/fonts':
    '本地镜像字体分片（Playfair Display 拉丁 + Noto Serif SC 中文，105 个 unicode-range 分片；由 scripts/vendor-fonts.mjs 生成，不参与 PWA 预缓存）',
};

/** 人工核对过的用途说明（优先级最高，避免用文件名臆测） */
const CURATED = {
  'index.html': 'Vite 入口 HTML，挂载 #app',
  'package.json': 'npm 清单：依赖、脚本、项目元信息（ai-roleplay v0.2.0）',
  'package-lock.json': 'npm 依赖锁定文件（自动生成）',
  'vite.config.ts': 'Vite 构建配置：别名、代码分包、PWA 插件',
  'vitest.config.ts': 'Vitest 单测配置：jsdom 环境、覆盖率阈值门禁',
  'playwright.config.ts': 'Playwright E2E 配置：testDir=e2e、本地 msedge / CI chromium',
  'tsconfig.json': 'TypeScript 编译选项与路径映射',
  'eslint.config.js': 'ESLint 扁平配置（Vue + TS）',
  'reasonix.toml': 'Reasonix 工具工作区配置',
  '.gitignore': 'Git 忽略规则（本地保留，不提交）',
  '.gitattributes': 'Git 属性（换行符与 LFS 规则，本地保留）',
  '.i18nignore': 'i18n 扫描忽略清单',
  'README.md': '项目主说明（中文）',
  'README-EN.md': '项目说明（英文版）',
  'CHANGELOG.md': '版本变更日志',
  'CONTRIBUTING.md': '贡献指南',
  'THIRD_PARTY_NOTICES.md': '第三方组件许可声明',
  'LICENSE': 'Apache-2.0 许可证全文',
  'icon-source.png': '应用图标设计源图（生成 PWA / Tauri 图标用）',
  'PROJECT_INDEX.md': '本索引文件（由 scripts/gen-project-index.mjs 生成）',
  'MIGRATION_LOG.md': '目录整理迁移日志',

  '.github/workflows/ci.yml': 'CI 流水线：i18n / 断点 / 对比度 / 覆盖率 / 构建 / E2E / Tauri 七道门禁',

  'src/main.ts': '应用引导入口：创建 Vue 实例、注册 Pinia 与路由',
  'src/App.vue': '根组件：全局布局、主题注入、移动端适配',
  'src/shims-vue.d.ts': '*.vue 模块类型声明',
  'src/vite-env.d.ts': 'Vite 环境变量与静态资源类型声明',
  'src/router/index.ts': 'Vue Router 路由表',
  'src/types/index.ts': '全局共享类型定义',
  'src/data/mock-data.ts': '开发/测试用示例数据',
  'src/utils/onboarding.ts': '新手引导状态读写（完成标志值为 "1"）',
  'src/composables/useScrollLock.ts': '组合式函数：滚动锁定',

  'src/api/index.ts': 'API 层出口，按运行环境选择客户端实现',
  'src/api/types.ts': 'API 请求/响应类型定义',
  'src/api/api-client.ts': '统一 API 客户端抽象',
  'src/api/local-api-client.ts': '本地模型 API 客户端（web-llm 引擎）',
  'src/api/tauri-openai-client.ts': 'Tauri 侧 OpenAI 兼容客户端',
  'src/api/openai-client.ts': 'OpenAI 协议客户端',
  'src/api/openai-protocol.ts': 'OpenAI 协议报文构造与解析',
  'src/api/anthropic-client.ts': 'Anthropic 协议客户端',
  'src/api/anthropic-protocol.ts': 'Anthropic 协议报文构造与解析',
  'src/api/diagnostics.ts': 'API 连通性诊断与错误归类',

  'src/storage/index.ts': '存储层出口，按环境选择适配器',
  'src/storage/types.ts': '存储层接口与数据类型',
  'src/storage/storage-adapter.ts': '存储适配器接口定义',
  'src/storage/storage-factory.ts': '存储适配器工厂（Web / Tauri 分流）',
  'src/storage/indexeddb-adapter.ts': 'IndexedDB 存储适配器（Web 端）',
  'src/storage/tauri-fs-adapter.ts': 'Tauri 文件系统存储适配器（桌面端）',
  'src/storage/legacy-migration.ts': '历史数据格式迁移',

  'src/runtime/types.ts': 'Virtual Character OS Runtime 领域类型与 API 契约',
  'src/runtime/emotion-engine.ts': 'Virtual Character OS 情绪衰减、Episode 与 Salience 引擎',
  'src/runtime/character-compiler.ts': 'Virtual Character OS Archetype + Delta + Seed Memories 编译器',
  'src/runtime/store.ts': 'Virtual Character OS Runtime Snapshot 存储接口与适配器',
  'src/runtime/postgres-store.ts': 'Virtual Character OS PostgreSQL RuntimeStore 与事务边界',
  'src/runtime/chat-bridge.ts': 'Virtual Character OS 聊天链路 Runtime Context 与 Event 桥接',
  'src/runtime/context-builder.ts': 'Virtual Character OS 上下文构建器',
  'src/runtime/runtime-core.ts': 'Virtual Character OS Runtime Core 状态归约主链',
  'src/runtime/runtime-api.ts': 'Virtual Character OS 运行时 API 适配器',
  'src/runtime/project-runtime.ts': 'AI 酒馆项目级 Runtime 工厂',
  'src/runtime/index.ts': 'Virtual Character OS Runtime 统一出口',
  'src/core/character-card.ts': '角色卡模型与解析（含 SillyTavern 兼容）',
  'src/core/character-generator.ts': 'AI 角色生成',
  'src/core/character-version-control.ts': '角色卡版本控制',
  'src/core/chat-error.ts': '对话错误类型与提示映射（位于 services）',
  'src/core/prompt-builder.ts': '提示词组装（角色 / 世界书 / 记忆拼接）',
  'src/core/rag-retriever.ts': 'RAG 检索器：向量召回与上下文注入',
  'src/core/rag-benchmark.ts': 'RAG 检索质量基准测试',
  'src/core/embedding.ts': '嵌入向量计算封装',
  'src/core/onnx-embedding-provider.ts': 'ONNX Runtime Web 嵌入提供方',
  'src/core/document-chunker.ts': '文档分块器',
  'src/core/world-setting-chunker.ts': '世界设定分块器',
  'src/core/stopword-filter.ts': '停用词过滤（RAG 增强）',
  'src/core/vector-model-manager.ts': '向量模型管理器',
  'src/core/vector-model-install.ts': '向量模型安装流程',
  'src/core/vector-model-source.ts': '向量模型来源映射',
  'src/core/vector-model-storage.ts': '向量模型本地存储',
  'src/core/vector-model-tauri.ts': '向量模型 Tauri 侧扫描（PRESCAN_DIRS 含 model/）',
  'src/core/model-file-adapter.ts': '模型文件读写适配（AppData/model 目录）',
  'src/core/local-model-engine.ts': '本地模型推理引擎（web-llm）',
  'src/core/inference-cache.ts': '推理结果缓存',
  'src/core/l0-l2-runtime.ts': 'L0–L2 三层优化运行时（上下文结构 / 压缩 / 输出纪律）',
  'src/core/dual-channel-runtime.ts': '双通道运行时',
  'src/core/optimization-pipeline.ts': '上下文优化流水线',
  'src/core/compression.ts': '内容压缩算法',
  'src/core/summarizer.ts': '对话摘要生成',
  'src/core/memory-store.ts': '长期记忆存储',
  'src/core/lorebook.ts': '世界书（Lorebook）数据模型',
  'src/core/lorebook-scanner.ts': '世界书关键词触发扫描',
  'src/core/macro.ts': '宏变量替换（{{char}} / {{user}} 等）',
  'src/core/variable-store.ts': '运行时变量存储',
  'src/core/trigger-engine.ts': '触发器引擎',
  'src/core/tool-registry.ts': '工具/函数调用注册表',
  'src/core/slash-command.ts': '斜杠命令解析与执行',
  'src/core/st-compat.ts': 'SillyTavern 数据格式兼容层',
  'src/core/group-chat.ts': '群聊逻辑',
  'src/core/story-types.ts': '剧情引擎类型定义',
  'src/core/story-analyzer.ts': '剧情分析器',
  'src/core/story-importer.ts': '剧情导入器',
  'src/core/story-templates.ts': '剧情模板库',
  'src/core/story-time.ts': '剧情时间轴管理',
  'src/core/world-generator.ts': '世界观生成',
  'src/core/npc-generator.ts': 'NPC 生成',
  'src/core/protagonist.ts': '主角设定管理',
  'src/core/random-event-generator.ts': '随机事件生成',
  'src/core/community-market.ts': '社区市场客户端',
  'src/core/market-index.ts': '社区市场索引解析',
  'src/core/extension-loader.ts': '扩展加载器',
  'src/core/extension-types.ts': '扩展类型定义',
  'src/core/event-types.ts': '事件类型定义',
  'src/core/data-bank.ts': '数据银行（素材库）',
  'src/core/image-generation.ts': '图像生成调用封装',
  'src/core/image-storage.ts': '生成图片的本地存储',
  'src/core/backup.ts': '全量备份与恢复核心逻辑',
  'src/core/backup-crypto.ts': '备份加密（拒绝明文密钥导出）',
  'src/core/api-key-crypto.ts': 'API Key 加密存储',
  'src/core/audit-log.ts': '操作审计日志',
  'src/core/sanitize.ts': 'HTML 净化（DOMPurify 封装，防 XSS）',
  'src/core/json-utils.ts': 'JSON 安全读写工具',
  'src/core/token-counter.ts': 'Token 计数（gpt-tokenizer）',
  'src/core/theme-extractor.ts': '主题色提取',
  'src/core/output-discipline.ts': '输出纪律约束（L2）',
  'src/core/mobile-nav.ts': '移动端导航状态管理',
  'src/core/viewport.ts': '视口/断点唯一来源（matchMedia 仅允许出现在此文件）',
  'src/core/storage-persistence.ts': 'Web/PWA 持久化授权（navigator.storage.persist，降低 IndexedDB 被驱逐风险）',
  'src/core/benchmark.ts': '性能基准测量',
  'src/core/user-model-bridge.ts': '用户自备模型桥接',

  'src/services/chat-manager.ts': '对话流程编排（发送 / 流式接收 / 重试）',
  'src/services/chat-error.ts': '对话错误类型与用户提示映射',
  'src/services/backup-service.ts': '备份导出/导入服务',
  'src/services/translator.ts': '翻译服务',
  'src/services/tts-service.ts': '语音合成服务',
  'src/services/type-adapters.ts': '第三方数据格式适配',

  'src/stores/character.ts': '状态存储：角色卡列表与当前角色',
  'src/stores/character-version.ts': '状态存储：角色卡版本历史',
  'src/stores/chat.ts': '状态存储：会话与消息管理',
  'src/stores/chat-context.ts': '状态存储：对话上下文绑定（角色 / 世界书）',
  'src/stores/community-market.ts': '状态存储：社区市场',
  'src/stores/data-bank.ts': '状态存储：数据银行素材',
  'src/stores/events.ts': '状态存储：全局事件总线',
  'src/stores/group-chat.ts': '状态存储：群聊',
  'src/stores/image-generation.ts': '状态存储：图像生成任务',
  'src/stores/local-model.ts': '状态存储：本地模型加载状态',
  'src/stores/lorebook.ts': '状态存储：世界书',
  'src/stores/persona.ts': '状态存储：用户 Persona',
  'src/stores/random-events.ts': '状态存储：随机事件',
  'src/stores/settings.ts': '状态存储：应用设置（含主密码加密与 API Profile）',
  'src/stores/story.ts': '状态存储：剧情引擎',
  'src/stores/user-vector-model.ts': '状态存储：用户自备向量模型',

  'src/i18n/index.ts': 'i18n 初始化（vue-i18n）',
  'src/i18n/locales/zh.ts': '中文文案表',
  'src/i18n/locales/en.ts': '英文文案表',

  'src/styles/tokens.css': '设计令牌（颜色/间距/字号）',
  'src/styles/tokens-responsive.css': '响应式设计令牌',
  'src/styles/themes.css': '内置 5 套主题变量',
  'src/styles/base.css': '基础样式重置',
  'src/styles/layout.css': '布局样式',
  'src/styles/responsive.css': '响应式断点样式（口径统一 640px）',
  'src/styles/app-global.css': '应用全局样式',

  'src/views/ChatView.vue': '页面：对话主界面',
  'src/views/CharactersView.vue': '页面：角色列表',
  'src/views/CharacterEditorView.vue': '页面：角色编辑',
  'src/views/CharacterVersionView.vue': '页面：角色版本管理',
  'src/views/WorldBookView.vue': '页面：世界书管理',
  'src/views/GroupChatView.vue': '页面：群聊',
  'src/views/StoryEngineView.vue': '页面：剧情引擎',
  'src/views/RandomEventsView.vue': '页面：随机事件',
  'src/views/DataBankView.vue': '页面：数据银行',
  'src/views/ArchivesView.vue': '页面：归档',
  'src/views/CommunityMarketView.vue': '页面：社区市场',
  'src/views/ImageGeneratorView.vue': '页面：图像生成',
  'src/views/LocalModelView.vue': '页面：本地模型管理',
  'src/views/SettingsView.vue': '页面：设置中心（含数据管理与安全）',
  'src/views/ProfileView.vue': '页面：用户档案',

  'src/components/chat/ChatMain.vue': '组件：对话主区域',
  'src/components/chat/MessageBubble.vue': '组件：消息气泡（Markdown 渲染）',
  'src/components/chat/NewConversationModal.vue': '组件：新建对话弹窗',
  'src/components/common/Modal.vue': '通用组件：模态框',
  'src/components/common/Toast.vue': '通用组件：轻提示',
  'src/components/common/Icon.vue': '通用组件：图标',
  'src/components/common/icons.ts': '图标路径常量表',
  'src/components/common/Avatar.vue': '通用组件：头像',
  'src/components/common/FilterTabs.vue': '通用组件：筛选标签页',
  'src/components/common/ApiErrorModal.vue': '通用组件：API 错误提示弹窗',
  'src/components/common/MasterPasswordModal.vue': '通用组件：主密码输入弹窗',
  'src/components/common/OnboardingModal.vue': '通用组件：新手引导弹窗',
  'src/components/layout/NavRail.vue': '布局：桌面端侧边导航',
  'src/components/layout/CharacterList.vue': '布局：角色列表侧栏',
  'src/components/layout/ContextPanel.vue': '布局：上下文信息面板',
  'src/components/mobile/BottomNav.vue': '布局：移动端底部导航',
  'src/components/random-events/SceneConfigModal.vue': '组件：随机事件场景配置',
  'src/components/random-events/TemplateEditorModal.vue': '组件：随机事件模板编辑器',
  'src/components/settings/SettingsModelPanel.vue': '组件：设置-模型面板',
  'src/components/settings/VectorModelPanel.vue': '组件：设置-向量模型面板',
  'src/components/story/StoryTimeConfigPanel.vue': '组件：剧情时间轴配置面板',
  'src/components/worldbook/WorldBookEventsPanel.vue': '组件：世界书事件面板',

  'src-tauri/Cargo.toml': 'Rust 依赖与 crate 元信息',
  'src-tauri/build.rs': 'Tauri 构建脚本（tauri-build）',
  'src-tauri/tauri.conf.json': 'Tauri 应用配置（窗口 / 打包 / 更新签名公钥）',
  'src-tauri/capabilities/default.json': 'Tauri 2 权限能力声明',
  'src-tauri/.gitignore': '桌面端专属忽略规则',
  'src-tauri/src/main.rs': 'Rust 主入口',
  'src-tauri/src/lib.rs': 'Rust 库入口与命令注册',
  'src-tauri/src/error.rs': 'Rust 统一错误类型',
  'src-tauri/src/tray.rs': '系统托盘',
  'src-tauri/src/shortcut.rs': '全局快捷键',
  'src-tauri/src/storage/mod.rs': 'Rust 侧文件存储模块',
  'src-tauri/src/commands/mod.rs': 'Tauri 命令模块出口',
  'src-tauri/src/commands/app_info.rs': '命令：应用信息',
  'src-tauri/src/commands/chat_stream.rs': '命令：流式对话（SSE 转发）',
  'src-tauri/src/commands/fetch_models.rs': '命令：模型列表拉取',
  'src-tauri/src/commands/fs_commands.rs': '命令：文件系统读写',

  'scripts/breakpoint-guard.mjs': '门禁：禁止野断点、断点数值 L1/L4 同步校验',
  'scripts/css-viewport-guard.mjs': '门禁：CSS 视口单位使用校验',
  'scripts/csp-guard.mjs': '门禁：Web 端 CSP 契约校验（构建产物含 CSP、关键指令齐备、script-src 未被削弱）',
  'scripts/csp-audit.mjs': '工具：CSP 运行时审计（真实浏览器监听 securitypolicyviolation，手动诊断用）',
  'scripts/hover-guard.mjs': '门禁：禁止未按 (hover: hover) 分流的 :hover，防触屏 tap 后 hover 粘滞',
  'scripts/important-guard.mjs': '门禁：!important 棘轮守卫（基线锁定，只许降不许升）',
  'scripts/css-conventions-guard.mjs': '门禁：CSS 约定守卫单一入口（编排断点 / 视口 / hover / !important / 控件字号五项子检查）',
  'scripts/i7-control-font-size-guard.mjs': '门禁：移动断点内可编辑控件字号 ≥16px 兜底（I-7，防 iOS 聚焦放大页面）',
  'scripts/check-contrast.mjs': '门禁：5 套主题关键色对对比度 ≥ AA',
  'scripts/contrast-audit.mjs': '审计：对比度全量扫描报告',
  'scripts/i18n-scan.mjs': '门禁：硬编码中文 UI 文案扫描（strict 模式）',
  'scripts/generate-pwa-icons.mjs': '工具：由 icon-source.png 生成 PWA 图标到 public/',
  'scripts/ui-shot.mjs': '工具：遍历路由批量截图到 docs/assets/screenshots/',
  'scripts/vendor-fonts.mjs': '工具：把 Google Fonts 镜像到 public/fonts/，消除第三方字体请求（支持 --check 供校验）',
  'scripts/p11-baseline.mjs': '测量：P11 性能基线采集',
  'scripts/p11-scroll-fps.mjs': '测量：滚动帧率采集',
  'scripts/gen-project-index.mjs': '工具：生成本索引文件',

  'tests/setup.ts': 'Vitest 全局测试环境初始化',
  'e2e/storage-state.json': 'E2E 预置 localStorage（跳过新手引导）',

  'docs/design/design-system-specification.md': '设计文档：设计系统规范（令牌 / 组件 / 移动端）',
  'docs/design/software-design-document.md': '设计文档：软件设计说明书',
  'docs/design/mobile-ui-design.md': '设计文档：移动端 UI 设计（页面功能明细）',
  'docs/design/rag-enhancement-design.md': '设计文档：RAG 增强设计',
  'docs/design/e00-decision.md': '设计文档：E-00 嵌入优化形态决策',
  'docs/design/threat-model.md': '设计文档：威胁模型（含提示词注入专项）',
  'docs/design/AI酒馆项目嵌入优化方案开发文档.md': '设计文档：嵌入优化方案（L0/L1/L2 三层）',
  'docs/design/virtual-character-os-实现基线.md': '设计文档：Virtual Character OS 实现基线（Schema → Runtime → Emotion → Compiler → API）',
  'docs/product/AI酒馆开发计划文档.md': '产品文档：开发计划与任务台账',
  'docs/other/项目文档结构.md': '其他：项目文档分类规范',
  'docs/dev/b-type-findings.md': '开发文档：`!` 非空断言治理审计记录',
  'docs/dev/mobile-pwa-plan.md': '开发文档：手机端 PWA 实现计划',
  'docs/dev/rag-enhancement-plan.md': '开发文档：RAG 增强实现计划',
  'docs/dev/data-backup-restore.md': '开发文档：备份恢复与灾备演练 Runbook（P2-#3 修复交付）',
  'docs/fixes/goal-tracker.md': '修复文档：跨端一致性 28 项缺陷修复进度台账',
  'docs/fixes/web-sop-review-2026-09-18.md': '修复文档：Web 端 SOP 评审报告（完整性/准确性/一致性/可执行性四维）',
  'docs/fixes/runtime-core-baseline-verification-2026-09-22.md': '验证记录：Runtime Core 基线自动化验证',
  'docs/assets/test-gradient.jpg': '设计文档：渐变测试图（本地验证用）',

  'docs/fixes/cross-client-review-2026-09-07.md': '修复文档：跨客户端评审报告（28 项缺陷来源）',
  'docs/fixes/pre-launch-check-aijiuguan-2026-08-15.md': '修复文档：上线前全检报告（2026-08-15）',
  'docs/fixes/pre-launch-check-aijiuguan-2026-08-17.md': '修复文档：6 维度全检报告（2026-08-17）',
  'docs/fixes/pre-launch-check-aijiuguan-2026-08-19.md': '修复文档：6 维度全检报告（2026-08-19）',
  'docs/fixes/pre-launch-check-aijiuguan-2026-09-21.md':
    '修复文档：上线前全检报告（代码审查 + 安全审计 + QA，2026-09-21）',
  'docs/fixes/web-sop-fix-batch1-report.md': '修复文档：Web SOP 修复第一批交付报告（修正失实声明）',
  'docs/fixes/web-sop-fix-batch2-report.md': '修复文档：Web SOP 修复第二批交付报告（补齐门禁）',
  'docs/fixes/web-sop-fix-batch3-report.md': '修复文档：Web SOP 修复第三批交付报告（安全与数据保障）',
  'docs/fixes/web-sop-fix-batch4-report.md': '修复文档：Web SOP 修复第四批交付报告（口径统一与流程固化）',
  'docs/fixes/i7-mobile-control-font-size-fix-2026-09-20.md': '修复文档：I-7 移动端控件字号修复 + CSS 约定守卫合并（含真实浏览器实测数据）',
  'docs/dev/P2-11-virtualization-plan.md': '开发文档：P2-11 长对话虚拟化分批计划',
  'docs/dev/web-deployment-sop.md': '开发文档：Web 端部署 SOP（部署前验证 / 硬性要求 / 5 类托管配置 / 部署后验证 / 常见坑 / 回滚）',
  'docs/design/P2-9-csp-whitelist-report.md': '设计文档：P2-9 CSP / remote 白名单盘点与决策记录',

  'public/pwa-icon.svg': 'PWA 图标（矢量）',
  'public/pwa-192x192.png': 'PWA 图标 192×192',
  'public/pwa-512x512.png': 'PWA 图标 512×512',
  'public/apple-touch-icon.png': 'iOS 主屏图标',
  'public/assets/hero-cyber-nexus.jpg': '首页主视觉图（赛博主题）',
  'public/assets/hero-seraphina.jpg': '首页主视觉图（角色主题）',
  'public/ai-roleplay-dev-plan.html': '开发文档（静态页）：AI 酒馆开发计划',
  'public/sillytavern-vs-airoleplay.html': '静态页：SillyTavern vs ai-roleplay 系统化对比报告',

  'market/index.json': '社区市场索引（角色卡 / 模板清单）',
  'market/cards/seraphina.json': '社区市场示例：角色卡数据',
  'market/items/character-echo.json': '社区市场条目：角色 Echo',
  'market/items/character-seraphina.json': '社区市场条目：角色 Seraphina',
  'market/items/template-apocalypse.json': '社区市场条目：末世题材模板',
  'market/items/template-fantasy.json': '社区市场条目：奇幻题材模板',
  'market/items/template-sci-fi.json': '社区市场条目：科幻题材模板',
  'market/items/worldbook-midgard.json': '社区市场条目：世界书 Midgard',

  '.workbuddy/memory/MEMORY.md': 'AI记忆：项目长期记忆（已归档的跨会话结论）',
  '.reasonix/skills/open-code-review/SKILL.md': 'AI记忆：代码评审技能定义',
};

/** 分类：仅允许 11 个固定取值 */
const CATEGORIES = [
  '程序', '测试', '产品文档', '开发文档', '修复文档', '设计文档',
  'AI记忆', '截图', '配置', '脚本', '其他',
];

const ROOT_CONFIG_FILES = new Set([
  'package.json', 'package-lock.json', 'vite.config.ts', 'vitest.config.ts',
  'playwright.config.ts', 'tsconfig.json', 'eslint.config.js', 'reasonix.toml',
  '.gitignore', '.gitattributes', '.i18nignore',
]);

const ROOT_DEV_DOCS = new Set([
  'README.md', 'README-EN.md', 'CHANGELOG.md', 'CONTRIBUTING.md',
  'THIRD_PARTY_NOTICES.md',
]);

/**
 * docs/ 下的分类子目录 → 索引分类。
 * 2026-09-18 起 docs/ 由「扁平」改为按用途分五类（design/dev/fixes/other/product），
 * 因此**目录即分类**：新增文档只要放进对应目录即被正确归类，无需再逐文件维护映射。
 * 归类规则与 MIGRATION_LOG.md 第十一节一致。
 */
const DOC_DIR_CATEGORY = {
  'docs/design/': '设计文档',
  'docs/dev/': '开发文档',
  'docs/fixes/': '修复文档',
  'docs/product/': '产品文档',
  'docs/other/': '其他',
};

/** 逐文件覆盖（非 docs/ 分类目录内的例外项） */
const DOC_CATEGORY = {
  'docs/assets/test-gradient.jpg': '设计文档',
  'public/ai-roleplay-dev-plan.html': '开发文档',
  'public/sillytavern-vs-airoleplay.html': '产品文档',
};

function classify(rel) {
  const base = rel.split('/').pop();
  if (rel === 'PROJECT_INDEX.md' || rel === 'MIGRATION_LOG.md') return '其他';
  if (rel.startsWith('tests/') || rel.startsWith('e2e/')) return '测试';
  if (/\.(test|spec)\.ts$/.test(base)) return '测试';
  if (rel.startsWith('docs/assets/screenshots/')) return '截图';
  if (DOC_CATEGORY[rel]) return DOC_CATEGORY[rel];
  if (rel.startsWith('docs/')) {
    // 目录即分类（见 DOC_DIR_CATEGORY）；docs/ 根下的散落文件归「其他」
    for (const [dir, cat] of Object.entries(DOC_DIR_CATEGORY)) {
      if (rel.startsWith(dir)) return cat;
    }
    return '其他';
  }
  // 注：原 `deliverables/` 分支已移除 —— 该目录 2026-09-18 归档进 docs/ 后废止
  // （评审报告类 → docs/fixes/、计划类 → docs/dev/、决策记录类 → docs/design/）。
  // 若见新文件落在 docs/ 根目录，说明未按「目录即分类」规则放置，会被归入「其他」。
  if (rel.startsWith('.workbuddy/memory/') || rel.startsWith('.workbuddy-ai/memory/')) return 'AI记忆';
  if (rel.startsWith('.reasonix/')) return 'AI记忆';
  if (rel.startsWith('scripts/')) return '脚本';
  if (rel.startsWith('.github/')) return '配置';
  if (ROOT_CONFIG_FILES.has(rel)) return '配置';
  if (ROOT_DEV_DOCS.has(rel)) return '开发文档';
  if (rel === 'LICENSE' || rel === 'icon-source.png') return '其他';
  if (rel === 'index.html') return '程序';
  if (rel.startsWith('src/')) return '程序';
  if (rel.startsWith('src-tauri/src/')) return '程序';
  if (rel === 'src-tauri/build.rs') return '程序';
  if (rel.startsWith('src-tauri/')) return '配置';
  if (rel.startsWith('public/') || rel.startsWith('market/')) return '其他';
  return '其他';
}

function describe(rel) {
  if (CURATED[rel]) return CURATED[rel];
  if (rel.endsWith('/')) return '待确认';
  const base = rel.split('/').pop();

  if (rel.startsWith('tests/')) {
    return `单元测试：${base.replace(/\.test\.ts$/, '')} 模块`;
  }
  if (rel.startsWith('e2e/')) {
    return base.endsWith('.spec.ts')
      ? `E2E 测试：${base.replace(/\.spec\.ts$/, '')} 场景`
      : 'E2E 测试辅助文件（存储状态预置）';
  }
  if (rel.startsWith('.workbuddy/memory/') || rel.startsWith('.workbuddy-ai/memory/')) {
    const m = base.match(/^(\d{4}-\d{2}-\d{2})\.md$/);
    return m ? `AI记忆：${m[1]} 工作日志` : 'AI记忆：项目长期约定与结论';
  }
  if (rel.startsWith('.reasonix/')) {
    return base.endsWith('.json')
      ? 'AI记忆：AI 工具会话元数据'
      : 'AI记忆：AI 工具工作区记录';
  }
  if (base.endsWith('View.vue')) return `页面：${base.replace(/View\.vue$/, '')}（待确认具体功能）`;
  if (base.endsWith('.vue')) return `组件：${base.replace(/\.vue$/, '')}（待确认具体功能）`;
  if (base.endsWith('.ts')) return `模块：${base.replace(/\.ts$/, '')}（待确认具体功能）`;
  return '待确认';
}

function walk(dir, relDir, acc) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    const rel = relDir ? `${relDir}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (EXCLUDE_DIR_NAMES.has(e.name)) continue;
      if (EXCLUDE_REL_DIRS.has(rel)) continue;
      walk(path.join(dir, e.name), rel, acc);
    } else if (e.isFile()) {
      if (EXCLUDE_FILE_RES.some((re) => re.test(e.name))) continue;
      acc.push(rel);
    }
  }
  return acc;
}

function gitInfo(files) {
  const run = (args, input) =>
    spawnSync('git', ['-c', 'core.quotepath=false', ...args], {
      cwd: ROOT,
      encoding: 'utf8',
      input,
      maxBuffer: 64 * 1024 * 1024,
    });

  const tracked = new Set(
    (run(['ls-files']).stdout ?? '').split('\n').map((s) => s.trim()).filter(Boolean),
  );

  const modified = new Set();
  for (const line of (run(['status', '--porcelain']).stdout ?? '').split('\n')) {
    if (!line.trim()) continue;
    const code = line.slice(0, 2).trim();
    const p = line.slice(3).trim();
    if (p) modified.add(`${code}\u0000${p}`);
  }
  const statusOf = (rel) => {
    if (tracked.has(rel)) {
      const hit = [...modified].find((k) => k.endsWith(`\u0000${rel}`));
      if (hit && hit.split('\u0000')[0] === 'M') return '已修改';
      if (hit && hit.split('\u0000')[0] === 'D') return '已修改';
      return '已跟踪';
    }
    return '未跟踪';
  };

  const ignored = new Set(
    (run(['check-ignore', '--stdin'], files.join('\n')).stdout ?? '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean),
  );

  return (rel) => (ignored.has(rel) ? '已忽略' : statusOf(rel));
}

function buildTree(files) {
  const root = { children: new Map(), count: 0 };
  for (const f of files) {
    const parts = f.split('/');
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!node.children.has(parts[i])) {
        node.children.set(parts[i], { children: new Map(), count: 0 });
      }
      node = node.children.get(parts[i]);
      node.count += 1;
    }
  }
  const lines = [];
  const render = (node, depth) => {
    for (const name of [...node.children.keys()].sort()) {
      const child = node.children.get(name);
      lines.push(`${'  '.repeat(depth)}- \`${name}/\`  — ${child.count} 个文件`);
      render(child, depth + 1);
    }
  };
  render(root, 0);
  return lines.join('\n');
}

function esc(s) {
  return String(s).replace(/\|/g, '\\|');
}

function main() {
  const allFiles = walk(ROOT, '', []);
  const files = [];

  for (const [dir, note] of Object.entries(AGGREGATE_DIRS)) {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) continue;
    const count = allFiles.filter((f) => f.startsWith(`${dir}/`)).length;
    if (!count) continue;
    CURATED[`${dir}/`] = `${note}（共 ${count} 个文件）`;
    files.push(`${dir}/`);
  }
  const aggPrefixes = Object.keys(AGGREGATE_DIRS);
  for (const f of allFiles) {
    if (aggPrefixes.some((d) => f.startsWith(`${d}/`))) continue;
    files.push(f);
  }

  const sorted = [...files].sort();
  const gitOf = gitInfo(sorted);

  const byCat = new Map(CATEGORIES.map((c) => [c, []]));
  for (const rel of sorted) {
    const cat = classify(rel);
    byCat.get(cat).push(rel);
  }

  const ts = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${ts.getFullYear()}-${pad(ts.getMonth() + 1)}-${pad(ts.getDate())} ${pad(ts.getHours())}:${pad(ts.getMinutes())}`;

  const todo = sorted.filter((rel) => describe(rel).includes('待确认'));

  const ignoredDirs = [
    ['.git/', '版本控制元数据，非项目内容'],
    ['node_modules/', 'npm 依赖（24,086 个文件，645 MB）'],
    ['src-tauri/target/', 'Rust 构建缓存（约 13 GB）'],
    ['src-tauri/gen/', 'Tauri 自动生成的 schema（生成物）'],
    ['dist/', 'Vite 生产构建输出（构建产物）'],
    ['artifacts/', '历史构建 / 覆盖率 / 测试快照归档（构建与测试产物）'],
    ['coverage/', 'Vitest 覆盖率报告（测试产物）'],
    ['test-results/', 'Playwright 默认输出目录（测试产物）'],
    ['playwright-report/', 'Playwright HTML 报告（测试产物，存在时）'],
    ['model/', 'ONNX 向量模型权重（约 1.1 GB 大二进制）'],
    ['.reasonix/', 'AI 工具（Reasonix）工作区状态；该目录已于 2026-09-18 从工作区消失，规则保留以兼容其重新生成'],
    ['artifacts/backup/', '目录整理与清理的回滚备份（.tar.gz，保留）'],
    ['.cache/ .nuxt/ .next/ .parcel-cache/ build/ out/ vendor/ .venv/ venv/ env/ __pycache__/', '通用依赖与缓存目录（本项目未使用，按规范排除）'],
  ];

  const ignoredFiles = [
    ['*.log', '运行日志（debug.log 已归档至 artifacts/logs/）'],
    ['*.tmp', '临时文件'],
    ['*.lock / Cargo.lock', '依赖锁定文件'],
    ['.env / .env.*', '环境变量文件（可能含密钥）'],
    ['*.pem / *.key / *.key.pub / *.p12 / *.pfx / *.crt / *.cer / *.der / *.jks / *.keystore', '密钥与证书材料 —— 不读取内容、不列入表格'],
    ['*.db / *.sqlite / *.sqlite3 / *.db-journal', '数据库文件'],
    ['*.onnx / *.bin / *.exe / *.dll / *.so / *.dylib / *.a / *.o / *.obj / *.rlib / *.rmeta / *.pdb', '大二进制与编译产物'],
    ['src-tauri/icons/ 下的 PNG / ICO / ICNS', '同质化图片资源，已聚合为单行'],
    ['public/assets/icons/dl_builtin_tik_tok/*.svg', '同质化图标资源，已聚合为单行'],
  ];

  const parts = [];
  parts.push('# PROJECT_INDEX');
  parts.push('');
  parts.push(`- **生成时间**：${stamp}（本地时区）`);
  parts.push('- **项目根目录**：`.`（本文件所在目录；全文均为相对路径）');
  parts.push('- **项目标识**：`ai-roleplay` v0.2.0 — AI 角色扮演与多模型对话平台（Tauri 2.0 原生封装 + Web 降级）');
  parts.push('- **生成方式**：`node scripts/gen-project-index.mjs`（扫描文件系统 + 只读调用 git，不执行任何 git 写操作）');
  parts.push(`- **收录文件**：${sorted.length} 个 ｜ **忽略目录**：${ignoredDirs.length} 类 ｜ **待确认用途**：${todo.length} 个`);
  parts.push('');
  parts.push('> 用途说明来源：人工核对清单优先；未核对者按文件命名规则推断并标注「待确认」，不做臆测。');
  parts.push('> 敏感文件（密钥 / 证书 / 环境变量）只记录排除原因，不读取内容、不列入表格。');
  parts.push('');

  parts.push('## 一、目录树（仅目录，不展开依赖与产物目录）');
  parts.push('');
  parts.push('```');
  parts.push('ai-roleplay/');
  parts.push(buildTree(allFiles));
  parts.push('```');
  parts.push('');

  parts.push('## 二、文件索引');
  parts.push('');
  const order = ['程序', '测试', '产品文档', '开发文档', '修复文档', '设计文档', 'AI记忆', '截图', '配置', '脚本', '其他'];
  let sectionNo = 0;
  for (const cat of order) {
    const list = byCat.get(cat);
    if (!list || !list.length) continue;
    sectionNo += 1;
    parts.push(`### 2.${sectionNo} ${cat}（${list.length}）`);
    parts.push('');
    parts.push('| 相对路径 | 文件类型 | 分类 | 用途说明 | Git状态 | 备注 |');
    parts.push('| --- | --- | --- | --- | --- | --- |');
    for (const rel of list) {
      const base = rel.split('/').pop();
      const ext = rel.endsWith('/')
        ? '目录聚合'
        : base.includes('.') ? base.split('.').pop().toLowerCase() : '(无扩展名)';
      const desc = describe(rel);
      const note = rel === 'PROJECT_INDEX.md'
        ? '索引文件（不递归展开）'
        : desc.includes('待确认') ? '用途待确认' : '';
      parts.push(`| \`${esc(rel)}\` | ${esc(ext)} | ${cat} | ${esc(desc)} | ${gitOf(rel)} | ${esc(note)} |`);
    }
    parts.push('');
  }

  parts.push('## 三、分类汇总');
  parts.push('');
  parts.push('| 分类 | 文件数 | 说明 |');
  parts.push('| --- | --- | --- |');
  const catNote = {
    '程序': 'src/ 前端源码与 src-tauri/src/ Rust 源码、index.html',
    '测试': 'tests/ 单元与组件测试、e2e/ Playwright 场景',
    '产品文档': 'docs/product/ 产品与项目规划材料',
    '开发文档': 'docs/dev/ 实现计划、Runbook、审计记录',
    '修复文档': 'docs/fixes/ 缺陷评审、修复交付与进度台账',
    '设计文档': 'docs/design/ 设计系统、软件设计、移动端设计、威胁模型、决策文档',
    'AI记忆': '.workbuddy/memory/ 与 .workbuddy-ai/memory/ 项目记忆与跨会话结论',
    '截图': 'docs/assets/screenshots/ 下 UI 冒烟截图',
    '配置': '构建、CI、Tauri 应用与根级工程配置',
    '脚本': 'scripts/ 门禁、审计与工具脚本',
    '其他': 'docs/other/ 文档体系规范，以及静态资源、市场数据、许可证、图标等',
  };
  let total = 0;
  for (const cat of order) {
    const n = byCat.get(cat).length;
    total += n;
    parts.push(`| ${cat} | ${n} | ${esc(catNote[cat] ?? '')} |`);
  }
  parts.push(`| **合计** | **${total}** | 与「收录文件」数一致 |`);
  parts.push('');

  parts.push('## 四、忽略清单');
  parts.push('');
  parts.push('### 4.1 忽略的目录');
  parts.push('');
  parts.push('| 目录 | 排除原因 |');
  parts.push('| --- | --- |');
  for (const [d, r] of ignoredDirs) parts.push(`| \`${esc(d)}\` | ${esc(r)} |`);
  parts.push('');
  parts.push('### 4.2 忽略的文件');
  parts.push('');
  parts.push('| 模式 | 排除原因 |');
  parts.push('| --- | --- |');
  for (const [p, r] of ignoredFiles) parts.push(`| \`${esc(p)}\` | ${esc(r)} |`);
  parts.push('');
  parts.push('> `src-tauri/keys/` 目录下的签名私钥与公钥文件按密钥类规则整体排除，本索引不记录其文件名与内容。');
  parts.push('');

  parts.push('## 五、维护说明');
  parts.push('');
  parts.push('重新生成索引：');
  parts.push('');
  parts.push('```bash');
  parts.push('node scripts/gen-project-index.mjs');
  parts.push('```');
  parts.push('');
  parts.push('要点：');
  parts.push('');
  parts.push('1. 生成器位于 `scripts/gen-project-index.mjs`，本文件由它整体重写，请勿手工编辑表格区（改动会在下次生成时丢失）。');
  parts.push('2. 新增文件后无需改脚本即可被收录；若其用途无法由命名推断，会在「用途说明」列标注「待确认」。');
  parts.push('3. 要让新文件获得准确用途说明，在脚本的 `CURATED` 映射中按相对路径补一条即可。');
  parts.push('4. 调整排除范围，修改脚本顶部的 `EXCLUDE_DIR_NAMES`、`EXCLUDE_REL_DIRS`、`EXCLUDE_FILE_RES`；同质化资源目录用 `AGGREGATE_DIRS` 聚合。');
  parts.push('5. 生成器只读 git（`ls-files` / `status` / `check-ignore`），不会执行 `add` / `commit` / `push`。');
  parts.push('6. 本文件全文使用相对路径；请勿在补充内容中写入绝对路径，以免泄露本机目录信息。');
  parts.push('7. 目录结构变更请同步记录到 `MIGRATION_LOG.md`。');
  fs.writeFileSync(OUT_FILE, `${parts.join('\n')}\n`, 'utf8');

  console.log(`[gen-project-index] 已生成 ${path.basename(OUT_FILE)}`);
  console.log(`[gen-project-index] 收录文件: ${sorted.length}`);
  console.log(`[gen-project-index] 忽略目录: ${ignoredDirs.length} 类`);
  console.log(`[gen-project-index] 待确认用途: ${todo.length}`);
  for (const cat of order) console.log(`[gen-project-index]   ${cat}: ${byCat.get(cat).length}`);
}

main();
