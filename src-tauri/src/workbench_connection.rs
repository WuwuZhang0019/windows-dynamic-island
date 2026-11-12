// Date: 2026-11-12. Explicit settings-only authorization; management tokens never enter the WebView.
use crate::workbench::{native_connection, root};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    sync::atomic::{AtomicBool, AtomicU64, Ordering},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::WebviewWindow;

static BUSY: AtomicBool = AtomicBool::new(false);
static NEXT_FILE: AtomicU64 = AtomicU64::new(0);
pub(crate) struct Permit;
impl Permit {
    pub(crate) fn take() -> Result<Self, String> {
        BUSY.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .map_err(|_| "CONNECTION_OPERATION_BUSY")?;
        Ok(Self)
    }
}
impl Drop for Permit {
    fn drop(&mut self) {
        BUSY.store(false, Ordering::SeqCst);
    }
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ConnectionInput {
    project_key: String,
    thread_id: String,
    host_id: String,
    worktree_root: String,
    acknowledged: bool,
}
fn require_confirmation(label: &str, acknowledged: bool) -> Result<(), String> {
    if label != crate::settings::SETTINGS_LABEL || !acknowledged {
        return Err("EXPLICIT_SETTINGS_CONFIRMATION_REQUIRED".into());
    }
    Ok(())
}
fn checked_input(value: &ConnectionInput) -> Result<(), String> {
    if !value.acknowledged
        || [&value.project_key, &value.thread_id, &value.host_id]
            .iter()
            .any(|s| s.trim().is_empty() || s.len() > 2000)
        || value.worktree_root.len() > 16384
        || !Path::new(&value.worktree_root).is_absolute()
    {
        return Err("INVALID_CONNECTION_SCOPE".into());
    }
    Ok(())
}
fn unique_name(prefix: &str) -> String {
    format!(
        "{}-{}-{}-{}",
        prefix,
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos(),
        NEXT_FILE.fetch_add(1, Ordering::SeqCst)
    )
}
pub(crate) fn protect_directory(directory: &Path) -> Result<(), String> {
    fs::create_dir_all(directory).map_err(|_| "CONFIG_DIRECTORY_UNAVAILABLE")?;
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let account = std::env::var("USERNAME").map_err(|_| "PRIVATE_ACCOUNT_UNAVAILABLE")?;
        let output = std::process::Command::new("icacls.exe")
            .creation_flags(0x08000000)
            .arg(directory)
            .args([
                "/inheritance:r",
                "/grant:r",
                &format!("{account}:(OI)(CI)F"),
                "SYSTEM:(OI)(CI)F",
                "/Q",
            ])
            .output()
            .map_err(|_| "CONFIG_PERMISSION_FAILED")?;
        if !output.status.success() {
            return Err("CONFIG_PERMISSION_FAILED".into());
        }
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(directory, fs::Permissions::from_mode(0o700))
            .map_err(|_| "CONFIG_PERMISSION_FAILED")?;
    }
    Ok(())
}
fn write_new(file: &Path, bytes: &[u8]) -> Result<(), String> {
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut output = options.open(file).map_err(|_| "CONFIG_WRITE_FAILED")?;
    output
        .write_all(bytes)
        .and_then(|_| output.sync_all())
        .map_err(|_| "CONFIG_WRITE_FAILED".into())
}
fn prepare_config(directory: &Path) -> Result<Option<Vec<u8>>, String> {
    protect_directory(directory)?;
    let config = directory.join("config.json");
    match fs::read(&config) {
        Ok(bytes) => {
            write_new(
                &directory.join(format!("{}.json", unique_name("config-backup"))),
                &bytes,
            )?;
            return Ok(Some(bytes));
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(_) => return Err("CONFIG_BACKUP_FAILED".into()),
    }
    Ok(None)
}
pub(crate) fn atomic_save(file: &Path, bytes: &[u8]) -> Result<(), String> {
    let directory = file.parent().ok_or("CONFIG_DIRECTORY_UNAVAILABLE")?;
    let temporary = directory.join(format!("{}.tmp", unique_name("connection")));
    write_new(&temporary, bytes)?;
    if fs::rename(&temporary, file).is_err() {
        let _ = fs::remove_file(&temporary);
        return Err("CONFIG_SAVE_FAILED".into());
    }
    Ok(())
}
fn restore(file: &Path, previous: &Option<Vec<u8>>) -> Result<(), String> {
    if let Some(bytes) = previous {
        atomic_save(file, bytes)
    } else {
        match fs::remove_file(file) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(_) => Err("CONFIG_RESTORE_FAILED".into()),
        }
    }
}
pub(crate) fn save_config(directory: &Path, data: &Path, token: &str) -> Result<PathBuf, String> {
    let bytes = serde_json::to_vec_pretty(&json!({"dataDir":data,"token":token}))
        .map_err(|_| "CONFIG_ENCODING_FAILED")?;
    atomic_save(&directory.join("config.json"), &bytes)?;
    Ok(directory.join("config.json"))
}
pub(crate) fn config_root() -> Result<PathBuf, String> {
    std::env::var_os("USERPROFILE")
        .map(PathBuf::from)
        .filter(|p| p.is_absolute())
        .map(|p| p.join(".codex/task-workbench-light"))
        .ok_or("PRIVATE_ACCOUNT_UNAVAILABLE".into())
}
pub(crate) async fn manager_post(data: &Path, route: &str, value: Value) -> Result<Value, String> {
    if !matches!(
        route,
        "api/light-access/grants"
            | "api/light-access/revoke"
            | "api/light-access/confirm-binding"
            | "api/light-access/connect"
            | "api/light-access/connection-status"
            | "api/light-access/prepare-onboarding"
    ) {
        return Err("FORBIDDEN".into());
    }
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
    let bytes = serde_json::to_vec(&value).map_err(|_| "INVALID_CONFIRMATION_INPUT")?;
    if bytes.len() > 256 * 1024 {
        return Err("INVALID_CONFIRMATION_INPUT".into());
    }
    let mut response = client
        .post(endpoint.join(route).map_err(|_| "INVALID_OWNER")?)
        .bearer_auth(token.clone())
        .header("Content-Type", "application/json")
        .body(bytes)
        .send()
        .await
        .map_err(|_| "AUTHORIZATION_RESULT_UNKNOWN")?;
    if response.status().is_server_error() {
        return Err("AUTHORIZATION_RESULT_UNKNOWN".into());
    }
    if !response.status().is_success() {
        return Err(format!(
            "AUTHORIZATION_REJECTED_{}",
            response.status().as_u16()
        ));
    }
    let mut body = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "AUTHORIZATION_RESULT_UNKNOWN")?
    {
        if body.len() + chunk.len() > 1024 * 1024 {
            return Err("AUTHORIZATION_RESULT_UNKNOWN".into());
        }
        body.extend_from_slice(&chunk);
    }
    let (current, current_token, current_generation) =
        native_connection(data, "owner-session.json")
            .map_err(|_| "AUTHORIZATION_RESULT_UNKNOWN")?;
    if current != endpoint || current_token != token || current_generation != generation {
        return Err("AUTHORIZATION_RESULT_UNKNOWN".into());
    }
    serde_json::from_slice(&body).map_err(|_| "AUTHORIZATION_RESULT_UNKNOWN".into())
}
async fn authorize_at(
    data: &Path,
    directory: &Path,
    value: ConnectionInput,
) -> Result<Value, String> {
    authorize_with_saver(data, directory, value, save_config).await
}
async fn authorize_with_saver(
    data: &Path,
    directory: &Path,
    value: ConnectionInput,
    save: fn(&Path, &Path, &str) -> Result<PathBuf, String>,
) -> Result<Value, String> {
    checked_input(&value)?;
    let body = json!({"projectKeys":[value.project_key],"threadId":value.thread_id,"hostId":value.host_id,"worktreeRoots":[value.worktree_root],"acknowledged":true});
    let metadata = json!({"projectKey":value.project_key,"threadId":value.thread_id,"hostId":value.host_id,"worktreeRoot":value.worktree_root});
    issue_with_saver(
        data,
        directory,
        "api/light-access/grants",
        body,
        metadata,
        save,
    )
    .await
}
pub(crate) async fn issue_with_saver(
    data: &Path,
    directory: &Path,
    route: &str,
    body: Value,
    mut metadata: Value,
    save: fn(&Path, &Path, &str) -> Result<PathBuf, String>,
) -> Result<Value, String> {
    // Prepare a protected backup before issuing a new grant; never discard an existing connection.
    let original = prepare_config(directory)?;
    let original_metadata = match fs::read(directory.join("connection-result.json")) {
        Ok(bytes) => Some(bytes),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
        Err(_) => return Err("CONFIG_METADATA_BACKUP_FAILED".into()),
    };
    let grant = manager_post(data, route, body).await?;
    let principal = grant["principal"]
        .as_str()
        .filter(|s| !s.is_empty() && s.len() <= 2000)
        .ok_or("AUTHORIZATION_RESULT_UNKNOWN")?;
    let token = grant["token"]
        .as_str()
        .filter(|s| s.len() == 64 && s.bytes().all(|b| b.is_ascii_hexdigit()));
    let saved = match token {
        Some(token) => {
            metadata["date"] = json!("2026-11-12");
            metadata["principal"] = json!(principal);
            metadata["configPath"] = json!(directory.join("config.json"));
            atomic_save(
                &directory.join("connection-result.json"),
                &serde_json::to_vec_pretty(&metadata).map_err(|_| "CONFIG_ENCODING_FAILED")?,
            )
            .and_then(|_| save(directory, data, token))
        }
        None => Err("INVALID_GRANT_RESPONSE".into()),
    };
    match saved {
        Ok(config) => Ok(json!({"principal":principal,"configPath":config})),
        Err(_) => {
            let revoked = manager_post(
                data,
                "api/light-access/revoke",
                json!({"principal":principal,"acknowledged":true}),
            )
            .await;
            let config_restored = restore(&directory.join("config.json"), &original).is_ok();
            let metadata_restored = restore(
                &directory.join("connection-result.json"),
                &original_metadata,
            )
            .is_ok();
            let restored = config_restored && metadata_restored;
            if !restored {
                return Err(format!("CONFIG_RESTORE_FAILED_CHECK_BACKUP: {principal}"));
            }
            if revoked
                .as_ref()
                .is_ok_and(|v| v["revoked"] == true && v["principal"] == principal)
            {
                Err(format!("CONFIG_SAVE_FAILED_GRANT_REVOKED: {principal}"))
            } else {
                Err(format!(
                    "CONFIG_SAVE_FAILED_REVOCATION_UNKNOWN: {principal}"
                ))
            }
        }
    }
}
fn checked_binding(value: &Value) -> Result<(), String> {
    let fields = value.as_object().ok_or("INVALID_CONFIRMATION_INPUT")?;
    if fields.len() != 2
        || !fields.contains_key("principal")
        || !fields.contains_key("input")
        || value["principal"]
            .as_str()
            .is_none_or(|s| s.trim().is_empty() || s.len() > 2000)
        || !value["input"].is_object()
        || value["input"]["action"] != "confirm"
        || value["input"]["eventId"]
            .as_str()
            .is_none_or(|s| s.trim().is_empty() || s.len() > 2000)
        || value["input"].get("confirmationGrant").is_some()
    {
        return Err("INVALID_CONFIRMATION_INPUT".into());
    }
    Ok(())
}
#[tauri::command]
pub async fn island_workbench_authorize_connection(
    window: WebviewWindow,
    value: Value,
) -> Result<Value, String> {
    require_confirmation(window.label(), value["acknowledged"] == true)?;
    let input = serde_json::from_value(value).map_err(|_| "INVALID_CONNECTION_SCOPE")?;
    let _permit = Permit::take()?;
    authorize_at(&root()?, &config_root()?, input).await
}
async fn confirm_at(data: &Path, directory: &Path, value: Value) -> Result<Value, String> {
    checked_binding(&value)?;
    protect_directory(directory)?;
    let result = manager_post(
        data,
        "api/light-access/confirm-binding",
        json!({"principal":value["principal"],"input":value["input"],"acknowledged":true}),
    )
    .await?;
    if result["confirmationGrant"]
        .as_str()
        .is_none_or(|s| s.is_empty() || s.len() > 2000)
    {
        return Err("AUTHORIZATION_RESULT_UNKNOWN".into());
    }
    let file = directory.join("binding-confirmation.json");
    let document = json!({"date":"2026-11-12","principal":value["principal"],"input":value["input"],"eventId":value["input"]["eventId"],"confirmationGrant":result["confirmationGrant"]});
    atomic_save(&file, &serde_json::to_vec_pretty(&document).map_err(|_| "CONFIG_ENCODING_FAILED")?)
        .map_err(|_| "BINDING_CONFIRMATION_SAVE_FAILED: confirmation was issued but not saved; do not report confirmed")?;
    Ok(
        json!({"saved":true,"filePath":file,"principal":value["principal"],"eventId":value["input"]["eventId"]}),
    )
}
#[tauri::command]
pub async fn island_workbench_confirm_binding(
    window: WebviewWindow,
    value: Value,
    acknowledged: bool,
) -> Result<Value, String> {
    require_confirmation(window.label(), acknowledged)?;
    let _permit = Permit::take()?;
    confirm_at(&root()?, &config_root()?, value).await
}

