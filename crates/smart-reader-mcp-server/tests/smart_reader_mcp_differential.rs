//! TRUE differential parity: TS contract oracle vs native Rust smart-reader SSOT.
//!
//! Fail-closed — no SKIP-as-pass. Oracle subprocess must succeed before comparison.
//! See scripts/run-smart-reader-mcp-differential.sh and rej-010 re-audit.

use std::collections::BTreeMap;
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::thread;
use std::time::Duration;

use reqwest::blocking::Client;
use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, CONTENT_TYPE};
use serde::Deserialize;
use serde_json::{json, Value};
use smart_reader_core::{read_media_from_value, ReadMediaErrorCode, READ_MEDIA_ROUTE};
use smart_reader_mcp_server::read_media;
use smart_reader_mcp_server::{http_transport, SERVER_NAME, SERVER_VERSION};

static HTTP_REQUEST_ID: AtomicU64 = AtomicU64::new(1);
static STDIO_REQUEST_ID: AtomicU64 = AtomicU64::new(1);

fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
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

fn resolve_transport(env: &Value) -> String {
    let env_obj = env.as_object().expect("transport env object");
    if let Some(value) = env_obj
        .get("SMART_READER_MCP_TRANSPORT")
        .and_then(Value::as_str)
    {
        return value.to_string();
    }
    if let Some(value) = env_obj.get("MCP_TRANSPORT").and_then(Value::as_str) {
        return value.to_string();
    }
    "stdio".to_string()
}

fn surface_file(surface: &str) -> PathBuf {
    match surface {
        "bin" => repo_root().join("bin/smart-reader-mcp"),
        "stdio" => repo_root().join("crates/smart-reader-mcp-server/src/main.rs"),
        "http" => repo_root().join("crates/smart-reader-mcp-server/src/http_transport.rs"),
        other => panic!("unknown surface {other}"),
    }
}

fn surface_markers(surface: &str, markers: &[String]) -> BTreeMap<String, bool> {
    let path = surface_file(surface);
    let content = fs::read_to_string(&path)
        .unwrap_or_else(|error| panic!("read {}: {error}", path.display()));
    let mut found = BTreeMap::new();
    for marker in markers {
        found.insert(marker.clone(), content.contains(marker));
    }
    found
}

fn normalize_path_label(path: &str) -> String {
    let fixtures = fixtures_root();
    let absolute = Path::new(path);
    absolute
        .strip_prefix(&fixtures)
        .map(|relative| relative.display().to_string())
        .unwrap_or_else(|_| path.to_string())
}

