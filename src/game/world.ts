import {
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Vector3,
  BoxGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rng, createNoise3D, fbm } from '../character/rng';

/**
 * Procedural, endless world built from chunks around the player.
 * Everything is derived from the seed: terrain height, biome colours, props.
 */

export const PALETTE = {
  fog: '#0b141b',
  water: '#0e2433',
  grassDeep: '#17301f',
  grass: '#223f29',
  moss: '#2f4a2c',
  mud: '#33302a',
  shore: '#3a3a30',
  stone: '#474d52',
  stoneDark: '#2d3237',
  bark: '#2b2119',
  pine: '#1b3423',
  pineLight: '#264530',
  deadwood: '#3a3029',
};

export const WATER_LEVEL = -1.1;
export const CHUNK_SIZE = 24;

export interface Terrain {
  seed: number;
  height(x: number, z: number): number;
  moisture(x: number, z: number): number;
  isWalkable(x: number, z: number): boolean;
}

export function createTerrain(seed: number): Terrain {
  const n = createNoise3D(seed);
  const m = createNoise3D(seed + 101);
  const height = (x: number, z: number) =>
    fbm(n, x * 0.018, 0.5, z * 0.018, 4) * 7 + fbm(n, x * 0.09, 3.7, z * 0.09, 2) * 0.6;
  const moisture = (x: number, z: number) => fbm(m, x * 0.012, 0, z * 0.012, 3);
  return {
    seed,
    height,
    moisture,
    isWalkable: (x, z) => height(x, z) > WATER_LEVEL + 0.12,
  };
}

// ---------------------------------------------------------------------------
// terrain chunk mesh (faceted low-poly look)
// ---------------------------------------------------------------------------

const C = Object.fromEntries(Object.entries(PALETTE).map(([k, v]) => [k, new Color(v)])) as Record<keyof typeof PALETTE, Color>;
const tmp = new Color();

function groundColor(t: Terrain, x: number, z: number, h: number, slope: number, out: Color): Color {
  const wet = t.moisture(x, z);
  if (h < WATER_LEVEL + 0.25) return out.copy(C.shore).lerp(C.mud, 0.4);
  if (slope > 0.55 || h > 4.2) return out.copy(C.stoneDark).lerp(C.stone, Math.min(1, (h - 2) / 4));
  out.copy(C.grass).lerp(C.grassDeep, Math.min(1, Math.max(0, wet * 2 + 0.5)));
  if (wet < -0.18) out.lerp(C.mud, 0.55);
  else if (wet > 0.15) out.lerp(C.moss, 0.35);
  return out;
}

const terrainMaterial = new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 });

function buildTerrainMesh(t: Terrain, cx: number, cz: number): Mesh {
  const N = CHUNK_SIZE;
  const x0 = cx * N;
  const z0 = cz * N;
  const rng = new Rng((cx * 73856093) ^ (cz * 19349663) ^ t.seed);
  const pos: number[] = [];
  const col: number[] = [];
  const hAt = (i: number, j: number) => t.height(x0 + i, z0 + j);
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const p = [
        [i, j, hAt(i, j)],
        [i + 1, j, hAt(i + 1, j)],
        [i + 1, j + 1, hAt(i + 1, j + 1)],
        [i, j + 1, hAt(i, j + 1)],
      ];
      const tris = (i + j) % 2 === 0 ? [[0, 3, 2], [0, 2, 1]] : [[0, 3, 1], [1, 3, 2]];
      for (const tri of tris) {
        const a = p[tri[0]], b = p[tri[1]], c = p[tri[2]];
        const hMid = (a[2] + b[2] + c[2]) / 3;
        const slope = Math.max(Math.abs(a[2] - b[2]), Math.abs(b[2] - c[2]), Math.abs(a[2] - c[2]));
        groundColor(t, x0 + i + 0.5, z0 + j + 0.5, hMid, slope, tmp);
        const jitter = 0.92 + rng.next() * 0.14;
        for (const v of [a, b, c]) {
          pos.push(x0 + v[0], v[2], z0 + v[1]);
          col.push(tmp.r * jitter, tmp.g * jitter, tmp.b * jitter);
        }
      }
    }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  const mesh = new Mesh(g, terrainMaterial);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return mesh;
}

