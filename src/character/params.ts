import { Rng } from './rng';

/**
 * Character parameters. All multipliers are 1.0 for an "average" humanoid.
 * Ranges are listed in PARAM_RANGES and used both for clamping and for UI sliders.
 */
export interface ProportionParams {
  headSize: number;
  neckLength: number;
  torsoLength: number;
  shoulderWidth: number;
  hipWidth: number;
  armLength: number;
  /** forearm length / upper arm length */
  forearmRatio: number;
  legLength: number;
  /** shin length / thigh length */
  shinRatio: number;
  handSize: number;
  footSize: number;
}

export interface BuildParams {
  /** 0 = lean, 1 = very muscular */
  muscularity: number;
  /** 0 = very lean, 1 = heavy */
  bodyFat: number;
  /** global limb girth multiplier */
  limbThickness: number;
}

export interface JointParams {
  /** 0 = stiff (small rotation ranges), 1 = acrobat */
  flexibility: number;
  /** 0 = tight skin blending at joints, 1 = very soft/wide blending */
  softness: number;
}

export interface DetailParams {
  /** Catmull-Clark levels applied to the low-poly cage (0-3). Doubles as LOD. */
  subdivisions: number;
  /** Strength of sculpted muscle forms (scaled by muscularity). */
  muscleDefinition: number;
  /** Strength of nose/brow/chin/ears etc. */
  facialFeatures: number;
  /** Skin noise displacement in meters. */
  noiseAmplitude: number;
  /** Noise frequency (cycles per meter). */
  noiseScale: number;
}

export interface AppearanceParams {
  skinColor: string;
}

export interface CharacterParams {
  seed: number;
  /** Total height in meters (crown of the head). */
  height: number;
  /** Arm angle below horizontal in the bind pose (degrees). A-pose ≈ 45. */
  armRestAngle: number;
  /** 0 = exactly the given params, 1 = noticeable seeded individual variation. */
  variation: number;
  proportions: ProportionParams;
  build: BuildParams;
  joints: JointParams;
  detail: DetailParams;
  appearance: AppearanceParams;
}

export type Range = [min: number, max: number, step: number];

export const PARAM_RANGES = {
  height: [0.9, 2.6, 0.01] as Range,
  armRestAngle: [20, 70, 1] as Range,
  variation: [0, 1, 0.01] as Range,
  proportions: {
    headSize: [0.75, 1.6, 0.01],
    neckLength: [0.5, 1.6, 0.01],
    torsoLength: [0.8, 1.3, 0.01],
    shoulderWidth: [0.75, 1.5, 0.01],
    hipWidth: [0.75, 1.45, 0.01],
    armLength: [0.8, 1.3, 0.01],
    forearmRatio: [0.7, 1.15, 0.01],
    legLength: [0.7, 1.3, 0.01],
    shinRatio: [0.8, 1.15, 0.01],
    handSize: [0.75, 1.5, 0.01],
    footSize: [0.75, 1.4, 0.01],
  } satisfies Record<keyof ProportionParams, Range>,
  build: {
    muscularity: [0, 1, 0.01],
    bodyFat: [0, 1, 0.01],
    limbThickness: [0.7, 1.5, 0.01],
  } satisfies Record<keyof BuildParams, Range>,
  joints: {
    flexibility: [0, 1, 0.01],
    softness: [0, 1, 0.01],
  } satisfies Record<keyof JointParams, Range>,
  detail: {
    subdivisions: [0, 3, 1],
    muscleDefinition: [0, 1, 0.01],
    facialFeatures: [0, 1, 0.01],
    noiseAmplitude: [0, 0.004, 0.0001],
    noiseScale: [5, 120, 1],
  } satisfies Record<keyof Omit<DetailParams, never>, Range>,
};

export const DEFAULT_PARAMS: CharacterParams = {
  seed: 1337,
  height: 1.8,
  armRestAngle: 45,
  variation: 0,
  proportions: {
    headSize: 1,
    neckLength: 1,
    torsoLength: 1,
    shoulderWidth: 1,
    hipWidth: 1,
    armLength: 1,
    forearmRatio: 0.86,
    legLength: 1,
    shinRatio: 0.98,
    handSize: 1,
    footSize: 1,
  },
  build: {
    muscularity: 0.4,
    bodyFat: 0.25,
    limbThickness: 1,
  },
  joints: {
    flexibility: 0.5,
    softness: 0.5,
  },
  detail: {
    subdivisions: 2,
    muscleDefinition: 0.6,
    facialFeatures: 0.7,
    noiseAmplitude: 0.0006,
    noiseScale: 40,
  },
  appearance: {
    skinColor: '#c99a7b',
  },
};

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };
export type CharacterParamsInput = DeepPartial<CharacterParams>;

