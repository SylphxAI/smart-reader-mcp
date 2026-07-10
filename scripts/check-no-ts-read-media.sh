#!/usr/bin/env bash
# S4 gate: tool/read_media must route through smart-reader-core Rust authority.
# Allowed: TS handler for explicit opt-in (SMART_READER_USE_RUST_READ_MEDIA=ts) and injected test mocks.
# Forbidden: parallel TS sniff/delegation on the default shipped handler path.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HANDLER="${ROOT}/src/handlers/readMedia.ts"
RUST_ENGINE="${ROOT}/src/engine/rust-read-media.ts"
RUST_CORE="${ROOT}/crates/smart-reader-core/src/read_media.rs"
RMCP_HANDLER="${ROOT}/crates/smart-reader-mcp-server/src/read_media.rs"
TOOL_ROUTES="${ROOT}/crates/smart-reader-mcp-server/src/tool_routes.rs"
GOLDEN="${ROOT}/test/fixtures/read-media-golden.json"
GATE_TEST="${ROOT}/test/check-no-ts-read-media.test.ts"
LEDGER="${ROOT}/docs/specs/smart-reader-mcp-migration-ledger.json"
PACKAGE_JSON="${ROOT}/package.json"
CI_WORKFLOW="${ROOT}/.github/workflows/ci.yml"

violations=0

report_violation() {
	echo "VIOLATION: $*"
	violations=$((violations + 1))
}

echo "=== check-no-ts-read-media $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="

if [[ ! -f "${HANDLER}" ]]; then
	report_violation "missing src/handlers/readMedia.ts"
fi

if [[ ! -f "${RUST_ENGINE}" ]]; then
	report_violation "missing src/engine/rust-read-media.ts"
fi

if [[ ! -f "${RUST_CORE}" ]]; then
	report_violation "missing crates/smart-reader-core/src/read_media.rs"
fi

if [[ ! -f "${RMCP_HANDLER}" ]]; then
	report_violation "missing crates/smart-reader-mcp-server/src/read_media.rs"
fi

if [[ ! -f "${TOOL_ROUTES}" ]]; then
	report_violation "missing crates/smart-reader-mcp-server/src/tool_routes.rs"
fi

if [[ ! -f "${GOLDEN}" ]]; then
	report_violation "missing test/fixtures/read-media-golden.json"
fi

if [[ ! -f "${GATE_TEST}" ]]; then
	report_violation "missing test/check-no-ts-read-media.test.ts"
fi

if [[ ! -f "${LEDGER}" ]]; then
	report_violation "missing docs/specs/smart-reader-mcp-migration-ledger.json"
fi

if [[ ! -f "${PACKAGE_JSON}" ]]; then
	report_violation "missing package.json"
fi

if [[ ! -f "${CI_WORKFLOW}" ]]; then
	report_violation "missing .github/workflows/ci.yml"
fi

if [[ -f "${LEDGER}" ]]; then
	node - "${LEDGER}" <<'NODE'
const [ledgerPath] = process.argv.slice(2);
const ledger = JSON.parse(require("node:fs").readFileSync(ledgerPath, "utf8"));
const entry = ledger.capabilities.find((cap) => cap.id === "tool/read_media");
if (!entry) {
  console.error("[check-no-ts-read-media] missing capability tool/read_media");
  process.exit(1);
}
const allowedStates = new Set(["rust_impl", "authority_rust"]);
if (!allowedStates.has(entry.state)) {
  console.error(
    `[check-no-ts-read-media] tool/read_media is ${entry.state}; expected rust_impl or authority_rust`
  );
  process.exit(1);
}
if (!entry.differentialTest?.includes("smart_reader_mcp_differential")) {
  console.error(
    "[check-no-ts-read-media] tool/read_media must reference smart_reader_mcp_differential harness"
  );
  process.exit(1);
}
if (!entry.notes?.includes("S4")) {
  console.error("[check-no-ts-read-media] tool/read_media notes must document S4 authority routing");
  process.exit(1);
}
NODE
fi

