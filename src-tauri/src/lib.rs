// 修改日期：2026-11-12。固定工作台外壳仅启动窗口及设置服务。
mod autostart;
mod display;
mod glass;
mod i18n;
mod memory;
mod portable;
mod settings;
mod store;
mod task_library;
mod tray;
mod updater;
mod window;
mod workbench;
mod workbench_connection;

use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            let _ = settings::open(app);
        }))
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(window::HitState::default())
        .manage(window::DragState::default())
        .manage(i18n::Locale::default())
        .setup(|app| {
            let handle = app.handle().clone();
            app.manage(settings::Settings::load(&handle));
            if let Some(win) = app.get_webview_window(window::ISLAND_LABEL) {
                window::make_overlay(&win);
                display::place(&win)?;
                win.set_ignore_cursor_events(true)?;
                win.show()?;
            }
            memory::sync_island(&handle);
            glass::setup(&handle);
            window::spawn_hit_test(handle.clone());
            display::spawn_placement(handle.clone());
            tray::setup(&handle)?;
            tray::enable_autostart_on_first_run(&handle);
            updater::spawn(handle.clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            workbench_connection::island_workbench_connection_status,
            workbench_connection::island_workbench_set_connection,
            workbench_connection::island_workbench_pending_binding,
            workbench_connection::island_workbench_authorize_connection,
            workbench_connection::island_workbench_confirm_binding,
            task_library::island_task_library_read,
            task_library::island_task_library_change,
            workbench::island_workbench_read,
            workbench::island_workbench_save_preferences,
            window::set_hit_rects,
            glass::set_glass_shapes,
            glass::set_glass_level,
            glass::glass_supported,
            window::set_dragging,
            window::is_fullscreen_active,
            window::focus_island,
            window::restore_focus,
            display::list_monitors,
            settings::get_settings,
            settings::set_setting,
            settings::open_settings,
            settings::get_autostart,
            settings::set_autostart,
            settings::open_repo,
            settings::open_external,
            updater::check_update,
            updater::install_update,
            i18n::set_locale,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
