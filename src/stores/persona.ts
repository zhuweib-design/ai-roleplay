import { t } from '@/i18n';
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Persona } from '@/types';
import type { StorageAdapter } from '@/storage/storage-adapter';
import { useSettingsStore } from './settings';
import type { ProtagonistConfig } from '@core/story-types';
import { buildProtagonistPrompt } from '@core/protagonist';

/**
 * Persona Store (迭代22 · F07)
 *
 * 职责：
 * 1. Persona 列表 CRUD（内存 + 持久化）
 * 2. 当前激活 Persona 状态管理（与 settings store.activePersonaId 同步）
 * 3. 默认 Persona 兜底：首次启动时自动创建名称 "User" 的默认 Persona
 * 4. {{user}} 宏替换值来源：activePersona.name
 *
 * 不负责：
 * - 设置持久化（由 settings store 负责 activePersonaId 字段）
 * - Lorebook persona scope 激活（由 chat store.collectLorebooksForCharacter 处理）
 */
export const usePersonaStore = defineStore('persona', () => {
  // ── 状态 ──
  const personas = ref<Persona[]>([]);
  const searchQuery = ref('');

  // 注入的存储适配器
  let storageAdapter: StorageAdapter | null = null;

  // 最近一次错误/提示
  const lastError = ref<string | null>(null);
  const lastInfo = ref<string | null>(null);

  // ── 计算属性 ──

  /** 当前激活的 Persona（从 settings store 读取 activePersonaId） */
  const activePersona = computed<Persona | null>(() => {
    const settings = useSettingsStore();
    if (!settings.activePersonaId) return null;
    return personas.value.find((p) => p.id === settings.activePersonaId) ?? null;
  });

  /** 用于 {{user}} 宏替换的用户名（无激活 Persona 时为 "User"） */
  const activeUserName = computed<string>(() => {
    return activePersona.value?.name ?? 'User';
  });

  /** 按搜索词过滤的 Persona 列表 */
  const filteredPersonas = computed(() => {
    const q = searchQuery.value.trim().toLowerCase();
    if (!q) return personas.value;
    return personas.value.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q)
    );
  });

  // ── 依赖注入 ──

  function setStorageAdapter(adapter: StorageAdapter | null): void {
    storageAdapter = adapter;
  }

  /**
   * 从存储层加载全部 Persona
   * 首次启动（无 Persona）时自动创建默认 "User" Persona
   */
  async function loadFromStorage(): Promise<void> {
    if (!storageAdapter) return;
    try {
      const list = await storageAdapter.loadPersonas();
      if (list.length > 0) {
        personas.value = list;
      } else {
        // 首次启动：创建默认 "User" Persona
        const defaultId = createDefaultPersona();
        const settings = useSettingsStore();
        settings.setActivePersona(defaultId);
      }
    } catch (err) {
      lastError.value = t('store.loadFailed', { name: ' Persona ', error: err instanceof Error ? err.message : String(err) });
    }
  }

  async function persistPersona(id: string): Promise<void> {
    if (!storageAdapter) return;
    const p = personas.value.find((x) => x.id === id);
    if (!p) return;
    try {
      p.updatedAt = new Date().toISOString();
      await storageAdapter.savePersona(p);
    } catch (err) {
      lastError.value = t('store.saveFailed', { name: ' Persona ', error: err instanceof Error ? err.message : String(err) });
    }
  }

  async function deleteFromStorage(id: string): Promise<void> {
    if (!storageAdapter) return;
    try {
      await storageAdapter.deletePersona(id);
    } catch (err) {
      lastError.value = t('store.deleteFailed', { name: ' Persona ', error: err instanceof Error ? err.message : String(err) });
    }
  }

  // ── 动作 ──

  function setSearchQuery(q: string): void {
    searchQuery.value = q;
  }

  /**
   * 创建默认 "User" Persona（仅内存对象，需调用 persistPersona 持久化）
   * @returns 新 Persona id
   */
  function createDefaultPersona(): string {
    const now = new Date().toISOString();
    const id = `persona-default-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const p: Persona = {
      id,
      name: 'User',
      description: '',
      createdAt: now,
      updatedAt: now,
    };
    personas.value.push(p);
    void persistPersona(id);
    return id;
  }

  /**
   * 新建 Persona
   * @returns 新 Persona id（验证失败返回空字符串）
   */
  function createPersona(input?: Partial<Pick<Persona, 'name' | 'description'>>): string {
    const id = `persona-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const now = new Date().toISOString();
    const p: Persona = {
      id,
      name: input?.name ?? t('store.newPersona'),
      description: input?.description ?? '',
      createdAt: now,
      updatedAt: now,
    };

    const errors = validatePersona(p);
    if (errors.length > 0) {
      lastError.value = t('persona.createFailed', { errors: errors.join('；') });
      return '';
    }

    personas.value.push(p);
    void persistPersona(id);
    lastInfo.value = t('persona.created2', { name: p.name });
    return id;
  }

  /**
   * 更新 Persona（patch 部分字段）
   */
  function updatePersona(
    id: string,
    patch: Partial<Pick<Persona, 'name' | 'description'>>
  ): boolean {
    const p = personas.value.find((x) => x.id === id);
    if (!p) return false;

    Object.assign(p, patch);

    const errors = validatePersona(p);
    if (errors.length > 0) {
      lastError.value = t('persona.updateFailed', { errors: errors.join('；') });
      return false;
    }

    void persistPersona(id);
    return true;
  }

  /**
   * 删除 Persona
   * - 至少保留 1 个 Persona（PRD F07.1 规则约束）
   * - 若删除的是当前激活，自动切换到第一个
   */
  function deletePersona(id: string): void {
    if (personas.value.length <= 1) {
      lastError.value = t('persona.keepOne');
      return;
    }
    const idx = personas.value.findIndex((p) => p.id === id);
    if (idx < 0) return;
    const removed = personas.value.splice(idx, 1)[0];
    void deleteFromStorage(id);

    // 若删除的是当前激活，切换到第一个
    const settings = useSettingsStore();
    if (settings.activePersonaId === id) {
      settings.setActivePersona(personas.value[0]?.id ?? null);
    }
    lastInfo.value = t('persona.deleted2', { name: removed.name });
  }

  /**
   * 设置当前激活的 Persona
   * @param id Persona ID（null 表示使用默认 "User" 名）
   */
  function setActivePersona(id: string | null): void {
    const settings = useSettingsStore();
    settings.setActivePersona(id);
    if (id) {
      const p = personas.value.find((x) => x.id === id);
      if (p) {
        lastInfo.value = t('persona.switched', { name: p.name });
      }
    } else {
      lastInfo.value = t('persona.switchedDefault');
    }
  }

  function clearLastError(): void {
    lastError.value = null;
    lastInfo.value = null;
  }

  // ── F16.3 故事主角 Persona ──

  /**
   * 从主角配置创建"故事主角"Persona
   *
   * PRD F16.3 规则约束：主角信息通过 F07 Persona 系统管理（自动创建一个"故事主角"Persona）。
   * Persona 名称使用主角名，描述拼接主角身份/起始场景/关系等结构化信息。
   * 创建后不自动激活（由 UI 决定是否切换）。
   *
   * @param config 主角配置
   * @returns 新 Persona id（校验失败返回空字符串）
   */
  function createStoryProtagonistPersona(config: ProtagonistConfig): string {
    const id = `persona-story-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const now = new Date().toISOString();

    // 构建描述：在用户原始描述基础上拼接结构化提示词片段
    const promptFragment = buildProtagonistPrompt(config);
    const description = promptFragment || config.description || '';

    const p: Persona = {
      id,
      name: config.name,
      description,
      createdAt: now,
      updatedAt: now,
    };

    const errors = validatePersona(p);
    if (errors.length > 0) {
      lastError.value = t('persona.protagonistCreateFailed', { errors: errors.join('；') });
      return '';
    }

    personas.value.push(p);
    void persistPersona(id);
    lastInfo.value = t('persona.protagonistCreated', { name: p.name });
    return id;
  }

  return {
    // 状态
    personas,
    searchQuery,
    lastError,
    lastInfo,
    // 计算属性
    activePersona,
    activeUserName,
    filteredPersonas,
    // 依赖注入
    setStorageAdapter,
    loadFromStorage,
    persistPersona,
    deleteFromStorage,
    // 动作
    setSearchQuery,
    createPersona,
    updatePersona,
    deletePersona,
    setActivePersona,
    // F16.3 故事主角 Persona
    createStoryProtagonistPersona,
    clearLastError,
  };
});

// ── 工具函数 ──

/** Persona 名称最大长度（PRD F07.1 规则约束） */
export const MAX_PERSONA_NAME_LENGTH = 30;

/** Persona 描述建议最大长度（PRD F07.1 规则约束，软限制） */
export const MAX_PERSONA_DESCRIPTION_LENGTH = 500;

/**
 * 验证 Persona，返回错误消息数组（空表示通过）
 */
export function validatePersona(p: Partial<Persona>): string[] {
  const errors: string[] = [];

  if (!p.name || p.name.trim() === '') {
    errors.push(t('persona.nameRequired'));
  } else if (p.name.length > MAX_PERSONA_NAME_LENGTH) {
    errors.push(t('persona.nameTooLong', { max: MAX_PERSONA_NAME_LENGTH }));
  }

  if (p.description && p.description.length > MAX_PERSONA_DESCRIPTION_LENGTH * 2) {
    errors.push(t('persona.descTooLong', { max: MAX_PERSONA_DESCRIPTION_LENGTH }));
  }

  return errors;
}
