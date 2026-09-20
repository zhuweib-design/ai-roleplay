// i18n-ignore-start
/**
 * P1：生成"要求模型输出状态块"的指令（模型面文本，**纯英文**）
 *
 * 为什么必须英文（设计文档 §4.6 硬约束 ①）：
 * 解析侧的匹配层只认英文标识符（`location` / `time` / `affection` …），
 * 若"为了让中文模型更好理解"把示例 key 改成中文，模型会照抄中文 → 归一化后
 * 匹配不到任何 schema/内置字段 → 功能**静默失效**（不报错，只是永远没有状态）。
 * 这是本设计最脆弱的一处，**改动前必读设计文档 §4**。
 *
 * 需要匹配中文 key 的正确做法：在角色卡 schema 的 `aliases` 里填（用户数据），
 * 由 UI 的 schema 编辑器写入，源码零改动。
 */

import {
  STATUS_FIELD_REGISTRY,
  STATUS_VALUE_MAX_LEN,
  type StatusFieldDef,
  type StatusSchema,
} from '@core/status-schema';

/** 指令标题（模型面标记，纯 ASCII） */
const HEADER = '[Character Status]';

/**
 * 按字段类型生成 JSON 示例里的占位值
 *
 * - number → `<number>`
 * - enum   → `"<a|b|c>"`（值域只作提示，越界不丢弃）
 * - string → `"<string>"`
 */
function placeholderFor(field: StatusFieldDef): string {
  if (field.type === 'number') return '<number>';
  if (field.type === 'enum' && Array.isArray(field.options) && field.options.length > 0) {
    return `"<${field.options.join('|')}>"`;
  }
  return '"<string>"';
}

/**
 * 收集要写进示例 JSON 的字段
 *
 * - 有 schema：用 schema 里 `show !== false` 的字段（角色卡创作者定的契约）
 * - 无 schema：用内置 8 字段作为**建议**（不是强制）
 */
function collectFields(schema: StatusSchema | null | undefined): StatusFieldDef[] {
  const declared = Array.isArray(schema?.fields) ? schema!.fields : [];
  const visible = declared.filter((f) => f.show !== false);
  if (visible.length > 0) return visible;
  return STATUS_FIELD_REGISTRY.map((p) => ({ key: p.key, type: p.type }));
}

/**
 * 生成"输出状态块"的提示词指令
 *
 * 模型只需要记住一种格式（`<status>` 标签），解析侧额外兼容 ```status 围栏作兜底。
 *
 * @param schema 角色自带状态 schema；null/undefined = 纯嗅探模式（内置 8 字段作建议）
 * @param enabled 是否注入（false → 返回空串，请求体与未开启时逐字节一致）
 * @returns 注入到 system 的指令文本；关闭时为空串
 */
export function buildStatusInstruction(
  schema: StatusSchema | null | undefined,
  enabled: boolean
): string {
  if (!enabled) return '';

  const fields = collectFields(schema);
  if (fields.length === 0) return '';

  const hasSchema = Array.isArray(schema?.fields) && schema!.fields.length > 0;
  const example = fields.map((f) => `"${f.key}": ${placeholderFor(f)}`).join(', ');

  const rules = [
    '- Use only the keys listed above, in English, lowercase.',
    `- Keep each value short (under ${STATUS_VALUE_MAX_LEN} characters).`,
    '- The block is stripped from the visible reply, so never repeat its content in the reply body.',
  ];
  if (!hasSchema) {
    rules.push('- These keys are suggestions: omit any that do not fit the scene.');
  }

  return [
    HEADER,
    'After your reply, append exactly one status block at the very end, outside any <think> block:',
    '<status>',
    `{${example}}`,
    '</status>',
    'Rules:',
    ...rules,
  ].join('\n');
}
// i18n-ignore-end
