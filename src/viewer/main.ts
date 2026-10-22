import GUI from 'lil-gui';
import {
  ACESFilmicToneMapping,
  BufferAttribute,
  CircleGeometry,
  Color,
  DirectionalLight,
  Fog,
  GridHelper,
  HemisphereLight,
  PMREMGenerator,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  SkeletonHelper,
  SkinnedMesh,
  SRGBColorSpace,
  Timer,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  BONE_INDEX,
  BONE_NAMES,
  CLIPS,
  CharacterModel,
  ClipName,
  DEFAULT_PARAMS,
  LAYER_LIBRARY,
  OUTFITS,
  PARAM_RANGES,
  PRESETS,
  Range,
  Rng,
  buildCageWireframe,
  buildCharacter,
  cloneParams,
  flexTestTarget,
  makeParams,
  samplePose,
} from '../character';

/** Built as a standalone web page (no file downloads allowed there). */
const ARTIFACT = import.meta.env.MODE === 'artifact';
const NARROW = window.innerWidth < 700;

// ---------------------------------------------------------------------------
// scene
// ---------------------------------------------------------------------------
const container = document.getElementById('app')!;
const statsEl = document.getElementById('stats')!;
const renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = SRGBColorSpace;
renderer.toneMapping = ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
container.appendChild(renderer.domElement);

const scene = new Scene();
scene.background = new Color('#1b1e24');
scene.fog = new Fog('#1b1e24', 8, 20);
const camera = new PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.05, 100);
camera.position.set(2.2, 1.5, 4.2);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.95, 0);
controls.enableDamping = true;

scene.environment = new PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.45;
scene.add(new HemisphereLight('#cfd8ff', '#3a2e22', 0.9));
const sun = new DirectionalLight('#fff1dd', 2.4);
sun.position.set(3, 6, 4);
sun.castShadow = true;
sun.shadow.mapSize.setScalar(NARROW ? 1024 : 2048);
sun.shadow.camera.left = -2;
sun.shadow.camera.right = 2;
sun.shadow.camera.top = 3;
sun.shadow.camera.bottom = -1;
scene.add(sun);
const rim = new DirectionalLight('#88aaff', 1.2);
rim.position.set(-3, 3, -4);
scene.add(rim);

