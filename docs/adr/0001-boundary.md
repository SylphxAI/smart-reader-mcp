# ADR-0001: Smart Reader MCP Boundary

**Status:** Accepted  
**Date:** 2026-07-08  
**Project:** smart-reader-mcp

## Context

This repository is part of the Sylphx Reader portfolio. Cross-cutting architecture
is defined in [pdf-reader-mcp ADR-0004](https://github.com/SylphxAI/pdf-reader-mcp/blob/main/docs/adr/0004-reader-portfolio-architecture.md).

## Decision

`@sylphx/smart-reader-mcp` owns the local/open-source MCP contract for: **One MCP call reads PDF, image, or video by sniffing format and delegating to Sylphx Reader siblings.**

Reading uses deterministic extraction (metadata, OCR/ASR adapters, classical signal
processing). Generative LLMs are optional remote providers only, never the default.

## Consequences

- Implement `read_media` with provenance and release gates before v0.1.0.
- Depend on `@sylphx/reader-evidence` for shared schema when types stabilize.
