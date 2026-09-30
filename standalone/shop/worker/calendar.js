const SOURCE = 'https://0xzheng.com/assets/cache/general/codex-resets.json';
let memoryCache;
export async function calendarFeed(env = {}) {
  let cached = memoryCache;
  if (env.DB) {
    const row = await env.DB.prepare('SELECT data, fetched_at FROM reset_feed_cache WHERE id = 1').first();
    if (row) cached = { data: JSON.parse(row.data), fetchedAt: row.fetched_at };
  }
  if (cached && Date.now() - cached.fetchedAt < 120000) return cached.data;
  try {
    const response = await fetch(SOURCE, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('Calendar upstream unavailable');
    const data = await response.json();
    if (!Array.isArray(data.events) || data.events.length > 2000 || !Number.isFinite(Date.parse(data.checkedAt))) throw new Error('Invalid calendar feed');
    data.events = data.events.filter((event) => typeof event.id === 'string' && event.id.length <= 200 && ['direct_reset', 'reset_credit'].includes(event.type) && ['announced', 'confirmed'].includes(event.status));
    const next = { data: { ...data, source: 'https://aihot.news/codex-reset', stale: false }, fetchedAt: Date.now() };
    if (env.DB) await env.DB.prepare('INSERT INTO reset_feed_cache (id, data, fetched_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, fetched_at = excluded.fetched_at')
      .bind(JSON.stringify(next.data), next.fetchedAt).run();
    else memoryCache = next;
    return next.data;
  } catch (error) {
    if (cached) return { ...cached.data, stale: true };
    throw error;
  }
}
