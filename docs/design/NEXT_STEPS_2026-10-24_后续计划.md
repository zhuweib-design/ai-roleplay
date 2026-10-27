# 后续计划总表（2026-10-24）

来源：Project Radar 八阶段评审（run 目录 `D:\AI_data\qoder_交付\2026-10-23_AIjiuguan_radar`）+ 当日已执行的修复。
本文件是唯一的"接下来做什么"入口；细节以链接的产物为准，此处只列决策、待办与验证缺口。

## 一、需要你确认的（按影响排序）

| 编号 | 要定的事 | 我的默认选择 | 不确认会卡住什么 |
| --- | --- | --- | --- |
| Q1 | 零配置首聊内置哪几家供应商预设 | **已采纳默认并开工（2026-10-25，用户"按默认走"）**：沿用现有 provider 字段，5 个选项里 3 个带预填（OpenAI / DeepSeek / Anthropic）+ 自定义 + 本地；每家只预填一个模型名，不做清单维护 | 无 |
| Q2 | 示例角色能否离线打包进仓库 | **已作废（2026-10-26，用户新要求）**：打包、提交、推送与正式环境一律不带历史数据，首次启动数据必须为空。`src/data/mock-data.ts` 已删除，角色库从空开始，不再有任何示例/种子数据 | 无 |
| Q3 | 下个里程碑窗口 | **已确认（2026-10-26，用户"默认"）**：8 周（2026-10-24 至 2026-12-19），单人、有效容量按 4.8 人周估算 | 无 |
| Q4 | 1.2.0 是否以"移动端首聊可用"为发布门槛 | **已确认（2026-10-26，用户"是"）**：是。移动端角色卡入口已修，整条首聊路径要一起验收（5 人试用与计时是门槛项，仍未做） | 桌面新增功能是否延后 |
| Q5 | 是否继续保持"本地优先、不做账号/云同步/托管" | 保持。本周期只把 Runtime 默认认证改安全，不建账号体系 | 是否要为托管预留架构改动 |
| Q6 | Token 死引用棘轮基线是否现在下调 | **已执行（2026-10-24）**：A 类实测 0 处，基线从登记 77 处 / 14 文件下调到空表并转硬卡；`check:token-baseline` 与 `token:self-test`（9/9）均绿 | 无 |
| Q7 | Rust 侧改动的验证方式 | 本机无 `cargo`（实测 `command not found`）。默认由 CI 的 `tauri-build` 兜底；若你希望本地验证，需要给一个能跑 cargo 的环境 | 桌面端 SSE CRLF 修复与"流卡住时停止"是否可信 |
| Q8 | 基础件收敛前的一次人工像素核对 | **已完成（2026-10-26，用户"统一弹窗按钮与焦点环的观感"）**：10 个文件的 `.modal-btn` 副本（含 F1 留下的差值）全部删除，外观只由 `primitives.css` 一份提供——padding `--space-3`、焦点环 `--ring`、禁用 `--opacity-disabled`、过渡 `--transition-colors`、圆角 `--radius-sm`、底色 `--card-elevated`；语义变体（confirm/next/cancel/danger）保留。实测：焦点环从 `--secondary` #25F4EE 变为 `--ring` #F0466A（键盘走查读数 `rgb(240,70,106)`）；新建会话按钮 56×32→52×32、资料上传 60×32→52×32 且圆角 8→6、底色 `--card`→`--card-elevated`；截图在 `evidence/screenshots/q8-dialog-buttons/`（before/after 各一套，附 JSON 读数） | 无 |
| Q9 | 竞品 20 条待核数据（价格、用户量、版本史） | 保持现状：不参与本周期排序，只影响对外叙事 | 只影响下一次竞品刷新与任何对外材料 |
| Q10 | 44 命中区规则按宽度还是按"是否触屏" | **已执行（2026-10-26，用户"默认"）**：四处"只扩命中区、不改布局"的伪元素规则从 `max-width:640px` 迁到 `(pointer: coarse)`——`primitives.css` 的弹窗按钮/关闭键、`responsive.css` 的输入条发送与附件、`ChatHeader` 的汉堡键、`CharacterGridPanel` 的对话入口与星标。实测同一 390 宽：精细指针命中高 32（不再无谓放大），触屏指针 45（≥44）。会改布局的 min-height/padding 那批仍按宽度走，等"真抬控件高度"的视觉决定 | 2D-P1-04 剩下的平板档 |
| Q11 | "本轮检索命中"面板怎么摆三个来源 | **已按默认执行（2026-10-25）**：合成一条清单、按来源打标签（记忆 / 资料 / 设定）、同一对象去重。你若想要"按来源分三组"，改动只在 `RetrievalTraceSummary.vue` 的模板与 `mergeRetrievalTrace` 的排序，不动数据层 | 无 |

## 一之二、数据纪律：正式环境首次启动必须为空（2026-10-26，用户要求）

用户要求：**打包、提交、推送与正式环境都不要历史数据，数据都要为空。**
落到代码上的改动（均已提交）：

- 删除 `src/data/mock-data.ts`（4 个示例角色的唯一来源），`stores/character.ts`
  改为 `characters = ref([])`、`currentCharacterId = ref('')`；
  原先"首次启动把 mock 写进存储"那段分支一并删掉。
