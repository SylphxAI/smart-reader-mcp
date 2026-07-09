import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execSync, spawnSync } from 'node:child_process';
import { DELEGATION_CONTRACT_VERSION } from '../src/delegate/delegationContract.js';
import { runDoctor } from '../src/doctor.js';
import { isRustCliAvailable, sniffFormatViaRustEngine } from '../src/engine/rust-sniff.js';

const ARTIFACT_DIR_ENV = 'MCP_SMART_READER_BENCHMARK_OUTPUT_DIR';
const DEFAULT_ARTIFACT_DIR = 'benchmark-artifacts';
const ARTIFACT_FILE = 'smart_reader_release_gate.json';

type GateStatus = 'passed' | 'failed';

interface GateCheck {
  id: string;
  status: GateStatus;
  message: string;
  evidence?: Record<string, unknown>;
}

interface ReleaseGateReport {
  profile: 'smart_reader_release_gate';
  generated_at: string;
  artifact_dir: string;
  status: GateStatus;
  summary: {
    total: number;
    passed: number;
    failed: number;
  };
  checks: GateCheck[];
}

const repoRoot = path.resolve(import.meta.dirname, '..');

const addCheck = (
  checks: GateCheck[],
  id: string,
  passed: boolean,
  message: string,
  evidence?: Record<string, unknown>
): void => {
  checks.push({
    id,
    status: passed ? 'passed' : 'failed',
    message,
    ...(evidence ? { evidence } : {}),
  });
};

const fileExists = (relativePath: string): boolean =>
  existsSync(path.join(repoRoot, relativePath));

const readJson = (relativePath: string): unknown =>
  JSON.parse(readFileSync(path.join(repoRoot, relativePath), 'utf8'));

