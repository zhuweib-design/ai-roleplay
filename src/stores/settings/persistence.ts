import { toRaw } from 'vue';
import { t as i18nT } from '@/i18n';
import { setLocale as setI18nLocale, writeLocaleMirror } from '@/i18n';
import { normalizeThemeName, type AppSettings, type CustomTheme, type ThemeName, type ThinkingConfig } from '@/types';
import {
  DEFAULT_MAX_CONTEXT_TOKENS,
  DEFAULT_RESERVED_TOKENS,
  DEFAULT_THINKING_CONFIG,
} from '@/types';
import {
  DEFAULT_TRANSLATION_CONFIG,
} from '@services/translator';
import { DEFAULT_SUMMARIZATION_CONFIG } from '@core/summarizer';
import { DEFAULT_TTS_CONFIG } from '@services/tts-service';
import { normalizePresetId } from '@core/creation-preset';
import { normalizeNarrationPerspective } from '@core/narration';
import { normalizeStatusHudConfig } from '@core/status-schema';
import { encryptApiKey, isEncrypted } from '@core/api-key-crypto';
import {
  normalizeCustomTheme,
  normalizeImageGenConfig,
  normalizeSamplingDefaults,
} from './normalize';
import type { SettingsCtx, SettingsStorageAdapter } from './ctx';

/**
 * R2-5：持久化域（首帧加载 / 串行化写入 / 主密码透明加密）。
 *
 * 这一模块的三个不变式（拆文件时必须一起搬，否则会丢数据）：
 * 1. **写入串行**：`persistInFlight` + `persistWaiters` 保证写入顺序 = 状态顺序（M2-b8）。
 * 2. **加载期排队**：加载在飞时的写入排到加载之后，否则用默认值盖掉存档。
 * 3. **加载期用户优先**：窗口里用户点过的标量字段在存档落地后再应用一次（M9-a/M9-b）。
 */
export interface PersistenceDeps {
  setTheme: (t: ThemeName) => void;
  setFontSize: (size: number) => void;
  applyCustomCss: (css: string) => void;
  applyCustomTheme: (ct: CustomTheme | null) => void;
  syncRemoteApiKeyState: () => void;
}

