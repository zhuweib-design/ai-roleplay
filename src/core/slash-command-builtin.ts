/**
 * 斜杠命令 —— 内置命令表
 *
 * 12 条内置命令（roll / echo / pass / if / setvar / getvar / delay / abort /
 * imagine / time / event / help），全部是纯数据 + 闭包，不读 store、不碰 i18n 字典。
 * 依赖只有解析层的三个纯函数，因此可以独立加载与测试。
 */

import { compareValues, parseDiceExpression, rollDice } from './slash-command-parser';
import type { BuiltInCommand, SlashCommandContext } from './slash-command-types';

// i18n-ignore-start  // 命令回执是模型面文本（显示在对话区），非 UI 文案（待翻译）

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
        const parsed = parseDiceExpression(args[0]!);
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
        const name = args[0]!;
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
        const name = args[0]!;
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
        const ms = parseInt(args[0]!, 10);
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
            const value = parseInt(args[1]!, 10);
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
            const target = args[1]!;
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
            const target = args[1]!;
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
// i18n-ignore-end
