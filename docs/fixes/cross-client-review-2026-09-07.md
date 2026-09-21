# AI 酒馆（ai-roleplay）桌面端 / 移动端跨端一致性评审报告

| 项目 | 内容 |
| --- | --- |
| 报告日期 | 2026-09-07 |
| 评审对象 | `G:\AI-data\AIjiuguan` 仓库当前工作分支源码（`src/`） |
| 评审范围 | 桌面端（Tauri / Windows）与移动端（浏览器 / PWA）的**样式层、交互层、流程层**跨端一致性 |
| 评审性质 | **仅评审，不修改任何源码**。本报告所有"修复建议"均为待排期方案 |
| 质量总评 | **总分 14 / 25，判定：不通过**（交互层 + 流程层 5 维评分，明细见下一行；由初版 15/25 修订：交互层克制维度 4→3，同时 I-10 由"阻断"重新定性为"中"，两者互不抵消）。该分数仅覆盖**交互层 + 流程层**；样式层由设计系统专家独立裁定，**两套 5 维彼此独立、不可合并为一个总分** |
| 5 维明细 | 设计哲学 3 / 视觉层次 3 / **执行质量 2** / 特异性 3 / **克制 3**（克制已由 4 下调：存在 `responsive.css:43-70` 整段死代码、同一用途两套底部留白值） |
| 问题总数 | **29 条**（样式 10 / 交互 14 / 流程 5），严重度分布：**高 2 · 中 21 · 低 6** |

---

## 1. 评审摘要

### 1.1 背景

本项目同一套 Vue 3 + Vite 源码需同时支撑三种运行时：

- **桌面端**：Tauri 容器（Windows），使用 `TauriFSAdapter` 本地文件系统 + Rust `reqwest` SSE 传输层；
- **Web 端**：浏览器 `fetch` + `ReadableStream`，受 CORS 限制；
- **移动端 / PWA**：Web 端的一个子集，但独占 `BottomNav` 底部 Tab 导航与抽屉式布局。

三者共用同一份 `src/`，但**缺乏统一的"端判定契约"**。本次评审的目的，是把"同一份代码在两端行为不一致"的地方全部找出来，给出可直接排期的修复清单。

### 1.2 方法

1. 以 `Grep` 全仓扫描 `src/**/*.{vue,css,ts}`，穷举 `@media`、`matchMedia`、`z-index`、`100vh`、`type="file"`、手势事件、`confirm(` 等所有跨端敏感写法（已排除 `dist*/`、`coverage*/`、`node_modules/` 构建产物干扰）；
2. 逐个读取命中文件，确认**实际生效规则**（含 CSS 加载顺序与特异性竞争关系），而非仅记录"存在某规则"；
3. 对每条问题给出"受影响端 / 触发场景 / 文件:行号 / 修复建议"四要素。

### 1.3 严重度判定标准（本报告统一口径）

| 等级 | 判定标准 |
| --- | --- |
| **高** | 阻断使用，或造成数据/状态错误，或影响**大多数手机用户的主线操作** |
| **中** | 特定端（如平板 641–1024、iOS）或特定路径下功能受限、明显体验缺陷，或**高概率触发的潜伏架构问题** |
| **低** | 仅视觉 / 动效瑕疵，或仅在非主流路径出现，且可绕过 |

### 1.4 总判定

**不通过。** 核心结论有三条：

1. **端判定没有唯一来源（Single Source of Truth）**。全仓存在 **5 套互相冲突的"如何判断是手机端"口径**（见第 2 节），其中 CSS 用 640px、TS 状态用 1024px——两者之间 641–1024 的平板区间处于"半移动半桌面"的未定义状态，直接派生出 S-5 / S-6 / I-13 一组平板专属缺陷。
2. **存在 2 条高严重度缺陷**，均命中手机端主线操作：`S-4`（遮罩 z-index 低于底部导航，抽屉打开时导航不变暗且可点击，会导致抽屉与遮罩被"带"到新页面）与 `I-6`（输入框回车发送缺 `isComposing` 守卫，中文/日文输入法组词回车即误发）。
3. **架构上呈"修一次引入一次"的脆弱结构**：一处 `!important` 叠加 27 个、一处"无障碍钩子加载顺序取胜"（S-9）、一处"布尔值双语义"（I-1）。这些本身今天不崩，但任何一处改动都可能触发大面积回归。

### 1.5 对原始素材的两处实地修正（重要）

> 为保证交付文档的准确性，以下两条与前期素材口径不同，**以本报告为准**，并已同步质量审查官：

| 编号 | 原素材结论 | 实地核实修正 |
| --- | --- | --- |
| **I-10** | "进入二级详情页后手机端**没有任何可见返回 / 导航入口**，用户被困（roach motel）" | **夸大。** 实际 `src/views/` 下绝大多数详情页**均有出口**：`DataBankView.vue:56`、`ImageGeneratorView.vue:100`、`LocalModelView.vue:65`、`StoryEngineView.vue:279`、`RandomEventsView.vue:218`、`CharacterVersionView.vue:381`、`CharactersView.vue:86`、`ArchivesView.vue:35`、`WorldBookView.vue:87`、`GroupChatView.vue:52` 全部定义了 `goBack()`。真实缺陷是两点：① 这些出口**一律 `router.push({ name: 'chat' })`**，不是 `history.back()`，会丢失来源页（例如从"设置"进入"本地模型"，返回却落到"对话"）；② **`ProfileView.vue` 确实无任何出口**——全文件无 `useRouter` 引用、无返回按钮，且 `/profile` 唯一入口是 `NavRail.vue:36`（NavRail 在 ≤640 已被 `App.vue:469` 隐藏）。因此 I-10 严重度**由"阻断"下调为 中**。 |
| **S-10** | 野断点含 "CharacterEditorView 1023 / 600" | Grep 核实 `CharacterEditorView.vue` 只有 **1023（:1957）与 640（:1968、:2134）**，**不存在 600**。同时补全素材遗漏的一条野断点：**`responsive.css:116` 的 `max-width: 380px` 极窄屏档**。 |

---

## 2. 端判定现状表（当前代码中实际存在的全部口径）

> 这是本次评审发现的**根因层**。下表列出当前仓库里**并存且互相冲突**的 5 套端判定方式。

| 序号 | 判定层 | 判定口径 | 阈值 / 条件 | 涉及文件与代码位置 | 后果 |
| --- | --- | --- | --- | --- | --- |
| **G-1** | CSS 全局样式 | `@media` 查询，三档：桌面 `>1024` / 平板 `641-1024` / 移动 `≤640`（文件注释自称唯一标准） | `1025 / 641 / 1024 / 640` | `src\styles\responsive.css:3-4`（注释声明）、`:7`（`min-width:1025`）、`:14`（`min-width:641 and max-width:1024`）、`:32`（`max-width:640`） | 是唯一自称为标准的一套，但未被其他层遵守 |
| **G-2** | CSS 遗留 / 横屏 | 额外的高度 + 方向 + 宽度复合断点（未纳入上表三档） | `max-height:480px` + `orientation:landscape` + `max-width:900px` | `src\styles\responsive.css:126-129` | 引入第 4 个宽度值 `900`；横屏规则针对 `.nav-rail`（已在 ≤640 被隐藏），**当前为死规则** |
| **G-3** | Vue 模板显隐 | `<BottomNav v-if="showBottomNav">` + 同 specific 冲突下的 `@media` 显隐；另用 `has-mobile-nav` 类带 Struts 布局信息 | ≤640 | `src\App.vue:321`（`has-mobile-nav`）、`:325`（`BottomNav` 挂载）、`:458`（`@media max-width:640`）、`:468-469`（隐藏 NavRail）、`:471-474`（显示 BottomNav） | 与 G-1 数值一致（640），但**实现在组件样式里**，且依赖"加载顺序晚于 responsive.css"取胜（见 S-9） |
| **G-4** | 组件内 JS | 运行时 `window.matchMedia` 脏判断 | `max-width: 640px` | `src\components\layout\NavRail.vue:42` | 与 G-5 的 1024 冲突；数值重复写死 |
| **G-5** | TS 状态 / 视图逻辑 | 运行时 `window.matchMedia` | **`max-width: 1024px`** ⇒ `isMobile` | `src\views\ChatView.vue:17-19` | **与 G-1/G-3/G-4 的 640 相差一整档**。由此产生 `inert` 判定、ESC 判定、焦点管理的"移动"定义都比 CSS 宽得多 ⇒ S-5 / S-6 / I-3 / I-13 / I-14 的直接来源 |
| **G-6** | 组件 scoped 甩尾 | scoped 样式内自写 `@media`，特异性高于全局 responsive.css | `max-width: 1024px` | `src\components\layout\ContextPanel.vue:633-636`（`.mobile-menu-btn{display:inline-flex}`） | 与 `responsive.css:99`（≤640 才显示同名单）**不对称**；且 scoped 属性选择器特异性更高，直接覆盖全局规则 |

**端判定矩阵（各口径实际覆盖的宽度区间）**

| 宽度区间 | CSS 布局（G-1） | 底部导航（G-3） | `isMobile`（G-5） | 抽屉关闭钮 ContextPanel（G-6） | 角色列表开关（G-1 responsive.css:99） | 结论 |
| --- | --- | --- | --- | --- | --- | --- |
| ≤ 380 | 移动 | 显示 | true | 显示 | 显示 | 一致 |
| 381 – 640 | 移动 | 显示 | true | 显示 | 显示 | 一致 |
| **641 – 1024** | **平板**（ContextPanel 抽屉化） | **隐藏** | **true（仍算移动）** | **显示** | **隐藏（无开关）** | **不一致** ⇒ S-5 / S-6 / I-13 |
| ≥ 1025 | 桌面 | 隐藏 | false | 隐藏 | 隐藏 | 一致（但 G-5 的惯性影响见 I-2 / I-3） |

---

## 3. 样式层问题清单（S-*，共 10 条）

