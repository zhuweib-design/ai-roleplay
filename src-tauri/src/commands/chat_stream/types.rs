// chat_stream/types.rs — 请求 / 事件的数据形状（B6 第五件从 chat_stream.rs 原样搬出）
//
// 搬出去的理由：这些结构不依赖 reqwest / 任务注册表 / SSE 解析，
// 是前端 invoke 的参数与 emit 的事件契约；单独一层便于和前端类型对照。

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

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
    /// P0-3：核采样阈值 top_p（可选；未设置 = 不传 = 供应商默认）
    #[serde(default, alias = "top_p")]
    pub top_p: Option<f32>,
    /// P0-3：存在惩罚（可选；OpenAI 兼容层专有）
    #[serde(default, alias = "presence_penalty")]
    pub presence_penalty: Option<f32>,
    /// P0-3：频率惩罚（可选；OpenAI 兼容层专有）
    #[serde(default, alias = "frequency_penalty")]
    pub frequency_penalty: Option<f32>,
    /// P0-2：思考强度 low/medium/high（可选；命中 capability 才下发）
    #[serde(default, alias = "reasoning_effort")]
    pub reasoning_effort: Option<String>,
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
    /// 收到增量 token（P0-1：thinking 为字段型思考增量，来自 delta.reasoning_content）
    Delta {
        delta: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        thinking: Option<String>,
    },
    /// 生成完成
    Done {
        full_content: String,
        finish_reason: Option<String>,
        /// 用量统计(供应商返回时;含前缀缓存拆解 prompt_cache_hit/miss_tokens)
        #[serde(skip_serializing_if = "Option::is_none")]
        usage: Option<serde_json::Value>,
        /// P0-1：完整思考内容（字段型累计值；无思考时不序列化该键）
        #[serde(skip_serializing_if = "Option::is_none")]
        full_thinking: Option<String>,
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_done_event_serializes_usage() {
        let done = StreamEvent::Done {
            full_content: "ok".into(),
            finish_reason: Some("stop".into()),
            usage: Some(serde_json::json!({"prompt_cache_hit_tokens": 60})),
            full_thinking: Some("想过".into()),
        };
        let json = serde_json::to_string(&done).unwrap();
        assert!(json.contains("prompt_cache_hit_tokens"));
        assert!(json.contains("full_thinking"));
        let no_usage = StreamEvent::Done {
            full_content: "ok".into(),
            finish_reason: None,
            usage: None,
            full_thinking: None,
        };
        let json2 = serde_json::to_string(&no_usage).unwrap();
        assert!(!json2.contains("usage"));
        assert!(!json2.contains("full_thinking"));
    }

    #[test]
    fn test_delta_event_omits_thinking_when_none() {
        let d = StreamEvent::Delta {
            delta: "hi".into(),
            thinking: None,
        };
        let json = serde_json::to_string(&d).unwrap();
        assert!(!json.contains("thinking"));
        let d2 = StreamEvent::Delta {
            delta: "hi".into(),
            thinking: Some("想".into()),
        };
        let json2 = serde_json::to_string(&d2).unwrap();
        assert!(json2.contains("thinking"));
    }

    #[test]
    fn test_chat_stream_request_accepts_camel_and_snake_sampling() {
        let camel = r#"{"endpoint":"https://x/v1/chat/completions","apiKey":"k","model":"m","messages":[],"topP":0.8,"presencePenalty":0.1,"frequencyPenalty":0.2,"reasoningEffort":"high"}"#;
        let req: ChatStreamRequest = serde_json::from_str(camel).unwrap();
        assert_eq!(req.top_p, Some(0.8));
        assert_eq!(req.presence_penalty, Some(0.1));
        assert_eq!(req.frequency_penalty, Some(0.2));
        assert_eq!(req.reasoning_effort.as_deref(), Some("high"));

        let snake = r#"{"endpoint":"https://x/v1/chat/completions","apiKey":"k","model":"m","messages":[],"top_p":0.8,"presence_penalty":0.1,"frequency_penalty":0.2,"reasoning_effort":"low"}"#;
        let req2: ChatStreamRequest = serde_json::from_str(snake).unwrap();
        assert_eq!(req2.top_p, Some(0.8));
        assert_eq!(req2.reasoning_effort.as_deref(), Some("low"));

        // 旧请求体不含新字段时全部为 None（向后兼容）
        let legacy = r#"{"endpoint":"https://x/v1/chat/completions","apiKey":"k","model":"m","messages":[]}"#;
        let req3: ChatStreamRequest = serde_json::from_str(legacy).unwrap();
        assert_eq!(req3.top_p, None);
        assert_eq!(req3.presence_penalty, None);
        assert_eq!(req3.frequency_penalty, None);
        assert_eq!(req3.reasoning_effort, None);
    }
}
