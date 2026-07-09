import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export type Confidence = 'deterministic' | 'derived' | 'inferred' | 'unknown';

export interface AgentEvidenceEnvelope {
  subject: string;
  source: string;
  sourceHash?: string;
  freshness: {
    indexedAt: string;
    stale: boolean;
  };
  locator: {
    path: string;
    detectedFormat: string;
  };
  route: {
    sniff: string;
    delegation: string;
  };
  confidence: Confidence;
  warnings: string[];
  nextActions: string[];
  delegation: {
    source_path: string;
    detected_format: string;
    delegated_tool: string;
  };
  result: unknown;
}

export async function hashFile(path: string): Promise<string> {
  const bytes = await readFile(path);
  return createHash('sha256').update(bytes).digest('hex');
}

export function buildReadMediaEnvelope(input: {
  sourcePath: string;
  detectedFormat: string;
  delegatedTool: string;
  rawResult: unknown;
  sourceHash?: string;
  warnings?: string[];
}): AgentEvidenceEnvelope {
  const warnings = input.warnings ?? [];
  return {
    subject: input.sourcePath,
    source: input.sourcePath,
    sourceHash: input.sourceHash,
    freshness: {
      indexedAt: new Date().toISOString(),
      stale: false,
    },
    locator: {
      path: input.sourcePath,
      detectedFormat: input.detectedFormat,
    },
    route: {
      sniff: 'magic-bytes-v1',
      delegation: input.delegatedTool,
    },
    confidence: 'deterministic',
    warnings,
    nextActions: [
      `Verify delegated evidence from ${input.delegatedTool}`,
      'Re-run read_media after file changes to refresh sourceHash',
    ],
    delegation: {
      source_path: input.sourcePath,
      detected_format: input.detectedFormat,
      delegated_tool: input.delegatedTool,
    },
    result: input.rawResult,
  };
}
