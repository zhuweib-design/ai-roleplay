# 第三轮高风险拆分优化设计方案

> **状态**：设计阶段（待评审）  
> **关联文档**：`OPTIMIZATION_ROUNDS_2026-10-01.md`、`ORT_ISOLATION_DESIGN.md`  
> **执行原则**：继承第二轮成功经验——分阶段实施、每步可验证、设置闸门、完整回归测试

---

## 一、背景与现状评估

### 1.1 当前问题

根据项目现状分析：

| 文件 | 当前行数 | 问题描述 | 影响范围 |
|---|---|---|---|
| `src/stores/chat.ts` | **2587 行** | 60+ 导出被全仓 9 个文件引用；混合 5 大职责（会话管理/消息生成/Runtime 集成/群聊接线/本地记忆）；是首屏 entry chunk 核心 | 高 |
| `src/views/SettingsView.vue` | **4130 行** | 205+ 函数/常量定义；混合 10+ 子功能（主题/API/模型/向量/备份/主密码/自定义主题/优化配置）；单文件维护困难 | 高 |
| `src/views/StoryEngineView.vue` | 3355 行 | 小说分析引擎 UI，功能复杂但相对独立 | 中 |
| `src/views/WorldBookView.vue` | 2822 行 | 世界书编辑器，功能完整但耦合度低 | 中 |
| `src/views/GroupChatView.vue` | 2556 行 | 群聊视图，已完成游标分页（第一轮#3），当前可维护 | 低 |

### 1.2 优先级判定（基于第二轮经验）

**立即执行**：
- **优化项 7**：chat.ts 拆分（风险最高，但收益最大，且是后续优化的基础）
- **优化项 8**：SettingsView.vue 拆分（风险可控，拆分模式清晰）

**延后排期**：
- StoryEngineView / WorldBookView / GroupChatView：功能相对独立，维护压力不大，排入后续批次

**需产品决策**：
- **优化项 9**：IndexedDB 复合索引（需先做查询画像分析）
- **STORY 系列规格对齐**：计划与实现不一致，需先决策再动工

---

## 二、优化项 7：chat.ts 拆分方案

### 2.1 根因分析

**核心问题**：chat.ts 承载 5 大职责，职责边界不清，导致：
1. 单文件 2587 行，导出 60+ 符号，引用方难以理清依赖
2. Runtime 集成代码（RT-02/04/06）与会话管理、消息生成混在一起
3. 首屏 chunk 体积大，影响加载性能
4. 修改风险高，任何改动都可能影响多个调用方

**依赖分析**（已核实）：
- 被 9 个文件引用：GroupChatView / SettingsModelPanel / ContextPanel / App / CharactersView / ChatMain / RuntimeStatePanel / CharacterList / SettingsView
- 核心导出分类：
  - **会话管理**：`sessions` / `activeChatId` / `newSession` / `togglePin` / `toggleArchive` / `deleteSession` / `renameSession`
  - **消息生成**：`isGenerating` / `streamingContent` / `sendMessage` / `regenerateLastMessage` / `stopGeneration` / `clearLastError`
  - **Runtime 集成**：`ensureRuntimeIntegration` / `ensureGroupRuntimeIntegration` / `syncRemoteGroupMember` / `syncRemoteGroupStatus` / `inspectRuntimeState` / `reviewRuntimeMemory` / `verifyRuntimeReplay` / `commitRuntimeGroupTurn` 等 10+ 函数
  - **统计与状态**：`tokenUsage` / `totalTokenUsage` / `cacheUsage` / `prefixCacheHitRate` / `ttftStats` / `summaryStatus` / `runtimeStatus`
  - **本地记忆**：`loadLocalMemoryStore` / `recordLocalConversationMemory`

### 2.2 拆分方案：5 个专职 store

按职责边界拆分为 5 个 store，保持向后兼容：

#### **方案 A：激进拆分（推荐）**

**文件路径规划**（修正评审问题 #1）：

```
src/stores/
├── chat.ts                    # 兼容入口（300 行）
│   └── 组合 5 个子 store，保持既有 API 不变
│
├── chat-session.ts            # 会话管理（600 行）
│   ├── sessions / activeChatId
│   ├── newSession / togglePin / toggleArchive / deleteSession / renameSession
│   └── chatVariables（对话局部变量）
│
├── chat-generation.ts         # 消息生成引擎（800 行）
│   ├── isGenerating / streamingContent / lastError
│   ├── sendMessage / stop / regenerateMessage
│   ├── tokenUsage / totalTokenUsage / cacheUsage
│   ├── prefixCacheHitRate / prefixStability / ttftStats
│   └── summaryStatus
│
├── chat-runtime.ts            # Runtime 集成（单聊）（500 行）
│   ├── ensureRuntimeIntegration
│   ├── inspectRuntimeState / reviewRuntimeMemory / verifyRuntimeReplay
│   ├── runtimeStatus / activePresetInfo
│   └── 内部：getRuntimeApi / createRuntimeCharactersBatch
│
├── chat-group-runtime.ts      # Runtime 集成（群聊）（600 行）
│   ├── ensureGroupRuntimeIntegration / prepareRemoteGroupRuntime
│   ├── syncRemoteGroupMember / syncRemoteGroupStatus / runtimeCharacterIdFor
│   ├── commitRuntimeGroupTurn / retryRemoteGroupOutbox / recoverRemoteGroupOutbox
│   ├── fetchRemoteGroupTurns / retryPendingGroupRuntimeTurn
│   ├── pendingGroupRuntimeTurns / groupRuntimeConflict / clearGroupRuntimeConflict
│   ├── loadRuntimePendingGroupTurns / discardPendingGroupRuntimeTurns
│   └── 内部：getGroupRuntimeApi / enqueuePendingGroupRuntimeTurn
│
└── chat-memory.ts             # 本地记忆存储（L0）（200 行）
    ├── loadLocalMemoryStore
    ├── buildLocalMemoryContext
    ├── recordLocalConversationMemory
    └── 内部：l0Store / l0l2Deps / persistLocalMemoryStore
```

**兼容层设计**（修正评审问题 #2）：使用 `storeToRefs` 保持响应式

