#!/usr/bin/env bash
# Rust-First gate: Web MCP HTTP transport must not retain a parallel TS HTTP backend.
# TS stdio adapter is retired (transport/stdio-ts-adapter S3 deletion).
# Forbidden: Streamable HTTP / fetch MCP server in src/; HTTP bin path via node.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN="${ROOT}/bin/smart-reader-mcp"
HTTP_TRANSPORT="${ROOT}/crates/smart-reader-mcp-server/src/http_transport.rs"
GATE_TEST="${ROOT}/test/check-no-ts-http-backend.test.ts"
STDIO_GATE="${ROOT}/scripts/check-no-ts-stdio-mcp.sh"
LEDGER="${ROOT}/docs/specs/smart-reader-mcp-migration-ledger.json"

violations=0

report_violation() {
	echo "VIOLATION: $*"
	violations=$((violations + 1))
}

echo "=== check-no-ts-http-backend $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="

if [[ ! -f "${BIN}" ]]; then
	report_violation "missing bin/smart-reader-mcp"
fi

if [[ -f "${ROOT}/src/index.ts" ]]; then
	report_violation "src/index.ts must be deleted (transport/stdio-ts-adapter retired)"
fi

if [[ ! -f "${HTTP_TRANSPORT}" ]]; then
	report_violation "missing crates/smart-reader-mcp-server/src/http_transport.rs"
fi

if [[ ! -f "${GATE_TEST}" ]]; then
	report_violation "missing test/check-no-ts-http-backend.test.ts"
fi

if [[ ! -f "${STDIO_GATE}" ]]; then
	report_violation "missing scripts/check-no-ts-stdio-mcp.sh"
fi

if [[ ! -f "${LEDGER}" ]]; then
	report_violation "missing docs/specs/smart-reader-mcp-migration-ledger.json"
fi

if [[ -f "${LEDGER}" ]]; then
	node - "${LEDGER}" <<'NODE'
const [ledgerPath] = process.argv.slice(2);
const ledger = JSON.parse(require("node:fs").readFileSync(ledgerPath, "utf8"));
const entry = ledger.capabilities.find((cap) => cap.id === "transport/web-mcp-http");
if (!entry) {
  console.error("[check-no-ts-http-backend] missing capability transport/web-mcp-http");
  process.exit(1);
}
const allowedStates = new Set(["rust_impl", "authority_rust"]);
if (!allowedStates.has(entry.state)) {
  console.error(
    `[check-no-ts-http-backend] transport/web-mcp-http is ${entry.state}; expected rust_impl or authority_rust`
  );
  process.exit(1);
}
if (!entry.differentialTest?.includes("smart_reader_mcp_differential")) {
  console.error(
    "[check-no-ts-http-backend] transport/web-mcp-http must reference smart_reader_mcp_differential harness"
  );
  process.exit(1);
}
NODE
fi

if [[ -f "${BIN}" ]]; then
	if ! grep -q 'resolve_rust_bin' "${BIN}"; then
		report_violation "bin/smart-reader-mcp must resolve Rust rmcp server via resolve_rust_bin"
	fi

	if ! grep -q 'MCP_TRANSPORT=http' "${BIN}"; then
		report_violation "bin/smart-reader-mcp must route MCP_TRANSPORT=http to Rust"
	fi

	if grep -qE 'http.*node|exec node|use_ts_transport|SMART_READER_MCP_TRANSPORT:-}" == "ts"' "${BIN}"; then
		report_violation "bin/smart-reader-mcp must not launch node for HTTP transport or retain TS stdio opt-in"
	fi
fi

if [[ -f "${HTTP_TRANSPORT}" ]]; then
	if ! grep -q 'StreamableHttpService' "${HTTP_TRANSPORT}"; then
		report_violation "Rust http_transport.rs must expose StreamableHttpService"
	fi

	if ! grep -q 'health_check' "${HTTP_TRANSPORT}"; then
		report_violation "Rust http_transport.rs must expose /mcp/health"
	fi
fi

if [[ "${violations}" -gt 0 ]]; then
	echo ""
	echo "FAIL: ${violations} Web MCP HTTP TS authority violation(s)."
	echo "Authority: crates/smart-reader-mcp-server/src/http_transport.rs via bin/smart-reader-mcp."
	exit 1
fi

echo "PASS: Web MCP HTTP transport delegates solely to Rust rmcp (no parallel TS HTTP backend)."