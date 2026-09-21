/**
 * 三层对话优化 · 效果评估脚本 (opt-eval)
 *
 * 用途：为 L0 上下文结构层 / L1 内容压缩层 / L2 输出纪律层的优化效果
 * 提供**可复跑、可对比、可接入 CI** 的量化测量，替代开发文档 §1.2 中
 * 「承诺了但无法验证」的指标。
 *
 * 设计原则（务必遵守）：
 * - **只测量，不修改**：脚本不改动 `src/` 下任何业务代码，只读取并调用其导出。
 * - **数字必须真实**：所有指标均由本次运行实测得出；测不了的指标一律标注
 *   `requires-real-env`，**禁止估算或编造**。
 * - **可复跑**：样本内置且确定性（无随机、无时间依赖），同一份代码多次运行
 *   结果一致（耗时类指标除外）。
 *
 * 运行方式：
 *   node scripts/opt-eval.mjs                    # 跑离线指标，输出人类可读摘要
 *   node scripts/opt-eval.mjs --json             # 额外输出结构化 JSON
 *   node scripts/opt-eval.mjs --out artifacts/opt-eval.json
 *   node scripts/opt-eval.mjs --save-baseline    # 把本次结果存为基线
 *   node scripts/opt-eval.mjs --compare          # 与基线对比，输出增减
 *   node scripts/opt-eval.mjs --strict           # 有离线门禁不达标即退出码 1
 *   node scripts/opt-eval.mjs --with-api         # 额外尝试真实 LLM 环境探针
 *
 * 退出码：0 = 完成（--strict 下表示门禁全通过）；1 = 门禁失败或运行出错。
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

// ─────────────────────────────────────────────────────────────
// 常量与阈值（来源：docs/design/AI酒馆项目嵌入优化方案开发文档.md §1.2）
// ─────────────────────────────────────────────────────────────

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');
const ARTIFACTS_DIR = path.join(PROJECT_ROOT, 'artifacts');
const BUNDLE_PATH = path.join(ARTIFACTS_DIR, 'opt-eval-bundle.mjs');
const BASELINE_PATH = path.join(ARTIFACTS_DIR, 'opt-eval-baseline.json');

/** 语义校验阈值（文档 §1.2：实体/情绪保留率 ≥0.9，关键实体 1.0） */
const THRESHOLD_ENTITY_RATE = 0.9;
/** 情绪词保留率目标（文档 §1.2：≥95%） */
const THRESHOLD_EMOTION_RETENTION = 0.95;
/** 压缩管线单次耗时上限（文档 §1.2：≤100ms，不含 LLM 摘要） */
const THRESHOLD_PIPELINE_MS = 100;
/** L0 前缀段字节稳定率目标（文档 §1.2：100%） */
const THRESHOLD_PREFIX_STABILITY = 1.0;
/** 文档 §1.2 的 token 节省目标区间（仅作参考，见下方说明） */
const TARGET_SAVING_RANGE = { min: 0.2, max: 0.4 };

/** L1 默认目标压缩比（与 optimization-pipeline.runL1 默认值一致） */
const DEFAULT_TARGET_RATIO = 0.6;
/** 耗时采样重复次数 */
const PERF_REPEATS = 20;
/** 前缀稳定性采样次数 */
const PREFIX_REPEATS = 50;

// ─────────────────────────────────────────────────────────────
// TS 模块加载（esbuild 打包 → 动态 import）
//
// 项目源码是 TypeScript 且带 `@` 路径别名，纯 Node 无法直接 import。
// 项目未安装 tsx / vite-node，故复用 vite 自带的 esbuild 把待测模块
// 打成一份临时 ESM bundle 放到 artifacts/（已被 gitignore），再动态导入。
// 这样既不新增依赖，也不改动 src/。
// ─────────────────────────────────────────────────────────────

/** 需要暴露给评估脚本的待测导出（只取值导出，避免 TS 类型导出冲突） */
const BUNDLE_ENTRY_LINES = [
  "export { extractiveCompress, validateCompression, decideCompression, isExempt, splitSentences, CcrStore, SOFT_THRESHOLD, HARD_THRESHOLD, COOLDOWN_ROUNDS, MAX_CONSECUTIVE_FAILURES } from './src/core/compression';",
  "export { EMOTION_WORDS, detectEmotion, classifyScope, protect, restore, compressMetaNarration, buildAutoClarityPrompt } from './src/core/output-discipline';",
  "export { OptimizationPipeline, createDefaultConfig, compressMessages, MIN_COMPRESS_LENGTH } from './src/core/optimization-pipeline';",
  "export { applyOutputDiscipline, applyL0Context, updateEmotionState } from './src/core/l0-l2-runtime';",
  "export { MemoryStore, CharacterRegistry, EmotionTracker, textSha256 } from './src/core/memory-store';",
  "export { countTokens, countMessageTokens } from './src/core/token-counter';",
  "export { estimateMessagesTokens } from './src/core/summarizer';",
].join('\n');

/**
 * 打包并加载 src/core 待测模块
 * @returns {Promise<Record<string, any>>} 模块导出集合
 */
