import { useEffect, useMemo, useRef, useState } from 'react'

import { galleryShots } from './media'
import { SessionImageUploadButton } from './SessionImageUpload'
import MobileUploadLinks from './MobileUploadLinks'
import './InfiniteGallerySection.css'

const INDEPENDENT_WALL_URL = '/infinite-gallery/'

const INDEPENDENT_WALL_NATIVE_IMAGES = [
  { src: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=600&q=75', label: '独立影像墙 · 山谷 01' },
  { src: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=600&q=75', label: '独立影像墙 · 森林 02' },
  { src: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=600&q=75', label: '独立影像墙 · 晨雾 03' },
  { src: 'https://images.unsplash.com/photo-1447752875215-b2761acb3c5d?w=600&q=75', label: '独立影像墙 · 树影 04' },
  { src: 'https://images.unsplash.com/photo-1433086966358-54859d0ed716?w=600&q=75', label: '独立影像墙 · 溪流 05' },
  { src: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=600&q=75', label: '独立影像墙 · 山脊 06' },
  { src: 'https://images.unsplash.com/photo-1472214103451-9374bd1c798e?w=600&q=75', label: '独立影像墙 · 草地 07' },
  { src: 'https://images.unsplash.com/photo-1465056836900-8f1e4f32c1f6?w=600&q=75', label: '独立影像墙 · 山林 08' },
]

function normalizeImage(item, index) {
  const source = typeof item === 'string' ? item : item?.src
  if (!source || typeof source !== 'string') return null
  return {
    id: typeof item === 'object' && item?.id ? String(item.id) : source,
    src: source,
    label: typeof item === 'object' ? item.prompt || item.label || `影像 ${String(index + 1).padStart(2, '0')}` : `影像 ${String(index + 1).padStart(2, '0')}`,
  }
}

function uniqueImages(items) {
  const seen = new Set()
  return items.map(normalizeImage).filter(item => {
    if (!item || seen.has(item.src)) return false
    seen.add(item.src)
    return true
  })
}

function GalleryCard({ item, index, focused, onFocus }) {
  return <button
    type="button"
    className={`embedded-gallery-card${focused ? ' is-focused' : ''}`}
    style={{ '--card-index': index }}
    onClick={() => onFocus(item)}
    aria-label={`查看${item.label}`}
  >
    <span className="embedded-gallery-card-frame">
      <img src={item.src} alt={item.label} loading="lazy" decoding="async" />
      <span className="embedded-gallery-card-sheen" aria-hidden="true" />
    </span>
    <span className="embedded-gallery-card-label">{item.label}</span>
  </button>
}

export default function InfiniteGallerySection({ uploadedImages = [], preview, onPreviewChange, onPreviewClear }) {
  const stageRef = useRef(null)
  const archiveRef = useRef(null)
  const frameRef = useRef(0)
  const archiveFadeTimerRef = useRef(0)
  const wallTimeoutRef = useRef(0)
  const [focused, setFocused] = useState(null)
  const [archiveAtEnd, setArchiveAtEnd] = useState(false)
  const [wallState, setWallState] = useState('loading')
  const images = useMemo(() => {
    const previewImage = preview ? normalizeImage({ ...preview, label: preview.label || '本次预览' }, 0) : null
    return uniqueImages([...(previewImage ? [previewImage] : []), ...uploadedImages, ...galleryShots, ...INDEPENDENT_WALL_NATIVE_IMAGES])
  }, [preview, uploadedImages])

  useEffect(() => {
    if (focused && !images.some(item => item.id === focused.id)) setFocused(null)
  }, [focused, images])

  useEffect(() => {
    wallTimeoutRef.current = window.setTimeout(() => {
      setWallState(current => current === 'loading' ? 'offline' : current)
    }, 7000)
    return () => {
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current)
      if (archiveFadeTimerRef.current) window.clearTimeout(archiveFadeTimerRef.current)
      if (wallTimeoutRef.current) window.clearTimeout(wallTimeoutRef.current)
    }
  }, [])

  const setPointer = (event, reset = false) => {
    const stage = stageRef.current
    if (!stage) return
    const clientX = event?.clientX || 0
    const clientY = event?.clientY || 0
    const update = () => {
      frameRef.current = 0
      if (reset) {
        stage.style.setProperty('--gallery-pointer-x', '0')
        stage.style.setProperty('--gallery-pointer-y', '0')
        return
      }
      const bounds = stage.getBoundingClientRect()
      const x = ((clientX - bounds.left) / Math.max(1, bounds.width) - 0.5) * 2
      const y = ((clientY - bounds.top) / Math.max(1, bounds.height) - 0.5) * 2
      stage.style.setProperty('--gallery-pointer-x', String(Math.max(-1, Math.min(1, x))))
      stage.style.setProperty('--gallery-pointer-y', String(Math.max(-1, Math.min(1, y))))
    }
    if (frameRef.current) return
    frameRef.current = window.requestAnimationFrame(update)
  }

  const updateArchiveEdge = element => {
    const atEnd = element.scrollHeight > element.clientHeight && element.scrollTop + element.clientHeight >= element.scrollHeight - 2
    if (archiveFadeTimerRef.current) window.clearTimeout(archiveFadeTimerRef.current)
    archiveFadeTimerRef.current = 0
    if (atEnd) {
      archiveFadeTimerRef.current = window.setTimeout(() => setArchiveAtEnd(true), 160)
    } else {
      setArchiveAtEnd(false)
    }
  }

  const handleArchiveScroll = event => updateArchiveEdge(event.currentTarget)

  const handleArchiveKeyDown = event => {
    const element = event.currentTarget
    const atTop = element.scrollTop <= 1
    const atEnd = element.scrollHeight <= element.clientHeight || element.scrollTop + element.clientHeight >= element.scrollHeight - 2
    const movingUp = event.key === 'ArrowUp' || event.key === 'PageUp' || event.key === 'Home'
    const movingDown = event.key === 'ArrowDown' || event.key === 'PageDown' || event.key === 'End'
    if ((movingUp && atTop) || (movingDown && atEnd)) event.preventDefault()
  }

  const handleWallLoad = () => {
    if (wallTimeoutRef.current) window.clearTimeout(wallTimeoutRef.current)
    wallTimeoutRef.current = 0
    setWallState('online')
  }

  return <section id="infinite-gallery" className="infinite-gallery-section section-wrap" data-infinite-gallery>
    <div className="infinite-gallery-shell">
      <div className="infinite-gallery-heading">
        <div>
          <p className="eyebrow">INFINITE IMAGE WALL</p>
          <h2>无限影像墙</h2>
          <p className="infinite-gallery-lede">让影像沿着端到端的轨道持续流动。拖动、悬停或点击任意画面，保持一块轻量而可探索的影像空间。</p>
        </div>
        <div className="infinite-gallery-heading-meta">
          <span className="infinite-gallery-live-dot" aria-hidden="true" />
          <span>LIVE LOCAL ARCHIVE</span>
          <a href={INDEPENDENT_WALL_URL} target="_blank" rel="noreferrer">打开独立影像墙 ↗</a>
        </div>
      </div>

      <div className="embedded-gallery-upload-bar" role="group" aria-label="无限影像墙上传入口">
        <SessionImageUploadButton
          slot="infinite-gallery"
          preview={preview}
          onChange={onPreviewChange}
          onClear={onPreviewClear}
          inline
        />
        <MobileUploadLinks />
      </div>

      <div className="embedded-gallery-status" aria-live="polite">
        <span>{focused ? `当前聚焦：${focused.label}` : `${images.length} 张原始影像已加入档案`}</span>
        <span>{archiveAtEnd ? '已到末尾 · 向上滚动恢复' : preview ? '已同步当前预览' : '素材来自本地图库与现有作品'}</span>
      </div>

      <div
        ref={stageRef}
        className="embedded-gallery-stage"
        onPointerMove={event => setPointer(event)}
        onPointerLeave={event => setPointer(event, true)}
        aria-label="可交互的无限影像墙"
      >
        <section className="embedded-gallery-live-panel" aria-label="独立影像墙实时画面">
          <div className="embedded-gallery-live-topline">
            <span>INDEPENDENT WALL / LIVE VIEW</span>
            <span className={`embedded-gallery-live-state is-${wallState}`}>
              <i aria-hidden="true" />
              {wallState === 'online' ? '实时画面在线' : wallState === 'offline' ? '等待 5235 服务' : '正在连接'}
            </span>
          </div>
          <div className="embedded-gallery-live-frame">
            <iframe
              title="独立影像墙实时画面"
              src={INDEPENDENT_WALL_URL}
              loading="lazy"
              referrerPolicy="no-referrer"
              onLoad={handleWallLoad}
              onError={() => setWallState('offline')}
            />
            {wallState === 'loading' ? <div className="embedded-gallery-live-loading" aria-live="polite">正在载入独立影像墙…</div> : null}
            {wallState === 'offline' ? <div className="embedded-gallery-live-offline">
              <strong>独立影像墙暂不可用</strong>
              <span>请先启动 5235 页面服务，或在新窗口打开。</span>
              <a href={INDEPENDENT_WALL_URL} target="_blank" rel="noreferrer">打开无限影像墙 ↗</a>
            </div> : null}
          </div>
          <div className="embedded-gallery-live-footer">
            <span>无限影像墙</span>
            <a href={INDEPENDENT_WALL_URL} target="_blank" rel="noreferrer">新窗口查看 ↗</a>
          </div>
        </section>

        <section className="embedded-gallery-archive-panel" aria-label="本地影像档案">
          <div className="embedded-gallery-archive-heading">
            <div>
              <span>LOCAL ARCHIVE / ORIGINAL WORKS</span>
              <strong>原有影像</strong>
            </div>
            <span>{images.length} 张 · 可滚动浏览</span>
          </div>
          <div
            ref={archiveRef}
            className="embedded-gallery-archive-scroll"
            tabIndex={0}
            onScroll={handleArchiveScroll}
            onKeyDown={handleArchiveKeyDown}
            aria-label={`滚动浏览 ${images.length} 张影像`}
          >
            <div className={`embedded-gallery-archive-content${archiveAtEnd ? ' is-end-faded' : ''}`}>
              {images.map((item, index) => <GalleryCard key={`${item.id}-${index}`} item={item} index={index} focused={focused?.id === item.id} onFocus={setFocused} />)}
            </div>
            {archiveAtEnd ? <div className="embedded-gallery-end-cue" aria-live="polite">已到影像末尾 · 向上滚动恢复</div> : null}
          </div>
        </section>
      </div>
    </div>
  </section>
}