export function cloneParams(p: CharacterParams): CharacterParams {
  return {
    ...p,
    proportions: { ...p.proportions },
    build: { ...p.build },
    joints: { ...p.joints },
    detail: { ...p.detail },
    appearance: { ...p.appearance },
  };
}

/** Merge a partial description over the defaults. */
export function makeParams(input: CharacterParamsInput = {}, base: CharacterParams = DEFAULT_PARAMS): CharacterParams {
  const out = cloneParams(base);
  for (const key of Object.keys(input) as (keyof CharacterParams)[]) {
    const value = input[key];
    if (value === undefined) continue;
    if (typeof value === 'object') Object.assign(out[key] as object, value);
    else (out as unknown as Record<string, unknown>)[key] = value;
  }
  return out;
}

/**
 * Archetype presets – an artist-authored starting point which the
 * procedural rules (and seeded variation) then refine.
 */
export const PRESETS: Record<string, CharacterParamsInput> = {
  Human: {},
  Heroic: {
    height: 1.9,
    proportions: { headSize: 0.9, shoulderWidth: 1.15, legLength: 1.06, armLength: 1.03 },
    build: { muscularity: 0.75, bodyFat: 0.12 },
  },
  Brute: {
    height: 2.15,
    proportions: { headSize: 0.85, shoulderWidth: 1.38, hipWidth: 1.15, neckLength: 0.6, armLength: 1.12, legLength: 0.92, handSize: 1.3, footSize: 1.2 },
    build: { muscularity: 1, bodyFat: 0.45, limbThickness: 1.3 },
    joints: { flexibility: 0.25 },
  },
  Elf: {
    height: 1.95,
    proportions: { headSize: 0.92, neckLength: 1.25, shoulderWidth: 0.92, hipWidth: 0.9, armLength: 1.08, legLength: 1.16, handSize: 0.9 },
    build: { muscularity: 0.3, bodyFat: 0.08, limbThickness: 0.82 },
    joints: { flexibility: 0.85 },
  },
  Dwarf: {
    height: 1.35,
    proportions: { headSize: 1.2, neckLength: 0.6, torsoLength: 1.12, shoulderWidth: 1.35, hipWidth: 1.2, armLength: 0.92, legLength: 0.74, handSize: 1.2, footSize: 1.15 },
    build: { muscularity: 0.8, bodyFat: 0.55, limbThickness: 1.3 },
    joints: { flexibility: 0.3 },
  },
  Goblin: {
    height: 1.1,
    proportions: { headSize: 1.55, neckLength: 0.8, shoulderWidth: 0.85, hipWidth: 0.85, armLength: 1.22, forearmRatio: 1, legLength: 0.85, handSize: 1.4, footSize: 1.35 },
    build: { muscularity: 0.2, bodyFat: 0.15, limbThickness: 0.75 },
    joints: { flexibility: 0.9, softness: 0.7 },
  },
};

const clamp = (v: number, r: Range) => Math.min(r[1], Math.max(r[0], v));

/** Clamp every numeric parameter into its documented range. */
export function clampParams(p: CharacterParams): CharacterParams {
  const out = cloneParams(p);
  out.height = clamp(out.height, PARAM_RANGES.height);
  out.armRestAngle = clamp(out.armRestAngle, PARAM_RANGES.armRestAngle);
  out.variation = clamp(out.variation, PARAM_RANGES.variation);
  for (const group of ['proportions', 'build', 'joints', 'detail'] as const) {
    const ranges = PARAM_RANGES[group] as Record<string, Range>;
    const values = out[group] as unknown as Record<string, number>;
    for (const key of Object.keys(ranges)) values[key] = clamp(values[key], ranges[key]);
  }
  out.detail.subdivisions = Math.round(out.detail.subdivisions);
  return out;
}

/**
 * Apply seeded individual variation on top of the params. The result is what
 * the generator actually uses; the same seed always yields the same person.
 */
export function resolveParams(p: CharacterParams): CharacterParams {
  const out = clampParams(p);
  const v = out.variation;
  if (v <= 0) return out;
  const rng = new Rng(out.seed * 7919 + 17);
  out.height *= 1 + rng.gauss() * 0.035 * v;
  const props = out.proportions as unknown as Record<string, number>;
  for (const key of Object.keys(props)) props[key] *= 1 + rng.gauss() * 0.045 * v;
  out.build.muscularity += rng.gauss() * 0.12 * v;
  out.build.bodyFat += rng.gauss() * 0.12 * v;
  out.build.limbThickness *= 1 + rng.gauss() * 0.05 * v;
  return clampParams(out);
}