| 编号 | 问题描述 | 受影响端 | 触发场景 | 涉及文件与代码位置 | 严重程度 | 修复建议 |
| --- | --- | --- | --- | --- | --- | --- |
| **S-1** | **双导航栏方案并存且互斥**。旧方案把 `.nav-rail` 改造为固定底部横排 Tab（含 27 处 `!important`）；新方案挂载 `BottomNav.vue` 并在 ≤640 隐藏 `.nav-rail-desktop`。两套同时匹配 ≤640，最终靠 App.vue 样式晚加载取胜，旧方案已沦为**死规则**——任何一处 `!important` 失效（顺序变动、样式分包、CSS 压缩合并）即双导航叠加。 | 移动端（潜伏）；桌面端（若 ╋回归则全端） | ① 构建顺序或分包策略变更；② 新增同类 `!important` 规则；③ CSS 体积优化引入层折叠 | `src\styles\responsive.css:42-70`（旧方案：`.nav-rail` position:fixed / flex-direction:row / z-index:30 等 27 处 `!important`）<br>`src\App.vue:318`（挂载 NavRail）<br>`src\App.vue:468-474`（`display:none !important` + `.app-bottom-nav{display:flex!important}`） | **中** | **当前不可见，属高概率触发的潜伏架构问题**。修复：删除 `responsive.css:42-70` 全部 `.nav-rail` 底部化旧规则；NavRail 改为 `v-if="!isMobile"` 真卸载（而非 CSS 隐藏），同时消解 I-4；改完后 `responsive.css` 的 `!important` 数量应降至个位数，并在 CI 加一条"禁止 `!important` 增量"的检查。 |
| **S-2** | **底部导航高度四套口径互不一致**：竖屏 64px / 横屏 56px / BottomNav 本体 `min-height:52px`+`env()` / 主内容预留 `calc(56px + env())`。四者无单一来源。当前组合恰好不产生遮挡（预留 56 > 本体 52），但任何一处调整立即导致内容被挡或底部留大量空白。 | 移动端 / 平板（潜伏） | 调整底部导航高度、新增 Tab、适配新机型安全区 | `src\styles\responsive.css:50`（`height:64px`）<br>`src\styles\responsive.css:127-128`（横屏 `56px`）<br>`src\components\mobile\BottomNav.vue:60`（`min-height:52px`）、`:50`（`env(safe-area-inset-bottom)`）<br>`src\App.vue:487`（`calc(56px + env(safe-area-inset-bottom))`） | **中** | 定义唯一 token `--mobile-nav-h: 56px`（含结论值），`BottomNav.vue` 用 `min-height: var(--mobile-nav-h)`，主内容用 `padding-bottom: calc(var(--mobile-nav-h) + env(safe-area-inset-bottom, 0px))`；横屏规则改为 `--mobile-nav-h` 覆盖为 48px，而不是另写 `.nav-rail` 规则。 |
| **S-3** | **`.app-main` 移动端 `padding-bottom` 三处互相覆盖**：64px → `env()` → `calc(56px+env())`。前两条同特异度纯靠加载顺序取胜；非安全区设备（多数 Android 直屏）`env()` 解析为 `0px`，第二条等于"取消所有底部留白"。 | 移动端 | 任何 ≤640 页面；特别是无底部导航的详情页 | `src\styles\responsive.css:38-40`（`padding-bottom:64px`）<br>`src\App.vue:482-484`（`env(safe-area-inset-bottom)`，非安全区设备 = 0）<br>`src\App.vue:486-488`（`.app-main.has-mobile-nav`，特异度 0-2-0，最终生效） | **低** | 合并为 1 条：`.app-main { padding-bottom: env(safe-area-inset-bottom, 0px); }` + `.app-main.has-mobile-nav { padding-bottom: calc(var(--mobile-nav-h) + env(safe-area-inset-bottom, 0px)); }`，删除 `responsive.css:38-40`。**注意必须保留 `env()` 的第二个参数 `0px`**，这是当前代码中缺失的兜底写法（见 `BottomNav.vue:50` 已正确书写）。 |
| **S-4** | **z-index 秩序错乱（最高优先级样式缺陷）**。→ `.overlay-mask`=40 < `BottomNav`=50：抽屉打开时遮罩压不住底部导航，底部导航**不变暗且仍可点击**；用户点击后发生路由跳转，而 `characterListOpen` / `panelOpen` 不会复位 ⇒ 新页面常驻半透明遮罩。→ 抽屉=50 与 `BottomNav`=50 同值，且 `App.vue:325` 的 BottomNav 在 DOM 上位于 `<main>` 之后 ⇒ 同值时 BottomNav 后绘制、盖住抽屉底部 ⇒ **抽屉底部约 52px 的按钮点不到**。→ 中间层 `.app-main`（`flex/height/overflow`）、`.chat-shell`（同上）均未创建 stacking context，三者同属根级层叠上下文，比较是"裸"的。 | 移动端 / 平板（≤1024 抽屉态） | ① 手机上打开角色列表或上下文面板抽屉；② 抽屉打开时点底部 Tab；③ 抽屉底部有按钮时 | `src\styles\base.css:143-152`（`.overlay-mask`，`z-index:40`）<br>`src\components\mobile\BottomNav.vue:42-52`（`position:sticky` + `z-index:50`）<br>`src\styles\responsive.css:23`、`:79`、`:93`（抽屉 `z-index:50`）<br>`src\App.vue:321-325`（DOM 顺序：`<main>` 在 `<BottomNav>` 之前）<br>`src\styles\layout.css:17-24`（`.app-main`，无 position/z-index）<br>`src\views\ChatView.vue:90-96`（`.chat-shell`，无 position/z-index）<br>对照：`src\components\common\Modal.vue:162`=100、`src\components\common\Toast.vue:129`=200 | **高** | 立即引入集中式 z-index token（见第 8.2 节），取值：`--z-mobile-nav:45` / `--z-overlay-mask:55` / `--z-drawer:60` / `--z-modal:100` / `--z-toast:200` / `--z-top:9999`。这样遮罩(55) > 底部导航(45) 且 < 抽屉(60)：抽屉仍在最上，遮罩能压暗并拦截底部导航点击。同时给 `App.vue:325` 的路由跳转加 `closeAllDrawers()`（或在 `router.afterEach` 统一复位抽屉状态）。 |
| **S-5** | **抽屉开关按钮断点不对称（640 vs 1024）**：角色列表开启钮 / 关闭钮受全局 `≤640` 控制；ContextPanel 关闭钮受自身 scoped `≤1024` 控制；ContextPanel 开启钮 `.panel-toggle-btn` **无任何断点限制、全宽度恒显**。⇒ 平板 641–1024 区间"上下文面板能开能关，角色列表抽屉完全无开关"。 | **平板（641–1024）** | iPad / Android 平板竖屏（常见 768 / 800 / 810px）打开聊天页 | `src\components\layout\CharacterList.vue:103`（`.mobile-menu-btn char-close-btn`，受 `≤640` 控制）<br>`src\components\layout\ContextPanel.vue:137-142`（`.mobile-menu-btn ctx-close`，受 scoped `≤1024` 控制 ⇒ `ContextPanel.vue:633-636`）<br>`src\styles\responsive.css:99`（`.mobile-menu-btn{display:inline-flex!important}`）、`:123`（基线 `display:none`）<br>`src\components\chat\ChatMain.vue:619-627`（`.panel-toggle-btn`，无断点限制）<br>角色列表开启钮参考 `src\components\chat\ChatMain.vue:566` 区域同类 `.mobile-menu-btn` | **中** | 禁止组件内写断点。改为语义化工具类：`. touch-only` / `.tablet-only` / `.desktop-only`（classes 名建议 `client-mobile-only` / `client-tablet-only` / `client-desktop-only`），由 `responsive.css` 统一定义显隐；四个按钮全部改用工具类，角色列表开 / 关钮统一到 `≤1024`（与 ContextPanel 一致）。 |
| **S-6** | **`CharacterList` 在 641–1024 呈"三不像"形态**：`responsive.css:14-15` 只改 `width:240px`，未像 `≤640`（`:73-83`）那样改为 `position:fixed` 抽屉，仍留在文档流；而 `ChatView.vue:70` 在 `panelOpen && isMobile` 时将其置 `inert` ⇒ **平板打开上下文面板时，角色列表可见但完全不可交互**（"看得见点不着"）。 | **平板（641–1024）** | 平板上点击右上角面板钮打开 ContextPanel | `src\styles\responsive.css:14-15`（仅 `width:240px!important`）<br>`src\styles\responsive.css:73-83`（≤640 的 `position:fixed` 抽屉形态，未覆盖平板）<br>`src\views\ChatView.vue:70`（`:inert="characterStore.panelOpen && isMobile ? true : undefined"`） | **中** | 二选一，不要摇摆：**(推荐) 统一到 641–1024 也抽屉化**，即把 `:73-83` 的 `position:fixed` 规则上提到 `@media (max-width:1024px)`；或 **(备选) 保持文档流**，则 `ChatView.vue:70` 的 `inert` 条件必须收紧为真正抽屉态。二者不能分家。同时把显式写死的 240px 宽度也改用 token 表达。 |
| **S-7** | **`ContextPanel` 抽屉缺 `transition`**：平板档（641–1024）写了 `transition: transform .3s`，≤640 档缺失 ⇒ **手机抽屉是"瞬移"，平板抽屉有动画**，同一功能两端手感不一致。 | 移动端 | 手机上开合上下文面板抽屉 | `src\styles\responsive.css:17-28`（平板档，含 `:26` 的 `transition: transform .3s cubic-bezier(.2,.8,.2,1)`）<br>`src\styles\responsive.css:87-97`（≤640 档，无 `transition`）<br>参考正确写法：`src\styles\base.css:155`（`.drawer{transition:transform .3s ...}`） | **低** | 把两档合并为一条 `@media (max-width:1024px)` 抽屉规则（与 S-6 一起做），`transition` 只写一次；保留 `base.css:163+` 的 `prefers-reduced-motion` 全局兜底。 |
| **S-8** | **`100vh` 残留 2 处**（无 `dvh` 回退）：iOS Safari / Chrome 地址栏会动态收缩，`100vh` 大于实际可视高度 ⇒ 依赖 `max-height` 的下拉/浮层底部被裁切且无法滚到。 | **移动端（尤其 iOS）** | iOS Safari 打开角色编辑器 / 设置页的下拉类浮层 | `src\views\CharacterEditorView.vue:1627`（`max-height: calc(100vh - 120px)`）<br>`src\views\SettingsView.vue:2353`（`max-height: calc(100vh - 32px)`）<br>对照（**已正确规避**）：`src\styles\layout.css:10-11`（`.app-shell` 先 `100vh` 再 `100dvh` 双写回退） | **中** | 照搬 `layout.css:10-11` 的成熟写法，先 `100vh` 兜底再 `100dvh` 覆盖；或直接改用 `max-block-size`。两处一次改完，并加入 lint 规则禁止新增裸 `100vh`。 |
| **S-9** | **全局 `<style>` 依赖加载顺序取胜（架构债）**：`App.vue:340` 起的样式块**未加 scoped**，内含 `@media(max-width:640px)`；它作为单文件组件样式在运行时注入，晚于 `main.ts:3-7` 引入的 `responsive.css` ⇒ **同特异度下纯靠晚加载取胜**。配合 `responsive.css` 的 27 处 `!important`，任何构建产物合并顺序变化都会导致样式大面积回归。 | 全端（潜伏） | 构建配置调整、样式抽取策略变化、SSR / 预渲染改造 | `src\App.vue:340`（`<style>` 无 scoped）<br>`src\App.vue:458-489`（其中的全局媒体查询块）<br>`src\styles\responsive.css`（全篇 27 处 `!important`，尤以 `:42-70` 为最） | **中** | 把 App.vue 的全局样式迁出到 `src\styles\app-shell.css`，在 `main.ts` 中**显式、集中、有序**引入；引入顺序在 `main.ts` 里以注释固化（`tokens → themes → base → layout → responsive → app-shell`），不再依赖组件注入时机。 |
| **S-10** | **业务页野断点**（与统一层的 640/1024/1025/380 不一致）：共 8 处非标数值，分散在 6 个文件，均为各自为政的宽度试探，既无法解释也与端契约冲突。 | 全端 | 在对应页面按这些宽度缩放窗口 | `src\views\WorldBookView.vue:2532`（`max-width:1100px`）、`:2650`（`max-width:600px`）<br>`src\views\GroupChatView.vue:1954`（`max-width:900px`）<br>`src\views\StoryEngineView.vue:3224`（`max-width:600px`）<br>`src\views\CharacterEditorView.vue:1957`（`max-width:1023px`）<br>`src\components\random-events\TemplateEditorModal.vue:414`（`max-width:567px`）<br>`src\components\chat\NewConversationModal.vue:769`（`max-width:539px`）<br>`src\components\layout\ContextPanel.vue:633`（`max-width:1024px`，见 G-6）<br>`src\styles\responsive.css:116`（`max-width:380px`，**素材遗漏，本次补**）<br>附注：经核 `CharacterEditorView` **不存在**素材所述的 600px 断点 | **中** | 逐个归类到 4 种合法意图之一，不允许第 5 种存在：①**端形态切换** → 改用统一断点 / `client-*-only` 工具类；②**容器密度调整** → 改用容器查询 `@container` 或栅格 `auto-fit/minmax`；③**极窄屏内容压缩** → 归入统一 `--bp-narrow`；④**弹窗宽度微调** → 改用 `width:min(92vw, 560px)` 这类**无断点**写法（可一次性消灭 539 / 567 / 600 三处）。目标：除第 8.2 节断点常量表外，`src/` 中不再出现任何断点数字。 |

---

## 4. 交互层问题清单（I-*，共 14 条）

