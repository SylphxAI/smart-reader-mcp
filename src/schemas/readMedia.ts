import { z } from 'zod';

export const readMediaArgsSchema = z.object({
  path: z
    .string()
    .min(1)
    .describe('Absolute or relative path to a local PDF, image, or video file.'),
});

export type ReadMediaArgs = z.infer<typeof readMediaArgsSchema>;

export const readMediaEnvelopeSchema = z.object({
  subject: z.string(),
  source: z.string(),
  sourceHash: z.string().optional(),
  freshness: z.object({
    indexedAt: z.string(),
    stale: z.boolean(),
  }),
  locator: z.object({
    path: z.string(),
    detectedFormat: z.string(),
  }),
  route: z.object({
    sniff: z.string(),
    delegation: z.string(),
  }),
  confidence: z.enum(['deterministic', 'derived', 'inferred', 'unknown']),
  warnings: z.array(z.string()),
  nextActions: z.array(z.string()),
  delegation: z.object({
    contract_version: z.string(),
    source_path: z.string(),
    detected_format: z.string(),
    delegated_tool: z.string(),
    reader_package: z.string(),
    reader_contract_version: z.string(),
  }),
  routing: z.object({
    contract_version: z.string(),
    sniff_method: z.string(),
    selected_category: z.enum(['pdf', 'image', 'video']),
    selection_reason: z.string(),
    declared_extension: z.string().nullable(),
    alternatives: z.array(
      z.object({
        category: z.enum(['pdf', 'image', 'video']),
        delegated_tool: z.enum(['read_pdf', 'read_image', 'read_video']),
        reader_package: z.string(),
        reader_contract_version: z.string(),
        reason: z.string(),
      })
    ),
    launch_source: z.enum(['local', 'npx']),
    reader_package: z.string(),
  }),
  result: z.unknown(),
});

export type ReadMediaEnvelope = z.infer<typeof readMediaEnvelopeSchema>;
