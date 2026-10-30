import {
  CanvasTexture, Sprite, SpriteMaterial,
  AdditiveBlending, BoxGeometry, BufferAttribute, BufferGeometry, Color, ConeGeometry, CylinderGeometry,   Group, IcosahedronGeometry, Matrix4, Mesh, MeshStandardMaterial, OctahedronGeometry, Points, PointsMaterial,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Quaternion, Vector3 } from 'three';
import { Rng } from '../character/rng';
import type { Item } from './types';

type Part = BufferGeometry;
const place = (g: Part, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, rz = 0, ry = 0): Part => {
  // scale first, then rotate (Z then Y), then translate
  const r = new Matrix4().makeRotationY(ry).multiply(new Matrix4().makeRotationZ(rz));
  g.applyMatrix4(new Matrix4().makeTranslation(x, y, z).multiply(r).multiply(new Matrix4().makeScale(sx, sy, sz)));
  return g;
};
const finish = (parts: Part[]): BufferGeometry => {
  const g = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)))!;
  g.computeVertexNormals();
  return g;
};
/** 4-sided tapered blade, edges toward ±X. y from y0 to y0+len, tip cone included. */
const blade = (y0: number, len: number, w: number, t: number, tipFrac = 0.18): Part[] => {
  const body = len * (1 - tipFrac);
  const b = place(new CylinderGeometry(w * 0.7, w, body, 4, 1), 0, y0 + body / 2, 0, 1, 1, t / w);
  const tip = place(new ConeGeometry(w * 0.7, len * tipFrac, 4, 1), 0, y0 + body + (len * tipFrac) / 2, 0, 1, 1, t / (w * 0.7));
  return [b, tip];
};

/** Blade bent along +X (scimitar / kris): segmented tapered prisms following an arc. */
const curvedBlade = (y0: number, len: number, w: number, t: number, curve: number, segs = 6): Part[] => {
  const out: Part[] = [];
  const sl = len / segs;
  let x = 0;
  let y = y0;
  for (let i = 0; i < segs; i++) {
    const th = curve * ((i + 0.5) / segs);
    const w0 = w * (1 - 0.85 * (i / segs) ** 1.6);
    const w1 = w * (1 - 0.85 * ((i + 1) / segs) ** 1.6);
    const seg = new CylinderGeometry(Math.max(w1, 0.004), w0, sl * 1.04, 4, 1);
    out.push(place(seg, x + Math.sin(th) * sl * 0.5, y + Math.cos(th) * sl * 0.5, 0, 1, 1, t / w0, -th));
    x += Math.sin(th) * sl;
    y += Math.cos(th) * sl;
  }
  return out;
};
/** Cone pointing along `dir` from `pos`. */
const spikeAt = (pos: Vector3, dir: Vector3, len: number, rad: number): Part => {
  const g = new ConeGeometry(rad, len, 4, 1);
  g.translate(0, len / 2, 0);
  g.applyMatrix4(new Matrix4().compose(pos, new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir.clone().normalize()), new Vector3(1, 1, 1)));
  return g;
};

interface Look { color: Color; metalness: number; roughness: number; emissive: Color | null; intensity: number; hilt: Color; particle: Color | null }

