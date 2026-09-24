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
/**
 * 情绪词表（规则标注器用）
 *
 * 2026-09-22 扩充：原表仅 24 词，且**遗漏了最常用的口语情绪词** ——
 * "开心""难过""害怕""生气""惊讶"全都不在，而"愤懑""释然"在。
 * 后果是真实对话中 `detectEmotion` 大面积返回 null → 情绪状态不更新 →
 * 长期停滞在偶然命中的某个旧标签上（详见交付总结的遗留项分析）。
 *
 * ⚠️ 收录约定：**只收双字及以上词**。
 * `detectEmotion` 用 `includes` 做子串匹配，单字词（如"累""怒"）会误命中
 * "积累""怒斥"等无关词，反而制造噪声。
 */
export const EMOTION_WORDS = new Set([
  // 基本情绪（口语高频）
  '开心', '高兴', '快乐', '难过', '伤心', '悲伤', '害怕', '恐惧',
  '惊恐', '生气', '愤怒', '恼火', '惊讶', '吃惊', '惊喜', '厌恶',
  // 焦虑 / 不安
  '焦虑', '紧张', '不安', '忐忑', '慌乱', '烦躁', '心烦', '忧虑',
  '发愁', '纠结', '犹豫', '迷惘', '困惑',
  // 低落 / 痛苦
  '沮丧', '郁闷', '压抑', '忧郁', '痛苦', '心酸', '揪心', '委屈',
  '愧疚', '羞耻', '尴尬', '孤独', '无助', '绝望', '崩溃', '麻木',
  // 正向 / 温暖
  '温暖', '甜蜜', '幸福', '欣慰', '满足', '安心', '放松', '平静',
  '释然', '释怀', '感动', '心疼', '温柔', '期待', '兴奋', '喜悦',
  // 复杂 / 其他
  '嫉妒', '无奈', '冷漠', '淡然', '坚定', '决绝', '骄傲', '愤懑',
  '苦涩', '失望', '思念', '眷恋',
]);

/**
 * 简单规则情绪标注(E-01 L0 情绪状态机用,纯确定性、无 LLM 依赖)
 * 扫描情绪词,返回首个命中词作为情绪标签;无命中返回 null。
 */
/**
 * 规则情绪标注：返回文本中**最后出现**的情绪词
 *
 * 2026-09-22 修正首命中逻辑。旧实现是：
 *
 * ```ts
 * for (const w of EMOTION_WORDS) if (text.includes(w)) return w;
 * ```
 *
 * 由于 `Set` 保持插入顺序，这等价于「按**词表顺序**取首个命中」——
 * "愤怒"永远压过"喜悦"，判定结果与文本内容无关，只看词表怎么排。
 *
 * 新实现取**文本中位置最靠后**的命中词，理由：情绪状态表达的是「**当前**」
 * 状态，而回复结尾的情绪最接近"此刻"。
 * 例：「他先是愤怒，然后逐渐平静下来。」→ 平静（而非愤怒）。
 *
 * @param text AI 回复原文
 * @returns 命中的情绪词；无命中返回 null（调用方据此**不更新**状态）
 */
export function detectEmotion(text: string): string | null {
  if (!text) return null;
  let last: string | null = null;
  let lastIndex = -1;
  for (const w of EMOTION_WORDS) {
    const idx = text.lastIndexOf(w);
    if (idx > lastIndex) {
      lastIndex = idx;
      last = w;
    }
  }
  return last;
}

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

  // 2. 状态性旁白:包含动作动词时优先归入可精简类别。
  // 情绪词仍会由 protect() 保护；这样「犹豫后放下杯子」不会因一个情绪词
  // 被误判为纯情绪旁白，但真正的情绪描写仍会落入下一分支。
  if (META_VERBS.some((v) => text.includes(v))) {
    return 'meta_narration';
  }

  // 3. 情绪/氛围旁白:命中情绪词(硬豁免)
  if (hasAnyWord(EMOTION_WORDS, text)) {
    return 'emotion_narration';
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
