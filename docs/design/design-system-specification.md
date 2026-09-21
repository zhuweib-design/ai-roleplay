# AI 酒馆 · 设计系统规范

> 版本：v1.0
> 日期：2026-08-24
> 依据：`src/styles/tokens.css`、`themes.css`、`responsive.css`（现有实现即单一事实来源）+ `docs/design/mobile-ui-design.md` §2/§5/§6/§7（移动端规范）
> 适用平台：Web + 移动端 PWA（Vue 3 + 原生 CSS Custom Properties）
> 阅读对象：前端 / UI / QA；本规范对 AI 编码工具同样可机器消费
> 说明：Token 名与值一律取自现有 `tokens.css`，不以规范覆盖实现；如需改值，先改代码再同步本文档。

---

## 1. 设计原则

1. **Token 优先**。任何视觉决策都落到具名 token，组件禁止硬编码颜色/间距/字号。改主题只动 semantic→visual 映射，不动组件。
2. **机读一致**。token 均为 `kebab-case`、合法 CSS 变量名（`--` 前缀后）与 JS 对象键，同名可用于 CSS / JS / Figma 变量。
3. **层级分离**。保留"视觉层"（原始色值）与"语义层"（角色化引用）。语义 token 只引用视觉 token，不写死十六进制。
4. **组件自描述**。每个组件规格含 Props/状态/变体/上例，开发或编码工具可据规格独立实现。
5. **移动端强化**。触控目标 ≥44×44px、输入 ≥16px 防 iOS 放大、安全区垫高、`prefers-reduced-motion`，均作为一等规范而非桌面降级。

---

## 2. Token 命名规范

| Token 类别 | 模式 | 例 |
|---|---|---|
| 颜色·视觉层 | `tk-{color}-{shade}` | `tk-red-500`、`tk-black-900` |
| 品牌色 | `--primary` / `--secondary` / 语义前缀 | `primary-fg`、`secondary` |
| 表面 | `--{surface}` | `card`、`card-elevated`、`background` |
| 前景/文本 | `--text-*` / `--muted-foreground` | `text-heading`、`text-muted` |
| 边框 | `--border` | — |
| 阴影 | `--shadow-{level}` | `shadow-card`、`shadow-popup` |
| 圆角 | `--radius-{size}` | `radius-md`、`radius-pill` |
| 状态 | `--success/--error/--warning/--tag-*` | `success-fg`、`tag-green` |
| 字体 | `--font-{family}` | `font-sans`、`font-mono` |
| 字号/行高 | `--{role}-size/-weight/-line-height` | `display-size`、`body-line-height` |

> 现有实现中部分 token 用 `--` 前缀（如 `--primary`），部分类别用 CSS 变量名内前缀（如 `--tk-red-500`）。本规范统一视为一组机读 token；新增 token 一律 `--{category}-{role}-{shade}` 的 kebab-case，不出现空格/大小写混排。

---

## 3. 颜色系统

### 3.1 视觉层 · 色板（取自 `tokens.css`）

**红 scale（品牌主色系，默认 `tk-red-500 = #FE2C55`）**

| Token | 值 | 用途 |
|---|---|---|
| `tk-red-100` | `#FFE9EE` | 极浅红底 |
| `tk-red-200` | `#FFC9D5` | 浅红装饰 |
| `tk-red-300` | `#FFA0B5` | 浅红强调 |
| `tk-red-400` | `#FF6485` | 浅红文本/角标 |
| `tk-red-500` | `#FE2C55` | 品牌红，头像渐变等非文本场景 |
| `tk-red-600` | `#E61E45` | 深一档红 |
| `tk-red-700` | `#C01338` | 更深红 |
| `tk-red-800` | `#990C2B` | 深红 |
| `tk-red-900` | `#6B061D` | 深红文本 |
| `tk-red-1000` | `#3D0210` | 最深 |

