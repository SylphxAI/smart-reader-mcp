# Smart Reader MCP

> One MCP call reads PDF, image, or video by sniffing format and delegating to Sylphx Reader siblings.

**Status:** bootstrap — repository scaffold; MCP tools not shipped yet.

Part of the [Sylphx Reader portfolio](https://github.com/SylphxAI/pdf-reader-mcp/blob/main/docs/adr/0004-reader-portfolio-architecture.md).

| Sibling | Role |
| --- | --- |
| [pdf-reader-mcp](https://github.com/SylphxAI/pdf-reader-mcp) | PDF Agent Document Twin (production) |
| [image-reader-mcp](https://github.com/SylphxAI/image-reader-mcp) | Image Agent Media Twin |
| [video-reader-mcp](https://github.com/SylphxAI/video-reader-mcp) | Video Agent Media Twin |
| [smart-reader-mcp](https://github.com/SylphxAI/smart-reader-mcp) | Format sniff + delegate |
| [smart-read-mcp](https://github.com/SylphxAI/smart-read-mcp) | Universal path (local + guarded URL) |
| [reader-evidence](https://github.com/SylphxAI/reader-evidence) | Shared evidence schema |

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
