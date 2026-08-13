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
import { t } from '@/i18n';

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
    title: t('diag.abortedTitle'),
    suggestions: [t('diag.abortedSug1')],
  },
  'invalid-url': {
    kind: 'invalid-url',
    title: t('diag.invalidUrlTitle'),
    suggestions: [
      t('diag.invalidUrlSug1'),
      t('diag.invalidUrlSug2'),
      t('diag.invalidUrlSug3'),
    ],
  },
  network: {
    kind: 'network',
    title: t('diag.networkTitle'),
    suggestions: [
      t('diag.networkSug1'),
      t('diag.networkSug2'),
      t('diag.networkSug3'),
      t('diag.networkSug4'),
      t('diag.networkSug5'),
    ],
  },
  cors: {
    kind: 'cors',
    title: t('diag.corsTitle'),
    suggestions: [
      t('diag.corsSug1'),
      t('diag.corsSug2'),
      t('diag.corsSug3'),
      t('diag.corsSug4'),
    ],
  },
  auth: {
    kind: 'auth',
    title: t('diag.authTitle'),
    suggestions: [
      t('diag.authSug1'),
      t('diag.authSug2'),
      t('diag.authSug3'),
      t('diag.authSug4'),
    ],
  },
  'rate-limit': {
    kind: 'rate-limit',
    title: t('diag.rateLimitTitle'),
    suggestions: [
      t('diag.rateLimitSug1'),
      t('diag.rateLimitSug2'),
      t('diag.rateLimitSug3'),
    ],
  },
  server: {
    kind: 'server',
    title: t('diag.serverTitle'),
    suggestions: [
      t('diag.serverSug1'),
      t('diag.serverSug2'),
      t('diag.serverSug3'),
    ],
  },
  unknown: {
    kind: 'unknown',
    title: t('diag.unknownTitle'),
    suggestions: [
      t('diag.unknownSug1'),
      t('diag.unknownSug2'),
      t('diag.unknownSug3'),
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
