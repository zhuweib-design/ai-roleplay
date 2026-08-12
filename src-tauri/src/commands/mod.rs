// commands/mod.rs — Tauri 命令模块入口
//
// 所有可从前端通过 invoke('xxx') 调用的命令都定义在此模块下。
//
// 命令命名约定：
// - 函数名使用 snake_case
// - 前端调用：invoke('save_character_file', { ... })
// - 返回值统一为 Result<T, AppError>，前端 catch 拿到 { kind, message, status? }

pub mod app_info;
pub mod chat_stream;
pub mod fetch_models;
pub mod fs_commands;
