/**
 * Campus avatar action layer. No imports, geometry, or scene-root transforms.
 * Call immediately AFTER updateAvatar(rig, dt, speed, action), once per frame.
 * dt is seconds; speed and verticalVelocity are metres/second.
 * The controller remains responsible for jump height and ground collision.
 */
const states = new WeakMap();
const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const finite = (value) => Number.isFinite(value) ? value : 0;
const lerp = (a, b, weight) => a + (b - a) * weight;
const smoothstep = (value) => { const t = clamp(value); return t * t * (3 - 2 * t); };

/**
 * Add takeoff extension, asymmetric airborne tuck, landing absorption, and
 * sprint lean to the existing walking animation. All targets are bounded and
 * blended as absolute joint angles, so repeated calls never accumulate offsets.
 * group/root/motionRoot and every position, scale, and hierarchy stay untouched.
 * @returns the original rig
 */
export function applyActionPose(rig, dt = 0, {
  airborne,
  verticalVelocity = 0,
  speed = 0,
  sprinting = false,
  grounded,
} = {}) {
  if (!rig?.joints) return rig;
  const delta = clamp(finite(dt), 0, .08);
  const velocity = finite(verticalVelocity);
  const movingSpeed = Math.abs(finite(speed));
  // Explicit airborne is authoritative; grounded is a convenient alternative.
  const inAir = airborne == null ? grounded === false : Boolean(airborne);
  let state = states.get(rig);
  if (!state) {
    state = { wasAirborne: false, airTime: 0, airBlend: 0,
      sprintBlend: 0, landingTime: 1, impact: 0, lastVelocity: 0, airVelocity: 0 };
    states.set(rig, state);
  }
  const takeoff = inAir && !state.wasAirborne;
  const landed = !inAir && state.wasAirborne;
  if (takeoff) {
    state.airTime = 0;
    state.landingTime = 1;
  }
  if (landed) {
    state.landingTime = 0;
    state.impact = clamp(Math.abs(Math.min(0, state.lastVelocity)) / 5.5, .4, 1);
  }
  if (inAir) {
    state.airTime += delta;
    state.airVelocity = velocity;
  }
  state.landingTime += delta;
  const approach = 1 - Math.exp(-delta * 20);
  state.airBlend = lerp(state.airBlend, inAir ? 1 : 0, approach);
  state.sprintBlend = lerp(state.sprintBlend,
    sprinting && movingSpeed > .05 && !inAir ? clamp(movingSpeed / 3.2) : 0,
    1 - Math.exp(-delta * 10));
  const j = rig.joints;
  const pose = (name, x, weight, y, z) => {
    const rotation = j[name]?.rotation;
    if (!rotation || weight <= 0) return;
    rotation.x = lerp(rotation.x, x, clamp(weight));
    if (y !== undefined) rotation.y = lerp(rotation.y, y, clamp(weight));
    if (z !== undefined) rotation.z = lerp(rotation.z, z, clamp(weight));
  };

  // Avatar faces +Z: positive torso X bends its upper body forwards.
  const run = state.sprintBlend;
  pose('hips', .075, run);
  pose('torso', .17, run);
  pose('head', -.10, run);
  pose('lowerArmL', -1.08, run * .7);
  pose('lowerArmR', -1.08, run * .7);

  const air = state.airBlend;
  if (air > .001) {
    // Begin with a push-off extension, then tuck. Falling extends the legs for
    // contact; a stationary jump keeps both knees close to the same height.
    const tuck = smoothstep((state.airTime - .065) / .19);
    const falling = smoothstep((-state.airVelocity - .5) / 4.5);
    const stride = clamp(movingSpeed / 4);
    const thigh = lerp(-.12, -.74, tuck) + falling * .32;
    const knee = lerp(.22, 1.22, tuck) - falling * .57;
    const split = .16 * stride * tuck * (1 - falling * .5);
    const armLift = lerp(-1.02, -.48, tuck) + falling * .15;
    pose('hips', .045 + stride * .035, air, 0, 0);
    pose('torso', .07 + stride * .04 + falling * .06, air, 0, 0);
    pose('head', -.06 - falling * .045, air, 0, 0);
    pose('upperLegL', thigh - split, air, 0, .025);
    pose('upperLegR', thigh + split, air, 0, -.025);
    pose('lowerLegL', knee + split * .55, air, 0, 0);
    pose('lowerLegR', knee - split * .55, air, 0, 0);
    pose('footL', -.13 - falling * .045, air, 0, 0);
    pose('footR', -.13 - falling * .045, air, 0, 0);
    pose('upperArmL', armLift + .09 * stride, air, 0, .14);
    pose('upperArmR', armLift - .09 * stride, air, 0, -.14);
    pose('lowerArmL', -.78 + falling * .22, air, 0, 0);
    pose('lowerArmR', -.78 + falling * .22, air, 0, 0);
    pose('handL', -.04, air, 0, .03);
    pose('handR', -.04, air, 0, -.03);
  }

  // A fast compression followed by a slower recovery reads as a soft landing.
  // The base animator continues to own sole-to-ground root correction.
  if (!inAir && state.landingTime < .38) {
    const t = state.landingTime;
    const landing = state.impact * smoothstep(t / .045) *
      Math.exp(-Math.max(0, t - .045) / .095);
    pose('hips', .10, landing, 0, 0);
    pose('torso', .23, landing, 0, 0);
    pose('head', -.15, landing);
    pose('upperLegL', -.43, landing, 0, .02);
    pose('upperLegR', -.43, landing, 0, -.02);
    pose('lowerLegL', .83, landing, 0, 0);
    pose('lowerLegR', .83, landing, 0, 0);
    pose('footL', -.10, landing, 0, 0);
    pose('footR', -.10, landing, 0, 0);
    pose('upperArmL', -.35, landing, 0, .14);
    pose('upperArmR', -.35, landing, 0, -.14);
    pose('lowerArmL', -.55, landing);
    pose('lowerArmR', -.55, landing);
  }
  state.wasAirborne = inAir;
  state.lastVelocity = velocity;
  return rig;
}

/** Clear transition history after a teleport, avatar reuse, or respawn. */
export function resetActionPose(rig) {
  states.delete(rig);
  return rig;
}
