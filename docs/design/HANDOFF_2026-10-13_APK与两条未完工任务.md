# 交接：APK 路线与两条未完工任务（2026-10-13）

给新会话用。这份文档自足，不需要读上一个会话的对话记录。

> 2026-10-15 追加：移动端与五项体验的重构指导文档已另立一份，见
> `docs/design/OPT_PLAN_2026-10-15_移动端与五项体验重构.md`。其中专项 D（长按动作条）与
> 专项 E（输入条）已实现并带实测；本文档里"导出是死按钮""token 口径"两节仍然有效。

## 仓库当前状态

- 分支 `feat/ux-ia-guided-flow`。本会话累计 9 笔提交：任务 A 竞态修复、思考块 token 迁移、交接文档更正、"那一刻"三条采样器与 `.cache-rate`/`.gen-text`/`.gen-dot` 入阶、Anthropic 直连头、CI 分片权重重生成、导出存盘统一走 saveBlob + 守卫、Capacitor 安卓壳与出包脚本、本条文档更新。
- Capacitor 出包已入库：`capacitor.config.ts`、`android/`（55 个文件；`local.properties` 与 build 产物被 `android/.gitignore` 挡在外面，所以新 clone 由脚本自己补）、`scripts/android-apk.mjs`。APK 产物在 `installer/`，**不入库**（本仓 `.gitignore` 自身未跟踪，加规则只对本机有效，所以只能靠不执行 `git add installer/`）。
- 门禁清单多了两条：`npm run check:save-blob` 与 `:self-test`（已进 `ci.yml`）。全量 e2e 现为 **206 条 / 38 个文件**，而权重表是按 205 条那轮跑的 ⇒ 差约 8 秒，守卫不红（它判项数、时效、极差，不判权重精度），下次新增 e2e **文件**时一并重生成即可。
- 本地领先远端 8 个提交，全部未推送。推送需要用户单独点头，"继续"不算授权。
- 未跟踪目录只剩刻意不入库的两个：`docs/design/THEME_BRUTAL_SHOTS/` 截图、`docs/design/ai-chat-ui-redesign/` 原型源；另加 `installer/`（APK 产物，见上）。
- 内置皮肤 9 套：dark / light / midnight / oled / theatre / terminal / aurora / ink / brutal。
- 门禁现状（跑这些命令即可复现）：
  - `npm run a11y:contrast` → 扫描存量 **67** = 基线 67；A 段 26 项 × 9 款全达标。
  - `npm run a11y:contrast:self-test` → 225 个组合全部解析得出颜色（这条是防"门禁空跑"的，见下）。
  - `npx playwright test e2e/token-neutrality.spec.ts --project=msedge` → **12 条全绿**（9 条皮肤基线网 + 3 条"那一刻"采样器：命中率徽标 / 生成中指示器 / 本地稳定率徽标），基线 **5 个目标 / 8,568 个读数**（2026-10-13 续：气泡族补了 `.thinking-block` / `.thinking-header` / `.thinking-body` / `.thinking-tokens` 四个选择器，+612）。
  - `npm run check:css-conventions` / `check:token-baseline` / `token:self-test` 均退出码 0。
  - 全量单测 `npx vitest run` → **202 files / 3,949 passed / 3 skipped**（含跨域分类器那 9 条）。
  - 全量 e2e：**4 worker 205 条全绿 / 6.7 分钟**；**单 worker 终态 205 条全绿 / 16.6 分钟**，`e2e/shard-groups.mjs` 就是按这份跑数生成的（4 组 245/244/245/244s，极差 1.005x；`token-neutrality` 权重 22.0 → 83.8）。之后又加了第三条"那一刻"用例，现在 `npx playwright test --list` 是 **206 条 / 38 个文件** ⇒ 权重表比磁盘少一条用例（约 8 秒）。**守卫不会因此红**：它判的是"每个 spec 恰好属于一组 + 权重不过期 + 极差 ≤1.3"，不判用例条数；`android/` 这批落地后一起重生成即可。
  - **新增一个 e2e 文件（不是新增一条用例）就必须重生成权重**，否则 `tests/tooling/e2e-shard-groups.test.ts` 红在"分组项数 ≠ 磁盘 spec 数"。重生成要先跑一次单 worker 全量（这台机器实测 12–17 分钟）。
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
- **气泡族剩下的裸区已逐条判过，不是一句"以后再说"**：
  - `.cache-rate.local`（本地稳定率徽标）现在有它自己的一条"那一刻"用例：供应商不报缓存字段时，第二轮发送才出现（`chat-generation.ts:297` 那句 `if (prev.lastPrefix !== '')` 决定第一轮 total 仍是 0）。两条对照都红过：把 `--cyan` 写成 `--cya` ⇒ 红在取色与探针不一致；把那句守卫改成无条件累加 ⇒ 红在"第一轮不该有徽标"。它的颜色走的是 `tokens.css:250` 那条 `--cyan: var(--secondary)` 别名链，不是直接皮肤键——别名一旦被拆掉，界面上就变成恒定兜底青蓝，这条网拦的就是这个。
  - `.msg-narration` / `.msg-narration-after`（各一条 6px）**没有可迁的用户界面**：全仓 grep 下来 `narration`/`narrationAfter` 的**写入点只有 `src/data/mock-data.ts`**（演示种子），生成链路里没有任何地方赋值，`type-adapters.ts:19` 那句注释写着"由 prompt-builder 单独处理（Phase E 实现）"——即未实现。所以这两条规则（连同 `MessageBubble.vue:95` 那个内联 `margin-top: 6px`）是在给一个产品当前产生不出来的状态排版，迁它等于给死代码刷漆。要做的是先决定 Phase E 到底做不做。
  - `.msg-toolbar`（`top:-13px` / `right:6px` / `gap:1px` / `padding:3px`）：它是 `opacity:0` 隐藏的，不是 `display:none`，所以中性网其实**采得到**；但这几条全是仓库口径里"刻意保留字面量"的非档位值，且偏移量不在采样属性清单里，这一批没有要迁的东西，就不为它扩清单（M19-a 的纪律是"清单跟着这轮会碰的规则走"）。