async function loadCoreModules() {
  const result = await esbuild.build({
    stdin: {
      contents: BUNDLE_ENTRY_LINES,
      resolveDir: PROJECT_ROOT,
      sourcefile: 'opt-eval-entry.ts',
      loader: 'ts',
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    // vue / gpt-tokenizer 走 Node 原生解析，避免打进 bundle（体积与兼容）
    external: ['vue', 'gpt-tokenizer'],
    alias: { '@': path.join(PROJECT_ROOT, 'src') },
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'silent',
  });

  if (!fs.existsSync(ARTIFACTS_DIR)) {
    fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  }
  fs.writeFileSync(BUNDLE_PATH, result.outputFiles[0].text, 'utf8');
  return import(pathToFileURL(BUNDLE_PATH).href);
}

// ─────────────────────────────────────────────────────────────
// 样本数据（内置、确定性、中文角色扮演长会话）
//
// 场景：翡翠酒馆老板娘「绯」与逃亡「旅人」的初遇 → 追兵 → 离别。
// 内容刻意混合四类文本，以便分别测量：
//   1. 对白（引号包裹，L2 硬豁免）
//   2. 情绪/氛围旁白（命中 EMOTION_WORDS，L2 硬豁免）
//   3. 状态性旁白（META_VERBS 且含填充词，L2 可精简）
//   4. 世界观/设定实体句（L1 显著性加分 + 实体保留校验）
// ─────────────────────────────────────────────────────────────

/** 设定实体（显著性加分 + 实体保留率校验分母） */
const SAMPLE_ENTITIES = [
  '绯', '旅人', '翡翠森林', '灰烬教会', '翡翠酒馆',
  '白桦镇', '卡尔', '老雷', '溪木村', '哨塔',
];
/** 关键实体（必须 100% 保留，否则压缩回退） */
const SAMPLE_CRITICAL_ENTITIES = ['绯', '灰烬教会'];

/** 脚本 A：酒馆初遇 → 委托（36 行） */
const SCRIPT_A = [
  '夜色像一块被雨水浸透的绒布，翡翠酒馆的木门被推开时，门轴发出低哑的呻吟。',
  '绯抬起头，烛火在她琥珀色的瞳孔里晃了一下，随即又归于平静。',
  '“欢迎光临。”她说，声音里带着一种见惯了风雨的疲惫。',
  '她放下手中的酒杯，转身走向吧台后面的酒架。',
  '“这么晚还赶路，旅人，你身上有灰烬教会的味道。”',
  '旅人愣了一下，随即苦涩地笑了笑。“我刚从北边的哨塔逃出来。”',
  '绯的手停顿在半空，眼神里闪过一丝惊讶。',
  '她缓缓放下酒瓶，深吸一口气，像是在压下某种翻涌的记忆。',
  '“灰烬教会的人追得很紧。”她低声说，语气里第一次出现了紧张。',
  '“他们三天前烧了溪木村，我是唯一的幸存者。”旅人的声音在颤抖。',
  '绯沉默了很久，烛光把她的影子拉得很长，她的眼神里有一种说不清的悲伤。',
  '她终于开口：“那你更不能留在这里，这会连累整条街的人。”',
  '旅人握紧拳头，指节发白。“我只是想找一个能睡觉的地方。”',
  '绯看着他，心里涌起一阵难以名状的心疼。',
  '她转身从柜台下取出一把旧钥匙，放在吧台上。',
  '“后院有个储藏室，堆满了酒桶，谁也不会去翻。”',
  '旅人盯着那把钥匙，眼眶突然有些发热。',
  '“为什么帮我？”他的声音很轻。',
  '绯没有回答，只是低头擦拭着已经很干净的杯壁。',
  '“我年轻时也逃过一次。”过了很久她才说，语气里带着久远的温暖。',
  '“那时候带我走的人，叫老雷，他是个酒鬼，也是个好人。”',
  '旅人接过钥匙，指尖碰到她手背时，两人都停顿了一瞬。',
  '绯收回手，转身走向酒架，背影在烛光里显得格外单薄，让人莫名感动。',
  '“天亮前离开，别走大路，走翡翠森林的西缘。”',
  '“那里有灰烬教会的巡林队吗？”旅人问道。',
  '“没有，那里有更糟的东西。”绯的声音很平静。',
  '窗外的雨更大了，屋檐的水滴落在石阶上，节奏单调而固执。',
  '绯抬头看了一眼墙上的旧地图，那是她父亲留下的。',
  '“如果你真的要去北境，先去白桦镇找一个铁匠。”',
  '“他叫卡尔，欠我一条命，他会给你一把能用的剑。”',
  '旅人点头，把钥匙小心地收进怀里。',
  '绯从吧台下又拿出一小袋干粮，推到他面前。',
  '“别谢我。”她抢在他开口前说。',
  '旅人笑了，这是他今晚第一次笑，带着一点释然。',
  '绯也笑了，只是那笑意没有到达眼底。',
  '“去吧。如果有一天你经过这里，记得告诉我老雷的坟还在不在。”',
];

/** 脚本 B：追兵 → 离别（36 行） */
const SCRIPT_B = [
  '后半夜，酒馆外传来马蹄声，整齐得像是用尺子量过。',
  '绯吹灭了大部分蜡烛，只留下吧台上的一盏。',
  '“别出声。”她压低声音，手已经摸到了柜台下的短刀。',
  '旅人屏住呼吸，心脏跳得几乎要撞破胸腔。',
  '门被推开，三个披着灰袍的人走了进来，斗篷上绣着燃烧的荆棘。',
  '“老板娘，我们找一个从哨塔逃出来的人。”为首的人说。',
  '绯擦着杯子，头也不抬。“这地方什么人都来，我记不清脸。”',
  '灰袍人走近一步，烛火在他脸上投下深深的阴影。',
  '“你会记清的，如果你还想开这间店。”他的语气很温和，却让人恐惧。',
  '绯的手指微微收紧，指腹压在杯壁上发出细微的声响。',
  '“三杯麦酒，一杯一个铜板。”她说。',
  '灰袍人盯着她看了很久，终于笑了。“有意思。”',
  '三人喝完酒，翻身上马，马蹄声渐渐消失在雨里。',
  '绯等了很久，才把短刀放回柜台下面。',
  '她的手在抖，不是因为害怕，而是因为愤怒。',
  '“他们不会走远。”她低声说，声音里压着愤懑。',
  '旅人从储藏室里出来，脸色苍白，眼里还有未散的慌乱。',
  '“我得走了，不能把你卷进来。”',
  '绯摇头，语气里有一种少见的固执，还掺着一点失望。“现在走就是送死。”',
  '她从墙上取下那张旧地图，铺在吧台上。',
  '“看这里，翡翠森林的西缘有一条猎人小道。”',
  '“这条路不在任何一张官道上，灰烬教会的人不知道。”',
  '旅人凑近地图，闻到了她身上淡淡的酒气和木香。',
  '绯指着地图上的一处标记：“这里有个废弃的守林人小屋。”',
  '“里面有火种和干柴，你先躲两天。”',
  '旅人看着她，突然感到一阵强烈的愧疚。',
  '“如果我没来，你不会有这些麻烦。”',
  '绯抬起头，眼神里有种意外的温柔。',
  '“我开这间店，就是为了给走投无路的人留一盏灯。”',
  '旅人沉默了，喉咙像是被什么堵住。',
  '绯把地图折好，塞进他手里，动作很轻，却不容拒绝。',
  '“两天后的黄昏，我会去小屋看你。”她的声音里有一点点期待。',
  '“如果我不来，你就一直往北走，别回头。”',
  '旅人点点头，把地图和钥匙放在一起。',
  '绯送他到后门，雨已经小了，天边泛起一点灰白。',
  '“活着到北境。”她说完，关上了门。',
];

/**
 * L2 输出纪律专用：纯状态性旁白（L2 的设计目标文本）
 * 约束：含 META_VERBS 之一 + 含 FILLER_WORDS，且不含引号与情绪词，
 * 以便准确测量「L2 在其目标作用域上的削减幅度」。
 */
const META_NARRATION_LINES = [
  '她似乎有些犹豫，然后放下手中的酒杯，接着转身走向吧台后面的酒架。',
  '绯好像非常疲惫，于是缓缓抬头，其实只是想确认来人是谁。',
  '他稍微停顿了一下，然后推开门走了进来，大概有点拿不准。',
  '她仿佛十分在意那封信，真的反复看了好几遍，然后放下信纸。',
  '绯也许有些犹豫，接着把地图收了起来，其实她本来想多说几句。',
  '旅人似乎非常饥饿，于是拿起干粮，接着大口吃了起来。',
  '她好像稍微放松了一点，然后坐下，其实并没有睡着。',
  '他似乎真的有点迟疑，接着后退半步，然后转身又停住了。',
  '绯仿佛十分专注，于是低头慢慢擦着杯子，其实手指在微微发抖。',
  '她大概有些在意，稍微整理了一下头发，然后抬头望向门口。',
];

/** 世界观/设定常驻事实（standing，用于 L0 前缀与豁免黑名单） */
const STANDING_FACTS = [
  { id: 'char-session-eval', scope: 'standing', kind: 'character', body: '绯：翡翠酒馆老板娘，琥珀色瞳孔，父亲留下的旧地图挂在墙上；绝不主动出卖逃亡者。' },
  { id: 'world-session-eval', scope: 'standing', kind: 'world', body: '灰烬教会：以燃烧荆棘为纹章的武装教团，三天前焚毁溪木村；巡林队活动于北境官道。' },
];

/**
 * 构造 L1 压缩样本（长会话历史）
 * @returns {Array<{id: string, name: string, lines: string[], text: string, context: string, entities: string[], criticalEntities: string[]}>}
 */
function buildCompressionSamples() {
  const defs = [
    { id: 'short-18', name: '短会话(18句·初遇前半)', lines: SCRIPT_A.slice(0, 18) },
    { id: 'medium-36', name: '中会话(36句·初遇全篇)', lines: SCRIPT_A.slice(0, 36) },
    { id: 'long-72', name: '长会话(72句·全篇)', lines: [...SCRIPT_A, ...SCRIPT_B] },
    { id: 'long-60', name: '长会话(60句·追兵段起)', lines: [...SCRIPT_A.slice(6), ...SCRIPT_B] },
  ];
  return defs.map((d) => ({
    id: d.id,
    name: d.name,
    lines: d.lines,
    text: d.lines.join('\n'),
    // 相关性上下文：用最后一句模拟「最近消息/当前提问」
    context: d.lines[d.lines.length - 1],
    entities: SAMPLE_ENTITIES,
    criticalEntities: SAMPLE_CRITICAL_ENTITIES,
  }));
}

/**
 * 构造 L2 输出纪律样本（消息列表，最后一条为当前轮 user）
 * @returns {Array<{role: string, content: string}>}
 */
function buildDisciplineMessages() {
  const messages = [
    { role: 'system', content: '你是翡翠酒馆的老板娘绯。用中文回复，保持克制而温暖的语气。' },
  ];
  const pools = [
    ...SCRIPT_A.slice(0, 12),
    ...META_NARRATION_LINES,
    ...SCRIPT_B.slice(0, 12),
  ];
  for (let i = 0; i < pools.length; i++) {
    messages.push({ role: 'assistant', content: pools[i] });
    // 每隔一条插入一句 user，模拟真实交替（user 消息不参与 L2 精简）
    if (i % 2 === 0) {
      messages.push({ role: 'user', content: '（旅人沉默地看着她）' });
    }
  }
  // 当前轮 user（最后一条，豁免）
  messages.push({ role: 'user', content: '“那我天亮前就走。”' });
  return messages;
}

/** 构造 L1 消息列表压缩样本（含 system / 长历史 / 当前轮 user） */
function buildMessageCompressInput() {
  return [
    { role: 'system', content: '你是翡翠酒馆的老板娘绯。用中文回复。' },
    { role: 'assistant', content: SCRIPT_A.slice(0, 18).join('\n') },
    { role: 'user', content: '（旅人握紧了拳头，没有说话）' },
    { role: 'assistant', content: SCRIPT_A.slice(18).join('\n') },
    { role: 'user', content: '（旅人低头看着那把钥匙）' },
    { role: 'assistant', content: SCRIPT_B.slice(0, 18).join('\n') },
    { role: 'user', content: '（旅人屏住呼吸）' },
    { role: 'assistant', content: SCRIPT_B.slice(18).join('\n') },
    { role: 'user', content: '“那我天亮前就走。”' },
  ];
}

// ─────────────────────────────────────────────────────────────
// 工具函数
// ─────────────────────────────────────────────────────────────

/** 保留 4 位小数 */
function round4(n) {
  return Math.round(n * 1e4) / 1e4;
}

/** 保留 2 位小数 */
function round2(n) {
  return Math.round(n * 100) / 100;
}

/** 百分比字符串（如 34.21%） */
function pct(rate) {
  return `${(rate * 100).toFixed(2)}%`;
}

/**
 * 统计文本中某词出现次数（朴素计数，中文无需词边界）
 * @param {string} text 文本
 * @param {string} word 词
 * @returns {number} 出现次数
 */
function countOccurrences(text, word) {
  if (!word) return 0;
  let count = 0;
  let idx = text.indexOf(word);
  while (idx !== -1) {
    count++;
    idx = text.indexOf(word, idx + word.length);
  }
  return count;
}

/**
 * 统计情绪词命中：出现次数口径 + 去重词口径
 * @param {string} text 文本
 * @param {Iterable<string>} words 情绪词表
 * @returns {{hits: number, distinct: number, matched: string[]}}
 */
function countEmotionHits(text, words) {
  let hits = 0;
  const matched = [];
  for (const w of words) {
    const c = countOccurrences(text, w);
    if (c > 0) {
      hits += c;
      matched.push(w);
    }
  }
  return { hits, distinct: matched.length, matched };
}

/**
 * 分位数（线性插值）
 * @param {number[]} sorted 升序数组
 * @param {number} q 分位（0-1）
 * @returns {number}
 */
function quantile(sorted, q) {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const next = sorted[base + 1];
  return next === undefined ? sorted[base] : sorted[base] + rest * (next - sorted[base]);
}

/** 数组均值（按取值函数） */
function avgOf(list, pick) {
  return list.length > 0 ? round4(list.reduce((s, x) => s + pick(x), 0) / list.length) : 0;
}

/** 数组最小值（按取值函数） */
function minOf(list, pick) {
  return list.length > 0 ? round4(Math.min(...list.map(pick))) : 0;
}

// ─────────────────────────────────────────────────────────────
// 指标 1/2/3/6：L1 压缩（token 节省 / 语义校验 / 情绪保留 / 耗时）
//
// 分两种口径测量，因为线上接线与文档设计并不一致：
//   - strict（完整校验口径）：显式传入 entities / criticalEntities / emotionWords，
//     语义校验真正生效，不达标就 fail-open 回退原文。
//   - asWired（线上接线口径）：复刻 src/services/chat-manager.ts 的
//     `compressMessages(built.messages, pipeline)` —— 未传 options，
//     于是 runL1 拿不到 entities/emotionWords，validateCompression 的
//     entityRate / emotionRate 恒为 1，missingCritical 恒为空 → 校验恒通过。
// ─────────────────────────────────────────────────────────────

/**
 * 对单个样本跑一次压缩 + 校验，返回明细
 * @param {Record<string, any>} mod 待测模块
 * @param {object} s 样本
 * @param {number} targetRatio 目标压缩比
 * @param {boolean} strict 是否走完整校验口径
 * @returns {Promise<object>}
 */
async function runOne(mod, s, targetRatio, strict) {
  const originalTokens = await mod.countTokens(s.text);
  const originalChars = s.text.length;

  // 原始文本中实际命中的情绪词 —— 以此作为情绪保留率分母
  // （若直接传入完整 EMOTION_WORDS，未出现的词会稀释分母，指标失真）
  const originalEmotion = countEmotionHits(s.text, mod.EMOTION_WORDS);
  // 同理，实体保留率的分母只取「原文中真实出现过」的实体：
  // declaredEntities 是角色卡/世界观的**全局**实体表，短样本天然不包含全部实体，
  // 若直接用全局表做分母会把「样本没提到」误判成「压缩丢了」。
  const entitiesInOriginal = s.entities.filter((e) => s.text.includes(e));
  const emotionWords = strict ? originalEmotion.matched : [];
  const entities = strict ? entitiesInOriginal : [];
  const criticalEntities = strict ? s.criticalEntities : [];

  const cr = mod.extractiveCompress(s.text, {
    targetRatio,
    entities,
    criticalEntities,
    context: s.context,
  });
  const validation = mod.validateCompression({
    original: s.text,
    compressed: cr.text,
    entities,
    criticalEntities,
    emotionWords,
  });

  const compressedTokens = await mod.countTokens(cr.text);
  const afterEmotion = countEmotionHits(cr.text, mod.EMOTION_WORDS);

  // 对照口径：用「全局声明实体表」做分母（即线上若直接传角色卡实体表的效果）
  const entityRateDeclared = s.entities.length > 0
    ? s.entities.filter((e) => cr.text.includes(e)).length / s.entities.length
    : 1;

  // 端到端管线（含 fail-open 回退）：回退则实际节省为 0
  const pipeline = new mod.OptimizationPipeline({
    enabled: true, l0Enabled: true, l1Enabled: true, l2Enabled: false, stage: 'all',
  });
  const l1 = pipeline.runL1({
    text: s.text,
    context: s.context,
    entities,
    criticalEntities,
    emotionWords,
    targetRatio,
  });
  const effectiveTokens = await mod.countTokens(l1.text);

  return {
    id: s.id,
    name: s.name,
    entities: {
      declared: s.entities.length,
      inOriginal: entitiesInOriginal.length,
      rateDeclared: round4(entityRateDeclared),
    },
    sentences: { total: cr.totalCount, kept: cr.keptCount, removed: cr.removed.length },
    tokens: {
      original: originalTokens,
      compressed: compressedTokens,
      savingRate: round4(originalTokens > 0 ? (originalTokens - compressedTokens) / originalTokens : 0),
    },
    chars: {
      original: originalChars,
      compressed: cr.text.length,
      savingRate: round4(originalChars > 0 ? (originalChars - cr.text.length) / originalChars : 0),
    },
    validation: {
      pass: validation.pass,
      entityRate: round4(validation.entityRate),
      emotionRate: round4(validation.emotionRate),
      missingCritical: validation.missingCritical,
    },
    emotion: {
      originalHits: originalEmotion.hits,
      compressedHits: afterEmotion.hits,
      originalDistinct: originalEmotion.distinct,
      compressedDistinct: afterEmotion.distinct,
      hitRetentionRate: round4(originalEmotion.hits > 0 ? afterEmotion.hits / originalEmotion.hits : 1),
      wordRetentionRate: round4(originalEmotion.distinct > 0 ? afterEmotion.distinct / originalEmotion.distinct : 1),
    },
    endToEnd: {
      compressed: l1.compressed,
      fallbackReason: l1.fallbackReason ?? null,
      effectiveTokens,
      effectiveSavingRate: round4(
        originalTokens > 0 ? (originalTokens - effectiveTokens) / originalTokens : 0
      ),
    },
  };
}

/**
 * 汇总某一口径下的样本结果
 * @param {Array<object>} rows 样本明细
 * @returns {object}
 */
function summarize(rows) {
  return {
    sampleCount: rows.length,
    tokenSavingRateAvg: avgOf(rows, (r) => r.tokens.savingRate),
    tokenSavingRateMin: minOf(rows, (r) => r.tokens.savingRate),
    charSavingRateAvg: avgOf(rows, (r) => r.chars.savingRate),
    effectiveTokenSavingRateAvg: avgOf(rows, (r) => r.endToEnd.effectiveSavingRate),
    fallbackCount: rows.filter((r) => !r.endToEnd.compressed).length,
    validationPassRate: round4(rows.length > 0
      ? rows.filter((r) => r.validation.pass).length / rows.length
      : 0),
    entityRetentionRateAvg: avgOf(rows, (r) => r.validation.entityRate),
    entityRetentionRateDeclaredAvg: avgOf(rows, (r) => r.entities.rateDeclared),
    emotionHitRetentionRateAvg: avgOf(rows, (r) => r.emotion.hitRetentionRate),
    emotionWordRetentionRateAvg: avgOf(rows, (r) => r.emotion.wordRetentionRate),
  };
}

/**
 * 测量 L1 压缩相关指标（两种口径 + 耗时埋点）
 * @param {Record<string, any>} mod 待测模块
 * @param {Array<object>} samples 样本
 * @param {number} targetRatio 目标压缩比
 * @returns {Promise<object>}
 */
async function measureCompression(mod, samples, targetRatio) {
  const strictRows = [];
  const wiredRows = [];
  const durations = [];

  for (const s of samples) {
    const strict = await runOne(mod, s, targetRatio, true);
    const wired = await runOne(mod, s, targetRatio, false);
    strictRows.push(strict);
    wiredRows.push(wired);

    // 耗时采样：extractiveCompress + validateCompression（完整校验口径，最坏情况）
    const originalEmotion = countEmotionHits(s.text, mod.EMOTION_WORDS);
    for (let i = 0; i < PERF_REPEATS; i++) {
      const ts = performance.now();
      const r = mod.extractiveCompress(s.text, {
        targetRatio,
        entities: s.entities,
        criticalEntities: s.criticalEntities,
        context: s.context,
      });
      mod.validateCompression({
        original: s.text,
        compressed: r.text,
        entities: s.entities,
        criticalEntities: s.criticalEntities,
        emotionWords: originalEmotion.matched,
      });
      durations.push(performance.now() - ts);
    }
  }

  const sortedDurations = [...durations].sort((a, b) => a - b);
  const strict = summarize(strictRows);
  const asWired = summarize(wiredRows);
  const p95 = round4(quantile(sortedDurations, 0.95));

  return {
    targetRatio,
    tokenUnit: 'gpt-tokenizer (cl100k_base) 实测 encode().length；非估算',
    strict: {
      ...strict,
      samples: strictRows,
      meaning: '完整校验口径：显式传入 entities / criticalEntities / emotionWords，语义校验真正生效',
    },
    asWired: {
      ...asWired,
      samples: wiredRows,
      meaning: '线上接线口径：复刻 chat-manager 的 compressMessages(messages, pipeline)，未传 entities/emotionWords',
    },
    perf: {
      samples: durations.length,
      avgMs: round4(durations.reduce((a, b) => a + b, 0) / durations.length),
      p50Ms: round4(quantile(sortedDurations, 0.5)),
      p95Ms: p95,
      maxMs: round4(sortedDurations[sortedDurations.length - 1] ?? 0),
      minMs: round4(sortedDurations[0] ?? 0),
    },
    gates: {
      entityRetentionRate: {
        target: `>=${THRESHOLD_ENTITY_RATE}（线上口径实测）`,
        value: asWired.entityRetentionRateAvg,
        pass: asWired.entityRetentionRateAvg >= THRESHOLD_ENTITY_RATE,
      },
      emotionRetentionRate: {
        target: `>=${THRESHOLD_EMOTION_RETENTION}（线上口径实测）`,
        value: asWired.emotionHitRetentionRateAvg,
        pass: asWired.emotionHitRetentionRateAvg >= THRESHOLD_EMOTION_RETENTION,
      },
      strictValidationPassRate: {
        target: '=1.0（完整校验口径下每次都通过，否则 fail-open 回退原文，L1 收益归零）',
        value: strict.validationPassRate,
        pass: strict.validationPassRate >= 1.0,
      },
      pipelineLatency: {
        target: `p95 <=${THRESHOLD_PIPELINE_MS}ms`,
        valueMs: p95,
        pass: p95 <= THRESHOLD_PIPELINE_MS,
      },
      tokenSavingInDocRange: {
        target: `${pct(TARGET_SAVING_RANGE.min)} ~ ${pct(TARGET_SAVING_RANGE.max)}（文档 §1.2「输出 token 节省」，口径为真实用量对比）`,
        value: asWired.tokenSavingRateAvg,
        pass: asWired.tokenSavingRateAvg >= TARGET_SAVING_RANGE.min
          && asWired.tokenSavingRateAvg <= TARGET_SAVING_RANGE.max,
        note: '本次为离线样本口径的**输入侧**节省率，不能替代文档要求的真实用量对比；此项不参与 --strict 门禁',
        advisoryOnly: true,
      },
    },
  };
}

// ─────────────────────────────────────────────────────────────
// 指标 4：对白 / 情绪豁免是否生效
// ─────────────────────────────────────────────────────────────

/**
 * 测量 L2 硬豁免（对白 / 情绪词 / 设定实体 + L1 standing 豁免）
 * @param {Record<string, any>} mod 待测模块
 * @returns {Promise<object>}
 */
async function measureExemption(mod) {
  // 1) classifyScope 分类正确性
  const dialogueLine = '“这么晚还赶路，旅人，你身上有灰烬教会的味道。”';
  const emotionLine = '绯看着他，心里涌起一阵难以名状的心疼。';
  const metaLine = '她似乎有些犹豫，然后放下手中的酒杯，接着走向吧台后面的酒架。';
  const scopeChecks = [
    { label: '对白主导句 → dialogue', input: dialogueLine, expected: 'dialogue', actual: mod.classifyScope(dialogueLine) },
    { label: '情绪旁白 → emotion_narration', input: emotionLine, expected: 'emotion_narration', actual: mod.classifyScope(emotionLine) },
    { label: '状态性旁白 → meta_narration', input: metaLine, expected: 'meta_narration', actual: mod.classifyScope(metaLine) },
  ];
  for (const c of scopeChecks) c.pass = c.actual === c.expected;

  // 边界观察（不设门禁，仅如实记录实现行为）：
  // classifyScope 要求「引号内容占比 ≥50%」才判为 dialogue，
  // 因此「短对白 + 长旁白」的混合句会落到 meta_narration，进入可精简集合。
  const mixedLine = '“欢迎光临。”她说，然后转身走向吧台。';
  const mixedQuoteLen = (mixedLine.match(/“[^”]*”/g) ?? []).join('').length;
  const boundaryObservations = [
    {
      label: '短对白 + 长旁白（引号占比 <50%）',
      input: mixedLine,
      quoteRatio: round4(mixedQuoteLen / mixedLine.length),
      actualScope: mod.classifyScope(mixedLine),
      note: '不构成内容丢失（引号片段已被 protect 哨兵保护），但该句会被纳入「可精简」集合，'
        + '仅删除填充词 / 折叠重复字。若希望此类句子也硬豁免，需调整 classifyScope 的占比阈值。',
    },
  ];

  // 2) protect → compressMetaNarration → restore 零损失
  const mixed = [
    '“灰烬教会的人追得很紧。”她低声说，语气里第一次出现了紧张。',
    '绯似乎有些犹豫，然后放下酒杯，接着转身走向吧台后面的酒架。',
    '“后院有个储藏室，堆满了酒桶，谁也不会去翻。”',
  ].join('\n');
  const protectedText = mod.protect(mixed, ['灰烬教会', '绯']);
  const shrunk = mod.compressMetaNarration(protectedText.text);
  const restored = mod.restore(shrunk, protectedText.segments);

  const missingSegments = protectedText.segments.filter((seg) => !restored.includes(seg));
  const quotesIn = mixed.match(/“[^”]*”/g) ?? [];
  const quotesOut = restored.match(/“[^”]*”/g) ?? [];
  const quotesMissing = quotesIn.filter((q) => !restored.includes(q));
  const emotionIn = countEmotionHits(mixed, mod.EMOTION_WORDS).matched;
  const emotionMissing = emotionIn.filter((w) => !restored.includes(w));

  // 3) L1 standing 豁免黑名单
  const standingTexts = STANDING_FACTS.map((f) => f.body);
  const standingHit = standingTexts[0];
  const isExemptHit = mod.isExempt(standingHit, standingTexts);
  const isExemptMiss = mod.isExempt('窗外下着雨，屋檐的水滴落在石阶上。', standingTexts);
  const exemptPipeline = new mod.OptimizationPipeline({
    enabled: true, l0Enabled: true, l1Enabled: true, l2Enabled: false, stage: 'all',
  });
  const exemptRun = exemptPipeline.runL1({ text: standingHit, exemptTexts: standingTexts });

  // 4) applyOutputDiscipline 对对白 / 情绪消息零改写
  const disciplineMessages = [
    { role: 'system', content: '你是绯。' },
    { role: 'assistant', content: dialogueLine },
    { role: 'assistant', content: emotionLine },
    { role: 'assistant', content: metaLine },
    { role: 'user', content: '“我明白了。”' },
  ];
  const discipline = mod.applyOutputDiscipline(disciplineMessages, { enabled: true, l2Enabled: true });

  return {
    scopeChecks,
    boundaryObservations,
    protectRestore: {
      segmentCount: protectedText.segments.length,
      missingSegments,
      quoteCountIn: quotesIn.length,
      quoteCountOut: quotesOut.length,
      quotesMissing,
      emotionWordsIn: emotionIn,
      emotionWordsMissing: emotionMissing,
      metaNarrationShrunk: shrunk.length < protectedText.text.length,
      shrunkChars: protectedText.text.length - shrunk.length,
    },
    standingExempt: {
      isExemptHit,
      isExemptMiss,
      runL1Compressed: exemptRun.compressed,
      runL1FallbackReason: exemptRun.fallbackReason ?? null,
    },
    disciplineExempt: {
      dialogueUnchanged: discipline.messages[1].content === dialogueLine,
      emotionUnchanged: discipline.messages[2].content === emotionLine,
      metaChanged: discipline.messages[3].content !== metaLine,
      compressedCount: discipline.compressedCount,
      protectedCount: discipline.protectedCount,
    },
    gates: {
      scopeClassification: {
        target: '对白/情绪/状态三类全部正确分类',
        value: `${scopeChecks.filter((c) => c.pass).length}/${scopeChecks.length}`,
        pass: scopeChecks.every((c) => c.pass),
      },
      protectedSegmentsIntact: {
        target: '受保护片段（对白/情绪词/实体）还原后 0 丢失',
        value: `丢失 ${missingSegments.length} 段`,
        pass: missingSegments.length === 0,
      },
      quotesIntact: {
        target: '引号对白 0 丢失',
        value: `${quotesOut.length}/${quotesIn.length} 保留`,
        pass: quotesMissing.length === 0 && quotesIn.length > 0,
      },
      emotionIntact: {
        target: '情绪词 0 丢失',
        value: `${emotionIn.length - emotionMissing.length}/${emotionIn.length} 保留`,
        pass: emotionMissing.length === 0,
      },
      standingExempt: {
        target: 'standing 事实命中豁免黑名单且不被压缩',
        value: `isExempt=${isExemptHit}, runL1.compressed=${exemptRun.compressed}`,
        pass: isExemptHit === true && isExemptMiss === false && exemptRun.compressed === false,
      },
      disciplineExempt: {
        target: 'applyOutputDiscipline 只改状态性旁白，对白/情绪消息零改写',
        value: `对白未改=${discipline.messages[1].content === dialogueLine}, 情绪未改=${discipline.messages[2].content === emotionLine}`,
        pass: discipline.messages[1].content === dialogueLine
          && discipline.messages[2].content === emotionLine
          && discipline.messages[3].content !== metaLine,
      },
    },
  };
}

// ─────────────────────────────────────────────────────────────
// 指标 5：L0 前缀稳定率
// ─────────────────────────────────────────────────────────────

/**
 * 测量 L0 前缀字节稳定率
 * @param {Record<string, any>} mod 待测模块
 * @returns {Promise<object>}
 */
async function measurePrefixStability(mod) {
  const base = [
    '【系统】你是翡翠酒馆的老板娘绯。',
    '【规则】用中文回复，保持克制而温暖的语气，不得主动提及自己是 AI。',
  ].join('\n');

  /** @type {any} */
  const store = new mod.MemoryStore();
  for (const f of STANDING_FACTS) {
    await store.put(f, 'human');
  }
  // scoped 事实：不应进入前缀（动态段）
  await store.put(
    { id: 'scoped-session-eval', scope: 'scoped', kind: 'session', body: '旅人今晚住在后院储藏室。' },
    'optimizer'
  );

  const registry = new mod.CharacterRegistry(store);
  const hashes = [];
  for (let i = 0; i < PREFIX_REPEATS; i++) {
    const p = await registry.assemblePrefix(base, 'session-eval');
    hashes.push(p.hash);
  }
  const first = hashes[0];
  const stableCount = hashes.filter((h) => h === first).length;
  const stabilityRate = round4(stableCount / hashes.length);
  const prefixChars = (await registry.assemblePrefix(base, 'session-eval')).text.length;

  // 顺序无关性：以相反顺序写入 standing 事实，哈希应一致
  const store2 = new mod.MemoryStore();
  for (const f of [...STANDING_FACTS].reverse()) {
    await store2.put(f, 'human');
  }
  const registry2 = new mod.CharacterRegistry(store2);
  const prefix2 = await registry2.assemblePrefix(base, 'session-eval');
  const orderIndependent = prefix2.hash === first;

  // 新增 scoped 事实不应改变前缀哈希（scoped 不进前缀）
  await store.put(
    { id: 'scoped-extra', scope: 'scoped', kind: 'session', body: '追加一条动态事实。' },
    'optimizer'
  );
  const prefixAfterScoped = await registry.assemblePrefix(base, 'session-eval');
  const scopedIsolated = prefixAfterScoped.hash === first;

  // standing 写保护：optimizer 不得改写 standing（文档 §1.2「设定文件静默改写数 = 0」）
  let standingWriteBlocked = false;
  let standingRevisionBefore = null;
  let standingRevisionAfter = null;
  const before = await store.get(STANDING_FACTS[0].id);
  standingRevisionBefore = before?.revision ?? null;
  const beforeBody = before?.body ?? '';
  let threw = false;
  try {
    await store.put(
      { id: STANDING_FACTS[0].id, scope: 'standing', kind: 'character', body: '【被优化器篡改】绯其实是灰烬教会的卧底。' },
      'optimizer'
    );
  } catch {
    threw = true;
  }
  const after = await store.get(STANDING_FACTS[0].id);
  standingRevisionAfter = after?.revision ?? null;
  standingWriteBlocked = threw || after?.body === beforeBody;

  // L0 端到端：applyL0Context 的 prefixHash 跨多次调用稳定
  const tracker = new mod.EmotionTracker();
  await tracker.update('session-eval', '心疼', '旅人无家可归');
  const deps = { store, registry, tracker };
  const pipelineLike = { enabled: true, l0Enabled: true, l2Enabled: false };
  const l0Hashes = [];
  for (let i = 0; i < 10; i++) {
    const out = await mod.applyL0Context(deps, '你是绯。', pipelineLike, 'session-eval');
    l0Hashes.push(out.prefixHash);
  }
  const l0StableRate = round4(l0Hashes.filter((h) => h === l0Hashes[0]).length / l0Hashes.length);

  return {
    calls: hashes.length,
    prefixHash: first,
    prefixChars,
    stabilityRate,
    stableCount,
    orderIndependent,
    scopedIsolated,
    l0ContextHashStableRate: l0StableRate,
    standingWriteGuard: {
      writeBlocked: standingWriteBlocked,
      threw,
      revisionBefore: standingRevisionBefore,
      revisionAfter: standingRevisionAfter,
    },
    gates: {
      prefixStability: {
        target: `=${pct(THRESHOLD_PREFIX_STABILITY)}（每请求对比前缀哈希）`,
        value: `${stableCount}/${hashes.length} = ${pct(stabilityRate)}`,
        pass: stabilityRate >= THRESHOLD_PREFIX_STABILITY,
      },
      orderIndependence: {
        target: '写入顺序无关，同输入必同哈希',
        value: String(orderIndependent),
        pass: orderIndependent === true,
      },
      scopedIsolation: {
        target: 'scoped 动态事实不进前缀，不影响哈希',
        value: String(scopedIsolated),
        pass: scopedIsolated === true,
      },
      standingWriteGuard: {
        target: '=0 次静默改写（optimizer 不得写 standing）',
        value: standingWriteBlocked ? '0 次（已拦截）' : '保护失效',
        pass: standingWriteBlocked === true,
      },
    },
  };
}

// ─────────────────────────────────────────────────────────────
// L2 输出纪律：输出侧 token 节省（样本口径）
// ─────────────────────────────────────────────────────────────

/**
 * 测量 L2 输出纪律的输出侧 token 节省（样本口径）
 *
 * ⚠️ 口径提醒：文档 §1.2 的「输出 token 节省 20–40%」明确要求「真实用量对比
 * （禁止估算）」。此处测的是**内置样本**经 applyOutputDiscipline 处理后的
 * token 变化，只能说明 L2 规则在给定文本上的削减幅度，**不等于线上真实节省**。
 *
 * @param {Record<string, any>} mod 待测模块
 * @returns {Promise<object>}
 */
async function measureOutputDiscipline(mod) {
  const messages = buildDisciplineMessages();
  const before = await mod.estimateMessagesTokens(messages);
  const outcome = mod.applyOutputDiscipline(messages, { enabled: true, l2Enabled: true });
  const after = await mod.estimateMessagesTokens(outcome.messages);

  const beforeChars = messages.reduce((s, m) => s + m.content.length, 0);
  const afterChars = outcome.messages.reduce((s, m) => s + m.content.length, 0);

  // 生效面统计：assistant 消息被 classifyScope 判为 meta_narration 的比例
  const assistantMsgs = messages.filter((m) => m.role === 'assistant');
  const scopeTally = { dialogue: 0, emotion_narration: 0, meta_narration: 0, other: 0 };
  for (const m of assistantMsgs) {
    scopeTally[mod.classifyScope(m.content)] += 1;
  }

  // 完整性：所有引号对白与情绪词在精简后仍在（按消息逐条比对）
  let quotesMissing = 0;
  let emotionMissing = 0;
  for (let i = 0; i < messages.length; i++) {
    const src = messages[i].content;
    const dst = outcome.messages[i].content;
    for (const q of src.match(/“[^”]*”/g) ?? []) {
      if (!dst.includes(q)) quotesMissing++;
    }
    for (const w of countEmotionHits(src, mod.EMOTION_WORDS).matched) {
      if (!dst.includes(w)) emotionMissing++;
    }
  }

  return {
    messageCount: messages.length,
    assistantCount: assistantMsgs.length,
    scopeTally,
    tokensBefore: before,
    tokensAfter: after,
    tokenSavingRate: round4(before > 0 ? (before - after) / before : 0),
    charSavingRate: round4(beforeChars > 0 ? (beforeChars - afterChars) / beforeChars : 0),
    compressedCount: outcome.compressedCount,
    protectedCount: outcome.protectedCount,
    quotesMissing,
    emotionMissing,
    gates: {
      outputIntegrity: {
        target: '精简后引号对白与情绪词 0 丢失',
        value: `对白丢失 ${quotesMissing}，情绪词丢失 ${emotionMissing}`,
        pass: quotesMissing === 0 && emotionMissing === 0,
      },
    },
    caveat: '样本口径：内置样本经 applyOutputDiscipline 的 token 变化，'
      + '同时受「样本填充词密度」与「assistant 消息中状态性旁白占比」影响；'
      + '不等于文档 §1.2「输出 token 节省 20–40%」要求的真实用量对比结果。',
  };
}

// ─────────────────────────────────────────────────────────────
// compressMessages 消息列表级挂载点（两种 wiring 对比）
// ─────────────────────────────────────────────────────────────

/**
 * 测量 compressMessages 的端到端效果，并对比「线上接线」与「补传 entities」两种写法
 * @param {Record<string, any>} mod 待测模块
 * @returns {Promise<object>}
 */
async function measureMessageList(mod) {
  const messages = buildMessageCompressInput();
  const before = await mod.estimateMessagesTokens(messages);

  /** @param {object|undefined} options 传给 compressMessages 的选项 */
  const run = async (options) => {
    const pipeline = new mod.OptimizationPipeline({
      enabled: true, l0Enabled: true, l1Enabled: true, l2Enabled: false, stage: 'all',
    });
    const outcome = mod.compressMessages(messages, pipeline, options);
    const after = await mod.estimateMessagesTokens(outcome.messages);
    return {
      compressedCount: outcome.compressedCount,
      tokensBefore: before,
      tokensAfter: after,
      tokenSavingRate: round4(before > 0 ? (before - after) / before : 0),
      stats: { ...pipeline.stats },
    };
  };

  return {
    messageCount: messages.length,
    minCompressLength: mod.MIN_COMPRESS_LENGTH,
    // 线上接线：src/services/chat-manager.ts:301 调用 compressMessages(built.messages, pipeline)，未传第三参
    asWired: await run(undefined),
    // 对照：补传 entities / exemptTexts，观察显著性打分与豁免带来的差异
    withEntities: await run({
      entities: SAMPLE_ENTITIES,
      exemptTexts: STANDING_FACTS.map((f) => f.body),
    }),
    note: '线上接线未传 entities / criticalEntities / emotionWords，'
      + '导致 runL1 的语义校验三个维度全部为空集（entityRate / emotionRate 恒为 1.0、missingCritical 恒空），'
      + '校验恒通过 —— 压缩的实体/情绪保护实际未生效。',
    withEntitiesNote: '补传 entities 后压缩条数下降，原因是 validateCompression 以「全局实体表」为分母：'
      + '单条消息不可能包含角色卡的全部实体，entityRate 天然低于 0.9 → 全部 fail-open 回退。'
      + '这是校验分母设计问题，不是压缩器问题（见 compression.strict 中按「原文实含实体」为分母的对照口径）。',
  };
}

// ─────────────────────────────────────────────────────────────
// 需真实环境的指标（不编造，只声明）
// ─────────────────────────────────────────────────────────────

/**
 * 返回需要真实环境才能测量的指标清单
 * @returns {Array<object>}
 */
function buildRequiresRealEnvMetrics() {
  return [
    {
      id: 'cache-hit-rate',
      name: '缓存命中率（DeepSeek 前缀段）',
      target: '>=60%（观测项，非门禁）',
      status: 'requires-real-env',
      why: '命中率来自 provider 返回的 usage 字段（如 prompt_tokens_details.cached_tokens），'
        + '离线无任何 LLM 调用，无法产生该数据。',
      howTo: 'node scripts/opt-eval.mjs --with-api（需配置 OPENAI_API_KEY / OPENAI_BASE_URL），'
        + '或在线上对话中采集 provider usage 后统计 cached_tokens / prompt_tokens。',
    },
    {
      id: 'first-token-latency-p95',
      name: '首 token 延迟 p95',
      target: '<=2.5s',
      status: 'requires-real-env',
      why: 'TTFT 取决于真实网络与 provider 排队，离线无法测量。',
      howTo: 'node scripts/opt-eval.mjs --with-api 做流式请求采样，或用 locust 压测采集 p95。',
    },
    {
      id: 'output-token-saving',
      name: '输出 token 节省（对话型）',
      target: '20% ~ 40%',
      status: 'requires-real-env',
      why: '文档明确要求「真实用量对比（禁止估算）」。离线最多测到样本口径的 token 变化，'
        + '与真实用量口径不同，不可互相替代。',
      howTo: '同一批会话分别以「优化关闭 / 优化开启」跑真实 LLM，对比 usage.completion_tokens 总量。',
    },
    {
      id: 'core-setting-consistency',
      name: '核心设定一致率（<=10 个关键事实）',
      target: '=100%',
      status: 'requires-real-env',
      why: '需要「设定事实测试集 + 真实多轮对话 + 设定抽取判定」，三者当前均不在仓库内。',
      howTo: '补 20–50 条设定事实测试集（≤10 条标记核心），跑多轮对话后对回复做实体匹配判定。',
    },
    {
      id: 'full-setting-consistency',
      name: '全量设定一致率（20–50 事实）',
      target: '>=95%（连续 3 次滚动通过）',
      status: 'requires-real-env',
      why: '同上，依赖真实对话与设定抽取器。',
      howTo: '同上，需连续 3 次滚动通过。',
    },
    {
      id: 'emotion-label-coherence',
      name: '情绪标签连贯率（相邻轮次）',
      target: '>=90%',
      status: 'requires-real-env',
      why: '需要真实多轮对话的逐轮情绪标注输出做相邻对比；离线只有单轮规则标注器。',
      howTo: '采集真实多轮会话，逐轮跑 detectEmotion 或 LLM 标注器，统计相邻轮次标签一致率。',
    },
    {
      id: 'blind-review',
      name: '盲评（关键场景 10 组前文）',
      target: '产品/编剧人工评定',
      status: 'requires-real-env',
      why: '需要人工盲评，且样本集（诀别/背叛/告白等 10 组）尚未提供。',
      howTo: '由编剧产出 10 组前文，双盲对比「优化前/后」输出后打分。',
    },
    {
      id: 'bm25-recall-latency',
      name: 'BM25 召回耗时',
      target: '软 100ms / 硬 500ms',
      status: 'out-of-scope',
      why: '属 RAG 检索指标，不在本次三层优化（L0/L1/L2）评估范围内。',
      howTo: '由 RAG 相关脚本单独埋点采集。',
    },
  ];
}

/**
 * 可选：真实 LLM 环境探针（仅 --with-api 时调用）
 *
 * 说明：本函数在缺少 API 凭据时直接返回 requires-real-env，不做任何猜测。
 * 即使凭据齐全，若 provider 未返回对应字段，也如实标记 unavailable。
 *
 * @param {object} env 环境变量快照
 * @returns {Promise<object>}
 */
async function probeRealEnv(env) {
  const apiKey = env.OPENAI_API_KEY ?? env.AIJ_API_KEY ?? '';
  const baseUrl = env.OPENAI_BASE_URL ?? env.AIJ_BASE_URL ?? 'https://api.deepseek.com';
  const model = env.LLM_MODEL ?? env.AIJ_MODEL ?? 'deepseek-chat';

  const skeleton = {
    cacheHitRate: { status: 'requires-real-env', target: '>=60%', value: null },
    firstTokenLatency: { status: 'requires-real-env', target: 'p95 <=2.5s', valueMs: null },
    outputTokenSaving: { status: 'requires-real-env', target: '20%~40%', value: null },
  };

  if (!apiKey) {
    return {
      enabled: false,
      reason: '未检测到 OPENAI_API_KEY / AIJ_API_KEY，跳过真实环境探针。'
        + '配置后重跑：OPENAI_API_KEY=xxx OPENAI_BASE_URL=... node scripts/opt-eval.mjs --with-api',
      ...skeleton,
    };
  }

  const endpoint = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  // 稳定前缀（模拟 L0 的字节稳定前缀段），每次请求复用同一份以触发 provider 前缀缓存
  const stablePrefix = [
    '【系统】你是翡翠酒馆的老板娘绯。',
    '【规则】用中文回复，保持克制而温暖的语气，不得主动提及自己是 AI。',
    ...STANDING_FACTS.map((f) => `【${f.kind}】${f.body}`),
  ].join('\n');
  const suffixes = [
    '旅人：“我天亮前就走。”',
    '旅人：“那把剑在哪里？”',
    '旅人：“你为什么帮我？”',
    '旅人：“灰烬教会的人还会回来吗？”',
    '旅人：“老雷是谁？”',
    '旅人：“北境有多远？”',
    '旅人：“如果我死了，你会记得我吗？”',
  ];

  const ttfts = [];
  const cacheRatios = [];
  const errors = [];

  for (const suffix of suffixes) {
    try {
      const t0 = performance.now();
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          stream: true,
          stream_options: { include_usage: true },
          messages: [
            { role: 'system', content: stablePrefix },
            { role: 'user', content: suffix },
          ],
        }),
      });
      if (!res.ok || !res.body) {
        errors.push(`HTTP ${res.status} ${res.statusText}`);
        continue;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let ttft = null;
      let usage = null;
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (ttft === null) ttft = performance.now() - t0;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === '[DONE]') continue;
          try {
            const json = JSON.parse(payload);
            if (json.usage) usage = json.usage;
          } catch {
            /* 忽略非 JSON 分片 */
          }
        }
      }
      if (ttft !== null) ttfts.push(ttft);

      const cached = usage?.prompt_tokens_details?.cached_tokens;
      const prompt = usage?.prompt_tokens;
      if (typeof cached === 'number' && typeof prompt === 'number' && prompt > 0) {
        cacheRatios.push(cached / prompt);
      }
    } catch (err) {
      errors.push(String(err?.message ?? err));
    }
  }

  const sortedTtfts = [...ttfts].sort((a, b) => a - b);
  return {
    enabled: true,
    endpoint,
    model,
    requests: suffixes.length,
    errors,
    cacheHitRate: cacheRatios.length > 0
      ? {
        status: 'measured',
        target: '>=60%',
        value: round4(cacheRatios.reduce((a, b) => a + b, 0) / cacheRatios.length),
        note: '口径：usage.prompt_tokens_details.cached_tokens / usage.prompt_tokens 的逐请求均值',
        samples: cacheRatios.length,
      }
      : {
        status: 'unavailable',
        target: '>=60%',
        value: null,
        note: 'provider 未返回 prompt_tokens_details.cached_tokens 字段，无法统计命中率',
      },
    firstTokenLatency: ttfts.length > 0
      ? {
        status: 'measured',
        target: 'p95 <=2.5s',
        valueMs: round2(quantile(sortedTtfts, 0.95)),
        avgMs: round2(ttfts.reduce((a, b) => a + b, 0) / ttfts.length),
        samples: ttfts.length,
      }
      : { status: 'unavailable', target: 'p95 <=2.5s', valueMs: null },
    outputTokenSaving: {
      status: 'requires-real-env',
      target: '20%~40%',
      value: null,
      note: '需同一批会话在「优化关闭 / 优化开启」两种配置下各跑一遍并对比 completion_tokens 总量；'
        + '单次探针无法自证，故不输出数字。',
    },
  };
}

