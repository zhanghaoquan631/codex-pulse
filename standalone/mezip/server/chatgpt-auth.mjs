const encoder = new TextEncoder()

/** Only the Sites dispatcher's hosted origin may supply this identity.
 * Never expose this Worker directly or derive ownership from the display email.
 */
export async function resolveChatGPTUser(request, env) {
  if (env.AUTH_PROVIDER !== 'chatgpt' || !env.PUBLIC_BASE_URL) return null
  let origin
  try {
    origin = new URL(env.PUBLIC_BASE_URL)
    if (origin.protocol !== 'https:' || new URL(request.url).origin !== origin.origin) return null
  } catch { return null }

  const subject = request.headers.get('oai-authenticated-user-id')
  const email = request.headers.get('oai-authenticated-user-email')
  if (!subject || !email || subject.length > 1024 || email.length > 1024) return null
  // The subject is opaque and case-sensitive. Changing email must not move data.
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(`chatgpt:${subject}`))
  const key = [...new Uint8Array(hash)].map(value => value.toString(16).padStart(2, '0')).join('')
  let fullName = null
  if (request.headers.get('oai-authenticated-user-full-name-encoding') === 'percent-encoded-utf-8') {
    try {
      fullName = decodeURIComponent(request.headers.get('oai-authenticated-user-full-name') || '') || null
    } catch { /* An invalid display name must not affect the authenticated identity. */ }
  }
  return { subject, email, kind: 'chatgpt', key, fullName, displayName: fullName || email }
}
