<script setup lang="ts">
/**
 * SettingsView — 系统设置页 (Phase F)
 *
 * 功能：
 * - 主题切换（dark / light / midnight）+ 实时预览
 * - 字号档位（12 / 14 / 16 / 18 px）+ 实时预览
 * - API Profile 管理（增删改查 + 切换激活）+ 表单校验
 * - 设置项持久化（settings store 自动同步到 IndexedDB）
 *
 * 无障碍：
 * - 主题选择用 role="radiogroup" + 键盘可达
 * - 字号选择用 role="radiogroup"
 * - Modal 编辑器焦点陷阱
 * - 删除前确认（Modal）
 * - 错误通过 Toast role=alert 反馈
 */
import { ref, computed, watch, nextTick } from 'vue';
import { useSettingsStore } from '@/stores/settings';
import Icon from '@/components/common/Icon.vue';
import Modal from '@/components/common/Modal.vue';
import Toast from '@/components/common/Toast.vue';
import MasterPasswordModal from '@/components/common/MasterPasswordModal.vue';
import type { MasterPasswordMode } from '@/components/common/MasterPasswordModal.vue';
import SettingsModelPanel from '@/components/settings/SettingsModelPanel.vue';
import VectorModelPanel from '@/components/settings/VectorModelPanel.vue';
import type { ThemeName } from '@/types';
import { FONT_SIZE_PRESETS } from '@/types';
import { t, type Locale } from '@/i18n';

const settings = useSettingsStore();

// ── T-13: 语言配置 ──
const localeOptions: { value: Locale; label: string }[] = [
  { value: 'zh', label: t('settings.languageZh') },
  { value: 'en', label: t('settings.languageEn') },
];

function selectLocale(l: Locale) {
  if (settings.locale === l) return;
  settings.setLocale(l);
  showToast('success', t('common.saveSuccess'));
}

// ── 主题配置 ──
interface ThemeOption {
  value: ThemeName;
  label: string;
  description: string;
  swatchClass: string;
}

const themeOptions: ThemeOption[] = [
  {
    value: 'dark',
    label: t('settingsView.themeDark'),
    description: t('settingsView.themeDarkDesc'),
    swatchClass: 'swatch-dark',
  },
  {
    value: 'light',
    label: t('settingsView.themeLight'),
    description: t('settingsView.themeLightDesc'),
    swatchClass: 'swatch-light',
  },
  {
    value: 'midnight',
    label: t('settingsView.themeMidnight'),
    description: t('settingsView.themeMidnightDesc'),
    swatchClass: 'swatch-midnight',
  },
  {
    value: 'oled',
    label: t('settingsView.themeOled'),
    description: t('settingsView.themeOledDesc'),
    swatchClass: 'swatch-oled',
  },
  {
    value: 'theatre',
    label: t('settingsView.themeTheatre'),
    description: t('settingsView.themeTheatreDesc'),
    swatchClass: 'swatch-theatre',
  },
];

function selectTheme(themeName: ThemeName) {
  settings.setTheme(themeName);
  showToast('success', t('settingsView.themeChanged', { name: themeOptions.find((x) => x.value === themeName)?.label ?? themeName }));
}

/**
 * radiogroup 键盘导航（WAI-ARIA 标准）
 * - ArrowLeft/ArrowUp：选择前一项（循环）
 * - ArrowRight/ArrowDown：选择后一项（循环）
 * - Home：首项
 * - End：末项
 */
function handleThemeKeydown(e: KeyboardEvent, currentIndex: number): void {
  const len = themeOptions.length;
  let nextIndex: number | null = null;
  switch (e.key) {
    case 'ArrowLeft':
    case 'ArrowUp':
      nextIndex = (currentIndex - 1 + len) % len;
      break;
    case 'ArrowRight':
    case 'ArrowDown':
      nextIndex = (currentIndex + 1) % len;
      break;
    case 'Home':
      nextIndex = 0;
      break;
    case 'End':
      nextIndex = len - 1;
      break;
    default:
      return;
  }
  e.preventDefault();
  if (nextIndex !== null) {
    selectTheme(themeOptions[nextIndex].value);
    // 将焦点移到新选中的按钮
    void nextTick(() => {
      const target = document.querySelector<HTMLElement>(
        `.theme-card[data-value="${themeOptions[nextIndex!].value}"]`
      );
      target?.focus();
    });
  }
}

// ── 设置分类（浮动侧边栏：相同类型配置归同一大类别） ──
import type { IconName } from '@/components/common/icons';

type SettingsCategoryId = 'appearance' | 'model' | 'extension' | 'persona' | 'data' | 'security';

interface SettingsCategory {
  id: SettingsCategoryId;
  label: string;
  description: string;
  icon: IconName;
}

const settingsCategories: SettingsCategory[] = [
  { id: 'appearance', label: t('settingsView.categoryAppearance'), description: t('settingsView.categoryAppearanceDesc'), icon: 'palette' },
  { id: 'model', label: t('settingsView.categoryModel'), description: t('settingsView.categoryModelDesc'), icon: 'cpu' },
  { id: 'extension', label: t('settingsView.categoryExtension'), description: t('settingsView.categoryExtensionDesc'), icon: 'puzzle' },
  { id: 'persona', label: t('settingsView.categoryPersona'), description: t('settingsView.categoryPersonaDesc'), icon: 'user' },
  { id: 'data', label: t('settingsView.categoryData'), description: t('settingsView.categoryDataDesc'), icon: 'database' },
  { id: 'security', label: t('settingsView.categorySecurity'), description: t('settingsView.categorySecurityDesc'), icon: 'lock-keyhole' },
];

const activeCategory = ref<SettingsCategoryId>('appearance');

const activeCategoryDesc = computed(
  () => settingsCategories.find((c) => c.id === activeCategory.value)?.description ?? ''
);

function selectCategory(id: SettingsCategoryId) {
  activeCategory.value = id;
}

/** 侧边栏 tab 键盘导航（WAI-ARIA：Arrow/Home/End） */
function handleCategoryKeydown(e: KeyboardEvent, currentIndex: number): void {
  const len = settingsCategories.length;
  let nextIndex: number | null = null;
  switch (e.key) {
    case 'ArrowLeft':
    case 'ArrowUp':
      nextIndex = (currentIndex - 1 + len) % len;
      break;
    case 'ArrowRight':
    case 'ArrowDown':
      nextIndex = (currentIndex + 1) % len;
      break;
    case 'Home':
      nextIndex = 0;
      break;
    case 'End':
      nextIndex = len - 1;
      break;
    default:
      return;
  }
  e.preventDefault();
  if (nextIndex !== null) {
    selectCategory(settingsCategories[nextIndex].id);
    void nextTick(() => {
      document.querySelectorAll<HTMLElement>('.settings-nav-item')[nextIndex!]?.focus();
    });
  }
}

// ── 字号配置 ──
interface FontSizeOption {
  value: number;
  label: string;
  sample: string;
}

const fontSizeOptions: FontSizeOption[] = FONT_SIZE_PRESETS.map((size) => ({
  value: size,
  label: size === 12 ? t('settingsView.fontSmall') : size === 14 ? t('settingsView.fontDefault') : size === 16 ? t('settingsView.fontLarge') : t('settingsView.fontXLarge'),
  sample: t('settingsView.fontSample'),
}));

function selectFontSize(size: number) {
  settings.setFontSize(size);
  showToast('success', t('settingsView.fontChanged', { size }));
}

/** 字号 radiogroup 键盘导航（同主题） */
function handleFontSizeKeydown(e: KeyboardEvent, currentIndex: number): void {
  const len = fontSizeOptions.length;
  let nextIndex: number | null = null;
  switch (e.key) {
    case 'ArrowLeft':
    case 'ArrowUp':
      nextIndex = (currentIndex - 1 + len) % len;
      break;
    case 'ArrowRight':
    case 'ArrowDown':
      nextIndex = (currentIndex + 1) % len;
      break;
    case 'Home':
      nextIndex = 0;
      break;
    case 'End':
      nextIndex = len - 1;
      break;
    default:
      return;
  }
  e.preventDefault();
  if (nextIndex !== null) {
    selectFontSize(fontSizeOptions[nextIndex].value);
    void nextTick(() => {
      const target = document.querySelector<HTMLElement>(
        `.fontsize-card[data-value="${fontSizeOptions[nextIndex!].value}"]`
      );
      target?.focus();
    });
  }
}

// ── Toast ──
const toastOpen = ref(false);
const toastType = ref<'info' | 'success' | 'error'>('info');
const toastMessage = ref('');

function showToast(type: 'info' | 'success' | 'error', message: string) {
  toastType.value = type;
  toastMessage.value = message;
  toastOpen.value = true;
}

watch(
  () => settings.lastError,
  (err) => {
    if (err) showToast('error', err);
  }
);

// 是否显示 API key 明文

// ── AC20 主密码管理 ──
const mpModalOpen = ref(false);
const mpModalMode = ref<MasterPasswordMode>('setup');

function openMasterPasswordModal(mode: MasterPasswordMode): void {
  mpModalMode.value = mode;
  mpModalOpen.value = true;
}

function handleMasterPasswordSuccess(): void {
  const labels: Record<MasterPasswordMode, string> = {
    setup: t('settingsView.mpSetup'),
    unlock: t('settingsView.mpUnlock'),
    change: t('settingsView.mpChange'),
  };
  showToast('success', labels[mpModalMode.value]);
}

function lockApp(): void {
  settings.lock();
  showToast('info', t('settingsView.locked'));
}

// 是否显示 API key 明文

// 预览样本：根据当前 fontSize 显示一段文字
const previewFontPx = computed(() => `${settings.fontSize}px`);

// ── F08 UI 自定义（背景/气泡/CSS）──
import type { ChatBackground, BubbleStyle } from '@/types';
import { useTemplateRef } from 'vue';

// 背景图本地草稿（与 store 同步）
const bgType = ref<'none' | 'url' | 'base64'>(settings.chatBackground.type);
const bgValue = ref<string>(settings.chatBackground.value);
const bgOpacity = ref<number>(settings.chatBackground.opacity);
const bgBlur = ref<number>(settings.chatBackground.blur);

// 气泡样式草稿
const bubbleRadius = ref<number>(settings.bubbleStyle.radius);
const bubbleOpacity = ref<number>(settings.bubbleStyle.opacity);

// 自定义 CSS 草稿
const customCssDraft = ref<string>(settings.customCss);

// 背景文件输入 ref
const bgFileInput = useTemplateRef<HTMLInputElement>('bgFileInput');