// ─────────────────────────────────────────────────────────────
// 报告输出
// ─────────────────────────────────────────────────────────────

/**
 * 收集全部门禁结果
 * @param {object} report 报告
 * @returns {Array<{group: string, id: string, target: string, value: any, pass: boolean, advisoryOnly?: boolean}>}
 */
function collectGates(report) {
  const gates = [];
  const push = (group, obj) => {
    for (const [id, g] of Object.entries(obj)) {
      gates.push({
        group,
        id,
        target: g.target,
        value: g.value ?? g.valueMs,
        pass: g.pass,
        advisoryOnly: g.advisoryOnly === true,
      });
    }
  };
  push('compression', report.metrics.compression.gates);
  push('exemption', report.metrics.exemption.gates);
  push('l0', report.metrics.l0.gates);
  push('l2', report.metrics.l2.gates);
  return gates;
}

/**
 * 表格行渲染
 * @param {Array<any>} cells 单元格
 * @param {number[]} widths 列宽
 * @returns {string}
 */
function renderRow(cells, widths) {
  return cells.map((c, i) => String(c).padEnd(widths[i])).join('  ').trimEnd();
}

/**
 * 输出人类可读摘要
 * @param {object} report 报告
 */
function printReport(report) {
  const line = (s = '') => console.log(s);
  const H = (s) => line(`\n=== ${s} ===`);

  line('AI酒馆 · 三层对话优化效果评估');
  line(`生成时间：${report.generatedAt}`);
  line(`运行环境：node ${report.environment.node} / ${report.environment.platform}`);
  line(`Token 口径：${report.environment.tokenizer}`);

  // ── L1 压缩 ──
  const c = report.metrics.compression;
  const W = [22, 10, 8, 9, 9, 6, 22];
  H('L1 内容压缩层 · 完整校验口径（传入 entities/关键实体/情绪词）');
  line(renderRow(['样本', '保留句数', '原tok', '压后tok', '节省率', '校验', 'fail-open 结果'], W));
  for (const s of c.strict.samples) {
    line(renderRow([
      s.name,
      `${s.sentences.kept}/${s.sentences.total}`,
      s.tokens.original,
      s.tokens.compressed,
      pct(s.tokens.savingRate),
      s.validation.pass ? 'PASS' : 'FAIL',
      s.endToEnd.compressed
        ? `压缩生效 ${pct(s.endToEnd.effectiveSavingRate)}`
        : `回退原文(${s.endToEnd.fallbackReason})`,
    ], W));
  }
  for (const s of c.strict.samples) {
    line(`  ${s.id} 校验明细：实体 ${pct(s.validation.entityRate)}（分母=原文实含 ${s.entities.inOriginal}/${s.entities.declared} 个）`
      + ` / 情绪 ${pct(s.validation.emotionRate)}`
      + ` / 缺失关键实体 [${s.validation.missingCritical.join(', ')}]`);
  }
  line(`\n  平均 token 节省率 ${pct(c.strict.tokenSavingRateAvg)}（最低样本 ${pct(c.strict.tokenSavingRateMin)}）`);
  line(`  平均字符节省率 ${pct(c.strict.charSavingRateAvg)}`);
  line(`  端到端实际节省率（计入回退）${pct(c.strict.effectiveTokenSavingRateAvg)}，回退 ${c.strict.fallbackCount}/${c.strict.sampleCount} 个样本`);
  line(`  语义校验通过率 ${pct(c.strict.validationPassRate)}；实体保留率 ${pct(c.strict.entityRetentionRateAvg)}；情绪词保留率 ${pct(c.strict.emotionHitRetentionRateAvg)}（去重词口径 ${pct(c.strict.emotionWordRetentionRateAvg)}）`);
  line(`  实体保留率（若按全局声明表做分母）${pct(c.strict.entityRetentionRateDeclaredAvg)} —— 该口径会把「样本未提及」误判为「压缩丢失」，仅作对照`);

  H('L1 内容压缩层 · 线上接线口径（chat-manager 未传 entities/emotionWords）');
  line(renderRow(['样本', '保留句数', '原tok', '压后tok', '节省率', '校验', 'fail-open 结果'], W));
  for (const s of c.asWired.samples) {
    line(renderRow([
      s.name,
      `${s.sentences.kept}/${s.sentences.total}`,
      s.tokens.original,
      s.tokens.compressed,
      pct(s.tokens.savingRate),
      s.validation.pass ? 'PASS' : 'FAIL',
      s.endToEnd.compressed
        ? `压缩生效 ${pct(s.endToEnd.effectiveSavingRate)}`
        : `回退原文(${s.endToEnd.fallbackReason})`,
    ], W));
  }
  line(`\n  平均 token 节省率 ${pct(c.asWired.tokenSavingRateAvg)}`);
  line(`  端到端实际节省率 ${pct(c.asWired.effectiveTokenSavingRateAvg)}，回退 ${c.asWired.fallbackCount}/${c.asWired.sampleCount}`);
  line(`  语义校验通过率 ${pct(c.asWired.validationPassRate)}（空校验，恒通过）`);
  line(`  实体保留率 ${pct(c.asWired.entityRetentionRateAvg)}；情绪词保留率 ${pct(c.asWired.emotionHitRetentionRateAvg)}（去重词口径 ${pct(c.asWired.emotionWordRetentionRateAvg)}）`);

  const ml = report.metrics.messageList;
  H('L1 · compressMessages 消息列表挂载点');
  line(`  消息数 ${ml.messageCount}（最短压缩阈值 ${ml.minCompressLength} 字符）`);
  line(`  线上接线：压缩 ${ml.asWired.compressedCount} 条，token ${ml.asWired.tokensBefore} → ${ml.asWired.tokensAfter}，节省 ${pct(ml.asWired.tokenSavingRate)}`);
  line(`  补传 entities：压缩 ${ml.withEntities.compressedCount} 条，token ${ml.withEntities.tokensBefore} → ${ml.withEntities.tokensAfter}，节省 ${pct(ml.withEntities.tokenSavingRate)}`);
  line(`  注：${ml.note}`);
  line(`  注：${ml.withEntitiesNote}`);

  H('L1 · 压缩管线单次耗时');
  line(`  avg ${c.perf.avgMs}ms / p50 ${c.perf.p50Ms}ms / p95 ${c.perf.p95Ms}ms / max ${c.perf.maxMs}ms（${c.perf.samples} 次采样，最坏口径）`);

  // ── 豁免 ──
  const e = report.metrics.exemption;
  H('L2 硬豁免（对白 / 情绪 / 设定实体）');
  for (const s of e.scopeChecks) {
    line(`  [${s.pass ? 'OK' : 'FAIL'}] ${s.label} → 实际 ${s.actual}`);
  }
  line(`  受保护片段 ${e.protectRestore.segmentCount} 段，还原丢失 ${e.protectRestore.missingSegments.length} 段`);
  line(`  引号对白 ${e.protectRestore.quoteCountIn} → ${e.protectRestore.quoteCountOut}，丢失 ${e.protectRestore.quotesMissing.length}`);
  line(`  情绪词 ${e.protectRestore.emotionWordsIn.length} 个，丢失 ${e.protectRestore.emotionWordsMissing.length} 个`);
  line(`  状态性旁白被精简 ${e.protectRestore.metaNarrationShrunk}（减少 ${e.protectRestore.shrunkChars} 字符）`);
  line(`  standing 豁免：isExempt=${e.standingExempt.isExemptHit}，runL1.compressed=${e.standingExempt.runL1Compressed}`);
  line(`  applyOutputDiscipline：精简 ${e.disciplineExempt.compressedCount} 条，保护 ${e.disciplineExempt.protectedCount} 段`);
  for (const b of e.boundaryObservations) {
    line(`  边界观察：${b.label} → 引号占比 ${pct(b.quoteRatio)}，实际判为 ${b.actualScope}`);
    line(`    ${b.note}`);
  }

  // ── L0 ──
  const l0 = report.metrics.l0;
  H('L0 上下文结构层');
  line(`  前缀哈希 ${l0.prefixHash}`);
  line(`  前缀长度 ${l0.prefixChars} 字符；${l0.calls} 次调用稳定 ${l0.stableCount} 次 → ${pct(l0.stabilityRate)}`);
  line(`  写入顺序无关 ${l0.orderIndependent}；scoped 事实不进前缀 ${l0.scopedIsolated}`);
  line(`  applyL0Context 前缀哈希稳定率 ${pct(l0.l0ContextHashStableRate)}`);
  line(`  standing 写保护：${l0.standingWriteGuard.writeBlocked ? '已拦截（0 次静默改写）' : '保护失效'}`
    + `（修订号 ${l0.standingWriteGuard.revisionBefore} → ${l0.standingWriteGuard.revisionAfter}）`);

  // ── L2 输出侧 ──
  const l2 = report.metrics.l2;
  H('L2 输出纪律层（输出侧 token）');
  line(`  消息数 ${l2.messageCount}（assistant ${l2.assistantCount}）`);
  line(`  assistant 作用域分布：对白 ${l2.scopeTally.dialogue} / 情绪 ${l2.scopeTally.emotion_narration} / 状态性 ${l2.scopeTally.meta_narration} / 其他 ${l2.scopeTally.other}`);
  line(`  精简 ${l2.compressedCount} 条，保护 ${l2.protectedCount} 段`);
  line(`  token ${l2.tokensBefore} → ${l2.tokensAfter}，节省 ${pct(l2.tokenSavingRate)}；字符节省 ${pct(l2.charSavingRate)}`);
  line(`  完整性：对白丢失 ${l2.quotesMissing}，情绪词丢失 ${l2.emotionMissing}`);
  line(`  口径提醒：${l2.caveat}`);

  // ── 门禁 ──
  H('离线门禁');
  for (const g of collectGates(report)) {
    const tag = g.advisoryOnly ? '参考' : (g.pass ? 'OK  ' : 'FAIL');
    line(`  [${tag}] ${g.group}.${g.id} 目标 ${g.target} → 实测 ${g.value}`);
  }

  // ── 需真实环境 ──
  H('需真实环境的指标（本次未测出数字）');
  for (const m of report.requiresRealEnv) {
    line(`  - ${m.name}：目标 ${m.target} → ${m.status}`);
    line(`    原因：${m.why}`);
    line(`    怎么测：${m.howTo}`);
  }

  if (report.realEnvProbe) {
    H('真实环境探针（--with-api）');
    const p = report.realEnvProbe;
    if (!p.enabled) {
      line(`  未执行：${p.reason}`);
    } else {
      line(`  endpoint=${p.endpoint} model=${p.model} 请求数=${p.requests} 错误=${p.errors.length}`);
      line(`  缓存命中率：${p.cacheHitRate.status} ${p.cacheHitRate.value ?? '-'}`);
      line(`  首 token 延迟：${p.firstTokenLatency.status} ${p.firstTokenLatency.valueMs ?? '-'}ms`);
      line(`  输出 token 节省：${p.outputTokenSaving.status}`);
    }
  }

  if (report.baselineDiff) {
    H('与基线对比');
    const d = report.baselineDiff;
    if (d.error) {
      line(`  ${d.error}`);
    } else {
      line(`  基线时间：${d.baselineGeneratedAt}`);
      for (const r of d.rows) {
        const arrow = r.delta > 0 ? '+' : '';
        line(`  ${r.label}: ${r.baseline} → ${r.current}  (${arrow}${r.delta}${r.unit})`);
      }
    }
  }

  const failed = collectGates(report).filter((g) => !g.pass && !g.advisoryOnly);
  H('结论');
  line(`  门禁：${failed.length === 0 ? '全部通过' : `${failed.length} 项未达标（${failed.map((g) => g.group + '.' + g.id).join(', ')}）`}`);
  line(`  需真实环境指标：${report.requiresRealEnv.filter((m) => m.status === 'requires-real-env').length} 项未测出数字（未编造）`);
  line(`  退出码：${report.exitCode}`);
}

