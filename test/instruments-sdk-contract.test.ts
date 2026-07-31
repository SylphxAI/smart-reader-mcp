import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');

describe('Prism Instruments product contract', () => {
  test('sdk source and package exports/bin brand alias exist', () => {
    expect(existsSync(join(root, 'src/sdk.ts'))).toBe(true);
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      exports?: Record<string, string>;
      bin?: Record<string, string>;
    };
    expect(pkg.exports?.['./sdk']).toBeTruthy();
    expect(pkg.exports?.['./prism']).toBeTruthy();
    expect(pkg.bin?.prism).toBeTruthy();
    const sdk = readFileSync(join(root, 'src/sdk.ts'), 'utf8');
    expect(sdk).toContain('export class Prism');
    expect(sdk).toContain('read_media');
  });

  test('marketplace server.json brands as Prism', () => {
    const server = JSON.parse(readFileSync(join(root, 'server.json'), 'utf8')) as {
      title?: string;
    };
    expect(server.title).toBe('Prism');
  });

  test('sniff module is product-local (no monorepo import)', () => {
    expect(existsSync(join(root, 'src/sniff/formatSniffer.ts'))).toBe(true);
  });
});
