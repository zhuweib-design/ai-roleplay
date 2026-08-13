// F11.1 斜杠命令系统核心引擎
// 解析以 / 开头的命令、支持 | 管道传递、|| 阻断管道
// 内置命令：/roll /echo /pass /if /setvar /getvar /delay /abort /imagine /help

import type { SlashCommand, SlashCommandResult } from './extension-types';
import type { VariableMap, MacroContext } from './macro';
import { replaceMacros } from './macro';
// i18n-ignore-start  // 模型面提示词 / mock / 种子目录，非 UI 文案（待翻译）

// ─────────────────────────────────────────────────────────────
// 类型定义
// ─────────────────────────────────────────────────────────────

/** 斜杠命令执行上下文 */
export interface SlashCommandContext {
  /** 局部变量（聊天级，随对话元数据持久化） */
  localVariables: VariableMap;
  /** 全局变量（应用级，localStorage 持久化） */
  globalVariables: VariableMap;
  /** 当前角色名（用于 {{char}} 宏替换） */
  charName: string;
  /** 当前用户名（用于 {{user}} 宏替换） */
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

// ─────────────────────────────────────────────────────────────
// 解析函数
// ─────────────────────────────────────────────────────────────

/**
 * 解析命令管道：按 | 分隔，|| 表示阻断管道
 *
 * 规则（参考 SillyTavern STscript）：
 * - `|` 分隔命令，前置命令输出通过 {{pipe}} 传递给下一条
 * - `||` 阻断管道：仅输出当前命令，后续命令不再执行
 * - 引号内的 | 不作为分隔符
 *
 * @param input 用户输入的完整命令字符串（以 / 开头）
 * @returns 解析后的管道结构
 */
export function parsePipeline(input: string): ParsedPipeline {
  const trimmed = input.trim();
  const segments: string[] = [];
  const blockPipeAfter: boolean[] = [];
  let current = '';
  let inQuotes = false;
  let quoteChar = '';
  let i = 0;

  while (i < trimmed.length) {
    const ch = trimmed[i];
    const next = trimmed[i + 1];

    // 引号切换（支持单引号和双引号）
    if (!inQuotes && (ch === '"' || ch === "'")) {
      inQuotes = true;
      quoteChar = ch;
      current += ch;
      i++;
      continue;
    }
    if (inQuotes && ch === quoteChar) {
      inQuotes = false;
      quoteChar = '';
      current += ch;
      i++;
      continue;
    }

    // 引号内不解析管道
    if (inQuotes) {
      current += ch;
      i++;
      continue;
    }

    // 检测 || 阻断管道
    if (ch === '|' && next === '|') {
      segments.push(current.trim());
      blockPipeAfter.push(true);
      current = '';
      i += 2;
      continue;
    }

    // 检测 | 管道分隔
    if (ch === '|') {
      segments.push(current.trim());
      blockPipeAfter.push(false);
      current = '';
      i++;
      continue;
    }

    current += ch;
    i++;
  }

  // 推入最后一段
  const last = current.trim();
  if (last || segments.length > 0) {
    segments.push(last);
    blockPipeAfter.push(false);
  }

  // 过滤空段
  const commands: ParsedCommand[] = [];
  const blockFlags: boolean[] = [];
  for (let idx = 0; idx < segments.length; idx++) {
    const seg = segments[idx];
    if (seg) {
      commands.push(parseCommand(seg));
      blockFlags.push(blockPipeAfter[idx] ?? false);
    }
  }

  return { commands, blockPipeAfter: blockFlags };
}

/**
 * 解析单条命令：/commandname arg1 arg2 "arg with space"
 *
 * 规则：
 * - 必须以 / 开头
 * - 第一个 token 是命令名（去掉 /，转小写）
 * - 后续 token 是参数，引号包裹的参数保留内部空格
 *
 * @param segment 单条命令文本
 * @returns 解析后的命令
 */
export function parseCommand(segment: string): ParsedCommand {
  const text = segment.trim();
  // tokenize：支持引号
  const tokens: string[] = [];
  let current = '';
  let inQuotes = false;
  let quoteChar = '';

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (!inQuotes && (ch === '"' || ch === "'")) {
      inQuotes = true;
      quoteChar = ch;
      continue;
    }
    if (inQuotes && ch === quoteChar) {
      inQuotes = false;
      quoteChar = '';
      continue;
    }
    if (!inQuotes && ch === ' ') {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    current += ch;
  }
  if (current) tokens.push(current);

  // 第一个 token 必须以 / 开头
  if (tokens.length === 0 || !tokens[0].startsWith('/')) {
    return { name: '', args: [], raw: text };
  }

  const name = tokens[0].slice(1).toLowerCase();
  const args = tokens.slice(1);
  return { name, args, raw: text };
}

// ─────────────────────────────────────────────────────────────
// 辅助函数
// ─────────────────────────────────────────────────────────────

/**
 * 解析骰子表达式 NdM（如 2d6、1d20、3d8）
 * @returns { count, faces } 或 null（无效格式）
 */
export function parseDiceExpression(expr: string): { count: number; faces: number } | null {
  const match = /^(\d+)d(\d+)$/i.exec(expr.trim());
  if (!match) return null;
  const count = parseInt(match[1], 10);
  const faces = parseInt(match[2], 10);
  if (count < 1 || count > 100) return null;
  if (faces < 2 || faces > 1000) return null;
  return { count, faces };
}

/**
 * 掷骰子：返回 count 个 faces 面骰子的点数数组
 * 使用 Math.random，测试中可通过 vi.spyOn 替换
 */
export function rollDice(count: number, faces: number): number[] {
  const results: number[] = [];
  for (let i = 0; i < count; i++) {
    results.push(Math.floor(Math.random() * faces) + 1);
  }
  return results;
}

/**
 * 比较两个值（支持数字与字符串比较）
 * @returns 比较结果布尔值
 */
export function compareValues(
  left: string,
  right: string,
  rule: 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte'
): boolean {
  // 尝试数字比较
  const leftNum = Number(left);
  const rightNum = Number(right);
  const bothNumeric = !Number.isNaN(leftNum) && !Number.isNaN(rightNum);

  if (rule === 'eq') return bothNumeric ? leftNum === rightNum : left === right;
  if (rule === 'ne') return bothNumeric ? leftNum !== rightNum : left !== right;
  if (!bothNumeric) {
    // 非数字时 gt/lt/gte/lte 按字符串比较
    if (rule === 'gt') return left > right;
    if (rule === 'lt') return left < right;
    if (rule === 'gte') return left >= right;
    if (rule === 'lte') return left <= right;
  }
  if (rule === 'gt') return leftNum > rightNum;
  if (rule === 'lt') return leftNum < rightNum;
  if (rule === 'gte') return leftNum >= rightNum;
  if (rule === 'lte') return leftNum <= rightNum;
  return false;
}

/**
 * 判断字符串是否为斜杠命令（以 / 开头）
 */
export function isSlashCommand(input: string): boolean {
  const trimmed = input.trim();
  return trimmed.startsWith('/');
}

// ─────────────────────────────────────────────────────────────
// 内置命令实现
// ─────────────────────────────────────────────────────────────

/**
 * 所有内置命令列表
 * 扩展可通过 F12 扩展系统注册额外命令（见 extension-loader.ts）
 */
export function getBuiltinCommands(): BuiltInCommand[] {
  return [
    {
      name: 'roll',
      description: '掷骰子，格式 /roll NdM（如 /roll 2d6）',
      usage: '/roll 1d20',
      execute: (args: string[]) => {
        if (args.length === 0) {
          return { success: false, message: '用法：/roll NdM（如 /roll 2d6）' };
        }
        const parsed = parseDiceExpression(args[0]);
        if (!parsed) {
          return { success: false, message: `无效的骰子表达式：${args[0]}（格式 NdM，如 2d6）` };
        }
        const rolls = rollDice(parsed.count, parsed.faces);
        const total = rolls.reduce((sum, r) => sum + r, 0);
        const detail = rolls.join(' + ');
        const message =
          parsed.count === 1
            ? `🎲 掷出 ${parsed.faces} 面骰：${total}`
            : `🎲 掷 ${parsed.count}个${parsed.faces}面骰：[${detail}] = ${total}`;
        return { success: true, message, pipe: String(total) };
      },
    },
    {
      name: 'echo',
      description: '显示一条消息（输出到对话区）',
      usage: '/echo 你好世界',
      execute: (args: string[]) => {
        const text = args.join(' ');
        if (!text) {
          return { success: false, message: '用法：/echo <文本>' };
        }
        return { success: true, message: text, pipe: text };
      },
    },
    {
      name: 'pass',
      description: '将文本传递到管道（不显示，供下一条命令使用）',
      usage: '/pass 15 | /if left={{pipe}} right=15 rule=eq',
      execute: (args: string[]) => {
        const text = args.join(' ');
        return { success: true, pipe: text };
      },
    },
    {
      name: 'if',
      description: '比较两个值，结果 true/false 传递到管道',
      usage: '/if left=10 right=15 rule=gte',
      execute: (args: string[], pipe: string) => {
        // 支持 key=value 格式和位置参数两种
        const kv: Record<string, string> = {};
        const positional: string[] = [];
        for (const arg of args) {
          const eqIdx = arg.indexOf('=');
          if (eqIdx > 0 && arg[eqIdx - 1] !== '!' && arg[eqIdx + 1] !== '=') {
            const key = arg.slice(0, eqIdx);
            const value = arg.slice(eqIdx + 1);
            kv[key] = value;
          } else {
            positional.push(arg);
          }
        }
        const left = kv.left ?? positional[0] ?? pipe;
        const right = kv.right ?? positional[1] ?? '';
        const rule = (kv.rule ?? positional[2] ?? 'eq') as
          | 'eq'
          | 'ne'
          | 'gt'
          | 'lt'
          | 'gte'
          | 'lte';
        const validRules = ['eq', 'ne', 'gt', 'lt', 'gte', 'lte'];
        if (!validRules.includes(rule)) {
          return {
            success: false,
            message: `无效的比较规则：${rule}（可选 eq/ne/gt/lt/gte/lte）`,
          };
        }
        const result = compareValues(left, right, rule);
        return { success: true, pipe: String(result) };
      },
    },
    {
      name: 'setvar',
      description: '设置局部变量（随当前对话持久化）',
      usage: '/setvar gold 100',
      execute: (args: string[], _pipe: string, ctx: SlashCommandContext) => {
        if (args.length < 1) {
          return { success: false, message: '用法：/setvar <变量名> [值]' };
        }
        const name = args[0];
        const value = args.slice(1).join(' ');
        ctx.localVariables[name] = value;
        return { success: true, pipe: value };
      },
    },
    {
      name: 'getvar',
      description: '读取变量值到管道（先查局部，再查全局）',
      usage: '/getvar gold',
      execute: (args: string[], _pipe: string, ctx: SlashCommandContext) => {
        if (args.length < 1) {
          return { success: false, message: '用法：/getvar <变量名>' };
        }
        const name = args[0];
        const value = ctx.localVariables[name] ?? ctx.globalVariables[name] ?? '';
        return { success: true, pipe: value };
      },
    },
    {
      name: 'delay',
      description: '延迟指定毫秒后继续执行',
      usage: '/delay 1000',
      execute: (args: string[]) => {
        if (args.length < 1) {
          return { success: false, message: '用法：/delay <毫秒数>' };
        }
        const ms = parseInt(args[0], 10);
        if (Number.isNaN(ms) || ms < 0 || ms > 60000) {
          return {
            success: false,
            message: `无效的延迟时间：${args[0]}（0-60000 毫秒）`,
          };
        }
        return { success: true, delayMs: ms };
      },
    },
    {
      name: 'abort',
      description: '中断当前正在生成的 AI 回复',
      usage: '/abort',
      execute: (_args: string[], _pipe: string, ctx: SlashCommandContext) => {
        if (ctx.onAbort) {
          ctx.onAbort();
        }
        return { success: true, shouldAbort: true, message: '已中断生成' };
      },
    },
    {
      name: 'imagine',
      description: '调用图像生成扩展（需启用图像生成扩展）',
      usage: '/imagine 一只可爱的猫',
      execute: (args: string[]) => {
        const prompt = args.join(' ');
        if (!prompt) {
          return { success: false, message: '用法：/imagine <图像描述>' };
        }
        // 占位实现：图像生成扩展未加载时给出提示
        return {
          success: false,
          message: `图像生成扩展未启用，无法生成："${prompt}"（请在设置中启用图像生成扩展）`,
        };
      },
    },
    {
      name: 'time',
      description: '操作故事时间（advance/set/status/reset，依赖 F16.4）',
      usage: '/time advance | /time set 5 | /time status | /time reset',
      execute: (args: string[], _pipe: string, ctx: SlashCommandContext) => {
        const stCtx = ctx.storyTimeContext;
        if (!stCtx) {
          return {
            success: false,
            message: '当前对话未关联故事，/time 命令不可用（请在故事引擎页面绑定角色到故事）',
          };
        }
        const sub = args[0]?.toLowerCase();
        if (!sub) {
          return {
            success: false,
            message: '用法：/time advance|set|status|reset',
          };
        }
        switch (sub) {
          case 'advance': {
            const formatted = stCtx.onAdvance();
            if (!formatted) {
              return {
                success: false,
                message: '时间推进失败（可能时间系统未启用）',
              };
            }
            return {
              success: true,
              message: `⏰ 故事时间已推进至：${formatted}`,
              pipe: formatted,
            };
          }
          case 'set': {
            if (args.length < 2) {
              return { success: false, message: '用法：/time set <数值>' };
            }
            const value = parseInt(args[1], 10);
            if (Number.isNaN(value) || value < 0) {
              return { success: false, message: `无效的时间值：${args[1]}` };
            }
            const ok = stCtx.onSet(value);
            if (!ok) {
              return {
                success: false,
                message: '时间设置失败（可能时间系统未启用）',
              };
            }
            return {
              success: true,
              message: `⏰ 故事时间已设置为：${stCtx.getStatus()}`,
            };
          }
          case 'status': {
            const status = stCtx.getStatus();
            return {
              success: true,
              message: status
                ? `⏰ 当前故事时间：${status}`
                : '时间系统未启用或未配置',
            };
          }
          case 'reset': {
            const ok = stCtx.onReset();
            if (!ok) {
              return {
                success: false,
                message: '时间重置失败（可能时间系统未配置）',
              };
            }
            return {
              success: true,
              message: `⏰ 故事时间已重置为：${stCtx.getStatus()}`,
            };
          }
          default:
            return {
              success: false,
              message: `未知的子命令：${sub}（可用：advance/set/status/reset）`,
            };
        }
      },
    },
    {
      name: 'event',
      description: '操作事件（trigger/complete/status/list，依赖 F17.2）',
      usage:
        '/event trigger <id|名称> | /event complete <id|名称> | /event status [id|名称] | /event list',
      execute: (args: string[], _pipe: string, ctx: SlashCommandContext) => {
        const evCtx = ctx.eventsContext;
        if (!evCtx) {
          return {
            success: false,
            message: '当前对话未关联事件（/event 命令需要角色绑定含事件的 Lorebook）',
          };
        }
        const sub = args[0]?.toLowerCase();
        if (!sub) {
          return {
            success: false,
            message: '用法：/event trigger|complete|status|list [id|名称]',
          };
        }

        switch (sub) {
          case 'list': {
            const events = evCtx.events;
            if (events.length === 0) {
              return { success: true, message: '📜 当前无任何事件' };
            }
            const lines: string[] = ['📜 当前事件列表：'];
            for (const e of events) {
              const scene = e.sceneName ? `[${e.sceneName}] ` : '';
              lines.push(`- ${e.name}（${e.state}）${scene}触发次数 ${e.triggerCount}`);
            }
            return { success: true, message: lines.join('\n') };
          }
          case 'status': {
            // 无参数：汇总状态
            if (args.length < 2) {
              const events = evCtx.events;
              if (events.length === 0) {
                return { success: true, message: '当前无任何事件' };
              }
              const counts = events.reduce<Record<string, number>>((acc, e) => {
                acc[e.state] = (acc[e.state] ?? 0) + 1;
                return acc;
              }, {});
              const parts = Object.entries(counts).map(
                ([k, v]) => `${k}: ${v}`
              );
              return {
                success: true,
                message: `📊 事件状态汇总（共 ${events.length} 个）：${parts.join('，')}`,
              };
            }
            const target = args[1];
            const evt = evCtx.findEvent(target);
            if (!evt) {
              return { success: false, message: `找不到事件：${target}` };
            }
            const scene = evt.sceneName ? `[${evt.sceneName}] ` : '';
            return {
              success: true,
              message: `📊 事件「${evt.name}」${scene}当前状态：${evt.state}（触发次数 ${evt.triggerCount}）`,
            };
          }
          case 'trigger':
          case 'complete': {
            if (args.length < 2) {
              return {
                success: false,
                message: `用法：/event ${sub} <id|名称>`,
              };
            }
            const target = args[1];
            const evt = evCtx.findEvent(target);
            if (!evt) {
              return { success: false, message: `找不到事件：${target}` };
            }
            const result =
              sub === 'trigger' ? evCtx.trigger(evt.id) : evCtx.complete(evt.id);
            return {
              success: result.success,
              message: result.message,
            };
          }
          default:
            return {
              success: false,
              message: `未知的子命令：${sub}（可用：trigger/complete/status/list）`,
            };
        }
      },
    },
    {
      name: 'help',
      description: '列出所有可用命令',
      usage: '/help',
      execute: (_args: string[], _pipe: string, ctx: SlashCommandContext) => {
        const lines: string[] = ['📋 可用斜杠命令：', ''];
        const builtin = getBuiltinCommands();
        lines.push('— 内置命令 —');
        for (const cmd of builtin) {
          lines.push(`/${cmd.name}：${cmd.description}`);
          if (cmd.usage) lines.push(`  用法：${cmd.usage}`);
        }
        const extraCommands = ctx.extraCommands ?? [];
        if (extraCommands.length > 0) {
          lines.push('');
          lines.push('— 扩展命令 —');
          for (const cmd of extraCommands) {
            lines.push(`/${cmd.name}：${cmd.description}`);
            if (cmd.usage) lines.push(`  用法：${cmd.usage}`);
          }
        }
        lines.push('');
        lines.push('管道：用 | 分隔命令，前置输出通过 {{pipe}} 传递；|| 阻断管道。');
        return { success: true, message: lines.join('\n') };
      },
    },
  ];
}

// ─────────────────────────────────────────────────────────────
// 执行引擎
// ─────────────────────────────────────────────────────────────

/**
 * 对参数进行宏替换（{{pipe}}/{{user}}/{{char}}/{{getvar}}/{{setvar}}）
 * {{pipe}} 替换为上一条命令的管道输出
 */
function applyMacrosToArgs(
  args: string[],
  pipe: string,
  ctx: SlashCommandContext
): string[] {
  const macroCtx: MacroContext = { user: ctx.userName, char: ctx.charName };
  const mergedVars: VariableMap = { ...ctx.globalVariables, ...ctx.localVariables };
  return args.map((arg) => {
    // 先替换 {{pipe}}
    let result = arg.replace(/\{\{pipe\}\}/g, pipe);
    // 再替换其他宏（{{user}}/{{char}}/{{getvar}}/{{setvar}}）
    result = replaceMacros(result, macroCtx, mergedVars);
    // setvar 可能修改了 mergedVars，回写到 ctx.localVariables（保持局部优先）
    for (const key of Object.keys(mergedVars)) {
      if (!(key in ctx.globalVariables)) {
        ctx.localVariables[key] = mergedVars[key];
      }
    }
    return result;
  });
}

/**
 * 执行命令管道
 *
 * 流程：
 * 1. 解析输入为命令序列
 * 2. 依次执行每条命令，把上一条 pipe 传递给下一条
 * 3. 遇到 || 阻断标记后停止执行剩余命令
 * 4. 执行 /delay 时由调用方处理实际延迟
 * 5. 执行 /abort 时设置 shouldAbort
 *
 * @param input 用户输入的完整命令字符串
 * @param ctx 执行上下文（变量、角色名等）
 * @param extraCommands 扩展注册的额外命令（来自 F12 扩展系统）
 * @returns 最终执行结果（含 message/sendMessage/shouldAbort 等）
 */
export async function executePipeline(
  input: string,
  ctx: SlashCommandContext,
  extraCommands: SlashCommand[] = []
): Promise<CommandResult> {
  if (!isSlashCommand(input)) {
    return { success: false, message: '不是斜杠命令（需以 / 开头）' };
  }

  const pipeline = parsePipeline(input);
  if (pipeline.commands.length === 0) {
    return { success: false, message: '空命令' };
  }

  // 注入扩展命令到 ctx（供 /help 列出）
  ctx.extraCommands = extraCommands;

  // 内置命令表
  const builtinMap = new Map<string, BuiltInCommand>();
  for (const cmd of getBuiltinCommands()) builtinMap.set(cmd.name, cmd);

  // 扩展命令表（优先级更高，允许覆盖同名内置命令）
  const extraMap = new Map<string, SlashCommand>();
  for (const cmd of extraCommands) extraMap.set(cmd.name, cmd);

  let pipe = '';
  let lastMessage: string | undefined;
  let shouldAbort = false;

  for (let i = 0; i < pipeline.commands.length; i++) {
    const parsed = pipeline.commands[i];
    const block = pipeline.blockPipeAfter[i];

    // 查找命令：先查扩展（优先），再查内置
    const isExtra = extraMap.has(parsed.name);
    const isBuiltin = !isExtra && builtinMap.has(parsed.name);
    if (!isExtra && !isBuiltin) {
      return {
        success: false,
        message: `未知命令：/${parsed.name}（输入 /help 查看可用命令）`,
      };
    }

    // 宏替换参数
    const args = applyMacrosToArgs(parsed.args, pipe, ctx);

    // 执行命令
    let result: CommandResult;
    if (isBuiltin) {
      // BuiltInCommand：支持 pipe 参数和扩展返回类型
      const builtinCmd = builtinMap.get(parsed.name)!;
      result = builtinCmd.execute(args, pipe, ctx);
    } else {
      // SlashCommand（扩展注册）：调用 execute 返回 SlashCommandResult
      const extCmd = extraMap.get(parsed.name)!;
      const extResult: SlashCommandResult = extCmd.execute(args);
      result = {
        success: extResult.success,
        message: extResult.message,
        sendMessage: extResult.sendMessage,
        pipe: extResult.message ?? '',
      };
    }

    // 更新管道输出
    if (result.pipe !== undefined) {
      pipe = result.pipe;
    }

    // 记录消息（最后一条命令的 message 优先显示）
    if (result.message !== undefined) {
      lastMessage = result.message;
    }

    // /abort：标记中断
    if (result.shouldAbort) {
      shouldAbort = true;
    }

    // /delay：暂存延迟请求，由调用方执行实际延迟
    if (result.delayMs && result.delayMs > 0 && i < pipeline.commands.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, result.delayMs));
    }

    // 命令执行失败：停止管道
    if (!result.success) {
      return {
        success: false,
        message: result.message ?? `/${parsed.name} 执行失败`,
        pipe,
        shouldAbort,
      };
    }

    // || 阻断管道：停止执行后续命令
    if (block) {
      break;
    }
  }

  return {
    success: true,
    message: lastMessage,
    pipe,
    shouldAbort,
  };
}
// i18n-ignore-end
