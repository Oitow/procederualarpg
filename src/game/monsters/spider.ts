import { CylinderGeometry, Group, IcosahedronGeometry, Mesh, MeshBasicMaterial, Quaternion, SphereGeometry, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rng } from '../../character/rng';
import { flasher, paint, variantMaterials, type Height, type Monster } from './common';

const mats = variantMaterials(['#ffffff', '#d9c2b4', '#b9c6b2', '#c4b2d6', '#e0b0a0']);
const eyeMat = new MeshBasicMaterial({ color: '#ff3a22' });
// unit bone: base at origin, extends along +Y
const boneGeo = new CylinderGeometry(1, 0.55, 1, 4, 1).translate(0, 0.5, 0);
let bodyGeo: ReturnType<typeof mergeGeometries> | null = null;
let eyeGeo: ReturnType<typeof mergeGeometries> | null = null;

function geos() {
  bodyGeo ??= mergeGeometries([
    paint(new IcosahedronGeometry(1, 0).scale(0.5, 0.45, 0.7).translate(0, 0.05, -0.55), '#3a2c33'), // abdomen
    paint(new IcosahedronGeometry(1, 0).scale(0.22, 0.12, 0.3).translate(0, 0.42, -0.55), '#8a3a1c'), // marking
    paint(new IcosahedronGeometry(1, 0).scale(0.34, 0.28, 0.38).translate(0, 0, 0.18), '#4b3a42'), // thorax
    paint(new IcosahedronGeometry(1, 0).scale(0.18, 0.14, 0.14).translate(0, -0.04, 0.58), '#2e2328'), // fangs/head
  ])!;
  eyeGeo ??= mergeGeometries([
    new SphereGeometry(0.045, 5, 4).translate(0.09, 0.08, 0.7),
    new SphereGeometry(0.045, 5, 4).translate(-0.09, 0.08, 0.7),
  ])!;
  return { body: bodyGeo, eyes: eyeGeo };
}

interface Leg {
  hx: number; hz: number; // hip, body-local (unit size)
  rx: number; rz: number; // rest foot, body-local (unit size)
  group: 0 | 1;
  foot: Vector3;
  from: Vector3;
  stepping: boolean;
  t: number;
  upper: Mesh;
  lower: Mesh;
}

const _hip = new Vector3();
const _knee = new Vector3();
const _d = new Vector3();
const _p = new Vector3();
const _q = new Quaternion();
const _y = new Vector3(0, 1, 0);
const _to = new Vector3();

function bone(m: Mesh, a: Vector3, b: Vector3, origin: Vector3, r: number) {
  _d.subVectors(b, a);
  const len = _d.length() || 1e-4;
  m.position.subVectors(a, origin);
  m.quaternion.copy(_q.setFromUnitVectors(_y, _d.multiplyScalar(1 / len)));
  m.scale.set(r, len, r);
}

