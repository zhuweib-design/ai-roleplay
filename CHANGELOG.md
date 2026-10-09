# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 与 [语义化版本](https://semver.org/lang/zh-CN/)。
版本格式遵循语义化版本：主版本用于稳定版契约，次版本用于功能发布，修订版本用于兼容性修复。

## [1.0.0] - 2026-09-27

### 稳定版边界
- 完成 0.4.0 至 0.9.0 的长对话、搜索虚拟化、Runtime 状态演化、记忆审核和世界内用户资料能力。
- 冻结核心数据契约、Runtime Event/Reducer、备份恢复、资源安全与 PostgreSQL 迁移边界。
- 完成真实 PostgreSQL 集成、迁移备份恢复演练、桌面 Edge、移动端和 WebKit 浏览器回归。
- Web 生产构建通过 CSP 静态与运行时审计；Tauri 桌面构建继续由本地 `--no-bundle` 门禁验证。

### 验证
- Vitest 全量 3490 项通过；Playwright 全量 41 项通过。
- `npm audit --audit-level=high`、类型检查、ESLint、生产构建、国际化、Schema、CSP 门禁通过。
- 真实 Provider 指标仍需配置外部凭据后执行，未将离线评估结果冒充网络回归。

## 未发布

### 文档
- 新增 `docs/design/UX_IA_GUIDED_FLOW_DESIGN_2026-10-07.md`（交互流程与信息架构优化设计，分支 `feat/ux-ia-guided-flow`）：审查 17 条路由 / 16 视图 / 7 设置面板文件 / 4 导航面，把模块间关系登记为 **25 条依赖边（E01–E25）**并逐条分类——仅 1 条"可见且可一跳"、11 条不可见、6 条可见但不可跳、4 条有 UI 无读者、3 条功能不存在；给出 N 导航模型 / L 关联层 / G 引导层 / V 视觉降噪的四层方案、M1–M4 里程碑与 P/R/W/B 分类回滚，七节齐备（现状与问题 / 修改原因 / 方案 / 预期效果 / 具体修改内容 / 用户使用方式 / 后续持续优化方向）。
- 该设计文档经 **五轮对抗自我评审** 收敛（引用核查 249 + 96 条，累计纠正 33 + 16 + 7 处，含 `dual-channel-runtime` 的 staticGate 隐藏耦合、`tokenBudget` 恒为 0 的假显示、`type-adapters` 与门禁脚本的路径行号错配）；§八 逐轮记录问题、判定与处置，并保留两条被驳回的评审意见。审查中纠正了 `REAL_DEVICE_TEST_2026-10-03.md` 的"随机事件无消费者"误判（实际由 `chat-generation.ts` 消费并下轮注入）。

### 变更（UX/IA 实施 M1-a：导航单一事实源与分层）
- 新增 `src/core/nav-model.ts` 作为导航唯一事实源（4 个内容组 / 13 内容项 + 1 系统项，含 `routeName`、`activeWhen`、一句话职责 `descKey`、移动端 Tab 顺序与聚合页标志）；`NavRail` / `BottomNav` / `MoreView` 三处渲染面全部改为由其派生，删除各自硬编码清单。
- 桌面 rail 由 12 + 2 平铺改为 4 组分层并带组标题；激活态改由路由派生（原 `characterStore.currentNav` 只在点击时写入，`/character/new`、`/character/:id/edit` 会失准），随之删除 `currentNav`/`setNav` 与零消费者的 `NavKey` 类型。
- 群聊在移动端不再丢底栏：`App.vue` 的 `showBottomNav` 从 `isMainTab` 改为读取 `isDetailRoute`——后者此前**零消费者**，注释描述的"二级页隐藏底栏"并未生效；`/group` 也从 `DETAIL_ROUTES` 移出。聚合页在桌面端可达、按组分节、真正渲染卡片描述并补页头返回；聚合页新增群聊入口、移除个人中心入口（路由与页面暂留，内容并入设置→关于随 M2 的 `?cat=` 深链一起做）。
- `src/i18n/locales/{zh,en}.ts` 各新增 19 键（`nav.group*` × 4、`nav.more`、`navDesc.*` × 14）；删除随之失效的 `.nav-item.settings` 底部对齐规则。

### 新增（UX/IA 实施 M2-a：关联可见化与深链契约）
- `src/core/readiness.ts`：就绪状态**唯一判定源**。模型 / 世界书 / 文档检索 / 语音 / 状态指令五个芯片，状态四值 `ready/attention/locked/n-a` + 原因键 + 跳转目标；锁定态读 `hasMasterPassword && !isUnlocked` 与 `!!activeProfile` 两个独立事实，因此不再把"锁住了"说成"没配过"（D-10 成因）。
- `src/composables/useReadinessJump.ts`：`?cat=&from=` 深链契约，`from` 受站内前缀白名单约束（防开放重定向），返回走 `router.replace` 避免历史堆叠。
- `src/components/layout/ContextReadinessBar.vue`（挂 `/chat`、`/group` 页头）与 `src/components/common/PrereqNotice.vue`（挂 `/databank`）：依赖状态与生效前提首次出现在界面上，入口带 `data-rel-jump` 标记。
- `src/core/dual-channel-runtime.ts` 新增 `vectorRagEnabled` 响应式镜像（该开关此前只在面板挂载时读一次，界面会显示陈旧状态）。
- 测试：`tests/core/readiness.test.ts`（12 例）、`tests/components/readiness-surfaces.test.ts`（5 例）、`e2e/ux-readiness.spec.ts`（4 例，真实 Edge 通过）。

### 变更（UX/IA M2-a 续）
- `src/views/SettingsView.vue` 开始读取 `?cat=`（此前恒落「外观」，所有"去设置"类按钮都会把用户送错地方），并在带 `from` 时提供"返回来源页"。
- 世界书页"已绑定角色"从只读列表改为可点入口（跳角色编辑并带来源），空态补"去角色列表绑定"按钮，兑现原先那句没有链接的指引文案（`wb.boundCharsEmpty`）。
- 群聊页头显式声明能力差异（不加载世界书与文档检索、角色级模型参数不生效），把"静默不一致"改成"说清楚的缺失"。
- `i18n` 双语各 +31 键（`readiness.*` / `prereq.*` / `wb.boundCharsGo*` / `group.capabilityNote` / `settings.backFrom`）。

### 新增（UX/IA 实施 M3-a：关键任务的分步引导）
- `src/core/guided-tasks.ts`：任务注册表 —— 6 个主任务（配模型 / 有角色 / 收到第一条回复 / 世界书生效 / 文档可检索 / 语音朗读）+ 3 个进阶任务（群聊 / 故事提取 / 本地模型）。每步的完成判据**读真实数据**（store、消息、开关、前提清单），不读"是否访问过页面"：删掉角色后任务会自动退回未完成。持久化只存用户意图 `{skipped, collapsed, updatedAt}`（键 `ai-roleplay:guided-tasks.v1`），完成态不落盘。
- `src/components/common/GuidedTasksCard.vue` + `src/views/GuideView.vue` + 路由 `/guide`：任务中心卡与页面，步骤展开即给"一步跳转（带返回来源）"，可跳过、可收起、进阶默认折叠。
- rail 底部新增第二个系统项「引导」（导航面 14 → 15 项），`/more` 顶部新增带实时进度的引导入口，三处出现且都可回到 `/guide`。
- `src/views/ChatView.vue` 补零角色分支：`EmptyState`（新建角色 CTA）+ 任务卡，替代原先无条件的三栏渲染（`ChatMain.vue:93` 的非空断言路径不再被走到）。
- `src/components/common/EmptyState.vue`：空态原语（图标 + 标题 + 解释 + 主行动 + 插槽），此前 ≥10 份手写 `.empty-state` 的第一处收敛。
- 测试：`tests/core/guided-tasks.test.ts`（9 例）、`tests/components/guided-tasks-card.test.ts`（5 例）、`e2e/ux-guided-tasks.spec.ts`（5 例，真实 Edge 通过）。

### 变更（UX/IA M3-a 续）
- 首启欢迎窗重写：原来的"4 条功能描述 + 一个按钮，点 X 即永久结束"改为"三步最短路径 + 两个真实动作（打开任务清单 / 现在配模型）"，关闭仅表示欢迎看过，引导本身常驻可回；随之失效的 9 个 `onboarding.feature*` / `onboarding.start` 键在双语中一并清除，不留死键。
- `i18n` 双语各 +63 键（`guide.*`、`chat.empty*`、`nav.guide`、`navDesc.guide`、`router.guide`、`onboarding.step*`）。
- `useReadinessJump` 的站内白名单补 `/guide`（e2e 抓到：缺失时 `from=/guide` 被判非法，"返回来源页"按钮不渲染）。

### 变更（UX/IA 实施 M4-a：设置拆类与默认落地）
- 设置页分类 6 → **7**：新增「检索」类（图标 `search`），`VectorModelPanel`（向量模型与文档检索通道）从「模型」类末尾的隐藏段落升为独立、可深链（`?cat=retrieval`）的分类。「模型」类的控件面因此从 60（`v-for` 展开 66）降到 39（45）。
- `VectorModelPanel` 补一条静态通道说明：文档所在的静态通道只在该对话角色绑定了世界书时才被查询（`chat-generation.ts:690-692` 的 `staticGate`），此前这句只存在于代码里。
- 设置类「扩展」更名为「语音与辅助」（双语），与其实际内容（朗读 / 翻译 / 摘要）一致；就绪判定中向量开关的跳转同步指向新的「检索」类。
- 曾实现"进入设置时若无可用 Profile 则自动落在「模型」"的智能默认，但全量 E2E 断掉 13 条既有用例（`theme-visual` / `contrast-axe` / `chat-flow` 等依赖默认分类为外观，且模型面板转为可见后触发 `getByRole('tab', {name:/模型/})` strict-mode 冲突）→ **已回退**，保持确定性默认「外观」，改由 `?cat=` 深链 + 就绪条 + 首启欢迎窗把人带到阻塞点。
- 测试同步：`tests/views/settings-local-model.test.ts`（分类数 7、标签清单含「检索」「语音与辅助」，默认仍「外观」）、`tests/core/readiness.test.ts`、`tests/components/readiness-surfaces.test.ts`、`e2e/ux-readiness.spec.ts`（向量前提跳转改为 `cat=retrieval`）。

### 修复（存量门禁红，非本批次引入）
- `e2e/long-history-scroll.spec.ts` 删除声明后未使用的 `DB_NAME`/`DB_VERSION`（eslint 2 error）；`CharacterList.vue:231`、`SettingsView.vue:240` 的 2 条 vue 格式 warning 由 `eslint --fix` 消除。
- `src/views/DataBankView.vue:1065` 的 `.search-empty-clear:hover` 包进 `@media (hover: hover) and (pointer: fine)`，恢复 `check:hover` / `check:css-conventions` 绿灯。

### 新增（UX/IA 实施 M2-b2：注入痕迹与真实用量）
- `PromptTraceSummary.vue`：助手气泡下可展开"本轮注入 N 条设定"，列出来源世界书、条目标题与命中关键词，书名可点回世界书页（带来源返回）。此前 `prompt-builder` 已返回 `activatedEntries`，只是从未下传（E02）。
- 消息新增可选字段 `promptTrace`（`core/lorebook-scanner.ts` 的 `PromptTraceItem` 裁剪视图，**不含条目正文**），随消息持久化并在 `services/type-adapters.ts` 双向映射；与 `thinking` / `status` 同构：空值不写、旧数据读为 `undefined`，零迁移。
- `services/chat-manager.ts` 的 `onPromptBuilt` 载荷增加 `activated` 字段；发送与重新生成两条链路都会把注入情况写到对应回复上（M2-b3 修正：本批次实际写到了 CharacterCard 上，界面与落盘都没有痕迹，见下方"修复"）。
- 上下文面板的 Token 区块改用真实累计值（`onPromptBuilt.tokenCount` 之和）与上限、剩余，并删除原先恒为 0 的三段假预算堆叠条及其不可靠的分项拆分（决策 D-H）。

### 修复（UX/IA M2-b3：注入痕迹静默失效）
- `stores/chat-generation.ts` 两处 `onPromptBuilt` 的落点由 `card`（`uiCharToCard()` 的 CharacterCard）改为 `liveMsg` / `target`（响应式消息对象）。CharacterCard 带 `[key: string]: unknown`，写错对象能过 `vue-tsc` 也不报错，结果是"本轮注入 N 条设定"从未出现过——本条由新增的浏览器级 e2e 抓到。
- 重新生成时同步清空 `promptTrace`（与 `thinking` / `status` 一致，避免"旧痕迹 + 新正文"错配）。
- `tests/core/prompt-trace.test.ts:19` 的 fixture 补上 `LorebookEntry` 必填的 `strategy` / `probability`；此前 `npm run typecheck` 实为报错状态。

### 新增（UX/IA M2-b3：E02 的浏览器级与 store 级证据）
- `e2e/ux-prompt-trace.spec.ts`：真实链路——配 mock API Profile → IndexedDB 造一本带"常驻"条目的全局世界书 → 发一条消息 → 断言就绪芯片转 ready、气泡下出现"本轮注入 1 条设定"、展开后条目为「永恒酒馆」、点书名落到 `/worldbook?from=/chat`、IndexedDB 的 `chats` 记录里确有 `promptTrace`、刷新后重开该会话痕迹仍在。
- `tests/stores/chat-prompt-trace.test.ts`：store 级契约 4 例（常驻 + 关键词各 1 条共 2 条痕迹且**不含正文**、无世界书时不写字段的负向对照、`persistChat` 落盘可回读、重新生成清空）。把落点改回 `card` 后该文件 2 例即红，证明守卫有效。

### 新增（UX/IA M2-b4：刷新后接回上一段对话 + 会话归属纠偏）
- `stores/chat-session.ts` 新增 `restoreLatestSession(character)`：只在"未选定会话（`activeChatId === null`）且消息缓冲为空"时，把该角色**最近一条未归档**会话装回聊天区；兼容层 `stores/chat.ts` 同步导出。`App.vue` 启动序列在注入适配器并加载各 store 后显式接线（`loadAllSessions` → `restoreLatestSession`），`CharacterList.vue` 的会话加载与角色切换也走同一入口。修复 D-Q：此前 F5 之后聊天区一个气泡都没有，必须再点一次左侧会话行才能接着聊。
- `stores/chat-generation.ts` 的 `persistChat` 增加会话归属校验（D-R）：`activeChatId` 指向的是**别的角色**的会话时不再沿用，回落 `chat-<角色 id>`；不在索引里的 `newSession()` 草稿仍原样保留。修复实测到的数据丢失——"打开甲的会话 → 切到乙 → 发一句"会把乙的整段缓冲覆盖进甲的会话记录。
- 测试：`tests/stores/chat-session-restore.test.ts` 8 例（接回 `updatedAt` 最新一条并同步高亮 / 全部归档不接回 / 只接回本角色 / 已有激活会话（含草稿）不覆盖 / 缓冲非空不覆盖 / 无角色静默 / 跨角色落盘纠偏 / 草稿会话保留）。`e2e/ux-prompt-trace.spec.ts` 的刷新段改为**不点击任何会话行**直接断言正文与痕迹仍在；反证实验：临时摘掉 `CharacterList` 的加载调用后 e2e 仍绿，确认 `App.vue` 的接线才是确定路径。
- 文档：回写 `docs/dev/P2-11-virtualization-plan.md` 的"已最小修复（保留 messages）"——被保留的字段在角色卡记录里从来不存在（`uiCharToCard()` 不映射 `messages`），该句当时不成立。

