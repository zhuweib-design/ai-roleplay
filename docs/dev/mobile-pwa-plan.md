# 手机端 PWA 实现计划 — 完整 PWA + 底部导航 + 核心页移动化

> 关联设计文档：`docs/design/mobile-ui-design.md`（页面功能明细 §14）
> 状态：**已实现**（2026-09-18 核对收口；2 处实现偏差见文末「实现回写」）
> 方法：TDD（纯逻辑先测后实现），构建类用产物验证
> 分支约定：在非 master 分支 `feat/mobile-pwa` 进行（除非用户允许 master）

---

## 0. 分支、依赖与命令

- 分支：`feat/mobile-pwa`
- 新依赖（devDep）：`vite-plugin-pwa`（PWA 基建）
- 验证命令：
  - 单测：`npx vitest run <path>`
  - 构建验证 PWA：`npm run build` → 检查 `dist/` 下 `manifest.webmanifest`、`sw.js`、图标
  - 回归：`npm test`、`npm run lint`、`npx vue-tsc --noEmit`、`npm run i18n:check:strict`

---

## 1. PWA 基建

### 任务 1.1 — 安装 `vite-plugin-pwa`
**步骤**：`npm i -D vite-plugin-pwa`
**验证**：`package.json` 出现该依赖。

### 任务 1.2 — `vite.config.ts` 接入 VitePWA
**步骤**：
1. `import { VitePWA } from 'vite-plugin-pwa'`
2. `plugins` 增加 `VitePWA({...})`，仅 Web 构建启用（`isTauriEnv` 时注入 disabled 配置）
3. manifest：`name:'AI 酒馆'`、`short_name:'AI酒馆'`、`display:'standalone'`、`theme_color/background_color:'#0B0B10'`、`start_url:'/'`、`scope:'/'`
4. `registerType:'autoUpdate'`
5. `workbox`：`globPatterns` 含 `js/css/html/ico/png/svg/woff2`；`navigateFallback:'/'`；不缓存 `/v1/` 网关
6. `includeAssets`：`pwa-192x192.png`、`pwa-512x512.png`、`apple-touch-icon.png`
**验证**：`npm run build` 后 `dist/` 生成 `manifest.webmanifest`、`sw.js`；Tauri 构建不产 SW。

### 任务 1.3 — 生成 PWA 图标（简单 SVG）
**步骤**：新增 `public/pwa-192x192.png`、`public/pwa-512x512.png`、`public/apple-touch-icon.png`（用简单主题色 SVG 图标绘制，占位可后续替换）
**验证**：文件存在、尺寸非 0。

---

## 2. 移动端底部导航

### 任务 2.1 — 新建 `src/components/mobile/BottomNav.vue`
**目标**：响应式底部导航组件（5 tab）。
**步骤**：
1. 5 个入口：会话 `chat`、角色 `character-list`、市场 `community-market`、世界书 `worldbook`、设置 `settings`
2. 用 `useRoute()` 高亮当前 tab；图标复用 `Icon.vue`
3. 底部安全区垫高：`padding-bottom: env(safe-area-inset-bottom)`
4. `aria-label` 与可点击 ≥44px
**验证**：`npx vue-tsc --noEmit`。

### 任务 2.2 — 路由辅助纯函数（先测后实现，TDD）
**目标**：`isMainTab(name)` / `isAppTab(name)` 判定二级页是否隐藏底部导航。
**步骤**：
1. 新建 `src/core/mobile-nav.ts`，导出鉴别函数：主 Tab 名集合、二级页集合
2. 写 `tests/core/mobile-nav.test.ts`：chat/character-list/community-market/worldbook/settings 是 tab；character-edit/community 详情等非 tab；聊天详情隐藏
3. 实现至 Green
**验证**：`npx vitest run tests/core/mobile-nav.test.ts` 全绿。

### 任务 2.3 — `App.vue` 挂载底部导航
**步骤**：
1. `≤640px`（`@media`）显示 `BottomNav`、隐藏桌面侧栏；`≥641px` 相反
2. `router-view` 按是否 tab 页决定是否被底部导航占据（二级页全屏）
3. 桌面布局不受影响（纯 CSS 断点）
**验证**：`npx vue-tsc --noEmit`、`npm run build`。

---

## 3. 核心页移动化

### 任务 3.1 — 会话列表移动视图
**目标**：手机端会话入口（独立列表或列表抽屉）。
**步骤**：
1. 单列会话行（会话名/摘要/时间）
2. 顶部「新建会话」入口
3. 下拉刷新 + 删除（长按/左滑，基础版至少删除）
**验证**：`npx vue-tsc --noEmit`；构建通过。

### 任务 3.2 — 聊天详情移动适配
**步骤**：
1. 顶部返回栏（`←` + 角色头像/名）
2. 输入区安全区垫高 + 键盘贴合
3. 输入框 `font-size ≥16px` 防 iOS 放大
4. 生成中显示「停止」按钮 + 打字指示
**验证**：`npx vue-tsc --noEmit`。

### 任务 3.3 — 角色/市场卡片流
**步骤**：
1. 角色双列卡片网格 + 横向筛选 chips（移动 CSS）
2. 市场瀑布/双列卡片流 + 搜索分类（移动 CSS）
**验证**：`npx vue-tsc --noEmit`；构建通过。

