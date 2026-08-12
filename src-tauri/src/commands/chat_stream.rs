// chat_stream.rs — Rust reqwest SSE 流式聊天命令 (Phase H4)
//
// 设计目标：
// 1. 在 Rust 端使用 reqwest + tokio 建立 SSE 连接
// 2. 通过 Tauri 事件机制（emit）将增量 token 推送到前端
// 3. 支持 AbortController 风格的中止（通过 cancellation token）
// 4. 完整解析 OpenAI Chat Completions 协议
//
// 优势（相比前端 fetch + ReadableStream）：
// - 绕过浏览器 CORS 限制（原生网络栈）
// - 复用 Rust 的连接池与超时控制
// - 原生 TLS 配置（rustls）
// - 可在后台运行（不依赖窗口可见）
//
// 事件协议：
//   前端通过 invoke('chat_stream', { request, channel }) 调用
//   Rust 端通过 emit(channel, payload) 推送事件
//   payload 形式：
//     { type: 'delta', delta: 'token' }
//     { type: 'done', full_content: '...', finish_reason: 'stop' }
//     { type: 'error', error: '...' }
//     { type: 'ping' }  // 心跳，前端可忽略

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, OnceLock};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;
use tokio_stream::StreamExt;

use crate::error::{AppError, AppResult};

// ── 全局 HTTP client（P1-5：兑现「复用连接池」设计注释）──
// 连接池 / TLS 会话 / DNS 缓存跨请求复用；
// 单请求超时用 RequestBuilder::timeout 按需设置。
static HTTP_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

pub(crate) fn http_client() -> &'static reqwest::Client {
    HTTP_CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(30))
            .build()
            .expect("构建 HTTP client 失败")
    })
}

// ── 类型定义 ──

/// 聊天消息（OpenAI 协议格式）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

/// 前端传入的请求参数
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatStreamRequest {
    /// API 端点 URL（如 https://api.openai.com/v1/chat/completions）
    pub endpoint: String,
    /// API Key
    pub api_key: String,
    /// 模型名
    pub model: String,
    /// 消息列表
    pub messages: Vec<ChatMessage>,
    /// 采样温度（可选）
    #[serde(default)]
    pub temperature: Option<f32>,
    /// 最大 tokens（可选）
    #[serde(default)]
    pub max_tokens: Option<u32>,
    /// 额外 headers（如 Azure api-key）
    #[serde(default)]
    pub extra_headers: Option<HashMap<String, String>>,
    /// 是否允许访问回环/内网地址（本地/局域网模型；P0-2 安全默认 false）
    #[serde(default)]
    pub allow_private: bool,
}

/// 推送给前端的事件 payload
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum StreamEvent {
    /// 收到增量 token
    Delta {
        delta: String,
    },
    /// 生成完成
    Done {
        full_content: String,
        finish_reason: Option<String>,
        /// 用量统计(供应商返回时;含前缀缓存拆解 prompt_cache_hit/miss_tokens)
        #[serde(skip_serializing_if = "Option::is_none")]
        usage: Option<serde_json::Value>,
    },
    /// 错误（含用户中止）
    Error {
        error: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        status: Option<u16>,
    },
    /// 心跳（每 5 秒发送一次，前端可忽略）
    Ping,
}

// ── 全局任务注册表（支持中止） ──

/// 任务表条目：取消标志 + 注册时间（P3-1：惰性清理僵尸表项）
struct TaskEntry {
    flag: Arc<AtomicBool>,
    created_at: std::time::Instant,
}

/// 全局任务 ID → 任务条目的映射
static TASKS: Mutex<Option<HashMap<String, TaskEntry>>> = Mutex::const_new(None);

/// 僵尸任务表项存活上限（半开流悬挂时防表项无限残留）
const TASK_ENTRY_TTL: Duration = Duration::from_secs(60);