**青 scale（品牌辅色，默认 `tk-cyan-400 = #25F4EE`）**：`100=#E3FEFD`、`200=#BAFCFA`、`300=#7CF8F4`、`400=#25F4EE`、`500=#14D6D0`、`600=#0FB3AE`、`700=#0C8F8B`、`800=#086B68`、`900=#054745`、`1000=#022322`。

**黄（图表/警示数据用途）**：`tk-yellow-500 = #F59E0B`。

**黑 scale（中性，默认 `tk-black-1000 = #161823`）**：`100=#EBEBED`、`200=#D2D3D7`、`300=#ABACB4`、`400=#84868F`、`500=#5D5F6B`、`600=#44454F`、`700=#313340`、`800=#232533`、`900=#1B1D29`、`1000=#161823`。

**白 scale（默认 `tk-white-100 = #FFFFFF`）**：`100=#FFFFFF`、`200=#FAFAFB`、`300=#F2F2F4`、`400=#E8E8EC`、`500=#DCDCE2`、`600=#C9C9D1`、`700=#ABABB5`、`800=#87878F`、`900=#5E5E66`、`1000=#36363B`。

### 3.2 语义层 · 品牌与角色 token

| Token | 默认(dark)值 | 用途 |
|---|---|---|
| `primary` | `#DC1434` | 主按钮背景/边框/强调装饰（白字对比 ≥4.5:1） |
| `primary-fg` | `#F0466A` | primary 浅色版，专供文本色（on dark ≥4.5:1） |
| `secondary` | `#25F4EE` | 辅强调，底部导航高亮等 |
| `on-primary` | `#FFFFFF` | 主按钮上的文字 |
| `on-media` | `#FFFFFF` | 图片/媒体上的文字 |
| `on-accent` | `#161823` | 次强调（cyan 底）上的深色文字 |

> `primary` 由品牌红 `#FE2C55` 调为 `#DC1434`，是为保证白字按钮对比 ≥4.5:1（WCAG AA）`[Data-backed]`；原色仍留作 `tk-red-500` 供非文本装饰。

### 3.3 语义层 · 表面与前景

| Token | 值 | 用途 |
|---|---|---|
| `background` | `#0B0B10` | 页面背景（PWA `theme_color` 同值） |
| `card` | `#1A1C2B` | 卡片/底栏背景 |
| `card-elevated` | `#262A3C` | 浮起表面 |
| `video-bg` | `#181821` | 媒体/视频底色 |
| `foreground` | `#F5F5F7` | 默认正文 |
| `muted-foreground` | `#AEB2C0` | 次要文本 |
| `border` | `#666C9E` | 分隔线（≥3:1 vs card） |
| `text-heading` | `foreground` | 主标题（最亮） |
| `text-subheading` | `color-mix(foreground 72%, muted)` | 副标题/强调正文 |
| `text-body` | `foreground` | 正文 |
| `text-muted` | `muted-foreground` | 时间戳/说明/次要元信息 |
| `ring` | `primary-fg` | 焦点环 |

### 3.4 语义层 · 状态与标签色

| Token | 值 | 用途 |
|---|---|---|
| `success` | `#10B981` | 成功主色 |
| `success-bg` / `success-fg` | `#0E2A22` / `#34D399` | 成功底 / 成功文本 |
| `error` / `error-fg` | `#E5484D` / `#FF6485` | 错误文本/边框 |
| `destructive` | `#EA4F53` | 破坏性按钮背景 |
| `error-bg` | `#2E1416` | 错误提示底 |
| `warning-fg` | `#F59E0B` | 警示文本 |
| `tag-green/blue/purple/gray` | `#34D399`/`#60A5FA`/`#C084FC`/`#9CA3AF` | 类型标签（on card ≥4.5:1） |
| `accent-blue` / `accent-orange` | `#5B9BD5` / `#E0A060` | 辅助强调：信息链接 / AI 生成按钮、警示标签 |

> 各值取自 `tokens.css`，在深色主题下均已对齐 OS/Lit 对比要求 `[Data-backed]`。

---

## 4. 间距、圆角、阴影

