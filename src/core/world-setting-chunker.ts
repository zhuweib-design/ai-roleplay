/**
 * 世界设定分块 (需求 1:超 512 token 分块 + 元数据标题,检索优先标题+摘要)
 *
 * - chunkWorldSetting:按 token 预算(默认 512)切分世界设定文本;
 *   首块标题=原标题,续块标题=「原标题(续 N)」,块文本首行带标题(检索相似度偏向标题)
 * - 返回块结构含 meta.title / meta.chunkIndex,供 DualChannelRetriever.addStatic 直接入库
 */
import { countTokens } from './token-counter';
import { t } from '@/i18n';

export interface WorldSettingChunk {
  id: string;
  /** 块文本(首行 = 标题,检索命中偏向标题) */
  text: string;
  /** 块标题元数据 */
  title: string;
  /** 块序号(0 起) */
  index: number;
}

const DEFAULT_MAX_TOKENS = 512;

/**
 * 按 token 预算分块(段落级,超预算段落按句子再切)
 * @param docId 文档/条目 ID(世界书条目 id)
 * @param title 设定标题
 * @param text 设定正文
 * @param maxTokens 单块 token 上限(需求 1:512)
 */
export function chunkWorldSetting(
  docId: string,
  title: string,
  text: string,
  maxTokens = DEFAULT_MAX_TOKENS
): WorldSettingChunk[] {
  if (!text || typeof text !== 'string' || text.trim().length === 0) return [];

  // 按段落切分(双换行),再按句切分超长段落
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const chunks: WorldSettingChunk[] = [];
  let current: string[] = [];
  let currentTokens = 0;

  const flush = () => {
    if (current.length === 0) return;
    const index = chunks.length;
    const titleText = index === 0 ? title : t('chunk.continued', { title, index: index + 1 });
    const body = current.join('\n');
    chunks.push({
      id: `${docId}#${index}`,
      // 块文本首行带标题 → 检索时标题+摘要优先匹配(需求 1)
      text: `${titleText}\n${body}`,
      title: titleText,
      index,
    });
    current = [];
    currentTokens = 0;
  };

  for (const para of paragraphs) {
    const paraTokens = countTokens(para);
    // 单段落超预算:按句子切分
    if (paraTokens > maxTokens) {
      const sentences = para
        .split(/(?<=[。！？.!?])\s*|\n+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      for (const sentence of sentences) {
        const sTokens = countTokens(sentence);
        if (currentTokens + sTokens > maxTokens && current.length > 0) flush();
        // 单句仍超预算:强制按字符切(防死循环)
        if (sTokens > maxTokens) {
          const chars = Array.from(sentence);
          let sub = '';
          for (const c of chars) {
            if (countTokens(sub + c) > maxTokens && sub) {
              current.push(sub);
              flush();
              sub = c;
            } else {
              sub += c;
            }
          }
          if (sub) current.push(sub);
        } else {
          current.push(sentence);
          currentTokens += sTokens;
        }
      }
      continue;
    }
    // 普通段落:累积,超预算开新块
    if (currentTokens + paraTokens > maxTokens && current.length > 0) flush();
    current.push(para);
    currentTokens += paraTokens;
  }
  flush();
  return chunks;
}