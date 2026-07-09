import { beforeAll, describe, expect, it } from 'bun:test';
import { execSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const rustCliBin = path.join(repoRoot, 'target/release/smart-reader-cli');
const mislabeledPath = path.join(repoRoot, 'test/fixtures/mislabeled/png-as-pdf.pdf');
const imageReaderCli = path.resolve(repoRoot, '../image-reader-mcp/target/release/image-reader-cli');

type CliEnvelope = {
  status?: string;
  code?: string;
  message?: string;
  engine?: string;
  route?: string;
  sniff?: { route?: string; format?: string; category?: string };
  resolved_path?: string;
  envelope?: {
    route?: { sniff?: string };
    delegation?: { delegated_tool?: string; detected_format?: string };
    routing?: { sniff_method?: string; selected_category?: string };
  };
};

const invokeCli = (tool: string, input: Record<string, unknown>, env: NodeJS.ProcessEnv) => {
  const probe = spawnSync(rustCliBin, [], {
    cwd: repoRoot,
    encoding: 'utf8',
    env,
    input: JSON.stringify({ tool, input }),
    timeout: 30_000,
  });
  expect(probe.status).toBe(0);
  return JSON.parse(probe.stdout) as CliEnvelope;
};

describe('shipped path matrix (Rust core, no legacy flags)', () => {
  let fakeNodeEnv: NodeJS.ProcessEnv;
  let nodeInvokeLog: string;

  beforeAll(() => {
    execSync('bun run build:rust', { cwd: repoRoot, stdio: 'pipe', timeout: 300_000 });
    if (existsSync(imageReaderCli)) {
      execSync(`cargo build --release -p image-reader-cli`, {
        cwd: path.resolve(repoRoot, '../image-reader-mcp'),
        stdio: 'pipe',
        timeout: 300_000,
      });
    }

    const probeDir = mkdtempSync(path.join(os.tmpdir(), 'smart-reader-matrix-probe-'));
    nodeInvokeLog = path.join(probeDir, 'node-invoke.log');
    const fakeNode = path.join(probeDir, 'node');
    writeFileSync(
      fakeNode,
      `#!/usr/bin/env bash\nprintf '%s\\n' "$@" >> "${nodeInvokeLog}"\nexit 99\n`
    );
    chmodSync(fakeNode, 0o755);

    fakeNodeEnv = {
      ...process.env,
      SMART_READER_NODE: fakeNode,
      SMART_READER_ALLOW_LEGACY_ENGINE: '',
      SMART_READER_MCP_TRANSPORT: '',
      ...(existsSync(imageReaderCli) ? { SMART_READER_IMAGE_CLI: imageReaderCli } : {}),
    };
  }, 300_000);

  it('sniff_format routes through smart-reader-core without legacy runtime', () => {
    const envelope = invokeCli('sniff_format', { path: mislabeledPath }, fakeNodeEnv);
    expect(envelope.status).toBe('ok');
    expect(envelope.engine).toBe('smart-reader-core');
    expect(envelope.sniff?.route).toBe('rust-sniff');
    expect(envelope.sniff?.format).toBe('image/png');
    expect(existsSync(nodeInvokeLog)).toBe(false);
  });

  it('resolve_media_path returns a stable path without legacy runtime', () => {
    const envelope = invokeCli('resolve_media_path', { path: mislabeledPath }, fakeNodeEnv);
    expect(envelope.status).toBe('ok');
    expect(envelope.engine).toBe('smart-reader-core');
    expect(envelope.resolved_path?.length).toBeGreaterThan(0);
    expect(existsSync(nodeInvokeLog)).toBe(false);
  });

  it('read_media returns rust-read-media-v1 with rust-sniff when image CLI is available', () => {
    if (!existsSync(imageReaderCli)) {
      return;
    }

    const envelope = invokeCli('read_media', { path: mislabeledPath }, fakeNodeEnv);
    expect(envelope.status).toBe('ok');
    expect(envelope.route).toBe('rust-read-media-v1');
    expect(envelope.envelope?.route?.sniff).toBe('rust-sniff');
    expect(envelope.envelope?.delegation?.delegated_tool).toBe('read_image');
    expect(envelope.envelope?.routing?.selected_category).toBe('image');
    expect(existsSync(nodeInvokeLog)).toBe(false);
  });

  it('default bin resolves staged rmcp server', () => {
    const bin = path.join(repoRoot, 'bin/smart-reader-mcp');
    expect(existsSync(bin)).toBe(true);
    const staged = path.join(repoRoot, 'bin/native/smart-reader-mcp-server');
    expect(existsSync(staged)).toBe(true);
  });
});