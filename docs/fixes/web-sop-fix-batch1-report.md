# Web 端 SOP 评审 · 第一批修复报告

| 项 | 值 |
| --- | --- |
| 依据 | `docs/fixes/web-sop-review-2026-09-18.md` 第五节「第一批：修正失实声明」 |
| 授权范围 | 第一批 5 项（纯声明层修正，零行为风险） |
| 执行日期 | 2026-09-18 14:45–14:55 |
| 代码基线 | commit `a2e678f`（含未提交的索引重生成） |
| 结论 | ✅ 5 项全部完成；另修复 1 项报告未预见的门禁回归 |

---

## 一、5 项修复明细

| # | 文件 | 原状态 | 修正后 | 对应问题 |
| --- | --- | --- | --- | --- |
| 1 | `docs/fixes/goal-tracker.md` | 汇总行 `P1-B（13）` 计数错；逐条清单 11 项未勾；`S-8` 状态失真；测试节点有重复行 | 整份重写：计数更正为 `（11）`；清单按 fixlog 全量补勾；`S-8` 补验证说明；节点去重；新增「以清单为准」口径行 | P0-1 |
| 2 | `README.md:138`<br>`docs/design/threat-model.md:52` | 均宣称「CSP 收紧」，未标端归属 | 明确标注 **仅桌面端**（`src-tauri/tauri.conf.json`）；声明 Web 端无 CSP，XSS 仅 `core/sanitize.ts` 的 DOMPurify 单层防护 | P0-2 |
| 3 | `.github/workflows/ci.yml:53-55` | 注释与 step 名写「80%」 | 改为 `78/73/78/78`，并注明阈值定义在 `vitest.config.ts` | P1-5 |
| 4 | `src/components/layout/CharacterList.vue:535-552` | 4 处硬编码 `40px`；注释误引 §10.4 的「≥40px」 | 4 处改用 `var(--touch-min)`（=44px）；注释更正为「≥44px（--touch-min）」 | P1-7 |
| 5 | `docs/dev/mobile-pwa-plan.md` | 状态「待执行」 | 改为「已实现」；新增第 6 节「实现回写」，记录 2 处偏差与理由、3 处遗留 | P1-9 |

---

## 二、复核中对评审报告 P0-1 的修正

评审称「清单显示 **19 项未勾选**」「`P1-B（13）` 缺 2 个编号」。复核发现两处均需修正：

1. **实际未勾选框为 11 个**（P1B-7~11 共 5 + P2-1~6 共 6）。"19" 是按汇总行 `P1-B（13）+ P2（6）` 相加得出，而汇总行本身失真 —— 属以失真数据推算失真数据。
2. **`P1-B（13）` 是计数笔误**，非漏列。第 9 节批次表（`docs/fixes/cross-client-review-2026-09-07.md` §9.3）实列 11 项：S-5 / S-6 / I-1 / I-2 / I-13 / I-5 / I-8 / I-10 / F-1 / F-2 / F-3。总数 5+6+11+6 = 28 不变。

**28 项是否真的完成？——逐项核验后：是。** 依据 `cross-client-review-2026-09-07.md` §10.1 fixlog（26 条 ✅ 记录 + I-13/I-12 两条「随项闭合」），并对关键项做代码取证：

| 项 | 代码取证 |
| --- | --- |
| P1B-7 I-8 | `src/composables/useScrollLock.ts` 存在 |
| P1B-8 I-10 | `src/views/ProfileView.vue` 已有 `useRouter` + `goBack` |
| P1B-9 F-1 | `src/services/chat-error.ts` + `tests/services/chat-error.test.ts` 存在 |
| P1B-10 F-2 | `src/storage/indexeddb-adapter.ts` 内 `serialize` 命中 11 处 |
| P1B-11 F-3 | `VectorModelPanel.vue:103` `canPickDirectory` 能力探测 |
| P2-1 S-7 | `responsive.css` 抽屉规则合并为单一 `@media (max-width:1024px)` 块 |
| P2-2 S-8 | `layout.css:10-11` 等为 `100vh` + `100dvh` 双写 |
| P2-3 I-9 | `NavRail.vue:50` `router.push(...).catch(() => {})` |
| P2-4 I-12 | `ChatView.vue` 遮罩 `role="button"` + `tabindex="0"` |
| P2-5 F-4 | `storage-factory.ts` `getStorageCapability()` 返回 `multiProfile` |
| P2-6 F-5 | 3 处图片选择器 `capture` 双入口 |

