import { describe, expect, test } from 'bun:test';
import { parseArgs } from '../src/compose/cli.js';

describe('compose-video CLI args', () => {
  test('parses path + optional flags', () => {
    const a = parseArgs(['/abs/clip.mp4', '--limit', '6', '--prompt', 'pets', '--out', 'o.json']);
    expect(a.path).toBe('/abs/clip.mp4');
    expect(a.limit).toBe(6);
    expect(a.prompt).toBe('pets');
    expect(a.out).toBe('o.json');
  });

  test('defaults limit to 8 and supports standalone path', () => {
    const a = parseArgs(['/abs/b.mp4']);
    expect(a.limit).toBe(8);
    expect(a.path).toBe('/abs/b.mp4');
  });

  test('rejects missing path', () => {
    expect(() => parseArgs([])).toThrow(/usage/);
  });
});
