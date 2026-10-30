import { Color } from 'three';
import { LAYER_LIBRARY, type CoverRule, type LayerDef, type LayerExtra } from '../character/layers';
import { Rng } from '../character/rng';
import type { Item } from './types';

/** baseType → base layer in LAYER_LIBRARY and the layer tweaks. */
const BASES: Record<string, { lib: string; metal: boolean; offset?: number; rigidity?: number; thickness?: number; cover?: CoverRule[]; crown?: boolean }> = {
  Helm: { lib: 'helmet', metal: true },
  Hood: { lib: 'hood', metal: false, offset: 0.018, cover: [
    { parts: ['head'], from: 0.5 }, { parts: ['head'], from: 0.1, facing: 'back' }, { parts: ['neck'] },
    { parts: ['torso'], from: 0.86, facing: 'back', flare: [0, 0.03] }] },
  // crown = thin band; random dropped faces on the band give the points
  Crown: { lib: 'helmet', metal: true, offset: 0.024, thickness: 0.011, crown: true, cover: [{ parts: ['head'], from: 0.74, to: 0.92 }] },
  Breastplate: { lib: 'breastplate', metal: true },
  Tunic: { lib: 'tunic', metal: false },
  Robe: { lib: 'tunic', metal: false, offset: 0.014, cover: [
    { parts: ['torso'] }, { parts: ['thigh'], to: 1, flare: [0.01, 0.07] }, { parts: ['upperarm'], flare: [0, 0.012] },
    { parts: ['forearm'], to: 0.55, flare: [0.01, 0.045] }] },
  Pauldrons: { lib: 'pauldrons', metal: true },
  Mantle: { lib: 'pauldrons', metal: false, offset: 0.028, rigidity: 0.4, cover: [
    { parts: ['upperarm'], to: 0.55, flare: [0.014, 0.05] }, { parts: ['torso'], from: 0.74, lateralMin: 0.25 }, { parts: ['neck'] }] },
  Gloves: { lib: 'gloves', metal: false },
  Gauntlets: { lib: 'gloves', metal: true, offset: 0.007, rigidity: 0.7, thickness: 0.005, cover: [
    { parts: ['hand'] }, { parts: ['forearm'], from: 0.55, flare: [0.02, 0] }] },
  Bracers: { lib: 'bracers', metal: true },
  Vambraces: { lib: 'bracers', metal: true, offset: 0.01, cover: [{ parts: ['forearm'], from: 0.05, flare: [0.004, 0.006] }] },
  Belt: { lib: 'belt', metal: false },
  Faulds: { lib: 'faulds', metal: true },
  Trousers: { lib: 'trousers', metal: false },
  Greaves: { lib: 'greaves', metal: true },
  Sabatons: { lib: 'boots', metal: true, rigidity: 0.8, offset: 0.012, cover: [{ parts: ['shin'], from: 0.7 }, { parts: ['foot'] }] },
  Boots: { lib: 'boots', metal: false, cover: [{ parts: ['shin'], from: 0.4, flare: [0.022, 0] }, { parts: ['foot'] }] },
};

