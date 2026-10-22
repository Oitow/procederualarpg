import { Quaternion, Vector3 } from 'three';
import { SCULPTS, SculptDef } from './anatomy';
import type { CharacterParams } from './params';
import { PolyMesh } from './polymesh';
import { BONE_INDEX, BoneName, Rig } from './rig';
import { createNoise3D, fbm } from './rng';

/**
 * Surface detail applied to the *subdivided* surface in bind pose:
 * ellipsoidal sculpt deformers (muscles, fat, facial features) plus seeded
 * fbm noise, all pushed along the vertex normal. Because the same field can
 * be evaluated on clothing shells (scaled by their `conform` factor), cloth
 * follows the muscles underneath while rigid armour smooths over them.
 */

interface ResolvedSculpt {
  center: Vector3;
  invFrame: Quaternion;
  invRadii: Vector3;
  boundRadius: number;
  amount: number;
}

export interface DetailStrength {
  muscle: number;
  fat: number;
  face: number;
}

export function detailStrength(params: CharacterParams): DetailStrength {
  const b = params.build;
  const d = params.detail;
  return {
    muscle: d.muscleDefinition * (0.35 + 1.3 * b.muscularity),
    fat: 1.6 * b.bodyFat,
    face: d.facialFeatures,
  };
}

function resolveSculpts(rig: Rig, params: CharacterParams, strength: DetailStrength): ResolvedSculpt[] {
  const out: ResolvedSculpt[] = [];
  const push = (def: SculptDef, boneName: BoneName, xSign: number) => {
    const bone = rig.bones[BONE_INDEX[boneName]];
    const g = strength[def.group];
    if (g <= 0) return;
    const size = rig.scale * (def.group === 'face' ? params.proportions.headSize : params.build.limbThickness);
    const center = bone.head.clone().lerp(bone.tail, def.t)
      .addScaledVector(bone.axisX, def.at[0] * xSign * size)
      .addScaledVector(bone.axisZ, def.at[1] * size);
    const r = def.r.map((v) => v * size);
    out.push({
      center,
      invFrame: bone.frame.clone().invert(),
      invRadii: new Vector3(1 / r[0], 1 / r[1], 1 / r[2]),
      boundRadius: Math.max(...r),
      amount: def.amount * size * g,
    });
  };
  for (const def of SCULPTS) {
    if (def.bone.endsWith('_L')) {
      push(def, def.bone, 1);
      push(def, def.bone.replace(/_L$/, '_R') as BoneName, -1);
    } else if (def.at[0] !== 0) {
      push(def, def.bone, 1);
      push(def, def.bone, -1);
    } else {
      push(def, def.bone, 1);
    }
  }
  return out;
}

export interface DetailField {
  /** Displacement (meters along the normal) at a bind-pose point. */
  sculpt(x: number, y: number, z: number): number;
  /** Unit fbm noise (≈ -1..1) at the character's base frequency × freqMul. */
  noise(x: number, y: number, z: number, freqMul?: number): number;
  /** Meters per unit of noise for the skin. */
  skinNoiseAmplitude: number;
}

export function createDetailField(rig: Rig, params: CharacterParams): DetailField {
  const sculpts = resolveSculpts(rig, params, detailStrength(params));
  const noise3 = createNoise3D(params.seed);
  const p = new Vector3();
  const freq = params.detail.noiseScale / rig.scale;
  return {
    skinNoiseAmplitude: params.detail.noiseAmplitude * rig.scale,
    sculpt(x, y, z) {
      let d = 0;
      for (const s of sculpts) {
        const dx = x - s.center.x;
        const dy = y - s.center.y;
        const dz = z - s.center.z;
        if (dx * dx + dy * dy + dz * dz > s.boundRadius * s.boundRadius) continue;
        p.set(dx, dy, dz).applyQuaternion(s.invFrame).multiply(s.invRadii);
        const q = p.lengthSq();
        if (q >= 1) continue;
        const f = 1 - q;
        d += s.amount * f * f;
      }
      return d;
    },
    noise(x, y, z, freqMul = 1) {
      const f = freq * freqMul;
      return fbm(noise3, x * f, y * f, z * f, 3);
    },
  };
}

/**
 * Displace a mesh in place along its normals.
 * sculptAmount scales the sculpt field, noiseAmplitude is in meters.
 */
export function applyDetail(
  mesh: PolyMesh,
  normals: Float64Array,
  field: DetailField,
  sculptAmount: number,
  noiseAmplitude: number,
  noiseFreqMul = 1,
) {
  if (sculptAmount === 0 && noiseAmplitude === 0) return;
  const { data, stride } = mesh;
  for (let v = 0; v < mesh.vertexCount; v++) {
    const o = v * stride;
    const x = data[o];
    const y = data[o + 1];
    const z = data[o + 2];
    let d = 0;
    if (sculptAmount !== 0) d += sculptAmount * field.sculpt(x, y, z);
    if (noiseAmplitude !== 0) d += noiseAmplitude * field.noise(x, y, z, noiseFreqMul);
    if (d === 0) continue;
    data[o] += normals[v * 3] * d;
    data[o + 1] += normals[v * 3 + 1] * d;
    data[o + 2] += normals[v * 3 + 2] * d;
  }
}