function look(item: Item): Look {
  const th = item.theme ?? { material: 'steel' as const };
  const L: Look = { color: new Color('#b9c1cb'), metalness: 0.92, roughness: 0.3, emissive: null, intensity: 0, hilt: new Color('#4a3524'), particle: null };
  if (th.material === 'iron') L.color.set('#8a929b');
  if (th.material === 'gold') { L.color.set('#f0c040'); L.metalness = 1; L.roughness = 0.2; L.hilt.set('#c99a2a'); }
  if (th.element === 'fire') { L.emissive = new Color('#ff6a18'); L.intensity = 0.9; L.particle = new Color('#ff8a2a'); }
  if (th.element === 'frost') { L.color.set('#bfe6ff'); L.emissive = new Color('#4aa8ff'); L.intensity = 0.5; L.particle = new Color('#aee0ff'); }
  if (th.element === 'shadow') { L.color.set('#2a2538'); L.emissive = new Color('#6a3cff'); L.intensity = 0.6; L.particle = new Color('#8a5cff'); }
  if (th.element === 'hell') { L.color.set('#1a0a0a'); L.metalness = 0.6; L.emissive = new Color('#ff1208'); L.intensity = 1.6; L.particle = new Color('#ff2a10'); L.hilt.set('#220808'); }
  if (th.material === 'gold' && !th.element) { L.emissive = new Color('#ffcc44'); L.intensity = 0.4; }
  if (th.glow) {
    if (th.material === 'gold') L.emissive = th.element === 'fire' ? new Color('#ffb030') : th.element === 'hell' ? new Color('#ff6030') : new Color('#ffd25a');
    L.intensity = 0.8 + th.glow * 1.4; // divine: > 1.5 for bloom
    L.particle = L.particle ?? new Color('#ffe9a0');
  }
  if (item.dye) L.hilt.set(item.dye);
  if (th.broken) { L.color.set('#6b4a35'); L.metalness = 0.4; L.roughness = 0.95; L.emissive = null; L.intensity = 0; L.particle = null; L.hilt.set('#3a2a1e'); }
  return L;
}

