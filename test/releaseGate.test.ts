import { describe, expect, it } from 'bun:test';
import path from 'node:path';
import { buildReleaseGateReport } from '../scripts/release-gate.js';

describe('smart reader release gate', () => {
  it('passes Phase 0 contract checks', () => {
    const report = buildReleaseGateReport(
      path.join(import.meta.dirname, '..', 'benchmark-artifacts')
    );

    expect(report.profile).toBe('smart_reader_release_gate');
    expect(report.status).toBe('passed');
    expect(report.summary.failed).toBe(0);
    expect(report.checks.some((check) => check.id === 'fixtures:corpus_manifest')).toBe(true);
    expect(report.checks.some((check) => check.id === 'mcp:rust_adapter_default')).toBe(true);
    expect(report.checks.some((check) => check.id === 'mcp:ts_adapter_deleted')).toBe(true);
    expect(report.checks.find((check) => check.id === 'mcp:rust_adapter_default')?.status).toBe(
      'passed'
    );
    expect(report.checks.find((check) => check.id === 'mcp:ts_adapter_deleted')?.status).toBe(
      'passed'
    );
  }, 300_000);
});
