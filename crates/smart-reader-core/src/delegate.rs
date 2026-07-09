use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use serde_json::Value;

use crate::sniff::MediaCategory;

pub const DELEGATION_CONTRACT_VERSION: &str = "smart-reader-delegation-v1";

#[derive(Debug, Clone)]
pub struct ReaderConfig {
    pub package_name: &'static str,
    pub tool_name: &'static str,
    pub contract_version: &'static str,
    pub cli_env_var: &'static str,
}

pub fn reader_config(category: MediaCategory) -> Option<ReaderConfig> {
    match category {
        MediaCategory::Pdf => Some(ReaderConfig {
            package_name: "@sylphx/pdf-reader-mcp",
            tool_name: "read_pdf",
            contract_version: "3.0.14",
            cli_env_var: "SMART_READER_PDF_CLI",
        }),
        MediaCategory::Image => Some(ReaderConfig {
            package_name: "@sylphx/image-reader-mcp",
            tool_name: "read_image",
            contract_version: "0.1.0",
            cli_env_var: "SMART_READER_IMAGE_CLI",
        }),
        MediaCategory::Video => Some(ReaderConfig {
            package_name: "@sylphx/video-reader-mcp",
            tool_name: "read_video",
            contract_version: "0.1.0",
            cli_env_var: "SMART_READER_VIDEO_CLI",
        }),
        MediaCategory::Unknown => None,
    }
}

pub fn resolve_reader_cli(category: MediaCategory) -> Option<PathBuf> {
    let config = reader_config(category)?;
    if let Ok(path) = std::env::var(config.cli_env_var) {
        let candidate = PathBuf::from(path);
        if candidate.is_file() {
            return Some(candidate);
        }
    }

    let cli_name = match category {
        MediaCategory::Pdf => "pdf-reader-cli",
        MediaCategory::Image => "image-reader-cli",
        MediaCategory::Video => "video-reader-cli",
        MediaCategory::Unknown => return None,
    };

    let mut candidates = Vec::new();
    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(cwd.join("target/release").join(cli_name));
        candidates.push(cwd.join("target/debug").join(cli_name));
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            candidates.push(parent.join(cli_name));
            if let Some(package_root) = parent.parent() {
                candidates.push(package_root.join("target/release").join(cli_name));
                candidates.push(package_root.join("target/debug").join(cli_name));
            }
        }
    }

    let portfolio_root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../..");
    for sibling in ["pdf-reader-mcp", "image-reader-mcp", "video-reader-mcp"] {
        candidates.push(
            portfolio_root
                .join(sibling)
                .join("target/release")
                .join(cli_name),
        );
    }

    candidates
        .into_iter()
        .find(|candidate| candidate.is_file())
}

pub fn build_tool_args(category: MediaCategory, source_path: &Path) -> Value {
    let path = source_path.to_string_lossy();
    match category {
        MediaCategory::Pdf | MediaCategory::Video => serde_json::json!({
            "sources": [{ "path": path }],
            "include_subtitles": false,
            "include_scenes": false
        }),
        MediaCategory::Image => serde_json::json!({
            "path": path,
            "include_metadata": false
        }),
        MediaCategory::Unknown => Value::Null,
    }
}

pub fn delegate_to_reader_cli(
    category: MediaCategory,
    source_path: &Path,
) -> Result<(String, Value, String), String> {
    let config = reader_config(category).ok_or_else(|| "Unsupported media category.".to_string())?;
    let cli = resolve_reader_cli(category).ok_or_else(|| {
        format!(
            "Reader CLI for {} is unavailable. Build sibling reader crates or set {}.",
            config.package_name, config.cli_env_var
        )
    })?;

    let request = serde_json::json!({
        "tool": config.tool_name,
        "input": build_tool_args(category, source_path)
    });
    let payload = serde_json::to_string(&request).map_err(|err| err.to_string())?;

    let mut child = Command::new(&cli)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|err| format!("Failed to spawn {}: {err}", cli.display()))?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(payload.as_bytes())
            .map_err(|err| format!("Failed to write CLI request: {err}"))?;
    }

    let output = child
        .wait_with_output()
        .map_err(|err| format!("Reader CLI failed: {err}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "Reader CLI exited with status {:?}: {stderr}",
            output.status.code()
        ));
    }

    let stdout = String::from_utf8(output.stdout).map_err(|err| err.to_string())?;
    let envelope: Value = serde_json::from_str(&stdout).map_err(|err| format!("Invalid CLI JSON: {err}"))?;
    if envelope.get("status").and_then(Value::as_str) != Some("ok") {
        let message = envelope
            .get("message")
            .and_then(Value::as_str)
            .unwrap_or("Reader delegation failed.");
        return Err(message.to_string());
    }

    let raw_result = extract_raw_result(&envelope, config.tool_name);
    Ok((config.tool_name.to_string(), raw_result, "local".to_string()))
}

fn extract_raw_result(envelope: &Value, tool_name: &str) -> Value {
    if let Some(result) = envelope.get("result") {
        if let Some(content) = result.get("content").and_then(Value::as_array) {
            if let Some(text) = content
                .first()
                .and_then(|block| block.get("text"))
                .and_then(Value::as_str)
            {
                if let Ok(parsed) = serde_json::from_str::<Value>(text) {
                    return parsed;
                }
                return Value::String(text.to_string());
            }
        }
        return result.clone();
    }
    if let Some(twin) = envelope.get("twin") {
        return twin.clone();
    }
    if let Some(results) = envelope.get("results") {
        return results.clone();
    }
    Value::Object(serde_json::Map::from_iter([(
        "tool".to_string(),
        Value::String(tool_name.to_string()),
    )]))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_reader_configs_for_supported_categories() {
        let pdf = reader_config(MediaCategory::Pdf).expect("pdf");
        assert_eq!(pdf.tool_name, "read_pdf");
        let image = reader_config(MediaCategory::Image).expect("image");
        assert_eq!(image.tool_name, "read_image");
    }
}