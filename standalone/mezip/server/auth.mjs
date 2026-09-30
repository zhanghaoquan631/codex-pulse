import { resolveChatGPTUser } from './chatgpt-auth.mjs'

const encoder = new TextEncoder()
const CODE_TTL = 10 * 60_000
const SESSION_TTL = 7 * 24 * 60 * 60_000
const WINDOW = 15 * 60_000
const DAY = 24 * 60 * 60_000
const COOKIE = 'mezip_session'

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase()
}

function validEmail(value) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function clean(value, maximum = 200) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, maximum)
}

function bytes(value) {
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  return new Uint8Array(value || [])
}

function token() {
  const raw = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...raw)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function code() {
  const range = 900_000
  const ceiling = Math.floor(0x100000000 / range) * range
  let sample
  do { sample = crypto.getRandomValues(new Uint32Array(1))[0] } while (sample >= ceiling)
  return String(100_000 + (sample % range))
}

async function digest(value) {
  return crypto.subtle.digest('SHA-256', encoder.encode(value))
}

export async function userKey(kind, email) {
  const hash = await digest(`${kind}:${normalizeEmail(email)}`)
  return [...new Uint8Array(hash)].map(part => part.toString(16).padStart(2, '0')).join('')
}

function getCookie(request) {
  const found = (request.headers.get('Cookie') || '').split(';').map(part => part.trim()).find(part => part.startsWith(`${COOKIE}=`))
  if (!found) return null
  try {
    const result = decodeURIComponent(found.slice(COOKIE.length + 1))
    return /^[A-Za-z0-9_-]{43}$/.test(result) ? result : null
  } catch { return null }
}

function response(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders,
    },
  })
}

export function sameOrigin(request, publicOrigin) {
  const origin = request.headers.get('Origin')
  const expected = publicOrigin || new URL(request.url).origin
  if (request.headers.get('Sec-Fetch-Site') === 'cross-site') return false
  if (!origin) return true
  try { return new URL(origin).origin === expected && origin !== 'null' } catch { return false }
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])
}

function makeEmailSender(env) {
  const provider = String(env.EMAIL_PROVIDER || (env.BREVO_API_KEY ? 'brevo' : 'resend')).toLowerCase()
  if (provider === 'brevo' && env.BREVO_API_KEY && validEmail(normalizeEmail(env.BREVO_SENDER_EMAIL))) {
    return async message => {
      const result = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          sender: { email: env.BREVO_SENDER_EMAIL, name: env.BREVO_SENDER_NAME || 'ME.zip' },
          to: [{ email: message.to }], subject: message.subject,
          textContent: message.text, htmlContent: message.html,
        }),
        signal: AbortSignal.timeout(15_000),
      })
      if (!result.ok) throw new Error('Email provider rejected delivery')
      const payload = await result.json().catch(() => ({}))
      return { messageId: clean(payload.messageId) }
    }
  }
  if (provider === 'resend' && env.RESEND_API_KEY && env.EMAIL_FROM) {
    return async message => {
      const result = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: env.EMAIL_FROM, to: [message.to], subject: message.subject, text: message.text, html: message.html }),
        signal: AbortSignal.timeout(15_000),
      })
      if (!result.ok) throw new Error('Email provider rejected delivery')
      const payload = await result.json().catch(() => ({}))
      return { messageId: clean(payload.id) }
    }
  }
  return null
}

