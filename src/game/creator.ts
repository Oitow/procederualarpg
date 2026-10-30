import {
  AmbientLight, Color, DirectionalLight, Group, HemisphereLight, Mesh, PerspectiveCamera, PointLight, Scene, WebGLRenderer,
} from 'three';
import { buildCharacter } from '../character/generator';
import { BEARD_STYLES, HAIR_COLORS, HAIR_STYLES, hairLayers } from '../character/hair';
import { PRESETS, makeParams, type CharacterParams } from '../character/params';

export interface Look { hair: string; hairColor: string; beard: string }

const PRESET_NAMES = Object.keys(PRESETS);
export const SKIN_TONES = [
  '#f0cfb2', '#d9a982', '#c08a62', '#8d5a3b', '#5a3724', '#3a2418', // human
  '#9a9c9a', '#8fa8c4', '#6f9a5a', '#4a6a3a', '#9a5a6a', '#b8a060', // ash, pale blue, moss, deep green, rose, bone-gold
];
/** slider id, label, kind: 'mul' = multiplier of the archetype, 'abs' = absolute 0..1 */
const SLIDERS = [
  { id: 'height', label: 'Stature', kind: 'mul' },
  { id: 'shoulders', label: 'Shoulders', kind: 'mul' },
  { id: 'muscle', label: 'Might', kind: 'abs' },
  { id: 'fat', label: 'Girth', kind: 'abs' },
  { id: 'head', label: 'Head', kind: 'mul' },
  { id: 'limbs', label: 'Limbs', kind: 'mul' },
] as const;
const BODY_GROUPS: [string, number[]][] = [['Frame', [0, 1, 4]], ['Flesh', [2, 3, 5]]];

interface State { preset: number; skin: number; hair: number; hcol: number; beard: number; seed: number; sl: number[] }

function presetSliders(preset: number): number[] {
  const p = makeParams(PRESETS[PRESET_NAMES[preset]]);
  const q = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 15);
  return [8, 8, q(p.build.muscularity), q(p.build.bodyFat), 8, 8];
}

export function stateToParams(s: State): CharacterParams {
  const base = makeParams(PRESETS[PRESET_NAMES[s.preset]]);
  const m = (i: number) => 0.88 + (s.sl[i] / 15) * 0.24;
  const p = makeParams({}, base);
  p.seed = s.seed;
  p.variation = 0.25;
  p.height = base.height * m(0);
  p.proportions.shoulderWidth = base.proportions.shoulderWidth * m(1);
  p.build.muscularity = s.sl[2] / 15;
  p.build.bodyFat = s.sl[3] / 15;
  p.proportions.headSize = base.proportions.headSize * m(4);
  p.build.limbThickness = base.build.limbThickness * m(5);
  p.appearance.skinColor = SKIN_TONES[s.skin];
  return p;
}
const lookOf = (s: State): Look => ({ hair: HAIR_STYLES[s.hair], hairColor: HAIR_COLORS[s.hcol], beard: BEARD_STYLES[s.beard] });

// ---- Bloodline: whole look <-> 10 rune syllables -------------------------------------------
const CONS = 'bdfgkmnprstvzhlj'; // 16
const VOW = 'aeou'; // 4
const FIELDS: [keyof State | 'sl', number][] = [['preset', 3], ['skin', 4], ['hair', 3], ['hcol', 4], ['beard', 3], ['seed', 16]];

export function encodeBloodline(s: State): string {
  let n = 0n;
  const push = (v: number, bits: number) => { n = (n << BigInt(bits)) | BigInt(v & ((1 << bits) - 1)); };
  for (const [k, b] of FIELDS) push(s[k as 'preset'] as number, b);
  for (const v of s.sl) push(v, 4);
  const syl: string[] = [];
  for (let i = 0; i < 10; i++) { const d = Number(n & 63n); n >>= 6n; syl.push(CONS[d >> 2] + VOW[d & 3]); }
  return [syl.slice(0, 3).join(''), syl.slice(3, 6).join(''), syl.slice(6, 10).join('')].map((x) => x[0].toUpperCase() + x.slice(1)).join('-');
}

export function decodeBloodline(text: string): State | null {
  const t = text.toLowerCase().replace(/[^a-z]/g, '');
  if (t.length !== 20) return null;
  let n = 0n;
  for (let i = 9; i >= 0; i--) {
    const c = CONS.indexOf(t[i * 2]);
    const v = VOW.indexOf(t[i * 2 + 1]);
    if (c < 0 || v < 0) return null;
    n = (n << 6n) | BigInt(c * 4 + v);
  }
  const pop = (bits: number) => { const v = Number(n & ((1n << BigInt(bits)) - 1n)); n >>= BigInt(bits); return v; };
  const sl: number[] = [];
  for (let i = 5; i >= 0; i--) sl[i] = pop(4);
  const s: Record<string, number> = {};
  for (const [k, b] of [...FIELDS].reverse()) s[k] = pop(b);
  const st = { ...s, sl } as unknown as State;
  if (st.preset >= PRESET_NAMES.length || st.skin >= SKIN_TONES.length || st.hair >= HAIR_STYLES.length ||
      st.hcol >= HAIR_COLORS.length || st.beard >= BEARD_STYLES.length) return null;
  return st;
}

