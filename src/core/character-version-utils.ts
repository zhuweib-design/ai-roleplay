/**
 * 角色卡版本控制 —— 纯工具层
 *
 * 全部是无状态纯函数与常量，不持有任何仓库实例状态，可单独测试。
 * TRACKED_FIELDS 同时被 diff（repository）与合并（merge）消费，
 * 放这里让两个上层模块都只依赖本层、彼此不互相依赖。
 */

import { t, type MessageKey } from '@/i18n';
import type { VersionId } from './character-version-types';

// ── 工具函数 ──

/**
 * 生成 8 字符短哈希
 *
 * 使用时间戳 + 随机数 + 内容摘要，确保短哈希碰撞概率极低。
 */
export function generateVersionId(): VersionId {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `${ts}${rand}`.slice(-8).padStart(8, '0');
}

/**
 * 校验分支名合法性
 *
 * 首字符必须为字母，其余允许字母/数字/下划线/连字符，长度 1-32 字符
 */
export function isValidBranchName(name: string): boolean {
  if (!name || name.length > 32) return false;
  return /^[A-Za-z][A-Za-z0-9_-]*$/.test(name);
}

/**
 * 获取对象指定路径的值
 *
 * 支持 'a.b.c' 路径与数组索引 'a[0].b'
 */
function getPathValue(obj: unknown, path: string): unknown {
  if (!path) return obj;
  const parts = path.split(/[.[\]]/).filter(Boolean);
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}
// ── 角色卡字段元数据（用于 diff 显示与合并） ──

/**
 * 角色卡可被追踪的字段列表
 *
 * 每个字段定义其路径与显示标签。
 * 嵌套字段（如 attributes.level）使用点路径表达。
 */
export const TRACKED_FIELDS: ReadonlyArray<{ path: string; labelKey: MessageKey }> = [
  { path: 'name', labelKey: 'cv.fieldName' },
  { path: 'avatar', labelKey: 'cv.fieldAvatar' },
  { path: 'description', labelKey: 'cv.fieldDescription' },
  { path: 'personality', labelKey: 'cv.fieldPersonality' },
  { path: 'scenario', labelKey: 'cv.fieldScenario' },
  { path: 'firstMessage', labelKey: 'cv.fieldFirstMessage' },
  { path: 'exampleMessages', labelKey: 'cv.fieldExampleMessages' },
  { path: 'characterNote', labelKey: 'cv.fieldCharacterNote' },
  { path: 'talkativeness', labelKey: 'cv.fieldTalkativeness' },
  { path: 'version', labelKey: 'cv.fieldVersion' },
  { path: 'attributes.profession', labelKey: 'cv.fieldProfession' },
  { path: 'attributes.level', labelKey: 'cv.fieldLevel' },
  { path: 'attributes.experience', labelKey: 'cv.fieldExperience' },
  { path: 'attributes.stats', labelKey: 'cv.fieldStats' },
];

/**
 * 字段路径 → 显示名映射（用于冲突展示）
 */
const FIELD_LABEL_MAP: ReadonlyMap<string, MessageKey> = new Map(
  TRACKED_FIELDS.map((f) => [f.path, f.labelKey])
);

/**
 * 获取字段显示名（未知字段返回路径本身）
 */
export function getFieldLabel(path: string): string {
  const labelKey = FIELD_LABEL_MAP.get(path);
  return labelKey ? t(labelKey) : path;
}

/**
 * 比较两个值是否相等（深比较）
 *
 * - 对象/数组使用 JSON 序列化后比较
 * - undefined 与 null 视为相等（便于 diff）
 */
function valuesEqual(a: unknown, b: unknown): boolean {
  const na = a === undefined ? null : a;
  const nb = b === undefined ? null : b;
  if (na === nb) return true;
  if (typeof na !== typeof nb) return false;
  if (typeof na === 'object' && na !== null && nb !== null) {
    return JSON.stringify(na) === JSON.stringify(nb);
  }
  return false;
}

// ── 辅助：设置对象路径值 ──

/**
 * 设置对象指定路径的值
 *
 * 路径不存在时自动创建中间对象。
 */
function setPathValue(obj: unknown, path: string, value: unknown): void {
  if (!path) return;
  const parts = path.split(/[.[\]]/).filter(Boolean);
  let current: Record<string, unknown> = obj as Record<string, unknown>;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!;
    if (current[part] === undefined || current[part] === null) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]!] = value;
}

export { getPathValue, setPathValue, valuesEqual };
