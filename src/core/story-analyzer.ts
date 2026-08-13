/**
 * 小说结构化分析引擎 (F16.1, v1.1 新增)
 *
 * 职责：
 * 1. 将小说文本按章节/段落分块
 * 2. 为每个分块构建 LLM 分析 Prompt
 * 3. 解析 LLM 返回的 JSON 结构化数据
 * 4. 合并多个分块的分析结果（去重、关联）
 *
 * 分析流程：
 * 原始文本 → 分块 → 逐块分析（LLM）→ 解析 JSON → 合并结果 → StoryAnalysisResult
 *
 * 规则约束：
 * - 分析使用当前激活的 API 连接（依赖 F02）
 * - 快速模式仅提取人物和世界
 * - 标准模式增加场景和事件
 * - 深度模式额外生成故事脚本
 * - 分块大小上限 4000 字符（控制 Token 消耗）
 */

import type {
  AnalysisDepth,
  StoryCharacter,
  StoryScene,
  StoryEvent,
  StoryScript,
  StoryWorldInfo,
  ChunkAnalysisResult,
  StoryAnalysisResult,
} from './story-types';
import { getDepthMeta, createEmptyResult } from './story-types';
import { safeJsonParse } from './json-utils';
// i18n-ignore-start  // 模型面提示词 / mock / 种子目录，非 UI 文案（待翻译）

// ── 常量 ──

/** 单块最大字符数（控制 Token 消耗） */
const MAX_CHUNK_CHARS = 4000;

/** 章节正则（匹配"第X章"/"Chapter X"等） */
const CHAPTER_PATTERN = /^(第[一二三四五六七八九十百千零\d]+[章节回卷]|Chapter\s+\d+|CHAPTER\s+\d+)/im;

// ── 文本分块 ──

/**
 * 将小说文本按章节分块
 *
 * 算法：
 * 1. 尝试按章节标题分割（第X章 / Chapter X）
 * 2. 若无章节标记，按双换行段落分割
 * 3. 超长分块进一步切分（不超过 MAX_CHUNK_CHARS）
 *
 * @param text 原始小说文本
 * @returns 分块文本数组
 */
export function chunkNovel(text: string): string[] {
  if (!text || text.trim().length === 0) return [];

  // 1. 尝试按章节分割
  const lines = text.split('\n');
  const chapters: string[] = [];
  let currentChapter = '';

  for (const line of lines) {
    if (CHAPTER_PATTERN.test(line.trim())) {
      // 新章节开始
      if (currentChapter.trim().length > 0) {
        chapters.push(currentChapter.trim());
      }
      currentChapter = line + '\n';
    } else {
      currentChapter += line + '\n';
    }
  }
  // 最后一章
  if (currentChapter.trim().length > 0) {
    chapters.push(currentChapter.trim());
  }

  // 若未分出章节（无章节标记），按段落分块
  if (chapters.length <= 1) {
    return chunkByParagraph(text);
  }

  // 2. 超长章节进一步切分
  const result: string[] = [];
  for (const chapter of chapters) {
    if (chapter.length <= MAX_CHUNK_CHARS) {
      result.push(chapter);
    } else {
      const subChunks = splitLongText(chapter, MAX_CHUNK_CHARS);
      result.push(...subChunks);
    }
  }

  return result;
}

/**
 * 按段落（双换行）分块
 *
 * 算法：
 * 1. 按双换行分割段落
 * 2. 累积段落至接近 MAX_CHUNK_CHARS 时形成一个块
 * 3. 单个段落超过 MAX_CHUNK_CHARS 时调用 splitLongText 进一步切分
 */
