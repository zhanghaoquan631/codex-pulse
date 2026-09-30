import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SqliteD1 } from './helpers/racing-d1.mjs';
import { createRacingHandler } from '../server/racing/racing-http.mjs';
import { createRoomService } from '../server/racing/room-service.mjs';
import { RACE, prepareTrack, createRoomState, advanceRoom, reportDrive, sampleTrack, speedLimit, publicSnapshot } from '../server/racing/race-engine.mjs';
import tracks from '../apps/racing/competition/shared/tracks.mjs';
import { sampleTrack as sharedSampleTrack } from '../apps/racing/competition/shared/track-geometry.mjs';

const schema = readFileSync(new URL('../drizzle/0001_remarkable_preak.sql', import.meta.url), 'utf8');
const circle = { id: 'testTrack', width: 14, points: Array.from({ length: 240 }, (_, i) => {
  const a = i * Math.PI * 2 / 240; return [100 * Math.sin(a), 0, 100 * Math.cos(a)];
}) };
function setup(t, filename = ':memory:') {
  const db = new SqliteD1(filename); db.exec(schema);
  let time = 1_800_000_000_000;
  const handler = createRacingHandler(tracks, { now: () => time });
  t.after(() => db.close());
  async function request(route = '', body, token, key, more = {}) {
    const response = await handler(new Request('https://race.example/api/racing/rooms' + route, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...(key ? { 'Idempotency-Key': key } : {}), ...more.headers },
      ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
    }), { DB: db });
    return { status: response.status, body: await response.json() };
  }
  return { db, request, handler, now: () => time, tick: ms => { time += ms; }, setTime: value => { time = value; } };
}

test('two independent clients create/join a durable room and retry without duplicate seats', async t => {
  const folder = mkdtempSync(path.join(tmpdir(), 'paper-race-'));
  const h = setup(t, path.join(folder, 'race.sqlite'));
  t.after(() => {
    const resolved = path.resolve(folder);
    if (!resolved.startsWith(path.resolve(tmpdir()) + path.sep) || !path.basename(resolved).startsWith('paper-race-')) throw new Error('Unexpected test directory');
    rmSync(resolved, { recursive: true, force: true });
  });
  const createKey = crypto.randomUUID(), create = await h.request('', { name: '房主', trackId: 'apexCircuit' }, null, createKey);
  assert.equal(create.status, 201);
  const { room, playerId, token } = create.body;
  assert.equal(room.players.length, 6); assert.equal(room.hostId, playerId); assert.equal(room.difficulty, 'nightmare');
  const repeat = await h.request('', { name: '房主', trackId: 'apexCircuit' }, null, createKey);
  assert.equal(repeat.body.token, token); assert.equal(repeat.body.room.id, room.id);
  const key = crypto.randomUUID();
  const joined = await h.request(`/${room.id}/join`, { name: '微信好友' }, null, key);
  const retried = await h.request(`/${room.id}/join`, { name: '微信好友' }, null, key);
  assert.equal(joined.status, 200); assert.equal(retried.body.playerId, joined.body.playerId); assert.equal(retried.body.token, joined.body.token);
  assert.equal(retried.body.room.players.filter(p => !p.isBot).length, 2);
  const reopened = new SqliteD1(path.join(folder, 'race.sqlite'));
  const service = createRoomService(reopened, tracks, { now: h.now });
  const persisted = await service.get(room.id); reopened.close();
  assert.equal(persisted.room.players.find(p => p.id === joined.body.playerId).name, '微信好友');
  const publicText = JSON.stringify(persisted);
  for (const secret of [token, joined.body.token, 'authHash', 'joinKeyHash', 'receipts', createKey, key]) assert.ok(!publicText.includes(secret));
  const stored = h.db.sqlite.prepare('SELECT state_json FROM racing_rooms').get().state_json;
  assert.ok(!stored.includes(token)); assert.ok(stored.includes('authHash'));
});

