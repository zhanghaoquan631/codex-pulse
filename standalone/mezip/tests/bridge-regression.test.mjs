import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Defaults to this checkout; an override only supports external integration QA.
const root = process.env.RACING_TEST_ROOT ? pathToFileURL(path.resolve(process.env.RACING_TEST_ROOT) + path.sep) : new URL('../', import.meta.url);
const { createCompetitionBridge } = await import(process.env.RACING_BRIDGE_FILE ? pathToFileURL(path.resolve(process.env.RACING_BRIDGE_FILE)) : new URL('apps/racing/assets/competition-bridge.js', root));

const require = createRequire(new URL('apps/account/package.json', root));
const THREE = require('three');
// Exercise the exact preserved vehicle class, rather than a mock copy of its API.
const original = await fs.readFile(new URL('apps/racing/assets/index-BHLGw_OM.js', root), 'utf8');
const start = original.indexOf('const ep=.15,U0='), end = original.indexOf('const S2="xbox"', start);
assert.ok(start > 0 && end > start, 'known vehicle boundaries must exist');
const Vehicle = new Function('v', 'M0', 'os', 'la', 'z8', 'k', 'Mn', `${original.slice(start, end)};return Un;`)(
  THREE.Vector3, THREE.Quaternion, THREE.Raycaster, THREE.Sphere, THREE.Matrix4, THREE.MathUtils, () => null);
globalThis.document = { documentElement: { dataset: {}, removeAttribute() {} },
  querySelector: () => ({ clientWidth: 1280, clientHeight: 720 }) };
globalThis.window = new EventTarget();

function setup() {
  const s = { selectedTrackId: 'lagunaSeca', tractionControl: true, abs: true, manualGearbox: true,
    replayEnabled: true, hotlapGhostEnabled: true, hotlapRacingLineEnabled: true,
    setSelectedTrackId(id) { s.selectedTrackId = id; } };
  const u = { hudRevealed: false, idleCinematicActive: true, setSettingsOpen() {}, setPhotoMode() {}, setReplayMode() {},
    revealHud() { u.hudRevealed = true; }, clearIdleCinematic() { u.idleCinematicActive = false; } };
  const bridge = createCompetitionBridge({ Vec3: THREE.Vector3, Quaternion: THREE.Quaternion, Color: THREE.Color, Vehicle,
    settings: { getState: () => s, setState: patch => Object.assign(s, patch) },
    ui: { getState: () => u }, telemetry: { getState: () => ({}) },
    laps: { getState: () => ({ lapCount: 0, currentSector: 0, resetForRace() {} }) },
    tracks: { lagunaSeca: {}, apexCircuit: {} }, markActivity() {} });
  const vehicle = new Vehicle();
  return { bridge, vehicle, settings: s, ui: u };
}
async function ready(t, track = 'lagunaSeca') {
  t.bridge._bindStart(mode => {
    assert.equal(mode, 'sandbox');
    t.bridge._attachVehicle(t.vehicle, track);
    t.bridge._beforeFrame(t.vehicle, track, {});
    t.bridge._beforeFrame(t.vehicle, track, {});
  });
  return t.bridge.startRace(track);
}

