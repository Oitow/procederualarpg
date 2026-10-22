import type { BoneName } from './rig';

/**
 * Artist-authored anatomy data.
 *
 * This file is the "artistic refinement" half of the system: it holds shape
 * profiles for a 1.8 m reference figure. The procedural half (cage.ts,
 * detail.ts) scales and modulates these by proportions, build and seed.
 * Tweak numbers here to change the overall look without touching any code.
 */

export type PartId = 'torso' | 'neck' | 'head' | 'upperarm' | 'forearm' | 'hand' | 'thigh' | 'shin' | 'foot';

export const PART_IDS: PartId[] = ['torso', 'neck', 'head', 'upperarm', 'forearm', 'hand', 'thigh', 'shin', 'foot'];

/**
 * A cross-section ring along a limb chain.
 * Radii are given per half-axis of the bone frame (left-side convention):
 *   rx = [toward +X, toward -X], rz = [toward +Z (front/top), toward -Z (back/bottom)].
 * For arms +X points down/into the body (palm side); for legs +X points to the
 * body midline; for the neck/head +X is the character's left.
 */
export interface Station {
  /** Position along the chain (bone i spans [i, i+1]). */
  s: number;
  rx: [number, number];
  rz: [number, number];
  /** Shift of the ring center along local Z. */
  offZ?: number;
  /** How strongly muscularity inflates this ring (0-1). */
  m?: number;
  /** How strongly body fat inflates this ring (0-1). */
  f?: number;
  /** Keep the bottom of this ring on the ground plane (feet). */
  ground?: boolean;
}

export interface ChainDef {
  id: 'arm' | 'leg' | 'neck';
  bones: (side: 'L' | 'R' | 'C') => BoneName[];
  /** Part id for each bone segment of the chain. */
  parts: PartId[];
  /** Bone that the root of the chain is blended with. */
  attachBone: (side: 'L' | 'R' | 'C') => BoneName;
  stations: Station[];
  /** Station index at which the ring resolution doubles (8 → 16 vertices). */
  refineAt?: number;
  /** Chain parameter of the closing tip vertex. */
  tipS: number;
  /** Offset of the tip along local Z / X (meters, reference scale). */
  tipOffset?: { x?: number; z?: number; ground?: number };
  /** Multipliers for radii per part: proportions that scale cross sections. */
  partScale?: Partial<Record<PartId, 'handSize' | 'footSize' | 'headSize'>>;
}

export const ARM_CHAIN: ChainDef = {
  id: 'arm',
  bones: (s) => [`upperarm_${s}`, `forearm_${s}`, `hand_${s}`] as BoneName[],
  parts: ['upperarm', 'forearm', 'hand'],
  attachBone: (s) => `clavicle_${s}` as BoneName,
  partScale: { hand: 'handSize' },
  stations: [
    { s: 0.1, rx: [0.0604, 0.0701], rz: [0.0653, 0.0629], m: 1, f: 0.5 },
    { s: 0.45, rx: [0.0495, 0.0519], rz: [0.0555, 0.0495], m: 0.9, f: 0.6 },
    { s: 0.84, rx: [0.0423, 0.0423], rz: [0.0423, 0.0472], m: 0.5, f: 0.4 },
    { s: 1.02, rx: [0.0387, 0.0399], rz: [0.0374, 0.0423], m: 0.2, f: 0.2 },
    { s: 1.26, rx: [0.0447, 0.0472], rz: [0.0459, 0.0423], m: 0.8, f: 0.4 },
    { s: 1.62, rx: [0.0351, 0.0351], rz: [0.0374, 0.0351], m: 0.4, f: 0.3 },
    { s: 1.94, rx: [0.0217, 0.0217], rz: [0.0308, 0.0296], m: 0.1, f: 0.1 },
    { s: 2.28, rx: [0.021, 0.023], rz: [0.05, 0.045] },
    { s: 2.6, rx: [0.018, 0.019], rz: [0.049, 0.043] },
    { s: 2.84, rx: [0.014, 0.015], rz: [0.041, 0.035] },
  ],
  tipS: 3.0,
  tipOffset: { x: 0.002 },
};

