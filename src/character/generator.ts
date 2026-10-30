import {
  Color,
  DoubleSide,
  FrontSide,
  Group,
  Material,
  MeshStandardMaterial,
  SkinnedMesh,
} from 'three';
import { Cage, buildCage } from './cage';
import { DetailField, applyDetail, createDetailField } from './detail';
import { toSkinnedGeometry } from './geometry';
import { LAYER_LIBRARY, LayerDef, buildLayerShells } from './layers';
import { CharacterParams, resolveParams } from './params';
import { PolyMesh, computeVertexNormals, filterFaces } from './polymesh';
import { BoneName, Pose, Rig, SkeletonInstance, buildRig, createSkeleton } from './rig';
import { subdivide } from './subdivision';

export interface GenerateOptions {
  /** Layer definitions or ids from LAYER_LIBRARY. */
  layers?: (LayerDef | string)[];
  /** Override params.detail.subdivisions (useful for LODs). */
  subdivisions?: number;
}

export interface GeneratedLayer {
  def: LayerDef;
  mesh: PolyMesh;
  normals: Float64Array;
}

export interface GenerationStats {
  cageVertices: number;
  cageFaces: number;
  bodyTriangles: number;
  layerTriangles: number;
  hiddenCageFaces: number;
  milliseconds: number;
}

/** Engine-agnostic result: plain arrays, no scene objects. */
export interface CharacterData {
  params: CharacterParams;
  rig: Rig;
  cage: Cage;
  body: PolyMesh;
  bodyNormals: Float64Array;
  layers: GeneratedLayer[];
  detail: DetailField;
  subdivisions: number;
  stats: GenerationStats;
}

function resolveLayers(list: (LayerDef | string)[] = []): LayerDef[] {
  return list.map((l) => {
    if (typeof l !== 'string') return l;
    const def = LAYER_LIBRARY[l];
    if (!def) throw new Error(`Unknown layer "${l}"`);
    return def;
  });
}

const HIDDEN_FLAG = 1 << 16;

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * Full pipeline:
 *   params → rig → low-poly cage → layer shells → subdivision → surface detail.
 */
export function generateCharacterData(input: CharacterParams, options: GenerateOptions = {}): CharacterData {
  const t0 = now();
  const params = resolveParams(input);
  const rig = buildRig(params);
  const cage = buildCage(rig, params);
  const defs = resolveLayers(options.layers);
  const { shells, bodyFaceHidden } = buildLayerShells(cage, defs, rig.scale);
  const level = Math.max(0, Math.round(options.subdivisions ?? params.detail.subdivisions));

  // Subdivide the *closed* body so hidden areas do not change the visible
  // surface, then drop the children of hidden cage faces (flag in bit 16).
  const flagged = cage.mesh.clone();
  for (let f = 0; f < flagged.faceCount; f++) if (bodyFaceHidden[f]) flagged.faceTags[f] |= HIDDEN_FLAG;
  const full = subdivide(flagged, level);
  const body = filterFaces(full, Array.from(full.faceTags, (t) => (t & HIDDEN_FLAG) === 0));
  const detail = createDetailField(rig, params);
  applyDetail(body, computeVertexNormals(body), detail, 1, detail.skinNoiseAmplitude);
  const bodyNormals = computeVertexNormals(body);

  const layers: GeneratedLayer[] = shells.map((shell) => {
    const lv = Math.max(0, level + (shell.def.subdivisionDelta ?? 0));
    const mesh = subdivide(shell.mesh, lv);
    const noise = (shell.def.surfaceNoise ?? 0) * rig.scale;
    applyDetail(mesh, computeVertexNormals(mesh), detail, shell.def.conform, noise, 0.6);
    return { def: shell.def, mesh, normals: computeVertexNormals(mesh) };
  });

  const tris = (m: PolyMesh) => {
    let t = 0;
    for (let f = 0; f < m.faceCount; f++) t += m.faceSize(f) - 2;
    return t;
  };
  return {
    params,
    rig,
    cage,
    body,
    bodyNormals,
    layers,
    detail,
    subdivisions: level,
    stats: {
      cageVertices: cage.mesh.vertexCount,
      cageFaces: cage.mesh.faceCount,
      bodyTriangles: tris(body),
      layerTriangles: layers.reduce((s, l) => s + tris(l.mesh), 0),
      hiddenCageFaces: bodyFaceHidden.reduce((s, h) => s + h, 0),
      milliseconds: now() - t0,
    },
  };
}

export interface CharacterModel {
  /** Add this to the scene. Contains the bone hierarchy and all skinned meshes. */
  group: Group;
  data: CharacterData;
  skeleton: SkeletonInstance;
  body: SkinnedMesh;
  layers: SkinnedMesh[];
  /** Apply a pose clamped to the joint limits; returns joints that hit a limit. */
  setPose(pose: Pose): BoneName[];
  dispose(): void;
}

export interface MaterialOverrides {
  body?: Material;
  layer?: (def: LayerDef) => Material | undefined;
}

/** Build a ready-to-render three.js character. */
export function buildCharacter(
  params: CharacterParams,
  options: GenerateOptions = {},
  materials: MaterialOverrides = {},
): CharacterModel {
  const data = generateCharacterData(params, options);
  const skeleton = createSkeleton(data.rig);
  const group = new Group();
  group.name = 'Character';
  group.add(skeleton.root);

  const makeMesh = (mesh: PolyMesh, normals: Float64Array, material: Material, name: string) => {
    const sm = new SkinnedMesh(toSkinnedGeometry(mesh, normals), material);
    sm.name = name;
    sm.castShadow = true;
    sm.receiveShadow = true;
    sm.frustumCulled = false;
    sm.bind(skeleton.skeleton);
    group.add(sm);
    return sm;
  };

  const bodyMaterial =
    materials.body ??
    new MeshStandardMaterial({ color: new Color(data.params.appearance.skinColor), roughness: 0.68, metalness: 0 });
  const body = makeMesh(data.body, data.bodyNormals, bodyMaterial, 'Body');
  const layers = data.layers.map((l) => {
    const mat =
      materials.layer?.(l.def) ??
      new MeshStandardMaterial({
        color: new Color(l.def.material.color),
        metalness: l.def.material.metalness,
        roughness: l.def.material.roughness,
        ...(l.def.material.emissive
          ? { emissive: new Color(l.def.material.emissive), emissiveIntensity: l.def.material.emissiveIntensity ?? 1 }
          : {}),
        side: l.def.thickness > 0 ? FrontSide : DoubleSide,
      });
    return makeMesh(l.mesh, l.normals, mat, l.def.name);
  });

  return {
    group,
    data,
    skeleton,
    body,
    layers,
    setPose: (pose) => skeleton.setPose(pose),
    dispose() {
      for (const m of [body, ...layers]) {
        m.geometry.dispose();
        const mat = m.material as Material;
        if (mat !== materials.body) mat.dispose();
      }
      skeleton.skeleton.dispose();
    },
  };
}

/** Skinned wireframe of the low-poly cage (for debugging / artistic tweaking). */
export function buildCageWireframe(model: CharacterModel, color = '#ffcc33'): SkinnedMesh {
  const geo = toSkinnedGeometry(model.data.cage.mesh);
  const mat = new MeshStandardMaterial({ color, wireframe: true, emissive: new Color(color), emissiveIntensity: 0.6 });
  const sm = new SkinnedMesh(geo, mat);
  sm.frustumCulled = false;
  sm.bind(model.skeleton.skeleton);
  return sm;
}
