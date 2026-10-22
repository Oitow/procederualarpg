import { MathUtils } from 'three';
import type { PartId } from './anatomy';
import type { Cage, CageFaceInfo } from './cage';
import { Crease, PolyMesh, computeVertexNormals, faceNormal } from './polymesh';
import { BONE_COUNT } from './rig';

/**
 * Clothing & armour layers.
 *
 * A layer is defined declaratively by which cage faces it covers (body part,
 * range along the part, side, facing...). Its geometry is derived from the
 * body cage itself:
 *   1. copy the covered cage faces,
 *   2. push them out along the cage normals (offset + automatic stacking on
 *      top of layers that are already there),
 *   3. solidify (inner wall + rim) and mark the rim as a crease,
 *   4. copy the skin weights (optionally made rigid per piece),
 *   5. subdivide with the same Catmull-Clark scheme as the body.
 * Because shells share the cage topology and weights, they deform with the
 * body. Body faces fully covered by an opaque layer are removed, which avoids
 * poke-through and saves fill rate.
 */

export type LayerKind = 'cloth' | 'armor';
export type EquipSlot = 'legs' | 'torso' | 'waist' | 'feet' | 'hands' | 'arms' | 'shoulders' | 'head' | 'shins';

export interface CoverRule {
  parts: PartId[];
  /** Range along the part (0..1), inclusive. */
  from?: number;
  to?: number;
  side?: 'L' | 'R';
  /** Only faces whose normal points to the front (+Z) or back (-Z). */
  facing?: 'front' | 'back';
  /** Torso only: 0 = midline, 1 = flanks. */
  lateralMin?: number;
  lateralMax?: number;
  /** Extra offset at the start / end of the range (meters, reference scale). */
  flare?: [start: number, end: number];
}

export interface LayerMaterial {
  color: string;
  metalness: number;
  roughness: number;
}

export interface LayerDef {
  id: string;
  name: string;
  kind: LayerKind;
  slot: EquipSlot;
  /** Stacking order: lower is closer to the skin. */
  order: number;
  cover: CoverRule[];
  /** Minimum distance from the skin (meters, reference scale). */
  offset: number;
  /** Shell thickness (meters, reference scale). 0 = single sided. */
  thickness: number;
  /** Crease sharpness of the rim (subdivision levels it stays crisp). */
  rimSharpness: number;
  /** 0 = follows skin weights (cloth), 1 = moves as one rigid piece (plate). */
  rigidity: number;
  /** How much the shell follows sculpted muscles/features of the body (0-1). */
  conform: number;
  /** Remove fully covered body faces underneath. */
  hidesBody: boolean;
  /** Surface noise (meters) for hammered metal, wrinkles, ... */
  surfaceNoise?: number;
  /** Subdivision level relative to the body (e.g. -1 for cheap accessories). */
  subdivisionDelta?: number;
  material: LayerMaterial;
}

