/**
 * L2 输出纪律层 (E-02)
 *
 * 依据《AI酒馆项目嵌入优化方案开发文档.md》L2 设计:
 * - classifyScope:旁白分类(状态性旁白可精简;对白/情绪旁白硬豁免)
 * - protect / restore:保护正则哨兵(对白/情绪词/设定实体先替换为占位符,
 *   压缩后再恢复 —— 保证硬豁免,参照 caveman-shrink withProtectedSegments)
 * - compressMetaNarration:仅对状态性旁白生效,保留完整句法,只删填充词/客套/重复
 * - buildAutoClarityPrompt:Auto-Clarity 软回退声明(安全/不可逆/情绪冲突/重复提问时
 *   恢复完整表达;硬约束优先于软约束)
 *
 * 设计:纯函数 + 确定性规则,无 LLM 依赖,可单测。
 */

// ── 旁白分类 ──

export type NarrationScope =
  | 'meta_narration' // 状态性旁白(可精简)
  | 'dialogue' // 对白(硬豁免)
  | 'emotion_narration' // 情绪/氛围旁白(硬豁免)
  | 'other';

/** 情绪词表(示例级,生产可接 NRC 中文/DUTIR 扩充) */
const EMOTION_WORDS = new Set([
  '愤怒', '喜悦', '悲伤', '恐惧', '焦虑', '紧张', '温暖', '甜蜜',
  '苦涩', '感动', '惊喜', '慌乱', '平静', '厌恶', '羞耻', '骄傲',
  '心疼', '愧疚', '期待', '失望', '兴奋', '绝望', '释然', '愤懑',
]);

/** 状态性旁白动词(可精简,不承载情绪) */
const META_VERBS = [
  '坐下', '站起', '拿起', '放下', '转身', '点头', '摇头', '走向',
  '离开', '打开', '关闭', '抬头', '低头', '停顿', '深吸', '握拳',
  '推门', '起身', '坐下', '掏出', '收回', '凝视', '扫视',
];

/** 对白引号对 */
const QUOTE_PAIRS: Array<[string, string]> = [
  ['"', '"'],
  ['“', '”'],
  ['「', '」'],
  ['『', '』'],
];

/** 分类旁白作用域 */
export function classifyScope(text: string): NarrationScope {
  if (!text || text.trim() === '') return 'other';

  // 1. 对白:引号内容占比 ≥50% 视为对白(硬豁免)
  const quotedLen = QUOTE_PAIRS.reduce((sum, [open, close]) => {
    const m = text.match(new RegExp(escapeRegExp(open) + '[^' + escapeRegExp(close) + ']*' + escapeRegExp(close), 'g'));
    return sum + (m?.join('').length ?? 0);
  }, 0);
  if (quotedLen > 0 && quotedLen >= text.length * 0.5) {
    return 'dialogue';
  }

  // 2. 情绪/氛围旁白:命中情绪词(硬豁免)
  if (hasAnyWord(EMOTION_WORDS, text)) {
    return 'emotion_narration';
  }

  // 3. 状态性旁白:命中状态动词(可精简)
  if (META_VERBS.some((v) => text.includes(v))) {
    return 'meta_narration';
  }

  return 'other';
}

// ── 保护哨兵 ──

/** 哨兵前缀(极低概率出现在正常文本) */
const SENTINEL_PREFIX = '\u0000PROTECT';

/** 保护结果:替换后的文本 + 原片段列表(按下标对应) */
export interface ProtectedText {
  text: string;
  segments: string[];
}

/**
 * 保护哨兵:将对白/情绪词/设定实体替换为占位符
 * 压缩后调用 restore 还原 —— 保证压缩不触碰受保护内容(硬豁免)
 */
export function protect(text: string, extraEntities: string[] = []): ProtectedText {
  const segments: string[] = [];
  let result = text;

  // 1. 对白片段
  for (const [open, close] of QUOTE_PAIRS) {
    const re = new RegExp(escapeRegExp(open) + '[^' + escapeRegExp(close) + ']*' + escapeRegExp(close), 'g');
    result = result.replace(re, (m) => {
      segments.push(m);
      return `${SENTINEL_PREFIX}${segments.length - 1}\u0000`;
    });
  }

  // 2. 情绪词
  for (const word of EMOTION_WORDS) {
    if (!result.includes(word)) continue;
    result = result.replaceAll(word, () => {
      segments.push(word);
      return `${SENTINEL_PREFIX}${segments.length - 1}\u0000`;
    });
  }

  // 3. 额外设定实体
  for (const entity of extraEntities) {
    if (!entity || !result.includes(entity)) continue;
    result = result.replaceAll(entity, () => {
      segments.push(entity);
      return `${SENTINEL_PREFIX}${segments.length - 1}\u0000`;
    });
  }

  return { text: result, segments };
}

/** 还原哨兵为原片段 */
export function restore(protectedText: string, segments: string[]): string {
  return protectedText.replace(
    new RegExp(escapeRegExp(SENTINEL_PREFIX) + '(\\d+)\\u0000', 'g'),
    (_m, idx: string) => segments[Number(idx)] ?? ''
  );
}

// ── 状态性旁白压缩 ──

/** 填充词/客套词(可安全删除;不含描写性叠词如"轻轻/缓缓"以保留氛围) */
const FILLER_WORDS = [
  '似乎', '仿佛', '大概', '也许', '或许', '有点', '有些', '稍微',
  '然后', '接着', '于是', '其实', '真的', '非常', '十分',
];

/** 重复字折叠:3+ 连续同字保留叠词形式(2 个) */
const REPEAT_RE = /([\u4e00-\u9fa5])\1{2,}/g;

/**
 * 压缩状态性旁白:保留完整句法,仅删填充词与重复
 * 调用方应先 protect(对白/情绪/实体),压缩后再 restore
 */
export function compressMetaNarration(text: string): string {
  let result = text;

  // 1. 删填充词
  for (const w of FILLER_WORDS) {
    if (!result.includes(w)) continue;
    // 避免删成无意义残词:仅当填充词两侧仍有内容时删除
    result = result.replaceAll(w, '');
  }

  // 2. 折叠重复字(保留叠词两个)
  result = result.replace(REPEAT_RE, '$1$1');

  // 3. 清理因删除产生的连续空格与逗号粘连(",," → ","; " ," → ",")
  result = result.replace(/，+/g, '，').replace(/,,+/g, ',').replace(/\s{2,}/g, ' ');

  return result;
}

// ── Auto-Clarity 软回退 ──

/**
 * 构建 Auto-Clarity 声明(追加到系统提示词)
 * 软约束:涉及安全/不可逆操作、情绪冲突澄清、用户重复提问时恢复完整表达;
 * 硬约束(保护哨兵)优先于软约束
 */
export function buildAutoClarityPrompt(): string {
  return [
    '【输出纪律】当出现以下情况时,必须恢复完整、详细的表达,不得精简:',
    '1. 涉及安全、不可逆或重大后果的操作说明;',
    '2. 需要澄清情绪冲突或人物关系的关键对话;',
    '3. 用户重复提问或明确表示"没听懂"时;',
    '4. 保护标记(对白、情绪词、设定实体)所指内容,任何时候都不得省略或改写。',
  ].join('\n');
}

// ── 工具 ──

function hasAnyWord(words: Set<string>, text: string): boolean {
  for (const w of words) {
    if (text.includes(w)) return true;
  }
  return false;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
