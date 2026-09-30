import { useEffect, useMemo, useRef } from 'react'

import './RotatingCards.css'

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

const normaliseAngle = value => ((value % 360) + 360) % 360

/**
 * Local clean-room version of a draggable circular card ring. Cards sit around
 * a rotating plane while a requestAnimationFrame loop drives auto-play, drag
 * and wheel rotation without depending on the protected Pro source.
 */
function RotatingCards({
  cards = [],
  radius = 360,
  duration = 20,
  cardWidth = 160,
  cardHeight = 190,
  pauseOnHover = true,
  reverse = false,
  draggable = false,
  autoPlay = true,
  onCardClick,
  mouseWheel = false,
  className = '',
  cardClassName = '',
  initialRotation = 0,
}) {
  const rootRef = useRef(null)
  const ringRef = useRef(null)
  const rotationRef = useRef(initialRotation)
  const pausedRef = useRef(false)
  const draggingRef = useRef(false)
  const pointerRef = useRef({ id: null, startX: 0, startRotation: 0, moved: false, captured: false })
  const wheelPauseRef = useRef(0)
  const ignoreClickRef = useRef(false)

  const numericRadius = Math.max(40, Number(radius) || 360)
  const numericDuration = Math.max(1, Number(duration) || 20)
  const numericCardWidth = Math.max(72, Number(cardWidth) || 160)
  const numericCardHeight = Math.max(88, Number(cardHeight) || 190)
  const rotationSign = reverse ? -1 : 1
  const cardAngles = useMemo(() => cards.map((_, index) => (360 / Math.max(cards.length, 1)) * index), [cards])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return undefined

    // Every outer card corner follows this circle, at every rotation angle.
    const diameter = 2 * Math.hypot(numericRadius + numericCardHeight / 2, numericCardWidth / 2)
    const fitRing = () => {
      const available = Math.max(0, Math.min(root.clientWidth, root.clientHeight) - 48)
      root.style.setProperty('--rotating-fit-scale', String(Math.min(1, available / diameter)))
    }
    fitRing()
    const observer = new ResizeObserver(fitRing)
    observer.observe(root)
    return () => observer.disconnect()
  }, [numericRadius, numericCardWidth, numericCardHeight])

  useEffect(() => {
    const root = rootRef.current
    const ring = ringRef.current
    if (!root || !ring) return undefined

    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    let frameId = 0
    let lastFrame = performance.now()
    rotationRef.current = initialRotation

    const applyRotation = rotation => {
      const value = normaliseAngle(rotation)
      rotationRef.current = value
      ring.style.transform = `rotate(${value.toFixed(3)}deg)`
      root.dataset.rotatingRotation = value.toFixed(2)
    }

    const frame = now => {
      const elapsed = Math.min(64, Math.max(0, now - lastFrame))
      lastFrame = now
      const shouldRotate = autoPlay && !reducedMotion && !pausedRef.current && !draggingRef.current && now >= wheelPauseRef.current
      if (shouldRotate) applyRotation(rotationRef.current + rotationSign * (elapsed / (numericDuration * 1000)) * 360)
      frameId = window.requestAnimationFrame(frame)
    }

    applyRotation(initialRotation)
    frameId = window.requestAnimationFrame(frame)

    return () => window.cancelAnimationFrame(frameId)
  }, [autoPlay, initialRotation, numericDuration, rotationSign])

  const setPaused = value => {
    pausedRef.current = value
    if (rootRef.current) rootRef.current.dataset.rotatingPaused = value ? 'true' : 'false'
  }

  const handlePointerEnter = () => {
    if (pauseOnHover) setPaused(true)
  }

  const handlePointerLeave = () => {
    if (!draggingRef.current && pauseOnHover) setPaused(false)
  }

  const handlePointerDown = event => {
    if (!draggable || event.button !== 0) return
    const root = rootRef.current
    if (!root) return
    draggingRef.current = true
    pointerRef.current = {
      id: event.pointerId,
      startX: event.clientX,
      startRotation: rotationRef.current,
      moved: false,
      captured: false,
    }
    const startedOnCard = event.target.closest?.('.rotating-cards__card')
    if (!startedOnCard) {
      root.setPointerCapture?.(event.pointerId)
      pointerRef.current.captured = true
    }
    root.dataset.rotatingDragging = 'true'
  }

  const handlePointerMove = event => {
    const root = rootRef.current
    const ring = ringRef.current
    const pointer = pointerRef.current
    if (!draggable || !draggingRef.current || pointer.id !== event.pointerId || !root || !ring) return
    const delta = event.clientX - pointer.startX
    if (Math.abs(delta) > 4) pointer.moved = true
    const next = pointer.startRotation + delta * 0.35
    const value = normaliseAngle(next)
    rotationRef.current = value
    ring.style.transform = `rotate(${value.toFixed(3)}deg)`
    root.dataset.rotatingRotation = value.toFixed(2)
  }

  const finishDrag = event => {
    const root = rootRef.current
    const pointer = pointerRef.current
    if (!draggable || !draggingRef.current || pointer.id !== event.pointerId) return
    draggingRef.current = false
    ignoreClickRef.current = pointer.moved
    if (pointer.captured) root?.releasePointerCapture?.(event.pointerId)
    root?.removeAttribute('data-rotating-dragging')
    pointerRef.current = { id: null, startX: 0, startRotation: rotationRef.current, moved: false, captured: false }
    if (pauseOnHover && root?.matches(':hover')) setPaused(true)
    else setPaused(false)
  }

  const handleWheel = event => {
    if (!mouseWheel || !ringRef.current || !rootRef.current) return
    event.preventDefault()
    const next = normaliseAngle(rotationRef.current + clamp(event.deltaY, -120, 120) * 0.16)
    rotationRef.current = next
    ringRef.current.style.transform = `rotate(${next.toFixed(3)}deg)`
    rootRef.current.dataset.rotatingRotation = next.toFixed(2)
    wheelPauseRef.current = performance.now() + 850
  }

  const handleCardClick = (card, index) => {
    if (ignoreClickRef.current) {
      ignoreClickRef.current = false
      return
    }
    const angle = cardAngles[index] || 0
    const next = normaliseAngle(-angle)
    rotationRef.current = next
    if (ringRef.current) ringRef.current.style.transform = `rotate(${next.toFixed(3)}deg)`
    if (rootRef.current) {
      rootRef.current.dataset.rotatingRotation = next.toFixed(2)
      rootRef.current.dataset.rotatingActiveIndex = String(index)
    }
    onCardClick?.(card, index)
  }

  const rootStyle = {
    '--rotating-card-width': `${numericCardWidth}px`,
    '--rotating-card-height': `${numericCardHeight}px`,
    '--rotating-radius': `${numericRadius}px`,
  }

  return <div
    ref={rootRef}
    className={`rotating-cards${className ? ` ${className}` : ''}`}
    style={rootStyle}
    data-rotating-cards
    data-rotating-card-count={cards.length}
    data-rotating-paused="false"
    data-rotating-dragging="false"
    onPointerEnter={handlePointerEnter}
    onPointerLeave={handlePointerLeave}
    onPointerDown={handlePointerDown}
    onPointerMove={handlePointerMove}
    onPointerUp={finishDrag}
    onPointerCancel={finishDrag}
    onWheel={handleWheel}
  >
    <div className="rotating-cards__scene" role="region" aria-label="Rotating cards carousel">
      <div ref={ringRef} className="rotating-cards__ring">
        {cards.map((card, index) => {
          const angle = cardAngles[index] || 0
          const radians = ((angle - 90) * Math.PI) / 180
          const x = Math.cos(radians) * numericRadius
          const y = Math.sin(radians) * numericRadius
          const label = card?.label || card?.content || `Card ${index + 1}`
          return <button
            className={`rotating-cards__card${cardClassName ? ` ${cardClassName}` : ''}`}
            key={card?.id || `${index}-${card?.image || ''}`}
            type="button"
            style={{ transform: `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) rotate(${angle.toFixed(2)}deg)` }}
            aria-label={`聚焦 ${label}`}
            data-rotating-card-index={index}
            data-rotating-card-id={card?.id || index}
            onClick={() => handleCardClick(card, index)}
          >
            {card?.image ? <img src={card.image} alt="" draggable="false" loading="lazy" decoding="async" /> : null}
            <span className="rotating-cards__shade" aria-hidden="true" />
            <span className="rotating-cards__meta"><b>{String(index + 1).padStart(2, '0')}</b><small>{label}</small></span>
          </button>
        })}
      </div>
    </div>
  </div>
}

export default RotatingCards
