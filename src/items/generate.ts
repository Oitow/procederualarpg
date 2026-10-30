import { Rng } from '../character/rng';
import type { Affix, Item, ItemElement, ItemSlot, ItemTheme, Rarity } from './types';

export const BASE_TYPES: Record<ItemSlot, string[]> = {
  weapon: ['Sword', 'Axe', 'Mace', 'Dagger'],
  head: ['Helm', 'Hood', 'Crown'],
  chest: ['Breastplate', 'Tunic', 'Robe'],
  shoulders: ['Pauldrons', 'Mantle'],
  hands: ['Gloves', 'Gauntlets'],
  arms: ['Bracers', 'Vambraces'],
  waist: ['Belt', 'Faulds'],
  legs: ['Trousers', 'Greaves'],
  feet: ['Boots', 'Sabatons'],
};

const RARITY_ORDER: Rarity[] = ['broken', 'common', 'magic', 'rare', 'legendary', 'divine'];
const RARITY_WEIGHT: Record<Rarity, number> = { broken: 12, common: 45, magic: 28, rare: 11, legendary: 3.5, divine: 0.5 };
const RARITY_MULT: Record<Rarity, number> = { broken: 0.5, common: 1, magic: 1.2, rare: 1.45, legendary: 1.8, divine: 2.3 };

interface Theme { key: string; prefix: string; suffix: string; element?: ItemElement; material?: 'gold' | 'rust'; stat: string; words: string[] }
const THEMES: Theme[] = [
  { key: 'fire', prefix: 'Flaming', suffix: 'of Flame', element: 'fire', stat: 'Fire Damage', words: ['Ember', 'Cinder', 'Ash', 'Pyre', 'Blaze'] },
  { key: 'frost', prefix: 'Frozen', suffix: 'of Frost', element: 'frost', stat: 'Cold Damage', words: ['Rime', 'Glacier', 'Winter', 'Hoar', 'Icicle'] },
  { key: 'gold', prefix: 'Gilded', suffix: 'of Gold', material: 'gold', stat: 'Gold Find', words: ['Sun', 'Aurum', 'Dawn', 'Halo'] },
  { key: 'hell', prefix: 'Infernal', suffix: 'of Hell', element: 'hell', stat: 'Life Leech', words: ['Blood', 'Doom', 'Gore', 'Hex', 'Abyss'] },
  { key: 'shadow', prefix: 'Shadow', suffix: 'of Shadow', element: 'shadow', stat: 'Evasion', words: ['Gloom', 'Dusk', 'Night', 'Wraith', 'Umbra'] },
  { key: 'rust', prefix: 'Rusty', suffix: 'of Decay', material: 'rust', stat: 'Poison Damage', words: ['Rot', 'Grim', 'Mold', 'Scrap'] },
];
const NOUNS: Record<ItemSlot, string[]> = {
  weapon: ['Bite', 'Reaper', 'Fang', 'Edge', 'Thirst', 'Song'],
  head: ['Visage', 'Crest', 'Gaze', 'Brow'],
  chest: ['Bulwark', 'Heart', 'Shell', 'Ward'],
  shoulders: ['Burden', 'Wings', 'Crown'],
  hands: ['Grip', 'Fist', 'Touch'],
  arms: ['Guard', 'Embrace', 'Clasp'],
  waist: ['Bind', 'Girth', 'Coil'],
  legs: ['Stride', 'Pillar', 'March'],
  feet: ['Tread', 'Step', 'Heel'],
};

function pickRarity(rng: Rng): Rarity {
  const total = RARITY_ORDER.reduce((a, r) => a + RARITY_WEIGHT[r], 0);
  let x = rng.next() * total;
  for (const r of RARITY_ORDER) if ((x -= RARITY_WEIGHT[r]) < 0) return r;
  return 'common';
}
const pick = <T,>(rng: Rng, a: T[]): T => a[Math.floor(rng.next() * a.length) % a.length];

