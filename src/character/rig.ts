import { Bone, Euler, MathUtils, Matrix4, Quaternion, Skeleton, Vector3 } from 'three';
import type { CharacterParams } from './params';

/**
 * Low-poly skeletal rig.
 *
 * Coordinate system: Y up, the character looks along +Z, its left side is +X.
 * Every bone has a rest frame whose local Y axis points along the bone and whose
 * local Z axis points to the bone's "flex direction" (forward for limbs/spine,
 * up for the feet). So for every joint:
 *   rotation X  = flex / extend (positive bends toward local Z)
 *   rotation Y  = twist around the bone
 *   rotation Z  = side bend / abduction
 * Limits are authored for the left side and mirrored for the right side.
 */

export type Side = 'L' | 'R' | 'C';

export const BONE_NAMES = [
  'root',
  'pelvis',
  'spine',
  'chest',
  'neck',
  'head',
  'clavicle_L',
  'upperarm_L',
  'forearm_L',
  'hand_L',
  'clavicle_R',
  'upperarm_R',
  'forearm_R',
  'hand_R',
  'thigh_L',
  'shin_L',
  'foot_L',
  'toe_L',
  'thigh_R',
  'shin_R',
  'foot_R',
  'toe_R',
] as const;

export type BoneName = (typeof BONE_NAMES)[number];
export const BONE_COUNT = BONE_NAMES.length;
export const BONE_INDEX = Object.fromEntries(BONE_NAMES.map((n, i) => [n, i])) as Record<BoneName, number>;

type Deg = [min: number, max: number];
interface BoneDef {
  /** Parent bone (without side suffix for limb bones). */
  parent: string | null;
  flex: 'forward' | 'up';
  /** Rotation limits in degrees, left-side convention. */
  limits: { x: Deg; y: Deg; z: Deg };
}

const BONE_DEFS: Record<string, BoneDef> = {
  root: { parent: null, flex: 'forward', limits: { x: [-180, 180], y: [-180, 180], z: [-180, 180] } },
  pelvis: { parent: 'root', flex: 'forward', limits: { x: [-30, 30], y: [-40, 40], z: [-25, 25] } },
  spine: { parent: 'pelvis', flex: 'forward', limits: { x: [-25, 45], y: [-30, 30], z: [-25, 25] } },
  chest: { parent: 'spine', flex: 'forward', limits: { x: [-20, 35], y: [-35, 35], z: [-20, 20] } },
  neck: { parent: 'chest', flex: 'forward', limits: { x: [-40, 50], y: [-60, 60], z: [-35, 35] } },
  head: { parent: 'neck', flex: 'forward', limits: { x: [-35, 35], y: [-35, 35], z: [-25, 25] } },
  clavicle: { parent: 'chest', flex: 'forward', limits: { x: [-15, 25], y: [-10, 10], z: [-15, 30] } },
  upperarm: { parent: 'clavicle', flex: 'forward', limits: { x: [-60, 170], y: [-90, 90], z: [-55, 130] } },
  forearm: { parent: 'upperarm', flex: 'forward', limits: { x: [0, 150], y: [-80, 80], z: [-5, 5] } },
  hand: { parent: 'forearm', flex: 'forward', limits: { x: [-70, 80], y: [-20, 20], z: [-25, 35] } },
  thigh: { parent: 'pelvis', flex: 'forward', limits: { x: [-30, 120], y: [-45, 45], z: [-25, 55] } },
  shin: { parent: 'thigh', flex: 'forward', limits: { x: [-150, 0], y: [-10, 10], z: [-3, 3] } },
  foot: { parent: 'shin', flex: 'up', limits: { x: [-45, 25], y: [-20, 20], z: [-25, 25] } },
  toe: { parent: 'foot', flex: 'up', limits: { x: [-30, 60], y: [-5, 5], z: [-5, 5] } },
};

function defFor(name: BoneName): { def: BoneDef; parent: BoneName | null; side: Side } {
  const m = /^(.*)_(L|R)$/.exec(name);
  const base = BONE_DEFS[m ? m[1] : name];
  const side: Side = m ? (m[2] as Side) : 'C';
  let parent = base.parent as BoneName | null;
  if (m && base.parent && `${base.parent}_${side}` in BONE_INDEX) parent = `${base.parent}_${side}` as BoneName;
  return { def: base, parent, side };
}

export interface JointLimits {
  min: Vector3;
  max: Vector3;
}

export interface RigBone {
  index: number;
  name: BoneName;
  parent: number;
  side: Side;
  head: Vector3;
  tail: Vector3;
  length: number;
  /** World rest orientation (local X = hinge axis, Y = along bone, Z = flex direction). */
  frame: Quaternion;
  axisX: Vector3;
  axisY: Vector3;
  axisZ: Vector3;
  /** Radians, already scaled by flexibility and mirrored for side. */
  limits: JointLimits;
}

