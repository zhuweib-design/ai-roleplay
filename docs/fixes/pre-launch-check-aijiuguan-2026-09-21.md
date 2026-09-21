# AI 酒馆（AI Roleplay）上线前全检报告

**日期**：2026-09-21
**场景**：上线前全检（代码审查 + 安全审计 + QA 测试）
**参与成员**：产品官（代码审查）、安全卫士（OWASP + STRIDE 安全审计）、质量门神（QA 测试与发布）
**待检范围**：工作区 11 个未提交文件（+233 / −94）—— 对比度 token v1.2 重构；`master` 领先 `origin/master` 27 个提交
**执行方式**：主理人建立团队 `gstack-pre-launch-check` 并下发独立任务；三位成员各自独立查证、实跑命令、给出结论；主理人负责汇编、交叉验证与收口

> **落盘路径说明**：本次未使用专家默认的 `deliverables/gstack/`。项目约定（2026-09-18 确立）为「归档规则优先于工具默认路径」，且 `deliverables/` 目录已废止。故本报告按既有先例落入 `docs/fixes/`（同名系列已有 08-15 / 08-17 / 08-19 三份）。

---

## 📌 TL;DR（执行摘要）

- **整体结论**：🟡 **条件 Go —— 阻塞项 0，本次 diff 可安全发布；但「对比度已全面达标」不能写进发布说明，且有 6 项 P1 建议在同一发布窗口内处理。**
- **8 道门禁全部实跑，无任何真实红灯**：lint 0 errors / i18n strict 通过 / CSS 约定 5 项全过 / 对比度静态门禁 0 项未达标 / **118 文件 · 3301 用例全绿**，覆盖率 86.75·85.75·86.56·86.75（阈值 78/73/78/78，四项均超）/ 构建成功 8.53s 且体积拆分未退化 / CSP 守卫通过 / **E2E 17/17 全绿**（含新增 7 路由 × 5 主题 = 35 次对比度扫描）。
- **本次改动经实测确认有效**：浏览器定向探针逐主题读取真实计算色，7 个视图的改动选择器全部 ≥ AA 4.5:1；且独立复算证实注释声称的「修复前」数值真实存在（最严重的 `/image-gen` 在 light 下 `--primary-fg` 叠 `--primary` = **1.00:1**，文字完全不可见）。
- **核心风险**：① 本轮修复只覆盖了同类缺陷的约 1/3，**9 处同类残留仍在**，最严重为 dark 下 `--on-media` 叠 `--secondary` = **1.38:1**（文字按钮近乎不可见）；② **对比度静态门禁存在覆盖盲区**（不读 `tokens.css`、不覆盖新增派生 token、不建模同色染层），本轮改动前后门禁输出逐字相同 → **该绿灯不能作为本次改动的验证证据**，真正兜底的是 E2E；③ 存量安全面 4 项 P1（SSRF 归一化绕过已实测复现、远程向量密钥明文落盘、Tauri 权限面扩大、依赖漏洞 4 项）。
- **相对 08-19 基线无任何退化**，覆盖率与 E2E 覆盖显著增强（用例 2574 → 3301，E2E 首次实跑全绿）。

---

## 🎯 核心结论卡片

| 项目 | 内容 |
|------|------|
| Go / No-Go | 🟡 **条件 Go**（阻塞项 0；建议同窗口追加补丁 2） |
| 严重度分布 | 🔴 P0: **0** ｜ 🟠 P1: **6** ｜ 🟡 P2: 19 |
| 门禁状态 | **8/8 全绿**（其中本地门禁 5/6 退出码受沙箱保护影响，详见 P2-1） |
| 本次 diff 自身风险 | 🟢 低 —— 纯 CSS 颜色替换，安全面零变化，无回归，门禁全绿 |
| 不建议发布的说法 | ❌「WCAG AA 对比度已全面达标」（该结论不成立） |
| 关键行动项 | 6 条（见行动清单） |
| 建议负责人 | 前端（补丁 2）/ Rust（SSRF）/ 安全（密钥与权限面）/ CI（门禁与依赖） |

---

## 1. 各成员核心结论

### 🔍 产品官（代码审查）

