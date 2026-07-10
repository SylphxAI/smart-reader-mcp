import { spawnSync } from 'node:child_process';
import { isRustCliAvailable, resolveRustCliBinary } from './rust-sniff.js';

type RustReadMediaSuccess = {
  status: 'ok';
  engine: string;
  version: string;
  route: string;
  envelope: Record<string, unknown>;
};

type RustReadMediaError = {
  status: 'error';
  code?: string;
  message: string;
  next_action?: string;
};

type RustReadMediaEnvelope = RustReadMediaSuccess | RustReadMediaError;

export type RustReadMediaResult =
  | { ok: true; text: string }
  | { ok: false; message: string };

/** Rust read_media engine is production authority unless explicitly opted out. */
export function shouldUseRustReadMediaEngine(): boolean {
  return process.env.SMART_READER_USE_RUST_READ_MEDIA !== 'ts';
}

export function readMediaViaRustEngine(input: { path: string }): RustReadMediaResult {
  if (!isRustCliAvailable()) {
    return {
      ok: false,
      message:
        'Smart reader Rust engine is not built. Run `cargo build --release` or set SMART_READER_USE_RUST_READ_MEDIA=ts to opt into the legacy handler.',
    };
  }

  const binary = resolveRustCliBinary();
  const payload = JSON.stringify({ tool: 'read_media', input });

  const result = spawnSync(binary, [], {
    input: payload,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });

  if (result.error) {
    return {
      ok: false,
      message: `Failed to launch smart reader engine: ${result.error.message}`,
    };
  }

  if (result.status !== 0) {
    return {
      ok: false,
      message: result.stderr || `Smart reader engine exited with status ${result.status}`,
    };
  }

  const envelope = JSON.parse(result.stdout) as RustReadMediaEnvelope;
  if (envelope.status !== 'ok') {
    return { ok: false, message: envelope.message };
  }

  return { ok: true, text: JSON.stringify(envelope.envelope, null, 2) };
}