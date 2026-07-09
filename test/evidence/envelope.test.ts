import { describe, expect, it } from 'bun:test';
import { READER_DELEGATION } from '../../src/delegate/delegateToReader.js';
import {
  buildRoutingDiagnostics,
  DELEGATION_CONTRACT_VERSION,
} from '../../src/delegate/delegationContract.js';
import { buildReadMediaEnvelope } from '../../src/evidence/envelope.js';

describe('agent evidence envelope', () => {
  it('builds portfolio-aligned read_media envelope fields', () => {
    const routing = buildRoutingDiagnostics({
      sniffed: {
        category: 'pdf',
        format: 'pdf',
        mimeType: 'application/pdf',
        route: 'magic-bytes-v1',
      },
      sourcePath: '/tmp/report.pdf',
      launch: {
        command: process.execPath,
        args: ['/tmp/pdf-reader-mcp'],
        source: 'local',
        packageName: '@sylphx/pdf-reader-mcp',
      },
      selectedConfig: READER_DELEGATION.pdf,
    });

    const envelope = buildReadMediaEnvelope({
      sourcePath: '/tmp/report.pdf',
      detectedFormat: 'pdf',
      delegatedTool: 'read_pdf',
      readerPackage: READER_DELEGATION.pdf.packageName,
      readerContractVersion: READER_DELEGATION.pdf.contractVersion,
      delegationContractVersion: DELEGATION_CONTRACT_VERSION,
      routing,
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
    expect(envelope.delegation.contract_version).toBe(DELEGATION_CONTRACT_VERSION);
    expect(envelope.delegation.reader_package).toBe('@sylphx/pdf-reader-mcp');
    expect(envelope.routing.selected_category).toBe('pdf');
    expect(envelope.routing.alternatives).toHaveLength(2);
    expect(envelope.result).toEqual({ pages: 2 });
  });
});
