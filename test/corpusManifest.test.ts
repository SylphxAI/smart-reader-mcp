import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

describe('smart reader fixture corpus manifest', () => {
  it('lists Phase 0 router contract cases', () => {
    const manifest = JSON.parse(
      readFileSync(path.join(import.meta.dirname, 'fixtures', 'corpus-manifest.json'), 'utf8')
    ) as { profile: string; cases: Array<{ id: string }> };

    expect(manifest.profile).toBe('smart_reader_fixture_corpus');
    expect(manifest.cases.map((entry) => entry.id)).toEqual([
      'pdf',
      'image',
      'video',
      'mislabeled-png-as-pdf',
      'unsupported',
    ]);
  });
});
