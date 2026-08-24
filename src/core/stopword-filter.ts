/**
 * 停用词过滤 — 嵌入前剔除高频虚词,提升检索相似度
 *
 * 设计文档: docs/rag-enhancement-design.md §4
 *
 * 规则摘要(与设计 §4 一致):
 * - 剔除中英文纯虚词(the/a/的/了 等),保留否定词(不/没/别 等,防语义反转)
 * - 保护数字串(2024年/1000金币)与已知专名(灰烬之典/禁书阁)
 * - 可开关配置(aijiuguan.stopwordFilterEnabled,默认开),关闭时原样返回
 *
 * 实现取舍说明:
 * - 中文无空格分词,"中文专名保护"与"单字停用词剔除"天然冲突,
 *   故专名与数字采用"占位保护段"机制:tokenize 前把保护段整体替换为哨兵,
 *   过滤后还原,避免被拆字误删;白名单外的中文按单字保留(空格分隔,防并词漂移)。
 * - 输出契约:中文单字空格分隔、英文按词空格分隔、专名/数字整体保留。
 */
// i18n-ignore-start  // 停用词表/专名白名单为语言数据, 非 UI 文案(待翻译)
export interface StopwordFilterOptions {
  /** 是否启用(默认 true) */
  enabled?: boolean;
  /** 是否保留否定词(默认 true,防语义反转) */
  keepNegations?: boolean;
  /** 额外停用词(合并进内置表) */
  extra?: string[];
  /** 额外专名(整体保留) */
  extraProperNouns?: string[];
}

const ENABLE_KEY = 'aijiuguan.stopwordFilterEnabled';

export function isStopwordFilterEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLE_KEY) !== '0';
  } catch {
    return true;
  }
}

export function setStopwordFilterEnabled(on: boolean): void {
  try {
    if (on) localStorage.setItem(ENABLE_KEY, '1');
    else localStorage.setItem(ENABLE_KEY, '0');
  } catch {
    /* 环境无 localStorage:静默 */
  }
}

/** 英文纯虚词 */
const EN_STOPWORDS = new Set([
  'the', 'a', 'an', 'of', 'is', 'are', 'was', 'were', 'in', 'on', 'at', 'to',
  'and', 'for', 'with', 'as', 'it', 'this', 'that', 'i', 'you', 'he', 'she',
  'we', 'they', 'me', 'my', 'your', 'do', 'does', 'did', 'be', 'been', 'am',
  'him', 'her', 'then', 'just', 'really', 'very', 'so', 'but',
]);

/** 中文纯虚词(设计 §4.2) */
const ZH_STOPWORDS = new Set([
  '的', '了', '是', '在', '和', '与', '也', '都', '就', '还', '又',
  '被', '把', '这', '那', '它', '其', '及', '或', '之',
]);

/** 否定词(保命,一律不剔) */
const NEGATIONS = new Set([
  '不', '没', '别', '非', '无', '不是', '没有',
  'not', 'no', 'never', 'none', 'nothing',
]);

/** 内置专名白名单(整体保留,不被内部停用词拆散) */
const PROPER_NOUNS = new Set([
  '灰烬之典', '禁书阁', '圣光', '幽暗森林', '南境都城', '古神教', '灰烬之主',
]);

/** 数字段:阿拉伯数字(可含小数/千分位) + 白名单单位(不贪婪吞中文) */
const DIGIT_RE = /\d[\d.,，]*(?:金币|[年月日度位个只枚万元亿角分点])?/;

/** 中文单字判定 */
const ZH_CHAR = /[\u4e00-\u9fff]/;
/** 标点(剥离) */
const PUNCT = /[。，、！？；：“”‘’（）《》【】.,!?;:'()()[\]{}\s]/;

/** 保护段哨兵前缀(字母,避免被切分) */
const PH = 'zpn';

/**
 * 文本清洗:折叠空白、剥离首尾标点、英文小写
 */
function clean(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[\s。，、！？；“”‘’.,!?;'"()()[\]{}\u4e00-\u9fff]+/, (m) => (m.includes(' ') ? m.replace(/^[\s。，、！？；“”‘’.,!?;'"()()[\]{}]+$/, '').replace(/^\s/, '') : m))
    .toLowerCase();
}

/**
 * 保护段替换:把专名与数字段整体替换为哨兵(zpn{idx}),存入 map,
 * 过滤后按哨兵还原。避免专名/数字在分词阶段被拆开误删。
 */
function protectSegments(text: string, properNouns: ReadonlySet<string>, map: string[]): string {
  let out = text;

  // 1. 数字段(先保护,避免哨兵被后续贪婪正则误吞)
  out = out.replace(DIGIT_RE, (m) => {
    const idx = map.length;
    map.push(m);
    return `${PH}${idx}`;
  });

  // 2. 专名(长→短,避免子串抢占)
  const nouns = [...properNouns].sort((a, b) => b.length - a.length);
  for (const n of nouns) {
    const idx = map.length;
    const replaced = out.split(n).join(`${PH}${idx}`);
    if (replaced !== out) {
      map.push(n);
      out = replaced;
    }
  }

  return out;
}

/**
 * 切分为词/单字 token:中文单字、英文按空白/标点切词、哨兵整体、
 */
function tokenize(text: string): string[] {
  const out: string[] = [];
  const parts = text.split(/([\u4e00-\u9fff，。、！？；：“”‘’（）《》【】])|(\s+)/).filter((x) => x && x.length > 0);
  for (const part of parts) {
    if (ZH_CHAR.test(part)) {
      for (const ch of part) out.push(ch);
    } else if (part.startsWith(PH) && /^zpn\d+$/.test(part)) {
      out.push(part);
    } else {
      for (const word of part.split(/(?<=\w)(?=\W)|(?<=\W)(?=\w)/).filter((x) => x && x.length > 0)) {
        if (/^[a-z0-9_]+$/.test(word)) out.push(word);
        else for (const ch of word) if (!PUNCT.test(ch)) out.push(ch.toLowerCase());
      }
    }
  }
  return out;
}

/**
 * 过滤停用词
 * @param text 原始文本
 * @param opts 选项
 */
export function filterStopwords(text: string, opts?: StopwordFilterOptions): string {
  if (opts?.enabled === false) return text;
  if (!isStopwordFilterEnabled()) return text;
  const keepNegations = opts?.keepNegations !== false;
  const extra = new Set(opts?.extra ?? []);
  const properNouns = new Set([...PROPER_NOUNS, ...(opts?.extraProperNouns ?? [])]);
  if (text.length === 0) return text;

  const cleaned = clean(text);
  const phMap: string[] = [];
  const withPh = protectSegments(cleaned, properNouns, phMap);
  const tokens = tokenize(withPh);

  const kept: string[] = [];
  for (const tk of tokens) {
    // 哨兵(专名/数字保护段) → 还原保留
    if (/^zpn\d+$/.test(tk)) {
      const i = Number(tk.slice(PH.length));
      if (phMap[i] !== undefined) kept.push(phMap[i]!);
      continue;
    }
    // 否定词 → 保留(保命); 若显式关闭则剔除
    if (NEGATIONS.has(tk)) {
      if (keepNegations) kept.push(tk);
      continue;
    }
    // 停用词(内置+额外) → 剔除
    if (ZH_STOPWORDS.has(tk) || EN_STOPWORDS.has(tk) || extra.has(tk)) continue;
    // 实义词 → 保留
    kept.push(tk);
  }
  return kept.join(' ');
}
// i18n-ignore-end