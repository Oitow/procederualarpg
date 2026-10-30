import { BoxGeometry, ConeGeometry, CylinderGeometry, Group, IcosahedronGeometry, Mesh } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rng } from '../../character/rng';
import { flasher, paint, variantMaterials, type Monster } from './common';

const mats = variantMaterials(['#ffffff', '#c9b9a4', '#9a9a9a', '#d4a98a', '#7d7466']);
const TAIL = 5;
let bodyGeo: ReturnType<typeof mergeGeometries> | null = null;
const legGeo = new BoxGeometry(0.05, 0.16, 0.06).translate(0, -0.08, 0);
const tailGeo = new CylinderGeometry(0.018, 0.012, 1, 4, 1).rotateX(Math.PI / 2);

function geo() {
  bodyGeo ??= mergeGeometries([
    paint(new IcosahedronGeometry(1, 0).scale(0.15, 0.13, 0.3).translate(0, 0.2, 0), '#5a5148'),
    paint(new ConeGeometry(0.08, 0.24, 5).rotateX(Math.PI / 2).translate(0, 0.19, 0.38), '#4d453d'),
    paint(new ConeGeometry(0.035, 0.07, 4).translate(0.06, 0.34, 0.27), '#8a5f5a'),
    paint(new ConeGeometry(0.035, 0.07, 4).translate(-0.06, 0.34, 0.27), '#8a5f5a'),
  ])!;
  return bodyGeo;
}

export function createRat(seed: number): Monster {
  const rng = new Rng(seed);
  const size = 0.85 + rng.next() * 0.6;
  const root = new Group();
  const body = new Group();
  const mat = mats[Math.floor(rng.next() * mats.length)];
  const torso = new Mesh(geo(), mat);
  torso.castShadow = true;
  body.add(torso);
  const legs: Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const l = new Mesh(legGeo, mat);
    l.position.set(i & 1 ? 0.1 : -0.1, 0.17, i < 2 ? 0.18 : -0.16);
    body.add(l);
    legs.push(l);
  }
  const tail: Mesh[] = [];
  const tailMat = mats[0];
  for (let i = 0; i < TAIL; i++) {
    const t = new Mesh(tailGeo, tailMat);
    t.scale.set(1, 1, 0.14);
    body.add(t);
    tail.push(t);
  }
  body.scale.setScalar(size);
  root.add(body);
  const flash = flasher(root);
  let phase = rng.next() * 6;
  const tailPhase = rng.next() * 6;
  const m: Monster = {
    kind: 'rat', root, radius: 0.28 * size, size,
    hp: 9, maxHp: 9, damage: 3, speed: 3.3 + rng.next() * 0.9, attackInterval: 0.8,
    attackCd: 0.4, flashT: 0, dying: -1, heading: rng.next() * 6.28,
    setFlash: flash,
    update(dt, speed, heading) {
      const k = Math.min(1, speed / 2);
      phase += dt * (6 + speed * 4.5);
      body.rotation.y = heading + Math.sin(phase * 0.5) * 0.14 * k;
      body.rotation.z = Math.sin(phase) * 0.07 * k;
      body.position.y = Math.abs(Math.sin(phase)) * 0.045 * k;
      for (let i = 0; i < 4; i++) {
        const diag = i === 0 || i === 3 ? 0 : Math.PI;
        legs[i].rotation.x = Math.sin(phase + diag) * 0.95 * k;
      }
      const t = tailPhase + phase * 0.6;
      for (let i = 0; i < TAIL; i++) {
        const w = 0.07 * (i + 1) * (0.4 + 0.6 * k + 0.3);
        const x = Math.sin(t - i * 0.9) * w * 0.4;
        const seg = tail[i];
        seg.position.set(x, 0.2 - i * 0.012, -0.3 - i * 0.13);
        seg.rotation.y = Math.cos(t - i * 0.9) * 0.4;
      }
    },
  };
  return m;
}
