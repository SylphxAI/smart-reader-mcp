#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const resolveBin = (packageName, binName) => {
  const packageJsonPath = require.resolve(`${packageName}/package.json`);
  const pkg = require(packageJsonPath);
  const binField = pkg.bin;
  const binRelative =
    typeof binField === 'string' ? binField : binField?.[binName] ?? binField?.[packageName];
  return path.resolve(path.dirname(packageJsonPath), binRelative);
};

const smartEntry = path.resolve(repoRoot, 'dist/index.js');
const pdfFixture = path.resolve(repoRoot, '../pdf-reader-mcp/test/fixtures/sample.pdf');
const imageFixture = path.resolve(repoRoot, '../image-reader-mcp/test/fixtures/sample.png');

const callReadMedia = async (sourcePath) => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [smartEntry],
    stderr: 'pipe',
  });
  const client = new Client({ name: 'read-media-proof', version: '0.1.0' });
  await client.connect(transport);
  const result = await client.callTool({
    name: 'read_media',
    arguments: { path: sourcePath },
  });
  await client.close();
  const text = result.content?.find((b) => b.type === 'text')?.text;
  if (!text) throw new Error(`No text content for ${sourcePath}`);
  if (result.isError) throw new Error(text);
  return JSON.parse(text);
};

const hasFfprobe = () =>
  new Promise((resolve) => {
    const child = spawn('ffprobe', ['-version'], { stdio: 'ignore' });
    child.on('error', () => resolve(false));
    child.on('exit', (code) => resolve(code === 0));
  });

const lines = [];
const log = (line) => {
  lines.push(line);
  console.log(line);
};

try {
  log('=== read_media launch proof ===');
  log(`smart-reader entry: ${smartEntry}`);

  const pdfEnvelope = await callReadMedia(pdfFixture);
  log(`PDF detected_format=${pdfEnvelope.detected_format} delegated_tool=${pdfEnvelope.delegated_tool}`);
  if (!pdfEnvelope.raw_result) throw new Error('PDF raw_result empty');
  log(`PDF raw_result keys: ${Object.keys(pdfEnvelope.raw_result).slice(0, 8).join(',')}`);

  const imageEnvelope = await callReadMedia(imageFixture);
  log(
    `IMAGE detected_format=${imageEnvelope.detected_format} delegated_tool=${imageEnvelope.delegated_tool}`
  );
  const imageTwin = imageEnvelope.raw_result;
  if (!imageTwin?.dimensions) throw new Error('Image dimensions missing');
  log(`IMAGE dimensions: ${imageTwin.dimensions.width}x${imageTwin.dimensions.height}`);

  if (await hasFfprobe()) {
    const videoFixture = path.resolve(repoRoot, 'test/fixtures/sample.mp4');
    const videoEnvelope = await callReadMedia(videoFixture);
    log(
      `VIDEO detected_format=${videoEnvelope.detected_format} delegated_tool=${videoEnvelope.delegated_tool}`
    );
    const timeline = videoEnvelope.raw_result?.timeline ?? videoEnvelope.raw_result;
    if (!timeline?.streams && !timeline?.format) throw new Error('Video timeline metadata missing');
    log(`VIDEO streams: ${timeline.streams?.length ?? 0}`);
  } else {
    log('VIDEO skipped: ffprobe not available in environment');
  }

  const outPath = process.env.SCRATCH
    ? `${process.env.SCRATCH}/read-media-launch.log`
    : '/tmp/read-media-launch.log';
  writeFileSync(outPath, `${lines.join('\n')}\n`);
  log(`Wrote ${outPath}`);
} catch (error) {
  log(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}