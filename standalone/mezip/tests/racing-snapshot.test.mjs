import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRoomService } from '../server/racing/room-service.mjs';
import { prepareTrack, advanceRoom, publicSnapshot, sampleTrack, RACE } from '../server/racing/race-engine.mjs';
import { SqliteD1 } from './helpers/racing-d1.mjs';
import tracks from '../apps/racing/competition/shared/tracks.mjs';

const schema = readFileSync(new URL('../drizzle/0001_remarkable_preak.sql', import.meta.url), 'utf8');
function setup(t, { readDelay = 0, writeDelay = 0 } = {}) {
  const sqlite = new SqliteD1(); sqlite.exec(schema); t.after(() => sqlite.close());
  let time = 1_800_000_000_000;
  const db = {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      return {
        bind(...values) { statement.bind(...values); return this; },
        async first(...args) { const value = await statement.first(...args); time += readDelay; return value; },
        async run() { const value = await statement.run(); time += writeDelay; return value; },
      };
    },
  };
  const service = createRoomService(db, tracks, { now: () => time });
  return { sqlite, service, now: () => time, at: value => { time = value; }, tick: value => { time += value; } };
}

test('GET AI trajectory has exact simAt despite unchanged D1 revision and fractional request times', async t => {
  const f = setup(t), host = await f.service.create({ name: 'Host', trackId: 'apexCircuit' });
  assert.equal(host.room.simAt, host.room.serverNow);
  f.tick(37);
  const lobby = await f.service.get(host.room.id);
  assert.equal(lobby.room.simAt, f.now()); assert.equal(lobby.room.revision, 0);
  const start = await f.service.action(host.room.id, 'start', {}, host.token), startAt = start.room.startAt;
  f.at(startAt - 23);
  const countdown = await f.service.get(host.room.id);
  assert.equal(countdown.room.status, 'countdown'); assert.equal(countdown.room.simAt, f.now());
  const persisted = f.sqlite.sqlite.prepare('SELECT state_json, revision FROM racing_rooms WHERE id=?').get(host.room.id);
  f.at(startAt + 376);
  const first = (await f.service.get(host.room.id)).room;
  assert.equal(first.status, 'racing'); assert.equal(first.simAt, startAt + 300); assert.equal(first.serverNow, startAt + 376);
  const expectedState = JSON.parse(persisted.state_json), track = prepareTrack(tracks.apexCircuit);
  advanceRoom(expectedState, track, first.simAt);
  const expected = publicSnapshot(expectedState, track, first.serverNow);
  assert.deepEqual(first.players, expected.players, 'every public pose/velocity/distance corresponds to this integration cursor');
  for (const player of first.players.filter(p => p.control === 'ai')) {
    const route = sampleTrack(track, player.distance, Math.sin(player.slot * 2.1) * .55);
    assert.deepEqual(player.position, route.position); assert.deepEqual(player.quaternion, route.quaternion);
  }
  f.at(startAt + 426);
  const second = (await f.service.get(host.room.id)).room;
  assert.equal(second.simAt, startAt + 400); assert.equal(second.revision, first.revision);
  assert.ok(second.players[1].distance > first.players[1].distance);
  assert.deepEqual(f.sqlite.sqlite.prepare('SELECT state_json, revision FROM racing_rooms WHERE id=?').get(host.room.id), persisted, 'GET remains read-only');
  f.at(startAt + RACE.maxRaceMs + 73);
  const finished = (await f.service.get(host.room.id)).room;
  assert.equal(finished.status, 'finished'); assert.ok(finished.simAt < finished.serverNow);
  assert.ok(finished.players.filter(p => p.isBot).every(p => p.finishedAt <= finished.simAt));
  assert.equal(finished.players[0].dnf, true); assert.equal(finished.players[0].finishedAt, null);
  f.tick(1000);
  assert.equal((await f.service.get(host.room.id)).room.simAt, finished.simAt, 'finished cursor is stable, never predicts beyond the finish');
});

