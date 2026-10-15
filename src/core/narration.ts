// i18n-ignore-start  // 本文件面向模型的规则文本与标记符号，不是待翻译的 UI 文案
/**
 * 心理活动（旁白段）的标记、解析与提示词规则。
 *
 * 数据形状：模型在**同一条回复**里用成对符号夹出心理段，正文顺序是
 *   对白 → 心理 → 对白
 * 例：`你先坐一下。\n⟦沈知微有点紧张的看着我，指尖在杯沿上轻轻敲了两下。⟧\n水刚烧上。`
 *
 * 为什么选 ⟦ （U+27E6 / U+27E7）这两个**单字符**标记：
 * 1. 单字符 ⇒ 流式不存在"半个标签"问题（多字符标签要留缓冲，见
 *    `thinking-parser.ts` 的 `longestSuffixPrefixLen`，这里整段用不上）；
 * 2. 中文小说正文里几乎不会出现，也不会与 `<think>` / `<status>` 这两层
 *    既有解析撞车（正文在进 content 前已经被它们各剥一遍）；
 * 3. 不是尖括号 ⇒ 不会被任何 HTML sanitizer 当成标签吃掉。
 *
 * 标记**保留在 `msg.content` 里**（不另开字段）。这样做的三个理由：
 * - 历史回灌给模型时天然带着格式示范，比只写禁令的遵从率高；
 * - 持久化、重新生成、窗口化渲染都不用改；
 * - 顺序信息不会丢（若拆成 speech/narration 两个字段，"对白-心理-对白"
 *   会变成"两段对白拼一起 + 一段心理"，位置就错了）。
 * 代价是凡是"直接读 content 原文"的旁路（复制 / 朗读 / 翻译 / 导出）
 * 都必须先过 `stripNarrationMarkers`。
 */

export const NARRATION_OPEN = '⟦';
export const NARRATION_CLOSE = '⟧';

/** 心理段的人称视角：用户在旁白里被称作「我」还是「你」 */
export type NarrationPerspective = 'me' | 'you';

export const NARRATION_PERSPECTIVES: readonly NarrationPerspective[] = ['me', 'you'] as const;

/** 读档归一：脏值/缺省一律回落到 'me'（与最初的需求口径一致） */
export function normalizeNarrationPerspective(value: unknown): NarrationPerspective {
  return NARRATION_PERSPECTIVES.includes(value as NarrationPerspective)
    ? (value as NarrationPerspective)
    : 'me';
}

export interface NarrationSegment {
  kind: 'speech' | 'psy';
  text: string;
}

/**
 * 把一条回复切成有序分段。宽容解析，任何输入都不抛错：
 * - 没有标记 ⇒ 一整段 speech（模型不守规矩时与改造前完全一致）；
 * - 只开了头没闭 ⇒ 尾巴按 psy 渲染（用户已经明确看到"接下来是心理"，
 *   且流式过程中它会长出来，比先当对白再翻转成旁白稳）；
 * - 落单的闭符号 ⇒ 当普通字符丢掉，不改变归属；
 * - 空段（相邻两标记之间没字）⇒ 不产出，避免渲染出空的竖线行。
 */
export function parseNarrationSegments(text: string): NarrationSegment[] {
  const out: NarrationSegment[] = [];
  if (!text) return out;

  let rest = text;
  let inPsy = false;

  const push = (kind: 'speech' | 'psy', raw: string) => {
    if (!raw) return;
    const last = out[out.length - 1];
    // 同类型的相邻段合并，保证渲染出来的气泡数不随"模型把闭符号漏了几次"而抖动
    if (last && last.kind === kind) last.text += raw;
    else out.push({ kind, text: raw });
  };

  while (rest) {
    const markerIndex = rest.search(/[⟦⟧]/);
    const head = markerIndex < 0 ? rest : rest.slice(0, markerIndex);
    push(inPsy ? 'psy' : 'speech', head);
    if (markerIndex < 0) break;
    const marker = rest[markerIndex]!;
    rest = rest.slice(markerIndex + 1);
    if (marker === NARRATION_OPEN) {
      // 已经在心理段里又见到开符号：当作普通字符，不套两层
      if (inPsy) push('psy', marker);
      else inPsy = true;
    } else {
      // 落单的闭符号：丢掉符号本身，后面的内容归对白
      inPsy = false;
    }
  }
  return out;
}

/** 去掉成对符号但保留全部文字（复制 / 朗读 / 翻译 / 导出走这条） */
export function stripNarrationMarkers(text: string): string {
  if (!text) return text;
  return text.replaceAll(NARRATION_OPEN, '').replaceAll(NARRATION_CLOSE, '');
}

/**
 * 注入给模型的「叙事格式」规则段。
 *
 * 视角切换只改**指代用户的那个代词**（我 / 你）与示例，其余约束（角色在旁白里
 * 不自称我、不写用户心理、1-3 句、不加标签）两种模式完全一致 —— 这也是把它做成
 * 一个函数而不是两份文案的原因：改一条规则不会漏改另一份。
 */
export function buildNarrationRules(
  perspective: NarrationPerspective,
  characterName: string
): string {
  const name = characterName || '角色';
  // 旁白里指代用户的那个代词
  const u = perspective === 'you' ? '你' : '我';
  // 反例始终是"角色在旁白里自称我"。给用户的指代词要跟着视角走，
  // 否则 'me' 模式下会写成「我…看着我」，读起来像笔误而不是反例。
  const counterExample =
    perspective === 'you'
      ? `${NARRATION_OPEN}我有点紧张的看着${u}。${NARRATION_CLOSE}`
      : `${NARRATION_OPEN}我有点紧张的看着他。${NARRATION_CLOSE}`;

  return [
    '[叙事格式]',
    '每次回复按"一段你说的话 — 一段你的心理 — 一段你说的话"来组织。',
    `心理写在成对符号 ${NARRATION_OPEN} ${NARRATION_CLOSE} 之间，夹在那两段话中间；不加引号，不写"心理："这类标签。`,
    `旁白用${perspective === 'you' ? '第二人称' : '用户的第一人称'}视角叙述：「${u}」指用户，也就是正在和你对话的人。`,
    `旁白里提到你自己时一律用名字「${name}」（或"她/他"），不得自称「我」。`,
    `不得描写用户（「${u}」）的心理、情绪或想法，那由用户自己表达。`,
    `旁白写 1 到 3 句，写「${name}」当下的情绪、动作、视线、迟疑，像小说旁白。`,
    '标记之外的对白里，你可以照常自称「我」。',
    '不要在旁白里重复你已经说出口的内容。',
    '',
    '示例：',
    '你先坐一下。',
    `${NARRATION_OPEN}${name}有点紧张的看着${u}，指尖在杯沿上轻轻敲了两下。${NARRATION_CLOSE}`,
    '水刚烧上，马上就好。',
    '',
    '反例（错误：角色在旁白里自称「我」）：',
    counterExample,
  ].join('\n');
}
// i18n-ignore-end
