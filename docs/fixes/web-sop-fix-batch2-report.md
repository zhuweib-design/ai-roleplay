# Web 端 SOP 评审 · 第二批修复报告（补齐门禁）

| 项 | 值 |
| --- | --- |
| 依据 | `docs/fixes/web-sop-review-2026-09-18.md` 第五节「第二批：补齐门禁」 |
| 授权范围 | 第二批 5 项（第 6–10 项） |
| 执行日期 | 2026-09-18 14:55–15:05 |
| 结论 | ✅ 5 项全部完成；`quality-gates` 由 6 道扩为 7 道 |

---

## 一、5 项修复明细

| # | 文件 | 修正内容 | 对应问题 |
| --- | --- | --- | --- |
| 6 | `.github/workflows/ci.yml` | 在 `quality-gates` 中紧随 `check:breakpoints` 加入 `Viewport guard (check:viewport)` 步骤。此前 `css-viewport-guard.mjs` 脚本有效但未接入任何流程，S-8（裸 `100vh`）缺陷类**无自动拦截** | P1-1 |
| 7 | `CONTRIBUTING.md` | 门禁清单重写并**按端分组**：Web 端必跑（7 条）／桌面端（改 `src-tauri/` 时跑）／端到端；补齐此前缺失的 `check:breakpoints`、`check:viewport`、`test:coverage`；注明以 `ci.yml` 的 `quality-gates` 为单一事实源 | P1-2 |
| 8 | `README.md` | 门禁清单按端重排；补 `functions 78 / lines 78` 阈值（原只写 78/73）；`tauri:build` 从"本地门禁"移入桌面端小节；CI 链路描述补 Breakpoint / Viewport guard 并按实际顺序排列；目录结构补 `e2e/`、`scripts/`、`docs/`、`artifacts/`，并修正 E2E 归属（原误归 `tests/`） | P1-3 |
| 9 | `.github/workflows/ci.yml` | `on:` 块补 `workflow_dispatch:`，使 `tauri-release` 的 `if: github.event_name == 'workflow_dispatch' \|\| ...` 分支可达；并注明手动触发时 `github.ref_name` 为分支名、会以该名建 release/tag，故签名包入口应配合 tag 使用 | P1-4 |
| 10 | `playwright.config.ts`<br>`e2e/mobile/mobile-layout.spec.ts`（新增） | 新增移动视口 project（`devices['Pixel 5']`，393×727）；桌面 project 以 `testIgnore: '**/mobile/**'` 排除，移动 project 以 `testMatch: '**/mobile/**/*.spec.ts'` 限定，两者互不重叠。新增 3 条用例覆盖报告建议的全部场景 | P1-6 |

### 新增移动用例（3 条）

| # | 用例 | 断言要点 | 对应缺陷项 |
| --- | --- | --- | --- |
| 1 | 底部导航：可见、NavRail 卸载、5 个 tab 可切换且高亮唯一 | `nav.bottom-nav` 可见；`.nav-rail-desktop` `toHaveCount(0)`（证明是 `v-if` 真卸载而非 CSS 隐藏）；5 个 `a[href]` 全部可达；逐个点击后 URL 迁移 + `aria-current="page"` + `.active`，且**同时只有一个** tab 带 `aria-current` | S-1 / I-4 |
| 2 | 抽屉打开时遮罩层级正确，点击底部导航区域被拦截 | 抽屉滑入动画收敛（`transform` 归零）后：z-index 抽屉(70) > 遮罩(60) > 底部导航(40)；最右 tab 处 `elementFromPoint` 命中 `.overlay-mask`；点击该点后遮罩与抽屉同时失活且 URL 不变 | S-4 |
| 3 | 主流程 5 个 tab 页无横向溢出 | 5 条路由下 `scrollWidth - clientWidth ≤ 1`（允许亚像素） | 640 边界布局 |

---

## 二、执行期发现：一个测试设计陷阱（非产品缺陷）

用例 2 初版探测点取底部导航**几何中心**（x≈196），断言失败 —— 遮罩未关闭。

**取证过程**：用临时调试用例输出 `elementFromPoint` 与祖先层叠上下文链，结果显示：

- 命中元素为 `DIV.overlay-mask active`（z 60 > 底部导航 40，无祖先创建层叠上下文）—— 遮罩确实覆盖底部导航；
- 但该结论是在**抽屉动画尚未收敛**时取得的（当时抽屉 `transform: translateX(-100%)` 仍在屏外）。

**真实原因**：左抽屉宽 280px，动画收敛后覆盖 x∈[0,280]；底部导航几何中心 x≈196 落在抽屉（z 70）之上，点击命中的是**抽屉**而非遮罩。属用例探测点选取错误。

**修正**：探测点改取最右侧 tab（x ≈ 354，在抽屉 280px 之外、仍在遮罩覆盖内），并补 `await expect(drawer).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)')` 等待动画收敛。

**结论**：**S-4 是真闭环的**，不是产品缺陷。该陷阱值得记录——凡「验证遮挡层级」的用例，探测点必须避开合法压在上层的元素，并等待动画收敛。

---

## 三、验证结果

| 门禁 | 命令 | 结果 |
| --- | --- | --- |
| 代码风格 | `npm run lint` | ✅ 0 error（2 个既有 warning） |
| i18n 严格 | `npm run i18n:check:strict` | ✅ src 148 文件无硬编码中文 |
| 断点守卫 | `npm run check:breakpoints` | ✅ 通过 |
| 视口守卫 | `npm run check:viewport` | ✅ 通过 |
| 类型检查 | `npm run typecheck` | ✅ 0 error |
| 移动视口 E2E | `E2E_PORT=5174 npx playwright test --project=mobile-msedge` | ✅ **3 passed (15.0s)** |
| 桌面 project 抽验 | `E2E_PORT=5174 npx playwright test --project=msedge e2e/theme-flow.spec.ts` | ✅ 1 passed（确认 `testIgnore` 未影响桌面用例） |
| 用例发现 | `npx playwright test --list` | ✅ 13 tests / 7 files（桌面 10 + 移动 3） |

---

## 四、副作用与注意事项

- **CI 时长增加**：`quality-gates` 多一道 viewport 守卫（毫秒级）；`e2e` job 多一个移动 project（3 条用例，本地 15s，CI 单 worker 下更长）。可接受。
- **本地跑 E2E 的端口约定**：`e2e/storage-state.json` 只预置了 `localhost:5173` 与 `5174` 两个 origin 的 onboarding 完成标志。用 `E2E_PORT` 跑其他端口会导致新手引导弹窗遮挡页面而失败 —— 如需新端口，须同步补该文件。
- **桌面用例不重复在移动视口执行**：`theme-visual.spec.ts` 等桌面用例在 393px 下无意义，故用 `testIgnore` 排除。若未来新增「两端都该跑」的用例，应放到 `e2e/` 根目录（两个 project 都会执行）。

---

## 五、剩余批次

| 批次 | 内容 | 关联问题 |
| --- | --- | --- |
| 第三批 | Web 端补 CSP + 字体自托管；`navigator.storage.persist()` + 设置页持久化状态；README「Web 端已知限制」小节；`e2e/backup-restore.spec.ts` | P0-2 / P0-3 / P1-10 / P2-2 |
| 第四批 | 统一 640 断点表述（`≤640 / 641–1024 / ≥1025`）；`threat-model.md` 补 Web/PWA 威胁面；i18n 首访 `navigator.language`；确立「评审建议 → 门禁」登记表规则；`S-1` 标注部分完成；批量修 `I-5` hover 守卫 | P1-8 / P2-1 / P2-3 / P2-4 / P2-5 / P2-6 |