fn normalize_envelope(mut value: Value) -> Value {
    if let Some(object) = value.as_object_mut() {
        object.remove("sourceHash");
        if let Some(freshness) = object.get_mut("freshness").and_then(Value::as_object_mut) {
            freshness.insert("indexedAt".into(), Value::String("NORMALIZED".into()));
        }
        for key in ["subject", "source"] {
            if let Some(path) = object.get(key).and_then(Value::as_str) {
                object.insert(key.into(), Value::String(normalize_path_label(path)));
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

fn install_mock_readers_from_golden() -> (PathBuf, PathBuf, PathBuf) {
    let manifest_path = fixtures_root().join("read-media-golden.json");
    let manifest: Value =
        serde_json::from_str(&fs::read_to_string(&manifest_path).expect("read golden"))
            .expect("parse golden");
    let readers = manifest
        .get("mock_readers")
        .and_then(Value::as_object)
        .expect("mock_readers");

    let mock_dir = tempfile::tempdir().expect("tempdir");
    let write_mock = |name: &str, key: &str| -> PathBuf {
        let response = readers
            .get(key)
            .and_then(|entry| entry.get("response"))
            .expect("mock response");
        let payload = serde_json::to_string(response).expect("serialize mock");
        let cli = mock_dir.path().join(name);
        let script = format!(
            "#!/usr/bin/env bash\nset -euo pipefail\nread -r _request\nprintf '%s\\n' '{payload}'\n",
            payload = payload.replace('\'', "'\\''")
        );
        fs::write(&cli, script).expect("write mock cli");
        fs::set_permissions(&cli, fs::Permissions::from_mode(0o755)).expect("chmod");
        cli
    };

    (
        write_mock("pdf-reader-cli", "pdf"),
        write_mock("image-reader-cli", "image"),
        write_mock("video-reader-cli", "video"),
    )
}

fn compare_transport_contract_case(case: &OracleCase) {
    let native = serde_json::json!({
        "transport": resolve_transport(&case.input["env"]),
    });
    assert_eq!(
        native, case.output,
        "transport contract mismatch for case {}",
        case.id
    );
}

fn compare_surface_contract_case(case: &OracleCase) {
    let surface = case.input["surface"]
        .as_str()
        .expect("surface contract surface");
    let markers = case.input["markers"]
        .as_array()
        .expect("surface contract markers")
        .iter()
        .map(|value| value.as_str().expect("marker string").to_string())
        .collect::<Vec<_>>();
    let native = serde_json::json!({
        "markers": surface_markers(surface, &markers),
    });
    assert_eq!(
        native, case.output,
        "surface contract mismatch for case {}",
        case.id
    );
}

fn compare_server_contract_case(case: &OracleCase) {
    let native = serde_json::json!({
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

fn compare_read_media_tool_case(case: &OracleCase, pdf_cli: &Path, image_cli: &Path, video_cli: &Path) {
    let fixture = case.input["fixture"]
        .as_str()
        .expect("readMediaTool fixture");
    let fixture_path = fixtures_root().join(fixture);

    unsafe {
        std::env::set_var("SMART_READER_PDF_CLI", pdf_cli);
        std::env::set_var("SMART_READER_IMAGE_CLI", image_cli);
        std::env::set_var("SMART_READER_VIDEO_CLI", video_cli);
    }

    if case.output.get("status").and_then(Value::as_str) == Some("error") {
        let err = read_media_from_value(&json!({ "path": fixture_path }))
            .expect_err("expected read_media error");
        assert_eq!(err.code, ReadMediaErrorCode::InvalidRequest, "{}", case.id);
        let needle = case.output["message_contains"]
            .as_str()
            .expect("message_contains");
        assert!(
            err.message.to_ascii_lowercase().contains(&needle.to_ascii_lowercase()),
            "{}: expected message to contain '{needle}', got '{}'",
            case.id,
            err.message
        );
        return;
    }

    let core = read_media_from_value(&json!({ "path": fixture_path }))
        .unwrap_or_else(|error| panic!("{}: core read_media failed: {error:?}", case.id));
    let rmcp = read_media::read_media(json!({ "path": fixture_path }))
        .unwrap_or_else(|error| panic!("{}: rmcp read_media failed: {error:?}", case.id));

    assert_eq!(core.status, "ok");
    assert_eq!(core.route, READ_MEDIA_ROUTE);

    let structured = rmcp
        .structured_content
        .expect("structured content should be present");
    assert_eq!(
        structured.get("route").and_then(Value::as_str),
        Some(READ_MEDIA_ROUTE)
    );

    let actual = normalize_envelope(serde_json::to_value(core.envelope).expect("envelope"));
    let expected = normalize_envelope(case.output["envelope"].clone());
    for pointer in [
        "/locator",
        "/route",
        "/delegation",
        "/routing",
        "/warnings",
        "/result",
    ] {
        assert_eq!(
            actual.pointer(pointer),
            expected.pointer(pointer),
            "{}: mismatch at {pointer}",
            case.id
        );
    }
}

fn resolve_mcp_binary() -> PathBuf {
    for relative in [
        "bin/native/smart-reader-mcp-server",
        "target/release/smart-reader-mcp-server",
        "target/debug/smart-reader-mcp-server",
    ] {
        let candidate = repo_root().join(relative);
        if candidate.is_file() {
            return candidate;
        }
    }
    panic!("smart-reader-mcp-server is not built; run `bun run build:rust`");
}

fn pick_ephemeral_port() -> u16 {
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind ephemeral port");
    listener.local_addr().expect("local addr").port()
}

struct StdioMcpClient {
    child: Child,
    stdin: std::process::ChildStdin,
    stdout: BufReader<std::io::ChildStdout>,
    initialized: bool,
}

impl StdioMcpClient {
    fn spawn(pdf_cli: &Path, image_cli: &Path, video_cli: &Path) -> Self {
        let binary = resolve_mcp_binary();
        let mut child = Command::new(&binary)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .env_remove("MCP_TRANSPORT")
            .env_remove("SMART_READER_MCP_TRANSPORT")
            .env("SMART_READER_PDF_CLI", pdf_cli)
            .env("SMART_READER_IMAGE_CLI", image_cli)
            .env("SMART_READER_VIDEO_CLI", video_cli)
            .spawn()
            .unwrap_or_else(|error| panic!("spawn rmcp stdio server at {}: {error}", binary.display()));

        let stdout = child.stdout.take().expect("rmcp stdio server stdout");
        let stdin = child.stdin.take().expect("rmcp stdio server stdin");

        Self {
            child,
            stdin,
            stdout: BufReader::new(stdout),
            initialized: false,
        }
    }

    fn write_message(&mut self, message: &Value) {
        let payload = serde_json::to_string(message).expect("serialize MCP message");
        writeln!(self.stdin, "{payload}").expect("write MCP message to stdin");
        self.stdin.flush().expect("flush MCP stdin");
    }

    fn read_response(&mut self, id: u64) -> Value {
        let deadline = std::time::Instant::now() + Duration::from_secs(60);
        let mut line = String::new();

        loop {
            if std::time::Instant::now() > deadline {
                panic!("timed out waiting for MCP response id={id}");
            }

            line.clear();
            match self.stdout.read_line(&mut line) {
                Ok(0) => panic!("rmcp stdio server closed stdout while waiting for id={id}"),
                Ok(_) => {}
                Err(error) => panic!("read rmcp stdio stdout: {error}"),
            }

            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            let payload: Value = serde_json::from_str(trimmed)
                .unwrap_or_else(|error| panic!("parse MCP stdout line `{trimmed}`: {error}"));

            if payload.get("id").and_then(Value::as_u64) == Some(id) {
                return payload;
            }
        }
    }

    fn send_request(&mut self, method: &str, params: Value) -> Value {
        let id = STDIO_REQUEST_ID.fetch_add(1, Ordering::Relaxed);
        self.write_message(&json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params,
        }));
        self.read_response(id)
    }

    fn send_notification(&mut self, method: &str, params: Value) {
        self.write_message(&json!({
            "jsonrpc": "2.0",
            "method": method,
            "params": params,
        }));
    }

    fn initialize_session(&mut self) {
        if self.initialized {
            return;
        }

        let response = self.send_request(
            "initialize",
            json!({
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": { "name": "stdio-differential", "version": "1.0.0" },
            }),
        );

        let server_name = response
            .pointer("/result/serverInfo/name")
            .and_then(Value::as_str)
            .unwrap_or_default();
        assert_eq!(
            server_name, SERVER_NAME,
            "initialize must identify smart-reader-mcp rmcp server"
        );

        self.send_notification("notifications/initialized", json!({}));
        self.initialized = true;
    }
}

impl Drop for StdioMcpClient {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

struct HttpMcpHarness {
    child: Child,
    base_url: String,
    client: Client,
    session_headers: HeaderMap,
}

impl HttpMcpHarness {
    fn spawn(port: u16, image_cli: &Path) -> Self {
        let binary = resolve_mcp_binary();
        let child = Command::new(&binary)
            .env("MCP_TRANSPORT", "http")
            .env("MCP_HTTP_PORT", port.to_string())
            .env("MCP_HTTP_HOST", "127.0.0.1")
            .env("SMART_READER_IMAGE_CLI", image_cli)
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap_or_else(|error| panic!("spawn smart-reader HTTP server: {error}"));

        let harness = Self {
            child,
            base_url: format!("http://127.0.0.1:{port}/mcp"),
            client: Client::new(),
            session_headers: default_streamable_headers(),
        };
        harness.wait_for_ready();
        harness
    }

    fn wait_for_ready(&self) {
        let deadline = std::time::Instant::now() + Duration::from_secs(30);
        while std::time::Instant::now() < deadline {
            if self
                .client
                .get(format!("{}/health", self.base_url))
                .send()
                .map(|response| response.status().is_success())
                .unwrap_or(false)
            {
                return;
            }
            thread::sleep(Duration::from_millis(100));
        }
        panic!("smart-reader HTTP MCP server did not become healthy");
    }

    fn post_mcp(&mut self, body: &Value) -> reqwest::blocking::Response {
        let response = self
            .client
            .post(&self.base_url)
            .headers(self.session_headers.clone())
            .json(body)
            .send()
            .expect("post MCP request");
        if let Some(session_id) = response.headers().get("mcp-session-id") {
            if let Ok(value) = HeaderValue::from_bytes(session_id.as_bytes()) {
                self.session_headers.insert("mcp-session-id", value);
            }
        }
        response
    }

    fn parse_response(response: reqwest::blocking::Response) -> Value {
        let content_type = response
            .headers()
            .get(CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .unwrap_or("")
            .to_string();
        let body = response.text().expect("read MCP response body");
        if content_type.contains("application/json") {
            return serde_json::from_str(&body).expect("parse JSON MCP response");
        }

        let data_lines: Vec<&str> = body
            .lines()
            .map(str::trim)
            .filter(|line| line.starts_with("data:"))
            .map(|line| line.trim_start_matches("data:").trim())
            .filter(|line| !line.is_empty())
            .collect();
        let payload = data_lines
            .last()
            .unwrap_or_else(|| panic!("no MCP JSON payload in streamable HTTP response: {body}"));
        serde_json::from_str(payload).expect("parse streamable HTTP MCP payload")
    }

    fn send_request(&mut self, method: &str, params: Value) -> Value {
        let id = HTTP_REQUEST_ID.fetch_add(1, Ordering::Relaxed);
        let response = self.post_mcp(&json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params,
        }));
        let payload = Self::parse_response(response);
        assert_eq!(
            payload.get("id").and_then(Value::as_u64),
            Some(id),
            "MCP response id mismatch for {method}"
        );
        payload
    }

    fn send_notification(&mut self, method: &str, params: Value) {
        let _ = self.post_mcp(&json!({
            "jsonrpc": "2.0",
            "method": method,
            "params": params,
        }));
    }

    fn initialize_session(&mut self) {
        self.send_request(
            "initialize",
            json!({
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": { "name": "differential-http-client", "version": "1.0.0" },
            }),
        );
        self.send_notification("notifications/initialized", json!({}));
    }
}

impl Drop for HttpMcpHarness {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn default_streamable_headers() -> HeaderMap {
    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    headers.insert(
        ACCEPT,
        HeaderValue::from_static("application/json, text/event-stream"),
    );
    headers
}

fn compare_http_probe_case(case: &OracleCase, harness: &mut HttpMcpHarness) {
    let kind = case.input["kind"].as_str().expect("httpProbe kind");
    match kind {
        "health" => {
            let path = case.input["path"].as_str().expect("health path");
            let response = harness
                .client
                .get(format!("{}{path}", harness.base_url))
                .send()
                .expect("health request");
            assert!(response.status().is_success(), "{}: health status", case.id);
            let body: Value = response.json().expect("health json");
            assert_eq!(body, case.output, "{}: health body mismatch", case.id);
        }
        "initialize" => {
            let response = harness.send_request(
                "initialize",
                json!({
                    "protocolVersion": "2024-11-05",
                    "capabilities": {},
                    "clientInfo": { "name": "differential-http-client", "version": "1.0.0" },
                }),
            );
            let server_name = response
                .pointer("/result/serverInfo/name")
                .and_then(Value::as_str)
                .unwrap_or_default();
            assert_eq!(
                server_name,
                case.output["serverName"].as_str().expect("serverName"),
                "{}: initialize server name mismatch",
                case.id
            );
        }
        "toolsList" => {
            harness.initialize_session();
            let response = harness.send_request("tools/list", json!({}));
            let tools = response
                .pointer("/result/tools")
                .and_then(Value::as_array)
                .expect("tools array");
            let names: Vec<String> = tools
                .iter()
                .filter_map(|tool| tool.get("name").and_then(Value::as_str).map(str::to_string))
                .collect();
            let expected = case.output["tools"]
                .as_array()
                .expect("expected tools")
                .iter()
                .map(|value| value.as_str().expect("tool name").to_string())
                .collect::<Vec<_>>();
            assert_eq!(names, expected, "{}: tools/list mismatch", case.id);
        }
        "readMedia" => {
            harness.initialize_session();
            let fixture = case.input["fixture"].as_str().expect("readMedia fixture");
            let fixture_path = fixtures_root().join(fixture);
            let response = harness.send_request(
                "tools/call",
                json!({
                    "name": "read_media",
                    "arguments": { "path": fixture_path },
                }),
            );
            let result = response.get("result").expect("tools/call result");
            if response.get("error").is_some() || result.get("isError").and_then(Value::as_bool) == Some(true) {
                panic!("{}: read_media over HTTP failed: {response}", case.id);
            }

            let structured = result
                .get("structuredContent")
                .cloned()
                .or_else(|| {
                    result
                        .pointer("/content/0/text")
                        .and_then(Value::as_str)
                        .and_then(|text| serde_json::from_str(text).ok())
                })
                .expect("structured read_media response");

            assert_eq!(
                structured.get("route").and_then(Value::as_str),
                Some(case.output["route"].as_str().expect("route")),
                "{}: route mismatch",
                case.id
            );
            assert_eq!(
                structured.pointer("/envelope/delegation/delegated_tool"),
                Some(&json!(case.output["delegatedTool"])),
                "{}: delegated_tool mismatch",
                case.id
            );
            assert_eq!(
                structured.pointer("/envelope/delegation/detected_format"),
                Some(&json!(case.output["detectedFormat"])),
                "{}: detected_format mismatch",
                case.id
            );
            assert_eq!(
                structured.pointer("/envelope/routing/selected_category"),
                Some(&json!(case.output["selectedCategory"])),
                "{}: selected_category mismatch",
                case.id
            );
        }
        other => panic!("unknown httpProbe kind {other} in case {}", case.id),
    }
}

fn compare_stdio_probe_case(case: &OracleCase, client: &mut StdioMcpClient) {
    let kind = case.input["kind"].as_str().expect("stdioProbe kind");
    match kind {
        "initialize" => {
            let response = client.send_request(
                "initialize",
                json!({
                    "protocolVersion": "2024-11-05",
                    "capabilities": {},
                    "clientInfo": { "name": "stdio-differential", "version": "1.0.0" },
                }),
            );
            let server_name = response
                .pointer("/result/serverInfo/name")
                .and_then(Value::as_str)
                .unwrap_or_default();
            assert_eq!(
                server_name,
                case.output["serverName"].as_str().expect("serverName"),
                "{}: initialize server name mismatch",
                case.id
            );
        }
        "toolsList" => {
            client.initialize_session();
            let response = client.send_request("tools/list", json!({}));
            let tools = response
                .pointer("/result/tools")
                .and_then(Value::as_array)
                .expect("tools array");
            let names: Vec<String> = tools
                .iter()
                .filter_map(|tool| tool.get("name").and_then(Value::as_str).map(str::to_string))
                .collect();
            let expected = case.output["tools"]
                .as_array()
                .expect("expected tools")
                .iter()
                .map(|value| value.as_str().expect("tool name").to_string())
                .collect::<Vec<_>>();
            assert_eq!(names, expected, "{}: tools/list mismatch", case.id);
        }
        "readMedia" => {
            client.initialize_session();
            let fixture = case.input["fixture"].as_str().expect("readMedia fixture");
            let fixture_path = fixtures_root().join(fixture);
            let response = client.send_request(
                "tools/call",
                json!({
                    "name": "read_media",
                    "arguments": { "path": fixture_path },
                }),
            );

            if case.output.get("error").and_then(Value::as_bool) == Some(true) {
                let message = response
                    .pointer("/error/message")
                    .and_then(Value::as_str)
                    .or_else(|| {
                        response
                            .pointer("/result/content/0/text")
                            .and_then(Value::as_str)
                    })
                    .unwrap_or_default()
                    .to_ascii_lowercase();
                let needle = case.output["message_contains"]
                    .as_str()
                    .expect("message_contains")
                    .to_ascii_lowercase();
                assert!(
                    message.contains(&needle),
                    "{}: stdio read_media error should contain '{needle}', got '{message}'",
                    case.id
                );
                return;
            }

            let result = response.get("result").expect("tools/call result");
            assert!(
                result.get("isError").and_then(Value::as_bool) != Some(true),
                "{}: read_media over stdio failed: {response}",
                case.id
            );

            let structured = result
                .get("structuredContent")
                .cloned()
                .or_else(|| {
                    result
                        .pointer("/content/0/text")
                        .and_then(Value::as_str)
                        .and_then(|text| serde_json::from_str(text).ok())
                })
                .expect("structured read_media response");

            assert_eq!(
                structured.get("route").and_then(Value::as_str),
                Some(case.output["route"].as_str().expect("route")),
                "{}: route mismatch",
                case.id
            );
            assert_eq!(
                structured.pointer("/envelope/delegation/delegated_tool"),
                Some(&json!(case.output["delegatedTool"])),
                "{}: delegated_tool mismatch",
                case.id
            );
            assert_eq!(
                structured.pointer("/envelope/delegation/detected_format"),
                Some(&json!(case.output["detectedFormat"])),
                "{}: detected_format mismatch",
                case.id
            );
            assert_eq!(
                structured.pointer("/envelope/routing/selected_category"),
                Some(&json!(case.output["selectedCategory"])),
                "{}: selected_category mismatch",
                case.id
            );
        }
        other => panic!("unknown stdioProbe kind {other} in case {}", case.id),
    }
}

fn slice_filter() -> Option<String> {
    std::env::var("SMART_READER_MCP_SLICE_FILTER")
        .ok()
        .filter(|value| value != "all" && !value.is_empty())
}

fn transport_is_http(case: &OracleCase) -> bool {
    case.input
        .pointer("/env/MCP_TRANSPORT")
        .or_else(|| case.input.pointer("/env/SMART_READER_MCP_TRANSPORT"))
        .and_then(Value::as_str)
        == Some("http")
}

fn case_matches_slice(case: &OracleCase, slice: &str) -> bool {
    match slice {
        "tool.read_media" => {
            case.domain == "readMediaTool"
                || (case.domain == "stdioProbe"
                    && case.input.get("kind").and_then(Value::as_str) == Some("readMedia"))
                || (case.domain == "httpProbe"
                    && case.input.get("kind").and_then(Value::as_str) == Some("readMedia"))
        }
        "transport.web-mcp-http" => {
            case.domain == "httpProbe"
                || (case.domain == "transportContract" && transport_is_http(case))
                || (case.domain == "surfaceContract"
                    && case.input.get("surface").and_then(Value::as_str) == Some("http"))
        }
        "transport.stdio-rust-rmcp" => {
            matches!(
                case.domain.as_str(),
                "serverContract" | "stdioProbe"
            ) || (case.domain == "transportContract" && !transport_is_http(case))
                || (case.domain == "surfaceContract"
                    && case.input.get("surface").and_then(Value::as_str) == Some("stdio"))
        }
        _ => true,
    }
}

#[test]
fn smart_reader_mcp_differential_matches_ts_oracle() {
    let _ = fs::read_to_string(corpus_fixture_path()).expect("read smart-reader-mcp corpus fixture");
    let oracle = run_ts_oracle();
    assert_eq!(oracle.corpus_version, 1);
    assert!(!oracle.fixture_corpus_hash.is_empty());
    assert!(!oracle.cases.is_empty(), "oracle must emit cases");

    let (pdf_cli, image_cli, video_cli) = install_mock_readers_from_golden();
    let cases: Vec<&OracleCase> = if let Some(slice) = slice_filter() {
        oracle
            .cases
            .iter()
            .filter(|case| case_matches_slice(case, &slice))
            .collect()
    } else {
        oracle.cases.iter().collect()
    };
    assert!(
        !cases.is_empty(),
        "bounded slice filter must retain at least one oracle case"
    );

    let stdio_cases: Vec<&OracleCase> = cases
        .iter()
        .copied()
        .filter(|case| case.domain == "stdioProbe")
        .collect();
    let http_cases: Vec<&OracleCase> = cases
        .iter()
        .copied()
        .filter(|case| case.domain == "httpProbe")
        .collect();

    let mut stdio_client = if !stdio_cases.is_empty() {
        Some(StdioMcpClient::spawn(&pdf_cli, &image_cli, &video_cli))
    } else {
        None
    };
    let mut http_harness = if !http_cases.is_empty() {
        Some(HttpMcpHarness::spawn(pick_ephemeral_port(), &image_cli))
    } else {
        None
    };

    for case in cases {
        match case.domain.as_str() {
            "transportContract" => compare_transport_contract_case(case),
            "surfaceContract" => compare_surface_contract_case(case),
            "serverContract" => compare_server_contract_case(case),
            "readMediaTool" => {
                compare_read_media_tool_case(case, &pdf_cli, &image_cli, &video_cli)
            }
            "stdioProbe" => compare_stdio_probe_case(
                case,
                stdio_client
                    .as_mut()
                    .expect("stdio client required for stdioProbe cases"),
            ),
            "httpProbe" => {
                compare_http_probe_case(
                    case,
                    http_harness
                        .as_mut()
                        .expect("http harness required for httpProbe cases"),
                );
            }
            other => panic!("unknown oracle domain {other} in case {}", case.id),
        }
    }

    assert_eq!(
        http_transport::transport_from_env(),
        None,
        "differential test must not inherit MCP_TRANSPORT=http from environment"
    );
}