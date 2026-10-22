import { BufferAttribute, BufferGeometry } from 'three';
import { PolyMesh, computeVertexNormals } from './polymesh';
import { BONE_COUNT } from './rig';

/**
 * Convert a PolyMesh (xyz + one weight per bone) into an indexed, skinned
 * BufferGeometry: 4 influences per vertex, quads split along the shorter diagonal.
 */
export function toSkinnedGeometry(mesh: PolyMesh, normals = computeVertexNormals(mesh)): BufferGeometry {
  const V = mesh.vertexCount;
  const S = mesh.stride;
  const position = new Float32Array(V * 3);
  const normal = new Float32Array(V * 3);
  const skinIndex = new Uint16Array(V * 4);
  const skinWeight = new Float32Array(V * 4);
  const region = new Float32Array(V);
  const top = [0, 0, 0, 0];
  const topW = [0, 0, 0, 0];

  for (let v = 0; v < V; v++) {
    const o = v * S;
    position[v * 3] = mesh.data[o];
    position[v * 3 + 1] = mesh.data[o + 1];
    position[v * 3 + 2] = mesh.data[o + 2];
    normal[v * 3] = normals[v * 3];
    normal[v * 3 + 1] = normals[v * 3 + 1];
    normal[v * 3 + 2] = normals[v * 3 + 2];

    // top-4 influences
    topW.fill(-1);
    top.fill(0);
    for (let b = 0; b < BONE_COUNT && b < S - 3; b++) {
      const w = mesh.data[o + 3 + b];
      if (w <= topW[3]) continue;
      let k = 3;
      while (k > 0 && w > topW[k - 1]) {
        topW[k] = topW[k - 1];
        top[k] = top[k - 1];
        k--;
      }
      topW[k] = w;
      top[k] = b;
    }
    let sum = 0;
    for (let k = 0; k < 4; k++) sum += Math.max(0, topW[k]);
    for (let k = 0; k < 4; k++) {
      skinIndex[v * 4 + k] = top[k];
      skinWeight[v * 4 + k] = sum > 0 ? Math.max(0, topW[k]) / sum : k === 0 ? 1 : 0;
    }
  }

  let triCount = 0;
  for (let f = 0; f < mesh.faceCount; f++) triCount += mesh.faceSize(f) - 2;
  const index = V > 65535 ? new Uint32Array(triCount * 3) : new Uint16Array(triCount * 3);
  let t = 0;
  const d2 = (a: number, b: number) => {
    const ao = a * S;
    const bo = b * S;
    const x = mesh.data[ao] - mesh.data[bo];
    const y = mesh.data[ao + 1] - mesh.data[bo + 1];
    const z = mesh.data[ao + 2] - mesh.data[bo + 2];
    return x * x + y * y + z * z;
  };
  for (let f = 0; f < mesh.faceCount; f++) {
    const face = mesh.face(f);
    for (const v of face) region[v] = mesh.faceTags[f];
    if (face.length === 4) {
      const [a, b, c, d] = face;
      if (d2(a, c) <= d2(b, d)) {
        index.set([a, b, c, a, c, d], t);
      } else {
        index.set([a, b, d, b, c, d], t);
      }
      t += 6;
    } else {
      for (let k = 1; k < face.length - 1; k++) {
        index.set([face[0], face[k], face[k + 1]], t);
        t += 3;
      }
    }
  }

  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(position, 3));
  g.setAttribute('normal', new BufferAttribute(normal, 3));
  g.setAttribute('skinIndex', new BufferAttribute(skinIndex, 4));
  g.setAttribute('skinWeight', new BufferAttribute(skinWeight, 4));
  g.setAttribute('region', new BufferAttribute(region, 1));
  g.setIndex(new BufferAttribute(index, 1));
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}
