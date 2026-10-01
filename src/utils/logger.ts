/**
 * 统一日志服务
 *
 * 目标（对应代码审查「Console 输出未规范化」项）：
 * - 统一格式 `[时间] [标签] 消息`，便于过滤与定位
 * - 生产构建默认只输出 warn/error，避免调试噪音与不必要的主线程开销
 * - 开发/测试全量输出
 *
 * 设计取舍：
 * - 不引入远程日志上报：涉及用户数据外发与隐私合规，需单独评估后再做
 * - 不使用 `no-console` 之外的额外依赖，保持零依赖
 *
 * 注意：本文件内的 console.* 是日志服务的唯一出口；
 * i18n 扫描门禁将 console.* / logger.* 开头的行视为非 UI 文案而豁免。
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/** 生产环境仅 warn 及以上；开发/测试全量 */
const MIN_LEVEL: LogLevel = import.meta.env.MODE === 'production' ? 'warn' : 'debug';

function enabled(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[MIN_LEVEL];
}

/** 短时间戳 HH:MM:SS.mmm（比完整 ISO 更易读，且足够定位） */
function stamp(): string {
  return new Date().toISOString().slice(11, 23);
}

function format(tag: string, message: string): string {
  return `[${stamp()}] [${tag}] ${message}`;
}

export const logger = {
  debug(tag: string, message: string): void {
    if (enabled('debug')) console.debug(format(tag, message));
  },
  info(tag: string, message: string): void {
    if (enabled('info')) console.info(format(tag, message));
  },
  warn(tag: string, message: string, error?: unknown): void {
    if (!enabled('warn')) return;
    if (error === undefined) console.warn(format(tag, message));
    else console.warn(format(tag, message), error);
  },
  error(tag: string, message: string, error?: unknown): void {
    if (!enabled('error')) return;
    if (error === undefined) console.error(format(tag, message));
    else console.error(format(tag, message), error);
  },
};
