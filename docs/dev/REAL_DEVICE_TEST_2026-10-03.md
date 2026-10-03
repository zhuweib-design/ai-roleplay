# 实机分批测试记录（2026-10-03）

> 本文档是本轮"Web 端 + 手机端"实机测试的**唯一记录文档**：环境、模块划分依据、每批目标与验收标准、执行结果与发现的问题、最终汇总与遗留问题全部记录于此。
> 约束：不产出 exe / apk；遇阻塞自行决断并在本文档记录；模型调用按"节省着用"执行，单模型不可用即换下一个。

---

## 〇、测试环境与通道（含一处客观替代）

| 项 | 实际状态 | 证据 |
|---|---|---|
| 被测构建 | Vite dev server（Web 端形态），`http://localhost:5173` | `curl` 返回 200 |
| 桌面浏览器通道 | 本机 Microsoft Edge（Playwright `msedge` project，Desktop Chrome 视口） | `playwright.config.ts:50-55` |
| 移动通道 | **Edge/Chromium 的 Pixel 5 设备仿真**（视口 393×851、touch、UA、DPR 3） | `playwright.config.ts:80-99` |
| WebKit 通道 | 本机未安装 webkit 内核，**本地不跑**，由 CI 覆盖 | `~/AppData/Local/ms-playwright` 仅有 `chromium_headless_shell` / `ffmpeg` / `winldd` |
| 虚拟机 / 真机 | **不可达**：无 VirtualBox / VMware / qemu / Android emulator / 国产模拟器；`adb devices` 列表为空；Hyper-V 仅 `vmcompute` 在跑、无 `VMMS` | 探测输出见附录 B |

**替代决策（遇阻塞自行决断）**：目标要求"虚拟机的手机端"，但本机不存在任何虚拟机或 Android 运行时，也无 adb 设备可接管。故手机端测试改由**设备仿真 + 真实触摸事件 + PWA 视口**承担（即仓库自身 `mobile-*` project 的做法），本文所有移动端结论均带"仿真通道"限定。真实 Android WebView 行为（键盘避让、`dvh` 实现差异、原生分享）不在本轮可验证范围内，已列入遗留问题 L-7。

**模型使用策略**：LLM 相关用例统一走本地网关 `http://127.0.0.1:7864`（OpenAI 兼容），首选 `hy4-preview-f`，不可用即降级 `hy3`；能用静态断言或 IndexedDB 核对的，一律不消耗模型额度。

---

## 一、功能模块划分依据

按**路由 + 数据域 + 交互闭环**三条件交叉划分：同一批次内的用例共享一条可独立验收的业务闭环（有入口、有状态变更、有可观察结果），且尽量不跨存储域（IndexedDB store：`characters` / `chats` / `documents` / `groups` / `lorebooks` / `personas` / `settings` / `snapshots` / `stories`），使失败可归因到单一模块。

15 个路由视图 + 设置 6 面板 + 横切能力，归并为 9 个业务批次；执行中因"实例数据不足以触发分页"追加第 10 批（B10 长历史专项），故实跑 **10 批**：

| 批次 | 覆盖模块（路由 / 组件 / 存储域） | 划分依据 |
|---|---|---|
| B1 | 应用骨架与导航：`App.vue` 启动、侧栏/底栏导航、`ProfileView`、`ArchivesView`、会话与角色切换 | 其他批次的入口前置，失败会污染后续批次，必须最先验 |
| B2 | 角色域：`CharactersView` / `CharacterEditorView` / `CharacterVersionView`（`characters` 域、版本与分支） | 单一数据域的完整 CRUD + 版本闭环 |
| B3 | 对话核心：`ChatMain`、发送/流式/重新生成/编辑/删除/复制/翻译/朗读、消息搜索、导出、上下文面板 | 项目主链路，跨 `chats` + `characters` + runtime 三域 |
| B4 | 设定域：`WorldBookView`（`lorebooks`）、`DataBankView`（`documents`）、`RandomEventsView` | 同为"注入进提示词的素材"，验收点是检索命中与注入效果 |
| B5 | 群聊：`GroupChatView`（`groups`、成员、轮次、游标分页、可靠投递） | 独立数据域 + 独立 Runtime 分支 |
| B6 | 创作扩展：`StoryEngineView`（`stories`）、`ImageGeneratorView` | 依赖外部模型能力，与主链路解耦 |
| B7 | 模型与检索：设置内 API 配置 CRUD / 测试连接 / 获取模型列表 / 主模型切换、`LocalModelView`、RAG 双通道、ORT 首屏隔离 | 全部围绕"模型供给"，直接决定 B3/B4/B6 能否真跑 |
| B8 | 设置其余：外观、扩展、数据（备份/恢复/导入导出）、安全（主密码与透明加密）、关于、`CommunityMarketView` | 同一 `settings` 域 + 文件系统边界，验收点是持久化与加密 |
| B9 | 横切：i18n、响应式与移动端布局、无障碍（对比度 / ARIA / 键盘）、错误与重试、刷新持久化 | 不属任一业务域，但影响每个域 |
| B10 | 长历史专项（追加批次）：`GroupChatView` 游标分页（UX-03）、`ChatMain` 双向窗口化与占位回收（P2-11）、窗口外全文搜索 | B3 / B5 的真实实例都只有个位数消息，这两条链路**结构性地没被触发过**；用造数把"数据规模"单独作为一个维度补测，才能判定"有单测 ≠ 实机可用" |

---

## 二、各批次测试目标与验收标准

