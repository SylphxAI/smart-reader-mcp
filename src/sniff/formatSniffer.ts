import { open } from 'node:fs/promises';
import path from 'node:path';

export type MediaCategory = 'pdf' | 'image' | 'video';

export type DetectedFormat =
  | 'pdf'
  | 'image/png'
  | 'image/jpeg'
  | 'image/gif'
  | 'image/webp'
  | 'image/tiff'
  | 'video/mp4'
  | 'video/mkv'
  | 'video/quicktime'
  | 'video/webm'
  | 'unknown';

export interface SniffResult {
  category: MediaCategory | 'unknown';
  format: DetectedFormat;
  mimeType: string | null;
}

const EXTENSION_FORMAT: Record<string, DetectedFormat> = {
  '.pdf': 'pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mkv': 'video/mkv',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
};

const FORMAT_CATEGORY: Record<DetectedFormat, MediaCategory | 'unknown'> = {
  pdf: 'pdf',
  'image/png': 'image',
  'image/jpeg': 'image',
  'image/gif': 'image',
  'image/webp': 'image',
  'image/tiff': 'image',
  'video/mp4': 'video',
  'video/mkv': 'video',
  'video/quicktime': 'video',
  'video/webm': 'video',
  unknown: 'unknown',
};

const FORMAT_MIME: Record<DetectedFormat, string | null> = {
  pdf: 'application/pdf',
  'image/png': 'image/png',
  'image/jpeg': 'image/jpeg',
  'image/gif': 'image/gif',
  'image/webp': 'image/webp',
  'image/tiff': 'image/tiff',
  'video/mp4': 'video/mp4',
  'video/mkv': 'video/x-matroska',
  'video/quicktime': 'video/quicktime',
  'video/webm': 'video/webm',
  unknown: null,
};

const startsWith = (buffer: Buffer, signature: readonly number[], offset = 0): boolean => {
  if (buffer.length < offset + signature.length) return false;
  return signature.every((byte, index) => buffer[offset + index] === byte);
};

const readAscii = (buffer: Buffer, start: number, length: number): string =>
  buffer.subarray(start, start + length).toString('ascii');

const sniffFromMagicBytes = (buffer: Buffer): DetectedFormat => {
  if (startsWith(buffer, [0x25, 0x50, 0x44, 0x46])) return 'pdf';
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47])) return 'image/png';
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (readAscii(buffer, 0, 6) === 'GIF87a' || readAscii(buffer, 0, 6) === 'GIF89a') {
    return 'image/gif';
  }
  if (startsWith(buffer, [0x52, 0x49, 0x46, 0x46]) && readAscii(buffer, 8, 4) === 'WEBP') {
    return 'image/webp';
  }
  if (
    startsWith(buffer, [0x49, 0x49, 0x2a, 0x00]) ||
    startsWith(buffer, [0x4d, 0x4d, 0x00, 0x2a])
  ) {
    return 'image/tiff';
  }
  if (startsWith(buffer, [0x1a, 0x45, 0xdf, 0xa3])) {
    return buffer.length >= 40 && readAscii(buffer, 31, 4) === 'webm' ? 'video/webm' : 'video/mkv';
  }
  if (buffer.length >= 12 && readAscii(buffer, 4, 4) === 'ftyp') {
    const brand = readAscii(buffer, 8, 4);
    if (brand === 'qt  ') return 'video/quicktime';
    return 'video/mp4';
  }

  return 'unknown';
};

const sniffFromExtension = (filePath: string): DetectedFormat => {
  const extension = path.extname(filePath).toLowerCase();
  return EXTENSION_FORMAT[extension] ?? 'unknown';
};

const toSniffResult = (format: DetectedFormat): SniffResult => ({
  category: FORMAT_CATEGORY[format],
  format,
  mimeType: FORMAT_MIME[format],
});

export const sniffFormatFromBuffer = (buffer: Buffer, filePath?: string): SniffResult => {
  const magicFormat = sniffFromMagicBytes(buffer);
  if (magicFormat !== 'unknown') return toSniffResult(magicFormat);
  if (filePath) {
    const extensionFormat = sniffFromExtension(filePath);
    if (extensionFormat !== 'unknown') return toSniffResult(extensionFormat);
  }
  return toSniffResult('unknown');
};

export const sniffFormat = async (filePath: string): Promise<SniffResult> => {
  const handle = await open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(64);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return sniffFormatFromBuffer(buffer.subarray(0, bytesRead), filePath);
  } finally {
    await handle.close();
  }
};
