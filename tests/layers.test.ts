import { describe, expect, it } from 'vitest';
import { buildCage } from '../src/character/cage';
import { generateCharacterData } from '../src/character/generator';
import { LAYER_LIBRARY, OUTFITS, buildLayerShells } from '../src/character/layers';
import { makeParams, resolveParams } from '../src/character/params';
import { analyzeTopology } from '../src/character/polymesh';
import { BONE_COUNT, buildRig } from '../src/character/rig';

function setup() {
  const params = resolveParams(makeParams());
  const rig = buildRig(params);
  return { params, rig, cage: buildCage(rig, params) };
}

describe('clothing & armour layers', () => {
  it('every library layer covers something and is a closed solid shell', () => {
    const { rig, cage } = setup();
    for (const def of Object.values(LAYER_LIBRARY)) {
      const { shells } = buildLayerShells(cage, [def], rig.scale);
      expect(shells, def.id).toHaveLength(1);
      const t = analyzeTopology(shells[0].mesh);
      expect(t.boundaryEdges, def.id).toBe(0);
      expect(t.flippedEdges, def.id).toBe(0);
      expect(t.nonManifoldEdges, def.id).toBe(0);
    }
  });

  it('stacks layers outward and hides covered body faces', () => {
    const { rig, cage } = setup();
    const res = buildLayerShells(cage, ['tunic', 'breastplate'].map((id) => LAYER_LIBRARY[id]), rig.scale);
    expect(res.bodyFaceHidden.reduce((a, b) => a + b, 0)).toBeGreaterThan(20);
    const [tunic, plate] = res.shells;
    // a vertex shared by both selections: the plate must be further out than the tunic
    const center = (m: typeof tunic.mesh) => {
      let maxZ = -Infinity;
      for (let v = 0; v < m.vertexCount; v++) maxZ = Math.max(maxZ, m.data[v * m.stride + 2]);
      return maxZ;
    };
    expect(center(plate.mesh)).toBeGreaterThan(center(tunic.mesh));
  });

  it('rigid pieces get uniform weights, soft cloth keeps the body weights', () => {
    const { rig, cage } = setup();
    const { shells } = buildLayerShells(cage, [LAYER_LIBRARY.helmet, LAYER_LIBRARY.trousers], rig.scale);
    const helmet = shells.find((s) => s.def.id === 'helmet')!.mesh;
    const w0 = helmet.data.subarray(3, 3 + BONE_COUNT);
    for (let v = 1; v < helmet.vertexCount; v++) {
      for (let b = 0; b < BONE_COUNT; b++) expect(helmet.data[v * helmet.stride + 3 + b]).toBeCloseTo(w0[b], 9);
    }
    const trousers = shells.find((s) => s.def.id === 'trousers')!.mesh;
    let distinct = 0;
    for (let v = 1; v < trousers.vertexCount; v++)
      if (Math.abs(trousers.data[v * trousers.stride + 3 + 1] - trousers.data[3 + 1]) > 0.1) distinct++;
    expect(distinct).toBeGreaterThan(0);
  });

  it('generates every outfit end-to-end', () => {
    for (const [name, layers] of Object.entries(OUTFITS)) {
      const data = generateCharacterData(makeParams({ detail: { subdivisions: 1 } }), { layers });
      expect(data.layers.length, name).toBe(layers.length);
      expect(data.stats.bodyTriangles).toBeGreaterThan(0);
    }
  });
});
