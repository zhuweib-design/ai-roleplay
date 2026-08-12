/**
 * audit-log — 数据操作审计日志 (T-06 二期) 测试
 *
 * 覆盖：
 * - record 追加并按新→旧排列
 * - 持久化到 localStorage 与恢复
 * - 条数上限环形淘汰
 * - clear 清空
 * - exportJson 格式
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { AuditLogger } from '@core/audit-log';

describe('audit-log (T-06)', () => {
  beforeEach(() => {
    try {
      localStorage.clear();
    } catch {
      /* jsdom 下可用 */
    }
  });

  it('record 追加并新→旧排列', async () => {
    const log = new AuditLogger();
    log.record('backup_export', '角色 1', 'ok');
    log.record('backup_export', '明文密钥阻止', 'blocked');

    const list = log.list();
    expect(list).toHaveLength(2);
    expect(list[0].detail).toBe('明文密钥阻止');
    expect(list[0].result).toBe('blocked');
    expect(list[1].detail).toBe('角色 1');
    expect(typeof list[0].ts).toBe('string');
  });

  it('持久化:新实例可恢复条目', async () => {
    
    const log1 = new AuditLogger();
    log1.record('chat_export_md', '对话A', 'ok');
    log1.record('character_export_png', '角色卡B', 'ok');

    const log2 = new AuditLogger();
    const list = log2.list();
    expect(list).toHaveLength(2);
    expect(list.map((e) => e.action)).toEqual(['character_export_png', 'chat_export_md']);
  });

  it('超上限环形淘汰(仅保留最新 MAX_ENTRIES)', async () => {
    const log = new AuditLogger();
    // 上限 200,写入 205 条
    for (let i = 0; i < 205; i++) {
      log.record('backup_export', `条目${i}`, 'ok');
    }
    const list = log.list();
    expect(list).toHaveLength(200);
    expect(list[0].detail).toBe('条目204'); // 最新在前
    expect(list[199].detail).toBe('条目5'); // 最早保留
  });

  it('clear 清空并移除持久化', async () => {
    const log = new AuditLogger();
    log.record('backup_import', '新增 1', 'ok');
    log.clear();
    expect(log.list()).toHaveLength(0);

    const log2 = new AuditLogger();
    expect(log2.list()).toHaveLength(0);
  });

  it('exportJson 含时间戳与条目', async () => {
    const log = new AuditLogger();
    log.record('settings_reset', '全部重置', 'ok');

    const json = JSON.parse(log.exportJson()) as {
      exportedAt: string;
      count: number;
      entries: unknown[];
    };
    expect(json.count).toBe(1);
    expect(json.entries).toHaveLength(1);
    expect(typeof json.exportedAt).toBe('string');
  });

  it('损坏的持久化数据静默恢复为空', async () => {
    try {
      localStorage.setItem('ai-roleplay:audit-log', '{not-json');
    } catch {
      /* noop */
    }
    const log = new AuditLogger();
    expect(log.list()).toHaveLength(0);
  });
});