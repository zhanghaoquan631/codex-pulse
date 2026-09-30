type DailyHistory = { daily: readonly unknown[] };
type UsageSnapshot = DailyHistory & { schemaVersion: 1; generatedAt: string; hourly: unknown[]; recent: unknown[] };
type DayUsage = { total: number; requests: number };
type SavedSnapshot = { payload: string; updated_at: string };
const counters = ['input', 'cached', 'output', 'reasoning', 'total', 'requests'] as const;

export class InvalidUsageSnapshot extends Error {}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const stamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10) === value;
}

function counter(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function dailyTotals(rows: readonly unknown[]) {
  const days = new Map<string, DayUsage>();
  for (const row of rows) {
    if (!record(row) || !isDay(row.day) || !counter(row.total) || !counter(row.requests)) throw new InvalidUsageSnapshot('Invalid daily usage');
    const previous = days.get(row.day) || { total: 0, requests: 0 };
    const sum = { total: previous.total + row.total, requests: previous.requests + row.requests };
    if (!counter(sum.total) || !counter(sum.requests)) throw new InvalidUsageSnapshot('Daily usage exceeds safe numeric range');
    days.set(row.day, sum);
  }
  return days;
}

/** Compare complete cumulative snapshots, never add them. Account reassignment does not change a day's totals. */
export function preservesUsageHistory(previous: DailyHistory, next: DailyHistory): boolean {
  try {
    const before = dailyTotals(previous.daily), after = dailyTotals(next.daily);
    for (const [day, usage] of before) {
      if (!usage.total && !usage.requests) continue;
      const replacement = after.get(day);
      if (!replacement || replacement.total < usage.total || replacement.requests < usage.requests) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function validUsageRow(value: unknown): value is Record<string, unknown> {
  return record(value) && typeof value.model === 'string' && value.model.length > 0
    && (value.accountId === undefined || value.accountId === null || typeof value.accountId === 'string')
    && counters.every(key => counter(value[key])) && (value.cacheWrite === undefined || counter(value.cacheWrite));
}

export function parseUsageSnapshot(payload: string): UsageSnapshot {
  let value: unknown;
  try { value = JSON.parse(payload); } catch { throw new InvalidUsageSnapshot('Invalid JSON'); }
  if (!record(value) || value.schemaVersion !== 1 || typeof value.generatedAt !== 'string' || !Number.isFinite(Date.parse(value.generatedAt))
    || !Array.isArray(value.daily) || !Array.isArray(value.hourly) || !Array.isArray(value.recent)) throw new InvalidUsageSnapshot('Invalid snapshot');
  for (const row of value.daily) if (!validUsageRow(row) || !isDay(row.day)) throw new InvalidUsageSnapshot('Invalid daily row');
  for (const row of value.hourly) if (!validUsageRow(row) || !isDay(row.day) || typeof row.hour !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3])$/.test(row.hour) || !row.hour.startsWith(row.day)) throw new InvalidUsageSnapshot('Invalid hourly row');
  for (const row of value.recent) if (!validUsageRow(row) || typeof row.time !== 'string' || !Number.isFinite(Date.parse(row.time))) throw new InvalidUsageSnapshot('Invalid recent row');
  dailyTotals(value.daily);
  return value as UsageSnapshot;
}

export type SnapshotWriteResult = 'stored' | 'stale' | 'incomplete' | 'conflict';

/** Compare-and-swap prevents another ingest from changing history between our validation and write. */
export async function storeUsageSnapshot(db: Pick<D1Database, 'prepare'>, payload: string): Promise<SnapshotWriteResult> {
  const next = parseUsageSnapshot(payload), stamp = new Date(next.generatedAt).toISOString();
  for (let attempt = 0; attempt < 5; attempt++) {
    const previous = await db.prepare('SELECT payload,updated_at FROM snapshots WHERE id=1').first<SavedSnapshot>();
    if (previous) {
      if (Date.parse(next.generatedAt) < Date.parse(previous.updated_at)) return 'stale';
      let history: UsageSnapshot;
      try { history = parseUsageSnapshot(previous.payload); } catch { throw new Error('Stored history cannot be validated'); }
      if (!preservesUsageHistory(history, next)) return 'incomplete';
      const result = await db.prepare('UPDATE snapshots SET payload=?,updated_at=? WHERE id=1 AND payload=? AND updated_at=? AND updated_at<=?')
        .bind(payload, stamp, previous.payload, previous.updated_at, stamp).run();
      if (result.meta.changes === 1) return 'stored';
    } else {
      const result = await db.prepare('INSERT OR IGNORE INTO snapshots(id,payload,updated_at) VALUES(1,?,?)').bind(payload, stamp).run();
      if (result.meta.changes === 1) return 'stored';
    }
  }
  return 'conflict';
}
