use std::path::Path;

use serde::Serialize;
use serde_json::Value;

use crate::delegate::{reader_config, DELEGATION_CONTRACT_VERSION};
use crate::sniff::{MediaCategory, SniffResult};

pub const READ_MEDIA_ROUTE: &str = "rust-read-media-v1";

#[allow(non_snake_case)]
#[derive(Debug, Clone, Serialize)]
pub struct AgentEvidenceEnvelope {
    pub subject: String,
    pub source: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sourceHash: Option<String>,
    pub freshness: Freshness,
    pub locator: Locator,
    pub route: RouteInfo,
    pub confidence: &'static str,
    pub warnings: Vec<String>,
    pub nextActions: Vec<String>,
    pub delegation: DelegationBlock,
    pub routing: RoutingDiagnostics,
    pub result: Value,
}

#[derive(Debug, Clone, Serialize)]
pub struct Freshness {
    pub indexedAt: String,
    pub stale: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct Locator {
    pub path: String,
    pub detectedFormat: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct RouteInfo {
    pub sniff: String,
    pub delegation: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct DelegationBlock {
    pub contract_version: String,
    pub source_path: String,
    pub detected_format: String,
    pub delegated_tool: String,
    pub reader_package: String,
    pub reader_contract_version: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct RoutingAlternative {
    pub category: String,
    pub delegated_tool: String,
    pub reader_package: String,
    pub reader_contract_version: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct RoutingDiagnostics {
    pub contract_version: String,
    pub sniff_method: String,
    pub selected_category: String,
    pub selection_reason: String,
    pub declared_extension: Option<String>,
    pub alternatives: Vec<RoutingAlternative>,
    pub launch_source: String,
    pub reader_package: String,
}

pub fn hash_file(path: &Path) -> Result<String, String> {
    use sha2::{Digest, Sha256};
    let bytes = std::fs::read(path).map_err(|err| err.to_string())?;
    Ok(format!("{:x}", Sha256::digest(bytes)))
}

pub struct EnvelopeInput<'a> {
    pub source_path: &'a Path,
    pub sniffed: &'a SniffResult,
    pub delegated_tool: &'a str,
    pub launch_source: &'a str,
    pub raw_result: Value,
    pub source_hash: Option<String>,
    pub warnings: Vec<String>,
}

pub fn build_read_media_envelope(input: EnvelopeInput<'_>) -> AgentEvidenceEnvelope {
    let source = input.source_path.display().to_string();
    let category = category_label(input.sniffed.category);
    let config = reader_config(input.sniffed.category).expect("supported category");
    let declared_extension = input
        .source_path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| format!(".{}", value.to_lowercase()));

    let extension_mismatch = declared_extension.as_ref().is_some_and(|ext| {
        !extension_matches_format(ext, &input.sniffed.format)
    });

    let selection_reason = if extension_mismatch {
        format!(
            "Sniffed format {} overrides declared extension {}.",
            input.sniffed.format,
            declared_extension.as_ref().unwrap()
        )
    } else {
        format!(
            "Sniffed format {} maps to the {} reader {}.",
            input.sniffed.format, category, input.delegated_tool
        )
    };

    let alternatives = ["pdf", "image", "video"]
        .into_iter()
        .filter(|value| *value != category)
        .filter_map(|alt| {
            let alt_category = match alt {
                "pdf" => MediaCategory::Pdf,
                "image" => MediaCategory::Image,
                "video" => MediaCategory::Video,
                _ => return None,
            };
            let alt_config = reader_config(alt_category)?;
            Some(RoutingAlternative {
                category: alt.to_string(),
                delegated_tool: alt_config.tool_name.to_string(),
                reader_package: alt_config.package_name.to_string(),
                reader_contract_version: alt_config.contract_version.to_string(),
                reason: format!(
                    "Not selected: detected format {} does not map to {}.",
                    input.sniffed.format, alt
                ),
            })
        })
        .collect();

    AgentEvidenceEnvelope {
        subject: source.clone(),
        source: source.clone(),
        sourceHash: input.source_hash,
        freshness: Freshness {
            indexedAt: chrono_now_iso(),
            stale: false,
        },
        locator: Locator {
            path: source,
            detectedFormat: input.sniffed.format.clone(),
        },
        route: RouteInfo {
            sniff: input.sniffed.route.clone(),
            delegation: input.delegated_tool.to_string(),
        },
        confidence: "deterministic",
        warnings: input.warnings,
        nextActions: vec![
            format!("Verify delegated evidence from {}", input.delegated_tool),
            "Re-run read_media after file changes to refresh sourceHash".to_string(),
        ],
        delegation: DelegationBlock {
            contract_version: DELEGATION_CONTRACT_VERSION.to_string(),
            source_path: input.source_path.display().to_string(),
            detected_format: input.sniffed.format.clone(),
            delegated_tool: input.delegated_tool.to_string(),
            reader_package: config.package_name.to_string(),
            reader_contract_version: config.contract_version.to_string(),
        },
        routing: RoutingDiagnostics {
            contract_version: DELEGATION_CONTRACT_VERSION.to_string(),
            sniff_method: input.sniffed.route.clone(),
            selected_category: category.to_string(),
            selection_reason,
            declared_extension,
            alternatives,
            launch_source: input.launch_source.to_string(),
            reader_package: config.package_name.to_string(),
        },
        result: input.raw_result,
    }
}

fn category_label(category: MediaCategory) -> &'static str {
    match category {
        MediaCategory::Pdf => "pdf",
        MediaCategory::Image => "image",
        MediaCategory::Video => "video",
        MediaCategory::Unknown => "unknown",
    }
}

pub fn extension_matches_format(extension: &str, detected_format: &str) -> bool {
    matches!(
        (extension, detected_format),
        (".pdf", "pdf")
            | (".png", "image/png")
            | (".jpg", "image/jpeg")
            | (".jpeg", "image/jpeg")
            | (".gif", "image/gif")
            | (".webp", "image/webp")
            | (".tif", "image/tiff")
            | (".tiff", "image/tiff")
            | (".mp4", "video/mp4")
            | (".m4v", "video/mp4")
            | (".mkv", "video/mkv")
            | (".mov", "video/quicktime")
            | (".webm", "video/webm")
    )
}

fn chrono_now_iso() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let elapsed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    format!("{}Z", elapsed.as_secs())
}