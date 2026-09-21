# goal-tracker — AI 酒馆跨端一致性修复（依据 cross-client-review-2026-09-07.md 第 9 节）

> 目标：按第 9 节路线图逐条修复 28 项跨端缺陷
> 完成：全部 28 项源码落地 + 文档逐条留痕 + 每 2 项 `npm run test` 通过
> 约束：不破坏既有功能、不引入无关依赖、不删未授权文件、不碰目标外目录
> **口径**：头部结论与下方清单冲突时，**以「逐条清单」为准**。清单以 `docs/fixes/cross-client-review-2026-09-07.md` §10.1 的 `<!-- fixlog -->` 执行记录为唯一事实源。
> 同步时间：2026-09-18（依据 `docs/fixes/web-sop-review-2026-09-18.md` P0-1 修正清单与计数）

## 总进度
- [x] P0（5）：I-6 / S-4 / I-3 / I-14 / I-11
- [x] P1-A（6）：S-1 / S-2 / S-3 / S-9 / S-10 / I-4
- [x] P1-B（11）：S-5 / S-6 / I-1 / I-2 / I-13 / I-5 / I-8 / I-10 / F-1 / F-2 / F-3
- [x] P2（6）：S-7 / S-8 / I-9 / I-12 / F-4 / F-5

合计：5 + 6 + 11 + 6 = **28 项**，与第 9 节批次表（`cross-client-review-2026-09-07.md` §9.3）一致。
> 更正说明：本表原记「P1-B（13）」，与批次表实列的 11 个编号不符（S-5/S-6/I-1/I-2/I-13/I-5/I-8/I-10/F-1/F-2/F-3），属计数笔误，非漏列条目；总数 28 不变。

## 逐条清单（✓ = 已修复并留痕；~ = 部分完成，附说明）
- [x] P0-1 I-6  isComposing 守卫（ChatMain.vue:356-363；回归测试 `tests/views/chat-ime.test.ts` 5 例，2026-09-18 补）
- [x] P0-2 S-4  --z-* token，抽屉>遮罩>底部导航
- [x] P0-3 I-3  ESC 分支加 && isMobile（ChatView.vue:41）
- [x] P0-4 I-14 inert 作用域下沉（ChatView.vue:73）
- [x] P0-5 I-11 触控目标 ≥44（composer-btn/send-btn-primary/notice-dismiss）
- [~] P1A-1 S-1  删 responsive.css 旧导航方案，NavRail v-if 真卸载 —— **部分完成**。已完成：旧 `.nav-rail` 底部化死规则与横屏旧规则已删、`NavRail` 改 `v-if="!isMobile"` 真卸载（顺带解决 I-4）。**未达成**：评审为 S-1 设定的「`responsive.css` 的 `!important` 降至个位数 + CI 加『禁止 `!important` 增量』检查」两项。2026-09-18 实测 `responsive.css` 仍有 **24 处** `!important`（全 `src/` 46 处），且该检查从未建立。处置：已补 `npm run check:important` **棘轮守卫**（锁定存量 46，只许降不许升，降低时提示下调基线），不硬卡「个位数」——硬卡会让门禁长期红着进而被绕过。收敛计划见 `docs/fixes/web-sop-review-2026-09-18.md` P2-4
- [x] P1A-2 S-2  --mobile-nav-h token 归一四处高度
- [x] P1A-3 S-3  .app-main padding-bottom 合并 2 条
- [x] P1A-4 S-9  App.vue:340 全局样式迁出，main.ts 固化顺序
- [x] P1A-5 S-10 8 处野断点重构 + 断点数量 CI 守卫
- [x] P1A-6 I-4  随 S-1 高亮错位
- [x] P1B-1 S-5  .client-{mobile,tablet,desktop}-only 工具类
- [x] P1B-2 S-6  平板 CharacterList 形态固定
- [x] P1B-3 I-1  character.ts 拆 panelExpanded/contextDrawerOpen/characterDrawerOpen
- [x] P1B-4 I-2  ChatView.vue:56-59 watch 补 else
- [x] P1B-5 I-13 641-1024 消灭 inert 死区（随 S-6 闭合）
- [x] P1B-6 I-5  hover 包 @media (hover:hover)
- [x] P1B-7 I-8  useScrollLock + touchmove 滑动关闭（2026-09-17 落地；`src/composables/useScrollLock.ts` 存在）
- [x] P1B-8 I-10 goBack 优先 router.back + ProfileView 返回钮（2026-09-17 落地；ProfileView 已有 goBack）
- [x] P1B-9 F-1  classifyChatError 文案矩阵（2026-09-17 落地；`src/services/chat-error.ts` + 测试存在）
- [x] P1B-10 F-2 IndexedDBAdapter 序列化下沉 + chat.ts:801-807 审计（2026-09-17 落地；adapter 内 `serialize()` 统一入口）
- [x] P1B-11 F-3 VectorModelPanel 能力探测（2026-09-17 落地；`canPickDirectory` 能力探测）
- [x] P2-1 S-7  抽屉 transition 只写一次（2026-09-17 落地；responsive.css 合并为单一 `@media (max-width:1024px)` 块）
- [x] P2-2 S-8  100vh→100dvh 双写 + lint 禁止裸 100vh（**源码已验证**：`layout.css:10-11`、`SettingsView.vue`、`CharacterEditorView.vue` 均为 `100vh` + `100dvh` 双写，`npm run check:viewport` 通过；⚠️ 守卫脚本 `scripts/css-viewport-guard.mjs` 已就位但**尚未接入 `ci.yml`**，故该缺陷类当前无自动拦截 —— 见 `docs/fixes/web-sop-review-2026-09-18.md` P1-1）
- [x] P2-3 I-9  NavRail.vue `router.push().catch()`（2026-09-17 落地）
- [x] P2-4 I-12 遮罩键盘可达关闭（随 I-8 闭合）
- [x] P2-5 F-4 getStorageAdapter multiProfile 能力位（2026-09-17 落地；`getStorageCapability()`）
- [x] P2-6 F-5 图片选择器拍照+相册双入口（2026-09-17 落地；3 处选择器 `capture` 双入口）

## 测试节点（每 2 项）
> 节点@2 ~ @10 执行期未逐条留痕；自节点@12 起逐条记录。
- 节点@2 ~ @10: P0-1 ~ P1A-5 —— 未留痕
- 节点@12: P1A-6+P1B-1 ✓ 2689 passed
- 节点@14: P1B-2+P1B-3 ✓ 2689 passed
- 节点@16: P1B-4(I-2)+P1B-6(I-5) ✓ 2689 passed
- 节点@18: P1B-7(I-8)+P1B-8(I-10) ✓ 2689 passed + typecheck 0
- 节点@20: P1B-9(F-1)+P1B-10(F-2)+P1B-11(F-3) ✓ 2696 passed + typecheck 0
- 节点@22: P2-1(S-7)+P2-2(S-8) ✓ 2696 passed + typecheck 0 + lint 0 + i18n:strict 通过
- 节点@24 ~ @28: P2-3(I-9) / P2-4(I-12) / P2-5(F-4) / P2-6(F-5) ✓ typecheck / lint / i18n:strict 通过（fixlog 未记录用例数）

## 后续事项（不在本 28 项内，见 `docs/fixes/web-sop-review-2026-09-18.md`）
- P1-1：`check:viewport` 接入 `ci.yml`（否则 S-8 缺陷类无自动拦截）
- P2-4：`S-1` 的 `!important` 治理未达评审设定目标，宜标注为「部分完成」
