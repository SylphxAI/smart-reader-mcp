<div align="center">

# Prism

### One beam in. Right instrument out. 

**Prism** (transitional package `@sylphx/smart-reader-mcp`) — sniff + route local media to Citra / Iris / Cue.

<p align="center">
  <img src="https://mark.sylphx.com/api/v1/banner?type=liquid&theme=tokyonight&text=smart+reader+mcp&desc=One+MCP+call+reads+PDF%2C+image%2C+or+video+by+sniffing+format+and+delegating+to+Syl&height=200&animation=rise&credit=0" alt="smart-reader-mcp — Sylphx Mark banner" width="100%" />
</p>

### Your agent found a file. **Did it pick the right reader?**

One MCP call reads PDF, image, or video. **Prism** sniffs format, delegates to
the matching Sylphx Reader sibling, and returns a **provenance envelope** you can
trust — no manual format routing required.

[![npm version](https://img.shields.io/npm/v/@sylphx/smart-reader-mcp?style=flat-square)](https://www.npmjs.com/package/@sylphx/smart-reader-mcp)
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](https://opensource.org/licenses/MIT)
[![CI/CD](https://img.shields.io/github/actions/workflow/status/SylphxAI/smart-reader-mcp/ci.yml?style=flat-square&label=CI/CD)](https://github.com/SylphxAI/smart-reader-mcp/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-7.0-blue.svg?style=flat-square)](https://www.typescriptlang.org/)

**Local-first** · **One smart `read_media` call** · **Delegation provenance envelope** · **50+ tests**

SOTA family roadmap: [docs/roadmap/sota-family-roadmap.md](docs/roadmap/sota-family-roadmap.md).

[⭐ Star this repo](https://github.com/SylphxAI/smart-reader-mcp) if agents should read any media file without you wiring format switches.
· [Quick start](#quick-start) · [See it work](#see-it-work) · [Why not manual format routing?](#why-not-manual-format-routing)

</div>

---


## Product docs

| Doc | Purpose |
| --- | --- |
| [docs/POSITIONING.md](docs/POSITIONING.md) | Strategic positioning |
| [docs/COMPETITIVE.md](docs/COMPETITIVE.md) | Peer anchors and wedge |
| [docs/EVIDENCE_CONTRACT.md](docs/EVIDENCE_CONTRACT.md) | Evidence = result contract |
| [docs/TOOL_SURFACE.md](docs/TOOL_SURFACE.md) | Few clear tools policy |
| [docs/PRODUCT_INDEPENDENCE.md](docs/PRODUCT_INDEPENDENCE.md) | This repo is SSOT |
| [docs/IPPB.md](docs/IPPB.md) | Independent public product bar |
| [docs/PUBLISH.md](docs/PUBLISH.md) | npm/git publish status |

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
| Ship and pray | **50+** tests on sniffing, mislabeled routing, doctor, release gate, and delegation |

## See it work

**Install once. Call once.**

```bash
npm install -g @sylphx/smart-reader-mcp
prism doctor
# brand bin + MCP
claude mcp add smart-reader -- npx @sylphx/smart-reader-mcp
```

### Install (30 seconds)

| Surface | Command |
| --- | --- |
| npm global | `npm i -g @sylphx/smart-reader-mcp` |
| brand bin | `prism` |
| MCP | `npx @sylphx/smart-reader-mcp` |


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
  "raw_result": {
    "page_count": 12,
    "title": "Q3 Report",
    "trust_report": { "warnings": [] }
  }
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

## Product independence

This repository is product SSOT for Prism. Sibling readers (PDF/image/video) are separate repositories; composition is via public contracts only — not a monorepo.

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

## Security model

- **Local paths only** — `read_media` resolves files on disk; no remote fetch by default.
- **Magic-byte sniffing** — format detection uses file content, not extension alone.
- **Sibling delegation** — spawns known Sylphx Reader packages (`@sylphx/pdf-reader-mcp`, etc.) via `npx -y`; no arbitrary executables.
- **Provenance envelope** — `detected_format`, `delegated_tool`, and `source_path` are always returned for audit.

## Release proof

Claims are backed by CI `benchmark:release-gate` and the shipped-path matrix (Rust sniff/policy route).

```bash
bun run benchmark:release-gate
```

Artifact: `benchmark-artifacts/smart_reader_release_gate.json` — must report `status: passed` before release.

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

## Compose

[Composition doctrine — SDK, not MCP, for product integration](docs/SDK_MCP_COMPOSITION.md) · `Prism.composeVideo` merges Cue structure + Iris L2 objects via SDK.