| 编号 | 问题描述 | 受影响端 | 触发场景 | 涉及文件与代码位置 | 严重程度 | 修复建议 |
| --- | --- | --- | --- | --- | --- | --- |
| **I-1** | **`panelOpen` 一个布尔承载两种语义**：桌面=「面板是否展开」，移动端被当作「抽屉是否打开」。初值为 `true`，即桌面语义真值被直接灌进移动端语义。注意**已被部分缓解**：`ChatView.vue:49-51` 在挂载时若 `isMobile` 会立即 `closeAllDrawers()`，故通常不会停在展开态，但存在首帧闪现风险，且语义复用使所有下游判断都不可信。 | 移动端 + 桌面端（潜伏） | 首屏挂载；未来任何新增读取 `panelOpen` 判断"抽屉是否开"的代码 | `src\stores\character.ts:47`（`panelOpen = ref(true)`）、`:48`（`characterListOpen = ref(false)`）、`:205-216`（`togglePanel` / `toggleCharacterList` / `closeAllDrawers`）<br>`src\components\layout\ContextPanel.vue:129`（`:class="{active: characterStore.panelOpen}"`）<br>`src\components\layout\CharacterList.vue:87`（`:class="{active: characterStore.characterListOpen}"`）<br>缓解点：`src\views\ChatView.vue:46-51` | **中** | 语义拆分（见第 8.1 节契约 L3）：`panelExpanded`（桌面，默认 true）+ `contextDrawerOpen`（移动，默认 false）+ `characterDrawerOpen`（移动，默认 false）；`overlayActive` 改为仅后两者之和。这样 I-3 也随之自愈。 |
| **I-2** | **视口状态同步只做单向**：注释明写"回到桌面展开面板，缩到移动收起"，实现只有 `if (mobile) closeAllDrawers()`，**无 else 分支** ⇒ 桌面缩小再放大回来后，上下文面板永久消失（需手动点按钮恢复）。 | 桌面端 | 桌面浏览器缩小窗口到 ≤1024 再放大回来 | `src\views\ChatView.vue:56-59`（注释 vs 实现不符：`watch(isMobile, m => { if (m) closeAllDrawers() })`，缺 `else panelExpanded = true`） | **中** | 补全 `else` 分支：`if (m) closeDrawers(); else characterStore.panelExpanded = true;`。同时按 I-1 拆分语义后，此处只需操作 `panelExpanded`，不再误伤桌面布局。 |
| **I-3** | **移动端逻辑泄漏到桌面（跨端泄漏）**：ESC 关闭抽屉的 `keydown` 监听**不分端**；而 `overlayActive = characterListOpen \|\| panelOpen`，桌面 `panelOpen` 默认 `true` ⇒ **桌面恒为真** ⇒ 桌面用户按 ESC（常用于关闭下拉、取消输入）会莫名收起上下文面板。 | 桌面端 | 桌面端任意时刻按 ESC（尤其在输入框取消、关闭下拉时） | `src\views\ChatView.vue:11-13`（`overlayActive` 计算，含桌面恒真的 `panelOpen`）<br>`src\views\ChatView.vue:39-44`（`handleKeydown`，无端判断）<br>`src\views\ChatView.vue:52-53`（全局 `keydown` 监听注册） | **中** | 一行修复（建议排 P0）：`if (e.key === 'Escape' && overlayActive.value && isMobile.value)`。治本方案：`overlayActive` 按 I-1 改为仅两个移动语义抽屉之和，桌面自然为 false。 |
| **I-4** | **双高亮机制错位**：`NavRail` 高亮依赖 `characterStore.currentNav`（点击时 `setNav`），`BottomNav` 高亮依赖 `route.name`。移动端 NavRail 被 `display:none` **隐藏但组件未卸载**，`currentNav` 不再随路由更新 ⇒ **手机端用底部 Tab 导航后切回桌面，NavRail 高亮与实际路由不符**。（已核实：`currentNav` 未持久化，污染仅限单次会话，不会跨端残留。） | 桌面端（溯源自移动端操作） | 手机 / 窄窗口用 BottomNav 导航若干次 → 放大到桌面宽度显示 NavRail | `src\components\layout\NavRail.vue:39`（`characterStore.setNav(item.key)`）、`:51-53`（`isActive` 读 `currentNav`）<br>`src\components\mobile\BottomNav.vue:31-33`（`:class="{active: route.name === tab.name}"`）<br>`src\stores\character.ts:49`（`currentNav = ref<NavKey>('chat')`，未持久化）<br>`src\App.vue:318`（NavRail 始终挂载） | **低** | 与 S-1 一并解决：NavRail 改 `v-if="!isMobile"` 真卸载（卸载后重新挂载时高亮由路由初始化即可）；或让 NavRail 的 `isActive` 也改为基于 `route.path`，留毙 `currentNav` 为历史兼容仅作视觉提示。 |
| **I-5** | **`hover` 态缺少 `@media (hover: hover)` 守卫 ⇒ 手机点击后 hover 粘滞**。触屏设备没有真实 hover，CSS `:hover` 在"点击后到下一次点击前"会保持生效，导致按钮 / 工具栏高亮、描边、亮度变化**粘住不还原**。全仓唯一相关守卫是 `MessageBubble.vue:175`。 | 移动端 / 平板（触屏即命中） | 手机上点击任意带 hover 样式的元素，然后查看其状态 | 受影响规则清单：<br>`src\styles\base.css:102`（`.hover-surface:hover`）、`:106`（`.hover-cyan:hover`）、`:104`（`.hover-fg:hover`）、`:108`（`.hover-red:hover`）、`:110`（`.hover-bright:hover`）<br>`src\styles\layout.css:242`（`.composer-btn`）、`:262`（`.send-btn-primary`）、`:346`（`.msg-wrap:hover .msg-toolbar`）、`:361`（`.msg-toolbar-btn`）<br>`src\components\chat\ChatMain.vue:906`（`.jump-bottom-btn`）、`:1040`（`.qr-btn`）、`:1081`（`.load-older-btn`）、`:1159`（`.example-chip`）<br>`src\components\layout\CharacterList.vue:460`（`.conv-act-btn`）、`:484`（`.conv-new-btn`）<br>`src\components\common\Modal.vue:205`（`.modal-close`）<br>参考正确守卫：`src\components\chat\MessageBubble.vue:175`（`@media (hover:none){.msg-toolbar{opacity:1}}`） | **中** | 统一做法：**默认不写 hover**，把 hover 规则整体包进 `@media (hover: hover) and (pointer: fine) { ... }`；对 `.msg-wrap:hover .msg-toolbar` 这类"hover 才显形"的交互，必须在 `@media (hover: none)` 分支给出常显 fallback（照 `MessageBubble.vue:175` 的做法）。注意 `:active` 与 `:focus-visible` 不需要守卫，应保留。 |
| **I-6** | **输入法（IME）回车误发送 —— 最高优先级交互缺陷**：`Enter` 发送判定没有 `e.isComposing` 守卫 ⇒ **中文 / 日文输入法组词过程中按回车（用于上屏候选或直接确认）会被判定为发送**，把未组词完成的拼音/假名或错误候选词当作消息发出，且发送即进入 AI 生成流程，不可撤销。 | **移动端 + 桌面端（触屏虚拟键盘尤甚）** | 用中文/日文输入法打字，组词中途按回车确认候选 | `src\components\chat\ChatMain.vue:349-354`（`if (e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); handleSend(); }`，缺 `e.isComposing` / `e.keyCode === 229` 守卫） | **高** | 立即修复（P0）：<br>`if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) { ... }`<br>`isComposing` 覆盖 W3C 标准 IME 组态，`keyCode === 229` 兜底部分旧版 Android / WebView。改完需在**中文拼音、日文假名、韩文**三种 IME 及 iOS/Android 物理 keyboard 上回归。 |
| **I-7** | **iOS 聚焦缩放残留**：`App.vue:476-480` 已做全局 `≤640 { input,textarea,select { font-size:16px } }` 防 iOS 自动放大，但 `ChatMain.vue:823` 的 `.edit-message-input{font-size:13px}` 是 **scoped 规则、特异性更高** ⇒ 移动端"编辑消息"输入框仍为 13px，iOS Safari 聚焦时自动整页放大且通常不会自动还原。（`responsive.css:106` 的 `!important` 只覆盖了主输入框 `.chat-input`。） | **移动端（iOS Safari / iOS 微信 WebView）** | 手机上长按消息 → 编辑 → 聚焦输入框 | `src\App.vue:475-480`（全局 16px 规则）<br>`src\components\chat\ChatMain.vue:818-823`（`.edit-message-input{font-size:13px}`，scoped 覆盖全局）<br>`src\styles\responsive.css:106`（`.chat-input{font-size:16px!important}`，仅主输入框） | **中** | 在 `ChatMain.vue` scoped 样式中补 `@media (max-width: 640px) { .edit-message-input { font-size: 16px; } }`；或把 13px 改为 `max(13px, 1rem)` 的响应式写法。建议同时把"移动端所有可编辑控件字号 ≥16px"写成一条 lint/评审检查项。 |
| **I-8** | **抽屉关闭手段不全 + 缺滚动锁定**：关闭方式只有 ① 遮罩点击（但被 S-4 的底部导航遮挡，可靠性存疑）、② ESC（移动端无）、③ 右上角关闭钮（ContextPanel 有，CharacterList 在 641–1024 缺失，见 S-5）。**全仓无任何 `touchstart/touchmove/touchend` 手势**（`Grep` 仅命中 `core\sanitize.ts:90` 的白名单字符串）⇒ **无滑动关闭**；抽屉打开时**无 body 滚动锁定**（对比 `Modal.vue:86` 已做）。 | 移动端 / 平板 | 抽屉打开后尝试滑动关闭、或在抽屉内滚动到边界 | `src\views\ChatView.vue:78-84`（`.overlay-mask`，只有 `@click`）<br>缺失证据：全仓 `touchstart/touchmove/touchend` 零命中（唯一命中为 `src\core\sanitize.ts:90` 的**安全白名单字符串**，非事件绑定）<br>对照正确实现：`src\components\common\Modal.vue:86`（`document.body.style.overflow = 'hidden'`） | **中** | 两件事一起做：① 抽屉打开时参照 `Modal.vue:86` 锁 `body` 滚动（封装为 `useScrollLock()` 供 Modal 与抽屉共用）；② 在抽屉容器上加 `touchmove` 横向位移手势实现滑动关闭（建议 ≤80ms 快速位移或位移 >25% 宽度关闭，并尊重 `prefers-reduced-motion`）。手势与地面上 S-4 修复后的遮罩点击互补。 |
| **I-9** | **`NavRail` 重复导航未捕获**：点击当前所在项会 `router.push` 到同一路由触发 `NavigationDuplicated`，且该 Promise 未加 `try/catch` / `.catch`（代码只写了 `void`，`void` 不能吞掉 reject） ⇒ 未处理的 Promise rejection。注：NavRail 在 ≤640 已隐藏，**移动端不受影响**；`BottomNav` 用 `router-link`，重复点击被 Vue Router 静默吞掉，无此问题。 | 桌面端 | 桌面上重复点击左侧导航当前项 | `src\components\layout\NavRail.vue:46-48`（`if (item.route) { void router.push(item.route); }`，无 catch） | **低** | 改为 `router.push(item.route).catch(() => {})`，或前置守卫 `if (route.path === item.route) return;`；`BottomNav` 的 `router-link` 方案（:27-34）是正确的，可作为统一范式。 |
| **I-10** | **移动端二级页出口语义错误（含 1 处真·无出口）**。已核实：**大多数详情页有返回按钮**，但其实现一律是 `router.push({ name: 'chat' })` 而非 `history.back()` ⇒ 永远跳回"对话"页，丢失真实来源（如"设置 → 本地模型 → 返回"落到对话页而非设置页）。**唯一确认无出口的是 `ProfileView.vue`**：全文件无 `useRouter` 引用、无返回按钮，而 `/profile` 的唯一入口 `NavRail.vue:36` 在 ≤640 已被 `App.vue:469` 隐藏 ⇒ 移动端一旦通过深链或历史进入该页即彻底无出口。 | 移动端 | ① 手机从任意非"对话"来源进入详情页后返回；② 深链进入 Profile 页 | 出口存在但语义错误：`src\views\DataBankView.vue:56`、`src\views\ImageGeneratorView.vue:100`、`src\views\LocalModelView.vue:65`、`src\views\StoryEngineView.vue:279`、`src\views\RandomEventsView.vue:218`、`src\views\CharacterVersionView.vue:381`、`src\views\CharactersView.vue:86`、`src\views\ArchivesView.vue:35`、`src\views\WorldBookView.vue:87`、`src\views\GroupChatView.vue:52`（均为 `router.push({name:'chat'})` 类）<br>**无出口**：`src\views\ProfileView.vue`（全文件无 router 引用；`:183-191`、`:275-279`、`:300-312` 三处按钮均为"编辑/取消/保存"，无导航功能）<br>入口证据：`src\components\layout\NavRail.vue:36`（`/profile` 唯一入口）<br>`src\App.vue:40`（`showBottomNav = isMainTab(route.name)`，非主 Tab 页一律不显示底部导航）<br>`src\core\mobile-nav.ts:23-35`（`DETAIL_ROUTES`，实为 11 条，素材漏列 `character-edit` / `character-new`）<br>`src\App.vue:468-469`（≤640 隐藏 NavRail） | **中** | 两步：① 统一改为"`history.length > 1` 则 `router.back()`，否则 `router.push({name:'chat'})`"，保证返回语义正确；② 给 `ProfileView.vue` 补一个 `HeaderBar` 返回钮（并顺手解决"移动端无入口"——建议在主菜单或 BottomNav 的"设置"页内给 /profile 一个可见入口，或明确声明该页桌面专属、移动端重定向走 `router.replace`）。 |
| **I-11** | **触控目标小于 44×44 CSS px**（WCAG 2.5.5 / Apple HIG 44pt）：主输入框旁的**发送类按钮 30×30** 是每天必点的操作；配合 S-4 / I-6 会放大误操作后果。另有通知栏关闭钮 24×24（含继承同一尺寸的变体）。 | 移动端 / 平板 | 手机输入消息后点发送；关闭顶部通知条 | `src\styles\responsive.css:107`（`.composer-btn` `30×30!important`）<br>`src\styles\responsive.css:108`（`.send-btn-primary` `30×30!important`）<br>`src\App.vue:431-442`（`.notice-dismiss` `24×24`）<br>`src\App.vue:377-386`（`.platform-notice .notice-dismiss`，未显式指定尺寸，继承 :432 的 24px）<br>对照已达标：`src\components\mobile\BottomNav.vue:60`（`min-height:52px` ✓）、`src\styles\responsive.css:58-59`（`.nav-item` `height:48px` ✓） | **中** | 移动端（≤640）把 `.composer-btn` / `.send-btn-primary` 提到 **44×44**（视觉图标仍可保持 20–22px，用 padding 撑开点击区）；`.notice-dismiss` 提到 **44×44**；统一引入 `--touch-min: 44px` token，并对"移动端一切可点元素"建立尺寸检查（可用一条简单的 CSS 审计脚本或人工评审清单）。 |
| **I-12** | **遮罩无键盘可达等价关闭方式**：`.overlay-mask` 只有 `@click`，且标了 `aria-hidden="true"`、无 `tabindex` / `role` / Enter-Space 处理 ⇒ 键盘用户无法"点击遮罩关闭"（只能靠 ESC，见 I-3 —— 而 I-3 目前还泄漏到桌面）。 | 桌面端 / 键盘用户 | 键盘用户在抽屉打开状态尝试关闭 | `src\views\ChatView.vue:78-84`（`.overlay-mask`，`:aria-hidden="true"` + 仅 `@click`，无 `role` / `tabindex` / `@keydown`） | **低** | 两种取其一：① 保留 `aria-hidden`，明确遮罩是"纯视觉辅助"，则必须在抽屉本体提供**可聚焦的关闭按钮**（ContextPanel 已有 `ctx-close`，CharacterList 需按 S-5 补齐）且保证 ESC 可用；② 若要遮罩可点，则改为 `<button class="overlay-mask">` 或加 `role="button" tabindex="-1"` + `@keydown.enter/space`。推荐 ①，实现成本低且与现有 inert 焦点管理方案一致。 |
| **I-13** | **平板（641–1024）特有死区**：结合 S-5（无角色列表开关）与 S-6（角色列表仍在文档流），当用户在 ≤640 打开抽屉后再缩放到 641–1024，`ChatView.vue:70` 的 `inert` 会把**仍在文档流、肉眼可见**的角色列表变成不可交互区域 ⇒ "看得见、点不着"。这是 S-5 / S-6 的交互层后果，需作为一条独立可验收的场景。 | **平板（641–1024）** | 先在 ≤640 打开抽屉，再拖拽窗口/旋转设备到 641–1024；或直接在平板 768px 打开上下文面板 | `src\views\ChatView.vue:70`（`:inert="characterStore.panelOpen && isMobile ? true : undefined"`，`isMobile` 为 ≤1024）<br>`src\styles\responsive.css:14-15`（平板 CharacterList 仍在文档流）<br>`src\styles\responsive.css:123`（`.mobile-menu-btn{display:none}` 基线 ⇒ 平板无关闭钮） | **中** | 与 S-6 一并解决（统一抽屉化或统一文档流）。验收用例明确规定：**641–1024 区间，角色列表必须"要么完整可用（可见且可点），要么完全隐藏"，不允许出现"可见但 inert"**。 |
| **I-14** | **`panel-toggle` 自我失效（功能自锁）**：`ChatView.vue:73` 在 `overlayActive && isMobile` 时把**整个 ChatMain** 置 `inert`，而打开上下文面板的按钮 `ChatMain.vue:619-627` 就在 ChatMain 内 ⇒ **打开面板后该按钮自身被 inert，无法用它再点一次关闭**（须改用遮罩或面板内关闭钮；而遮罩又受 S-4 影响）。 | 移动端 / 平板 | 手机上点面板钮打开上下文面板，试图再点同一按钮关闭 | `src\views\ChatView.vue:73`（`:inert="overlayActive && isMobile ? true : undefined"`，作用域为整个 ChatMain）<br>`src\components\chat\ChatMain.vue:619-627`（`.panel-toggle-btn` 位于被 inert 的容器内）<br>`src\stores\character.ts:206`（`togglePanel`） | **中** | 把 `inert` 的粒度从"整个 ChatMain"下沉到"**除抽屉触发按钮之外的主内容区**"（例如在 ChatMain 内用 `<div :inert="...">` 包住消息区与输入区，按钮留在 inert 之外）；或把抽屉触发按钮提升至 `ChatView` 层级。原则是：**触发抽屉的控件永远不能被自己打开的 inert 覆盖**。 |

