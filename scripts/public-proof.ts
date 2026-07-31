#!/usr/bin/env bun
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sniffFormatFromBuffer } from '../src/sdk.ts';

const root = join(import.meta.dir, '..');
const outDir = process.env.MCP_SMART_READER_BENCHMARK_OUTPUT_DIR
  ? join(root, process.env.MCP_SMART_READER_BENCHMARK_OUTPUT_DIR)
  : join(root, 'benchmark-artifacts');

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
  const category = (sniff as { category?: string; mediaCategory?: string }).category
    ?? (sniff as { mediaCategory?: string }).mediaCategory
    ?? JSON.stringify(sniff);
  results.push({
    path: s.path,
    expect: s.expect,
    sniff,
    ok: JSON.stringify(sniff).toLowerCase().includes(s.expect) || String(category).toLowerCase().includes(s.expect),
  });
}
const ms = performance.now() - started;
const report = {
  product: 'Prism',
  ms,
  results,
  hasSkill: existsSync(join(root, 'skills/prism/SKILL.md')),
  ok: results.every((r) => r.ok),
  generatedAt: new Date().toISOString(),
};
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'prism_public_proof.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