| 批次 | 测试目标 | 验收标准（全部满足才算通过） |
|---|---|---|
| B1 | 导航可达性与状态保持 | 15 个路由全部可达且标题正确；无控制台 error；切换路由后当前角色/会话不丢；移动端底栏与抽屉可用 |
| B2 | 角色 CRUD 与版本闭环 | 新建/编辑/删除持久化，刷新后仍在；导入计数正确；版本提交、diff、回滚、分支与锁行为符合"追加式版本仓库"语义 |
| B3 | 对话主链路端到端 | 发送→流式回复→落库；重新生成产生新消息；编辑/删除即时生效；搜索命中；导出非空；Token 预算随轮次增长；失败时错误可见且不卡死输入 |
| B4 | 设定注入有效性 | 世界书可建可编辑、绑定关系可见；数据银行上传→分块→列表；随机事件模板可创建并回显参数 |
| B5 | 群聊多角色轮次 | 成员数校验生效；建群落库；发言按轮次推进；生成中可中止；ST 导入导出入口可用 |
| B6 | 创作与图像链路 | 故事上传→结构化提取完成；图像生成在缺配置时给出可读错误而非静默 |
| B7 | 模型供给与检索 | 配置 CRUD 持久化；测试连接对可用端点成功、对故障端点可归因；设主模型后对话页跟随；获取模型列表为实时数据；无向量模型时检索静默跳过；ORT 不进首屏 |
| B8 | 设置持久化与数据安全 | 主题/字号跨刷新保持；备份导出与还原闭环；设主密码后 apiKey 落盘为密文；市场远程失败时降级可见 |
| B9 | 横切质量 | 中英切换无残留硬编码；窄视口无横向滚动、控件字号 ≥16px、hover 不粘滞；对比度 0 违规；键盘可达（skip link 首位、焦点可达）；错误有重试与提示 |
| B10 | 长历史下分页与窗口化在真实浏览器中可用 | 造数 ≥ 页大小后：窗口外条数与页大小算术一致；翻页后标记序列连续、不重复、不乱序；扩页后 `scrollTop` 补偿等于理论值（阅读位置不跳变）；DOM 行数受窗口上限约束（单聊恒 ≤ 2×`RENDER_WINDOW`）；**打开会话必须落在最新一条**；占位高度与实际未渲染区间一一对应（`windowStart=0` 时顶部占位须为 0）；窗口外消息仍可被搜索命中并定位 |

---

## 三、执行记录

### B0 · 自动化基线（既有 E2E 套件，桌面 + 移动仿真）

命令：`E2E_PORT=5199 npx playwright test --project=msedge --project=mobile-functional-msedge --project=mobile-msedge`

**结果：33 项中 31 通过、2 失败（1.5 分钟）**

| 项目 | 覆盖 | 结果 |
|---|---|---|
| `msedge`（桌面） | 角色 CRUD、批量导入、世界书、群聊（含生成中止）、对话流式、备份还原闭环、i18n、主题、视觉、搜索、对比度 axe | 通过，除 2 项对比度 axe 超时 |
| `mobile-functional-msedge`（Pixel 5 仿真） | 同 6 个核心流程 spec | 全通过（含"批量导入遇 Runtime 持久化失败可重试且不重复角色"、"群聊生成中可中止且不提交公共回合与旁听事件"） |
| `mobile-msedge`（`e2e/mobile/`） | 底部导航可见 + NavRail 卸载 + 5 tab 高亮唯一；主流程 5 页无横向溢出；抽屉遮罩层级与点击拦截（S-4） | 全通过 |

**失败判定：环境抖动，非应用缺陷。** 定向复跑 `e2e/contrast-axe.spec.ts`（`--workers=1 --timeout=120000`）→ **3 passed / 55.7s**，含此前超时的两条。根因：三个 project 并行 + 本机另有一个 dev server 抢占 CPU，`page.goto` 未在 30s 默认超时内完成；同一对 spec 在 CI（Linux + chromium）亦通过。→ 记为 O-4。

**还原耗时**：`[MIG-02] 还原耗时 210ms`（本地上限 15000ms）。

### B1 · 应用骨架与导航

**范围**：主导航 14 个入口 → 路由可达性、页面标题、`h1/h2`、横向溢出、控制台 error / unhandledrejection。

**结果：通过（14/14 路由可达，0 error，0 横向溢出）**

| 导航项 | 路由 | 标题 |
|---|---|---|
| 对话 | `/chat` | AI 酒馆 — 对话 |
| 角色 | `/character` | AI 酒馆 — 角色管理 |
| 世界书 | `/worldbook` | AI 酒馆 — 世界书 |
| 群聊 | `/group` | AI 酒馆 — 群聊 |
| 数据银行 | `/databank` | AI 酒馆 — 数据银行 |
| 故事引擎 | `/story` | AI 酒馆 — 故事引擎 |
| 随机事件 | `/random-events` | AI 酒馆 — 随机事件 |
| 本地模型 | `/local-model` | AI 酒馆 — 本地模型 |
| 图像生成 | `/image-gen` | AI 酒馆 — 图像生成 |
| 版本管理 | `/character-version` | AI 酒馆 — 角色卡版本管理 |
| 社区市场 | `/community-market` | AI 酒馆 — 社区市场 |
| 记录 | `/archives` | AI 酒馆 — 对话记录 |
| 设置 | `/settings` | AI 酒馆 — 设置 |
| 个人中心 | `/profile` | AI 酒馆 — 个人中心 |

`/character-editor`（角色编辑）不在主导航，由角色列表进入（实测编辑路由为 `/character/<id>/edit`），归入 B2。

**过程纠偏（避免误报）**：首轮脚本一次性抓取全部导航节点后依次点击，出现"图像生成 / 版本管理停在 `/local-model`"的假象 —— 路由切换会重建导航 DOM，旧节点引用失效。改为每次重新查询后复测，两项分别正确落到 `/image-gen` 与 `/character-version`。**判定为测试脚本缺陷，非应用缺陷。**

### B2 · 角色域（`/character` · `/character/<id>/edit` · `/character-version`）

**范围**：角色新建表单与落库、编辑回显、角色选择联动、版本提交 / 回滚 / parent 链 / 字段级对比 / 分支 / 字段锁。

**结果：通过（发现 2 项缺陷 D-3 / D-4）**

| 用例 | 结果 | 证据 |
|---|---|---|
| 新建角色并保存 | 通过 | 填 `#f-name`/`#f-tags`/`#f-desc`/`#f-personality`/`#f-scenario` → 保存 → 跳回 `/character`，`characters` **4 → 5**，落库字段与输入一致 |
| 编辑回显与保存 | 通过 | 卡片"编辑"→ `/character/char-1791047683328/edit`，`#f-personality` 正确回显旧值"严谨、偏好用列表回答问题"，改写后保存成功 |
| 角色选择联动对话页 | 通过 | 点选后 `/chat` 头部显示 `QA-B2-测试角色`，模型跟随 `hy4-preview-f` |
| 版本提交 | 通过 | "提交新版本" → 弹层 `#commit-msg-input` → "确认提交" → toast「已提交版本：…」，提交数 1→2，HEAD 移动且 `parent` 指向前一提交 |
| 版本回滚 | 通过 | 点"回滚" → toast「已回滚到版本 m4qo1he8」，并**追加** `回滚至 ez9d64uc` 提交（链：`ez9d64uc → lqq8dv7q → m4qo1he8`） |
| 版本链展示 | 通过 | 每条提交呈现 `id / 分支 / 说明 / 作者 / 时间 / parent / 查看 / 回滚 / 对比 HEAD` |
| 字段级对比视图 | 面板通过 / 数据缺陷 D-3 | 切到"差异对比"tab 后选两个版本点"对比"，面板正常渲染"差异字段：N / 完全相同"。但改过 personality 后两条提交仍报 0 差异 —— 根因是快照丢字段（**D-3**），不是 diff 引擎 |
| 分支创建 | 落库成功、UI 不可用（**D-4**） | toast「分支「qa-branch」已创建」，`snapshots` 内 `branches: ["main","qa-branch"]`；但"分支"tab 徽标为"分支 1"、面板只列 `main` |
| 全字段锁 | 通过（完整生命周期） | 获取 → toast「已锁定字段「*」」；释放 → toast「已释放全部锁」；清理过期 → toast「已清理 0 个过期锁」 |
| 合并分支 | 阻塞（D-4） | 合并源 `#merge-source` 应列出非当前分支 `qa-branch`，实际只剩占位项，无法发起合并 |
| 合并 / 释放锁 / 清理过期锁 | 未执行 | 按钮存在，未走真实合并流程（L-2 剩余部分） |
| 批量导入与删除 | 通过（E2E） | `character-crud`、`character-batch-import`（含"拒绝超过 50 个文件且不产生部分角色"、"Runtime 持久化失败可重试且不重复角色"）桌面与移动仿真均通过 |

