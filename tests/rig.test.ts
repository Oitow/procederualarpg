import { describe, expect, it } from 'vitest';
import { CLIPS, samplePose } from '../src/character/animation';
import { makeParams } from '../src/character/params';
import { BONE_COUNT, buildRig, clampJoint, createSkeleton, getBone } from '../src/character/rig';

describe('rig', () => {
  it('is scaled to the requested height', () => {
    for (const height of [1.1, 1.8, 2.4]) {
      const rig = buildRig(makeParams({ height }));
      expect(getBone(rig, 'head').tail.y).toBeCloseTo(height, 6);
      expect(rig.bones).toHaveLength(BONE_COUNT);
    }
  });

  it('has orthonormal right-handed bone frames with Y along the bone', () => {
    const rig = buildRig(makeParams());
    for (const b of rig.bones) {
      const dir = b.tail.clone().sub(b.head).normalize();
      expect(b.axisY.dot(dir)).toBeCloseTo(1, 6);
      expect(b.axisX.dot(b.axisY)).toBeCloseTo(0, 6);
      expect(b.axisX.clone().cross(b.axisY).dot(b.axisZ)).toBeCloseTo(1, 6);
    }
  });

  it('proportions change limb lengths', () => {
    const a = buildRig(makeParams({ proportions: { legLength: 0.8 } }));
    const b = buildRig(makeParams({ proportions: { legLength: 1.2 } }));
    const leg = (r: typeof a) => getBone(r, 'thigh_L').length / r.height;
    expect(leg(b)).toBeGreaterThan(leg(a) * 1.2);
  });

  it('flexibility scales joint ranges and limits are mirrored', () => {
    const stiff = buildRig(makeParams({ joints: { flexibility: 0 } }));
    const loose = buildRig(makeParams({ joints: { flexibility: 1 } }));
    const range = (r: typeof stiff) => getBone(r, 'shin_L').limits.max.x - getBone(r, 'shin_L').limits.min.x;
    expect(range(loose)).toBeGreaterThan(range(stiff) * 2);
    const l = getBone(stiff, 'upperarm_L').limits;
    const r = getBone(stiff, 'upperarm_R').limits;
    expect(r.min.z).toBeCloseTo(-l.max.z, 9);
    expect(r.max.x).toBeCloseTo(l.max.x, 9);
  });

  it('clamps rotations to the joint limits', () => {
    const rig = buildRig(makeParams());
    const knee = getBone(rig, 'shin_L');
    const res = clampJoint(knee, { x: 0.5 });
    expect(res.clamped).toBe(true);
    expect(res.rotation.x).toBe(0);
    expect(clampJoint(knee, { x: -0.5 }).clamped).toBe(false);
  });

  it('applies clips without errors and reports clamped joints', () => {
    const stiff = buildRig(makeParams({ joints: { flexibility: 0 } }));
    const sk = createSkeleton(stiff);
    let clampedSomething = false;
    for (const clip of CLIPS) {
      for (let t = 0; t < 4; t += 0.25) {
        const clamped = sk.setPose(samplePose(clip, t, stiff, 45));
        if (clamped.length) clampedSomething = true;
        for (const b of sk.bones) expect(Number.isFinite(b.quaternion.w)).toBe(true);
      }
    }
    expect(clampedSomething).toBe(true);
  });
});
