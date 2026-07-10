//! Golden fixture parity for `read_media` with mocked sibling reader CLI outputs.

use std::fs;
use std::io::Write;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use serde_json::{json, Value};
use smart_reader_core::{read_media_from_value, ReadMediaErrorCode, READ_MEDIA_ROUTE};

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

fn canonical_fixture(relative: &str) -> PathBuf {
    fixtures_root()
        .join(relative)
        .canonicalize()
        .unwrap_or_else(|err| panic!("canonicalize fixture {relative}: {err}"))
}

fn golden_manifest() -> Value {
    let path = fixtures_root().join("read-media-golden.json");
    let raw = fs::read_to_string(path).expect("read golden manifest");
    serde_json::from_str(&raw).expect("parse golden manifest")
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

fn install_mock_readers(dir: &Path, manifest: &Value) -> (PathBuf, PathBuf, PathBuf) {
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
            .expect("pdf mock response"),
    );
    let image = write_mock_cli(
        dir,
        "image-reader-cli",
        readers
            .get("image")
            .and_then(|entry| entry.get("response"))
            .expect("image mock response"),
    );
    let video = write_mock_cli(
        dir,
        "video-reader-cli",
        readers
            .get("video")
            .and_then(|entry| entry.get("response"))
            .expect("video mock response"),
    );

    (pdf, image, video)
}

fn normalize_envelope(mut value: Value) -> Value {
    if let Some(object) = value.as_object_mut() {
        object.remove("sourceHash");
        if let Some(freshness) = object.get_mut("freshness").and_then(Value::as_object_mut) {
            freshness.insert("indexedAt".into(), Value::String("NORMALIZED".into()));
        }
        for key in ["subject", "source"] {
            if let Some(path) = object.get(key).and_then(Value::as_str) {
                object.insert(
                    key.into(),
                    Value::String(normalize_path_label(path)),
                );
            }
        }
        if let Some(delegation) = object.get_mut("delegation").and_then(Value::as_object_mut) {
            if let Some(path) = delegation.get("source_path").and_then(Value::as_str) {
                delegation.insert(
                    "source_path".into(),
                    Value::String(normalize_path_label(path)),
                );
            }
        }
        if let Some(locator) = object.get_mut("locator").and_then(Value::as_object_mut) {
            if let Some(path) = locator.get("path").and_then(Value::as_str) {
                locator.insert("path".into(), Value::String(normalize_path_label(path)));
            }
        }
        if let Some(routing) = object.get_mut("routing").and_then(Value::as_object_mut) {
            routing.remove("alternatives");
            routing.remove("selection_reason");
        }
    }
    value
}

fn normalize_path_label(path: &str) -> String {
    let fixtures = fixtures_root();
    let absolute = Path::new(path);
    absolute
        .strip_prefix(&fixtures)
        .map(|relative| relative.display().to_string())
        .unwrap_or_else(|_| path.to_string())
}

fn subset_matches(actual: &Value, expected: &Value, id: &str, pointer: &str) {
    let actual_at = actual.pointer(pointer).unwrap_or_else(|| {
        panic!("{id}: actual envelope missing pointer {pointer}");
    });
    let expected_at = expected.pointer(pointer).unwrap_or_else(|| {
        panic!("{id}: golden envelope missing pointer {pointer}");
    });
    assert_eq!(
        actual_at, expected_at,
        "{id}: mismatch at {pointer}"
    );
}

fn assert_success_case(
    id: &str,
    fixture: &str,
    expected: &Value,
    pdf_cli: &Path,
    image_cli: &Path,
    video_cli: &Path,
) {
    let fixture_path = canonical_fixture(fixture);
    assert!(fixture_path.is_file(), "{id}: fixture missing at {}", fixture_path.display());

    // SAFETY: test-only env mutation for mock reader routing.
    unsafe {
        std::env::set_var("SMART_READER_PDF_CLI", pdf_cli);
        std::env::set_var("SMART_READER_IMAGE_CLI", image_cli);
        std::env::set_var("SMART_READER_VIDEO_CLI", video_cli);
    }

    let response = read_media_from_value(&json!({ "path": fixture_path }))
        .unwrap_or_else(|error| panic!("{id}: read_media failed: {error:?}"));

    assert_eq!(response.status, "ok");
    assert_eq!(response.route, READ_MEDIA_ROUTE);

    let actual = normalize_envelope(serde_json::to_value(response.envelope).expect("envelope"));
    let expected_envelope = expected
        .get("envelope")
        .expect("{id}: golden success case should include envelope");

    for pointer in [
        "/locator",
        "/route",
        "/delegation",
        "/routing/contract_version",
        "/routing/selected_category",
        "/routing/sniff_method",
        "/routing/launch_source",
        "/routing/reader_package",
        "/routing/declared_extension",
        "/warnings",
        "/result",
    ] {
        subset_matches(&actual, expected_envelope, id, pointer);
    }

    assert_eq!(
        actual.get("confidence").and_then(Value::as_str),
        Some("deterministic")
    );
    assert_eq!(
        actual
            .get("nextActions")
            .and_then(Value::as_array)
            .map(Vec::len),
        Some(2)
    );
}

