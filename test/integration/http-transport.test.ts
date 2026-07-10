/**
 * Integration test for smart-reader MCP server with HTTP transport (Rust rmcp).
 * Proves JSON-RPC communication over streamable HTTP matches the fleet contract.
 */

import { type ChildProcess, execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const binWrapper = path.join(repoRoot, 'bin/smart-reader-mcp');
const mislabeledPath = path.join(repoRoot, 'test/fixtures/mislabeled/png-as-pdf.pdf');
const goldenPath = path.join(repoRoot, 'test/fixtures/read-media-golden.json');
const RUST_HTTP_READY = 'Streamable HTTP MCP listening on http://';

const TEST_HOST = '127.0.0.1';
let baseUrl: string;
const packageJson = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')
) as {
  version: string;
};

const getFreePort = async (): Promise<number> =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, TEST_HOST, () => {
      const address = server.address();
      server.close(() => {
        if (typeof address === 'object' && address) {
          resolve(address.port);
        } else {
          reject(new Error('Failed to allocate a test HTTP port'));
        }
      });
    });
  });

const streamableHttpHeaders = {
  'Content-Type': 'application/json',
  Accept: 'application/json, text/event-stream',
};

const parseMcpResponse = async (response: Response) => {
  const contentType = response.headers.get('content-type') ?? '';
  const body = await response.text();

  if (contentType.includes('application/json')) {
    return JSON.parse(body) as Record<string, unknown>;
  }

  const dataLines = body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice('data:'.length).trim())
    .filter((line) => line.length > 0);

  const payload = dataLines.at(-1);
  if (!payload) {
    throw new SyntaxError(`No MCP JSON payload in streamable HTTP response: ${body.slice(0, 200)}`);
  }
  return JSON.parse(payload) as Record<string, unknown>;
};

const createMcpHttpClient = () => {
  let sessionHeaders: Record<string, string> = { ...streamableHttpHeaders };

  const postMcp = async (body: Record<string, unknown>) => {
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: sessionHeaders,
      body: JSON.stringify(body),
    });
    const sessionId = response.headers.get('mcp-session-id');
    if (sessionId) {
      sessionHeaders = { ...sessionHeaders, 'mcp-session-id': sessionId };
    }
    return response;
  };

  const sendRequest = async (method: string, params?: unknown, id = 1) => {
    const response = await postMcp({
      jsonrpc: '2.0',
      id,
      method,
      params,
    });
    return parseMcpResponse(response);
  };

  const sendNotification = async (method: string, params?: unknown) => {
    await postMcp({
      jsonrpc: '2.0',
      method,
      params,
    });
  };

  const initializeSession = async () => {
    await sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test-http-client', version: '1.0.0' },
    });
    await sendNotification('notifications/initialized');
  };

  return { sendRequest, sendNotification, initializeSession };
};

const waitForRustHttpServer = (serverProc: ChildProcess) =>
  new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Rust HTTP MCP server startup timeout'));
    }, 30_000);

    const onReady = (output: string) => {
      if (output.includes(RUST_HTTP_READY)) {
        clearTimeout(timeout);
        setTimeout(resolve, 200);
      }
    };

    serverProc.stdout?.on('data', (data) => onReady(data.toString()));
    serverProc.stderr?.on('data', (data) => onReady(data.toString()));
  });

