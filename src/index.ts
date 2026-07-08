#!/usr/bin/env node

import { createRequire } from 'node:module';
import { readMedia } from './handlers/readMedia.js';
import { createServer } from './mcp.js';

const require = createRequire(import.meta.url);
const packageJson = require('../package.json') as { version: string };

const server = createServer({
  name: 'smart-reader-mcp',
  version: packageJson.version,
  instructions:
    'Unified media reader MCP server. Call read_media with a local file path; format is sniffed and delegated to the matching Sylphx Reader sibling (pdf, image, or video).',
  tools: {
    read_media: readMedia,
  },
});

async function main(): Promise<void> {
  await server.start();

  if (process.env['DEBUG_MCP']) {
    console.error('[Smart Reader MCP] Server running on stdio');
    console.error('[Smart Reader MCP] Project root:', process.cwd());
  }
}

main().catch((error: unknown) => {
  console.error('[Smart Reader MCP] Server error:', error);
  process.exit(1);
});