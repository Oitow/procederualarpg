export type ItemSlot = 'head' | 'chest' | 'shoulders' | 'hands' | 'arms' | 'waist' | 'legs' | 'feet' | 'weapon';
export const ITEM_SLOTS: ItemSlot[] = ['head', 'chest', 'shoulders', 'hands', 'arms', 'waist', 'legs', 'feet', 'weapon'];

/** Quality tiers, worst to best. 'broken' items look damaged (holes, cracks, rust). */
export type Rarity = 'broken' | 'common' | 'magic' | 'rare' | 'legendary' | 'divine';

export interface Affix {
  id: string;
  text: string; // e.g. "+12% Fire Damage"
}

export type ItemMaterial = 'iron' | 'steel' | 'gold' | 'rust' | 'obsidian' | 'leather' | 'cloth';
export type ItemElement = 'fire' | 'frost' | 'hell' | 'shadow';

/** Visual theme; always derived from the name so visuals follow it. */
export interface ItemTheme {
  material: ItemMaterial;
  element?: ItemElement;
  broken?: boolean;
  /** 0..1 glow strength (divine ~1). */
  glow?: number;
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
  theme?: ItemTheme;
  /** Dye colour (hex) for cloth / leather parts; set via the inventory. */
  dye?: string;
  /** Essences this item has been infused with (oldest first). */
  infused?: string[];
}
