<script setup lang="ts">
/**
 * StoryEngineView — 故事引擎页面 (F16.1)
 *
 * 功能：
 * - 上传小说文件（TXT/MD），选择分析深度（快速/标准/深度）
 * - 调用 LLM 进行结构化分析，提取人物/场景/事件/世界/脚本
 * - 实时进度跟踪（已完成分块/总分块）
 * - 取消分析（AbortController）
 * - 故事卡片列表（按创建时间降序）
 * - 展开查看分析结果详情（人物、场景、事件、世界信息、脚本）
 * - 删除故事（带确认 Modal）
 *
 * 无障碍：
 * - 语义化 main/section/article
 * - aria-label 标注图标按钮
 * - Modal 焦点陷阱
 * - 删除前确认
 * - Toast role=alert 反馈
 * - 进度条 role="progressbar"
 */
import { ref, computed, useTemplateRef } from 'vue';
import { useRouter } from 'vue-router';
import { useStoryStore } from '@/stores/story';
import { useSettingsStore } from '@/stores/settings';
import { useLorebookStore } from '@/stores/lorebook';
import { useCharacterStore } from '@/stores/character';
import { CHARACTER_TEMPLATES, type CharacterTemplateId } from '@core/character-generator';
import { buildSourceContext } from '@core/story-analyzer';
import { STORY_TEMPLATES, type StoryTemplateId } from '@core/story-templates';
import Icon from '@/components/common/Icon.vue';
import Modal from '@/components/common/Modal.vue';
import Toast from '@/components/common/Toast.vue';
import FilterTabs, { type FilterTab } from '@/components/common/FilterTabs.vue';
import {
  ANALYSIS_DEPTHS,
  type AnalysisDepth,
  type AnalysisDepthMeta,
  type StoryAnalysisResult,
  type ImportConflictStrategy,
  type ImportResult,
  type ProtagonistConfig,
  type ProtagonistRole,
  type ProtagonistRelation,
} from '@core/story-types';
import {
  validateProtagonist,
  addRelation as addRelationCore,
  removeRelation as removeRelationCore,
  buildProtagonistPrompt,
  MAX_PROTAGONIST_NAME_LENGTH,
  MAX_PROTAGONIST_DESCRIPTION_LENGTH,
  MAX_RELATION_DESC_LENGTH,
  MAX_RELATIONS_COUNT,
} from '@core/protagonist';
import { usePersonaStore } from '@/stores/persona';
import { t } from '@/i18n';

const router = useRouter();
const store = useStoryStore();
const settingsStore = useSettingsStore();
const lorebookStore = useLorebookStore();
const personaStore = usePersonaStore();
const characterStore = useCharacterStore();

// ── T-08: 一键生成设定（世界书 + 主角角色卡）──
const quickGenTemplate = ref<CharacterTemplateId>('fantasy');
const quickGenRunning = ref(false);
const quickGenResult = ref<{ worldId: string | null; charId: string | null } | null>(null);

/**
 * 一键生成可玩设定：依次生成世界书与主角角色卡
 * 目标：10 分钟内从空白到可玩场景
 */
async function handleQuickSetup() {
  if (quickGenRunning.value) return;
  if (!hasApiProfile.value) {
    showToast('error', t('story.quickApiRequired'));
    return;
  }
  quickGenRunning.value = true;
  quickGenResult.value = null;
  try {
    // T-08 阶段二：优先用当前展开故事的分析结果作为源素材上下文
    const stories = store.stories;
    const sourceStory =
      (expandedStoryId.value
        ? stories.find((s) => s.id === expandedStoryId.value)
        : null) ??
      [...stories]
        .filter((s) => s.status === 'completed')
        .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))[0] ??
      null;
    const sourceContext = sourceStory ? buildSourceContext(sourceStory) : undefined;

    // 1. 生成世界书（默认全局作用域）
    const worldId = await lorebookStore.generateRandomWorldbook(
      quickGenTemplate.value,
      'global',
      sourceContext
    );
    // 2. 生成主角角色卡（同模板风格）
    const charId = await characterStore.generateRandomCharacter(
      quickGenTemplate.value,
      sourceContext
    );
    quickGenResult.value = { worldId, charId };
    if (worldId && charId) {
      showToast('success', t('story.quickDone'));
    } else {
      showToast('error', t('story.quickPartial'));
    }
  } catch (err) {
    showToast('error', t('story.quickFailed', { error: err instanceof Error ? err.message : String(err) }));
  } finally {
    quickGenRunning.value = false;
  }
}

// ── UI 状态 ──
const uploadModalOpen = ref(false);
const selectedDepth = ref<AnalysisDepth>('standard');
const selectedTemplate = ref<StoryTemplateId>('generic');
const selectedFile = ref<File | null>(null);
const fileText = ref<string>(''); // 保留上传的文本用于分析
const deleteTargetId = ref<string | null>(null);
const deleteModalOpen = ref(false);
const expandedStoryId = ref<string | null>(null);
const toastOpen = ref(false);
const toastType = ref<'info' | 'success' | 'error'>('info');
const toastMessage = ref('');
const fileInput = useTemplateRef<HTMLInputElement>('fileInput');

const hasApiProfile = computed(() => settingsStore.activeApiProfileId !== null);

// ── F16.2 导入 UI 状态 ──
const importModalOpen = ref(false);
const importTargetStoryId = ref<string | null>(null);
const importCategory = ref<'all' | 'world' | 'scenes' | 'characters' | 'events' | 'scripts'>('all');
const importStrategy = ref<ImportConflictStrategy>('add');
const importLorebookId = ref<string>('');
const importResults = ref<ImportResult[]>([]);
const importResultsVisible = ref(false);

const availableLorebooks = computed(() => lorebookStore.lorebooks);

const importTargetStory = computed(() =>
  store.stories.find((s) => s.id === importTargetStoryId.value) ?? null
);

// ── F16.3 主角配置 UI 状态 ──
const protagonistModalOpen = ref(false);
const protagonistTargetStoryId = ref<string | null>(null);
/** 主角配置表单模式：'existing' 从故事人物选 / 'custom' 自定义 */
const protagonistFormMode = ref<'existing' | 'custom'>('existing');
/** 选中的故事人物名（mode='existing' 时） */
const protagonistSelectedCharName = ref<string>('');
/** 主角身份 */
const protagonistRole = ref<ProtagonistRole>('protagonist');
/** 主角名（mode='custom' 时） */
const protagonistName = ref<string>('');
/** 主角描述 */
const protagonistDescription = ref<string>('');
/** 起始场景名 */
const protagonistStartingScene = ref<string>('');
/** 关系列表（编辑态） */
const protagonistRelations = ref<ProtagonistRelation[]>([]);
/** 新增关系的目标人物名（输入框） */
const newRelationTarget = ref<string>('');
/** 新增关系的关系描述（输入框） */
const newRelationDesc = ref<string>('');
/** 校验错误信息 */
const protagonistFormErrors = ref<string[]>([]);

const protagonistTargetStory = computed(() =>
  store.stories.find((s) => s.id === protagonistTargetStoryId.value) ?? null
);

/** 故事中可选的人物列表（用于 mode='existing' 的下拉选择） */
const protagonistCharacterOptions = computed(() =>
  protagonistTargetStory.value?.characters.map((c) => c.name) ?? []
);

/** 故事中可选的场景列表（用于起始场景下拉） */
const protagonistSceneOptions = computed(() =>
  protagonistTargetStory.value?.scenes.map((s) => s.name) ?? []
);

/** 新增关系时可选的目标人物名（来自故事人物，但允许自定义外部角色） */
const relationTargetOptions = computed(() =>
  protagonistTargetStory.value?.characters.map((c) => c.name) ?? []
);

/** 当前编辑的主角表单（合并状态） */
const protagonistFormDraft = computed<ProtagonistConfig | null>(() => {
  if (!protagonistTargetStory.value) return null;
  const now = Date.now();
  const name =
    protagonistFormMode.value === 'existing'
      ? protagonistSelectedCharName.value
      : protagonistName.value;
  if (!name) return null;
  return {
    role: protagonistRole.value,
    source: protagonistFormMode.value,
    name,
    description: protagonistDescription.value,
    startingScene: protagonistStartingScene.value || undefined,
    relations: protagonistRelations.value,
    personaId: null,
    createdAt: now,
    updatedAt: now,
  };
});

/** 是否可保存（基本合法性预检） */
const canSaveProtagonist = computed(() => {
  if (!protagonistFormDraft.value) return false;
  const errors = validateProtagonist(
    protagonistFormDraft.value,
    protagonistTargetStory.value ?? undefined
  );
  return errors.length === 0;
});

const canImport = computed(() => {
  if (!importTargetStory.value) return false;
  if (importCategory.value === 'world') return !!importTargetStory.value.worldInfo;
  if (importCategory.value === 'scenes') return importTargetStory.value.scenes.length > 0;
  if (importCategory.value === 'characters') return importTargetStory.value.characters.length > 0;
  if (importCategory.value === 'events') return importTargetStory.value.events.length > 0;
  if (importCategory.value === 'scripts') return importTargetStory.value.scripts.length > 0;
  return true;
});

const needsLorebook = computed(() =>
  importCategory.value === 'all' ||
  importCategory.value === 'world' ||
  importCategory.value === 'scenes' ||
  importCategory.value === 'events'
);

// ── 计算属性 ──
const stories = computed(() => store.filteredStories);

// ── 需求1：分类 Tab 筛选（按故事分析状态） ─────────────────────────
const STATUS_LABELS: Record<'pending' | 'analyzing' | 'completed' | 'failed', string> = {
  pending: t('story.statusPending'),
  analyzing: t('story.statusAnalyzing'),
  completed: t('story.statusCompleted'),
  failed: t('story.statusFailed'),
};

const statusFilterTabs = computed<FilterTab[]>(() => {
  const counts = store.statusCounts;
  return (Object.keys(STATUS_LABELS) as Array<keyof typeof STATUS_LABELS>)
    .filter((s) => counts[s] > 0)
    .map((s) => ({
      value: s,
      label: STATUS_LABELS[s],
      count: counts[s],
    }));
});