const KEY = 'gloomvale.bloodline';
function randomState(): State {
  const preset = Math.floor(Math.random() * PRESET_NAMES.length);
  const r = (n: number) => Math.floor(Math.random() * n);
  return { preset, skin: r(SKIN_TONES.length), hair: r(HAIR_STYLES.length), hcol: r(HAIR_COLORS.length), beard: r(BEARD_STYLES.length), seed: r(65536), sl: presetSliders(preset) };
}

const CSS = `
.cr{position:fixed;inset:0;z-index:50;display:flex;flex-direction:column;background:#070d0c;color:#d8cfae;font:15px/1.3 Georgia,serif;touch-action:manipulation}
.cr canvas{display:block;width:100%;flex:0 0 42%;min-height:0;touch-action:none;background:radial-gradient(ellipse at 50% 70%,#16302c,#070d0c)}
.cr .pn{flex:1;overflow-y:auto;padding:10px 14px 90px;background:#0b1514;border-top:2px solid #8a6a2c}
.cr h4{margin:14px 0 6px;font-size:12px;letter-spacing:.15em;text-transform:uppercase;color:#b8934a}
.cr .row{display:flex;flex-wrap:wrap;gap:6px}
.cr button{min-height:44px;min-width:44px;padding:0 12px;border:1px solid #3a4a40;border-radius:6px;background:#12201d;color:#d8cfae;font:inherit}
.cr button.on{border-color:#d9a94a;background:#2a2a14;color:#ffe9a8}
.cr .sw{width:44px;padding:0;border-radius:50%}
.cr .sl{display:flex;align-items:center;gap:10px;min-height:40px}.cr .sl span{width:84px}.cr .sl input{flex:1;height:30px}
.cr .bl{display:flex;gap:6px}.cr .bl input{flex:1;min-height:44px;background:#050a09;border:1px solid #8a6a2c;color:#ffe9a8;border-radius:6px;padding:0 10px;font:inherit;letter-spacing:.06em}
.cr .ft{position:absolute;left:0;right:0;bottom:0;padding:10px 14px;background:#070d0c;border-top:1px solid #8a6a2c;display:flex;gap:8px}
.cr .ft button{flex:1;min-height:52px;font-size:17px}.cr .ft .go{background:#6a4e1a;border-color:#d9a94a;color:#fff3c8}
.cr .rune{position:absolute;top:10px;left:0;right:0;text-align:center;font-size:20px;letter-spacing:.12em;color:#e8c872;text-shadow:0 0 8px #000}
`;

