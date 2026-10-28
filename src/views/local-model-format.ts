/**
 * R3-3：本地模型页的数值格式化（宿主的能力卡片与三个面板共用）。
 *
 * 抽出来而不是各写一份：formatSize 被宿主（显存估算）与模型面板（下载大小/显存占用）
 * 同时用，formatPercent 被模型面板（加载进度）与缓存面板（命中率）同时用。
 */

export function formatSize(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb} MB`;
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${Math.round(ms)}ms`;
}
