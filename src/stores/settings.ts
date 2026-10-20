import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type {
  ApiProfile,
  ThemeName,
  ChatBackground,
  BubbleStyle,
  QuickReplyButton,
  CustomTheme,
  ThinkingConfig,
  SamplingOverrides,
} from '@/types';
import type { StatusHudConfig } from '@core/status-schema';
import { DEFAULT_STATUS_HUD_CONFIG } from '@core/status-schema';
import type { PresetId } from '@core/creation-preset';
import type { NarrationPerspective } from '@core/narration';
import { DEFAULT_THINKING_CONFIG, DEFAULT_MAX_CONTEXT_TOKENS, DEFAULT_RESERVED_TOKENS } from '@/types';
import type { TTSConfig } from '@services/tts-service';
import { DEFAULT_TTS_CONFIG } from '@services/tts-service';
import type { TranslationConfig } from '@services/translator';
import { DEFAULT_TRANSLATION_CONFIG } from '@services/translator';
import type { SummarizationConfig } from '@core/summarizer';
import { DEFAULT_SUMMARIZATION_CONFIG } from '@core/summarizer';
import { createDefaultProviderConfig, type ImageProviderConfig } from '@core/image-generation';
import { getLocale, type Locale } from '@/i18n';
import { createAppearanceActions } from './settings/appearance';
import { createProfileActions } from './settings/profiles';
import { createSecurityActions } from './settings/security';
import { createPersistenceActions } from './settings/persistence';
import type { SettingsCtx } from './settings/ctx';

/**
 * Settings Store (Phase F)
 *
 * 职责：
 * 1. 全局主题切换（dark / light / midnight / oled）—— 实时应用到 <html data-theme>
 * 2. 全局字号档位（12 / 14 / 16 / 18 px）—— 实时应用到 <html style="font-size">
 * 3. API Profile CRUD（增删改查 + 切换激活）
 * 4. 设置项持久化到 IndexedDB（运行时由 App.vue 注入 StorageAdapter）
 * 5. F08.2 聊天背景 + 气泡样式配置（v1.1）
 * 6. F08.3 自定义 CSS 注入（v1.1）
 *
 * 主题 CSS 变量在 src/styles/themes.css 中定义，对应 [data-theme="dark"] 等。
 *
 * **R2-5 拆分**：本文件只做状态声明 + 装配 + 对外导出；具体行为在
 * `./settings/` 下的四个域模块里（外观 / 业务数据 / 安全 / 持久化）。
 * 各模块捕获的是**同一批 ref**，因此响应式边界与拆分前完全一致。
 */