if [[ -f "${PACKAGE_JSON}" ]]; then
	if ! grep -q 'check:no-ts-read-media' "${PACKAGE_JSON}"; then
		report_violation "package.json must expose check:no-ts-read-media script"
	fi
fi

if [[ -f "${CI_WORKFLOW}" ]]; then
	if ! grep -q 'check-no-ts-read-media.sh' "${CI_WORKFLOW}"; then
		report_violation "ci.yml must run scripts/check-no-ts-read-media.sh"
	fi
fi

if [[ -f "${RUST_ENGINE}" ]]; then
	if ! grep -q 'shouldUseRustReadMediaEngine' "${RUST_ENGINE}"; then
		report_violation "rust-read-media.ts must export shouldUseRustReadMediaEngine"
	fi

	if ! grep -q 'readMediaViaRustEngine' "${RUST_ENGINE}"; then
		report_violation "rust-read-media.ts must export readMediaViaRustEngine"
	fi

	if ! grep -q "SMART_READER_USE_RUST_READ_MEDIA !== 'ts'" "${RUST_ENGINE}"; then
		report_violation "rust-read-media.ts must default to Rust unless SMART_READER_USE_RUST_READ_MEDIA=ts"
	fi

	if ! grep -q "tool: 'read_media'" "${RUST_ENGINE}"; then
		report_violation "rust-read-media.ts must invoke smart-reader-cli read_media route"
	fi
fi

if [[ -f "${HANDLER}" ]]; then
	if ! grep -q 'shouldUseRustReadMediaEngine' "${HANDLER}"; then
		report_violation "readMedia.ts must gate on shouldUseRustReadMediaEngine"
	fi

	if ! grep -q 'readMediaViaRustEngine' "${HANDLER}"; then
		report_violation "readMedia.ts must delegate baseline path to readMediaViaRustEngine"
	fi

	if ! grep -q 'useRustAuthority' "${HANDLER}"; then
		report_violation "readMedia.ts must isolate Rust authority from injected test mocks"
	fi

	handler_block="$(sed -n '/\.handler(async ({ input }) => {/,/^    });/p' "${HANDLER}")"
	if [[ -z "${handler_block}" ]]; then
		report_violation "readMedia.ts handler block not found"
	else
		if ! grep -q 'useRustAuthority' <<<"${handler_block}"; then
			report_violation "readMedia.ts handler must branch on useRustAuthority before TS sniff/delegation"
		fi

		if ! grep -q 'readMediaViaRustEngine' <<<"${handler_block}"; then
			report_violation "readMedia.ts handler must call readMediaViaRustEngine on the authority branch"
		fi

		rust_line="$(grep -n 'readMediaViaRustEngine' <<<"${handler_block}" | head -n1 | cut -d: -f1)"
		sniff_line="$(grep -n 'sniff(sourcePath)' <<<"${handler_block}" | head -n1 | cut -d: -f1)"
		if [[ -n "${rust_line}" && -n "${sniff_line}" && "${sniff_line}" -lt "${rust_line}" ]]; then
			report_violation "readMedia.ts must not run TS sniff/delegation before Rust authority branch"
		fi
	fi
fi

if [[ -f "${TOOL_ROUTES}" ]]; then
	if ! grep -q '"read_media"' "${TOOL_ROUTES}"; then
		report_violation "tool_routes.rs must map read_media"
	fi

	if ! grep -q 'RustCore' "${TOOL_ROUTES}"; then
		report_violation "tool_routes.rs must route read_media through RustCore"
	fi
fi

if [[ -f "${RMCP_HANDLER}" ]]; then
	if ! grep -q 'read_media_from_value' "${RMCP_HANDLER}"; then
		report_violation "rmcp read_media handler must delegate to smart-reader-core read_media_from_value"
	fi
fi

if [[ "${violations}" -gt 0 ]]; then
	echo ""
	echo "FAIL: ${violations} default-path TS read_media authority violation(s)."
	echo "Authority: crates/smart-reader-core via src/engine/rust-read-media.ts and rmcp handler."
	exit 1
fi

echo "PASS: read_media baseline handler routes through Rust core authority."