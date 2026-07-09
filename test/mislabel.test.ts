import { beforeAll, describe, expect, it } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { sniffFormat } from '../src/sniff/formatSniffer.js';
import { mislabelWarning } from '../src/sniff/mislabel.js';

const fixtureDir = path.join(import.meta.dirname, 'fixtures', 'mislabeled');
const mislabeledPath = path.join(fixtureDir, 'png-as-pdf.pdf');

const minimalPng = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
  0xde, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
  0x00, 0x03, 0x01, 0x01, 0x00, 0x18, 0xdd, 0x8d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
  0x44, 0xae, 0x42, 0x60, 0x82,
]);

beforeAll(async () => {
  await mkdir(fixtureDir, { recursive: true });
  await writeFile(mislabeledPath, minimalPng);
});

describe('mislabeled file routing', () => {
  it('sniffs PNG content despite a .pdf extension', async () => {
    const sniffed = await sniffFormat(mislabeledPath);
    expect(sniffed.format).toBe('image/png');
    expect(sniffed.category).toBe('image');
  });

  it('emits a routing-by-content warning for extension mismatch', async () => {
    const sniffed = await sniffFormat(mislabeledPath);
    const warning = mislabelWarning(mislabeledPath, sniffed);
    expect(warning).toContain('routing by content');
    expect(warning).toContain('image/png');
  });

  it('does not warn when extension matches sniffed format', () => {
    const warning = mislabelWarning('/tmp/photo.png', {
      category: 'image',
      format: 'image/png',
      mimeType: 'image/png',
    });
    expect(warning).toBeUndefined();
  });
});
