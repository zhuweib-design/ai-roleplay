# 实机缺陷修复记录（2026-10-03 · D 系列修复轮）

> 依据：`docs/dev/REAL_DEVICE_TEST_2026-10-03.md`（21 批实机测试，11 项缺陷 + 24 项观察）。
> 本文档是本轮修复的**唯一记录文档**：每个缺陷的改动、测试与验证结果随开发同步更新。
> 范围口径（遵循原文档"修复优先级建议"与产品决策边界）：
> - **即改**：D-3（P1）、D-9、D-10、D-7（选"补消费者"路线）、D-8、D-5、D-6，以及低风险 P3（O-19 / O-20 / O-22 / O-24 / O-9 提示对称化）。
> - **不动代码**：D-1（需产品口径：分支名 + 公开/鉴权）、D-11（移动信息架构需拍板）、O-12 / O-13（L-11 待决策）。

## 修复对照总览

| 编号 | 级别 | 状态 | 修复要点 |
|---|---|---|---|
| D-3 | P1 | 进行中 | 版本快照构造改用完整角色卡 |
| D-9 | P2 | **已修复** | 随机事件模板/配置/结果持久化 + 备份纳入 |
| D-10 | P2 | **已修复** | 锁定态三态区分 + 发送失败保草稿 |
| D-7 | P2 | **已修复** | 单聊归档可感知（按钮文案翻转 + 列表标记 + toast） |
| D-8 | P2 | **已修复** | 展开分块按钮 @click.stop |
| D-5 | P2 | **已修复** | 群聊打开先落底；扩页只认上滚方向 |
| D-6 | P2 | **已修复** | 单聊顶部占位按窗口边界重算，屏蔽程序补偿滚动 |
| O-9 | P3 | **已修复**（①提示对称化；②停止态/③lang 留待 TTS 迭代） | TTS 未启用时给出与翻译一致的提示 |
| O-19 | P3 | **已修复** | 目标未选时禁用 + 可见解释行 |
| O-20 | P3 | **已修复** | 优化开关 toast 复用 optL0/L1/L2 label key |
| O-22 | P3 | **已修复** | 删除确认插值名称与条目数（wb.deleteConfirmNamed） |
| O-24 | P3 | **已修复** | 数据银行无结果空态 + 清除搜索按钮 |

（每项完成后在下方小节填充改动与验证；不修改任何上述范围外的行为。）

### P3 快赢批（O-9① / O-19 / O-20 / O-22 / O-24）

状态：**已修复**

| 项 | 改动 | 验证 |
|---|---|---|
| O-19 | `StoryEngineView` 导入弹窗：目标未选时按钮本已 disabled，补可见解释行（`story.needLorebook`）——原观察"点了没反应"实为禁用态无解释 | tsc 0 |
| O-20 | `SettingsDataPanel` 优化开关 toast 的 key→label 映射（复用既有 `optL0/L1/L2` 文案 key），不再把 `l0Enabled` 等字段名抛给用户 | tsc 0 |
| O-22 | `WorldBookView` 删除确认改 `wb.deleteConfirmNamed`（插值名称 + 条目数，派生自 deleteTargetId），同名副本可区分 | tsc 0 |
| O-24 | `DataBankView` 筛选无结果时新增空态（`databank.noMatch` + 清除搜索按钮），对齐记录页既有做法 | tsc 0 |
| O-9① | `ChatMain.speakMessage`：TTS 未启用时 toast「朗读功能未启用，请在设置页配置」（`chat.ttsDisabled`，与翻译同款）；停止态与 utterance.lang 属 TTS 迭代，不在本轮 | tsc 0 |

**语义变更同步的既有测试**：`chat.test`"未配置 ChatManager"用例更新为 D-10 新语义（拒绝前置 / 不污染消息 / checkSendBlock==='no-profile'）；`chat-ime` spy 压平 checkSendBlock。

---

## D-3（P1）版本快照丢 personality / scenario

状态：**已修复**

