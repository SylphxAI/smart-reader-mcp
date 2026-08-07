import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');

describe('Prism retirement contract', () => {
  test('package is private/retired and not an active Instrument CTA', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      private?: boolean;
      description?: string;
      exports?: Record<string, string>;
      bin?: Record<string, string>;
    };
    expect(pkg.private).toBe(true);
    expect(pkg.description?.toUpperCase()).toContain('RETIRED');
    // historical code may still exist for archaeology
    expect(existsSync(join(root, 'src/sniff/formatSniffer.ts'))).toBe(true);
    expect(existsSync(join(root, 'skills/media-route/SKILL.md'))).toBe(true);
  });

  test('marketplace server.json marks Prism retired', () => {
    const server = JSON.parse(readFileSync(join(root, 'server.json'), 'utf8')) as {
      title?: string;
      description?: string;
    };
    expect(server.title).toMatch(/RETIRED/i);
    expect(server.description?.toUpperCase()).toContain('RETIRED');
  });

  test('README declares retirement and successor instruments', () => {
    const readme = readFileSync(join(root, 'README.md'), 'utf8');
    expect(readme).toMatch(/RETIRED/i);
    expect(readme).toContain('@sylphx/citra');
    expect(readme).toContain('@sylphx/iris');
    expect(readme).toContain('@sylphx/cue');
  });
});
