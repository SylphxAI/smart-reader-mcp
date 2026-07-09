import path from 'node:path';
import type { DetectedFormat, SniffResult } from './formatSniffer.js';

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

const extensionFormat = (filePath: string): DetectedFormat => {
  const extension = path.extname(filePath).toLowerCase();
  return EXTENSION_FORMAT[extension] ?? 'unknown';
};

export function mislabelWarning(filePath: string, sniffed: SniffResult): string | undefined {
  const declared = extensionFormat(filePath);
  if (declared === 'unknown' || sniffed.format === 'unknown') {
    return undefined;
  }

  if (declared === sniffed.format) {
    return undefined;
  }

  return (
    `File extension suggests ${declared} but magic-byte sniff detected ${sniffed.format}; ` +
    'routing by content.'
  );
}
