/**
 * TTS 语音朗读 (F12.2, v1.1 新增)
 *
 * 业务逻辑：
 * - 使用浏览器原生 Web Speech API（SpeechSynthesis）朗读 AI 回复
 * - 可配置朗读触发条件：每条 / 手动 / 仅 @ 提及
 * - 可配置语音类型、语速（0.5-2）、音调（0-2）
 * - 支持按角色配置不同语音（characterVoice）
 *
 * 规则约束：
 * - 部分浏览器/系统可能不支持中文语音，不可用时隐藏 TTS 选项
 * - TTS 在用户切换标签页/应用时自动暂停
 * - 流式生成中不朗读（仅朗读已完成的消息）
 */

// ── TTS 配置 ──

/** 朗读触发条件 */
export type TTSTrigger = 'every' | 'manual' | 'mention';

/** TTS 全局配置 */
export interface TTSConfig {
  /** 是否启用 */
  enabled: boolean;
  /** 触发条件 */
  trigger: TTSTrigger;
  /** 语音类型（SpeechSynthesisVoice.voiceURI） */
  voiceURI: string | null;
  /** 语速 0.5-2，默认 1 */
  rate: number;
  /** 音调 0-2，默认 1 */
  pitch: number;
  /** 音量 0-1，默认 1 */
  volume: number;
}

export const DEFAULT_TTS_CONFIG: TTSConfig = {
  enabled: false,
  trigger: 'manual',
  voiceURI: null,
  rate: 1,
  pitch: 1,
  volume: 1,
};

/** 角色专属语音配置 */
export interface CharacterVoice {
  characterId: string;
  voiceURI: string | null;
  rate?: number;
  pitch?: number;
}

// ── 语音列表 ──

/** 简化的语音信息（用于 UI 展示） */
export interface VoiceInfo {
  voiceURI: string;
  name: string;
  lang: string;
  localService: boolean;
  default: boolean;
}

/**
 * 获取可用语音列表
 *
 * 浏览器中 SpeechSynthesis voice 加载是异步的，
 * 首次调用可能返回空数组，需通过 onvoiceschanged 事件或轮询获取。
 *
 * @returns 可用语音列表，若环境不支持返回空数组
 */
export function getAvailableVoices(): VoiceInfo[] {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    return [];
  }
  return window.speechSynthesis.getVoices().map((v) => ({
    voiceURI: v.voiceURI,
    name: v.name,
    lang: v.lang,
    localService: v.localService,
    default: v.default,
  }));
}

/**
 * 检测浏览器是否支持 TTS
 */
export function isTTSSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/**
 * 检测是否包含中文语音
 */
export function hasChineseVoice(): boolean {
  const voices = getAvailableVoices();
  return voices.some((v) => v.lang.startsWith('zh'));
}

// ── TTS 服务（单例） ──

/**
 * 朗读状态
 */
export type SpeakStatus = 'idle' | 'speaking' | 'paused';

/**
 * 朗读选项
 */
export interface SpeakOptions {
  text: string;
  voiceURI?: string | null;
  rate?: number;
  pitch?: number;
  volume?: number;
  /** 朗读开始回调 */
  onStart?: () => void;
  /** 朗读结束回调 */
  onEnd?: () => void;
  /** 朗读错误回调 */
  onError?: (error: string) => void;
  /** 朗读边界回调（用于高亮当前词） */
  onBoundary?: (charIndex: number) => void;
}

class TTSService {
  // 显式标注类型避免 TypeScript 控制流分析问题（运行时通过闭包赋值）
  private _currentUtterance: SpeechSynthesisUtterance | null = null;
  private currentOptions: SpeakOptions | null = null;
  private status: SpeakStatus = 'idle';

  /** 当前朗读的 utterance（供测试访问） */
  get currentUtterance(): SpeechSynthesisUtterance | null {
    return this._currentUtterance;
  }

  /** 当前朗读状态 */
  getStatus(): SpeakStatus {
    return this.status;
  }

