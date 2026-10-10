/**
 * Random Events Store (F17.3, v1.1 新增)
 *
 * 职责：
 * 1. 事件模板 CRUD（增删改查）
 * 2. 场景级配置管理（每场景独立开关与参数覆盖）
 * 3. 生成器全局配置
 * 4. 生成结果记录与反馈收集
 * 5. 统计与概率自适应（基于反馈调整模板概率）
 *
 * 持久化策略：当前为内存维护，与 events store 一致。
 * 后续可序列化到 Lorebook 扩展字段或 settings 进行持久化。
 */
import { t } from '@/i18n';
import { defineStore } from 'pinia';
import { wrapSnapshot, unwrapSnapshot } from '../storage/snapshot-migration';
import type { StorageAdapter } from '../storage/storage-adapter';
import { ref, computed } from 'vue';
import {
  type RandomEventTemplate,
  type RandomEventSceneConfig,
  type RandomEventGeneratorConfig,
  type RandomEventResult,
  type RandomEventFeedback,
  type RandomEventCategory,
  type RandomEventSeverity,
  type RandomEventStats,
  type RandomEventDecision,
  createRandomEventTemplate,
  updateRandomEventTemplate,
  validateRandomEventTemplate,
  createDefaultSceneConfig,
  validateSceneConfig,
  createDefaultGeneratorConfig,
  decideRandomEvent,
  computeRandomEventStats,
  applyFeedbackToResult,
  adjustProbabilityByFeedback,
} from '@core/random-event-generator';