const filterStatus = computed({
  get: () => store.filterStatus,
  set: (v: string) => store.setFilterStatus(v as 'pending' | 'analyzing' | 'completed' | 'failed' | ''),
});

const isAnalyzing = computed(() => store.isAnalyzing);
const progress = computed(() => store.progress);
const progressPercent = computed(() => {
  if (progress.value.total === 0) return 0;
  return Math.round((progress.value.completed / progress.value.total) * 100);
});

// ── 方法 ──

function goBack() {
  void router.push({ name: 'chat' });
}

function showToast(type: 'info' | 'success' | 'error', message: string) {
  toastType.value = type;
  toastMessage.value = message;
  toastOpen.value = true;
}

function openUploadModal() {
  if (!hasApiProfile.value) {
    showToast('error', t('story.apiRequired'));
    return;
  }
  selectedDepth.value = 'standard';
  selectedTemplate.value = 'generic';
  selectedFile.value = null;
  fileText.value = '';
  uploadModalOpen.value = true;
}

function closeUploadModal() {
  uploadModalOpen.value = false;
  // 延迟清空以便关闭动画
  setTimeout(() => {
    selectedFile.value = null;
    fileText.value = '';
  }, 200);
}

function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement;
  if (input.files && input.files.length > 0) {
    void loadFileContent(input.files[0]!);
  }
}

function handleDrop(event: DragEvent) {
  event.preventDefault();
  if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
    void loadFileContent(event.dataTransfer.files[0]!);
  }
}

function handleDragOver(event: DragEvent) {
  event.preventDefault();
}

async function loadFileContent(file: File) {
  const ext = getExtension(file.name);
  const supportedExts = ['txt', 'md', 'markdown', 'text'];
  if (!supportedExts.includes(ext)) {
    showToast('error', t('story.unsupportedExt', { ext, supported: supportedExts.join(', ') }));
    return;
  }

  const MAX_STORY_FILE_SIZE = 10 * 1024 * 1024;
  if (file.size > MAX_STORY_FILE_SIZE) {
    showToast('error', t('story.fileTooLarge', { size: MAX_STORY_FILE_SIZE / 1024 / 1024 }));
    return;
  }

  try {
    const text = await file.text();
    if (text.trim().length === 0) {
      showToast('error', t('story.fileEmpty'));
      return;
    }
    selectedFile.value = file;
    fileText.value = text;
  } catch (err) {
    showToast('error', t('story.readFailed', { error: err instanceof Error ? err.message : String(err) }));
  }
}

async function handleUpload() {
  if (!selectedFile.value || !fileText.value) {
    showToast('error', t('story.selectFile'));
    return;
  }

  const id = await store.createStoryFromFile(
    selectedFile.value,
    selectedDepth.value,
    selectedTemplate.value
  );

  if (id) {
    closeUploadModal();
    if (store.lastInfo) {
      showToast('success', store.lastInfo);
    }
    // 自动开始分析
    const success = await store.analyzeStoryWithText(id, fileText.value);
    if (success) {
      if (store.lastInfo) {
        showToast('success', store.lastInfo);
      }
    } else if (store.lastError) {
      showToast('error', store.lastError);
    }
    // 清空临时文本引用（store 不保留原始文本）
    fileText.value = '';
  } else if (store.lastError) {
    showToast('error', store.lastError);
  }
}

function handleCancelAnalysis() {
  store.cancelAnalysis();
  showToast('info', t('story.cancelRequested'));
}

function confirmDelete(id: string) {
  deleteTargetId.value = id;
  deleteModalOpen.value = true;
}

async function handleDelete() {
  if (!deleteTargetId.value) return;
  await store.deleteStory(deleteTargetId.value);
  deleteModalOpen.value = false;
  deleteTargetId.value = null;
  showToast('success', t('story.deleted'));
}

function toggleExpand(id: string) {
  expandedStoryId.value = expandedStoryId.value === id ? null : id;
}

function formatDateTime(ts: number): string {
  try {
    return new Date(ts).toLocaleString('zh-CN');
  } catch {
    return String(ts);
  }
}

function formatCharCount(n: number): string {
  if (n < 1000) return t('story.charCount', { count: n });
  if (n < 10000) return t('story.charCountK', { count: (n / 1000).toFixed(1) });
  return t('story.charCountW', { count: (n / 10000).toFixed(1) });
}
function getDepthMeta(depth: AnalysisDepth): AnalysisDepthMeta | undefined {
  return ANALYSIS_DEPTHS.find((d) => d.id === depth);
}

function getStatusLabel(status: StoryAnalysisResult['status']): string {
  switch (status) {
    case 'pending':
      return t('story.statusPending');
    case 'analyzing':
      return t('story.statusAnalyzing');
    case 'completed':
      return t('story.statusCompleted');
    case 'failed':
      return t('story.statusFailed');
    default:
      return status;
  }
}

function getStatusClass(status: StoryAnalysisResult['status']): string {
  switch (status) {
    case 'pending':
      return 'status-pending';
    case 'analyzing':
      return 'status-analyzing';
    case 'completed':
      return 'status-completed';
    case 'failed':
      return 'status-failed';
    default:
      return '';
  }
}

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : '';
}

// ── F16.2 导入方法 ──

function openImportModal(storyId: string) {
  importTargetStoryId.value = storyId;
  importCategory.value = 'all';
  importStrategy.value = 'add';
  importResults.value = [];
  importResultsVisible.value = false;
  // 默认选择第一个 Lorebook
  importLorebookId.value = availableLorebooks.value[0]?.id ?? '';
  importModalOpen.value = true;
}

function closeImportModal() {
  importModalOpen.value = false;
}

function handleImport() {
  if (!importTargetStoryId.value) return;
  const storyId = importTargetStoryId.value;

  if (importCategory.value === 'scripts') {
    store.exportScripts(storyId);
    if (store.lastInfo) showToast('success', store.lastInfo);
    closeImportModal();
    return;
  }

  if (needsLorebook.value && !importLorebookId.value) {
    showToast('error', t('story.needLorebook'));
    return;
  }

  const lbId = importLorebookId.value;
  const strategy = importStrategy.value;
  let results: ImportResult[] = [];

  switch (importCategory.value) {
    case 'world':
      results = store.importWorld(storyId, lbId, strategy);
      break;
    case 'scenes':
      results = store.importScenes(storyId, lbId, strategy);
      break;
    case 'characters':
      results = store.importCharacters(storyId, strategy);
      break;
    case 'events':
      results = store.importEvents(storyId, lbId, strategy);
      break;
    case 'all':
      results = store.importAll(storyId, lbId, strategy);
      break;
  }

  importResults.value = results;
  importResultsVisible.value = true;

  if (store.lastInfo) showToast('success', store.lastInfo);
  if (store.lastError) showToast('error', store.lastError);
}

function getImportCategoryLabel(cat: typeof importCategory.value): string {
  const labels: Record<typeof importCategory.value, string> = {
    all: t('story.catAll'),
    world: t('story.catWorld'),
    scenes: t('story.catScenes'),
    characters: t('story.catCharacters'),
    events: t('story.catEvents'),
    scripts: t('story.catScripts'),
  };
  return labels[cat] ?? cat;
}

function getStrategyLabel(s: ImportConflictStrategy): string {
  const labels: Record<ImportConflictStrategy, string> = {
    add: t('story.strategyAdd'),
    overwrite: t('story.strategyOverwrite'),
    merge: t('story.strategyMerge'),
  };
  return labels[s] ?? s;
}

function getResultLabel(type: ImportResult['type']): string {
  const labels: Record<ImportResult['type'], string> = {
    character: t('story.resultTypeChar'),
    lorebook: t('story.resultTypeLorebook'),
    event: t('story.resultTypeEvent'),
    scene: t('story.resultTypeScene'),
  };
  return labels[type] ?? type;
}

function isCategoryAvailable(cat: typeof importCategory.value): boolean {
  const story = importTargetStory.value;
  if (!story) return false;
  if (cat === 'all') return story.status === 'completed';
  if (cat === 'world') return !!story.worldInfo;
  if (cat === 'scenes') return story.scenes.length > 0;
  if (cat === 'characters') return story.characters.length > 0;
  if (cat === 'events') return story.events.length > 0;
  if (cat === 'scripts') return story.scripts.length > 0;
  return false;
}

function getCategoryCount(cat: typeof importCategory.value): number {
  const story = importTargetStory.value;
  if (!story) return 0;
  if (cat === 'world') return story.worldInfo ? 1 : 0;
  if (cat === 'scenes') return story.scenes.length;
  if (cat === 'characters') return story.characters.length;
  if (cat === 'events') return story.events.length;
  if (cat === 'scripts') return story.scripts.length;
  return 0;
}

// ── F16.3 主角配置方法 ──

/**
 * 打开主角配置 Modal（从某个故事人物快速进入）
 * @param storyId 故事 ID
 * @param characterName 可选：预填的人物名（来自"设为主角"按钮）
 */
function openProtagonistModal(storyId: string, characterName?: string) {
  protagonistTargetStoryId.value = storyId;
  protagonistFormErrors.value = [];

  const story = store.stories.find((s) => s.id === storyId);
  if (!story) {
    showToast('error', t('story.storyNotFound'));
    return;
  }

  // 已有主角配置：载入编辑
  if (story.protagonist) {
    const p = story.protagonist;
    protagonistFormMode.value = p.source;
    protagonistSelectedCharName.value = p.source === 'existing' ? p.name : '';
    protagonistName.value = p.source === 'custom' ? p.name : '';
    protagonistRole.value = p.role;
    protagonistDescription.value = p.description;
    protagonistStartingScene.value = p.startingScene ?? '';
    protagonistRelations.value = [...p.relations];
  } else if (characterName) {
    // 从"设为主角"按钮进入：预填已有人物
    const character = story.characters.find((c) => c.name === characterName);
    if (character) {
      protagonistFormMode.value = 'existing';
      protagonistSelectedCharName.value = characterName;
      protagonistRole.value = 'protagonist';
      protagonistDescription.value = character.description ?? '';
      protagonistStartingScene.value = '';
      protagonistRelations.value = (character.relationships ?? []).map((r) => ({
        target: r.target,
        relation: r.relation,
      }));
    }
  } else {
    // 默认自定义模式
    protagonistFormMode.value = 'custom';
    protagonistSelectedCharName.value = '';
    protagonistName.value = '';
    protagonistRole.value = 'protagonist';
    protagonistDescription.value = '';
    protagonistStartingScene.value = '';
    protagonistRelations.value = [];
  }

  newRelationTarget.value = '';
  newRelationDesc.value = '';
  protagonistModalOpen.value = true;
}

