# 双端 UI 与交互评审（2026-10-16）

评审对象：`feat/ux-ia-guided-flow` 工作树。
**方法：全部结论以真浏览器实测为准，不引用文档说法。** 文档与实测冲突的地方单列在 §4。
**没有改一行产品代码。**
上游分析（业务逻辑、用户场景、交互形态选型，回答"为什么该这么修"）：[IA_EVAL_2026-10-17_业务逻辑与交互形态评估.md](IA_EVAL_2026-10-17_业务逻辑与交互形态评估.md)。
并列的体验重构计划（移动端五项专项 A–E，批次 1–2 已落地、3–5 待做）：[OPT_PLAN_2026-10-15_移动端与五项体验重构.md](OPT_PLAN_2026-10-15_移动端与五项体验重构.md)。**它与本评审/修复方案共享热文件**（`layout.css`、`responsive.css`、`ChatMain.vue`），串行约定见其 §9；其 §3 的"五道守卫"硬数字（断点允许集、`!important` 余量 2 处、对比度 67 零余量）是任何改动的共同约束。

量具：`tmp-seed.mjs`（种 4 角色 / 2 单聊各 30 条 / 1 世界书 8 条 / 2 群聊）+ `tmp-mobile-audit.mjs`、`tmp-group-space.mjs`、`tmp-cards.mjs`、`tmp-deep*.mjs`、`tmp-band.mjs`、`tmp-lp.mjs`。
档位：360×640 / 390×844 / 412×915 / 844×390（横屏）/ 768×1024 / 1024×768 / 1440×900。

---

## 0. 结论

1. **桌面端守成。** 四栏并置、九套皮肤、三层 Token、对比度门禁 26 组 × 9 款全过、`Modal` 17 处复用 —— 同类开源项目里偏上。只有三笔存量债（§5）。
2. **手机端的瓶颈不是"挤压/溢出"**（390/360/1440 × 19 路由，两项都是 0 命中，15.15 那张网有效），而是**页面组成**：手机端没有独立的组成定义，密集页是桌面双栏竖向堆叠。
3. **本次深挖量出四件"用不了"的缺陷**：设置页 3–4/7 个分类点不到（§2.1）、群聊消息区塌到 32px（§1.1，只剩自己的内边距）、键盘弹起后群聊输入条落在视口下方 233px（§2.2）、焦点双向逃逸（§2.3）。**另两件不算"用不了"，单独归类**：Toast 压住页头 44px（§2.4，是**遮挡**不是阻断，用户仍能操作）、横屏给不存在的底部导航留 56px 的死代码（§2.5）。
4. **顺手确认了几件"其实没问题"的事**（§3），别再当缺陷重开：长按面板、删除确认、底部导航稳定性、输入框字号、键盘抬升（单聊）。
5. **对比同类**：视觉系统这一层本项目领先；手机端组成这一层与 SillyTavern 一样欠账，而该品类的社区补丁（Mobilyze）干的正是这件事（§6）。

---

## 1. 手机端实测读数

### 1.1 群聊消息区是「剩下的那一块」，没有下限

受控实验（390×844，同一份数据，**只改群的数量**，每组都是 3 名成员 8 条消息）：

| 群数 | 群列表面板 | 群头部 | **消息区** | 消息区占比 |
|---|---|---|---|---|
| 1 | 149 | 257 | **103** | 12% |
| 2 | 205 | 257 | **47** | 6% |
| 3 | 261 | 257 | **32** | 4% |
| 5 | 298 | 257 | **32** | 4% |

页头 71、就绪条 69、能力说明 55、输入区 87、底部导航 53 —— 这五项与群数无关，恒为 335px。
3 个群时消息区以上的配置与导航合计 **713px = 84%**，聊天本体剩 32px。

根因是精确的：`.messages-area` 是 `flex: 1; overflow-y: auto; padding: 16px 20px`，**没有 `min-height`**。空间不够时 flex 项塌到 0 内容高度，**你看到的 32px 全部是它自己的上下内边距**——内容高度是 0，不是"小"。群列表上限是 `max-height: 42vh`（`GroupChatView.vue:2772`），列表先吃满，剩下的才轮到消息区。

所以关键不是"103px 很小"，而是**消息区不是被分配的一份，是算完别人之后的残值**，而且它的下限只由自己的 padding 决定。

对照单聊同口径（390×844）：页头 56 + 就绪条 69 + **消息区 593（70%）** + 输入 73 + 导航 53。同一个应用里两个对话页的可用面积差 **18 倍**（593 / 32）。

### 1.2 世界书页：三层嵌套滚动

390×844 实测滚动容器：`app-shell 844→1087`、`editor-content 521→2092`、`entries-list 227→349`。
列表 227px（约 1.5 行可见）、详情表单 2092px 挤在 521px 的独立滚动区、外面再套 243px 的外滚。桌面"左列表 / 右详情"在手机上成了同一列上下两段各自滚动，两段之间没有视觉分界，也没有"返回列表"这个动作。

### 1.3 角色列表：一屏 1.5 张卡

390×844 实测（12 张卡时）：页头 90 + 搜索 36 + **筛选标签 110（标签胶囊排成 3 行）** + 排序 40 = 276px（33%）之后才开始列表；列表可视 443px，单卡 **302px** → **每屏 1.5 张**。卡内 `card-actions`（编辑/对话/导出/删除 2×2 四按钮）占 62px。浏览列表上给每张卡四个动作按钮是桌面网格写法；手机上"点卡进对话"应该整卡可点。

### 1.4 横屏：手机横屏落进平板带，还留着一条给不存在的导航的预留

`AndroidManifest.xml` **没有 `screenOrientation`** ⇒ 真机会转屏，这一档是活的。

844×390 实测：

| | 值 |
|---|---|
| 底部导航 | **不渲染** |
| 导航栏（rail） | 64px 宽 |
| 单聊消息区 | 169px（43%） |
| **群聊消息区** | **32px（8%）** |
| `chat-main` padding-bottom | **56px** |
| 该 56px 占视口 | **14%** |

那条预留来自 `responsive.css:109`：

```css
/* 横屏移动端：底部导航为 sticky,主内容预留高度避免被遮挡 */
@media (max-height: 480px) and (orientation: landscape) and (max-width: 900px) {
  .chat-main { padding-bottom: 56px; }
}
```

