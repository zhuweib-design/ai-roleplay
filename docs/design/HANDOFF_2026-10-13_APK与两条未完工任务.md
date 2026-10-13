# 交接：APK 路线与两条未完工任务（2026-10-13）

给新会话用。这份文档自足，不需要读上一个会话的对话记录。

## 仓库当前状态

- 分支 `feat/ux-ia-guided-flow`，HEAD `3a83302`（这份文档本身）。本地领先远端 2 个提交（`c83fd8f`、`3a83302` 未推送）。推送需要用户单独点头，"继续"不算授权。
- **2026-10-13 续的工作还没提交**，在工作区里：`VectorModelPanel.vue`（任务 A 的竞态修复）、`ThinkingBlock.vue`（M20-b 字面量迁移）、`e2e/model-install-web.spec.ts`（新增）、`e2e/token-neutrality.spec.ts` + `e2e/neutrality-baseline.json`（夹具与基线）、`tests/core/model-file-adapter.test.ts`（环境选择守卫）、`e2e/shard-groups.mjs`（权重重生成）。按仓库纪律这是**两批**：逻辑修复一批、token 迁移一批，别混进同一个 commit。
- 未跟踪目录仍只有刻意不入库的两个：`docs/design/THEME_BRUTAL_SHOTS/` 截图、`docs/design/ai-chat-ui-redesign/` 原型源。
- 内置皮肤 9 套：dark / light / midnight / oled / theatre / terminal / aurora / ink / brutal。
- 门禁现状（跑这些命令即可复现）：
  - `npm run a11y:contrast` → 扫描存量 **67** = 基线 67；A 段 26 项 × 9 款全达标。
  - `npm run a11y:contrast:self-test` → 225 个组合全部解析得出颜色（这条是防"门禁空跑"的，见下）。
  - `npx playwright test e2e/token-neutrality.spec.ts --project=msedge` → 9 条全绿，基线 **5 个目标 / 8,568 个读数**（2026-10-13 续：气泡族补了 `.thinking-block` / `.thinking-header` / `.thinking-body` / `.thinking-tokens` 四个选择器，+612）。
  - `npm run check:css-conventions` / `check:token-baseline` / `token:self-test` 均退出码 0。
  - 全量单测 `npx vitest run` → 201 files / 3,940 passed / 3 skipped。
  - 全量 e2e：4 worker 复跑 **203 条全绿 / 6.7 分钟**；单 worker 终态跑数 **203 条全绿 / 12.1 分钟**，`e2e/shard-groups.mjs` 已按它重生成（4 组 179/179/178/179s，极差 1.007x；`token-neutrality` 权重 54.2 → 61.4，就是多出来的四个选择器与那次展开点击）。**新增一个 e2e 文件就必须重生成一次**，否则 `tests/tooling/e2e-shard-groups.test.ts` 红在"分组 37 项 vs 磁盘 38 个 spec"。
- 今天在这一串里修掉的两个门禁自身缺陷，别退回去了：
  1. `scripts/check-contrast.mjs` 的 A 段主循环曾把配对名拼成 `var(${check.fg})`（少 `--`），导致 26 项全部解析成 null、被"跳过而非误报"吃掉、恒打印"全部达标"。现在自检会用**与 A 段相同的取值路径**逐条确认 225 个组合都能解析，解析不出即退出码 1。
  2. 中性网的可见性轮询原来只报个数（"期望 7 实得 6"），现在返回"缺哪几个"，红了直接点名。

## 任务 A：已完成（2026-10-13 续），但原来的定位是错的

**这份文档上一版说"PWA 下模型导入必抛错"——不成立。** 现场核实：`VectorModelPanel.vue` 里所有 `modelFsIpc` 调用都包在 `if (isTauriEnv())` 内，模板里 Tauri 专属按钮是 `v-if="isTauriEnv()"`；真 Edge 打开 `/settings?cat=retrieval` 零页面异常。`model-fs-ipc.ts` 确实没有 Web 分支，但它压根不会被非 Tauri 环境执行到——选择条件在 `createModelFileAdapter()`（`model-file-adapter.ts:160`），判"是不是 Tauri"在这里是对的，不用改成"有没有原生文件能力"。

**真缺陷在降级路径自己身上，已修**：`<input webkitdirectory>` 是回调式的，`pickAndInstall()` 里 `input.click()` 一返回就去做 `refreshInstalled()` 和"模型安装完成"的 toast，而文件还在 `onchange` 里往 IndexedDB 写。实测形状：文件确实进了 IndexedDB（键 `model/bge-small-zh-v1.5/model.onnx` 在），但"已安装"列表是空的，用户看到的是"未安装本地模型"。改成 `pickDirectoryFiles()` 返回 Promise，拿到文件、写完库才刷新与提示；取消时不占 `installing`（部分内核取消不回报任何事件，否则按钮一直灰着）。