function chunkByParagraph(text: string): string[] {
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p.length > 0);
  const chunks: string[] = [];
  let current = '';

  for (const para of paragraphs) {
    // 单段超过上限时直接切分（避免一个段落占满一个超大块）
    if (para.length > MAX_CHUNK_CHARS) {
      // 先把已累积的内容推出
      if (current.length > 0) {
        chunks.push(current);
        current = '';
      }
      const subChunks = splitLongText(para, MAX_CHUNK_CHARS);
      chunks.push(...subChunks);
      continue;
    }

    if (current.length + para.length + 2 > MAX_CHUNK_CHARS) {
      if (current.length > 0) chunks.push(current);
      current = para;
    } else {
      current = current.length > 0 ? `${current}\n\n${para}` : para;
    }
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/**
 * 将超长文本按句号/换行切分
 */
function splitLongText(text: string, maxLen: number): string[] {
  const sentences = text.split(/(?<=[。！？.!?])\s*/);
  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    if (current.length + sentence.length > maxLen) {
      if (current.length > 0) chunks.push(current);
      // 单句超过 maxLen 时强制截断
      if (sentence.length > maxLen) {
        for (let i = 0; i < sentence.length; i += maxLen) {
          chunks.push(sentence.slice(i, i + maxLen));
        }
        current = '';
      } else {
        current = sentence;
      }
    } else {
      current += sentence;
    }
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

// ── Prompt 构建 ──

/**
 * 构建单块分析的 LLM 消息
 *
 * @param chunkText 分块文本
 * @param depth 分析深度
 * @param chunkIndex 当前分块索引
 * @param totalChunks 总分块数
 * @param previousContext 前序分块的简要摘要（用于保持上下文连贯）
 * @returns LLM 消息列表
 */
export function buildAnalysisMessages(
  chunkText: string,
  depth: AnalysisDepth,
  chunkIndex: number,
  totalChunks: number,
  previousContext?: string
): Array<{ role: 'system' | 'user'; content: string }> {
  const meta = getDepthMeta(depth);
  const extractScenes = meta?.extractScenes ?? false;
  const extractEvents = meta?.extractEvents ?? false;
  const extractScript = meta?.extractScript ?? false;

  const systemContent = `你是一个专业的小说结构化分析助手。你的任务是从小说文本中提取结构化信息，包括人物、世界设定${extractScenes ? '、场景' : ''}${extractEvents ? '、事件' : ''}${extractScript ? '、故事脚本' : ''}。

请严格按照 JSON 格式返回分析结果，不要输出任何其他文字或解释。`;

  const fieldsInstruction = buildFieldsInstruction(depth);

  const userContent = `请分析以下小说文本（第 ${chunkIndex + 1}/${totalChunks} 块）并提取结构化信息。

${previousContext ? `【前序内容摘要】\n${previousContext}\n` : ''}

【待分析文本】
${chunkText}

请返回纯 JSON（不要 markdown 代码块包裹），结构如下：
${fieldsInstruction}

要求：
1. 只返回 JSON，不要任何解释或 markdown 包裹
2. 人物名使用文本中出现的原名，别名记录到 aliases
3. 人物关系需明确目标人物名和关系描述
4. 场景的 parent 字段表示层级关系（如"市场"的 parent 为"王都"）
5. 事件按故事时间线排序，order 从 1 开始
6. 若该分块无某类信息，返回空数组`;

  return [
    { role: 'system', content: systemContent },
    { role: 'user', content: userContent },
  ];
}

/**
 * 根据分析深度构建 JSON 字段说明
 */
function buildFieldsInstruction(depth: AnalysisDepth): string {
  const meta = getDepthMeta(depth);
  const fields: string[] = [
    '"characters": [',
    '  {',
    '    "name": "人物名",',
    '    "aliases": ["别名1"],',
    '    "description": "外貌、性格、背景描述（50-200字）",',
    '    "relationships": [{"target": "目标人物名", "relation": "关系描述"}]',
    '  }',
    ']',
    '"worldInfo": {',
    '  "name": "世界名称",',
    '  "type": "世界类型（奇幻/科幻/现代/末日/历史/其他）",',
    '  "description": "世界设定描述（50-200字）",',
    '  "coreSettings": ["核心设定1", "核心设定2"],',
    '  "factions": ["势力1", "势力2"]',
    '}',
  ];

  if (meta?.extractScenes) {
    fields.push(
      '"scenes": [',
      '  {',
      '    "name": "场景名",',
      '    "type": "场景类型（城市/野外/室内/地下等）",',
      '    "description": "场景描述（30-100字）",',
      '    "parent": "父场景名（可选）"',
      '  }',
      ']'
    );
  }

  if (meta?.extractEvents) {
    fields.push(
      '"events": [',
      '  {',
      '    "name": "事件名",',
      '    "description": "事件描述（50-150字）",',
      '    "characters": ["参与人物1", "参与人物2"],',
      '    "scene": "发生场景名（可选）",',
      '    "order": 1,',
      '    "type": "事件类型（战斗/对话/探索/转折等）"',
      '  }',
      ']'
    );
  }

  if (meta?.extractScript) {
    fields.push(
      '"scripts": [',
      '  {',
      '    "name": "脚本名",',
      '    "content": "脚本内容（故事大纲，100-300字）",',
      '    "type": "main",',
      '    "characters": ["涉及人物1"],',
      '    "scenes": ["涉及场景1"]',
      '  }',
      ']'
    );
  }

  return `{\n${fields.join('\n')}\n}`;
}

/**
 * 构建深度模式的故事脚本生成 Prompt
 * 在所有分块分析完成后，额外调用一次生成整体故事脚本
 */
export function buildScriptGenerationMessages(
  characters: StoryCharacter[],
  scenes: StoryScene[],
  events: StoryEvent[],
  worldInfo?: StoryWorldInfo
): Array<{ role: 'system' | 'user'; content: string }> {
  const charSummary = characters.map((c) => `- ${c.name}：${c.description.slice(0, 50)}`).join('\n');
  const sceneSummary = scenes.map((s) => `- ${s.name}（${s.type}）：${s.description.slice(0, 50)}`).join('\n');
  const eventSummary = events.map((e) => `- ${e.name}（${e.type}）：${e.description.slice(0, 50)}`).join('\n');

  const systemContent = `你是一个故事脚本创作助手。基于已有的小说结构化分析结果，生成可执行的故事脚本大纲。请严格按照 JSON 格式返回，不要输出任何其他文字。`;

  const userContent = `基于以下小说结构化分析结果，生成故事脚本。

【世界设定】
${worldInfo ? `${worldInfo.name}（${worldInfo.type}）：${worldInfo.description}` : '无'}

【人物】
${charSummary || '无'}

【场景】
${sceneSummary || '无'}

【事件】
${eventSummary || '无'}

请生成 2-5 个故事脚本，覆盖主线和支线，返回纯 JSON 数组：
{
  "scripts": [
    {
      "name": "脚本名",
      "content": "脚本内容（100-300字的故事大纲，包含起承转合）",
      "type": "main",
      "characters": ["涉及人物1", "涉及人物2"],
      "scenes": ["涉及场景1"]
    }
  ]
}

要求：
1. type 可选：main（主线）、side（支线）、background（背景）
2. 脚本内容需体现时间推进和情节发展
3. 只返回 JSON，不要 markdown 包裹`;

  return [
    { role: 'system', content: systemContent },
    { role: 'user', content: userContent },
  ];
}

// ── LLM 响应解析 ──

/**
 * 从 LLM 返回的文本中提取 JSON
 *
 * 委托至共享工具 safeJsonParse，保持向后兼容的导出签名。
 * 容错处理：去除 ```json ... ``` 代码块包裹、首尾非 JSON 字符、修复尾逗号。
 */
export function extractJson(rawText: string): unknown {
  return safeJsonParse(rawText);
}

/**
 * 解析单个分块的分析结果
 */
export function parseChunkResult(
  rawText: string,
  chunkIndex: number
): ChunkAnalysisResult {
  const data = extractJson(rawText) as Record<string, unknown> | null;

  if (!data || typeof data !== 'object') {
    return {
      chunkIndex,
      characters: [],
      scenes: [],
      events: [],
    };
  }

  const characters = parseCharacters(data.characters);
  const scenes = parseScenes(data.scenes);
  const events = parseEvents(data.events);
  const worldInfo = parseWorldInfo(data.worldInfo);

  return {
    chunkIndex,
    characters,
    scenes,
    events,
    worldInfo,
  };
}

/** 解析人物数组 */
function parseCharacters(raw: unknown): StoryCharacter[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c) => c && typeof c === 'object' && typeof (c as StoryCharacter).name === 'string')
    .map((c) => {
      const obj = c as Record<string, unknown>;
      return {
        name: String(obj.name || ''),
        aliases: Array.isArray(obj.aliases) ? obj.aliases.map(String) : undefined,
        description: String(obj.description || ''),
        relationships: Array.isArray(obj.relationships)
          ? obj.relationships
              .filter((r) => r && typeof r === 'object')
              .map((r) => {
                const rel = r as Record<string, unknown>;
                return {
                  target: String(rel.target || ''),
                  relation: String(rel.relation || ''),
                };
              })
          : undefined,
        appearances: Array.isArray(obj.appearances) ? obj.appearances.map(Number) : undefined,
        attributes: obj.attributes && typeof obj.attributes === 'object'
          ? Object.fromEntries(Object.entries(obj.attributes).map(([k, v]) => [k, String(v)]))
          : undefined,
      } as StoryCharacter;
    });
}