export interface Rig {
  bones: RigBone[];
  /** Uniform scale relative to the 1.8 m reference figure. */
  scale: number;
  height: number;
  groundY: number;
}

/** Scale factor applied to authored rotation ranges. */
export function flexibilityScale(flexibility: number): number {
  return MathUtils.lerp(0.55, 1.35, MathUtils.clamp(flexibility, 0, 1));
}

/**
 * Build the rest-pose skeleton from proportions. Lengths are authored for a
 * ~1.8 m reference figure and the whole rig is then scaled to `height`.
 */
export function buildRig(params: CharacterParams): Rig {
  const p = params.proportions;
  const heads = {} as Record<BoneName, Vector3>;
  const tails = {} as Record<BoneName, Vector3>;
  const set = (n: BoneName, h: Vector3, t: Vector3) => {
    heads[n] = h.clone();
    tails[n] = t.clone();
  };
  const up = new Vector3(0, 1, 0);

  const ankleH = 0.085 * Math.sqrt(p.footSize);
  const legTotal = 0.87 * p.legLength;
  const thighLen = legTotal / (1 + p.shinRatio);
  const shinLen = legTotal - thighLen;
  const hipY = ankleH + legTotal;
  const hipX = 0.088 * p.hipWidth;

  const pelvisHead = new Vector3(0, hipY + 0.02, 0);
  const spineHead = pelvisHead.clone().addScaledVector(up, 0.09);
  const chestHead = spineHead.clone().addScaledVector(up, 0.16 * p.torsoLength);
  const neckHead = chestHead.clone().addScaledVector(up, 0.21 * p.torsoLength);
  const headHead = neckHead.clone().addScaledVector(up, 0.085 * p.neckLength);
  const headTail = headHead.clone().addScaledVector(up, 0.225 * p.headSize);

  set('root', new Vector3(0, 0, 0), new Vector3(0, 0.1, 0));
  set('pelvis', pelvisHead, spineHead);
  set('spine', spineHead, chestHead);
  set('chest', chestHead, neckHead);
  set('neck', neckHead, headHead);
  set('head', headHead, headTail);

  const shoulderY = neckHead.y - 0.055;
  const shoulderX = 0.185 * p.shoulderWidth;
  const armTotal = 0.58 * p.armLength;
  const upperLen = armTotal / (1 + p.forearmRatio);
  const foreLen = armTotal - upperLen;
  const handLen = 0.18 * p.handSize;
  const a = MathUtils.degToRad(params.armRestAngle);

  const footLen = 0.25 * p.footSize;
  for (const side of ['L', 'R'] as const) {
    const sx = side === 'L' ? 1 : -1;
    const armDir = new Vector3(sx * Math.cos(a), -Math.sin(a), 0);
    const clavHead = new Vector3(sx * 0.025, neckHead.y - 0.035, 0.015);
    const shoulder = new Vector3(sx * shoulderX, shoulderY, -0.005);
    const elbow = shoulder.clone().addScaledVector(armDir, upperLen);
    const wrist = elbow.clone().addScaledVector(armDir, foreLen);
    const fingertip = wrist.clone().addScaledVector(armDir, handLen);
    set(`clavicle_${side}`, clavHead, shoulder);
    set(`upperarm_${side}`, shoulder, elbow);
    set(`forearm_${side}`, elbow, wrist);
    set(`hand_${side}`, wrist, fingertip);

    const hip = new Vector3(sx * hipX, hipY, 0);
    const knee = new Vector3(sx * hipX * 0.97, ankleH + shinLen, 0.012);
    const ankle = new Vector3(sx * hipX * 0.95, ankleH, -0.01);
    const ball = new Vector3(sx * hipX * 0.97, 0.022, footLen * 0.66);
    const toeTip = new Vector3(sx * hipX * 0.98, 0.016, footLen * 0.66 + footLen * 0.3);
    set(`thigh_${side}`, hip, knee);
    set(`shin_${side}`, knee, ankle);
    set(`foot_${side}`, ankle, ball);
    set(`toe_${side}`, ball, toeTip);
  }

  const scale = params.height / headTail.y;
  const flexScale = flexibilityScale(params.joints.flexibility);
  const bones: RigBone[] = BONE_NAMES.map((name, index) => {
    const { def, parent, side } = defFor(name);
    const head = heads[name].multiplyScalar(scale);
    const tail = tails[name].multiplyScalar(scale);
    const axisY = tail.clone().sub(head).normalize();
    const flexDir = def.flex === 'forward' ? new Vector3(0, 0, 1) : new Vector3(0, 1, 0);
    const axisZ = flexDir.addScaledVector(axisY, -flexDir.dot(axisY)).normalize();
    const axisX = new Vector3().crossVectors(axisY, axisZ).normalize();
    const frame = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(axisX, axisY, axisZ));
    const L = def.limits;
    const rad = (d: number) => MathUtils.degToRad(d) * (name === 'root' ? 1 : flexScale);
    const mirror = (r: Deg): Deg => (side === 'R' ? [-r[1], -r[0]] : r);
    const ly = mirror(L.y);
    const lz = mirror(L.z);
    return {
      index,
      name,
      parent: parent ? BONE_INDEX[parent] : -1,
      side,
      head,
      tail,
      length: head.distanceTo(tail),
      frame,
      axisX,
      axisY,
      axisZ,
      limits: {
        min: new Vector3(rad(L.x[0]), rad(ly[0]), rad(lz[0])),
        max: new Vector3(rad(L.x[1]), rad(ly[1]), rad(lz[1])),
      },
    };
  });

  return { bones, scale, height: params.height, groundY: 0 };
}

