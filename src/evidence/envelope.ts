import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { RoutingDiagnostics } from '../delegate/delegationContract.js';

export type Confidence = 'deterministic' | 'derived' | 'inferred' | 'unknown';

export interface AgentEvidenceFreshness {
  indexedAt: string;
  stale: boolean;
}

export interface AgentEvidenceLocator {
  path: string;
  detectedFormat: string;
}

export interface AgentEvidenceRoute {
  sniff: string;
  delegation: string;
}

export interface AgentEvidenceDelegation {
  contract_version: string;
  source_path: string;
  detected_format: string;
  delegated_tool: string;
  reader_package: string;
  reader_contract_version: string;
}

export interface AgentEvidenceEnvelope<TRouting = RoutingDiagnostics> {
  subject: string;
  source: string;
  sourceHash?: string;
  freshness: AgentEvidenceFreshness;
  locator: AgentEvidenceLocator;
  route: AgentEvidenceRoute;
  confidence: Confidence;
  warnings: string[];
  nextActions: string[];
  delegation: AgentEvidenceDelegation;
  routing: TRouting;
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
  readerPackage: string;
  readerContractVersion: string;
  delegationContractVersion: string;
  routing: RoutingDiagnostics;
  rawResult: unknown;
  sourceHash?: string;
  sniffRoute?: string;
  warnings?: string[];
}): AgentEvidenceEnvelope<RoutingDiagnostics> {
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
      sniff: input.sniffRoute ?? 'magic-bytes-v1',
      delegation: input.delegatedTool,
    },
    confidence: 'deterministic',
    warnings,
    nextActions: [
      `Verify delegated evidence from ${input.delegatedTool}`,
      'Re-run read_media after file changes to refresh sourceHash',
    ],
    delegation: {
      contract_version: input.delegationContractVersion,
      source_path: input.sourcePath,
      detected_format: input.detectedFormat,
      delegated_tool: input.delegatedTool,
      reader_package: input.readerPackage,
      reader_contract_version: input.readerContractVersion,
    },
    routing: input.routing,
    result: input.rawResult,
  };
}

export type SmartReaderEvidenceEnvelope = AgentEvidenceEnvelope<RoutingDiagnostics>;
