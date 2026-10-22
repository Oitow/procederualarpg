import { describe, expect, it } from 'vitest';
import { buildCage } from '../src/character/cage';
import { PRESETS, makeParams, resolveParams } from '../src/character/params';
import { analyzeTopology } from '../src/character/polymesh';
import { BONE_COUNT, buildRig } from '../src/character/rig';
import { subdivide } from '../src/character/subdivision';

function cageFor(input = {}) {
  const params = resolveParams(makeParams(input));
  const rig = buildRig(params);
  return { rig, cage: buildCage(rig, params) };
}

describe('body cage', () => {
  it('is a closed, consistently wound genus-0 quad mesh', () => {
    const { cage } = cageFor();
    const topo = analyzeTopology(cage.mesh);
    expect(topo.boundaryEdges).toBe(0);
    expect(topo.nonManifoldEdges).toBe(0);
    expect(topo.flippedEdges).toBe(0);
    expect(topo.eulerCharacteristic).toBe(2);
    expect(topo.vertices).toBe(cage.mesh.vertexCount);
    // all quads, except the pentagons where the head ring resolution doubles
    let pentagons = 0;
    for (let f = 0; f < cage.mesh.faceCount; f++) {
      const n = cage.mesh.faceSize(f);
      expect([4, 5]).toContain(n);
      if (n === 5) pentagons++;
    }
    expect(pentagons).toBe(8);
  });

  it('stays valid for every preset and many random seeds', () => {
    const inputs = [
      ...Object.values(PRESETS),
      ...Array.from({ length: 25 }, (_, i) => ({ seed: i * 101 + 3, variation: 1 })),
    ];
    for (const input of inputs) {
      const { cage } = cageFor(input);
      const topo = analyzeTopology(subdivide(cage.mesh, 1));
      expect(topo.boundaryEdges).toBe(0);
      expect(topo.flippedEdges).toBe(0);
      expect(topo.eulerCharacteristic).toBe(2);
    }
  });

  it('has normalised, non-negative skin weights', () => {
    const { cage } = cageFor();
    const m = cage.mesh;
    for (let v = 0; v < m.vertexCount; v++) {
      let sum = 0;
      for (let b = 0; b < BONE_COUNT; b++) {
        const w = m.data[v * m.stride + 3 + b];
        expect(w).toBeGreaterThanOrEqual(0);
        sum += w;
      }
      expect(sum).toBeCloseTo(1, 6);
    }
  });

  it('is left/right symmetric without variation', () => {
    const { cage } = cageFor({ variation: 0 });
    const m = cage.mesh;
    const pts: number[][] = [];
    for (let v = 0; v < m.vertexCount; v++) pts.push([m.data[v * m.stride], m.data[v * m.stride + 1], m.data[v * m.stride + 2]]);
    for (const p of pts) {
      let best = Infinity;
      for (const q of pts) best = Math.min(best, Math.hypot(p[0] + q[0], p[1] - q[1], p[2] - q[2]));
      expect(best).toBeLessThan(1e-9);
    }
  });

  it('matches the requested height and keeps feet on the ground', () => {
    for (const height of [1.2, 1.8, 2.3]) {
      const { cage } = cageFor({ height });
      const m = cage.mesh;
      let minY = Infinity;
      let maxY = -Infinity;
      for (let v = 0; v < m.vertexCount; v++) {
        minY = Math.min(minY, m.data[v * m.stride + 1]);
        maxY = Math.max(maxY, m.data[v * m.stride + 1]);
      }
      expect(maxY).toBeCloseTo(height, 1);
      expect(Math.abs(minY)).toBeLessThan(0.01 * height);
    }
  });
});

