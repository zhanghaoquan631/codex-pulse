import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './LenticularCarousel.css'

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value))
const finite = (value, fallback) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const DEFAULT_ITEMS = Array.from({ length: 8 }, (_, index) => ({
  src: `https://picsum.photos/seed/lenticular-carousel-${index + 1}/600/800`,
  label: `Sample slide ${String(index + 1).padStart(2, '0')}`,
}))

function normalizeAspect(value) {
  const [width, height] = String(value || '3 / 4').split('/').map(Number)
  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) return `${width} / ${height}`
  return '3 / 4'
}

function normalizeItems(items) {
  const source = Array.isArray(items) && items.length ? items : DEFAULT_ITEMS
  return source.map((item, index) => {
    const src = typeof item === 'string' ? item : item?.src || item?.image || item?.url || ''
    const label = typeof item === 'object' && item
      ? item.label || item.title || item.name || `Slide ${String(index + 1).padStart(2, '0')}`
      : `Slide ${String(index + 1).padStart(2, '0')}`
    const alt = typeof item === 'object' && item ? item.alt || label : label
    const category = typeof item === 'object' && item ? item.category || item.kicker || 'CORTEX ARCHIVE' : 'CORTEX ARCHIVE'
    return { src, label: String(label), alt: String(alt), category: String(category), id: typeof item === 'object' && item ? item.id || src || index : src || index }
  }).filter(item => item.src)
}

function moduloIndex(index, length) {
  if (!length) return 0
  return ((index % length) + length) % length
}

/**
 * Clean-room lenticular carousel. It recreates the public interaction contract:
 * a strip-based optical wipe, refraction/parallax, foil reveal, focused cards,
 * segmented navigation, keyboard control, autoplay, and pointer dragging.
 */
