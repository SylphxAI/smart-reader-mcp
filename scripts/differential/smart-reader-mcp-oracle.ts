#!/usr/bin/env bun
/**
 * TS contract oracle for smart-reader-mcp read_media differential (rej-010 / tick015).
 * Pure TypeScript handler baseline vs Rust rmcp/core SSOT.
 * Fail-closed allow-list: only proven tool `read_media`.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createReadMediaHandler } from '../../src/handlers/readMedia.ts';
import { sniffFormat } from '../../src/sniff/formatSniffer.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '../..');
const CORPUS_PATH = join(__dirname, 'fixtures/smart-reader-mcp-corpus.json');
const FIXTURES_ROOT = join(REPO_ROOT, 'test/fixtures');

interface ToolRouteCase {
  id: string;
  tool: string;
  expect: string;
}

interface ToolCase {
  id: string;
  fixture: string;
  mockReader?: string;
  expect: {
    status: 'ok' | 'error';
    message_contains?: string;
    delegated_tool?: string;
    detected_format?: string;
    selected_category?: string;
    result?: unknown;
  };
}

interface MockReader {
  raw_result: unknown;
  cli_response: unknown;
}

interface Corpus {
  corpusVersion: number;
  toolRouteCases: ToolRouteCase[];
  serverContract: {
    name: string;
    version: string;
    tools: string[];
  };
  toolCases: ToolCase[];
  mockReaders: Record<string, MockReader>;
  allowList: {
    tools: string[];
  };
}

export interface DifferentialCase {
  readonly id: string;
  readonly slice: string;
  readonly domain: 'tool' | 'toolRouteContract' | 'serverContract' | 'allowList';
  readonly input: Record<string, unknown>;
  readonly output: unknown;
}

function fixtureCorpusHash(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

function extractText(result: unknown): string | undefined {
  if (!result || typeof result !== 'object') return undefined;
  const r = result as {
    content?: Array<{ text?: string }>;
    text?: string;
    isError?: boolean;
  };
  if (typeof r.text === 'string') return r.text;
  return r.content?.[0]?.text;
}

function isErrorResult(result: unknown): boolean {
  if (!result || typeof result !== 'object') return false;
  return (result as { isError?: boolean }).isError === true;
}

async function invokeTsReadMedia(
  fixturePath: string,
  mock: MockReader | undefined
): Promise<{ status: 'ok' | 'error'; view: Record<string, unknown> }> {
  const handler = createReadMediaHandler({
    sniffFormat,
    ...(mock
      ? {
          delegateToReader: async ({ category }) => {
            const tool =
              category === 'pdf'
                ? ('read_pdf' as const)
                : category === 'image'
                  ? ('read_image' as const)
                  : ('read_video' as const);
            return {
              delegated_tool: tool,
              raw_result: mock.raw_result,
              launch: {
                command: process.execPath,
                args: ['mock-reader'],
                source: 'local' as const,
                packageName: `@sylphx/${category}-reader-mcp`,
              },
            };
          },
        }
      : {}),
  });

  const result = await handler.handler({
    input: { path: fixturePath },
    ctx: {},
  });

  if (isErrorResult(result)) {
    const message = extractText(result) ?? '';
    return {
      status: 'error',
      view: {
        status: 'error',
        message_contains: message.includes('Unsupported')
          ? 'Unsupported'
          : message.slice(0, 64),
      },
    };
  }

  const text = extractText(result);
  if (!text) {
    throw new Error(`TS oracle missing text payload for ${fixturePath}`);
  }
  const envelope = JSON.parse(text) as {
    locator?: { detectedFormat?: string };
    delegation?: { delegated_tool?: string };
    routing?: { selected_category?: string };
    result?: unknown;
  };

  return {
    status: 'ok',
    view: {
      status: 'ok',
      delegated_tool: envelope.delegation?.delegated_tool,
      detected_format: envelope.locator?.detectedFormat,
      selected_category: envelope.routing?.selected_category,
      result: envelope.result,
    },
  };
}

async function main(): Promise<void> {
  const raw = await readFile(CORPUS_PATH, 'utf8');
  const corpus = JSON.parse(raw) as Corpus;
  if (corpus.corpusVersion !== 1) {
    throw new Error(`unsupported corpusVersion: ${corpus.corpusVersion}`);
  }

  const cases: DifferentialCase[] = [];

  for (const testCase of corpus.toolRouteCases) {
    cases.push({
      id: testCase.id,
      slice: 'tool-route-contract',
      domain: 'toolRouteContract',
      input: { tool: testCase.tool },
      output: { route: testCase.expect },
    });
  }

  // Fail-closed allow-list: only proven tools may appear on the public surface.
  cases.push({
    id: 'allow-list-tools',
    slice: 'allow-list',
    domain: 'allowList',
    input: { tools: corpus.allowList.tools },
    output: { tools: corpus.allowList.tools },
  });

  cases.push({
    id: 'server-contract-rmcp',
    slice: 'server-contract',
    domain: 'serverContract',
    input: { tools: corpus.serverContract.tools },
    output: {
      name: corpus.serverContract.name,
      version: corpus.serverContract.version,
      tools: corpus.serverContract.tools,
    },
  });

  for (const testCase of corpus.toolCases) {
    const fixturePath = resolve(FIXTURES_ROOT, testCase.fixture);
    if (!existsSync(fixturePath)) {
      throw new Error(`missing fixture ${testCase.fixture} at ${fixturePath}`);
    }

    const mock = testCase.mockReader
      ? corpus.mockReaders[testCase.mockReader]
      : undefined;
    if (testCase.mockReader && !mock) {
      throw new Error(`missing mockReader ${testCase.mockReader}`);
    }

    const { view } = await invokeTsReadMedia(fixturePath, mock);

    if (testCase.expect.status === 'error') {
      if (view.status !== 'error') {
        throw new Error(`TS oracle expected error for ${testCase.id}, got ${JSON.stringify(view)}`);
      }
      const needle = (testCase.expect.message_contains ?? '').toLowerCase();
      const actualNeedle = String(view.message_contains ?? '').toLowerCase();
      if (needle && !actualNeedle.includes(needle) && actualNeedle !== needle) {
        // view.message_contains may already be the needle token we set
        if (actualNeedle !== needle) {
          // accept if we normalized to the expected token
          const ok =
            actualNeedle === needle ||
            (typeof view.message_contains === 'string' &&
              view.message_contains.toLowerCase().includes(needle));
          if (!ok) {
            throw new Error(
              `TS oracle error message mismatch for ${testCase.id}: ${JSON.stringify(view)}`
            );
          }
        }
      }
      cases.push({
        id: testCase.id,
        slice: 'read-media',
        domain: 'tool',
        input: { tool: 'read_media', fixture: testCase.fixture },
        output: {
          status: 'error',
          message_contains: testCase.expect.message_contains,
        },
      });
      continue;
    }

    if (view.status !== 'ok') {
      throw new Error(`TS oracle expected ok for ${testCase.id}: ${JSON.stringify(view)}`);
    }

    for (const key of [
      'delegated_tool',
      'detected_format',
      'selected_category',
      'result',
    ] as const) {
      if (JSON.stringify(view[key]) !== JSON.stringify(testCase.expect[key])) {
        throw new Error(
          `TS oracle parity-view mismatch for ${testCase.id}.${key}: got ${JSON.stringify(view[key])} expected ${JSON.stringify(testCase.expect[key])}`
        );
      }
    }

    cases.push({
      id: testCase.id,
      slice: 'read-media',
      domain: 'tool',
      input: {
        tool: 'read_media',
        fixture: testCase.fixture,
        mockReader: testCase.mockReader,
      },
      output: {
        status: 'ok',
        delegated_tool: testCase.expect.delegated_tool,
        detected_format: testCase.expect.detected_format,
        selected_category: testCase.expect.selected_category,
        result: testCase.expect.result,
      },
    });
  }

  // Ensure fixtures referenced by corpus exist for Rust side.
  const corpusDoc = JSON.parse(raw) as Corpus;
  for (const [name, mock] of Object.entries(corpusDoc.mockReaders)) {
    if (!mock.cli_response) {
      throw new Error(`mockReader ${name} missing cli_response`);
    }
  }

  // Touch corpus file path so rust can also load mockReaders from disk.
  void readFileSync(CORPUS_PATH, 'utf8');

  const payload = {
    corpusVersion: corpus.corpusVersion,
    fixtureCorpusHash: fixtureCorpusHash(raw),
    cases,
  };
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

await main();
