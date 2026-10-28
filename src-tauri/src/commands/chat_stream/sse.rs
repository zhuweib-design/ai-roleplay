// chat_stream/sse.rs — SSE 事件切分与解析（B6 第五件从 chat_stream.rs 原样搬出）
//
// 纯函数：字节缓冲里找事件边界、把事件块解析成 ParsedSSE、把错误响应体转成一句人话。
// 三条都只依赖 serde_json，与网络、任务表无关，所以测试也跟着搬进来。

/// 单个 SSE 事件的解析结果
#[derive(Debug)]
pub(super) enum ParsedSSE {
    /// [DONE] 标记
    Done,
    /// 增量内容（delta 与 thinking 可能同时存在）
    Delta {
        delta: Option<String>,
        thinking: Option<String>,
    },
    /// 结束原因（如 stop / length / content_filter）
    FinishReason { reason: String },
    /// 用量统计(usage chunk,choices 为空数组)
    Usage { usage: serde_json::Value },
    /// 流中的错误消息
    Error { message: String },
    /// 忽略的事件（注释、空、未知字段等）
    Ignore,
}

/// 解析单个 SSE 事件块
///
/// 支持格式：
/// ```text
/// data: {"choices":[{"delta":{"content":"Hi"},"finish_reason":null}]}
///
/// data: [DONE]
/// ```
/// 找下一个 SSE 事件边界，返回 (起始下标, 分隔符长度)。
/// 两种分隔符同时存在时取更靠前的那个；都没有表示事件还没收全。
pub(super) fn find_event_boundary(buffer: &[u8]) -> Option<(usize, usize)> {
    let lf = buffer.windows(2).position(|w| w == b"\n\n").map(|i| (i, 2));
    let crlf = buffer.windows(4).position(|w| w == b"\r\n\r\n").map(|i| (i, 4));
    match (lf, crlf) {
        (Some(a), Some(b)) => Some(if b.0 < a.0 { b } else { a }),
        (Some(a), None) => Some(a),
        (None, Some(b)) => Some(b),
        (None, None) => None,
    }
}

pub(super) fn parse_sse_event(raw: &str) -> Option<ParsedSSE> {
    let mut data_lines: Vec<&str> = Vec::new();

    for line in raw.split('\n') {
        let line = line.trim_end_matches('\r');
        // 注释行
        if line.starts_with(':') {
            continue;
        }
        // data: 字段
        if let Some(rest) = line.strip_prefix("data:") {
            // 去掉前导空格（data: 后可有 0 或 1 个空格）
            let rest = rest.strip_prefix(' ').unwrap_or(rest);
            data_lines.push(rest);
        }
        // 忽略 event: / id: / retry: 等其它字段
    }

    if data_lines.is_empty() {
        return Some(ParsedSSE::Ignore);
    }

    let data = data_lines.join("\n");

    // [DONE] 标记
    if data == "[DONE]" {
        return Some(ParsedSSE::Done);
    }

    // 尝试解析 JSON
    let parsed: serde_json::Value = match serde_json::from_str(&data) {
        Ok(v) => v,
        Err(_) => {
            // 非 JSON，忽略（可能是心跳或注释）
            return Some(ParsedSSE::Ignore);
        }
    };

    // 检查流中错误
    if let Some(error) = parsed.get("error") {
        let message = error
            .get("message")
            .and_then(|m| m.as_str())
            .or_else(|| error.as_str())
            .unwrap_or("未知错误")
            .to_string();
        return Some(ParsedSSE::Error { message });
    }

    // 用量统计(usage chunk:choices 为空数组 + usage 字段,DeepSeek 系含前缀缓存拆解)
    if let Some(usage) = parsed.get("usage") {
        if usage.is_object() {
            return Some(ParsedSSE::Usage {
                usage: usage.clone(),
            });
        }
    }

    // 提取 choices[0]
    let choices = parsed.get("choices")?.as_array()?;
    let choice = choices.first()?;

    // 提取 delta（P0-1：content 与 reasoning_content 可同时出现）
    if let Some(delta) = choice.get("delta") {
        let content = delta
            .get("content")
            .and_then(|c| c.as_str())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string());
        // 部分网关（如 OpenRouter）用 reasoning，主流用 reasoning_content，两者都读
        let thinking = delta
            .get("reasoning_content")
            .and_then(|c| c.as_str())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
            .or_else(|| {
                delta
                    .get("reasoning")
                    .and_then(|c| c.as_str())
                    .filter(|s| !s.is_empty())
                    .map(|s| s.to_string())
            });
        if content.is_some() || thinking.is_some() {
            return Some(ParsedSSE::Delta { delta: content, thinking });
        }
        // delta 但无 content / thinking（首个 chunk 的角色宣告），继续看 finish_reason
    }

    // 提取 finish_reason
    if let Some(reason) = choice.get("finish_reason").and_then(|r| r.as_str()) {
        if reason != "null" && !reason.is_empty() {
            return Some(ParsedSSE::FinishReason {
                reason: reason.to_string(),
            });
        }
    }

    Some(ParsedSSE::Ignore)
}

