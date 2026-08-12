// build.rs — Tauri 构建脚本
//
// 由 tauri-build 在 cargo build 时执行：
// 1. 生成 IPC 相关代码
// 2. 验证 tauri.conf.json 配置
// 3. 嵌入图标等资源

fn main() {
    tauri_build::build()
}
