/**
 * readiness 判定单元测试（L 层，设计文档 §3.3）
 *
 * 重点验证三条容易说谎的路径：
 * 1. 主密码锁定必须判 'locked'，不得与"未配置模型"混为一谈（D-10）
 * 2. 向量通道关闭 / 未绑世界书时，文档芯片不得报 ready
 * 3. 开关是 localStorage 的非响应式读，必须通过 ref 镜像反映到界面
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useReadinessChips, useDataBankPrereqs, useRandomEventPrereqs, modelReadiness } from '@core/readiness';
import { setVectorRagEnabled } from '@core/dual-channel-runtime';
import { useCharacterStore } from '@/stores/character';
import { useRandomEventsStore } from '@/stores/random-events';
import { useSettingsStore } from '@/stores/settings';
import { useLorebookStore } from '@/stores/lorebook';
import { useDataBankStore } from '@/stores/data-bank';

function chipById(id: string) {
  return useReadinessChips().value.find((c) => c.id === id);
}

describe('useReadinessChips', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    setVectorRagEnabled(false);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('固定输出五个芯片，顺序与页头一致', () => {
    setActivePinia(createPinia());
    const ids = useReadinessChips().value.map((c) => c.id);
    expect(ids).toEqual(['model', 'worldbook', 'documents', 'voice', 'status']);
  });

  it('无模型配置 → model 为 attention 且给出可跳转目标', () => {
    const chip = chipById('model');
    expect(chip?.state).toBe('attention');
    expect(chip?.reasonKey).toBe('readiness.reasonNoProfile');
    expect(chip?.jump?.name).toBe('settings');
    expect(chip?.jump?.query).toEqual({ cat: 'model' });
  });

  it('配置好 Profile → model 变 ready 且不再给跳转', () => {
    const settings = useSettingsStore();
    settings.apiProfiles.push({
      id: 'p1',
      name: '本地网关',
      provider: 'openai',
      baseUrl: 'http://127.0.0.1:7864/v1',
      apiKey: '',
      models: ['hy4'],
      enabled: true,
    } as never);
    settings.activeApiProfileId = 'p1';
    const chip = chipById('model');
    expect(chip?.state).toBe('ready');
    expect(chip?.jump).toBeNull();
  });

  it('纯判定：locked 优先于"未配置"（D-10 的成因就是两者被混用）', () => {
    expect(modelReadiness({ locked: true, hasProfile: false, block: 'no-profile' })).toBe('locked');
    expect(modelReadiness({ locked: false, hasProfile: false, block: 'no-profile' })).toBe('attention');
    expect(modelReadiness({ locked: false, hasProfile: true, block: null })).toBe('ready');
    expect(modelReadiness({ locked: false, hasProfile: true, block: 'no-profile' })).toBe('attention');
  });

  it.skipIf(!globalThis.crypto?.subtle)(
    '真实锁定态：设过主密码并 lock() 后，芯片为 locked 且不复用"未配置"文案',
    async () => {
      const settings = useSettingsStore();
      settings.apiProfiles.push({
        id: 'p1',
        name: '本地网关',
        provider: 'openai',
        baseUrl: 'http://127.0.0.1:7864/v1',
        apiKey: '',
        models: ['hy4'],
        enabled: true,
      } as never);
      settings.activeApiProfileId = 'p1';
      await settings.setMasterPassword('sup3r-secret');
      settings.lock();

      const chip = chipById('model');
      expect(chip?.state).toBe('locked');
      expect(chip?.reasonKey).toBe('readiness.reasonLocked');
    }
  );

  it('无生效世界书 → worldbook 为 attention；加入全局书后即 ready', () => {
    expect(chipById('worldbook')?.state).toBe('attention');
    const lorebook = useLorebookStore();
    lorebook.lorebooks.push({ id: 'lb1', name: '世界', scope: 'global', entries: [] } as never);
    expect(chipById('worldbook')?.state).toBe('ready');
  });

  it('文档芯片：无文档=n-a，有文档但向量关=attention，开向量且有书=ready', () => {
    const lorebook = useLorebookStore();
    lorebook.lorebooks.push({ id: 'lb1', name: '世界', scope: 'global', entries: [] } as never);
    expect(chipById('documents')?.state).toBe('n-a');

    const dataBank = useDataBankStore();
    dataBank.documents.push({ id: 'd1', name: 'a.md', scope: 'global', chunks: [] } as never);
    const off = chipById('documents');
    expect(off?.state).toBe('attention');
    expect(off?.reasonKey).toBe('readiness.reasonChannelOff');

    setVectorRagEnabled(true);
    expect(chipById('documents')?.state).toBe('ready');
  });

  it('未绑定世界书时，向量开关开着也不能报 ready（staticGate 的真实语义）', () => {
    const dataBank = useDataBankStore();
    dataBank.documents.push({ id: 'd1', name: 'a.md', scope: 'global', chunks: [] } as never);
    setVectorRagEnabled(true);
    const chip = chipById('documents');
    expect(chip?.state).toBe('attention');
    expect(chip?.reasonKey).toBe('readiness.reasonStaticNeedsBinding');
  });

  it('语音：默认未启用，开启后 ready，跳转指向扩展类', () => {
    const settings = useSettingsStore();
    expect(chipById('voice')?.state).toBe('n-a');
    settings.ttsConfig = { ...settings.ttsConfig, enabled: true };
    const chip = chipById('voice');
    expect(chip?.state).toBe('ready');
    expect(chip?.jump?.query).toEqual({ cat: 'extension' });
  });
});

describe('useDataBankPrereqs', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    setVectorRagEnabled(false);
  });

  it('三行前提：初始全部未满足，且各带跳转', () => {
    const rows = useDataBankPrereqs().value;
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => !r.done)).toBe(true);
    expect(rows[1]?.jump?.name).toBe('character-list');
    expect(rows[2]?.jump?.query).toEqual({ cat: 'retrieval' });
  });

  it('上传文档 + 全局世界书 + 开向量 → 三行全满足', () => {
    const dataBank = useDataBankStore();
    dataBank.documents.push({ id: 'd1', name: 'a.md', scope: 'global', chunks: [] } as never);
    const lorebook = useLorebookStore();
    lorebook.lorebooks.push({ id: 'lb1', name: '世界', scope: 'global', entries: [] } as never);
    setVectorRagEnabled(true);
    expect(useDataBankPrereqs().value.every((r) => r.done)).toBe(true);
  });

  it('characterStore 无当前角色时不抛错（/databank 可独立打开）', () => {
    const characterStore = useCharacterStore();
    characterStore.characters.splice(0, characterStore.characters.length);
    expect(() => useDataBankPrereqs().value).not.toThrow();
    expect(useReadinessChips().value).toHaveLength(5);
  });
});

/**
 * E10：随机事件与角色之间是**字符串耦合**——`chat-generation.ts:1306` 拿 `character.name`
 * 当场景名去查配置。角色改名后事件静默停摆，而界面上没有任何一处说明这件事。
 * 这里验的是判定本身：一致才算满足，不一致要能把人跳到那个角色身上。
 */
