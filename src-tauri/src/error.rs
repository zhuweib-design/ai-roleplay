// error.rs — 统一错误类型
//
// 设计原则：
// 1. 所有可从前端调用的命令统一返回 Result<T, AppError>
// 2. AppError 实现 Serialize，可直接通过 IPC 序列化到前端
// 3. 前端通过 catch 拿到错误对象，根据 kind 字段分类处理

use serde::{Serialize, Serializer};
use thiserror::Error;

/// 错误种类（前端可据此分支处理）
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ErrorKind {
    /// 文件系统错误（权限/路径不存在/磁盘满等）
    Io,
    /// 序列化/反序列化错误（JSON 格式错误等）
    Serialize,
    /// 网络错误（连接失败/超时/DNS 等）
    Network,
    /// HTTP 错误（API 返回非 2xx）
    Http,
    /// 用户主动中止
    Aborted,
    /// 配置错误（端点 URL/Key 缺失等）
    Config,
    /// 其他未分类错误
    Internal,
}

/// 统一应用错误
#[derive(Debug, Error)]
pub enum AppError {
    #[error("IO 错误: {0}")]
    Io(#[from] std::io::Error),

    #[error("序列化错误: {0}")]
    Serialize(#[from] serde_json::Error),

    #[error("网络错误: {0}")]
    Network(String),

    #[error("HTTP {status}: {body}")]
    Http { status: u16, body: String },

    #[error("已中止: {0}")]
    Aborted(String),

    #[error("配置错误: {0}")]
    Config(String),

    #[error("内部错误: {0}")]
    Internal(String),
}

impl AppError {
    /// 获取错误种类（前端分类处理用）
    pub fn kind(&self) -> ErrorKind {
        match self {
            AppError::Io(_) => ErrorKind::Io,
            AppError::Serialize(_) => ErrorKind::Serialize,
            AppError::Network(_) => ErrorKind::Network,
            AppError::Http { .. } => ErrorKind::Http,
            AppError::Aborted(_) => ErrorKind::Aborted,
            AppError::Config(_) => ErrorKind::Config,
            AppError::Internal(_) => ErrorKind::Internal,
        }
    }

    /// HTTP 状态码（仅 Http 错误返回 Some）
    pub fn http_status(&self) -> Option<u16> {
        if let AppError::Http { status, .. } = self {
            Some(*status)
        } else {
            None
        }
    }
}

// 序列化为前端可消费的对象：{ kind: "io"|"network"|..., message: "...", status?: number }
impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut state = serializer.serialize_struct("AppError", 3)?;
        let kind_str = match self.kind() {
            ErrorKind::Io => "io",
            ErrorKind::Serialize => "serialize",
            ErrorKind::Network => "network",
            ErrorKind::Http => "http",
            ErrorKind::Aborted => "aborted",
            ErrorKind::Config => "config",
            ErrorKind::Internal => "internal",
        };
        state.serialize_field("kind", kind_str)?;
        state.serialize_field("message", &self.to_string())?;
        if let Some(status) = self.http_status() {
            state.serialize_field("status", &status)?;
        }
        state.end()
    }
}

/// 从 reqwest::Error 转换
impl From<reqwest::Error> for AppError {
    fn from(err: reqwest::Error) -> Self {
        if err.is_timeout() {
            AppError::Network(format!("请求超时: {}", err))
        } else if err.is_connect() {
            AppError::Network(format!("连接失败: {}", err))
        } else if err.is_decode() {
            AppError::Internal(format!("响应解码失败: {}", err))
        } else if err.is_body() {
            AppError::Network(format!("响应体错误: {}", err))
        } else {
            AppError::Internal(err.to_string())
        }
    }
}

// 公共类型别名
pub type AppResult<T> = Result<T, AppError>;