### 任务 3.4 — 设置列表移动化
**步骤**：设置面板改为移动端全宽分组列表，主开关用大开关、配置类进子面板
**验证**：`npx vue-tsc --noEmit`。

### 任务 3.5 — i18n
**步骤**：新增 `mobile.*` 文案（底部导航标签、新建会话、停止生成、下拉刷新等）到 `zh.ts`/`en.ts`
**验证**：`npm run i18n:check:strict`。

---

## 4. 收尾与回归

### 任务 4.1 — 全量回归
**步骤**：`npm test`、`npm run lint`、`npx vue-tsc --noEmit`、`npm run i18n:check:strict`、`npm run build`
**验证**：全部通过、零新增 warning。

### 任务 4.2 — 文档同步
**步骤**：核对 `docs/design/mobile-ui-design.md` 与实现一致，更新状态为"已实现"（偏差则修正）
**验证**：无悬空规格段。

---

## 5. 验收标准汇总

| # | 验收项 | 判定 |
|---|---|---|
| 1 | PWA 可安装 | `dist/` 有 manifest.webmanifest + sw.js + icons；Tauri 无 SW |
| 2 | 底部导航 | 5 tab 切换、当前高亮、安全区垫高 |
| 3 | 二级页隐藏 | 聊天/详情页无底部导航，全屏 |
| 4 | 主流程 | 新建会话→对话→切角色→市场浏览 移动端流畅 |
| 5 | 触控/输入 | 目标 ≥44px、键盘不遮输入、无输入放大 |
| 6 | 桌面无回归 | 桌面左侧栏与布局不变，全量测试通过 |
| 7 | i18n | strict 门禁通过，无硬编码中文 |

---

## 6. 实现回写（2026-09-18 收口）

本计划的任务 4.2（核对设计文档、更新状态）在实现期未执行，导致状态长期停留「待执行」。本次收口核对结果如下。

### 6.1 已完成项（对照实现）

| 计划任务 | 实现证据 | 判定 |
| --- | --- | --- |
| 1.1 安装 `vite-plugin-pwa` | `package.json` `devDependencies` 已含 | ✅ |
| 1.2 接入 `VitePWA` | `vite.config.ts:131-159`，`disable: isTauriEnv` | ✅ |
| 1.3 生成 PWA 图标 | `public/` 下 `pwa-192x192.png` / `pwa-512x512.png` / `apple-touch-icon.png` / `pwa-icon.svg` | ✅ |
| 2.1 `BottomNav.vue` | 组件存在，5 tab | ✅ |
| 2.2 `mobile-nav.ts` + TDD | `src/core/mobile-nav.ts` + `tests/core/mobile-nav.test.ts` | ✅ |
| 2.3 `App.vue` 挂载底部导航 | 已挂载（断点口径见 6.3） | ✅ |
| 3.x 核心页移动化 | 已完成 | ✅ |
| 4.2 文档同步 | `docs/design/mobile-ui-design.md:3` 已更新为「设计稿（已按 PWA 落地实现，见下"实现记录"）」；本文件状态于 2026-09-18 补更新 | ✅（补做） |

### 6.2 计划与实现的 2 处偏差（回写，非缺陷）

| 计划要求 | 实际实现 | 判定与理由 |
| --- | --- | --- |
| 任务 1.2 步骤 6：`includeAssets` 含 `pwa-192x192.png`、`pwa-512x512.png`、`apple-touch-icon.png` | `vite.config.ts:134`：`includeAssets: ['pwa-icon.svg', 'apple-touch-icon.png']`；两个 PNG 改列于 `manifest.icons`（`:145-146`），并新增矢量备选 `pwa-icon.svg`（`:148`，`sizes: any`） | **等效且更规范**。`includeAssets` 用于「需随构建产出但不进 manifest 的静态资源」，PNG 图标本就属 manifest 声明项，放入 `manifest.icons` 是 vite-plugin-pwa 的推荐位置；新增 SVG 备选提升高分屏适配。 |
| 任务 1.2 步骤 5：`workbox`「不缓存 `/v1/` 网关」 | `vite.config.ts:157`：`runtimeCaching: []` | **实现更严格**。计划原意是「排除网关路径」，实现改为完全不启用运行时缓存（零 `runtimeCaching` 规则），同时以 `globPatterns` 仅预缓存本地静态资源，网关/远端 API 天然不入 SW 缓存；并补 `maximumFileSizeToCacheInBytes: 10MB`（`:155`）避免 web-llm/onnx 大 chunk 触发 `missing-assets`。排除面比原计划更彻底。 |

### 6.3 遗留偏差（未在本计划范围内修复，另见 Web SOP 评审）

- 任务 2.3 步骤 1 表述为「`<640px` 显示 `BottomNav`、`≥640px` 相反」，与代码实际口径（`≤640` 移动）**相差一档**。正确口径为 `≤640` 移动 / `641–1024` 平板 / `≥1025` 桌面，以 `src/core/viewport.ts` 与 `docs/design/design-system-specification.md` 为唯一来源。此项属口径统一问题，已登记为 `docs/fixes/web-sop-review-2026-09-18.md` **P1-8**（第四批修复）。
- 移动端专属行为（底部导航显隐、抽屉遮罩层级、安全区垫高、640 边界布局）当前**无自动化验证**，仅靠人工截图核验。已登记为同报告 **P1-6**（第二批修复）。
