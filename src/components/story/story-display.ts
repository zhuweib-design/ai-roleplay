/**
 * 故事引擎的展示格式化（R1-2 从 StoryEngineView 提上来）
 *
 * 这些函数只做"数据 → 可读文本/类名"，不含状态、不碰 store。
 * 拆分成卡片、详情、上传弹窗之后，同一个 `formatCharCount` 会被三处用到——
 * 留在视图里会变成"子组件反向 import 视图"，所以单独一处。
 */
import { t } from '@/i18n';
import {
  ANALYSIS_DEPTHS,
  type AnalysisDepth,
  type AnalysisDepthMeta,
  type StoryAnalysisResult,
  type ProtagonistRole,
} from '@core/story-types';

export function formatDateTime(ts: number): string {
  try {
    return new Date(ts).toLocaleString('zh-CN');
  } catch {
    return String(ts);
  }
}

export function formatCharCount(n: number): string {
  if (n < 1000) return t('story.charCount', { count: n });
  if (n < 10000) return t('story.charCountK', { count: (n / 1000).toFixed(1) });
  return t('story.charCountW', { count: (n / 10000).toFixed(1) });
}

export function getDepthMeta(depth: AnalysisDepth): AnalysisDepthMeta | undefined {
  return ANALYSIS_DEPTHS.find((d) => d.id === depth);
}

export function getStatusLabel(status: StoryAnalysisResult['status']): string {
  switch (status) {
    case 'pending':
      return t('story.statusPending');
    case 'analyzing':
      return t('story.statusAnalyzing');
    case 'completed':
      return t('story.statusCompleted');
    case 'failed':
      return t('story.statusFailed');
    default:
      return status;
  }
}

export function getStatusClass(status: StoryAnalysisResult['status']): string {
  switch (status) {
    case 'pending':
      return 'status-pending';
    case 'analyzing':
      return 'status-analyzing';
    case 'completed':
      return 'status-completed';
    case 'failed':
      return 'status-failed';
    default:
      return '';
  }
}

export function getProtagonistRoleLabel(role: ProtagonistRole): string {
  return role === 'protagonist' ? t('story.roleProtagonist') : t('story.roleObserver');
}

/** 主角来源标签 */
export function getProtagonistSourceLabel(source: 'existing' | 'custom'): string {
  return source === 'existing' ? t('story.sourceExisting') : t('story.sourceCustom');
}