### 新增（UX/IA M2-b5：角色关联面板 + 深链回头路补齐）
- `src/core/relations.ts` + `src/components/layout/ModuleRelationsPanel.vue`：角色编辑页新增「角色关联」六行清单——世界书（按**真实生效集合**计数，条目只数 `enabled`）、文档检索（全局 + 本角色）、创作模式（角色绑定 vs 跟随全局，显示翻译后的模式名）、模型（角色级 Profile vs 全局激活 vs 未配置）、版本跟踪（**只读** `repositories`，不为判断而建仓）、所在群聊（成员反查）。每行一个跳转，`linked=false` 的行弱化成次要文字而不是假装成错误。
- `src/App.vue` + `src/styles/app-global.css`：`?from=` 深链契约的回程补齐。此前只有设置页真的给了"返回来源页"，世界书 / 数据银行 / 版本 / 群聊这些目标把用户带过去后没有回头路；现在带 `from` 落地就有右下角浮动返回（设置页仍用自己的面板头按钮，二者互斥不会重复渲染）。
- 测试：`tests/core/relations.test.ts` 9 例（六行顺序与 `data-rel-jump` 命名 / 查不到角色返回空 / 裸角色各行老实说"没有" / 世界书只数启用条目 / 文档计数含全局与本角色而不含他人 / 创作模式两种说法 / 模型三种说法 / 版本行只读 / 群聊行带 `preSelectGroupId`）、`tests/components/module-relations-panel.test.ts` 4 例（渲染六行 + 未关联行样式 + 跳转带 `from` + 群聊先 `selectGroup` 再跳 + 查不到角色不渲染）、`e2e/ux-relations-panel.spec.ts`（IndexedDB 造一本含 1 启用 + 1 停用条目的全局世界书，断言"生效 1 本 · 启用条目 1 条"、面板不搬运条目正文、点"查看"落到 `/worldbook?from=/character/seraphina/edit` 且"返回来源页"能回来）。
- 顺手修的存量提示（非本批次引入）：`ContextPanel.vue` 的 `.ctx-preset-select` 是 12px 的 `select`，移动断点内没有 ≥16px 覆盖（iOS 聚焦会放大整页），补 `@media (max-width: 640px)` 后 `check:i7-control-font-size` 的未覆盖项 1 → 0。
- 无障碍返工记录：面板标题最初写成 `<h3>`，被 `tests/accessibility/components-axe.test.ts` 的 `heading-order` 判违规（编辑页已有自己的层级），改为 `<p class="relations-title">` + `<section :aria-label>`。

### 修复（UX/IA M2-b6 顺带查明：激活态可能来不及落盘）
- `e2e/ux-prompt-trace.spec.ts` 在 webkit + `--workers=2` 下稳定失败，定位为产品侧的落盘时序问题而非用例抖动：`stores/settings.ts:526-530` 的 `setActiveApiProfile()` 用 `void persistSettings()`，与"新建 Profile"是两次独立异步写，测试只等"名字出现"就 `reload()`，于是丢掉激活态（现象：刷新后模型芯片停在 `is-attention`，气泡一条都不出现）。测试侧改为轮询 IndexedDB 直到 `apiProfiles` 含该名字**且** `activeApiProfileId` 指向它；产品侧"可等待落盘"登记为设计文档 §七 #20（真人若在激活后立刻刷新会遇到同一件事）。修后四 project 全量 **64 passed / 0 failed**。

### 新增（UX/IA M2-b6：群成员可点进编辑（E17）与市场安装结果可见可跳（E20））
- `src/views/GroupChatView.vue`：成员条里的角色名由 `<span>` 改为按钮，点它直接进入该角色的编辑页并带 `?from=/group`（配 M2-b5 的全局"返回来源页"可原路回来）。此前成员"看得见但进不去"，是 §1.4 里 E17 那条 B 类边的唯一缺口。
- `src/stores/community-market.ts`：`installRemoteItem` 的返回类型由 `Promise<boolean>` 改为 `Promise<string | null>`，成功时给出**新角色的 id**。界面据此显示结果条。
- `src/views/CommunityMarketView.vue`：安装成功后在远程清单下方出现一条 `role="status"` 结果条，写明"已加入角色列表：「角色名」"，并给两个去路（去编辑这个角色 / 看角色列表）；更新安装（`handleUpdateInstall`）改走同一条路径，因此同样有结果条。安装失败不显示。
- i18n：`group.editMember`、`market.installedToLib` / `installedGoEdit` / `installedGoList` 四键双语同步（两文件仍同序）。
- 测试：`tests/stores/community-market-install.test.ts` 3 例（成功返回 id 且角色确在列表、来源记录未断；条目不存在与下载失败返回 null；重名改名后 id 指向改名后的角色）；`tests/views/market-install-result-ui.test.ts` 2 例（结果条带角色名、两个按钮分别落到 `character-edit?from=/community-market` 与 `character-list`、失败不显示）；`e2e/ux-relations-panel.spec.ts` 新增一条真实链路（建角色 → 建两人群聊 → 点成员名 → 断言 `/character/<id>/edit?from=/group` 且表单里就是该角色 → 点"返回来源页"回到 `/group`）。

### 变更（UX/IA M2-b7：桌面侧栏二次排版）
- 桌面 rail 的入口由"图标在上、文字在下"的 56px 竖排卡片改为**图标 + 文字横排 32px 行**，宽度 72px → 112px；641–900px 视口自动收成 64px 图标栏（`title`/`aria-label` 保留）。实测 `scrollHeight/clientHeight` 由 **978/800（溢出 178px，底部入口要滚动才够得着）** 变为 **800/800（不溢出）**，最后一个入口底边由 964px 回到 792px。
- 组标题降级为左对齐 11px + 分隔线（此前与入口同色同形，读起来像更多条目）；`nav.groupConversation` 对话→**会话**、`nav.groupArchive` 档案→**历史**（第一组标题与组内条目同名是原来的观感来源之一）。
- **设置从「能力」组移入系统项**，与 引导 / 更多 一起钉在 rail 底部（`systemEntries()` 的声明顺序即渲染顺序）；**社区市场从「档案」组移入「创作」组**。内容项由 13 变 12、系统项由 2 变 3。
- 一次被门禁否定的设计：给激活项加 `secondary` 12% 底色后，axe 在浅色主题实测 `#0a7a77 on #e2efef = 4.38 < 4.5` 并连红三条用例；撤掉底色，只保留左侧色条 + 文字色。
- 补上 rail 一直缺失的悬停反馈（此前整条侧栏没有任何 `:hover` 规则，鼠标划过看不出可点）：`.nav-item:hover` 改文字色，包在 `@media (hover: hover)` 内；键盘焦点仍走 `base.css` 的全局 `:focus-visible`。
- 测试：`e2e/ux-nav-model.spec.ts` 新增几何断言（不溢出、最后入口在视口内、行高 ≤34px、设置是最后一个入口），`tests/core/nav-model.test.ts` 补齐四组归属快照与系统项顺序；前后截图存于 `docs/dev/evidence/ux-ia-guided-flow/m2-b7-nav-rail/`。

### 新增（UX/IA M2-b8：侧栏入口可编辑 + 激活态改背景填充）
- **侧栏入口显隐编辑**：新增 `src/core/rail-prefs.ts`（localStorage 键 `ai-roleplay:rail-visibility.v1`，只存"隐藏了哪些入口 id"的用户意图，带 Vue 响应式镜像）。`/more` 顶部新增「侧栏入口」区，点"编辑"展开勾选清单，取消勾选即从桌面左侧栏收起该入口；有隐藏项时出现"恢复显示全部入口"一键还原。`NavRail` 按偏好过滤，**整组被收起时组标题一起消失**。
- **两条不可绕过的安全阀**：①「更多」与「设置」永远不可隐藏（编辑器就住在「更多」页里，能藏掉它就是把自己锁在门外），读写两侧都做剔除，脏数据里带它们也会被清洗；② 从侧栏收起、且聚合页原本不列出的入口（对话/角色/世界书/社区市场/引导）会出现在「更多」页底部的**「已从侧栏收起」**分区里——收起不等于找不回来。
- 只影响桌面 rail：移动底部 Tab 保持"6 个入口不增不减"的既有契约（由 `e2e/mobile/mobile-nav-groups.spec.ts` 守着）。
- **激活态样式**：去掉左侧 3px 竖线，改为整颗胶囊背景填充（rail 左右各留 6px 留白，圆角 `--radius-sm`），文字色走仓库既有约定 `var(--primary-foreground, var(--background))`。
- **64px 图标档（641–900px 视口）不再显示组名**，只留分隔线表达分组；组名规则写在组件 scoped 样式里（全局规则会被 scoped 特异性压住，写在那里才真的生效）。
- 一次被 axe 否定的写法：背景填充最初写 `color: var(--primary-foreground, #fff)`，而仓库**从未定义** `--primary-foreground`，于是永远回退成白字——青色主题下实测 `#fff on #7df9ff = 1.24`，`a11y:contrast` 静态扫描从 121 涨到 125、浏览器 axe 三条用例连红；改用 `var(--background)` 回退后静态回到 121、axe 4 例全绿。
- 测试：`tests/core/rail-prefs.test.ts` 7 例（默认全显示 / 翻转与落盘 / 可编辑清单不含钉底项 / 钉底项藏不掉且脏数据被清洗 / 三种脏输入退回全显示 / 一键恢复 / 系统项顺序与引导可隐藏）、`tests/components/nav-rail-visibility.test.ts` 5 例（15 项与 4 个组名 / 隐藏后 DOM 里真的没有 / 整组收起时组名消失 / 设置与更多藏不掉 / 激活项状态类）、`e2e/ux-nav-model.spec.ts` 新增一条真实链路（编辑 → 收起 → rail 少一项 → 刷新仍在 → 「更多」页仍能进入 → 一键恢复）。

### 修复（UX/IA M2-b8：设置并发写会倒置，旧快照盖掉新状态）
- `src/stores/settings.ts`：`persistSettings()` 改为**空闲时同步发起、忙时排队**（原 `async` 实现拆为 `writeSettingsSnapshot()`，外层用 `persistInFlight` + `persistWaiters` 串起来）。此前连点"新建 API 配置"→"激活"会并发两次写，先发起的那次带的快照更旧却可能后完成，于是把新状态覆盖掉——刷新后就绪芯片说"还没有可用的模型配置"，而 IndexedDB 里配置明明在。20 余处 `void persistSettings()` 调用点一行未改，语义自然变正确。
- **测试适配（不是削弱）**：`tests/stores/quick-reply.test.ts` 的 4 例"××后触发持久化"原先在调用栈内同步断言 `saveCallCount`，排队后第二次写会晚两个微任务，故加 `await flushPersist()` 后再断言；断言语义不变（仍是"该动作触发了持久化"），原因写在该文件顶部的 helper 注释里。
- 这条同时**修正了 M2-b6 记下的原因**（当时写成"激活态可能还没落盘"，并因此在测试里轮询 IndexedDB——那个等待其实不够）；设计文档 §七 #20 已按新机制改写，`docs/design/...` 内相关表述同步更正。
- 守卫：`tests/stores/settings-persist-order.test.ts`（假适配器"第一次写慢、后续写快"，断言最后一次落盘必须是最终状态）。反证：把排队摘掉后仅该用例即红 `expected {activeApiProfileId:'p1'} to equal {…'p2'}`（`quick-reply` 35 例仍全绿 ⇒ 只有顺序守卫抓得住），恢复后通过。

### 变更（UX/IA M2-b9：交互反馈补强——滑块着色、按钮按压、提示自动关闭）
- **滑块进度着色**：新增 `src/core/range-fill.ts`（`v-range` 全局指令，`main.ts` 注册），把当前值换算成 `--range-pct` 写到元素自身；`base.css` 给所有 `input[type="range"]` 铺两层 `background-image`（已填充段 + 底色带），拖动时颜色边界跟着拇指走。14 个 `type="range"` 输入全部挂上指令，其中 3 个此前**完全没有 class**（`WorldBookEventsPanel` 触发概率、`SettingsExtensionPanel` TTS 语速/音高）改走 `.tk-range`；`CharacterEditorView` 的 `.field-range`（只有 width + accent-color，等于原生控件）随之删除。
- 轨道盒子由 4px 高加厚到 16px（`.form-range` 18px），可见轨道仍以 `background-size: 100% 4px` 居中画成细带——4px 高的可点区域实际很难抓稳拇指。拇指在悬停/按下/键盘聚焦时给同色光晕，按下同时放大 1.18 倍。
- **按钮按压反馈兜底**：`base.css` 新增 `:where(button, [role='button']):not(:disabled)` 的 hover/active 规则（此前整站**没有任何**全局按钮 hover 规则，没自绘的按钮划过毫无反应）。着色用 `inset box-shadow` 而不是 `background-image`：组件普遍写 `background:` 简体，会把全局背景图整张清掉（侧栏激活项实测如此——`transform` 生效而 `background-image` 仍是 `none`），inset 阴影叠在既有底色上，既不被简体抹掉也不替换设计好的底色；按下另加 `translateY(1px)`。
- **提示弹窗自动关闭可感知**：`toast-service.ts` 新增 `TOAST_DURATIONS`（info 3000 / success 3200 / error 5000，原来一律 5000）、`TOAST_QUEUE_LIMIT = 5`（超限优先淘汰最早"排在后面等"的非错误项，正在显示的首条与已排队的错误不被静默丢掉）、同类型同文案连续触发只排一条。`Toast.vue` 底部加倒计时条（rAF 驱动 `scaleX`），指针悬停 / 键盘聚焦 / 页面隐藏都会暂停计时，三个理由全部解除后按剩余时间继续（WCAG 2.2.1）。
- 顺带修掉一个真实缺陷：`Toast.vue` 的 `modelValue` watch 缺 `immediate`，"挂载时就处于可见"的用法**永远不启动计时器**。
- 三条实测踩坑（都写进代码注释）：① 复合 token 放 `:root` 会被提前求值，`var(--range-pct)` 永远算 0%，渐变必须写在匹配到 `input` 的规则里；② `background:` 简体会清掉 `background-image`；③ 4px 轨道点不到。
- 测试：`tests/core/range-fill.test.ts` 8 例、`tests/utils/toast-service.test.ts` 9 例、`tests/components/toast-auto-close.test.ts` 10 例（假定时器把 rAF 与 `performance` 挂到同一时钟）；`e2e/ux-interaction-feedback.spec.ts` 6 例并入 **webkit** project（Chromium + WebKit 双内核各跑一次）。反证：分别摘掉 input 监听 / 重复合并 / 队列淘汰 / 悬停暂停 / `immediate`，对应单测红 1 / 1 / 4 / 2 / 6 例。
- **本批次自己引入的测试污染已查清并改掉**：新 spec 最初用设置页"清除背景"触发提示，导致 `webkit` project 里紧随其后的 `ux-prompt-trace` 稳定变红（刷新后 IndexedDB `settings.app` 变成 `{apiProfiles: [], chatBackground:{type:'none'}}`，模型芯片停在 `is-attention`；单跑永远绿，全量必现，两次复现两次）。改为**零落盘**的触发路径（提示走"发送被拦住"的守卫分支，滑块改值落在组件本地 ref 上），同一 webkit 全量连续两轮 **16 passed / 0 failed**。教训写进该 spec 顶部注释：证据用例不该顺带改用户数据。**该因果已被 M3-b0 推翻**——老用例 `backup-restore` + `ux-prompt-trace` 同样能稳定复现，真机制是 webkit 同一进程内多 context 共享存储目录的跨用例写竞态（改触发路径作为测试卫生仍成立）。

