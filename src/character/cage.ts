import { MathUtils, Vector3 } from 'three';
import { ARM_CHAIN, ChainDef, LEG_CHAIN, NECK_CHAIN, PART_IDS, PartId, Station, TORSO_LAYERS } from './anatomy';
import type { CharacterParams } from './params';
import { PolyMesh } from './polymesh';
import { fitCageToLimit } from './subdivision';
import { BONE_COUNT, BONE_INDEX, BoneName, Chain, Rig, Side, chainFrame, chainPoint, getBone } from './rig';

/**
 * Low-poly control cage ("box modelling" done by code).
 *
 *  1. The torso is a 4×6×2 quad lattice box whose rings are shaped from
 *     joint positions and the TORSO_LAYERS profile.
 *  2. Arms, legs and the neck/head are extruded out of 2×2 face patches of
 *     that box, one extrusion per anatomy station. Every new ring is placed
 *     on the skeleton (position + blended bone frame) with the station's
 *     cross-section radii, and the patch itself becomes the rounded tip.
 *
 * The result is a closed, all-quad, genus-0 mesh of ~450 vertices with skin
 * weights per vertex. Catmull-Clark subdivision turns it into the smooth body.
 */

export interface CageFaceInfo {
  part: PartId;
  side: Side;
  /** Normalised position within the part (0 = proximal/bottom, 1 = distal/top). */
  s: number;
  /** Torso only: 0 = body midline, 1 = flank/arm socket. */
  lateral: number;
}

export interface Cage {
  mesh: PolyMesh;
  faceInfo: CageFaceInfo[];
}

const SIDES: Side[] = ['L', 'R', 'C'];
export function faceTagFor(part: PartId, side: Side): number {
  return PART_IDS.indexOf(part) * 3 + SIDES.indexOf(side);
}
export function decodeFaceTag(tag: number): { part: PartId; side: Side } {
  return { part: PART_IDS[Math.floor(tag / 3)], side: SIDES[tag % 3] };
}

class CageBuilder {
  readonly stride = 3 + BONE_COUNT;
  data: number[] = [];
  faces: number[][] = [];
  info: CageFaceInfo[] = [];

  get vertexCount() {
    return this.data.length / this.stride;
  }

  addVertex(p: Vector3, w?: ArrayLike<number>): number {
    const v = this.vertexCount;
    this.data.push(p.x, p.y, p.z);
    for (let b = 0; b < BONE_COUNT; b++) this.data.push(w ? w[b] : 0);
    return v;
  }

  duplicate(v: number): number {
    const o = v * this.stride;
    const n = this.vertexCount;
    for (let c = 0; c < this.stride; c++) this.data.push(this.data[o + c]);
    return n;
  }

  position(v: number, out = new Vector3()): Vector3 {
    const o = v * this.stride;
    return out.set(this.data[o], this.data[o + 1], this.data[o + 2]);
  }

  setPosition(v: number, p: Vector3) {
    const o = v * this.stride;
    this.data[o] = p.x;
    this.data[o + 1] = p.y;
    this.data[o + 2] = p.z;
  }

  setWeights(v: number, w: ArrayLike<number>) {
    const o = v * this.stride + 3;
    for (let b = 0; b < BONE_COUNT; b++) this.data[o + b] = w[b];
  }

  addFace(verts: number[], info: CageFaceInfo): number {
    this.faces.push(verts);
    this.info.push(info);
    return this.faces.length - 1;
  }