---

## 5. 流程层问题清单（F-*，共 5 条）

| 编号 | 问题描述 | 受影响端 | 触发场景 | 涉及文件与代码位置 | 严重程度 | 修复建议 |
| --- | --- | --- | --- | --- | --- | --- |
| **F-1** | **三端不同链路复用同一份失败文案**。`api/index.ts` 按「本地 WebLLM（`LocalApiClient`）／Tauri Rust `reqwest` SSE（`TauriOpenAIClient`）／Web `fetch`（`OpenAIClient`）」分出**三条根因完全不同的失败链路**（另有 Anthropic 走独立 AnthropicClient，两端通用），但展示层只吐同一句 `t(...)`。用户无法区分该做的是"等本地模型加载完"／"检查桌面端网路与 Rust 服务"／"处理浏览器 CORS"。**尤其 `cors` 是 Web 端独有失败模态**（Tauri 走 reqwest 早已绕过 CORS），共享文案会让 Web 用户完全得不到这个关键线索。<br>（注：分类基础设施其实**已经具备**——`classifyChatError` 能把错误精确分成 `cors/network/invalid-url/rate-limit/auth/server/aborted/unknown`——只是没有在文案层使用。） | 全端（三种运行时各自受损） | ① 本地模型加载失败；② 桌面端 Tauri 命令失败；③ Web 端 CORS 失败；④ 任意 provider 失败 | 三分支工厂：`src\api\index.ts:39-69`（`:41-43` Local / `:47-52` Anthropic / `:56-62` Tauri / `:64-68` Web）<br>共用文案：`src\stores\chat.ts:454`（`t('char.stoppedGen2')`）、`:456`（`t('char.genFailed3')`）、`:801-807`（`t('chat.persistFailed')`）<br>已具备但未使用的分类：`src\services\chat-manager.ts:367-395`（`classifyChatError`，明确列出 `cors` / `network` / `invalid-url` / `rate-limit` / `auth` / `server`） | **中** | 把 `classifyChatError` 的产出向上透出到 UI：`lastError.type` 已有承载，据此做**分端 + 分因**文案矩阵。最少要满足三条：<br>① `kind === 'cors'`（**仅 Web 可能发生**）→ "浏览器跨域限制，建议使用桌面端或在服务端开启 CORS"；<br>② Tauri 分支失败 → 明确指向"桌面端本地服务/网路"；<br>③ `local` provider 失败 → 明确指向"浏览器内模型加载"。<br>建议在 ApiError 上补 `transport: 'local' \| 'tauri' \| 'fetch' \| 'anthropic'` 字段，由三个 Client 各自打标，文案层按 `transport × kind` 取 key，彻底消灭"一模一样的错误负责解释三种根因"。 |
| **F-2** | **存储适配器序列化语义不对称（Web/移动端专属风险）**。两条链路：`TauriFSAdapter`（本地文件）与 `IndexedDBAdapter`（IndexedDB）。IndexedDB 使用结构化克隆，**无法序列化 Vue 响应式 Proxy 或 `Map`/`Set`/函数**，写入前必须深解包；Tauri 则无此约束。当前 `IndexedDBAdapter` 已在 **10 处调用点手工执行 `JSON.parse(JSON.stringify(...))`**，属于"靠人记住的口头纪律"而非基础设施保证。<br>一旦某条新写入路径漏做，或某个嵌套字段夹带不可序列化对象，Web/移动端会抛 `DataCloneError`，而 `chat.ts:801-807` 的持久化失败处理是**静默吞掉仅写 `lastError`** ⇒ 表现为"用户以为存了，实际没存"的**数据丢失**。 | **Web 端 / 移动端**（桌面端不受影响，正是"两端共用 store 却依赖不同序列化语义"的耦合点） | ① 新增任意 `IndexedDBAdapter` 写入方法；② 数据模型中混入 `Map`/`Set`/类实例；③ 移动端长时间会话后的持久化 | 分支工厂：`src\storage\storage-factory.ts:58-71`（`:61-64` Tauri / `:65-68` Web IndexedDB）<br>手工解包的 10 处：`src\storage\indexeddb-adapter.ts:139-140`、`:159-160`、`:180-181`、`:197-198`、`:221-222`、`:244-245`、`:267-268`、`:311-312`、`:335-337`（其中 `:332` 的注释已明确记录"Vue 响应式 proxy / Map 等对象经 structuredClone 会抛"）<br>静默吞异常的调用侧：`src\stores\chat.ts:801-807` | **中** | 把"解包"从**纪律**变成**基础设施**：在 `IndexedDBAdapter` 内部加一层统一入口（如 `private async write<T>(store, key, value)`），在 `put()` 之前集中做一次规范化（推荐 `structuredClone(toRaw(value))` 或经审议后的 `deepUnref`），业务层的 10 处手工调用全部删除。同时审查 `chat.ts:801-807` 的静默策略：持久化失败必须升级为用户可见的持久性提示 + 重试入口，不应只写 `lastError`。 |
| **F-3** | **手机端不可能成功的"目录选择"流程**。`VectorModelPanel` 明确跑了 `isTauriEnv()` 分支：Tauri 走 `@tauri-apps/plugin-dialog` 系统目录对话框；非 Tauri 退化为 `<input webkitdirectory>`——而 **`webkitdirectory` 在 iOS Safari 与 Android Chrome 上不支持**（Android 部分版本静默忽略，iOS 完全不触发目录选择）⇒ "安装本地向量模型"在手机端是**必然失败却照常展示**的入口，且失败后仍复用同一句 `t('vector.installFailed')`，不给用户任何解释。 | **移动端（iOS / Android）** | 手机进入 设置 → 向量模型 → 安装本地模型 | `src\components\settings\VectorModelPanel.vue:100-132`（`:106-112` Tauri 分支 / `:113-124` Web 降级 `input.webkitdirectory = true`）<br>`src\components\settings\VectorModelPanel.vue:128`（失败文案 `t('vector.installFailed')`，三端共用） | **中** | 从"按端判断"改为"**按能力判断**"：`const canPickDir = isTauriEnv() \|\| 'webkitdirectory' in HTMLInputElement.prototype;`。不支持时**不要隐藏了事，也不要照常展示**——应展示替代路径：① 提供单文件上传（`<input type="file" multiple accept=".onnx,.json">`，移动端可用）；② 或直接推荐"内置模型下载/远程 Embedding"路径，并把入口文案改成"本设备不支持本地目录安装，请使用桌面端"。同理适用于任何依赖 `webkitdirectory` / File System Access API 的功能。 |
| **F-4** | **`active-profile` 字段两端语义不一致**。`storage-factory.ts` 用 localStorage 键 `active-profile` 存活跃 API profile；在 **Web 侧它决定 IndexedDB 库名**，是真实的 profile 隔离机制（`resolveDbName` 会拼后缀）；而 **Tauri 侧代码注释直接承认"单 profile"**，该键在桌面端不产生任何隔离效果。同一个键、同一个 API 在两端具有完全不同的语义强度，是典型的跨端契约不一致。 | 桌面端 vs Web/移动端（语义分叉） | 用户在 profile 切换功能上产生"桌面切了 profile 数据也隔离"的预期 | `src\storage\storage-factory.ts:18-19`（`ACTIVE_PROFILE_KEY = 'ai-roleplay:active-profile'`）<br>`src\storage\storage-factory.ts:24-32`（`getActiveProfileId`，两端同名同值）<br>`src\storage\storage-factory.ts:46-50`（`resolveDbName`，**仅 Web 生效**）<br>`src\storage\storage-factory.ts:61-68`（`:63` 注释承认 Tauri "路径重构未做，当前单 profile"）<br>`src\storage\storage-factory.ts:85-87`（`getStorageEnv()` 已能提供端标识） | **中** | 明确契约，`getStorageAdapter()` 返回能力描述：`{ adapter, multiProfile: boolean }`。Tauri 侧应在 UI 上明确标注"桌面端当前不支持多 profile"（或直接禁用 profile 切换 UI），Web 侧正常启用。不要让同一个 localStorage 键在两端代表不同的东西——建议 Tauri 侧直接不读取该键，避免未来"桌面端以为切了 profile 但实际写同一份数据"的数据混淆事故。 |
| **F-5** | **图片选择无移动端降级（缺相机直拍）**。全仓 3 处图片选择器均为裸 `<input accept="image/*">`，无任何 `capture` 属性（全仓 `capture` 零命中）⇒ 手机端只能"从相册选图"，**无法一键相机拍摄**。对"角色头像 / 用户头像 / 背景图"这类强 UGC 诉求，相册是次优路径。 | 移动端 | 手机设置角色头像、用户头像、聊天背景 | `src\views\CharacterEditorView.vue:771-772`（`type="file" accept="image/*"`）<br>`src\views\SettingsView.vue:1115-1116`（同上）<br>`src\views\SettingsView.vue:1247-1248`（同上）<br>缺失证据：全仓 `capture` 属性零命中 | **低** | 移动端（或始终）提供两个显式选择：「拍照」（`<input accept="image/*" capture="environment">`）与「从相册选择」（不带 `capture`）。注意 iOS 上 `capture` 会直接唤起相机且不允许切相册，因此**必须提供两个入口**而不是给单一 input 加上 capture。改动极小，可搭车任一 UI PR。 |

---

## 6. 手机端操作习惯合规性专评

> 逐项结论：**符合 / 部分符合 / 不符合**，并给出文件:行号依据。

| # | 检查项 | 结论 | 依据 / 说明 |
| --- | --- | --- | --- |
| **①** | **底部 Tab 导航是否有图标 + 文字标签、当前 Tab 是否高亮** | **符合** | `src\components\mobile\BottomNav.vue:16-22` 定义 5 个 Tab，每项含 `icon`（`:35` `<Icon :size="22">`）+ 文字标签（`:36` `.bottom-nav-label`）；`:32` 用 `route.name === tab.name` 判定高亮，`:33` 同步输出 `aria-current="page"`（无障碍合规）；`:60` `min-height:52px` 满足 ≥44×44 触控要求（✓，对照 I-11 中其他控件不达标）；`:50` `padding-bottom: env(safe-area-inset-bottom,0)` 正确处理 iOS Home 条。<br>**唯一扣分项**：5 个 Tab 中有 4 个与桌面 NavRail 不一致的语义——`MAIN_TABS`（`src\core\mobile-nav.ts:10-16`）只暴露 5 个入口，而桌面 NavRail 有 15 项（`NavRail.vue:20-36`），两侧的导航集合不同但存量熵后置，建议在设计文档里显式承认"移动端是桌面端的功能子集"。 |
| **②** | **抽屉是否支持滑动关闭 / 遮罩点击关闭** | **部分符合** | ✅ **有遮罩点击**：`src\views\ChatView.vue:78-84`。✅ **有关闭按钮**：ContextPanel `ContextPanel.vue:135-142`（但 ≤1024 才显）；CharacterList `CharacterList.vue:101-105`（仅 ≤640 才显 ⇒ 平板缺失，见 S-5/I-13）。<br>❌ **无滑动关闭**：全仓 `touchstart/touchmove/touchend` 零命中（唯一命中是 `src\core\sanitize.ts:90` 的安全白名单字符串，非事件绑定）——见 I-8。这是移动端抽屉最主流的关闭手势，缺失属明显习惯违背。<br>❌ **遮罩被底部导航压住**：遮罩 `z-index:40`（`base.css:150`）< BottomNav `z-index:50`（`BottomNav.vue:51`），且 `App.vue:325` 的 BottomNav 在 DOM 中位于 `<main>` 之后 ⇒ 遮罩实际变暗区域不覆盖底部导航，点击该区域不会关闭抽屉——见 S-4。<br>❌ **无滚动锁定**：抽屉打开时 body 仍可滚动，对比 `src\components\common\Modal.vue:86` 已实现。 |
| **③** | **危险操作是否有确认** | **部分符合** | ✅ **会话删除**：`src\components\layout\CharacterList.vue:72-83` 实现了行内二次确认（`askDelete` → `confirmDelete`），不是裸 `confirm()`，移动端友好。<br>✅ **角色删除**：`src\views\CharactersView.vue:129-142` 走删除确认弹窗（`deleteModalOpen`）。<br>❌ **版本管理依赖原生 `confirm()`**：`src\views\CharacterVersionView.vue:140`、`:201`、`:211`、`:350` 使用 `window.confirm()`。在 PWA standalone 模式、部分 WebView、以及被 IME/浮层遮挡的场景下，原生对话框可能被拦截、样式不可控、且在 iOS 上会中断输入法组态。应统一改为 `<ConfirmDialog>` 组件。<br>ℹ️ "过滤/筛选"路径经核实均为非破坏性操作（`CharacterList.vue:65-70` 的 pin/archive 为可逆操作），无破坏性风险。 |
| **④** | **触控目标是否 ≥ 44×44 CSS px** | **不符合** | 至少 **4 处**不达标：<br>· `src\styles\responsive.css:107` `.composer-btn` → 30×30<br>· `src\styles\responsive.css:108` `.send-btn-primary` → 30×30（**发送**是每发一条消息必点的操作，最不应低于标准）<br>· `src\App.vue:431-442` `.notice-dismiss` → 24×24<br>· `src\App.vue:377-386` `.platform-notice .notice-dismiss` → 继承上述 24×24<br>对比已达标项：`BottomNav.vue:60` 52px、`responsive.css:58-59` `.nav-item` 48px ✓。<br>详见 **I-11**。建议一次性引入 `--touch-min: 44px` token 并建立检查机制。 |
| **⑤** | **是否缺下拉刷新、触感反馈、滚动惯性等原生习惯** | **部分符合** | ✅ **滚动穿透已处理**：`src\styles\base.css:79-91` 对 `.modal-overlay / .drawer / .character-list-scroll / .context-panel-scroll / .chat-messages / .settings-body / .nav-rail / .settings-nav / .audit-log-body / .tk-scroll` 共 10 类容器施加 `overscroll-behavior: contain`。<br>✅ **双击缩放延迟已消除**：`base.css:66-76` 对 button/a/input 等施加 `touch-action: manipulation` + `-webkit-tap-highlight-color: transparent`。<br>❌ **无下拉刷新**：全仓未发现任何下拉刷新实现，移动端用户无法手势刷新会话/角色列表（只能靠路由重载）。<br>❌ **无触感反馈（haptics）**：全仓 `navigator.vibrate` / `DeviceMotionEvent` 零命中，Tab 切换、发送成功、删除确认均无振动反馈。<br>❌ **无滑动返回手势**：与 ② 同源，`touchstart/touchmove/touchend` 零命中；详情页返回只能点按钮（见 I-10）。<br>❌ **缺 `-webkit-overflow-scrolling: touch`**：全仓零命中，iOS 上长列表滚动惯性可能不生效（现代 iOS 已默认 momentum，影响有限，建议实测确认后再决定是否需要补写）。 |