### 新增（UX/IA M3-b0：补掉 E03 / E19 / E22 / E23 四条关联缺口）
- **E03 上下文面板与真实注入一致**：`ContextPanel` 的世界书清单改读发送链路同一个判定源 `collectLorebooksForCharacter`（此前它自己按 `boundWorldBookIds` 过滤，而 `stores/chat-context.ts:63` 会把 `scope==='global'` 的书无条件纳入 ⇒ 面板少报一直在生效的书）。全局书单列并打「全局生效」标，计数改成生效口径，每一行可点：先 `selectLorebook(id)` 再带 `?from=/chat` 跳世界书页。
- **E19 已跟踪可查**：`stores/character-version.ts` 新增 `trackedCharacterIds` 与 `hasRepository(id)`；角色卡元信息行尾出现「已跟踪」标记，点它带 `?char=<id>` 进版本页，版本页 `onMounted` 读该 query 定位角色（原来只会自动选第一个）。**顺带修掉一个真实缺陷**：版本快照此前只在版本页挂载时加载，离开那一页全应用都不知道哪些角色被跟踪 ⇒ 改为启动时随其他 store 一起 `loadFromDisk()`（带 catch）。
- **E22 图像模型两处配置打通 + 不再刷新即丢**：`imageGenConfig` 进入设置持久化白名单（`writeSettingsSnapshot` 显式字段 + `loadFromStorage` 逐项归一化脏值 + `decryptAllApiKeys` 与 Profile / 翻译密钥同批解密）；`stores/image-generation.ts` 的 `providerConfig` 改为 settings 那份的**只读 computed 镜像**，写一律走 `updateProviderConfig → settings.setImageGenConfig`（单一事实源，不留两个 store 互相 watch 的环）。图像页配置段新增来源说明 + "从「模型接入 · X」一键填入"（锁定态只填端点与模型并说明原因）+ "去设置"改带 `?cat=model`（原来一律落「外观」）。`canGenerate` 增加"密文密钥不算已配置"。
- **E23 图片产物去向**：图片页页头明示"产物只存进画廊，不会进入对话消息"（该能力不存在且无可跳目标，按声明类处置，不顺手做"图片入对话"）。
- **§1.4 后测复评表已补（§1.4.1）**：逐行给出 25 条边的后测分类与依据批次。实测 **A 14 / 撤下 4 / 声明 3 / 未覆盖 4**，与 §四 目标口径（17/4/4）差 **3 条**——目标把"给 `/random-events`、`/local-model` 挂 `PrereqNotice`"与"市场 URL 运行期配置的显式声明"算成了已完成，实际 `PrereqNotice` 只挂在 `/databank` 一处。差项登记为续期项，没有改口径数字凑达标。
- i18n：`ctx.worldGlobalTag` / `ctx.worldRowAria`、`characters.trackedTag|Hint|Aria`、`imgGen.galleryOnly` / `configPersistedNote` / `fillFromProfile` / `goToModelSettings` / `profileKeyLocked`、`masterPwd.imageGenKeyDecryptFailed` 共 11 键双语同序（zh / en 各 3321 行）。
- 测试：`tests/components/context-panel-lorebooks.test.ts` 5 例、`tests/views/character-card-tracked.test.ts` 4 例、`tests/stores/character-version-tracked.test.ts` 5 例、`tests/stores/image-gen-settings.test.ts` 7 例、`tests/stores/image-generation-provider.test.ts` 6 例；`e2e/ux-gap-visibility.spec.ts` 7 例（真实浏览器里逐条验证面板计数、标记跳转、刷新后配置仍在、页头声明）。反证：面板改回只列绑定书 → 4 例红；把 `imageGenConfig` 摘出白名单 → 4 例红；`canGenerate` 去掉密文判断 → 1 例红；启动不加载版本快照 → E19 的 e2e 自然失败（正是这条发现引出修复）。
- **webkit 串跑偶发的真机制查清（纠正 M2-b9 的因果）**：`backup-restore` + `ux-prompt-trace` 两条老用例即可稳定复现，与新增用例无关；现场按时间 dump `settings.app` 看到 `n=1 → n=0 → n=1`，即两个 app 实例在同一份共享存储上互相盖写。试过两种"看起来对"的修法并都**实测否掉后还原**：去掉"首次启动写默认快照"（pair 变绿但全量仍红，且逼着改一条既有单测契约）、在 `backup-restore` 末尾等写入静默（晚到的写发生在 context 关闭阶段，无效，代码已删）。最终处置是让 `ux-prompt-trace` 在 `reload()` 前再确认一次"当前落盘的就是自己的 Profile"——不放宽任何断言，只把"读到的必须是自己的快照"变成前置条件。修后 webkit 全量连续两轮 **16 passed**，Chromium 三 project **69 passed**。

### 新增（UX/IA M3-b1：引导原语 StepFlow / HelpTip / FormField）
- `src/components/common/StepFlow.vue`：一个组件伺候两种形状——传 `current` 即**向导**（圆点 + 连接线 + 当前步标签，`aria-current="step"`，←/→ 换步且到边界不循环），不传即**清单**（编号 + 说明 + 行尾动作或"已满足"）。向导模式**只接管 ←/→**，Up/Down/Home/End 一个都不吞（设置页 tablist 用这四个键切分类，同屏会抢）。
- 两处采用：`GuidedTasksCard` 主清单与进阶清单里**各写一遍**的步骤列表（约 15 行 × 2）合并为一次调用，随之删掉只有它在用的 5 条样式（保留页头那颗"打开任务清单"仍在用的 `.guided-step-action`）；`NewConversationModal` 的步骤指示器（原 `role="navigation"` + 两个 span 圆点）改由 StepFlow 渲染，删掉 5 条样式。**行为不变**：前进仍受 `canNext` 约束（StepFlow 只发 `change` 请求，步数由调用方持有）。
- `src/components/common/HelpTip.vue`：把"只有悬停看得到"的说明换成真按钮 + `aria-describedby` + `role="tooltip"`，悬停 / 聚焦 / 点击三条路都能开；气泡不用 `display:none` 藏（那样 `aria-describedby` 读不到内容），改用 `visibility`。
- `src/components/common/FormField.vue`：标签 / 说明 / 报错三件套的外壳，通过**插槽参数**把 `id`、`aria-describedby`、`aria-invalid` 交给调用方绑到真正的控件上（不假设控件类型，也就不替调用方决定 v-model 怎么写）。
- i18n：只新增 `guide.stepsAria` 一键（双语同序，zh / en 各 3322 行）；其余全部复用既有键（`common.step` / `common.optional` / `common.required` / `prereq.done`），不造重复文案。
- 测试：`tests/components/step-flow.test.ts` 9 例、`tests/components/help-tip-form-field.test.ts` 9 例、`tests/accessibility/new-primitives-axe.test.ts` 4 例（向导态 / 清单态 / HelpTip / FormField 各过一遍 axe，全部 0 违规）。既有 `tests/components/guided-tasks-card.test.ts` 只把类名选择器换成 `.step-flow-row`，断言语义未变。
- 两个实现期发现：**①** prop 不能叫 `ariaLabelKey` —— 模板里写 `aria-label-key` 会被 vue-tsc 当成 ARIA 属性而不是 prop，报"缺少 ariaLabelKey"，改名 `labelKey` 才通过；**②** HelpTip 这一批**没有可用采用点**——最需要的就绪状态芯片（原因只写在 `title=` 里、读屏拿不到）本身就是 `<button>`，再套一个按钮是非法 HTML，那处要的是给芯片自身加 `aria-describedby`，与 71 处 `title=` 的全量迁移一起留在设计文档 §七 #14；HelpTip / FormField 的采用随 M3-b3 的两个快速档表单落地。

### 新增（UX/IA M3-b2：空态收敛到 EmptyState）
- 11 个视图里的 **22 处**手写 `.empty-state` 改为共用 `src/components/common/EmptyState.vue`：`CommunityMarketView` 6 处、`CharacterVersionView` 3 处、`RandomEventsView` 3 处、`LocalModelView` 3 处，`ArchivesView` / `CharactersView` / `DataBankView` / `StoryEngineView` / `ImageGeneratorView` / `WorldBookView` / `GroupChatView` 各 1 处。随之删掉 **30 条**只有它们在用的 `.empty-state*` / `.empty-hint` / `.empty-title` / `.empty-text` / `.empty-icon` 样式。
- 组件为此扩三个口子（都被真实需求逼出）：`as: 'section' | 'li'`（世界书侧栏与群聊列表的空态是 `<ul>` 里的一项，用默认 `section` 会生成 `ul > section` 的非法结构，axe 的 `list-item` 规则实测报红）、`compact`（面板内小空态不配 40px 圆底图标，承接原来的 `.empty-state.small`）、`headingLevel: 2 | 3`；并把写死的 `id="empty-title"` 换成随机 uid——一页可能同时出现两个空态，重复 id 会让 `aria-labelledby` 指错。
- 两种"合并成一个组件调用"的写法：`ArchivesView` 与 `CharactersView` 原本是"无数据 / 被筛空"两套并排 DOM，现在按条件传不同文案键，"清除筛选"这类动作只在真有得清时出现。
- 一次被 axe 否定的写法：`WorldBookView` 空态用 `heading-level="3"` 触发 `heading-order` 违规（该页在 h1 之后没有 h2），改回默认 h2 后两条"空状态应通过 axe 审计"全过。
- **有意保留的一处**：`ChatMain.vue` 的空态带动态示例提问芯片，不是"图标 + 标题 + 说明 + 一个主行动"的形状，硬塞进组件要么给它开"任意内容"的口子（又回到各写各的）要么丢芯片，故不改。后测口径：`grep -rl '.empty-state' src --include=*.vue` 只剩 `ChatMain.vue` 与 `EmptyState.vue` 自身，使用组件的文件 12 个。
- 测试适配（不是削弱）：`e2e/ux-readiness.spec.ts` 一处选择器 `.empty-state .link-btn` → `.empty-state .empty-action`（动作按钮类名随组件统一），断言的跳转行为不变。
- 视觉取舍如实记下：`DataBankView` / `StoryEngineView` 的上传按钮原本是"图标 + 文字"的页头按钮，改为组件统一的主行动按钮后**按钮内的小图标没有了**，换来与其它空态同形。

### 新增（UX/IA M3-b3：角色与世界书两个快速档）
- `src/components/character/QuickCharacterForm.vue`：新建角色默认落在这一档——名字（必填）+ 设定 + 可选一本世界书 + "建好并开始对话"。**保存时才建角色**：不产生草稿、不给"跳去编辑"的链接（`/character/new` 没有 ID，跳过去是空跳）；绑定排在 `createCharacter()` 返回 ID 之后，否则 `bindWorldBook` 找不到角色只返回 false。字段用 `FormField` 做标签 / 说明 / 报错的 aria 关联。
- `src/components/worldbook/QuickLorebookFlow.vue`：世界书"最小生效三步"——建书 → 加一条**启用且 `constant`** 的条目 → 绑到当前角色；步骤条复用 StepFlow 清单态，前一步没做完时后两步禁用。三步的实质是"无条件注入成立"的三个条件，不是三个按钮。
- `CharacterEditorView` 新建态加"快速档 / 完整表单"两档开关（编辑已有角色时不出现，避免"藏字段=丢数据"）；快速档下头部那颗"保存"按钮不渲染，避免两条保存路径并存。
- 两档切换用 `v-if` 而不是 `v-show`：`v-show` 时两档同时在 DOM 里，"名称"标签重复（`e2e/ux-relations-panel` 直接 `strict mode violation` 报出来），且隐藏表单的输入框仍可被 Tab 进入。改 `v-if` 后 6 条相关用例转绿；代价（新建态来回切档丢未保存填写）如实记下。
- 世界书入口做过一次方向纠正：第一版"一本书都没有时自动展开三步"实测否掉——它把编辑器从用户手里抢走，`e2e/worldbook-flow.spec.ts` 整条被挡、移动视口下流程卡片还 `intercepts pointer events` 盖住"新增条目"按钮。现改为空态里一颗显式按钮"或按最小生效三步走"，流程打开期间编辑器不渲染，走完点"完成"收起。
- 顺带修一处样式：`:disabled` 的 input/textarea 在深色主题下被浏览器刷成浅灰底（看着像坏了），补 `.quick-wb :disabled` 保持主题色。
- i18n：新增 `quick.*` 共 32 键（双语同序，zh / en 各 3354 行）。
- 测试：`tests/components/quick-character-form.test.ts` 6 例、`tests/components/quick-lorebook-flow.test.ts` 6 例、`tests/accessibility/new-primitives-axe.test.ts` 扩到 6 例（两个新表单各 0 违规）、`e2e/ux-quick-forms.spec.ts` 5 例（含"三步做完后这本书出现在上下文面板"这条闭环断言）。6 条既有 e2e 在用例里显式切到完整表单（它们测的就是完整编辑器），断言内容未改。
- 全量：单测 **3759 passed**，覆盖率 79.69 / 74.16 / 81.82 / 81.57；E2E Chromium 三 project **74 passed**、webkit **16 passed**；`build` 与 9 项静态门禁退出码均 0。

### 变更（UX/IA M4-b1：原生 title 迁移与键盘可达性，§七 #14 前半结案）
- **口径纠正**：§七 #14 原写"71 处 `title=`"。实测 `src` 下 59 个 .vue 里 `:title=` 共 **75 处**，其中 **42 处是 `<Modal :title>` 对话框标题**（不是 HTML tooltip，保留），真正的原生 tooltip 是 **33 处**；静态 `title="..."` 一处也没有。
- **改道**：原方案是迁到 `HelpTip` 组件，实测只能服务 33 处中的 2 处——HelpTip 自己渲染 `<button>`，而 21 处宿主本身就是按钮/链接/label（按钮套按钮非法）；12 处在 `v-for` 里（侧栏 15 项、世界书树可达数百行），其 id 由文案键派生会让 `aria-describedby` 全部指到第一行；一半以上站点的文案是插值结果或数据字段，而它只接受 `MessageKey`。改为新增指令 **`src/core/tip.ts` 的 `v-tip`**（`main.ts` 注册）：宿主不变、气泡挂 body、id 自增唯一、值可为任意字符串并随绑定更新；`base.css` 加 `.tk-tip`（用 `opacity` 而不是 `display/visibility` 隐藏，否则 accname 读不到）。
- 33 处处置：**29 处改 `v-tip`**（侧栏 15、就绪芯片 5、会话列表 3、聊天页 10、其余 6）；**1 处改 `:aria-label`**（世界书树层级徽标，行数不可控不划算挂气泡）；**1 处保留原生 title 并进白名单**（基准历史嵌套 `v-for`）；**1 处改成可见文字**（市场页 Beta 免责——触屏与键盘都拿不到，而它是本页最重要的免责）；**1 处直接删除**（数据面板"单档案模式"说明：按钮此时 `disabled` 不进焦点顺序，且同块上方已有 `role="note"` 可见版本，title 只是重复）。
- 顺带修掉两处真实缺口：**①** `ChatMain.vue` 的 token 指标整块 `aria-hidden="true"` ⇒ 读屏完全拿不到已耗 token 与缓存命中率；去掉 aria-hidden 并给两个指标 span 补 `tabindex="0"`（不可聚焦元素挂 `aria-describedby` 等于没挂）。**②** 组件测试拿不到 `main.ts` 注册的全局指令（Vue 只报 `Failed to resolve directive` 后静默跳过），导致 `v-tip` 与 `v-range` 的效果在单测里全部消失——改在 `tests/setup.ts` 统一 `config.global.directives` 注册。
- 新增守卫 `tests/accessibility/no-native-title.test.ts`：交互元素上有 `title` 直接失败、非交互元素的 `title` 必须在白名单内、剩余总数写死为 1，并钉 `files.length > 50` 防止"路径解析坏 → 0 命中被当成 0 违规"的假绿（该假绿真的出现过一次：jsdom 下 `import.meta.url` 解析成 `/@fs/...`）。
- 4 处既有断言按新契约改写、语义不变：`tests/components/readiness-surfaces.test.ts:45,81`、`e2e/ux-readiness.spec.ts:22`、`e2e/ux-nav-model.spec.ts:22` 从断言 `title` 改为断言 `aria-describedby` + body 上 tooltip 的文案。
- 新增测试：`tests/core/tip.test.ts` 8 例（含多宿主 id 唯一、卸载不泄漏 body 节点）。全量：单测 **3770 passed**、`tip.ts` 语句覆盖 91.17%，E2E Chromium **74 passed**、webkit **16 passed**，build 与 9 项静态门禁退出码均 0。浏览器实测：侧栏 `.nav-item[title]` 从 15 归 0、`[aria-describedby]` 15，**键盘 Tab 聚焦即出现气泡**，Esc 立即收起，无 pageerror。
- 未做（仍留 §七 #14 后半）：全站键盘焦点顺序与陷阱审计。本批只保证 tooltip 类信息不再依赖指针。

