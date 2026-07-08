import { access } from 'node:fs/promises';
import path from 'node:path';
import { delegateToReader } from '../delegate/delegateToReader.js';
import { text, tool, toolError } from '../mcp.js';
import { type ReadMediaEnvelope, readMediaArgsSchema } from '../schemas/readMedia.js';
import { sniffFormat, type SniffResult } from '../sniff/formatSniffer.js';

export interface ReadMediaDependencies {
  sniffFormat?: (filePath: string) => Promise<SniffResult>;
  delegateToReader?: typeof delegateToReader;
}

export const createReadMediaHandler = (dependencies: ReadMediaDependencies = {}) => {
  const sniff = dependencies.sniffFormat ?? sniffFormat;
  const delegate = dependencies.delegateToReader ?? delegateToReader;

  return tool()
    .description(
      'Read a local PDF, image, or video by sniffing format and delegating to the matching Sylphx Reader sibling MCP package.'
    )
    .input(readMediaArgsSchema)
    .handler(async ({ input }) => {
      const sourcePath = path.resolve(input.path);

      try {
        await access(sourcePath);
      } catch {
        return toolError(`File not found or not readable: ${sourcePath}`);
      }

      const sniffed = await sniff(sourcePath);
      if (sniffed.category === 'unknown' || sniffed.format === 'unknown') {
        return toolError(
          `Unsupported or unrecognized media format for ${sourcePath}. ` +
            'Supported: pdf, png, jpeg, gif, webp, tiff, mp4, mkv, mov, webm.'
        );
      }

      try {
        const delegated = await delegate({
          category: sniffed.category,
          sourcePath,
        });

        const envelope: ReadMediaEnvelope = {
          source_path: sourcePath,
          detected_format: sniffed.format,
          delegated_tool: delegated.delegated_tool,
          raw_result: delegated.raw_result,
        };

        return text(JSON.stringify(envelope, null, 2));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return toolError(message);
      }
    });
};

export const readMedia = createReadMediaHandler();