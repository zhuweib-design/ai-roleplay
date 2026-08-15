# P2-11 长对话虚拟化分批计划（含剩余工程收尾计划）

**日期**：2026-08-15
**来源**：pre-launch 全检报告 P2-11（行动清单 #7）+ 剩余 P2-6 / P2-9
**状态**：📋 计划已制定（待确认后分批实施）

---

## 0. 现状调研（已执行）

**ChatMain.vue 已有 P1-9「窗口化渲染」机制**（非完整虚拟化）：

| 机制 | 现状 |
|---|---|
| 尾部窗口 | `RENDER_WINDOW=100`，`visibleMessages` 只渲染尾部 `renderLimit` 条 |
| 上滚加载 | `scrollTop < 300` 自动 `renderLimit += 100`，带滚动位置补偿（`prevScrollTop + added`） |
| 防重入 | `loadingOlder` 标志，防止滚动事件高频触发 |
| 切换角色 | `watch(char.id)` 重置窗口为 100 |

**局限（P2-11 要解决的真实问题）**：
1. **单向上窗口、DOM 只增不减**：上滚 N 次后 DOM = 100 + N×100，无下窗口回收 → 长对话仍会 DOM 线性膨胀（只是延迟）
2. **快速滚动连续触发加载**：连续上滚会多次 `renderLimit += 100`，中间态可能卡顿
3. **无"跳转到历史消息"能力**：窗口化后无法定位任意消息
4. **滚动补偿单次有效**：批量加载时视口可能跳动

**目标**：双向虚拟化——DOM 恒定 ~2×RENDER_WINDOW，1 万+消息滚动流畅（60fps）。

---

## 1. P2-11 分批计划（6 个 Phase）

### Phase 1：基线压测与量化（✅ 已完成 2026-08-15）
- [x] 1.1 构造 1k / 5k / 10k 消息测试角色（`scripts/p11-baseline.mjs`：Playwright + msedge 无头 + IndexedDB seed）
- [x] 1.2 实测：初始 DOM / 上滚 20 次后 DOM / 滚动帧率 / 内存
- [x] 1.3 基线数据（供 Phase 5 对比）

**基线实测结果（当前窗口化渲染）**：

| 指标 | 1000 条 | 5000 条 | 10000 条 |
|---|---|---|---|
| 初始 DOM（尾部窗口 100 生效）| 100 气泡 / 1953 节点 | 同左 | 同左 |
| 上滚 20 次后 | 1000 气泡 / 19502 节点（全量）| **2100 气泡 / 40953 节点** | **2100 气泡 / 40953 节点** |
| 滚动帧率 | 57fps | 51fps | 52fps |
| 内存 used/total | 45 / 102 MB | 78 / 132 MB | 92 / 139 MB |

**结论（验证计划假设）**：
1. 初始窗口化有效（只渲染尾部 100 条）
2. **DOM 只增不减**：上滚 20 次后 renderLimit=2100 → 4 万+ 节点，帧率降至 ~51fps
3. 内存随消息总量线性增长（10000 条 used 92MB）
4. **优化目标量化**：双向虚拟化后 DOM 恒定 ≤200 气泡、帧率稳定 60fps、内存不随上滚增长

**副产品修复**：`loadFromStorage` 原本经 `cardToUiChar` 丢弃 messages（`loadChatHistory` 是未接线死代码）→ 刷新后会话历史丢失；已最小修复（保留 messages），符合产品预期，也是压测前置。

### Phase 2：方案选型与设计（✅ 已完成 2026-08-15）

#### 2.1 候选方案对比（基于 ChatMain 现状 + MessageBubble 纯文本结构）

| 方案 | 新依赖 | 适配成本 | 效果 | 主要风险 |
|---|---|---|---|---|
| **A** vue-virtual-scroller | +~30KB | 中高：重构渲染结构（VirtualScroller 包裹 + item 插槽），消息高度可变需 dynamic 测量模式，背景图/overlay 兼容 | 完整 | 依赖维护；动态测量反而更复杂；DOM 结构大改影响样式/事件 |
| **B** 自研双向窗口 | 无 | 高：可见区间 `[start,end]` + 顶/底占位 + 双向滚动锚定 + 高度估算缓存 | 完整 | 自研复杂度集中在锚定与高度估算 |
| **C** 窗口 + 回收 | 无 | 低：顶部占位 + DOM 上限回收（renderLimit 增长时同步回收已滚过区）| 解决核心（DOM 恒定）| 需要顶部占位高度 |

