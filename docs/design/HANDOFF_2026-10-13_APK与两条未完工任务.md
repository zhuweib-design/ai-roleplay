# 交接：APK 路线与两条未完工任务（2026-10-13）

给新会话用。这份文档自足，不需要读上一个会话的对话记录。

## 仓库当前状态

- 分支 `feat/ux-ia-guided-flow`，HEAD `c83fd8f`，工作区干净（只有两个刻意不入库的未跟踪目录：`docs/design/THEME_BRUTAL_SHOTS/` 截图、`docs/design/ai-chat-ui-redesign/` 原型源）。
- 本地领先远端 1 个提交（`c83fd8f` 未推送）。推送需要用户单独点头，"继续"不算授权。
- 内置皮肤 9 套：dark / light / midnight / oled / theatre / terminal / aurora / ink / brutal。
- 门禁现状（跑这些命令即可复现）：
  - `npm run a11y:contrast` → 扫描存量 **67** = 基线 67；A 段 26 项 × 9 款全达标。
  - `npm run a11y:contrast:self-test` → 225 个组合全部解析得出颜色（这条是防"门禁空跑"的，见下）。
  - `npx playwright test e2e/token-neutrality.spec.ts --project=msedge` → 9 条全绿，基线 **5 个目标 / 7,956 个读数**。
  - `npm run check:css-conventions` / `check:token-baseline` / `token:self-test` 均退出码 0。
- 今天在这一串里修掉的两个门禁自身缺陷，别退回去了：
  1. `scripts/check-contrast.mjs` 的 A 段主循环曾把配对名拼成 `var(${check.fg})`（少 `--`），导致 26 项全部解析成 null、被"跳过而非误报"吃掉、恒打印"全部达标"。现在自检会用**与 A 段相同的取值路径**逐条确认 225 个组合都能解析，解析不出即退出码 1。
  2. 中性网的可见性轮询原来只报个数（"期望 7 实得 6"），现在返回"缺哪几个"，红了直接点名。

## 任务 A：修 `model-fs-ipc` 没有 Web 降级（PWA 下模型导入必抛错）

优先级最高，因为它是**今天就存在**的产品缺陷，与出不出 APK 无关。

证据（已实测定位）：

- `src/core/model-fs-ipc.ts:17` 无条件 `const { invoke } = await import('@tauri-apps/api/core')`，随后 `invoke('pick_model_dir' | 'list_model_dir' | 'read_model_file' | ...)`，**没有任何非 Tauri 分支**。
- 调用方：`src/core/model-file-adapter.ts:137-155`（`hasModel` / `copyFiles` / `readModel` / `readModelText` / `listInstalled`）、`src/core/vector-model-tauri.ts:16-27`、`src/components/settings/VectorModelPanel.vue:115-116`（`pickDir`）。
- 旁边已经有两套实现：`src/core/vector-model-storage.ts`（IndexedDB 版，走 `indexedDB`）与 `src/core/vector-model-tauri.ts`（桌面版），`VectorModelPanel.vue:27` 在两者间选。所以缺的不是重写，是**选择条件写错了**：判的是"是不是 Tauri"，应该判"有没有原生文件能力"。
- 动手前先读 `src/App.vue:245-248`：那里用 `TauriFSAdapter.getUnimplementedFeatureNames()` 主动提示"未实现能力"。说明当年是有意留白，不是漏写——改的时候要把这份提示的口径一起对齐，别让它变成谎报。

验收标准（都要做，缺一条不算完成）：

1. 浏览器环境（`window.__TAURI_INTERNALS__` 不存在）下，设置→模型 里点"选择模型目录"不抛未捕获异常，走 File System Access API 或 `<input type=file>` 的降级路径，并能真的把一个模型装进 IndexedDB。
2. 负向对照：把降级分支临时改成 `throw`，确认有用例红；还原后绿。守卫自己可能是空跑的，必须双向验。
3. 加一条 e2e 或单测锁住"非 Tauri 环境不调用 `invoke`"——最省事的写法是断言 `model-fs-ipc` 的导出在非 Tauri 下走的是另一条实现，而不是断言"没报错"（没报错和没跑到是两回事）。