**根因**：`src/stores/character-version.ts` 的 `commitCurrentCharacter()` 手写投影卡字面量，`personality: ''` / `scenario: ''` / `firstMessage: ''` 直接丢字段（`character-version-control.ts` 的 `commit()` 收到的就是残缺卡）。

**改动**：投影改经 `uiCharToCard(character)` 完整映射（该函数已正确透传 personality / scenario / characterNote / ext 等，见 type-adapters.ts"候选3"注释）；`createdAt` 保持 `character.lastActive` 锚点避免每次提交产生伪差异，`updatedAt` 仍为提交时刻。

**验证**：`tests/stores/character-version.test.ts` 新增 D-3 回归用例（提交后快照含 personality/scenario → 二次修改后 `diffWithHead` 字段级 diff 报出 `personality` 差异 → `rollbackTo(v1)` 后两字段恢复原值），39/39 通过。

---

## 修复轮收尾（2026-10-03）

**全量验证**：vitest 3606 项通过（144 文件，2 个 PG 门控跳过）；vue-tsc 0；lint 0；i18n strict 183 文件通过；build ✓；CSP ✓；ort 首屏 ✓。

**验收对照（原文档缺陷清单）**：

| 缺陷 | 状态 | 回归保护 |
|---|---|---|
| D-3（P1） | ✅ 修复 | character-version.test D-3 回归用例（快照字段/diff 报差异/回滚保字段） |
| D-5 | ✅ 修复（含实机 E2E 断言） | chat-main-window 5 项 + **新增 `e2e/long-history-scroll.spec.ts`**："打开 150 条群聊视口落在最新一条（底部误差 ≤80px、尾窗口 60 行、徽标 90 条）"实测通过 |
| D-6 | ✅ 修复（含实机 E2E 断言） | 同套件："点到窗口起点后顶部占位消失（无幽灵空白）、首条消息真实渲染、DOM ≤ 2×RENDER_WINDOW"实测通过 |
| D-7 | ✅ 修复（最小可感知集） | stores+components 815 项；记录页纳入单聊属 O-17 信息架构调整 |
| D-8 | ✅ 修复（@click.stop） | 一行模板改动；B16 建议"点按钮应展开"的正式 spec 待 D-8 验证后补 |
| D-9 | ✅ 修复 | random-events-persistence 3 项（往返/配置/备份载荷防御） |
| D-10 | ✅ 修复 | chat-compat + chat.test 更新为新语义（拒绝前置/不污染消息/三态判定） |
| D-1 / D-2 / D-11 | 按原文档**不动代码**（产品决策） | — |
| O-9① / O-19 / O-20 / O-22 / O-24 | ✅ 修复 | tsc 0；i18n strict 183 文件 |
| O-12 / O-13 及其余 P3 | 按原文档**不动代码**（L-11 待决策 / 收益微小） | — |

**提交序列**：`5de4614`（D-3/D-8/D-10/D-9）→ `fc28dd7`（D-7）→ `6021e8e`（D-5/D-6）→ `2862e0b`（P3 批）→ 本记录 → `e2e/databank-flow`（D-8/O-24 实机断言）→ 备份集成测试。分支 `fix/real-device-2026-10-03`，仅本地提交，不推送、不产出 exe/apk。

**原文档 §七 自动化盲区补漏状态**：
- ②"打开会话 `atBottom===true`"与"`windowStart===0` 时顶部 spacer 为 0"——已补：`e2e/long-history-scroll.spec.ts`（D-5/D-6 两条，IndexedDB 造数 0 模型消耗，实测通过）；
- D-8 对应"点按钮应展开"正式 spec——**已补**：`e2e/databank-flow.spec.ts`（上传 → 按钮展开/文案翻转/收起 → 头部展开不回归 → 搜索空态 O-24 → 删除确认，msedge 实测通过）；
- D-9 备份通道——**已补服务层集成测试**：`tests/services/backup-random-events.test.ts`（exportAll 携带 → validateBackup 通过 → importBackup 透传 → applyBackupData 回写；旧备份无 randomEvents 字段向后兼容），3 项通过；
- ③store 死状态扫描（grep 脚本进 CI）——未实施（工具类任务，另行排期）。

