import { describe, expect, test } from 'bun:test';
import { sniffFormatFromBuffer } from '../src/sniff/formatSniffer.ts';

describe('Prism sniff behavior (magic bytes)', () => {
  test('detects PDF regardless of extension', () => {
    const buf = Buffer.from('%PDF-1.7\n%âãÏÓ\n');
    const r = sniffFormatFromBuffer(buf, 'disguised.png');
    expect(r.category).toBe('pdf');
    expect(r.format).toBe('pdf');
    expect(r.route).toBe('magic-bytes-v1');
  });

  test('detects PNG signature', () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const r = sniffFormatFromBuffer(buf, 'x.bin');
    expect(r.category).toBe('image');
    expect(r.format).toBe('image/png');
  });

  test('detects JPEG signature', () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
    const r = sniffFormatFromBuffer(buf);
    expect(r.format).toBe('image/jpeg');
  });

  test('detects MP4 ftyp brand', () => {
    // size(4) + 'ftyp' + 'isom'
    const buf = Buffer.alloc(16);
    buf.writeUInt32BE(16, 0);
    buf.write('ftyp', 4);
    buf.write('isom', 8);
    const r = sniffFormatFromBuffer(buf, 'clip.bin');
    expect(r.category).toBe('video');
    expect(r.format).toBe('video/mp4');
  });

  test('falls back to extension when magic unknown', () => {
    const buf = Buffer.from('not a media file at all!!!!!!!!!!!!');
    const r = sniffFormatFromBuffer(buf, 'notes.pdf');
    expect(r.format).toBe('pdf');
    expect(r.category).toBe('pdf');
  });

  test('unknown when no magic and no useful extension', () => {
    const buf = Buffer.from('hello world');
    const r = sniffFormatFromBuffer(buf, 'notes.txt');
    expect(r.category).toBe('unknown');
  });
});