/// 创建新任务并返回其取消标志
async fn register_task(task_id: &str) -> Arc<AtomicBool> {
    let mut guard = TASKS.lock().await;
    if guard.is_none() {
        *guard = Some(HashMap::new());
    }
    let map = guard.as_mut().unwrap();
    // P3-1：惰性清理超过 TTL 的僵尸表项（任务结束应由 unregister_task 正常清理）
    map.retain(|_, e| e.created_at.elapsed() < TASK_ENTRY_TTL);
    let entry = TaskEntry {
        flag: Arc::new(AtomicBool::new(false)),
        created_at: std::time::Instant::now(),
    };
    let flag = entry.flag.clone();
    map.insert(task_id.to_string(), entry);
    flag
}

/// 取消指定任务
async fn cancel_task(task_id: &str) -> bool {
    let mut guard = TASKS.lock().await;
    if let Some(map) = guard.as_mut() {
        if let Some(entry) = map.get(task_id) {
            entry.flag.store(true, Ordering::SeqCst);
            return true;
        }
    }
    false
}

/// 任务结束时清理注册表
async fn unregister_task(task_id: &str) {
    let mut guard = TASKS.lock().await;
    if let Some(map) = guard.as_mut() {
        map.remove(task_id);
    }
}

// ── 命令实现 ──

/// 启动流式聊天
///
/// 前端调用：
/// ```ts
/// import { invoke } from '@tauri-apps/api/core';
/// import { listen } from '@tauri-apps/api/event';
///
/// const channel = `chat-stream-${Date.now()}`;
/// const unlisten = await listen<StreamEvent>(channel, (e) => {
///   if (e.payload.type === 'delta') { ... }
///   else if (e.payload.type === 'done') { ... }
///   else if (e.payload.type === 'error') { ... }
/// });
/// try {
///   await invoke('chat_stream', { request, channel });
/// } finally {
///   unlisten();
/// }
/// ```
#[tauri::command]
pub async fn chat_stream(
    app: AppHandle,
    request: ChatStreamRequest,
    channel: String,
) -> AppResult<String> {
    let task_id = channel.clone();
    let cancel_flag = register_task(&task_id).await;

    let result = run_chat_stream(app, request, channel, cancel_flag).await;

    unregister_task(&task_id).await;
    result
}

/// 取消流式聊天
///
/// 前端调用：invoke('cancel_chat_stream', { channel: 'chat-stream-xxx' })
#[tauri::command]
pub async fn cancel_chat_stream(channel: String) -> AppResult<bool> {
    Ok(cancel_task(&channel).await)
}

