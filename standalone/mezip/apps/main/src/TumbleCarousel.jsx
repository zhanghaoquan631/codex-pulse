import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import './TumbleCarousel.css'

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const finite = (value, fallback) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function parseAspectRatio(value) {
  const parts = String(value || '1 / 1').split('/').map(part => Number(part.trim()))
  if (parts.length === 2 && parts[0] > 0 && parts[1] > 0) return parts[0] / parts[1]
  return 1
}

function normalizeItems(items) {
  return (Array.isArray(items) ? items : []).map((item, index) => {
    const source = typeof item === 'string' ? item : item?.image || item?.src || item?.url || ''
    if (!source) return null
    const label = typeof item === 'object' && item
      ? item.title || item.label || item.alt || `Carousel image ${index + 1}`
      : `Carousel image ${index + 1}`
    return {
      id: String(typeof item === 'object' && item ? item.id || source : source || index),
      src: String(source),
      alt: String(typeof item === 'object' && item ? item.alt || label : label),
      title: String(label),
    }
  }).filter(Boolean)
}

function normaliseIndex(value, count, loop) {
  if (!count) return 0
  const parsed = Math.round(finite(value, 0))
  if (!loop) return clamp(parsed, 0, count - 1)
  let next = parsed % count
  if (next < 0) next += count
  return next
}

function wrappedDistance(index, position, count, loop) {
  let distance = index - position
  if (!loop || count < 2) return distance
  const half = count / 2
  while (distance > half) distance -= count
  while (distance < -half) distance += count
  return distance
}

/**
 * Clean-room DOM implementation of the public Tumble Carousel contract.
 * Cards are arranged along a diagonal track and move through end-over-end
 * rotateZ steps as the focused index changes. It intentionally uses only the public
 * prop contract, not protected React Bits Pro source.
 */
