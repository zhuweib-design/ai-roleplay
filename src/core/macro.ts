export interface MacroContext {
  user: string;
  char: string;
}

export type VariableMap = Record<string, string>;

/**
 * 宏替换系统 (F01.5 / F11.2)
 * 替换 {{user}}, {{char}}, {{getvar::name}}, {{setvar::name::value}} 宏。
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
      if (content === 'user') return ctx.user;
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
