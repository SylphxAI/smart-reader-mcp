# ADR-0002: Sylphx Reader Portfolio Architecture

**Status:** Accepted  
**Date:** 2026-07-08  
**Project:** smart-reader-mcp

## Context

Smart Reader orchestrates evidence-first reading across format-specific MCP
packages. Portfolio rules live **here** because this repo owns dispatch and the
unified `read` tool — not in `pdf-reader-mcp`, which owns PDF only (see
[pdf-reader ADR-0001](https://github.com/SylphxAI/pdf-reader-mcp/blob/main/docs/adr/0001-2027-sota-document-intelligence-boundary.md)).

## Decision

### Four repositories

| Repository | Package | Role |
|------------|---------|------|
| pdf-reader-mcp | `@sylphx/pdf-reader-mcp` | PDF (production; independent project) |
| image-reader-mcp | `@sylphx/image-reader-mcp` | Image read |
| video-reader-mcp | `@sylphx/video-reader-mcp` | Video read |
| smart-reader-mcp | `@sylphx/smart-reader-mcp` | Sniff + delegate + unified `read` |

**Phase 2 (later):** guarded local/remote path resolution stays in
`smart-reader-mcp`, not a separate repo.

### Read vs interpret

- **Read:** metadata, OCR, subtitles, scenes, transcripts — deterministic, no generative LLM default.
- **Interpret:** summarization / VQA — agent or optional remote provider; out of scope for Reader MCP packages.

### Delegation

Smart Reader must not re-implement PDF/image/video parsers. It calls sibling
packages and normalizes provenance in its response envelope.

## Consequences

- Format repos document only their own boundary ADR.
- Cross-repo links point to this ADR from image/video READMEs, not from pdf-reader-mcp.