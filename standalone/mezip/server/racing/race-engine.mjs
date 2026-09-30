// All distances are metres and speeds metres/second. The server owns race time,
// progress validation, AI movement, finish times and the podium.
export const RACE = Object.freeze({ seats: 6, laps: 3, countdownMs: 5000, disconnectMs: 4000, lifetimeMs: 86_400_000, maxRaceMs: 1_200_000, stepMs: 100 });
const COLORS = ['#245b89', '#e06643', '#8a5eaa', '#328b70', '#d18a19', '#c54c78'];
const BOT_NAMES = ['疾风', '刃锋', '逐电', '疾影', '赤焰', '极昼'];
const mod = (a, b) => ((a % b) + b) % b;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const vec = p => Array.isArray(p) ? p : [p.x, p.y, p.z];
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export function prepareTrack(config) {
  const vertices = config.points.map(vec);
  if (vertices.length < 4 || vertices.some(p => p.length !== 3 || p.some(n => !Number.isFinite(n)))) throw new Error('Invalid race route');
  if (dist3(vertices[0], vertices.at(-1)) < 0.001) vertices.pop();
  let length = 0;
  const segments = vertices.map((a, i) => {
    const b = vertices[(i + 1) % vertices.length], len = dist3(a, b);
    const segment = { a, b, len, s: length, v: b.map((n, j) => n - a[j]),
      bankA: config.points[i]?.bankSlope || 0, bankB: config.points[(i + 1) % vertices.length]?.bankSlope || 0 };
    length += len;
    return segment;
  });
  if (segments.some(s => s.len < 0.001) || length < 50) throw new Error('Degenerate race route');
  const track = { id: config.id, width: config.width || 14, segments, length };
  // The speed envelope anticipates bends, then propagates braking limits backward
  // and acceleration limits forward. Every opponent uses this hardest setting.
  const count = Math.max(100, Math.ceil(length / 5)), ds = length / count;
  const limits = Array.from({ length: count }, (_, i) => {
    const before = sampleTrack(track, i * ds - 10).tangent;
    const after = sampleTrack(track, i * ds + 10).tangent;
    const angle = Math.acos(clamp(before.reduce((sum, n, j) => sum + n * after[j], 0), -1, 1));
    return Math.min(86, Math.sqrt(21.5 / Math.max(angle / 20, 0.0025)));
  });
  for (let pass = 0; pass < 4; pass++) {
    for (let i = count - 1; i >= 0; i--) limits[i] = Math.min(limits[i], Math.sqrt(limits[(i + 1) % count] ** 2 + 2 * 33 * ds));
    for (let i = 0; i < count; i++) limits[(i + 1) % count] = Math.min(limits[(i + 1) % count], Math.sqrt(limits[i] ** 2 + 2 * 13.5 * ds));
  }
  track.speedProfile = { limits, ds };
  return track;
}

function routePoint(track, distance) {
  const s = mod(distance, track.length), segments = track.segments;
  let lo = 0, hi = segments.length - 1;
  while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (segments[mid].s <= s) lo = mid; else hi = mid - 1; }
  const seg = segments[lo], f = clamp((s - seg.s) / seg.len, 0, 1);
  const position = seg.a.map((n, j) => n + seg.v[j] * f);
  return { position, bankSlope: seg.bankA * (1 - f) + seg.bankB * f };
}

export function sampleTrack(track, distance, lateral = 0) {
  const { position, bankSlope } = routePoint(track, distance), before = routePoint(track, distance - 3).position, after = routePoint(track, distance + 3).position;
  const direction = after.map((n, i) => n - before[i]), norm = Math.hypot(...direction);
  const tangent = direction.map(n => n / norm);
  const horizontal = Math.hypot(tangent[0], tangent[2]) || 1;
  position[0] += tangent[2] / horizontal * lateral;
  position[1] += bankSlope * lateral;
  position[2] -= tangent[0] / horizontal * lateral;
  // Original vehicle meshes face local +Z. Include pitch for elevation changes.
  const yaw = Math.atan2(tangent[0], tangent[2]), pitch = -Math.atan2(tangent[1], horizontal);
  const sy = Math.sin(yaw / 2), cy = Math.cos(yaw / 2), sx = Math.sin(pitch / 2), cx = Math.cos(pitch / 2);
  const [x, y, z, w] = [cy * sx, sy * cx, -sy * sx, cy * cx];
  const bank = Math.atan(bankSlope * horizontal) / 2, s = Math.sin(bank), c = Math.cos(bank);
  return { position, quaternion: [x * c + y * s, y * c - x * s, z * c + w * s, w * c - z * s], tangent };
}