实测该媒体查询在 844×390 **命中**，而 `.bottom-nav` **不在 DOM**（这一档渲染的是 rail）。**这条预留是给一个不存在的导航留的**，白白吃掉 390px 高里的 56px。成因见 §2.5。

同带（641–1024）的完整形态：**rail 宽度在这一档不是一个值**——`layout.css:34` 默认 112px，`layout.css:104` 在 ≤900px 收成 64px。实测 768×1024 是 64px rail + 主区 704px；1024×768 是 **112px** rail + 主区 912px。两个侧栏都是**离屏抽屉**（`.character-list` x=−280、`.context-panel` x=+视口宽）。这一档聊天本身是好的（平板竖屏消息区 828/1024 = 81%）。

### 1.5 导航

- 底部 Tab **6 个**（会话/角色/市场/世界书/更多/设置）。
- 12 条内容入口里 **8 条只能从「更多」进**；**8 个视图进页面就摘掉底部导航**——`mobile-nav.ts:21-31` 的 `DETAIL_ROUTES` 有 9 条路由，对应 **8 个**视图（`character-edit` / `character-new` 是同一个编辑器的两条路由，去重后为 1）。注：`/group` **已经**从这张表里移出去了，`mobile-nav.ts:16-19` 的注释写明理由是"进 /group 就吞掉底栏会形成单向门"——这条判断是对的，其余 8 个视图是同一个问题。（旧版写"7 个"是数错的，2026-10-17 评审更正。）
- **Android 返回键全仓无处理**：`src/` 内无 `popstate` 监听、无 `Capacitor App.addListener('backButton')`。
- 横屏/平板带没有底部导航，导航靠 rail（≤900px 宽时 64px，再宽是 112px）；横屏 390px 高时 rail 的 15 项需要 556px，**要滚动 rail 才够到「设置」**（实测滚动前后：末项 bottom 548 → 382）。

---

## 2. 深挖出的缺陷与死代码（都是实测）

### 2.1 设置页 3–4/7 个分类在手机上点不到

`.settings-nav-list` 实测条宽 **444px**，不随视口变。**注意：代码里没有 `444` 这个声明**——`SettingsView.vue:701-711` 的 ≤640 档只做了两件事：把 `.settings-nav-list` 改成 `flex-direction: row`、把 `.settings-nav-item` 设成 `flex: 0 0 auto`。7 个 item 的宽度相加就是 444px，缺的是**收缩约束 `min-width: 0`**，不是某处写死了一个宽度。修法必须针对这一点（见 §7 P0-2），照着"删掉那个 444"去找会找不到：

| 视口 | 条宽 | 条右边界 | 初始完整可见 | 初始被切掉 |
|---|---|---|---|---|
| 360 | 444 | 479 | **3/7** | 语音与辅助、数据导入、安全、关于 |
| 390 | 444 | 479 | **4/7** | 数据导入、安全、关于 |
| 412 | 444 | 479 | **4/7** | 数据导入、安全、关于 |

把条滚到底（内容 574，可滚 130px）后，**「关于版本信息」左边界仍在 408 > 视口 390**，仍在屏外。裁剪链实测：

```
settings-nav-list  w=444 right=479  overflow-x:auto   ← 自己可滚，但盒子已经比视口宽
settings-nav-inner w=444 right=479  overflow-x:visible
settings-nav       w=466 right=490  overflow-x:auto
settings-view      w=390 right=390  overflow-x:hidden  ← 在这里被切
app-main           w=390 right=390  overflow-x:hidden
app-shell          w=390 right=390  overflow-x:hidden
```

祖先三层 `overflow-x: hidden` 把超出的 89px 裁掉，而条自己的横向滚动只能滚到 x=479 —— 永远进不了视口。**结果：390/412 上「数据 / 安全 / 关于」三个分类没有任何手势能到达，360 上是四个（多一个「语音与辅助」）**，其中「安全」是主密码与加密保护所在的页。这也是为什么全站横向溢出读数是 0：不是没溢出，是被裁了。

### 2.2 键盘弹起后，群聊输入条落在视口下方 233px

模拟安卓路径（`adjustResize` ⇒ 布局视口收缩）：390×844 → 390×500。

| | 单聊 | 群聊 |
|---|---|---|
| 收缩前输入条 bottom | 791 | 812 |
| 收缩后输入条 bottom | **447 ✓（视口 500 内）** | **733 ✗（溢出视口 233px）** |
| 收缩后消息区高 | 249 | 32 |
| `--keyboard-inset` | 0px（符合预期，安卓不需要它） | 0px |

单聊正常：`.app-shell` 是 `100dvh` 的 flex 列，页脚 `flex-shrink: 0`（`layout.css:204-218`），视口一缩整列跟着重排。**群聊页的列不重排**，视口一缩输入条被推到 `bottom-nav` 下方（收缩后导航 top=447、输入条 646..733）——键盘一弹，输入框就在屏幕外，用户看不到自己打的字。

**这个模拟与真机同机制**：`OPT_PLAN §15.16` 的真机读数（2026-10-16，安卓）是 `innerHeight 842→530`、`.chat-footer` 底边 461 ≤ 可见底 530。我这边 844→500 得到 447 ≤ 500，形状一致 ⇒ 单聊那半是被真机验过的；**群聊那半他们的探针没测**（探针只查 `.chat-footer`），所以这是新增读数，机制相同但**建议上真机复量一次再动手**。

### 2.3 焦点双向逃逸

`inert` 的接线方向反了。实测 `ChatView.vue:89,92,95` 给三个子组件传了 `inert`，条件各不相同：

| 组件 | 条件 |
|---|---|
| `CharacterList`（左抽屉） | `contextDrawerOpen && isCompact` —— 仅当**右**抽屉打开时 |
| `ChatMain`（主区） | `overlayActive && isCompact` |
| `ContextPanel`（右抽屉） | `characterDrawerOpen && isCompact` —— 仅当**左**抽屉打开时 |

而 `ChatMain` 的根 `<main class="chat-main">` **不接** `inert`——`props.inert` 只落在 `<footer class="chat-footer">`（`ChatMain.vue:1033`）。

