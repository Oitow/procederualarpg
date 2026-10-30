import { BufferGeometry, Color, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, type Material } from 'three';

export type Height = (x: number, z: number) => number;

export interface Monster {
  kind: 'spider' | 'rat';
  root: Group;
  radius: number;
  size: number;
  hp: number;
  maxHp: number;
  damage: number;
  speed: number;
  attackInterval: number;
  attackCd: number;
  flashT: number;
  /** <0 alive, otherwise seconds since death */
  dying: number;
  heading: number;
  /** Advance procedural animation. root.position must already be set (xz + terrain y). */
  update(dt: number, speed: number, heading: number, height: Height): void;
  setFlash(on: boolean): void;
}

/** Bake a flat colour into vertex colours (non-indexed so faces stay flat). */
export function paint(g: BufferGeometry, color: string): BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g;
  const c = new Color(color);
  const n = geo.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.toArray(arr, i * 3);
  geo.setAttribute('color', new Float32BufferAttribute(arr, 3));
  geo.deleteAttribute('uv');
  return geo;
}

export function variantMaterials(tints: string[]): MeshStandardMaterial[] {
  return tints.map((t) => new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85, color: t }));
}

export const flashMaterial = new MeshBasicMaterial({ color: '#ffd8c8' });

/** Tracks meshes of a monster so hit-flash can swap in the shared flash material. */
export function flasher(root: Group) {
  const meshes: Mesh[] = [];
  const orig: Material[] = [];
  root.traverse((o) => {
    const m = o as Mesh;
    if (m.isMesh) {
      meshes.push(m);
      orig.push(m.material as Material);
    }
  });
  let on = false;
  return (v: boolean) => {
    if (v === on) return;
    on = v;
    meshes.forEach((m, i) => (m.material = v ? flashMaterial : orig[i]));
  };
}