test('serverNow is response time after slow D1 IO while simAt remains the actual simulation time', async t => {
  const f = setup(t, { readDelay: 213, writeDelay: 287 });
  const created = await f.service.create({ name: 'Host', trackId: 'lagunaSeca' });
  assert.equal(created.room.serverNow, f.now()); assert.equal(created.room.simAt, f.now());
  const started = await f.service.action(created.room.id, 'start', {}, created.token), startAt = started.room.startAt;
  assert.equal(started.room.serverNow, f.now()); assert.equal(started.room.simAt, started.room.serverNow);
  f.at(startAt + 1000);
  const heartbeat = await f.service.action(created.room.id, 'heartbeat', {}, created.token);
  assert.equal(heartbeat.room.serverNow, f.now());
  assert.equal(heartbeat.room.simAt, startAt + 1200);
  assert.equal(heartbeat.room.serverNow, startAt + 1500);
  const beforeRead = f.now(), read = await f.service.get(created.room.id);
  assert.equal(read.room.serverNow, beforeRead + 213);
  assert.equal(read.room.simAt, startAt + 1700);
  assert.ok(read.room.serverNow - read.room.simAt < 100, 'GET integrates after D1 read rather than retaining its old request timestamp');
});

test('explicit reset exposes its event time, retries retain it, and same-distance reset remains detectable', async t => {
  const f = setup(t), host = await f.service.create({ name: 'Host', trackId: 'apexCircuit' });
  const started = await f.service.action(host.room.id, 'start', {}, host.token), startAt = started.room.startAt;
  f.at(startAt + 1555);
  await f.service.action(host.room.id, 'state', { seq: 1, ...sampleTrack(prepareTrack(tracks.apexCircuit), 12), speed: 35 }, host.token);
  const before = (await f.service.get(host.room.id)).room.players[0], key = crypto.randomUUID();
  const reset = (await f.service.action(host.room.id, 'reset', {}, host.token, key)).room;
  const player = reset.players[0];
  assert.equal(player.distance, before.distance); assert.equal(player.resetAt, startAt + 1555);
  assert.equal(player.takeoverAt, null); assert.equal(player.speed, 0); assert.equal(player.control, 'human');
  assert.equal(reset.simAt, startAt + 1500);
  f.tick(31);
  const retry = (await f.service.action(host.room.id, 'reset', {}, host.token, key)).room.players[0];
  assert.equal(retry.resetAt, player.resetAt); assert.equal(retry.distance, player.distance);
  f.at(startAt + 1700);
  const later = (await f.service.get(host.room.id)).room.players[0];
  assert.equal(later.resetAt, player.resetAt); assert.equal(later.distance, player.distance);
  const restarted = (await f.service.action(host.room.id, 'restart', {}, host.token)).room;
  assert.equal(restarted.raceNumber, 2); assert.ok(restarted.players.every(p => p.resetAt === null));
});

test('restart keeps every participant human, including offline and legacy AI-tagged humans', async t => {
  const f = setup(t), host = await f.service.create({ name: 'Host', trackId: 'apexCircuit' });
  const ai = await f.service.join(host.room.id, { name: 'Online AI' });
  const offline = await f.service.join(host.room.id, { name: 'Offline' });
  const human = await f.service.join(host.room.id, { name: 'Online human' });
  const legacyRow = f.sqlite.sqlite.prepare('SELECT state_json FROM racing_rooms WHERE id=?').get(host.room.id);
  const legacyState = JSON.parse(legacyRow.state_json);
  legacyState.players.find(p => p.id === ai.playerId).control = 'ai';
  f.sqlite.sqlite.prepare('UPDATE racing_rooms SET state_json=? WHERE id=?').run(JSON.stringify(legacyState), host.room.id);
  const started = await f.service.action(host.room.id, 'start', {}, host.token);
  f.at(started.room.startAt + 1000);
  await f.service.action(host.room.id, 'heartbeat', {}, host.token);
  await f.service.action(host.room.id, 'heartbeat', {}, ai.token);
  await f.service.action(host.room.id, 'heartbeat', {}, human.token);
  const restarted = (await f.service.action(host.room.id, 'restart', {}, host.token)).room;
  const modes = new Map(restarted.players.map(p => [p.id, p.control]));
  assert.equal(modes.get(host.playerId), 'human'); assert.equal(modes.get(human.playerId), 'human');
  assert.equal(modes.get(ai.playerId), 'human'); assert.equal(modes.get(offline.playerId), 'human');
  const reloadHeartbeat = (await f.service.action(host.room.id, 'heartbeat', {}, ai.token)).room;
  assert.equal(reloadHeartbeat.players.find(p => p.id === ai.playerId).control, 'human');
  const rejoin = await f.service.join(host.room.id, { name: 'Online AI' }, undefined, ai.token);
  assert.equal(rejoin.room.players.find(p => p.id === ai.playerId).control, 'human');
});