**方向一：两个抽屉都关着时，Tab 走进离屏抽屉。** 390×844，`/chat`，连按 12 次 Tab：

```
1. 跳到主内容            x=8
2. 搜索角色              x=-268  【离屏】【在抽屉里】
3. 关闭                  x=-35   【离屏】【在抽屉里】
4. 选择角色 卡尔文·夜莺   x=-272  【离屏】【在抽屉里】
5~12. 全在离屏抽屉里（选择角色 / 为此角色新建会话 …）
```

12 个停靠点里 **11 个在 x≈−270 的不可见抽屉里**。键盘、开关设备、读屏用户打开聊天页后，根本到不了输入框。

**方向二：抽屉打开时，第 13 个 Tab 逃到遮罩后面。** 实测前 12 个停在抽屉内，第 13 个开始依次落在 `打开角色列表 / 对话 / 搜索对话消息 / 导出对话 / 切换上下文面板 / 就绪条胶囊…`——全部是被遮罩盖住的聊天区。

也就是说：**代码守的是"抽屉开着、后面的列表别被点到"，漏的是"抽屉关着、离屏的列表别被 Tab 到"**——而后者才是真问题。

### 2.4 Toast 落在页头上

`/chat` 实测：`.chat-header` 是 top 0 / bottom 56；触发的 toast 是 top 12 / bottom 60、宽 366、`position: fixed`、z=200。**与页头重叠 44px**，正好压住角色名与「对话 / 群聊」分段控件。z=200 是全站最高层（rail 30 < mask 60 < drawer 70 < modal 100 < toast 200）。

### 2.5 一条死代码：横屏给不存在的底部导航留了 56px

§1.4 那条规则的注释写「底部导航为 sticky」，但同一档实测 `.bottom-nav` 不在 DOM。根因是**"是不是手机"有两套互不覆盖的定义**：

- JS：`useViewport().isMobile` 按宽度（>640 就不是手机）⇒ 844 宽判为**不是**手机 ⇒ 渲染 rail、不渲染底部导航。
- CSS：`max-height:480px and orientation:landscape and max-width:900px` ⇒ 844 判为**是**横屏移动端 ⇒ 给底部导航预留 56px。

641–900 这个区间正好落在两套定义的缝里。这条不是"样式没写好"，是**两个真源对同一个问题给了不同答案**，和 §4 里那 96 处硬编码断点是同一个病。

---

## 3. 实测确认"没问题"的（别当缺陷重开）

| 项 | 实测 |
|---|---|
| 窄屏挤压 / 横向溢出 | 390/360/1440 × 19 路由，**均 0 命中**。15.15 那张网有效 |
| 长按消息面板 | **正常**。底部抽屉 390×357、贴底、z=100、圆角 16px，7 个按钮全是 **374×48**（≥44 ✓）。**注意它是 OPT_PLAN 专项 D 的产出，不是原生形态**——该计划批次 1 把"触屏常显 6 个 24px 按钮"改成了长按 ActionSheet；如果后来读到"气泡头顶常显按钮"的旧描述，那是修复前的。别把它当"本来就没问题"。注：`onWrapPointerDown` 要求 `pointerType === 'touch'`，鼠标事件不触发——用鼠标测会误判成"坏了" |
| 删除确认对话框 | 居中对话框 326×225（390 视口下 84% 宽）——确认类用居中、编辑器用底部抽屉，这个分工是对的 |
| 底部导航稳定性 | 长页面滚到底（`settings-body` 647→2634）后 bottom-nav 仍在 bottom=844，不会被滚走 |
| 输入框字号 | 手机两档全部 ≥16px，不触发 iOS 聚焦缩放（`I-7` 守卫在守） |
| 键盘抬升（单聊） | 布局视口收缩后输入条 bottom 447 < 500，正常。`--keyboard-inset` 在安卓恒 0px 是**设计如此**，不是没生效 |
| 抽屉关闭态不吞触摸 | 关闭态抽屉在 x=−280..0，实测 (6,400) 命中 `.empty-state`，不抢点击 |

---

## 4. 文档与实测不符（以实测为准）

| 文档说法 | 实测 |
|---|---|
| `mobile-ui-design.md:17,69,284` 底部导航 **5 Tab** | **6 个**（会话/角色/市场/世界书/更多/设置） |
| `responsive.css:109` 注释「底部导航为 sticky」 | 该档（844×390 实测命中）**没有底部导航**，是 64px rail |
| `mobile-ui-design.md:21` `.app-main.has-mobile-nav` 为 Tab 页保留底部空间 | `app-global.css:160-162` 已把它归零（**不是 `App.vue`**）；`MoreView.vue:174` 仍留 `72px + safe-area` 死空白。该规则自己的注释记着 2026-10-16 真机量到的那条 56px 空带——**§2.5 的横屏预留是同一个病的另一处，没被那次一起收掉** |
| `mobile-ui-design.md:168` 可点目标最小 **44×44px** | 工具栏可点元素实测 **16–37px**（`.member-remove` 16×16、群聊动作按钮约 24px、`.composer-btn` 30×30、页头图标 32×32）；`--touch-min` 只被 **3 个文件 7 处**引用（`CharacterList.vue` 4 处 = 623/624/631/635、`app-global.css` 2 处 = 99/100、`tokens-structure.css` 1 处 = 100 的 `--size-control-touch` 别名），**全仓无第四个消费方** |
| `tokens-responsive.css:3` 「全仓唯一允许出现断点数字的文件」 | 96 处硬编码断点，`var(--bp-*)` **0 引用**（CSS 规范也不允许在 `@media` 里用 `var()`，所以这句在机制上不成立） |
| `--mobile-nav-h: 56px`（`tokens.css:155`） | 实测导航高 **53px**（`BottomNav.vue:69` `min-height:52px` + 1px 边框）；该令牌只有 `.source-return` 一处消费，偏移 3px |
| `mobile-ui-design.md:290` 详情页由 `meta.hideMobileNav` 隐藏 | 无此 meta；是 `mobile-nav.ts:21-31` 的硬编码 9 路由集合 |
| `mobile-ui-design.md` 说世界书手机端编辑已完成（§14.5 又说"后续"） | 自相矛盾；实测是竖向堆叠 + 三层嵌套滚动（§1.2） |
| `keyboard-inset.ts:2-15` 只推演 Android WebView 与 iOS Safari 两个引擎 | 本仓还有第三个目标 **Tauri**（Tauri #10631：其 `visualViewport.height` 不随键盘变），未进这张表 |
| `ChatMain.vue:49-51` 注释「仅作用于聊天内容区与输入区」 | 实际只绑到 `<footer class="chat-footer">`，消息区与页头没有 inert（§2.3） |

