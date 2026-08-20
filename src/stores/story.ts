import { t } from '@/i18n';
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { StorageAdapter } from '@/storage/storage-adapter';
import {
  type AnalysisDepth,
  type AnalysisProgress,
  type StoryAnalysisResult,
  type ChunkAnalysisResult,
  type StoryScript,
  type ProtagonistConfig,
  type ProtagonistRelation,
  type ProtagonistRole,
  INITIAL_PROGRESS,
  getDepthMeta,
  createEmptyResult,
} from '@core/story-types';
import type { StoryTemplateId } from '@core/story-templates';
import {
  createProtagonistFromCharacter,
  createNewProtagonist,
  validateProtagonist,
  patchProtagonist,
  addRelation as addRelationCore,
  removeRelation as removeRelationCore,
} from '@core/protagonist';
import {
  createDefaultTimeConfig,
  createDefaultTimeState,
  advanceTime as advanceTimeCore,
  recordTurnEnd,
  setStoryTimeValue as setStoryTimeValueCore,
  resetStoryTime as resetStoryTimeCore,
  validateTimeConfig,
  formatStoryTime,
  buildStoryTimePrompt,
  type StoryTimeConfig,
} from '@core/story-time';
import {
  chunkNovel,
  buildAnalysisMessages,
  buildPreviousContext,
  buildScriptGenerationMessages,
  parseChunkResult,
  parseScriptResult,
  mergeResults,
  createAnalysisResult,
} from '@core/story-analyzer';
import { createApiClient } from '../api';
import { useSettingsStore } from './settings';
import { useCharacterStore } from './character';
import { useLorebookStore } from './lorebook';
import { useEventsStore } from './events';
import {
  importWorld as importWorldCore,
  importScenes as importScenesCore,
  importCharacters as importCharactersCore,
  importEvents as importEventsCore,
  importAll as importAllCore,
  downloadScripts,
  type ImportTargets,
  type CharacterImportPort,
  type LorebookImportPort,
  type EventsImportPort,
} from '@core/story-importer';
import type {
  ImportConflictStrategy,
  ImportResult,
} from '@core/story-types';

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

  // 取消控制器（运行时，不持久化）
  let abortController: AbortController | null = null;

  // 注入的存储适配器
  let storageAdapter: StorageAdapter | null = null;

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

  // ── 依赖注入 ──

  function setStorageAdapter(adapter: StorageAdapter | null): void {
    storageAdapter = adapter;
  }

  // ── 持久化 ──

  async function loadFromStorage(): Promise<void> {
    if (!storageAdapter) return;
    try {
      const list = await storageAdapter.loadStories();
      stories.value = list;
      if (list.length > 0 && !currentStoryId.value) {
        currentStoryId.value = list[0]!.id;
      }
    } catch (err) {
      lastError.value = t('store.loadFailed', { name: t('store.entityStory'), error: err instanceof Error ? err.message : String(err) });
    }
  }

  async function persistStory(id: string): Promise<void> {
    if (!storageAdapter) return;
    const story = stories.value.find((s) => s.id === id);
    if (!story) return;
    try {
      await storageAdapter.saveStory(story);
    } catch (err) {
      lastError.value = t('store.saveFailed', { name: t('store.entityStory'), error: err instanceof Error ? err.message : String(err) });
    }
  }

  async function deleteFromStorage(id: string): Promise<void> {
    if (!storageAdapter) return;
    try {
      await storageAdapter.deleteStory(id);
    } catch (err) {
      lastError.value = t('store.deleteFailed', { name: t('store.entityStory'), error: err instanceof Error ? err.message : String(err) });
    }
  }

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
   * 从文件创建故事分析任务
   *
   * 流程：
   * 1. 校验文件类型与大小
   * 2. 读取文本内容
   * 3. 调用 chunkNovel 进行分块
   * 4. 创建 pending 状态的 StoryAnalysisResult
   * 5. 添加到列表 + 持久化
   *
   * @param file 上传的文本文件（.txt/.md）
   * @param depth 分析深度
   * @param templateId 题材模板 ID（T-08 模板库，缺省 generic）
   * @returns 故事 ID，失败返回 null
   */
  async function createStoryFromFile(
    file: File,
    depth: AnalysisDepth,
    templateId: StoryTemplateId = 'generic'
  ): Promise<string | null> {
    lastError.value = null;
    lastInfo.value = null;

    // 1. 校验文件类型
    const ext = getExtension(file.name);
    const supportedExts = ['txt', 'md', 'markdown', 'text'];
    if (!supportedExts.includes(ext)) {
      lastError.value = t('story.unsupportedExt', { ext, supported: supportedExts.join(', ') });
      return null;
    }

    // 2. 校验文件大小（10MB 上限，防止内存溢出）
    const MAX_STORY_FILE_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_STORY_FILE_SIZE) {
      lastError.value = t('story.fileTooLarge2', { size: MAX_STORY_FILE_SIZE / 1024 / 1024 });
      return null;
    }

    try {
      // 3. 读取文本
      const text = await file.text();

      if (text.trim().length === 0) {
        lastError.value = t('story.fileEmpty');
        return null;
      }

      // 4. 分块
      const chunks = chunkNovel(text);

      if (chunks.length === 0) {
        lastError.value = t('story.chunkFailed');
        return null;
      }

      // 5. 创建 pending 结果
      const story = createEmptyResult(file.name, depth, text.length, chunks.length, templateId);

      stories.value.unshift(story);
      currentStoryId.value = story.id;
      await persistStory(story.id);

      lastInfo.value = t('story.taskCreated', { name: file.name, count: chunks.length });
      return story.id;
    } catch (err) {
      lastError.value = t('story.processFailed', { error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  }

  /**
   * 分析故事（核心流程）
   *
   * 由于 store 不持久化原始小说文本（可能数 MB），分析时需由 UI 重新传入文本。
   *
   * 流程：
   * 1. 校验状态（防重入、story 存在、未分析过）
   * 2. 获取 API profile
   * 3. 逐块调用 LLM 分析
   *    - 构建前序摘要（保持上下文连贯）
   *    - 调用 apiClient.chat
   *    - parseChunkResult 解析
   *    - 更新 progress
   * 4. 合并所有分块结果
   * 5. 深度模式：额外调用脚本生成
   * 6. 创建最终 StoryAnalysisResult
   * 7. 持久化
   *
   * @param storyId 故事 ID
   * @param text 原始小说文本
   * @returns 是否成功
   */
  async function analyzeStoryWithText(
    storyId: string,
    text: string
  ): Promise<boolean> {
    lastError.value = null;
    lastInfo.value = null;

    if (isAnalyzing.value) {
      lastError.value = t('story.analyzingBusy');
      return false;
    }

    const story = stories.value.find((s) => s.id === storyId);
    if (!story) {
      lastError.value = t('story.notFound2');
      return false;
    }

    if (story.status === 'completed') {
      lastError.value = t('story.alreadyAnalyzed');
      return false;
    }

    // 获取 API profile
    const settingsStore = useSettingsStore();
    const profile = settingsStore.activeProfile;
    if (!profile) {
      lastError.value = t('story.noApiAnalyze');
      return false;
    }

    const depthMeta = getDepthMeta(story.depth);
    if (!depthMeta) {
      lastError.value = t('story.invalidDepth', { depth: story.depth });
      return false;
    }

    // 创建 AbortController 支持取消
    abortController = new AbortController();
    const { signal } = abortController;

    // 更新状态为 analyzing
    story.status = 'analyzing';
    isAnalyzing.value = true;

    // 重新分块（不依赖已存储的 chunkCount，确保与文本一致）
    const chunks = chunkNovel(text);
    story.chunkCount = chunks.length;
    story.textLength = text.length;

    progress.value = {
      completed: 0,
      total: chunks.length,
      stage: t('story.stageStart'),
      isAnalyzing: true,
    };

    await persistStory(storyId);

    const apiClient = createApiClient(profile);
    const chunkResults: ChunkAnalysisResult[] = [];
    const errors: string[] = [];
    let prevResult: ChunkAnalysisResult | null = null;

    try {
      // 逐块分析
      for (let i = 0; i < chunks.length; i++) {
        if (signal.aborted) {
          throw new Error(t('story.userCancelled'));
        }

        progress.value = {
          completed: i,
          total: chunks.length,
          stage: t('story.stageChunk', { i: i + 1, total: chunks.length }),
          isAnalyzing: true,
        };

        const previousContext = prevResult
          ? buildPreviousContext(prevResult)
          : undefined;

        const messages = buildAnalysisMessages(
          chunks[i]!,
          story.depth,
          i,
          chunks.length,
          previousContext,
          story.templateId
        );

        try {
          const raw = await apiClient.chat({
            messages,
            model: profile.model,
            temperature: 0.3,
            maxTokens: 2000,
            signal,
          });

          const result = parseChunkResult(raw, i);
          chunkResults.push(result);
          prevResult = result;
        } catch (err) {
          // 单块失败不中断整体流程，记录错误继续
          const errMsg = t('story.chunkFailed2', { i: i + 1, error: err instanceof Error ? err.message : String(err) });
          errors.push(errMsg);
          // 仍推入空结果以保持索引一致
          const emptyResult: ChunkAnalysisResult = {
            chunkIndex: i,
            characters: [],
            scenes: [],
            events: [],
          };
          chunkResults.push(emptyResult);
          prevResult = emptyResult;
        }
      }

      if (signal.aborted) {
        throw new Error(t('story.userCancelled'));
      }

      progress.value = {
        completed: chunks.length,
        total: chunks.length,
        stage: t('story.stageMerge'),
        isAnalyzing: true,
      };

      // 合并结果
      const merged = mergeResults(chunkResults, story.depth);

      // 深度模式：额外生成故事脚本
      let scripts: StoryScript[] = [];
      if (depthMeta.extractScript) {
        progress.value = {
          completed: chunks.length,
          total: chunks.length,
          stage: t('story.stageScripts'),
          isAnalyzing: true,
        };

        try {
          const scriptMessages = buildScriptGenerationMessages(
            merged.characters,
            merged.scenes,
            merged.events,
            merged.worldInfo,
            story.templateId
          );
          const scriptRaw = await apiClient.chat({
            messages: scriptMessages,
            model: profile.model,
            temperature: 0.5,
            maxTokens: 2000,
            signal,
          });
          scripts = parseScriptResult(scriptRaw);
        } catch (err) {
          errors.push(
            `脚本生成失败：${err instanceof Error ? err.message : String(err)}`
          );
        }
      }

      // 创建最终结果
      const finalResult = createAnalysisResult(
        story.sourceFileName,
        story.depth,
        text,
        chunks,
        { ...merged, scripts },
        errors
      );

      // 保留原 id 与 createdAt
      finalResult.id = story.id;
      finalResult.createdAt = story.createdAt;

      // 替换列表中的故事
      const idx = stories.value.findIndex((s) => s.id === storyId);
      if (idx >= 0) {
        stories.value[idx] = finalResult;
      }

      await persistStory(storyId);

      progress.value = {
        completed: chunks.length,
        total: chunks.length,
        stage: errors.length > 0 ? t('story.stageDoneErrors', { count: errors.length }) : t('story.stageDone'),
        isAnalyzing: false,
      };

      if (errors.length > 0) {
        lastInfo.value = t('story.doneWithErrors', { count: errors.length });
      } else {
        lastInfo.value = t('story.doneSummary', { chars: finalResult.characters.length, scenes: finalResult.scenes.length, events: finalResult.events.length });
      }

      return true;
    } catch (err) {
      // 分析失败：保留 pending 状态允许重试
      story.status = 'pending';
      progress.value = {
        completed: 0,
        total: chunks.length,
        stage: t('story.stageFailed'),
        isAnalyzing: false,
        error: err instanceof Error ? err.message : String(err),
      };
      lastError.value = t('story.analyzeFailed', { error: err instanceof Error ? err.message : String(err) });
      await persistStory(storyId);
      return false;
    } finally {
      isAnalyzing.value = false;
      abortController = null;
    }
  }

  /**
   * 取消正在进行的分析
   */
  function cancelAnalysis(): void {
    if (abortController) {
      abortController.abort();
      lastInfo.value = t('story.cancelRequested2');
    }
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

  // ── F16.2 导入功能 ──

  /**
   * 创建导入目标适配器
   * 将 character/lorebook/events store 适配为 ImportPort 接口
   */
  function createImportTargets(): ImportTargets {
    const charStore = useCharacterStore();
    const lbStore = useLorebookStore();
    const evtStore = useEventsStore();

    const characterPort: CharacterImportPort = {
      createCharacter: () => charStore.createCharacter(),
      updateCharacter: (id, patch) => charStore.updateCharacter(id, patch),
      findCharacterByName: (name) => {
        const found = charStore.characters.find(
          (c) => c.name === name
        );
        return found ? { id: found.id, name: found.name } : null;
      },
    };

    const lorebookPort: LorebookImportPort = {
      getWorldDescription: (lbId) => {
        const lb = lbStore.lorebooks.find((l) => l.id === lbId);
        return lb?.worldDescription ?? null;
      },
      updateWorldDescription: (lbId, wd) =>
        lbStore.updateWorldDescription(lbId, wd),
      getEntries: (lbId) => {
        const lb = lbStore.lorebooks.find((l) => l.id === lbId);
        return lb?.entries ?? [];
      },
      findEntryByTitle: (lbId, title) => {
        const lb = lbStore.lorebooks.find((l) => l.id === lbId);
        if (!lb) return null;
        return lb.entries.find((e) => e.title === title) ?? null;
      },
      addEntry: (lbId, input) => lbStore.addEntry(lbId, input),
      updateEntry: (lbId, entryId, patch) =>
        lbStore.updateEntry(lbId, entryId, patch),
    };

    const eventsPort: EventsImportPort = {
      createEvent: (lbId, sceneEntryId, sceneName) =>
        evtStore.createEvent(lbId, sceneEntryId, sceneName),
      updateEvent: (id, patch) => evtStore.updateEvent(id, patch),
      findEventByName: (name) => {
        return evtStore.events.find((e) => e.name === name) ?? null;
      },
    };

    return { character: characterPort, lorebook: lorebookPort, events: eventsPort };
  }

  /**
   * 导入世界信息
   */
  function importWorld(
    storyId: string,
    lorebookId: string,
    strategy: ImportConflictStrategy
  ): ImportResult[] {
    const story = stories.value.find((s) => s.id === storyId);
    if (!story) {
      lastError.value = t('story.notFound2');
      return [];
    }
    const targets = createImportTargets();
    const results = importWorldCore(story, lorebookId, targets.lorebook, strategy);
    summarizeImportResults(results, t('story.catWorld'));
    return results;
  }

  /**
   * 导入场景
   */
  function importScenes(
    storyId: string,
    lorebookId: string,
    strategy: ImportConflictStrategy
  ): ImportResult[] {
    const story = stories.value.find((s) => s.id === storyId);
    if (!story) {
      lastError.value = t('story.notFound2');
      return [];
    }
    const targets = createImportTargets();
    const results = importScenesCore(story, lorebookId, targets.lorebook, strategy);
    summarizeImportResults(results, t('story.catScenes'));
    return results;
  }

  /**
   * 导入人物
   */
  function importCharacters(
    storyId: string,
    strategy: ImportConflictStrategy
  ): ImportResult[] {
    const story = stories.value.find((s) => s.id === storyId);
    if (!story) {
      lastError.value = t('story.notFound2');
      return [];
    }
    const targets = createImportTargets();
    const results = importCharactersCore(story, targets.character, strategy);
    summarizeImportResults(results, t('story.catChars'));
    return results;
  }

  /**
   * 导入事件
   */
  function importEvents(
    storyId: string,
    lorebookId: string,
    strategy: ImportConflictStrategy
  ): ImportResult[] {
    const story = stories.value.find((s) => s.id === storyId);
    if (!story) {
      lastError.value = t('story.notFound2');
      return [];
    }
    const targets = createImportTargets();
    const results = importEventsCore(story, lorebookId, targets.events, strategy);
    summarizeImportResults(results, t('story.catEvents'));
    return results;
  }

  /**
   * 一键全部导入
   */
  function importAll(
    storyId: string,
    lorebookId: string,
    strategy: ImportConflictStrategy
  ): ImportResult[] {
    const story = stories.value.find((s) => s.id === storyId);
    if (!story) {
      lastError.value = t('story.notFound2');
      return [];
    }
    const targets = createImportTargets();
    const results = importAllCore(story, lorebookId, targets, strategy);
    summarizeImportResults(results, t('story.catAll'));
    return results;
  }

  /**
   * 导出故事脚本为 JSON 文件下载
   */
  function exportScripts(storyId: string): void {
    const story = stories.value.find((s) => s.id === storyId);
    if (!story || story.scripts.length === 0) {
      lastError.value = t('story.noScripts');
      return;
    }
    const filename = `${story.sourceFileName.replace(/\.[^.]+$/, '')}-scripts.json`;
    downloadScripts(story.scripts, filename);
    lastInfo.value = t('story.scriptsExported', { count: story.scripts.length });
  }

  /** 汇总导入结果到 lastInfo/lastError */
  function summarizeImportResults(results: ImportResult[], label: string): void {
    const success = results.filter((r) => r.success).length;
    const failed = results.length - success;
    if (failed === 0) {
      lastInfo.value = t('story.importOk', { label, success });
    } else {
      lastInfo.value = t('story.importPartial', { label, success, failed });
      const errors = results.filter((r) => !r.success).map((r) => r.error).filter(Boolean);
      if (errors.length > 0) {
        lastError.value = errors.slice(0, 3).join('；');
      }
    }
  }

  // ── F16.3 主角身份配置 ──

  /**
   * 从故事中的已有人物创建主角配置
   *
   * @param storyId 故事 ID
   * @param characterName 故事人物名（必须在 story.characters 内）
   * @param role 主角身份（默认 'protagonist'）
   * @param startingScene 起始场景名（可选）
   * @returns 是否成功（失败时设置 lastError）
   */
  function setProtagonistFromCharacter(
    storyId: string,
    characterName: string,
    role: ProtagonistRole = 'protagonist',
    startingScene?: string
  ): boolean {
    const story = stories.value.find((s) => s.id === storyId);
    if (!story) {
      lastError.value = t('story.notFound2');
      return false;
    }
    const character = story.characters.find((c) => c.name === characterName);
    if (!character) {
      lastError.value = t('story.charNotInList', { name: characterName });
      return false;
    }

    const config = createProtagonistFromCharacter(character, role, startingScene);
    const errors = validateProtagonist(config, story);
    if (errors.length > 0) {
      lastError.value = t('story.protagonistInvalid', { errors: errors.join('；') });
      return false;
    }

    story.protagonist = config;
    void persistStory(storyId);
    lastInfo.value = t('story.protagonistSetExisting', { name: config.name });
    return true;
  }

  /**
   * 创建自定义新主角并设置到故事
   *
   * @param storyId 故事 ID
   * @param input 新主角输入
   * @returns 是否成功
   */
  function setProtagonistAsCustom(
    storyId: string,
    input: {
      name: string;
      description?: string;
      role?: ProtagonistRole;
      startingScene?: string;
      relations?: ProtagonistRelation[];
    }
  ): boolean {
    const story = stories.value.find((s) => s.id === storyId);
    if (!story) {
      lastError.value = t('story.notFound2');
      return false;
    }

    const config = createNewProtagonist(input);
    const errors = validateProtagonist(config, story);
    if (errors.length > 0) {
      lastError.value = t('story.protagonistInvalid', { errors: errors.join('；') });
      return false;
    }

    story.protagonist = config;
    void persistStory(storyId);
    lastInfo.value = t('story.protagonistSetCustom', { name: config.name });
    return true;
  }

  /**
   * 更新主角配置（patch 部分字段，自动更新 updatedAt）
   */
  function updateProtagonist(
    storyId: string,
    patch: Partial<Omit<ProtagonistConfig, 'createdAt' | 'updatedAt'>>
  ): boolean {
    const story = stories.value.find((s) => s.id === storyId);
    if (!story) {
      lastError.value = t('story.notFound2');
      return false;
    }
    if (!story.protagonist) {
      lastError.value = t('story.noProtagonist');
      return false;
    }

    const updated = patchProtagonist(story.protagonist, patch);
    const errors = validateProtagonist(updated, story);
    if (errors.length > 0) {
      lastError.value = t('story.protagonistInvalid', { errors: errors.join('；') });
      return false;
    }

    story.protagonist = updated;
    void persistStory(storyId);
    lastInfo.value = t('story.protagonistUpdated', { name: updated.name });
    return true;
  }

  /**
   * 清除主角配置
   */
  function clearProtagonist(storyId: string): boolean {
    const story = stories.value.find((s) => s.id === storyId);
    if (!story) {
      lastError.value = t('story.notFound2');
      return false;
    }
    if (!story.protagonist) {
      lastInfo.value = t('story.noProtagonistClear');
      return true;
    }
    const name = story.protagonist.name;
    story.protagonist = null;
    void persistStory(storyId);
    lastInfo.value = t('story.protagonistCleared', { name });
    return true;
  }

  /**
   * 添加/更新主角与原有人物的关系
   * 相同 target 会替换原 relation
   */
  function addProtagonistRelation(
    storyId: string,
    target: string,
    relation: string
  ): boolean {
    const story = stories.value.find((s) => s.id === storyId);
    if (!story) {
      lastError.value = t('story.notFound2');
      return false;
    }
    if (!story.protagonist) {
      lastError.value = t('story.noProtagonist');
      return false;
    }

    const newRelations = addRelationCore(story.protagonist.relations, target, relation);
    return updateProtagonist(storyId, { relations: newRelations });
  }

  /**
   * 移除主角与指定人物的关系
   */
  function removeProtagonistRelation(storyId: string, target: string): boolean {
    const story = stories.value.find((s) => s.id === storyId);
    if (!story) {
      lastError.value = t('story.notFound2');
      return false;
    }
    if (!story.protagonist) {
      lastError.value = t('story.noProtagonist');
      return false;
    }

    const newRelations = removeRelationCore(story.protagonist.relations, target);
    return updateProtagonist(storyId, { relations: newRelations });
  }

  /**
   * 设置起始场景
   * @param storyId 故事 ID
   * @param sceneName 场景名（必须在 story.scenes 内），传空字符串清除
   */
  function setStartingScene(storyId: string, sceneName: string): boolean {
    const story = stories.value.find((s) => s.id === storyId);
    if (!story) {
      lastError.value = t('story.notFound2');
      return false;
    }
    if (!story.protagonist) {
      lastError.value = t('story.noProtagonist');
      return false;
    }

    const target = sceneName.trim() === '' ? undefined : sceneName;
    return updateProtagonist(storyId, { startingScene: target });
  }

  /**
   * 关联 Persona ID（在 persona store 创建 Persona 后调用）
   */
  function setProtagonistPersonaId(storyId: string, personaId: string | null): boolean {
    const story = stories.value.find((s) => s.id === storyId);
    if (!story) {
      lastError.value = t('story.notFound2');
      return false;
    }
    if (!story.protagonist) {
      lastError.value = t('story.noProtagonist');
      return false;
    }
    return updateProtagonist(storyId, { personaId });
  }

  // ── F16.4 故事时间推进 ──

  /**
   * 需求8：设置故事关联的世界书
   * @param storyId 故事 ID
   * @param worldBookId 世界书 ID（传 null 或空字符串解除关联）
   * @returns 是否成功
   */
  function setStoryWorldBookBinding(
    storyId: string,
    worldBookId: string | null
  ): boolean {
    const story = stories.value.find((s) => s.id === storyId);
    if (!story) {
      lastError.value = t('story.notFound2');
      return false;
    }
    story.boundWorldBookId = worldBookId || null;
    void persistStory(storyId);
    lastInfo.value = worldBookId
      ? t('story.worldLinked')
      : t('story.worldUnlinked');
    return true;
  }

  /**
   * 设置故事时间配置
   * @param storyId 故事 ID
   * @param patch 部分配置字段
   * @returns 是否成功
   */
  function setStoryTimeConfig(
    storyId: string,
    patch: Partial<StoryTimeConfig>
  ): boolean {
    const story = stories.value.find((s) => s.id === storyId);
    if (!story) {
      lastError.value = t('story.notFound2');
      return false;
    }

    const current = story.timeConfig ?? createDefaultTimeConfig();
    const merged: StoryTimeConfig = { ...current, ...patch };
    const errors = validateTimeConfig(merged);
    if (errors.length > 0) {
      lastError.value = t('story.timeInvalid', { errors: errors.join('；') });
      return false;
    }

    story.timeConfig = merged;
    // 若 timeState 不存在或 startValue 变更后需要重置
    if (!story.timeState) {
      story.timeState = createDefaultTimeState(merged);
    }
    void persistStory(storyId);
    lastInfo.value = t('story.timeUpdated', { state: merged.enabled ? t('story.enabled') : t('story.disabled') });
    return true;
  }

  /**
   * 启用/禁用时间系统
   */
  function toggleStoryTime(storyId: string, enabled: boolean): boolean {
    return setStoryTimeConfig(storyId, { enabled });
  }

  /**
   * 手动推进一个时间单位（/time advance 命令调用）
   * @returns 推进后的格式化时间字符串（失败返回空字符串）
   */
  function advanceStoryTime(storyId: string): string {
    const story = stories.value.find((s) => s.id === storyId);
    if (!story) {
      lastError.value = t('story.notFound2');
      return '';
    }
    if (!story.timeConfig?.enabled) {
      lastError.value = t('story.timeDisabled');
      return '';
    }
    if (!story.timeState) {
      story.timeState = createDefaultTimeState(story.timeConfig);
    }

    story.timeState = advanceTimeCore(story.timeConfig, story.timeState);
    void persistStory(storyId);
    const formatted = formatStoryTime(story.timeConfig, story.timeState);
    lastInfo.value = t('story.timeAdvanced2', { time: formatted });
    return formatted;
  }

  /**
   * 记录一轮对话结束（由 chat store 在 AI 回复完成后调用）
   * 自动按策略判断是否推进时间
   * @returns 推进后的格式化时间字符串（未推进时返回空字符串）
   */
  function recordTurnEndForStory(storyId: string): string {
    const story = stories.value.find((s) => s.id === storyId);
    if (!story) return '';
    if (!story.timeConfig?.enabled) return '';
    if (!story.timeState) {
      story.timeState = createDefaultTimeState(story.timeConfig);
    }

    const before = story.timeState;
    story.timeState = recordTurnEnd(story.timeConfig, story.timeState);
    void persistStory(storyId);

    // 仅当时间推进时返回格式化字符串
    if (story.timeState.currentValue !== before.currentValue) {
      return formatStoryTime(story.timeConfig, story.timeState);
    }
    return '';
  }

  /**
   * 直接设置时间值（/time set 命令调用）
   */
  function setStoryTime(storyId: string, value: number): boolean {
    const story = stories.value.find((s) => s.id === storyId);
    if (!story) {
      lastError.value = t('story.notFound2');
      return false;
    }
    if (!story.timeConfig?.enabled) {
      lastError.value = t('story.timeDisabled');
      return false;
    }
    if (!story.timeState) {
      story.timeState = createDefaultTimeState(story.timeConfig);
    }

    story.timeState = setStoryTimeValueCore(story.timeState, value);
    void persistStory(storyId);
    lastInfo.value = t('story.timeSet2', { time: formatStoryTime(story.timeConfig, story.timeState) });
    return true;
  }

  /**
   * 重置时间状态到初始值
   */
  function resetStoryTime(storyId: string): boolean {
    const story = stories.value.find((s) => s.id === storyId);
    if (!story) {
      lastError.value = t('story.notFound2');
      return false;
    }
    if (!story.timeConfig) {
      lastError.value = t('story.noTimeConfig');
      return false;
    }

    story.timeState = resetStoryTimeCore(story.timeConfig);
    void persistStory(storyId);
    lastInfo.value = t('story.timeReset2', { time: formatStoryTime(story.timeConfig, story.timeState) });
    return true;
  }

  /**
   * 获取格式化的故事时间（用于 UI 显示）
   */
  function getFormattedStoryTime(storyId: string): string {
    const story = stories.value.find((s) => s.id === storyId);
    if (!story) return '';
    return formatStoryTime(story.timeConfig ?? null, story.timeState ?? null);
  }

  /**
   * 获取故事时间提示词片段（用于注入 prompt）
   */
  function getStoryTimePrompt(storyId: string): string {
    const story = stories.value.find((s) => s.id === storyId);
    if (!story) return '';
    return buildStoryTimePrompt(story.timeConfig ?? null, story.timeState ?? null);
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
    // 持久化
    loadFromStorage,
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

// ── 辅助函数 ──

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : '';
}