export const LAYER_LIBRARY: Record<string, LayerDef> = {
  trousers: {
    id: 'trousers', name: 'Trousers', kind: 'cloth', slot: 'legs', order: 1,
    cover: [
      { parts: ['torso'], to: 0.3 },
      { parts: ['thigh'] },
      { parts: ['shin'], to: 0.92, flare: [0, 0.012] },
    ],
    offset: 0.004, thickness: 0.003, rimSharpness: 1, rigidity: 0, conform: 0.85, hidesBody: true,
    surfaceNoise: 0.0012,
    material: { color: '#4a4036', metalness: 0, roughness: 0.95 },
  },
  tunic: {
    id: 'tunic', name: 'Tunic', kind: 'cloth', slot: 'torso', order: 2,
    cover: [
      { parts: ['torso'], from: 0.12 },
      { parts: ['upperarm'], to: 0.5, flare: [0, 0.006] },
    ],
    offset: 0.004, thickness: 0.003, rimSharpness: 1, rigidity: 0, conform: 0.85, hidesBody: true,
    surfaceNoise: 0.001,
    material: { color: '#8c7a5b', metalness: 0, roughness: 0.92 },
  },
  hood: {
    id: 'hood', name: 'Hood', kind: 'cloth', slot: 'head', order: 3,
    cover: [
      { parts: ['head'], from: 0.62 },
      { parts: ['head'], from: 0.1, facing: 'back' },
      { parts: ['neck'], facing: 'back' },
    ],
    offset: 0.014, thickness: 0.004, rimSharpness: 1, rigidity: 0.2, conform: 0.2, hidesBody: true,
    surfaceNoise: 0.0015,
    material: { color: '#2f3b2c', metalness: 0, roughness: 0.95 },
  },
  boots: {
    id: 'boots', name: 'Leather Boots', kind: 'cloth', slot: 'feet', order: 4,
    cover: [
      { parts: ['shin'], from: 0.45, flare: [0.01, 0] },
      { parts: ['foot'] },
    ],
    offset: 0.005, thickness: 0.005, rimSharpness: 2, rigidity: 0.25, conform: 0.4, hidesBody: true,
    material: { color: '#5a3a22', metalness: 0, roughness: 0.75 },
  },
  gloves: {
    id: 'gloves', name: 'Gloves', kind: 'cloth', slot: 'hands', order: 4,
    cover: [{ parts: ['hand'] }, { parts: ['forearm'], from: 0.78, flare: [0.006, 0] }],
    offset: 0.002, thickness: 0.003, rimSharpness: 2, rigidity: 0, conform: 0.5, hidesBody: true,
    material: { color: '#4b3523', metalness: 0, roughness: 0.8 },
  },
  belt: {
    id: 'belt', name: 'Belt', kind: 'armor', slot: 'waist', order: 6,
    cover: [{ parts: ['torso'], from: 0.2, to: 0.3 }],
    offset: 0.004, thickness: 0.007, rimSharpness: 3, rigidity: 0.6, conform: 0.2, hidesBody: false,
    material: { color: '#3b2716', metalness: 0.1, roughness: 0.6 },
  },
  breastplate: {
    id: 'breastplate', name: 'Breastplate', kind: 'armor', slot: 'torso', order: 10,
    cover: [{ parts: ['torso'], from: 0.38 }],
    offset: 0.012, thickness: 0.008, rimSharpness: 3, rigidity: 0.8, conform: 0.15, hidesBody: true,
    surfaceNoise: 0.0004,
    material: { color: '#9aa3ad', metalness: 0.9, roughness: 0.35 },
  },
  faulds: {
    id: 'faulds', name: 'Faulds', kind: 'armor', slot: 'waist', order: 11,
    cover: [
      { parts: ['torso'], to: 0.3 },
      { parts: ['thigh'], to: 0.32, flare: [0, 0.03] },
    ],
    offset: 0.012, thickness: 0.006, rimSharpness: 3, rigidity: 0.5, conform: 0, hidesBody: true,
    material: { color: '#858d96', metalness: 0.9, roughness: 0.4 },
  },
  pauldrons: {
    id: 'pauldrons', name: 'Pauldrons', kind: 'armor', slot: 'shoulders', order: 12,
    cover: [
      { parts: ['upperarm'], to: 0.38, flare: [0.012, 0.02] },
      { parts: ['torso'], from: 0.8, lateralMin: 0.6 },
    ],
    offset: 0.02, thickness: 0.009, rimSharpness: 3, rigidity: 0.9, conform: 0, hidesBody: true,
    material: { color: '#a7afb8', metalness: 0.9, roughness: 0.3 },
  },
  bracers: {
    id: 'bracers', name: 'Bracers', kind: 'armor', slot: 'arms', order: 12,
    cover: [{ parts: ['forearm'], from: 0.2, to: 0.9, flare: [0, 0.004] }],
    offset: 0.006, thickness: 0.006, rimSharpness: 3, rigidity: 0.9, conform: 0, hidesBody: true,
    material: { color: '#8e969f', metalness: 0.85, roughness: 0.35 },
  },
  greaves: {
    id: 'greaves', name: 'Greaves', kind: 'armor', slot: 'shins', order: 12,
    cover: [{ parts: ['shin'], from: 0.08, to: 0.85, facing: 'front' }],
    offset: 0.01, thickness: 0.006, rimSharpness: 3, rigidity: 0.9, conform: 0, hidesBody: false,
    material: { color: '#8e969f', metalness: 0.85, roughness: 0.35 },
  },
  helmet: {
    id: 'helmet', name: 'Helmet', kind: 'armor', slot: 'head', order: 13,
    cover: [
      { parts: ['head'], from: 0.6 },
      { parts: ['head'], from: 0.15, facing: 'back' },
    ],
    offset: 0.014, thickness: 0.008, rimSharpness: 3, rigidity: 1, conform: 0.05, hidesBody: true,
    surfaceNoise: 0.0004,
    material: { color: '#a0a8b2', metalness: 0.9, roughness: 0.3 },
  },
  barbarianPauldron: {
    id: 'barbarianPauldron', name: 'Spiked Pauldron (L)', kind: 'armor', slot: 'shoulders', order: 12,
    cover: [
      { parts: ['upperarm'], to: 0.42, side: 'L', flare: [0.02, 0.03] },
      { parts: ['torso'], from: 0.8, lateralMin: 0.6, side: 'L' },
    ],
    offset: 0.024, thickness: 0.012, rimSharpness: 3, rigidity: 1, conform: 0, hidesBody: true,
    surfaceNoise: 0.002,
    material: { color: '#6d5a48', metalness: 0.4, roughness: 0.6 },
  },
};