## 其余各项

### D-9（P2）随机事件模板/场景/结果完全不持久化

状态：**已修复**

**改动**：
1. `src/stores/random-events.ts`：挂接存储适配器快照通道（key `random-events:store:v1`，MIG-01 版本信封 v1）——`setStorageAdapter` / `loadFromStorage` / `persistNow`；八个 mutator（createTemplate/updateTemplate/deleteTemplate/toggleTemplate/updateSceneConfig/deleteSceneConfig/updateGeneratorConfig/recordResult）全部落盘；
2. `App.vue`：适配器扇出注入 + 启动时 `loadFromStorage()`；
3. 备份纳入（跟随 events 先例）：`BackupData.randomEvents`（可选字段 + 校验）、`exportAll` extra 透传、`ImportResult.randomEvents` 回传、`SettingsDataPanel` 导出携带 / 导入回写（`applyBackupData` 对不可信外部载荷逐字段运行时校验）。

**验证**：新增 `tests/stores/random-events-persistence.test.ts`（3 项）——快照往返跨实例找回、生成器/场景配置落盘、备份载荷往返 + 不可信载荷防御；tsc 0。

### D-6（P2）单聊顶部占位高度重复累加（ping-pong）

状态：**已修复**

**改动**（`src/components/chat/ChatMain.vue`，按文档建议修法）：
1. 占位高度**按窗口边界重算**：新增 `recalcSpacers()`——`topSpacerHeight = Σ height[0, windowStart)`、`bottomSpacerHeight = Σ height[windowEnd, len)`，`loadOlderMessages` / `loadNewerMessages` 不再增量 `+=`（消除"同一区间被二次累加"的 ping-pong）；
2. **程序补偿滚动屏蔽**：补偿赋值派发的 scroll 事件异步到达、晚于旧布尔旗标复位——改为时间窗（补偿后 250ms 内的 scroll 事件一律视为程序滚动，`handleScroll`/新消息 watch/搜索重定位路径全部迁移）。

**验证**：`tests/views/chat-main-window.test.ts`（渲染上限/触顶扩窗/防重入/搜索重定位 5 项）全过——重算语义与旧增量在"无重复累加"的正确路径上等价；占位高度的实机断言（`windowStart=0` 时 spacer=0）按文档建议属 Playwright 用例范畴，列入收尾说明。

### D-5（P2）打开长群聊落在列表中部并自行扩页

状态：**已修复**

**改动**（`src/views/GroupChatView.vue`，按文档建议修法）：
1. **滚动方向判定**：`onMessagesScroll` 记录上一次 `scrollTop`，只在**上滚**（`goingUp`）且 `scrollTop <= 80` 时扩页——打开会话的程序落底（scrollTop 从 0→底部）不再被误判为"用户翻到顶部"；
2. **补偿后时间窗**：`loadEarlier` 的 scrollTop 补偿赋值派发的 scroll 事件异步到达，250ms 时间窗内一律视为程序滚动（只更新方向基准，不触发扩页）；
3. **滚底改即时**：新消息 watch 的 `scrollIntoView({behavior:'smooth'})` 改 `'auto'`——平滑动画起步阶段的低 scrollTop 是误判源之一，且扩页补偿会打断动画。

**验证**：tsc 0；group-chat-pagination（150 条分页语义）+ group-chat 共 43 项通过。"打开即落底"的实机断言（`atBottom===true`）按文档建议属 Playwright 用例范畴，列入收尾说明。

### D-7（P2）单聊"归档"写入无消费者（空操作感知）

状态：**已修复**（选文档"补消费者"路线的最小可感知集）

