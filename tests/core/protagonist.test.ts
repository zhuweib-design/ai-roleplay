/**
 * F16.3 主角身份配置 - 核心逻辑测试
 */
import { describe, it, expect } from 'vitest';
import {
  createProtagonistFromCharacter,
  createNewProtagonist,
  validateProtagonist,
  buildProtagonistPrompt,
  addRelation,
  removeRelation,
  patchProtagonist,
  MAX_PROTAGONIST_NAME_LENGTH,
  MAX_PROTAGONIST_DESCRIPTION_LENGTH,
  MAX_RELATION_DESC_LENGTH,
  MAX_RELATIONS_COUNT,
} from '@core/protagonist';
import type {
  StoryCharacter,
  StoryAnalysisResult,
  ProtagonistConfig,
} from '@core/story-types';

// ── 测试夹具 ──

function makeCharacter(overrides: Partial<StoryCharacter> = {}): StoryCharacter {
  return {
    name: '李雷',
    description: '年轻的剑士，性格坚毅，背负家族荣耀',
    aliases: ['小李'],
    relationships: [
      { target: '韩梅梅', relation: '青梅竹马' },
      { target: '王老板', relation: '雇佣关系' },
    ],
    ...overrides,
  };
}

function makeStory(
  overrides: Partial<Pick<StoryAnalysisResult, 'characters' | 'scenes'>> = {}
): Pick<StoryAnalysisResult, 'scenes' | 'characters'> {
  return {
    characters: [makeCharacter()],
    scenes: [
      { name: '王都', type: '城市', description: '繁华的王都' },
      { name: '王都市场', type: '室内', description: '热闹的市场', parent: '王都' },
    ],
    ...overrides,
  };
}

// ── createProtagonistFromCharacter ──

describe('createProtagonistFromCharacter', () => {
  it('从已有人物创建主角，复用名字、描述、关系', () => {
    const char = makeCharacter();
    const config = createProtagonistFromCharacter(char);

    expect(config.role).toBe('protagonist');
    expect(config.source).toBe('existing');
    expect(config.name).toBe('李雷');
    expect(config.description).toBe(char.description);
    expect(config.relations).toEqual(char.relationships);
    expect(config.personaId).toBeNull();
    expect(config.startingScene).toBeUndefined();
    expect(config.createdAt).toBe(config.updatedAt);
  });

  it('指定 role 和 startingScene', () => {
    const config = createProtagonistFromCharacter(
      makeCharacter(),
      'observer',
      '王都'
    );
    expect(config.role).toBe('observer');
    expect(config.startingScene).toBe('王都');
  });

  it('无 relationships 的人物创建主角时 relations 为空数组', () => {
    const config = createProtagonistFromCharacter({
      name: '无名氏',
      description: '神秘人物',
    });
    expect(config.relations).toEqual([]);
  });
});

// ── createNewProtagonist ──

describe('createNewProtagonist', () => {
  it('创建自定义主角，默认 role=protagonist', () => {
    const config = createNewProtagonist({ name: '玩家1' });
    expect(config.source).toBe('custom');
    expect(config.role).toBe('protagonist');
    expect(config.name).toBe('玩家1');
    expect(config.description).toBe('');
    expect(config.relations).toEqual([]);
    expect(config.personaId).toBeNull();
  });

  it('完整参数创建自定义主角', () => {
    const config = createNewProtagonist({
      name: '玩家1',
      description: '冒险家',
      role: 'observer',
      startingScene: '王都',
      relations: [{ target: '李雷', relation: '挚友' }],
    });
    expect(config.role).toBe('observer');
    expect(config.startingScene).toBe('王都');
    expect(config.relations).toHaveLength(1);
  });
});

// ── validateProtagonist ──

