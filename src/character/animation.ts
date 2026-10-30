import { MathUtils } from 'three';
import type { BoneName, JointRotation, Pose, Rig } from './rig';

/**
 * Tiny procedural animation clips. They are authored in "anatomical" terms for
 * the left side; `sym` mirrors them to the right side (twist and side-bend flip
 * sign). Poses are clamped to joint limits by the skeleton, so a stiff
 * character visibly moves less than a flexible one with the same clip.
 */

export const CLIPS = ['bind', 'idle', 'walk', 'run', 'attack', 'flexTest'] as const;
export type ClipName = (typeof CLIPS)[number];

const deg = MathUtils.degToRad;

type LimbBase = 'clavicle' | 'upperarm' | 'forearm' | 'hand' | 'thigh' | 'shin' | 'foot' | 'toe';

function setSide(pose: Pose, base: LimbBase, side: 'L' | 'R', r: JointRotation) {
  const mirror = side === 'R' ? -1 : 1;
  pose[`${base}_${side}` as BoneName] = { x: r.x ?? 0, y: (r.y ?? 0) * mirror, z: (r.z ?? 0) * mirror };
}

function sym(pose: Pose, base: LimbBase, left: JointRotation, right: JointRotation = left) {
  setSide(pose, base, 'L', left);
  setSide(pose, base, 'R', right);
}

/** Lower the arms from the A-pose bind angle to hang next to the body. */
function armsDown(pose: Pose, armRestAngle: number, extra = 0) {
  const z = -deg(Math.max(0, armRestAngle - 12) + extra);
  sym(pose, 'upperarm', { z, x: deg(4) });
  sym(pose, 'forearm', { x: deg(12) });
}

export interface PoseOpts {
  /** Ground speed in m/s (walk/run). Drives stride length and cadence. */
  speed?: number;
  /** Gait phase in cycles (1 = one full left+right stride). Overrides `time`-derived phase. */
  phase?: number;
  /** 0..1 weight of the clip over the idle pose (default 1). */
  blend?: number;
}

/** Speed above which the game should use 'run'. */
export const RUN_SPEED = 3.5;
export const gaitClip = (speed: number): 'walk' | 'run' => (speed > RUN_SPEED ? 'run' : 'walk');

function legLength(rig: Rig): number {
  const g = (n: BoneName) => rig.bones.find((b) => b.name === n)?.length ?? 0.45 * rig.scale;
  return g('thigh_L') + g('shin_L');
}

/** Stride (one full cycle = two steps) in metres for a speed. */
export function strideLength(speed: number, rig: Rig): number {
  const L = legLength(rig);
  const step = L * (0.3 + 0.12 * Math.min(speed, RUN_SPEED) + (speed > RUN_SPEED ? 0.06 * (speed - RUN_SPEED) : 0));
  return 2 * Math.min(step, L * 1.0);
}

/** Cycles per second so that feet keep up with the ground: advance `phase += dt * gaitCadence(...)`. */
export function gaitCadence(speed: number, rig: Rig): number {
  return Math.max(0.05, speed) / strideLength(speed, rig);
}

const lerpRot = (a: JointRotation | undefined, b: JointRotation | undefined, t: number): JointRotation => ({
  x: MathUtils.lerp(a?.x ?? 0, b?.x ?? 0, t),
  y: MathUtils.lerp(a?.y ?? 0, b?.y ?? 0, t),
  z: MathUtils.lerp(a?.z ?? 0, b?.z ?? 0, t),
});

/** Per-joint lerp of two poses (missing joints count as zero rotation). */
export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const out: Pose = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)]) as Set<BoneName>) out[k] = lerpRot(a[k], b[k], t);
  return out;
}

/**
 * Cross-fades between poses so clip switches never pop.
 * Call `update(target, dt, key)` every frame with the freshly sampled pose; when `key`
 * (e.g. clip name) changes, a fade from the last output starts (default 0.2 s).
 */
export class PoseBlender {
  private current: Pose = {};
  private from: Pose = {};
  private t = 1;
  private key = '';
  constructor(public duration = 0.2) {}
  update(target: Pose, dt: number, key = ''): Pose {
    if (key !== this.key) {
      this.key = key;
      this.from = this.current;
      this.t = 0;
    }
    this.t = Math.min(1, this.t + dt / Math.max(1e-3, this.duration));
    const e = this.t * this.t * (3 - 2 * this.t);
    this.current = this.t >= 1 ? target : lerpPose(this.from, target, e);
    return this.current;
  }
  reset() {
    this.current = {};
    this.from = {};
    this.t = 1;
  }
}

