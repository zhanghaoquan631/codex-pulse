import { useEffect, useState } from 'react'

import './BookingStudio.css'

const LOAD_TIMEOUT_MS = 9000

const STATUS_COPY = {
  loading: '正在连接预约系统…',
  ready: '预约系统已连接，可以选择时间。',
  unavailable: '预约系统暂时不可用；你仍可以在新标签页中打开预约。',
}

/**
 * Host shell for the standalone booking service.
 *
 * The booking flow keeps its own API and state in the backend app. Keeping it
 * in an iframe means the calendar can call relative `/api/*` endpoints without
 * changing the existing mail/persistence contract.
 */
export default function BookingStudio() {
  const [status, setStatus] = useState('loading')
  const [frameKey, setFrameKey] = useState(0)
  const bookingOrigin = '/booking/'
  const bookingEmbedUrl = `${bookingOrigin}?embed=1`

  useEffect(() => {
    if (status !== 'loading') return undefined

    let cancelled = false
    const timeout = window.setTimeout(() => {
      if (!cancelled) setStatus('unavailable')
    }, LOAD_TIMEOUT_MS)
    const controller = new AbortController()

    // iframe onLoad only proves that the browser rendered a document. A
    // refused connection can also trigger it, so probe the backend itself.
    // `no-cors` is intentional here: the opaque response is enough to tell us
    // whether the booking service is reachable without changing its
    // CORS policy (the iframe continues to use its own same-origin API calls).
    fetch(`/api/booking/health?probe=${Date.now()}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(response => {
        if (!response.ok) throw new Error("预约系统暂时不可用");
        if (!cancelled) setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('unavailable')
      })

    return () => {
      cancelled = true
      controller.abort()
      window.clearTimeout(timeout)
    }
  }, [bookingOrigin, frameKey, status])

  const retry = () => {
    setStatus('loading')
    setFrameKey(key => key + 1)
  }

  return <section
    id="booking"
    className="booking-studio section-wrap"
    aria-labelledby="booking-studio-title"
    data-booking-studio
    data-booking-endpoint={bookingOrigin}
  >
    <div className="booking-studio-copy">
      <p className="eyebrow">BOOK A CALL</p>
      <h2 id="booking-studio-title">留出 15 分钟，把想法说清楚。</h2>
      <p className="booking-studio-lead">
        选择一个你方便的时间，留下联系邮箱。预约会先写入服务端，再尝试发送通知；即使邮件延迟，预约记录也会保留。
      </p>
      <div className={`booking-status booking-status-${status}`} role="status" aria-live="polite">
        <span className="booking-status-dot" aria-hidden="true" />
        <span>{STATUS_COPY[status]}</span>
      </div>
      <div className="booking-actions">
        {status === 'unavailable' && <button className="booking-retry" type="button" onClick={retry}>重新连接</button>}
        <a className="booking-open-link" href={bookingOrigin} target="_blank" rel="noreferrer">
          在新标签页打开预约 <span aria-hidden="true">↗</span>
        </a>
      </div>
      <p className="booking-studio-note">中国标准时间（UTC+8） · 15 分钟 · Cal Video</p>
    </div>

    <div className={`booking-studio-frame-wrap booking-frame-${status}`}>
      {status === 'loading' && <p className="booking-frame-note" aria-hidden="true">正在加载日历…</p>}
      <iframe
        key={frameKey}
        className="booking-iframe"
        src={bookingEmbedUrl}
        title="Alex Discovery Call 预约"
        loading="eager"
        onError={() => setStatus('unavailable')}
        referrerPolicy="no-referrer"
        allow="clipboard-write"
      />
      <noscript>请启用 JavaScript，或<a href={bookingOrigin}>在新标签页打开预约</a>。</noscript>
    </div>
  </section>
}
