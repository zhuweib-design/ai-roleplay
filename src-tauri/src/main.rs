// main.rs — Rust 主入口
//
// Tauri 2.0 推荐使用 lib + main 双入口结构：
// - lib.rs 包含应用逻辑（可在测试中复用）
// - main.rs 仅调用 lib 的 run 函数
//
// 这样设计的好处：
// 1. main 函数保持精简
// 2. 测试可直接 import lib 模块
// 3. Android/iOS 等 mobile 平台可直接复用 lib

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    ai_roleplay_lib::run()
}
