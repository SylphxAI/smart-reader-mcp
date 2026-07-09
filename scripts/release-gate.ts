import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { runDoctor } from '../src/doctor.js';

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
  const pkg = readJson('package.json') as { version: string; bin?: Record<string, string> };
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

  const doctor = runDoctor(pkg.version);
  addCheck(
    checks,
    'doctor:node',
    doctor.checks.find((check) => check.id === 'node')?.status === 'ok',
    'doctor reports Node.js runtime is ready',
    { doctorStatus: doctor.status }
  );

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