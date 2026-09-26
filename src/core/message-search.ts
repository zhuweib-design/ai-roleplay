/**
 * 对话消息全文搜索与虚拟化窗口定位。
 *
 * 搜索只读取用户可见文本（正文、旁白），不读取思考字段，避免把隐藏的
 * 推理内容暴露到搜索结果中。模块保持纯函数，UI 只负责输入与滚动定位。
 */

export interface SearchableMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  narration?: string;
  narrationAfter?: string;
}

export interface MessageSearchResult {
  id: string;
  index: number;
  role: SearchableMessage['role'];
  timestamp: number;
  /** 用于结果条与无障碍播报的上下文片段。 */
  snippet: string;
}

export interface MessageWindow {
  start: number;
  end: number;
}

/** 统一全角字符、大小写和空白，保证中英文查询行为一致。 */
export function normalizeSearchText(text: string): string {
  return text.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
}

function visibleText(message: SearchableMessage): string {
  return [message.narration, message.content, message.narrationAfter]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(' ');
}

/**
 * 从原文中截取查询附近的片段，尽量保留完整上下文。
 * 查询不存在于正文时（命中旁白）则返回消息开头，避免空结果条。
 */
export function buildMessageSnippet(
  text: string,
  query: string,
  maxLength = 120,
): string {
  if (text.length <= maxLength) return text;
  const foldedText = normalizeSearchText(text);
  const foldedQuery = normalizeSearchText(query);
  const matchAt = foldedQuery ? foldedText.indexOf(foldedQuery) : -1;
  const center = matchAt >= 0 ? matchAt + foldedQuery.length / 2 : 0;
  const start = Math.max(0, Math.min(text.length - maxLength, Math.floor(center - maxLength / 2)));
  const snippet = text.slice(start, start + maxLength).trim();
  return `${start > 0 ? '…' : ''}${snippet}${start + maxLength < text.length ? '…' : ''}`;
}

/** 在全部历史消息中查找查询词，结果保持消息原始顺序。 */
export function searchMessages(
  messages: readonly SearchableMessage[],
  query: string,
): MessageSearchResult[] {
  const foldedQuery = normalizeSearchText(query);
  if (!foldedQuery) return [];

  return messages.reduce<MessageSearchResult[]>((results, message, index) => {
    const text = visibleText(message);
    if (!normalizeSearchText(text).includes(foldedQuery)) return results;
    results.push({
      id: message.id,
      index,
      role: message.role,
      timestamp: message.timestamp,
      snippet: buildMessageSnippet(text, query),
    });
    return results;
  }, []);
}

/**
 * 为指定消息计算虚拟化窗口。窗口长度默认 200，保持与 ChatMain 的双向
 * 窗口上限一致；目标尽量置于中部，靠近首尾时自动贴边。
 */
export function getMessageWindow(
  messageIndex: number,
  messageCount: number,
  windowSize = 200,
): MessageWindow {
  const count = Math.max(0, messageCount);
  if (count === 0) return { start: 0, end: 0 };
  const size = Math.max(1, Math.min(windowSize, count));
  const target = Math.max(0, Math.min(messageIndex, count - 1));
  let start = Math.max(0, target - Math.floor(size / 2));
  if (start + size > count) start = count - size;
  return { start, end: start + size };
}