/// 解析 API 错误响应体
pub(super) fn parse_api_error(body: &str, status: u16) -> String {
    // 尝试解析 OpenAI 风格错误：{ "error": { "message": "..." } }
    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(body) {
        if let Some(message) = parsed
            .get("error")
            .and_then(|e| e.get("message"))
            .and_then(|m| m.as_str())
        {
            return format!("API 错误 {}: {}", status, message);
        }
        if let Some(message) = parsed.get("message").and_then(|m| m.as_str()) {
            return format!("API 错误 {}: {}", status, message);
        }
        if let Some(error) = parsed.get("error").and_then(|e| e.as_str()) {
            return format!("API 错误 {}: {}", status, error);
        }
    }
    // 兜底：返回原始响应体（截断；按 char 截断避免多字节 UTF-8 中间切片 panic）
    let truncated = if body.chars().count() > 500 {
        format!("{}...(已截断)", body.chars().take(500).collect::<String>())
    } else {
        body.to_string()
    };
    format!("API 错误 {}: {}", status, truncated)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_sse_done() {
        let result = parse_sse_event("data: [DONE]");
        assert!(matches!(result, Some(ParsedSSE::Done)));
    }

    #[test]
    fn test_parse_sse_delta() {
        let raw = r#"data: {"choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}"#;
        let result = parse_sse_event(raw);
        match result {
            Some(ParsedSSE::Delta { delta, thinking }) => {
                assert_eq!(delta.as_deref(), Some("Hello"));
                assert_eq!(thinking, None);
            }
            _ => panic!("Expected Delta, got {:?}", result),
        }
    }

    #[test]
    fn test_parse_sse_delta_empty_content() {
        // OpenAI 首个 chunk 通常只有 role，无 content
        let raw = r#"data: {"choices":[{"delta":{"role":"assistant"},"finish_reason":null}]}"#;
        let result = parse_sse_event(raw);
        // 应被解析为 Ignore（无 content）
        assert!(matches!(result, Some(ParsedSSE::Ignore)));
    }

    #[test]
    fn test_parse_sse_finish_reason() {
        let raw = r#"data: {"choices":[{"delta":{},"finish_reason":"stop"}]}"#;
        let result = parse_sse_event(raw);
        match result {
            Some(ParsedSSE::FinishReason { reason }) => assert_eq!(reason, "stop"),
            _ => panic!("Expected FinishReason, got {:?}", result),
        }
    }

    #[test]
    fn test_parse_sse_multiline_data() {
        // 多行 data 字段应被拼接
        let raw = "data: line1\ndata: line2";
        let result = parse_sse_event(raw);
        // 非法 JSON，应被忽略
        assert!(matches!(result, Some(ParsedSSE::Ignore)));
    }

    #[test]
    fn test_parse_sse_comment() {
        let result = parse_sse_event(": heartbeat");
        assert!(matches!(result, Some(ParsedSSE::Ignore)));
    }

    #[test]
    fn test_parse_sse_empty() {
        let result = parse_sse_event("");
        // 空字符串没有 data 行，返回 Ignore
        assert!(matches!(result, Some(ParsedSSE::Ignore)));
    }

    #[test]
    fn test_parse_sse_error_in_stream() {
        let raw = r#"data: {"error":{"message":"rate limit exceeded"}}"#;
        let result = parse_sse_event(raw);
        match result {
            Some(ParsedSSE::Error { message }) => {
                assert_eq!(message, "rate limit exceeded")
            }
            _ => panic!("Expected Error, got {:?}", result),
        }
    }

    #[test]
    fn test_parse_api_error_openai_format() {
        let body = r#"{"error":{"message":"Invalid API key"}}"#;
        let msg = parse_api_error(body, 401);
        assert!(msg.contains("Invalid API key"));
        assert!(msg.contains("401"));
    }

    #[test]
    fn test_parse_api_error_message_field() {
        let body = r#"{"message":"Bad request"}"#;
        let msg = parse_api_error(body, 400);
        assert!(msg.contains("Bad request"));
    }

    #[test]
    fn test_parse_api_error_plain_text() {
        let body = "Internal Server Error";
        let msg = parse_api_error(body, 500);
        assert!(msg.contains("500"));
        assert!(msg.contains("Internal Server Error"));
    }

    #[test]
    fn test_parse_api_error_truncation() {
        // 超过 500 字符的响应应被截断
        let long_body = "x".repeat(1000);
        let msg = parse_api_error(&long_body, 500);
        assert!(msg.contains("已截断"));
    }

    #[test]
    fn test_parse_sse_usage_chunk() {
        // usage chunk:choices 为空数组 + usage 字段(DeepSeek 前缀缓存拆解)
        let raw = r#"data: {"choices":[],"usage":{"prompt_tokens":100,"completion_tokens":20,"total_tokens":120,"prompt_cache_hit_tokens":60,"prompt_cache_miss_tokens":40}}"#;
        let result = parse_sse_event(raw);
        match result {
            Some(ParsedSSE::Usage { usage }) => {
                assert_eq!(usage["prompt_cache_hit_tokens"], 60);
                assert_eq!(usage["prompt_cache_miss_tokens"], 40);
            }
            other => panic!("应为 Usage,实际: {:?}", other),
        }
    }

    #[test]
    fn test_parse_sse_delta_without_usage() {
        let raw = r#"data: {"choices":[{"delta":{"content":"Hi"},"finish_reason":null}]}"#;
        assert!(matches!(parse_sse_event(raw), Some(ParsedSSE::Delta { .. })));
    }

    #[test]
    fn test_parse_sse_delta_with_reasoning_content() {
        let raw = r#"data: {"choices":[{"delta":{"content":"答","reasoning_content":"想"}}]}"#;
        match parse_sse_event(raw) {
            Some(ParsedSSE::Delta { delta, thinking }) => {
                assert_eq!(delta.as_deref(), Some("答"));
                assert_eq!(thinking.as_deref(), Some("想"));
            }
            _ => panic!("Expected Delta with thinking"),
        }
    }

    #[test]
    fn test_parse_sse_delta_with_reasoning_alias() {
        let raw = r#"data: {"choices":[{"delta":{"reasoning":"想"}}]}"#;
        match parse_sse_event(raw) {
            Some(ParsedSSE::Delta { delta, thinking }) => {
                assert_eq!(delta, None);
                assert_eq!(thinking.as_deref(), Some("想"));
            }
            _ => panic!("Expected Delta with thinking"),
        }
    }

    #[test]
    fn find_event_boundary_accepts_lf_and_crlf() {
        let lf: &[u8] = b"data: a\n\ndata: b";
        assert_eq!(find_event_boundary(lf), Some((7, 2)));

        let crlf: &[u8] = b"data: a\r\n\r\ndata: b";
        assert_eq!(find_event_boundary(crlf), Some((7, 4)));

        // 事件还没收全时必须返回 None，让上层继续等下一个 chunk
        let partial: &[u8] = b"data: a";
        assert_eq!(find_event_boundary(partial), None);
    }
}
