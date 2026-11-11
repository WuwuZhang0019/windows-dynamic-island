//! User settings: a flat JSON key/value store persisted in the app config dir.
//!
//! The backend doesn't know the schema — defaults and meaning live in the
//! frontend (each module declares its own settings). Every change is broadcast
//! as `settings://changed` so all windows stay in sync.

use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};

use serde_json::{Map, Value};
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};

pub const CHANGED_EVENT: &str = "settings://changed";
pub const SETTINGS_LABEL: &str = "settings";
const CONFIG_VERSION: u64 = 1;
const CONFIG_VERSION_KEY: &str = "shell.configVersion";
static NEXT_WRITE: AtomicU64 = AtomicU64::new(0);

// 日期：2026-11-11。只迁移壳层偏好；原版模块、插件及快捷键数据保持只读。
fn shell_key(key: &str) -> bool {
    matches!(
        key,
        "app.language"
            | "appearance.style"
            | "appearance.border"
            | "appearance.customColors"
            | "appearance.borderThickness"
            | "appearance.animateBorder"
            | "appearance.glow"
            | "appearance.glass"
            | "appearance.idleClock"
            | "island.hidden"
            | "island.openOn"
            | "island.closeOn"
            | "island.expandOnHover"
            | "island.hideInFullscreen"
            | "island.avoidMaximized"
            | "island.returnToCenter"
            | "island.returnDelay"
            | "island.monitor"
            | "island.offset"
    )
}

fn shell_preferences(mut data: Map<String, Value>) -> Map<String, Value> {
    data.retain(|key, _| shell_key(key));
    data.insert(CONFIG_VERSION_KEY.into(), Value::from(CONFIG_VERSION));
    data
}

fn read_map(text: &[u8]) -> io::Result<Map<String, Value>> {
    serde_json::from_slice(text).map_err(io::Error::other)
}

/// 先创建新目录内的原输入备份，再以 create_new 写新配置；绝不写入原版路径。
fn load_profile(path: &Path, legacy: Option<&Path>) -> io::Result<Map<String, Value>> {
    match std::fs::read(path) {
        Ok(text) => {
            let data = read_map(&text)?;
            if data
                .get(CONFIG_VERSION_KEY)
                .and_then(Value::as_u64)
                .is_some_and(|v| v > CONFIG_VERSION)
            {
                return Err(io::Error::other("unsupported shell configuration version"));
            }
            return Ok(shell_preferences(data));
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => {}
        Err(error) => return Err(error),
    }
    let Some(legacy) = legacy else {
        return Ok(shell_preferences(Map::new()));
    };
    let text = match std::fs::read(legacy) {
        Ok(text) => text,
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            return Ok(shell_preferences(Map::new()));
        }
        Err(error) => return Err(error),
    };
    let data = shell_preferences(read_map(&text)?);
    let dir = path
        .parent()
        .ok_or_else(|| io::Error::other("settings parent missing"))?;
    std::fs::create_dir_all(dir)?;
    let backup = dir.join("settings.pre-migration-v1.json");
    match std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&backup)
    {
        Ok(mut file) => {
            file.write_all(&text)?;
            file.sync_all()?;
        }
        Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {
            if std::fs::read(&backup)? != text {
                return Err(io::Error::other("migration backup differs from source"));
            }
        }
        Err(error) => return Err(error),
    }
    let mut output = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)?;
    output.write_all(&serde_json::to_vec_pretty(&data).map_err(io::Error::other)?)?;
    output.sync_all()?;
    Ok(data)
}

pub struct Settings {
    path: Option<PathBuf>,
    load_error: Option<String>,
    data: Mutex<Map<String, Value>>,
}

impl Settings {
    pub fn load(app: &AppHandle) -> Self {
        let path = app
            .path()
            .app_config_dir()
            .ok()
            .map(|dir| dir.join("settings.json"));
        let legacy = app
            .path()
            .config_dir()
            .ok()
            .map(|dir| dir.join("com.heyyczer.dynamicisland").join("settings.json"));
        Self::from_paths(path, legacy.as_deref())
    }

