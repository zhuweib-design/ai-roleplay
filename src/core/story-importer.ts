/**
 * 故事引擎导入逻辑 (F16.2, v1.1 新增)
 *
 * 将 F16.1 分析生成的结构化数据导入到各功能模块：
 * - 世界 → F06 Lorebook 整体世界描述（updateWorldDescription）
 * - 场景 → F06.6 Lorebook 层级条目（Region / Sub-area）
 * - 人物 → F01 角色卡（createCharacter + updateCharacter）
 * - 事件 → F17 事件系统（createEvent + updateEvent）
 * - 脚本 → 独立 JSON 文件下载
 *
 * 导入冲突处理策略：
 * - add：新增（不覆盖已有数据，重名跳过）
 * - overwrite：覆盖（替换同名条目）
 * - merge：合并（追加到已有条目的描述中）
 *
 * 设计原则：
 * - 导入函数为纯函数，通过 Port 接口与 store 解耦，便于测试
 * - 每个导入项返回 ImportResult，汇总为结果列表
 * - 脚本导出为 JSON 文件下载（浏览器 Blob）
 */
import type {
  StoryAnalysisResult,
  StoryCharacter,
  StoryScene,
  StoryEvent,
  StoryWorldInfo,
  StoryScript,
  ImportConflictStrategy,
  ImportResult,
} from './story-types';
import type { WorldType, WorldDescription, LorebookEntry } from './lorebook';
import type { StoryEvent as EventSystemEvent } from './event-types';
import { t } from '@/i18n';

// ── 导入目标 Port 接口（store 需实现，便于 mock 测试） ──

/** 角色卡导入端口 */
export interface CharacterImportPort {
  createCharacter(): string;
  updateCharacter(id: string, patch: Record<string, unknown>): boolean;
  /** 查找同名角色 */
  findCharacterByName(name: string): { id: string; name: string } | null;
}

/** Lorebook 导入端口 */
export interface LorebookImportPort {
  /** 获取当前 Lorebook 的世界描述 */
  getWorldDescription(lorebookId: string): WorldDescription | null;
  /** 设置世界描述 */
  updateWorldDescription(lorebookId: string, wd: WorldDescription | null): boolean;
  /** 获取所有条目 */
  getEntries(lorebookId: string): LorebookEntry[];
  /** 查找同名条目 */
  findEntryByTitle(lorebookId: string, title: string): LorebookEntry | null;
  /** 新增条目，返回 id */
  addEntry(lorebookId: string, input?: Partial<LorebookEntry>): string | null;
  /** 更新条目 */
  updateEntry(lorebookId: string, entryId: string, patch: Partial<LorebookEntry>): boolean;
}

/** 事件系统导入端口 */
export interface EventsImportPort {
  /** 创建事件 */
  createEvent(lorebookId: string, sceneEntryId: string | null, sceneName: string | null): string | null;
  /** 更新事件 */
  updateEvent(id: string, patch: Partial<EventSystemEvent>): boolean;
  /** 查找同名事件 */
  findEventByName(name: string): EventSystemEvent | null;
}

/** 导入目标集合 */
export interface ImportTargets {
  character: CharacterImportPort;
  lorebook: LorebookImportPort;
  events: EventsImportPort;
}

// ── 类型映射 ──

/**
 * 将 StoryWorldInfo.type（自由文本）映射为 WorldType 枚举
 */
// i18n-ignore-start  // 模型面提示词 / mock 数据，非 UI 文案（待翻译）
export function mapWorldType(rawType: string): WorldType {
  const t = rawType.toLowerCase().trim();
  // 奇幻
  if (t.includes('奇幻') || t.includes('fantasy') || t.includes('魔') || t.includes('剑')) {
    return 'fantasy';
  }
  // 科幻
  if (t.includes('科幻') || t.includes('scifi') || t.includes('sci-fi') || t.includes('未来') || t.includes('太空') || t.includes('星际')) {
    return 'scifi';
  }
  // 现代
  if (t.includes('现代') || t.includes('modern') || t.includes('都市') || t.includes('当代')) {
    return 'modern';
  }
  // 历史
  if (t.includes('历史') || t.includes('historical') || t.includes('古代') || t.includes('古风')) {
    return 'historical';
  }
  return 'other';
}
// i18n-ignore-end

