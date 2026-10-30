/**
 * Procedural items – PUBLIC CONTRACT used by the game.
 * Keep these exports and signatures stable; implementation may grow.
 */
import { Group, Object3D } from 'three';
import type { LayerDef } from '../character/layers';

export type ItemSlot = 'head' | 'chest' | 'shoulders' | 'hands' | 'arms' | 'waist' | 'legs' | 'feet' | 'weapon';
export const ITEM_SLOTS: ItemSlot[] = ['head', 'chest', 'shoulders', 'hands', 'arms', 'waist', 'legs', 'feet', 'weapon'];

/** Quality tiers, worst to best. 'broken' items look damaged (holes, cracks, rust). */
export type Rarity = 'broken' | 'common' | 'magic' | 'rare' | 'legendary' | 'divine';

export interface Affix {
  id: string;
  text: string; // e.g. "+12% Fire Damage"
}

export interface Item {
  id: string;
  seed: number;
  name: string; // e.g. "Divine Sword of Hell", "Broken Helm"
  slot: ItemSlot;
  rarity: Rarity;
  level: number;
  baseType: string; // e.g. "Sword", "Helm"
  affixes: Affix[];
  stats: Record<string, number>; // e.g. { damageMin, damageMax, armor }
}

export function generateItem(seed: number, opts: { slot?: ItemSlot; rarity?: Rarity; level?: number } = {}): Item {
  const slot = opts.slot ?? 'weapon';
  return {
    id: `item-${seed}`,
    seed,
    name: slot === 'weapon' ? 'Sword' : 'Helm',
    slot,
    rarity: opts.rarity ?? 'common',
    level: opts.level ?? 1,
    baseType: slot === 'weapon' ? 'Sword' : 'Helm',
    affixes: [],
    stats: {},
  };
}

/** Armour/clothing → layer definitions for buildCharacter (empty for weapons). */
export function itemToLayers(_item: Item): LayerDef[] {
  return [];
}

/**
 * Weapon mesh. Origin = centre of the grip, blade/head points along +Y,
 * edge/flat faces ±X. May set `userData.update(dt: number)` for animated effects (flames).
 */
export function buildWeaponMesh(_item: Item): Object3D {
  return new Group();
}

export const RARITY_COLORS: Record<Rarity, string> = {
  broken: '#7a7a7a',
  common: '#d9d4c7',
  magic: '#6f8cff',
  rare: '#e6d36a',
  legendary: '#e08a2e',
  divine: '#ff4a3a',
};