- 数据管理面板去掉"有角色才渲染"的门槛：空安装的用户也必须能点到"导入备份"
  （这是空安装最需要的操作，原先整段被隐藏）。
- 上下文面板在没有当前角色时不再崩：`ContextCharacterCard` 读 `char.name`、
  `ContextGenParams` 读 `char.temperature`、`ContextAuthorNote` 读 `char.authorDepth`、
  `useContextPanel` 里 14 处 `char.value.id/...` 都在无角色时抛错。
  现在卡片段给"还没有角色"提示，其余段在无角色时不渲染，写入口一律提前 return。
  `useContextPanel` 去掉了 `currentCharacter!` 的非空断言——就是它把这些问题藏起来的。
- 打包侧核对过：`src-tauri/tauri.conf.json` 的 `resources: []`、`public/` 与 `dist/`
  里没有任何数据文件，Capacitor 只打包 `dist`（JS/CSS）。

实测（真实浏览器，dev 与 `vite preview` 的构建产物各跑一遍）：
新装上下文里 `characters / chats / groups` 三张表都是 **0 条**，界面显示"还没有角色…"。
截图：`evidence/screenshots/empty-start/fresh-install.png`。

判据的连带影响：单测 50 条、桌面 e2e 23 条、移动 e2e 6 条、mobile-functional 2 条
原先都默认"打开就有示例角色"。全部改成用例自己造数据（新增 `tests/helpers/character-fixtures.ts`
与 `e2e/helpers/seed-character.ts`），断言本身没有放宽。最终读数：
单测 4210 通过 / 3 跳过；桌面 e2e 178 通过；`mobile-msedge` 54 通过；
`mobile-functional-msedge` 9 通过。

过程中发现的两件事，记在这里不另开条目：
1. **移动档 toast 盖住输入区**：群聊创建成功的提示浮层在 ≤640 下底部定位，正好压住"发送消息"，
   实测点击被 toast 的关闭按钮拦截。用例这轮用 `e2e/helpers/toasts.ts` 先清浮层，
   产品侧的摆位属于设计改动（会动全局 toast 位置），留给下一轮。
2. **会话行只在"收藏"分组渲染**：用例造的角色不是收藏时，左侧看不到会话行。
   这不是本轮引入的，但会让"刷新后会话行应该高亮"这类断言依赖夹具是否收藏，已写进夹具注释。


## 二、已完成（本批次，未提交）

改动规模实测（2026-10-25 复算）：34 个已跟踪文件修改，`+724 / -260`；另有 6 个新文件（`src/api/sse-boundary.ts`、`e2e/mobile/modal-touch-target.spec.ts`、`tests/stores/chat-session-generation-guard.test.ts`、`tests/tooling/base-primitives.test.ts`、`tests/tooling/import-boundaries.test.ts` 与本计划文档）。其中 `package.json`、`package-lock.json`、`docs/design/DEV_PLAN_2026-10-17_开发计划.md` 三处是本批次之前就存在的修改。

P0 五条（全部有先红后绿的测试或脚本证据）：

1. Runtime 认证默认 fail-closed，新增 `allowAnonymous` 显式放行；README 中英与实现基线文档同步。
2. 备份导出拦截 `imageGenConfig` 明文 Key，只读脚本复跑结果为 `EXPORT_BLOCKED`。
3. 移动端角色卡补出可见的"对话"入口，且不破坏"一屏 ≥3 卡"。
4. `.tk-input` 补全局基类，快速建角色/建世界书不再落到浏览器原生白框。
5. `.modal-btn` 补全局基类，首次引导弹窗与 7 处缺定义组件不再是系统原生按钮。

生成可靠性三项：

6. SSE 事件边界同时接受 `\n\n` 与 `\r\n\r\n`（新增共享模块 `src/api/sse-boundary.ts`，Web 两个客户端与 Rust 侧同口径）。
7. 流内 `error` 事件冒泡为可见错误，不再产出空白回复。
8. prompt 构建期间点"停止"会在发请求前收口；生成中切换/新建/删除会话加闸门与提示。

命中区与判据补口（2026-10-25）：

9. 手机卡面「对话」入口的命中区改用透明伪元素（45×47），布局零位移，`/character` 两档 100% / 96.2%。
10. 新增弹窗内部命中区判据 `e2e/mobile/modal-touch-target.spec.ts`（先红后绿），`.modal-btn` 与 `.modal-close` 在移动断点内命中区撑到 44，视觉零变化。
11. 会话闸门的"空闲放行"腿补测（原来只测了拦、没测放行）。

最终验证读数（2026-10-25 全量复跑）：单测 `4154 passed / 3 skipped`（227 文件，2 个 PG 集成文件本机跳过）；e2e `290 passed (5.4m)`，退出码 0、0 条 `[FAIL]`；lint 0 error / 10 warning（与修复前同数）；typecheck、i18n strict（384 文件）、对比度（存量 0）、token 基线与自检 9/9、CSS 约定 5/5、控件尺寸、原语复用、文件行数棘轮、构建 + CSP + ORT、README 门禁对账全部通过。唯一红的是 `test:coverage`（77.75 / 71.08 对 78 / 73），已定性为本机缺 PG 环境所致、且 HEAD 基线更低，详见第四节。