export const LEG_CHAIN: ChainDef = {
  id: 'leg',
  bones: (s) => [`thigh_${s}`, `shin_${s}`, `foot_${s}`, `toe_${s}`] as BoneName[],
  parts: ['thigh', 'shin', 'foot', 'foot'],
  attachBone: () => 'pelvis',
  partScale: { foot: 'footSize' },
  stations: [
    { s: 0.22, rx: [0.0813, 0.0961], rz: [0.0949, 0.101], m: 0.6, f: 1 },
    { s: 0.55, rx: [0.0715, 0.0788], rz: [0.0788, 0.0776], m: 0.8, f: 0.7 },
    { s: 0.88, rx: [0.0579, 0.0604], rz: [0.0628, 0.0604], m: 0.4, f: 0.4 },
    { s: 1.0, rx: [0.0554, 0.0579], rz: [0.0616, 0.0567], m: 0.2, f: 0.2 },
    { s: 1.22, rx: [0.0542, 0.0554], rz: [0.053, 0.0739], m: 0.9, f: 0.4 },
    { s: 1.55, rx: [0.0431, 0.0444], rz: [0.0431, 0.0542], m: 0.5, f: 0.3 },
    { s: 1.86, rx: [0.0308, 0.0333], rz: [0.0357, 0.037], m: 0.1, f: 0.1 },
    { s: 2.0, rx: [0.033, 0.0352], rz: [0.0374, 0.0682] },
    { s: 2.38, rx: [0.0429, 0.0462], rz: [0.033, 0.033], ground: true },
    { s: 2.78, rx: [0.0484, 0.0528], rz: [0.0253, 0.0264], ground: true },
    { s: 3.05, rx: [0.0484, 0.0539], rz: [0.0209, 0.022], ground: true },
    { s: 3.55, rx: [0.044, 0.0462], rz: [0.0165, 0.0165], ground: true },
  ],
  tipS: 4.0,
  tipOffset: { ground: 0.013 },
};

export const NECK_CHAIN: ChainDef = {
  id: 'neck',
  bones: () => ['neck', 'head'],
  parts: ['neck', 'head'],
  attachBone: () => 'chest',
  partScale: { head: 'headSize' },
  refineAt: 2,
  stations: [
    { s: 0.5, rx: [0.0541, 0.0541], rz: [0.053, 0.053], m: 0.5, f: 0.5 },
    { s: 0.9, rx: [0.0488, 0.0488], rz: [0.0519, 0.0498], m: 0.3, f: 0.3 },
    { s: 1.03, rx: [0.0594, 0.0594], rz: [0.088, 0.0477], offZ: 0.012 },
    { s: 1.22, rx: [0.07, 0.07], rz: [0.0986, 0.07], offZ: 0.012 },
    { s: 1.45, rx: [0.0784, 0.0784], rz: [0.0996, 0.0954], offZ: 0.012 },
    { s: 1.66, rx: [0.0816, 0.0816], rz: [0.0943, 0.1049], offZ: 0.012 },
    { s: 1.83, rx: [0.0721, 0.0721], rz: [0.0795, 0.0954], offZ: 0.01 },
    { s: 1.95, rx: [0.0466, 0.0466], rz: [0.0466, 0.0615], offZ: 0.006 },
  ],
  tipS: 2.0,
  tipOffset: { z: -0.004 },
};

/**
 * Torso cross-section layers (bottom → top), reference widths in meters.
 * W = half width, Df/Db = depth to the front/back, e = squareness exponent
 * (2 = ellipse, higher = boxier).
 */
export interface TorsoLayerShape {
  W: number;
  Df: number;
  Db: number;
  e: number;
  /** response to muscularity (added to W, Df) */
  mW: number;
  mDf: number;
  /** response to body fat (added to W, Df, Db) */
  fW: number;
  fDf: number;
  fDb: number;
}

