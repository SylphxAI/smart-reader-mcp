import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DetectedFormat, MediaCategory, SniffResult } from '../sniff/formatSniffer.js';

type RustSniffPayload = {
  category: MediaCategory | 'unknown';
  format: DetectedFormat;
  mime_type: string | null;
  route: string;
};

type RustSniffEnvelope =
  | {
      status: 'ok';
      engine: string;
      version: string;
      sniff: RustSniffPayload;
    }
  | { status: 'error'; code: string; message: string; next_action: string };

type RustResolveEnvelope =
  | { status: 'ok'; engine: string; version: string; resolved_path: string }
  | { status: 'error'; code: string; message: string; next_action: string };

const here = path.dirname(fileURLToPath(import.meta.url));

export function resolveRustCliBinary(): string {
  const env = process.env.SMART_READER_CLI;
  if (env && existsSync(env)) {
    return env;
  }

  const release = path.join(here, '../../target/release/smart-reader-cli');
  if (existsSync(release)) {
    return release;
  }

  const debug = path.join(here, '../../target/debug/smart-reader-cli');
  if (existsSync(debug)) {
    return debug;
  }

  return 'smart-reader-cli';
}

export function shouldUseRustSniffEngine(): boolean {
  return process.env.SMART_READER_USE_RUST_SNIFF === '1';
}

const invokeRustCli = (tool: string, input: Record<string, unknown>): unknown => {
  const binary = resolveRustCliBinary();
  const payload = JSON.stringify({ tool, input });

  const result = spawnSync(binary, [], {
    input: payload,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });

  if (result.error) {
    throw new Error(`Failed to launch smart reader engine: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(result.stderr || `Smart reader engine exited with status ${result.status}`);
  }

  return JSON.parse(result.stdout) as unknown;
};

const mapSniffPayload = (payload: RustSniffPayload): SniffResult => ({
  category: payload.category,
  format: payload.format,
  mimeType: payload.mime_type,
  route: payload.route,
});

export function sniffFormatViaRustEngine(filePath: string, cwd = process.cwd()): SniffResult {
  const envelope = invokeRustCli('sniff_format', { path: filePath, cwd }) as RustSniffEnvelope;
  if (envelope.status !== 'ok') {
    throw new Error(envelope.message);
  }

  return mapSniffPayload(envelope.sniff);
}

export function resolveMediaPathViaRustEngine(filePath: string, cwd = process.cwd()): string {
  const envelope = invokeRustCli('resolve_media_path', {
    path: filePath,
    cwd,
  }) as RustResolveEnvelope;

  if (envelope.status !== 'ok') {
    throw new Error(envelope.message);
  }

  return envelope.resolved_path;
}