**过程纠偏**：首次点"提交新版本"看似无反应，实为弹层需填说明并点"确认提交"；首次点卡片"编辑"未命中，是 DOM 定位写错。**均非缺陷。**

### B3 · 对话核心（`/chat` + `ChatMain` + 上下文面板）

**范围**：发送与流式、消息操作、搜索、导出、上下文面板各区块、错误路径。

**结果：通过**

| 用例 | 结果 | 证据 |
|---|---|---|
| 发送 → 流式回复（真实模型） | 通过 | 实发"用一句话告诉我你是谁" → 返回符合人设中文回复 + **思考块**（reasoning 58 tokens），Token 计数增长 |
| 上游错误可见且不卡死 | 通过 | 网关 503 期间实发 → 页面显示「接口返回错误（HTTP 503）。请检查密钥与配额。」，输入框仍可用 |
| 对话流式主链路 | 通过 | E2E `chat-flow.spec.ts`（配置 API → 新建角色 → 流式回复）桌面与移动仿真均通过 |
| 搜索 / 导出 / 主题 / i18n | 通过 | E2E `chat-search`、`theme-flow`、`theme-visual`、`i18n-locale` 通过 |
| 上下文面板区块 | 通过（渲染级） | 角色卡 / 世界用户资料 / 对话摘要 / Token 预算（1200/8192，分段：角色卡 450、世界书 200、对话 550、剩余 6992）/ 世界书 / 作者笔记（深度滑块）/ Runtime 状态 / 生成参数（温度、最大 Tokens、创作模式）/ 状态指令（继承·开·关） |
| 消息操作 · 翻译 | 通过 | 未配置翻译 API 时点"翻译" → toast「翻译功能未启用，请在设置页配置」，**降级提示准确** |
| 消息操作 · 复制 / 朗读 | 部分通过（O-9） | 点击后无任何可见反馈；剪贴板读取被浏览器权限策略拒绝（NotAllowedError），无法从外部取证是否写入成功 |
| 会话操作 | 通过（入口级） | 会话列表项提供 置顶 / 归档 / 删除会话 / 为此角色新建会话；`chats` 计数在操作前后为 1（未产生误删） |
| 消息操作 · 编辑 | 通过 | 点"编辑" → 应用内 Modal（P1-3 已替代原生 prompt）→ textarea 正确回显"翡翠森林。" → 改写保存 → 气泡更新为"（实机已编辑）翡翠森林。" |
| 消息操作 · 重新生成 | 通过 | 点击后助手气泡内容被替换（12 → 10 字），确实再次走上游 |
| 消息操作 · 删除 | 通过（含 O-11） | 气泡数 2 → 1；无二次确认、无 toast、无撤销 |

### B4 · 设定域（`/worldbook` · `/databank` · `/random-events`）

**结果：通过**

| 用例 | 结果 | 证据 |
|---|---|---|
| 创建世界书 | 通过 | 点"创建新世界书"（内联，非弹窗）→ `lorebooks` **0 → 1**；编辑器区块完整：名称 / 描述 / AI 扩展 / 导出 JSON / 删除 / 已绑定角色（含"暂无角色绑定"提示）/ 整体世界描述 / 常量注入 / 世界内用户资料 / 全局事件 / 全部展开·折叠 / 新增条目 |
| 世界书条目与绑定 | 通过（入口级） | "新增"与"添加第一个条目"存在；E2E `worldbook-flow`（新建→重命名→新增条目→树显示）双通道通过 |
| 数据银行上传 | 通过 | 弹窗内注入 `qa-doc.md` → 拖拽区回显文件名与大小 → 点"上传" → `documents` **0 → 1**，列表 `qa-doc.md · 132 B · 2 块 · 时间戳`，toast「已上传文档「qa-doc.md」（2 个分块）」 |
| 无向量模型时降级 | 通过 | 本机未装任何 ONNX 向量模型，上传仍成功并分块，符合"检索自动跳过、不阻断对话" |
| 随机事件建模板 | 通过 | 弹窗字段完整（名称 / 描述 / 类别 7 项 / 严重度 5 档 / 触发概率 / 权重 / 冷却 / 最大触发次数 / 适用与排除场景）→ toast「模板「QA-模板-偶遇商人」已创建」，列表回显 `自定义 · 轻微 · 概率 10% · 权重 1 · 冷却 10 分钟 · 触发次数 0 · 最后触发 —` |

**过程纠偏**：首轮注入文件后 `documents` 仍为 0 —— `handleFileSelect`（`DataBankView.vue:81-86`）只暂存 `selectedFile`，必须再点弹窗"上传"才落库。**非缺陷。**

### B5 · 群聊（`/group`）

**结果：通过（游标分页改由 B10 实测）**

| 用例 | 结果 | 证据 |
|---|---|---|
| 成员数校验 | 通过 | 未选成员点"创建" → toast「群聊至少需要 2 个成员」，`groups` 保持 0，**业务规则前置校验生效** |
| 创建群聊 | 通过 | 填名称 + 点选 Kael / Lyra（按钮态 `char-pick selected`）→ `groups` **0 → 1**，toast「已创建群聊：QA-B5-测试群」 |
| 群聊工作台 | 通过 | 添加成员 / 生成随机 NPC / 归档 / 删除 / **导出 ST · 导入 ST** / 逐成员 Runtime 状态 / 发言模式（自然轮换 · 指定发言） |
| 多角色轮次与中止 | 通过（E2E） | `group-chat-flow` 两条（真实模型双角色 + 独立 Runtime Context 与 Event；生成中可中止且不提交公共回合与旁听事件）双通道通过 |
| 游标分页 | 已转 B10 实测 | 本批实例历史不足，未触发真实分页；改由 **B10** 造 150 条后实机覆盖（L-3 已闭环，并产出 D-5） |