/** 解析场景数组 */
function parseScenes(raw: unknown): StoryScene[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s) => s && typeof s === 'object' && typeof (s as StoryScene).name === 'string')
    .map((s) => {
      const obj = s as Record<string, unknown>;
      return {
        name: String(obj.name || ''),
        type: String(obj.type || '未知'),
        description: String(obj.description || ''),
        parent: obj.parent ? String(obj.parent) : undefined,
        appearances: Array.isArray(obj.appearances) ? obj.appearances.map(Number) : undefined,
      } as StoryScene;
    });
}

/** 解析事件数组 */
function parseEvents(raw: unknown): StoryEvent[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e) => e && typeof e === 'object' && typeof (e as StoryEvent).name === 'string')
    .map((e) => {
      const obj = e as Record<string, unknown>;
      return {
        name: String(obj.name || ''),
        description: String(obj.description || ''),
        characters: Array.isArray(obj.characters) ? obj.characters.map(String) : [],
        scene: obj.scene ? String(obj.scene) : undefined,
        order: Number(obj.order) || 0,
        type: String(obj.type || '其他'),
      } as StoryEvent;
    });
}

/** 解析世界信息 */
function parseWorldInfo(raw: unknown): StoryWorldInfo | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.name !== 'string') return undefined;
  return {
    name: String(obj.name || ''),
    type: String(obj.type || '其他'),
    description: String(obj.description || ''),
    coreSettings: Array.isArray(obj.coreSettings) ? obj.coreSettings.map(String) : undefined,
    factions: Array.isArray(obj.factions) ? obj.factions.map(String) : undefined,
  };
}