## 三、待办

### 3.1 Table Stakes 剩余（本周期）

| 项 | 工作量 | 前置 | 验证方式 |
| --- | --- | --- | --- |
| C-01 零配置首聊（预设 + 示例角色 + 连通性自检） | 1.0 人周 | **进行中（2026-10-25）**：供应商预填已修（见下），示例角色与"测试连接"本来就有 | 全新配置下"首次启动到第一条成功回复"中位耗时 ≤3 分钟、完成率 >50%（5 位用户试用 + 本地计数）；断网仍能看到示例角色并进聊天 |
| 桌面端流卡住时停止立即回到可输入（2B-P1-04） | 0.4 人周 | **前端部分已完成（2026-10-25）**：abort 唤醒 waiter、收尾不再 `await` 那个要等 300 秒的 Rust promise、并补挡"信号在调用前就已 abort"（本地 WebLLM 客户端本来就挡了这一手）。4 条判据 + 1 条对照，两处改动逐个摘掉都验证过会红。剩 Rust 侧：`cancel_flag` 仍只在收到下一个 chunk 后才检查，任务会挂到总超时才释放 | Q7（本机无 cargo） |

**首聊全路径实走（2026-10-25，全新 profile，mock 端点）**：9 步走通，截图在
`evidence/screenshots/c01-walkthrough/`，脚本 `evidence/commands/walkthrough-c01.mjs`。

| 步 | 看到的 |
| --- | --- |
| 首启 | 引导弹窗出现：打开任务清单 / 现在配模型 / 关闭 |
| 点「现在配模型」 | 落到 `/settings?cat=model&from=/chat`（带回程） |
| 角色页 | 4 张示例角色（Kael / Seraphina / Lyra / Mira），断网也在 |
| 未配模型直接发 | toast「未配置 API Profile」；就绪条「模型 需处理」 |
| 点「模型」就绪条 | 落到设置模型分类，带回程 |
| 选 Anthropic | 端点预填 `https://api.anthropic.com`、模型预填 `claude-sonnet-4-5` |
| 测试连接 | 「连接成功，响应：pong」 |
| 保存 | 自动激活，不用再点一次 |
| 回对话发一条 | 收到回复 |

耗时 25 秒（含脚本里每步刻意的 0.6-2.5 秒等待与 9 张截图），远低于 3 分钟的验收线，
但那是脚本速度，**不能替用户研究作证**。

走查发现的两处摩擦都已按默认改掉（2026-10-25，用户"可以，继续吧"）：

| 摩擦 | 改法 | 判据 |
| --- | --- | --- |
| 缺模型时空态只给"示例开场白"，点了得到一句不可操作的提示 | 缺模型（或被锁）时空态改成一句真话 + 一个「先配一个模型」按钮，点了带 `from` 回程进设置对应分类；示例开场白这时收起 | `e2e/chat-empty-setup.spec.ts` 两条：正向（按钮在、示例不在、点了落到 `?cat=model&from=`）+ 负向对照（配好模型后按钮消失、示例回来）。把 `sendBlock` 钉成 null 只红正向那条 |
| 就绪条把可选能力与硬阻塞同级展示 | 世界书无绑定时由 `attention` 改 `n-a`，只有模型保留"需处理"；页头计数从"2 项需要先处理"变成"1 项" | `tests/core/readiness.test.ts` 那条先改期望看到红、再改实现看到绿；走查第 4 步实测文案为「模型 需处理 ｜ 世界书 未启用 ｜ 文档检索 未启用 ｜ 语音 未启用」 |

过程中被自己的门禁拦下两次，都是真问题：新按钮写了 `min-height: 36px` 字面量，被控件高度棘轮拦下，改用 `--size-control-md`（桌面 36、移动档 token 自己升到 44，省掉一条媒体查询）；新文案里留着"开场白都还在"，被自己刚加的"描述不许再提开场白"断言拦下，改文案而不是放宽断言。

C-01 第一步已完成（2026-10-25）：修掉一个直接卡住首聊的缺陷——新建配置初值是 OpenAI，
切到 Anthropic/DeepSeek 时**端点和模型都不跟着换**，点"测试连接"必然失败，而界面上看不出哪一步错了。
规则改成"手填过的不动，没动过的跟着换"：`lastProvider` 记住上一家，端点/模型各自判断是否为上一家默认值或空。
切到"自定义"会把上一家的默认端点清空，不留一个假的已填值。判据 7 条纯函数 + 2 条真表单 e2e（切供应商后读输入框实际值），
把旧行为还原回去两条 e2e 都会红在"端点没跟着切"。

首聊这条路的现状拼图（逐段有据）：首启引导（`ux-guided-tasks` 的用例）→ 示例角色（静态 `mock-data.ts`，断网可点）→
缺模型时就绪条给"需处理"并可跳设置（`ux-gap-visibility`）→ 新增配置选供应商（本轮已预填）→ 测试连接 → 配好后发消息
（`ux-prompt-trace` 等把"配好→发送→出回复"跑通过）。**还缺的一条**：整条路的中位耗时与完成率是用户研究指标，
本机只能给功能可用性，不能替我作证 ≤3 分钟。

### 3.2 差异化押注（本周期，MVP）

