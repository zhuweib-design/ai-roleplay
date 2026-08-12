// fs_commands.rs — 文件系统命令
//
// 实现与前端 StorageAdapter 接口对应的本地文件存储：
// - characters/ 目录：每张角色卡一个 .json 文件
// - chats/ 目录：每个对话一个 .json 文件
// - settings/ 目录：app.json 单条记录
// - lorebooks/ groups/ personas/ documents/ stories/ 目录：同类 JSON 文件
//
// 前端通过 @tauri-apps/api/core invoke 调用：
//   import { invoke } from '@tauri-apps/api/core';
//   await invoke('save_character_file', { id: 'xxx', card: {...} });
//
// CRUD 收敛（P1-4）：characters/lorebooks/groups/personas/documents 五组
// save/load/list/delete 由宏 fs_crud! 生成，避免复制粘贴导致的"新增数据类型漏实现"。
// chats（list 需按 characterId 过滤）与 settings（无 id）为特例，保留手写。

use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::error::AppResult;
use crate::storage::{get_data_dir, id_to_filename, list_json_files};

// ── 通用工具 ──

/// 读取并解析 JSON 文件（不存在时返回 None）
fn read_json_file<T: for<'de> Deserialize<'de>>(path: &PathBuf) -> AppResult<Option<T>> {
    if !path.exists() {
        return Ok(None);
    }
    let content = fs::read_to_string(path)?;
    let value: T = serde_json::from_str(&content)?;
    Ok(Some(value))
}

/// 序列化为 JSON 并写入文件（自动创建父目录）
fn write_json_file<T: Serialize>(path: &PathBuf, value: &T) -> AppResult<()> {
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)?;
        }
    }
    let content = serde_json::to_string_pretty(value)?;
    // 原子写入：先写 .tmp 再重命名，避免崩溃导致数据损坏
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, content)?;
    fs::rename(&tmp, path)?;
    Ok(())
}

/// 删除文件（不存在时视为成功）
fn delete_file(path: &PathBuf) -> AppResult<()> {
    if path.exists() {
        fs::remove_file(path)?;
    }
    Ok(())
}

// ── CRUD 宏（P1-4：五组同类 CRUD 收敛）──
//
// 参数：
//   $save/$load/$list/$delete — 四个命令函数名（与前端 invoke 名一致）
//   $dir — 数据子目录名
//   $param — 保存命令的载荷参数名（须与前端 invoke 键一致）
//   $label — 日志中文名
//   $sort_key — list 排序字段（"" = 不排序；按字符串降序，与 IndexedDB 端对齐）
macro_rules! fs_crud {
    ($save:ident, $load:ident, $list:ident, $delete:ident, $dir:literal, $param:ident, $label:literal, $sort_key:literal) => {
        /// 保存或更新（CRUD 宏生成）
        #[tauri::command]
        pub fn $save(
            app: AppHandle,
            id: String,
            $param: serde_json::Value,
        ) -> AppResult<()> {
            let data_dir = get_data_dir(&app)?;
            let filename = id_to_filename(&id);
            let path = data_dir.join($dir).join(format!("{}.json", filename));
            write_json_file(&path, &$param)?;
            log::debug!("已保存{}: {}", $label, path.display());
            Ok(())
        }

        /// 加载单个（CRUD 宏生成）
        #[tauri::command]
        pub fn $load(app: AppHandle, id: String) -> AppResult<Option<serde_json::Value>> {
            let data_dir = get_data_dir(&app)?;
            let filename = id_to_filename(&id);
            let path = data_dir.join($dir).join(format!("{}.json", filename));
            read_json_file(&path)
        }

        /// 加载全部（CRUD 宏生成；$sort_key 非空时按该字段字符串降序，与 IndexedDB 对齐）
        #[tauri::command]
        pub fn $list(app: AppHandle) -> AppResult<Vec<serde_json::Value>> {
            let data_dir = get_data_dir(&app)?;
            let dir = data_dir.join($dir);

            if !dir.exists() {
                return Ok(Vec::new());
            }

            let ids = list_json_files(&dir)?;
            let mut items = Vec::with_capacity(ids.len());
            for id in ids {
                let path = dir.join(format!("{}.json", id));
                if let Some(item) = read_json_file::<serde_json::Value>(&path)? {
                    items.push(item);
                }
            }
            if $sort_key != "" {
                items.sort_by(|a, b| {
                    let a_time = a
                        .get($sort_key)
                        .and_then(|v| v.as_str())
                        .unwrap_or("");
                    let b_time = b
                        .get($sort_key)
                        .and_then(|v| v.as_str())
                        .unwrap_or("");
                    b_time.cmp(&a_time)
                });
            }
            Ok(items)
        }

        /// 删除（CRUD 宏生成）
        #[tauri::command]
        pub fn $delete(app: AppHandle, id: String) -> AppResult<()> {
            let data_dir = get_data_dir(&app)?;
            let filename = id_to_filename(&id);
            let path = data_dir.join($dir).join(format!("{}.json", filename));
            delete_file(&path)?;
            log::debug!("已删除{}: {}", $label, path.display());
            Ok(())
        }
    };
}

