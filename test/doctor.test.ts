import { describe, expect, it } from 'bun:test';
import { runDoctor } from '../src/doctor.js';

describe('smart reader doctor', () => {
  it('returns structured install diagnostics', () => {
    const report = runDoctor('0.1.1');

    expect(report.profile).toBe('smart_reader_doctor');
    expect(['ready', 'degraded', 'unavailable']).toContain(report.status);
    expect(report.checks.some((check) => check.id === 'rust_sniff_cli')).toBe(true);
    expect(report.checks.some((check) => check.id === 'reader_pdf')).toBe(true);
    expect(report.checks.some((check) => check.id === 'reader_image')).toBe(true);
    expect(report.checks.some((check) => check.id === 'reader_video')).toBe(true);
  });
});