- **核心判断**：🟡 条件 Go —— **改动机制上完全正确，但它想解决的问题只解决了约三分之一**。`color-mix` 不是新引入的兼容性依赖（仓内早有 20+ 处在用），派生 token 的「惰性替换 → 自定义主题自动生效」推理经逐条验证**成立**（`:root[data-theme="custom"]` 与 `:root` 同作用于 html 且特指度更高，无循环引用），5 处替换全部真实达标（最差 `--secondary-text` on theatre `card-elevated` = 5.49:1）。
- **静态实测**：`typecheck` exit 0 / 0 错误；`lint` exit 0 / **0 errors / 2 warnings**（2 个 warning 在 `CharacterList.vue:110,111`，与本次改动无关）。
- **关键发现**：在**本轮改动过的同一批文件里**及审计路由内找到 **9 处同类残留**（最严重 dark 1.38:1）；另在非审计路由/共享组件找到约 13 处独立站点。两条结构性发现：**对比度静态门禁未同步扩展**、**新增 E2E 疑似「名义覆盖」**。
- **兼容性裁定**：`color-mix` 失效模式温和（回退到继承色，不会不可见），**判 P2 而非 P0**；仅 macOS 12 及更早（Safari 15.x）不支持，桌面端 Windows WebView2 恒 ≥111。

### 🛡️ 安全卫士（OWASP Top 10 + STRIDE）

- **核心判断**：🟢 **安全面整体可放行，无 P0**。本次待发布 diff 经逐行核对为**纯 CSS 颜色替换**，未引入任何 `v-html` / `innerHTML` / 新脚本 / 内联样式注入 / 新网络请求 —— **安全面零变化**。
- **基线保持**：`id_to_filename` 路径净化、PBKDF2-600k + AES-GCM-256、主密码仅内存、明文 API Key 拒绝导出、`v-html` 仅 `Icon.vue:26` 静态白名单、`src-tauri/keys/` 未入库、DOMPurify 白名单未削弱、Web CSP `script-src` 无 `unsafe-eval/inline`。
- **关键发现**：4 项 P1 —— ① `validate_endpoint` SSRF 可用备选 IPv4 表示 / IPv4-mapped IPv6 绕过（**已实测复现**）；② 远程向量网关 `apiKey` 明文存 localStorage，游离于主密码体系与备份明文检查之外；③ Tauri 权限面相对基线扩大（新增 `updater:default` + `remote.urls: https://*`）；④ `npm audit` 由基线 0 漏洞变为 4 项（1 high + 3 moderate，全 dev-only）。
- **A03 注入判定**：**通过** —— `innerHTML` / `outerHTML` / `document.write` / `srcdoc` / `insertAdjacentHTML` / `eval(` 在 src 内均 **0 处**；AI 内容走 `{{ }}` 文本插值。**A06 组件漏洞、A10 SSRF 未通过**。

### ✅ 质量门神（QA 测试与发布）

- **核心判断**：🟢 **门禁全绿，可以发布**。8 道门禁全部实跑，无任何真实红灯。
- **关键数字**：lint 0 errors / 2 warnings；i18n strict 157 文件 0 残留；CSS 约定 5/5（`!important` 棘轮仍为 46，未增）；对比度静态 5 主题 × 22 对 = 110 项 0 未达标；**118 文件 / 3301 用例全绿**，覆盖率四项全超阈值；`vue-tsc` 0 错误 + `vite build` 成功 8.53s；CSP 12 条指令全项通过；**E2E 17/17（桌面 14 + 移动 3）**，`contrast-axe.spec.ts` 3/3 全绿含新增 35 次扫描。
- **关键发现**：**确认对比度静态门禁存在覆盖盲区**（该脚本硬编码色值表，从不读取 `tokens.css`，22 条清单不含任何 `*-text` 派生 token，也不建模同色染层合成；**改动前后门禁输出逐字相同**）。该盲区由 E2E 补偿，不阻断发布。
- **驳回一条推断**：产品官推测 E2E 因「零数据种子 → 空库 → 扫空态」而无效。QA 用真实浏览器探针逐主题读取改动选择器的**实际计算色**，证实这些选择器**确实渲染**（非空态空跑），修复真实生效 —— 该推断不成立。
- **发布建议**：**GO**。

### 🧭 主理人裁决（交叉验证）

| 争议点 | 产品官主张 | 质量门神主张 | 裁决 |
|---|---|---|---|
| 新增 E2E 是否有效 | 「名义覆盖」，空库扫空态，给不出它看起来给出的保证 | 浏览器探针实测改动选择器**均在真实 DOM 渲染**并读到真实计算色 | **采信 QA 的实证**。产品官的推理链（零数据种子 → 不渲染）在事实上不成立。但 QA 也独立发现 `.cap-value.ok` 在 dark 首轮 `NOT-FOUND`（4/5 主题通过），说明**时序类覆盖不完整部分存在** → 降为 P2 |
| 对比度静态门禁是否有盲区 | 有（未覆盖新 token 与染层对） | 有（**改动前后输出逐字相同**） | **两人独立确认，升级为 P1 门禁缺陷** |
| lint 基线口径 | 实测 2 warnings ≠ 题面 50 | 实测 2 warnings ≠ 题面 50 | **两人独立确认我下发的基线已陈旧**，报告改用实测口径 |