/** Accent pieces: extra thin shells in the trim colour (rims, bands, buckles) or gems. Need rarity index >= min. */
interface Trim { cover: CoverRule[]; min: number; gem?: boolean; off?: number; thick?: number }
const TRIMS: Record<string, Trim[]> = {
  Helm: [{ cover: [{ parts: ['head'], from: 0.6, to: 0.72 }], min: 1 }, { cover: [{ parts: ['head'], from: 0.92 }], min: 3 }, { cover: [{ parts: ['head'], from: 0.72, to: 0.8, facing: 'front' }], min: 3, gem: true }],
  Hood: [{ cover: [{ parts: ['head'], from: 0.5, to: 0.58, facing: 'front' }], min: 3 }, { cover: [{ parts: ['torso'], from: 0.93, facing: 'back' }], min: 2 }],
  Crown: [{ cover: [{ parts: ['head'], from: 0.74, to: 0.8 }], min: 1, thick: 0.004 }, { cover: [{ parts: ['head'], from: 0.8, to: 0.88, facing: 'front' }], min: 2, gem: true }],
  Breastplate: [{ cover: [{ parts: ['torso'], from: 0.38, to: 0.44 }], min: 1 }, { cover: [{ parts: ['torso'], from: 0.9 }], min: 2 }, { cover: [{ parts: ['torso'], from: 0.62, to: 0.74, lateralMax: 0.2, facing: 'front' }], min: 3, gem: true }],
  Tunic: [{ cover: [{ parts: ['torso'], from: 0.12, to: 0.17 }], min: 2 }, { cover: [{ parts: ['torso'], from: 0.9 }], min: 3 }],
  Robe: [{ cover: [{ parts: ['thigh'], from: 0.9 }], min: 1, thick: 0.002 }, { cover: [{ parts: ['forearm'], from: 0.4, to: 0.55 }], min: 2 }, { cover: [{ parts: ['torso'], from: 0.55, to: 0.62 }], min: 3 }],
  Pauldrons: [{ cover: [{ parts: ['upperarm'], from: 0.22, to: 0.38 }], min: 1, off: 0.012 }, { cover: [{ parts: ['upperarm'], to: 0.12 }], min: 3 }, { cover: [{ parts: ['torso'], from: 0.8, lateralMin: 0.6, facing: 'front' }], min: 4, gem: true }],
  Mantle: [{ cover: [{ parts: ['upperarm'], from: 0.4, to: 0.55 }], min: 1 }, { cover: [{ parts: ['neck'] }], min: 2 }],
  Gloves: [{ cover: [{ parts: ['forearm'], from: 0.78, to: 0.86 }], min: 2 }],
  Gauntlets: [{ cover: [{ parts: ['forearm'], from: 0.55, to: 0.64 }], min: 1 }, { cover: [{ parts: ['hand'], facing: 'back' }], min: 3, off: 0.008 }],
  Bracers: [{ cover: [{ parts: ['forearm'], from: 0.2, to: 0.3 }], min: 1 }, { cover: [{ parts: ['forearm'], from: 0.8, to: 0.9 }], min: 3 }],
  Vambraces: [{ cover: [{ parts: ['forearm'], from: 0.05, to: 0.15 }], min: 1 }, { cover: [{ parts: ['forearm'], from: 0.5, to: 0.6 }], min: 3, gem: true }],
  Belt: [{ cover: [{ parts: ['torso'], from: 0.22, to: 0.28, lateralMax: 0.2, facing: 'front' }], min: 0, thick: 0.01, off: 0.006 }, { cover: [{ parts: ['torso'], from: 0.22, to: 0.28, lateralMin: 0.7 }], min: 3 }],
  Faulds: [{ cover: [{ parts: ['thigh'], from: 0.2, to: 0.32 }], min: 1 }, { cover: [{ parts: ['torso'], from: 0.2, to: 0.3, lateralMax: 0.2, facing: 'front' }], min: 3, gem: true }],
  Trousers: [{ cover: [{ parts: ['shin'], from: 0.82, to: 0.92 }], min: 3 }],
  Greaves: [{ cover: [{ parts: ['shin'], from: 0.08, to: 0.18 }], min: 1 }, { cover: [{ parts: ['shin'], from: 0.7, to: 0.85 }], min: 1 }],
  Boots: [{ cover: [{ parts: ['shin'], from: 0.4, to: 0.5 }], min: 1, thick: 0.004 }, { cover: [{ parts: ['foot'], to: 0.25 }], min: 3 }],
  Sabatons: [{ cover: [{ parts: ['shin'], from: 0.7, to: 0.8 }], min: 1 }, { cover: [{ parts: ['foot'], from: 0.75 }], min: 2, off: 0.008 }],
};
const RAR_IDX: Record<string, number> = { broken: 0, common: 1, magic: 2, rare: 3, legendary: 4, divine: 5 };
const CLOTH_PAL = ['#4a4036', '#3e4a36', '#4f3a38', '#363f4a', '#51463a', '#3a3340', '#5a5242', '#2f3b2c', '#6b6254'];
const LEATHER_PAL = ['#5a3a22', '#46301f', '#3a2a1e', '#654528', '#2e2218', '#4a3a2a'];
const GEM_PAL = ['#c01830', '#2a5ad8', '#18a050', '#9a30c8'];

/** Small seeded hue/lightness jitter so the same material never looks identical twice. */
function jitter(hex: string, rng: Rng, h = 0.02, l = 0.04): string {
  const c = new Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL((hsl.h + rng.range(-h, h) + 1) % 1, Math.max(0, hsl.s * rng.range(0.85, 1.1)), Math.min(0.9, Math.max(0.03, hsl.l + rng.range(-l, l))));
  return '#' + c.getHexString();
}