function closeProtagonistModal() {
  protagonistModalOpen.value = false;
}

/** 切换表单模式时同步主角名 */
function handleProtagonistModeChange(mode: 'existing' | 'custom') {
  if (mode === protagonistFormMode.value) return;
  protagonistFormMode.value = mode;
  // 切换到 custom 时清空 existing 选择
  if (mode === 'custom') {
    protagonistSelectedCharName.value = '';
  } else {
    protagonistName.value = '';
  }
  protagonistFormErrors.value = [];
}

/** 切换 selectedCharName 时同步描述（如果用户尚未自定义） */
function handleSelectedCharChange(name: string) {
  protagonistSelectedCharName.value = name;
  const story = protagonistTargetStory.value;
  if (!story) return;
  const character = story.characters.find((c) => c.name === name);
  if (character) {
    protagonistDescription.value = character.description ?? '';
    protagonistRelations.value = (character.relationships ?? []).map((r) => ({
      target: r.target,
      relation: r.relation,
    }));
  }
}

/** 新增一条关系 */
function handleAddRelation() {
  const target = newRelationTarget.value.trim();
  const relation = newRelationDesc.value.trim();
  if (!target || !relation) {
    showToast('error', t('story.needRelationFields'));
    return;
  }
  if (protagonistRelations.value.length >= MAX_RELATIONS_COUNT) {
    showToast('error', t('story.relationLimit', { max: MAX_RELATIONS_COUNT }));
    return;
  }
  protagonistRelations.value = addRelationCore(
    protagonistRelations.value,
    target,
    relation
  );
  newRelationTarget.value = '';
  newRelationDesc.value = '';
}

/** 移除指定关系 */
function handleRemoveRelation(target: string) {
  protagonistRelations.value = removeRelationCore(
    protagonistRelations.value,
    target
  );
}

/** 保存主角配置 */
function handleSaveProtagonist() {
  if (!protagonistTargetStoryId.value || !protagonistFormDraft.value) {
    showToast('error', t('story.completeFirst'));
    return;
  }

  const storyId = protagonistTargetStoryId.value;
  const draft = protagonistFormDraft.value;
  const errors = validateProtagonist(draft, protagonistTargetStory.value ?? undefined);
  if (errors.length > 0) {
    protagonistFormErrors.value = errors;
    showToast('error', t('story.validateFailed', { error: errors[0]! }));
    return;
  }
  protagonistFormErrors.value = [];

  let ok = false;
  if (draft.source === 'existing') {
    ok = store.setProtagonistFromCharacter(
      storyId,
      draft.name,
      draft.role,
      draft.startingScene
    );
    // existing 模式下，setProtagonistFromCharacter 不会处理 description/relations 自定义项
    // 需调用 updateProtagonist 同步用户修改后的 description 和 relations
    if (ok && (draft.description || draft.relations.length > 0)) {
      ok = store.updateProtagonist(storyId, {
        description: draft.description,
        relations: draft.relations,
      });
    }
  } else {
    ok = store.setProtagonistAsCustom(storyId, {
      name: draft.name,
      description: draft.description,
      role: draft.role,
      startingScene: draft.startingScene,
      relations: draft.relations,
    });
  }

  if (ok) {
    // 同步创建/更新故事主角 Persona
    const story = store.stories.find((s) => s.id === storyId);
    if (story?.protagonist) {
      const existingPersonaId = story.protagonist.personaId;
      // 如果已有 Persona，更新描述；否则创建新 Persona
      if (existingPersonaId) {
        personaStore.updatePersona(existingPersonaId, {
          name: story.protagonist.name,
          description: buildProtagonistPromptForPersona(story.protagonist),
        });
      } else {
        const newPersonaId = personaStore.createStoryProtagonistPersona(story.protagonist);
        if (newPersonaId) {
          store.setProtagonistPersonaId(storyId, newPersonaId);
        }
      }
    }
    if (store.lastInfo) showToast('success', store.lastInfo);
    if (store.lastError) showToast('error', store.lastError);
    closeProtagonistModal();
  } else if (store.lastError) {
    showToast('error', store.lastError);
  }
}

/** 清除主角配置 */
function handleClearProtagonist(storyId: string) {
  const ok = store.clearProtagonist(storyId);
  if (ok) {
    if (store.lastInfo) showToast('success', store.lastInfo);
  } else if (store.lastError) {
    showToast('error', store.lastError);
  }
}

/** 切换激活 Persona 到故事主角 Persona */
function handleActivateProtagonistPersona(storyId: string) {
  const story = store.stories.find((s) => s.id === storyId);
  if (!story?.protagonist?.personaId) {
    showToast('error', t('story.personaNotLinked'));
    return;
  }
  personaStore.setActivePersona(story.protagonist.personaId);
  if (personaStore.lastInfo) showToast('success', personaStore.lastInfo);
  if (personaStore.lastError) showToast('error', personaStore.lastError);
}

/** 工具：构建 Persona 描述（与 createStoryProtagonistPersona 一致） */
function buildProtagonistPromptForPersona(config: ProtagonistConfig): string {
  return buildProtagonistPrompt(config);
}

function getProtagonistRoleLabel(role: ProtagonistRole): string {
  return role === 'protagonist' ? t('story.roleProtagonist') : t('story.roleObserver');
}

// ── F16.4 故事时间配置 UI 状态 ──


// ── 需求8：故事与世界书关联 UI ──

/** 获取故事关联的世界书名称（用于显示） */
function getBoundWorldBookName(storyId: string): string {
  const story = store.stories.find((s) => s.id === storyId);
  if (!story?.boundWorldBookId) return '';
  const lb = lorebookStore.lorebooks.find((l) => l.id === story.boundWorldBookId);
  return lb?.name ?? '';
}

/** 切换故事关联的世界书 */
function handleBindWorldBook(storyId: string, worldBookId: string): void {
  const ok = store.setStoryWorldBookBinding(storyId, worldBookId || null);
  if (ok) {
    if (worldBookId) {
      const lbName = lorebookStore.lorebooks.find((l) => l.id === worldBookId)?.name ?? worldBookId;
      showToast('success', t('story.boundWorldbookOk', { name: lbName }));
    } else {
      showToast('info', t('story.unboundWorldbook'));
    }
  } else if (store.lastError) {
    showToast('error', store.lastError);
  }
}

/** 主角来源标签 */
function getProtagonistSourceLabel(source: 'existing' | 'custom'): string {
  return source === 'existing' ? t('story.sourceExisting') : t('story.sourceCustom');
}
</script>