    fn from_paths(path: Option<PathBuf>, legacy: Option<&Path>) -> Self {
        let result = path
            .as_deref()
            .ok_or_else(|| io::Error::other("application settings directory unavailable"))
            .and_then(|path| load_profile(path, legacy));
        let (data, load_error) = match result {
            Ok(data) => (data, None),
            Err(error) => {
                log::warn!("shell settings are read-only: {error}");
                (
                    shell_preferences(Map::new()),
                    Some(format!("settings are read-only: {error}")),
                )
            }
        };
        Self {
            path,
            load_error,
            data: Mutex::new(data),
        }
    }

    /// Current raw value of a setting (`None` = never set, use the default).
    pub fn get(&self, key: &str) -> Option<Value> {
        self.data.lock().unwrap().get(key).cloned()
    }

    fn save(&self, data: &Map<String, Value>) -> io::Result<()> {
        if let Some(error) = &self.load_error {
            return Err(io::Error::other(error.clone()));
        }
        let path = self
            .path
            .as_deref()
            .ok_or_else(|| io::Error::other("application settings directory unavailable"))?;
        save_profile(path, data)
    }

    fn store_value(&self, key: &str, value: Value) -> io::Result<Map<String, Value>> {
        if !shell_key(key) {
            return Err(io::Error::other("unsupported shell setting"));
        }
        let mut data = self.data.lock().unwrap();
        let mut updated = data.clone();
        updated.insert(key.to_string(), value);
        self.save(&updated)?;
        *data = updated;
        Ok(data.clone())
    }
}

fn save_profile(path: &Path, data: &Map<String, Value>) -> io::Result<()> {
    let dir = path
        .parent()
        .ok_or_else(|| io::Error::other("settings parent missing"))?;
    std::fs::create_dir_all(dir)?;
    let temporary = dir.join(format!(
        ".settings-{}-{}.tmp",
        std::process::id(),
        NEXT_WRITE.fetch_add(1, Ordering::Relaxed)
    ));
    let mut output = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temporary)?;
    let result = (|| {
        output.write_all(&serde_json::to_vec_pretty(data).map_err(io::Error::other)?)?;
        output.sync_all()?;
        drop(output);
        std::fs::rename(&temporary, path)
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&temporary);
    }
    result
}

#[tauri::command]
pub fn get_settings(settings: State<Settings>) -> Result<Map<String, Value>, String> {
    if let Some(error) = &settings.load_error {
        return Err(error.clone());
    }
    Ok(settings.data.lock().unwrap().clone())
}

#[tauri::command]
pub fn set_setting(app: AppHandle, key: String, value: Value) -> Result<(), String> {
    set(&app, &key, value)
}

/// Store and broadcast a setting (backend side of `setSetting`).
pub fn set(app: &AppHandle, key: &str, value: Value) -> Result<(), String> {
    let settings = app.state::<Settings>();
    let snapshot = settings
        .store_value(key, value)
        .map_err(|error| error.to_string())?;
    let _ = app.emit(CHANGED_EVENT, snapshot);
    if key == crate::tray::HIDDEN_KEY {
        crate::tray::sync_hidden(app);
        crate::memory::sync_island(app);
    }
    Ok(())
}

#[tauri::command]
pub fn open_settings(app: AppHandle) -> Result<(), String> {
    open(&app).map_err(|e| e.to_string())
}

const SIZE: (f64, f64) = (860.0, 620.0);

pub fn open(app: &AppHandle) -> tauri::Result<()> {
    if let Some(win) = app.get_webview_window(SETTINGS_LABEL) {
        win.unminimize()?;
        win.show()?;
        return win.set_focus();
    }
    // Callers are sync commands / tray / single-instance handlers on the main
    // thread, where building a webview deadlocks on Windows (WebView2 needs the
    // event loop). Build from another thread instead.
    let app = app.clone();
    std::thread::spawn(move || {
        if let Err(e) = create(&app) {
            eprintln!("settings window: {e}");
        }
    });
    Ok(())
}