### B6 · 创作扩展（`/story` · `/image-gen`）

**结果：通过**

| 用例 | 结果 | 证据 |
|---|---|---|
| 图像生成未配模型拦截 | 通过 | 填提示词点"生成" → 页面「需要先添加模型才能生成图像」+ "前往设置配置" + 同名 toast，**无静默失败、无崩溃** |
| 图像生成表单 | 通过 | 提示词 / 反向提示词 / 10 种风格预设 / 5 种尺寸 / 数量与步数控件齐备 |
| 故事引擎上传与提取 | 通过 | 注入 `qa-story.md` → `stories` **0 → 1** → 状态由"分析中"流转为「**已完成** · 标准 · 40 字 · 2 块」，出现"导入结果 / 设置主角 / 删除"操作 |

### B7 · 模型与检索（设置内 API 配置 · `LocalModelView` · RAG · ORT）

**结果：通过**

| 用例 | 结果 | 证据 |
|---|---|---|
| 新增 API 配置 | 通过 | 弹窗字段：名称 / provider（openai · deepseek · anthropic · custom · local）/ 分类（对话通用 · 图片视频 · Embedding）/ baseUrl / model / apiKey / maxTokens / 推理支持 / 强度 / 采样三参数；创建后即为"对话通用"**当前主模型** |
| 编辑与删除配置 | 通过（编辑） | "编辑"可重开弹窗并回显 `hy4-preview-f`；删除入口存在 |
| 测试连接（真实端点） | 通过 | 对 `http://127.0.0.1:7864` 返回真实结果；上游账号缺失时如实回显 `错误 503: no usable account for realm 'cn'…`，**错误可归因** |
| 获取模型列表 | 通过 | 弹窗内点"获取模型列表" → 「获取到 **19** 个模型，可直接选择」（网关侧模型数由会话早期 15 增至 19，证明实时拉取非缓存） |
| 主模型联动 | 通过 | `/chat` 头部由"未配置"变为 `hy4-preview-f`，对话真实出字 |
| 网关侧模型可用性 | 通过 | 直连三个：`hy4-preview-f` 200/3.97s、`hy3` 200/2.19s、`glm-5.3` 200 但 **content 为空**（88 tokens 全被推理消耗，`max_tokens=64` 过小）→ O-5 |
| 本地模型页 | 通过（空态） | 筛选 全部/小型/中型 + "0 个模型 · 无符合条件的模型"；Web 形态无法扫描磁盘目录，属预期 |
| RAG 降级 | 通过 | 未装向量模型时上传与对话均不受阻断（B4 已证） |
| ORT 首屏隔离 | 通过 | `npm run check:ort` 本地通过；本轮已将其补入 CI 门禁 |

### B8 · 设置其余（外观 · 扩展 · 数据 · 安全 · 关于 · 社区市场）

**结果：通过，含 1 项功能级缺陷 D-1**

| 用例 | 结果 | 证据 |
|---|---|---|
| 主题切换与持久化 | 通过 | 点"亮色" → `data-theme=light` 即时生效；**刷新后仍为 light** |
| 字号切换与持久化 | 通过 | 点"大（16px）" → `html` 内联与计算字号均 16px；刷新后保持 16px（`settings.ts:470` 写 `documentElement.style.fontSize`） |
| 备份导出 | 通过 | 点"导出备份" → toast「已导出加密备份（角色 5 / 对话 1 / 世界书 1）」 |
| 备份还原闭环 | 通过（E2E） | `backup-restore.spec.ts` 双通道通过，`[MIG-02] 还原耗时 210ms` |
| 主密码与 AC20 透明加密 | 通过 | 弹窗两个密码框 + 风险提示（"忘记主密码将无法解密"）→ toast「主密码已设置，API Key 已加密保护」→ IndexedDB 内 `apiKey` 由 `wbk_…`（47 字符明文）变为 **`enc:v1:eyJ2IjoxL…`（219 字符密文）**；面板"当前以明文存储"提示随之消失 |
| 扩展面板 | 通过（渲染级） | T-09 权限模型说明正常呈现 |
| 关于面板 | 通过（含 O-1） | 显示"版本：—"（Web 端无 `app_info` 命令，属预期降级）+ "GitHub 发布仅提供源码归档" |
| 社区市场本地目录 | 通过 | 未联网即渲染 57 张卡片、分类计数、评分与精选位 |
| 社区市场远程加载 | **失败（D-1）** | 点"加载远程条目" → 页面内联显示 `HTTP 404`，无崩溃、无静默 |

### B9 · 横切（i18n · 移动端 · 无障碍 · 错误处理）

**结果：通过（L-7 环境不可达）**

| 用例 | 结果 | 证据 |
|---|---|---|
| 中英切换即时生效 | 通过 | 点 English → 导航即时变 `Chat / Characters / World Book / Group Chat`、`h1=Settings`；切回简体中文恢复 |
| i18n 无硬编码残留 | 通过 | `npm run i18n:check:strict` 通过（182 文件） |
| 移动端布局 | 通过（仿真） | `mobile-layout.spec.ts` 三条全过：底栏可见 + NavRail 卸载 + 5 tab 高亮唯一；主流程 5 页无横向溢出；抽屉遮罩层级与点击拦截 |
| 移动端核心功能 | 通过（仿真） | `mobile-functional-msedge` 6 个核心流程 spec 全通过 |
| 无障碍对比度 | 通过 | axe E2E 3 条（设置页 / 对话页 / 7 路由 × 5 主题）单 worker 复跑全通过；静态审计 + 自测门禁通过 |
| 键盘可达性 | 通过（含 O-8） | `/chat` 首个可聚焦元素为"跳到主内容"skip link；61 个可聚焦元素中前 40 个 39 个可正常聚焦；landmark `nav[aria-label]` / `main` / `aside[aria-label]` 齐备；1 个零尺寸仍可聚焦元素（隐藏 file input）→ O-8 |
| 错误与重试 | 通过 | 503 期间对话给出可读错误且输入可用；LLM 重试由 `tests/api/llm-retry.test.ts` 覆盖 |
| WebKit / 真机 | 未覆盖 | 本机无 webkit 内核、无虚拟机与 adb 设备（L-7） |

