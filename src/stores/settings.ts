import { defineStore } from 'pinia';
import { ref, computed, toRaw } from 'vue';
import type {
  ApiProfile,
  ThemeName,
  ChatBackground,
  BubbleStyle,
  QuickReplyButton,
  ModelCategory,
} from '@/types';
import type { StorageAdapter } from '../storage/storage-adapter';
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
  encryptApiKey,
  decryptApiKey,
  isEncrypted,
  verifyMasterPassword,
  reencryptApiKey,
} from '@core/api-key-crypto';
import { exportQuickRepliesToStJson, importQuickRepliesFromSt } from '@core/st-compat';

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
  const apiProfiles = ref<ApiProfile[]>([]);
  const activeApiProfileId = ref<string | null>(null);
  /** F07：当前激活的 Persona ID（由 personaStore 调用 setActivePersona 更新） */
  const activePersonaId = ref<string | null>(null);

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

  // F11.3 Quick Reply 按钮列表（默认空）
  const quickReplies = ref<QuickReplyButton[]>([]);

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
    if (!pw) throw new Error('主密码不能为空');
    masterPasswordVerifier.value = await generateVerifier(pw);
    masterPassword.value = pw;
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
          lastError.value = `API Key「${profile.name}」解密失败：主密码错误或数据已损坏`;
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
        lastError.value = `翻译 API Key 解密失败：主密码错误或数据已损坏`;
      }
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
    return list.find((p) => p.isPrimary) ?? list[0];
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

  /**
   * F07：设置当前激活的 Persona ID
   * @param id Persona ID（null 表示使用默认 "User"）
   */
  function setActivePersona(id: string | null) {
    activePersonaId.value = id;
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
    [list[idx], list[target]] = [list[target], list[idx]];
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
      label: '新按钮',
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
      name: '新 API 配置',
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
          saved.activeApiProfileId !== undefined);
      if (hasSavedData) {
        if (saved.theme) setTheme(saved.theme);
        if (typeof saved.fontSize === 'number') setFontSize(saved.fontSize);
        if (Array.isArray(saved.apiProfiles)) apiProfiles.value = saved.apiProfiles;
        if (typeof saved.activeApiProfileId !== 'undefined') {
          activeApiProfileId.value = saved.activeApiProfileId;
        }
        if (typeof saved.activePersonaId !== 'undefined') {
          activePersonaId.value = saved.activePersonaId;
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
        // F11.3 加载 Quick Reply 按钮列表
        if (Array.isArray(saved.quickReplies)) {
          quickReplies.value = saved.quickReplies;
        }
        // AC20 加载主密码验证器（apiKey 字段保持加密形式，待 unlock 后解密）
        if (typeof saved.masterPasswordVerifier !== 'undefined') {
          masterPasswordVerifier.value = saved.masterPasswordVerifier;
        }
      } else {
        // 首次启动：写入默认设置
        await persistSettings();
      }
    } catch (err) {
      lastError.value = `加载设置失败：${err instanceof Error ? err.message : String(err)}`;
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
  async function persistSettings(): Promise<void> {
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

      await storageAdapter.saveSettings({
        theme: theme.value,
        fontSize: fontSize.value,
        apiProfiles: profilesToSave,
        activeApiProfileId: activeApiProfileId.value,
        activePersonaId: activePersonaId.value,
        chatBackground: toRaw(chatBackground.value),
        bubbleStyle: toRaw(bubbleStyle.value),
        customCss: customCss.value,
        // F12.2/F12.3/F12.4 配置持久化
        ttsConfig: toRaw(ttsConfig.value),
        translationConfig: translationToSave,
        summarizationConfig: toRaw(summarizationConfig.value),
        // F11.3 Quick Reply 按钮列表
        quickReplies: toRaw(quickReplies.value).map((b) => toRaw(b)),
        // AC20 主密码验证器
        masterPasswordVerifier: masterPasswordVerifier.value,
      });
    } catch (err) {
      lastError.value = `保存设置失败：${err instanceof Error ? err.message : String(err)}`;
    }
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

  return {
    // 状态
    theme,
    fontSize,
    apiProfiles,
    activeApiProfileId,
    activePersonaId,
    chatBackground,
    bubbleStyle,
    customCss,
    // F12.2/F12.3/F12.4 配置
    ttsConfig,
    translationConfig,
    summarizationConfig,
    // F11.3 Quick Reply
    quickReplies,
    lastError,
    // AC20 主密码会话状态
    hasMasterPassword,
    isUnlocked,
    /** 当前激活 API Profile（派生） */
    activeProfile,
    // 主题
    setTheme,
    setFontSize,
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
    setActivePersona,
    // F08.2 背景与气泡
    setChatBackground,
    setBubbleStyle,
    // F08.3 自定义 CSS
    setCustomCss,
    resetCustomCss,
    applyCustomCss,
    // F12.2/F12.3/F12.4 配置
    setTtsConfig,
    setTranslationConfig,
    setSummarizationConfig,
    // F11.3 Quick Reply CRUD
    addQuickReply,
    updateQuickReply,
    deleteQuickReply,
    moveQuickReply,
    clearQuickReplies,
    createQuickReplyTemplate,
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