/// 实际的流式聊天执行逻辑
async fn run_chat_stream(
    app: AppHandle,
    request: ChatStreamRequest,
    channel: String,
    cancel_flag: Arc<AtomicBool>,
) -> AppResult<String> {
    // P0-2 安全：endpoint 校验（SSRF / 密钥外发防护）
    if let Err(msg) = validate_endpoint(&request.endpoint, request.allow_private) {
        let _ = app.emit(
            &channel,
            StreamEvent::Error {
                error: msg.clone(),
                status: None,
            },
        );
        return Err(AppError::Config(msg));
    }

    // 构造请求 body
    let mut body: serde_json::Value = serde_json::json!({
        "model": request.model,
        "messages": request.messages,
        "stream": true,
    });
    if let Some(temp) = request.temperature {
        body["temperature"] = serde_json::json!(temp);
    }
    if let Some(max_tokens) = request.max_tokens {
        body["max_tokens"] = serde_json::json!(max_tokens);
    }

    // 构造 HTTP client（全局复用连接池，P1-5）
    let client = http_client();

    // 构造请求
    let mut req_builder = client
        .post(&request.endpoint)
        .timeout(Duration::from_secs(300)) // 单请求总超时 5 分钟
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", request.api_key))
        .header("Accept", "text/event-stream")
        .json(&body);

    // 应用额外 headers
    if let Some(extra) = &request.extra_headers {
        for (k, v) in extra {
            req_builder = req_builder.header(k, v);
        }
    }

    // 发送请求
    let response = match req_builder.send().await {
        Ok(r) => r,
        Err(e) => {
            let err_msg = if e.is_timeout() {
                format!("连接超时: {}", e)
            } else if e.is_connect() {
                format!("无法连接到 {}: {}", request.endpoint, e)
            } else {
                e.to_string()
            };
            let _ = app.emit(
                &channel,
                StreamEvent::Error {
                    error: err_msg.clone(),
                    status: None,
                },
            );
            return Err(AppError::Network(err_msg));
        }
    };

    // 检查 HTTP 状态
    if !response.status().is_success() {
        let status = response.status().as_u16();
        let body_text = response.text().await.unwrap_or_default();
        let err = parse_api_error(&body_text, status);
        let _ = app.emit(
            &channel,
            StreamEvent::Error {
                error: err.clone(),
                status: Some(status),
            },
        );
        return Err(AppError::Http {
            status,
            body: err,
        });
    }

    // 流式读取 SSE
    let mut stream = response.bytes_stream();
    // 累积原始字节而非逐 chunk lossy 解码：UTF-8 多字节字符（中文/emoji）
    // 可跨网络 chunk 边界，旧实现会截断成 U+FFFD 永久损坏内容（P0-1）
    let mut buffer: Vec<u8> = Vec::new();
    let mut full_content = String::new();
    let mut finish_reason: Option<String> = None;
    // 用量统计(usage chunk 累积,DeepSeek 系含前缀缓存拆解)
    let mut usage: Option<serde_json::Value> = None;
    let mut last_ping = std::time::Instant::now();

    while let Some(chunk_result) = stream.next().await {
        // 检查取消信号
        if cancel_flag.load(Ordering::SeqCst) {
            let _ = app.emit(
                &channel,
                StreamEvent::Error {
                    error: "已停止生成".to_string(),
                    status: None,
                },
            );
            // P3-1：语义统一 —— 取消返回 Err(Aborted) 而非 Ok，前端可精确分类
            return Err(AppError::Aborted("已停止生成".to_string()));
        }

        // 心跳：每 5 秒发送一次 ping，避免前端误判超时
        if last_ping.elapsed() >= Duration::from_secs(5) {
            let _ = app.emit(&channel, StreamEvent::Ping);
            last_ping = std::time::Instant::now();
        }

        let chunk = match chunk_result {
            Ok(c) => c,
            Err(e) => {
                let _ = app.emit(
                    &channel,
                    StreamEvent::Error {
                        error: format!("流读取失败: {}", e),
                        status: None,
                    },
                );
                return Err(AppError::Network(format!("流读取失败: {}", e)));
            }
        };

        // 累积字节（不做逐 chunk lossy 解码，多字节字符可跨 chunk）
        buffer.extend_from_slice(&chunk);

        // 按事件边界（\n\n）切分；事件块完整后再解码，避免截断多字节 UTF-8
        while let Some(event_end) = buffer.windows(2).position(|w| w == b"\n\n") {
            let raw_event =
                String::from_utf8_lossy(&buffer[..event_end]).into_owned();
            buffer.drain(..event_end + 2);

            if let Some(parsed) = parse_sse_event(&raw_event) {
                match parsed {
                    ParsedSSE::Done => {
                        let _ = app.emit(
                            &channel,
                            StreamEvent::Done {
                                full_content: full_content.clone(),
                                finish_reason: finish_reason.clone(),
                                usage: usage.clone(),
                            },
                        );
                        return Ok(full_content);
                    }
                    ParsedSSE::Delta { delta } => {
                        full_content.push_str(&delta);
                        let _ = app.emit(&channel, StreamEvent::Delta { delta });
                    }
                    ParsedSSE::Usage { usage: u } => {
                        // 用量统计(通常为流式末 chunk;含前缀缓存拆解)
                        usage = Some(u);
                    }
                    ParsedSSE::FinishReason { reason } => {
                        finish_reason = Some(reason);
                    }
                    ParsedSSE::Error { message } => {
                        let _ = app.emit(
                            &channel,
                            StreamEvent::Error {
                                error: message,
                                status: None,
                            },
                        );
                    }
                    ParsedSSE::Ignore => {}
                }
            }
        }
    }

    // 流自然结束（未显式 [DONE]）
    let _ = app.emit(
        &channel,
        StreamEvent::Done {
            full_content: full_content.clone(),
            finish_reason: finish_reason.clone(),
            usage: usage.clone(),
        },
    );
    Ok(full_content)
}