// ─────────────────────────────────────────────────────────────
// 基线保存与对比
// ─────────────────────────────────────────────────────────────

/** 需要纳入基线对比的数值指标：[键, 中文名, 取值函数, 类型] */
const BASELINE_KEYS = [
  ['strict.tokenSavingRateAvg', 'L1 token 节省率(完整校验)', (r) => r.metrics.compression.strict.tokenSavingRateAvg, 'rate'],
  ['strict.effectiveTokenSavingRateAvg', 'L1 端到端节省率(完整校验)', (r) => r.metrics.compression.strict.effectiveTokenSavingRateAvg, 'rate'],
  ['asWired.tokenSavingRateAvg', 'L1 token 节省率(线上口径)', (r) => r.metrics.compression.asWired.tokenSavingRateAvg, 'rate'],
  ['asWired.entityRetentionRateAvg', '实体保留率(线上口径)', (r) => r.metrics.compression.asWired.entityRetentionRateAvg, 'rate'],
  ['asWired.emotionHitRetentionRateAvg', '情绪词保留率(线上口径)', (r) => r.metrics.compression.asWired.emotionHitRetentionRateAvg, 'rate'],
  ['compression.perf.p95Ms', '压缩管线耗时 p95', (r) => r.metrics.compression.perf.p95Ms, 'ms'],
  ['l0.stabilityRate', 'L0 前缀稳定率', (r) => r.metrics.l0.stabilityRate, 'rate'],
  ['l2.tokenSavingRate', 'L2 输出 token 节省率', (r) => r.metrics.l2.tokenSavingRate, 'rate'],
];