/** 解析故事脚本数组 */
function parseScripts(raw: unknown): StoryScript[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s) => s && typeof s === 'object' && typeof (s as StoryScript).name === 'string')
    .map((s) => {
      const obj = s as Record<string, unknown>;
      return {
        name: String(obj.name || ''),
        content: String(obj.content || ''),
        type: (obj.type === 'side' || obj.type === 'background' ? obj.type : 'main') as StoryScript['type'],
        characters: Array.isArray(obj.characters) ? obj.characters.map(String) : [],
        scenes: Array.isArray(obj.scenes) ? obj.scenes.map(String) : [],
      } as StoryScript;
    });
}

/**
 * 解析深度模式的脚本生成结果
 */
export function parseScriptResult(rawText: string): StoryScript[] {
  const data = extractJson(rawText) as Record<string, unknown> | null;
  if (!data || typeof data !== 'object') return [];
  // 可能是 { scripts: [...] } 或直接是数组
  const scriptsRaw = Array.isArray(data) ? data : data.scripts;
  return parseScripts(scriptsRaw);
}

// ── 结果合并 ──

/**
 * 合并多个分块的分析结果
 *
 * 合并策略：
 * - 人物：按名称去重，合并别名和关系
 * - 场景：按名称去重，保留层级关系
 * - 事件：按名称去重，重新排序 order
 * - 世界信息：取第一个非空的 worldInfo
 * - 脚本：直接合并（去重）
 */
export function mergeResults(
  results: ChunkAnalysisResult[],
  depth: AnalysisDepth
): Pick<StoryAnalysisResult, 'characters' | 'scenes' | 'events' | 'scripts' | 'worldInfo'> {
  const meta = getDepthMeta(depth);

  // 合并人物（按名称去重）
  const characterMap = new Map<string, StoryCharacter>();
  for (const result of results) {
    for (const char of result.characters) {
      const key = char.name.toLowerCase();
      const existing = characterMap.get(key);
      if (existing) {
        // 合并别名
        const aliases = new Set([...(existing.aliases ?? []), ...(char.aliases ?? [])]);
        // 合并关系
        const relationships = [
          ...(existing.relationships ?? []),
          ...(char.relationships ?? []),
        ];
        // 合并出场
        const appearances = [
          ...(existing.appearances ?? []),
          ...(char.appearances ?? []),
        ].sort((a, b) => a - b);
        // 取较长的描述
        const description = char.description.length > existing.description.length
          ? char.description
          : existing.description;
        characterMap.set(key, {
          ...existing,
          aliases: aliases.size > 0 ? Array.from(aliases) : undefined,
          relationships: relationships.length > 0 ? relationships : undefined,
          appearances: appearances.length > 0 ? Array.from(new Set(appearances)) : undefined,
          description,
        });
      } else {
        characterMap.set(key, char);
      }
    }
  }

  // 合并场景（按名称去重）
  const sceneMap = new Map<string, StoryScene>();
  for (const result of results) {
    if (!meta?.extractScenes) break;
    for (const scene of result.scenes) {
      const key = scene.name.toLowerCase();
      if (!sceneMap.has(key)) {
        sceneMap.set(key, scene);
      }
    }
  }

  // 合并事件（按名称去重，重新排序）
  const eventMap = new Map<string, StoryEvent>();
  for (const result of results) {
    if (!meta?.extractEvents) break;
    for (const event of result.events) {
      const key = event.name.toLowerCase();
      if (!eventMap.has(key)) {
        eventMap.set(key, event);
      }
    }
  }
  // 重新排序 order
  const events = Array.from(eventMap.values()).sort((a, b) => a.order - b.order);
  events.forEach((e, i) => { e.order = i + 1; });

  // 取第一个非空世界信息
  let worldInfo: StoryWorldInfo | undefined;
  for (const result of results) {
    if (result.worldInfo) {
      worldInfo = result.worldInfo;
      break;
    }
  }

  return {
    characters: Array.from(characterMap.values()),
    scenes: Array.from(sceneMap.values()),
    events,
    scripts: [], // 脚本在深度模式中单独生成
    worldInfo,
  };
}

