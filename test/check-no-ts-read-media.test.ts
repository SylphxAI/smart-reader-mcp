import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');

const readText = (relativePath: string): string =>
  readFileSync(path.join(repoRoot, relativePath), 'utf8');

describe('check-no-ts-read-media gate', () => {
  it('gate script exists and enforces Rust read_media authority routing', () => {
    const script = readText('scripts/check-no-ts-read-media.sh');
    expect(script).toContain('check-no-ts-read-media');
    expect(script).toContain('shouldUseRustReadMediaEngine');
    expect(script).toContain('readMediaViaRustEngine');
    expect(script).toContain('useRustAuthority');
    expect(script).toContain('tool/read_media');
    expect(script).toContain('rust_impl');
    expect(script).toContain('smart_reader_mcp_differential');
    expect(script).toContain('crates/smart-reader-core/src/read_media.rs');
    expect(script).toContain('check:no-ts-read-media');
    expect(existsSync(path.join(repoRoot, 'src/engine/rust-read-media.ts'))).toBe(true);
    expect(existsSync(path.join(repoRoot, 'test/fixtures/read-media-golden.json'))).toBe(true);
    expect(
      existsSync(path.join(repoRoot, 'crates/smart-reader-core/tests/read_media_golden_parity.rs'))
    ).toBe(true);
    expect(
      existsSync(
        path.join(repoRoot, 'crates/smart-reader-mcp-server/tests/read_media_golden_parity.rs')
      )
    ).toBe(true);
  });

  it('default readMedia handler delegates to Rust authority engine', () => {
    const handler = readText('src/handlers/readMedia.ts');
    const rustEngine = readText('src/engine/rust-read-media.ts');

    expect(rustEngine).toContain("SMART_READER_USE_RUST_READ_MEDIA !== 'ts'");
    expect(rustEngine).toContain("tool: 'read_media'");
    expect(handler).toContain('shouldUseRustReadMediaEngine');
    expect(handler).toContain('readMediaViaRustEngine');
    expect(handler).toContain('useRustAuthority');

    const handlerBlock = handler.slice(
      handler.indexOf('.handler(async ({ input }) => {'),
      handler.indexOf('let sourcePath: string;')
    );
    expect(handlerBlock).toContain('useRustAuthority');
    expect(handlerBlock).toContain('readMediaViaRustEngine');
  });

  it('migration ledger records tool/read_media rust_impl with differential harness evidence', () => {
    const ledger = JSON.parse(
      readFileSync(path.join(repoRoot, 'docs/specs/smart-reader-mcp-migration-ledger.json'), 'utf8')
    ) as {
      capabilities: Array<{
        id: string;
        state: string;
        parityTest?: string;
        differentialTest?: string;
        notes?: string;
        promotionHold?: { active: boolean; rejectionRef?: string };
      }>;
      summary: { authority_rust: number; rust_impl: number; proof_missing?: number };
      slices: Record<string, { status: string }>;
    };

    const readMedia = ledger.capabilities.find((cap) => cap.id === 'tool/read_media');
    expect(readMedia?.state).toBe('rust_impl');
    expect(readMedia?.parityTest).toContain('scripts/check-no-ts-read-media.sh');
    expect(readMedia?.parityTest).toContain('test/check-no-ts-read-media.test.ts');
    expect(readMedia?.differentialTest).toContain('smart_reader_mcp_differential');
    expect(readMedia?.notes).toContain('S4');
    expect(readMedia?.promotionHold?.active).toBe(true);
    expect(readMedia?.promotionHold?.rejectionRef).toBe('rej-010');
    expect(ledger.summary.authority_rust).toBe(0);
    expect(ledger.summary.rust_impl).toBe(3);
    expect(ledger.summary.proof_missing).toBe(3);
    expect(ledger.slices.S4?.status).toBe('shipped');
  });
});