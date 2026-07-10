import { beforeAll, describe, expect, it } from 'bun:test';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { execSync, spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { createReadMediaHandler } from '../src/handlers/readMedia.js';

const repoRoot = path.resolve(import.meta.dirname, '..');
const fixturesRoot = path.join(repoRoot, 'test/fixtures');
const goldenPath = path.join(fixturesRoot, 'read-media-golden.json');

const MINIMAL_PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

type GoldenCase = {
  id: string;
  fixture: string;
  mock_reader?: string;
  expects: {
    error?: boolean;
    message_contains?: string;
    envelope?: Record<string, unknown>;
  };
};

type GoldenManifest = {
  profile: string;
  mock_readers: Record<
    string,
    {
      response: Record<string, unknown>;
      raw_result: Record<string, unknown>;
    }
  >;
  cases: GoldenCase[];
};

const normalizeEnvelope = (envelope: Record<string, unknown>) => {
  const normalized = structuredClone(envelope);
  delete normalized.sourceHash;
  if (normalized.freshness && typeof normalized.freshness === 'object') {
    (normalized.freshness as Record<string, unknown>).indexedAt = 'NORMALIZED';
  }
  for (const key of ['subject', 'source'] as const) {
    if (typeof normalized[key] === 'string') {
      normalized[key] = path
        .relative(fixturesRoot, normalized[key] as string)
        .split(path.sep)
        .join('/');
    }
  }
  if (normalized.delegation && typeof normalized.delegation === 'object') {
    const delegation = normalized.delegation as Record<string, unknown>;
    if (typeof delegation.source_path === 'string') {
      delegation.source_path = path
        .relative(fixturesRoot, delegation.source_path)
        .split(path.sep)
        .join('/');
    }
  }
  if (normalized.locator && typeof normalized.locator === 'object') {
    const locator = normalized.locator as Record<string, unknown>;
    if (typeof locator.path === 'string') {
      locator.path = path
        .relative(fixturesRoot, locator.path)
        .split(path.sep)
        .join('/');
    }
  }
  if (normalized.routing && typeof normalized.routing === 'object') {
    const routing = normalized.routing as Record<string, unknown>;
    delete routing.alternatives;
    delete routing.selection_reason;
  }
  return normalized;
};

const writeMockCli = (dir: string, name: string, response: Record<string, unknown>) => {
  const cli = path.join(dir, name);
  const payload = JSON.stringify(response).replace(/'/g, "'\\''");
  writeFileSync(
    cli,
    `#!/usr/bin/env bash\nset -euo pipefail\nread -r _request\nprintf '%s\\n' '${payload}'\n`
  );
  chmodSync(cli, 0o755);
  return cli;
};

describe('read_media golden parity', () => {
  let golden: GoldenManifest;
  let mockDir: string;
  let mockClis: Record<string, string>;

  beforeAll(() => {
    golden = JSON.parse(readFileSync(goldenPath, 'utf8')) as GoldenManifest;
    expect(golden.profile).toBe('smart_reader_read_media_golden');

    const samplePng = path.join(fixturesRoot, 'sample.png');
    if (!existsSync(samplePng)) {
      writeFileSync(samplePng, MINIMAL_PNG);
    }

    mockDir = mkdtempSync(path.join(os.tmpdir(), 'smart-reader-mock-readers-'));
    mockClis = {
      pdf: writeMockCli(mockDir, 'pdf-reader-cli', golden.mock_readers.pdf.response),
      image: writeMockCli(mockDir, 'image-reader-cli', golden.mock_readers.image.response),
      video: writeMockCli(mockDir, 'video-reader-cli', golden.mock_readers.video.response),
    };

    execSync('cargo build --release -p smart-reader-core -p smart-reader-cli', {
      cwd: repoRoot,
      stdio: 'pipe',
      timeout: 300_000,
    });
  }, 300_000);

  it('documents all corpus-manifest cases in the golden matrix', () => {
    const corpus = JSON.parse(
      readFileSync(path.join(fixturesRoot, 'corpus-manifest.json'), 'utf8')
    ) as { cases: Array<{ id: string }> };
    for (const entry of corpus.cases) {
      expect(golden.cases.some((caseEntry) => caseEntry.id === entry.id)).toBe(true);
    }
  });

  for (const caseId of [
    'pdf',
    'image',
    'video',
    'mislabeled-png-as-pdf',
    'unsupported',
  ] as const) {
    it(`Rust core matches golden contract for ${caseId}`, () => {
      const caseEntry = golden.cases.find((entry) => entry.id === caseId);
      expect(caseEntry).toBeDefined();

      const fixturePath = path.join(fixturesRoot, caseEntry!.fixture);
      const probe = spawnSync(
        path.join(repoRoot, 'target/release/smart-reader-cli'),
        [],
        {
          cwd: repoRoot,
          encoding: 'utf8',
          env: {
            ...process.env,
            SMART_READER_PDF_CLI: mockClis.pdf,
            SMART_READER_IMAGE_CLI: mockClis.image,
            SMART_READER_VIDEO_CLI: mockClis.video,
          },
          input: JSON.stringify({
            tool: 'read_media',
            input: { path: fixturePath },
          }),
          timeout: 30_000,
        }
      );

      if (caseEntry!.expects.error) {
        expect(probe.status).toBe(0);
        const envelope = JSON.parse(probe.stdout) as { status?: string; message?: string };
        expect(envelope.status).toBe('error');
        expect(envelope.message?.toLowerCase()).toContain(
          caseEntry!.expects.message_contains?.toLowerCase()
        );
        return;
      }

      expect(probe.status).toBe(0);
      const envelope = JSON.parse(probe.stdout) as {
        status: string;
        route: string;
        envelope: Record<string, unknown>;
      };
      expect(envelope.status).toBe('ok');
      expect(envelope.route).toBe('rust-read-media-v1');

      const actual = normalizeEnvelope(envelope.envelope);
      const expected = normalizeEnvelope(caseEntry!.expects.envelope as Record<string, unknown>);

      for (const pointer of [
        'locator',
        'route',
        'delegation',
        'routing',
        'warnings',
        'result',
      ] as const) {
        expect(actual[pointer]).toEqual(expected[pointer]);
      }
    });
  }

  it('TS handler mock delegation aligns with golden mislabeled envelope contract', async () => {
    const caseEntry = golden.cases.find((entry) => entry.id === 'mislabeled-png-as-pdf');
    expect(caseEntry).toBeDefined();

    const fixturePath = path.join(fixturesRoot, caseEntry!.fixture);
    const handler = createReadMediaHandler({
      sniffFormat: async () => ({
        category: 'image',
        format: 'image/png',
        mimeType: 'image/png',
        route: 'rust-sniff',
      }),
      delegateToReader: async () => ({
        delegated_tool: 'read_image',
        raw_result: golden.mock_readers.image.raw_result,
        launch: {
          command: process.execPath,
          args: ['/tmp/image-reader-mcp'],
          source: 'local',
          packageName: '@sylphx/image-reader-mcp',
        },
      }),
    });

    const result = await handler.handler({
      input: { path: fixturePath },
      ctx: {},
    });

    const responseText =
      'content' in result
        ? (result as { content: Array<{ text: string }> }).content[0]?.text
        : (result as { text: string }).text;
    expect(responseText).toBeDefined();

    const actual = normalizeEnvelope(JSON.parse(responseText!) as Record<string, unknown>);
    const expected = normalizeEnvelope(caseEntry!.expects.envelope as Record<string, unknown>);
    expect(actual.route).toEqual(expected.route);
    expect(actual.delegation).toEqual(expected.delegation);
    expect(actual.routing).toMatchObject({
      selected_category: 'image',
      sniff_method: 'rust-sniff',
      launch_source: 'local',
      reader_package: '@sylphx/image-reader-mcp',
      declared_extension: '.pdf',
    });
    expect(actual.warnings).toEqual(expected.warnings);
    expect(actual.result).toEqual(expected.result);
  });
});