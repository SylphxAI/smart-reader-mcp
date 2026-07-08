import { describe, expect, test } from 'bun:test';
import { sniffFormatFromBuffer } from '../../src/sniff/formatSniffer.js';

describe('sniffFormatFromBuffer', () => {
  test('detects PDF magic bytes', () => {
    const buffer = Buffer.from('%PDF-1.7\n%âãÏÓ');
    expect(sniffFormatFromBuffer(buffer).format).toBe('pdf');
    expect(sniffFormatFromBuffer(buffer).category).toBe('pdf');
  });

  test('detects PNG magic bytes', () => {
    const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(sniffFormatFromBuffer(buffer).format).toBe('image/png');
    expect(sniffFormatFromBuffer(buffer).category).toBe('image');
  });

  test('detects JPEG magic bytes', () => {
    const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(sniffFormatFromBuffer(buffer).format).toBe('image/jpeg');
  });

  test('detects GIF magic bytes', () => {
    const buffer = Buffer.from('GIF89a');
    expect(sniffFormatFromBuffer(buffer).format).toBe('image/gif');
  });

  test('detects WebP magic bytes', () => {
    const buffer = Buffer.alloc(16);
    buffer.write('RIFF', 0, 'ascii');
    buffer.write('WEBP', 8, 'ascii');
    expect(sniffFormatFromBuffer(buffer).format).toBe('image/webp');
  });

  test('detects TIFF little-endian magic bytes', () => {
    const buffer = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00]);
    expect(sniffFormatFromBuffer(buffer).format).toBe('image/tiff');
  });

  test('detects MP4 ftyp magic bytes', () => {
    const buffer = Buffer.alloc(16);
    buffer.writeUInt32BE(32, 0);
    buffer.write('ftyp', 4, 'ascii');
    buffer.write('isom', 8, 'ascii');
    expect(sniffFormatFromBuffer(buffer).format).toBe('video/mp4');
    expect(sniffFormatFromBuffer(buffer).category).toBe('video');
  });

  test('detects QuickTime ftyp brand', () => {
    const buffer = Buffer.alloc(16);
    buffer.writeUInt32BE(32, 0);
    buffer.write('ftyp', 4, 'ascii');
    buffer.write('qt  ', 8, 'ascii');
    expect(sniffFormatFromBuffer(buffer).format).toBe('video/quicktime');
  });

  test('detects Matroska magic bytes', () => {
    const buffer = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x00, 0x00, 0x00]);
    expect(sniffFormatFromBuffer(buffer).format).toBe('video/mkv');
  });

  test('detects WebM via matroska header and webm doc type', () => {
    const buffer = Buffer.alloc(64);
    buffer.writeUInt8(0x1a, 0);
    buffer.writeUInt8(0x45, 1);
    buffer.writeUInt8(0xdf, 2);
    buffer.writeUInt8(0xa3, 3);
    buffer.write('webm', 31, 'ascii');
    expect(sniffFormatFromBuffer(buffer).format).toBe('video/webm');
  });

  test('falls back to extension when magic bytes are unknown', () => {
    const buffer = Buffer.from('not-a-real-header');
    expect(sniffFormatFromBuffer(buffer, '/tmp/sample.PDF').format).toBe('pdf');
    expect(sniffFormatFromBuffer(buffer, '/tmp/clip.MP4').format).toBe('video/mp4');
    expect(sniffFormatFromBuffer(buffer, '/tmp/frame.JPEG').format).toBe('image/jpeg');
  });

  test('returns unknown when neither magic bytes nor extension match', () => {
    const buffer = Buffer.from('unknown');
    expect(sniffFormatFromBuffer(buffer, '/tmp/file.xyz').format).toBe('unknown');
    expect(sniffFormatFromBuffer(buffer, '/tmp/file.xyz').category).toBe('unknown');
  });
});