// ── 角色卡 CRUD ──
fs_crud!(
    save_character_file,
    load_character_file,
    list_character_files,
    delete_character_file,
    "characters",
    card,
    "角色卡",
    ""
);

// ── 对话 CRUD ──
// list_chat_files 需按 characterId 过滤，保留手写实现

/// 保存或更新对话
#[tauri::command]
pub fn save_chat_file(
    app: AppHandle,
    id: String,
    chat: serde_json::Value,
) -> AppResult<()> {
    let data_dir = get_data_dir(&app)?;
    let filename = id_to_filename(&id);
    let path = data_dir.join("chats").join(format!("{}.json", filename));
    write_json_file(&path, &chat)?;
    log::debug!("已保存对话: {}", path.display());
    Ok(())
}

/// 加载单个对话
#[tauri::command]
pub fn load_chat_file(
    app: AppHandle,
    id: String,
) -> AppResult<Option<serde_json::Value>> {
    let data_dir = get_data_dir(&app)?;
    let filename = id_to_filename(&id);
    let path = data_dir.join("chats").join(format!("{}.json", filename));
    read_json_file(&path)
}

/// 加载指定角色的全部对话（Rust 端过滤 + updatedAt 降序）
#[tauri::command]
pub fn list_chat_files(app: AppHandle, character_id: String) -> AppResult<Vec<serde_json::Value>> {
    let data_dir = get_data_dir(&app)?;
    let dir = data_dir.join("chats");

    if !dir.exists() {
        return Ok(Vec::new());
    }

    let ids = list_json_files(&dir)?;
    let mut chats = Vec::with_capacity(ids.len());
    for id in ids {
        let path = dir.join(format!("{}.json", id));
        if let Some(chat) = read_json_file::<serde_json::Value>(&path)? {
            if let Some(c_id) = chat.get("characterId").and_then(|v| v.as_str()) {
                if c_id == character_id {
                    chats.push(chat);
                }
            }
        }
    }
    // 按 updatedAt 降序排序
    chats.sort_by(|a, b| {
        let a_time = a
            .get("updatedAt")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let b_time = b
            .get("updatedAt")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        b_time.cmp(&a_time)
    });
    Ok(chats)
}

/// 删除对话
#[tauri::command]
pub fn delete_chat_file(app: AppHandle, id: String) -> AppResult<()> {
    let data_dir = get_data_dir(&app)?;
    let filename = id_to_filename(&id);
    let path = data_dir.join("chats").join(format!("{}.json", filename));
    delete_file(&path)?;
    log::debug!("已删除对话: {}", path.display());
    Ok(())
}

// ── 设置 ──

/// 保存全局设置（整体覆盖）
#[tauri::command]
pub fn save_settings_file(app: AppHandle, settings: serde_json::Value) -> AppResult<()> {
    let data_dir = get_data_dir(&app)?;
    let path = data_dir.join("settings").join("app.json");
    write_json_file(&path, &settings)?;
    log::debug!("已保存设置");
    Ok(())
}

/// 加载全局设置（不存在时返回 null）
#[tauri::command]
pub fn load_settings_file(app: AppHandle) -> AppResult<Option<serde_json::Value>> {
    let data_dir = get_data_dir(&app)?;
    let path = data_dir.join("settings").join("app.json");
    read_json_file(&path)
}

// ── 整块快照（社区市场 / 角色版本等非实体集合数据）──
// 文件位于 {data_dir}/snapshots/{safe_key}.json，与前端 StorageAdapter.saveSnapshot 对应

/// 保存整块快照（覆盖写）
#[tauri::command]
pub fn save_snapshot_file(
    app: AppHandle,
    key: String,
    value: serde_json::Value,
) -> AppResult<()> {
    let data_dir = get_data_dir(&app)?;
    let filename = id_to_filename(&key);
    let path = data_dir.join("snapshots").join(format!("{}.json", filename));
    write_json_file(&path, &value)?;
    log::debug!("已保存快照: {}", path.display());
    Ok(())
}

/// 加载整块快照（不存在时返回 null）
#[tauri::command]
pub fn load_snapshot_file(app: AppHandle, key: String) -> AppResult<Option<serde_json::Value>> {
    let data_dir = get_data_dir(&app)?;
    let filename = id_to_filename(&key);
    let path = data_dir.join("snapshots").join(format!("{}.json", filename));
    read_json_file(&path)
}

// ── Lorebook CRUD (F06) ──
// 文件位于 {data_dir}/lorebooks/{id}.json
fs_crud!(
    save_lorebook_file,
    load_lorebook_file,
    list_lorebook_files,
    delete_lorebook_file,
    "lorebooks",
    lorebook,
    "Lorebook",
    "updatedAt"
);

// ── 群聊 CRUD (W2) ──
fs_crud!(
    save_group_chat_file,
    load_group_chat_file,
    list_group_chat_files,
    delete_group_chat_file,
    "groups",
    group,
    "群聊",
    "updatedAt"
);

