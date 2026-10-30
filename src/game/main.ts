import {
  ACESFilmicToneMapping,
  BufferGeometry,
  CanvasTexture,
  Color,
  Group,
  Material,
  Object3D,
  Sprite,
  SpriteMaterial,
  SphereGeometry,
  DirectionalLight,
  Fog,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  PointLight,
  Raycaster,
  RingGeometry,
  Scene,
  SRGBColorSpace,
  Timer,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { PoseBlender, applyExtras, attackPose, buildCharacter, gaitCadence, gaitClip, makeParams, samplePose, type CharacterModel } from '../character';
import { RARITY_COLORS, buildWeaponMesh, generateItem, itemToLayers, type Item, type ItemSlot } from '../items';
import { Inventory, type Equipment } from './inventory';
import { Combat } from './combat';
import { Hud } from './hud';
import { PALETTE, World, createTerrain, regionName } from './world';

// ---------------------------------------------------------------------------
// setup
// ---------------------------------------------------------------------------
const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed')) || Math.floor(Math.random() * 99999);
const mobile = matchMedia('(pointer: coarse)').matches;

const renderer = new WebGLRenderer({ antialias: !mobile });
renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.75 : 2));
renderer.outputColorSpace = SRGBColorSpace;
renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
renderer.shadowMap.enabled = true;
document.getElementById('app')!.appendChild(renderer.domElement);

const scene = new Scene();
scene.background = new Color(PALETTE.fog);
scene.fog = new Fog(PALETTE.fog, 58, 95); // camera sits 60 m away: fog only eats the far edges

scene.add(new HemisphereLight('#6f93b3', '#22311d', 1.6));
const moon = new DirectionalLight('#b4c9e6', 2.4);
moon.castShadow = true;
moon.shadow.mapSize.setScalar(mobile ? 1024 : 2048);
moon.shadow.camera.left = moon.shadow.camera.bottom = -22;
moon.shadow.camera.right = moon.shadow.camera.top = 22;
moon.shadow.camera.far = 80;
moon.shadow.bias = -0.0008;
scene.add(moon, moon.target);
const torch = new PointLight('#ffad5c', 14, 11, 1.6);
scene.add(torch);

// isometric camera
const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
const ISO_OFFSET = new Vector3(1, 1.15, 1).normalize().multiplyScalar(60);
let zoom = 16; // visible world height in meters
const ZMIN = mobile ? 10 : 8; // portrait phones: closer than this crops the world to a sliver
const ZMAX = mobile ? 24 : 30;
function resize() {
  const w = innerWidth;
  const h = innerHeight;
  renderer.setSize(w, h);
  const aspect = w / h;
  // portrait: show more world vertically so the width stays usable
  const viewH = aspect < 1 ? zoom * Math.min(1.9, 1 / aspect) * 0.75 : zoom;
  camera.top = viewH / 2;
  camera.bottom = -viewH / 2;
  camera.left = (-viewH * aspect) / 2;
  camera.right = (viewH * aspect) / 2;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// world
const terrain = createTerrain(seed);
const world = new World(terrain, 2);
scene.add(world.group);
const spawn = world.findSpawn();
world.update(spawn, 25);

// player
const heroParams = makeParams({ seed, variation: 0.6, detail: { subdivisions: 1 } });
let hero: CharacterModel = buildCharacter(heroParams, { layers: [] });
hero.group.position.copy(spawn);
scene.add(hero.group);
let weapon: Object3D | null = null;

function disposeTree(o: Object3D) {
  o.traverse((c) => {
    const m = c as Object3D & { geometry?: BufferGeometry; material?: Material | Material[] };
    m.geometry?.dispose();
    if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => x.dispose());
  });
}

let currentEq: Equipment = {};
function rebuildHero(eq: Equipment) {
  currentEq = eq;
  const old = hero;
  const layers = Object.values(eq)
    .filter((i): i is Item => !!i && i.slot !== 'weapon')
    .flatMap((i) => itemToLayers(i));
  const next = buildCharacter(heroParams, { layers });
  next.group.position.copy(old.group.position);
  next.group.rotation.copy(old.group.rotation);
  scene.remove(old.group);
  if (weapon) {
    weapon.parent?.remove(weapon);
    disposeTree(weapon);
    weapon = null;
  }
  old.dispose();
  hero = next;
  scene.add(hero.group);
  if (eq.weapon) {
    const hand = hero.skeleton.bones.find((b) => b.name === 'hand_R');
    if (hand) {
      weapon = new Group();
      const w = buildWeaponMesh(eq.weapon);
      // blade (+Y) -> hand-local +Z (forward) tilted 17 deg toward the wrist
      w.rotation.x = Math.PI / 2 + 0.3; // blade elevation = total hand flex + 17 deg (see attackPose)
      w.position.set(0, 0.04, 0.02);
      weapon.add(w);
      weapon.userData.update = (dt: number) => w.userData.update?.(dt);
      hand.add(weapon);
    }
  }
}

