import { describe, expect, it } from 'vitest';
import {
  buildMessageSnippet,
  getMessageWindow,
  normalizeSearchText,
  searchMessages,
} from '@/core/message-search';

const messages = [
  { id: 'm-0', role: 'user' as const, content: '请打开 灰烬之典', timestamp: 1 },
  {
    id: 'm-1',
    role: 'assistant' as const,
    narration: '低声说',
    content: '禁书阁今晚不接待访客。',
    timestamp: 2,
  },
  { id: 'm-2', role: 'user' as const, content: '那我们明天再来。', timestamp: 3 },
];

describe('message-search', () => {
  it('统一全角字符、大小写和空白', () => {
    expect(normalizeSearchText('  Ｋｉｎｇ\n  lives  ')).toBe('king lives');
  });

  it('搜索全部历史消息并保留原始顺序', () => {
    const results = searchMessages(messages, '禁书阁');
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ id: 'm-1', index: 1, role: 'assistant' });
    expect(results[0]?.snippet).toContain('禁书阁');
  });

  it('支持大小写和旁白命中，但不搜索隐藏思考字段', () => {
    const withThinking = [
      { ...messages[1]!, thinking: 'secret plan' },
      { ...messages[2]!, content: 'The KING waits.' },
    ];
    expect(searchMessages(withThinking, '低声')).toHaveLength(1);
    expect(searchMessages(withThinking, 'king')).toHaveLength(1);
    expect(searchMessages(withThinking, 'secret plan')).toHaveLength(0);
  });

  it('空查询不返回结果，并为长文本生成带省略号的片段', () => {
    expect(searchMessages(messages, '   ')).toEqual([]);
    const text = '前'.repeat(80) + '目标词' + '后'.repeat(80);
    const snippet = buildMessageSnippet(text, '目标词', 24);
    expect(snippet.length).toBeLessThanOrEqual(26);
    expect(snippet).toContain('目标词');
  });

  it('为跳转目标计算不越界的虚拟化窗口', () => {
    expect(getMessageWindow(500, 1000)).toEqual({ start: 400, end: 600 });
    expect(getMessageWindow(3, 1000)).toEqual({ start: 0, end: 200 });
    expect(getMessageWindow(998, 1000)).toEqual({ start: 800, end: 1000 });
    expect(getMessageWindow(0, 0)).toEqual({ start: 0, end: 0 });
  });
});