#### 2.2 选型结论：**B/C 结合，不引入新依赖**（vue-virtual-scroller 淘汰）

- **理由**：MessageBubble 纯文本为主（`msg-text` + 少量 narration/toolbar，**无媒体**），高度可估算（行数 × 行高 + padding）→ 自研无高度测量器也能稳定；现有 `prevScrollTop` 锚定 + `loadingOlder` 防重入可直接复用扩展；引入第三方反而重构 DOM 结构与背景 overlay。
- **落地路径**：
  - **Phase 3a（C 快赢）**：保留尾部窗口机制，加**顶部 spacer**（占位已回收消息）+ **DOM 上限回收**（上滚加载时同步回收底部已滚过区，DOM 恒 ≤ 2×RENDER_WINDOW）
  - **Phase 3b（B 完整）**：升级为双向可见区间 `[windowStart, windowEnd]`（精确渲染视口附近，含下滚恢复）

#### 2.3 技术设计要点

1. **可见区间状态机**（Phase 3b）
   - 状态：`windowStart` / `windowEnd`（消息索引），DOM 渲染 `[windowStart, windowEnd]`，恒 ≤ 2×RENDER_WINDOW
   - 初始：尾部窗口 `windowStart = max(0, len-100)`，`windowEnd = len`
   - 上滚近顶（scrollTop < 300）→ `windowStart -= 100`（加载更早，同步回收底部）
   - 下滚近底（scrollTop > scrollHeight - clientHeight - 300）且 `windowEnd < len` → `windowEnd += 100`（恢复下部，同步回收顶部）
2. **占位高度策略**（顶/底 spacer）
   - `estHeight(msg) = padding + ceil(content.length / charsPerLine) × lineHeight`（按容器宽度估算行数）
   - 已渲染消息缓存真实高度（回收时记录），未渲染用估算值
   - 误差校正：滚动到顶/底时以 scrollHeight 对齐校正（防累积漂移）
3. **滚动锚定**（复用现有逻辑）
   - 上滚加载/回收后：`prevScrollTop/prevScrollHeight` + nextTick 补偿（现有代码双向化）
   - 顶部 spacer 高度变化 = 新增消息估算高度和 → 同步补偿 scrollTop
4. **滚动方向感知**：`handleScroll` 记录 `lastScrollTop` 判断方向（上滚加载 / 下滚恢复），保留 `loadingOlder` 防重入（扩展为双向 `windowLoading`）
5. **兼容性**：
   - 保留 `hasOlderMessages` / `loadOlderMessages`（按钮 + 滚动触发双入口）
   - spacer 在 `.chat-messages-content` 内（背景 overlay 继续生效）
   - 切换角色重置窗口；流式追加时若视口在底部则 `windowEnd` 跟随
6. **消息跳转**（Phase 4 再评估）：重定位 `[windowStart, windowEnd]` + 锚定到目标索引

#### 2.4 风险与缓解
| 风险 | 缓解 |
|---|---|
| 高度估算误差 → 滚动跳动 | 缓存已渲染高度 + 顶/底校正 |
| 滚动事件高频 | 双向防重入（`windowLoading`） |
| 与流式输出 / 自动滚底 / IME 交互回归 | Phase 4 专项回归 |
| 背景图 overlay 在 spacer 区表现 | spacer 透明（仅占位），overlay 覆盖容器层 |

**验收**：方案已评审通过（自研 B/C，无新依赖，MessageBubble 高度可估算为可行性依据）。

### Phase 3：核心实现（复杂度：高）
- [ ] 3.1 可见区间状态机：`[startIndex, endIndex]` 双向滑动，DOM 恒 ≤ 2×RENDER_WINDOW
- [ ] 3.2 顶部/底部占位（spacer）高度：缓存已渲染消息高度，未渲染用平均高估算
- [ ] 3.3 滚动锚定补偿：加载/回收时保持视口稳定（复用现有 `prevScrollTop` 逻辑并双向化）
- [ ] 3.4 滚动方向感知：上滚加载 + 下滚回收联动
- [ ] 3.5 切换角色 / 新消息流式追加 / 自动滚底时窗口重置与定位
- **验收**：1 万消息反复滚动，DOM 恒 ~200 节点