C-03 记忆可见化只读面板：0.5 人周。上下文面板列出本轮实际注入的世界书条目与检索命中，允许置顶/禁用一条。止损：4 周内打开率 <15% 或 30 日留存无可测提升，就降级为高级诊断并撤下"角色记得住"的对外说法。

第一步与第二步已完成（2026-10-25）：三路检索的命中现在都落到消息上，气泡下方合成一条可展开清单。

| 来源 | 位置 | 留痕 |
| --- | --- | --- |
| 双通道向量检索（动态=会话记忆、静态=资料库分块 + 世界书） | `dual-channel-runtime.ts:407`；调用方 `chat-generation.ts` | 已完成 |
| 资料库关键词检索 | `data-bank.ts` 新增 `retrieveAndBuildContextDetailed`（老入口只回字符串，保留给别的调用方） | 已完成 |
| L0 记忆关键词检索 | `chat-memory.ts` 新增 `searchLocalMemoryContext`（同上，老入口保留） | 已完成 |

按 Q11 的默认做法合成一条清单：来源标签取记忆 / 资料 / 设定，来源之间按固定顺序、组内按各自分数降序，同一对象被同一路两种 id 写法命中时只留分数更高的那条（去重键带来源——资料库给的裸 id 是分块、记忆给的裸 id 是事实，只按字符串会认错）。**三路的分不是一把尺**（相似度 / 关键词命中数 / 精确度加权），所以不做跨来源比较，这一点界面文案里要跟上。

两处一并处置：删掉两个只剩测试在调的老入口（`data-bank.ts` 的 `retrieveAndBuildContext`、`chat-memory.ts` 的 `buildLocalMemoryContext`），不留"注释说有别的调用方、实测没有"的空壳；原始分数**整个移出界面**（连悬停提示也没有）——截图里 `资料 2` 与 `记忆 0.912` 并排时，读者会以为 2 比 0.912 更相关，而三路口径根本不同（相似度 / 关键词命中数 / 精确度加权）。顺序已经表达了"谁更靠前"。中途试过放 `title` 里，被项目自带的 `no-native-title` 无障碍守卫拦下（非交互元素不许挂原生 title），这条守卫是对的，所以直接不给。分数仍随消息落盘，供诊断。

估时随之修正：C-03 原估 0.5 人周只算了"一个来源 + 一个面板"；留痕这层实际要动三个入口、两处 store 契约和一条持久化往返。剩下的是面板本身的编辑能力（置顶/禁用一条），它才需要新写交互。

### 3.3 下周期（5 项，其中技术债 3 项）

1. C-03 记忆编辑完整版（在只读 MVP 上加编辑与撤销）。
2. 字号/间距/动效接入 token + 主题对比度盲区（2D-P1-03/07/08）。
3. 44×44 命中区与选中态不只靠颜色（2D-P1-04/05）。
4. Web 多标签写锁 + 单聊 Runtime outbox（2A-P1-01/02）。
5. 内置角色包从 4 个扩到 6-8 个（内容工作，依赖 Q2 的结论）。

### 3.4 优化与精简（不影响功能，按两份计划执行）