// ---------------------------------------------------------------------------
// props: geometry built once, placed per chunk with InstancedMesh
// ---------------------------------------------------------------------------

function painted(g: BufferGeometry, color: string): BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g;
  const c = new Color(color);
  const n = geo.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.toArray(arr, i * 3);
  geo.setAttribute('color', new Float32BufferAttribute(arr, 3));
  geo.deleteAttribute('uv');
  return geo;
}

function pineGeometry(): BufferGeometry {
  const parts = [painted(new CylinderGeometry(0.12, 0.2, 1.4, 5).translate(0, 0.7, 0), PALETTE.bark)];
  [[1.5, 2.2, 1.0], [1.15, 1.8, 2.0], [0.8, 1.4, 2.9]].forEach(([r, h, y], i) =>
    parts.push(painted(new ConeGeometry(r, h, 6).translate(0, y + h / 2 - 0.4, 0), i % 2 ? PALETTE.pineLight : PALETTE.pine)),
  );
  return mergeGeometries(parts)!;
}

function deadTreeGeometry(): BufferGeometry {
  const trunk = painted(new CylinderGeometry(0.08, 0.2, 2.6, 5).translate(0, 1.3, 0), PALETTE.deadwood);
  const b1 = painted(new CylinderGeometry(0.03, 0.07, 1.1, 4).translate(0, 0.55, 0).rotateZ(0.9).translate(0.05, 1.7, 0), PALETTE.deadwood);
  const b2 = painted(new CylinderGeometry(0.03, 0.06, 0.9, 4).translate(0, 0.45, 0).rotateZ(-0.8).rotateY(1.3).translate(0, 2.1, 0), PALETTE.deadwood);
  return mergeGeometries([trunk, b1, b2])!;
}

function rockGeometry(): BufferGeometry {
  const g = new DodecahedronGeometry(0.6, 0);
  const p = g.getAttribute('position');
  const r = new Rng(7);
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (0.8 + r.next() * 0.4), p.getY(i) * (0.55 + r.next() * 0.3), p.getZ(i) * (0.8 + r.next() * 0.4));
  return painted(g.translate(0, 0.2, 0), PALETTE.stone);
}

function grassGeometry(): BufferGeometry {
  const blades = [0, 1, 2].map((i) =>
    painted(new ConeGeometry(0.05, 0.45, 3).translate(0, 0.22, 0).rotateZ((i - 1) * 0.35).rotateY(i * 2.1), i === 1 ? PALETTE.moss : PALETTE.grass),
  );
  return mergeGeometries(blades)!;
}

function pillarGeometry(): BufferGeometry {
  return mergeGeometries([
    painted(new BoxGeometry(0.9, 0.25, 0.9).translate(0, 0.12, 0), PALETTE.stoneDark),
    painted(new CylinderGeometry(0.32, 0.36, 2.4, 7).translate(0, 1.45, 0), PALETTE.stone),
    painted(new BoxGeometry(0.8, 0.2, 0.8).translate(0, 2.7, 0), PALETTE.stoneDark),
  ])!;
}

const propMaterial = new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 });

interface PropKind {
  geometry: BufferGeometry;
  shadow: boolean;
}
let KINDS: Record<'pine' | 'dead' | 'rock' | 'grass' | 'pillar', PropKind> | null = null;
function kinds() {
  KINDS ??= {
    pine: { geometry: pineGeometry(), shadow: true },
    dead: { geometry: deadTreeGeometry(), shadow: true },
    rock: { geometry: rockGeometry(), shadow: true },
    grass: { geometry: grassGeometry(), shadow: false },
    pillar: { geometry: pillarGeometry(), shadow: true },
  };
  return KINDS;
}

interface Placement {
  kind: keyof NonNullable<typeof KINDS>;
  x: number;
  z: number;
  scale: number;
  rotY: number;
  tilt?: number;
}

