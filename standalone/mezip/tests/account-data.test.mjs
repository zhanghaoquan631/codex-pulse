import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

function findSiteRoot() {
  if (process.env.MEZIP_SITE_ROOT) return path.resolve(process.env.MEZIP_SITE_ROOT)
  let directory = path.dirname(fileURLToPath(import.meta.url))
  while (true) {
    for (const candidate of [directory, path.join(directory, 'outputs', 'mezip-public')]) {
      if (existsSync(path.join(candidate, 'server', 'account-data.mjs')) && existsSync(path.join(candidate, 'drizzle'))) return candidate
    }
    const parent = path.dirname(directory)
    if (parent === directory) throw new Error('Cannot locate mezip-public; set MEZIP_SITE_ROOT')
    directory = parent
  }
}

const siteRoot = findSiteRoot()
const { handleAccountData } = await import(pathToFileURL(path.join(siteRoot, 'server', 'account-data.mjs')))
const migrations = readdirSync(path.join(siteRoot, 'drizzle')).filter(name => name.endsWith('.sql')).sort()
assert.ok(migrations.length, 'Use the generated site migrations, not a duplicate test schema')

function d1(database) {
  const convert = value => value instanceof ArrayBuffer ? Buffer.from(value) : value
  const row = result => result ? Object.fromEntries(Object.entries(result).map(([key, value]) => [key, ArrayBuffer.isView(value) ? [...value] : value])) : null
  const prepare = (sql, values = []) => ({
    bind: (...args) => prepare(sql, args.map(convert)),
    first: async () => row(database.prepare(sql).get(...values)),
    all: async () => ({ results: database.prepare(sql).all(...values).map(row), success: true }),
    run: async () => {
      const result = database.prepare(sql).run(...values)
      return { success: true, meta: { changes: Number(result.changes) } }
    },
    execute: () => {
      const result = database.prepare(sql).run(...values)
      return { success: true, meta: { changes: Number(result.changes) } }
    },
  })
  return {
    prepare,
    batch: async statements => {
      database.exec('BEGIN')
      try {
        const results = statements.map(statement => statement.execute())
        database.exec('COMMIT')
        return results
      } catch (error) { database.exec('ROLLBACK'); throw error }
    },
  }
}

function fixture(t) {
  const directory = mkdtempSync(path.join(tmpdir(), 'mezip-account-data-'))
  const database = new DatabaseSync(path.join(directory, 'test.sqlite'))
  database.exec('PRAGMA foreign_keys=ON')
  for (const filename of migrations) database.exec(readFileSync(path.join(siteRoot, 'drizzle', filename), 'utf8'))
  t.after(() => { database.close(); rmSync(directory, { recursive: true, force: true }) })
  // Any accidental network call is an error. Tests that exercise delivery
  // replace this stub with another local callback; no real email is sent.
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('External fetch is forbidden in this test') })
  const env = { DB: d1(database) }
  return { database, env }
}

const alice = { key: 'a'.repeat(64), email: 'alice@example.test', kind: 'email' }
const bob = { key: 'b'.repeat(64), email: 'bob@example.test', kind: 'email' }
const memoryRecord = () => ({
  cards: Array.from({ length: 8 }, (_, pair) => ['a', 'b'].map(suffix => ({
    id: `${pair}-${suffix}`, pair, src: `/media/wechat-cards-20260827/card-${String(pair + 1).padStart(3, '0')}.png`,
  }))).flat(), matched: [], moves: 0, seconds: 0, won: false,
})

