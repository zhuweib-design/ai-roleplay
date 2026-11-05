/**
 * 角色关联判定单元测试（L 层，设计文档 §3.3 / ModuleRelationsPanel）
 *
 * 这个面板的全部价值在于"说的每句话都有出处"，所以测试盯三件事：
 * 1. 行数与顺序固定（快照式断言，避免 UI 与文档漂移）；
 * 2. 数字只认真实数据：世界书按"生效集合"计且条目只数 enabled，文档按 scope 计；
 * 3. 判"未关联"时不得顺手制造副作用 —— 尤其不能为了知道"是否已跟踪"而调用会建仓的 `selectCharacter`。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { ref } from 'vue';
import { useCharacterRelations } from '@/composables/useCharacterRelations';
import { t } from '@/i18n';
import { useCharacterStore } from '@/stores/character';
import { useSettingsStore } from '@/stores/settings';
import { useLorebookStore } from '@/stores/lorebook';
import { useDataBankStore } from '@/stores/data-bank';
import { useGroupChatStore } from '@/stores/group-chat';
import { useCharacterVersionStore } from '@/stores/character-version';

const ID = 'rel-char';

function addCharacter(overrides: Record<string, unknown> = {}): void {
  const char = {
    id: ID,
    name: '关联测试角色',
    avatarType: 'gradient',
    initial: 'R',
    lastActive: '刚刚',
    favorite: false,
    tags: [],
    description: '用于关联面板测试',
    model: 'gpt-4o',
    conversations: [],
    messages: [],
    authorNote: '',
    authorDepth: 4,
    temperature: 0.7,
    ...overrides,
  };
  useCharacterStore().characters.push(char as never);
}

function rowOf(id: string) {
  return useCharacterRelations(ref(ID)).value.find((r) => r.id === id);
}

describe('useCharacterRelations', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    addCharacter();
  });

  it('六行、顺序固定、每行都有 data-rel-jump 标记', () => {
    const rows = useCharacterRelations(ref(ID)).value;
    expect(rows.map((r) => r.id)).toEqual(['worldbook', 'documents', 'preset', 'model', 'version', 'groups']);
    expect(rows.map((r) => r.dataRelJump)).toEqual([
      'rel-worldbook',
      'rel-documents',
      'rel-preset',
      'rel-model',
      'rel-version',
      'rel-groups',
    ]);
  });

  it('查不到的角色返回空行（组件据此不渲染，而不是渲染一堆假"未配置"）', () => {
    const rows = useCharacterRelations(ref('no-such-character')).value;
    expect(rows).toEqual([]);
  });

  it('裸角色：所有关系都是"未关联"，但跳转目标仍然给出（用户需要的是出口）', () => {
    const rows = useCharacterRelations(ref(ID)).value;
    expect(rows.every((r) => !r.linked)).toBe(true);
    expect(rows.map((r) => r.textKey)).toEqual([
      'rel.worldbookOff',
      'rel.documentsOff',
      'rel.presetFollowGlobal',
      'rel.modelNone',
      'rel.versionOff',
      'rel.groupsOff',
    ]);
    expect(rows.every((r) => r.jump !== null)).toBe(true);
  });

  it('世界书按"生效集合"计数，且只数启用的条目', () => {
    const lb = useLorebookStore();
    const bookId = lb.createLorebook({ name: '关联测试世界', scope: 'character' });
    lb.addEntry(bookId, { title: '常驻 A', keys: [], content: 'A', strategy: 'constant', enabled: true });
    lb.addEntry(bookId, { title: '关键词 B', keys: ['酒馆'], content: 'B', strategy: 'keyword', enabled: true });
    lb.addEntry(bookId, { title: '停用 C', keys: ['剑'], content: 'C', strategy: 'keyword', enabled: false });
    const char = useCharacterStore().characters.find((c) => c.id === ID)!;
    char.boundWorldBookIds = [bookId];

    const row = rowOf('worldbook');
    expect(row?.linked).toBe(true);
    expect(row?.textKey).toBe('rel.worldbookOn');
    expect(row?.params).toEqual({ books: 1, entries: 2 });
    expect(row?.jump).toEqual({ name: 'worldbook' });
  });

  it('文档计数含全局与本角色两档，不含他人角色的', () => {
    const db = useDataBankStore();
    db.documents.push({ id: 'd1', name: '全局设定', scope: 'global' } as never);
    db.documents.push({ id: 'd2', name: '本角色', scope: 'character', characterId: ID } as never);
    db.documents.push({ id: 'd3', name: '别人的', scope: 'character', characterId: 'other' } as never);

    const row = rowOf('documents');
    expect(row?.linked).toBe(true);
    expect(row?.params).toEqual({ count: 2 });
    expect(row?.jump).toEqual({ name: 'databank' });
  });

  it('创作模式：绑定与跟随全局是两种不同说法', () => {
    const settings = useSettingsStore();
    expect(rowOf('preset')?.textKey).toBe('rel.presetFollowGlobal');
    expect(rowOf('preset')?.linked).toBe(false);
    expect(rowOf('preset')?.jump).toEqual({ name: 'settings', query: { cat: 'model' } });

    const char = useCharacterStore().characters.find((c) => c.id === ID)!;
    char.boundPresetId = 'strict';
    expect(rowOf('preset')?.textKey).toBe('rel.presetBound');
    expect(rowOf('preset')?.linked).toBe(true);
    // 名称必须是翻译后的标签，而不是枚举值
    expect(rowOf('preset')?.params.name).toBe(t('preset.strict.label'));

    settings.creationPreset = 'free';
    char.boundPresetId = null;
    expect(rowOf('preset')?.textKey).toBe('rel.presetFollowGlobal');
    expect(rowOf('preset')?.params.name).toBe(t('preset.free.label'));
  });

  it('模型：角色级 Profile 优先，未绑定才说"跟随全局"', () => {
    const settings = useSettingsStore();
    settings.apiProfiles.push({
      id: 'p-global',
      name: '全局网关',
      provider: 'openai',
      baseUrl: 'http://127.0.0.1:9/v1',
      apiKey: '',
      model: 'x',
      enabled: true,
    } as never);
    settings.activeApiProfileId = 'p-global';
    expect(rowOf('model')?.textKey).toBe('rel.modelFollowGlobal');
    expect(rowOf('model')?.params).toEqual({ name: '全局网关' });

    settings.apiProfiles.push({
      id: 'p-char',
      name: '角色专用',
      provider: 'openai',
      baseUrl: 'http://127.0.0.1:9/v1',
      apiKey: '',
      model: 'y',
      enabled: true,
    } as never);
    const char = useCharacterStore().characters.find((c) => c.id === ID)!;
    char.profileId = 'p-char';
    expect(rowOf('model')?.textKey).toBe('rel.modelBound');
    expect(rowOf('model')?.params).toEqual({ name: '角色专用' });
    expect(rowOf('model')?.linked).toBe(true);
  });

  it('版本行是只读的：判"未跟踪"不得顺手建仓', () => {
    const version = useCharacterVersionStore();
    expect(rowOf('version')?.textKey).toBe('rel.versionOff');
    expect(version.repositories).toHaveLength(0);

    // 真跟踪之后（走公开动作，本用例只验证读取侧跟着变）
    version.selectCharacter(ID);
    const row = rowOf('version');
    expect(row?.linked).toBe(true);
    expect(row?.textKey).toBe('rel.versionOn');
    expect(typeof row?.params.commits).toBe('number');
    expect(row?.jump).toEqual({ name: 'character-version' });
  });

  it('群聊行：成员关系反查得出，且带上要先选中的群 id', () => {
    const groups = useGroupChatStore();
    groups.groups.push({
      id: 'g1',
      name: '测试群',
      members: [{ characterId: ID, name: '关联测试角色', joinedAt: '2026-10-07T00:00:00.000Z' }],
      messages: [],
    } as never);

    const row = rowOf('groups');
    expect(row?.linked).toBe(true);
    expect(row?.params).toEqual({ count: 1, name: '测试群' });
    expect(row?.jump).toEqual({ name: 'group' });
    expect(row?.preSelectGroupId).toBe('g1');
  });
});
