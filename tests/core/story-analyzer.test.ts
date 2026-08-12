/**
 * story-analyzer 单元测试 (迭代31 · F16.1)
 *
 * 覆盖：
 * - chunkNovel：文本分块（章节、段落、超长切分）
 * - buildAnalysisMessages：分析 Prompt 构建
 * - parseChunkResult：LLM 响应解析（含容错）
 * - mergeResults：多分块结果合并
 * - buildPreviousContext：前序摘要构建
 * - createAnalysisResult：最终结果创建
 * - buildScriptGenerationMessages：脚本生成 Prompt
 * - parseScriptResult：脚本结果解析
 * - extractJson：JSON 提取容错
 */
import { describe, test, expect } from 'vitest';
import {
  chunkNovel,
  buildAnalysisMessages,
  parseChunkResult,
  mergeResults,
  buildPreviousContext,
  createAnalysisResult,
  buildScriptGenerationMessages,
  parseScriptResult,
  extractJson,
} from '@core/story-analyzer';
import {
  ANALYSIS_DEPTHS,
  getDepthMeta,
  createEmptyResult,
  generateStoryId,
  INITIAL_PROGRESS,
  type ChunkAnalysisResult,
  type StoryCharacter,
  type StoryScene,
  type StoryEvent,
  type StoryWorldInfo,
} from '@core/story-types';

// ── 测试夹具 ──

function makeCharacter(overrides: Partial<StoryCharacter> = {}): StoryCharacter {
  return {
    name: '艾莉娅',
    description: '一位勇敢的精灵法师',
    ...overrides,
  };
}

function makeScene(overrides: Partial<StoryScene> = {}): StoryScene {
  return {
    name: '王都',
    type: '城市',
    description: '繁华的王都中心',
    ...overrides,
  };
}

function makeEvent(overrides: Partial<StoryEvent> = {}): StoryEvent {
  return {
    name: '决战',
    description: '勇者与魔王的最终决战',
    characters: ['勇者', '魔王'],
    order: 1,
    type: '战斗',
    ...overrides,
  };
}

function makeWorldInfo(overrides: Partial<StoryWorldInfo> = {}): StoryWorldInfo {
  return {
    name: '艾泽兰大陆',
    type: '奇幻',
    description: '一个充满魔法与冒险的世界',
    ...overrides,
  };
}

function makeChunkResult(
  overrides: Partial<ChunkAnalysisResult> = {}
): ChunkAnalysisResult {
  return {
    chunkIndex: 0,
    characters: [makeCharacter()],
    scenes: [makeScene()],
    events: [makeEvent()],
    worldInfo: makeWorldInfo(),
    ...overrides,
  };
}

// ── 测试用例 ──

