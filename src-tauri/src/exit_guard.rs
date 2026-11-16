// Date: 2026-11-16. Task protection covers tray exit, native close and app exit events.
use serde::Deserialize;
use std::{
    sync::atomic::{AtomicBool, Ordering},
    time::Duration,
};

static CHECKING: AtomicBool = AtomicBool::new(false);
static ALLOW_EXIT: AtomicBool = AtomicBool::new(false);

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExitStatus {
    allowed: bool,
    active_executions: u64,
    running_steps: u64,
    continuous_runs: u64,
}
impl ExitStatus {
    fn can_exit(&self) -> bool {
        self.allowed
            && self.active_executions == 0
            && self.running_steps == 0
            && self.continuous_runs == 0
    }
}

async fn allowed() -> Result<bool, String> {
    let data = crate::workbench::root()?;
    let (endpoint, token, generation) =
        crate::workbench::native_connection(&data, "owner-session.json")?;
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
    let client = reqwest::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(5))
        .build()
        .map_err(|_| "OWNER_UNAVAILABLE")?;
    let response = client
        .get(
            endpoint
                .join("api/runtime/exit-status")
                .map_err(|_| "INVALID_OWNER")?,
        )
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|_| "OWNER_UNAVAILABLE")?;
    if !response.status().is_success() || response.content_length().is_some_and(|n| n > 4096) {
        return Err("EXIT_STATUS_UNAVAILABLE".into());
    }
    let status: ExitStatus = response.json().await.map_err(|_| "INVALID_EXIT_STATUS")?;
    let (current, current_token, current_generation) =
        crate::workbench::native_connection(&data, "owner-session.json")?;
    if current != endpoint || current_token != token || current_generation != generation {
        return Err("STALE_OWNER".into());
    }
    Ok(status.can_exit())
}

#[cfg(windows)]
fn remind(app: &tauri::AppHandle, unavailable: bool) {
    use tauri::Manager;
    use windows::Win32::Foundation::HWND;
    use windows::{
        Win32::UI::WindowsAndMessaging::{
            MB_ICONWARNING, MB_OK, MB_SETFOREGROUND, MB_TOPMOST, MessageBoxW,
        },
        core::w,
    };
    let owner = app
        .get_webview_window(crate::window::ISLAND_LABEL)
        .and_then(|window| window.hwnd().ok())
        .map(|handle| HWND(handle.0));
    let message = if unavailable {
        w!("暂时无法确认任务状态，已阻止退出。任务岛正在恢复后台连接，请稍后重试。")
    } else {
        w!(
            "仍有任务正在执行，暂时不能退出任务岛。请先完成或取消正在执行的任务，再退出。关闭或隐藏设置窗口不影响任务执行。"
        )
    };
    // No force-exit choice: a normal exit cannot interrupt an active task.
    unsafe {
        MessageBoxW(
            owner,
            message,
            w!("任务岛 · 退出保护"),
            MB_OK | MB_ICONWARNING | MB_SETFOREGROUND | MB_TOPMOST,
        );
    }
}
#[cfg(not(windows))]
fn remind(_app: &tauri::AppHandle, unavailable: bool) {
    log::warn!("island exit blocked; status unavailable: {unavailable}");
}

pub fn consume_permit() -> bool {
    ALLOW_EXIT.swap(false, Ordering::SeqCst)
}
pub fn request(app: &tauri::AppHandle) {
    if CHECKING.swap(true, Ordering::SeqCst) {
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let result = allowed().await;
        if result == Ok(true) {
            ALLOW_EXIT.store(true, Ordering::SeqCst);
            CHECKING.store(false, Ordering::SeqCst);
            app.exit(0);
        } else {
            if result.is_err() {
                crate::service_bootstrap::spawn(&app);
            }
            let _ =
                tauri::async_runtime::spawn_blocking(move || remind(&app, result.is_err())).await;
            CHECKING.store(false, Ordering::SeqCst);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_a_complete_idle_status_allows_exit() {
        for (allowed, executions, steps, runs) in [
            (false, 0, 0, 0),
            (true, 1, 0, 0),
            (true, 0, 1, 0),
            (true, 0, 0, 1),
        ] {
            assert!(
                !ExitStatus {
                    allowed,
                    active_executions: executions,
                    running_steps: steps,
                    continuous_runs: runs,
                }
                .can_exit()
            );
        }
        let status: ExitStatus = serde_json::from_str(
            r#"{"allowed":true,"activeExecutions":0,"runningSteps":0,"continuousRuns":0}"#,
        )
        .unwrap();
        assert!(status.can_exit());
        assert!(serde_json::from_str::<ExitStatus>(r#"{"allowed":true}"#).is_err());
    }
}