留下的三道锁（都做过负向对照，详见下一节）：

1. `e2e/model-install-web.spec.ts`：面板可达 + Tauri 专属入口不出现 + 整页没加载过 `@tauri-apps/api/*`。
2. 同文件第二条：点"选择模型文件夹"→ 真实目录夹具 → 断言 IDB 键到位 **且已安装列表看得见**（只断言"不报错"会放过"降级分支没跑到"）。
3. `tests/core/model-file-adapter.test.ts` 新增 `createModelFileAdapter 的环境选择`：非 Tauri 下 spy 一次 `invoke` 都不发；同一文件里把 `__TAURI_INTERNALS__` 装上，spy 必须真的被调用（证明这条不是空跑）。

**没验的**：webkit 内核下"取消不回报事件"那条兜底没实测，只按 Chromium 的 `cancel` 事件写的；`installing` 期间按钮不再禁用（选择框是原生模态，点不到第二次），这一点没写用例。

## 任务 B：已完成（2026-10-13 续），`.cache-rate` 是结构性采不到、与 SSE 形状无关

背景：M20-a 立了纪律"只改中性网采得到的规则"，气泡族采不到所以留到现在。这一轮把夹具建起来了。

已完成（在 HEAD 里）：

- `e2e/token-neutrality.spec.ts` 新增 `chat-bubbles` 目标 + `seedConversation` 夹具：打桩 chat completions → 设置页建指向 `/mock` 的 API 配置 → `/chat` 真实发一条消息 → **等 IndexedDB 的 `chats` 记录里 `messages` 到位**（等值不等时间）。
- 清单收了 5 个稳定可见的选择器：`.chat-messages`、`.msg-bubble`、`.msg-bubble.msg-assistant`、`.msg-bubble.msg-user`、`.chat-composer`（2026-10-13 续补到 9 个，见下面"结论与剩下的事"）。
- 牙齿实测过：`.chat-composer` 的 `border-radius` 从 `var(--radius-xl)` 改成 21px ⇒ 网点名 `chat-bubbles/terminal/.chat-composer { border-top-left-radius }: 3px → 21px`。
- 已迁字面量（像素中性，被上面这张网量出来的）：气泡 `padding: 12px var(--spacing-md)` → `var(--space-3) var(--space-4)`、`font-size: 14px` → `var(--font-size-md)`；`.chat-messages` 的 `padding 16px 24px` → `var(--space-4) var(--space-6)`、`gap 4px` → `var(--space-1)`；`.chat-composer` 的 `padding 12px 12px 10px` → `var(--space-3) var(--space-3) var(--space-2-5)`。

结论与剩下的事：

- **`.cache-rate` 采不到，原因不是回片形状**：它的显示条件是 `chatStore.prefixCacheHitRate !== null`，而 `cacheUsage` 是 `chat-generation.ts:242` 里的**内存 ref**；中性网每个目标采样前那句 `goto(t.route)` 是整页重载，一重载就归零。2026-10-13 续用"非零 hit/miss 且放在 `[DONE]` 之前"的正确回片实测（这种形状在单测里早就锁过：`tests/api/openai-client.test.ts:669`），可见数仍是 0，网直接点名 `缺 1/7：.cache-rate`。所以它和 `.gen-text` 同属"生成中的那一刻"那一族——要护就得在**不重载的页面生命周期里**单独写断言，挂进这张网只会让它空转。这条判断已写进 `token-neutrality.spec.ts` 的 `chat-bubbles` 注释里。
- **`.thinking-block` 一族四个选择器已进网**：`.thinking-block` / `.thinking-header` / `.thinking-body` / `.thinking-tokens`。配套改了夹具：回片首片带 `delta.reasoning_content`（思考随消息落 IndexedDB，活得过 reload），末片带 `usage.completion_tokens_details.reasoning_tokens`（`ThinkingBlock.vue:84` 只认正数，0 与没上报同一种表现），并给该目标加 `open: '.thinking-header'` 把折叠正文召唤出来（`.thinking-body` 是 v-if）。读数从 7,956 → 8,568，多出来的正好是 4 个选择器 × 9 款 × 17 属性。
- **M20-b 的正题（`ThinkingBlock.vue` 字面量迁移）已做完且像素中性**：`gap: 6px` → `var(--space-1-5)`、`padding: 6px var(--spacing-sm)` → `var(--space-1-5) var(--space-2)`、`font-size: 12px` → `var(--font-size-xs)`、`font-size: 11px` → `var(--font-size-2xs)`、`--spacing-sm` 旧别名全部换掉（`.thinking-block` 的 `margin-bottom`、`.thinking-body` 的两处 padding）。9 款全绿，且基线里 `.thinking-header { row-gap }` = 6px、`{ padding-top }` = 6px、`{ padding-left }` = 8px、`{ font-size }` = 12px 这些读数都在——不是白迁。
- **牙齿又验了一次**：把 `gap` 从 `var(--space-1-5)` 改成合法但档位不同的 `var(--space-2)`，网红在 `chat-bubbles/terminal/.thinking-header { row-gap }: 6px → 8px`（这正是这张网存在的理由：静态守卫抓不到"引用合法但换了尺度"）。
- **仍刻意不收进网**：`.thinking-pulse`（`generating && !expanded` 的瞬态）与 `.gen-text`，以及 `.thinking-pulse` 里那对 `width/height: 6px`。
- **气泡族下一批可迁的**：`MessageBubble.vue:95` 的 `:style="msg.narration ? 'margin-top: 6px' : ''"` 是内联字面量，网采不到内联样式的 token 归属，要先决定是把它挪进 class 还是登记成边界。