<template>
  <div class="story-view">
    <!-- 顶部 Header -->
    <header class="page-header">
      <div class="header-title">
        <button
          type="button"
          class="header-btn back"
          :aria-label="t('story.backAria')"
          @click="goBack"
        >
          <Icon name="arrow-left" :size="16" />
          <span class="btn-label">{{ t('story.back') }}</span>
        </button>
        <h1>{{ t('story.title') }}</h1>
        <span class="header-count">{{ t('story.count', { count: store.stories.length }) }}</span>
      </div>

      <div class="header-actions">
        <button
          type="button"
          class="header-btn upload-btn"
          :aria-label="t('story.uploadAria')"
          :disabled="isAnalyzing"
          @click="openUploadModal"
        >
          <Icon name="upload" :size="16" />
          <span class="btn-label">{{ t('story.upload') }}</span>
        </button>
      </div>
    </header>

    <!-- T-08: 一键生成设定（世界书 + 主角角色卡）-->
    <section class="quick-setup-panel" :aria-label="t('story.quickAria')">
      <div class="quick-setup-head">
        <Icon name="book-open" :size="16" />
        <span class="quick-setup-title">{{ t('story.quickTitle') }}</span>
        <span class="quick-setup-hint">{{ t('story.quickHint') }}</span>
      </div>
      <div class="quick-setup-body">
        <div class="template-pills" role="radiogroup" :aria-label="t('story.quickTemplateAria')">
          <button
            v-for="tpl in CHARACTER_TEMPLATES"
            :key="tpl.id"
            type="button"
            role="radio"
            :aria-checked="quickGenTemplate === tpl.id"
            class="template-pill"
            :class="{ active: quickGenTemplate === tpl.id }"
            :title="tpl.description"
            @click="quickGenTemplate = tpl.id"
          >
            {{ tpl.label }}
          </button>
        </div>
        <button
          type="button"
          class="header-btn upload-btn quick-setup-btn"
          :disabled="quickGenRunning || isAnalyzing"
          @click="handleQuickSetup"
        >
          <Icon name="refresh-cw" :size="16" :class="{ spinning: quickGenRunning }" />
          <span class="btn-label">{{ quickGenRunning ? t('story.generating') : t('story.quickGenerate') }}</span>
        </button>
      </div>
      <!-- 生成结果：提供跳转入口 -->
      <div
        v-if="quickGenResult"
        class="quick-setup-result"
        role="status"
        aria-live="polite"
      >
        <span v-if="quickGenResult.worldId" class="result-item">
          {{ t('story.worldGenerated') }}
          <button type="button" class="result-link" @click="router.push({ name: 'worldbook' })">{{ t('story.view') }}</button>
        </span>
        <span v-else class="result-item fail">{{ t('story.worldFailed') }}</span>
        <span v-if="quickGenResult.charId" class="result-item">
          {{ t('story.charGenerated') }}
          <button type="button" class="result-link" @click="router.push({ name: 'character-list' })">{{ t('story.view') }}</button>
        </span>
        <span v-else class="result-item fail">{{ t('story.charFailed') }}</span>
      </div>
    </section>

    <!-- 搜索框 -->
    <div class="search-bar">
      <span class="search-icon" aria-hidden="true"><Icon name="search" :size="16" /></span>
      <input
        type="text"
        class="search-input"
        :placeholder="t('story.searchPlaceholder')"
        :value="store.searchQuery"
        :aria-label="t('story.searchAria')"
        @input="store.setSearchQuery(($event.target as HTMLInputElement).value)"
      />
    </div>

    <!-- 需求1：按状态筛选分类 Tab -->
    <FilterTabs
      v-if="statusFilterTabs.length > 0"
      v-model="filterStatus"
      :tabs="statusFilterTabs"
      :label="t('story.filterLabel')"
      :all-label="t('story.filterAll')"
      :all-value="''"
      :all-count="store.stories.length"
    />

    <!-- 分析进度条（仅在分析中显示） -->
    <div
      v-if="isAnalyzing"
      class="progress-panel"
      role="region"
      :aria-label="t('story.progressAria')"
    >
      <div class="progress-header">
        <Icon name="refresh-cw" :size="16" class="progress-icon" />
        <span class="progress-stage">{{ progress.stage }}</span>
        <button
          type="button"
          class="cancel-btn"
          :aria-label="t('story.cancelAria')"
          @click="handleCancelAnalysis"
        >
          <Icon name="stop" :size="14" />
          <span>{{ t('story.cancel') }}</span>
        </button>
      </div>
      <div
        class="progress-bar"
        role="progressbar"
        :aria-valuenow="progress.completed"
        :aria-valuemin="0"
        :aria-valuemax="progress.total"
        :aria-label="t('story.progressLabel', { completed: progress.completed, total: progress.total })"
      >
        <div class="progress-fill" :style="{ width: `${progressPercent}%` }" />
      </div>
      <div class="progress-meta">
        {{ t('story.progressMeta', { completed: progress.completed, total: progress.total, percent: progressPercent }) }}
      </div>
    </div>

    <!-- 故事列表 -->
    <main class="story-main" :aria-label="t('story.listAria')">
      <!-- 空状态 -->
      <div v-if="store.stories.length === 0" class="empty-state">
        <Icon name="book-open" :size="48" class="empty-icon" />
        <p class="empty-text">{{ t('story.emptyText') }}</p>
        <p class="empty-hint">{{ t('story.emptyHint') }}</p>
        <button
          type="button"
          class="header-btn upload-btn"
          @click="openUploadModal"
        >
          <Icon name="upload" :size="16" />
          <span class="btn-label">{{ t('story.uploadFirst') }}</span>
        </button>
      </div>

      <!-- 故事卡片 -->
      <section v-else class="story-grid" :aria-label="t('story.cardsAria')">
        <article
          v-for="story in stories"
          :key="story.id"
          class="story-card"
          :class="getStatusClass(story.status)"
        >
          <div class="card-header" @click="toggleExpand(story.id)">
            <Icon name="book-open" :size="20" class="card-icon" />
            <div class="card-info">
              <h3 class="card-title">{{ story.sourceFileName }}</h3>
              <span class="card-meta">
                <span class="status-badge" :class="getStatusClass(story.status)">
                  {{ getStatusLabel(story.status) }}
                </span>
                · {{ getDepthMeta(story.depth)?.label ?? story.depth }}
                · {{ formatCharCount(story.textLength) }}
                · {{ t('story.chunkCount', { count: story.chunkCount }) }}
              </span>
            </div>
            <button
              type="button"
              class="card-expand"
              :aria-label="expandedStoryId === story.id ? t('story.collapse') : t('story.expand')"
              :aria-expanded="expandedStoryId === story.id"
                @click="toggleExpand(story.id)"
              >
              <Icon :name="expandedStoryId === story.id ? 'chevron-up' : 'chevron-down'" :size="16" />
            </button>
          </div>

          <!-- 展开详情 -->
          <div v-if="expandedStoryId === story.id" class="card-detail">
            <!-- 错误信息 -->
            <div v-if="story.errors && story.errors.length > 0" class="detail-errors">
              <h4 class="detail-title">
                <Icon name="alert-triangle" :size="14" />
                {{ t('story.errorsTitle', { count: story.errors.length }) }}
              </h4>
              <ul class="error-list">
                <li v-for="(err, idx) in story.errors" :key="idx" class="error-item">
                  {{ err }}
                </li>
              </ul>
            </div>

            <!-- 世界信息 -->
            <section v-if="story.worldInfo" class="detail-section">
              <h4 class="detail-title">
                <Icon name="globe" :size="14" />
                {{ t('story.worldTitle', { name: story.worldInfo.name }) }}
              </h4>
              <p class="detail-desc">{{ story.worldInfo.description }}</p>
              <div v-if="story.worldInfo.type" class="detail-tags">
                <span class="tag">{{ t('story.worldType', { type: story.worldInfo.type }) }}</span>
              </div>
              <div v-if="story.worldInfo.coreSettings && story.worldInfo.coreSettings.length > 0" class="detail-tags">
                <span v-for="s in story.worldInfo.coreSettings" :key="s" class="tag">{{ s }}</span>
              </div>
              <div v-if="story.worldInfo.factions && story.worldInfo.factions.length > 0" class="detail-tags">
                <span class="tag-label">{{ t('story.worldFactions') }}</span>
                <span v-for="f in story.worldInfo.factions" :key="f" class="tag">{{ f }}</span>
              </div>
            </section>

            <!-- 人物 -->
            <section v-if="story.characters.length > 0" class="detail-section">
              <h4 class="detail-title">
                <Icon name="user" :size="14" />
                {{ t('story.charsTitle', { count: story.characters.length }) }}
              </h4>
              <div class="char-list">
                <div v-for="(char, idx) in story.characters" :key="idx" class="char-item">
                  <div class="char-row">
                    <div class="char-main">
                      <div class="char-name">
                        {{ char.name }}
                        <span v-if="char.aliases && char.aliases.length > 0" class="char-aliases">
                          {{ t('story.charAliases', { aliases: char.aliases.join('、') }) }}
                        </span>
                      </div>
                      <p v-if="char.description" class="char-desc">{{ char.description }}</p>
                      <div v-if="char.relationships && char.relationships.length > 0" class="char-relations">
                        <span class="relation-label">{{ t('story.relationsLabel') }}</span>
                        <span v-for="(rel, rIdx) in char.relationships" :key="rIdx" class="relation">
                          {{ rel.target }}（{{ rel.relation }}）
                        </span>
                      </div>
                    </div>
                    <button
                      v-if="story.status === 'completed'"
                      type="button"
                      class="char-set-protagonist-btn"
                      :aria-label="t('story.setProtagonistAria', { name: char.name })"
                      :disabled="isAnalyzing"
                      @click="openProtagonistModal(story.id, char.name)"
                    >
                      <Icon name="user" :size="12" />
                      <span>{{ t('story.setProtagonist') }}</span>
                    </button>
                  </div>
                </div>
              </div>
            </section>

            <!-- 主角配置信息 -->
            <section v-if="story.protagonist" class="detail-section protagonist-section">
              <h4 class="detail-title">
                <Icon name="user" :size="14" />
                {{ t('story.protagonistTitle') }}
              </h4>
              <div class="protagonist-card">
                <div class="protagonist-header">
                  <span class="protagonist-name">{{ story.protagonist.name }}</span>
                  <span class="protagonist-badge" :class="`role-${story.protagonist.role}`">
                    {{ getProtagonistRoleLabel(story.protagonist.role) }}
                  </span>
                  <span class="protagonist-badge source-badge">
                    {{ getProtagonistSourceLabel(story.protagonist.source) }}
                  </span>
                </div>
                <p v-if="story.protagonist.description" class="protagonist-desc">
                  {{ story.protagonist.description }}
                </p>
                <div v-if="story.protagonist.startingScene" class="protagonist-meta">
                  <span class="meta-label">{{ t('story.startingScene') }}</span>
                  <span class="meta-value">{{ story.protagonist.startingScene }}</span>
                </div>
                <div v-if="story.protagonist.relations.length > 0" class="protagonist-relations">
                  <span class="meta-label">{{ t('story.relations') }}</span>
                  <ul class="relation-list">
                    <li
                      v-for="(rel, idx) in story.protagonist.relations"
                      :key="idx"
                      class="relation-item"
                    >
                      <span class="relation-target">{{ rel.target }}</span>
                      <span class="relation-text">{{ rel.relation }}</span>
                    </li>
                  </ul>
                </div>
                <div v-if="story.protagonist.personaId" class="protagonist-meta">
                  <span class="meta-label">{{ t('story.personaLinked') }}</span>
                  <span class="meta-value">{{ t('story.personaCreated') }}</span>
                </div>
                <div class="protagonist-actions">
                  <button
                    type="button"
                    class="btn btn-secondary btn-sm"
                    @click="openProtagonistModal(story.id)"
                  >
                    <Icon name="pencil" :size="12" />
                    {{ t('story.editProtagonist') }}
                  </button>
                  <button
                    v-if="story.protagonist.personaId"
                    type="button"
                    class="btn btn-primary btn-sm"
                    @click="handleActivateProtagonistPersona(story.id)"
                  >
                    <Icon name="check" :size="12" />
                    {{ t('story.activatePersona') }}
                  </button>
                  <button
                    type="button"
                    class="btn btn-danger btn-sm"
                    @click="handleClearProtagonist(story.id)"
                  >
                    <Icon name="trash-2" :size="12" />
                    {{ t('story.clear') }}
                  </button>
                </div>
              </div>
            </section>

            <!-- 需求8：关联世界书 -->
            <section v-if="story.status === 'completed'" class="detail-section worldbook-bind-section">
              <h4 class="detail-title">
                <Icon name="book-open" :size="14" />
                {{ t('story.bindWorldbook') }}
              </h4>
              <div class="form-row">
                <label :for="`bindWorldBook-${story.id}`" class="form-label">{{ t('story.bindLabel') }}</label>
                <select
                  :id="`bindWorldBook-${story.id}`"
                  class="form-select"
                  :value="story.boundWorldBookId ?? ''"
                  @change="handleBindWorldBook(story.id, ($event.target as HTMLSelectElement).value)"
                >
                  <option value="">{{ t('story.bindNone') }}</option>
                  <option
                    v-for="lb in availableLorebooks"
                    :key="lb.id"
                    :value="lb.id"
                  >
                    {{ t('story.bindEntryCount', { name: lb.name, count: lb.entries.length }) }}
                  </option>
                </select>
                <p class="form-hint">
                  {{ t('story.bindHint') }}
                </p>
                <p v-if="story.boundWorldBookId" class="form-hint success-hint">
                  {{ t('story.bindCurrent', { name: getBoundWorldBookName(story.id) }) }}
                </p>
              </div>
            </section>

            <StoryTimeConfigPanel :story="story" />

            <!-- 场景 -->
            <section v-if="story.scenes.length > 0" class="detail-section">
              <h4 class="detail-title">
                <Icon name="map-pin" :size="14" />
                {{ t('story.scenesTitle', { count: story.scenes.length }) }}
              </h4>
              <div class="scene-list">
                <div v-for="(scene, idx) in story.scenes" :key="idx" class="scene-item">
                  <div class="scene-name">
                    {{ scene.name }}
                    <span class="scene-type">{{ scene.type }}</span>
                    <span v-if="scene.parent" class="scene-parent">← {{ scene.parent }}</span>
                  </div>
                  <p v-if="scene.description" class="scene-desc">{{ scene.description }}</p>
                </div>
              </div>
            </section>

            <!-- 事件 -->
            <section v-if="story.events.length > 0" class="detail-section">
              <h4 class="detail-title">
                <Icon name="calendar-check" :size="14" />
                {{ t('story.eventsTitle', { count: story.events.length }) }}
              </h4>
              <ol class="event-list">
                <li v-for="(event, idx) in story.events" :key="idx" class="event-item">
                  <div class="event-header">
                    <span class="event-order">#{{ event.order }}</span>
                    <span class="event-name">{{ event.name }}</span>
                    <span class="event-type">{{ event.type }}</span>
                  </div>
                  <p v-if="event.description" class="event-desc">{{ event.description }}</p>
                  <div v-if="event.characters.length > 0" class="event-meta">
                    {{ t('story.eventParticipants', { names: event.characters.join('、') }) }}
                  </div>
                  <div v-if="event.scene" class="event-meta">
                    {{ t('story.eventScene', { name: event.scene }) }}
                  </div>
                </li>
              </ol>
            </section>

            <!-- 脚本（深度模式） -->
            <section v-if="story.scripts.length > 0" class="detail-section">
              <h4 class="detail-title">
                <Icon name="git-branch" :size="14" />
                {{ t('story.scriptsTitle', { count: story.scripts.length }) }}
              </h4>
              <div class="script-list">
                <div v-for="(script, idx) in story.scripts" :key="idx" class="script-item">
                  <div class="script-header">
                    <span class="script-name">{{ script.name }}</span>
                    <span class="script-type" :class="`type-${script.type}`">{{ script.type }}</span>
                  </div>
                  <p v-if="script.content" class="script-content">{{ script.content }}</p>
                  <div v-if="script.characters.length > 0" class="script-meta">
                    {{ t('story.scriptChars', { names: script.characters.join('、') }) }}
                  </div>
                  <div v-if="script.scenes.length > 0" class="script-meta">
                    {{ t('story.scriptScenes', { names: script.scenes.join('、') }) }}
                  </div>
                </div>
              </div>
            </section>

            <!-- 元信息 -->
            <div class="detail-meta">
              <span>{{ t('story.createdAt', { time: formatDateTime(story.createdAt) }) }}</span>
              <span v-if="story.completedAt">{{ t('story.completedAt', { time: formatDateTime(story.completedAt) }) }}</span>
            </div>
          </div>

          <div class="card-actions">
            <button
              v-if="story.status === 'completed'"
              type="button"
              class="card-btn import-btn"
              :aria-label="t('story.importResultAria')"
              :disabled="isAnalyzing"
              @click="openImportModal(story.id)"
            >
              <Icon name="download" :size="14" />
              <span>{{ t('story.importResult') }}</span>
            </button>
            <button
              v-if="story.status === 'completed'"
              type="button"
              class="card-btn protagonist-btn"
              :aria-label="story.protagonist ? t('story.editProtagonistBtn') : t('story.setProtagonistBtn')"
              :disabled="isAnalyzing"
              @click="openProtagonistModal(story.id)"
            >
              <Icon name="user" :size="14" />
              <span>{{ story.protagonist ? t('story.editProtagonistBtn') : t('story.setProtagonistBtn') }}</span>
            </button>
            <button
              type="button"
              class="card-btn delete-btn"
              :aria-label="t('story.deleteAria')"
              :disabled="isAnalyzing"
              @click="confirmDelete(story.id)"
            >
              <Icon name="trash-2" :size="14" />
              <span>{{ t('story.delete') }}</span>
            </button>
          </div>
        </article>
      </section>
    </main>

    <!-- 上传 Modal -->
    <Modal
      v-model="uploadModalOpen"
      :title="t('story.uploadTitle')"
      :aria-label="t('story.uploadAria2')"
    >
      <div class="upload-content">
        <!-- 分析深度选择 -->
        <fieldset class="depth-fieldset">
          <legend class="depth-legend">{{ t('story.depthLegend') }}</legend>
          <div class="depth-options" role="radiogroup" :aria-label="t('story.depthAria')">
            <label
              v-for="depth in ANALYSIS_DEPTHS"
              :key="depth.id"
              class="depth-option"
              :class="{ active: selectedDepth === depth.id }"
            >
              <input
                type="radio"
                name="depth"
                :value="depth.id"
                v-model="selectedDepth"
              />
              <div class="depth-info">
                <div class="depth-label">{{ depth.label }}</div>
                <div class="depth-desc">{{ depth.description }}</div>
                <div class="depth-token">
                  {{ t('story.depthToken', { min: depth.tokenEstimate.min, max: depth.tokenEstimate.max }) }}
                </div>
              </div>
            </label>
          </div>
        </fieldset>

        <!-- 题材模板选择 -->
        <fieldset class="depth-fieldset">
          <legend class="depth-legend">{{ t('storyTemplate.legend') }}</legend>
          <div class="template-options" role="radiogroup" :aria-label="t('storyTemplate.legend')">
            <label
              v-for="tmpl in STORY_TEMPLATES"
              :key="tmpl.id"
              class="template-option"
              :class="{ active: selectedTemplate === tmpl.id }"
            >
              <input
                type="radio"
                name="template"
                :value="tmpl.id"
                v-model="selectedTemplate"
              />
              <div class="template-info">
                <div class="template-label">{{ tmpl.name }}</div>
                <div class="template-desc">{{ tmpl.description }}</div>
              </div>
            </label>
          </div>
        </fieldset>

        <!-- 文件拖拽区 -->
        <div
          class="drop-zone"
          :class="{ active: selectedFile !== null }"
          role="button"
          tabindex="0"
          :aria-label="t('story.dropAria')"
          @click="fileInput?.click()"
          @keydown.enter.prevent="fileInput?.click()"
          @keydown.space.prevent="fileInput?.click()"
          @drop="handleDrop"
          @dragover="handleDragOver"
        >
          <input
            ref="fileInput"
            type="file"
            accept=".txt,.md,.markdown,.text"
            class="file-input-hidden"
            aria-hidden="true"
            @change="handleFileSelect"
          />
          <Icon
            :name="selectedFile ? 'file' : 'upload'"
            :size="32"
            class="drop-icon"
          />
          <p v-if="selectedFile" class="drop-text">
            {{ selectedFile.name }}
            <span class="drop-meta">{{ formatCharCount(fileText.length) }}</span>
          </p>
          <p v-else class="drop-text">{{ t('story.dropText') }}</p>
          <p class="drop-hint">{{ t('story.dropHint') }}</p>
        </div>

        <div class="upload-actions">
          <button type="button" class="btn btn-secondary" @click="closeUploadModal">
            {{ t('story.cancelBtn') }}
          </button>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="!selectedFile || !fileText"
            @click="handleUpload"
          >
            <Icon name="upload" :size="14" />
            {{ t('story.uploadAnalyze') }}
          </button>
        </div>
      </div>
    </Modal>

    <!-- 删除确认 Modal -->
    <Modal
      v-model="deleteModalOpen"
      :title="t('story.deleteTitle')"
      :aria-label="t('story.deleteAria2')"
    >
      <p class="confirm-text">
        {{ t('story.deleteConfirm') }}
      </p>
      <div class="confirm-actions">
        <button type="button" class="btn btn-secondary" @click="deleteModalOpen = false">
          {{ t('story.cancelBtn') }}
        </button>
        <button type="button" class="btn btn-danger" @click="handleDelete">
          {{ t('story.delete') }}
        </button>
      </div>
    </Modal>

    <!-- F16.2 导入 Modal -->
    <Modal
      v-model="importModalOpen"
      :title="t('story.importTitle')"
      :aria-label="t('story.importAria2')"
    >
      <div v-if="importTargetStory" class="import-content">
        <!-- 导入分类选择 -->
        <fieldset class="import-fieldset">
          <legend>{{ t('story.importCategory') }}</legend>
          <div class="category-grid">
            <label
              v-for="cat in (['all', 'world', 'scenes', 'characters', 'events', 'scripts'] as const)"
              :key="cat"
              class="category-option"
              :class="{ disabled: !isCategoryAvailable(cat) }"
            >
              <input
                type="radio"
                name="importCategory"
                :value="cat"
                v-model="importCategory"
                :disabled="!isCategoryAvailable(cat)"
              />
              <span class="cat-label">{{ getImportCategoryLabel(cat) }}</span>
              <span class="cat-count">{{ getCategoryCount(cat) }}</span>
            </label>
          </div>
        </fieldset>

        <!-- Lorebook 选择（世界/场景/事件/全部需要） -->
        <div v-if="needsLorebook && importCategory !== 'scripts'" class="form-row">
          <label for="importLorebook" class="form-label">{{ t('story.targetLorebook') }}</label>
          <select
            id="importLorebook"
            v-model="importLorebookId"
            class="form-select"
          >
            <option value="" disabled>{{ t('story.selectLorebook') }}</option>
            <option v-for="lb in availableLorebooks" :key="lb.id" :value="lb.id">
              {{ t('story.lorebookEntryCount', { name: lb.name || t('story.unnamedLorebook'), count: lb.entries.length }) }}
            </option>
          </select>
          <p v-if="availableLorebooks.length === 0" class="form-hint">
            {{ t('story.noLorebookHint') }}
          </p>
        </div>

        <!-- 冲突处理策略（脚本导出不需要） -->
        <fieldset v-if="importCategory !== 'scripts'" class="import-fieldset">
          <legend>{{ t('story.strategyLegend') }}</legend>
          <div class="strategy-options">
            <label
              v-for="s in (['add', 'overwrite', 'merge'] as const)"
              :key="s"
              class="strategy-option"
            >
              <input type="radio" name="importStrategy" :value="s" v-model="importStrategy" />
              <span>{{ getStrategyLabel(s) }}</span>
            </label>
          </div>
        </fieldset>

        <!-- 脚本导出提示 -->
        <div v-if="importCategory === 'scripts'" class="script-export-hint">
          <Icon name="info" :size="16" />
          <span>{{ t('story.scriptExportHint') }}</span>
        </div>

        <!-- 导入结果 -->
        <div v-if="importResultsVisible && importResults.length > 0" class="import-results">
          <h4 class="results-title">{{ t('story.resultsTitle') }}</h4>
          <ul class="results-list">
            <li
              v-for="(r, idx) in importResults"
              :key="idx"
              class="result-item"
              :class="{ success: r.success, failed: !r.success }"
            >
              <Icon :name="r.success ? 'check' : 'close'" :size="14" />
              <span class="result-type">{{ getResultLabel(r.type) }}</span>
              <span class="result-name">{{ r.name }}</span>
              <span v-if="r.error" class="result-error">{{ r.error }}</span>
            </li>
          </ul>
        </div>

        <!-- 操作按钮 -->
        <div class="import-actions">
          <button type="button" class="btn btn-secondary" @click="closeImportModal">
            {{ t('story.close') }}
          </button>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="!canImport || (needsLorebook && !importLorebookId)"
            @click="handleImport"
          >
            {{ importResultsVisible ? t('story.reimport') : t('story.execImport') }}
          </button>
        </div>
      </div>
    </Modal>

    <!-- F16.3 主角配置 Modal -->
    <Modal
      v-model="protagonistModalOpen"
      :title="protagonistTargetStory?.protagonist ? t('story.protagonistEditTitle') : t('story.protagonistTitle2')"
      :aria-label="t('story.protagonistAria')"
    >
      <div v-if="protagonistTargetStory" class="protagonist-form">
        <!-- 主角来源选择 -->
        <fieldset class="import-fieldset">
          <legend>{{ t('story.sourceLegend') }}</legend>
          <div class="strategy-options">
            <label class="strategy-option">
              <input
                type="radio"
                name="protagonistSource"
                value="existing"
                :checked="protagonistFormMode === 'existing'"
                @change="handleProtagonistModeChange('existing')"
              />
              <span>{{ t('story.sourceFromChar') }}</span>
            </label>
            <label class="strategy-option">
              <input
                type="radio"
                name="protagonistSource"
                value="custom"
                :checked="protagonistFormMode === 'custom'"
                @change="handleProtagonistModeChange('custom')"
              />
              <span>{{ t('story.sourceCustomNew') }}</span>
            </label>
          </div>
        </fieldset>

        <!-- 主角名选择/输入 -->
        <div v-if="protagonistFormMode === 'existing'" class="form-row">
          <label for="protagonistCharSelect" class="form-label">{{ t('story.selectChar') }}</label>
          <select
            id="protagonistCharSelect"
            class="form-select"
            :value="protagonistSelectedCharName"
            @change="handleSelectedCharChange(($event.target as HTMLSelectElement).value)"
          >
            <option value="" disabled>{{ t('story.selectPlaceholder') }}</option>
            <option
              v-for="name in protagonistCharacterOptions"
              :key="name"
              :value="name"
            >
              {{ name }}
            </option>
          </select>
          <p v-if="protagonistCharacterOptions.length === 0" class="form-hint">
            {{ t('story.noCharHint') }}
          </p>
        </div>
        <div v-else class="form-row">
          <label for="protagonistNameInput" class="form-label">
            {{ t('story.protagNameLabel', { max: MAX_PROTAGONIST_NAME_LENGTH }) }}
          </label>
          <input
            id="protagonistNameInput"
            type="text"
            class="form-input"
            v-model="protagonistName"
            :maxlength="MAX_PROTAGONIST_NAME_LENGTH"
            :placeholder="t('story.protagNamePlaceholder')"
          />
        </div>

        <!-- 主角身份 -->
        <fieldset class="import-fieldset">
          <legend>{{ t('story.roleLegend') }}</legend>
          <div class="strategy-options">
            <label class="strategy-option">
              <input
                type="radio"
                name="protagonistRole"
                value="protagonist"
                v-model="protagonistRole"
              />
              <span>{{ t('story.roleProtagonistDesc') }}</span>
            </label>
            <label class="strategy-option">
              <input
                type="radio"
                name="protagonistRole"
                value="observer"
                v-model="protagonistRole"
              />
              <span>{{ t('story.roleObserverDesc') }}</span>
            </label>
          </div>
        </fieldset>

        <!-- 主角描述 -->
        <div class="form-row">
          <label for="protagonistDesc" class="form-label">
            {{ t('story.protagDescLabel', { max: MAX_PROTAGONIST_DESCRIPTION_LENGTH }) }}
          </label>
          <textarea
            id="protagonistDesc"
            class="form-textarea"
            v-model="protagonistDescription"
            :maxlength="MAX_PROTAGONIST_DESCRIPTION_LENGTH * 2"
            rows="4"
            :placeholder="t('story.protagDescPlaceholder')"
          ></textarea>
        </div>

        <!-- 起始场景 -->
        <div class="form-row">
          <label for="protagonistScene" class="form-label">{{ t('story.startScene') }}</label>
          <select
            id="protagonistScene"
            class="form-select"
            v-model="protagonistStartingScene"
          >
            <option value="">{{ t('story.notSpecified') }}</option>
            <option
              v-for="name in protagonistSceneOptions"
              :key="name"
              :value="name"
            >
              {{ name }}
            </option>
          </select>
          <p v-if="protagonistSceneOptions.length === 0" class="form-hint">
            {{ t('story.noSceneHint') }}
          </p>
        </div>

        <!-- 关系列表 -->
        <fieldset class="import-fieldset">
          <legend>
            {{ t('story.relationsLegend', { count: protagonistRelations.length, max: MAX_RELATIONS_COUNT }) }}
          </legend>

          <!-- 已有关系列表 -->
          <ul v-if="protagonistRelations.length > 0" class="relation-edit-list">
            <li
              v-for="rel in protagonistRelations"
              :key="rel.target"
              class="relation-edit-item"
            >
              <span class="rel-target">{{ rel.target }}</span>
              <span class="rel-sep">：</span>
              <span class="rel-text">{{ rel.relation }}</span>
              <button
                type="button"
                class="rel-remove-btn"
                :aria-label="t('story.removeRelationAria', { name: rel.target })"
                @click="handleRemoveRelation(rel.target)"
              >
                <Icon name="close" :size="12" />
              </button>
            </li>
          </ul>
          <p v-else class="form-hint">{{ t('story.noRelations') }}</p>

          <!-- 新增关系表单 -->
          <div class="relation-add-form">
            <input
              type="text"
              class="form-input relation-target-input"
              v-model="newRelationTarget"
              list="relationTargetOptions"
              :placeholder="t('story.relationTargetPlaceholder')"
            />
            <datalist id="relationTargetOptions">
              <option v-for="name in relationTargetOptions" :key="name" :value="name" />
            </datalist>
            <input
              type="text"
              class="form-input relation-desc-input"
              v-model="newRelationDesc"
              :maxlength="MAX_RELATION_DESC_LENGTH"
              :placeholder="t('story.relationDescPlaceholder')"
            />
            <button
              type="button"
              class="btn btn-secondary btn-sm"
              @click="handleAddRelation"
            >
              <Icon name="plus" :size="12" />
              {{ t('story.add') }}
            </button>
          </div>
        </fieldset>

        <!-- 校验错误提示 -->
        <div v-if="protagonistFormErrors.length > 0" class="form-errors" role="alert">
          <Icon name="alert-triangle" :size="14" />
          <ul>
            <li v-for="(err, idx) in protagonistFormErrors" :key="idx">{{ err }}</li>
          </ul>
        </div>

        <!-- 操作按钮 -->
        <div class="protagonist-form-actions">
          <button type="button" class="btn btn-secondary" @click="closeProtagonistModal">
            {{ t('story.cancelBtn') }}
          </button>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="!canSaveProtagonist"
            @click="handleSaveProtagonist"
          >
            <Icon name="check" :size="14" />
            {{ t('story.saveProtagonist') }}
          </button>
        </div>
      </div>
    </Modal>

    <!-- Toast 反馈 -->
    <Toast
      v-model="toastOpen"
      :type="toastType"
      :message="toastMessage"
    />
  </div>
