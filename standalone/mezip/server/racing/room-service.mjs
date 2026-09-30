import { RACE, prepareTrack, createRoomState, advanceRoom, publicSnapshot, resetPlayer, makeBot, reportDrive, sampleTrack } from './race-engine.mjs';

export class RaceError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const fail = (status, code, message) => { throw new RaceError(status, code, message); };
const hex = bytes => [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
const random = () => hex(crypto.getRandomValues(new Uint8Array(16)));
const hash = async value => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))));
const tokenFor = (key, roomId, playerId) => hash(`paper-racing-token:v1:${key}:${roomId}:${playerId}`);
const cleanName = value => {
  if (typeof value !== 'string') fail(400, 'invalid_name', '请输入车手昵称');
  const name = value.normalize('NFKC').replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f]/g, '').trim();
  if (!name || [...name].length > 20) fail(400, 'invalid_name', '昵称需要 1–20 个字');
  return name;
};
const finiteVector = (v, count, max) => Array.isArray(v) && v.length === count && v.every(n => Number.isFinite(n) && Math.abs(n) <= max);
const preparedTrackSets = new WeakMap();
function validateDrive(body) {
  if (!Number.isSafeInteger(body.seq) || body.seq < 0 || !finiteVector(body.position, 3, 100_000)
    || !finiteVector(body.quaternion, 4, 1.1) || Math.hypot(...body.quaternion) < 0.5
    || !Number.isFinite(body.speed) || body.speed < 0 || body.speed > 300) fail(400, 'invalid_state', '车辆状态无效');
}