### 4.1 圆角语言

| Token | 值 | 用途 |
|---|---|---|
| `radius-xs` | `2px` | 极小角 |
| `radius-sm` | `6px` | 小控件 |
| `radius-md` | `8px` | 卡片、输入框默认 |
| `radius-lg` | `12px` | 大卡片、气泡、输入区 |
| `radius-xl` | `16px` | 更大面板 |
| `radius-shell` | `32px` | 壳/圆胞形态 |
| `radius-pill` | `999px` | 药丸/头像全圆 |

### 4.2 阴影层级

| Token | 值 | 用途 |
|---|---|---|
| `shadow-card` | `0 1px 2px rgba(0,0,0,.35), 0 4px 14px rgba(0,0,0,.18)` | 卡片静止 |
| `shadow-elevated` | `0 2px 8px rgba(0,0,0,.40), 0 14px 36px rgba(0,0,0,.32)` | 浮起/抽屉 |
| `shadow-popup` | `0 8px 24px rgba(0,0,0,.45), 0 24px 64px rgba(0,0,0,.40)` | 弹层/模态 |

### 4.3 间距

间距 token 已在 `tokens.css` **落地定义**（`--spacing-xs/sm/md/lg/xl/2xl = 4/8/16/24/32/48px`），作为通用间距的语义源：

| Token | 值 | 用途 | 依据 |
|---|---|---|---|
| `spacing-xs/sm/md/lg/xl/2xl` | `4/8/16/24/32/48px` | 触控间距最小 8，底栏内部 8-12 | 8pt 网格惯例 `[Research-backed]`；`mobile-ui-design §6` |

> `spacing-*` 已落地定义（2026-08-24）。组件**增量迁移中**：为避免一次性全量替换破坏布局，按组件逐个校验迁移（已迁移示例：CharactersView 移动 padding），现有组件内未迁移的固定间距在迁移前仍有效 `[Data-backed]`。移动端相邻可点目标间距 ≥8px `[Research-backed]`（Apple HIG 惯例）。

---

## 5. 排版系统

| Token | 值 | 用途 |
|---|---|---|
| `font-sans` | `Inter, "TikTok Sans", ui-sans-serif, sans-serif` | 默认 UI 文本（移动端用系统字体，避免下载拖慢 `§7`） |
| `font-display` | `Inter, "TikTok Display", ui-sans-serif, sans-serif` | 大标题（theatre 主题切换为衬线） |
| `font-serif` | `Georgia, Times, serif` | 衬线场景 |
| `font-mono` | `"JetBrains Mono", monospace` | 代码/数值 |
| `display-size` | `clamp(48px, 7vw, 96px)` | 展示级大标题 |
| `display-weight/line-height/letter-spacing` | `600-700` / `0.95` / `-0.02em` | 展示级度量 |
| `h2-size/weight/line-height` | `28-32` / `600` / `1.15` | 二级标题 |
| `h3-size/weight/line-height` | `18-20` / `600` / `1.3` | 三级标题 |
| `body-size/weight/line-height` | `14-15` / `400` / `1.6` | 正文 |
| `kicker-size/letter-spacing/transform` | `11` / `0.14em` / `uppercase` | 眉题/标签 |

> 移动端正文与输入保持 ≥16px，防 iOS 聚焦放大 `[Data-backed]`（`mobile-ui-design §7`）。

---

## 6. 组件规范

本节为关键组件的最小规范集。每个含：描述 / Props / 状态 / 变体 / 上例。组件样式一律引用上述语义 token，禁止硬编码。

### 6.1 主按钮（`btn-primary` / 组件内主行动）

- **描述**：页面主投入点，常为「开始对话」「保存」。
- **变体与 token**：背景 `primary`，文字 `on-primary`，悬停/按压用按压反馈（移动端无 `:hover` 依赖，`active` 反馈 `[Expert judgment]`）。
- **焦点**：焦点环 `ring`（2px，外距 `off`）。
- **上例（Vue/原生 CSS 示意）**