</template>

<style scoped>
.story-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--bg);
  color: var(--on-bg);
}

/* 顶部 Header */
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--card);
  flex-shrink: 0;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.header-title h1 {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
  white-space: nowrap;
}

.header-count {
  font-size: 13px;
  color: var(--on-surface-variant);
  white-space: nowrap;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.header-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid var(--border);
  background: var(--card);
  color: var(--on-surface);
  border-radius: var(--radius-md);
  font-size: 13px;
  cursor: pointer;
  transition: background .15s ease, border-color .15s ease;
}

.header-btn:hover:not(:disabled) {
  background: var(--card-elevated);
  border-color: var(--primary);
}

.header-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.header-btn.back {
  padding: 6px 10px;
}

.btn-label {
  white-space: nowrap;
}

/* 搜索框 */
.search-bar {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  background: var(--card);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.search-icon {
  color: var(--on-surface-variant);
  margin-right: 8px;
}

.search-input {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--on-bg);
  border-radius: var(--radius-md);
  font-size: 13px;
  outline: none;
}

.search-input:focus {
  border-color: var(--primary);
}

/* 进度面板 */
.progress-panel {
  padding: 12px 16px;
  background: var(--card);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.progress-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.progress-icon {
  color: var(--primary-fg);
  animation: spin 1.5s linear infinite;
}

.progress-stage {
  flex: 1;
  font-size: 13px;
  color: var(--on-surface);
}

.cancel-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--on-bg);
  border-radius: var(--radius-sm);
  font-size: 12px;
  cursor: pointer;
}

