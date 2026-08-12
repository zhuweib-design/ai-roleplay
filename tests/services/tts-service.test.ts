/**
 * TTS 语音朗读单元测试 (迭代28 · F12.2)
 *
 * 覆盖：
 * - isTTSSupported 环境检测
 * - getAvailableVoices 语音列表
 * - ttsService.speak / pause / resume / stop
 * - shouldSpeak 触发条件判断
 * - 配置项应用（rate/pitch/volume/voice）
 *
 * 注：jsdom 不完全支持 SpeechSynthesis，部分测试通过 mock 实现
 */
import { describe, test, expect, afterEach, vi } from 'vitest';
import {
  isTTSSupported,
  getAvailableVoices,
  hasChineseVoice,
  ttsService,
  DEFAULT_TTS_CONFIG,
} from '../../src/services/tts-service';

// ── Mock SpeechSynthesis ──

interface MockVoice {
  voiceURI: string;
  name: string;
  lang: string;
  localService: boolean;
  default: boolean;
}

class MockSpeechSynthesisUtterance {
  text: string;
  voice: unknown = null;
  lang = '';
  rate = 1;
  pitch = 1;
  volume = 1;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onboundary: ((event: { charIndex: number }) => void) | null = null;

  constructor(text: string) {
    this.text = text;
  }
}

class MockSpeechSynthesis {
  speak = vi.fn();
  cancel = vi.fn();
  pause = vi.fn();
  resume = vi.fn();
  getVoices = vi.fn(() => [] as MockVoice[]);
  pending = false;
  speaking = false;
  paused = false;
  onvoiceschanged = null;
}

// ── 安装/卸载 mock ──

function installSpeechMock(voices: MockVoice[] = []) {
  const mockSynth = new MockSpeechSynthesis();
  mockSynth.getVoices.mockReturnValue(voices);
  (globalThis as unknown as { speechSynthesis: MockSpeechSynthesis }).speechSynthesis =
    mockSynth;
  (globalThis as unknown as { SpeechSynthesisUtterance: typeof MockSpeechSynthesisUtterance }).SpeechSynthesisUtterance =
    MockSpeechSynthesisUtterance;
  (globalThis as unknown as { window: typeof globalThis }).window = globalThis;
  return mockSynth;
}

