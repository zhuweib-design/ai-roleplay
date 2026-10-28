/**
 * 斜杠命令 —— 类型定义层
 *
 * 本层零函数、零副作用，只描述数据结构。parser / builtin / 执行引擎三层
 * 共同依赖它，因此放在依赖图最底层。
 */

import type { SlashCommand } from './extension-types';
import type { VariableMap } from './macro';

/** 斜杠命令执行上下文 */
export interface SlashCommandContext {
  /** 局部变量（聊天级，随对话元数据持久化） */
  localVariables: VariableMap;
  /** 全局变量（应用级，localStorage 持久化） */
  globalVariables: VariableMap;
  /** 当前角色名（用于 {{char}} 宏替换） */
  charName: string;
  /** 当前世界内昵称（旧命令上下文兼容字段） */
  userName: string;
  /** 中断生成回调（/abort 调用） */
  onAbort?: () => void;
  /** 扩展注册的额外命令（供 /help 列出，由 executePipeline 自动注入） */
  extraCommands?: SlashCommand[];
  /** F16.4 故事时间上下文（/time 命令使用，未关联故事时为 null） */
  storyTimeContext?: StoryTimeCommandContext | null;
  /** F17.2 事件上下文（/event 命令使用，未关联角色 Lorebook 时为 null） */
  eventsContext?: EventsCommandContext | null;
}

/**
 * F16.4 故事时间命令上下文
 * 由 chat store 在构造 SlashCommandContext 时注入，
 * 提供 /time 命令操作故事时间的回调。
 */
export interface StoryTimeCommandContext {
  /** 当前关联的故事 ID */
  storyId: string;
  /** 手动推进一个时间单位，返回格式化后的时间字符串 */
  onAdvance: () => string;
  /** 设置时间值，返回是否成功 */
  onSet: (value: number) => boolean;
  /** 获取当前格式化时间字符串 */
  getStatus: () => string;
  /** 重置时间到初始值，返回是否成功 */
  onReset: () => boolean;
}

/**
 * F17.2 事件命令上下文
 * 由 chat store 在构造 SlashCommandContext 时注入，
 * 提供 /event 命令操作事件的回调。
 *
 * 事件项简化结构（避免与 store 类型耦合）：
 * - id, name, state, sceneName, triggerCount
 */
export interface EventsCommandContextEvent {
  id: string;
  name: string;
  state: string;
  sceneName: string | null;
  triggerCount: number;
}

export interface EventsCommandContext {
  /** 当前角色相关 Lorebook 中的全部事件（已按 lorebookId 过滤） */
  events: EventsCommandContextEvent[];
  /** 按 ID 或名称查找事件（名称必须唯一匹配，否则失败） */
  findEvent: (idOrName: string) => EventsCommandContextEvent | null;
  /** 手动触发事件（设置 state=active），返回是否成功及失败原因 */
  trigger: (id: string) => { success: boolean; message: string };
  /** 手动完成事件（设置 state=completed），返回是否成功及失败原因 */
  complete: (id: string) => { success: boolean; message: string };
}

/** 单条命令执行结果 */
export interface CommandResult {
  /** 是否成功执行 */
  success: boolean;
  /** 输出消息（显示在对话区，作为系统消息） */
  message?: string;
  /** 管道传递值（下一条命令可通过 {{pipe}} 访问） */
  pipe?: string;
  /** 若需触发 AI 回复，指定要发送的文本 */
  sendMessage?: string;
  /** 是否请求中断当前生成（/abort 设置） */
  shouldAbort?: boolean;
  /** 请求延迟的毫秒数（/delay 设置，由调用方执行实际延迟） */
  delayMs?: number;
}

/** 解析后的单条命令 */
export interface ParsedCommand {
  /** 命令名（不含 /，小写） */
  name: string;
  /** 参数数组（已去引号） */
  args: string[];
  /** 命令原始文本 */
  raw: string;
}

/** 解析后的管道 */
export interface ParsedPipeline {
  /** 按顺序排列的命令 */
  commands: ParsedCommand[];
  /** 每条命令后是否阻断管道（|| 分隔时为 true：后续命令不执行，仅输出当前命令） */
  blockPipeAfter: boolean[];
}

/** 内置命令定义（扩展了 execute 返回类型，支持 pipe/shouldAbort/delayMs） */
export interface BuiltInCommand {
  /** 命令名（不含 /，小写） */
  name: string;
  /** 简短描述 */
  description: string;
  /** 用法示例 */
  usage?: string;
  /** 执行函数：args 为参数数组，pipe 为上一条命令的管道输出 */
  execute: (args: string[], pipe: string, ctx: SlashCommandContext) => CommandResult;
}