```css
.btn-primary {
  background: var(--primary);
  color: var(--on-primary);
  border-radius: var(--radius-md);
  padding: 0 var(--spacing-md);
  min-height: 44px; /* 移动触控目标 ≥44px */
}
.btn-primary:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
.btn-primary.active { filter: brightness(0.9); }
```

### 6.2 底部导航项（`BottomNav`）

- **描述**：移动端 ≤640px 的 5 Tab 固定底栏，替代桌面左栏。
- **状态**：`active` 高亮用 `secondary`；未激活 `muted-foreground`；底栏 `card` 背景 + `border` 顶分隔。
- **尺寸**：项 `min-height ≥52px`、图标 22px、标签 10px、间距 `gap 2px`。
- **安全区**：`padding-bottom: env(safe-area-inset-bottom, 0)`。
- **上例**（现实现 `BottomNav.vue` 摘录）

```css
.bottom-nav { background: var(--card); border-top: 1px solid var(--border);
  padding-bottom: env(safe-area-inset-bottom, 0); }
.bottom-nav-item.active { color: var(--secondary); }
```

### 6.3 卡片（`Card`）

- **描述**：会话行、角色卡、市场条目的承载容器。
- **token**：背景 `card`（浮起 `card-elevated`）、圆角 `radius-lg`、阴影 `shadow-card`、间距 `spacing-md`。

### 6.4 输入框 / 文本区（`Input` / chat 输入）

- **描述**：文本输入，必防移动端 iOS 放大。
- **token**：背景 `card-elevated`、边框 `border`、圆角 `radius-lg`、焦点环 `ring`。
- **硬性**：`font-size: 16px`（防 iOS 聚焦放大 `[Data-backed]`）；移动端 `min-height 48px`、`max-height 160px` 自动增高。

### 6.5 标签/角标（Tag）

- **描述**：类型角标、状态标记。
- **token**：`tag-*` / `success-fg` / `warning-fg`，文本 on card ≥4.5:1。

> 组件 Props 表：因组件已落地且为 Vue SFC，直接用 `props` 定义即契约，本规范不再重复列出类型表；新增组件时补充 Props/变体表。

---

## 7. 图标系统

- 图标经 `@/components/common/Icon.vue` 与 `icons.ts` 引用现有 svg 资产；底部导航图标：`chat-circle / users / store / book-open / gear`（`BottomNav.vue`）`[Data-backed]`。
- 命名 `kebab-case`，不带尺寸/颜色后缀；尺寸为运行时 prop（底部导航 22px）。
- 颜色继承 `currentColor`，随 `muted-foreground` / `secondary` 状态变化。

---

## 8. 响应式与移动布局规范

来源：`mobile-ui-design §5/§6/§7`、`responsive.css`、`App.vue`。

| 断点 | 布局 |
|---|---|
| `≤640px`（手机） | `BottomNav` 显示，桌面 `NavRail` 卸载；单列/双列卡片；全宽输入 |
| `641–1024px`（平板） | `NavRail` 保留；卡片列数随宽度增；抽屉形态生效 |
| `≥1025px`（桌面） | 左侧栏 + 多列，不改变 |

### 8.1 关键移动规范

| 项 | 规范 |
|---|---|
| 可点目标 | ≥44×44px（导航项/按钮/列表行）`[Research-backed]`，统一用 `--touch-min` token |
| 图标按钮 | 内嵌 svg，外衬 ≥44px 热区 |
| 相邻目标间距 | ≥8px |
| 手势 | 下拉刷新、上滑、返回手势可发现且不冲突 |
| 悬停 | 手机无效，用 `active` 按压反馈；所有 `:hover` 必须包在 `@media (hover: hover) and (pointer: fine)` 内（守卫：`npm run check:hover`） |
| 输入 | `font-size ≥16px` 防 iOS 放大 |
| 安全区 | `env(safe-area-inset-*)` 垫高底部导航与输入区 |
| 减动效 | `prefers-reduced-motion`，过渡 ≤120ms |

