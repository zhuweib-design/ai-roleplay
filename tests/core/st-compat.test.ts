/**
 * st-compat — SillyTavern 群聊 / Quick Reply 互导 (T-07) 测试
 *
 * 覆盖：
 * - 群聊导出为 ST 格式(字段映射:is_user/mesId/swipes/send_date)
 * - 群聊从 ST JSON 导入(含过滤非法成员/消息)
 * - Quick Reply 导出/导入往返
 */
import { describe, it, expect } from 'vitest';
import {
  exportGroupChatToSt,
  exportGroupChatToStJson,
  importGroupChatFromSt,
  exportQuickRepliesToStJson,
  importQuickRepliesFromSt,
  type StGroupChatFile,
} from '@core/st-compat';
import type { GroupChat } from '@core/group-chat';

function makeGroupChat(overrides: Partial<GroupChat> = {}): GroupChat {
  return {
    id: 'group-1',
    name: '冒险小队',
    description: '测试群聊',
    members: [
      { characterId: 'char-1', name: '战士', joinedAt: '2026-01-01T00:00:00.000Z', allowAutoSelect: true },
      { characterId: 'char-2', name: '法师', joinedAt: '2026-01-01T00:00:00.000Z', allowAutoSelect: true },
    ],
    firstMessage: '',
    messages: [
      {
        id: 'm1',
        role: 'assistant',
        content: '我们出发吧',
        timestamp: '2026-01-02T00:00:00.000Z',
        characterId: 'char-1',
        characterName: '战士',
        swipes: [],
        swipeIndex: 0,
      },
      {
        id: 'm2',
        role: 'user',
        content: '等等我',
        timestamp: '2026-01-02T00:00:01.000Z',
        swipes: [],
        swipeIndex: 0,
      },
    ],
    mode: 'natural',
    lastSpeakerId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
  };
}

describe('st-compat 群聊导出 (T-07)', () => {
  it('导出为 ST 格式:成员/消息字段映射正确', () => {
    const st = exportGroupChatToSt(makeGroupChat());

    expect(st.id).toBe('group-1');
    expect(st.name).toBe('冒险小队');
    expect(st.members).toEqual([
      { characterId: 'char-1', isWorld: false },
      { characterId: 'char-2', isWorld: false },
    ]);

    expect(st.messages[0]).toMatchObject({
      characterId: 'char-1',
      name: '战士',
      is_user: false,
      is_name: true,
      mes: '我们出发吧',
    });
    expect(st.messages[1]!.is_user).toBe(true);
    expect(st.messages[0]!.mesId).toBe(0);
    expect(st.messages[1]!.mesId).toBe(1);
  });

  it('导出 JSON 文本可被 JSON.parse 还原', () => {
    const json = exportGroupChatToStJson(makeGroupChat());
    const parsed = JSON.parse(json) as StGroupChatFile;
    expect(parsed.name).toBe('冒险小队');
    expect(parsed.messages.length).toBe(2);
  });

  it('导出时省略本项目私有字段(mode/talkativeness)', () => {
    const st = exportGroupChatToSt(
      makeGroupChat({
        members: [
          { characterId: 'char-1', name: '战士', joinedAt: 'x', allowAutoSelect: true, talkativeness: 80 },
        ],
      })
    );
    expect(st.members[0]!).not.toHaveProperty('talkativeness');
    expect(st).not.toHaveProperty('mode');
  });
});

describe('st-compat 群聊导入 (T-07)', () => {
  it('从标准 ST 群聊 JSON 导入', () => {
    const st: StGroupChatFile = {
      id: 'st-group-1',
      name: 'ST 小队',
      members: [
        { characterId: 'char-a', avatar: 'data:image/png;base64,xxx', isWorld: false },
        { characterId: 'char-b' },
      ],
      messages: [
        {
          is_user: false,
          is_name: true,
          send_date: '2026-01-01T00:00:00.000Z',
          mesId: 0,
          swipeId: 0,
          swipes: ['第一版', '第二版'],
          mes: '第一版',
          characterId: 'char-a',
          name: '战士',
        },
        {
          is_user: true,
          is_name: true,
          send_date: '2026-01-01T00:00:01.000Z',
          mesId: 1,
          swipeId: 1,
          swipes: [],
          mes: '你好',
        },
      ],
    };

    const chat = importGroupChatFromSt(st);
    expect(chat.id).toBe('st-group-1');
    expect(chat.name).toBe('ST 小队');
    expect(chat.members).toHaveLength(2);
    expect(chat.members[0]).toMatchObject({
      characterId: 'char-a',
      avatar: 'data:image/png;base64,xxx',
      allowAutoSelect: true,
    });

    expect(chat.messages).toHaveLength(2);
    expect(chat.messages[0]).toMatchObject({
      role: 'assistant',
      content: '第一版',
      characterId: 'char-a',
      characterName: '战士',
      swipes: ['第一版', '第二版'],
    });
    expect(chat.messages[1]!.role).toBe('user');
    expect(chat.messages[0]!.id).not.toBe(chat.messages[1]!.id);
  });

  it('缺 name 字段抛错', () => {
    expect(() => importGroupChatFromSt({ id: 'x' })).toThrow(/name/);
  });

  it('过滤非法成员与消息(缺失 characterId / mes)', () => {
    const chat = importGroupChatFromSt({
      name: '过滤测试',
      members: [{ characterId: 'ok' }, {}, { characterId: 123 }],
      messages: [{ mes: '有效' }, {}, { mes: '也是有效' }],
    });
    expect(chat.members).toHaveLength(1);
    expect(chat.members[0]!.characterId).toBe('ok');
    expect(chat.messages).toHaveLength(2);
    expect(chat.messages.map((m) => m.content)).toEqual(['有效', '也是有效']);
  });

  it('空 members/messages 默认空数组', () => {
    const chat = importGroupChatFromSt({ name: '空群聊' });
    expect(chat.members).toEqual([]);
    expect(chat.messages).toEqual([]);
  });
});

describe('st-compat Quick Reply 互导 (T-07)', () => {
  it('导出格式:label/message/group 映射', () => {
    const json = exportQuickRepliesToStJson([
      { id: 'qr-1', label: '战斗', script: '/r 1d20', group: '战斗组', autoSend: true },
      { id: 'qr-2', label: '问候', script: '你好！', group: '', autoSend: false },
    ]);
    const parsed = JSON.parse(json) as Array<Record<string, unknown>>;
    expect(parsed).toEqual([
      { id: 'qr-1', label: '战斗', message: '/r 1d20', group: '战斗组' },
      { id: 'qr-2', label: '问候', message: '你好！' },
    ]);
  });

  it('从 ST JSON 导入:autoSend 固定 false,缺少字段有默认值', () => {
    const buttons = importQuickRepliesFromSt([
      { id: 'qr-1', label: '战斗', message: '/r 1d20', group: '战斗组' },
      { id: 123, label: 456, message: 'x' },
    ]);
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toEqual({
      id: 'qr-1',
      label: '战斗',
      script: '/r 1d20',
      group: '战斗组',
      autoSend: false,
    });
    // 非法字段回退默认
    expect(buttons[1]!.id).toMatch(/^qr-/);
    expect(buttons[1]!.label).toMatch(/^按钮/);
  });

  it('非数组输入抛错', () => {
    expect(() => importQuickRepliesFromSt({})).toThrow(/数组/);
  });

  it('空数组返回空列表', () => {
    expect(importQuickRepliesFromSt([])).toEqual([]);
  });
});