const combat = new Combat(scene, world, terrain, () => currentEq);
const hud = new Hud();
combat.onHeroHit = () => hud.flashHit();

// inventory + starting bag
const inventory = new Inventory();
inventory.onEquipmentChange = rebuildHero;
const startSpecs: [number, ItemSlot, Parameters<typeof generateItem>[1]?][] = [
  [11, 'weapon', { rarity: 'rare' }], [12, 'weapon', { rarity: 'divine', level: 20 }], [13, 'head', { rarity: 'broken' }],
  [14, 'chest', { rarity: 'common' }], [15, 'legs', { rarity: 'magic' }], [16, 'feet', { rarity: 'common' }],
  [17, 'hands', { rarity: 'rare' }], [18, 'shoulders', { rarity: 'legendary', level: 12 }], [19, 'arms', { rarity: 'magic' }],
  [20, 'waist', { rarity: 'common' }], [21, 'head', { rarity: 'divine', level: 25 }], [22, 'weapon', { rarity: 'legendary', level: 14 }],
];
for (const [sd, slot, o] of startSpecs) inventory.addToBag(generateItem(seed * 100 + sd, { slot, ...o }));

// loot drops
interface Drop { item: Item; mesh: Group; baseY: number; phase: number }
const drops: Drop[] = [];
const dropGeo = new SphereGeometry(0.18, 10, 8);
function labelTexture(text: string, color: string): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 48;
  const g = c.getContext('2d')!;
  g.font = '600 24px Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = 'rgba(4,8,10,0.7)';
  const w = Math.min(250, g.measureText(text).width + 20);
  g.fillRect(128 - w / 2, 6, w, 36);
  g.fillStyle = color;
  g.fillText(text, 128, 25, 240);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}
function spawnDrop(item: Item, x: number, z: number) {
  const g = new Group();
  const col = new Color(RARITY_COLORS[item.rarity]);
  const glow = item.rarity === 'divine' || item.rarity === 'legendary' ? 3 : 1.6;
  const m = new Mesh(dropGeo, new MeshBasicMaterial({ color: col.clone().multiplyScalar(glow), toneMapped: false }));
  g.add(m);
  const lbl = new Sprite(new SpriteMaterial({ map: labelTexture(item.name, RARITY_COLORS[item.rarity]), depthTest: false, transparent: true }));
  lbl.scale.set(2.4, 0.45, 1);
  lbl.position.y = 0.75;
  lbl.renderOrder = 10;
  g.add(lbl);
  const y = terrain.height(x, z);
  g.position.set(x, y + 0.35, z);
  scene.add(g);
  drops.push({ item, mesh: g, baseY: y + 0.35, phase: Math.random() * 6 });
}
{
  const dropItems: [number, ItemSlot, Parameters<typeof generateItem>[1]?][] = [
    [31, 'weapon', { rarity: 'magic' }], [32, 'chest', { rarity: 'rare' }], [33, 'head', { rarity: 'legendary', level: 10 }],
    [34, 'feet', { rarity: 'broken' }], [35, 'weapon', { rarity: 'divine', level: 18 }], [36, 'hands', { rarity: 'common' }],
  ];
  dropItems.forEach(([sd, slot, o], i) => {
    const a = (i / dropItems.length) * Math.PI * 2 + 0.4;
    const r = 3.5 + (i % 3) * 1.2;
    let x = spawn.x + Math.cos(a) * r;
    let z = spawn.z + Math.sin(a) * r;
    if (!terrain.isWalkable(x, z)) {
      x = spawn.x + Math.cos(a) * 1.8;
      z = spawn.z + Math.sin(a) * 1.8;
    }
    const p = world.resolve(x, z, 0.6);
    spawnDrop(generateItem(seed * 100 + sd, { slot, ...o }), p.x, p.z);
  });
}


resize();

