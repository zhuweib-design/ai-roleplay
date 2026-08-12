/**
 * npc-generator 单元测试 (迭代29 · F10.3)
 *
 * 覆盖：
 * - validateNpcParams 参数校验
 * - buildNpcGenerationMessages Prompt 构建
 * - parseGeneratedNpc 解析与转换
 * - generatedNpcToCard 转换为角色卡
 * - isTemporaryNpc 临时 NPC 判定
 * - TEMPORARY_NPC_TAG 常量
 */
import { describe, test, expect } from 'vitest';
import {
  validateNpcParams,
  buildNpcGenerationMessages,
  parseGeneratedNpc,
  generatedNpcToCard,
  isTemporaryNpc,
  TEMPORARY_NPC_TAG,
  type NpcGenerationParams,
  type NpcSceneContext,
  type NpcGroupContext,
  type GeneratedNpc,
} from '@core/npc-generator';
import type { CharacterTemplateId } from '@core/character-generator';

// ── 测试夹具 ──

function makeSceneContext(
  overrides: Partial<NpcSceneContext> = {}
): NpcSceneContext {
  return {
    worldName: '艾尔多拉',
    worldType: 'fantasy',
    regionName: '王都',
    subAreaName: '酒馆',
    sceneDescription: '一座繁华的贸易城市',
    ...overrides,
  };
}

function makeGroupContext(
  overrides: Partial<NpcGroupContext> = {}
): NpcGroupContext {
  return {
    groupName: '冒险者小队',
    existingMemberNames: ['主角', '法师艾拉'],
    memberCount: 2,
    maxMembers: 8,
    ...overrides,
  };
}

function makeParams(
  overrides: Partial<NpcGenerationParams> = {}
): NpcGenerationParams {
  return {
    templateId: 'fantasy',
    sceneContext: makeSceneContext(),
    groupContext: makeGroupContext(),
    seed: 'test1234',
    ...overrides,
  };
}

/** 构造合法的 NPC JSON 响应 */
function makeNpcJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    name: '酒馆老板鲍勃',
    description: '一位中年男性，留着络腮胡子，眼神精明。',
    personality: '热情好客，喜欢打听消息',
    scenario: '主角走进酒馆时，鲍勃正在擦拭杯子',
    firstMessage: '*鲍勃抬头看来*"欢迎光临，要来点什么？"',
    tags: ['商人', '酒馆老板', '消息灵通'],
    attributes: {
      profession: '酒馆老板',
      level: 3,
      experience: 120,
      stats: [
        { name: '魅力', value: '15', type: 'number' },
        { name: '智慧', value: '12', type: 'number' },
      ],
    },
    ...overrides,
  });
}

// ── 测试用例 ──