/** Ready-made outfits (lists of layer ids). */
export const OUTFITS: Record<string, string[]> = {
  None: [],
  Peasant: ['trousers', 'tunic', 'boots', 'belt'],
  Rogue: ['trousers', 'tunic', 'hood', 'gloves', 'boots', 'belt', 'bracers'],
  Knight: ['trousers', 'tunic', 'boots', 'gloves', 'belt', 'breastplate', 'faulds', 'pauldrons', 'bracers', 'greaves', 'helmet'],
  Barbarian: ['trousers', 'boots', 'belt', 'bracers', 'barbarianPauldron'],
};

export function matchesRule(rule: CoverRule, info: CageFaceInfo, normalZ: number): boolean {
  if (!rule.parts.includes(info.part)) return false;
  if (rule.from !== undefined && info.s < rule.from) return false;
  if (rule.to !== undefined && info.s > rule.to) return false;
  if (rule.side && info.side !== rule.side) return false;
  if (rule.facing === 'front' && normalZ < 0.15) return false;
  if (rule.facing === 'back' && normalZ > -0.15) return false;
  if (rule.lateralMin !== undefined && info.lateral < rule.lateralMin) return false;
  if (rule.lateralMax !== undefined && info.lateral > rule.lateralMax) return false;
  return true;
}

export interface LayerShell {
  def: LayerDef;
  /** Low-poly shell (cage level), ready for subdivision. */
  mesh: PolyMesh;
  /** Cage faces this layer covers. */
  cageFaces: number[];
}

export interface LayerBuildResult {
  shells: LayerShell[];
  /** 1 for body cage faces hidden under opaque layers. */
  bodyFaceHidden: Uint8Array;
}

export function buildLayerShells(cage: Cage, layers: LayerDef[], scale: number): LayerBuildResult {
  const body = cage.mesh;
  const V = body.vertexCount;
  const F = body.faceCount;
  const S = body.stride;
  const normals = computeVertexNormals(body);
  const faceNZ = new Float64Array(F);
  for (let f = 0; f < F; f++) faceNZ[f] = faceNormal(body, f)[2];

  const occupancy = new Float64Array(V);
  const covered = new Uint8Array(F);
  const shells: LayerShell[] = [];
  const gap = 0.0015 * scale;

  const sorted = [...layers].sort((a, b) => a.order - b.order);
  for (const def of sorted) {
    // ---- select faces -----------------------------------------------------
    const selected: number[] = [];
    const faceFlare = new Map<number, number>();
    for (let f = 0; f < F; f++) {
      let hit = false;
      let flare = 0;
      for (const rule of def.cover) {
        if (!matchesRule(rule, cage.faceInfo[f], faceNZ[f])) continue;
        hit = true;
        if (rule.flare) {
          const a = rule.from ?? 0;
          const b = rule.to ?? 1;
          const t = b > a ? MathUtils.clamp((cage.faceInfo[f].s - a) / (b - a), 0, 1) : 0;
          flare = Math.max(flare, MathUtils.lerp(rule.flare[0], rule.flare[1], t));
        }
      }
      if (hit) {
        selected.push(f);
        faceFlare.set(f, flare);
      }
    }
    if (selected.length === 0) continue;

    // ---- per-vertex offsets ------------------------------------------------
    const local = new Map<number, number>();
    const flareSum: number[] = [];
    const flareCnt: number[] = [];
    for (const f of selected) {
      for (const v of body.face(f)) {
        let i = local.get(v);
        if (i === undefined) {
          i = local.size;
          local.set(v, i);
          flareSum.push(0);
          flareCnt.push(0);
        }
        flareSum[i] += faceFlare.get(f)!;
        flareCnt[i]++;
      }
    }
    const n = local.size;
    const cageVerts = Array.from(local.keys());
    const inner = new Float64Array(n);
    const outer = new Float64Array(n);
    cageVerts.forEach((v, i) => {
      const base = (def.offset + flareSum[i] / flareCnt[i]) * scale;
      inner[i] = Math.max(base, occupancy[v] > 0 ? occupancy[v] + gap : 0);
      outer[i] = inner[i] + def.thickness * scale;
    });
    cageVerts.forEach((v, i) => (occupancy[v] = Math.max(occupancy[v], outer[i])));

    // ---- skin weights (rigid per connected piece) -----------------------
    const weights = pieceWeights(body, selected, local, def.rigidity);

    // ---- geometry ------------------------------------------------------------
    const solid = def.thickness > 0;
    const vertCount = solid ? 2 * n : n;
    const data = new Float64Array(vertCount * S);
    const put = (dst: number, cageV: number, off: number, i: number) => {
      const o = dst * S;
      const c = cageV * S;
      data[o] = body.data[c] + normals[cageV * 3] * off;
      data[o + 1] = body.data[c + 1] + normals[cageV * 3 + 1] * off;
      data[o + 2] = body.data[c + 2] + normals[cageV * 3 + 2] * off;
      data.set(weights.subarray(i * BONE_COUNT, (i + 1) * BONE_COUNT), o + 3);
    };
    cageVerts.forEach((v, i) => {
      put(i, v, outer[i], i);
      if (solid) put(n + i, v, inner[i], i);
    });

    const faces: number[][] = [];
    const directed = new Set<string>();
    for (const f of selected) {
      const face = body.face(f).map((v) => local.get(v)!);
      faces.push(face);
      for (let k = 0; k < face.length; k++) directed.add(`${face[k]},${face[(k + 1) % face.length]}`);
    }
    const boundary: [number, number][] = [];
    for (const face of faces) {
      for (let k = 0; k < face.length; k++) {
        const a = face[k];
        const b = face[(k + 1) % face.length];
        if (!directed.has(`${b},${a}`)) boundary.push([a, b]);
      }
    }
    const creases: Crease[] = [];
    if (solid) {
      const outerFaces = faces.length;
      for (let k = 0; k < outerFaces; k++) faces.push(faces[k].map((v) => v + n).reverse());
      for (const [a, b] of boundary) {
        faces.push([b, a, a + n, b + n]);
        if (def.rimSharpness > 0) {
          creases.push({ a, b, sharpness: def.rimSharpness });
          creases.push({ a: a + n, b: b + n, sharpness: def.rimSharpness });
        }
      }
    } else if (def.rimSharpness > 0) {
      for (const [a, b] of boundary) creases.push({ a, b, sharpness: def.rimSharpness });
    }

    const tags = new Array(faces.length).fill(shells.length);
    shells.push({ def, mesh: PolyMesh.fromFaces(S, data, faces, tags, creases), cageFaces: selected });
    if (def.hidesBody) for (const f of selected) covered[f] = 1;
  }

  return { shells, bodyFaceHidden: erodeCoverage(body, covered) };
}

