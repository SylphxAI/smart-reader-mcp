import { describe, expect, test } from 'bun:test';
import {
  buildNpxPackageSpecifier,
  delegateToReader,
  READER_DELEGATION,
  ReaderUnavailableError,
  resolveReaderLaunchSpec,
} from '../../src/delegate/delegateToReader.js';

describe('resolveReaderLaunchSpec', () => {
  test('maps each media category to the expected sibling package', () => {
    expect(READER_DELEGATION.pdf.packageName).toBe('@sylphx/pdf-reader-mcp');
    expect(READER_DELEGATION.image.toolName).toBe('read_image');
    expect(READER_DELEGATION.video.binName).toBe('video-reader-mcp');
  });

  test('pins npx fallback to optionalDependency versions for known siblings', () => {
    expect(buildNpxPackageSpecifier('@sylphx/pdf-reader-mcp')).toBe(
      '@sylphx/pdf-reader-mcp@3.0.14'
    );
    expect(buildNpxPackageSpecifier('@sylphx/image-reader-mcp')).toBe(
      '@sylphx/image-reader-mcp@0.1.0'
    );
    expect(buildNpxPackageSpecifier('@sylphx/video-reader-mcp')).toBe(
      '@sylphx/video-reader-mcp@0.1.0'
    );
  });

  test('returns npx launch spec when local package is unavailable', () => {
    const launch = resolveReaderLaunchSpec({
      packageName: '@sylphx/definitely-missing-reader-mcp',
      binName: 'missing-reader-mcp',
      toolName: 'read_pdf',
    });

    expect(launch).toEqual({
      command: 'npx',
      args: ['-y', '@sylphx/definitely-missing-reader-mcp'],
      source: 'npx',
      packageName: '@sylphx/definitely-missing-reader-mcp',
    });
  });
});

describe('delegateToReader', () => {
  test('builds read_pdf arguments for PDF sources', async () => {
    let capturedArgs: Record<string, unknown> | undefined;

    const result = await delegateToReader({
      category: 'pdf',
      sourcePath: '/tmp/report.pdf',
      resolveLaunchSpec: () => ({
        command: process.execPath,
        args: ['/tmp/pdf-reader-mcp'],
        source: 'local',
        packageName: '@sylphx/pdf-reader-mcp',
      }),
      callTool: async ({ toolArgs }) => {
        capturedArgs = toolArgs;
        return { ok: true };
      },
    });

    expect(capturedArgs).toEqual({ sources: [{ path: '/tmp/report.pdf' }] });
    expect(result.delegated_tool).toBe('read_pdf');
    expect(result.raw_result).toEqual({ ok: true });
  });

  test('builds read_video sources arguments for video delegation', async () => {
    let capturedArgs: Record<string, unknown> | undefined;

    await delegateToReader({
      category: 'video',
      sourcePath: '/tmp/clip.mp4',
      resolveLaunchSpec: () => ({
        command: process.execPath,
        args: ['/tmp/video-reader-mcp'],
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

  test('wraps call failures as ReaderUnavailableError', async () => {
    await expect(
      delegateToReader({
        category: 'image',
        sourcePath: '/tmp/frame.png',
        resolveLaunchSpec: () => ({
          command: process.execPath,
          args: ['/tmp/image-reader-mcp'],
          source: 'local',
          packageName: '@sylphx/image-reader-mcp',
        }),
        callTool: async () => {
          throw new Error('stdio handshake failed');
        },
      })
    ).rejects.toBeInstanceOf(ReaderUnavailableError);
  });
});
