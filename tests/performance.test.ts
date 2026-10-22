import { describe, expect, it } from 'vitest';
import { generateCharacterData } from '../src/character/generator';
import { OUTFITS } from '../src/character/layers';
import { makeParams } from '../src/character/params';

describe('performance budget', () => {
  it('generates a fully equipped character quickly and with a real-time triangle budget', () => {
    const params = makeParams();
    generateCharacterData(params, { layers: OUTFITS.Knight }); // warm-up
    const t0 = performance.now();
    const runs = 5;
    let tris = 0;
    for (let i = 0; i < runs; i++) {
      const d = generateCharacterData({ ...params, seed: i }, { layers: OUTFITS.Knight });
      tris = d.stats.bodyTriangles + d.stats.layerTriangles;
    }
    const ms = (performance.now() - t0) / runs;
    console.log(`knight @ level 2: ${ms.toFixed(1)} ms, ${tris} triangles`);
    expect(ms).toBeLessThan(500);
    expect(tris).toBeLessThan(80000);

    const lod1 = generateCharacterData(params, { layers: OUTFITS.Knight, subdivisions: 1 });
    expect(lod1.stats.bodyTriangles + lod1.stats.layerTriangles).toBeLessThan(20000);
  });
});
