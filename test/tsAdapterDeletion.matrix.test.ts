import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');

describe('TS stdio adapter deletion matrix', () => {
  it('npm bin routes exclusively to Rust rmcp', () => {
    const bin = readFileSync(path.join(repoRoot, 'bin/smart-reader-mcp'), 'utf8');
    expect(bin).toContain('resolve_rust_bin');
    expect(bin).toContain('resolve_transport');
    expect(bin).not.toContain('use_ts_transport');
    expect(bin).not.toContain('SMART_READER_MCP_TRANSPORT:-}" == "ts"');
    expect(bin).not.toContain('dist/index.js');
  });

  it('TS stdio MCP adapter sources are deleted', () => {
    expect(existsSync(path.join(repoRoot, 'src/index.ts'))).toBe(false);
    expect(existsSync(path.join(repoRoot, 'src/mcp.ts'))).toBe(false);
    expect(existsSync(path.join(repoRoot, 'dist/index.js'))).toBe(false);
  });

  it('HTTP integration harness exists for web-mcp-http authority proof', () => {
    const integration = readFileSync(
      path.join(repoRoot, 'test/integration/http-transport.test.ts'),
      'utf8'
    );
    expect(integration).toContain('MCP Server HTTP Transport Integration');
    expect(integration).toContain('read_media tool over HTTP');
    expect(integration).toContain('X-API-Key');
  });

  it('ledger records web-mcp-http as rust_impl with promotion hold', () => {
    const ledger = JSON.parse(
      readFileSync(path.join(repoRoot, 'docs/specs/smart-reader-mcp-migration-ledger.json'), 'utf8')
    ) as {
      capabilities: Array<{ id: string; state: string; promotionHold?: { active: boolean } }>;
    };
    const http = ledger.capabilities.find((cap) => cap.id === 'transport/web-mcp-http');
    expect(http?.state).toBe('rust_impl');
    expect(http?.promotionHold?.active).toBe(true);
  });

  it('stdio retirement gate blocks TS MCP reintroduction', () => {
    const script = readFileSync(
      path.join(repoRoot, 'scripts/check-no-ts-stdio-mcp.sh'),
      'utf8'
    );
    expect(script).toContain('check-no-ts-stdio-mcp');
    expect(script).toContain('src/index.ts must be deleted');
    expect(script).toContain('use_ts_transport');
    expect(script).toContain('transport/stdio-rust-rmcp');
  });

  it('read_media authority gate blocks parallel TS handler authority', () => {
    const script = readFileSync(
      path.join(repoRoot, 'scripts/check-no-ts-read-media.sh'),
      'utf8'
    );
    expect(script).toContain('check-no-ts-read-media');
    expect(script).toContain('tool/read_media');
    expect(script).toContain('rust_impl');
    expect(script).toContain('smart_reader_mcp_differential');
    expect(script).toContain('readMediaViaRustEngine');
  });

  it('ledger records tool/read_media as rust_impl with differential harness', () => {
    const ledger = JSON.parse(
      readFileSync(path.join(repoRoot, 'docs/specs/smart-reader-mcp-migration-ledger.json'), 'utf8')
    ) as {
      capabilities: Array<{ id: string; state: string; differentialTest?: string }>;
    };
    const readMedia = ledger.capabilities.find((cap) => cap.id === 'tool/read_media');
    expect(readMedia?.state).toBe('rust_impl');
    expect(readMedia?.differentialTest).toContain('smart_reader_mcp_differential');
  });

  it('ledger holds stdio-ts-adapter ts_deleted until PR merge', () => {
    const ledger = JSON.parse(
      readFileSync(path.join(repoRoot, 'docs/specs/smart-reader-mcp-migration-ledger.json'), 'utf8')
    ) as {
      capabilities: Array<{ id: string; state: string; notes?: string }>;
      summary: { ts_deleted: number; ts_only: number };
      slices: Record<string, { status: string }>;
    };
    const tsAdapter = ledger.capabilities.find((cap) => cap.id === 'transport/stdio-ts-adapter');
    expect(tsAdapter?.state).toBe('ts_only');
    expect(tsAdapter?.notes).toContain('ts_deleted NOT claimed');
    expect(ledger.summary.ts_deleted).toBe(0);
    expect(ledger.summary.ts_only).toBe(1);
    expect(ledger.slices.S3.status).toBe('complete_on_disk');
  });
});