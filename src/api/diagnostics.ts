/**
 * API 错误诊断工具
 *
 * 将 ApiError 转换为用户可读的诊断信息，包含：
 * - 错误分类（kind）
 * - 简短描述
 * - 具体修复建议（按错误类型列出可能原因）
 *
 * 用于 ChatView 错误 Modal 显示，帮助用户排查
 * "生成失败：网络请求失败：Failed to fetch" 等模糊错误
 */

import { ApiError, type ApiErrorKind } from './types';

export interface ApiErrorDiagnostics {
  /** 错误分类（用于 UI 图标/颜色） */
  kind: ApiErrorKind;
  /** 错误简短标题 */
  title: string;
  /** 错误详细描述（用户友好） */
  description: string;
  /** 修复建议清单 */
  suggestions: string[];
}

const DIAGNOSTICS_MAP: Record<ApiErrorKind, Omit<ApiErrorDiagnostics, 'description'>> = {
  aborted: {
    kind: 'aborted',
    title: '已停止生成',
    suggestions: ['点击重新生成可继续对话'],
  },
  'invalid-url': {
    kind: 'invalid-url',
    title: 'API 地址格式错误',
    suggestions: [
      '检查 baseUrl 是否以 http:// 或 https:// 开头',
      '确保地址中无空格（如需空格需进行 URL 编码）',
      '常见格式：https://api.openai.com 或 https://api.deepseek.com',
    ],
  },
  network: {
    kind: 'network',
    title: '网络请求失败',
    suggestions: [
      '1. 检查网络连接是否正常',
      '2. 确认 API 地址可达（可在浏览器中直接访问测试）',
      '3. 若使用跨域 API，需服务商在响应头中允许 CORS',
      '4. 检查 HTTPS 证书是否有效（避免混合内容拦截）',
      '5. Tauri 版本可绕过 CORS（推荐用于第三方 API）',
    ],
  },
  cors: {
    kind: 'cors',
    title: '跨域请求被拦截',
    suggestions: [
      '浏览器禁止跨域调用此 API',
      '方案1：使用 Tauri 桌面端绕过 CORS 限制',
      '方案2：联系 API 服务商开放 CORS 头（Access-Control-Allow-Origin）',
      '方案3：自建反向代理服务器转发请求',
    ],
  },
  auth: {
    kind: 'auth',
    title: 'API Key 未授权',
    suggestions: [
      '1. 检查 API Key 是否正确（在设置 → API 配置中重新输入）',
      '2. 确认 API Key 未过期或被禁用',
      '3. 检查账户余额或配额是否充足',
      '4. 确认 API Key 有访问所选模型的权限',
    ],
  },
  'rate-limit': {
    kind: 'rate-limit',
    title: '调用频率超限',
    suggestions: [
      '1. 稍等几秒后重试',
      '2. 检查 API 调用频率是否超出服务商限制',
      '3. 升级 API 账户的速率限制等级',
    ],
  },
  server: {
    kind: 'server',
    title: 'API 服务器错误',
    suggestions: [
      '1. 服务商服务器临时故障，请稍后重试',
      '2. 检查服务商状态页（status.openai.com 等）',
      '3. 切换到其他 API Profile（设置 → API 配置）',
    ],
  },
  unknown: {
    kind: 'unknown',
    title: '未知错误',
    suggestions: [
      '1. 查看浏览器控制台获取详细错误信息（F12）',
      '2. 检查请求参数是否正确（如模型名是否有效）',
      '3. 若持续失败，请反馈给开发者',
    ],
  },
};

/**
 * 将 ApiError 转换为诊断信息
 */
export function diagnoseApiError(err: ApiError): ApiErrorDiagnostics {
  const base = DIAGNOSTICS_MAP[err.kind] ?? DIAGNOSTICS_MAP.unknown;
  return {
    ...base,
    description: err.message,
  };
}

/**
 * 兜底：将普通 Error 转换为诊断信息
 */
export function diagnoseUnknownError(err: Error): ApiErrorDiagnostics {
  const base = DIAGNOSTICS_MAP.unknown;
  return {
    ...base,
    description: err.message,
  };
}

/**
 * 统一入口：根据任意错误对象生成诊断信息
 */
export function diagnoseError(err: unknown): ApiErrorDiagnostics {
  if (err instanceof ApiError) return diagnoseApiError(err);
  if (err instanceof Error) return diagnoseUnknownError(err);
  return {
    ...DIAGNOSTICS_MAP.unknown,
    description: String(err),
  };
}
