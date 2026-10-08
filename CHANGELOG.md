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
