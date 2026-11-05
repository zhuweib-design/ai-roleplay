/**
 * 斜杠命令 —— 解析层
 *
 * 纯函数：把用户输入切成命令管道、切出单条命令、解析骰子表达式与比较规则。
 * 不读全局状态、不依赖执行上下文，可单独测试。
 */

import type { ParsedCommand, ParsedPipeline } from './slash-command-types';

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
  if (tokens.length === 0 || !tokens[0]!.startsWith('/')) {
    return { name: '', args: [], raw: text };
  }

  const name = tokens[0]!.slice(1).toLowerCase();
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
  const count = parseInt(match[1]!, 10);
  const faces = parseInt(match[2]!, 10);
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