export function createPersistenceActions(ctx: SettingsCtx, deps: PersistenceDeps) {
  let storageAdapter: SettingsStorageAdapter | null = null;

  let persistInFlight: Promise<void> | null = null;
  const persistWaiters: Array<() => void> = [];
  /** 首帧存档加载的在飞 promise（见 `loadFromStorage`） */
  let loadInFlight: Promise<void> | null = null;
  /** 加载流程自己发起、且被它 await 的那次写入（首启默认快照）不能再等加载，否则自己等自己 */
  let bypassLoadGate = false;
  /**
   * 加载往内存灌存档值时顺带触发的写入：照旧排队（半加载状态落盘会把还没赋值的
   * apiProfiles 写成空），只是不参与"用户在窗口里改了什么"的取样。
   */
  let insideLoadOwnWrite = false;

  /** 加载开始时内存里的那份（= 默认值）；窗口内用户那次写入想落的值 */
  let scalarsAtLoadStart: Partial<AppSettings> | null = null;
  let scalarsWantedDuringLoad: Partial<AppSettings> | null = null;

  /**
   * 注入存储适配器（应用启动时由 App.vue 调用）
   */
  function setStorageAdapter(adapter: SettingsStorageAdapter | null): void {
    storageAdapter = adapter;
  }

  /**
   * 首帧加载窗口内"以用户为准"的字段（M9-b）。
   *
   * 两条限制，各有原因：
   * - 不含集合类字段（`apiProfiles` / `quickReplies` / `uiSectionOpen` …）：它们在窗口里的值
   *   是从"还没读到存档"的内存算出来的，回写等于用"默认值 + 一次点击"换掉存档里的整批记录，
   *   比"把用户那次改动盖回"更糟。这些仍以存档为准。
   * - 不含 `locale`：初值是同步求出的（镜像 > 浏览器语言），读到存档里的显式选择时它还会
   *   再变一次；这个"加载中途变了"不是用户改动，混进窗口会被当成用户改动而保留。
   */
  const USER_WINS_KEYS = [
    'theme',
    'fontSize',
    'customCss',
    'creationPreset',
    'narrationPerspective',
    'maxContextTokens',
    'reservedTokens',
  ] as const;

  /** 上述字段的当前值（同步读，用于比对"用户在窗口里改了哪几项"） */
  function scalarView(): Partial<AppSettings> {
    return {
      theme: ctx.theme.value,
      fontSize: ctx.fontSize.value,
      customCss: ctx.customCss.value,
      creationPreset: ctx.creationPreset.value,
      narrationPerspective: ctx.narrationPerspective.value,
      maxContextTokens: ctx.maxContextTokens.value,
      reservedTokens: ctx.reservedTokens.value,
    };
  }

  /**
   * 加载自己触发的写入：既不排"等加载"的队（否则首启自锁），也不参与
   * "用户在窗口里改了什么"的取样——它带的就是存档值，取样它会让每次启动都多跑一遍回写。
   */
  function loadOwnWrite(fn: () => void): void {
    insideLoadOwnWrite = true;
    try {
      fn();
    } finally {
      insideLoadOwnWrite = false;
    }
  }

  /**
   * 持久化当前设置到存储层
   *
   * AC20 透明加密层：
   * - 若 masterPassword 已设置，对 apiProfiles[*].apiKey / translationConfig.apiKey /
   *   imageGenConfig.apiKey 在持久化前进行 AES-GCM 加密（已加密的密文不重复加密）
   * - 内存中保留明文，存储层存密文
   *
   * 注意：Vue 的 reactive Proxy 无法被 IndexedDB 结构化克隆，
   * 需要通过 toRaw() 转换为普通对象再传递给存储适配器
   */
  async function writeSettingsSnapshot(): Promise<void> {
    if (!storageAdapter) return;
    try {
      // AC20 透明加密：若已设置主密码，加密 apiKey 字段后再保存
      const pw = ctx.masterPassword.value;
      const profilesToSave = pw
        ? await Promise.all(
            toRaw(ctx.apiProfiles.value)
              .map((p) => toRaw(p))
              .map(async (p) => ({
                ...p,
                apiKey:
                  p.apiKey && !isEncrypted(p.apiKey) ? await encryptApiKey(p.apiKey, pw) : p.apiKey,
              }))
          )
        : toRaw(ctx.apiProfiles.value).map((p) => toRaw(p));

      const translationToSave =
        pw && ctx.translationConfig.value.apiKey && !isEncrypted(ctx.translationConfig.value.apiKey)
          ? {
              ...toRaw(ctx.translationConfig.value),
              apiKey: await encryptApiKey(ctx.translationConfig.value.apiKey, pw),
            }
          : toRaw(ctx.translationConfig.value);

      const imageGenToSave =
        pw && ctx.imageGenConfig.value.apiKey && !isEncrypted(ctx.imageGenConfig.value.apiKey)
          ? {
              ...toRaw(ctx.imageGenConfig.value),
              apiKey: await encryptApiKey(ctx.imageGenConfig.value.apiKey, pw),
            }
          : toRaw(ctx.imageGenConfig.value);

      await storageAdapter.saveSettings({
        theme: ctx.theme.value,
        fontSize: ctx.fontSize.value,
        locale: ctx.locale.value,
        apiProfiles: profilesToSave,
        activeApiProfileId: ctx.activeApiProfileId.value,
        chatBackground: toRaw(ctx.chatBackground.value),
        bubbleStyle: toRaw(ctx.bubbleStyle.value),
        customCss: ctx.customCss.value,
        // F08.4 自定义主题持久化
        customTheme: ctx.customTheme.value
          ? {
              background: ctx.customTheme.value.background,
              palette: [...ctx.customTheme.value.palette],
              paletteRatios: [...ctx.customTheme.value.paletteRatios],
              avgLuminance: ctx.customTheme.value.avgLuminance,
              tokens: { ...ctx.customTheme.value.tokens },
            }
          : null,
        // F12.2/F12.3/F12.4 配置持久化
        ttsConfig: toRaw(ctx.ttsConfig.value),
        translationConfig: translationToSave,
        summarizationConfig: toRaw(ctx.summarizationConfig.value),
        // E22 图像生成 Provider（apiKey 按主密码状态加密）
        imageGenConfig: imageGenToSave,
        // F11.3 Quick Reply 按钮列表
        quickReplies: toRaw(ctx.quickReplies.value).map((b) => toRaw(b)),
        // AC20 主密码验证器
        masterPasswordVerifier: ctx.masterPasswordVerifier.value,
        // P0-1 思维链偏好
        thinkingConfig: { ...toRaw(ctx.thinkingConfig.value) },
        // P0-3 全局采样默认值（null = 未设置）
        samplingDefaults: ctx.samplingDefaults.value ? { ...toRaw(ctx.samplingDefaults.value) } : null,
        // MODEL-03 创作模式
        creationPreset: ctx.creationPreset.value,
        // 旁白人称
        narrationPerspective: ctx.narrationPerspective.value,
        // P1 状态栏偏好
        statusHudConfig: { ...toRaw(ctx.statusHudConfig.value) },
        // M7-d 折叠段开合记忆
        uiSectionOpen: { ...toRaw(ctx.uiSectionOpen.value) },
        // 上下文长度配置
        maxContextTokens: ctx.maxContextTokens.value,
        reservedTokens: ctx.reservedTokens.value,
      });
    } catch (err) {
      ctx.lastError.value = i18nT('settings.saveFailed', {
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
  function persistSettings(): Promise<void> {
    // 加载在飞时先等它落地再走正常写入：挡住"用默认值盖掉存档"这一类丢数据。
    // 同时记下**第一次**被挡住时的值——加载落地后靠它把用户那几项改动重新应用回去。
    // 只记第一次是有意的：能进这条分支的写，要么是用户在存档到达前点的（要保护），
    // 要么是加载自己往内存里灌存档值时触发的（与默认值的差异回写一遍是无操作）。
    if (loadInFlight && !bypassLoadGate) {
      if (!insideLoadOwnWrite) scalarsWantedDuringLoad ??= scalarView();
      return loadInFlight.then(() => persistSettings());
    }
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

  /** 用户在加载窗口里改过、且属于"以用户为准"清单的那几项 */
  function keepUserChangesDuringLoad(): Partial<AppSettings> | null {
    if (!scalarsWantedDuringLoad || !scalarsAtLoadStart) return null;
    const keep: Partial<AppSettings> = {};
    for (const key of USER_WINS_KEYS) {
      if (scalarsWantedDuringLoad[key] !== scalarsAtLoadStart[key]) {
        Object.assign(keep, { [key]: scalarsWantedDuringLoad[key] });
      }
    }
    return Object.keys(keep).length ? keep : null;
  }

  async function applyStoredSettings(source?: Partial<AppSettings>): Promise<void> {
    if (!storageAdapter) return;
    try {
      // 传 source = 回写用户改动，不再读存档、不再探测浏览器语言、也不再写首启默认值
      const isPatch = source !== undefined;
      const saved: Partial<AppSettings> = source ?? (await storageAdapter.loadSettings());
      // 空对象视为首次启动
      const hasSavedData =
        isPatch ||
        (!!saved &&
          (saved.theme !== undefined ||
            saved.fontSize !== undefined ||
            (Array.isArray(saved.apiProfiles) && saved.apiProfiles.length > 0) ||
            saved.activeApiProfileId !== undefined ||
            // MODEL-03：仅设置了创作模式也应视为已有数据（否则该字段永远读不回来）
            saved.creationPreset !== undefined));
      // P2-3：首访按浏览器语言兜底 —— 这件事已由 i18n 在模块求值时同步做完
      // （`locale` 的初值就是 getLocale()：用户选过的镜像 > 浏览器语言 > zh）。
      // 这里不再重探一次：探测比镜像晚、又不知道镜像的存在，重探会把用户显式选过的
      // 语言盖回浏览器语言。持久化值仍在下方 hasSavedData 分支里覆盖，优先级不变。
      if (hasSavedData) {
        if (saved.theme) loadOwnWrite(() => deps.setTheme(normalizeThemeName(saved.theme!)));
        if (typeof saved.fontSize === 'number') loadOwnWrite(() => deps.setFontSize(saved.fontSize as number));
        // T-13 加载语言（默认 zh）
        if (saved.locale === 'zh' || saved.locale === 'en') {
          ctx.locale.value = saved.locale;
          setI18nLocale(saved.locale);
          // 刷新同步镜像：下次冷启动的首帧就直接是这个值，不再闪
          writeLocaleMirror(saved.locale);
        }
        if (Array.isArray(saved.apiProfiles)) ctx.apiProfiles.value = saved.apiProfiles;
        if (typeof saved.activeApiProfileId !== 'undefined') {
          ctx.activeApiProfileId.value = saved.activeApiProfileId;
        }
        // F08.2 加载聊天背景（向后兼容：无字段时保留默认值）
        if (saved.chatBackground) {
          ctx.chatBackground.value = { ...ctx.chatBackground.value, ...saved.chatBackground };
        }
        if (saved.bubbleStyle) {
          ctx.bubbleStyle.value = { ...ctx.bubbleStyle.value, ...saved.bubbleStyle };
        }
        // F08.3 加载自定义 CSS 并注入
        if (typeof saved.customCss === 'string') {
          ctx.customCss.value = saved.customCss;
          deps.applyCustomCss(saved.customCss);
        }
        // F08.4 加载自定义主题并注入（仅当主题为 custom 时生效）
        if (saved.customTheme && typeof saved.customTheme === 'object') {
          const ct = saved.customTheme as CustomTheme;
          ctx.customTheme.value = normalizeCustomTheme(ct);
          deps.applyCustomTheme(ctx.customTheme.value);
        }
        // F12.2 加载 TTS 配置
        if (saved.ttsConfig && typeof saved.ttsConfig === 'object') {
          ctx.ttsConfig.value = { ...DEFAULT_TTS_CONFIG, ...saved.ttsConfig };
        }
        // F12.3 加载翻译配置
        if (saved.translationConfig && typeof saved.translationConfig === 'object') {
          ctx.translationConfig.value = { ...DEFAULT_TRANSLATION_CONFIG, ...saved.translationConfig };
        }
        // F12.4 加载自动摘要配置
        if (saved.summarizationConfig && typeof saved.summarizationConfig === 'object') {
          ctx.summarizationConfig.value = {
            ...DEFAULT_SUMMARIZATION_CONFIG,
            ...saved.summarizationConfig,
          };
        }
        // E22 加载图像生成 Provider（旧数据缺字段时保留默认；脏字段逐项回落默认）
        if (saved.imageGenConfig && typeof saved.imageGenConfig === 'object') {
          ctx.imageGenConfig.value = normalizeImageGenConfig(saved.imageGenConfig);
        }
        // F11.3 加载 Quick Reply 按钮列表
        if (Array.isArray(saved.quickReplies)) {
          ctx.quickReplies.value = saved.quickReplies;
        }
        // P0-1 加载思维链偏好（向后兼容：无字段时保留默认值）
        if (saved.thinkingConfig && typeof saved.thinkingConfig === 'object') {
          const tc = saved.thinkingConfig as Partial<ThinkingConfig>;
          ctx.thinkingConfig.value = {
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
          ctx.samplingDefaults.value = normalizeSamplingDefaults(saved.samplingDefaults);
        }
        // MODEL-03 加载创作模式（旧数据缺字段时保留默认 balanced）
        if (saved.creationPreset !== undefined) {
          ctx.creationPreset.value = normalizePresetId(saved.creationPreset);
        }
        // 旁白人称（旧数据缺字段时保留默认 'me'；脏值回落默认）
        if (saved.narrationPerspective !== undefined) {
          ctx.narrationPerspective.value = normalizeNarrationPerspective(saved.narrationPerspective);
        }
        // P1 加载状态栏偏好（向后兼容：无字段时保留默认值；脏字段回落默认）
        if (saved.statusHudConfig && typeof saved.statusHudConfig === 'object') {
          ctx.statusHudConfig.value = normalizeStatusHudConfig(saved.statusHudConfig);
        }
        // M7-d 加载折叠段开合记忆（只收 boolean，脏键值直接丢）
        if (saved.uiSectionOpen && typeof saved.uiSectionOpen === 'object') {
          const clean: Record<string, boolean> = {};
          for (const [k, v] of Object.entries(saved.uiSectionOpen as Record<string, unknown>)) {
            if (typeof v === 'boolean') clean[k] = v;
          }
          ctx.uiSectionOpen.value = clean;
        }
        // 加载上下文长度配置（向后兼容：旧数据缺字段时保留默认 8192 / 1024）
        if (typeof saved.maxContextTokens === 'number' && Number.isFinite(saved.maxContextTokens)) {
          ctx.maxContextTokens.value = Math.floor(saved.maxContextTokens);
        }
        if (typeof saved.reservedTokens === 'number' && Number.isFinite(saved.reservedTokens)) {
          ctx.reservedTokens.value = Math.floor(saved.reservedTokens);
        }
        // 防御脏数据：max ≤ reserved 会使预算为 0，整组回落默认，避免历史无法装入
        if (ctx.maxContextTokens.value <= ctx.reservedTokens.value) {
          ctx.maxContextTokens.value = DEFAULT_MAX_CONTEXT_TOKENS;
          ctx.reservedTokens.value = DEFAULT_RESERVED_TOKENS;
        }
        // AC20 加载主密码验证器（apiKey 字段保持加密形式，待 unlock 后解密）
        if (typeof saved.masterPasswordVerifier !== 'undefined') {
          ctx.masterPasswordVerifier.value = saved.masterPasswordVerifier;
        }
        // P1-4：按主密码状态初始化远程向量密钥的内存态
        // （已设主密码 -> locked，待 unlock 后解密；未设 -> plain，沿用明文）
        // 回写用户改动时不再跑：它属于"刚读到存档"的一次性状态推导，重复执行会把
        // 解密失败一类的错误信息覆盖掉（master-password 那组用例守着）。
        if (!isPatch) {
          deps.syncRemoteApiKeyState();
        }
        // 末尾重断言 data-theme：customTheme 注入后再次同步 DOM 与 store，
        // 避免异步启动时序导致 data-theme 回退为默认（刷新后自定义主题失效）
        loadOwnWrite(() => deps.setTheme(ctx.theme.value));
      } else {
        // 首次启动：写入默认设置。这条写来自加载自己，若也去排"等加载落地"的队，
        // 就变成等它自己完成 ⇒ 启动即卡死（全量 e2e 表现为大面积超时）。
        bypassLoadGate = true;
        try {
          await persistSettings();
        } finally {
          bypassLoadGate = false;
        }
      }
    } catch (err) {
      ctx.lastError.value = i18nT('settings.loadFailed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * 从存储层加载设置
   * 若存储为空（首次启动），保留默认值并写入存储
   *
   * AC20 安全：apiKey 字段以加密形式加载到内存。
   * 解密需在 unlock() 成功后通过 decryptAllApiKeys() 触发。
   */
  async function loadFromStorage(): Promise<void> {
    // 登记"存档正在读"。App.vue 是在 onMounted 里才 await 这里的，也就是说界面已经挂好、
    // 按钮已经能点而数据还没回来——这期间发起的写入必须排队到加载落地之后，
    // 否则写下去的是内存里的默认值（apiProfiles 空），会把用户已有的配置抹掉。
    if (!loadInFlight) {
      scalarsAtLoadStart = { ...scalarView() };
      loadInFlight = (async () => {
        await applyStoredSettings();
        // 存档落地后，把用户在窗口里改过的那几项**再应用一次**——否则他刚点的开关/主题
        // 会被随后到达的存档静默抹掉（M9-a 登记的边界 ①）
        const keep = keepUserChangesDuringLoad();
        if (keep) {
          // 这次回写发生在加载自己的流程里，不能再排"等加载"的队，否则等的是它自己
          bypassLoadGate = true;
          try {
            await applyStoredSettings(keep);
          } finally {
            bypassLoadGate = false;
          }
        }
      })().finally(() => {
        loadInFlight = null;
        scalarsAtLoadStart = null;
        scalarsWantedDuringLoad = null;
      });
    }
    return loadInFlight;
  }

  /** 清掉最近一次错误（UI 反馈用） */
  function clearLastError(): void {
    ctx.lastError.value = null;
  }

  return {
    setStorageAdapter,
    loadFromStorage,
    persistSettings,
    clearLastError,
  };
}