**小结**：5 项中 1 项完全符合（①底部 Tab）、3 项部分符合（②③⑤）、1 项不符合（④触控目标）。其中 **④ 与 I-6（IME 回车误发）叠加**是最容易感知的手机端质量短板——建议同批次修复。

---

## 7. 已核查未发现问题的范围（三大层面）

> 用户明确要求列出"查过、且确认没问题"的范围，以免修复时误伤已正确的实现。**以下各行均已逐文件核实。**

### 7.1 样式层 —— 已确认干净

| 项 | 核实结论 | 依据 |
| --- | --- | --- |
| **设计令牌纯净性** | `tokens.css` 与 `themes.css` **只含颜色 / 阴影 / 圆角 / 间距令牌，未写死 px 高度，全文件零 `@media`**，无跨端污染。 | `src\styles\tokens.css`（全文仅 `--shadow-*` / `--radius-*` / `--spacing-*`，`tokens.css:104-123` 的 px 值均为令牌定义本身）<br>`src\styles\themes.css`（`@media` 零命中，`\d+px` 零命中） |
| **视口高度规避（主链路）** | 主布局已做 `100vh → 100dvh` 双写回退（先旧后新），iOS/Chrome 地址栏收缩问题在 `.app-shell` 层面已规避。全仓**仅剩 2 处** `100vh` 残留（已列为 S-8）。 | `src\styles\layout.css:10-11`（`height:100vh; height:100dvh;`）<br>残留：`CharacterEditorView.vue:1627`、`SettingsView.vue:2353` |
| **触屏基础防护** | `touch-action: manipulation`（消除双击缩放 300ms 延迟）与 `-webkit-tap-highlight-color: transparent`（隐藏点击高亮块）已覆盖 button/a/select/input/textarea/[role=button|radio|tab]。 | `src\styles\base.css:66-76` |
| **滚动穿透防护** | 已对 10 类独立滚动容器施加 `overscroll-behavior: contain`，覆盖抽屉主体、消息区、设置体、导航栏等全部已知独立滚动区。 | `src\styles\base.css:79-91` |
| **减少动效偏好** | 全局 `prefers-reduced-motion` 兜底已实现，并在 Toast / Modal / StoryEngine / GroupChat / CommunityMarket / Settings / CharacterEditor / Characters 等处做了显式覆盖，跨端一致（因此 S-7 的缺失 transition 在减少动效模式下不会造成额外问题）。 | `src\styles\base.css:163+`；各组件的显式覆盖： `Toast.vue:206`、`Modal.vue:253`、`StoryEngineView.vue:1945`、`GroupChatView.vue:1556`、`CommunityMarketView.vue:1691`、`SettingsView.vue:3340`、`CharacterEditorView.vue:2004`、`CharactersView.vue:1073`、`MasterPasswordModal.vue:504` |
| **键盘焦点可见性** | 全局 `:focus-visible` 焦点环兜底（含 `[role=button]` 与 `[tabindex]`），未做 `outline:none` 取消，对比度兜底到位。 | `src\styles\base.css:112-125` |
| **业务页断点主体统一** | 全仓 51 条 `@media` 中，绝大多数业务页使用**统一断点 640**，共 20+ 处，说明"640 作为移动端断点"是被广泛遵循的事实标准（野断点仅 8 处，已列 S-10）。 | 统一 640 的代表：`WorldBookEventsPanel.vue:984`、`App.vue:458`、`SettingsModelPanel.vue:1969`、`StoryEngineView.vue:2635`、`SettingsView.vue:3311`、`:3991`、`RandomEventsView.vue:1258`、`ProfileView.vue:684`、`LocalModelView.vue:1165`、`ImageGeneratorView.vue:1098`、`CharacterList.vue:512`、`DataBankView.vue:982`、`CommunityMarketView.vue:1673`、`Toast.vue:213`、`Modal.vue:262`、`CharacterVersionView.vue:1945`、`ArchivesView.vue:774`、`CharacterEditorView.vue:1968`、`:2134`、`FilterTabs.vue:260`、`CharactersView.vue:1079`、`WorldBookView.vue:2545` |
| **抽屉高度写法** | 抽屉/面板均用 `height:100%` 而非 `100vh`，未受地址栏问题影响。 | `src\styles\responsive.css:22`（`height:100%`）、`:78`（`height:100%`）、`:91`（`height:100%`） |
| **桌面端遮罩不干扰** | 桌面 `(min-width:1025px)` 显式隐藏遮罩，桌面端不会出现"常驻遮罩"问题（这也是 I-3 目前只是"意外收面板"而非"页面卡死"的原因）。 | `src\views\ChatView.vue:99-103` |

### 7.2 交互层 —— 已确认干净

| 项 | 核实结论 | 依据 |
| --- | --- | --- |
| **`inert` 用法无桌面泄漏** | 三处 `inert` 判定**全部带 `&& isMobile` 守卫**，桌面不会误伤。（真正的问题是 `isMobile` 的 1024 阈值与 CSS 不符，即 G-5，已单独列为问题。） | `src\views\ChatView.vue:70`、`:73`、`:76`（三处均为 `... && isMobile ? true : undefined`） |
| **抽屉焦点管理（WCAG 2.4.3）** | 抽屉打开/关闭时做了焦点转移与归还，且有 `isMobile` 守卫，不打断桌面操作。 | `src\views\ChatView.vue:21-32`（打开时移入 `#character-drawer` / `#context-drawer`，关闭时回到 `#main-content`；`:23` 有 `if (!isMobile.value) return`） |
| **Modal 焦点管理两端一致** | Modal 的 ESC 关闭、焦点陷阱、滚动锁定、关闭后焦点恢复四件套完整，桌面与移动端行为一致，未见跨端差异。 | `src\components\common\Modal.vue:49`（ESC）、`:55-77`（焦点陷阱）、`:86`（`document.body.style.overflow='hidden'`）、`:100`（焦点恢复） |
| **布局布尔未被持久化（关键正向结论）** | **所有 UI 布局状态均不落盘**，因此任何"端判定错乱"造成的污染都**仅限单次会话内**，不会跨会话、跨端残留。这是本次评审最重要的"坏事变好事"结论。<br>· `persistSettings` 只写 theme / fontSize / apiProfiles / tts / quickReplies，不写任何布局布尔；<br>· `persistCharacter` 只写角色卡本身；<br>· `currentNav`、`panelOpen`、`characterListOpen` 均未进入任何持久化路径。 | `src\stores\settings.ts:743-803`（`persistSettings` 字段白名单）<br>`src\stores\character.ts:161`（`persistCharacter` 仅角色卡）、`:47-49`（三个 ref 均无持久化调用） |
| **BottomNav 重复导航安全** | BottomNav 使用 `router-link` 而非命令式 `push`，重复点击被 Vue Router 内部静默吞掉，不产生未处理 rejection（对比 I-9 的 NavRail）。 | `src\components\mobile\BottomNav.vue:27-34` |
| **移动端详情页有出口（主体）** | 10 个详情页已实现返回功能（虽语义有误，见 I-10），不存在普遍的"roach motel"。 | `DataBankView.vue:56`、`ImageGeneratorView.vue:100`、`LocalModelView.vue:65`、`StoryEngineView.vue:279`、`RandomEventsView.vue:218`、`CharacterVersionView.vue:381`、`CharactersView.vue:86`、`ArchivesView.vue:35`、`WorldBookView.vue:87`、`GroupChatView.vue:52` |
| **危险操作有确认（主体）** | 会话删除与角色删除均已实现非原生 `confirm()` 的二次确认 UI。 | `CharacterList.vue:72-83`、`CharactersView.vue:129-142` |
| **删除/清理类路径均有错误处理** | 全仓 `showToast('error', ...)` 覆盖删除、安装、保存等破坏性操作的失败分支，不存在"失败静默且无提示"的主要路径（唯一例外是 F-2 的持久化失败被吞，已单列）。 | 例如 `VectorModelPanel.vue:246`（`userModel.deleteFailed`）、`:233`、`:205`、`CharactersView.vue:73`（`if (err) showToast('error', err)`）、`CharacterVersionView.vue:211`（删除前确认） |

### 7.3 流程层 —— 已确认干净

| 项 | 核实结论 | 依据 |
| --- | --- | --- |
| **IndexedDB Proxy 解包（当前状态）** | 已在 **10 处**写入点正确执行 `JSON.parse(JSON.stringify(...))` 深解包，当前无活跃缺陷。风险在于"靠人记住"而非"靠基础设施保证"，已作为 F-2 的可用性/可维护性风险列出，而非现有 bug。 | `src\storage\indexeddb-adapter.ts:139`、`:159`、`:180`、`:197`、`:221`、`:244`、`:267`、`:311`、`:335`；`:332` 注释已记录该约束 |
| **三端 API 工厂分支正确** | `createApiClient` 的三分支（Local / Tauri / Web）逻辑正确，且 Anthropic 明确走独立的浏览器 fetch 路径并注明"Web 与 Tauri 环境通用"，是有意识的架构决策，非疏漏。 | `src\api\index.ts:39-69`，尤见 `:45-46` 注释说明 Anthropic 官方支持 CORS 故两端通用 |
| **错误分类基础设施完备** | 尽管展示层未使用（F-1），后端分类能力已具备且粒度足够（`cors`/`network`/`invalid-url`/`rate-limit`/`auth`/`server`/`aborted`/`unknown`），意味着 F-1 是"接线"工作而非"重新设计"工作，排期成本低。 | `src\services\chat-manager.ts:367-395` |
| **文件上传 accept 白名单正确** | 全部 13 处 `type="file"` 均配置了正确的 `accept` 白名单（图片走 `image/*`，角色卡/世界书/配置走 `.json,application/json`，文档走 `.txt,.md,.html,.csv`），未发现缺 accept 导致的"弹出全类型选择器"问题。缺 `capture` 仅影响便捷度（F-5），不影响正确性。 | `CharacterEditorView.vue:772`、`SettingsView.vue:1116`、`:1248`、`CharactersView.vue:304`、`GroupChatView.vue:664`、`VectorModelPanel.vue:505`、`DataBankView.vue:453`、`SettingsView.vue:1849`、`:2009`、`StoryEngineView.vue:1385`、`WorldBookView.vue:798` |
| **移动端图片链路本身可用** | 除缺相机直拍（F-5）外，"从相册选择图片 → 读取 → 校验大小/类型 → 报错"主链路完整，且大图与非图均有明确错误提示。 | `CharacterEditorView.vue:353`（`avatarTooLarge`）、`:358`（`avatarNotImage`）、`:369`（`avatarReadFailed`） |
| **profile 读取有容错** | `getActiveProfileId` 用 try/catch 包裹 localStorage 读取并做正则白名单校验，在 iOS 隐私模式 / localStorage 被禁场景下安全降级到 `default`，不会抛错。 | `src\storage\storage-factory.ts:25-32`、`:35-44` |

---

## 8. 两端解耦改进方案

### 8.1 分层契约（Layered Contract）

核心原则：**越往下越是"能力"，越往上越是"形态"；端判断只允许在一个地方发生。**

