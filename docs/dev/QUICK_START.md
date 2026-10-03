# 🚀 性能优化快速开始指南

**阅读时间**: 5 分钟  
**适用于**: 想要立即开始优化的开发者

---

## 📍 当前状态（基准数据已建立）

```
✅ 基准数据: docs/dev/perf-baseline.json
✅ 性能报告: docs/dev/perf-report.md
✅ 分析工具: scripts/perf-analysis.mjs

当前指标（2026-10-03 于 `b0adc0f` 复测；原记录为 2026-09-28 基线）:
├─ 构建大小: 56 MB（含 vendored ort wasm 26.8 MB，非首屏传输量）
├─ 源码行数: 94,383 行（src/ 下 .ts + .vue）
├─ Store 数量: 21 个 (最大 1434 行, chat-generation)
└─ 超大文件: 7 个 (>2000 行)；排除 i18n 语言包数据后为 5 个代码文件
```

---

## 🎯 Quick Wins（今天就能做）

### 1️⃣ 并行初始化 Store（30 分钟，立即见效）

**当前问题**: App.vue 串行加载 8 个 store，耗时 950ms+

**解决方案**:

```typescript
// src/App.vue - 找到 onMounted 函数（约 153 行）
// 将现有的串行代码：
await settings.loadFromStorage();
await characterStore.loadFromStorage();
await lorebookStore.loadFromStorage();
await groupChatStore.loadFromStorage();
await dataBankStore.loadFromStorage();
await storyStore.loadFromStorage();

// 改为并行：
await Promise.all([
  settings.loadFromStorage(),
  characterStore.loadFromStorage(),
  lorebookStore.loadFromStorage(),
  groupChatStore.loadFromStorage(),
  dataBankStore.loadFromStorage(),
  storyStore.loadFromStorage(),
]);
```

**验证**:
```bash
npm run dev
# 打开浏览器 DevTools > Performance
# 录制启动过程，对比 loadFromStorage 时间
```

**预期收益**: ⚡ 启动时间减少 **600ms** (63%)

---

### 2️⃣ 优化计算属性（15 分钟）

**当前问题**: `resolveCharacterProfile()` 重复调用 3 次

**解决方案**:

```typescript
// src/App.vue - 找到 resolveCharacterProfile 函数（约 285 行）
// 删除函数定义，改为 computed：

const activeProfile = computed(() => {
  if (!(settings.isUnlocked || !settings.hasMasterPassword)) return null;
  const c = characterStore.currentCharacter;
  const pid = c?.profileId;
  if (pid) {
    return settings.apiProfiles.find(p => p.id === pid) ?? null;
  }
  return settings.activeProfile;
});

// 简化 watch（约 295 行）：
watch(activeProfile, (profile) => {
  if (profile) {
    chatStore.setApiProfile(profile);
  }
});

// 删除原有的 watch(() => characterStore.currentCharacterId, ...)
```

**预期收益**: ⚡ 切角色响应时间减少 **30%**

---

## 🔥 本周关键任务（2-3 天）

### 3️⃣ 拆分 chat.ts（核心重构）

**当前问题**: chat.ts 单文件 2517 行，包含 35+ 异步函数

**执行步骤**:

#### Step 1: 创建核心状态 store（1 小时）

```bash
# 创建新文件
touch src/stores/chat-core.ts
```

```typescript
// src/stores/chat-core.ts - 复制以下内容
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { ApiProfile } from '@/types';

export const useChatCoreStore = defineStore('chat-core', () => {
  const isGenerating = ref(false);
  const streamingContent = ref('');
  const lastError = ref<any>(null);
  const tokenUsage = ref({ prompt: 0, completion: 0 });
  const cacheUsage = ref({ hitTokens: 0, missTokens: 0 });
  
  const totalTokenUsage = computed(() => 
    tokenUsage.value.prompt + tokenUsage.value.completion
  );
  
  function resetError() {
    lastError.value = null;
  }
  
  function clearTokenUsage() {
    tokenUsage.value = { prompt: 0, completion: 0 };
    cacheUsage.value = { hitTokens: 0, missTokens: 0 };
  }

  return {
    isGenerating,
    streamingContent,
    lastError,
    tokenUsage,
    cacheUsage,
    totalTokenUsage,
    resetError,
    clearTokenUsage,
  };
});
```

#### Step 2: 创建会话管理 store（1 小时）

```bash
touch src/stores/chat-sessions.ts
```