describe('useRandomEventPrereqs', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  function row(id: string) {
    return useRandomEventPrereqs().value.find((r) => r.id === id);
  }

  it('三行前提，顺序为总开关 / 场景名一致 / 已启用场景', () => {
    expect(useRandomEventPrereqs().value.map((r) => r.id)).toEqual([
      'generator-enabled',
      'scene-name-matches-character',
      'scene-enabled',
    ]);
  });

  it('没有当前角色时，场景名一行未满足且跳到角色列表', () => {
    const characterStore = useCharacterStore();
    characterStore.characters.splice(0, characterStore.characters.length);
    const r = row('scene-name-matches-character');
    expect(r?.done).toBe(false);
    expect(r?.jump?.name).toBe('character-list');
  });

  it('场景名等于当前角色名 → 该行满足；角色改名后立刻不满足并跳回该角色', () => {
    const characterStore = useCharacterStore();
    characterStore.characters.push({ id: 'c1', name: '塞拉菲娜' } as never);
    characterStore.currentCharacterId = 'c1';
    const events = useRandomEventsStore();
    events.getOrCreateSceneConfig('塞拉菲娜');

    expect(row('scene-name-matches-character')?.done).toBe(true);

    // 改名即断链——这正是这条边此前完全不可见的原因
    // 走 store 的改名入口（characters 里还有 mock 数据，按下标改会改到别人身上）
    characterStore.updateCharacter('c1', { name: '塞拉' });
    const r = row('scene-name-matches-character');
    expect(r?.done).toBe(false);
    expect(r?.jump).toEqual({ name: 'character-edit', params: { id: 'c1' } });
  });

  it('总开关与已启用场景各自独立判定', () => {
    const events = useRandomEventsStore();
    expect(row('generator-enabled')?.done).toBe(false);
    expect(row('scene-enabled')?.done).toBe(false);

    events.toggleGenerator(true);
    events.getOrCreateSceneConfig('广场');
    events.toggleScene('广场', false);
    expect(row('generator-enabled')?.done).toBe(true);
    // 场景存在但被停用，仍算未满足
    expect(row('scene-enabled')?.done).toBe(false);

    events.toggleScene('广场', true);
    expect(row('scene-enabled')?.done).toBe(true);
  });
});
