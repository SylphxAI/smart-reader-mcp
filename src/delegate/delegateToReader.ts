import { createRequire } from 'node:module';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { MediaCategory } from '../sniff/formatSniffer.js';

const require = createRequire(import.meta.url);

export type ReaderToolName = 'read_pdf' | 'read_image' | 'read_video';

export interface ReaderDelegationConfig {
  packageName: string;
  binName: string;
  toolName: ReaderToolName;
}

export const READER_DELEGATION: Record<MediaCategory, ReaderDelegationConfig> = {
  pdf: {
    packageName: '@sylphx/pdf-reader-mcp',
    binName: 'pdf-reader-mcp',
    toolName: 'read_pdf',
  },
  image: {
    packageName: '@sylphx/image-reader-mcp',
    binName: 'image-reader-mcp',
    toolName: 'read_image',
  },
  video: {
    packageName: '@sylphx/video-reader-mcp',
    binName: 'video-reader-mcp',
    toolName: 'read_video',
  },
};

export interface ReaderLaunchSpec {
  command: string;
  args: string[];
  source: 'local' | 'npx';
  packageName: string;
}

export interface DelegateToReaderOptions {
  category: MediaCategory;
  sourcePath: string;
  resolveLaunchSpec?: (config: ReaderDelegationConfig) => ReaderLaunchSpec | null;
  callTool?: (args: {
    launch: ReaderLaunchSpec;
    toolName: ReaderToolName;
    toolArgs: Record<string, unknown>;
  }) => Promise<unknown>;
}

export class ReaderUnavailableError extends Error {
  readonly packageName: string;
  readonly category: MediaCategory;

  constructor(category: MediaCategory, packageName: string, cause?: string) {
    const detail = cause ? ` ${cause}` : '';
    super(
      `Reader package ${packageName} is not available for ${category} delegation.${detail} ` +
        `Install it with: npm install ${packageName}`
    );
    this.name = 'ReaderUnavailableError';
    this.packageName = packageName;
    this.category = category;
  }
}

const resolvePackageEntry = (packageName: string, binName: string): string | null => {
  try {
    const packageJsonPath = require.resolve(`${packageName}/package.json`);
    const packageJson = require(packageJsonPath) as {
      bin?: string | Record<string, string>;
    };
    const binField = packageJson.bin;
    const binRelative =
      typeof binField === 'string' ? binField : (binField?.[binName] ?? binField?.[packageName]);
    if (!binRelative) return null;
    return path.resolve(path.dirname(packageJsonPath), binRelative);
  } catch {
    return null;
  }
};

export const resolveReaderLaunchSpec = (
  config: ReaderDelegationConfig
): ReaderLaunchSpec | null => {
  const localEntry = resolvePackageEntry(config.packageName, config.binName);
  if (localEntry) {
    return {
      command: process.execPath,
      args: [localEntry],
      source: 'local',
      packageName: config.packageName,
    };
  }

  return {
    command: 'npx',
    args: ['-y', config.packageName],
    source: 'npx',
    packageName: config.packageName,
  };
};

const buildToolArgs = (category: MediaCategory, sourcePath: string): Record<string, unknown> => {
  if (category === 'pdf' || category === 'video') {
    return { sources: [{ path: sourcePath }] };
  }
  return { path: sourcePath };
};

const parseToolResult = (result: unknown): unknown => {
  if (typeof result !== 'object' || result === null) return result;

  const record = result as Record<string, unknown>;
  if ('structuredContent' in record && record.structuredContent !== undefined) {
    return record.structuredContent;
  }

  const content = record.content;
  if (Array.isArray(content)) {
    const textBlock = content.find(
      (block): block is { type: string; text: string } =>
        typeof block === 'object' &&
        block !== null &&
        (block as { type?: string }).type === 'text' &&
        typeof (block as { text?: string }).text === 'string'
    );
    if (textBlock?.text) {
      try {
        return JSON.parse(textBlock.text) as unknown;
      } catch {
        return {
          text: textBlock.text,
          isError: typeof record.isError === 'boolean' ? record.isError : false,
        };
      }
    }
  }

  return result;
};

const defaultCallTool = async (args: {
  launch: ReaderLaunchSpec;
  toolName: ReaderToolName;
  toolArgs: Record<string, unknown>;
}): Promise<unknown> => {
  const transport = new StdioClientTransport({
    command: args.launch.command,
    args: args.launch.args,
    stderr: 'pipe',
  });
  const client = new Client({ name: 'smart-reader-mcp', version: '0.1.0' });

  try {
    await client.connect(transport);
    const result = await client.callTool({
      name: args.toolName,
      arguments: args.toolArgs,
    });
    return parseToolResult(result);
  } finally {
    await client.close();
  }
};

export const delegateToReader = async (
  options: DelegateToReaderOptions
): Promise<{ delegated_tool: ReaderToolName; raw_result: unknown; launch: ReaderLaunchSpec }> => {
  const config = READER_DELEGATION[options.category];
  const resolveLaunch = options.resolveLaunchSpec ?? resolveReaderLaunchSpec;
  const launch = resolveLaunch(config);

  if (!launch) {
    throw new ReaderUnavailableError(options.category, config.packageName);
  }

  const callTool = options.callTool ?? defaultCallTool;
  const toolArgs = buildToolArgs(options.category, options.sourcePath);

  try {
    const raw_result = await callTool({
      launch,
      toolName: config.toolName,
      toolArgs,
    });
    return {
      delegated_tool: config.toolName,
      raw_result,
      launch,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ReaderUnavailableError(options.category, config.packageName, message);
  }
};
