/**
 * 展示层格式化工具（R4-10 从 DataBankView 抽出）
 *
 * 只放「无副作用、无 i18n 依赖、纯输入到输出」的格式化函数。
 * 刻意不引 i18n：`formatDate` 原先硬编码 `'zh-CN'`，此处保持原样以免改行为；
 * 若将来要按 locale 切换，调用方传 `locale` 参数即可，不要在这里读全局。
 */

/** 字节数 → 人类可读（B / KB / MB，保留 1 位小数） */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** ISO 时间串 → 本地日期时间；非法输入原样返回（不抛错、不显示 Invalid Date） */
export function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('zh-CN');
  } catch {
    return iso;
  }
}
