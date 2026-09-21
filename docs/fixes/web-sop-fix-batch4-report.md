# Web 端 SOP 评审 · 第四批修复报告（口径统一与流程固化）

| 项 | 值 |
| --- | --- |
| 依据 | `docs/fixes/web-sop-review-2026-09-18.md` 第五节「第四批」 |
| 授权范围 | 第四批 6 项（第 15–20 项） |
| 执行日期 | 2026-09-18 16:26–17:05 |
| 结论 | ✅ 6 项全部完成；另新增 2 道门禁（hover / `!important`），并产出首份「建议 → 门禁」登记表 |
| 门禁变化 | `quality-gates` 由 8 道扩为 **10 道** |

---

## 一、6 项修复明细

### 15. 统一 640 断点表述（P1-8）✅

以 `≤640 移动 / 641–1024 平板 / ≥1025 桌面` 为唯一口径，修正了 6 处错误表述：

| 位置 | 原表述 | 更正为 |
| --- | --- | --- |
| `src/App.vue:339` 注释 | `<640px 显示` | `≤640px 显示` |
| `src/components/mobile/BottomNav.vue:5` 注释 | `桌面(≥640px)隐藏` | `桌面(≥641px)隐藏` |
| `docs/dev/mobile-pwa-plan.md:64` | `<640px` / `≥640px` | `≤640px` / `≥641px` |
| `docs/design/mobile-ui-design.md:18` | `<640px 隐藏 NavRail` | `≤640px` |
| `docs/design/mobile-ui-design.md:150-151` 断点表 | `<640px` / `640–1024px` / `>1024px` | `≤640px` / `641–1024px` / `≥1025px` |
| `docs/design/mobile-ui-design.md:291-292` | `桌面（≥640px）` / `移动（<640px）` | 按实际行为重写为 `≥641px 显示 NavRail` / `≤640px NavRail 真卸载` |
| `docs/design/software-design-document.md:35,153` | `移动端<640px` / `640/760px` | `移动端 ≤640px` / `统一 640px 断点` |

**并在 `docs/design/design-system-specification.md §8` 确立为唯一表述来源**：新增显式声明块，说明其他文档「引用本节，不得复述另一套边界」，并指明代码侧对应来源为 `src/core/viewport.ts`（L4）与 `src/styles/tokens-responsive.css`（L1），二者同步由 `check:breakpoints` 守卫。

> 附带修正：该文件自身此前也**同时存在**正确（§8 注）与错误（§8 表格、§8 上文）两套表述，属自相矛盾，本次一并统一。

### 16. `threat-model.md` 补 Web/PWA 威胁面（P2-1）✅

新增第 7 节，三个子节：

| 子节 | 内容 |
| --- | --- |
| 7.1 威胁清单 | 6 项 Web/PWA 独有威胁：SW 缓存污染、PWA 离线面、外链字体泄漏 IP/Referer、IndexedDB 可用性、同源脚本读取、**点击劫持（meta CSP 不支持 `frame-ancestors`，当前无防护）** |
| 7.2 托管侧责任边界 | 4 项**不在应用代码内**、必须由部署方落实的控制：强制 HTTPS、`frame-ancestors` 响应头、响应头 CSP、静态资源完整性 |
| 7.3 IndexedDB 数据可用性 | 3 类失效模式（存储压力驱逐 / Safari 7 天清理 / 配额上限）的触发条件、后果与控制；含残余风险接受说明 |

### 17. i18n 首访读取 `navigator.language`（P2-3）✅

- `src/i18n/index.ts` 新增 `detectLocale()`：取值顺序 `navigator.languages[0]` → `navigator.language`；`zh*` → zh，`en*` → en，其余回退 zh（大小写不敏感）
- `src/stores/settings.ts` 的 `loadFromStorage()` 中**先探测、后由持久化值覆盖** —— 保证「用户显式选择」始终优先，浏览器语言只作未选择时的默认值
- `tests/i18n.test.ts` 新增 **6 例**：zh\*/en\*、`languages` 缺失回退 `language`、两者皆缺失、不支持语言、大小写不敏感

### 18. 确立「评审建议 → 门禁」登记表规则（P2-6）✅

| 载体 | 内容 |
| --- | --- |
| `CONTRIBUTING.md` | 新增「🧭 评审与门禁约定」：① 门禁清单单一事实源；② **评审收尾必须输出登记表**（已转/未转/不适用，未填完不算评审完成）；③ **新增门禁脚本的 5 条约定**（须接入 CI、须正负向自测、须登记、存量未收敛用棘轮） |
| `docs/other/项目文档结构.md` | 第四节「测试与质量阶段」新增第 5 项，把登记表纳入文档体系 |
| `docs/fixes/web-sop-review-2026-09-18.md` | 新增第七节，**产出本规则的首个实例**（见下） |