---

## 5. 桌面端（Web）：守成 + 三笔存量债

现状：L1/L2/L3 三层 Token、9 套内置皮肤 + 1 套自定义、`check-contrast.mjs` 26 组语义配对 × 9 款全过、真实 DOM 扫描 506 组配色 × 67 处未过（基线持平）、`Modal` 17 处复用、`EmptyState` 12 视图复用、单一 `nav-model.ts` 驱动四种导航表面。

1. **死 token 引用**：全仓共 **79 处**引用从未定义的 CSS 变量（判据：`var(--X…)` 的 X 在 `src/styles/*.css` 与任何 `.vue` 里都没有 `--X:` 定义）。分布：

| 文件 | 未定义引用 | 涉及 token |
|---|---|---|
| `StoryEngineView.vue` | **58**（其中 **56 处无兜底**） | `--on-surface-variant` 27、`--on-surface` 19、`--bg` 6、`--on-bg` 4（均无兜底）；`--code-bg` 1、`--primary-hover` 1（有兜底） |
| `CommunityMarketView.vue` | 10 | `--text` / `--bg` |
| `WorldBookView.vue` | 6 | 同上 |
| `CharacterEditorView.vue` | 4 | 同上 |
| `LocalModelView.vue` | 1 | — |

56 处无兜底意味着**声明被静默丢弃、那些颜色从来没生效过**——不是审美问题，是"作者以为改了颜色，其实没改"。有兜底的 2 处不会坏，但兜底值不是主题感知的（换皮肤不跟着变）。
2. **provider 徽章对比度 1.93–2.10:1**（`SettingsModelPanel.vue`，openai/anthropic 品牌色写死、不随主题走）——全仓最差两组，且在首次配置模型这条必经路径上。
3. **Token 采纳率**：组件层 `prop: Npx` 形式的字面量 **3061 处**（`grep -rhoE ':\s*[0-9]+px' src/components src/views --include=*.vue`），而 `--space-*` 53 次、`--font-size-*` 34 次、`line-height: var(--…)` 仅 3 次（`--radius-*` 是唯一真正落地的，381 次）。门禁卡住存量不涨，但也没在降。这是"一处改能不能多屏生效"的前提（见 P0-5）。

---

## 6. 与同类项目对比

| 项目 | 事实 | 对本项目的意义 |
|---|---|---|
| **SillyTavern**（同品类基准） | 官方无手机端；Android 走 Termux 或"桌面起服、手机开 URL"。断点 1000px 且**做成用户设置**（`--mobileBreakpoint` + `responsive_layout: auto/desktop/mobile`）。 | 它的社区补丁 **Mobilyze** 干的就是本项目现在的问题：收回顶部栏抢走的 15% 竖屏空间、把左右抽屉限制在视口内。**该品类在手机上的通病就是"桌面抽屉 + 密集常驻栏吃屏"**——本项目 §1.1 的 84%（3 个群时）是同一形状。 |
| **SillyTavern #5703** | 150+ 条消息时输入聚焦/点击/发送卡 2–3 秒。 | **本项目已解**：`ChatMain.vue:152` 只渲染 `messages.slice(windowStart, windowEnd)`（尾部 60 条 + 顶部占位 + 分页），`long-history-scroll.spec.ts` 守着。不要重做。 |
| **SillyTavern #5245** | 断点做成设置，可 force-desktop。 | `viewport.ts` 是全仓唯一 `matchMedia`，加开关很便宜；收益是 iPad 横屏、折叠屏展开自选。**还能顺手收掉 §2.5 那种"两个真源"**。 |
| **LobeChat / LobeHub** | 设置走独立全页嵌套路由（`/settings/...` 自带子导航），手机端退化为汉堡抽屉 + 底部输入区。 | 与 P0-2 的"设置首页 = 全屏分类列表"同一条路。7 个分类塞进一条横排是共性问题。 |
| **Character.AI 类（手机优先）** | 底部 3–5 Tab、**聊天占满整屏、无常驻侧栏**、发现页无限滚动卡片、输入框常驻可及、用户 Persona 是一等对象。 | 差距集中在两条：**一屏一个主动作**、**聊天就是整屏**。对照 §1.1：本项目群聊把 84% 给了配置。 |
| **Apple HIG / Material 3** | HIG 最小命中区 **44×44pt**、按 size class 而非设备布局、主操作用全宽按钮。M3 最小 **48dp**、导航栏 **3–5** 个目的地、移动端编辑器用 bottom sheet。 | 三条可直接判：`--touch-min` 有 token 未执行（P0-5）；底部 Tab 6 个超 M3 上限（P0-7）；世界书条目编辑该是 sheet 而不是内联长表单（改造落在方案文档的批次 1-3）。长按面板已经是正确形状（374×48）。 |
| **Tauri #10631** | Tauri 下软键盘弹出时 `visualViewport.height` 不跟着变，`innerHeight - visualViewport.height` 这套写法算错。 | `keyboard-inset.ts` 没把 Tauri 当第三个引擎。若 Tauri 移动端上马需重验。 |
| **Capacitor #814 / #3229 / #4187** | iOS 键盘收起后命中区不移回；Android WebView 长列表滚动后掉帧。 | 前者给 P0-3 加一条验收；后者已被窗口化渲染规避。 |
| **Capacitor System Bars 插件** | 官方提供安全区/状态栏处理，不建议手写 inset。 | 现在是 4 处手写 `env(safe-area-inset-bottom)`，暂不动；若出现压盖优先上插件。 |
| **SillyTavern #2695** | 升级后设置被清空（数据丢失级别）。 | 与手机无关但同类，建议改导航/Tab 顺序前确认设置与分组有兜底。 |

一句话：**视觉系统这一层本项目领先同类；手机端"页面组成"这一层与 SillyTavern 一样欠账，而手机优先的产品给的答案一致——一屏一动作、聊天占满屏。**