### 新增（UX/IA M4-b2：设置页常规/高级折叠）
- 新增 `src/components/common/Collapse.vue`：可折叠段原语。触发器是 `<h2>/<h3>` 里的真按钮（`aria-expanded` + `aria-controls`，标题层级不因折叠而跳），面板用 **`v-show` 而非 `v-if`**——设置面板里全是"输入到一半"的草稿（自定义 CSS、选了一半的采样参数），用 `v-if` 收起等于把用户写的东西扔掉；说明文字刻意放在面板外面，收起时用户仍要知道这一段是什么、为什么默认收着。`plain` 变体供弹窗/表单内部使用，不再套第二层卡片。
- 三处高级段改为默认收起：**「外观」界面自定义**（聊天背景 / 气泡样式 / 自定义 CSS）、**「数据」新分组「运维与兼容」**（快捷回复互导 + 数据持久性 + 嵌入优化 + 审计日志）、**「模型」新增/编辑 API 弹窗内的默认采样参数**（top_p / presence / frequency，原 `<fieldset>` 改写，`.sampling-fieldset` 两条死样式随之删除）。
- 「数据」分类内 8 个块顺带重排为「档案 → 全量备份 → 导出 PNG → 导出 Markdown → 运维与兼容」：日常动作不再被四段运维项挡在下面；`e2e/backup-restore.spec.ts` 依赖的备份块保持常驻可见，未放宽任何断言。
- 一条一直存在却没人读的段说明被改写：`settingsView.uiCustomHint` 原值"主题、字号、界面自定义"在界面上零读者，现作为折叠段的说明使用（"偶尔调一次的样式项，改完要点应用才生效"）。双语各 +2 键（`settingsView.advancedOpsSection` / `advancedOpsHint`）、复用 1 键。
- 新增 `tests/components/collapse.test.ts` **10 例**（v-show 三条实质证据：收起后节点与草稿值仍在、行内 `display` 切换、收起再展开是同一个 DOM 节点；aria 接线；`level` 不改标题层级；说明在面板外；`plain` 变体）。故障注入实测：把 `v-show` 改成 `v-if` → 该文件 3 例转红。
- 2 处既有 e2e 断言按新契约改写：`e2e/ux-interaction-feedback.spec.ts:32` 新增"收起时不可见 → 点开 → 可见"两步，定位器从 `input.form-range` 的 `first()` 改为 `#bubble-radius`（`#bg-opacity` 在背景为"无"时是 `v-if`，节点不存在，用它断不可见会假绿）；同文件 `:137` 的倒计时条改为先 `poll` 到 `scaleX < 1` 再比两次采样（倒计时由 rAF 驱动，机器忙时首帧可晚几百毫秒，本批实测连续复现读到 `scaleX(1)`）。
- 全量：单测 **3780 passed / 3 skipped**（175 文件），E2E msedge **60 passed**、webkit **16 passed**、mobile 两 project **14 passed**；build 与 9 项静态门禁退出码均 0。默认并行度下 msedge 全量每轮失败集合都不同（`contrast-axe` / `worldbook-flow` / `group-chat-flow` 轮流 30s 超时），与 `REAL_DEVICE_TEST_2026-10-03.md` 登记的 **O-4** 同型，按该条处置以 `--workers=2` 复跑取全绿。
- 未做（诚实边界）：折叠状态不落盘（整页刷新后高级段回到收起）；角色编辑器"属性"段那套自写折叠尚未并入 `Collapse`；§3.6.4 的四个巨型视图分区留给 M4-b3。

### 新增（UX/IA M4-b4：三条未覆盖边补完 + `/profile` 并入设置→关于）
- **E10**：`/random-events` 页头下挂 `PrereqNotice` 三行前提（总开关 / 场景名与当前角色名一致 / 至少一个已启用场景）。这条边此前是纯字符串耦合——`chat-generation.ts:1306` 拿 `character.name` 当场景名去查配置，角色改名后事件静默停摆而界面无一处说明；判定集中在新函数 `useRandomEventPrereqs()`（`core/readiness.ts`），不一致时一跳该角色的编辑页并带回程。
- **E15**：聊天顶栏的故事时间由只读文本改为按钮，一跳 `/story?story=<id>`；故事引擎只在 id 真实存在时才 `selectStory`，手打链接与已删除的故事都不会把界面停在空选中态。回程由 App 的全局"返回来源页"承接。
- **E21**：市场页头新增一行可见文字，说明索引地址只在构建期由 `VITE_MARKET_INDEX_URL` 提供、运行期不可配置，**并连同当前指向一起显示**（读的是 store 用的同一个 `MARKET_INDEX_URL` 常量，声明与证据同行、可核对）。
- **D-B 后半**：`ProfileView.vue`（92 行，整页只有一块"本地用户 + 扮演身份在世界书"）并入「设置 → 关于」，`/profile` 改为重定向到 `/settings?cat=about`；旧链接、`scripts/ui-shot.mjs` 与 `e2e/contrast-axe.spec.ts` 的审计路由继续可用（后者因此多扫一次 `/settings`，即 D-N 预先接受的代价）。`mobile-nav.ts` 的 `DETAIL_ROUTES` 去掉 `profile`，对应断言翻转；死键清理 `nav.profile`、`router.profile` 与 5 个只服务旧页头的 `profile.*`，页面正文用到的 8 个键保留。
- 新增测试 11 例：`tests/views/chat-story-jump.test.ts`（4）、`tests/views/story-engine-quicksetup.test.ts` 的 `?story=` 深链组（3）、`tests/core/readiness.test.ts` 的 `useRandomEventPrereqs`（4，含"改名即断链并跳回该角色"）。双语各 +6 键（`market.sourceNote`、`prereq.randomEvents*` × 3、`prereq.actionTurnOn`、`prereq.actionSeeCharacters`）、−7 死键。
- 全量：单测 **3792 passed / 3 skipped**（176 文件），E2E msedge **60**、webkit **16**、mobile **14** passed，build 与 9 项静态门禁退出码 0。浏览器实测三条边各自走通（含 `/profile` 重定向后「关于」为激活分类）。
- 未做（诚实边界）：**E11 随机事件注入回显**仍开放——它需要给消息新增一条持久化字段（`promptTrace` 目前只装世界书命中），牵动 `types` 与 `type-adapters` 两处映射及角色卡导出契约；聊天侧的故事时间芯片因沙箱无任何故事数据（`stories` 0 条、4 个角色均无 `storyId`）无法用真数据走通，改由组件测试覆盖。

### 变更（UX/IA M5-b1：引导页优化——默认展开当前任务、完成态推进、计数口径分开）
- 任务卡改为**默认展开"当前该做的那一条"**：进 `/guide` 就能看到具体步骤与动作，不再是一排标题（实测可见步骤行 0 → 2）。用户手动开合过之后就不再自动跟随。
- 步骤三态各自有交代：未完成且能跳 → 动作按钮；已完成 → 只留"已满足"（**做完还挂着"去设置"会让人怀疑自己没做对**）；未完成又不能跳的可选步骤 → 一句"可稍后再做"（`guide.actionOrSkip` 这个键此前写在注册表里却永远渲染不出来）。
- 做完一条任务的收尾从"跳过"改成"下一步：<任务名>"，点了直接展开那一条；已完成任务不再提供跳过入口。
- 计数口径分开：顶部"已完成 x/6 个任务"，每行仍是"步骤 x/y"——同一个"步骤"两种含义是实测到的歧义点。`/more` 的进度同步改口径。
- 点击目标与层级：任务行 31px → 桌面 40px / 移动 44px；步骤动作按钮 22×54px → 30px 高（移动 44px），原先低于 WCAG 2.2 最小目标 24×24；任务标题 13px → 14px/600，计数降到 12px 常规。
- 同一条任务里两个动作不再同名：t1 的两步原先都写"去设置"且跳同一处，改为"去新增配置" / "去设为当前"（`guide.actionGoSettings` 随之删除，仅这两处使用）。
- 四处"界面说不清 / 判据说谎"一并修掉：进阶任务 a2、a3 的 `done` 原先**写死 false**（永远打不上勾，违反 `guided-tasks.ts` 开头"完成与否读真实数据"的唯一规则），改读 `story.stories.length > 0` 与 `localModel.loadedModelId !== null`；a1「群聊」判据原先抄了 t2 的"有角色"，从没打开过群聊页就已打勾，改读 `groupChat.groups.length > 0`；t6 语音步骤写着"启用并选择声音"而设置界面**没有声音选择器**（`ttsConfig.voiceURI` 全仓无写入点），文案改为只承诺存在的控件并明说用的是系统默认语音；全部完成时那颗"打开任务清单"按钮在任务清单页上是原地跳转的死控件，改为只在非 `/guide` 的出现位置渲染。
- 死配置清理：`GuidedTasksCard` 的 `compact` prop 删除（两个调用点都不传，且一旦传入会让"收起"按钮变成点了没反应）；进阶任务 head 补上 `data-rel-jump`（此前无法按仓库既有的定位约定寻址）。
- 测试：`guided-tasks-card.test.ts` 新增自动展开、可选步说明、"下一步"推进、动作标签不重复四组断言，并加 `resetToEmptyData()` 夹具（mock 角色会让 t2/t3 天然完成，"下一条是谁"随夹具漂移）；3 处既有断言按新契约改写（e2e 的"点 t1 才看到步骤"改为"进页面就展开 + 点一下能收起"，跳过用例的 `.guided-skip` 收窄到具体任务，`/more` 文案断言改口径）。
- 全量：单测 **3795 passed / 3 skipped**，E2E msedge **61**、webkit **16**、mobile **14** passed，build 与 9 项静态门禁退出码 0。
- 未做（诚实边界）：首启欢迎窗的 3 步仍是写死的静态文案，与任务卡前三条同事两套数据，本批未合并；单条任务的展开状态不落盘（只有整卡收起落盘）。

### 修复（UX/IA M5-b2：功能内的引导——三步走的死路、快速档的空下拉、执行不了的指令）
- 世界书"最小生效三步"的第三步原先在**没有当前角色**时只剩一颗永久禁用的按钮：`:disabled="!currentCharacter"` 让处理函数根本跑不到，于是为这种情况写好的 `quick.wbBindFailed` 永远上不了屏幕。现在改为说明"没有可绑的对象"+ 一条真出路——「改为全局书（不用绑定）」真的把 `scope` 改成 `global` 并让第三步打勾；第三步标签随实际出路在"绑定到当前角色"与"改为全局书"之间切换。
- 同处不再把 `chat.modelNotConfigured`（'未配置'，讲模型配置的字符串）当角色名插进"绑到角色「{name}」"。
- 角色快速档：0 本世界书时下拉只剩"暂不绑定"，说明文字却仍在描述"选中的书会……"。说明改为随真实数据切换，0 本时写清"为什么只有一项、之后在哪补绑"。**刻意不加"去建一本"的跳转**：`/character/new` 的草稿不落盘，跳走就等于扔掉用户刚敲的内容——一个会毁掉输入的按钮比一句说明更坏（理由写进用例注释）。
- 世界书页：一本书都没有时不再显示"选择左侧的世界书开始编辑"这句执行不了的指令（改说"还没有世界书。建一本，或按最小生效三步走。"）；三步走入口不再只藏在空态分支里，选中一本书之后照样能打开。
- 三步走的完成按钮文案与行为对齐：原写"完成，去编辑这本世界书"而它只是关掉流程（书被自动选中属于碰巧对上），改为"完成，回到这本世界书"。
- 一致性：三步流 4 个字段并入 `FormField`（与角色快速档同一套标签/说明/`aria-describedby` 关联），删除随之失效的 `.quick-wb-label`；`FormField` 采用面 1 文件 3 处 → 2 文件 6 处。双语各 +6 键、改值 4 处。
- 测试：新增 5 例（无角色时不渲染绑定按钮而渲染原因与出路、改全局书后 `scope` 真的变且第三步打勾、不再借用"未配置"字样、快速档下拉说明的两种取值与选项列表）。
- 全量：单测 **3800 passed / 3 skipped**，E2E msedge **61**、webkit **16**、mobile **14** passed，build 与静态门禁退出码 0。浏览器实测三处文案/入口逐条确认，截图用的临时世界书已走真实 UI 删除、收尾列表回到 0 本。

### 变更（UX/IA M5-b3：首启欢迎窗接进任务判据）
- 欢迎窗的三步原先是写死的数组，与任务卡前三条同一件事却两套数据（一套永不动、一套读真实 store）：恢复过备份或只清掉 `localStorage` 的人会被它要求"现在配模型"，而那三步其实都做完了。现在**完成态只认注册表一处**（`useGuidedTasks` 的 t1/t2/t3 `complete`），文案仍留在窗内（首启要顺带安抚"密钥只留在本机"，任务卡没义务讲）；完成步骤的排版与任务卡的 StepFlow 清单一致（灰字 + 删除线 + 右侧"已满足"）。
- 三步全完成时页脚不再递「现在配模型」，改为「去对话」为主按钮，说明文案换成"这三步都已经做好了，直接开始就行："——当着做完的人说他没做完，是说谎。
- 第一次给"关掉这个窗口不会结束引导"这句话加上断言：关闭只写 `ai-roleplay:onboarding-done`，`ai-roleplay:guided-tasks.v1` 必须仍不存在。
- 新增 `tests/components/onboarding-modal.test.ts` 4 例（全新用户 / 三步齐 / **只做完成两步的负向对照** / 关闭不写引导意图）。故障注入实测：把完成态查询改成恒 `false` → 恰好 2 例转红、另 2 例仍绿。
- 连带补齐 `tests/views/app-tauri-ux.test.ts` 的 store 桩：欢迎窗挂在 App 上，读注册表会经 `readiness` 调到 `chat.checkSendBlock()`，原先的空对象桩直接抛 `TypeError`。补的是真正被读到的那几个字段，未放宽任何断言。
- 双语各 +2 键（`onboarding.descDone`、`onboarding.startChat`）。全量：单测 **3804 passed / 3 skipped**（177 文件），E2E msedge **61**、webkit **16**、mobile **14** passed，build 与 9 项静态门禁退出码 0。
- 浏览器实测（沙箱真实数据：4 个角色、有回复、无模型 Profile）：欢迎窗第 2、3 步渲染为"已满足"、第 1 步未勾、页脚仍是「现在配模型」——静态版表达不了这种状态。"三步全完成"那一支只有单测覆盖：为它截图需要往沙箱写一把假密钥再删，脏数据比那张图值钱。

### 新增（UX/IA M6-a：单聊 ⇄ 群聊 分段控件）
- 新增 `src/components/chat/ChatModeSwitch.vue`，挂在两处页头（`ChatMain` 的 `.chat-header`、`GroupChatView` 的 `.page-header`）：单聊与群聊之间从此可以一步互切。§六 未落地清单里的最后一项导航到此完成。
- 不是"再加一个入口"：rail 的 15 项与"不滚动就够得着"、底栏的 6 个 tab 都被既有契约钉住，而群聊刻意不占底栏 tab（它和单聊是同一任务的两条通道，做成 tab 会形成单向门）。缺的是"我能在这两条通道之间换过去"这件事本身。
- 两侧选中态天然保留：单聊读 `character.currentCharacterId`、群聊读 `group-chat.currentGroupId`，都在 Pinia 里跨路由不丢，本次没有新增任何状态管道。
- 用 `role="tablist"` + 手动激活，而不是现成的 `SegmentedControl`（radiogroup）：radiogroup 的"焦点即选中"在这里等于按一次方向键就把人送进另一个页面，且焦点会随旧组件卸载丢失。标签与图标取自 `nav-model`，不抄第二份清单。不写 `aria-controls`（`/chat` 有角色时主内容区没有稳定 id，指向不存在的 id 是 axe 违规）。
- 移动端页头让位顺序：隐藏计数与返回按钮的文字（`aria-label` 保留），**保留"新建群聊"的文字**——它是这页唯一入口，不能只剩一个加号。实测 390px 下标签不再竖排、tab 高 36px、横向溢出 0。
- 新增 `tests/components/chat-mode-switch.test.ts` 6 例（当前项由路由派生、点当前项不重复导航、方向键只移焦点、Home/End、blur 后 tabindex 归位、其它按键放行）。故障注入两次：第二次暴露出**测试自己的假绿**——断言在 `router.push` 完成前就读路由，"没跳"与"还没跳完"分不清，补 `flushPromises()` 后才真正转红。
- 记录一个既有缺口（本批未改）：移动端在 `/group` 时底栏没有任何高亮项（tab 清单里没有 group），页头这一段现在承担"你在哪"的指示；底栏要不要给非跳转态的标记属于 N 层下一个决定，会撞 `mobile-layout.spec.ts:63` 的"高亮唯一"契约。
- 全量：单测 **3810 passed / 3 skipped**（178 文件），E2E msedge **61**、webkit **16**、mobile **14** passed，build 与 9 项静态门禁退出码 0；两个宿主视图的 axe 挂载用例 0 违规。

### 变更（UX/IA M6-b1：角色编辑器"属性"段并入 Collapse）
- `Collapse` 补上受控用法 `v-model:open`：传 `open` 即受控（点击只发 `update:open`，组件不自己翻面），不传维持原非受控行为——三处设置页既有用法一行没改。动机是角色编辑器有三处**从外部改展开态**，只有 `defaultOpen` 写不进去。
- 删掉 `CharacterEditorView` 自写的那套折叠（`aria-expanded` 按钮 + `v-show` 面板，缺 `aria-controls`、标题不是 `<hN>`），换成 `<Collapse :level="3" plain v-model:open>`；段标题从动词式两键"收起属性详情/展开属性详情"改成一键名词 `charEdit.attrDetails`（展开态由 `aria-expanded` 与箭头表达，不该占两个文案键）；随之删除 4 条只服务旧写法的私有样式。
- 实测发现并登记为缺口：三处外部写点里"加一条属性时强制展开"**在真实交互里到不了**——那颗按钮就在面板内，收起时不可见点不到（`addStatVisible: false`）。这行赋值是死代码，本批保留但没算作受控用法的动机；真正的动机是开关联动展开与"切换角色时归零展开态"（路由参数变化不重挂载视图，非受控就归不了零）。
- 测试：`tests/components/collapse.test.ts` 10 → 13 例（受控时"外部说收起就是收起，点一下只发事件不偷改"、"外部改展开界面跟着变"、"不传 open 仍走非受控"）。
- 全量：单测 **3813 passed**（178 文件），E2E msedge **61**、mobile **14** passed；六条走"新建角色 → 完整表单 → 名称/设定/保存"的用例未改即通过（`#f-name`/`#f-desc`/`.header-btn.save`/`.editor-body` 四个硬选择器全部保住）。浏览器实测：开关打开→面板自动展开、点段标题→收起、`aria-controls` 指向的 id 真实存在、标题为 `H3`、收起后控件仍在 DOM 且 `display:none`。

