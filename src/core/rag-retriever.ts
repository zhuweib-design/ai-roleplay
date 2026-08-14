/**
 * RAG 关键词检索器 (F09.2)
 *
 * 业务逻辑：
 * - 从最近 N 条消息提取关键词（中英文混合分词）
 * - 在文档块中搜索匹配段落（关键词包含匹配）
 * - 按关键词命中率排序，取 Top M 段
 *
 * 规则约束：
 * - 默认取最近 5 条消息提取关键词
 * - 默认最大 20 个关键词
 * - 默认注入 3 段
 */

import type {
  RetrievedChunk,
  DataBankDocument,
  RAGConfig,
} from './data-bank';
import { DEFAULT_RAG_CONFIG } from './data-bank';
// i18n-ignore-start  // 模型面提示词 / mock / 种子目录，非 UI 文案（待翻译）

// ── P1-10 性能：检索结果缓存 ──
// 纯函数结果缓存：key = 文档指纹 + 消息内容。
// 文档字段或消息内容变化即失效；容量受限防内存膨胀。
const RETRIEVE_CACHE_MAX = 50;
const retrieveCache = new Map<string, RetrievedChunk[]>();

/** 文档集指纹：id + updatedAt + chunk 数量与内容长度，文档更新时变化 */
function docsFingerprint(documents: DataBankDocument[]): string {
  return documents
    .map((d) =>
      [
        d.id,
        d.updatedAt ?? '',
        d.chunks?.length ?? 0,
        d.chunks?.reduce((sum, c) => sum + c.content.length, 0) ?? 0,
      ].join(':')
    )
    .join('|');
}

/** 清除缓存（测试与文档删除/重建时使用） */
export function clearRetrieveCache(): void {
  retrieveCache.clear();
}

/** 中文停用词（高频无意义词） */
const STOP_WORDS = new Set([
  '的', '了', '是', '在', '我', '你', '他', '她', '它', '们',
  '这', '那', '和', '与', '或', '也', '都', '就', '还', '又',
  '不', '没', '有', '一', '个', '上', '下', '中', '里', '外',
  '到', '为', '对', '把', '被', '让', '使', '给', '向', '从',
  '会', '能', '可', '要', '想', '说', '看', '听', '做', '走',
  '已经', '什么', '怎么', '为什么', '这个', '那个', '这些', '那些',
  '一个', '没有', '不是', '可以', '他们', '我们', '你们',
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
  'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'this', 'that',
  'do', 'does', 'did', 'have', 'has', 'had', 'will', 'would', 'can',
]);

/**
 * 从消息列表提取关键词
 *
 * 算法：
 * 1. 合并消息文本
 * 2. 分词（英文按空格/标点，中文按 2-gram/3-gram）
 * 3. 过滤停用词和短词（<2 字符）
 * 4. 按词频排序取 Top K
 *
 * @param messages 消息内容列表
 * @param maxKeywords 最大关键词数（默认 20）
 */
export function extractKeywords(
  messages: string[],
  maxKeywords: number = DEFAULT_RAG_CONFIG.maxKeywords
): string[] {
  if (!messages || messages.length === 0) return [];

  // 合并消息
  const text = messages.join(' ');

  // 分词
  const words = tokenize(text);

  // 统计词频
  const freq = new Map<string, number>();
  for (const word of words) {
    // 过滤停用词和短词
    if (word.length < 2) continue;
    if (STOP_WORDS.has(word.toLowerCase())) continue;
    freq.set(word, (freq.get(word) ?? 0) + 1);
  }

  // 按频率排序
  const sorted = Array.from(freq.entries()).sort((a, b) => b[1] - a[1]);

  return sorted.slice(0, maxKeywords).map(([word]) => word);
}

/**
 * 分词（中文 2-gram/3-gram + 英文单词）
 */