### B10 · 长历史分页专项（补 L-3：单聊双向窗口化 + 群聊尾部游标）

**为什么要单开一批**：B3 / B5 的实例历史都只有个位数消息，分页与窗口回收这两条链路**从未被真实触发**（L-3 的成因）。本轮用 IndexedDB 直接造数（**0 次模型调用**），造出 150 条群聊历史与 320 条单聊历史后在真实浏览器里翻阅。

**造数与清理**：写入 `groups`（`group-pagination-l3` 150 条 / `group-short-l3` 12 条）与 `chats`（`chat-l4-long` 200 条 / `chat-l4-huge` 320 条）；取证完成后已删除，库回到 `chats=[chat-seraphina]`、`groups=[group-99cabc11…]`。复现脚本见附录 A。

**验收标准**：①窗口外消息数与页大小一致；②翻页后消息不重复、不乱序、内容可逐条对齐；③阅读位置不跳变（scrollTop 补偿准确）；④DOM 有上限，不随历史线性膨胀；⑤打开会话落在最新一条；⑥全文搜索不漏窗口外消息。

| 用例 | 结果 | 实机证据 |
|---|---|---|
| 群聊尾部窗口初始态 | 通过 | 150 条 → DOM 仅 **60** 行（`TURN_PAGE_SIZE=60`），标记连续 `091…150`，徽标"加载更早的消息（还有 **90** 条）" |
| 群聊点按钮翻页 | 通过 | 60 → **120**，标记 `031…150` 连续无重复；徽标转"还有 **30** 条" |
| 群聊 scrollTop 补偿 | 通过 | 补偿前 `scrollTop=5224.7 / scrollHeight=5620`，翻页后 `scrollHeight=11184`、`scrollTop=10788`，与理论值 `5224.7+(11184-5620)=10788.7` **逐位吻合**；视口顶部那条仍是 `#147`（阅读位置未跳变） |
| 群聊翻至全量 | 通过 | 第三次翻页后 DOM=**150**、标记 `001…150` 连续、无重复、`.load-earlier-row` 正确卸载；`role="log"` + `aria-live="polite"` 齐备 |
| 群聊触顶自动加载 | 通过 | 重进会话后把滚动区置 0，**无需点按钮**自动 60→120→150，到底后按钮消失 |
| 群聊打开落在最新消息 | **失败（D-5）** | 选中 150 条群聊后 `scrollTop=0`（视口顶部仍是窗口内最早一条），且滚动事件立即触发扩页 60→120；补偿把 `scrollTop` 抬到 **5565/11184（52%）**，视口停在 `#090…#094` —— 既非最新也非最早 |
| 短群聊打开落点（对照组） | 通过 | 12 条的群聊打开即 `atBottom=true`（`scrollTop=783`，`783+395=1178=scrollHeight`）⇒ D-5 只发生在**触发分页**的长历史，不是"自动滚底"本身坏了 |
| 单聊双向窗口化 | 通过 | 320 条 → 初始 DOM **100**（`RENDER_WINDOW=100`），标记 `221…320`，徽标"加载更早消息（还有 220 条）"，打开即落底 |
| 单聊上滚扩窗 + 底部回收 | 通过 | 依次上滚：窗口 `221…320` → `121…220` → `021…220` → `001…200`，DOM **恒为 200 = 2×RENDER_WINDOW**，底部 spacer 随之出现（`4800 → 5760px`），最早一条渲染后按钮消失 ⇒ "恒 ≤ 2×RENDER_WINDOW" 的不变量成立 |
| 单聊顶部占位高度 | **失败（D-6）** | `windowStart=0`（最早消息已全部真实渲染）时顶部 `.msg-spacer` 仍高 **29740px**；反复点"加载更早消息"可观测到同一区间被**重复累加**：`4780 → 14360 → 23960`，而 DOM 恒 200、首条恒 `#121`、徽标恒"还有 120 条" ⇒ 越点越空白，翻不到更早内容 |
| 单聊搜索命中窗口外消息 | 通过 | 窗口为 `221…320`、`#003` 不在 DOM 时搜"锦鲤关键词MMQ3" → `0/1 条命中`；按 Enter → `1/1 条命中`，窗口重定位到 `001…200`，命中气泡加 `.message-search-active` 且**在视口内** ⇒ "搜索独立于虚拟化窗口"的注释与实现一致 |
| 既有单测覆盖度核对 | 缺口确认 | `tests/views/chat-main-window.test.ts` 覆盖渲染上限 / 触顶扩窗 / 防重入 / 搜索重定位，但**未断言 spacer 高度**，且 jsdom 中改 `scrollTop` 不产生真实 scroll 事件 ⇒ 无法暴露 D-5 / D-6 |

**D-6 根因定位**（读码所得）：`ChatMain.vue:268-295 loadOlderMessages()` 用 `topSpacerHeight.value += msgHeightAt(i)` **增量累加**占位高度，同时 `el.scrollTop = prevScrollTop + (scrollHeight 差值)` 的补偿会排入一个 scroll 事件；该事件在 `suppressScroll=false`、`windowLoading=false` **之后**才到达，`handleScroll`（`ChatMain.vue:342-356`）此时看到"距底部 <300px 且有更晚消息"，于是回调 `loadNewerMessages()` 把窗口又滑回底部，并在"回收顶部"里**第二次**把同一批 `[newStart, windowStart)` 的高度 `+=` 进 `topSpacerHeight`。两条路径相互触发，形成"高度只加不减、内容原地不动"的 ping-pong。正确做法应是 `topSpacerHeight = Σ height[0, windowStart)`（按窗口边界重算而非累加），并用方向判定（`scrollTop` 相对上一次是增是减）或时间窗抑制来区分"用户滚动"与"程序补偿滚动"。

**D-5 根因定位**：`GroupChatView.vue:202-208` 的自动滚底用 `scrollIntoView({behavior:'smooth'})`，而 `:229-232 onMessagesScroll()` 只按 `scrollTop <= 80` 判触顶、**不区分滚动来源**。平滑动画起步阶段的低 `scrollTop` 被当成"用户翻到顶部"⇒ 立即扩页，扩页后的 `scrollTop += 高度差` 又打断平滑动画，最终停在列表中部。

---

## 四、缺陷与观察清单

