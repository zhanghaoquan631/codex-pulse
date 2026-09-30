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
      if (existsSync(path.join(candidate, 'server', 'index.mjs')) && existsSync(path.join(candidate, 'drizzle'))) return candidate
    }
    const parent = path.dirname(directory)
    if (parent === directory) throw new Error('Cannot locate mezip-public; set MEZIP_SITE_ROOT')
    directory = parent
  }
}

const siteRoot = findSiteRoot()
const { default: worker } = await import(pathToFileURL(path.join(siteRoot, 'server', 'index.mjs')))
const migrationFiles = readdirSync(path.join(siteRoot, 'drizzle')).filter(name => name.endsWith('.sql')).sort()
assert.ok(migrationFiles.length, 'Tests must apply the actual generated D1 migrations')
const ORIGIN = 'https://mezip.example.test'
const alice = { subject: 'Subject-A_123', email: 'shared-display@example.test' }
const bob = { subject: 'Subject-B_456', email: alice.email }
const IMAGE = '/archive-extra/001.webp'

function d1(database) {
  const bindValue = value => value instanceof ArrayBuffer ? Buffer.from(value) : value
  const row = value => value ? Object.fromEntries(Object.entries(value).map(([key, field]) => [key, ArrayBuffer.isView(field) ? [...field] : field])) : null
  const prepare = (sql, values = []) => ({
    bind: (...args) => prepare(sql, args.map(bindValue)),
    first: async () => row(database.prepare(sql).get(...values)),
    all: async () => ({ success: true, results: database.prepare(sql).all(...values).map(row) }),
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
  const directory = mkdtempSync(path.join(tmpdir(), 'mezip-worker-siwc-'))
  const filename = path.join(directory, 'state.sqlite')
  let database = new DatabaseSync(filename)
  database.exec('PRAGMA foreign_keys=ON')
  for (const migration of migrationFiles) database.exec(readFileSync(path.join(siteRoot, 'drizzle', migration), 'utf8'))
  t.after(() => { database.close(); rmSync(directory, { recursive: true, force: true }) })
  const network = t.mock.method(globalThis, 'fetch', async () => { throw new Error('External network is forbidden in worker SIWC tests') })
  const env = {
    DB: d1(database), AUTH_PROVIDER: 'chatgpt', PUBLIC_BASE_URL: ORIGIN,
    AUTH_SECRET: 'test-only-unused-email-secret-93ea26c10f7b45d8',
  }
  const context = { waitUntil: promise => { void promise } }
  return {
    env, network,
    get database() { return database },
    reopen() {
      database.close()
      database = new DatabaseSync(filename)
      database.exec('PRAGMA foreign_keys=ON')
      env.DB = d1(database)
    },
    async fetch(request) {
      const response = await worker.fetch(request, env, context)
      assert.equal(network.mock.callCount(), 0, 'The SIWC path must never send mail or call an external identity API')
      return response
    },
  }
}

// The test harness models requests AFTER authenticated Sites dispatch.
// These headers are trusted fixtures, not browser-supplied authentication.
// Passing these tests does NOT prove the live dispatcher strips forged headers.
function request(route, identity = null, body, extra = {}) {
  const headers = new Headers({ Origin: ORIGIN, 'CF-Connecting-IP': '192.0.2.70', ...extra.headers })
  if (identity) {
    headers.set('oai-authenticated-user-id', identity.subject)
    headers.set('oai-authenticated-user-email', identity.email)
  }
  if (body !== undefined) headers.set('Content-Type', 'application/json')
  return new Request(`${extra.origin || ORIGIN}${route}`, {
    method: extra.method || (body === undefined ? 'GET' : 'POST'),
    headers, body: body === undefined ? undefined : JSON.stringify(body),
  })
}

async function key(subject) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`chatgpt:${subject}`))
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

test('Worker session distinguishes anonymous and trusted dispatched identity', async t => {
  const f = fixture(t)
  const anonymous = await f.fetch(request('/api/auth/session'))
  assert.equal(anonymous.status, 200)
  assert.deepEqual(await anonymous.json(), { authenticated: false, provider: 'chatgpt' })
  const authenticated = await f.fetch(request('/api/auth/session', alice))
  assert.equal(authenticated.status, 200)
  assert.equal(authenticated.headers.get('Cache-Control'), 'no-store')
  const payload = await authenticated.json()
  assert.equal(payload.authenticated, true)
  assert.equal(payload.provider, 'chatgpt')
  assert.equal(payload.user.kind, 'chatgpt')
  assert.equal(payload.user.subject, alice.subject)
  assert.equal(payload.user.email, alice.email)
  assert.equal(payload.user.key, await key(alice.subject))
  assert.equal(authenticated.headers.get('Set-Cookie'), null, 'Dispatcher owns SIWC cookies')
  assert.equal(f.database.prepare('SELECT count(*) AS n FROM users').get().n, 0, 'No synthetic email user is needed')
})