// click marker: steady inner ring + expanding pulse ring
const markerMat = new MeshBasicMaterial({ color: '#d9b266', transparent: true, opacity: 0, depthWrite: false });
const pulseMat = new MeshBasicMaterial({ color: '#f0cf85', transparent: true, opacity: 0, depthWrite: false });
const marker = new Group();
const markerIn = new Mesh(new RingGeometry(0.2, 0.3, 24).rotateX(-Math.PI / 2), markerMat);
const markerPulse = new Mesh(new RingGeometry(0.36, 0.42, 32).rotateX(-Math.PI / 2), pulseMat);
marker.add(markerIn, markerPulse);
scene.add(marker);
let markerA = 0;
let markerAge = 0;
let markerOn = false;

document.getElementById('region')!.textContent = regionName(seed);
document.getElementById('seed')!.textContent = `Seed ${seed}`;

// ---------------------------------------------------------------------------
// input: tap/click-to-move (hold to steer), pinch/wheel zoom, WASD
// ---------------------------------------------------------------------------
const raycaster = new Raycaster();
const ndc = new Vector2();
let target: Vector3 | null = null;
const pointers = new Map<number, { x: number; y: number }>();
let pinchStart = 0;
let zoomStart = zoom;
let steering = false;

function groundAt(clientX: number, clientY: number): Vector3 | null {
  ndc.set((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  return raycaster.intersectObjects(world.terrainMeshes, false)[0]?.point ?? null;
}

function setTarget(x: number, y: number, showMarker: boolean) {
  const p = groundAt(x, y);
  if (!p) return;
  target = p;
  if (showMarker) {
    marker.position.set(p.x, p.y + 0.06, p.z);
    markerAge = 0;
    markerOn = true;
    markerA = 1;
  }
}

const canvas = renderer.domElement;
canvas.style.touchAction = 'none';
canvas.addEventListener('pointerdown', (e) => {
  if (inventory.isOpen()) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  canvas.setPointerCapture(e.pointerId);
  if (pointers.size === 1) {
    steering = true;
    setTarget(e.clientX, e.clientY, true);
  } else if (pointers.size === 2) {
    steering = false;
    target = null;
    const [a, b] = [...pointers.values()];
    pinchStart = Math.hypot(a.x - b.x, a.y - b.y);
    zoomStart = zoom;
  }
});
canvas.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    zoom = Math.min(ZMAX, Math.max(ZMIN, (zoomStart * pinchStart) / Math.max(d, 1)));
    resize();
  } else if (steering) setTarget(e.clientX, e.clientY, false);
});
const release = (e: PointerEvent) => {
  pointers.delete(e.pointerId);
  if (pointers.size === 0) steering = false;
};
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);
canvas.addEventListener('wheel', (e) => {
  zoom = Math.min(ZMAX, Math.max(ZMIN, zoom * (1 + Math.sign(e.deltaY) * 0.1)));
  resize();
}, { passive: true });

const keys = new Set<string>();
addEventListener('keydown', (e) => keys.add(e.key.toLowerCase()));
const PLAYER_R = 0.35;
const fix = { x: 0, z: 0, hit: false };
let stuck = 0;
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

// ---------------------------------------------------------------------------
// loop
// ---------------------------------------------------------------------------
const timer = new Timer();
const MAX_SPEED = 5.2; // run
const ACCEL = 13; // m/s^2
const DECEL = 18;
let walkTime = 0; // gait phase in cycles
const blender = new PoseBlender(0.2);
let idleTime = 0;
let facing = 0;
const vel = new Vector3();
const dir = new Vector3();
const dv = new Vector3();
const camTarget = spawn.clone();
const lookAhead = new Vector3();
let speed = 0;
let yawRate = 0;
let bank = 0;
let slopeS = 0;
let yS = spawn.y;
let hitT = 9;
let shake = 0;
let lastHp = combat.hp;
let deathT = 0;
const slopeAt = (x: number, z: number, f: number) => {
  const fx = Math.sin(f) * 0.35;
  const fz = Math.cos(f) * 0.35;
  return [terrain.height(x + fx, z + fz), terrain.height(x - fx, z - fz)] as const;
};

