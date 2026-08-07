# Prism — RETIRED (use host routing)

**Do not install Prism as an MCP server.**

When media type is unknown:

1. Sniff magic bytes / extension (pdf, image, video).
2. Call the matching instrument:
   - PDF → Citra `read_pdf`
   - Image → Iris `read_image`
   - Video → Cue `read_video`

Install instruments:

```bash
npx @sylphx/citra
npx @sylphx/iris
npx @sylphx/cue
```

Family law: SylphxAI/skills `instrument-family-standard`.
