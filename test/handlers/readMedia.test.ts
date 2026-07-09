import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ReaderUnavailableError } from '../../src/delegate/delegateToReader.js';
import { createReadMediaHandler } from '../../src/handlers/readMedia.js';
import type { SniffResult } from '../../src/sniff/formatSniffer.js';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => Bun.$`rm -rf ${dir}`.quiet()));
});

const createTempPdf = async (): Promise<string> => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'smart-reader-'));
  tempDirs.push(dir);
  const filePath = path.join(dir, 'sample.pdf');
  await writeFile(filePath, '%PDF-1.7\n%âãÏÓ\n1 0 obj\n<<>>\nendobj\n');
  return filePath;
};

const pdfSniff = (): SniffResult => ({
  category: 'pdf',
  format: 'pdf',
  mimeType: 'application/pdf',
});

describe('readMedia handler', () => {
  test('returns normalized envelope with mocked delegation', async () => {
    const filePath = await createTempPdf();
    const handler = createReadMediaHandler({
      sniffFormat: async () => pdfSniff(),
      delegateToReader: async () => ({
        delegated_tool: 'read_pdf',
        raw_result: { pages: 1, title: 'mock' },
        launch: {
          command: process.execPath,
          args: ['/tmp/pdf-reader-mcp'],
          source: 'local',
          packageName: '@sylphx/pdf-reader-mcp',
        },
      }),
    });

    const result = await handler.handler({
      input: { path: filePath },
      ctx: {},
    });

    const responseText =
      'content' in result
        ? (result as { content: Array<{ text: string }> }).content[0]?.text
        : (result as { text: string }).text;
    expect(responseText).toBeDefined();
    const envelope = JSON.parse(responseText!) as {
      subject: string;
      sourceHash: string;
      locator: { path: string; detectedFormat: string };
      route: { sniff: string; delegation: string };
      delegation: { delegated_tool: string; detected_format: string; source_path: string };
      result: { pages: number; title: string };
      nextActions: string[];
    };

    expect(envelope.subject).toBe(path.resolve(filePath));
    expect(envelope.locator.detectedFormat).toBe('pdf');
    expect(envelope.delegation.delegated_tool).toBe('read_pdf');
    expect(envelope.route.delegation).toBe('read_pdf');
    expect(envelope.sourceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(envelope.result.pages).toBe(1);
    expect(envelope.result.title).toBe('mock');
    expect(envelope.nextActions.length).toBeGreaterThan(0);
  });

  test('returns informative error when delegation is unavailable', async () => {
    const filePath = await createTempPdf();
    const handler = createReadMediaHandler({
      sniffFormat: async () => pdfSniff(),
      delegateToReader: async () => {
        throw new ReaderUnavailableError('pdf', '@sylphx/pdf-reader-mcp');
      },
    });

    const result = await handler.handler({
      input: { path: filePath },
      ctx: {},
    });

    expect('isError' in result && result.isError).toBe(true);
    const textBlock = (result as { content: Array<{ text: string }> }).content[0];
    expect(textBlock.text).toContain('@sylphx/pdf-reader-mcp');
    expect(textBlock.text).toContain('not available');
  });

  test('returns error for missing files', async () => {
    const handler = createReadMediaHandler();
    const result = await handler.handler({
      input: { path: '/tmp/does-not-exist-smart-reader.pdf' },
      ctx: {},
    });

    expect('isError' in result && result.isError).toBe(true);
    const textBlock = (result as { content: Array<{ text: string }> }).content[0];
    expect(textBlock.text).toContain('File not found');
  });
});