/**
 * 与基线对比
 * @param {object} report 当前报告
 * @returns {object}
 */
function diffWithBaseline(report) {
  if (!fs.existsSync(BASELINE_PATH)) {
    return { error: `基线文件不存在：${BASELINE_PATH}（先跑 --save-baseline）` };
  }
  const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
  const rows = BASELINE_KEYS.map(([key, label, pick, kind]) => {
    const base = pick(baseline);
    const curr = pick(report);
    return {
      key,
      label,
      baseline: kind === 'rate' ? pct(base ?? 0) : `${round2(base ?? 0)}`,
      current: kind === 'rate' ? pct(curr ?? 0) : `${round2(curr ?? 0)}`,
      delta: round4((curr ?? 0) - (base ?? 0)),
      unit: kind === 'rate' ? ' (百分点)' : 'ms',
    };
  });
  return { baselineGeneratedAt: baseline.generatedAt ?? 'unknown', rows };
}

// ─────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────

/**
 * 解析命令行参数
 * @param {string[]} argv 参数列表
 * @returns {Record<string, string|boolean>}
 */
function parseArgs(argv) {
  const args = {
    json: false,
    strict: false,
    saveBaseline: false,
    compare: false,
    withApi: false,
    out: '',
    targetRatio: String(DEFAULT_TARGET_RATIO),
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--json': args.json = true; break;
      case '--strict': args.strict = true; break;
      case '--save-baseline': args.saveBaseline = true; break;
      case '--compare': args.compare = true; break;
      case '--with-api': args.withApi = true; break;
      case '--help': case '-h': args.help = true; break;
      case '--out': args.out = argv[++i] ?? ''; break;
      case '--target-ratio': args.targetRatio = argv[++i] ?? String(DEFAULT_TARGET_RATIO); break;
      default: break;
    }
  }
  return args;
}

