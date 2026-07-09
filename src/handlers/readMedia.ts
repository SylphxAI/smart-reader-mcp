import { access } from 'node:fs/promises';
import path from 'node:path';
import { delegateToReader, READER_DELEGATION } from '../delegate/delegateToReader.js';
import {
  buildRoutingDiagnostics,
  DELEGATION_CONTRACT_VERSION,
} from '../delegate/delegationContract.js';
import { resolveMediaPathViaRustEngine, shouldUseRustSniffEngine } from '../engine/rust-sniff.js';
import { buildReadMediaEnvelope, hashFile } from '../evidence/envelope.js';
import { text, tool, toolError } from '../mcp.js';
import { readMediaArgsSchema } from '../schemas/readMedia.js';
import { type SniffResult, sniffFormat } from '../sniff/formatSniffer.js';
import { mislabelWarning } from '../sniff/mislabel.js';

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
      let sourcePath: string;
      try {
        sourcePath = shouldUseRustSniffEngine()
          ? resolveMediaPathViaRustEngine(input.path)
          : path.resolve(input.path);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return toolError(message);
      }

      if (!shouldUseRustSniffEngine()) {
        try {
          await access(sourcePath);
        } catch {
          return toolError(`File not found or not readable: ${sourcePath}`);
        }
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

        const sourceHash = await hashFile(sourcePath);
        const mislabel = mislabelWarning(sourcePath, sniffed);
        const readerConfig = READER_DELEGATION[sniffed.category as keyof typeof READER_DELEGATION];
        const routing = buildRoutingDiagnostics({
          sniffed,
          sourcePath,
          launch: delegated.launch,
          selectedConfig: readerConfig,
        });
        const envelope = buildReadMediaEnvelope({
          sourcePath,
          detectedFormat: sniffed.format,
          delegatedTool: delegated.delegated_tool,
          readerPackage: readerConfig.packageName,
          readerContractVersion: readerConfig.contractVersion,
          delegationContractVersion: DELEGATION_CONTRACT_VERSION,
          routing,
          rawResult: delegated.raw_result,
          sourceHash,
          sniffRoute: sniffed.route ?? 'magic-bytes-v1',
          ...(mislabel !== undefined ? { warnings: [mislabel] } : {}),
        });

        return text(JSON.stringify(envelope, null, 2));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return toolError(message);
      }
    });
};

export const readMedia = createReadMediaHandler();
