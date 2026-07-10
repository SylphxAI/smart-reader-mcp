//! rmcp `read_media` handler parity against smart-reader-core golden envelopes.

use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};

use serde_json::{json, Value};
use smart_reader_mcp_server::read_media;
use smart_reader_core::{read_media_from_value, READ_MEDIA_ROUTE};

const MINIMAL_PNG: &[u8] = &[
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
    0x42, 0x60, 0x82,
];

fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn fixtures_root() -> PathBuf {
    repo_root().join("test/fixtures")
}

fn ensure_sample_png() {
    let path = fixtures_root().join("sample.png");
    if !path.is_file() {
        fs::write(path, MINIMAL_PNG).expect("write sample.png");
    }
}

fn write_mock_cli(dir: &Path, name: &str, response: &Value) -> PathBuf {
    let cli = dir.join(name);
    let payload = serde_json::to_string(response).expect("serialize mock response");
    let script = format!(
        "#!/usr/bin/env bash\nset -euo pipefail\nread -r _request\nprintf '%s\\n' '{payload}'\n",
        payload = payload.replace('\'', "'\\''")
    );
    fs::write(&cli, script).expect("write mock cli");
    fs::set_permissions(&cli, fs::Permissions::from_mode(0o755)).expect("chmod mock cli");
    cli
}

fn install_mock_readers(dir: &Path) -> (PathBuf, PathBuf, PathBuf) {
    let manifest_path = fixtures_root().join("read-media-golden.json");
    let manifest: Value =
        serde_json::from_str(&fs::read_to_string(manifest_path).expect("read golden")).expect("parse");
    let readers = manifest
        .get("mock_readers")
        .and_then(Value::as_object)
        .expect("mock_readers");

    let pdf = write_mock_cli(
        dir,
        "pdf-reader-cli",
        readers
            .get("pdf")
            .and_then(|entry| entry.get("response"))
            .expect("pdf mock"),
    );
    let image = write_mock_cli(
        dir,
        "image-reader-cli",
        readers
            .get("image")
            .and_then(|entry| entry.get("response"))
            .expect("image mock"),
    );
    let video = write_mock_cli(
        dir,
        "video-reader-cli",
        readers
            .get("video")
            .and_then(|entry| entry.get("response"))
            .expect("video mock"),
    );
    (pdf, image, video)
}

#[test]
fn rmcp_read_media_structured_content_matches_core_envelope() {
    ensure_sample_png();
    let mock_dir = tempfile::tempdir().expect("tempdir");
    let (pdf_cli, image_cli, video_cli) = install_mock_readers(mock_dir.path());

    let fixture = fixtures_root().join("mislabeled/png-as-pdf.pdf");
    let args = json!({ "path": fixture });

    unsafe {
        std::env::set_var("SMART_READER_PDF_CLI", pdf_cli);
        std::env::set_var("SMART_READER_IMAGE_CLI", image_cli);
        std::env::set_var("SMART_READER_VIDEO_CLI", video_cli);
    }

    let core = read_media_from_value(&args).expect("core read_media");
    let rmcp = read_media::read_media(args).expect("rmcp read_media");
    let structured = rmcp
        .structured_content
        .expect("structured content should be present");

    assert_eq!(
        structured.get("route").and_then(Value::as_str),
        Some(READ_MEDIA_ROUTE)
    );
    assert_eq!(
        structured.get("engine").and_then(Value::as_str),
        Some(smart_reader_core::ENGINE_NAME)
    );
    assert_eq!(
        structured.get("tool").and_then(Value::as_str),
        Some("read_media")
    );
    assert_eq!(
        structured.get("envelope"),
        Some(&serde_json::to_value(core.envelope).expect("core envelope"))
    );
}