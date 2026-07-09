# ADR-3: Adopt Smart Reader MCP Family SOTA Roadmap

Date: 2026-07-09  
Status: Proposed in PR #3  
Slug: mcp-family-sota-roadmap

## Context

Smart Reader MCP is the universal entrypoint for the Reader family. It needs a
repo-local roadmap that keeps it focused on safe format detection, delegation,
policy, and normalized evidence rather than absorbing specialist reader logic.

## Decision

Adopt `docs/roadmap/sota-family-roadmap.md` as the local roadmap for Smart
Reader MCP's family role.

Smart Reader MCP owns format sniffing, path policy, delegation routing, child
reader diagnostics, and normalized reader envelopes.

## Consequences

- PDF, image, and video extraction remain in their specialist repos.
- Rust is the target for sniffing, path normalization, symlink policy, hashing,
  archive limits, and delegation policy.
- More formats are added only after specialist contracts exist.
- Router outputs must preserve child reader evidence without lossy wrapping.

## Verification

- Roadmap added at `docs/roadmap/sota-family-roadmap.md`.
- README and PROJECT link to the roadmap.
- Docs-only validation: `git diff --check`.