  /**
   * Extrude a disc-shaped face region. The region faces move onto a new ring
   * of vertices; side quads connect the old boundary loop to the new one.
   * Interior vertices of the region are kept (they are only used by the region).
   */
  extrude(region: number[]): { loop: number[]; newLoop: number[]; sideFaces: number[] } {
    const { loop } = this.boundaryLoop(region);
    const newLoop = loop.map((v) => this.duplicate(v));
    const remap = new Map(loop.map((v, i) => [v, newLoop[i]]));
    for (const f of region) this.faces[f] = this.faces[f].map((v) => remap.get(v) ?? v);
    const sideFaces: number[] = [];
    const n = loop.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      sideFaces.push(this.addFace([loop[i], loop[j], newLoop[j], newLoop[i]], { ...this.info[region[0]] }));
    }
    return { loop, newLoop, sideFaces };
  }

  /**
   * Like extrude(), but the new ring has twice as many vertices. The side
   * faces become pentagons (Catmull-Clark turns them into quads) and the
   * region is re-topologised into an N/4 × N/4 grid cap. Returns the new
   * region faces and the grid (row-major vertex ids) of the cap.
   */
  extrudeRefine(region: number[]): {
    loop: number[];
    newLoop: number[];
    sideFaces: number[];
    region: number[];
    grid: number[][];
  } {
    const { loop } = this.boundaryLoop(region);
    const n = loop.length;
    const g = (2 * n) / 4;
    if (!Number.isInteger(g)) throw new Error('extrudeRefine: loop length must be even');
    const newLoop: number[] = [];
    for (let i = 0; i < n; i++) newLoop.push(this.duplicate(loop[i]), this.duplicate(loop[i]));
    const sideFaces: number[] = [];
    const info = { ...this.info[region[0]] };
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      sideFaces.push(this.addFace([loop[i], loop[j], newLoop[2 * j], newLoop[2 * i + 1], newLoop[2 * i]], { ...info }));
    }
    // grid cap: perimeter walks (0,0)→(0,g)→(g,g)→(g,0)→(0,0), matching the loop direction
    const interiorOld = new Set<number>();
    const loopSet = new Set(loop);
    for (const f of region) for (const v of this.faces[f]) if (!loopSet.has(v)) interiorOld.add(v);
    const reuse = [...interiorOld];
    const grid: number[][] = Array.from({ length: g + 1 }, () => new Array<number>(g + 1).fill(-1));
    const perimeter: [number, number][] = [];
    for (let c = 0; c < g; c++) perimeter.push([0, c]);
    for (let r = 0; r < g; r++) perimeter.push([r, g]);
    for (let c = g; c > 0; c--) perimeter.push([g, c]);
    for (let r = g; r > 0; r--) perimeter.push([r, 0]);
    perimeter.forEach(([r, c], k) => (grid[r][c] = newLoop[k]));
    for (let r = 1; r < g; r++)
      for (let c = 1; c < g; c++) grid[r][c] = reuse.length ? reuse.pop()! : this.duplicate(loop[0]);
    const newRegion: number[] = [];
    const slots = [...region];
    for (let r = 0; r < g; r++)
      for (let c = 0; c < g; c++) {
        const face = [grid[r][c], grid[r][c + 1], grid[r + 1][c + 1], grid[r + 1][c]];
        const slot = slots.pop();
        if (slot !== undefined) {
          this.faces[slot] = face;
          newRegion.push(slot);
        } else newRegion.push(this.addFace(face, { ...info }));
      }
    return { loop, newLoop, sideFaces, region: newRegion, grid };
  }

  private boundaryLoop(region: number[]): { loop: number[] } {
    const dir = new Set<string>();
    for (const f of region) {
      const face = this.faces[f];
      for (let i = 0; i < face.length; i++) dir.add(`${face[i]},${face[(i + 1) % face.length]}`);
    }
    const next = new Map<number, number>();
    for (const f of region) {
      const face = this.faces[f];
      for (let i = 0; i < face.length; i++) {
        const a = face[i];
        const b = face[(i + 1) % face.length];
        if (!dir.has(`${b},${a}`)) next.set(a, b);
      }
    }
    const start = next.keys().next().value as number;
    const loop = [start];
    for (let v = next.get(start)!; v !== start; v = next.get(v)!) {
      loop.push(v);
      if (loop.length > next.size) throw new Error('extrude: region boundary is not a single loop');
    }
    if (loop.length !== next.size) throw new Error('extrude: region has more than one boundary loop');
    return { loop };
  }

  build(fit: number): Cage {
    const tags = this.info.map((i) => faceTagFor(i.part, i.side));
    let mesh = PolyMesh.fromFaces(this.stride, this.data, this.faces, tags);
    if (fit > 0) mesh = fitCageToLimit(mesh, 3, fit);
    return { mesh, faceInfo: this.info };
  }
}