export const useRandomEventsStore = defineStore('randomEvents', () => {
  // ── 状态 ──

  /** 事件模板列表 */
  const templates = ref<RandomEventTemplate[]>([]);

  /** 场景级配置（按 sceneName 索引） */
  const sceneConfigs = ref<Map<string, RandomEventSceneConfig>>(new Map());
  /** 生成器全局配置 */
  const generatorConfig = ref<RandomEventGeneratorConfig>(createDefaultGeneratorConfig());
  /** 生成结果历史 */
  const results = ref<RandomEventResult[]>([]);
  /** 最大历史记录数（避免内存无限增长） */
  const maxResultsHistory = 200;

  /** 错误/提示 */
  const lastError = ref<string | null>(null);
  const lastInfo = ref<string | null>(null);

  // ── 计算属性 ──

  /** 启用的模板 */
  const enabledTemplates = computed(() => templates.value.filter((t) => t.enabled));

  /** 全部场景配置（数组形式） */
  const sceneConfigList = computed(() => Array.from(sceneConfigs.value.values()));

  /** 统计 */
  const stats = computed<RandomEventStats>(() => computeRandomEventStats(results.value));

  // ── 模板 CRUD ──

  /**
   * 创建新模板
   * @param input 模板输入（必须包含 name 与 description）
   * @returns 新模板 id（失败返回 null）
   */
  function createTemplate(
    input: Parameters<typeof createRandomEventTemplate>[0]
  ): string | null {
    const tpl = createRandomEventTemplate(input);
    const errors = validateRandomEventTemplate(tpl);
    if (errors.length > 0) {
      lastError.value = errors.join('；');
      return null;
    }
    templates.value.push(tpl);
    lastInfo.value = t('re.tplCreated', { name: tpl.name });
    void persistNow();
    return tpl.id;
  }

  /**
   * 更新模板
   */
  function updateTemplate(
    id: string,
    patch: Parameters<typeof updateRandomEventTemplate>[1]
  ): boolean {
    const idx = templates.value.findIndex((t) => t.id === id);
    if (idx < 0) {
      lastError.value = t('re.tplNotFound');
      return false;
    }
    const merged = { ...templates.value[idx], ...patch };
    const errors = validateRandomEventTemplate(merged);
    if (errors.length > 0) {
      lastError.value = errors.join('；');
      return false;
    }
    templates.value[idx] = updateRandomEventTemplate(templates.value[idx]!, patch);
    lastInfo.value = t('re.tplUpdated', { name: templates.value[idx]!.name });
    void persistNow();
    return true;
  }

  /**
   * 删除模板
   */
  function deleteTemplate(id: string): boolean {
    const idx = templates.value.findIndex((t) => t.id === id);
    if (idx < 0) return false;
    const removed = templates.value.splice(idx, 1)[0]!;
    lastInfo.value = t('re.tplDeleted', { name: removed.name });
    void persistNow();
    return true;
  }

  /**
   * 按 ID 获取模板
   */
  function getTemplate(id: string): RandomEventTemplate | undefined {
    return templates.value.find((t) => t.id === id);
  }

  /**
   * 启用/禁用模板
   */
  function toggleTemplate(id: string, enabled?: boolean): boolean {
    const tpl = templates.value.find((t) => t.id === id);
    if (!tpl) {
      lastError.value = t('re.tplNotFound');
      return false;
    }
    const newState = enabled ?? !tpl.enabled;
    return updateTemplate(id, { enabled: newState });
  }

  // ── 场景配置 ──

  /**
   * 获取场景配置（不存在则返回 null）
   */
  function getSceneConfig(sceneName: string): RandomEventSceneConfig | null {
    return sceneConfigs.value.get(sceneName) ?? null;
  }

  /**
   * 获取或创建场景配置（不存在则创建默认配置）
   */
  function getOrCreateSceneConfig(sceneName: string): RandomEventSceneConfig {
    let cfg = sceneConfigs.value.get(sceneName);
    if (!cfg) {
      cfg = createDefaultSceneConfig(sceneName);
      sceneConfigs.value.set(sceneName, cfg);
    }
    return cfg;
  }

  /**
   * 更新场景配置（不存在则创建）
   */
  function updateSceneConfig(
    sceneName: string,
    patch: Partial<Omit<RandomEventSceneConfig, 'sceneName'>>
  ): boolean {
    const existing = getOrCreateSceneConfig(sceneName);
    const merged: RandomEventSceneConfig = { ...existing, ...patch, sceneName };
    const errors = validateSceneConfig(merged);
    if (errors.length > 0) {
      lastError.value = errors.join('；');
      return false;
    }
    sceneConfigs.value.set(sceneName, merged);
    lastInfo.value = t('re.sceneUpdated2', { name: sceneName });
    void persistNow();
    return true;
  }

  /**
   * 启用/禁用场景的随机事件
   */
  function toggleScene(sceneName: string, enabled?: boolean): boolean {
    const cfg = getOrCreateSceneConfig(sceneName);
    const newState = enabled ?? !cfg.enabled;
    return updateSceneConfig(sceneName, { enabled: newState });
  }

  /**
   * 删除场景配置
   */
  function deleteSceneConfig(sceneName: string): boolean {
    if (!sceneConfigs.value.has(sceneName)) return false;
    sceneConfigs.value.delete(sceneName);
    lastInfo.value = t('re.sceneDeleted2', { name: sceneName });
    void persistNow();
    return true;
  }

  // ── 生成器配置 ──

  /**
   * 更新生成器配置
   */
  function updateGeneratorConfig(
    patch: Partial<RandomEventGeneratorConfig>
  ): void {
    generatorConfig.value = { ...generatorConfig.value, ...patch };
    lastInfo.value = t('re.genConfigUpdated');
    void persistNow();
  }

  /**
   * 启用/禁用生成器
   */
  function toggleGenerator(enabled?: boolean): void {
    const newState = enabled ?? !generatorConfig.value.enabled;
    updateGeneratorConfig({ enabled: newState });
  }

  // ── 生成决策 ──

  /**
   * 决策本轮是否触发随机事件
   *
   * @param sceneName 当前场景名
   * @param recentMessages 最近对话消息
   * @returns 决策结果
   */
  function decide(
    sceneName: string,
    recentMessages: string[]
  ): RandomEventDecision {
    const now = Date.now();
    const sceneCfg = getSceneConfig(sceneName);
    return decideRandomEvent(
      generatorConfig.value,
      sceneCfg,
      templates.value,
      sceneName,
      recentMessages,
      now
    );
  }

  // ── 结果记录与反馈 ──

  /**
   * 记录生成结果
   *
   * @param result 生成结果
   */
  function recordResult(result: RandomEventResult): void {
    results.value.push(result);
    // 限制历史长度
    if (results.value.length > maxResultsHistory) {
      results.value.splice(0, results.value.length - maxResultsHistory);
    }

    // 更新模板的 triggerCount 与 lastTriggeredAt
    if (result.templateId) {
      const tpl = templates.value.find((t) => t.id === result.templateId);
      if (tpl) {
        tpl.triggerCount += 1;
        tpl.lastTriggeredAt = result.generatedAt;
        tpl.updatedAt = result.generatedAt;
      }
    }

    // 更新生成器的 lastGeneratedAt
    generatorConfig.value.lastGeneratedAt = result.generatedAt;
    void persistNow();
  }

  // ── D-9（REAL_DEVICE_TEST_2026-10-03）：随机事件持久化 ──
  // 原实现全部状态只在内存（刷新即丢且不进备份）。挂到存储适配器的快照通道，
  // 与本地记忆 / 群聊待提交回合同一机制（MIG-01 版本信封）。
  const RANDOM_EVENTS_SNAPSHOT_KEY = 'random-events:store:v1';
  const RANDOM_EVENTS_SCHEMA_VERSION = 1;
  let storageAdapter: Pick<StorageAdapter, 'loadSnapshot' | 'saveSnapshot'> | null = null;
  let loaded = false;
  /**
   * 首帧加载的在飞 promise。随机事件 store 是**整份快照**写入（模板、场景配置、生成器
   * 设置、结果集一次全写），所以加载没落地前的任何写入都会把"还没读到存档的内存"落盘，
   * 抹掉已有的模板与历史 —— 与 M9-a 的设置 store 同一类，机制也同一套：排队到加载之后。
   */
  let loadInFlight: Promise<void> | null = null;
  /** 加载窗口内生成器配置的"改前 / 想改成"两份视图（M9-c 的以用户为准那一半） */
  let configAtLoadStart: Partial<RandomEventGeneratorConfig> | null = null;
  let configWantedDuringLoad: Partial<RandomEventGeneratorConfig> | null = null;
  /** 回写用户改动时发起的写入，不能再等加载（否则等的是它自己） */
  let applyingUserConfig = false;

  function setStorageAdapter(adapter: Pick<StorageAdapter, 'loadSnapshot' | 'saveSnapshot'> | null): void {
    storageAdapter = adapter;
    loaded = false;
  }

  async function loadFromStorage(): Promise<void> {
    if (!storageAdapter || loaded) return;
    if (!loadInFlight) {
      configAtLoadStart = { ...generatorConfig.value };
      loadInFlight = (async () => {
        await applyLoadedSnapshot();
        // 存档落地后把用户在窗口里改过的那几项配置重新应用，否则他刚拨的开关被静默抹掉
        const keep = keepUserConfigDuringLoad();
        if (keep) {
          applyingUserConfig = true;
          try {
            generatorConfig.value = { ...generatorConfig.value, ...keep };
            await persistNow();
          } finally {
            applyingUserConfig = false;
          }
        }
      })().finally(() => {
        loadInFlight = null;
        configAtLoadStart = null;
        configWantedDuringLoad = null;
      });
    }
    return loadInFlight;
  }

  /** 用户在加载窗口里改过的那几项生成器配置（只比标量项，模板/结果集仍以存档为准） */
  function keepUserConfigDuringLoad(): Partial<RandomEventGeneratorConfig> | null {
    if (!configWantedDuringLoad || !configAtLoadStart) return null;
    const keep: Partial<RandomEventGeneratorConfig> = {};
    for (const [key, value] of Object.entries(configWantedDuringLoad)) {
      if (value !== (configAtLoadStart as Record<string, unknown>)[key]) {
        (keep as Record<string, unknown>)[key] = value;
      }
    }
    return Object.keys(keep).length > 0 ? keep : null;
  }

  async function applyLoadedSnapshot(): Promise<void> {
    if (!storageAdapter) return;
    try {
      const raw = await storageAdapter.loadSnapshot<unknown>(RANDOM_EVENTS_SNAPSHOT_KEY);
      if (raw !== null) {
        const { data } = unwrapSnapshot(raw);
        const d = (data ?? {}) as {
          templates?: RandomEventTemplate[];
          sceneConfigs?: RandomEventSceneConfig[];
          generatorConfig?: RandomEventGeneratorConfig;
          results?: RandomEventResult[];
        };
        templates.value = Array.isArray(d.templates) ? d.templates : [];
        sceneConfigs.value = new Map(
          (Array.isArray(d.sceneConfigs) ? d.sceneConfigs : [])
            .filter((sc) => sc && typeof sc.sceneName === 'string')
            .map((sc) => [sc.sceneName, sc]),
        );
        if (d.generatorConfig && typeof d.generatorConfig === 'object') {
          generatorConfig.value = { ...createDefaultGeneratorConfig(), ...d.generatorConfig };
        }
        results.value = Array.isArray(d.results) ? d.results : [];
      }
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error);
    } finally {
      loaded = true;
    }
  }

  async function persistNow(): Promise<void> {
    if (!storageAdapter) return;
    // 加载在飞时先等它落地，避免用"空快照 + 这一次改动"覆盖已有模板与历史
    if (loadInFlight && !applyingUserConfig) {
      configWantedDuringLoad ??= { ...generatorConfig.value };
      return loadInFlight.then(() => persistNow());
    }
    try {
      await storageAdapter.saveSnapshot(
        RANDOM_EVENTS_SNAPSHOT_KEY,
        wrapSnapshot(
          {
            templates: templates.value,
            sceneConfigs: Array.from(sceneConfigs.value.values()),
            generatorConfig: generatorConfig.value,
            results: results.value,
          },
          RANDOM_EVENTS_SCHEMA_VERSION,
        ),
      );
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error);
    }
  }

  /** 备份导出载荷（备份通道此前完全不含随机事件，见 D-9） */
  function exportBackupData() {
    return {
      templates: [...templates.value],
      sceneConfigs: Array.from(sceneConfigs.value.values()),
      generatorConfig: { ...generatorConfig.value },
      results: [...results.value],
    };
  }

  /** 备份导入回写（调用方从备份 JSON 读出后调用） */
  function applyBackupData(payload: {
    templates?: unknown;
    sceneConfigs?: unknown;
    generatorConfig?: unknown;
    results?: unknown;
  }): void {
    templates.value = Array.isArray(payload.templates)
      ? (payload.templates as RandomEventTemplate[])
      : templates.value;
    if (Array.isArray(payload.sceneConfigs)) {
      sceneConfigs.value = new Map(
        (payload.sceneConfigs as RandomEventSceneConfig[])
          .filter((sc) => sc && typeof sc.sceneName === 'string').map((sc) => [sc.sceneName, sc]),
      );
    }
    if (payload.generatorConfig && typeof payload.generatorConfig === 'object') {
      generatorConfig.value = { ...createDefaultGeneratorConfig(), ...(payload.generatorConfig as RandomEventGeneratorConfig) };
    }
    results.value = Array.isArray(payload.results)
      ? (payload.results as RandomEventResult[])
      : results.value;
    void persistNow();
  }

  /**
   * 对结果应用反馈
   *
   * @param resultId 结果 ID
   * @param feedback 反馈类型
   * @param note 备注（可选）
   * @returns 是否成功
   */
  function applyFeedback(
    resultId: string,
    feedback: RandomEventFeedback,
    note?: string
  ): boolean {
    const idx = results.value.findIndex((r) => r.id === resultId);
    if (idx < 0) {
      lastError.value = t('re.resultNotFound');
      return false;
    }
    results.value[idx] = applyFeedbackToResult(results.value[idx]!, feedback, note);

    // 若关联模板，根据反馈调整模板概率
    if (results.value[idx]!.templateId) {
      const tpl = templates.value.find((t) => t.id === results.value[idx]!.templateId);
      if (tpl) {
        const newProb = adjustProbabilityByFeedback(
          tpl,
          feedback,
          generatorConfig.value.feedbackAdjustStep
        );
        tpl.probability = newProb;
        tpl.updatedAt = new Date().toISOString();
        lastInfo.value = t('re.probAdjusted', { name: tpl.name, prob: newProb });
      }
    }

    return true;
  }

  /**
   * 清空结果历史
   */
  function clearResults(): void {
    results.value = [];
    lastInfo.value = t('re.historyCleared2');
  }

  // ── 重置 ──

  /**
   * 重置整个 store（用于切换 Lorebook 等场景）
   */
  function resetAll(): void {
    templates.value = [];
    sceneConfigs.value.clear();
    generatorConfig.value = createDefaultGeneratorConfig();
    results.value = [];
    lastError.value = null;
    lastInfo.value = null;
  }

  function clearLastError(): void {
    lastError.value = null;
    lastInfo.value = null;
  }

  // ── 类别与严重度常量（便于 UI 使用） ──

  const CATEGORY_OPTIONS: Array<{ value: RandomEventCategory; label: string }> = [
    { value: 'encounter', label: t('re.catEncounter') },
    { value: 'discovery', label: t('re.catDiscovery') },
    { value: 'combat', label: t('re.catCombat') },
    { value: 'social', label: t('re.catSocial') },
    { value: 'environment', label: t('re.catEnvironment') },
    { value: 'mystery', label: t('re.catMystery') },
    { value: 'custom', label: t('re.catCustom') },
  ];

  const SEVERITY_OPTIONS: Array<{ value: RandomEventSeverity; label: string }> = [
    { value: 'trivial', label: t('re.sevTrivial') },
    { value: 'minor', label: t('re.sevMinor') },
    { value: 'moderate', label: t('re.sevModerate') },
    { value: 'major', label: t('re.sevMajor') },
    { value: 'critical', label: t('re.sevCritical') },
  ];

  return {
    // 状态
    templates,
    sceneConfigs,
    generatorConfig,
    results,
    lastError,
    lastInfo,
    // D-9 持久化
    setStorageAdapter,
    loadFromStorage,
    exportBackupData,
    applyBackupData,
    // 计算属性
    enabledTemplates,
    sceneConfigList,
    stats,
    // 常量
    CATEGORY_OPTIONS,
    SEVERITY_OPTIONS,
    // 模板 CRUD
    createTemplate,
    updateTemplate,
    deleteTemplate,
    getTemplate,
    toggleTemplate,
    // 场景配置
    getSceneConfig,
    getOrCreateSceneConfig,
    updateSceneConfig,
    toggleScene,
    deleteSceneConfig,
    // 生成器配置
    updateGeneratorConfig,
    toggleGenerator,
    // 生成决策
    decide,
    // 结果与反馈
    recordResult,
    applyFeedback,
    clearResults,
    // 重置
    resetAll,
    clearLastError,
  };
});
