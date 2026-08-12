// F11.1 斜杠命令系统单元测试
import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  parsePipeline,
  parseCommand,
  parseDiceExpression,
  rollDice,
  compareValues,
  isSlashCommand,
  getBuiltinCommands,
  executePipeline,
  type SlashCommandContext,
} from '@core/slash-command';
import type { SlashCommand } from '@core/extension-types';

// ── 测试夹具 ──

function makeCtx(overrides: Partial<SlashCommandContext> = {}): SlashCommandContext {
  return {
    localVariables: {},
    globalVariables: {},
    charName: 'Seraphina',
    userName: '勇者',
    ...overrides,
  };
}

// 固定 Math.random 以便测试 /roll
function mockRandom(values: number[]) {
  let idx = 0;
  vi.spyOn(Math, 'random').mockImplementation(() => {
    const v = values[idx % values.length];
    idx++;
    return v;
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────
// isSlashCommand
// ─────────────────────────────────────────────────────────────

describe('isSlashCommand', () => {
  test('以 / 开头识别为命令', () => {
    expect(isSlashCommand('/roll 1d20')).toBe(true);
  });

  test('前导空格后 / 开头也识别', () => {
    expect(isSlashCommand('  /echo hello')).toBe(true);
  });

  test('不以 / 开头不识别', () => {
    expect(isSlashCommand('你好')).toBe(false);
    expect(isSlashCommand('hello world')).toBe(false);
  });

  test('空字符串不识别', () => {
    expect(isSlashCommand('')).toBe(false);
    expect(isSlashCommand('   ')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────
// parsePipeline
// ─────────────────────────────────────────────────────────────

describe('parsePipeline', () => {
  test('单条命令无管道', () => {
    const result = parsePipeline('/roll 1d20');
    expect(result.commands).toHaveLength(1);
    expect(result.commands[0].name).toBe('roll');
    expect(result.commands[0].args).toEqual(['1d20']);
    expect(result.blockPipeAfter).toEqual([false]);
  });

  test('两条命令用 | 分隔', () => {
    const result = parsePipeline('/roll 1d20 | /echo {{pipe}}');
    expect(result.commands).toHaveLength(2);
    expect(result.commands[0].name).toBe('roll');
    expect(result.commands[1].name).toBe('echo');
    expect(result.blockPipeAfter).toEqual([false, false]);
  });

  test('|| 阻断管道标记', () => {
    const result = parsePipeline('/echo first || /echo second');
    expect(result.commands).toHaveLength(2);
    expect(result.blockPipeAfter).toEqual([true, false]);
  });

  test('三条命令混合 | 和 ||', () => {
    const result = parsePipeline('/roll 1d6 | /echo hi || /echo bye');
    expect(result.commands).toHaveLength(3);
    expect(result.blockPipeAfter).toEqual([false, true, false]);
  });

  test('引号内的 | 不作为分隔符', () => {
    const result = parsePipeline('/echo "a | b" | /echo next');
    expect(result.commands).toHaveLength(2);
    expect(result.commands[0].name).toBe('echo');
    expect(result.commands[1].name).toBe('echo');
  });

  test('单引号内的 | 不作为分隔符', () => {
    const result = parsePipeline("/echo 'x | y' | /echo next");
    expect(result.commands).toHaveLength(2);
    expect(result.commands[1].name).toBe('echo');
  });

  test('空段被过滤', () => {
    const result = parsePipeline('/roll | | /echo hi');
    expect(result.commands).toHaveLength(2);
    expect(result.commands[0].name).toBe('roll');
    expect(result.commands[1].name).toBe('echo');
  });

  test('首尾空格被 trim', () => {
    const result = parsePipeline('  /echo hello  ');
    expect(result.commands).toHaveLength(1);
    expect(result.commands[0].name).toBe('echo');
    expect(result.commands[0].args).toEqual(['hello']);
  });

  test('末尾 | 后无命令时不过滤已有命令', () => {
    const result = parsePipeline('/echo hi |');
    expect(result.commands).toHaveLength(1);
    expect(result.commands[0].name).toBe('echo');
  });

  test('命令名转小写', () => {
    const result = parsePipeline('/ROLL 1d20');
    expect(result.commands[0].name).toBe('roll');
  });

  test('混合大小写命令名转小写', () => {
    const result = parsePipeline('/RoLl 1d6');
    expect(result.commands[0].name).toBe('roll');
  });
});

// ─────────────────────────────────────────────────────────────
// parseCommand
// ─────────────────────────────────────────────────────────────

describe('parseCommand', () => {
  test('基本命令解析', () => {
    const result = parseCommand('/roll 1d20');
    expect(result.name).toBe('roll');
    expect(result.args).toEqual(['1d20']);
  });

  test('多参数解析', () => {
    const result = parseCommand('/setvar gold 100');
    expect(result.name).toBe('setvar');
    expect(result.args).toEqual(['gold', '100']);
  });

  test('引号包裹的参数保留空格', () => {
    const result = parseCommand('/echo "hello world"');
    expect(result.name).toBe('echo');
    expect(result.args).toEqual(['hello world']);
  });

  test('单引号包裹的参数保留空格', () => {
    const result = parseCommand("/echo 'hello world'");
    expect(result.name).toBe('echo');
    expect(result.args).toEqual(['hello world']);
  });

  test('混合引号和普通参数', () => {
    const result = parseCommand('/setvar msg "hello world" extra');
    expect(result.args).toEqual(['msg', 'hello world', 'extra']);
  });

  test('命令名小写化', () => {
    expect(parseCommand('/ECHO hi').name).toBe('echo');
  });

  test('非 / 开头返回空命令', () => {
    const result = parseCommand('hello');
    expect(result.name).toBe('');
    expect(result.args).toEqual([]);
  });

  test('无参数命令', () => {
    const result = parseCommand('/help');
    expect(result.name).toBe('help');
    expect(result.args).toEqual([]);
  });

  test('保留原始文本', () => {
    const result = parseCommand('/roll 1d20');
    expect(result.raw).toBe('/roll 1d20');
  });

  test('多个连续空格不产生空参数', () => {
    const result = parseCommand('/echo   a   b');
    expect(result.args).toEqual(['a', 'b']);
  });
});

// ─────────────────────────────────────────────────────────────
// parseDiceExpression
// ─────────────────────────────────────────────────────────────

describe('parseDiceExpression', () => {
  test('合法骰子表达式 1d20', () => {
    expect(parseDiceExpression('1d20')).toEqual({ count: 1, faces: 20 });
  });

  test('合法骰子表达式 2d6', () => {
    expect(parseDiceExpression('2d6')).toEqual({ count: 2, faces: 6 });
  });

  test('合法骰子表达式 10d100', () => {
    expect(parseDiceExpression('10d100')).toEqual({ count: 10, faces: 100 });
  });

  test('大写 D 也接受', () => {
    expect(parseDiceExpression('1D20')).toEqual({ count: 1, faces: 20 });
  });

  test('前后空格被 trim', () => {
    expect(parseDiceExpression('  1d6  ')).toEqual({ count: 1, faces: 6 });
  });

  test('缺少 d 返回 null', () => {
    expect(parseDiceExpression('20')).toBeNull();
  });

  test('count 为 0 返回 null', () => {
    expect(parseDiceExpression('0d6')).toBeNull();
  });

  test('count 超过 100 返回 null', () => {
    expect(parseDiceExpression('101d6')).toBeNull();
  });

  test('faces 小于 2 返回 null', () => {
    expect(parseDiceExpression('1d1')).toBeNull();
  });

  test('faces 超过 1000 返回 null', () => {
    expect(parseDiceExpression('1d1001')).toBeNull();
  });

  test('非数字返回 null', () => {
    expect(parseDiceExpression('abc')).toBeNull();
    expect(parseDiceExpression('xd6')).toBeNull();
  });

  test('负数返回 null', () => {
    expect(parseDiceExpression('-1d6')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────
// rollDice
// ─────────────────────────────────────────────────────────────

describe('rollDice', () => {
  test('返回正确数量的骰子', () => {
    const result = rollDice(5, 6);
    expect(result).toHaveLength(5);
  });

  test('每个骰子在 1 到 faces 之间', () => {
    const result = rollDice(20, 20);
    for (const r of result) {
      expect(r).toBeGreaterThanOrEqual(1);
      expect(r).toBeLessThanOrEqual(20);
    }
  });

  test('1d6 固定 random=0.5 返回 4', () => {
    mockRandom([0.5]);
    expect(rollDice(1, 6)).toEqual([4]);
  });

  test('1d6 固定 random=0.0 返回 1', () => {
    mockRandom([0.0]);
    expect(rollDice(1, 6)).toEqual([1]);
  });

  test('1d6 固定 random=0.999 返回 6', () => {
    mockRandom([0.999]);
    expect(rollDice(1, 6)).toEqual([6]);
  });

  test('2d6 固定 random 序列', () => {
    mockRandom([0.0, 0.5]);
    expect(rollDice(2, 6)).toEqual([1, 4]);
  });

  test('count 为 0 返回空数组', () => {
    expect(rollDice(0, 6)).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────
// compareValues
// ─────────────────────────────────────────────────────────────

describe('compareValues', () => {
  test('eq 数字相等', () => {
    expect(compareValues('10', '10', 'eq')).toBe(true);
  });

  test('eq 数字不等', () => {
    expect(compareValues('10', '20', 'eq')).toBe(false);
  });

  test('ne 数字不等', () => {
    expect(compareValues('10', '20', 'ne')).toBe(true);
  });

  test('gt 大于', () => {
    expect(compareValues('20', '10', 'gt')).toBe(true);
    expect(compareValues('10', '20', 'gt')).toBe(false);
  });

  test('lt 小于', () => {
    expect(compareValues('10', '20', 'lt')).toBe(true);
    expect(compareValues('20', '10', 'lt')).toBe(false);
  });

  test('gte 大于等于', () => {
    expect(compareValues('10', '10', 'gte')).toBe(true);
    expect(compareValues('15', '10', 'gte')).toBe(true);
    expect(compareValues('5', '10', 'gte')).toBe(false);
  });

  test('lte 小于等于', () => {
    expect(compareValues('10', '10', 'lte')).toBe(true);
    expect(compareValues('5', '10', 'lte')).toBe(true);
    expect(compareValues('15', '10', 'lte')).toBe(false);
  });

  test('eq 字符串相等（非数字）', () => {
    expect(compareValues('hello', 'hello', 'eq')).toBe(true);
    expect(compareValues('hello', 'world', 'eq')).toBe(false);
  });

  test('ne 字符串不等（非数字）', () => {
    expect(compareValues('hello', 'world', 'ne')).toBe(true);
  });

  test('gt 字符串大于（非数字，按字典序）', () => {
    expect(compareValues('b', 'a', 'gt')).toBe(true);
    expect(compareValues('a', 'b', 'gt')).toBe(false);
  });

  test('混合数字与字符串时按字符串比较', () => {
    // '10' 和 'abc'：abc 不是数字，按字符串比较
    expect(compareValues('10', 'abc', 'lt')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// getBuiltinCommands
// ─────────────────────────────────────────────────────────────

describe('getBuiltinCommands', () => {
  test('返回 12 个内置命令', () => {
    const commands = getBuiltinCommands();
    expect(commands).toHaveLength(12);
  });

  test('包含所有必需命令', () => {
    const commands = getBuiltinCommands();
    const names = commands.map((c) => c.name);
    expect(names).toContain('roll');
    expect(names).toContain('echo');
    expect(names).toContain('pass');
    expect(names).toContain('if');
    expect(names).toContain('setvar');
    expect(names).toContain('getvar');
    expect(names).toContain('delay');
    expect(names).toContain('abort');
    expect(names).toContain('imagine');
    expect(names).toContain('help');
    expect(names).toContain('time');
    expect(names).toContain('event');
  });

  test('每个命令都有 description', () => {
    const commands = getBuiltinCommands();
    for (const cmd of commands) {
      expect(cmd.description).toBeTruthy();
      expect(typeof cmd.description).toBe('string');
    }
  });

  test('每个命令的 name 是小写', () => {
    const commands = getBuiltinCommands();
    for (const cmd of commands) {
      expect(cmd.name).toBe(cmd.name.toLowerCase());
    }
  });

  test('返回新数组（不缓存引用）', () => {
    const a = getBuiltinCommands();
    const b = getBuiltinCommands();
    expect(a).not.toBe(b);
    // 不用 toEqual（含函数无法深度比较），改为检查结构和长度
    expect(a).toHaveLength(b.length);
    expect(a.map((c) => c.name)).toEqual(b.map((c) => c.name));
  });
});

// ─────────────────────────────────────────────────────────────
// 内置命令：/roll
// ─────────────────────────────────────────────────────────────

describe('内置命令 /roll', () => {
  test('1d20 返回结果和管道', () => {
    mockRandom([0.5]); // 1d20 → 11
    const ctx = makeCtx();
    const result = getBuiltinCommands().find((c) => c.name === 'roll')!.execute(['1d20'], '', ctx);
    expect(result.success).toBe(true);
    expect(result.message).toContain('11');
    expect(result.pipe).toBe('11');
  });

  test('2d6 返回总和和明细', () => {
    mockRandom([0.0, 0.5]); // 1, 4 → 5
    const ctx = makeCtx();
    const result = getBuiltinCommands().find((c) => c.name === 'roll')!.execute(['2d6'], '', ctx);
    expect(result.success).toBe(true);
    expect(result.message).toContain('5');
    expect(result.message).toContain('1');
    expect(result.message).toContain('4');
    expect(result.pipe).toBe('5');
  });

  test('无参数返回失败', () => {
    const ctx = makeCtx();
    const result = getBuiltinCommands().find((c) => c.name === 'roll')!.execute([], '', ctx);
    expect(result.success).toBe(false);
    expect(result.message).toContain('用法');
  });

  test('无效骰子表达式返回失败', () => {
    const ctx = makeCtx();
    const result = getBuiltinCommands().find((c) => c.name === 'roll')!.execute(['abc'], '', ctx);
    expect(result.success).toBe(false);
    expect(result.message).toContain('无效');
  });

  test('1d6 单骰消息不含明细括号', () => {
    mockRandom([0.5]); // 4
    const ctx = makeCtx();
    const result = getBuiltinCommands().find((c) => c.name === 'roll')!.execute(['1d6'], '', ctx);
    expect(result.success).toBe(true);
    expect(result.message).not.toContain('[');
  });
});

// ─────────────────────────────────────────────────────────────
// 内置命令：/echo
// ─────────────────────────────────────────────────────────────

describe('内置命令 /echo', () => {
  test('输出文本到 message 和 pipe', () => {
    const ctx = makeCtx();
    const result = getBuiltinCommands().find((c) => c.name === 'echo')!.execute(['hello', 'world'], '', ctx);
    expect(result.success).toBe(true);
    expect(result.message).toBe('hello world');
    expect(result.pipe).toBe('hello world');
  });

  test('引号包裹的文本保留空格', () => {
    const ctx = makeCtx();
    const result = getBuiltinCommands().find((c) => c.name === 'echo')!.execute(['你好 世界'], '', ctx);
    expect(result.success).toBe(true);
    expect(result.message).toBe('你好 世界');
  });

  test('无参数返回失败', () => {
    const ctx = makeCtx();
    const result = getBuiltinCommands().find((c) => c.name === 'echo')!.execute([], '', ctx);
    expect(result.success).toBe(false);
    expect(result.message).toContain('用法');
  });
});

// ─────────────────────────────────────────────────────────────
// 内置命令：/pass
// ─────────────────────────────────────────────────────────────

describe('内置命令 /pass', () => {
  test('将文本放入管道不显示 message', () => {
    const ctx = makeCtx();
    const result = getBuiltinCommands().find((c) => c.name === 'pass')!.execute(['15'], '', ctx);
    expect(result.success).toBe(true);
    expect(result.pipe).toBe('15');
    expect(result.message).toBeUndefined();
  });

  test('多参数合并为管道值', () => {
    const ctx = makeCtx();
    const result = getBuiltinCommands().find((c) => c.name === 'pass')!.execute(['hello', 'world'], '', ctx);
    expect(result.pipe).toBe('hello world');
  });

  test('空参数 pipe 为空字符串', () => {
    const ctx = makeCtx();
    const result = getBuiltinCommands().find((c) => c.name === 'pass')!.execute([], '', ctx);
    expect(result.success).toBe(true);
    expect(result.pipe).toBe('');
  });
});

// ─────────────────────────────────────────────────────────────
// 内置命令：/if
// ─────────────────────────────────────────────────────────────

describe('内置命令 /if', () => {
  test('key=value 格式 gte 为 true', () => {
    const ctx = makeCtx();
    const result = getBuiltinCommands().find((c) => c.name === 'if')!.execute(
      ['left=20', 'right=15', 'rule=gte'],
      '',
      ctx
    );
    expect(result.success).toBe(true);
    expect(result.pipe).toBe('true');
  });

  test('key=value 格式 lt 为 false', () => {
    const ctx = makeCtx();
    const result = getBuiltinCommands().find((c) => c.name === 'if')!.execute(
      ['left=10', 'right=20', 'rule=lt'],
      '',
      ctx
    );
    expect(result.success).toBe(true);
    expect(result.pipe).toBe('true');
  });

  test('位置参数格式', () => {
    const ctx = makeCtx();
    const result = getBuiltinCommands().find((c) => c.name === 'if')!.execute(['10', '20', 'lt'], '', ctx);
    expect(result.pipe).toBe('true');
  });

  test('使用管道作为 left', () => {
    const ctx = makeCtx();
    const result = getBuiltinCommands().find((c) => c.name === 'if')!.execute(['right=15', 'rule=gte'], '20', ctx);
    expect(result.pipe).toBe('true');
  });

  test('eq 字符串相等', () => {
    const ctx = makeCtx();
    const result = getBuiltinCommands().find((c) => c.name === 'if')!.execute(
      ['left=hello', 'right=hello', 'rule=eq'],
      '',
      ctx
    );
    expect(result.pipe).toBe('true');
  });

  test('ne 字符串不等', () => {
    const ctx = makeCtx();
    const result = getBuiltinCommands().find((c) => c.name === 'if')!.execute(
      ['left=hello', 'right=world', 'rule=ne'],
      '',
      ctx
    );
    expect(result.pipe).toBe('true');
  });

  test('无效规则返回失败', () => {
    const ctx = makeCtx();
    const result = getBuiltinCommands().find((c) => c.name === 'if')!.execute(
      ['left=1', 'right=2', 'rule=invalid'],
      '',
      ctx
    );
    expect(result.success).toBe(false);
    expect(result.message).toContain('无效的比较规则');
  });

  test('默认规则为 eq', () => {
    const ctx = makeCtx();
    const result = getBuiltinCommands().find((c) => c.name === 'if')!.execute(['5', '5'], '', ctx);
    expect(result.pipe).toBe('true');
  });

  test('默认 left 取管道，right 为空字符串', () => {
    const ctx = makeCtx();
    const result = getBuiltinCommands().find((c) => c.name === 'if')!.execute([], 'hello', ctx);
    // left=hello, right='', rule=eq → 'hello' !== '' → false
    expect(result.pipe).toBe('false');
  });
});

// ─────────────────────────────────────────────────────────────
// 内置命令：/setvar 和 /getvar
// ─────────────────────────────────────────────────────────────

describe('内置命令 /setvar', () => {
  test('设置局部变量', () => {
    const ctx = makeCtx();
    const result = getBuiltinCommands().find((c) => c.name === 'setvar')!.execute(['gold', '100'], '', ctx);
    expect(result.success).toBe(true);
    expect(ctx.localVariables.gold).toBe('100');
    expect(result.pipe).toBe('100');
  });

  test('值含空格用引号包裹', () => {
    const ctx = makeCtx();
    getBuiltinCommands().find((c) => c.name === 'setvar')!.execute(['msg', 'hello world'], '', ctx);
    expect(ctx.localVariables.msg).toBe('hello world');
  });

  test('无参数返回失败', () => {
    const ctx = makeCtx();
    const result = getBuiltinCommands().find((c) => c.name === 'setvar')!.execute([], '', ctx);
    expect(result.success).toBe(false);
    expect(result.message).toContain('用法');
  });

  test('只有变量名无值时设为空字符串', () => {
    const ctx = makeCtx();
    const result = getBuiltinCommands().find((c) => c.name === 'setvar')!.execute(['name'], '', ctx);
    expect(result.success).toBe(true);
    expect(ctx.localVariables.name).toBe('');
  });

  test('覆盖已存在的变量', () => {
    const ctx = makeCtx({ localVariables: { gold: '50' } });
    getBuiltinCommands().find((c) => c.name === 'setvar')!.execute(['gold', '200'], '', ctx);
    expect(ctx.localVariables.gold).toBe('200');
  });
});

describe('内置命令 /getvar', () => {
  test('读取局部变量到管道', () => {
    const ctx = makeCtx({ localVariables: { gold: '100' } });
    const result = getBuiltinCommands().find((c) => c.name === 'getvar')!.execute(['gold'], '', ctx);
    expect(result.success).toBe(true);
    expect(result.pipe).toBe('100');
  });

  test('局部变量不存在时 fallback 到全局变量', () => {
    const ctx = makeCtx({ globalVariables: { theme: 'dark' } });
    const result = getBuiltinCommands().find((c) => c.name === 'getvar')!.execute(['theme'], '', ctx);
    expect(result.pipe).toBe('dark');
  });

  test('变量不存在时返回空字符串', () => {
    const ctx = makeCtx();
    const result = getBuiltinCommands().find((c) => c.name === 'getvar')!.execute(['nonexistent'], '', ctx);
    expect(result.pipe).toBe('');
  });

  test('局部变量优先于全局变量', () => {
    const ctx = makeCtx({
      localVariables: { name: 'local' },
      globalVariables: { name: 'global' },
    });
    const result = getBuiltinCommands().find((c) => c.name === 'getvar')!.execute(['name'], '', ctx);
    expect(result.pipe).toBe('local');
  });

  test('无参数返回失败', () => {
    const ctx = makeCtx();
    const result = getBuiltinCommands().find((c) => c.name === 'getvar')!.execute([], '', ctx);
    expect(result.success).toBe(false);
    expect(result.message).toContain('用法');
  });
});

// ─────────────────────────────────────────────────────────────
// 内置命令：/delay
// ─────────────────────────────────────────────────────────────

describe('内置命令 /delay', () => {
  test('返回 delayMs', () => {
    const ctx = makeCtx();
    const result = getBuiltinCommands().find((c) => c.name === 'delay')!.execute(['1000'], '', ctx);
    expect(result.success).toBe(true);
    expect(result.delayMs).toBe(1000);
  });

  test('无参数返回失败', () => {
    const ctx = makeCtx();
    const result = getBuiltinCommands().find((c) => c.name === 'delay')!.execute([], '', ctx);
    expect(result.success).toBe(false);
    expect(result.message).toContain('用法');
  });

  test('非数字返回失败', () => {
    const ctx = makeCtx();
    const result = getBuiltinCommands().find((c) => c.name === 'delay')!.execute(['abc'], '', ctx);
    expect(result.success).toBe(false);
    expect(result.message).toContain('无效');
  });

  test('负数返回失败', () => {
    const ctx = makeCtx();
    const result = getBuiltinCommands().find((c) => c.name === 'delay')!.execute(['-100'], '', ctx);
    expect(result.success).toBe(false);
  });

  test('超过 60000 返回失败', () => {
    const ctx = makeCtx();
    const result = getBuiltinCommands().find((c) => c.name === 'delay')!.execute(['60001'], '', ctx);
    expect(result.success).toBe(false);
  });

  test('0 毫秒合法', () => {
    const ctx = makeCtx();
    const result = getBuiltinCommands().find((c) => c.name === 'delay')!.execute(['0'], '', ctx);
    expect(result.success).toBe(true);
    expect(result.delayMs).toBe(0);
  });

  test('60000 毫秒合法（边界）', () => {
    const ctx = makeCtx();
    const result = getBuiltinCommands().find((c) => c.name === 'delay')!.execute(['60000'], '', ctx);
    expect(result.success).toBe(true);
    expect(result.delayMs).toBe(60000);
  });
});

// ─────────────────────────────────────────────────────────────
// 内置命令：/abort
// ─────────────────────────────────────────────────────────────

describe('内置命令 /abort', () => {
  test('设置 shouldAbort', () => {
    const ctx = makeCtx();
    const result = getBuiltinCommands().find((c) => c.name === 'abort')!.execute([], '', ctx);
    expect(result.success).toBe(true);
    expect(result.shouldAbort).toBe(true);
    expect(result.message).toContain('中断');
  });

  test('调用 onAbort 回调', () => {
    const onAbort = vi.fn();
    const ctx = makeCtx({ onAbort });
    getBuiltinCommands().find((c) => c.name === 'abort')!.execute([], '', ctx);
    expect(onAbort).toHaveBeenCalledTimes(1);
  });

  test('未提供 onAbort 时不报错', () => {
    const ctx = makeCtx();
    expect(() => {
      getBuiltinCommands().find((c) => c.name === 'abort')!.execute([], '', ctx);
    }).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────
// 内置命令：/imagine
// ─────────────────────────────────────────────────────────────

describe('内置命令 /imagine', () => {
  test('有提示词时返回未启用消息', () => {
    const ctx = makeCtx();
    const result = getBuiltinCommands().find((c) => c.name === 'imagine')!.execute(['一只', '猫'], '', ctx);
    expect(result.success).toBe(false);
    expect(result.message).toContain('图像生成扩展未启用');
    expect(result.message).toContain('一只 猫');
  });

  test('无提示词返回失败', () => {
    const ctx = makeCtx();
    const result = getBuiltinCommands().find((c) => c.name === 'imagine')!.execute([], '', ctx);
    expect(result.success).toBe(false);
    expect(result.message).toContain('用法');
  });
});

// ─────────────────────────────────────────────────────────────
// 内置命令：/help
// ─────────────────────────────────────────────────────────────

describe('内置命令 /help', () => {
  test('列出所有内置命令', () => {
    const ctx = makeCtx();
    const result = getBuiltinCommands().find((c) => c.name === 'help')!.execute([], '', ctx);
    expect(result.success).toBe(true);
    expect(result.message).toContain('/roll');
    expect(result.message).toContain('/echo');
    expect(result.message).toContain('/if');
    expect(result.message).toContain('/setvar');
    expect(result.message).toContain('/getvar');
    expect(result.message).toContain('/help');
  });

  test('包含管道说明', () => {
    const ctx = makeCtx();
    const result = getBuiltinCommands().find((c) => c.name === 'help')!.execute([], '', ctx);
    expect(result.message).toContain('管道');
    expect(result.message).toContain('{{pipe}}');
  });

  test('ctx.extraCommands 为空时不显示扩展命令区', () => {
    const ctx = makeCtx();
    const result = getBuiltinCommands().find((c) => c.name === 'help')!.execute([], '', ctx);
    expect(result.message).not.toContain('扩展命令');
  });

  test('ctx.extraCommands 有内容时显示扩展命令区', () => {
    const extra: SlashCommand[] = [
      {
        name: 'custom',
        description: '自定义命令',
        execute: () => ({ success: true, message: 'ok' }),
      },
    ];
    const ctx = makeCtx({ extraCommands: extra });
    const result = getBuiltinCommands().find((c) => c.name === 'help')!.execute([], '', ctx);
    expect(result.message).toContain('扩展命令');
    expect(result.message).toContain('/custom');
    expect(result.message).toContain('自定义命令');
  });
});

// ─────────────────────────────────────────────────────────────
// 内置命令：/time (F16.4)
// ─────────────────────────────────────────────────────────────

describe('内置命令 /time', () => {
  test('未关联故事返回失败', () => {
    const ctx = makeCtx({ storyTimeContext: null });
    const result = getBuiltinCommands().find((c) => c.name === 'time')!.execute(['status'], '', ctx);
    expect(result.success).toBe(false);
    expect(result.message).toContain('未关联故事');
  });

  test('status 返回当前故事时间', () => {
    const ctx = makeCtx({
      storyTimeContext: {
        storyId: 's1',
        onAdvance: () => '',
        onSet: () => true,
        getStatus: () => '第 3 天',
        onReset: () => true,
      },
    });
    const result = getBuiltinCommands().find((c) => c.name === 'time')!.execute(['status'], '', ctx);
    expect(result.success).toBe(true);
    expect(result.message).toContain('第 3 天');
  });

  test('advance 推进时间', () => {
    const ctx = makeCtx({
      storyTimeContext: {
        storyId: 's1',
        onAdvance: () => '第 4 天',
        onSet: () => true,
        getStatus: () => '第 4 天',
        onReset: () => true,
      },
    });
    const result = getBuiltinCommands().find((c) => c.name === 'time')!.execute(['advance'], '', ctx);
    expect(result.success).toBe(true);
    expect(result.message).toContain('第 4 天');
    expect(result.pipe).toBe('第 4 天');
  });

  test('set 设置时间值', () => {
    const ctx = makeCtx({
      storyTimeContext: {
        storyId: 's1',
        onAdvance: () => '',
        onSet: () => true,
        getStatus: () => '第 5 天',
        onReset: () => true,
      },
    });
    const result = getBuiltinCommands().find((c) => c.name === 'time')!.execute(['set', '5'], '', ctx);
    expect(result.success).toBe(true);
    expect(result.message).toContain('第 5 天');
  });

  test('set 无效值返回失败', () => {
    const ctx = makeCtx({
      storyTimeContext: {
        storyId: 's1',
        onAdvance: () => '',
        onSet: () => true,
        getStatus: () => '',
        onReset: () => true,
      },
    });
    const result = getBuiltinCommands().find((c) => c.name === 'time')!.execute(['set', 'abc'], '', ctx);
    expect(result.success).toBe(false);
    expect(result.message).toContain('无效');
  });

  test('reset 重置时间', () => {
    const ctx = makeCtx({
      storyTimeContext: {
        storyId: 's1',
        onAdvance: () => '',
        onSet: () => true,
        getStatus: () => '第 1 天',
        onReset: () => true,
      },
    });
    const result = getBuiltinCommands().find((c) => c.name === 'time')!.execute(['reset'], '', ctx);
    expect(result.success).toBe(true);
    expect(result.message).toContain('第 1 天');
  });

  test('未知子命令返回失败', () => {
    const ctx = makeCtx({
      storyTimeContext: {
        storyId: 's1',
        onAdvance: () => '',
        onSet: () => true,
        getStatus: () => '',
        onReset: () => true,
      },
    });
    const result = getBuiltinCommands().find((c) => c.name === 'time')!.execute(['foo'], '', ctx);
    expect(result.success).toBe(false);
    expect(result.message).toContain('未知');
  });

  test('无子命令返回用法提示', () => {
    const ctx = makeCtx({
      storyTimeContext: {
        storyId: 's1',
        onAdvance: () => '',
        onSet: () => true,
        getStatus: () => '',
        onReset: () => true,
      },
    });
    const result = getBuiltinCommands().find((c) => c.name === 'time')!.execute([], '', ctx);
    expect(result.success).toBe(false);
    expect(result.message).toContain('用法');
  });
});

// ─────────────────────────────────────────────────────────────
// 内置命令：/event (F17.2)
// ─────────────────────────────────────────────────────────────

describe('内置命令 /event', () => {
  function makeEventsCtx(overrides: Partial<import('@core/slash-command').EventsCommandContext> = {}) {
    const events: import('@core/slash-command').EventsCommandContextEvent[] = [
      { id: 'evt-1', name: '黎明追击', state: 'pending', sceneName: '王城', triggerCount: 0 },
      { id: 'evt-2', name: '黄昏密会', state: 'active', sceneName: null, triggerCount: 1 },
      { id: 'evt-3', name: '深夜袭击', state: 'completed', sceneName: '森林', triggerCount: 2 },
    ];
    return {
      events,
      findEvent: (idOrName: string) =>
        events.find((e) => e.id === idOrName || e.name === idOrName) ?? null,
      trigger: (id: string) => {
        const evt = events.find((e) => e.id === id);
        if (!evt) return { success: false, message: `事件 ${id} 不存在` };
        if (evt.state === 'completed') return { success: false, message: `事件「${evt.name}」已完成，不可触发` };
        evt.state = 'active';
        evt.triggerCount += 1;
        return { success: true, message: `已触发事件「${evt.name}」` };
      },
      complete: (id: string) => {
        const evt = events.find((e) => e.id === id);
        if (!evt) return { success: false, message: `事件 ${id} 不存在` };
        if (evt.state !== 'active') return { success: false, message: `事件「${evt.name}」不在进行中` };
        evt.state = 'completed';
        return { success: true, message: `已完成事件「${evt.name}」` };
      },
      ...overrides,
    };
  }

  test('未关联事件返回失败', () => {
    const ctx = makeCtx({ eventsContext: null });
    const result = getBuiltinCommands().find((c) => c.name === 'event')!.execute(['list'], '', ctx);
    expect(result.success).toBe(false);
    expect(result.message).toContain('未关联事件');
  });

  test('无子命令返回用法', () => {
    const ctx = makeCtx({ eventsContext: makeEventsCtx() });
    const result = getBuiltinCommands().find((c) => c.name === 'event')!.execute([], '', ctx);
    expect(result.success).toBe(false);
    expect(result.message).toContain('用法');
  });

  test('list 列出所有事件', () => {
    const ctx = makeCtx({ eventsContext: makeEventsCtx() });
    const result = getBuiltinCommands().find((c) => c.name === 'event')!.execute(['list'], '', ctx);
    expect(result.success).toBe(true);
    expect(result.message).toContain('黎明追击');
    expect(result.message).toContain('黄昏密会');
    expect(result.message).toContain('深夜袭击');
    expect(result.message).toContain('王城');
  });

  test('list 无事件时返回提示', () => {
    const ctx = makeCtx({ eventsContext: makeEventsCtx({ events: [] }) });
    const result = getBuiltinCommands().find((c) => c.name === 'event')!.execute(['list'], '', ctx);
    expect(result.success).toBe(true);
    expect(result.message).toContain('无任何事件');
  });

  test('status 无参数返回状态汇总', () => {
    const ctx = makeCtx({ eventsContext: makeEventsCtx() });
    const result = getBuiltinCommands().find((c) => c.name === 'event')!.execute(['status'], '', ctx);
    expect(result.success).toBe(true);
    expect(result.message).toContain('pending: 1');
    expect(result.message).toContain('active: 1');
    expect(result.message).toContain('completed: 1');
  });

  test('status 带名称参数返回单事件详情', () => {
    const ctx = makeCtx({ eventsContext: makeEventsCtx() });
    const result = getBuiltinCommands().find((c) => c.name === 'event')!.execute(['status', '黎明追击'], '', ctx);
    expect(result.success).toBe(true);
    expect(result.message).toContain('黎明追击');
    expect(result.message).toContain('pending');
    expect(result.message).toContain('王城');
  });

  test('status 带不存在名称返回失败', () => {
    const ctx = makeCtx({ eventsContext: makeEventsCtx() });
    const result = getBuiltinCommands().find((c) => c.name === 'event')!.execute(['status', '不存在'], '', ctx);
    expect(result.success).toBe(false);
    expect(result.message).toContain('找不到');
  });

  test('trigger 按 ID 触发事件', () => {
    const evCtx = makeEventsCtx();
    const ctx = makeCtx({ eventsContext: evCtx });
    const result = getBuiltinCommands().find((c) => c.name === 'event')!.execute(['trigger', 'evt-1'], '', ctx);
    expect(result.success).toBe(true);
    expect(result.message).toContain('黎明追击');
    // 验证状态已变更
    expect(evCtx.events[0].state).toBe('active');
    expect(evCtx.events[0].triggerCount).toBe(1);
  });

  test('trigger 按名称触发事件', () => {
    const evCtx = makeEventsCtx();
    const ctx = makeCtx({ eventsContext: evCtx });
    const result = getBuiltinCommands().find((c) => c.name === 'event')!.execute(['trigger', '黎明追击'], '', ctx);
    expect(result.success).toBe(true);
  });

  test('trigger 已完成事件返回失败', () => {
    const ctx = makeCtx({ eventsContext: makeEventsCtx() });
    const result = getBuiltinCommands().find((c) => c.name === 'event')!.execute(['trigger', 'evt-3'], '', ctx);
    expect(result.success).toBe(false);
    expect(result.message).toContain('已完成');
  });

  test('trigger 不存在事件返回失败', () => {
    const ctx = makeCtx({ eventsContext: makeEventsCtx() });
    const result = getBuiltinCommands().find((c) => c.name === 'event')!.execute(['trigger', '不存在'], '', ctx);
    expect(result.success).toBe(false);
    expect(result.message).toContain('找不到');
  });

  test('trigger 无参数返回用法', () => {
    const ctx = makeCtx({ eventsContext: makeEventsCtx() });
    const result = getBuiltinCommands().find((c) => c.name === 'event')!.execute(['trigger'], '', ctx);
    expect(result.success).toBe(false);
    expect(result.message).toContain('用法');
  });

  test('complete 完成 active 事件', () => {
    const evCtx = makeEventsCtx();
    const ctx = makeCtx({ eventsContext: evCtx });
    const result = getBuiltinCommands().find((c) => c.name === 'event')!.execute(['complete', 'evt-2'], '', ctx);
    expect(result.success).toBe(true);
    expect(result.message).toContain('黄昏密会');
    expect(evCtx.events[1].state).toBe('completed');
  });

  test('complete 非 active 事件返回失败', () => {
    const ctx = makeCtx({ eventsContext: makeEventsCtx() });
    const result = getBuiltinCommands().find((c) => c.name === 'event')!.execute(['complete', 'evt-1'], '', ctx);
    expect(result.success).toBe(false);
    expect(result.message).toContain('不在进行中');
  });

  test('未知子命令返回失败', () => {
    const ctx = makeCtx({ eventsContext: makeEventsCtx() });
    const result = getBuiltinCommands().find((c) => c.name === 'event')!.execute(['foo'], '', ctx);
    expect(result.success).toBe(false);
    expect(result.message).toContain('未知');
  });
});

// ─────────────────────────────────────────────────────────────
// executePipeline：完整管道执行
// ─────────────────────────────────────────────────────────────

describe('executePipeline', () => {
  test('非斜杠命令返回失败', async () => {
    const result = await executePipeline('hello world', makeCtx());
    expect(result.success).toBe(false);
    expect(result.message).toContain('不是斜杠命令');
  });

  test('未知命令返回失败', async () => {
    const result = await executePipeline('/unknown', makeCtx());
    expect(result.success).toBe(false);
    expect(result.message).toContain('未知命令');
    expect(result.message).toContain('/help');
  });

  test('单条 /echo 命令', async () => {
    const result = await executePipeline('/echo hello', makeCtx());
    expect(result.success).toBe(true);
    expect(result.message).toBe('hello');
  });

  test('管道传递：/pass | /echo', async () => {
    const result = await executePipeline('/pass 42 | /echo {{pipe}}', makeCtx());
    expect(result.success).toBe(true);
    expect(result.message).toBe('42');
  });

  test('管道传递：/roll | /if', async () => {
    mockRandom([0.999]); // 1d20 → 20
    const result = await executePipeline('/roll 1d20 | /if left={{pipe}} right=15 rule=gte', makeCtx());
    expect(result.success).toBe(true);
    expect(result.pipe).toBe('true');
  });

  test('|| 阻断管道：第二条命令不执行', async () => {
    const result = await executePipeline('/echo first || /echo second', makeCtx());
    expect(result.success).toBe(true);
    expect(result.message).toBe('first');
  });

  test('/setvar | /getvar 管道', async () => {
    const ctx = makeCtx();
    const result = await executePipeline('/setvar gold 100 | /getvar gold', ctx);
    expect(result.success).toBe(true);
    expect(ctx.localVariables.gold).toBe('100');
    expect(result.pipe).toBe('100');
  });

  test('命令失败时停止管道', async () => {
    const result = await executePipeline('/roll invalid | /echo should-not-run', makeCtx());
    expect(result.success).toBe(false);
    expect(result.message).toContain('无效');
  });

  test('{{user}} 宏替换', async () => {
    const result = await executePipeline('/echo hello {{user}}', makeCtx());
    expect(result.message).toBe('hello 勇者');
  });

  test('{{char}} 宏替换', async () => {
    const result = await executePipeline('/echo {{char}} is here', makeCtx());
    expect(result.message).toBe('Seraphina is here');
  });

  test('{{getvar}} 宏替换', async () => {
    const ctx = makeCtx({ localVariables: { mood: 'happy' } });
    const result = await executePipeline('/echo mood is {{getvar::mood}}', ctx);
    expect(result.message).toBe('mood is happy');
  });

  test('{{setvar}} 宏设置变量', async () => {
    const ctx = makeCtx();
    const result = await executePipeline('/echo {{setvar::count::5}}done', ctx);
    expect(result.message).toBe('done');
    expect(ctx.localVariables.count).toBe('5');
  });

  test('/help 显示所有命令', async () => {
    const result = await executePipeline('/help', makeCtx());
    expect(result.success).toBe(true);
    expect(result.message).toContain('/roll');
    expect(result.message).toContain('/echo');
  });

  test('/abort 设置 shouldAbort', async () => {
    const result = await executePipeline('/abort', makeCtx());
    expect(result.shouldAbort).toBe(true);
  });

  test('/abort 调用 onAbort', async () => {
    const onAbort = vi.fn();
    const result = await executePipeline('/abort', makeCtx({ onAbort }));
    expect(onAbort).toHaveBeenCalledTimes(1);
    expect(result.shouldAbort).toBe(true);
  });

  test('/delay 在管道中实际延迟', async () => {
    const start = Date.now();
    await executePipeline('/delay 50 | /echo done', makeCtx());
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(40);
  });

  test('最后一条命令的 message 优先显示', async () => {
    const result = await executePipeline('/echo first | /echo second', makeCtx());
    expect(result.message).toBe('second');
  });

  test('无 message 的命令（/pass）不覆盖后续 message', async () => {
    const result = await executePipeline('/pass silent | /echo shown', makeCtx());
    expect(result.message).toBe('shown');
  });

  test('最后一条命令无 message 时保留前面的 message', async () => {
    const result = await executePipeline('/echo shown | /pass silent', makeCtx());
    expect(result.message).toBe('shown');
  });

  test('空字符串输入返回失败', async () => {
    const result = await executePipeline('', makeCtx());
    expect(result.success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────
// executePipeline：扩展命令接入
// ─────────────────────────────────────────────────────────────

describe('executePipeline 扩展命令', () => {
  test('执行扩展注册的命令', async () => {
    const customCmd: SlashCommand = {
      name: 'greet',
      description: '问候',
      execute: (args) => ({
        success: true,
        message: `你好，${args[0] ?? ''}！`,
      }),
    };
    const result = await executePipeline('/greet 世界', makeCtx(), [customCmd]);
    expect(result.success).toBe(true);
    expect(result.message).toBe('你好，世界！');
  });

  test('扩展命令出现在 /help 中', async () => {
    const customCmd: SlashCommand = {
      name: 'weather',
      description: '查询天气',
      execute: () => ({ success: true, message: '晴天' }),
    };
    const result = await executePipeline('/help', makeCtx(), [customCmd]);
    expect(result.message).toContain('扩展命令');
    expect(result.message).toContain('/weather');
    expect(result.message).toContain('查询天气');
  });

  test('扩展命令可覆盖同名内置命令', async () => {
    const customRoll: SlashCommand = {
      name: 'roll',
      description: '自定义骰子',
      execute: () => ({ success: true, message: 'always 1' }),
    };
    const result = await executePipeline('/roll 1d20', makeCtx(), [customRoll]);
    expect(result.message).toBe('always 1');
  });

  test('扩展命令失败时停止管道', async () => {
    const failingCmd: SlashCommand = {
      name: 'fail',
      description: '总是失败',
      execute: () => ({ success: false, message: '出错了' }),
    };
    const result = await executePipeline('/fail | /echo no-run', makeCtx(), [failingCmd]);
    expect(result.success).toBe(false);
    expect(result.message).toContain('出错了');
  });
});

// ─────────────────────────────────────────────────────────────
// 综合场景
// ─────────────────────────────────────────────────────────────

describe('综合场景', () => {
  test('骰子判定脚本：/roll | /if | /echo', async () => {
    mockRandom([0.999]); // 1d20 → 20
    const result = await executePipeline(
      '/roll 1d20 | /if left={{pipe}} right=15 rule=gte | /echo 掷出 {{pipe}}',
      makeCtx()
    );
    expect(result.success).toBe(true);
    // /if 输出 true，/echo 显示 "掷出 true"
    expect(result.message).toBe('掷出 true');
  });

  test('设置并使用变量', async () => {
    const ctx = makeCtx();
    const result = await executePipeline(
      '/setvar mood happy | /echo 心情：{{getvar::mood}}',
      ctx
    );
    expect(result.message).toBe('心情：happy');
    expect(ctx.localVariables.mood).toBe('happy');
  });

  test('多步骤骰子判定', async () => {
    mockRandom([0.5]); // 1d6 → 4
    const ctx = makeCtx();
    const result = await executePipeline(
      '/roll 1d6 | /setvar lastRoll {{pipe}} | /if left={{pipe}} right=4 rule=gte',
      ctx
    );
    expect(result.success).toBe(true);
    expect(result.pipe).toBe('true');
    expect(ctx.localVariables.lastRoll).toBe('4');
  });
});
