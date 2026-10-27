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
//
// B6 第五件（2026-10-27）从本文件拆出四段，本文件只留装配与流循环：
// - types.rs  请求 / 事件的数据形状
// - sse.rs    事件边界、事件块解析、错误响应体转文案
// - guard.rs  endpoint 校验（fetch_models 也用它）
// - tasks.rs  取消标志的任务注册表

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, OnceLock};
use std::time::Duration;

use tauri::{AppHandle, Emitter};
use tokio_stream::StreamExt;

use crate::error::{AppError, AppResult};

mod guard;
mod sse;
mod tasks;
mod types;

pub use types::{ChatMessage, ChatStreamRequest, StreamEvent};
// fetch_models.rs 一直按 `crate::commands::chat_stream::validate_endpoint` 取它
pub(crate) use guard::validate_endpoint;
use sse::{find_event_boundary, parse_api_error, parse_sse_event, ParsedSSE};
use tasks::{cancel_task, register_task, unregister_task};

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
    // P0-3：采样参数逐个注入（未设置即不注入，由供应商使用自己的默认值）
    if let Some(top_p) = request.top_p {
        body["top_p"] = serde_json::json!(top_p);
    }
    if let Some(presence_penalty) = request.presence_penalty {
        body["presence_penalty"] = serde_json::json!(presence_penalty);
    }
    if let Some(frequency_penalty) = request.frequency_penalty {
        body["frequency_penalty"] = serde_json::json!(frequency_penalty);
    }
    // P0-2：思考强度（OpenAI 兼容推理模型的 reasoning_effort）
    if let Some(effort) = &request.reasoning_effort {
        body["reasoning_effort"] = serde_json::json!(effort);
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
    // P0-1：字段型思考累计值（delta.reasoning_content）
    let mut full_thinking = String::new();
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

        // 按事件边界切分；事件块完整后再解码，避免截断多字节 UTF-8
        // SSE 规范允许 \n\n 与 \r\n\r\n 两种分隔符，只认前者会让 CRLF 网关切不出事件
        while let Some((event_end, sep_len)) = find_event_boundary(&buffer) {
            let raw_event =
                String::from_utf8_lossy(&buffer[..event_end]).into_owned();
            buffer.drain(..event_end + sep_len);

            if let Some(parsed) = parse_sse_event(&raw_event) {
                match parsed {
                    ParsedSSE::Done => {
                        let _ = app.emit(
                            &channel,
                            StreamEvent::Done {
                                full_content: full_content.clone(),
                                finish_reason: finish_reason.clone(),
                                usage: usage.clone(),
                                full_thinking: if full_thinking.is_empty() {
                                    None
                                } else {
                                    Some(full_thinking.clone())
                                },
                            },
                        );
                        return Ok(full_content);
                    }
                    ParsedSSE::Delta { delta, thinking } => {
                        if let Some(d) = &delta {
                            full_content.push_str(d);
                        }
                        if let Some(t) = &thinking {
                            full_thinking.push_str(t);
                        }
                        let _ = app.emit(
                            &channel,
                            StreamEvent::Delta {
                                delta: delta.unwrap_or_default(),
                                thinking,
                            },
                        );
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
            full_thinking: if full_thinking.is_empty() {
                None
            } else {
                Some(full_thinking.clone())
            },
        },
    );
    Ok(full_content)
}