## 任务 C：APK 路线（2026-10-14 已出 debug 包，并在安卓模拟器上实测）

APK 出来了，也装进模拟器量过了——这一节把原来的"纸面推断"换成了读数。

工具链不用装：`D:\AI_data\xiaoshuo_skill_kaifa\.android-toolchain\` 里有 JDK 21 与完整 SDK，本机还有一台**已经跑着的**模拟器（`adb devices` ⇒ `emulator-5554`，AVD `ns36`，API 36）。出包三步（都踩过坑，记在下面）：`npm run build` ⇒ `npx cap add android` ⇒ `android\gradlew.bat -p android assembleDebug`。产物 `android/app/build/outputs/apk/debug/app-debug.apk`，27.3 MB，debug 签名可直接装。三个必改项，不改就构建失败：
1. 生成的 wrapper 指 `gradle-8.14.3-**all**.zip`，而本机缓存里只有完整的 `-**bin**`；直连 services.gradle.org 会下到一半断（我第一次就死在这）。把 `android/gradle/wrapper/gradle-wrapper.properties` 的 `distributionUrl` 改成 `-bin.zip`，并用全局 `~/.gradle`（不要在项目里另建 GRADLE_USER_HOME）。
2. `google()` / `mavenCentral()` 在这台机器上拉不动：`android/build.gradle` 两个 repositories 块里**先**加 `https://maven.aliyun.com/repository/google` 与 `.../public`，再保留官方源兜底。
3. `android/local.properties` 不会自动生成，得自己写 `sdk.dir=...`，否则 gradle 找不到 SDK。