const smooth = (x: number) => {
  const t = MathUtils.clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};

function weightsOf(entries: [BoneName, number][]): Float64Array {
  const w = new Float64Array(BONE_COUNT);
  let sum = 0;
  for (const [, v] of entries) sum += v;
  for (const [b, v] of entries) w[BONE_INDEX[b]] += v / sum;
  return w;
}

/** Skin weights along a chain: each bone owns its segment, joints blend smoothly. */
export function chainWeights(bones: number[], attach: number, s: number, blend: number): Float64Array {
  const w = new Float64Array(BONE_COUNT);
  const n = bones.length;
  const i = MathUtils.clamp(Math.floor(s), 0, n - 1);
  const t = s - i;
  let own = 1;
  if (t < blend) {
    const a = 0.5 + 0.5 * smooth(t / blend);
    w[i > 0 ? bones[i - 1] : attach] += 1 - a;
    own = a;
  } else if (t > 1 - blend && i < n - 1) {
    const a = 0.5 * smooth((t - (1 - blend)) / blend);
    w[bones[i + 1]] += a;
    own = 1 - a;
  }
  w[bones[i]] += own;
  return w;
}

interface BuildContext {
  rig: Rig;
  params: CharacterParams;
  k: number;
  blend: number;
}

// ---------------------------------------------------------------------------
// Torso
// ---------------------------------------------------------------------------

const NX = 4;
const NY = 6;
const NZ = 2;
const latticeKey = (i: number, j: number, k: number) => `${i},${j},${k}`;

interface TorsoLayer {
  y: number;
  W: number;
  Df: number;
  Db: number;
  e: number;
}

function sgnPow(v: number, p: number) {
  return Math.sign(v) * Math.pow(Math.abs(v), p);
}

function torsoLayers(ctx: BuildContext): TorsoLayer[] {
  const { rig, params, k } = ctx;
  const pr = params.proportions;
  const musc = params.build.muscularity - 0.4;
  const fat = params.build.bodyFat - 0.25;
  const lt = params.build.limbThickness;
  const hipY = getBone(rig, 'thigh_L').head.y;
  const shoulderY = getBone(rig, 'upperarm_L').head.y;
  const shoulderX = getBone(rig, 'upperarm_L').head.x;
  const y1 = hipY + 0.04 * k;
  const y4 = shoulderY - 0.1 * k;
  const heights = [0, y1, MathUtils.lerp(y1, y4, 0.3), MathUtils.lerp(y1, y4, 0.62), y4, shoulderY - 0.025 * k];
  const widthFollowsShoulders = [0, 0, 0.2, 0.5, 0.9, 1];
  const layers: TorsoLayer[] = [];
  for (let j = 1; j <= 5; j++) {
    const L = TORSO_LAYERS[j as 1 | 2 | 3 | 4 | 5];
    const wf = MathUtils.lerp(pr.hipWidth, pr.shoulderWidth, widthFollowsShoulders[j]);
    const thick = MathUtils.lerp(1, lt, 0.5);
    layers[j] = {
      y: heights[j],
      W: Math.max(0.05, (L.W * wf * thick + L.mW * musc + L.fW * fat)) * k,
      Df: Math.max(0.04, (L.Df * thick + L.mDf * musc + L.fDf * fat)) * k,
      Db: Math.max(0.04, (L.Db * thick + L.fDb * fat + (j === 1 ? 0.012 * musc : 0))) * k,
      e: L.e,
    };
  }
  // The hip layer must enclose the thigh sockets.
  layers[1].W = Math.max(layers[1].W, getBone(rig, 'thigh_L').head.x + 0.07 * k * lt);
  layers[0] = { y: hipY, W: layers[1].W * 0.97, Df: layers[1].Df * 0.88, Db: layers[1].Db * 0.92, e: 2 };
  layers[6] = {
    y: shoulderY + 0.042 * k,
    W: shoulderX - 0.012 * k,
    Df: (0.062 + 0.01 * musc) * k,
    Db: (0.062 + 0.008 * musc) * k,
    e: 2.2,
  };
  return layers;
}