主理人另独立复核（未采信成员单方陈述）：① 按 WCAG 公式手算 dark `#FFFFFF` on `#25F4EE` = **1.377:1**，与产品官报的 1.38:1 吻合；② 逐行读取 `chat_stream.rs:460-534` 确认 SSRF 绕过机制属实；③ 直接读取 `capabilities/default.json` 确认权限面扩大属实。

---

## 2. 综合审查发现（去重合并后按严重度排序）

### 2.1 阻塞项清单

**🔴 阻塞项：0 条。** 无 P0，无门禁红灯，无密钥泄露，无生产可执行漏洞。

### 2.2 P1 发现（6 条）

| # | 严重度 | 类别 | 位置 | 问题描述 | 建议 | 来源成员 |
|---|--------|------|------|---------|------|---------|
| 1 | 🟠 P1 | 无障碍 | `CharactersView.vue:988-989`、`1094-1096`（`--on-media` 叠 `--secondary`，**dark 1.38:1**）；`ChatMain.vue:889`、`SettingsView.vue:3411`、`SettingsModelPanel.vue:2036`（`--on-media` 叠 `--primary`，**theatre 2.40:1**）；`LocalModelView.vue:948`、`ImageGeneratorView.vue:655`（`--success` 叠 20% 染层，light 2.95:1）；`RandomEventsView.vue:940`（`--warning-fg` 叠 15% 染层，light 4.08:1）；`StoryEngineView.vue:2948`、`3074`（`--accent-blue` 叠 12% 染层，light 4.37:1）；`LocalModelView.vue:963`（accent-blue 叠 15% 染层，light 4.20:1） | **本轮修复的同类缺陷只覆盖约 1/3，9 处残留仍在**。其中 `ChatMain.vue:889` 等 3 处与本次已修的 `CharactersView .new-btn` 是**完全同一个 bug**（tokens 注释原话「theatre 金底上仅 2.39:1」）；`LocalModelView.vue:948` 与同文件 `:672` 已修写法完全相同却漏改；`StoryEngineView.vue:2948` 与同文件 `:3339` 已修实例同类且更差 | 按清单批量替换：`--on-media`→`--on-primary`/`--on-accent`；`--success`→`--success-fg`；`--warning-fg`→`--warning-text`；`--accent-blue`→`--accent-blue-text` | 产品官 |
| 2 | 🟠 P1 | 门禁缺陷 | `scripts/check-contrast.mjs:34-181` | 对比度静态门禁**不读取 `tokens.css`**（硬编码 5 主题色值表 + 固定 22 条色对清单），**不含**本轮新增的 `--secondary-text` / `--warning-text` / `--accent-blue-text`，也不建模**同色染层合成**（而本轮修复的缺陷全部出在「token 作文本 × 同色染层」这一组合上），亦未覆盖 `on-accent/destructive` hover 态。**改动前后该门禁输出逐字相同** → 绿灯不能作为本次改动的验证证据；若 E2E 被跳过或抖动，此类回归会静默上线 | 改为从 `tokens.css` 解析主题变量并计算派生 token（含 `color-mix` 解析），或至少补入 3 个派生 token 对与「token on 同色染层」的预计算色值对 | 产品官 + 质量门神（**独立双确认**） |
| 3 | 🟠 P1 | 安全 / A10 SSRF | `src-tauri/src/commands/chat_stream.rs:498-524` | **SSRF 校验可绕过（已实测复现）**。校验作用于**原始字符串**：`host.parse::<std::net::Ipv4Addr>()` 只接受点分十进制，备选表示 `http://2852039166/latest/meta-data`、`http://2130706433/`、`http://0x7f000001/`、`http://0177.0.0.1/`、`http://127.1/` 全部解析失败，随后 `else if host.contains(':')` 对无冒号主机不成立 → **直落 `Ok(())` 放行**；而 reqwest 底层 `url` crate 按 WHATWG 规范会将其归一化为 `169.254.169.254` / `127.0.0.1`。IPv6 分支只查 `fe8x~feb` 前缀与 `::1` 前缀，`::ffff:169.254.169.254`、`::ffff:127.0.0.1`、`::` 全部放行。后果：默认 `allow_private=false` 下仍可访问云元数据/回环/内网，且 `Authorization: Bearer <用户 API Key>` 会一并外发。触发路径：导入恶意备份 → `settings.apiProfiles[].baseUrl`。**注：自初始提交即存在，非本轮引入** | 改为「先归一化再判定」：`url::Url::parse` 后取 `host()`，对 `Host::Ipv4/Ipv6` 直接判定（含 IPv4-mapped 与未指定地址）；补齐 `100.64/10`、`198.18/15`、`::/128`、`::ffff:0:0/96` 区间；域名保留现状并显式记录 DNS 重绑定为残余风险 | 安全卫士（主理人已逐行复核源码属实） |
| 4 | 🟠 P1 | 安全 / A02 加密失败 | `VectorModelPanel.vue:147`（写入）、`vector-model-manager.ts:160-171`（读取）、`embedding.ts:138,161`（用作 Bearer） | 远程向量网关 `apiKey` 以**明文**存于 `localStorage['aijiuguan.remoteEmbedding']`，不走 `api-key-crypto`（主密码体系只覆盖 `apiProfiles[].apiKey` 与 `translationConfig.apiKey`），也**不在备份导出的明文密钥检查范围**（`backup-service.ts:59-65` 只查那两处）→ 存在一处游离于既定安全模型外的持久化明文凭据 | 二选一：① 纳入主密码加密体系并在 `exportAll` 明文检查中一并纳入；② 若定位为局域网低敏凭据，至少在设置页显式警示「此密钥以明文保存在浏览器本地」 | 安全卫士 |
| 5 | 🟠 P1 | 安全 / A01+A05 配置 | `src-tauri/capabilities/default.json:6`、`:7-13` | 权限面相对基线扩大：`permissions` 由 `["core:default"]` → `["core:default", "updater:default"]`（含 `allow-check/download/install`，由 `0239590` 引入，晚于 08-19 基线）；`remote.urls` 仍为 `https://*`，即任意 https 来源被加载进主 webview 时继承上述权限。当前无触发路径（CSP `script-src 'self'` + src 内无 `shell.open`/`window.open`/外链 `<a href>`），属纵深防御缺口。**附带文档矛盾**：该文件 `description` 仍写「最小化：仅 `core:default`」，与实际不符 —— 这正是 08-19 基线漏记 `remote.urls` 的原因 | 删除 `remote` 段（或置 `urls: []`）；`updater` 收窄为仅 `updater:allow-check`，把「下载并安装」交给应用内显式确认；同步修正 `description` | 安全卫士（主理人已确认文件内容） |
| 6 | 🟠 P1 | 安全 / A06 组件漏洞 | `package.json`（`vitest`/`@vitest/coverage-v8` `^3.2.7`）、`js-yaml@4.3.1` | `npm audit` **4 项**（1 high + 3 moderate）：`js-yaml` high（maxTotalMergeKeys CPU DoS，经 `eslint→@eslint/eslintrc`）；`vitest`/`@vitest/coverage-v8`/`@vitest/mocker` moderate（GHSA-82fw-gwwq-j7x9 路径遍历/任意文件读）。**相对 08-19「0 漏洞」为回退**，根因是 08-20 为绕 vitest 4.1.x collector bug 降到 `^3.2.7` 而落入受影响区间。**全为 devDependencies，不进产物**；**CI 无 `npm audit` 门禁**故不阻断发布 | 评估 vitest 升级（需同时解决 collector bug，如换 `--pool=forks`）或书面接受 dev-only 风险；`js-yaml` 待 eslint 上游或加 `overrides`；**建议 CI 增 `npm audit --audit-level=high` 门禁**，避免再次静默漂移 | 安全卫士 |

