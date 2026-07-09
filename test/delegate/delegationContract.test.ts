import { describe, expect, it } from 'bun:test';
import {
  buildRoutingDiagnostics,
  DELEGATION_CONTRACT_VERSION,
} from '../../src/delegate/delegationContract.js';
import { READER_DELEGATION } from '../../src/delegate/delegateToReader.js';

describe('delegation contract routing diagnostics', () => {
  it('records versioned contract metadata and non-selected reader alternatives', () => {
    const routing = buildRoutingDiagnostics({
      sniffed: {
        category: 'pdf',
        format: 'pdf',
        mimeType: 'application/pdf',
        route: 'rust-sniff',
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

    expect(routing.contract_version).toBe(DELEGATION_CONTRACT_VERSION);
    expect(routing.selected_category).toBe('pdf');
    expect(routing.sniff_method).toBe('rust-sniff');
    expect(routing.declared_extension).toBe('.pdf');
    expect(routing.selection_reason).toContain('maps to the pdf reader read_pdf');
    expect(routing.alternatives).toHaveLength(2);
    expect(routing.alternatives.every((entry) => entry.category !== 'pdf')).toBe(true);
    expect(routing.alternatives[0]?.reader_contract_version.length).toBeGreaterThan(0);
  });

  it('explains extension override when magic bytes disagree with the filename', () => {
    const routing = buildRoutingDiagnostics({
      sniffed: {
        category: 'image',
        format: 'image/png',
        mimeType: 'image/png',
        route: 'rust-sniff',
      },
      sourcePath: '/tmp/looks-like.pdf',
      launch: {
        command: 'npx',
        args: ['-y', '@sylphx/image-reader-mcp@0.1.0'],
        source: 'npx',
        packageName: '@sylphx/image-reader-mcp',
      },
      selectedConfig: READER_DELEGATION.image,
    });

    expect(routing.selection_reason).toContain('overrides declared extension .pdf');
    expect(routing.launch_source).toBe('npx');
    expect(routing.reader_package).toBe('@sylphx/image-reader-mcp');
  });
});