### 新增（UX/IA M6-c：E11 随机事件注入回显，最后一条未覆盖边）
- 助手气泡底部新增一句"本轮带入 N 条随机事件"，展开列事件名 + 一个跳 `/random-events`（带来源、可回）的去处。25 条依赖边到此 **A 17 · 撤下 4 · 声明 4 · 未覆盖 0**，与 §四 的口径目标对齐。
- 痕迹必须在组装提示词那一刻抓：事件表**不落盘**（`stores/events.ts` 注明仅内存维护），随机事件的 `results` 是"生成"历史、全局环形缓冲、没有 chatId/messageId/eventId，事后无从回推"这条回复当时带了哪条事件"。做法与 `promptTrace` 完全同构。
- 六处一条数据流：`chat-context` 在注入文本算完之后另存结构化 `activatedEvents`（顺序关键——`scanAndApplyTriggers` 会就地改事件状态）；新增 `core/event-trace.ts` 裁剪视图（**不含 description**，`sceneName` 为 null 时字段整个不写）；`UIMessage` 与持久化的 `ChatMessage` 各加一个可选字段（按 `schema-contract` 的"新增可选字段沿用当前版本"→ **零迁移**，两个 schema 门禁都不必动）；`type-adapters` 两个方向各加一行（漏一边就静默丢字段，E02 教训的同族）；`chat-generation` 三处写回（发送写、重新生成前清、重新生成后重算——该路径 `allowEventTrigger=false` 但已激活事件仍会注入）。
- 顺带修掉一个潜伏错：`ChatMain` 的消息 `v-memo` 依赖里**没有 `msg.promptTrace`**（E02 留下）。目前无害（痕迹与正文同拍写入），但任何"只改痕迹不改正文"的字段都不会重渲染；这次一并补上两个痕迹字段。
- 新增 14 例：`tests/core/event-trace.test.ts`（6，含"序列化结果不含事件正文"）、`tests/stores/chat-event-trace.test.ts`（4，含三条负向对照：无激活事件不写字段、`completed` 事件不算注入、属于别的书不算注入）、`tests/components/event-trace-summary.test.ts`（4）。故障注入一次跑两处（视图带上正文 / 不写回响应式消息），失败签名不同可分别归因。
- 全量：单测 **3827 passed / 3 skipped**（181 文件），E2E msedge **61**、webkit **16**、mobile **14** passed，build 与 9 项静态门禁退出码 0。msedge 第一轮有 1 条 `ux-gap-visibility` E19 失败（`char-tracked` 计数 0），单跑两次均通过、且在 M4-b2 全量跑里以同种方式红过一次，属 O-4 同族干扰，未据此放宽任何断言。
- 未做（诚实边界）：没有浏览器级 e2e 走通真实生成链路（事件是"上一轮生成、下一轮注入"，打桩端点需按请求分流，还要把场景名配成与角色名完全一致并拉满概率），本批覆盖停在 store + 组件两层；回显只报"注入了"不报"模型采纳了"；`severity`/`category` 不在 `StoryEvent` 上，故回显条不显示严重度。

### 变更（UX/IA M6-b2：角色编辑器 8 个字段块接进 `FormField`）
- 名称、标签、描述、性格设定、初始场景、绑定 API Profile、职业、作者笔记八块改由 `FormField` 生成标签/说明/报错并回填 `aria-describedby`。改造前这八块只靠视觉相邻表达归属：**说明一条都没和控件建立关系**（旧 `.field-hint` 源码 12 处，零 `aria-describedby`），报错只有 6 处手写 `err-*` 指向且不能与说明同时挂上。实测（Edge 无头，与代码同版本）：默认态 5 条说明 **5/5 被指到**、悬空 `<label>` 2 → **0**（打开属性段后 17 个 label 全部有效）、`#f-name` 的 `aria-describedby` 指向那条 `role="alert"` 的报错段。
- 必填改成双表达：星号 `aria-hidden="true"` + 一句 `sr-only` 的"必填"，DOM 原生 `required` 保留（保存判据与浏览器自带提示都依赖它）。
- 两处悬空 label（`渐变预设`、`属性组`）下面各是一排按钮而非单个控件，配 `for` 是撒谎，改成 `<p id="f-*-label" class="field-label">` + 消费端 `role="group" aria-labelledby`（实测该组合 5 处）。
- 一处刻意的视觉改动：`FormField` 标签是 13px/600/`--foreground`，本视图手写 `.field-label` 是 12px/500/`--muted-foreground`，只接八块会让同页出现两套粗细并排。故把本视图 scoped 的 `.field-label` 与 `.field-hint` 对齐到原语刻度（11px → 12px），改后实测 8 个未接原语的标签计算值全部为 `13px|600|rgb(245,245,247)`，与 `.form-field-label` 一致；对比度门禁扫描数不变（121）。
- 剩 8 块没接的原因写清楚：温度与作者深度的标签里嵌着实时数值徽章，`FormField` 只有 `labelKey`、没有标签后缀插槽——登记为原语缺口，本批不动原语。
- 测试：新增 `tests/views/character-editor-field-wiring.test.ts`（5 例）。这批收益 axe 查不到（它不验"说明有没有被指到"），所以直接钉结构。故障注入一次跑两处（删一条 `:aria-describedby` / 把 `aria-labelledby` 指向不存在的 id）→ 第 1、第 4 例分别转红，撤销后复绿。踩到一次**假红**：分组标签最初一条用例同时断言两处，而夹具里 seraphina 的 `avatarType` 是 `image`、渐变那块 `v-if` 根本不渲染——按"对照必须在夹具里可达"拆成两条，各用真实交互驱动（开属性开关 / 点"渐变色"按钮），并顺手把"切之前不存在"也断下来。
- 全量：`build`、`lint`(0 error)、`i18n:check:strict`(206 文件)、`check:css-conventions`(5/5)、`a11y:contrast`(121/131) + 自检、`snapshot:migration:check`、`runtime:db:schema:check`、`check:csp`、`check:ort`、`eval:manifest` 退出码均 **0**（manifest 只改 `commit`/`ranAt` 的重写已撤销，未混进提交）；单测 **3832 passed / 3 skipped**（182 文件，较 M6-c 增 1 文件 5 例），E2E msedge **61 passed** 且未改任何选择器。两条"建议下调基线"（`!important` 26 → 24、对比度 131 → 121）本批未动：已核对本批 diff 一行 `!important` 都没删，余量不属于本批就留给做出收敛的那一批下调。
- 顺带量到一个**不属于本批的排版缺陷**并登记：视口 ≤1024px 时编辑器切单列，`实时预览` 侧栏 `order:-1` 排到表单上方，但其网格行轨只有 34px、盒子自身高 407px，表单压在预览卡上（1000px 实测 preview `[136,76,836,407]` vs fieldset `[136,134,836,725]`，390px 同型）。本批只在真实浏览器复现并记坐标，未修。

### 新增（UX/IA M6-d：E11 的浏览器级 e2e，把"上一轮生成、下一轮注入"走通）
- `e2e/ux-event-trace.spec.ts`：补上 M6-c 自己登记的那条未做。打桩端点**按请求分流**——请求体含 `buildRandomEventMessages` 的 system 文案"RPG 事件生成器"就回事件 JSON，否则回聊天的 SSE。全程走真实界面：设置页配 mock Profile → IndexedDB 造一本全局世界书 → 随机事件页开生成器并把 `defaultProbability` 拉到 100 → 第一轮生成事件 → 客户端跳到随机事件页看结果卡 → 跳回对话发第二轮 → 断言回显出现、展开列事件名、跳 `/random-events?from=/chat`、IndexedDB 里真的写进 `eventTrace`、刷新后回显仍在。
- 用例形状由三个事实决定（都写进文件头注释）：事件表不落盘 ⇒ 第一轮之后一律客户端跳转，任何 `page.goto` 都会抹掉事件；生成的事件挂在 `lorebooks[0].id` 上 ⇒ 必须先造一本全局书，否则失败点离原因很远；`templates` 默认为空 ⇒ 决策走"无候选 ⇒ `defaultProbability`"分支，概率拉满才没有 `Math.random()` 的不确定性。
- 新增 `waitGeneratorConfigPersisted`：`updateGeneratorConfig` 里是 `void persistNow()`，点完保存就整页跳转会读到默认配置，故轮询 IndexedDB 快照 `random-events:store:v1` 直到 `enabled===true && defaultProbability===100` 才放行（M2-b8 那个老坑换了个位置）。
- 负向对照与断言分离：第一轮气泡 `toHaveCount(0)`（事件当轮提示词组装完才生成）、回显列表**不含事件正文**。故障注入三处、失败签名互不重叠：A 换掉分流标记 → 红在结果卡；B `liveMsg.eventTrace = undefined` → 红在回显可见性而结果卡仍绿；C `EventTraceSummary` 的 `v-if` 改恒真 → 红在第一轮的负向对照。三处撤销后复绿。
- `playwright.config.ts` 把该 spec 加进 webkit 的 `testMatch`（与 `ux-prompt-trace` 同族链路，Safari 内核需实测一次）。
- **撞上并登记一个真缺陷（设计文档 §七 #21）**：世界书"事件"面板是**死路**——新建事件后逐字段输入一个都存不进去。`stores/events.ts:updateEvent` 每次都拿合并后的整条事件跑 `validateEvent`，而新事件 `name`/`description`/`keywords` 三样全空，任何单字段更新都被另外两样的"不能为空"顶回（store 层实测：三次更新全 `false`，最终三字段仍为空）。界面上输入框是 `:value` 单向绑定，字看着还在、模型里是空的，同时每敲一个字弹一次红 toast。修法要把"完整性错误"与"取值错误"拆开，牵动 `core/event-types.ts` + `stores/events.ts` + 既有 12 例（其夹具正是"一次 patch 三个字段"才绕开了这个坑），故另起一批，未在本批顺手改。
- 全量：E2E msedge **62 passed**、webkit **17 passed**、mobile 两 project **14 passed**；`npm run build`（vue-tsc 覆盖 e2e）与 `lint`（0 error）退出码 0。本批未动 `src/` 运行时，其余静态门禁随 M6-b2 同版本跑过。

### 变更（UX/IA M6-e：群聊页头的"成员 Runtime 检视"段折叠）
- `GroupChatView` 页头原本七件事平铺，其中成员级 Runtime 检视（下拉 + `RuntimeStatePanel`）实测占 **94px / 页头 234px**，却既不参与任何一轮生成、也不改变群聊怎么说话。整段包进 `<Collapse :level="3" :advanced="true" :default-open="false" plain>`，沿用 M4-b2 给设置页定的两条规矩：`v-show` 收起（选了一半的检视成员不丢）、说明文字放在面板外。
- 同一夹具同一视口实测：页头 **234 → 172px**、消息可视区 **452 → 513px（+13.5%）**；收起时下拉仍在 DOM、`aria-expanded=false`，展开后 `#group-runtime-member` 高 32px。展开态 301px 比改前高，是折叠段自身标题与说明行的代价，只在主动排障时出现。
- 两条硬约束显式守住：`tests/services/status-hud-p1.qa-independent.test.ts` 读的是 `GroupChatView.vue` **源文本**（恰好一个 `<StatusHud`、含 `ms.status`、要有 `v-for="ms in memberStatuses"` / `resolveLatestStatus` / `onStatus` 写回），故成员状态条与生成回路一行都没往外提；`messages-area` 不提取（`long-history-scroll` 与群聊 e2e 依赖该选择器）。
- 群聊弹窗**没有**铺 `FormField`，原因写清楚而不是漏掉：两个弹窗的字段本就用的配对 `<label for>`，剩下的两条 `.form-hint` 是**弹窗级**说明（描述整个成员选择器 / 整个模板网格），挂到某个控件上是撒谎；正确做法是给 `Modal` 加 `describedBy`，属原语扩展，登记未做。
- 新增 `tests/views/group-runtime-inspect-collapse.test.ts`（4 例：默认收起且下拉在 DOM、点标题展开、说明与"高级"标记在面板外、段标题是 `h3`）。故障注入 `:default-open=true` → 前三例分别转红且签名不同，`h3` 那例仍绿（正交）；撤销后复绿。
- 双语各新增 2 键（`group.runtimeInspectTitle` / `Hint`）。全量：单测 **183 files / 3836 passed / 3 skipped**，E2E msedge **62**、webkit **17**、mobile **14** passed，`build` / `lint`(0 error) / `i18n:check[:strict]` / `check:css-conventions`(5/5) / `a11y:contrast`(121) 退出码 0；群聊 axe 与读源文本那条 QA 用例未改即通过。截图 `docs/dev/evidence/ux-ia-guided-flow/m6-e-group-header/`（改前 / 收起 / 展开三张）。

### 修复（UX/IA M6-f：世界书"事件"面板配不出任何事件，§七 #21 结案）
- `validateEvent` 拆成两类：`validateEventValues`（取值错误——名称超 50、描述超 2000、概率越界、正则非法，**拦写入**）与 `validateEventCompleteness`（完整性错误——名称/描述为空、关键词型没关键词、依赖型没前置，**拦激活**）；`validateEvent` 保留为两者并集，既有调用方语义不变。根因是 `updateEvent` 拿合并后的整条事件跑并集校验，而新建事件三样必填全空，任何单字段更新都被另外两样的"不能为空"顶回——面板输入框又是 `:value` 单向绑定，字看着还在、store 里是空的。
- `triggerEvent` 补查完整性（自动触发路径 `chat-context` 也走它，所以配不全的事件既不会激活也不会被注入提示词）。
- `updateEvent` 加第三个参数 `{ silent }`，面板 12 处字段写入统一静默：死路修好后若不管，逐字段输入会**每敲一个字弹一条"已更新"**（事件名还空着时显示成"已更新 "）。离散动作（新建/触发/完成/删除）照旧有反馈。
- 改写 4 条既有用例（钉的正是这个坑，不是放宽）：`updateEvent(name → '')` 从"返回 false"改为"能存进去、但这条事件随即不能激活"；三条 `triggerEvent`/`completeEvent` 原本用裸 `createEvent` 当夹具，改用 `createValidEvent`，让被测的状态前提不被完整性串扰。新增 `tests/core/event-types.test.ts` 12 例（含 50/2000 字与概率 0/100 边界"拆分没挪位"、`validateEvent` 仍是并集）、`tests/components/worldbook-events-panel-edit.test.ts` 4 例（逐字段输入真存得进去、编辑不弹提示、没填全点触发被拒且逐条说缺什么、填全后同一按钮能激活）。
- 新增 `e2e/ux-event-manual-trace.spec.ts`：在世界书面板逐字段配一条全局关键词事件 → 先发不含关键词的消息（负向对照，本轮无回显）→ 再发含关键词的，**同一轮触发并同一轮注入** → 断言回显、事件名、跳 `/random-events?from=/chat`。与 M6-d 的"生成器 → 下一轮注入"是两条不同路径；已加入 webkit `testMatch`。
- 未做（**其中一句已被 M7-b 在真实浏览器里量证为错**）：原写"`:value` 单向绑定在取值错误路径上仍会字看着还在、store 是旧值（粘贴超长描述会被拒但输入框不回退）"——名称与描述都有 `maxlength`、概率是带 `min/max` 的 range，三条都到不了被拒；唯一能拒的是"使用正则 + 非法表达式"，而真实现象是**刚打的字符被直接吞掉**。按纠正后的现象修，见 M7-b。世界书事件面板本批只修语义不动排版，没接 `FormField`。

