// commands/model_files.rs — 桌面端本地向量模型文件访问（自定义命令）
//
// 为什么存在：capabilities/default.json 只授予 core:default（P1-5 权限收敛），
// 而 tauri-plugin-fs / tauri-plugin-dialog 生成的 IPC 命令受插件 ACL 管束，前端
// 直连会被拒绝 —— 桌面端「导入本地模型」因此不可用。自定义命令经 invoke_handler
// 注册，不需要插件权限，功能恢复的同时不放宽 webview 权限面。
//
// 安全边界：所有 path 参数必须落在允许根目录内（项目 model/ 的 dev 相对路径、
// appData/model、本次会话用户经系统对话框选中的目录），且先 canonicalize 再比
// 较前缀 —— 阻断 .. 穿越，避免自定义命令退化成任意文件读取口子。

use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::Serialize;
use tauri::ipc::Response;
use tauri::{AppHandle, Manager};

use crate::error::{AppError, AppResult};
use crate::storage;

/// dev 场景下项目 model/ 的候选相对路径（exe 工作目录在 target/{debug,release}）
const PROJECT_MODEL_RELS: [&str; 3] = ["model", "../../model", "../../../model"];

/// 导入时随模型复制的文件（与改造前的 TauriFileAdapter 行为保持一致）
const IMPORT_FILES: [&str; 2] = ["model.onnx", "config.json"];

/// 可识别的权重文件名（存在性判定用；model_int8.onnx 仅读不导，沿用原行为）
const WEIGHT_FILES: [&str; 2] = ["model.onnx", "model_int8.onnx"];

/// 本次会话中用户通过系统对话框授权过的目录
static PICKED_DIRS: Mutex<Vec<PathBuf>> = Mutex::new(Vec::new());

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelDirEntry {
    pub name: String,
    pub is_dir: bool,
}

/// appData 下的模型根目录（与原 plugin-fs BaseDirectory::AppData 语义一致，
/// 注意不是 storage::get_data_dir 的 <appdata>/data，否则会读不到已安装模型）
fn appdata_model_root(app: &AppHandle) -> AppResult<PathBuf> {
    let root = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Internal(format!("获取 app_data_dir 失败: {e}")))?;
    Ok(root.join("model"))
}

/// 允许访问的根目录集合
fn allowed_roots(app: &AppHandle) -> Vec<PathBuf> {
    let mut roots = Vec::new();
    for rel in PROJECT_MODEL_RELS {
        if let Ok(path) = fs::canonicalize(rel) {
            roots.push(path);
        }
    }
    if let Ok(root) = appdata_model_root(app) {
        roots.push(root);
    }
    if let Ok(guard) = PICKED_DIRS.lock() {
        roots.extend(guard.iter().cloned());
    }
    roots
}

/// 校验并解析路径：必须位于某个允许根目录之内
fn resolve_allowed(app: &AppHandle, path: &str) -> AppResult<PathBuf> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err(AppError::Config("模型路径为空".into()));
    }
    let candidate = fs::canonicalize(trimmed)
        .map_err(|_| AppError::Config(format!("模型路径不存在或不可访问: {trimmed}")))?;
    if allowed_roots(app)
        .iter()
        .any(|root| candidate.starts_with(root))
    {
        Ok(candidate)
    } else {
        Err(AppError::Config(format!("模型路径不在允许范围内: {trimmed}")))
    }
}

/// 收集目录下的子目录名
fn collect_subdir_names(root: &Path, out: &mut HashSet<String>) {
    let Ok(entries) = fs::read_dir(root) else {
        return;
    };
    for entry in entries.flatten() {
        if entry.path().is_dir() {
            if let Some(name) = entry.file_name().to_str() {
                out.insert(name.to_string());
            }
        }
    }
}

/// 校验文件名：只允许安全字符，禁止路径分隔与 `..`
/// （不能复用 storage::id_to_filename —— 它会把 `.` 替换成 `_`，毁掉 model.onnx）
fn safe_file_name(name: &str) -> AppResult<String> {
    let trimmed = name.trim();
    let ok = !trimmed.is_empty()
        && trimmed != "."
        && trimmed != ".."
        && trimmed
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'));
    if ok {
        Ok(trimmed.to_string())
    } else {
        Err(AppError::Config(format!("非法文件名: {name}")))
    }
}

/// 已安装模型的模型目录候选（项目 model/ 在前，appData/model 兜底）
fn model_dir_candidates(app: &AppHandle, model: &str) -> AppResult<Vec<PathBuf>> {
    let safe = storage::id_to_filename(model);
    let mut dirs = Vec::new();
    for rel in PROJECT_MODEL_RELS {
        if let Ok(root) = fs::canonicalize(rel) {
            dirs.push(root.join(&safe));
        }
    }
    dirs.push(appdata_model_root(app)?.join(&safe));
    Ok(dirs)
}

