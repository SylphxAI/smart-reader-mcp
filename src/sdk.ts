/**
 * Prism SDK — local media router (Sylphx).
 * Isomorphic with MCP tool `read_media`: sniff format → delegate to Citra/Iris/Cue.
 */
import { readMedia } from './handlers/readMedia.js';
import { readMediaArgsSchema } from './schemas/readMedia.js';
import { sniffFormat, sniffFormatFromBuffer } from './sniff/formatSniffer.js';

export type PrismReadInput = {
  path: string;
  [key: string]: unknown;
};

export { readMediaArgsSchema, sniffFormat, sniffFormatFromBuffer };

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
}

export default Prism;