function tokenize(text: string): string[] {
  const tokens: string[] = [];
  // 按标点和空白分割
  const segments = text.split(
    // eslint-disable-next-line no-useless-escape -- 字符类内 ] 需转义以保持语义
    /[\s,，。！？.!?\-—:：;；()（）\[\]【】""''`'""''<>《》~～·]+/
  );

  for (const seg of segments) {
    if (!seg) continue;
    // 英文/数字单词直接加入
    if (/^[a-zA-Z0-9]+$/.test(seg)) {
      tokens.push(seg);
      continue;
    }
    // 中文按 2-gram 切分
    for (let i = 0; i < seg.length - 1; i++) {
      tokens.push(seg.slice(i, i + 2));
    }
    // 也加入 3-gram（提高匹配精度）
    for (let i = 0; i < seg.length - 2; i++) {
      tokens.push(seg.slice(i, i + 3));
    }
  }

  return tokens;
}

/**
 * 在文档块中检索匹配段落
 *
 * @param documents 文档列表（含 chunks）
 * @param keywords 关键词列表
 * @param maxResults 最大结果数（默认 3）
 */
export function retrieveChunks(
  documents: DataBankDocument[],
  keywords: string[],
  maxResults: number = DEFAULT_RAG_CONFIG.maxChunks
): RetrievedChunk[] {
  if (!keywords || keywords.length === 0 || !documents || documents.length === 0) {
    return [];
  }

  const results: RetrievedChunk[] = [];

  for (const doc of documents) {
    if (!doc.chunks || doc.chunks.length === 0) continue;

    for (const chunk of doc.chunks) {
      const matched: string[] = [];
      let score = 0;

      for (const keyword of keywords) {
        if (chunk.content.includes(keyword)) {
          matched.push(keyword);
          score++;
        }
      }

      if (score > 0) {
        results.push({
          chunk,
          documentName: doc.name,
          documentId: doc.id,
          score,
          matchedKeywords: matched,
        });
      }
    }
  }

  // 按得分降序排序（得分相同则按 chunk index 升序，保持原文顺序）
  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.chunk.index - b.chunk.index;
  });

  return results.slice(0, maxResults);
}

/**
 * 从对话历史提取关键词并检索文档块
 *
 * @param documents 文档列表
 * @param recentMessages 最近消息内容列表
 * @param config RAG 配置
 */
export function retrieveRelevantChunks(
  documents: DataBankDocument[],
  recentMessages: string[],
  config?: RAGConfig
): RetrievedChunk[] {
  const maxKeywords = config?.maxKeywords ?? DEFAULT_RAG_CONFIG.maxKeywords;
  const maxChunks = config?.maxChunks ?? DEFAULT_RAG_CONFIG.maxChunks;
  const recentCount = config?.recentMessageCount ?? DEFAULT_RAG_CONFIG.recentMessageCount;

  // P1-10：缓存命中直接返回（文档/消息不变时结果恒定）
  const cacheKey = `${docsFingerprint(documents)}::${recentMessages
    .slice(-recentCount)
    .join('\u0000')}`;
  const cached = retrieveCache.get(cacheKey);
  if (cached) return cached;

  // 取最近 N 条消息
  const messages = recentMessages.slice(-recentCount);
  const keywords = extractKeywords(messages, maxKeywords);

  const result = retrieveChunks(documents, keywords, maxChunks);

  // 写入缓存（容量上限，超限时淘汰最旧项）
  if (retrieveCache.size >= RETRIEVE_CACHE_MAX) {
    const oldestKey = retrieveCache.keys().next().value;
    if (oldestKey !== undefined) retrieveCache.delete(oldestKey);
  }
  retrieveCache.set(cacheKey, result);
  return result;
}

/**
 * 将检索结果构建为注入文本
 */
export function buildRagContext(retrieved: RetrievedChunk[]): string {
  if (!retrieved || retrieved.length === 0) return '';

  const parts = retrieved.map((r, i) => {
    return `[参考资料 ${i + 1}：${r.documentName}]\n${r.chunk.content}`;
  });

  return '[数据银行检索结果]\n' + parts.join('\n\n');
}
// i18n-ignore-end
