import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { InvalidUsageSnapshot, parseUsageSnapshot, preservesUsageHistory, storeUsageSnapshot } from './usage-history.ts';

const day = (date, total, requests = 1, accountId = null) => ({ day: date, model: 'test-model', accountId, total, requests, input: total, cached: 0, output: 0, reasoning: 0, cacheWrite: 0 });
const snapshot = (daily, stamp = '2026-09-20T00:00:00.000Z') => JSON.stringify({ schemaVersion: 1, generatedAt: stamp, daily, hourly: [], recent: [] });
function fixture(t) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('CREATE TABLE snapshots(id INTEGER PRIMARY KEY,payload TEXT NOT NULL,updated_at TEXT NOT NULL)');
  t.after(() => sqlite.close());
  let beforeRun;
  const db = { prepare(sql) {
    let args = [];
    return {
      bind(...values) { args = values; return this; },
      async first() { return sqlite.prepare(sql).get(...args) || null; },
      async run() { if (beforeRun) { const hook = beforeRun; beforeRun = null; hook(sqlite); } const result = sqlite.prepare(sql).run(...args); return { meta: { changes: Number(result.changes) } }; },
    };
  } };
  return { db, read: () => sqlite.prepare('SELECT payload FROM snapshots WHERE id=1').get()?.payload, onWrite: hook => { beforeRun = hook; } };
}

test('refreshing cumulative data never adds duplicate totals; attribution can change', async t => {
  const f = fixture(t), original = snapshot([day('2026-05-28', 100)]);
  assert.equal(await storeUsageSnapshot(f.db, original), 'stored');
  assert.equal(await storeUsageSnapshot(f.db, original), 'stored');
  const assigned = snapshot([day('2026-05-28', 100, 1, 'account-a'), day('2026-09-20', 50)], '2026-09-20T00:01:00Z');
  assert.equal(await storeUsageSnapshot(f.db, assigned), 'stored');
  assert.equal(JSON.parse(f.read()).daily.reduce((n, row) => n + row.total, 0), 150);
});

test('empty, missing and reduced historical days preserve the saved payload', async t => {
  const f = fixture(t), original = snapshot([day('2026-05-28', 100, 2), day('2026-09-20', 50)]);
  await storeUsageSnapshot(f.db, original);
  for (const daily of [[], [day('2026-09-20', 500)], [day('2026-05-28', 99, 2), day('2026-09-20', 500)], [day('2026-05-28', 100, 1), day('2026-09-20', 500)]]) {
    assert.equal(await storeUsageSnapshot(f.db, snapshot(daily, '2026-09-20T00:02:00Z')), 'incomplete');
    assert.equal(f.read(), original);
  }
});

test('stale and invalid incoming snapshots cannot replace history', async t => {
  const f = fixture(t), original = snapshot([day('2026-09-20', 100)]);
  await storeUsageSnapshot(f.db, original);
  assert.equal(await storeUsageSnapshot(f.db, snapshot([], '2026-09-19T23:59:00Z')), 'stale');
  for (const payload of ['{}', snapshot([day('2026-02-30', 10)]), snapshot([day('2026-09-20', -1)]), snapshot([{ ...day('2026-09-20', 10), cached: '0' }])]) {
    await assert.rejects(storeUsageSnapshot(f.db, payload), InvalidUsageSnapshot);
    assert.equal(f.read(), original);
  }
});

test('concurrent ingestion is rechecked before replacing a newly written snapshot', async t => {
  const f = fixture(t);
  await storeUsageSnapshot(f.db, snapshot([day('2026-09-20', 100)]));
  const concurrent = snapshot([day('2026-05-28', 25), day('2026-09-20', 200)], '2026-09-20T00:01:00.000Z');
  f.onWrite(sqlite => sqlite.prepare('UPDATE snapshots SET payload=?,updated_at=? WHERE id=1').run(concurrent, '2026-09-20T00:01:00.000Z'));
  assert.equal(await storeUsageSnapshot(f.db, snapshot([day('2026-09-20', 300)], '2026-09-20T00:02:00Z')), 'incomplete');
  assert.equal(f.read(), concurrent);
});

test('browser history comparison works without server metadata and does not mutate input', () => {
  const previous = { daily: [day('2026-05-28', 100, 2)] };
  assert.equal(preservesUsageHistory(previous, { daily: [day('2026-05-28', 50, 1, 'a'), day('2026-05-28', 50, 1, 'b')] }), true);
  assert.equal(preservesUsageHistory(previous, { daily: [] }), false);
  assert.equal(previous.daily[0].total, 100);
  assert.equal(parseUsageSnapshot(snapshot([])).daily.length, 0);
});