### 新增（UX/IA M6-f：两个原语缺口补完，角色编辑器再转 7 块）
- `FormField` 加 `label-extra` 插槽（渲染在 `<label>` 内、必填星号之前）。这是"温度 [1.00]"、"作者深度 [4]"这类**标签里嵌实时数值**的字段此前接不进原语的唯一原因。角色编辑器因此再转 7 块：温度、最大 Tokens、作者深度、图片 URL、首字母、等级、经验值。实测：字段说明被 `aria-describedby` 指到 **5/5 → 8/8**、未接原语的 `.field .field-label` **8 → 0**、旧 `.field-hint` 残留 **5 → 2**（那两条是"属性组为空""属性未启用"的块级说明，不属于任何控件）、悬空 label 仍 0。渐变那对"起始色/结束色"没接：两个控件共用一条报错，接成两份会把同一句话重复两遍。
- `Modal` 加 `describedBy` → 对话框的 `aria-describedby`。群聊"添加成员"与"生成随机 NPC"两个弹窗开头那句话描述的是**整个对话框**，此前在无障碍树里是孤儿；实测 `[role=dialog]` 的 `aria-describedby="add-member-hint"` 且目标节点确实在对话框内、标题 `aria-labelledby` 不受影响。新增 `tests/components/modal-describes.test.ts` 2 例。
- 故障注入四处、签名互不重叠：并集校验回归 → 5 条转红；忽略 `silent` → 只红"编辑不弹已更新"；`Modal` 的 `aria-describedby` 置空 → 只红 describedBy 那条；`label-extra` 移出 `<label>` → 只红插槽位置那条。
- 一处工具性踩坑记在这里避免重犯：第一次注入把 `// 注释` 写进 Vue 模板的**属性列表**里，编译器报 `Illegal '/' in tags.`，但上一次运行的转换缓存让 vitest 仍报"通过"——一次假绿。模板文件里的注入必须写成合法语法，且"刚改完就绿"要先 `grep` 实际文件再下结论。
- 全量：单测 **185 files / 3856 passed / 3 skipped**，E2E msedge **63**、webkit **18**、mobile **14** passed；`build` / `lint`(0 error) / `i18n:check:strict` / `check:css-conventions`(5/5) / `a11y:contrast`(121) 退出码 0。截图 `docs/dev/evidence/ux-ia-guided-flow/m6-f-primitives/`。

### 变更（UX/IA M7-a：最后两个巨型视图分区，§六 的分区这条到此收口）
- 世界书页把两段"配一次就长期不动"的一次性配置收进 `Collapse`：`整体世界描述`（实测 422px）与`世界内用户资料`（921px）。同一份数据同视口对比：两段合计 **1343px → 148px**、`.editor-content` 滚动高 **2635 → 1440px**、每天要用的条目区从 **y≈1998（三屏之下）回到 y=803（首屏可见）**。
- 规则是**没填的那一段自动展开**（`:default-open="!worldDescDraft"` / `!worldUserProfileDraft"`）——把待办藏起来是反向优化；用户仍可点段标题收回。`:key` 绑世界书 id 让切书时重挂载，否则 `defaultOpen` 只在挂载时读一次、第二本书会沿用第一本的展开态。
- 为此给 `Collapse` 补 `title-extra` 插槽：这两段各带一个范围标签（"常量注入" / "仅当前世界"），它们决定用户要不要点开，必须留在触发按钮里而不是被面板一起藏掉——与 M6-f 给 `FormField` 补 `label-extra` 是同一个缺口的两半。随之删掉两处失效的 `.world-desc-header` 规则与两个只服务旧 `aria-label` 的死键（`wb.worldDescAria` / `wb.worldUserProfileAria`）。
- 故事引擎：真正的问题不是"段太多"而是**展开的卡只有 400px 宽**——`.story-grid` 是 `auto-fill minmax(360px,1fr)`，一份故事时右边一千像素全空、七段竖堆 1276px。改法两行 CSS：展开卡 `grid-column: 1 / -1` 占满整行，`@media (min-width: 1025px)`（规范断点集内的值）下 `.card-detail` 两列排布。实测 `.story-grid` **1276 → 794px（-38%）**；移动端不受影响。
- 明确不做的判断：故事卡内部七段**没有再折叠**（用户点开卡就是为了读这些提取结果，卡片本身已是折叠单元）；世界书页的`已绑定角色`（141px）与`事件`（263px）保持常驻（前者是关联入口、后者是 M6-f 刚修好的功能）。
- 新增 `tests/views/two-views-partition.test.ts`（4 例）与 `tests/components/collapse.test.ts` 的 title-extra 一例。故障注入三轮、签名不重叠：`:default-open` 恒 true → 只红"已配 → 收起"；恒 false → 红"未配 → 自动展开"与"点标题可收回"而"已配 → 收起"仍绿；删 `is-expanded` 绑定 → 只红故事卡那条。
- 全量：单测 **186 files / 3861 passed / 3 skipped**，E2E msedge **63**、webkit **18**、mobile **14** passed；`build` / `lint`(0 error) / `check:css-conventions`(5/5，断点守卫确认 1025 在规范集内) / `a11y:contrast`(121) 退出码 0。截图 `docs/dev/evidence/ux-ia-guided-flow/m7-a-two-views/`（五张：两页改前 + 世界书收起/自动展开 + 故事卡两列）。
- 顺带记录一个未修的既有问题：`.story-card.status-completed` 把标题与人名一起染成状态绿，作用范围过宽；要改需另定配色口径，本批只在截图里留下证据。

### 修复（UX/IA M7-b：事件面板"写入被拒"终于看得见，并纠正 M6-f 写错的一句现象）
- **先纠错**：M6-f 记的"`:value` 单向绑定在取值错误路径上会'字看着还在、store 是旧值'"是读代码推的、没量。真实浏览器里跑一遍结论相反：打一个非法正则的 `(`，**输入框直接变空**——字符被吞了（Vue 对 `value` 这个 prop 会拿 DOM 现值比较并写回，一次因其他属性触发的重渲染就抹掉用户输入）。设计文档与 CHANGELOG 两处都已就地改正并注明是谁量翻的。
- 核对了哪些字段真能走到"被拒"：名称 `maxlength=50`、描述 `maxlength=2000`、概率是带 `min/max` 的 `range`，三条都到不了拒绝分支；**唯一可达的是"使用正则 + 非法表达式"**。所以草稿只给关键词那一格做，其余继续直绑 store，不做用不上的通用机制。
- 三层改法：① 关键词输入框显示 `keywordText()`（草稿优先、否则回落 store 值），写入成功才清草稿，用户打的字留在框里；② 被拒字段挂 `role="status"` 的"这个值没有保存：{原因}"说明行 + `aria-invalid` + 红框，改对后自己消失（toast 只闪一次，标注是一直挂的）；③ 勾"使用正则/大小写敏感"时按**框里现在那串**写回，不按 store 里的旧数组，否则一次勾选就换个地方吞字。
- 一个特异性坑：`.is-rejected { border-color: var(--destructive) }` 单写一条看不见红——`src/styles/base.css` 的 `input[type="text"]:focus` 更高，而用户正在输入时字段恰好聚焦。实测聚焦态边框从 `rgb(37,244,238)`（主色青）变成 `rgb(234,79,83)`（红），失焦态两次都是红；补 `:focus` / `:focus-visible` 两条并在规则旁注明原因。
- 新增 3 例（值不存但字留下并说明原因 / 改对后标注消失 / 勾掉正则按草稿写回）。故障注入三处、签名不重叠：改回直绑 store → 红第一条；写入成功不清标注 → 红第二三条；撤销后 7 例复绿。双语新增 1 键 `wbEvents.saveRejected`。
- 全量：单测 **186 files / 3864 passed / 3 skipped**，E2E msedge **63**、webkit **18**、mobile **14** passed；`build` / `lint`(0 error) / `i18n:check:strict` / `check:css-conventions`(5/5) / `a11y:contrast`(121，未新增扫描对) 退出码 0。截图 `docs/dev/evidence/ux-ia-guided-flow/m7-b-reject-feedback/rejected-keyword.png`。
- 未做：名称/描述/概率三格的 `:value` 直绑仍在（当前不可达被拒路径）；没做"存不进去就不许离开该字段"的强拦截——那会把一次正则调试变成填表考试。

### 修复（UX/IA M7-c：状态色只作用于徽标与边框）
- `StoryEngineView` 的 `.status-completed` 等四条规则**不带元素限定**，而 `getStatusClass()` 同时挂在卡片根元素与徽标上，于是 `color` 从卡片一路继承——一份"已完成"的故事整张卡变绿（标题、人名、场景名全染状态色）。四条限定到 `.status-badge.status-*`，卡片本体只保留失败态那条红边框；口径写进规则注释：状态是这张卡的元信息，不是它的主题色。
- 同病扫描（全仓 grep 四个类名）：只有本视图把同一个类同时挂容器与徽标；`CharactersView` 的 `.char-card.is-busy` 走 `opacity` 不是染色，不同机制。故这条口径落完即无同类。
- 实测（Edge 无头，四张卡同页互比）：卡片与标题的 `color` 由"各等于自己的状态色"变为四张一致 `rgb(245,245,247)`；徽标色与淡底、失败态红边框不变。
- 新增 `e2e/ux-status-color.spec.ts` 作回归网，断言全部"四张卡互相比"（标题色一致、徽标色四样、失败边框独异），**不写死色号也不读 CSS 变量**，换主题或改 oklch 都不会假失败。已加入 webkit `testMatch`（scoped CSS 特异性差异最容易在第二内核显形）。
- 踩到一处时序：应用是异步开库的，紧跟首次 `goto` 之后查 `indexedDB.databases()` 可能为空，造数会取到 `undefined`；改成先 `expect.poll` 等到库出现，连跑三次稳定。故障注入：选择器改回不限定 → 红在"标题色不该随状态变"；另一次 `sed` 把 `.status-badge.status-x` 写成 `status-x`（丢点号）导致"徽标没色"，不是被验的那件事，已剔除不算数。
- 全量：单测 **186 files / 3864 passed / 3 skipped**（与 M7-b 同数，本批回归网在 e2e）；E2E msedge **64**、webkit **19**、mobile **14** passed；`build` / `lint`(0 error) / `check:css-conventions`(5/5) / `a11y:contrast`(121，未变) 退出码 0。截图 `docs/dev/evidence/ux-ia-guided-flow/m7-c-status-color/`（改前整卡染色 / 改后回到中性）。

### 新增（UX/IA M7-d：折叠态跨会话记忆）
- 补上 M7-a 留下的尾巴：排障段默认收起是对的，但"我这次特意点开"跨刷新就丢。新增 `AppSettings.uiSectionOpen?: Record<string, boolean>`（可选字段，按 `schema-contract` **零迁移**，两个 schema 门禁都不动）+ `settings.setUiSectionOpen()`（同值早退不重复写，写走 M2-b8 那条串行队列）+ `composables/useSectionMemory.ts`。
- 两种意图分清：用户点过 → 他的选择优先；从没点过 → 用调用方给的推导默认（"还没填就自动展开"、高级段"默认收起"）。**刻意不在挂载时把默认值写进存储**——一写进去，"没填自动展开"就退化成"只在新装时生效一次"。
- `Collapse` 原语一行没改：M6-b1 就有 `v-model:open` 受控用法。接上 7 个点（世界书 2、群聊页头 1、设置页高级段 3，另含 M7-a 那两段可以撤掉 `:key` 重挂载）。角色编辑器的"属性详情"段没接——它绑 `form.attributesOpen`，随表单存且切角色要归零，另一条语义。
- 浏览器实测（真刷新）：初始两段 `false` → 点开 `true` → 整页刷新仍 `true` → 再收起刷新仍 `false`；设置页「外观」的"界面自定义"展开后刷新仍 `true`。
- 新增 6 例（推导默认随数据重算 / 记忆优先于相反默认 / 写一次落盘一次且同值不重复 / 加载丢非 boolean 脏值 / 两段互不覆盖 / 视图侧跨重挂载保持）。故障注入把 getter 改成只回落到默认 → 4 例转红，其中"点段标题可收起"也红，说明**没有记忆就没有手动控制权**。
- 两处坑记下来免得重踩：① `loadFromStorage` 把"完全没有已知字段"的快照当首次启动整段跳过，夹具必须带一个它认得的字段（真机快照永远带 `theme`）；② `computed({get,set})` 的返回类型要标 `WritableComputedRef`，标 `ComputedRef` 会让调用方赋值报 TS2540。
- 全量：单测 **187 files / 3870 passed / 3 skipped**，E2E msedge **64**、webkit **19**、mobile **14** passed；`build` / `lint` / `i18n:check:strict`(207 文件) / `check:css-conventions`(5/5) / `a11y:contrast`(121) / `snapshot:migration:check` / `runtime:db:schema:check` 退出码 0。截图 `docs/dev/evidence/ux-ia-guided-flow/m7-d-section-memory/`。
- 未做：记忆是全局一份、不分世界书（开合是用户偏好不是书的内容属性；要按书分开只需把 key 拼上 `lorebookId`）；没有"恢复默认"入口。**（这两条已在 M8-b 补完）**

### 修复（UX/IA M8-a：窄屏角色编辑器的"实时预览"被表单压住）
- M6-b2 量到并登记、当时没动的那条缺陷，这次根因是**量出来的**：用"同一页只改一条 CSS"的隔离实验（每个候选开一个新 context，避免样式叠加）在 1000px / 390px 各测一遍——原样行轨 `34px`、预览盒 407px、表单顶 y=134（重叠）；只加 `height: auto` 完全无效（行轨仍 34px）；只加 `overflow: visible` 行轨变 `407.219px`、表单顶 y=507（重叠消失）。
- 机制：`.editor-preview` 带 `overflow-y: auto`，而**滚动容器没有块方向的 max-content 高度**，它在单列网格里对行轨的贡献塌成标题那一行，盒子却照旧按内容画满，于是第二行的表单叠在上面。桌面两列靠侧栏自滚看不出问题，只有 ≤1024px 切单列才暴露。
- 改法一行：断点内补 `overflow: visible`，并把机制与实测数字写进规则注释，免得下一个人又去试 `height: auto`。
- 新增 `e2e/ux-narrow-editor-preview.spec.ts` 5 例（jsdom 不做布局，只能浏览器级）：390 / 640 / 1000 / 1024 四档断言"预览高度 > 300 且表单顶 ≥ 预览底"，另加 1280px"仍是两列侧栏、`overflow-y` 仍为 `auto`"防止把桌面端一起改掉。已加入 webkit `testMatch`。
- 故障注入：删掉那一行 → 四个窄档全红（红在重叠断言）、1280px 那条仍绿；补回后 5 例复绿。多宽度实测 390/640/800/1000/1024 全部无重叠，1100/1440 保持两列。
- 全量：E2E msedge **69**、webkit **24**、mobile **14** passed（Safari 对块方向 intrinsic sizing 的结论与 Chromium 一致）；`build` / `lint`(0 error) / `check:css-conventions`(5/5) / `a11y:contrast`(121) 退出码 0。截图 `docs/dev/evidence/ux-ia-guided-flow/m8-a-preview-overlap/`。
- 未做：没顺手给预览卡在窄屏做折叠（它 407px 摆在表单上方会占掉窄屏首屏，收不收起是信息架构决定，本批只修"重叠"这个明确缺陷）。

### 新增（UX/IA M8-b：开合记忆按实体分开 + "恢复默认"出口）
- M7-d 的键是固定的 `wb.worldDesc`，于是"在 A 书特意收起"会跟着到 B 书——而 B 书可能还没填、本该自动展开：规则被另一本书的随手一点顶掉。现在**描述实体的段**（世界书两段、群聊 Runtime 检视）把实体 id 拼进 key，**与实体无关的段**（设置页三处）保持全局。`useSectionMemory` 的 key 放宽成 `MaybeRefOrGetter<string>`，视图侧传 `() => \`wb.worldDesc:${currentLorebook.value?.id ?? ''}\``。
- 记忆优先之后，一次误点会让某段永远停在随手留下的状态且无处退回。设置 → 外观 → 界面自定义 末尾加"界面开合状态"一行：说清当前记了几条（不是"若干条"这种含糊话）、一条都没记时按钮不可点、点一下清空并回报清了几条。`settings.resetUiSectionOpen()` 返回条数，本来为空则返回 0 且不写盘。双语新增 5 键。
- 新增 5 例（`tests/components/appearance-section-memory.test.ts` 2、composable 侧 2、视图侧按书分开 1），并把 M7-d 那条"跨重挂载保持"改成按同一本书测。浏览器实测：书甲收起 → 切到书乙两段仍自动展开 → 切回书甲保持收起；设置页恢复前"当前共 1 条"可点，恢复后变空态文案且按钮 disabled。
- 故障注入三处、签名不重叠：`:disabled` 恒 false → 只红"空态不可点"；`resetUiSectionOpen` 不清空 → 红"点一下清空"；世界书 key 退回固定串 → 只红"按书分开"。
- 全量：单测 **188 files / 3875 passed / 3 skipped**，E2E msedge **69**、webkit **24**、mobile **14** passed；`build` / `lint`(0 error) / `i18n:check:strict`(207 文件) / `check:css-conventions`(5/5) / `a11y:contrast`(121) 退出码 0。截图 `docs/dev/evidence/ux-ia-guided-flow/m8-b-section-memory-per-entity/`。
- 未做：删书/删群不清理其记忆键（留的是几条 boolean，代价可忽略）；出口只有整体清空，没有"单独恢复某一段"；角色编辑器"属性详情"段仍未接记忆（语义不同）。