/**
 * StoryWorldInfo → WorldDescription
 */
export function toWorldDescription(world: StoryWorldInfo): WorldDescription {
  return {
    name: world.name,
    type: mapWorldType(world.type),
    keys: [world.name, ...sliceFactions(world.factions)].filter(Boolean).slice(0, 10),
    content: buildWorldContent(world),
  };
}

/**
 * StoryScene → LorebookEntry 输入
 * hierarchyLevel: 1 = Region（顶层场景），2 = Sub-area（子场景）
 */
export function toLorebookEntryInput(
  scene: StoryScene,
  parentId: string | null
): Partial<LorebookEntry> {
  return {
    title: scene.name,
    keys: [scene.name],
    content: buildSceneContent(scene),
    strategy: 'keyword',
    probability: 100,
    insertionOrder: 100,
    insertionPosition: 'afterCharDefs',
    depth: 4,
    enabled: true,
    logic: 'AND_ANY',
    hierarchyLevel: parentId ? 2 : 1,
    parentId,
  };
}

/**
 * StoryCharacter → UICharacter patch
 */
export function toCharacterPatch(char: StoryCharacter): Record<string, unknown> {
  const description = buildCharacterDescription(char);
  const tags = char.aliases ?? [];
  return {
    name: char.name,
    description,
    tags: tags.length > 0 ? tags : [t('imp.storyImportTag')],
  };
}

/**
 * StoryEvent（story-types）→ EventSystemEvent patch（event-types）
 */
export function toEventPatch(
  event: StoryEvent
): Partial<EventSystemEvent> {
  return {
    name: event.name,
    description: event.description,
    sceneName: event.scene ?? null,
    probability: 100,
    repeatable: false,
  };
}

// ── 导入函数 ──

/**
 * 导入世界信息到 Lorebook 世界描述
 */
export function importWorld(
  story: StoryAnalysisResult,
  lorebookId: string,
  port: LorebookImportPort,
  strategy: ImportConflictStrategy
): ImportResult[] {
  if (!story.worldInfo) {
    return [];
  }

  const results: ImportResult[] = [];
  const wd = toWorldDescription(story.worldInfo);
  const existing = port.getWorldDescription(lorebookId);

  if (existing && strategy === 'add') {
    // add 策略：已有世界描述则跳过
    results.push({
      type: 'lorebook',
      name: wd.name,
      strategy,
      success: false,
      error: t('imp.worldExistsSkip'),
    });
    return results;
  }

  if (existing && strategy === 'merge') {
    // merge 策略：合并描述
    wd.content = `${existing.content}\n\n---\n\n${wd.content}`;
    wd.keys = Array.from(new Set([...existing.keys, ...wd.keys]));
  }

  const ok = port.updateWorldDescription(lorebookId, wd);
  results.push({
    type: 'lorebook',
    name: wd.name,
    strategy,
    success: ok,
    error: ok ? undefined : t('imp.worldUpdateFailed'),
  });

  return results;
}

/**
 * 导入场景到 Lorebook 条目（建立层级结构）
 *
 * 流程：
 * 1. 先导入无 parent 的顶层场景（Region, hierarchyLevel=1）
 * 2. 再导入有 parent 的子场景（Sub-area, hierarchyLevel=2）
 * 3. parent 关系通过场景名匹配已导入的条目
 */
export function importScenes(
  story: StoryAnalysisResult,
  lorebookId: string,
  port: LorebookImportPort,
  strategy: ImportConflictStrategy
): ImportResult[] {
  const results: ImportResult[] = [];
  const scenes = story.scenes;
  if (scenes.length === 0) return results;

  // 已导入场景名 → entryId 映射
  const nameToEntryId = new Map<string, string>();

  // 第一轮：导入顶层场景（无 parent）
  const topScenes = scenes.filter((s) => !s.parent);
  for (const scene of topScenes) {
    const result = importSingleScene(scene, null, lorebookId, port, strategy, nameToEntryId);
    results.push(result);
  }

  // 第二轮：导入子场景（有 parent）
  const childScenes = scenes.filter((s) => s.parent);
  for (const scene of childScenes) {
    const parentEntryId = scene.parent ? nameToEntryId.get(scene.parent) : null;
    // 如果父场景未导入（可能是从其他故事导入或不存在），仍作为顶层导入
    const result = importSingleScene(
      scene,
      parentEntryId ?? null,
      lorebookId,
      port,
      strategy,
      nameToEntryId
    );
    results.push(result);
  }

  return results;
}

