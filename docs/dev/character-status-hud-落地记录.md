# P1 角色状态栏（Character Status HUD）—— 落地记录

> 日期：2026-09-20 ｜ 来源：竞品分析 `docs/other/tifa-ollama-webui-产品分析.md` §3.4 / §4 #4
> 设计依据：`docs/design/character-status-hud-增量设计.md`（§0.2 代码锚点表 / §3.5 边界用例 / §6 任务列表）
> 上游前置：P0 三项已落地（见 `docs/dev/llm-controls-p0-落地记录.md`），本轮**全面复用其基建**
> 状态：**已实现**，本地提交，**未 push**

---

## 1. TL;DR

把竞品的「角色状态栏」用符合本项目工程质量标准的方式重做一遍：
**`<status>` 标签协议 + 三级降级解析 + 角色卡自带 schema + 纯文本插值渲染**。

抄的是产品直觉，不是工程实现 —— 竞品用硬编码**中文关键词表**匹配 + `innerHTML` 全量重建 DOM；
我们用**英文结构化 key** 匹配（源码零中文）+ Vue 文本插值 + `v-memo`。

最关键的一点：**复用 P0 的 `ThinkingSplitter` 做二次剥离**，
只换标签为 `<status>`、`unclosedPolicy:'text'` → **零新状态机、四个 API client 零改动**。

---

## 2. 交付概览

| 项 | 值 |
|---|---|
| 新增文件 | 4（源码 3 + 落地记录 1）：`src/core/status-schema.ts`、`src/core/status-parser.ts`、`src/core/status-prompt.ts`、`src/components/chat/StatusHud.vue` |
| 新增测试 | 5 个文件：`tests/core/status-schema.test.ts`、`status-parser.test.ts`、`status-prompt.test.ts`、`tests/views/status-hud-ui.test.ts`（另在 `tests/services/chat-manager.test.ts` / `type-adapters.test.ts` 追加 P1 用例） |
| 改动文件 | 11：`character-card.ts`、`types/index.ts`、`chat-manager.ts`、`prompt-builder.ts`、`type-adapters.ts`、`settings.ts`、`chat.ts`、`ChatMain.vue`、`ContextPanel.vue`、`GroupChatView.vue`、i18n `zh.ts`/`en.ts` |
| 测试 | 全绿（新增 97 例） |
| 覆盖率 | **86.66 / 85.37 / 86.37 / 86.66**（基线 86.47/85.31/86.12/86.47，**四项全升**） |
| 门禁 | vue-tsc 0 错 · lint 0 错 · i18n strict ✓ · CSS 约定 5/5（`!important` **46 = 基线**）· 对比度 0 项低于 AA · build ✓ · CSP ✓ |
| 新增依赖 | **零** |
| 新增图标 | **零**（8 个内置字段全部复用 `icons.ts` 已有白名单） |
| 新增 `v-html` | **零** |

---

## 3. 五个任务完成情况

### T01 类型契约 + i18n 基建 + 内置字段表
- 新建 `src/core/status-schema.ts`：`StatusFieldDef` / `StatusSchema` / `StatusEntry` / `CharacterStatus` /
  `STATUS_FIELD_REGISTRY`（内置 8 字段）/ `StatusHudConfig` / `normalizeKey` / `normalizeStatusSchema` / `normalizeStatusHudConfig`
- `ChatMessage.status?`、`CharacterExt.statusSchema?` / `statusInstruction?`；`UIMessage.status?`、
  `UICharacter.statusSchema?/statusInstruction?`、`AppSettings.statusHudConfig?`
- i18n：`status.*` 双语 key 33 条（8 个字段展示名 + 25 条 UI 文案）
- **零迁移**：全部是可选字段，旧数据读出来 `undefined` → 不渲染

### T02 解析器 + 提示词模板 + 单测
- `status-parser.ts`：`createStatusSplitter` / `parseStatusComplete` / `extractStatusFence` / `stripStatusFence` /
  `parseStatusBlock` / `resolveLatestStatus`
- `status-prompt.ts`：`buildStatusInstruction`（**纯英文** + `// i18n-ignore-start/end` 块豁免）
- 单测覆盖 §3.5 的 **A-01..A-10 / B-01..B-13 / C-01..C-09 / D-01..D-05 / E-28..E-31 / F-01..F-05 全部**
  - 幂等不变量：6 组语料 × 20 个种子 × 随机切分，流式累积恒等于一次性解析
  - 逐字符切分穷举（标签撕裂 / emoji 代理对截断）

