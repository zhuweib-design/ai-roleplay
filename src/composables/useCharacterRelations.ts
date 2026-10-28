/**
 * 角色关联视图唯一判定源（L 层，UX_IA_GUIDED_FLOW_DESIGN_2026-10-07.md §3.3）
 *
 * 与 `readiness.ts` 的分工：
 * - `readiness.ts` 回答"现在能不能开工"，面向 `/chat`、`/group` 页头的五个芯片；
 * - 本模块回答"**这个角色**跟哪些模块有关系、关系是真生效还是空挂"，面向角色编辑页。
 *
 * 约束（§四 负向对照）：
 * - 只读真实 store 与真实字段，不读"用户有没有看过某个页面"；
 * - **绝不触发写操作**：角色版本仓库的"是否已跟踪"只能读 `repositories`，
 *   不能调 `selectCharacter()`（它会建仓并落盘）；
 * - 数字必须有出处：世界书按"真实生效集合（全局 + 已绑）"计数，条目只数 `enabled`，
 *   文档按 `getDocumentsForScope('character', id)`（全局 + 本角色）计数。
 */
import { computed, type ComputedRef, type Ref } from 'vue';
import { useCharacterStore } from '@/stores/character';
import { useSettingsStore } from '@/stores/settings';
import { useDataBankStore } from '@/stores/data-bank';
import { useGroupChatStore } from '@/stores/group-chat';
import { useCharacterVersionStore } from '@/stores/character-version';
import { collectLorebooksForCharacter } from '@/stores/chat-context';
import type { ReadinessJump } from '@/composables/useReadiness';
import type { PresetId } from '@core/creation-preset';
import { t, type MessageKey } from '@/i18n';

export type RelationId = 'worldbook' | 'documents' | 'preset' | 'model' | 'version' | 'groups';

export interface RelationRow {
  id: RelationId;
  labelKey: MessageKey;
  /** 事实描述（带数字或名称） */
  textKey: MessageKey;
  params: Record<string, string | number>;
  /** false = 这条关系目前不存在（面板弱化成"未关联"，不假装成问题） */
  linked: boolean;
  jump: ReadinessJump | null;
  /** 跳群聊前要先选中的群（群聊路由无参数，只能先 selectGroup） */
  preSelectGroupId: string | null;
  dataRelJump: string;
}

const PRESET_LABEL_KEY: Record<PresetId, MessageKey> = {
  free: 'preset.free.label',
  balanced: 'preset.balanced.label',
  strict: 'preset.strict.label',
  custom: 'preset.custom.label',
};

/** 角色 ↔ 其他模块的关系行（顺序固定，便于快照断言） */
export function useCharacterRelations(characterId: Ref<string>): ComputedRef<RelationRow[]> {
  const characterStore = useCharacterStore();
  const settings = useSettingsStore();
  const dataBank = useDataBankStore();
  const groupStore = useGroupChatStore();
  const versionStore = useCharacterVersionStore();

  return computed(() => {
    const id = characterId.value;
    const char = characterStore.characters.find((c) => c.id === id);
    if (!char) return [];

    // ── 世界书：真实生效集合（全局书无条件进入 + 本角色绑定） ──
    const books = collectLorebooksForCharacter(id);
    const enabledEntries = books.reduce(
      (n, lb) => n + lb.entries.filter((e) => e.enabled).length,
      0
    );
    const worldbookRow: RelationRow = {
      id: 'worldbook',
      labelKey: 'rel.worldbook',
      textKey: books.length > 0 ? 'rel.worldbookOn' : 'rel.worldbookOff',
      params: books.length > 0 ? { books: books.length, entries: enabledEntries } : {},
      linked: books.length > 0,
      jump: { name: 'worldbook' },
      preSelectGroupId: null,
      dataRelJump: 'rel-worldbook',
    };

    // ── 文档（关键词通道恒可用；向量通道的两个前提由就绪条与 /databank 前提清单说明） ──
    const docs = dataBank.getDocumentsForScope('character', id);
    const documentsRow: RelationRow = {
      id: 'documents',
      labelKey: 'rel.documents',
      textKey: docs.length > 0 ? 'rel.documentsOn' : 'rel.documentsOff',
      params: { count: docs.length },
      linked: docs.length > 0,
      jump: { name: 'databank' },
      preSelectGroupId: null,
      dataRelJump: 'rel-documents',
    };

    // ── 创作模式：角色绑定优先，未绑定则跟随全局 settings.creationPreset ──
    const boundPreset = char.boundPresetId ?? null;
    const effectivePreset: PresetId = boundPreset ?? settings.creationPreset;
    const presetRow: RelationRow = {
      id: 'preset',
      labelKey: 'rel.preset',
      textKey: boundPreset ? 'rel.presetBound' : 'rel.presetFollowGlobal',
      params: { name: t(PRESET_LABEL_KEY[effectivePreset]) },
      linked: boundPreset !== null,
      jump: { name: 'settings', query: { cat: 'model' } },
      preSelectGroupId: null,
      dataRelJump: 'rel-preset',
    };

    // ── 模型：角色级 Profile 优先，未绑定则跟随全局激活项 ──
    const boundProfile = char.profileId
      ? settings.apiProfiles.find((p) => p.id === char.profileId) ?? null
      : null;
    const effectiveProfile = boundProfile ?? settings.activeProfile ?? null;
    const modelRow: RelationRow = {
      id: 'model',
      labelKey: 'rel.model',
      textKey: boundProfile
        ? 'rel.modelBound'
        : effectiveProfile
          ? 'rel.modelFollowGlobal'
          : 'rel.modelNone',
      params: effectiveProfile ? { name: effectiveProfile.name } : {},
      linked: effectiveProfile !== null,
      jump: { name: 'settings', query: { cat: 'model' } },
      preSelectGroupId: null,
      dataRelJump: 'rel-model',
    };

    // ── 版本：只读 repositories，绝不在此处建仓 ──
    const repo = versionStore.repositories.find((r) => r.characterId === id) ?? null;
    const versionRow: RelationRow = {
      id: 'version',
      labelKey: 'rel.version',
      textKey: repo ? 'rel.versionOn' : 'rel.versionOff',
      params: repo ? { commits: repo.totalCommits } : {},
      linked: repo !== null,
      jump: { name: 'character-version' },
      preSelectGroupId: null,
      dataRelJump: 'rel-version',
    };

    // ── 群聊：谁把这个角色拉进了群（E17 的反方向） ──
    const groups = groupStore.groups.filter((g) => g.members.some((m) => m.characterId === id));
    const groupsRow: RelationRow = {
      id: 'groups',
      labelKey: 'rel.groups',
      textKey: groups.length > 0 ? 'rel.groupsOn' : 'rel.groupsOff',
      params: groups.length > 0 ? { count: groups.length, name: groups[0]!.name } : {},
      linked: groups.length > 0,
      jump: { name: 'group' },
      preSelectGroupId: groups.length > 0 ? groups[0]!.id : null,
      dataRelJump: 'rel-groups',
    };

    return [worldbookRow, documentsRow, presetRow, modelRow, versionRow, groupsRow];
  });
}
