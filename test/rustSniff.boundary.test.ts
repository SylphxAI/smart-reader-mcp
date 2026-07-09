import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createReadMediaHandler } from '../src/handlers/readMedia.js';
import { sniffFormat } from '../src/sniff/formatSniffer.js';

const repoRoot = path.resolve(import.meta.dirname, '..');
const mislabeledPath = path.join(import.meta.dirname, 'fixtures', 'mislabeled', 'png-as-pdf.pdf');

describe('rust sniff engine boundary', () => {
  beforeAll(() => {
    execSync('cargo build -q', { cwd: repoRoot, stdio: 'pipe', timeout: 120_000 });
    process.env.SMART_READER_USE_RUST_SNIFF = '1';
  }, 120_000);

  afterAll(() => {
    delete process.env.SMART_READER_USE_RUST_SNIFF;
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
      delegation: { detected_format: string };
    };

    expect(envelope.route.sniff).toBe('rust-sniff');
    expect(envelope.delegation.detected_format).toBe('image/png');
  });

  it('keeps sniff logic out of the TypeScript adapter sources', () => {
    const handlerSrc = readFileSync(path.join(repoRoot, 'src/handlers/readMedia.ts'), 'utf8');
    const snifferSrc = readFileSync(path.join(repoRoot, 'src/sniff/formatSniffer.ts'), 'utf8');
    const engineSrc = readFileSync(path.join(repoRoot, 'src/engine/rust-sniff.ts'), 'utf8');

    expect(engineSrc).toContain('spawnSync');
    expect(handlerSrc).toContain('resolveMediaPathViaRustEngine');
    expect(handlerSrc).not.toMatch(/0x89,\s*0x50,\s*0x4e,\s*0x47/);
    expect(snifferSrc).toContain('sniffFormatViaRustEngine');
    expect(snifferSrc).toContain('shouldUseRustSniffEngine');
  });
});