function TumbleCarousel({
  items = [],
  initialIndex = 3,
  cardWidth = 200,
  aspectRatio = '1 / 1',
  frameHeight,
  rotation = 30,
  verticalOffset = 50,
  inactiveScale = 0.6,
  visibleRange = 2.4,
  borderRadius = 16,
  titleBlur = 2,
  speed = 1,
  showTitles = true,
  showControls = true,
  showCounter = true,
  loop = false,
  autoplay = false,
  autoplayDelay = 3000,
  enableDrag = true,
  enableKeyboard = true,
  className = '',
  onIndexChange,
}) {
  const normalizedItems = useMemo(() => normalizeItems(items), [items])
  const count = normalizedItems.length
  const safeWidth = Math.max(120, finite(cardWidth, 200))
  const ratio = parseAspectRatio(aspectRatio)
  const safeCardHeight = Math.max(120, safeWidth / ratio)
  const safeRotation = finite(rotation, 30)
  const safeVerticalOffset = Math.max(0, finite(verticalOffset, 50))
  const safeInactiveScale = clamp(finite(inactiveScale, 0.6), 0.2, 1)
  const safeVisibleRange = Math.max(0.5, finite(visibleRange, 2.4))
  const safeRadius = Math.max(0, finite(borderRadius, 16))
  const safeTitleBlur = Math.max(0, finite(titleBlur, 2))
  const safeSpeed = Math.max(0.05, finite(speed, 1))
  const safeDelay = Math.max(300, finite(autoplayDelay, 3000))
  const offsetPx = safeCardHeight * safeVerticalOffset / 100
  const derivedFrameHeight = Math.max(
    safeCardHeight + 56,
    safeCardHeight + offsetPx * Math.min(2.2, Math.max(1, safeVisibleRange)) * 2 + 56,
  )
  const safeFrameHeight = Math.max(240, finite(frameHeight, derivedFrameHeight))
  const transitionMs = Math.round(clamp(620 / safeSpeed, 160, 1200))

  const [activeIndex, setActiveIndex] = useState(() => normaliseIndex(initialIndex, count, loop))
  const [dragOffset, setDragOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)
  const activeIndexRef = useRef(activeIndex)
  const dragOffsetRef = useRef(dragOffset)
  const pointerRef = useRef({ id: null, startX: 0, startOffset: 0, moved: false })
  const suppressClickRef = useRef(false)
  const hoveredRef = useRef(false)
  const draggingRef = useRef(false)

  useEffect(() => { activeIndexRef.current = activeIndex }, [activeIndex])
  useEffect(() => { dragOffsetRef.current = dragOffset }, [dragOffset])
  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    const sync = () => setReducedMotion(Boolean(query?.matches))
    sync()
    query?.addEventListener?.('change', sync)
    return () => query?.removeEventListener?.('change', sync)
  }, [])

  useEffect(() => {
    setActiveIndex(previous => normaliseIndex(previous, count, loop))
    setDragOffset(0)
  }, [count, loop])

  useEffect(() => {
    onIndexChange?.(activeIndex)
  }, [activeIndex, onIndexChange])

  const goTo = useCallback((value) => {
    const next = normaliseIndex(value, count, loop)
    setDragOffset(0)
    dragOffsetRef.current = 0
    setActiveIndex(next)
  }, [count, loop])

  useEffect(() => {
    if (!autoplay || count < 2) return undefined
    const timer = window.setInterval(() => {
      if (draggingRef.current || hoveredRef.current) return
      const current = activeIndexRef.current
      if (!loop && current >= count - 1) return
      goTo(current + 1)
    }, safeDelay)
    return () => window.clearInterval(timer)
  }, [autoplay, count, goTo, loop, safeDelay])

  const handlePointerDown = useCallback((event) => {
    if (!enableDrag || !count || event.button !== 0) return
    event.preventDefault()
    const viewport = event.currentTarget
    pointerRef.current = {
      id: event.pointerId,
      startX: event.clientX,
      startOffset: dragOffsetRef.current,
      moved: false,
    }
    draggingRef.current = true
    suppressClickRef.current = false
    viewport.setPointerCapture?.(event.pointerId)
    setDragging(true)
  }, [count, enableDrag])

  const handlePointerMove = useCallback((event) => {
    const pointer = pointerRef.current
    if (!enableDrag || !draggingRef.current || pointer.id !== event.pointerId) return
    const delta = event.clientX - pointer.startX
    const nextOffset = clamp(pointer.startOffset + delta, -safeWidth * 0.95, safeWidth * 0.95)
    if (Math.abs(delta) > 5) pointer.moved = true
    dragOffsetRef.current = nextOffset
    setDragOffset(nextOffset)
  }, [enableDrag, safeWidth])

  const finishPointer = useCallback((event, cancelled = false) => {
    const pointer = pointerRef.current
    if (!enableDrag || !draggingRef.current || pointer.id !== event.pointerId) return
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    const offset = dragOffsetRef.current
    const moved = pointer.moved
    draggingRef.current = false
    setDragging(false)
    suppressClickRef.current = moved
    pointerRef.current = { id: null, startX: 0, startOffset: 0, moved: false }
    dragOffsetRef.current = 0
    setDragOffset(0)
    if (!cancelled && Math.abs(offset) > safeWidth * 0.18) {
      goTo(activeIndexRef.current + (offset < 0 ? 1 : -1))
    }
  }, [enableDrag, goTo, safeWidth])

  const handleCardClick = useCallback((index, event) => {
    if (suppressClickRef.current) {
      event.preventDefault()
      suppressClickRef.current = false
      return
    }
    goTo(index)
  }, [goTo])

  const handleKeyDown = useCallback((event) => {
    if (!enableKeyboard || !count) return
    if (event.key === 'ArrowRight' || event.key === 'PageDown') {
      event.preventDefault()
      goTo(activeIndexRef.current + 1)
    } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
      event.preventDefault()
      goTo(activeIndexRef.current - 1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      goTo(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      goTo(count - 1)
    }
  }, [count, enableKeyboard, goTo])

  const effectivePosition = activeIndex - dragOffset / safeWidth
  const duration = reducedMotion || dragging ? 0 : transitionMs
  const rootStyle = {
    '--tumble-card-width': `${safeWidth}px`,
    '--tumble-card-height': `${safeCardHeight}px`,
    '--tumble-frame-height': `${safeFrameHeight}px`,
    '--tumble-radius': `${safeRadius}px`,
    '--tumble-speed': `${duration}ms`,
    '--tumble-aspect-ratio': String(ratio),
  }

  return <div
    className={`tumble-carousel${dragging ? ' is-dragging' : ''}${className ? ` ${className}` : ''}`}
    style={rootStyle}
    role="region"
    aria-roledescription="carousel"
    aria-label="Tumble image carousel"
    tabIndex={enableKeyboard ? 0 : -1}
    onKeyDown={handleKeyDown}
    data-tumble-carousel
    data-tumble-index={activeIndex}
    data-tumble-card-count={count}
    data-tumble-dragging={dragging ? 'true' : 'false'}
    data-tumble-autoplay={autoplay ? 'true' : 'false'}
  >
    <div
      className="tumble-carousel__viewport"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={event => finishPointer(event)}
      onPointerCancel={event => finishPointer(event, true)}
      onPointerEnter={() => { hoveredRef.current = true }}
      onPointerLeave={() => { hoveredRef.current = false }}
      data-tumble-viewport
    >
      <div className="tumble-carousel__halo" aria-hidden="true" />
      <div className="tumble-carousel__stack">
        {normalizedItems.map((item, index) => {
          const distance = wrappedDistance(index, effectivePosition, count, loop)
          const absoluteDistance = Math.abs(distance)
          const visibility = clamp(1 - absoluteDistance / safeVisibleRange, 0, 1)
          const scale = 1 - (1 - safeInactiveScale) * clamp(absoluteDistance, 0, 1)
          const rotate = distance * safeRotation
          const translateX = distance * safeWidth
          const translateY = distance * offsetPx
          const titleOpacity = clamp(1 - absoluteDistance * 0.8, 0, 1)
          const isActive = index === activeIndex && absoluteDistance < 0.5
          const style = {
            opacity: visibility,
            zIndex: Math.round((safeVisibleRange + 1 - absoluteDistance) * 100),
            pointerEvents: absoluteDistance <= safeVisibleRange + 0.35 ? 'auto' : 'none',
            transform: `translate3d(calc(-50% + ${translateX.toFixed(2)}px), calc(-50% + ${translateY.toFixed(2)}px), 0) rotate(${rotate.toFixed(2)}deg) scale(${scale.toFixed(4)})`,
            transformOrigin: '50% 50%',
            transitionDuration: `${duration}ms`,
          }
          return <button
            key={`${item.id}-${index}`}
            className={`tumble-carousel__card${isActive ? ' is-active' : ''}`}
            type="button"
            style={style}
            aria-label={`聚焦 ${item.title}`}
            aria-current={isActive ? 'true' : undefined}
            aria-hidden={absoluteDistance > safeVisibleRange + 0.35 ? 'true' : undefined}
            tabIndex={isActive ? 0 : -1}
            onClick={event => handleCardClick(index, event)}
            data-tumble-card={index}
            data-tumble-card-id={item.id}
            data-tumble-distance={distance.toFixed(3)}
          >
            <img src={item.src} alt={item.alt} draggable="false" loading={index < 3 ? 'eager' : 'lazy'} />
            <span className="tumble-carousel__shade" aria-hidden="true" />
            {showTitles && <span className="tumble-carousel__title" style={{ opacity: titleOpacity, filter: `blur(${(absoluteDistance * safeTitleBlur).toFixed(2)}px)` }}>{item.title}</span>}
            <span className="tumble-carousel__index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
          </button>
        })}
        {!count && <div className="tumble-carousel__empty">暂无可用图片</div>}
      </div>
    </div>
    {showControls && <div className="tumble-carousel__controls" aria-label="Tumble carousel controls">
      <button
        className="tumble-carousel__control"
        type="button"
        aria-label="上一张"
        onClick={() => goTo(activeIndex - 1)}
        disabled={!loop && (activeIndex <= 0 || !count)}
        data-tumble-previous
      >
        <span aria-hidden="true">←</span>
      </button>
      {showCounter && <span className="tumble-carousel__counter" aria-live="polite" data-tumble-counter>{count ? `${String(activeIndex + 1).padStart(2, '0')} / ${String(count).padStart(2, '0')}` : '00 / 00'}</span>}
      <button
        className="tumble-carousel__control"
        type="button"
        aria-label="下一张"
        onClick={() => goTo(activeIndex + 1)}
        disabled={!loop && (activeIndex >= count - 1 || !count)}
        data-tumble-next
      >
        <span aria-hidden="true">→</span>
      </button>
    </div>}
  </div>
}

export default TumbleCarousel