### 2.3 P2 发现（19 条，按主题分组）

| # | 类别 | 位置 | 问题 | 来源 |
|---|------|------|------|------|
| P2-1 | 环境/工具 | `dist/`、`coverage/` | 沙箱 safe-delete 保护（阈值 50）拦截 vite `prepare-out-dir` 与 vitest coverage 清理，致**门禁 5/6 本地退出码恒为 1**，不可作红/绿信号（CI 干净 runner 不受影响）。构建改用 `npx vite build --emptyOutDir=false` 即 exit 0 | 质量门神 |
| P2-2 | 测试覆盖 | `e2e/contrast-axe.spec.ts` / `/local-model` | `.cap-value.ok` 在 **dark 主题首轮扫描 NOT-FOUND**（其余 4 主题均通过 7.68–11.87:1），疑为首轮模型列表未渲染完的时序问题 | 质量门神 |
| P2-3 | 门禁口径 | 基线文档 | lint 基线「~50 warnings」与实测「2 warnings」差异大，易把已修复的历史告警误判为回归 | 产品官 + 质量门神 |
| P2-4 | 兼容性 | `tokens.css:244-246` | `color-mix` 在 macOS 12 及更早（Safari 15.x）不支持；失效模式温和（回退继承色，不会不可见），仅 5 个调用点。可选加 `@supports` 回退，成本极低 | 产品官 |
| P2-5 | 无障碍 | `layout.css:260` `.send-btn-primary` | `--on-media` on `--primary` → theatre 2.40:1；内容为 `<Icon>` 非文字，axe `color-contrast` 不报，但违反 WCAG 1.4.11（非文本组件 ≥3:1） | 产品官 |
| P2-6 | 无障碍 | `DataBankView.vue:824-825`、`OnboardingModal.vue:91-92`、`SettingsModelPanel.vue:2082/2087/2114`、`CharacterEditorView.vue:1811`、`WorldBookView.vue:2044`、`GroupChatView.vue:1534/1622`、`ArchivesView.vue:614`、`ApiErrorModal.vue:240`、`SettingsView.vue:3000` 等约 13 处 | 非审计路由/共享组件的同类残留；其中 `DataBankView.vue:824`（`--error` on 10% 染层）**5 主题全不达标（3.44~4.20）**，`OnboardingModal.vue:91` 4 主题临界 4.31~4.48 | 产品官 |
| P2-7 | 代码质量 | `tokens.css:245` | `var(--warning, #f59e0b)` 的 fallback 是死代码（`--warning` 在 `:229` 恒有定义），且与仓内 `var(--warning-fg, #f59e0b)` 写法不统一 | 产品官 |
| P2-8 | 文档 | `tokens.css:241` | 注释「自定义主题覆盖 `--warning-fg` 后自动生效」少说一层间接（实经 `--warning` 别名），结论成立但链路不精确 | 产品官 |
| P2-9 | 设计取舍 | `RandomEventsView.vue:1049-1052` | 移除 `opacity: 0.7` 后 `.empty-hint` 与相邻提示不再有视觉层级差，可能被读成正文 | 产品官 |
| P2-10 | 路径/DoS | `src-tauri/src/storage/mod.rs:96-107` | `id_to_filename` 未拦 Windows 保留设备名（`CON`/`NUL`/`COM1` 等均为 `is_alphanumeric` 故原样保留）；`CON.json` 与原子写临时名 `CON.json.tmp` 均命中 → 写入被重定向到控制台设备，**静默丢数据**。路径遍历本身已防住 | 安全卫士 |
| P2-11 | A03 CSS 注入 | `settings.ts:623-636`、`theme-extractor.ts:634`、`settings.ts:1030-1056`、`backup-service.ts:294-301` | 自定义 CSS 与自定义主题背景 URL 无净化，且**可经备份导入注入**。背景 URL 转义只处理 `"` 未处理 `\`：输入 `\` 紧跟 `"` 生成 `\\"`，CSS 词法上 `\\` 是转义反斜杠、随后 `"` 闭合字符串 → **可越出 `url()`**。影响限于 CSS（无 JS 执行）：UI 重绘/点击劫持/隐藏元素/经 `background-image` 外发请求 | 安全卫士 |
| P2-12 | A08 完整性 | `local-model-engine.ts:336-349` | WebLLM 未传 `model_list` 覆盖 → 权重与 lib 运行时从 `huggingface.co` 下载，**无哈希/签名校验**；CSP `script-src` 不约束 `WebAssembly.instantiate`。ONNX 侧相反安全（本地 adapter 读取，无远程加载） | 安全卫士 |
| P2-13 | A05 配置 | `tauri.conf.json:34` vs `vite.config.ts` | 桌面 CSP 明显弱于 Web：仅 6 条指令，缺 `object-src`/`base-uri`/`frame-src`/`form-action`（依赖 `default-src 'self'` 兜底）；Web 端 CSP 以 `<meta>` 注入，故 `frame-ancestors`/`report-uri`/`sandbox` 被浏览器**忽略** → Web 端无点击劫持防护（需托管侧响应头） | 安全卫士 |
| P2-14 | 加固 | `Cargo.toml:37` | `features = ["devtools", "tray-icon"]` 无条件启用 `devtools`，release 包同样可开 DevTools | 安全卫士 |
| P2-15 | A02 | `settings.ts:798-815` | 未设主密码时 `apiProfiles[].apiKey` 明文写入 IndexedDB / `settings/app.json`（仅在 `pw` 存在时加密）。属设计选择，但用户无感知 | 安全卫士 |
| P2-16 | A03 债务 | `sanitize.ts`（src 内 **0 引用**）、`package.json` `marked`（src 内 0 import） | DOMPurify 白名单模块是**未被引用的安全保险**，`marked` 是未使用依赖。当前 AI 内容走文本插值故无 XSS；但「Markdown→HTML→`v-html`」链路一旦被引入而忘记接线 `sanitizeMarkdown`，将直接形成 XSS | 安全卫士 |
| P2-17 | A08 完整性 | `market-index.ts:63-66,100-120` | 市场条目 SHA-256 来自**同一份清单**（自证），无签名；仓库/账号被攻破即可投递通过校验的恶意条目 | 安全卫士 |
| P2-18 | 已知局限 | 全局 | 提示词注入为 AI 对话应用固有风险；缓解边界：文本插值 + 密钥加密 + SSRF 防护 + 明文密钥拒绝导出 | 安全卫士 |
| P2-19 | 环境 | `e2e/storage-state.json` | 仅预置 `localhost:5173/5174` 的 onboarding 标志，换端口跑 E2E 必被新手引导遮挡 | 质量门神 |

