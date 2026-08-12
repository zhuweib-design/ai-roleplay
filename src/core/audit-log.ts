/**
 * 数据操作审计日志 (T-06 二期)
 *
 * 记录数据导出/导入/清除等敏感操作的审计轨迹,供用户核对与回溯:
 * - 本地优先:条目存 localStorage(上限 MAX_ENTRIES,环形淘汰)
 * - 不采集任何内容数据,仅记录动作、摘要计数与结果
 * - 可在设置页查看/导出/清空
 */

/** 审计动作类型 */
export type AuditAction =
  | 'backup_export' // 全量备份导出
  | 'backup_import' // 全量备份导入
  | 'character_export_png' // 角色卡 PNG 导出
  | 'character_export_v2' // 角色卡 V2 JSON 导出
  | 'character_import' // 角色卡导入
  | 'lorebook_export' // 世界书导出
  | 'lorebook_import' // 世界书导入
  | 'chat_export_md' // 对话 Markdown 导出
  | 'settings_reset'; // 设置重置

/** 审计结果 */
export type AuditResult = 'ok' | 'error' | 'blocked';

/** 单条审计记录 */
export interface AuditEntry {
  /** ISO 时间戳 */
  ts: string;
  action: AuditAction;
  /** 摘要(如 "角色 3 / 对话 0 / 世界书 1") */
  detail: string;
  result: AuditResult;
}

/** localStorage 存储键 */
const STORAGE_KEY = 'ai-roleplay:audit-log';

/** 最大保留条数(环形淘汰) */
const MAX_ENTRIES = 200;

class AuditLogger {  private entries: AuditEntry[] = [];

  constructor() {
    this.load();
  }

  /** 追加一条审计记录(自动持久化) */
  record(action: AuditAction, detail: string, result: AuditResult = 'ok'): void {
    this.entries.push({ ts: new Date().toISOString(), action, detail, result });
    if (this.entries.length > MAX_ENTRIES) {
      this.entries.splice(0, this.entries.length - MAX_ENTRIES);
    }
    this.save();
  }

  /** 全部条目(新→旧) */
  list(): AuditEntry[] {
    return [...this.entries].reverse();
  }

  /** 清空日志 */
  clear(): void {
    this.entries = [];
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* 隐私模式等场景静默 */
    }
  }

  /** 导出为 JSON 文本(含导出时间戳元信息) */
  exportJson(): string {
    return JSON.stringify(
      { exportedAt: new Date().toISOString(), count: this.entries.length, entries: this.entries },
      null,
      2
    );
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      this.entries = parsed.filter(
        (e): e is AuditEntry =>
          typeof e === 'object' &&
          e !== null &&
          typeof (e as AuditEntry).ts === 'string' &&
          typeof (e as AuditEntry).action === 'string'
      );
    } catch {
      this.entries = [];
    }
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.entries));
    } catch {
      /* 存储不可用时审计仅在内存 */
    }
  }
}

/** 全局审计日志单例 */
export const auditLogger = new AuditLogger();

/** 独立实例(测试/多用途);单例 auditLogger 已覆盖常规场景 */
export { AuditLogger };