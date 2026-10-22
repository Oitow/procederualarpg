import { Crease, PolyMesh, edgeKey } from './polymesh';

/**
 * Catmull-Clark subdivision with
 *  - arbitrary n-gons on input (output is all quads),
 *  - open boundaries (boundary edges are treated as infinitely sharp),
 *  - integer semi-sharp creases (sharpness decreases by one per level),
 *  - interpolation of every per-vertex channel (skin weights etc.).
 *
 * Face tags are inherited by child faces.
 */
export function subdivide(mesh: PolyMesh, levels = 1): PolyMesh {
  let m = mesh;
  for (let i = 0; i < levels; i++) m = subdivideOnce(m);
  return m;
}

export function subdivideOnce(mesh: PolyMesh): PolyMesh {
  const S = mesh.stride;
  const V = mesh.vertexCount;
  const F = mesh.faceCount;
  const { data, faceVerts, faceOffsets } = mesh;

  // ---- edges -------------------------------------------------------------
  const edgeIndex = new Map<number, number>();
  const ev0: number[] = [];
  const ev1: number[] = [];
  const ef0: number[] = [];
  const ef1: number[] = [];
  const efCount: number[] = [];
  const faceEdges = new Int32Array(faceVerts.length);
  for (let f = 0; f < F; f++) {
    const s = faceOffsets[f];
    const e = faceOffsets[f + 1];
    for (let i = s; i < e; i++) {
      const a = faceVerts[i];
      const b = faceVerts[i + 1 < e ? i + 1 : s];
      const key = edgeKey(a, b, V);
      let ei = edgeIndex.get(key);
      if (ei === undefined) {
        ei = ev0.length;
        edgeIndex.set(key, ei);
        ev0.push(a);
        ev1.push(b);
        ef0.push(f);
        ef1.push(-1);
        efCount.push(1);
      } else {
        if (efCount[ei] === 1) ef1[ei] = f;
        efCount[ei]++;
      }
      faceEdges[i] = ei;
    }
  }
  const E = ev0.length;
  const sharp = new Int32Array(E);
  for (const c of mesh.creases) {
    const ei = edgeIndex.get(edgeKey(c.a, c.b, V));
    if (ei !== undefined) sharp[ei] = Math.max(sharp[ei], c.sharpness);
  }
  const isSharp = (ei: number) => efCount[ei] !== 2 || sharp[ei] > 0;

  const outV = V + E + F;
  const out = new Float64Array(outV * S);
  const fpBase = V + E;

  // ---- face points -------------------------------------------------------
  for (let f = 0; f < F; f++) {
    const s = faceOffsets[f];
    const e = faceOffsets[f + 1];
    const o = (fpBase + f) * S;
    const inv = 1 / (e - s);
    for (let i = s; i < e; i++) {
      const v = faceVerts[i] * S;
      for (let c = 0; c < S; c++) out[o + c] += data[v + c] * inv;
    }
  }

  // ---- edge points -------------------------------------------------------
  for (let ei = 0; ei < E; ei++) {
    const o = (V + ei) * S;
    const a = ev0[ei] * S;
    const b = ev1[ei] * S;
    if (isSharp(ei)) {
      for (let c = 0; c < S; c++) out[o + c] = (data[a + c] + data[b + c]) * 0.5;
    } else {
      const f0 = (fpBase + ef0[ei]) * S;
      const f1 = (fpBase + ef1[ei]) * S;
      for (let c = 0; c < S; c++) out[o + c] = (data[a + c] + data[b + c] + out[f0 + c] + out[f1 + c]) * 0.25;
    }
  }

  // ---- vertex points -----------------------------------------------------
  const faceSum = new Float64Array(V * S);
  const faceCount = new Int32Array(V);
  for (let f = 0; f < F; f++) {
    const fo = (fpBase + f) * S;
    for (let i = faceOffsets[f]; i < faceOffsets[f + 1]; i++) {
      const v = faceVerts[i];
      faceCount[v]++;
      const o = v * S;
      for (let c = 0; c < S; c++) faceSum[o + c] += out[fo + c];
    }
  }
  const midSum = new Float64Array(V * S);
  const valence = new Int32Array(V);
  const sharpCount = new Int32Array(V);
  const sharpA = new Int32Array(V).fill(-1);
  const sharpB = new Int32Array(V).fill(-1);
  for (let ei = 0; ei < E; ei++) {
    const a = ev0[ei];
    const b = ev1[ei];
    valence[a]++;
    valence[b]++;
    const ao = a * S;
    const bo = b * S;
    for (let c = 0; c < S; c++) {
      const mid = (data[ao + c] + data[bo + c]) * 0.5;
      midSum[ao + c] += mid;
      midSum[bo + c] += mid;
    }
    if (isSharp(ei)) {
      for (const [v, other] of [
        [a, b],
        [b, a],
      ]) {
        if (sharpCount[v] === 0) sharpA[v] = other;
        else if (sharpCount[v] === 1) sharpB[v] = other;
        sharpCount[v]++;
      }
    }
  }
  for (let v = 0; v < V; v++) {
    const o = v * S;
    const n = valence[v];
    if (n === 0) {
      for (let c = 0; c < S; c++) out[o + c] = data[o + c];
      continue;
    }
    if (sharpCount[v] > 2) {
      // corner
      for (let c = 0; c < S; c++) out[o + c] = data[o + c];
    } else if (sharpCount[v] === 2) {
      // crease / boundary rule
      const a = sharpA[v] * S;
      const b = sharpB[v] * S;
      for (let c = 0; c < S; c++) out[o + c] = (data[a + c] + data[b + c] + 6 * data[o + c]) * 0.125;
    } else {
      // smooth (and dart) rule
      const k = faceCount[v];
      const invN = 1 / n;
      for (let c = 0; c < S; c++) {
        const Q = faceSum[o + c] / k;
        const R = midSum[o + c] * invN;
        out[o + c] = (Q + 2 * R + (n - 3) * data[o + c]) * invN;
      }
    }
  }

  // ---- faces -------------------------------------------------------------
  const quadCount = faceVerts.length;
  const newVerts = new Int32Array(quadCount * 4);
  const newOffsets = new Int32Array(quadCount + 1);
  const newTags = new Int32Array(quadCount);
  let q = 0;
  for (let f = 0; f < F; f++) {
    const s = faceOffsets[f];
    const e = faceOffsets[f + 1];
    const n = e - s;
    for (let i = 0; i < n; i++) {
      const v = faceVerts[s + i];
      const eNext = faceEdges[s + i];
      const ePrev = faceEdges[s + ((i + n - 1) % n)];
      const o = q * 4;
      newVerts[o] = v;
      newVerts[o + 1] = V + eNext;
      newVerts[o + 2] = fpBase + f;
      newVerts[o + 3] = V + ePrev;
      newOffsets[q] = o;
      newTags[q] = mesh.faceTags[f];
      q++;
    }
  }
  newOffsets[quadCount] = quadCount * 4;

  // ---- creases for next level -------------------------------------------
  const creases: Crease[] = [];
  for (let ei = 0; ei < E; ei++) {
    const sh = sharp[ei] - 1;
    if (sh <= 0) continue;
    creases.push({ a: ev0[ei], b: V + ei, sharpness: sh });
    creases.push({ a: V + ei, b: ev1[ei], sharpness: sh });
  }

  return new PolyMesh(S, out, newVerts, newOffsets, newTags, creases);
}