export function buildWeaponMesh(item: Item): Group {
  const rng = new Rng(item.seed ^ 0x7ea90f);
  const th = item.theme;
  const broken = !!th?.broken;
  const lk = look(item);
  const hilt: Part[] = [];
  const head: Part[] = [];
  let tipY = 0.9;
  let start = 0.1;
  const type = item.baseType;

  const grip = (len: number) => hilt.push(place(new CylinderGeometry(0.018, 0.02, len, 6, 1), 0, 0, 0));
  if (type === 'Axe' || type === 'Mace') {
    const len = 0.95 + rng.range(-0.05, 0.1);
    hilt.push(place(new CylinderGeometry(0.02, 0.024, len, 6, 1), 0, len / 2 - 0.3, 0));
    hilt.push(place(new OctahedronGeometry(0.03, 0), 0, -0.3, 0, 1, 1.4, 1));
    const top = len - 0.3;
    if (type === 'Axe') {
      const bl = rng.range(0.12, 0.2) * (broken ? 0.6 : 1);
      const h = rng.range(0.18, 0.28);
      const bit = (dir: number) =>
        place(new CylinderGeometry(h / 2, 0.02, bl, 4, 1), dir * (0.02 + bl / 2), top - h * 0.35, 0, 1, 1, 0.1 / (h / 2), -dir * Math.PI / 2);
      head.push(bit(1));
      const ax = Math.floor(rng.next() * 3);
      if (ax === 0 && !broken) head.push(bit(-1)); // double bit
      else head.push(place(new ConeGeometry(0.03, 0.14, 4, 1), 0, top + 0.07, 0));
      if (ax === 1 && !broken) { // bearded axe: hooked lower edge
        head.push(place(new CylinderGeometry(h * 0.3, 0.02, bl * 0.8, 4, 1), (0.02 + bl * 0.4), top - h * 0.95, 0, 1, 1, 0.1 / (h * 0.3), -Math.PI / 2));
        head.push(place(new ConeGeometry(0.025, 0.1, 4, 1), bl * 0.75, top - h * 1.2, 0, 1, 1, 1, Math.PI));
      }
      if (ax === 2) hilt.push(place(new ConeGeometry(0.022, 0.09, 6, 1), 0, -0.36, 0, 1, 1, 1, Math.PI)); // butt spike
      tipY = top + 0.14;
      start = top - h;
    } else {
      const r = rng.range(0.07, 0.1) * (broken ? 0.8 : 1);
      const mk = Math.floor(rng.next() * 3);
      const c = new Vector3(0, top + r * 0.6, 0);
      if (mk === 1) { // morning star: ball with spikes on every icosahedron vertex
        head.push(place(new IcosahedronGeometry(r, 1), 0, c.y, 0));
        const ico = new IcosahedronGeometry(1, 0).getAttribute('position');
        for (let i = 0; i < ico.count; i += 3) {
          if (broken && i % 9 === 0) continue;
          const d = new Vector3(ico.getX(i), ico.getY(i), ico.getZ(i));
          head.push(spikeAt(c.clone().addScaledVector(d.clone().normalize(), r * 0.85), d, r * 0.8, r * 0.28));
        }
      } else if (mk === 2) { // flanged column with collar and top spike
        head.push(place(new CylinderGeometry(r * 0.55, r * 0.7, r * 2.1, 8, 1), 0, c.y, 0));
        head.push(place(new CylinderGeometry(r * 0.85, r * 0.85, 0.02, 8, 1), 0, c.y - r * 1.1, 0));
        const n = 4 + (rng.next() < 0.5 ? 2 : 0);
        for (let i = 0; i < n; i++) {
          if (broken && i % 3 === 0) continue;
          const a = (i / n) * Math.PI * 2;
          head.push(place(new BoxGeometry(r * 1.0, r * 1.8, 0.014), Math.cos(a) * r * 0.9, c.y, Math.sin(a) * r * 0.9, 1, 1, 1, 0, -a));
        }
        head.push(spikeAt(new Vector3(0, c.y + r * 1.0, 0), new Vector3(0, 1, 0), r * 1.1, r * 0.35));
      } else {
        head.push(place(new IcosahedronGeometry(r, 0), 0, c.y, 0));
        const n = 6 + Math.floor(rng.next() * 3);
        for (let i = 0; i < n; i++) {
          if (broken && i % 3 === 0) continue;
          const a = (i / n) * Math.PI * 2;
          head.push(place(new BoxGeometry(0.1, 0.12, 0.012), Math.cos(a) * r * 0.9, c.y, Math.sin(a) * r * 0.9, 1, 1, 1, 0, -a));
        }
      }
      tipY = top + r * 1.6;
      start = top - r;
    }
  } else {
    const dagger = type === 'Dagger';
    grip(dagger ? 0.12 : 0.22);
    const gh = dagger ? 0.06 : 0.11;
    hilt.push(place(new OctahedronGeometry(dagger ? 0.03 : 0.04, 0), 0, -gh - 0.02, 0, 1, 1.2, 1));
    const gw = rng.range(0.1, 0.2) * (dagger ? 0.7 : 1);
    const style = Math.floor(rng.next() * 3);
    hilt.push(place(new BoxGeometry(gw * 2, 0.025, 0.04), 0, gh + 0.012, 0));
    if (style === 1) for (const s of [-1, 1]) hilt.push(place(new ConeGeometry(0.02, 0.07, 4, 1), s * gw, gh + 0.045, 0));
    if (style === 2) for (const s of [-1, 1]) hilt.push(place(new BoxGeometry(0.03, 0.06, 0.035), s * gw, gh - 0.02, 0));
    const len = (dagger ? 0.32 : rng.range(0.68, 0.85)) * (broken ? 0.55 : 1);
    const w = (dagger ? 0.028 : rng.range(0.032, 0.055)) * (rng.next() < 0.3 ? 1.4 : 1);
    const bs = broken ? 0 : Math.floor(rng.next() * 4);
    const y0 = gh + 0.025;
    if (dagger) {
      if (bs === 1) head.push(...curvedBlade(y0, len, w * 1.1, 0.012, 0.7, 4)); // kris-like curve
      else if (bs === 2) head.push(...blade(y0, len, w * 1.5, 0.014, 0.45)); // leaf blade
      else head.push(...blade(y0, len, w, 0.012, 0.18));
    } else if (bs === 1) head.push(...curvedBlade(y0, len, w * 1.15, 0.012, 0.55)); // scimitar
    else if (bs === 2) { // serrated back edge
      head.push(...blade(y0, len, w, 0.012, 0.15));
      for (let i = 1; i < 7; i++) head.push(place(new ConeGeometry(0.012, 0.035, 3, 1), -w * (1 - (i / 8) * 0.3) , y0 + (len * 0.85 * i) / 7, 0, 1, 1, 1, Math.PI / 2));
    } else if (bs === 3) { // broadsword with fuller
      head.push(...blade(y0, len, w * 1.5, 0.014, 0.22));
      head.push(place(new BoxGeometry(w * 0.35, len * 0.7, 0.02), 0, y0 + len * 0.4, 0));
    } else head.push(...blade(y0, len, w, 0.012, broken ? 0.05 : 0.18));
    if (broken) head.push(place(new BoxGeometry(w * 0.7, 0.04, 0.012), w * 0.35, gh + 0.025 + len + 0.01, 0, 1, 1, 1, 0.5));
    start = gh + 0.025;
    tipY = start + len;
  }

  const group = new Group();
  const hm = new MeshStandardMaterial({ color: lk.hilt, metalness: th?.material === 'gold' ? 1 : 0.3, roughness: 0.6, flatShading: true });
  const bm = new MeshStandardMaterial({ color: lk.color, metalness: lk.metalness, roughness: lk.roughness, flatShading: true });
  if (lk.emissive) { bm.emissive = lk.emissive; bm.emissiveIntensity = lk.intensity; }
  if (th?.glow && th.material === 'gold') { hm.emissive = new Color('#ffcc44'); hm.emissiveIntensity = lk.intensity * 0.6; }
  group.add(new Mesh(finish(hilt), hm), new Mesh(finish(head), bm));

  if (lk.particle) {
    const N = th?.glow && !th.element ? 24 : 50;
    const pos = new Float32Array(N * 3);
    const ages = new Float32Array(N);
    const vel = new Float32Array(N);
    const jit = new Float32Array(N * 2);
    const pr = new Rng(item.seed ^ 0x9a1);
    const reset = (i: number, fresh: boolean) => {
      const along = start + pr.next() * (tipY - start);
      pos[i * 3] = (pr.next() - 0.5) * 0.05;
      pos[i * 3 + 1] = along;
      pos[i * 3 + 2] = (pr.next() - 0.5) * 0.04;
      ages[i] = fresh ? pr.next() : 0;
      vel[i] = 0.18 + pr.next() * 0.3;
      jit[i * 2] = pr.next() * 6;
      jit[i * 2 + 1] = pr.next() - 0.5;
    };
    for (let i = 0; i < N; i++) reset(i, true);
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    const mat = new PointsMaterial({ color: lk.particle, size: 0.035, transparent: true, opacity: 0.85, blending: AdditiveBlending, depthWrite: false });
    const pts = new Points(geo, mat);
    pts.frustumCulled = false;
    group.add(pts);
    let t = 0;
    group.userData.update = (dt: number) => {
      t += dt;
      for (let i = 0; i < N; i++) {
        ages[i] += dt * 1.2;
        if (ages[i] >= 1) reset(i, false);
        pos[i * 3 + 1] += vel[i] * dt;
        pos[i * 3] += Math.sin(t * 5 + jit[i * 2]) * 0.02 * dt * 6;
      }
      geo.attributes.position.needsUpdate = true;
      mat.opacity = 0.65 + 0.25 * Math.sin(t * 17);
    };
  } else {
    group.userData.update = () => {};
  }
  addHalo(group, lk.emissive, (start + tipY) / 2, tipY - start, lk.intensity);
  return group;
}

/** Soft additive glow around emissive blades (cheap stand-in for bloom). */
let haloTexture: CanvasTexture | null = null;
function addHalo(group: Group, color: Color | null | undefined, centerY: number, length: number, intensity: number) {
  if (!color || typeof document === 'undefined') return;
  if (!haloTexture) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    haloTexture = new CanvasTexture(c);
  }
  const strength = Math.min(1, 0.35 + intensity * 0.25);
  const mat = new SpriteMaterial({ map: haloTexture, color, transparent: true, opacity: strength, blending: AdditiveBlending, depthWrite: false });
  const halo = new Sprite(mat);
  halo.position.y = centerY;
  halo.scale.set(0.45 + length * 0.35, length + 0.35, 1);
  group.add(halo);
  const inner = group.userData.update as ((dt: number) => void) | undefined;
  let t = 0;
  group.userData.update = (dt: number) => {
    inner?.(dt);
    t += dt;
    mat.opacity = strength * (0.85 + Math.sin(t * 5.3) * 0.1 + Math.sin(t * 13.1) * 0.05);
  };
}