test('host authorization, invalid credentials, cross-origin and size/shape limits', async t => {
  const h = setup(t), owner = (await h.request('', { name: 'A', trackId: 'lagunaSeca' })).body;
  const friend = (await h.request(`/${owner.room.id}/join`, { name: 'B' })).body;
  assert.equal((await h.request(`/${owner.room.id}/start`, {}, friend.token)).status, 403);
  assert.equal((await h.request(`/${owner.room.id}/restart`, {}, friend.token)).status, 403);
  assert.equal((await h.request(`/${owner.room.id}/start`, {}, '0'.repeat(64))).status, 401);
  assert.equal((await h.request(`/${owner.room.id}/heartbeat`, {})).status, 401);
  assert.equal((await h.request('', { name: 'A', trackId: 'apexCircuit' }, null, null, { headers: { Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await h.request('', { name: 'A'.repeat(2500), trackId: 'apexCircuit' })).status, 413);
  assert.equal((await h.request('', '{broken')).status, 400);
  assert.equal((await h.request('', { name: 'A', trackId: 'missing' })).status, 400);
  assert.equal((await h.request(`/${owner.room.id}/state`, { seq: 1, position: [1, null, 2], quaternion: [0, 0, 0, 1], speed: 4 }, owner.token)).status, 400);
  assert.equal((await h.request(`/${owner.room.id}/control`, { mode: 'cheat' }, owner.token)).status, 400);
  assert.equal(await h.handler(new Request('https://race.example/api/profile'), { DB: h.db }), null);
});

test('concurrent joins preserve exactly six seats and duplicate requests share one participant', async t => {
  const h = setup(t), owner = (await h.request('', { name: 'Host', trackId: 'apexCircuit' })).body;
  const shared = crypto.randomUUID();
  const duplicate = await Promise.all(Array.from({ length: 4 }, () => h.request(`/${owner.room.id}/join`, { name: 'Retry' }, null, shared)));
  assert.ok(duplicate.every(r => r.status === 200));
  assert.equal(new Set(duplicate.map(r => r.body.playerId)).size, 1);
  const all = await Promise.all(Array.from({ length: 9 }, (_, i) => h.request(`/${owner.room.id}/join`, { name: `Friend ${i}` })));
  assert.equal(all.filter(r => r.status === 200).length, 4);
  assert.ok(all.filter(r => r.status !== 200).every(r => r.status === 409 && r.body.error === 'room_full'));
  const after = (await h.request(`/${owner.room.id}`)).body.room;
  assert.equal(after.players.filter(p => !p.isBot).length, 6); assert.equal(new Set(after.players.map(p => p.id)).size, 6);
});

test('countdown and eight seconds offline never replace a human driver with AI', async t => {
  const h = setup(t), owner = (await h.request('', { name: 'Host', trackId: 'apexCircuit' })).body;
  const id = owner.room.id, start = await h.request(`/${id}/start`, {}, owner.token, crypto.randomUUID());
  assert.equal(start.body.room.status, 'countdown'); assert.equal(start.body.room.startAt, h.now() + 5000);
  h.tick(4900); await h.request(`/${id}/heartbeat`, {}, owner.token);
  assert.equal((await h.request(`/${id}`)).body.room.status, 'countdown');
  h.tick(200); let snapshot = (await h.request(`/${id}`)).body.room;
  assert.equal(snapshot.status, 'racing');
  const track = prepareTrack(tracks.apexCircuit), pose = sampleTrack(track, 0);
  const drive = await h.request(`/${id}/state`, { seq: 1, ...pose, speed: 30 }, owner.token);
  assert.equal(drive.body.accepted, true);
  const previous = drive.body.room.players[0];
  h.tick(8000); snapshot = (await h.request(`/${id}`)).body.room;
  assert.equal(snapshot.players[0].control, 'human'); assert.equal(snapshot.players[0].connected, false);
  assert.equal(snapshot.players[0].distance, previous.distance); assert.deepEqual(snapshot.players[0].position, previous.position);
  assert.equal(snapshot.players[0].speed, 0); assert.equal(snapshot.players[0].finishedAt, null);
  assert.ok(snapshot.players[1].distance > drive.body.room.players[1].distance, 'AI opponents continue racing');
  const handover = await h.request(`/${id}/control`, { mode: 'ai' }, owner.token, crypto.randomUUID());
  assert.equal(handover.status, 409); assert.equal(handover.body.error, 'human_driving_required');
  const reconnect = await h.request(`/${id}/join`, { name: 'Host' }, owner.token);
  assert.equal(reconnect.body.playerId, owner.playerId); assert.equal(reconnect.body.room.players[0].control, 'human');
  assert.equal(reconnect.body.room.players[0].distance, previous.distance);
  assert.equal(reconnect.body.room.players.filter(p => !p.isBot).length, 1);
  await h.request(`/${id}/control`, { mode: 'human' }, owner.token);
  assert.equal((await h.request(`/${id}`)).body.room.players[0].control, 'human');
});

test('late friend becomes a human at the AI seat progress and waits stationary for their own input', async t => {
  const h = setup(t), owner = (await h.request('', { name: 'Host', trackId: 'lagunaSeca' })).body;
  await h.request(`/${owner.room.id}/start`, {}, owner.token);
  h.tick(25000);
  const before = (await h.request(`/${owner.room.id}`)).body.room.players[1];
  const joined = await h.request(`/${owner.room.id}/join`, { name: 'Late friend' });
  const me = joined.body.room.players.find(p => p.id === joined.body.playerId);
  assert.equal(me.distance, before.distance); assert.deepEqual(me.position, before.position);
  assert.equal(me.control, 'human'); assert.equal(me.connected, true); assert.equal(me.speed, 0);
  h.tick(8000);
  const after = (await h.request(`/${owner.room.id}`)).body.room;
  const idleFriend = after.players.find(p => p.id === joined.body.playerId);
  assert.equal(idleFriend.control, 'human'); assert.equal(idleFriend.distance, me.distance);
  assert.deepEqual(idleFriend.position, me.position); assert.equal(idleFriend.speed, 0);
  assert.ok(after.players[2].distance > joined.body.room.players[2].distance);
});

test('heartbeat-only humans stay human and stationary through loading and idle time', async t => {
  const h = setup(t), owner = (await h.request('', { name: 'Host', trackId: 'apexCircuit' })).body;
  await h.request(`/${owner.room.id}/start`, {}, owner.token);
  for (let i = 0; i < 26; i++) { h.tick(500); await h.request(`/${owner.room.id}/heartbeat`, {}, owner.token); }
  let snapshot = (await h.request(`/${owner.room.id}`)).body.room;
  assert.equal(snapshot.players[0].control, 'human'); assert.equal(snapshot.players[0].connected, true);
  h.tick(1000); snapshot = (await h.request(`/${owner.room.id}/heartbeat`, {}, owner.token)).body.room;
  assert.equal(snapshot.players[0].control, 'human'); assert.equal(snapshot.players[0].connected, true);
  assert.equal(snapshot.players[0].distance, -4); assert.equal(snapshot.players[0].speed, 0);
  await h.request(`/${owner.room.id}/control`, { mode: 'human' }, owner.token);
  for (let i = 0; i < 10; i++) { h.tick(500); await h.request(`/${owner.room.id}/heartbeat`, {}, owner.token); }
  assert.equal((await h.request(`/${owner.room.id}`)).body.room.players[0].control, 'human');
});

test('sequence dedupe, speed/time bounds, impossible teleport and fake client lap cannot advance race', async t => {
  const h = setup(t), owner = (await h.request('', { name: 'Host', trackId: 'apexCircuit' })).body;
  await h.request(`/${owner.room.id}/start`, {}, owner.token);
  h.tick(4900); await h.request(`/${owner.room.id}/heartbeat`, {}, owner.token); h.tick(500);
  const track = prepareTrack(tracks.apexCircuit), pose = sampleTrack(track, 3);
  const good = await h.request(`/${owner.room.id}/state`, { seq: 1, ...pose, speed: 20 }, owner.token);
  assert.equal(good.body.accepted, true); assert.ok(Math.abs(good.body.room.players[0].distance - 3) < 0.01);
  h.tick(100);
  const distant = sampleTrack(track, 500);
  const jump = await h.request(`/${owner.room.id}/state`, { seq: 2, ...distant, speed: 100, lap: 3, progress: 1 }, owner.token);
  assert.equal(jump.body.accepted, false); assert.equal(jump.body.reason, 'invalid_movement');
  assert.equal(jump.body.room.players[0].distance, good.body.room.players[0].distance);
  assert.equal(jump.body.room.players[0].lap, 1);
  const stale = await h.request(`/${owner.room.id}/state`, { seq: 1, ...pose, speed: 10 }, owner.token);
  assert.equal(stale.body.reason, 'stale_sequence');
});

test('real road AI is deterministic across polling schedules, brakes for bends and finishes three measured laps', () => {
  for (const config of Object.values(tracks)) {
    const track = prepareTrack(config), base = createRoomState({ id: 'room', trackId: config.id, playerId: 'host', name: 'Host', authHash: 'hash', now: 100000 }, track);
    base.status = 'countdown'; base.startAt = 105000; base.players[0].isBot = true; base.players[0].control = 'ai';
    const one = structuredClone(base), many = structuredClone(base);
    advanceRoom(one, track, 140000);
    for (let time = 100037; time < 140000; time += 37) advanceRoom(many, track, time);
    advanceRoom(many, track, 140000);
    assert.deepEqual(one.players.map(p => [p.distance, p.speed]), many.players.map(p => [p.distance, p.speed]));
    const speeds = Array.from({ length: 100 }, (_, i) => speedLimit(track, track.length * i / 100));
    assert.ok(Math.max(...speeds) - Math.min(...speeds) > 15, 'bend-sensitive speeds');
    advanceRoom(one, track, base.startAt + 600000);
    assert.equal(one.status, 'finished'); assert.ok(one.players.every(p => p.finishedAt > base.startAt && p.distance === track.length * 3));
    const publicRoom = publicSnapshot(one, track, base.startAt + 600000);
    assert.equal(publicRoom.podium.length, 3); assert.equal(new Set(publicRoom.podium).size, 3);
    for (let i = 1; i < 6; i++) {
      const prev = publicRoom.players.find(p => p.place === i), next = publicRoom.players.find(p => p.place === i + 1);
      assert.ok(prev.finishedAt <= next.finishedAt);
    }
    console.log(`${config.id}: ${track.length.toFixed(1)}m × 3; AI winner ${((Math.min(...one.players.map(p => p.finishedAt)) - base.startAt) / 1000).toFixed(2)}s; speed ${(Math.min(...speeds) * 3.6).toFixed(0)}–${(Math.max(...speeds) * 3.6).toFixed(0)} km/h`);
  }
});

test('human progress counts all three contiguous laps, backwards driving cannot accumulate fake laps', () => {
  const track = prepareTrack(circle), state = createRoomState({ id: 'r', trackId: circle.id, playerId: 'h', name: 'H', authHash: 'x', now: 100000 }, track);
  state.status = 'racing'; state.startAt = 100000;
  const player = state.players[0]; let time = 100000, seq = 0;
  const drive = distance => { time += 100; return reportDrive(state, player, { seq: ++seq, ...sampleTrack(track, distance), speed: 20 }, track, time); };
  for (let d = -2; d <= 60; d += 2) assert.equal(drive(d).accepted, true);
  for (let d = 58; d >= 0; d -= 2) assert.equal(drive(d).accepted, true);
  assert.ok(Math.abs(player.distance) < 0.001); assert.equal(player.finishedAt, null);
  for (let d = 2; d < track.length * 3; d += 2) assert.equal(drive(d).accepted, true);
  assert.equal(player.finishedAt, null); assert.equal(publicSnapshot(state, track, time).players[0].lap, 3);
  assert.equal(drive(track.length * 3 + 1).accepted, true);
  assert.equal(player.distance, track.length * 3); assert.ok(player.finishedAt);
});

test('podium is authoritative before a slow active human finishes; remaining driver retains their full race', () => {
  const track = prepareTrack(tracks.apexCircuit), state = createRoomState({ id: 'r', trackId: track.id, playerId: 'h', name: 'H', authHash: 'x', now: 100000 }, track);
  state.status = 'racing'; state.startAt = 100000;
  const human = state.players[0]; let seq = 0;
  for (let now = 100250; now <= 225000; now += 250) {
    advanceRoom(state, track, now);
    assert.equal(reportDrive(state, human, { seq: ++seq, position: human.position, quaternion: human.quaternion, speed: 0 }, track, now).accepted, true);
  }
  const partial = publicSnapshot(state, track, 225000);
  assert.equal(partial.status, 'racing'); assert.equal(partial.podium.length, 3);
  assert.equal(partial.players.find(p => p.id === 'h').finishedAt, null);
  assert.ok(partial.players.filter(p => p.isBot).every(p => p.finishedAt));
  const podium = [...partial.podium]; let now = 225000;
  for (let distance = human.distance + 3; distance < track.length * 3; distance += 3) {
    now += 100; advanceRoom(state, track, now);
    assert.equal(reportDrive(state, human, { seq: ++seq, ...sampleTrack(track, distance), speed: 30 }, track, now).accepted, true);
  }
  now += 100;
  assert.equal(reportDrive(state, human, { seq: ++seq, ...sampleTrack(track, track.length * 3 + .1), speed: 30 }, track, now).accepted, true);
  const final = publicSnapshot(state, track, now);
  assert.equal(final.status, 'finished'); assert.deepEqual(final.podium, podium);
  assert.equal(final.players.find(p => p.id === 'h').place, 6);
});

test('server pose agrees with measured road banking/elevation and original +Z orientation', () => {
  for (const config of Object.values(tracks)) {
    const track = prepareTrack(config);
    for (let d = 0; d < track.length; d += 7) for (const lane of [-2, 0, 2]) {
      const server = sampleTrack(track, d, lane), shared = sharedSampleTrack(config.id, d, lane);
      const p = shared.position, q = shared.quaternion;
      assert.ok(Math.hypot(server.position[0] - p.x, server.position[1] - p.y, server.position[2] - p.z) < 0.0001);
      const dot = server.quaternion.reduce((sum, n, i) => sum + n * [q.x, q.y, q.z, q.w][i], 0);
      assert.ok(Math.abs(dot) > 0.9999999, `orientation at ${config.id}:${d}`);
    }
  }
});

test('reset restores the road at current progress, zeroes speed and preserves participant/control', async t => {
  const h = setup(t), owner = (await h.request('', { name: 'Host', trackId: 'lagunaSeca' })).body;
  await h.request(`/${owner.room.id}/start`, {}, owner.token); h.tick(45000);
  let snapshot = (await h.request(`/${owner.room.id}/control`, { mode: 'human' }, owner.token)).body.room;
  const before = snapshot.players[0], key = crypto.randomUUID();
  const reset = await h.request(`/${owner.room.id}/reset`, {}, owner.token, key);
  const after = reset.body.room.players[0], pose = sharedSampleTrack('lagunaSeca', before.distance);
  assert.equal(after.id, owner.playerId); assert.equal(after.distance, before.distance);
  assert.equal(after.speed, 0); assert.equal(after.control, 'human');
  assert.ok(Math.hypot(after.position[0] - pose.position.x, after.position[1] - pose.position.y, after.position[2] - pose.position.z) < .0001);
  h.tick(1000);
  assert.equal((await h.request(`/${owner.room.id}/reset`, {}, owner.token, key)).body.room.players[0].distance, before.distance);
});

test('host restart is idempotent, resets progress, preserves participant identity, and rooms expire', async t => {
  const h = setup(t), owner = (await h.request('', { name: 'Host', trackId: 'apexCircuit' })).body;
  const friend = (await h.request(`/${owner.room.id}/join`, { name: 'Friend' })).body;
  await h.request(`/${owner.room.id}/start`, {}, owner.token); h.tick(15000);
  const key = crypto.randomUUID();
  const reset = await h.request(`/${owner.room.id}/restart`, {}, owner.token, key);
  assert.equal(reset.body.room.status, 'lobby'); assert.equal(reset.body.room.raceNumber, 2);
  assert.equal(reset.body.room.players[1].id, friend.playerId); assert.ok(reset.body.room.players.every(p => p.distance < 0));
  assert.ok(reset.body.room.players.filter(p => !p.isBot).every(p => p.control === 'human'));
  await h.request(`/${owner.room.id}/start`, {}, owner.token);
  const repeated = await h.request(`/${owner.room.id}/restart`, {}, owner.token, key);
  assert.equal(repeated.body.room.status, 'countdown'); assert.equal(repeated.body.room.raceNumber, 2);
  h.tick(RACE.lifetimeMs);
  assert.equal((await h.request(`/${owner.room.id}`)).status, 410);
  await h.request('', { name: 'New', trackId: 'apexCircuit' });
  assert.equal(h.db.sqlite.prepare('SELECT COUNT(*) AS n FROM racing_rooms WHERE id = ?').get(owner.room.id).n, 0);
});

test('legacy delegated humans normalize to manual driving without free progress on GET, heartbeat or rejoin', async t => {
  const h = setup(t), owner = (await h.request('', { name: 'Legacy driver', trackId: 'apexCircuit' })).body;
  await h.request(`/${owner.room.id}/start`, {}, owner.token);
  const row = h.db.sqlite.prepare('SELECT state_json FROM racing_rooms WHERE id=?').get(owner.room.id);
  const legacy = JSON.parse(row.state_json), prior = legacy.players[0];
  prior.control = 'ai'; prior.speed = 70; prior.takeoverAt = legacy.startAt;
  h.db.sqlite.prepare('UPDATE racing_rooms SET state_json=? WHERE id=?').run(JSON.stringify(legacy), owner.room.id);
  h.tick(20000);
  for (const result of [await h.request(`/${owner.room.id}`), await h.request(`/${owner.room.id}/heartbeat`, {}, owner.token), await h.request(`/${owner.room.id}/join`, { name: 'Legacy driver' }, owner.token)]) {
    const me = result.body.room.players[0];
    assert.equal(me.control, 'human'); assert.equal(me.distance, prior.distance); assert.deepEqual(me.position, prior.position);
    assert.equal(me.speed, 0); assert.equal(me.takeoverAt, null); assert.equal(me.finishedAt, null);
  }
});

test('leaving a race parks the human without converting it into a bot', async t => {
  const h = setup(t), owner = (await h.request('', { name: 'Host', trackId: 'apexCircuit' })).body;
  await h.request(`/${owner.room.id}/start`, {}, owner.token); h.tick(6000);
  const before = (await h.request(`/${owner.room.id}`)).body.room.players[0];
  assert.equal((await h.request(`/${owner.room.id}/leave`, {}, owner.token)).status, 200);
  h.tick(8000);
  const after = (await h.request(`/${owner.room.id}`)).body.room.players[0];
  assert.equal(after.control, 'human'); assert.equal(after.isBot, false); assert.equal(after.connected, false);
  assert.equal(after.speed, 0); assert.equal(after.distance, before.distance);
});

