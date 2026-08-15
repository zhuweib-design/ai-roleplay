/**
 * 文档分块器 (F09.1)
 *
 * 业务逻辑：
 * - 按双换行（段落）分割文本
 * - 段落超过 MAX_CHUNK_LENGTH 时按句号/换行进一步切分
 * - 返回分块字符串数组（不含 ID/元数据，由调用方包装）
 *
 * 规则约束：
 * - 默认段块上限 2000 字符
 * - 空块过滤
 */

import { MAX_CHUNK_LENGTH } from './data-bank';
import { countTokens } from './token-counter';
import type { DocumentChunk } from './data-bank';

export interface ChunkOptions {
  /** 单块最大字符数，默认 MAX_CHUNK_LENGTH (2000) */
  maxChunkLength?: number;
  /** 段落分隔符，默认 '\n\n' */
  separator?: string;
}

/**
 * 将文本按段落分块
 *
 * 算法：
 * 1. 按 separator（默认双换行）分割为段落
 * 2. 段落超过 maxChunkLength 时，按句号/换行/空格进一步切分
 * 3. 过滤空块
 */
export function chunkDocument(
  text: string,
  options?: ChunkOptions
): string[] {
  if (!text || typeof text !== 'string') return [];

  const maxLen = options?.maxChunkLength ?? MAX_CHUNK_LENGTH;
  const separator = options?.separator ?? '\n\n';

  // 1. 按段落分割
  const paragraphs = text
    .split(separator)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  // 2. 处理超长段落
  const chunks: string[] = [];
  for (const para of paragraphs) {
    if (para.length <= maxLen) {
      chunks.push(para);
    } else {
      const subChunks = splitLongParagraph(para, maxLen);
      chunks.push(...subChunks);
    }
  }

  return chunks;
}

/**
 * 将超长段落按句号/换行/空格切分为不超过 maxLen 的块
 */
function splitLongParagraph(text: string, maxLen: number): string[] {
  const chunks: string[] = [];
  // 按句末标点切分（中英文句号、问号、感叹号、换行）
  const sentences = text
    .split(/(?<=[。！？.!?])\s*|\n+/)
    .filter((s) => s.trim().length > 0);

  let current = '';
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;

    // 当前块 + 句子不超过限制时合并
    if (current.length + trimmed.length + 1 <= maxLen) {
      current = current ? current + ' ' + trimmed : trimmed;
    } else {
      // 当前块已满，保存
      if (current) chunks.push(current);
      // 单个句子超过限制，强制按长度切分
      if (trimmed.length > maxLen) {
        for (let i = 0; i < trimmed.length; i += maxLen) {
          chunks.push(trimmed.slice(i, i + maxLen));
        }
        current = '';
      } else {
        current = trimmed;
      }
    }
  }
  if (current) chunks.push(current);

  return chunks;
}

/**
 * 为分块生成 DocumentChunk 元数据（含 ID 和 token 计数）
 *
 * @param documentId 所属文档 ID
 * @param rawChunks 原始分块文本数组（来自 chunkDocument）
 */
export async function buildChunks(
  documentId: string,
  rawChunks: string[]
): Promise<DocumentChunk[]> {
  return Promise.all(
    rawChunks.map(async (content, index) => ({
      id: `${documentId}-${index}`,
      documentId,
      index,
      content,
      tokenCount: await countTokens(content),
    }))
  );
}