// 背景预览样式（应用到预览区域）
const bgPreviewStyle = computed(() => {
  if (bgType.value === 'none' || !bgValue.value) {
    return { background: 'var(--video-bg)' };
  }
  return {
    backgroundImage: `url(${bgValue.value})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  };
});

/** 处理背景图文件上传（转 base64） */
async function handleBgFileSelected(e: Event) {
  const input = e.target as HTMLInputElement;
  if (!input.files || input.files.length === 0) return;
  const file = input.files[0];
  // 限制 5MB
  if (file.size > 5 * 1024 * 1024) {
    showToast('error', t('settingsView.bgTooLarge'));
    input.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    bgType.value = 'base64';
    bgValue.value = String(reader.result);
    input.value = '';
  };
  reader.onerror = () => showToast('error', t('settingsView.fileReadFailed'));
  reader.readAsDataURL(file);
}

/** 触发背景图文件选择 */
function triggerBgUpload() {
  bgFileInput.value?.click();
}

/** 应用背景设置到 store */
function applyBackground() {
  const bg: ChatBackground = {
    type: bgType.value,
    value: bgValue.value,
    opacity: bgOpacity.value,
    blur: bgBlur.value,
  };
  settings.setChatBackground(bg);
  showToast('success', t('settingsView.bgApplied'));
}

/** 清除背景设置 */
function clearBackground() {
  bgType.value = 'none';
  bgValue.value = '';
  bgOpacity.value = 1;
  bgBlur.value = 0;
  settings.setChatBackground({ type: 'none', value: '', opacity: 1, blur: 0 });
  showToast('info', t('settingsView.bgCleared'));
}

/** 应用气泡样式到 store */
function applyBubbleStyle() {
  const style: BubbleStyle = {
    radius: bubbleRadius.value,
    opacity: bubbleOpacity.value,
  };
  settings.setBubbleStyle(style);
  showToast('success', t('settingsView.bubbleApplied'));
}

/** 保存自定义 CSS */
function saveCustomCss() {
  settings.setCustomCss(customCssDraft.value);
  showToast('success', t('settingsView.cssSaved'));
}

/** 重置自定义 CSS */
function resetCustomCss() {
  customCssDraft.value = '';
  settings.resetCustomCss();
  showToast('info', t('settingsView.cssReset'));
}

// ── Persona 管理 (F07) ──
import { usePersonaStore } from '@/stores/persona';
import type { Persona } from '@/types';
import { MAX_PERSONA_NAME_LENGTH } from '@/stores/persona';

const personaStore = usePersonaStore();

const personaModalOpen = ref(false);
const personaEditMode = ref<'create' | 'edit'>('create');
const personaForm = ref({
  id: '',
  name: '',
  description: '',
});
const personaDeleteModalOpen = ref(false);
const personaDeleteTarget = ref<Persona | null>(null);

const personaErrors = computed<Record<string, string>>(() => {
  const e: Record<string, string> = {};
  const name = personaForm.value.name.trim();
  if (!name) {
    e.name = t('settingsView.personaNameRequired');
  } else if (name.length > MAX_PERSONA_NAME_LENGTH) {
    e.name = t('settingsView.personaNameTooLong', { max: MAX_PERSONA_NAME_LENGTH });
  }
  return e;
});

const canSavePersona = computed(
  () => personaForm.value.name.trim().length > 0 && Object.keys(personaErrors.value).length === 0
);

function resetPersonaForm() {
  personaForm.value = { id: '', name: '', description: '' };
}

function openPersonaCreate() {
  resetPersonaForm();
  personaEditMode.value = 'create';
  personaModalOpen.value = true;
}

function openPersonaEdit(p: Persona) {
  personaForm.value = { id: p.id, name: p.name, description: p.description };
  personaEditMode.value = 'edit';
  personaModalOpen.value = true;
}

function savePersona() {
  if (!canSavePersona.value) return;
  const { name, description } = personaForm.value;
  if (personaEditMode.value === 'create') {
    const id = personaStore.createPersona({ name: name.trim(), description });
    if (id) {
      personaModalOpen.value = false;
      showToast('success', t('settingsView.personaCreated', { name }));
    }
  } else {
    const ok = personaStore.updatePersona(personaForm.value.id, {
      name: name.trim(),
      description,
    });
    if (ok) {
      personaModalOpen.value = false;
      showToast('success', t('settingsView.personaSaved', { name }));
    }
  }
}

function confirmDeletePersona(p: Persona) {
  if (personaStore.personas.length <= 1) {
    showToast('error', t('settingsView.personaKeepOne'));
    return;
  }
  personaDeleteTarget.value = p;
  personaDeleteModalOpen.value = true;
}

function executeDeletePersona() {
  if (!personaDeleteTarget.value) return;
  personaStore.deletePersona(personaDeleteTarget.value.id);
  showToast('success', t('settingsView.personaDeleted', { name: personaDeleteTarget.value.name }));
  personaDeleteModalOpen.value = false;
  personaDeleteTarget.value = null;
}

// 监听 persona store 错误/提示
watch(
  () => personaStore.lastError,
  (err) => {
    if (err) showToast('error', err);
  }
);
watch(
  () => personaStore.lastInfo,
  (info) => {
    if (info) showToast('success', info);
  }
);

// ── F13 数据管理 ──
import { useCharacterStore } from '@/stores/character';
import {
  exportAll,
  importBackup,
  downloadBackupFile,
  parseBackupFile,
  downloadCharacterPng,
  downloadChatMarkdown,
  type ImportResult,
} from '@/services/backup-service';
import type { ConflictStrategy } from '@/core/backup';
import { auditLogger } from '@/core/audit-log';
import {
  getActiveProfileId,
  setActiveProfileId,
  DEFAULT_PROFILE,
} from '@/storage/storage-factory';
import { loadOptimizationConfig, saveOptimizationConfig } from '@/core/optimization-pipeline';

const characterStore = useCharacterStore();

const dataManageLoading = ref(false);
const importResultModalOpen = ref(false);
const lastImportResult = ref<ImportResult | null>(null);
const conflictStrategy = ref<ConflictStrategy>('overwrite');

// 角色选择（用于 PNG 导出和 MD 导出）
const exportCharId = ref<string>('');
const exportChatCharId = ref<string>('');

// 文件输入 ref
const backupFileInput = useTemplateRef<HTMLInputElement>('backupFileInput');

// 当前激活的 storageAdapter（复用全局单例，App.vue 启动时已初始化）
import { getStorageAdapter } from '@/storage';

const exportCharList = computed(() => characterStore.characters);
const exportChatCharList = computed(() => characterStore.characters);

/**
 * 触发全量备份导出
 * T-06：若已设置并解锁主密码，则导出加密备份（.enc.json）
 */
async function handleExportBackup() {
  dataManageLoading.value = true;
  try {
    const adapter = getStorageAdapter();
    const data = await exportAll(adapter);
    // 已解锁主密码 → 加密备份文件；未设置 → 明文备份
    const password = settings.isUnlocked ? settings.getSessionMasterPassword() : undefined;
    await downloadBackupFile(data, password);
    showToast(
      'success',
      t('settingsView.exportBackup', {
        enc: password ? t('settingsView.encrypted') : '',
        chars: data.characters.length,
        chats: data.chats.length,
        lbs: data.lorebooks.length,
      })
    );
  } catch (err) {
    showToast('error', t('settingsView.exportFailed', { error: err instanceof Error ? err.message : String(err) }));
  } finally {
    dataManageLoading.value = false;
  }
}

/**
 * 触发备份文件选择
 */
function triggerBackupImport() {
  backupFileInput.value?.click();
}

/**
 * 处理备份文件导入
 */
async function handleBackupFileSelected(e: Event) {
  const input = e.target as HTMLInputElement;
  if (!input.files || input.files.length === 0) return;
  const file = input.files[0];
  input.value = '';

  dataManageLoading.value = true;
  try {
    // T-06：加密备份需已解锁的主密码；明文备份无需
    const password = settings.isUnlocked ? settings.getSessionMasterPassword() : undefined;
    const data = await parseBackupFile(file, password);
    const adapter = getStorageAdapter();
    const result = await importBackup(adapter, data, {
      conflictStrategy: conflictStrategy.value,
    });

    lastImportResult.value = result;
    importResultModalOpen.value = true;

    // 重新加载所有 store 数据
    await characterStore.loadFromStorage();
    await personaStore.loadFromStorage();
  } catch (err) {
    showToast('error', t('settingsView.importFailed', { error: err instanceof Error ? err.message : String(err) }));
  } finally {
    dataManageLoading.value = false;
  }
}

// ── T-07: SillyTavern Quick Reply 互导 ──

const quickReplyFileInput = ref<HTMLInputElement | null>(null);

/** 导出全部 Quick Reply 为 ST JSON */
function handleExportQuickReplies() {
  try {
    settings.exportQuickRepliesSt();
    showToast('success', t('settingsView.qrExported'));
  } catch (err) {
    showToast('error', t('settingsView.exportFailed', { error: err instanceof Error ? err.message : String(err) }));
  }
}

/** 触发 Quick Reply 文件选择 */
function handleImportQuickReplies() {
  quickReplyFileInput.value?.click();
}

/** 导入 ST Quick Reply JSON */
async function handleQuickReplyFileSelected(e: Event) {
  const input = e.target as HTMLInputElement;
  if (!input.files || input.files.length === 0) return;
  const file = input.files[0];
  input.value = '';
  try {
    const added = await settings.importQuickRepliesSt(file);
    showToast(
      added > 0 ? 'success' : 'info',
      added > 0 ? t('settingsView.qrImported', { count: added }) : t('settingsView.qrNoNew')
    );
  } catch (err) {
    showToast('error', t('settingsView.importFailed', { error: err instanceof Error ? err.message : String(err) }));
  }
}

// ── T-06: 审计日志 ──

const auditModalOpen = ref(false);
const auditEntries = computed(() => auditLogger.list());

/** 导出审计日志 JSON */
function handleExportAuditLog() {
  try {
    const json = auditLogger.exportJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('success', t('settingsView.auditExported'));
  } catch (err) {
    showToast('error', t('settingsView.exportFailed', { error: err instanceof Error ? err.message : String(err) }));
  }
}

/** 清空审计日志 */
function handleClearAuditLog() {
  if (!window.confirm(t('settingsView.auditClearConfirm'))) return;
  auditLogger.clear();
  showToast('success', t('settingsView.auditCleared'));
}

/** 审计动作中文标签 */
const AUDIT_ACTION_LABELS: Record<string, string> = {
  backup_export: t('settingsView.auditBackupExport'),
  backup_import: t('settingsView.auditBackupImport'),
  character_export_png: t('settingsView.auditCharPng'),
  character_export_v2: t('settingsView.auditCharV2'),
  character_import: t('settingsView.auditCharImport'),
  lorebook_export: t('settingsView.auditLorebookExport'),
  lorebook_import: t('settingsView.auditLorebookImport'),
  chat_export_md: t('settingsView.auditChatExport'),
  settings_reset: t('settingsView.auditSettingsReset'),
};

/** 审计结果徽标类 */
function auditResultClass(r: string): string {
  return r === 'ok' ? 'audit-ok' : r === 'blocked' ? 'audit-blocked' : 'audit-error';
}

// ── T-12: 资料档案(Profile)管理 ──

const currentProfileId = ref(getActiveProfileId());
const newProfileName = ref('');

/** 创建并切换新 profile */
function handleCreateProfile() {
  const name = newProfileName.value.trim();
  if (!name) {
    showToast('error', t('settingsView.profileNameRequired'));
    return;
  }
  if (!/^[a-zA-Z0-9_-]{1,32}$/.test(name)) {
    showToast('error', t('settingsView.profileNameInvalid'));
    return;
  }
  setActiveProfileId(name);
  currentProfileId.value = name;
  newProfileName.value = '';
  showToast('success', t('settingsView.profileSwitched', { name }));
}

/** 切换回默认档案 */
function handleResetProfile() {
  setActiveProfileId(DEFAULT_PROFILE);
  currentProfileId.value = DEFAULT_PROFILE;
  showToast('success', t('settingsView.profileReset'));
}

// ── E-04 二期: 嵌入优化开关 ──

const optimizationConfig = ref(loadOptimizationConfig());

/** 切换总开关或单层开关并持久化(重启后经 chat store 注入生效) */
function toggleOptimization(key: 'enabled' | 'l0Enabled' | 'l1Enabled' | 'l2Enabled', value: boolean) {
  optimizationConfig.value = { ...optimizationConfig.value, [key]: value };
  saveOptimizationConfig(optimizationConfig.value);
  showToast(
    'success',
    key === 'enabled'
      ? value
        ? t('settingsView.optEnabled')
        : t('settingsView.optDisabled')
      : t('settingsView.optToggled', { key, state: value ? t('settingsView.optOn') : t('settingsView.optOff') })
  );
}

/**
 * 导出角色卡为 PNG（嵌入式）
 */
function handleExportCharacterPng() {
  const id = exportCharId.value;
  if (!id) {
    showToast('error', t('settingsView.selectCharFirst'));
    return;
  }
  const char = characterStore.characters.find((c) => c.id === id);
  if (!char) {
    showToast('error', t('settingsView.charNotFound'));
    return;
  }
  try {
    // 将 UICharacter 转换为 CharacterCard（复用 type-adapters）
    void import('@/services/type-adapters')
      .then(({ uiCharToCard }) => {
        const card = uiCharToCard(char);
        downloadCharacterPng(card);
        showToast('success', t('settingsView.pngExported', { name: char.name }));
      })
      .catch((err) => {
        showToast('error', t('settingsView.exportFailed', { error: err instanceof Error ? err.message : String(err) }));
      });
  } catch (err) {
    showToast('error', t('settingsView.exportFailed', { error: err instanceof Error ? err.message : String(err) }));
  }
}

/**
 * 导出对话为 Markdown
 */
async function handleExportChatMarkdown() {
  const id = exportChatCharId.value;
  if (!id) {
    showToast('error', t('settingsView.selectCharFirst'));
    return;
  }
  const char = characterStore.characters.find((c) => c.id === id);
  if (!char) {
    showToast('error', t('settingsView.charNotFound'));
    return;
  }

  dataManageLoading.value = true;
  try {
    const adapter = getStorageAdapter();
    const chats = await adapter.loadChats(char.id);

    if (chats.length === 0) {
      showToast('info', t('settingsView.noChats', { name: char.name }));
      return;
    }

    // 取最新的对话
    const latestChat = chats[0];
    const userName = personaStore.activeUserName;
    downloadChatMarkdown(latestChat, char.name, userName);
    showToast('success', t('settingsView.mdExported', { name: char.name }));
  } catch (err) {
    showToast('error', t('settingsView.exportFailed', { error: err instanceof Error ? err.message : String(err) }));
  } finally {
    dataManageLoading.value = false;
  }
}
</script>

<template>
  <main id="main-content" class="settings-view" :aria-label="t('settings.title')" tabindex="-1">
    <!-- 浮动侧边栏：设置分类切换（固定） -->
    <aside class="settings-nav" :aria-label="t('settings.title')">
      <div class="settings-nav-inner">
        <h2 class="settings-nav-title">{{ t('settings.title') }}</h2>
        <div class="settings-nav-list" role="tablist" :aria-label="t('settings.title')">
          <button
            v-for="(cat, idx) in settingsCategories"
            :key="cat.id"
            type="button"
            class="settings-nav-item"
            :class="{ active: activeCategory === cat.id }"
            role="tab"
            :aria-selected="activeCategory === cat.id"
            :tabindex="activeCategory === cat.id ? 0 : -1"
            @click="selectCategory(cat.id)"
            @keydown="handleCategoryKeydown($event, idx)"
          >
            <Icon :name="cat.icon" :size="15" aria-hidden="true" />
            <span class="settings-nav-item-label">{{ cat.label }}</span>
            <span class="settings-nav-item-desc">{{ cat.description }}</span>
          </button>
        </div>
      </div>
    </aside>

    <!-- 设置内容区（唯一纵向滚动容器，横向裁剪避免 xy 双滚动轴） -->
    <div class="settings-body tk-scroll">
    <!-- 头部 -->
    <header class="settings-header">
      <h1 class="settings-title">
        <Icon name="gear" :size="22" />
        <span>{{ t('settings.title') }}</span>
      </h1>
      <p class="settings-subtitle">{{ activeCategoryDesc }}</p>
    </header>

    <!-- 外观：语言 / 主题 / 字号 / 界面自定义 -->
    <div v-show="activeCategory === 'appearance'">
    <!-- T-13: 语言选择 -->
    <section class="settings-section" aria-labelledby="locale-section-title">
      <header class="section-header">
        <h2 id="locale-section-title" class="section-title">
          <Icon name="globe" :size="16" />
          <span>{{ t('settings.language') }}</span>
        </h2>
        <p class="section-hint">{{ t('settings.languageDesc') }}</p>
      </header>

      <div class="fontsize-grid" role="radiogroup" :aria-label="t('settings.language')">
        <button
          v-for="opt in localeOptions"
          :key="opt.value"
          type="button"
          class="fontsize-card"
          :class="{ active: settings.locale === opt.value }"
          role="radio"
          :aria-checked="settings.locale === opt.value"
          :tabindex="settings.locale === opt.value ? 0 : -1"
          @click="selectLocale(opt.value)"
        >
          <span class="fontsize-value">{{ opt.label }}</span>
        </button>
      </div>
    </section>

    <!-- 主题选择 -->
    <section class="settings-section" aria-labelledby="theme-section-title">
      <header class="section-header">
        <h2 id="theme-section-title" class="section-title">
          <Icon name="palette" :size="16" />
          <span>{{ t('settingsView.themeSection') }}</span>
        </h2>
        <p class="section-hint">{{ t('settingsView.themeHint') }}</p>
      </header>

      <div class="theme-grid" role="radiogroup" :aria-label="t('settingsView.themeAria')">
        <button
          v-for="(opt, idx) in themeOptions"
          :key="opt.value"
          type="button"
          class="theme-card"
          :class="{ active: settings.theme === opt.value }"
          :data-value="opt.value"
          role="radio"
          :aria-checked="settings.theme === opt.value"
          :tabindex="settings.theme === opt.value ? 0 : -1"
          :aria-label="`${opt.label}：${opt.description}`"
          @click="selectTheme(opt.value)"
          @keydown="handleThemeKeydown($event, idx)"
        >
          <span class="theme-swatch" :class="opt.swatchClass" aria-hidden="true"></span>
          <span class="theme-info">
            <span class="theme-name">{{ opt.label }}</span>
            <span class="theme-desc">{{ opt.description }}</span>
          </span>
          <Icon
            v-if="settings.theme === opt.value"
            name="check"
            :size="16"
            class="theme-check"
            aria-hidden="true"
          />
        </button>
      </div>
    </section>

    <!-- 字号选择 -->
    <section class="settings-section" aria-labelledby="fontsize-section-title">
      <header class="section-header">
        <h2 id="fontsize-section-title" class="section-title">
          <Icon name="type-size" :size="16" />
          <span>{{ t('settingsView.fontSection') }}</span>
        </h2>
        <p class="section-hint">{{ t('settingsView.fontHint') }}</p>
      </header>

      <div class="fontsize-grid" role="radiogroup" :aria-label="t('settingsView.fontAria')">
        <button
          v-for="(opt, idx) in fontSizeOptions"
          :key="opt.value"
          type="button"
          class="fontsize-card"
          :class="{ active: settings.fontSize === opt.value }"
          :data-value="opt.value"
          role="radio"
          :aria-checked="settings.fontSize === opt.value"
          :tabindex="settings.fontSize === opt.value ? 0 : -1"
          :aria-label="`${opt.label}（${opt.value}px）`"
          @click="selectFontSize(opt.value)"
          @keydown="handleFontSizeKeydown($event, idx)"
        >
          <span class="fontsize-label">{{ opt.label }}</span>
          <span class="fontsize-value">{{ opt.value }}px</span>
          <span
            class="fontsize-sample"
            :style="{ fontSize: `${opt.value}px` }"
          >{{ opt.sample }}</span>
        </button>
      </div>

      <!-- 实时预览 -->
      <div class="font-preview" :aria-label="t('settingsView.previewAria')">
        <p class="preview-label">{{ t('settingsView.previewLabel', { size: settings.fontSize }) }}</p>
        <div class="preview-box" :style="{ fontSize: previewFontPx }">
          <p class="preview-line"><strong>{{ t('settingsView.previewCharName') }}</strong>：{{ t('settingsView.previewWelcome') }}</p>
          <p class="preview-line muted">{{ t('settingsView.previewSample', { size: settings.fontSize }) }}</p>
        </div>
      </div>
    </section>

    <!-- F08 UI 自定义（聊天背景 + 气泡样式 + 自定义 CSS） -->
    <section class="settings-section" aria-labelledby="ui-custom-section-title">
      <header class="section-header">
        <h2 id="ui-custom-section-title" class="section-title">
          <Icon name="image" :size="16" />
          <span>{{ t('settingsView.uiCustomSection') }}</span>
        </h2>
      </header>

      <!-- F08.2 聊天背景 -->
      <div class="ui-custom-block">
        <h3 class="ui-custom-subtitle">{{ t('settingsView.bgSubtitle') }}</h3>
        <p class="ui-custom-hint">{{ t('settingsView.bgHint') }}</p>

        <div class="bg-source-tabs" role="radiogroup" :aria-label="t('settingsView.bgSourceAria')">
          <button
            type="button"
            class="bg-source-tab"
            role="radio"
            :aria-checked="bgType === 'none'"
            :class="{ active: bgType === 'none' }"
            @click="bgType = 'none'; bgValue = ''"
          >{{ t('settingsView.bgNone') }}</button>
          <button
            type="button"
            class="bg-source-tab"
            role="radio"
            :aria-checked="bgType === 'url'"
            :class="{ active: bgType === 'url' }"
            @click="bgType = 'url'"
          >URL</button>
          <button
            type="button"
            class="bg-source-tab"
            role="radio"
            :aria-checked="bgType === 'base64'"
            :class="{ active: bgType === 'base64' }"
            @click="triggerBgUpload"
          >{{ t('settingsView.bgUpload') }}</button>
        </div>

        <input
          ref="bgFileInput"
          type="file"
          accept="image/*"
          class="hidden-file-input"
          :aria-label="t('settingsView.bgUploadAria')"
          @change="handleBgFileSelected"
        />

        <div v-if="bgType === 'url'" class="form-field">
          <label for="bg-url" class="field-label">{{ t('settingsView.bgUrlLabel2') }}</label>
          <input
            id="bg-url"
            v-model="bgValue"
            type="url"
            class="form-input"
            placeholder="https://example.com/bg.jpg"
            aria-describedby="bg-url-hint"
          />
          <p id="bg-url-hint" class="field-hint">{{ t('settingsView.bgUrlHint') }}</p>
        </div>

        <div v-if="bgType !== 'none'" class="form-field">
          <label for="bg-opacity" class="field-label">{{ t('settingsView.bgOpacityLabel', { value: Math.round(bgOpacity * 100) }) }}</label>
          <input
            id="bg-opacity"
            v-model.number="bgOpacity"
            type="range"
            min="0"
            max="1"
            step="0.1"
            class="form-range"
            :aria-label="t('settingsView.bgOpacityAria')"
          />
        </div>

        <div v-if="bgType !== 'none'" class="form-field">
          <label for="bg-blur" class="field-label">{{ t('settingsView.bgBlurLabel', { value: bgBlur }) }}</label>
          <input
            id="bg-blur"
            v-model.number="bgBlur"
            type="range"
            min="0"
            max="20"
            step="1"
            class="form-range"
            :aria-label="t('settingsView.bgBlurAria')"
          />
        </div>

        <div class="bg-preview" :style="bgPreviewStyle" :aria-label="t('settingsView.bgPreviewAria')">
          <div class="bg-preview-overlay" :style="{ opacity: bgType === 'none' ? 1 : bgOpacity, filter: bgBlur > 0 ? `blur(${bgBlur}px)` : 'none' }">
            <p class="preview-line"><strong>{{ t('settingsView.previewCharName') }}</strong>：{{ t('settingsView.bgPreviewSample') }}</p>
            <p class="preview-line muted">{{ t('settingsView.bgPreviewOpacity', { value: Math.round(bgOpacity * 100) }) }}</p>
          </div>
        </div>

        <div class="ui-custom-actions">
          <button type="button" class="data-mgmt-btn primary" @click="applyBackground">{{ t('settingsView.applyBg') }}</button>
          <button type="button" class="data-mgmt-btn" @click="clearBackground">{{ t('settingsView.clearBg') }}</button>
        </div>
      </div>

      <!-- F08.2 消息气泡样式 -->
      <div class="ui-custom-block">
        <h3 class="ui-custom-subtitle">{{ t('settingsView.bubbleSubtitle') }}</h3>

        <div class="form-field">
          <label for="bubble-radius" class="field-label">{{ t('settingsView.bubbleRadiusLabel', { value: bubbleRadius }) }}</label>
          <input
            id="bubble-radius"
            v-model.number="bubbleRadius"
            type="range"
            min="0"
            max="24"
            step="1"
            class="form-range"
            :aria-label="t('settingsView.bubbleRadiusAria')"
          />
        </div>

        <div class="form-field">
          <label for="bubble-opacity" class="field-label">{{ t('settingsView.bubbleOpacityLabel', { value: Math.round(bubbleOpacity * 100) }) }}</label>
          <input
            id="bubble-opacity"
            v-model.number="bubbleOpacity"
            type="range"
            min="0.3"
            max="1"
            step="0.05"
            class="form-range"
            :aria-label="t('settingsView.bubbleOpacityAria')"
          />
        </div>

        <div class="bubble-preview" :aria-label="t('settingsView.bubblePreviewAria')">
          <div
            class="bubble-preview-item user-bubble"
            :style="{ borderRadius: `${bubbleRadius}px`, opacity: bubbleOpacity }"
          >{{ t('settingsView.bubbleUserPreview') }}</div>
          <div
            class="bubble-preview-item assistant-bubble"
            :style="{ borderRadius: `${bubbleRadius}px`, opacity: bubbleOpacity }"
          >{{ t('settingsView.bubbleAiPreview') }}</div>
        </div>

        <div class="ui-custom-actions">
          <button type="button" class="data-mgmt-btn primary" @click="applyBubbleStyle">{{ t('settingsView.applyBubble') }}</button>
        </div>
      </div>

      <!-- F08.3 自定义 CSS -->
      <div class="ui-custom-block">
        <h3 class="ui-custom-subtitle">{{ t('settingsView.cssSubtitle') }}</h3>
        <p class="ui-custom-hint">{{ t('settingsView.cssHint') }}</p>

        <div class="form-field">
          <label for="custom-css" class="field-label">{{ t('settingsView.cssLabel') }}</label>
          <textarea
            id="custom-css"
            v-model="customCssDraft"
            class="form-textarea custom-css-textarea"
            rows="8"
            spellcheck="false"
            :placeholder="t('settingsView.cssPlaceholder2')"
            aria-describedby="custom-css-hint"
          ></textarea>
          <p id="custom-css-hint" class="field-hint">{{ t('settingsView.cssHint2', { vars: '--primary / --background / --card / --foreground' }) }}</p>
        </div>

        <div class="ui-custom-actions">
          <button type="button" class="data-mgmt-btn primary" @click="saveCustomCss">{{ t('settingsView.saveApply') }}</button>
          <button type="button" class="data-mgmt-btn" @click="resetCustomCss">{{ t('settingsView.resetCss') }}</button>
        </div>
      </div>
    </section>

    </div>

    <!-- P2-7：模型管理面板（wrapper 承载 v-show，组件为多根节点无法直接绑定） -->
    <div v-show="activeCategory === 'model'">
      <SettingsModelPanel />
      <VectorModelPanel />
    </div>

    <!-- 扩展：扩展系统配置 -->
    <div v-show="activeCategory === 'extension'">
    <!-- F12 扩展系统配置 -->
    <section class="settings-section" aria-labelledby="extensions-section-title">
      <header class="section-header">
        <h2 id="extensions-section-title" class="section-title">
          <Icon name="star" :size="16" />
          <span>{{ t('settingsView.extensionSection') }}</span>
        </h2>
      </header>

      <p class="extension-security-note" role="note">
        {{ t('settingsView.extensionDesc') }}
      </p>

      <!-- F12.2 TTS 语音朗读 -->
      <div class="extension-block">
        <h3 class="extension-title">{{ t('settingsView.ttsTitle') }}</h3>
        <label class="form-row">
          <input
            type="checkbox"
            :checked="settings.ttsConfig.enabled"
            @change="settings.setTtsConfig({ enabled: ($event.target as HTMLInputElement).checked })"
          />
          <span>{{ t('settingsView.ttsEnable') }}</span>
        </label>
        <label class="form-row">
          <span>{{ t('settingsView.ttsTrigger') }}</span>
          <select
            :value="settings.ttsConfig.trigger"
            @change="settings.setTtsConfig({ trigger: ($event.target as HTMLSelectElement).value as 'every' | 'manual' | 'mention' })"
          >
            <option value="manual">{{ t('settingsView.ttsManual') }}</option>
            <option value="every">{{ t('settingsView.ttsEvery') }}</option>
            <option value="mention">{{ t('settingsView.ttsMention') }}</option>
          </select>
        </label>
        <label class="form-row">
          <span>{{ t('settingsView.ttsRate', { value: settings.ttsConfig.rate.toFixed(1) }) }}</span>
          <input
            type="range"
            min="0.5"
            max="2"
            step="0.1"
            :value="settings.ttsConfig.rate"
            @input="settings.setTtsConfig({ rate: Number(($event.target as HTMLInputElement).value) })"
          />
        </label>
        <label class="form-row">
          <span>{{ t('settingsView.ttsPitch', { value: settings.ttsConfig.pitch.toFixed(1) }) }}</span>
          <input
            type="range"
            min="0"
            max="2"
            step="0.1"
            :value="settings.ttsConfig.pitch"
            @input="settings.setTtsConfig({ pitch: Number(($event.target as HTMLInputElement).value) })"
          />
        </label>
        <p class="hint-text">
          {{ t('settingsView.ttsNote') }}
        </p>
      </div>

      <!-- F12.3 消息翻译 -->
      <div class="extension-block">
        <h3 class="extension-title">{{ t('settingsView.translateTitle') }}</h3>
        <label class="form-row">
          <input
            type="checkbox"
            :checked="settings.translationConfig.enabled"
            @change="settings.setTranslationConfig({ enabled: ($event.target as HTMLInputElement).checked })"
          />
          <span>{{ t('settingsView.translateEnable') }}</span>
        </label>
        <label class="form-row">
          <span>{{ t('settingsView.translateService') }}</span>
          <select
            :value="settings.translationConfig.provider"
            @change="settings.setTranslationConfig({ provider: ($event.target as HTMLSelectElement).value as 'google' | 'deepl' | 'none' })"
          >
            <option value="none">{{ t('settingsView.translateNone') }}</option>
            <option value="google">Google Translate</option>
            <option value="deepl">DeepL</option>
          </select>
        </label>
        <label class="form-row">
          <span>API Key</span>
          <input
            type="password"
            :value="settings.translationConfig.apiKey"
            :placeholder="t('settingsView.translateApiKeyPlaceholder')"
            @input="settings.setTranslationConfig({ apiKey: ($event.target as HTMLInputElement).value })"
          />
        </label>
        <label class="form-row">
          <span>{{ t('settingsView.translateDirection') }}</span>
          <select
            :value="settings.translationConfig.direction"
            @change="settings.setTranslationConfig({ direction: ($event.target as HTMLSelectElement).value as 'zh-to-en' | 'en-to-zh' | 'auto' })"
          >
            <option value="auto">{{ t('settingsView.translateAuto') }}</option>
            <option value="zh-to-en">{{ t('settingsView.translateZhToEn') }}</option>
            <option value="en-to-zh">{{ t('settingsView.translateEnToZh') }}</option>
          </select>
        </label>
        <p class="hint-text">
          {{ t('settingsView.translateNote') }}
        </p>
      </div>

      <!-- F12.4 自动摘要 -->
      <div class="extension-block">
        <h3 class="extension-title">{{ t('settingsView.summaryTitle') }}</h3>
        <label class="form-row">
          <input
            type="checkbox"
            :checked="settings.summarizationConfig.enabled"
            @change="settings.setSummarizationConfig({ enabled: ($event.target as HTMLInputElement).checked })"
          />
          <span>{{ t('settingsView.summaryEnable') }}</span>
        </label>
        <label class="form-row">
          <span>{{ t('settingsView.summaryThreshold') }}</span>
          <input
            type="number"
            min="1000"
            max="20000"
            step="500"
            :value="settings.summarizationConfig.threshold"
            @input="settings.setSummarizationConfig({ threshold: Number(($event.target as HTMLInputElement).value) })"
          />
        </label>
        <label class="form-row">
          <span>{{ t('settingsView.summaryKeepRecent') }}</span>
          <input
            type="number"
            min="2"
            max="50"
            step="1"
            :value="settings.summarizationConfig.keepRecent"
            @input="settings.setSummarizationConfig({ keepRecent: Number(($event.target as HTMLInputElement).value) })"
          />
        </label>
        <label class="form-row">
          <span>{{ t('settingsView.summaryMaxToken') }}</span>
          <input
            type="number"
            min="100"
            max="2000"
            step="100"
            :value="settings.summarizationConfig.maxSummaryTokens"
            @input="settings.setSummarizationConfig({ maxSummaryTokens: Number(($event.target as HTMLInputElement).value) })"
          />
        </label>
        <p class="hint-text">
          {{ t('settingsView.summaryHint') }}
        </p>
      </div>
    </section>

    </div>

    <!-- 安全：主密码与加密保护 -->
    <div v-show="activeCategory === 'security'">
    <!-- AC20 安全：主密码管理 -->
    <section class="settings-section" aria-labelledby="security-section-title">
      <header class="section-header">
        <h2 id="security-section-title" class="section-title">
          <Icon name="gear" :size="18" aria-hidden="true" />
          <span>{{ t('settingsView.securitySection') }}</span>
        </h2>
      </header>
      <div class="extension-block">
        <h3 class="extension-title">{{ t('settingsView.encryptTitle') }}</h3>
        <p class="hint-text">
          {{ t('settingsView.encryptDesc') }}
        </p>

        <!-- 已设置主密码 -->
        <template v-if="settings.hasMasterPassword">
          <div class="form-row security-status">
            <Icon name="check" :size="14" />
            <span>{{ t('settingsView.mpSetStatus') }}</span>
          </div>
          <div class="form-row security-status" v-if="settings.isUnlocked">
            <Icon name="check" :size="14" />
            <span>{{ t('settingsView.sessionUnlocked') }}</span>
          </div>
          <div class="form-row security-status" v-else>
            <Icon name="alert-triangle" :size="14" />
            <span>{{ t('settingsView.sessionLocked') }}</span>
          </div>
          <div class="security-actions">
            <button
              v-if="!settings.isUnlocked"
              type="button"
              class="action-btn primary"
              @click="openMasterPasswordModal('unlock')"
            >
              <Icon name="eye" :size="14" />
              <span>{{ t('settingsView.unlock') }}</span>
            </button>
            <button
              type="button"
              class="action-btn"
              :disabled="!settings.isUnlocked"
              :aria-disabled="!settings.isUnlocked"
              @click="openMasterPasswordModal('change')"
            >
              <Icon name="pencil" :size="14" />
              <span>{{ t('settingsView.changeMp') }}</span>
            </button>
            <button
              v-if="settings.isUnlocked"
              type="button"
              class="action-btn"
              @click="lockApp"
            >
              <Icon name="stop" :size="14" />
              <span>{{ t('settingsView.lock') }}</span>
            </button>
          </div>
        </template>

        <!-- 未设置主密码 -->
        <template v-else>
          <div class="form-row security-status">
            <Icon name="alert-triangle" :size="14" />
            <span>{{ t('settingsView.encryptPlainHint') }}</span>
          </div>
          <div class="security-actions">
            <button
              type="button"
              class="action-btn primary"
              @click="openMasterPasswordModal('setup')"
            >
              <Icon name="gear" :size="14" />
              <span>{{ t('settingsView.setupMp') }}</span>
            </button>
          </div>
        </template>
      </div>
    </section>

    </div>

    <!-- 个人：Persona 管理 -->
    <div v-show="activeCategory === 'persona'">
    <!-- Persona 管理 (F07) -->
    <section class="settings-section" aria-labelledby="persona-section-title">
      <header class="section-header">
        <h2 id="persona-section-title" class="section-title">
          <Icon name="user" :size="18" aria-hidden="true" />
          <span>Persona 用户身份</span>
        </h2>
        <button
          type="button"
          class="action-btn primary"
          @click="openPersonaCreate"
        >
          <Icon name="plus" :size="14" />
          <span>新建</span>
        </button>
      </header>
      <p class="section-hint">
        当前身份：<strong>{{ personaStore.activeUserName }}</strong>
        · 对话中 <code v-pre>{{user}}</code> 宏将替换为该名称
      </p>
      <ul v-if="personaStore.personas.length" class="profile-list" role="list">
        <li
          v-for="p in personaStore.personas"
          :key="p.id"
          class="profile-item"
          :class="{ active: p.id === settings.activePersonaId }"
        >
          <button
            type="button"
            class="profile-info"
            :aria-pressed="p.id === settings.activePersonaId"
            :aria-label="`激活 Persona ${p.name}`"
            @click="personaStore.setActivePersona(p.id)"
          >
            <div class="profile-name">
              {{ p.name }}
              <span v-if="p.id === settings.activePersonaId" class="badge-active" aria-label="当前激活">激活</span>
            </div>
            <div class="profile-baseurl">{{ p.description || '无描述' }}</div>
          </button>
          <div class="profile-actions">
            <button
              type="button"
              class="action-btn"
              :aria-label="`编辑 Persona ${p.name}`"
              @click="openPersonaEdit(p)"
            >
              <Icon name="pencil" :size="12" />
              <span>编辑</span>
            </button>
            <button
              type="button"
              class="action-btn delete"
              :disabled="personaStore.personas.length <= 1"
              :aria-disabled="personaStore.personas.length <= 1"
              :aria-label="`删除 Persona ${p.name}`"
              @click="confirmDeletePersona(p)"
            >
              <Icon name="trash-2" :size="12" />
              <span>删除</span>
            </button>
          </div>
        </li>
      </ul>
      <p v-else class="empty-hint">尚无 Persona，应用会自动创建默认 "User"</p>
    </section>



    <!-- Persona 编辑/新建 Modal (F07) -->
    <Modal
      v-model="personaModalOpen"
      :title="personaEditMode === 'create' ? '新建 Persona' : '编辑 Persona'"
      aria-label="Persona 表单"
    >
      <form class="profile-form" novalidate @submit.prevent="savePersona">
        <div class="form-field">
          <label for="persona-name" class="field-label">
            名称 <span class="required">*</span>
          </label>
          <input
            id="persona-name"
            v-model="personaForm.name"
            type="text"
            class="field-input"
            :class="{ 'has-error': personaErrors.name }"
            :aria-invalid="!!personaErrors.name"
            :aria-describedby="personaErrors.name ? 'err-persona-name' : undefined"
            :maxlength="30"
            placeholder="如：勇者艾伦"
            autocomplete="off"
          />
          <p v-if="personaErrors.name" id="err-persona-name" class="field-error" role="alert">
            <Icon name="alert-triangle" :size="12" />
            <span>{{ personaErrors.name }}</span>
          </p>
          <p class="field-hint">1-30 字符，将作为 <code v-pre>{{user}}</code> 宏替换值</p>
        </div>

        <div class="form-field">
          <label for="persona-desc" class="field-label">描述（外貌/性格/背景）</label>
          <textarea
            id="persona-desc"
            v-model="personaForm.description"
            class="field-input field-textarea"
            rows="5"
            placeholder="描述这个 Persona 的外貌、性格、背景等。建议 500 字以内。"
            aria-describedby="persona-desc-hint"
          />
          <p id="persona-desc-hint" class="field-hint">
            建议 500 字以内，将注入提示词作为用户身份描述
          </p>
        </div>
      </form>
      <template #footer>
        <button
          type="button"
          class="modal-btn modal-cancel"
          @click="personaModalOpen = false"
        >
          取消
        </button>
        <button
          type="button"
          class="modal-btn modal-save"
          :disabled="!canSavePersona"
          :aria-disabled="!canSavePersona"
          @click="savePersona"
        >
          <Icon name="save" :size="14" />
          <span>{{ personaEditMode === 'create' ? '创建' : '保存' }}</span>
        </button>
      </template>
    </Modal>

    <!-- Persona 删除确认 -->
    <Modal
      v-model="personaDeleteModalOpen"
      title="确认删除"
      aria-label="删除 Persona 确认"
    >
      <p v-if="personaDeleteTarget">
        确定要删除 Persona「<strong>{{ personaDeleteTarget.name }}</strong>」吗？
      </p>
      <p class="delete-warning">
        删除后无法恢复。若删除的是当前激活身份，将自动切换到第一个 Persona。
      </p>
      <template #footer>
        <button
          type="button"
          class="modal-btn modal-cancel"
          @click="personaDeleteModalOpen = false"
        >
          取消
        </button>
        <button
          type="button"
          class="modal-btn modal-confirm"
          @click="executeDeletePersona"
        >
          删除
        </button>
      </template>
    </Modal>

    </div>

    <!-- 数据：导入 / 导出 / 数据管理 -->
    <div v-show="activeCategory === 'data'">
    <!-- F13 数据管理 -->
    <section
      v-if="characterStore.characters.length > 0"
      class="settings-section data-mgmt-section"
      aria-labelledby="data-mgmt-title"
    >
      <header class="section-header">
        <h2 id="data-mgmt-title" class="section-title">
          <Icon name="download" :size="16" />
          <span>数据管理</span>
        </h2>
        <p class="section-hint">备份、恢复、导出角色卡与对话</p>
      </header>

      <!-- T-07: SillyTavern Quick Reply 互导 -->
      <div class="data-mgmt-row">
        <div class="data-mgmt-block">
          <h3 class="data-mgmt-subtitle">快捷回复互导（SillyTavern）</h3>
          <p class="data-mgmt-hint">
            将快捷回复按钮导出为 SillyTavern Quick Reply JSON，或从 ST 文件导入（同名自动去重）。
          </p>
          <div class="data-mgmt-actions">
            <button
              type="button"
              class="data-mgmt-btn"
              @click="handleExportQuickReplies"
            >
              <Icon name="download" :size="14" />
              <span>导出快捷回复</span>
            </button>
            <button
              type="button"
              class="data-mgmt-btn"
              @click="handleImportQuickReplies"
            >
              <Icon name="upload" :size="14" />
              <span>导入快捷回复</span>
            </button>
            <input
              ref="quickReplyFileInput"
              type="file"
              accept=".json,application/json"
              class="sr-only"
              @change="handleQuickReplyFileSelected"
            />
          </div>
        </div>
      </div>

      <!-- T-12: 资料档案(Profile) -->
      <div class="data-mgmt-row">
        <div class="data-mgmt-block">
          <h3 class="data-mgmt-subtitle">资料档案(Profile)</h3>
          <p class="data-mgmt-hint">
            当前档案:<strong>{{ currentProfileId }}</strong>。
            切换档案后数据相互隔离(Web 模式按档案分库);切换需重启应用生效。
          </p>
          <div class="data-mgmt-actions">
            <label class="profile-create">
              <input
                v-model="newProfileName"
                type="text"
                class="profile-input"
                placeholder="新档案名(字母/数字/_-)"
                :aria-label="'新资料档案名称'"
              />
              <button
                type="button"
                class="data-mgmt-btn"
                @click="handleCreateProfile"
              >
                <Icon name="plus" :size="14" />
                <span>创建并切换</span>
              </button>
            </label>
            <button
              v-if="currentProfileId !== DEFAULT_PROFILE"
              type="button"
              class="data-mgmt-btn"
              @click="handleResetProfile"
            >
              <Icon name="arrow-left" :size="14" />
              <span>切回默认档案</span>
            </button>
          </div>
        </div>
      </div>

      <!-- E-04 二期: 嵌入优化开关 -->
      <div class="data-mgmt-row">
        <div class="data-mgmt-block">
          <h3 class="data-mgmt-subtitle">嵌入优化(实验)</h3>
          <p class="data-mgmt-hint">
            三层中间件优化:上下文结构(L0)/输出纪律(L2)/内容压缩(L1)。
            <strong>默认全部关闭</strong>,开启后重启应用生效;所有路径 fail-open,失败自动回退原文。
          </p>
          <div class="opt-switches">
            <label class="form-row">
              <input
                type="checkbox"
                :checked="optimizationConfig.enabled"
                @change="toggleOptimization('enabled', ($event.target as HTMLInputElement).checked)"
              />
              <span>总开关(实验性)</span>
            </label>
            <label class="form-row">
              <input
                type="checkbox"
                :checked="optimizationConfig.l0Enabled"
                :disabled="!optimizationConfig.enabled"
                @change="toggleOptimization('l0Enabled', ($event.target as HTMLInputElement).checked)"
              />
              <span>L0 上下文结构(前缀稳定)</span>
            </label>
            <label class="form-row">
              <input
                type="checkbox"
                :checked="optimizationConfig.l2Enabled"
                :disabled="!optimizationConfig.enabled"
                @change="toggleOptimization('l2Enabled', ($event.target as HTMLInputElement).checked)"
              />
              <span>L2 输出纪律(旁白精简)</span>
            </label>
            <label class="form-row">
              <input
                type="checkbox"
                :checked="optimizationConfig.l1Enabled"
                :disabled="!optimizationConfig.enabled"
                @change="toggleOptimization('l1Enabled', ($event.target as HTMLInputElement).checked)"
              />
              <span>L1 内容压缩(长历史)</span>
            </label>
          </div>
        </div>
      </div>

      <!-- T-06: 数据操作审计日志 -->
      <div class="data-mgmt-row">
        <div class="data-mgmt-block">
          <h3 class="data-mgmt-subtitle">数据操作审计日志</h3>
          <p class="data-mgmt-hint">
            记录备份导入/导出、角色卡与对话导出等敏感操作（仅摘要，不含内容数据；最多保留 200 条）。
          </p>
          <div class="data-mgmt-actions">
            <button
              type="button"
              class="data-mgmt-btn"
              @click="auditModalOpen = true"
            >
              <Icon name="clock" :size="14" />
              <span>查看审计日志</span>
            </button>
            <button
              type="button"
              class="data-mgmt-btn"
              @click="handleExportAuditLog"
            >
              <Icon name="download" :size="14" />
              <span>导出审计 JSON</span>
            </button>
            <button
              type="button"
              class="data-mgmt-btn"
              @click="handleClearAuditLog"
            >
              <Icon name="trash-2" :size="14" />
              <span>清空日志</span>
            </button>
          </div>
        </div>
      </div>

      <!-- 全量备份 -->
      <div class="data-mgmt-row">
        <div class="data-mgmt-block">
          <h3 class="data-mgmt-subtitle">全量备份与恢复</h3>
          <p class="data-mgmt-hint">
            将所有角色卡、对话、世界书、群聊、Persona 和设置导出为单一 JSON 文件，便于跨设备迁移。
          </p>
          <div class="data-mgmt-actions">
            <button
              type="button"
              class="data-mgmt-btn"
              :disabled="dataManageLoading"
              @click="handleExportBackup"
            >
              <Icon name="download" :size="14" />
              <span>导出备份</span>
            </button>
            <button
              type="button"
              class="data-mgmt-btn"
              :disabled="dataManageLoading"
              @click="triggerBackupImport"
            >
              <Icon name="upload" :size="14" />
              <span>导入备份</span>
            </button>
            <input
              ref="backupFileInput"
              type="file"
              accept=".json,application/json"
              class="hidden-file-input"
              aria-hidden="true"
              tabindex="-1"
              @change="handleBackupFileSelected"
            />
          </div>

          <!-- 冲突策略 -->
          <div class="conflict-strategy" role="radiogroup" aria-label="冲突处理策略">
            <span class="strategy-label">冲突策略：</span>
            <label class="strategy-option">
              <input
                type="radio"
                name="conflict-strategy"
                value="overwrite"
                v-model="conflictStrategy"
              />
              <span>覆盖</span>
            </label>
            <label class="strategy-option">
              <input
                type="radio"
                name="conflict-strategy"
                value="skip"
                v-model="conflictStrategy"
              />
              <span>跳过</span>
            </label>
            <label class="strategy-option">
              <input
                type="radio"
                name="conflict-strategy"
                value="merge"
                v-model="conflictStrategy"
              />
              <span>合并</span>
            </label>
          </div>
        </div>
      </div>

      <!-- 角色卡 PNG 导出 -->
      <div class="data-mgmt-row">
        <div class="data-mgmt-block">
          <h3 class="data-mgmt-subtitle">导出角色卡 PNG</h3>
          <p class="data-mgmt-hint">
            将角色卡嵌入 PNG 文件（SillyTavern 兼容格式），可作为图像分享。
          </p>
          <div class="data-mgmt-actions">
            <label class="data-mgmt-select-label">
              <span class="visually-hidden">选择角色</span>
              <select
                v-model="exportCharId"
                class="tk-input data-mgmt-select"
                aria-label="选择要导出 PNG 的角色"
              >
                <option value="">请选择角色…</option>
                <option
                  v-for="c in exportCharList"
                  :key="c.id"
                  :value="c.id"
                >
                  {{ c.name }}
                </option>
              </select>
            </label>
            <button
              type="button"
              class="data-mgmt-btn"
              :disabled="!exportCharId || dataManageLoading"
              @click="handleExportCharacterPng"
            >
              <Icon name="image" :size="14" />
              <span>导出 PNG</span>
            </button>
          </div>
        </div>
      </div>

      <!-- 对话 Markdown 导出 -->
      <div class="data-mgmt-row">
        <div class="data-mgmt-block">
          <h3 class="data-mgmt-subtitle">导出对话 Markdown</h3>
          <p class="data-mgmt-hint">
            将指定角色的最新对话导出为 Markdown 文档。
          </p>
          <div class="data-mgmt-actions">
            <label class="data-mgmt-select-label">
              <span class="visually-hidden">选择角色</span>
              <select
                v-model="exportChatCharId"
                class="tk-input data-mgmt-select"
                aria-label="选择要导出对话的角色"
              >
                <option value="">请选择角色…</option>
                <option
                  v-for="c in exportChatCharList"
                  :key="c.id"
                  :value="c.id"
                >
                  {{ c.name }}
                </option>
              </select>
            </label>
            <button
              type="button"
              class="data-mgmt-btn"
              :disabled="!exportChatCharId || dataManageLoading"
              @click="handleExportChatMarkdown"
            >
              <Icon name="file" :size="14" />
              <span>导出 Markdown</span>
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- 导入结果 Modal -->
    <Modal
      v-model="importResultModalOpen"
      title="导入结果"
    >
      <div v-if="lastImportResult" class="import-result">
        <p class="result-summary">导入完成，统计如下：</p>
        <ul class="result-list">
          <li>
            <span class="result-key">角色卡</span>
            <span class="result-value">
              新增 {{ lastImportResult.characters.added }} ·
              覆盖 {{ lastImportResult.characters.overwritten }} ·
              跳过 {{ lastImportResult.characters.skipped }}
            </span>
          </li>
          <li>
            <span class="result-key">对话</span>
            <span class="result-value">
              新增 {{ lastImportResult.chats.added }} ·
              覆盖 {{ lastImportResult.chats.overwritten }} ·
              跳过 {{ lastImportResult.chats.skipped }}
            </span>
          </li>
          <li>
            <span class="result-key">世界书</span>
            <span class="result-value">
              新增 {{ lastImportResult.lorebooks.added }} ·
              覆盖 {{ lastImportResult.lorebooks.overwritten }} ·
              跳过 {{ lastImportResult.lorebooks.skipped }}
            </span>
          </li>
          <li>
            <span class="result-key">群聊</span>
            <span class="result-value">
              新增 {{ lastImportResult.groupChats.added }} ·
              覆盖 {{ lastImportResult.groupChats.overwritten }} ·
              跳过 {{ lastImportResult.groupChats.skipped }}
            </span>
          </li>
          <li>
            <span class="result-key">Persona</span>
            <span class="result-value">
              新增 {{ lastImportResult.personas.added }} ·
              覆盖 {{ lastImportResult.personas.overwritten }} ·
              跳过 {{ lastImportResult.personas.skipped }}
            </span>
          </li>
          <li>
            <span class="result-key">设置</span>
            <span class="result-value">
              {{ lastImportResult.settingsUpdated ? '已更新' : '未变更' }}
            </span>
          </li>
        </ul>
        <p
          v-if="lastImportResult.errors.length > 0"
          class="result-errors"
          role="alert"
        >
          <Icon name="alert-triangle" :size="14" />
          <span>有 {{ lastImportResult.errors.length }} 条错误：</span>
        </p>
        <ul v-if="lastImportResult.errors.length > 0" class="error-list">
          <li v-for="(err, idx) in lastImportResult.errors" :key="idx">
            {{ err }}
          </li>
        </ul>
      </div>
      <template #footer>
        <button
          type="button"
          class="modal-btn modal-confirm"
          @click="importResultModalOpen = false"
        >
          关闭
        </button>
      </template>
    </Modal>

    <!-- T-06: 审计日志查看 -->
    <Modal v-model="auditModalOpen" title="数据操作审计日志">
      <div class="audit-log-body">
        <p v-if="auditEntries.length === 0" class="audit-empty">暂无审计记录</p>
        <ul v-else class="audit-list">
          <li
            v-for="entry in auditEntries"
            :key="`${entry.ts}-${entry.action}`"
            class="audit-item"
          >
            <span class="audit-time">{{ new Date(entry.ts).toLocaleString('zh-CN') }}</span>
            <span class="audit-action">{{ AUDIT_ACTION_LABELS[entry.action] ?? entry.action }}</span>
            <span class="audit-detail">{{ entry.detail }}</span>
            <span class="audit-result" :class="auditResultClass(entry.result)">
              {{ entry.result === 'ok' ? '成功' : entry.result === 'blocked' ? '阻止' : '失败' }}
            </span>
          </li>
        </ul>
      </div>
      <template #footer>
        <button
          type="button"
          class="modal-btn modal-confirm"
          @click="auditModalOpen = false"
        >
          关闭
        </button>
      </template>
    </Modal>

    <Toast
      v-model="toastOpen"
      :type="toastType"
      :message="toastMessage"
    />

    <!-- AC20 主密码管理弹窗 -->
    <MasterPasswordModal
      v-model="mpModalOpen"
      :mode="mpModalMode"
      @success="handleMasterPasswordSuccess"
    />
    </div>
    </div>
  </main>
</template>

<style scoped>
.settings-view {
  display: flex;
  flex-direction: row;
  height: 100%;
  width: 100%;
  overflow: hidden;
  background: var(--background);
}

/* ── 浮动侧边栏（固定，随内容滚动保持可见） ── */
.settings-nav {
  flex-shrink: 0;
  width: 216px;
  margin: 16px 0 16px 16px;
  padding: 14px 10px;
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--card) 90%, transparent);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid var(--border);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.14);
  overflow-y: auto;
  align-self: flex-start;
  position: sticky;
  top: 16px;
  max-height: calc(100vh - 32px);
  z-index: 5;
}

.settings-nav-title {
  margin: 0 0 10px 10px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted-foreground);
}

.settings-nav-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.settings-nav-item {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 9px 12px;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--muted-foreground);
  text-align: left;
  cursor: pointer;
  transition: background-color 0.15s, color 0.15s;
}

.settings-nav-item-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 600;
  color: inherit;
}

.settings-nav-item-desc {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: right;
  font-size: 11px;
  color: var(--muted-foreground);
}

.settings-nav-item:hover {
  background: var(--card-elevated, var(--card));
  color: var(--foreground);
}

.settings-nav-item:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 1px;
}

.settings-nav-item.active {
  background: color-mix(in srgb, var(--primary) 14%, transparent);
  /* 激活项文字用最高亮度层级，保证 on 红色浅底 ≥4.5:1（WCAG AA） */
  color: var(--foreground);
  border: 1px solid color-mix(in srgb, var(--primary) 55%, transparent);
}

/* ── 内容区（唯一滚动容器；横向裁剪避免双滚动轴） ── */
.settings-body {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 24px;
  overflow-y: auto;
  overflow-x: hidden;
  max-width: 980px;
  margin: 0 auto;
}

.settings-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.settings-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-family: var(--font-display);
  font-size: 24px;
  font-weight: 600;
  color: var(--foreground);
  margin: 0;
}

.settings-subtitle {
  font-size: 13px;
  color: var(--muted-foreground);
  margin: 0;
}

.settings-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 20px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 600;
  color: var(--foreground);
  margin: 0;
}

.section-hint {
  font-size: 12px;
  color: var(--muted-foreground);
  margin: 0;
}

/* ── 主题选择 ── */
.theme-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 10px;
}

.theme-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--video-bg);
  border: 2px solid var(--border);
  border-radius: var(--radius-md);
  cursor: pointer;
  text-align: left;
  transition: border-color .15s ease, background-color .15s ease;
}

.theme-card:hover {
  border-color: var(--secondary);
}

.theme-card:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 2px;
}

.theme-card.active {
  border-color: var(--secondary);
  background: color-mix(in srgb, var(--secondary) 10%, transparent);
}

.theme-swatch {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  flex-shrink: 0;
}

.swatch-dark {
  background: linear-gradient(135deg, #0B0B10, #161823);
}

.swatch-light {
  background: linear-gradient(135deg, #F7F8FA, #FFFFFF);
}

.swatch-midnight {
  background: linear-gradient(135deg, #0A0E27, #1A2048);
}

.swatch-oled {
  background: linear-gradient(135deg, #000000, #141414);
}

.swatch-theatre {
  background: linear-gradient(135deg, #0C0A09, #201A12);
}

.theme-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.theme-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--foreground);
}

.theme-desc {
  font-size: 11px;
  color: var(--muted-foreground);
}

.theme-check {
  color: var(--secondary);
  flex-shrink: 0;
}

/* ── 字号选择 ── */
.fontsize-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px;
}

.fontsize-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px;
  background: var(--video-bg);
  border: 2px solid var(--border);
  border-radius: var(--radius-md);
  cursor: pointer;
  text-align: center;
  transition: border-color .15s ease, background-color .15s ease;
}

.fontsize-card:hover {
  border-color: var(--secondary);
}

.fontsize-card:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 2px;
}

.fontsize-card.active {
  border-color: var(--secondary);
  background: color-mix(in srgb, var(--secondary) 10%, transparent);
}

.fontsize-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--foreground);
}

.fontsize-value {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--muted-foreground);
}

.fontsize-sample {
  color: var(--muted-foreground);
  line-height: 1.3;
  margin-top: 4px;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.font-preview {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  background: var(--video-bg);
  border: 1px dashed var(--border);
  border-radius: var(--radius-md);
}

.preview-label {
  font-size: 12px;
  color: var(--muted-foreground);
  margin: 0;
}

.preview-box {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 12px;
  line-height: 1.6;
}

.preview-line {
  margin: 0;
}

.preview-line.muted {
  color: var(--muted-foreground);
}

/* ── API Profile 管理 ── */
.add-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 30px;
  padding: 0 12px;
  border-radius: var(--radius-md);
  background: var(--primary);
  border: 1px solid var(--primary);
  color: var(--on-media);
  font-size: 12px;
  cursor: pointer;
  transition: background-color .15s ease, border-color .15s ease;
}

.add-btn:hover {
  background: var(--destructive);
  border-color: var(--destructive);
}

.add-btn:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 2px;
}

.empty-hint {
  font-size: 13px;
  color: var(--muted-foreground);
  margin: 0;
  padding: 16px 0;
  text-align: center;
}

.profile-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.profile-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--video-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  transition: border-color .15s ease, background-color .15s ease;
}

.profile-item.active {
  border-color: var(--secondary);
  background: color-mix(in srgb, var(--secondary) 6%, transparent);
}

.profile-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.profile-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.profile-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--foreground);
}

.active-badge {
  background: var(--secondary);
  color: var(--on-accent);
  font-size: 10px;
  padding: 2px 6px;
  border-radius: var(--radius-pill);
  font-weight: 600;
}

.provider-badge {
  background: var(--border);
  color: var(--muted-foreground);
  font-size: 10px;
  padding: 2px 6px;
  border-radius: var(--radius-pill);
  font-family: var(--font-mono);
  text-transform: lowercase;
}

.provider-badge[data-provider='openai'] {
  background: color-mix(in srgb, #10A37F 20%, transparent);
  color: #10A37F;
}

.provider-badge[data-provider='anthropic'] {
  background: color-mix(in srgb, #D97757 20%, transparent);
  color: #D97757;
}

.provider-badge[data-provider='custom'] {
  background: color-mix(in srgb, var(--primary) 20%, transparent);
  color: var(--primary-fg);
}

.provider-badge[data-provider='deepseek'] {
  background: color-mix(in srgb, var(--accent-blue) 20%, transparent);
  color: var(--accent-blue);
}

/* ── 需求3：模型管理面板 ── */

.model-category-group {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}

.model-category-group:first-of-type {
  margin-top: 0;
  padding-top: 0;
  border-top: none;
}

.category-group-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  color: var(--foreground);
  margin: 0 0 4px 0;
}

.category-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  background: var(--card-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  font-size: 11px;
  font-weight: 600;
  color: var(--muted-foreground);
  font-family: var(--font-mono);
}

.category-desc {
  font-size: 12px;
  color: var(--muted-foreground);
  margin: 0 0 8px 0;
  line-height: 1.4;
}

.model-mgmt-list {
  margin-top: 4px;
}

.profile-item.is-primary {
  border-color: var(--primary);
  background: color-mix(in srgb, var(--primary) 6%, transparent);
}

.primary-badge {
  display: inline-flex;
  align-items: center;
  padding: 1px 8px;
  background: var(--primary);
  color: var(--on-primary);
  font-size: 10px;
  font-weight: 600;
  border-radius: var(--radius-pill);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.primary-mark {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--primary-fg);
  font-weight: 500;
}

.action-btn.set-primary {
  color: var(--warning-fg);
  border-color: var(--warning-border);
}

.action-btn.set-primary:hover {
  background: var(--warning-bg);
  border-color: var(--warning-fg);
  color: var(--warning-fg);
}

.profile-meta {
  display: flex;
  gap: 12px;
  font-size: 11px;
  color: var(--muted-foreground);
  flex-wrap: wrap;
}

.meta-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.meta-url {
  font-family: var(--font-mono);
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profile-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 10px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--card-elevated);
  color: var(--muted-foreground);
  font-size: 11px;
  cursor: pointer;
  transition: background-color .15s ease, color .15s ease, border-color .15s ease;
}

.action-btn:hover {
  background: var(--card);
  color: var(--foreground);
}

.action-btn:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 2px;
}

.action-btn.activate {
  background: var(--secondary);
  border-color: var(--secondary);
  color: var(--on-accent);
}

.action-btn.activate:hover {
  background: var(--tk-cyan-600);
  border-color: var(--tk-cyan-600);
}

.action-btn.deactivate {
  background: var(--video-bg);
  color: var(--muted-foreground);
}

.action-btn.delete:hover {
  border-color: var(--destructive);
  color: var(--destructive);
}

/* ── 表单 ── */
.profile-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 12px;
  color: var(--muted-foreground);
  font-weight: 500;
}

.required {
  color: var(--destructive);
}

.field-input {
  height: 36px;
  padding: 0 12px;
  background: var(--video-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--foreground);
  font-size: 13px;
  font-family: var(--font-sans);
  outline: none;
  transition: border-color .15s ease, box-shadow .15s ease;
  width: 100%;
}

select.field-input {
  height: 36px;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23AEB2C0' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  padding-right: 32px;
}

.field-input:focus-visible {
  border-color: var(--secondary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--secondary) 20%, transparent);
}

.field-input.has-error {
  border-color: var(--destructive);
}

.field-error {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--destructive);
  margin: 0;
}

.field-hint {
  font-size: 11px;
  color: var(--muted-foreground);
  margin: 0;
}

/* 测试连接（第8条/第10条） */
.test-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.test-btn {
  flex-shrink: 0;
}

.test-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.test-result {
  display: flex;
  gap: 8px;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  font-size: 12px;
  line-height: 1.55;
  border: 1px solid transparent;
}

.test-result.ok {
  border-color: color-mix(in srgb, var(--success) 45%, transparent);
  background: color-mix(in srgb, var(--success) 10%, transparent);
  color: var(--success);
}

.test-result.fail {
  border-color: color-mix(in srgb, var(--destructive) 45%, transparent);
  background: color-mix(in srgb, var(--destructive) 10%, transparent);
  color: var(--destructive);
}

.test-result-icon {
  flex-shrink: 0;
  margin-top: 1px;
}

.test-result-body {
  min-width: 0;
  flex: 1;
}

.test-result-msg {
  margin: 0;
  word-break: break-word;
}

.test-result-hints {
  margin: 6px 0 0;
  padding-left: 16px;
  color: var(--muted-foreground);
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.model-list-result {
  margin: 0;
  font-size: 11px;
  line-height: 1.5;
  flex: 1;
}

.model-list-result.ok {
  color: var(--success);
}

.model-list-result.fail {
  color: var(--destructive);
}

/* Persona 区段 (F07) */
.badge-active {
  display: inline-block;
  padding: 1px 6px;
  margin-left: 6px;
  font-size: 10px;
  font-weight: 600;
  color: var(--on-accent);
  background: var(--secondary);
  border-radius: var(--radius-pill);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.field-textarea {
  resize: vertical;
  min-height: 80px;
  font-family: var(--font-sans);
  line-height: 1.55;
}

.apikey-input-wrap {
  position: relative;
}

.apikey-input-wrap .field-input {
  padding-right: 40px;
}

.toggle-visibility {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  width: 28px;
  height: 28px;
  background: none;
  border: none;
  color: var(--muted-foreground);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
}

.toggle-visibility:hover {
  color: var(--foreground);
  background: color-mix(in srgb, var(--foreground) 8%, transparent);
}

.toggle-visibility:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 1px;
}

/* ── Modal 按钮 ── */
.modal-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 14px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--card-elevated);
  color: var(--foreground);
  font-size: 13px;
  cursor: pointer;
  transition: background-color .15s ease, border-color .15s ease;
}

.modal-btn:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 2px;
}

.modal-cancel:hover {
  background: var(--video-bg);
}

.modal-save {
  background: var(--primary);
  border-color: var(--primary);
  color: var(--on-media);
}

.modal-save:hover:not(:disabled) {
  background: var(--destructive);
  border-color: var(--destructive);
}

.modal-save:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.modal-confirm {
  background: var(--destructive);
  border-color: var(--destructive);
  color: var(--on-accent);
}

.modal-confirm:hover {
  background: var(--destructive);
  border-color: var(--destructive);
}

.delete-warning {
  margin-top: 8px;
  color: var(--error-fg);
  font-size: 13px;
}

/* ── 响应式 ── */
@media (max-width: 767px) {
  .settings-view {
    padding: 16px;
  }
  .settings-section {
    padding: 14px;
  }
  .theme-grid {
    grid-template-columns: 1fr;
  }
  .fontsize-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .profile-item {
    flex-direction: column;
    align-items: stretch;
  }
  .profile-actions {
    flex-wrap: wrap;
  }
  .action-btn {
    flex: 1;
    min-width: 0;
  }
  .meta-url {
    max-width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .theme-card,
  .fontsize-card,
  .profile-item,
  .action-btn,
  .modal-btn {
    transition: none;
  }
}

/* ── F08 UI 自定义 ── */
.ui-custom-block {
  padding: 16px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ui-custom-subtitle {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--foreground);
}

.ui-custom-hint {
  margin: 0;
  font-size: 12px;
  color: var(--muted-foreground);
  line-height: 1.5;
}

.ui-custom-hint code {
  font-family: var(--font-mono);
  padding: 1px 4px;
  background: var(--video-bg);
  border-radius: 3px;
  font-size: 11px;
}

.bg-source-tabs {
  display: flex;
  gap: 8px;
  padding: 4px;
  background: var(--video-bg);
  border-radius: var(--radius-md);
}

.bg-source-tab {
  flex: 1;
  height: 32px;
  border: none;
  background: transparent;
  color: var(--muted-foreground);
  font-size: 13px;
  cursor: pointer;
  border-radius: calc(var(--radius-md) - 2px);
  transition: all 0.15s;
}

.bg-source-tab.active {
  background: var(--card);
  color: var(--foreground);
  font-weight: 500;
}

.bg-source-tab:focus-visible {
  outline: 2px solid var(--tk-cyan-500);
  outline-offset: 2px;
}

.form-range {
  width: 100%;
  height: 6px;
  -webkit-appearance: none;
  appearance: none;
  background: var(--video-bg);
  border-radius: 3px;
  outline: none;
  cursor: pointer;
}

.form-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 18px;
  height: 18px;
  background: var(--primary);
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid var(--card);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

.form-range::-moz-range-thumb {
  width: 18px;
  height: 18px;
  background: var(--primary);
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid var(--card);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

.form-range:focus-visible {
  outline: 2px solid var(--tk-cyan-500);
  outline-offset: 4px;
}

.bg-preview {
  height: 120px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.bg-preview-overlay {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 4px;
  padding: 16px;
  text-align: center;
}

.bubble-preview {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: var(--video-bg);
  border-radius: var(--radius-md);
}

.bubble-preview-item {
  padding: 8px 12px;
  max-width: 70%;
  font-size: 13px;
  transition: all 0.15s;
}

.bubble-preview-item.user-bubble {
  align-self: flex-end;
  background: var(--primary);
  color: var(--on-media);
}

.bubble-preview-item.assistant-bubble {
  align-self: flex-start;
  background: var(--card);
  color: var(--foreground);
  border: 1px solid var(--border);
}

.ui-custom-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.form-textarea {
  width: 100%;
  padding: 10px;
  font-size: 13px;
  font-family: var(--font-mono);
  color: var(--foreground);
  background: var(--video-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  outline: none;
  resize: vertical;
  line-height: 1.5;
}

.form-textarea:focus-visible {
  border-color: var(--tk-cyan-500);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--tk-cyan-500) 20%, transparent);
}

.custom-css-textarea {
  min-height: 160px;
  font-size: 12px;
}

/* ── F13 数据管理 ── */
.data-mgmt-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.data-mgmt-row {
  padding: 14px 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--card-elevated, var(--card));
}

.data-mgmt-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.data-mgmt-subtitle {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--foreground);
}

.data-mgmt-hint {
  margin: 0;
  font-size: 12px;
  color: var(--muted-foreground);
  line-height: 1.5;
}

.data-mgmt-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 4px;
}

.data-mgmt-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid var(--border);
  background: var(--card);
  color: var(--foreground);
  border-radius: var(--radius-md);
  font-size: 13px;
  cursor: pointer;
  transition: background-color 0.15s, border-color 0.15s;
}

.data-mgmt-btn:hover:not(:disabled) {
  background: var(--card-elevated);
  border-color: var(--tk-cyan-500);
}

.data-mgmt-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.data-mgmt-select-label {
  display: block;
}

.data-mgmt-select {
  height: 32px;
  padding: 0 28px 0 10px;
  font-size: 13px;
  color: var(--foreground);
  background: var(--video-bg, var(--card));
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  outline: none;
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
  min-width: 160px;
}

.data-mgmt-select:focus-visible {
  border-color: var(--tk-cyan-500);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--tk-cyan-500) 35%, transparent);
}

.hidden-file-input {
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

.visually-hidden {
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

/* 冲突策略 */
.conflict-strategy {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
  flex-wrap: wrap;
}

.strategy-label {
  font-size: 12px;
  color: var(--muted-foreground);
}

.strategy-option {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--foreground);
  cursor: pointer;
}

.strategy-option input[type='radio'] {
  margin: 0;
  cursor: pointer;
}

/* 导入结果 Modal */
.import-result {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.result-summary {
  margin: 0;
  font-size: 13px;
  color: var(--foreground);
}

.result-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.result-list li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  background: var(--card-elevated, var(--card));
  border-radius: var(--radius-sm);
  font-size: 12px;
}

.result-key {
  flex-shrink: 0;
  min-width: 64px;
  font-weight: 600;
  color: var(--foreground);
}

.result-value {
  flex: 1;
  color: var(--muted-foreground);
  font-family: var(--font-mono, monospace);
}

.result-errors {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 13px;
  color: var(--tk-red-500, #ef4444);
  font-weight: 500;
}

.error-list {
  list-style: none;
  margin: 0;
  padding: 8px 12px;
  background: color-mix(in srgb, var(--tk-red-500, #ef4444) 10%, transparent);
  border-radius: var(--radius-sm);
  border-left: 3px solid var(--tk-red-500, #ef4444);
  max-height: 200px;
  overflow-y: auto;
}

.error-list li {
  font-size: 12px;
  color: var(--foreground);
  line-height: 1.6;
  padding: 2px 0;
}

/* F12 扩展功能配置区块 */
.extension-security-note {
  margin: 0 0 12px;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-secondary);
  background: var(--surface-secondary);
}
.extension-block {
  padding: 16px;
  margin-bottom: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--card-elevated);
}

.extension-title {
  margin: 0 0 12px;
  font-size: 14px;
  font-weight: 600;
  color: var(--foreground);
}

.extension-block .form-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
  font-size: 13px;
  color: var(--foreground);
}

.extension-block .form-row > span {
  min-width: 100px;
  color: var(--muted-foreground);
}

.extension-block .form-row input[type='checkbox'] {
  margin: 0;
}

.extension-block .form-row input[type='range'] {
  flex: 1;
  max-width: 200px;
}

.extension-block .form-row input[type='number'],
.extension-block .form-row input[type='password'],
.extension-block .form-row select {
  flex: 1;
  max-width: 240px;
  padding: 6px 10px;
  font-size: 13px;
  background: var(--background);
  color: var(--foreground);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.extension-block .hint-text {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--muted-foreground);
  line-height: 1.5;
}

/* AC20 安全区块 */
.security-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--foreground);
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--secondary) 5%, transparent);
}

.security-status svg {
  color: var(--secondary);
  flex-shrink: 0;
}

.security-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

/* ── 第9条：本地模型统一管理 ── */

.provider-badge[data-provider='local'] {
  background: color-mix(in srgb, var(--tk-violet-500, #a78bfa) 20%, transparent);
  color: var(--tk-violet-500, #a78bfa);
}

.model-mgmt-tabs {
  margin-bottom: 12px;
}

.size-badge {
  display: inline-flex;
  align-items: center;
  padding: 1px 8px;
  font-size: 10px;
  font-weight: 600;
  border-radius: var(--radius-pill);
  background: var(--border);
  color: var(--muted-foreground);
}

.size-badge[data-size='small'] {
  background: color-mix(in srgb, var(--secondary) 18%, transparent);
  color: var(--secondary);
}

.size-badge[data-size='medium'] {
  background: color-mix(in srgb, var(--warning-fg, #f59e0b) 16%, transparent);
  color: var(--warning-fg, #f59e0b);
}

.size-badge[data-size='large'] {
  background: color-mix(in srgb, var(--tk-red-500, #ef4444) 14%, transparent);
  color: var(--tk-red-500, #ef4444);
}

.status-badge {
  display: inline-flex;
  align-items: center;
  padding: 1px 8px;
  font-size: 10px;
  font-weight: 600;
  border-radius: var(--radius-pill);
  background: var(--border);
  color: var(--muted-foreground);
}

.status-badge[data-status='loaded'] {
  background: color-mix(in srgb, var(--primary) 16%, transparent);
  color: var(--primary-fg);
}

.status-badge[data-status='loading'],
.status-badge[data-status='downloading'] {
  background: color-mix(in srgb, var(--warning-fg, #f59e0b) 16%, transparent);
  color: var(--warning-fg, #f59e0b);
}

.status-badge[data-status='error'] {
  background: color-mix(in srgb, var(--tk-red-500, #ef4444) 14%, transparent);
  color: var(--tk-red-500, #ef4444);
}

.profile-item.is-loaded {
  border-color: var(--primary);
  background: color-mix(in srgb, var(--primary) 6%, transparent);
}

.local-engine-box {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 12px 14px;
  margin-bottom: 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--card-elevated, var(--card));
}

.local-engine-status {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--foreground);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--border);
}

.status-dot.ok {
  background: var(--primary);
}

.status-dot.error {
  background: var(--tk-red-500, #ef4444);
}

.load-progress {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}

.progress-track {
  flex: 1;
  max-width: 220px;
  height: 6px;
  border-radius: var(--radius-pill);
  background: var(--border);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: var(--radius-pill);
  background: var(--primary);
  transition: width 0.2s ease;
}

.progress-text {
  font-size: 11px;
  color: var(--muted-foreground);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 260px;
}

.action-btn.danger {
  color: var(--tk-red-500, #ef4444);
  border-color: color-mix(in srgb, var(--tk-red-500, #ef4444) 45%, transparent);
}

.action-btn.danger:hover:not(:disabled) {
  background: color-mix(in srgb, var(--tk-red-500, #ef4444) 12%, transparent);
}

/* ── 窄屏：侧边栏转为顶部横向分类栏 ── */
@media (max-width: 760px) {
  .settings-view {
    flex-direction: column;
  }
  .settings-nav {
    width: auto;
    margin: 8px;
    max-height: none;
    position: static;
    overflow-x: auto;
    overflow-y: hidden;
  }
  .settings-nav-inner {
    display: flex;
    flex-direction: column;
  }
  .settings-nav-list {
    flex-direction: row;
    gap: 6px;
    overflow-x: auto;
    padding-bottom: 2px;
  }
  .settings-nav-item {
    flex: 0 0 auto;
    width: auto;
    padding: 8px 12px;
  }
  .settings-nav-item-desc {
    display: none;
  }
  .settings-body {
    padding: 16px;
    max-width: none;
  }
}
/* T-12: Profile 管理 */
.profile-create {
  display: flex;
  align-items: center;
  gap: 8px;
}

.profile-input {
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-secondary);
  color: var(--foreground);
  font-size: 13px;
  width: 200px;
}

.profile-input:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 1px;
}

/* T-06: 审计日志视图 */
.audit-log-body {
  max-height: 420px;
  overflow-y: auto;
}

.audit-empty {
  color: var(--muted-foreground);
  font-size: 13px;
  padding: 16px 0;
  text-align: center;
}

.audit-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.audit-item {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
  flex-wrap: wrap;
}

.audit-time {
  color: var(--muted-foreground);
  font-size: 12px;
  white-space: nowrap;
}

.audit-action {
  font-weight: 600;
  white-space: nowrap;
}

.audit-detail {
  color: var(--text-secondary);
  flex: 1;
  min-width: 120px;
}

.audit-result {
  font-size: 12px;
  font-weight: 600;
  padding: 1px 8px;
  border-radius: var(--radius-pill);
  white-space: nowrap;
}

.audit-ok {
  color: var(--green, #9ece6a);
  background: color-mix(in srgb, var(--green, #9ece6a) 12%, transparent);
}

.audit-blocked {
  color: var(--warning, #e0af68);
  background: color-mix(in srgb, var(--warning, #e0af68) 12%, transparent);
}

.audit-error {
  color: var(--danger, #f7768e);
  background: color-mix(in srgb, var(--danger, #f7768e) 12%, transparent);
}
</style>
