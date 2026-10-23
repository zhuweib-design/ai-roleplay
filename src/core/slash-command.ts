// F11.1 斜杠命令系统核心引擎
// 解析以 / 开头的命令、支持 | 管道传递、|| 阻断管道
// 内置命令：/roll /echo /pass /if /setvar /getvar /delay /abort /imagine /time /event /help
//
// 文件分层（依赖单向，无环）：
//
//   slash-command-types.ts      纯类型（8 个 interface），零函数
//        ↑
//   slash-command-parser.ts     parsePipeline / parseCommand + 骰子与比较辅助
//        ↑
//   slash-command-builtin.ts    内置命令表（12 条）
//        ↑
//   slash-command.ts            执行引擎（本文件）+ 汇总出口
//
// 本文件只保留执行引擎（管道编排、宏替换、扩展命令优先级）与 re-export，
// 公开面与拆分前逐字一致：8 个运行时导出 + 8 个类型，逐个显式列举。

import type { SlashCommand, SlashCommandResult } from './extension-types';
import type { MacroContext, VariableMap } from './macro';
import { replaceMacros } from './macro';
import { isSlashCommand, parsePipeline } from './slash-command-parser';
import { getBuiltinCommands } from './slash-command-builtin';
import type {
  BuiltInCommand,
  CommandResult,
  SlashCommandContext,
} from './slash-command-types';

// i18n-ignore-start  // 模型面提示词 / mock / 种子目录，非 UI 文案（待翻译）

export type {
  BuiltInCommand,
  CommandResult,
  EventsCommandContext,
  EventsCommandContextEvent,
  ParsedCommand,
  ParsedPipeline,
  SlashCommandContext,
  StoryTimeCommandContext,
} from './slash-command-types';
export {
  compareValues,
  isSlashCommand,
  parseCommand,
  parseDiceExpression,
  parsePipeline,
  rollDice,
} from './slash-command-parser';
export { getBuiltinCommands } from './slash-command-builtin';

// ─────────────────────────────────────────────────────────────
// 执行引擎
// ─────────────────────────────────────────────────────────────

/**
 * 对参数进行宏替换（{{pipe}}/{{char}}/{{getvar}}/{{setvar}}）
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
    // 再替换其他宏（{{char}}/{{getvar}}/{{setvar}}）
    result = replaceMacros(result, macroCtx, mergedVars);
    // setvar 可能修改了 mergedVars，回写到 ctx.localVariables（保持局部优先）
    for (const key of Object.keys(mergedVars)) {
      if (!(key in ctx.globalVariables)) {
        ctx.localVariables[key] = mergedVars[key]!;
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
    const parsed = pipeline.commands[i]!;
    const block = pipeline.blockPipeAfter[i]!;

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