function ringPoint(L: TorsoLayer, xh: number, zh: number, out: Vector3): Vector3 {
  const th = Math.atan2(zh, xh);
  const c = Math.cos(th);
  const s = Math.sin(th);
  const p = 2 / L.e;
  return out.set(L.W * sgnPow(c, p), L.y, (s >= 0 ? L.Df : L.Db) * sgnPow(s, p));
}

function torsoPosition(ctx: BuildContext, layers: TorsoLayer[], i: number, j: number, kk: number): Vector3 {
  const { rig, k } = ctx;
  const xh = i / 2 - 1;
  const zh = kk - 1;
  const ax = Math.abs(xh);
  const out = new Vector3();
  if (j === 0) {
    // crotch / hip sockets: two rounded rectangles around the thigh heads
    const hipX = getBone(rig, 'thigh_L').head.x;
    const hipY = getBone(rig, 'thigh_L').head.y;
    const L = layers[0];
    const corner = ax === 1 && zh !== 0 ? 0.82 : 1;
    const x = ax === 0 ? 0 : ax === 0.5 ? hipX : L.W * corner;
    const depth = zh > 0 ? L.Df : L.Db;
    const z = zh * depth * (ax === 0 ? 0.62 : corner);
    const y = MathUtils.lerp(hipY - 0.055 * k, hipY + 0.012 * k, Math.pow(ax, 1.2));
    return out.set(Math.sign(xh) * x, y, z);
  }
  if (j === NY && ax <= 0.5) {
    // neck base
    const neckY = getBone(rig, 'neck').head.y;
    const musc = ctx.params.build.muscularity - 0.4;
    const nw = (0.058 + 0.012 * musc) * k * MathUtils.lerp(1, ctx.params.build.limbThickness, 0.5);
    const nd = 0.054 * k;
    const corner = ax === 0.5 && zh !== 0 ? 0.8 : 1;
    return out.set(xh * 2 * nw * corner, neckY + 0.004 * k, zh * nd * corner - 0.006 * k);
  }
  return ringPoint(layers[j], xh, zh, out);
}

function torsoWeights(i: number, j: number, side: 'L' | 'R'): Float64Array {
  const ax = Math.abs(i / 2 - 1);
  const thigh = `thigh_${side}` as BoneName;
  const clav = `clavicle_${side}` as BoneName;
  const upper = `upperarm_${side}` as BoneName;
  switch (j) {
    case 0:
      if (ax === 0) return weightsOf([['pelvis', 0.7], ['thigh_L', 0.15], ['thigh_R', 0.15]]);
      return weightsOf([['pelvis', 0.62], [thigh, 0.38]]);
    case 1:
      return weightsOf([['pelvis', 0.9], [thigh, 0.1 * ax]]);
    case 2:
      return weightsOf([['pelvis', 0.45], ['spine', 0.55]]);
    case 3:
      return weightsOf([['spine', 0.8], ['chest', 0.2]]);
    case 4:
      if (ax === 1) return weightsOf([['chest', 0.55], ['spine', 0.15], [clav, 0.15], [upper, 0.15]]);
      return weightsOf([['chest', 0.7], ['spine', 0.3]]);
    case 5:
      if (ax === 1) return weightsOf([['chest', 0.35], [clav, 0.4], [upper, 0.25]]);
      if (ax === 0.5) return weightsOf([['chest', 0.8], [clav, 0.2]]);
      return weightsOf([['chest', 1]]);
    default:
      if (ax === 1) return weightsOf([[clav, 0.6], ['chest', 0.3], [upper, 0.1]]);
      if (ax === 0.5) return weightsOf([['chest', 0.6], ['neck', 0.25], [clav, 0.15]]);
      return weightsOf([['chest', 0.6], ['neck', 0.4]]);
  }
}

interface TorsoResult {
  faceAt: Map<string, number>;
  vertexAt: Map<string, number>;
  layers: TorsoLayer[];
}