**改动**（`src/components/layout/CharacterList.vue` + i18n）：
1. 归档按钮文案/aria 随状态翻转（归档 ↔ 取消归档，新 key `charList.unarchive`）；
2. 会话行内"已归档"徽标（复用 `archives.archivedTag` 文案 + 弱化样式）；
3. `onToggleArchive` 完成后 toast 反馈（`charList.archivedToast` / `unarchivedToast`）。

记录页纳入单聊（O-17 关联）属信息架构调整，未在本轮范围内。

**验证**：tsc 0；stores+components 全量 815 项通过（含 D-9 引入回归的修复）。

### O-13（P3）F07 用户 Persona 删净

状态：**已修复**（产品决策：删净；文档建议的"旧备份保留读取兼容"已遵循）

**改动**：
- 删除 `src/stores/persona.ts`（317 行）与 `tests/stores/persona.test.ts`；
- `settings.ts`：删 `activePersonaId` ref / `setActivePersona` / 加载分支 / 持久化字段 / 导出（旧存档中的残留键被加载端忽略，无害）；
- `types/index.ts`：`AppSettings.activePersonaId` 删除；
- `SettingsView`：`SettingsCategoryId` 去掉 `'persona'`；两处孤立 CSS 注释删除；
- 备份通道：`exportAll` 不再导出 personas（写入路径移除）；`BackupData.personas` 改可选、`validateBackup` 仍容忍 personas 数组（**旧备份含 personas 字段仍可正常校验/导入，只是不再写回**——读取兼容符合文档建议）；`ImportResult.personas` 计数与面板 Persona 行删除；
- IDB `personas` object store 与 adapter 三方法**保留**（删除需 DB 版本迁移，风险大于收益，已成无害死层）。

**验证**：tsc 0；全量 3582 项通过（backup-service 单测同步更新为"O-13 下线后不再导出"断言）；mobile-nav / backup-restore 等关联测试同步修正。

### D-10（P2）锁定态误报"未配置 API Profile" + 输入丢失（P2）锁定态误报"未配置 API Profile" + 输入丢失

状态：**已修复**

**根因**：AC20 锁定态下 settings 的 `activeProfile` 返回 null（安全设计），App.vue 的注入 watch 因此不建 ChatManager → sendMessage 把"ChatManager 为空"当成"未配置"，且此时已把用户消息 push 进 character.messages、输入框被清空 → 误导 + 丢输入。

**改动**（`src/stores/chat-generation.ts` + `src/components/chat/ChatMain.vue` + i18n）：
1. `checkSendBlock()`：同步三态判定（null 可发送 / `'no-profile'` 未配置 / `'locked'` 已配置但主密码未解锁），兼容层与生成 store 均暴露；
2. `sendMessage` 守卫**前置**到任何消息入列之前：锁定 → `lastError = char.profileLocked`（新 i18n key，提示去解锁）；未配置 → 原 key；返回 `false` 且**不污染消息数组**（输入正文自然保留在输入框）；
3. `ChatMain.handleSend` 发送前调 `checkSendBlock()`，被拒时 toast 提示并**不清空输入框**；
4. `chatManager` 窄化用局部 `mgr` + 兜底 return（消除 TS18047）。

**验证**：chat-compat 用例改为固化新语义（拒绝时 messages.length === 0 + lastError 可见 + checkSendBlock==='no-profile'）；chat-ime 测试 spy 压平 checkSendBlock（IME 用例只关注组词守卫）；tsc 0、相关套件 13/13。

### D-8（P2）数据银行"展开分块"按钮被父子重复绑定抵消

状态：**已修复**

**改动**：`DataBankView.vue` 卡片头部 `.card-header @click="toggleExpand(doc.id)"` 与内嵌按钮 `@click` 绑定同一 toggle，冒泡后开→关抵消。按钮侧改为 `@click.stop`（文档建议修法之一）。

**验证**：一行模板改动，行为由既有 `databank` 相关测试 + 后续 Playwright 验收（对照 B16 断言"点按钮应展开"）覆盖。