describe('validateProtagonist', () => {
  it('合法配置返回空数组', () => {
    const story = makeStory();
    const config = createProtagonistFromCharacter(story.characters[0]);
    expect(validateProtagonist(config, story)).toEqual([]);
  });

  it('名称为空时报错', () => {
    const errors = validateProtagonist({ name: '' });
    expect(errors).toContain('主角名称不能为空');
  });

  it('名称超过上限时报错', () => {
    const errors = validateProtagonist({
      name: 'A'.repeat(MAX_PROTAGONIST_NAME_LENGTH + 1),
    });
    expect(errors.some((e) => e.includes('主角名称不能超过'))).toBe(true);
  });

  it('描述超长（>2倍建议值）时报错', () => {
    const errors = validateProtagonist({
      name: '玩家',
      description: 'X'.repeat(MAX_PROTAGONIST_DESCRIPTION_LENGTH * 2 + 1),
    });
    expect(errors.some((e) => e.includes('主角描述不应过长'))).toBe(true);
  });

  it('source=existing 但名称不在 characters 内时报错', () => {
    const story = makeStory();
    const config: ProtagonistConfig = {
      role: 'protagonist',
      source: 'existing',
      name: '不存在的人物',
      description: '',
      relations: [],
      personaId: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const errors = validateProtagonist(config, story);
    expect(errors.some((e) => e.includes('不在故事人物列表中'))).toBe(true);
  });

  it('起始场景不在 scenes 内时报错', () => {
    const story = makeStory();
    const config: ProtagonistConfig = {
      role: 'protagonist',
      source: 'custom',
      name: '玩家',
      description: '',
      startingScene: '不存在的场景',
      relations: [],
      personaId: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const errors = validateProtagonist(config, story);
    expect(errors.some((e) => e.includes('不在故事场景列表中'))).toBe(true);
  });

  it('关系条目数超过上限时报错', () => {
    const relations = Array.from({ length: MAX_RELATIONS_COUNT + 1 }, (_, i) => ({
      target: `人物${i}`,
      relation: '关系',
    }));
    const errors = validateProtagonist({
      name: '玩家',
      relations,
    });
    expect(errors.some((e) => e.includes('关系条目数不能超过'))).toBe(true);
  });

  it('关系条目缺少 target 或 relation 时报错', () => {
    const errors = validateProtagonist({
      name: '玩家',
      relations: [
        { target: '', relation: '挚友' },
        { target: '李雷', relation: '' },
      ],
    });
    expect(errors.some((e) => e.includes('目标人物名不能为空'))).toBe(true);
    expect(errors.some((e) => e.includes('关系描述不能为空'))).toBe(true);
  });

  it('关系描述超长时报错', () => {
    const errors = validateProtagonist({
      name: '玩家',
      relations: [{ target: '李雷', relation: 'X'.repeat(MAX_RELATION_DESC_LENGTH + 1) }],
    });
    expect(errors.some((e) => e.includes('描述长度不能超过'))).toBe(true);
  });

  it('不传 story 时不校验场景/人物引用', () => {
    const config: ProtagonistConfig = {
      role: 'protagonist',
      source: 'existing',
      name: '任意名',
      description: '',
      startingScene: '任意场景',
      relations: [],
      personaId: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    expect(validateProtagonist(config)).toEqual([]);
  });
});

// ── buildProtagonistPrompt ──

describe('buildProtagonistPrompt', () => {
  it('config 为 null/undefined 时返回空字符串', () => {
    expect(buildProtagonistPrompt(null)).toBe('');
    expect(buildProtagonistPrompt(undefined)).toBe('');
  });

  it('主角身份生成正确格式', () => {
    const config: ProtagonistConfig = {
      role: 'protagonist',
      source: 'existing',
      name: '李雷',
      description: '年轻的剑士',
      startingScene: '王都',
      relations: [{ target: '韩梅梅', relation: '青梅竹马' }],
      personaId: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const prompt = buildProtagonistPrompt(config);
    expect(prompt).toContain('[Story Protagonist]');
    expect(prompt).toContain('身份：主角（参与剧情推进）');
    expect(prompt).toContain('名字：李雷');
    expect(prompt).toContain('描述：年轻的剑士');
    expect(prompt).toContain('起始场景：王都');
    expect(prompt).toContain('[主角与原有人物的关系]');
    expect(prompt).toContain('- 韩梅梅：青梅竹马');
  });

  it('旁观者身份标签不同', () => {
    const config: ProtagonistConfig = {
      role: 'observer',
      source: 'custom',
      name: '玩家',
      description: '',
      relations: [],
      personaId: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const prompt = buildProtagonistPrompt(config);
    expect(prompt).toContain('身份：旁观者（以第三人称视角观察）');
    expect(prompt).not.toContain('起始场景');
    expect(prompt).not.toContain('[主角与原有人物的关系]');
  });
});

// ── addRelation / removeRelation ──

describe('addRelation', () => {
  it('添加新关系', () => {
    const result = addRelation([], '李雷', '挚友');
    expect(result).toEqual([{ target: '李雷', relation: '挚友' }]);
  });

  it('相同 target 替换原 relation', () => {
    const initial = [{ target: '李雷', relation: '挚友' }];
    const result = addRelation(initial, '李雷', '宿敌');
    expect(result).toHaveLength(1);
    expect(result[0].relation).toBe('宿敌');
  });

  it('不修改原数组', () => {
    const initial = [{ target: '李雷', relation: '挚友' }];
    addRelation(initial, '韩梅梅', '师徒');
    expect(initial).toHaveLength(1);
  });
});

describe('removeRelation', () => {
  it('移除指定 target 的关系', () => {
    const initial = [
      { target: '李雷', relation: '挚友' },
      { target: '韩梅梅', relation: '师徒' },
    ];
    const result = removeRelation(initial, '李雷');
    expect(result).toHaveLength(1);
    expect(result[0].target).toBe('韩梅梅');
  });

  it('target 不存在时返回等效数组', () => {
    const initial = [{ target: '李雷', relation: '挚友' }];
    const result = removeRelation(initial, '不存在');
    expect(result).toEqual(initial);
    expect(result).not.toBe(initial);
  });
});

// ── patchProtagonist ──

describe('patchProtagonist', () => {
  it('合并字段并更新 updatedAt', async () => {
    const original: ProtagonistConfig = {
      role: 'protagonist',
      source: 'existing',
      name: '李雷',
      description: '旧描述',
      relations: [],
      personaId: null,
      createdAt: 1000,
      updatedAt: 1000,
    };
    // 确保时间戳会推进
    await new Promise((r) => setTimeout(r, 5));
    const patched = patchProtagonist(original, { description: '新描述' });
    expect(patched.description).toBe('新描述');
    expect(patched.updatedAt).toBeGreaterThan(original.updatedAt);
    expect(patched.createdAt).toBe(1000);
  });

  it('不修改原对象', () => {
    const original: ProtagonistConfig = {
      role: 'protagonist',
      source: 'existing',
      name: '李雷',
      description: '旧描述',
      relations: [],
      personaId: null,
      createdAt: 1000,
      updatedAt: 1000,
    };
    patchProtagonist(original, { description: '新描述' });
    expect(original.description).toBe('旧描述');
  });
});