> **断点口径的唯一表述来源（Single Source of Truth）**
>
> `≤640px` 移动 ／ `641–1024px` 平板 ／ `≥1025px` 桌面。
>
> - **本节即唯一表述来源**。其他文档（`mobile-ui-design.md`、`mobile-pwa-plan.md`、`README.md`、`CONTRIBUTING.md` 等）**引用本节，不得复述另一套边界**；历史上出现的 `<640 / 640–1024 / >1024` 等表述均已按本口径更正。
> - 代码侧对应来源：`src/core/viewport.ts`（L4 端状态，`matchMedia` 唯一允许出现的位置）与 `src/styles/tokens-responsive.css`（L1 断点令牌）；二者数值同步由 `npm run check:breakpoints` 守卫。
> - 该口径 2026-08-24 统一，2026-09-18 补齐文档侧表述（Web SOP 评审 P1-8）。

---

## 9. 主题与暗色模式

主题通过 `[data-theme="xxx"]` 覆盖 `:root` 变量实现，`tokens.css` 定义默认 dark，`themes.css` 声明差异覆盖。语义 token 仅改引用、组件零改动。已落地主题：`light`、`midnight`、`oled`、`theatre`。

| 语义 token | dark(默认) | light | midnight | oled | theatre |
|---|---|---|---|---|---|
| `background` | `#0B0B10` | `#F7F8FA` | `#0A0E27` | `#000000` | `#0C0A09` |
| `card` | `#1A1C2B` | `#FFFFFF` | `#161C42` | `#161616` | `#211B14` |
| `foreground` | `#F5F5F7` | `#161823` | `#F0F4FF` | `#FFFFFF` | `#F5EFE6` |
| `muted-foreground` | `#AEB2C0` | `#5D5F6B` | `#A5B0D6` | `#A1A1A1` | `#A69C8E` |
| `primary` | `#DC1434` | `#C81E45` | `#9333EA` | `#E11D48` | `#C9A24B` |
| `secondary` | `#25F4EE` | `#0A7A77` | `#7DF9FF` | `#06B6D4` | `#E85D7F` |

每个主题的对比度均已核对 WCAG 2.1 AA（前景/背景 ≥4.5:1，分隔线 ≥3:1）`[Data-backed]`（见 `themes.css` 顶部与各段注释）。`theatre` 额外将 `font-display` 切换为衬线族（Playfair Display / Noto Serif SC）。

**上例（主题输出）**

```css
:root { --primary: #DC1434; }
[data-theme='light'] { --primary: #C81E45; }
[data-theme='midnight'] { --primary: #9333EA; }
```

---

## 10. 无障碍（a11y）规范

| 项 | 规范 | 依据 |
|---|---|---|
| 正文对比 | ≥4.5:1（WCAG 2.1 AA） | `[Research-backed]` |
| 大文本/UI 组件/非文本 | ≥3:1 | `[Research-backed]` |
| 焦点指示 | `ring` 2px、`outline-offset 2px` | `tokens.css` |
| 底部导航 | `role="navigation"`、`aria-label`；当前项 `aria-current="page"` | `BottomNav.vue` 已实现 `[Data-backed]` |
| 模态 | `role="dialog"`、`aria-modal`、Esc 关闭、Tab 焦点陷阱 | 项目硬约束 |
| 悬停不设 | 移动端键鼠双修：可点目标键盘可达 | — |

---

## 11. 红线与质量

- 禁止硬编码色值/间距/字号于组件；一律走 token（语义 token 引用视觉 token）。
- 新增 token 用 kebab-case，合法 CSS 变量与 JS 键。
- 改任何设计值：先改 `tokens.css`/`themes.css`，再同步本规范（本规范是实现的镜像，不反向约束）。
- 移动端不回归桌面：所有移动适配经断点隔离，桌面 `>1024px` 不变。
- 对比度/焦点/安全区为非豁免项，所有交互组件必须达标。