const USAGE = `用法：node scripts/opt-eval.mjs [选项]

选项：
  --json              额外输出结构化 JSON 到 stdout
  --out <file>        把结构化 JSON 写入文件（默认不写）
  --save-baseline     把本次结果存入 artifacts/opt-eval-baseline.json
  --compare           与基线对比，输出各指标增减
  --strict            任一离线门禁不达标即退出码 1
  --with-api          额外尝试真实 LLM 环境探针（需 OPENAI_API_KEY）
  --target-ratio <n>  L1 目标压缩比（默认 0.6）
  -h, --help          显示本帮助

退出码：0 = 完成（--strict 下表示门禁全通过）；1 = 门禁失败或运行出错。`;

/**
 * 主流程
 * @returns {Promise<number>} 退出码
 */
async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(USAGE);
    return 0;
  }

  const targetRatio = Number.parseFloat(args.targetRatio);
  if (!Number.isFinite(targetRatio) || targetRatio <= 0 || targetRatio > 1) {
    console.error(`[错误] --target-ratio 必须是 (0,1] 之间的数字，收到：${args.targetRatio}`);
    return 1;
  }

  let mod;
  try {
    mod = await loadCoreModules();
  } catch (err) {
    console.error('[错误] 无法加载 src/core 待测模块：', err?.message ?? err);
    console.error('       请确认已在项目根目录安装依赖（node_modules/esbuild 可用）。');
    return 1;
  }

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    environment: {
      node: process.version,
      platform: `${process.platform}/${process.arch}`,
      tokenizer: 'gpt-tokenizer (cl100k_base)，经 src/core/token-counter.countTokens 实测；非估算',
      targetRatio,
    },
    config: {
      defaultConfig: mod.createDefaultConfig(),
      minCompressLength: mod.MIN_COMPRESS_LENGTH,
    },
    metrics: {
      compression: await measureCompression(mod, buildCompressionSamples(), targetRatio),
      messageList: await measureMessageList(mod),
      exemption: await measureExemption(mod),
      l0: await measurePrefixStability(mod),
      l2: await measureOutputDiscipline(mod),
    },
    requiresRealEnv: buildRequiresRealEnvMetrics(),
    baselineDiff: null,
    realEnvProbe: null,
    exitCode: 0,
  };

  if (args.withApi) {
    report.realEnvProbe = await probeRealEnv(process.env);
  }
  if (args.compare) {
    report.baselineDiff = diffWithBaseline(report);
  }

  const failedGates = collectGates(report).filter((g) => !g.pass && !g.advisoryOnly);
  report.exitCode = args.strict && failedGates.length > 0 ? 1 : 0;

  if (args.saveBaseline) {
    if (!fs.existsSync(ARTIFACTS_DIR)) fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(report, null, 2), 'utf8');
  }

  printReport(report);

  if (args.out) {
    const outPath = path.isAbsolute(args.out) ? args.out : path.join(PROJECT_ROOT, args.out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
    console.log(`\nJSON 已写入：${outPath}`);
  }
  if (args.json) {
    console.log('\n--- JSON ---');
    console.log(JSON.stringify(report, null, 2));
  }

  return report.exitCode;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error('[错误] 评估脚本运行失败：', err?.stack ?? err);
    process.exit(1);
  });