export function generateItem(seed: number, opts: { slot?: ItemSlot; rarity?: Rarity; level?: number } = {}): Item {
  const rng = new Rng(seed ^ 0x51ed270b);
  const slot = opts.slot ?? 'weapon';
  const level = Math.max(1, Math.round(opts.level ?? 1));
  const rarity = opts.rarity ?? pickRarity(rng);
  const baseType = pick(rng, BASE_TYPES[slot]);
  const mult = RARITY_MULT[rarity];
  const power = (1 + level * 0.15) * mult;

  const themed = (t: Theme, theme: ItemTheme) => {
    if (t.element) theme.element = t.element;
    if (t.material) theme.material = t.material;
  };
  const theme: ItemTheme = { material: slot === 'weapon' ? 'steel' : ['Hood', 'Tunic', 'Robe', 'Gloves', 'Belt', 'Trousers', 'Boots'].includes(baseType) ? 'leather' : 'iron' };
  const affixes: Affix[] = [];
  const addAffix = (t: Theme, tier: number) => {
    const v = Math.round((4 + level * 0.8) * tier * rng.range(0.8, 1.2));
    affixes.push({ id: t.key, text: `+${v}% ${t.stat}` });
    return v;
  };
  let name = baseType;

  if (rarity === 'broken') {
    name = `Broken ${baseType}`;
    theme.broken = true;
    theme.material = 'rust';
  } else if (rarity === 'magic') {
    const t = pick(rng, THEMES);
    addAffix(t, 1);
    themed(t, theme);
    name = rng.next() < 0.5 ? `${t.prefix} ${baseType}` : `${baseType} ${t.suffix}`;
  } else if (rarity === 'rare') {
    const t = pick(rng, THEMES);
    const t2 = pick(rng, THEMES);
    addAffix(t, 1.3);
    addAffix(t2, 1);
    themed(t, theme);
    name = `${pick(rng, t.words)} ${pick(rng, NOUNS[slot])}`;
  } else if (rarity === 'legendary') {
    const t = pick(rng, THEMES);
    let t2 = pick(rng, THEMES);
    if (t2 === t) t2 = THEMES[(THEMES.indexOf(t) + 1) % THEMES.length];
    addAffix(t, 1.8);
    addAffix(t2, 1.4);
    themed(t2, theme);
    themed(t, theme);
    name = `${t.prefix} ${baseType} ${t2.suffix}`;
    theme.glow = 0.4;
  } else if (rarity === 'divine') {
    const t = pick(rng, THEMES.filter((x) => x.element));
    addAffix(t, 2.4);
    affixes.push({ id: 'divine', text: `+${Math.round(10 + level)}% All Resistances` });
    theme.material = 'gold';
    theme.element = t.element;
    theme.glow = 1;
    name = `Divine ${baseType} ${t.suffix}`;
  }
  if (theme.material === 'rust' && !theme.broken && rarity !== 'common') theme.broken = false;
  if (rarity === 'common') name = baseType;

  const stats: Record<string, number> = {};
  const r = (a: number, b: number) => rng.range(a, b);
  if (slot === 'weapon') {
    const k = { Sword: [4, 8], Axe: [5, 10], Mace: [4, 9], Dagger: [2, 5] }[baseType] ?? [3, 6];
    stats.damageMin = Math.max(1, Math.round(k[0] * power * r(0.9, 1.05)));
    stats.damageMax = Math.max(stats.damageMin + 1, Math.round(k[1] * power * r(0.95, 1.15)));
    stats.speed = +(baseType === 'Dagger' ? 1.5 : baseType === 'Axe' ? 0.95 : 1.1).toFixed(2);
  } else {
    stats.armor = Math.max(1, Math.round(r(3, 5) * power * (theme.material === 'iron' ? 1.4 : 1)));
  }
  for (const a of affixes) stats[a.id] = (stats[a.id] ?? 0) + parseInt(a.text.slice(1), 10);

  return { id: `item-${seed}`, seed, name, slot, rarity, level, baseType, affixes, stats, theme };
}