const BASE_COLORS: Record<string, [string, number, number]> = {
  iron: ['#8e969f', 0.9, 0.38],
  steel: ['#b4bcc6', 0.92, 0.28],
  gold: ['#e0b53a', 1, 0.22],
  rust: ['#6b4126', 0.55, 0.85],
  obsidian: ['#1c1a20', 0.6, 0.3],
  leather: ['#5a3a22', 0, 0.8],
  cloth: ['#6b6254', 0, 0.95],
};
const TINT: Record<string, [string, string | undefined]> = {
  fire: ['#a8461c', '#ff5a14'],
  frost: ['#a9d6f0', '#4aa8ff'],
  hell: ['#2b0b0b', '#ff1a0a'],
  shadow: ['#2c2638', '#6a3cff'],
};

/** Spikes / horns / studs for hell, barbarian-style and rare+ pieces (skinned with the shell). */
function extrasFor(item: Item, rar: number, hell: boolean): { extras: LayerExtra[]; mat: { color: string; metalness: number; roughness: number; emissive?: string; emissiveIntensity?: number } } | undefined {
  const t = item.baseType;
  const seed = item.seed ^ 0x5eed;
  const ex: LayerExtra[] = [];
  const kind = hell ? 'horn' : 'spike';
  const sz = 0.05 + rar * 0.008 + (hell ? 0.02 : 0);
  if (t === 'Pauldrons' && (hell || rar >= 3)) ex.push({ kind, cover: [{ parts: ['upperarm'], to: 0.4 }], density: 0.6, size: sz, seed, max: 6 });
  else if (t === 'Helm' && (hell || rar >= 4)) {
    ex.push({ kind: 'horn', cover: [{ parts: ['head'], from: 0.72, to: 0.9, side: 'L' }], density: 1, size: sz + 0.04, seed, max: 1 });
    ex.push({ kind: 'horn', cover: [{ parts: ['head'], from: 0.72, to: 0.9, side: 'R' }], density: 1, size: sz + 0.04, seed: seed + 1, max: 1 });
  } else if (t === 'Breastplate' && rar >= 2) ex.push({ kind: hell ? 'spike' : 'stud', cover: [{ parts: ['torso'], from: 0.4, to: 0.9, lateralMin: 0.45 }], density: 0.55, size: hell ? 0.035 : 0.012, seed, max: 10 });
  else if ((t === 'Gauntlets' || t === 'Vambraces' || t === 'Bracers') && (hell || rar >= 3)) ex.push({ kind: hell ? 'spike' : 'stud', cover: [{ parts: ['forearm'], from: 0.3, to: 0.9 }], density: 0.4, size: hell ? 0.035 : 0.012, seed, max: 4 });
  else if ((t === 'Belt' || t === 'Faulds' || t === 'Sabatons' || t === 'Greaves') && rar >= 2) ex.push({ kind: 'stud', cover: [{ parts: t === 'Belt' || t === 'Faulds' ? ['torso'] : ['shin', 'foot'], from: 0.1 }], density: 0.3, size: 0.011, seed, max: 6 });
  if (!ex.length) return undefined;
  return { extras: ex, mat: hell ? { color: '#1a0c0c', metalness: 0.6, roughness: 0.4, emissive: '#ff1a0a', emissiveIntensity: 0.5 } : { color: rar >= 3 ? '#c9a23a' : '#6e6a64', metalness: 0.9, roughness: 0.35 } };
}

