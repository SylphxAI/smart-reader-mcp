<div align="center">

# 🧠 Smart Reader MCP

### Your agent found a file. **Did it pick the right reader?**

One MCP call reads PDF, image, or video. Smart Reader sniffs format, delegates to
the matching Sylphx Reader sibling, and returns a **provenance envelope** you can
trust — no manual format routing required.

[![npm version](https://img.shields.io/npm/v/@sylphx/smart-reader-mcp?style=flat-square)](https://www.npmjs.com/package/@sylphx/smart-reader-mcp)
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](https://opensource.org/licenses/MIT)
[![CI/CD](https://img.shields.io/github/actions/workflow/status/SylphxAI/smart-reader-mcp/ci.yml?style=flat-square&label=CI/CD)](https://github.com/SylphxAI/smart-reader-mcp/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-7.0-blue.svg?style=flat-square)](https://www.typescriptlang.org/)

**Local-first** · **One smart `read_media` call** · **Delegation provenance envelope** · **33 tests**

[⭐ Star this repo](https://github.com/SylphxAI/smart-reader-mcp) if agents should read any media file without you wiring format switches.
· [Quick start](#quick-start) · [See it work](#see-it-work) · [Why not manual format routing?](#why-not-manual-format-routing)

</div>

---

## The problem

Agents receive files with misleading extensions, mixed portfolios, and formats
that need different parsers. PDF needs evidence twins. Images need metadata and
OCR geometry. Videos need ffprobe timelines — not one-size-fits-all text dumps.

Most stacks force the **agent or the human** to branch on extension, install the
right tool, and hope delegation still returns citeable provenance. Wrong reader,
wrong schema, silent partial reads. Then citations break — quietly.

**Smart Reader MCP is built for the moment your agent needs one read tool that
sniffs format and delegates with proof.**

## Why not manual format routing?

| Typical routing path | Smart Reader MCP |
| --- | --- |
| Agent guesses format from extension | Magic-byte sniffing with extension fallback |
| Separate MCP configs per format | One `read_media` call delegates to the right sibling |
| Opaque passthrough results | Normalized envelope: `source_path`, `detected_format`, `delegated_tool`, `raw_result` |
| Re-implemented parsers in one repo | Delegates to `@sylphx/pdf-reader-mcp`, `@sylphx/image-reader-mcp`, `@sylphx/video-reader-mcp` |
| Cloud routing services | **Local-first** stdio delegation to sibling packages |
| Ship and pray | **33** tests on sniffing, mislabeled routing, doctor, release gate, and delegation |

## See it work

**Install once. Call once.**

```bash
claude mcp add smart-reader -- npx @sylphx/smart-reader-mcp
```

```json
{
  "path": "/absolute/path/to/report.pdf"
}
```

`read_media` sniffs the file, spawns the matching sibling MCP server, and
returns a provenance envelope:

```json
{
  "source_path": "/absolute/path/to/report.pdf",
  "detected_format": "pdf",
  "delegated_tool": "read_pdf",
  "raw_result": {}
}
```

The `raw_result` field is the passthrough payload from the delegated reader
(`read_pdf`, `read_image`, or `read_video`). Install the siblings you need:

```bash
npm install @sylphx/pdf-reader-mcp @sylphx/image-reader-mcp @sylphx/video-reader-mcp
```

Supported formats:

- PDF: `.pdf`
- Image: `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.tif`, `.tiff`
- Video: `.mp4`, `.m4v`, `.mkv`, `.mov`, `.webm`

## Sylphx Reader portfolio

Portfolio architecture lives **here** — this repo owns dispatch and the unified
read tool. Format-specific repos own their own parsers and boundary ADRs.

| Repository | Package | Role |
| --- | --- | --- |
| [pdf-reader-mcp](https://github.com/SylphxAI/pdf-reader-mcp) | `@sylphx/pdf-reader-mcp` | PDF (production; independent project) |
| [image-reader-mcp](https://github.com/SylphxAI/image-reader-mcp) | `@sylphx/image-reader-mcp` | Image read |
| [video-reader-mcp](https://github.com/SylphxAI/video-reader-mcp) | `@sylphx/video-reader-mcp` | Video read |
| **smart-reader-mcp** (this repo) | `@sylphx/smart-reader-mcp` | Sniff + delegate + unified `read_media` |

Full decision record: [ADR-0002: Reader Portfolio Architecture](docs/adr/0002-reader-portfolio-architecture.md).

### Read vs interpret

- **Read:** metadata, OCR, subtitles, scenes, transcripts — deterministic, no generative LLM default.
- **Interpret:** summarization / VQA — agent or optional remote provider; out of scope for Reader MCP packages.

## MCP Tool Surface

| Tool | Use it when the agent needs to... |
| --- | --- |
| `read_media` | Read a local PDF, image, or video by sniffing format and delegating to the matching Sylphx Reader sibling. |

## Quick Start

### Claude Code

```bash
claude mcp add smart-reader -- npx @sylphx/smart-reader-mcp
```

### Claude Desktop

Add this to `claude_desktop_config.json`:

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

### Any MCP Client

```bash
npx @sylphx/smart-reader-mcp
```

Node.js `>=22.13` is required. Delegation resolves locally installed sibling
packages first, then falls back to `npx -y @sylphx/<reader>-mcp`.

## Development

```bash
git clone https://github.com/SylphxAI/smart-reader-mcp.git
cd smart-reader-mcp
bun install
bun run build
bun test
bun run doctor
bun run benchmark:release-gate
```

Useful checks:

```bash
bun run check
bun run typecheck
bun run validate
bun run benchmark:release-gate
```

Example `read_media` requests live in [`examples/`](examples/).

## Support

- [Issues](https://github.com/SylphxAI/smart-reader-mcp/issues)
- [npm package](https://www.npmjs.com/package/@sylphx/smart-reader-mcp)
- Portfolio ADR: [ADR-0002](docs/adr/0002-reader-portfolio-architecture.md)

## Help this reach more builders

If manual format routing has wasted your MCP configs, your agent prompts, or your
trust in mixed-media workflows, you are exactly who this project is for.

**[⭐ Star the repo](https://github.com/SylphxAI/smart-reader-mcp)** — it is the
fastest way to help more agent builders find one-call media reading. Share it in
your MCP client setup, team wiki, or agent stack README.

### Discovery (in progress)

| Channel | Status |
| --- | --- |
| [Glama MCP directory](https://glama.ai/mcp/servers/SylphxAI/smart-reader-mcp) | Listed — [claim server](https://glama.ai/mcp/servers/SylphxAI/smart-reader-mcp/admin) for full discoverability |
| [Official MCP Registry](https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.SylphxAI/smart-reader-mcp) | Listed — `io.github.SylphxAI/smart-reader-mcp` @ v0.1.1 |
| [TensorBlock MCP Index PR #1113](https://github.com/TensorBlock/awesome-mcp-servers/pull/1113) | Open — multimedia/document processing listing |
| [MCP servers community issue #4500](https://github.com/modelcontextprotocol/servers/issues/4500) | Open — community server highlight |
| [mcp.so listing issue #3068](https://github.com/chatmcp/mcpso/issues/3068) | Open — directory submission request |
| [mcpservers.org submit](https://mcpservers.org/submit) | Not listed yet — free web-form submission |

Know another MCP directory? [Open an issue](https://github.com/SylphxAI/smart-reader-mcp/issues/new) with the link.

## License

MIT © [SylphxAI](https://github.com/SylphxAI)