| 层 | 职责 | **允许做什么** | **禁止做什么** | 当前违规项 |
| --- | --- | --- | --- | --- |
| **L1 断点/令牌层**<br>`src\styles\tokens-responsive.css`（新建） | 定义唯一的断点集合与 z-index 集合，是全仓唯一允许出现断点数字与层叠数字的文件 | 写 `--bp-*` 与 `--z-*` 定义 | —— | responsive.css 自封标准但无人遵守（G-1） |
| **L2 表现层**<br>`src\styles\responsive.css` 等全局 CSS | 用 L1 的断点做**布局形态切换**；对外只暴露语义化工具类 `.client-mobile-only` / `.client-tablet-only` / `.client-desktop-only` | 用断点数字；定义工具类 | —— | 定义了 `.mobile-menu-btn` 但语义模糊导致 S-5 |
| **L3 组件层**<br>`*.vue` 的 `<style scoped>` 与模板 | 只描述"这个组件长什么样"；需要跨端差异时**用 L2 的工具类**或 `@container` 容器查询 | 使用工具类；容器查询 | ❌ **禁止在 scoped 样式里写 `@media (max-width: N)`**<br>❌ 禁止用 `!important` 跨层打架<br>❌ 禁止同时挂载两套导航靠 CSS 互斥 | `ContextPanel.vue:633`（scoped 甩尾，G-6）<br>`App.vue:340`（无 scoped 全局块，S-9） |
| **L4 视口状态层**<br>`src\core\viewport.ts`（新建）+ `useViewport()` | **全仓唯一**的 JS 端判定来源。导出 `breakpoints` 常量、`isMobile` / `isTablet` / `isDesktop` 响应式 ref、`useViewport()` 组合式函数 | 调用 `matchMedia`；导出响应式端状态 | —— | `NavRail.vue:42`、`ChatView.vue:18` 各自 `matchMedia`（G-4/G-5） |
| **L5 状态层**<br>`src\stores\character.ts` 等 | 存放业务状态；**布尔语义必须单一** | 按语义拆分布尔（桌面 vs 移动抽屉） | ❌ 禁止一个布尔承载两种端语义 | `panelOpen` 双语义（I-1） |
| **L6 业务/流程层**<br>`views/`、`core/`、适配层 | 描述"做什么"；需要差异时用**能力探测**而非端判断 | `'webkitdirectory' in HTMLInputElement.prototype`、`isTauriEnv()` 等能力判断 | ❌ 禁止用 `isMobile` 决定功能可用性<br>❌ 禁止三种后端共用一份错误文案 | `VectorModelPanel.vue:106`（应改能力探测，F-3）<br>`stores/chat.ts:454/805`（共文案，F-1） |

**配套约束（建议写入 CLAUDE.md / 评审清单）：**

1. **断点数字只出现在 L1**。CI 加检查：除 `tokens-responsive.css` 外，任何文件出现 `(max-width:` / `(min-width:` 数字即失败。
2. **`window.matchMedia` 只出现在 L4**。CI 加检查：除 `src/core/viewport.ts` 外出现 `matchMedia` 即失败。
3. **`!important` 配额制**。目标从现有 27 处降到 ≤5 处（仅用于真正无法规避的场景），新增需评审。
4. **端到 &=& 保持 L1 与 L4 数字同步**：`viewport.ts` 导出常量，写一个单元测试断言 CSS 变量值与 TS 常量值一致。

### 8.2 唯一断点常量表（提议）

> 目标：**全仓只剩这 6 个宽度/高度值**。任何第 7 个断点值都必须先修改本节并说明理由。

```css
/* src/styles/tokens-responsive.css —— 全仓唯一断点与层叠来源 */
:root {
  /* ── 宽度断点：三档形态 ── */
  --bp-mobile-max:  640px;   /* ≤640        = 移动：单栏 + 底部 Tab + 抽屉 */
  --bp-tablet-min:  641px;   /* 641–1024    = 平板：次要抽屉化（与 ≤640 同形态） */
  --bp-tablet-max:  1024px;  /* ≤1024       = 「非桌面」总边界 = JS isMobile 边界 */
  --bp-desktop-min: 1025px;  /* ≥1025       = 桌面：三栏 */
  --bp-narrow-max:  380px;   /* ≤380        = 极窄屏：仅内容密度压缩（保留 responsive.css:116） */

  /* ── 复合断点：仅允许用于「高度压缩」场景，不允许用于形态切换 ── */
  --bp-landscape-h: 480px;   /* max-height 横屏阈值（保留 responsive.css:126） */
  --bp-landscape-w: 900px;   /* max-width  横屏阈值 */

  /* ── 层叠层级：唯一 z-index 来源（修复 S-4） ── */
  --z-base:         0;
  --z-content:      1;    /* 消息浮标等容器内层级 */
  --z-mobile-nav:   45;   /* 底部导航：低于遮罩 */
  --z-overlay-mask: 55;   /* 遮罩：必须 > 底部导航、< 抽屉 */
  --z-drawer:       60;   /* 抽屉：移动端最高交互层 */
  --z-modal:       100;   /* Modal（现值，保持不变） */
  --z-toast:       200;   /* Toast（现值，保持不变） */
  --z-top:        9999;   /* Skip link / 拖拽遮罩（现值，保持不变） */
}
```

**迁移映射（当前 → 目标）**

| 当前写法 | 位置 | 目标 |
| --- | --- | --- |
| `@media (max-width:640px)` × 20+ 处 | 各业务页 | 保留数值，但统一引用 `--bp-mobile-max`（或经 postcss-custom-media 的 `@custom-media --mobile`） |
| `@media (min-width:641px) and (max-width:1024px)` | `responsive.css:14` | `--bp-tablet-min` / `--bp-tablet-max` |
| `@media (min-width:1025px)` | `responsive.css:7`、`ChatView.vue:99` | `--bp-desktop-min` |
| `@media (max-width:1024px)` | `ContextPanel.vue:633` | **删除**（改用 S-5 的工具类，消除 scoped 甩尾） |
| `matchMedia('(max-width: 640px)')` | `NavRail.vue:42` | `useViewport().isMobile` |
| `matchMedia('(max-width: 1024px)')` | `ChatView.vue:18` | `useViewport().isCompact`（≤1024，与 CSS 的"非桌面"对齐，命名带 `compact` 避免与 `--bp-mobile-max` 混淆） |
| `max-width:1100 / 900 / 1023 / 600 / 567 / 539` × 6 处 | 见 S-10 | 按容器查询/无断点写法重构，数值消灭 |
| `z-index: 40 / 50 / 50 / 30` | `base.css:150`、`BottomNav.vue:51`、`responsive.css:23/79/93`、`responsive.css:56` | `--z-overlay-mask` / `--z-drawer` / `--z-mobile-nav`（`.nav-rail` 的 30 随 S-1 删除） |

> ⚠️ **重要前提**：`.app-main`（`layout.css:17-24`）与 `.chat-shell`（`ChatView.vue:90-96`）当前**不创建 stacking context**，所以 `--z-*` 是一个全局扁平的层级表。如果后续给这两者加了 `position + z-index` 或 `isolation`，**必须重新校准本表**——建议在第 8.2 节加注释说明这一依赖。

### 8.3 端隔离改造路径（分 5 个相位，建议按序推进）

| 相位 | 目标 | 具体动作 | 对应问题 | 预估工作量 | 风险 |
| --- | --- | --- | --- | --- | --- |
| **A. 独立止血** | 只改"用户今天能感觉到"的 2 高 + 3 中，**不碰结构** | ① `ChatMain.vue:349-354` 加 `isComposing` 守卫；② 引入 `--z-*` token 并替换 5 处 z-index；③ `ChatView.vue:41` 加 `&& isMobile.value`；④ 把 `ChatMain` 的 `inert` 下沉到内容区、保留 toggle 按钮；⑤ 发送/通知按钮提到 44×44 | **I-6、S-4、I-3、I-14、I-11** | 小（约 1–2 人日） | 低。均为局部改动，可独立回滚 |
| **B. 清理死规则** | 删除已失效的双导航方案，砍掉 `!important` 存量 | ① 删 `responsive.css:42-70`（`.nav-rail` 底部化）与 `:126-129`（横屏旧规则）；② NavRail 由 CSS 隐藏改为 `v-if="!isMobile"` 真卸载（顺手解决 I-4）；③ 确立 `main.ts` 中的显式样式引入顺序并把 `App.vue:340` 全局样式块迁出 | **S-1、S-2（部分）、S-9、I-4** | 中（约 2–3 人日） | 中。触及全局样式，**必须在 ≤640 / 641–1024 / ≥1025 三个宽度做视觉回归**；建议先加视觉快照测试再动 |
| **C. 收口断点（核心）** | 建立 L1/L4 唯一来源 | ① 新建 `tokens-responsive.css` 与 `core/viewport.ts` + `useViewport()`；② 替换 NavRail / ChatView 两处 `matchMedia`；③ 删除 `ContextPanel.vue:633` 的 scoped 甩尾；④ 引入 `.client-{mobile,tablet,desktop}-only` 工具类，替换 4 个抽屉开关按钮的端判断；⑤ 加 CI 守卫（禁止断点数字 / `matchMedia` 出现在规定位置外） | **G-4、G-5、G-6、S-5、S-10** | 中（约 3–5 人日） | 中。属全仓重构面，建议一次 PR 完成并冻结断点增删 1 个迭代 |
| **D. 状态语义拆分** | 消灭"一个布尔两种端语义" | ① `character.ts` 拆 `panelExpanded` / `contextDrawerOpen` / `characterDrawerOpen`；② `overlayActive` 改为后两者之和；③ `ChatView.vue` 的 watch 补 `else` 分支；④ 平板 641–1024 形态二选一并固定（推荐"统一抽屉化"） | **I-1、I-2、S-6、I-13、S-6 的 I-13 后果** | 中（约 2–3 人日） | 中。布尔改名涉及多个读取点，需同步更新 `ContextPanel.vue:129`、`CharacterList.vue:87`、`ChatMain.vue:623` |
| **E. 能力层去端化** | 从"按端判断"升级到"按能力判断" | ① `VectorModelPanel` 改为能力探测 + 提供移动端替代路径；② 三端错误文案矩阵（复用已有的 `classifyChatError`）；③ `IndexedDBAdapter` 序列化规范化下沉到基础设施层；④ 图片选择双入口（拍照/相册）；⑤ `getStorageAdapter` 返回 `multiProfile` 能力位 | **F-1、F-2、F-3、F-4、F-5** | 中–大（约 5–8 人日，含文案与 i18n） | 低（多为增量与外部可见的文案/交互），可拆多个独立 PR |

---

## 9. 修复优先级路线图

**排期规则**：`P0 = 高严重度` 或 `中严重度 + 单行/小改动可解决`；`P1 = 需要成批次重构的结构性问题`；`P2 = 打磨项与低频路径`。

> **主理人裁定：关于两套 P0 口径的说明（排期前必读）**
>
> 本次评审过程中出现过**两套 P0 清单**，二者不矛盾，但**口径不同**，请勿混用：
>
> | 来源 | 口径 | P0 内容 |
> | --- | --- | --- |
> | 质量审查官（严重度视角） | 按「是否阻断使用」 | **3 条**：IME 回车误发送、触摸目标 <44px、**断点三真源（640 vs 1024 错配）** |
> | 本报告交付视图（排期视角） | 按「本迭代能否落地（1–2 人日）」 | **5 条**：IME 回车误发送、`z-index` 秩序（S-4）、ESC 泄漏桌面（I-3）、`inert` 作用域下沉（I-14）、触摸目标（I-11） |
>
> **分歧点只有一个**：「断点三真源」在严重度上是根因、必须优先治理；但它涉及 `@layer` 引入、断点常量抽取、`useBreakpoint()` 替换多消费方，属**跨层结构性重构**，无法在 P0 的 1–2 人日内完成。
>
> **统一排期建议**：
> 1. 本迭代先吃下交付视图的 5 条 P0 —— 它们都是**低风险小改动**，可立即止损渲染/交互层的可见缺陷；
> 2. 「断点三真源」作为 **P1 的最高优先级根因项**单独立项（见 P1-A / P1-B），且应在上述 5 条之后紧接启动；
> 3. 注意 **I-14（inert 下沉）与断点三真源同源**，若已决定立即启动 P1-B，I-14 可合并进 P1-B 一次性重构，避免二次返工。

### P0 —— 建议本迭代完成（累计约 1–2 人日）

| 序 | 编号 | 一句话任务 | 严重度 | 验收标准 |
| --- | --- | --- | --- | --- |
| 1 | **I-6** | `ChatMain.vue:349-354` 加 `isComposing` / `keyCode!==229` 守卫 | 高 | 中文拼音、日文假名、韩文 IME 组词中途按回车**不发送**；组词完成后按回车正常发送；物理键盘 Shift+Enter 仍换行 |
| 2 | **S-4** | 引入 `--z-*` token 并替换 5 处 z-index，抽屉 > 遮罩 > 底部导航 | 高 | 手机打开抽屉时：底部导航**被遮罩变暗且点击拦截**（点了会关抽屉而不是跳转页面）；抽屉底部按钮可正常点击；Modal(100) 与 Toast(200) 层级不变 |
| 3 | **I-3** | `ChatView.vue:41` 的 ESC 分支加 `&& isMobile.value` | 中 | 桌面宽度下按 ESC **不再**收起上下文面板；≤1024 下按 ESC 仍能关闭抽屉 |
| 4 | **I-14** | `ChatView.vue:73` 的 `inert` 作用域下沉，放过 `panel-toggle-btn` | 中 | 手机/平板打开上下文面板后，仍可点同一个按钮第二次关闭 |
| 5 | **I-11** | `.composer-btn` / `.send-btn-primary` / `.notice-dismiss` 提到 ≥44×44（引入 `--touch-min`） | 中 | ≤640 下所有可点元素实测点击区 ≥44×44 CSS px |

### P1 —— 下一迭代：两个成批次的结构性重构（累计约 8–12 人日）

**批次 P1-A：样式契约收口（对应 Phase B + C）**

| 编号 | 任务要点 |
| --- | --- |
| **S-1** | 删除 `responsive.css:42-70` 旧导航方案；NavRail 改 `v-if` 真卸载 |
| **S-2** | 引入 `--mobile-nav-h` token，四处高度口径归一 |
| **S-3** | `.app-main` 的 padding-bottom 合并为 2 条，`env()` 补 `0px` 兜底 |
| **S-9** | `App.vue:340` 全局样式迁出、`main.ts` 固化样式引入顺序 |
| **S-10** | 8 处野断点按 S-10 建议的四类合法意图重构；新增断点数量 CI 守卫 |
| **I-4** | 随 S-1 的 NavRail 真卸载一并解决高亮错位 |

