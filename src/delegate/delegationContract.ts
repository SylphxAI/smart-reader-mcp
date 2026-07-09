import { createRequire } from 'node:module';
import path from 'node:path';
import type { MediaCategory, SniffResult } from '../sniff/formatSniffer.js';
import {
  type ReaderDelegationConfig,
  READER_DELEGATION,
  type ReaderLaunchSpec,
  type ReaderToolName,
} from './delegateToReader.js';

const require = createRequire(import.meta.url);
const packageJson = require('../../package.json') as {
  optionalDependencies?: Record<string, string>;
};

export const DELEGATION_CONTRACT_VERSION = 'smart-reader-delegation-v1';

const ALL_CATEGORIES: MediaCategory[] = ['pdf', 'image', 'video'];

export type RoutingAlternative = {
  category: MediaCategory;
  delegated_tool: ReaderToolName;
  reader_package: string;
  reader_contract_version: string;
  reason: string;
};

export type RoutingDiagnostics = {
  contract_version: typeof DELEGATION_CONTRACT_VERSION;
  sniff_method: string;
  selected_category: MediaCategory;
  selection_reason: string;
  declared_extension: string | null;
  alternatives: RoutingAlternative[];
  launch_source: ReaderLaunchSpec['source'];
  reader_package: string;
};

export const readerContractVersion = (packageName: string): string =>
  packageJson.optionalDependencies?.[packageName] ?? 'unpinned';

export const buildRoutingDiagnostics = (input: {
  sniffed: SniffResult;
  sourcePath: string;
  launch: ReaderLaunchSpec;
  selectedConfig: ReaderDelegationConfig;
}): RoutingDiagnostics => {
  const declaredExtension = path.extname(input.sourcePath).toLowerCase() || null;
  const sniffMethod = input.sniffed.route ?? 'magic-bytes-v1';
  const selectedCategory = input.sniffed.category as MediaCategory;

  const extensionMismatch =
    declaredExtension !== null &&
    declaredExtension !== `.${input.sniffed.format}` &&
    !declaredExtensionMatchesFormat(declaredExtension, input.sniffed.format);

  const selectionReason = extensionMismatch
    ? `Sniffed format ${input.sniffed.format} overrides declared extension ${declaredExtension}.`
    : `Sniffed format ${input.sniffed.format} maps to the ${selectedCategory} reader ${input.selectedConfig.toolName}.`;

  const alternatives = ALL_CATEGORIES.filter((category) => category !== selectedCategory).map(
    (category) => {
      const config = READER_DELEGATION[category];
      return {
        category,
        delegated_tool: config.toolName,
        reader_package: config.packageName,
        reader_contract_version: readerContractVersion(config.packageName),
        reason: `Not selected: detected format ${input.sniffed.format} does not map to ${category}.`,
      };
    }
  );

  return {
    contract_version: DELEGATION_CONTRACT_VERSION,
    sniff_method: sniffMethod,
    selected_category: selectedCategory,
    selection_reason: selectionReason,
    declared_extension: declaredExtension,
    alternatives,
    launch_source: input.launch.source,
    reader_package: input.selectedConfig.packageName,
  };
};

const declaredExtensionMatchesFormat = (
  declaredExtension: string,
  detectedFormat: string
): boolean => {
  const extensionToFormat: Record<string, string> = {
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

  return extensionToFormat[declaredExtension] === detectedFormat;
};