import { describe, expect, it } from 'vitest';
import { buildCage } from '../src/character/cage';
import { buildLayerShells } from '../src/character/layers';
import { makeParams, resolveParams } from '../src/character/params';
import { analyzeTopology } from '../src/character/polymesh';
import { buildRig } from '../src/character/rig';
import { ITEM_SLOTS, buildWeaponMesh, generateItem, itemToLayers } from '../src/items';

describe('procedural items', () => {
  it('is deterministic', () => {
    for (let s = 1; s < 30; s++) expect(generateItem(s, { slot: ITEM_SLOTS[s % 9] })).toEqual(generateItem(s, { slot: ITEM_SLOTS[s % 9] }));
  });

  it('names follow rarity and visuals follow names', () => {
    const broken = generateItem(5, { rarity: 'broken', slot: 'head' });
    expect(broken.name).toMatch(/^Broken /);
    expect(broken.theme?.broken).toBe(true);
    const divine = generateItem(6, { rarity: 'divine', slot: 'weapon' });
    expect(divine.name).toMatch(/^Divine \w+ of /);
    expect(divine.theme?.material).toBe('gold');
    expect(divine.theme?.glow).toBe(1);
    let fire = 0;
    for (let s = 0; s < 200; s++) {
      const m = generateItem(s, { rarity: 'magic' });
      if (m.name.includes('Flaming')) { fire++; expect(m.theme?.element).toBe('fire'); }
      if (m.name.includes('of Hell')) expect(m.theme?.element).toBe('hell');
    }
    expect(fire).toBeGreaterThan(0);
  });

  it('armour layers are closed shells, also when broken', () => {
    const params = resolveParams(makeParams());
    const rig = buildRig(params);
    const cage = buildCage(rig, params);
    for (const slot of ITEM_SLOTS.filter((s) => s !== 'weapon')) {
      for (let s = 0; s < 12; s++) {
        const item = generateItem(s * 7 + 1, { slot, rarity: s % 3 === 0 ? 'broken' : undefined });
        const layers = itemToLayers(item);
        expect(layers).toHaveLength(1);
        const { shells } = buildLayerShells(cage, layers, rig.scale);
        const t = analyzeTopology(shells[0].mesh);
        expect(t.boundaryEdges, item.name).toBe(0);
        expect(t.nonManifoldEdges, item.name).toBe(0);
      }
    }
  });

  it('weapon meshes have geometry', () => {
    for (let s = 0; s < 40; s++) {
      const w = buildWeaponMesh(generateItem(s, { slot: 'weapon' }));
      let tris = 0;
      w.traverse((o: any) => { if (o.geometry && o.isMesh) tris += o.geometry.attributes.position.count / 3; });
      expect(tris).toBeGreaterThan(20);
      expect(tris).toBeLessThan(1500);
      (w.userData.update as (dt: number) => void)(0.016);
    }
  });
});
