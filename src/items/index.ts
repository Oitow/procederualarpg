/**
 * Procedural items – PUBLIC CONTRACT used by the game.
 * Keep these exports and signatures stable; implementation may grow.
 */
export type { Item, ItemSlot, Rarity, Affix, ItemTheme, ItemMaterial, ItemElement } from './types';
export { ITEM_SLOTS } from './types';
export { generateItem } from './generate';
export { itemToLayers } from './armor';
export { buildWeaponMesh } from './weapons';
import type { Rarity } from './types';

export const RARITY_COLORS: Record<Rarity, string> = {
  broken: '#7a7a7a',
  common: '#d9d4c7',
  magic: '#6f8cff',
  rare: '#e6d36a',
  legendary: '#e08a2e',
  divine: '#ff4a3a',
};
