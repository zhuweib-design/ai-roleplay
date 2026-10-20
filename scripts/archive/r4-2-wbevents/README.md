# R4-2 一次性脚本留档：WorldBookEventsPanel 拆分（1160 → 235 装配层）

2026-10-20。把 `src/components/worldbook/WorldBookEventsPanel.vue`（1160 行）拆成
宿主装配层 + 事件列表 + 事件编辑器 + 面板上下文 composable。

| 文件 | 行数 | 说明 |
|---|---|---|
| `tmp-split-wbevents.mjs` | — | 拆分生成器（`--dry` 只打印不落盘） |
| `WorldBookEventsPanel.orig.vue.txt` | 1160 | **切片基准**（拆前的原文快照） |

> 基准故意存成 `.txt`：`.vue` 会被 ESLint 当成 SFC 解析并报
> `was not found by the project service`，而这份文件不是源码、也不该进 tsconfig。

## 为什么留档

沿用 R4-1 的方法：**模板与样式一律按行号切片，只有 script 手写**。理由是 R3-3 那次
"凭印象重写宿主样式"导致 css-equiv 报 38 条丢失。切片的代价是脚本强绑定原文行号，
所以必须把原文与脚本一起留档，否则脚本三个月后就跑不起来了。

## 本轮新增的三个坑（都会在后续拆分里重演）

1. **不能读仓库里的源文件当基准**。本脚本会把源文件覆写成拆分后的宿主；第二次运行时
   如果仍读 `src/components/worldbook/WorldBookEventsPanel.vue`，行号早就对不上，
   `L.slice(398 - 1, 436)` 越界后**静默返回空串**——产出的 `.vue` 语法完全合法
   （`<template>` 里只剩一个 `v-else`、`<style>` 里只剩两个媒体块），
   `vue-tsc` 与 `eslint` 也都通过，只有人眼看 demo 时才发现界面空了。
   对策两条：① 基准固定读归档副本；② `slice()` 越界或切空**直接抛错**。
2. **本项目没有格式化配置，别跑 `npx prettier`**。仓库既无 `.prettierrc*` 也没有
   prettier 依赖，`npx prettier --write` 会拉到默认配置（双引号 + 尾逗号），
   把整个文件的风格改成与仓库相反。格式靠手写对齐 + ESLint。
3. **共享状态不能用模块级单例**。第一版把 `selectedEventId` / `rejectedFields` /
   `keywordDraft` / toast 三兄弟放在模块作用域，模板渲染正确、单测前两条也绿，
   但从第 3 条起全红，报 `TypeError: Cannot read properties of null (reading
   'insertBefore')`。根因：模块级 ref 被同页面**所有**面板实例共享，包括测试里
   已经 `document.body.innerHTML = ''` 掉、却没有 `unmount()` 的旧实例；新实例弹
   toast → 旧实例跟着重渲染 → 落到已脱离文档的锚点上。
   改用 `provide/inject`（`provideWorldBookEvents()` / `useWorldBookEvents()`）：
   状态随面板实例生灭，子树内共享，跨实例零串味。

## 复现

```bash
node scripts/archive/r4-2-wbevents/tmp-split-wbevents.mjs --dry   # 预检行数与产物规模
node scripts/archive/r4-2-wbevents/tmp-split-wbevents.mjs         # 落盘
```

拆完必须跑的三条交叉验证：

```bash
node scripts/css-equiv-guard.mjs --base HEAD \
  src/components/worldbook/WorldBookEventsPanel.vue \
  src/components/worldbook/WorldBookEventList.vue \
  src/components/worldbook/WorldBookEventEditor.vue
```

预期丢失 8 条、全部可解释：`.sr-only`（全局 `base.css` 有 `!important` 版）、
`.event-state-badge` + 3 个 `state-*` 变体（改成宿主 `.events-section :deep(...)`，
multiset 形式变了）、`.event-editor-grid .form-hint`（FormField 渲染的是
`.form-field-hint`）、`.entries-layout` / `.entries-list-panel`（模板中从无）。
**真丢失 0 条。**