function placeProps(t: Terrain, cx: number, cz: number): Placement[] {
  const rng = new Rng((cx * 92837111) ^ (cz * 689287499) ^ (t.seed * 31));
  const out: Placement[] = [];
  const x0 = cx * CHUNK_SIZE;
  const z0 = cz * CHUNK_SIZE;
  const spot = () => [x0 + rng.next() * CHUNK_SIZE, z0 + rng.next() * CHUNK_SIZE] as const;
  const land = (x: number, z: number) => t.height(x, z) > WATER_LEVEL + 0.35;

  for (let i = 0; i < 70; i++) {
    const [x, z] = spot();
    if (!land(x, z)) continue;
    const wet = t.moisture(x, z);
    const forest = 0.25 + wet * 1.6;
    if (rng.next() > forest) continue;
    const dead = wet < -0.1 && rng.next() < 0.5;
    out.push({ kind: dead ? 'dead' : 'pine', x, z, scale: 0.75 + rng.next() * 0.7, rotY: rng.next() * 6.28 });
  }
  for (let i = 0; i < 14; i++) {
    const [x, z] = spot();
    if (t.height(x, z) < WATER_LEVEL - 0.5) continue;
    out.push({ kind: 'rock', x, z, scale: 0.4 + rng.next() * 1.4, rotY: rng.next() * 6.28 });
  }
  for (let i = 0; i < 160; i++) {
    const [x, z] = spot();
    if (!land(x, z) || t.moisture(x, z) < -0.2) continue;
    out.push({ kind: 'grass', x, z, scale: 0.7 + rng.next() * 0.8, rotY: rng.next() * 6.28 });
  }
  // occasional ruin: a ring of broken pillars
  if (rng.next() < 0.22) {
    const [rx, rz] = spot();
    const count = 4 + Math.floor(rng.next() * 4);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const x = rx + Math.cos(a) * 3.2;
      const z = rz + Math.sin(a) * 3.2;
      if (!land(x, z) || rng.next() < 0.2) continue;
      out.push({ kind: 'pillar', x, z, scale: 0.6 + rng.next() * 0.5, rotY: rng.next() * 6.28, tilt: (rng.next() - 0.5) * 0.25 });
    }
  }
  return out;
}

export interface Collider {
  x: number;
  z: number;
  r: number;
}
const COLLIDER_R: Partial<Record<Placement['kind'], number>> = { pine: 0.35, dead: 0.35, rock: 0.55, pillar: 0.45 };

function buildProps(t: Terrain, cx: number, cz: number): { group: Group; colliders: Collider[] } {
  const group = new Group();
  const all = placeProps(t, cx, cz);
  const colliders: Collider[] = [];
  for (const p of all) {
    const r = COLLIDER_R[p.kind];
    if (r) colliders.push({ x: p.x, z: p.z, r: r * p.scale });
  }
  const rng = new Rng(cx * 31 + cz * 17 + t.seed);
  const m = new Matrix4();
  const e = new Object3D();
  const base = new Color();
  for (const [kind, def] of Object.entries(kinds()) as [keyof ReturnType<typeof kinds>, PropKind][]) {
    const list = all.filter((p) => p.kind === kind);
    if (!list.length) continue;
    const inst = new InstancedMesh(def.geometry, propMaterial, list.length);
    list.forEach((p, i) => {
      e.position.set(p.x, t.height(p.x, p.z) - 0.05, p.z);
      e.rotation.set(p.tilt ?? 0, p.rotY, (p.tilt ?? 0) * 0.5);
      e.scale.setScalar(p.scale);
      e.updateMatrix();
      m.copy(e.matrix);
      inst.setMatrixAt(i, m);
      const v = 0.8 + rng.next() * 0.35;
      inst.setColorAt(i, base.setRGB(v, v, v));
    });
    inst.castShadow = def.shadow;
    inst.receiveShadow = true;
    inst.computeBoundingSphere();
    group.add(inst);
  }
  return { group, colliders };
}

// ---------------------------------------------------------------------------
// chunk streaming
// ---------------------------------------------------------------------------

export class World {
  readonly group = new Group();
  readonly terrainMeshes: Mesh[] = [];
  private chunks = new Map<string, { terrain: Mesh; props: Group; colliders: Collider[] }>();
  readonly water: Mesh;

