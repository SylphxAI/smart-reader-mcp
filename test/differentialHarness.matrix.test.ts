import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');

describe('smart-reader-mcp differential harness (rej-010 read-media)', () => {
  it('ships fail-closed differential entrypoint and oracle artifacts', () => {
    expect(existsSync(path.join(repoRoot, 'scripts/run-smart-reader-mcp-differential.sh'))).toBe(
      true
    );
    expect(existsSync(path.join(repoRoot, 'scripts/differential/smart-reader-mcp-oracle.ts'))).toBe(
      true
    );
    expect(
      existsSync(path.join(repoRoot, 'scripts/differential/fixtures/smart-reader-mcp-corpus.json'))
    ).toBe(true);
    expect(
      existsSync(
        path.join(repoRoot, 'crates/smart-reader-mcp-server/tests/smart_reader_mcp_differential.rs')
      )
    ).toBe(true);

    const harness = readFileSync(
      path.join(repoRoot, 'scripts/run-smart-reader-mcp-differential.sh'),
      'utf8'
    );
    expect(harness).toContain('smart-reader-mcp-differential');
    expect(harness).toContain('smart-reader-mcp-oracle.ts');
    expect(harness).toContain('read_media_differential_matches_ts_oracle');
    expect(harness).toContain('--slice');
    expect(harness).toContain('differential_green');
    expect(harness).toContain('read-media');
  });

  it('parity slice manifest binds read_media bounded domain with fail-closed allow-list', () => {
    const slice = JSON.parse(
      readFileSync(path.join(repoRoot, 'docs/specs/smart-reader-mcp-parity-slice.json'), 'utf8')
    ) as {
      slice: string;
      differentialHarness: string;
      allowList: string[];
      domains: Array<{ id: string; differentialTest: boolean; boundedSlice?: string }>;
    };

    expect(slice.slice).toContain('tool.read_media');
    expect(slice.differentialHarness).toBe('scripts/run-smart-reader-mcp-differential.sh');
    expect(slice.allowList).toEqual(['read_media']);
    expect(slice.domains.some((domain) => domain.id === 'tool/read_media')).toBe(true);
    expect(slice.domains.find((domain) => domain.id === 'tool/read_media')?.boundedSlice).toBe(
      'read-media'
    );
  });

  it('corpus fixture drives bounded read_media oracle cases', () => {
    const corpus = JSON.parse(
      readFileSync(
        path.join(repoRoot, 'scripts/differential/fixtures/smart-reader-mcp-corpus.json'),
        'utf8'
      )
    ) as {
      toolCases: Array<{ id: string; fixture: string }>;
      allowList: { tools: string[] };
    };

    expect(corpus.allowList.tools).toEqual(['read_media']);
    expect(corpus.toolCases.length).toBeGreaterThanOrEqual(2);
    for (const testCase of corpus.toolCases) {
      expect(
        existsSync(path.join(repoRoot, 'test/fixtures', testCase.fixture)),
        `missing fixture ${testCase.fixture}`
      ).toBe(true);
    }
  });
});
