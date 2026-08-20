// tray.rs — 系统托盘（T-15 桌面端强化）
//
// 功能：
// 1. 常驻系统托盘图标（读取 icons/icon.png）
// 2. 左键单击托盘图标：显示/隐藏主窗口
// 3. 右键菜单：「显示主窗口」「退出」
// 4. 关闭窗口时最小化到托盘（不退出，符合常驻应用习惯）
//
// 依赖：Tauri 2.0 内置 tray/menu API，无需额外插件。

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager,
};

/// 创建并注册系统托盘
pub fn init_tray(app: &AppHandle) -> tauri::Result<()> {
    // 托盘图标：复用应用图标
    let icon = app.default_window_icon().cloned().ok_or_else(|| {
        tauri::Error::Anyhow(anyhow::anyhow!("托盘图标缺失：default_window_icon 为空"))
    })?;

    // 右键菜单
    let show = MenuItem::with_id(app, "show", "显示主窗口", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;

    TrayIconBuilder::new()
        .icon(icon)
        .tooltip("AI 酒馆")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main_window(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            // 左键单击：切换窗口显示状态
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_main_window(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

/// 显示并聚焦主窗口
fn show_main_window(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

/// 切换主窗口显示/隐藏
fn toggle_main_window(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        if win.is_visible().unwrap_or(false) && !win.is_minimized().unwrap_or(false) {
            let _ = win.hide();
        } else {
            show_main_window(app);
        }
    }
}

/// 窗口关闭时拦截：最小化到托盘而非退出（在 setup 中通过 Window::on_window_event 注册）
pub fn handle_window_event(
    window: &tauri::WebviewWindow,
    event: &tauri::WindowEvent,
) {
    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
        // 拦截默认关闭，改为隐藏窗口（常驻托盘）
        api.prevent_close();
        let _ = window.hide();
    }
}
