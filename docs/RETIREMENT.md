# Prism retirement record

## Decision

**Hard-cut retire** Prism (`smart-reader-mcp`) as a product.

## Predecessor

- MCP product that sniffed format and spawned Citra/Iris/Cue via npx/stdio.

## Destination

- Host multi-server MCP configuration
- Host skill: unknown media → sniff → call citra/iris/cue tools
- Optional tiny sniff snippet (not a release product)

## Migrated

- Product jobs: remain on Citra, Iris, Cue
- Sniff algorithm: preserved under `src/sniff/` as reference

## Deleted as product authority

- Install CTAs, marketplace growth, dual-publish brand plans, Instruments Phase matrices listing Prism as active

## Kill criteria (done when)

- [x] README/PROJECT declare retired
- [x] server.json title marks retired
- [x] Skills skill points to Citra/Iris/Cue
- [ ] npm deprecate (requires registry auth — external)
- [ ] Marketplace unlist (external operator)