**WebView 环境实测**（`adb install -r` ⇒ `am start -n com.zhuweib.airoleplay/.MainActivity` ⇒ Capacitor 的 debug 包自带 WebView 远程调试，`adb forward tcp:9333 localabstract:webview_devtools_remote_<pid>` 后用原生 CDP `Runtime.evaluate`；注意 Playwright 的 `connectOverCDP` 对安卓 WebView **拿不到已有页面**，contexts 是空的）：

| 读数 | 值 | 意义 |
| --- | --- | --- |
| `location.origin` | `https://localhost` | Capacitor 的 `androidScheme:'https'` |
| `window.isSecureContext` / `crypto.subtle` | true / true | 密钥与主密码加密可用（这条原来只是推断） |
| `'__TAURI_INTERNALS__' in window` | **false** | 确认走 Web 适配器分支，任务 A 那套 `isTauriEnv()` 守卫在真机上是挡住的 |
| `'webkitdirectory' in HTMLInputElement.prototype` | **true** | 原来"安卓 WebView 可能选不了文件夹"的担心不成立，目录安装这条路可用 |
| `window.showDirectoryPicker` | true | File System Access 也在 |
| `indexedDB` / `serviceWorker` | true / true | 存储与 PWA 注册能力在 |
| `html[data-app-ready]` | `1` | 应用真的起来了并跑到 `/chat`，首屏 6 条气泡（演示种子） |
| `.nav-item` 数 | 0 | 手机视口下侧栏按既有设计卸载（底栏承接） |

**CORS 在设备路径上的读数，和我上一轮写的"桌面浏览器 9/10 放行"不是一回事。** 上一轮那数是从桌面 Edge 拿的，而 Edge 走系统代理；这轮直接在 WebView 里发（设备直连、无代理），并且**每家用应用真实会发的请求头**——上一版探针我犯了个污染性错误：把 anthropic 专用头加到了所有请求上，会让别家的预检因"允许的头部清单里没有它"而失败，`moonshot` 与 `openrouter` 那两条假红就是这么来的，重测后都放行。

| 终点（各家真实头） | 设备直连读数 |
| --- | --- |
| api.deepseek.com | 放行（HTTP 401） |
| api.moonshot.cn | 放行（HTTP 401） |
| dashscope.aliyuncs.com | 放行（HTTP 401） |
| api.siliconflow.cn | 放行（HTTP 401） |
| openrouter.ai | 放行（HTTP 401） |
| 用户自己在用的那个中转 | 放行（HTTP 401） |
| open.bigmodel.cn `/api/paas/v4` | 放行（HTTP 401） |
| api.groq.com | 被跨域拦（根路径可达） |
| open.bigmodel.cn `/paas/v4` | 被跨域拦（根路径可达） |
| api.anthropic.com（带官方那个直连头） | 被跨域拦（根路径可达） |
| api.openai.com / generativelanguage.googleapis.com | 网络不可达（8 秒超时，不计入跨域结论） |

⇒ 设备路径上是 **7 放行 / 3 拦**，而且被拦的两条里有 `api.anthropic.com`：同一个请求头组合在桌面代理路径上是"放行 401"、在设备直连上是"被拦"。所以上一轮那个"少带一个头"的修复是**必要但不充分**——它修的是我们这侧的缺项，修完桌面能用；手机上还拦着。
⇒ 更要紧的是：**从 WebView 内部区分不了"这家真的不发 CORS 头"和"跨境链路被中间网络干扰"**（两者表现都是预检没回来而根路径又能连）。groq / anthropic / openai / gemini 全在境外，这个模式更像后者。因此 `CapacitorHttp` 那个开关**仍然先不开**：如果真实原因是链路干扰，把请求改走原生栈并不能治好，却要先付"所有请求脱离浏览器网络栈、中止语义与流式读法重验"的代价（参考项目就记着：跨源 POST 走原生插件时 `AbortSignal` 不透传、原生侧无超时，他们给 streamChat 加了硬超时 race 才敢开）。
⇒ 真要定论，下一步不是改代码，是**换网络路径复测同一张表**：同一台手机用蜂窝数据、以及挂代理各测一次。如果只有直连拦 ⇒ 是链路问题，开 CapacitorHttp 无用；如果挂着代理也拦 ⇒ 才是服务端政策，那时再开并配套补中止与超时。

