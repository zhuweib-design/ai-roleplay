/**
 * 故事 store · 分析流水线（R4-5 自 stores/story.ts 切出）
 *
 * 从文件建任务 / 逐块调 LLM / 合并结果 / 深度模式生成脚本 / 取消。
 * abortController 是实例状态，封在工厂闭包内。
 */
import { t } from '@/i18n';
import type { Ref } from 'vue';
import {
  type AnalysisDepth,
  type AnalysisProgress,
  type StoryAnalysisResult,
  type ChunkAnalysisResult,
  type StoryScript,
  getDepthMeta,
  createEmptyResult,
} from '@core/story-types';
import type { StoryTemplateId } from '@core/story-templates';
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
import { prepareGenerationPrompt, resolveContextWindow } from '@core/token-budget';
import { createApiClient } from '../api';
import { useSettingsStore } from './settings';

export interface StoryAnalysisDeps {
  stories: Ref<StoryAnalysisResult[]>;
  currentStoryId: Ref<string | null>;
  lastError: Ref<string | null>;
  lastInfo: Ref<string | null>;
  isAnalyzing: Ref<boolean>;
  progress: Ref<AnalysisProgress>;
  persistStory: (id: string) => Promise<void>;
}

export function createStoryAnalysisOps(deps: StoryAnalysisDeps) {
  const { stories, currentStoryId, lastError, lastInfo, isAnalyzing, progress, persistStory } = deps;

  // 取消控制器（运行时，不持久化）
  let abortController: AbortController | null = null;

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

        // 分块文本超预算时自动截断（保头），输出预算由模型上下文推导
        const prepared = await prepareGenerationPrompt(
          (src) =>
            buildAnalysisMessages(
              src ?? chunks[i]!,
              story.depth,
              i,
              chunks.length,
              previousContext,
              story.templateId
            ),
          chunks[i],
          resolveContextWindow(profile, settingsStore.maxContextTokens),
          settingsStore.reservedTokens
        );

        try {
          const raw = await apiClient.chat({
            messages: prepared.messages,
            model: profile.model,
            temperature: 0.3,
            maxTokens: prepared.maxTokens,
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
          const prepared = await prepareGenerationPrompt(
            () =>
              buildScriptGenerationMessages(
                merged.characters,
                merged.scenes,
                merged.events,
                merged.worldInfo,
                story.templateId
              ),
            undefined,
            resolveContextWindow(profile, settingsStore.maxContextTokens),
            settingsStore.reservedTokens
          );
          const scriptRaw = await apiClient.chat({
            messages: prepared.messages,
            model: profile.model,
            temperature: 0.5,
            maxTokens: prepared.maxTokens,
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

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : '';
}

  return { createStoryFromFile, analyzeStoryWithText, cancelAnalysis };
}
