import { describe, expect, test } from 'bun:test';
import {
  READER_DELEGATION,
  ReaderUnavailableError,
  delegateToReader,
  resolveReaderLaunchSpec,
} from '../../src/delegate/delegateToReader.js';

describe('resolveReaderLaunchSpec', () => {
  test('maps each media category to the expected sibling package', () => {
    expect(READER_DELEGATION.pdf.packageName).toBe('@sylphx/pdf-reader-mcp');
    expect(READER_DELEGATION.image.toolName).toBe('read_image');
    expect(READER_DELEGATION.video.binName).toBe('video-reader-mcp');
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