export function projectTrack(track, position, nearDistance = 0) {
  let best;
  for (const seg of track.segments) {
    const dot = seg.v.reduce((sum, n, j) => sum + n * (position[j] - seg.a[j]), 0);
    const f = clamp(dot / (seg.len * seg.len), 0, 1);
    const projected = seg.a.map((n, j) => n + f * seg.v[j]);
    const lateral = dist3(position, projected), s = seg.s + f * seg.len;
    const distance = nearDistance + mod(s - nearDistance + track.length / 2, track.length) - track.length / 2;
    // At bridges/crossovers, favor the nearby race segment; distant strands must
    // not steal the projection merely because the vehicle is one metre closer.
    const score = lateral + Math.max(0, Math.abs(distance - nearDistance) - 150) * 0.2;
    if (!best || score < best.score) best = { distance, lateral, position: projected, score };
  }
  return best;
}

export function speedLimit(track, distance, slot = 0) {
  const { limits, ds } = track.speedProfile, at = mod(distance, track.length) / ds;
  const i = Math.floor(at), f = at - i;
  // Slightly distinct deterministic racing lines/pace; none is an easy opponent.
  return (limits[i] * (1 - f) + limits[(i + 1) % limits.length] * f) * (1 - (slot % 3) * 0.004);
}

export function resetPlayer(player, track, now) {
  player.distance = -4 - Math.floor(player.slot / 2) * 7 - (player.slot % 2) * 2;
  const pose = sampleTrack(track, player.distance, player.slot % 2 ? 1.8 : -1.8);
  Object.assign(player, pose, { speed: 0, finishedAt: null, dnf: false, lastSeq: -1, lastDriveAt: now, rejectedMoves: 0, resetAt: null });
  delete player.tangent;
}

export function makeBot(slot, track, now, raceNumber = 0) {
  const player = { id: `bot-${raceNumber}-${slot}`, slot, name: `${BOT_NAMES[slot]} · AI`, color: COLORS[slot], isBot: true, control: 'ai', lastSeenAt: now, takeoverAt: null };
  resetPlayer(player, track, now);
  return player;
}

export function createRoomState({ id, trackId, playerId, name, authHash, createKeyHash, now }, track) {
  const players = Array.from({ length: RACE.seats }, (_, slot) => makeBot(slot, track, now));
  Object.assign(players[0], { id: playerId, name, isBot: false, control: 'human', authHash, joinKeyHash: createKeyHash });
  return { id, trackId, status: 'lobby', startAt: null, createdAt: now, expiresAt: now + RACE.lifetimeMs, simAt: now, raceNumber: 1, laps: RACE.laps, hostId: playerId, players, receipts: [], revision: 0 };
}

function moveAi(player, track, from, to) {
  if (player.finishedAt || player.dnf || to <= from) return;
  const dt = (to - from) / 1000, previousDistance = player.distance;
  const target = speedLimit(track, player.distance + player.speed * dt, player.slot);
  const nextSpeed = clamp(target, Math.max(0, player.speed - 33 * dt), player.speed + 13.5 * dt);
  player.distance += (player.speed + nextSpeed) * 0.5 * dt;
  player.speed = nextSpeed;
  const finish = track.length * RACE.laps;
  if (player.distance >= finish) {
    player.finishedAt = Math.round(from + (to - from) * (finish - previousDistance) / (player.distance - previousDistance));
    player.distance = finish; player.speed = 0;
  }
}

export function rankPlayers(room) {
  return [...room.players].sort((a, b) => {
    if (a.finishedAt && b.finishedAt) return a.finishedAt - b.finishedAt || a.slot - b.slot;
    if (a.finishedAt) return -1;
    if (b.finishedAt) return 1;
    return b.distance - a.distance || a.slot - b.slot;
  });
}