export default function LenticularCarousel({
  items,
  initialIndex = 2,
  cardWidth = 260,
  aspectRatio = '3 / 4',
  gap = 26,
  borderRadius = 14,
  strips = 56,
  sweep = 0.6,
  refraction = 0.32,
  ridge = 0.5,
  foil = 0.5,
  foilScale = 8,
  scrim = 0.85,
  tilt = 14,
  travel = 0.64,
  lift = 40,
  perspective = 1200,
  inactiveScale = 0.9,
  inactiveDim = 0.55,
  speed = 1,
  trigger = 'hover',
  showLabels = true,
  labelColor = '#ffffff',
  showControls = true,
  showDots = true,
  loop = false,
  autoplay = false,
  autoplayDelay = 3200,
  enableDrag = true,
  enableKeyboard = true,
  dpr = 2,
  paused = false,
  className = '',
  onIndexChange,
}) {
  const normalizedItems = useMemo(() => normalizeItems(items), [items])
  const safeCardWidth = Math.max(120, finite(cardWidth, 260))
  const safeGap = Math.max(0, finite(gap, 26))
  const safeRadius = Math.max(0, finite(borderRadius, 14))
  const safeStrips = Math.max(8, Math.round(finite(strips, 56)))
  const safeSweep = clamp(finite(sweep, 0.6), 0, 1)
  const safeRefraction = clamp(finite(refraction, 0.32), 0, 1)
  const safeRidge = clamp(finite(ridge, 0.5), 0, 1)
  const safeFoil = clamp(finite(foil, 0.5), 0, 1)
  const safeFoilScale = Math.max(1, finite(foilScale, 8))
  const safeScrim = clamp(finite(scrim, 0.85), 0, 1)
  const safeTilt = clamp(finite(tilt, 14), 0, 80)
  const safeTravel = clamp(finite(travel, 0.64), 0.05, 1)
  const safeLift = Math.max(0, finite(lift, 40))
  const safePerspective = Math.max(240, finite(perspective, 1200))
  const safeInactiveScale = clamp(finite(inactiveScale, 0.9), 0.55, 1)
  const safeInactiveDim = clamp(finite(inactiveDim, 0.55), 0.1, 1)
  const safeSpeed = Math.max(0.05, finite(speed, 1))
  const safeDpr = clamp(finite(dpr, 2), 1, 3)
  const step = safeCardWidth + safeGap

  const [activeIndex, setActiveIndex] = useState(() => moduloIndex(Math.round(finite(initialIndex, 2)), normalizedItems.length))
  const [hoverIndex, setHoverIndex] = useState(null)
  const [reducedMotion, setReducedMotion] = useState(false)
  const [touchDevice, setTouchDevice] = useState(false)
  const cardsRef = useRef([])
  const trackRef = useRef(null)
  const dragRef = useRef({ active: false, startX: 0, lastX: 0, moved: false })
  const mountedIndexRef = useRef(false)

  useEffect(() => {
    setActiveIndex(current => normalizedItems.length ? Math.min(current, normalizedItems.length - 1) : 0)
    setHoverIndex(null)
  }, [normalizedItems.length])

  useEffect(() => {
    if (mountedIndexRef.current) onIndexChange?.(activeIndex)
    else mountedIndexRef.current = true
  }, [activeIndex, onIndexChange])

  useEffect(() => {
    const motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    const touchQuery = window.matchMedia?.('(hover: none), (pointer: coarse)')
    const sync = () => {
      setReducedMotion(Boolean(motionQuery?.matches))
      setTouchDevice(Boolean(touchQuery?.matches))
    }
    sync()
    motionQuery?.addEventListener?.('change', sync)
    touchQuery?.addEventListener?.('change', sync)
    return () => {
      motionQuery?.removeEventListener?.('change', sync)
      touchQuery?.removeEventListener?.('change', sync)
    }
  }, [])

  const effectiveTrigger = touchDevice ? 'focus' : trigger === 'focus' ? 'focus' : 'hover'
  const motionFactor = reducedMotion ? 0 : 1

  const goTo = useCallback((requestedIndex) => {
    const length = normalizedItems.length
    if (!length) return
    const raw = Math.round(finite(requestedIndex, activeIndex))
    const next = loop ? moduloIndex(raw, length) : clamp(raw, 0, length - 1)
    setActiveIndex(current => current === next ? current : next)
  }, [activeIndex, loop, normalizedItems.length])

  const resetCard = useCallback((index) => {
    const card = cardsRef.current[index]
    if (!card) return
    card.style.setProperty('--lenticular-turn', '0')
    card.style.setProperty('--lenticular-sweep', '0.5')
    card.style.setProperty('--lenticular-angle', '0deg')
    card.style.setProperty('--lenticular-lift', '0px')
    card.style.setProperty('--lenticular-refraction-x', '0px')
    card.style.setProperty('--lenticular-refraction-y', '0px')
    card.style.setProperty('--lenticular-glint', '0')
  }, [])

  const updateCardPointer = useCallback((index, event, forceReveal = false) => {
    const card = cardsRef.current[index]
    if (!card) return
    const rect = card.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const px = forceReveal ? 0.5 : clamp((event.clientX - rect.left) / rect.width, 0, 1)
    const py = forceReveal ? 0.5 : clamp((event.clientY - rect.top) / rect.height, 0, 1)
    // The printed lens turns continuously across the strip. With the public
    // travel value (.64), the left/right edges stay mostly on the source face
    // while the centre exposes the refracted foil and label.
    const turn = forceReveal || effectiveTrigger === 'focus'
      ? 1
      : clamp((px - (0.5 - safeTravel / 2)) / safeTravel, 0, 1)
    const centered = (turn - 0.5) * 2
    const angle = centered * safeTilt * motionFactor
    const liftAmount = Math.sin(Math.PI * turn) * safeLift * motionFactor
    const refractionX = centered * safeRefraction * 22 * motionFactor
    const refractionY = (0.5 - py) * safeRefraction * 16 * motionFactor
    const sweepPosition = clamp(turn + (px - 0.5) * safeSweep * 0.12, 0, 1)
    card.style.setProperty('--lenticular-turn', String(turn))
    card.style.setProperty('--lenticular-sweep', sweepPosition.toFixed(4))
    card.style.setProperty('--lenticular-angle', `${angle.toFixed(3)}deg`)
    card.style.setProperty('--lenticular-lift', `${liftAmount.toFixed(3)}px`)
    card.style.setProperty('--lenticular-refraction-x', `${refractionX.toFixed(3)}px`)
    card.style.setProperty('--lenticular-refraction-y', `${refractionY.toFixed(3)}px`)
    card.style.setProperty('--lenticular-glint', String(Math.max(0.08, Math.sin(Math.PI * turn))))
  }, [effectiveTrigger, motionFactor, safeLift, safeRefraction, safeSweep, safeTilt])

  const handleCardEnter = useCallback((index, event) => {
    if (effectiveTrigger === 'hover') {
      setHoverIndex(index)
      updateCardPointer(index, event)
    }
  }, [effectiveTrigger, updateCardPointer])

  const handleCardMove = useCallback((index, event) => {
    if (effectiveTrigger === 'hover' && !dragRef.current.active) updateCardPointer(index, event)
  }, [effectiveTrigger, updateCardPointer])

  const handleCardLeave = useCallback((index) => {
    if (effectiveTrigger === 'hover') {
      setHoverIndex(current => current === index ? null : current)
      resetCard(index)
    }
  }, [effectiveTrigger, resetCard])

  const handleCardFocus = useCallback((index) => {
    if (effectiveTrigger !== 'focus') return
    setHoverIndex(index)
    updateCardPointer(index, { clientX: 0, clientY: 0 }, true)
  }, [effectiveTrigger, updateCardPointer])

  const handleCardBlur = useCallback((index) => {
    if (effectiveTrigger !== 'focus') return
    setHoverIndex(current => current === index ? null : current)
    resetCard(index)
  }, [effectiveTrigger, resetCard])

  const handleCardClick = useCallback((index, event) => {
    if (dragRef.current.moved) {
      event.preventDefault()
      dragRef.current.moved = false
      return
    }
    goTo(index)
  }, [goTo])

  const handlePointerDown = useCallback((event) => {
    if (!enableDrag || normalizedItems.length < 2) return
    dragRef.current = { active: true, startX: event.clientX, lastX: event.clientX, moved: false }
    trackRef.current?.style.setProperty('--lenticular-drag', '0px')
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }, [enableDrag, normalizedItems.length])

  const handlePointerMove = useCallback((event) => {
    if (!dragRef.current.active || !enableDrag) return
    const drag = dragRef.current
    drag.lastX = event.clientX
    const delta = event.clientX - drag.startX
    if (Math.abs(delta) > 6) drag.moved = true
    trackRef.current?.style.setProperty('--lenticular-drag', `${delta}px`)
    if (drag.moved) event.preventDefault()
  }, [enableDrag])

  const finishDrag = useCallback((event) => {
    if (!dragRef.current.active) return
    const drag = dragRef.current
    const delta = drag.lastX - drag.startX
    drag.active = false
    trackRef.current?.style.setProperty('--lenticular-drag', '0px')
    try { event.currentTarget.releasePointerCapture?.(event.pointerId) } catch { /* pointer may already be released */ }
    if (Math.abs(delta) > Math.max(36, safeCardWidth * 0.16)) {
      goTo(activeIndex + (delta < 0 ? 1 : -1))
    } else if (!drag.moved) {
      dragRef.current.moved = false
    }
    window.setTimeout(() => { dragRef.current.moved = false }, 0)
  }, [activeIndex, goTo, safeCardWidth])

  useEffect(() => {
    if (!autoplay || paused || reducedMotion || normalizedItems.length < 2) return undefined
    const timer = window.setInterval(() => goTo(activeIndex + 1), Math.max(900, finite(autoplayDelay, 3200) / safeSpeed))
    return () => window.clearInterval(timer)
  }, [activeIndex, autoplay, autoplayDelay, goTo, normalizedItems.length, paused, reducedMotion, safeSpeed])

  const handleKeyDown = useCallback((event) => {
    if (!enableKeyboard) return
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      goTo(activeIndex - 1)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      goTo(activeIndex + 1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      goTo(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      goTo(normalizedItems.length - 1)
    }
  }, [activeIndex, enableKeyboard, goTo, normalizedItems.length])

  const rootStyle = {
    '--lenticular-card-width': `${safeCardWidth}px`,
    '--lenticular-card-gap': `${safeGap}px`,
    '--lenticular-aspect': normalizeAspect(aspectRatio),
    '--lenticular-radius': `${safeRadius}px`,
    '--lenticular-perspective': `${safePerspective}px`,
    '--lenticular-speed': `${safeSpeed}`,
    '--lenticular-label-color': labelColor,
    '--lenticular-strip-count': safeStrips,
    '--lenticular-ridge': safeRidge,
    '--lenticular-foil': safeFoil,
    '--lenticular-foil-scale': safeFoilScale,
    '--lenticular-scrim': safeScrim,
    '--lenticular-dpr': safeDpr,
  }

  const trackStyle = {
    paddingLeft: `calc(50% - ${safeCardWidth / 2}px)`,
    paddingRight: `calc(50% - ${safeCardWidth / 2}px)`,
    transform: `translate3d(calc(-${activeIndex * step}px + var(--lenticular-drag, 0px)), 0, 0)`,
  }

  return <section
    className={`lenticular-carousel ${className}`.trim()}
    style={rootStyle}
    role="group"
    aria-roledescription="carousel"
    aria-label="Lenticular carousel"
    tabIndex={enableKeyboard ? 0 : undefined}
    onKeyDown={handleKeyDown}
    data-lenticular-carousel
    data-lenticular-active-index={activeIndex}
    data-lenticular-count={normalizedItems.length}
    data-lenticular-sources={normalizedItems.map(item => item.src).join('|')}
    data-lenticular-trigger={effectiveTrigger}
    data-lenticular-paused={paused ? 'true' : 'false'}
  >
    <div
      className={`lenticular-carousel__viewport ${enableDrag ? 'is-draggable' : ''}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      data-lenticular-viewport
    >
      <div className="lenticular-carousel__track" ref={trackRef} style={trackStyle}>
        {normalizedItems.map((item, index) => {
          const distance = index - activeIndex
          const isActive = index === activeIndex
          const isHovered = hoverIndex === index
          const cardStyle = {
            '--lenticular-card-scale': isActive ? 1 : safeInactiveScale,
            '--lenticular-card-dim': isActive ? 1 : safeInactiveDim,
            '--lenticular-card-y': `${Math.min(28, Math.abs(distance) * 12)}px`,
            '--lenticular-card-z': `${isActive ? 12 : Math.max(0, 6 - Math.abs(distance))}px`,
            '--lenticular-card-speed': `${Math.max(0.08, 0.52 / safeSpeed)}s`,
          }
          return <button
            className={`lenticular-carousel__card ${isActive ? 'is-active' : ''} ${isHovered ? 'is-hovered' : ''}`}
            type="button"
            key={`${item.id}-${item.src}-${index}`}
            ref={element => { cardsRef.current[index] = element }}
            style={cardStyle}
            aria-label={`显示 ${item.label}`}
            aria-current={isActive ? 'true' : undefined}
            onPointerEnter={event => handleCardEnter(index, event)}
            onPointerMove={event => handleCardMove(index, event)}
            onPointerLeave={() => handleCardLeave(index)}
            onFocus={() => handleCardFocus(index)}
            onBlur={() => handleCardBlur(index)}
            onClick={event => handleCardClick(index, event)}
            data-lenticular-card
            data-lenticular-index={index}
            data-lenticular-active={isActive ? 'true' : 'false'}
            data-lenticular-turn={isHovered ? '1' : '0'}
          >
            <span className="lenticular-carousel__surface">
              <span className="lenticular-carousel__face lenticular-carousel__face--front">
                <img src={item.src} alt={item.alt} draggable="false" loading="lazy" decoding="async" />
              </span>
              <span className="lenticular-carousel__face lenticular-carousel__face--reveal" aria-hidden="true">
                <img src={item.src} alt="" draggable="false" loading="lazy" decoding="async" />
                <span className="lenticular-carousel__foil" />
                <span className="lenticular-carousel__scrim" />
                {showLabels && <span className="lenticular-carousel__label" style={{ color: labelColor }}>
                  <small>{item.category}</small>
                  <strong>{item.label}</strong>
                </span>}
              </span>
              <span className="lenticular-carousel__ribs" aria-hidden="true">
                {Array.from({ length: safeStrips }, (_, stripIndex) => <i key={stripIndex} style={{ '--lenticular-strip-index': stripIndex }} />)}
              </span>
              <span className="lenticular-carousel__glint" aria-hidden="true" />
            </span>
          </button>
        })}
      </div>
      <div className="lenticular-carousel__edge-glow" aria-hidden="true" />
    </div>
    {(showControls || showDots) && <div className="lenticular-carousel__navigation">
      {showControls && <button
        type="button"
        className="lenticular-carousel__arrow"
        aria-label="Previous slide"
        disabled={!loop && activeIndex <= 0}
        onClick={() => goTo(activeIndex - 1)}
      >‹</button>}
      {showDots && <div className="lenticular-carousel__dots" role="tablist" aria-label="选择透镜幻灯片">
        {normalizedItems.map((item, index) => <button
          type="button"
          key={`dot-${item.id}-${index}`}
          role="tab"
          aria-label={`显示 ${item.label}`}
          aria-current={index === activeIndex ? 'true' : undefined}
          className={index === activeIndex ? 'is-active' : ''}
          onClick={() => goTo(index)}
        ><span aria-hidden="true" /></button>)}
      </div>}
      {showControls && <button
        type="button"
        className="lenticular-carousel__arrow"
        aria-label="Next slide"
        disabled={!loop && activeIndex >= normalizedItems.length - 1}
        onClick={() => goTo(activeIndex + 1)}
      >›</button>}
    </div>}
  </section>
}