/**
 * 导入人物到角色卡
 */
export function importCharacters(
  story: StoryAnalysisResult,
  port: CharacterImportPort,
  strategy: ImportConflictStrategy
): ImportResult[] {
  const results: ImportResult[] = [];

  for (const char of story.characters) {
    const existing = port.findCharacterByName(char.name);

    if (existing && strategy === 'add') {
      results.push({
        type: 'character',
        name: char.name,
        strategy,
        success: false,
        error: t('imp.charExistsSkip'),
      });
      continue;
    }

    if (existing && strategy === 'merge') {
      // merge：追加描述
      const patch = toCharacterPatch(char);
      // merge 模式下不覆盖 name，只追加 description
      const ok = port.updateCharacter(existing.id, {
        description: `${patch.description}`,
      });
      results.push({
        type: 'character',
        name: char.name,
        strategy,
        success: ok,
        error: ok ? undefined : t('imp.charMergeFailed'),
      });
      continue;
    }

    // overwrite 或新建
    if (existing && strategy === 'overwrite') {
      const patch = toCharacterPatch(char);
      const ok = port.updateCharacter(existing.id, patch);
      results.push({
        type: 'character',
        name: char.name,
        strategy,
        success: ok,
        error: ok ? undefined : t('imp.charOverwriteFailed'),
      });
      continue;
    }

    // 新建角色
    const id = port.createCharacter();
    if (!id) {
      results.push({
        type: 'character',
        name: char.name,
        strategy,
        success: false,
        error: t('imp.charCreateFailed'),
      });
      continue;
    }

    const patch = toCharacterPatch(char);
    const ok = port.updateCharacter(id, patch);
    results.push({
      type: 'character',
      name: char.name,
      strategy,
      success: ok,
      error: ok ? undefined : t('imp.charUpdateFailed'),
    });
  }

  return results;
}

/**
 * 导入事件到事件系统
 */
export function importEvents(
  story: StoryAnalysisResult,
  lorebookId: string,
  port: EventsImportPort,
  strategy: ImportConflictStrategy
): ImportResult[] {
  const results: ImportResult[] = [];

  for (const event of story.events) {
    const existing = port.findEventByName(event.name);

    if (existing && strategy === 'add') {
      results.push({
        type: 'event',
        name: event.name,
        strategy,
        success: false,
        error: t('imp.eventExistsSkip'),
      });
      continue;
    }

    if (existing && (strategy === 'overwrite' || strategy === 'merge')) {
      const patch = toEventPatch(event);
      const ok = port.updateEvent(existing.id, patch);
      results.push({
        type: 'event',
        name: event.name,
        strategy,
        success: ok,
        error: ok ? undefined : t('imp.eventUpdateFailed'),
      });
      continue;
    }

    // 新建事件（sceneName 作为冗余存储，sceneEntryId 暂不绑定）
    const id = port.createEvent(
      lorebookId,
      null,
      event.scene ?? null
    );
    if (!id) {
      results.push({
        type: 'event',
        name: event.name,
        strategy,
        success: false,
        error: t('imp.eventCreateFailed'),
      });
      continue;
    }

    const patch = toEventPatch(event);
    const ok = port.updateEvent(id, patch);
    results.push({
      type: 'event',
      name: event.name,
      strategy,
      success: ok,
      error: ok ? undefined : t('imp.eventUpdateFailed'),
    });
  }

  return results;
}

/**
 * 一键全部导入
 */
