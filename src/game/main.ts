import {
  ACESFilmicToneMapping,
  Color,
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
import { OUTFITS, buildCharacter, makeParams, samplePose } from '../character';
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
const hero = buildCharacter(makeParams({ seed, variation: 0.6, detail: { subdivisions: 1 } }), { layers: OUTFITS.Rogue });
hero.group.position.copy(spawn);
scene.add(hero.group);

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
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

// ---------------------------------------------------------------------------
// loop
// ---------------------------------------------------------------------------
const timer = new Timer();
const SPEED = 4.2;
let walkTime = 0;
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
  if (kx || kz) {
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
    if (terrain.isWalkable(nx, nz)) {
      pos.x = nx;
      pos.z = nz;
    } else target = null;
    const want = Math.atan2(move.x, move.z);
    let d = want - facing;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    facing += d * Math.min(1, dt * 12);
    hero.group.rotation.y = facing;
    walkTime += dt * 1.25;
  } else idleTime += dt;
  pos.y = terrain.height(pos.x, pos.z);
  hero.setPose(samplePose(moving ? 'walk' : 'idle', moving ? walkTime : idleTime, hero.data.rig, hero.data.params.armRestAngle));

  // camera, lights, world streaming
  camTarget.lerp(pos, Math.min(1, dt * 5));
  camera.position.copy(camTarget).add(ISO_OFFSET);
  camera.lookAt(camTarget);
  moon.position.copy(camTarget).add(new Vector3(-14, 30, 10));
  moon.target.position.copy(camTarget);
  torch.position.set(pos.x + 0.6, pos.y + 2.4, pos.z + 0.4);
  torch.intensity = 13 + Math.sin(timer.getElapsed() * 11) * 0.8 + Math.sin(timer.getElapsed() * 7.3) * 0.6;
  world.update(pos);

  const mm = marker.material as MeshBasicMaterial;
  mm.opacity = Math.max(0, mm.opacity - dt * 1.8);

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();

(window as unknown as { game: unknown }).game = { scene, camera, hero, world, setZoom: (z: number) => ((zoom = z), resize()) };
