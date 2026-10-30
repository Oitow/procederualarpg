import { describe, expect, it } from 'vitest';
import { PoseBlender, attackPose, gaitCadence, samplePose, strideLength } from '../src/character/animation';
import { makeParams } from '../src/character/params';
import { buildRig, createSkeleton } from '../src/character/rig';

describe('animation', () => {
  const rig = buildRig(makeParams({}));
  it('cadence * stride equals speed (no foot sliding)', () => {
    for (const v of [1, 2, 4.2, 6]) expect(gaitCadence(v, rig) * strideLength(v, rig)).toBeCloseTo(v, 6);
  });
  it('run leans more than walk; poses stay finite', () => {
    const w = samplePose('walk', 0.3, rig, 45, { speed: 2 });
    const r = samplePose('run', 0.3, rig, 45, { speed: 5 });
    expect(r.spine!.x!).toBeGreaterThan(w.spine!.x!);
    const sk = createSkeleton(rig);
    for (let u = 0; u <= 1; u += 0.1) sk.setPose(attackPose(u, rig, 45));
  });
  it('PoseBlender fades without popping', () => {
    const b = new PoseBlender(0.2);
    b.update({ spine: { x: 0 } }, 0.016, 'a');
    const first = b.update({ spine: { x: 1 } }, 0.016, 'b').spine!.x!;
    expect(first).toBeLessThan(0.1);
    expect(b.update({ spine: { x: 1 } }, 0.3, 'b').spine!.x!).toBe(1);
  });
});