#[tauri::command]
pub fn island_workbench_pending_binding(window: WebviewWindow) -> Result<Value, String> {
    if window.label() != crate::settings::SETTINGS_LABEL {
        return Err("FORBIDDEN".into());
    }
    let file = config_root()?.join("pending-binding.json");
    let metadata = fs::metadata(&file).map_err(|_| "PENDING_BINDING_UNAVAILABLE")?;
    if !metadata.is_file() || metadata.len() > 256 * 1024 {
        return Err("INVALID_CONFIRMATION_INPUT".into());
    }
    let bytes = fs::read(file).map_err(|_| "PENDING_BINDING_UNAVAILABLE")?;
    if bytes.len() > 256 * 1024 {
        return Err("INVALID_CONFIRMATION_INPUT".into());
    }
    let value: Value = serde_json::from_slice(&bytes).map_err(|_| "INVALID_CONFIRMATION_INPUT")?;
    checked_binding(&value)?;
    Ok(value)
}

// Date: 2026-11-12. One click enables local automatic association; status comes from live MCP leases.
pub(crate) fn saved_principal(directory: &Path) -> Result<Option<String>, String> {
    let file = directory.join("connection-result.json");
    let metadata = match fs::metadata(&file) {
        Ok(value) => value,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err("CONFIG_READ_FAILED".into()),
    };
    if !metadata.is_file() || metadata.len() > 32768 {
        return Err("CONFIG_READ_FAILED".into());
    }
    let bytes = fs::read(file).map_err(|_| "CONFIG_READ_FAILED")?;
    if bytes.len() > 32768 {
        return Err("CONFIG_READ_FAILED".into());
    }
    let value: Value = serde_json::from_slice(&bytes).map_err(|_| "CONFIG_READ_FAILED")?;
    value["principal"]
        .as_str()
        .filter(|s| !s.is_empty() && s.len() <= 2000)
        .map(|s| Some(s.to_owned()))
        .ok_or("CONFIG_READ_FAILED".into())
}
pub(crate) async fn status_at(data: &Path, directory: &Path) -> Result<Value, String> {
    let principal = saved_principal(directory)?.unwrap_or_default();
    let mut status = manager_post(
        data,
        "api/light-access/connection-status",
        json!({"principal":principal,"acknowledged":true}),
    )
    .await?;
    if !status["enabled"].is_boolean()
        || !status["automatic"].is_boolean()
        || !status["connected"].is_boolean()
        || !status["mcpConnected"].is_boolean()
    {
        return Err("INVALID_CONNECTION_STATUS".into());
    }
    status["state"] = json!(if status["enabled"] != true {
        "disabled"
    } else if status["automatic"] != true {
        "legacy"
    } else if status["connected"] == true {
        "connected"
    } else if status["lastSeenAt"].is_string() {
        "disconnected"
    } else {
        "waiting"
    });
    Ok(status)
}
#[tauri::command]
pub async fn island_workbench_connection_status(window: WebviewWindow) -> Result<Value, String> {
    require_confirmation(window.label(), true)?;
    status_at(&root()?, &config_root()?).await
}
async fn set_connection_at(data: &Path, directory: &Path, enabled: bool) -> Result<Value, String> {
    let status = status_at(data, directory).await?;
    if enabled {
        if status["enabled"] != true || status["automatic"] != true {
            issue_with_saver(
                data,
                directory,
                "api/light-access/connect",
                json!({"acknowledged":true}),
                json!({"automatic":true}),
                save_config,
            )
            .await?;
        }
    } else if status["enabled"] == true {
        let principal = saved_principal(directory)?.ok_or("CONFIG_READ_FAILED")?;
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
    status_at(data, directory).await
}
#[tauri::command]
pub async fn island_workbench_set_connection(
    window: WebviewWindow,
    enabled: bool,
) -> Result<Value, String> {
    require_confirmation(window.label(), true)?;
    let _permit = Permit::take()?;
    set_connection_at(&root()?, &config_root()?, enabled).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    fn fixture() -> PathBuf {
        let root = std::env::temp_dir().join(unique_name("island-connection-test"));
        fs::create_dir_all(root.join("data/runtime-private")).unwrap();
        root
    }
    fn scope(root: &Path) -> ConnectionInput {
        ConnectionInput {
            project_key: "test/project".into(),
            thread_id: "test-thread".into(),
            host_id: "local".into(),
            worktree_root: root.to_string_lossy().into(),
            acknowledged: true,
        }
    }
    fn fake_owner(root: &Path, responses: Vec<String>) -> std::thread::JoinHandle<Vec<String>> {
        fake_owner_status(
            root,
            responses
                .into_iter()
                .map(|payload| ("200 OK".to_string(), payload))
                .collect(),
        )
    }
    fn fake_owner_status(
        root: &Path,
        responses: Vec<(String, String)>,
    ) -> std::thread::JoinHandle<Vec<String>> {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let endpoint = format!("http://{}", listener.local_addr().unwrap());
        fs::write(
            root.join("data/owner.json"),
            json!({"version":1,"ownerGeneration":"test","endpoint":endpoint}).to_string(),
        )
        .unwrap();
        fs::write(
            root.join("data/runtime-private/owner-session.json"),
            json!({"version":1,"ownerGeneration":"test","token":"a".repeat(64)}).to_string(),
        )
        .unwrap();
        std::thread::spawn(move || {
            let mut calls = Vec::new();
            for (status, payload) in responses {
                let (mut stream, _) = listener.accept().unwrap();
                stream
                    .set_read_timeout(Some(Duration::from_secs(5)))
                    .unwrap();
                let mut bytes = Vec::new();
                loop {
                    let mut buffer = [0; 1024];
                    let n = stream.read(&mut buffer).unwrap();
                    bytes.extend_from_slice(&buffer[..n]);
                    if n == 0 {
                        break;
                    }
                    if let Some(end) = bytes.windows(4).position(|b| b == b"\r\n\r\n") {
                        let head = String::from_utf8_lossy(&bytes[..end]);
                        let count = head
                            .lines()
                            .find_map(|line| {
                                line.to_ascii_lowercase()
                                    .strip_prefix("content-length:")
                                    .map(|v| v.trim().parse::<usize>().unwrap())
                            })
                            .unwrap_or(0);
                        if bytes.len() >= end + 4 + count {
                            break;
                        }
                    }
                }
                calls.push(String::from_utf8(bytes).unwrap());
                stream.write_all(format!("HTTP/1.1 {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",status,payload.len(),payload).as_bytes()).unwrap();
            }
            calls
        })
    }
    #[test]
    fn automatic_connection_needs_no_scope_form_and_reuses_enabled_grant() {
        let root = fixture();
        let config = root.join("config");
        let disabled = json!({"enabled":false,"automatic":false,"connected":false,"mcpConnected":false,"lastSeenAt":null}).to_string();
        let waiting = json!({"enabled":true,"automatic":true,"connected":false,"mcpConnected":false,"lastSeenAt":null}).to_string();
        let server = fake_owner(
            &root,
            vec![
                disabled,
                json!({"principal":"automatic-principal","token":"b".repeat(64),"automatic":true})
                    .to_string(),
                waiting.clone(),
                waiting.clone(),
                waiting.clone(),
            ],
        );
        let result =
            tauri::async_runtime::block_on(set_connection_at(&root.join("data"), &config, true))
                .unwrap();
        assert_eq!(result["state"], "waiting");
        assert!(result.get("token").is_none());
        assert_eq!(
            tauri::async_runtime::block_on(set_connection_at(&root.join("data"), &config, true))
                .unwrap()["state"],
            "waiting"
        );
        let calls = server.join().unwrap();
        assert_eq!(
            calls
                .iter()
                .filter(|call| call.starts_with("POST /api/light-access/connect HTTP"))
                .count(),
            1
        );
        assert!(!calls[1].contains("worktreeRoot"));
        assert!(!calls[1].contains("threadId"));
        assert!(
            fs::read_to_string(config.join("config.json"))
                .unwrap()
                .contains(&"b".repeat(64))
        );
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn connection_state_uses_live_lease_and_disconnect_revokes_without_deleting_config() {
        let root = fixture();
        let config = root.join("config");
        fs::create_dir_all(&config).unwrap();
        fs::write(
            config.join("connection-result.json"),
            json!({"principal":"automatic-principal"}).to_string(),
        )
        .unwrap();
        fs::write(config.join("config.json"), "preserved private config").unwrap();
        let live = json!({"enabled":true,"automatic":true,"connected":true,"mcpConnected":true,"lastSeenAt":"2026-11-12T08:00:00Z"});
        let server = fake_owner(&root, vec![live.to_string(),
            json!({"principal":"automatic-principal","revoked":true}).to_string(),
            json!({"enabled":false,"automatic":false,"connected":false,"mcpConnected":false,"lastSeenAt":null}).to_string()]);
        assert_eq!(
            tauri::async_runtime::block_on(set_connection_at(&root.join("data"), &config, false))
                .unwrap()["state"],
            "disabled"
        );
        assert_eq!(
            fs::read_to_string(config.join("config.json")).unwrap(),
            "preserved private config"
        );
        assert!(server.join().unwrap()[1].starts_with("POST /api/light-access/revoke HTTP"));
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn settings_and_explicit_ack_are_mandatory_and_scope_rejects_injected_fields() {
        assert!(require_confirmation("settings", true).is_ok());
        assert!(require_confirmation("island", true).is_err());
        assert!(require_confirmation("settings", false).is_err());
        let mut value = json!({"projectKey":"p","threadId":"t","hostId":"local","worktreeRoot":"relative","acknowledged":true});
        assert!(checked_input(&serde_json::from_value(value.clone()).unwrap()).is_err());
        value["token"] = json!("must not be accepted");
        assert!(serde_json::from_value::<ConnectionInput>(value).is_err());
        assert!(checked_binding(&json!({"principal":"p","input":{"action":"confirm","eventId":"e"},"url":"http://remote"})).is_err());
        assert!(checked_binding(&json!({"principal":"p","input":{"action":"confirm","eventId":"e","confirmationGrant":"never-from-ui"}})).is_err());
    }
    #[test]
    fn grant_saves_private_token_and_backup_but_returns_only_safe_metadata() {
        let root = fixture();
        let config = root.join("config");
        fs::create_dir_all(&config).unwrap();
        fs::write(config.join("config.json"), "original config").unwrap();
        let server = fake_owner(
            &root,
            vec![json!({"principal":"new-principal","token":"b".repeat(64)}).to_string()],
        );
        let result =
            tauri::async_runtime::block_on(authorize_at(&root.join("data"), &config, scope(&root)))
                .unwrap();
        assert_eq!(result["principal"], "new-principal");
        assert!(result.get("token").is_none());
        let saved: Value =
            serde_json::from_slice(&fs::read(config.join("config.json")).unwrap()).unwrap();
        assert_eq!(saved["token"], "b".repeat(64));
        assert_eq!(saved.as_object().unwrap().len(), 2);
        assert!(
            fs::read_dir(&config)
                .unwrap()
                .filter_map(Result::ok)
                .any(|e| e
                    .file_name()
                    .to_string_lossy()
                    .starts_with("config-backup-")
                    && fs::read_to_string(e.path()).unwrap() == "original config")
        );
        let metadata: Value =
            serde_json::from_slice(&fs::read(config.join("connection-result.json")).unwrap())
                .unwrap();
        assert_eq!(metadata["principal"], "new-principal");
        assert!(metadata.get("token").is_none());
        let calls = server.join().unwrap();
        assert!(calls[0].starts_with("POST /api/light-access/grants HTTP/1.1"));
        assert!(
            calls[0]
                .to_ascii_lowercase()
                .contains(&format!("authorization: bearer {}", "a".repeat(64)))
        );
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn failed_config_save_revokes_the_new_grant_and_restores_original_connection() {
        let root = fixture();
        let config = root.join("config");
        fs::create_dir_all(&config).unwrap();
        fs::write(config.join("config.json"), "original config").unwrap();
        let server = fake_owner(
            &root,
            vec![
                json!({"principal":"new-principal","token":"b".repeat(64)}).to_string(),
                json!({"principal":"new-principal","revoked":true}).to_string(),
            ],
        );
        let result = tauri::async_runtime::block_on(authorize_with_saver(
            &root.join("data"),
            &config,
            scope(&root),
            |_, _, _| Err("injected save failure".into()),
        ))
        .unwrap_err();
        assert!(result.starts_with("CONFIG_SAVE_FAILED_GRANT_REVOKED"));
        assert_eq!(
            fs::read_to_string(config.join("config.json")).unwrap(),
            "original config"
        );
        let calls = server.join().unwrap();
        assert!(calls[1].starts_with("POST /api/light-access/revoke HTTP/1.1"));
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn failed_config_restore_still_attempts_and_restores_metadata() {
        let root = fixture();
        let config = root.join("config");
        fs::create_dir_all(&config).unwrap();
        fs::write(config.join("config.json"), "original config").unwrap();
        fs::write(config.join("connection-result.json"), "original metadata").unwrap();
        let server = fake_owner(
            &root,
            vec![
                json!({"principal":"new-principal","token":"b".repeat(64)}).to_string(),
                json!({"principal":"new-principal","revoked":true}).to_string(),
            ],
        );
        let result = tauri::async_runtime::block_on(authorize_with_saver(
            &root.join("data"),
            &config,
            scope(&root),
            |directory, _, _| {
                // Sabotage only config restoration after new metadata has been saved.
                // Replacing a file with a directory makes atomic rename fail on every platform.
                fs::remove_file(directory.join("config.json")).unwrap();
                fs::create_dir(directory.join("config.json")).unwrap();
                Err("injected config save failure".into())
            },
        ))
        .unwrap_err();
        assert!(result.starts_with("CONFIG_RESTORE_FAILED_CHECK_BACKUP"));
        assert!(config.join("config.json").is_dir());
        assert_eq!(
            fs::read_to_string(config.join("connection-result.json")).unwrap(),
            "original metadata"
        );
        let calls = server.join().unwrap();
        assert!(calls[1].starts_with("POST /api/light-access/revoke HTTP/1.1"));
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn malformed_success_is_unknown_and_does_not_replace_original_config() {
        let root = fixture();
        let config = root.join("config");
        fs::create_dir_all(&config).unwrap();
        fs::write(config.join("config.json"), "original config").unwrap();
        let server = fake_owner(&root, vec!["malformed response".into()]);
        let error =
            tauri::async_runtime::block_on(authorize_at(&root.join("data"), &config, scope(&root)))
                .unwrap_err();
        assert_eq!(error, "AUTHORIZATION_RESULT_UNKNOWN");
        assert_eq!(
            fs::read_to_string(config.join("config.json")).unwrap(),
            "original config"
        );
        assert_eq!(server.join().unwrap().len(), 1);
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn binding_confirmation_preserves_exact_input_only_in_private_file() {
        let root = fixture();
        let config = root.join("config");
        let server = fake_owner(
            &root,
            vec![
                json!({"confirmationGrant":"private-confirmation","observed":{"branch":"test"}})
                    .to_string(),
            ],
        );
        let input = json!({"principal":"p","input":{"action":"confirm","eventId":"original-event","projectId":"test-project"}});
        let result =
            tauri::async_runtime::block_on(confirm_at(&root.join("data"), &config, input.clone()))
                .unwrap();
        assert_eq!(result["eventId"], "original-event");
        assert!(result.get("confirmationGrant").is_none());
        let saved: Value =
            serde_json::from_slice(&fs::read(config.join("binding-confirmation.json")).unwrap())
                .unwrap();
        assert_eq!(saved["input"], input["input"]);
        assert_eq!(saved["confirmationGrant"], "private-confirmation");
        assert!(
            server.join().unwrap()[0]
                .starts_with("POST /api/light-access/confirm-binding HTTP/1.1")
        );
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn server_errors_are_unknown_and_explicit_client_errors_are_rejected() {
        for (status, expected) in [
            ("500 Internal Server Error", "AUTHORIZATION_RESULT_UNKNOWN"),
            ("403 Forbidden", "AUTHORIZATION_REJECTED_403"),
        ] {
            let root = fixture();
            let server = fake_owner_status(&root, vec![(status.into(), "{}".into())]);
            let error = tauri::async_runtime::block_on(manager_post(
                &root.join("data"),
                "api/light-access/grants",
                json!({"acknowledged":true}),
            ))
            .unwrap_err();
            assert_eq!(error, expected);
            assert_eq!(server.join().unwrap().len(), 1);
            fs::remove_dir_all(root).unwrap();
        }
    }
}