**这一条已经能收口了（2026-10-14 续，直连层再量一次，不必等手机）。** 绕开浏览器、直接对同批 endpoint 发真实 POST（带 `Origin: https://localhost` + 无效密钥，看服务端到底回什么）：

| 终点 | 直连响应 | 换真实安卓 WebView 的 UA 再发一次 |
| --- | --- | --- |
| api.anthropic.com | 403，**没有任何 `access-control-*` 头** | 仍是 403 ⇒ 与 UA 无关，是 CDN/服务端拒绝这个客户端 |
| api.groq.com | 403，无 `access-control-*` | 仍是 403 |
| api.moonshot.cn | 401 + `Access-Control-Allow-Origin: https://localhost` | —（本来就通） |
| api.deepseek.com | 401 + 回显 Origin | — |
| api.openai.com / generativelanguage.googleapis.com | 连接超时（curl 退出码 28），链路层就到不了 | — |

⇒ 结论修正：**上一条那句"分不清是政策还是链路干扰"现在分得清了**，而且两种都不是 `CapacitorHttp` 能治的。403 是服务端拒绝这个客户端，换成原生请求一样被拒；超时是链路不通，换成原生也一样。所以"开了 CapacitorHttp 被拦的三家就通了"这个假设**被否**，这个开关继续不打开是对的。
⇒ 开它唯一的真实收益是把状态码读出来（403 变成"禁止访问 403"而不是"跨域失败"），而这我们已经用另一种方式做到了：`cors-probe.ts` 那次只测连通性的探测就是"根路径可达 ⇒ 提示是跨域/被拒，不是密钥错"。
⇒ 还有一条本机做不到的腿：`127.0.0.1:10808` 那个 SOCKS 此刻不接受连接（四条全 000），所以"挂代理复测"在这台机器上没做成，能做的已经被上面这张表替代了；蜂窝数据那一条只有真机能答。

顺带订正上一轮写的两句话：其一，"桌面浏览器 9/10 放行"不能当 APK 的依据，读表必须带"哪条网络路径 + 哪个 origin + 哪套请求头"三件事；其二，用 `curl` 量 CORS 时不打 `OPTIONS` 状态码是错的——`000`（连不上）会被记成"没有 ACAO 头"。

背景与参考：用户 2026-10-13 改口要出 APK，并指定参考 `D:\AI_data\xiaoshuo_skill_kaifa`（那边走的是 Capacitor 套 Web 产物 + `novel-studio/scripts/android-apk.mjs`：`vite build` → 模型瘦身 → 清旧 assets models → `cap sync` → JDK 探测 → `gradlew assembleDebug --rerun-tasks` → 复制进 `installer/`）。**本仓没有照抄的两处**：没有 `public/models/` 那批内置权重，所以不需要"模型瘦身 + 清旧 assets"这一步；本机 JDK 是 21，不需要参考项目那段把 `JavaVersion.VERSION_21` 降到 17 的补丁。`--rerun-tasks` 保留了（`cap sync` 是增量同步，gradle 会命中缓存复用上次产物）。

本仓已实测的部分：

- Tauri 耦合面很小：只有 3 个文件、8 处 import（`src/api/tauri-openai-client.ts`、`src/core/model-fs-ipc.ts`、`src/storage/tauri-fs-adapter.ts`），且都由 `isTauriEnv()` 当适配器选择（`src/api/index.ts:56`、`App.vue:246`、`VectorModelPanel.vue:27`）。
- `npm run build` 通过，PWA 的 `sw.js` 正常生成。
- 起 `vite preview` 后真浏览器跑 9 条路由（`/`、`/chat`、`/group`、`/character`、`/worldbook`、`/databank`、`/image-gen`、`/settings?cat=model`、`/settings?cat=security`）：**全部 `data-app-ready=1`、控制台与页面异常 0 条**。环境判定 `tauriInternals=false`、`indexedDB` 在、`serviceWorker` 在。
- 密钥/主密码加密走 `crypto.subtle`（`src/core/api-key-crypto.ts:146-197`），WebView 是安全上下文，能用。