- 前端：`D:\AI_data\qoder_交付\2026-10-23_AIjiuguan_radar\evidence\optimization\frontend-plan-2026-10-24.md`。**进度：F1 两步、F2、F4 与 F3 三条都已完成（2026-10-26）**。F4 实测：`!important` 24→20（去掉的 4 条都有改前改后的浏览器读数；剩下 20 条的对手是 scoped 规则或"工具类必须压过组件"，替代属结构改动），内联样式 31→29（只有 2 处是静态值，其余是运行时算出来的宽高/颜色/缩进）。踩到一件事：CSS 里写了 `//` 行注释，三道样式守卫与 vue-tsc 全绿，只有真实浏览器打不开页面才暴露——改完样式必须跑一次 build。要点：10 份 `.modal-btn` 实测是 4 个不同变体，只有 4 份接近同值且仍差居中与字体族，必须先做像素核对再删（见 Q8）；`.tk-input` 7 个使用点的同值声明可去冗余；双份气泡样式、第二份主题色值表、死开关样式各一条；20 个 >500 行的 .vue 只做纯搬移拆分。F1 的实测更正记在计划文件里：A 档并非"只差居中与字体族"——居中与字体族本来就被全局基类给了（scoped 没写），真差值是 padding 14px vs 12px、焦点环 `--secondary` vs `--ring`、过渡属性集与时长、禁用透明度；已按"只删同值、差值留原样"做完，两个弹窗用真实浏览器量过（计算值 0 差异、整页截图字节相同）。F2 的实测更正：7 个 `.tk-input` 使用点里只有 3 个文件真有同值冗余（净删 12 条声明，行数净 −6 而非计划的 40-70）；`.ctx-preset-select` 的移动字号覆盖看似"同值"却不能删——scoped 12px 会压过基类移动断点的 16px，删了 i7 守卫立刻报未覆盖。F3 三条全部完成：死开关样式（`.switch/.slider` 零引用，删）与主题预览（"改读真实变量"经实测不可行——3 个色块端点色没有对应 token，且主题块有 5 个写成 `html[data-theme]` 取不到局部变量；改为加一条主题清单漂移守卫）、气泡双份定义（保留 layout.css 那份，组件只留 9 类真差值，删 40 条同值声明；顺带查明圆角由 ChatMain 的 `--bubble-radius` 控制，设置页生效）。
- 核心层：`D:\AI_data\qoder_交付\2026-10-23_AIjiuguan_radar\evidence\optimization\backend-plan-2026-10-24.md`。**进度：B1 已完成（2026-10-25，提交 `1773905`）；B2 已完成（2026-10-26，barrel 拆出 `runtime/server.ts` + 一条入口隔离守卫）；B2 的续也已完成（2026-10-26，把 `runtime-http.ts` / `runtime-group-http.ts` 按客户端/服务端拆成两对文件，handler 进 `server.ts`，守卫名单从 6 个扩到 8 个）**；B3 两步都已完成（2026-10-26：守卫先立，再把 `readiness` / `relations` / `guided-tasks` 搬进 `src/composables/`、`deep-link-keys` 搬进 `src/stores/deep-link-gate.ts`，`core -> stores` 从棘轮改成零容忍）；B4 经评估不做；B5 已完成（2026-10-26，真正成双的只有资料库 scope 判定，抽到 `@core/data-bank`；计划原文写的"键名映射/错误包装也各写一份"经实测不成立，src 行数净 +7 不是减少，另付出 63→64 chunk、首屏可达 26→27 的代价）。后端计划四条全部收口；B6（超大文件）已做两件：第一件 `theme-extractor.ts` 722 → 407 + `theme-tokens.ts` 340，等价性用 sha256 输出指纹钉住（`tests/core/theme-golden.test.ts`，改一个常量就红）。第二件（2026-10-27）`community-market.ts` 749 → 装配层 526 + `persistence.ts` 130 + `filters.ts` 120 + `moderation.ts` 98，搬之前先立两道护栏（一条 65 点操作流水的行为指纹 + 一份 62 个对外成员的字面清单），拆后用 `git worktree` 起旧实现复跑同一枚指纹确认同值；计划原文那句"把索引/下载/回退三段继续外提"与实物不符，实物边界与 +125 行的工厂成本都记在 B6 表里。第三件（2026-10-27）`character-version.ts` 733 → 装配层 444 + `persistence.ts` 117 + `branching.ts` 119 + `merging.ts` 143 + `locks.ts` 89，护栏是 69 点流水指纹（钉 locale=zh、版本短哈希归一化成 ID）+ 39 个成员清单，牙齿里删掉一次 `versionTick` bump 会让指纹和 5 条存量用例一起红；计划原文的"展示层"实测拆不出去（8 个 computed 全是引擎 + tick 的派生），"仓库层"只有 60 行属碎片，改成持久化/分支/合并/操作锁四段，工厂成本净 +179 行。前端 F5（超大 .vue 拆分）本周期不做，理由与实测数据在计划文件里：这批文件已经是拆过一轮的，剩下的体积在 scoped 样式与编排脚本上，且全部低于 check:file-size 的 800 行门槛。B6 剩余三件按默认继续：`community-market.ts` 749、`character-version.ts` 733、`backup-service.ts` 720 先做（本机可验证），`chat_stream.rs` 1123 需要 cargo，本机没有，只能靠 CI 的 tauri-build 兜底（Q7 的默认），所以放最后。要点：单聊与群聊 HTTP Handler 的 trace/认证/错误外壳重复可抽公共函数（约 60-90 行）；Runtime barrel 混装客户端与服务端模块，拆 `runtime/server.ts`；先加一条 import 边界测试再搬 4 个 `core → stores` 反向依赖；测试里 19 处 `allowAnonymous` 收进 helper；存储双后端共享解析与键名逻辑。

### 3.5 明确不做（本周期，理由见路线图第 4 节）

社区市场远端扩张、新增主题数量、把多端与主题当卖点、账号/云同步/托管、免费收缩与广告、UGC 托管与集中审核、Runtime 大重写。

### 3.6 手机端专项状态（对齐 MOBILE_PLAN 与本轮评审）

已闭环（`MOBILE_PLAN_2026-10-16` 批次 0-3 + `OPT_PLAN_2026-10-15`，由 `PLAN_CHECK_2026-10-23_双计划完成项核查.md` 逐项核对）：A 类缺陷 18/18、B 类交互 4/4、C 类重构 2/2，含底部 Tab 6→5、8 个视图恢复底栏、Android 返回键三态、世界书与设置的两级互换、角色卡点卡开抽屉、断点收敛单一运行时值、控件高度 token 化（93→61 处字面量）、≤640 档控件阶梯上移、平板档定形。批次 4（死 token 81 处、provider 徽章对比度）在 2026-10-23 当日立项并完成，对比度棘轮随后 52→0。

这两天补上：移动端角色卡的可见"对话"入口（2C-P0-01）并加了 e2e 同时守住"一屏 ≥3 卡"；入口与弹窗内控件的 44 命中区（透明伪元素，视觉零变化）；弹窗内部命中区判据一条（此前 2D 记的"弹窗按钮 32、关闭键 26"没有任何门禁盯着）。

仍开放（本周期或下周期）：