export function getBone(rig: Rig, name: BoneName): RigBone {
  return rig.bones[BONE_INDEX[name]];
}

/** A chain of bones parameterised by s ∈ [0, n]: bone i covers [i, i+1]. */
export interface Chain {
  bones: number[];
}

export function chainPoint(rig: Rig, chain: Chain, s: number, out = new Vector3()): Vector3 {
  const n = chain.bones.length;
  const i = MathUtils.clamp(Math.floor(s), 0, n - 1);
  const t = s - i;
  const b = rig.bones[chain.bones[i]];
  return out.copy(b.head).lerp(b.tail, t);
}

/** Rest frame along a chain, smoothly blended across joints. */
export function chainFrame(rig: Rig, chain: Chain, s: number, blend = 0.25, out = new Quaternion()): Quaternion {
  const n = chain.bones.length;
  const i = MathUtils.clamp(Math.floor(s), 0, n - 1);
  const t = s - i;
  const q = rig.bones[chain.bones[i]].frame;
  if (t < blend && i > 0) {
    const prev = rig.bones[chain.bones[i - 1]].frame;
    return out.copy(prev).slerp(q, 0.5 + 0.5 * (t / blend));
  }
  if (t > 1 - blend && i < n - 1) {
    const next = rig.bones[chain.bones[i + 1]].frame;
    return out.copy(q).slerp(next, 0.5 * ((t - (1 - blend)) / blend));
  }
  return out.copy(q);
}

export type JointRotation = { x?: number; y?: number; z?: number };
/** Pose: per-bone rotation offsets (radians) relative to the rest pose. */
export type Pose = Partial<Record<BoneName, JointRotation>>;

export interface ClampResult {
  rotation: Vector3;
  clamped: boolean;
}

export function clampJoint(bone: RigBone, r: JointRotation): ClampResult {
  const x = r.x ?? 0;
  const y = r.y ?? 0;
  const z = r.z ?? 0;
  const rotation = new Vector3(
    MathUtils.clamp(x, bone.limits.min.x, bone.limits.max.x),
    MathUtils.clamp(y, bone.limits.min.y, bone.limits.max.y),
    MathUtils.clamp(z, bone.limits.min.z, bone.limits.max.z),
  );
  const clamped = Math.abs(rotation.x - x) + Math.abs(rotation.y - y) + Math.abs(rotation.z - z) > 1e-6;
  return { rotation, clamped };
}

export interface SkeletonInstance {
  root: Bone;
  bones: Bone[];
  skeleton: Skeleton;
  restQuaternions: Quaternion[];
  /** Apply a pose (clamped to joint limits). Returns the names of clamped joints. */
  setPose(pose: Pose): BoneName[];
}

/** Create a three.js skeleton in bind pose. */
export function createSkeleton(rig: Rig): SkeletonInstance {
  const bones: Bone[] = [];
  const restQuaternions: Quaternion[] = [];
  const invParent = new Quaternion();
  for (const rb of rig.bones) {
    const bone = new Bone();
    bone.name = rb.name;
    if (rb.parent < 0) {
      bone.position.copy(rb.head);
      bone.quaternion.copy(rb.frame);
    } else {
      const parent = rig.bones[rb.parent];
      invParent.copy(parent.frame).invert();
      bone.position.copy(rb.head).sub(parent.head).applyQuaternion(invParent);
      bone.quaternion.copy(invParent).multiply(rb.frame);
      bones[rb.parent].add(bone);
    }
    restQuaternions.push(bone.quaternion.clone());
    bones.push(bone);
  }
  const root = bones[0];
  root.updateMatrixWorld(true);
  const skeleton = new Skeleton(bones);

  const euler = new Euler(0, 0, 0, 'XZY');
  const q = new Quaternion();
  const setPose = (pose: Pose): BoneName[] => {
    const clamped: BoneName[] = [];
    rig.bones.forEach((rb, i) => {
      const r = pose[rb.name];
      bones[i].quaternion.copy(restQuaternions[i]);
      if (!r) return;
      const res = clampJoint(rb, r);
      if (res.clamped) clamped.push(rb.name);
      euler.set(res.rotation.x, res.rotation.y, res.rotation.z);
      bones[i].quaternion.multiply(q.setFromEuler(euler));
    });
    return clamped;
  };

  return { root, bones, skeleton, restQuaternions, setPose };
}
