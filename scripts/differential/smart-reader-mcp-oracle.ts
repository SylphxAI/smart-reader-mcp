#!/usr/bin/env bun
/**
 * TS contract oracle for smart-reader-mcp differential parity.
 *
 * Frozen baseline for rej-010 reproof:
 * - read_media golden envelopes via rust-read-media.ts (TS wrapper → smart-reader-cli)
 * - stdio/http transport routing contract (bin wrapper semantics)
 * - rmcp surface markers (stdio + streamable HTTP)
 * - HTTP probe expectations (executed live by Rust differential test)
 */
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readMediaViaRustEngine } from '../../src/engine/rust-read-media.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '../..');
const CORPUS_PATH = join(__dirname, 'fixtures/smart-reader-mcp-corpus.json');
const FIXTURES_ROOT = join(REPO_ROOT, 'test/fixtures');
const GOLDEN_PATH = join(FIXTURES_ROOT, 'read-media-golden.json');

const MINIMAL_PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

interface TransportContractCase {
  id: string;
  env: Record<string, string>;
  expect: { transport: string };
}

interface SurfaceContractCase {
  id: string;
  surface: 'bin' | 'stdio' | 'http';
  markers: string[];
}

interface ReadMediaCase {
  id: string;
  goldenId: string;
}

interface HttpProbeCase {
  id: string;
  kind: 'health' | 'initialize' | 'toolsList' | 'readMedia';
  path?: string;
  fixture?: string;
  expect: Record<string, unknown>;
}

interface StdioProbeCase {
  id: string;
  kind: 'initialize' | 'toolsList' | 'readMedia';
  goldenId?: string;
  expect?: Record<string, unknown>;
}

interface Corpus {
  corpusVersion: number;
  transportContractCases: TransportContractCase[];
  surfaceContractCases: SurfaceContractCase[];
  readMediaCases: ReadMediaCase[];
  stdioProbeCases: StdioProbeCase[];
  httpProbeCases: HttpProbeCase[];
  serverContract: {
    name: string;
    tools: string[];
  };
}

type GoldenCase = {
  id: string;
  fixture: string;
  expects: {
    error?: boolean;
    message_contains?: string;
    envelope?: Record<string, unknown>;
  };
};

type GoldenManifest = {
  mock_readers: Record<string, { response: Record<string, unknown> }>;
  cases: GoldenCase[];
};

export interface DifferentialCase {
  readonly id: string;
  readonly domain:
    | 'transportContract'
    | 'surfaceContract'
    | 'serverContract'
    | 'readMediaTool'
    | 'stdioProbe'
    | 'httpProbe';
  readonly input: Record<string, unknown>;
  readonly output: unknown;
}

function resolveTransport(env: Record<string, string | undefined>): string {
  if (env.SMART_READER_MCP_TRANSPORT) {
    return env.SMART_READER_MCP_TRANSPORT;
  }
  if (env.MCP_TRANSPORT) {
    return env.MCP_TRANSPORT;
  }
  return 'stdio';
}

function surfaceFile(surface: SurfaceContractCase['surface']): string {
  switch (surface) {
    case 'bin':
      return join(REPO_ROOT, 'bin/smart-reader-mcp');
    case 'stdio':
      return join(REPO_ROOT, 'crates/smart-reader-mcp-server/src/main.rs');
    case 'http':
      return join(REPO_ROOT, 'crates/smart-reader-mcp-server/src/http_transport.rs');
  }
}

function surfaceMarkers(surface: SurfaceContractCase): Record<string, boolean> {
  const content = readFileSync(surfaceFile(surface.surface), 'utf8');
  const markers: Record<string, boolean> = {};
  for (const marker of surface.markers) {
    markers[marker] = content.includes(marker);
  }
  return markers;
}

