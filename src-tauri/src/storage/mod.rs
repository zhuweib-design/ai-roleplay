// storage/mod.rs — 存储层模块入口
//
// 职责：
// 1. 提供应用数据目录路径解析（跨平台）
// 2. 初始化目录结构
// 3. 文件路径拼接工具

use std::fs;
use std::path::PathBuf;

use tauri::{AppHandle, Manager};

use crate::error::AppResult;

/// 应用在 AppData 下的子目录名（与 tauri.conf.json identifier 对应）
const APP_DATA_SUBDIR: &str = "com.airoleplay.app";

/// 存储 schema 版本（P3-5）
///
/// 语义：所有数据 JSON 文件当前无独立版本字段，靠前端 type-adapters 兼容读取。
/// 未来核心类型结构演进（如字段重命名/删除）时：
/// 1. 将本常量 +1；
/// 2. 在对应 load 命令中按版本做迁移（或拒绝加载并提示重建）；
/// 3. 与前端 `StorageAdapter` 契约测试同步更新（R1 双存储预警）。
pub const STORAGE_SCHEMA_VERSION: u32 = 1;

/// 获取应用数据目录（跨平台）
///
/// Windows: %APPDATA%\com.airoleplay.app\data
/// macOS:   ~/Library/Application Support/com.airoleplay.app/data
/// Linux:   ~/.local/share/com.airoleplay.app/data
pub fn get_data_dir(app: &AppHandle) -> AppResult<PathBuf> {
    let path = app
        .path()
        .app_data_dir()
        .map_err(|e| crate::error::AppError::Internal(format!("获取 app_data_dir 失败: {}", e)))?;

    // 即使 tauri.conf.json 中已配置 identifier，这里仍手动拼装确保一致
    let path = if path
        .file_name()
        .and_then(|n| n.to_str())
        .map(|n| n == APP_DATA_SUBDIR)
        .unwrap_or(false)
    {
        path
    } else {
        path.join(APP_DATA_SUBDIR)
    };

    // 主数据目录
    let data_dir = path.join("data");

    // 确保根数据目录存在
    if !data_dir.exists() {
        fs::create_dir_all(&data_dir)?;
    }

    Ok(data_dir)
}

/// 在数据目录下创建子目录（已存在则跳过）
pub fn ensure_dir(data_dir: &PathBuf, subdir: &str) -> AppResult<PathBuf> {
    let path = data_dir.join(subdir);
    if !path.exists() {
        fs::create_dir_all(&path)?;
        log::info!("已创建目录: {}", path.display());
    }
    Ok(path)
}

/// 获取指定子目录下的所有 .json 文件名（不含扩展名）
pub fn list_json_files(dir: &PathBuf) -> AppResult<Vec<String>> {
    if !dir.exists() {
        return Ok(Vec::new());
    }

    let mut files = Vec::new();
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_file() {
            if let Some(ext) = path.extension() {
                if ext == "json" {
                    if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                        files.push(stem.to_string());
                    }
                }
            }
        }
    }
    files.sort();
    Ok(files)
}

/// 将字符串 ID 转为安全的文件名（移除特殊字符）
pub fn id_to_filename(id: &str) -> String {
    // 保留字母、数字、下划线、短横线
    id.chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '_' || c == '-' {
                c
            } else {
                '_'
            }
        })
        .collect()
}
