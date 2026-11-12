// Date: 2026-11-12. Separate private grants and configuration for each local MCP application.
use crate::workbench::root;
use crate::workbench_connection::{
    atomic_save, config_root, issue_with_saver, manager_post, protect_directory, save_config,
    saved_principal, status_at,
};
use serde_json::{Value, json};
use std::{
    fs,
    path::{Path, PathBuf},
};
use tauri::WebviewWindow;
fn connection_name(directory: &Path, app: &str) -> String {
    let metadata = directory.join("connection-result.json");
    let value = fs::metadata(&metadata)
        .ok()
        .filter(|v| v.len() < 32768)
        .and_then(|_| fs::read(metadata).ok())
        .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok());
    value
        .as_ref()
        .and_then(|v| v["appName"].as_str())
        .filter(|name| {
            !name.trim().is_empty() && name.len() < 256 && !name.chars().any(char::is_control)
        })
        .map(str::to_owned)
        .unwrap_or_else(|| {
            match app {
                "codex" => "Codex",
                "claude-code" => "Claude Code",
                "workbuddy" => "WorkBuddy",
                other => other,
            }
            .to_string()
        })
}
fn app_directory(base: &Path, app: &str) -> Result<PathBuf, String> {
    if app.is_empty()
        || app.len() > 64
        || !app
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
        || ["all", "unassigned"].contains(&app)
    {
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
    result["name"] = json!(connection_name(&directory, app));
    Ok(result)
}
#[tauri::command]
pub async fn island_agent_connections(window: WebviewWindow) -> Result<Value, String> {
    settings_only(window.label())?;
    let data = root()?;
    let base = config_root()?;
    let mut values = Vec::new();
    let mut apps = Vec::new();
    if saved_principal(&base)?.is_some() {
        apps.push("codex".to_string());
    }
    let children = base.join("connections");
    if children.exists() {
        for entry in fs::read_dir(children).map_err(|_| "CONFIG_READ_FAILED")? {
            let entry = entry.map_err(|_| "CONFIG_READ_FAILED")?;
            let id = entry.file_name().to_string_lossy().to_string();
            if entry
                .file_type()
                .is_ok_and(|kind| kind.is_dir() && !kind.is_symlink())
                && app_directory(&base, &id).is_ok()
                && saved_principal(&entry.path())?.is_some()
            {
                apps.push(id);
            }
        }
    }
    apps.sort();
    apps.dedup();
    for app in apps {
        let directory = app_directory(&base, &app)?;
        let mut status = status_at(&data, &directory)
            .await
            .unwrap_or_else(|_| json!({"state":"unavailable","enabled":false}));
        status["appId"] = json!(app);
        status["name"] = json!(connection_name(&directory, &app));
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
fn onboarding_prompt(app: &str, helper: &Path, request: &Path) -> String {
    let name = match app {
        "codex" => "Codex",
        "claude-code" => "Claude Code",
        "dsh" => "dsh",
        "workbuddy" => "WorkBuddy",
        _ => "当前 Agent",
    };
    let quote = |path: &Path| format!("'{}'", path.display().to_string().replace("'", "''"));
    let describe = format!(
        "node {} --request {} --app '实际应用名称' --describe",
        quote(helper),
        quote(request)
    );
    let complete = format!(
        "node {} --request {} --app '实际应用名称' --complete",
        quote(helper),
        quote(request)
    );
    format!(
        "请为当前 {name} 应用完成任务岛 MCP 接入，并在配置完成后自动开启连接。\n日期：2026-11-12\n\n我授权你仅为本机的 {name} 安装/配置任务岛 MCP 和配套执行说明，并自动开启它的任务同步连接。请先识别你所在的实际应用名称（如 Codex、Claude Code、Cursor 或其他支持 MCP 的应用），将命令中的“实际应用名称”替换成真实名称，前后两步保持一致。每次复制可接入一个应用，首次完成后会锁定该应用；保留其他 MCP、插件、凭据及项目配置。\n\n1. 使用本机终端运行以下只读命令，获取此应用的 MCP 配置和配套 Skill 路径：\n{describe}\n\n2. 检查当前应用的真实版本及已有 MCP。复用已安装的任务工作台；若未接入，按该应用支持的方式安装或合并本地 MCP 配置，不能把其他产品的配置格式照搬过来。dsh 应核对其 profile/patch 或扩展机制。需要执行说明时读取返回的 Skill 文件，并在应用支持的位置安装或关联，勿覆盖无关设置。\n\n3. 配置校验通过后自动运行：\n{complete}\n这一步会自动完成任务岛中此应用的“连接”操作，我不需要回任务岛再点击。请求仅对本机的 {name} 有效，30 分钟内完成；过期则提示我重新复制指令。无需读取或输出请求文件中的凭据，也不要读取管理令牌。\n\n4. 在当前应用重载/发现 MCP，确认任务工作台工具可用。不得用测试客户端心跳冒充真实应用连接。如果宿主必须重开会话才加载，保留已完成配置和自动开启结果，明确说明待重载，不声称已连接。遵守宿主权限要求，不能绕过审批或修改其他应用。\n\n5. 简短反馈：是否配置成功、是否已自动开启连接、当前会话是否已发现工具，以及仍需的实际操作。不要仅回复操作教程，请完成可执行的接入工作。"
    )
}
#[tauri::command]
pub async fn island_agent_onboarding_instructions(
    window: WebviewWindow,
    app_id: Option<String>,
) -> Result<String, String> {
    settings_only(window.label())?;
    let _permit = crate::workbench_connection::Permit::take()?;
    let base = config_root()?;
    if let Some(app) = app_id.as_deref() {
        app_directory(&base, app)?;
    }
    let helper = base.join("runtime/onboard.mjs");
    if !helper.is_file() || !base.join("runtime/light.mjs").is_file() {
        return Err("MCP_RUNTIME_UNAVAILABLE".into());
    }
    let directory = base.join("onboarding");
    protect_directory(&directory)?;
    let data = root()?;
    let issued = manager_post(
        &data,
        "api/light-access/prepare-onboarding",
        json!({"appId":app_id,"acknowledged":true}),
    )
    .await?;
    let id = issued["requestId"]
        .as_str()
        .filter(|s| s.len() == 36 && s.bytes().all(|b| b.is_ascii_hexdigit() || b == b'-'))
        .ok_or("INVALID_ONBOARDING_RESPONSE")?;
    if issued["appId"] != json!(app_id)
        || issued["ticket"]
            .as_str()
            .is_none_or(|s| s.len() != 64 || !s.bytes().all(|b| b.is_ascii_hexdigit()))
        || !issued["expiresAt"].is_string()
    {
        return Err("INVALID_ONBOARDING_RESPONSE".into());
    }
    let file = directory.join(format!("{id}.json"));
    let value = json!({"date":"2026-11-12","appId":app_id,"ticket":issued["ticket"],"expiresAt":issued["expiresAt"],"dataDir":data});
    atomic_save(
        &file,
        &serde_json::to_vec(&value).map_err(|_| "CONFIG_ENCODING_FAILED")?,
    )?;
    Ok(onboarding_prompt(
        app_id.as_deref().unwrap_or(""),
        &helper,
        &file,
    ))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn instructions_are_app_scoped_and_complete_connection_without_exposing_credentials() {
        let prompt = onboarding_prompt(
            "claude-code",
            Path::new("C:/User's data/onboard.mjs"),
            Path::new("C:/private/request.json"),
        );
        assert!(prompt.contains("当前 Claude Code"));
        assert!(prompt.contains("--describe"));
        assert!(prompt.contains("--complete"));
        assert!(prompt.contains("我不需要回任务岛再点击"));
        assert!(prompt.contains("User''s data"));
        assert!(!prompt.contains("Bearer"));
        assert!(!prompt.contains("owner-session.json"));
    }
    #[test]
    fn directories_are_independent_and_cannot_escape_the_known_applications() {
        let base = std::env::temp_dir().join("island-agent-scope");
        assert_eq!(app_directory(&base, "codex").unwrap(), base);
        assert_ne!(
            app_directory(&base, "claude-code").unwrap(),
            app_directory(&base, "dsh").unwrap()
        );
        for app in ["../codex", "C:/other", "../unknown", ""] {
            assert!(app_directory(&base, app).is_err());
        }
        assert!(settings_only("island").is_err());
        assert!(settings_only("settings").is_ok());
    }
}