```typescript
// src/stores/chat.ts（兼容入口，保留原路径）
import { storeToRefs } from 'pinia';
import { useChatSessionStore } from './chat-session';
import { useChatGenerationStore } from './chat-generation';
import { useChatRuntimeStore } from './chat-runtime';
import { useChatGroupRuntimeStore } from './chat-group-runtime';
import { useChatMemoryStore } from './chat-memory';

export const useChatStore = defineStore('chat', () => {
  const sessionStore = useChatSessionStore();
  const generationStore = useChatGenerationStore();
  const runtimeStore = useChatRuntimeStore();
  const groupRuntimeStore = useChatGroupRuntimeStore();
  const memoryStore = useChatMemoryStore();

  // 使用 storeToRefs 保持状态响应式（修正评审问题 #2）
  const {
    sessions,
    activeChatId,
    chatVariables,
  } = storeToRefs(sessionStore);

  const {
    isGenerating,
    streamingContent,
    lastError,
    tokenUsage,
    totalTokenUsage,
    cacheUsage,
    prefixCacheHitRate,
    prefixStability,
    prefixStableRate,
    ttftStats,
    summaryStatus,
  } = storeToRefs(generationStore);

  const {
    runtimeStatus,
    activePresetInfo,
  } = storeToRefs(runtimeStore);

  const {
    pendingGroupRuntimeTurns,
    groupRuntimeConflict,
  } = storeToRefs(groupRuntimeStore);

  // 跨 store 协调函数
  function setStorageAdapter(adapter: StorageAdapter | null) {
    sessionStore.setStorageAdapter(adapter);
    generationStore.setStorageAdapter(adapter);
    memoryStore.setStorageAdapter(adapter);
    groupRuntimeStore.setStorageAdapter(adapter);
  }

  function setApiProfile(
    profile: ApiProfile | null,
    options?: Partial<Pick<ChatManagerConfig, 'userName' | 'systemPrompt' | 'maxContextTokens' | 'reservedTokens'>>,
  ) {
    generationStore.setApiProfile(profile, options);
  }

  return {
    // 状态（响应式引用）
    isGenerating,
    streamingContent,
    lastError,
    runtimeStatus,
    activeChatId,
    sessions,
    chatVariables,
    tokenUsage,
    totalTokenUsage,
    cacheUsage,
    prefixCacheHitRate,
    prefixStability,
    prefixStableRate,
    ttftStats,
    summaryStatus,
    activePresetInfo,
    pendingGroupRuntimeTurns,
    groupRuntimeConflict,
    
    // 操作函数（直接委托）
    setStorageAdapter,
    loadLocalMemoryStore: memoryStore.loadLocalMemoryStore,
    setApiProfile,
    
    // 会话管理
    newSession: sessionStore.newSession,
    togglePin: sessionStore.togglePin,
    toggleArchive: sessionStore.toggleArchive,
    deleteSession: sessionStore.deleteSession,
    renameSession: sessionStore.renameSession,
    loadAllSessions: sessionStore.loadAllSessions,
    openSession: sessionStore.openSession,
    
    // 消息操作
    sendMessage: generationStore.sendMessage,
    stop: generationStore.stop,
    copyMessage: generationStore.copyMessage,
    deleteMessage: generationStore.deleteMessage,
    editMessage: generationStore.editMessage,
    regenerateMessage: generationStore.regenerateMessage,
    persistAfterEdit: generationStore.persistAfterEdit,
    loadChatHistory: generationStore.loadChatHistory,
    clearLastError: generationStore.clearLastError,
    
    // Runtime 集成（单聊）
    ensureRuntimeIntegration: runtimeStore.ensureRuntimeIntegration,
    inspectRuntimeState: runtimeStore.inspectRuntimeState,
    reviewRuntimeMemory: runtimeStore.reviewRuntimeMemory,
    verifyRuntimeReplay: runtimeStore.verifyRuntimeReplay,
    createRuntimeCharactersBatch: runtimeStore.createRuntimeCharactersBatch,
    
    // Runtime 集成（群聊）
    ensureGroupRuntimeIntegration: groupRuntimeStore.ensureGroupRuntimeIntegration,
    syncRemoteGroupMember: groupRuntimeStore.syncRemoteGroupMember,
    syncRemoteGroupStatus: groupRuntimeStore.syncRemoteGroupStatus,
    runtimeCharacterIdFor: groupRuntimeStore.runtimeCharacterIdFor,
    commitRuntimeGroupTurn: groupRuntimeStore.commitRuntimeGroupTurn,
    retryRemoteGroupOutbox: groupRuntimeStore.retryRemoteGroupOutbox,
    recoverRemoteGroupOutbox: groupRuntimeStore.recoverRemoteGroupOutbox,
    fetchRemoteGroupTurns: groupRuntimeStore.fetchRemoteGroupTurns,
    retryPendingGroupRuntimeTurn: groupRuntimeStore.retryPendingGroupRuntimeTurn,
    clearGroupRuntimeConflict: groupRuntimeStore.clearGroupRuntimeConflict,
    loadRuntimePendingGroupTurns: groupRuntimeStore.loadRuntimePendingGroupTurns,
    discardPendingGroupRuntimeTurns: groupRuntimeStore.discardPendingGroupRuntimeTurns,
  };
});
```

**优点**：
- ✅ 职责清晰，单个 store 行数可控（200–800 行）
- ✅ 向后兼容，调用方无需修改（`useChatStore()` 仍然可用）
- ✅ 测试友好，每个 store 可独立测试
- ✅ 响应式安全，使用 `storeToRefs` 保持状态同步

**缺点与应对**：
- ⚠️ 需处理跨 store 状态依赖 → 通过组合模式在子 store 内部直接调用其他 store
- ⚠️ 初期存在双层间接调用 → 性能影响可忽略（Pinia 内部已优化）
- ⚠️ 新代码直接引用子 store 需注意依赖初始化 → 见下文"跨 store 依赖处理"

#### **方案 B：保守拆分（备选）**

仅拆分 Runtime 部分（占 1200+ 行），会话管理与消息生成保持在原文件：

```
src/stores/
├── chat.ts                    # 会话 + 消息生成（1400 行）
├── chat-runtime.ts            # Runtime 集成（单聊）（500 行）
└── chat-group-runtime.ts      # Runtime 集成（群聊）（600 行）
```