test('private account endpoints reject anonymous requests through the full Worker', async t => {
  const f = fixture(t)
  for (const path of ['/api/account/saves', '/api/account/memory', '/api/account/bookings']) {
    assert.equal((await f.fetch(request(path))).status, 401)
  }
  assert.equal((await f.fetch(request('/api/account/saves', null, { url: IMAGE }))).status, 401)
  assert.equal(f.database.prepare('SELECT count(*) AS n FROM account_saved').get().n, 0)
})

test('saved images survive database reopen and displayed email changes for one stable subject', async t => {
  const f = fixture(t)
  const saved = await f.fetch(request('/api/account/saves', alice, { url: IMAGE }))
  assert.equal(saved.status, 200)
  assert.equal((await saved.json()).saved, true)
  f.reopen()
  const updatedAlice = { ...alice, email: 'updated-display@example.test' }
  const session = await (await f.fetch(request('/api/auth/session', updatedAlice))).json()
  assert.equal(session.user.key, await key(alice.subject))
  assert.equal(session.user.email, updatedAlice.email)
  const records = await f.fetch(request('/api/account/saves', updatedAlice))
  assert.equal(records.status, 200)
  assert.deepEqual(await records.json(), { saved: [IMAGE] })
})

test('same email on another exact subject does not gain saved data or merge identity', async t => {
  const f = fixture(t)
  await f.fetch(request('/api/account/saves', alice, { url: IMAGE }))
  const a = await (await f.fetch(request('/api/auth/session', alice))).json()
  const b = await (await f.fetch(request('/api/auth/session', bob))).json()
  assert.equal(a.user.email, b.user.email)
  assert.notEqual(a.user.key, b.user.key)
  assert.deepEqual(await (await f.fetch(request('/api/account/saves', bob))).json(), { saved: [] })
  const recased = { ...alice, subject: alice.subject.toLowerCase() }
  const recasedSession = await (await f.fetch(request('/api/auth/session', recased))).json()
  assert.notEqual(recasedSession.user.key, a.user.key)
  assert.deepEqual(await (await f.fetch(request('/api/account/saves', recased))).json(), { saved: [] })
})

test('email OTP endpoints are disabled in SIWC mode and no local owner bypass exists', async t => {
  const f = fixture(t)
  for (const identity of [null, alice]) {
    for (const route of ['/api/auth/request-code', '/api/auth/verify-code']) {
      const result = await f.fetch(request(route, identity, { email: alice.email, code: '123456' }))
      assert.equal(result.status, 409)
      assert.match((await result.json()).error, /ChatGPT/)
    }
  }
  // This removed route remains 404, never a local shortcut to either provider.
  assert.equal((await f.fetch(request('/api/auth/local-login', null, { localBypassToken: 'not-a-real-token' }))).status, 404)
  assert.equal(f.database.prepare('SELECT count(*) AS n FROM login_challenges').get().n, 0)
  assert.equal(f.database.prepare('SELECT count(*) AS n FROM sessions').get().n, 0)
})

test('legacy email cookies do not establish or override the selected ChatGPT identity', async t => {
  const f = fixture(t)
  const legacyToken = 'x'.repeat(43)
  const tokenHash = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(legacyToken)))
  const now = Date.now()
  f.database.prepare('INSERT INTO users(id,email,created_at,last_login_at,login_count) VALUES(?,?,?,?,1)').run('legacy-test-id', alice.email, now, now)
  f.database.prepare(`INSERT INTO sessions(id,token_hash,user_id,email,kind,created_at,expires_at,last_seen_at) VALUES(?,?,?,?,'email',?,?,?)`).run(
    'legacy-test-session', tokenHash, 'legacy-test-id', alice.email, now, now + 86_400_000, now,
  )
  const headers = { Cookie: `mezip_session=${legacyToken}` }
  assert.equal((await (await f.fetch(request('/api/auth/session', null, undefined, { headers }))).json()).authenticated, false)
  const current = await (await f.fetch(request('/api/auth/session', bob, undefined, { headers }))).json()
  assert.equal(current.user.subject, bob.subject)
  assert.equal(current.user.kind, 'chatgpt')
  assert.equal(current.user.key, await key(bob.subject))
})

test('logout instructs platform top-level navigation instead of claiming to clear SIWC', async t => {
  const f = fixture(t)
  const result = await f.fetch(request('/api/auth/logout', alice, {}))
  assert.equal(result.status, 200)
  const body = await result.json()
  assert.equal(Object.hasOwn(body, 'authenticated'), false, 'The app cannot claim the dispatcher session was cleared')
  const destination = new URL(body.signOutPath, ORIGIN)
  assert.equal(destination.origin, ORIGIN)
  assert.equal(destination.pathname, '/signout-with-chatgpt')
  const returnTo = destination.searchParams.get('return_to')
  assert.ok(returnTo.startsWith('/') && !returnTo.startsWith('//'))
  assert.equal(new URL(returnTo, ORIGIN).origin, ORIGIN)
  assert.equal(result.headers.get('Set-Cookie'), null)
  // Without the actual top-level dispatch sign-out, the trusted fixture remains
  // signed in. This makes the distinction between app UI and platform explicit.
  assert.equal((await (await f.fetch(request('/api/auth/session', alice))).json()).authenticated, true)
})
