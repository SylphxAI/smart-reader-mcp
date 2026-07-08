import { describe, expect, test } from 'bun:test';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { delegateToReader } from '../../src/delegate/delegateToReader.js';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const videoReaderEntry = path.resolve(repoRoot, '../video-reader-mcp/dist/index.js');
const videoFixture = path.resolve(repoRoot, 'test/fixtures/sample.mp4');

const hasFfprobe = async (): Promise<boolean> => {
  try {
    const proc = Bun.spawn(['ffprobe', '-version'], { stdout: 'ignore', stderr: 'ignore' });
    return (await proc.exited) === 0;
  } catch {
    return false;
  }
};

describe('delegateToReader integration', () => {
  test('builds read_video sources arguments for video delegation', async () => {
    let capturedArgs: Record<string, unknown> | undefined;

    await delegateToReader({
      category: 'video',
      sourcePath: '/tmp/clip.mp4',
      resolveLaunchSpec: () => ({
        command: process.execPath,
        args: [videoReaderEntry],
        source: 'local',
        packageName: '@sylphx/video-reader-mcp',
      }),
      callTool: async ({ toolArgs }) => {
        capturedArgs = toolArgs;
        return { timeline: { streams: [] } };
      },
    });

    expect(capturedArgs).toEqual({ sources: [{ path: '/tmp/clip.mp4' }] });
  });

  test('delegates to read_video on a real fixture via stdio MCP', async () => {
    if (!(await hasFfprobe())) {
      return;
    }

    await access(videoReaderEntry);
    await access(videoFixture);

    const result = await delegateToReader({
      category: 'video',
      sourcePath: videoFixture,
      resolveLaunchSpec: () => ({
        command: process.execPath,
        args: [videoReaderEntry],
        source: 'local',
        packageName: '@sylphx/video-reader-mcp',
      }),
    });

    expect(result.delegated_tool).toBe('read_video');
    const payload = result.raw_result as {
      results?: Array<{ success: boolean; data?: { streams?: unknown[]; format?: unknown } }>;
    };
    expect(payload.results?.[0]?.success).toBe(true);
    expect(payload.results?.[0]?.data?.format).toBeDefined();
    expect((payload.results?.[0]?.data?.streams?.length ?? 0) >= 1).toBe(true);
  });
});