// ── SSE 解析 ──

/// 校验 API endpoint（P0-2 安全：防 SSRF 与密钥外发）
///
/// 规则：
/// - 协议仅允许 http/https
/// - 禁止 link-local（169.254.0.0/16，含云元数据 169.254.169.254）、
///   IPv6 link-local（fe80::/10）、保留/组播/广播地址
/// - 回环（127.0.0.0/8、::1）与私网（10/8、172.16/12、192.168/16）默认禁止，
///   仅当 `allow_private` 为 true（前端识别为本地/局域网模型）时放行
/// - 域名（如 api.openai.com）始终允许；DNS 重绑定属残余风险（纵深防御）
pub(crate) fn validate_endpoint(
    endpoint: &str,
    allow_private: bool,
) -> Result<(), String> {
    let (scheme, after_scheme) = endpoint
        .split_once("://")
        .ok_or_else(|| "endpoint 必须包含协议（如 https://）".to_string())?;
    if scheme != "http" && scheme != "https" {
        return Err(format!("endpoint 协议仅支持 http/https，收到：{scheme}"));
    }

    let authority = after_scheme
        .split(['/', '?'])
        .next()
        .unwrap_or(after_scheme);
    if authority.is_empty() {
        return Err("endpoint 缺少主机名".to_string());
    }

    // 提取主机名（IPv6 用方括号包裹）
    let host = if let Some(rest) = authority.strip_prefix('[') {
        rest.split(']').next().unwrap_or(rest)
    } else {
        authority.split(':').next().unwrap_or(authority)
    };
    if host.is_empty() {
        return Err("endpoint 缺少主机名".to_string());
    }

    // IPv4 检查
    if let Ok(ip) = host.parse::<std::net::Ipv4Addr>() {
        let o = ip.octets();
        if o[0] == 169 && o[1] == 254 {
            return Err("禁止访问 link-local 地址（169.254.0.0/16，含云元数据）".to_string());
        }
        if o[0] == 0 || (224..=239).contains(&o[0]) || o == [255, 255, 255, 255] {
            return Err("禁止访问保留/组播/广播地址".to_string());
        }
        let is_private = o[0] == 127
            || o[0] == 10
            || (o[0] == 172 && (16..=31).contains(&o[1]))
            || (o[0] == 192 && o[1] == 168);
        if is_private && !allow_private {
            return Err(
                "禁止访问回环/内网地址；本地或局域网模型请在客户端勾选「允许本地模型」"
                    .to_string(),
            );
        }
    } else if host.contains(':') {
        // IPv6
        let lower = host.to_lowercase();
        if lower.starts_with("fe8")
            || lower.starts_with("fe9")
            || lower.starts_with("fea")
            || lower.starts_with("feb")
        {
            return Err("禁止访问 IPv6 link-local 地址（fe80::/10）".to_string());
        }
        if !allow_private && lower.starts_with("::1") {
            return Err(
                "禁止访问 IPv6 回环地址；本地模型请在客户端勾选「允许本地模型」".to_string(),
            );
        }
    }

    Ok(())
}

