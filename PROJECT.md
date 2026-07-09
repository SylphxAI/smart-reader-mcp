# Smart Reader MCP

One MCP call reads PDF, image, or video by sniffing format and delegating to Sylphx Reader siblings.

## Lifecycle

- Lifecycle: `bootstrap`
- Layer: `tooling`
- Portfolio ADR: [ADR-0002](docs/adr/0002-reader-portfolio-architecture.md) (this repo)
- SOTA family roadmap: [`docs/roadmap/sota-family-roadmap.md`](docs/roadmap/sota-family-roadmap.md)

## Goals

- Local-first MCP package with evidence-first read output and benchmark-gated releases.
- Preserve provenance so agents can cite sources (page, frame, time, bbox).

## Non-Goals

- Hosted auth, billing, storage, tenancy, or customer data retention.
- Default generative LLM vision/language for reading.
