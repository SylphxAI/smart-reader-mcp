# Prism — media sniff + route

Use Prism when the agent receives a **file of unknown media type** and should route to Citra/Iris/Cue.

## Install

```bash
npx @sylphx/smart-reader-mcp
prism doctor
```

## Tool / SDK

| Surface | Job |
| --- | --- |
| `read_media` | Magic-byte sniff → stdio delegate to PDF/image/video instrument |
| SDK `sniffFormatFromBuffer` | Offline format detection for routing |

```ts
import { sniffFormatFromBuffer } from '@sylphx/smart-reader-mcp/sdk'
const sniff = sniffFormatFromBuffer(buf, 'file.bin')
// category: pdf | image | video | ...
```

### Expected delegation map (evidence envelope)

| Sniff category | Delegated tool | Sibling package | Brand |
| --- | --- | --- | --- |
| pdf | `read_pdf` | `@sylphx/pdf-reader-mcp` | Citra |
| image | `read_image` | `@sylphx/image-reader-mcp` | Iris |
| video | `read_video` | `@sylphx/video-reader-mcp` | Cue |

Public proof: `bun scripts/public-proof.ts` (PDF/PNG/MP4 fixtures + expectedDelegation).
Live e2e: `test/prism-delegate-*.e2e.test.ts` (skip when sibling native missing).

Evidence envelope includes routing decision + sibling tool result. No `evidence_first` tool.

Family: https://github.com/SylphxAI/instruments
