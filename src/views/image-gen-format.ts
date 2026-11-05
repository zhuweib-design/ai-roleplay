/**
 * image-gen-format.ts — 图像生成页的纯工具函数（R3-6 拆分时从 View 里提出）
 *
 * 为什么独立成文件而不是各面板各抄一份：
 *   - `formatDuration` 被生成 tab（预览区耗时）、画廊 tab（统计均耗时）、
 *     宿主详情 Modal（单图耗时）三处使用，三份实现漂移过一次就是"同一张图
 *     在两个地方显示成 1.2s 和 1200ms"。
 *   - `downloadImage` 被画廊 tab 的卡片按钮与宿主详情 Modal 的 footer 共用。
 *
 * 与 R3-3 的 `local-model-format.ts` 同一做法：无副作用、不依赖组件实例。
 */

/** 毫秒 → 人类可读耗时（≥1s 用秒保留一位小数，否则用整毫秒） */
export function formatDuration(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

/**
 * 触发浏览器下载（data URL → <a download>）。
 *
 * 不用 save-blob-guard 管的导出通道：这里落盘的是**用户自己生成的图片**，
 * 不是应用数据导出；`save-blob-guard` 的基线为 0 指的是「不得另起数据导出实现」，
 * 数据导出必须走统一入口。图片下载是产物落盘，语义不同，故不收敛。
 */
export function downloadImage(image: { data: string; id: string }): void {
  const link = document.createElement('a');
  link.href = image.data;
  link.download = `${image.id}.png`;
  link.click();
}