/** Cloudflare D1 + Web APIs only. Apply schema.sql once before first use. */
export function createAuth({ db, env, sendEmail, now = Date.now }) {
  if (!db) throw new Error('Authentication requires a D1 database binding')
  const secret = String(env.AUTH_SECRET || '')
  if (secret.length < 32) throw new Error('AUTH_SECRET must contain at least 32 random characters')
  const base = String(env.PUBLIC_BASE_URL || '').trim()
  const publicOrigin = base ? new URL(base).origin : ''
  if (base && new URL(base).protocol !== 'https:') throw new Error('PUBLIC_BASE_URL must use HTTPS')
  const hmacKey = crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
  const sender = sendEmail || makeEmailSender(env)
  const allowed = new Set(String(env.ALLOWED_EMAILS || '').split(',').map(normalizeEmail).filter(validEmail))
  const dailySetting = Number(env.AUTH_DAILY_EMAIL_LIMIT || 80)
  const dailyLimit = Number.isFinite(dailySetting) ? Math.min(1000, Math.max(1, Math.floor(dailySetting))) : 80
  const query = (sql, ...values) => db.prepare(sql).bind(...values)
  // CF-Connecting-IP is supplied by Cloudflare. Ignore user-controlled XFF.
  // Local integration tests may supply it; never expose a direct origin that
  // accepts arbitrary CF-Connecting-IP headers outside Cloudflare.
  const ip = request => clean(request.headers.get('CF-Connecting-IP') || 'unknown', 120)
  const agent = request => clean(request.headers.get('User-Agent'), 500)

  async function event(request, email, type, success, detail) {
    await query(`INSERT INTO login_events
      (id,email,event_type,success,detail,ip,user_agent,created_at) VALUES (?,?,?,?,?,?,?,?)`,
    crypto.randomUUID(), email, type, success ? 1 : 0, detail, ip(request), agent(request), now()).run()
  }

  async function resolveUser(request) {
    if (env.AUTH_PROVIDER === 'chatgpt') return resolveChatGPTUser(request, env)
    const value = getCookie(request)
    if (!value) return null
    const session = await query(`SELECT s.email,s.kind FROM sessions s JOIN users u ON u.id=s.user_id
      WHERE s.token_hash=? AND s.expires_at>? AND s.kind='email'`, await digest(value), now()).first()
    if (!session) return null
    return { email: session.email, kind: session.kind, key: await userKey(session.kind, session.email) }
  }

  async function readBody(request) {
    if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) return null
    const declaredLength = Number(request.headers.get('Content-Length') || 0)
    if (declaredLength > 8192) return null
    const reader = request.body?.getReader()
    if (!reader) return {}
    const chunks = []
    let length = 0
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      length += value.length
      if (length > 8192) { await reader.cancel(); return null }
      chunks.push(value)
    }
    const joined = new Uint8Array(length)
    let offset = 0
    for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.length }
    try {
      const result = JSON.parse(new TextDecoder().decode(joined) || '{}')
      return result && !Array.isArray(result) && typeof result === 'object' ? result : null
    } catch { return null }
  }

  async function requestCode(request, body) {
    const email = normalizeEmail(body.email)
    if (!validEmail(email)) return response({ error: 'Enter a valid email address.' }, 400)
    if (allowed.size && !allowed.has(email)) return response({ error: 'This email is not authorized for this workspace.' }, 403)
    if (!sender) return response({ error: 'Email delivery is not configured yet. Please try again later.' }, 503)
    const timestamp = now()
    const reservation = await query(`INSERT INTO auth_send_reservations(id,email,ip,created_at)
      SELECT ?,?,?,? WHERE
      NOT EXISTS(SELECT 1 FROM auth_send_reservations WHERE email=? AND created_at>?)
      AND (SELECT COUNT(*) FROM auth_send_reservations WHERE email=? AND created_at>?)<5
      AND (SELECT COUNT(*) FROM auth_send_reservations WHERE ip=? AND created_at>?)<5
      AND (SELECT COUNT(*) FROM auth_send_reservations WHERE created_at>?)<?`,
    crypto.randomUUID(), email, ip(request), timestamp,
    email, timestamp - 60_000, email, timestamp - WINDOW,
    ip(request), timestamp - WINDOW, timestamp - DAY, dailyLimit).run()
    if (Number(reservation.meta?.changes || 0) !== 1) {
      return response({ error: 'Too many requests. Please wait before requesting another code.' }, 429, { 'Retry-After': '60' })
    }
    const otp = code()
    const hash = await crypto.subtle.sign('HMAC', await hmacKey, encoder.encode(`${email}:${otp}`))
    const loginUrl = `${publicOrigin || new URL(request.url).origin}/#login`
    let delivery
    try {
      delivery = await sender({
        to: email,
        subject: 'Your ME.zip sign-in code',
        text: `Your sign-in code is ${otp}. It expires in 10 minutes and can be used once.\nIf you did not request this code, ignore this email.\n${loginUrl}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:32px"><p>Your ME.zip sign-in code</p><p style="font-size:34px;letter-spacing:.2em">${otp}</p><p>This code expires in 10 minutes and can be used once.</p><p>If you did not request it, ignore this email.</p><p><a href="${escapeHtml(loginUrl)}">Open ME.zip</a></p></div>`,
      })
    } catch {
      await event(request, email, 'code_delivery_failed', false, 'Email provider did not confirm delivery')
      return response({ error: 'Email delivery is temporarily unavailable. Please try again later.' }, 502)
    }
    const sentAt = now()
    await db.batch([
      query(`UPDATE login_challenges SET consumed_at=? WHERE email=? AND consumed_at IS NULL`, sentAt, email),
      query(`INSERT INTO login_challenges
        (id,email,code_hash,created_at,sent_at,expires_at,consumed_at,attempts_remaining,request_ip,user_agent,transport_message_id)
        VALUES (?,?,?,?,?,?,NULL,5,?,?,?)`, crypto.randomUUID(), email, hash, timestamp, sentAt,
      sentAt + CODE_TTL, ip(request), agent(request), clean(delivery?.messageId || '', 200)),
    ])
    await event(request, email, 'code_sent', true, 'Email provider accepted message')
    return response({ sent: true, expiresInSeconds: CODE_TTL / 1000 })
  }

  async function verifyCode(request, body) {
    const email = normalizeEmail(body.email)
    const otp = String(body.code || '').replace(/\s/g, '')
    if (!validEmail(email) || !/^\d{6}$/.test(otp)) return response({ error: 'Enter the email address and complete 6-digit code.' }, 400)
    if (allowed.size && !allowed.has(email)) return response({ error: 'This email is not authorized for this workspace.' }, 403)
    const timestamp = now()
    const reservation = await query(`INSERT INTO auth_verify_reservations(id,email,ip,created_at)
      SELECT ?,?,?,? WHERE
      (SELECT COUNT(*) FROM auth_verify_reservations WHERE email=? AND created_at>?)<30
      AND (SELECT COUNT(*) FROM auth_verify_reservations WHERE ip=? AND created_at>?)<60`,
    crypto.randomUUID(), email, ip(request), timestamp, email, timestamp - WINDOW, ip(request), timestamp - WINDOW).run()
    if (Number(reservation.meta?.changes || 0) !== 1) return response({ error: 'Too many attempts. Please wait 15 minutes and try again.' }, 429)
    const challenge = await query(`SELECT id,code_hash,expires_at,attempts_remaining FROM login_challenges
      WHERE email=? AND consumed_at IS NULL ORDER BY sent_at DESC LIMIT 1`, email).first()
    if (!challenge || Number(challenge.expires_at) <= timestamp) return response({ error: 'That code has expired. Request a new code.' }, 400)
    if (Number(challenge.attempts_remaining) <= 0) return response({ error: 'Too many incorrect attempts. Request a new code.' }, 429)
    const matches = await crypto.subtle.verify('HMAC', await hmacKey, bytes(challenge.code_hash), encoder.encode(`${email}:${otp}`))
    if (!matches) {
      await query(`UPDATE login_challenges SET attempts_remaining=MAX(0,attempts_remaining-1)
        WHERE id=? AND consumed_at IS NULL`, challenge.id).run()
      return response({ error: 'That code is incorrect.' }, 400)
    }
    const consumed = await query(`UPDATE login_challenges SET consumed_at=?,attempts_remaining=0
      WHERE id=? AND consumed_at IS NULL AND expires_at>? AND attempts_remaining>0`, timestamp, challenge.id, timestamp).run()
    if (Number(consumed.meta?.changes || 0) !== 1) return response({ error: 'That code was already used or has expired. Request a new code.' }, 400)
    await query(`INSERT INTO users(id,email,created_at,last_login_at,login_count,last_ip,last_user_agent)
      VALUES (?,?,?,?,1,?,?) ON CONFLICT(email) DO UPDATE SET
      last_login_at=excluded.last_login_at,login_count=users.login_count+1,last_ip=excluded.last_ip,last_user_agent=excluded.last_user_agent`,
    crypto.randomUUID(), email, timestamp, timestamp, ip(request), agent(request)).run()
    const account = await query('SELECT id FROM users WHERE email=?', email).first()
    const sessionToken = token()
    await query(`INSERT INTO sessions(id,token_hash,user_id,email,kind,created_at,expires_at,last_seen_at,ip,user_agent)
      VALUES (?,?,?,?,'email',?,?,?,?,?)`, crypto.randomUUID(), await digest(sessionToken), account.id,
    email, timestamp, timestamp + SESSION_TTL, timestamp, ip(request), agent(request)).run()
    await event(request, email, 'login_verified', true, 'Email ownership verified')
    const user = { email, kind: 'email', key: await userKey('email', email) }
    return response({ authenticated: true, user }, 200, {
      'Set-Cookie': `${COOKIE}=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL / 1000}`,
    })
  }

  async function handle(request) {
    const pathname = new URL(request.url).pathname
    if (!pathname.startsWith('/api/auth/')) return null
    if (pathname === '/api/auth/session' && request.method === 'GET') {
      const user = await resolveUser(request)
      return response({ authenticated: Boolean(user), ...(user ? { user } : {}), provider: env.AUTH_PROVIDER === 'chatgpt' ? 'chatgpt' : 'email' })
    }
    if (!['/api/auth/request-code', '/api/auth/verify-code', '/api/auth/logout'].includes(pathname)) return response({ error: 'Not found' }, 404)
    if (request.method !== 'POST') return response({ error: 'Method not allowed' }, 405, { Allow: 'POST' })
    if (!sameOrigin(request, publicOrigin)) return response({ error: 'Request origin is not trusted.' }, 403)
    if (env.AUTH_PROVIDER === 'chatgpt') {
      if (pathname === '/api/auth/logout') return response({ signOutPath: '/signout-with-chatgpt?return_to=%2F%3Fauth%3Dchanged%23login' })
      return response({ error: '请使用 ChatGPT 登录。' }, 409)
    }
    const body = await readBody(request)
    if (!body) return response({ error: 'A JSON request body under 8 KB is required.' }, 400)
    if (pathname === '/api/auth/request-code') return requestCode(request, body)
    if (pathname === '/api/auth/verify-code') return verifyCode(request, body)
    const currentToken = getCookie(request)
    if (currentToken) await query('DELETE FROM sessions WHERE token_hash=?', await digest(currentToken)).run()
    return response({ authenticated: false }, 200, {
      'Set-Cookie': `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
    })
  }

  async function prune() {
    const timestamp = now()
    await db.batch([
      query('DELETE FROM auth_send_reservations WHERE created_at<?', timestamp - DAY),
      query('DELETE FROM auth_verify_reservations WHERE created_at<?', timestamp - DAY),
      query('DELETE FROM login_challenges WHERE expires_at<?', timestamp - DAY),
      query('DELETE FROM sessions WHERE expires_at<?', timestamp),
    ])
  }

  return { handle, resolveUser, prune, emailConfigured: Boolean(sender) }
}
