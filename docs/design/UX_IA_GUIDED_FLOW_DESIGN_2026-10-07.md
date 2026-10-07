# 交互流程与信息架构优化设计（2026-10-07）

> 议题（用户原话）：当前系统各配置功能模块之间关联不明显，用户不清楚如何操作，且操作过程没有步骤引导。需重新优化交互流程与 UI 界面：建立功能模块间的清晰关联与导航路径；为关键任务提供分步操作引导；简化信息架构、页面布局与视觉层次，降低认知负担。
> 本文档是该议题的**第一交付物**：全面审查 → 设计文档 → 多轮自我评审修订 → 实施。当前版本为 **v3**（v1 经三轮对抗评审重写为 v2；v2 经第 4 轮引用核查修订为 v3；第 5 轮复核 v3 手改结果。五轮评审记录见 §八）。
> 工作分支：`feat/ux-ia-guided-flow`（自 `d34df56` 切出）。证据基线：`d34df56`。

---

## 结论速览（TL;DR）

- **审查范围**：17 条路由 / 16 个视图 / 7 个设置面板文件（含嵌套 `VectorModelPanel.vue`）/ 4 个导航面（`NavRail` `BottomNav` `MoreView` `mobile-nav`）/ 5 个关键对话框入口（新建对话、主密码、API 错误、首启欢迎、向量模型安装）/ **25 条模块依赖边** / 6 条关键任务路径。全部结论以 `file:line` 可复核；引用核查进行了三轮（第 1 轮 249 条、第 4 轮 96 条、第 5 轮复核第 4 轮修订本身），累计纠正 33 + 16 + 7 处，评审记录见 §八。
- **五条根因**：R1 导航是资源平铺而非任务分层（12 + 2 平铺项、无分组无描述、高亮由点击写入而非路由派生）；R2 模块依赖只存在于代码（25 条边中 **11 条不可见**、**6 条可见但不可一跳**、**4 条有 UI 无读者**、**3 条功能不存在**、只有 **1 条可见且可一跳**）；R3 引导仅 1 个静态 4 条描述的弹窗，关闭即永久消失；R4 单面板信息密度失控（设置「模型」一类聚合 ≈60 个控件面（字面标签口径；把 `v-for` 展开的 7 个预设按钮计入则为 66）、17 个 SFC > 1000 行、`.empty-state` 手写 ≥10 份）；R5 命名与状态语义漂移（`nav.archives`=记录 而页面标题=群聊记录；"扩展"面板装的是语音；图片页的"去设置"落在不含所需内容的类）。
- **方案四层**：N 导航模型（单一事实源 `core/nav-model.ts`，12+2 平铺 → 4 组 13 内容项 + 2 系统项）、L 关联层（就绪状态条 + 关联面板 + 命中回显 + 前置条件横幅，全部读同一个 `core/readiness.ts`）、G 引导层（任务注册表 + 任务中心 + `StepFlow`/`EmptyState`/`HelpTip`/`FormField` 原语）、V 视觉与降噪（设置 6→7 类、渐进披露、术语表、巨型视图分区）。
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
| 记录 / 群聊记录 | 「档案」，页内两 tab：群聊记录 / 已归档会话 | 让单聊 `archived`（E 见 §1.7）有归处 |
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
| 导航分层 | 12 内容 + 2 底部，平铺 | 4 组 / 13 内容项 + 2 系统项 | `tests/core/nav-model.test.ts` 断言分组结构与计数；三渲染器同源快照测试 |
| 三处导航同源 | 三份硬编码 | 1 份 `nav-model` | 单测：`NavRail`/`BottomNav`/`MoreView` 输出同一集合；`/group`、`/more` 的"某端无入口"数 2 → 0 |
| 激活高亮 | 3 处失准 | 0 处 | e2e 依次进 `/character/new`、`/character/:id/edit`、`/more`，按 `data-nav-entry="<id>"` 断言激活项（**项级断言，不断言组**） |
| 语义跳转点 | 9 | ≥26 | 每个跳转带 `data-rel-jump="<edgeId>"`；`tests/ux/related-jumps.test.ts` 解析 nav-model + 组件，断言覆盖 E01–E25 的处置集合；e2e 抽样点 8 条真实链路 |
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
| `views/ArchivesView.vue` | 页名「档案」+ 两 tab（群聊记录 / 已归档会话）；`:312-323` 并入 `EmptyState` |
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

