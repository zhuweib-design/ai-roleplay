import { defineStore } from 'pinia';
import { ref, computed, toRaw } from 'vue';
import type {
  ApiProfile,
  ThemeName,
  ChatBackground,
  BubbleStyle,
  QuickReplyButton,
  ModelCategory,
  CustomTheme,
  ThinkingConfig,
  SamplingOverrides,
} from '@/types';
import type { StatusHudConfig } from '@core/status-schema';
import { DEFAULT_STATUS_HUD_CONFIG, normalizeStatusHudConfig } from '@core/status-schema';
import { normalizePresetId, type PresetId } from '@core/creation-preset';
import {
  DEFAULT_THINKING_CONFIG,
  DEFAULT_MAX_CONTEXT_TOKENS,
  DEFAULT_RESERVED_TOKENS,
} from '@/types';
import { buildCustomThemeCss, generateThemeTokens, type ThemeTokens } from '@/core/theme-extractor';import type { StorageAdapter } from '../storage/storage-adapter';
import {
  DEFAULT_TTS_CONFIG,
  type TTSConfig,
} from '@services/tts-service';
import {
  DEFAULT_TRANSLATION_CONFIG,
  type TranslationConfig,
} from '@services/translator';
import {
  DEFAULT_SUMMARIZATION_CONFIG,
  type SummarizationConfig,
} from '@core/summarizer';
import {
  createDefaultProviderConfig,
  type ImageProviderConfig,
} from '@core/image-generation';
import {
  encryptApiKey,
  decryptApiKey,
  isEncrypted,
  verifyMasterPassword,
  reencryptApiKey,
} from '@core/api-key-crypto';
import { setRemoteApiKeyState } from '@core/remote-api-key-state';
import { exportQuickRepliesToStJson, importQuickRepliesFromSt } from '@core/st-compat';
import { setLocale as setI18nLocale, t as i18nT, detectLocale, type Locale } from '@/i18n';

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
 */
