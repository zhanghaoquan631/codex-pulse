/**
 * +Z-facing campus avatar swimming layer, compatible with all eight variants.
 * Call AFTER updateAvatar; do not apply the land action layer while swimming.
 * Controller owns outer group position/yaw (typical group y=-.55, water y=.12).
 * This module owns only motionRoot local pitch/roll/height and joint rotations.
 */
const states = new WeakMap();
const clamp = (n, min = 0, max = 1) => Math.min(max, Math.max(min, n));
const finite = n => Number.isFinite(n) ? n : 0;
const mix = (a, b, t) => a + (b - a) * t;
const jointNames = ['hips','torso','head','upperArmL','upperArmR','lowerArmL',
  'lowerArmR','handL','handR','upperLegL','upperLegR','lowerLegL','lowerLegR','footL','footR'];

export function applySwimPose(rig, dt = 0, {speed = 0} = {}) {
  if (!rig?.motionRoot || !rig?.joints) return rig;
  const delta = clamp(finite(dt), 0, .08);
  const velocity = Math.abs(finite(speed));
  const moving = clamp((velocity - .08) / .72);
  let state = states.get(rig);
  if (!state) {
    const root = rig.motionRoot;
    state = { phase:0, time:0, moving,
      baseRoot:{positionY:root.position.y, rotationX:root.rotation.x, rotationZ:root.rotation.z},
      baseJoints:{}, output:{}, target:root.quaternion.clone(), first:true };
    for (const name of jointNames) {
      if (!rig.joints[name]) continue;
      state.baseJoints[name] = rig.joints[name].quaternion.clone();
      state.output[name] = rig.joints[name].quaternion.clone();
    }
    states.set(rig, state);
  }
  state.time += delta;
  state.phase += delta * (1.05 + Math.min(velocity, 4) * .105) * Math.PI * 2;
  // Keep trigonometric inputs bounded over long sessions.
  state.phase %= Math.PI * 2;
  state.moving = mix(state.moving, moving, 1 - Math.exp(-delta * 7));
  const m = state.moving, p = state.phase, t = state.time;
  const root = rig.motionRoot;
  // Treading places chest below water. Forward motion pitches the body prone,
  // with head held above water and hips/legs submerged, without moving the actor.
  root.rotation.x = mix(.08, 1.21, m);
  root.rotation.z = Math.sin(p) * .042 * m;
  root.position.y = mix(-.42, .27, m) + Math.sin(t * 3.1) * .016;
  const j = rig.joints;
  const smooth = state.first || delta === 0 ? 1 : 1 - Math.exp(-delta * 24);
  function pose(name, x, y = 0, z = 0) {
    const joint = j[name];
    if (!joint) return;
    // Filter stored swim output, independent of the base animator's ground pose.
    // Quaternion smoothing keeps a continuous full circular arm stroke even
    // when its Euler X angle wraps from +PI to -PI.
    joint.rotation.set(x, y, z);
    state.target.copy(joint.quaternion);
    state.output[name].slerp(state.target, smooth);
    joint.quaternion.copy(state.output[name]);
  }
  pose('hips', mix(0, .035, m), 0, Math.sin(p * 2) * .018 * m);
  pose('torso', mix(.02, .05, m), Math.sin(p) * .045 * m, 0);
  pose('head', mix(-.03, -.92, m), Math.sin(p) * .035 * m, 0);

  // Above this blend threshold use alternating front-crawl strokes. Below it,
  // symmetric side sculling and bent legs make the stationary tread obvious.
  if (m > .45) {
    for (const [side, offset, sign] of [['L',0,1],['R',Math.PI,-1]]) {
      const a = (p + offset) % (Math.PI * 2);
      const stroke = -Math.PI + a;
      const recovery = Math.max(0, -Math.sin(a));
      pose('upperArm' + side, stroke, sign * .035,
        sign * (.12 + .12 * recovery));
      pose('lowerArm' + side, -.16 - .95 * recovery, 0, sign * .025);
      pose('hand' + side, -.06 - .16 * Math.sin(a), 0, sign * .025);
      const kick = Math.sin(p * 2 + offset);
      pose('upperLeg' + side, -.04 + kick * .18, 0, sign * .025);
      pose('lowerLeg' + side, .15 + Math.max(0, -kick) * .20, 0, 0);
      pose('foot' + side, -.18, 0, 0);
    }
  } else {
    const scull = Math.sin(p), kick = Math.sin(p * 1.4);
    pose('upperArmL', -.55 + scull * .14, .16, .70 + scull * .15);
    pose('upperArmR', -.55 + scull * .14, -.16, -.70 - scull * .15);
    pose('lowerArmL', -.90 - scull * .25, .25, .10);
    pose('lowerArmR', -.90 - scull * .25, -.25, -.10);
    pose('handL', .06, .20 * scull, .10);
    pose('handR', .06, -.20 * scull, -.10);
    pose('upperLegL', -.24 + kick * .12, 0, .12);
    pose('upperLegR', -.24 - kick * .12, 0, -.12);
    pose('lowerLegL', .58 - kick * .17, 0, 0);
    pose('lowerLegR', .58 + kick * .17, 0, 0);
    pose('footL', -.20, 0, .07);
    pose('footR', -.20, 0, -.07);
  }
  state.first = false;
  return rig;
}

/**
 * Call ONCE when leaving water, preferably BEFORE the next updateAvatar call.
 * Restores every owned motionRoot property and the pre-swim joint orientations.
 * The next base animation frame then animates normally without a persistent lean.
 */
export function resetSwimPose(rig) {
  const state = states.get(rig);
  if (!state) return rig;
  rig.motionRoot.position.y = state.baseRoot.positionY;
  rig.motionRoot.rotation.x = state.baseRoot.rotationX;
  rig.motionRoot.rotation.z = state.baseRoot.rotationZ;
  for (const [name, quaternion] of Object.entries(state.baseJoints)) {
    rig.joints[name]?.quaternion.copy(quaternion);
  }
  states.delete(rig);
  return rig;
}