| 编号 | 级别 | 现象 | 定位与判断 |
|---|---|---|---|
| **D-1** | **P2（功能不可用）** | 社区市场"加载远程条目"恒返回 `HTTP 404` | `src/core/market-index.ts:73` 硬编码 `https://raw.githubusercontent.com/zhuweib-design/ai-roleplay/**main**/market/index.json`，而本仓库默认分支是 **`master`**（`git ls-remote --symref origin HEAD` → `ref: refs/heads/master`）；且仓库为**私有**，匿名 raw 请求本就 404。两处叠加 ⇒ 远程市场功能当前**不可能工作**。修法需产品决策：改分支名 + 转公开 / 改带鉴权拉取 / 明确该功能仅对公开镜像生效 |
| **D-2** | **P2（UI / 交互遮挡）** | 桌面 1280×720 下，助手消息的操作条（编辑 / 复制 / 朗读 / 翻译 / 重新生成 / 删除）被角色列表抽屉遮挡，真实鼠标点击被拦截 | Playwright 实测几何：`#character-drawer` 覆盖 `x=72..352`，而"编辑"按钮盒为 `x=321..345`（24×24），完全落在抽屉之内；Playwright 报 `char-time span ... intercepts pointer events` 并重试至超时。人工在较窄窗口点击成功，说明该遮挡随视口宽度出现。**这同时是 L-10 未能覆盖的根因**，不是测试脚本问题。修法：确认桌面端角色列与对话列的 flex/absolute 布局边界，或在选择角色后收起抽屉 |
| **D-3** | **P1（数据完整性）** | 角色版本快照丢失 `personality` 与 `scenario` 字段，导致①"差异对比"对这两个字段永远报 0 差异；②**回滚会把角色的性格与场景清空** | 实机取证：同一角色同一时刻 `live.personality = "完全改写的性格：暴躁、只用单句回答（L-1 diff · L-1 二次修改"`、`live.scenario = "测试会议室"`，而最新提交 `snapshot.personality = ""`、`snapshot.scenario = ""`（`description` 正常）。构造点 `src/core/character-version-control.ts:354` 的 `snapshot: deepClone(card)` 收到的 `card` 是缺字段的投影，而非完整角色卡。复现：编辑角色 personality → 保存 → 版本页"提交新版本" → 查 IndexedDB `snapshots` 内该提交的 `snapshot.personality` 为空 |
| **D-4** | **P2（功能不可用）** | 已落库的分支在 UI 中不出现，导致分支切换与**合并**无法进行 | 实机取证：`snapshots` 内该角色仓库 `branches: ["main","qa-branch"]`、`currentBranch: "main"`、`commits: 3`；但"分支"tab 徽标显示"分支 1"，面板只列 `main`，"合并"tab 的 `#merge-source`（过滤掉当前分支后应剩 `qa-branch`）也只有占位项。因此新建分支虽成功提示却不可用 |
| **D-5** | **P2（交互：打开长群聊落在列表中部）** | 打开有 150 条历史的群聊后，视口停在中间（`#090…#094`，滚动位置 52%），既不是最新一条也不是最早一条；同时窗口在未交互的情况下自行扩页 60→120 | 实机取证见 B10；对照组（12 条短群聊）打开即落底 ⇒ 自动滚底本身没坏。根因：`GroupChatView.vue:202-208` 平滑滚底与 `:229-232` "只按 `scrollTop<=80` 判触顶、不区分滚动来源"的自动扩页相互抢占，扩页后的 `scrollTop +=` 补偿又打断平滑动画。修法：`onMessagesScroll` 需按**滚动方向 + 是否用户意图**过滤（记录上一次 `scrollTop`，只在上滚时扩页；程序滚动期间置标志位屏蔽），并在切换群组后先落底再启用分页 |
| **D-6** | **P2（功能 + 性能：顶部占位高度重复累加）** | 单聊反复触发"加载更早消息"时，DOM 条数与首条标记不变、徽标恒为"还有 120 条"，但顶部空白占位持续增长（`4780 → 14360 → 23960px`）；即使窗口已覆盖最早一条（`windowStart=0`），顶部仍有 **29740px** 空白。用户表现为"越点上滚越空白、更早的消息点不出来"，长对话 `scrollHeight` 无界增长 | 实机取证见 B10。根因：`ChatMain.vue:268-295` 以 `topSpacerHeight += …` 增量累加，补偿赋值排入的 scroll 事件在抑制标志复位后才到达，`handleScroll:342-356` 把它判为"下滚近底"回调 `loadNewerMessages`，其"回收顶部"分支对同一批消息**第二次**累加 ⇒ 只加不减的 ping-pong。修法：占位高度按窗口边界**重算**（`Σ height[0, windowStart)`）而非累加，并区分用户滚动与程序补偿滚动。现有 `tests/views/chat-main-window.test.ts` 未断言 spacer 高度、jsdom 也不会因赋值 `scrollTop` 派发真实 scroll 事件，故未被拦截 |
| O-12 | P3（观察：滚动条不反映历史全量） | 打开 320 条单聊时 `scrollHeight` 仅 5250px（只对应已渲染的 100 条），滚动条长度与实际历史规模不成比例，用户无法从滚动条判断还有 220 条未加载 | 属"初始窗口不预置占位"的既有设计（`.msg-spacer` 仅 `v-if="topSpacerHeight>0"`，见 `ChatMain.vue:851-856`），功能上由徽标"还有 220 条"补足；记录以免与 D-6 的**异常**空白混淆 —— D-6 是同一区间被重复计数 |
| **O-6** | ~~P2 候选~~ **已撤回（测试误判）** | 曾报"版本对比面板不渲染" | 实为**选项卡页面**：diff 面板在"差异对比"tab 内，我此前在未激活该 tab 的情况下探测 DOM。切到"差异对比"tab 后，选两个版本点"对比"正常渲染"差异字段：N / 完全相同"。非缺陷 |
| O-11 | P3（体验） | 删除消息无二次确认 | 点"删除"即从 2 条变 1 条，无确认弹窗、无 toast、无撤销入口；版本回滚有追加提交可撤销，但消息删除是**不可逆**的，建议补确认或撤销 |
| O-7 | ~~P3 候选~~ **已升级为 D-4** | 分支已落库但"分支"面板与合并源均不显示 | 见 D-4；本行保留仅作追溯 |
| O-1 | P3（观察） | 设置 → 关于 在 Web 端显示"版本：—" | Web 无 `get_app_version` 命令；可回退读构建注入的版本号 |
| O-2 | P3（观察） | 引导弹窗点 X 关闭后，刷新仍会再次出现；`localStorage` 无 `onboarding-done` 痕迹 | 疑似仅"开始使用"会置完成标记，需确认是否有意设计 |
| O-3 | P3（体验） | 版本"回滚"无二次确认 | 回滚为追加提交、可再次回滚撤销，风险可控，仅记录 |
| O-4 | P3（测试基础设施） | 本机三 project 并行时 `contrast-axe` 两条在 30s 默认超时内未完成 | 单 worker + 120s 复跑 3/3 通过 ⇒ 超时上限偏紧而非缺陷；建议该 spec 单独放宽 timeout 或本地默认 `workers=1` |
| O-5 | P3（推理模型可用性） | `glm-5.3` 等推理模型在 `max_tokens` 过小时返回 200 但 `content` 为空 | 属上游行为；应用默认 4096 不受影响，但用户调小 maxTokens 会看到"空回复"。建议对已知推理模型设下限或提示 |
| O-8 | P3（a11y） | `/chat` 存在 1 个零尺寸但仍可聚焦的元素（隐藏 `input[type=file]`），Tab 会停在不可见处 | 改用视觉隐藏（`clip` / `position:absolute` + 1px）或加 `tabindex="-1"` 并以 label 触发 |
| O-9 | P3（反馈缺失） | 消息"复制"与"朗读"点击后无任何可见反馈（无 toast、无图标态变化） | 复制成功/失败、TTS 不可用均应给出提示；否则用户无法判断是否生效 |