**优点**：风险更低，改动范围小  
**缺点**：chat.ts 仍有 1400 行，未彻底解决可维护性问题

### 2.3 决策：采用方案 A（激进拆分）

**理由**：
1. 第二轮 ORT 隔离证明了「分阶段 + 闸门」可控制高风险改动
2. 当前 2587 行已严重影响维护，保守方案治标不治本
3. 兼容层确保调用方无需同步修改，可渐进迁移
4. 完整回归测试（142 个既有测试文件）可发现破坏性变更

### 2.4 实施步骤（分 7 步，每步可验证）

| 步骤 | 内容 | 验收标准 | 预估工作量 |
|---|---|---|---|
| **S1** | 新建 5 个子 store 文件框架，定义接口但暂不实现 | TypeScript 编译通过，接口定义完整 | 2h |
| **S2** | 拆分 `chat-memory.ts`（最独立，零跨 store 依赖） | 单测通过，独立可用 | 3h |
| **S3** | 拆分 `chat-session.ts`（会话管理，仅依赖 storage） | 单测通过，会话 CRUD / 多会话切换功能正常 | 4h |
| **S4** | 拆分 `chat-runtime.ts`（单聊 Runtime） | 单测通过，`ensureRuntimeIntegration` / `inspectRuntimeState` 等功能正常 | 5h |
| **S5** | 拆分 `chat-group-runtime.ts`（群聊 Runtime） | 单测通过，群聊投递队列 / 冲突处理功能正常 | 5h |
| **S6** | 拆分 `chat-generation.ts`（消息生成，依赖前 4 个 store） | 单测通过，消息发送 / 流式输出 / Token 统计功能正常 | 6h |
| **S7** | 重构 `chat.ts` 为兼容层 + 全量回归测试 + 证据包 | 全部 142 测试文件通过，typecheck 0 错误，构建成功 | 4h |

**关键说明**（修正评审问题 #1）：
- S1-S6：新建 5 个子 store 文件（`chat-session.ts` / `chat-generation.ts` / `chat-runtime.ts` / `chat-group-runtime.ts` / `chat-memory.ts`）
- S7：将原 `chat.ts` 的 2587 行实现全部迁移到子 store 后，把 `chat.ts` 改写为 300 行的兼容层
- 原 `chat.ts` 的路径保持不变，确保 `import { useChatStore } from '@/stores/chat'` 继续有效

**总计**：29 小时（约 4 个工作日）

### 2.5 关键技术细节

#### 跨 store 状态依赖处理（修正评审问题 #3）

**问题**：`sendMessage`（chat-generation.ts）需要：
- 访问 Runtime 状态（`chat-runtime.ts`）
- 记录本地记忆（`chat-memory.ts`）
- 读取当前会话（`chat-session.ts`）

**解决方案**：子 store 内部直接调用其他 store（组合模式）

```typescript
// chat-generation.ts
import { useChatRuntimeStore } from './chat-runtime';
import { useChatMemoryStore } from './chat-memory';
import { useChatSessionStore } from './chat-session';

export const useChatGenerationStore = defineStore('chat-generation', () => {
  // ... 状态定义

  async function sendMessage(character: UICharacter, message: string) {
    // 直接调用其他 store（Pinia 单例机制确保状态共享）
    const runtimeStore = useChatRuntimeStore();
    const memoryStore = useChatMemoryStore();
    const sessionStore = useChatSessionStore();

    // 使用其他 store 的功能
    const integration = await runtimeStore.ensureRuntimeIntegration({ character });
    // ... 消息生成逻辑
    await memoryStore.recordLocalConversationMemory(character, message, response);
  }

  return {
    sendMessage,
    // ...
  };
});
```

**关键设计决策**（修正评审问题 #3）：
- ✅ **允许直接引用子 store**：新代码可以 `import { useChatGenerationStore } from '@/stores/chat-generation'` 直接使用
- ✅ **无需依赖注入**：子 store 内部直接调用其他 store，Pinia 的单例机制确保状态共享
- ✅ **初始化自动完成**：每个 store 在首次调用时自动初始化，无需手动注入
- ⚠️ **循环依赖风险**：需确保 store 之间不形成循环依赖（通过分层设计避免：session/memory 是底层，generation 是上层，runtime 是中间层）

**兼容层的职责**：
- 仅负责聚合子 store 的导出，保持既有 API 不变
- 协调需要同时操作多个 store 的函数（如 `setStorageAdapter`）
- **不负责依赖注入**（子 store 自己解决依赖）

#### 状态持久化协调

**问题**：`setStorageAdapter` 需要同时注入到多个子 Store。

**解决方案**：在兼容层中协调多个子 Store；状态和操作的完整聚合沿用 §2.2 的显式映射，本节不再重复构造兼容入口。

```typescript
function setStorageAdapter(adapter: StorageAdapter | null) {
  sessionStore.setStorageAdapter(adapter);
  generationStore.setStorageAdapter(adapter);
  memoryStore.setStorageAdapter(adapter);
  groupRuntimeStore.setStorageAdapter(adapter);
}
```

---
### 2.6 风险与对策

| 风险 | 概率 | 影响 | 对策 |
|---|---|---|---|
| 跨 store 状态依赖遗漏导致运行时错误 | 中 | 高 | S7 全量回归测试（142 文件）+ e2e 测试覆盖关键路径 |
| TypeScript 类型推断失效 | 低 | 中 | 显式标注返回类型，避免循环依赖 |
| 调用方直接访问内部状态（绕过兼容层） | 低 | 低 | grep 核查，确保所有 `useChatStore` 调用走兼容入口 |
| 性能回退（多层间接调用） | 低 | 低 | S7 性能基线对比（首屏 ready 时间不应退化 >5%） |
| Pinia devtools 显示混乱 | 低 | 低 | 为子 store 使用清晰的命名（`chat-session` / `chat-generation` 等） |

### 2.7 回滚预案

**触发条件**：
- S7 全量回归测试失败率 >5%
- 性能回退 >10%
- 发现无法在本轮解决的架构性问题

**回滚方案**：
1. 单 commit 回退所有拆分改动（Git revert）
2. 保留 S1–S6 的新 store 文件但不使用，作为下次拆分的参考
3. 在本文档记录失败原因与教训

---

