import { describe, expect, test } from 'bun:test';
import {
  createComposeVideoObjects,
  structuralKeyframeTimes,
} from '../src/compose/composeVideoObjects.js';

describe('Prism embedded video→objects compose (SDK-first, boundary)', () => {
  test('structural keyframe times mirror Cue scene architecture', () => {
    const times = structuralKeyframeTimes({
      sceneTimesMs: [1000, 5000, 9000],
      durationMs: 12000,
      limit: 4,
    });
    expect(times[0]).toBe(0);
    // sorted, structural (starts + mid-gaps), not empty
    expect(times.length).toBeGreaterThanOrEqual(3);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  test('composes via fake Cue+Iris SDK, merges objects by time', async () => {
    const scenes = [{ time_ms: 1000 }, { time_ms: 5000 }];
    const fakeCue = {
      read: async () => ({ result: { scenes, format: { duration_ms: 8000 } } }),
    };
    const fakeIris = {
      read: async () => ({
        result: {
          semantics: {
            available: true,
            model: 'florence2-mock',
            objects: [
              {
                id: 'o1',
                label: 'person',
                bbox: { x: 0, y: 0, width: 10, height: 10 },
                score: 0.9,
              },
            ],
          },
        },
      }),
    };
    const compose = createComposeVideoObjects({
      loadCue: async () => fakeCue,
      loadIris: async () => fakeIris,
      render: async () => {},
    });
    const out = await compose({ path: '/abs/clip.mp4', limit: 3 });
    expect(out.policy).toBe('prism_compose_video_objects_v1');
    expect(out.composition.route).toBe('sdk:cue+iris');
    expect(out.keyframes.length).toBeGreaterThan(0);
    for (const kf of out.keyframes) {
      expect(kf.semantics_available).toBe(true);
      expect(kf.objects.length).toBe(1);
      expect(kf.objects[0]?.label).toBe('person');
      expect(typeof kf.time_ms).toBe('number');
    }
    expect(out.total_objects).toBe(out.keyframes.length);
  });

  test('fail-closed per keyframe when Iris unavailable', async () => {
    const compose = createComposeVideoObjects({
      loadCue: async () => ({
        read: async () => ({ result: { scenes: [{ time_ms: 0 }], format: { duration_ms: 1000 } } }),
      }),
      loadIris: async () => ({
        read: async () => {
          throw new Error('iris sdk read failed');
        },
      }),
      render: async () => {},
    });
    const out = await compose({ path: '/abs/clip.mp4', limit: 2 });
    expect(out.keyframes.length).toBeGreaterThan(0);
    for (const kf of out.keyframes) {
      expect(kf.semantics_available).toBe(false);
      expect(kf.objects).toEqual([]);
    }
    expect(out.warnings.some((w) => w.includes('iris sdk read failed'))).toBe(true);
  });
});

describe('Prism composeVideo SDK load failure (honest degrade)', () => {
  test('rejects with actionable message when Cue SDK missing', async () => {
    const compose = createComposeVideoObjects({
      loadCue: async () => {
        throw new Error('composeVideo requires the Cue SDK. Install it with: npm i @sylphx/cue.');
      },
      loadIris: async () => ({ read: async () => ({ result: {} }) }),
      render: async () => {},
    });
    await expect(compose({ path: '/v.mp4' })).rejects.toThrow(/npm i @sylphx\/cue/);
  });
});

describe('instantiateSdk (class-with-create SDK shape)', () => {
  test('instantiates and delegates read', async () => {
    const { instantiateSdk } = await import('../src/compose/composeVideoObjects.js');
    class Fake {
      static create() {
        return new Fake();
      }
      async read(input: { path: string }) {
        return { result: { ok: input.path } };
      }
    }
    const sdk = instantiateSdk({ default: Fake });
    const out = await sdk.read({ path: '/a' });
    expect((out as { result?: { ok?: string } }).result?.ok).toBe('/a');
  });

  test('throws when SDK lacks create()', () => {
    const { instantiateSdk } = require('../src/compose/composeVideoObjects.js');
    expect(() => instantiateSdk({ default: {} })).toThrow(/no \.create\(\)/);
  });
});

describe('SDK MCP-text envelope parsing', () => {
  test('unpacks {type:text,text:json} result into semantics', async () => {
    const { createComposeVideoObjects } = await import('../src/compose/composeVideoObjects.js');
    const fakeCue = {
      read: async () => ({
        type: 'text',
        text: JSON.stringify({
          result: { scenes: [{ time_ms: 0 }], format: { duration_ms: 1000 } },
        }),
      }),
    };
    const fakeIris = {
      read: async () => ({
        type: 'text',
        text: JSON.stringify({
          result: { semantics: { available: true, model: 'm', objects: [{ label: 'person' }] } },
        }),
      }),
    };
    const compose = createComposeVideoObjects({
      loadCue: async () => fakeCue as never,
      loadIris: async () => fakeIris as never,
      render: async () => {},
    });
    const out = await compose({ path: '/v.mp4', limit: 1 });
    expect(out.keyframes.length).toBeGreaterThan(0);
    expect(out.keyframes[0]?.objects[0]?.label).toBe('person');
    expect(out.total_objects).toBeGreaterThan(0);
  });
});

describe('defaultSdkLoader (shared loader path)', () => {
  test('loads an esm SDK module with create().read() and returns read fn', async () => {
    const { defaultSdkLoader } = await import('../src/compose/composeVideoObjects.js');
    const fixtureUrl = new URL('./fixtures/fakesdk-esm.mjs', import.meta.url);
    const loader = defaultSdkLoader(fixtureUrl.href, 'hint');
    const sdk = await loader();
    expect(typeof sdk.read).toBe('function');
    const res = (await sdk.read({ path: '/v.mp4' })) as { type?: string; text?: string };
    expect(res.type).toBe('text');
  });

  test('returns actionable hint when specifier missing', async () => {
    const { defaultSdkLoader } = await import('../src/compose/composeVideoObjects.js');
    const loader = defaultSdkLoader(
      '@sylphx/__missing__/sdk',
      'composeVideo requires the Cue SDK. Install it with: npm i @sylphx/cue.'
    );
    await expect(loader()).rejects.toThrow(/npm i @sylphx\/cue/);
  });
});
