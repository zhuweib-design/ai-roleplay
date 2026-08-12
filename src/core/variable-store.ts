// F11.2 变量系统持久化
// 全局变量保存到 localStorage，局部变量随对话元数据持久化（由 chat store 集成）
// 提供 createSlashCommandContext 辅助函数构造斜杠命令执行上下文

import type { VariableMap } from './macro';
import type { SlashCommandContext } from './slash-command';

/** localStorage 存储键 */
export const GLOBAL_VARS_STORAGE_KEY = 'ai-roleplay:global-variables';

/**
 * 从 localStorage 读取全局变量
 *
 * 安全解析：损坏的 JSON 或非对象数据返回空 Map，不抛异常
 */
export function loadGlobalVariables(): VariableMap {
  try {
    const raw = localStorage.getItem(GLOBAL_VARS_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    // 确保所有值都是字符串（防御历史脏数据）
    const result: VariableMap = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      result[key] = typeof value === 'string' ? value : String(value ?? '');
    }
    return result;
  } catch {
    // JSON 解析失败或 localStorage 不可用时返回空 Map
    return {};
  }
}

/**
 * 保存全局变量到 localStorage
 * localStorage 不可用时（隐私模式等）静默失败
 */
export function saveGlobalVariables(vars: VariableMap): void {
  try {
    localStorage.setItem(GLOBAL_VARS_STORAGE_KEY, JSON.stringify(vars));
  } catch {
    // 静默失败
  }
}

/**
 * 设置单个全局变量并持久化
 * @returns 更新后的完整变量 Map
 */
export function setGlobalVariable(name: string, value: string): VariableMap {
  const vars = loadGlobalVariables();
  vars[name] = value;
  saveGlobalVariables(vars);
  return vars;
}

/**
 * 删除全局变量并持久化
 * @returns 更新后的完整变量 Map
 */
export function deleteGlobalVariable(name: string): VariableMap {
  const vars = loadGlobalVariables();
  delete vars[name];
  saveGlobalVariables(vars);
  return vars;
}

/**
 * 清空所有全局变量
 */
export function clearGlobalVariables(): void {
  try {
    localStorage.removeItem(GLOBAL_VARS_STORAGE_KEY);
  } catch {
    // 静默失败
  }
}

/**
 * 合并局部变量和全局变量（局部优先）
 * 用于查询变量时：先查局部，未命中再查全局
 */
export function mergeVariables(local: VariableMap, global: VariableMap): VariableMap {
  return { ...global, ...local };
}

/**
 * 创建斜杠命令执行上下文
 *
 * 自动从 localStorage 加载全局变量注入 ctx.globalVariables，
 * localVariables 由调用方提供（通常来自当前对话的 Conversation.variables）
 *
 * @param localVariables 当前对话的局部变量
 * @param charName 当前角色名（用于 {{char}} 宏）
 * @param userName 当前用户名（用于 {{user}} 宏）
 * @param options.onAbort 中断生成回调（/abort 调用）
 */
export function createSlashCommandContext(
  localVariables: VariableMap,
  charName: string,
  userName: string,
  options: {
    onAbort?: () => void;
    storyTimeContext?: import('./slash-command').StoryTimeCommandContext | null;
    eventsContext?: import('./slash-command').EventsCommandContext | null;
  } = {}
): SlashCommandContext {
  return {
    localVariables,
    globalVariables: loadGlobalVariables(),
    charName,
    userName,
    onAbort: options.onAbort,
    storyTimeContext: options.storyTimeContext ?? null,
    eventsContext: options.eventsContext ?? null,
  };
}