describe('story-analyzer (F16.1)', () => {
  // ── chunkNovel ──

  describe('chunkNovel 文本分块', () => {
    test('空文本返回空数组', () => {
      expect(chunkNovel('')).toEqual([]);
      expect(chunkNovel('   ')).toEqual([]);
      expect(chunkNovel('\n\n\n')).toEqual([]);
    });

    test('无章节标记按段落分块', () => {
      const text = '段落一内容。\n\n段落二内容。\n\n段落三内容。';
      const chunks = chunkNovel(text);
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0]).toContain('段落一');
    });

    test('按章节标记分块', () => {
      const text = [
        '第一章 出发',
        '勇者离开了村庄。',
        '第二章 森林',
        '勇者进入了森林。',
        '第三章 城堡',
        '勇者到达了城堡。',
      ].join('\n');
      const chunks = chunkNovel(text);
      expect(chunks.length).toBe(3);
      expect(chunks[0]).toContain('第一章');
      expect(chunks[1]).toContain('第二章');
      expect(chunks[2]).toContain('第三章');
    });

    test('支持 Chapter X 英文章节标记', () => {
      const text = [
        'Chapter 1 Beginnings',
        'The hero left the village.',
        'Chapter 2 Forest',
        'The hero entered the forest.',
      ].join('\n');
      const chunks = chunkNovel(text);
      expect(chunks.length).toBe(2);
    });

    test('支持 CHAPTER 大写章节标记', () => {
      const text = [
        'CHAPTER 1 Introduction',
        'Some content.',
        'CHAPTER 2 Conflict',
        'More content.',
      ].join('\n');
      const chunks = chunkNovel(text);
      expect(chunks.length).toBe(2);
    });

    test('支持第X节/X回/X卷标记', () => {
      const text = [
        '第一节 开端',
        '内容一',
        '第二节 发展',
        '内容二',
      ].join('\n');
      const chunks = chunkNovel(text);
      expect(chunks.length).toBe(2);
    });

    test('超长章节进一步切分', () => {
      const longContent = 'A'.repeat(5000);
      const text = `第一章 长章节\n${longContent}`;
      const chunks = chunkNovel(text);
      // 5000 字符应被切分为多个块（每块 ≤4000）
      expect(chunks.length).toBeGreaterThan(1);
    });

    test('单段超长文本强制截断', () => {
      const text = 'A'.repeat(10000);
      const chunks = chunkNovel(text);
      expect(chunks.length).toBeGreaterThan(1);
      for (const chunk of chunks) {
        expect(chunk.length).toBeLessThanOrEqual(4000);
      }
    });

    test('保留章节内容', () => {
      const text = '第一章\n内容A\n第二章\n内容B';
      const chunks = chunkNovel(text);
      expect(chunks.length).toBe(2);
      expect(chunks[0]).toContain('内容A');
      expect(chunks[1]).toContain('内容B');
    });
  });

  // ── buildAnalysisMessages ──

  describe('buildAnalysisMessages Prompt 构建', () => {
    test('返回 system + user 两条消息', () => {
      const messages = buildAnalysisMessages('文本', 'standard', 0, 3);
      expect(messages.length).toBe(2);
      expect(messages[0].role).toBe('system');
      expect(messages[1].role).toBe('user');
    });

    test('system 消息包含结构化分析说明', () => {
      const messages = buildAnalysisMessages('文本', 'standard', 0, 1);
      expect(messages[0].content).toContain('结构化分析');
    });

    test('user 消息包含分块索引信息', () => {
      const messages = buildAnalysisMessages('文本', 'standard', 2, 5);
      expect(messages[1].content).toContain('第 3/5 块');
    });

    test('user 消息包含待分析文本', () => {
      const text = '这是一段测试文本';
      const messages = buildAnalysisMessages(text, 'standard', 0, 1);
      expect(messages[1].content).toContain(text);
    });

    test('quick 模式不包含场景字段说明', () => {
      const messages = buildAnalysisMessages('文本', 'quick', 0, 1);
      // quick 模式不提取场景，但 Prompt 仍包含 worldInfo
      expect(messages[1].content).toContain('worldInfo');
      expect(messages[1].content).not.toContain('"scenes"');
    });

    test('standard 模式包含场景和事件字段', () => {
      const messages = buildAnalysisMessages('文本', 'standard', 0, 1);
      expect(messages[1].content).toContain('"scenes"');
      expect(messages[1].content).toContain('"events"');
    });

    test('deep 模式包含脚本字段', () => {
      const messages = buildAnalysisMessages('文本', 'deep', 0, 1);
      expect(messages[1].content).toContain('"scripts"');
    });

    test('包含前序内容摘要', () => {
      const ctx = '已出现人物：艾莉娅';
      const messages = buildAnalysisMessages('文本', 'standard', 1, 2, ctx);
      expect(messages[1].content).toContain(ctx);
    });

    test('无前序摘要时不包含摘要段落', () => {
      const messages = buildAnalysisMessages('文本', 'standard', 0, 1);
      expect(messages[1].content).not.toContain('【前序内容摘要】');
    });
  });

  // ── parseChunkResult ──

  describe('parseChunkResult 结果解析', () => {
    test('解析有效 JSON', () => {
      const raw = JSON.stringify({
        characters: [
          { name: '艾莉娅', description: '精灵法师' },
        ],
        scenes: [
          { name: '王都', type: '城市', description: '繁华都市' },
        ],
        events: [
          { name: '战斗', description: '激战', characters: ['勇者'], order: 1, type: '战斗' },
        ],
        worldInfo: {
          name: '艾泽兰',
          type: '奇幻',
          description: '魔法世界',
        },
      });
      const result = parseChunkResult(raw, 0);
      expect(result.chunkIndex).toBe(0);
      expect(result.characters.length).toBe(1);
      expect(result.characters[0].name).toBe('艾莉娅');
      expect(result.scenes.length).toBe(1);
      expect(result.events.length).toBe(1);
      expect(result.worldInfo?.name).toBe('艾泽兰');
    });

    test('解析带 markdown 代码块包裹的 JSON', () => {
      const raw = '```json\n{"characters":[{"name":"测试","description":""}],"scenes":[],"events":[]}\n```';
      const result = parseChunkResult(raw, 1);
      expect(result.chunkIndex).toBe(1);
      expect(result.characters.length).toBe(1);
      expect(result.characters[0].name).toBe('测试');
    });

    test('解析无 markdown 标记的 ``` 包裹', () => {
      const raw = '```\n{"characters":[],"scenes":[],"events":[]}\n```';
      const result = parseChunkResult(raw, 0);
      expect(result.characters.length).toBe(0);
    });

    test('解析前后带多余文本的 JSON', () => {
      const raw = '好的，以下是分析结果：\n{"characters":[{"name":"人物","description":""}],"scenes":[],"events":[]}\n以上是结果。';
      const result = parseChunkResult(raw, 0);
      expect(result.characters.length).toBe(1);
      expect(result.characters[0].name).toBe('人物');
    });

    test('解析尾逗号容错', () => {
      const raw = '{"characters":[{"name":"测试","description":"",}],"scenes":[],"events":[]}';
      const result = parseChunkResult(raw, 0);
      expect(result.characters.length).toBe(1);
    });

    test('无效 JSON 返回空结果', () => {
      const result = parseChunkResult('not a json', 0);
      expect(result.characters).toEqual([]);
      expect(result.scenes).toEqual([]);
      expect(result.events).toEqual([]);
      expect(result.worldInfo).toBeUndefined();
    });

    test('空字符串返回空结果', () => {
      const result = parseChunkResult('', 0);
      expect(result.characters).toEqual([]);
    });

    test('null 返回空结果', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = parseChunkResult(null as any, 0);
      expect(result.characters).toEqual([]);
    });

    test('保留 chunkIndex', () => {
      const result = parseChunkResult('{}', 5);
      expect(result.chunkIndex).toBe(5);
    });

    test('人物字段缺省时使用默认值', () => {
      const raw = '{"characters":[{"name":"无名"}],"scenes":[],"events":[]}';
      const result = parseChunkResult(raw, 0);
      expect(result.characters[0].description).toBe('');
    });

    test('事件 characters 字段缺失时为空数组', () => {
      const raw = '{"events":[{"name":"事件","description":"","order":1,"type":"其他"}]}';
      const result = parseChunkResult(raw, 0);
      expect(result.events[0].characters).toEqual([]);
    });

    test('场景 type 缺省时为"未知"', () => {
      const raw = '{"scenes":[{"name":"场景","description":""}]}';
      const result = parseChunkResult(raw, 0);
      expect(result.scenes[0].type).toBe('未知');
    });

    test('解析人物别名和关系', () => {
      const raw = JSON.stringify({
        characters: [
          {
            name: '艾莉娅',
            aliases: ['小艾', '艾尔'],
            description: '法师',
            relationships: [
              { target: '勇者', relation: '同伴' },
            ],
          },
        ],
        scenes: [],
        events: [],
      });
      const result = parseChunkResult(raw, 0);
      expect(result.characters[0].aliases).toEqual(['小艾', '艾尔']);
      expect(result.characters[0].relationships?.[0].target).toBe('勇者');
    });
  });

  // ── mergeResults ──

  describe('mergeResults 多块合并', () => {
    test('空数组返回空结果', () => {
      const merged = mergeResults([], 'standard');
      expect(merged.characters).toEqual([]);
      expect(merged.scenes).toEqual([]);
      expect(merged.events).toEqual([]);
      expect(merged.scripts).toEqual([]);
      expect(merged.worldInfo).toBeUndefined();
    });

    test('单个结果直接返回', () => {
      const chunk = makeChunkResult();
      const merged = mergeResults([chunk], 'standard');
      expect(merged.characters.length).toBe(1);
      expect(merged.characters[0].name).toBe('艾莉娅');
    });

    test('人物按名称去重', () => {
      const chunk1 = makeChunkResult({
        characters: [makeCharacter({ name: '艾莉娅', description: '短描述' })],
      });
      const chunk2 = makeChunkResult({
        chunkIndex: 1,
        characters: [makeCharacter({ name: '艾莉娅', description: '更长的描述内容' })],
      });
      const merged = mergeResults([chunk1, chunk2], 'standard');
      expect(merged.characters.length).toBe(1);
      // 取较长的描述
      expect(merged.characters[0].description).toBe('更长的描述内容');
    });

    test('人物名称大小写不敏感去重', () => {
      const chunk1 = makeChunkResult({
        characters: [makeCharacter({ name: 'Alice' })],
      });
      const chunk2 = makeChunkResult({
        chunkIndex: 1,
        characters: [makeCharacter({ name: 'alice' })],
      });
      const merged = mergeResults([chunk1, chunk2], 'standard');
      expect(merged.characters.length).toBe(1);
    });

    test('合并人物别名', () => {
      const chunk1 = makeChunkResult({
        characters: [makeCharacter({ name: '艾莉娅', aliases: ['小艾'] })],
      });
      const chunk2 = makeChunkResult({
        chunkIndex: 1,
        characters: [makeCharacter({ name: '艾莉娅', aliases: ['艾尔'] })],
      });
      const merged = mergeResults([chunk1, chunk2], 'standard');
      expect(merged.characters[0].aliases).toContain('小艾');
      expect(merged.characters[0].aliases).toContain('艾尔');
    });

    test('合并人物关系', () => {
      const chunk1 = makeChunkResult({
        characters: [
          makeCharacter({
            name: '艾莉娅',
            relationships: [{ target: '勇者', relation: '同伴' }],
          }),
        ],
      });
      const chunk2 = makeChunkResult({
        chunkIndex: 1,
        characters: [
          makeCharacter({
            name: '艾莉娅',
            relationships: [{ target: '魔王', relation: '敌人' }],
          }),
        ],
      });
      const merged = mergeResults([chunk1, chunk2], 'standard');
      expect(merged.characters[0].relationships?.length).toBe(2);
    });

    test('场景按名称去重', () => {
      const chunk1 = makeChunkResult({
        scenes: [makeScene({ name: '王都' })],
      });
      const chunk2 = makeChunkResult({
        chunkIndex: 1,
        scenes: [makeScene({ name: '王都' }), makeScene({ name: '森林' })],
      });
      const merged = mergeResults([chunk1, chunk2], 'standard');
      expect(merged.scenes.length).toBe(2);
    });

    test('事件按名称去重并重排 order', () => {
      const chunk1 = makeChunkResult({
        events: [makeEvent({ name: '事件A', order: 5 })],
      });
      const chunk2 = makeChunkResult({
        chunkIndex: 1,
        events: [makeEvent({ name: '事件B', order: 3 })],
      });
      const merged = mergeResults([chunk1, chunk2], 'standard');
      expect(merged.events.length).toBe(2);
      // 重新排序
      expect(merged.events[0].order).toBe(1);
      expect(merged.events[1].order).toBe(2);
    });

    test('取第一个非空世界信息', () => {
      const world1 = makeWorldInfo({ name: '世界1' });
      const world2 = makeWorldInfo({ name: '世界2' });
      const chunk1 = makeChunkResult({ worldInfo: undefined });
      const chunk2 = makeChunkResult({ chunkIndex: 1, worldInfo: world1 });
      const chunk3 = makeChunkResult({ chunkIndex: 2, worldInfo: world2 });
      const merged = mergeResults([chunk1, chunk2, chunk3], 'standard');
      expect(merged.worldInfo?.name).toBe('世界1');
    });

    test('quick 模式不提取场景和事件', () => {
      const chunk = makeChunkResult({
        scenes: [makeScene()],
        events: [makeEvent()],
      });
      const merged = mergeResults([chunk], 'quick');
      expect(merged.scenes.length).toBe(0);
      expect(merged.events.length).toBe(0);
    });

    test('脚本字段初始为空数组', () => {
      const merged = mergeResults([makeChunkResult()], 'deep');
      expect(merged.scripts).toEqual([]);
    });
  });

  // ── buildPreviousContext ──

  describe('buildPreviousContext 前序摘要', () => {
    test('空结果返回空字符串', () => {
      const empty: ChunkAnalysisResult = {
        chunkIndex: 0,
        characters: [],
        scenes: [],
        events: [],
      };
      expect(buildPreviousContext(empty)).toBe('');
    });

    test('包含人物名', () => {
      const result: ChunkAnalysisResult = {
        chunkIndex: 0,
        characters: [makeCharacter({ name: '艾莉娅' }), makeCharacter({ name: '勇者' })],
        scenes: [],
        events: [],
      };
      const ctx = buildPreviousContext(result);
      expect(ctx).toContain('艾莉娅');
      expect(ctx).toContain('勇者');
    });

    test('包含场景名', () => {
      const result: ChunkAnalysisResult = {
        chunkIndex: 0,
        characters: [],
        scenes: [makeScene({ name: '王都' })],
        events: [],
      };
      const ctx = buildPreviousContext(result);
      expect(ctx).toContain('王都');
    });

    test('包含事件名', () => {
      const result: ChunkAnalysisResult = {
        chunkIndex: 0,
        characters: [],
        scenes: [],
        events: [makeEvent({ name: '决战' })],
      };
      const ctx = buildPreviousContext(result);
      expect(ctx).toContain('决战');
    });

    test('人物最多显示 5 个', () => {
      const characters = Array.from({ length: 10 }, (_, i) =>
        makeCharacter({ name: `人物${i}` })
      );
      const result: ChunkAnalysisResult = {
        chunkIndex: 0,
        characters,
        scenes: [],
        events: [],
      };
      const ctx = buildPreviousContext(result);
      expect(ctx).toContain('人物0');
      expect(ctx).toContain('人物4');
      expect(ctx).not.toContain('人物5');
    });
  });

  // ── createAnalysisResult ──

  describe('createAnalysisResult 最终结果创建', () => {
    test('创建 completed 状态结果', () => {
      const text = '测试文本';
      const chunks = ['测试'];
      const merged = {
        characters: [makeCharacter()],
        scenes: [],
        events: [],
        scripts: [],
        worldInfo: makeWorldInfo(),
      };
      const result = createAnalysisResult('test.txt', 'standard', text, chunks, merged);
      expect(result.status).toBe('completed');
      expect(result.sourceFileName).toBe('test.txt');
      expect(result.depth).toBe('standard');
      expect(result.textLength).toBe(text.length);
      expect(result.chunkCount).toBe(1);
      expect(result.completedAt).toBeDefined();
      expect(result.characters.length).toBe(1);
    });

    test('有错误时状态为 failed', () => {
      const result = createAnalysisResult(
        'test.txt',
        'standard',
        '文本',
        ['块'],
        { characters: [], scenes: [], events: [], scripts: [], worldInfo: undefined },
        ['错误1', '错误2']
      );
      expect(result.status).toBe('failed');
      expect(result.errors).toEqual(['错误1', '错误2']);
    });

    test('无错误时不设置 errors 字段', () => {
      const result = createAnalysisResult(
        'test.txt',
        'standard',
        '文本',
        ['块'],
        { characters: [], scenes: [], events: [], scripts: [], worldInfo: undefined }
      );
      expect(result.errors).toBeUndefined();
    });
  });

  // ── buildScriptGenerationMessages ──

  describe('buildScriptGenerationMessages 脚本生成 Prompt', () => {
    test('返回 system + user 两条消息', () => {
      const messages = buildScriptGenerationMessages(
        [makeCharacter()],
        [makeScene()],
        [makeEvent()],
        makeWorldInfo()
      );
      expect(messages.length).toBe(2);
      expect(messages[0].role).toBe('system');
      expect(messages[1].role).toBe('user');
    });

    test('user 消息包含世界设定', () => {
      const world = makeWorldInfo({ name: '测试世界' });
      const messages = buildScriptGenerationMessages([], [], [], world);
      expect(messages[1].content).toContain('测试世界');
    });

    test('user 消息包含人物摘要', () => {
      const chars = [makeCharacter({ name: '艾莉娅', description: '精灵法师描述' })];
      const messages = buildScriptGenerationMessages(chars, [], [], undefined);
      expect(messages[1].content).toContain('艾莉娅');
    });

    test('user 消息包含场景摘要', () => {
      const scenes = [makeScene({ name: '王都' })];
      const messages = buildScriptGenerationMessages([], scenes, [], undefined);
      expect(messages[1].content).toContain('王都');
    });

    test('user 消息包含事件摘要', () => {
      const events = [makeEvent({ name: '决战' })];
      const messages = buildScriptGenerationMessages([], [], events, undefined);
      expect(messages[1].content).toContain('决战');
    });

    test('无世界信息时显示"无"', () => {
      const messages = buildScriptGenerationMessages([], [], [], undefined);
      expect(messages[1].content).toContain('无');
    });

    test('system 消息说明任务', () => {
      const messages = buildScriptGenerationMessages([], [], [], undefined);
      expect(messages[0].content).toContain('故事脚本');
    });
  });

  // ── parseScriptResult ──

  describe('parseScriptResult 脚本解析', () => {
    test('解析 { scripts: [...] } 格式', () => {
      const raw = JSON.stringify({
        scripts: [
          {
            name: '主线',
            content: '主线故事大纲',
            type: 'main',
            characters: ['勇者'],
            scenes: ['王都'],
          },
        ],
      });
      const scripts = parseScriptResult(raw);
      expect(scripts.length).toBe(1);
      expect(scripts[0].name).toBe('主线');
      expect(scripts[0].type).toBe('main');
    });

    test('解析数组格式', () => {
      const raw = JSON.stringify([
        {
          name: '支线',
          content: '支线内容',
          type: 'side',
          characters: [],
          scenes: [],
        },
      ]);
      const scripts = parseScriptResult(raw);
      expect(scripts.length).toBe(1);
      expect(scripts[0].type).toBe('side');
    });

    test('无效 JSON 返回空数组', () => {
      expect(parseScriptResult('not json')).toEqual([]);
    });

    test('空字符串返回空数组', () => {
      expect(parseScriptResult('')).toEqual([]);
    });

    test('markdown 代码块包裹的 JSON', () => {
      const raw = '```json\n{"scripts":[{"name":"测试","content":"","type":"main","characters":[],"scenes":[]}]}\n```';
      const scripts = parseScriptResult(raw);
      expect(scripts.length).toBe(1);
      expect(scripts[0].name).toBe('测试');
    });

    test('无效 type 字段默认为 main', () => {
      const raw = JSON.stringify({
        scripts: [
          { name: '测试', content: '', type: 'invalid', characters: [], scenes: [] },
        ],
      });
      const scripts = parseScriptResult(raw);
      expect(scripts[0].type).toBe('main');
    });

    test('background 类型保留', () => {
      const raw = JSON.stringify({
        scripts: [
          { name: '背景', content: '', type: 'background', characters: [], scenes: [] },
        ],
      });
      const scripts = parseScriptResult(raw);
      expect(scripts[0].type).toBe('background');
    });

    test('过滤无 name 的项', () => {
      const raw = JSON.stringify({
        scripts: [
          { name: '有效', content: '', type: 'main', characters: [], scenes: [] },
          { content: '无 name', type: 'main', characters: [], scenes: [] },
        ],
      });
      const scripts = parseScriptResult(raw);
      expect(scripts.length).toBe(1);
      expect(scripts[0].name).toBe('有效');
    });
  });

  // ── extractJson ──

  describe('extractJson JSON 提取', () => {
    test('直接 JSON 字符串', () => {
      const result = extractJson('{"a":1}');
      expect(result).toEqual({ a: 1 });
    });

    test('去除 markdown 代码块', () => {
      const result = extractJson('```json\n{"a":1}\n```');
      expect(result).toEqual({ a: 1 });
    });

    test('去除无 json 标记的 ```', () => {
      const result = extractJson('```\n{"a":1}\n```');
      expect(result).toEqual({ a: 1 });
    });

    test('提取前后多余文本中的 JSON', () => {
      const result = extractJson('好的\n{"a":1}\n以上');
      expect(result).toEqual({ a: 1 });
    });

    test('提取数组 JSON', () => {
      const result = extractJson('text [1,2,3] suffix');
      expect(result).toEqual([1, 2, 3]);
    });

    test('修复尾逗号', () => {
      const result = extractJson('{"a":1,}');
      expect(result).toEqual({ a: 1 });
    });

    test('无效 JSON 返回 null', () => {
      expect(extractJson('not json at all')).toBeNull();
    });

    test('空字符串返回 null', () => {
      expect(extractJson('')).toBeNull();
    });

    test('null 输入返回 null', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(extractJson(null as any)).toBeNull();
    });

    test('非字符串输入返回 null', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(extractJson(123 as any)).toBeNull();
    });
  });

  // ── story-types 类型与常量 ──

  describe('story-types 常量', () => {
    test('ANALYSIS_DEPTHS 包含 3 种深度', () => {
      expect(ANALYSIS_DEPTHS.length).toBe(3);
      const ids = ANALYSIS_DEPTHS.map((d) => d.id);
      expect(ids).toContain('quick');
      expect(ids).toContain('standard');
      expect(ids).toContain('deep');
    });

    test('getDepthMeta 返回正确元数据', () => {
      const quick = getDepthMeta('quick');
      expect(quick?.label).toBe('快速');
      expect(quick?.extractScenes).toBe(false);
      expect(quick?.extractScript).toBe(false);

      const standard = getDepthMeta('standard');
      expect(standard?.extractScenes).toBe(true);
      expect(standard?.extractEvents).toBe(true);
      expect(standard?.extractScript).toBe(false);

      const deep = getDepthMeta('deep');
      expect(deep?.extractScript).toBe(true);
    });

    test('getDepthMeta 无效 id 返回 undefined', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(getDepthMeta('invalid' as any)).toBeUndefined();
    });

    test('generateStoryId 生成唯一 ID', () => {
      const id1 = generateStoryId();
      const id2 = generateStoryId();
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^story_/);
    });

    test('createEmptyResult 创建 pending 状态', () => {
      const result = createEmptyResult('test.txt', 'standard', 1000, 3);
      expect(result.status).toBe('pending');
      expect(result.sourceFileName).toBe('test.txt');
      expect(result.depth).toBe('standard');
      expect(result.textLength).toBe(1000);
      expect(result.chunkCount).toBe(3);
      expect(result.characters).toEqual([]);
      expect(result.scenes).toEqual([]);
      expect(result.events).toEqual([]);
      expect(result.scripts).toEqual([]);
      expect(result.createdAt).toBeGreaterThan(0);
      expect(result.completedAt).toBeUndefined();
    });

    test('INITIAL_PROGRESS 初始值正确', () => {
      expect(INITIAL_PROGRESS.completed).toBe(0);
      expect(INITIAL_PROGRESS.total).toBe(0);
      expect(INITIAL_PROGRESS.stage).toBe('等待开始');
      expect(INITIAL_PROGRESS.isAnalyzing).toBe(false);
    });
  });
});