describe('MCP Server HTTP Transport Integration (Rust rmcp)', () => {
  let serverProc: ChildProcess;
  let mockImageCli: string;

  beforeAll(async () => {
    execSync('bun run build:rust', { cwd: repoRoot, stdio: 'pipe', timeout: 300_000 });

    const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8')) as {
      mock_readers: { image: { response: Record<string, unknown> } };
    };
    const mockDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smart-reader-http-mock-'));
    mockImageCli = path.join(mockDir, 'image-reader-cli');
    const payload = JSON.stringify(golden.mock_readers.image.response).replace(/'/g, "'\\''");
    fs.writeFileSync(
      mockImageCli,
      `#!/usr/bin/env bash\nset -euo pipefail\nread -r _request\nprintf '%s\\n' '${payload}'\n`
    );
    fs.chmodSync(mockImageCli, 0o755);

    const testPort = await getFreePort();
    baseUrl = `http://${TEST_HOST}:${String(testPort)}/mcp`;
    serverProc = spawn(binWrapper, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        MCP_TRANSPORT: 'http',
        MCP_HTTP_PORT: testPort.toString(),
        MCP_HTTP_HOST: TEST_HOST,
        SMART_READER_IMAGE_CLI: mockImageCli,
      },
    });

    await waitForRustHttpServer(serverProc);
  }, 300_000);

  afterAll(() => {
    serverProc?.kill('SIGTERM');
  });

  it('should respond to health check', async () => {
    const response = await fetch(`${baseUrl}/health`);
    expect(response.ok).toBe(true);
    const data = (await response.json()) as { status?: string };
    expect(data.status).toBe('ok');
  });

  it('should respond to initialize request over HTTP', async () => {
    const client = createMcpHttpClient();
    const response = await client.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test-http-client', version: '1.0.0' },
    });

    expect(response.id).toBe(1);
    const serverInfo = (response.result as { serverInfo?: { name?: string; version?: string } })
      ?.serverInfo;
    expect(serverInfo?.name).toBe('smart-reader-mcp');
    expect(serverInfo?.version).toBe(packageJson.version);
  });

  it('should list available tools over HTTP', async () => {
    const client = createMcpHttpClient();
    await client.initializeSession();

    const response = await client.sendRequest('tools/list', {}, 2);

    expect(response.id).toBe(2);
    const tools = (response.result as { tools?: Array<{ name: string }> })?.tools;
    expect(tools).toBeDefined();
    expect(tools?.length).toBeGreaterThan(0);

    const toolNames = tools?.map((tool) => tool.name) ?? [];
    expect(toolNames).toContain('read_media');
  });

  it('should call read_media tool over HTTP with mocked sibling reader', async () => {
    const client = createMcpHttpClient();
    await client.initializeSession();

    const response = await client.sendRequest(
      'tools/call',
      {
        name: 'read_media',
        arguments: {
          path: mislabeledPath,
        },
      },
      3
    );

    expect(response.id).toBe(3);
    const result = response.result as {
      isError?: boolean;
      structuredContent?: {
        route?: string;
        envelope?: {
          delegation?: { delegated_tool?: string; detected_format?: string };
          routing?: { selected_category?: string };
        };
      };
      content?: Array<{ type?: string; text?: string }>;
    };

    if (response.error || result?.isError) {
      const message =
        (response.error as { message?: string } | undefined)?.message ?? result?.content?.[0]?.text;
      throw new Error(`read_media over HTTP failed: ${message ?? 'unknown error'}`);
    }

    const structured =
      result.structuredContent ??
      (result.content?.[0]?.text
        ? (JSON.parse(result.content[0].text) as {
            route?: string;
            envelope?: {
              delegation?: { delegated_tool?: string; detected_format?: string };
              routing?: { selected_category?: string };
            };
          })
        : undefined);

    expect(structured?.route).toBe('rust-read-media-v1');
    expect(structured?.envelope?.delegation?.delegated_tool).toBe('read_image');
    expect(structured?.envelope?.delegation?.detected_format).toBe('image/png');
    expect(structured?.envelope?.routing?.selected_category).toBe('image');
  });

  it('should not return wildcard CORS headers by default', async () => {
    const response = await fetch(baseUrl, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://example.com',
        'Access-Control-Request-Method': 'POST',
      },
    });

    const corsHeader = response.headers.get('Access-Control-Allow-Origin');
    expect(corsHeader).not.toBe('*');
  });
});

describe('MCP Server HTTP Transport Authentication (Rust rmcp)', () => {
  const API_KEY = 'test-secret-key-123';
  let serverProc: ChildProcess;
  let authBaseUrl: string;

  beforeAll(async () => {
    execSync('bun run build:rust', { cwd: repoRoot, stdio: 'pipe', timeout: 300_000 });

    const testPort = await getFreePort();
    authBaseUrl = `http://${TEST_HOST}:${String(testPort)}/mcp`;
    serverProc = spawn(binWrapper, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        MCP_TRANSPORT: 'http',
        MCP_HTTP_PORT: testPort.toString(),
        MCP_HTTP_HOST: TEST_HOST,
        MCP_API_KEY: API_KEY,
      },
    });

    await waitForRustHttpServer(serverProc);
  }, 300_000);

  afterAll(() => {
    serverProc?.kill('SIGTERM');
  });

  const initialize = (headers: Record<string, string>) =>
    fetch(authBaseUrl, {
      method: 'POST',
      headers: { ...streamableHttpHeaders, ...headers },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'auth-test-client', version: '1.0.0' },
        },
      }),
    });

  it('rejects requests with no X-API-Key header (401)', async () => {
    const response = await initialize({});
    expect(response.status).toBe(401);
    const data = (await response.json()) as { error?: { message?: string } };
    expect(data.error?.message).toContain('X-API-Key');
  });

  it('rejects requests with a wrong X-API-Key (401)', async () => {
    const response = await initialize({ 'X-API-Key': 'wrong-key' });
    expect(response.status).toBe(401);
  });

  it('accepts requests carrying the correct X-API-Key', async () => {
    const response = await initialize({ 'X-API-Key': API_KEY });
    expect(response.status).toBe(200);
    const data = await parseMcpResponse(response);
    const serverInfo = (data.result as { serverInfo?: { name?: string } })?.serverInfo;
    expect(serverInfo?.name).toBe('smart-reader-mcp');
  });

  it('keeps the health endpoint open without a key', async () => {
    const response = await fetch(`${authBaseUrl}/health`);
    expect(response.ok).toBe(true);
    const data = (await response.json()) as { status?: string };
    expect(data.status).toBe('ok');
  });
});