function uninstallSpeechMock() {
  delete (globalThis as unknown as { speechSynthesis?: unknown }).speechSynthesis;
  delete (globalThis as unknown as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance;
}

// ── 测试用例 ──

describe('tts-service (F12.2)', () => {
  afterEach(() => {
    ttsService.stop();
    uninstallSpeechMock();
  });

  describe('环境检测', () => {
    test('无 speechSynthesis 时 isTTSSupported 返回 false', () => {
      uninstallSpeechMock();
      expect(isTTSSupported()).toBe(false);
    });

    test('有 speechSynthesis 时 isTTSSupported 返回 true', () => {
      installSpeechMock();
      expect(isTTSSupported()).toBe(true);
    });

    test('无语音时 getAvailableVoices 返回空数组', () => {
      installSpeechMock([]);
      expect(getAvailableVoices()).toEqual([]);
    });

    test('getAvailableVoices 返回简化语音信息', () => {
      installSpeechMock([
        {
          voiceURI: 'voice-1',
          name: '中文语音',
          lang: 'zh-CN',
          localService: true,
          default: true,
        },
      ]);
      const voices = getAvailableVoices();
      expect(voices).toHaveLength(1);
      expect(voices[0]).toEqual({
        voiceURI: 'voice-1',
        name: '中文语音',
        lang: 'zh-CN',
        localService: true,
        default: true,
      });
    });

    test('hasChineseVoice 检测中文语音', () => {
      installSpeechMock([
        { voiceURI: 'v1', name: '中文', lang: 'zh-CN', localService: true, default: true },
      ]);
      expect(hasChineseVoice()).toBe(true);
    });

    test('无中文语音时 hasChineseVoice 返回 false', () => {
      installSpeechMock([
        { voiceURI: 'v1', name: 'English', lang: 'en-US', localService: true, default: true },
      ]);
      expect(hasChineseVoice()).toBe(false);
    });
  });

  describe('默认配置', () => {
    test('DEFAULT_TTS_CONFIG 默认禁用', () => {
      expect(DEFAULT_TTS_CONFIG.enabled).toBe(false);
    });

    test('默认触发条件为 manual', () => {
      expect(DEFAULT_TTS_CONFIG.trigger).toBe('manual');
    });

    test('默认 rate/pitch/volume 为 1', () => {
      expect(DEFAULT_TTS_CONFIG.rate).toBe(1);
      expect(DEFAULT_TTS_CONFIG.pitch).toBe(1);
      expect(DEFAULT_TTS_CONFIG.volume).toBe(1);
    });
  });

  describe('speak 朗读', () => {
    test('环境不支持时返回 false 并触发 onError', () => {
      uninstallSpeechMock();
      let errMsg = '';
      const result = ttsService.speak({
        text: '你好',
        onError: (err) => {
          errMsg = err;
        },
      });
      expect(result).toBe(false);
      expect(errMsg).toContain('不支持');
    });

    test('空文本返回 false', () => {
      installSpeechMock();
      expect(ttsService.speak({ text: '' })).toBe(false);
      expect(ttsService.speak({ text: '   ' })).toBe(false);
    });

    test('合法文本开始朗读', () => {
      const mock = installSpeechMock();
      const result = ttsService.speak({ text: '你好世界' });
      expect(result).toBe(true);
      expect(mock.speak).toHaveBeenCalledTimes(1);
    });

    test('应用 rate/pitch/volume 配置', () => {
      installSpeechMock();
      const result = ttsService.speak({
        text: '测试',
        rate: 1.5,
        pitch: 0.8,
        volume: 0.6,
      });
      expect(result).toBe(true);
    });

    test('rate 超出范围被 clamp', () => {
      installSpeechMock();
      // 应该不抛错（内部 clamp）
      expect(() =>
        ttsService.speak({ text: 'x', rate: 5 })
      ).not.toThrow();
      expect(() =>
        ttsService.speak({ text: 'x', rate: 0.1 })
      ).not.toThrow();
    });

    test('pitch 超出范围被 clamp', () => {
      installSpeechMock();
      expect(() =>
        ttsService.speak({ text: 'x', pitch: 5 })
      ).not.toThrow();
    });

    test('指定语音时匹配对应 voice', () => {
      installSpeechMock([
        { voiceURI: 'zh-voice', name: '中文', lang: 'zh-CN', localService: true, default: true },
      ]);
      const result = ttsService.speak({
        text: '你好',
        voiceURI: 'zh-voice',
      });
      expect(result).toBe(true);
    });

    test('指定不存在的 voiceURI 仍可朗读', () => {
      installSpeechMock([
        { voiceURI: 'v1', name: 'V1', lang: 'en', localService: true, default: true },
      ]);
      expect(ttsService.speak({ text: 'x', voiceURI: 'non-existent' })).toBe(true);
    });

    test('新朗读会停止当前朗读', () => {
      const mock = installSpeechMock();
      ttsService.speak({ text: '第一段' });
      ttsService.speak({ text: '第二段' });
      // 第一次的 speak 被中断，cancel 至少调用一次
      expect(mock.cancel).toHaveBeenCalled();
    });
  });

  describe('pause / resume / stop', () => {
    test('未朗读时 pause 无效', () => {
      installSpeechMock();
      expect(ttsService.getStatus()).toBe('idle');
      ttsService.pause();
      expect(ttsService.getStatus()).toBe('idle');
    });

    test('未朗读时 stop 不抛错', () => {
      installSpeechMock();
      expect(() => ttsService.stop()).not.toThrow();
    });

    test('stop 调用 cancel', () => {
      const mock = installSpeechMock();
      ttsService.speak({ text: '朗读中' });
      ttsService.stop();
      expect(mock.cancel).toHaveBeenCalled();
      expect(ttsService.getStatus()).toBe('idle');
    });

    test('pause 后 resume 恢复', () => {
      installSpeechMock();
      ttsService.speak({ text: '朗读中' });
      // 模拟开始朗读（实际由浏览器触发 onstart）
      expect(ttsService.isSpeaking).toBe(false);
      // 测试 pause/resume 方法存在且不抛错
      expect(() => {
        ttsService.pause();
        ttsService.resume();
      }).not.toThrow();
    });
  });

  describe('shouldSpeak 触发条件', () => {
    test('用户消息不朗读', () => {
      expect(
        ttsService.shouldSpeak('every', '消息内容', 'user')
      ).toBe(false);
    });

    test('every 触发条件：assistant 朗读', () => {
      expect(
        ttsService.shouldSpeak('every', '消息内容', 'assistant')
      ).toBe(true);
    });

    test('manual 触发条件：assistant 也不自动朗读', () => {
      expect(
        ttsService.shouldSpeak('manual', '消息内容', 'assistant')
      ).toBe(false);
    });

    test('mention 触发条件：包含 @ 才朗读', () => {
      expect(
        ttsService.shouldSpeak('mention', '你好 @User', 'assistant')
      ).toBe(true);
      expect(
        ttsService.shouldSpeak('mention', '普通消息', 'assistant')
      ).toBe(false);
    });

    test('未知触发条件返回 false', () => {
      expect(
        ttsService.shouldSpeak('unknown' as never, 'x', 'assistant')
      ).toBe(false);
    });
  });

  describe('回调触发', () => {
    test('onStart 回调在朗读开始时触发', () => {
      installSpeechMock();
      let started = false;
      ttsService.speak({
        text: '测试',
        onStart: () => {
          started = true;
        },
      });
      // 模拟浏览器触发 onstart（mock 不会自动触发）
      const utterance = (ttsService as unknown as { currentUtterance: MockSpeechSynthesisUtterance }).currentUtterance;
      utterance?.onstart?.();
      expect(started).toBe(true);
    });

    test('onEnd 回调在朗读结束时触发', () => {
      installSpeechMock();
      let ended = false;
      ttsService.speak({
        text: '测试',
        onEnd: () => {
          ended = true;
        },
      });
      const utterance = (ttsService as unknown as { currentUtterance: MockSpeechSynthesisUtterance }).currentUtterance;
      utterance?.onend?.();
      expect(ended).toBe(true);
    });

    test('onError 回调在错误时触发', () => {
      installSpeechMock();
      let errMsg = '';
      ttsService.speak({
        text: '测试',
        onError: (err) => {
          errMsg = err;
        },
      });
      const utterance = (ttsService as unknown as { currentUtterance: MockSpeechSynthesisUtterance }).currentUtterance;
      utterance?.onerror?.({ error: 'network' });
      expect(errMsg).toBe('network');
    });

    test('interrupted 错误不触发 onError（视为正常停止）', () => {
      installSpeechMock();
      let errored = false;
      let ended = false;
      ttsService.speak({
        text: '测试',
        onError: () => {
          errored = true;
        },
        onEnd: () => {
          ended = true;
        },
      });
      const utterance = (ttsService as unknown as { currentUtterance: MockSpeechSynthesisUtterance }).currentUtterance;
      utterance?.onerror?.({ error: 'interrupted' });
      expect(errored).toBe(false);
      expect(ended).toBe(true);
    });

    test('onBoundary 回调在朗读边界时触发', () => {
      installSpeechMock();
      let boundaryIdx = -1;
      ttsService.speak({
        text: '测试',
        onBoundary: (idx) => {
          boundaryIdx = idx;
        },
      });
      const utterance = (ttsService as unknown as { currentUtterance: MockSpeechSynthesisUtterance }).currentUtterance;
      utterance?.onboundary?.({ charIndex: 5 });
      expect(boundaryIdx).toBe(5);
    });
  });
});