const ground = new Mesh(new CircleGeometry(6, 64), new MeshStandardMaterial({ color: '#2a2d33', roughness: 1 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const grid = new GridHelper(6, 24, '#3d424b', '#30343b');
grid.position.y = 0.001;
scene.add(grid);

// ---------------------------------------------------------------------------
// state
// ---------------------------------------------------------------------------
const params = cloneParams(DEFAULT_PARAMS);
params.variation = 0.3;
const layerState: Record<string, boolean> = Object.fromEntries(Object.keys(LAYER_LIBRARY).map((id) => [id, false]));
const state = {
  preset: 'Human',
  outfit: 'Knight',
  clip: 'idle' as ClipName,
  speed: 1,
  view: 'shaded' as 'shaded' | 'weights' | 'regions',
  weightBone: 'upperarm_L' as string,
  wireframe: false,
  showCage: false,
  showSkeleton: false,
  hideLayers: false,
  lineup: false,
};
for (const id of OUTFITS[state.outfit]) layerState[id] = true;

let model: CharacterModel | null = null;
/** Extra characters shown in lineup mode (all archetypes side by side). */
let lineup: CharacterModel[] = [];
let cage: SkinnedMesh | null = null;
let skeletonHelper: SkeletonHelper | null = null;

const REGION_COLORS = ['#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231', '#911eb4', '#46f0f0', '#f032e6', '#bcf60c', '#fabebe', '#008080', '#e6beff', '#9a6324', '#fffac8', '#800000', '#aaffc3', '#808000', '#ffd8b1', '#000075', '#808080'].map((c) => new Color(c));

function applyView() {
  if (!model) return;
  for (const mesh of [model.body, ...model.layers]) {
    const geo = mesh.geometry;
    const mat = mesh.material as MeshStandardMaterial;
    mat.wireframe = state.wireframe;
    mesh.visible = !(state.hideLayers && mesh !== model.body);
    if (state.view === 'shaded') {
      mat.vertexColors = false;
    } else {
      const count = geo.getAttribute('position').count;
      const colors = new Float32Array(count * 3);
      const c = new Color();
      if (state.view === 'weights') {
        const idx = geo.getAttribute('skinIndex');
        const w = geo.getAttribute('skinWeight');
        const target = BONE_INDEX[state.weightBone as keyof typeof BONE_INDEX];
        for (let v = 0; v < count; v++) {
          let weight = 0;
          for (let k = 0; k < 4; k++) if (idx.getComponent(v, k) === target) weight += w.getComponent(v, k);
          c.setHSL((1 - weight) * 0.66, 0.9, 0.5);
          c.toArray(colors, v * 3);
        }
      } else {
        const region = geo.getAttribute('region');
        for (let v = 0; v < count; v++) REGION_COLORS[region.getX(v) % REGION_COLORS.length].toArray(colors, v * 3);
      }
      geo.setAttribute('color', new BufferAttribute(colors, 3));
      mat.vertexColors = true;
      mat.color.set('#ffffff');
    }
    mat.needsUpdate = true;
  }
  if (state.view === 'shaded') {
    (model.body.material as MeshStandardMaterial).color.set(params.appearance.skinColor);
    model.layers.forEach((m, i) => (m.material as MeshStandardMaterial).color.set(model!.data.layers[i].def.material.color));
  }
}

function regenerate() {
  if (model) {
    scene.remove(model.group);
    model.dispose();
  }
  if (skeletonHelper) scene.remove(skeletonHelper);
  const layers = Object.keys(LAYER_LIBRARY).filter((id) => layerState[id]);
  for (const m of lineup) {
    scene.remove(m.group);
    m.dispose();
  }
  lineup = [];
  model = buildCharacter(params, { layers });
  scene.add(model.group);
  if (state.lineup) {
    const names = Object.keys(PRESETS);
    names.forEach((name, i) => {
      const p = makeParams({ ...PRESETS[name], seed: params.seed, variation: params.variation, detail: params.detail, appearance: params.appearance });
      const m = buildCharacter(p, { layers });
      m.group.position.x = (i + 1) * 0.95;
      scene.add(m.group);
      lineup.push(m);
    });
    model.group.position.x = 0;
  }
  cage = buildCageWireframe(model);
  cage.visible = state.showCage;
  model.group.add(cage);
  skeletonHelper = new SkeletonHelper(model.skeleton.root);
  skeletonHelper.visible = state.showSkeleton;
  scene.add(skeletonHelper);
  applyView();
}

let regenQueued = false;
function queueRegenerate() {
  if (regenQueued) return;
  regenQueued = true;
  requestAnimationFrame(() => {
    regenQueued = false;
    regenerate();
  });
}

// ---------------------------------------------------------------------------
// GUI
// ---------------------------------------------------------------------------
const gui = new GUI({ title: 'Controls' });
const addRange = (folder: GUI, obj: Record<string, unknown>, key: string, range: Range, label?: string) =>
  folder.add(obj, key, range[0], range[1], range[2]).name(label ?? key).onChange(queueRegenerate);

const fChar = gui.addFolder('Character');
fChar
  .add(state, 'preset', Object.keys(PRESETS))
  .name('archetype')
  .onChange((name: string) => {
    const keep = { seed: params.seed, variation: params.variation, detail: { ...params.detail }, appearance: { ...params.appearance } };
    Object.assign(params, makeParams({ ...PRESETS[name] }));
    params.seed = keep.seed;
    params.variation = keep.variation;
    params.detail = keep.detail;
    params.appearance = keep.appearance;
    gui.controllersRecursive().forEach((c) => c.updateDisplay());
    queueRegenerate();
  });
fChar.add(params, 'seed', 0, 99999, 1).onChange(queueRegenerate);
addRange(fChar, params as unknown as Record<string, unknown>, 'variation', PARAM_RANGES.variation);
addRange(fChar, params as unknown as Record<string, unknown>, 'height', PARAM_RANGES.height, 'height (m)');
addRange(fChar, params as unknown as Record<string, unknown>, 'armRestAngle', PARAM_RANGES.armRestAngle, 'bind arm angle');
fChar.addColor(params.appearance, 'skinColor').name('skin').onChange(() => applyView());
fChar
  .add(
    {
      randomize() {
        const rng = new Rng(Date.now() & 0xffffff);
        params.seed = Math.floor(rng.next() * 99999);
        const presetNames = Object.keys(PRESETS);
        Object.assign(params, makeParams(PRESETS[presetNames[Math.floor(rng.next() * presetNames.length)]], params));
        params.variation = 1;
        params.build.muscularity = rng.next();
        params.build.bodyFat = rng.next() * 0.8;
        const skins = ['#f1c7a8', '#d8a383', '#c99a7b', '#a8734f', '#7d5236', '#5a3a26', '#8fa36b', '#7b8fa8'];
        params.appearance.skinColor = skins[Math.floor(rng.next() * skins.length)];
        gui.controllersRecursive().forEach((c) => c.updateDisplay());
        queueRegenerate();
      },
    },
    'randomize',
  )
  .name('🎲 randomize');

const groups: [string, 'proportions' | 'build' | 'joints' | 'detail'][] = [
  ['Proportions', 'proportions'],
  ['Build', 'build'],
  ['Joints', 'joints'],
  ['Surface detail', 'detail'],
];
for (const [title, key] of groups) {
  const folder = gui.addFolder(title);
  const ranges = PARAM_RANGES[key] as Record<string, Range>;
  for (const k of Object.keys(ranges)) addRange(folder, params[key] as unknown as Record<string, unknown>, k, ranges[k]);
  if (key !== 'joints') folder.close();
}

const fLayers = gui.addFolder('Clothing & armour');
fLayers
  .add(state, 'outfit', Object.keys(OUTFITS))
  .onChange((name: string) => {
    for (const id of Object.keys(layerState)) layerState[id] = OUTFITS[name].includes(id);
    fLayers.controllersRecursive().forEach((c) => c.updateDisplay());
    queueRegenerate();
  });
for (const [id, def] of Object.entries(LAYER_LIBRARY)) fLayers.add(layerState, id).name(def.name).onChange(queueRegenerate);
fLayers.close();

const fAnim = gui.addFolder('Animation');
fAnim.add(state, 'clip', [...CLIPS]);
fAnim.add(state, 'speed', 0, 2, 0.05);

const fDebug = gui.addFolder('Debug');
fDebug.add(state, 'view', ['shaded', 'weights', 'regions']).onChange(applyView);
fDebug.add(state, 'weightBone', [...BONE_NAMES]).name('weight bone').onChange(applyView);
fDebug.add(state, 'wireframe').onChange(applyView);
fDebug.add(state, 'lineup').name('archetype lineup').onChange(queueRegenerate);
fDebug.add(state, 'hideLayers').name('hide layers').onChange(applyView);
fDebug.add(state, 'showCage').name('show cage').onChange((v: boolean) => cage && (cage.visible = v));
fDebug.add(state, 'showSkeleton').name('show skeleton').onChange((v: boolean) => skeletonHelper && (skeletonHelper.visible = v));
if (!ARTIFACT) {
  fDebug
    .add(
      {
        async exportGLB() {
          if (!model) return;
          const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
          new GLTFExporter().parse(
            model.group,
            (result) => {
              const blob = new Blob([result as ArrayBuffer], { type: 'model/gltf-binary' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = `character_${params.seed}.glb`;
              a.click();
            },
            (err) => console.error(err),
            { binary: true },
          );
        },
      },
      'exportGLB',
    )
    .name('export .glb');
}
fDebug.close();
if (NARROW) gui.close();

// ---------------------------------------------------------------------------
// loop
// ---------------------------------------------------------------------------
const clock = new Timer();
let animTime = 0;
let fps = 60;
function frame() {
  clock.update();
  const dt = clock.getDelta();
  fps = fps * 0.95 + (1 / Math.max(dt, 1e-3)) * 0.05;
  animTime += dt * state.speed;
  controls.update();
  let clamped: string[] = [];
  if (model) {
    const pose = samplePose(state.clip, animTime, model.data.rig, model.data.params.armRestAngle);
    clamped = model.setPose(pose);
    for (const m of lineup) m.setPose(samplePose(state.clip, animTime, m.data.rig, m.data.params.armRestAngle));
    const s = model.data.stats;
    statsEl.textContent = [
      `cage      ${s.cageVertices} verts / ${s.cageFaces} quads (${s.hiddenCageFaces} hidden)`,
      `body      ${s.bodyTriangles} tris @ level ${model.data.subdivisions}`,
      `layers    ${model.layers.length} meshes / ${s.layerTriangles} tris`,
      `generate  ${s.milliseconds.toFixed(1)} ms`,
      `fps       ${fps.toFixed(0)}`,
      state.clip === 'flexTest' ? `joint     ${flexTestTarget(animTime, model.data.rig)}` : '',
      clamped.length ? `limits    ${clamped.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

regenerate();
frame();

// Hook for automated screenshots / console tinkering.
(window as unknown as { forge: unknown }).forge = {
  params,
  state,
  layerState,
  camera,
  controls,
  regenerate,
  applyView,
  setTime: (t: number) => (animTime = t),
  gui,
  scene,
};
