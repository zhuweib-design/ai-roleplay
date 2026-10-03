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
- 新增 `docs/dev/REAL_DEVICE_TEST_2026-10-03.md`：Web 端与移动仿真通道的实机分批测试记录（B0–B15 十六个批次，含模块划分依据、每批目标与验收标准、逐条证据、缺陷清单 D-1~D-10 与遗留项 L-1~L-12 / 观察项 O-1~O-18）。B10 为追加的"长历史专项"：以 IndexedDB 造数（0 模型消耗）实测群聊 150 条游标分页与单聊 320 条双向窗口化，确认页大小算术、`scrollTop` 补偿（10788 vs 理论 10788.7）、DOM 上限（恒 2×`RENDER_WINDOW`）与窗口外全文搜索均成立，同时暴露两项仅真实浏览器可复现的 P2 缺陷 —— D-5 打开长群聊落在列表中部、D-6 单聊顶部占位高度重复累加。B11 补测"入口级≠行为级"的三项：群聊归档只读语义（发消息被 store 层拒绝，但控件未表达只读态 ⇒ O-12）、单聊"回到底部"精确落底、F07 用户 Persona 确认已下线且残留 4 处待清理（⇒ O-13）。B12 把会话行的四个动作打到行为层：置顶双向可逆且按钮文案随状态翻转、删除走"确认删除/取消"两步且只删目标会话、新建为懒创建草稿；**归档被证实是空操作 —— `chat-session.ts` 写入 `archived` 后全仓无消费者（D-7）**，同时记录页按设计只索引群聊却命名"对话记录"（O-17）、时间显示为原始 ISO 并溢出压住操作按钮（O-18）。B13 把每条路由的主动作按遍（仍 0 模型调用）：`/profile` 登录降级提示可关闭、`/character` 收藏落库 + 导出 SillyTavern V2 JSON（personality / scenario 完整，反证 D-3 仅在版本快照构造处）+ 导入往返不覆盖同名、`/databank` 删除有确认模态；新发现两项 P2 —— **D-8 "展开分块"按钮与父级 `.card-header` 重复绑定同一 toggle，冒泡后开→关抵消导致按钮失效**、**D-9 随机事件模板/场景/结果完全只在内存（`stores/random-events.ts` 无任何持久化调用，备份也不纳入），刷新即丢**；同时修正 B4 对随机事件的过早"通过"结论，并把社区市场的"下载需登录 + 登录不可用 + 远程 404"合并为获取链路端到端不可达。B14 追查朗读链路：设置→扩展的 TTS 开关与触发条件确实写入 `settings.ttsConfig` 并跨刷新保持，启用后拦截到 `speechSynthesis.speak` 携带正确文本与语速/音调（朗读功能本身正常），此前"点了没反应"的真相是**未启用时静默无效，而同面板的翻译在未启用时会明确提示**（O-9 定性为反馈不对称，并补记播放中无"停止"态、`utterance.lang` 为空）。B15 追世界书注入链路：条目编辑"输入即写"落库、角色绑定持久化在 `characters.ext.boundWorldBookIds`（刷新后仍在）、上下文面板正确显示"1 本 / 1 条启用"；端到端注入因 AC20 锁定态无法观测，并由此暴露 **D-10 —— 锁定态把"密钥未解锁"报成"未配置 API Profile"，与同页头部显示的模型名自相矛盾，且用户已输入的正文随内存会话丢失**。
- 回写第三轮失真记录：轮次总览状态改为已完成、"仅本地提交不推送"约束与实际推送策略对齐并留痕、超大文件计数按实测修正（>2000 行 7 个，排除 i18n 语言包为 5 个代码文件）、设计文档"10 个子组件"与实际新增 5 个分区的偏差说明。
- 重新生成 `docs/dev/PROJECT_INDEX.md`（收录 `chat-*` 子 store、`toast-service`、`vendor-ort` 等），并更新 `QUICK_START.md` 的基线指标至 `b0adc0f`。

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
