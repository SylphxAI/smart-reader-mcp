# Operating Model — smart-reader-mcp

**Status:** Bootstrap target  
**Owner:** smart-reader-mcp

## Goal

One MCP call reads PDF, image, or video by sniffing format and delegating to Sylphx Reader siblings.

## Non-Goals

- Hosted platform services inside this package.
- Frame-by-frame or whole-image generative LLM understanding as default.

## Acceptance (v0.1.0)

- `read_media` ships with schema, handler, tests, and docs.
- Default path works without remote providers or ML model downloads.
- Release gate JSON artifact passes in CI.
