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
import { PoseBlender, attackPose, buildCharacter, gaitCadence, gaitClip, makeParams, samplePose, type CharacterModel } from '../character';
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
      // blade (+Y) -> forward (+Z) and slightly up (-Y along the hand)
      w.rotation.x = Math.PI / 2 + 0.5;
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

// click marker
const marker = new Mesh(
  new RingGeometry(0.25, 0.4, 24).rotateX(-Math.PI / 2),
  new MeshBasicMaterial({ color: '#c9a45a', transparent: true, opacity: 0, depthWrite: false }),
);
scene.add(marker);

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
    marker.position.set(p.x, p.y + 0.05, p.z);
    (marker.material as MeshBasicMaterial).opacity = 1;
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
    zoom = Math.min(30, Math.max(8, (zoomStart * pinchStart) / Math.max(d, 1)));
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
  zoom = Math.min(30, Math.max(8, zoom * (1 + Math.sign(e.deltaY) * 0.1)));
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
const SPEED = 4.2;
let walkTime = 0; // gait phase in cycles
const blender = new PoseBlender(0.2);
let idleTime = 0;
let facing = 0;
const move = new Vector3();
const camTarget = spawn.clone();

function frame() {
  timer.update();
  const dt = Math.min(timer.getDelta(), 0.05);
  const pos = hero.group.position;

  // movement intent
  move.set(0, 0, 0);
  const kx = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
  const kz = (keys.has('s') || keys.has('arrowdown') ? 1 : 0) - (keys.has('w') || keys.has('arrowup') ? 1 : 0);
  if (inventory.isOpen() || combat.dead) {
    target = null;
    steering = false;
  } else if (kx || kz) {
    // screen-aligned directions for the 45° iso view
    move.set(kx + kz, 0, kz - kx).normalize();
    target = null;
  } else if (target) {
    move.set(target.x - pos.x, 0, target.z - pos.z);
    if (move.length() < 0.15) {
      target = null;
      move.set(0, 0, 0);
    } else move.normalize();
  }

  const moving = move.lengthSq() > 0;
  if (moving) {
    const nx = pos.x + move.x * SPEED * dt;
    const nz = pos.z + move.z * SPEED * dt;
    const r = world.resolve(nx, nz, PLAYER_R, fix);
    const ox = pos.x;
    const oz = pos.z;
    if (terrain.isWalkable(r.x, r.z)) {
      pos.x = r.x;
      pos.z = r.z;
    } else if (terrain.isWalkable(nx, nz) && !r.hit) {
      pos.x = nx;
      pos.z = nz;
    } else target = null;
    if (target) {
      const step = SPEED * dt;
      stuck = Math.hypot(pos.x - ox, pos.z - oz) < step * 0.4 ? stuck + dt : 0;
      if (stuck > 0.2) {
        target = null;
        stuck = 0;
      }
    } else stuck = 0;
    const want = Math.atan2(move.x, move.z);
    let d = want - facing;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    facing += d * Math.min(1, dt * 12);
    hero.group.rotation.y = facing;
    walkTime += dt * gaitCadence(SPEED, hero.data.rig);
  } else idleTime += dt;
  pos.y = terrain.height(pos.x, pos.z);
  const cf = combat.update(inventory.isOpen() ? 0 : dt, pos, moving);
  if (cf.respawn) {
    pos.copy(spawn);
    target = null;
    camTarget.copy(spawn);
  }
  if (cf.face !== null && !moving) {
    let d = cf.face - facing;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    facing += d * Math.min(1, dt * 14);
    hero.group.rotation.y = facing;
  }
  hero.group.rotation.x = combat.dead ? -1.4 : 0;
  hud.set(combat.hp, combat.maxHp, combat.kills, combat.wave, combat.dead, combat.alive);
  const rig = hero.data.rig, arm = hero.data.params.armRestAngle;
  const attacking = cf.attackU >= 0 && !combat.dead;
  const gait = moving && !combat.dead;
  const clip = attacking ? 'attack' : gait ? gaitClip(SPEED) : 'idle';
  const targetPose = attacking
    ? attackPose(Math.min(1, cf.attackU), rig, arm)
    : gait
      ? samplePose(gaitClip(SPEED), 0, rig, arm, { speed: SPEED, phase: walkTime })
      : samplePose('idle', idleTime, rig, arm);
  hero.setPose(blender.update(targetPose, dt, clip));

  // camera, lights, world streaming
  camTarget.lerp(pos, Math.min(1, dt * 5));
  camera.position.copy(camTarget).add(ISO_OFFSET);
  camera.lookAt(camTarget);
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

  const mm = marker.material as MeshBasicMaterial;
  mm.opacity = Math.max(0, mm.opacity - dt * 1.8);

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();

(window as unknown as { game: unknown }).game = { scene, camera, get hero() { return hero; }, world, inventory, setZoom: (z: number) => ((zoom = z), resize()) };