---

## 7. 改进方案

按"用户直接点不到"和"一处改、多屏受益"两个尺度排序。**P0-2、P0-4、P0-6 是最便宜的三条**（一行到十行，当天可完成）；**P0-1 与 P0-3 是同一个修法**（推导见 P0-3），实质是组成改动，不便宜但收益最大。分批次与每批判据见方案文档 [MOBILE_PLAN_2026-10-16_手机端组成层与可用性修复方案.md](MOBILE_PLAN_2026-10-16_手机端组成层与可用性修复方案.md)。

### 两层编号的对照（本文 P0 ↔ 方案文档批次）

两份文档各有各的组织方式：**本文按"缺陷严重度"排，方案文档按"能同时改完的批次"排**，所以同一件事在两边的号码不同。执行时不要在编号上对不上就以为漏了：

| 本文 | 方案文档批次 | 事项 |
|---|---|---|
| P0-1 | 1-2 | 群聊消息区塌成 32px |
| P0-3 | 1-2（**同一修法**） | 键盘弹起输入条溢出 233px |
| P0-2 | 0-1 + 1-4 | 设置分类点不到（治标一行 + 治本两级） |
| P0-4 | 0-6 | 焦点 `inert` 方向 |
| P0-6 | 0-2 + 2-5 | 横屏死预留 + 两个真源收敛 |
| P0-5 | 3-1 / 3-2 / 3-3 | 触摸目标 44px |
| P0-7 | 0-3 + 0-4 + 0-5 + 2-1 + 2-2 + 2-3 | 导航与常驻 chrome |
| P1 | 4（整批） | 三笔存量债 |
| —（本文未单列） | 1-1 | `.m-swap` 两级原语（方案文档新增的公共件） |
| —（本文未单列） | 1-3 | 世界书三级 → 两级（本文证据在 §1.2） |
| —（本文未单列） | 1-5 | 角色卡一屏 1.5 张（本文证据在 §1.3） |
| —（本文未单列） | 2-4 | 单聊页头 `.chat-title` 只有 62px（方案文档 §3.2） |

反方向看：**方案文档的 1-1 / 1-3 / 1-5 / 2-4 在本文里没有独立的 P0 条目**——它们是 §1.2 / §1.3 / §3.2 的读数推出来的，不是本次深挖出的缺陷。两条线合起来才是完整清单。

### P0-1 群聊：消息区塌成 32px —— 修法不是给它下限，是给 chrome 上限

我先后写过两版错处方，都记在这里免得有人再走一遍：

- 第一版："`min-height: 55vh`"。拍的数。
- 第二版："`min-height: 40vh`（量出来的）"。**量出来的是"它在 844 下刚好不溢出"，但它同时把 500 那档弄坏了。**

两版都是"给内容设 vh 下限"，而 vh 下限会**和 flex 容器对着干**——它要求消息区在视口变小时也占 40%，于是必然把输入条挤出去。四个方案对打（390 宽，都先注入：群列表移出本屏、能力说明去掉、就绪条一行）：

| 方案 | 844 头部 | 844 消息区 | 844 输入条 | 500 消息区 | 500 输入条 |
|---|---|---|---|---|---|
| 现状 | 293 | 32（4%） | 812 ✓ | 32（6%） | 733 **✗** |
| A：消息区 `min-height:40vh` | 293 | 338（40%） | 969 **✗** | 200（40%） | 831 **✗** |
| B1：头部 `max-height:110px; overflow:hidden` | 110 | 343（41%） | 791 ✓ | 32 | 480 ✓ |
| **B2：动作组 + 成员条 + Runtime 移进「群设置」抽屉** | **87** | **367（43%）** | **791 ✓** | 32 | **456 ✓** |
| B3：B2 再叠加头部 `max-height:110px` | 87 | 367（43%） | 791 ✓ | 32 | 456 ✓ |

**结论：改 B2。给 chrome 设上限（把内容搬走），不给内容设 vh 下限。**

B1 与 B2 都能让输入条留在视口内，但 **B1 是靠裁剪**——`max-height: 110px` 会把成员条切掉（头部现在装着标题行 + 6 个动作按钮 + Runtime 折叠段 + 成员条，合计 163–293px）。B2 是把这些搬进抽屉，不裁任何东西，且结果更好：头部 87px、消息区 367px（43%）。**B3 说明那条 `max-height` 在 B2 之后是惰性的（87 < 110），所以它只是个防止头部再长回去的安全网**，可以留也可以不留。

```css
/* 消息区不该是"剩下的那一块"：把竞争者搬走，它自然长大 */
.group-header { max-height: 110px; }   /* 安全网；B2 做完后实际只占 87px，不会触发 */
/* 手机档：群列表移出本屏（全屏页）；6 个动作按钮 + 成员条 + Runtime 进「群设置」抽屉 */
.messages-area { flex: 1; min-height: 0; }   /* 不加 vh 下限 */
```

500 档消息区仍会回落到 32px——那是键盘弹起、视口只剩 500 的必然，**但输入框可见可打字**（bottom 456 ≤ 500），比"看不到自己打的字"好一个量级。要再抢就继续压 chrome，不要回头去给内容加下限。

真正的大头仍是组成改动本身：**光把群列表移出本屏，消息区就从 32px 变成 291px（34%）**；头部瘦身再把它推到 43%。

再往前一步（推荐）：把群列表变成**全屏页**，进群后配置收进右上"群设置"抽屉 —— 这就是自家 `ai-chat-ui-redesign/docs/05-响应式规格.md` 2XS 段对"列表栏"的规定，只是群聊页从没接进来。

### P0-2 设置分类条：3–4/7 个分类点不到（含主密码所在的「安全」）

条宽实测 444px——**不是某处写了 444**，是 7 个 `flex: 0 0 auto` 的 item 相加把容器撑开（见 §2.1）；祖先三层 `overflow-x: hidden` 把多出的 89px 裁掉，条自身的滚动永远进不了视口。修法是让条变成**真正的视口宽滚动器**，关键是补上缺失的收缩约束：

