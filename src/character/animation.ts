import { MathUtils } from 'three';
import type { BoneName, JointRotation, Pose, Rig } from './rig';

/**
 * Tiny procedural animation clips. They are authored in "anatomical" terms for
 * the left side; `sym` mirrors them to the right side (twist and side-bend flip
 * sign). Poses are clamped to joint limits by the skeleton, so a stiff
 * character visibly moves less than a flexible one with the same clip.
 */

export const CLIPS = ['bind', 'idle', 'walk', 'attack', 'flexTest'] as const;
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

export function samplePose(clip: ClipName, time: number, rig: Rig, armRestAngle: number): Pose {
  const pose: Pose = {};
  switch (clip) {
    case 'bind':
      return pose;
    case 'idle': {
      const b = Math.sin(time * 1.6);
      armsDown(pose, armRestAngle);
      pose.spine = { x: deg(2 + b * 1.2) };
      pose.chest = { x: deg(-1 - b * 1.5) };
      pose.neck = { x: deg(-2 + b * 0.8), y: deg(Math.sin(time * 0.37) * 10) };
      pose.head = { x: deg(2) };
      sym(pose, 'forearm', { x: deg(14 + b * 2) });
      sym(pose, 'hand', { x: deg(8) });
      sym(pose, 'thigh', { x: deg(2), z: deg(-2) });
      sym(pose, 'shin', { x: deg(-4) });
      sym(pose, 'foot', { x: deg(2) });
      return pose;
    }
    case 'walk': {
      const ph = time * Math.PI * 2 * 0.9;
      armsDown(pose, armRestAngle, 4);
      const leg = (p: number): JointRotation[] => [
        { x: deg(28 * Math.sin(p)) },
        { x: -deg(6 + 58 * Math.pow(Math.max(0, Math.cos(p)), 1.6)) },
        { x: deg(12 * Math.sin(p - 0.6)) },
      ];
      const [tl, sl, fl] = leg(ph);
      const [tr, sr, fr] = leg(ph + Math.PI);
      sym(pose, 'thigh', tl, tr);
      sym(pose, 'shin', sl, sr);
      sym(pose, 'foot', fl, fr);
      const z = -deg(Math.max(0, armRestAngle - 12) + 4);
      sym(pose, 'upperarm', { x: -deg(24 * Math.sin(ph)), z }, { x: deg(24 * Math.sin(ph)), z });
      sym(
        pose,
        'forearm',
        { x: deg(18 + 18 * Math.max(0, Math.sin(ph))) },
        { x: deg(18 + 18 * Math.max(0, -Math.sin(ph))) },
      );
      pose.pelvis = { y: deg(7 * Math.sin(ph)), z: deg(3 * Math.cos(ph * 2)) };
      pose.spine = { x: deg(4), y: deg(-4 * Math.sin(ph)) };
      pose.chest = { y: deg(-6 * Math.sin(ph)) };
      pose.neck = { y: deg(4 * Math.sin(ph)) };
      return pose;
    }
    case 'attack': {
      const u = (time % 1.3) / 1.3;
      const windup = MathUtils.smoothstep(u, 0, 0.42);
      const strike = MathUtils.smoothstep(u, 0.42, 0.56);
      const recover = MathUtils.smoothstep(u, 0.7, 1);
      const k = windup - strike * 0.9 - recover * 0.1;
      armsDown(pose, armRestAngle);
      setSide(pose, 'upperarm', 'R', { x: deg(10 + 150 * k), z: -deg(Math.max(0, armRestAngle - 12)) + deg(30 * k) });
      setSide(pose, 'forearm', 'R', { x: deg(20 + 80 * windup * (1 - strike)) });
      setSide(pose, 'upperarm', 'L', { x: deg(30 + 20 * k), z: -deg(Math.max(0, armRestAngle - 20)) });
      setSide(pose, 'forearm', 'L', { x: deg(70) });
      pose.chest = { x: deg(-8 * k + 12 * strike * (1 - recover)), y: deg(25 * k - 20 * strike * (1 - recover)) };
      pose.spine = { x: deg(10 * strike * (1 - recover)), y: deg(12 * k) };
      sym(pose, 'thigh', { x: deg(25), z: deg(8) }, { x: deg(-10), z: deg(6) });
      sym(pose, 'shin', { x: deg(-30) }, { x: deg(-15) });
      return pose;
    }
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
