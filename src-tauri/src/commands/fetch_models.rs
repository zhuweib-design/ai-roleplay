// fetch_models.rs — 获取模型列表（GET {baseUrl}/v1/models）
//
// 与 chat_stream 相同的设计：
// - Rust reqwest 原生网络栈，绕过浏览器 CORS 限制
// - 通过 Tauri IPC 直接返回 Vec<String>（模型 id 列表）
//
// 前端调用：
// ```ts
// import { invoke } from '@tauri-apps/api/core';
// const models = await invoke('fetch_models', {
//   endpoint: 'https://api.openai.com/v1/models',
//   apiKey: 'sk-...',
//   extraHeaders: undefined,
// });
// ```

use std::collections::HashMap;
use std::time::Duration;

use serde::Deserialize;
use tauri::AppHandle;

use crate::error::{AppError, AppResult};
use crate::commands::chat_stream::{http_client, validate_endpoint};

/// 前端传入的请求参数
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchModelsRequest {
    /// 模型列表端点 URL（如 https://api.openai.com/v1/models）
    pub endpoint: String,
    /// API Key
    pub api_key: String,
    /// 额外 headers（如 Azure api-key）
    #[serde(default)]
    pub extra_headers: Option<HashMap<String, String>>,
    /// 是否允许访问回环/内网地址（本地/局域网模型；P0-2 安全默认 false）
    #[serde(default)]
    pub allow_private: bool,
}

/// 获取模型列表
///
/// 返回模型 id 字符串数组；响应体缺少 data 数组时返回空数组，
/// 由前端降级为手动输入模型名。
#[tauri::command]
pub async fn fetch_models(
    _app: AppHandle,
    request: FetchModelsRequest,
) -> AppResult<Vec<String>> {
    // P0-2 安全：endpoint 校验（SSRF / 密钥外发防护）
    validate_endpoint(&request.endpoint, request.allow_private)
        .map_err(AppError::Config)?;

    let client = http_client();

    let mut req_builder = client
        .get(&request.endpoint)
        .timeout(Duration::from_secs(30)) // 模型列表请求 30s 超时
        .header("Authorization", format!("Bearer {}", request.api_key));

    if let Some(extra) = &request.extra_headers {
        for (k, v) in extra {
            req_builder = req_builder.header(k, v);
        }
    }

    let response = req_builder.send().await?;

    if !response.status().is_success() {
        let status = response.status().as_u16();
        let body = response.text().await.unwrap_or_default();
        return Err(AppError::Http { status, body });
    }

    let json: serde_json::Value = response.json().await?;
    let models = json
        .get("data")
        .and_then(|d| d.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|m| m.get("id").and_then(|id| id.as_str()))
                .map(String::from)
                .collect::<Vec<String>>()
        })
        .unwrap_or_default();

    Ok(models)
}

#[cfg(test)]
mod tests {
    #[test]
    fn test_models_url_suffix_handled_in_client() {
        // URL 形态处理在 TS 端（openai-client / tauri-openai-client）完成，
        // 此处仅验证命令参数结构可反序列化
        let json = r#"{"endpoint":"https://api.openai.com/v1/models","apiKey":"sk-1"}"#;
        let req: super::FetchModelsRequest = serde_json::from_str(json).unwrap();
        assert_eq!(req.endpoint, "https://api.openai.com/v1/models");
        assert_eq!(req.api_key, "sk-1");
        assert!(req.extra_headers.is_none());
    }
}