/** Shapes for layers 1..5; layer 0 (crotch) and 6 (shoulder line) are derived from joints. */
export const TORSO_LAYERS: Record<1 | 2 | 3 | 4 | 5, TorsoLayerShape> = {
  1: { W: 0.17, Df: 0.084, Db: 0.096, e: 2.3, mW: 0.004, mDf: 0.0, fW: 0.03, fDf: 0.025, fDb: 0.03 },
  2: { W: 0.155, Df: 0.088, Db: 0.084, e: 2.3, mW: 0.004, mDf: 0.004, fW: 0.04, fDf: 0.055, fDb: 0.02 },
  3: { W: 0.143, Df: 0.086, Db: 0.08, e: 2.4, mW: 0.008, mDf: 0.006, fW: 0.045, fDf: 0.055, fDb: 0.02 },
  4: { W: 0.165, Df: 0.096, Db: 0.088, e: 2.5, mW: 0.022, mDf: 0.014, fW: 0.03, fDf: 0.03, fDb: 0.015 },
  5: { W: 0.178, Df: 0.1, Db: 0.088, e: 2.5, mW: 0.02, mDf: 0.022, fW: 0.02, fDf: 0.02, fDb: 0.012 },
};

/**
 * Sculpt deformers: ellipsoidal displacements along the surface normal,
 * evaluated on the subdivided surface in the bone's rest frame.
 * `t` is the position along the bone (0 = head, 1 = tail), `at` = [x, z] offset
 * in the bone frame, `r` = ellipsoid radii in bone frame (x, y, z), `amount`
 * = peak displacement (negative = carve). Values for the reference figure.
 * Bones ending in _L, and centre-bone sculpts with a non-zero x offset, are
 * mirrored to the other side automatically.
 */
export interface SculptDef {
  name: string;
  bone: BoneName;
  group: 'muscle' | 'face' | 'fat';
  t: number;
  at: [number, number];
  r: [number, number, number];
  amount: number;
}