## 任务 B：中性网气泡族（`.cache-rate` 卡住，`.thinking-block` 已通）

背景：M20-a 立了纪律"只改中性网采得到的规则"，气泡族采不到所以留到现在。这一轮把夹具建起来了。

已完成（在 HEAD 里）：

- `e2e/token-neutrality.spec.ts` 新增 `chat-bubbles` 目标 + `seedConversation` 夹具：打桩 chat completions → 设置页建指向 `/mock` 的 API 配置 → `/chat` 真实发一条消息 → **等 IndexedDB 的 `chats` 记录里 `messages` 到位**（等值不等时间）。
- 清单收了 5 个稳定可见的选择器：`.chat-messages`、`.msg-bubble`、`.msg-bubble.msg-assistant`、`.msg-bubble.msg-user`、`.chat-composer`。
- 牙齿实测过：`.chat-composer` 的 `border-radius` 从 `var(--radius-xl)` 改成 21px ⇒ 网点名 `chat-bubbles/terminal/.chat-composer { border-top-left-radius }: 3px → 21px`。
- 已迁字面量（像素中性，被上面这张网量出来的）：气泡 `padding: 12px var(--spacing-md)` → `var(--space-3) var(--space-4)`、`font-size: 14px` → `var(--font-size-md)`；`.chat-messages` 的 `padding 16px 24px` → `var(--space-4) var(--space-6)`、`gap 4px` → `var(--space-1)`；`.chat-composer` 的 `padding 12px 12px 10px` → `var(--space-3) var(--space-3) var(--space-2-5)`。

未完成，卡在哪：

- 想再加两个选择器，试过一次就退了（没留红网）。结果分两半：
  - `.thinking-block` **可以**：桩里发 `delta.reasoning_content` 分片它就渲染。产品侧 `src/api/openai-client.ts:571` 读 `reasoning_content || reasoning`；2026-10-13 用真实中转（`hub.aiminmumuxi.date` 的 `step-5-preview`）实测过它确实发这个字段。
  - `.cache-rate` **不行**：三种 usage 写法都拿不到值——① 合进带 `finish_reason: 'stop'` 的 chunk；② 单独一个 `choices: []` 的末 chunk；③ 挂在还带 delta 的正文 chunk 上。三次都报同一个 `.cache-rate` 缺失。
- 下一步该做的不是继续猜 SSE 形状，是**打点定位**：在 `src/stores/chat-generation.ts:768` 的 `onUsage` 回调里临时打印它到底有没有被调、拿到的 `promptCacheHitTokens` 是多少。已知读数是 `v-if="chatStore.prefixCacheHitRate !== null"`（`ChatMain.vue:772-773`），而 `prefixCacheHitRate` 只在 `hitTokens + missTokens > 0` 时非 null（`chat-generation.ts:245-248`）。所以三种可能：`onUsage` 没被调；被调但字段名不匹配；被调但被 profile capability 过滤。打一次点就能三分一。
- 顺带一条已排除的错误结论：`.cache-rate` 读的是 `usage.prompt_cache_hit_tokens`（`chat-generation.ts:771`），**不是** `prompt_tokens_details.cached_tokens`。真实中转连发两轮 950 token 长 prompt 后 `cached_tokens` 恒为 0，所以这件事不能靠真机测，必须由桩给。
- 另外 `.gen-text`（生成中指示器）和 `.thinking-pulse`（`generating && !expanded`）是结构上的瞬态，等样式静止后必然不存在——**刻意不要收进中性网**，否则网空转。要保护它们得单独写"生成中的那一刻"的断言，或者明确写进边界承认不受换肤回归保护。

清单加进去之后的事（原 M20-b 的正题）：迁 `ThinkingBlock.vue` 的字面量 —— `gap: 6px` → `var(--space-1-5)`、`padding: 6px var(--spacing-sm)` → `var(--space-1-5) var(--space-2)`、`font-size: 12px` → `var(--font-size-xs)`、`font-size: 11px` → `var(--font-size-2xs)`、`--spacing-sm` 旧别名换掉。迁完中性网必须 9 条全绿且**基线里能看到这些选择器的新读数**（看不见就说明白迁了）。

## 任务 C：APK 路线（结论：壳可行，但有四处必须先修/先测）

