export interface ComposedKeyframeObject {
  id?: string;
  label?: string;
  bbox?: { x: number; y: number; width: number; height: number };
  score?: number;
  [k: string]: unknown;
}

export interface ComposedKeyframe {
  time_ms: number;
  frame: string;
  semantics_available: boolean;
  skipped_reason?: string;
  objects: ComposedKeyframeObject[];
  caption?: string;
  model?: string;
}

export interface ComposedVideoEnvelope {
  subject: string;
  policy: 'prism_compose_video_objects_v1';
  generated_at: string;
  keyframe_policy: 'structural_v1';
  keyframe_count: number;
  total_objects: number;
  composition: {
    route: 'sdk:cue+iris';
    cue_surface: string;
    iris_surface: string;
    semantics_flag: string;
  };
  keyframes: ComposedKeyframe[];
  warnings: string[];
}
