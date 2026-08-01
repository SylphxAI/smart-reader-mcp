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
    expect(READER_DELEGATION.pdf.contractVersion).toBe('4.1.2');
    expect(READER_DELEGATION.image.contractVersion).toBe('0.1.7');
    expect(READER_DELEGATION.video.contractVersion).toBe('0.1.7');
  });

  test('pins npx fallback to optionalDependency versions for known siblings', () => {
    expect(buildNpxPackageSpecifier('@sylphx/pdf-reader-mcp')).toBe('@sylphx/pdf-reader-mcp@4.1.2');
    expect(buildNpxPackageSpecifier('@sylphx/image-reader-mcp')).toBe(
      '@sylphx/image-reader-mcp@0.1.7'
    );
    expect(buildNpxPackageSpecifier('@sylphx/video-reader-mcp')).toBe(
      '@sylphx/video-reader-mcp@0.1.7'
    );
  });

  test('returns npx launch spec when local package is unavailable', () => {
    const launch = resolveReaderLaunchSpec({
      packageName: '@sylphx/definitely-missing-reader-mcp',
      binName: 'missing-reader-mcp',
      toolName: 'read_pdf',
      contractVersion: 'unpinned',
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

test('launches shell sibling bins without node when package is resolvable', () => {
  // When a sibling package is installed, bin may be a shell launcher (not .js).
  // resolveReaderLaunchSpec must not force process.execPath for those paths.
  const launch = resolveReaderLaunchSpec(READER_DELEGATION.image);
  expect(launch).toBeTruthy();
  if (launch?.source === 'local') {
    if (launch.args.length === 0) {
      // Shell/native launcher path: execute the bin directly.
      expect(launch.command).not.toBe(process.execPath);
    } else {
      // JS module entry: runtime is node/bun with the module path as argv0.
      expect(launch.command).toBe(process.execPath);
      expect(launch.args[0]).toMatch(/\.(m?js|cjs|ts)$/i);
    }
  } else {
    expect(launch?.command).toBe('npx');
  }
});
