import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');

describe('smart-reader-mcp differential harness (rej-010)', () => {
  it('ships fail-closed differential entrypoint and oracle artifacts', () => {
    expect(existsSync(path.join(repoRoot, 'scripts/run-smart-reader-mcp-differential.sh'))).toBe(
      true
    );
    expect(
      existsSync(path.join(repoRoot, 'scripts/differential/smart-reader-mcp-oracle.ts'))
    ).toBe(true);
    expect(
      existsSync(
        path.join(repoRoot, 'scripts/differential/fixtures/smart-reader-mcp-corpus.json')
      )
    ).toBe(true);
    expect(
      existsSync(
        path.join(
          repoRoot,
          'crates/smart-reader-mcp-server/tests/smart_reader_mcp_differential.rs'
        )
      )
    ).toBe(true);

    const harness = readFileSync(
      path.join(repoRoot, 'scripts/run-smart-reader-mcp-differential.sh'),
      'utf8'
    );
    expect(harness).toContain('smart-reader-mcp-differential');
    expect(harness).toContain('smart-reader-mcp-oracle.ts');
    expect(harness).toContain('smart_reader_mcp_differential_matches_ts_oracle');
    expect(harness).toContain('differential_green');
    expect(harness).toContain('check-no-ts-stdio-mcp.sh');
    expect(harness).toContain('--slice');
    expect(harness).toContain('tool.read_media');
    expect(harness).toContain('SMART_READER_MCP_SLICE_FILTER');
  });

  it('parity slice manifest binds read_media, HTTP, and stdio transport domains', () => {
    const slice = JSON.parse(
      readFileSync(path.join(repoRoot, 'docs/specs/smart-reader-mcp-parity-slice.json'), 'utf8')
    ) as {
      slice: string;
      differentialHarness: string;
      domains: Array<{ id: string; differentialTest: boolean }>;
    };

    expect(slice.slice).toContain('tool.read_media');
    expect(slice.slice).toContain('transport.web-mcp-http');
    expect(slice.slice).toContain('transport.stdio-rust-rmcp');
    expect(slice.differentialHarness).toBe('scripts/run-smart-reader-mcp-differential.sh');
    expect(slice.domains.some((domain) => domain.id === 'tool/read_media')).toBe(true);
    expect(slice.domains.some((domain) => domain.id === 'transport/web-mcp-http')).toBe(true);
    expect(slice.domains.some((domain) => domain.id === 'transport/stdio-rust-rmcp')).toBe(true);
  });
});