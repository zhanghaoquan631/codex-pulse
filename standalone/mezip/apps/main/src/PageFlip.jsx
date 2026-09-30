import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './PageFlip.css'

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value))
const finite = (value, fallback) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const DEFAULT_PAGES = Array.from({ length: 5 }, (_, index) => ({
  id: `page-flip-sample-${index + 1}`,
  front: `https://picsum.photos/seed/page-flip-front-${index + 1}/600/900`,
  back: `https://picsum.photos/seed/page-flip-back-${index + 1}/600/900`,
  frontAlt: `Sample page ${index + 1} front`,
  backAlt: `Sample page ${index + 1} back`,
}))

function normalizePages(pages) {
  const source = Array.isArray(pages) && pages.length ? pages : DEFAULT_PAGES
  return source.map((page, index) => {
    const item = typeof page === 'object' && page ? page : { front: page, back: page }
    const front = item.front || item.frontImage || item.image || item.src || ''
    const back = item.back || item.backImage || item.image || item.src || front
    const frontAlt = item.frontAlt || item.frontAltText || item.alt || item.label || `Page ${index + 1} front`
    const backAlt = item.backAlt || item.backAltText || item.alt || item.label || `Page ${index + 1} back`
    return {
      id: item.id || `${front}-${index}`,
      front: String(front),
      back: String(back),
      frontAlt: String(frontAlt),
      backAlt: String(backAlt),
    }
  }).filter(page => page.front || page.back)
}

const easingMap = {
  easeInOut: 'cubic-bezier(.42, 0, .58, 1)',
  easeOut: 'cubic-bezier(.16, 1, .3, 1)',
  circOut: 'cubic-bezier(.075, .82, .165, 1)',
  backOut: 'cubic-bezier(.34, 1.56, .64, 1)',
}

/**
 * Clean-room Page Flip implementation based on the public interaction
 * contract: stacked leaves rotate around a left spine, expose front/back
 * images, support click/hover turns, drag gestures, and keyboard navigation.
 */
