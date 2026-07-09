use std::path::{Path, PathBuf};

use serde::Serialize;
use serde_json::Value;

use crate::delegate::delegate_to_reader_cli;
use crate::envelope::{build_read_media_envelope, hash_file, AgentEvidenceEnvelope, READ_MEDIA_ROUTE};
use crate::policy::{resolve_media_path, PolicyErrorCode};
use crate::sniff::{self, MediaCategory};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ReadMediaErrorCode {
    InvalidParams,
    InvalidRequest,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReadMediaError {
    pub code: ReadMediaErrorCode,
    pub message: String,
}

impl ReadMediaError {
    pub(crate) fn invalid_params(message: impl Into<String>) -> Self {
        Self {
            code: ReadMediaErrorCode::InvalidParams,
            message: message.into(),
        }
    }

    pub(crate) fn invalid_request(message: impl Into<String>) -> Self {
        Self {
            code: ReadMediaErrorCode::InvalidRequest,
            message: message.into(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct ReadMediaSuccess {
    pub status: &'static str,
    pub engine: &'static str,
    pub version: &'static str,
    pub route: &'static str,
    pub envelope: AgentEvidenceEnvelope,
}

pub fn read_media_from_value(input: &Value) -> Result<ReadMediaSuccess, ReadMediaError> {
    let path = input
        .get("path")
        .and_then(Value::as_str)
        .ok_or_else(|| ReadMediaError::invalid_params("path is required"))?;

    let cwd = input
        .get("cwd")
        .and_then(Value::as_str)
        .map(PathBuf::from)
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")));

    let resolved = resolve_media_path(path, &cwd).map_err(|error| match error.code {
        PolicyErrorCode::InvalidParams => ReadMediaError::invalid_params(error.message),
        PolicyErrorCode::InvalidRequest => ReadMediaError::invalid_request(error.message),
    })?;

    read_media_path(&resolved)
}

pub fn read_media_path(source_path: &Path) -> Result<ReadMediaSuccess, ReadMediaError> {
    let sniffed = sniff::sniff_file(source_path).map_err(ReadMediaError::invalid_request)?;
    if sniffed.category == MediaCategory::Unknown || sniffed.format == "unknown" {
        return Err(ReadMediaError::invalid_request(format!(
            "Unsupported or unrecognized media format for {}. Supported: pdf, png, jpeg, gif, webp, tiff, mp4, mkv, mov, webm.",
            source_path.display()
        )));
    }

    let (delegated_tool, raw_result, launch_source) =
        delegate_to_reader_cli(sniffed.category, source_path)
            .map_err(ReadMediaError::invalid_request)?;

    let source_hash = hash_file(source_path).ok();
    let mut warnings = Vec::new();
    if let Some(ext) = source_path.extension().and_then(|value| value.to_str()) {
        let declared = format!(".{}", ext.to_lowercase());
        if !declared.is_empty()
            && !matches!(
                (declared.as_str(), sniffed.format.as_str()),
                (".pdf", "pdf")
                    | (".png", "image/png")
                    | (".jpg", "image/jpeg")
                    | (".jpeg", "image/jpeg")
            )
            && sniffed.format != "unknown"
            && source_path
                .extension()
                .and_then(|value| value.to_str())
                .map(|value| value.to_lowercase())
                .is_some_and(|value| {
                    !sniffed.format.ends_with(&value)
                        && sniffed.format != value
                        && declared != format!(".{}", sniffed.format)
                })
        {
            warnings.push(format!(
                "Routing by content: sniffed {} overrides declared extension {}.",
                sniffed.format, declared
            ));
        }
    }

    let envelope = build_read_media_envelope(crate::envelope::EnvelopeInput {
        source_path,
        sniffed: &sniffed,
        delegated_tool: &delegated_tool,
        launch_source: &launch_source,
        raw_result,
        source_hash,
        warnings,
    });

    Ok(ReadMediaSuccess {
        status: "ok",
        engine: crate::ENGINE_NAME,
        version: crate::ENGINE_VERSION,
        route: READ_MEDIA_ROUTE,
        envelope,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn read_media_delegates_mislabeled_png_when_image_cli_is_available() {
        let fixture = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../test/fixtures/mislabeled/png-as-pdf.pdf");
        if !fixture.is_file() {
            return;
        }

        let image_cli = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../../image-reader-mcp/target/release/image-reader-cli");
        if !image_cli.is_file() {
            return;
        }

        std::env::set_var("SMART_READER_IMAGE_CLI", &image_cli);
        let response = read_media_path(&fixture).expect("read_media");
        assert_eq!(response.route, READ_MEDIA_ROUTE);
        assert_eq!(response.envelope.route.sniff, "rust-sniff");
        assert_eq!(response.envelope.delegation.delegated_tool, "read_image");
        assert_eq!(response.envelope.routing.selected_category, "image");
        std::env::remove_var("SMART_READER_IMAGE_CLI");
    }

    #[test]
    fn rejects_parent_traversal() {
        let err = read_media_from_value(&serde_json::json!({ "path": "../outside.pdf" }))
            .expect_err("traversal");
        assert_eq!(err.code, ReadMediaErrorCode::InvalidRequest);
        assert!(err.message.contains("Path traversal"));
    }
}