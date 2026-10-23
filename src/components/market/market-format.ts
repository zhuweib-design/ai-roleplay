/**
 * 社区市场的纯格式化函数（R2-4 从 CommunityMarketView 抽出）
 *
 * 抽出来的唯一理由是**卡片网格、详情弹窗、远程面板三处都要用**。
 * 留在宿主会让每个子组件各自复制一份（R1-4/R2-1 的 CSS 副本已经够多了），
 * 放进宿主再往下传又只是多一层 props 转发。
 *
 * 纯函数、无状态、不读 store —— 所以放模块级，不进 composable。
 */

/** ISO 日期 → YYYY-MM-DD（本地时区）；解析不了就原样返回，不抛 */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 计数缩写：1234 → 1.2k；小于 1000 原样返回 */
export function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

/** 评分 → 星号字符串（★×N + 可选 ½ + ☆ 补满 5 位） */
export function ratingStars(rating: number): string {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(5 - full - (half ? 1 : 0));
}

/** 字节数 → 人类可读（B / KB / MB） */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