// ── Persona CRUD (F07) ──
fs_crud!(
    save_persona_file,
    load_persona_file,
    list_persona_files,
    delete_persona_file,
    "personas",
    persona,
    "Persona",
    "updatedAt"
);

// ── DataBank 文档 CRUD（M1：解 B1）──
fs_crud!(
    save_document_file,
    load_document_file,
    list_document_files,
    delete_document_file,
    "documents",
    document,
    "数据银行文档",
    "updatedAt"
);

// ── Story 分析结果 CRUD（M1：解 B1）──
// list 按 createdAt（数值毫秒时间戳）降序，与 IndexedDB 端一致，保留手写

/// 保存或更新故事分析结果
#[tauri::command]
pub fn save_story_file(
    app: AppHandle,
    id: String,
    story: serde_json::Value,
) -> AppResult<()> {
    let data_dir = get_data_dir(&app)?;
    let filename = id_to_filename(&id);
    let path = data_dir.join("stories").join(format!("{}.json", filename));
    write_json_file(&path, &story)?;
    log::debug!("已保存故事分析结果: {}", path.display());
    Ok(())
}

/// 加载单个故事分析结果
#[tauri::command]
pub fn load_story_file(
    app: AppHandle,
    id: String,
) -> AppResult<Option<serde_json::Value>> {
    let data_dir = get_data_dir(&app)?;
    let filename = id_to_filename(&id);
    let path = data_dir.join("stories").join(format!("{}.json", filename));
    read_json_file(&path)
}

/// 加载全部故事分析结果（按 createdAt 数值降序）
#[tauri::command]
pub fn list_story_files(app: AppHandle) -> AppResult<Vec<serde_json::Value>> {
    let data_dir = get_data_dir(&app)?;
    let dir = data_dir.join("stories");

    if !dir.exists() {
        return Ok(Vec::new());
    }

    let ids = list_json_files(&dir)?;
    let mut stories = Vec::with_capacity(ids.len());
    for id in ids {
        let path = dir.join(format!("{}.json", id));
        if let Some(story) = read_json_file::<serde_json::Value>(&path)? {
            stories.push(story);
        }
    }
    stories.sort_by(|a, b| {
        let a_t = a.get("createdAt").and_then(|v| v.as_u64()).unwrap_or(0);
        let b_t = b.get("createdAt").and_then(|v| v.as_u64()).unwrap_or(0);
        b_t.cmp(&a_t)
    });
    Ok(stories)
}

/// 删除故事分析结果
#[tauri::command]
pub fn delete_story_file(app: AppHandle, id: String) -> AppResult<()> {
    let data_dir = get_data_dir(&app)?;
    let filename = id_to_filename(&id);
    let path = data_dir.join("stories").join(format!("{}.json", filename));
    delete_file(&path)?;
    log::debug!("已删除故事分析结果: {}", path.display());
    Ok(())
}

// ── 单元测试 ──
//
// 由于 Tauri 命令需要 AppHandle（仅在运行时存在），
// 单元测试主要覆盖辅助函数：id_to_filename、list_json_files 等。
// 完整集成测试需通过 tauri::test 框架运行（在 CI 环境中执行）。

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn test_id_to_filename_safe() {
        assert_eq!(id_to_filename("abc-123_def"), "abc-123_def");
        assert_eq!(id_to_filename("a/b\\c:d*e"), "a_b_c_d_e");
        assert_eq!(id_to_filename("中文"), "中文"); // 中文字符是 alphanumeric
    }

    #[test]
    fn test_list_json_files_empty() {
        let dir = tempdir().unwrap();
        let result = list_json_files(&dir.path().to_path_buf()).unwrap();
        assert!(result.is_empty());
    }

    #[test]
    fn test_list_json_files_with_files() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("a.json"), "{}").unwrap();
        fs::write(dir.path().join("b.json"), "{}").unwrap();
        fs::write(dir.path().join("c.txt"), "ignore me").unwrap();

        let result = list_json_files(&dir.path().to_path_buf()).unwrap();
        assert_eq!(result, vec!["a", "b"]);
    }

    #[test]
    fn test_write_and_read_json() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("test.json");
        let value: serde_json::Value =
            serde_json::from_str(r#"{"name":"test","value":42}"#).unwrap();
        write_json_file(&path, &value).unwrap();

        let loaded: Option<serde_json::Value> = read_json_file(&path).unwrap();
        assert!(loaded.is_some());
        assert_eq!(loaded.unwrap()["value"], 42);
    }

    #[test]
    fn test_read_json_file_not_exist() {
        let path = PathBuf::from("/nonexistent/path/file.json");
        let result: Option<serde_json::Value> = read_json_file(&path).unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn test_delete_file_not_exist() {
        let path = PathBuf::from("/nonexistent/file.json");
        // 删除不存在的文件应视为成功
        assert!(delete_file(&path).is_ok());
    }
}
