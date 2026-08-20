// shortcut.rs — 全局快捷键（T-15 桌面端强化）
//
// 功能：
// 1. 注册 Ctrl+Alt+Space 全局快捷键
// 2. 按下时切换主窗口显示/隐藏（与托盘左键单击行为一致）
//
// 依赖：tauri-plugin-global-shortcut 2.0（纯本地，无外部 API 调用）

use tauri::Manager;
use tauri_plugin_global_shortcut::ShortcutState;

/// 注册全局快捷键插件
pub fn init(app: &tauri::AppHandle) -> tauri::Result<()> {
    app.plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_shortcuts(["ctrl+alt+space"])
            .map_err(|e| tauri::Error::Anyhow(anyhow::anyhow!("全局快捷键注册失败: {e}")))?
            .with_handler(|app, _shortcut, event| {
                if event.state == ShortcutState::Pressed {
                    toggle_main_window(app);
                }
            })
            .build(),
    )?;
    Ok(())
}

/// 切换主窗口显示/隐藏
fn toggle_main_window(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        if win.is_visible().unwrap_or(false) && !win.is_minimized().unwrap_or(false) {
            let _ = win.hide();
        } else {
            let _ = win.show();
            let _ = win.unminimize();
            let _ = win.set_focus();
        }
    }
}