---

## 3. 上线前决策专项

### 3.1 Go / No-Go 决策

| 决策维度 | 结论 | 依据 |
|---|---|---|
| **本次 diff 能否发布** | 🟢 **可以** | 纯 CSS 颜色替换；安全面零变化；8 道门禁全绿；E2E 17/17；浏览器探针实测修复生效且未引入新违规；相对 08-19 无退化 |
| **阻塞项** | **0 条** | 无 P0，无门禁红灯，无密钥泄露，无生产可执行漏洞 |
| **发布说明措辞约束** | ⚠️ **不得写「WCAG AA 对比度已全面达标」** | 同类残留 9 处仍在（P1-1），该结论不成立 |
| **建议同窗口追加** | 补丁 2（清 P1-1 残留 + 扩展 P1-2 门禁） | 性价比最高，改动集中、风险低 |
| **安全面能否放行** | 🟢 可以，4 项 P1 建议排期 | 无生产可执行漏洞；SSRF 与明文密钥均为存量问题，非本轮引入 |

### 3.2 回滚预案

本次改动**尚未提交**（11 个文件在工作区），回滚成本极低：

```bash
# 方案 A（推荐）：整批丢弃，回到 HEAD 干净状态
git restore src/styles/tokens.css e2e/contrast-axe.spec.ts CONTRIBUTING.md PROJECT_INDEX.md \
            src/views/CharactersView.vue src/views/CommunityMarketView.vue \
            src/views/ImageGeneratorView.vue src/views/LocalModelView.vue \
            src/views/ProfileView.vue src/views/RandomEventsView.vue \
            src/views/StoryEngineView.vue

# 方案 B：若已提交，反转该提交
git revert <commit-sha>
```

