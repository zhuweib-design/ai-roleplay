// app_info.rs — 应用信息命令
//
// 提供给前端查询应用版本、数据目录路径等元信息的能力

use std::fs;

use tauri::AppHandle;

use crate::error::AppResult;
use crate::storage::get_data_dir;

/// 获取应用版本号
///
/// 前端调用：const version = await invoke<string>('get_app_version');
#[tauri::command]
pub fn get_app_version(app: AppHandle) -> AppResult<String> {
    let version = app
        .package_info()
        .version
        .to_string();
    Ok(version)
}

/// 获取数据目录绝对路径（用于设置页显示）
///
/// 前端调用：const path = await invoke<string>('get_data_dir_path');
#[tauri::command]
pub fn get_data_dir_path(app: AppHandle) -> AppResult<String> {
    let path = get_data_dir(&app)?;
    Ok(path.to_string_lossy().to_string())
}

/// 计算数据目录占用空间（返回字节数）
///
/// 前端调用：const bytes = await invoke<number>('get_data_dir_size');
#[tauri::command]
pub fn get_data_dir_size(app: AppHandle) -> AppResult<u64> {
    let path = get_data_dir(&app)?;
    Ok(calc_dir_size(&path))
}

/// 递归计算目录大小（字节数）
fn calc_dir_size(path: &std::path::Path) -> u64 {
    if !path.exists() {
        return 0;
    }
    let mut total: u64 = 0;
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let entry_path = entry.path();
            if entry_path.is_dir() {
                total += calc_dir_size(&entry_path);
            } else if entry_path.is_file() {
                if let Ok(metadata) = entry.metadata() {
                    total += metadata.len();
                }
            }
        }
    }
    total
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn test_calc_dir_size_empty() {
        let dir = tempdir().unwrap();
        let size = calc_dir_size(dir.path());
        assert_eq!(size, 0);
    }

    #[test]
    fn test_calc_dir_size_with_files() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("a.txt"), "hello").unwrap(); // 5 bytes
        fs::write(dir.path().join("b.txt"), "world!").unwrap(); // 6 bytes

        let sub = dir.path().join("sub");
        fs::create_dir(&sub).unwrap();
        fs::write(sub.join("c.txt"), "1234567890").unwrap(); // 10 bytes

        let size = calc_dir_size(dir.path());
        assert_eq!(size, 5 + 6 + 10);
    }

    #[test]
    fn test_calc_dir_size_nonexistent() {
        let size = calc_dir_size(std::path::Path::new("/nonexistent/path"));
        assert_eq!(size, 0);
    }
}
