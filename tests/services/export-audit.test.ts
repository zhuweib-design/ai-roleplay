/**
 * T-06 导出审计必须真的落账（2026-10-27 修：两句审计都挂在 `return` 之后）
 *
 * 缺陷形状：`downloadCharacterPng` 与 `downloadChatMarkdown` 原本都是
 * `return saveBlob(...)` 后面跟一句 `auditLogger.record(...)`——`return` 之后的代码
 * 永远执行不到，所以「角色卡 PNG 导出」「对话 Markdown 导出」两类操作从来没进过审计。
 * 这类缺陷不会被类型检查或控制台发现（语法合法、无警告），只能靠"调用后去审计里查"。
 *
 * 判据：真调用（不注入状态）+ 只看审计账本。saveBlob 是唯一被 mock 的一层，
 * 因为它要碰真实的保存面板/磁盘。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { saveBlobMock } = vi.hoisted(() => ({ saveBlobMock: vi.fn() }));
vi.mock('@/utils/save-blob', () => ({ saveBlob: saveBlobMock }));

import { auditLogger } from '@/core/audit-log';
import { downloadCharacterPng } from '@/services/character-png';
import { downloadChatMarkdown } from '@/services/backup-service';
import type { CharacterCard } from '@/core/character-card';
import type { Chat } from '@/storage/types';

function makeCard(): CharacterCard {
  return {
    id: 'c1',
    name: '审计角色',
    avatar: '',
    description: '描述',
    personality: '',
    scenario: '',
    firstMessage: '',
    alternateGreetings: [],
    exampleMessages: '',
    characterNote: null,
    talkativeness: 50,
    tags: [],
    favorite: false,
    version: '1.0',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function makeChat(): Chat {
  return {
    id: 'chat-1',
    characterId: 'c1',
    title: '审计对话',
    messages: [
      { id: 'm1', role: 'user', content: '你好', timestamp: '2026-01-01T00:00:00.000Z' },
      { id: 'm2', role: 'assistant', content: '你好呀', timestamp: '2026-01-01T00:00:01.000Z' },
      { id: 'm3', role: 'user', content: '在吗', timestamp: '2026-01-01T00:00:02.000Z' },
    ] as Chat['messages'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  };
}

describe('导出审计落账（T-06）', () => {
  beforeEach(() => {
    auditLogger.clear();
    saveBlobMock.mockReset();
  });

  it('PNG 导出成功 → 审计里出现 character_export_png / ok', async () => {
    saveBlobMock.mockResolvedValue({ outcome: 'saved', filename: '审计角色.png', location: 'download' });
    const outcome = await downloadCharacterPng(makeCard());

    expect(outcome.outcome).toBe('saved');
    const entries = auditLogger.list();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      action: 'character_export_png',
      detail: '审计角色',
      result: 'ok',
    });
  });

  it('PNG 导出被用户取消 → 不写审计（取消不是一次导出）', async () => {
    saveBlobMock.mockResolvedValue({ outcome: 'cancelled', filename: '审计角色.png', location: 'picker' });
    await downloadCharacterPng(makeCard());
    expect(auditLogger.list()).toHaveLength(0);
  });

  it('对话 Markdown 导出成功 → 审计里出现 chat_export_md 与消息条数', async () => {
    saveBlobMock.mockResolvedValue({ outcome: 'saved', filename: 'x.md', location: 'download' });
    await downloadChatMarkdown(makeChat(), '小明');

    const entries = auditLogger.list();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ action: 'chat_export_md', result: 'ok' });
    expect(entries[0]!.detail).toContain('小明');
    expect(entries[0]!.detail).toContain('3 msgs');
  });

  it('Markdown 导出被取消 → 不写审计', async () => {
    saveBlobMock.mockResolvedValue({ outcome: 'cancelled', filename: 'x.md', location: 'picker' });
    await downloadChatMarkdown(makeChat(), '小明');
    expect(auditLogger.list()).toHaveLength(0);
  });
});