function buildTorso(b: CageBuilder, ctx: BuildContext): TorsoResult {
  const layers = torsoLayers(ctx);
  const vertexAt = new Map<string, number>();
  for (let i = 0; i <= NX; i++)
    for (let j = 0; j <= NY; j++)
      for (let k = 0; k <= NZ; k++) {
        if (!(i === 0 || i === NX || j === 0 || j === NY || k === 0 || k === NZ)) continue;
        const side = i >= 2 ? 'L' : 'R';
        vertexAt.set(latticeKey(i, j, k), b.addVertex(torsoPosition(ctx, layers, i, j, k), torsoWeights(i, j, side)));
      }

  const N = [NX, NY, NZ];
  const faceAt = new Map<string, number>();
  for (let axis = 0; axis < 3; axis++) {
    const u = (axis + 1) % 3;
    const v = (axis + 2) % 3;
    for (const val of [0, N[axis]]) {
      const outward = val === 0 ? -1 : 1;
      for (let cu = 0; cu < N[u]; cu++)
        for (let cv = 0; cv < N[v]; cv++) {
          const corner = (du: number, dv: number) => {
            const c = [0, 0, 0];
            c[axis] = val;
            c[u] = cu + du;
            c[v] = cv + dv;
            return c;
          };
          // (e_u × e_v) points along +axis for this cyclic choice of u, v
          let quad = [corner(0, 0), corner(1, 0), corner(1, 1), corner(0, 1)];
          if (outward < 0) quad = quad.reverse();
          const verts = quad.map((c) => vertexAt.get(latticeKey(c[0], c[1], c[2]))!);
          const low = corner(0, 0);
          const cx = axis === 0 ? val : low[0] + 0.5;
          const cy = axis === 1 ? val : low[1] + 0.5;
          const xh = cx / 2 - 1;
          const info: CageFaceInfo = {
            part: 'torso',
            side: xh > 0 ? 'L' : 'R',
            s: axis === 1 ? (val === 0 ? 0 : 1) : cy / NY,
            lateral: Math.abs(xh),
          };
          const f = b.addFace(verts, info);
          faceAt.set(`${axis}|${val}|${low.join(',')}`, f);
        }
    }
  }
  return { faceAt, vertexAt, layers };
}

// ---------------------------------------------------------------------------
// Limb chains
// ---------------------------------------------------------------------------

function partAt(def: ChainDef, s: number): { part: PartId; local: number } {
  const n = def.parts.length;
  const seg = MathUtils.clamp(Math.floor(s), 0, n - 1);
  const part = def.parts[seg];
  const first = def.parts.indexOf(part);
  const count = def.parts.filter((p) => p === part).length;
  return { part, local: MathUtils.clamp((s - first) / count, 0, 1) };
}

function stationScale(ctx: BuildContext, def: ChainDef, st: Station): number {
  const b = ctx.params.build;
  const { part } = partAt(def, st.s);
  const scaleKey = def.partScale?.[part];
  const partScale = scaleKey ? ctx.params.proportions[scaleKey] : 1;
  const thickness = part === 'head' ? 1 : b.limbThickness;
  const inflate = 1 + 0.32 * (b.muscularity - 0.4) * (st.m ?? 0) + 0.45 * (b.bodyFat - 0.25) * (st.f ?? 0);
  return ctx.k * thickness * Math.max(0.6, inflate) * partScale;
}