/// 按模型 id + 文件名读取（解析顺序与改造前 TauriFileAdapter::tryRead 一致）
///
/// 二进制返回用 `ipc::Response`；`Result<Response, AppError>` 可编译（CI #83 验证），
/// 命令机制走的是 `IpcResponse` 而非 `Serialize`，不必降级成 `CommandResult`。
#[tauri::command]
pub fn read_model_by_id(app: AppHandle, model: String, file: String) -> AppResult<Response> {
    let name = safe_file_name(&file)?;
    for dir in model_dir_candidates(&app, &model)? {
        let candidate = dir.join(&name);
        if candidate.is_file() {
            return Ok(Response::new(fs::read(&candidate)?));
        }
    }
    Err(AppError::Config(format!(
        "模型文件不存在: {model}/{name}"
    )))
}

/// 系统目录对话框 → 选中的目录（取消返回 None）；选中后登记为本次会话可读根
///
/// `title` 由前端传入（native 对话框文案走 i18n）；为空时用内置兜底文案。
#[tauri::command]
pub async fn pick_model_dir(title: String) -> AppResult<Option<String>> {
    let title = if title.trim().is_empty() {
        "选择向量模型文件夹".to_string()
    } else {
        title
    };
    // 同步对话框放到 blocking 线程执行：对话框不能在主线程阻塞，且这样不依赖
    // rfd 的 async feature 组合（避免 CI 与本地 feature 解析差异带来的编译风险）。
    let picked = tauri::async_runtime::spawn_blocking(move || {
        rfd::FileDialog::new().set_title(title).pick_folder()
    })
    .await
    .map_err(|e| AppError::Internal(format!("目录对话框任务失败: {e}")))?;
    // rfd 0.16 的 pick_folder() 直接返回 PathBuf（0.14 的 FileHandle 包装已去掉）
    let Some(dir) = picked else {
        return Ok(None);
    };
    let canonical =
        fs::canonicalize(&dir).map_err(|_| AppError::Config("所选目录不可访问".into()))?;
    if let Ok(mut guard) = PICKED_DIRS.lock() {
        guard.push(canonical);
    }
    Ok(Some(dir.to_string_lossy().into_owned()))
}

/// 列举目录直接子项（名称 + 是否目录），按名称排序
#[tauri::command]
pub fn list_model_dir(app: AppHandle, path: String) -> AppResult<Vec<ModelDirEntry>> {
    let dir = resolve_allowed(&app, &path)?;
    let mut entries = Vec::new();
    for item in fs::read_dir(&dir)? {
        let item = item?;
        let Some(name) = item.file_name().to_str().map(str::to_string) else {
            continue;
        };
        let is_dir = item.file_type().map(|t| t.is_dir()).unwrap_or(false);
        entries.push(ModelDirEntry { name, is_dir });
    }
    entries.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(entries)
}

/// 读取模型文件原始字节。走 Tauri 二进制 IPC —— ONNX 权重可达数十 MB，
/// 返回 Vec<u8> 会被序列化成 JSON 数字数组，内存与耗时都不可接受。
#[tauri::command]
pub fn read_model_file(app: AppHandle, path: String) -> AppResult<Response> {
    let file = resolve_allowed(&app, &path)?;
    if !file.is_file() {
        return Err(AppError::Config(format!(
            "目标不是文件: {}",
            file.display()
        )));
    }
    Ok(Response::new(fs::read(&file)?))
}

/// 把选中目录里的模型文件复制进 appData/model/<id>/，返回已复制文件名
#[tauri::command]
pub fn copy_model_files(app: AppHandle, source: String, model: String) -> AppResult<Vec<String>> {
    let src = resolve_allowed(&app, &source)?;
    let dest = appdata_model_root(&app)?.join(storage::id_to_filename(&model));
    fs::create_dir_all(&dest)?;
    let mut saved = Vec::new();
    for name in IMPORT_FILES {
        let from = src.join(name);
        if !from.is_file() {
            continue;
        }
        fs::copy(&from, dest.join(name))?;
        saved.push(name.to_string());
    }
    Ok(saved)
}

/// 模型权重是否已就位（项目 model/ 优先，appData/model 兜底）
#[tauri::command]
pub fn has_model_files(app: AppHandle, model: String) -> AppResult<bool> {
    for dir in model_dir_candidates(&app, &model)? {
        for weight in WEIGHT_FILES {
            if dir.join(weight).is_file() {
                return Ok(true);
            }
        }
    }
    Ok(false)
}

/// 已安装模型 id 列表（项目 model/ 与 appData/model 子目录名的并集）
#[tauri::command]
pub fn list_installed_models(app: AppHandle) -> AppResult<Vec<String>> {
    let mut ids = HashSet::new();
    for rel in PROJECT_MODEL_RELS {
        if let Ok(root) = fs::canonicalize(rel) {
            collect_subdir_names(&root, &mut ids);
        }
    }
    collect_subdir_names(&appdata_model_root(&app)?, &mut ids);
    let mut list: Vec<String> = ids.into_iter().collect();
    list.sort();
    Ok(list)
}