function request(route, body, method = body === undefined ? 'GET' : 'POST', headers = {}) {
  return new Request(`https://example.test${route}`, {
    method, headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.50', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

function saveMemory(env, user, record, revision = 0, identity = user.key) {
  return handleAccountData(request('/api/account/memory', { record, revision, identity }, 'PUT'), env, user)
}

function booking(overrides = {}) {
  const tomorrow = new Date(Date.now() + 2 * 86_400_000)
  return {
    requestId: crypto.randomUUID(), date: tomorrow.toISOString().slice(0, 10), time: '12:00',
    email: alice.email, name: 'Local test fixture', notes: 'No message is actually sent.', ...overrides,
  }
}

test('account endpoints deny anonymous reads and writes', async t => {
  const { env } = fixture(t)
  for (const route of ['/api/account/memory', '/api/account/bookings', '/api/account/saves']) {
    assert.equal((await handleAccountData(request(route), env, null)).status, 401)
  }
  assert.equal((await handleAccountData(request('/api/account/memory', { record: memoryRecord(), revision: 0, identity: alice.key }, 'PUT'), env, null)).status, 401)
})

test('memory is canonicalized, round-trips and is isolated by verified identity', async t => {
  const { env, database } = fixture(t)
  const value = memoryRecord()
  value.attackerPadding = 'x'.repeat(10_000)
  value.cards[0].untrustedField = 'drop this'
  assert.equal((await saveMemory(env, alice, value)).status, 200)
  const saved = await (await handleAccountData(request('/api/account/memory'), env, alice)).json()
  assert.equal(saved.revision, 1)
  assert.equal(saved.user.key, alice.key)
  assert.deepEqual(saved.record, memoryRecord())
  assert.ok(database.prepare('SELECT length(value) AS n FROM account_state').get().n < 8192)
  const foreignRead = await (await handleAccountData(request('/api/account/memory'), env, bob)).json()
  assert.equal(foreignRead.record, null)
  assert.equal(foreignRead.revision, 0)
  assert.equal((await saveMemory(env, bob, memoryRecord(), 1, alice.key)).status, 409)
  assert.equal(database.prepare('SELECT COUNT(*) AS n FROM account_state').get().n, 1)
})

test('memory CAS permits only one concurrent writer at the same revision', async t => {
  const { env, database } = fixture(t)
  assert.equal((await saveMemory(env, alice, memoryRecord())).status, 200)
  const outcomes = await Promise.all([
    saveMemory(env, alice, { ...memoryRecord(), moves: 1 }, 1),
    saveMemory(env, alice, { ...memoryRecord(), moves: 2 }, 1),
  ])
  assert.deepEqual(outcomes.map(result => result.status).sort(), [200, 409])
  assert.equal(database.prepare('SELECT revision FROM account_state').get().revision, 2)
  assert.equal((await saveMemory(env, alice, memoryRecord(), 0)).status, 409)
})

test('memory rejects pair corruption, duplicate IDs, half-matches and null cards', async t => {
  const { env, database } = fixture(t)
  const corruptions = [
    value => { value.cards[1].src = '/media/wechat-cards-20260827/card-075.png' },
    value => { value.cards[1].id = value.cards[0].id },
    value => { value.matched = ['0-a', '1-a'] },
    value => { value.cards[0] = null },
    value => { value.cards[0].src = value.cards[1].src = '/media/user-uploads/not-my-upload.jpg' },
    value => { value.cards[0].src = value.cards[1].src = '/media/not-in-the-public-archive.jpg' },
    value => { value.won = true },
    value => { value.seconds = -1 },
  ]
  for (const mutate of corruptions) {
    const value = memoryRecord(); mutate(value)
    assert.equal((await saveMemory(env, alice, value)).status, 400)
  }
  assert.equal(database.prepare('SELECT COUNT(*) AS n FROM account_state').get().n, 0)
})

test('all five archive-extra rewards save independently and remain account-private', async t => {
  const { env, database } = fixture(t)
  const urls = Array.from({ length: 5 }, (_, index) => `/archive-extra/${String(index + 1).padStart(3, '0')}.webp`)
  for (const url of urls) {
    assert.equal((await handleAccountData(request('/api/account/saves', { url }), env, alice)).status, 200)
  }
  assert.equal((await handleAccountData(request('/api/account/saves', { url: urls[0] }), env, alice)).status, 200)
  assert.equal(database.prepare('SELECT COUNT(*) AS n FROM account_saved').get().n, 5)
  assert.deepEqual((await (await handleAccountData(request('/api/account/saves'), env, alice)).json()).saved.sort(), urls)
  assert.deepEqual((await (await handleAccountData(request('/api/account/saves'), env, bob)).json()).saved, [])
})

test('booking is committed before notification; provider outage does not lose it', async t => {
  const { env, database } = fixture(t)
  Object.assign(env, { BREVO_API_KEY: 'test-only-key', BREVO_SENDER_EMAIL: 'sender@example.test', BOOKING_NOTIFY_EMAIL: 'owner@example.test' })
  const body = booking()
  let calls = 0
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls += 1
    assert.equal(url, 'https://api.brevo.com/v3/smtp/email')
    assert.equal(options.method, 'POST')
    assert.equal(database.prepare('SELECT notification FROM bookings WHERE id=?').get(body.requestId).notification, 'pending')
    return new Response('{}', { status: 503 })
  })
  const result = await handleAccountData(request('/api/book', body), env, alice)
  assert.equal(result.status, 200)
  assert.equal((await result.json()).ok, true)
  assert.equal(calls, 1)
  const row = database.prepare('SELECT owner_key,notification FROM bookings WHERE id=?').get(body.requestId)
  assert.equal(row.owner_key, alice.key)
  assert.equal(row.notification, 'pending')
  const repeated = await handleAccountData(request('/api/book', body), env, alice)
  assert.equal(repeated.status, 200)
  assert.equal(calls, 1, 'An idempotent retry must not send a second message')
  assert.equal(database.prepare('SELECT COUNT(*) AS n FROM bookings').get().n, 1)
})

test('booking receipt is idempotent, cross-identity reuse rejected and lists are isolated', async t => {
  const { env, database } = fixture(t)
  const body = booking()
  assert.equal((await handleAccountData(request('/api/book', body), env, alice)).status, 200)
  assert.equal((await handleAccountData(request('/api/book', body), env, alice)).status, 200)
  assert.equal((await handleAccountData(request('/api/book', body), env, bob)).status, 409)
  assert.equal(database.prepare('SELECT COUNT(*) AS n FROM bookings').get().n, 1)
  assert.equal((await (await handleAccountData(request('/api/account/bookings'), env, alice)).json()).bookings.length, 1)
  assert.equal((await (await handleAccountData(request('/api/account/bookings'), env, bob)).json()).bookings.length, 0)
})

test('concurrent identical booking requests remain idempotent', async t => {
  const { env, database } = fixture(t)
  const body = booking()
  const results = await Promise.all(Array.from({ length: 3 }, () => handleAccountData(request('/api/book', body), env, alice)))
  assert.deepEqual(results.map(result => result.status), [200, 200, 200])
  assert.equal(database.prepare('SELECT COUNT(*) AS n FROM bookings').get().n, 1)
})