### 新增（UX/IA M8-c：对话框"这是在干什么"接进无障碍树）
- M6-f 加的 `Modal.describedBy` 只接了群聊两处，其余弹窗开头那句解释整个对话框的话（"确定要删除角色「X」吗"、"会一并删掉全部对话历史"、"三步就能聊起来"）读屏念不到——进窗只报标题，而标题是动作名、不带后果，用户只能靠猜。本批铺到 **20 处静态引用 / 23 条 id / 13 个文件**：角色列表与编辑器的删除+未保存、世界书删除与 AI 生成、故事删除、数据银行删除、图片删除与清空、版本提交与冲突、群聊删除、消息删除、审计清空、模型档位删除、主密码、首启欢迎窗。
- 口径：只接"这个对话框在干什么 / 按下会发生什么"那一句；字段级提示仍走 `FormField` 自己的 `describedBy`，两者混用会让读屏把某个框的填法当成整窗说明。
- 两层守卫：`tests/accessibility/modal-describedby-wired.test.ts`（静态 5 条：引用数与接入文件数不倒退、id 有定义、定义唯一、定义落在同一个 `<Modal>` 块内、引用只挂在 `<Modal>` 上；扫描跳过 `:described-by`，否则 `FormField` 的插槽绑定会凭空造出悬空引用）+ `e2e/ux-modal-describedby.spec.ts`（运行时 4 例，静态守卫看不见的 `v-if` 说明段落只能在浏览器里验）。
- 故障注入六处、签名不重叠：改 id → 红"悬空"；挂到 `<p>` → 红"只应挂在 Modal"；删掉群聊 3 处 → 红"数量下限"；引用挪到同文件另一个 Modal → 红"说明不在本 Modal 内"；Modal 外再造同名 id → 红"全应用唯一"；运行时把引用改成不存在的 id → e2e 报错（证明它不是空转）。
- 浏览器实测：欢迎窗 / 未保存确认 / 列表删除确认（含 `v-if` 那句）/ 世界书删除确认四个弹窗逐个点开，`aria-describedby` 全部解析到框内真实文字。全量：单测 **189 files / 3880 passed / 3 skipped**，E2E msedge **73**、webkit **28**（本批 4 例已进 Safari 内核清单）、mobile **14** passed；`build` / `lint`(0 error) / `i18n:check:strict`(207 文件) / `check:css-conventions`(5/5) / `a11y:contrast`(121) / 两个 schema 门禁 / `eval:manifest` / `check:csp` / `check:ort` 退出码 0。截图 `docs/dev/evidence/ux-ia-guided-flow/m8-c-describedby/`。
- 顺带量到一条与 M8-c 无关的门禁问题：e2e 全量跑在默认并发下不稳定（msedge 72/73、webkit 25–26/28，失败点每次不同，单跑全绿；压到 `--workers=2` / `--workers=1` 后分别 73/73、28/28 全绿）。属既有用例对负载敏感，不是本批回归，修法（把并发上限写进 `playwright.config.ts`）登记待办。
- 未做：20 处引用只有 4 处在真浏览器里点开验过，其余靠静态守卫（风险点收窄到"带 `v-if` 的说明"，全量扫下来仅 3 处，其中 1 处已浏览器验）；世界书两个弹窗未进 e2e（三步流程的"完成"要先有角色，空 profile 走不到，改用"创建新世界书"按钮已在证据脚本跑通）；未清理既有的重复可访问名（同页三处「取消」、9 处 `id="main-content"`、3 处 `panel-settings`）。

### 移除（UX/IA M2-b1：撤掉四条"配了没反应"的控件）
- 世界书条目级"随机事件"开关与概率滑杆（字段 `lorebook.entry.randomEventEnabled/randomEventProbability` 在运行时零读取）、随机事件生成器的"绑定世界书"下拉（`generatorConfig.boundWorldBookId` 有写无读）、故事详情页的"关联世界书"下拉与已绑显示（`story.boundWorldBookId` 运行时零读取）、数据银行"聊天级文档"分区（该分区依赖 `chatDocuments`，而上传对话框只有全局/角色两档且检索管线硬编码 `scope='character'`，属三重不可达面板）。
- 控件面：世界书 61 → 59、随机事件 22 → 21、故事 43 → 42、数据银行 19 → 17；四个文件合计减少 261 行；`stores/data-bank.ts` 的 `chatDocuments` getter 一并撤除。
- 数据字段暂留（已有用户数据带值），撤除需迁移脚本，排期见设计文档 §七；未顺手加回"聊天级文档"单选，以免再造一条"有 UI 无读者"的控件。
- 双语同步删除因此彻底无引用的 18 个 i18n 键（`wb.randomEvent*`、`re.bind*`、`story.bind*` 等），两文件各 3289 → 3271 行；`tests/stores/data-bank.test.ts` 的两处断言改为等价的 `documents.filter(scope==='chat')`，保留数据层覆盖。

### 新增
- 全局 Toast 提示服务（`src/utils/toast-service.ts`），为拆分后的设置分区子组件提供跨组件提示能力。
- 设置页 5 个分区子组件：`SettingsAboutPanel` / `SettingsAppearancePanel` / `SettingsDataPanel` / `SettingsExtensionPanel` / `SettingsSecurityPanel`。
- 创作预设 UI 补全与角色卡预设绑定（`boundPresetId`），预设与正则规则可落到具体角色。
- 群聊历史消息游标分页：「加载更早消息」按需拉取，替代一次性全量载入。
- 离线评测闭环 EVAL-01/02/03：`scripts/eval-run.mjs` + `eval/setting-facts-dataset.v1.json`（带 sha256 数据集版本）+ `docs/dev/eval-manifest.json` 证据落盘。
- `check:ort` 首屏守卫：断言构建产物、入口静态可达依赖图与 `index.html` 中均不含 onnxruntime。
- LLM 请求重试、统一日志与观测、快照迁移报告（2026-09-28 审查首轮落地）。

### 变更
- `src/stores/chat.ts` 由 2587 行拆为 5 个专职子 store（`chat-session` / `chat-memory` / `chat-runtime` / `chat-group-runtime` / `chat-generation`）+ 136 行兼容层，兼容层保留原有 54 个导出符号的 API 形状。
- `src/views/SettingsView.vue` 由 4130 行降至 688 行；主密码弹窗共享态提升为 `src/utils/master-password-modal-state.ts`，避免安全区与数据区状态分叉。
- onnxruntime 退出首屏构建 chunk 图（改为 `scripts/vendor-ort.mjs` 外部化到 `public/vendor/ort/`）：首屏传输 551KB → 447KB；第三轮新增分区组件后回升至 454KB（+7KB）。
- CI `Quality Gates` 增补 3 项门禁（14 步 → 17 步）：`snapshot:migration:check` 快照迁移自洽、`eval:manifest` 评测判定链离线自检、`check:ort` 首屏隔离守卫。三者此前只在本地证据包执行，流水线无护栏。
- 移除 `tauri-plugin-fs` 与 `tauri-plugin-dialog`（Rust `Cargo.toml` 与 npm `dependencies` 两侧），目录选择改用已在依赖树中的 `rfd`；`read_model_file` / `read_model_by_id` 走 Tauri 二进制 IPC（`ipc::Response`），避免数十 MB 的 ONNX 权重被序列化成 JSON 数字数组。新增 `tests/core/model-fs-ipc.test.ts` 12 项覆盖命令名、参数名与二进制返回形态归一化契约。

### 修复
- 修正 Web 端已安装向量模型的枚举路径，兼容当前与历史 IndexedDB 键格式，确保自动择优能发现已导入模型。
- 自定义主题应用前增加关键颜色组合的运行时对比度预检，低于可读标准时阻止应用并提示原因。
- 同步锁文件依赖补丁（`brace-expansion` 1.1.21/2.1.7/5.0.12、`fast-uri` 3.1.8、前端实际使用的 `dompurify` 3.4.16），清除 `npm audit --audit-level=high` 命中的 2 条 high 与 1 条 low 公告；该门禁失败会跳过后续所有质量检查步骤。
- 群聊「加载更早消息」按钮的 hover 态改按设备能力分流，消除触屏设备上的粘滞高亮，通过触屏 hover 守卫。
- 修复桌面端「导入本地向量模型」长期不可用：前端直连 `tauri-plugin-fs` / `tauri-plugin-dialog`，而 `capabilities/default.json` 只授予 `core:default`（P1-5 权限收敛），插件生成的 IPC 命令被 ACL 拒绝。现改由自定义 Rust 命令提供目录对话框与模型文件读写（`src-tauri/src/commands/model_files.rs`，7 个命令），webview 权限面保持不变。路径白名单在 Rust 侧校验（项目 `model/`、`appData/model`、本次会话用户选中的目录），先 canonicalize 再比前缀以阻断 `..` 穿越。

### 文档
- 回写 RAG 增强实现状态，并将路线图中的 RAG 与自定义主题无障碍项目标记为已完成。
- 新增 `docs/dev/REAL_DEVICE_TEST_2026-10-03.md`：Web 端与移动仿真通道的实机分批测试记录（B0–B21 二十二个批次，含模块划分依据、每批目标与验收标准、逐条证据、缺陷清单 D-1~D-11 与遗留项 L-1~L-15 / 观察项 O-1~O-24）。B10 为追加的"长历史专项"：以 IndexedDB 造数（0 模型消耗）实测群聊 150 条游标分页与单聊 320 条双向窗口化，确认页大小算术、`scrollTop` 补偿（10788 vs 理论 10788.7）、DOM 上限（恒 2×`RENDER_WINDOW`）与窗口外全文搜索均成立，同时暴露两项仅真实浏览器可复现的 P2 缺陷 —— D-5 打开长群聊落在列表中部、D-6 单聊顶部占位高度重复累加。B11 补测"入口级≠行为级"的三项：群聊归档只读语义（发消息被 store 层拒绝，但控件未表达只读态 ⇒ O-12）、单聊"回到底部"精确落底、F07 用户 Persona 确认已下线且残留 4 处待清理（⇒ O-13）。B12 把会话行的四个动作打到行为层：置顶双向可逆且按钮文案随状态翻转、删除走"确认删除/取消"两步且只删目标会话、新建为懒创建草稿；**归档被证实是空操作 —— `chat-session.ts` 写入 `archived` 后全仓无消费者（D-7）**，同时记录页按设计只索引群聊却命名"对话记录"（O-17）、时间显示为原始 ISO 并溢出压住操作按钮（O-18）。B13 把每条路由的主动作按遍（仍 0 模型调用）：`/profile` 登录降级提示可关闭、`/character` 收藏落库 + 导出 SillyTavern V2 JSON（personality / scenario 完整，反证 D-3 仅在版本快照构造处）+ 导入往返不覆盖同名、`/databank` 删除有确认模态；新发现两项 P2 —— **D-8 "展开分块"按钮与父级 `.card-header` 重复绑定同一 toggle，冒泡后开→关抵消导致按钮失效**、**D-9 随机事件模板/场景/结果完全只在内存（`stores/random-events.ts` 无任何持久化调用，备份也不纳入），刷新即丢**；同时修正 B4 对随机事件的过早"通过"结论，并把社区市场的"下载需登录 + 登录不可用 + 远程 404"合并为获取链路端到端不可达。B14 追查朗读链路：设置→扩展的 TTS 开关与触发条件确实写入 `settings.ttsConfig` 并跨刷新保持，启用后拦截到 `speechSynthesis.speak` 携带正确文本与语速/音调（朗读功能本身正常），此前"点了没反应"的真相是**未启用时静默无效，而同面板的翻译在未启用时会明确提示**（O-9 定性为反馈不对称，并补记播放中无"停止"态、`utterance.lang` 为空）。B15 追世界书注入链路：条目编辑"输入即写"落库、角色绑定持久化在 `characters.ext.boundWorldBookIds`（刷新后仍在）、上下文面板正确显示"1 本 / 1 条启用"；端到端注入因 AC20 锁定态无法观测，并由此暴露 **D-10 —— 锁定态把"密钥未解锁"报成"未配置 API Profile"，与同页头部显示的模型名自相矛盾，且用户已输入的正文随内存会话丢失**。B16 用一次性 Playwright 探针（Pixel 5 仿真，跑完即删，避免把缺陷现状固化成绿灯用例）补移动通道：三页在 393px 溢出均为 0、`/profile` 登录降级与 `/databank` 删除确认可用、D-8 在移动端同样复现，并暴露 **D-11 —— 底栏只有 5 项且 NavRail 在 ≤640 卸载，导致数据银行 / 记录 / 故事引擎 / 随机事件 / 图像生成 / 版本管理 / 个人中心这 7 个页面在手机上没有任何 UI 入口**。B17 闭环故事引擎（L-4）：导入弹窗的 6 个分类计数与 `story.worldInfo` / 实体数组完全一致（据此排除了"分析完成却丢数据"的误判），选定目标后如实报告「全部导入完成：0 项成功」且不改写世界书，设置主角表单完整并在无场景时正确提示；仅"未选目标点执行导入"完全静默（O-19）。同时把依赖真实 LLM 的正向链路（一键生成、图像生成出图、世界书端到端注入）如实记为 L-13 —— 本会话后半程 AC20 锁定态使所有发送在本地即被拦下，解锁需要未记录的主密码，不用离线断言冒充实机通过。B18 普查设置开关的落地后端：11 个面板 checkbox 全部归位，数据面板优化区（总开关 / L0 / L1 / L2）确实写入 `localStorage['ai-roleplay:optimization-config']` 且可复位（排除了"内存态"误判），`audit-log` 中的 `backup_export:ok` 反向印证备份导出计数；新记两项 P3 —— **O-20 优化开关 toast 把内部字段名 `l0Enabled` 直接暴露给用户**、**O-21 localStorage 同时使用 `ai-roleplay:` 与 `aijiuguan.` 两套前缀，清理与迁移易漏**。
- 回写第三轮失真记录：轮次总览状态改为已完成、"仅本地提交不推送"约束与实际推送策略对齐并留痕、超大文件计数按实测修正（>2000 行 7 个，排除 i18n 语言包为 5 个代码文件）、设计文档"10 个子组件"与实际新增 5 个分区的偏差说明。
- 重新生成 `docs/dev/PROJECT_INDEX.md`（收录 `chat-*` 子 store、`toast-service`、`vendor-ort` 等），并更新 `QUICK_START.md` 的基线指标至 `b0adc0f`。
- 实机报告追加 B20：驱动上下文面板的角色级参数 —— 作者笔记落库为 `characterNote.text`（UI 侧字段名是 `authorNote`，跨刷新实测可找回，命名不一致是易误报点）、温度写入 `characters.ext.temperature` 且可复位、状态指令分段控件写 `ext.statusInstruction` 并在选"继承全局"时干净移除该键；创作模式与 Top P / 频率惩罚的逐项验证记为 L-14，真机上 D-11 的影响面记为 L-15。B21 验完五处列表筛选与搜索：角色搜索 5→1→5、标签筛选、数据银行不匹配词确实清空列表、记录页关键词与开始日期联动计数并有标准空态、市场排序与分类均生效，过滤逻辑全部正确；唯一新观察 O-24 —— 数据银行无结果时不给任何空态提示（同项目记录页已有"无匹配记录 + 清除筛选"的成熟做法，属可直接对齐的一致性问题）。

## [0.9.0] - 2026-09-27