function idlePose(time: number, _rig: Rig, armRestAngle: number): Pose {
  const pose: Pose = {};
  const b = Math.sin(time * 1.6); // breathing
  const sway = Math.sin(time * 0.5); // slow weight shift
  armsDown(pose, armRestAngle);
  pose.pelvis = { y: deg(sway * 1.5), z: deg(sway * 2) };
  pose.spine = { x: deg(2 + b * 1.2), z: deg(-sway * 1.2) };
  pose.chest = { x: deg(-1 - b * 1.5), z: deg(-sway * 1) };
  pose.neck = { x: deg(-2 + b * 0.8), y: deg(Math.sin(time * 0.37) * 10) };
  pose.head = { x: deg(2), z: deg(sway * 2.2) }; // levels out the sway
  sym(pose, 'clavicle', { x: deg(b * 1.2) });
  sym(pose, 'forearm', { x: deg(14 + b * 2) });
  sym(pose, 'hand', { x: deg(8) });
  sym(pose, 'thigh', { x: deg(2), z: deg(-2 + sway * 1.5) }, { x: deg(2), z: deg(-2 - sway * 1.5) });
  sym(pose, 'shin', { x: deg(-4) });
  sym(pose, 'foot', { x: deg(2) });
  return pose;
}

function gaitPose(phase: number, speed: number, rig: Rig, armRestAngle: number, run: boolean): Pose {
  const pose: Pose = {};
  const ph = phase * Math.PI * 2;
  const L = legLength(rig);
  const stride = strideLength(speed, rig);
  // thigh swing so that the foot travels one step length per half cycle
  const amp = Math.asin(MathUtils.clamp(stride / 2 / (2 * L * 0.95), 0, 0.75));
  const a = amp * (180 / Math.PI);
  const kneeLift = run ? 85 : 55;
  const leg = (p: number): JointRotation[] => [
    { x: deg(a * Math.sin(p) + (run ? 8 : 2)) },
    { x: -deg((run ? 14 : 6) + kneeLift * Math.pow(Math.max(0, Math.cos(p - 0.15)), 1.6)) },
    { x: deg((run ? 16 : 12) * Math.sin(p - 0.6)) },
  ];
  const [tl, sl, fl] = leg(ph);
  const [tr, sr, fr] = leg(ph + Math.PI);
  sym(pose, 'thigh', { ...tl, z: deg(-1.5) }, { ...tr, z: deg(-1.5) });
  sym(pose, 'shin', sl, sr);
  sym(pose, 'foot', fl, fr);

  const swing = (run ? 48 : 22) * Math.min(1, 0.5 + speed / 6);
  const z = -deg(Math.max(0, armRestAngle - 12) + (run ? 2 : 4));
  const pump = run ? 55 : 14;
  const elbow = (p: number) => deg((run ? 75 : 18) + pump * Math.max(0, Math.sin(p)) * (run ? 0.4 : 1.2));
  sym(pose, 'upperarm', { x: -deg(swing * Math.sin(ph)), z }, { x: deg(swing * Math.sin(ph)), z });
  sym(pose, 'forearm', { x: elbow(ph) }, { x: elbow(ph + Math.PI) });

  // secondary motion: pelvis rotates with the step, chest counter-rotates, bob at 2x cadence
  const rot = (run ? 9 : 7) * Math.min(1, 0.4 + speed / 4);
  const lean = run ? 12 + Math.min(8, (speed - RUN_SPEED) * 3) : 3 + speed;
  pose.pelvis = {
    x: deg(run ? 4 : 1.5) + deg(1.2 * Math.cos(ph * 2)),
    y: deg(rot * Math.sin(ph)),
    z: deg((run ? 3 : 4) * Math.cos(ph)),
  };
  pose.spine = { x: deg(lean * 0.5 + Math.cos(ph * 2) * 1.2), y: deg(-rot * 0.5 * Math.sin(ph)), z: deg(-2 * Math.cos(ph)) };
  pose.chest = { x: deg(lean * 0.4), y: deg(-rot * 0.9 * Math.sin(ph)), z: deg(-1.5 * Math.cos(ph)) };
  pose.neck = { x: deg(-lean * 0.3) };
  // head stabilisation: cancel accumulated yaw/roll/pitch of the trunk
  const sum = (k: 'x' | 'y' | 'z') =>
    (pose.pelvis?.[k] ?? 0) + (pose.spine?.[k] ?? 0) + (pose.chest?.[k] ?? 0) + (pose.neck?.[k] ?? 0);
  pose.head = { x: -sum('x') * 0.7 + deg(2), y: -sum('y') * 0.85, z: -sum('z') * 0.9 };
  sym(pose, 'clavicle', { x: deg(2 * Math.sin(ph)) }, { x: deg(-2 * Math.sin(ph)) });
  return pose;
}

