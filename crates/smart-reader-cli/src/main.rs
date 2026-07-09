use smart_reader_core::policy::{resolve_media_path, PolicyErrorCode};
use smart_reader_core::{sniff, ENGINE_NAME, ENGINE_VERSION};
use serde::Deserialize;
use std::io::{self, Read};
use std::path::PathBuf;

#[derive(Debug, Deserialize)]
struct Request {
    tool: String,
    input: serde_json::Value,
}

#[derive(Debug, serde::Serialize)]
struct SniffSuccessEnvelope {
    status: &'static str,
    engine: &'static str,
    version: &'static str,
    sniff: sniff::SniffResult,
}

#[derive(Debug, serde::Serialize)]
struct ResolveSuccessEnvelope {
    status: &'static str,
    engine: &'static str,
    version: &'static str,
    resolved_path: String,
}

#[derive(Debug, serde::Serialize)]
struct ErrorEnvelope {
    status: &'static str,
    code: String,
    message: String,
    next_action: String,
}

fn policy_code(code: PolicyErrorCode) -> &'static str {
    match code {
        PolicyErrorCode::InvalidParams => "INVALID_PARAMS",
        PolicyErrorCode::InvalidRequest => "INVALID_REQUEST",
    }
}

fn cwd_from_input(input: &serde_json::Value) -> PathBuf {
    input
        .get("cwd")
        .and_then(|value| value.as_str())
        .map(PathBuf::from)
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")))
}

fn handle_sniff_format(input: &serde_json::Value) -> Result<SniffSuccessEnvelope, ErrorEnvelope> {
    let path = input
        .get("path")
        .and_then(|value| value.as_str())
        .ok_or_else(|| ErrorEnvelope {
            status: "error",
            code: "INVALID_PARAMS".into(),
            message: "path is required".into(),
            next_action: "Pass a readable media file path.".into(),
        })?;

    let cwd = cwd_from_input(input);
    let resolved = resolve_media_path(path, &cwd).map_err(|error| ErrorEnvelope {
        status: "error",
        code: policy_code(error.code).into(),
        message: error.message,
        next_action: "Use a local file path without parent traversal.".into(),
    })?;

    let sniffed = sniff::sniff_file(&resolved).map_err(|message| ErrorEnvelope {
        status: "error",
        code: "SNIFF_FAILED".into(),
        message,
        next_action: "Provide a supported PDF, image, or video file.".into(),
    })?;

    Ok(SniffSuccessEnvelope {
        status: "ok",
        engine: ENGINE_NAME,
        version: ENGINE_VERSION,
        sniff: sniffed,
    })
}

fn handle_resolve_media_path(
    input: &serde_json::Value,
) -> Result<ResolveSuccessEnvelope, ErrorEnvelope> {
    let path = input
        .get("path")
        .and_then(|value| value.as_str())
        .ok_or_else(|| ErrorEnvelope {
            status: "error",
            code: "INVALID_PARAMS".into(),
            message: "path is required".into(),
            next_action: "Pass a readable media file path.".into(),
        })?;

    let cwd = cwd_from_input(input);
    let resolved = resolve_media_path(path, &cwd).map_err(|error| ErrorEnvelope {
        status: "error",
        code: policy_code(error.code).into(),
        message: error.message,
        next_action: "Use a local file path without parent traversal.".into(),
    })?;

    Ok(ResolveSuccessEnvelope {
        status: "ok",
        engine: ENGINE_NAME,
        version: ENGINE_VERSION,
        resolved_path: resolved.to_string_lossy().into_owned(),
    })
}

fn main() {
    let mut payload = String::new();
    if io::stdin().read_to_string(&mut payload).is_err() {
        eprintln!("Failed to read stdin");
        std::process::exit(1);
    }

    let request: Request = match serde_json::from_str(&payload) {
        Ok(value) => value,
        Err(error) => {
            let envelope = ErrorEnvelope {
                status: "error",
                code: "INVALID_REQUEST".into(),
                message: format!("Invalid JSON request: {error}"),
                next_action: "Send {\"tool\":\"sniff_format\",\"input\":{...}} on stdin.".into(),
            };
            println!("{}", serde_json::to_string(&envelope).expect("serialize"));
            std::process::exit(1);
        }
    };

    let output = match request.tool.as_str() {
        "sniff_format" => match handle_sniff_format(&request.input) {
            Ok(success) => serde_json::to_string(&success).expect("serialize"),
            Err(error) => serde_json::to_string(&error).expect("serialize"),
        },
        "resolve_media_path" => match handle_resolve_media_path(&request.input) {
            Ok(success) => serde_json::to_string(&success).expect("serialize"),
            Err(error) => serde_json::to_string(&error).expect("serialize"),
        },
        other => serde_json::to_string(&ErrorEnvelope {
            status: "error",
            code: "UNSUPPORTED_TOOL".into(),
            message: format!("Unsupported tool: {other}"),
            next_action: "Use sniff_format or resolve_media_path.".into(),
        })
        .expect("serialize"),
    };

    println!("{output}");
}