/**
 * Blend skin weights toward the average of their connected piece.
 * rigidity 0 = unchanged (cloth), 1 = the piece moves as one rigid object.
 */
function pieceWeights(body: PolyMesh, selected: number[], local: Map<number, number>, rigidity: number): Float64Array {
  const n = local.size;
  const S = body.stride;
  const w = new Float64Array(n * BONE_COUNT);
  for (const [v, i] of local) w.set(body.data.subarray(v * S + 3, v * S + 3 + BONE_COUNT), i * BONE_COUNT);
  if (rigidity <= 0) return w;

  // union-find over the selected faces
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  for (const f of selected) {
    const face = body.face(f).map((v) => local.get(v)!);
    for (let k = 1; k < face.length; k++) parent[find(face[k])] = find(face[0]);
  }
  const avg = new Map<number, Float64Array>();
  const count = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    if (!avg.has(r)) {
      avg.set(r, new Float64Array(BONE_COUNT));
      count.set(r, 0);
    }
    const a = avg.get(r)!;
    for (let b = 0; b < BONE_COUNT; b++) a[b] += w[i * BONE_COUNT + b];
    count.set(r, count.get(r)! + 1);
  }
  for (let i = 0; i < n; i++) {
    const r = find(i);
    const a = avg.get(r)!;
    const c = count.get(r)!;
    for (let b = 0; b < BONE_COUNT; b++) {
      const o = i * BONE_COUNT + b;
      w[o] = MathUtils.lerp(w[o], a[b] / c, rigidity);
    }
  }
  return w;
}

/** A body face is hidden only if it and all its edge neighbours are covered. */
function erodeCoverage(body: PolyMesh, covered: Uint8Array): Uint8Array {
  const F = body.faceCount;
  const V = body.vertexCount;
  const edgeFaces = new Map<number, number[]>();
  for (let f = 0; f < F; f++) {
    const face = body.face(f);
    for (let k = 0; k < face.length; k++) {
      const a = face[k];
      const b = face[(k + 1) % face.length];
      const key = a < b ? a * V + b : b * V + a;
      const list = edgeFaces.get(key);
      if (list) list.push(f);
      else edgeFaces.set(key, [f]);
    }
  }
  const hidden = new Uint8Array(F);
  for (let f = 0; f < F; f++) {
    if (!covered[f]) continue;
    const face = body.face(f);
    let ok = true;
    for (let k = 0; k < face.length && ok; k++) {
      const a = face[k];
      const b = face[(k + 1) % face.length];
      const key = a < b ? a * V + b : b * V + a;
      for (const g of edgeFaces.get(key)!) if (!covered[g]) ok = false;
    }
    hidden[f] = ok ? 1 : 0;
  }
  return hidden;
}
