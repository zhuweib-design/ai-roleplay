/**
 * 版本页的三个纯格式化函数（R2-2 从 CharacterVersionView 抽出）
 *
 * 抽出来的唯一理由是**四个面板都要用**：时间、提交消息截断、快照字段转文本。
 * 留在宿主会让每个面板各自复制一份（R1-4/R2-1 的 CSS 副本已经够多了），
 * 放进宿主再往下传又只是多一层 props 转发。
 *
 * 纯函数、无状态、不读 store —— 所以放模块级，不进 composable。
 */

/** ISO 时间 → 本地短时间；解析不了就原样返回，不抛 */
export function formatTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

/** 超长消息截断（列表里只给一眼的信息，全文在快照/对比里看） */
export function shortMessage(message: string, max = 50): string {
  return message.length > max ? message.slice(0, max) + '…' : message;
}

/** 快照字段 → 可读文本：对象走 JSON，标量直接转，空值统一给长破折号 */
export function formatSnapshotField(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value || '—';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
