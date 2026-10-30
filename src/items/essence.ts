import { Rng } from '../character/rng';
import { THEMES, defaultMaterial } from './generate';
import type { Item, ItemTheme } from './types';

/** Essences dropped by monsters / loot. Each one maps to a themed affix and look. */
export type EssenceKind = 'fire' | 'frost' | 'hell' | 'divine' | 'shadow' | 'rust';
export const ESSENCE_KINDS: EssenceKind[] = ['fire', 'frost', 'hell', 'divine', 'shadow', 'rust'];
export const ESSENCE_INFO: Record<EssenceKind, { label: string; color: string }> = {
  fire: { label: 'Feuer', color: '#ff6a2a' },
  frost: { label: 'Frost', color: '#7cc4ff' },
  hell: { label: 'Hölle', color: '#e02418' },
  divine: { label: 'Göttlich', color: '#f0c040' },
  shadow: { label: 'Schatten', color: '#8a5cff' },
  rust: { label: 'Rost', color: '#a0643a' },
};
const THEME_KEY: Record<EssenceKind, string> = { fire: 'fire', frost: 'frost', hell: 'hell', divine: 'gold', shadow: 'shadow', rust: 'rust' };

/** Gritty dye colours for cloth / leather parts. */
export const DYES: { id: string; name: string; color: string }[] = [
  { id: 'blood', name: 'Blutrot', color: '#6e1a1a' },
  { id: 'forest', name: 'Waldgrün', color: '#2f4a2c' },
  { id: 'night', name: 'Nachtblau', color: '#1f2c4a' },
  { id: 'ash', name: 'Aschgrau', color: '#55535a' },
  { id: 'bone', name: 'Knochen', color: '#b8ab8c' },
  { id: 'violet', name: 'Violett', color: '#47295e' },
  { id: 'ochre', name: 'Ocker', color: '#8a6a22' },
  { id: 'pitch', name: 'Pech', color: '#141214' },
];

/** Return a copy of `item` infused with the essence: rerolls/adds the elemental affix and re-themes name + look. */
export function infuseItem(item: Item, kind: EssenceKind): Item {
  const t = THEMES.find((x) => x.key === THEME_KEY[kind])!;
  const rng = new Rng(item.seed ^ (((item.infused?.length ?? 0) + 1) * 0x9e3779b1) ^ kind.length * 977);
  const level = item.level;
  const baseMult = item.rarity === 'divine' ? 2.4 : item.rarity === 'legendary' ? 1.8 : item.rarity === 'rare' ? 1.3 : 1;
  const value = Math.round((4 + level * 0.8) * baseMult * rng.range(0.9, 1.3));
  const affixes = item.affixes.filter((a) => a.id !== t.key);
  while (affixes.length >= 3) affixes.splice(affixes.findIndex((a) => a.id !== 'divine'), 1);
  affixes.push({ id: t.key, text: `+${value}% ${t.stat}` });

  let rarity = item.rarity;
  const wasBroken = rarity === 'broken' || !!item.theme?.broken;
  if (wasBroken || rarity === 'common') rarity = 'magic';
  const def = defaultMaterial(item.slot, item.baseType);
  const old = wasBroken ? undefined : item.theme;
  // current element / material theme (before this essence)
  let elem = t.element ? t : THEMES.find((x) => x.element && x.element === old?.element);
  let mat = !t.element ? t : old?.material === 'gold' ? THEMES.find((x) => x.key === 'gold') : old?.material === 'rust' ? THEMES.find((x) => x.key === 'rust') : undefined;
  if (rarity === 'magic') { if (t.element) mat = undefined; else elem = undefined; } // magic names carry one theme only
  if (rarity === 'divine') mat = THEMES.find((x) => x.key === 'gold');
  if (rarity === 'divine' && !elem) elem = THEMES.find((x) => x.key === 'fire');
  const theme: ItemTheme = { material: mat?.material ?? def };
  if (elem?.element) theme.element = elem.element;
  if (rarity === 'divine') theme.glow = 1;
  else if (rarity === 'legendary') theme.glow = Math.max(item.theme?.glow ?? 0, 0.4);
  else if (mat?.key === 'gold') theme.glow = 0.3;

  const base = item.baseType;
  let name: string;
  if (rarity === 'divine') name = `Divine ${base} ${elem!.suffix}`;
  else if (rarity === 'legendary') name = `${(mat ?? elem)!.prefix} ${base} ${(elem ?? mat)!.suffix}`;
  else if (rarity === 'rare') name = item.name; // rare names are free-form
  else name = rng.next() < 0.5 ? `${t.prefix} ${base}` : `${base} ${t.suffix}`;

  const stats = { ...item.stats };
  for (const k of Object.keys(stats)) if (THEMES.some((x) => x.key === k)) delete stats[k];
  for (const a of affixes) if (a.id !== 'divine') stats[a.id] = parseInt(a.text.slice(1), 10);
  return { ...item, name, rarity, theme, affixes, stats, infused: [...(item.infused ?? []), kind] };
}