```css
/* 要补的只有这一条：宽度与收缩约束。缺的正是 min-width: 0 */
.settings-nav, .settings-nav-inner, .settings-nav-list { width: 100%; max-width: 100%; min-width: 0; }
/* 不要再声明 overflow-x: auto —— SettingsView.vue:704 已经有它了。
   旧版本处方把它又写一遍，会让排查方向误以为"缺的是滚动"，
   而真正的缺是收缩约束：有滚动但盒子比视口宽，滚也滚不进来。 */
```

更好的形状（与 LobeChat 一致）：设置首页 = 全屏分类列表，点进分类 = 全屏页。7 个分类横排在任何手机上都是坏形状。

### P0-3 键盘：群聊输入条溢出视口 233px —— 与 P0-1 是同一个修法

**先纠正一个我写错的处方**：我最初写的是"让群聊的纵向布局与单聊同构（外层 100dvh 的 flex 列）"。实测读码后这句是错的——**那条链已经存在**：

```
.group-chat-view   display:flex; flex-direction:column; height:100%   ✓
.group-body        flex:1; display:grid; min-height:0; overflow:hidden ✓
.group-main-panel  display:flex; flex-direction:column; min-height:0   ✓
.messages-area     flex:1; overflow-y:auto                            ✓
.input-area        flex-shrink:0                                       ✓
```

真正的原因是**上方固定 chrome 加群头部超出了可用高度**：

| 视口 500 时 | 高 |
|---|---|
| `.app-main`（= 500 − 53 导航） | 447 |
| 减 `.group-body` 之前的固定 chrome：页头 71 + 就绪条 69 + 能力说明 55 | −195 |
| **`.group-body` 总共只剩** | **252** |
| 而它里面要同时放：群列表（≤42vh = 210）＋ 主面板 | 210 + ? |
| 主面板自己要放：群头部 257 ＋ 消息区 ＋ 输入区 87 | **344**（比整个 `.group-body` 还大） |

主面板的内容（344）比容纳它的盒子（252，还要分给群列表）大出一倍 ⇒ 必然溢出，而 `.group-main-panel { overflow: hidden }` 把输入条裁到视口外（实测 bottom 733）。844 视口下同一套算式能放下（`.group-body` 596 = 列表 205 + 主面板 391），所以这个问题只在键盘弹起时才现形。

**所以 P0-3 与 P0-1 是同一个修法**（P0-1 的方案 B2：群列表移出本屏、6 个动作按钮 + 成员条 + Runtime 进「群设置」抽屉、就绪条一行、能力说明收成提示）。改完 500 档的输入条回到视口内（实测 733 → 456）。**不要为它单独改布局骨架**——骨架是对的，是尺寸分配不对；**也不要给消息区加 vh 下限**——那会把 844 和 500 两档一起弄坏（P0-1 的表 A 行）。

判据：视口 390×500 时输入条 bottom ≤ 500（当前 733）。

### P0-4 焦点：`inert` 的接线方向反了

- 抽屉**关着**（离屏）时 → 抽屉内容应 `inert`。现在是"仅当另一个抽屉打开时"才 inert，于是 12 个 Tab 里 11 个落在不可见的抽屉里。
- 抽屉**开着**时 → 遮罩后面的主区应 `inert`。现在 `ChatMain` 的 `inert` 只绑在 `<footer class="chat-footer">` 上（`ChatMain.vue:1033`），第 13 个 Tab 就逃到遮罩后面。

修法：`inert` 挂在两个抽屉的根元素上（关闭态为真），`ChatMain` 根元素接 `props.inert`。判据：抽屉关着时连按 12 次 Tab 不应出现任何 x<0 的元素；抽屉开着时 Tab 不应离开抽屉。

### P0-5 触摸目标：让 44px 真的生效

`--touch-min: 44px` 早在 `tokens.css:152` 定义，全仓只有 **3 个文件 7 处**直接引用它（`CharacterList.vue` 4 处、`app-global.css` 2 处、`tokens-structure.css:100` 一处别名；见 §10）。控件阶梯 `--size-control-md: 36px` 被原样带到手机上。两件事：

```css
/* 手机档整体上移一级，而不是给每个按钮加 min-height */
@media (max-width: 640px) {
  :root { --size-control-sm: 36px; --size-control-md: 44px; --size-control-lg: 48px; }
}
```

前提是控件高度先走 Token（现在绝大多数是字面量）。过渡期用一条兜底，只覆盖独立图标按钮，不覆盖密集行内工具条——群聊那 6 个动作按钮各撑到 44px 会再多占约 60px 竖向空间，先做 P0-1 再放它们。最差三处：`.composer-btn` 30×30（**比桌面 32×32 还小**，`responsive.css:70`）、`.member-remove` 16×16（`GroupChatView.vue:2309`）、群聊 6 个动作按钮约 24px 高。
反例（做得对的）：长按面板的 7 个按钮全是 374×48。

### P0-6 一条 CSS 死代码 + 两个真源（横屏 56px）

`responsive.css:109` 给不存在的底部导航预留 56px，占横屏高度的 14%。删掉它，并**把"是不是手机"收敛成一个运行时值**（`viewport.ts` 的 `isMobile`），CSS 侧只消费它写出来的标记类，而不是各自再算一遍宽度。同时按 SillyTavern 的做法把断点做成设置（默认手机档可 force-desktop），顺带解决 iPad 横屏与折叠屏。

### P0-7 导航与常驻 chrome

- **6 Tab 减回 5**：世界书（2975 行创作工具）下沉到「更多」，**群聊上提到 Tab**。现在手机首屏放着一个重编辑器，而核心功能群聊要两步才到。
- **8 个摘掉底部导航的视图全部恢复保留导航**——它们不是沉浸式编辑器，只是内容页。这条判断项目自己已经做过一次：`mobile-nav.ts:16-19` 把 `/group` 从 `DETAIL_ROUTES` 移出去，理由写的是"进 /group 就吞掉底栏会形成单向门"。剩下 8 个视图是同一个问题。
- **Android 返回键**：`popstate` 或 `Capacitor App.addListener('backButton')` 二选一。有抽屉/弹层 → 先关层；详情页 → 回列表；主 Tab → 默认行为。
- **就绪条改横向滚动**：自家 `05-响应式规格.md §6` 写的就是"状态条胶囊：横向滚动"，成品在 `ContextReadinessBar.vue:72` 写成 `flex-wrap: wrap` → 69px 两行。改回一行，对话页与群聊页各省 34px。
- **Toast 改贴底部导航上方**：现在 top 12 / bottom 60 压住 56px 页头的 44px。那才是拇指够得着的位置。
- `MoreView.vue:174` 的 72px 死空白删掉；`group-capability-note`（55px 散文）改成首次进入的提示条。