| 项 | 来源 | 归属 |
| --- | --- | --- |
| 移动端首聊整条路径（列表→对话→输入→发送→返回）作为 1.2.0 门槛 | 2C-P0-01 延伸 + 竞品 Table Stakes | 本周期，见 Q4 |
| 弹窗按钮 32px、弹窗关闭键 26px 的命中区 | 2D-P1-04 | **本批次已收口（2026-10-25）**：`primitives.css` 加移动断点内的透明伪元素（46×46，`--touch-min + 2px`），新判据 `e2e/mobile/modal-touch-target.spec.ts` 先红后绿，实测引导弹窗 4/4、确认删除弹窗 3/3 达标，且伪元素开/关时按钮 rect 逐一相同（视觉零变化）。开关 32×18 与平板档 `.nav-item` 32px 仍未做（见 Q10） |
| 平板档（768/834）整片命中区缺口 | 2D-P1-04 + 本批次普查 | 待 Q10 定判据口径。普查读数：329 处不足，底部导航 `nav-item 51×32` 独占 168 处；角色详情抽屉内部实测 0 处（说明批次 1-5 的抽屉做法本身是达标的） |
| 底部导航与创建模式切换的选中态只靠颜色 | 2D-P1-05 | 下周期（同上） |
| 聊天首屏常驻状态条在 390 宽出现半截 chip、空状态重复 CTA、原生白控件混入深色 | 2C-P1-02/03/04 | 需要设计决策，未排期（见下方备注） |

口径说明：`MOBILE_PLAN` 的 3-3 记为"触摸目标 100%"，其判据是 `e2e/mobile/touch-target.spec.ts` 在 6 个主页面用有效命中区量出的 ≥44px 比例 ≥90%，弹窗内部与平板档导航不在该测量范围内。因此 2D-P1-04 的五处不是回归，而是既有判据没覆盖到的地方。**本批次补上了弹窗内部那条判据**（`modal-touch-target.spec.ts`，阈值取"一个都不许少"而非 ≥90%，因为一个对话框只有 2-5 个可点元素、按比例会在"4 个里坏 1 个"时放行），并把新 spec 手工登记进 `e2e/shard-groups.mjs` 第 2 组（单 worker 实测 2.4s，登记后四组极差 1.094）。`touch-target.spec.ts` 的 6 页 × 两档阈值本批次未改。

备注：2C-P1-02/03/04 三条是视觉与文案决策（色义、空状态按钮数量、状态条是否常驻），不属于等价精简，也没有实测判据能自动判定，需要你先定方向再排期。

## 四、验证缺口（别当成已确认）

