// 修改日期：2026-11-11。保留原生桌面入口，移除Claude状态栏CLI入口。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
fn main() {
    dynamic_island_lib::run()
}