test('race waits for a real physics car, preserves original settings on reset', async () => {
  const t = setup();
  assert.equal(t.bridge.readCar(), null);
  const result = await ready(t);
  assert.equal(result.ready, true);
  assert.equal(result.controlEnabled, false);
  assert.equal(t.settings.tractionControl, false);
  assert.equal(t.ui.hudRevealed, true);
  assert.equal(t.ui.idleCinematicActive, false);
  t.bridge.reset();
  assert.equal(t.settings.tractionControl, true);
  assert.equal(t.settings.manualGearbox, true);
});
test('countdown locks both physical motion and keyboard/touch inputs', async () => {
  const t = setup(); await ready(t);
  t.vehicle.setPosition(4, 80, 6);
  t.vehicle.velocity.set(0, 0, 45);
  const input = { forward: true, left: true };
  t.bridge.setInput({ throttle: 1, steer: 1 });
  t.bridge._applyInput(input);
  assert.equal(input.forward, false);
  assert.equal(input.analogThrottle, 0);
  for (let i = 0; i < 120; i++) t.bridge._step(t.vehicle, 1/120, input, [], {}, []);
  assert.deepEqual(t.bridge.readCar().position, { x: 4, y: 80, z: 6 });
  assert.equal(t.bridge.readCar().speed, 0);
});
test('AI pose restores original physical transform and speed without gravitational drift', async () => {
  const t = setup(); await ready(t);
  assert.equal(t.bridge.teleportCar({ position: { x: 10, y: 30, z: 50 }, yaw: Math.PI / 2, speed: 42 }), true);
  for (let i = 0; i < 5; i++) t.bridge._step(t.vehicle, 1/120, {}, [], {}, []);
  const car = t.bridge.readCar();
  assert.deepEqual(car.position, { x: 10, y: 30, z: 50 });
  assert.ok(Math.abs(car.speed - 42) < 1e-7);
  assert.ok(Math.abs(car.yaw - Math.PI / 2) < 1e-7);
  assert.equal(car.wheels.length, 4);
  assert.ok(t.vehicle.rpmRatio > 0);
  assert.equal(t.bridge.teleportCar({ position: { x: NaN, y: 0, z: 0 } }), false);
});
test('taking control resumes original physics; virtual controls coexist with keyboard', async () => {
  const t = setup(); await ready(t);
  t.bridge.teleportCar({ position: { x: 0, y: 30, z: 0 }, speed: 0 });
  t.bridge.setControlEnabled(true);
  t.bridge.setInput({ throttle: 0.8, brake: 0, steer: -0.6 });
  const input = { forward: false, backward: false, left: false, right: false };
  t.bridge._applyInput(input);
  assert.equal(input.analogThrottle, 0.8); assert.equal(input.analogSteer, -0.6);
  // A registered far-away collider permits simulation but provides no contact.
  t.bridge._step(t.vehicle, 1/120, input, [{}], {}, []);
  assert.ok(t.vehicle.position.y < 30, 'physics must run after releasing the grid lock');
  const keyboard = { forward: true, analogThrottle: undefined, analogSteer: undefined };
  t.bridge.setInput({ throttle: 0, brake: 0, steer: 0 }); t.bridge._applyInput(keyboard);
  assert.equal(keyboard.forward, true); assert.equal(keyboard.analogThrottle, undefined);
});
test('opponent snapshot validation keeps at most five cars and reset removes them', async () => {
  const t = setup(); await ready(t);
  assert.equal(t.bridge.renderOpponents(Array.from({ length: 9 }, (_, id) => ({ id, position: { x: id, y: 1, z: 2 }, speed: 20 }))), 5);
  assert.equal(t.bridge.getStatus().opponents, 5);
  t.bridge.reset(); assert.equal(t.bridge.getStatus().opponents, 0);
});
test('repeated poll control updates preserve virtual input and AI authority', async () => {
  const t = setup(); await ready(t);
  t.bridge.setControlEnabled(true);
  t.bridge.setInput({ throttle: 0.7, steer: -0.4 });
  t.bridge.setControlEnabled(true);
  const input = {}; t.bridge._applyInput(input);
  assert.equal(input.analogThrottle, 0.7); assert.equal(input.analogSteer, -0.4);
  t.bridge.setControlEnabled(false);
  t.bridge.teleportCar({ position: { x: 1, y: 2, z: 3 }, speed: 35 });
  t.bridge.setControlEnabled(false);
  t.bridge._step(t.vehicle, 1/120, {}, [], {}, []);
  assert.equal(t.bridge.readCar().speed, 35);
});
test('competitive R or falling requests authoritative recovery without old spawn reset', async () => {
  const t = setup(); await ready(t);
  t.bridge.teleportCar({ position: { x: 23, y: -30, z: 17 }, speed: 0 });
  t.bridge.setControlEnabled(true);
  const received = [];
  const listener = event => received.push(event.detail);
  window.addEventListener('apex-competition-recover', listener);
  try {
    assert.equal(t.bridge._allowNativeRespawn(), false);
    assert.equal(received.length, 1);
    assert.equal(received[0].reason, 'fell-off-track');
    assert.equal(t.bridge.readCar().controlEnabled, false);
    assert.deepEqual(t.bridge.readCar().position, { x: 23, y: -30, z: 17 });
    assert.equal(t.bridge.requestRecovery(), false, 'pending recovery must not fire repeatedly');
    t.bridge.reset();
    assert.equal(t.bridge._allowNativeRespawn(), true, 'single player native recovery must remain');
  } finally { window.removeEventListener('apex-competition-recover', listener); }
});
test('direct scene entry repairs an invalid perspective frustum without changing valid cameras', async () => {
  const t = setup(); await ready(t);
  const camera = new THREE.PerspectiveCamera(45, NaN, .1, 1000);
  assert.ok(camera.projectionMatrix.elements.some(value => !Number.isFinite(value)));
  t.bridge._beforeFrame(t.vehicle, 'lagunaSeca', camera);
  assert.equal(camera.aspect, 1280 / 720);
  assert.ok(camera.projectionMatrix.elements.every(Number.isFinite));
  camera.aspect = 2; camera.updateProjectionMatrix();
  t.bridge._beforeFrame(t.vehicle, 'lagunaSeca', camera);
  assert.equal(camera.aspect, 2, 'a valid rendering viewport must be preserved');
});

test('server-timestamped AI drives the preserved physical car smoothly between HTTP snapshots', async () => {
  const oldPerformance = globalThis.performance;
  let time = 0;
  globalThis.performance = { now: () => time };
  try {
    const { default: configs } = await import(new URL('apps/racing/competition/shared/tracks.mjs', root));
    const { prepareTrack, sampleTrack, projectTrack } = await import(new URL('server/racing/race-engine.mjs', root));
    const course = prepareTrack(configs.lagunaSeca), t = setup(); await ready(t);
    const start = sampleTrack(course, 200, Math.sin(2 * 2.1) * .55);
    t.bridge.teleportCar({ ...start, trackId: 'lagunaSeca', status: 'racing', control: 'ai', isBot: true, slot: 2,
      distance: 200, speed: 35, serverNow: 1700000000000, simAt: 1700000000000, startAt: 1700000000000,
      receivedAt: 0, requestRoundTripMs: 0, raceNumber: 1, laps: 3 });
    let previous = t.bridge.readCar();
    for (let i = 0; i < 240; i++) {
      time += 1000/120;
      t.bridge._step(t.vehicle, 1/120, {}, [], {}, []);
      const car = t.bridge.readCar();
      const movement = Math.hypot(...['x','y','z'].map(axis => car.position[axis] - previous.position[axis]));
      assert.ok(movement > .01 && movement < 1, `rendered physical car advanced ${movement}`);
      assert.ok(car.speed > 10 && car.speed < 100);
      assert.ok(Object.values(car.quaternion).every(Number.isFinite));
      assert.ok(projectTrack(course, Object.values(car.position), 200 + time * .035).lateral < .7);
      previous = car;
    }
  } finally { globalThis.performance = oldPerformance; }
});
