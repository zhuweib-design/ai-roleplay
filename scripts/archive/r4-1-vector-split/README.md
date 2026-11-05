# R4-1 向量检索面板拆分：一次性脚本留档

2026-10-20 拆分 `src/components/settings/VectorModelPanel.vue`（1023 → 285 行，拆出 4 个子面板）时用的三个探针脚本。**只作为方法留档，不再维护**，下一批要用请重写或先提升为正式脚本（见 `DEV_PLAN §7.12` 观察项）。

## 文件

| 文件 | 作用 |
|---|---|
| `tmp-dead-css.mjs` | 死样式扫描：一条规则里的**每个**类都必须在模板中出现，缺一个则整条永远匹配不到。产出死规则明细与占用的样式行数 |
| `tmp-split-vector.mjs` | 生成器：模板与样式**按行号精确切片**，script 手写；共用皮肤统一转成 `.settings-section :deep(...)` |
| `tmp-verify-vector.mjs` | 回查 css-equiv 报出的每一条"丢失"：是 `:deep()` 形式变化（body 逐字一致）还是真丢了 |

## 为什么要按行号切片，不按"合理编写"

R3-3（`LocalModelView`）那次宿主样式是凭印象重写的，css-equiv 一次报出 **38 条丢失**，逐条看全是值不对（padding 12 vs 16、radius pill vs sm、漏整个 background 块）。根因是只读了文件后半段的样式就动手写了前半段。

所以本轮改成：**样式与模板一律从原文按行号切片，只对选择器做程序化包装**，不做任何手工重写。结果 css-equiv 丢失 22 条 = 21 条 `:deep()` 形式变化（body 逐字一致）+ 1 条死规则删除，**真丢失 0**。

## 死样式扫描器的 4 个坑（都踩过，别重犯）

1. **「任一活类即算活」会漏后代选择器**。`.ctx-preset .btn.active` 里只要有一个类不在模板，整条就永不命中；按"有一个活就算活"会放过它。
2. **`:class="{ active: cond }"` 的对象语法要解析键名**，只按 `class="..."` 静态字面量收 token 会把所有条件类误判成死。
3. **注释替换成等长内容时必须保留内部换行**，否则行号前移、明细指错位置。
4. **顶层 `<template>` 要用「行首无缩进」判定**，不能用 `trim()`：`<template #header>` 插槽的 `</template>` 会被当成 SFC 顶层闭合，把模板截断后大批活规则被误判成死（R3-2 假死 9 条 / 47 行）。

另：本文件是 LF，但扫描器仍统一 `split(/\r?\n/)` —— CRLF 文件用 `split('\n')` 时每行留 `\r`，会让 `l === '<template>'` 静默失配、直接 SKIP。**静默跳过比报错危险。**

## `:deep()` 让死样式扫描器产生假阳性

本轮把共用皮肤（`.field-input` / `.add-btn` / `.mini-btn` / `.box-title` / `.field-row` …）留在宿主，写成 `.settings-section :deep(.xxx)`，目标类在**子组件**模板里。宿主单文件扫描时这些规则全被判成"死"（12 条 / 66 行），这是预期的假阳性。

正确做法：把参与拆分的**全部文件模板合并**成一份 token 集合再判定。`tmp-verify-vector.mjs` 里的 `tokens` 就是干这个的，实测 21 条 `:deep()` 规则的目标类全部命中，剩余 1 条 `.field-input.has-error` 确认是死规则（模板里从无 `has-error`），删除正确。

## 跑法

```bash
node scripts/archive/r4-1-vector-split/tmp-dead-css.mjs <file.vue>
node scripts/archive/r4-1-vector-split/tmp-verify-vector.mjs   # 依赖 css-equiv-guard 导出的 rules/styleKeys
```

（第二个脚本从 `./css-equiv-guard.mjs` 导入，移进 archive 后相对路径已断，需改回 `../../css-equiv-guard.mjs` 才能跑。）
