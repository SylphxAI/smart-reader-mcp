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
    source_path: z.string(),
    detected_format: z.string(),
    delegated_tool: z.string(),
  }),
  result: z.unknown(),
});

export type ReadMediaEnvelope = z.infer<typeof readMediaEnvelopeSchema>;