export function importAll(
  story: StoryAnalysisResult,
  lorebookId: string,
  targets: ImportTargets,
  strategy: ImportConflictStrategy
): ImportResult[] {
  const results: ImportResult[] = [];

  if (story.worldInfo) {
    results.push(...importWorld(story, lorebookId, targets.lorebook, strategy));
  }
  if (story.scenes.length > 0) {
    results.push(...importScenes(story, lorebookId, targets.lorebook, strategy));
  }
  if (story.characters.length > 0) {
    results.push(...importCharacters(story, targets.character, strategy));
  }
  if (story.events.length > 0) {
    results.push(...importEvents(story, lorebookId, targets.events, strategy));
  }

  return results;
}

/**
 * 脚本导出为 JSON 字符串（用于文件下载）
 */
export function exportScriptsAsJson(scripts: StoryScript[]): string {
  return JSON.stringify(scripts, null, 2);
}

/**
 * 触发脚本文件下载（浏览器环境）
 */
export function downloadScripts(scripts: StoryScript[], filename: string): void {
  const json = exportScriptsAsJson(scripts);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── 辅助函数 ──

function buildWorldContent(world: StoryWorldInfo): string {
  const parts: string[] = [world.description];
  if (world.coreSettings && world.coreSettings.length > 0) {
    parts.push(`\n${t('imp.coreSettings')}：\n${world.coreSettings.map((s) => `- ${s}`).join('\n')}`);
  }
  if (world.factions && world.factions.length > 0) {
    parts.push(`\n${t('imp.factions')}：${world.factions.join('、')}`);
  }
  return parts.join('\n');
}

function buildSceneContent(scene: StoryScene): string {
  const parts: string[] = [scene.description];
  if (scene.type) {
    parts.unshift(`【${scene.type}】`);
  }
  if (scene.parent) {
    parts.push(`\n${t('imp.belongsTo')}：${scene.parent}`);
  }
  return parts.join('\n');
}

function buildCharacterDescription(char: StoryCharacter): string {
  const parts: string[] = [char.description];
  if (char.aliases && char.aliases.length > 0) {
    parts.push(`\n${t('imp.aliases')}：${char.aliases.join('、')}`);
  }
  if (char.relationships && char.relationships.length > 0) {
    parts.push(
      `\n${t('imp.relationships')}：\n${char.relationships
        .map((r) => `- ${r.target}：${r.relation}`)
        .join('\n')}`
    );
  }
  if (char.attributes) {
    const attrEntries = Object.entries(char.attributes);
    if (attrEntries.length > 0) {
      parts.push(
        `\n角色属性：\n${attrEntries.map(([k, v]) => `- ${k}：${v}`).join('\n')}`
      );
    }
  }
  return parts.join('\n');
}

function sliceFactions(factions?: string[]): string[] {
  if (!factions) return [];
  return factions.slice(0, 3);
}

/**
 * 导入单个场景
 */
function importSingleScene(
  scene: StoryScene,
  parentId: string | null,
  lorebookId: string,
  port: LorebookImportPort,
  strategy: ImportConflictStrategy,
  nameToEntryId: Map<string, string>
): ImportResult {
  const existing = port.findEntryByTitle(lorebookId, scene.name);

  if (existing && strategy === 'add') {
    nameToEntryId.set(scene.name, existing.id);
    return {
      type: 'scene',
      name: scene.name,
      strategy,
      success: false,
      error: t('imp.entryExistsSkip'),
    };
  }

  if (existing && (strategy === 'overwrite' || strategy === 'merge')) {
    const input = toLorebookEntryInput(scene, parentId);
    if (strategy === 'merge') {
      // merge：追加内容
      input.content = `${existing.content}\n\n---\n\n${input.content}`;
    }
    const ok = port.updateEntry(lorebookId, existing.id, input);
    nameToEntryId.set(scene.name, existing.id);
    return {
      type: 'scene',
      name: scene.name,
      strategy,
      success: ok,
      error: ok ? undefined : t('imp.entryUpdateFailed'),
    };
  }

  // 新建
  const input = toLorebookEntryInput(scene, parentId);
  const id = port.addEntry(lorebookId, input);
  if (id) {
    nameToEntryId.set(scene.name, id);
  }
  return {
    type: 'scene',
    name: scene.name,
    strategy,
    success: !!id,
    error: id ? undefined : t('imp.entryCreateFailed'),
  };
}