## 三、优化项 8：SettingsView.vue 拆分方案

### 3.1 根因分析

**核心问题**：SettingsView.vue 混合 10+ 子功能，4130 行单文件维护困难：

**功能清单**（已核实）：
1. **主题切换**（dark / light / midnight / oled / theatre / custom）：150 行
2. **自定义主题编辑器**（图片提取 + 色彩审计）：300 行
3. **字号档位**（12 / 14 / 16 / 18 px）：80 行
4. **语言切换**（zh / en）：50 行
5. **聊天背景与气泡样式**：100 行
6. **API Profile 管理**（增删改查 + 切换）：400 行
7. **主密码管理**（设置 / 修改 / 解锁）：200 行
8. **模型配置面板**（SettingsModelPanel 组件）：已独立
9. **向量模型面板**（VectorModelPanel 组件）：已独立
10. **备份与导入**（exportAll / importBackup + 冲突策略）：350 行
11. **优化配置**（loadOptimizationConfig / saveOptimizationConfig）：150 行
12. **存储持久化管理**（requestPersistentStorage / refreshStoragePersistence）：120 行

### 3.2 拆分方案：10 个子组件 + Toast 服务

按功能边界拆分为 10 个子组件，主文件作为布局容器：

```
src/components/settings/
├── SettingsThemePanel.vue         # 主题切换 + 自定义主题（450 行）
├── SettingsAppearancePanel.vue    # 字号 + 语言 + 背景 + 气泡（300 行）
├── SettingsApiPanel.vue           # API Profile 管理（400 行）
├── SettingsMasterPasswordPanel.vue # 主密码管理（200 行）
├── SettingsModelPanel.vue         # 模型配置（已存在）
├── VectorModelPanel.vue           # 向量模型（已存在）
├── SettingsBackupPanel.vue        # 备份与导入（350 行）
├── SettingsOptimizationPanel.vue  # 优化配置（150 行）
├── SettingsStoragePanel.vue       # 存储持久化（120 行）
└── SettingsAboutPanel.vue         # 关于面板（100 行）
```

**Toast 通知服务**（单条显示，按先进先出顺序排队，避免重叠且不丢通知）：

```typescript
// src/utils/toast-service.ts
import { computed, ref } from 'vue';

// 与现有 Toast.vue 的类型一致；warning 需先扩展组件类型与样式后再纳入
export type ToastType = 'info' | 'success' | 'error';

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

const toastQueue = ref<ToastItem[]>([]);
let toastIdCounter = 0;

export function showToast(type: ToastType, message: string) {
  toastQueue.value.push({ id: toastIdCounter++, type, message });
}

export function useActiveToast() {
  return computed(() => toastQueue.value[0] ?? null);
}

export function dismissToast() {
  toastQueue.value.shift();
}
```

**全局 Toast 组件挂载**（复用现有组件的关闭行为和默认时长）：

全局只渲染队列首项，并让 Toast 实例保持挂载：队列从空变为有消息时，`modelValue` 从 `false` 变为 `true`，触发现有 Toast 组件的自动计时；切换到下一条时，消息变化会重置计时。关闭或自动消失后移除首项，再显示下一条。

```vue
<!-- 在 src/App.vue 既有根模板中的 router-view 附近添加 -->
<Toast
  :model-value="activeToast !== null"
  :type="activeToast?.type ?? 'info'"
  :message="activeToast?.message ?? ''"
  @update:model-value="dismissToast"
/>

<script setup lang="ts">
import { useActiveToast, dismissToast } from '@/utils/toast-service';
import Toast from '@/components/common/Toast.vue';

const activeToast = useActiveToast();
</script>
```
**主文件重构**（约 600 行，修正评审问题 #4 和 #6）：

```vue
<!-- src/views/SettingsView.vue -->
<script setup lang="ts">
import { ref } from 'vue';
import SettingsThemePanel from '@/components/settings/SettingsThemePanel.vue';
import SettingsAppearancePanel from '@/components/settings/SettingsAppearancePanel.vue';
import SettingsApiPanel from '@/components/settings/SettingsApiPanel.vue';
import SettingsMasterPasswordPanel from '@/components/settings/SettingsMasterPasswordPanel.vue';
import SettingsModelPanel from '@/components/settings/SettingsModelPanel.vue';
import VectorModelPanel from '@/components/settings/VectorModelPanel.vue';
import SettingsBackupPanel from '@/components/settings/SettingsBackupPanel.vue';
import SettingsOptimizationPanel from '@/components/settings/SettingsOptimizationPanel.vue';
import SettingsStoragePanel from '@/components/settings/SettingsStoragePanel.vue';
import SettingsAboutPanel from '@/components/settings/SettingsAboutPanel.vue';

// 仅保留布局状态与跨面板协调逻辑
const activeCategory = ref<string>('appearance');
</script>

<template>
  <div class="settings-view">
    <nav class="settings-nav">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        :class="['nav-tab', { active: activeCategory === tab.id }]"
        @click="activeCategory = tab.id"
      >
        {{ tab.label }}
      </button>
    </nav>
    
    <div class="settings-content">
      <!-- 修正评审问题 #4：补齐主题面板 -->
      <!-- 修正评审问题 #6：使用 v-show 保留草稿状态 -->
      <SettingsThemePanel v-show="activeCategory === 'theme'" />
      <SettingsAppearancePanel v-show="activeCategory === 'appearance'" />
      <SettingsApiPanel v-show="activeCategory === 'api'" />
      <SettingsModelPanel v-show="activeCategory === 'model'" />
      <VectorModelPanel v-show="activeCategory === 'vector'" />
      <SettingsMasterPasswordPanel v-show="activeCategory === 'security'" />
      <SettingsBackupPanel v-show="activeCategory === 'data'" />
      <SettingsOptimizationPanel v-show="activeCategory === 'extension'" />
      <SettingsStoragePanel v-show="activeCategory === 'storage'" />
      <SettingsAboutPanel v-show="activeCategory === 'about'" />
    </div>
  </div>
</template>
```

### 3.3 实施步骤（分 7 步，每步可验证）

