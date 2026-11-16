// 修改日期：2026-11-12。固定工作台外壳仅启动窗口及设置服务。
mod agent_connections;
mod autostart;
mod continuous;
mod display;
mod exit_guard;
mod glass;
mod i18n;
mod memory;
mod portable;
mod service_bootstrap;
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
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if argv.iter().any(|arg| arg == "--workbench-recover") {
                service_bootstrap::spawn(app);
            } else {
                let _ = settings::open(app);
            }
        }))
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(window::HitState::default())
        .manage(window::DragState::default())
        .manage(i18n::Locale::default())
        .setup(|app| {
            let handle = app.handle().clone();
            app.manage(settings::Settings::load(&handle));
            // Date: 2026-11-13. A debug-only native host permits input tests with isolated data.
            let input_test =
                cfg!(debug_assertions) && std::env::var_os("ISLAND_NATIVE_TEST_WINDOW").is_some();
            if let Some(win) = app.get_webview_window(window::ISLAND_LABEL) {
                if input_test {
                    win.set_skip_taskbar(false)?;
                    win.set_decorations(true)?;
                    win.set_title("任务岛 — 连续执行原生测试")?;
                } else {
                    window::make_overlay(&win);
                }
                display::place(&win)?;
                win.set_ignore_cursor_events(!input_test)?;
                win.show()?;
            }
            if !input_test
                || (cfg!(debug_assertions)
                    && std::env::var_os("ISLAND_NATIVE_TEST_SERVICE").is_some())
            {
                service_bootstrap::spawn(&handle);
            }
            memory::sync_island(&handle);
            glass::setup(&handle);
            if !input_test {
                window::spawn_hit_test(handle.clone());
                display::spawn_placement(handle.clone());
            }
            tray::setup(&handle)?;
            tray::enable_autostart_on_first_run(&handle);
            updater::spawn(handle.clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            agent_connections::island_agent_connections,
            agent_connections::island_agent_set_connection,
            agent_connections::island_agent_onboarding_instructions,
            workbench_connection::island_workbench_connection_status,
            workbench_connection::island_workbench_set_connection,
            workbench_connection::island_workbench_pending_binding,
            workbench_connection::island_workbench_authorize_connection,
            workbench_connection::island_workbench_confirm_binding,
            continuous::island_continuous_change,
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
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| match event {
            tauri::RunEvent::ExitRequested { api, .. } => {
                if !exit_guard::consume_permit() {
                    api.prevent_exit();
                    exit_guard::request(app);
                }
            }
            tauri::RunEvent::WindowEvent {
                label,
                event: tauri::WindowEvent::CloseRequested { api, .. },
                ..
            } if label == window::ISLAND_LABEL => {
                api.prevent_close();
                exit_guard::request(app);
            }
            _ => {}
        });
}
