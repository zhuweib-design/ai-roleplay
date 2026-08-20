/**
 * 共享 JSON 工具函数
 *
 * 提取自 character-generator / world-generator / random-event-generator / story-analyzer
 * 中重复的 JSON 提取与解析逻辑。
 */

/**
 * 深度克隆（兼容 Proxy 对象）
 *
 * 优先使用 structuredClone（性能更优，支持 Date/Map/Set）；
 * 当对象包含 Proxy / Symbol / Function 等无法 structuredClone 的类型时回退到 JSON。
 */
export function deepClone<T>(obj: T): T {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(obj);
    } catch {
      // structuredClone 无法处理 Proxy / Symbol / Function，回退到 JSON
    }
  }
  return JSON.parse(JSON.stringify(obj)) as T;
}

/**
 * 从 AI 返回的文本中提取 JSON 字符串
 *
 * 容错处理：
 * - 去除 ```json ... ``` 或 ``` ... ``` 代码块包裹
 * - 去除首尾非 JSON 字符（截取第一个 { 到最后一个 }）
 *
 * @returns 提取出的 JSON 字符串（未解析）
 */
export function extractJsonString(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';
  let str = raw.trim();

  // 尝试匹配 ```json ... ``` 或 ``` ... ```
  const fenceMatch = str.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    str = fenceMatch[1]!.trim();
  }

  // 若仍包含非 JSON 前后缀，尝试截取第一个 { 到最后一个 }
  if (!str.startsWith('{')) {
    const firstBrace = str.indexOf('{');
    const lastBrace = str.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      str = str.slice(firstBrace, lastBrace + 1);
    }
  }

  return str;
}

/**
 * 从 AI 返回的文本中提取 JSON 数组字符串
 *
 * 容错处理：
 * - 去除 ```json ... ``` 或 ``` ... ``` 代码块包裹
 * - 去除首尾非 JSON 字符（截取第一个 [ 到最后一个 ]）
 *
 * @returns 提取出的 JSON 数组字符串（未解析）
 */
export function extractJsonArrayString(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';
  let str = raw.trim();

  const fenceMatch = str.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    str = fenceMatch[1]!.trim();
  }

  // 截取第一个 [ 到最后一个 ]
  if (!str.startsWith('[')) {
    const firstBracket = str.indexOf('[');
    const lastBracket = str.lastIndexOf(']');
    if (firstBracket >= 0 && lastBracket > firstBracket) {
      str = str.slice(firstBracket, lastBracket + 1);
    }
  }

  return str;
}

/**
 * 尝试修复 JSON 字符串中的常见格式问题
 *
 * 目前修复：
 * - 尾部多余逗号（如 `{"a":1,}` → `{"a":1}`）
 */
function fixJsonString(jsonStr: string): string {
  return jsonStr.replace(/,(\s*[}\]])/g, '$1');
}

/**
 * 统一入口：从 AI 返回文本中解析 JSON 对象
 *
 * 完整容错链（fence 剥离 → {…} 截取 → 尾逗号修复），
 * 替代调用方"extractJsonString + JSON.parse + 手工 try/catch"的重复模式。
 * 注意：safeJsonParse 的数组分支行为与此不同，数组请用 parseAiJsonArray。
 *
 * @returns 解析成功返回对象，失败返回 null
 */
export function parseAiJson<T = Record<string, unknown>>(raw: string): T | null {
  if (!raw || typeof raw !== 'string') return null;
  const str = extractJsonString(raw);
  if (!str) return null;
  const tryParse = (text: string): T | null => {
    try {
      const parsed = JSON.parse(text) as unknown;
      // 对象入口：仅接受非数组的 plain object（数组输入按语义返回 null）
      return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as T)
        : null;
    } catch {
      return null;
    }
  };
  return tryParse(str) ?? tryParse(fixJsonString(str));
}

/**
 * 统一入口：从 AI 返回文本中解析 JSON 数组
 *
 * 容错链与 parseAiJson 一致，但按 [ … ] 截取；结果必须为数组，否则返回 null。
 *
 * @returns 解析成功返回数组，失败返回 null
 */
export function parseAiJsonArray<T = unknown>(raw: string): T[] | null {
  if (!raw || typeof raw !== 'string') return null;
  const str = extractJsonArrayString(raw);
  if (!str) return null;
  const tryParse = (text: string): T[] | null => {
    try {
      const parsed = JSON.parse(text) as unknown;
      return Array.isArray(parsed) ? (parsed as T[]) : null;
    } catch {
      return null;
    }
  };
  return tryParse(str) ?? tryParse(fixJsonString(str));
}

/**
 * 安全解析 JSON 字符串
 *
 * 多级容错策略：
 * 1. 直接解析
 * 2. 提取 { ... } 后解析
 * 3. 提取 [ ... ] 后解析（数组情况）
 * 4. 修复尾逗号后重试上述步骤
 *
 * 注意：新代码请优先使用 parseAiJson / parseAiJsonArray（入口唯一）。
 *
 * @returns 解析成功返回对象，失败返回 null
 */
export function safeJsonParse<T = unknown>(raw: string): T | null {
  if (!raw || typeof raw !== 'string') return null;

  let text = raw.trim();

  // 去除 markdown 代码块包裹
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    text = codeBlockMatch[1]!.trim();
  }

  // 尝试直接解析
  try {
    return JSON.parse(text) as T;
  } catch {
    // 继续尝试
  }

  // 尝试找到第一个 { 和最后一个 }
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const jsonStr = text.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(jsonStr) as T;
    } catch {
      // 尝试修复尾逗号
      const fixed = fixJsonString(jsonStr);
      try {
        return JSON.parse(fixed) as T;
      } catch {
        // 继续失败
      }
    }
  }

  // 尝试找到第一个 [ 和最后一个 ]（数组情况）
  const firstBracket = text.indexOf('[');
  const lastBracket = text.lastIndexOf(']');
  if (firstBracket >= 0 && lastBracket > firstBracket) {
    const jsonStr = text.slice(firstBracket, lastBracket + 1);
    try {
      return JSON.parse(jsonStr) as T;
    } catch {
      const fixed = fixJsonString(jsonStr);
      try {
        return JSON.parse(fixed) as T;
      } catch {
        // 最终失败
      }
    }
  }

  return null;
}

/**
 * 从错误对象中提取可读的错误消息
 *
 * 用于 store 层的统一错误处理：
 * ```ts
 * catch (err) {
 *   lastError.value = getErrorMessage(err);
 * }
 * ```
 */
export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return String(err);
}
