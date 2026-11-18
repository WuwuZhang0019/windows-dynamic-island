// Date: 2026-11-12. Fixed owner routes keep library mutations out of the read-only panel bridge.
use crate::workbench::{native_connection, request, root};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{path::Path, time::Duration};
use tauri::{Emitter, Manager, WebviewWindow};

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Action {
    Archive,
    Restore,
    Delete,
    Pause,
}
impl Action {
    fn route(self) -> &'static str {
        match self {
            Self::Archive => "api/light-library/archive",
            Self::Restore => "api/light-library/restore",
            Self::Delete => "api/light-library/delete",
            Self::Pause => "api/light-library/pause",
        }
    }
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Change {
    key: String,
    expected_revision: u64,
    acknowledged: bool,
}
fn allowed(label: &str, action: Action, input: &Change) -> Result<(), String> {
    let window = match action {
        Action::Archive | Action::Pause => label == crate::window::ISLAND_LABEL,
        Action::Restore | Action::Delete => label == crate::settings::SETTINGS_LABEL,
    };
    if !window || !input.acknowledged || input.key.is_empty() || input.key.len() > 4000 {
        return Err("FORBIDDEN".into());
    }
    Ok(())
}
async fn change_at(data: &Path, action: Action, input: Change) -> Result<Value, String> {
    let (endpoint, token, generation) = native_connection(data, "owner-session.json")?;
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
    let client = reqwest::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(5))
        .build()
        .map_err(|_| "OWNER_UNAVAILABLE")?;
    let mut response = client.post(endpoint.join(action.route()).map_err(|_| "INVALID_OWNER")?)
        .bearer_auth(&token).json(&json!({"key":input.key,"expectedRevision":input.expected_revision,"acknowledged":true}))
        .send().await.map_err(|_| "LIBRARY_RESULT_UNKNOWN")?;
    let status = response.status();
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "LIBRARY_RESULT_UNKNOWN")?
    {
        if bytes.len() + chunk.len() > 65536 {
            return Err("LIBRARY_RESULT_UNKNOWN".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    let (current, current_token, current_generation) =
        native_connection(data, "owner-session.json").map_err(|_| "LIBRARY_RESULT_UNKNOWN")?;
    if current != endpoint
        || current_token != token
        || current_generation != generation
        || status.is_server_error()
    {
        return Err("LIBRARY_RESULT_UNKNOWN".into());
    }
    let value: Value = serde_json::from_slice(&bytes).map_err(|_| "LIBRARY_RESULT_UNKNOWN")?;
    if !status.is_success() {
        return Err(value
            .get("error")
            .and_then(Value::as_str)
            .unwrap_or("LIBRARY_REJECTED")
            .to_string());
    }
    if value.get("saved") != Some(&Value::Bool(true))
        || value.get("revision").and_then(Value::as_u64).is_none()
    {
        return Err("LIBRARY_RESULT_UNKNOWN".into());
    }
    Ok(value)
}
#[tauri::command]
pub async fn island_task_library_read(window: WebviewWindow) -> Result<Value, String> {
    if window.label() != crate::settings::SETTINGS_LABEL {
        return Err("FORBIDDEN".into());
    }
    request(&root()?, None).await
}
#[tauri::command]
pub async fn island_task_library_change(
    window: WebviewWindow,
    action: Action,
    value: Change,
) -> Result<Value, String> {
    allowed(window.label(), action, &value)?;
    let result = change_at(&root()?, action, value).await?;
    let _ = window.app_handle().emit("task-library-changed", ());
    Ok(result)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn mutations_require_exact_window_action_and_confirmation() {
        let mut value = Change {
            key: "route".into(),
            expected_revision: 1,
            acknowledged: true,
        };
        assert!(allowed(crate::window::ISLAND_LABEL, Action::Archive, &value).is_ok());
        assert!(allowed(crate::window::ISLAND_LABEL, Action::Pause, &value).is_ok());
        assert!(allowed(crate::settings::SETTINGS_LABEL, Action::Pause, &value).is_err());
        assert!(allowed(crate::window::ISLAND_LABEL, Action::Delete, &value).is_err());
        assert!(allowed(crate::settings::SETTINGS_LABEL, Action::Delete, &value).is_ok());
        assert!(allowed(crate::settings::SETTINGS_LABEL, Action::Restore, &value).is_ok());
        assert!(allowed("other", Action::Archive, &value).is_err());
        value.acknowledged = false;
        assert!(allowed(crate::settings::SETTINGS_LABEL, Action::Delete, &value).is_err());
        assert!(serde_json::from_value::<Action>(json!("../light-mcp")).is_err());
        assert!(serde_json::from_value::<Change>(json!({"key":"r","expectedRevision":1,"acknowledged":true,"endpoint":"http://remote"})).is_err());
    }
}
