import type { Ref } from 'vue';
import type {
  ApiProfile,
  AppSettings,
  BubbleStyle,
  ChatBackground,
  CustomTheme,
  QuickReplyButton,
  SamplingOverrides,
  ThemeName,
  ThinkingConfig,
} from '@/types';
import type { TTSConfig } from '@services/tts-service';
import type { TranslationConfig } from '@services/translator';
import type { SummarizationConfig } from '@core/summarizer';
import type { ImageProviderConfig } from '@core/image-generation';
import type { StatusHudConfig } from '@core/status-schema';
import type { PresetId } from '@core/creation-preset';
import type { NarrationPerspective } from '@core/narration';
import type { Locale } from '@/i18n';

/**
 * R2-5：settings store 的拆分上下文。
 *
 * 各子模块（appearance / profiles / security / persistence）都通过这一个对象读写
 * 同一个 set 的 ref —— 引用是同一份，所以拆文件不会改变 Pinia 的响应式边界
 * （这是 R2 批次最大的风险点，见 DEV_PLAN §7.7）。
 *
 * `persistSettings` 由持久化模块在装配时回填：security/appearance 在模块工厂期
 * 就会捕获 ctx，但真正调用都发生在运行时，那时回填已完成。
 */
export interface SettingsCtx {
  // 外观
  theme: Ref<ThemeName>;
  fontSize: Ref<number>;
  locale: Ref<Locale>;
  chatBackground: Ref<ChatBackground>;
  bubbleStyle: Ref<BubbleStyle>;
  customCss: Ref<string>;
  customTheme: Ref<CustomTheme | null>;

  // API Profile
  apiProfiles: Ref<ApiProfile[]>;
  activeApiProfileId: Ref<string | null>;

  // 各类配置
  ttsConfig: Ref<TTSConfig>;
  translationConfig: Ref<TranslationConfig>;
  imageGenConfig: Ref<ImageProviderConfig>;
  summarizationConfig: Ref<SummarizationConfig>;
  quickReplies: Ref<QuickReplyButton[]>;
  thinkingConfig: Ref<ThinkingConfig>;
  samplingDefaults: Ref<SamplingOverrides | null>;
  creationPreset: Ref<PresetId>;
  narrationPerspective: Ref<NarrationPerspective>;
  statusHudConfig: Ref<StatusHudConfig>;
  uiSectionOpen: Ref<Record<string, boolean>>;
  maxContextTokens: Ref<number>;
  reservedTokens: Ref<number>;

  // 安全会话（仅内存）
  masterPassword: Ref<string>;
  masterPasswordVerifier: Ref<string | null>;

  // 错误反馈
  lastError: Ref<string | null>;

  /** 装配期回填的真实实现（持久化模块提供） */
  persistSettings: () => Promise<void>;
}

/** 存储适配器的最小接口（避免子模块依赖整个 StorageAdapter） */
export type SettingsStorageAdapter = {
  saveSettings(settings: AppSettings): Promise<void>;
  loadSettings(): Promise<Partial<AppSettings>>;
};
