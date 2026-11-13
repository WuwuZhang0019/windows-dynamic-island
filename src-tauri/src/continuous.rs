// Date: 2026-11-13. Narrow owner command for user-authorized stage-by-stage execution.
use crate::workbench::{native_connection, root};
use serde::Deserialize;
use serde_json::{Value, json};
use std::time::Duration;
use tauri::WebviewWindow;
#[derive(Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Action {
    Start,
    Pause,
    Resume,
}
#[derive(Deserialize, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Mode {
    Stages,
    CurrentThread,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Change {
    plan_key: String,
    action: Action,
    expected_revision: u64,
    acknowledged: bool,
    #[serde(default)]
    mode: Option<Mode>,
}
fn validate(label: &str, input: &Change) -> Result<(), String> {
    if label != crate::window::ISLAND_LABEL
        || !input.acknowledged
        || input.plan_key.is_empty()
        || input.plan_key.len() > 4000
    {
        return Err("FORBIDDEN".into());
    }
    Ok(())
}
#[tauri::command]
pub async fn island_continuous_change(
    window: WebviewWindow,
    value: Change,
) -> Result<Value, String> {
    validate(window.label(), &value)?;
    let data = root()?;
    let (endpoint, token, generation) = native_connection(&data, "owner-session.json")?;
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
    let client = reqwest::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|_| "OWNER_UNAVAILABLE")?;
    let action = match value.action {
        Action::Start => "start",
        Action::Pause => "pause",
        Action::Resume => "resume",
    };
    let mut body = json!({"planKey":value.plan_key,"action":action,"expectedRevision":value.expected_revision,"acknowledged":true});
    if let Some(mode) = value.mode {
        body["mode"] = serde_json::to_value(mode).map_err(|_| "INVALID_MODE")?;
    }
    let response = client
        .post(
            endpoint
                .join("api/light-continuous/change")
                .map_err(|_| "INVALID_OWNER")?,
        )
        .bearer_auth(&token)
        .json(&body)
        .send()
        .await
        .map_err(|_| "CONTINUOUS_RESULT_UNKNOWN")?;
    let status = response.status();
    let mut response = response;
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "CONTINUOUS_RESULT_UNKNOWN")?
    {
        if bytes.len() + chunk.len() > 65536 {
            return Err("CONTINUOUS_RESULT_UNKNOWN".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    let (current, current_token, current_generation) =
        native_connection(&data, "owner-session.json")?;
    if current != endpoint
        || current_token != token
        || current_generation != generation
        || status.is_server_error()
    {
        return Err("CONTINUOUS_RESULT_UNKNOWN".into());
    }
    let result: Value = serde_json::from_slice(&bytes).map_err(|_| "CONTINUOUS_RESULT_UNKNOWN")?;
    if !status.is_success() {
        return Err(result
            .get("error")
            .and_then(Value::as_str)
            .unwrap_or("CONTINUOUS_REJECTED")
            .to_string());
    }
    if result.get("saved") != Some(&Value::Bool(true)) {
        return Err("CONTINUOUS_RESULT_UNKNOWN".into());
    }
    Ok(result)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn exact_window_and_ack_required() {
        let v = Change {
            plan_key: "plan".into(),
            action: Action::Start,
            expected_revision: 0,
            acknowledged: true,
            mode: None,
        };
        assert!(validate(crate::window::ISLAND_LABEL, &v).is_ok());
        assert!(validate("settings", &v).is_err());
        assert!(serde_json::from_value::<Change>(json!({"planKey":"p","action":"start","expectedRevision":0,"acknowledged":true,"cwd":"elsewhere"})).is_err());
        for mode in ["stages", "current_thread"] {
            let input = json!({"planKey":"p","action":"resume","expectedRevision":0,"acknowledged":true,"mode":mode});
            assert!(serde_json::from_value::<Change>(input).is_ok());
        }
        assert!(serde_json::from_value::<Change>(json!({"planKey":"p","action":"start","expectedRevision":0,"acknowledged":true,"mode":"invalid"})).is_err());
    }
}
