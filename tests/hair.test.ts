import { describe, expect, it } from 'vitest';
import { generateCharacterData, makeParams } from '../src/character';
import { BEARD_STYLES, HAIR_STYLES, hairLayers } from '../src/character/hair';
import { decodeBloodline, encodeBloodline } from '../src/game/creator';

describe('hair', () => {
  it('every style and beard generates geometry', () => {
    const p = makeParams({ detail: { subdivisions: 1 } });
    for (const h of HAIR_STYLES) for (const b of BEARD_STYLES) {
      const d = generateCharacterData(p, { layers: hairLayers(h, '#442211', 3, b) });
      expect(d.layers.length).toBe(hairLayers(h, '#442211', 3, b).length);
    }
  });
  it('bloodline roundtrips', () => {
    const s = { preset: 4, skin: 9, hair: 5, hcol: 7, beard: 3, seed: 40000, sl: [1, 15, 7, 0, 8, 12] };
    expect(decodeBloodline(encodeBloodline(s))).toEqual(s);
  });
});
