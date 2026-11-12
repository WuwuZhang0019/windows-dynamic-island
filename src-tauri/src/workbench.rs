// Date: 2026-11-12. Narrow native bridge to the existing independent workbench owner.
use serde::Deserialize;
use serde_json::Value;
use std::{
    fs,
    path::{Path, PathBuf},
    time::Duration,
};
use tauri::WebviewWindow;

const MAX_RESPONSE: usize = 8 * 1024 * 1024;
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Owner {
    version: u32,
    owner_generation: String,
    endpoint: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Session {
    version: u32,
    owner_generation: String,
    token: String,
}

pub(crate) fn root() -> Result<PathBuf, String> {
    let value = std::env::var_os("ISLAND_WORKBENCH_DATA_DIR")
        .map(PathBuf::from)
        .or_else(|| {
            std::env::var_os("LOCALAPPDATA")
                .map(|v| PathBuf::from(v).join("com.codextaskmonitor.workbench/data"))
        })
        .ok_or("OWNER_UNAVAILABLE")?;
    if !value.is_absolute() {
        return Err("INVALID_OWNER_ROOT".into());
    }
    Ok(value)
}
fn limited_json<T: serde::de::DeserializeOwned>(path: &Path) -> Result<T, String> {
    let meta = fs::metadata(path).map_err(|_| "OWNER_UNAVAILABLE")?;
    if !meta.is_file() || meta.len() > 16384 {
        return Err("INVALID_OWNER".into());
    }
    let bytes = fs::read(path).map_err(|_| "OWNER_UNAVAILABLE")?;
    if bytes.len() > 16384 {
        return Err("INVALID_OWNER".into());
    }
    serde_json::from_slice(&bytes).map_err(|_| "INVALID_OWNER".into())
}
fn connection(data: &Path) -> Result<(reqwest::Url, String, String), String> {
    native_connection(data, "panel-session.json")
}

pub(crate) fn native_connection(
    data: &Path,
    session_file: &str,
) -> Result<(reqwest::Url, String, String), String> {
    if !matches!(session_file, "panel-session.json" | "owner-session.json") {
        return Err("FORBIDDEN".into());
    }
    if data.join("stopped.json").exists() {
        return Err("STOPPED".into());
    }
    let owner: Owner = limited_json(&data.join("owner.json"))?;
    let session: Session = limited_json(&data.join("runtime-private").join(session_file))?;
    let endpoint = reqwest::Url::parse(&owner.endpoint).map_err(|_| "INVALID_OWNER")?;
    if owner.version != 1
        || session.version != 1
        || owner.owner_generation.is_empty()
        || owner.owner_generation != session.owner_generation
        || endpoint.scheme() != "http"
        || endpoint.host_str() != Some("127.0.0.1")
        || endpoint.port().is_none()
        || endpoint.path() != "/"
        || endpoint.query().is_some()
        || endpoint.fragment().is_some()
        || !endpoint.username().is_empty()
        || endpoint.password().is_some()
    {
        return Err("INVALID_OWNER".into());
    }
    if session.token.len() < 64 || !session.token.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err("UNAUTHORIZED_SESSION".into());
    }
    Ok((endpoint, session.token, owner.owner_generation))
}
fn window_allowed(label: &str) -> Result<(), String> {
    if label == crate::window::ISLAND_LABEL {
        Ok(())
    } else {
        Err("FORBIDDEN".into())
    }
}
pub(crate) async fn request(data: &Path, value: Option<Value>) -> Result<Value, String> {
    let (endpoint, token, generation) = connection(data)?;
    // The updater enables reqwest's rustls-no-provider feature globally. Match its
    // existing ring provider initialization even though this bridge permits HTTP only.
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
    let client = reqwest::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(5))
        .build()
        .map_err(|_| "OWNER_UNAVAILABLE")?;
    let target = endpoint
        .join(if value.is_some() {
            "api/light-panel/preferences"
        } else {
            "api/light-panel"
        })
        .map_err(|_| "INVALID_OWNER")?;
    let mut call = if let Some(value) = value {
        let bytes = serde_json::to_vec(&value).map_err(|_| "INVALID_PREFERENCES")?;
        if bytes.len() > 256 * 1024 {
            return Err("INVALID_PREFERENCES".into());
        }
        client
            .put(target)
            .header("Content-Type", "application/json")
            .body(bytes)
    } else {
        client.get(target)
    };
    call = call.bearer_auth(&token);
    let mut response = call.send().await.map_err(|_| "OWNER_UNAVAILABLE")?;
    if response.status().as_u16() == 403 {
        return Err("UNAUTHORIZED".into());
    }
    if !response.status().is_success() {
        return Err("OWNER_UNAVAILABLE".into());
    }
    if response
        .content_length()
        .is_some_and(|n| n > MAX_RESPONSE as u64)
    {
        return Err("INVALID_RESPONSE_SIZE".into());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| "OWNER_UNAVAILABLE")? {
        if bytes.len() + chunk.len() > MAX_RESPONSE {
            return Err("INVALID_RESPONSE_SIZE".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    // Recheck discovery after the response: a generation change must not authenticate stale data.
    let (current, current_token, current_generation) = connection(data)?;
    if current != endpoint || current_token != token || current_generation != generation {
        return Err("STALE_OWNER".into());
    }
    serde_json::from_slice(&bytes).map_err(|_| "INVALID_RESPONSE".into())
}
#[tauri::command]
pub async fn island_workbench_read(window: WebviewWindow) -> Result<Value, String> {
    window_allowed(window.label())?;
    request(&root()?, None).await
}
#[tauri::command]
pub async fn island_workbench_save_preferences(
    window: WebviewWindow,
    value: Value,
) -> Result<Value, String> {
    window_allowed(window.label())?;
    request(&root()?, Some(value)).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    fn fixture() -> PathBuf {
        let p = std::env::temp_dir().join(format!(
            "island-native-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(p.join("runtime-private")).unwrap();
        p
    }
    fn write(p: &Path, endpoint: &str, generation: &str) {
        fs::write(
            p.join("owner.json"),
            json!({"version":1,"ownerGeneration":"one","endpoint":endpoint}).to_string(),
        )
        .unwrap();
        fs::write(
            p.join("runtime-private/panel-session.json"),
            json!({"version":1,"ownerGeneration":generation,"token":"a".repeat(64)}).to_string(),
        )
        .unwrap();
    }
    #[test]
    fn discovery_rejects_remote_origin_mismatch_and_stop() {
        let p = fixture();
        for endpoint in [
            "http://localhost:4000",
            "http://127.0.0.1:4000/other",
            "http://127.0.0.1:4000/?x=y",
            "https://127.0.0.1:4000",
            "http://user@127.0.0.1:4000",
        ] {
            write(&p, endpoint, "one");
            assert!(connection(&p).is_err());
        }
        write(&p, "http://127.0.0.1:4000", "other");
        assert!(connection(&p).is_err());
        write(&p, "http://127.0.0.1:4000", "one");
        assert!(connection(&p).is_ok());
        fs::write(p.join("stopped.json"), "{}").unwrap();
        assert!(connection(&p).is_err());
        fs::remove_dir_all(p).unwrap();
    }
    #[test]
    fn caller_window_is_exact() {
        assert!(window_allowed(crate::window::ISLAND_LABEL).is_ok());
        assert!(window_allowed("settings").is_err());
    }
    fn loopback(
        status: &str,
        payload: &str,
        save: bool,
        rotate: bool,
    ) -> (Result<Value, String>, String) {
        use std::io::{Read, Write};
        let p = fixture();
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let endpoint = format!("http://{}", listener.local_addr().unwrap());
        write(&p, &endpoint, "one");
        let data = p.clone();
        let status = status.to_string();
        let payload = payload.to_string();
        let server = std::thread::spawn(move || {
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
                if let Some(end) = bytes.windows(4).position(|x| x == b"\r\n\r\n") {
                    let headers = String::from_utf8_lossy(&bytes[..end]);
                    let count = headers
                        .lines()
                        .find_map(|line| {
                            line.to_ascii_lowercase()
                                .strip_prefix("content-length:")
                                .map(|s| s.trim().parse::<usize>().unwrap())
                        })
                        .unwrap_or(0);
                    if bytes.len() >= end + 4 + count {
                        break;
                    }
                }
            }
            if rotate {
                fs::write(
                    data.join("owner.json"),
                    json!({"version":1,"ownerGeneration":"two","endpoint":endpoint}).to_string(),
                )
                .unwrap();
                fs::write(
                    data.join("runtime-private/panel-session.json"),
                    json!({"version":1,"ownerGeneration":"two","token":"b".repeat(64)}).to_string(),
                )
                .unwrap();
            }
            let location = if status.starts_with("302") {
                "Location: http://127.0.0.1:1/forbidden\r\n"
            } else {
                ""
            };
            stream.write_all(format!("HTTP/1.1 {}\r\nContent-Type: application/json\r\n{}Content-Length: {}\r\nConnection: close\r\n\r\n{}", status, location, payload.len(), payload).as_bytes()).unwrap();
            String::from_utf8(bytes).unwrap()
        });
        let result =
            tauri::async_runtime::block_on(request(&p, save.then(|| json!({"selected":"stage"}))));
        let recorded = server.join().unwrap();
        fs::remove_dir_all(p).unwrap();
        (result, recorded)
    }
    #[test]
    fn native_http_attaches_private_credential_to_only_fixed_read_and_preference_paths() {
        let (read, headers) = loopback("200 OK", "{\"snapshot\":null}", false, false);
        assert_eq!(read.unwrap(), json!({"snapshot":null}));
        assert!(headers.starts_with("GET /api/light-panel HTTP/1.1"));
        assert!(
            headers
                .to_lowercase()
                .contains(&format!("authorization: bearer {}", "a".repeat(64)))
        );
        assert!(!headers.to_lowercase().contains("origin:"));
        let (save, headers) = loopback("200 OK", "{\"saved\":true}", true, false);
        assert_eq!(save.unwrap(), json!({"saved":true}));
        assert!(headers.starts_with("PUT /api/light-panel/preferences HTTP/1.1"));
        assert!(headers.ends_with("{\"selected\":\"stage\"}"));
    }
    #[test]
    fn native_http_denial_redirect_and_generation_changes_fail_closed() {
        assert_eq!(
            loopback("403 Forbidden", "{}", false, false).0.unwrap_err(),
            "UNAUTHORIZED"
        );
        assert_eq!(
            loopback("302 Found", "{}", false, false).0.unwrap_err(),
            "OWNER_UNAVAILABLE"
        );
        assert_eq!(
            loopback("200 OK", "{}", false, true).0.unwrap_err(),
            "STALE_OWNER"
        );
        assert_eq!(
            loopback("200 OK", "invalid-json", false, false)
                .0
                .unwrap_err(),
            "INVALID_RESPONSE"
        );
    }
}