### 6.1 新用户第一次打开（改造后）

1. 欢迎卡（原弹窗降级为任务第 0 步）：一句"三步就能聊起来" + 「现在配模型」「先看清单」两个按钮。收起它不影响任务中心存在。
2. `/chat` 无角色 → `EmptyState` + 任务卡（T1→T2→T3，进度"步骤 1/3"）。
3. T1 的"去完成"深链 `/settings?cat=model-access&from=/chat`；填完点页头"返回来源"回到任务卡，T1 自动变绿（判据读 `activeProfile`，不读"看过页面"）。
4. 未就绪时页头就绪条显示"模型：未配置"并可点；主密码锁定态显示"已锁定，需解锁"，绝不显示"未配置"。
5. T4/T5/T6 三张卡同理，全部就地跳转；rail 底部「引导」或 `/more` 顶部随时重开；单步可跳过且不阻塞其他步。

### 6.2 日常创作者

- **改一个角色的世界**：`/character` 卡片关联行"绑定世界书 · 2"→ 点条目直达该书；世界书页"已绑定角色"可点回编辑（含空态里的链接）。角色编辑新建态也能看到绑定段。
- **写长文再抽设定**：`/story` 提取 → 结果行跳 `/worldbook`、`/character`（把现存的唯一好范式推广为通用关联面板）。
- **喂文档**：`/databank` 顶部一眼看到"关键词通道：已生效 / 向量通道：未开启（原因 + 开启入口）/ 静态通道：需角色绑定世界书（+ 去绑定）"。
- **单聊调教**：每条回复可展开"本轮注入 世界书 2 条"，条目名可跳来源；上下文面板显示真实 token 用量与"全局书也在生效"。
- **群聊**：页头明确"群聊不加载世界书与文档检索，角色级模型参数不生效"（把不存在说清楚），成员可点进编辑；`/chat` ⇄ `/group` 分段一键切换，切换后底栏仍在。
- **回溯**：「档案」下群聊记录与已归档会话两个 tab；角色版本从角色卡也能进。

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
| 14 | `title=` 71 处全量迁移 `HelpTip` + 键盘可达性审计 | M3 先建原语与关键项 | 无障碍专项 |
| 15 | 消息 `outcome/error` 旗标（现错误写进 `content`） | 属数据契约扩展，本议题只做 trace 一个可选字段 | T3 需要"成功"而非"已回复" |
| 16 | 引导有效性度量（纯本地，不上传） | 需先定度量口径与隐私边界 | 需判断哪些任务卡真有用 |
| 17 | 巨型 SFC 继续拆分（17 个 >1000 行，本次只按可见密度拆） | 纯工程收益，混做放大回归面 | 下次触碰同文件的任意需求 |
| 18 | 设计文档收敛（`mobile-ui-design.md` §13 五/六 tab、`software-design-document.md:35,116,135`、`mobile-pwa-plan.md:48`、`PROJECT_INDEX.md:323-337` 缺 `MoreView`、`PLAN_AUDIT_2026-09-28.md:97` 对 EXP-02 的高估） | 本文档给出目标态，M1–M4 落地后统一回写 | M1 完成即先回写 tab 与 PROJECT_INDEX |
| 19 | 会话模型改为**按角色记住各自激活会话**（`activeChatId` 由单值变映射），并让"切角色 → 该角色上次那段"直接接回 | D-R 已把"写错会话"这条数据丢失堵住（按 `characterId` 纠偏），但"切回甲时仍显示甲的默认会话而非甲上次打开的那条"这个体验缺口需要动会话模型，与"一次会话只属于一个角色"的索引结构一起改才干净 | 多会话使用率上来，或用户反馈"切回来不是刚才那段" |

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
| rail 结构 | 12 + 2 平铺 | 4 组 / 13 内容 + 1 系统，每项带职责提示 | 达标 |
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

