export const PAGEVIEW_ENDPOINT = '/api/pageviews'

export const routeForView = () => {
  if (typeof window === 'undefined') return '/'
  const hash = window.location.hash || ''
  return `${window.location.pathname}${hash}`.replace(/[\u0000-\u001f]/g, '').slice(0, 240) || '/'
}

export const eventIdForDocument = () => {
  if (typeof window === 'undefined') return `ssr-${Date.now()}`
  if (!window.__cortexPageviewEventId) {
    const random = typeof window.crypto?.randomUUID === 'function'
      ? window.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
    window.__cortexPageviewEventId = `view-${random}`
  }
  return window.__cortexPageviewEventId
}

export const postViewOnce = () => {
  if (typeof window === 'undefined') return Promise.resolve(null)
  if (window.__cortexPageviewRequest) return window.__cortexPageviewRequest
  const request = fetch(PAGEVIEW_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({ eventId: eventIdForDocument(), path: routeForView() }),
  })
    .then(async response => {
      if (!response.ok) throw new Error(`pageview request failed (${response.status})`)
      return response.json()
    })
    .catch(error => {
      window.__cortexPageviewRequest = null
      throw error
    })
  window.__cortexPageviewRequest = request
  return request
}