```typescript
// src/stores/chat-sessions.ts
import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { Chat } from '@/storage/types';

export const useChatSessionsStore = defineStore('chat-sessions', () => {
  const activeChatId = ref<string | null>(null);
  const sessions = ref<Chat[]>([]);

  // 从 chat.ts 迁移会话相关函数：
  // - loadAllSessions
  // - openSession
  // - togglePin
  // - deleteSession
  
  return {
    activeChatId,
    sessions,
    // ... 导出函数
  };
});
```

#### Step 3: 逐步迁移并测试

```bash
# 每迁移一个模块，立即测试
npm run test
npm run dev
# 手动测试对应功能
```

**详细参考**: [docs/dev/OPTIMIZATION_DEMO.md § 2](./OPTIMIZATION_DEMO.md#2-chat-store-拆分示例)

---

## 📊 追踪优化效果

### 执行优化后运行分析

```bash
# 1. 构建项目
npm run build

# 2. 运行性能分析
npm run perf:analyze

# 3. 查看对比报告
cat docs/dev/perf-report.md
```

**报告示例**:
```markdown
| 指标 | 当前值 | 基准值 | 变化 |
|------|--------|--------|------|
| 总大小 | 48.2 MB | 55.9 MB | 📉 -7.7 MB (-13.8%) |
| Store 平均行数 | 520 | 749 | 📉 -229 (-30.6%) |
```

---

## 🧪 验证清单

### 优化 1 & 2（今天完成）

```bash
✅ 测试清单
├─ [ ] npm run dev 启动正常
├─ [ ] 所有 store 数据正确加载
├─ [ ] 切换角色功能正常
├─ [ ] API Profile 正确应用
└─ [ ] 无控制台错误

✅ 性能验证
└─ [ ] Chrome DevTools > Performance 录制
    启动时间应从 ~3s 降至 ~2.5s
```

### 优化 3（本周完成）

```bash
✅ 测试清单
├─ [ ] npm run test（所有单元测试通过）
├─ [ ] npm run test:e2e（E2E 测试通过）
├─ [ ] 发送消息功能正常
├─ [ ] 会话切换功能正常
├─ [ ] 历史记录加载正常
└─ [ ] 无回归问题

✅ 代码检查
├─ [ ] npm run lint（无新增警告）
├─ [ ] npm run typecheck（类型检查通过）
└─ [ ] 代码审查（团队 review）
```

---

## 📚 完整文档索引

| 文档 | 用途 | 何时查阅 |
|------|------|----------|
| [CODE_REVIEW_2026-09-28.md](./CODE_REVIEW_2026-09-28.md) | 完整审查报告 | 了解所有问题与建议 |
| [OPTIMIZATION_DEMO.md](./OPTIMIZATION_DEMO.md) | 可复制代码示例 | 实施具体优化时 |
| [REVIEW_SUMMARY.md](./REVIEW_SUMMARY.md) | 执行总结 | 了解整体规划 |
| [perf-report.md](./perf-report.md) | 性能基准报告 | 追踪优化效果 |
| 本文档 | 快速开始指南 | 立即开始优化 |

---

## 🆘 遇到问题？

### 常见问题

**Q: 并行初始化后某些数据丢失？**  
A: 检查是否有 store 间依赖关系。如果 A 依赖 B，应将 B 放在第一批并行，A 放在第二批。

**Q: 拆分 store 后导入报错？**  
A: 确保更新了所有导入路径。建议保留原 `chat.ts` 作为转发入口，保持向后兼容。

**Q: 性能没有明显提升？**  
A: 
1. 确认使用生产构建 (`npm run build`)
2. 检查网络缓存是否影响测试
3. 使用 Chrome DevTools Performance 精确测量

### 获取帮助

1. 查阅详细文档（上方索引）
2. 搜索项目 Issue
3. 提交新 Issue 并附上：
   - 优化步骤
   - 错误信息
   - 性能报告对比

---

## 🎯 今日目标

```
下班前完成：
├─ ✅ 并行初始化（30 分钟）
├─ ✅ 优化计算属性（15 分钟）
├─ ✅ 运行性能测试
└─ ✅ 对比基准数据

预期成果：
└─ 启动时间从 3.2s 降至 2.5s（-22%）
```

---

## 📅 本周目标

```
Day 1-2: Quick Wins（优化 1 & 2）
Day 3-5: 拆分 chat.ts（优化 3）

周末验证：
├─ 完整测试套件通过
├─ 性能报告显示改善
└─ 无已知回归问题
```

---

**最后更新**: 2026-09-28  
**下次同步**: 执行优化后，运行 `npm run perf:analyze` 更新报告

开始优化吧！ 🚀
