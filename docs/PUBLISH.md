# Publish status

| Field | Value |
| --- | --- |
| Package | `@sylphx/smart-reader-mcp` |
| Repo version | `0.2.1` |
| Registry state | **published** |
| npm auth in this environment | `ENEEDAUTH` (cannot live-publish here) |

## Install paths

### npm (when published)

```bash
npm i -g @sylphx/smart-reader-mcp
```

### Git (always available; product SSOT)

```bash
git clone https://github.com/SylphxAI/smart-reader-mcp.git
cd smart-reader-mcp
bun install
```

### Residual

Live `npm publish` for unpublished packages requires `@sylphx` automation token / 2FA on a trusted publisher machine. That is an **external credential blocker**, not a product design gap.

See also [BRAND_PUBLISH.md](./BRAND_PUBLISH.md) when present.