**回滚影响面**：仅颜色表现回退（部分文字对比度重新掉到 1.00~4.49:1），**无功能/数据/接口影响**，无数据迁移，无需清理持久化状态。回滚后需重跑门禁 4/6/8（`a11y:contrast` / `build` / `test:e2e`）。

---

## ✅ 行动清单

| # | 行动 | 负责方 | 紧急度 | 依据 |
|---|------|--------|--------|------|
| 1 | **清掉 P1-1 的 9 处对比度残留**。优先 6 处 `--on-media` 误配（改 `--on-primary` / `--on-accent`）——影响最大、改动最小，尤其 dark 下 1.38:1 的文字按钮；再清 5 处「同色染层」残留（已有现成 token 可用）。**发布说明删除「WCAG AA 全面达标」措辞** | 前端 | **P0**（发布说明合规） | 产品官 |
| 2 | **修复 SSRF 归一化绕过**：`chat_stream.rs:498-524` 改为 `url::Url::parse` 后取 `host()`，对 `Host::Ipv4/Ipv6` 直接判定（含 IPv4-mapped / 未指定地址），补齐 `100.64/10`、`198.18/15`、`::/128`、`::ffff:0:0/96`；补单测覆盖全部备选表示。改动集中在单个函数，约 20 行 | Rust | **P1** | 安全卫士 |
| 3 | **收敛 Tauri 权限面**：删除 `capabilities/default.json` 的 `remote` 段（或置 `urls: []`）；`updater:default` 收窄为仅 `updater:allow-check`；同步修正 `description` 中「仅 core:default」的过期描述 | 安全 / Tauri | **P1** | 安全卫士 |
| 4 | **处置远程向量密钥明文落盘**（P1-4）：纳入主密码加密体系（并纳入 `exportAll` 明文检查），或在设置页显式警示；二选一 | 安全 / 前端 | **P1** | 安全卫士 |
| 5 | **扩展对比度静态门禁**：`scripts/check-contrast.mjs` 改为从 `tokens.css` 解析主题变量并计算派生 token（含 `color-mix`），或至少补入 3 个派生 token 对 + 「token on 同色染层」预计算色值对；**并接入 CI**（不接＝死门禁）+ 正负向自测 | CI / 前端 | **P1** | 产品官 + 质量门神 |
| 6 | **依赖漏洞决策 + CI 增 `npm audit` 门禁**：评估 vitest 升级（或书面接受 dev-only 风险）、`js-yaml` 加 `overrides`；CI 增 `npm audit --audit-level=high`，避免基线再次静默漂移 | CI | **P1** | 安全卫士 |
| 7 | 把「本地复现门禁」写入 `CONTRIBUTING.md`：构建用 `npx vite build --emptyOutDir=false`；覆盖率以「无阈值报错 + 用例全绿」判定（沙箱 safe-delete 保护会致退出码恒 1）；同时更新 lint 基线口径（50 → 2） | 文档 | P2 | 质量门神 |
| 8 | 批量清理非审计路由/共享组件的约 13 处同类残留（P2-6），建议顺手加一条「禁止 `--x` 直接作文字叠同色染层」的 grep 守卫 | 前端 | P2 | 产品官 |