fn create(app: &AppHandle) -> tauri::Result<()> {
    let win = WebviewWindowBuilder::new(app, SETTINGS_LABEL, WebviewUrl::App("index.html".into()))
        .title(crate::i18n::t(app, "window.settings"))
        .inner_size(SIZE.0, SIZE.1)
        .resizable(false)
        .center()
        // Custom titlebar lives in the webview (see `SettingsApp.tsx`).
        .decorations(false)
        .background_color(tauri::webview::Color(12, 12, 16, 255))
        .additional_browser_args(crate::memory::BROWSER_ARGS)
        .build()?;
    crate::memory::trim_when_minimized(&win);
    Ok(())
}

const REPO_URL: &str = "https://github.com/WuwuZhang0019/windows-dynamic-island";

/// Open the GitHub repo in the default browser (About page).
#[tauri::command]
pub fn open_repo() {
    open_url(REPO_URL);
}

/// Open a web page in the default browser (island links, e.g. usage pages).
#[tauri::command]
pub fn open_external(url: String) -> Result<(), String> {
    if !url.starts_with("https://") {
        return Err("only https links".into());
    }
    open_url(&url);
    Ok(())
}

/// Open a URL in the default browser.
pub fn open_url(url: &str) {
    #[cfg(windows)]
    unsafe {
        use windows::Win32::UI::Shell::ShellExecuteW;
        use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
        use windows::core::{HSTRING, PCWSTR, w};
        ShellExecuteW(
            None,
            w!("open"),
            &HSTRING::from(url),
            PCWSTR::null(),
            PCWSTR::null(),
            SW_SHOWNORMAL,
        );
    }
}

#[tauri::command]
pub fn get_autostart(app: AppHandle) -> bool {
    crate::autostart::is_enabled(&app)
}

