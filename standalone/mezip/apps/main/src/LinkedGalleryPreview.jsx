import { useEffect, useRef, useState } from 'react'
import './LinkedGalleryPreview.css'

// Keep the recovered template on this site so it needs no second local server.
const CANVAS_URL = '/particle-canvas/index.html'
const STATUS_COPY = {
  idle: '云粒子画布',
  loading: '正在载入画布…',
  online: '预览已载入',
  offline: '暂未载入，可重试或打开独立页面',
}

export default function LinkedGalleryPreview() {
  const sectionRef = useRef(null)
  const [active, setActive] = useState(false)
  const [status, setStatus] = useState('idle')
  const [frameKey, setFrameKey] = useState(0)

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      setActive(entry.isIntersecting)
      setStatus(entry.isIntersecting ? 'loading' : 'idle')
    }, { rootMargin: '300px' })
    if (sectionRef.current) observer.observe(sectionRef.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!active) return undefined
    const timer = window.setTimeout(() => {
      setStatus(current => current === 'loading' ? 'offline' : current)
    }, 15000)
    return () => window.clearTimeout(timer)
  }, [active, frameKey])

  const retry = () => {
    setStatus('loading')
    setFrameKey(key => key + 1)
  }

  return <section ref={sectionRef} className="linked-gallery-preview section-wrap" id="linked-gallery-preview" aria-labelledby="linked-gallery-preview-title" data-linked-gallery-preview>
    <div className="linked-gallery-preview__heading">
      <div>
        <p className="eyebrow">PARTICLE CANVAS / LIVE PREVIEW</p>
        <h2 id="linked-gallery-preview-title">云粒子画布</h2>
        <p className="linked-gallery-preview__lede">在这里预览、探索粒子的流动。点击右下角，进入完整画布。</p>
      </div>
    </div>
    <div className="linked-gallery-preview__panel">
      <div className="linked-gallery-preview__topline">
        <span>PARTICLE CANVAS / LIVE VIEW</span>
        <span className={`linked-gallery-preview__status is-${status}`} role="status" aria-live="polite"><span aria-hidden="true" />{STATUS_COPY[status]}</span>
      </div>
      <div className="linked-gallery-preview__frame-wrap">
        {status === 'loading' && <p className="linked-gallery-preview__loading">正在载入云粒子画布…</p>}
        {status === 'offline' && <div className="linked-gallery-preview__offline"><strong>画布暂未载入</strong><span>可以重新连接，或在右下角打开独立页面。</span><button type="button" onClick={retry}>重新连接</button></div>}
        {active && <iframe
          key={frameKey}
          className="linked-gallery-preview__iframe"
          src={CANVAS_URL}
          title="云粒子画布实时预览"
          referrerPolicy="no-referrer"
          onLoad={() => setStatus('online')}
          onError={() => setStatus('offline')}
        />}
      </div>
      <div className="linked-gallery-preview__footer">
        <span>云粒子画布</span>
        <a className="linked-gallery-preview__enter" href={CANVAS_URL} target="_blank" rel="noreferrer">进入完整画布 <span aria-hidden="true">↗</span></a>
      </div>
    </div>
  </section>
}