| 步骤 | 内容 | 验收标准 | 预估工作量 |
|---|---|---|---|
| **S1** | 新增 Toast 服务 + 在 App.vue 挂载全局 Toast；迁移 SettingsModelPanel / VectorModelPanel 并移除其局部 Toast | 所有设置面板共用提示入口；连续通知按顺序显示、不重叠、不丢失 | 2h |
| **S2** | 拆分 SettingsThemePanel（主题 + 自定义主题） | 主题切换功能正常，自定义主题上传 + 审计正常 | 4h |
| **S3** | 拆分 SettingsAppearancePanel（字号 + 语言 + 背景 + 气泡） | 外观配置功能正常，持久化正常 | 3h |
| **S4** | 拆分 SettingsApiPanel（API Profile 管理） | Profile 增删改查 + 切换功能正常，表单校验正常 | 4h |
| **S5** | 拆分 SettingsMasterPasswordPanel（主密码） | 主密码设置 / 修改 / 解锁功能正常，加密存储正常 | 3h |
| **S6** | 拆分 SettingsBackupPanel / OptimizationPanel / StoragePanel / AboutPanel | 备份导入 / 优化配置 / 存储管理 / 关于功能正常 | 5h |
| **S7** | 重构主文件为布局容器（v-show 保留状态） + 全量回归测试 + 证据包 | typecheck 0 错误，构建成功，既有测试通过，切换标签页后草稿保留 | 3h |

**总计**：24 小时（约 3 个工作日；按步骤工作量合计）

**关键说明**（修正评审问题 #4, #6, #7）：
- S1：Toast 服务全局可用，所有子组件通过 `import { showToast } from '@/utils/toast-service'` 触发通知
- S2-S6：拆分 10 个子组件（含 SettingsAboutPanel）
- S7：主文件使用 `v-show`（非 `v-if`）切换面板，保留草稿状态（如自定义主题预览、自定义 CSS 草稿）

### 3.4 关键技术细节

#### 跨组件状态共享

**问题**：多个面板需要访问 `useSettingsStore`

**解决方案**：每个子组件内部独立调用 `useSettingsStore()`，利用 Pinia 单例机制自动共享状态

```vue
<!-- SettingsThemePanel.vue -->
<script setup lang="ts">
import { useSettingsStore } from '@/stores/settings';

const settings = useSettingsStore();

function selectTheme(themeName: ThemeName) {
  settings.setTheme(themeName);
  settings.persistSettings();
}
</script>
```

#### Toast 通知统一处理

所有拆分后的设置面板统一从 `@/utils/toast-service` 导入 `showToast`，由 §3.2 中挂载在 `App.vue` 的单条 Toast 提示统一显示。不要在设置子面板中另建 Toast 服务或重复挂载 Toast 组件。

---
### 3.5 风险与对策

| 风险 | 概率 | 影响 | 对策 |
|---|---|---|---|
| 子组件间状态同步失效 | 低 | 中 | 统一使用 `useSettingsStore`，避免 props 传递状态 |
| 样式丢失或错乱 | 中 | 低 | 保持 scoped 样式，复用既有 CSS tokens |
| Toast / Modal 等全局组件失效 | 低 | 中 | Toast 统一使用 `src/utils/toast-service.ts`，并只在 App.vue 挂载一个显示容器 |
| 无障碍属性遗漏 | 低 | 低 | 每个子组件继承原有 ARIA 标记，S7 人工审查 |

### 3.6 回滚预案

**触发条件**：
- S6 回归测试发现关键功能失效
- 用户反馈拆分后体验变差（如标签页切换卡顿）

**回滚方案**：
1. Git revert 所有拆分 commit
2. 保留已拆分的子组件代码，标记为「待优化」
3. 在本文档记录失败原因

---

## 四、优化项 9：IndexedDB 复合索引（待查询画像）

### 4.1 当前状态

- **MIG-01 迁移框架**：已在第一轮落地（`snapshot-migration.ts`），支持版本化升级
- **数据模型**：当前 IndexedDB schema 见 `src/storage/idb-adapter.ts`
- **查询模式**：未做系统性分析，不确定是否存在全表扫描

### 4.2 实施前置条件（闸门）

**必须先完成查询画像分析**，确认以下问题：
1. 哪些查询是高频的？（通过埋点或性能分析工具）
2. 哪些查询存在全表扫描？（通过 IndexedDB DevTools）
3. 添加复合索引的预期收益是多少？（基于实测数据）

**闸门判定**：
- ✅ 若查询画像显示存在明显瓶颈（如某查询耗时 >100ms 且频繁） → 启动索引优化
- ❌ 若查询画像显示性能良好 → 本轮不做，避免过度优化

### 4.3 实施方案（条件启动）

若闸门通过，按以下步骤执行：

| 步骤 | 内容 | 验收标准 | 预估工作量 |
|---|---|---|---|
| **S1** | 查询画像分析：埋点收集高频查询 + DevTools 分析全表扫描 | 产出查询画像报告，明确优化目标 | 4h |
| **S2** | 设计复合索引方案：选择索引字段 + 评估存储开销 | 索引设计文档，包含收益预估 | 3h |
| **S3** | 实现索引迁移：扩展 MIG-01 框架，添加 `onUpgrade` 钩子 | 索引创建成功，无数据丢失 | 4h |
| **S4** | 性能对比测试：before/after 查询耗时对比 | 目标查询耗时下降 >30% | 2h |
| **S5** | 回归测试 + 证据包 | 全量测试通过，构建成功 | 2h |

**总计**：15 小时（约 2 个工作日）

**当前决策**：本轮**不启动**，排入后续批次，等待查询画像分析结果。

---

## 五、STORY 系列规格对齐（需产品决策）

### 5.1 问题描述

**计划要求**（来自 PLAN_AUDIT）：
- STORY-01：作品 → 章节 → 场景三层级
- STORY-02：按作品打包导出
- STORY-03：故事分支管理
- STORY-04B：冒险面板
- STORY-05：存档点系统

**代码实现**（已核实）：
- `src/views/StoryEngineView.vue`（3355 行）：小说分析引擎 UI
- `src/stores/story.ts`：存储故事事件与状态
- 实际功能：分析用户输入的小说文本，提取角色 / 情节 / 主题
- **不存在**三层级结构、作品打包、分支管理、冒险面板

**冲突**：计划与代码实现不一致，存在两种可能：
1. **计划过时**：STORY 系列是早期设想，后改为小说分析引擎
2. **功能缺失**：计划是正确的，但代码未实现

