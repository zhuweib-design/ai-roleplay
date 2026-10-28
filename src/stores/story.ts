
import { t } from '@/i18n';
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import {
  type AnalysisProgress,
  type StoryAnalysisResult,
  INITIAL_PROGRESS,
} from '@core/story-types';
import { createStoryPersistenceOps } from './story-persistence';
import { createStoryAnalysisOps } from './story-analysis';
import { createStoryImportOps } from './story-import';
import { createStoryProtagonistOps } from './story-protagonist';
import { createStoryTimeOps } from './story-time';

/**
 * Story Store (F16.1)
 *
 * 职责：
 * 1. 故事分析结果列表 CRUD（内存 + 持久化到 IndexedDB）
 * 2. 从文本文件创建故事分析任务（读取、分块、初始化 pending 状态）
 * 3. 调用 LLM 进行结构化分析（逐块分析 + 结果合并）
 * 4. 进度跟踪与取消支持（AbortController）
 * 5. 深度模式额外生成故事脚本
 *
 * 不负责：
 * - 导入到角色/世界书（F16.2 后续实现）
 * - 提示词注入（由 prompt-builder 集成）
 *
 * 分析流程：
 * 文件 → 读取文本 → chunkNovel 分块 → 创建 pending StoryAnalysisResult
 * → 逐块调用 LLM → parseChunkResult → 合并 mergeResults
 * → 深度模式额外调用 buildScriptGenerationMessages → 持久化
 */
export const useStoryStore = defineStore('story', () => {
  // ── 状态 ──
  const stories = ref<StoryAnalysisResult[]>([]);
  const currentStoryId = ref<string | null>(null);
  const searchQuery = ref('');
  /** 需求1：按状态筛选（'' 表示全部） */
  const filterStatus = ref<'pending' | 'analyzing' | 'completed' | 'failed' | ''>('');
  const lastError = ref<string | null>(null);
  const lastInfo = ref<string | null>(null);

  // 分析状态
  const isAnalyzing = ref(false);
  const progress = ref<AnalysisProgress>({ ...INITIAL_PROGRESS });

  // ── 计算属性 ──

  const currentStory = computed(
    () => stories.value.find((s) => s.id === currentStoryId.value) ?? null
  );

  const filteredStories = computed(() => {
    const q = searchQuery.value.trim().toLowerCase();
    const st = filterStatus.value;
    return stories.value.filter((s) => {
      const matchesSearch = !q
        || s.sourceFileName.toLowerCase().includes(q)
        || (s.worldInfo?.name ?? '').toLowerCase().includes(q);
      const matchesStatus = !st || s.status === st;
      return matchesSearch && matchesStatus;
    });
  });

  /** 需求1：按 status 统计数量（用于分类 Tab 徽标） */
  const statusCounts = computed(() => {
    const counts = { pending: 0, analyzing: 0, completed: 0, failed: 0 } as Record<
      'pending' | 'analyzing' | 'completed' | 'failed',
      number
    >;
    for (const s of stories.value) {
      if (s.status in counts) counts[s.status as keyof typeof counts]++;
    }
    return counts;
  });

  // ── 子模块装配（R4-5） ──

  const persistenceOps = createStoryPersistenceOps({ stories, currentStoryId, lastError });
  const {
    setStorageAdapter,
    loadFromStorage,
    ensureLoaded,
    persistStory,
    deleteFromStorage,
    libraryLoaded,
  } = persistenceOps;

  const { createStoryFromFile, analyzeStoryWithText, cancelAnalysis } = createStoryAnalysisOps({
    stories,
    currentStoryId,
    lastError,
    lastInfo,
    isAnalyzing,
    progress,
    persistStory,
  });

  const {
    importWorld,
    importScenes,
    importCharacters,
    importEvents,
    importAll,
    exportScripts,
  } = createStoryImportOps({ stories, lastError, lastInfo });

  const {
    setProtagonistFromCharacter,
    setProtagonistAsCustom,
    updateProtagonist,
    clearProtagonist,
    addProtagonistRelation,
    removeProtagonistRelation,
    setStartingScene,
    setProtagonistPersonaId,
  } = createStoryProtagonistOps({ stories, lastError, lastInfo, persistStory });

  const {
    setStoryWorldBookBinding,
    setStoryTimeConfig,
    toggleStoryTime,
    advanceStoryTime,
    recordTurnEndForStory,
    setStoryTime,
    resetStoryTime,
    getFormattedStoryTime,
    getStoryTimePrompt,
  } = createStoryTimeOps({ stories, lastError, lastInfo, persistStory });

  // ── 故事操作 ──

  function selectStory(id: string): void {
    currentStoryId.value = id;
  }

  function setSearchQuery(q: string): void {
    searchQuery.value = q;
  }

  /** 需求1：设置状态过滤（传 '' 清空筛选） */
  function setFilterStatus(status: 'pending' | 'analyzing' | 'completed' | 'failed' | ''): void {
    filterStatus.value = status;
  }

  /**
   * 删除故事
   */
  async function deleteStory(id: string): Promise<void> {
    const idx = stories.value.findIndex((s) => s.id === id);
    if (idx < 0) return;
    const removed = stories.value.splice(idx, 1)[0]!;
    await deleteFromStorage(id);
    if (currentStoryId.value === id) {
      currentStoryId.value = stories.value[0]?.id ?? null;
    }
    lastInfo.value = t('story.deleted2', { name: removed.sourceFileName });
  }

  function clearLastError(): void {
    lastError.value = null;
    lastInfo.value = null;
  }

  return {
    // 状态
    stories,
    currentStoryId,
    searchQuery,
    /** 需求1：当前状态过滤 */
    filterStatus,
    lastError,
    lastInfo,
    isAnalyzing,
    progress,
    // 计算属性
    currentStory,
    filteredStories,
    /** 需求1：状态分类计数 */
    statusCounts,
    // 依赖注入
    setStorageAdapter,
    /** 深链视图据此决定何时解析 URL 里的故事 id */
    libraryLoaded,
    // 持久化
    loadFromStorage,
    ensureLoaded,
    persistStory,
    deleteFromStorage,
    // 故事操作
    selectStory,
    setSearchQuery,
    /** 需求1：设置状态过滤 */
    setFilterStatus,
    createStoryFromFile,
    analyzeStoryWithText,
    cancelAnalysis,
    deleteStory,
    // F16.2 导入功能
    importWorld,
    importScenes,
    importCharacters,
    importEvents,
    importAll,
    exportScripts,
    // F16.3 主角身份配置
    setProtagonistFromCharacter,
    setProtagonistAsCustom,
    updateProtagonist,
    clearProtagonist,
    addProtagonistRelation,
    removeProtagonistRelation,
    setStartingScene,
    setProtagonistPersonaId,
    // 需求8：故事与世界书关联
    setStoryWorldBookBinding,
    // F16.4 故事时间推进
    setStoryTimeConfig,
    toggleStoryTime,
    advanceStoryTime,
    recordTurnEndForStory,
    setStoryTime,
    resetStoryTime,
    getFormattedStoryTime,
    getStoryTimePrompt,
    clearLastError,
  };
});