### T03 编排层挂载 + 提示词注入 + 适配器透传
- `chat-manager.ts`：`onStatus` 回调 + `statusInstructionEnabled` 配置 + `StatusSplitter` **串联**在 `ThinkingSplitter` 之后 +
  `done` / `error` / 流自然结束 / 工具轮超限 **四条退出路径**都做状态收敛
- `prompt-builder.ts`：`PromptContexts.statusContext?` 追加到 system（未注入时请求体逐字节不变）
- `type-adapters.ts`：`statusSchema` / `statusInstruction` 打包解包（ext 优先 + **顶层 legacy 回退**）+ 消息 `status` 透传
- **四个 API client（openai / anthropic / tauri / local）零改动**

### T04 Store 接线 + 会话级 HUD
- `settings.ts`：`statusHudConfig` ref + 持久化 + `setStatusHudConfig(patch)`
- `chat.ts`：`onStatus` → `liveMsg.status`；重新生成与编辑消息时清空（与 `thinking` 同款，防"旧状态 + 新正文"错配）
- `StatusHud.vue`：纯 props + `{{ }}` 文本插值 + `<Icon>` 白名单；`v-memo` 数组追加 `msg.status`
- **按主理人决策 2**：本轮只挂载**会话级 sticky HUD**，消息级 `ChatMessage.status` 照常存储但不渲染

### T05 角色级开关 + schema 编辑器 + 群聊覆盖
- `ContextPanel.vue`：状态指令三态（继承/开/关）+ 折叠式 schema 编辑器（key / label / type / icon / aliases / options，增删字段）
- `GroupChatView.vue`：按 `characterId` 分组派生成员状态 + `TODO`（mock 链路无真实状态输出，接入真实流式后自动生效）

---

## 4. 主理人 10 项决策的落实对账

| # | 决策 | 落实位置 |
|---|---|---|
| 1 | `statusHudConfig.enabled` 默认 **false** | `DEFAULT_STATUS_HUD_CONFIG` + 单测断言 |
| 2 | **只做会话级 sticky**（消息级照常存储不渲染） | `ChatMain.vue` 只挂 `variant="sticky"`；`StatusHud.vue` 两个 variant 均已实现待用 |
| 3 | 上一轮状态**不注入**上下文 | `prompt-builder` 只读 `content`，未新增注入；连续性靠 `carryForward` |
| 4 | 状态块从正文**移除，不留开关** | `convergeStatus()` 无条件剥离（四条退出路径全覆盖） |
| 5 | 未闭合残留归 **'text'** | `STATUS_SPLITTER_OPTIONS.unclosedPolicy` + 单测 A-05 / D-04 |
| 6 | `<status>` 写在 `<think>` 内 → 不提取（接受） | 两级串联天然如此；提示词已写 "outside any `<think>` block"；单测 E-28 固化 |
| 7 | schema 编辑器放 **`ContextPanel.vue`** | 新增 section（未动 `CharacterEditorView.vue`） |
| 8 | 群聊 mock **不塞假状态** | 只做数据结构 + 渲染覆盖 + `TODO` |
| 9 | 状态历史时间轴 **P2+** | 未实现 |
| 10 | `maxFields` 默认 **12** | `STATUS_MAX_FIELDS = 12` + 单测 B-12 |

---

## 5. 三条硬红线的守护

### ① i18n strict：源码零中文
匹配层只认**英文结构化 key**（`location`/`time`/`affection`/`identity`/`relationship`/`mood`/`thought`/`inventory`）。
展示名优先级：`labelI18nKey` > 角色卡 `label`（用户数据）> 内置 i18n > 原始 key。
需要中文 key → 走角色卡 `aliases`（用户数据），**源码里一个中文词都没有**。
`npm run i18n:check:strict`：src 全部 157 个文件通过。

### ② 图标零新增
8 个字段映射到 `map-pin`/`clock`/`heart`/`user`/`users`/`star`/`chat-circle`/`archive`（全部已注册）。
`tests/core/status-schema.test.ts` 断言每个图标 `getIconPath()` 非空（防改名漂移）。
`thought` 刻意不用 `brain`（已被 `ThinkingBlock` 占用，避免"想法"与"思考链"视觉混淆）。

### ③ CSP / XSS
`StatusHud.vue` 全程 `{{ }}` 文本插值，无 `v-html` / `innerHTML`。
单测断言：值含 `<img src=x onerror=alert(1)>` 时 DOM 中**无 `img` 元素**。
`npm run check:csp` 通过。

---

## 6. 与竞品的对照（为什么我们更鲁棒）

