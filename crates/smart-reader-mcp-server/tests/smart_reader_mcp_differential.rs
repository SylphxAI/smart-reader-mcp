//! TRUE differential parity: TS contract oracle vs native Rust smart-reader SSOT.
//!
//! Fail-closed — no SKIP-as-pass. Oracle subprocess must succeed before comparison.
//! Bounded slice (rej-010 / tick015):
//! - `read_media_differential_matches_ts_oracle` — tool/read_media allow-list
//! See scripts/run-smart-reader-mcp-differential.sh.

use serde::Deserialize;
use serde_json::{json, Value};
use smart_reader_core::{read_media_from_value, ReadMediaErrorCode};
use smart_reader_mcp_server::tool_routes::{route_for_tool, ToolRoute};
use smart_reader_mcp_server::{SmartReaderMcp, SERVER_NAME, SERVER_VERSION};
use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::process::Command;

const READ_MEDIA_SLICE: &str = "read-media";

fn repo_root() -> PathBuf {
    // Canonicalize so path-policy rejects of literal ".." segments never fire.
    fs::canonicalize(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../.."))
        .expect("canonicalize repo root")
}

fn corpus_fixture_path() -> PathBuf {
    repo_root().join("scripts/differential/fixtures/smart-reader-mcp-corpus.json")
}

fn fixtures_root() -> PathBuf {
    repo_root().join("test/fixtures")
}

#[derive(Debug, Deserialize)]
struct OracleCase {
    id: String,
    slice: String,
    domain: String,
    input: Value,
    output: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OracleCorpus {
    corpus_version: u32,
    fixture_corpus_hash: String,
    cases: Vec<OracleCase>,
}

fn run_ts_oracle() -> OracleCorpus {
    if let Ok(path) = std::env::var("SMART_READER_MCP_ORACLE_JSON") {
        let raw = fs::read_to_string(&path)
            .unwrap_or_else(|error| panic!("read SMART_READER_MCP_ORACLE_JSON at {path}: {error}"));
        return serde_json::from_str(&raw).expect("oracle JSON must be valid");
    }

    let script = repo_root().join("scripts/differential/smart-reader-mcp-oracle.ts");
    let output = Command::new("bun")
        .arg("run")
        .arg(&script)
        .current_dir(repo_root())
        .output()
        .unwrap_or_else(|error| panic!("spawn TS oracle at {}: {error}", script.display()));

    assert!(
        output.status.success(),
        "TS oracle failed:\nstdout: {}\nstderr: {}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );

    serde_json::from_slice(&output.stdout).expect("oracle output must be valid JSON")
}

fn load_corpus_doc() -> Value {
    let raw = fs::read_to_string(corpus_fixture_path()).expect("read corpus fixture");
    serde_json::from_str(&raw).expect("parse corpus fixture")
}

fn install_mock_reader(name: &str, response: &Value) -> PathBuf {
    let mock_dir = std::env::temp_dir().join(format!(
        "smart-reader-diff-mock-{}-{}",
        name,
        std::process::id()
    ));
    let _ = fs::create_dir_all(&mock_dir);
    let cli = mock_dir.join(format!("{name}-reader-cli"));
    let payload = serde_json::to_string(response).expect("serialize mock");
    // `read -r` exits 1 on EOF without trailing newline; tolerate that under set -e.
    let script = format!(
        "#!/usr/bin/env bash\nset -euo pipefail\nread -r _request || true\nprintf '%s\\n' '{payload}'\n",
        payload = payload.replace('\'', "'\\''")
    );
    fs::write(&cli, script).expect("write mock cli");
    fs::set_permissions(&cli, fs::Permissions::from_mode(0o755)).expect("chmod mock cli");
    cli
}

fn install_mocks_from_corpus(corpus: &Value) -> (PathBuf, PathBuf) {
    let readers = corpus
        .get("mockReaders")
        .and_then(Value::as_object)
        .expect("mockReaders");
    let pdf = install_mock_reader(
        "pdf",
        readers
            .get("pdf")
            .and_then(|entry| entry.get("cli_response"))
            .expect("pdf cli_response"),
    );
    let image = install_mock_reader(
        "image",
        readers
            .get("image")
            .and_then(|entry| entry.get("cli_response"))
            .expect("image cli_response"),
    );
    (pdf, image)
}

fn compare_tool_route_case(case: &OracleCase) {
    let tool = case.input["tool"].as_str().expect("tool route tool");
    let route = route_for_tool(tool).expect("tool must be routed");
    let route_name = match route {
        ToolRoute::RustCore => "RustCore",
        ToolRoute::LegacyOptIn => "LegacyOptIn",
    };
    let native = json!({ "route": route_name });
    assert_eq!(
        native, case.output,
        "tool route mismatch for case {}",
        case.id
    );
}

fn compare_server_contract_case(case: &OracleCase) {
    let tools = SmartReaderMcp::new().tool_router.list_all();
    let mut names: Vec<String> = tools.iter().map(|tool| tool.name.to_string()).collect();
    names.sort();

    let expected_tools = case.input["tools"]
        .as_array()
        .expect("server contract tools")
        .iter()
        .map(|value| value.as_str().expect("tool name").to_string())
        .collect::<Vec<_>>();

    // Fail-closed allow-list: exact match, not superset.
    assert_eq!(
        names, expected_tools,
        "rmcp tool allow-list mismatch (fail-closed)"
    );

    let native = json!({
        "name": SERVER_NAME,
        "version": SERVER_VERSION,
        "tools": case.input["tools"],
    });
    assert_eq!(
        native, case.output,
        "server contract mismatch for case {}",
        case.id
    );
}

fn compare_allow_list_case(case: &OracleCase) {
    let tools = SmartReaderMcp::new().tool_router.list_all();
    let mut names: Vec<String> = tools.iter().map(|tool| tool.name.to_string()).collect();
    names.sort();
    let expected = case.output["tools"]
        .as_array()
        .expect("allow-list tools")
        .iter()
        .map(|value| value.as_str().expect("tool").to_string())
        .collect::<Vec<_>>();
    assert_eq!(names, expected, "allow-list tools must match exactly");
    let native = json!({ "tools": names });
    assert_eq!(native, case.output, "allow-list mismatch for {}", case.id);
}

fn compare_tool_case(case: &OracleCase, pdf_cli: &Path, image_cli: &Path) {
    let fixture = case.input["fixture"].as_str().expect("tool fixture");
    let fixture_path = fixtures_root().join(fixture);

    // SAFETY: single-threaded test process; env scoped to this test binary.
    unsafe {
        std::env::set_var("SMART_READER_PDF_CLI", pdf_cli);
        std::env::set_var("SMART_READER_IMAGE_CLI", image_cli);
        // video not used in this bounded slice; clear to avoid accidental siblings
        std::env::remove_var("SMART_READER_VIDEO_CLI");
    }

    if case.output.get("status").and_then(Value::as_str) == Some("error") {
        let err = read_media_from_value(&json!({ "path": fixture_path }))
            .expect_err("expected read_media error");
        assert_eq!(
            err.code,
            ReadMediaErrorCode::InvalidRequest,
            "{}",
            case.id
        );
        let needle = case.output["message_contains"]
            .as_str()
            .expect("message_contains")
            .to_ascii_lowercase();
        assert!(
            err.message.to_ascii_lowercase().contains(&needle),
            "{}: expected message to contain '{needle}', got '{}'",
            case.id,
            err.message
        );
        return;
    }

    let core = read_media_from_value(&json!({ "path": fixture_path }))
        .unwrap_or_else(|error| panic!("{}: core read_media failed: {error:?}", case.id));

    let envelope = serde_json::to_value(&core.envelope).expect("serialize envelope");
    let native = json!({
        "status": "ok",
        "delegated_tool": envelope.pointer("/delegation/delegated_tool").cloned().unwrap_or(Value::Null),
        "detected_format": envelope.pointer("/locator/detectedFormat").cloned().unwrap_or(Value::Null),
        "selected_category": envelope.pointer("/routing/selected_category").cloned().unwrap_or(Value::Null),
        "result": envelope.get("result").cloned().unwrap_or(Value::Null),
    });

    assert_eq!(
        native, case.output,
        "tool differential mismatch for case {}",
        case.id
    );
}

fn assert_oracle_metadata(oracle: &OracleCorpus) {
    assert_eq!(oracle.corpus_version, 1);
    assert!(!oracle.fixture_corpus_hash.is_empty());
    assert!(!oracle.cases.is_empty(), "oracle must emit cases");
}

fn assert_slice_metadata(case: &OracleCase) {
    match case.slice.as_str() {
        READ_MEDIA_SLICE => {
            assert_eq!(case.domain, "tool");
            assert_eq!(case.input["tool"].as_str(), Some("read_media"));
        }
        "tool-route-contract" => assert_eq!(case.domain, "toolRouteContract"),
        "server-contract" => assert_eq!(case.domain, "serverContract"),
        "allow-list" => assert_eq!(case.domain, "allowList"),
        other => panic!("unknown slice {other} for case {}", case.id),
    }
}

fn compare_case(case: &OracleCase, pdf_cli: &Path, image_cli: &Path) {
    match case.domain.as_str() {
        "tool" => compare_tool_case(case, pdf_cli, image_cli),
        "toolRouteContract" => compare_tool_route_case(case),
        "serverContract" => compare_server_contract_case(case),
        "allowList" => compare_allow_list_case(case),
        other => panic!("unknown oracle domain {other} in case {}", case.id),
    }
}

fn cases_for_slice<'a>(oracle: &'a OracleCorpus, slice: &str) -> Vec<&'a OracleCase> {
    oracle
        .cases
        .iter()
        .filter(|case| case.slice == slice)
        .collect()
}

fn run_bounded_slice(slice: &str, min_cases: usize) {
    let _ = fs::read_to_string(corpus_fixture_path()).expect("read smart-reader-mcp corpus fixture");
    let oracle = run_ts_oracle();
    assert_oracle_metadata(&oracle);

    let corpus_doc = load_corpus_doc();
    let (pdf_cli, image_cli) = install_mocks_from_corpus(&corpus_doc);

    let cases = cases_for_slice(&oracle, slice);
    assert!(
        cases.len() >= min_cases,
        "slice {slice} expected at least {min_cases} cases, got {}",
        cases.len()
    );

    for case in &cases {
        assert_slice_metadata(case);
        compare_case(case, &pdf_cli, &image_cli);
    }
}

fn run_all_oracle_cases() {
    let _ = fs::read_to_string(corpus_fixture_path()).expect("read smart-reader-mcp corpus fixture");
    let oracle = run_ts_oracle();
    assert_oracle_metadata(&oracle);

    let corpus_doc = load_corpus_doc();
    let (pdf_cli, image_cli) = install_mocks_from_corpus(&corpus_doc);

    for case in &oracle.cases {
        assert_slice_metadata(case);
        compare_case(case, &pdf_cli, &image_cli);
    }
}

#[test]
fn read_media_differential_matches_ts_oracle() {
    // Bounded slice + contracts that ship with the allow-list.
    run_bounded_slice(READ_MEDIA_SLICE, 2);
    run_bounded_slice("tool-route-contract", 1);
    run_bounded_slice("server-contract", 1);
    run_bounded_slice("allow-list", 1);
}

#[test]
fn smart_reader_mcp_differential_matches_ts_oracle() {
    // Full oracle corpus for the read_media allow-list slice (no HTTP).
    run_all_oracle_cases();
}
