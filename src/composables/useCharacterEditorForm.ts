/**
 * useCharacterEditorForm — 角色编辑表单的状态与纯计算（R2-1 拆分）
 *
 * 从 `views/CharacterEditorView.vue` 抽出来的那部分**不碰路由、不碰 Toast**的东西：
 * 表单初值、校验、标签解析、属性构建、保存补丁。
 *
 * 为什么不是"一个 section 一份状态"：这张表单是**跨字段校验**的（属性开关一开，
 * 等级/经验/属性名重复三条校验才成立），而且保存要一次性交出完整补丁。所以状态必须
 * 只有一份，放在视图层，各 section 组件通过 `v-model:form` 共用同一个对象
 * （与 R1-4 设置面板"全走 store 可自由切"不同，那边每个 section 读写的是独立切片）。
 *
 * 注意 `isDirty` 的**登记时机**：宿主必须在初次 `loadCharacter()` **之后**才挂
 * `watch(form, …, { deep: true })`。深链进来时角色库可能还没读完，填表发生在 watch
 * 之后；若在 composable 里就挂上，异步填表会被自己标成"已修改"，于是编辑页一按取消
 * 就弹"未保存"确认——那是旧行为没有的回归。所以 watch 留在宿主，顺序由宿主保证。
 */
import { computed, ref } from 'vue';
import type { UICharacter } from '@/types';
import type { CharacterAttributes, CharacterAttribute } from '@/core/character-card';
import { t } from '@/i18n';

/** 表单字段全集（新建与编辑共用一张表） */
export interface FormState {
  name: string;
  description: string;
  personality: string;
  scenario: string;
  tagsText: string; // 逗号分隔
  avatarType: 'image' | 'gradient';
  avatar: string; // image URL
  gradientFrom: string;
  gradientTo: string;
  initial: string;
  model: string;
  profileId: string | null;
  temperature: number;
  authorNote: string;
  authorDepth: number;
  favorite: boolean;
  // F01.6 角色属性
  attrEnabled: boolean;
  attributesOpen: boolean; // 折叠面板展开状态（默认收起）
  profession: string;
  level: number;
  experience: number;
  stats: CharacterAttribute[];
}

export function emptyCharacterForm(): FormState {
  return {
    name: '',
    description: '',
    personality: '',
    scenario: '',
    tagsText: '',
    avatarType: 'gradient',
    avatar: '',
    gradientFrom: 'var(--tk-cyan-500)',
    gradientTo: 'var(--tk-cyan-700)',
    initial: '',
    model: 'GPT-4o',
    profileId: null,
    temperature: 1.0,
    authorNote: '',
    authorDepth: 4,
    favorite: false,
    // F01.6 角色属性默认值
    attrEnabled: false,
    attributesOpen: false,
    profession: '',
    level: 1,
    experience: 0,
    stats: [],
  };
}

