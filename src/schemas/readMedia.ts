import { z } from 'zod';

export const readMediaArgsSchema = z.object({
  path: z
    .string()
    .min(1)
    .describe('Absolute or relative path to a local PDF, image, or video file.'),
});

export type ReadMediaArgs = z.infer<typeof readMediaArgsSchema>;

export const readMediaEnvelopeSchema = z.object({
  source_path: z.string(),
  detected_format: z.string(),
  delegated_tool: z.string(),
  raw_result: z.unknown(),
});

export type ReadMediaEnvelope = z.infer<typeof readMediaEnvelopeSchema>;