#[tauri::command]
pub fn set_autostart(app: AppHandle, enabled: bool) -> Result<bool, String> {
    crate::autostart::set(&app, enabled)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static NEXT: AtomicU64 = AtomicU64::new(0);

    struct Profile(PathBuf);

    impl Profile {
        fn new() -> Self {
            let root = std::env::temp_dir().join(format!(
                "island-workbench-settings-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            ));
            std::fs::create_dir_all(&root).unwrap();
            Self(root)
        }
    }

    impl Drop for Profile {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn migration_backs_up_input_and_ignores_removed_features() {
        let root = Profile::new();
        let legacy = root.0.join("original.json");
        let output = root.0.join("workbench/settings.json");
        let source = br#"{"app.language":"zh-CN","appearance.style":"windows","island.expandOnHover":false,"module.clipboard.enabled":true,"plugin.foo.enabled":true,"shortcut.module.ask":"Ctrl+Alt+Space","appearance.tabsPosition":"top","island.pinned":["music"]}"#;
        std::fs::write(&legacy, source).unwrap();
        let data = load_profile(&output, Some(&legacy)).unwrap();
        assert_eq!(data.len(), 4);
        assert_eq!(data["app.language"], "zh-CN");
        assert_eq!(data["appearance.style"], "windows");
        assert_eq!(data["island.expandOnHover"], false);
        assert_eq!(data[CONFIG_VERSION_KEY], CONFIG_VERSION);
        assert_eq!(std::fs::read(&legacy).unwrap(), source);
        assert_eq!(
            std::fs::read(
                output
                    .parent()
                    .unwrap()
                    .join("settings.pre-migration-v1.json")
            )
            .unwrap(),
            source
        );
        assert_eq!(read_map(&std::fs::read(output).unwrap()).unwrap(), data);
    }

    #[test]
    fn backup_failure_does_not_create_migrated_settings() {
        let root = Profile::new();
        let legacy = root.0.join("original.json");
        let output = root.0.join("workbench/settings.json");
        std::fs::write(&legacy, br#"{"island.returnDelay":8}"#).unwrap();
        std::fs::create_dir_all(
            output
                .parent()
                .unwrap()
                .join("settings.pre-migration-v1.json"),
        )
        .unwrap();
        assert!(load_profile(&output, Some(&legacy)).is_err());
        assert!(!output.exists());
    }

    #[test]
    fn restart_keeps_new_preferences_and_does_not_repeat_import() {
        let root = Profile::new();
        let legacy = root.0.join("original.json");
        let output = root.0.join("workbench/settings.json");
        std::fs::write(&legacy, br#"{"island.returnDelay":8}"#).unwrap();
        load_profile(&output, Some(&legacy)).unwrap();
        std::fs::write(
            &output,
            br#"{"shell.configVersion":1,"island.returnDelay":12}"#,
        )
        .unwrap();
        std::fs::write(&legacy, br#"{"island.returnDelay":99}"#).unwrap();
        let data = load_profile(&output, Some(&legacy)).unwrap();
        assert_eq!(data["island.returnDelay"], 12);
        assert_eq!(
            std::fs::read(
                output
                    .parent()
                    .unwrap()
                    .join("settings.pre-migration-v1.json")
            )
            .unwrap(),
            br#"{"island.returnDelay":8}"#
        );
    }

    #[test]
    fn unreadable_or_future_configuration_stays_read_only() {
        for source in [
            br#"{"shell.configVersion":2,"future.preferences":{"keep":true}}"#.as_slice(),
            br#"{"incomplete": "#.as_slice(),
        ] {
            let root = Profile::new();
            let path = root.0.join("settings.json");
            std::fs::write(&path, source).unwrap();
            let settings = Settings::from_paths(Some(path.clone()), None);
            assert!(settings.load_error.is_some());
            assert!(
                settings
                    .store_value("island.returnDelay", Value::from(12))
                    .is_err()
            );
            assert_eq!(std::fs::read(path).unwrap(), source);
            assert!(
                !settings
                    .data
                    .lock()
                    .unwrap()
                    .contains_key("island.returnDelay")
            );
        }
    }

    #[test]
    fn unavailable_directory_has_no_fallback_write_target() {
        let settings = Settings::from_paths(None, None);
        assert!(settings.path.is_none());
        assert!(settings.load_error.is_some());
        assert!(
            settings
                .store_value("app.language", Value::from("zh-CN"))
                .is_err()
        );
        assert!(!settings.data.lock().unwrap().contains_key("app.language"));
    }

    #[test]
    fn backup_failure_keeps_loaded_settings_read_only() {
        let root = Profile::new();
        let legacy = root.0.join("original.json");
        let output = root.0.join("workbench/settings.json");
        std::fs::write(&legacy, br#"{"island.returnDelay":8}"#).unwrap();
        std::fs::create_dir_all(
            output
                .parent()
                .unwrap()
                .join("settings.pre-migration-v1.json"),
        )
        .unwrap();
        let settings = Settings::from_paths(Some(output.clone()), Some(&legacy));
        assert!(
            settings
                .store_value("island.returnDelay", Value::from(12))
                .is_err()
        );
        assert!(!output.exists());
    }

    #[test]
    fn failed_save_preserves_memory_and_successful_save_replaces_complete_file() {
        let root = Profile::new();
        let path = root.0.join("settings.json");
        let settings = Settings::from_paths(Some(path.clone()), None);
        settings
            .store_value("island.returnDelay", Value::from(8))
            .unwrap();
        settings
            .store_value("island.returnDelay", Value::from(12))
            .unwrap();
        assert_eq!(
            read_map(&std::fs::read(&path).unwrap()).unwrap()["island.returnDelay"],
            12
        );
        std::fs::remove_file(&path).unwrap();
        std::fs::create_dir(&path).unwrap();
        assert!(
            settings
                .store_value("island.returnDelay", Value::from(20))
                .is_err()
        );
        assert_eq!(settings.data.lock().unwrap()["island.returnDelay"], 12);
        assert_eq!(std::fs::read_dir(&root.0).unwrap().count(), 1);
    }
}