### P1 三笔存量债

按 §5 的 1/2/3 处理。注意第 1 条**不是零风险的机械替换**：那 56 处无兜底引用现在等于"没有这条声明"，给它接上一个真 token 会**让那些颜色第一次生效**，页面外观会变——所以要先看一眼那几个页面（故事引擎 / 社区市场 / 世界书 / 角色编辑）的当前样子，改完再跑一次 `a11y:contrast`，别让新生效的颜色把存量 67 处顶上去。provider 徽章需要给品牌色定一条"作文字时的压深变体"，和之前 `--secondary-text` 同一手法。

---

## 8. 不建议做

- **不要动桌面四栏。** 四栏并置是这个产品桌面形态的价值所在，也是自家原型 `05-响应式规格.md` 的第一条设计依据（"四栏并置是高信息密度创作工具的核心价值"）。手机上做减法，桌面上别做加法。
- **不要重做消息列表的窗口化渲染。** `ChatMain.vue:152` 的窗口 + 分页已经解掉同类项目最贵的性能坑（SillyTavern #5703），`long-history-scroll.spec.ts` 在守。
- **不要为手机重写一套组件。** 继续复用同一个 `Modal`/`EmptyState`/`FilterTabs`，差异全落在 CSS。分叉出 `MobileModal` 会让 9 套皮肤的对比度门禁乘 2。
- **不要把世界书条目编辑做成横向滚动表格。** 用"列表 → 详情页 → 字段分组折叠"（同类在手机上唯一验证过的形状）。
- **不要用鼠标事件测长按。** `onWrapPointerDown` 要求 `pointerType === 'touch'`，鼠标测会误判成缺陷（本次踩过）。要测就用 CDP `Input.dispatchTouchEvent` 或页内合成 `PointerEvent`。
- **不要在 `--keyboard-inset` 上继续扩散消费点。** 先补 P0-3（群聊页自身重排），iOS 真机读数没回来之前不要再加。

---

## 9. 验收

| 改动 | 判据（可自动化） | 载体 |
|---|---|---|
| P0-1 群聊 | 844 下消息区 ≥40%（当前 4%；方案 B2 实测 43%）**且**输入条 bottom ≤ 视口高；群数 1→5 时消息区不下降（当前 103→47→32→32） | 新 e2e 几何断言（受控造数，只改群数） |
| P0-2 设置 | 7/7 分类完整可见且可点（360/390/412 三档） | 新 e2e + 现有 `ux-nav-model` |
| P0-3 键盘 | 视口 390×500 下输入条 bottom ≤ 500（当前 733；方案 B2 实测 456） | 新 e2e（`setViewportSize`） |
| P0-4 焦点 | 抽屉关着：12 次 Tab 无 x<0 停靠点；抽屉开着：Tab 不离开抽屉 | 新 e2e |
| P0-5 触摸目标 | 390/360 两档独立可点元素 ≥44px 比例 ≥90% | 扩 `tmp-mobile-audit.mjs` 成 `e2e/mobile/touch-target.spec.ts` |
| P0-6 横屏 | 844×390 无死预留；底部导航与 rail 只出现其一 | 扩 `e2e/mobile/mobile-layout.spec.ts` |
| P0-7 导航 | `BottomNav` 计数 6→5；**8 个视图**不再摘导航（遍历 `DETAIL_ROUTES` 去重后的 8 个） | `e2e/mobile/mobile-layout.spec.ts` |
| 已有网 | 15.15 挤压扫描保持 0 命中；全站横向溢出 0 | `e2e/mobile/narrow-squeeze.spec.ts` |

---

## 附一：量具与截图

脚本（工作树内，未提交）：`tmp-seed.mjs`（共用件：种数据 + 建手机上下文）、`tmp-mobile-audit.mjs`、`tmp-group-space.mjs`、`tmp-isolate.mjs`（受控实验：只改群数）、`tmp-ls.mjs`（横竖屏受控复测）、`tmp-cards.mjs`、`tmp-hdr.mjs`（单聊页头宽度）、`tmp-feasible*.mjs` / `tmp-floor.mjs` / `tmp-final.mjs` / `tmp-final2.mjs`（**方案 A/B1/B2 对打的证据：它们证明 vh 下限是错的、搬走 chrome 是对的**）、`tmp-chat-probe.mjs`、`tmp-chrome-cost.mjs`、`tmp-stack-cost2.mjs`、`tmp-deep.mjs`～`tmp-deep8.mjs`、`tmp-band.mjs`、`tmp-lp.mjs`。
截图：`artifacts/mobile-audit-390/`、`-360/`、`-1440/`（各 19 张）+ `/tmp/band-*.png`、`/tmp/sheet-*.png`。
建议把 `tmp-mobile-audit.mjs` 的 4 条判据（挤压 / 溢出 / 触摸目标 / 输入框字号）直接升级成常驻 e2e——**触摸目标那条目前全仓没有网**。

**量具的坑（踩过，写下来防复发）**：`onWrapPointerDown` 要求 `pointerType === 'touch'`，用 `mouse.down()` 测长按会得出"手机端长按不可用"的**假缺陷**；CDP `Input.dispatchTouchEvent` 在本机也没产出 touch 类型的 pointer 事件。可靠的测法是页内合成 `new PointerEvent('pointerdown', { pointerType: 'touch', bubbles: true })`。
另外：`dev server` 在本环境的沙箱里会被回收，长脚本要跟启动命令写在同一行（`(npx vite … &) ; sleep 12 ; node …`）。

**两条方法教训**（都是本次自己踩的，比结论更容易复发）：
1. **两个读数打架时不要挑一个。** 群聊消息区先是 103px、后是 32px——原因是我两次改了两个变量（群数 + 成员数）。做受控实验（只改群数）之后才拿到干净的四点序列 103→47→32→32，也才发现"32px 是它的内边距、内容高度是 0"这个真根因。
2. **"量出来一个数"不等于"这个数是对的"。** 我先拍 55vh（错），再量出 40vh（在 844 下成立，于是以为对了），最后做 A/B 对打才发现 40vh 把 500 那档弄坏了——**它只是在一个视口上成立**。凡是给出具体数值的方案，都要**在两个以上极端条件下**验算，而不只是找到第一个不报错的数。

