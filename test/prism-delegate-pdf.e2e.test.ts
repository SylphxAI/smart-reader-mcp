import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { delegateToReader } from '../src/delegate/delegateToReader.ts';
import { createReadMediaHandler } from '../src/handlers/readMedia.ts';

const pdfServerCandidates = [
  join(import.meta.dir, '../../pdf-reader-mcp/bin/native/pdf-reader-mcp-server'),
  join(import.meta.dir, '../../pdf-reader-mcp/target/debug/pdf-reader-mcp-server'),
  join(import.meta.dir, '../../pdf-reader-mcp/target/release/pdf-reader-mcp-server'),
];
const pdfServer = pdfServerCandidates.find((p) => existsSync(p));
const samplePdf = join(import.meta.dir, '../../pdf-reader-mcp/test/fixtures/sample.pdf');

function extractText(result: unknown): string | undefined {
  if (!result || typeof result !== 'object') return undefined;
  const r = result as { type?: string; text?: string; content?: { type: string; text?: string }[] };
  if (r.type === 'text' && typeof r.text === 'string') return r.text;
  if (Array.isArray(r.content)) return r.content.find((c) => c.type === 'text')?.text;
  return undefined;
}

const canRun = Boolean(pdfServer && existsSync(samplePdf));

describe('Prism → Citra delegation e2e', () => {
  test.skipIf(!canRun)(
    'read_media on PDF returns envelope with delegated read_pdf payload',
    async () => {
      process.env.PDF_READER_MCP_RUST_BIN = pdfServer!;
      const readMedia = createReadMediaHandler({
        delegateToReader: (options) =>
          delegateToReader({
            ...options,
            resolveLaunchSpec: (config) => ({
              command: pdfServer!,
              args: [],
              source: 'local',
              packageName: config.packageName,
            }),
          }),
      });
      const result = await readMedia.handler({
        input: { path: samplePdf },
        ctx: {},
      });
      const body = extractText(result);
      expect(body).toBeTruthy();
      const envelope = JSON.parse(body as string) as {
        locator?: { detectedFormat?: string };
        route?: { delegation?: string };
        delegation?: { delegated_tool?: string; reader_package?: string };
      };
      expect(envelope.route?.delegation ?? envelope.delegation?.delegated_tool).toBe('read_pdf');
      expect(envelope.locator?.detectedFormat).toBe('pdf');
      expect(envelope.delegation?.reader_package).toBe('@sylphx/pdf-reader-mcp');
      const s = JSON.stringify(envelope);
      expect(s.length).toBeGreaterThan(100);
    },
    120_000
  );
});