export function buildReleaseGateReport(artifactDir: string): ReleaseGateReport {
  const checks: GateCheck[] = [];
  const pkg = readJson('package.json') as {
    version: string;
    bin?: Record<string, string>;
    dependencies?: Record<string, string>;
  };
  const manifest = readJson('test/fixtures/corpus-manifest.json') as {
    profile: string;
    cases: Array<{ id: string }>;
  };

  addCheck(
    checks,
    'package:read_media_bin',
    typeof pkg.bin?.['smart-reader-mcp'] === 'string',
    'package.json exposes the smart-reader-mcp bin entry',
    { bin: pkg.bin?.['smart-reader-mcp'] }
  );

  addCheck(
    checks,
    'contract:reader_evidence_dep',
    typeof pkg.dependencies?.['@sylphx/reader-evidence'] === 'string' &&
      (fileExists('node_modules/@sylphx/reader-evidence/src/envelope.ts') ||
        fileExists('node_modules/@sylphx/reader-evidence/src/index.ts')),
    'smart-reader depends on @sylphx/reader-evidence shared schema package',
    { dependency: pkg.dependencies?.['@sylphx/reader-evidence'] }
  );

  addCheck(
    checks,
    'fixtures:corpus_manifest',
    manifest.profile === 'smart_reader_fixture_corpus' && manifest.cases.length >= 5,
    'Fixture corpus documents pdf, image, video, mislabeled, and unsupported cases',
    { caseCount: manifest.cases.length }
  );

  for (const caseId of ['pdf', 'image', 'video', 'mislabeled-png-as-pdf', 'unsupported']) {
    addCheck(
      checks,
      `fixtures:case:${caseId}`,
      manifest.cases.some((entry) => entry.id === caseId),
      `Corpus manifest includes the ${caseId} case`
    );
  }

  addCheck(
    checks,
    'examples:pdf_request',
    fileExists('examples/read-media-pdf.json'),
    'examples/read-media-pdf.json documents a PDF read_media call'
  );

  addCheck(
    checks,
    'examples:image_request',
    fileExists('examples/read-media-image.json'),
    'examples/read-media-image.json documents an image read_media call'
  );

  addCheck(
    checks,
    'examples:video_request',
    fileExists('examples/read-media-video.json'),
    'examples/read-media-video.json documents a video read_media call'
  );

  addCheck(
    checks,
    'examples:unsupported_request',
    fileExists('examples/read-media-unsupported.json'),
    'examples/read-media-unsupported.json documents unsupported format handling'
  );

  addCheck(
    checks,
    'rust:sniff_core',
    fileExists('crates/smart-reader-core/src/sniff.rs'),
    'Rust smart-reader-core sniff engine is present'
  );

  addCheck(
    checks,
    'rust:policy_core',
    fileExists('crates/smart-reader-core/src/policy.rs'),
    'Rust smart-reader-core path policy engine is present'
  );

  try {
    execSync('cargo build --release', { cwd: repoRoot, stdio: 'pipe', timeout: 120_000 });
  } catch {
    // Release gate will report boundary failure if the CLI is still unavailable.
  }

  const doctor = runDoctor(pkg.version);
  addCheck(
    checks,
    'doctor:node',
    doctor.checks.find((check) => check.id === 'node')?.status === 'ok',
    'doctor reports Node.js runtime is ready',
    { doctorStatus: doctor.status }
  );

  addCheck(
    checks,
    'doctor:rust_sniff_default',
    doctor.checks.find((check) => check.id === 'rust_sniff_default')?.status === 'ok',
    'doctor reports Rust sniff/policy routing is enabled by default when the CLI is built',
    { rustCliAvailable: isRustCliAvailable() }
  );

  const mislabeledFixture = path.join(repoRoot, 'test/fixtures/mislabeled/png-as-pdf.pdf');
  let mislabeledFormat: string | undefined;
  try {
    if (isRustCliAvailable()) {
      const sniffed = sniffFormatViaRustEngine(mislabeledFixture);
      mislabeledFormat = sniffed.format;
    }
  } catch {
    mislabeledFormat = undefined;
  }

  addCheck(
    checks,
    'boundary:rust_sniff_mislabeled',
    mislabeledFormat === 'image/png',
    'Rust sniff engine routes mislabeled png-as-pdf.pdf to image/png by magic bytes',
    { detectedFormat: mislabeledFormat }
  );

  const sampleEnvelope = readJson('examples/sample-envelope.json') as {
    delegation?: { contract_version?: string };
    routing?: { contract_version?: string; alternatives?: unknown[] };
  };
  addCheck(
    checks,
    'contract:delegation_version',
    sampleEnvelope.delegation?.contract_version === DELEGATION_CONTRACT_VERSION &&
      sampleEnvelope.routing?.contract_version === DELEGATION_CONTRACT_VERSION,
    'Sample envelope documents the versioned smart-reader delegation contract',
    {
      delegationContract: sampleEnvelope.delegation?.contract_version,
      routingContract: sampleEnvelope.routing?.contract_version,
    }
  );

  addCheck(
    checks,
    'contract:routing_diagnostics',
    (sampleEnvelope.routing?.alternatives?.length ?? 0) >= 2,
    'Sample envelope documents routing diagnostics with non-selected reader alternatives',
    { alternativeCount: sampleEnvelope.routing?.alternatives?.length }
  );

  const binWrapper = readFileSync(path.join(repoRoot, 'bin/smart-reader-mcp'), 'utf8');
  addCheck(
    checks,
    'mcp:rust_adapter_default',
    binWrapper.includes('smart-reader-mcp-server') &&
      binWrapper.includes('resolve_rust_bin') &&
      binWrapper.includes('use_ts_transport'),
    'Default npm bin launches the Rust rmcp MCP server; TypeScript adapter is opt-in only'
  );

  const matrixProbe = spawnSync('bun', ['test', 'test/shippedPath.matrix.test.ts'], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      SMART_READER_ALLOW_LEGACY_ENGINE: '',
    },
    timeout: 300_000,
  });
  addCheck(
    checks,
    'boundary:rust_cli_engine',
    fileExists('crates/smart-reader-mcp-server/src/tool_routes.rs') && matrixProbe.status === 0,
    'Shipped-path matrix test proves primary tools route through Rust core without legacy runtime',
    matrixProbe.status === 0
      ? { exitCode: 0 }
      : {
          exitCode: matrixProbe.status,
          stderr: matrixProbe.stderr?.slice(-2000),
          stdout: matrixProbe.stdout?.slice(-2000),
        }
  );

  try {
    execSync('cargo build --release -p smart-reader-mcp-server', {
      cwd: repoRoot,
      stdio: 'pipe',
      timeout: 300_000,
    });
    addCheck(
      checks,
      'rust:mcp_server_crate',
      fileExists('target/release/smart-reader-mcp-server'),
      'smart-reader-mcp-server rmcp crate builds for release'
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    addCheck(checks, 'rust:mcp_server_crate', false, `smart-reader-mcp-server build failed: ${message}`);
  }

  const passed = checks.filter((check) => check.status === 'passed').length;
  const failed = checks.length - passed;

  return {
    profile: 'smart_reader_release_gate',
    generated_at: new Date().toISOString(),
    artifact_dir: artifactDir,
    status: failed === 0 ? 'passed' : 'failed',
    summary: {
      total: checks.length,
      passed,
      failed,
    },
    checks,
  };
}

function main(): void {
  const artifactDir = path.resolve(
    process.env[ARTIFACT_DIR_ENV] ?? path.join(repoRoot, DEFAULT_ARTIFACT_DIR)
  );

  const report = buildReleaseGateReport(artifactDir);
  mkdirSync(artifactDir, { recursive: true });
  const outputPath = path.join(artifactDir, ARTIFACT_FILE);

  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.error(`Smart reader release gate report written to ${outputPath}`);

  if (report.status !== 'passed') {
    for (const check of report.checks.filter((entry) => entry.status === 'failed')) {
      console.error(`[FAILED] ${check.id}: ${check.message}`);
    }
    process.exit(1);
  }
}

if (import.meta.main) {
  main();
}