function fixtureCorpusHash(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

function normalizeEnvelope(envelope: Record<string, unknown>): Record<string, unknown> {
  const normalized = structuredClone(envelope);
  delete normalized.sourceHash;
  if (normalized.freshness && typeof normalized.freshness === 'object') {
    (normalized.freshness as Record<string, unknown>).indexedAt = 'NORMALIZED';
  }
  for (const key of ['subject', 'source'] as const) {
    if (typeof normalized[key] === 'string') {
      normalized[key] = relative(FIXTURES_ROOT, normalized[key] as string).split('\\').join('/');
    }
  }
  if (normalized.delegation && typeof normalized.delegation === 'object') {
    const delegation = normalized.delegation as Record<string, unknown>;
    if (typeof delegation.source_path === 'string') {
      delegation.source_path = relative(FIXTURES_ROOT, delegation.source_path)
        .split('\\')
        .join('/');
    }
  }
  if (normalized.locator && typeof normalized.locator === 'object') {
    const locator = normalized.locator as Record<string, unknown>;
    if (typeof locator.path === 'string') {
      locator.path = relative(FIXTURES_ROOT, locator.path).split('\\').join('/');
    }
  }
  if (normalized.routing && typeof normalized.routing === 'object') {
    const routing = normalized.routing as Record<string, unknown>;
    delete routing.alternatives;
    delete routing.selection_reason;
  }
  return normalized;
}

function writeMockCli(dir: string, name: string, response: Record<string, unknown>): string {
  const cli = join(dir, name);
  const payload = JSON.stringify(response).replace(/'/g, "'\\''");
  writeFileSync(
    cli,
    `#!/usr/bin/env bash\nset -euo pipefail\nread -r _request\nprintf '%s\\n' '${payload}'\n`
  );
  chmodSync(cli, 0o755);
  return cli;
}

function installMockReaders(
  dir: string,
  manifest: GoldenManifest
): { pdf: string; image: string; video: string } {
  return {
    pdf: writeMockCli(dir, 'pdf-reader-cli', manifest.mock_readers.pdf.response),
    image: writeMockCli(dir, 'image-reader-cli', manifest.mock_readers.image.response),
    video: writeMockCli(dir, 'video-reader-cli', manifest.mock_readers.video.response),
  };
}

async function main(): Promise<void> {
  const raw = await readFile(CORPUS_PATH, 'utf8');
  const corpus = JSON.parse(raw) as Corpus;
  if (corpus.corpusVersion !== 1) {
    throw new Error(`unsupported corpusVersion: ${corpus.corpusVersion}`);
  }

  const golden = JSON.parse(await readFile(GOLDEN_PATH, 'utf8')) as GoldenManifest;
  const samplePng = join(FIXTURES_ROOT, 'sample.png');
  if (!existsSync(samplePng)) {
    writeFileSync(samplePng, MINIMAL_PNG);
  }

  const mockDir = mkdtempSync(join(tmpdir(), 'smart-reader-differential-mock-'));
  const mockClis = installMockReaders(mockDir, golden);
  process.env.SMART_READER_PDF_CLI = mockClis.pdf;
  process.env.SMART_READER_IMAGE_CLI = mockClis.image;
  process.env.SMART_READER_VIDEO_CLI = mockClis.video;

  const packageJson = JSON.parse(
    await readFile(join(REPO_ROOT, 'package.json'), 'utf8')
  ) as { version: string };

  const cases: DifferentialCase[] = [];

  for (const testCase of corpus.transportContractCases) {
    cases.push({
      id: testCase.id,
      domain: 'transportContract',
      input: { env: testCase.env },
      output: { transport: resolveTransport(testCase.env) },
    });
  }

  for (const testCase of corpus.surfaceContractCases) {
    cases.push({
      id: testCase.id,
      domain: 'surfaceContract',
      input: { surface: testCase.surface, markers: testCase.markers },
      output: { markers: surfaceMarkers(testCase) },
    });
  }

  cases.push({
    id: 'server-contract-rmcp',
    domain: 'serverContract',
    input: { tools: corpus.serverContract.tools },
    output: {
      name: corpus.serverContract.name,
      version: packageJson.version,
      tools: corpus.serverContract.tools,
    },
  });

  for (const testCase of corpus.readMediaCases) {
    const goldenCase = golden.cases.find((entry) => entry.id === testCase.goldenId);
    if (!goldenCase) {
      throw new Error(`missing golden case ${testCase.goldenId}`);
    }

    const fixturePath = resolve(FIXTURES_ROOT, goldenCase.fixture);
    const result = readMediaViaRustEngine({ path: fixturePath });

    if (goldenCase.expects.error) {
      if (result.ok) {
        throw new Error(`TS oracle expected error for ${testCase.id}`);
      }
      const needle = goldenCase.expects.message_contains?.toLowerCase() ?? '';
      if (!result.message.toLowerCase().includes(needle)) {
        throw new Error(
          `TS oracle error message mismatch for ${testCase.id}: ${result.message}`
        );
      }
      cases.push({
        id: testCase.id,
        domain: 'readMediaTool',
        input: { fixture: goldenCase.fixture },
        output: {
          status: 'error',
          message_contains: goldenCase.expects.message_contains,
        },
      });
      continue;
    }

    if (!result.ok) {
      throw new Error(`TS oracle read_media failed for ${testCase.id}: ${result.message}`);
    }

    const envelope = normalizeEnvelope(JSON.parse(result.text) as Record<string, unknown>);
    const expected = normalizeEnvelope(goldenCase.expects.envelope as Record<string, unknown>);
    for (const pointer of [
      'locator',
      'route',
      'delegation',
      'routing',
      'warnings',
      'result',
    ] as const) {
      if (JSON.stringify(envelope[pointer]) !== JSON.stringify(expected[pointer])) {
        throw new Error(`TS oracle envelope mismatch for ${testCase.id} at ${pointer}`);
      }
    }

    cases.push({
      id: testCase.id,
      domain: 'readMediaTool',
      input: { fixture: goldenCase.fixture },
      output: {
        status: 'ok',
        route: 'rust-read-media-v1',
        envelope,
      },
    });
  }

  function stdioReadMediaOutput(goldenCase: GoldenCase): Record<string, unknown> {
    if (goldenCase.expects.error) {
      return {
        error: true,
        message_contains: goldenCase.expects.message_contains,
      };
    }

    const envelope = goldenCase.expects.envelope as Record<string, unknown>;
    const delegation = envelope.delegation as Record<string, unknown>;
    const routing = envelope.routing as Record<string, unknown>;
    return {
      route: goldenCase.expects.route ?? 'rust-read-media-v1',
      delegatedTool: delegation.delegated_tool,
      detectedFormat: delegation.detected_format,
      selectedCategory: routing.selected_category,
    };
  }

  for (const probe of corpus.stdioProbeCases) {
    if (probe.kind === 'initialize' || probe.kind === 'toolsList') {
      cases.push({
        id: probe.id,
        domain: 'stdioProbe',
        input: { kind: probe.kind },
        output: probe.expect ?? {},
      });
      continue;
    }

    const goldenCase = golden.cases.find((entry) => entry.id === probe.goldenId);
    if (!goldenCase) {
      throw new Error(`missing golden case for stdio probe ${probe.id}`);
    }
    cases.push({
      id: probe.id,
      domain: 'stdioProbe',
      input: { kind: probe.kind, fixture: goldenCase.fixture },
      output: stdioReadMediaOutput(goldenCase),
    });
  }

  for (const probe of corpus.httpProbeCases) {
    cases.push({
      id: probe.id,
      domain: 'httpProbe',
      input: {
        kind: probe.kind,
        ...(probe.path ? { path: probe.path } : {}),
        ...(probe.fixture ? { fixture: probe.fixture } : {}),
      },
      output: probe.expect,
    });
  }

  const payload = {
    corpusVersion: corpus.corpusVersion,
    fixtureCorpusHash: fixtureCorpusHash(raw),
    cases,
  };
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

await main();