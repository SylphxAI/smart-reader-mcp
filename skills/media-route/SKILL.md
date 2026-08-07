# Media route (host skill — replaces Prism)

Route local media to the correct Sylphx Instrument without a router MCP.

## When

Agent has a local file path and does not know whether it is PDF, image, or video.

## How

1. Sniff: PDF (`%PDF`), PNG/JPEG/GIF/WebP/TIFF signatures, MP4/MKV/WebM/QuickTime brands; extension fallback.
2. Call one tool only:
   - pdf → Citra `read_pdf`
   - image → Iris `read_image`
   - video → Cue `read_video`
3. For citeable follow-ups use that product's evidence tool (`pdf_evidence`, `crop_region`, `video_evidence`).

## Do not

- Install Prism / smart-reader-mcp
- Spawn sibling MCP servers from a product package
- Merge all media tools into one mega-server

## Evidence

Each instrument returns its own evidence envelope (family v1). Routing decision can be noted in agent reasoning; it is not a product envelope.