**首份登记表结果**：14 条建议全部标注归宿 —— **8 条已转门禁**、1 条已转流程、1 条未转独立门禁（已有单测防线）、2 条未转（附理由）、2 条不适用，归宿明确率 **14/14**。按 P2-6 原始清单的 6 项「加门禁」建议计，转化率由 **1/6 → 5/6**（余 I-7 控件字号未转，理由已登记）。

### 19. `S-1` 标注部分完成 + `!important` 棘轮门禁（P2-4）✅

- `docs/fixes/goal-tracker.md`：`S-1` 由 `[x]` 改为 `[~] 部分完成`，清单图例增加 `~` 说明。**已完成**：旧 `.nav-rail` 底部化死规则删除、`NavRail` 改 `v-if` 真卸载（含 I-4）。**未达成**：评审设定的「`responsive.css` 的 `!important` 降至个位数 + 加禁止增量检查」—— 实测 `responsive.css` 仍有 **24 处**（全 `src/` **46 处**）
- 新增 `scripts/important-guard.mjs` → `npm run check:important`：**棘轮策略**，锁定基线 46 处，只许降不许升；下降时提示下调基线
- 统计前**剥离 CSS 注释**，避免把「注释里提到 `!important`」计入（修正后为 46，而非朴素的 47）
- **不硬卡「个位数」的理由**：现状达不到，硬卡会让门禁长期红着、进而被绕过 —— 正是本报告批评的失效模式

### 20. 批量修复 `I-5` hover 守卫（P2-5）✅

**规模**：`src/` 下共 **191 条** `:hover` 规则，此前仅 1 个文件有守卫。

**处置**（用 postcss 做机械改写，非正则）：

| 类别 | 数量 | 处置 |
| --- | --- | --- |
| 纯 `:hover` 规则 | **184** | 整体包裹进 `@media (hover: hover) and (pointer: fine)` |
| 与 `:focus-visible` 组合的规则 | **6** | **不整体包裹**（会让触屏外接键盘丢失焦点样式），手工拆为两条：hover 分支包裹、focus 分支保持无守卫 |
| 已在守卫内 | 1 | 跳过 |

**6 条组合规则的拆分位置**：`MessageBubble.vue`（`.msg-wrap` 工具条）、`app-global.css`（`.notice-dismiss`）、`CharactersView.vue`（`.char-card`）、`CommunityMarketView.vue`（`.market-card`）、`SettingsView.vue`（`.settings-nav-item-desc` tooltip）、`StoryEngineView.vue`（`.drop-zone`）。

**「hover 才显形」核查**：扫描 191 条规则中声明体含显隐语义者，确认**唯一的真·显形交互**是 `SettingsView` 的设置项说明 tooltip，且其 `@media (hover: none)` 常显兜底已在 P1B-6 落地。其余为 `opacity: 0.9` / `translateY(-1px)` 一类强调，无显隐问题。

**新增守卫** `scripts/hover-guard.mjs` → `npm run check:hover`：
- 禁止 `src/` 下出现不在 `(hover: hover)` media 内的 `:hover`；
- 单独报错「`:hover` 与 `:focus`/`:active` 写在同一选择器列表」并给出拆分指引；
- 附带**告警（不阻断）**：检测疑似「hover 才显形」但本文件无 `(hover: none)` 兜底（判定只看声明体的 `visibility: visible` / `display:`，避免把类名里的 "visibility" 或 `translateY(-1px)` 误判）。

**验证方式与风险控制**：
1. 改写前对 `src/` 做整目录备份（`artifacts/backup/src-pre-hover-guard-20260918-1635`）；
2. 首次应用发现 postcss 的 `end.offset` 含尾部换行，导致 wrapper 内多空行、下一条规则被粘连 —— **已从备份还原后修正脚本重做**，最终 diff 干净；
3. 改写是**语义安全**的：桌面（`hover: hover` + `pointer: fine`）媒体查询命中，行为与原状完全一致；触屏不命中，hover 样式关闭（即修复目标）；
4. 全套门禁 + 全量单测 + 全量 E2E 复跑通过（见第二节）。

> **诚实标注**：仓库**没有视觉回归基线**（`theme-visual.spec.ts` 只生成截图、不做比对），因此「桌面端 hover 视觉无变化」由「媒体查询在桌面必然命中」这一构造性论证保证，而非像素级比对。移动 project（Pixel 5，`hasTouch: true` → `hover: none`）跑通了 hover 样式**被关闭**的那条分支，覆盖了本次改动的新增路径。

---

## 二、执行期发现：P2-3 引发的两处「隐性依赖宿主环境语言」