### 5.2 需要的产品决策

**决策点 1**：STORY 系列的目标是什么？
- [ ] A. 按计划补齐三层级 / 打包 / 分支等功能（需 2–3 周开发）
- [ ] B. 计划追认现状，改为「小说分析引擎」（需更新文档）

**决策点 2**：若选 A，优先级如何？
- [ ] 高优先级：本轮（第三轮）实施
- [ ] 中优先级：排入第四轮
- [ ] 低优先级：暂缓，等待用户反馈

### 5.3 实施方案（待决策后细化）

若决策为 **A + 高优先级**，预估工作量：

| 功能 | 工作量 | 风险 |
|---|---|---|
| STORY-01：三层级结构 | 5 天 | 中（需重构数据模型） |
| STORY-02：按作品打包 | 2 天 | 低 |
| STORY-03：故事分支 | 4 天 | 高（复杂状态管理） |
| STORY-04B：冒险面板 | 3 天 | 中 |
| STORY-05：存档点 | 3 天 | 中 |

**总计**：17 天（约 3.5 周）

**当前决策**：**等待产品决策**，本轮不动工。

---

## 六、资源需求与时间计划

### 6.1 资源需求

| 角色 | 工作量 | 职责 |
|---|---|---|
| **开发者**（本轮执行者） | 53 小时（优化项 7：29 小时；优化项 8：24 小时） | 代码实现 + 单元测试 + 文档 |
| **测试**（可选） | 8 小时 | 手工回归测试（覆盖 e2e 场景） |
| **产品**（决策者） | 2 小时 | STORY 系列决策 + 复合索引优先级决策 |

### 6.2 时间计划（按优先级排序）

**Phase 1：立即执行（1 周）**
- Day 1-4：优化项 7（chat.ts 拆分）
- Day 5-7：优化项 8（SettingsView.vue 拆分）

**Phase 2：条件启动（等待决策）**
- 优化项 9：等待查询画像分析结果
- STORY 系列：等待产品决策

**Phase 3：后续批次（排期待定）**
- StoryEngineView / WorldBookView / GroupChatView 拆分
- 其他技术债清理

---

## 七、验收标准与证据包

### 7.1 全局验收标准（所有优化项通用）

| 类别 | 验收标准 | 验证方式 |
|---|---|---|
| **功能完整性** | 所有既有功能不回退 | 全量回归测试（142 文件）通过 |
| **类型安全** | 零 TypeScript 错误 | `vue-tsc --noEmit` 0 错误 |
| **代码质量** | 零 ESLint 错误 | `npm run lint` 通过 |
| **国际化** | 零 i18n 遗漏 | `npm run i18n:check:strict` 通过 |
| **构建成功** | 生产构建无错误 | `npm run build` 成功 |
| **性能基线** | 首屏 ready 时间不回退 >5% | `scripts/measure-startup.mjs` 对比 |
| **无障碍** | ARIA 标记不丢失 | 人工审查（S6/S7） |

### 7.2 优化项 7 专项验收（修正评审问题 #5）

| 验收项 | 标准 | 验证方式 |
|---|---|---|
| **拆分完整性** | 5 个子 store 全部创建，导出清单完整 | 代码审查 + TypeScript 编译 |
| **兼容性** | 所有调用方无需修改，`useChatStore()` 仍可用；**54 个导出符号**全部保留，函数名完全一致（`stop` / `regenerateMessage` 等） | grep 核查 `import.*useChatStore` + 回归测试 |
| **响应式安全** | 兼容层使用 `storeToRefs` 保持状态响应式 | 手工测试：修改子 store 状态后，兼容层状态同步更新 |
| **职责清晰** | 每个子 store 职责单一，代码行数 ≤800 | 代码审查 + wc -l 检查 |
| **测试覆盖** | 每个子 store 有独立单测文件 | 测试文件存在 + 覆盖率 >80% |

### 7.3 优化项 8 专项验收（修正评审问题 #4, #6, #7）

| 验收项 | 标准 | 验证方式 |
|---|---|---|
| **拆分完整性** | 10 个子组件全部创建，功能完整（含 SettingsThemePanel / SettingsAboutPanel） | 代码审查 + 手工测试 |
| **主文件简化** | SettingsView.vue 行数 ≤600 | wc -l 检查 |
| **样式一致性** | UI 外观与拆分前一致，无样式丢失 | 截图对比 |
| **草稿状态保留** | 使用 `v-show`（非 `v-if`）切换面板；切换标签页后返回，自定义主题预览等草稿内容仍在 | 手工测试：上传主题图片 → 切换到其他标签页 → 切换回主题标签页 → 预览仍在 |
| **Toast 服务可用** | Toast 服务在 App.vue 挂载；所有子组件共用 `showToast()`；队列逐条显示、不重叠、不丢失 | 手工测试连续触发、自动消失、手动关闭及下一条显示 |
| **无障碍保持** | 所有 ARIA 标记保留 | 人工审查 |

### 7.4 证据包清单

每个优化项完成后，产出证据包并归档到 `docs/dev/evidence/round-3/`：

```
docs/dev/evidence/round-3/
├── opt-7-chat-split/
│   ├── test-results.txt          # 全量测试结果
│   ├── typecheck.txt             # vue-tsc 输出
│   ├── lint.txt                  # eslint 输出
│   ├── build.txt                 # 构建日志
│   ├── perf-baseline.json        # 性能对比数据
│   └── coverage-report.html      # 测试覆盖率报告
│
└── opt-8-settings-split/
    ├── test-results.txt
    ├── typecheck.txt
    ├── before-after-screenshots/  # UI 对比截图
    │   ├── theme-panel-before.png
    │   ├── theme-panel-after.png
    │   └── ...
    └── accessibility-checklist.md # 无障碍审查清单
```

---

## 八、风险总览与应对策略

### 8.1 全局风险

