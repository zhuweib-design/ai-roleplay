/**
 * UI 层共享类型定义
 *
 * 核心数据类型（CharacterCard、ChatMessage）定义在 @core/character-card
 * 此文件仅定义 UI 专有的扩展类型
 */

import type { CharacterAttributes } from '@core/character-card';

export type NavKey = 'chat' | 'character' | 'worldbook' | 'group' | 'databank' | 'archives' | 'settings' | 'story' | 'random-events' | 'local-model' | 'image-gen' | 'character-version' | 'community-market' | 'profile';

/** UI 层消息类型（扩展核心 ChatMessage，增加展示状态字段） */
export interface UIMessage {
  id: string;
  role: 'user' | 'assistant';
  /** 旁白/动作描述（斜体灰色，正文前） */
  narration?: string;
  /** 正文 */
  content: string;
  /** 旁白/动作描述（斜体灰色，正文后） */
  narrationAfter?: string;
  /** 是否正在生成中 */
  generating?: boolean;
  timestamp: number;
}

export interface Conversation {
  id: string;
  title: string;
  updatedAt: string;
  /** F11.2 局部变量（随对话持久化，由斜杠命令 /setvar 设置） */
  variables?: Record<string, string>;
}

export interface WorldEntry {
  id: string;
  name: string;
  enabled: boolean;
}

export interface TokenBudget {
  character: number;
  worldInfo: number;
  chatHistory: number;
  remaining: number;
}

/** UI 层角色类型（对应设计稿，后续 Phase D 与核心 CharacterCard 对接） */
export interface UICharacter {
  id: string;
  name: string;
  avatar?: string;
  avatarType: 'image' | 'gradient';
  gradientFrom?: string;
  gradientTo?: string;
  initial?: string;
  lastActive: string;
  favorite: boolean;
  tags: string[];
  description: string;
  /** 核心层 personality/scenario 独立透传（避免合并进 description 后再次保存丢失，候选3） */
  personality?: string;
  scenario?: string;
  model: string;
  conversations: Conversation[];
  messages: UIMessage[];
  authorNote: string;
  authorDepth: number;
  temperature: number;
  maxTokens: number;
  worldEntries: WorldEntry[];
  tokenBudget: TokenBudget;
  /** F01.6 角色属性（可选，v1.1 新增） */
  attributes?: CharacterAttributes;
  /** F16.4 关联的故事 ID（null 表示未关联故事，不启用时间/主角系统） */
  storyId?: string | null;
  /**
   * 需求7：绑定的世界书 ID 列表（角色 ↔ 世界书 双向绑定）
   * - 作为正向关系的唯一数据源
   * - 反向关系（世界书 → 角色）由 lorebook store computed 派生
   * - 未设置时视为空数组（向后兼容）
   */
  boundWorldBookIds?: string[];
}

export interface ApiProfile {
  id: string;
  name: string;
  provider: 'openai' | 'anthropic' | 'custom' | 'deepseek' | 'local';
  baseUrl: string;
  apiKey: string;
  model: string;
  /** 需求3：模型分类（默认 'chat'，向后兼容） */
  category?: ModelCategory;
  /** 需求3：是否为该分类的主模型（每分类至多 1 个） */
  isPrimary?: boolean;
  /**
   * 需求3：默认最大 Tokens（角色未单独设置 maxTokens 时使用）
   * 未设置时回退到 ChatManager 默认值
   */
  maxTokens?: number;
}

/** 需求3：模型分类 */
export type ModelCategory = 'chat' | 'image-video' | 'embedding';

/** 需求3：模型分类元数据（用于 UI 展示） */
export interface ModelCategoryMeta {
  value: ModelCategory;
  label: string;
  description: string;
}

/** 需求3：所有模型分类（有序） */
export const MODEL_CATEGORIES: readonly ModelCategoryMeta[] = [
  { value: 'chat', label: '对话通用', description: '用于角色对话、故事生成等文本场景' },
  { value: 'image-video', label: '图片/视频', description: '用于图像和视频生成场景' },
  { value: 'embedding', label: 'Embedding', description: '用于向量嵌入与 RAG 检索场景' },
] as const;