## 任务 C：APK 路线（结论：壳可行，但有四处必须先修/先测）

用户 2026-10-13 改口要出 APK，并指定参考 `D:\AI_data\xiaoshuo_skill_kaifa`。

参考项目的做法（已读，可照搬）：Capacitor 套 Web 产物 + `novel-studio/scripts/android-apk.mjs`（156 行）。流程是 `vite build` → 模型瘦身 → 清旧 assets models → `cap sync` → 检测 JDK，若 <21 自动把 Capacitor 硬编码的 `JavaVersion.VERSION_21` 降到 17 → `gradlew assembleDebug --rerun-tasks`（debug keystore 自动签名）→ 复制 APK 到 `installer/`。两个细节值得抄：`--rerun-tasks` 是因为 `cap sync` 增量同步会残留旧模型目录且 gradle 命中缓存不重编；JDK 降级是因为 Capacitor 8 写死 21。

工具链不用下载：`D:\AI_data\xiaoshuo_skill_kaifa\.android-toolchain\` 里有 `jdk-21.0.12.1+1`（`bin/java.exe` 在）和完整 SDK（`build-tools` / `cmdline-tools` / `platform-tools` / `platforms` / `system-images` / `emulator`，`licenses` 目录存在说明许可已接受）。SDK 路径写在该项目的 `novel-studio/android/local.properties`。这些都不在 PATH 里，要用环境变量显式指。

本仓已实测的部分：

- Tauri 耦合面很小：只有 3 个文件、8 处 import（`src/api/tauri-openai-client.ts`、`src/core/model-fs-ipc.ts`、`src/storage/tauri-fs-adapter.ts`），且都由 `isTauriEnv()` 当适配器选择（`src/api/index.ts:56`、`App.vue:246`、`VectorModelPanel.vue:27`）。
- `npm run build` 通过，PWA 的 `sw.js` 正常生成。
- 起 `vite preview` 后真浏览器跑 9 条路由（`/`、`/chat`、`/group`、`/character`、`/worldbook`、`/databank`、`/image-gen`、`/settings?cat=model`、`/settings?cat=security`）：**全部 `data-app-ready=1`、控制台与页面异常 0 条**。环境判定 `tauriInternals=false`、`indexedDB` 在、`serviceWorker` 在。
- 密钥/主密码加密走 `crypto.subtle`（`src/core/api-key-crypto.ts:146-197`），WebView 是安全上下文，能用。

没验、不能下结论的两项：备份与恢复（`src/core/backup.ts`、`backup-crypto.ts` 到底走浏览器下载还是 Tauri 保存对话框）；本地 ONNX/ORT 推理在安卓 WebView 的可用性（`scripts/check-ort-firstscreen.mjs` 只测过桌面，安卓 WebView 的 wasm 内存上限是真实风险）。CORS 原本是第三项，2026-10-14 已量，见下。

**CORS 这条已经量过（2026-10-14），原文"最硬的一条"这个判断被推翻了一半。** 判据不是猜 OPTIONS，而是在真实 Edge 里发应用同一形状的请求：`fetch` 能读到响应 ⇒ 跨域放行；`fetch` 抛 `TypeError` 但 `mode:'no-cors'` 能到 ⇒ 服务器可达、被 CORS 拦；两者都不通 ⇒ 不可达，不计入结论。Origin 用 `http://localhost`，与 Capacitor 安卓 WebView 的 origin 同一形态。

