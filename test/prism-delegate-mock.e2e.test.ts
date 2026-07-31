import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { createReadMediaHandler } from '../src/handlers/readMedia.ts';
import { delegateToReader } from '../src/delegate/delegateToReader.ts';

const samplePdf = join(import.meta.dir, 'fixtures/sample.pdf');
const samplePng = join(import.meta.dir, 'fixtures/sample.png');
const sampleMp4 = join(import.meta.dir, 'fixtures/sample.mp4');

function extractText(result: unknown): string | undefined {
  if (!result || typeof result !== 'object') return undefined;
  const r = result as { type?: string; text?: string; content?: { type: string; text?: string }[] };
  if (r.type === 'text' && typeof r.text === 'string') return r.text;
  if (Array.isArray(r.content)) return r.content.find((c) => c.type === 'text')?.text;
  return undefined;
}

/** Always-on e2e: mock sibling MCP callTool, prove envelope route+locator without real natives. */
describe('Prism → mock sibling envelope e2e', () => {
  test('PDF path builds Citra-shaped envelope via mocked delegation', async () => {
    const readMedia = createReadMediaHandler({
      delegateToReader: (options) =>
        delegateToReader({
          ...options,
          resolveLaunchSpec: (config) => ({
            command: 'mock-reader',
            args: [],
            source: 'local',
            packageName: config.packageName,
          }),
          callTool: async ({ toolName, toolArgs }) => ({
            type: 'text',
            text: JSON.stringify({
              mock: true,
              tool: toolName,
              args: toolArgs,
              pages: [{ page: 1, text: 'hello' }],
            }),
          }),
        }),
    });
    const result = await readMedia.handler({ input: { path: samplePdf }, ctx: {} });
    const body = extractText(result);
    expect(body).toBeTruthy();
    const envelope = JSON.parse(body as string) as {
      locator?: { detectedFormat?: string };
      route?: { delegation?: string };
      delegation?: { delegated_tool?: string; reader_package?: string };
      result?: unknown;
    };
    expect(envelope.locator?.detectedFormat).toBe('pdf');
    expect(envelope.route?.delegation ?? envelope.delegation?.delegated_tool).toBe('read_pdf');
    expect(envelope.delegation?.reader_package).toBe('@sylphx/pdf-reader-mcp');
    expect(JSON.stringify(envelope)).toContain('mock');
  });

  test('image and video map to Iris/Cue tools under mock', async () => {
    const cases = [
      { path: samplePng, formatIncludes: 'image', tool: 'read_image', pkg: '@sylphx/image-reader-mcp' },
      { path: sampleMp4, formatIncludes: 'video', tool: 'read_video', pkg: '@sylphx/video-reader-mcp' },
    ] as const;
    for (const c of cases) {
      const readMedia = createReadMediaHandler({
        delegateToReader: (options) =>
          delegateToReader({
            ...options,
            resolveLaunchSpec: (config) => ({
              command: 'mock-reader',
              args: [],
              source: 'local',
              packageName: config.packageName,
            }),
            callTool: async ({ toolName }) => ({
              type: 'text',
              text: JSON.stringify({ mock: true, tool: toolName }),
            }),
          }),
      });
      const result = await readMedia.handler({ input: { path: c.path }, ctx: {} });
      const body = extractText(result);
      const envelope = JSON.parse(body as string) as {
        locator?: { detectedFormat?: string };
        route?: { delegation?: string };
        delegation?: { delegated_tool?: string; reader_package?: string };
      };
      expect(String(envelope.locator?.detectedFormat ?? '')).toContain(c.formatIncludes);
      expect(envelope.route?.delegation ?? envelope.delegation?.delegated_tool).toBe(c.tool);
      expect(envelope.delegation?.reader_package).toBe(c.pkg);
    }
  });
});