---

## 附二：引用回源核查（2026-10-17）

本文与方案文档大量使用 `文件:行号` 这种**硬引用**，而硬引用会随提交漂移——一旦漂了，下游按图索骥就会找错地方。所以逐条回源核了一遍（**只读，未改产品代码**）。结论：**除两处已就地更正外，全部命中。**

| 引用 | 回源结果 |
|---|---|
| `responsive.css:109`（横屏 56px 死预留）、`:70`（`.composer-btn` 30×30） | 均命中 |
| `tokens.css:152`（`--touch-min: 44px`）、`:155`（`--mobile-nav-h: 56px`） | 均命中 |
| `layout.css:34`（rail 112px）、`:104`（≤900px 收窄） | 均命中 |
| `app-global.css:160-162`（`has-mobile-nav` 归零） | 命中；`App.vue:379-380` 是 class 绑定处，**归零规则确实不在 `App.vue`** |
| `app-global.css:170`（`--mobile-nav-h` 唯一消费点） | 命中，消费方是 `.source-return` |
| `CharacterList.vue:623/624/631/635`（`--touch-min` 4 处） | 均命中 |
| `tokens-structure.css:100`（`--size-control-touch: var(--touch-min, 44px)`） | 命中，**本文 §4 原先漏了这一处**（已更正） |
| `GroupChatView.vue:2772`（群列表 `max-height: 42vh`） | 命中 |
| `GroupChatView.vue:2356-2361`（`.messages-area` = `flex:1; overflow-y:auto; padding:16px 20px`，**无 `min-height`**） | 命中 ⇒ §1.1 的根因判断成立 |
| `GroupChatView.vue:2309`（`.member-remove`）、`:1273`（消息区模板） | 均命中 |
| `ChatMain.vue:49-51`（inert 注释与 props）、`:1033`（inert 只落 `<footer>`）、`:152`（窗口化 slice） | 均命中 ⇒ §2.3 成立 |
| `ChatView.vue:89/92/95`（三个子组件的 inert 条件） | 命中，三个条件与 §2.3 表格逐字一致 |
| `BottomNav.vue:69`（`min-height: 52px`）、`:78`（`font-size: 10px`） | 均命中；Tab 列表来自 `@/core/nav-model` 的 `mobileTabEntries`（与"单一来源"说法一致） |
| `MoreView.vue:174`（72px 死空白） | 命中 ⇒ 方案文档批次 0-5 **尚未实施** |
| `ContextReadinessBar.vue:72`（`flex-wrap: wrap`） | 命中；**完整路径是 `src/components/layout/ContextReadinessBar.vue`**（本文与方案文档都只写了文件名，执行时留意） |
| `mobile-nav.ts:16-19`（`/group` 移出的理由注释）、`:21-31`（`DETAIL_ROUTES`） | 均命中 |
| `community-market.ts:288-300`（模拟登录） | 命中，`login(name)` 确实不收凭据 |
| `keyboard-inset.ts:2-3`、`:14-15`（iOS 无设备可验） | 均命中 |
| `viewport.ts`（"全仓唯一 `matchMedia`"） | 成立，但**表述要修正**：`src/` 内 `matchMedia` 命中 6 处，其中**实际调用仅 2 处**（`viewport.ts:36/37`），`App.vue:65`、`StatusHud.vue:66` 与 `viewport.ts:5/6` 是注释提及；6 处全部落在 `viewport.ts` 内，"唯一"这个结论成立，但"6 处调用"是错的 |
| `mobile-ui-design.md:17/21/69/168/284/290` | 六处全部命中，§4 表格的引用是准的 |
| `05-响应式规格.md:119`（状态条胶囊横向滚动） | 命中；该文档 2XS 段定义在 `:18`、展开在 `:61` |

**两处更正（已落进正文）**：

1. §4 表格 `--touch-min` 引用计数由"2 个文件 6 处"改为 **3 个文件 7 处**（补 `tokens-structure.css:100`）。
2. §2.1 与 P0-2 里"条宽是**固定** 444px"的措辞改为"实测 **444px**，**代码中无此声明**"——`SettingsView.vue:701-711` 的 ≤640 档只把 `.settings-nav-list` 改成 `flex-direction: row`、把 `.settings-nav-item` 设成 `flex: 0 0 auto`，7 个 item 宽度相加即 444。缺的是**收缩约束 `min-width: 0`**。按"去删掉那个 444"去找会找不到；修法本身（补 `width/max-width/min-width`）不受影响，但**根因表述错了会误导排查方向**。

**一处需要在方案文档里补的**（已补）：Tab 6→5 涉及的 `toHaveCount(6)` 断言有**两处**，方案文档 §7 风险 4 原先只写了 `mobile-layout.spec.ts` 一处；实际 `e2e/mobile/mobile-nav-groups.spec.ts:14` 也断言 6——**只改前者会让后者变红**。

### 文件名 → 完整路径速查

本文与两份配套文档大量只写文件名，执行时按这张表找：

| 文中写法 | 路径 |
|---|---|
| `ChatMain.vue` | `src/components/chat/` |
| `ContextReadinessBar.vue`、`CharacterList.vue` | `src/components/layout/` |
| `BottomNav.vue` | `src/components/mobile/` |
| `SettingsModelPanel.vue` | `src/components/settings/` |
| `GroupChatView.vue`、`ChatView.vue`、`SettingsView.vue`、`MoreView.vue` | `src/views/` |
| `nav-model.ts`、`mobile-nav.ts`、`viewport.ts`、`keyboard-inset.ts`、`guided-tasks.ts` | `src/core/` |
| `responsive.css`、`layout.css`、`tokens*.css`、`app-global.css`、`themes.css` | `src/styles/` |
| 导出拒绝明文 key 的逻辑 | `src/services/backup-service.ts:48`（**不在** `src/core/backup.ts`，后者只有类型与 `validateBackup`） |
