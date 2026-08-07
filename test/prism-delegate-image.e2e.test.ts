import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { delegateToReader } from '../src/delegate/delegateToReader.js';
import { createReadMediaHandler } from '../src/handlers/readMedia.js';

const imageServer = join(
  import.meta.dir,
  '../../image-reader-mcp/target/debug/image-reader-mcp-server'
);
const png = join(import.meta.dir, '../../image-reader-mcp/test/fixtures/sample.png');

function extractText(result: unknown): string | undefined {
  if (!result || typeof result !== 'object') return undefined;
  const r = result as { type?: string; text?: string; content?: { type: string; text?: string }[] };
  if (r.type === 'text' && typeof r.text === 'string') return r.text;
  if (Array.isArray(r.content)) return r.content.find((c) => c.type === 'text')?.text;
  return undefined;
}

const canRun = existsSync(imageServer) && existsSync(png);

describe('Prism → Iris delegation e2e', () => {
  test.skipIf(!canRun)(
    'read_media on PNG returns envelope with delegated read_image payload',
    async () => {
      process.env.IMAGE_READER_MCP_RUST_BIN = imageServer;
      const readMedia = createReadMediaHandler({
        delegateToReader: (options: any) =>
          delegateToReader({
            ...options,
            resolveLaunchSpec: (config: any) => ({
              command: imageServer,
              args: [],
              source: 'local',
              packageName: config.packageName,
            }),
          }),
      });

      const result = await readMedia.handler({
        input: { path: png },
        ctx: {},
      });
      const body = extractText(result);
      expect(body).toBeTruthy();
      const envelope = JSON.parse(body as string) as {
        source?: string;
        locator?: { detectedFormat?: string };
        route?: { delegation?: string };
        delegation?: { delegated_tool?: string; reader_package?: string };
        raw_result?: unknown;
        rawResult?: unknown;
      };
      expect(envelope.route?.delegation ?? envelope.delegation?.delegated_tool).toBe('read_image');
      expect(envelope.locator?.detectedFormat).toBe('image/png');
      expect(envelope.source).toContain('sample.png');
      expect(envelope.delegation?.reader_package).toBe('@sylphx/iris');
      // sibling payload present under common keys
      const s = JSON.stringify(envelope);
      expect(s).toMatch(/dimensions|width|height/i);
    },
    90_000
  );
});
