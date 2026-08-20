// lib.rs — Tauri 2.0 应用库入口
//
// 职责：
// 1. 注册所有 invoke 命令（fs / chat_stream / app_info 等）
// 2. 启动时初始化数据目录
// 3. 配置 Tauri 插件（fs / dialog / shell / http / os）
// 4. 应用启动事件监听（窗口创建、关闭等）
//
// 命令命名约定：snake_case（前端通过 invoke('snake_case_name') 调用）

pub mod commands;
pub mod error;
pub mod shortcut;
pub mod storage;
pub mod tray;

use commands::{app_info, chat_stream, fetch_models, fs_commands};
use tauri::Manager;
use tray::init_tray;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
        .format_timestamp_millis()
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            // 初始化系统托盘（桌面端强化）
            init_tray(app.handle())?;

            // 注册全局快捷键（桌面端强化）
            shortcut::init(app.handle())?;

            // 拦截主窗口关闭 → 最小化到托盘
            if let Some(window) = app.get_webview_window("main") {
                window.clone().on_window_event(move |event| {
                    tray::handle_window_event(&window, event);
                });
            }

            // 启动时初始化数据目录结构
            let handle = app.handle();
            let data_dir = storage::get_data_dir(handle)?;
            storage::ensure_dir(&data_dir, "characters")?;
            storage::ensure_dir(&data_dir, "chats")?;
            storage::ensure_dir(&data_dir, "settings")?;
            storage::ensure_dir(&data_dir, "backups")?;
            // W2 新增：Lorebook 和群聊目录
            storage::ensure_dir(&data_dir, "lorebooks")?;
            storage::ensure_dir(&data_dir, "groups")?;
            // 迭代22 新增：Persona 目录 (F07)
            storage::ensure_dir(&data_dir, "personas")?;
            // M1 新增：DataBank 文档与 Story 分析结果目录（解 B1）
            storage::ensure_dir(&data_dir, "documents")?;
            storage::ensure_dir(&data_dir, "stories")?;
            // 迭代33 新增：整块快照目录（社区市场 / 角色版本等）
            storage::ensure_dir(&data_dir, "snapshots")?;
            log::info!("数据目录已就绪: {}", data_dir.display());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // ── 文件系统命令 ──
            fs_commands::save_character_file,
            fs_commands::load_character_file,
            fs_commands::list_character_files,
            fs_commands::delete_character_file,
            fs_commands::save_chat_file,
            fs_commands::load_chat_file,
            fs_commands::list_chat_files,
            fs_commands::delete_chat_file,
            fs_commands::save_settings_file,
            fs_commands::load_settings_file,
            // ── Lorebook 命令（W2 新增） ──
            fs_commands::save_lorebook_file,
            fs_commands::load_lorebook_file,
            fs_commands::list_lorebook_files,
            fs_commands::delete_lorebook_file,
            // ── 群聊命令（W2 新增） ──
            fs_commands::save_group_chat_file,
            fs_commands::load_group_chat_file,
            fs_commands::list_group_chat_files,
            fs_commands::delete_group_chat_file,
            // ── Persona 命令（迭代22 新增 F07） ──
            fs_commands::save_persona_file,
            fs_commands::load_persona_file,
            fs_commands::list_persona_files,
            fs_commands::delete_persona_file,
            // ── DataBank 文档命令（M1 新增：解 B1） ──
            fs_commands::save_document_file,
            fs_commands::load_document_file,
            fs_commands::list_document_files,
            fs_commands::delete_document_file,
            // ── Story 分析结果命令（M1 新增：解 B1） ──
            fs_commands::save_story_file,
            fs_commands::load_story_file,
            fs_commands::list_story_files,
            fs_commands::delete_story_file,
            // ── 整块快照命令（迭代33 新增） ──
            fs_commands::save_snapshot_file,
            fs_commands::load_snapshot_file,
            // ── 流式聊天命令 ──
            chat_stream::chat_stream,
            chat_stream::cancel_chat_stream,
            // ── 模型列表（第8条） ──
            fetch_models::fetch_models,
            // ── 应用信息 ──
            app_info::get_app_version,
            app_info::get_data_dir_path,
            app_info::get_data_dir_size,
        ])
        .run(tauri::generate_context!())
        .expect("Tauri 应用启动失败");
}