export function createRoomService(database, trackConfigs, { now = () => Date.now() } = {}) {
  const db = typeof database.withSession === 'function' ? database.withSession('first-primary') : database;
  let tracks = preparedTrackSets.get(trackConfigs);
  if (!tracks) {
    const values = Array.isArray(trackConfigs) ? trackConfigs : Object.values(trackConfigs.tracks || trackConfigs);
    tracks = new Map(values.map(config => [config.id, prepareTrack(config)]));
    preparedTrackSets.set(trackConfigs, tracks);
  }
  const trackFor = id => tracks.get(id) || fail(400, 'invalid_track', '赛道不存在');
  const read = async (id, time) => {
    const row = await db.prepare('SELECT state_json, revision, expires_at FROM racing_rooms WHERE id = ?').bind(id).first();
    if (!row) fail(404, 'room_not_found', '房间不存在或已过期，请重新邀请');
    if (row.expires_at <= time) fail(410, 'room_expired', '房间已过期，请重新创建');
    const state = JSON.parse(row.state_json); state.revision = row.revision;
    return state;
  };
  const snap = (state, time) => publicSnapshot(state, trackFor(state.trackId), time);
  const write = async (state, previousRevision, time) => {
    state.revision = previousRevision + 1;
    const result = await db.prepare('UPDATE racing_rooms SET state_json = ?, revision = ?, updated_at = ? WHERE id = ? AND revision = ? AND expires_at > ?')
      .bind(JSON.stringify(state), state.revision, time, state.id, previousRevision, time).run();
    return result.meta.changes === 1;
  };
  const mutate = async (id, fn) => {
    for (let attempt = 0; attempt < 10; attempt++) {
      const state = await read(id, now()), time = now(), previousRevision = state.revision;
      const track = trackFor(state.trackId);
      advanceRoom(state, track, time);
      const extra = await fn(state, track, time);
      if (await write(state, previousRevision, time)) return { room: snap(state, now()), ...extra };
    }
    fail(409, 'room_busy', '房间正在同步，请重试');
  };
  const authenticate = async (state, token) => {
    if (typeof token !== 'string' || token.length < 32 || token.length > 128) fail(401, 'unauthorized', '请重新加入比赛');
    const authHash = await hash(token), player = state.players.find(p => !p.isBot && p.authHash === authHash);
    if (!player) fail(401, 'unauthorized', '加入凭证无效，请重新加入比赛');
    return player;
  };
  const idempotency = key => {
    if (key === undefined || key === null || key === '') return random();
    if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(key)) fail(400, 'invalid_request_key', '请求标识无效');
    return key;
  };
  return {
    async get(id) {
      const state = await read(id, now()), time = now();
      // Read-only polling projects deterministic simulation from persisted state.
      // No per-viewer write is required; mutations persist the same simulation.
      advanceRoom(state, trackFor(state.trackId), time);
      return { room: snap(state, now()) };
    },
    async create(body, requestKey) {
      const name = cleanName(body.name), track = trackFor(body.trackId), key = idempotency(requestKey);
      const createKeyHash = await hash(`create:${key}`), time = now();
      await db.prepare('DELETE FROM racing_rooms WHERE id IN (SELECT id FROM racing_rooms WHERE expires_at <= ? LIMIT 100)').bind(time).run();
      const previous = await db.prepare('SELECT id, state_json FROM racing_rooms WHERE create_key_hash = ?').bind(createKeyHash).first();
      if (previous) {
        const state = JSON.parse(previous.state_json), host = state.players.find(p => p.joinKeyHash === createKeyHash);
        if (!host) fail(409, 'request_reused', '该创建请求已经完成');
        return { ...(await this.get(previous.id)), playerId: host.id, token: await tokenFor(key, previous.id, host.id) };
      }
      const id = random(), playerId = random(), token = await tokenFor(key, id, playerId), authHash = await hash(token);
      const state = createRoomState({ id, trackId: track.id, playerId, name, authHash, createKeyHash, now: time }, track);
      try {
        await db.prepare('INSERT INTO racing_rooms (id, track_id, state_json, revision, create_key_hash, created_at, updated_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .bind(id, track.id, JSON.stringify(state), 0, createKeyHash, time, time, state.expiresAt).run();
      } catch (error) {
        const winner = await db.prepare('SELECT id FROM racing_rooms WHERE create_key_hash = ?').bind(createKeyHash).first();
        if (winner) return this.create(body, key);
        throw error;
      }
      return { room: snap(state, now()), playerId, token };
    },
    async join(id, body, requestKey, bearer) {
      const name = cleanName(body.name), key = idempotency(requestKey), joinKeyHash = await hash(`join:${key}`);
      const newPlayerId = random();
      return mutate(id, async (state, track, time) => {
        let player = bearer ? await authenticate(state, bearer) : state.players.find(p => !p.isBot && p.joinKeyHash === joinKeyHash);
        if (player) {
          player.lastSeenAt = time;
          return { playerId: player.id, token: bearer || await tokenFor(key, id, player.id) };
        }
        if (state.status === 'finished') fail(409, 'race_finished', '比赛已结束，请等待房主再开一局');
        player = state.players.find(p => p.isBot && !p.finishedAt);
        if (!player) fail(409, 'room_full', '六个车位已经满了');
        const token = await tokenFor(key, id, newPlayerId), authHash = await hash(token);
        Object.assign(player, { id: newPlayerId, name, isBot: false, authHash, joinKeyHash,
          lastSeenAt: time, lastDriveAt: time, lastSeq: -1, control: 'human', speed: 0, takeoverAt: null });
        if (!state.hostId) state.hostId = newPlayerId;
        return { playerId: newPlayerId, token };
      });
    },
    async action(id, action, body, token, requestKey) {
      if (action === 'state' || action === 'drive') validateDrive(body);
      if (action === 'control' && !['ai', 'human'].includes(body.mode)) fail(400, 'invalid_control', '驾驶控制无效');
      const receiptHash = requestKey && !['state', 'drive', 'heartbeat'].includes(action) ? await hash(`${action}:${idempotency(requestKey)}`) : null;
      return mutate(id, async (state, track, time) => {
        const player = await authenticate(state, token);
        if (action === 'control' && body.mode === 'ai') fail(409, 'human_driving_required', '请自己驾驶赛车，AI 是你的对手');
        if (receiptHash && state.receipts.some(r => r.hash === receiptHash && r.playerId === player.id)) return {};
        let result = {};
        if (['start', 'restart'].includes(action) && state.hostId !== player.id) fail(403, 'host_required', '只有房主可以开始比赛');
        switch (action) {
          case 'start':
            if (state.status === 'lobby') {
              state.status = 'countdown'; state.startAt = time + RACE.countdownMs; state.simAt = time;
              for (const entrant of state.players) entrant.lastDriveAt = state.startAt;
            }
            else if (state.status === 'finished') fail(409, 'race_finished', '请先再开一局');
            player.lastSeenAt = time;
            break;
          case 'restart':
            if (state.status !== 'lobby') {
              state.raceNumber++; state.status = 'lobby'; state.startAt = null; state.simAt = time;
              for (const entrant of state.players) {
                resetPlayer(entrant, track, time);
                entrant.control = entrant.isBot ? 'ai' : 'human';
                entrant.takeoverAt = null;
              }
            }
            player.lastSeenAt = time;
            break;
          case 'heartbeat': player.lastSeenAt = time; break;
          case 'reset': {
            if (player.finishedAt || player.dnf || state.status === 'finished') fail(409, 'race_finished', '已经冲线，请等待下一局');
            const pose = sampleTrack(track, player.distance);
            player.position = pose.position; player.quaternion = pose.quaternion; player.speed = 0;
            player.lastDriveAt = time; player.lastSeenAt = time; player.resetAt = time;
            break;
          }
          case 'control':
            player.lastSeenAt = time;
            if (player.finishedAt || player.dnf || state.status === 'finished') fail(409, 'race_finished', '已经冲线，请等待下一局');
            if (player.control !== body.mode) {
              player.control = body.mode; player.takeoverAt = body.mode === 'ai' ? time : null;
              // Frontend must first synchronize this public pose before driving.
              // Keep lastSeq monotonic through handovers, resetting only per race.
              player.lastDriveAt = time;
            }
            break;
          case 'state': case 'drive': result = reportDrive(state, player, body, track, time); break;
          case 'leave':
            if (state.status === 'lobby') {
              state.players[player.slot] = makeBot(player.slot, track, time, state.raceNumber);
              if (state.hostId === player.id) state.hostId = state.players.find(p => !p.isBot)?.id || null;
            } else { player.control = 'human'; player.lastSeenAt = time - RACE.disconnectMs; player.speed = 0; player.takeoverAt = null; }
            break;
          default: fail(404, 'action_not_found', '比赛操作不存在');
        }
        if (receiptHash) { state.receipts.push({ hash: receiptHash, playerId: player.id }); if (state.receipts.length > 96) state.receipts.shift(); }
        return result;
      });
    },
  };
}