没验、不能下结论的一项：本地 ONNX/ORT 推理在**真机** WebView 的可用性（`scripts/check-ort-firstscreen.mjs` 只测过桌面；本轮那台模拟器是 x86_64、内存宽裕，拿它量 ONNX 会偏乐观）。CORS 原本是第三项，2026-10-14 已在桌面与设备两条路径上各量一次，读数就在本节的两张表里。

**桌面浏览器路径的对照读数（只对 PWA / 桌面版成立，别当 APK 依据）。** 同一套判据在真实 Edge（origin `http://localhost`）里量到的放行面比设备上宽得多：openai、gemini、groq、moonshot、openrouter 都判"放行"，而这几条里有四条在设备直连路径上是"被拦"或"不可达"。差别只有一处——那台 Edge 走系统代理，而手机没有。判据本身是：`fetch` 能读到响应 ⇒ 放行；`fetch` 抛 `TypeError` 但 `mode:'no-cors'` 打到 origin 根路径能回 ⇒ 服务器可达、被跨域拦；两边都不回 ⇒ 不可达，不计入。

修掉的一条（顺带影响桌面版）：`api.anthropic.com` 之前**一直**连不通，原因不是服务端政策，是我们少带官方要求的 `anthropic-dangerous-direct-browser-access: true`。同一套头做 A/B：不带 ⇒ 被 CORS 拦（服务器可达）；带上 ⇒ 放行到 HTTP 401。`AnthropicClient` 走的是 `fetch`（不是 Rust reqwest），所以这条在 Tauri 桌面版里同样存在，`anthropic-client.ts:24` 原来那句"官方支持 CORS，Web 与 Tauri 通用"是错的，已改。补进 `buildHeaders` 与 `listModels` 两处，各有一条单测断言这个头存在（注释掉即红，实测过）；再用应用自己的"测试连接"在真实浏览器里复跑一次，结果从"网络请求失败"那一类变成 `API 错误 401: invalid x-api-key`。

**CapacitorHttp 此刻是关着的**，理由与"该在什么条件下打开它"都写在上面那张设备表后面那段，配置位置在 `capacitor.config.ts`（连同为什么先不开，以及参考项目开它时踩到的 `AbortSignal` 不透传、原生侧无超时这两个坑）。

落地的那条小改，以及它为什么比我原先写的更微妙：
- 原先我记的是"`diagnostics.ts` 那套 cors 建议没有任何代码路径产生它"——**这句只对了一半**。`chat-error.ts:90` 靠 `/cors/i.test(err.message)` 确实能命中，因为 `api.networkFailed` 那句中文兜底里恰好有"CORS"四个字母。所以聊天气泡里的提示一直是对的，而 `ApiError.kind` 本身从来没被设成 `'cors'`：凡按 kind 分流的地方（`ApiErrorModal`、`diagnostics` 的建议、`llm-retry` 的重试白名单）拿到的都是 `network`。这是一种"靠措辞碰巧匹配"的脆弱耦合——改一句 i18n 文案就会静默丢掉跨域引导。
- 现在用一次**只测连通性**的探测把两类分开（`src/api/cors-probe.ts`）：`mode:'no-cors'` 不受 `Access-Control-Allow-Origin` 管束，打得通 ⇒ 原失败是跨域；打不通 ⇒ 才是网络/地址。探测刻意只打 origin 根路径、不带请求体（把同一份对话体重发一次会被服务商计第二次费），并带 3 秒上界（黑洞型网络里 `fetch` 不会自己失败）。
- 连带收益：`llm-retry` 的白名单是 `rate-limit / server / network`，被跨域拦过去被当成瞬时错误重试两轮，现在归 `cors` ⇒ 不再重试。
- 界面级实测两类各一次（真实 Edge、应用自己的"测试连接"）：`https://open.bigmodel.cn/paas/v4` ⇒ "跨域请求被拦截：…（这个 API 地址能连通，但服务商不允许浏览器直接调用它）"；一个不存在的域名 ⇒ 仍是"网络请求失败（可能原因 1-4）"。单测 9 条锁住判据本身，含两条负向对照（把分类器改成无视探测 ⇒ 红；探测必须打在根路径且无请求体）。