/// 单个 SSE 事件的解析结果
#[derive(Debug)]
enum ParsedSSE {
    /// [DONE] 标记
    Done,
    /// 增量内容
    Delta { delta: String },
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
fn parse_sse_event(raw: &str) -> Option<ParsedSSE> {
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

    // 提取 delta
    if let Some(delta) = choice.get("delta") {
        if let Some(content) = delta.get("content").and_then(|c| c.as_str()) {
            return Some(ParsedSSE::Delta {
                delta: content.to_string(),
            });
        }
        // delta 但无 content（首个 chunk 的角色宣告），忽略
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
fn parse_api_error(body: &str, status: u16) -> String {
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

// ── 单元测试 ──

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
            Some(ParsedSSE::Delta { delta }) => assert_eq!(delta, "Hello"),
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

    // ── P0-2 endpoint 校验 ──

    #[test]
    fn test_validate_endpoint_allows_public_https() {
        assert!(validate_endpoint("https://api.openai.com/v1/chat/completions", false).is_ok());
    }

    #[test]
    fn test_validate_endpoint_rejects_cloud_metadata() {
        let err = validate_endpoint("http://169.254.169.254/latest/meta-data", false)
            .unwrap_err();
        assert!(err.contains("link-local"), "{err}");
    }

    #[test]
    fn test_validate_endpoint_rejects_non_http_scheme() {
        let err = validate_endpoint("file:///etc/passwd", false).unwrap_err();
        assert!(err.contains("协议"), "{err}");
    }

    #[test]
    fn test_validate_endpoint_rejects_loopback_by_default() {
        let err = validate_endpoint("http://127.0.0.1:11434/v1/chat/completions", false)
            .unwrap_err();
        assert!(err.contains("回环"), "{err}");
    }

    #[test]
    fn test_validate_endpoint_allows_loopback_with_flag() {
        assert!(validate_endpoint("http://127.0.0.1:11434/v1/chat/completions", true).is_ok());
    }

    #[test]
    fn test_validate_endpoint_rejects_private_network_by_default() {
        let err = validate_endpoint("http://192.168.1.10:8080/v1", false).unwrap_err();
        assert!(err.contains("内网"), "{err}");
        let err2 = validate_endpoint("http://10.0.0.5:8080/v1", false).unwrap_err();
        assert!(err2.contains("内网"), "{err2}");
        let err3 = validate_endpoint("http://172.16.0.1:8080/v1", false).unwrap_err();
        assert!(err3.contains("内网"), "{err3}");
    }

    #[test]
    fn test_validate_endpoint_rejects_multicast_and_broadcast() {
        assert!(validate_endpoint("http://224.0.0.1/x", false).is_err());
        assert!(validate_endpoint("http://255.255.255.255/x", false).is_err());
    }

    #[test]
    fn test_validate_endpoint_rejects_ipv6_link_local() {
        let err = validate_endpoint("http://[fe80::1]:8080/v1", false).unwrap_err();
        assert!(err.contains("link-local"), "{err}");
    }

    #[test]
    fn test_validate_endpoint_rejects_missing_scheme_and_host() {
        assert!(validate_endpoint("api.openai.com/v1", false).is_err());
        assert!(validate_endpoint("https:///path", false).is_err());
    }

    #[test]
    fn test_validate_endpoint_private_with_flag_ok() {
        assert!(validate_endpoint("http://192.168.0.2:5000/v1", true).is_ok());
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
}

#[cfg(test)]
mod usage_tests {
    use super::*;

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
    fn test_done_event_serializes_usage() {
        let done = StreamEvent::Done {
            full_content: "ok".into(),
            finish_reason: Some("stop".into()),
            usage: Some(serde_json::json!({"prompt_cache_hit_tokens": 60})),
        };
        let json = serde_json::to_string(&done).unwrap();
        assert!(json.contains("prompt_cache_hit_tokens"));
        let no_usage = StreamEvent::Done {
            full_content: "ok".into(),
            finish_reason: None,
            usage: None,
        };
        let json2 = serde_json::to_string(&no_usage).unwrap();
        assert!(!json2.contains("usage"));
    }
}