| 事项 | 状态 | 怎么补 |
| --- | --- | --- |
| 全量 e2e | 最新一轮（2026-10-27，桌面 msedge）**`178 passed (11.2m)`、退出码 0**。此前今天四轮：`175 passed + 3 红`、`170 passed + 8 红`、`174 passed + 4 红`、`177 passed + 1 红`，红的全是两件事：其一 `token-neutrality` 的主题族（每条要做 6 次整页导航，实测单条并发 36–62s，而预算是 60s，零余量；已按实测把这一族抬到 180s，抬完两轮全量 9 条全绿，其中两条仍用了 1.0m，说明旧预算确实不够）；其二 `ux-guided-tasks:81` 拿到 `from=/` 而非 `from=/chat`（成因见下方"本批量出的现状"第 2 条，用例已改成"必须带来源、来源允许这两者"）。**本机这条门对并发敏感**：跑全量时不要再并任何其他重活；真红与负载红的区分办法是看报错形状（`browser has been closed` / 预算超时 = 负载；断言值不符 = 要看代码）并单跑复验 | `E2E_PORT=5299 E2E_REUSE_SERVER=1 npm run test:e2e` |
| 本批量出的现状（两条，都属行为修复批次，不混进等价精简） | 1）`src/main.ts:42` 在 `app.mount()` 前没有 `await router.isReady()`，首帧 `useRoute().fullPath` 仍是 vue-router 起始位置 `'/'`，此时点跳转按钮会把 `from=/` 盖进 URL（今天 4 轮全量里 2 轮出现）；结果上无害，因为 `'/'` 本身 `redirect: '/chat'`，但"返回来源"的语义已经偏了。2）`downloadCharacterPng` 在 `return` 之后还挂着一句 `auditLogger.record('character_export_png', …)`，永远执行不到——PNG 导出的审计一直在漏账 | 1 的修法：mount 前 `await router.isReady()`，或 `pushWithReturn` 兜住起始位置；2 的修法：把审计移到 `return` 前（或改 `finally`），并补一条"审计里必须出现这条记录"的判据 |
| 一处量具错误（记下来防重犯） | 给 PNG 护栏做夹具时，我往 `attributes` 里塞了 `CharacterAttributes` 根本不存在的键（`mood`/`nested`），读回只剩 `level`，于是记了一条"V2 往返丢字段"的产品缺陷。是类型检查（`noUncheckedIndexedAccess` 之外还报 TS2353 未知属性）逼我换成合法字段，换完三个键全部活着回来——丢的是不该存在的键，缺陷在量具不在产品。**教训：把"读回少了东西"当成缺陷之前，先确认那些东西在类型里存不存在** | 已按合法夹具重录六组指纹；这段来历写进 `tests/services/character-png-golden.test.ts` 的注释里 |
| `token-neutrality.spec.ts:741` 的偶发红 | **只定性、未根治**：该条空闲 6.5s、8 worker 争抢下 13-15s，而它内部 `toHaveCount` 的预算是 20s，余量只有 1.4 倍 ⇒ 全量并发时越界是可信解释，但没有抓到第二次红，无法证明产品侧无问题 | 再红一次时看 test-results 的截图与错误里的 received 值（0 还是 1）；要根治就把预算与等待策略本身变成被测对象 |
| PR #13 的 CI 结论 | **已查实（2026-10-24）**：run 39916206094 整体 failure，但只有 `Quality Gates` 红，红在 `Dependency audit (high and above)` 这一步；`E2E group 1-4/4` 与 `Tauri Build` 全部 success | 根因已定位：HEAD 锁文件里 `vite 8.2.0-8.2.2`（high）与 `@vitest/mocker ≤5.0.2`（critical）命中公告。工作区那批未提交的依赖升级（vite ^8.3.5、vitest/coverage ^5.0.5、dompurify ^3.4.17）已把两者送出漏洞区间——本地用官方源复跑 `npm audit --audit-level=high` 在工作区退出码 0、在 HEAD 退出码 1。要转绿需要把这两个文件提交并推送（待你授权）。**注意**：audit 这一步一红，同 job 里排在它后面的 lint、i18n、CSS 守卫、覆盖率门全部被跳过，所以"CI 除了 audit 都绿"这句不等于它们验过 |
| 覆盖率门 `test:coverage`（78/73/78/78） | **本机红，且红在本批次之前**：HEAD（b843fe3）单独 A/B 实测语句 76.82%、分支 70.57%，工作区 77.75%/71.08% ⇒ 本批次是把数抬上去的（+0.92 / +0.49），不是元凶。但本机 5432 无 PG 监听 ⇒ 两个 postgres 集成文件被跳过，而它们正是缺口最大的两处（`postgres-group-runtime.ts` 未覆盖分支 144、`postgres-store.ts` 67），CI 那个 job 挂了 `postgres:16` service。**所以本机这条门不是可信的红/绿信号，CI 才是** | 有 PG 的环境（或 CI）跑一次；注意 CI 的 audit 步骤排在覆盖率门之前，audit 一红后面全部跳过，这条门已长时间没真跑过 |
| Rust 编译与单测 | 本机无 cargo，未验证 | CI `tauri-build`，或本地 `cargo test` |
| Android 真机 | 未跑 | 出 debug APK 后验证存盘、导入、键盘避让 |
| PostgreSQL 性能与迁移回滚 | 未测 | 起 PG 16 跑集成测试与迁移演练 |
| 竞品界面与 20 条数据 | 只拿到文本与二手来源 | 人工截图与官方订阅页核对（Q9） |
| 生产部署形态（认证网关由谁提供） | 仓库外状态 | 部署方给出认证中间件实现 |

## 五、证据与产物索引

| 阶段 | 文件 |
| --- | --- |
| 项目快照 | `01-snapshot.md` |
| 架构 / 代码 / 视觉 / 样式 | `02a-arch-review.md`、`02b-code-review.md`、`02c-ui-visual-review.md`、`02d-ui-code-audit.md` |
| 评审摘要（20 条 P0/P1） | `02-review-digest.md` |
| 竞品分析（9 家） | `03-competitive.md` |
| 路线图（5 止血 + 4 Table Stakes + 1 押注 + 7 放弃） | `04-roadmap.md` |
| 总览 | `summary.md` |
| P0 监督审查 | `evidence/reviews/p0-supervision-2026-10-24.md` |
| 生成可靠性执行记录 | `evidence/dev/generation-reliability-2026-10-24.md` |
| 界面截图（37 张 + 修复后 4 张） | `evidence/screenshots/`、`evidence/screenshots/after-p0/` |
| 复验量测脚本 | `evidence/commands/measure-card-meta.mjs`（命中区与布局中立性）、`coverage-gap.mjs`（覆盖率缺口按文件定位）、`diff-vs-coverage.mjs`（本轮新增行 × 未覆盖交叉核对）、`probe-hit-areas.mjs` + `aggregate-hit-probe.mjs`（平板/弹窗命中区普查）、`shot-modals-2026-10-25.mjs`（弹窗视觉与 rect 中立性）、`verify-p0-shots.mjs`、`measure-modal-btn-mobile.mjs` |
| 命中区普查明细 | `evidence/hit-area-census-2026-10-25.json`（329 处不足，按场景 × 类名 × 尺寸） |
| C-03 的界面证据 | `evidence/screenshots/after-p0/retrieval-trace-collapsed.png`、`retrieval-trace-expanded.png`（1280×900 真实渲染，三条来源各一行：记忆 / 资料 / 设定） |

全部位于 `D:\AI_data\qoder_交付\2026-10-23_AIjiuguan_radar`。

## 六、无需确认就已推进的部分（2026-10-24 补充）