**结论**：P0-1 的方向（台账失真）成立，但失真点是**逐条清单未同步 fixlog**，而非头部「全部 28 项源码落地」虚报 —— 该句为真。

---

## 三、附带修复：`npm run lint` 回归（报告未预见）

| 项 | 内容 |
| --- | --- |
| 现象 | `npm run lint` 报 **78233 errors / 2 warnings**，全部来自 `artifacts/dist/**` 下的已编译 bundle |
| 根因 | 2026-09-18 目录整理把 17 个 `dist-*`、`coverage-ci/` 快照移入 `artifacts/`，但 `eslint.config.js` 的 `ignores` 仍按**旧根路径逐条枚举**（`dist-opt*/**`、`dist-qa/**`、`coverage-ci/**` …）。路径失效后 eslint 开始扫描构建产物 |
| 影响 | `quality-gates` 的**第 1 道门禁**被静默打断。迁移后验证只跑了 i18n / breakpoints / build / test，**漏了 lint** |
| 修复 | `eslint.config.js` 的 `ignores` 收敛为 `artifacts/**`，并补 `.workbuddy-ai/**`；删除 8 条失效规则（已核验无任何脚本产出这些目录） |
| 修复后 | `npm run lint` → **0 error**（2 个 `CharacterList.vue:110-111` 既有 warning，非阻断） |
| 记录 | `MIGRATION_LOG.md` 第十节（含根因、删除依据、验证） |

---

## 四、验证结果

| 门禁 | 命令 | 结果 |
| --- | --- | --- |
| 代码风格 | `npm run lint` | ✅ 0 error（2 warning 既有） |
| i18n 严格 | `npm run i18n:check:strict` | ✅ src 148 文件无硬编码中文 |
| 断点守卫 | `npm run check:breakpoints` | ✅ 无野断点、`matchMedia` 唯一来源、L1/L4 同步 |
| 视口守卫 | `npm run check:viewport` | ✅ 无裸 `100vh` |
| 对比度审计 | `npm run a11y:contrast` | ✅ 0 项未达 AA |
| 类型检查 | `npm run typecheck` | ✅ 0 error |
| 相关单测 | `npx vitest run tests/accessibility/components-axe.test.ts tests/stores/character.test.ts` | ✅ 72 passed |

> 未跑全量 `npm run test:coverage`（改动为声明层，无逻辑分支变化）。

---

## 五、未授权批次（仍待确认）

| 批次 | 内容 | 关联问题 |
| --- | --- | --- |
| 第二批 | `check:viewport` 接入 CI；重写 `CONTRIBUTING.md` 门禁清单（按端分组）；README 门禁对齐；补 `workflow_dispatch`；新增移动视口 Playwright project（≥3 用例） | P1-1 / P1-2 / P1-3 / P1-4 / P1-6 |
| 第三批 | Web 端补 CSP + 字体自托管；`navigator.storage.persist()` + 设置页状态；README「Web 端已知限制」；`e2e/backup-restore.spec.ts` | P0-2 / P0-3 / P1-10 / P2-2 |
| 第四批 | 统一 640 断点表述；`threat-model.md` 补 Web/PWA 威胁面；i18n 首访 `navigator.language`；确立「评审建议 → 门禁」登记表规则；`S-1` 标注部分完成；批量修 `I-5` hover 守卫 | P1-8 / P2-1 / P2-3 / P2-4 / P2-5 / P2-6 |

---

## 六、备注

- `docs/` 依项目既有约定被 `.gitignore` 排除，故 `goal-tracker.md`、`threat-model.md`、`mobile-pwa-plan.md`、`web-sop-review-2026-09-18.md` 的改动**不进入 Git 历史**。
- 本次进入 Git 工作区（未提交）的改动：`ci.yml`、`README.md`、`eslint.config.js`、`CharacterList.vue`、`MIGRATION_LOG.md`。
- 另有**前序会话遗留的未提交改动**：`PROJECT_INDEX.md`、`scripts/gen-project-index.mjs`（索引重生成，非本次产生）。
- 全程未执行任何 Git 写操作。
