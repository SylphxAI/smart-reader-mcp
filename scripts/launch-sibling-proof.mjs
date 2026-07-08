#!/usr/bin/env node
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const LOCAL_SIBLING_ENTRIES = {
  '@sylphx/image-reader-mcp': path.resolve(repoRoot, '../image-reader-mcp/dist/index.js'),
  '@sylphx/video-reader-mcp': path.resolve(repoRoot, '../video-reader-mcp/dist/index.js'),
};

const resolveBin = (packageName) => {
  const localEntry = LOCAL_SIBLING_ENTRIES[packageName];
  if (localEntry) return localEntry;
  const packageJsonPath = require.resolve(`${packageName}/package.json`);
  const pkg = require(packageJsonPath);
  const binField = pkg.bin;
  const binRelative = typeof binField === 'string' ? binField : Object.values(binField ?? {})[0];
  return path.resolve(path.dirname(packageJsonPath), binRelative);
};

const callTool = async (entry, toolName, args) => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [entry],
    stderr: 'pipe',
  });
  const client = new Client({ name: 'sibling-proof', version: '0.1.0' });
  await client.connect(transport);
  const result = await client.callTool({ name: toolName, arguments: args });
  await client.close();
  const text = result.content?.find((b) => b.type === 'text')?.text;
  if (!text || result.isError) throw new Error(text ?? 'tool error');
  return JSON.parse(text);
};

const lines = [];
const log = (s) => {
  lines.push(s);
  console.log(s);
};

const imageFixture = path.resolve(repoRoot, '../image-reader-mcp/test/fixtures/sample.png');

try {
  log('=== sibling MCP launch proof ===');
  const imageEntry = resolveBin('@sylphx/image-reader-mcp');
  const imageResult = await callTool(imageEntry, 'read_image', { path: imageFixture });
  log(`read_image dimensions: ${imageResult.dimensions.width}x${imageResult.dimensions.height}`);
  log(`read_image mime: ${imageResult.mime}`);

  const videoEntry = resolveBin('@sylphx/video-reader-mcp');
  const hasFfprobe = await new Promise((resolve) => {
    import('node:child_process').then(({ spawn }) => {
      const child = spawn('ffprobe', ['-version'], { stdio: 'ignore' });
      child.on('error', () => resolve(false));
      child.on('exit', (code) => resolve(code === 0));
    });
  });
  if (hasFfprobe) {
    const videoFixture = path.resolve(repoRoot, 'test/fixtures/sample.mp4');
    const videoResult = await callTool(videoEntry, 'read_video', { path: videoFixture });
    log(`read_video streams: ${videoResult.timeline?.streams?.length ?? 0}`);
  } else {
    log('read_video skipped: ffprobe not installed (unit tests cover parsers)');
  }
} catch (error) {
  log(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}