/** 标签输入框 → 标签数组（中英文逗号/分号/换行都算分隔，最多 16 个） */
export function parseTags(text: string): string[] {
  return text
    .split(/[,，;；\n]/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .slice(0, 16);
}

export function tagsToText(tags: string[]): string {
  return tags.join(', ');
}

export function useCharacterEditorForm(getId: () => string | undefined) {
  const form = ref<FormState>(emptyCharacterForm());
  /** 表单是否被改过（初次填表不算）。宿主负责在初次填表**之后**挂 watch 维护它 */
  const isDirty = ref(false);
  /** 编辑模式下已加载的角色（删除确认要念名字） */
  const loadedCharacter = ref<UICharacter | null>(null);

  // ── 表单验证 ──
  const errors = computed<Record<string, string>>(() => {
    const e: Record<string, string> = {};
    if (!form.value.name.trim()) {
      e.name = t('charEdit.nameRequired');
    } else if (form.value.name.trim().length > 64) {
      e.name = t('charEdit.nameTooLong');
    }
    if (form.value.avatarType === 'image' && !form.value.avatar.trim()) {
      e.avatar = t('charEdit.avatarRequired');
    }
    if (
      form.value.avatarType === 'gradient' &&
      (!form.value.gradientFrom.trim() || !form.value.gradientTo.trim())
    ) {
      e.gradient = t('charEdit.gradientRequired');
    }
    if (form.value.temperature < 0 || form.value.temperature > 2) {
      e.temperature = t('charEdit.tempRange');
    }
    if (form.value.authorDepth < 0 || form.value.authorDepth > 50) {
      e.authorDepth = t('charEdit.depthRange');
    }
    // F01.6 角色属性校验
    if (form.value.attrEnabled) {
      if (
        !Number.isInteger(form.value.level) ||
        form.value.level < 0 ||
        form.value.level > 9999
      ) {
        e.level = t('charEdit.levelInvalid');
      }
      if (
        !Number.isInteger(form.value.experience) ||
        form.value.experience < 0
      ) {
        e.experience = t('charEdit.expInvalid');
      }
      // 校验属性名重复
      const names = form.value.stats
        .map((s) => s.name.trim())
        .filter((n) => n !== '');
      const dup = names.find((n, i) => names.indexOf(n) !== i);
      if (dup) {
        e.stats = t('charEdit.statsDuplicate', { name: dup });
      }
    }
    return e;
  });

  const hasErrors = computed(() => Object.keys(errors.value).length > 0);
  const canSave = computed(() => !hasErrors.value && form.value.name.trim().length > 0);

  /**
   * F01.6 从表单构建 CharacterAttributes 对象
   * 仅在 attrEnabled 为 true 且有有效内容时返回，否则返回 undefined
   */
  function buildAttributes(): CharacterAttributes | undefined {
    if (!form.value.attrEnabled) return undefined;

    const attrs: CharacterAttributes = {};
    if (form.value.profession.trim()) {
      attrs.profession = form.value.profession.trim();
    }
    attrs.level = form.value.level;
    attrs.experience = form.value.experience;

    const validStats = form.value.stats
      .filter((s) => s.name.trim() !== '')
      .map((s) => ({
        name: s.name.trim(),
        value: s.value,
        type: s.type,
      }));
    if (validStats.length > 0) {
      attrs.stats = validStats;
    }

    return attrs;
  }

  // ── 预览角色（基于当前表单状态构造一个 UICharacter 给 Avatar 组件） ──
  const previewCharacter = computed<UICharacter>(() => ({
    id: getId() ?? 'preview',
    name: form.value.name || t('charEdit.unnamed'),
    avatarType: form.value.avatarType,
    avatar: form.value.avatar || undefined,
    gradientFrom: form.value.gradientFrom,
    gradientTo: form.value.gradientTo,
    initial: form.value.initial || form.value.name[0] || '?',
    lastActive: t('charEdit.justNow'),
    favorite: form.value.favorite,
    tags: parseTags(form.value.tagsText),
    description: form.value.description || t('charEdit.noDesc'),
    model: form.value.model,
    profileId: form.value.profileId,
    conversations: [],
    messages: [],
    authorNote: form.value.authorNote,
    authorDepth: form.value.authorDepth,
    temperature: form.value.temperature,
    tokenBudget: { character: 0, worldInfo: 0, chatHistory: 0, remaining: 8192 },
    // F01.6 角色属性预览
    attributes: buildAttributes(),
  }));

  /** 加载已有角色（编辑模式） */
  function loadCharacter(c: UICharacter): void {
    loadedCharacter.value = c;
    form.value = {
      name: c.name,
      description: c.description,
      personality: c.personality ?? '',
      scenario: c.scenario ?? '',
      tagsText: tagsToText(c.tags),
      avatarType: c.avatarType,
      avatar: c.avatar ?? '',
      gradientFrom: c.gradientFrom ?? 'var(--tk-cyan-500)',
      gradientTo: c.gradientTo ?? 'var(--tk-cyan-700)',
      initial: c.initial ?? '',
      model: c.model,
      profileId: c.profileId ?? null,
      temperature: c.temperature,
      authorNote: c.authorNote,
      authorDepth: c.authorDepth,
      favorite: c.favorite,
      // F01.6 加载角色属性
      attrEnabled: !!c.attributes,
      attributesOpen: false,
      profession: c.attributes?.profession ?? '',
      level: c.attributes?.level ?? 1,
      experience: c.attributes?.experience ?? 0,
      stats: c.attributes?.stats
        ? c.attributes.stats.map((s) => ({ ...s }))
        : [],
    };
    isDirty.value = false;
  }

  /** 回到"新建"的空表单（脏标记一并清掉） */
  function resetToEmpty(): void {
    form.value = emptyCharacterForm();
    isDirty.value = false;
  }

  function buildPatch(): Partial<UICharacter> {
    const attributes = buildAttributes();
    return {
      name: form.value.name.trim(),
      description: form.value.description,
      personality: form.value.personality.trim() || undefined,
      scenario: form.value.scenario.trim() || undefined,
      tags: parseTags(form.value.tagsText),
      avatarType: form.value.avatarType,
      avatar: form.value.avatarType === 'image' ? form.value.avatar : undefined,
      gradientFrom: form.value.gradientFrom,
      gradientTo: form.value.gradientTo,
      initial: form.value.initial || form.value.name[0] || '?',
      model: form.value.model,
      profileId: form.value.profileId,
      temperature: form.value.temperature,
      authorNote: form.value.authorNote,
      authorDepth: form.value.authorDepth,
      favorite: form.value.favorite,
      // F01.6 角色属性（undefined 时清除已有属性）
      attributes,
    };
  }

  return {
    form,
    isDirty,
    loadedCharacter,
    errors,
    hasErrors,
    canSave,
    previewCharacter,
    buildAttributes,
    loadCharacter,
    resetToEmpty,
    buildPatch,
  };
}
