/**
 * Prism embedded video→objects composition (SDK-first).
 *
 * Doctrine: products compose via SDK; MCP is only the agent surface; CLI for
 * humans. Here Prism composes Cue (structural video timeline) + Iris (L2
 * semantics per structural keyframe) by timestamp — all code-to-code using
 * the sibling SDKs (`@sylphx/cue/sdk`, `@sylphx/iris/sdk`) with injectable
 * loaders so tests can use fakes (no video, no model, no network).
 *
 * No new MCP tool is added: this is SDK + CLI surface only.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ComposedKeyframeObject, ComposedVideoEnvelope } from './envelope.js';

export interface CueSdkLike {
  read: (input: { path: string; [k: string]: unknown }) => Promise<unknown>;
}
export interface IrisSdkLike {
  read: (input: { path: string; [k: string]: unknown }) => Promise<unknown>;
}

export interface ComposeVideoInput {
  path: string;
  limit?: number;
  prompt?: string;
  semanticsUrl?: string;
  maxDimension?: number;
}

export interface ComposeVideoDeps {
  loadCue?: () => Promise<CueSdkLike>;
  loadIris?: () => Promise<IrisSdkLike>;
  render?: (videoPath: string, timeMs: number, outPath: string) => Promise<void>;
  sceneThreshold?: number;
}

type TimelineEnvelopeRecord = {
  result?: { scenes?: Array<{ time_ms?: number }>; format?: { duration_ms?: number } };
};

export function structuralKeyframeTimes(input: {
  sceneTimesMs: number[];
  durationMs: number | undefined;
  limit: number;
}): number[] {
  const limit = Math.max(1, Math.min(64, input.limit));
  const times = new Set<number>();
  const sceneTimes = [...input.sceneTimesMs]
    .filter((t) => Number.isFinite(t) && t >= 0)
    .sort((a, b) => a - b);
  if (sceneTimes.length > 0) {
    times.add(0);
    sceneTimes.forEach((st) => {
      times.add(st);
    });
    for (let i = 0; i < sceneTimes.length - 1; i++) {
      const a = sceneTimes[i];
      const b = sceneTimes[i + 1];
      if (a !== undefined && b !== undefined) times.add(Math.round((a + b) / 2));
    }
    if (typeof input.durationMs === 'number' && input.durationMs > 0) {
      times.add(Math.max(0, input.durationMs - 1));
    }
  }
  const sorted = [...times].sort((a, b) => a - b);
  if (sorted.length <= limit) return sorted;
  const picked: number[] = [];
  for (let i = 0; i < limit; i++) {
    const idx = Math.round((i * (sorted.length - 1)) / Math.max(1, limit - 1));
    const v = sorted[idx];
    if (v !== undefined) picked.push(v);
  }
  return [...new Set(picked)].sort((a, b) => a - b);
}

export const createComposeVideoObjects = (deps: ComposeVideoDeps = {}) => {
  const loadCue =
    deps.loadCue ??
    (async () => {
      const mod = await import('@sylphx/cue/sdk').catch(() => {
        throw new Error('composeVideo requires the Cue SDK. Install it with: npm i @sylphx/cue.');
      });
      return (mod.default ?? mod) as unknown as CueSdkLike;
    });
  const loadIris =
    deps.loadIris ??
    (async () => {
      const mod = await import('@sylphx/iris/sdk').catch(() => {
        throw new Error(
          'composeVideo requires the Iris SDK. Install it with: npm i @sylphx/iris (or set IRIS_SEMANTICS_URL for a sidecar).'
        );
      });
      return (mod.default ?? mod) as unknown as IrisSdkLike;
    });
  const render =
    deps.render ??
    (async (videoPath, timeMs, outPath) => {
      // ffmpeg single-frame render; exec via node child_process
      const { spawnSync } = await import('node:child_process');
      const { existsSync } = await import('node:fs');
      if (!existsSync('/usr/bin/ffmpeg') && !existsSync('/usr/local/bin/ffmpeg')) {
        throw new Error('ffmpeg not found on PATH required for composeVideoObjects');
      }
      const sec = (timeMs / 1000).toFixed(3);
      const r = spawnSync(
        'ffmpeg',
        [
          '-hide_banner',
          '-loglevel',
          'error',
          '-ss',
          sec,
          '-i',
          videoPath,
          '-frames:v',
          '1',
          '-y',
          outPath,
        ],
        { encoding: 'utf8' }
      );
      if (r.status !== 0) throw new Error(`ffmpeg render failed: ${r.stderr?.slice(-300)}`);
    });

  return async function composeVideoObjects(
    input: ComposeVideoInput
  ): Promise<ComposedVideoEnvelope> {
    const cue = await loadCue();
    const iris = await loadIris();

    // 1. Cue structural timeline (SDK)
    const cueEnvelope = (await cue.read({
      path: input.path,
      include_keyframes: true,
      keyframe_policy: 'structural',
    })) as TimelineEnvelopeRecord;
    const result = cueEnvelope?.result ?? {};
    const scenes = Array.isArray(result.scenes) ? result.scenes.map((s) => s.time_ms ?? 0) : [];
    const durationMs = result.format?.duration_ms;

    // 2. structural keyframe times (mirror of Cue plan; deterministic)
    const times = structuralKeyframeTimes({
      sceneTimesMs: scenes,
      durationMs,
      limit: input.limit ?? 8,
    });

    // 3. per-keyframe Iris L2 semantics (SDK)
    const tmp = await mkdtemp(join(tmpdir(), 'prism-compose-video-'));
    const warnings: string[] = [];
    const keyframes: Array<{
      time_ms: number;
      frame: string;
      semantics_available: boolean;
      skipped_reason?: string;
      objects: ComposedKeyframeObject[];
      caption?: string;
      model?: string;
    }> = [];
    let totalObjects = 0;
    try {
      for (let i = 0; i < times.length; i++) {
        const timeMs = times[i];
        if (timeMs === undefined) continue;
        const framePath = join(tmp, `frame_${String(i).padStart(3, '0')}.png`);
        try {
          await render(input.path, timeMs, framePath);
          const irisEnvelope = (await iris.read({
            path: framePath,
            include_semantics: true,
            ...(input.prompt ? { semantics_prompt: input.prompt } : {}),
            ...(input.semanticsUrl ? { semantics_url: input.semanticsUrl } : {}),
          })) as unknown;
          const twin =
            (
              irisEnvelope as {
                result?: {
                  semantics?: {
                    objects?: unknown[];
                    caption?: string;
                    model?: string;
                    available?: boolean;
                  };
                };
              }
            )?.result ?? {};
          const semantics = twin.semantics;
          const objects: ComposedKeyframeObject[] = (semantics?.objects ??
            []) as ComposedKeyframeObject[];
          const available = semantics?.available ?? objects.length > 0;
          totalObjects += objects.length;
          keyframes.push({
            time_ms: timeMs,
            frame: `frame_${String(i).padStart(3, '0')}.png`,
            semantics_available: Boolean(available),
            objects,
            ...(semantics?.caption ? { caption: semantics.caption } : {}),
            ...(semantics?.model ? { model: semantics.model } : {}),
          });
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          warnings.push(`keyframe@${timeMs}ms: ${message}`);
          keyframes.push({
            time_ms: timeMs,
            frame: '',
            semantics_available: false,
            skipped_reason: message,
            objects: [],
          });
        }
      }
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }

    return {
      subject: input.path,
      policy: 'prism_compose_video_objects_v1',
      generated_at: new Date().toISOString(),
      keyframe_policy: 'structural_v1',
      keyframe_count: keyframes.length,
      total_objects: totalObjects,
      composition: {
        route: 'sdk:cue+iris',
        cue_surface: '@sylphx/cue/sdk',
        iris_surface: '@sylphx/iris/sdk',
        semantics_flag: 'include_semantics',
      },
      keyframes,
      warnings,
    };
  };
};

export const composeVideoObjects = createComposeVideoObjects();
