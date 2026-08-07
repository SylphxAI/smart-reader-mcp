# RETIRED — Prism / smart-reader-mcp

**Status: retired product (hard cut, 2026-08-07)**

Prism was a local media **router** (sniff + spawn Citra/Iris/Cue MCP servers).
That composition belongs to the **agent host / skills**, not a seventh product.

## Do not install as a product

- Do **not** add `smart-reader-mcp` / `prism` as a current MCP server for new agents.
- Do **not** treat this repository as an active Instrument, marketplace listing, or release authority.
- Historical source remains for archaeology only.

## What to use instead

| Need | Authority |
| --- | --- |
| PDF evidence | **Citra** — `@sylphx/citra` / repo `pdf-reader-mcp` |
| Image evidence | **Iris** — `@sylphx/iris` / repo `image-reader-mcp` |
| Video timeline | **Cue** — `@sylphx/cue` / repo `video-reader-mcp` |
| Unknown media type | Host skill: sniff (magic bytes / extension) then call the matching instrument MCP |
| Family law | `SylphxAI/skills` → `instrument-family-standard` + `docs/knowledge/instruments/INSTRUMENT-FAMILY-LAW.md` |

## Why retired

1. Multi-server MCP hosts already compose independent servers.
2. A router product doubles process tax and couples three release trains.
3. Instruments law: **host owns composition**; products own one evidence domain.

## Historical package ids (non-authority)

- `@sylphx/smart-reader-mcp`
- bin `prism` / `smart-reader-mcp`
- MCP name `io.github.SylphxAI/smart-reader-mcp`

If these still resolve on npm, they are **legacy artifacts**, not the current product model.

## Sniff utility (non-product)

Magic-byte sniffing for host skills lives under `src/sniff/` as reference code.
Prefer copying a minimal sniff into a host skill rather than depending on this package.

## License

MIT — see [LICENSE](./LICENSE).