| 动作 | 结果 | 备注 |
| --- | --- | --- |
| Token 棘轮基线下调 | A 类实测 0 处，基线 77 → 空表；`check:token-baseline` 与 `token:self-test` 9/9 绿 | 项目自己的"收敛即转硬卡"做法，与对比度 52→0 同一套路 |
| 新增分层边界守卫 | `tests/tooling/import-boundaries.test.ts`，9 条规则 + 1 条负向对照 + 1 条"登记清单不得漂移"，11 条全绿 | 优化计划后端 B3 的第一步；先立判据再搬文件 |
| 修正快照的依赖矩阵 | 原表用别名字符串统计，漏了相对导入；改用"解析到真实层"的口径重算，`core → api` 由记为 0 更正为 3 文件 / 4 处，`stores → storage` 7 → 16 文件等多行同步更正 | 已在快照追加"7.1 勘误"节，不改写原始记录 |
| 撤掉一处我自己引入的不一致 | `.modal-btn` 全局基类原本带了"移动端 44px"规则，但 10 份 scoped 复制写死 `height:32px`（特异性更高），结果同一类按钮在手机上一半 44、一半 32。现改为全局统一 32px，实测引导弹窗按钮 32px | 44px 统一抬升仍按原计划排在下一周期（要连那 10 份复制一起改并做像素核对） |
| 评估后决定不做：测试层 `allowAnonymous` helper 化 | 不做。`allowAnonymous` 是安全默认的开闸开关，测试里显式写出来本身就是文档；漏写会得到一句很响的 401 红，比 helper 静默放行更好 | 后端优化计划 B4 相应作废，已在该文件标注 |
| 手机卡面「对话」入口的命中区（2026-10-25） | 上一版用 `padding + 负 margin` 撑本体，尺寸够但 `margin` 简写把 `margin-left:auto` 顶掉了，入口会从行尾挪到「已跟踪」旁边；改用批次 3-3 已有的透明伪元素手法（46×46，`--touch-min` + 2px）。实测：伪元素开/关时按钮与整行的 rect 逐卡一致（4/4 卡零位移），有效命中 45×47，`/character` 360 档 100%（25/25）、390 档 96.2%（25/26） | 量具 `evidence/commands/measure-card-meta.mjs`。取舍：46×46 透明区会盖住卡名底部若干像素，点在那片区域直接进对话而不是开抽屉——与已验收的星标做法（24 视觉 / 46 命中）同一代价。与「已跟踪」的净空是**推导**（`gap:12` + 额外 `margin-left:8` = 20，向左只伸 4），本机种子里没有已跟踪角色，未实测 |
| 会话闸门的"空闲放行"补测（2026-10-25） | `src/stores/chat.ts:76,87` 的放行腿原本零覆盖，即"闸门不误伤正常操作"这一半没被证明过。新增 2 条：空闲时三个委托按参数各被调到一次；生成中时三个委托一次都不许调。单测 4154 passed | 负向对照手法同既有守卫：把 `if (isGenerating.value) return` 去掉，第二条必红 |
| 覆盖率门做 A/B 定性（2026-10-25） | 用 `git worktree` 在 HEAD（b843fe3）+ 同一份 node_modules 上单跑覆盖率：HEAD 语句 76.82 / 分支 70.57，工作区 77.75 / 71.08，分母几乎相同（语句 16991 vs 17024）⇒ 不是口径漂移，也不是本批次引入 | worktree 与 junction 已清理干净（摘 link 后主仓 node_modules 条目数 460 → 460）；缺口最大的两处是 PG 集成覆盖的文件，本机无 PG 才显红 |
| 修掉一处我自己引入的 lint/typecheck 红 | `tests/tooling/import-boundaries.test.ts` 里 `statSync` 只 import 未使用 ⇒ lint 1 error、`vue-tsc` TS6133。删掉该 import 后 lint 0 error / 10 warning（与既有基线同数）、typecheck 退出码 0 | 这条红是本批次文件带来的，前一次 lint 记录里没有它，因为当时该文件尚未落盘 |
| 弹窗内部命中区（2D-P1-04 的一半） | 先立判据再改样式：新 spec `e2e/mobile/modal-touch-target.spec.ts` 跑出来是红的（引导弹窗 4 个里 3 个不足、确认弹窗 3 个全不足），随后在 `primitives.css` 移动断点内给 `.modal-btn`/`.modal-close` 加透明伪元素 ⇒ 4/4、3/3 达标 | 视觉零变化是量出来的：伪元素开/关时 `[role="dialog"]` 内所有按钮 rect 逐一相同（`evidence/commands/shot-modals-2026-10-25.mjs`）。截图 `after-p0/modal-onboarding-390-2026-10-25.png`、`modal-confirm-delete-390-2026-10-25.png` |
| 命中区缺口普查（只量不判） | 平板 768/834 两档 × 6 页 + 引导弹窗 + 角色抽屉 + 确认弹窗，共 329 处不足；`nav-item 51×32` 独占 168 处，角色抽屉内部 0 处 | 明细 `evidence/hit-area-census-2026-10-25.json`，脚本 `probe-hit-areas.mjs` + `aggregate-hit-probe.mjs`。普查过程中发现量具自己会算进"被遮罩盖住的背景元素"，已加"中心点必须命中自己"的过滤后重测（抽屉从 6 处变 0 处） |
| CI 失败根因定位 | 见第四节：只有依赖审计红，E2E 与 Tauri 全绿；工作区的依赖升级已修，待提交推送 | 推送需要你授权 |