/**
 * Pre-compensate the shrinkage of Catmull-Clark: iteratively move the cage
 * vertices so that the (approximate) limit surface passes through the
 * original, artist-designed cage positions. Only positions are changed.
 *
 * Vertex points keep their index through subdivision, so after `probeLevels`
 * levels vertex v is a good approximation of v's limit position.
 */
export function fitCageToLimit(mesh: PolyMesh, iterations = 3, strength = 0.9, probeLevels = 2): PolyMesh {
  const V = mesh.vertexCount;
  const S = mesh.stride;
  const target = new Float64Array(V * 3);
  const pos = new Float64Array(V * 3);
  for (let v = 0; v < V; v++)
    for (let c = 0; c < 3; c++) {
      target[v * 3 + c] = mesh.data[v * S + c];
      pos[v * 3 + c] = mesh.data[v * S + c];
    }
  const probe = new PolyMesh(3, pos, mesh.faceVerts, mesh.faceOffsets, mesh.faceTags, mesh.creases);
  for (let it = 0; it < iterations; it++) {
    const limit = subdivide(probe, probeLevels).data;
    for (let i = 0; i < V * 3; i++) pos[i] += (target[i] - limit[i]) * strength;
  }
  const out = mesh.clone();
  for (let v = 0; v < V; v++) for (let c = 0; c < 3; c++) out.data[v * S + c] = pos[v * 3 + c];
  return out;
}