export const useSettingsStore = defineStore('settings', () => {
  // ── 状态 ──
  const theme = ref<ThemeName>('dark');
  const fontSize = ref<number>(14);
  /** T-13：界面语言（与 i18n 模块 localeRef 同步，持久化到 AppSettings.locale） */
  // 初值向 i18n 要（它同步读过镜像/浏览器语言），否则 store 里的 'zh' 会与已渲染的语言不一致
  const locale = ref<Locale>(getLocale());
  const apiProfiles = ref<ApiProfile[]>([]);
  const activeApiProfileId = ref<string | null>(null);

  // F08.2 聊天背景配置（默认无背景）
  const chatBackground = ref<ChatBackground>({
    type: 'none',
    value: '',
    opacity: 1,
    blur: 0,
  });

  // F08.2 消息气泡样式（默认中等圆角 + 完全不透明）
  const bubbleStyle = ref<BubbleStyle>({
    radius: 16,
    opacity: 1,
  });

  // F08.3 自定义 CSS 代码（默认空）
  const customCss = ref<string>('');

  // F08.4 自定义主题（默认无）
  const customTheme = ref<CustomTheme | null>(null);

  // F12.2 TTS 配置（默认禁用）
  const ttsConfig = ref<TTSConfig>({ ...DEFAULT_TTS_CONFIG });

  // F12.3 翻译配置（默认禁用）
  const translationConfig = ref<TranslationConfig>({ ...DEFAULT_TRANSLATION_CONFIG });

  // F12.4 自动摘要配置（默认启用，阈值 4000 Token）
  const summarizationConfig = ref<SummarizationConfig>({ ...DEFAULT_SUMMARIZATION_CONFIG });

  /**
   * E22：图像生成的 Provider 配置。
   *
   * 唯一事实源放在这里（而不是图像页 store 的内存 ref），因为只有本 store 有
   * 持久化白名单与主密码加密分支；图像 store 改为读写这一份。
   */
  const imageGenConfig = ref<ImageProviderConfig>({ ...createDefaultProviderConfig() });

  // F11.3 Quick Reply 按钮列表（默认空）
  const quickReplies = ref<QuickReplyButton[]>([]);

  /**
   * P0-1 思维链全局偏好（默认：剥离历史思考 + 新消息折叠）
   * 属用户偏好而非角色人设，因此落全局而非角色级。
   */
  const thinkingConfig = ref<ThinkingConfig>({ ...DEFAULT_THINKING_CONFIG });

  /**
   * P0-3 全局采样默认值
   * 本轮**不提供 UI**，仅保留数据位与三档合并逻辑（角色级 ?? Profile 级 ?? 全局 ?? 不传）
   */
  const samplingDefaults = ref<SamplingOverrides | null>(null);

  /**
   * MODEL-03 创作模式（Preset）
   *
   * 面向创作意图的预设：把采样 + 上下文预算 + 输出约束打包为「自由/均衡/严谨」，
   * 同时保留高级自定义（`custom` = 不套用任何建议值）。
   * 仅作**建议层**：角色级 / Profile 级显式设置的参数仍优先。
   */
  const creationPreset = ref<PresetId>('balanced');

  /**
   * 心理活动（旁白段）里指代用户的代词：'me' = 「我」，'you' = 「你」。
   *
   * 这是**注入给模型的叙事规则**的一部分，不改写历史消息：切换后新的一条回复
   * 用新视角，之前生成的仍是旧视角（否则用户会看到自己的旧对话被人动过）。
   */
  const narrationPerspective = ref<NarrationPerspective>('me');

  /**
   * P1 角色状态栏全局偏好
   *
   * 语义沿用 §1.4「嗅探免费、注入授权」：`enabled`（是否要求模型产出状态块）默认
   * **false** —— 不默认改变模型行为；解析与渲染永远开启（模型自己输出了就白捡）。
   */
  const statusHudConfig = ref<StatusHudConfig>({ ...DEFAULT_STATUS_HUD_CONFIG });

  /**
   * 可折叠段的开合记忆（M7-d）：段标识 → 是否展开。
   * 只存"用户明确点过"的段；没点过的段由调用方给推导默认（如"没填的自动展开"）。
   */
  const uiSectionOpen = ref<Record<string, boolean>>({});

  /**
   * 上下文窗口 Token 上限（全局）
   *
   * 决定 prompt-builder 的历史裁剪预算：`预算 = maxContextTokens - reservedTokens`。
   * 接入大上下文模型（如 256K）时调大即可吃到优势；默认 8192 保持既有行为不变。
   */
  const maxContextTokens = ref<number>(DEFAULT_MAX_CONTEXT_TOKENS);

  /** 为模型回复预留的 Token 数（全局，默认 1024） */
  const reservedTokens = ref<number>(DEFAULT_RESERVED_TOKENS);

  /**
   * 可用上下文预算 = maxContextTokens - reservedTokens
   * 即"实际能装历史消息的量"，UI 实时展示给用户（钳制非负，防御脏数据）
   */
  const availableContextTokens = computed(() =>
    Math.max(0, maxContextTokens.value - reservedTokens.value)
  );

  // AC20 主密码会话管理（不持久化到存储层；仅运行时内存）
  // - masterPassword：仅运行时内存，刷新页面后需重新解锁
  // - masterPasswordVerifier：持久化到存储层，用于验证主密码正确性
  // - 解锁后所有 apiKey 在内存中保持明文，持久化时自动加密
  const masterPassword = ref<string>('');
  const masterPasswordVerifier = ref<string | null>(null);

  /** 是否已设置主密码（基于存储的 verifier 判断） */
  const hasMasterPassword = computed(() => masterPasswordVerifier.value !== null);

  /** 当前会话是否已解锁（masterPassword 已注入内存） */
  const isUnlocked = computed(() => masterPassword.value !== '');

  /** 当前激活的 API Profile（由 activeApiProfileId 派生，避免各调用方重复 find） */
  const activeProfile = computed<ApiProfile | null>(
    () => apiProfiles.value.find((p) => p.id === activeApiProfileId.value) ?? null
  );

  // 最近一次错误（UI 反馈用）
  const lastError = ref<string | null>(null);

  // ── 装配各域模块 ──

  /**
   * 共享上下文：所有子模块拿到的是**同一批 ref**。
   * `persistSettings` 先占位、由持久化模块回填 —— 外观/安全模块在工厂期就捕获了 ctx，
   * 但它们只在运行时调用它，那时回填已完成。
   */
  const ctx: SettingsCtx = {
    theme,
    fontSize,
    locale,
    chatBackground,
    bubbleStyle,
    customCss,
    customTheme,
    apiProfiles,
    activeApiProfileId,
    ttsConfig,
    translationConfig,
    imageGenConfig,
    summarizationConfig,
    quickReplies,
    thinkingConfig,
    samplingDefaults,
    creationPreset,
    narrationPerspective,
    statusHudConfig,
    uiSectionOpen,
    maxContextTokens,
    reservedTokens,
    masterPassword,
    masterPasswordVerifier,
    lastError,
    persistSettings: () => Promise.resolve(),
  };

  const appearance = createAppearanceActions(ctx);
  const profiles = createProfileActions(ctx);
  const security = createSecurityActions(ctx);
  const persistence = createPersistenceActions(ctx, {
    setTheme: appearance.setTheme,
    setFontSize: appearance.setFontSize,
    applyCustomCss: appearance.applyCustomCss,
    applyCustomTheme: appearance.applyCustomTheme,
    syncRemoteApiKeyState: security.syncRemoteApiKeyState,
  });
  // 回填真实实现：此后所有域的 `void persistSettings()` 都走串行队列
  ctx.persistSettings = persistence.persistSettings;

  return {
    // 状态
    theme,
    fontSize,
    locale,
    apiProfiles,
    activeApiProfileId,
    chatBackground,
    bubbleStyle,
    customCss,
    customTheme,
    // F12.2/F12.3/F12.4 配置
    ttsConfig,
    translationConfig,
    imageGenConfig,
    summarizationConfig,
    // F11.3 Quick Reply
    quickReplies,
    // P0-1 思维链偏好 / P0-3 全局采样默认值 / P1 状态栏偏好
    thinkingConfig,
    samplingDefaults,
    // MODEL-03 创作模式
    creationPreset,
    // 旁白人称（我 / 你）
    narrationPerspective,
    statusHudConfig,
    // M7-d 折叠段开合记忆
    uiSectionOpen,
    // 上下文长度配置
    maxContextTokens,
    reservedTokens,
    availableContextTokens,
    lastError,
    // AC20 主密码会话状态
    hasMasterPassword,
    isUnlocked,
    /** 当前激活 API Profile（派生） */
    activeProfile,
    // 主题 / 字号 / 语言
    setTheme: appearance.setTheme,
    setFontSize: appearance.setFontSize,
    setLocale: appearance.setLocale,
    // API Profile CRUD + 模型分类
    addApiProfile: profiles.addApiProfile,
    updateApiProfile: profiles.updateApiProfile,
    deleteApiProfile: profiles.deleteApiProfile,
    setActiveApiProfile: profiles.setActiveApiProfile,
    createProfileTemplate: profiles.createProfileTemplate,
    getModelsByCategory: profiles.getModelsByCategory,
    getPrimaryModel: profiles.getPrimaryModel,
    setPrimaryModel: profiles.setPrimaryModel,
    // F08.2 背景与气泡
    setChatBackground: appearance.setChatBackground,
    setBubbleStyle: appearance.setBubbleStyle,
    // F08.3 自定义 CSS
    setCustomCss: appearance.setCustomCss,
    resetCustomCss: appearance.resetCustomCss,
    applyCustomCss: appearance.applyCustomCss,
    // F08.4 自定义主题
    setCustomTheme: appearance.setCustomTheme,
    clearCustomTheme: appearance.clearCustomTheme,
    applyCustomTheme: appearance.applyCustomTheme,
    // F12.2/F12.3/F12.4 配置
    setTtsConfig: profiles.setTtsConfig,
    setTranslationConfig: profiles.setTranslationConfig,
    setImageGenConfig: profiles.setImageGenConfig,
    setSummarizationConfig: profiles.setSummarizationConfig,
    // F11.3 Quick Reply CRUD
    addQuickReply: profiles.addQuickReply,
    updateQuickReply: profiles.updateQuickReply,
    deleteQuickReply: profiles.deleteQuickReply,
    moveQuickReply: profiles.moveQuickReply,
    clearQuickReplies: profiles.clearQuickReplies,
    createQuickReplyTemplate: profiles.createQuickReplyTemplate,
    // P0-1 思维链偏好 / P0-3 全局采样默认值
    setThinkingConfig: profiles.setThinkingConfig,
    setSamplingDefaults: profiles.setSamplingDefaults,
    setCreationPreset: profiles.setCreationPreset,
    setNarrationPerspective: profiles.setNarrationPerspective,
    setStatusHudConfig: profiles.setStatusHudConfig,
    setUiSectionOpen: profiles.setUiSectionOpen,
    resetUiSectionOpen: profiles.resetUiSectionOpen,
    // 上下文长度配置
    setMaxContextTokens: profiles.setMaxContextTokens,
    setReservedTokens: profiles.setReservedTokens,
    // T-07: SillyTavern Quick Reply 格式互导
    exportQuickRepliesSt: profiles.exportQuickRepliesSt,
    importQuickRepliesSt: profiles.importQuickRepliesSt,
    // AC20 主密码会话管理
    setMasterPassword: security.setMasterPassword,
    unlock: security.unlock,
    lock: security.lock,
    changeMasterPassword: security.changeMasterPassword,
    // T-06：暴露会话主密码只读访问（仅运行时内存；供备份加密/解密使用）
    getSessionMasterPassword: () => masterPassword.value,
    restoreSession: security.restoreSession,
    decryptAllApiKeys: security.decryptAllApiKeys,
    // P1-4：远程向量密钥的加解密辅助（供设置页保存/回填远程配置时调用）
    encryptRemoteSecret: security.encryptRemoteSecret,
    decryptRemoteSecret: security.decryptRemoteSecret,
    // 持久化
    setStorageAdapter: persistence.setStorageAdapter,
    loadFromStorage: persistence.loadFromStorage,
    persistSettings: persistence.persistSettings,
    clearLastError: persistence.clearLastError,
  };
});