**批次 P1-B：平板形态 + 状态语义收口（对应 Phase D）**

| 编号 | 任务要点 |
| --- | --- |
| **S-5** | 引入 `.client-{mobile,tablet,desktop}-only` 工具类，统一 4 个抽屉开关按钮的断点 |
| **S-6** | 平板 641–1024 的 CharacterList 形态二选一并固定（推荐统一抽屉化，合并 `:14-15` 与 `:73-83`） |
| **I-1** | `character.ts` 拆分 `panelExpanded` / `contextDrawerOpen` / `characterDrawerOpen` |
| **I-2** | `ChatView.vue:56-59` 的 watch 补 `else` 分支 |
| **I-13** | 验收：641–1024 区间角色列表"可见即可用"，消灭 inert 死区（与 S-6 同一 PR） |
| **I-5** | hover 规则包进 `@media (hover:hover) and (pointer:fine)`，并为"hover 才显形"的交互补 `@media (hover:none)` 常显 fallback |
| **I-8** | 抽屉打开时复用 `useScrollLock()`（与 `Modal.vue:86` 同源）；补 `touchmove` 横向滑动关闭 |
| **I-10** | ① `goBack` 改为优先 `router.back()`；② `ProfileView.vue` 补返回按钮（并处理其移动端无入口问题） |
| **F-1** | 用已有的 `classifyChatError` 产出，做 `transport × kind` 的错误文案矩阵（至少区分 `cors` / Tauri / local 三类） |
| **F-2** | `IndexedDBAdapter` 的 JSON 解包下沉到统一写入入口；审查 `chat.ts:801-807` 的持久化失败静默策略 |
| **F-3** | `VectorModelPanel` 改为能力探测，移动端提供替代路径或直接说明不可用 |

### P2 —— 打磨窗口择机处理（累计约 2–3 人日）

| 编号 | 任务要点 | 备注 |
| --- | --- | --- |
| **S-7** | 合并两档抽屉规则，`transition` 只写一次 | 可与 S-6 搭车，几乎零成本 |
| **S-8** | 2 处 `100vh` 改 `100vh → 100dvh` 双写回退 | 建议同时加入 lint 禁止新增裸 `100vh` |
| **I-9** | `NavRail.vue:47` 的 `router.push` 加 `.catch(()=>{})` 或前置去重守卫 | 仅桌面 console 噪音 |
| **I-12** | 遮罩明确采用"纯视觉 + 抽屉内可聚焦关闭钮"方案 | 与 I-8 同 PR 处理最优 |
| **F-4** | `getStorageAdapter()` 返回 `multiProfile` 能力位；Tauri 侧 UI 明确标注单 profile | 建议与 F-2 的存储层改造搭车 |
| **F-5** | 3 处图片选择器提供「拍照」+「相册」双入口 | 改动极小，可搭车任一 UI PR |

### 9.4 建议的回归验收矩阵

不论哪个相位，每次涉及跨端改动都必须跑这 **3 个宽度 × 3 个运行时**：

| 宽度 | 桌面（Tauri） | Web 桌面浏览器 | 移动 / PWA |
| --- | --- | --- | --- |
| ≤ 380px（极小屏） | — | ✓ | ✓ |
| 381 – 640px（移动） | — | ✓ | ✓（重点） |
| **641 – 1024px（平板）** | — | ✓ | ✓（重点，iPad 竖屏 768px） |
| ≥ 1025px（桌面） | ✓（重点） | ✓（重点） | — |

每次必验 4 条用例：① 抽屉开关（含"抽屉打开状态下 resize 跨断点"，验 S-5/S-6/I-13）；② 按 ESC；③ 窗口从桌面缩到移动再放大回来（验 I-2）；④ 中文 IME 回车（验 I-6）。

---

## 10. 修复执行记录（自主执行 / goal 模式）

> 执行时间：2026-09-16 起，按第 9 节路线图逐条修复；每 2 条跑 `npm run test` 验证；每条修复后于本节留痕。
> 状态图例：⬜ 待修 · 🔧 实施中 · ✅ 已修复并验证。

### 10.1 逐条记录

