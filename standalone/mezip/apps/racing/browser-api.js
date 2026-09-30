/* Browser-only implementation of the portable APEX leaderboard protocol. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else {
    const api = factory({ storage: () => root.localStorage, origin: root.location.origin, fetch: root.fetch.bind(root), locks: root.navigator.locks });
    root.fetch = api.fetch;
  }
})(globalThis, function createBrowserApi(options) {
  'use strict';
  const KEY = 'mezip:racing:web:v1:leaderboards';
  const PREFIX = '/racing/local-api/';
  const TABLES = ['lap_times', 'lap_times_laguna_seca'];
  const COLUMNS = ['player_id', 'player_name', 'country', 'time_ms', 'sector_1_ms', 'sector_2_ms', 'sector_3_ms', 'distance_km', 'created_at', 'ghost_version', 'ghost_data'];
  const problem = (status, message, code = 'LOCAL_API_ERROR') => Object.assign(new Error(message), { status, code });
  const json = (status, value, headers = {}) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });
  const storage = () => typeof options.storage === 'function' ? options.storage() : options.storage;

  function validateLap(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw problem(400, 'A lap must be a JSON object.');
    if (typeof input.player_id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(input.player_id)) throw problem(400, 'Invalid player_id.');
    if (typeof input.player_name !== 'string' || !/^[A-Za-z0-9_-]{3,20}$/.test(input.player_name)) throw problem(400, 'Name must be 3-20 characters using letters, numbers, _ or -.');
    if (input.country != null && (typeof input.country !== 'string' || input.country.length > 64)) throw problem(400, 'Invalid country.');
    const lap = { player_id: input.player_id, player_name: input.player_name, country: input.country ?? null };
    for (const key of ['time_ms', 'sector_1_ms', 'sector_2_ms', 'sector_3_ms', 'distance_km']) {
      if (!Number.isSafeInteger(input[key]) || input[key] < (key === 'time_ms' ? 1 : 0)) throw problem(400, `Invalid ${key}.`);
      lap[key] = input[key];
    }
    lap.ghost_version = input.ghost_version ?? null;
    lap.ghost_data = input.ghost_data ?? null;
    if (lap.ghost_data !== null) {
      const ghost = lap.ghost_data;
      if (lap.ghost_version !== 1 || ghost.v !== 1 || !Number.isFinite(ghost.d) || ghost.d < 0 ||
          !Array.isArray(ghost.f) || ghost.f.length === 0 || ghost.f.length > 40000 ||
          !ghost.f.every(frame => Array.isArray(frame) && frame.length === 37 && frame.every(Number.isFinite))) {
        throw problem(400, 'Invalid ghost_data or ghost_version; expected the original version 1 replay format.');
      }
    } else if (lap.ghost_version !== null) throw problem(400, 'ghost_version requires ghost_data.');
    return lap;
  }

  function loadDatabase() {
    try {
      const raw = storage().getItem(KEY);
      if (raw === null) return { version: 1, tables: Object.fromEntries(TABLES.map(name => [name, []])) };
      const db = JSON.parse(raw);
      if (db.version !== 1 || !db.tables) throw new Error('Unsupported database format.');
      for (const table of TABLES) {
        if (!Array.isArray(db.tables[table])) throw new Error('Missing leaderboard.');
        const ids = new Set();
        for (const row of db.tables[table]) {
          validateLap(row);
          if (typeof row.created_at !== 'string' || !Number.isFinite(Date.parse(row.created_at)) || ids.has(row.player_id)) throw new Error('Invalid saved leaderboard.');
          ids.add(row.player_id);
        }
      }
      return db;
    } catch {
      throw problem(500, '无法读取此浏览器的赛车存档。已有记录未被覆盖。', 'LOCAL_STORAGE_ERROR');
    }
  }

  async function saveLap(table, input) {
    const lap = validateLap(input);
    const commit = () => {
      const db = loadDatabase();
      const previous = db.tables[table].find(row => row.player_id === lap.player_id);
      if (previous && previous.time_ms < lap.time_ms) return previous;
      lap.created_at = new Date().toISOString();
      db.tables[table] = [...db.tables[table].filter(row => row.player_id !== lap.player_id), lap];
      try { storage().setItem(KEY, JSON.stringify(db)); }
      catch { throw problem(507, '此浏览器存储已满或不可用，成绩未保存。请检查浏览器的站点存储设置。', 'LOCAL_STORAGE_ERROR'); }
      return lap;
    };
    // Secure-context browsers serialize updates from separate tabs as well.
    return options.locks ? options.locks.request(KEY, commit) : commit();
  }

  function selection(params) {
    const columns = (params.get('select') || '*').split(',').map(name => name.trim());
    if (columns.length === 1 && columns[0] === '*') return row => row;
    if (columns.some(name => !COLUMNS.includes(name))) throw problem(400, 'Unsupported leaderboard column.');
    return row => Object.fromEntries(columns.map(name => [name, row[name] ?? null]));
  }

  async function readBody(request) {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > 16 * 1024 * 1024) throw problem(413, 'Lap replay exceeds the 16 MB storage request limit.');
    try { return JSON.parse(text); } catch { throw problem(400, 'Request body is not valid JSON.'); }
  }

  async function api(request, url) {
    const endpoint = url.pathname.slice(PREFIX.length);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
    const match = /^rest\/v1\/(lap_times|lap_times_laguna_seca)$/.exec(endpoint);
    if (match) {
      const table = match[1];
      if (request.method === 'GET' || request.method === 'HEAD') {
        const project = selection(url.searchParams);
        let rows = [...loadDatabase().tables[table]];
        const player = url.searchParams.get('player_id');
        if (player !== null) {
          if (!player.startsWith('eq.')) throw problem(400, 'Only player_id equality filters are supported.');
          rows = rows.filter(row => row.player_id === player.slice(3));
        }
        const order = url.searchParams.get('order') || 'time_ms.asc';
        if (!/^time_ms\.(asc|desc)$/.test(order)) throw problem(400, 'Only time_ms ordering is supported.');
        rows.sort((a, b) => (a.time_ms - b.time_ms) * (order.endsWith('desc') ? -1 : 1) || a.created_at.localeCompare(b.created_at));
        const total = rows.length;
        const limit = Number(url.searchParams.get('limit') ?? 50), offset = Number(url.searchParams.get('offset') ?? 0);
        if (!Number.isInteger(limit) || limit < 0 || limit > 1000 || !Number.isInteger(offset) || offset < 0) throw problem(400, 'Invalid leaderboard range.');
        rows = rows.slice(offset, offset + limit).map(project);
        const headers = { 'Content-Range': rows.length ? `${offset}-${offset + rows.length - 1}/${total}` : `*/${total}` };
        const single = (request.headers.get('accept') || '').includes('application/vnd.pgrst.object+json');
        if (single && rows.length !== 1) throw problem(406, 'JSON object requested, but the result does not contain exactly one row.', 'PGRST116');
        return request.method === 'HEAD' ? new Response(null, { status: 200, headers }) : json(200, single ? rows[0] : rows, headers);
      }
      if (request.method === 'POST') {
        if (url.searchParams.get('on_conflict') && url.searchParams.get('on_conflict') !== 'player_id') throw problem(400, 'Only player_id conflict resolution is supported.');
        const input = await readBody(request);
        if (Array.isArray(input) && input.length !== 1) throw problem(400, 'Submit one lap at a time.');
        const lap = await saveLap(table, Array.isArray(input) ? input[0] : input);
        return (request.headers.get('prefer') || '').includes('return=representation') ? json(201, [selection(url.searchParams)(lap)]) : new Response(null, { status: 201 });
      }
      throw problem(405, 'Browser leaderboards support GET, HEAD and POST.');
    }
    if (endpoint === 'rest/v1/rpc/submit_lap_time_with_ghost') {
      if (request.method !== 'POST') throw problem(405, 'Lap submission requires POST.');
      const input = await readBody(request);
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw problem(400, 'RPC body must be an object.');
      await saveLap('lap_times', Object.fromEntries(COLUMNS.filter(key => key !== 'created_at').map(key => [key, input[`p_${key}`]])));
      return json(200, null);
    }
    throw problem(503, '网页版仅提供单人驾驶，成绩与回放保存在此浏览器。', 'LOCAL_ONLY');
  }

  async function fetch(input, init) {
    const url = new URL(input instanceof Request ? input.url : String(input), options.origin);
    // No records or background requests leave this origin in the single-player edition.
    if (url.origin !== options.origin && !['blob:', 'data:'].includes(url.protocol)) return json(503, { code: 'LOCAL_ONLY', message: 'External services are unavailable in the browser edition.', details: null, hint: null });
    if (url.origin !== options.origin || !url.pathname.startsWith(PREFIX)) return options.fetch(input, init);
    const request = input instanceof Request ? new Request(input, init) : new Request(url, init);
    if (request.signal.aborted) throw request.signal.reason || new DOMException('Aborted', 'AbortError');
    try { return await api(request, url); }
    catch (error) { return json(error.status || 500, { code: error.code || 'LOCAL_STORAGE_ERROR', message: error.message, details: null, hint: null }); }
  }
  return { fetch, storageKey: KEY };
});