| 维度 | 竞品 | 本实现 |
|---|---|---|
| 状态来源 | 取最后一个代码块（正文有代码块就误判） | 只认 `<status>`（+ 收尾兜底 ```status 围栏） |
| 格式 | 无（正则猜） | 三级：JSON → 按行 → 放弃，永远不崩 |
| 字段识别 | 硬编码**中文关键词表** | 英文结构化 key + i18n 展示名 + 角色卡 `aliases` |
| schema | 全局固定 5 类 | **角色卡自带 `statusSchema`**；无 schema 退化为内置 8 字段嗅探 |
| 分隔符 | 只支持半角 `:` | 半角 `:` + 全角 `：` |
| 值含冒号 | 被截断（`time: 18:30` 丢一半） | 按**第一个**分隔符切，值保留 `18:30` |
| 渲染 | `innerHTML`（XSS 高危） | Vue 文本插值 + Icon 白名单 |
| 未闭合 | 无处理（整块错乱） | 残留归正文，**内容不丢** |
| 性能 | 每 chunk 全量重建 | `v-memo` + 状态只在闭合后写入 + 会话级单节点 computed |

---

## 7. 已知取舍（不是 Bug，别回退）

1. **`<status>` 写在 `<think>` 内不提取** —— 第一级 `ThinkingSplitter` 已把整段剥走（与 P0 对 `<think>` 的非嵌套取舍一致）。提示词已显式要求写在 `<think>` 之外。
2. **正文里的字面量 `<status>` 会被当开标签** —— 非嵌套语义的固有代价；未闭合时残留归正文，最多是不显示状态，正文永不吞。
3. **`StatusEntry.label` 在解析时烘焙** —— 切语言后旧状态条的名仍是原语言（重解析即更新）。这是设计文档 §2.1 明确的行为。
4. **未闭合时标签本身被剥离** —— 继承 P0 `ThinkingSplitter` 的行为；块内文本完整保留。
5. ~~**`showInline` 暂不接 UI**~~ —— **已于收尾轮补上**：决策 2 被放宽，`MessageBubble` 挂载 `StatusHud variant="inline"`（仅在 `msg.status` 存在时渲染，受 `statusHudConfig.showInline` 控制，默认开）；小屏（≤640）经 `collapsibleOnMobile` 显式开启折叠。会话级 sticky 与消息级 inline 并存，视觉上 sticky 是贴边通栏、inline 是气泡内圆角小卡。
6. **群聊 mock 链路无真实状态** —— `memberStatuses` 恒空，UI 不渲染；`TODO` 已注明待接入真实流式链路。

---

## 8. 门禁结果

```
npx vue-tsc --noEmit        → 0 错
npm run lint                → 0 错（仅 CharacterList.vue 两条既有 warning）
npm run i18n:check:strict   → ✓ src 157 文件无硬编码中文
npm run check:css-conventions → 5/5（!important 46 = 基线 46，未新增；I-7 未覆盖 0 条）
npm run a11y:contrast       → 0 项低于 AA
npm run test:coverage       → 86.66 / 85.37 / 86.37 / 86.66（四项全升）
npm run build               → ✓（vue-tsc 0 错 + vite build 通过）
npm run check:csp           → ✓ 0 违规
```

---

## 9. QA 独立验证第 1 轮 → 2 个源码缺陷修复（第 2 次提交）

QA 新写 91 例（89 过 / 2 败），两个失败均指向**源码缺陷**，已修复。

### D1 去重失效（真 bug）
`parseStatusBlock` 里 `byKey` / `orderOf` 用**原始 key** 存，而排序用**规范 key** 取 →
`{"location":"酒馆","place":"二楼"}`（schema 给 `location` 配别名 `place`）解析出 **2 条同 key 的 entries**，
HUD 会把"地点"渲染两次且 `v-for` 出现重复 key。

修复：存、取两侧统一用**规范 key**（`canonicalKey`），并补 C-10/C-11/C-12 三条回归用例
（别名重复输出去重、别名命中的 `order` 不退化、子串命中同样去重）。

### D2 mood 图标改为「不配图标」（主理人裁定）
`icons.ts` 白名单里**没有任何情绪/表情类图标**，`star` 是"收藏/评分"语义，
用来表示"心情"会让用户困惑 —— **少一个图标是正确的降级，不是缺陷**（宁缺勿滥）。

改动：`StatusFieldPreset.icon` 改为**可选**，registry 的 `mood` 去掉 `icon:'star'`。
`thought` 保持 `chat-circle`（不改成 `brain`：`brain` 已归 P0 思维链，避免两者视觉混淆）。
补 C-13 + schema 层两条断言固化该决策。

### 修复后门禁

```
npx vue-tsc --noEmit        → 0 错
npm run lint                → 0 错（仅既有 2 条 warning）
npm run i18n:check:strict   → ✓ src 157 文件无硬编码中文
npm run check:css-conventions → 5/5（!important 46 = 基线）
npm run a11y:contrast       → 0 项低于 AA
npm run test:coverage       → 3195 用例全过 · 86.69 / 85.61 / 86.37 / 86.69（四项未降）
npm run build               → ✓
npm run check:csp           → ✓
```

---

## 10. QA 第 2 轮回归 → 通过（路由判定 **NoOne**）

QA 第 1 轮的 2 条红灯全部转绿，本轮无新增源码缺陷。

| 项 | 结果 |
|---|---|
| QA 独立新写用例 | **96**（第 1 轮 91 + 第 2 轮 5），未复用工程师用例 |
| 全量 | **3200 用例全过**（116 文件，0 失败） |
| 覆盖率 | **86.69 / 85.61 / 86.37 / 86.69**（`status-parser` 95.91 / 91.3） |
| 门禁 | vue-tsc 0 错 · lint 0 错 · i18n strict ✓ · CSS 5/5（`!important` 46 = 基线）· 对比度 0 项低于 AA · build ✓ · CSP ✓ |
| 路由判定 | **NoOne** |

**关键验证结论**
- **请求体不变性**：关闭/缺省注入时，序列化请求与"无 P1 配置"**逐字节一致**
- **四条退出路径**（done / error / 流自然结束 / 工具轮超限）状态全部收敛，正文无 `<status>` 残留
- `<status>` 在 `<think>` 内**不提取**
- 未闭合残留归正文、**内容不丢**
- **XSS**：`StatusHud` 零 `v-html`，恶意值 `<img src=x onerror=...>` 仅文本插值、DOM 中无 `img` 节点
- **值含分隔符**：`time: 18:30`、`location: 咖啡厅: 二楼` 值保留完整（竞品在此处会被截断）
- **D2 渲染实测**：`mood` 命中时 mount 后 `findAll('svg').length === 0`（不是空壳节点）；对照组 `location` 仍渲染 1 个 svg，证明 `v-if` 双向生效

### 第 3 次提交：补强图标防漂移断言（QA 审视发现）
工程师为适配 D2，把「白名单集合 == registry 集合（8=8）」改成了「用到的图标 ⊆ 白名单」。QA 审视后指出：该断言是**双向**的，改后丢了"registry 未使用项"这一侧——而 `star` 正是该项，且 `ContextPanel.vue:263` 用 `[...STATUS_ICON_NAMES]` 作 schema 编辑器图标下拉，**用户仍可选 star**；若 `icons.ts` 改名/删除 star，将**无任何断言能检出** → 静默渲染空 svg。

补强（`b8a18f9`）：直接打在 `icons.ts` 的 PATHS 上、覆盖**白名单全量**，并把 `star` 的三重状态钉死（在白名单内 / 不在 registry 内 / 有实际路径），任一处被改都会立刻红。

---

## 11. 遗留风险（不是 Bug，别回退）

| # | 风险 | 说明 |
|---|---|---|
| R1 | 两块 `<status>` 落在**同一 chunk** | 原文拼接后降级为一条脏值。已固化"不崩/不丢"用例，仅显示不完美 |
| R2 | 单行多对非 JSON（`{location: 酒馆, time: 傍晚}`） | 后续 key 会粘进 value，只出 1 条。模型按提示词输出 JSON 时不会触发 |
| R3 | 群聊 mock 链路 | 无真实流式状态输出，`memberStatuses` 恒空、UI 不渲染；`TODO` 已注明 |
| ~~R4~~ | ~~`test:coverage` 偶发 worker RPC 超时~~ | ✅ **2026-09-21 已解决**：`test:coverage` 脚本固定 `--maxWorkers=2`（commit `319bee8`）。根因是 ONNX 重用例 15s+ 叠加覆盖率插桩压住主线程，导致 worker RPC 回调超时——**退出码 1 但用例全过（假失败）**。三次独立实测 EXIT=0 |

---

## 12. ⚠️ 需人工清理（删除被沙箱拦截）

沙箱 safe-delete 批量守卫拒绝了我们与 QA 的删除请求，以下均为**未跟踪文件**（不会污染提交，但建议清掉）：

```
tests\dbg-tmp.test.ts     ← 无断言、只 console.log，会随测试套件执行
qa-tmp-*.txt              ← 19 个（含 qa-verify.txt），命令输出重定向残留
qa-verify.txt
coverage-qa-tmp\          ← QA 临时目录
covtest\                  ← QA 临时目录
```

**另**：`.gitignore:55` 的 `docs/` 使整个 docs 目录（34 份 md）**不入版本库**，本文档与两份设计文档均只存在于本地磁盘。未擅自修改 `.gitignore`，待决策。
