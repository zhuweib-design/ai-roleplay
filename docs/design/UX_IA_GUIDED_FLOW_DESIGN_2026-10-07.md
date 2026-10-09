# 交互流程与信息架构优化设计（2026-10-07）

> 议题（用户原话）：当前系统各配置功能模块之间关联不明显，用户不清楚如何操作，且操作过程没有步骤引导。需重新优化交互流程与 UI 界面：建立功能模块间的清晰关联与导航路径；为关键任务提供分步操作引导；简化信息架构、页面布局与视觉层次，降低认知负担。
> 本文档是该议题的**第一交付物**：全面审查 → 设计文档 → 多轮自我评审修订 → 实施。当前版本为 **v3**（v1 经三轮对抗评审重写为 v2；v2 经第 4 轮引用核查修订为 v3；第 5 轮复核 v3 手改结果。五轮评审记录见 §八）。
> 工作分支：`feat/ux-ia-guided-flow`（自 `d34df56` 切出）。证据基线：`d34df56`。

---

## 结论速览（TL;DR）

- **审查范围**：17 条路由 / 16 个视图 / 7 个设置面板文件（含嵌套 `VectorModelPanel.vue`）/ 4 个导航面（`NavRail` `BottomNav` `MoreView` `mobile-nav`）/ 5 个关键对话框入口（新建对话、主密码、API 错误、首启欢迎、向量模型安装）/ **25 条模块依赖边** / 6 条关键任务路径。全部结论以 `file:line` 可复核；引用核查进行了三轮（第 1 轮 249 条、第 4 轮 96 条、第 5 轮复核第 4 轮修订本身），累计纠正 33 + 16 + 7 处，评审记录见 §八。
- **五条根因**：R1 导航是资源平铺而非任务分层（12 + 2 平铺项、无分组无描述、高亮由点击写入而非路由派生）；R2 模块依赖只存在于代码（25 条边中 **11 条不可见**、**6 条可见但不可一跳**、**4 条有 UI 无读者**、**3 条功能不存在**、只有 **1 条可见且可一跳**）；R3 引导仅 1 个静态 4 条描述的弹窗，关闭即永久消失；R4 单面板信息密度失控（设置「模型」一类聚合 ≈60 个控件面（字面标签口径；把 `v-for` 展开的 7 个预设按钮计入则为 66）、17 个 SFC > 1000 行、`.empty-state` 手写 ≥10 份）；R5 命名与状态语义漂移（`nav.archives`=记录 而页面标题=群聊记录；"扩展"面板装的是语音；图片页的"去设置"落在不含所需内容的类）。
- **方案四层**：N 导航模型（单一事实源 `core/nav-model.ts`，12+2 平铺 → 4 组内容项 + 系统项；M2-b7 后为 **12 内容 + 3 系统**）、L 关联层（就绪状态条 + 关联面板 + 命中回显 + 前置条件横幅，全部读同一个 `core/readiness.ts`）、G 引导层（任务注册表 + 任务中心 + `StepFlow`/`EmptyState`/`HelpTip`/`FormField` 原语）、V 视觉与降噪（设置 6→7 类、渐进披露、术语表、巨型视图分区）。
- **改造后可验证的目标**：25 条边 → **17 条转"可见且可一跳" + 4 条撤下无读者 UI + 4 条"显式声明不存在"**（E08 群聊参数与 E18/E21/E23 一并归入声明类，因它们没有可跳目标）；`data-rel-jump` 语义跳转点 9 → ≥26；空态带 CTA 5/12 → 12/12；「模型」类 ≈60 控件面 → 3 类各 ≤25（DOM 实测口径）；6 条关键任务全部具备"动作前给出原因 + 一步可达"的路径。
- **改动分类与边界**：呈现层（P）/ 只读数据（R）/ 状态写入（W）/ 行为（B）四类分别给回滚路径（§5.5）。**不改路由 path、不改 IndexedDB store 结构**；仅在消息类型上增加一个**可选**字段（`promptTrace`，符合 `core/schema-contract.ts` 对可选新增的允许）。不新增功能、不产出 exe/apk。
- **待裁决 11 项 + 已直接决定 7 项**：见 §3.7 与 §3.7.2，每项均已给选项与推荐；其中 D-G（移动端 tab 数）、D-J（trace 范围）为 v1 评审后新增，D-L…D-O 为 v3 为清除正文残留"或"字而定，**D-P 是 M4-a 实施中被证据否定的自我设计**（设置页智能默认落地已回退），**D-Q 是 M2-b3 的 e2e 实测出的新缺陷**（刷新后对话不自动接回，M2-b4 已修），**D-R 是 M2-b4 写接回测试时实测出的数据丢失**（会话归属不校验，已纠偏）。

---

## 〇、审查方法、术语与计数口径

### 0.1 方法

| 项 | 说明 |
|---|---|
| 基线 | `master` = `d34df56`（已含并行会话落地的 D-11 `/more` 聚合页、O-12 只读显式化、O-13 Persona 删净、D-1 市场 URL）。凡与 `docs/dev/REAL_DEVICE_TEST_2026-10-03.md` 旧快照重叠的结论均已重新核对；本文档已纠正该报告中"随机事件无消费者"一处误判（详见 §1.4 E11）。 |
| 手段 | 3 个并行审查（导航与 IA / 跨模块依赖 / 引导资产与复杂度）+ 关键断言逐条直读复核 + 3 轮对抗评审（引用核查 / 逻辑遗漏 / 可行性压力测试）。 |
| 与既有缺陷文档的分工 | `REAL_DEVICE_TEST_2026-10-03.md` 记行为缺陷（D/O/L 系列）；本文档记信息与交互架构问题。§5.6 给出两者的去重与承接关系。 |

### 0.2 术语定义（后文严格按此使用）

| 术语 | 定义 | 判据来源 |
|---|---|---|
| **依赖边** | A 模块的输出/配置影响 B 模块的可观察行为，且该影响由代码实现 | §1.4 每行给出的写点与读点 |
| **可见 / 可一跳** | 可见 = 页面上有陈述该依赖的文字或状态；可一跳 = 从 A 页面一次点击到达 B 页面（或 B 的配置段） | 组件模板 + `data-rel-jump` 属性 |
| **命中（trigger/注入）** | 一轮请求里某条世界书条目/文档段落被写进 prompt | `core/prompt-builder.ts` 返回值 |
| **就绪（ready）** | 一条依赖已满足到"能产生可观察效果"的程度，四态：`ready` / `not-ready(原因码)` / `locked` / `n-a` | `src/core/readiness.ts`（新增，唯一来源） |
| **原因码** | `locked` / `no-profile` / `no-binding` / `channel-off` / `no-model`，用于让多个界面复用同一句话而不会互相矛盾 | 同上 |
| **上游 / 下游** | 上游 = 本页功能所依赖的配置；下游 = 消费本页产物的模块 | §1.4 边方向 |
| **任务卡完成** | 判据读自真实数据（store/消息/开关），**不读**"用户是否访问过页面" | §3.5 `isDone(ctx)` |

### 0.3 计数口径

- **控件面数**：字面标签计数（`<button|<input|<textarea|<select`），`v-if` 分支重复计入 ⇒ **上界**；仅用于横向比较密度，**不作为验收指标**。验收指标改用 DOM 实测（§4 与 §5.5：`tests/ux/control-density.test.ts` 对挂载后可见节点计数）。
- **视图集合（12 个零数据态对象，固定不可漂移）**：`/chat` `/group` `/character` `/worldbook` `/databank` `/archives` `/story` `/random-events` `/local-model` `/image-gen` `/character-version` `/community-market`。
- **行数**：`wc -l`，含 `<style>`，为上界。
- **依赖边编号**：E01–E25，全文（含 §三/§四/§五）按编号引用，不再使用"23 条"这类总数口径。

---

## 一、现有功能的效果与问题

### 1.1 导航现状：平铺、无描述、高亮由点击写入

`src/components/layout/NavRail.vue:22-35` 硬编码 12 项（对话/角色/世界书/群聊/数据银行/故事/随机事件/本地模型/图片生成/角色版本/社区市场/记录），`:37-38` 另加设置与个人中心两项，共 **12 + 2**。

| 现状（可验证） | 问题 |
|---|---|
| 分组唯一依据是 CSS `margin-top:auto`（`NavRail.vue:124-126`），无组标题、无排序逻辑 | 12 个入口在用户心智中是 12 个平行页面，"会话 / 内容资产 / 能力配置 / 档案"四类层级完全丢失 |
| 每项只有图标 + 名称，无一句话说明（`nav.*` `src/i18n/locales/zh.ts:60-74`） | "随机事件""数据银行""角色版本"无法自解释，用户点前不知道点后能得到什么 |
| 激活态来自 `characterStore.currentNav`，**只在点击时写入**（写 `NavRail.vue:41`；读 `NavRail.vue:55`（全仓唯一读者）；定义 `stores/character.ts:56,246`，并出现在 store 返回值 `:629,655`；**从不持久化**），无路由 watcher | 经 `/character/new`、`/character/:id/edit`、深链 `/more` 进入时高亮停在上一入口，"我在哪"线索断裂 |
| `nav.character` 与 `nav.profile` 同为图标 `user`（`NavRail.vue:24,38`） | 两个语义不同的入口共用同一符号，图标失去区分作用 |
| `NavRail.vue:44-46` 的移动端分支是死代码（rail 仅 `!isMobile` 挂载，`App.vue:347`） | 说明"两端导航"长期靠各自硬编码演化，没有共同事实源 |
| 移动端底栏 6 tab（`components/mobile/BottomNav.vue:17-25`；数据源 `core/mobile-nav.ts:10-17` = chat / character-list / **community-market** / worldbook / more / settings）。**底栏的真实门禁是 `App.vue:45` 的 `isMainTab(route.name)`**；同文件里的 `DETAIL_ROUTES` / `isDetailRoute`（`mobile-nav.ts:24-36,44`）**零消费者**（已 grep 证实），其"二级页隐藏底栏"的注释描述并未生效 | 结果仍是 `/group` 无底栏（它不是主 Tab），但机制与文档/注释不一致：**一个无人读取的集合被当成规则在描述**。另外实现与 `docs/design/mobile-ui-design.md` §13.1（`:284`）/§13.5（`:308-313`）的"5 tab"漂移 |

### 1.2 可达性：无 URL-only 孤儿，但 8/17 条路由没有任何页内跳入

| 路由 | 导航入口 | 页内跳入（非导航栏、非"返回"） | 判定 |
|---|---|---|---|
| `/chat` `/character` `/worldbook` `/settings` `/community-market` | rail + 底栏 | 有（§1.3） | 正常 |
| `/group` | 仅桌面 rail；移动端因 `DETAIL_ROUTES` 隐藏底栏 | `NewConversationModal.vue:227`、`ArchivesView.vue:158` | 移动端无一级入口，且进入后无底栏 |
| `/character/new` `/character/:id/edit` | 无（二级页，符合预期） | `CharactersView.vue:121,123,202` | 正常 |
| `/more` | 仅移动端底栏 | 无 | **桌面端无入口**（`NavKey` 无 `more`，`src/types/index.ts:31`）。另有第二个死字段：`MoreView.vue:40` 的 `.active` 恒假——该页渲染的是**其它**路由的入口项，`route.name !== entry.name` 恒成立（与 `NavKey` 无因果关系） |
| `/databank` `/archives` `/story` `/random-events` `/image-gen` `/character-version` `/profile` | rail（除 `/profile` 外亦在 `/more`） | **全无** | 7 条内容路由只能靠导航栏到达 |
| `/local-model` | rail + `/more` | `SettingsModelPanel.vue:35` | 唯一一处 |

⇒ **8 条路由**（上表 7 条 + `/more`）没有任何页内跳入入口；`/profile` 确实出现在 `/more` 的 8 张卡片中（`MoreView.vue:15-24,22`）。

`/more` 是 8 张卡片的无序 2 列网格，`descKey` 声明后从未渲染（`MoreView.vue:35-44`）——"卡片有描述数据但没有描述"。它是 D-11 的产物（`docs/dev/REAL_DEVICE_FIX_2026-10-03.md:83`），解决了"≤640px 无 NavRail 导致这些页面不可达"，但没解决"聚合页本身仍是平铺清单"。

### 1.3 关联现状：跨模块语义跳转 9 处，其中 1 处指向错误页面

排除导航栏与"返回"按钮，全仓跨模块语义跳转共 9 处：

| # | 源 | 目标 | 触发 | 评价 |
|---|---|---|---|---|
| 1 | `CharactersView.vue:137` | `/chat` | 角色卡"开始对话" | 好，但单向（对话页回不到该角色的资产视图） |
| 2 | `NewConversationModal.vue:198` | `/chat` | 新建单聊确认 | 好 |
| 3 | `NewConversationModal.vue:227` | `/group` | 新建群聊确认 | 好 |
| 4 | `ChatMain.vue:73` | `/settings` | API 错误弹窗"去设置" | 全站唯一进设置的路径是**失败之后**，且无返回路径 |
| 5 | `ImageGeneratorView.vue:108-111` | `/settings` | "未配置"提示按钮 | **落点错误**：无 `?cat=` 深链（`SettingsView.vue:24` 恒为 `appearance`），用户被送到"外观"，而图片模型分类在"模型"类里（见 §1.4 E22） |
| 6 | `SettingsModelPanel.vue:35` | `/local-model` | 链接按钮 | 好，但无返回路径 |
| 7 | `StoryEngineView.vue:878` | `/worldbook` | 故事提取结果"查看" | 好，全仓最佳范式 |
| 8 | `StoryEngineView.vue:883` | `/character` | 同上 | 好 |
| 9 | `ArchivesView.vue:158` | `/group` | 归档群聊"回到会话" | 好 |

**用户最需要跳转却完全没有关联的地方**：

- **角色 ↔ 世界书**：绑定用 `<select>`（`CharacterEditorView.vue:1088-1152`）且不链 `/worldbook`；该段被 `v-if="isEditMode"` 门控（`:1089`）⇒ **新建流程里看不到"这个角色要绑世界书"**。反向列表"已绑定角色"（`WorldBookView.vue:986-1016`）渲染头像与名字但**不可点击**；其空态文案 `wb.boundCharsEmpty`（`zh.ts:1856`）"请在角色编辑页的'世界书绑定'区域添加"是**一句没有链接的指令**。
- **数据银行 → 检索生效条件**：`/databank` 全文不提两个前提（E05/E06）。
- **群聊 → 成员角色**：成员只读（`GroupChatView.vue` 成员区），无法跳 `/character/:id/edit`。
- **对话 → 故事 / 随机事件 / 图片生成**：`/chat` 内零入口。
- **版本 → 角色**：入口只在导航栏（`NavRail.vue:32`），角色卡上没有"该角色的历史版本"。
- **设置 → 内容资产**：六个类里没有任何指向 `/worldbook` `/databank` 的链接。

### 1.4 依赖边的可见性：25 条边（E01–E25）

分类：**A 可见且可一跳 / B 可见但不可一跳 / C 不可见 / D 有 UI 无读者 / E 功能不存在**。

| ID | 依赖边 | 写点 / 读点（证据） | UI 表达 | 分类 |
|---|---|---|---|---|
| E01 | 角色 → 世界书绑定 | 写 `stores/character.ts:358-374`；读 `stores/chat-context.ts:55-69` | 下拉选择器（`CharacterEditorView.vue:1088-1152`），无链接 | **B** |
| E02 | 世界书条目 → 本轮命中 | `core/prompt-builder.ts:143-166` 扫描、`:305` 已返回 `activatedEntries`；但 `services/chat-manager.ts:180,279` 的 `onPromptBuilt` 只带 `tokenCount/trimmed/messageCount` | 完全不说 | **C** |
| E03 | 全局范围世界书 → 无条件注入 | `chat-context.ts:63`（全局书无条件进入）；`components/layout/ContextPanel.vue:545-559` 只列绑定书 | 面板显示与实际注入**不一致** | **C** |
| E04 | 文档 → 关键词检索 | `stores/data-bank.ts:227-259` → `core/rag-retriever.ts:210-234` | 一句 `databank.emptyHint`（`zh.ts:748`） | **B** |
| E05 | 文档 → 向量检索开关 | `core/dual-channel-runtime.ts:44` `localStorage['aijiuguan.vectorRagEnabled'] === '1'` ⇒ **默认关**；开关唯一位置 `components/settings/VectorModelPanel.vue`（其 `:4` 注释即"默认关闭"） | 藏在设置第 5 层，`/databank` 不提 | **C** |
| E06 | 文档 → 必须先绑世界书 | `stores/chat-generation.ts:690-692` 以 `(ctx.lorebooks?.length ?? 0) > 0` 作 `staticGate`；`dual-channel-runtime.ts:375` `if (staticGate)` 才查静态通道 | **没有世界书 ⇒ 文档向量永不检索**，而 `/databank` 显示分块成功（`DataBankView.vue:255-320`） | **C（最隐蔽）** |
| E07 | 模型配置优先级 | 解析 `App.vue:170-178,309-320`：锁定 ⇒ null；`character.profileId` > `settings.activeProfile`（`stores/settings.ts:166-168`）。采样：profile 基值 `chat-generation.ts:353-401` → 角色覆盖 `:410-436,721-724` → `applyRuntimeLlmControls`（`:448-530`：采样字段仅在为空时填 `:466-467,479-498`，但 `includeThinkingInHistory:456` / `statusInstructionEnabled:460` / `existingSummary:476` **无条件覆写**）→ preset 最低 `:500-524` | `ContextPanel.vue:39-45,147-199` 有镜像显示，无跳转 | **B** |
| E08 | 群聊 → 忽略角色级模型参数 | `GroupChatView.vue:658`、`stores/group-chat.ts:918` 不读 `profileId` | 角色上设的 temperature/profile 在群聊**静默失效**，页面不说 | **C** |
| E09 | 语音 TTS → 设置"扩展" | `stores/settings.ts:89,641,1015` → `SettingsExtensionPanel.vue:28-71` → `ChatMain.vue:608-643`（门控 `:625`） | 失败只弹 toast `chat.ttsDisabled`（`zh.ts:212`"请在设置页配置"），无链接 | **C** |
| E10 | 随机事件 → 场景名必须等于角色名 | `chat-generation.ts:1306` + `stores/random-events.ts:245` | 字符串耦合，界面无处说明；**改名即断链** | **C** |
| E11 | 随机事件 → 对话注入 | `chat-generation.ts:795,1296-1399` → events store（`:1387`）→ `chat-context.ts:183-188` 下轮注入 | 生效但对话里无任何"本轮来了随机事件"的痕迹 | **C**（**注**：早先测试报告判为"零消费者"不成立，本文档已纠正） |
| E12 | 世界书条目 → 随机事件开关 | UI `WorldBookView.vue:1565-1595`，类型 `core/lorebook.ts:87-92` | 零读取点 | **D** |
| E13 | 随机事件 → 绑定世界书 | 写 `RandomEventsView.vue:177,497-511`，类型 `core/random-event-generator.ts:381` | 零读取点 | **D** |
| E14 | 故事 → 世界书 / 角色 / 事件 | `core/story-importer.ts:530-562,269-345,351-410`；目标书选择 `StoryEngineView.vue:1432-1440`；结果行 `:878,883` 可跳 | 有 + 可跳 | **A**（唯一一条） |
| E15 | 故事 → 对话 | 读 `chat-context.ts:171-178`；唯一写点 `components/story/StoryTimeConfigPanel.vue:67-79` | 有选择器，无跳转 | **B** |
| E16 | 故事 `boundWorldBookId` | 写者 `StoryEngineView.vue:783-789`（`handleBindWorldBook`，由 `:1136-1150` 的 select 在 `:1140` 调用）；展示 `:776-781`；**运行时零读取** | 有 UI 有写入，无行为 | **D** |
| E17 | 群聊 → 成员角色 | `core/group-chat-prompt.ts:29-31`（prompt 只含名字与成员表） | 成员可见但不可点编辑 | **B** |
| E18 | 群聊 → 世界书 / RAG / 故事 / 状态指令 | 无代码 | 单聊与群聊共用"角色"概念，用户必然假设一致 | **E** |
| E19 | 版本 → 哪些角色被跟踪 | 仓库按需创建 `stores/character-version.ts:162-196`；手动快照 `:278-328` | "已跟踪"无处可查，入口只在 rail | **C** |
| E20 | 市场 → 角色安装 | 安装落 `charStore.characters.push`（`stores/community-market.ts:454`）；`core/community-market.ts:561-584` 的 `downloadCard` 只记交易与计数 | 装完不提示"已进角色列表"，不可跳 | **B** |
| E21 | 市场 URL → 运行期配置 | 仅 build-time env（`core/market-index.ts:80-84`），设置内无该项 | 与提交信息"D-1 市场 URL 可配"口径不同（可配 = 环境变量），需在实施时与产品确认 | **E** |
| E22 | 图片生成 → 模型配置 | 图片页用独立 `store.providerConfig`（`stores/image-generation.ts:45,89`，UI 绑于 `ImageGeneratorView.vue:492-540`）；设置里确有 `category='image-video'` 分类（`SettingsModelPanel.vue:472-495,985-995`，类型 `types/index.ts:213,225`），但 `getPrimaryModel('image-video')` 的**唯一读者是设置页自己**（`SettingsModelPanel.vue:490`；`stores/settings.ts:541`） | 两处都能配图片模型，互不相通；`providerConfig` 无持久化白名单（`stores/settings.ts:995-1035` 无 imageGen 键）⇒ **刷新即丢**（含 apiKey） | **C（双重）** |
| E23 | 图片生成 → 对话消息 | 产物只进图库（`stores/image-generation.ts:109-117`，`persistImage` 在 `:115`；`core/image-generation.ts:110-117` 是 `GenerationProgress` 接口）；消息无附件字段 | 无处不提示"图不会进对话" | **E** |
| E24 | `tokenBudget` → 上下文面板 | 写点仅初始化（`stores/character.ts:278,600`、`CharacterEditorView.vue:301`、`services/type-adapters.ts:244`、`src/data/mock-data.ts:31,101,122,143`）；`ContextPanel.vue:83-120,502-541` 当实时数据渲染 | 进度条恒 0、"剩余 8192"恒不变 ⇒ **界面上说谎** | **C（假显示）** |
| E25 | 文档 chat 作用域 | store 与 `activeChatId` 支持（`stores/data-bank.ts:67,164,210-213`、`chat-generation.ts:210,1252`），列表段虽已实现（`DataBankView.vue:337-345`，computed `:49`）但整段被 `v-if="chatDocuments.length > 0"` 门控，而上传对话框只提供全局/角色两档（`:412-431`），检索管线又硬编码 `scope='character'`（`chat-context.ts:163-167`） | **三重不可达**：没有入口能产出 chat 域文档，列表面板也就永远不会出现 | **D** |

**分类合计（按表逐行）**：A **1** · B **6** · C **11** · D **4** · E **3** = 25。

#### 1.4.1 后测复评（逐行，与代码同版本；截至 M3-b 第一批）

口径不变：**A** = 界面上看得见且一步跳得过去；**撤下** = 无读者的控件已从界面移除；**声明** = 能力不存在，界面上明说；**未覆盖** = 仍是前测那一类。

| ID | 前测 | 后测 | 依据（哪一批、在哪看） |
|---|---|---|---|
| E01 角色 ⇄ 世界书绑定 | B | **A** | 角色编辑页关联面板 + 世界书页"已绑定角色"可点回（M2-a / M2-b5） |
| E02 世界书条目 → 本轮命中 | C | **A** | 助手消息下方注入痕迹，条目名可跳来源书（M2-b2/b3） |
| E03 全局书 → 无条件注入 | C | **A** | 上下文面板改读 `collectLorebooksForCharacter`，全局书列出并标"全局生效"，可点进该书（本批） |
| E04 文档 → 关键词检索 | B | **A** | 就绪条"文档检索"芯片 + `/databank` 前提清单（M2-a） |
| E05 文档 → 向量检索开关 | C | **A** | 芯片跳「检索」类，开关状态与两个前置在界面上（M2-a） |
| E06 文档 → 必须先绑世界书 | C | **A** | `/databank` 顶部 `PrereqNotice` 逐条"去完成"（M2-a） |
| E07 模型配置优先级 | B | **A** | 就绪条模型芯片 + 面板显示"实际生效的那个 Profile"（M2-a） |
| E08 群聊忽略角色级参数 | C | **声明** | `group.capabilityNote` 页头明示（M2-b4） |
| E09 语音 TTS → 设置「扩展」 | C | **A** | 语音芯片带原因与跳转（M2-a） |
| E10 随机事件 → 场景名必须等于角色名 | C | **A**（M4-b4） | `/random-events` 挂上 `PrereqNotice` 三行前提；场景名与当前角色名不一致时给一跳（进该角色的编辑页，带回程）。判定集中在 `readiness.ts` 的 `useRandomEventPrereqs`，界面不再自行推断 |
| E11 随机事件 → 对话注入 | C | **A**（M6-c） | 气泡底部“本轮带入 N 条随机事件”回显，展开列事件名并可跳 `/random-events`（带回程）；痕迹与消息一起持久化，只带标识不带正文 |
| E12 / E13 / E16 / E25 | D | **撤下** | 四条死控件已从界面移除（M2-b1） |
| E14 故事 → 世界书/角色/事件 | A | **A** | 前测唯一一条，未动 |
| E15 故事 → 对话 | B | **A**（M4-b4） | 聊天顶栏的故事时间由只读文本改为按钮，一跳 `/story?story=<id>` 并带回程；故事引擎只认 `stories` 里真实存在的 id |
| E17 群聊 → 成员角色 | B | **A** | 成员名可点进编辑并带回程（M2-b6） |
| E18 群聊 → 世界书/RAG/故事/状态指令 | E | **声明** | 同 `group.capabilityNote`（M2-b4） |
| E19 版本 → 哪些角色被跟踪 | C | **A** | 角色卡"已跟踪"标记，点进该角色版本历史（带 `?char=`）；为此把版本快照加载提到启动（本批） |
| E20 市场 → 角色安装 | B | **A** | 安装结果条带角色名与两个去路（M2-b6） |
| E21 市场 URL → 运行期配置 | E | **声明**（M4-b4） | 市场页头一行可见文字：索引地址只在构建期由 `VITE_MARKET_INDEX_URL` 提供、运行期不可配置，并连同当前值一起显示，claim 可核对 |
| E22 图片生成 → 模型配置 | C（双重） | **A** | `imageGenConfig` 进持久化白名单（密钥按主密码加密、解锁同批解密）+ 与「模型接入 · 图像/视频」互填 + "去设置"带 `?cat=model`（本批） |
| E23 图片生成 → 对话消息 | E | **声明** | 图片页页头"产物只存进画廊，不会进入对话消息"（本批） |
| E24 `tokenBudget` → 上下文面板 | C（假显示） | **A** | 真实 token 用量替换假预算条（M2-b2） |

**后测合计（M6-c 后）**：A **17** · 撤下 **4** · 声明 **4** · 未覆盖 **0** = 25 —— §四 的口径目标（17 转 A + 4 撤下 + 4 声明）就此对齐。

> 与 §四 目标口径（"17 转 A + 4 撤下 + 4 声明"）的差 **3 条**，全部来自同一处失算：目标把"给 `/random-events`、`/local-model` 挂 `PrereqNotice`"与"市场 URL 的显式声明"算进了已完成，实际只挂了 `/databank` 一处。这 3 条已登记为 §七 的续期项，不改口径数字来凑达标。
用户"不知道模块之间怎么关联"不是主观感受，而是可测量事实：**25 条边里只有 1 条做到可见且可一跳**。
> **后测更新（M2-b1）**：D 类四条（E12 / E13 / E16 / E25）对应的控件已**从界面上撤除**，"配了没反应"这一类误导不再存在；数据层字段暂留（撤 UI 与改数据契约分两件事，见 §七 #6）。因此实际后测分布为 A 目标 17 条中已完成若干（逐行见 §九 M2-a 与 M2-b1 的复评表）。

### 1.5 引导现状：一个静态弹窗 + 一个向导 + 不一致的空态

| 资产 | 现状 | 问题 |
|---|---|---|
| `components/common/OnboardingModal.vue:12-17` | 首启显示 4 条功能描述（角色/对话/世界书/API），底部 1 个按钮（`:52-54`），无步骤无进度、**不使用 router**、无深链 | 不覆盖 12 个 rail 目的地中的 8 个；`close()`（`:19-24`）把点 X 也记为完成 ⇒ 全站无重开入口（设置里也没有） |
| 触发链 | `utils/onboarding.ts:3,6,15` 读写 `localStorage['ai-roleplay:onboarding-done']`；`App.vue:299-301` 触发（主密码弹窗期间跳过）、`:374` 挂载 | E2E 预置该键绕过（`playwright.config.ts:24`，`e2e/storage-state.json`）——连测试都把它当噪声 |
| 唯一真分步组件 | `NewConversationModal.vue:259-264`（步骤标记；`:254` 是 Modal 的 `aria-label`。文案键 `newConv.wizardAria` `zh.ts:347`、`stepType/stepSelectChar` `:348-350`，渲染在 `:263`） | 只有"新建对话"享受向导；建角色、配世界书、开 RAG、接本地模型全无 |
| 向导词汇已备好却闲置 | `common.optional`(`zh.ts:27`)、`common.tips`(`:36`)、`common.next/prev/finish/step`(`:54-57`) 在 `src/i18n`、`tests/`、`scripts/` 全域零引用（已复核） | 文案资产在，缺承载它的组件与状态机 |
| 空态（固定 12 视图集合，§0.3） | **有 CTA 的 5 个**：`/worldbook`（`WorldBookView.vue:909-913,920-925,1308-1312`）、`/group`（`GroupChatView.vue:941-951,959-964`）、`/databank`（`DataBankView.vue:216-224`，全仓最佳：图标 + 自动检索解释 `zh.ts:748` + 上传按钮）、`/story`（`StoryEngineView.vue:951-962`，含 `story.uploadFirst`）、`/archives`（`ArchivesView.vue:312-323`，无匹配分支有 `clearFilters` 链接） | 其余 7 个无 CTA：`/character`（`CharactersView.vue:540-546` 文案说"点击新建或导入"却不放按钮）、`/random-events`(`:356,407,635`)、`/character-version`(`:533,611,683`)、`/image-gen`(`:405,475-479`)、`/local-model`(`:359-362,409-411,461-463` 裸 `<p>`)、`/community-market`（`:572,638` 登录门 + 7 种空态含 `.empty-mini`）、`/chat`（**无零角色分支**：`ChatView.vue:72-94` 无条件三栏，`ChatMain.vue:93` 直接 `currentCharacter!`；`:926-950` 的"无消息"态另算） |
| 样式重复 | `.empty-state` 在 ≥10 个 SFC 各写一份（`CharactersView:989`、`DataBankView:635`、`WorldBookView:1849`、`GroupChatView:1702`、`StoryEngineView:1928`、`LocalModelView:1160`、`ImageGeneratorView:1098`、`RandomEventsView:1032`、`ArchivesView:674`、`CharacterVersionView:1357`） | 无 `EmptyState` 组件，空态质量随文件漂移 |
| 字段提示分布 | `.field-hint/.form-hint` 81 行（去 CSS 规则后模板用法 65 处）、`title=` 71、`placeholder` 95、`aria-label` 371；**最佳范式** `CharacterEditorView.vue:872-876,894-899`（`v-if="errors.x" class="field-error" role="alert"` / `v-else class="field-hint"` + `aria-describedby`），文案确有解释力（`zh.ts:1722` temperature、`:1724` maxTokens"留空则跟随当前 Profile"） | 无 `?` 帮助图标、无 Tooltip 组件；`title=` 只对鼠标可达 |
| 提示缺失的具体字段 | **检索参数无 UI**：`RAGConfig`（`core/data-bank.ts:71-80` = `maxChunks/depth/recentMessageCount/maxKeywords`）没有任何视图传入（`chat-context.ts:163-167` 调用不带 config）；分块大小与相似度阈值分别在 `document-chunker` 与 `VectorRagOptions` 里，同样不可调 | 用户无法理解"为什么没检索到"，也无法调 |
| 提示存在但不足 | 世界书正则键：标签已告知"支持正则 /pattern/flags"（`wb.keysLabel` `zh.ts:1929`，渲染 `WorldBookView.vue:1406`），但 `lorebook-scanner.ts:44-56` 在正则非法时**静默降级为文本匹配**——写错 pattern 的用户得到的是"看起来生效其实按字面匹配" | 缺的是**失败反馈**，不是缺说明 |
| 已存在但语义不足的提示 | 状态指令**有** hint（`ContextPanel.vue:753` 渲染 `status.instructionHint` = `zh.ts:285`），但没说明它可被 preset 覆盖（`core/creation-preset.ts:162-164`）以及设置里是只读行（`SettingsModelPanel.vue:924-932`） | 覆盖关系不可见 |
| 必填/选填 | 角色编辑器只有 **1 个星号**（`CharacterEditorView.vue:607`）+ `charEdit.saveDisabled`（`zh.ts:1688`） | 6 个 fieldset（`:602,687,832,904,1050,1089`）、23 label、17 输入 + 4 textarea + 3 select + 21 按钮，用户无法判断哪些可跳过 |
| 定位辅助 | 无面包屑（全仓零命中）、无全局搜索、无命令面板、无快捷键表（仅 `Escape` 关抽屉 `ChatView.vue:44-48`、tablist 方向键 `SettingsView.vue:53-81`、Modal 焦点陷阱 `Modal.vue:95`）；**12 个视图**有"标题 + 返回"（`grep window.history.state?.back src/views`），`ChatView` `SettingsView` `CharacterEditorView` `MoreView` 无页头；位置仅在 `document.title`（`router/index.ts:118-121`） | "我在哪 / 怎么回去"在四类页面无答案 |
| 反馈通道 | `utils/toast-service.ts:22-38`：3 类纯文本、**队列同时只显 1 条**（`:33` 取 `[0]`、`:38` shift）、5 秒自消失（`Toast.vue:26`）、无操作链接；`showToast(` 调用 283 处 | 唯一结构化的可导航错误是 `ApiErrorModal.vue`：建议块 `:163-177` + 重试/去设置按钮 `:189-204`。其余如 `chat.errUnknown`（`zh.ts:2778`）为"生成失败：{error}"裸文本；`lm.noModels`（`:1314`）把"没有模型"和"筛选无结果"混为一句 |

### 1.6 六条关键任务的真实路径

| 任务 | 现状路径 | 卡点（证据） |
|---|---|---|
| A 发出第一条消息并收到回复 | 设置→模型（baseURL/key/model）→ `/character` 新建 → 保存 → `/chat` | 发送前只有被动徽标"未配置"（`ChatMain.vue:746`，`zh.ts:236`）无解释无链接；原因要等失败后由 `services/chat-error.ts:68-80` 生成。首启引导从没说过"要先配 API" |
| B 从零创建角色 | 1 屏、6 fieldset、23 label、1 必填 | 无分组说明、必填标记无规律；世界书段 `v-if="isEditMode"`（`CharacterEditorView.vue:1089`）⇒ 新建时看不到绑定 |
| C 让世界书影响回复 | 建书 → 加条目 → 选策略 → 编辑角色 → 绑定 → 对话（3 屏 4 跳） | 发送前无触发预览；发送后无命中回显（E02/E03） |
| D 让上传文档被检索 | `/databank` 上传 → 选作用域（`:412-431`，只有全局/角色两档） | 分块显示成功，但向量默认关（E05）+ 无世界书则静态通道根本不查（E06）⇒ **零效果零提示** |
| E 让语音朗读工作 | 设置→**扩展**（名字不含语音）`:26-48` → 回 `/chat` 点气泡（`MessageBubble.vue:61`） | `chat.ttsDisabled`（`zh.ts:212`）说"去设置页配置"却不给跳转（E09） |
| F 接本地模型 | `/local-model` 5 个 tab（`:260,367,416,493,534`）→ 筛选 chips（`:266-299`）→ 加载 | 加载按钮 `:disabled="!store.isAvailable \|\| store.isLoading"`（`LocalModelView.vue:340`）**不说明为什么不能点**；加载成功后还必须再去设置选中（E22 同类问题） |

### 1.7 命名与语义漂移

| 术语 | 现状 | 冲突 |
|---|---|---|
| 记录 / 群聊记录 | `nav.archives` = 记录（`zh.ts:71`）vs `router.archives`(`:123`) 与 `archives.title`(`:478`) = 群聊记录 | 导航说"记录"，进去只有群聊；单聊的 `archived` 旗标（`CharacterList.vue:91-93,229,268`；`stores/chat-session.ts:84-91`）与该页无关（O-19 修复后"可感知"了，但用户仍会在错误的页面找它） |
| 世界书 / 当前世界用户资料 / 数据银行 | `ctx.worldTitle`(`zh.ts:538`)、`ctx.worldUserProfileTitle`(`:518`)、`nav.databank` | 三个名字三张页面，喂同一个 prompt 槽位 |
| 作者笔记 / 状态指令 / `[设定]` | `ctx.authorTitle`(`:542`)、`status.instruction`(`:284`)、`[设定]` 前缀（`dual-channel-runtime.ts:410`） | `authorNote` 与 `characterNote` 是同一对象两个名字（UI 写 `ContextPanel.vue:169-172`，持久化为 `characterNote.text`） |
| 扩展 | `settingsView.categoryExtension` = 扩展（`zh.ts:2160`），描述 `categoryExtensionDesc`（`:2161`）"扩展系统与快捷功能" | 面板内容是 TTS / 翻译 / 摘要；真正的扩展加载器 `core/extension-loader.ts` 没有任何面板 |
| 图片模型 | 设置里的 `category='image-video'`（E22）vs 图片页自己的 `providerConfig` | 同一个能力两处配置，互不读取 |
| 随机事件 | 导航页 / 世界书条目开关（E12）/ 故事事件面板（`WorldBookEventsPanel.vue`）三处 | 只有第一处驱动引擎 |
| 本地模型 | `/local-model` 页 vs 设置→模型 vs `provider==='local'`（`api/index.ts:39-45`） | 一个概念三个名字；"加载了"与"选中了"是两步且无衔接 |
| 个人中心 `/profile` | 92 行静态卡 + 一个"登录不可用"面板（`ProfileView.vue:50-65`，`profile.loginUnavailable` `zh.ts:462`），零 store 读写 | 自身文案就说扮演身份在世界书；却占用 rail 底栏 + `/more` 卡片（`MoreView.vue:22`）两个入口，与 `SettingsAboutPanel` 概念重叠 |

### 1.8 负担量化（改造前基线）

| 指标 | 现状值 | 口径 |
|---|---|---|
| 桌面 rail 项 | 12 内容 + 2 底部 = 14，全平铺 | `NavRail.vue:22-38` |
| 跨模块语义跳转 | 9（其中 1 处落点错误） | §1.3 |
| 依赖边分类分布 | A1 / B6 / C11 / D4 / E3（共 25） | §1.4 |
| 无页内跳入的路由 | 8 / 17 | §1.2 |
| 设置：类别与控件面 | 6 类；7 个面板文件字面标签合计 **67 button + 46 input + 1 textarea + 11 select** | 0.3 口径 |
| 最重设置类 | 「模型」= `SettingsModelPanel.vue`(2509 行，36 控件面) + 父视图内联上下文段(`SettingsView.vue:169-227`，2 数字输入 + 1 个 `v-for` 按钮，展开为 7 个预设) + 嵌套 `VectorModelPanel.vue`(1000 行，21 控件面) = **60 控件面（字面标签）/ 66（按 v-for 展开）/ 6 段** | 同上（两种口径都给出，避免歧义） |
| 默认进入的设置类 | `appearance`（`SettingsView.vue:24`）⇒ 最阻塞的「模型」不是默认落地 | — |
| 控件最密的视图 | 世界书 61（v2 记 59，见 §9-M2-b1 的口径校正）/ 角色编辑 45 / 故事 43 / 群聊 41 / 角色版本 38 / 市场 37 | 同上 |
| SFC > 1000 行 | 17 个（最大 `StoryEngineView.vue` 3360；`VectorModelPanel.vue` 恰 1000） | `wc -l` |
| i18n 键 | 每语言 3016 键（`zh.ts`/`en.ts` 各 3169 行）；未被引用 209（6.9%），聚簇 `settingsView` 41、`common` 40、`store` 24、`mktIndex` 15、`masterPwd` 12、`persona` 12、`preset` 9 | grep `src`/`tests`/`scripts` |
| 空态带 CTA | **5 / 12**（固定集合见 §0.3） | §1.5 |
| `.empty-state` 样式副本 | ≥10 份手写 | §1.5 |
| 角色编辑器必填标记 | 1 个星号 | `CharacterEditorView.vue:607` |
| 移动端底栏 | 6 tab，`DETAIL_ROUTES` 含 `group`（进入即无底栏） | `mobile-nav.ts:10-17,27` |

---

## 二、修改原因

### 2.1 按根因论证

- **R1 导航平铺（§1.1–1.2）**：14 个平铺项把"内容资产""能力配置""档案"压在同一层，用户每次都要重读 14 个名字来判断该点哪儿；高亮由点击写入而非路由派生，进一步剥夺定位线索。不改的代价：新增页面只能继续平铺，`/more` 会继续长成第二个平铺清单（它今天已经是 8 张无序卡片）。
- **R2 依赖隐藏（§1.4）**：这是"关联不明显"的技术实质。25 条边只有 1 条做到可见可跳。更严重的是三类混淆被混在一起：功能正确但界面不可见（E02 的 `activatedEntries` 已算出却不下传）、功能根本没接（E12/E13/E16/E25 四条有 UI 无读者）、以及**反直觉隐藏耦合**（E06：无世界书 ⇒ 文档向量永不检索，而文档页显示"分块成功"）。用户得到的经验是"我配了但它不生效，也不知道为什么不生效"——这类经验的累积等价于产品口碑损耗。
- **R3 无引导（§1.5–1.6）**：唯一引导是 4 条静态描述且关闭即永久消失；6 条关键任务里 5 条的前置条件只在失败后才可见（`ChatMain.vue:73` 是全站唯一"去设置"路径，且由错误弹窗驱动）。产品已发 1.0.0、仓库已公开（`d34df56`），每个新用户的第一个会话都要走这条路，引导缺口的成本随用户数线性增长。
- **R4 密度失控（§1.8）**：一类 6 段 60 个控件面（`v-for` 展开后 66），而默认落地在不承担阻塞的「外观」；17 个 >1000 行 SFC 使任何局部改动都可能牵动无关分支。这与"降低认知负担"直接冲突，也拖慢后续迭代。
- **R5 语义漂移（§1.7）**：命名不一致会让用户建立**错误但自洽**的心理模型（"记录里应该能找到我归档的会话"），错误模型导致的重复操作比界面简陋更耗人。`/profile` 与"扩展"面板属于**入口债务**：占着导航位置却不提供能力。

### 2.2 为什么不能只"加文案"

1. 文案机制已足够多（65 处模板 hint、95 处 placeholder、371 处 `aria-label`），但 `databank.emptyHint`（`zh.ts:748`）把不成立的事说得很大方——"对话时 AI 会自动检索相关内容"，而向量通道默认关（E05）且无世界书根本不查静态通道（E06）。**缺的不是句子，是与句子对应的结构事实（状态、开关、跳转）。**
2. 六个向导词（`common.next/prev/finish/step/optional/tips`）全域零引用——过去打算做引导但没有承载它的组件与状态机。**缺的是容器。**
3. 四条"有 UI 无读者"字段加多少提示都不会生效，必须在"接通"与"撤下"之间做结构决策（见 D-E）。

### 2.3 为什么现在做、按此顺序

- 并行会话已落地 `/more` 聚合页（D-11）与 O-12/O-13，本议题的前置阻塞解除：分层导航有了承载处，Persona 删净后术语统一无历史包袱。
- 顺序按"风险递增、收益前置"：M1 纯呈现 → M2 关联（只增只读展示与跳转）→ M3 引导（新增状态机与组件）→ M4 密度重构（拆分巨型文件，回归面最大，且必须在关联骨架就位后才拆，否则拆完仍看不出关联）。
- 两处只读数据改动（E02 的 `activatedEntries`、E24 的 `tokenBudget`）放 M2：它们是"关联可见"的数据前提，且可独立回滚。

### 2.4 不修改的可观察后果

| 后果 | 触发场景 | 证据 |
|---|---|---|
| 用户认定"文档检索坏了" | 上传后对话无引用 | E05/E06 |
| 用户在两处配图片模型、两头都以为没配 | 图片页点"去设置"落到"外观" | E22 + `ImageGeneratorView.vue:108-111` |
| 图片 API key 每次刷新重填 | `providerConfig` 无持久化 | `stores/settings.ts:995-1035` |
| 角色改名后随机事件静默停摆 | `sceneName === character.name` | E10 |
| 上下文进度条被当 bug 提交 | 恒 0 却渲染为实时 | E24 |
| 群聊里角色级采样参数"设了没用" | 群聊不读 `profileId` | E08 |
| 想重看引导只能改 localStorage | 关闭即永久 | `utils/onboarding.ts:15` |
| 新用户首屏空壳 | `/chat` 无零角色分支 | `ChatView.vue:72-94` |
| 写错世界书正则后按字面匹配，且无告警 | 非法 pattern 静默降级 | `lorebook-scanner.ts:44-56` |

---

## 三、修改方案

### 3.1 设计原则（五条，作为一切取舍判据）

| # | 原则 | 落实方式 | 否决的做法 |
|---|---|---|---|
| P1 | 任务优先于资源 | `core/nav-model.ts` 单一事实源 + 4 组 | 只改颜色/顺序 |
| P2 | 依赖必须可见且可跳 | 就绪条 + 关联面板 + 命中回显 + 前置横幅 | 只加 tooltip 却不给跳转 |
| P3 | 前置条件在动作**之前**反馈 | 发送/上传/加载前先查 `readiness` | 只美化报错弹窗 |
| P4 | 渐进披露 | 设置拆类 + `Collapse`；DOM 实测可见控件 ≤25 | 靠删功能降噪 |
| P5 | 单一事实源 | nav-model / glossary / `core/readiness.ts` / guided-tasks / `EmptyState` 各一处 | 各视图继续复制样式与状态判断 |

### 3.2 N 层：导航模型（M1）

1. **新增 `src/core/nav-model.ts`**：导出 `NAV_ENTRIES`，每项含 `id`、`labelKey`、`descKey`、`icon`、`routeName`（**注意：三个渲染器都按路由 name 匹配，而 name ≠ path**，如 `/character`→`character-list`，`router/index.ts:18-19`）、`activeWhen`（该入口应高亮的**路由 name 列表**，解决 `/character` 是 `/character-version` 前缀的误匹配）、`group`、`mobileTab?`、`inMore?`、`order`。`NavRail.vue`、`BottomNav.vue`/`core/mobile-nav.ts`、`MoreView.vue` 改为全部由此渲染，删除各自硬编码清单（`NavRail.vue:22-38`、`mobile-nav.ts:10-36`、`MoreView.vue:15-24`）。
2. **四个内容组**（13 项）+ **2 个系统项**：
   - 对话：`/chat`、`/group`（2）
   - 创作：`/character`、`/worldbook`、`/databank`、`/story`、`/random-events`（5）
   - 能力：`/settings`、`/local-model`、`/image-gen`（3）
   - 档案：`/archives`、`/character-version`、`/community-market`（3）
   - 系统项（不入组，固定底部）：引导（新）、`/more`（桌面补入口）。
   计数口径统一表述为"**13 内容项 + 2 系统项**"，不再说"12 + 2"。
   > **M2-b7 修订**：设置从「能力」组移入系统项，社区市场从「档案」组移入「创作」组，现口径为 **12 内容项 + 3 系统项**（引导 / 更多 / 设置）。§八 与 §九 M1-a 里保留当时的数字，那是历史事实。
3. **激活态改为路由派生**：`computed` 读 `route.name` ∈ `entry.activeWhen`；删除 `characterStore.currentNav`（写 `NavRail.vue:41`、读 `NavRail.vue:55`、定义 `stores/character.ts:56,246`、store 返回值 `:629,655`；该字段从不持久化，因此删除无数据迁移成本），并同步更新唯一测试读者 `tests/stores/character.test.ts:170-173`。`/more` 高亮"更多"系统项（它不属于任何组，无数据来源也不硬造来源）。
4. **对话工作区**：`/chat` 与 `/group` **两端页头**加"单聊 / 群聊"分段控件（`SegmentedControl.vue`，`router-link` 方式），并把 `group` 从 `DETAIL_ROUTES`（`mobile-nav.ts:27`）移出，使群聊页也保留底栏 ⇒ 消除现状的"单向门"。**不做视图嵌套**：`GroupChatView.vue:958` 与 `ChatMain.vue:731` 都输出 `id="main-content"`，且 `ChatView.vue:19,26-36` 有滚动锁与 `inert`，嵌套会破坏 skip-link/焦点目标（`App.vue:326`），因此仅做路由间链接（D-A）。
5. **移动端 tab 集合保持 6 不变**（对话/角色/市场/世界/更多/设置）：现状 `MAIN_TABS` 含 `community-market`，若为凑"5 tab"删掉它，将把"市场"变成移动端不可达——正是 §1.2 指责的缺陷。因此**反过来把设计文档 §13 回写为 6 tab**（D-G）。
6. **`/more`**：按组分区渲染、`descKey` 必须真渲染（修 `MoreView.vue:35-44` 死字段与 `:40` 恒假 `.active`）、顶部挂任务中心、补页头与返回；`types/index.ts:31` 的 `NavKey` 增 `more` 与引导项。
7. **图标与页头**：`profile` 若保留则换图标（与 `character` 的 `user` 区分）；`ChatView` `SettingsView` `CharacterEditorView` `MoreView` 补统一页头（组名 + 标题 + 一句话职责 + 返回），返回沿用现有 `window.history.state?.back` 范式（12 个视图已在用）。不引入面包屑（层级只有两层，"组 + 标题 + 返回"已足够；见 §七 #2）。

### 3.3 L 层：关联可视化（M2）

**先建唯一事实源 `src/core/readiness.ts`**：输入角色/会话/store，输出 `{ chipId, state: 'ready'|'not-ready'|'locked'|'n-a', reasonCode, targetRoute, labelKey }[]`。四个展示面只能消费它，不得各自判断——这是防止"就绪条说不配置、横幅说要绑书、面板显示已生效"三者打架的唯一手段。要点：

- 模型 chip **复用** `checkSendBlock()`（`stores/chat-generation.ts:593-600`，经 `stores/chat.ts:94` 再导出），它已正确区分 `'locked'` 与 `'no-profile'`；D-10 的误报来自重生成路径（`chat-generation.ts:1001-1003` 在 `chatManager` 为 null 时写 `char.noApiProfile2`，而锁定时 `App.vue:170-178` 返回 null 且 `:317-321` 不清），因此就绪判定必须读 **存在性**（`settings.apiProfiles/activeProfile`）与 **锁态**（`hasMasterPassword && !isUnlocked`）两个事实，而不是读错误文案。
- 向量开关 chip 现状不可响应：`isVectorRagEnabled()` 是非响应式 localStorage 读（`VectorModelPanel.vue:276` 只在挂载时镜像）。新增一个 `stores` 级镜像 + `storage` 事件订阅，否则 chip 会陈旧。
- 状态指令 chip 必须考虑 preset 覆盖（`core/creation-preset.ts:162-164`），否则原始字段会谎报。

| 组件（新增） | 出现位置 | 内容 | 消灭的边 |
|---|---|---|---|
| `layout/ContextReadinessBar.vue` | `/chat` `/group` 页头 | 5 个 chip：模型 / 世界书 / 文档检索 / 语音 / 状态指令；每 chip 显示状态 + 原因 + 一步跳转 | 覆盖 **E01 E03 E04 E05 E06 E07 E09 E22**（E02/E03 的命中回显由 `PromptTraceSummary` 负责，E08/E18 由群聊页头声明负责） |
| `layout/ModuleRelationsPanel.vue` | 角色卡 / 角色编辑 / 世界书 / 数据银行 / 随机事件 / 版本 / 图片 / 市场 | 上游依赖 + 下游消费者，每项可点跳转 | E01/E10/E17/E19/E20 |
| `chat/PromptTraceSummary.vue` | 每条助手消息底部（折叠） | **v1 仅世界书命中**：条目名 + 匹配键（不含正文），可跳来源书 | E02/E03 |
| `common/PrereqNotice.vue` | `/databank` 顶部、`/local-model` 卡片、`/random-events` 场景表、`/image-gen` | 该功能生效所需前置与当前满足状态，逐条"去完成" | E05/E06/E10/E22 |

**展示优先级（避免同一原因被四个组件重复播报）**：
1. 就绪条 = 全局状态的**唯一**播报处，任何表面同一时刻最多 1 条主提示 + 可折叠详情；
2. `PrereqNotice` 只在"本页专属前提"存在时出现（如 `/databank` 的 E06），且必须引用 `readiness` 的 reasonCode 而不是自造句子；
3. `EmptyState` 只在零数据时替换页内主体，其 CTA 就是任务卡的第一步（不与任务中心争夺第二按钮）；
4. 任务中心不与 `EmptyState` 同屏显示同一句话（任务卡出现时，空态只留标题与图标）。

**E24 的修法（二选一 → 已决策，D-H）**：不新增预算计算逻辑，改为**直接消费 `onPromptBuilt` 的真实 `tokenCount`**（`services/chat-manager.ts:180,279`）显示"本轮实际用量 / 上限"，并把写死的 `tokenBudget` 初始化字段降级为"上限"而非"余额"。

**`promptTrace` 的持久化决策（D-J）**：v1 把命中摘要作为**可选字段**写入消息（`types/index.ts:34-64` 的 `UIMessage` + `ChatMessage`，适配层需改**两处字段级映射**——`services/type-adapters.ts` 的 `uiMsgToChatMsg`（`:275-295`）与 `chatMsgToUiMsg`（`:306-325`）——外加批量包装 `chatMsgsToUiMsgs`（`:330`，`~:337-340` 也在其内）；先例为可选字段 `core/character-card.ts:56-61`；`core/schema-contract.ts` 允许可选新增）。理由：仅靠回调内存态则刷新/切换会话后 trace 消失，§四 的断言不可测。范围**限单聊**——群聊虽也走 `buildPrompt`（`GroupChatView.vue:695-706`）但不传 `contexts`/`onPromptBuilt`，群聊 trace 列 §七。文档与事件的命中数现状被拼成字符串（`chat-context.ts:163-167`、`data-bank.ts:246-259`），要按段计数需改管线，**v1 不承诺**（§七 #3）。

### 3.4 四条"有 UI 无读者"边的处置（D-E）

E12（`WorldBookView.vue:1565-1595`）、E13（`RandomEventsView.vue:177,497-511`）、E16（`StoryEngineView.vue:783-789` 写者 + `:776-781` 展示 + `:1136-1150` 的 select，调用点在 `:1140`）、E25（`DataBankView.vue:337-345` 的 chat 列表）**本次一律撤 UI**：撤下即"承诺不存在"，比留着骗人好。注意 E16 的撤下范围包含**写路径与 select**（`:1136-1150`），不是只删展示；E25 **不新增 chat 作用域单选**（否则凭空造出第四条"有 UI 无读者"，因为 `chat-context.ts:163-167` 硬编码 `scope='character'`）——要么连带改管线（属行为改造，进 §七），要么撤列表。接通它们属于功能开发，逐条进 §七 排期。

### 3.5 G 层：任务式分步引导（M3）

1. **`src/core/guided-tasks.ts`**：任务与步骤注册表，每个 step 含 `hintKey`、`targetRoute`（带 `?cat=`）、`actionLabelKey`、`isDone(ctx)`。判据全部读真实数据（下表）。
2. **状态与生命周期（D-I）**：`localStorage['ai-roleplay:guided-tasks.v1']` = `{ skipped: string[], dismissedAt: number|null, updatedAt }`。**只持久化"用户意图"（跳过/收起），不持久化判据结果**——完成态每次由数据实时计算，因此删除数据会自动回落、导入备份会自动勾选，不会出现"任务显示已完成但角色已被删"的假状态。键前缀统一到 `ai-roleplay:`（现状 `aijiuguan.stopwordFilterEnabled` 是异类前缀，见 §七 #11）。锁定时 T1 只判"存在 profile"不判可用性（`readiness` 给 `locked`）。
3. **任务集与判据**（✖ 标记的是 v1 判据已按现状降级/改写的项，原因见 §八 第 3 轮）：

| ID | 任务 | 步骤 | `isDone` 数据源 |
|---|---|---|---|
| T1 | 配好一个模型 | 设置→模型接入 建 Profile → 填 baseURL/key/model → 设为当前 | `stores/settings.ts:166-168` + `App.vue:170-178` 可解析 |
| T2 | 有第一个角色 | 快速档新建（名字 + 设定）或市场导入 | `characterStore.characters.length > 0` |
| T3 | 收到第一条回复 | `/chat` 选角色 → 发一句 → 出现 assistant 消息 | 存在 `role==='assistant'` 消息（**无 per-message 错误旗标可用**：错误文本写进 `content`，`chat-generation.ts:797-807`；`lastError` 仅内存 `:807` ⇒ "成功"与"失败文本"不可区分，v1 判"已收到回复"，旗标化列 §七 #17） |
| T4 | 让世界书生效 | 建书 → 1 条常驻或关键词条目 → 绑到角色 → 看到命中 | 绑定非空（`chat-context.ts:59-61`）**且** 消息带 `promptTrace`（依赖 D-J） |
| T5 | 让文档可被检索 | 上传 → 有分块 →（需向量时）装嵌入模型并开开关 → 绑世界书 | 分块存在（`data-bank.ts:153-155`）**且** 开关态与绑定态由 `readiness` 给出（**不用"看到命中"做判据**，因文档命中数 v1 不承诺） |
| T6 | 打开语音朗读 | 设置→语音与辅助 开启并选声 → 气泡点朗读 | `ttsConfig`（`stores/settings.ts:89`）与 `tts-service.ts:38-45` 的 `enabled/voiceURI`（"真的朗读过一次"无状态源，列 §七 #17） |
| A1–A3 | 进阶：群聊 / 故事导入 / 本地模型 | 各 3–4 步 | `groups` / `stories` + importer 结果 / 本地模型 store |

4. **`GuidedTasksCard.vue`**：三处出现（`/chat` 零角色空态、rail 底部"引导"、`/more` 顶部）。进度用 `common.step`（`zh.ts:57`），上/下一步用 `common.prev/next/finish`（`:54-56`）；可收起；**收起 ≠ 永久消失**，入口常驻。
5. **`StepFlow.vue`**：`role="group"` + `aria-current="step"` + 进度 + 左右键切换，被任务中心与两个快速档共用；与 `SettingsView.vue:53-81` 的 tablist 键盘规则不得互相抢占（在同一页时 `StepFlow` 只接管 `←/→` 于自身 `role="group"` 内）。
6. **两个快速档表单**：角色编辑器"快速 / 完整"两档（快速 = 名字 + 设定 + 选书 + 保存，**绑定动作在拿到新角色 ID 之后执行**，草稿态不给"跳去编辑"的链接，避免 `/character/new` 尚无 ID 的空跳）；世界书"最小生效三步"。
7. **`OnboardingModal.vue` 降级**：保留首启时机，内容改为任务中心第 0 步（一句话 + 「现在配模型」「先看清单」两个动作按钮，带深链）；`onboarding-done` 键语义降为"欢迎已看过"，不再代表引导结束。E2E 预置键（`playwright.config.ts:24`）继续可用。
8. **新增原语**（当前全仓不存在，已核实无 Stepper/EmptyState/Tooltip/FormField/Collapse/Badge）：`EmptyState.vue`、`HelpTip.vue`（`?` + popover，键盘可达 + `Escape` 关闭 + 焦点归还）、`FormField.vue`（把 `CharacterEditorView.vue:872-876,894-899` 范式提出）、`Collapse.vue`、`Badge.vue`。**每个原语附带一份 `tests/accessibility/*` axe 用例**（见 §4 负向对照与 §5.5 门禁约束）。

### 3.6 V 层：视觉层次与降噪（M4）

1. **设置 6 → 7 类**：「模型接入」（Profile / baseURL / key / 连通测试）、「采样与上下文」（角色可覆盖项 + 现内联段 `SettingsView.vue:169-227`）、「检索（向量与 RAG）」（`VectorModelPanel.vue` 升为独立类，开关写明"默认关"+"需绑世界书"）。roving 键盘处理是索引驱动（`SettingsView.vue:53-81`），7 项无需改动；`v-show` 保态（`:163-238`）必须保持；`VectorModelPanel` 的 `onMounted` 本就是急切执行（`:275-287`），拆类不新增成本也不节省成本。
2. **默认落地保持确定性**：进入 `/settings` 仍落 `appearance`，"把用户带到阻塞点"由显式深链 `?cat=`、就绪条芯片与首启欢迎窗的动作按钮承担。
   > 本条初稿写的是"无可用 Profile 时自动落「模型接入」"。M4-a 首轮全量 E2E 因此断掉 **13 条**既有用例（`theme-visual`、`contrast-axe`、`chat-flow` 等在 `goto('/settings')` 后直接点 `.theme-card`；默认分类一变外观面板即被 `v-show` 隐藏，同时 `getByRole('tab', {name:/模型/})` 因模型面板转为可见而触发 strict-mode 冲突）。据此回退并登记为 **D-P**：赌用户缺什么的收益，小于破坏既有行为契约的代价。
3. **深链与返回契约（补齐 v1 缺口，B2 修正）**：`/settings?cat=<id>`（可选 `&sub=image-video`）+ `?from=<encodeURIComponent(全路径)>`。读方 `SettingsView.vue`（新增 `useRoute`，现状无 query 处理）；写方统一走新组合式 `src/composables/useReadinessJump.ts`：`router.push({path,query:{cat,from: route.fullPath}})`（**push 而非 replace**，保证浏览器返回可回原页）；页头"返回来源"按钮读 `from`，点击前校验 `from` 属于站内白名单路径集（防开放重定向），随后 `router.replace(from)` 以避免历史堆叠。所有 §3.3 的 chip、`PrereqNotice` 的"去完成"、T1/T6、§6.1 步骤 3 都经由这一个组合式。
4. **常规/高级折叠**：「外观」（1787 行 4 段）、「数据」（1353 行）、「模型接入」的高级采样默认折叠。
5. **巨型视图分区**：只按用户可见密度拆——`WorldBookView.vue`(2826/59)、`CharacterEditorView.vue`(2223/45)、`StoryEngineView.vue`(3360/43)、`GroupChatView.vue`(2624/41)，沿现有 fieldset/section 边界抽子组件 + `Collapse`。
6. **术语表（zh + en 同步；双语齐备由 `tests/i18n.test.ts:49-52` 保证，注意 `i18n:check:strict` 只扫硬编码中文，不做 parity、也不做死键检查）**：

| 现名 | 改为 | 附带 |
|---|---|---|
| 记录 / 群聊记录 | rail 入口名「记录」，页面 `<h1>` 实测为「群聊记录」（`archives.title`），页内两 tab：群聊记录 / 已归档会话 | 让单聊 `archived`（E 见 §1.7）有归处 |
| 设置→扩展 | 设置→语音与辅助 | 名称与内容一致；扩展加载器无面板列 §七 |
| 数据银行 | 标题保留，页头副标题加「（对话检索用）」并在页头显示检索状态 chip | 呼应 T5 与 `PrereqNotice` |
| 作者笔记 | 「补充设定」+ `HelpTip` 说明持久化名 `characterNote.text` | 不改字段名，只改称谓 |
| 状态指令 | 保留，`HelpTip` 补"可被预设覆盖" | 对应 `creation-preset.ts:162-164` |
| 本地模型三处称谓 | 页面「本地模型」/ 动作「加载到运行时」/ 设置项「使用本地 Provider」 | 消除"加载了却没选中" |
| 图片模型两处 | 「模型接入」里 `sub=image-video` 保留，图片页配置段显式标注"本页配置优先于模型分类，且不会随设置持久化"→ 修持久化后去掉该标注 | 对应 E22 |

7. **视觉规则**：页头统一"组名 + 标题 + 一句话职责 + 返回"；主 CTA 每屏唯一；`未就绪` 走新 `Badge.vue`（色值复用现有令牌）。**受门禁约束**（脚本均在 `scripts/` 根目录，无 `css-gates` 子目录）：`hover` 必须包在 `@media (hover:hover)`（`scripts/hover-guard.mjs:16` 规则声明、`:33` 的 `HOVER_MEDIA_RE` 执行）；断点白名单 380/480/640/641/900/1024/1025（`scripts/breakpoint-guard.mjs:12` 声明、`:25-27` 实现）；`!important` 基线 26 不得上升（`scripts/important-guard.mjs:30` 的 `BASELINE_TOTAL`）；可编辑控件 ≥16px（`scripts/i7-control-font-size-guard.mjs`）；对比度 AA 4.5 与 axe 审计集 `AUDITED_ROUTES`（`e2e/contrast-axe.spec.ts:25-33`）⇒ **组标题若用 12px `text-3` 是活跃的对比度风险点**，**决定用现有 `text-2`**（不新增颜色令牌，避免触发 contrast 的按主题扫描基线）。

### 3.7 需要用户裁决的 11 项（均给推荐；正文 §三—§五 **已按推荐列落笔**，若改判只需回退对应段落；v1 评审后新增 D-F…D-K，另有 §3.7.2 的本议题内自决 4 项）

| ID | 议题 | 选项 | 推荐 |
|---|---|---|---|
| D-A | `/group` 入口 | ① 页头分段（仅路由互链）② 视图嵌套 ③ 移动底栏加第 7 tab | **①**（②有 `main-content` 与 inert 冲突，③ 破坏 tab 数量约束） |
| D-B | `/profile` 去向 | ① 摘入口 + 内容并入设置→关于 + 路由 redirect ② 保留 URL 与卡片 ③ 补真实账户能力 | **①**（③ 需后端账户体系，超出本议题） |
| D-C | 设置拆 7 类 vs 6 类内锚点 | ① 7 类 ② 6 类 + 子导航 | **①** |
| D-D | 向量检索默认关 | ① 保持默认关 + 显式引导 ② 装好模型自动开 | **①**（与"优化管线默认关"一致） |
| D-E | 四条"有 UI 无读者"字段 | ① 撤 UI，接通另行排期 ② 立刻接通 | **①** |
| D-F | 移动端 tab 数 | ① 保持 6 并回写设计文档 ② 强行 5 tab | **①**（② 会让市场在移动端不可达） |
| D-G | `design/mobile-ui-design.md` §13 的"5 tab" | ① 文档向实现收敛 ② 实现向文档收敛 | **①**，与 D-F 同批提交 |
| D-H | `tokenBudget` 假进度 | ① 改为显示真实 `tokenCount` ② 补预算重算 ③ 撤掉进度条 | **①** |
| D-I | 任务态存储 | ① 只存意图（skipped/dismissed），完成态实时算 ② 全量持久化 | **①** |
| D-J | `promptTrace` 范围 | ① 单聊 + 仅世界书命中，持久化到消息可选字段 ② 内存态（刷新即失） ③ 含文档/事件全量（需改管线） | **①** |
| D-K | 图片生成配置 | ① 补持久化 + 保留 `category='image-video'` 但说明优先级 ② 统一到 apiProfiles ③ 撤图片页配置 | **①**（② 是行为重构，收益不与本议题绑定） |

### 3.7.2 本议题内直接决定、不再询问的 7 项（v3 补齐 4 项；M4-a 追加 D-P；M2-b3 追加 D-Q；M2-b4 追加 D-R）

| ID | 议题 | 决定 | 理由 |
|---|---|---|---|
| D-L | `/profile` 内容承接方式 | **就地扩 `SettingsAboutPanel.vue`**（不新建视图文件） | 该面板仅 138 行 / 0 控件（`§1.8`），有余量；新建文件会多一个导航无关的视图 |
| D-M | 图片 `apiKey` 的存储 | **复用 Profile 的加密分支**（`stores/settings.ts:968-980`，注意 `:982-993` 是翻译用的，不复用） | 与"不写明文进持久层"的既有约束一致；走"明示不落明"会让刷新丢 key 的问题留着 |
| D-N | `e2e/contrast-axe.spec.ts:27` 的 `/profile` 审计路由 | **保留不动** | redirect 后仍能扫到落地页；代价是 `/settings` 被扫两次，可接受，不值得新增断言 |
| D-O | `tokenBudget` 字段处置 | **保留字段名，仅语义降级为"上限"** | 改名会触碰 `characters.ext.*` 持久化键与 `services/type-adapters.ts` 双映射，属迁移工程 |
| D-P | 设置页默认落地是否随就绪状态变化 | **不变，保持「外观」**；改用 `?cat=` 显式深链 + 就绪条 + 欢迎窗动作按钮把人带到阻塞点 | 实现"智能默认"后全量 E2E 断掉 13 条既有用例（`theme-visual` / `contrast-axe` / `chat-flow` 等依赖默认分类为外观），且 strict-mode 冲突源于模型面板转为可见；收益可被显式深链完全替代 |
| D-Q | 刷新（F5）后 `/chat` 是否自动接回上一段对话 | **自动接回该角色最近一条未归档会话**，且仅在 `activeChatId === null` 且消息缓冲为空时触发 | M2-b3 的 e2e 实测：回复已写入 `chats` store，但刷新后聊天区**没有任何气泡**，必须用户在左侧列表里再点一次会话才恢复。成因是两条断链——`uiCharToCard()` 从不带 `messages`（`stores/character.ts:186` 落盘的 CharacterCard 里就没有历史），而 `loadChatHistory` 只有 `openSession`（列表点击）一个调用者。`docs/dev/P2-11-virtualization-plan.md:52` 声称"已最小修复（保留 messages）"，实际保留的是恒不存在的字段 ⇒ 文档与代码不符，需一并回写。条件收窄是为了不覆盖 `newSession` 的草稿语义 |
| D-R | `activeChatId` 与"当前角色"不匹配时 `persistChat` 写哪条会话 | **以会话的 `characterId` 归属为准纠偏**：已进索引且属于别的角色的会话 id 一律弃用，回落到 `chat-<角色 id>`；不在索引里的（`newSession` 草稿）原样保留 | M2-b4 给 D-Q 写测试时实测出来的**数据丢失**：`selectCharacter()` 不重置 `activeChatId`（`stores/character.ts:206-208`），而 `persistChat` 直接沿用 `activeChatId ?? chat-<id>` ⇒ "打开甲的会话 → 切到乙 → 发一句"会把乙的整段缓冲覆盖进甲的记录（断言 `expected ['来自 chat-A-1 的消息'] to deeply equal ['乙的新消息','乙的回复']` 即当时的实测证据）。彻底的做法是把"每个角色各自的激活会话"建模成映射，属会话模型重构，排 §七 #19 |

---

## 四、修改后的预期效果

> 每行给出可执行验收；不使用"更清晰/更易用"这类不可证伪表述。

| 目标 | 前 | 后 | 验收方式（可执行） |
|---|---|---|---|
| 导航分层 | 12 内容 + 2 底部，平铺 | 4 组 / 12 内容项 + 3 系统项（M2-b7 口径），且**整栏不需要滚动就够得着全部入口** | `tests/core/nav-model.test.ts` 断言分组结构与计数；三渲染器同源快照测试 |
| 三处导航同源 | 三份硬编码 | 1 份 `nav-model` | 单测：`NavRail`/`BottomNav`/`MoreView` 输出同一集合；`/group`、`/more` 的"某端无入口"数 2 → 0 |
| 激活高亮 | 3 处失准 | 0 处 | e2e 依次进 `/character/new`、`/character/:id/edit`、`/more`，按 `data-nav-entry="<id>"` 断言激活项（**项级断言，不断言组**） |
| 语义跳转点 | 9 | ≥26 | 每个跳转带 `data-rel-jump="<edgeId>"`；`tests/ux/related-jumps.test.ts` 解析 nav-model + 组件，断言覆盖 E01–E25 的处置集合；e2e 抽样点 8 条真实链路 |
| 角色 ⇄ 模块的关系面板（M2-b5） | 六条关系分散在四个页面，且"绑了没生效 / 跟随全局还是角色级"全靠猜 | 角色编辑页一屏六行（世界书 / 文档 / 创作模式 / 模型 / 版本 / 群聊），数字与状态一律读真实 store，每行可一跳 | `tests/core/relations.test.ts` 9 例 + `tests/components/module-relations-panel.test.ts` 4 例 + `e2e/ux-relations-panel.spec.ts`（造一本含 1 启用 + 1 停用条目的全局书，断言"生效 1 本 · 启用条目 1 条"、面板不含条目正文、跳转带 `from` 且能返回） |
| 深链回程契约（M2-b5） | `?from=` 只有设置页兑现，其余目标页把用户带过去就没有回头路 | 任何带 `from` 落地的页面右下角都有"返回来源页"（设置页仍用自己的面板头按钮，二者互斥） | `e2e/ux-relations-panel.spec.ts` 按可及名点"返回来源页"（即 `.source-return`，`data-rel-jump="source-return"`）后断言 URL 回到 `/character/seraphina/edit` |
| 依赖边处置覆盖 | A1/B6/C11/D4/E3 | **17 条转 A**（有可跳目标的边全部做到可见且可一跳）+ **4 条撤下**（E12/E13/E16/E25）+ **4 条显式声明不存在**（E08 群聊角色级参数、E18 群聊能力集、E21 市场 URL 运行期配置、E23 图片入对话；这四条没有可跳目标，只能"说清楚"） | §1.4 表增加"后测分类"列逐行复评（同一次提交内更新，避免结论与代码不同版本）；`tests/ux/related-jumps.test.ts` 断言每条 E-id 落在三类之一 |
| 文档检索不再"上传即以为生效" | 两隐藏前提，零提示 | `/databank` 顶部 `PrereqNotice` 显示两前提与状态 + 两个"去完成" | e2e：无绑定时断言提示可见且含原因码；绑定并开开关后断言 chip 转 ready |
| 世界书触发可感知（单聊） | 完全不可见 | 每条助手消息可展开"本轮注入 世界书 N 条"，条目名可跳来源书 | **已验证（M2-b3）**：`tests/stores/chat-prompt-trace.test.ts` 4 例（常驻 + 关键词各 1 条 ⇒ N=2、不含正文；无世界书的负向对照；落盘回读；重新生成清空）+ `e2e/ux-prompt-trace.spec.ts`（真发一条消息，断言 N、展开条目、点书名落 `/worldbook?from=/chat`、`chats` store 里确有该字段、重开会话后仍在），msedge 与 webkit 双内核均通过。**口径更正**：本行原写"刷新后仍在"隐含"刷新即自动接回对话"，实测并非如此（刷新后缓冲为空，需点左侧会话行）——该缺陷登记为 **D-Q**，修好前此行只能读作"重开会话后仍在" |
| 刷新后接回上一段对话（D-Q） | F5 后聊天区**一个气泡都没有**，必须再点一次左侧会话行才能接着聊 | 启动即自动装回该角色最近一条未归档会话，会话行同步高亮；切换角色时同样接回 | `tests/stores/chat-session-restore.test.ts` 6 例（取 `updatedAt` 最新 / 归档不接回 / 只接回本角色 / 已有 `activeChatId`（含 `newSession` 草稿）不覆盖 / 缓冲非空不覆盖 / 无角色静默）+ `e2e/ux-prompt-trace.spec.ts` 的刷新段（**不再点击任何会话行**，直接断言正文与痕迹都在、`.conv-row.active` 可见）；反证：临时摘掉 `CharacterList` 的加载调用后 e2e 仍绿 ⇒ 证明 `App.vue` 的启动接线才是那条确定路径 |
| 假进度 | `tokenBudget` 恒 0 | 显示真实 `tokenCount` | e2e：发送后断言用量 >0 且随消息增长；断言"剩余"字样不再出现 |
| 首条消息路径 | 3 屏 / 12+ 控件 / 失败后才知道 | 任务中心 3 步、每步 `?cat=` 直达；缺配置在发送**前**给原因 | e2e：清空 Profile 后进 `/chat`，断言 `PrereqNotice` 与 `reasonCode=no-profile` 文案在发送前存在，点"去完成"落在模型接入类 |
| 本地模型死端 | 按钮禁用无原因；加载后还要手动去设置 | 禁用显示原因 + `PrereqNotice`；成功后"去设置选中"一步跳 | e2e：`isAvailable=false` 断言原因文案；加载成功断言跳转链接存在且点击落到 `?cat=` |
| 语音路径 | 藏在"扩展"，失败不给跳转 | 类名「语音与辅助」；`chat.ttsDisabled` 处带一步跳转 | e2e：未启用点朗读 → 断言可点跳转 → URL 含 `cat` 且落地正确类 |
| 图片模型两处配置 | 互不读取 + 刷新丢 key | 图片页显示"当前生效来源"与持久化状态；补 `providerConfig` 持久化 | 单测（持久化白名单）+ e2e（刷新后 endpoint/model 仍在；**apiKey 复用 Profile 加密分支 `stores/settings.ts:968-980`**，D-M 已定，不走"明示不落明文"分支） |
| 空态 | 5 / 12 有 CTA，`.empty-state` ≥10 份 | 12 / 12 有 CTA，样式副本 1 | 逐视图快照断言 `EmptyState` 的 CTA 存在；`grep -c "\.empty-state" src/**/*.vue` 由 ≥10 降至 1（`css-conventions` 门禁） |
| `/chat` 零角色 | 无该分支 | `EmptyState` + 任务卡 | e2e：`characters.length===0` 断言空态卡而非空三栏 |
| 引导可重开 | 关闭即永久 | 三态 + 入口常驻 + 完成态实时计算 | e2e：收起后从 rail 与 `/more` 重开，断言进度与 skipped 保留；删数据后断言 completed 自动回落 |
| 设置密度 | 「模型」60 控件面（字面标签口径；`v-for` 展开为 66）/ 6 段 | 3 类，**DOM 实测可见控件 ≤25** | `tests/ux/control-density.test.ts` 挂载后 `querySelectorAll` 计数（不用字面标签法） |
| 默认落地 | 恒 `appearance` | 仍 `appearance`（D-P 已回退"智能默认"），但 `?cat=` 深链已生效并被就绪条 / 前提清单 / 欢迎窗使用 | `tests/views/settings-local-model.test.ts` 断言 7 类与默认「外观」；`e2e/ux-readiness.spec.ts`、`e2e/ux-guided-tasks.spec.ts` 断言 `?cat=model` 与 `?cat=retrieval` 落到正确分类且能"返回来源页" |
| 命名漂移 | §1.7 的 8 组 | 术语表统一；`/profile` 摘除；"扩展"更名 | `tests/i18n.test.ts` parity + 断言 `nav.archives` 与 `archives.title` 语义一致 |
| 门禁 | 现状全绿 | 全绿且不放松 | lint / 运行时 schema 漂移 / 快照迁移 / i18n strict / eval manifest / css-conventions / contrast + axe / coverage 78-73-78-78 / build / check:csp / check:ort / E2E(chromium+webkit) / Tauri --no-bundle |

**负向对照（必须不发生）**

- 引导收起后不得永久隐藏；跳过某步不得阻塞其他步。
- 主密码锁定态就绪条必须显示"已锁定，需解锁"（`reasonCode=locked`），**不得**复用"未配置 API Profile"（`char.noApiProfile2` 路径即 `chat-generation.ts:1001-1003`）。
- 拆类与分区后不得丢失面板状态（`SettingsView.vue:163-238` 的 `v-show` 语义）。
- 任何 chip/提示不得声称"已生效"，除非判据读自真实数据；trace 只报"注入"，不报"模型采纳了它"。
- 不得新增第五个"有 UI 无读者"控件（撤 D 类时不得顺手加 chat 作用域单选）。
- 不删任何路由 path（`/profile` 摘入口仍保留 redirect）；`?from=` 不得跳出站内白名单。
- 视图分区不得改变运行时行为契约；只做呈现层拆分。

---

## 五、具体修改内容

### 5.1 新增文件

| 文件 | 职责 | 预估规模 | 里程碑 |
|---|---|---|---|
| `src/core/nav-model.ts` | 导航单一事实源（含 `routeName`/`activeWhen`/`group`/`mobileTab`/`inMore`） | ~150 | M1 |
| `src/core/readiness.ts` | 就绪状态唯一 selector（含 `locked` 判定与向量开关镜像） | ~180 | M2 |
| `src/core/guided-tasks.ts` | 任务/步骤注册表 + `isDone(ctx)` | ~260 | M3 |
| `src/core/glossary.ts` | 术语对照与一致性校验 | ~60 | M1 |
| `src/composables/useReadinessJump.ts` | 深链与返回契约（`?cat=&from=`，白名单校验） | ~70 | M2 |
| `src/components/common/{StepFlow,EmptyState,HelpTip,FormField,Collapse,Badge}.vue` | 6 个原语 | 合计 ~670 | M1/M3 |
| `src/components/layout/{ContextReadinessBar,ModuleRelationsPanel}.vue` | 就绪条 / 关联面板 | ~230 / ~260 | M2 |
| `src/components/chat/PromptTraceSummary.vue` | 本轮注入回显（单聊，世界书） | ~180 | M2 |
| `src/components/common/PrereqNotice.vue` | 前置条件横幅 | ~160 | M2 |
| `src/components/common/GuidedTasksCard.vue` | 任务中心卡 | ~300 | M3 |
| `tests/core/nav-model.test.ts`、`tests/core/readiness.test.ts`、`tests/core/guided-tasks.test.ts`、`tests/ux/control-density.test.ts`、`tests/ux/related-jumps.test.ts`、`tests/accessibility/new-primitives-axe.test.ts` | 单元与可访问性（覆盖新代码，保 coverage 门禁） | 合计 ~900 | M1–M3 |
| `e2e/ux-nav-model.spec.ts`、`e2e/ux-readiness-trace.spec.ts`、`e2e/ux-guided-tasks.spec.ts` | 行为链 | 合计 ~640 | M1–M3 |

### 5.2 修改文件（全量，含 v1 评审指出的遗漏文件）

| 文件 | 改动 |
|---|---|
| `layout/NavRail.vue` | 删 `:22-38` 清单改由 nav-model 渲染；`isActive()`(`:55`) 改路由派生；删死移动分支 `:44-46`；加组标题、系统项（引导 / 更多）；`profile` 图标去重（D-B 后自然消失） |
| `components/mobile/BottomNav.vue` + `core/mobile-nav.ts` | 由 nav-model 派生（`:10-17`）；`group` 移出 `DETAIL_ROUTES`（`:27`）；tab 集合保持 6（D-F） |
| `views/MoreView.vue` | `:15-24` 按组渲染 + 渲染 `descKey`（`:35-44`）；删恒假 `.active`（`:40`）；顶部挂任务卡；补页头与返回 |
| `stores/character.ts` | 删 `currentNav`/`setNav`（`:56,246`）及 store 返回值引用（`:629,655`，该字段不落盘，无迁移）；`tokenBudget`（`:278,600`）语义降级为"上限"而非"余额" |
| `types/index.ts` | `NavKey`（`:31`）增 `more`、`guide` 与组 id；`UIMessage`（`:34-64`）增可选 `promptTrace` |
| `views/SettingsView.vue` | `:24` 默认类智能指向；`:107-114` 6→7 类；`:169-227` 内联段迁入「采样与上下文」；`:229` 向量面板独立成类；新增 `useRoute` 读 `?cat=/?from=`；`:53-81` 键盘保持 |
| `settings/SettingsModelPanel.vue` | 沿 `:513,723,812,850` 边界拆三类；`:472-495,985-995` 的 `image-video` 分类加"图片页不消费此分类"说明（修持久化后改为来源说明）；`:35` 跳本地模型补返回；高级采样折叠；`:924-932` 只读采样行加来源标注 |
| `settings/SettingsExtensionPanel.vue` | 类名改「语音与辅助」（`zh.ts:2160`/`:2161`）；`:26-48` 各加 `HelpTip` |
| `settings/VectorModelPanel.vue` | 升为独立类；开关处显式写明"默认关闭"与"需绑定世界书"，并给 `PrereqNotice` 的两个前置入口；`isVectorRagEnabled` 改订阅（`:276` 仅挂载镜像） |
| `views/ChatView.vue` | `:72-94` 增零角色分支；页头挂就绪条；`:19,26-36,44-48` 滚动锁/inert/Escape 行为保持（不嵌套群聊视图，D-A） |
| `layout/ContextPanel.vue` | `:39-45,147-199` 参数区显示"跟随/覆盖"来源；`:83-120,502-541` 改真实 `tokenCount`；`:545-559` 补全局书并标"全局生效"（修 E03 不一致）；`:169-172` 称谓「补充设定」；`:748-753` 状态指令 `HelpTip` 补覆盖关系 |
| `layout/CharacterList.vue` | `:91-93,229,268` 单聊 `archived` 入口指向新的「档案 / 已归档会话」tab；`:325` 空态并入 `EmptyState` |
| `components/chat/ChatMain.vue` | `:93` 去掉非空断言（配合零角色分支）；`:746` 徽标改可点 + 原因；`:72-74` 之外增发送前检查点；`:608-643,625` TTS toast 增跳转；`:926-950` 并入 `EmptyState`；`:731` `id="main-content"` 归属保持唯一；助手消息挂 `PromptTraceSummary` |
| `components/chat/MessageBubble.vue` | `:61` 朗读按钮在 `readiness=not-ready` 时显示原因 + 跳转（替代仅 toast） |
| `services/chat-manager.ts` | `:180,279` `onPromptBuilt` 透传**裁剪后的**命中信息（`id/name/matchedKeys`；`core/lorebook-scanner.ts:29-38` 的 `ActivatedEntry` 含全文，不得整份下传） |
| `stores/chat-generation.ts` | `:728-730,1070-1072` 消费新载荷写入消息 `promptTrace`；`:593-600` `checkSendBlock` 复用为 readiness 来源；`:1001-1003` 锁定态不再写 `noApiProfile2`（与就绪条 `locked` 一起修） |
| `stores/group-chat.ts` / `views/GroupChatView.vue` | 页头就绪条（明示群聊不含世界书/RAG，E18）+ 成员跳 `/character/:id/edit`（E17）；`:658`/`group-chat.ts:918` 不读 `profileId` 一事**显式声明**（不静默）；`:941-964` 空态并入；`:958` `main-content` 唯一性保持；分区 |
| `views/DataBankView.vue` | 顶部 `PrereqNotice`（E05/E06）；`:216-224` 并入 `EmptyState`；`:337-345` 的 chat 列表**撤下**（D-E，不新增 chat 单选）；`:101,106` 错误补下一步 |
| `views/LocalModelView.vue` | `:340` 禁用改"禁用 + 原因 + 替代动作"；三处裸 `<p>`（`:359-362,409-411,461-463`）改 `EmptyState`；`zh.ts:1314` 文案拆"无模型/筛选无结果"；成功后"去设置选中"深链 |
| `views/ImageGeneratorView.vue` | `:108-111` 跳转改 `?cat=<模型接入>&sub=image-video`；`:492-540` 配置段补持久化（`stores/settings.ts:995-1035` 白名单增 imageGen；apiKey 复用 **Profile 加密分支 `:968-980`**，见 D-M；`:982-993` 是翻译用，不复用）；页头声明"产物存图库，不进对话"（E23）；`:405,475-479` 并入 `EmptyState` |
| `views/CharacterEditorView.vue` | 快速/完整两档；`:1089` 绑定段新建态可见（折叠，写于拿到 ID 后）；6 个 fieldset 的 hint/error 统一 `FormField`；必填标记系统化（现仅 `:607`）；`:259,345,497,506` 保存后跳转保持 + "下一步"提示 |
| `views/WorldBookView.vue` | `:986-1016` 绑定角色改可点（含 `wb.boundCharsEmpty` `zh.ts:1856` 补链接）；`:1565-1595` 撤 E12 死 UI；`:1406` 正则键失败反馈（非法 pattern 由 `lorebook-scanner.ts:44-56` 静默降级 ⇒ 加校验提示）；`:66,83` 的 chat 过滤与 `chat-context.ts:55-69` 矛盾**按 D-E 撤下该过滤 tab**；分区 |
| `views/RandomEventsView.vue` | 撤 `:177,497-511`（E13）；场景表加"场景名必须等于角色名"说明 + 跳角色（E10 过渡）；`:356,407,635` 并入 `EmptyState` |
| `views/StoryEngineView.vue` | 撤 `:1136-1150` 的 select（调用点 `:1140`）与 `:776-789`（展示 `776-781` + 写者 `handleBindWorldBook` `783-789`，E16）；`:878,883` 范式并入 `ModuleRelationsPanel`；`:951-962` 保留 CTA 但改由 `EmptyState` 承载；分区（3360 行，全仓最大） |
| `views/CharactersView.vue` | `:540-546` 补 CTA 按钮；卡片加关联行（开始对话 / 编辑 / 绑定世界书 / 版本历史）；`:989` 样式收敛 |
| `views/CharacterVersionView.vue` | 加"已跟踪 = 已建仓库"来源说明（`stores/character-version.ts:162-196`）与角色入口；`:533,611,683` 并入 `EmptyState`；`:448` 手写 tab 换 `FilterTabs` |
| `views/CommunityMarketView.vue` | 安装成功提示 + 跳 `/character`（E20，写点 `stores/community-market.ts:454`）；**E21 的声明落点**：页头副标题写明"市场源地址由构建环境提供（`core/market-index.ts:80-84`），运行期不可配置"；`:572,638,735,768,813` 空态并入 `EmptyState`；`:375` 页头统一 |
| `settings/SettingsAppearancePanel.vue` | 1787 行 4 段（`:367,394,495,539`）中的"UI 自定义"段默认折叠（`Collapse`）；语言/主题段补 `HelpTip`；其余不动 |
| `settings/SettingsDataPanel.vue` | 1353 行：优化开关段（`:334-344,497-508`）的 toast 文案改为读 glossary 的人名而非裸键（承接 O-20，杜绝"「l0Enabled」已关闭"）；备份/恢复段补"包含哪些数据"的清单说明（`core/backup.ts:51`）；清空动作补与 `guided-tasks` 的关系说明（意图键保留、完成态实时回落） |
| `views/ArchivesView.vue` | 页名「群聊记录」+ 两 tab（群聊记录 / 已归档会话）；`:312-323` 并入 `EmptyState` |
| `settings/SettingsAboutPanel.vue`（**已存在**，138 行 / 0 控件） | D-L：就地扩一个 section 承接 `/profile` 的"本地用户 + 扮演身份在世界书"说明（约 +80 行）；不新建视图文件 |
| `views/ProfileView.vue` | D-B：摘入口、内容并入设置→关于、路由改 redirect（path 保留）；`nav.profile`(`zh.ts:73`)/`router.profile`(`:130`)/13 个 `profile.*` 键(`:454-466`) 的处置：**保留页面级键、删导航级键**（避免 §七 #10 之前继续累积死键） |
| `components/common/OnboardingModal.vue` | 改为任务中心第 0 步（动作按钮 + 深链）；`close()`(`:19-24`) 不再等同引导结束 |
| `components/chat/NewConversationModal.vue`（注意在 `chat/` 不在 `common/`） | `:259-264` 的向导步骤标记改用 `StepFlow`；`:198,227` 跳转保持 |
| `components/common/ApiErrorModal.vue` | `:189-204` 的"去设置"改用 `useReadinessJump`（带 `?cat=` 与返回）；`:163-177` 建议块文案与 readiness 的 reasonCode 对齐 |
| `utils/onboarding.ts` | 键语义降级；新增 `guided-tasks` 读写（统一 `ai-roleplay:` 前缀） |
| `i18n/locales/zh.ts` + `en.ts` | 新增 ~90 键（组标题/描述、原因码、任务文案、`PrereqNotice`、术语值）；启用闲置 `common.next/prev/finish/step/optional/tips`；删除本次撤下导致的死键；双语同步由 `tests/i18n.test.ts:49-52` 兜底 |
| `data/mock-data.ts` | `tokenBudget` 初始化（`:31,101,122,143`）**标注为上限语义**（D-O：不改字段名，避免与 `characters.ext.*` 的既有持久化键产生迁移面） |
| **受影响的既有测试**（必须与代码同提交） | 单元：`tests/views/settings-local-model.test.ts:89-95`（`toBe(6)` + 六个类名）与 `:104,129,140,164` 的 `clickCategory('模型')`；`tests/core/mobile-nav.test.ts:46`（`isDetailRoute('group') === true`，`group` 移出 `DETAIL_ROUTES` 后必须翻转）——注意 `:14-17` 断言的是 MAIN_TABS，D-F 决定不变因此**不会**破；`tests/stores/character.test.ts:170-173`（`currentNav` 的唯一测试读者）。e2e：`e2e/mobile/mobile-layout.spec.ts:22`（本文件自带的 MAIN_TABS 清单）、`:49`（`toHaveCount(6)`，`:48` 是 locator）、`:63`（单高亮守卫）、`:120`。`e2e/contrast-axe.spec.ts:25-33` 的 `AUDITED_ROUTES` 含 `/profile`（`:27`）——D-N：**保留该条不改**，经 redirect 仍在审计集，代价是 `/settings` 被扫两次（可接受，不新增断言）。`e2e/backup-restore.spec.ts:32`（点「数据」，拆类后仍成立）。已复核：现有 e2e **没有**对 `nav.archives` / "个人中心" 文案的断言（v1 此处说法有误，已删） |

### 5.3 里程碑

| 里程碑 | 内容 | 依赖 | 合入门禁 |
|---|---|---|---|
| M1 导航与命名 | nav-model + 三处同源 + 高亮派生 + `/more` 分区与桌面可达 + `group` 移出 `DETAIL_ROUTES` + 术语更名 + `Collapse`/`Badge` + D-A/D-B/D-F/D-G | 无 | lint / i18n（含 parity 测试）/ css-conventions / contrast+axe / `tests/core/nav-model.test.ts` / `e2e/ux-nav-model.spec.ts` |
| M2 关联层 | `core/readiness.ts` + 就绪条 + 关联面板 + trace + `PrereqNotice` + `useReadinessJump` + `activatedEntries` 裁剪透传 + `tokenCount` 显示 + 撤 E12/E13/E16/E25 四处死 UI | M1（跳转目标需要新的类与深链） | 上述 + coverage 78/73/78/78 不放松 + `e2e/ux-readiness-trace.spec.ts` |
| M3 引导层 | `guided-tasks` + 任务中心 + `StepFlow`/`EmptyState`/`HelpTip`/`FormField` + 两个快速档 + `/chat` 零角色 + Onboarding 改造 | M2（判据依赖 readiness） | + `e2e/ux-guided-tasks.spec.ts` + `tests/accessibility/new-primitives-axe.test.ts` |
| M4 密度重构 | 设置 7 类 + 巨型视图分区 + 图片配置持久化与来源说明 | M1–M3 | 全量 17 步 + E2E(chromium+webkit) + Tauri --no-bundle |

### 5.4 明确不做

- 不改任何路由 path；不改 IndexedDB store 结构；不动 `characters.ext.*` 与 `authorNote`→`characterNote` 的既有映射。
- 不接通四条死 UI（D-E 已决策撤下）；不做群聊世界书/RAG（E18）、图片入对话（E23）、市场 URL 运行期配置（E21）、ASR——只在界面**显式声明不存在**。
- 不引入第三方引导库（driver.js/intro.js/shepherd 现为零依赖，保持）。
- 不做视觉品牌重绘（令牌、配色、字体保持）。
- 不产出 exe / apk。

### 5.5 改动分类与回滚（v1 的"纯呈现层"表述已被否定，此处重列）

| 类别 | 含义 | 本议题中的项 | 回滚方式 |
|---|---|---|---|
| **P 呈现层** | 只改渲染与文案 | nav-model 三渲染器、分区/折叠、术语、空态并入 | 单提交整体 revert，无数据影响 |
| **R 只读数据** | 新增/透传数据但不写库 | `readiness.ts`、`activatedEntries` 裁剪透传、真实 `tokenCount` | 独立提交，可单独 revert 而不动 P 类 |
| **W 状态写入** | 新增持久化 | 消息可选字段 `promptTrace`、`guided-tasks` 键、`imageGen` 持久化 | **前向兼容**：旧数据无字段即渲染省略，不做迁移；回滚只删写入方，遗留字段被 `schema-contract` 容忍 |
| **B 行为** | 改变可达性或移除能力 | 撤 4 处死 UI、`group` 移出 `DETAIL_ROUTES`、`profile` 摘入口、不新增 chat 单选 | 逐条独立提交；入口摘除保留 redirect，可无痛恢复 |

### 5.6 与既有缺陷清单的承接（去重）

| 来源 | 状态 | 本议题关系 |
|---|---|---|
| D-10（锁定态谎报"未配置 API Profile"） | 未修 | 由 M2 的 readiness `locked` + `chat-generation.ts:1001-1003` 一并收口，本文档 §4 负向对照已锁死该行为 |
| D-11（移动端无二级入口） | 已修（`/more`） | 本议题把 `/more` 从平铺清单升级为分组同源渲染 |
| O-19（归档可感知） | 已修 | 本议题补"归处"：「档案 / 已归档会话」tab |
| O-20（文案含裸键名/原始 ISO 时间） | 部分已修 | readiness 的 reasonCode 与 glossary 统一处理，避免再出现 `「l0Enabled」已关闭` 类文案 |
| O-23（ST 导入复用 `raw.id` 静默覆盖） | 未修 | 与本议题无关，保持原优先级 |
| D-3（P1：快照丢 `personality`/`scenario`） | 未修 | 属数据正确性，先于本议题做，不与 M1–M4 争抢提交序列 |

---

## 六、用户使用方式

> **本节是"改造后的目标态"写法，不是当前界面清单**。截至 `feat/ux-ia-guided-flow` 最后一次提交（M2-b5），落地与未落地按下表核对；读到下面任何一条时，请先确认它在"已落地"列里。

| 状态 | 条目 |
|---|---|
| **已落地** | N 层（nav-model 四组分层 / 三渲染器同源 / 路由派生高亮 / `/more` 聚合页 / 移动端底栏含群聊可达）；L 层（`/chat`·`/group` 就绪条、`/databank` 前提清单、`?cat=` 深链与设置页返回、世界书"已绑定角色"可点回、**E02 注入痕迹回显**、**E11 随机事件注入回显（M6-c）**、**E24 真实 token 用量**、**角色关联面板 M2-b5**、**全局"返回来源页" M2-b5**、**E17 群聊成员可点进编辑（M2-b6）**、**E20 市场安装结果可见可跳（M2-b6）**、**侧栏二次排版 + 入口显隐可编辑（M2-b7 / M2-b8：`/more` 的「侧栏入口」编辑器，钉底「更多」「设置」，收起的入口在「更多」页「已从侧栏收起」里仍可进）**）；G 层（`/guide` 任务中心 + rail/`/more` 常驻入口 + 首启欢迎改造）；V 层（设置 7 类、术语统一、**E12/E13/E16/E25 四条死控件撤除**、假预算条删除）；连续性（**D-Q F5 自动接回会话**、**D-R 会话归属纠偏**）；快速档（**M3-b3：角色"名字 + 设定 + 选书 + 建好并开始"四件事一屏做完，世界书"最小生效三步"，两者共用 StepFlow，快速档内已采用 FormField 做标签/说明/报错关联**）；空态收敛（**M3-b2：22 处手写 `.empty-state` 并入 `EmptyState`，删掉 30 条私有样式，12 个文件用组件；仅剩 `ChatMain` 的带芯片空态按设计保留**）；提示可达性（**M4-b1：33 处原生 `title=` 已按 `v-tip` 指令 / `aria-label` / 可见文字处置完毕，仅剩 1 处白名单，并由 `tests/accessibility/no-native-title.test.ts` 守着**）；引导原语（**M3-b1 `StepFlow` 一个组件伺候向导与清单两态，已接管任务卡两段重复步骤列表与新建会话弹窗指示器**、`HelpTip`、`FormField`，4 例 axe 全过）；关联缺口补四条（**E03 上下文面板按真实注入口径列全局书并可点进**、**E19 角色卡"已跟踪"标记可点回该角色版本历史**、**E22 图像 Provider 随设置持久化 + 与「模型接入」互填**、**E23 图片页页头声明产物不进对话**）；交互反馈（**M2-b9 滑块轨道按值着色 + 拇指光晕**、**M2-b9 全局按钮悬停/按下兜底**、**M2-b9 提示分类型时长 + 倒计时条 + 悬停暂停 + 队列上限**）；常规/高级折叠（**M4-b2：`Collapse` 原语接管设置页三处高级段——「外观」界面自定义、「数据」新分组「运维与兼容」四段（并把档案/备份/两项导出提到前面）、「模型」弹窗内默认采样参数，三处默认收起且用 `v-show` 保住草稿**）；四条边的补完与一处页面合并（**M4-b4：E10 随机事件前提横幅（场景名=角色名的字符串耦合首次出现在界面上，不一致可一跳回该角色）、E15 聊天故事时间改为可点回故事本体（`/story?story=`）、E21 市场索引地址的构建期声明、D-B 后半 `/profile` 并入设置→关于（旧链接重定向，`ProfileView.vue` 删除，`nav.profile`/`router.profile`/5 个 `profile.*` 死键清除）**）；`/chat` ⇄ `/group` 分段控件（**M6-a：两处页头共用 `ChatModeSwitch`，标签取自 nav-model，方向键只移焦点不跳转**）E08/E18 以 `group.capabilityNote` 显式声明"群聊不加载世界书与文档检索"；角色编辑器分区与原语铺开（**M6-b1：属性段并入 `Collapse`，原语补上 `v-model:open` 受控用法**、**M6-b2：8 个字段块接进 `FormField`，5 条说明拿到 `aria-describedby`、2 处悬空 label 改成分组标签、必填改成"星号对读屏隐藏 + 一句必填文本"，并把本视图标签排版对齐到原语刻度**） |
| **已落地（分区这条到此收口）** | 四个巨型视图：`CharacterEditorView` 并入 `Collapse`（M6-b1）且 15 块接进 `FormField`（M6-b2 八块 + M6-f 七块，只剩渐变一对色共用一条报错的两控件块）、`GroupChatView` 页头的成员 Runtime 检视段折叠（M6-e）、`WorldBookView` 两段一次性配置折叠（M7-a，条目区 y≈1998 → 803）、`StoryEngineView` 展开卡占满整行 + 详情两列（M7-a，1276px → 794px） |
| **仍未落地（下面小节仍按目标态描述，别当成现状）** | 记忆按实体分开与"恢复默认"出口都已在 M8-b 落地；剩下的：删书/删群不清理其记忆键、出口只能整体清空（没有"单独恢复某一段"）、角色编辑器"属性详情"段仍未接记忆；`Modal` 的对话框级说明只接了群聊两个弹窗，其余弹窗的开头说明尚未逐一归类 |

### 6.1 新用户第一次打开（改造后）

1. 欢迎卡（原弹窗降级为任务第 0 步）：一句"三步就能聊起来" + 「现在配模型」「先看清单」两个按钮。收起它不影响任务中心存在。
2. `/chat` 无角色 → `EmptyState` + 任务卡（T1→T2→T3，进度"步骤 1/3"）。
3. T1 的"去完成"深链 `/settings?cat=model-access&from=/chat`；填完点页头"返回来源"回到任务卡，T1 自动变绿（判据读 `activeProfile`，不读"看过页面"）。
4. 未就绪时页头就绪条显示"模型：未配置"并可点；主密码锁定态显示"已锁定，需解锁"，绝不显示"未配置"。
5. T4/T5/T6 三张卡同理，全部就地跳转；rail 底部「引导」或 `/more` 顶部随时重开；单步可跳过且不阻塞其他步。

### 6.2 日常创作者

- **改一个角色的世界**：角色编辑页底部有「角色关联」六行（M2-b5 已落地）——世界书写的是**真实生效数**（全局书无条件生效所以也计进去，停用条目不计数）、文档写"几篇可检索"、创作模式与模型分别标明"本角色指定"还是"跟随全局"、版本写"已跟踪 · N 次提交"或"尚未跟踪"、群聊写"在 N 个群里"。每行右侧一个按钮，点过去还带回得来路；世界书页"已绑定角色"可点回编辑（含空态里的链接）。角色卡列表上的关联行仍待铺（§九 M2-b5 "尚未铺开的面板宿主"）。
- **写长文再抽设定**：`/story` 提取 → 结果行跳 `/worldbook`、`/character`（把现存的唯一好范式推广为通用关联面板）。
- **喂文档**：`/databank` 顶部一眼看到"关键词通道：已生效 / 向量通道：未开启（原因 + 开启入口）/ 静态通道：需角色绑定世界书（+ 去绑定）"。
- **单聊调教**：每条回复可展开"本轮注入 世界书 2 条"，条目名可跳来源；上下文面板显示真实 token 用量与"全局书也在生效"。
- **群聊**：页头明确"群聊不加载世界书与文档检索，角色级模型参数不生效"（把不存在说清楚），成员可点进编辑；`/chat` ⇄ `/group` 分段一键切换，切换后底栏仍在。
- **回溯**：「记录」页（标题「群聊记录」）下两个 tab：群聊记录 / 已归档会话；角色版本从角色卡也能进。
- **嫌侧栏太长**（M2-b8 已落地）：`/more` 顶部「侧栏入口 → 编辑」，勾掉的不进桌面左侧栏；「更多」与「设置」不可隐藏，被收起又想找回来时，它们列在「更多」页底部的「已从侧栏收起」里，一键"恢复显示全部入口"即可全回来。移动端底部 6 个 Tab 不受这个开关影响。
- **拖动滑块 / 点按钮 / 等提示消失**（M2-b9 已落地）：滑块轨道左段随值着色（青=强调色，与拇指同色），拇指在悬停与按下时有光晕并放大；任何按钮/可点元素悬停都会叠一层同色底、按下时下沉 1px；提示弹窗按类型 3s（信息/成功）或 5s（错误）自己关，底部有一条随剩余时间收窄的倒计时条，**鼠标停在提示上或 Tab 到关闭按钮时计时暂停**，移开后继续；连点也只会在 5 条内排队，同一条文字重复触发不再重排。

### 6.3 进阶配置

- **本地模型**：每个按钮都有"为什么不能点"；加载成功后直接"去设置选中它"。设置里「本地模型（页）/ 模型接入（类）/ 使用本地 Provider（项）」三处称谓与动作连贯。
- **向量检索**：「检索」类里开关写明默认关闭 + 两个前置及入口。
- **图片生成**：配置在本页且刷新不丢；页头写明"当前生效来源 = 本页配置，设置里的图片分类不影响本页"与"结果保存在图库，不会进对话"。
- **市场**：安装后提示"已加入角色列表"并可跳；订阅更新从角色卡可见。

### 6.4 移动端

底栏保持 6 tab（对话/角色/市场/世界/更多/设置），`/group` 通过对话页分段控件进入且不再消失底栏；`/more` 顶部是任务中心、其余按组分区且每卡显示描述；就绪条窄屏折为一行徽标。

### 6.5 任务路径对照

| 任务 | 改造前 | 改造后 |
|---|---|---|
| 第一条消息 | 3 屏 / 12+ 控件 / 失败后才知道缺什么 | 空态 → 任务 1 步直达设置对应类 → 回卡自动勾选；发送前就绪条已给原因 |
| 建角色 | 1 屏 6 段 23 label / 1 星号 / 看不到绑定 | 快速档 4 步（含绑定），完整档全字段但高级折叠、必填/选填系统化 |
| 世界书生效 | 3 屏 4 跳 / 无命中反馈 | 双向可跳 + 每条回复可展开命中 |
| 文档被检索 | 上传即误以为生效，两隐藏前提 | 一屏内两个前提状态 + 一键完成 |
| 语音朗读 | 找不到"扩展"里的开关，失败不给跳转 | 「语音与辅助」+ 失败原因与跳转 |
| 接本地模型 | 死端 + 手动再配 | 原因可读 + 成功后一步选中 |

---

## 七、后续持续优化方向

> 每条给"为何本次不做"和"启动信号"。

| # | 方向 | 为何不做 | 启动信号 |
|---|---|---|---|
| 1 | 全局命令面板（Ctrl+K）与快捷键图 | 属新增能力；nav-model 已备好数据源 | 页面数再增或"找不到入口"仍高频 |
| 2 | 面包屑 / 层级定位组件 | 现仅两层，"组 + 标题 + 返回"已覆盖 | 出现三级页面 |
| 3 | trace 覆盖文档段与随机事件、覆盖群聊 | 需改检索管线返回结构化命中（现为字符串，`chat-context.ts:163-167`/`data-bank.ts:246-259`）与群聊 `onPromptBuilt`（`GroupChatView.vue:695-706` 不传） | 单聊 trace 被频繁用于调试 |
| 4 | 发送前"试触发"预览世界书命中 | 需新增扫描调用与 UI | 用户强烈要求调试态 |
| 5 | 随机事件"场景名 = 角色名"改显式绑定 + 旧值迁移 | 触及运行时匹配（E10），属功能改造 | 改名停摆的实际反馈 |
| 6 | 四条死 UI 的接通（E12/E13/E16/E25） | D-E 决策为撤；接通需语义设计 | 产品确认它们应有行为 |
| 7 | 群聊支持世界书 / RAG / 角色级模型参数，或产品正式排除 | 二者都是功能级改动 | 群聊成主推场景 |
| 8 | 图片生成接入消息附件、ASR 语音输入 | 无附件字段、无 ASR 代码 | 创作闭环需求 |
| 9 | 市场 URL 运行期可配（E21）+ 市场安装与更新的用户可见反馈 | 本议题只补提示与跳转 | 自建市场源成常态 |
| 10 | 209 个未引用 i18n 键清理 + 新增"死键"检查（现无门禁：`i18n:check:strict` 只扫硬编码中文） | 本议题只做增量与本次撤下产生的死键 | 下一次 i18n 专项治理 |
| 11 | 持久化前缀统一（`aijiuguan.stopwordFilterEnabled` vs `ai-roleplay:*`） | 迁移需双路读写 | 需跨端迁移或备份格式变更 |
| 12 | `personas` 死存储清理（`storage/indexeddb-adapter.ts:330-347`、`core/backup.ts:51`、`scope:'persona'` 过滤值 `core/lorebook.ts:118`） | O-13 已删功能，数据残留需迁移脚本 | 备份体积或 schema 演进需要 |
| 13 | 检索参数 UI 化（`RAGConfig` 的 `maxChunks/depth/recentMessageCount/maxKeywords`，加 chunk size 与相似度阈值） | 属能力暴露，需先有「检索」类承载 | 召回质量可调需求 |
| 14 | ~~`title=` 71 处全量迁移 `HelpTip`~~ **前半已在 M4-b1 结案**（口径纠正为 75 处 `:title=`，其中 42 处是 `<Modal>` 对话框标题、真正原生 tooltip 是 33 处；已按 v-tip / aria-label / 可见文字处置，仅剩 1 处白名单，并有 `tests/accessibility/no-native-title.test.ts` 守着）。**剩下的**：全站键盘焦点顺序与陷阱审计（本批只保证 tooltip 类信息不再依赖指针） | M3 先建原语与关键项 | 无障碍专项。**改道记录**：原方案的 HelpTip 组件在 33 处里只能服务 2 处（按钮不能套按钮、v-for 会重复 id、不支持插值），故改用 `v-tip` 指令 |
| 15 | 消息 `outcome/error` 旗标（现错误写进 `content`） | 属数据契约扩展，本议题只做 trace 一个可选字段 | T3 需要"成功"而非"已回复" |
| 16 | 引导有效性度量（纯本地，不上传） | 需先定度量口径与隐私边界 | 需判断哪些任务卡真有用 |
| 17 | 巨型 SFC 继续拆分（17 个 >1000 行，本次只按可见密度拆） | 纯工程收益，混做放大回归面 | 下次触碰同文件的任意需求 |
| 18 | 设计文档收敛（`mobile-ui-design.md` §13 五/六 tab、`software-design-document.md:35,116,135`、`mobile-pwa-plan.md:48`、`PROJECT_INDEX.md:323-337` 缺 `MoreView`、`PLAN_AUDIT_2026-09-28.md:97` 对 EXP-02 的高估） | 本文档给出目标态，M1–M4 落地后统一回写 | M1 完成即先回写 tab 与 PROJECT_INDEX |
| 19 | 会话模型改为**按角色记住各自激活会话**（`activeChatId` 由单值变映射），并让"切角色 → 该角色上次那段"直接接回 | D-R 已把"写错会话"这条数据丢失堵住（按 `characterId` 纠偏），但"切回甲时仍显示甲的默认会话而非甲上次打开的那条"这个体验缺口需要动会话模型，与"一次会话只属于一个角色"的索引结构一起改才干净 | 多会话使用率上来，或用户反馈"切回来不是刚才那段" |
| 20 | ~~设置写入不可等待~~ **根因已在 M2-b8 修掉**（`persistSettings` 改为排队串行）；**剩下的范围**是给 20 余处 `void persistSettings()` 调用点做一遍审计：哪些应当 `await`（如关闭标签前、跳转前），要不要提供 `flushSettings()` | M2-b6 把它记成"激活态可能还没落盘"，M2-b8 查清了真正的机制：**并发写完成顺序会倒置**，先发起的旧快照后落盘把新状态盖掉。单测 `tests/stores/settings-persist-order.test.ts` 用"第一次写慢、后续写快"的假适配器钉死顺序，去掉串行立刻复现（`expected {p2,2} to equal {p1,1}`） | 真人反馈"配好模型刷新又没了"再次出现，或要做"关闭前确保保存"的语义 |
| 21 | ~~世界书"事件"面板是一条死路~~ **已在 M6-f 结案**：`validateEvent` 拆成 `validateEventValues`（取值错误，拦写入）与 `validateEventCompleteness`（完整性错误，拦激活），`updateEvent` 只跑前者、`triggerEvent` 补查后者 | 登记时的判断"属校验语义设计问题，不是改两行能收口的"成立，但改动量比预想小：核心是拆函数 + 挪拦的位置，共动 3 个源文件。附带发现并修掉一处同源噪声：面板监听 `lastInfo` 弹提示，逐字段输入若能存进去就会**每敲一个字弹一条**，故 `updateEvent` 加 `{ silent }`，面板的 12 处字段写入统一走静默。反证用例：`tests/components/worldbook-events-panel-edit.test.ts`（4 例，含"没填全点触发被拒且逐条说缺什么"）与 `e2e/ux-event-manual-trace.spec.ts`（浏览器级：逐字段配一条全局关键词事件 → 命中它的那一轮出现回显） | 已闭。剩余同类问题（`:value` 单向绑定在写入被拒时"字看着还在"）在取值错误路径上仍存在，见 §九 M6-f 未做 ① |

---

## 八、自我评审记录

评审维度固定四项：**证据可复核性 / 遗漏面 / 歧义与自相矛盾 / 实施可行性与回归风险**。

### 第 1 轮：引用核查（对抗式，逐条 `file:line` 比对代码）

- **规模**：249 条引用（152 个唯一 `file:line` + 97 个承接上文的裸 `:NN`），发现 **33 处问题**。
- **已修正的代表性错误**：
  1. `/profile` 是否在 `/more`：v1 写"除 profile 外"，错（`MoreView.vue:22` 确含它）→ 已改，并据此修正"无页内跳入路由数"从 10 → **8**，同时把"17 条全部有导航入口"改为按 §1.2 表格的严格表述。
  2. 依赖边总数 23 → 实为 **24 行**，重排后定为 **25 条（E01–E25）**；v1 的"可一跳 4 条"无支撑，按行复算实为 **1 条**；§四 的"≥18/23"在新分母下自相矛盾 → 第 1 轮改为"18 转 A + 4 撤下 + 3 声明"，**该式又被第 4 轮否定为 17/4/4**（见 §八 第 4 轮矛盾 #2；正文以 17/4/4 为准）。
  3. `zh.ts:541`（误引 `ctx.worldEmpty`）→ 正确为 `wb.boundCharsEmpty`（`zh.ts:1856`，渲染 `WorldBookView.vue:1014`）；同时补入 `wb.boundCharsHint`（`:1855`）"对话时将自动注入世界书条目"这一**界面无证据支撑的承诺**，作为 E02 的直接佐证。
  4. `chat-context.ts:54-53` 区间倒置 → `:55-69`，全局书在 `:63`。
  5. "设置内没有图片生成配置段"→ **错**：设置确有 `category='image-video'`（`SettingsModelPanel.vue:472-495,985-995`；`types/index.ts:213,225`）。真实缺陷更强：**两处都能配且互不读取**，`getPrimaryModel('image-video')` 的唯一读者是设置页自身（`:490`）→ 已重写为 E22（含 `stores/image-generation.ts:45,89`、`stores/settings.ts:995-1035` 无 imageGen ⇒ 刷新丢）。
  6. `core/community-market.ts:436-463` 误引（实为 `applyFilter/applySort`）；已复核安装真实写点为 `stores/community-market.ts:454`（`charStore.characters.push`），评审中另一路"市场不产生角色"的说法**不成立**，本文档保留 E20 但换用正确引用（`core` 的 `downloadCard:561-584` 只记交易计数）。
  7. `core/image-generation.ts:45` / `:110-117` 文件归属错（分别是注释与 `GenerationProgress` 接口）→ 改指 `src/stores/image-generation.ts:45,89,109-117`。
  8. `core/type-adapters.ts` → `src/services/type-adapters.ts:244`，并补漏掉的 `src/data/mock-data.ts:31,101,122,143`。
  9. `utils/chat-error.ts` → `src/services/chat-error.ts`；`lorebook.ts:164` → `core/lorebook.ts:118`；`ctx.userProfileTitle` → `ctx.worldUserProfileTitle`（`zh.ts:518`）；`categoryExtension`(`:2160`) 与 `categoryExtensionDesc`(`:2161`) 值错配；`zh.ts:1724` 属 `charEdit.maxTokensHint`（非 profileId 绑定）→ 已改归因。
  10. `/story`、`/archives` 误归"无 CTA"（`StoryEngineView.vue:951-962` 块内含 `:955-962` 的上传按钮、`ArchivesView.vue:312-323` 块内含 `:316-323` 的 `clearFilters` 链接）→ 空态带 CTA 由 3 → **5**，分母钉死为 §0.3 的 12 视图集合（§1.5 与本条使用同一区间口径，避免第 4 轮指出的范围不一致）。
  11. "状态指令无解释"→ 错（`ContextPanel.vue:753` 渲染 `status.instructionHint`）；"世界书正则键零提示"→ 错（`wb.keysLabel` `zh.ts:1929` 已声明支持）→ 两条均改写为"提示存在但不足"：前者缺 preset 覆盖说明（`creation-preset.ts:162-164`），后者缺非法 pattern 的**静默降级**反馈（`lorebook-scanner.ts:44-56`）。
  12. `RAGConfig` 字段被夸大（无 chunk size / 阈值，实为 `maxChunks/depth/recentMessageCount/maxKeywords`）→ 已按 `core/data-bank.ts:71-80` 改正，并把 chunk size / 阈值归位到 `document-chunker` 与 `VectorRagOptions`。
  13. 计数口径不实：`.field-hint/.form-hint` 72 → 81 行（模板用法 65）；`showToast` 291 → 283 调用；"11 个视图有页头" → **12**；设置面板合计 83+56 → **67 button + 46 input + 1 textarea + 11 select**；控件最密第 5 名是 `CharacterVersionView.vue`(38) 而非市场(37)；`ApiErrorModal` 范围补 `:189-204`。
  14. 引用歧义：`LocalModelView.vue` 的 `:344`（实为 `:340`）、`:1314`（应写作 `zh.ts:1314`）、MoreView 行内 "`:31` NavKey"（应为 `src/types/index.ts:31`）、`DataBankView.vue:49`（computed，渲染在 `:337-345`）。
  15. 关于 `e2e` 的"依赖 `nav.archives`/profile 文案的用例"**不存在**（已 grep 证实）→ 换成真实会破的测试清单（§5.2 末行）。
- **本轮结论**：v1 的骨架与因果论证成立，但引用密度不足以出版；已全部替换，并把两处依赖边（E11、E22）的**判断本身**改正。

### 第 2 轮：逻辑严密性与遗漏面（对抗式）

| 发现 | 判定 | 处置 |
|---|---|---|
| BLOCKER B1：§五 漏 8 个文件（`CommunityMarketView` `SettingsAboutPanel` `SettingsAppearancePanel` `SettingsDataPanel` `NewConversationModal` `ApiErrorModal` `MessageBubble` `CharacterList`）；TL;DR 的"3 个布局组件"错（`components/layout/` 实为 `CharacterList`/`ContextPanel`/`NavRail`，`BottomNav` 在 `components/mobile/`） | 成立 | **v2 实际只补了 5 个**（第 4 轮指出 `SettingsAppearancePanel`/`SettingsDataPanel`/`SettingsAboutPanel` 三行缺失，且原表述"已补齐"为不实声明）→ **v3 已补三行**（§5.2）；TL/DR 审查范围改写为视图/面板文件/导航面/对话框入口四类 |
| BLOCKER B2：一次跳转架构**没有承载物**——`SettingsView.vue` 无 `useRoute`、无 `?tab=`；`?from=` 全文只出现一次且无归属 | 成立 | 新增 §3.6.3 深链与返回契约 + `useReadinessJump.ts` + `readiness.ts`（§5.1），并规定 push/replace 与白名单校验 |
| BLOCKER B3：边计数与目标算术不自洽 | 成立 | 引入 E01–E25 稳定编号 + 分类合计口径 + 目标改"18/4/3"（§1.4、§4）；**该目标在 v3 再改为 17/4/4**（第 4 轮矛盾 #2） |
| BLOCKER B4：trace 未定内存还是持久化，而 §4 断言"刷新后仍在"，与 §5.4"不改 schema"读起来冲突 | 成立 | D-J 决策：消息可选字段 `promptTrace`；§5.4 措辞改为"不改 IndexedDB store 结构，仅在类型上增可选字段"；范围限单聊（群聊不传 `onPromptBuilt`） |
| MAJOR M5：4 组/13 项 与 新增"引导 + 更多"两个 rail 项自相矛盾 | 成立 | 统一表述"13 内容项 + 2 系统项"，系统项不入组（§3.2.2） |
| MAJOR M6：移动端"5 tab"会删掉 `community-market` 唯一移动入口，且会破 `mobile-layout.spec.ts:48` | 成立且严重 | D-F/D-G：tab 集合**保持 6**，改回写设计文档；`group` 移出 `DETAIL_ROUTES` 解决单向门 |
| MAJOR M7：`currentNav` "若无其他读者则删"是伪条件（`tests/stores/character.test.ts:170-173`、`tests/core/mobile-nav.test.ts:33`、`character.ts:629` 均是读者） | 成立 | 直接决策删除并列入测试改动；§5.2 增加 `tests/` 清单（v1 只列 `e2e/`，coverage 门禁会失守） |
| MAJOR M8："待裁决 5 项"里有 6 处"或"未决（tokenBudget 二选一、chat 作用域、WorldBook chat 过滤矛盾、图片指向、currentNav、设置指向） | 成立 | 扩为 11 项 D-A…D-K，逐项已给推荐与理由 |
| MAJOR M9："只做呈现层"与自身的持久化/管线改动矛盾 | 成立 | 新增 §5.5 四类改动（P/R/W/B）与分类回滚 |
| MAJOR M10：验收方式不可执行（`grep -c 语义跳转点` 会把"返回"按钮算进去；"≤25 控件"用的是自认的重复计数法；把双语检查归给 `i18n:check:strict`，而该脚本只扫硬编码中文，parity 实际在 `tests/i18n.test.ts:49`） | 成立 | 改 `data-rel-jump` 属性计数 + DOM 实测密度 + 指名测试文件；§3.6.6 更正门禁归属 |
| MAJOR M11/M12/M13：目标无产生机制、任务态无 schema（存储位置/导入恢复/清空数据/锁定态）、四个表面可能同时播报同一原因 | 成立 | §3.3 增加展示优先级与唯一 selector；§3.5.2 定 schema 与"只存意图不存结论"的实时计算策略；§4 补"删数据后 completed 自动回落"的可执行断言 |
| MAJOR M14：a11y 与 CSS 门禁无人认领（`hover-guard`、断点白名单、`!important` 基线 26、≥16px、AA 4.5 + axe 审计集，12px 组标题是活风险） | 成立 | §3.6.7 列出五道约束；§5.1 增 `tests/accessibility/new-primitives-axe.test.ts` |
| MINOR m15–m19：空态分母未钉、§八 空、快速档在"尚无 ID"时给编辑跳转的草稿态问题、`/profile` 摘除后的键处置、"零引用"grep 口径 | 成立 | §0.3 钉集合；本节即记录；§3.5.6 规定绑定动作在拿到 ID 之后；§5.2 `ProfileView` 行给键处置；§1.5 注明全域 grep 口径 |
| 评审提出"市场不安装角色、`downloadCard` 只计数" | **不成立** | 经直读复核：`stores/community-market.ts:454` 确实 `charStore.characters.push`；评审只看了 `core` 层。已换用正确引用并保留 E20 |

### 第 3 轮：可行性压力测试（计划 vs 代码）

| 发现 | 判定 | 处置 |
|---|---|---|
| nav-model 匹配须按**路由 name**（三渲染器现状都按 name，且 name≠path），`/character` 是 `/character-version` 前缀 ⇒ path 前缀匹配会误高亮 | 成立 | `routeName` + `activeWhen` 字段（§3.2.1） |
| `/more` 无法归属到某组 | 成立 | 按"系统项"高亮自身，不硬造来源（§3.2.3） |
| 向量开关为非响应式 localStorage 读（`VectorModelPanel.vue:276` 仅挂载镜像） | 成立 | readiness 需 store 镜像 + `storage` 订阅（§3.3） |
| 锁定 vs 未配置**已有正确实现**可复用：`checkSendBlock()`（`chat-generation.ts:593-600`）；误报源头是 `:1001-1003` 在 `chatManager` 为 null 时写 `noApiProfile2`，而 `App.vue:170-178,317-321` 锁定返回 null 且不清 | 成立 | §3.3 直接复用并列入 §5.2 修改点，与 D-10 一并收口 |
| `ActivatedEntry` 含**整条正文**（`lorebook-scanner.ts:29-38`）；文档/事件命中已被拼成字符串；群聊走 `buildPrompt` 但不传 `contexts`/`onPromptBuilt` | 成立 | 只透传 `id/name/matchedKeys`；trace 限单聊；文档/事件计数列 §七 #3，v1 不承诺（§3.3、§5.2） |
| 无 per-message 错误旗标（错误进 `content`，`lastError` 内存），"朗读成功一次"无状态源 | 成立 | T3 判据降为"存在 assistant 消息"，T6 降为配置态；§八 记录、§七 #15 排期 |
| 设置拆类会破 `tests/views/settings-local-model.test.ts:89-95`（`toBe(6)` + 六个类名）与四处 `clickCategory('模型')`；roving 键盘与 `v-show` 保态不受影响；`VectorModelPanel` `onMounted` 本已急切执行 | 成立（部分为好消息） | §5.2 末行列测试改动；§3.6.1 记录"不新增也不节省成本" |
| `/group` 嵌套进 `/chat` 会重复 `id="main-content"`（`GroupChatView.vue:958`、`ChatMain.vue:731`、`App.vue:326`）并撞 `ChatView.vue:19,26-36` 的滚动锁与 `inert` | 成立 | D-A 明确"仅路由互链"（§3.2.4） |
| chat 作用域文档：store 与 `activeChatId` 支持，但 `chat-context.ts:163-167` 硬编码 `scope='character'` ⇒ 只加单选会**新造**一条死 UI | 成立 | §3.4 决定撤列表而非加控件（§4 负向对照同步锁死） |
| 图片配置缺的是持久化（`updateProviderConfig` 未被调用、`settings.ts:995-1035` 无 imageGen、apiKey 需走 Profile 加密分支——行号在第 4 轮由 `:970-985` 校正为 `:968-980`），不是"缺配置段" | 成立 | §5.2 图片行改为"持久化 + 来源说明"，D-K 记录，D-M 定分支 |
| 无"死键"门禁 ⇒ 改名会静默留尸 | 成立 | §七 #10；本次仅清自己造出的死键 |

**第 3 轮结论**：M1/M2/M3 均可实施；三处 v1 低估（trace 持久化、任务判据的数据缺口、`/group` 集成方式）已改为明确决策或降级承诺，未留"计划里有但代码做不到"的项。

### 第 4 轮：v2 新增引用的核查与内部一致性复算

v2 的改写引入了约百条**新**引用（门禁脚本、测试行号、持久化白名单、适配层），这些在第 1 轮并未覆盖。第 4 轮专查这批引用，共核对 96 条，结果：**16 处引用问题 + 9 处内部矛盾**（评审方汇总为 24，本文按逐条复算为准），另确认 §1.4 的 A1/B6/C11/D4/E3 = 25 复算无误。

**引用类（已全部改正）**

| # | 原引用 | 实情 | v3 处置 |
|---|---|---|---|
| 1–4 | `scripts/css-gates/{hover,breakpoint,important}-guard.mjs:9-25/:14-17/:28` | **目录不存在**；脚本在 `scripts/` 根；规则声明在 `hover-guard.mjs:16`（执行 `:33`）、断点白名单在 `breakpoint-guard.mjs:12,25-27`、`BASELINE_TOTAL=26` 在 `important-guard.mjs:30` | §3.6.7 全行重写为正确路径与行号 |
| 5–6 | `mobile-layout.spec.ts:48`（`toHaveCount(6)`）、`:50,63,118`（"community-market hrefs"） | `toHaveCount(6)` 在 `:49`（`:48` 是 locator）；`:63` 是单高亮守卫、`:118` 是另一用例的循环头；真正会动的是 `:22,49,63,120` | §5.2 测试行改用正确清单，并补 `:22` 本文件自带 MAIN_TABS |
| 7 | `tests/core/mobile-nav.test.ts:33` 被当作 `currentNav` 读者 | 该行是 `isMainTab('profile')`，与 `currentNav` 无关；`currentNav` 的唯一测试读者是 `tests/stores/character.test.ts:170-173` | §3.2.3 与 §5.2 已删误引 |
| 8 | `tests/core/mobile-nav.test.ts:14-17` 被当作会破的断言 | 它断言 MAIN_TABS，而 D-F 决定 tab 不变 ⇒ **不破**；会破的是 `:46` 的 `isDetailRoute('group')` | §5.2 改为 `:46` 并说明 `:14-17` 不受影响 |
| 9 | `stores/settings.ts:970-985` "apiKey 加密分支" | Profile 分支是 `:968-980`；`:982-993` 属于翻译 | §四/§3.7.2（D-M）改为 `:968-980` |
| 10 | `stores/character.ts:629` 被称"定义与持久化" | `:629` 是 store 返回值条目；`currentNav` **从不落盘** | §1.1/§3.2.3/§5.2 改为"定义 `:56,246`、返回值 `:629,655`、不持久化"（顺带说明删除无迁移成本） |
| 11 | `services/type-adapters.ts:330` 当作"三处适配"之一 | `:330` 属批量包装 `chatMsgsToUiMsgs`（约 `:337-340`）；字段级映射实为 `uiMsgToChatMsg` `:275-295` 与 `chatMsgToUiMsg` `:306-325` | §3.3 改为两处字段级映射 + 批量包装（v3 已按实测行号写入） |
| 12 | `components/common/NewConversationModal.vue` | 实际在 `src/components/chat/`（行号 `198/227/254-262` 正确） | §5.2 行首更正并加注 |
| 13 | §1.2 把 `MoreView.vue:40` 的 `.active` 恒假归因于 `NavKey` 缺 `more` | 真因是该页渲染**其它**路由的入口项，`route.name !== entry.name` 恒成立 | §1.2 已改写（两处因果分开） |
| 14 | E25 "列表存在而通道不通" | 更强：该段 `v-if="chatDocuments.length > 0"`，而上传对话框只有全局/角色 ⇒ **chat 域文档无入口可产出**，列表永不出现 | E25 行改为"三重不可达"（`stores/data-bank.ts:67,164,210-213` + `DataBankView.vue:337-345,412-431` + `chat-context.ts:163-167`） |
| 15 | E16 的 select 在 `:1139` | select 为 `:1136-1150`，写者调用在 `:1140`（`:1139` 是 `:value` 绑定） | §3.4/§5.2 更新 |
| 16 | `RandomEventsView:1034`（`.empty-state`） | 规则起于 `:1032` | §1.5 更正 |

**内部矛盾类（已全部消除）**

| # | 矛盾 | v3 处置 |
|---|---|---|
| 1 | §1.8/§2.1/§四 的"66 控件面"与 §0.3 自设的字面标签口径冲突（`SettingsView.vue:204-213` 是 **1 个** `v-for` 按钮） | 统一为"**60（字面标签）/ 66（v-for 展开）**"，两种口径同时给出（§1.8、§2.1、§四、TL;DR） |
| 2 | §四"18 条转 A"在 §0.2 的定义下不可能（E08 无可跳目标） | 改为 **17 转 A + 4 撤下 + 4 显式声明**（声明类含 E08/E18/E21/E23），17+4+4=25 |
| 3 | E21 承诺"显式声明不存在"但没有任何表面承载（`PrereqNotice` 位置清单里没有市场页） | §5.2 `CommunityMarketView.vue` 行新增**声明落点**（页头副标题） |
| 4 | §3.3 就绪条行的"消灭的边"单元格写成 `E02? 否——…E15`，自相矛盾且 E15 不属于 5 个 chip | 改为显式边清单 **E01 E03 E04 E05 E06 E07 E09 E22**，并注明 E02/E03 归 trace、E08/E18 归群聊页头声明 |
| 5 | §八 写"12 条可行性风险"，而第 3 轮表实际有 **11** 行（该"10 行"的初判亦不准，第 5 轮复核为 11） | 本节的收敛判定按逐轮实数重述（第 3 轮计 11 条） |
| 6 | §八 B1 声称"§5.2 补齐全部行"，但三个设置面板文件当时并未补 | §5.2 已补 `SettingsAppearancePanel`/`SettingsDataPanel`/`SettingsAboutPanel` 三行（其中 AboutPanel 一度被误放进 §5.1「新增文件」表，第 5 轮移正），且本表把"不实声明"本身记录在案 |
| 7 | TL;DR"约 250 条引用已逐行核对"与仍存在的错路径并存 | 改为按轮次如实计数：核查进行三轮（第 1 轮 249 条 / 第 4 轮 96 条 / 第 5 轮复核第 4 轮的修订），累计纠正 33 + 16 + 7 处 |
| 8 | 正文残留 5 处"或 / 需决定"未登记为决策（新视图文件、apiKey、WorldBook chat 过滤、mock-data 改名、contrast 审计路由） | 全部转为 **§3.7.2 D-L…D-O** 的明确决定；§1.4 D-E 相关行与 §5.2 措辞同步去掉"或" |
| 9 | §八 第 1 轮与 §1.5 对同一证据用了不同区间（955-962 / 951-962） | 统一为块区间并注明（本条即修订说明） |

### 第 5 轮：对"第 4 轮修订本身"的复核（v3 手改 20 余处后的再核查）

第 4 轮的修订是手工定点替换，会把已修的引用改出新错、也会留下未被波及的旧值。第 5 轮专查这一点，结论：**7 处残留缺陷 + 4 处行号漂移**，全部已在 v3 内改正。

| # | 残留缺陷 | v3 处置 |
|---|---|---|
| 1 | §3.3 的 `type-adapters` 行号写反（`:300-325` / `:337-340`）——实测 `uiMsgToChatMsg` 在 `:275-295`、`chatMsgToUiMsg` 在 `:306-325`，`:330` 与 `:337-340` 属批量包装 `chatMsgsToUiMsgs` | 已按实测行号改写，并同步 §八 第 4 轮 #11 的记述 |
| 2 | §5.2 图片行仍留 `:970-985`（跨进翻译分支），与 D-M 定的 `:968-980` 自相矛盾 | 已统一为 `:968-980`，并注明 `:982-993` 属翻译、不复用 |
| 3 | §3.6.7 遗留表外未决句"改用现有 `text-2` **或**提高对比令牌" | 已定为 `text-2`（不新增颜色令牌，避免触动 contrast 的主题基线） |
| 4 | §八 第 1 轮 #2 与 B3 记录仍写"18/4/3"，与正文的 17/4/4 并存 | 两处均加"该式已被第 4 轮否定，正文以 17/4/4 为准"的标注（历史记录保留，但不再构成矛盾） |
| 5 | §八 第 3 轮表有 **11** 行，而收敛判定写"10 条可行性风险" | 下方收敛判定按 11 重述 |
| 6 | `SettingsAboutPanel.vue` 的行被放进 §5.1「新增文件」表，但它在 `d34df56` 已存在（138 行 / 0 控件） | 已移入 §5.2 修改文件表（这也使 §八 B1 的"v3 已补三行"成为事实） |
| 7 | §3.4 标题写"三条"，正文却处置 **四** 条边（E12/E13/E16/E25） | 标题改"四条" |

**行号漂移校正（同轮）**：E16 的 select 由 `:1139` 改为 `:1136-1150`（调用点 `:1140`，`:1139` 是 `:value` 绑定）；`NewConversationModal` 步骤标记由 `:254-262` 改为 `:259-264`（`:254` 是 Modal 的 `aria-label`）；`mobile-layout.spec.ts:22` 是 community-market 单项、MAIN_TABS 清单实为 `:19-26`；§四"设置密度"行补 60/66 双口径以与 §1.8 一致。

**同轮复核通过项**：Markdown 表格完整性——本地脚本计 **29 张表 / 0 处列数失配**（评审方计 30 张，差异在表头识别口径，两方均为 0 失配）；§3.6.7 重写、§3.7.2、E21 落点、E25"三重不可达"、`:1032` 等第 4 轮修订确已落地；分组求和 2+5+3+3=13 与现状"12 + 2"表述一致；D-A…D-K 与 D-L…D-O 全部存在；§〇…§八 编号无漂移、七节意图正确。**另消除一处口径冲突**：§3.3 把 D-H/D-J 称"已决策"而 §3.7 列其为"待裁决" → §3.7 引言改为"正文已按推荐列落笔，改判只需回退对应段落"。

### 收敛判定

五轮累计：**第 1 轮** 249 条引用 → 33 处问题；**第 2 轮** 4 BLOCKER + 10 MAJOR + 5 MINOR + 1 条评审判定被驳回；**第 3 轮** 11 条可行性风险；**第 4 轮** 96 条引用 → 16 处引用问题 + 9 处内部矛盾；**第 5 轮** 复核第 4 轮修订 → 7 处残留 + 4 处行号漂移，全部改正，且未发现新的引用错配或算术冲突。

全部结论已在正文处置或转为明确决策（§3.7 的 11 项待裁决 + §3.7.2 的 7 项自决，其中 D-P 是实施中否定本文初稿设计后补记的决定、D-Q 是 M2-b3 的 e2e 实测补入的新缺陷、D-R 是 M2-b4 写 D-Q 测试时实测出的数据丢失）。评审遗留的"待产品确认"仅 3 处，且都不阻断 M1：D-K 的图片配置归属偏好、E21 的市场 URL 口径（与提交信息"D-1 市场 URL 可配"的口径差异需产品确认是否升级为运行期设置）、§七 #6 的死 UI 是否接通。

**判定收敛**：每条"现状"有可核对的 `file:line`，每条"目标"有可执行断言与承载组件，每条"改动"有归属文件与回滚类别（P/R/W/B），每条"不做"有理由与排期去处，未决项全部编号；第 5 轮之后再无新增修订项。

---

## 九、实施记录与验证证据（按批次追加，与代码同提交）

> **行号口径**：§一 ~ §三 的所有 `file:line` 指证据基线 `d34df56`（见开头声明）；本节的行号指**该批次提交时**的工作树状态。两组行号不可互相换算——`i18n` 每加一批键就会让 `zh.ts` 之后的行号整体下移，这正是本文档坚持"证据与代码同版本"的原因。

### M1-a 导航单一事实源 + 分组 + 路由派生高亮（提交见本分支 `chore/feat(N):` 序列）

**落地范围**：§3.2 的第 1、2、3、5、6 条 + §3.2.4 的群聊底栏修复。改动分类：P 呈现层 + B 行为（底栏门禁、`/profile` 移出导航）。

| 文件 | 实际改动 |
|---|---|
| `src/core/nav-model.ts`（**新增**，约 250 行） | 14 个入口（13 内容 + 1 系统）× 4 组；每项带 `routeName` / `activeWhen` / `icon` / `labelKey` / `descKey` / `mobileTab(+Order,+LabelKey)` / `inMore`；导出 `activeEntryForRoute` `entriesOfGroup` `mobileTabEntries` `moreEntries` `systemEntries` `CONTENT_ENTRY_COUNT` |
| `src/components/layout/NavRail.vue` | 删除本地 `navItems`/`settingsItem`/`profileItem` 三份清单；改为按组渲染（`role="group"` + `aria-labelledby` 组标题）；激活态由 `route.name` 派生；每项补 `title=descKey`；删除死掉的 `isMobile` 分支（rail 仅 `!isMobile` 挂载） |
| `src/components/mobile/BottomNav.vue` | Tab 清单/顺序/图标/短称谓改自 `mobileTabEntries()`；删除硬编码 `tabs` 数组 |
| `src/core/mobile-nav.ts` | `MAIN_TABS`/`isMainTab` 移除（其唯一消费者被替换，见下）；`DETAIL_ROUTES` 去掉 `group`；`isDetailRoute` 由**零消费者**变为底栏真实门禁 |
| `src/App.vue:45` | `showBottomNav = isMobile && !isDetailRoute(route.name)`（原为 `isMainTab(...)`）。**发现**：`isDetailRoute` 此前无人读取，注释里"二级页隐藏底栏"是未被执行的规则；`/group` 无底栏的真因是它不是主 Tab |
| `src/views/MoreView.vue` | 按组分节渲染 `moreEntries()`（8 卡，新增群聊入口、移除个人中心），真正渲染 `descKey`，删除恒假的 `.active`（`:40`），补页头与返回 |
| `src/stores/character.ts` + `src/types/index.ts:31` | 删除 `currentNav` / `setNav` / `NavKey`（全仓零读者后不留死代码；该字段本就不落盘，无迁移） |
| `src/i18n/locales/{zh,en}.ts` | 各新增 19 键：`nav.group*` × 4、`nav.more`、`navDesc.*` × 14（双语同步） |
| `src/styles/layout.css` | 删除随之失效的 `.nav-item.settings { margin-top: auto }` |
| 测试 | 新增 `tests/core/nav-model.test.ts`（11 例）、`e2e/ux-nav-model.spec.ts`（4 例）、`e2e/mobile/mobile-nav-groups.spec.ts`（2 例）；`tests/core/mobile-nav.test.ts` 重写为沉浸页判定（4 例）；`tests/stores/character.test.ts` 删除 `setNav` 用例 |

**验证证据（本机实跑，全部同版本代码）**

| 门禁 | 命令 | 结果 |
|---|---|---|
| 类型 | `npm run typecheck` | 退出码 0 |
| 单元测试全量 | `npm test` | **145 文件通过 / 2 跳过**，含新增 nav-model 11 例与 i18n 双语 parity 12 例 |
| E2E（真实浏览器） | `E2E_PORT=5178 npx playwright test --project=msedge --project=mobile-msedge` | **33 passed**（桌面 27 + 移动 6，1.5 分钟），含"新建角色页点亮「角色」""`/character-version` 不误点亮「角色」""桌面可达 `/more` 且 4 组分节、卡片有描述""群聊页保住底栏且 6 入口不变""沉浸页仍隐藏底栏" |
| Lint | `npm run lint` | 退出码 0 |
| CSS 约定 | `npm run check:css-conventions` | **5/5 通过**（断点 / viewport / hover / `!important`=26 基线 / 控件字号） |
| i18n | `npm run i18n:check:strict` | 退出码 0 |
| 对比度 | `npm run a11y:contrast` | 退出码 0（组标题用 13px `--muted-foreground`，未引入 11–12px 低对比文本） |
| WebKit E2E | 未跑 | 本机无 webkit 浏览器（`npx playwright install` 未执行），由 CI 的 `webkit` project 覆盖；此项**未在本机验证** |

**顺手修掉的存量红（非本批次引入，属并行会话提交遗留）**

- `e2e/long-history-scroll.spec.ts:17-18`：`DB_NAME` / `DB_VERSION` 声明后未用 → eslint 2 error，已删除。
- `src/views/DataBankView.vue:1065`：`.search-empty-clear:hover` 未包 `@media (hover: hover) and (pointer: fine)` → hover 守卫失败，已包。
- `src/components/layout/CharacterList.vue:231`、`src/views/SettingsView.vue:240`：2 条 vue 格式 warning → `eslint --fix`。

**与计划的偏差（4 项，逐条给理由）**

1. **D-B 只做了一半**：`/profile` 已从 rail 与 `/more` 的导航面移除（`nav-model` 无该项），但**路由与 `ProfileView.vue` 保留、内容尚未并入设置→关于**——那需要 `SettingsView.vue` 的 `?cat=` 读取（M2 的 `useReadinessJump` 一起落地更省事），否则被摘掉入口的用户只剩一个空白页。当前 `/profile` 仍可靠 URL 直达，不构成不可达。
2. **第 2 个系统项（引导）未落**：rail 底部只加了"更多"。任务中心卡属于 M3，先放一个空入口会指向不存在的东西。
3. **`data-rel-jump` 标记不等于 §四 的"≥26 语义跳转点"**：本批次在 rail/聚合页入口上打了该属性，它们是**导航**而非**跨模块关联**。为避免自欺，M1-a **不计入**该指标；计数从 M2 的关联面板/就绪条真正落地后重新开始。
4. **群聊 ⇄ 单聊分段控件未落**：本批次先解决"进群聊后底栏消失"的单向门（真实缺陷，改动最小）；分段控件与 `ChatView`/`GroupChatView` 的 `main-content` 冲突分析一并留到 M2，避免在没有互跳承载点时先动布局。

**M1-a 后的度量现状（对照 §1.8 基线）**

| 指标 | 基线 | M1-a 后 | 距 §四 目标 |
|---|---|---|---|
| rail 结构 | 12 + 2 平铺 | 4 组 / 13 内容 + 1 系统，每项带职责提示 | 达标（**M2-b7 改为 12 内容 + 3 系统，并把竖排卡片改横排，见本节末 M2-b7**） |
| 高亮失准 | 3 处 | 0 处（e2e 断言） | 达标 |
| 桌面 `/more` 无入口 / 移动 `/group` 无底栏 | 2 项 | 0 项（e2e 断言） | 达标 |
| 无页内跳入的路由 | 8 / 17 | 7 / 17（`/group` 与 `/more` 已获聚合页入口；`/profile` 反向变差，见偏差 1） | M2 继续 |
| 跨模块语义跳转 | 9 | 9（**未变**，理由见偏差 3） | M2 → ≥26 |
| 空态带 CTA / `.empty-state` 副本 | 5 / 12、≥10 | 未动 | M3 |
| 设置类密度 | 「模型」60（v-for 展开 66） | 未动 | M4 |

### M2-a 关联层第一批：就绪判定唯一源 + 深链契约 + 三处关联落地

**落地范围**：§3.3 的 `core/readiness.ts`、`ContextReadinessBar`、`PrereqNotice`、世界书反向入口；§3.6.3 的深链与返回契约（提前于 M2 原计划，因为就绪条的"一步跳转"必须有承载物）。

| 文件 | 实际改动 |
|---|---|
| `src/core/readiness.ts`（新增） | `useReadinessChips()` 输出模型/世界书/文档检索/语音/状态指令五个芯片，状态四值 `ready/attention/locked/n-a` + 原因键 + 跳转目标；`modelReadiness()` 抽成纯函数以便脱离 WebCrypto 单测锁定态；`useDataBankPrereqs()` 输出数据银行三行前提 |
| `src/composables/useReadinessJump.ts`（新增） | `pushWithReturn()` 写 `?cat=&from=`，`from` 受**站内前缀白名单**约束（拒绝 `//` 与外部路径，防开放重定向）；`backFromQuery()` 用 `router.replace` 避免历史堆叠 |
| `src/core/dual-channel-runtime.ts` | 新增 `vectorRagEnabled` ref 作为 localStorage 开关的响应式镜像，`setVectorRagEnabled()` 同步它（原实现只在挂载时读一次，界面会显示陈旧状态） |
| `src/components/layout/ContextReadinessBar.vue`（新增） | 挂载于 `ChatMain.vue` 与 `GroupChatView.vue` 页头；每芯片带 `data-rel-jump`、`title` 原因、`:focus-visible` 焦点样式；hover 规则包在 `@media (hover: hover)` |
| `src/components/common/PrereqNotice.vue`（新增） | 挂载于 `/databank` 页头下方，三行前提 + 未完成行的"去完成"跳转 |
| `src/views/SettingsView.vue` | 开始读取 `?cat=`（此前无 `useRoute`，恒落"外观"）；`from` 存在时页头出现"返回来源页" |
| `src/views/WorldBookView.vue` | "已绑定角色"从只读 `<li>` 改为按钮（跳角色编辑并带 `from`）；空态补"去角色列表绑定"按钮，兑现 `wb.boundCharsEmpty`（`zh.ts:1856`）那句"请在角色编辑页的世界书绑定区域添加" |
| `src/views/GroupChatView.vue` | 页头加能力差异声明（`group.capabilityNote`）：群聊不加载世界书与文档检索、角色级模型参数不生效 —— E18/E08 走"显式声明不存在" |
| `i18n locales/{zh,en}.ts` | 各 +31 键（`readiness.*` / `prereq.*` / `wb.boundCharsGo*` / `group.capabilityNote` / `settings.backFrom`） |
| 测试 | 新增 `tests/core/readiness.test.ts`（12 例）、`tests/components/readiness-surfaces.test.ts`（5 例）、`e2e/ux-readiness.spec.ts`（4 例，真实 Edge 通过） |

**过程中的两个真实发现（写进文档，避免下次再踩）**

1. **`checkSendBlock()` 单独不足以判锁定态**。它第一步是 `if (chatManager) return null`，而锁定态下 `activeProfile` 同样返回 null（`App.vue:170-178`），于是"锁住了"与"从没配过"被折叠成同一个说法——这正是 D-10 误报的成因。`readiness` 因此读两个独立事实：`settings.hasMasterPassword && !settings.isUnlocked`（锁态）与 `!!settings.activeProfile`（存在性），再叠加 `checkSendBlock()` 兜住"已解锁但管理器未建"的残余情况。
2. **给 setup store 上不存在的字段赋值不会报错，只会静默无效**。第一版测试写 `settings.masterPasswordVerifier = 'x'` 与 `settings.masterPassword = ''`（这两个 ref 不在 store 返回面上，暴露的是 `hasMasterPassword` / `isUnlocked` / `setMasterPassword` / `lock`），结果芯片被判 `ready`，测试以"假通过"的方式失败。改走公开 API（`await setMasterPassword()` + `lock()`）后锁定态才被真实验证。

**验证证据（同版本代码，本机实跑）**

| 门禁 | 结果 |
|---|---|
| `npm run typecheck` | 退出码 0 |
| `tests/core/readiness.test.ts` | 12 passed（含真实主密码锁定用例） |
| `tests/components/readiness-surfaces.test.ts` | 5 passed（芯片数、跳转参数、ready 态不跳转、锁定文案不复用"未配置"、两表面判定源一致） |
| `e2e/ux-readiness.spec.ts`（msedge 真实浏览器） | 4 passed：`/chat` 就绪条 5 芯片且模型为 `is-attention` → 点击落 `/settings?cat=model&from=/chat` 且侧栏 active 为「模型」→"返回来源页"回到 `/chat`；`/databank` 三行前提并可跳设置；`/group` 能力声明 + 就绪条；`/worldbook` 绑定角色入口可点并带 `from` |
| 全量门禁（M2-a 合入前复跑，同一份工作树） | `npm run lint` 0；`npm run i18n:check:strict` 0；`npm run check:css-conventions` **5/5 通过**；`npm run a11y:contrast` 0（含 axe 审计集）；`npm run test:coverage` 0，**All files 78.78 / 73.49 / 80.86 / 80.7**（阈值 78/73/78/78 均达标且未放松）；`E2E_PORT=5178 npx playwright test --project=msedge --project=mobile-msedge` **37 passed**（含本批新增 4 条 + M1 的 6 条）；WebKit project 本机无浏览器未跑，由 CI 覆盖 |

**M2-a 未做、留给 M2-b**：`promptTrace` 与真实 token 用量（涉及 `services/chat-manager.ts` 载荷裁剪 + `types/index.ts` 可选字段 + `services/type-adapters.ts` 两处字段映射）；撤除 E12/E13/E16/E25 四处"有 UI 无读者"；`ModuleRelationsPanel` 在角色卡/编辑/版本/图片/市场的铺开；图片生成配置持久化与 `sub=image-video` 来源说明。

**M2-a 后的逐行复评（只列状态发生变化的边，其余保持 §1.4 原判）**

| 边 | 前 | 现在 | 承载物 |
|---|---|---|---|
| E01 角色 → 世界书 | B（可见不可跳） | **A** | 就绪条世界书芯片 + 世界书"已绑定角色"可点回编辑（e2e 断言 URL 带 `from`） |
| E04 文档 → 关键词检索 | B | **A** | `/databank` 前提行 + 文档芯片 |
| E05 文档 → 向量开关 | C（不可见） | **A** | `PrereqNotice` 第三行"去开启"→ `/settings?cat=model` |
| E06 文档 → 需绑世界书 | C（最隐蔽） | **A** | `PrereqNotice` 第二行 + 文档芯片原因键 `reasonStaticNeedsBinding` |
| E07 模型配置优先级 | B | **A**（状态与跳转可见，优先级明细仍在 `ContextPanel`） | 模型芯片 → `/settings?cat=model`，带返回 |
| E08 群聊忽略角色级参数 | C | **显式声明** | `group.capabilityNote`（无可跳目标，故不算 A） |
| E09 语音 → 设置"扩展" | C | **A** | 语音芯片跳转（`?cat=extension`） |
| E18 群聊能力集缺失 | E | **显式声明** | 同上 |
| E02/E03/E22/E24 | C | **未变** | 留给 M2-b（trace、ContextPanel 全局书、图片来源说明、真实 token 用量） |
| E12/E13/E16/E25 | D | **未变** | 撤 UI 属 M2-b，撤除即改变可见控件数，需与 §1.8 复评同批提交 |

### M3-a 引导层第一批：任务中心 + 常驻入口 + 首启欢迎改造

**落地范围**：§3.5 的第 1、2、3(部分)、4、7 条 + §3.2 遗漏的"零角色空态"。

| 文件 | 实际改动 |
|---|---|
| `src/core/guided-tasks.ts`（新增） | 9 个任务（6 主 + 3 进阶）× 若干步骤，每步 `hintKey / actionKey / jump / done`；判据全部读真实数据：`settings.apiProfiles/activeProfile` + 就绪芯片、`characters.length`、`currentCharacter.messages` 是否出现 assistant、`lorebooks` 与条目数、`dataBank.documents` + 前提清单满足数、`ttsConfig`；持久化只有意图 `{skipped[], collapsed, updatedAt}`（键 `ai-roleplay:guided-tasks.v1`），完成态不落盘（D-I） |
| `src/components/common/GuidedTasksCard.vue`（新增） | 任务列表 + `common.step`（"步骤 x/y"）+ 展开步骤 + 每步动作按钮走 `pushWithReturn`；跳过/取消跳过；进阶折叠；收起状态取自持久化意图 |
| `src/views/GuideView.vue` + `router` `/guide`（新增） | 任务中心页（页头 + 卡 + 说明"进度读真实数据而非看过页面"） |
| `src/core/nav-model.ts` | 第二个系统项 `guide`（rail 底部常驻入口），`NavEntryId` 增 `guide`；系统项由 1 → 2，rail 总数 14 → 15 |
| `src/views/MoreView.vue` | 顶部新增引导入口卡，显示实时进度（不是"看过即完成"） |
| `src/views/ChatView.vue` | 补零角色分支：`EmptyState`（新建角色 CTA）+ 任务卡，替换原先无条件的三栏（`ChatMain.vue:93` 的非空断言路径不再被走到） |
| `src/components/common/EmptyState.vue`（新增） | 空态原语：图标 + 标题 + 解释 + 主行动 + 插槽（此前 ≥10 份手写 `.empty-state` 的第一处收敛） |
| `src/components/common/OnboardingModal.vue` | 重写：4 条功能描述 → 3 步最短路径 + 两个真实动作（打开任务清单 / 现在配模型，均带 `from`）；关闭只表示"欢迎看过了"。顺带删除因此失效的 9 个 `onboarding.feature*` / `onboarding.start` 键（双语同删，不留死键） |
| `i18n locales/{zh,en}.ts` | 各 +63 键、各 -9 死键（`guide.*`、`chat.empty*`、`nav.guide`、`navDesc.guide`、`router.guide`、`onboarding.step*`） |
| 测试 | `tests/core/guided-tasks.test.ts`（9 例）、`tests/components/guided-tasks-card.test.ts`（5 例）、`e2e/ux-guided-tasks.spec.ts`（5 例，真实 Edge）；`tests/core/nav-model.test.ts` 与 `e2e/ux-nav-model.spec.ts` 的入口计数随系统项 +1 更新 |

**判据不是"看过页面"的可证伪证明（三条单测）**

- 删掉全部角色后，`t2-character` 从 complete 退回未完成；
- 只新增 Profile 只点亮第一步，设为当前且未锁定才点亮第二步；
- 跳过 `t6-voice` 后进度分母从 6 变 5，但任务仍在列表里、取消跳过即恢复。

**真实浏览器抓到的两个自造缺陷（已修）**

1. `useReadinessJump` 的站内白名单**漏了 `/guide`**：从任务页跳设置时 `from=/guide` 被判定为不合法，"返回来源页"按钮因此不渲染。e2e 在 30 秒超时后才暴露这点（等待的正是那个不存在的按钮）。
2. `GuidedTasksCard` 的收起状态一开始只读 `props.compact`，没读持久化意图 —— 表现为"点了收起只写了存储、界面不动"。改为 `taskIntent().collapsed || compact`。

**M3-a 后的度量变化**

| 指标 | 前 | 现在 |
|---|---|---|
| 空态带 CTA | 5 / 12 | **6 / 12**（`/chat` 零角色分支） |
| `.empty-state` 手写副本 | ≥10 | 10（新增 `EmptyState.vue` 供 1 处使用，其余替换在 M3-b/M4） |
| 引导覆盖 | rail 12 目的地中 4 个有静态描述 | 6 个主任务 + 3 个进阶，覆盖 rail 全部目的地；关闭后可从 rail、`/more`、`/chat` 空态三处回来 |
| 语义跳转点 `data-rel-jump` | 9（M2-a 后仍为 9） | 新增就绪条 5 + 前提 2 + 世界书反向 n/1 + 引导步骤 15 + 聚合页/rail 入口 → 实际计数以 `tests/ux/related-jumps.test.ts` 为准（该测试仍在 M2-b 计划内） |

**验证证据（M3-a 合入前复跑，同一份工作树）**

| 门禁 | 结果 |
|---|---|
| `npm run typecheck` | 退出码 0 |
| `npm run lint` | 0 problems（修掉本轮引入的 2 条 `attribute-hyphenation` warning） |
| `npm run i18n:check:strict` | 退出码 0；双语 parity 由 `tests/i18n.test.ts` 保证（新增 63、删除 9 死键后仍对齐） |
| `npm run check:css-conventions` | 5/5（断点 / viewport / hover / `!important`=26 基线 / 控件字号） |
| `npm run a11y:contrast` | 退出码 0（含 axe 审计集；新页面 `/guide` 的文本均为 13–20px 前景/次要色） |
| `npm run test:coverage` | 退出码 0，**All files 78.84 / 73.50 / 80.98 / 80.75**（阈值 78/73/78/78） |
| 全量 E2E（msedge + mobile-msedge） | **42 passed**（2.6 分钟；含本批 5 条引导用例） |
| WebKit E2E | 本机无浏览器未跑，由 CI 覆盖 —— 本批次同样**未在本机验证** webkit 通道（**已于 M2-b3 本机补装 WebKit 26.5 关闭**，见 §九 M2-b3 / M2-b4 的最终 62 passed 全量） |

**尚未做完的 G 层事项**：`StepFlow.vue` 原语（卡内步骤目前是内联渲染，两个"快速档"向导才真正需要它）；角色编辑器快速/完整两档与世界书"最小生效三步"；其余 11 个视图的 `EmptyState` 替换；`HelpTip` / `FormField` 原语。

### M4-a 密度层第一批：设置拆类 + 术语值统一（含一次被证据否定的设计）

**落地范围**：§3.6 的第 1、6(部分) 条；第 2 条（智能默认落地）**实现后被回退**，理由见下。

| 文件 | 实际改动 |
|---|---|
| `src/views/SettingsView.vue` | 设置类 6 → **7**：新增「检索」类（图标 `search`）并把 `VectorModelPanel` 从「模型」段末移出为独立段（`v-show` 保态语义不变，roving 键盘处理是索引驱动故无需改动）；新增 `?cat=` 深链读取（见 M2-a）。「智能默认落地」按 §3.6.2 的实现尝试已回退 |
| `src/core/readiness.ts` | 向量开关前提的跳转目标由 `?cat=model` 改为 `?cat=retrieval`，与新类对应 |
| `i18n locales/{zh,en}.ts` | 新增 `settingsView.categoryRetrieval(+Desc)`；`settingsView.categoryExtension` 的值由"扩展 / Extensions"改为"语音与辅助 / Voice & assist"（面板内容本就是 TTS、翻译、摘要；真正的扩展加载器无面板，仍列 §七） |
| 测试 | `tests/views/settings-local-model.test.ts`：分类数 6 → 7、标签清单加「检索」与「语音与辅助」、默认选中由「外观」改为「模型」（并显式点击「外观」验证主题卡片仍渲染）；`tests/core/readiness.test.ts`、`tests/components/readiness-surfaces.test.ts`、`e2e/ux-readiness.spec.ts` 的 `cat` 期望同步为 `retrieval` |

**密度变化（§0.3 口径，字面标签 / 含 `v-for` 展开两种都给）**

| 类 | 改造前 | 改造后 |
|---|---|---|
| 「模型」 | 60（66）：`SettingsModelPanel` 36 + 内联上下文段 3(9) + `VectorModelPanel` 21，共 6 段 | **39（45）**：面板 36 + 内联上下文段 3(9)，3 段 |
| 「检索」 | 不存在（藏在「模型」末段） | **21**，独立可寻址（`?cat=retrieval`） |
| 设置类总数 | 6 | **7** |
| 默认落地 | 恒「外观」 | 恒「外观」（D-P：智能默认已回退）；`?cat=` 显式优先 |

**顺带修正的一处口径**：`SettingsView.vue:22` 原有一行 `import { ref, computed, nextTick } from 'vue';;;;`（多余分号）在 M2-a 加 `watch` 时被替换为规范写法，属同一行的清理，未触碰其他格式。

**验证证据（回退智能默认之后，对最终状态重跑全量门禁）**

| 门禁 | 结果 |
|---|---|
| `npm run typecheck` | 退出码 0 |
| `npm run lint` / `i18n:check:strict` / `check:css-conventions` / `a11y:contrast` | 全部退出码 0（css 5/5；`!important` 仍为基线 26） |
| `npm run test:coverage` | 退出码 0，**All files 78.81 / 73.48 / 80.98 / 80.72**（阈值 78/73/78/78） |
| 全量 E2E（msedge + mobile-msedge，`E2E_PORT=5179`） | **42 passed**（3.1 分钟，含 `contrast-axe` 与 `theme-visual` 这 13 条曾失败的用例） |
| WebKit | 本机无浏览器未跑，由 CI 覆盖 |

**被证据否定的设计（记录以免下次重犯）**：智能默认落地。第一版实现让 13 条既有用例同时失败，失败模式有两类 —— ① 默认分类变为「模型」后外观面板被 `v-show` 隐藏，`.theme-card` 不可见导致点击超时；② 模型面板转为可见后，`getByRole('tab', {name:/模型/})` 命中 3 个元素触发 strict-mode 冲突。回退后 42 条全绿。教训：**改"默认状态"比改"新增状态"的爆炸半径大得多**，因为它同时改变所有既有断言的起点。

**M4-a 未做**：常规/高级折叠（「外观」的界面自定义段、「模型」的高级采样）；`WorldBookView` / `CharacterEditorView` / `StoryEngineView` / `GroupChatView` 的分区拆分；`HelpTip` / `FormField` 原语；四个"有 UI 无读者"控件的撤除（已由 M2-b1 完成）。

> 后续核对：本条列的四项里，折叠已由 **M4-b2** 完成（并额外把「数据」的四段运维项并成一个高级段），`HelpTip` / `FormField` 已由 **M3-b1** 完成，四个视图的分区仍待 **M4-b3**。

### M2-b1 撤除四条"有 UI 无读者"控件（E12 / E13 / E16 / E25）

| 撤除项 | 位置 | 撤除前的问题 | 后测量级 |
|---|---|---|---|
| E12 条目级"随机事件"开关 + 概率滑杆 | `WorldBookView.vue`（原 `:1565-1595`） | `core/lorebook.ts:87-92` 的两个字段在运行时**零读取**，用户勾了不会有任何效果 | 控件 61 → 59；文件 2901 → 2829 行；连带删除两个只写不读的处理函数与 `.random-event-row` 三条 CSS 规则 |
| E13 生成器"绑定世界书"下拉 | `RandomEventsView.vue`（原 `:488-513`） | `generatorConfig.boundWorldBookId` 有写者无读者 | 控件 22 → 21；文件 1315 → 1278 行；`getBoundWorldBookName()` 与 `lorebookStore` 引用一并撤除 |
| E16 故事"关联世界书"下拉 + 已绑显示 | `StoryEngineView.vue`（原 `:1129-1158` + `:774-796`） | `story.boundWorldBookId` 有写者（`setStoryWorldBookBinding`）但运行时零读取 | 控件 43 → 42；文件 3360 → 3307 行；`availableLorebooks` 随引用清零后一并撤除 |
| E25 数据银行"聊天级文档"分区 | `DataBankView.vue`（原 `:342-396`）+ `stores/data-bank.ts` 的 `chatDocuments` | 该分区 `v-if="chatDocuments.length > 0"`，而上传对话框只有全局/角色两档、检索管线硬编码 `scope='character'` ⇒ 三重不可达的死面板 | 控件 19 → 17；文件 1076 → 1021 行；store 侧 getter 与其导出同步撤除 |

**没有顺手加回"聊天级文档"单选**：那会立刻再造一条"有 UI 无读者"（`chat-context.ts:163-167` 仍硬编码 `scope='character'`）。要接通它必须先改检索管线，属功能开发（§七 #6）。

**数据字段暂留**：`lorebook.entry.randomEventEnabled/Probability`、`generatorConfig.boundWorldBookId`、`story.boundWorldBookId` 三类字段保留在类型与持久化里，因为已有用户数据带值；撤除它们需要迁移脚本，与"界面上不再骗人"是两件事，排期在 §七 #10 / #12。

**双语死键清理**：本次撤除后彻底无引用的 18 个键（`wb.randomEvent*` 4 个、`re.bind*`/`re.noBind`/`re.boundHint` 5 个、`story.bind*`/`boundWorldbookOk`/`unboundWorldbook` 7 个、`databank.chatSection` 1 个 + `re.bindEntryCount`）在 `zh.ts` / `en.ts` 中**同步删除**，两文件各 3289 → 3271 行，parity 测试保持绿。

**测试适配**：`tests/stores/data-bank.test.ts` 的两处断言由 `store.chatDocuments` 改为等价的 `store.documents.filter(d => d.scope === 'chat')`，保留对"数据层仍支持 chat 域"的覆盖（**不是删测试**，而是把断言移到仍然真实的那一层）。

**验证证据（M2-b1 最终状态，全量重跑）**
| 门禁 | 结果 |
|---|---|
| `npm run typecheck` | 退出码 0 |
| `npm run lint` / `i18n:check:strict` / `check:css-conventions` / `a11y:contrast` | 全部 0（撤除后无未使用变量与死样式残留；css 5/5） |
| `npm run test:coverage` | 退出码 0，**All files 78.80 / 73.47 / 80.96 / 80.71**（阈值 78/73/78/78 未放松） |
| 全量 E2E（msedge + mobile-msedge） | **42 passed**（2.2 分钟），含 `worldbook-flow`、`databank-flow`、`story-flow`、`random-events` 四条会被撤除控件影响的行为链 |
| WebKit project | 本机确实无浏览器（`Executable doesn't exist at …\webkit-2336\Playwright.exe`），仍由 CI 覆盖 —— 此项**未在本机验证**（**该限制已于 M2-b3 关闭**：本机装上 WebKit 26.5 后 `--project=webkit` 9 例全绿） |

**口径校正说明**：本文 §1.8 原记"世界书 59 控件"，实测 `d34df56` 基线为 **61**（差异来自并行提交在其间新增的"已绑定角色"等区块）。后续复评一律以同版本 `git show HEAD:<file>` 与当前文件对照计数，避免拿旧快照的数与新代码的数相减。

### M2-b2 命中回显（E02）与真实用量（E24）

| 文件 | 实际改动 |
|---|---|
| `src/core/lorebook-scanner.ts` | 新增 `PromptTraceItem` 与 `toPromptTraceItems()`：**裁剪掉 `entry.content`**（`ActivatedEntry` 含整条正文，最长 2 万字），只留 `entryId / bookId / bookName / title / keys(≤4)` |
| `src/services/chat-manager.ts` | `onPromptBuilt` 载荷从 `{tokenCount, trimmed, messageCount}` 扩为再加 `activated: PromptTraceItem[]`（E02 的"早就算出来却不下传"就此接上） |
| `src/stores/chat-generation.ts` | 两处 `onPromptBuilt`（发送 `:728`、重新生成 `:1072`）把 `info.activated` 挂到本条回复上。**本行原写"写到本条回复消息上"是错的**：落点写成了 `card`（`uiCharToCard()` 的 CharacterCard），因为 CharacterCard 带 `[key: string]: unknown`，typecheck 通过但界面与落盘都没有痕迹；M2-b3 的 e2e 抓到后已改为 `liveMsg` / `target` |
| `src/types/index.ts`、`src/core/character-card.ts`、`src/services/type-adapters.ts` | 消息新增**可选**字段 `promptTrace`，并在 `uiMsgToChatMsg` / `chatMsgToUiMsg` 双向映射；与 `thinking` / `status` 同构：空值不写盘、旧数据回读 `undefined` ⇒ **零迁移**（`core/schema-contract.ts` 允许可选新增） |
| `src/components/chat/PromptTraceSummary.vue`（新增）+ `MessageBubble.vue` | 助手气泡下的"本轮注入 N 条设定"折叠条，展开后每条给出书名 + 条目标题 + 命中关键词，书名可点回 `/worldbook`（带 `from`） |
| `src/components/layout/ContextPanel.vue` | 删除假的三段预算堆叠条（`char.tokenBudget.*` 只有初始化写点、从不重算 ⇒ 进度恒 0、"剩余"恒等初值），改为**真实 prompt token 累计 / 上限 / 剩余** + 一句说明；随之失效的 `segments` 计算与 `.token-segment` 用法一并撤除（D-H） |
| `i18n locales/{zh,en}.ts` | 各 +3 键（`ctx.tokenHint`、`trace.summary`、`trace.openBook`） |
| 测试 | 新增 `tests/core/prompt-trace.test.ts`：裁剪视图**不得含正文**（断言序列化结果不含 content 片段）、未命中关键词回退条目 keys 并截断到 4、空标题回退 `#id`、持久化往返与"空值不写字段/旧数据读为 undefined"、组件三态（无痕迹不渲染 / 折叠 / 展开并跳 `/worldbook?from=/chat`） |

**尚未完成、不可当作已完成（M2-b2 时的表述，已由 M2-b3 闭环，见下节）**：E02 的**浏览器级**证据当时还没有，只有服务层 + 组件层测试。

**并且本节的"改了什么"有一句不实陈述**：`chat-generation.ts` 的两处 `onPromptBuilt` 写的是 `card.promptTrace`，`card` 是 `uiCharToCard()` 产出的 CharacterCard（**不是**消息），因此痕迹既没上屏也没落盘；`tests/core/prompt-trace.test.ts` 只测纯函数与组件 props，测不到这条断链。同一批次的 `tests/core/prompt-trace.test.ts:19` fixture 还漏了 `LorebookEntry` 必填的 `strategy` / `probability`，`vue-tsc` 实际会报错——M2-b2 报出的"typecheck 退出码 0"是错的，M2-b3 已修。

### M2-b3 E02 的浏览器级证据（并抓出一次静默失效 + 一个新缺陷）

| 文件 | 实际改动 |
|---|---|
| `e2e/ux-prompt-trace.spec.ts`（新增） | 真实链路一条：`page.route` 拦 mock SSE → `/settings?cat=model` 建并激活 Profile → `page.evaluate` 往 IndexedDB `lorebooks` store 写一本 `scope:'global'` + `strategy:'constant'` 的条目 → 发消息 → 依次断言 ①就绪芯片 `[data-rel-jump="readiness-worldbook"]` 含 `is-ready`（与痕迹同源，两条互相印证）②气泡下 `.trace-toggle` 文案 `1 条设定` ③展开后 `.trace-entry` = `永恒酒馆`、`.trace-link` = 书名 ④点书名落到 `/worldbook?from=/chat` ⑤`chats` store 里确有 `promptTrace`（存储层证据，不只是内存）⑥刷新后重开该会话，正文与痕迹都在 |
| `tests/stores/chat-prompt-trace.test.ts`（新增） | store 级契约 4 例：常驻 + 关键词各 1 条 ⇒ 痕迹 2 条且**序列化结果不含正文**、命中条目带 `keys:['酒馆']`；**负向对照**无世界书时 `promptTrace` 为 `undefined`（且回复正文仍正常生成，避免空断言）；`persistChat` 后 `loadChat` 可回读；重新生成清空旧痕迹 |
| `src/stores/chat-generation.ts` | 落点由 `card` 改为 `liveMsg`（发送 `:731`）与 `target`（重新生成 `:1078`）；重新生成的复位块补 `target.promptTrace = undefined`，与 `thinking` / `status` 同批处理；并就地留一行"为何不能写 card"的成因注释 |
| `tests/core/prompt-trace.test.ts` | fixture 补齐 `LorebookEntry` 必填字段 `strategy` / `probability`，`npm run typecheck` 归零 |

**静默失效是怎么被发现的（方法论）**：`CharacterCard` 有 `[key: string]: unknown`（`core/character-card.ts:153`），所以 `card.promptTrace = …` 是**类型合法的错写**——纯静态门禁永远不会红。只有把"用户能不能看见"作为断言目标（e2e 找 `.trace-toggle`）才会暴露。这是本分支第二次踩同一类坑（第一次是"给 store 里未导出的字段赋值"），因此守卫按可执行形式补齐：

| 反证实验 | 结果 |
|---|---|
| 把落点改回 `card.promptTrace` 后跑 `tests/stores/chat-prompt-trace.test.ts` | **2 failed / 2 passed**（第 1、3 例红：痕迹不在消息上、落盘也就没有），证明新守卫确实咬得住；随后改回 `liveMsg` 并复跑 4 例全绿 |
| M2-b3 e2e 首次运行（修复前） | `expect(locator).toBeVisible() failed … waiting for locator('.msg-bubble.msg-assistant').last().locator('.trace-toggle')` ⇒ 回复正文已渲染（`你好，旅人！` 断言先通过），唯独痕迹缺失 ⇒ 定位到"算出来了但挂错对象" |

**顺带实测出的新缺陷（登记为 D-Q，排期 M2-b4）**：第二次失败发生在"刷新后仍在"这一步——`chats` store 里明明有这条会话与这个字段（第 ⑤ 步的 `expect.poll` 通过），刷新后界面却一个气泡都没有，直到测试显式点击左侧会话行才恢复。成因是 `loadChatHistory` 只在 `openSession`（列表点击）这一条路径上被调用，而 `uiCharToCard()` 根本不写 `messages`，所以启动时"保留角色卡 messages"的那段逻辑读到的是恒不存在的字段。`docs/dev/P2-11-virtualization-plan.md:52` 记的"已最小修复（保留 messages）⇒ 刷新后会话历史不再丢失"与代码现状不符，M2-b4 实施时一并回写该文档。

**验证证据（M2-b3 最终状态，全量重跑）**
| 门禁 | 结果 |
|---|---|
| `npm run typecheck` | 退出码 **0**（含 M2-b2 遗留 fixture 报错已修） |
| `npm run lint` | 退出码 0，无 warning 残留 |
| `i18n:check:strict` | 通过，`src` 全部 **193** 个文件无硬编码中文 |
| `check:css-conventions` | **5/5** 通过（断点白名单 / hover 守卫 / `!important` 基线 / ≥16px 控件 / viewport） |
| `snapshot:migration:check`、`runtime:db:schema:check` | 全部自洽（`promptTrace` 为可选新增字段，零迁移结论未变） |
| `a11y:contrast` | 通过，实际扫描 **121** 处（基线 131，已收敛 10 处） |
| `npm run test:coverage` | 退出码 **0**，**78.89 / 73.61 / 80.98 / 80.81**（阈值 78/73/78/78 未放松）；新增 4 例 store 契约 + 组件/纯函数 13 例全绿 |
| E2E（msedge + mobile-msedge + mobile-functional） | **52 passed**（2.3 分钟），含新增的 `ux-prompt-trace.spec.ts` |
| E2E（webkit · Safari 内核） | **本机已补验**：`npx playwright install webkit` 装上 WebKit 26.5（`ms-playwright\webkit-2336`）后，`--project=webkit` **9 passed**（1.0 分钟，`chat-flow` / `group-chat-flow` ×2 / `character-batch-import` ×3 / `character-crud` / `backup-restore` / `worldbook-flow`）。本分支此前各批次一律记"webkit 本机未验证、留给 CI"，此限制就此关闭。另把 `ux-prompt-trace.spec.ts` 加入 webkit 的 `testMatch`（该链路同时用 IndexedDB 造数与 SSE 流式，Safari 内核需要自己的那份证据），实测 **1 passed**（11.5s）。**注**：本节这些数字是 M2-b3 时点的；M2-b4 的最终全量重跑见下节（四 project 合计 62 passed） |

### M2-b4 刷新后接回上一段对话（D-Q）与会话归属纠偏（D-R）

**起因**：M2-b3 的 e2e 在"刷新后仍在"这步实测出 D-Q。给 D-Q 写测试时，又用同一批夹具实测出 D-R —— 一个**数据丢失**级缺陷。

| 文件 | 实际改动 |
|---|---|
| `src/stores/chat-session.ts` | 新增 `restoreLatestSession(character)`：仅当 `activeChatId === null` **且**该角色缓冲为空时，把 `sessions`（`loadAllSessions` 已按 `updatedAt` 倒序）里该角色**最近一条未归档**会话经 `openSession` → `loadChatHistory` 装回缓冲。归档会话不接回（归档的语义就是不在主列表里"复活"） |
| `src/stores/chat.ts` | 兼容层导出 `restoreLatestSession`（55 符号 API 面测试只校验既有符号，新增不破坏） |
| `src/App.vue` | 启动序列在五个 `loadFromStorage()` 之后 `await loadAllSessions(...)` + `await restoreLatestSession(currentCharacter)`。放在同一个 `try` 内：接回失败属启动期存储故障，应与其余存储加载共用那条 `logger.error` 而不是一道新的吞异常边界 |
| `src/components/layout/CharacterList.vue` | 两处 `loadAllSessions` 收敛成 `loadSessions()`（加载 + 接回）；`onSelectCharacter()` 也接一次——覆盖"启动时当前角色无历史、切到有历史的角色"这一常见路径 |
| `src/stores/chat-generation.ts` | `persistChat` 的会话选择加归属校验：`activeChatId` 若指向**已进索引且属于别的角色**的会话则弃用，回落 `chat-<角色 id>`；不在索引里的（`newSession()` 草稿）原样保留 |
| `tests/stores/chat-session-restore.test.ts`（新增 8 例） | 接回段 6 例：取 `updatedAt` 最新并同步 `activeChatId` 与会话行高亮 / 全归档不接回 / 只接回本角色 / 已有激活会话（含 `newSession` 草稿）绝不覆盖 / 缓冲非空不覆盖 / 无角色静默。归属段 2 例走**真实 `sendMessage`**（mock SSE + 落盘），不用内部函数 |
| `e2e/ux-prompt-trace.spec.ts` | "刷新后仍在"一段改为**不点击任何会话行**：`reload()` 后直接断言正文 `你好，旅人！`、`.trace-toggle` 与 `.conv-row.active` 都在 |
| `docs/dev/P2-11-virtualization-plan.md` | 回写该文档的"已最小修复（保留 messages）"：被保留的字段在角色卡记录里从来不存在（`uiCharToCard()` 不映射 `messages`），该句当时不成立 |

**D-R 是先红后绿测出来的**（不是读代码读出来的推测）。修复前 `tests/stores/chat-session-restore.test.ts` 第 7 例的实际失败输出：

```
AssertionError: expected [ '乙的新消息', '乙的回复' ] to deeply equal [ '来自 chat-A-1 的消息' ]
  - Expected   "来自 chat-A-1 的消息"
  + Received   "乙的新消息"
  +            "乙的回复"
```

即：`chat-A-1`（甲的会话）里甲的唯一一条历史被乙的整段缓冲替换。修复后该文件 **8 passed**。

**接回走的是哪条路径 —— 反证实验**：临时把 `CharacterList.loadSessions()` 改成第一行直接 `return`（组件侧不再加载），`e2e/ux-prompt-trace.spec.ts` **仍然通过** ⇒ 真正保证 F5 后接回的是 `App.vue` 的启动接线，组件侧那两处是补充而非依赖。实验后已还原该 `return`。

**验证证据（M2-b4 最终状态，全量重跑，与代码同版本）**
| 门禁 | 结果 |
|---|---|
| `npm run typecheck` | 退出码 **0** |
| `npm run lint` | 退出码 **0** |
| `i18n:check:strict` | 通过，`src` **193** 个文件无硬编码中文 |
| `check:css-conventions` | **5/5** 通过 |
| `snapshot:migration:check` / `runtime:db:schema:check` | 自洽 / 一致 |
| `a11y:contrast` | 通过，扫描 **121** 处（基线 131） |
| `npm run test:coverage` | 退出码 **0**，**3637 passed / 3 skipped**，覆盖率 **79.06 / 73.73 / 81.21 / 80.93**（阈值 78/73/78/78 未放松）。**注**：首轮曾以 `exit=1` 结束——`tests/views/app-tauri-ux.test.ts` 的 `useChatStore` mock 是空对象，`App.vue` 里新加的两行在 `try` 之外，抛出 3 条 `chatStore.loadAllSessions is not a function` 的 unhandled rejection；把接线移进既有 `try` 后同一 mock 缺失被启动错误处理吸收，重跑 `exit=0` |
| 全量 E2E（msedge + webkit + mobile-functional + mobile，`--workers=2`） | **62 passed，0 failed**（4.6 分钟）——首次把 webkit project 计入本机全量 |

**仍未做（不是遗漏，是排期）**：§七 #19 —— `activeChatId` 应从全局单值改为"每个角色记住自己上次打开的那条会话"的映射。D-R 的校验只保证"绝不写进别人的会话"，"切回甲时接回的可能是甲的默认会话而非甲上次打开的那条"这个体验缺口需要动会话模型才能消。

### M2-b5 角色关联面板（ModuleRelationsPanel）与 `?from=` 回程补齐

§3.3 计划的 `ModuleRelationsPanel.vue` 落地。选择"角色"作为承载对象，因为它是这条 IA 里唯一的枢纽：世界书、文档、创作模式、模型、版本、群聊六条关系都以它为主语。

| 文件 | 实际改动 |
|---|---|
| `src/core/relations.ts`（新增） | `useCharacterRelations(characterId)` ⇒ 六行固定顺序的判定。**每行只读真实数据**：世界书用 `collectLorebooksForCharacter()`（与 prompt 构建同一个函数，因此"面板说的"与"注入用的"不可能分叉）且条目只数 `enabled`；文档用 `getDocumentsForScope('character', id)`（全局 + 本角色，不含他人角色）；创作模式区分"角色绑定"与"跟随全局 `settings.creationPreset`"；模型区分"角色级 Profile"与"全局激活"与"未配置"三种说法；群聊按 `members[].characterId` 反查 |
| 同上 · 硬约束 | **判断"是否已跟踪"不得建仓**：只读 `version.repositories`，绝不调 `selectCharacter()`（它会 `ensureRepository` + `commitTick` + 落盘整块快照）。测试里用"读之前 `repositories` 长度为 0、之后为 1"把这个约束钉死 |
| `src/components/layout/ModuleRelationsPanel.vue`（新增） | 挂在角色编辑页世界书绑定段之后（`CharacterEditorView.vue:1152` 后），`linked=false` 的行加 `.is-plain` 走次要文字色 —— "没有关联"是事实陈述，不是错误提示。每行一个跳转，带 `data-rel-id` / `data-rel-jump="rel-*"` |
| `src/App.vue` + `src/styles/app-global.css` | **回程契约补全**：`?from=` 此前只有设置页兑现（它有自己的面板头按钮），世界书 / 数据银行 / 版本 / 群聊这些目标把用户带过去就没有回头路了。现在全局浮一枚"返回来源页"（`route.name === 'settings'` 时不渲染，避免同一屏两枚），M2-b2 的痕迹链接与 M2-b5 的六行同时受益 |
| `src/i18n/locales/{zh,en}.ts` | 各 +23 键（`rel.*`），双语同序；`MessageKey` 由 zh 派生，en 缺键会直接编译失败 |
| 测试 | `tests/core/relations.test.ts` 9 例（含裸角色的"老实说没有"、世界书 2 启用 + 1 停用只计 2、文档计数不含他人角色、三种模型说法、版本只读、群聊带 `preSelectGroupId`）；`tests/components/module-relations-panel.test.ts` 4 例（六行、`.is-plain`、跳转带 `from`、群聊先 `selectGroup` 再跳、查不到角色不渲染）；`e2e/ux-relations-panel.spec.ts` 浏览器级 |
| 顺手修（非本批次引入） | `ContextPanel.vue` 的 `.ctx-preset-select` 是 12px 的 `select` 且移动断点内无 ≥16px 覆盖 ⇒ 补 `@media (max-width: 640px)` 覆盖，`check:i7-control-font-size` 未覆盖项 1 → 0（iOS 聚焦放大整页是真问题，不只是门禁数字） |

**两处由门禁逼出来的返工（都是本文档 §四 预言过的成本）**
| 返工 | 触发点 | 处置 |
|---|---|---|
| 面板标题 `<h3>` → `<p class="relations-title">` | `tests/accessibility/components-axe.test.ts` 的 `heading-order` 在"CharacterEditorView（编辑模式）"用例上报红（该用例在 HEAD 是绿的，本批次把它改红了） | 编辑页已有自己的标题层级，面板用 `<section :aria-label>` 提供无障碍名、`<p>` 提供视觉标题；改后 24 例全绿 |
| 文本断言选择器 `[data-rel-jump]` → `[data-rel-id]` | 首版 e2e 失败：`Expected substring: "未配置任何 API 配置"  Received string: "去配置"` —— `data-rel-jump` 挂在**行内按钮**上，`.toContainText` 只拿到按钮文字 | 给 `<li>` 增加 `data-rel-id="row.id"`：行级断言用 `data-rel-id`，点击用 `data-rel-jump`，两个关注点分开 |

**验证证据（M2-b5 最终状态，全量重跑，与代码同版本）**
| 门禁 | 结果 |
|---|---|
| `npm run typecheck` / `npm run lint` | 退出码均 **0** |
| `i18n:check:strict` | 通过，`src` **195** 个文件无硬编码中文（+2 为本批次新文件） |
| `check:css-conventions` | **5/5** 通过，且 `i7-control-font-size` 未覆盖项由 1 → **0** |
| `a11y:contrast` | 通过，扫描 **121** 处（基线 131）；axe 单测 24 例全绿 |
| `npm run test:coverage` | 退出码 **0**，**3650 passed / 3 skipped**，覆盖率 **79.12 / 73.84 / 81.27 / 80.97**（阈值 78/73/78/78 未放松；较 M2-b4 的 79.06/73.73/81.21/80.93 略升） |
| 全量 E2E（msedge + webkit + mobile-functional + mobile） | **63 passed，0 failed**（4.5 分钟），含新增 `ux-relations-panel.spec.ts` |

**尚未铺开的面板宿主**：版本页、市场详情页、图片生成页与随机事件页仍复用同一 `core/relations.ts` 之前的状态（它们的主语不是"角色"，需要各自的判定行）。其中图片生成的两难（E22：两处配置互不读取 + 刷新丢 key）不是"看不见关系"而是"关系真的没接"，属功能开发，排 §七 #8 邻近项。

### M2-b6 两条"看得见但跳不过去"的边接上（E17 / E20）

| 边 | 改动 | 证据 |
|---|---|---|
| **E17** 群聊 → 成员角色 | `GroupChatView.vue`：成员条里的名字由 `<span>` 改为按钮，`pushWithReturn({name:'character-edit',params:{id}})` 带 `?from=/group`；配套 `.member-name` 去掉按钮外观 + `@media (max-width:640px)` 把字号提到 16px（iOS 聚焦放大）；新键 `group.editMember` | `e2e/ux-relations-panel.spec.ts` 第二条：建角色 → 建两人群聊 → 点成员名 → 断言 URL 形如 `/character/<id>/edit?from=/group` 且 `#f-name` 的值就是该角色 → 点"返回来源页"回到 `/group` |
| **E20** 市场 → 角色安装 | `stores/community-market.ts`：`installRemoteItem` 返回类型 `boolean → string \| null`（新角色 id），`importRemoteAsCharacter` 的既有返回值第一次被用上；`CommunityMarketView.vue`：安装成功后渲染 `role="status"` 结果条"已加入角色列表：「X」"+ 两个去路（去编辑这个角色 / 看角色列表），`handleUpdateInstall` 改走同一条路径，因此更新安装同样有结果条 | `tests/stores/community-market-install.test.ts` 3 例（成功给 id 且角色真在列表里、`installedOrigins` 来源记录未断；条目缺失与下载失败给 null；重名改名后 id 指向改名后的角色）；`tests/views/market-install-result-ui.test.ts` 2 例（结果条带名字、两按钮分别落 `character-edit?from=/community-market` 与 `character-list`、失败不渲染） |

**这一批最重要的产出其实是一条缺陷登记（§七 #20）**：为把 E20 的链路走完，`ux-prompt-trace.spec.ts` 在 webkit + `--workers=2` 下**稳定**失败两次，且两次失败点不同——第一次是"发送后没有回复"，加了落盘等待后变成"刷新后模型芯片停在 `is-attention`"。顺着 `error-context.md` 的 DOM 快照看清了因果：

```
Locator: [data-rel-jump="readiness-model"]
Received: "readiness-chip is-attention"  title="还没有可用的模型配置，发送后收不到回复"
```

即 Profile **存进去了**（按名字轮询 IndexedDB 已经通过），但**激活态没保住**。根因不在测试：`stores/settings.ts:526-530` 的 `setActiveApiProfile()` 是 `void persistSettings()`，创建与激活是两次独立异步写，只等"名字出现"会在第一次写落盘后就放行，紧随的 `reload()` 丢掉第二次写。修复方式是让测试等"两次写都到齐"：

| 等待条件（改前） | 等待条件（改后） |
|---|---|
| `settings.app` 里出现名字 `E2E 痕迹模型` | `settings.app` 里出现该名字，**且** `activeApiProfileId === 该 Profile 的 id` |

改后 `--workers=2` 的四 project 全量重跑 **64 passed / 0 failed**。产品侧的"可等待落盘"没有在本批动（要顺带审 `settings.ts` 里 20 余处 `void persistSettings()`），登记为 §七 #20；**这不是测试能掩盖过去的问题：真人若在激活后立刻刷新，会遇到同一件事**。

**验证证据（M2-b6 最终状态，全量重跑，与代码同版本）**
| 门禁 | 结果 |
|---|---|
| `npm run typecheck` / `npm run lint` | 0 / 0（含 `--fix` 清掉新按钮带来的 2 条 `vue/multiline-html-element-content-newline` warning） |
| `i18n:check:strict` | 通过，`src` **195** 个文件 |
| `check:css-conventions` | **5/5**（新增控件都带移动断点覆盖与 hover 守卫） |
| `a11y:contrast` | 通过，扫描 **121** 处（基线 131） |
| `npm run test:coverage` | 退出码 **0**，**3655 passed / 3 skipped**，覆盖率 **79.46 / 74.00 / 81.55 / 81.32**（阈值 78/73/78/78 未放松） |
| 全量 E2E（四 project，`--workers=2`） | 修测试前 **1 failed**（webkit 的 `ux-prompt-trace`）→ 定位到 §七 #20 后 **64 passed / 0 failed**（3.0 分钟）。**注**：上面 `test:coverage` 那一行是在 e2e 修复之前跑的；此后只改动了 `e2e/ux-prompt-trace.spec.ts` 一个测试文件，未触碰 `src/`、单元与门禁判定，故单元侧数字与代码仍同版本 |

### M2-b7 桌面侧栏二次排版（用户实机截图驱动的 V/N 修订）

**触发**：M1-a 把 rail 从"12 项平铺"改成"4 组分层"后，用户实机截图反馈"现在的侧栏仍然很乱"。先量再改，量出来的不是审美问题而是**可达性问题**：

| 指标（1280×800 · Edge · `/chat`） | M1-a 后的实测值 | 说明 |
|---|---|---|
| rail 宽度 | 72px | 竖排卡片（图标在上、11px 文字在下）|
| 入口高度 | 56px × 15 | 15 个入口全部两行高 |
| `rail.scrollHeight` / `clientHeight` | **978 / 800** | **溢出 178px**，底部入口要靠滚动才够得着 |
| 最后一个入口的底边 | 964px | 已在视口（800px）之外 |
| 组标题 | 4 个居中 13px 文本 | 与入口同样式、无分隔，读起来像"更多的条目" |

三条根因：① 竖排卡片让 15 个入口吃掉 840px；② 组标题居中且与入口同色同形，不构成层级；③ **设置夹在「能力」组中间**——它是应用级系统入口，不是内容资源，位置随组内容漂移。

| 改动 | 具体 | 为什么 |
|---|---|---|
| 入口改横排 | 图标 18px + 文字 12px 一行，行高 32px；rail 宽 72 → 112px | 同样 15 个入口从 840px 降到 480px；文字不再被 72px 挤成第二行 |
| 组标题降级 | 左对齐 11px + `letter-spacing .06em` + 组间 1px 分隔线 | 明确"这是分组，不是又一个入口" |
| 设置移入系统项 | `nav-model`：`settings.group: 'capability' → null`；`systemEntries()` 声明序即渲染序 = 引导 → 更多 → 设置，整段 `margin-top:auto` 钉底 | 系统入口不该随内容组漂移；也顺手把 `systemEntries()` 的顺序契约写进注释与单测 |
| 社区市场归入「创作」 | `market.group: 'archive' → 'creation'`；「档案」→「历史」只留 记录 + 版本管理 | "从市场取别人做的角色卡"是创作的上游，与"归档记录/版本"无关；组名 对话→会话、档案→历史 也避免与组内条目同名（旧版第一组标题就叫"对话"，里面又是"对话"入口） |
| 641–900px 收成图标栏 | `@media (max-width: 900px)`：rail 64px、隐藏 `.nav-label`（`title`/`aria-label` 仍在） | 平板宽度下 112px 会挤掉聊天区；断点取自门禁白名单里的 900 |
| 激活态只留一个信号 | 左侧 3px 色条 + 同色文字 | 见下方"被证据否定的设计" |

**被证据否定的设计（本批次自己的）**：横排后我给激活项加了 `color-mix(in srgb, var(--secondary) 12%, transparent)` 的底色，想让它更醒目。`e2e/contrast-axe.spec.ts` 立刻在**三个用例**上报红：

```
theme=light → color-contrast(1)
Element has insufficient color contrast of 4.38
  foreground #0a7a77, background #e2efef, font-size 12px, expected 4.5:1
target: .nav-item.active > .nav-label（aria-label="设置"）
```

即底色把 `--card` 压暗，反而让同色文字跌破 AA。撤掉底色（保留色条 + 文字色）后 8 例复绿。**结论：这一栏的"醒目"不能靠给文字加背景**——要么改文字色，要么改底色但重算配对，二者只能选一个方向。

**改动后的实测（同一台机器、同一视口、同一入口页）**
| 指标 | M1-a | M2-b7 |
|---|---|---|
| `scrollHeight / clientHeight` | 978 / 800（溢出） | **800 / 800（不溢出）** |
| 入口高度 | 56px | **32px** |
| 最后入口底边 | 964px（视口外） | **792px（视口内）** |
| rail 宽度 | 72px | 112px（≤900px 视口自动收 64px 并隐藏文字） |
| 820×700 视口（平板档） | — | rail 实测 **64px 宽、15 项 32px、`scrollHeight=clientHeight=700` 不溢出**，截图 `after-64px-icon-rail-at-820w.png` |
| 截图 | `docs/dev/evidence/ux-ia-guided-flow/m2-b7-nav-rail/before-72px-vertical.png` | 同目录 `after-112px-rows.png` |

**回归防线**：`e2e/ux-nav-model.spec.ts` 新增一条几何断言（`scrollHeight ≤ clientHeight`、最后入口底边 ≤ 视口高、入口高度 ≤ 34px、设置是 rail 最后一个入口），把"不需要滚动"变成可失败的检查，而不是靠人眼；`tests/core/nav-model.test.ts` 补四组归属的完整快照断言（会话=对话+群聊；创作=角色/世界书/数据银行/故事引擎/随机事件/社区市场；能力=本地模型+图像生成；历史=记录+版本管理）。

**顺带补的一处交互缺口**：整条 rail 此前**没有任何 hover 规则**（`grep -rn "nav-item:hover" src/` 为空），鼠标划过看不出可点。补 `.nav-item:hover { color: var(--foreground) }`（包在 `@media (hover: hover)` 里，符合 hover 门禁），键盘焦点仍由 `base.css:134` 的全局 `:focus-visible` outline 兜底，不重复定义。

**验证证据（M2-b7 最终状态，与代码同版本）**
| 门禁 | 结果 |
|---|---|
| `npm run typecheck` / `npm run lint` | 退出码均 **0** |
| `i18n:check:strict` | 通过，`src` **195** 个文件 |
| `check:css-conventions` | **5/5**，`i7-control-font-size` 未覆盖 **0** 条 |
| `a11y:contrast`（静态） | 通过，扫描 **121** 处（基线 131） |
| `a11y`（浏览器 axe，5 主题 × 设置页/对话页/7 条路由） | 加底色版 **3 例连红** → 撤底色后 **8 passed**（含 `ux-nav-model` 的几何新用例） |
| `npm run test:coverage` | 退出码 **0**，**3656 passed / 3 skipped**，覆盖率 **79.46 / 74.00 / 81.55 / 81.32**（阈值未放松）。**注**：这次统计在"补 hover 规则"之前跑；该改动只新增一条 CSS 声明，而 coverage 的 `include` 是 `src/**/*.ts`（不含 `.vue`/`.css`），数字不受影响 |
| 全量 E2E（四 project，`--workers=2`） | **65 passed / 0 failed**（5.0 分钟）。中途一次 `--workers=2` 运行里 `worldbook-flow`（mobile-functional project）失败过一次——"点新建世界书后名称框 5s 未出现"，单独 `--workers=1` 重跑通过，且并入下一次全量后 65 例全绿：判定为并发下的时序抖动，与本批改动无关（rail 在 ≤640px 不渲染），但与 §七 #20 记的"世界书即时保存是 fire-and-forget"同源，属同一类风险 |
| 补 hover 规则之后 | `ux-nav-model` + `mobile-nav-groups` **7 passed**（27s）；静态五项全绿 |
| 几何守卫是否真会咬人（反证） | 把 `.nav-item` 高度临时改回旧值 56px 后重跑：`Expected: <= 720 / Received: 1028` ⇒ **1 failed**；改回 32px 后 `ux-nav-model` **5 passed**。这条断言不是摆设 |

### M2-b8 侧栏入口可编辑 + 激活态改背景填充（用户三条反馈的直接落地）

用户对 M2-b7 的结果提了三条：① 选中样式要背景填充，竖线不美观；② 64px 档不要组名；③ 在「更多」里加一个编辑，让用户控制侧栏显示什么、隐藏什么。

| 项 | 实现 | 关键取舍 |
|---|---|---|
| 激活态 | 去掉 `border-left`，整颗胶囊 `background: var(--secondary)` + `color: var(--primary-foreground, var(--background))`；rail 左右各留 6px 让填充成为"胶囊"而不是"贴边色块" | 见下方"被 axe 否定的写法" |
| 64px 档无组名 | `@media (max-width: 900px)` 里 `display: none` 组标题，只留分隔线 | 规则**必须写在组件 scoped 样式内**：写进 `layout.css` 会被 scoped 的特异性（`.nav-group-label[data-v-*]`）压住而不生效——这是一次实测出来的坑 |
| 入口显隐编辑 | 新增 `core/rail-prefs.ts`（localStorage + 响应式镜像，只存意图不存结果，与 `guided-tasks.ts` 同口径）；`/more` 顶部「侧栏入口」区，"编辑"展开勾选清单；`NavRail` 过滤，整组空则组标题一起消失 | 只影响桌面 rail。移动底部 Tab 的"6 个入口不增不减"是既有契约（`e2e/mobile/mobile-nav-groups.spec.ts` 在守），不跟变 |
| 不把自己锁死 | 两条安全阀：`PINNED_ENTRY_IDS = ['more','settings']` 在**读写两侧**都剔除（脏数据带它们也会被清洗）；从侧栏收起、且聚合页原本不列出的入口（对话 / 角色 / 世界书 / 社区市场 / 引导）落到「更多」页底部的**「已从侧栏收起」**分区 | 编辑器就住在「更多」页里——能藏掉「更多」或「设置」就没有回头路了。"收起 ≠ 找不回来"是这条设计的本意 |
| 脏数据 | `loadRailVisibility()` 对非 JSON、非数组、未知 id 一律退回"全部显示"，存储不可用时偏好当场生效只是记不住 | 导航不能因为偏好坏了而坏 |

**被 axe 否定的写法（本批次自己的返工）**：背景填充最初写 `color: var(--primary-foreground, #fff)`。查下来仓库**从未定义** `--primary-foreground`（`grep -rn "primary-foreground" src/styles/` 只有两处 `var(...)` 回退用法），所以它永远回退成白字——青色主题下 `#fff on #7df9ff = 1.24`：

| 检查 | 写 `#fff` 时 | 改成 `var(--background)` 回退后 |
|---|---|---|
| `a11y:contrast` 静态扫描存量 | **125**（比基线 121 多 4 条，即 4 个主题的激活项不达标） | **121**（回到 M2-b7 水平） |
| `e2e/contrast-axe.spec.ts`（5 主题 × 设置页 / 对话页 / 7 路由） | **3 failed**（`insufficient color contrast of 1.24 (foreground #ffffff, background #7df9ff, 12px)`） | **4 passed**（含 `custom-theme-contrast`） |

**新增防线**：`tests/core/rail-prefs.test.ts` 7 例（含"钉底项藏不掉 + 脏数据里带它也被清洗"）、`tests/components/nav-rail-visibility.test.ts` 5 例（含"整组收起 ⇒ 组标题一起消失"）、`e2e/ux-nav-model.spec.ts` 一条端到端偏好链路（编辑 → 收起 → rail 少一项 → **刷新后仍是收起状态** → 聚合页仍能进 → 一键恢复）。

**顺带把 §七 #20 从"待办"变成"已修"**：M2-b8 的验证跑里，`ux-prompt-trace` 在 webkit 又红了一次（刷新后 `readiness-model` 停在 `is-attention`），而 M2-b6 已经加过"轮询 IndexedDB 直到 `activeApiProfileId` 正确"的等待——**说明那个等待根本不够**，我记的原因（"还没落盘"）也不是真机制。单独跑不复现、并发跑必现，于是直接读 `persistSettings()`：它是 `async` 且**每次调用各自跑完**，连点"新建配置"再"激活"会并发两次写，先发起的那次带的快照更旧，却可能后完成 ⇒ **旧快照最后落盘，把新状态盖掉**。修法是排队：

| | 修前 | 修后 |
|---|---|---|
| `persistSettings()` | 每次调用独立异步跑完，完成顺序不定 | **空闲时同步发起、忙时排队**（`persistInFlight` + `persistWaiters`）：写入顺序 = 状态顺序，旧快照不可能最后落盘 |
| 调用点 | 20 余处 `void persistSettings()` | **一行不改**（排队后语义自然正确） |
| 守卫 | 无 | `tests/stores/settings-persist-order.test.ts`：假适配器"第一次写慢、后续写快" ⇒ 断言最后一次落盘必须是最终状态 |
| 反证（把排队摘掉） | `AssertionError: expected { activeApiProfileId: 'p1', … } to deeply equal { activeApiProfileId: 'p2', … }` ⇒ **1 failed**，而 `quick-reply` 的 35 例仍全绿 ⇒ 只有顺序守卫抓得住这个 bug | 恢复排队后 **1 passed** |

**验证证据（M2-b8 最终状态，与代码同版本）**
| 门禁 | 结果 |
|---|---|
| `npm run typecheck` / `npm run lint` | 退出码均 **0**（中途一次 `tsc=2` 是新单测里的 `writes[i-1]` 触发 `noUncheckedIndexedAccess`，已改写断言而非加 `!`） |
| `i18n:check:strict` | 通过，`src` **196** 个文件（+1 = `core/rail-prefs.ts`） |
| `check:css-conventions` | **5/5**，`i7` 未覆盖 **0** 条 |
| `a11y:contrast`（静态） | 通过，扫描 **121** 处（基线 131）——中途曾因 `#fff` 回退涨到 125，改正后回到 121 |
| `e2e/contrast-axe.spec.ts` + `custom-theme-contrast` | **4 passed**（5 主题 × 设置页 / 对话页 / 7 条路由 + 自定义背景图 22 对） |
| `npm run test:coverage` | 退出码 **0**，**3669 passed / 3 skipped**，覆盖率 **79.51 / 74.04 / 81.58 / 81.38**（阈值未放松） |
| 全量 E2E（四 project，`--workers=2`） | **66 passed / 0 failed**（4.6 分钟）。此前 M2-b8 中途那次全量是 **65 passed / 1 failed**（webkit 的 `ux-prompt-trace` 刷新后模型芯片不 ready）——正是那次失败把 §七 #20 从"待办"挖成"已修的并发写倒置"；修后同一用例连续两轮全绿 |
| 界面实测（Edge 1280×900） | 编辑器 13 行可勾项、"已隐藏 2 个入口"计数、"恢复显示全部入口"出现；取消勾选「引导」后 rail 内 `[data-rel-jump="nav-guide"]` 计数 **0**，而「更多」页的 `collapsed-guide` 卡片计数 **1** ⇒ "收起 ≠ 找不回来"成立。截图见 `docs/dev/evidence/ux-ia-guided-flow/m2-b8-rail-prefs/`（`more-editor-all.png` / `more-editor-2-hidden.png` / `rail-all.png` / `rail-2-hidden.png`），激活态填充与 64px 无组名见 `../m2-b7-nav-rail/after-active-fill.png`、`after-64px-no-captions.png` |

**必须记下的测试适配（不是削弱）**：`tests/stores/quick-reply.test.ts` 里 4 例"××后触发持久化"原先在调用栈内**同步**断言 `saveCallCount`。排队后第二次及以后的写会晚两个微任务，因此给它们加了 `await flushPersist()` 再断言。**断言语义没变**（仍是"这个动作触发了持久化"），变的是等待方式；这一点在测试文件顶部的 helper 注释里也写明了原因。

### M2-b9 交互反馈补强（用户第三条反馈：提示要自己关、按钮与滑块"颜色没变化"）

用户原话："提示弹窗需要自动关闭，目前按钮样式交互、滑块样式交互中颜色没有明显的变化，不太明显"。三条都是观感判断，所以先量出事实再动手：

| 用户说法 | 实测到的事实 | 因此改什么 |
|---|---|---|
| "提示弹窗需要自动关闭" | `Toast.vue` 一直是 5s 自动关（浏览器实测：出现后 `+4000ms` 仍在、`+6000ms` 已消失） | 缺的**不是计时器**。真正造成"粘着不放"观感的三件事：确认型提示也占屏 5 秒；界面上没有任何"我会自己关"的信号；连点会排成一串刷半分钟 |
| "按钮样式交互颜色没有明显的变化" | `grep ":where(button\|button:hover\|button:active" src/styles/*.css` **零命中**——整站没有一条全局按钮交互规则，全靠组件自绘，没自绘的就完全没反馈；侧栏激活项在 M2-b7 加的文字色又被 M2-b8 的背景填充吃掉 | 补一条**兜底**规则，且不抢组件自己写好的样式 |
| "滑块样式交互颜色没有明显的变化" | `.tk-range` / `.form-range` 都 `appearance: none` + 单一底色平铺 ⇒ 拖动时只有圆点在动，原生控件本有的"已填充一段"没了；另有 **3 个 `type="range"` 完全没有 class**（走原生外观）、2 个走 `.field-range`（只有 `width` + `accent-color`） | 轨道按当前值分段着色；把没样式的滑块并入同一套 |

**三项实现**

| 项 | 实现 | 关键取舍 |
|---|---|---|
| 滑块着色 | 新增 `core/range-fill.ts`：`v-range` 指令把 `rangePercent(value,min,max)` 写成元素自身的 `--range-pct`；`base.css` 给 `input[type="range"]` 铺**两层 `background-image`**（着色段 + 底色带）。14 个 range 输入全部挂指令，3 个无 class 的并入 `.tk-range`，`.field-range` 随之删除 | 三条更新路径都要有：`mounted`（首屏不空轨）、元素 `input` 监听（拖动即时跟色，**不依赖组件是否重渲染**）、`updated`（`v-model` / "重置"按钮以属性方式改值时不产生 input 事件） |
| 可点区域 | 盒子 4px → 16px（`.form-range` 18px），可见轨道仍用 `background-size: 100% 4px` 居中画成细带 | 4px 高的盒子实际点不稳拇指；两层背景而不是 `background-color`，是因为加厚盒子后整块上色会变成"粗条" |
| 拇指状态 | 悬停 / 按下 / 键盘聚焦给同色 `box-shadow` 光晕（32% / 45% `color-mix`），按下同时 `scale(1.18)`；`prefers-reduced-motion` 下撤掉过渡与缩放 | 光晕色取自 `--range-fill`，所以"红拇指 + 青轨道"不会同时出现 |
| 按钮兜底 | `:where(button, [role='button']):not(:disabled)` 的 hover/active 规则：`inset box-shadow` 叠 `currentColor` 15% / 26%，按下 `translateY(1px)` | 见下方"两次被层叠打败的写法"。`:where()` 让特异度≈0，组件自绘的 hover/active 仍然说了算 |
| 提示时长 | `TOAST_DURATIONS = { info:3000, success:3200, error:5000 }`，`Toast.vue` 的 `duration` 不传时按类型取，显式 `0` 仍是常驻 | 错误保留 5s（要读完并决定下一步），确认型缩到 3s 出头 |
| 倒计时条 | 底部 3px `scaleX` 条，rAF 驱动（`transform` 而非 `width`，不逐帧触发布局），`aria-hidden` | 用 rAF 而不是 CSS `animation`：暂停/恢复必须和**真正的关闭计时**共用一个时钟，两套时钟一定会漂 |
| 暂停计时 | 指针悬停、键盘聚焦、页面隐藏三个理由放进一个 `Set`，全部解除才继续 | WCAG 2.2.1；只判 `hover` 会让"Tab 到关闭按钮上"的键盘用户被抢走阅读时间 |
| 队列 | `TOAST_QUEUE_LIMIT = 5`，超限淘汰最早**排在后面等**的非错误项；同类型同文案已在队列里就不再重复排队 | 正在显示的首条不参与淘汰（不能把用户正在读的那条挤掉）；待显示项全是错误时丢弃**新来的**那条，而不是静默丢掉已排队的错误 |

**两次被层叠打败的写法（都实测过，不是推演）**

| 想当然的写法 | 实测结果 | 改法 |
|---|---|---|
| 把整条渐变做成 `:root` 的复合 token `--range-track: linear-gradient(... var(--range-pct) ...)`，组件写 `background: var(--range-track)` | 浏览器里 `--range-pct: 37%` 明明在元素上，计算出来的渐变仍是 `rgb(cyan) 0px … 0%` —— **var() 在 `:root` 就求值完毕**，着色永远停在 0% | 渐变必须写在**能匹配到 `input` 的规则**里；`:root` 只放叶子色 token（`--range-fill` / `--range-rail`） |
| 按钮兜底用 `background-image: linear-gradient(color-mix(currentColor…))` | 侧栏激活项 `transform` 生效了，但 `background-image` 计算值仍是 `none` —— `.nav-item.active { background: var(--secondary) }` 是**简体会把背景图整张清掉**，且与兜底规则同为 (0,2,0) 平手、按顺序它赢 | 兜底改用 `inset box-shadow`（叠在既有底色之上，不被简体清掉，也不替换设计好的底色） |

**顺带修掉的真实缺陷**：`Toast.vue` 的 `modelValue` watch 没有 `immediate` ⇒ 只要组件是"挂载时就可见"地用，计时器**永远不启动**。新单测正是撞在这个上面才暴露的（改前 6 例红）。

**反证（把守卫逐个摘掉，看测试是否真的咬人）**

| 摘掉的东西 | 结果 |
|---|---|
| `v-range` 的 `input` 监听（只留 mounted/updated） | `用户拖动（input 事件）立即跟随` **1 failed** |
| `showToast` 的重复消息合并 | `同类型同文案连续触发只排一条` **1 failed** |
| `evictForCapacity()` 调用 | 队列上限 4 例全 **failed** |
| `@mouseenter="hold('pointer')"` | 悬停暂停 2 例 **failed** |
| `watch(…, { immediate: true })` | 自动关闭 6 例 **failed**（这是改代码前的一次性状态，非摘除实验） |
| 全部恢复 | **27 passed** |

**本批次自己引入的测试污染（查清后改掉，不记成"用例抖动"）**

新 spec 最初用设置页"清除背景"触发提示。加上 webkit project 后，`ux-prompt-trace` 在 webkit 全量跑里**稳定变红**：刷新后模型芯片停在 `is-attention`（"还没有可用的模型配置"），而世界书芯片正常。

| 排查步骤 | 观察 |
|---|---|
| 单跑 `ux-prompt-trace`（webkit） | **通过**，reload→芯片就绪仅 **234ms / 244ms** ⇒ 不是"5s 超时太短" |
| 只放 1 个本文件用例在前 | 通过 |
| 放全部 6 个在前 | **失败**，且把断言超时放宽到 30s 仍失败（53 次采样全是 `is-attention`）⇒ 不是时序，是数据 |
| 失败现场 dump IndexedDB | `settings.app` = `{apiProfiles: [], activeApiProfileId: null, chatBackground:{type:'none'}}` ⇒ 落盘的是**别的 context 的快照** |
| 结论 | 同一 webkit 进程内存储目录共享，本文件那次"清除背景"的 `persistSettings()` 落到了后面的用例上。单跑永远绿 ⇒ 只有在本文件加"写设置"这一步才触发 |

处置：本文件的触发路径全部改成**零落盘**——提示走"发送被拦住"的守卫分支（`ChatMain.handleSend` 在 `checkSendBlock()` 为真时只出提示就 return），滑块改值落在 `.form-range` 的组件本地 ref 上，`/chat` 的 `.tk-range` 只做只读检查。改后 webkit 全量**连续两轮 16 passed / 0 failed**。教训写进了该 spec 顶部注释：证据用例不该顺带改用户数据。

> **该因果结论已被 M3-b0 推翻**：实测 `backup-restore` + `ux-prompt-trace` 这两条老用例（不含本批次任何新用例）也能稳定复现同一失败，真机制是 webkit 同一进程内多 context 共享存储目录造成的跨用例写竞态。本段「改触发路径」作为测试卫生仍然成立，但**不是**那条红用例的成因。详见 §九 M3-b0 的实验表。

**倒计时条自身的可见度（新加的图形状态指示，按 WCAG 1.4.11 非文本 ≥3:1 量过）**

| 主题 | default | light | midnight | oled | theatre |
|---|---|---|---|---|---|
| 条 vs 弹窗底 | 5.04 | 3.94 | 4.77 | 5.69 | 4.94 |
| 正文 vs 弹窗底 | 13.04 | 17.66 | 12.12 | 15.52 | 12.75 |

（`opacity: .55` 的 `currentColor` 与弹窗底色合成后再算，非估算。首轮量错了：脚本里写的 `dark/teal/purple/custom` 这四个主题名**在 `themes.css` 里不存在**，于是四次都退回默认主题——上表是改用 `[data-theme='light|midnight|oled|theatre']` 真实值后的重测。）

**验证证据（M2-b9 最终状态，与代码同版本）**

| 门禁 | 结果 |
|---|---|
| `vue-tsc --noEmit` / `npm run lint` | 退出码均 **0**（中途 `build` 抓到一次 `TS2339: Property 'mounted' does not exist on type 'Directive'` —— 联合类型上取钩子，改走 `{ mounted }` 结构解构而非加 `!`） |
| `i18n:check:strict` | 通过，`src` **197** 个文件（+1 = `core/range-fill.ts`） |
| `check:css-conventions` | **5/5** 通过，`!important` **26**（基线 26，未新增） |
| `a11y:contrast`（静态） | 通过，实际扫描 **121** 处存量（基线 131）——与 M2-b8 持平，未因新着色上涨 |
| `runtime:db:schema:check` / `snapshot:migration:check` / `eval:manifest` / `check:csp` / `check:ort` | 全部退出码 **0** |
| `npm run test:coverage` | 退出码 **0**，**3696 passed / 3 skipped**，覆盖率 **79.5 / 74.07 / 81.64 / 81.36**（阈值未放松）；`range-fill.ts` 与 `toast-service.ts` 均 **100%** |
| `npm run build` | 退出码 **0** |
| E2E（msedge 48 + mobile-functional 9 + mobile 5） | **62 passed / 0 failed**（2.3 分钟） |
| E2E（webkit，串行） | **16 passed / 0 failed，连续两轮**（本批次把 `ux-interaction-feedback` 6 例并入 webkit project，两个内核各跑一次） |
| 界面实测（Edge 1440×900） | 56 个采样按钮（4 条路由 × 14）**全部**在悬停时计算样式发生变化；侧栏激活项 hover 前 `box-shadow: none` → hover 后出现 `inset` 着色；滑块 `--range-pct` 随 End/Home/拖动为 `100.00% / 0.00% / 90.00%`，轨道 `background-size: 100% 4px` 居中、盒子高 16px；提示 info 在 `+2.3s` 仍在、`+3.5s` 已消失，倒计时条 `0.998 → 0.598 → 0.248`，悬停 3s 内停在 `0.8686` 不动 |
| 截图 | `docs/dev/evidence/ux-ia-guided-flow/m2-b9-interaction-feedback/`：`before-slider-flat.png`（整条轨道一个色，只有圆点在动）/ `after-slider-filled.png` / `after-slider-hover-halo.png`（拇指光晕）/ `before-rail-hover.png`（激活项 hover 无变化）/ `after-rail-hover-fill.png` / `before-toast-no-countdown.png` / `after-toast-countdown.png` / `after-toast-hover-frozen.png`。before 图是把 `base.css` / `Toast.vue` 临时换回 HEAD 版本后拍的，拍完立即还原 |








### M3-b0 四条关联缺口补完（E03 / E19 / E22 / E23）

用户点名的第二批：把 §1.4 里还挂着的四条边补掉。四条性质不同，做法也不同。

| 边 | 前测 | 做法 | 关键取舍 |
|---|---|---|---|
| E03 全局书无条件注入 | C | `ContextPanel` 的世界书清单改读发送链路同一个 `collectLorebooksForCharacter`，全局书单列并打"全局生效"标，每行可点（先 `selectLorebook` 再带 `?from=/chat` 跳世界书页） | **共用判定源**而不是再抄一份过滤逻辑——原缺陷正是"面板自己 filter boundWorldBookIds"造成的。计数一并改成生效口径（绑定 1 + 全局 1 = 2 本） |
| E19 哪些角色被跟踪 | C | `stores/character-version.ts` 补 `trackedCharacterIds` / `hasRepository`；角色卡 `card-meta` 行尾加"已跟踪"标记，点它带 `?char=<id>` 进版本页，版本页 `onMounted` 读该 query 定位角色 | 标记读的是**事实**（仓库存在与否），不是"用户看过版本页"这种痕迹；删仓库后标记随之消失 |
| E22 图片模型两处配置 | C（双重） | `imageGenConfig` 进设置持久化白名单（`writeSettingsSnapshot` 显式字段表 + `loadFromStorage` 逐项归一化 + `decryptAllApiKeys` 同批解密）；图像 store 的 `providerConfig` 改成 settings 那份的**只读 computed 镜像**，写一律走 `updateProviderConfig → setImageGenConfig`；页内加"从「模型接入 · X」填入"与 `?cat=model` 跳转 | 单一事实源放在 settings（只有它有白名单与加密分支），避免"两个 store 互相 watch"的循环；密钥复用 `encryptApiKey`/`isEncrypted`，**不新造加密路径**；锁定态（内存里是 `enc:v1:`）不算"已配置"，否则会拿密文去发请求 |
| E23 图片 → 对话 | E | 图片页页头一句"产物只存进下方画廊，不会进入对话消息" | 该能力不存在且无可跳目标，只能声明；不做"图片入对话"以免超出范围 |

**顺带修掉的真实缺陷（不是为测试改产品）**：版本快照只在 `CharacterVersionView.onMounted` 里加载 ⇒ 离开那一页，全应用都不知道哪些角色被跟踪，E19 的标记永远不可能正确。改为启动 `Promise.all` 里加载一次（带 catch，坏一次不影响其他 store）。

**反证（逐条摘掉守卫）**

| 摘掉 | 结果 |
|---|---|
| 面板改回只按 `boundWorldBookIds` 过滤 | E03 单测 **4 failed**（含"不再谎报未绑定"与计数口径） |
| 把 `imageGenConfig` 从持久化白名单摘掉 | E22 单测 **4 failed**（落盘 / 加密 / 明文 / 解锁同批解密） |
| `canGenerate` 不再排除密文密钥 | **1 failed**（锁定态被当成可生成） |
| 启动不加载版本快照 | E19 的 e2e 用例**自然失败过一次**（标记数为 0），正是这条发现引出了上面的启动加载修复 |

**webkit 串跑偶发的真机制（本批次纠正 M2-b9 记下的因果）**

M2-b9 把"`ux-prompt-trace` 在 webkit 全量里变红"归因为"本批次新 spec 里那次'清除背景'写了设置"。这个因果**不成立**，本批次实测：

| 实验 | 结果 |
|---|---|
| `backup-restore` + `ux-prompt-trace`（两条都是 M2 之前的老用例，**不含任何本批次新增用例**） | **稳定复现**失败 ⇒ 与本批次新 spec 无关 |
| 失败现场按时间dump `settings.app` | `after-configure n=1` → `before-reload n=0` → `reload+0s n=1` ⇒ 快照在两个 app 实例之间来回盖，是**同一 webkit 进程内多 context 共享存储目录**导致的跨用例写竞态 |
| 尝试"首次启动不写默认快照" | 该 pair 变绿，但全量 webkit 仍红 ⇒ 不是成因；且它逼着改一条既有单测的契约，收益不成立，**已完整还原**（含那条单测） |
| 在 `backup-restore` 末尾加"等写入静默" | 无效（晚到的写发生在 context 关闭阶段），**已删除**，不留无效代码 |
| 最终处置：`ux-prompt-trace` 在 `reload()` 前再确认一次"当前落盘的就是自己的 Profile" | pair 绿；webkit 全量**连续两轮 16 passed / 0 failed** |

口径说清楚：这不是产品缺陷（真实用户只有一个 context），是测试环境的存储共享；处置没有放宽任何断言——"刷新后 Profile 仍生效"仍然是原断言，只是补上了"reload 读到的必须是自己的快照"这一前置。M2-b9 记录里那句因果结论已在原文处保留但标注为待纠正，本表为准。

**验证证据（M3-b0 最终状态，与代码同版本）**

| 门禁 | 结果 |
|---|---|
| `vue-tsc --noEmit` / `npm run lint` / `npm run build` | 退出码均 **0** |
| `i18n:check:strict` | 通过，`src` **197** 个文件；zh / en 各 **3321** 行，同序新增 11 键 |
| `check:css-conventions` | **5/5** 通过 |
| `a11y:contrast`（静态） | 通过，扫描 **121** 处存量（基线 131），未因新标记/新说明上涨 |
| `runtime:db:schema:check` / `snapshot:migration:check` / `eval:manifest` / `check:csp` / `check:ort` | 全部退出码 **0** |
| `npm run test:coverage` | **3723 passed / 3 skipped**，覆盖率 **79.69 / 74.16 / 81.82 / 81.57**（阈值未放松）；本批新增 5 个测试文件共 **27** 例 |
| E2E（msedge 55 + mobile-functional 9 + mobile 5） | **69 passed / 0 failed**（2.3 分钟；较上批 +7 条本批用例） |
| E2E（webkit，串行） | **16 passed / 0 failed，连续两轮** |
| 界面实测（Edge 1440×900） | 上下文面板世界书一节显示"1 本"并列出未绑定的全局书、带「全局生效」胶囊标；角色卡元信息行尾出现"已跟踪"（带 git-branch 图标 + 下划线），点它落到 `/character-version?char=kael&from=/character`；图像页填完端点/模型/密钥后刷新，三项都还在（密钥以掩码显示）；页头出现"产物只存进下方画廊，不会进入对话消息"。另测得"访问过版本页 → 角色列表出现标记"的延迟为 **822ms（一次刷新内即出现）**——快照落盘是懒建后的异步写，第一版截图脚本按 800ms 等待曾拍到没有标记的那一帧，已改成"拍到带标记的卡片"为止 |
| 截图 | `docs/dev/evidence/ux-ia-guided-flow/m3-b0-gap-visibility/`：`e03-context-panel-global-book.png` / `e19-character-card-tracked.png` / `e22-image-provider-config.png` / `e22-image-provider-after-reload.png` / `e23-image-header-note.png`。**本批没有 before 截图**：四条边的"修前长什么样"由上面的反证表（摘掉守卫即转红）承担，比截图更硬；E22 的修前事实是"刷新后 IndexedDB 里根本没有 `imageGenConfig` 这个键"，无法用界面截图表达 |
| 未做的事 | `ux-gap-visibility.spec.ts` **不纳入 webkit**（E22 用例会写设置，跨 context 共享目录会污染后面的用例，原因见上表）；E22 的"两处互读"只做到**单向一键填入**，没有把两份配置合并成一份（图像页支持 custom 端点、Profile 有 category 语义，合并属另一件事） |

### M3-b1 引导原语（StepFlow / HelpTip / FormField）

G 层一直缺三块原语：任务卡里的"步骤"是内联渲染的（主清单与进阶清单**各写一遍**），
新建会话弹窗的步骤指示器是另一套私有实现，说明与报错的 aria 关联靠各页面自觉。
本批把这三块建起来并接上两处采用。

| 原语 | 形态 | 采用情况 |
|---|---|---|
| `StepFlow.vue` | 传 `current` 即**向导**（圆点 + 连接线 + 当前步标签，`aria-current="step"`）；不传即**清单**（编号 + 说明 + 行尾动作或"已满足"） | 已接两处：`GuidedTasksCard` 两段重复步骤列表、`NewConversationModal` 的指示器。随之删掉 10 条只服务于这两处的样式 |
| `HelpTip.vue` | 真按钮 + `aria-describedby` + `role="tooltip"`；悬停 / 聚焦 / 点击三条路都能开 | **本批无采用点**（原因见下），随 M3-b3 的两个快速档接入 |
| `FormField.vue` | 标签 / 说明 / 报错外壳，用**插槽参数**下发 `id` / `aria-describedby` / `aria-invalid` | 同上，随 M3-b3 接入 |

**为什么一个组件伺候两种形状**：两者共用"第几步"这个概念与 `common.step` / `prereq.done` 这些键，
拆成两个组件只会让同一件事在界面上长得不一样；模式判定用"`current` 是否传"，
不给调用方第二个开关去选错。

**键盘边界**：向导模式只接管 ←/→（并 `preventDefault`，避免页面横向滚动），
Up/Down/Home/End 一律放行。原因是设置页的分类 tablist（`SettingsView.handleCategoryKeydown`）
把这四个键全占了，同屏时必抢；处理器挂在 StepFlow 自身根节点上，焦点不在组内根本不触发。
另外**到边界不循环**——向导步骤有先后语义，循环会让人以为可以跳步。

**`current` 是受控 prop**：组件不自己记步数，只 emit `change` 请求。
好处是 `NewConversationModal` 的 `canNext` 闸门不需要复制一份进原语；
代价是单测里"按 → 再按 ←"必须各自从固定起点挂载（一开始写成连续两次按键，
第二条断言自然不成立——这是组件的正确行为，不是缺陷）。

**两个实现期发现（都值得留在文档里，因为都会再踩）**

| 发现 | 结论 |
|---|---|
| prop 取名 `ariaLabelKey`，模板写 `aria-label-key` | vue-tsc **把它当 ARIA 属性而不是 prop**，报 `Property 'ariaLabelKey' is missing`，且 kebab 值仍出现在报错里；改名 `labelKey` 即通过。组件对外暴露"可读名字"时不要以 `aria` 开头命名 prop |
| HelpTip 想接管就绪状态芯片（原因只写在 `title=` 里，读屏拿不到） | **塞不进去**：芯片本身是 `<button>`，按钮里再放按钮是非法 HTML。那处正确的修法是给芯片自身加 `aria-describedby` 指向一段隐藏文本，与 71 处 `title=` 的全量迁移一起留在 §七 #14。故本批 HelpTip 只交付原语 + 测试，采用点随 M3-b3 |

**验证证据（M3-b1 最终状态，与代码同版本）**

| 门禁 | 结果 |
|---|---|
| `vue-tsc --noEmit` / `npm run lint` / `npm run build` | 退出码均 **0** |
| `i18n:check:strict` | 通过，`src` **200** 个文件；zh / en 各 **3322** 行，仅新增 1 键 |
| `check:css-conventions` | **5/5** 通过，`i7` 未覆盖 **0** 条 |
| `a11y:contrast`（静态）+ `a11y:contrast:self-test` | 通过，扫描 **121** 处存量（基线 131） |
| `runtime:db:schema:check` / `snapshot:migration:check` / `eval:manifest` / `check:csp` / `check:ort` | 全部退出码 **0** |
| `npm run test:coverage` | **3745 passed / 3 skipped**，覆盖率 **79.69 / 74.16 / 81.82 / 81.57**（阈值未放松）；本批新增 3 个测试文件 **22** 例 |
| axe（新原语专项） | 向导态 / 清单态 / HelpTip / FormField **4 例全过，0 违规** |
| E2E（msedge 55 + mobile-functional 9 + mobile 5） | **69 passed / 0 failed**（1.7 分钟） |
| E2E（webkit，串行） | **16 passed / 0 failed** |

### M3-b2 空态收敛到 EmptyState（13 份手写副本 → 1 个组件）

前测口径是"`grep -rl '\.empty-state' src --include=*.vue` 实测 13 个文件各自定义该样式"。
本批把其中 11 个视图的 **22 处**空态改成共用 `EmptyState`，并删掉 **30 条**只有它们在用的
`.empty-state*` / `.empty-hint` / `.empty-title` / `.empty-text` / `.empty-icon` 样式。

| 文件 | 处数 | 改法 |
|---|---|---|
| `CommunityMarketView.vue` | 6 | 搜索无结果 / 推荐未登录（带动作）/ 推荐为空 / 收藏为空 / 发布未登录（带动作）/ 我的发布为空 |
| `CharacterVersionView.vue` | 3 | 无历史 / 无分支 / 无差异，均为"标题 + 一句解释" |
| `RandomEventsView.vue` | 3 | 无模板 / 无场景 / 无结果 |
| `LocalModelView.vue` | 3 | 无模型（带图标）；无指标、未跑基准两处原是 `.empty-state.small` 只有一行字 ⇒ 新增 `compact` 变体承接 |
| `ArchivesView.vue` | 1 | 两种空态（无数据 / 被筛空）合并成一个组件调用，"清除筛选"只在被筛空时出现 |
| `CharactersView.vue` | 1 | 同上：搜索无结果与一个角色都没有，走不同文案键 |
| `DataBankView.vue` / `StoryEngineView.vue` | 各 1 | 动作按钮从"图标 + 文字"的 `header-btn upload-btn` 改为组件统一的主行动按钮（**丢掉了按钮内的小图标**，换来两处与其它空态同形） |
| `ImageGeneratorView.vue` | 1 | 画廊为空 |
| `WorldBookView.vue` / `GroupChatView.vue` | 各 1 | 宿主是 `<ul>` 里的一项 ⇒ 给组件加 `as="li"`，否则生成 `ul > section` 的非法结构（axe 的 `list-item` 规则会红，实测过） |

**组件本身为此扩了三个口子**（都是被真实需求逼出来的，不是预留）：
`as: 'section' | 'li'`（列表宿主）、`compact`（面板内小空态不配 40px 圆底图标）、
`headingLevel: 2 | 3`（嵌在别的标题之下时降级）；另外把写死的 `id="empty-title"`
换成随机 uid —— 一页可能同时出现两个空态，重复 id 会让 `aria-labelledby` 指错。

**被 axe 否掉的一次写法**：`WorldBookView` 的空态用了 `heading-level="3"`，
axe 立刻报 `heading-order`（该页此前没有 h2，h1 直接跳 h3）。改回默认 h2 后
`tests/accessibility/worldbook-group-axe.test.ts` 的两条"空状态应通过 axe 审计"全过。

**没有改的一处，以及为什么**：`ChatMain.vue:930-956` 的空态带**动态示例提问芯片**
（一组可点 chip），不是"图标 + 标题 + 说明 + 一个主行动"的形状；硬塞进 EmptyState
要么给它开一个"任意内容"的口子（那就又回到各写各的），要么丢掉芯片。
故保留其私有实现，本批只删掉它以外的那些副本。

**后测口径**：`grep -rl '\.empty-state' src --include=*.vue` 现在只剩
`ChatMain.vue` 与 `EmptyState.vue` 自身；使用组件的文件 **12 个**
（11 个视图 + 原本就在用的 `ChatView.vue`）。

**验证证据（M3-b2 最终状态，与代码同版本）**

| 门禁 | 结果 |
|---|---|
| `vue-tsc --noEmit` / `npm run lint` / `npm run build` | 退出码均 **0** |
| `i18n:check:strict` / `check:css-conventions` / `a11y:contrast` + self-test / `runtime:db:schema:check` / `snapshot:migration:check` / `eval:manifest` / `check:csp` / `check:ort` | 全部退出码 **0**；对比度扫描 **121** 处存量（基线 131）未上涨 |
| `npm run test:coverage` | **3745 passed / 3 skipped**，覆盖率 **79.69 / 74.16 / 81.82 / 81.57** |
| axe 空态专项（世界书页 / 群聊页） | **2 passed**（含 `heading-order` 反例修回后） |
| E2E（msedge 55 + mobile-functional 9 + mobile 5） | **69 passed / 0 failed**（1.7 分钟） |
| E2E（webkit，串行） | **16 passed / 0 failed** |
| 界面实测（Edge 1280×860，全新 context） | 世界书侧栏空态 = 标题 + 主行动按钮；数据银行空态 = 标题 + 解释 + 上传按钮；记录页空态 = 单行标题。角色列表页**没有空态可拍**（应用自带内置角色，列表不空），这条如实记下而不是补造假截图 |
| 截图 | `docs/dev/evidence/ux-ia-guided-flow/m3-b2-empty-state/`：`worldbook-list-empty.png` / `databank-empty.png` / `archives-empty.png` |
| 测试适配（不是削弱） | `e2e/ux-readiness.spec.ts` 一处选择器从 `.empty-state .link-btn` 改为 `.empty-state .empty-action`（动作按钮类名随组件统一），断言的跳转行为不变 |

### M3-b3 两个快速档（角色 4 件事 / 世界书最小生效三步）

§2 里"建角色"那一行的前测事实是 **1 屏 6 段 23 个 label、1 个星号、看不到绑定**；
世界书那条最短生效路径要跨 **3 屏 4 跳**。本批把这两条路各自压到一屏。

| 快速档 | 内容 | 关键约束 |
|---|---|---|
| 角色 `QuickCharacterForm.vue` | 名字（必填）+ 设定 + 可选一本世界书 + 建好并开始 | **保存时才建角色**：不产生草稿、不给"跳去编辑"的链接（`/character/new` 没有 ID，跳过去是空跳，§3.5.6 明写过这个坑）；绑定动作排在 `createCharacter()` 返回 ID **之后**，否则 `bindWorldBook` 找不到角色只返回 false，用户看到"建好了但书没生效" |
| 世界书 `QuickLorebookFlow.vue` | 建书 → 加一条**启用且 constant** 的条目 → 绑到当前角色 | 三步的实质是"无条件注入成立"的三个条件，不是三个按钮；步骤条用 StepFlow 清单态；后两步在前一步完成前禁用，避免做出无效操作 |

**两档切换用 `v-if` 而不是 `v-show`（一个真实缺陷被 e2e 撞出来）**
先用 `v-show` 隐藏完整表单，`e2e/ux-relations-panel` 立刻报
`strict mode violation: getByLabel('名称') resolved to 2 elements`——两档同时在 DOM 里，
"名称"标签重复，而且隐藏表单里的输入框**仍然能被 Tab 进入**。改成 `v-if` 后
6 条相关用例全绿。代价如实记下：新建态来回切档会丢掉未保存的填写，
那时还没有任何持久化数据，可接受；编辑已有角色时不提供快速档，避免"藏字段=丢数据"。

**世界书入口做过一次方向纠正（自动展开 → 显式入口）**
第一版是"一本书都没有时自动展开三步"。实测否掉：那等于把编辑器从用户手里抢走，
`e2e/worldbook-flow.spec.ts`（新建 → 重命名 → 加条目 → 树显示）整条被挡住，
移动视口下流程卡片还盖住了编辑器的"新增条目"按钮（`intercepts pointer events`，30s 超时）。
现在改成空态里一颗显式按钮"或按最小生效三步走"，默认仍进编辑器；
流程打开期间编辑器整体不渲染（两者共存就是上面那个遮挡问题），走完点"完成"收起。

**顺带修的一处样式**：`:disabled` 的 input/textarea 在深色主题下被浏览器刷成浅灰底，
看着像坏了；补一条 `.quick-wb :disabled` 让禁用态保持主题色。

**验证证据（M3-b3 最终状态，与代码同版本）**

| 门禁 | 结果 |
|---|---|
| `vue-tsc --noEmit` / `npm run lint` / `npm run build` | 退出码均 **0** |
| `i18n:check:strict` / `check:css-conventions` / `a11y:contrast` + self-test / `runtime:db:schema:check` / `snapshot:migration:check` / `eval:manifest` / `check:csp` / `check:ort` | 全部退出码 **0**；对比度扫描 **121** 处存量（基线 131）未上涨 |
| i18n 增量 | `quick.*` 共 **32** 键，zh / en 各 **3354** 行，同序 |
| `npm run test:coverage` | **3759 passed / 3 skipped**，覆盖率 **79.69 / 74.16 / 81.82 / 81.57**；本批新增 2 个测试文件 **12** 例 + axe **2** 例 |
| axe（两个新表单） | 快速档与三步流程各 **0 违规** |
| E2E（msedge + mobile-functional + mobile） | **74 passed / 0 failed**（2.4 分钟；较上批 +5 条本批用例） |
| E2E（webkit，串行） | **16 passed / 0 failed** |
| 新用例 | `e2e/ux-quick-forms.spec.ts` 5 例：默认落快速档且完整表单不在 DOM、头部保存按钮不并存、空名不建角色并给原因、切档双向、三步做完后**这本书出现在上下文面板**（把"生效"闭环到 E03 那一列上）、空名不建书 |
| 浏览器实测 | 快速档填两项 → 建好 → URL 到 `/chat` → 角色列表出现该卡；三步做完后 `/chat` 上下文面板显示"世界书 1 本 / 港口设定 E2E / 1 条启用"；无 pageerror |
| 截图 | `docs/dev/evidence/ux-ia-guided-flow/m3-b3-quick-forms/`：`char-quick-form.png` / `char-full-mode-switch.png` / `wb-empty-with-flow-entry.png` / `wb-three-steps-initial.png` / `wb-three-steps-done.png` |

### M4-b1 原生 title 迁移与键盘可达性（§七 #14 结案）

**先纠正口径**：§七 #14 写的是"71 处 `title=`"。实测 `src` 下 59 个 .vue 文件里 `:title=` 共 **75 处**，
其中 **42 处是 `<Modal :title>` 的对话框标题**（不是 HTML tooltip，本来就该留），
真正的原生 tooltip 是 **33 处**。静态 `title="..."` 一处也没有，全部是绑定形式。

**为什么最终不是"迁到 HelpTip"**（这是本批最重要的一次改道，原因是先按原方案试过才发现走不通）：
HelpTip 自己渲染一个 `<button>`，而 33 处里 **21 处的宿主本身就是按钮/链接/label** —— 按钮里再放按钮是非法 HTML；
另有 **12 处在 `v-for` 里**（侧栏 15 个入口、世界书条目树可达数百行），HelpTip 的 id 由文案键派生，
同文案在每行生成同一个 id，`aria-describedby` 会全部指到第一行；
还有一半以上站点的文案是**插值结果或数据字段**（`{level} 层级`、`preset.description`），HelpTip 只接受 `MessageKey`。
所以改成指令形态 `v-tip`（`src/core/tip.ts`，`main.ts` 注册）：宿主元素不变，气泡节点由指令挂到 body，
id 用自增计数器保证唯一，值可以是任意字符串并随绑定更新。

| 处置 | 处数 | 说明 |
|---|---|---|
| 改 `v-tip` | 29 | 侧栏 15、就绪芯片 5、会话列表 3、聊天页 10（含搜索/导出/快回脚本）、其余 6 |
| 改 `:aria-label` | 1 | `WorldBookView` 树的层级徽标：行数不可控，每行挂一个气泡节点不划算 |
| 保留原生 title | 1 | `LocalModelView` 基准历史芯片（嵌套 `v-for`，行数不可控，且耗时本身有可见文字） |
| 改成**可见文字** | 1 | 市场页 Beta 免责：原来只在 title 里，触屏与键盘都拿不到，而它是本页最重要的一句免责 |
| 直接删掉 | 1 | 数据面板"单档案模式"说明——该按钮此时是 `disabled`（禁用元素不进焦点顺序，挂 v-tip 也读不到），而**这句话在同一个块上方已有可见版本**（`role="note"`），title 只是重复 |

**顺带修掉的两处真实无障碍缺口**（都是迁移过程中撞出来的）：
1. `ChatMain.vue` 的 token 指标整块带 `aria-hidden="true"` ⇒ 读屏完全拿不到"已耗 token / 缓存命中率"。
   去掉 aria-hidden，并给两个指标 span 补 `tabindex="0"`——**不可聚焦的元素挂 `aria-describedby` 等于没挂**。
2. 组件测试拿不到 `main.ts` 注册的全局指令：Vue 只报一句 `Failed to resolve directive` 就静默跳过，
   于是 `v-tip` 的 `aria-describedby`、`v-range` 的 `--range-pct` 在单测里全部消失。
   已在 `tests/setup.ts` 统一 `config.global.directives` 注册，测试与运行时看的是同一套指令。

**把待办变成会咬人的检查**：新增 `tests/accessibility/no-native-title.test.ts`，
扫 `src` 全部 .vue，按宿主标签分类断言——交互元素上有 `title` 直接失败；
非交互元素的 `title` 必须在白名单里且写明原因；剩余总数写死为 1（多一处少一处都会红）。
该用例还钉了 `files.length > 50`，防止"路径解析坏掉 → 0 命中 → 当成 0 违规"的假绿
（这个假绿真的出现过：最初的 `import.meta.url` 解析在 jsdom 下拿到 `/@fs/...`，扫描结果为 0，
前两条断言就这么"通过"了）。

**被改写的既有断言（4 处，语义不变）**：`tests/components/readiness-surfaces.test.ts:45,81`、
`e2e/ux-readiness.spec.ts:22`、`e2e/ux-nav-model.spec.ts:22` 原来都断言 `title` 属性，
现改为断言 `aria-describedby` + body 上 tooltip 节点的文案；侧栏那条仍是"15 个入口都带一句话职责"。

**验证证据（M4-b1 最终状态，与代码同版本）**

| 门禁 | 结果 |
|---|---|
| `vue-tsc --noEmit` / `npm run lint` / `npm run build` | 退出码均 **0**（build 曾抓到守卫用例的 `noUncheckedIndexedAccess` 类型错，改判空而不是加 `!`） |
| `i18n:check:strict` / `check:css-conventions` / `a11y:contrast`(扫描 **121**，基线 131) + self-test / `runtime:db:schema:check` / `snapshot:migration:check` / `eval:manifest` / `check:csp` / `check:ort` | 全部退出码 **0** |
| `npm run test:coverage` | **3770 passed / 3 skipped**，覆盖率 **79.74 / 74.13 / 81.82 / 81.64**；`tip.ts` 语句 **91.17%** |
| 新增测试 | `tests/core/tip.test.ts` 8 例（含"多个宿主各自唯一 id"与"卸载后不泄漏 body 子节点"）、`tests/accessibility/no-native-title.test.ts` 3 例 |
| E2E（msedge + mobile-functional + mobile） | **74 passed / 0 failed**（1.8 分钟） |
| E2E（webkit，串行） | **16 passed / 0 failed** |
| 浏览器实测（Edge 1440×900） | 侧栏 `.nav-item[aria-describedby]` **15**、`.nav-item[title]` **0**；就绪芯片 5 个全部挂上描述；**键盘 Tab 聚焦即出现气泡**（文案"与单个角色连续对话"，定位 top 67px / left 8px）；芯片聚焦读出"还没有可用的模型配置，发送后收不到回复"；Esc 立即收起（`is-visible` 归 0）；市场页 Beta 说明已是可见文字；无 pageerror |
| 截图 | `docs/dev/evidence/ux-ia-guided-flow/m4-b1-tips/`：`tip-on-keyboard-focus.png`（键盘触发的气泡）/ `tip-readiness-chip.png`（芯片原因文案） |
| 未做 | 33 处之外的"全站键盘可达性审计"（§七 #14 的后半句）仍留作专项——本批只保证 tooltip 类信息不再依赖指针，未系统检查焦点顺序与陷阱 |

### M4-b2 设置页常规/高级折叠（`Collapse` 原语，§3.6.4 与 M4-a 未做项的前半）

**做了什么**：新增 `src/components/common/Collapse.vue`，把设置页里"每天要用的"和"一年调一次的"从平起平坐改成两段。

| 位置 | 折叠的段 | 默认 | 一并调整 |
|---|---|---|---|
| 设置 → 外观 | 「界面自定义」（聊天背景 / 气泡样式 / 自定义 CSS） | 收起 | 段说明从没有人读的 `uiCustomHint`（原值"主题、字号、界面自定义"）改写为"这些是偶尔调一次的样式项，改完要点各块下方的应用才生效" |
| 设置 → 数据 | 新分组「运维与兼容」= 快捷回复互导 + 数据持久性 + 嵌入优化 + 审计日志 | 收起 | 同一段内 8 个块重排为「档案 → 全量备份 → 导出 PNG → 导出 Markdown → 运维与兼容」，日常动作不再被四段运维项挡在下面 |
| 设置 → 模型（新增/编辑 API 弹窗内） | 「默认采样参数」（top_p / presence / frequency） | 收起 | 原 `<fieldset>` 改为折叠段；弹窗内用 `plain` 变体，不再套第二层卡片。随之删除 `.sampling-fieldset` 两条死样式 |

**一条必须钉住的契约：折叠只能是 `v-show`**。设置面板里全是"输入到一半"的草稿（自定义 CSS、选了一半的采样参数），用 `v-if` 收起等于把用户写的东西扔掉；`tests/setup.ts` 里那句"各分区 v-show 保留草稿状态"是设置页一直在守的既有契约。`tests/components/collapse.test.ts` 用三种方式守它：收起后节点仍在且 `value` 仍是草稿值、面板行内 `display` 的切换、以及**收起再展开后输入框是同一个 DOM 节点**（`v-if` 会换节点）。故障注入实测：把 `v-show` 改成 `v-if` → 该文件 **3 例转红**。

**说明文字（`hintKey`）刻意放在面板外面**：收起时用户仍要知道这一段是什么、为什么默认收着，否则折叠就变成"藏东西"。这条也写成了断言（`panel.contains(hint) === false`）。

**jsdom 的 `getComputedStyle` 会返回上一次的缓存值**（本批踩到，记下来免得再踩）：`@vue/test-utils` 的 `isVisible()` 走 `getComputedStyle`，实测在"收起→再展开"之后仍报 `display: none`，即第二次点击的断言红得毫无道理；同一份组件在真实浏览器里量到的是 `display: flex`。改为直接断言 `v-show` 写入的**行内** `style.display`——读的就是契约本身，且不受 jsdom 缓存影响。

**被改写的既有断言（2 处，语义都变强了）**
1. `e2e/ux-interaction-feedback.spec.ts:32`（滑块轨道着色）：目标控件搬进了默认收起的高级段，用例新增"收起时不可见 → 点开 → 可见"两步。定位器从 `input.form-range` 的 `first()` 改为 `#bubble-radius`：`#bg-opacity` 在背景类型为"无"时是 `v-if`，节点根本不存在，用它断"收起时不可见"会因为"元素不存在"而**假绿**。
2. 同文件 `:137`（提示倒计时条）：原来在断言"条已可见"的同一帧读 `scaleX` 并要求 `< 1`。倒计时由 rAF 驱动、`begin()` 先写 `ratio = 1` 再等第一帧，机器忙时首帧可晚几百毫秒 ⇒ 本批实测连续复现读到 `scaleX(1)`。改为 `expect.poll(scale).toBeLessThan(1)` 先等它动起来，再比两次采样——"会缩短、会自己关"的契约一个字没放松。

**验证证据（M4-b2 最终状态，与代码同版本）**

| 门禁 | 结果 |
|---|---|
| `vue-tsc --noEmit` / `npm run lint`(0 error，6 warning 均来自 M3-b3/M4-b1 既有测试文件) / `i18n:check` + `:strict` / `check:css-conventions`(5/5) / `a11y:contrast`(扫描 **121**，基线 131) + self-test / `snapshot:migration:check` / `runtime:db:schema:check` / `check:csp` / `check:ort` / `eval:manifest` | 退出码均 **0**（`eval:manifest` 产物按既有约定回退，不入本批提交） |
| `npm run test:coverage` | **175 files passed / 2 skipped**，**3780 passed / 3 skipped**（较 M4-b1 的 3770 增 10 = `collapse.test.ts` 新增例数），覆盖率阈值无告警 |
| 新增测试 | `tests/components/collapse.test.ts` **10 例**：v-show 三条实质证据、`aria-expanded`/`aria-controls`/`aria-labelledby` 接线、`level` 不改标题层级、`advanced` 标、说明在面板外、`plain` 变体 |
| E2E（msedge，默认并行） | 三轮分别 7 / 4 / 4 failed，**失败集合每轮都不同**（`contrast-axe` 三条、`worldbook-flow`、`ux-quick-forms`、`group-chat-flow:99`、`ux-gap-visibility` E19 轮流超时）⇒ 与 `REAL_DEVICE_TEST_2026-10-03.md:109` 登记的 **O-4** 同型（本机并行抢占 CPU，30s 默认超时偏紧）。按 O-4 的处置复跑：`--workers=2` **60 passed / 0 failed**，`--workers=1 --timeout=120000` 单跑 `contrast-axe` + `group-chat-flow` **5 passed** |
| E2E（webkit，`--workers=1`） | **16 passed / 0 failed** |
| E2E（mobile-functional-msedge + mobile-msedge，`--workers=2`） | **14 passed / 0 failed** |
| 浏览器实测（Edge，dev :5179） | 外观段收起时 `aria-expanded=false`、面板 `display:none`；点开后 `aria-expanded=true`、面板 `display:flex`、内含 **12** 个控件；数据段收起时四个 `.data-mgmt-row` 全在 `display:none` 的面板里，可见块为档案/备份/PNG/Markdown 四项；模型弹窗内折叠段 class 为 `collapse-section is-collapsed is-plain`，展开后 `#p-top-p`/`#p-presence`/`#p-frequency` 齐备；**键盘 Space 在标题按钮上切换生效**（`aria-expanded` true→false、面板 `display:none`、焦点保持在按钮上） |
| 截图 | `docs/dev/evidence/ux-ia-guided-flow/m4-b2-collapse/`：`appearance-collapsed` / `appearance-expanded` / `appearance-expanded-panel` / `data-advanced-collapsed` / `data-advanced-expanded` / `model-modal-sampling-collapsed` / `model-modal-sampling-expanded` |
| 未做（诚实边界） | ① 该浏览器工具派发 **Enter** 时不激活任何原生按钮（在同一页面对设置分类标签按 Enter 同样无反应，而 Space 正常）⇒ 记为测试工具的按键派发问题，未据此给组件加 `@keydown` 兜底；② 折叠状态**不落盘**：设置各分类是 `v-show` 常驻，所以切分类、跳页面回来都保持，只有整页刷新会回到默认（高级段重新收起）——没有把它做成持久化偏好；③ 角色编辑器"属性"段那套自写折叠（`CharacterEditorView.vue:968-996`）尚未并入 `Collapse`，留作 M4-b3 拆该视图时一起做；④ §3.6.4 的"四个巨型视图分区"未动（M4-b3） |

### M4-b4 四条未覆盖边里的三条 + `/profile` 并入设置→关于

§1.4.1 后测复评留下的 4 条未覆盖边（E10 / E11 / E15 / E21），本批补掉三条，E11 因需要动消息数据契约而**明确不做**（见末尾）。

| 边 | 落地 | 判定/契约所在 |
|---|---|---|
| E10 随机事件 → 场景名必须等于角色名 | `/random-events` 页头下挂 `PrereqNotice` 三行：总开关、场景名与当前角色名一致、至少一个已启用场景 | `readiness.ts` 新增 `useRandomEventPrereqs()`；不一致时一跳该角色的编辑页（无当前角色则跳角色列表），回程由 App 的全局"返回来源页"承接 |
| E15 故事 → 对话 | 聊天顶栏的故事时间由 `<div role=status>` 改为 `<button>`，一跳 `/story?story=<id>`；故事引擎读到该 id 且它真实存在于 `stories` 时才 `selectStory` | `ChatMain.vue` 的 `goToStory()` 走 `pushWithReturn`；`StoryEngineView.vue` 的 `applyStoryQuery()`（setup 一次 + `watch` query） |
| E21 市场 URL → 运行期配置 | 市场页头第二行可见文字：索引地址只在构建期由 `VITE_MARKET_INDEX_URL` 提供、运行期不可配置，**并连同当前值一起显示** | `CommunityMarketView.vue` 直接读 `core/market-index.ts` 的 `MARKET_INDEX_URL`（与 store 用的是同一个常量，不是另写一份文案） |

**为什么 E21 要把 URL 本身显示出来**：只写"运行期不可配置"仍是一句无法核对的声明；把当前指向一起显示，用户能立刻看出"这确实是构建期注入的那个地址"，声明与证据在同一行里。

**`/profile` 并入设置→关于（D-B 后半）**：`ProfileView.vue`（92 行）整页只有一块内容——一个本地用户 + 一句"扮演身份在世界书"，却占一条路由、一个页头、一个返回按钮。搬进「关于」后：
- `/profile` 改为 `redirect: { path: '/settings', query: { cat: 'about' } }`，旧链接、`scripts/ui-shot.mjs`、`e2e/contrast-axe.spec.ts` 的审计路由全部继续可用（后者因此多扫一次 `/settings`，即 D-N 预先接受的代价）；
- `mobile-nav.ts` 的 `DETAIL_ROUTES` 去掉 `profile`（它不再是有名字的沉浸页），`tests/core/mobile-nav.test.ts` 的断言随之翻转为 `false`；
- 死键清理：`nav.profile`（M1-a 后已零读者）、`router.profile`（路由不再有名字）、以及只服务于原页头的 5 个 `profile.*`（`aria/title/subtitle/back/backAria`）；页面正文用到的 8 个 `profile.*` 键保留。

**验证证据（M4-b4 最终状态，与代码同版本）**

| 门禁 | 结果 |
|---|---|
| `vue-tsc --noEmit` / `npm run build` / `npm run lint`(0 error) / `i18n:check` + `:strict`(203 文件) / `check:css-conventions`(5/5) / `a11y:contrast`(扫描 **121**，基线 131) / `snapshot:migration:check` / `runtime:db:schema:check` / `check:csp` / `check:ort` | 退出码均 **0** |
| `npx vitest run` | **176 files passed / 2 skipped**，**3792 passed / 3 skipped**（较 M4-b2 的 3781 增 11） |
| 新增测试 | `tests/views/chat-story-jump.test.ts` 4 例（故事时间必须是 `BUTTON`、点击带 `?story=` 与来路、无故事不渲染、故事被删不渲染）；`tests/views/story-engine-quicksetup.test.ts` +3 例（`?story=` 只认存在的 id）；`tests/core/readiness.test.ts` +4 例（`useRandomEventPrereqs` 三行顺序、无角色跳列表、**改名即断链并跳回该角色**、开关与停用场景独立判定） |
| E2E | msedge（`--workers=2`）**60 passed**、webkit（`--workers=1`）**16 passed**、mobile 两 project（`--workers=2`）**14 passed**，全部 0 failed |
| 浏览器实测（Edge，dev :5179） | `/profile` 落到 `/settings?cat=about`，侧栏「关于」为激活项，账户块渲染"账户 / 登录 / 本地用户 / 激活 / 两句说明"，点「登录」出现 `role=status` 的"远程登录服务尚未配置"与「关闭」；`/random-events` 三行前提齐全，中间一行带「去看角色」，点击后 URL 为 `/character/seraphina/edit?from=/random-events` 且页面出现"返回来源页"；`/community-market` 页头第二行显示 `https://raw.githubusercontent.com/zhuweib-design/ai-roleplay/main/market/index.json` |
| 截图 | `docs/dev/evidence/ux-ia-guided-flow/m4-b4-edges/`：`profile-merged-into-about.png` / `profile-login-note-open.png` / `random-events-prereqs.png` / `market-source-declaration.png`（本批改用 Playwright 无头截图：会话内浏览器在 M4-b2 之后失去了可见表面对象，`take_screenshot` 报 `NATIVE_BROWSER_VIEWPORT_UNAVAILABLE`） |
| 未做（诚实边界） | ① **E11 随机事件注入回显未做**：要在气泡下显示"本轮注入了哪条随机事件"，需要给消息新增一条持久化字段（`promptTrace` 现在只装世界书命中），牵动 `types` + `type-adapters` 两处映射 + 卡片导出契约，不在本批范围内；② E15 的浏览器实测只到"跳过去带 `?story=`"这一侧，聊天侧的故事时间芯片因沙箱内**没有任何故事数据**（`stories` 表 0 条、4 个角色均无 `storyId`）无法用真数据走通，改由 `tests/views/chat-story-jump.test.ts` 用注入的 `storyId` 覆盖；③ `/profile` 的重定向不留 `?from=` 透传，从旧链接进来时"返回来源页"不出现（没有来源可回） |

### M5-b1 引导页优化（默认展开当前任务 + 完成态推进 + 口径分开）

**触发**：用户提"引导页与功能内的引导优化一下"。先把现状量成数字（Edge 无头 + 沙箱真实数据），再动手：

| 实测问题 | 改前 | 改后 |
|---|---|---|
| 进页面能看到几步 | 可见步骤行 **0**（6 条任务全折叠，卡片 325px） | 当前任务自动展开，可见步骤行 **2** |
| 任务行点击目标 | 高 **31px** | 桌面 **40px**、移动 **44px** |
| 步骤动作按钮 | **22×54px**（低于 WCAG 2.2 最小目标 24×24） | 桌面 **30px** 高、移动 **44px** 高 |
| 标题与计数的层级 | 同为 **13px**（眼睛先看到数字） | 标题 14px/600，计数 12px/常规 |
| 同一条任务里两个动作 | 都叫"去设置"、跳同一处 | "去新增配置" / "去设为当前"（各步不同，重复标签归 0） |
| 顶部进度与每行计数 | 都写"步骤 x/y"，一个数任务一个数步 | 顶部改"已完成 x/6 个任务"，每行仍"步骤 x/y" |

**三条语义修正**（不只是样式）：
1. **做完的步骤不再留着动作按钮**：原来 `actionKey` 只看 `jump` 不看 `done`，所以一条已满足的步骤仍然挂着"去设置"，用户会怀疑自己没做对。现在三态各自有交代：未完成能跳 → 按钮；已完成 → "已满足"；未完成又不能跳（可选步）→ 一句"可稍后再做"。最后这句原先是**注册表里写了却永远渲染不出来的键**（`guide.actionOrSkip`），因为渲染层把无跳转的步的文案整个剥掉了。
2. **做完一条任务，收尾给的是下一步**：`.guided-next`（"下一步：<任务名>"），点了直接展开那一条；同时**完成任务不再提供"跳过"**——跳过一件已完成的事没有意义。
3. **"跳过这一步"其实跳的是整条任务**（并从进度分母里去掉），文案改为"跳过这个任务"。

**顺带修掉的四处"界面说不清 / 判据说谎"**：
- 进阶任务 a2「从文稿提取设定」与 a3「接入本地模型」的 `done` 原先**写死 false**——一条永远打不上勾的任务，违反本文件开头"完成与否读真实数据"的唯一规则。改为读 `story.stories.length > 0` 与 `localModel.loadedModelId !== null`。
- a1「多角色群聊」的判据原先抄了 t2 的 `characters.length > 0`，用户从没打开过群聊页它就已经打勾。改为读 `groupChat.groups.length > 0`。
- t6 语音的步骤写"启用**并选择声音**"，而设置界面里**根本没有声音选择器**（`ttsConfig.voiceURI` 全仓无写入点，只有 ChatMain 读一次）。文案改为只承诺存在的控件，并在 why 里明说"界面上没有单独的声音选择器，用的是系统当前语音"。
- 全部完成时卡片会渲染一颗"打开任务清单"，而它就在任务清单页上——原地跳转被 router 的重复导航吞掉，是一颗死控件。改为只在非 `/guide` 的出现位置渲染。

**被改写的既有断言（3 处，都是新契约的直接后果）**：`e2e/ux-guided-tasks.spec.ts` 的"点 t1 才看到步骤"改为断"进页面就展开 + 点一下能收起"（新增一条用例）；跳过用例不再需要先点开，并把 `.guided-skip` 收窄到具体任务（自动展开后页面上同时有两个跳过按钮，Playwright 严格模式会报多命中）；`/more` 的进度文案断言从"步骤"改为"个任务"。单测侧给 `guided-tasks-card.test.ts` 加了 `resetToEmptyData()` 夹具——mock 角色会让 t2/t3 天然完成，"下一条是谁"就随夹具漂移，测不出展开与推进的真实顺序。

**过程中自己踩到并修掉的一个逻辑错**：`toggleExpand` 里先翻 `userPicked` 再比较 `openId`，而 `openId` 依赖 `userPicked`——翻完之后再比，比较基准已经变成空的 `expanded`，于是"点自动展开的那条收不起来"。由新增的收起断言抓到。

**验证证据（M5-b1，与代码同版本）**

| 门禁 | 结果 |
|---|---|
| `vue-tsc --noEmit` / `npm run build` / `lint`(0 error) / `i18n:check` + `:strict` / `check:css-conventions`(5/5) / `a11y:contrast`(扫描 **121**，基线 131) / `snapshot:migration:check` / `runtime:db:schema:check` / `check:csp` / `check:ort` | 退出码均 **0** |
| `npx vitest run` | **176 files / 3795 passed / 3 skipped**（较 M4-b4 的 3792 增 3：自动展开、可选步说明、下一步推进三组新断言） |
| E2E | msedge（`--workers=2`）**61 passed**（比上批多 1 条，即新增的自动展开用例）、webkit（`--workers=1`）**16**、mobile 两 project **14**，全部 0 failed |
| 浏览器实测（Edge 无头，dev :5179） | 见上表"改后"列；另确认 `aria-expanded` 与面板同步、`/more` 进度为"已完成 1/6 个任务"、可选步 `.step-flow-note` 在无跳转时渲染 |
| 截图 | `docs/dev/evidence/ux-ia-guided-flow/m5-b1-guide/`：`guide-auto-expanded.png` / `guide-next-task.png` / `more-progress-wording.png` / `guide-mobile-390.png` |
| 未做（诚实边界） | ① 首启欢迎窗的 3 步仍是**写死的静态文案**，与任务卡前三条说的是同一件事却是两套数据（`OnboardingModal.vue:20-24`），本批未合并；② 自动展开在"用户手动开合过"之后就不再跟随（`userPicked` 一次即锁定），不做定时回归；③ 收起/展开的单条任务状态仍不落盘（只有整卡收起落盘）；④ `compact` prop 已删除，若将来要"侧栏小卡"形态需要重新设计而不是复原它——它原先与持久化收起状态互相矛盾。 |

### M5-b2 功能内的引导（三步走的死路、快速档的空下拉、执行不了的指令）

M5-b1 改的是引导页，这批改的是"引导长在功能里"的那几处。三处都有同一类毛病：**界面把用户带到一个走不通的地方，然后不说话了**。

| 位置 | 改前（实测/读码确认） | 改后 |
|---|---|---|
| 世界书最小生效三步 · 第三步 | 没有当前角色时只剩一颗**永久禁用**的按钮：`:disabled="!currentCharacter"` 让处理函数根本跑不到，于是为这种情况写好的 `quick.wbBindFailed` **永远上不了屏幕**，用户只能对着一层 0.55 透明度猜。更糟的是那句"绑到角色「{name}」"在没有角色时把 `chat.modelNotConfigured`（'未配置'，讲模型配置的字符串）当角色名插进去 | 说明改为"没有可绑的对象 + 全局书不需要绑定"，并给出真出路：一颗**可用**的「改为全局书（不用绑定）」按钮，点了真的把 `scope` 改成 `global` 并让第三步打勾；第三步的标签也跟着实际出路走 |
| 角色快速档 · 世界书下拉 | 沙箱里 0 本世界书时下拉只有"暂不绑定"一项，说明文字仍写"选中的书会……"，像在描述一个用户没找到的功能 | 说明随真实数据切换：0 本时改说"还没有可绑的世界书，所以下面只有「暂不绑定」，建好角色后随时能在编辑页补绑" |
| 世界书页 · 空编辑器 | 一本书都没有时仍写"选择左侧的世界书开始编辑"——**一句执行不了的指令**；同时"创建新世界书""创建第一个世界书""或按最小生效三步走"三个按钮并列 | 0 本时文案改为"还没有世界书。建一本，或按最小生效三步走。"；三步走入口不再只属于空态——选中一本书之后照样能打开（原先它藏在 `!currentLorebook` 分支里，已有书的人永远看不到） |
| 三步走 · 完成按钮 | 文案"完成，去编辑这本世界书"，实际只 `emit('finished')` 关掉流程（书恰好已被自动选中，属于**碰巧对上了**） | 文案改为"完成，回到这本世界书"，与真实行为一致 |

**刻意没做的一件事**：0 本世界书时**不加**"去建一本"的跳转按钮。`/character/new` 的草稿不落盘，跳走就等于把用户刚敲的名字与设定扔掉——一个会毁掉输入的按钮比一句说明更坏。说明写清"为什么只有一项、之后在哪补绑"已经解决困惑，而这条路本来就有（角色编辑页可绑）。这条理由写进了用例注释，免得下次又被"补个跳转吧"改回去。

**顺带的一致性**：三步流的 4 个字段并入 `FormField`（与角色快速档同一套标签/说明/`aria-describedby` 关联），删掉随之失效的 `.quick-wb-label` 私有样式。`FormField` 的采用面从 1 个文件 3 处变成 2 个文件 6 处。

**验证证据（M5-b2，与代码同版本）**

| 门禁 | 结果 |
|---|---|
| `vue-tsc --noEmit` / `npm run build` / `lint`(0 error) / `i18n:check` + `:strict` / `check:css-conventions`(5/5) / `a11y:contrast`(扫描 **121**) / `check:csp` / `check:ort` | 退出码均 **0** |
| `npx vitest run` | **176 files / 3800 passed / 3 skipped**（较 M5-b1 的 3795 增 5：无角色三步走 3 例 + 快速档下拉说明 2 例） |
| E2E | msedge（`--workers=2`）**61 passed**、webkit（`--workers=1`）**16**、mobile 两 project **14**，0 failed |
| 浏览器实测（Edge 无头，dev :5179） | 快速档说明实际渲染为"还没有可绑的世界书，所以下面只有「暂不绑定」…"；世界书页空态实际渲染"还没有世界书。建一本，或按最小生效三步走。"；**选中一本书后三步走入口 `isVisible() === true`**（改前该分支不存在此入口）；点开流程正常渲染；截图用的临时书已通过真实 UI 删除，收尾时列表回到 **0 本**（沙箱数据未留痕） |
| 截图 | `docs/dev/evidence/ux-ia-guided-flow/m5-b2-in-feature/`：`char-quick-no-books-hint.png` / `worldbook-empty-no-books.png` / `worldbook-flow-entry-inline.png` / `worldbook-flow-open.png` |
| 未做（诚实边界） | ① 首启欢迎窗的 3 步仍是静态文案，与任务卡前三条两套数据（M5-b1 同条）；② 三步走的完成态仍只活在组件里（`createdBookId` 等是本会话 ref），刷新后从头开始——它没有接进 `guided-tasks` 的真实判据（那条判据现在读 `lorebooks`，是对的）；③ 角色编辑器的 23 个 label、设置模型面板的 15 个 label 等 **77 处**手写 label 仍未并入 `FormField`，属于 M4-b3 的分区工作范围。 |

### M5-b3 首启欢迎窗接进任务判据（三步不再是一套静态文字）

**问题**：欢迎窗的三步（`OnboardingModal.vue:20-24`）是写死的数组，与任务卡的 t1/t2/t3 说的是同一件事，却是**两套数据**——一套永远不动，一套读真实 store。后果不是"不好看"：恢复过备份、或只清掉 `localStorage` 的人会被这扇窗要求"现在配模型"，而那三步其实都做完了。

**改法（刻意保守）**：完成态**只认注册表一处**（`useGuidedTasks()` 的 `t1-model` / `t2-character` / `t3-first-reply` 的 `complete`），文案仍留在欢迎窗里——第一句要顺带说"密钥只留在本机"，那是首启特有的安抚，任务卡没有义务讲。判据同源，措辞各留一句。

| 状态 | 欢迎窗表现 |
|---|---|
| 有步骤未完成 | 三步按真实完成度标"已满足"（灰字 + 删除线，与任务卡的 StepFlow 清单同一套排版）；页脚仍是「打开任务清单」（主）+「现在配模型」+「关闭」 |
| 三步都完成 | 说明改为"这三步都已经做好了，直接开始就行："；页脚改为「去对话」（主）+「打开任务清单」+「关闭」——**不再递"现在配模型"**，那等于当着做完的人说他没做完 |

**顺带钉住的一条老契约**：关闭只写 `ai-roleplay:onboarding-done`，不写任何引导意图（`ai-roleplay:guided-tasks.v1` 保持不存在）——这是"关掉这个窗口不会结束引导"那句话第一次有断言兜着。

**被牵动的既有测试（1 个文件，非语义反转）**：`tests/views/app-tauri-ux.test.ts` 的 store 桩原先是空对象。欢迎窗挂在 App 上，现在它要读注册表 → `readiness` 的模型判据 → `chat.checkSendBlock()`，空桩直接抛 `TypeError`。补齐了这些桩真正被读到的字段（settings 的 Profile/锁态、chat 的 `checkSendBlock`、lorebook/data-bank/story/group-chat 的列表、character 的当前角色）。**没有放宽任何断言**，三条用例覆盖的仍是断网提示与拖拽导入。

**验证证据（M5-b3，与代码同版本）**

| 门禁 | 结果 |
|---|---|
| `vue-tsc --noEmit` / `npm run build` / `lint`(0 error，6 warning 均为既有) / `i18n:check` + `:strict` / `check:css-conventions`(5/5) / `a11y:contrast`(扫描 **121**，基线 131) / `snapshot:migration:check` / `runtime:db:schema:check` / `check:csp` / `check:ort` | 退出码均 **0** |
| `npx vitest run` | **177 files / 3804 passed / 3 skipped**（较 M5-b2 的 3800 增 4：新文件 `tests/components/onboarding-modal.test.ts`） |
| 新增测试 | 4 例：全新用户三步都不带"已满足"且页脚是原样；三步齐 → 每步标记 + 不给"现在配模型" + 给"去对话" + 说明换文案；**只做完成两步时仍按未完成处理**（负向对照，防"全部完成"判据空转）；关闭只记欢迎看过 |
| 故障注入 | 把 `doneOf()` 改成恒 `false` → 该文件**恰好 2 例转红**（依赖完成态的两条），另 2 例仍绿——证明断言咬的是这条接线本身，不是顺带变红 |
| E2E | msedge（`--workers=2`）**61 passed**、webkit（`--workers=1`）**16**、mobile 两 project **14**，0 failed |
| 浏览器实测（Edge 无头，dev :5179，沙箱真实数据） | 沙箱有 4 个角色与既有回复但没有模型 Profile → 欢迎窗第 2、3 步渲染为 `done` + "已满足"，第 1 步未勾，页脚仍是「现在配模型」。**这正是静态版表达不了的状态**（改前无论数据如何，三步都是三行一模一样的编号文字） |
| 截图 | `docs/dev/evidence/ux-ia-guided-flow/m5-b3-onboarding/welcome-live-steps.png` |
| 未做（诚实边界） | ① "三步全完成"那一支只有单测覆盖，浏览器实测没走到——沙箱缺一个可用的模型 Profile，而为一个截图往沙箱写入假密钥再删掉，留下的脏数据比这张图值钱；② 欢迎窗仍只在 `onboarding-done` 缺失时出现，且**没有重开入口**（`markOnboardingDone` 无对应 reset），这是既有行为，本批未改；③ 三步的完成度是"任务级 complete"，不是"步骤级 x/y"——窗内不显示"步骤 1/2"这类进度，避免与任务卡抢口径。 |

### M6-a 单聊 ⇄ 群聊 分段控件（§六 未落地清单里的最后一项导航）

**为什么不是"再加一个入口"**：rail 的 15 项与"不滚动就够得着"、底栏的 6 个 tab 都被既有契约钉住（`e2e/ux-nav-model.spec.ts:20,23,30-38`、`e2e/mobile/mobile-nav-groups.spec.ts:14`），而群聊**刻意**不占底栏 tab——它和单聊是同一任务的两条通道，做成 tab 会形成单向门（`core/mobile-nav.ts` 对 group 的注释）。真正缺的是"我能在这两条通道之间一步换过去"这件事本身。

**落点**：两处页头各挂同一个组件 `src/components/chat/ChatModeSwitch.vue`（`ChatMain.vue` 的 `.chat-header`、`GroupChatView.vue` 的 `.page-header .header-title`）。切换后两侧各自的选中态**天然保留**——单聊读 `character.ts:43 currentCharacterId`、群聊读 `group-chat.ts:45 currentGroupId`，都在 Pinia 里，跨路由不丢，所以这次没有新增任何状态管道。

| 决定 | 理由 |
|---|---|
| 用 `role="tablist"` + **手动激活**，不用现成的 `SegmentedControl`（radiogroup） | radiogroup 的惯例是"焦点走到哪就选到哪"，而这里的"选"是一次跨路由跳转——按一次方向键就把人送进另一个页面，焦点还会随旧组件卸载一起丢掉。`tests/components/chat-mode-switch.test.ts` 里"方向键只移焦点"那条断言就是为这个决定的 |
| 标签与图标取自 `nav-model`（`nav.chat` / `nav.group` + 各自 icon） | 不在组件里抄第二份入口清单，`tests/core/nav-model.test.ts` 的单一事实源约束不被绕过 |
| 不写 `aria-controls` | `/chat` 有角色时主内容区没有稳定 id（只有冷启动分支有 `#main-content`），指向不存在的 id 反而是 axe 违规（`aria-valid-attr-value`） |
| 移动端页头让位顺序：先隐藏计数与返回按钮的文字，**保留"新建群聊"的文字** | 390px 下加上这一段后原排版会把"对话"竖排成两行。返回按钮 `aria-label` 仍在（`e2e/group-chat-flow.spec.ts:38` 靠名字点它），而"新建群聊"是这页唯一入口，不能只剩一个加号 |

**顺带记录一个既有缺口（本批未改）**：移动端在 `/group` 时底栏**没有任何一项高亮**（`BottomNav.vue:32-33` 拿 `route.name === tab.name` 比对，而 tab 清单里没有 group），实测 `bottom-nav-item[aria-current="page"]` 为 0 项。页头这一段现在承担了"你在哪"的指示，但底栏本身要不要为群聊给一个非跳转态的标记，属于 N 层的下一个决定，没有顺手改（会撞 `mobile-layout.spec.ts:63` 的"高亮唯一"契约）。

**验证证据（M6-a，与代码同版本）**

| 门禁 | 结果 |
|---|---|
| `vue-tsc --noEmit` / `npm run build` / `lint`(0 error) / `i18n:check:strict`(204 文件) / `check:css-conventions`(5/5) / `a11y:contrast`(扫描 **121**) / `snapshot:migration:check` / `runtime:db:schema:check` / `check:csp` / `check:ort` | 退出码均 **0** |
| `npx vitest run` | **178 files / 3810 passed / 3 skipped**（较 M5-b3 的 3804 增 6：新文件 `tests/components/chat-mode-switch.test.ts`）；`components-axe` 与 `worldbook-group-axe` 挂载两个宿主视图 0 违规 |
| E2E | msedge（`--workers=2`）**61 passed**、webkit（`--workers=1`）**16**、mobile 两 project **14**，0 failed（含 `mobile-layout.spec.ts` 的"5 个 tab 页无横向溢出"与"高亮唯一"） |
| 故障注入 | ① 去掉"点当前项不导航"的守卫 → "不重复导航"那条转红；② 让方向键也跳转 → 第一次注入**没有**转红，因为断言在 `router.push` 完成前就读了路由（"没跳"与"还没跳完"分不清）；补上 `flushPromises()` 后重跑才转红。这条记下来是因为它是一次**假绿**，不是组件问题 |
| 浏览器实测（Edge 无头） | `/chat` 页头亮"对话"→ 点"群聊"落到 `/group` 且改亮"群聊"；桌面 tab 28px 高、移动 36px 高（改前移动端页头会把标签竖排，实测截图为证）；390px 下 `scrollWidth - clientWidth = 0` |
| 截图 | `docs/dev/evidence/ux-ia-guided-flow/m6-a-mode-switch/`：`chat-header-switch.png` / `group-header-switch.png` / `group-header-switch-mobile.png` |

### M6-b1 角色编辑器的"属性"段并入 `Collapse`（原语补上受控用法）

**先补原语的缺口**：`Collapse` 原先只有 `defaultOpen`（挂载时读一次），没有对外写展开态的入口。角色编辑器恰好有三处**从外部改展开态**：打开属性开关时强制展开（`:958`）、切换角色时强制收起（`:251`）、"加一条属性"时强制展开（`:446`）。所以先给 `Collapse` 加 `v-model:open`：传了 `open` 就是受控（点击只发 `update:open`，组件自己不翻面），不传就维持非受控的原行为——**既有三处设置页用法一行没改**。

**再并入**：删掉编辑器自写的那套（`aria-expanded` 按钮 + `v-show` 面板，缺 `aria-controls`、标题也不是 `<hN>`），换成 `<Collapse :level="3" plain v-model:open>`。段标题从动词式"收起属性详情/展开属性详情"两个键改成一个名词键 `charEdit.attrDetails`——展开态由 `aria-expanded` 与箭头方向表达，不该占用两个文案键。随之删掉 4 条只服务旧写法的私有样式（`.collapse-toggle` 三条 + `.attr-content`），面板间距由原语的 `.collapse-panel` 承担。

**一处实测发现，登记为缺口而不是假装修好**：三处外部写点里，"加一条属性时强制展开"**在真实交互里到不了**——那颗按钮本身就在面板内，收起时它不可见、点不到（实测 `addStatVisible: false`）。也就是说这行赋值是死代码，本批保留它（无害）但没把它算作"受控用法"的动机；真正的动机是另外两处：开关联动展开、以及切换角色时把上一段编辑的展开态归零（路由参数变化不会重挂载本视图，非受控就归不了零）。

**验证证据（M6-b1，与代码同版本）**

| 门禁 | 结果 |
|---|---|
| `vue-tsc --noEmit` / `npm run lint`(0 error) / `i18n:check:strict` / `check:css-conventions`(5/5) | 退出码均 **0**（本批不动构建产物，`build` 随 M6-b 收尾再跑） |
| `npx vitest run` | **178 files / 3813 passed**（`collapse.test.ts` 10 → 13 例：受控时"外部说收起就是收起，点一下只发事件不偷改"、"外部从收起改展开界面跟着变"、"不传 open 仍走非受控"）；`components-axe`（挂载编辑器新建态与编辑态）与 `tests/views` 全绿 |
| E2E | msedge（`--workers=2`）**61 passed**、mobile 两 project **14 passed**——`character-crud` / `ux-quick-forms` / `backup-restore` / `ux-relations-panel` / `chat-flow` / `group-chat-flow` 六条走"新建角色 → 完整表单 → 名称/设定/保存"的用例全部未改即通过（`#f-name`、`#f-desc`、`.header-btn.save`、`.editor-body` 四个硬选择器都保住了） |
| 浏览器实测（Edge 无头，`/character/seraphina/edit`） | 打开属性开关 → 面板自动展开（`aria-expanded=true`、`panelVisible=true`、3 个控件）；点段标题 → 收起（`aria-expanded=false`）；`aria-controls` 指向的 id 在文档里**真实存在**；标题渲染为 `H3`；收起后面板内控件仍在 DOM 且 `display: none`（v-show 保草稿）。截图 `docs/dev/evidence/ux-ia-guided-flow/m6-b-editor-collapse/attr-open.png` / `attr-collapsed.png` |
| 截图踩到的一个坑 | 首版截图里段标题是红的：那是全局"悬停把标题染成主色"的常态，指针停在刚点过的行上被一起拍了进来。截图前把指针移开才对——记录是因为它一度被误读成错误态 |

### M6-c E11 随机事件注入回显（最后一条未覆盖边）

**为什么必须在这一刻抓**：事件表**不落盘**（`stores/events.ts:10-11` 注明"事件仅在内存中维护"），刷新后当初注入的那条就不存在了；随机事件的历史 `results` 是"生成"历史、全局环形缓冲（上限 200 条）、**没有 chatId / messageId / eventId**，`sceneName` 还只是角色名。所以"这条回复当时带了哪条事件"事后无从回推，只能在组装提示词时随消息一起记下——与 `promptTrace` 完全同构。

**改动面（六处，一条数据流）**

| 层 | 位置 | 内容 |
|---|---|---|
| 判据源 | `chat-context.ts:186-199` | 注入文本算完之后，另存一份结构化 `activatedEvents = relevantEvents.filter(state==='active')`。顺序很关键：`scanAndApplyTriggers` 会**就地改事件状态**，先取就漏掉本轮刚被触发的那些 |
| 裁剪视图 | 新增 `core/event-trace.ts` | `EventTraceItem { eventId, name, sceneName? }` + `toEventTraceItems()`。**不含 `description`**（模型生成的整段正文，既撑持久化体积也可能把未公开设定原文摊在会话里）；`sceneName` 为 null 时字段整个不写 |
| 契约 | `types/index.ts` UIMessage、`core/character-card.ts` ChatMessage | 各加一个可选 `eventTrace?: EventTraceItem[]`。按 `schema-contract.ts:9-10` 的口径"新增可选字段可继续用当前版本"→ **零迁移**，`snapshot:migration:check` 与 `runtime:db:schema:check` 都不需要动（后者比对的是 PostgreSQL 的 SQL 文档与迁移文件，与消息字段无关） |
| 落盘 | `type-adapters.ts` 两个方向 | 各加一行。**漏一边就静默丢字段**——这是 E02 那次"写 `card` 不写 `liveMsg`"教训的同族 |
| 写回 | `chat-generation.ts` 三处 | 发送时写 `liveMsg.eventTrace`、重新生成前清空、重新生成后重算（重新生成走 `allowEventTrigger=false`，已激活事件仍会注入，所以痕迹必须重算而不是留着上一轮的） |
| 渲染 | 新增 `chat/EventTraceSummary.vue` + `MessageBubble.vue` | 气泡底部一句"本轮带入 N 条随机事件"，展开列事件名 + 一个跳 `/random-events`（带 `from`）的去处。排版与 `prompt-trace` 同款，两条回显并排时看起来是一类东西 |

**顺带修掉一个潜伏错**：`ChatMain.vue` 的消息 `v-memo` 依赖列表里**没有 `msg.promptTrace`**（E02 留下的）。目前无害，因为痕迹与 `content` 同拍写入；但任何"只改痕迹不改正文"的字段都不会重渲染。这次一并补上 `msg.promptTrace` 与 `msg.eventTrace`。

**验证证据（M6-c，与代码同版本）**

| 门禁 | 结果 |
|---|---|
| `vue-tsc --noEmit` / `npm run build` / `lint`(0 error) / `i18n:check:strict`(206 文件) / `check:css-conventions`(5/5) / `a11y:contrast`(扫描 **121**) / `snapshot:migration:check` / `runtime:db:schema:check` / `check:csp` / `check:ort` | 退出码均 **0** |
| `npx vitest run` | **181 files / 3827 passed / 3 skipped**（较 M6-b1 的 3813 增 14：`tests/core/event-trace.test.ts` 6 例、`tests/stores/chat-event-trace.test.ts` 4 例、`tests/components/event-trace-summary.test.ts` 4 例） |
| 负向对照 | store 层三条对照：无激活事件 → 回复照常生成但 `eventTrace` 为 `undefined`；**已完成（`state='completed'`）的事件不算注入**；事件属于别的书时不注入（与注入文本同一判据） |
| 故障注入 | 一次跑两处注入：A 让裁剪视图把 `description` 带上 → core 的"不带正文"与 store 的"只带名字不带正文"各自转红；B 让写回步骤不落到响应式消息 → store 的存在性断言转红。签名不同，可分别归因 |
| E2E | msedge（`--workers=2`）第二轮 **61 passed**；webkit（`--workers=1`）**16**；mobile 两 project **14**。第一轮 msedge 有 1 条失败：`ux-gap-visibility.spec.ts:202`（E19 已跟踪标记，`char-tracked` 计数 0）——单跑两次均通过，且该条在 M4-b2 的全量跑里也以同样方式红过一次，属 §九 M4-b2 记录的 O-4 同族干扰，未据此改任何断言 |
| 未做（诚实边界） | ① **没有浏览器级 E2E 走通真实生成链路**：事件是"上一轮生成、下一轮注入"，要在 e2e 里造出来得让打桩端点按请求分流（一次返回聊天回复、一次返回可解析的事件 JSON），再在 UI 里把场景名配成与角色名完全一致并把概率拉到 100。本批的覆盖停在 store + 组件两层，这条 e2e 登记为下一项；② 回显只报"注入了"，不报"模型采纳了"（后者无法从界面证明）；③ `severity` / `category` 不在 `StoryEvent` 上，只在生成结果记录里，所以回显条不显示严重度——要显示就得在 `generatedRandomEventToStoryEvent` 里把它们带进事件对象，属数据契约扩展，未做。 |

### M6-b2 角色编辑器的字段块接进 `FormField`（收益全在看不见的地方）

**接了哪 8 块**：名称、标签、描述、性格设定、初始场景、绑定 API Profile、职业、作者笔记。改造前这些块各写各的——标签是手写 `<label for>`、说明是手写 `<p class="field-hint">`、报错是手写 `<p class="field-error">`，**三件事之间没有任何 aria 关系**：读屏用户落到框里，只知道"这里有个框"，不知道下面那行小字是它的说明、更不知道错在哪个框。接进原语后每块由 `FormField` 生成 `hintId` / `errorId`，调用方把插槽给的 `describedBy` 绑到真正的控件上。

**实测到的接线事实**（Edge 无头，`/character/seraphina/edit`，与代码同版本）：

| 量 | 改造前 | 改造后 |
|---|---|---|
| 字段说明被某个控件的 `aria-describedby` 指到 | 0（旧写法的 `.field-hint` 源码 12 处，没有一条挂上关系，只靠视觉相邻表达归属） | **5 / 5**（默认态 DOM 里就这 5 条 `.form-field-hint`） |
| 悬空 `<label>`（既没 `for` 也没把控件包在里面） | 2 | **0**（打开属性段后实测 17 个 label 全部有效） |
| 必填标记 | 一个星号，读屏读成"名称 星号" | 星号 `aria-hidden="true"` + 一句 `sr-only` 的"必填"；DOM 原生 `required` 保留（保存判据与浏览器自带提示都依赖它） |
| 报错与控件的关系 | 只有 6 处手写 `err-*` 指向（名称/渐变/头像/温度/最大 Tokens/作者深度），说明与报错不能同时挂 | 未接原语的 4 处 `err-*` 一行没动（已核对无悬空引用）；接了的块由原语生成 `ff-*-error`，且 `aria-describedby` 能同时带说明 + 报错两个 id（实测 `#f-name` → `ff-*-error`） |

**两处悬空 label 换成了分组标签，不是硬凑 `for`**：`渐变预设` 与 `属性组` 下面各自是一排按钮而不是一控件，给它们配 `for` 是撒谎。改成 `<p id="f-*-label" class="field-label">` + 消费端 `role="group" aria-labelledby="f-*-label"`，读屏进到这排按钮时会先报组名。实测 `[role="group"][aria-labelledby]` 5 处。

**一处刻意的视觉改动，写清楚**：`FormField` 的标签是 13px / 600 / `--foreground`，而本视图手写的 `.field-label` 是 12px / 500 / `--muted-foreground`。只接 8 块的结果是同一页里两套标签粗细并排（截图里一眼能看出"绑定 API Profile"是白的、"温度"是灰的）。所以把本视图 scoped 的 `.field-label` 对齐到 13px/600/foreground、`.field-hint` 从 11px 对齐到 12px——**这是排版对齐，不是新增样式**：改完实测 8 个未接原语的标签（图片 URL / 首字母 / 温度 / 最大 Tokens / 等级 / 经验值 / 属性组 / 作者深度）计算值全部等于 `13px|600|rgb(245,245,247)`，与 `.form-field-label` 一致。对比度门禁扫描数未变（121）。

**剩下 8 块为什么没一起接**：温度与作者深度的标签里嵌着实时数值徽章（`温度 [1.00]`），`FormField` 只有 `labelKey`、没有标签后缀插槽；接进去就得先给原语加一个具名插槽。本批不动原语（M6-b1 刚为受控用法动过一次），登记为缺口。

**新增断言（`tests/views/character-editor-field-wiring.test.ts`，5 例）**：说明必须被指到、无悬空 label、必填的双表达、两处分组标签必须真的被 `aria-labelledby` 引用且不再是 `<label>`。axe 不查"说明有没有和控件关联"，所以这批收益**没有任何现成门禁会报警**——没有这份断言，下次有人手写回 `<label>` + `<p class="field-hint">` 是无声无息的。

**故障注入（证明断言会红）**：一次跑两处——A 删掉性格设定文本域的 `:aria-describedby` → 第 1 例转红（孤儿说明 1 条）；B 把属性组的 `aria-labelledby` 改成不存在的 id → 第 4 例转红。两处签名不同，可分别归因；撤销后 5 例复绿。

**踩到的一个夹具坑（记下来，因为它一度是假红）**：分组标签最初写成一条用例同时断言两处，结果转红——不是代码错，是夹具里 seraphina 的 `avatarType` 是 `image`，渐变那一整块 `v-if` 根本不渲染。按"对照必须在夹具里可达"的口径拆成两条：属性组用打开开关驱动、渐变用点"渐变色"那颗按钮驱动，并顺手把"切之前不存在"也断言下来（它同时是 `v-if` 的门禁）。

**验证证据（M6-b2，与代码同版本）**

| 门禁 | 结果 |
|---|---|
| `npm run build`（vue-tsc + vite） / `lint`(0 error，6 条既有 warning) / `i18n:check:strict`(206 文件) / `check:css-conventions`(**5/5**) / `a11y:contrast`(扫描 **121**，基线 131) + 自检 / `snapshot:migration:check` / `runtime:db:schema:check` / `check:csp` / `check:ort` | 退出码均 **0**；`eval:manifest` 通过后把只改 `commit`/`ranAt` 的产物重写撤销，未混进提交 |
| `npx vitest run` | **182 files / 3832 passed / 3 skipped**（较 M6-c 的 181 / 3827 增 1 文件 5 例，即上面的接线用例）；`components-axe`（挂载编辑器新建态与编辑态）在标签排版改动后仍 **0 违规** |
| E2E | msedge（`--workers=2`）**61 passed**，未改任何选择器：`#f-name` / `#f-desc` / `.form-section` / `.editor-body` 全部保住 |
| 截图 | `docs/dev/evidence/ux-ia-guided-flow/m6-b2-editor-formfield/`：`basic-fields.png`（整屏，标签统一后的基本信息段）、`name-error.png`（清空名称 → 红框 + "名称为必填项"）、`model-attr-labels.png`（模型设置 + 角色属性，含 `属性组` 分组标签）、`group-gradient-presets.png`（`渐变预设` 分组标签） |
| 两条"建议下调基线"没动 | `check:css-conventions` 提示 `!important` 存量已比基线少 2（建议 26 → 24）、对比度提示扫描 121 < 基线 131。本批 diff 里一行 `!important` 都没删（已核对），这两处成果不属于本批，基线留给真正做出收敛的那一批下调，避免把别人的余量算成自己的 |

**未做（诚实边界）**：① 8 个块仍是手写标签（图片 URL、首字母、温度、最大 Tokens、等级、经验值、属性组、作者深度），卡在 `FormField` 没有标签后缀插槽；② 本视图另有 5 条 `.field-hint`（旧类名，DOM 实测）没进 `aria-describedby` 体系——它们挂在未接原语的块上，接了才会自动带上；③ **顺带量到一个不属于本批的排版缺陷**：视口 ≤1024px 时编辑器切单列，`实时预览` 侧栏 `order:-1` 排到表单上方，但它的网格行轨只有 34px、自身盒子高 407px，于是表单压在预览卡上（1000px 实测 preview `[136,76,836,407]` vs fieldset `[136,134,836,725]`，390px 同型）。这是既有断点行为、与 M6-b2 无关，本批只在真实浏览器里复现并记下坐标，未修；④ 没有为本批加 e2e——这批改的是属性与排版，单测 + 浏览器实测已覆盖到断言层，e2e 只能重复同一件事。

### M6-d E11 的浏览器级 e2e（把"上一轮生成、下一轮注入"这条链路走通）

**补的是 M6-c 自己登记的那条未做**。新增 `e2e/ux-event-trace.spec.ts` 一条用例，打桩端点**按请求分流**：请求体里含 `buildRandomEventMessages` 的 system 文案"RPG 事件生成器"就回 `{choices:[{message:{content:"{name,description}"}}]}`（非流），否则回聊天的 SSE。链路全程走真实界面：设置页配 mock Profile → IndexedDB 造一本全局世界书 → 随机事件页用 `#gen-enabled` / `#gen-prob=100` 开生成器并保存 → 回 `/chat` 发第一轮 → 客户端跳到随机事件页看结果卡 → 跳回对话发第二轮 → 断言回显。

**三个前置事实决定了用例的形状**（都写进了文件头注释，因为它们是"为什么长这样"的唯一答案）：
1. **事件表不落盘**（`stores/events.ts` 注明仅内存），所以第一轮之后一律用 `.nav-rail` 按钮做客户端跳转，任何 `page.goto` 都会把刚生成的事件抹掉；也正因此，"刷新后回显仍在"只能来自消息自己带的 `eventTrace`——这条断言与"事件调用次数仍为 1"配对，证明回显不是现场重算出来的。
2. 生成的事件挂在 `lorebooks[0].id` 上（`chat-generation.ts:1410`），角色收集不到世界书时它永远注入不了，所以**必须先造一本全局书**，否则测试会以"没生成"的形式失败在离原因很远的地方。
3. `templates` 默认为空且全仓没有 e2e 会造模板，决策走"无候选 ⇒ `defaultProbability`"分支（`decideRandomEvent` 第 5 步），把概率拉到 100 才能免掉 `Math.random()` 的不确定性。

**新增一处等待，是因为 M2-b8 的老坑换了个位置**：`updateGeneratorConfig` 里是 `void persistNow()`，点完保存就整页跳转会读到默认配置。用例改为轮询 IndexedDB 快照 `random-events:store:v1`，直到 `enabled===true && defaultProbability===100` 才放行（`waitGeneratorConfigPersisted`）。

**负向对照放在同一轮里**：第一轮的气泡必须 `toHaveCount(0)`（事件当轮提示词组装完才生成，本轮不该有回显），第二轮才有；回显展开后断言列表里**不含事件正文**（`description` 只进提示词，不落回显），与 M6-c 的裁剪口径一致。

**故障注入三处，失败签名互不重叠**：

| 注入 | 期望 | 实测 |
|---|---|---|
| A 测试侧：把分流标记换成不存在的字符串（事件生成请求被回成 SSE） | 结果卡不出现 | 红在 `ux-event-trace.spec.ts:232`（`.result-card` 等不到） |
| B 源码侧：`liveMsg.eventTrace = undefined`（不写回） | 第二轮无回显 | 红在 `:242`（`expect(toggle).toBeVisible()`），而 `:232` 仍绿——生成与回显两条断言可分别归因 |
| C 源码侧：`EventTraceSummary` 的 `v-if="list.length"` 改成恒真 | 第一轮不该有的回显出现 | 红在 `:227`（`toHaveCount(0)`） |

三处撤销后同一条用例复绿（6.2s）。

**撞上一个真缺陷，登记为 §七 #21**：原打算用世界书"事件"面板手工造一条事件（比 mock 更接近用户路径），实测**一个字段都存不进去**——`updateEvent` 每次都拿合并后的整条事件跑 `validateEvent`，新建事件三个必填全空，任何单字段更新都被另外两个顶回；界面上输入框是 `:value` 单向绑定，字看着还在、模型里是空的，同时每敲一个字弹一次红 toast。改用随机事件生成器才把这条 e2e 走通。缺陷本身按"校验语义要拆完整性错误与取值错误"另起一批，未在本批顺手改（牵动 `core/event-types.ts` + `stores/events.ts` + 既有 12 例，且 `tests/stores/events.test.ts` 的夹具正是"一次 patch 三个字段"才绕开了这个坑）。

**验证证据（M6-d，与代码同版本）**

| 门禁 | 结果 |
|---|---|
| `npm run build`（vue-tsc 覆盖 e2e 目录） / `npm run lint` | 退出码 **0**（0 error，6 条既有 warning）；本批只新增 spec 与改 `playwright.config.ts` 的 `testMatch`，未动 `src/` 运行时，其余静态门禁随 M6-b2 同版本跑过 |
| 新用例单跑 | msedge `--workers=1` **1 passed（6.2s）**、webkit `--workers=1` **1 passed（8.6s）**，注入前后各跑一次，签名可分别归因 |
| E2E 全量 | msedge（`--workers=2`）**62 passed**（61 + 本条）；webkit **17 passed**（16 + 本条，已把该 spec 加进 webkit 的 `testMatch`，理由与 `ux-prompt-trace` 同族）；mobile 两 project **14 passed**（未纳入本条，桌面专属的 `.nav-rail` 在 393px 视口不存在） |
| 未做（诚实边界） | ① 这条 e2e 覆盖的是"生成器 → 注入 → 回显 → 跳回 → 持久化"，**没有覆盖世界书事件面板的手工事件路径**（该路径本身是 §七 #21 的死路，修好之后再补一条才对得上）；② 概率判定仍走 `Math.random()`，用例靠把 `defaultProbability` 拉到 100 消除不确定性，若将来默认模板非空，"无候选"前提会失效（已在文件头注释里写明依赖）；③ 分流标记用的是 system 文案里的中文句子，`buildRandomEventMessages` 改词会让用例红在"没生成"上——红是有的，只是归因要多看一眼，故在注释里点明它是核心模块里唯一的一句。

### M6-e 群聊页头分区（成员 Runtime 检视段并入 `Collapse`）

**收的是页头里唯一一块排障面**。`GroupChatView` 的 `<header>` 原本从上到下堆了七件事：群名与操作按钮、成员级 Runtime 检视（下拉 + `RuntimeStatePanel`）、CAS 冲突横幅、成员芯片、待提交回合重试、发言模式切换、成员状态条。实测（1440×900，两个成员的群，`page.screenshot` 同一夹具量得）：**页头共 234px，其中 Runtime 检视占 94px（四成）**，而它既不改变群聊怎么说话、也不参与任何一轮生成——纯粹是"我怀疑 Runtime 出问题了才去看一眼"的面板，却和每天要用的成员条、发言模式平起平坐，还把消息可视区压到 452px。

**做法**：整段包进 `<Collapse :level="3" :advanced="true" :default-open="false" plain>`，沿用 M4-b2 给设置页定的两条规矩——收起用 `v-show`（用户选了一半的检视成员不能因为收起就丢），说明文字放在面板**外面**（`group.runtimeInspectHint`："逐个成员查看 Runtime 状态与回放自检。默认收起——它不改变群聊怎么说话。"），段上带"高级"标记。`icon="cpu"`。

**前后对比（同一夹具、同一视口，实测值）**：

| 量 | 收起态（改后） | 改前（常驻展开） | 展开态（改后） |
|---|---|---|---|
| `.group-header` 高 | **172px** | 234px | 301px |
| `.messages-area` 高 | **513px** | 452px | — |
| Runtime 检视块 | 盒子 0（`display:none`），**下拉仍在 DOM** | 94px | 可见，`#group-runtime-member` 高 32px |
| 段标题 `aria-expanded` | `false` | 无折叠 | `true` |

消息可视区 **+61px（+13.5%）**，页头 **-62px**。展开态比改前更高（301 vs 234）是折叠段自身标题 + 说明行的代价——它只在主动排障时出现，符合"低频换常驻整洁"的取向。

**两条硬约束是显式守住的**：① `tests/services/status-hud-p1.qa-independent.test.ts` 读的是 `GroupChatView.vue` 的**源文本**（要求恰好一个 `<StatusHud`、含 `ms.status`、文件里要有 `v-for="ms in memberStatuses"` 与 `resolveLatestStatus`、且 5-5 那条要求 `onStatus: (status) =>` 与 `groupStore.updateAssistantMessage(...)` 同在本文件），所以成员状态条与生成回路的 plumbing **一行都没往外提**；② `messages-area` 不提取（`long-history-scroll` 与群聊 e2e 依赖该选择器）。本批只动 Runtime 检视一块，正是绕开这两条的最小切法。

**为什么这里没铺 `FormField`（不是漏了，是不该铺）**：群聊的两个弹窗（创建群聊、添加成员）字段本来就用的是配对好的 `<label for>`；文件里剩下的两条 `.form-hint`（`group.addMemberHint`、`group.npcHint`）都是**弹窗级**说明——一个描述整个成员选择器、一个描述整个模板网格，把它们 `aria-describedby` 到某个控件上是撒谎。真正对的做法是给 `Modal` 加 `describedBy` 让对话框自己带上这句说明，那是原语扩展、牵动所有对话框，登记为后续项。

**新增断言（`tests/views/group-runtime-inspect-collapse.test.ts`，4 例）**：默认 `aria-expanded=false` 且下拉仍在 DOM、点标题展开后 `display` 不再为 `none`、说明文字与"高级"标记在面板外（`panel.element.contains(hint.element) === false`）、段标题是 `h3`。故障注入：把 `:default-open` 改成 `true` → 前三例分别转红（`expected 'true' to be 'false'` / `expected 'false' to be 'true'` / `expected '' to be 'none'`），`h3` 那例仍绿——正交，符合预期。撤销后 4 例复绿。

**验证证据（M6-e，与代码同版本）**

| 门禁 | 结果 |
|---|---|
| `npm run build` / `lint`(0 error) / `i18n:check` + `i18n:check:strict`(206 文件) / `tests/i18n.test.ts`(12 例，新增 2 键双语齐) / `check:css-conventions`(5/5) / `a11y:contrast`(扫描 **121**，基线 131) | 退出码均 **0** |
| `npx vitest run` | **183 files / 3836 passed / 3 skipped**（较 M6-d 的 182 / 3832 增 1 文件 4 例）；`tests/accessibility/worldbook-group-axe.test.ts`（群聊空态与有数据态）与 `status-hud-p1.qa-independent`（读源文本那条）**未改即通过** |
| E2E | msedge（`--workers=2`）**62 passed**、webkit（`--workers=1`）**17 passed**、mobile 两 project **14 passed**——`group-chat-flow`（三 project 都跑，含"两个角色群聊 + 独立 Runtime Context"）未改任何选择器即通过 |
| 截图 | `docs/dev/evidence/ux-ia-guided-flow/m6-e-group-header/`：`before-group-header.png`（改前页头）、`after-group-header.png`（收起态）、`after-group-header-open.png`（展开态）。M6-b1 那个坑又踩到一次：首版展开态截图里段标题是红的，仍是全局悬停染色，截图前把指针移到 `(700,620)` 才拍干净 |
| 未做（诚实边界） | ① 页头其余六块（成员芯片、发言模式、两条条件横幅、成员状态条）**保持常驻**——它们要么每轮都用、要么是 `role=alert/status` 的异常提示，折叠任何一条都会把"该被看见的东西"藏起来；② 弹窗级说明接不进无障碍树需要 `Modal` 支持 `describedBy`，属原语扩展，本批未做；③ 折叠态**不记忆**：切群或刷新后回到默认收起（`Collapse` 非受控 + `defaultOpen=false`）。没上记忆是因为它需要一个新的持久化位点，而"排障面板每次都要重新点开"目前不构成投诉；若有人反馈"每次都要展开很烦"，改成受控 + 落 `settings` 即可。

### M6-f 世界书事件面板死路结案 + 两个原语缺口补完（①②③ 里的 ① 与 ③）

**死路的机制与修法**。`stores/events.ts:updateEvent` 拿**合并后的整条事件**跑 `validateEvent`，而新建事件的 `name`/`description`/`keywords` 三样全空，于是任何单字段更新都被另外两样的"不能为空"顶回。修法不是放宽校验，而是**把两类错误分开、各拦在各该拦的位置**：

| 函数 | 管什么 | 谁用 | 拦住的后果 |
|---|---|---|---|
| `validateEventValues` | 取值错误：名称超 50、描述超 2000、概率越界、正则非法 | `updateEvent` | 拒绝写入（写进去就是一个永远不成立的配置） |
| `validateEventCompleteness` | 完整性错误：名称/描述为空、关键词型触发没关键词、依赖型没前置 | `triggerEvent` | 拒绝激活（连带挡住 `chat-context` 的自动触发，因为它也走 `triggerEvent`） |
| `validateEvent` | 两者并集 | 保留给既有调用方，语义不变 | —— |

**顺带修掉一处同源的噪声**：面板监听 `lastInfo` 弹成功提示。死路一修，逐字段输入就会**每敲一个字弹一条"已更新"**（事件名还没填时还会显示成"已更新 "）。所以 `updateEvent` 加第三个参数 `{ silent }`，面板 12 处字段写入统一走静默；离散动作（新建/触发/完成/删除）照旧有反馈。这条不是顺手优化——不做的话修完死路换来的是满屏 toast。

**改写了 4 条既有用例，理由是它们钉的正是这个坑**（不是放宽）：`updateEvent('name' → '')` 从前断言"返回 false 且原值不变"，现改为断言"能存进去、但这条事件随即不能激活"；三条 `triggerEvent`/`completeEvent` 用例原本用裸 `createEvent`（三样全空）当夹具、断言能激活，现改用 `createValidEvent`，让被测的**状态前提**不再被完整性问题串扰。并集校验的边界（50 字、2000 字、概率 0/100）在 `tests/core/event-types.test.ts` 新增的 12 例里逐条钉住，含"拆分没把边界挪位"与"`validateEvent` 仍是两者并集（防漂移）"。

**两个原语缺口**：
- `FormField` 加 `label-extra` 插槽（渲染在 `<label>` 内部、必填星号之前）。有了它，"温度 [1.00]"、"作者深度 [4]"这类**标签里嵌实时数值**的字段才接得进原语——角色编辑器因此再转 7 块：温度、最大 Tokens、作者深度、图片 URL、首字母、等级、经验值。实测（Edge 无头，同版本）：`.form-field-hint` 被指到 **5/5 → 8/8**、`.field .field-label`（未接原语的字段标签）**8 → 0**、`.field-hint` 残留 **5 → 2**（那两条是"属性组为空"与"属性未启用"的**块级**说明，不属于任何单个控件，挂到控件上是撒谎）、悬空 label 仍 0、`#f-temp` 与 `#f-maxtok` 都拿到了 `aria-describedby`。
- `Modal` 加 `describedBy` → 对话框的 `aria-describedby`。群聊两个弹窗开头那句"选择要加入群聊的角色（可多选）"、"生成一名临时 NPC…"说的是**整个对话框**，此前在无障碍树里是孤儿。实测弹窗 `[role=dialog]` 的 `aria-describedby="add-member-hint"`、目标节点确实在对话框内、标题的 `aria-labelledby` 未受影响。
- 渐变那一对"起始色/结束色"**没接**：两个控件共用一条报错，`FormField` 是"一控件一实例"，各接一份会把同一句话在两个框下面重复一遍。

**新增浏览器级用例 `e2e/ux-event-manual-trace.spec.ts`**（走用户手配这条路，与 M6-d 的"生成器 → 下一轮注入"是两条不同路径）：世界书事件面板逐字段配一条全局关键词事件 → 回对话（客户端跳转）→ 先发不含关键词的消息（负向对照：本轮无回显）→ 再发含关键词的：**同一轮触发并同一轮注入**（`scanAndApplyTriggers` 先应用触发再拼注入文本）→ 断言回显、事件名、跳 `/random-events?from=/chat`。已加入 webkit 的 `testMatch`。

**故障注入四处，签名互不重叠**：① `updateEvent` 改回并集校验 → store 与面板共 5 条转红（含"逐字段输入一路存得进去"）；② 忽略 `{ silent }` → 只有"编辑不弹已更新"一条红，报的是 `expected '事件「断桥拦」已更新' to be '已创建新事件'`；③ `Modal` 的 `:aria-describedby` 置空 → 只有 describedBy 那条红；④ `label-extra` 插槽移出 `<label>` → 只有插槽位置那条红。

**一处工具性踩坑，值得单独记**：③ 的第一次注入用 `sed` 在模板**属性列表里**写了 `aria-describedby="bogus-id" // 故障注入`，Vue 模板编译器报 `Illegal '/' in tags.`——但**上一次运行的转换缓存让 vitest 仍然报"9 passed"**，等于一次假绿。改成合法表达式（`:aria-describedby="undefined"`）重跑才转红。教训：模板文件里的注入必须写成合法语法，且"刚改完就绿"要怀疑缓存，至少 `grep` 一遍实际文件内容再下结论（与既有的"mtime 会撒谎"同族）。

**验证证据（M6-f，与代码同版本）**

| 门禁 | 结果 |
|---|---|
| `npm run build` / `lint`(0 error) / `i18n:check:strict`(206 文件) / `check:css-conventions`(5/5) / `a11y:contrast`(扫描 **121**，基线 131) | 退出码均 **0** |
| `npx vitest run` | **185 files / 3856 passed / 3 skipped**（较 M6-e 的 183 / 3836 增 2 文件 20 例：`worldbook-events-panel-edit` 4、`modal-describes` 2、`event-types` 新增 12、编辑器接线 +1、store 改写 +1） |
| E2E | msedge（`--workers=2`）**63 passed**（62 + 新那条）、webkit（`--workers=1`）**18 passed**、mobile 两 project **14 passed** |
| 截图 | `docs/dev/evidence/ux-ia-guided-flow/m6-f-primitives/`：`editor-model-fields.png`（模型设置段，温度徽章在粗标签里、最大 Tokens 与等级/经验值同刻度）、`group-add-member-dialog.png`（添加成员弹窗，说明句已挂 `aria-describedby`；顺带拍到 M6-e 的"成员 Runtime 检视 [高级]"收起态） |
| 未做（诚实边界） | ① **`:value` 单向绑定在取值错误路径上的表现，本批写错了，M7-b 在真实浏览器里量过才纠正**：原记"粘贴超 2000 字的描述会被拒但输入框不回退（字还在）"。事实是名称与描述都有 `maxlength`、概率是带 `min/max` 的 `range`，那三条**根本走不到被拒**；唯一能拒的是"使用正则 + 非法表达式"，而那时的真实现象是**用户刚打的字符被直接吞掉**（打 `(` 之后输入框是空的），不是"字还在"。按纠正后的现象修，见 M7-b；② 世界书事件面板**没有**接 `FormField`（它的字段是 `form-label` + `:value` 手写体系，本批只修语义不动排版，避免一次改两件事）；③ 事件模板（`/random-events` 的 templates 页签）仍无浏览器级用例，本批的 e2e 走的是"无模板 ⇒ defaultProbability"分支。

### M7-a 最后两个巨型视图分区（世界书页的一次性配置段 + 故事卡展开态布局）

**世界书页：把"配一次就长期不动"的两段收起来，但没填的那段必须自动展开。** 1440×900 实测（同一份数据、同视口，IndexedDB 造两本书：一本配齐、一本全空）：

| 段 | 改前常驻展开 | 改后（已配） | 改后（未配） |
|---|---|---|---|
| 整体世界描述 | 422px | **74px**（收起） | 149px（自动展开） |
| 世界内用户资料 | 921px | **74px**（收起） | 149px（自动展开） |
| `.editor-content` 滚动高 | 2635px | **1440px** | — |
| 条目区顶部 `entries-layout` | y≈1998（三屏之下） | **y=803**（首屏可见） | y=953 |

两段合计 **1343px → 148px**，每天要用的条目区从三屏之下回到首屏。规则是 `:default-open="!worldDescDraft"` / `!worldUserProfileDraft"`——**没填的那一段自动展开**，因为把待办藏起来是反向优化；用户仍可点段标题收回去（有用例钉住这条"不是只读的一次性决定"）。`:key="`wd-${currentLorebook.id}`"` 让切书时重挂载，否则 `defaultOpen` 只在挂载时读一次、第二本书会沿用第一本的展开态。

**为此给 `Collapse` 补了 `title-extra` 插槽**：这两段各带一个范围标签（"常量注入" / "仅当前世界"），它们决定用户要不要点开，必须留在**触发按钮里**而不是被面板一起藏掉。原语只有 `advanced` 一个内置标签位，没有可扩展位置——与 M6-f 给 `FormField` 补 `label-extra` 是同一个缺口的两半。随之删掉两处失效的 `.world-desc-header` 规则与两个只服务旧 `aria-label` 的死键（`wb.worldDescAria` / `wb.worldUserProfileAria`；折叠段的 `aria-labelledby` 由原语自己给）。

**故事引擎：真正的问题不是"段太多"，是展开的卡只有 400px 宽。** `.story-grid` 是 `repeat(auto-fill, minmax(360px, 1fr))`，只有一份故事时它就是一条 400px 的窄列，七段详情竖着堆到 **1276px** 高、右边一千像素全空——页面看起来是坏的，读一条故事要滚三屏。改法两行 CSS：展开的那张卡 `grid-column: 1 / -1` 占满整行；`@media (min-width: 1025px)`（规范断点集内的"桌面"值）下 `.card-detail` 两列排布，段与段是并列关系不是先后关系。实测 `.story-grid` **1276px → 794px（-38%）**。移动端不受影响（两列规则在 1025 以上）。

**没做的判断也写清楚**：故事卡内部的七段**没有再折叠**——用户点开卡就是为了读这些提取结果，折叠结果等于把内容藏起来；卡片本身已经是折叠单元。另外观察到"已完成"状态色把整张卡的文字也染成绿色（标题、人名、场景名全绿），属既有状态类作用范围过宽，本批未动，登记在下面。

**验证证据（M7-a，与代码同版本）**

| 门禁 | 结果 |
|---|---|
| `npm run build` / `lint`(0 error) / `check:css-conventions`(**5/5**，含断点守卫：新用的 `1025` 在规范集 `{380,480,640,641,900,1024,1025}` 内) / `a11y:contrast`(扫描 **121**) | 退出码均 **0** |
| `npx vitest run` | **186 files / 3861 passed / 3 skipped**（较 M6-f 增 1 文件 5 例：`two-views-partition` 4 + `collapse` 的 title-extra 1） |
| E2E | msedge **63 passed**、webkit **18 passed**、mobile 两 project **14 passed**——`worldbook-flow`（三 project 都跑，走"新建→重命名→加条目→树显示"）未改选择器即通过 |
| 新增断言 | `tests/views/two-views-partition.test.ts` 4 例：已配 → 两段 `aria-expanded=false` 且范围标签在按钮里；未配 → 两段自动展开且"添加"入口直接可见；点段标题能收回；点卡头 → `.story-card` 带 `is-expanded`（两列 CSS 挂在这个类上）。`tests/components/collapse.test.ts` 加 title-extra 一例（钉"标签在 button 内、不在面板内"） |
| 故障注入 | 两轮，签名不重叠：`:default-open` 恒 `true` → 只红"已配 → 收起"那条；恒 `false` → 红"未配 → 自动展开"与"点标题可收回"两条而"已配 → 收起"仍绿；删 `is-expanded` 绑定 → 只红故事卡那条。撤销后 4 例复绿 |
| 截图 | `docs/dev/evidence/ux-ia-guided-flow/m7-a-two-views/`：`before-worldbook.png` / `worldbook-collapsed.png` / `worldbook-auto-open.png` / `before-story.png` / `story-two-column.png` |
| 未做（诚实边界） | ① 故事卡的**状态色作用范围过宽**（`.story-card.status-completed` 把标题与人名一起染绿），要改得单独定配色口径，本批只在截图里留下证据；② 世界书页剩下的两块（`已绑定角色` 141px、`事件` 263px）**保持常驻**——前者是关联入口、后者是 M6-f 刚修好的功能，收起来等于把刚能用的东西藏了；③ 两列排布只在 ≥1025px 生效，平板档（641–1024）仍是单列长条，未做中间档。

### M7-b 事件面板"写入被拒"的可见反馈（顺带纠正 M6-f 自己写错的一句现象描述）

**先纠错**：M6-f 的未做 ① 写的是"`:value` 单向绑定在取值错误路径上会'字看着还在、store 是旧值'"。这句是**读代码推出来的，没量**。M7-b 写用例时先在真实浏览器里跑了一遍，结果是相反的：打一个非法正则的 `(`，**输入框直接变空**——字符被吞了（Vue 的 `patchDOMProp` 对 `value` 会拿 DOM 现值比较并写回，所以一次因其他属性触发的重渲染就把用户输入抹掉）。两处记录（设计文档与 CHANGELOG）都已就地改正并注明是被谁、怎么量翻的。

**再核对哪些字段真能走到"被拒"**：名称 `maxlength=50`、描述 `maxlength=2000`、概率是带 `min/max` 的 `range` —— 三条都到不了 `validateEventValues` 的拒绝分支。**唯一可达的是"使用正则 + 非法表达式"**。所以没有给所有字段铺草稿，只给关键词那一格做，其余继续直接绑 store。

**改法（三层，缺一层就还是骗人）**：
1. **草稿**：关键词输入框显示 `keywordText()`（草稿优先，否则回落到 store 已存值），写入成功才清草稿。用户打的字留在框里。
2. **标注**：被拒的字段挂 `.reject-note`（`role="status"`，"这个值没有保存：无效的正则表达式：("）+ `aria-invalid` + `.is-rejected` 红框。toast 只闪一次，这条是一直挂着的；改对之后自己消失。
3. **勾"使用正则/大小写敏感"时按框里现在那串写回**，而不是按 store 里的旧数组——否则一次勾选会把草稿抹掉，等于换个地方吞字。

**一个特异性坑**：`.is-rejected { border-color: var(--destructive) }` 单写一条**看不见红**，因为 `src/styles/base.css:129` 的 `input[type="text"]:focus` 特异性更高，而用户正在输入时字段恰恰是聚焦的。实测：加 `:focus`/`:focus-visible` 两条之前，聚焦态 `borderTopColor = rgb(37,244,238)`（主色青），之后 = `rgb(234,79,83)`（destructive 红），失焦态两次都是红。规则旁注了原因。

**验证证据（M7-b，与代码同版本）**

| 门禁 | 结果 |
|---|---|
| `npm run build` / `lint`(0 error) / `i18n:check:strict`(206 文件，新增 1 键双语) / `check:css-conventions`(5/5) / `a11y:contrast`(扫描 **121**，未新增扫描对) | 退出码均 **0** |
| `npx vitest run` | **186 files / 3864 passed / 3 skipped**（较 M7-a 的 3861 增 3 例） |
| E2E | msedge **63 passed**、webkit **18 passed**、mobile 两 project **14 passed** |
| 浏览器实测（Edge 无头，逐字段真键盘输入） | 打 `(` → `domValue="("`、`aria-invalid=true`、`is-rejected` 在、说明行文案与 i18n 键一致；`fill('桥\|河滩')` 改对 → 说明行消失、红类去掉；聚焦态与非聚焦态边框色都量过（见上） |
| 故障注入 | 三处、签名不重叠：输入框改回直绑 store → 红"字留在框里"；写入成功不清标注 → 红"改对后消失"与"勾掉正则按草稿写回"；两处合跑 3 红 4 绿，撤销后 7 例复绿 |
| 截图 | `docs/dev/evidence/ux-ia-guided-flow/m7-b-reject-feedback/rejected-keyword.png` |
| 未做（诚实边界） | ① 草稿只做了关键词一格，是按"哪条真能走到被拒"选的，不是通用机制——若以后给描述去掉 `maxlength` 或加新的取值校验，得把同一套搬到那些字段上（`patchEvent` 已经支持传 `fieldKey`/`onCommitted`，成本是一个 ref 加一处 `:value`）；② 名称/描述/概率三格的 `:value` 直绑仍在，只是当前不可达被拒路径；③ 没做"存不进去时禁止离开该字段"这类强拦截——那会把一个可选的正则调试变成填表考试。

### M7-c 状态色口径：状态只染徽标与边框

**病灶**：`StoryEngineView` 里 `.status-completed { background; color }` 这四条**不带元素限定**，而 `getStatusClass()` 同时挂在**卡片根元素**和徽标上（`:961` 与 `:968`）。于是 `color` 从卡片一路继承下去——一份"已完成"的故事整张卡变绿：标题、人名、场景名全染上状态色。M7-a 的截图里能看到，本批把它当一条独立问题处理。

**修法**：四条规则限定到 `.status-badge.status-*`；卡片本体只保留 `.story-card.status-failed { border-color }` 这一条边框语义。口径写在规则上方的注释里：**状态是这张卡的元信息，不是它的主题色**。

**同病扫描结果**（全仓 grep 这四个类名）：只有 `StoryEngineView` 用它们，且只有它把同一个类同时挂在容器与徽标上。`CharactersView` 的 `.char-card.is-busy` 用的是 `opacity` 降透明、不是染色，不同机制，不算同病。所以这一条口径目前只有一处需要落，落完即无同类。

**实测（Edge 无头，四张卡分别 completed / analyzing / failed / pending，同页互比）**：

| 量 | 改前 | 改后 |
|---|---|---|
| 卡片 `color` | 各等于自己的状态色（`rgb(52,211,153)` / `rgb(96,165,250)` / `rgb(229,72,77)` / 橙） | 四张一致 `rgb(245,245,247)` |
| 标题 `color` | 同上（跟着染） | 四张一致 |
| 徽标 `color` / 底色 | 状态色 + 淡底 | 不变（仍状态色 + 淡底） |
| 卡片边框 | 只有 failed 是红 | 不变 |

**回归网选的是浏览器级而不是读源文本**：新增 `e2e/ux-status-color.spec.ts`，断言全部用"四张卡互相比"——四张的标题色必须一致、徽标色必须四样、失败态边框独异——**不写死任何色号也不读 CSS 变量**，换主题、换调色板、把 hex 改成 oklch 都不会让它假失败。已加入 webkit 的 `testMatch`（scoped CSS 的特异性差异最容易在第二个内核显形，webkit 单跑 1 passed）。

**踩到的一处时序**：这条用例第一次跑就红在 `dbs.sort(...)[0].name` 取空——应用是**异步开库**的，紧跟首次 `goto` 之后查 `indexedDB.databases()` 可能还是空。改成先 `expect.poll` 等到库出现再写数据，连跑三次稳定绿。此前几条造数用例没撞上，是因为它们都在若干次 UI 交互之后才写库。

**故障注入**：把四条选择器改回不带 `.status-badge` 前缀 → 用例红在 `expect(titles.size, '标题色不该随状态变').toBe(1)`（正是病灶本身）；撤销后复绿。中途还有一次"注入注错"的假信号：`sed` 的替换把 `.status-badge.status-x` 写成了 `status-x`（丢了点号，规则匹配不到任何元素），红的是"徽标没色"那条——不是被验的那件事，已剔除不算数。

**验证证据（M7-c，与代码同版本）**

| 门禁 | 结果 |
|---|---|
| `npm run build` / `lint`(0 error) / `check:css-conventions`(5/5) / `a11y:contrast`(扫描 **121**，未变) | 退出码均 **0** |
| `npx vitest run` | **186 files / 3864 passed / 3 skipped**（与 M7-b 同数——本批的回归网是 e2e，不加单测） |
| E2E | msedge（`--workers=2`）**64 passed**（63 + 本条）、webkit **19 passed**（18 + 本条）、mobile 两 project **14 passed** |
| 截图 | `docs/dev/evidence/ux-ia-guided-flow/m7-c-status-color/`：`before-story-colors.png`（整卡染状态色）、`after-story-colors.png`（标题与正文回到中性，徽标保留状态色，失败卡红边框） |
| 未做（诚实边界） | ① 卡片左上那个书本图标仍是主色，不随状态变——要不要让它也参与状态表达是配色设计决定，本批只处理"文字被染色"这一条；② `.detail-section` / `.protagonist-section` / `.time-section` 的边框用了 `color-mix` 的分段识别色，属"分区身份"不是"状态"，未动；③ 没给 `pending` 状态加边框语义（只有 failed 有），因为四色边框会让"失败"不再突出。

### M7-d 折叠态跨会话记忆（把"我特意展开的"和"程序推导的默认"分清楚）

**要补的是 M7-a 留下的那条尾巴**：排障段默认收起是对的，但"我这次是特意点开的"跨刷新就丢，于是每次都要重新点。本批给开合一个持久化位，并把两种意图分开：

| 情形 | 谁说了算 |
|---|---|
| 用户点过这一段 | 他的选择，跨刷新、跨页面都跟着 |
| 从没点过 | 调用方给的推导默认（M7-a 的"还没填就自动展开"、高级段的"默认收起"） |

**落点**：`AppSettings.uiSectionOpen?: Record<string, boolean>`（可选字段，按 `schema-contract` 零迁移，两个 schema 门禁都不用动）+ `settings.setUiSectionOpen(key, open)`（同值早退不重复写、写走 M2-b8 那条串行队列）+ `composables/useSectionMemory.ts` 一个读时合并的 `WritableComputed`。
**刻意不在挂载时把默认值写进存储**——一写进去，"没填自动展开"就退化成"只在新装时生效一次"。

**原语一行没改**：`Collapse` 在 M6-b1 就有 `v-model:open` 受控用法，本批只是把 7 个点接上去（世界书 2、群聊页头 1、设置页高级段 3、外加 M7-a 那两段的 `:key` 因此可以撤掉——开合不再依赖重挂载）。

**浏览器实测（Edge 无头，真刷新）**：都配过的书两段初始 `false` → 点开"整体世界描述"变 `true` → **整页刷新后仍是 `true`** → 再收起并刷新仍是 `false`；设置页「外观」的"界面自定义"展开后刷新 `aria-expanded` 仍为 `true`。

**踩到两处，都记下来**：① `loadFromStorage` 把"完全没有已知字段"的快照当首次启动整段跳过（判据是 `theme/fontSize/apiProfiles/activeApiProfileId/creationPreset` 至少有一个），所以只带 `uiSectionOpen` 的夹具读不回来——真机快照永远带 `theme`，不影响线上，但夹具必须照实写；② 类型：`computed({get,set})` 的返回要标 `WritableComputedRef`，标成 `ComputedRef` 会让调用方 `open.value = x` 报 TS2540。

**验证证据（M7-d，与代码同版本）**

| 门禁 | 结果 |
|---|---|
| `npm run build` / `lint`(0 error) / `i18n:check:strict`(207 文件) / `check:css-conventions`(5/5) / `a11y:contrast`(扫描 **121**) / `snapshot:migration:check` / `runtime:db:schema:check` | 退出码均 **0**（两个 schema 门禁确认零迁移） |
| `npx vitest run` | **187 files / 3870 passed / 3 skipped**（新增 `tests/composables/use-section-memory.test.ts` 5 例 + 视图侧 1 例） |
| E2E | msedge **64 passed**、webkit **19 passed**、mobile 两 project **14 passed** |
| 新增断言 | 推导默认随数据重算（不是挂载快照）、记忆优先于相反方向的默认、写一次落盘一次且同值不重复写、加载丢非 boolean 脏值、两段互不覆盖、视图侧"点过之后跨重挂载仍保持" |
| 故障注入 | 把 getter 改成只回落到推导默认 → 4 例转红（含视图侧两条：其中"点段标题可收起"也红，说明**没有记忆就没有手动控制权**，这条比预想更值）；撤销后全绿 |
| 截图 | `docs/dev/evidence/ux-ia-guided-flow/m7-d-section-memory/worldbook-remembered-open.png`（刷新后仍保持展开） |
| 未做（诚实边界） | ① 记忆是**全局一份**，不分世界书——切到另一本书也会带着上一次的开合。选它是因为开合是"我要不要看这块"的用户偏好，不是书的内容属性；若以后有人反馈"这本书想开着、那本想关着"，把 key 拼上 `lorebookId` 即可（存储结构不用改）；② 没有"恢复默认"入口——清掉记忆等于删键，当前没有任何界面做这件事；③ 角色编辑器的"属性详情"段**没接**记忆：它的开合绑的是 `form.attributesOpen`，随表单一起存、且切换角色时要归零，属另一条语义。

### M8-a 窄屏角色编辑器"实时预览"被表单压住（M6-b2 量到、当时只登记没动的那条）

**根因这次是量出来的，不是推的。** 用同一页只改一条 CSS 的隔离实验（每个候选开一个新 context，避免样式叠加）在 1000px / 390px 各测一遍：

| 断点内的改法 | 网格行轨 | 预览盒 | 表单顶 | 重叠 |
|---|---|---|---|---|
| 原样 | `34px 2231px` | 407px | y=134 | **是** |
| 只加 `height: auto` | `34px` | 407px | y=134 | **是**（无效） |
| 只加 `overflow: visible` | **`407.219px`** | 407px | y=507 | 否 |

机制：`.editor-preview` 带 `overflow-y: auto`，而**滚动容器没有块方向的 max-content 高度**——它在单列网格里对行轨的贡献塌成标题那一行（34px），盒子却照旧按内容画 407px，于是第二行的表单直接叠在它上面。桌面两列时看不出问题（侧栏靠 `max-height` 自己滚），只有 ≤1024px 切单列才暴露。

**改法就一行**：断点里补 `overflow: visible`（连同已有的 `position: static; order: -1; max-height: none`），并在规则旁把机制与实测数字写进注释，避免下一个人又去试 `height: auto`。

**验证证据（M8-a，与代码同版本）**

| 门禁 | 结果 |
|---|---|
| `npm run build` / `lint`(0 error) / `check:css-conventions`(5/5) / `a11y:contrast`(扫描 **121**) | 退出码均 **0** |
| 新增 `e2e/ux-narrow-editor-preview.spec.ts` | 5 例：390 / 640 / 1000 / 1024 四档"预览高度 > 300 且表单顶 ≥ 预览底"，加一条 1280px"仍是两列侧栏、`overflow-y` 还是 `auto`"（防止把桌面端一起改掉）。jsdom 做不了布局，这条只能浏览器级 |
| E2E | msedge **69 passed**（64 + 5）、webkit **24 passed**（19 + 5，Safari 对块方向 intrinsic sizing 的结论与 Chromium 一致）、mobile 两 project **14 passed** |
| 故障注入 | 删掉 `overflow: visible` 一行 → 四个窄档全红（红在重叠那条断言），1280px 那条仍绿；补回后 5 例复绿 |
| 实测多宽度 | 390 / 640 / 800 / 1000 / 1024 全部 `overlap:false`、行轨 407.219px；1100 / 1440 保持 `overflowY:auto` 的两列侧栏 |
| 截图 | `docs/dev/evidence/ux-ia-guided-flow/m8-a-preview-overlap/`：`1000px.png`（预览卡完整浮在表单之上）、`1440px.png`（桌面两列未受影响） |
| 未做（诚实边界） | ① 没顺手给预览卡在窄屏做"折叠"——它 407px 摆在表单上方，窄屏首屏基本被它占住；要不要收起来是信息架构决定（M8-a 只修"重叠"这个明确缺陷），登记不动；② 断点仍是既有的 1024，没新增档位。 |

### M8-b 开合记忆按实体分开 + "恢复默认"出口（M7-d 的两条尾巴）

**为什么要按实体**：M7-d 的记忆键是固定的 `wb.worldDesc`，于是"在 A 书特意收起"会跟着到 B 书——而 B 书可能还没填，本该自动展开。规则被另一本书的随手一点顶掉，这正是 M7-a 想避免的事。**口径**：描述某个实体的段（世界书两段、群聊 Runtime 检视）把实体 id 拼进 key；与实体无关的段（设置页三处）保持全局。`useSectionMemory` 的 key 因此放宽成 `MaybeRefOrGetter<string>`，视图侧传 `() => \`wb.worldDesc:${currentLorebook.value?.id ?? ''}\``。

**为什么要出口**：记忆优先之后，一次误点会让某段永远停在随手留下的状态，用户没有任何地方退回。所以在 设置 → 外观 → 界面自定义 末尾加一行"界面开合状态"：说清当前记了几条（不是"若干条"这种含糊话）、一条都没有时按钮不可点、点一下清空并回报清了几条。`settings.resetUiSectionOpen()` 返回条数，本来就空则返回 0 且不写盘。

**验证证据（M8-b，与代码同版本）**

| 门禁 | 结果 |
|---|---|
| `npm run build` / `lint`(0 error) / `i18n:check:strict`(207 文件，新增 5 键双语) / `check:css-conventions`(5/5) / `a11y:contrast`(121) | 退出码均 **0** |
| `npx vitest run` | **188 files / 3875 passed / 3 skipped**（新增 `appearance-section-memory` 2 例、composable 侧 2 例、视图侧按书分开 1 例；另把 M7-d 那条"跨重挂载保持"改成按同一本书测） |
| 浏览器实测（Edge 无头，两本都没填的书） | 书甲初始两段 `true` → 手动收起"整体世界描述"变 `false` → **切到书乙两段仍是 `true`**（不被书甲带走）→ 切回书甲仍是 `false`（自己的记忆还在）；设置页恢复前提示"当前共 1 条"、按钮可点，点完变"目前没有记住任何开合状态"、按钮 disabled |
| 故障注入 | 三处、签名不重叠：`:disabled` 恒 false → 只红"一条都没记时按钮不可点"；`resetUiSectionOpen` 不清空 → 红"点一下清空"；世界书 key 退回固定串 → 只红"按书分开"那条。撤销后全绿 |
| 截图 | `docs/dev/evidence/ux-ia-guided-flow/m8-b-section-memory-per-entity/`：`book-b-unaffected.png`、`settings-reset-entry.png`、`settings-after-reset.png` |
| 未做（诚实边界） | ① 删书/删群**不清理**其记忆键（留的是几条 boolean，代价可忽略，但"恢复默认"是目前唯一的出口）；② 出口只有一处全局清空，没有"单独恢复某一段"；③ 角色编辑器的"属性详情"段仍未接（语义不同，见 M7-d）。 | | | | | | | |
