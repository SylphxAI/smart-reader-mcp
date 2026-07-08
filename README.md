# Smart Reader MCP

> One MCP call reads PDF, image, or video by sniffing format and delegating to Sylphx Reader siblings.

**Status:** bootstrap — repository scaffold; MCP tools not shipped yet.

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

## Planned MCP surface

Primary tool: `read_media`

## Quick start (after v0.1.0)

```bash
npx @sylphx/smart-reader-mcp
```

## License

MIT © [SylphxAI](https://github.com/SylphxAI)
