// Date: 2026-11-13. App startup owns service startup; read-only bridges never launch it.
use std::{path::Path, process::Command};
use tauri::Manager;

fn start_at(resources: &Path, data: &Path) -> Result<(), String> {
    let node = resources.join("workbench/node.exe");
    let script = resources.join("workbench/app/desktop/service.mjs");
    if !node.is_file() || !script.is_file() || !data.is_absolute() {
        return Err("BUNDLED_SERVICE_UNAVAILABLE".into());
    }
    let mut command = Command::new(node);
    command.arg(script).arg("start").arg("--data-dir").arg(data);
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
    let resources = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(Path::to_path_buf))
        .filter(|p| p.join("workbench/node.exe").is_file())
        .map(Ok)
        .unwrap_or_else(|| app.path().resource_dir().map_err(|e| e.to_string()));
    let data = crate::workbench::root();
    std::thread::spawn(move || {
        let diagnostic = data.as_ref().ok().map(|p| p.join("service-startup.json"));
        let result = resources
            .map_err(|e| e.to_string())
            .and_then(|resources| data.and_then(|data| start_at(&resources, &data)));
        if let Some(file) = diagnostic {
            let _ = std::fs::write(file, serde_json::json!({"date":"2026-11-13","ready":result.is_ok(),"error":result.as_ref().err()}).to_string());
        }
        if let Err(error) = result {
            log::error!("workbench startup failed: {error}");
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn missing_runtime_never_falls_back_to_developer_paths() {
        assert_eq!(
            start_at(Path::new("missing-runtime"), Path::new("relative-data")),
            Err("BUNDLED_SERVICE_UNAVAILABLE".into())
        );
    }
}