.cancel-btn:hover {
  background: var(--error-bg, rgba(220, 38, 38, 0.1));
  border-color: var(--error);
  color: var(--error);
}

.progress-bar {
  height: 6px;
  background: var(--border);
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--primary);
  transition: width .3s ease;
}

.progress-meta {
  margin-top: 4px;
  font-size: 12px;
  color: var(--on-surface-variant);
  text-align: right;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .progress-icon { animation: none; }
  .progress-fill { transition: none; }
}

/* 主体 */
.story-main {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  text-align: center;
  color: var(--on-surface-variant);
}

.empty-icon {
  color: var(--on-surface-variant);
  opacity: 0.4;
  margin-bottom: 16px;
}

.empty-text {
  font-size: 15px;
  font-weight: 500;
  margin: 0 0 4px;
}

.empty-hint {
  font-size: 13px;
  margin: 0 0 20px;
  max-width: 480px;
}

/* 故事卡片 */
.story-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 12px;
}

.story-card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  overflow: hidden;
  transition: border-color .15s ease;
}

.story-card:hover {
  border-color: var(--primary);
}

.story-card.status-failed {
  border-color: var(--error);
}

.card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  cursor: pointer;
}

.card-icon {
  color: var(--primary-fg);
  flex-shrink: 0;
}

