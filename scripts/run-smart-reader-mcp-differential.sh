#!/usr/bin/env bash
# smart-reader-mcp read_media differential parity — TS contract oracle vs Rust core/rmcp SSOT.
# Slice: read-media (tick015 main-bound land). Fail-closed: requires bun (no SKIP-as-pass).
# Allow-list: only proven tool `read_media`. No HTTP transport claimed.
# See PARITY-VERIFICATION-STANDARD.md, DECISION-001 / rej-010.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRATCH="${SCRATCH_DIR:-/tmp/smart-reader-mcp-differential}"
mkdir -p "$SCRATCH"
LOG="$SCRATCH/differential.log"
ARTIFACT="$SCRATCH/verification.json"
ORACLE_JSON="$SCRATCH/oracle.json"
SLICE_FILTER="read-media"
: >"$LOG"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --slice)
      SLICE_FILTER="${2:-}"
      shift 2
      ;;
    *)
      echo "::error::unknown argument: $1" | tee -a "$LOG"
      exit 1
      ;;
  esac
done

case "$SLICE_FILTER" in
  all|read-media) ;;
  *)
    echo "::error::invalid --slice value: $SLICE_FILTER (supported: read-media|all)" | tee -a "$LOG"
    exit 1
    ;;
esac

cd "$REPO_ROOT"

if ! command -v bun >/dev/null 2>&1; then
  echo "::error::bun required for smart-reader-mcp differential parity — no SKIP-as-pass" | tee -a "$LOG"
  exit 1
fi

echo "=== smart-reader-mcp differential parity $(date -Iseconds) slice=$SLICE_FILTER ===" | tee -a "$LOG"

echo "--- build TypeScript (oracle imports src/) ---" | tee -a "$LOG"
bun run build 2>&1 | tee -a "$LOG"

echo "--- build Rust core + rmcp server ---" | tee -a "$LOG"
cargo build -p smart-reader-core -p smart-reader-mcp-server 2>&1 | tee -a "$LOG"

echo "--- TS contract oracle (read_media allow-list) ---" | tee -a "$LOG"
bun run "$REPO_ROOT/scripts/differential/smart-reader-mcp-oracle.ts" >"$ORACLE_JSON" 2>>"$LOG"

run_rust_slice_test() {
  local label="$1"
  local test_name="$2"
  echo "--- Rust bounded slice: $label ---" | tee -a "$LOG"
  SMART_READER_MCP_ORACLE_JSON="$ORACLE_JSON" \
    cargo test -p smart-reader-mcp-server --test smart_reader_mcp_differential "$test_name" -- --nocapture 2>&1 | tee -a "$LOG"
}

case "$SLICE_FILTER" in
  read-media)
    run_rust_slice_test "read-media" read_media_differential_matches_ts_oracle
    ;;
  all)
    run_rust_slice_test "all" smart_reader_mcp_differential_matches_ts_oracle
    ;;
esac

CANDIDATE_SHA="${CANDIDATE_SHA:-$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || echo unknown)}"
BASELINE_TS_SHA="$(git -C "$REPO_ROOT" log -1 --format=%H -- scripts/differential src/handlers/readMedia.ts src/sniff 2>/dev/null || echo unknown)"
RUST_SHA="$CANDIDATE_SHA"
if command -v sha256sum >/dev/null 2>&1; then
  BEHAVIOR_SPEC_HASH="$(sha256sum "$REPO_ROOT/scripts/differential/fixtures/smart-reader-mcp-corpus.json" | awk '{print $1}')"
else
  BEHAVIOR_SPEC_HASH="$(shasum -a 256 "$REPO_ROOT/scripts/differential/fixtures/smart-reader-mcp-corpus.json" | awk '{print $1}')"
fi
FIXTURE_CORPUS_HASH="$(jq -r '.fixtureCorpusHash' "$ORACLE_JSON")"
CASE_COUNT="$(jq '.cases | length' "$ORACLE_JSON")"
READ_MEDIA_CASE_COUNT="$(jq '[.cases[] | select(.slice=="read-media")] | length' "$ORACLE_JSON")"

jq -n \
  --arg verifiedAt "$(date -Iseconds)" \
  --arg candidateSha "$CANDIDATE_SHA" \
  --arg baselineTsSha "$BASELINE_TS_SHA" \
  --arg rustCandidateSha "$RUST_SHA" \
  --arg behaviorSpecHash "$BEHAVIOR_SPEC_HASH" \
  --arg fixtureCorpusHash "$FIXTURE_CORPUS_HASH" \
  --argjson caseCount "$CASE_COUNT" \
  --argjson readMediaCaseCount "$READ_MEDIA_CASE_COUNT" \
  --arg sliceFilter "$SLICE_FILTER" \
  '{
    schemaVersion: 2,
    slice: ("smart-reader-mcp.tool.read_media|" + $sliceFilter),
    status: "differential_green",
    verifiedAt: $verifiedAt,
    lastComparedMainSha: $candidateSha,
    mergeGroupSha: $candidateSha,
    baselineTsSha: $baselineTsSha,
    rustCandidateSha: $rustCandidateSha,
    behaviorSpecHash: $behaviorSpecHash,
    fixtureCorpusHash: $fixtureCorpusHash,
    caseCount: $caseCount,
    readMediaCaseCount: $readMediaCaseCount,
    harness: "scripts/run-smart-reader-mcp-differential.sh",
    differentialTest: "crates/smart-reader-mcp-server/tests/smart_reader_mcp_differential.rs#read_media_differential_matches_ts_oracle",
    boundedSlices: {
      "read-media": "crates/smart-reader-mcp-server/tests/smart_reader_mcp_differential.rs#read_media_differential_matches_ts_oracle"
    },
    oracle: "scripts/differential/smart-reader-mcp-oracle.ts",
    allowList: ["read_media"],
    promotionPolicy: "NO_PROMOTIONS — differential_green recorded per rej-010; promotion_hold until prod_audit_pass; authority_rust NOT claimed; HTTP transport NOT claimed"
  }' >"$ARTIFACT"

echo "smart-reader-mcp-differential: OK (slice=$SLICE_FILTER cases=$CASE_COUNT read_media=$READ_MEDIA_CASE_COUNT corpus=$FIXTURE_CORPUS_HASH)" | tee -a "$LOG"
echo "verification artifact: $ARTIFACT" | tee -a "$LOG"
