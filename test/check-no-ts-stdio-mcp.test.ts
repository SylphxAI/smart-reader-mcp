import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');

const readText = (relativePath: string): string =>
  readFileSync(path.join(repoRoot, relativePath), 'utf8');

describe('TS stdio MCP retirement gate', () => {
  it('check-no-ts-stdio-mcp gate script exists and enforces Rust-only MCP transport', () => {
    const script = readText('scripts/check-no-ts-stdio-mcp.sh');

    expect(script).toContain('check-no-ts-stdio-mcp');
    expect(script).toContain('resolve_rust_bin');
    expect(script).toContain('src/index.ts must be deleted');
    expect(script).toContain('transport/stdio-rust-rmcp');
    expect(script).toContain('transport/web-mcp-http');
  });

  it('npm bin routes exclusively to Rust rmcp without TS stdio adapter', () => {
    const bin = readText('bin/smart-reader-mcp');
    const rustMain = readText('crates/smart-reader-mcp-server/src/main.rs');

    expect(bin).toContain('resolve_rust_bin');
    expect(bin).toContain('resolve_transport');
    expect(bin).not.toContain('use_ts_transport');
    expect(bin).not.toContain('exec node');
    expect(bin).not.toContain('SMART_READER_MCP_TRANSPORT:-}" == "ts"');
    expect(existsSync(path.join(repoRoot, 'src/index.ts'))).toBe(false);
    expect(existsSync(path.join(repoRoot, 'dist/index.js'))).toBe(false);
    expect(rustMain).toContain('transport::stdio');
  });

  it('migration ledger keeps stdio-ts-adapter pending ts_deleted flip until PR merge', () => {
    const ledger = JSON.parse(
      readText('docs/specs/smart-reader-mcp-migration-ledger.json')
    ) as {
      capabilities: Array<{ id: string; state: string; notes?: string }>;
      slices: Record<string, { status: string }>;
      summary: { ts_deleted: number; ts_only: number };
    };

    const tsAdapter = ledger.capabilities.find((cap) => cap.id === 'transport/stdio-ts-adapter');
    const stdioRust = ledger.capabilities.find((cap) => cap.id === 'transport/stdio-rust-rmcp');
    const http = ledger.capabilities.find((cap) => cap.id === 'transport/web-mcp-http');

    expect(tsAdapter?.state).toBe('ts_only');
    expect(tsAdapter?.notes).toContain('ts_deleted NOT claimed');
    expect(stdioRust?.state).toBe('rust_impl');
    expect(http?.state).toBe('rust_impl');
    expect(ledger.slices.S3.status).toBe('complete_on_disk');
    expect(ledger.summary.ts_deleted).toBe(0);
    expect(ledger.summary.ts_only).toBe(1);
  });
});