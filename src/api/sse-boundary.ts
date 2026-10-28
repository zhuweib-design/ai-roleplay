/**
 * SSE 事件边界查找。
 *
 * SSE 规范允许事件之间用 `\n\n` 或 `\r\n\r\n` 分隔。只认 `\n\n` 的实现
 * 遇到 CRLF 网关时永远切不出事件，表现为"请求成功但回复是空白"，
 * 且不会报错（OpenAIClient 与 AnthropicClient 共用本函数，避免两处口径漂移）。
 */
export function findSSEEventBoundary(buffer: string): { index: number; length: number } | null {
  const lf = buffer.indexOf('\n\n');
  const crlf = buffer.indexOf('\r\n\r\n');
  if (crlf >= 0 && (lf < 0 || crlf < lf)) return { index: crlf, length: 4 };
  if (lf >= 0) return { index: lf, length: 2 };
  return null;
}
