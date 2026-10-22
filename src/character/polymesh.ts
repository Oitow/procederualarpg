/**
 * Minimal polygon mesh used by the generator.
 *
 * Each vertex stores `stride` floats: xyz followed by arbitrary channels
 * (here: one skin weight per bone). Subdivision interpolates *all* channels
 * with the same stencils as the positions, so skin weights stay smooth on
 * the refined surface for free.
 */

export interface Crease {
  a: number;
  b: number;
  /** Integer sharpness: number of subdivision levels the edge stays sharp. */
  sharpness: number;
}

export class PolyMesh {
  constructor(
    public readonly stride: number,
    public data: Float64Array,
    public faceVerts: Int32Array,
    public faceOffsets: Int32Array,
    public faceTags: Int32Array,
    public creases: Crease[] = [],
  ) {}

  get vertexCount(): number {
    return this.data.length / this.stride;
  }

  get faceCount(): number {
    return this.faceOffsets.length - 1;
  }

  faceSize(f: number): number {
    return this.faceOffsets[f + 1] - this.faceOffsets[f];
  }

  face(f: number): number[] {
    return Array.from(this.faceVerts.subarray(this.faceOffsets[f], this.faceOffsets[f + 1]));
  }

  clone(): PolyMesh {
    return new PolyMesh(
      this.stride,
      this.data.slice(),
      this.faceVerts.slice(),
      this.faceOffsets.slice(),
      this.faceTags.slice(),
      this.creases.map((c) => ({ ...c })),
    );
  }

  static fromFaces(stride: number, data: ArrayLike<number>, faces: number[][], tags?: ArrayLike<number>, creases: Crease[] = []): PolyMesh {
    const offsets = new Int32Array(faces.length + 1);
    let n = 0;
    faces.forEach((f, i) => {
      offsets[i] = n;
      n += f.length;
    });
    offsets[faces.length] = n;
    const verts = new Int32Array(n);
    let k = 0;
    for (const f of faces) for (const v of f) verts[k++] = v;
    const faceTags = new Int32Array(faces.length);
    if (tags) for (let i = 0; i < faces.length; i++) faceTags[i] = tags[i];
    return new PolyMesh(stride, Float64Array.from(data), verts, offsets, faceTags, creases);
  }
}

export function edgeKey(a: number, b: number, n: number): number {
  return a < b ? a * n + b : b * n + a;
}

/** Area-weighted vertex normals (Newell polygon normals). */
export function computeVertexNormals(mesh: PolyMesh): Float64Array {
  const { data, stride, faceVerts, faceOffsets } = mesh;
  const normals = new Float64Array(mesh.vertexCount * 3);
  for (let f = 0; f < mesh.faceCount; f++) {
    const s = faceOffsets[f];
    const e = faceOffsets[f + 1];
    let nx = 0;
    let ny = 0;
    let nz = 0;
    for (let i = s; i < e; i++) {
      const a = faceVerts[i] * stride;
      const b = faceVerts[i + 1 < e ? i + 1 : s] * stride;
      nx += (data[a + 1] - data[b + 1]) * (data[a + 2] + data[b + 2]);
      ny += (data[a + 2] - data[b + 2]) * (data[a] + data[b]);
      nz += (data[a] - data[b]) * (data[a + 1] + data[b + 1]);
    }
    for (let i = s; i < e; i++) {
      const v = faceVerts[i] * 3;
      normals[v] += nx;
      normals[v + 1] += ny;
      normals[v + 2] += nz;
    }
  }
  for (let v = 0; v < normals.length; v += 3) {
    const l = Math.hypot(normals[v], normals[v + 1], normals[v + 2]) || 1;
    normals[v] /= l;
    normals[v + 1] /= l;
    normals[v + 2] /= l;
  }
  return normals;
}