| 风险 | 概率 | 影响 | 应对策略 |
|---|---|---|---|
| **回归测试失败率高** | 中 | 高 | 每步完成后立即跑测试，及早发现问题；失败率 >5% 触发回滚 |
| **跨 store/组件状态同步问题** | 中 | 高 | 依赖注入 + 组合模式；S7 全量测试覆盖跨边界场景 |
| **性能回退** | 低 | 中 | S7 性能基线对比；回退 >10% 触发回滚 |
| **时间超期** | 中 | 中 | 严格按步骤推进，每步设时间上限；超期 >20% 启动应急方案（缩减范围） |
| **产品决策延迟** | 高 | 低 | STORY 系列与复合索引排入后续批次，不阻塞本轮 |

### 8.2 应急预案

**触发条件**：
- 优化项 7 或 8 的 S7 全量测试失败率 >10%
- 性能回退 >15%
- 时间超期 >30%（超过 1.5 周）

**应急方案**：
1. **立即暂停**当前优化项的后续步骤
2. **回滚代码**到本轮开始前的状态（Git revert）
3. **保留产出**：已拆分的代码文件标记为「待优化」，不删除
4. **复盘分析**：在本文档记录失败原因、技术难点、教训
5. **调整策略**：改为保守方案（如优化项 7 改用方案 B）或延后排期

---

## 九、成功标准与交付物

### 9.1 成功标准

**本轮（第三轮）成功的判定标准**：

1. ✅ **优化项 7 完成**：chat.ts 拆分为 5 个子 store，兼容层正常工作，全量测试通过
2. ✅ **优化项 8 完成**：SettingsView.vue 拆分为 10 个子组件，主文件 ≤600 行，功能正常
3. ✅ **质量门禁全通过**：typecheck / lint / i18n / test / build 全部通过
4. ✅ **性能不回退**：首屏 ready 时间不回退 >5%
5. ✅ **文档完整**：本设计文档 + 实施记录 + 证据包齐全

**加分项**（非必须）：
- 优化项 9 查询画像分析完成
- STORY 系列产品决策完成

### 9.2 交付物清单

| 交付物 | 路径 | 说明 |
|---|---|---|
| **设计文档** | `docs/dev/ROUND_3_HIGH_RISK_SPLIT_DESIGN.md` | 本文档 |
| **实施记录** | `docs/dev/OPTIMIZATION_ROUNDS_2026-10-01.md` §三 | 随开发同步更新 |
| **拆分后的代码** | `src/stores/chat-*.ts` / `src/components/settings/Settings*Panel.vue` | 5 个子 store + 10 个子组件 |
| **测试文件** | `tests/stores/chat-*.test.ts` / `tests/components/settings/*.test.ts` | 每个子模块的单测 |
| **证据包** | `docs/dev/evidence/round-3/` | 测试结果 / 性能对比 / 截图 |
| **Git 提交** | 分支：`feat/round-3-high-risk-split` | 7 步 commit（优化项 7）+ 6 步 commit（优化项 8） |

---

## 十、评审检查清单

**本设计文档需经过评审后方可开发。评审人逐项检查：**

| # | 评审项 | 检查点 | 通过 |
|---|---|---|---|
| 1 | **问题定义** | 现状评估准确（行数 / 依赖关系核实） | ☐ |
| 2 | **方案完整性** | 拆分方案清晰，边界明确，无遗漏 | ☐ |
| 3 | **兼容性设计** | 兼容层设计合理，调用方无需同步修改 | ☐ |
| 4 | **步骤可验证** | 每步有明确验收标准，可独立验证 | ☐ |
| 5 | **风险评估** | 风险识别全面，应对策略可行 | ☐ |
| 6 | **回滚预案** | 回滚条件明确，回滚步骤清晰 | ☐ |
| 7 | **时间估算** | 工作量估算合理（参考第二轮经验） | ☐ |
| 8 | **测试策略** | 回归测试覆盖全面，性能基线对比方案明确 | ☐ |
| 9 | **依赖决策** | 需外部决策的项已明确标注，不阻塞本轮 | ☐ |
| 10 | **文档质量** | 结构清晰，技术细节充分，可直接指导开发 | ☐ |

**评审结论**：☐ 通过，进入开发  ☐ 修订后重审  ☐ 不通过

**评审意见**：（由评审人填写）

---

## 十一、参考资料