.card-info {
  flex: 1;
  min-width: 0;
}

.card-title {
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-meta {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--on-surface-variant);
  flex-wrap: wrap;
}

.status-badge {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;
}

.status-pending {
  background: rgba(245, 158, 11, 0.15);
  color: var(--accent-orange);
}

.status-analyzing {
  background: rgba(59, 130, 246, 0.15);
  color: var(--tag-blue);
}

.status-completed {
  background: rgba(34, 197, 94, 0.15);
  color: var(--tag-green);
}

.status-failed {
  background: rgba(220, 38, 38, 0.15);
  color: var(--error);
}

.card-expand {
  background: transparent;
  border: none;
  color: var(--on-surface-variant);
  cursor: pointer;
  padding: 4px;
  border-radius: var(--radius-sm);
}

.card-expand:hover {
  background: var(--card-elevated);
}

/* 详情展开 */
.card-detail {
  padding: 0 14px 12px;
  border-top: 1px solid var(--border);
  margin-top: 0;
}

.detail-errors {
  margin-top: 12px;
  padding: 10px;
  background: var(--error-bg, rgba(220, 38, 38, 0.08));
  border-radius: var(--radius-sm);
  border-left: 3px solid var(--error);
}

.error-list {
  margin: 6px 0 0;
  padding-left: 18px;
  font-size: 12px;
  color: var(--on-surface);
}

.error-item {
  margin: 2px 0;
  word-break: break-word;
}

.detail-section {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}

.detail-section:first-child {
  border-top: none;
  padding-top: 12px;
}

.detail-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  margin: 0 0 8px;
  color: var(--on-surface);
}

.detail-desc {
  font-size: 13px;
  color: var(--on-surface-variant);
  line-height: 1.5;
  margin: 4px 0;
  word-break: break-word;
}

.detail-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
  align-items: center;
}

.tag-label {
  font-size: 12px;
  color: var(--on-surface-variant);
}

.tag {
  padding: 2px 8px;
  background: var(--card-elevated);
  border-radius: 10px;
  font-size: 11px;
  color: var(--on-surface);
}

.char-list,
.scene-list,
.script-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.char-item,
.scene-item,
.script-item {
  padding: 8px 10px;
  background: var(--bg);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
}

.char-name,
.scene-name,
.script-header {
  font-size: 13px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.char-aliases {
  font-size: 11px;
  color: var(--on-surface-variant);
  font-weight: normal;
}

.char-desc,
.scene-desc,
.script-content {
  font-size: 12px;
  color: var(--on-surface-variant);
  margin: 4px 0 0;
  line-height: 1.5;
  word-break: break-word;
}

.char-relations {
  margin-top: 4px;
  font-size: 11px;
  color: var(--on-surface-variant);
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}

.relation-label {
  color: var(--on-surface-variant);
}

.relation {
  padding: 1px 6px;
  background: var(--card-elevated);
  border-radius: 8px;
}

.scene-type,
.scene-parent {
  font-size: 11px;
  padding: 1px 6px;
  background: var(--card-elevated);
  border-radius: 8px;
  color: var(--on-surface-variant);
  font-weight: normal;
}

.scene-parent {
  color: var(--primary-fg);
}

.event-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.event-item {
  padding: 8px 10px;
  background: var(--bg);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
}

.event-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 500;
  flex-wrap: wrap;
}

.event-order {
  color: var(--primary-fg);
  font-weight: 600;
}

.event-type {
  font-size: 11px;
  padding: 1px 6px;
  background: var(--card-elevated);
  border-radius: 8px;
  color: var(--on-surface-variant);
  font-weight: normal;
}

.event-desc {
  font-size: 12px;
  color: var(--on-surface-variant);
  margin: 4px 0 0;
  line-height: 1.5;
}

.event-meta {
  font-size: 11px;
  color: var(--on-surface-variant);
  margin-top: 2px;
}

.script-header {
  justify-content: space-between;
}

.script-type {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 8px;
  font-weight: normal;
}

.script-type.type-main {
  background: rgba(59, 130, 246, 0.15);
  color: var(--tag-blue);
}

.script-type.type-side {
  background: rgba(168, 85, 247, 0.15);
  color: var(--tag-purple);
}

.script-type.type-background {
  background: rgba(107, 114, 128, 0.15);
  color: var(--tag-gray);
}

.script-meta {
  font-size: 11px;
  color: var(--on-surface-variant);
  margin-top: 4px;
}

.detail-meta {
  display: flex;
  gap: 12px;
  margin-top: 12px;
  padding-top: 8px;
  border-top: 1px solid var(--border);
  font-size: 11px;
  color: var(--on-surface-variant);
}

/* 卡片操作按钮 */
.card-actions {
  display: flex;
  gap: 6px;
  padding: 0 14px 12px;
  justify-content: flex-end;
}

.card-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--on-bg);
  border-radius: var(--radius-sm);
  font-size: 12px;
  cursor: pointer;
}

.card-btn:hover:not(:disabled) {
  background: var(--card-elevated);
  border-color: var(--primary);
}

.card-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.delete-btn:hover:not(:disabled) {
  background: var(--error-bg, rgba(220, 38, 38, 0.1));
  border-color: var(--error);
  color: var(--error);
}

.analyze-btn:hover:not(:disabled) {
  background: rgba(34, 197, 94, 0.1);
  border-color: var(--tag-green);
  color: var(--tag-green);
}

/* Modal 内部样式 */
.upload-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 4px 0;
}

.depth-fieldset {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 12px;
  margin: 0;
}

.depth-legend {
  padding: 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--on-surface);
}

.depth-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}

.depth-option {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: border-color .15s ease, background .15s ease;
}

.depth-option:hover {
  background: var(--card-elevated);
}

.depth-option.active {
  border-color: var(--primary);
  background: var(--card-elevated);
}

.depth-option input[type="radio"] {
  margin-top: 2px;
  accent-color: var(--primary);
}

.depth-info {
  flex: 1;
}

.depth-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--on-surface);
}

.depth-desc {
  font-size: 12px;
  color: var(--on-surface-variant);
  margin-top: 2px;
  line-height: 1.4;
}

.depth-token {
  font-size: 11px;
  color: var(--on-surface-variant);
  margin-top: 2px;
}

/* 题材模板选择 */
.template-options {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  margin-top: 8px;
}

.template-option {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: border-color .15s ease, background .15s ease;
}

.template-option:hover {
  background: var(--card-elevated);
}

.template-option.active {
  border-color: var(--primary);
  background: var(--card-elevated);
}

.template-option input[type="radio"] {
  margin-top: 2px;
  accent-color: var(--primary);
}

.template-info {
  flex: 1;
  min-width: 0;
}

.template-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--on-surface);
}

.template-desc {
  font-size: 12px;
  color: var(--on-surface-variant);
  margin-top: 2px;
  line-height: 1.4;
}

/* 拖拽区 */
.drop-zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  border: 2px dashed var(--border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: border-color .15s ease, background .15s ease;
  text-align: center;
  outline: none;
}

.drop-zone:hover,
.drop-zone:focus-visible {
  border-color: var(--primary);
  background: var(--card-elevated);
}

.drop-zone.active {
  border-color: var(--tag-green);
  border-style: solid;
  background: rgba(34, 197, 94, 0.05);
}

.drop-icon {
  color: var(--on-surface-variant);
  margin-bottom: 8px;
}

.drop-zone.active .drop-icon {
  color: var(--tag-green);
}

.drop-text {
  font-size: 14px;
  color: var(--on-surface);
  margin: 0;
  word-break: break-all;
}

.drop-meta {
  margin-left: 6px;
  color: var(--on-surface-variant);
  font-size: 12px;
}

.drop-hint {
  font-size: 12px;
  color: var(--on-surface-variant);
  margin: 4px 0 0;
}

.file-input-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.upload-actions,
.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: 1px solid var(--border);
  background: var(--card);
  color: var(--on-surface);
  border-radius: var(--radius-md);
  font-size: 13px;
  cursor: pointer;
  transition: background .15s ease, border-color .15s ease;
}