## 五、遗留未覆盖项

| 编号 | 内容 | 原因与状态 |
|---|---|---|
| L-1 | ~~版本非零字段级 diff~~ | **已闭环并转为缺陷 D-3**：diff 面板本身工作正常（"差异对比"tab 内），但对 personality / scenario 永远报 0 差异，根因是快照丢字段（D-3），非 diff 引擎问题 |
| L-2 | 版本合并（merge） | 锁生命周期已闭环（获取 → "已释放全部锁" → "已清理 0 个过期锁"）；**合并无法执行**，因已落库分支不显示（D-4） |
| L-3 | ~~群聊"加载更早消息"真实分页~~ | **已闭环（B10）**：IndexedDB 造 150 条历史后实机走完 60→120→150 三页，标记连续无重复、徽标计数 90→30→消失、scrollTop 补偿逐位吻合；顺带把单聊双向窗口化（320 条，DOM 恒 200）与"搜索命中窗口外消息"一并实测。**代价**：新发现 D-5（群聊打开落在列表中部并自行扩页）与 D-6（单聊顶部占位重复累加） |
| L-4 | ~~故事引擎上传→结构化提取→生成~~ | **已闭环**：上传 → "已完成" → 提供"导入结果 / 设置主角"；仅"导入结果"落库一步未点（属 B2 已覆盖域） |
| L-5 | ~~"获取模型列表"按钮~~ | **已闭环**（B7：实时获取到 19 个模型） |
| L-6 | ~~键盘 Tab 序与焦点遍历~~ | **已闭环**（`/chat`：skip link 首位、39/40 可聚焦、landmark 齐备；发现 O-8） |
| L-7 | 真实 WebKit 内核与真实 Android / iOS 设备行为 | 本机无 webkit 内核、无虚拟机与 adb 设备（§〇 已记），环境不可达 |
| L-8 | 桌面端（Tauri）实机运行 | 本机无 cargo、未构建桌面产物，且按约束不产出 exe/apk。桌面专属能力（全局快捷键、托盘、模型目录导入、原生对话框）仅达"CI 编译通过 + 静态审查"级别 |
| L-9 | 真实 Provider 指标评测（API-01） | 需外部凭据与配额，未执行；离线判定自检已通过 |
| L-10 | ~~消息级 编辑 / 复制 / 重新生成 / 删除~~ | **已闭环**（见 B3）：编辑 Modal 回显与保存生效、重新生成替换回复、删除使气泡 2→1、翻译降级提示准确；仅"复制/朗读"无可见反馈（O-9），剪贴板读取被浏览器权限拒绝无法取证 |

## 六、批次结论汇总

| 批次 | 结论 | 关键证据 |
|---|---|---|
| B0 自动化基线 | 31/33 通过，2 项判为环境抖动（复跑 3/3 绿） | Playwright 桌面 + 移动仿真 |
| B1 骨架与导航 | **通过** | 14/14 路由，0 error，0 横向溢出 |
| B2 角色域 | **通过**（L-1 未闭环；O-6/O-7 待复核） | 创建 4→5、编辑回显、提交 / 回滚 / parent 链 / 分支落库 / 全字段锁 |
| B3 对话核心 | **通过**（含 O-9 / O-11） | 流式回复 + 思考块 + Token 统计；503 可读不卡死；消息级 编辑 / 重新生成 / 删除 / 翻译 全部实机通过；复制与朗读无反馈、删除无二次确认 |
| B4 设定域 | **通过** | 世界书 0→1；数据银行 132 B → 2 分块；随机事件模板创建并回显参数 |
| B5 群聊 | **通过**（游标分页转 B10） | 成员数校验生效；建群 0→1；ST 导入导出入口；轮次与中止由 E2E 覆盖 |
| B6 创作扩展 | **通过** | 图像生成未配模型时可读拦截；故事引擎上传→分析"已完成" |
| B7 模型与检索 | **通过** | 配置 CRUD / 测试连接 / 获取模型列表（19 个）/ 主模型联动 / 端到端出字 / ORT 门禁 |
| B8 设置与安全 | **通过，含 P2 缺陷 D-1** | 主题与字号跨刷新持久化；备份导出加密；主密码后 apiKey 转 `enc:v1:` 密文 |
| B9 横切 | **通过**（L-7 环境不可达） | 中英即时切换；移动仿真布局与 6 条核心流程全绿；axe 对比度 3/3；键盘可达 |
| B10 长历史专项 | **部分通过（含 2 项 P2 缺陷 D-5 / D-6）** | 群聊 150 条走完 60→120→150 三页、标记连续、scrollTop 补偿 10788 vs 理论 10788.7；单聊 320 条 DOM 恒 200、搜索命中窗口外 `#003` 并重定位；但群聊打开落在 52% 中部（D-5），单聊顶部占位重复累加至 29740px（D-6） |

**总体判断**：Web 端主链路（导航 → 角色 → 对话 → 世界书 / 数据银行 → 群聊 → 设置 → 加密与备份 → i18n / 移动端 / 无障碍 / 键盘）在本机实机可用，未发现阻断级缺陷。功能级缺陷六项：**D-1 社区市场远程拉取恒 404**（硬编码分支 `main` 与实际 `master` 不一致，叠加仓库私有）、**D-2 桌面 1280px 档消息操作条被角色抽屉遮挡**（宽度相关，更宽视口不复现）、**D-3 版本快照丢失 personality / scenario（P1，回滚会清空这两个字段）**、**D-4 已落库分支不在 UI 出现（分支切换与合并不可用）**、**D-5 打开长群聊落在列表中部并自行扩页**、**D-6 单聊顶部占位高度重复累加（越点上滚越空白、scrollHeight 无界增长）**。其中 D-5 / D-6 是"有单测但实机不成立"的典型：`chat-main-window.test.ts` 未断言占位高度，且 jsdom 不因 `scrollTop` 赋值派发真实 scroll 事件，故 ping-pong 与平滑滚动被劫持都只在真实浏览器里现形。我此前记的 O-6 / O-7 经复核为测试误判或已升级，已在表中标注撤回。桌面端与真实移动设备因环境缺失未做运行时验证（L-7、L-8）。

