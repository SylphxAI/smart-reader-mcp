#!/usr/bin/env bun
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sniffFormatFromBuffer } from '../src/sdk.ts';

const root = join(import.meta.dir, '..');
const outDir = process.env.MCP_SMART_READER_BENCHMARK_OUTPUT_DIR
  ? join(root, process.env.MCP_SMART_READER_BENCHMARK_OUTPUT_DIR)
  : join(root, 'benchmark-artifacts');

/** Offline expected route: sniff category → sibling instrument (no live delegation required). */
const EXPECTED_DELEGATION: Record<string, { tool: string; package: string; brand: string }> = {
  pdf: { tool: 'read_pdf', package: '@sylphx/pdf-reader-mcp', brand: 'Citra' },
  image: { tool: 'read_image', package: '@sylphx/image-reader-mcp', brand: 'Iris' },
  video: { tool: 'read_video', package: '@sylphx/video-reader-mcp', brand: 'Cue' },
};

const samples = [
  { path: join(root, 'test/fixtures/sample.pdf'), expect: 'pdf' },
  { path: join(root, 'test/fixtures/sample.png'), expect: 'image' },
  { path: join(root, 'test/fixtures/sample.mp4'), expect: 'video' },
];

const started = performance.now();
const results = [];
for (const s of samples) {
  if (!existsSync(s.path)) {
    results.push({ path: s.path, ok: false, error: 'missing' });
    continue;
  }
  const buf = readFileSync(s.path);
  const sniff = sniffFormatFromBuffer(buf, s.path);
  const category =
    (sniff as { category?: string; mediaCategory?: string }).category ??
    (sniff as { mediaCategory?: string }).mediaCategory ??
    '';
  const cat = String(category).toLowerCase();
  const matched =
    cat.includes(s.expect) || JSON.stringify(sniff).toLowerCase().includes(s.expect);
  const expected = EXPECTED_DELEGATION[s.expect];
  results.push({
    path: s.path,
    expect: s.expect,
    sniff,
    category: cat || null,
    expectedDelegation: expected,
    route: (sniff as { route?: string }).route ?? 'magic-bytes',
    ok: matched,
  });
}
const ms = performance.now() - started;
const allOk = results.every((r) => r.ok);
const report = {
  product: 'Prism',
  ms,
  results,
  ok: allOk,
  envelopeContract: {
    locator: 'detectedFormat + path hash',
    route: 'sniffRoute + delegated tool',
    delegation: 'sibling package + tool name',
    note: 'Live e2e requires sibling natives; this proof is sniff+route map only',
  },
  siblingE2eHints: {
    pdf: 'test/prism-delegate-pdf.e2e.test.ts (skip if Citra native missing)',
    image: 'test/prism-delegate-image.e2e.test.ts',
    video: 'test/prism-delegate-video.e2e.test.ts',
  },
  hasSkill: existsSync(join(root, 'skills/prism/SKILL.md')),
  brandPublishDoc: existsSync(join(root, 'docs/BRAND_PUBLISH.md')),
  generatedAt: new Date().toISOString(),
};
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'prism_public_proof.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(allOk ? 0 : 1);