export const useSettingsStore = defineStore('settings', () => {
  // ── 状态 ──
  const theme = ref<ThemeName>('dark');
  const fontSize = ref<number>(14);
  /** T-13：界面语言（与 i18n 模块 localeRef 同步，持久化到 AppSettings.locale） */
  const locale = ref<Locale>('zh');
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
  const translationConfig = ref<TranslationConfig>({
    ...DEFAULT_TRANSLATION_CONFIG,
  });

  // F12.4 自动摘要配置（默认启用，阈值 4000 Token）
  const summarizationConfig = ref<SummarizationConfig>({
    ...DEFAULT_SUMMARIZATION_CONFIG,
  });

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
   * P1 角色状态栏全局偏好
   *
   * 语义沿用 §1.4「嗅探免费、注入授权」：`enabled`（是否要求模型产出状态块）默认
   * **false** —— 不默认改变模型行为；解析与渲染永远开启（模型自己输出了就白捡）。
   */
  const statusHudConfig = ref<StatusHudConfig>({ ...DEFAULT_STATUS_HUD_CONFIG });

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

  // 注入的存储适配器
  let storageAdapter: Pick<StorageAdapter, 'saveSettings' | 'loadSettings'> | null = null;

  // 最近一次错误（UI 反馈用）
  const lastError = ref<string | null>(null);

  // ── AC20 主密码会话管理 ──

  /**
   * 生成主密码验证器（加密随机明文）
   * @param pw 主密码
   * @returns 加密字符串（含 enc:v1: 前缀）
   */
  async function generateVerifier(pw: string): Promise<string> {
    const randomBytes = crypto.getRandomValues(new Uint8Array(32));
    const verifier = btoa(String.fromCharCode(...Array.from(randomBytes)));
    return encryptApiKey(verifier, pw);
  }

  /**
   * 首次设置主密码
   *
   * 流程：
   * 1. 生成随机 verifier 明文
   * 2. 用主密码加密 verifier → 持久化到 masterPasswordVerifier
   * 3. 注入内存
   * 4. 持久化设置（此时所有 apiKey 会被自动加密）
   *
   * @param pw 主密码（用户输入，明文）
   */
  async function setMasterPassword(pw: string): Promise<void> {
    if (!pw) throw new Error(i18nT('masterPwd.pwdPlaceholder'));
    masterPasswordVerifier.value = await generateVerifier(pw);
    masterPassword.value = pw;
    // P1-4：存量明文远程密钥在此收敛为密文，并写入内存态
    await encryptRemoteEmbeddingKey(pw);
    await loadRemoteApiKeyDecrypted();
    await persistSettings();
  }

  /**
   * 解锁应用（验证主密码并注入内存）
   *
   * @param pw 用户输入的主密码
   * @returns true=解锁成功；false=密码错误
   */
  async function unlock(pw: string): Promise<boolean> {
    if (!masterPasswordVerifier.value) return false;
    const ok = await verifyMasterPassword(masterPasswordVerifier.value, pw);
    if (!ok) return false;
    masterPassword.value = pw;
    // 解密内存中所有已加密的 apiKey
    await decryptAllApiKeys();
    // P1-4：解密远程向量密钥并写入内存态（供同步的 defaultFactory 取用）
    await loadRemoteApiKeyDecrypted();
    return true;
  }

  /**
   * 锁定应用（清除内存中的主密码）
   *
   * 注意：内存中的 apiKey 不会被重新加密（保留明文直到下次刷新）。
   * 真正的"锁定"语义需刷新页面或重新加载设置。
   */
  function lock(): void {
    masterPassword.value = '';
    // P1-4：锁定后不再向 provider 下发远程向量密钥（内存态置 locked）
    syncRemoteApiKeyState();
  }

  /**
   * 修改主密码（需先解锁）
   *
   * 流程：
   * 1. 验证旧密码
   * 2. 用旧密码解密所有 apiKey
   * 3. 用新密码重新加密所有 apiKey
   * 4. 更新 verifier
   *
   * @param oldPw 旧主密码
   * @param newPw 新主密码
   * @returns true=成功；false=旧密码错误
   */
  async function changeMasterPassword(
    oldPw: string,
    newPw: string
  ): Promise<boolean> {
    if (!masterPasswordVerifier.value) return false;
    const ok = await verifyMasterPassword(masterPasswordVerifier.value, oldPw);
    if (!ok) return false;

    // 内存中 apiKey 应该是明文（已解锁状态），用新密码加密
    // 但为了兼容"已加密"场景（如未解锁就改密码），使用 reencryptApiKey 双保险
    for (const profile of apiProfiles.value) {
      if (profile.apiKey) {
        if (isEncrypted(profile.apiKey)) {
          // 已加密：用旧密码解密后用新密码加密
          profile.apiKey = await reencryptApiKey(profile.apiKey, oldPw, newPw);
        } else {
          // 明文（已解锁状态）：直接用新密码加密（持久化时透明层会再处理）
          // 这里不需要修改内存中的值，保持明文即可
        }
      }
    }
    if (translationConfig.value.apiKey) {
      if (isEncrypted(translationConfig.value.apiKey)) {
        translationConfig.value.apiKey = await reencryptApiKey(
          translationConfig.value.apiKey,
          oldPw,
          newPw
        );
      }
    }
    // P1-4：远程向量密钥同样随主密码轮换（否则改密码后它再也解不开）
    await reencryptRemoteEmbeddingKey(oldPw, newPw);

    // 更新 verifier
    masterPasswordVerifier.value = await generateVerifier(newPw);
    masterPassword.value = newPw;
    await persistSettings();
    return true;
  }

  /**
   * 解密内存中所有已加密的 apiKey 字段
   * 在 unlock 成功后调用
   *
   * 解密失败的字段保留密文不动（用户选择"保留密文待重试"策略）
   */
  async function decryptAllApiKeys(): Promise<void> {
    if (!masterPassword.value) return;
    for (const profile of apiProfiles.value) {
      if (profile.apiKey && isEncrypted(profile.apiKey)) {
        try {
          profile.apiKey = await decryptApiKey(
            profile.apiKey,
            masterPassword.value
          );
        } catch {
          // 保留密文，记录到 lastError
          lastError.value = i18nT('masterPwd.apiKeyDecryptFailed', { name: profile.name });
        }
      }
    }
    if (
      translationConfig.value.apiKey &&
      isEncrypted(translationConfig.value.apiKey)
    ) {
      try {
        translationConfig.value.apiKey = await decryptApiKey(
          translationConfig.value.apiKey,
          masterPassword.value
        );
      } catch {
        lastError.value = i18nT('masterPwd.translationKeyDecryptFailed');
      }
    }
    // E22：图像 Provider 的密钥与上面两处同进同出（漏了它就会出现"能生成图但密钥是密文"）
    if (
      imageGenConfig.value.apiKey &&
      isEncrypted(imageGenConfig.value.apiKey)
    ) {
      try {
        imageGenConfig.value.apiKey = await decryptApiKey(
          imageGenConfig.value.apiKey,
          masterPassword.value
        );
      } catch {
        lastError.value = i18nT('masterPwd.imageGenKeyDecryptFailed');
      }
    }
  }

  // ── P1-4：远程向量网关 apiKey 纳入主密码加密体系 ──
  //
  // 该密钥原先以**明文**存于 localStorage['aijiuguan.remoteEmbedding']，游离于
  // 主密码体系之外（apiProfiles / translationConfig 的 apiKey 都会加密，唯独它没有），
  // 也不在备份导出的明文密钥检查范围内。
  //
  // 读取侧的特殊性：VectorModelManager.defaultFactory() 是**同步静态**方法，
  // 而 decryptApiKey() 是异步的（Web Crypto）。故不采用「读取时解密」（会把调用链
  // 整体异步化），而是「解锁时解密一次写入内存态，读取时同步取用」。
  //
  // ⚠️ 边界：本改动只消除**磁盘明文**。lock() 不清内存中的 apiKey 明文是既有局限
  // （见 lock() 注释），内存态的语义与该既有行为保持一致，不夸大安全收益。

  /** 远程向量配置的 localStorage 键 */
  const REMOTE_EMBEDDING_KEY = 'aijiuguan.remoteEmbedding';

  function readRemoteEmbedding(): Record<string, unknown> | null {
    try {
      const raw = localStorage.getItem(REMOTE_EMBEDDING_KEY);
      return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }

  function writeRemoteEmbedding(payload: Record<string, unknown>): void {
    localStorage.setItem(REMOTE_EMBEDDING_KEY, JSON.stringify(payload));
  }

  /** 把 localStorage 中远程配置的 apiKey 用主密码加密（已加密则跳过） */
  async function encryptRemoteEmbeddingKey(pw: string): Promise<void> {
    const cfg = readRemoteEmbedding();
    if (!cfg || typeof cfg.apiKey !== 'string' || !cfg.apiKey) return;
    if (isEncrypted(cfg.apiKey)) return;
    cfg.apiKey = await encryptApiKey(cfg.apiKey, pw);
    writeRemoteEmbedding(cfg);
  }

  /** 用新密码重新加密远程配置的 apiKey（改主密码时调用） */
  async function reencryptRemoteEmbeddingKey(oldPw: string, newPw: string): Promise<void> {
    const cfg = readRemoteEmbedding();
    if (!cfg || typeof cfg.apiKey !== 'string' || !cfg.apiKey) return;
    if (!isEncrypted(cfg.apiKey)) return; // 明文（未解锁场景）：交由持久化侧处理
    cfg.apiKey = await reencryptApiKey(cfg.apiKey, oldPw, newPw);
    writeRemoteEmbedding(cfg);
  }

  /** 依据主密码状态同步内存态（同步路径：未设主密码 / 未解锁 / 明文存量） */
  function syncRemoteApiKeyState(): void {
    if (!masterPasswordVerifier.value) {
      setRemoteApiKeyState({ state: 'plain' });
      return;
    }
    if (!masterPassword.value) {
      setRemoteApiKeyState({ state: 'locked' });
      return;
    }
    const stored = readRemoteEmbedding()?.apiKey;
    if (typeof stored === 'string' && stored && !isEncrypted(stored)) {
      setRemoteApiKeyState({ state: 'unlocked', key: stored });
    } else {
      // 密文需异步解密，先置 locked，由 loadRemoteApiKeyDecrypted 接管
      setRemoteApiKeyState({ state: 'locked' });
    }
  }

  /** 异步解密并写入内存态（unlock / setMasterPassword 成功后调用） */
  async function loadRemoteApiKeyDecrypted(): Promise<void> {
    if (!masterPassword.value) {
      setRemoteApiKeyState({ state: 'locked' });
      return;
    }
    const stored = readRemoteEmbedding()?.apiKey;
    if (typeof stored !== 'string' || !stored) {
      setRemoteApiKeyState({ state: 'unlocked', key: '' });
      return;
    }
    if (!isEncrypted(stored)) {
      setRemoteApiKeyState({ state: 'unlocked', key: stored });
      return;
    }
    try {
      setRemoteApiKeyState({
        state: 'unlocked',
        key: await decryptApiKey(stored, masterPassword.value),
      });
    } catch {
      // 解密失败：置为不可用；用户重新保存远程配置即可恢复
      setRemoteApiKeyState({ state: 'locked' });
    }
  }

  /**
   * P1-4：供设置页保存远程向量配置时加密 apiKey
   * 未设主密码时原样返回（与 apiProfiles 的透明加密语义一致）
   */
  async function encryptRemoteSecret(plain: string): Promise<string> {
    if (!plain || isEncrypted(plain)) return plain;
    if (!masterPassword.value) return plain;
    return encryptApiKey(plain, masterPassword.value);
  }

  /**
   * P1-4：供设置页回填表单时解密 apiKey
   * 未加密时原样返回；已加密但未解锁时返回空串（不回填密文）
   */
  async function decryptRemoteSecret(stored: string): Promise<string> {
    if (!stored || !isEncrypted(stored)) return stored;
    if (!masterPassword.value) return '';
    try {
      return await decryptApiKey(stored, masterPassword.value);
    } catch {
      return '';
    }
  }

  // ── 主题 ──

  /**
   * 切换主题，并立即应用到 <html data-theme>
   */
  function setTheme(t: ThemeName) {
    theme.value = t;
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', t);
      // 兼容遗留 dark class（部分样式依赖 .dark）
      document.documentElement.classList.toggle('dark', t === 'dark');
    }
    void persistSettings();
  }

  // ── 字号 ──

  /**
   * 设置字号档位（12 / 14 / 16 / 18）
   */
  function setFontSize(size: number) {
    fontSize.value = size;
    if (typeof document !== 'undefined') {
      document.documentElement.style.fontSize = `${size}px`;
    }
    void persistSettings();
  }

  // ── T-13: 语言 ──

  /**
   * 切换界面语言（同步 i18n 模块 + 持久化）
   */
  function setLocale(l: Locale) {
    locale.value = l;
    setI18nLocale(l);
    void persistSettings();
  }

  // ── API Profile CRUD ──

  /**
   * 添加一个 API Profile（持久化）
   */
  function addApiProfile(profile: ApiProfile) {
    apiProfiles.value.push(profile);
    // 若当前无激活，自动激活第一个
    if (activeApiProfileId.value === null) {
      activeApiProfileId.value = profile.id;
    }
    void persistSettings();
  }

  /**
   * 更新 API Profile（patch 合并）
   */
  function updateApiProfile(id: string, patch: Partial<ApiProfile>) {
    const profile = apiProfiles.value.find((p) => p.id === id);
    if (profile) {
      Object.assign(profile, patch);
      void persistSettings();
    }
  }

  /**
   * 删除 API Profile
   * - 若删除的是当前激活的，自动切换到第一个（若无则置 null）
   */
  function deleteApiProfile(id: string) {
    const idx = apiProfiles.value.findIndex((p) => p.id === id);
    if (idx < 0) return;
    apiProfiles.value.splice(idx, 1);
    if (activeApiProfileId.value === id) {
      activeApiProfileId.value = apiProfiles.value[0]?.id ?? null;
    }
    void persistSettings();
  }

  /**
   * 设置当前激活的 API Profile（null 表示未配置）
   */
  function setActiveApiProfile(id: string | null) {
    activeApiProfileId.value = id;
    void persistSettings();
  }

  // ── 需求3：模型分类管理 ──

  /** 按分类获取模型列表（未设置 category 的视为 'chat'） */
  function getModelsByCategory(category: ModelCategory): ApiProfile[] {
    return apiProfiles.value.filter(
      (p) => (p.category ?? 'chat') === category
    );
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
    const target = apiProfiles.value.find((p) => p.id === id);
    if (!target) return;
    // 清除同分类其他模型的主模型标记
    for (const p of apiProfiles.value) {
      if ((p.category ?? 'chat') === category && p.id !== id) {
        p.isPrimary = false;
      }
    }
    target.category = category;
    target.isPrimary = true;
    void persistSettings();
  }

  // ── F08.2 聊天背景 + 气泡样式 ──

  /** 设置聊天背景（F08.2） */
  function setChatBackground(bg: ChatBackground): void {
    chatBackground.value = { ...bg };
    void persistSettings();
  }

  /** 设置消息气泡样式（F08.2） */
  function setBubbleStyle(style: BubbleStyle): void {
    bubbleStyle.value = { ...style };
    void persistSettings();
  }

  // ── F08.3 自定义 CSS ──

  /** 设置自定义 CSS 代码并立即注入到页面（F08.3） */
  function setCustomCss(css: string): void {
    customCss.value = css;
    applyCustomCss(css);
    void persistSettings();
  }

  /** 重置自定义 CSS（F08.3） */
  function resetCustomCss(): void {
    customCss.value = '';
    applyCustomCss('');
    void persistSettings();
  }

  // ── F08.4 自定义主题 ──

  /**
   * 设置自定义主题（背景图 + 提取主色 + 组件变量）并立即应用
   * 应用后自动切换到 custom 主题
   */
  function setCustomTheme(ct: CustomTheme): void {
    customTheme.value = normalizeCustomTheme(ct);
    applyCustomTheme(customTheme.value);
    setTheme('custom');
  }

  /** 清除自定义主题（不自动切换回默认主题） */
  function clearCustomTheme(): void {
    customTheme.value = null;
    applyCustomTheme(null);
    void persistSettings();
  }

  /**
   * 将自定义主题变量注入到 <style id="custom-theme">（覆盖 tokens.css 默认值）
   * 以 palette 为唯一数据源：始终根据主色板重新生成 tokens，
   * 自愈历史版本（如曾生成 --primary: #000000 的旧数据）。
   */
  function applyCustomTheme(ct: CustomTheme | null): void {
    if (typeof document === 'undefined') return;
    let styleEl = document.getElementById('custom-theme') as HTMLStyleElement | null;
    if (!ct) {
      if (styleEl?.parentNode) styleEl.parentNode.removeChild(styleEl);
      return;
    }
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'custom-theme';
      document.head.appendChild(styleEl);
    }
    const fresh = normalizeCustomTheme(ct);
    styleEl.textContent = buildCustomThemeCss(fresh.tokens as ThemeTokens, fresh.background || undefined);
  }

  // ── F12.2 TTS / F12.3 翻译 / F12.4 自动摘要 配置 ──

  /** 设置 TTS 配置（F12.2） */
  function setTtsConfig(config: Partial<TTSConfig>): void {
    ttsConfig.value = { ...ttsConfig.value, ...config };
    void persistSettings();
  }

  /** 设置翻译配置（F12.3） */
  function setTranslationConfig(config: Partial<TranslationConfig>): void {
    translationConfig.value = {
      ...translationConfig.value,
      ...config,
    };
    void persistSettings();
  }

  /**
   * E22：图像生成 Provider 的唯一写入口（图像页 store 走这里）。
   * 与 setTranslationConfig 同口径：改内存 + 立即排队落盘。
   */
  function setImageGenConfig(config: Partial<ImageProviderConfig>): void {
    imageGenConfig.value = {
      ...imageGenConfig.value,
      ...config,
    };
    void persistSettings();
  }

  /** 设置自动摘要配置（F12.4） */
  function setSummarizationConfig(config: Partial<SummarizationConfig>): void {
    summarizationConfig.value = {
      ...summarizationConfig.value,
      ...config,
    };
    void persistSettings();
  }

  // ── F11.3 Quick Reply CRUD ──

  /**
   * 添加 Quick Reply 按钮
   * @returns 新按钮的 id
   */
  function addQuickReply(button: QuickReplyButton): string {
    quickReplies.value.push(button);
    void persistSettings();
    return button.id;
  }

  /**
   * 更新 Quick Reply 按钮（patch 合并）
   */
  function updateQuickReply(id: string, patch: Partial<QuickReplyButton>): void {
    const btn = quickReplies.value.find((b) => b.id === id);
    if (btn) {
      Object.assign(btn, patch);
      void persistSettings();
    }
  }

  /**
   * 删除 Quick Reply 按钮
   */
  function deleteQuickReply(id: string): void {
    const idx = quickReplies.value.findIndex((b) => b.id === id);
    if (idx < 0) return;
    quickReplies.value.splice(idx, 1);
    void persistSettings();
  }

  // ── T-07: SillyTavern Quick Reply 格式互导 ──

  /** 导出全部 Quick Reply 为 ST JSON 并触发下载 */
  function exportQuickRepliesSt(): boolean {
    const json = exportQuickRepliesToStJson(quickReplies.value);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `quick-replies-ST.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return true;
  }

  /** 从 ST Quick Reply JSON 导入（追加到现有列表，label 冲突自动去重） */
  async function importQuickRepliesSt(file: File): Promise<number> {
    const text = await file.text();
    const json: unknown = JSON.parse(text);
    const buttons = importQuickRepliesFromSt(json);
    const existingLabels = new Set(quickReplies.value.map((b) => b.label));
    let added = 0;
    for (const btn of buttons) {
      if (existingLabels.has(btn.label)) continue; // 去重
      existingLabels.add(btn.label);
      quickReplies.value.push(btn);
      added++;
    }
    if (added > 0) void persistSettings();
    return added;
  }

  /**
   * 移动 Quick Reply 按钮顺序
   * @param id 按钮 id
   * @param direction -1 上移 / +1 下移
   */
  function moveQuickReply(id: string, direction: -1 | 1): void {
    const idx = quickReplies.value.findIndex((b) => b.id === id);
    if (idx < 0) return;
    const target = idx + direction;
    if (target < 0 || target >= quickReplies.value.length) return;
    const list = quickReplies.value;
    [list[idx]!, list[target]!] = [list[target]!, list[idx]!];
    void persistSettings();
  }

  /**
   * 清空所有 Quick Reply 按钮
   */
  function clearQuickReplies(): void {
    quickReplies.value = [];
    void persistSettings();
  }

  /**
   * 工厂方法：生成新的 Quick Reply 按钮模板（仅内存对象）
   */
  function createQuickReplyTemplate(): QuickReplyButton {
    return {
      id: generateQuickReplyId(),
      label: i18nT('app.newButtonLabel'),
      script: '/echo hello',
      group: '',
      autoSend: true,
    };
  }

  /**
   * 将自定义 CSS 注入到页面 <style id="custom-css"> 标签
   * 已存在则更新内容，不存在则创建
   */
  function applyCustomCss(css: string): void {
    if (typeof document === 'undefined') return;
    let styleEl = document.getElementById('custom-css') as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'custom-css';
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = css;
    if (!css && styleEl.parentNode) {
      // 空 CSS 时移除标签
      styleEl.parentNode.removeChild(styleEl);
    }
  }

  // ── 工厂方法 ──

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
      maxTokens: 4096,
    };
  }

  // ── 持久化 ──

  /**
   * 注入存储适配器（应用启动时由 App.vue 调用）
   */
  function setStorageAdapter(adapter: Pick<StorageAdapter, 'saveSettings' | 'loadSettings'> | null): void {
    storageAdapter = adapter;
  }

  /**
   * 从存储层加载设置
   * 若存储为空（首次启动），保留默认值并写入存储
   *
   * AC20 安全：apiKey 字段以加密形式加载到内存。
   * 解密需在 unlock() 成功后通过 decryptAllApiKeys() 触发。
   */
  async function loadFromStorage(): Promise<void> {
    if (!storageAdapter) return;
    try {
      const saved = await storageAdapter.loadSettings();
      // 空对象视为首次启动
      const hasSavedData =
        saved &&
        (saved.theme !== undefined ||
          saved.fontSize !== undefined ||
          (Array.isArray(saved.apiProfiles) && saved.apiProfiles.length > 0) ||
          saved.activeApiProfileId !== undefined ||
          // MODEL-03：仅设置了创作模式也应视为已有数据（否则该字段永远读不回来）
          saved.creationPreset !== undefined);
      // P2-3：首访按浏览器语言兜底。此处先探测，若下方存在持久化语言则会被覆盖，
      // 因此「用户显式选择」始终优先，浏览器语言只作未选择时的默认值。
      const detected = detectLocale();
      if (detected !== locale.value) {
        locale.value = detected;
        setI18nLocale(detected);
      }

      if (hasSavedData) {
        if (saved.theme) setTheme(saved.theme);
        if (typeof saved.fontSize === 'number') setFontSize(saved.fontSize);
        // T-13 加载语言（默认 zh）
        if (saved.locale === 'zh' || saved.locale === 'en') {
          locale.value = saved.locale;
          setI18nLocale(saved.locale);
        }
        if (Array.isArray(saved.apiProfiles)) apiProfiles.value = saved.apiProfiles;
        if (typeof saved.activeApiProfileId !== 'undefined') {
          activeApiProfileId.value = saved.activeApiProfileId;
        }
        // F08.2 加载聊天背景（向后兼容：无字段时保留默认值）
        if (saved.chatBackground) {
          chatBackground.value = { ...chatBackground.value, ...saved.chatBackground };
        }
        if (saved.bubbleStyle) {
          bubbleStyle.value = { ...bubbleStyle.value, ...saved.bubbleStyle };
        }
        // F08.3 加载自定义 CSS 并注入
        if (typeof saved.customCss === 'string') {
          customCss.value = saved.customCss;
          applyCustomCss(saved.customCss);
        }
        // F08.4 加载自定义主题并注入（仅当主题为 custom 时生效）
        if (saved.customTheme && typeof saved.customTheme === 'object') {
          const ct = saved.customTheme as CustomTheme;
          customTheme.value = normalizeCustomTheme(ct);
          applyCustomTheme(customTheme.value);
        }
        // F12.2 加载 TTS 配置
        if (saved.ttsConfig && typeof saved.ttsConfig === 'object') {
          ttsConfig.value = { ...DEFAULT_TTS_CONFIG, ...saved.ttsConfig };
        }
        // F12.3 加载翻译配置
        if (saved.translationConfig && typeof saved.translationConfig === 'object') {
          translationConfig.value = {
            ...DEFAULT_TRANSLATION_CONFIG,
            ...saved.translationConfig,
          };
        }
        // F12.4 加载自动摘要配置
        if (saved.summarizationConfig && typeof saved.summarizationConfig === 'object') {
          summarizationConfig.value = {
            ...DEFAULT_SUMMARIZATION_CONFIG,
            ...saved.summarizationConfig,
          };
        }
        // E22 加载图像生成 Provider（旧数据缺字段时保留默认；脏字段逐项回落默认）
        if (saved.imageGenConfig && typeof saved.imageGenConfig === 'object') {
          imageGenConfig.value = normalizeImageGenConfig(saved.imageGenConfig);
        }
        // F11.3 加载 Quick Reply 按钮列表
        if (Array.isArray(saved.quickReplies)) {
          quickReplies.value = saved.quickReplies;
        }
        // P0-1 加载思维链偏好（向后兼容：无字段时保留默认值）
        if (saved.thinkingConfig && typeof saved.thinkingConfig === 'object') {
          const tc = saved.thinkingConfig as Partial<ThinkingConfig>;
          thinkingConfig.value = {
            stripFromHistory:
              typeof tc.stripFromHistory === 'boolean'
                ? tc.stripFromHistory
                : DEFAULT_THINKING_CONFIG.stripFromHistory,
            defaultCollapsed:
              typeof tc.defaultCollapsed === 'boolean'
                ? tc.defaultCollapsed
                : DEFAULT_THINKING_CONFIG.defaultCollapsed,
          };
        }
        // P0-3 加载全局采样默认值（null = 未设置）
        if (saved.samplingDefaults && typeof saved.samplingDefaults === 'object') {
          samplingDefaults.value = normalizeSamplingDefaults(saved.samplingDefaults);
        }
        // MODEL-03 加载创作模式（旧数据缺字段时保留默认 balanced）
        if (saved.creationPreset !== undefined) {
          creationPreset.value = normalizePresetId(saved.creationPreset);
        }
        // P1 加载状态栏偏好（向后兼容：无字段时保留默认值；脏字段回落默认）
        if (saved.statusHudConfig && typeof saved.statusHudConfig === 'object') {
          statusHudConfig.value = normalizeStatusHudConfig(saved.statusHudConfig);
        }
        // 加载上下文长度配置（向后兼容：旧数据缺字段时保留默认 8192 / 1024）
        if (typeof saved.maxContextTokens === 'number' && Number.isFinite(saved.maxContextTokens)) {
          maxContextTokens.value = Math.floor(saved.maxContextTokens);
        }
        if (typeof saved.reservedTokens === 'number' && Number.isFinite(saved.reservedTokens)) {
          reservedTokens.value = Math.floor(saved.reservedTokens);
        }
        // 防御脏数据：max ≤ reserved 会使预算为 0，整组回落默认，避免历史无法装入
        if (maxContextTokens.value <= reservedTokens.value) {
          maxContextTokens.value = DEFAULT_MAX_CONTEXT_TOKENS;
          reservedTokens.value = DEFAULT_RESERVED_TOKENS;
        }
        // AC20 加载主密码验证器（apiKey 字段保持加密形式，待 unlock 后解密）
        if (typeof saved.masterPasswordVerifier !== 'undefined') {
          masterPasswordVerifier.value = saved.masterPasswordVerifier;
        }
        // P1-4：按主密码状态初始化远程向量密钥的内存态
        // （已设主密码 -> locked，待 unlock 后解密；未设 -> plain，沿用明文）
        syncRemoteApiKeyState();
        // 末尾重断言 data-theme：customTheme 注入后再次同步 DOM 与 store，
        // 避免异步启动时序导致 data-theme 回退为默认（刷新后自定义主题失效）
        setTheme(theme.value);
      } else {
        // 首次启动：写入默认设置
        await persistSettings();
      }
    } catch (err) {
      lastError.value = i18nT('settings.loadFailed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * 持久化当前设置到存储层
   *
   * AC20 透明加密层：
   * - 若 masterPassword 已设置，对 apiProfiles[*].apiKey 和 translationConfig.apiKey
   *   在持久化前进行 AES-GCM 加密（已加密的密文不重复加密）
   * - 内存中保留明文，存储层存密文
   *
   * 注意：Vue 的 reactive Proxy 无法被 IndexedDB 结构化克隆，
   * 需要通过 toRaw() 转换为普通对象再传递给存储适配器
   */
  async function writeSettingsSnapshot(): Promise<void> {
    if (!storageAdapter) return;
    try {
      // AC20 透明加密：若已设置主密码，加密 apiKey 字段后再保存
      const pw = masterPassword.value;
      const profilesToSave = pw
        ? await Promise.all(
            toRaw(apiProfiles.value)
              .map((p) => toRaw(p))
              .map(async (p) => ({
                ...p,
                apiKey:
                  p.apiKey && !isEncrypted(p.apiKey)
                    ? await encryptApiKey(p.apiKey, pw)
                    : p.apiKey,
              }))
          )
        : toRaw(apiProfiles.value).map((p) => toRaw(p));

      const translationToSave =
        pw &&
        translationConfig.value.apiKey &&
        !isEncrypted(translationConfig.value.apiKey)
          ? {
              ...toRaw(translationConfig.value),
              apiKey: await encryptApiKey(
                translationConfig.value.apiKey,
                pw
              ),
            }
          : toRaw(translationConfig.value);

      const imageGenToSave =
        pw && imageGenConfig.value.apiKey && !isEncrypted(imageGenConfig.value.apiKey)
          ? {
              ...toRaw(imageGenConfig.value),
              apiKey: await encryptApiKey(imageGenConfig.value.apiKey, pw),
            }
          : toRaw(imageGenConfig.value);

      await storageAdapter.saveSettings({
        theme: theme.value,
        fontSize: fontSize.value,
        locale: locale.value,
        apiProfiles: profilesToSave,
        activeApiProfileId: activeApiProfileId.value,
        chatBackground: toRaw(chatBackground.value),
        bubbleStyle: toRaw(bubbleStyle.value),
        customCss: customCss.value,
        // F08.4 自定义主题持久化
        customTheme: customTheme.value
          ? {
              background: customTheme.value.background,
              palette: [...customTheme.value.palette],
              paletteRatios: [...customTheme.value.paletteRatios],
              avgLuminance: customTheme.value.avgLuminance,
              tokens: { ...customTheme.value.tokens },
            }
          : null,
        // F12.2/F12.3/F12.4 配置持久化
        ttsConfig: toRaw(ttsConfig.value),
        translationConfig: translationToSave,
        summarizationConfig: toRaw(summarizationConfig.value),
        // E22 图像生成 Provider（apiKey 按主密码状态加密）
        imageGenConfig: imageGenToSave,
        // F11.3 Quick Reply 按钮列表
        quickReplies: toRaw(quickReplies.value).map((b) => toRaw(b)),
        // AC20 主密码验证器
        masterPasswordVerifier: masterPasswordVerifier.value,
        // P0-1 思维链偏好
        thinkingConfig: { ...toRaw(thinkingConfig.value) },
        // P0-3 全局采样默认值（null = 未设置）
        samplingDefaults: samplingDefaults.value ? { ...toRaw(samplingDefaults.value) } : null,
        // MODEL-03 创作模式
        creationPreset: creationPreset.value,
        // P1 状态栏偏好
        statusHudConfig: { ...toRaw(statusHudConfig.value) },
        // 上下文长度配置
        maxContextTokens: maxContextTokens.value,
        reservedTokens: reservedTokens.value,
      });
    } catch (err) {
      lastError.value = i18nT('settings.saveFailed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * 串行化设置写入（M2-b8 排查 §七 #20 时定位到的真因）
   *
   * 原来每次调用各自异步跑完：连着点"创建配置"再点"激活"会并发两次写，
   * 先发起的那次带的快照更旧，却可能**后**完成，于是把新状态覆盖掉 ——
   * 刷新后表现为"明明配过，芯片却说还没有可用的模型配置"。
   *
   * 排队规则：空闲时**同步发起**（保持既有"调用即写入"语义，含 `tests/stores/quick-reply.test.ts`
   * 里的同步断言），有写在飞时排到它完成之后再发起 ⇒ 写入顺序 = 状态顺序，不可能倒置。
   * 调用点的 `void persistSettings()` 一行都不用改。
   */
  let persistInFlight: Promise<void> | null = null;
  const persistWaiters: Array<() => void> = [];

  function persistSettings(): Promise<void> {
    if (persistInFlight) {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      persistWaiters.push(release);
      return gate.then(() => persistSettings());
    }
    const run = writeSettingsSnapshot().catch(() => undefined);
    persistInFlight = run;
    void run.then(() => {
      persistInFlight = null;
      persistWaiters.shift()?.();
    });
    return run;
  }

  /**
   * 恢复会话级主密码（应用启动时调用）
   *
   * 主密码仅存运行时内存（不落任何存储），刷新后无法自动恢复。
   * 恒返回 false —— UI 在 hasMasterPassword=true 时显示解锁 Modal。
   *
   * @returns 恒为 false（保持锁定状态，需手动解锁）
   */
  async function restoreSession(): Promise<boolean> {
    return false;
  }

  function clearLastError(): void {
    lastError.value = null;
  }

  /**
   * P0-1：更新思维链偏好（局部 patch，未给字段保持原值）
   * 调用方负责在需要落盘时调用 persistSettings()
   */
  function setThinkingConfig(patch: Partial<ThinkingConfig>): void {
    thinkingConfig.value = { ...thinkingConfig.value, ...patch };
  }

  /**
   * P0-3：更新全局采样默认值（传 null 清空 = 全部走供应商默认）
   * 本轮无 UI，仅保留数据位与合并逻辑供后续接入
   */
  function setSamplingDefaults(value: SamplingOverrides | null): void {
    samplingDefaults.value = value ? normalizeSamplingDefaults(value) : null;
  }

  /**
   * MODEL-03：切换创作模式（Preset）
   * 非法值由 normalizePresetId 归一，避免脏数据进入持久化。
   */
  function setCreationPreset(value: unknown): void {
    creationPreset.value = normalizePresetId(value);
  }

  /**
   * P1：更新状态栏全局偏好（局部 patch，未给字段保持原值）
   * 调用方负责在需要落盘时调用 persistSettings()
   */
  function setStatusHudConfig(patch: Partial<StatusHudConfig>): void {
    statusHudConfig.value = normalizeStatusHudConfig({ ...statusHudConfig.value, ...patch });
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
    if (next <= reservedTokens.value) return false;
    maxContextTokens.value = next;
    void persistSettings();
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
    if (next < 0 || next >= maxContextTokens.value) return false;
    reservedTokens.value = next;
    void persistSettings();
    return true;
  }

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
    statusHudConfig,
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
    // 主题
    setTheme,
    setFontSize,
    // T-13 语言
    setLocale,
    // API Profile CRUD
    addApiProfile,
    updateApiProfile,
    deleteApiProfile,
    setActiveApiProfile,
    createProfileTemplate,
    // 需求3：模型分类管理
    getModelsByCategory,
    getPrimaryModel,
    setPrimaryModel,
    // F07 Persona
    // F08.2 背景与气泡
    setChatBackground,
    setBubbleStyle,
    // F08.3 自定义 CSS
    setCustomCss,
    resetCustomCss,
    applyCustomCss,
    // F08.4 自定义主题
    setCustomTheme,
    clearCustomTheme,
    applyCustomTheme,
    // F12.2/F12.3/F12.4 配置
    setTtsConfig,
    setTranslationConfig,
    setImageGenConfig,
    setSummarizationConfig,
    // F11.3 Quick Reply CRUD
    addQuickReply,
    updateQuickReply,
    deleteQuickReply,
    moveQuickReply,
    clearQuickReplies,
    createQuickReplyTemplate,
    // P0-1 思维链偏好 / P0-3 全局采样默认值
    setThinkingConfig,
    setSamplingDefaults,
    setCreationPreset,
    setStatusHudConfig,
    // 上下文长度配置
    setMaxContextTokens,
    setReservedTokens,
    // T-07: SillyTavern Quick Reply 格式互导
    exportQuickRepliesSt,
    importQuickRepliesSt,
    // AC20 主密码会话管理
    setMasterPassword,
    unlock,
    lock,
    changeMasterPassword,
    // T-06：暴露会话主密码只读访问（仅运行时内存；供备份加密/解密使用）
    getSessionMasterPassword: () => masterPassword.value,
    restoreSession,
    decryptAllApiKeys,
    // P1-4：远程向量密钥的加解密辅助（供设置页保存/回填远程配置时调用）
    encryptRemoteSecret,
    decryptRemoteSecret,
    // 持久化
    setStorageAdapter,
    loadFromStorage,
    persistSettings,
    clearLastError,
  };
});

// ── 工具函数 ──

/**
 * 生成 Profile ID（crypto.randomUUID 优先，回退到时间戳）
 */
function generateProfileId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `profile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 生成 Quick Reply 按钮 ID（crypto.randomUUID 优先，回退到时间戳）
 */
function generateQuickReplyId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `qr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 归一化自定义主题：以 palette 为唯一数据源，重新生成 tokens。
 * - 兼容旧数据缺 avgLuminance 字段
 * - 自愈历史缺陷数据（如 --primary: #000000）
 */
function normalizeCustomTheme(ct: CustomTheme): CustomTheme {
  const palette = Array.isArray(ct.palette) ? ct.palette.filter((c) => typeof c === 'string') : [];
  const paletteRatios = Array.isArray(ct.paletteRatios) ? ct.paletteRatios : [];
  // 空色板时回退默认深色主题令牌
  if (palette.length === 0) {
    return {
      background: ct.background ?? '',
      palette,
      paletteRatios,
      avgLuminance: typeof ct.avgLuminance === 'number' ? ct.avgLuminance : 0.5,
      tokens: { ...(ct.tokens ?? {}) },
    };
  }
  const avgLuminance =
    typeof ct.avgLuminance === 'number'
      ? ct.avgLuminance
      : // 旧数据缺 avgLuminance：按主色平均亮度近似
        palette.reduce((sum, hex) => sum + luminanceOfHex(hex), 0) / palette.length;
  const tokens = generateThemeTokens({ colors: palette, ratios: paletteRatios, avgLuminance });
  return {
    background: ct.background ?? '',
    palette,
    paletteRatios,
    avgLuminance,
    tokens,
  };
}

/**
 * P0-3：归一化全局采样默认值
 * 逐字段校验，丢弃非法值；全空时返回 null（= 未设置，走供应商默认）
 */
function normalizeSamplingDefaults(raw: unknown): SamplingOverrides | null {
  if (!raw || typeof raw !== 'object') return null;
  const src = raw as Record<string, unknown>;
  const out: SamplingOverrides = {};
  for (const key of ['topP', 'presencePenalty', 'frequencyPenalty'] as const) {
    const v = src[key];
    if (typeof v === 'number' && Number.isFinite(v)) {
      out[key] = v;
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * E22：归一化图像生成 Provider 配置。
 * 逐字段校验，脏值回落默认（不能让一个坏 endpoint 字段把整份设置读崩）；
 * apiKey 原样保留——设了主密码时它是密文，解密在 unlock 的 decryptAllApiKeys 里做。
 */
function normalizeImageGenConfig(raw: unknown): ImageProviderConfig {
  const base = createDefaultProviderConfig();
  if (!raw || typeof raw !== 'object') return base;
  const src = raw as Record<string, unknown>;
  return {
    type: src.type === 'custom' ? 'custom' : base.type,
    endpoint: typeof src.endpoint === 'string' ? src.endpoint : base.endpoint,
    apiKey: typeof src.apiKey === 'string' ? src.apiKey : base.apiKey,
    model: typeof src.model === 'string' ? src.model : base.model,
    enabled: typeof src.enabled === 'boolean' ? src.enabled : base.enabled,
  };
}

/** 计算 hex 色的相对亮度（0-1），供旧数据缺 avgLuminance 时近似 */
function luminanceOfHex(hex: string): number {
  const h = hex.replace(/^#/, '');
  if (h.length !== 6) return 0.5;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if ([r, g, b].some((v) => Number.isNaN(v))) return 0.5;
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