/** One-handed swing (right hand): wind-up 0..0.4, strike 0.4..0.55, recover 0.55..1. progress is 0..1. */
export function attackPose(progress: number, _rig: Rig, armRestAngle: number): Pose {
  const pose: Pose = {};
  const u = MathUtils.clamp(progress, 0, 1);
  const windup = MathUtils.smoothstep(u, 0, 0.4);
  const strike = MathUtils.smoothstep(u, 0.4, 0.55);
  const recover = MathUtils.smoothstep(u, 0.55, 1);
  const k = windup - strike * 1.05 + recover * 0.05; // -0.05 follow through .. 1 wound up
  const hit = strike * (1 - recover); // body committed into the blow
  const rest = Math.max(0, armRestAngle - 12);
  armsDown(pose, armRestAngle);
  setSide(pose, 'upperarm', 'R', { x: deg(10 + 140 * k), z: -deg(rest) + deg(rest * 0.4 + 30) * Math.max(0, k) });
  setSide(pose, 'forearm', 'R', { x: deg(20 + 80 * windup * (1 - strike) + 20 * hit) });
  setSide(pose, 'hand', 'R', { x: deg(-15 * windup + 25 * hit * (1 - recover)) });
  setSide(pose, 'upperarm', 'L', { x: deg(30 + 20 * k), z: -deg(Math.max(0, armRestAngle - 20)) });
  setSide(pose, 'forearm', 'L', { x: deg(70) });
  pose.pelvis = { y: deg(10 * k - 14 * hit) };
  pose.chest = { x: deg(-6 * k + 10 * hit), y: deg(25 * k - 20 * hit) };
  pose.spine = { x: deg(8 * hit), y: deg(10 * k - 6 * hit) };
  pose.neck = { y: deg(-12 * k + 8 * hit) };
  pose.head = { x: deg(-3 * hit) };
  sym(pose, 'thigh', { x: deg(25 + 5 * hit), z: deg(8) }, { x: deg(-10 - 6 * k), z: deg(6) });
  sym(pose, 'shin', { x: deg(-30 - 5 * hit) }, { x: deg(-15 - 8 * hit) });
  return pose;
}

export function samplePose(clip: ClipName, time: number, rig: Rig, armRestAngle: number, opts: PoseOpts = {}): Pose {
  const pose: Pose = {};
  switch (clip) {
    case 'bind':
      return pose;
    case 'idle':
      return idlePose(time, rig, armRestAngle);
    case 'walk':
    case 'run': {
      const speed = opts.speed ?? (clip === 'run' ? 4.5 : 1.5);
      const phase = opts.phase ?? (opts.speed === undefined ? time * 0.9 : time * gaitCadence(speed, rig));
      const gait = gaitPose(phase, speed, rig, armRestAngle, clip === 'run');
      const w = opts.blend ?? 1;
      return w >= 1 ? gait : lerpPose(idlePose(time, rig, armRestAngle), gait, MathUtils.clamp(w, 0, 1));
    }
    case 'attack':
      return attackPose((time % 1.3) / 1.3, rig, armRestAngle);
    case 'flexTest': {
      // sweep one joint at a time through 120% of its range around its centre
      const bones = rig.bones.filter((b) => b.name !== 'root' && !b.name.endsWith('_R'));
      const slot = Math.floor(time / 2) % (bones.length * 3);
      const bone = bones[Math.floor(slot / 3)];
      const axis = (['x', 'y', 'z'] as const)[slot % 3];
      const lo = bone.limits.min[axis];
      const hi = bone.limits.max[axis];
      const mid = (lo + hi) / 2;
      const half = (hi - lo) / 2;
      const span = Math.max(half, deg(15)) * 1.2;
      const value = mid + span * Math.sin(((time % 2) / 2) * Math.PI * 2);
      if (bone.name !== 'upperarm_L' && bone.name !== 'forearm_L' && bone.name !== 'clavicle_L') armsDown(pose, armRestAngle);
      pose[bone.name] = { ...(pose[bone.name] ?? {}), [axis]: value };
      return pose;
    }
  }
}

/** Name of the joint/axis currently driven by the flexTest clip (for UI). */
export function flexTestTarget(time: number, rig: Rig): string {
  const bones = rig.bones.filter((b) => b.name !== 'root' && !b.name.endsWith('_R'));
  const slot = Math.floor(time / 2) % (bones.length * 3);
  return `${bones[Math.floor(slot / 3)].name}.${['x', 'y', 'z'][slot % 3]}`;
}