.btn:hover:not(:disabled) {
  background: var(--card-elevated);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: var(--primary);
  color: var(--on-primary);
  border-color: var(--primary);
}

.btn-primary:hover:not(:disabled) {
  background: var(--primary-hover, var(--primary));
}

.btn-secondary {
  background: var(--card);
}

.btn-danger {
  background: var(--error);
  color: var(--on-accent);
  border-color: var(--error);
}

.btn-danger:hover:not(:disabled) {
  background: color-mix(in srgb, var(--error) 75%, #000);
}

.confirm-text {
  font-size: 14px;
  color: var(--on-surface);
  margin: 0 0 16px;
}

/* 响应式 */
@media (max-width: 640px) {
  .story-grid {
    grid-template-columns: 1fr;
  }

  .header-title h1 {
    font-size: 16px;
  }

  .btn-label {
    display: none;
  }

  .header-btn {
    padding: 6px 8px;
  }

  .header-btn.back .btn-label {
    display: inline;
  }
}

/* ── F16.2 导入 Modal 样式 ── */

.import-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.import-fieldset {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 12px;
  margin: 0;
}

.import-fieldset legend {
  font-size: 13px;
  font-weight: 600;
  color: var(--muted-foreground);
  padding: 0 6px;
}

.category-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.category-option {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 13px;
  transition: border-color 0.15s, background-color 0.15s;
}

.category-option:hover:not(.disabled) {
  border-color: var(--secondary);
  background: color-mix(in srgb, var(--secondary) 8%, transparent);
}

.category-option.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.category-option input[type="radio"] {
  margin: 0;
}

.cat-label {
  flex: 1;
}

.cat-count {
  font-size: 11px;
  color: var(--muted-foreground);
  background: var(--card-elevated);
  padding: 1px 6px;
  border-radius: 10px;
}

.strategy-options {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.strategy-option {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  cursor: pointer;
  padding: 4px 0;
}

.strategy-option input[type="radio"] {
  margin: 0;
}

.form-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.form-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--foreground);
}

.form-select {
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--card);
  color: var(--foreground);
  font-size: 13px;
}

.form-select:focus {
  outline: 2px solid var(--secondary);
  outline-offset: 1px;
}

.form-hint {
  font-size: 12px;
  color: var(--muted-foreground);
  margin: 2px 0 0;
}

/* 需求8：关联世界书成功提示 */
.form-hint.success-hint {
  color: var(--success-fg, #6ee7b7);
  font-weight: 500;
}

.worldbook-bind-section .form-select {
  max-width: 100%;
}

.script-export-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: color-mix(in srgb, var(--accent-blue) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent-blue) 20%, transparent);
  border-radius: var(--radius-sm);
  font-size: 13px;
  color: var(--foreground);
}

.import-results {
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 10px;
  max-height: 200px;
  overflow-y: auto;
}

.results-title {
  font-size: 13px;
  font-weight: 600;
  margin: 0 0 8px;
}

.results-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.result-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  padding: 4px 6px;
  border-radius: var(--radius-sm);
}

.result-item.success {
  color: var(--success-fg, #4ade80);
}

.result-item.failed {
  color: var(--error-fg, #f87171);
}

.result-type {
  font-weight: 600;
  min-width: 32px;
}

.result-name {
  flex: 1;
}

.result-error {
  color: var(--muted-foreground);
  font-style: italic;
}

.import-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 4px;
}

.card-btn.import-btn {
  color: var(--secondary);
}

.card-btn.import-btn:hover {
  background: color-mix(in srgb, var(--secondary) 12%, transparent);
}

/* F16.3 主角按钮（卡片操作区） */
.card-btn.protagonist-btn {
  color: var(--primary-fg, #3b82f6);
}

.card-btn.protagonist-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--primary) 12%, transparent);
}

/* F16.4 故事时间配置 */
.time-section {
  border: 1px solid color-mix(in srgb, var(--accent-blue) 25%, var(--border));
  border-radius: var(--radius-md);
  padding: 10px 12px;
  background: color-mix(in srgb, var(--accent-blue) 4%, var(--card));
}

.form-row-inline {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.form-label-inline {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  cursor: pointer;
  color: var(--on-surface);
}

.form-label-inline input[type="checkbox"] {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.time-current-value {
  font-size: 12px;
  font-weight: 600;
  color: var(--accent-blue);
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--accent-blue) 12%, transparent);
}

.time-config-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 4px;
}

.time-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.time-config-form code {
  padding: 1px 4px;
  border-radius: 3px;
  background: var(--code-bg, color-mix(in srgb, var(--on-surface) 8%, transparent));
  font-family: var(--font-mono, monospace);
  font-size: 12px;
}

/* 人物卡片 - 设为主角按钮 */
.char-item {
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
}

.char-item:last-child {
  border-bottom: none;
}

.char-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.char-main {
  flex: 1;
  min-width: 0;
}

.char-set-protagonist-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: 1px solid var(--border);
  background: var(--card);
  color: var(--on-surface);
  border-radius: var(--radius-sm);
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: background-color .15s ease, color .15s ease, border-color .15s ease;
}

.char-set-protagonist-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--primary) 10%, transparent);
  border-color: var(--primary);
  color: var(--primary-fg, #3b82f6);
}

.char-set-protagonist-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 主角配置信息卡片 */
.protagonist-section {
  border: 1px solid color-mix(in srgb, var(--primary) 30%, var(--border));
  border-radius: var(--radius-md);
  padding: 10px 12px;
  background: color-mix(in srgb, var(--primary) 5%, var(--card));
}

.protagonist-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.protagonist-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.protagonist-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--on-surface);
}

.protagonist-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;
}

.protagonist-badge.role-protagonist {
  background: color-mix(in srgb, var(--primary) 15%, transparent);
  color: var(--primary-fg, #3b82f6);
}

.protagonist-badge.role-observer {
  background: color-mix(in srgb, var(--accent-orange) 15%, transparent);
  color: var(--accent-orange);
}

.protagonist-badge.source-badge {
  background: color-mix(in srgb, var(--accent-blue) 12%, transparent);
  color: var(--accent-blue);
}

.protagonist-desc {
  font-size: 13px;
  color: var(--on-surface-variant);
  margin: 0;
  white-space: pre-wrap;
}

.protagonist-meta {
  display: flex;
  gap: 4px;
  font-size: 12px;
  color: var(--on-surface-variant);
}

.protagonist-relations {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
}

.relation-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.relation-item {
  display: flex;
  gap: 4px;
}

.relation-target {
  font-weight: 600;
  color: var(--on-surface);
}

.relation-text {
  color: var(--on-surface-variant);
}

.protagonist-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  padding-top: 4px;
}

/* 辅助样式：按钮、输入框 */
.btn-sm {
  padding: 4px 10px;
  font-size: 12px;
  gap: 4px;
}

.form-input {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--border);
  background: var(--background);
  color: var(--on-surface);
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-family: inherit;
}

.form-input:focus {
  outline: none;
  border-color: var(--primary);
}

.form-textarea {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--border);
  background: var(--background);
  color: var(--on-surface);
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-family: inherit;
  resize: vertical;
}

.form-textarea:focus {
  outline: none;
  border-color: var(--primary);
}

/* 主角配置 Modal 表单 */
.protagonist-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.protagonist-form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 4px;
}

/* 关系编辑列表 */
.relation-edit-list {
  list-style: none;
  padding: 0;
  margin: 0 0 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.relation-edit-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--card);
  font-size: 12px;
}

.rel-target {
  font-weight: 600;
  color: var(--on-surface);
}

.rel-sep {
  color: var(--muted-foreground);
}

.rel-text {
  flex: 1;
  color: var(--on-surface-variant);
}

.rel-remove-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px;
  border: none;
  background: transparent;
  color: var(--muted-foreground);
  cursor: pointer;
  border-radius: var(--radius-sm);
}

.rel-remove-btn:hover {
  background: color-mix(in srgb, var(--error-fg, #f87171) 12%, transparent);
  color: var(--error-fg, #f87171);
}

.relation-add-form {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.relation-target-input {
  flex: 1;
  min-width: 120px;
}

.relation-desc-input {
  flex: 1;
  min-width: 120px;
}

.form-errors {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 8px 10px;
  border: 1px solid var(--error-fg, #f87171);
  background: color-mix(in srgb, var(--error-fg, #f87171) 8%, transparent);
  border-radius: var(--radius-sm);
  color: var(--error-fg, #f87171);
  font-size: 12px;
}

.form-errors ul {
  margin: 0;
  padding-left: 16px;
}

@media (max-width: 600px) {
  .category-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .char-row {
    flex-direction: column;
    align-items: stretch;
  }

  .char-set-protagonist-btn {
    align-self: flex-start;
  }

  .relation-add-form {
    flex-direction: column;
  }
}
/* T-08: 一键生成设定面板 */
.quick-setup-panel {
  margin: 12px 20px;
  padding: 14px 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--card) 85%, transparent);
}

.quick-setup-head {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--accent-blue);
}

.quick-setup-title {
  font-weight: 600;
  font-size: 14px;
  color: var(--foreground);
}

.quick-setup-hint {
  font-size: 12px;
  color: var(--muted-foreground);
}

.quick-setup-body {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 10px;
  flex-wrap: wrap;
}

.template-pills {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.template-pill {
  padding: 4px 12px;
  font-size: 13px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--border);
  background: var(--surface-secondary);
  color: var(--text-secondary);
  cursor: pointer;
}

.template-pill.active {
  border-color: var(--accent-blue);
  color: var(--accent-blue);
  background: color-mix(in srgb, var(--accent-blue) 10%, transparent);
}

.quick-setup-btn {
  margin-left: auto;
}

.quick-setup-result {
  margin-top: 10px;
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  font-size: 13px;
}

.result-item {
  color: var(--green, #9ece6a);
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.result-item.fail {
  color: var(--danger, #f7768e);
}

.result-link {
  background: none;
  border: none;
  color: var(--accent-blue);
  cursor: pointer;
  font-size: 12px;
  padding: 0;
  text-decoration: underline;
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