用户 2026-10-13 改口要出 APK，并指定参考 `D:\AI_data\xiaoshuo_skill_kaifa`。

参考项目的做法（已读，可照搬）：Capacitor 套 Web 产物 + `novel-studio/scripts/android-apk.mjs`（156 行）。流程是 `vite build` → 模型瘦身 → 清旧 assets models → `cap sync` → 检测 JDK，若 <21 自动把 Capacitor 硬编码的 `JavaVersion.VERSION_21` 降到 17 → `gradlew assembleDebug --rerun-tasks`（debug keystore 自动签名）→ 复制 APK 到 `installer/`。两个细节值得抄：`--rerun-tasks` 是因为 `cap sync` 增量同步会残留旧模型目录且 gradle 命中缓存不重编；JDK 降级是因为 Capacitor 8 写死 21。

工具链不用下载：`D:\AI_data\xiaoshuo_skill_kaifa\.android-toolchain\` 里有 `jdk-21.0.12.1+1`（`bin/java.exe` 在）和完整 SDK（`build-tools` / `cmdline-tools` / `platform-tools` / `platforms` / `system-images` / `emulator`，`licenses` 目录存在说明许可已接受）。SDK 路径写在该项目的 `novel-studio/android/local.properties`。这些都不在 PATH 里，要用环境变量显式指。

本仓已实测的部分：

- Tauri 耦合面很小：只有 3 个文件、8 处 import（`src/api/tauri-openai-client.ts`、`src/core/model-fs-ipc.ts`、`src/storage/tauri-fs-adapter.ts`），且都由 `isTauriEnv()` 当适配器选择（`src/api/index.ts:56`、`App.vue:246`、`VectorModelPanel.vue:27`）。
- `npm run build` 通过，PWA 的 `sw.js` 正常生成。
- 起 `vite preview` 后真浏览器跑 9 条路由（`/`、`/chat`、`/group`、`/character`、`/worldbook`、`/databank`、`/image-gen`、`/settings?cat=model`、`/settings?cat=security`）：**全部 `data-app-ready=1`、控制台与页面异常 0 条**。环境判定 `tauriInternals=false`、`indexedDB` 在、`serviceWorker` 在。
- 密钥/主密码加密走 `crypto.subtle`（`src/core/api-key-crypto.ts:146-197`），WebView 是安全上下文，能用。

没验、不能下结论的三项：备份与恢复（`src/core/backup.ts`、`backup-crypto.ts` 到底走浏览器下载还是 Tauri 保存对话框）；本地 ONNX/ORT 推理在安卓 WebView 的可用性（`scripts/check-ort-firstscreen.mjs` 只测过桌面，安卓 WebView 的 wasm 内存上限是真实风险）；CORS。

CORS 是**最硬的一条**：Web 分支是裸 `fetch`（`src/api/openai-client.ts:86`、`:228`），受 CORS 约束。这个应用之所以有 Tauri 客户端，就是因为多数中转和 provider 不发 CORS 头——桌面端走 Rust reqwest 绕过去了，Capacitor 的 WebView 不会帮你绕。用户当前那个中转带 CORS 所以能通，但用户自填的任意 endpoint 大概率不通，表现为请求被浏览器静默拦掉（不会进上面那 0 条报错）。要治得引 Capacitor Http 插件或在网络层加"WebView 下改走原生请求"的分支。

顺序建议：先做任务 A（必抛错那条），再治 CORS，再上 Capacitor 出 debug APK 装真机，最后拿真机验上面三项未测。

## 约束（别踩）

- 绝不放宽 Tauri 的 plugin fs scope（历史上靠自定义 Rust 命令 `model_files.rs` 解决，有 `id_to_filename` / appData 根 / 二进制 IPC 三个坑）。
- 用户贴过的 API key 一律不得写进任何仓库文件（含 .env、测试夹具、文档、日志）。
- `artifacts/backup/` 不许删。真实稿件（`D:\AI_data\春山玉`）及其截图不进仓。
- 不擅自 merge 到 master、不擅自推送；推送需单独点头。
- 视觉改动单独成批、单独提交，不与中性迁移混在一个 diff。
- 声称完成前自己复跑一遍相关门禁，并明确说哪些没测。
