/**
 * 聊天错误文案矩阵（F-1，跨端一致性修复）
 *
 * 背景：原先三端（浏览器 / Tauri 桌面 / 本地模型）的聊天失败都共用同一句
 * `char.genFailed3`（裸 err.message），用户无法区分「跨域被拦 / 桌面请求失败 /
 * 本地模型推理失败」，难以自助排查。
 *
 * 本模块基于已有的 `classifyChatError` 产出 + 传输层推断，做 transport × kind 矩阵，
 * 输出 i18n 键与参数，由调用方用 `t()` 渲染。至少区分 cors / Tauri / local 三类。
 */
import { ApiError, type ApiErrorKind } from '@/api/types';
import { isTauriEnv } from '@/core/model-file-adapter';
import { classifyChatError } from './chat-manager';

export type ChatErrorTransport = 'tauri' | 'local' | 'browser';

export interface ChatErrorDetail {
  type: 'aborted' | 'api' | 'network' | 'unknown';
  transport: ChatErrorTransport;
  kind?: ApiErrorKind;
  statusCode?: number;
}

/** 本地模型（web-llm / onnx）推理路径的错误标记 */
function isLocalModelError(err: Error): boolean {
  const k = (err as { kind?: string }).kind;
  if (k === 'local') return true;
  // 英文关键词（web-llm / onnxruntime / local model 路径）
  if (/web-?llm|onnxruntime|local model|model load/i.test(err.message)) return true;
  // 中文报错关键词（onnxruntime-web / web-llm 在部分环境下抛出中文错误，非 UI 文案）
  if (/本地模型|加载模型/i.test(err.message)) return true;
  return false;
}

/**
 * 推断传输层（F-1：cors / Tauri / local 三类区分的最小依据）
 */
export function analyzeChatError(err: Error): ChatErrorDetail {
  const kind = err instanceof ApiError ? err.kind : (err as { kind?: ApiErrorKind }).kind;
  const statusCode = err instanceof ApiError ? err.statusCode : undefined;
  const type = classifyChatError(err);

  let transport: ChatErrorTransport;
  if (isTauriEnv()) {
    transport = 'tauri';
  } else if (isLocalModelError(err)) {
    transport = 'local';
  } else {
    transport = 'browser';
  }

  return { type, transport, kind, statusCode };
}

export interface ChatErrorI18n {
  key:
    | 'char.stoppedGen2'
    | 'chat.errCors'
    | 'chat.errTauriApi'
    | 'chat.errTauriNet'
    | 'chat.errLocal'
    | 'chat.errApi'
    | 'chat.errNet'
    | 'chat.errUnknown';
  params?: Record<string, string | number>;
}

/**
 * transport × kind 错误文案矩阵
 *
 * 矩阵（行=传输层，列=kind/type）：
 * - aborted（任意传输层）→ char.stoppedGen2（保留「已停止生成」语义）
 * - browser + cors       → chat.errCors（明确引导跨域根因）
 * - tauri   + api        → chat.errTauriApi（带 HTTP 状态）
 * - tauri   + 其他       → chat.errTauriNet
 * - local   + 任意        → chat.errLocal（本地模型推理失败）
 * - browser + api        → chat.errApi（带 HTTP 状态，密钥/配额）
 * - browser + network     → chat.errNet
 * - 兜底                  → chat.errUnknown（裸 err.message）
 */
export function chatErrorI18n(err: Error): ChatErrorI18n {
  const { type, transport, kind, statusCode } = analyzeChatError(err);
  const status = statusCode != null ? String(statusCode) : '';

  if (type === 'aborted') {
    return { key: 'char.stoppedGen2' };
  }

  // 浏览器跨域：最典型且需明确引导（cors 属于 network 类，但需单独文案）
  if (transport === 'browser' && (kind === 'cors' || /cors/i.test(err.message))) {
    return { key: 'chat.errCors' };
  }

  if (transport === 'tauri') {
    if (type === 'api') {
      return { key: 'chat.errTauriApi', params: { status } };
    }
    return { key: 'chat.errTauriNet', params: { error: err.message } };
  }

  if (transport === 'local') {
    return { key: 'chat.errLocal', params: { error: err.message } };
  }

  // 浏览器通用分支
  if (type === 'api') {
    return { key: 'chat.errApi', params: { status } };
  }
  if (type === 'network') {
    return { key: 'chat.errNet' };
  }
  return { key: 'chat.errUnknown', params: { error: err.message } };
}
