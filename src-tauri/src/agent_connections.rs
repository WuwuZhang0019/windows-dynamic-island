// Date: 2026-11-12. Separate private grants and configuration for each local MCP application.
use crate::workbench::root;
use crate::workbench_connection::{
    config_root, issue_with_saver, manager_post, save_config, saved_principal, status_at,
};
use serde_json::{Value, json};
use std::path::{Path, PathBuf};
use tauri::WebviewWindow;
const APPS: [&str; 4] = ["codex", "claude-code", "dsh", "workbuddy"];
fn app_directory(base: &Path, app: &str) -> Result<PathBuf, String> {
    if !APPS.contains(&app) {
        return Err("INVALID_APP_ID".into());
    }
    Ok(if app == "codex" {
        base.to_owned()
    } else {
        base.join("connections").join(app)
    })
}
fn settings_only(label: &str) -> Result<(), String> {
    if label != crate::settings::SETTINGS_LABEL {
        return Err("FORBIDDEN".into());
    }
    Ok(())
}
async fn set_at(data: &Path, base: &Path, app: &str, enabled: bool) -> Result<Value, String> {
    let directory = app_directory(base, app)?;
    let status = status_at(data, &directory).await?;
    if enabled && (status["enabled"] != true || status["automatic"] != true) {
        issue_with_saver(
            data,
            &directory,
            "api/light-access/connect",
            json!({"appId":app,"acknowledged":true}),
            json!({"automatic":true,"appId":app}),
            save_config,
        )
        .await?;
    } else if !enabled && status["enabled"] == true {
        let principal = saved_principal(&directory)?.ok_or("CONFIG_READ_FAILED")?;
        let result = manager_post(
            data,
            "api/light-access/revoke",
            json!({"principal":principal,"acknowledged":true}),
        )
        .await?;
        if result["revoked"] != true {
            return Err("AUTHORIZATION_RESULT_UNKNOWN".into());
        }
    }
    let mut result = status_at(data, &directory).await?;
    result["appId"] = json!(app);
    Ok(result)
}
#[tauri::command]
pub async fn island_agent_connections(window: WebviewWindow) -> Result<Value, String> {
    settings_only(window.label())?;
    let data = root()?;
    let base = config_root()?;
    let mut values = Vec::new();
    for app in APPS {
        let mut status = status_at(&data, &app_directory(&base, app)?)
            .await
            .unwrap_or_else(|_| json!({"state":"unavailable","enabled":false}));
        status["appId"] = json!(app);
        values.push(status);
    }
    Ok(json!(values))
}
#[tauri::command]
pub async fn island_agent_set_connection(
    window: WebviewWindow,
    app_id: String,
    enabled: bool,
) -> Result<Value, String> {
    settings_only(window.label())?;
    // Share the original mutation lock with legacy connection commands.
    let _permit = crate::workbench_connection::Permit::take()?;
    set_at(&root()?, &config_root()?, &app_id, enabled).await
}
#[tauri::command]
pub fn island_agent_connection_setup(
    window: WebviewWindow,
    app_id: String,
) -> Result<Value, String> {
    settings_only(window.label())?;
    let base = config_root()?;
    app_directory(&base, &app_id)?;
    let runtime = base.join("runtime/light.mjs");
    if !runtime.is_file() {
        return Err("MCP_RUNTIME_UNAVAILABLE".into());
    }
    Ok(
        json!({"mcpServers":{"task-workbench":{"type":"stdio","command":"node","args":[runtime],
        "env":{"WORKBENCH_LIGHT_APP":app_id}}}}),
    )
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn directories_are_independent_and_cannot_escape_the_known_applications() {
        let base = std::env::temp_dir().join("island-agent-scope");
        assert_eq!(app_directory(&base, "codex").unwrap(), base);
        assert_ne!(
            app_directory(&base, "claude-code").unwrap(),
            app_directory(&base, "dsh").unwrap()
        );
        for app in ["../codex", "C:/other", "unknown", ""] {
            assert!(app_directory(&base, app).is_err());
        }
        assert!(settings_only("island").is_err());
        assert!(settings_only("settings").is_ok());
    }
}
