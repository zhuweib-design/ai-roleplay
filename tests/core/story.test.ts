import { describe, it, expect } from 'vitest';
import { buildSourceContext } from '@core/story-analyzer';


// ── T-08: buildSourceContext 源素材上下文提取 ──

describe('buildSourceContext (T-08)', () => {
  it('提取世界信息、人物与场景摘要', () => {
    
    const ctx = buildSourceContext({
      id: 's1',
      sourceFileName: 'x.txt',
      depth: 'quick',
      status: 'completed',
      createdAt: 0,
      completedAt: 1,
      textLength: 100,
      chunkCount: 1,
      worldInfo: {
        name: '星陨大陆',
        type: 'fantasy',
        description: '一个被流星击中的大陆，魔法与科技并存。'.repeat(30),
        coreSettings: ['魔法需要消耗生命力', '大陆边缘有结界'],
        factions: ['星陨教会', '诸王议会'],
      },
      characters: [
        { name: '阿尔文', description: '年轻的流浪剑士，身负诅咒' },
        { name: '伊莲娜', description: '教会圣女，拥有治疗能力' },
      ],
      scenes: [
        { name: '流星废墟', type: '野外', description: '坠落点附近的荒原' },
        { name: '王都', type: '城市', description: '诸王议会所在地' },
      ],
      events: [],
      scripts: [],
    } as never);
    expect(ctx).toContain('世界名称：星陨大陆');
    expect(ctx).toContain('魔法需要消耗生命力');
    expect(ctx).toContain('星陨教会');
    expect(ctx).toContain('阿尔文');
    expect(ctx).toContain('流星废墟');
    // 长描述被截断
    expect(ctx).toContain('…');
  });

  it('无世界信息时仅返回人物与场景', () => {
    
    const ctx = buildSourceContext({
      id: 's2',
      sourceFileName: 'y.txt',
      depth: 'quick',
      status: 'completed',
      createdAt: 0,
      completedAt: 1,
      textLength: 10,
      chunkCount: 1,
      characters: [{ name: '主角', description: '普通人' }],
      scenes: [],
      events: [],
      scripts: [],
    } as never);
    expect(ctx).toContain('主角');
    expect(ctx).not.toContain('世界名称');
  });

  it('空结果返回空串', () => {
    
    const ctx = buildSourceContext({
      id: 's3',
      sourceFileName: 'z.txt',
      depth: 'quick',
      status: 'completed',
      createdAt: 0,
      completedAt: 1,
      textLength: 0,
      chunkCount: 0,
      characters: [],
      scenes: [],
      events: [],
      scripts: [],
    } as never);
    expect(ctx).toBe('');
  });
});