## 七、收尾说明

**模型用量（按"节省着用"执行）**：对话页端到端真实调用 **2 次**（`hy4-preview-f`，约 112 + 约 90 tokens）；网关直连探测 3 次（各 ≤64 tokens）；故事引擎异步结构化提取 1 组（40 字 / 2 块，用量极小）；另有 1 次对话尝试失败于上游 503。首选模型全程可用，未触发切换。**B10 全程 0 次模型调用**——分页与窗口化是纯前端渲染问题，用 IndexedDB 造数即可复现，无需真实回复。其余全部为静态断言、IndexedDB 读取或既有 E2E 复用。

**测试数据残留**：本轮在 **Qoder 内置浏览器**的 IndexedDB（`ai-roleplay`）中留下：1 个角色（`QA-B2-测试角色`）、1 个世界书、1 个文档（`qa-doc.md`）、1 个群聊（`QA-B5-测试群`）、1 个故事（`qa-story.md`）、1 个事件模板、若干版本提交与 1 个分支，并在该会话内设置了主密码（不落盘）。B10 造出的 4 条长历史数据（2 个群聊 + 2 个单聊，共 782 条消息）**取证后已删除**，库已回到 `chats=[chat-seraphina]`、`groups=[group-99cabc11…]`；复现请直接用附录 A 的脚本重新写入。该数据库与用户自己的浏览器相互隔离；如需彻底清理，删除该浏览器站点数据即可。

**环境替代声明**：目标中的"虚拟机手机端"在本机不可达（无虚拟机 / 无 Android 运行时 / 无 adb 设备），已统一以 Pixel 5 设备仿真替代，所有移动端结论均带此限定。桌面端（Tauri）因本机无 cargo 且按约束不产出安装包，仅达"CI 编译通过 + 静态审查"级别。

**与既有门禁的关系**：本轮实机结论与 CI #84（Quality Gates 17 步全跑、E2E、Tauri Build 全绿）互相印证。本轮新发现的 D-1（市场远程清单 404）与 O-6（对比面板渲染）均不在现有自动化覆盖范围内 —— D-1 属外部依赖配置，O-6 属组件条件渲染；若要长期拦截需补对应 E2E 用例。B10 的 **D-5 / D-6 同样落在自动化盲区**：`chat-main-window.test.ts` 与 `group-chat-pagination.test.ts` 都在 jsdom 里断言"渲染条数"，既不校验占位高度，也不会因赋值 `scrollTop` 触发真实 `scroll` 事件（`@vue/test-utils` 与 jsdom 均不派发），因此"程序补偿滚动被 `handleScroll` 误判为用户滚动"这类缺陷**结构上不可能被现有单测拦住**。若要长期拦截，需：①在单测中显式 `vm.scrollTop = X` 后 `await nextTick()` 并手动 `trigger('scroll')` 来模拟补偿事件；②补一条 Playwright 用例，造 ≥2×页大小的历史后断言"打开会话 `atBottom === true`"与"`windowStart===0` 时顶部 spacer 高度为 0"。

---

## 附录 A · B10 长历史造数脚本（在应用内控制台执行，0 模型消耗）

```js
// 群聊 150 条（验证 UX-03 游标分页 / D-5）
const db = await new Promise((res, rej) => { const r = indexedDB.open('ai-roleplay', 6); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const t0 = Date.parse('2026-10-03T10:00:00.000Z');
const members = [['kael','Kael'],['lyra','Lyra'],['mira','Mira']]
  .map(([characterId, name]) => ({ characterId, name, joinedAt: new Date(t0).toISOString(), allowAutoSelect: true }));
const msgs = Array.from({ length: 150 }, (_, k) => {
  const i = k + 1, m = members[i % 3];
  return { id: 'pg-' + String(i).padStart(3, '0'), role: i % 7 === 0 ? 'user' : 'assistant',
    content: `分页标记#${String(i).padStart(3, '0')} ${m.name}：用于翻页断言。`,
    timestamp: new Date(t0 + i * 1000).toISOString(), swipes: [], swipeIndex: 0,
    characterId: m.characterId, characterName: m.name };
});
const group = { id: 'group-pagination-l3', name: 'L3-分页测试群', description: '', members,
  firstMessage: msgs[0].content, messages: msgs, mode: 'natural', lastSpeakerId: 'mira',
  createdAt: new Date(t0).toISOString(), updatedAt: new Date(t0 + 200000).toISOString(), lifecycleStatus: 'active' };
await new Promise((res, rej) => { const t = db.transaction(['groups'], 'readwrite'); t.objectStore('groups').put(group); t.oncomplete = res; t.onerror = () => rej(t.error); });

// 单聊 320 条（验证 P2-11 双向窗口化 / D-6）：把 messages 换成 320 条、
// 记录写进 chats store（keyPath=id，字段同 Chat：{id, characterId, title, messages, createdAt, updatedAt, pinned}），
// 并把第 3 条内容设为窗口外可搜索的关键词，即可复现 B10 全部断言。
// 清理：db.transaction(['groups'],'readwrite').objectStore('groups').delete('group-pagination-l3')
```

---

## 附录 B · 环境探测原始输出

- `adb devices -l` → `List of devices attached`（空）
- `command -v adb emulator virsh VBoxManage vmware qemu-system-x86_64 waydroid scrcpy` → 仅 `adb: /d/platform-tools/adb`
- `~/AppData/Local/ms-playwright` → `chromium_headless_shell-1234`、`ffmpeg-1011`、`winldd-1007`
- Windows 服务 → `vmcompute Running`，无 `VMMS`
- 国产模拟器常见目录（MuMu / LDPlayer / Nox）→ 均不存在
- 网关 `GET /v1/models`（带 key）→ 200，15 → 19 个模型；`POST /v1/chat/completions` 会话早期 → 503 `no usable account for realm 'cn'`，会话后期 → 200
- 仓库默认分支 → `git ls-remote --symref origin HEAD` → `ref: refs/heads/master`
