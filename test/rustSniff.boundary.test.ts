import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createReadMediaHandler } from '../src/handlers/readMedia.js';
import { sniffFormat } from '../src/sniff/formatSniffer.js';

const repoRoot = path.resolve(import.meta.dirname, '..');
const mislabeledPath = path.join(import.meta.dirname, 'fixtures', 'mislabeled', 'png-as-pdf.pdf');

describe('rust sniff engine boundary', () => {
  beforeAll(() => {
    const mislabeledDir = path.dirname(mislabeledPath);
    mkdirSync(mislabeledDir, { recursive: true });
    writeFileSync(
      mislabeledPath,
      Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
        0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90,
        0x77, 0x53, 0xde, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8,
        0xcf, 0xc0, 0x00, 0x00, 0x03, 0x01, 0x01, 0x00, 0x18, 0xdd, 0x8d, 0xb4, 0x00, 0x00, 0x00,
        0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
      ])
    );
    execSync('cargo build -q', { cwd: repoRoot, stdio: 'pipe', timeout: 120_000 });
    delete process.env.SMART_READER_USE_RUST_SNIFF;
  }, 120_000);

  afterAll(() => {
    delete process.env.SMART_READER_USE_RUST_SNIFF;
  });

  it('enables the Rust engine by default when the CLI is built', async () => {
    const { isRustCliAvailable, shouldUseRustSniffEngine } = await import(
      '../src/engine/rust-sniff.js'
    );
    expect(isRustCliAvailable()).toBe(true);
    expect(shouldUseRustSniffEngine()).toBe(true);
  });

  it('delegates magic-byte sniffing to the Rust CLI', async () => {
    const sniffed = await sniffFormat(mislabeledPath);
    expect(sniffed.format).toBe('image/png');
    expect(sniffed.category).toBe('image');
    expect(sniffed.route).toBe('rust-sniff');
  });

  it('rejects parent traversal via the Rust path policy core', async () => {
    const handler = createReadMediaHandler();
    const result = await handler.handler({
      input: { path: '../outside.pdf' },
      ctx: {},
    });

    expect('isError' in result && result.isError).toBe(true);
    const textBlock = (result as { content: Array<{ text: string }> }).content[0];
    expect(textBlock.text).toContain('Path traversal');
  });

  it('records rust-sniff route in the read_media envelope', async () => {
    const handler = createReadMediaHandler({
      delegateToReader: async () => ({
        delegated_tool: 'read_image',
        raw_result: { mime: 'image/png' },
        launch: {
          command: process.execPath,
          args: ['/tmp/image-reader-mcp'],
          source: 'local',
          packageName: '@sylphx/image-reader-mcp',
        },
      }),
    });

    const result = await handler.handler({
      input: { path: mislabeledPath },
      ctx: {},
    });

    const responseText =
      'content' in result
        ? (result as { content: Array<{ text: string }> }).content[0]?.text
        : (result as { text: string }).text;
    if (!responseText) {
      throw new Error('Expected read_media response text');
    }
    const envelope = JSON.parse(responseText) as {
      route: { sniff: string };
      delegation: { detected_format: string; contract_version: string };
      routing: { sniff_method: string; selected_category: string; selection_reason: string };
    };

    expect(envelope.route.sniff).toBe('rust-sniff');
    expect(envelope.delegation.detected_format).toBe('image/png');
    expect(envelope.delegation.contract_version).toBe('smart-reader-delegation-v1');
    expect(envelope.routing.sniff_method).toBe('rust-sniff');
    expect(envelope.routing.selected_category).toBe('image');
    expect(envelope.routing.selection_reason).toContain('overrides declared extension');
  });
});
