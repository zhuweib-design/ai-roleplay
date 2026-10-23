import { computed } from 'vue';
import { useStoryStore } from '@/stores/story';
import { t } from '@/i18n';
import type { AnalysisDepth } from '@core/story-types';
import type { StoryTemplateId } from '@core/story-templates';

export type ToastKind = 'info' | 'success' | 'error';

export interface StoryGenerationOptions {
  showToast: (type: ToastKind, message: string) => void;
}

/**
 * useStoryGeneration — 上传→建故事→跑分析→中止（R1-2 从 StoryEngineView 拆出）
 *
 * 这条链路跨了"文件读取（弹窗）→ store 建记录 → LLM 分块分析（store）"三段，
 * 视图只该知道"用户点了开始"和"进度到哪了"。把三段串起来的顺序写在这里，
 * 视图就不会再持有 `fileText` 这种只在一次提交里存在的临时状态。
 */
export function useStoryGeneration(options: StoryGenerationOptions) {
  const store = useStoryStore();
  const { showToast } = options;

  const isAnalyzing = computed(() => store.isAnalyzing);
  const progress = computed(() => store.progress);
  const progressPercent = computed(() => {
    if (progress.value.total === 0) return 0;
    return Math.round((progress.value.completed / progress.value.total) * 100);
  });

  /**
   * 建故事并立即开始分析。
   *
   * `onCreated` 在**记录建好、分析还没开始**的那一刻调用——拆分前是
   * `closeUploadModal()` 写在这个位置，顺序不能挪：弹窗先关，分析在后台跑，
   * 用户才能立刻看到进度条。返回 true 表示记录已建好。
   */
  async function handleUpload(
    payload: {
      file: File;
      text: string;
      depth: AnalysisDepth;
      template: StoryTemplateId;
    },
    onCreated?: () => void
  ): Promise<boolean> {
    const id = await store.createStoryFromFile(payload.file, payload.depth, payload.template);

    if (!id) {
      if (store.lastError) showToast('error', store.lastError);
      return false;
    }

    onCreated?.();

    if (store.lastInfo) {
      showToast('success', store.lastInfo);
    }
    // 自动开始分析
    const success = await store.analyzeStoryWithText(id, payload.text);
    if (success) {
      if (store.lastInfo) {
        showToast('success', store.lastInfo);
      }
    } else if (store.lastError) {
      showToast('error', store.lastError);
    }
    return true;
  }

  function handleCancelAnalysis(): void {
    store.cancelAnalysis();
    showToast('info', t('story.cancelRequested'));
  }

  return {
    isAnalyzing,
    progress,
    progressPercent,
    handleUpload,
    handleCancelAnalysis,
  };
}