function buildChain(b: CageBuilder, ctx: BuildContext, def: ChainDef, side: Side, patch: number[]) {
  const { rig } = ctx;
  const bones = def.bones(side).map((n) => BONE_INDEX[n]);
  const chain: Chain = { bones };
  const attach = BONE_INDEX[def.attachBone(side)];
  const mirror = side === 'R';

  // Angles of the attachment loop, measured in the frame of the first station.
  const X = new Vector3();
  const Z = new Vector3();
  const frameAxes = (s: number) => {
    const q = chainFrame(rig, chain, s);
    X.set(1, 0, 0).applyQuaternion(q);
    Z.set(0, 0, 1).applyQuaternion(q);
  };

  let prevS = 0;
  let angles: number[] = [];
  let slots = new Map<number, number>();
  let lastRing: number[] = [];
  let region = patch;
  // grid cap (only after a refine step): perimeter slots in walking order
  let grid = null as number[][] | null;
  let gridPerimeterSlots: number[] = [];
  const p = new Vector3();
  const center = new Vector3();

  // Drop stations that would sit too close to the previous ring (e.g. a very
  // short neck): tightly packed rings make the smooth surface bulge.
  const minGap = 0.026 * ctx.k;
  const stations: { st: Station; refine: boolean }[] = [];
  let refinePending = def.refineAt !== undefined;
  let prevCenter = chainPoint(rig, chain, 0);
  def.stations.forEach((st, i) => {
    const c = chainPoint(rig, chain, st.s);
    const wantsRefine = refinePending && i >= def.refineAt!;
    const isLast = i === def.stations.length - 1;
    if (stations.length > 0 && !isLast && !wantsRefine && c.distanceTo(prevCenter) < minGap) return;
    stations.push({ st, refine: wantsRefine });
    if (wantsRefine) refinePending = false;
    prevCenter = c;
  });

  stations.forEach(({ st, refine }, si) => {
    const refined = refine ? b.extrudeRefine(region) : null;
    const step = refined ?? b.extrude(region);
    const { loop, newLoop, sideFaces } = step;
    if (si === 0) {
      frameAxes(st.s);
      const c = new Vector3();
      for (const v of loop) c.add(b.position(v, p));
      c.divideScalar(loop.length);
      angles = loop.map((v) => {
        b.position(v, p).sub(c);
        return Math.atan2(p.dot(Z), p.dot(X));
      });
      slots = new Map(loop.map((v, i) => [v, i]));
    }
    const nextSlots = new Map<number, number>();
    if (refined) {
      // ring resolution doubles: new slots interleave the old angles
      const old = loop.map((v) => angles[slots.get(v)!]);
      const doubled: number[] = [];
      old.forEach((a, i) => {
        let d = old[(i + 1) % old.length] - a;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        doubled.push(a, a + d / 2);
      });
      angles = doubled;
      newLoop.forEach((v, k) => nextSlots.set(v, k));
      region = refined.region;
      grid = refined.grid;
      gridPerimeterSlots = newLoop.map((_, k) => k);
    } else {
      loop.forEach((v, i) => nextSlots.set(newLoop[i], slots.get(v)!));
    }
    slots = nextSlots;

    // ring placement
    const scale = stationScale(ctx, def, st);
    const rx = mirror ? [st.rx[1], st.rx[0]] : st.rx;
    const rz = st.rz;
    frameAxes(st.s);
    chainPoint(rig, chain, st.s, center).addScaledVector(Z, (st.offZ ?? 0) * scale);
    if (st.ground) center.y = rig.groundY + Z.y * rz[1] * scale;
    const w = chainWeights(bones, attach, st.s, ctx.blend);
    for (const v of newLoop) {
      const th = angles[slots.get(v)!];
      const c = Math.cos(th);
      const s = Math.sin(th);
      p.copy(center)
        .addScaledVector(X, c * (c > 0 ? rx[0] : rx[1]) * scale)
        .addScaledVector(Z, s * (s > 0 ? rz[0] : rz[1]) * scale);
      b.setPosition(v, p);
      b.setWeights(v, w);
    }

    const mid = partAt(def, (prevS + st.s) / 2);
    for (const f of sideFaces) b.info[f] = { part: mid.part, side, s: mid.local, lateral: 0 };
    prevS = st.s;
    lastRing = newLoop;
  });

  // ---- tip: the patch interior closes the limb -----------------------------
  const last = stations[stations.length - 1].st;
  const tipScale = stationScale(ctx, def, last);
  frameAxes(def.tipS);
  const tip = chainPoint(rig, chain, def.tipS, new Vector3());
  const off = def.tipOffset ?? {};
  tip.addScaledVector(X, (mirror ? -1 : 1) * (off.x ?? 0) * tipScale).addScaledVector(Z, (off.z ?? 0) * tipScale);
  if (off.ground !== undefined) tip.y = rig.groundY + off.ground * tipScale;
  const tipWeights = new Float64Array(BONE_COUNT);
  tipWeights[bones[bones.length - 1]] = 1;

  if (grid) {
    // Coons patch over the last ring, domed toward the tip.
    const bySlot = new Map<number, number>();
    for (const v of lastRing) bySlot.set(slots.get(v)!, v);
    const g = grid.length - 1;
    const P: Vector3[][] = Array.from({ length: g + 1 }, () => new Array<Vector3>(g + 1));
    let k = 0;
    const walk: [number, number][] = [];
    for (let c = 0; c < g; c++) walk.push([0, c]);
    for (let r = 0; r < g; r++) walk.push([r, g]);
    for (let c = g; c > 0; c--) walk.push([g, c]);
    for (let r = g; r > 0; r--) walk.push([r, 0]);
    const ringCenter = new Vector3();
    for (const [r, c] of walk) {
      P[r][c] = b.position(bySlot.get(gridPerimeterSlots[k++])!);
      ringCenter.add(P[r][c]);
    }
    ringCenter.divideScalar(walk.length);
    const lift = tip.clone().sub(ringCenter);
    for (let r = 1; r < g; r++)
      for (let c = 1; c < g; c++) {
        const u = c / g;
        const v = r / g;
        const q = new Vector3()
          .addScaledVector(P[0][c], 1 - v)
          .addScaledVector(P[g][c], v)
          .addScaledVector(P[r][0], 1 - u)
          .addScaledVector(P[r][g], u)
          .addScaledVector(P[0][0], -(1 - u) * (1 - v))
          .addScaledVector(P[0][g], -u * (1 - v))
          .addScaledVector(P[g][0], -(1 - u) * v)
          .addScaledVector(P[g][g], -u * v);
        const dome = Math.sqrt((1 - (2 * u - 1) ** 2) * (1 - (2 * v - 1) ** 2));
        q.addScaledVector(lift, dome);
        b.setPosition(grid[r][c], q);
        b.setWeights(grid[r][c], tipWeights);
      }
  } else {
    const ringSet = new Set(lastRing);
    for (const f of region) for (const v of b.faces[f]) if (!ringSet.has(v)) {
      b.setPosition(v, tip);
      b.setWeights(v, tipWeights);
    }
  }
  const tipPart = partAt(def, def.tipS - 1e-6);
  for (const f of region) b.info[f] = { part: tipPart.part, side, s: 1, lateral: 0 };
}

