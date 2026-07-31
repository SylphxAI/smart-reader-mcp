import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { delegateToReader } from '../src/delegate/delegateToReader.js';
import { createReadMediaHandler } from '../src/handlers/readMedia.js';

const videoServer = join(
  import.meta.dir,
  '../../video-reader-mcp/target/debug/video-reader-mcp-server'
);
const mp4 = join(import.meta.dir, '../../video-reader-mcp/test/fixtures/no-subtitle.mp4');

function extractText(result: unknown): string | undefined {
  if (!result || typeof result !== 'object') return undefined;
  const r = result as { type?: string; text?: string; content?: { type: string; text?: string }[] };
  if (r.type === 'text' && typeof r.text === 'string') return r.text;
  if (Array.isArray(r.content)) return r.content.find((c) => c.type === 'text')?.text;
  return undefined;
}

const canRun = existsSync(videoServer) && existsSync(mp4) && Bun.which('ffprobe') !== null;

describe('Prism → Cue delegation e2e', () => {
  test.skipIf(!canRun)(
    'read_media on MP4 returns envelope with delegated read_video payload',
    async () => {
      process.env.VIDEO_READER_MCP_RUST_BIN = videoServer;
      const readMedia = createReadMediaHandler({
        delegateToReader: (options: any) =>
          delegateToReader({
            ...options,
            resolveLaunchSpec: (config: any) => ({
              command: videoServer,
              args: [],
              source: 'local',
              packageName: config.packageName,
            }),
          }),
      });
      const result = await readMedia.handler({
        input: { path: mp4 },
        ctx: {},
      });
      const body = extractText(result);
      expect(body).toBeTruthy();
      const envelope = JSON.parse(body as string) as {
        locator?: { detectedFormat?: string };
        route?: { delegation?: string };
        delegation?: { delegated_tool?: string; reader_package?: string };
      };
      expect(envelope.route?.delegation ?? envelope.delegation?.delegated_tool).toBe('read_video');
      expect(envelope.locator?.detectedFormat).toMatch(/mp4|video/);
      expect(envelope.delegation?.reader_package).toBe('@sylphx/video-reader-mcp');
      const s = JSON.stringify(envelope);
      expect(s).toMatch(/duration|streams|format/i);
    },
    120_000
  );
});
