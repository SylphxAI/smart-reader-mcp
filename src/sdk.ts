/**
 * Prism SDK — local media router (Sylphx).
 * Isomorphic with MCP tool `read_media`: sniff format → delegate to Citra/Iris/Cue.
 *
 * Composition doctrine: products compose via SDK. `composeVideo` composes
 * Cue structure + Iris L2 semantics by timestamp (SDK + CLI surface only,
 * not an MCP tool). MCP stays the agent surface; CLI for humans.
 */

import {
  type ComposeVideoInput,
  composeVideoObjects,
  createComposeVideoObjects,
  structuralKeyframeTimes,
} from './compose/composeVideoObjects.js';
import type { ComposedVideoEnvelope } from './compose/envelope.js';
import { readMedia } from './handlers/readMedia.js';
import { readMediaArgsSchema } from './schemas/readMedia.js';
import { sniffFormat, sniffFormatFromBuffer } from './sniff/formatSniffer.js';

export type PrismReadInput = {
  path: string;
  [key: string]: unknown;
};

export type { ComposedVideoEnvelope, ComposeVideoInput };
export {
  composeVideoObjects,
  createComposeVideoObjects,
  readMediaArgsSchema,
  sniffFormat,
  sniffFormatFromBuffer,
  structuralKeyframeTimes,
};

export class Prism {
  static create(): Prism {
    return new Prism();
  }

  /** MCP: read_media */
  async read(input: PrismReadInput) {
    const parsed = readMediaArgsSchema.parse(input);
    return readMedia.handler({ input: parsed, ctx: {} });
  }

  /** Sniff only (no sibling delegation). */
  async sniff(path: string) {
    return sniffFormat(path);
  }

  /**
   * Compose a local video into timestamped objects via sibling SDKs
   * (Cue structure + Iris L2 semantics). SDK + CLI surface only — not an MCP tool.
   */
  async composeVideo(input: ComposeVideoInput): Promise<ComposedVideoEnvelope> {
    return composeVideoObjects(input);
  }

  /** Create a compose instance with injected SDK loaders (DI for tests). */
  createCompose(deps: Parameters<typeof createComposeVideoObjects>[0] = {}) {
    return createComposeVideoObjects(deps);
  }
}

export default Prism;
