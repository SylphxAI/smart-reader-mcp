# ADR-0001: Smart Reader MCP Boundary

**Status:** Accepted  
**Date:** 2026-07-08  
**Project:** smart-reader-mcp

## Context

Cross-repo dispatch architecture is defined in
[ADR-0002](0002-reader-portfolio-architecture.md) in this repository.

## Decision

`@sylphx/smart-reader-mcp` owns the local/open-source MCP contract for: **One MCP call reads PDF, image, or video by sniffing format and delegating to Sylphx Reader siblings.**

Reading uses deterministic extraction (metadata, OCR/ASR adapters, classical signal
processing). Generative LLMs are optional remote providers only, never the default.

## Consequences

- Implement `read_media` with provenance and release gates before v0.1.0.
- Depend on `@sylphx/reader-evidence` for shared schema when types stabilize.