这是本批**最有价值的发现**，两处同源问题，均属「测试/环境隐含依赖默认语言」，不是功能缺陷。

### 2.1 单测层：`tests/stores/settings.test.ts` 2 例失败

`loadFromStorage` 现在会按 `navigator.language` 兜底语言，而 jsdom 的默认值是 `en-US` → 语言被切成 en → 两例断言中文错误文案（`'加载设置失败'`）的用例失败，实际收到 `'Failed to load settings: ...'`。

**修正**：`beforeEach` 显式 `initLocale('zh')`（测试不应依赖宿主环境语言），并补 2 例新行为测试（首访按浏览器语言 / 持久化值优先）。

### 2.2 E2E 层：**13/14 用例失败**

全量 E2E 一度 13 失败。用 Playwright 抓到的页面快照定位到根因：页面导航渲染成了 **英文**（`Chat` / `Characters` / `World Book`），而所有既有 spec 断言的是中文（如 `getByRole('radiogroup', { name: '选择主题' })`）。原因是 **Playwright 默认 `locale` 为 `en-US`**，首访检测把界面切成了英文。

**修正**：`playwright.config.ts` 的全局 `use` 增加 `locale: 'zh-CN'`（附注释说明理由），并**新增 `e2e/i18n-locale.spec.ts`** 用 `test.use({ locale: 'en-US' })` 覆盖，专门走英文分支 —— 否则这条新逻辑在 E2E 层完全没有覆盖。

> **教训**：新增「按环境自动决策」的功能（语言、时区、主题偏好等）时，必须同步排查测试是否隐含依赖了该环境的默认值。本次两处失败都在功能实现之外暴露，若只跑单测会漏掉 E2E 那处（反之亦然）。

---

## 三、验证结果

| 门禁 | 命令 | 结果 |
| --- | --- | --- |
| 代码风格 | `npm run lint` | ✅ 0 error |
| i18n 严格 | `npm run i18n:check:strict` | ✅ src 149 文件 |
| 断点守卫 | `npm run check:breakpoints` | ✅ 通过 |
| 视口守卫 | `npm run check:viewport` | ✅ 通过 |
| **hover 守卫（新增）** | `npm run check:hover` | ✅ 通过（191 条规则全部分流） |
| **`!important` 守卫（新增）** | `npm run check:important` | ✅ 通过（46 处，未新增） |
| 对比度审计 | `npm run a11y:contrast` | ✅ 0 项未达 AA |
| CSP 契约 | `npm run check:csp` | ✅ 通过 |
| 类型检查 | `npm run typecheck` | ✅ 0 error |
| 全量单测 | `npm run test` | ✅ 99 文件 / 2720 测试通过 |
| 全量 E2E | `npx playwright test` | ✅ **15 passed**（桌面 11 + 移动 3 + 新增语言检测 1） |

### 新门禁的正负向自测

| 门禁 | 正向 | 负向（构造违规样本） |
| --- | --- | --- |
| `check:hover` | ✅ 通过 | ✅ 裸 `:hover` → 拦下；`:hover` 与 `:focus-visible` 组合 → 拦下；清理后恢复通过 |
| `check:important` | ✅ 通过 | ✅ 新增 1 处 `!important` → 拦下；还原后恢复通过 |

---

## 三、遗留事项

| 项 | 状态 | 说明 |
| --- | --- | --- |
| **I-6 IME 回归无任何自动化覆盖** | ✅ 已关闭 | 本轮发现后已补齐：新增 `tests/views/chat-ime.test.ts`（5 例）。**已做负向自测**——临时移除 `ChatMain` 的 I-6 守卫后恰好那 2 例 IME 用例失败、其余 3 例仍通过，证明测试真正钉住守卫 |
| **I-7 控件字号 ≥16px 未门禁化** | ⚠️ 未转 | 实现侧已有全局规则；建议与 hover 守卫合并为「移动端 CSS 约定守卫」时纳入 |
| **字体自托管（P2-2）** | ⏳ 未实施 | 见第三批报告 |
| **Web 端发布/部署 SOP** | ~~❌ 仍缺~~ **✅ 已于 2026-09-20 补齐** | 新增 `docs/dev/web-deployment-sop.md`；采用目标无关写法，故无需先定托管目标 |
| **`!important` 收敛至个位数** | ⏳ 棘轮中 | 当前 46 处（`responsive.css` 24 处），守卫只保证不恶化 |
| **本地模型路径未经运行时验证** | ⚠️ 未验证 | 见第三批报告（CSP 放行清单） |
| **门禁步骤数** | 📌 治理提示 | `quality-gates` 已达 10 道，其中 4 道是 CSS 约定守卫；若继续增加，建议合并为单一 `check:css-conventions` 入口 |
