export interface MacroContext {
  /** 旧 Persona 上下文字段，仅为兼容旧调用方；{{user}} 不再替换。 */
  user: string;
  char: string;
}

export type VariableMap = Record<string, string>;

/**
 * 宏替换系统 (F01.5 / F11.2)
 * 替换 {{char}}, {{getvar::name}}, {{setvar::name::value}} 宏。
 * {{user}} 会按原文保留；世界内用户资料由世界书上下文单独注入。
 * 不递归替换（避免无限循环）。
 *
 * 注意：{{setvar::name::value}} 会原地修改传入的 variables 对象，
 * 调用者可在替换后通过同一对象读取已设置的变量。
 */
export function replaceMacros(
  text: string,
  ctx: MacroContext,
  variables: VariableMap = {}
): string {
  return text.replace(
    /\{\{([^}]+)\}\}/g,
    (match, content: string) => {
      if (content === 'char') return ctx.char;

      if (content.startsWith('getvar::')) {
        const name = content.slice('getvar::'.length);
        return variables[name] ?? '';
      }

      if (content.startsWith('setvar::')) {
        const rest = content.slice('setvar::'.length);
        const sepIndex = rest.indexOf('::');
        if (sepIndex === -1) {
          variables[rest] = '';
        } else {
          const name = rest.slice(0, sepIndex);
          const value = rest.slice(sepIndex + 2);
          variables[name] = value;
        }
        return '';
      }

      return match;
    }
  );
}