顺序建议（2026-10-14 三更新）：任务 A、B 已收口；CORS 已量（桌面与设备两条路径都量了）、Anthropic 直连头已修（必要不充分）、"被跨域拦"已接成可诊断分类；debug APK 已出并在模拟器上验过环境。剩下的按这个顺序：
1. **换网络路径复测那张设备表**（同一台手机：蜂窝数据一次、挂代理一次）。这是当前唯一能决定"开不开 CapacitorHttp"的证据——桌面与模拟器都不能替代。
2. 导出那一半已量完（2026-10-14：在模拟器上点是"弹不出保存面板"，原因是 WebView 没实现该 API —— 见下一节；要修得走原生插件）。仍未测的只剩：本地 ONNX/ORT 在真机 WebView 的内存上限（模拟器是 x86_64、内存宽裕，量出来偏乐观，别拿它当结论）；以及"导入/恢复"那一侧在真机上的表现（只验过 webkitdirectory 与 `<input type=file>` 能拉起选择器）。
3. `android/` 这套原生壳要不要入库、要不要照参考项目那样写一个 `scripts/android-apk.mjs` 把"构建→sync→gradle→复制到交付目录"封成一条命令，都是待定项（现在这三步是手工执行的，参数见上面那三个必改项）。

已经变成读数、不必再猜的三件事：WebView 里 `webkitdirectory` 为 true（目录安装可用）、`__TAURI_INTERNALS__` 为 false（Web 降级分支确实被选中）、`crypto.subtle` 在 `https://localhost` 下可用（密钥与主密码加密不是问题）。

## 备份/导出在 APK 里是死按钮（2026-10-14：9 处全收敛到 saveBlob、基线清零；真机复测——**弹不出保存面板**，API 是桩）

在模拟器上用 CDP 把 `downloadBackupFile` 那段原样跑了一遍（blob → objectURL → `a[download]` → click）：**不报错、没有下载记录、`find /sdcard` 全盘搜不到那个文件、logcat 一条相关日志都没有**。手机上点了就是没反应。全仓这个模式共 **9 处**（备份包、对话 Markdown、角色卡 PNG、审核日志、故事脚本、角色 JSON、世界书、快捷回复、群聊 ST）。

反方向是好的：同一台 WebView 里 `<input type="file">` 会正常拉起系统文档选择器（logcat 抓到 `GET_CONTENT → com.google.android.documentsui/.picker.PickActivity`），所以"恢复备份 / 导入"这一侧不用动。

`src/utils/save-blob.ts` 是唯一的存盘入口：

- **只在 UA 带 `; wv)`（安卓 WebView 标记）时去够系统保存面板**；桌面 Chrome / PWA / Safari 保持既有的直接下载（那里的 `showSaveFilePicker` 也存在，每次都弹面板是用户没要求的改动）。
- **先弹面板、再算 Blob**（`showSaveFilePicker()` 要用户手势，而各站点在存盘前都要 `await` 取数据）。顺序用单测钉住：`['picker:…','makeBlob','write:5','close']`，把算数据挪到弹面板之前 ⇒ 两条用例红（实测过）。
- 返回 `'saved' | 'cancelled'`：取消时调用方**不得**报"已导出"。单测含一条负向对照（安卓 WebView + AbortError ⇒ 返回 false 且 lastInfo 保持为空）。