export const SCULPTS: SculptDef[] = [
  // --- face (head bone: x = left, z = forward) ---
  { name: 'nose', bone: 'head', group: 'face', t: 0.42, at: [0, 0.112], r: [0.017, 0.036, 0.03], amount: 0.024 },
  { name: 'noseTip', bone: 'head', group: 'face', t: 0.34, at: [0, 0.12], r: [0.014, 0.013, 0.02], amount: 0.008 },
  { name: 'nostrils', bone: 'head', group: 'face', t: 0.33, at: [0.012, 0.112], r: [0.01, 0.009, 0.014], amount: 0.004 },
  { name: 'eyeSocket', bone: 'head', group: 'face', t: 0.53, at: [0.034, 0.1], r: [0.022, 0.016, 0.022], amount: -0.012 },
  { name: 'eyeball', bone: 'head', group: 'face', t: 0.525, at: [0.034, 0.104], r: [0.011, 0.008, 0.012], amount: 0.005 },
  { name: 'brow', bone: 'head', group: 'face', t: 0.61, at: [0.032, 0.105], r: [0.034, 0.012, 0.022], amount: 0.007 },
  { name: 'cheekbone', bone: 'head', group: 'face', t: 0.45, at: [0.052, 0.078], r: [0.024, 0.017, 0.022], amount: 0.006 },
  { name: 'mouth', bone: 'head', group: 'face', t: 0.235, at: [0, 0.108], r: [0.024, 0.006, 0.02], amount: -0.004 },
  { name: 'lips', bone: 'head', group: 'face', t: 0.245, at: [0, 0.108], r: [0.021, 0.015, 0.02], amount: 0.004 },
  { name: 'chin', bone: 'head', group: 'face', t: 0.08, at: [0, 0.095], r: [0.026, 0.022, 0.03], amount: 0.01 },
  { name: 'jaw', bone: 'head', group: 'face', t: 0.12, at: [0.05, 0.04], r: [0.02, 0.03, 0.05], amount: 0.004 },
  { name: 'ear', bone: 'head', group: 'face', t: 0.47, at: [0.078, -0.005], r: [0.012, 0.032, 0.019], amount: 0.014 },
  // --- torso ---
  { name: 'pec', bone: 'chest', group: 'muscle', t: 0.62, at: [0.062, 0.09], r: [0.068, 0.05, 0.05], amount: 0.012 },
  { name: 'abs', bone: 'spine', group: 'muscle', t: 0.6, at: [0, 0.09], r: [0.06, 0.11, 0.04], amount: 0.005 },
  { name: 'absLine', bone: 'spine', group: 'muscle', t: 0.6, at: [0, 0.095], r: [0.006, 0.12, 0.03], amount: -0.003 },
  { name: 'lat', bone: 'chest', group: 'muscle', t: 0.35, at: [0.125, -0.02], r: [0.04, 0.1, 0.06], amount: 0.008 },
  { name: 'trapezius', bone: 'neck', group: 'muscle', t: 0.05, at: [0.06, -0.02], r: [0.06, 0.05, 0.04], amount: 0.01 },
  { name: 'shoulderBlade', bone: 'chest', group: 'muscle', t: 0.6, at: [0.075, -0.085], r: [0.05, 0.06, 0.04], amount: 0.005 },
  { name: 'glute', bone: 'pelvis', group: 'muscle', t: 0.1, at: [0.07, -0.09], r: [0.07, 0.07, 0.05], amount: 0.01 },
  { name: 'belly', bone: 'spine', group: 'fat', t: 0.2, at: [0, 0.09], r: [0.11, 0.12, 0.08], amount: 0.025 },
  { name: 'loveHandle', bone: 'pelvis', group: 'fat', t: 0.9, at: [0.13, 0], r: [0.05, 0.06, 0.08], amount: 0.012 },
  // --- arms (x = palm side, z = forward) ---
  { name: 'deltoid', bone: 'upperarm_L', group: 'muscle', t: 0.12, at: [-0.01, 0], r: [0.06, 0.08, 0.06], amount: 0.01 },
  { name: 'biceps', bone: 'upperarm_L', group: 'muscle', t: 0.5, at: [0, 0.03], r: [0.035, 0.1, 0.03], amount: 0.01 },
  { name: 'triceps', bone: 'upperarm_L', group: 'muscle', t: 0.4, at: [0, -0.03], r: [0.035, 0.11, 0.03], amount: 0.008 },
  { name: 'forearmFlexor', bone: 'forearm_L', group: 'muscle', t: 0.25, at: [0, 0.01], r: [0.04, 0.09, 0.04], amount: 0.006 },
  // --- legs (x = toward midline, z = forward) ---
  { name: 'quad', bone: 'thigh_L', group: 'muscle', t: 0.55, at: [-0.01, 0.045], r: [0.045, 0.16, 0.04], amount: 0.01 },
  { name: 'vastus', bone: 'thigh_L', group: 'muscle', t: 0.82, at: [0.03, 0.035], r: [0.03, 0.05, 0.03], amount: 0.006 },
  { name: 'hamstring', bone: 'thigh_L', group: 'muscle', t: 0.45, at: [0, -0.05], r: [0.045, 0.15, 0.04], amount: 0.006 },
  { name: 'kneecap', bone: 'shin_L', group: 'muscle', t: 0.02, at: [0, 0.048], r: [0.025, 0.025, 0.02], amount: 0.004 },
  { name: 'calf', bone: 'shin_L', group: 'muscle', t: 0.25, at: [0.01, -0.05], r: [0.04, 0.09, 0.04], amount: 0.009 },
  { name: 'thighFat', bone: 'thigh_L', group: 'fat', t: 0.2, at: [-0.04, 0], r: [0.06, 0.12, 0.08], amount: 0.012 },
];