  /** 当前是否正在朗读 */
  get isSpeaking(): boolean {
    return this.status === 'speaking';
  }

  /**
   * 朗读文本
   *
   * @returns 是否成功开始朗读（环境不支持或空文本时返回 false）
   */
  speak(options: SpeakOptions): boolean {
    if (!isTTSSupported()) {
      options.onError?.('当前浏览器不支持语音合成');
      return false;
    }
    if (!options.text || options.text.trim() === '') {
      return false;
    }

    // 停止当前朗读
    this.stop();

    const synth = window.speechSynthesis;
    const utterance = new SpeechSynthesisUtterance(options.text);

    // 应用配置
    if (options.voiceURI) {
      const voices = synth.getVoices();
      const voice = voices.find((v) => v.voiceURI === options.voiceURI);
      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang;
      }
    }
    if (options.rate !== undefined) {
      utterance.rate = Math.max(0.5, Math.min(2, options.rate));
    }
    if (options.pitch !== undefined) {
      utterance.pitch = Math.max(0, Math.min(2, options.pitch));
    }
    if (options.volume !== undefined) {
      utterance.volume = Math.max(0, Math.min(1, options.volume));
    }

    // 绑定回调
    utterance.onstart = () => {
      this.status = 'speaking';
      options.onStart?.();
    };
    utterance.onend = () => {
      this.status = 'idle';
      this._currentUtterance = null;
      this.currentOptions = null;
      options.onEnd?.();
    };
    utterance.onerror = (event) => {
      this.status = 'idle';
      this._currentUtterance = null;
      this.currentOptions = null;
      const errorMsg = event.error || 'unknown';
      // interrupted/canceled 是用户主动停止，不算错误
      if (errorMsg !== 'interrupted' && errorMsg !== 'canceled') {
        options.onError?.(errorMsg);
      } else {
        // 主动停止时也触发 onEnd（让 UI 状态归位）
        options.onEnd?.();
      }
    };
    utterance.onboundary = (event) => {
      if (typeof event.charIndex === 'number') {
        options.onBoundary?.(event.charIndex);
      }
    };

    this._currentUtterance = utterance;
    this.currentOptions = options;
    synth.speak(utterance);
    return true;
  }

  /**
   * 暂停朗读
   */
  pause(): void {
    if (this.status === 'speaking' && isTTSSupported()) {
      window.speechSynthesis.pause();
      this.status = 'paused';
    }
  }

  /**
   * 恢复朗读
   */
  resume(): void {
    if (this.status === 'paused' && isTTSSupported()) {
      window.speechSynthesis.resume();
      this.status = 'speaking';
    }
  }

  /**
   * 停止朗读
   */
  stop(): void {
    if (isTTSSupported()) {
      window.speechSynthesis.cancel();
    }
    const wasSpeaking = this.status !== 'idle';
    const opts = this.currentOptions;
    this._currentUtterance = null;
    this.currentOptions = null;
    this.status = 'idle';
    // 触发 onEnd 让 UI 状态归位
    if (wasSpeaking && opts) {
      opts.onEnd?.();
    }
  }

  /**
   * 判断消息是否应该朗读（按触发条件）
   *
   * @param trigger 触发条件
   * @param message 消息内容
   * @param role 角色（user/assistant）
   */
  shouldSpeak(
    trigger: TTSTrigger,
    _message: string,
    role: 'user' | 'assistant'
  ): boolean {
    // 用户消息默认不朗读（仅朗读 AI 回复）
    if (role === 'user') return false;
    if (trigger === 'every') return true;
    if (trigger === 'manual') return false; // 手动触发由调用方判断
    if (trigger === 'mention') {
      // 仅 @ 提及模式：检查消息是否包含 @用户名
      // 简化实现：检查是否包含 @ 字符
      return _message.includes('@');
    }
    return false;
  }
}

// 单例
export const ttsService = new TTSService();