// ── 构建前序摘要 ──

/**
 * 为后续分块构建前序摘要（保持上下文连贯）
 * 提取前一个分块的关键人物名和场景名
 */
export function buildPreviousContext(prevResult: ChunkAnalysisResult): string {
  const parts: string[] = [];
  if (prevResult.characters.length > 0) {
    const names = prevResult.characters.slice(0, 5).map((c) => c.name).join('、');
    parts.push(`已出现人物：${names}`);
  }
  if (prevResult.scenes.length > 0) {
    const names = prevResult.scenes.slice(0, 3).map((s) => s.name).join('、');
    parts.push(`已出现场景：${names}`);
  }
  if (prevResult.events.length > 0) {
    const names = prevResult.events.slice(0, 3).map((e) => e.name).join('、');
    parts.push(`已发生事件：${names}`);
  }
  return parts.length > 0 ? parts.join('\n') : '';
}

// ── 创建最终结果 ──

/**
 * 创建完整的分析结果（合并完成后调用）
 */
export function createAnalysisResult(
  sourceFileName: string,
  depth: AnalysisDepth,
  text: string,
  chunks: string[],
  merged: Pick<StoryAnalysisResult, 'characters' | 'scenes' | 'events' | 'scripts' | 'worldInfo'>,
  errors?: string[]
): StoryAnalysisResult {
  const result = createEmptyResult(sourceFileName, depth, text.length, chunks.length);
  result.status = errors && errors.length > 0 ? 'failed' : 'completed';
  result.completedAt = Date.now();
  result.characters = merged.characters;
  result.scenes = merged.scenes;
  result.events = merged.events;
  result.scripts = merged.scripts;
  result.worldInfo = merged.worldInfo;
  if (errors && errors.length > 0) {
    result.errors = errors;
  }
  return result;
}

// ── T-08: 小说分析结果 → 生成器源素材上下文 ──

/**
 * 从小说分析结果提取「源素材参考」文本，供世界书/角色卡生成器注入。
 *
 * 拼接规则（按优先级）：
 * 1. 世界信息（名称/类型/描述/核心设定/势力）
 * 2. 主要人物前 6 名（名称 + 描述摘要 120 字）
 * 3. 主要场景前 3 个（名称 + 描述摘要 80 字）
 *
 * @param result 已完成的故事分析结果
 * @returns 上下文文本；无可用信息时返回空串
 */
export function buildSourceContext(result: StoryAnalysisResult): string {
  const parts: string[] = [];

  const w = result.worldInfo;
  if (w) {
    const worldParts: string[] = [];
    if (w.name) worldParts.push(`世界名称：${w.name}`);
    if (w.type) worldParts.push(`世界类型：${w.type}`);
    if (w.description) worldParts.push(`世界描述：${truncate(w.description, 200)}`);
    if (w.coreSettings?.length) {
      worldParts.push(`核心设定：${w.coreSettings.slice(0, 6).join('；')}`);
    }
    if (w.factions?.length) {
      worldParts.push(`主要势力：${w.factions.slice(0, 6).join('；')}`);
    }
    if (worldParts.length > 0) parts.push(worldParts.join('\n'));
  }

  const chars = (result.characters ?? []).slice(0, 6);
  if (chars.length > 0) {
    const charParts = chars.map(
      (c) => `- ${c.name}${c.description ? `：${truncate(c.description, 120)}` : ''}`
    );
    parts.push(`主要人物：\n${charParts.join('\n')}`);
  }

  const scenes = (result.scenes ?? []).slice(0, 3);
  if (scenes.length > 0) {
    const sceneParts = scenes.map(
      (s) => `- ${s.name}${s.description ? `：${truncate(s.description, 80)}` : ''}`
    );
    parts.push(`主要场景：\n${sceneParts.join('\n')}`);
  }

  return parts.join('\n\n');
}

/** 截断文本到指定长度（按字符） */
function truncate(text: string, maxLen: number): string {
  return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text;
}
// i18n-ignore-end