export function openCreator(
  initial: CharacterParams | null,
  onDone: (p: CharacterParams, look: Look) => void,
): void {
  let st: State | null = null;
  try { const t = localStorage.getItem(KEY); if (t) st = decodeBloodline(t); } catch { /* ignore */ }
  if (!st) {
    st = { preset: 0, skin: 1, hair: 1, hcol: 1, beard: 0, seed: initial ? initial.seed & 0xffff : 1337, sl: presetSliders(0) };
    if (initial) { const i = SKIN_TONES.indexOf(initial.appearance.skinColor); if (i >= 0) st.skin = i; }
  }
  const S: State = st;

  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const root = document.createElement('div');
  root.className = 'cr';
  const canvas = document.createElement('canvas');
  const rune = document.createElement('div');
  rune.className = 'rune';
  const panel = document.createElement('div');
  panel.className = 'pn';
  const ft = document.createElement('div');
  ft.className = 'ft';
  root.append(canvas, rune, panel, ft);
  document.body.appendChild(root);

  const renderer = new WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  const scene = new Scene();
  scene.add(new HemisphereLight(0x7ea0a0, 0x1a1208, 0.9), new AmbientLight(0x304040, 0.6));
  const key = new DirectionalLight(0xffd9a0, 2.2); key.position.set(2, 3, 3); scene.add(key);
  const rim = new PointLight(0x4a8aff, 6, 8); rim.position.set(-2, 2, -2); scene.add(rim);
  scene.background = new Color(0x0a1312);
  const cam = new PerspectiveCamera(30, 1, 0.1, 50);
  const holder = new Group();
  scene.add(holder);
  let model: ReturnType<typeof buildCharacter> | null = null;
  let yaw = 0.4, drag = false, lastX = 0, alive = true, height = 1.8;

  function rebuild() {
    if (model) {
      holder.remove(model.group);
      model.group.traverse((o) => { if (o instanceof Mesh) { o.geometry.dispose(); (o.material as { dispose(): void }).dispose(); } });
    }
    const p = stateToParams(S);
    const look = lookOf(S);
    const layers = ['trousers', 'tunic', 'boots', ...hairLayers(look.hair, look.hairColor, S.seed, look.beard)];
    model = buildCharacter({ ...p, detail: { ...p.detail, subdivisions: 1 } }, { layers });
    holder.add(model.group);
    height = p.height;
    rune.textContent = encodeBloodline(S);
    try { localStorage.setItem(KEY, encodeBloodline(S)); } catch { /* ignore */ }
  }

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
  }
  const loop = () => {
    if (!alive) return;
    if (!drag) yaw += 0.004;
    holder.rotation.y = yaw;
    const d = (height * 0.62) / Math.tan((cam.fov / 2) * Math.PI / 180) / Math.min(1, cam.aspect * 1.3);
    cam.position.set(0, height * 0.55, d + 0.5);
    cam.lookAt(0, height * 0.5, 0);
    renderer.render(scene, cam);
    requestAnimationFrame(loop);
  };
  canvas.addEventListener('pointerdown', (e) => { drag = true; lastX = e.clientX; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => { if (drag) { yaw += (e.clientX - lastX) * 0.01; lastX = e.clientX; } });
  const up = () => { drag = false; };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  addEventListener('resize', resize);

  // ---- UI ----------------------------------------------------------------------------------
  const btn = (label: string, on: boolean, fn: () => void) => {
    const b = document.createElement('button');
    b.textContent = label; if (on) b.className = 'on'; b.onclick = fn; return b;
  };
  const section = (title: string) => { const h = document.createElement('h4'); h.textContent = title; panel.appendChild(h); const r = document.createElement('div'); r.className = 'row'; panel.appendChild(r); return r; };
  const change = (fn: () => void) => { fn(); rebuild(); ui(); };

  function ui() {
    const scroll = panel.scrollTop;
    panel.innerHTML = '';
    // bloodline
    let h = document.createElement('h4'); h.textContent = 'Bloodline (type a name to summon a look)'; panel.appendChild(h);
    const bl = document.createElement('div'); bl.className = 'bl';
    const inp = document.createElement('input'); inp.value = encodeBloodline(S); inp.autocapitalize = 'off'; inp.spellcheck = false;
    bl.append(inp, btn('Summon', false, () => {
      const d = decodeBloodline(inp.value);
      if (!d) { inp.style.borderColor = '#c04030'; return; }
      Object.assign(S, d); rebuild(); ui();
    }));
    panel.appendChild(bl);

    section('Lineage').append(...PRESET_NAMES.map((n, i) => btn(n, S.preset === i, () => change(() => { S.preset = i; S.sl = presetSliders(i); }))));
    for (const [title, idx] of BODY_GROUPS) {
      h = document.createElement('h4'); h.textContent = title; panel.appendChild(h);
      for (const i of idx) {
        const row = document.createElement('div'); row.className = 'sl';
        const lab = document.createElement('span'); lab.textContent = SLIDERS[i].label;
        const r = document.createElement('input'); r.type = 'range'; r.min = '0'; r.max = '15'; r.step = '1'; r.value = String(S.sl[i]);
        r.oninput = () => { S.sl[i] = Number(r.value); rebuild(); rune.textContent = inp.value = encodeBloodline(S); };
        row.append(lab, r); panel.appendChild(row);
      }
    }
    const sk = section('Skin');
    SKIN_TONES.forEach((c, i) => { const b = btn('', S.skin === i, () => change(() => { S.skin = i; })); b.className += ' sw'; b.style.background = c; sk.appendChild(b); });
    section('Hair').append(...HAIR_STYLES.map((n, i) => btn(n, S.hair === i, () => change(() => { S.hair = i; }))));
    section('Beard').append(...BEARD_STYLES.map((n, i) => btn(n, S.beard === i, () => change(() => { S.beard = i; }))));
    const hc = section('Colour');
    HAIR_COLORS.forEach((c, i) => { const b = btn('', S.hcol === i, () => change(() => { S.hcol = i; })); b.className += ' sw'; b.style.background = c; hc.appendChild(b); });
    panel.scrollTop = scroll;
  }

  ft.append(
    btn('Dice', false, () => { Object.assign(S, randomState()); rebuild(); ui(); }),
    (() => { const b = btn('Begin', false, () => {
      alive = false; removeEventListener('resize', resize);
      const p = stateToParams(S), look = lookOf(S);
      renderer.dispose(); root.remove(); style.remove();
      onDone(p, look);
    }); b.className = 'go'; return b; })(),
  );

  rebuild(); ui(); resize(); loop();
}
