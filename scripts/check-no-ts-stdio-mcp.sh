#!/usr/bin/env bash
# Rust-First gate: TS stdio MCP adapter must not be reintroduced after S3 deletion.
# Authority: crates/smart-reader-mcp-server (rmcp stdio + HTTP).
# Ledger ts_deleted flip is blocked until PR merge + prod smoke (rej-001).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN="${ROOT}/bin/smart-reader-mcp"
TS_ENTRY="${ROOT}/src/index.ts"
TS_MCP="${ROOT}/src/mcp.ts"
DIST_ENTRY="${ROOT}/dist/index.js"
STDIO_GATE="${ROOT}/scripts/check-no-ts-stdio-mcp.sh"
GATE_TEST="${ROOT}/test/check-no-ts-stdio-mcp.test.ts"
LEDGER="${ROOT}/docs/specs/smart-reader-mcp-migration-ledger.json"
RUST_MAIN="${ROOT}/crates/smart-reader-mcp-server/src/main.rs"

violations=0

report_violation() {
	echo "VIOLATION: $*"
	violations=$((violations + 1))
}

echo "=== check-no-ts-stdio-mcp $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="

if [[ ! -f "${BIN}" ]]; then
	report_violation "missing bin/smart-reader-mcp"
fi

if [[ ! -f "${STDIO_GATE}" ]]; then
	report_violation "missing scripts/check-no-ts-stdio-mcp.sh"
fi

if [[ ! -f "${GATE_TEST}" ]]; then
	report_violation "missing test/check-no-ts-stdio-mcp.test.ts"
fi

if [[ ! -f "${LEDGER}" ]]; then
	report_violation "missing docs/specs/smart-reader-mcp-migration-ledger.json"
fi

if [[ ! -f "${RUST_MAIN}" ]]; then
	report_violation "missing crates/smart-reader-mcp-server/src/main.rs"
fi

if [[ -f "${TS_ENTRY}" ]]; then
	report_violation "src/index.ts must be deleted (transport/stdio-ts-adapter retirement)"
fi

if [[ -f "${TS_MCP}" ]]; then
	if grep -qE 'StdioServerTransport|McpServer|createServer' "${TS_MCP}"; then
		report_violation "src/mcp.ts must not implement TS stdio MCP server transport"
	fi
fi

if [[ -f "${DIST_ENTRY}" ]]; then
	report_violation "dist/index.js must be deleted when TS stdio MCP entrypoint is retired"
fi

if [[ -f "${BIN}" ]]; then
	if ! grep -q 'resolve_rust_bin' "${BIN}"; then
		report_violation "bin/smart-reader-mcp must resolve Rust rmcp server via resolve_rust_bin"
	fi

	if grep -qE 'use_ts_transport|exec node|SMART_READER_MCP_TRANSPORT:-}" == "ts"' "${BIN}"; then
		report_violation "bin/smart-reader-mcp must not launch node or retain TS stdio opt-in"
	fi
fi

if [[ -f "${RUST_MAIN}" ]]; then
	if ! grep -q 'transport::stdio' "${RUST_MAIN}"; then
		report_violation "Rust MCP server must expose rmcp stdio transport"
	fi
fi

if [[ -f "${LEDGER}" ]]; then
	node - "${LEDGER}" <<'NODE'
const [ledgerPath] = process.argv.slice(2);
const ledger = JSON.parse(require("node:fs").readFileSync(ledgerPath, "utf8"));
const stdioRust = ledger.capabilities.find((cap) => cap.id === "transport/stdio-rust-rmcp");
const http = ledger.capabilities.find((cap) => cap.id === "transport/web-mcp-http");
if (!stdioRust) {
  console.error("[check-no-ts-stdio-mcp] missing capability transport/stdio-rust-rmcp");
  process.exit(1);
}
if (!http) {
  console.error("[check-no-ts-stdio-mcp] missing capability transport/web-mcp-http");
  process.exit(1);
}
const allowedStates = new Set(["rust_impl", "parity_proven", "authority_rust"]);
if (!allowedStates.has(stdioRust.state)) {
  console.error(
    `[check-no-ts-stdio-mcp] transport/stdio-rust-rmcp is ${stdioRust.state}; expected rust_impl, parity_proven, or authority_rust`
  );
  process.exit(1);
}
if (!allowedStates.has(http.state)) {
  console.error(
    `[check-no-ts-stdio-mcp] transport/web-mcp-http is ${http.state}; expected rust_impl or authority_rust`
  );
  process.exit(1);
}
if (!stdioRust.differentialTest?.includes("smart_reader_mcp_differential")) {
  console.error(
    "[check-no-ts-stdio-mcp] transport/stdio-rust-rmcp must reference smart_reader_mcp_differential harness"
  );
  process.exit(1);
}
NODE
fi

if [[ "${violations}" -gt 0 ]]; then
	echo ""
	echo "FAIL: ${violations} TS stdio MCP reintroduction violation(s)."
	echo "Authority: crates/smart-reader-mcp-server via bin/smart-reader-mcp."
	exit 1
fi

echo "PASS: TS stdio MCP adapter retired; Rust rmcp is sole MCP transport."