export function itemToLayers(item: Item): LayerDef[] {
  if (item.slot === 'weapon') return [];
  const base = BASES[item.baseType] ?? BASES.Helm;
  const lib = LAYER_LIBRARY[base.lib];
  const th = item.theme ?? { material: 'iron' as const };
  const rar = RAR_IDX[item.rarity] ?? 1;
  const rng = new Rng(item.seed ^ 0x7a3c91);
  let [color, metalness, roughness] = BASE_COLORS[th.material] ?? BASE_COLORS.iron;
  if (th.material === 'leather') color = LEATHER_PAL[Math.floor(rng.next() * LEATHER_PAL.length)];
  else if (th.material === 'cloth' || (!base.metal && th.material === 'iron')) color = CLOTH_PAL[Math.floor(rng.next() * CLOTH_PAL.length)];
  if (!base.metal && th.material !== 'gold' && th.material !== 'rust') metalness = Math.min(metalness, 0.2);
  if (!base.metal && th.material === 'iron') { color = CLOTH_PAL[Math.floor(rng.next() * CLOTH_PAL.length)]; roughness = 0.92; }
  color = jitter(color, rng);
  if (item.dye && !base.metal && !th.broken) color = jitter(item.dye, rng, 0.006, 0.025);
  let emissive: string | undefined;
  let emissiveIntensity = 0;
  let accent: string | undefined; // element / divine glow colour used on the trim
  if (th.element) {
    const [tc, te] = TINT[th.element];
    accent = te;
    if (th.material !== 'gold') {
      // metal armour: dark element-tinted body; cloth: only a mild tint
      color = base.metal ? jitter(tc, rng, 0.01, 0.03) : jitter(color, rng, 0, 0.02);
      if (!base.metal) color = '#' + new Color(color).lerp(new Color(tc), 0.35).getHexString();
    }
    emissive = te;
    emissiveIntensity = (th.element === 'frost' ? 0.25 : th.element === 'shadow' ? 0.3 : 0.6) * 0.45;
  }
  if (th.material === 'gold') {
    accent = accent ?? '#ffcc44';
    emissive = accent;
    emissiveIntensity = Math.max(emissiveIntensity, 0.2 + (th.glow ?? 0) * 0.7);
  }
  let noise = lib.surfaceNoise ?? 0;
  let holes: LayerDef['holes'];
  if (th.broken) {
    color = jitter('#5c3d2a', rng, 0.02, 0.03);
    metalness = 0.45;
    roughness = 0.9;
    emissive = undefined;
    emissiveIntensity = 0;
    accent = undefined;
    noise = Math.max(noise * 3, 0.0025);
    holes = { density: 0.28, seed: item.seed };
  }
  if (base.crown) holes = { density: 0.34, seed: item.seed }; // crenellated rim = crown points
  const xt = th.broken ? undefined : extrasFor(item, rar, th.element === 'hell');
  const def: LayerDef = {
    ...lib,
    ...(xt ? { extras: xt.extras, extraMaterial: xt.mat } : {}),
    id: `item-${item.id}`,
    name: item.name,
    cover: (base.cover ?? lib.cover).map((c) => ({ ...c })),
    offset: base.offset ?? lib.offset,
    thickness: base.thickness ?? lib.thickness,
    rigidity: base.rigidity ?? lib.rigidity,
    surfaceNoise: noise || undefined,
    material: { color, metalness, roughness, ...(emissive ? { emissive, emissiveIntensity } : {}) },
    ...(holes ? { holes } : {}),
  };
  const out: LayerDef[] = [def];
  if (th.broken) return out;

  // Trim colour: contrasting second tone.
  const metalTrim = base.metal || rar >= 3;
  let tColor = base.metal ? (rar >= 3 || th.material === 'gold' ? (th.material === 'gold' ? '#7a5a1c' : '#c9a23a') : '#3d4147') : rar >= 3 ? '#b8923a' : '#33231a';
  if (th.element === 'hell') tColor = '#14090a';
  else if (th.element === 'frost' && rar >= 2) tColor = '#dcecf8';
  else if (th.element === 'shadow') tColor = '#17121f';
  const dyedTrim = !!item.dye && base.metal && th.element !== 'hell';
  if (dyedTrim) tColor = item.dye!;
  tColor = jitter(tColor, rng, 0.01, 0.03);
  const trimMat = dyedTrim ? { color: tColor, metalness: 0.05, roughness: 0.85 } : {
    color: tColor,
    metalness: metalTrim ? 0.85 : 0.05,
    roughness: metalTrim ? 0.3 : 0.8,
    ...(accent && rar >= 2 ? { emissive: accent, emissiveIntensity: th.element === 'hell' || th.material === 'gold' ? 0.9 : 0.6 } : {}),
  };
  const gemCol = th.element ? accent! : GEM_PAL[Math.floor(rng.next() * GEM_PAL.length)];
  let n = 0;
  for (const t of TRIMS[item.baseType] ?? []) {
    if (rar < t.min) continue;
    out.push({
      ...lib,
      id: `item-${item.id}-t${n++}`,
      name: `${item.name} trim`,
      kind: 'armor',
      order: def.order + n,
      cover: t.cover.map((c) => ({ ...c })),
      offset: def.offset + (t.off ?? 0.006),
      thickness: t.thick ?? (t.gem ? 0.012 : 0.004),
      rimSharpness: 3,
      rigidity: Math.max(def.rigidity, 0.6),
      conform: 0,
      hidesBody: false,
      surfaceNoise: undefined,
      holes: undefined,
      material: t.gem
        ? { color: gemCol, metalness: 0.2, roughness: 0.15, emissive: gemCol, emissiveIntensity: 1.1 }
        : { ...trimMat },
    });
  }
  return out;
}