### 变更
- **统一本地用户**：个人中心只保留一个本地用户入口，不再把 Persona 列表作为当前身份或登录身份。
- **世界内扮演资料**：昵称、描述、性别、代称、年龄、职业、外貌、背景和备注继续由每本世界书单独保存，并按当前角色关联的世界注入上下文。
- **故事角色边界**：故事主角仍作为故事内容参与提示词，但保存或编辑主角不会创建、切换或激活全局 Persona。
- **导出一致性**：聊天 Markdown 导出使用当前角色对应世界的用户昵称，没有资料时回落为 `User`。

### 兼容
- 旧 Persona 类型、存储接口和备份字段继续保留，用于读取旧快照和旧备份；0.9.0 的聊天上下文、个人中心和故事流程不再读取它们作为用户身份。
- 旧世界书没有用户资料时保持中性默认值，不影响已有角色卡、聊天记录和 Runtime 数据。

## [0.8.0] - 2026-09-27

### 新增
- **Runtime 记忆审核**：事件自动生成的记忆以候选状态保存；只有确认后的记忆会进入对话上下文，可在 Runtime 状态面板查看内容、置信度和来源事件，并确认、拒绝或停用。
- **可回放审核事件**：记忆审核写入 Runtime Event 与 StateChange；稳定事件 ID 支持请求重试幂等，审核变化可由事件流重放恢复。
- **审核状态持久化**：PostgreSQL 增加审核状态和时间字段；旧数据迁移默认为已确认，兼容原有记忆注入行为。

### 强化
- Runtime 上下文忽略待确认、已拒绝和已停用记忆；角色状态面板提供单聊与群聊共用审核入口。
- Runtime Replay 自检从角色初始状态重建，纳入审核事件，不沿用当前记忆列表作为回放起点。
- 服务端审核请求使用绑定租户覆盖客户端提交值，继续经过现有认证与成员授权检查。
- 通用事件接口拒绝直接提交记忆审核 effects，避免绕过专用审核授权路径。

### 兼容
- 旧快照缺少 `reviewStatus` 时按已确认处理；新 PostgreSQL 列默认 `confirmed`。
- “停用”阻止记忆继续注入，但保留记录以支持审计与确定性回放。

## [0.7.0] - 2026-09-27

### 新增
- **记忆有效期**：Runtime Memory 支持 `validFrom`、`validUntil` 和 `confidence`；上下文检索按请求时间过滤未来记忆和已过期记忆，没有有效期的旧记忆继续永久有效。
- **上下文来源审计**：Runtime Context 生成 `contextBuild`，记录身份、状态、轮次、事件、记忆、Episode、目标和行为计划的来源、排名、相关性与估算 token 数。
- **审计持久化端口**：InMemory、现有 StorageAdapter 和 PostgreSQL RuntimeStore 均支持独立保存上下文构建记录，不推进角色状态版本。

### 强化
- Context Builder 对数量参数做非负整数归一化，避免异常输入造成意外切片行为。
- 上下文审计写入失败自动降级，不阻塞正常聊天、Runtime Context 返回或状态提交。
- PostgreSQL 记忆投影补齐 `confidence`、`valid_from` 和 `valid_until` 字段，复用现有 Schema，无新增迁移。

### 兼容
- 旧快照中缺少有效期的记忆保持有效；旧 MemoryRecord 缺少 `confidence` 时按 1 处理。

## [0.6.0] - 2026-09-27

### 新增
- **Appraisal Engine**：根据事件、人格特质、价值观、目标、对象态度、关系和历史评价重要性、目标相关性、价值冲突、背叛、威胁、损失、社会显著性、意外性与目标显著性，并生成可审计的影响强度。
- **Behavior Planner**：根据评价和状态输出目标、策略、强势度、温度、直接度、情绪表达、边界约束、语音指令和置信度；不生成自然语言、不直接修改状态。
- **长期状态惰性衰减**：Attitude 与 Relationship 支持按对象配置半衰期和基线，未配置时继续保持旧数据行为。

### 强化
- Runtime State Reducer 先评价再应用缺省事件影响；显式事件 effects 优先，旧事件可继续 Replay。
- Appraisal 写入 StateChange 审计摘要，Runtime Context 自动提供最近评价与 Behavior Plan，聊天桥接将其作为内部状态指导传给模型。
- 背叛、价值冲突、威胁、失去和积极事件可在没有显式 effects 时产生温和的默认情绪、态度和关系影响。

### 兼容
- 没有新增数据库迁移；旧 Runtime Snapshot、事件和对话数据可继续加载，旧态度与关系未配置 half-life 时不自动衰减。

## [0.5.0] - 2026-09-27

### 新增
- **聊天全文搜索**：搜索覆盖当前角色的完整消息历史，支持中英文大小写、全角字符和空白归一化，并显示命中片段。
- **历史消息跳转**：搜索结果导航会重定位双向虚拟化窗口，把目标消息滚入视口并提供定位提示。

### 强化
- 搜索与虚拟化窗口解耦，长对话不会因为只渲染最近消息而漏掉历史结果。
- 搜索条支持键盘前进、后退和关闭，移动端输入字号遵循 16px 规范。

### 兼容
- 没有新增数据库迁移；既有角色、会话、消息和设置继续使用原存储格式。

## [0.4.0] - 2026-09-26

### 新增
- **本地长期记忆持久化**：记忆事实与情绪快照复用现有 `StorageAdapter`，按当前 Profile 隔离；应用重启后自动恢复，旧对话数据不被覆盖。
- **动态记忆提示词注入**：每轮检索相关的本地会话记忆，作为独立动态 system 段注入，保持角色前缀稳定。
- **双通道向量 RAG 增量同步**：数据银行、世界书和会话记忆按来源指纹增量嵌入；内容删除、内容替换和模型切换都会同步清理旧索引。
- **长对话摘要状态**：摘要任务按会话串行化，编辑、删除和重新生成会使旧摘要失效；上下文面板显示摘要是否生成、覆盖消息数和更新中状态。

### 强化
- **RAG 检索缓存**：文档正文、作用域和分块元数据参与指纹计算，等长内容替换也会失效；缓存键纳入最近消息数、关键词数和结果数配置。
- **提示词预算裁剪**：上下文超预算时优先裁剪历史消息，尽量保留本轮 RAG 与本地记忆动态段。
- **兼容已有数据**：没有新增数据库迁移；已有角色、世界书、对话和设置继续使用原存储，新增记忆快照按需创建。

### 验证
- 全量 Vitest：3456 项通过、3 项跳过；127 个测试文件通过、2 个跳过。
- `npm run typecheck`、`npm run lint`、`npm run i18n:check` 通过。
- Vite 生产构建与 PWA 资源生成通过。
- 断点、视口、触屏 hover、`!important`、移动端控件字号、对比度和 CSP 门禁通过。

## [0.3.1] - 2026-09-26

### 新增
- **Virtual Character OS Runtime**：落地确定性角色状态机（Event → Reducer → Snapshot → Context），默认走本地快照，配置 `VITE_RUNTIME_BASE_URL` 后切换为服务端 Runtime HTTP API；新增 PostgreSQL 事务持久化边界、群组定义版本 CAS、待提交队列幂等重试与 Replay 审计。
- **批量多角色**：角色卡单批最多导入 50 个，逐项返回创建 / 已存在 / 校验失败结果；稳定角色 ID 保证重复批次与失败重试不覆盖既有快照。
- **多角色群聊真实模型编排**：2–8 个成员，支持自然轮换与指定发言；每个成员使用独立 Runtime Context 与 Event 流，其他成员的公开旁听事件按角色独立投递。
- **群聊归档状态远端同步**：新增 `PUT /v1/runtime/groups/:id/status` 与 `SetRuntimeGroupStatusInput`，归档/恢复走显式接口并校验 `expectedVersion`；归档后拒绝公共回合与成员变更。
- **群组定义 CAS 冲突恢复**：成员或状态冲突时记录远端最新定义，群聊页提示条提供「以服务端为准」，按成员 ID 映射回本地角色卡对齐成员与生命周期，不静默覆盖。
- **服务端可靠投递队列（outbox）**：新增 `group_turn_outbox` 表与 outbox 入队/查询/重放接口；公共回合提交改为「先入队持久化，再原子提交」，标签页崩溃不再丢回合。
- **Runtime 最小状态查看与回放自检**：单聊上下文面板与群聊成员区新增折叠面板，只读展示版本、事件/记忆/Episode 计数、显著情绪、Mood 与最近事件，并提供回放一致性自检。
- **服务端群聊历史同步**：群聊页在首次进入与切换群组时拉取服务端公共回合并合并到本地历史，按逻辑回合键幂等去重，支持跨设备恢复群聊记录。
- **Runtime HTTP 认证边界**：新增可注入的认证 principal 与租户解析器；角色和群聊 Handler 支持强制认证、公开健康检查和可信租户覆盖，匿名请求统一返回 401。
- **0.3.1 群聊投递可靠性**：本地和服务端待提交队列固定回合时间与错误元数据；同键载荷冲突返回 409，不覆盖既有记录；进入群聊时可恢复服务端遗留待处理回合。
- **个人中心账户状态**：新增本地用户状态展示、远程登录入口和本地数据说明；远程认证服务未配置时保持明确的本地模式提示。
- **手机端 PWA**：接入 `vite-plugin-pwa`，支持浏览器"添加到主屏幕"独立全屏运行（manifest + Service Worker + autoUpdate，离线缓存壳）。
- **多会话（历史会话切换）**：将"会话"升级为独立实体，同一角色可开多条独立会话；侧边栏/移动端会话列表可切换、新建、置顶、归档、删除，数据经 `loadChats(characterId)` 持久化。
- **角色列表排序**：按「最近更新 / 名称」排序，角色卡在创建/更新时记录时间戳。
- **市场更新检查**：远程安装本地角色时记录来源条目与版本，对比最新清单，市场页横幅提示可更新项并可一键更新。
- **备份补全（故事线+事件）**：全量导出/恢复纳入故事分析结果（stories）与世界书事件（events，内存态随备份带出跨端恢复）；导入结果新增「故事线」统计行。
- **移动端底部导航**：5 Tab（会话/角色/市场/世界书/设置）替代桌面左侧栏；按路由自动判定二级页全屏隐藏；iOS 安全区/Home 条垫高。
- **移动端全局交互规范**：输入控件 ≥16px 防 iOS 聚焦放大、主内容底部留白避开导航、断点统一 ≤640 口径。
- **社区市场真实下载流**：远程清单加载、流式下载进度、SHA-256 哈希校验、一键导入角色库。
- **PWA 正式图标**：自包含 PNG 生成脚本（512/192/180），品牌红圆角气泡图标。

### 强化
- **RAG 增强·停用词过滤**：嵌入前剔除中英高频虚词（保留否定词/数字/专名白名单），可开关默认开，onnx/gateway/mock 统一生效。
- **RAG 增强·嵌入模型自动择优**：内置 14 组中文评测集按 recall@3 + 耗时跑分，择优结果驱动 `selectVectorModel`（失效自动回退）。
- **移动端全面响应式**：核验并补齐 WorldBook / 群聊等页面移动端可编辑性（面板 `display:none` 隐藏修复），覆盖率补齐至全页面。
- **移动端全功能回归**：新增 `mobile-functional` Playwright project，把核心用户旅程（对话、群聊、批量导入、角色 CRUD、备份恢复、世界书）放到 Pixel 5 视口下重跑，补齐「手机端全功能」验证。
- **双内核 E2E**：新增 `webkit` project（Desktop Safari），覆盖 Chromium 之外的第二个内核；CI 安装 chromium + webkit。
- **设计系统 spacing token**：落地 `--spacing-*`（4/8/16/24/32/48）间距刻度，增量迁移组件间距（批次4：世界书事件面板/随机事件弹窗/聊天气泡；批次5：设置页模型/向量模型面板；批次6：Toast 提示 与 Onboarding 引导弹窗，其中 Onboarding 非刻度间距按四舍五入对齐 token）。

### 变更
- 全仓库移动断点统一收敛至 `≤640px` 口径（含 `responsive.css` 与各视图）。
- 底部导航 Tab 文案与设计短名对齐（会话/角色/市场/世界书/设置）。

### 修复
- GitHub 发布流程改为仅保留源码归档，不再构建或上传安装包，也不再执行 `latest.json` 更新器清单发布。
- 群聊 Runtime HTTP 边界：群组根路径非 GET 请求与未知子路由不再被误判为可调用领域操作，避免触发未授权写入路径。
- 旧部署 Schema 升级：`group_chats` 缺少 `version` 列时，迁移会幂等补齐非空版本列、默认值与非负约束，不要求删除或重建既有群组数据。
- 移动端世界书：列表/条目面板被隐藏导致无法新建/选择/编辑 → 改为堆叠+限高滚动。
- 移动端群聊：群聊列表被隐藏导致无法切换 → 同法修复。
- 移动端世界书条目树宽度坍缩：`.entries-list-panel` 在移动断点只设 `display:flex`，默认行方向使 `flex:1` 的子列表被头部挤压为 0 宽，条目实际不可见、不可点选 → 显式 `flex-direction:column` 修复（移动视口 E2E 捕获）。
- 移动端选中角色后抽屉不关闭：抽屉保持覆盖导致对话发送按钮被拦截 → 角色列表选中后统一关闭抽屉（桌面端抽屉常驻，关闭为无操作）。
- i18n 扫描器 CRLF：按 `\n` 切分使行尾残留 `\r`，`// i18n-ignore` 豁免失效 → 于 `effectiveCode` 入口剥离行尾 `\r`。
- 群聊 Runtime 文案硬编码中文（19 处）→ 用户可见错误改 `t()` 查表并补齐中英双语，模型面文本按约定豁免。

## [0.2.0] - 2026-08-21

### 新增
- **自定义向量模型 + RAG**：支持上传 ZIP 或登记本地磁盘目录添加自定义向量模型；接入双通道（动态记忆 / 静态世界设定）语义检索，可在设置页为 RAG 动态/静态层指定模型。
- **桌面端发布**：移除 Tauri updater 与更新检查入口；当前 GitHub 发布策略仅保留源码归档，桌面应用需从源码本地构建。
- **32 项主力功能里程碑**：详见 `AI酒馆开发计划文档.md`（本地保留，不入仓库）。

### 强化
- **自定义主题**：上传背景图自动提取主色调（k-means 聚类），匹配深/浅、OLED、暗夜剧场等主题；嵌入了衬线标题字体。
- **桌面端**：系统托盘、全局快捷键（`Ctrl+Alt+Space` 唤出）、拖拽导入、断网提示。
- **社区市场**：基于 GitHub 仓库索引的模板 / 角色卡 / 世界书下载，含哈希校验与离线回退。
- **无障碍**：Modal 焦点陷阱严格回绕；将 `scripts/check-contrast.mjs`（5 内置主题对比度 ≥ AA 4.5:1）接入 CI 门禁。

### 变更
- **CI 配置首次入库**（`.github/workflows/ci.yml`），前端/桌面构建门禁现由 GitHub Actions 实际执行。
- **工程门禁本地可复现**：lint / typecheck / test+coverage / i18n:strict / tauri-build。

### 修复
- 消息工具栏触屏可见性、移动端遮罩残留、设置页横向溢出与模块间距、组件模态焦点逃逸。
- 静默空错误（语料内消息/空会话等）文案与交互。
- 若干静态分析（`noUncheckedIndexedAccess`）类型告警收敛。

### 安全
- 客户端最小权限（capabilities 仅 `core:default`）、CSP 收紧、`freezePrototype`。
- API Key 落盘加密（PBKDF2 + AES-GCM），主密码不本地存储。
- 扩展沙箱默认拒绝权限，社区扩展默认不自动执行。

[1.0.0]: https://github.com/zhuweib-design/ai-roleplay/releases/tag/v1.0.0
[0.9.0]: https://github.com/zhuweib-design/ai-roleplay/releases/tag/v0.9.0
[0.8.0]: https://github.com/zhuweib-design/ai-roleplay/releases/tag/v0.8.0
[0.7.0]: https://github.com/zhuweib-design/ai-roleplay/releases/tag/v0.7.0
[0.6.0]: https://github.com/zhuweib-design/ai-roleplay/releases/tag/v0.6.0
[0.3.1]: https://github.com/zhuweib-design/ai-roleplay/releases/tag/v0.3.1
[0.5.0]: https://github.com/zhuweib-design/ai-roleplay/releases/tag/v0.5.0
[0.4.0]: https://github.com/zhuweib-design/ai-roleplay/releases/tag/v0.4.0
[0.3.0]: https://github.com/zhuweib-design/ai-roleplay/releases/tag/v0.3.0
[0.2.0]: https://github.com/zhuweib-design/ai-roleplay/releases/tag/v0.2.0