---

## ✅ 行动清单处理记录（2026-09-21）

| # | 行动 | 状态 | 说明 |
|---|------|------|------|
| 1 | 清 P1-1 对比度残留 | ✅ **已完成** | `c6d84a5`。实清 **10 处**（报告 9 处 + 同模式漏改 1 处）。主理人按 WCAG 公式独立复算：dark `1.377 → 12.828`、theatre `2.399 → 7.810`、light `5.168/5.634`，改前数值与报告所载 1.38/2.40 吻合 |
| 2 | 修复 SSRF 归一化绕过 | ✅ **已完成** | `0f690cf`。改为「先归一化再判定」（`reqwest::Url`，零新增依赖）+ 补齐 CGNAT/基准测试段/未指定地址/IPv4-mapped。`cargo test` **44 passed**（新增 5 个回归测试） |
| 3 | 收敛 Tauri 权限面 | ⚠️ **部分完成** | `e53e079`。已删 `remote` 的 `https://*`、修正 description；**`updater:default` 保留未收窄** —— 报告建议未注意到 `SettingsView.vue:411` 实际调用 `downloadAndInstall()`，收窄为 `allow-check` 会让自动更新失效 |
| 4 | 远程向量密钥明文落盘 | ✅ **已完成** | `67e6cbc`。经用户决策采用「**纳入主密码加密体系**」方案。关键取舍：**不采用「读取时解密」**——`VectorModelManager.defaultFactory()` 是同步静态方法而 `decryptApiKey()` 是异步的，在此解密会把调用链整体异步化；改为「解锁时解密一次写入内存态，读取时同步取用」。另补：改密码轮换、备份明文检查纳入（此前漏检）、锁定置不可用。新增 **17 个用例**。⚠️ 边界：只消除**磁盘明文**，`lock()` 不清内存明文是既有局限 |
| 5 | 扩展对比度静态门禁 | ✅ **已完成** | `0fe8955`。不再硬编码色值，改为读 `tokens.css/themes.css` + 扫描 `src/` 实际样式配对（448 处）；双轨判定：语义配对硬卡、全仓扫描走存量棘轮 |
| 6 | 依赖漏洞 + CI `npm audit` 门禁 | ✅ **已完成** | `02deeed`。① js-yaml high 经 `npm audit fix` 非破坏性消除；② vitest 3 → **5.0.1** 消除 3 项 moderate（未撞 collector bug）；③ CI 增 `npm audit --audit-level=high` 门禁防再漂移。**`npm audit` 现 0 漏洞**。兼容性适配：vitest 5 强制 `vi.mock` 位于模块顶层，2 个测试文件改用 `vi.hoisted()` |
| 7 | CONTRIBUTING 补本地复现门禁 | ⏸ **未做** | 低风险文档项，本轮范围外 |
| 8 | 批量清理 P2-6 的约 13 处 | 🔄 **部分** | 新门禁已把存量**显性化并量化**：实际 **156 处**（远超报告估计的 13 处），已设为棘轮基线，只许降不许升；逐项收敛属后续 |

### 补充验证（全部完成后的最终状态）

**6 项 P1 全部处理完毕**：P1-1 / P1-2 / P1-3 / P1-4 / P1-6 完成，P1-5 部分完成并说明理由。

- **E2E 对比度 spec 3 passed**（`e2e/contrast-axe.spec.ts`，真实浏览器，7 审计路由 × 5 主题无 WCAG AA 违规）—— 报告指出「真正抓住这类缺陷的是 E2E」，已实跑确认。
- **8 道门禁全绿**：lint 0 error（2 既有 warning）/ i18n strict 157 文件 / CSS 约定 5/5（`!important` 46 未升）/ 对比度 ✓ + 自检 ✓ / 覆盖率 **3318 用例全过** / build ✓ / CSP ✓ / Rust `cargo test` **44 passed**。
- **依赖漏洞清零**：`npm audit` → **0 vulnerabilities**（原 1 high + 3 moderate）。
- **新对比度门禁三层验证**：① `--self-test` 正负样本（12.83:1 达标 vs 1.38:1 判失败）；② 真实注入违规规则 → 门禁立即失败、还原后通过；③ 语义配对 27×5 全达标。
- **P1-4 新增 17 用例**：覆盖三态语义（plain / unlocked / locked）与四条联动路径（设主密码 / 解锁 / 锁定 / 改密码）+ 备份拦截。