fn invoke_cli_read_media(fixture: &str, pdf_cli: &Path, image_cli: &Path, video_cli: &Path) -> Value {
    let cli = repo_root().join("target/release/smart-reader-cli");
    if !cli.is_file() {
        let status = Command::new("cargo")
            .args(["build", "--release", "-p", "smart-reader-cli"])
            .current_dir(repo_root())
            .status()
            .expect("build smart-reader-cli");
        assert!(status.success(), "smart-reader-cli release build failed");
    }

    let fixture_path = canonical_fixture(fixture);
    let request = json!({
        "tool": "read_media",
        "input": { "path": fixture_path }
    });

    let mut child = Command::new(&cli)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .env("SMART_READER_PDF_CLI", pdf_cli)
        .env("SMART_READER_IMAGE_CLI", image_cli)
        .env("SMART_READER_VIDEO_CLI", video_cli)
        .spawn()
        .expect("spawn smart-reader-cli");

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(request.to_string().as_bytes())
            .expect("write cli request");
    }

    let output = child.wait_with_output().expect("wait for cli");
    assert!(
        output.status.success(),
        "smart-reader-cli failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );

    serde_json::from_slice(&output.stdout).expect("parse cli stdout")
}

#[test]
fn read_media_matches_golden_contract_with_mock_sibling_readers() {
    ensure_sample_png();
    let manifest = golden_manifest();
    let mock_dir = tempfile::tempdir().expect("tempdir");
    let (pdf_cli, image_cli, video_cli) = install_mock_readers(mock_dir.path(), &manifest);

    let cases = manifest
        .get("cases")
        .and_then(Value::as_array)
        .expect("golden cases");

    for case in cases {
        let id = case.get("id").and_then(Value::as_str).expect("case id");
        let fixture = case.get("fixture").and_then(Value::as_str).expect("fixture");
        let expects = case.get("expects").expect("expects");

        if expects.get("error").and_then(Value::as_bool) == Some(true) {
            let err = read_media_from_value(&json!({ "path": canonical_fixture(fixture) }))
                .expect_err("{id}: expected unsupported error");
            assert_eq!(err.code, ReadMediaErrorCode::InvalidRequest, "{id}: error code");
            let needle = expects
                .get("message_contains")
                .and_then(Value::as_str)
                .expect("message_contains");
            assert!(
                err.message.to_ascii_lowercase().contains(&needle.to_ascii_lowercase()),
                "{id}: expected message to contain '{needle}', got '{}'",
                err.message
            );
            continue;
        }

        assert_success_case(id, fixture, expects, &pdf_cli, &image_cli, &video_cli);
    }
}

#[test]
fn smart_reader_cli_read_media_matches_core_golden_envelope() {
    ensure_sample_png();
    let manifest = golden_manifest();
    let mock_dir = tempfile::tempdir().expect("tempdir");
    let (pdf_cli, image_cli, video_cli) = install_mock_readers(mock_dir.path(), &manifest);

    let case = manifest
        .get("cases")
        .and_then(Value::as_array)
        .and_then(|cases| cases.iter().find(|entry| entry.get("id") == Some(&json!("mislabeled-png-as-pdf"))))
        .expect("mislabeled golden case");

    let fixture = case.get("fixture").and_then(Value::as_str).expect("fixture");
    let cli_envelope = invoke_cli_read_media(fixture, &pdf_cli, &image_cli, &video_cli);

    assert_eq!(
        cli_envelope.get("status").and_then(Value::as_str),
        Some("ok")
    );
    assert_eq!(
        cli_envelope.get("route").and_then(Value::as_str),
        Some(READ_MEDIA_ROUTE)
    );

    let actual = normalize_envelope(
        cli_envelope
            .get("envelope")
            .cloned()
            .expect("cli envelope"),
    );
    let expected = case
        .get("expects")
        .and_then(|value| value.get("envelope"))
        .expect("golden envelope");

    for pointer in ["/route", "/delegation", "/routing/selected_category", "/warnings", "/result"] {
        subset_matches(&actual, expected, "mislabeled-png-as-pdf", pointer);
    }
}