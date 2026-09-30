import assert from 'node:assert/strict'
import { test } from 'node:test'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

function findAdapter() {
  if (process.env.CHATGPT_AUTH_MODULE) return path.resolve(process.env.CHATGPT_AUTH_MODULE)
  let directory = path.dirname(fileURLToPath(import.meta.url))
  while (true) {
    for (const root of [directory, path.join(directory, 'outputs', 'mezip-public')]) {
      const filename = path.join(root, 'server', 'chatgpt-auth.mjs')
      if (existsSync(filename)) return filename
    }
    const parent = path.dirname(directory)
    if (parent === directory) throw new Error('Cannot find server/chatgpt-auth.mjs; set CHATGPT_AUTH_MODULE to the adapter path')
    directory = parent
  }
}

const { resolveChatGPTUser } = await import(pathToFileURL(findAdapter()))
assert.equal(typeof resolveChatGPTUser, 'function')
const ORIGIN = 'https://mezip.example.test'
const env = { AUTH_PROVIDER: 'chatgpt', PUBLIC_BASE_URL: ORIGIN }
const ID_HEADER = 'oai-authenticated-user-id'
const EMAIL_HEADER = 'oai-authenticated-user-email'
const NAME_HEADER = 'oai-authenticated-user-full-name'
const NAME_ENCODING = 'oai-authenticated-user-full-name-encoding'
const subject = 'User-AbC_123'
const email = 'display@example.test'

function request({ url = `${ORIGIN}/api/auth/session`, id = subject, displayEmail = email, headers = {} } = {}) {
  const values = new Headers(headers)
  if (id !== null) values.set(ID_HEADER, id)
  if (displayEmail !== null) values.set(EMAIL_HEADER, displayEmail)
  return new Request(url, { headers: values })
}

async function expectedKey(value) {
  const result = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`chatgpt:${value}`))
  return [...new Uint8Array(result)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

// These are adapter contract tests, not proof of hosted header authenticity.
// Sites dispatch must independently strip/replace caller-supplied identity
// headers before forwarding a request. No network requests are made here.

test('selected hosted provider resolves the exact platform subject and display metadata', async () => {
  const user = await resolveChatGPTUser(request(), env)
  assert.ok(user)
  assert.equal(user.subject, subject)
  assert.equal(user.kind, 'chatgpt')
  assert.equal(user.email, email)
  assert.equal(user.key, await expectedKey(subject))
  assert.match(user.key, /^[a-f0-9]{64}$/)
})

test('opaque subjects are case-sensitive; email changes do not move ownership', async () => {
  const original = await resolveChatGPTUser(request(), env)
  const recased = await resolveChatGPTUser(request({ id: subject.toLowerCase() }), env)
  const updatedEmail = await resolveChatGPTUser(request({ displayEmail: 'new-display@example.test' }), env)
  assert.notEqual(recased.key, original.key)
  assert.equal(recased.key, await expectedKey(subject.toLowerCase()))
  assert.equal(updatedEmail.key, original.key)
  assert.equal(updatedEmail.subject, original.subject)
  assert.equal(updatedEmail.email, 'new-display@example.test')
})

test('two authenticated subjects never auto-link solely because displayed emails match', async () => {
  const first = await resolveChatGPTUser(request(), env)
  const second = await resolveChatGPTUser(request({ id: 'Different-Subject-456' }), env)
  assert.equal(first.email, second.email)
  assert.notEqual(first.key, second.key)
})

test('both nonempty platform identity headers are required', async () => {
  for (const values of [
    { id: null }, { displayEmail: null }, { id: null, displayEmail: null },
    { id: '' }, { displayEmail: '' },
  ]) assert.equal(await resolveChatGPTUser(request(values), env), null)
})

test('provider selection must be explicit and cannot be enabled by request headers', async () => {
  for (const AUTH_PROVIDER of [undefined, '', 'email', 'brevo', 'CHATGPT']) {
    assert.equal(await resolveChatGPTUser(request({ headers: { 'x-auth-provider': 'chatgpt' } }), { ...env, AUTH_PROVIDER }), null)
  }
})

test('missing, malformed, HTTP, or mismatched configured origins fail closed', async () => {
  for (const PUBLIC_BASE_URL of [undefined, '', 'not-a-url', 'http://mezip.example.test']) {
    assert.equal(await resolveChatGPTUser(request(), { ...env, PUBLIC_BASE_URL }), null)
  }
  for (const url of [
    'http://127.0.0.1:5224/api/auth/session',
    'http://localhost:5224/api/auth/session',
    'http://mezip.example.test/api/auth/session',
    'https://different.example.test/api/auth/session',
    'https://mezip.example.test.attacker.test/api/auth/session',
  ]) assert.equal(await resolveChatGPTUser(request({ url }), env), null)
  for (const PUBLIC_BASE_URL of ['http://127.0.0.1:5224', 'http://localhost:5224']) {
    assert.equal(await resolveChatGPTUser(request({ url: `${PUBLIC_BASE_URL}/api/auth/session` }), { ...env, PUBLIC_BASE_URL }), null)
  }
})

test('forwarded host or Origin headers cannot repair an actual URL origin mismatch', async () => {
  const user = await resolveChatGPTUser(request({
    url: 'https://attacker.example.test/api/auth/session',
    headers: { Origin: ORIGIN, 'X-Forwarded-Host': new URL(ORIGIN).host, 'X-Forwarded-Proto': 'https' },
  }), env)
  assert.equal(user, null)
})

test('optional full name is decoded only with the exact encoding marker', async () => {
  const fullName = '小明 Test'
  const encoded = encodeURIComponent(fullName)
  const valid = await resolveChatGPTUser(request({ headers: { [NAME_HEADER]: encoded, [NAME_ENCODING]: 'percent-encoded-utf-8' } }), env)
  assert.equal(valid.fullName, fullName)
  assert.equal(valid.displayName, fullName)
  for (const headers of [
    {},
    { [NAME_HEADER]: encoded },
    { [NAME_HEADER]: encoded, [NAME_ENCODING]: 'utf-8' },
    { [NAME_HEADER]: '%not-valid', [NAME_ENCODING]: 'percent-encoded-utf-8' },
  ]) {
    const user = await resolveChatGPTUser(request({ headers }), env)
    assert.equal(user.fullName, null)
    assert.equal(user.displayName, email)
    assert.equal(user.key, await expectedKey(subject))
  }
})