describe('npc-generator (F10.3)', () => {
  // ── TEMPORARY_NPC_TAG 常量 ──

  describe('TEMPORARY_NPC_TAG', () => {
    test('值为 __temporary_npc', () => {
      expect(TEMPORARY_NPC_TAG).toBe('__temporary_npc');
    });
  });

  // ── validateNpcParams ──

  describe('validateNpcParams', () => {
    test('合法参数返回空数组', () => {
      const errors = validateNpcParams(makeParams());
      expect(errors).toEqual([]);
    });

    test('templateId 为空字符串时报错', () => {
      const errors = validateNpcParams(
        makeParams({ templateId: '' as CharacterTemplateId })
      );
      expect(errors).toContain('模板 ID 不能为空');
    });

    test('未知 templateId 时报错', () => {
      const errors = validateNpcParams(
        makeParams({ templateId: 'nonexistent' as CharacterTemplateId })
      );
      expect(errors.some((e) => e.includes('未知的模板 ID'))).toBe(true);
    });

    test('groupContext 缺失时报错', () => {
      const errors = validateNpcParams({
        templateId: 'fantasy',
        sceneContext: makeSceneContext(),
        groupContext: undefined as unknown as NpcGroupContext,
      });
      expect(errors).toContain('群聊上下文无效');
    });

    test('groupName 非字符串时报错', () => {
      const errors = validateNpcParams({
        templateId: 'fantasy',
        sceneContext: makeSceneContext(),
        groupContext: {
          groupName: 123 as unknown as string,
          existingMemberNames: [],
          memberCount: 1,
          maxMembers: 8,
        },
      });
      expect(errors).toContain('群聊上下文无效');
    });

    test('memberCount 等于 maxMembers 时报错', () => {
      const errors = validateNpcParams(
        makeParams({
          groupContext: makeGroupContext({
            memberCount: 8,
            maxMembers: 8,
          }),
        })
      );
      expect(errors.some((e) => e.includes('群聊已满'))).toBe(true);
    });

    test('memberCount 大于 maxMembers 时报错', () => {
      const errors = validateNpcParams(
        makeParams({
          groupContext: makeGroupContext({
            memberCount: 10,
            maxMembers: 8,
          }),
        })
      );
      expect(errors.some((e) => e.includes('群聊已满'))).toBe(true);
    });

    test('memberCount 小于 maxMembers 时通过', () => {
      const errors = validateNpcParams(
        makeParams({
          groupContext: makeGroupContext({
            memberCount: 7,
            maxMembers: 8,
          }),
        })
      );
      expect(errors).toEqual([]);
    });

    test('四个合法模板均通过校验', () => {
      const ids: CharacterTemplateId[] = ['fantasy', 'scifi', 'modern', 'postapoc'];
      for (const id of ids) {
        const errors = validateNpcParams(makeParams({ templateId: id }));
        expect(errors).toEqual([]);
      }
    });
  });

  // ── buildNpcGenerationMessages ──

  describe('buildNpcGenerationMessages', () => {
    test('返回 system + user 两条消息', () => {
      const messages = buildNpcGenerationMessages(makeParams());
      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe('system');
      expect(messages[1].role).toBe('user');
    });

    test('system 内容强调临时 NPC 与群聊互动', () => {
      const messages = buildNpcGenerationMessages(makeParams());
      expect(messages[0].content).toContain('临时 NPC');
      expect(messages[0].content).toContain('群聊');
    });

    test('user 内容包含模板标签', () => {
      const messages = buildNpcGenerationMessages(makeParams({ templateId: 'scifi' }));
      expect(messages[1].content).toContain('科幻');
    });

    test('user 内容包含种子', () => {
      const messages = buildNpcGenerationMessages(makeParams({ seed: 'uniqueSeed' }));
      expect(messages[1].content).toContain('uniqueSeed');
    });

    test('user 内容包含世界名称', () => {
      const messages = buildNpcGenerationMessages(
        makeParams({
          sceneContext: makeSceneContext({ worldName: '魔法国度' }),
        })
      );
      expect(messages[1].content).toContain('魔法国度');
      expect(messages[1].content).toContain('【世界】');
    });

    test('user 内容包含世界类型', () => {
      const messages = buildNpcGenerationMessages(
        makeParams({
          sceneContext: makeSceneContext({ worldType: 'scifi' }),
        })
      );
      expect(messages[1].content).toContain('【世界类型】');
      expect(messages[1].content).toContain('scifi');
    });

    test('user 内容包含场景名称', () => {
      const messages = buildNpcGenerationMessages(
        makeParams({
          sceneContext: makeSceneContext({ regionName: '王都', subAreaName: '酒馆' }),
        })
      );
      expect(messages[1].content).toContain('【场景】王都');
      expect(messages[1].content).toContain('【子区域】酒馆');
    });

    test('user 内容包含场景描述', () => {
      const messages = buildNpcGenerationMessages(
        makeParams({
          sceneContext: makeSceneContext({ sceneDescription: '一座繁华的贸易城市' }),
        })
      );
      expect(messages[1].content).toContain('【场景描述】');
      expect(messages[1].content).toContain('一座繁华的贸易城市');
    });

    test('无场景上下文时显示无场景提示', () => {
      const messages = buildNpcGenerationMessages(
        makeParams({
          sceneContext: {
            worldName: undefined,
            worldType: undefined,
            regionName: undefined,
            subAreaName: undefined,
            sceneDescription: undefined,
          },
        })
      );
      expect(messages[1].content).toContain('无场景上下文');
    });

    test('user 内容包含现有成员名', () => {
      const messages = buildNpcGenerationMessages(
        makeParams({
          groupContext: makeGroupContext({
            existingMemberNames: ['主角', '法师艾拉', '战士卡尔'],
          }),
        })
      );
      expect(messages[1].content).toContain('主角');
      expect(messages[1].content).toContain('法师艾拉');
      expect(messages[1].content).toContain('战士卡尔');
      expect(messages[1].content).toContain('避免与上述成员重名');
    });

    test('无现有成员时显示暂无成员', () => {
      const messages = buildNpcGenerationMessages(
        makeParams({
          groupContext: makeGroupContext({ existingMemberNames: [] }),
        })
      );
      expect(messages[1].content).toContain('暂无成员');
    });

    test('user 内容包含 JSON 结构示例', () => {
      const messages = buildNpcGenerationMessages(makeParams());
      expect(messages[1].content).toContain('"name"');
      expect(messages[1].content).toContain('"description"');
      expect(messages[1].content).toContain('"personality"');
      expect(messages[1].content).toContain('"scenario"');
      expect(messages[1].content).toContain('"firstMessage"');
      expect(messages[1].content).toContain('"tags"');
      expect(messages[1].content).toContain('"attributes"');
    });

    test('user 内容包含属性示例', () => {
      const messages = buildNpcGenerationMessages(makeParams({ templateId: 'fantasy' }));
      // fantasy 模板包含 "力量" 属性示例
      expect(messages[1].content).toContain('力量');
    });

    test('不传 seed 时自动生成种子', () => {
      const messages = buildNpcGenerationMessages({
        templateId: 'fantasy',
        sceneContext: makeSceneContext(),
        groupContext: makeGroupContext(),
      });
      // 应包含【随机种子】标签，种子值非空
      expect(messages[1].content).toContain('【随机种子】');
      // 提取种子值并验证非空
      const seedMatch = messages[1].content.match(/【随机种子】(\S+)/);
      expect(seedMatch).not.toBeNull();
      expect(seedMatch![1].length).toBeGreaterThan(0);
    });

    test('强调只返回 JSON 不使用 markdown', () => {
      const messages = buildNpcGenerationMessages(makeParams());
      expect(messages[1].content).toContain('不要 markdown');
      expect(messages[1].content).toContain('只返回 JSON');
    });
  });

  // ── parseGeneratedNpc ──

  describe('parseGeneratedNpc', () => {
    test('解析标准 JSON', () => {
      const result = parseGeneratedNpc(makeNpcJson(), makeSceneContext());
      expect(result).not.toBeNull();
      expect(result!.name).toBe('酒馆老板鲍勃');
      expect(result!.description).toContain('络腮胡子');
      expect(result!.personality).toBe('热情好客，喜欢打听消息');
      expect(result!.firstMessage).toContain('欢迎光临');
      expect(result!.tags).toEqual(['商人', '酒馆老板', '消息灵通']);
    });

    test('附加 isTemporary: true 标记', () => {
      const result = parseGeneratedNpc(makeNpcJson());
      expect(result).not.toBeNull();
      expect(result!.isTemporary).toBe(true);
    });

    test('无场景上下文时 sourceScene 为 undefined', () => {
      const result = parseGeneratedNpc(makeNpcJson());
      expect(result).not.toBeNull();
      expect(result!.sourceScene).toBeUndefined();
    });

    test('有场景上下文时 sourceScene 由 region/subArea 组成', () => {
      const result = parseGeneratedNpc(
        makeNpcJson(),
        makeSceneContext({ regionName: '王都', subAreaName: '酒馆' })
      );
      expect(result).not.toBeNull();
      expect(result!.sourceScene).toBe('王都 / 酒馆');
    });

    test('仅有 region 时 sourceScene 只含 region', () => {
      const result = parseGeneratedNpc(
        makeNpcJson(),
        makeSceneContext({ regionName: '王都', subAreaName: undefined })
      );
      expect(result).not.toBeNull();
      expect(result!.sourceScene).toBe('王都');
    });

    test('仅有 subArea 时 sourceScene 只含 subArea', () => {
      const result = parseGeneratedNpc(
        makeNpcJson(),
        makeSceneContext({ regionName: undefined, subAreaName: '秘密房间' })
      );
      expect(result).not.toBeNull();
      expect(result!.sourceScene).toBe('秘密房间');
    });

    test('region 和 subArea 均空时 sourceScene 为 undefined', () => {
      const result = parseGeneratedNpc(
        makeNpcJson(),
        makeSceneContext({ regionName: undefined, subAreaName: undefined })
      );
      expect(result).not.toBeNull();
      expect(result!.sourceScene).toBeUndefined();
    });

    test('解析 markdown 包裹的 JSON', () => {
      const raw = '```json\n' + makeNpcJson() + '\n```';
      const result = parseGeneratedNpc(raw);
      expect(result).not.toBeNull();
      expect(result!.name).toBe('酒馆老板鲍勃');
    });

    test('解析带前后缀文本的 JSON', () => {
      const raw = '好的，以下是生成的 NPC：\n' +
        makeNpcJson() +
        '\n希望你喜欢！';
      const result = parseGeneratedNpc(raw);
      expect(result).not.toBeNull();
      expect(result!.name).toBe('酒馆老板鲍勃');
    });

    test('无效 JSON 返回 null', () => {
      expect(parseGeneratedNpc('not a json')).toBeNull();
    });

    test('空字符串返回 null', () => {
      expect(parseGeneratedNpc('')).toBeNull();
    });

    test('缺少 name 字段返回 null', () => {
      const raw = JSON.stringify({ description: '描述' });
      expect(parseGeneratedNpc(raw)).toBeNull();
    });

    test('保留 attributes 属性', () => {
      const result = parseGeneratedNpc(makeNpcJson());
      expect(result).not.toBeNull();
      expect(result!.attributes).toBeDefined();
      expect(result!.attributes!.profession).toBe('酒馆老板');
      expect(result!.attributes!.stats).toHaveLength(2);
    });

    test('attributes 为空时返回 undefined', () => {
      const raw = JSON.stringify({
        name: 'NPC',
        description: '描述',
        personality: '性格',
        scenario: '场景',
        firstMessage: '消息',
        tags: ['标签'],
      });
      const result = parseGeneratedNpc(raw);
      expect(result).not.toBeNull();
      expect(result!.attributes).toBeUndefined();
    });
  });

  // ── generatedNpcToCard ──

  describe('generatedNpcToCard', () => {
    function makeGeneratedNpc(
      overrides: Partial<GeneratedNpc> = {}
    ): GeneratedNpc {
      return {
        name: '猎人凯尔',
        description: '年轻的猎人',
        personality: '冷静机敏',
        scenario: '森林深处',
        firstMessage: '*凯尔拉弓*"是谁？"',
        tags: ['猎人', '森林'],
        attributes: {
          profession: '猎人',
          level: 5,
          experience: 200,
          stats: [{ name: '敏捷', value: '18', type: 'number' }],
        },
        isTemporary: true,
        sourceScene: '森林 / 猎人小屋',
        ...overrides,
      };
    }

    test('转换为基础字段', () => {
      const card = generatedNpcToCard(makeGeneratedNpc());
      expect(card.name).toBe('猎人凯尔');
      expect(card.description).toBe('年轻的猎人');
      expect(card.personality).toBe('冷静机敏');
      expect(card.scenario).toBe('森林深处');
      expect(card.firstMessage).toBe('*凯尔拉弓*"是谁？"');
    });

    test('附加 __temporary_npc 标签', () => {
      const card = generatedNpcToCard(makeGeneratedNpc());
      expect(card.tags).toContain(TEMPORARY_NPC_TAG);
    });

    test('保留原有 tags', () => {
      const card = generatedNpcToCard(makeGeneratedNpc());
      expect(card.tags).toContain('猎人');
      expect(card.tags).toContain('森林');
    });

    test('tags 去重（避免重复 __temporary_npc）', () => {
      const card = generatedNpcToCard(
        makeGeneratedNpc({ tags: ['猎人', TEMPORARY_NPC_TAG] })
      );
      const tags = card.tags as string[];
      const tagCount = tags.filter((t) => t === TEMPORARY_NPC_TAG).length;
      expect(tagCount).toBe(1);
    });

    test('favorite 强制为 false', () => {
      const card = generatedNpcToCard(makeGeneratedNpc());
      expect(card.favorite).toBe(false);
    });

    test('talkativeness 默认为 50', () => {
      const card = generatedNpcToCard(makeGeneratedNpc());
      expect(card.talkativeness).toBe(50);
    });

    test('alternateGreetings 默认为空数组', () => {
      const card = generatedNpcToCard(makeGeneratedNpc());
      expect(card.alternateGreetings).toEqual([]);
    });

    test('exampleMessages 默认为空字符串', () => {
      const card = generatedNpcToCard(makeGeneratedNpc());
      expect(card.exampleMessages).toBe('');
    });

    test('characterNote 默认为 null', () => {
      const card = generatedNpcToCard(makeGeneratedNpc());
      expect(card.characterNote).toBeNull();
    });

    test('version 默认为 1.0', () => {
      const card = generatedNpcToCard(makeGeneratedNpc());
      expect(card.version).toBe('1.0');
    });

    test('保留 attributes', () => {
      const card = generatedNpcToCard(makeGeneratedNpc());
      expect(card.attributes).toBeDefined();
      const attrs = card.attributes as {
        profession?: string;
        level?: number;
      };
      expect(attrs.profession).toBe('猎人');
      expect(attrs.level).toBe(5);
    });

    test('附加 isTemporary: true 扩展字段', () => {
      const card = generatedNpcToCard(makeGeneratedNpc());
      expect((card as { isTemporary?: unknown }).isTemporary).toBe(true);
    });

    test('附加 sourceScene 扩展字段', () => {
      const card = generatedNpcToCard(makeGeneratedNpc());
      expect((card as { sourceScene?: unknown }).sourceScene).toBe('森林 / 猎人小屋');
    });

    test('sourceScene 为 undefined 时不附加', () => {
      const card = generatedNpcToCard(makeGeneratedNpc({ sourceScene: undefined }));
      expect((card as { sourceScene?: unknown }).sourceScene).toBeUndefined();
    });

    test('不含 id / createdAt / updatedAt（由 store 填充）', () => {
      const card = generatedNpcToCard(makeGeneratedNpc());
      expect((card as { id?: unknown }).id).toBeUndefined();
      expect((card as { createdAt?: unknown }).createdAt).toBeUndefined();
      expect((card as { updatedAt?: unknown }).updatedAt).toBeUndefined();
    });

    test('tags 为 undefined 时仅含 __temporary_npc', () => {
      const card = generatedNpcToCard(makeGeneratedNpc({ tags: undefined }));
      expect(card.tags).toEqual([TEMPORARY_NPC_TAG]);
    });

    test('tags 为空数组时仅含 __temporary_npc', () => {
      const card = generatedNpcToCard(makeGeneratedNpc({ tags: [] }));
      expect(card.tags).toEqual([TEMPORARY_NPC_TAG]);
    });
  });

  // ── isTemporaryNpc ──

  describe('isTemporaryNpc', () => {
    test('isTemporary: true 返回 true', () => {
      expect(isTemporaryNpc({ isTemporary: true })).toBe(true);
    });

    test('isTemporary: false 返回 false', () => {
      expect(isTemporaryNpc({ isTemporary: false })).toBe(false);
    });

    test('tags 包含 __temporary_npc 返回 true', () => {
      expect(isTemporaryNpc({ tags: [TEMPORARY_NPC_TAG] })).toBe(true);
    });

    test('tags 不包含 __temporary_npc 返回 false', () => {
      expect(isTemporaryNpc({ tags: ['普通角色'] })).toBe(false);
    });

    test('isTemporary: true + tags 包含标记 返回 true（不重复判定）', () => {
      expect(
        isTemporaryNpc({ isTemporary: true, tags: [TEMPORARY_NPC_TAG] })
      ).toBe(true);
    });

    test('既无 isTemporary 也无 tags 返回 false', () => {
      expect(isTemporaryNpc({})).toBe(false);
    });

    test('tags 为非数组返回 false（忽略 isTemporary）', () => {
      expect(
        isTemporaryNpc({ tags: 'not-an-array' as unknown as string[] })
      ).toBe(false);
    });

    test('tags 为 undefined 返回 false', () => {
      expect(isTemporaryNpc({ tags: undefined })).toBe(false);
    });

    test('isTemporary: true 但 tags 为非数组仍返回 true', () => {
      expect(
        isTemporaryNpc({
          isTemporary: true,
          tags: 'not-an-array' as unknown as string[],
        })
      ).toBe(true);
    });

    test('识别生成的 NPC 角色卡', () => {
      const card = generatedNpcToCard({
        name: 'NPC',
        description: 'd',
        personality: 'p',
        scenario: 's',
        firstMessage: 'f',
        tags: ['商人'],
        isTemporary: true,
      });
      expect(isTemporaryNpc(card)).toBe(true);
    });

    test('不识别普通角色卡', () => {
      const card = {
        name: '普通角色',
        tags: ['奇幻', '战士'],
      };
      expect(isTemporaryNpc(card)).toBe(false);
    });
  });
});
