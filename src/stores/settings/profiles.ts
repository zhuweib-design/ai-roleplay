import { t as i18nT } from '@/i18n';
import {
  normalizeNarrationPerspective,
  type NarrationPerspective,
} from '@core/narration';
import { normalizePresetId } from '@core/creation-preset';
import { normalizeStatusHudConfig, type StatusHudConfig } from '@core/status-schema';
import { exportQuickRepliesToStJson, importQuickRepliesFromSt } from '@core/st-compat';
import type { SaveOutcome } from '@/utils/save-blob';
import { saveBlob } from '@/utils/save-blob';
import type {
  ApiProfile,
  ModelCategory,
  QuickReplyButton,
  SamplingOverrides,
  ThinkingConfig,
} from '@/types';
import type { TTSConfig } from '@services/tts-service';
import type { TranslationConfig } from '@services/translator';
import type { SummarizationConfig } from '@core/summarizer';
import type { ImageProviderConfig } from '@core/image-generation';
import { generateProfileId, generateQuickReplyId, normalizeSamplingDefaults } from './normalize';
import type { SettingsCtx } from './ctx';

/**
 * R2-5：业务数据域（API Profile / 模型分类 / 各类配置 / Quick Reply / 偏好开关）。
 */

export function createProfileActions(ctx: SettingsCtx) {
  // ── API Profile CRUD ──

  /** 添加一个 API Profile（持久化） */
  function addApiProfile(profile: ApiProfile) {
    ctx.apiProfiles.value.push(profile);
    // 若当前无激活，自动激活第一个
    if (ctx.activeApiProfileId.value === null) {
      ctx.activeApiProfileId.value = profile.id;
    }
    void ctx.persistSettings();
  }

  /** 更新 API Profile（patch 合并） */
  function updateApiProfile(id: string, patch: Partial<ApiProfile>) {
    const profile = ctx.apiProfiles.value.find((p) => p.id === id);
    if (profile) {
      Object.assign(profile, patch);
      void ctx.persistSettings();
    }
  }

  /**
   * 删除 API Profile
   * - 若删除的是当前激活的，自动切换到第一个（若无则置 null）
   */
  function deleteApiProfile(id: string) {
    const idx = ctx.apiProfiles.value.findIndex((p) => p.id === id);
    if (idx < 0) return;
    ctx.apiProfiles.value.splice(idx, 1);
    if (ctx.activeApiProfileId.value === id) {
      ctx.activeApiProfileId.value = ctx.apiProfiles.value[0]?.id ?? null;
    }
    void ctx.persistSettings();
  }

  /** 设置当前激活的 API Profile（null 表示未配置） */
  function setActiveApiProfile(id: string | null) {
    ctx.activeApiProfileId.value = id;
    void ctx.persistSettings();
  }

  /**
   * 生成一个新的 ApiProfile（仅内存对象，需手动调用 addApiProfile 持久化）
   */
  function createProfileTemplate(): ApiProfile {
    return {
      id: generateProfileId(),
      name: i18nT('app.newProfileName'),
      provider: 'openai',
      baseUrl: 'https://api.openai.com',
      apiKey: '',
      model: 'gpt-4o',
      category: 'chat',
      isPrimary: false,
    };
  }

  // ── 需求3：模型分类管理 ──

  /** 按分类获取模型列表（未设置 category 的视为 'chat'） */
  function getModelsByCategory(category: ModelCategory): ApiProfile[] {
    return ctx.apiProfiles.value.filter((p) => (p.category ?? 'chat') === category);
  }

  /** 获取某分类的主模型（isPrimary=true 的第一个；若无则返回该分类第一个） */
  function getPrimaryModel(category: ModelCategory): ApiProfile | null {
    const list = getModelsByCategory(category);
    if (list.length === 0) return null;
    return list.find((p) => p.isPrimary) ?? list[0]!;
  }

  /**
   * 设置某分类的主模型
   * - 将该分类下其他模型的 isPrimary 置 false
   * - 将目标模型 isPrimary 置 true
   * - 若目标 category 未设置，自动补为传入分类
   */
  function setPrimaryModel(id: string, category: ModelCategory): void {
    const target = ctx.apiProfiles.value.find((p) => p.id === id);
    if (!target) return;
    // 清除同分类其他模型的主模型标记
    for (const p of ctx.apiProfiles.value) {
      if ((p.category ?? 'chat') === category && p.id !== id) {
        p.isPrimary = false;
      }
    }
    target.category = category;
    target.isPrimary = true;
    void ctx.persistSettings();
  }

  // ── F12.2 / F12.3 / F12.4 / E22 配置 ──

  /** 设置 TTS 配置（F12.2） */
  function setTtsConfig(config: Partial<TTSConfig>): void {
    ctx.ttsConfig.value = { ...ctx.ttsConfig.value, ...config };
    void ctx.persistSettings();
  }

  /** 设置翻译配置（F12.3） */
  function setTranslationConfig(config: Partial<TranslationConfig>): void {
    ctx.translationConfig.value = { ...ctx.translationConfig.value, ...config };
    void ctx.persistSettings();
  }

  /**
   * E22：图像生成 Provider 的唯一写入口（图像页 store 走这里）。
   * 与 setTranslationConfig 同口径：改内存 + 立即排队落盘。
   */
  function setImageGenConfig(config: Partial<ImageProviderConfig>): void {
    ctx.imageGenConfig.value = { ...ctx.imageGenConfig.value, ...config };
    void ctx.persistSettings();
  }

  /** 设置自动摘要配置（F12.4） */
  function setSummarizationConfig(config: Partial<SummarizationConfig>): void {
    ctx.summarizationConfig.value = { ...ctx.summarizationConfig.value, ...config };
    void ctx.persistSettings();
  }

  // ── F11.3 Quick Reply CRUD ──

  /**
   * 添加 Quick Reply 按钮
   * @returns 新按钮的 id
   */
  function addQuickReply(button: QuickReplyButton): string {
    ctx.quickReplies.value.push(button);
    void ctx.persistSettings();
    return button.id;
  }

  /** 更新 Quick Reply 按钮（patch 合并） */
  function updateQuickReply(id: string, patch: Partial<QuickReplyButton>): void {
    const btn = ctx.quickReplies.value.find((b) => b.id === id);
    if (btn) {
      Object.assign(btn, patch);
      void ctx.persistSettings();
    }
  }

  /** 删除 Quick Reply 按钮 */
  function deleteQuickReply(id: string): void {
    const idx = ctx.quickReplies.value.findIndex((b) => b.id === id);
    if (idx < 0) return;
    ctx.quickReplies.value.splice(idx, 1);
    void ctx.persistSettings();
  }

  /**
   * 移动 Quick Reply 按钮顺序
   * @param id 按钮 id
   * @param direction -1 上移 / +1 下移
   */
  function moveQuickReply(id: string, direction: -1 | 1): void {
    const idx = ctx.quickReplies.value.findIndex((b) => b.id === id);
    if (idx < 0) return;
    const target = idx + direction;
    if (target < 0 || target >= ctx.quickReplies.value.length) return;
    const list = ctx.quickReplies.value;
    [list[idx]!, list[target]!] = [list[target]!, list[idx]!];
    void ctx.persistSettings();
  }

  /** 清空所有 Quick Reply 按钮 */
  function clearQuickReplies(): void {
    ctx.quickReplies.value = [];
    void ctx.persistSettings();
  }

  /** 工厂方法：生成新的 Quick Reply 按钮模板（仅内存对象） */
  function createQuickReplyTemplate(): QuickReplyButton {
    return {
      id: generateQuickReplyId(),
      label: i18nT('app.newButtonLabel'),
      script: '/echo hello',
      group: '',
      autoSend: true,
    };
  }

  // ── T-07: SillyTavern Quick Reply 格式互导 ──

  /**
   * 导出全部 Quick Reply 为 ST JSON 给用户存盘
   *
   * 返回 'cancelled' 时调用方不得报"已导出"（用户在系统保存面板里取消了）
   */
  function exportQuickRepliesSt(): Promise<SaveOutcome> {
    const json = exportQuickRepliesToStJson(ctx.quickReplies.value);
    return saveBlob(`quick-replies-ST.json`, () => new Blob([json], { type: 'application/json' }));
  }

  /** 从 ST Quick Reply JSON 导入（追加到现有列表，label 冲突自动去重） */
  async function importQuickRepliesSt(file: File): Promise<number> {
    const text = await file.text();
    const json: unknown = JSON.parse(text);
    const buttons = importQuickRepliesFromSt(json);
    const existingLabels = new Set(ctx.quickReplies.value.map((b) => b.label));
    let added = 0;
    for (const btn of buttons) {
      if (existingLabels.has(btn.label)) continue; // 去重
      existingLabels.add(btn.label);
      ctx.quickReplies.value.push(btn);
      added++;
    }
    if (added > 0) void ctx.persistSettings();
    return added;
  }

  // ── 偏好开关 ──

  /**
   * P0-1：更新思维链偏好（局部 patch，未给字段保持原值）
   * 调用方负责在需要落盘时调用 persistSettings()
   */
  function setThinkingConfig(patch: Partial<ThinkingConfig>): void {
    ctx.thinkingConfig.value = { ...ctx.thinkingConfig.value, ...patch };
  }

  /**
   * P0-3：更新全局采样默认值（传 null 清空 = 全部走供应商默认）
   * 本轮无 UI，仅保留数据位与合并逻辑供后续接入
   */
  function setSamplingDefaults(value: SamplingOverrides | null): void {
    ctx.samplingDefaults.value = value ? normalizeSamplingDefaults(value) : null;
  }

  /**
   * MODEL-03：切换创作模式（Preset）
   * 非法值由 normalizePresetId 归一，避免脏数据进入持久化。
   */
  function setCreationPreset(value: unknown): void {
    ctx.creationPreset.value = normalizePresetId(value);
  }

  /** 切换旁白人称；非法值由 normalizeNarrationPerspective 归一，避免脏数据进持久化 */
  function setNarrationPerspective(value: unknown): void {
    ctx.narrationPerspective.value = normalizeNarrationPerspective(value) as NarrationPerspective;
  }

  /**
   * P1：更新状态栏全局偏好（局部 patch，未给字段保持原值）
   * 调用方负责在需要落盘时调用 persistSettings()
   */
  function setStatusHudConfig(patch: Partial<StatusHudConfig>): void {
    ctx.statusHudConfig.value = normalizeStatusHudConfig({ ...ctx.statusHudConfig.value, ...patch });
  }

  /**
   * M7-d：记住某个可折叠段的开合。
   *
   * 自己排队落盘（与其余 `void persistSettings()` 同一条串行队列，M2-b8 之后
   * 并发写不会倒置）。点一次折叠/展开就是一次写，不排队会丢最后一下。
   */
  function setUiSectionOpen(key: string, open: boolean): void {
    if (ctx.uiSectionOpen.value[key] === open) return;
    ctx.uiSectionOpen.value = { ...ctx.uiSectionOpen.value, [key]: open };
    void ctx.persistSettings();
  }

  /**
   * M8-b：清掉所有开合记忆，让各段回到自己的推导默认。
   *
   * 为什么需要：一次误点会让某段永远停在用户随手留下的状态，尤其是
   * "还没填就自动展开"这条规则——记忆优先之后它就不再生效了。
   * @returns 清掉的条数（调用方用它决定要不要提示）
   */
  function resetUiSectionOpen(): number {
    const count = Object.keys(ctx.uiSectionOpen.value).length;
    if (count === 0) return 0;
    ctx.uiSectionOpen.value = {};
    void ctx.persistSettings();
    return count;
  }

  // ── 上下文长度配置 ──

  /**
   * 设置上下文窗口 Token 上限。
   *
   * 校验：新值必须 **大于** 当前 reservedTokens，否则拒绝（返回 false）且
   * 不修改任何状态、不落盘 —— 因为 max ≤ reserved 时可用预算为 0，历史无法装入，
   * 属非法配置（这也是 UI 提示"必须大于预留值"的底层依据）。
   *
   * @param value 新的 maxContextTokens
   * @returns true=已应用并落盘；false=校验失败（未做任何修改）
   */
  function setMaxContextTokens(value: number): boolean {
    if (!Number.isFinite(value)) return false;
    const next = Math.floor(value);
    if (next <= ctx.reservedTokens.value) return false;
    ctx.maxContextTokens.value = next;
    void ctx.persistSettings();
    return true;
  }

  /**
   * 设置为回复预留的 Token 数。
   *
   * 校验：新值必须 **小于** 当前 maxContextTokens 且非负，否则拒绝（返回 false）
   * 且不修改任何状态、不落盘。
   *
   * @param value 新的 reservedTokens
   * @returns true=已应用并落盘；false=校验失败（未做任何修改）
   */
  function setReservedTokens(value: number): boolean {
    if (!Number.isFinite(value)) return false;
    const next = Math.floor(value);
    if (next < 0 || next >= ctx.maxContextTokens.value) return false;
    ctx.reservedTokens.value = next;
    void ctx.persistSettings();
    return true;
  }

  return {
    addApiProfile,
    updateApiProfile,
    deleteApiProfile,
    setActiveApiProfile,
    createProfileTemplate,
    getModelsByCategory,
    getPrimaryModel,
    setPrimaryModel,
    setTtsConfig,
    setTranslationConfig,
    setImageGenConfig,
    setSummarizationConfig,
    addQuickReply,
    updateQuickReply,
    deleteQuickReply,
    moveQuickReply,
    clearQuickReplies,
    createQuickReplyTemplate,
    exportQuickRepliesSt,
    importQuickRepliesSt,
    setThinkingConfig,
    setSamplingDefaults,
    setCreationPreset,
    setNarrationPerspective,
    setStatusHudConfig,
    setUiSectionOpen,
    resetUiSectionOpen,
    setMaxContextTokens,
    setReservedTokens,
  };
}
