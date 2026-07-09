# SOTA Family Roadmap

Status: adoption plan  
Owner: Smart Reader MCP  
Scope: repo-local future plan and its role in the SylphxAI MCP family
Decision record: `docs/adr/ADR-3-mcp-family-sota-roadmap.md`

## Family Role

Smart Reader MCP is the universal entrypoint for the Reader family. It accepts a
file, detects its real format, applies local path and size policy, delegates to
the correct specialist reader, and returns one normalized evidence envelope.

It should be the package an agent installs when it does not know whether the
next file is a PDF, image, video, or future supported medium.

## Family Fit

| Project | Relationship |
| --- | --- |
| PDF Reader MCP | Specialist for PDF and document evidence. Smart Reader delegates PDFs and preserves PDF evidence. |
| Image Reader MCP | Specialist for image evidence. Smart Reader delegates images and preserves image locators. |
| Video Reader MCP | Specialist for temporal media evidence. Smart Reader delegates videos and preserves timeline evidence. |
| Filesystem MCP | Owns broad filesystem operations. Smart Reader owns read-routing policy for media inputs only. |
| Architecture Reader MCP | Can call Smart Reader for repo-adjacent media and documentation artifacts. |
| Consultant MCP | Consumes normalized reader evidence for review and research workflows. |

## SOTA End State

Smart Reader MCP should become the one-call local evidence router for agents:
format-truth by byte sniffing, safe path policy, clear delegation trace,
normalized output, and actionable install diagnostics.

## Runtime Direction

Rust should own format sniffing, path normalization, symlink policy, source
hashing, archive limits, cache keys, and delegation policy. The MCP adapter can
stay thin until direct Rust serving is mature.

WASM is useful for sandboxed format probes or extension extractors only after
host capability policy is defined.

## Roadmap

### Phase 0: Router Contract

- Freeze `read_media` envelope.
- Add examples for PDF, image, video, mislabeled file, unknown file, unsupported
  file, missing sibling reader, and delegated failure.
- Add route fields: detected format, declared format, sniffing evidence,
  delegated tool, child package version, and warning list.

### Phase 1: Rust Sniffing And Policy Core

- Implement byte-based format detection.
- Add path normalization, symlink escape, size limit, and binary detection tests.
- Add source hashing and cache-key primitives.
- Add install diagnostics for missing sibling readers.

### Phase 2: Normalized Evidence Envelope

- Preserve child reader evidence without lossy wrapping.
- Normalize source hash, warnings, route, next actions, and freshness across
  PDF, image, and video outputs.
- Add delegation trace for every call.

### Phase 3: More Formats

- Add audio, HTML, office document, plain text, markdown, archive, and directory
  routing only when specialist contracts exist.
- Add archive recursion and expansion policy.
- Add batch mode with per-file evidence and failure isolation.

### Phase 4: Suite Distribution

- Ship one-command Reader suite install profile.
- Add platform-specific optional binary packages for native router core.
- Publish benchmark fixtures for routing overhead, policy checks, and batch
  throughput.

## Star And Adoption Strategy

The public promise is "one MCP call reads the file safely." Star growth comes
from being the obvious default install for agents, while specialist readers keep
their own deeper value and benchmarks.

## Validation Gates

- Mislabeled files route by content, not extension.
- Symlink escapes are denied by default.
- Delegated child evidence remains intact.
- Unsupported files return precise diagnostics.
- Router overhead stays inside the published budget.