/**
 * Build the closed low-poly body cage for a rig.
 * `fit` (0..1) compensates subdivision shrinkage so the smooth surface
 * honours the authored cross-sections (1 = fully, 0 = raw cage).
 */
export function buildCage(rig: Rig, params: CharacterParams, fit = 0.85): Cage {
  const b = new CageBuilder();
  const ctx: BuildContext = {
    rig,
    params,
    k: rig.scale,
    blend: MathUtils.lerp(0.1, 0.36, params.joints.softness),
  };
  const torso = buildTorso(b, ctx);
  const faces = (keys: string[]) => keys.map((key) => {
    const f = torso.faceAt.get(key);
    if (f === undefined) throw new Error(`missing torso face ${key}`);
    return f;
  });

  // legs: bottom face (axis 1, y = 0), cells i ∈ [2,4) (left) / [0,2) (right)
  buildChain(b, ctx, LEG_CHAIN, 'L', faces(['1|0|2,0,0', '1|0|3,0,0', '1|0|2,0,1', '1|0|3,0,1']));
  buildChain(b, ctx, LEG_CHAIN, 'R', faces(['1|0|0,0,0', '1|0|1,0,0', '1|0|0,0,1', '1|0|1,0,1']));
  // arms: side faces (axis 0) rows j ∈ [4,6)
  buildChain(b, ctx, ARM_CHAIN, 'L', faces(['0|4|4,4,0', '0|4|4,5,0', '0|4|4,4,1', '0|4|4,5,1']));
  buildChain(b, ctx, ARM_CHAIN, 'R', faces(['0|0|0,4,0', '0|0|0,5,0', '0|0|0,4,1', '0|0|0,5,1']));
  // neck + head: top face, cells i ∈ [1,3)
  buildChain(b, ctx, NECK_CHAIN, 'C', faces(['1|6|1,6,0', '1|6|2,6,0', '1|6|1,6,1', '1|6|2,6,1']));

  return b.build(fit);
}