export default function PageFlip({
  pages,
  pageWidth = 220,
  pageHeight = 320,
  pageRadius = 4,
  pageColor = '#f4f4f4',
  perspective = 1200,
  spineShift = 110,
  turnAngle = 180,
  peekAngle = 10,
  duration = 0.55,
  stagger = 0.08,
  ease = 'easeInOut',
  shadow = 0.3,
  trigger = 'click',
  closeOnLeave = true,
  interactive = true,
  initialIndex = 0,
  className = '',
  style,
  onPageChange,
}) {
  const normalizedPages = useMemo(() => normalizePages(pages), [pages])
  const safeWidth = Math.max(120, finite(pageWidth, 220))
  const safeHeight = Math.max(160, finite(pageHeight, 320))
  const safeRadius = Math.max(0, finite(pageRadius, 4))
  const safePerspective = Math.max(240, finite(perspective, 1200))
  const safeSpineShift = Math.max(0, finite(spineShift, 110))
  const safeTurnAngle = clamp(finite(turnAngle, 180), 90, 360)
  const safePeekAngle = clamp(finite(peekAngle, 10), 0, 45)
  const safeDuration = Math.max(0, finite(duration, 0.55))
  const safeStagger = Math.max(0, finite(stagger, 0.08))
  const safeShadow = clamp(finite(shadow, 0.3), 0, 1)
  const safeInitialIndex = normalizedPages.length
    ? clamp(Math.round(finite(initialIndex, 0)), 0, normalizedPages.length)
    : 0

  const [pageIndex, setPageIndex] = useState(safeInitialIndex)
  const [dragState, setDragState] = useState(null)
  const [hoverIndex, setHoverIndex] = useState(null)
  const [reducedMotion, setReducedMotion] = useState(false)
  const rootRef = useRef(null)
  const sceneRef = useRef(null)
  const dragRef = useRef(null)
  const captureRef = useRef(null)
  const clickSuppressRef = useRef(false)
  const mountedRef = useRef(false)

  useEffect(() => {
    setPageIndex(current => normalizedPages.length ? Math.min(current, normalizedPages.length) : 0)
    setHoverIndex(null)
    dragRef.current = null
    setDragState(null)
  }, [normalizedPages.length])

  useEffect(() => {
    if (mountedRef.current) onPageChange?.(pageIndex)
    else mountedRef.current = true
  }, [onPageChange, pageIndex])

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    const sync = () => setReducedMotion(Boolean(query?.matches))
    sync()
    query?.addEventListener?.('change', sync)
    return () => query?.removeEventListener?.('change', sync)
  }, [])

  const effectiveDuration = reducedMotion ? 0 : safeDuration
  const effectiveStagger = reducedMotion ? 0 : safeStagger
  const effectiveTrigger = trigger === 'hover' ? 'hover' : 'click'

  const moveTo = useCallback((requestedIndex) => {
    const length = normalizedPages.length
    const next = length ? clamp(Math.round(finite(requestedIndex, pageIndex)), 0, length) : 0
    setPageIndex(current => current === next ? current : next)
  }, [normalizedPages.length, pageIndex])

  const step = useCallback((delta) => {
    moveTo(pageIndex + delta)
  }, [moveTo, pageIndex])

  const closeBook = useCallback(() => {
    dragRef.current = null
    setDragState(null)
    setHoverIndex(null)
    moveTo(0)
  }, [moveTo])

  const handleKeyDown = useCallback((event) => {
    if (!interactive) return
    if (event.key === 'ArrowRight' || event.key === 'PageDown') {
      event.preventDefault()
      step(1)
    } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
      event.preventDefault()
      step(-1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      closeBook()
    } else if (event.key === 'End') {
      event.preventDefault()
      moveTo(normalizedPages.length)
    }
  }, [closeBook, interactive, moveTo, normalizedPages.length, step])

  const handlePointerDown = useCallback((event) => {
    if (!interactive || !normalizedPages.length) return
    const startX = event.clientX
    const sceneRect = event.currentTarget.getBoundingClientRect()
    const side = startX - sceneRect.left < sceneRect.width / 2 ? 'previous' : 'next'
    const index = side === 'next' ? pageIndex : pageIndex - 1
    if (index < 0 || index >= normalizedPages.length) return
    clickSuppressRef.current = false
    const nextDrag = { active: true, startX, lastX: startX, index, direction: side, progress: 0, moved: false }
    dragRef.current = nextDrag
    setDragState(nextDrag)
    const captureTarget = event.target && typeof event.target.setPointerCapture === 'function' ? event.target : event.currentTarget
    captureTarget.setPointerCapture?.(event.pointerId)
    captureRef.current = captureTarget
  }, [interactive, normalizedPages.length, pageIndex])

  const handlePointerMove = useCallback((event) => {
    if (!interactive) return
    const drag = dragRef.current
    if (drag?.active) {
      const delta = event.clientX - drag.startX
      const direction = delta >= 0 ? 'previous' : 'next'
      const index = direction === 'next' ? pageIndex : pageIndex - 1
      if (index < 0 || index >= normalizedPages.length) return
      const progress = clamp(Math.abs(delta) / (safeWidth * 0.92), 0, 1)
      const nextDrag = { ...drag, lastX: event.clientX, index, direction, progress, moved: Math.abs(delta) > 5 }
      dragRef.current = nextDrag
      setDragState(nextDrag)
      return
    }
    if (effectiveTrigger !== 'hover' || !normalizedPages.length) return
    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1)
    const target = Math.round(ratio * normalizedPages.length)
    moveTo(target)
  }, [effectiveTrigger, interactive, moveTo, normalizedPages.length, pageIndex, safeWidth])

  const finishPointer = useCallback((event, cancelled = false) => {
    const drag = dragRef.current
    if (!drag?.active) return
    captureRef.current?.releasePointerCapture?.(event.pointerId)
    captureRef.current = null
    const shouldTurn = !cancelled && drag.progress >= 0.34
    const target = drag.direction === 'next' ? pageIndex + (shouldTurn ? 1 : 0) : pageIndex - (shouldTurn ? 1 : 0)
    clickSuppressRef.current = Boolean(drag.moved)
    dragRef.current = null
    setDragState(null)
    moveTo(target)
  }, [moveTo, pageIndex])

  const handleSceneLeave = useCallback(() => {
    if (dragRef.current?.active) return
    if (closeOnLeave) closeBook()
  }, [closeBook, closeOnLeave])

  const handleLeafClick = useCallback((index, event) => {
    if (clickSuppressRef.current || dragRef.current?.moved) {
      event.preventDefault()
      clickSuppressRef.current = false
      if (dragRef.current) dragRef.current.moved = false
      return
    }
    if (!interactive) return
    event.stopPropagation()
    if (index < pageIndex) moveTo(index)
    else moveTo(index + 1)
  }, [interactive, moveTo, pageIndex])

  const spreadProgress = pageIndex > 0
    ? dragState?.direction === 'previous' ? 1 - dragState.progress : 1
    : dragState?.direction === 'next' ? dragState.progress : 0
  const bookShift = (-safeWidth * 0.5 * spreadProgress) + (pageIndex > 0 ? safeSpineShift * 0.08 : 0)
  const rootStyle = {
    ...style,
    '--page-width': `${safeWidth}px`,
    '--page-height': `${safeHeight}px`,
    '--page-radius': `${safeRadius}px`,
    '--page-color': pageColor,
    '--page-perspective': `${safePerspective}px`,
    '--page-spine-shift': `${safeSpineShift}px`,
    '--page-turn-angle': `${safeTurnAngle}deg`,
    '--page-peek-angle': `${safePeekAngle}deg`,
    '--page-duration': `${effectiveDuration}s`,
    '--page-stagger': `${effectiveStagger}s`,
    '--page-ease': easingMap[ease] || easingMap.easeInOut,
    '--page-shadow-strength': String(safeShadow),
    '--page-book-shift': `${bookShift.toFixed(2)}px`,
    '--page-spread-progress': String(spreadProgress),
    '--page-count': String(normalizedPages.length),
  }

  return <div
    ref={rootRef}
    className={`page-flip ${interactive ? 'is-interactive' : 'is-static'} ${dragState ? 'is-dragging' : ''} ${className}`.trim()}
    style={rootStyle}
    role="group"
    aria-roledescription="book"
    aria-label="Page flip book"
    tabIndex={interactive ? 0 : -1}
    onKeyDown={handleKeyDown}
  >
    <div
      ref={sceneRef}
      className="page-flip__scene"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={event => finishPointer(event)}
      onPointerCancel={event => finishPointer(event, true)}
      onPointerLeave={handleSceneLeave}
      data-page-flip-scene
    >
      <div className="page-flip__book" style={{ '--page-book-shift': `${bookShift.toFixed(2)}px` }}>
        <span className="page-flip__spine" aria-hidden="true" />
        {normalizedPages.map((page, index) => {
          const isDraggingLeaf = dragState?.index === index
          const turned = index < pageIndex
          const progress = isDraggingLeaf
            ? dragState.direction === 'next' ? dragState.progress : 1 - dragState.progress
            : turned ? 1 : 0
          const rotation = -safeTurnAngle * progress
          const peek = effectiveTrigger === 'hover' && hoverIndex === index && !turned ? (index % 2 ? -safePeekAngle : safePeekAngle) : 0
          const zIndex = isDraggingLeaf ? normalizedPages.length + 20 : turned ? index + 1 : normalizedPages.length - index + 10
          const shadowAlpha = Math.min(0.7, safeShadow * (0.26 + progress * 0.74))
          return <button
            key={page.id || `${page.front}-${index}`}
            className={`page-flip__leaf ${turned ? 'is-turned' : ''} ${hoverIndex === index ? 'is-hovered' : ''}`}
            type="button"
            aria-label={`${page.frontAlt} ${page.backAlt}`}
            style={{
              zIndex,
              '--page-progress': String(progress),
              '--page-rotation': `${rotation.toFixed(3)}deg`,
              '--page-peek-rotation': `${peek.toFixed(3)}deg`,
              '--page-leaf-offset': `${(safeWidth * spreadProgress).toFixed(3)}px`,
              '--page-stack-offset': `${(normalizedPages.length - index - 1) * 0.42}px`,
              '--page-shadow-alpha': String(shadowAlpha),
              '--page-delay': `${(index * effectiveStagger).toFixed(3)}s`,
              '--page-index': String(index),
            }}
            onClick={event => handleLeafClick(index, event)}
            onPointerEnter={() => setHoverIndex(index)}
            onPointerLeave={() => setHoverIndex(current => current === index ? null : current)}
            data-page-flip-leaf={index}
          >
            <span className="page-flip__face page-flip__face--front">
              <img src={page.front} alt={page.frontAlt} draggable="false" loading={index === 0 ? 'eager' : 'lazy'} />
            </span>
            <span className="page-flip__face page-flip__face--back">
              <img src={page.back} alt={page.backAlt} draggable="false" loading="lazy" />
            </span>
            <span className="page-flip__paper-edge" aria-hidden="true" />
          </button>
        })}
      </div>
    </div>
    <span className="page-flip__status" aria-live="polite">Page {Math.min(pageIndex + 1, normalizedPages.length + 1)} / {normalizedPages.length + 1}</span>
  </div>
}