export function advanceRoom(room, track, now) {
  now = Math.max(room.simAt, now);
  // AI is an opponent type, never a substitute for a human driver. Normalize
  // legacy rooms that stored delegated humans without granting them more laps.
  for (const player of room.players) {
    if (player.isBot) { player.control = 'ai'; continue; }
    const wasDelegated = player.control === 'ai';
    player.control = 'human'; player.takeoverAt = null;
    if (wasDelegated || now - player.lastDriveAt >= RACE.disconnectMs || now - player.lastSeenAt >= RACE.disconnectMs) player.speed = 0;
  }
  if (room.status === 'lobby') { room.simAt = now; return; }
  if (room.status === 'finished') return;
  if (now < room.startAt) { room.simAt = now; return; }
  room.status = 'racing';
  let from = Math.max(room.startAt, room.simAt);
  const end = Math.min(room.startAt + Math.floor((now - room.startAt) / RACE.stepMs) * RACE.stepMs, room.startAt + RACE.maxRaceMs);
  while (from < end) {
    // Fixed boundaries give identical results regardless of polling frequency.
    const to = Math.min(end, room.startAt + (Math.floor((from - room.startAt) / RACE.stepMs) + 1) * RACE.stepMs);
    for (const player of room.players) {
      if (player.isBot) moveAi(player, track, from, to);
    }
    from = to;
    if (room.players.every(p => p.finishedAt || p.dnf)) break;
  }
  room.simAt = from;
  for (const player of room.players) {
    if (player.isBot) {
      const pose = sampleTrack(track, player.distance, Math.sin(player.slot * 2.1) * 0.55);
      player.position = pose.position; player.quaternion = pose.quaternion;
    }
  }
  if (now >= room.startAt + RACE.maxRaceMs) for (const player of room.players) if (!player.finishedAt) { player.dnf = true; player.speed = 0; }
  if (room.players.every(p => p.finishedAt || p.dnf)) room.status = 'finished';
}

export function reportDrive(room, player, input, track, now) {
  player.lastSeenAt = now;
  if (room.status !== 'racing' || player.control !== 'human' || player.finishedAt || player.dnf) return { accepted: false, reason: 'not_driving' };
  if (input.seq <= player.lastSeq) return { accepted: false, reason: 'stale_sequence' };
  player.lastSeq = input.seq;
  const projection = projectTrack(track, input.position, player.distance);
  const elapsed = clamp((now - player.lastDriveAt) / 1000, 0, 1.5);
  const movement = dist3(player.position, input.position), delta = projection.distance - player.distance;
  const allowed = 105 * elapsed + 5;
  // High absolute speed alone cannot manufacture progress. Both spatial motion
  // and contiguous road distance must fit the same server-measured time window.
  if (movement > allowed || Math.abs(delta) > allowed || Math.abs(delta) > movement * 1.9 + 8) {
    player.rejectedMoves++;
    return { accepted: false, reason: 'invalid_movement' };
  }
  const oldDistance = player.distance, previousAt = player.lastDriveAt;
  player.position = [...input.position];
  const norm = Math.hypot(...input.quaternion);
  player.quaternion = input.quaternion.map(n => n / norm);
  player.speed = clamp(input.speed, 0, 105);
  player.lastDriveAt = now;
  // Off-track excursions remain visible but do not advance the race clock/laps.
  if (projection.lateral <= track.width / 2 + 8) player.distance = Math.max(-50, projection.distance);
  const finish = track.length * RACE.laps;
  if (player.distance >= finish && oldDistance < finish) {
    const fraction = (finish - oldDistance) / (player.distance - oldDistance);
    player.finishedAt = Math.round(Math.max(room.startAt, previousAt) + fraction * (now - Math.max(room.startAt, previousAt)));
    player.distance = finish; player.speed = 0;
    if (room.players.every(p => p.finishedAt || p.dnf)) room.status = 'finished';
  }
  return { accepted: true };
}

export function publicSnapshot(room, track, now) {
  const ranked = rankPlayers(room), place = new Map(ranked.map((p, i) => [p.id, i + 1]));
  const players = room.players.map(p => ({
    id: p.id, name: p.name, slot: p.slot, color: p.color, isBot: p.isBot, control: p.control,
    connected: !p.isBot && now - p.lastSeenAt < RACE.disconnectMs,
    place: place.get(p.id), lap: p.finishedAt ? RACE.laps : clamp(Math.floor(Math.max(0, p.distance) / track.length) + 1, 1, RACE.laps),
    progress: p.finishedAt ? 1 : p.distance < 0 ? 0 : mod(p.distance, track.length) / track.length,
    distance: p.distance, position: p.position, quaternion: p.quaternion, speed: p.speed,
    finishedAt: p.finishedAt, dnf: p.dnf, takeoverAt: p.takeoverAt, resetAt: p.resetAt ?? null,
  }));
  // AI distance/speed/pose share this integration cursor. In racing it is the
  // last completed 100 ms tick, not the later HTTP request time. Stationary
  // lobby/countdown snapshots can be sampled at serverNow without prediction.
  const simAt = room.status === 'lobby' || room.status === 'countdown' ? now : room.simAt;
  return { id: room.id, trackId: room.trackId, status: room.status, startAt: room.startAt, serverNow: now, simAt,
    createdAt: room.createdAt, expiresAt: room.expiresAt, revision: room.revision, raceNumber: room.raceNumber,
    hostId: room.hostId, laps: RACE.laps, difficulty: 'nightmare', trackLength: track.length,
    players, podium: ranked.filter(p => p.finishedAt).slice(0, 3).map(p => p.id) };
}