⚠️ **覆盖率口径提醒（重要）**：本轮 vitest 3 → 5 升级后，v8 provider 统计口径变化，覆盖率数字由 86.76 变为 **78.57 / 74.47 / 80.13 / 79.93** —— 与项目记录的 vitest@4 基线（78.99 / 74.05 / 81.26 / 80.22）**一致**，属口径差异而非真实下降。**跨 vitest 大版本比较覆盖率数字无意义**，已写入 `vitest.config.ts` 注释。

---

## ⚠️ 待完善 / 已知局限

- **本轮「对比度达标」的验证链条**：真正抓住这类缺陷的是 E2E（门禁 8），而静态门禁（门禁 4）对本轮改动**完全不可见**。在 P1-2 修复前，该风险敞口持续存在 —— 一旦 E2E 被跳过或抖动，同类回归会静默上线。
- **e2e 覆盖不完整（时序类）**：`.cap-value.ok` 在 dark 主题首轮扫描 `NOT-FOUND`，说明至少有一个选择器存在渲染时序依赖。QA 的探针结论「非空态空跑」成立，但**覆盖完整性仍有小缺口**。
- **存量安全 P1 均非本轮引入**：SSRF 绕过自初始提交即存在；权限面扩大由 `0239590`（08-20）引入；依赖漏洞由 08-20 的 vitest 降版引入。本次全检的价值之一是把它们从「基线已声明安全」的状态中暴露出来。
- **08-19 基线存在两处陈述失准**：①「`npm audit` 0 漏洞」已失效（现 4 项）；②「capabilities 仅 `core:default`」漏记 `remote.urls: https://*`（该字段自初始提交即存在，因当时只读了 `permissions` 数组）。后续基线报告应改为「逐字段核对」而非「读关键行」。
- **沙箱环境限制**：本地门禁 5/6 的退出码不可用（safe-delete 保护），本轮通过等价命令与「无阈值报错」双重判定确认通过。CI（干净 runner）不受影响。
- **未做的检查**：Tauri 桌面端实机打包验证（`tauri:build`）与签名发布 job 未在本轮触发；跨端（Windows/macOS 实机）视觉回归未做；性能基线（`p11-baseline.mjs` / `p11-scroll-fps.mjs`）未纳入本轮。

---

## 📚 成员产出索引

- **gstack-product-reviewer（产品官 / 代码审查）**：审查 11 个未提交文件，逐行核对 `tokens.css` + 7 视图 + e2e spec；以可复算的对比度探针（复刻 WCAG 公式 + sRGB 混合 + alpha 合成）替代 `review` skill（判定其 7 个 specialist 面向后端议题且含 auto-fix 会违反只读约束）；产出 12 项分级发现 + 残留误用清单（含「确实漏了」/「正当保留」判定）+ 兼容性论证。**主理人已独立复算其最严重一项，数值吻合。**
- **gstack-security-officer（安全卫士 / OWASP + STRIDE）**：审计 Tauri 权限面、30 个 `#[tauri::command]` 输入校验、路径净化、SSRF、密钥加密体系、XSS 链路、双端 CSP、依赖漏洞、硬编码密钥扫描、入库检查；产出 STRIDE 表 + OWASP Top 10 检查表 + 13 项分级发现 + 与 08-19 基线的逐面回退比对。**SSRF 绕过已实测复现，主理人已逐行复核源码。**
- **gstack-qa-lead（质量门神 / QA 与发布）**：实跑 8 道门禁 + 双 project E2E，使用 `qa` skill 的 issue-taxonomy；产出逐门禁实测表（命令/退出码/关键数字）+ 覆盖率四维对比 + E2E 明细 + 对比度门禁盲区判定 + 与 08-19 基线退化比对。**额外自建一次性只读浏览器探针（`artifacts/qa-probe-selectors.mjs`）逐主题读取改动选择器的实际计算色**，据此驳回产品官关于 E2E「空态空跑」的推断。

**证据文件**（均在 gitignored 的 `artifacts/`，可直接复核）：
`qa-lint.txt`、`qa-gates-fast.txt`、`qa-coverage.txt`、`qa-build.txt`、`qa-build2.txt`、`qa-e2e.txt`、`qa-probe-selectors.mjs`、`contrast-probe/axe-ratios-summary.txt`

---

> 本报告由软件工坊 AI 协作生成，关键决策请由工程负责人复核。
