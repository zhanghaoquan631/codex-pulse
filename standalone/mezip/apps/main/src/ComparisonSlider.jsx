import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import './ComparisonSlider.css'

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

const finite = (value, fallback) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const LABEL_POSITIONS = new Set(['top-left', 'top-right', 'bottom-left', 'bottom-right'])

function normaliseLabelText(labelText) {
  if (!labelText || typeof labelText !== 'object') return { before: 'Before', after: 'After' }
  return {
    before: String(labelText.before || 'Before'),
    after: String(labelText.after || 'After'),
  }
}

/**
 * Local clean-room implementation of the public Comparison Slider contract.
 * Two image layers are clipped at a shared percentage divider; pointer release
 * carries a small damped velocity so the split keeps moving with inertia.
 */
export default function ComparisonSlider({
  beforeImage = '',
  afterImage = '',
  beforeAlt = 'Before',
  afterAlt = 'After',
  initialPosition = 50,
  orientation = 'horizontal',
  enableInertia = true,
  dragOnHover = false,
  autoAnimate = false,
  dividerWidth = 3,
  showHandle = true,
  handleSize = 48,
  handleIcon,
  dividerColor = 'white',
  handleColor = 'white',
  onPositionChange,
  className = '',
  imageClassName = '',
  showLabels = false,
  labelText,
  labelPosition = 'top-left',
  labelClassName = '',
  beforeLabelClassName = '',
  afterLabelClassName = '',
  showPercentage = false,
  percentagePosition = 'top',
  onDragStart,
  onDragEnd,
  ariaLabel = 'Image comparison slider',
  reducedMotion = false,
  style,
}) {
  const safeOrientation = orientation === 'vertical' ? 'vertical' : 'horizontal'
  const safeInitialPosition = clamp(finite(initialPosition, 50), 0, 100)
  const safeDividerWidth = Math.max(1, finite(dividerWidth, 3))
  const safeHandleSize = Math.max(24, finite(handleSize, 48))
  const safeLabelPosition = LABEL_POSITIONS.has(labelPosition) ? labelPosition : 'top-left'
  const safePercentagePosition = percentagePosition === 'bottom' ? 'bottom' : 'top'
  const labels = useMemo(() => normaliseLabelText(labelText), [labelText])
  const [position, setPosition] = useState(safeInitialPosition)
  const [dragging, setDragging] = useState(false)
  const [moved, setMoved] = useState(false)
  const [systemReducedMotion, setSystemReducedMotion] = useState(false)
  const rootRef = useRef(null)
  const viewportRef = useRef(null)
  const positionRef = useRef(safeInitialPosition)
  const velocityRef = useRef(0)
  const dragRef = useRef({
    active: false,
    pointerId: null,
    startAxis: 0,
    lastAxis: 0,
    lastTime: 0,
    moved: false,
    captured: false,
  })
  const hoverRef = useRef(false)
  const autoClockRef = useRef(0)

  const motionReduced = Boolean(reducedMotion || systemReducedMotion)

  const updatePosition = useCallback((value, notify = true) => {
    const next = clamp(finite(value, positionRef.current), 0, 100)
    positionRef.current = next
    setPosition(current => Math.abs(current - next) < 0.001 ? current : next)
    if (notify) onPositionChange?.(next)
  }, [onPositionChange])

  const readPointerPosition = useCallback((event) => {
    const viewport = viewportRef.current
    if (!viewport) return positionRef.current
    const rect = viewport.getBoundingClientRect()
    const span = safeOrientation === 'vertical' ? rect.height : rect.width
    const offset = safeOrientation === 'vertical' ? event.clientY - rect.top : event.clientX - rect.left
    return clamp((offset / Math.max(1, span)) * 100, 0, 100)
  }, [safeOrientation])

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    const sync = () => setSystemReducedMotion(Boolean(query?.matches))
    sync()
    query?.addEventListener?.('change', sync)
    return () => query?.removeEventListener?.('change', sync)
  }, [])

  useEffect(() => {
    positionRef.current = safeInitialPosition
    velocityRef.current = 0
    setPosition(safeInitialPosition)
  }, [safeInitialPosition])

  useEffect(() => {
    let frameId = 0
    let previousTime = performance.now()

    const frame = now => {
      const elapsed = Math.min(64, Math.max(0, now - previousTime))
      previousTime = now
      if (!dragRef.current.active && !motionReduced) {
        if (enableInertia && Math.abs(velocityRef.current) > 0.0005) {
          const next = positionRef.current + velocityRef.current * elapsed
          if (next <= 0 || next >= 100) {
            positionRef.current = clamp(next, 0, 100)
            velocityRef.current *= -0.22
            updatePosition(positionRef.current)
          } else {
            updatePosition(next)
          }
          velocityRef.current *= Math.pow(0.9, elapsed / 16.67)
        } else if (autoAnimate && !hoverRef.current) {
          autoClockRef.current += elapsed
          const next = 50 + Math.sin(autoClockRef.current * 0.00075) * 34
          updatePosition(next)
        } else if (Math.abs(velocityRef.current) <= 0.0005) {
          velocityRef.current = 0
        }
      }
      frameId = window.requestAnimationFrame(frame)
    }

    frameId = window.requestAnimationFrame(frame)
    return () => window.cancelAnimationFrame(frameId)
  }, [autoAnimate, enableInertia, motionReduced, updatePosition])

  const handlePointerDown = useCallback((event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    const viewport = viewportRef.current
    if (!viewport) return
    const axis = safeOrientation === 'vertical' ? event.clientY : event.clientX
    velocityRef.current = 0
    dragRef.current = {
      active: true,
      pointerId: event.pointerId,
      startAxis: axis,
      lastAxis: axis,
      lastTime: performance.now(),
      moved: false,
      captured: false,
    }
    viewport.setPointerCapture?.(event.pointerId)
    dragRef.current.captured = true
    setDragging(true)
    setMoved(false)
    if (rootRef.current) rootRef.current.dataset.comparisonDragging = 'true'
    onDragStart?.()
    updatePosition(readPointerPosition(event))
    event.preventDefault()
  }, [onDragStart, readPointerPosition, safeOrientation, updatePosition])

  const handlePointerMove = useCallback((event) => {
    const drag = dragRef.current
    if (drag.active && drag.pointerId === event.pointerId) {
      const axis = safeOrientation === 'vertical' ? event.clientY : event.clientX
      const distance = axis - drag.startAxis
      if (Math.abs(distance) > 4) drag.moved = true
      const now = performance.now()
      const dt = Math.max(8, now - drag.lastTime)
      const viewport = viewportRef.current
      const rect = viewport?.getBoundingClientRect()
      const span = rect ? (safeOrientation === 'vertical' ? rect.height : rect.width) : 1
      drag.velocity = ((axis - drag.lastAxis) / Math.max(1, span)) * 100 / dt
      drag.lastAxis = axis
      drag.lastTime = now
      velocityRef.current = drag.velocity
      updatePosition(readPointerPosition(event))
      event.preventDefault()
      return
    }
    if (dragOnHover && !motionReduced) updatePosition(readPointerPosition(event))
  }, [dragOnHover, motionReduced, readPointerPosition, safeOrientation, updatePosition])

  const finishPointer = useCallback((event, cancelled = false) => {
    const drag = dragRef.current
    if (!drag.active || drag.pointerId !== event.pointerId) return
    const viewport = viewportRef.current
    if (drag.captured) viewport?.releasePointerCapture?.(event.pointerId)
    dragRef.current = { ...drag, active: false, captured: false }
    setDragging(false)
    if (rootRef.current) {
      rootRef.current.dataset.comparisonDragging = 'false'
      rootRef.current.dataset.comparisonMoved = drag.moved ? 'true' : 'false'
    }
    setMoved(drag.moved)
    if (cancelled || !enableInertia || motionReduced || !drag.moved) velocityRef.current = 0
    onDragEnd?.()
  }, [enableInertia, motionReduced, onDragEnd])

  const handleKeyDown = useCallback((event) => {
    const step = event.shiftKey ? 10 : 5
    let next = null
    if (safeOrientation === 'horizontal' && event.key === 'ArrowLeft') next = positionRef.current - step
    if (safeOrientation === 'horizontal' && event.key === 'ArrowRight') next = positionRef.current + step
    if (safeOrientation === 'vertical' && event.key === 'ArrowUp') next = positionRef.current - step
    if (safeOrientation === 'vertical' && event.key === 'ArrowDown') next = positionRef.current + step
    if (event.key === 'Home') next = 0
    if (event.key === 'End') next = 100
    if (next == null) return
    event.preventDefault()
    velocityRef.current = 0
    updatePosition(next)
  }, [safeOrientation, updatePosition])

  const rootStyle = {
    '--comparison-position': `${position}%`,
    '--comparison-divider-width': `${safeDividerWidth}px`,
    '--comparison-divider-color': dividerColor,
    '--comparison-handle-size': `${safeHandleSize}px`,
    '--comparison-handle-color': handleColor,
    ...style,
  }

  const afterClip = safeOrientation === 'horizontal'
    ? { clipPath: `inset(0 0 0 ${position}%)` }
    : { clipPath: `inset(${position}% 0 0 0)` }

  return <div
    ref={rootRef}
    className={`comparison-slider comparison-slider--${safeOrientation} ${dragging ? 'is-dragging' : ''} ${className}`.trim()}
    style={rootStyle}
    role="region"
    aria-roledescription="comparison slider"
    aria-label={ariaLabel}
    aria-orientation={safeOrientation}
    aria-valuemin="0"
    aria-valuemax="100"
    aria-valuenow={Math.round(position)}
    tabIndex={0}
    data-comparison-slider
    data-comparison-position={position.toFixed(2)}
    data-comparison-dragging={dragging ? 'true' : 'false'}
    data-comparison-moved={moved ? 'true' : 'false'}
    onKeyDown={handleKeyDown}
  >
    <div
      ref={viewportRef}
      className="comparison-slider__viewport"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={event => finishPointer(event)}
      onPointerCancel={event => finishPointer(event, true)}
      onPointerEnter={() => { hoverRef.current = true }}
      onPointerLeave={() => { hoverRef.current = false }}
    >
      <img className={`comparison-slider__image comparison-slider__image--before ${imageClassName}`.trim()} src={beforeImage} alt={beforeAlt} draggable="false" loading="lazy" decoding="async" />
      <div className="comparison-slider__after" style={afterClip} aria-hidden="true">
      <img className={`comparison-slider__image comparison-slider__image--after ${imageClassName}`.trim()} src={afterImage} alt={afterAlt} draggable="false" loading="lazy" decoding="async" />
      </div>
      {showLabels && <>
        <span className={`comparison-slider__label comparison-slider__label--before comparison-slider__label--${safeLabelPosition} ${labelClassName} ${beforeLabelClassName}`.trim()}>{labels.before}</span>
        <span className={`comparison-slider__label comparison-slider__label--after comparison-slider__label--${safeLabelPosition} ${labelClassName} ${afterLabelClassName}`.trim()}>{labels.after}</span>
      </>}
      {showPercentage && <span className={`comparison-slider__percentage comparison-slider__percentage--${safePercentagePosition}`}>{Math.round(position)}%</span>}
      <div className="comparison-slider__divider" aria-hidden="true">
        {showHandle && <button
          type="button"
          className="comparison-slider__handle"
          aria-label="Drag comparison slider"
          tabIndex={-1}
          onClick={event => event.preventDefault()}
        >
          {handleIcon || <span className="comparison-slider__grip" aria-hidden="true"><i /><i /><i /><i /><i /><i /></span>}
        </button>}
      </div>
    </div>
  </div>
}