  constructor(readonly terrain: Terrain, private radius = 2) {
    this.water = new Mesh(
      new PlaneGeometry(CHUNK_SIZE * (radius * 2 + 3), CHUNK_SIZE * (radius * 2 + 3)).rotateX(-Math.PI / 2),
      new MeshStandardMaterial({ color: PALETTE.water, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.88 }),
    );
    this.water.position.y = WATER_LEVEL;
    this.water.receiveShadow = true;
    this.group.add(this.water);
  }

  /** Stream chunks around a position. Builds at most `budget` chunks per call. */
  update(pos: Vector3, budget = 2) {
    const pcx = Math.floor(pos.x / CHUNK_SIZE);
    const pcz = Math.floor(pos.z / CHUNK_SIZE);
    this.water.position.x = pos.x;
    this.water.position.z = pos.z;
    const wanted = new Set<string>();
    const todo: [number, number, number][] = [];
    for (let dz = -this.radius; dz <= this.radius; dz++)
      for (let dx = -this.radius; dx <= this.radius; dx++) {
        const key = `${pcx + dx},${pcz + dz}`;
        wanted.add(key);
        if (!this.chunks.has(key)) todo.push([pcx + dx, pcz + dz, dx * dx + dz * dz]);
      }
    todo.sort((a, b) => a[2] - b[2]);
    for (const [cx, cz] of todo.slice(0, budget)) {
      const terrain = buildTerrainMesh(this.terrain, cx, cz);
      const { group: props, colliders } = buildProps(this.terrain, cx, cz);
      this.group.add(terrain, props);
      this.terrainMeshes.push(terrain);
      this.chunks.set(`${cx},${cz}`, { terrain, props, colliders });
    }
    for (const [key, c] of this.chunks) {
      if (wanted.has(key)) continue;
      this.group.remove(c.terrain, c.props);
      c.terrain.geometry.dispose();
      c.props.children.forEach((o) => (o as InstancedMesh).dispose());
      this.terrainMeshes.splice(this.terrainMeshes.indexOf(c.terrain), 1);
      this.chunks.delete(key);
    }
  }

  /** Push a circle (x,z,r) out of nearby prop colliders. Returns the corrected position. */
  resolve(x: number, z: number, r: number, out = { x: 0, z: 0, hit: false }) {
    out.hit = false;
    const pcx = Math.floor(x / CHUNK_SIZE);
    const pcz = Math.floor(z / CHUNK_SIZE);
    for (let iter = 0; iter < 2; iter++)
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          const c = this.chunks.get(`${pcx + dx},${pcz + dz}`);
          if (!c) continue;
          for (const o of c.colliders) {
            const ox = x - o.x;
            const oz = z - o.z;
            const min = r + o.r;
            const d2 = ox * ox + oz * oz;
            if (d2 >= min * min) continue;
            const d = Math.sqrt(d2) || 1e-4;
            const k = (min - d) / d;
            x += (d2 === 0 ? 1e-4 : ox) * k;
            z += (d2 === 0 ? 0 : oz) * k;
            out.hit = true;
          }
        }
    out.x = x;
    out.z = z;
    return out;
  }

  /** Find walkable ground near a point (spiral search). */
  findSpawn(x = 0, z = 0): Vector3 {
    for (let r = 0; r < 200; r += 2)
      for (let a = 0; a < 16; a++) {
        const px = x + Math.cos(a) * r;
        const pz = z + Math.sin(a) * r;
        if (this.terrain.height(px, pz) > WATER_LEVEL + 0.8) return new Vector3(px, this.terrain.height(px, pz), pz);
      }
    return new Vector3(x, this.terrain.height(x, z), z);
  }
}

/** Procedural region name from the seed. */
export function regionName(seed: number): string {
  const r = new Rng(seed * 13 + 5);
  const pick = (a: string[]) => a[Math.floor(r.next() * a.length)];
  return pick(['Ash', 'Grim', 'Mire', 'Hollow', 'Black', 'Dusk', 'Fen', 'Raven', 'Gloom', 'Thorn']) + pick(['vale', 'moor', 'wood', 'reach', 'hollow', 'fen', 'marsh', 'weald']);
}
