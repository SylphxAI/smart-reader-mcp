/**
 * compose-video CLI — human/script wrapper around Prism SDK composeVideo.
 *
 * Usage: bun run compose:video -- /abs/clip.mp4 [--limit 8] [--prompt "animals"] [--out out.json]
 */

import { writeFile } from 'node:fs/promises';
import { composeVideoObjects } from './composeVideoObjects.js';

export function parseArgs(argv: string[]): {
  path: string;
  limit: number;
  prompt?: string;
  out?: string;
} {
  let p = '';
  let limit = 8;
  let prompt: string | undefined;
  let out: string | undefined;
  const args = [...argv];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--limit') limit = Number.parseInt(args[i + 1] ?? '8', 10) || 8;
    else if (a === '--prompt') prompt = args[i + 1];
    else if (a === '--out') out = args[i + 1];
    else if (a && !a.startsWith('--') && !p) p = a;
  }
  if (!p) {
    throw new Error(
      'usage: bun run compose:video -- <video path> [--limit N] [--prompt "…"] [--out file.json]'
    );
  }
  return { path: p, limit, prompt, out };
}

async function main(argv: string[]): Promise<void> {
  const input = parseArgs(argv);
  const envelope = await composeVideoObjects(input);
  if (input.out) {
    await writeFile(input.out, JSON.stringify(envelope, null, 2) + '\n');
  }
  process.stdout.write(JSON.stringify(envelope, null, 2) + '\n');
  if (envelope.keyframes.some((k) => !k.semantics_available)) {
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main(process.argv.slice(2)).catch((error: unknown) => {
    const m = error instanceof Error ? error.message : String(error);
    process.stderr.write(`compose-video failed: ${m}\n`);
    process.exit(1);
  });
}
