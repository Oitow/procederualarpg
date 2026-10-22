import { describe, expect, it } from 'vitest';
import { PolyMesh, analyzeTopology } from '../src/character/polymesh';
import { fitCageToLimit, subdivide } from '../src/character/subdivision';

function cube(stride = 3): PolyMesh {
  const p = [
    [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
    [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1],
  ];
  const data: number[] = [];
  p.forEach((v, i) => {
    data.push(...v);
    for (let c = 3; c < stride; c++) data.push(c === 3 ? (i < 4 ? 1 : 0) : 0);
  });
  const faces = [
    [0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4],
    [2, 3, 7, 6], [1, 2, 6, 5], [0, 4, 7, 3],
  ];
  return PolyMesh.fromFaces(stride, data, faces);
}

describe('Catmull-Clark subdivision', () => {
  it('produces the expected counts and keeps a closed surface', () => {
    const l1 = subdivide(cube(), 1);
    expect(l1.faceCount).toBe(24);
    expect(l1.vertexCount).toBe(26);
    const l2 = subdivide(cube(), 2);
    expect(l2.faceCount).toBe(96);
    const t = analyzeTopology(l2);
    expect(t.boundaryEdges).toBe(0);
    expect(t.flippedEdges).toBe(0);
    expect(t.eulerCharacteristic).toBe(2);
  });

  it('shrinks a smooth cube toward a sphere-like shape', () => {
    const m = subdivide(cube(), 3);
    // original corner vertex 0 keeps its index and moves inward
    const r = Math.hypot(m.data[0], m.data[1], m.data[2]);
    expect(r).toBeLessThan(Math.sqrt(3) * 0.75);
    expect(r).toBeGreaterThan(0.8);
  });

  it('keeps fully creased edges sharp', () => {
    const c = cube();
    const edges = new Set<string>();
    for (let f = 0; f < c.faceCount; f++) {
      const face = c.face(f);
      face.forEach((a, i) => {
        const b = face[(i + 1) % 4];
        edges.add(a < b ? `${a},${b}` : `${b},${a}`);
      });
    }
    c.creases = [...edges].map((e) => {
      const [a, b] = e.split(',').map(Number);
      return { a, b, sharpness: 10 };
    });
    const m = subdivide(c, 2);
    for (let v = 0; v < 8; v++) {
      for (let k = 0; k < 3; k++) expect(Math.abs(m.data[v * 3 + k])).toBeCloseTo(1, 9);
    }
  });

  it('interpolates extra channels with the same stencils (partition of unity)', () => {
    const c = cube(5);
    for (let v = 0; v < 8; v++) c.data[v * 5 + 4] = 1 - c.data[v * 5 + 3];
    const m = subdivide(c, 2);
    for (let v = 0; v < m.vertexCount; v++) {
      expect(m.data[v * 5 + 3] + m.data[v * 5 + 4]).toBeCloseTo(1, 9);
      expect(m.data[v * 5 + 3]).toBeGreaterThanOrEqual(0);
    }
  });

  it('handles open meshes with the boundary rule', () => {
    const quad = PolyMesh.fromFaces(3, [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0], [[0, 1, 2, 3]]);
    const m = subdivide(quad, 2);
    expect(analyzeTopology(m).boundaryEdges).toBe(16);
    for (let v = 0; v < m.vertexCount; v++) expect(m.data[v * 3 + 2]).toBe(0);
  });

  it('fitting moves the limit surface onto the original cage points', () => {
    const c = cube();
    const error = (m: PolyMesh) => {
      const limit = subdivide(m, 3);
      let e = 0;
      for (let v = 0; v < 8; v++)
        e = Math.max(e, Math.hypot(limit.data[v * 3] - c.data[v * 3], limit.data[v * 3 + 1] - c.data[v * 3 + 1], limit.data[v * 3 + 2] - c.data[v * 3 + 2]));
      return e;
    };
    const raw = error(c);
    const fitted = error(fitCageToLimit(c, 4, 1));
    expect(fitted).toBeLessThan(raw * 0.2);
  });
});