**2026-10-14 本批把剩下 6 处也换完**（`downloadV2` / `downloadLorebook` / `downloadGroupSt` / `exportQuickRepliesSt` / `downloadScripts` / `handleExportAuditLog` 及其调用点），`scripts/save-blob-guard.mjs` 的 **BASELINE 清空为 0**：除 `save-blob.ts` 外任何一处 `URL.createObjectURL(` 都直接红；`--self-test` 造一处违规证明尺子还在咬（红与绿都验过）。守卫已进 `package.json`（`check:save-blob` / `:self-test`）与 `ci.yml`。

### 真机复测结论（2026-10-14，这条推翻了上一版的判断）

上一版写着"同一台 WebView 里 `window.showSaveFilePicker()` 能用（实测会拉起 documentsui，抛 AbortError ＝用户取消）"——**这两句都不成立**。这一轮把"设备上点导出 → 到底弹不弹保存面板"补完了：

| 读数 | 值 |
| --- | --- |
| `typeof window.showSaveFilePicker` | `function`（存在，所以上一版没怀疑它） |
| 从应用按钮点（真实触摸 `Input.dispatchTouchEvent`，覆盖 4 处：导出备份 / 快捷回复 / 审核日志 / 角色 JSON） | 4 处都**确实调到了**该 API，文件名也对（`ai-roleplay-backup-….json` / `quick-replies-ST.json` / `audit-log-….json` / `Kael.json`）⇒ 这 6 处的改造本身是通的 |
| 该调用返回什么 | **14ms 抛 `AbortError: The user aborted a request.`**，前台仍是应用，logcat 无 `CREATE_DOCUMENT`/`GET_CONTENT` |
| 对照探针（往页面注入一个按钮、真实触摸、**完全不经过应用代码**） | 同样 14ms AbortError ⇒ 与用户手势、与调用顺序都无关 |
| 系统侧（`adb shell am start -a android.intent.action.CREATE_DOCUMENT …`） | **能弹**：前台变成 `documentsui/.picker.PickActivity`（截图见 `qoder_交付/2026-10-14_导出真机验证/shots/adb-create-document.png`） |

⇒ **Chrome 133 Android WebView 没实现 File System Access 的保存面板**，`showSaveFilePicker` 只是个桩。上一版看到的 AbortError 不是"用户取消"，是桩立刻中止；`NotSupportedError` 那条猜测也不对——它连"不支持"都不报，表现得就像用户秒取消。

⇒ 所以 saveBlob 的 WebView 分支现在是**空转**：手机上点导出仍然没反应，而且比改造前更安静（AbortError 被归成 cancel，连 toast 都没有）。这不是换 6 处造成的，是这条路的终点到头了。

⇒ 要真修只能走原生。姊妹项目 `D:\AI_data\xiaoshuo_skill_kaifa\novel-studio` 已有实证解法：自定义 Capacitor 插件 `NovelExport`（`NovelExportPlugin.java`）——`begin({filename, mime, choose})` 用原生 ACTION_CREATE_DOCUMENT 弹"另存为"（也可直接写系统下载目录并回显落点）、`append` 按 192KB 分块传 base64 避免大 payload 过桥、`finish/abort`；他们的注释写着"Android WebView 的 blob 下载不一定落盘，必须等待系统文件写入成功后才返回成功"，真机复验报的也是"没有弹窗，找不到文件"。本仓目前**没装任何 Capacitor 插件**（`android/…/capacitor.plugins.json` 是 `[]`），Capacitor 核心也没注册 DownloadListener，所以 blob 下载没有原生兜底。

⇒ 本仓这一轮还测到的边界：覆盖的是模拟器（x86_64、Chrome 133 WebView、Android 16）。真机 WebView 版本可能不同，但"WebView 不支持 FS Access 保存面板"是 WebView 的架构性缺口，不是这台模拟器的毛病——真机要复验的是**原生插件那条路**，不是这个桩会不会变好。

## Token 口径（2026-10-14 用户定的新规矩）：不设输出上限，模型只配"最大上下文"