<!-- fixlog -->
- ✅ **I-6**（P0-1，2026-09-16）：`src/components/chat/ChatMain.vue:349` `handleKeydown` 增加 `e.isComposing || e.keyCode === 229` 守卫，IME（中文拼音/日文假名/韩文）组词中途回车不发送，组词完成或 Shift+Enter 正常。
- ✅ **I-3**（P0-3，2026-09-16）：`src/views/ChatView.vue:41` ESC 关闭抽屉分支增加 `&& isMobile.value`，桌面宽度（≥1025px）下按 ESC 不再误收起上下文面板；≤1024 仍生效。
- ✅ **S-4**（P0-2，2026-09-16）：`src/styles/tokens.css` 新增 `--z-*` 层级令牌（`--z-nav-rail:30` / `--z-bottom-nav:40` / `--z-overlay-mask:60` / `--z-drawer:70` / `--z-modal:100` / `--z-toast:200` / `--z-notice:9999`）；`responsive.css`（`.context-panel` 平板+移动两处、`.character-list`、`.nav-rail`）、`base.css`（`.overlay-mask`）、`BottomNav.vue`（`.bottom-nav`）、`Modal.vue`、`Toast.vue` 全部改用语义 token。语序修正为 **抽屉(70) > 遮罩(60) > 底部导航(40)**，手机打开抽屉时底部导航被遮罩变暗且点击被拦截，抽屉内按钮正常可点；Modal(100)/Toast(200) 层级不变。
- ✅ **I-14**（P0-4，2026-09-16）：`src/components/chat/ChatMain.vue` 显式 `defineProps<{ inert?: boolean }>()` 承接 ChatView 传入的 `inert`，仅绑定到 `.chat-messages`（内容区）与 `.chat-footer`（输入区），顶栏 `panel-toggle-btn` 保持非 inert。手机/平板打开上下文面板后仍可二次点击同一按钮关闭，消除面板自我失效。
- ✅ **I-11**（P0-5，2026-09-16）：`src/styles/tokens.css` 新增 `--touch-min:44px`；`responsive.css:107-108` 的 `.composer-btn` / `.send-btn-primary` 由 30px 提到 `var(--touch-min)`；`App.vue:433-434` 的 `.notice-dismiss` 由 24px 提到 `var(--touch-min)`。≤640 下可点元素点击区 ≥44×44 CSS px。
- ✅ **S-1**（P1A-1，2026-09-16）：`responsive.css` 删除移动端 `.nav-rail` 底部化死规则（与 BottomNav 并存的旧双导航方案）+ 横屏 `.nav-rail` 旧规则（保留 `.chat-main` 横屏留白兜底）；`App.vue` 将 `<NavRail>` 改为 `v-if="!isMobile"` 真卸载（`isMobile = matchMedia('(max-width:640px)')`），桌面/平板显示 NavRail、移动端由 BottomNav 承载。顺带解决 I-4。
- ✅ **I-4**（P1A-6，2026-09-16）：随 S-1 的 NavRail 真卸载一并解决——移动端不再渲染 NavRail，高亮仅由 BottomNav 承担，消除 NavRail/BottomNav 双高亮错位。
- ✅ **S-2**（P1A-2，2026-09-16）：`tokens.css` 新增 `--mobile-nav-h:56px` 作为底部导航高度唯一来源；`.app-main.has-mobile-nav` 留白改用 `calc(var(--mobile-nav-h) + env(safe-area-inset-bottom,0px))`，归一此前 64/56/52px 多套口径。
- ✅ **S-3**（P1A-3，2026-09-16）：删除 `responsive.css` 中 `.app-main { padding-bottom:64px }` 第三套冲突口径，移动端 `.app-main` 底部留白统一为 App.vue ≤640 媒体查询内的两条规则（基础 `env(...,0px)` + `.has-mobile-nav` 叠加 `--mobile-nav-h`），并补全 `env()` 的 `0px` 兜底。
- ✅ **S-9**（P1A-4，2026-09-16）：`App.vue` 全局 `<style>` 块（skip-link / platform-notice / offline-notice / drag-overlay / notice-dismiss 等约 150 行）整体迁出至新建 `src/styles/app-global.css`；`main.ts` 在 `responsive.css` 之后显式 `import './styles/app-global.css'`，固化层叠顺序，不再依赖 Vite 对单文件组件 `<style>` 注入顺序“取胜”（修复 S-9 的加载顺序耦合）。
- ✅ **S-10**（P1A-5，2026-09-16）：建立断点唯一来源。**L1** `src/styles/tokens-responsive.css`（6 个规范断点 + z-index 集合）、**L4** `src/core/viewport.ts`（`useViewport()` 导出 `isMobile/isTablet/isCompact/isDesktop` 响应式 ref + `breakpoints` 常量）。① 三处 `window.matchMedia` 脏判断收敛为 `useViewport()`：`NavRail.vue:42`（→`isMobile`）、`ChatView.vue:18`（1024 语义 →`isCompact`）、`App.vue:46`（→`isMobile`），消除「1024(TS) 与 640(CSS)」双真源（G-4/G-5）；② 7 处野断点 `@media` 归一为规范边界：CharacterEditorView `1023→1024`、GroupChatView `900→1024`、WorldBookView:2532 `1100→1024`、WorldBookView:2650 `600→640`、StoryEngineView `600→640`、NewConversationModal `539→640`、TemplateEditorModal `567→640`（LocalModelView:1104 的 `max-width:600px` 为表单静态宽度上限、非响应式断点，保留）；③ 新增 `scripts/breakpoint-guard.mjs`（CI 守卫）：除 `tokens-responsive.css` 外禁止非规范断点数字 {380,480,640,641,900,1024,1025}、除 `viewport.ts` 外禁止 `matchMedia(`、断言 L1/L4 数值同步；已接入 `npm run check:breakpoints` 与 CI `quality-gates` 步骤。
- ✅ **S-5**（P1B-1，2026-09-16）：抽屉开关按钮断点不对称修复。建立 4 个语义化工具类 `.client-mobile-only / .client-tablet-only / .client-desktop-only / .client-compact-only`（`responsive.css:93-111`：默认 `display:none`，各形态 `@media` 下 `display:inline-flex`；640/641/1024/1025 均为规范断点，守卫放行）。将 3 处 `.mobile-menu-btn` 抽屉开关按钮统一收敛到 `≤1024` 显隐：**ChatMain.vue:572**（打开角色列表 hamburger）与 **CharacterList.vue:103**（关闭角色列表）已于前序加 `client-compact-only`；本项补 **ContextPanel.vue:137**（关闭上下文面板 `ctx-close`）。拆除冲突显隐：`responsive.css` 删除 ≤640 块内 `.mobile-menu-btn{display:inline-flex!important}` 与全局 `/* 桌面隐藏移动菜单按钮 */ .mobile-menu-btn{display:none}`；`ContextPanel.vue` 删除 scoped 甩尾 `@media (max-width:1024px){.mobile-menu-btn{display:inline-flex}}`（原 G-6 问题）与 base `.mobile-menu-btn{display:none}`；`ChatMain.vue:928` base `.mobile-menu-btn` 去掉 `display:flex`（默认隐藏改由工具类控制，仅保留 32×32 尺寸/圆角/居中）。**范围外**：ChatMain.vue:618/627 的 `panel-toggle-btn`（导出 / 切换上下文面板）为顶栏常驻动作钮，桌面端也需可用，不纳入 S-5。
- ✅ **S-6**（P1B-2，2026-09-16）：平板（641–1024）CharacterList 统一抽屉化，与移动端（≤640）形态一致。原平板 `.character-list` 仅 `width:240px` 覆盖（docked 侧栏常驻），但 `characterDrawerOpen` 仍触发 ChatView 的遮罩/inert 抽屉机制，导致「docked 常驻 + 遮罩死区」打架。改为在 `responsive.css:14-29` 平板块将 `.character-list` 重写为 `position:fixed; transform:translateX(-100%)` 抽屉（`.active` 滑入），桌面（>1024）仍由 `layout.css` 控制为 docked 四栏。顺带修移动端抽屉硬编码 `z-index:50` → `var(--z-drawer)`（原 50 < 遮罩 60，抽屉被压在遮罩下、可见不可点——正是 S-4 未闭环项，也是 I-13 的 inert 死区根因），使移动/平板抽屉层级统一为 抽屉(70) > 遮罩(60)。**I-13（P1B-5）随本项闭合**：平板 641–1024 角色列表现为抽屉，关闭钮 `client-compact-only`（≤1024）可见且可用，无 inert 死区。
- ✅ **I-1**（P1B-3，2026-09-16）：`character.ts` 拆分单布尔 `panelOpen`（桌面「展开」/移动「抽屉开」双语义）为三个语义清晰状态：`panelExpanded`（桌面上下文面板展开，默认 true）、`contextDrawerOpen`（移动/平板上下文抽屉开）、`characterDrawerOpen`（角色列表抽屉，重命名自 `characterListOpen`）。`togglePanel()` 经 `import { isCompact } from '@/core/viewport'`（模块级 ref，规避 Pinia 内 `onMounted` 报错与 breakpoint-guard 对 `matchMedia(` 的限制）按视口翻转对应状态；`closeAllDrawers()` 仅清两个抽屉态、保留桌面 `panelExpanded`（桌面路径本不调用）。消费者同步：`ChatView.vue` 的 `overlayActive`/焦点目标/inert 绑定、`ContextPanel.vue` 的 `:class="{active:contextDrawerOpen, collapsed:!panelExpanded}"`（桌面 `collapsed` 类此前为死规则，本项使其生效，桌面面板可收起）、`CharacterList.vue` 的 `active`、`ChatMain.vue` 的 `aria-expanded`（随 `isCompact` 反映 `panelExpanded`/`contextDrawerOpen`）。`character.test.ts` 三个用例同步改名/改语义。typecheck 0 错误、`npm run test` 2689 passed。
- ✅ **I-2**（P1B-4，2026-09-16）：`ChatView.vue` 视口切换 watch 补 `else` 分支。原仅 `if (mobile) characterStore.closeAllDrawers()`，回到桌面时 `panelExpanded` 可能停留在收起态（经 I-1 拆分后桌面面板由 `panelExpanded` 控制）。补全 `else { characterStore.panelExpanded = true }`，桌面展开上下文面板，避免从移动端返回后面板卡在收起/inert 态。
- ✅ **I-5**（P1B-6，2026-09-16）：触屏 hover 可达性（消除「hover 才显形」在触屏不可见）。`MessageBubble.vue` 的 `.msg-toolbar` 此前已含 `:focus-within` + `@media (hover:none)` 常显（无需改）；本项补齐另外两处遗漏：① `ImageGeneratorView.vue` 的 `.gallery-overlay`（下载/查看等操作遮罩）将 hover 显形规则包进 `@media (hover:hover) and (pointer:fine)`，并加 `@media (hover:none)` 常显；② `SettingsView.vue` 的 `.settings-nav-item-desc`（设置项说明）加 `@media (hover:none)` 常显（原仅 `:hover`/`:focus-visible` 显形，触屏 tap 不触发 focus-visible 会隐藏）。`CharacterEditorView:1770`/`.attr-switch input` 与 `DataBankView:931`/`.hidden-file-input` 为视觉隐藏的开关/文件输入（始终可点），非 hover 显形，不在范围内。
- ✅ **I-8**（P1B-7，2026-09-17）：抽屉滚动锁定 + 触屏横滑关闭。① 新建 `src/composables/useScrollLock.ts`（计数器式 `lockCount`，兼容 Modal 与抽屉同时锁 body、互不误释放；SSR 守卫 `typeof document`）；`ChatView.vue:18` 引入并对 `overlayActive`（任一抽屉开）调用 `useScrollLock(overlayActive)`，打开抽屉时 `document.body.style.overflow='hidden'`，关闭释放。② `CharacterList.vue`（左抽屉）与 `ContextPanel.vue`（右抽屉）各新增 `on*TouchStart/Move/End`：记录起点、判定主方向为横向（|dx|>|dy| 且 >12px）、松手时 `dx>60`（右抽屉则 `dx<-60`）调用 `characterStore.closeAllDrawers()` 关闭；处理函数已绑定到两组件的 `<aside>`（`@touchstart/@touchmove/@touchend`）。**I-12（P2-4）随本项闭合**：`ChatView.vue` 遮罩 `.overlay-mask` 由 `aria-hidden="true"` 纯视觉改为 `role="button" tabindex="0" :aria-label="t('chat.closeSidebar')"` + `@keydown.enter/.space` 关闭（ESC 已由 I-3 的 `handleKeydown` 兜底）；非激活态 `.overlay-mask` 为 `visibility:hidden`（不可聚焦，无键盘陷阱），激活态可聚焦等价关闭。新增 i18n 键 `chat.closeSidebar`（zh「关闭侧边栏」/en「Close sidebar」）。
- ✅ **I-10**（P1B-8，2026-09-17）：返回语义修正 + ProfileView 补出口。① 11 个详情页 `goBack()`（WorldBook/StoryEngine/RandomEvents/LocalModel/ImageGenerator/GroupChat/DataBank/CommunityMarket/CharacterVersion/Characters/Archives）统一改为「优先 `router.back()`、无历史回退 `router.push({name:'chat'})`（CommunityMarket 为 `/chat`）」：`if (window.history.state?.back) router.back(); else router.push(...)`——尊重浏览器/系统返回栈，修复「语义错（一律 push 到 chat）」。② `ProfileView.vue` 此前无返回钮、移动端无出口（roach motel）：补 `useRouter` + `goBack`（同源改法）+ 头部「返回」按钮（`.profile-back-btn`，`arrow-left` 图标 + `profile.back`/`profile.backAria` 文案，新增 zh/en 键），桌面/移动端通用。
- ✅ **F-1**（P1B-9，2026-09-17）：聊天失败文案矩阵（transport × kind）。新建 `src/services/chat-error.ts`：复用既有 `classifyChatError` 产出 + 传输层推断（`isTauriEnv()` → tauri；web-llm/onnx 标记 → local；否则 browser），输出 i18n 键矩阵，至少区分 **cors / Tauri / local** 三类：`chat.errCors` / `chat.errTauriApi`(带 HTTP 状态) / `chat.errTauriNet` / `chat.errLocal` / `chat.errApi`(带状态) / `chat.errNet` / `chat.errUnknown`(兜底裸消息)，aborted 仍走 `char.stoppedGen2`。`stores/chat.ts` 两处 `onError`（:456/:725）的 `t('char.genFailed3', {error})` 改为 `chatErrorI18n(err)` 渲染，三端不再共用同一句裸消息；新增 `tests/services/chat-error.test.ts` 覆盖矩阵（7 例）。`char.genFailed3` 键保留不删（无其它引用）。
- ✅ **F-2**（P1B-10，2026-09-17）：IndexedDB 序列化下沉 + 持久化失败策略审查。① `src/storage/indexeddb-adapter.ts` 新增私有 `serialize<T>()`（`JSON.parse(JSON.stringify(value))` 统一入口），原散落 9 处的逐点解包（saveCharacter/saveChat/saveSettings/saveLorebook/saveGroupChat/savePersona/saveDocument/saveStory/saveSnapshot）全部改为 `this.serialize(...)`，消除「靠人记住逐点解包」的维护风险（原 10 处含注释一致）。② `stores/chat.ts:801-807` 审查结论：持久化失败保留「非阻塞 + 记录 `lastError`（由全局错误横幅呈现，非静默吞掉）」策略，不在此抛错阻断 UI；补注释说明。
- ✅ **F-3**（P1B-11，2026-09-17）：VectorModelPanel 改为能力探测（非 isMobile/环境假设）。新增 `canPickDirectory = 'webkitdirectory' in HTMLInputElement.prototype` 真实能力探测；`pickAndInstall` 由「Tauri / 否则 webkitdirectory」改为「Tauri / 能力具备则 webkitdirectory / 否则给出替代路径提示（toast + 安装框内 hint 指向 zip 上传）」，不再因移动端无 webkitdirectory 静默失败；安装按钮按 `isTauriEnv() || canPickDirectory` 显隐，缺失能力时显示 `vector.dirPickHint`。新增 i18n 键 `vector.dirPickUnsupported`/`vector.dirPickHint`（zh/en）。符合 L6「禁止用 isMobile 决定功能可用性，改用能力探测」。
- ✅ **S-7**（P2-1，2026-09-17）：抽屉 transition 合并只写一次。`src/styles/responsive.css` 合并原平板(641–1024)与移动(≤640)两档抽屉规则为单一 `@media (max-width:1024px)` 块，`transition: transform .3s cubic-bezier(.2,.8,.2,1)` 只写一次；补移动端 `.context-panel` 漏写的 transition（原仅平板块有、移动块缺失导致抽屉滑动无动画），移动块仅保留移动专属规则、删除与平板块重复的抽屉 transform 规则。
- ✅ **S-8**（P2-2，2026-09-17）：100vh→100dvh 双写 + CI 守卫。移动端动态视口工具条导致 100vh 计算高度闪烁/遮挡，统一改用 100dvh 双写兜底：`layout.css:10-11`（已是 `100vh;100dvh` 双写）、`SettingsView.vue:2354`（`max-height: calc(100dvh - 32px)`，原仅 100vh）、`CharacterEditorView.vue:1628`（`max-height: calc(100dvh - 120px)`）。新增 `scripts/css-viewport-guard.mjs`（遍历 src 下 css/vue/scss，禁止「裸 100vh」——其后未紧邻 100dvh 行即报错），接入 `npm run check:viewport`。typecheck 0 / lint 0 / i18n:strict 通过 / `npm run test` 2696 passed。
- ✅ **I-9**（P2-3，2026-09-17）：NavRail 重复导航未捕获。原 `src/components/layout/NavRail.vue:49` 桌面端点击当前所在项会 `router.push` 到同一路由触发 `NavigationDuplicated`，且 `void` 不能吞掉 reject → 未处理 Promise rejection。改为 `router.push(item.route).catch(() => {})`（BottomNav 用 router-link 已静默吞掉，无此问题）。仅消除桌面 console 噪音，无功能变化。
- ✅ **F-4**（P2-5，2026-09-17）：`active-profile` 两端语义不一致（跨端契约）。`src/storage/storage-factory.ts` 新增 `StorageCapability` 接口 + `getStorageCapability(): { adapter, multiProfile }`：Web(IndexedDB 按库名隔离)=true，Tauri(单 profile)=false；`getStorageAdapter()` 保留返回 StorageAdapter 以兼容既有 9 处调用方。`src/views/SettingsView.vue` 资料档案区据此渲染：`storageMultiProfile === false` 时显示橙色提示 `settingsView.profileSingleNotice`（「桌面端为单档案模式：切换档案不会隔离数据」），并禁用「创建并切换」「切回默认档案」按钮（避免桌面端误以为切了 profile 实际写同一份数据的混淆）。新增 i18n 键 `settingsView.profileSingleNotice`（zh/en）；`src/storage/index.ts` 补导出 `getStorageCapability`。
- ✅ **F-5**（P2-6，2026-09-17）：图片选择缺相机直拍（移动端降级）。3 处图片选择器（角色头像 `CharacterEditorView.vue`、自定义主题背景 `SettingsView.vue:customTheme`、聊天背景 `SettingsView.vue:bg`）由单一 `<input accept="image/*">` 改为「拍照」(`capture="environment"`) + 「从相册选择」(无 capture) 双入口按钮，点击时经 `:capture` 绑定 + `nextTick` 切换后触发；因 iOS 上 capture 直接唤起相机且不允许切相册，故提供两个独立入口而非单一 input 加 capture。新增 i18n 键 `picker.camera`/`picker.album`（zh/en）。typecheck / lint / i18n:strict 通过。
<!-- fixlog-end -->

---

## 附录 A：问题编号总索引

| 编号 | 严重度 | 一句话 | 优先级 |
| --- | --- | --- | --- |
| S-1 | 中 | 双导航栏方案并存互斥，旧方案成死规则 | P1-A |
| S-2 | 中 | 底部导航高度四套口径 | P1-A |
| S-3 | 低 | `.app-main` padding-bottom 三处互相覆盖 | P1-A |
| S-4 | **高** | z-index 秩序错乱：遮罩压不住底部导航 | **P0** |
| S-5 | 中 | 抽屉开关按钮断点不对称（640 vs 1024） | P1-B |
| S-6 | 中 | CharacterList 在 641–1024 形态三不像 | P1-B |
| S-7 | 低 | ContextPanel 抽屉缺 transition | P2 |
| S-8 | 中 | 100vh 残留 2 处 | P2 |
| S-9 | 中 | 全局 style 依赖加载顺序取胜 | P1-A |
| S-10 | 中 | 8 处业务页野断点 | P1-A |
| I-1 | 中 | `panelOpen` 一个布尔两种端语义 | P1-B |
| I-2 | 中 | 视口状态同步只做单向 | P1-B |
| I-3 | 中 | 移动端 ESC 逻辑泄漏到桌面 | **P0** |
| I-4 | 低 | 双高亮机制错位（NavRail vs BottomNav） | P1-A |
| I-5 | 中 | hover 无 `hover:hover` 守卫，触屏粘滞 | P1-B |
| I-6 | **高** | IME 回车误发送（缺 `isComposing`） | **P0** |
| I-7 | 中 | iOS 聚焦缩放残留（edit-message-input 13px） | P1-B |
| I-8 | 中 | 抽屉缺滑动关闭与滚动锁定 | P1-B |
| I-9 | 低 | NavRail 重复导航 Promise 未捕获 | P2 |
| I-10 | 中 | 详情页返回语义错 + ProfileView 无出口 | P1-B |
| I-11 | 中 | 触控目标 < 44×44（4 处） | **P0** |
| I-12 | 低 | 遮罩无键盘可达等价关闭 | P2 |
| I-13 | 中 | 平板 641–1024 可见但 inert 的死区 | P1-B |
| I-14 | 中 | panel-toggle 自我失效 | **P0** |
| F-1 | 中 | 三端链路共用同一份失败文案 | P1-B |
| F-2 | 中 | 存储适配器序列化语义不对称 | P1-B |
| F-3 | 中 | 手机端不可用的 webkitdirectory 目录选择 | P1-B |
| F-4 | 中 | active-profile 两端语义不一致 | P2 |
| F-5 | 低 | 图片选择无 capture（缺相机直拍） | P2 |

**统计**：样式层 10 条（高 1 / 中 7 / 低 2）· 交互层 14 条（高 1 / 中 10 / 低 3）· 流程层 5 条（高 0 / 中 4 / 低 1）· **合计 29 条（高 2 / 中 21 / 低 6）**。

## 附录 B：本次评审的方法说明与免责

1. 本报告为**静态源码评审**，所有结论均有 `文件:行号` 出处，可逐条复核。
2. 标注为**潜伏**的问题（S-1 / S-2 / S-3 / S-9 / F-2）当前在正常构建下不产生用户可见故障，其严重度依据的是"触发后影响面 × 触发概率"，不代表当前存在 bug。
3. 未进行真机/浏览器实测。第 9.4 节的回归矩阵是**修复时的验收要求**，不是已完成项。
4. 本报告**仅评审，未修改任何项目源码**。所有修复建议均为待排期方案，实施前需与项目经理确认优先级与批次划分。