export function createSpider(seed: number): Monster {
  const rng = new Rng(seed);
  const size = 0.8 + rng.next() * 0.65;
  const legMul = 0.8 + rng.next() * 0.5;
  const g = geos();
  const root = new Group();
  const body = new Group();
  const bodyMesh = new Mesh(g.body, mats[Math.floor(rng.next() * mats.length)]);
  bodyMesh.castShadow = true;
  body.add(bodyMesh, new Mesh(g.eyes, eyeMat));
  body.scale.setScalar(size * 0.9);
  root.add(body);

  const L1 = 0.55 * size * legMul;
  const L2 = 0.8 * size * legMul;
  const stand = 0.5 * size * legMul;
  const legs: Leg[] = [];
  const hz = [0.32, 0.12, -0.08, -0.3];
  const rz = [0.75, 0.38, -0.12, -0.65];
  const rxo = [0.95, 1.15, 1.15, 0.95];
  for (let side = 0; side < 2; side++)
    for (let i = 0; i < 4; i++) {
      const s = side ? 1 : -1;
      const upper = new Mesh(boneGeo, mats[0]);
      const lower = new Mesh(boneGeo, mats[0]);
      upper.material = lower.material = bodyMesh.material;
      upper.frustumCulled = lower.frustumCulled = false;
      root.add(upper, lower);
      legs.push({
        hx: s * 0.2 * size, hz: hz[i] * size,
        rx: s * rxo[i] * size * legMul, rz: rz[i] * size * legMul,
        group: ((i + side) & 1) as 0 | 1,
        foot: new Vector3(), from: new Vector3(), stepping: false, t: 0, upper, lower,
      });
    }

  const flash = flasher(root);
  let init = false;
  let phase = 0;
  const m: Monster = {
    kind: 'spider', root, radius: 0.45 * size, size,
    hp: 24, maxHp: 24, damage: 7, speed: 2.1 + rng.next() * 0.7, attackInterval: 1.2,
    attackCd: 0.5, flashT: 0, dying: -1, heading: rng.next() * 6.28,
    setFlash: flash,
    update(dt, speed, heading, height: Height) {
      const pos = root.position;
      const c = Math.cos(heading), s = Math.sin(heading);
      body.rotation.y = heading;
      const off = (lx: number, lz: number, out: Vector3) => out.set(pos.x + lx * c + lz * s, 0, pos.z - lx * s + lz * c);
      if (!init) {
        init = true;
        for (const l of legs) {
          off(l.rx, l.rz, l.foot);
          l.foot.y = height(l.foot.x, l.foot.z);
        }
      }
      phase += dt * (3 + speed * 3.5);
      const thresh = 0.32 * size * legMul;
      const stepDur = Math.max(0.1, 0.2 - speed * 0.02);
      const busy = [false, false];
      for (const l of legs) if (l.stepping) busy[l.group] = true;
      let avgY = 0;
      for (const l of legs) {
        off(l.rx, l.rz, _to);
        _to.x += s * speed * 0.2; // lead the step in walking direction
        _to.z += c * speed * 0.2;
        _to.y = height(_to.x, _to.z);
        if (l.stepping) {
          l.t += dt / stepDur;
          if (l.t >= 1) {
            l.stepping = false;
            l.foot.copy(_to);
          } else {
            const e = l.t * l.t * (3 - 2 * l.t);
            l.foot.lerpVectors(l.from, _to, e);
            l.foot.y += Math.sin(l.t * Math.PI) * 0.22 * size;
          }
        } else if (!busy[1 - l.group]) {
          const dx = l.foot.x - _to.x + s * speed * 0.2, dz = l.foot.z - _to.z + c * speed * 0.2;
          if (Math.hypot(dx, dz) > thresh) {
            l.stepping = true;
            l.t = 0;
            l.from.copy(l.foot);
            busy[l.group] = true;
          }
        }
        avgY += l.foot.y;
      }
      avgY /= legs.length;
      const by = Math.max(avgY - pos.y, 0) + stand + Math.sin(phase * 2) * 0.03 * size * Math.min(1, speed);
      body.position.y = by;
      for (const l of legs) {
        off(l.hx, l.hz, _hip);
        _hip.y = pos.y + by;
        _d.subVectors(l.foot, _hip);
        const reach = L1 + L2;
        let dist = _d.length();
        dist = Math.min(Math.max(dist, Math.abs(L1 - L2) + 0.02), reach * 0.995);
        _d.normalize();
        const a = Math.acos(Math.min(1, Math.max(-1, (L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist))));
        _p.copy(_y).addScaledVector(_d, -_d.y).normalize(); // pole: knee bends upward
        _knee.copy(_hip).addScaledVector(_d, Math.cos(a) * L1).addScaledVector(_p, Math.sin(a) * L1);
        bone(l.upper, _hip, _knee, pos, 0.045 * size);
        _to.copy(_hip).addScaledVector(_d, dist);
        bone(l.lower, _knee, _to, pos, 0.032 * size);
      }
    },
  };
  return m;
}
