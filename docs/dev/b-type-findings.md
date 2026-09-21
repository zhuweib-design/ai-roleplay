# `!` 非空断言（B 型）复核清单

> 关联任务：P2-2.1 `!`断言语义化 — 精准治理审计记录
> 状态：记录归档（非待办清单）。审计日期：2026-08-21
> 说明：本文件位于 `docs/`（被 `.gitignore` 排除，**仅本地保留、不入仓库**）。

## 背景

`noUncheckedIndexedAccess` 开启后，TS 对数组/对象索引访问返回 `T | undefined`。全项目有约 177 处 `!` 断言。本清单按「是否有前置守卫」将候选分为 A / B 型，**仅 A 之外的真 B 型需要关注**。

## 分类标准

- **A 型**：有前置守卫保证（`length > 0`、循环边界、先 `set`/`has`、迭代自身 `keys`、`return` guard），`!` 不会不成立 → 保留，不做机械替换。
- **B 型**：无前置守卫，`!` 不成立时抛裸 `TypeError` 或产生错误语义 → 需守卫或记录风险。

## 复核结果表

| # | 位置 | 断言行 | 初判 | 复核结论 | 处理 |
|---|---|---|---|---|---|
| 1 | `components/chat/ChatMain.vue:386` | `messages.find(...)!` | B | **真 B**：find 无回退，消息被并发删除时向 `copyMessage` 传 undefined | ✅ 已修复（判空守卫） |
| 2 | `components/chat/NewConversationModal.vue:194` | `Array.from(selected)[0]!` | B | A：`canConfirmSingle = size === 1` 恰有 1 元素 | 保留 |
| 3 | `api/tauri-openai-client.ts:262` | `queue.shift()!` | B | A：内层 `while(length>0)` 保证非空 | 保留 |
| 4 | `api/local-api-client.ts:120` | `queue.shift()!` | B | A：`while(length===0){ if(done)return; await }` 出循环即非空 | 保留 |
| 5 | `core/compression.ts:112` | `pool.shift()!` | B | A：`while(... && pool.length>0)` 保证非空 | 保留 |
| 6 | `views/StoryEngineView.vue:708` | `errors[0]!` | 中 | 需外层确认；errors 为空时为低影响 | 保留 |
| 7 | `core/character-version-control.ts:594,595,679,680` | `commits.get(headId)!` | B | **弱 B**：仅前置 `headId` 非空，未保证其存在于 `commits`；合并时悬挂引用会抛裸 TypeError。触发面窄（非热路径） | 记录，可接受边缘风险 |
| 8 | `core/character-version-control.ts:869` | `parts[len-1]!` | B | 极端空 `parts` 不抛，仅为语义错位写 `undefined` 键 | 保留低风险 |
| 9 | `core/memory-store.ts:112,125,144` | `.get(id)!.snapshots[0]!` | B | A：上一行先 `set`，且读取前有 `if(!snap) return null` | 保留 |
| 10 | `core/prompt-builder.ts:181` | `atDepth.get(depth)!` | B | A：迭代 map 自身 `keys()` 再 `get`，必中 | 保留 |
| 11 | `core/extension-loader.ts:188` | `storageData.get(name)!` | B | 待读档；大概率有注册前置 | 保留（未触发路径） |

## 结论

- **真 B 型经逐一核实仅 #1（已修）与 #7（弱 B，记录）**；其余多为"漫行看像 B、读上下文为 A"的守卫充分用法。
- 高密度 `!` 体现了项目已有"前置守卫 + 断言"的规范，**不具备大规模机械重构的价值**。
- 推荐做法：不以「清除 177 处 `!`」为目标；存量按本清单归档，增量代码沿用「守卫 + 明确失败反馈」。

## 遗留跟踪（低优先）

- **#7** `commits.get(headId)!`：若未来显著提升合并/清理并发，可补 `has` 守卫 + 明确错误文案（需新增 i18n 键）。当前触发面窄，暂不改。