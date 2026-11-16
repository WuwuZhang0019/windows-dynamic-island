// Date: 2026-11-16. One native watchdog owns startup and recovery of the bundled service.
use std::{
    path::Path,
    process::Command,
    sync::atomic::{AtomicBool, Ordering},
    time::Duration,
};
use tauri::Manager;

static WATCHING: AtomicBool = AtomicBool::new(false);
static WAKE: AtomicBool = AtomicBool::new(false);

fn start_at(resources: &Path, data: &Path, register: bool) -> Result<(), String> {
    let node = resources.join("workbench/node.exe");
    let script = resources.join("workbench/app/desktop/service.mjs");
    if !node.is_file() || !script.is_file() || !data.is_absolute() {
        return Err("BUNDLED_SERVICE_UNAVAILABLE".into());
    }
    let mut command = Command::new(node);
    command.arg(script).arg("start").arg("--data-dir").arg(data);
    if register {
        command
            .arg("--island-executable")
            .arg(std::env::current_exe().map_err(|_| "ISLAND_EXECUTABLE_UNAVAILABLE")?)
            .arg("--island-pid")
            .arg(std::process::id().to_string());
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let output = command.output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    Ok(())
}

pub fn spawn(app: &tauri::AppHandle) {
    WAKE.store(true, Ordering::SeqCst);
    if WATCHING.swap(true, Ordering::SeqCst) {
        return;
    }
    let resources = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(Path::to_path_buf))
        .filter(|p| p.join("workbench/node.exe").is_file())
        .map(Ok)
        .unwrap_or_else(|| app.path().resource_dir().map_err(|e| e.to_string()));
    let data = crate::workbench::root();
    std::thread::spawn(move || {
        let (resources, data) = match (resources, data) {
            (Ok(resources), Ok(data)) => (resources, data),
            _ => {
                log::error!("workbench recovery configuration unavailable");
                WATCHING.store(false, Ordering::SeqCst);
                return;
            }
        };
        let mut register = true;
        loop {
            WAKE.store(false, Ordering::SeqCst);
            let result = start_at(&resources, &data, register);
            if result.is_ok() {
                register = false;
            }
            let _ = std::fs::write(
                data.join("service-startup.json"),
                serde_json::json!({"date":"2026-11-16","ready":result.is_ok(),"error":result.as_ref().err()}).to_string(),
            );
            if let Err(error) = result {
                log::error!("workbench recovery failed: {error}");
            }
            for _ in 0..5 {
                std::thread::sleep(Duration::from_secs(1));
                if WAKE.load(Ordering::SeqCst) {
                    break;
                }
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn missing_runtime_never_falls_back_to_developer_paths() {
        assert_eq!(
            start_at(
                Path::new("missing-runtime"),
                Path::new("relative-data"),
                false
            ),
            Err("BUNDLED_SERVICE_UNAVAILABLE".into())
        );
    }
}