### Phase 4：边界与体验（复杂度：中）
- [ ] 4.1 快速滚动防抖（现有 `loadingOlder` 防重入扩展为双向）
- [ ] 4.2 消息跳转：搜索/锚点定位到任意历史消息
- [ ] 4.3 键盘可达性：虚拟化后 focus 顺序、`aria` 语义不破坏
- [ ] 4.4 图片/长文本消息高度估算误差 → 滚动跳动修复（占位校正）
- [ ] 4.5 与流式输出 / IME 输入框 / 自动滚底交互回归
- **验收**：快速滚动无卡顿、无滚动跳动、axe 无障碍检查通过

### Phase 5：验证与压测（复杂度：低）
- [ ] 5.1 1 万+消息滚动 60fps 目标压测（Performance 面板实测）
- [ ] 5.2 回归：全量 2574 测试 + vue-tsc + lint + i18n:strict + build
- [ ] 5.3 e2e 补跑（chat-flow 相关规格）
- **验收**：与 Phase 1 基线对比——DOM 恒定、帧率达标

### Phase 6：收尾（复杂度：低）
- [ ] 6.1 pre-launch 报告回填 P2-11 → 已修复（附基线/优化后数字）
- [ ] 6.2 git 提交 + 项目记忆更新
- **验收**：报告闭环、门禁全绿

---

## 2. 剩余工程收尾计划（P2-6 / P2-9 / 其他）

### P2-6 人工视觉冒烟（需 GUI / 发布机，非本无头环境可执行）
- [ ] 6.1 五主题视觉冒烟：dark / light / midnight / oled / theatre 切换，重点核验 **P1-1 颜色令牌修复的 6 个视图**（ImageGeneratorView / LocalModelView / SettingsModelPanel / RandomEventsView / StoryEngineView / SettingsView）
- [ ] 6.2 最小窗口 900×600 布局检查（三栏收敛、导航可用）
- [ ] 6.3 破坏性操作确认弹窗视觉验证（P2-8 新增的删单图/清空画廊 Modal）
- [ ] 6.4 长对话滚动体验（依赖 P2-11 Phase 5 完成后）
- **验收**：无视觉错乱、无对比度问题；发现问题记录并修复或登记
- **依赖**：P2-11 完成（6.4）；发布机或人工 GUI 环境

### P2-9 CSP / remote 白名单收紧（需产品决策）
- [ ] 9.1 盘点白名单诉求：模型端点（OpenAI 兼容 / Anthropic / 本地 / 自定义）、社区市场、图片生成 API
- [ ] 9.2 **产品决策**：是否保留"任意自定义端点"定位 → 不保留则收敛为预设端点列表
- [ ] 9.3 若收敛：`tauri.conf.json` CSP `connect-src` 白名单化 + `capabilities` `remote` 白名单化 + Web 模式 CORS 配套
- [ ] 9.4 回归：现有 API Profile 兼容性、e2e
- **验收**：白名单配置文档化；决策记录
- **阻塞项**：需产品确认（开放 vs 白名单）——建议作为发布后决策，当前"较宽但必需"可接受

### 其他登记项（非本轮，按需排期）
- P2-11 Phase 4 之后的增强：消息跳转/全文搜索
- P2-7 遗留：设置内"重新查看新手引导"入口
- e2e 工程债：chat-flow 规格硬编码 5173 端口 → 改为相对路径/环境变量（发布机 CI 正常但本地多项目冲突）

---

## 3. 依赖与建议执行顺序

```
P2-11: Phase 1 → 2 → 3 → 4 → 5 → 6（连续实施, 建议 2-4 个会话）
P2-6:  P2-11 完成后, 由发布机/人工执行（或本环境 GUI 可用时）
P2-9:  随时可启动调研(9.1), 决策后实施(9.3-9.4)
```

> 本计划由 SeniorDeveloper 依据现状代码（ChatMain.vue P1-9 窗口化机制）制定，关键数字以 Phase 1 实测为准。