- [第二轮 ORT 隔离设计文档](ORT_ISOLATION_DESIGN.md)：成功的分阶段实施案例
- [第一轮优化实施记录](OPTIMIZATION_ROUNDS_2026-10-01.md)：回归测试与门禁标准
- [性能优化基线报告](PERF_OPTIMIZATION_2026-09-28.md)：性能测量方法
- [Pinia 组合式 Store 文档](https://pinia.vuejs.org/core-concepts/)：跨 store 依赖注入模式
- [Vue 3 组件拆分最佳实践](https://vuejs.org/guide/best-practices/production-deployment.html)

---

**文档版本**：v1.0  
**创建日期**：2026-10-02  
**作者**：第三轮执行者  
**状态**：待评审

---

## 附录 A：chat.ts 导出清单（完整，修正评审问题 #5）

**当前 chat.ts 的实际导出符号**（已逐项核对 `src/stores/chat.ts:2507-2587`）：

### 会话管理（10 个）
- `sessions`：会话列表
- `activeChatId`：当前激活会话 ID
- `chatVariables`：对话局部变量
- `newSession`：新建会话
- `togglePin`：置顶/取消置顶
- `toggleArchive`：归档/取消归档
- `deleteSession`：删除会话
- `renameSession`：重命名会话
- `loadAllSessions`：加载所有会话
- `openSession`：打开会话

### 消息生成（21 个）
- `isGenerating`：生成中状态
- `streamingContent`：流式内容
- `lastError`：最近错误
- `sendMessage`：发送消息
- `stop`：停止生成（**不是** `stopGeneration`）
- `regenerateMessage`：重新生成（**不是** `regenerateLastMessage`）
- `copyMessage`：复制消息
- `deleteMessage`：删除消息
- `editMessage`：编辑消息
- `persistAfterEdit`：编辑后持久化
- `loadChatHistory`：加载会话历史
- `clearLastError`：清空错误
- `tokenUsage`：Token 使用统计
- `totalTokenUsage`：累计 Token
- `cacheUsage`：缓存使用统计
- `prefixCacheHitRate`：前缀缓存命中率
- `prefixStability`：前缀稳定性
- `prefixStableRate`：前缀稳定率
- `ttftStats`：首 Token 时间统计
- `summaryStatus`：摘要状态
- `setApiProfile`：设置 API Profile

### Runtime 集成（单聊）（7 个）
- `ensureRuntimeIntegration`：确保 Runtime 集成
- `inspectRuntimeState`：检查 Runtime 状态
- `reviewRuntimeMemory`：审查 Runtime 记忆
- `verifyRuntimeReplay`：验证 Runtime 重放
- `createRuntimeCharactersBatch`：批量创建 Runtime 角色
- `runtimeStatus`：Runtime 状态
- `activePresetInfo`：当前 Preset 信息

### Runtime 集成（群聊）（14 个）
- `ensureGroupRuntimeIntegration`：确保群聊 Runtime 集成
- `syncRemoteGroupMember`：同步远程群成员
- `syncRemoteGroupStatus`：同步远程群状态
- `runtimeCharacterIdFor`：获取 Runtime 角色 ID
- `commitRuntimeGroupTurn`：提交群聊回合
- `retryRemoteGroupOutbox`：重试远程群发件箱
- `recoverRemoteGroupOutbox`：恢复远程群发件箱
- `fetchRemoteGroupTurns`：拉取远程群回合
- `retryPendingGroupRuntimeTurn`：重试待处理群回合
- `pendingGroupRuntimeTurns`：待处理群回合列表
- `groupRuntimeConflict`：群组 Runtime 冲突
- `clearGroupRuntimeConflict`：清空群组 Runtime 冲突
- `loadRuntimePendingGroupTurns`：加载待处理群回合
- `discardPendingGroupRuntimeTurns`：丢弃待处理群回合

### 本地记忆（1 个）
- `loadLocalMemoryStore`：加载本地记忆存储

### 依赖注入（1 个）
- `setStorageAdapter`：注入存储适配器

**总计**：54 个导出符号（比原文档估算的"60+"更准确）

**兼容层实现要点**（修正评审问题 #5）：
- 必须按实际函数名映射：`stop`（不是 `stopGeneration`）、`regenerateMessage`（不是 `regenerateLastMessage`）
- 必须包含所有 54 个导出符号，确保既有调用方 100% 兼容
- 使用 `storeToRefs` 保持状态响应式，使用函数委托保持操作可用

---

## 附录 B：SettingsView.vue 功能清单（完整）

**当前 SettingsView.vue 的功能区块**（已核对 `src/views/SettingsView.vue`）：

### 1. 主题相关（450 行）
- **基础主题切换**（150 行）：dark / light / midnight / oled / theatre / custom
- **自定义主题编辑器**（300 行）：
  - 图片上传 + 主色提取（`extractPaletteFromImage`）
  - 色彩审计（`auditThemeContrast`，WCAG AA/AAA 对比度检查）
  - Token 生成（`generateThemeTokens`）
  - 自定义主题预览 + 保存
  - **草稿状态**：`customThemePreview` / `customThemePalette` / `customThemeResult`（需用 `v-show` 保留）

### 2. 外观配置（230 行）
- **字号档位**（80 行）：12 / 14 / 16 / 18 px，实时预览
- **语言切换**（50 行）：zh / en
- **聊天背景**（50 行）：none / bubbles / gradient / image
- **气泡样式**（50 行）：modern / classic / minimal

### 3. API Profile 管理（400 行）
- Profile 列表展示（分组：激活 / 其他）
- 新建 Profile（Modal 表单 + 校验）
- 编辑 Profile（Modal 表单 + 校验）
- 删除 Profile（确认 Modal）
- 切换激活 Profile
- 表单校验：baseURL 格式 / apiKey 非空 / 模型名称合法

### 4. 主密码管理（200 行）
- 设置主密码（首次）
- 修改主密码（需输入旧密码）
- 解锁（输入主密码）
- 主密码强度提示
- 错误处理（密码错误 / 加密失败）

### 5. 模型配置（已独立）
- SettingsModelPanel 组件（已存在）
- 功能：模型选择 / 创作模式 / 思维链偏好

### 6. 向量模型配置（已独立）
- VectorModelPanel 组件（已存在）
- 功能：本地向量模型管理 / 远程 API Key

### 7. 备份与导入（350 行）
- **导出备份**（150 行）：
  - 全量导出（`exportAll`）
  - 进度提示
  - 下载 JSON 文件
- **导入备份**（200 行）：
  - 文件上传
  - 冲突策略选择（skip / overwrite / merge）
  - 导入结果 Modal（成功 / 失败 / 跳过统计）

### 8. 优化配置（150 行）
- 加载优化配置（`loadOptimizationConfig`）
- 保存优化配置（`saveOptimizationConfig`）
- 配置项：缓存策略 / 预加载 / 延迟加载

### 9. 存储持久化（120 行）
- 请求持久化存储（`requestPersistentStorage`）
- 刷新持久化状态（`refreshStoragePersistence`）
- 存储容量查询（`getStorageCapability`）
- 持久化状态展示

### 10. 关于面板（100 行）
- 版本信息
- 审计日志查看
- 审计日志清空

**标签页与组件映射**（修正评审问题 #4）：

| 标签页 ID | 组件 | 说明 |
|---|---|---|
| `theme` | SettingsThemePanel | 主题切换 + 自定义主题（新增） |
| `appearance` | SettingsAppearancePanel | 字号 + 语言 + 背景 + 气泡 |
| `api` | SettingsApiPanel | API Profile 管理 |
| `model` | SettingsModelPanel | 模型配置（已存在） |
| `vector` | VectorModelPanel | 向量模型（已存在） |
| `security` | SettingsMasterPasswordPanel | 主密码管理 |
| `data` | SettingsBackupPanel | 备份与导入 |
| `extension` | SettingsOptimizationPanel | 优化配置 |
| `storage` | SettingsStoragePanel | 存储持久化 |
| `about` | SettingsAboutPanel | 关于 + 审计日志 |

**总计**：10 个子组件（修正评审问题 #4）

**拆分注意事项**（修正评审问题 #6）：
- 主文件必须使用 `v-show`（不是 `v-if`）切换面板
- 保留草稿状态：自定义主题预览（`customThemePreview` / `customThemePalette` / `customThemeResult`）
- S7 验收时需手工测试：切换标签页后，返回原标签页，草稿内容仍在

---

**文档结束**