| endpoint | 判定 |
| --- | --- |
| api.openai.com | 放行（HTTP 401） |
| api.deepseek.com | 放行（401） |
| api.moonshot.cn | 放行（401） |
| dashscope.aliyuncs.com | 放行（401） |
| api.siliconflow.cn | 放行（401） |
| api.groq.com | 放行（401） |
| openrouter.ai | 放行（401） |
| generativelanguage.googleapis.com | 放行（400） |
| 用户自己在用的那个中转 | 放行（401） |
| open.bigmodel.cn（智谱） | 被 CORS 拦（服务器可达） |
| api.anthropic.com | 缺一个请求头，已修，见下 |
| 127.0.0.1:11434（ollama） | 本机没跑服务，未测 |

十条里九条放行 ⇒ "多数 provider 不发 CORS 头"不成立；真正的拦点是**自建与小中转这条长尾**，本次样本没覆盖到它，别把 9/10 当成"长尾也没事"。

修掉的一条（顺带影响桌面版）：`api.anthropic.com` 之前**一直**连不通，原因不是服务端政策，是我们少带官方要求的 `anthropic-dangerous-direct-browser-access: true`。同一套头做 A/B：不带 ⇒ 被 CORS 拦（服务器可达）；带上 ⇒ 放行到 HTTP 401。`AnthropicClient` 走的是 `fetch`（不是 Rust reqwest），所以这条在 Tauri 桌面版里同样存在，`anthropic-client.ts:24` 原来那句"官方支持 CORS，Web 与 Tauri 通用"是错的，已改。补进 `buildHeaders` 与 `listModels` 两处，各有一条单测断言这个头存在（注释掉即红，实测过）；再用应用自己的"测试连接"在真实浏览器里复跑一次，结果从"网络请求失败"那一类变成 `API 错误 401: invalid x-api-key`。

**决策：现在不引 Capacitor Http。** 理由是按上面的读数，WebView 下绝大多数配置能直接跑；为一条长尾把所有请求改走原生，代价是丢掉 `fetch` 的中止语义并要重写 `openai-client` 的读流。该做的是把"被 CORS 拦"变得可诊断：`classifyFetchError` 现在把 CORS 与断网统一归到 `network`（`openai-client.ts:323` 的注释自己就写着"TypeError 信息无法直接区分"），而 `diagnostics.ts:53` 那套 `cors` 分类和四条建议**当前没有任何代码路径产生它**。用一个 `mode:'no-cors'` 探测请求就能三分（no-cors 到得了 ⇒ 是 CORS；也到不了 ⇒ 真不可达），把它接进 `ApiError.kind='cors'`，用户看到的就不再是"网络请求失败"这种含糊话。真要治智谱那类服务端不发头的，再按"仅对该 endpoint 改道原生"设计 Capacitor Http，不做全局默认。

顺序建议（2026-10-14 更新）：任务 A、B 已收口，CORS 已量并修掉 Anthropic 那条 ⇒ 下一步是上 Capacitor 出 debug APK 装真机，然后拿真机验剩下两项未测（备份恢复、ORT 在 WebView 的内存上限）。装机前值得先做那条小改：把 `ApiError.kind='cors'` 真的接出来（`diagnostics.ts:53` 那套建议现在没人产生），否则手机上"连不上"与"这家不接受浏览器跨域"在界面上是同一种含糊话。另补一条与本目录既有事实相关的提醒：APK 的 WebView 里 `isTauriEnv()` 为 false，走的就是任务 A 这条 Web 降级，而 `webkitdirectory` 在安卓 WebView 上是否可用**没实测过**——不可用时面板会给"改用 zip 上传"的提示（`vector.dirPickUnsupported`），zip 那条路径是 `userStore.uploadFromZip` → IndexedDB，逻辑上是通的，但同样没在 WebView 里跑过。

## 约束（别踩）

- 绝不放宽 Tauri 的 plugin fs scope（历史上靠自定义 Rust 命令 `model_files.rs` 解决，有 `id_to_filename` / appData 根 / 二进制 IPC 三个坑）。
- 用户贴过的 API key 一律不得写进任何仓库文件（含 .env、测试夹具、文档、日志）。
- `artifacts/backup/` 不许删。真实稿件（`D:\AI_data\春山玉`）及其截图不进仓。
- 不擅自 merge 到 master、不擅自推送；推送需单独点头。
- 视觉改动单独成批、单独提交，不与中性迁移混在一个 diff。
- 声称完成前自己复跑一遍相关门禁，并明确说哪些没测。
