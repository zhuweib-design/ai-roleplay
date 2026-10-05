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
| D-7 | P2 | 待修 | 单聊归档可感知（按钮文案翻转 + 列表标记 + toast） |
| D-8 | P2 | **已修复** | 展开分块按钮 @click.stop |
| D-5 | P2 | 待修 | 群聊打开先落底；扩页只认上滚方向 |
| D-6 | P2 | 待修 | 单聊顶部占位按窗口边界重算，屏蔽程序补偿滚动 |
| O-9 | P3 | 待修 | TTS 未启用时给出与翻译一致的提示 |
| O-19 | P3 | 待修 | 故事引擎未选目标时禁用"执行导入" |
| O-20 | P3 | 待修 | 优化开关 toast 的 key→label 映射 |
| O-22 | P3 | 待修 | 世界书删除确认插值名称与条目数 |
| O-24 | P3 | 待修 | 数据银行搜索无结果空态 |

（每项完成后在下方小节填充改动与验证；不修改任何上述范围外的行为。）

---

## D-3（P1）版本快照丢 personality / scenario

状态：**已修复**

**根因**：`src/stores/character-version.ts` 的 `commitCurrentCharacter()` 手写投影卡字面量，`personality: ''` / `scenario: ''` / `firstMessage: ''` 直接丢字段（`character-version-control.ts` 的 `commit()` 收到的就是残缺卡）。

**改动**：投影改经 `uiCharToCard(character)` 完整映射（该函数已正确透传 personality / scenario / characterNote / ext 等，见 type-adapters.ts"候选3"注释）；`createdAt` 保持 `character.lastActive` 锚点避免每次提交产生伪差异，`updatedAt` 仍为提交时刻。

**验证**：`tests/stores/character-version.test.ts` 新增 D-3 回归用例（提交后快照含 personality/scenario → 二次修改后 `diffWithHead` 字段级 diff 报出 `personality` 差异 → `rollbackTo(v1)` 后两字段恢复原值），39/39 通过。

---

## 其余各项

### D-9（P2）随机事件模板/场景/结果完全不持久化

状态：**已修复**

**改动**：
1. `src/stores/random-events.ts`：挂接存储适配器快照通道（key `random-events:store:v1`，MIG-01 版本信封 v1）——`setStorageAdapter` / `loadFromStorage` / `persistNow`；八个 mutator（createTemplate/updateTemplate/deleteTemplate/toggleTemplate/updateSceneConfig/deleteSceneConfig/updateGeneratorConfig/recordResult）全部落盘；
2. `App.vue`：适配器扇出注入 + 启动时 `loadFromStorage()`；
3. 备份纳入（跟随 events 先例）：`BackupData.randomEvents`（可选字段 + 校验）、`exportAll` extra 透传、`ImportResult.randomEvents` 回传、`SettingsDataPanel` 导出携带 / 导入回写（`applyBackupData` 对不可信外部载荷逐字段运行时校验）。

**验证**：新增 `tests/stores/random-events-persistence.test.ts`（3 项）——快照往返跨实例找回、生成器/场景配置落盘、备份载荷往返 + 不可信载荷防御；tsc 0。

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