function frame() {
  timer.update();
  const dt = Math.min(timer.getDelta(), 0.05);
  const pos = hero.group.position;

  // movement intent -> desired velocity (speed scales with distance to the touch/tap target)
  dir.set(0, 0, 0);
  let wantSpeed = 0;
  const kx = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
  const kz = (keys.has('s') || keys.has('arrowdown') ? 1 : 0) - (keys.has('w') || keys.has('arrowup') ? 1 : 0);
  if (inventory.isOpen() || combat.dead) {
    target = null;
    steering = false;
  } else if (kx || kz) {
    // screen-aligned directions for the 45° iso view
    dir.set(kx + kz, 0, kz - kx).normalize();
    wantSpeed = MAX_SPEED;
    target = null;
  } else if (target) {
    dir.set(target.x - pos.x, 0, target.z - pos.z);
    const dist = dir.length();
    if (dist < 0.12) {
      target = null;
      dir.set(0, 0, 0);
    } else {
      dir.divideScalar(dist);
      wantSpeed = Math.min(MAX_SPEED, 1.7 + (dist - 0.6) * 1.2); // close = walk, far = run
      wantSpeed = Math.min(wantSpeed, Math.max(0.7, Math.sqrt(2 * DECEL * 0.6 * dist))); // brake into the target
    }
  }

  // acceleration / deceleration
  dv.copy(dir).multiplyScalar(wantSpeed);
  dv.sub(vel);
  const dl = dv.length();
  const maxd = (wantSpeed * wantSpeed >= vel.lengthSq() ? ACCEL : DECEL) * dt;
  if (dl > maxd) dv.multiplyScalar(maxd / dl);
  vel.add(dv);
  const prevSpeed = speed;
  speed = vel.length();

  if (speed > 0.01) {
    const nx = pos.x + vel.x * dt;
    const nz = pos.z + vel.z * dt;
    const r = world.resolve(nx, nz, PLAYER_R, fix);
    const ox = pos.x;
    const oz = pos.z;
    if (terrain.isWalkable(r.x, r.z)) {
      pos.x = r.x;
      pos.z = r.z;
    } else if (terrain.isWalkable(nx, nz) && !r.hit) {
      pos.x = nx;
      pos.z = nz;
    } else {
      target = null;
      vel.set(0, 0, 0);
    }
    if (target) {
      const step = speed * dt;
      stuck = step > 1e-4 && Math.hypot(pos.x - ox, pos.z - oz) < step * 0.4 ? stuck + dt : 0;
      if (stuck > 0.25) {
        target = null;
        stuck = 0;
      }
    } else stuck = 0;
  } else stuck = 0;

  const moving = speed > 0.3;
  if (moving) {
    // turn towards the velocity direction; yaw rate drives the lean
    const want = Math.atan2(vel.x, vel.z);
    let d = want - facing;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    const nf = facing + d * Math.min(1, dt * (7 + speed));
    yawRate += ((nf - facing) / Math.max(dt, 1e-3) - yawRate) * Math.min(1, dt * 10);
    facing = nf;
    walkTime += dt * gaitCadence(Math.max(speed, 0.6), hero.data.rig);
  } else {
    yawRate *= Math.max(0, 1 - dt * 10);
    idleTime += dt;
  }
  const tilt = Math.max(0, Math.min(1, speed / 3));
  bank += (Math.max(-0.28, Math.min(0.28, -yawRate * 0.05)) * tilt - bank) * Math.min(1, dt * 8);

  // terrain under the feet: pelvis height + foot pitch
  const [hF, hB] = slopeAt(pos.x, pos.z, facing);
  const hC = terrain.height(pos.x, pos.z);
  const slope = Math.max(-0.6, Math.min(0.6, Math.atan((hF - hB) / 0.7)));
  slopeS += (slope - slopeS) * Math.min(1, dt * 10);
  const yT = (hF + hB + 2 * hC) / 4 - Math.min(0.1, Math.abs(hF - hB) * 0.12);
  yS = Math.abs(yT - yS) > 1.5 ? yT : yS + (yT - yS) * Math.min(1, dt * 14);
  pos.y = yS;

  const cf = combat.update(inventory.isOpen() ? 0 : dt, pos, moving);
  if (cf.respawn) {
    pos.copy(spawn);
    yS = spawn.y;
    vel.set(0, 0, 0);
    speed = 0;
    target = null;
    camTarget.copy(spawn);
    lookAhead.set(0, 0, 0);
  }
  if (cf.face !== null && !moving) {
    let d = cf.face - facing;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    facing += d * Math.min(1, dt * 14);
  }

  // hit reaction (hp drop) + death fall
  if (combat.hp < lastHp - 0.001 && !combat.dead) {
    hitT = 0;
    shake = Math.min(0.3, shake + 0.12);
  } else if (combat.hp <= 0 && lastHp > 0) shake = 0.3;
  lastHp = combat.hp;
  hitT += dt;
  const hitU = hitT / 0.38;
  const hit = hitU < 1 ? Math.sin(Math.PI * Math.pow(hitU, 0.55)) : 0;
  deathT = combat.dead ? deathT + dt : 0;
  const fallU = Math.min(1, deathT / 0.8);
  const fall = 1 + 2.2 * Math.pow(fallU - 1, 3) + 1.2 * Math.pow(fallU - 1, 2); // ease-out-back: small overshoot, settles
  hero.group.rotation.set(
    -1.45 * (combat.dead ? fall : 0) + (combat.dead ? 0 : Math.max(-0.08, Math.min(0.1, (speed - prevSpeed) / Math.max(dt, 1e-3) * 0.006))) - hit * 0.05,
    facing,
    combat.dead ? 0.12 * fall : bank,
  );
  if (combat.dead) pos.y += 0.1 * fall;
  hud.set(combat.hp, combat.maxHp, combat.kills, combat.wave, combat.dead, combat.alive);
  const rig = hero.data.rig, arm = hero.data.params.armRestAngle;
  const attacking = cf.attackU >= 0 && !combat.dead;
  const gait = moving && !combat.dead;
  const clip = attacking ? 'attack' : gait ? gaitClip(speed) : 'idle';
  const targetPose = attacking
    ? attackPose(Math.min(1, cf.attackU), rig, arm)
    : gait
      ? samplePose(gaitClip(speed), idleTime, rig, arm, { speed, phase: walkTime, blend: Math.min(1, (speed - 0.3) / 0.9) })
      : samplePose('idle', idleTime, rig, arm);
  hero.setPose(applyExtras(blender.update(targetPose, dt, clip), { footPitch: slopeS * 0.8, hit, limp: combat.dead ? fallU : 0 }));

  // camera, lights, world streaming
  lookAhead.lerp(dv.copy(vel).multiplyScalar(0.4), 1 - Math.exp(-dt * 2.5));
  dv.copy(pos).add(lookAhead);
  camTarget.lerp(dv, 1 - Math.exp(-dt * 6));
  camera.position.copy(camTarget).add(ISO_OFFSET);
  camera.lookAt(camTarget);
  if (shake > 0.002) {
    const st = timer.getElapsed();
    camera.position.x += Math.sin(st * 83) * shake;
    camera.position.y += Math.sin(st * 97) * shake * 0.6;
    camera.position.z += Math.sin(st * 71) * shake;
    shake *= Math.exp(-dt * 9);
  } else shake = 0;
  moon.position.copy(camTarget).add(new Vector3(-14, 30, 10));
  moon.target.position.copy(camTarget);
  torch.position.set(pos.x + 0.6, pos.y + 2.4, pos.z + 0.4);
  torch.intensity = 13 + Math.sin(timer.getElapsed() * 11) * 0.8 + Math.sin(timer.getElapsed() * 7.3) * 0.6;
  world.update(pos);

  weapon?.userData.update?.(dt);
  const t = timer.getElapsed();
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i];
    d.mesh.position.y = d.baseY + Math.sin(t * 2 + d.phase) * 0.08;
    if (Math.hypot(d.mesh.position.x - pos.x, d.mesh.position.z - pos.z) < 0.9) {
      inventory.addToBag(d.item);
      scene.remove(d.mesh);
      disposeTree(d.mesh);
      (d.mesh.children[1] as Sprite).material.map?.dispose();
      drops.splice(i, 1);
    }
  }

  if (!target) markerOn = false;
  markerAge += dt;
  markerA = markerOn ? 1 : Math.max(0, markerA - dt * 3);
  const mp = (markerAge * 1.3) % 1;
  markerMat.opacity = markerA * 0.9;
  markerIn.scale.setScalar(1 + 0.1 * Math.sin(markerAge * 10));
  markerPulse.scale.setScalar(0.7 + mp * 1.5);
  pulseMat.opacity = markerA * (1 - mp) * 0.85;

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();

(window as unknown as { game: unknown }).game = { scene, camera, get hero() { return hero; }, world, inventory, setZoom: (z: number) => ((zoom = z), resize()) };
