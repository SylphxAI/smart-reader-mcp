import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');

const readText = (relativePath: string): string =>
  readFileSync(path.join(repoRoot, relativePath), 'utf8');

describe('Web MCP HTTP Rust authority gate', () => {
  it('check-no-ts-http-backend gate script exists and enforces Rust HTTP authority', () => {
    const script = readText('scripts/check-no-ts-http-backend.sh');

    expect(script).toContain('check-no-ts-http-backend');
    expect(script).toContain('resolve_rust_bin');
    expect(script).toContain('MCP_TRANSPORT=http');
    expect(script).toContain('StreamableHttpService');
    expect(script).toContain('check-no-ts-stdio-mcp.sh');
    expect(existsSync(path.join(repoRoot, 'test/integration/http-transport.test.ts'))).toBe(true);
  });

  it('npm bin routes HTTP to Rust rmcp without TS stdio adapter', () => {
    const bin = readText('bin/smart-reader-mcp');
    const httpTransport = readText('crates/smart-reader-mcp-server/src/http_transport.rs');

    expect(bin).toContain('resolve_rust_bin');
    expect(bin).toContain('MCP_TRANSPORT=http');
    expect(bin).not.toMatch(/exec node.*http/i);
    expect(bin).not.toContain('use_ts_transport');
    expect(existsSync(path.join(repoRoot, 'src/index.ts'))).toBe(false);

    expect(httpTransport).toContain('StreamableHttpService');
    expect(httpTransport).toContain('health_check');
  });

  it('migration ledger marks transport/web-mcp-http as rust_impl with differential harness', () => {
    const ledger = JSON.parse(
      readText('docs/specs/smart-reader-mcp-migration-ledger.json')
    ) as {
      capabilities: Array<{ id: string; state: string; differentialTest?: string }>;
    };

    const http = ledger.capabilities.find((capability) => capability.id === 'transport/web-mcp-http');
    expect(http?.state).toBe('rust_impl');
    expect(http?.differentialTest).toContain('smart_reader_mcp_differential');
  });
});