/** 主题名：深色（默认）/ 亮色 / 午夜蓝 / OLED 黑 / 暗夜剧场 */
export type ThemeName = 'dark' | 'light' | 'midnight' | 'oled' | 'theatre';

/** 字号档位：12 / 14 / 16 / 18 */
export type FontSizePreset = 12 | 14 | 16 | 18;

export const FONT_SIZE_PRESETS: readonly FontSizePreset[] = [12, 14, 16, 18] as const;

export const THEME_PRESETS: readonly ThemeName[] = ['dark', 'light', 'midnight', 'oled', 'theatre'] as const;

/**
 * 聊天背景配置 (F08.2)
 * - 'none'：无背景（使用主题默认色）
 * - 'url'：使用 URL 加载背景图
 * - 'base64'：本地上传转 Base64 内联
 */
export interface ChatBackground {
  /** 背景来源类型 */
  type: 'none' | 'url' | 'base64';
  /** 背景值：type='none' 时为空；'url' 时为图片 URL；'base64' 时为 data URL */
  value: string;
  /** 不透明度 0-1（1 = 完全不透明） */
  opacity: number;
  /** 模糊度 px（0 = 无模糊） */
  blur: number;
}

/** 消息气泡样式 (F08.2) */
export interface BubbleStyle {
  /** 圆角 px（0-24） */
  radius: number;
  /** 不透明度 0-1（1 = 完全不透明） */
  opacity: number;
}

export interface AppSettings {
  theme: ThemeName;
  fontSize: number;
  apiProfiles: ApiProfile[];
  activeApiProfileId: string | null;
  /** F07 新增：当前激活的 Persona ID（null 表示使用默认 "User"） */
  activePersonaId: string | null;
  /** F08.2 新增：聊天背景配置（v1.1） */
  chatBackground: ChatBackground;
  /** F08.2 新增：消息气泡样式（v1.1） */
  bubbleStyle: BubbleStyle;
  /** F08.3 新增：自定义 CSS 代码（v1.1，注入到页面 <style>） */
  customCss: string;
  /** F12.2 新增：TTS 语音朗读配置（v1.1） */
  ttsConfig: import('@services/tts-service').TTSConfig;
  /** F12.3 新增：消息翻译配置（v1.1） */
  translationConfig: import('@services/translator').TranslationConfig;
  /** F12.4 新增：自动摘要配置（v1.1） */
  summarizationConfig: import('@core/summarizer').SummarizationConfig;
  /** F11.3 新增：Quick Reply 按钮列表（v1.1） */
  quickReplies: QuickReplyButton[];
  /**
   * AC20 新增：主密码验证器（加密格式 enc:v1:...）
   *
   * 用途：用于在应用启动时验证用户输入的主密码是否正确。
   * 存储形式：随机 32 字节明文经主密码加密后的密文。
   * 主密码本身不存储（仅运行时内存，刷新后需重新解锁）。
   * null 表示尚未设置主密码（首次启动或用户主动关闭加密）。
   */
  masterPasswordVerifier?: string | null;
}

/**
 * Quick Reply 按钮 (F11.3)
 * 显示在输入框上方的快捷按钮，点击执行绑定脚本
 */
export interface QuickReplyButton {
  /** 唯一 ID */
  id: string;
  /** 按钮显示标签 */
  label: string;
  /** 绑定的脚本（斜杠命令或普通文本） */
  script: string;
  /** 分组名（用于 UI 分组显示，空字符串表示未分组） */
  group: string;
  /** 是否自动发送（true=点击立即执行，false=填入输入框待编辑） */
  autoSend: boolean;
}

/**
 * 用户 Persona (F07.1)
 *
 * 规则约束：
 * - 名称 1-30 字符
 * - 描述建议 ≤500 字符（占用永久 Token）
 * - 至少 1 个 Persona（默认名称 "User"）
 */
export interface Persona {
  /** 唯一 ID */
  id: string;
  /** Persona 名称（{{user}} 宏替换为此值） */
  name: string;
  /** Persona 描述（外貌/性格/背景等，注入提示词） */
  description: string;
  createdAt: string;
  updatedAt: string;
}