原话是"不限制 token 最大值，只需要设置模型时设置模型的最大上下文，其他的自动适配、自动压缩，不要出现溢出的现象"。这条推翻了此前各处写死的输出上限（世界创建 2000、扩展 1500、角色 1500、NPC 1000、随机事件 600），也删掉了两处过时口径。

**实现**（`src/core/token-budget.ts`）：

- 输出预算 = `模型最大上下文 − 本次输入实测 − 预留`；下限 512（再小写不出完整结构）。
- 输入装不下时按固定顺序压缩：① 截断大块源文本（小说素材 / 已有条目摘要）② 从最早的历史消息开始丢 ③ 兜底截断最长那条消息并**保住尾部**（生成类提示词的 JSON 结构说明在尾部，砍尾等于砍掉格式要求）。全程保证 `输入 + 输出 ≤ 上下文 − 预留`。
- 接线的调用点：世界创建 / 世界扩展 / 角色生成 / 群聊 NPC / 随机事件 / 故事分块分析 / 故事脚本生成 / 聊天主路（`chat-manager`，流式也带同一套预算）。

**模型设置**：`ApiProfile.contextWindow`（新增，表单里带 4K/8K/32K/128K/256K 常用档位按钮）是唯一旋钮；没填就回退全局 `settings.maxContextTokens`（那个入口保留，文案已改成"模型没单独填时用它"）。同时**撤掉**了 `profile.maxTokens` 与角色级 `maxTokens` 两个输出上限旋钮（含角色编辑器、上下文面板、类型、i18n 键；`ChatManagerConfig.maxTokens` 及其 overrides 也一并移除，防止重新长出旋钮）。

**兜底**：输出预算可能超过某家模型自身的输出上限（它比上下文小），供应商会回 400。客户端识别到 400 且正文提到 `max_tokens` 时，**去掉该字段重发一次**（`OpenAIClient.retryWithoutMaxTokens`，非流式与流式都接）。有正向用例（重发后成功且第二次请求没有 `max_tokens`）与两条负向对照（与 max_tokens 无关的 400 不重发；请求本来就没带也不重发）。

**量过的数**（gpt-tokenizer 按各 Prompt 自己写的字数区间造样例，用来说明"为什么原来的写死值必然截断"）：

| 生成点 | 最小 | 中位 | 提示词上限 |
| --- | --- | --- | --- |
| 世界创建 | 1838 | 3895 | 8093 |
| 世界扩展 | 960 | 2357 | 4316 |
| 角色卡 | 459 | 906 | 1371 |
| 群聊 NPC | 322 | — | 918 |

**配套清理**：删掉 `tests/stores/maxtokens-priority.qa-independent.test.ts`（它验的是已移除的"角色级 → Profile 级"优先级链，历史在 `3d3572c`）；`tests/stores/character-generate.test.ts` 里的防漂移断言改成"character store 里不得再出现写死的 `maxTokens: 数字`"。

**防重入的坑（改这里别踩）**：`isGeneratingX` 标志必须在**异步准备之前**就立起来。第一版把 `prepareGenerationPrompt` 放在标志之前，连点两次会在准备窗口里双双通过检查，`character-generate` 的防重入用例直接超时红。

## 约束（别踩）

- 绝不放宽 Tauri 的 plugin fs scope（历史上靠自定义 Rust 命令 `model_files.rs` 解决，有 `id_to_filename` / appData 根 / 二进制 IPC 三个坑）。
- 用户贴过的 API key 一律不得写进任何仓库文件（含 .env、测试夹具、文档、日志）。
- `artifacts/backup/` 不许删。真实稿件（`D:\AI_data\春山玉`）及其截图不进仓。
- 不擅自 merge 到 master、不擅自推送；推送需单独点头。
- 视觉改动单独成批、单独提交，不与中性迁移混在一个 diff。
- 声称完成前自己复跑一遍相关门禁，并明确说哪些没测。