export function faceNormal(mesh: PolyMesh, f: number): [number, number, number] {
  const { data, stride, faceVerts, faceOffsets } = mesh;
  const s = faceOffsets[f];
  const e = faceOffsets[f + 1];
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = s; i < e; i++) {
    const a = faceVerts[i] * stride;
    const b = faceVerts[i + 1 < e ? i + 1 : s] * stride;
    nx += (data[a + 1] - data[b + 1]) * (data[a + 2] + data[b + 2]);
    ny += (data[a + 2] - data[b + 2]) * (data[a] + data[b]);
    nz += (data[a] - data[b]) * (data[a + 1] + data[b + 1]);
  }
  const l = Math.hypot(nx, ny, nz) || 1;
  return [nx / l, ny / l, nz / l];
}

export function faceCenter(mesh: PolyMesh, f: number): [number, number, number] {
  const { data, stride, faceVerts, faceOffsets } = mesh;
  const s = faceOffsets[f];
  const e = faceOffsets[f + 1];
  const c: [number, number, number] = [0, 0, 0];
  for (let i = s; i < e; i++) {
    const v = faceVerts[i] * stride;
    c[0] += data[v];
    c[1] += data[v + 1];
    c[2] += data[v + 2];
  }
  const n = e - s;
  return [c[0] / n, c[1] / n, c[2] / n];
}

/** Keep only faces where keep[f] is true, dropping unused vertices. */
export function filterFaces(mesh: PolyMesh, keep: ArrayLike<boolean | number>): PolyMesh {
  const remap = new Int32Array(mesh.vertexCount).fill(-1);
  const faces: number[][] = [];
  const tags: number[] = [];
  let next = 0;
  for (let f = 0; f < mesh.faceCount; f++) {
    if (!keep[f]) continue;
    const face = mesh.face(f).map((v) => {
      if (remap[v] < 0) remap[v] = next++;
      return remap[v];
    });
    faces.push(face);
    tags.push(mesh.faceTags[f]);
  }
  const data = new Float64Array(next * mesh.stride);
  for (let v = 0; v < mesh.vertexCount; v++) {
    if (remap[v] < 0) continue;
    data.set(mesh.data.subarray(v * mesh.stride, (v + 1) * mesh.stride), remap[v] * mesh.stride);
  }
  const creases = mesh.creases
    .filter((c) => remap[c.a] >= 0 && remap[c.b] >= 0)
    .map((c) => ({ a: remap[c.a], b: remap[c.b], sharpness: c.sharpness }));
  return PolyMesh.fromFaces(mesh.stride, data, faces, tags, creases);
}

export interface TopologyReport {
  vertices: number;
  edges: number;
  faces: number;
  boundaryEdges: number;
  nonManifoldEdges: number;
  /** Directed edges used twice: inconsistent winding. */
  flippedEdges: number;
  eulerCharacteristic: number;
}

export function analyzeTopology(mesh: PolyMesh): TopologyReport {
  const n = mesh.vertexCount;
  const undirected = new Map<number, number>();
  const directed = new Set<string>();
  let flipped = 0;
  for (let f = 0; f < mesh.faceCount; f++) {
    const face = mesh.face(f);
    for (let i = 0; i < face.length; i++) {
      const a = face[i];
      const b = face[(i + 1) % face.length];
      const k = edgeKey(a, b, n);
      undirected.set(k, (undirected.get(k) ?? 0) + 1);
      const d = `${a},${b}`;
      if (directed.has(d)) flipped++;
      directed.add(d);
    }
  }
  let boundary = 0;
  let nonManifold = 0;
  for (const c of undirected.values()) {
    if (c === 1) boundary++;
    else if (c > 2) nonManifold++;
  }
  const used = new Set<number>(mesh.faceVerts);
  return {
    vertices: used.size,
    edges: undirected.size,
    faces: mesh.faceCount,
    boundaryEdges: boundary,
    nonManifoldEdges: nonManifold,
    flippedEdges: flipped,
    eulerCharacteristic: used.size - undirected.size + mesh.faceCount,
  };
}
