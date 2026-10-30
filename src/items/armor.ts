import { LAYER_LIBRARY, type LayerDef } from '../character/layers';
import type { Item } from './types';

/** baseType → base layer in LAYER_LIBRARY and the layer tweaks. */
const BASES: Record<string, { lib: string; metal: boolean; offset?: number; rigidity?: number }> = {
  Helm: { lib: 'helmet', metal: true },
  Hood: { lib: 'hood', metal: false },
  Crown: { lib: 'helmet', metal: true, offset: 0.02 },
  Breastplate: { lib: 'breastplate', metal: true },
  Tunic: { lib: 'tunic', metal: false },
  Robe: { lib: 'tunic', metal: false, offset: 0.012 },
  Pauldrons: { lib: 'pauldrons', metal: true },
  Mantle: { lib: 'pauldrons', metal: false, offset: 0.026, rigidity: 0.5 },
  Gloves: { lib: 'gloves', metal: false },
  Gauntlets: { lib: 'gloves', metal: true, offset: 0.006, rigidity: 0.7 },
  Bracers: { lib: 'bracers', metal: true },
  Vambraces: { lib: 'bracers', metal: true, offset: 0.01 },
  Belt: { lib: 'belt', metal: false },
  Faulds: { lib: 'faulds', metal: true },
  Trousers: { lib: 'trousers', metal: false },
  Greaves: { lib: 'greaves', metal: true },
  Sabatons: { lib: 'boots', metal: true, rigidity: 0.8, offset: 0.01 },
  Boots: { lib: 'boots', metal: false },
};

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

export function itemToLayers(item: Item): LayerDef[] {
  if (item.slot === 'weapon') return [];
  const base = BASES[item.baseType] ?? BASES.Helm;
  const lib = LAYER_LIBRARY[base.lib];
  const th = item.theme ?? { material: 'iron' as const };
  const [c0, m0, r0] = BASE_COLORS[th.material] ?? BASE_COLORS.iron;
  let color = c0, metalness = m0, roughness = r0;
  if (!base.metal && th.material !== 'gold' && th.material !== 'rust') metalness = Math.min(metalness, 0.2);
  let emissive: string | undefined;
  let emissiveIntensity = 0;
  if (th.element && th.material !== 'gold') {
    const [tc, te] = TINT[th.element];
    color = tc;
    emissive = te;
    emissiveIntensity = th.element === 'frost' ? 0.25 : th.element === 'shadow' ? 0.3 : 0.6;
  }
  if (th.element && th.material === 'gold') {
    emissive = TINT[th.element][1];
    emissiveIntensity = 0.3;
  }
  if (th.material === 'gold') {
    emissive = th.element ? emissive : '#ffcc44';
    emissiveIntensity = Math.max(emissiveIntensity, 0.5 + (th.glow ?? 0) * 1.5);
  }
  let noise = lib.surfaceNoise ?? 0;
  let holes: LayerDef['holes'];
  if (th.broken) {
    color = '#5c3d2a';
    metalness = 0.45;
    roughness = 0.9;
    emissive = undefined;
    emissiveIntensity = 0;
    noise = Math.max(noise * 3, 0.0025);
    holes = { density: 0.28, seed: item.seed };
  }
  const def: LayerDef = {
    ...lib,
    id: `item-${item.id}`,
    name: item.name,
    cover: lib.cover.map((c) => ({ ...c })),
    offset: base.offset ?? lib.offset,
    rigidity: base.rigidity ?? lib.rigidity,
    surfaceNoise: noise || undefined,
    material: { color, metalness, roughness, ...(emissive ? { emissive, emissiveIntensity } : {}) },
    ...(holes ? { holes } : {}),
  };
  return [def];
}
