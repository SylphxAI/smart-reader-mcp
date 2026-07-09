import { describe, expect, it } from 'bun:test';
import { buildReadMediaEnvelope } from '../../src/evidence/envelope.js';

describe('agent evidence envelope', () => {
  it('builds portfolio-aligned read_media envelope fields', () => {
    const envelope = buildReadMediaEnvelope({
      sourcePath: '/tmp/report.pdf',
      detectedFormat: 'pdf',
      delegatedTool: 'read_pdf',
      rawResult: { pages: 2 },
      sourceHash: 'abc123',
    });

    expect(envelope.subject).toBe('/tmp/report.pdf');
    expect(envelope.source).toBe('/tmp/report.pdf');
    expect(envelope.sourceHash).toBe('abc123');
    expect(envelope.locator.detectedFormat).toBe('pdf');
    expect(envelope.route.sniff).toBe('magic-bytes-v1');
    expect(envelope.confidence).toBe('deterministic');
    expect(envelope.nextActions.length).toBeGreaterThan(0);
    expect(envelope.delegation.delegated_tool).toBe('read_pdf');
    expect(envelope.result).toEqual({ pages: 2 });
  });
});