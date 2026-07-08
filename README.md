# Smart Reader MCP

> One MCP call reads PDF, image, or video by sniffing format and delegating to Sylphx Reader siblings.

**Status:** v0.1.0 — `read_media` ships with format sniffing, sibling delegation, and provenance envelope.

Portfolio architecture (orchestration only): [ADR-0002](docs/adr/0002-reader-portfolio-architecture.md).

| Repository | Role |
| --- | --- |
| [pdf-reader-mcp](https://github.com/SylphxAI/pdf-reader-mcp) | PDF (production) |
| [image-reader-mcp](https://github.com/SylphxAI/image-reader-mcp) | Image |
| [video-reader-mcp](https://github.com/SylphxAI/video-reader-mcp) | Video |
| **smart-reader-mcp** (this repo) | Sniff format + delegate; phase 2 adds universal local/remote paths here |

## Read vs interpret

**Read** (this repo): extract facts, metadata, transcripts, regions, and timelines with provenance — **no generative LLM required**.

**Interpret** (out of scope): summarize, classify, or answer open questions — belongs in the agent or an optional remote provider adapter.

## MCP surface (v0.1.0)

### `read_media`

Reads a local file by sniffing magic bytes and extension, then delegates to the matching Sylphx Reader sibling MCP server.

**Input**

```json
{
  "path": "/absolute/or/relative/path/to/media.pdf"
}
```

**Supported formats**

- PDF: `.pdf`
- Image: `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.tif`, `.tiff`
- Video: `.mp4`, `.m4v`, `.mkv`, `.mov`, `.webm`

**Response envelope**

Every successful call returns a normalized envelope with provenance:

```json
{
  "source_path": "/path/to/media.pdf",
  "detected_format": "pdf",
  "delegated_tool": "read_pdf",
  "raw_result": {}
}
```

- `source_path` — resolved absolute path that was read
- `detected_format` — sniffed format (magic bytes first, extension fallback)
- `delegated_tool` — sibling tool invoked (`read_pdf`, `read_image`, or `read_video`)
- `raw_result` — passthrough result from the delegated reader

## Delegation model

Smart Reader does **not** parse PDF/image/video itself. It spawns a stdio MCP client to the matching sibling package:

1. Resolve a locally installed sibling (`@sylphx/pdf-reader-mcp`, etc.) via `node <package-bin>`
2. Fall back to `npx -y @sylphx/<reader>-mcp` when the package is not installed locally
3. Return an informative install hint if delegation fails

Install the readers you need:

```bash
npm install @sylphx/pdf-reader-mcp
npm install @sylphx/image-reader-mcp
npm install @sylphx/video-reader-mcp
```

## Quick start

```bash
git clone https://github.com/SylphxAI/smart-reader-mcp.git
cd smart-reader-mcp
bun install
bun run build
npx @sylphx/smart-reader-mcp
```

### MCP client config (stdio)

```json
{
  "mcpServers": {
    "smart-reader": {
      "command": "npx",
      "args": ["-y", "@sylphx/smart-reader-mcp"]
    }
  }
}
```

## Development

```bash
bun install
bun run validate
```

## License

MIT © [SylphxAI](https://github.com/SylphxAI)